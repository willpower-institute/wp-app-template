// ระบบกลางจำลอง (โหมดตัวอย่าง + เทสต์) ตาม contract `campaign.v1` v0.3 (ดู campaign.v1.md)
//
// campaign.v1.md เป็นฉบับหลัก เนื้อหาเป็นของระบบกลาง — ไฟล์นี้ต้องตามให้ตรง
// เครื่องนับจริงของระบบกลาง: pstack-vidhisa addon `minute_campaign`
//
// ไฟล์นี้เล่นบทระบบกลาง จึงเป็นที่เดียวในแอปที่คิดนาที ยอด และกติกาได้
// ฝั่งแอปของสาขา (public/ และ server/) ห้ามคิดเอง — ส่งแค่ evidence ดิบ แล้วแสดงผลที่ระบบกลางตอบมา
// ข้อมูลอยู่ในหน่วยความจำ หายเมื่อรีสตาร์ต และไม่นับเข้ายอดจริง

export const CONTRACT_VERSION = 'campaign.v1';

// กติกาจำลอง — ของจริงอยู่ที่ addon ของระบบกลาง และมี version ตามวันมีผล
const RULES = Object.freeze({
  slots: ['morning', 'midday', 'evening'],
  minutesPerSession: 5,
  dailyCapMinutes: 15,
  groupMinutesPerParticipant: 15,
  targetMinutes: 76_000_000,
  maxEnvelopesPerBatch: 10,
  maxExternalRefLength: 200,
  defaultPageLimit: 100,
  maxPageLimit: 500,
});

// หน่วยงานตั้งต้นของระบบกลางจำลอง (สาขา -> org_ref) · ของจริงลงทะเบียนที่ระบบกลาง
const DEFAULT_ORGS = Object.freeze({ '000': ['org-school-0001', 'org-temple-0002'] });

export const CSV_BOM = '\uFEFF';
export const CSV_COLUMNS = Object.freeze(['date', 'member_code', 'slot', 'minutes', 'source']);

export class ContractError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** วันที่ (YYYY-MM-DD) ตามเขตเวลาของสาขา คิดจากเวลาฝั่งระบบกลาง ไม่ใช่นาฬิกาเครื่องผู้ใช้ */
export function localDate(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
// ช่องว่างหน้า/หลังต้องปฏิเสธ ไม่ตัดให้ — "000-0001 " กับ "000-0001" จะกลายเป็นคนละคนแล้วได้เพดานซ้อน
const exactText = (v) => nonEmpty(v) && v === v.trim();
const validPersonRef = (ref) =>
  Boolean(ref) && typeof ref === 'object' && exactText(ref.source) && exactText(ref.value);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function campaignDate(value, name) {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === 'string' && DATE_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${name} must be a YYYY-MM-DD date`);
  }
  return value;
}
const isPositiveInt = (v) => Number.isInteger(v) && v >= 1;

// cursor ทึบ: เก็บ key ของแถวสุดท้ายที่ส่งไปแล้ว (keyset) — แถวใหม่ระหว่างไล่หน้าไม่ทำให้ซ้ำหรือตก
// ใช้ btoa/atob แทน Buffer เพื่อให้รันบน Cloudflare Workers ได้ด้วย
function encodeCursor(key) {
  const bytes = new TextEncoder().encode(JSON.stringify(key));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  try {
    const binary = atob(String(cursor).replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const key = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (Array.isArray(key) && key.every((part) => typeof part === 'string')) return key;
  } catch {
    // ตกไปปฏิเสธด้านล่าง
  }
  throw new ContractError(400, 'INVALID_CURSOR');
}

function pageLimit(limit) {
  if (limit === undefined || limit === null || limit === '') return RULES.defaultPageLimit;
  const n = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : limit;
  if (!Number.isInteger(n) || n < 1 || n > RULES.maxPageLimit) {
    throw new ContractError(400, 'INVALID_LIMIT');
  }
  return n;
}

const compareKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

function paginate(items, keyOf, { cursor, limit }) {
  const n = pageLimit(limit);
  const after = decodeCursor(cursor);
  const sorted = [...items].sort((x, y) => compareKeys(keyOf(x), keyOf(y)));
  const rest = after ? sorted.filter((item) => compareKeys(keyOf(item), after) > 0) : sorted;
  const page = rest.slice(0, n);
  const next = rest.length > n ? encodeCursor(keyOf(page[page.length - 1])) : null;
  return { page, next_cursor: next };
}

// กันสูตรใน Sheets/Excel (CSV injection) และ escape ตาม RFC 4180
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// mock ใช้เขตเวลาเดียว (`timezone`) · ระบบกลางจริงใช้เขตเวลาต่อสาขาสำหรับวันที่ของแถว ช่วงแคมเปญ
// และ branch.today_minutes ส่วน today_minutes ระดับแคมเปญใช้เขตเวลาของแคมเปญ (contract ข้อ 3.3)
export function createMockCentral({
  timezone = 'Asia/Bangkok',
  now = () => new Date(),
  orgs = DEFAULT_ORGS,
  campaignStart, // 'YYYY-MM-DD' ไม่บังคับ · ไม่ใส่ = ไม่จำกัดช่วง (โหมดตัวอย่างของแอป)
  campaignEnd,
} = {}) {
  const start = campaignDate(campaignStart, 'campaignStart');
  const end = campaignDate(campaignEnd, 'campaignEnd');
  if (start && end && start > end) throw new TypeError('campaignStart must not be after campaignEnd');
  const batches = new Map(); // `${branch}|${batch_ref}` -> { fingerprint, receipt } (จำต่อสาขา)
  const sessions = new Map(); // `${person}|${date}|${slot}` -> evidence_id
  const people = new Set();
  const rows = []; // แถวรายวันรายคนที่ commit แล้ว (สำหรับ API อ่าน)
  const externalRefs = new Map(); // `${branch}|${external_ref}` -> evidence_id เดิม
  const registeredOrgs = new Map(
    Object.entries(orgs).map(([branch, refs]) => [branch, new Set(refs)]),
  );
  const groupReports = new Map(); // `${branch}|${org_ref}|${date}` -> evidence_id
  let totalMinutes = 0;

  const personKey = (ref) => `${ref.source}:${ref.value}`;
  const asOf = () => now().toISOString();

  function minutesOn(person, date) {
    let m = 0;
    for (const key of sessions.keys()) {
      const [p, d] = key.split('|');
      if (p === person && d === date) m += RULES.minutesPerSession;
    }
    return m;
  }

  /** ลงทะเบียนหน่วยงานกับสาขา (ระบบกลางจำลอง · ใช้ในเทสต์) */
  function registerOrg(branch, orgRef) {
    if (!nonEmpty(branch) || !nonEmpty(orgRef)) throw new ContractError(400, 'INVALID_ORG_REF');
    if (!registeredOrgs.has(branch)) registeredOrgs.set(branch, new Set());
    registeredOrgs.get(branch).add(orgRef);
  }

  // ยอดรวมแคมเปญรวมรายงานกลุ่ม แต่ยอดรายสาขานับเฉพาะรายคน (กติกา 49m:
  // นาทีของหน่วยงานภายนอกไม่ทำให้อันดับสาขาได้แต้ม)
  function summary(branch) {
    const today = localDate(timezone, now());
    let todayMinutes = 0;
    for (const key of sessions.keys()) {
      if (key.split('|')[1] === today) todayMinutes += RULES.minutesPerSession;
    }
    for (const [key, report] of groupReports) {
      if (key.endsWith(`|${today}`)) todayMinutes += report.minutes;
    }
    let branchMinutes = 0;
    let branchToday = 0;
    for (const row of rows) {
      if (row.branch !== branch) continue;
      branchMinutes += row.minutes;
      if (row.date === today) branchToday += row.minutes;
    }
    let branchGroup = 0;
    for (const [key, report] of groupReports) {
      if (key.startsWith(`${branch}|`)) branchGroup += report.minutes;
    }
    return {
      contract_version: CONTRACT_VERSION,
      demo: true,
      as_of: asOf(),
      target_minutes: RULES.targetMinutes,
      total_minutes: totalMinutes,
      today_minutes: todayMinutes,
      group_minutes: branchGroup,
      participants: people.size,
      branch: { code: branch, minutes: branchMinutes, today_minutes: branchToday },
    };
  }

  function personToday(branch, personRef) {
    if (!validPersonRef(personRef)) {
      throw new ContractError(400, 'INVALID_PERSON_REF');
    }
    const person = personKey(personRef);
    const date = localDate(timezone, now());
    const slots = Object.fromEntries(
      RULES.slots.map((s) => [s, sessions.has(`${person}|${date}|${s}`)]),
    );
    return {
      contract_version: CONTRACT_VERSION,
      demo: true,
      as_of: asOf(),
      branch: { code: branch },
      date,
      slots,
      minutes_today: minutesOn(person, date),
      daily_cap_minutes: RULES.dailyCapMinutes,
      session_minutes: RULES.minutesPerSession,
    };
  }

  /** สถิติรายคนของสาขา — ไม่มีชื่อหรือเบอร์โทร · official_status คิดที่ระบบกลาง */
  function memberStats(branch, { cursor, limit } = {}) {
    const byMember = new Map();
    for (const row of rows) {
      if (row.branch !== branch) continue;
      const stat = byMember.get(row.member_code) ?? {
        member_code: row.member_code,
        total_minutes: 0,
        days: new Set(),
      };
      stat.total_minutes += row.minutes;
      stat.days.add(row.date);
      byMember.set(row.member_code, stat);
    }
    const items = [...byMember.values()].map((stat) => {
      const days = [...stat.days].sort();
      return {
        member_code: stat.member_code,
        total_minutes: stat.total_minutes,
        active_days: days.length,
        last_active_date: days[days.length - 1],
        // ยังไม่มีเกณฑ์เกียรติบัตร — ระบบกลางเป็นผู้คิดค่านี้เท่านั้น
        official_status: 'none',
      };
    });
    const { page, next_cursor } = paginate(items, (item) => [item.member_code], { cursor, limit });
    return {
      contract_version: CONTRACT_VERSION,
      demo: true,
      as_of: asOf(),
      branch: { code: branch },
      items: page,
      next_cursor,
    };
  }

  /** แถวรายวันแบบ CSV (UTF-8 BOM) · as_of และหน้าถัดไปอยู่ใน header */
  function dailyRowsCsv(branch, { cursor, limit } = {}) {
    const own = rows.filter((row) => row.branch === branch);
    const { page, next_cursor } = paginate(
      own,
      (row) => [row.date, row.member_code, row.slot],
      { cursor, limit },
    );
    const lines = [CSV_COLUMNS.join(',')];
    for (const row of page) lines.push(CSV_COLUMNS.map((col) => csvCell(row[col])).join(','));
    const headers = {
      'content-type': 'text/csv; charset=utf-8',
      'x-campaign-as-of': asOf(),
    };
    if (next_cursor) headers['x-campaign-next-cursor'] = next_cursor;
    return { status: 200, headers, body: `${CSV_BOM}${lines.join('\r\n')}\r\n` };
  }

  function recordEvidence(branch, req) {
    if (!req || req.contract_version !== CONTRACT_VERSION) {
      throw new ContractError(400, 'UNSUPPORTED_CONTRACT_VERSION');
    }
    if (req.branch !== branch) throw new ContractError(403, 'BRANCH_MISMATCH');
    if (!nonEmpty(req.batch_ref)) throw new ContractError(400, 'INVALID_BATCH_REF');
    const envelopes = req.envelopes;
    if (!Array.isArray(envelopes) || envelopes.length === 0 || envelopes.length > RULES.maxEnvelopesPerBatch) {
      throw new ContractError(400, 'INVALID_ENVELOPES');
    }

    // ส่งซ้ำด้วย batch_ref เดิม: เนื้อหาเดิม = คืนใบรับเดิม · เนื้อหาต่าง = ปฏิเสธ
    const fingerprint = JSON.stringify({ branch, envelopes });
    const batchKey = `${branch}|${req.batch_ref}`;
    const prior = batches.get(batchKey);
    if (prior) {
      if (prior.fingerprint === fingerprint) return { ...prior.receipt, replayed: true };
      throw new ContractError(409, 'BATCH_REF_REUSED');
    }

    // ตรวจหลังขั้น replay: batch ที่ commit แล้วส่งซ้ำยังได้ใบรับเดิมแม้พ้นช่วงแคมเปญแล้ว
    const date = localDate(timezone, now());
    if ((start && date < start) || (end && date > end)) {
      throw new ContractError(409, 'OUTSIDE_CAMPAIGN_PERIOD');
    }
    const source = nonEmpty(req.source_ref) ? req.source_ref : 'unknown';
    const seenIds = new Set();
    const accepted = [];
    const rejected = [];
    const duplicates = [];
    const pending = new Map(); // คิดผลของทั้ง batch ก่อน แล้วค่อยบันทึกทีเดียว (all-or-nothing)
    const pendingExternal = new Map(); // external_ref -> evidence_id ภายใน batch นี้
    const pendingGroups = new Map(); // `${branch}|${org_ref}|${date}` -> report

    for (const env of envelopes) {
      const id = env?.evidence_id;
      const reject = (code) => rejected.push({ evidence_id: nonEmpty(id) ? id : null, code });
      if (!nonEmpty(id)) { reject('INVALID_EVIDENCE_ID'); continue; }
      if (seenIds.has(id)) { reject('DUPLICATE_EVIDENCE_IN_BATCH'); continue; }
      seenIds.add(id);

      // external_ref: แถวเดิมจากระบบต้นทาง (เช่น response ID ของ Google Form) ไม่นับซ้ำ
      const ext = env.external_ref;
      if (ext !== undefined && ext !== null) {
        if (!nonEmpty(ext) || ext.length > RULES.maxExternalRefLength) {
          reject('INVALID_EXTERNAL_REF');
          continue;
        }
        const original = externalRefs.get(`${branch}|${ext}`) ?? pendingExternal.get(ext);
        if (original) {
          duplicates.push({ evidence_id: id, external_ref: ext, duplicate_of: original });
          continue;
        }
      }

      if (env.kind === 'group_report') {
        const org = env.org_ref;
        if (!nonEmpty(org) || !registeredOrgs.get(branch)?.has(org)) { reject('ORG_NOT_REGISTERED'); continue; }
        if (!isPositiveInt(env.participant_count)) { reject('INVALID_PARTICIPANT_COUNT'); continue; }
        if (!isPositiveInt(env.minutes)) { reject('INVALID_MINUTES'); continue; }
        if (env.minutes > env.participant_count * RULES.groupMinutesPerParticipant) {
          reject('GROUP_MINUTES_OVER_CAP');
          continue;
        }
        const groupKey = `${branch}|${org}|${date}`;
        if (groupReports.has(groupKey) || pendingGroups.has(groupKey)) {
          reject('GROUP_REPORT_ALREADY_RECORDED');
          continue;
        }
        pendingGroups.set(groupKey, { id, minutes: env.minutes, participant_count: env.participant_count });
        if (nonEmpty(ext)) pendingExternal.set(ext, id);
        accepted.push({ evidence_id: id, kind: 'group_report', date, org_ref: org, minutes: env.minutes });
        continue;
      }

      if (env.kind !== 'practice_session') { reject('UNKNOWN_EVIDENCE_KIND'); continue; }
      if (!RULES.slots.includes(env.slot)) { reject('UNKNOWN_SLOT'); continue; }
      const ref = env.person_ref;
      if (!validPersonRef(ref)) { reject('INVALID_PERSON_REF'); continue; }

      const person = personKey(ref);
      const key = `${person}|${date}|${env.slot}`;
      if (sessions.has(key) || pending.has(key)) { reject('SLOT_ALREADY_RECORDED'); continue; }
      let pendingForPerson = 0;
      for (const k of pending.keys()) if (k.startsWith(`${person}|${date}|`)) pendingForPerson += RULES.minutesPerSession;
      if (minutesOn(person, date) + pendingForPerson + RULES.minutesPerSession > RULES.dailyCapMinutes) {
        reject('DAILY_CAP_REACHED');
        continue;
      }
      pending.set(key, { id, person, member_code: ref.value, slot: env.slot });
      if (nonEmpty(ext)) pendingExternal.set(ext, id);
      accepted.push({ evidence_id: id, date, slot: env.slot, minutes: RULES.minutesPerSession });
    }

    const committed = rejected.length === 0;
    if (committed) {
      for (const [key, { id, person, member_code, slot }] of pending) {
        sessions.set(key, id);
        people.add(person);
        totalMinutes += RULES.minutesPerSession;
        rows.push({ branch, date, member_code, slot, minutes: RULES.minutesPerSession, source, evidence_id: id });
      }
      for (const [key, report] of pendingGroups) {
        groupReports.set(key, report);
        totalMinutes += report.minutes;
      }
      for (const [ext, id] of pendingExternal) externalRefs.set(`${branch}|${ext}`, id);
    }
    const receipt = {
      contract_version: CONTRACT_VERSION,
      demo: true,
      as_of: asOf(),
      batch_ref: req.batch_ref,
      committed,
      accepted: committed ? accepted : [],
      duplicates,
      rejected,
    };
    // จำเฉพาะ batch ที่ commit แล้ว — batch ที่ถูกปฏิเสธแก้แล้วส่งใหม่ด้วย batch_ref เดิมได้
    if (committed) batches.set(batchKey, { fingerprint, receipt });
    return receipt;
  }

  return { summary, personToday, memberStats, dailyRowsCsv, recordEvidence, registerOrg, rules: RULES };
}
