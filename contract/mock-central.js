// ระบบกลางจำลอง (โหมดตัวอย่าง + เทสต์) ตามร่าง contract `campaign.v1` (ดู campaign.v1.md)
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
  targetMinutes: 76_000_000,
  maxEnvelopesPerBatch: 10,
});

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

export function createMockCentral({ timezone = 'Asia/Bangkok', now = () => new Date() } = {}) {
  const batches = new Map(); // batch_ref -> { fingerprint, receipt }
  const sessions = new Map(); // `${person}|${date}|${slot}` -> evidence_id
  const people = new Set();
  let totalMinutes = 0;

  const personKey = (ref) => `${ref.source}:${ref.value}`;

  function minutesOn(person, date) {
    let m = 0;
    for (const key of sessions.keys()) {
      const [p, d] = key.split('|');
      if (p === person && d === date) m += RULES.minutesPerSession;
    }
    return m;
  }

  function summary(branch) {
    const today = localDate(timezone, now());
    let todayMinutes = 0;
    for (const key of sessions.keys()) {
      if (key.split('|')[1] === today) todayMinutes += RULES.minutesPerSession;
    }
    return {
      contract_version: CONTRACT_VERSION,
      demo: true,
      as_of: now().toISOString(),
      target_minutes: RULES.targetMinutes,
      total_minutes: totalMinutes,
      today_minutes: todayMinutes,
      participants: people.size,
      branch: { code: branch, minutes: totalMinutes },
    };
  }

  function personToday(branch, personRef) {
    if (!personRef || !nonEmpty(personRef.source) || !nonEmpty(personRef.value)) {
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
      branch: { code: branch },
      date,
      slots,
      minutes_today: minutesOn(person, date),
      daily_cap_minutes: RULES.dailyCapMinutes,
      session_minutes: RULES.minutesPerSession,
    };
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
    const prior = batches.get(req.batch_ref);
    if (prior) {
      if (prior.fingerprint === fingerprint) return { ...prior.receipt, replayed: true };
      throw new ContractError(409, 'BATCH_REF_REUSED');
    }

    const date = localDate(timezone, now());
    const seenIds = new Set();
    const accepted = [];
    const rejected = [];
    const pending = new Map(); // คิดผลของทั้ง batch ก่อน แล้วค่อยบันทึกทีเดียว (all-or-nothing)

    for (const env of envelopes) {
      const id = env?.evidence_id;
      const reject = (code) => rejected.push({ evidence_id: nonEmpty(id) ? id : null, code });
      if (!nonEmpty(id)) { reject('INVALID_EVIDENCE_ID'); continue; }
      if (seenIds.has(id)) { reject('DUPLICATE_EVIDENCE_IN_BATCH'); continue; }
      seenIds.add(id);
      if (env.kind !== 'practice_session') { reject('UNKNOWN_EVIDENCE_KIND'); continue; }
      if (!RULES.slots.includes(env.slot)) { reject('UNKNOWN_SLOT'); continue; }
      const ref = env.person_ref;
      if (!ref || !nonEmpty(ref.source) || !nonEmpty(ref.value)) { reject('INVALID_PERSON_REF'); continue; }

      const person = personKey(ref);
      const key = `${person}|${date}|${env.slot}`;
      if (sessions.has(key) || pending.has(key)) { reject('SLOT_ALREADY_RECORDED'); continue; }
      let pendingForPerson = 0;
      for (const k of pending.keys()) if (k.startsWith(`${person}|${date}|`)) pendingForPerson += RULES.minutesPerSession;
      if (minutesOn(person, date) + pendingForPerson + RULES.minutesPerSession > RULES.dailyCapMinutes) {
        reject('DAILY_CAP_REACHED');
        continue;
      }
      pending.set(key, { id, person });
      accepted.push({ evidence_id: id, date, slot: env.slot, minutes: RULES.minutesPerSession });
    }

    const committed = rejected.length === 0;
    if (committed) {
      for (const [key, { id, person }] of pending) {
        sessions.set(key, id);
        people.add(person);
        totalMinutes += RULES.minutesPerSession;
      }
    }
    const receipt = {
      contract_version: CONTRACT_VERSION,
      demo: true,
      batch_ref: req.batch_ref,
      committed,
      accepted: committed ? accepted : [],
      rejected,
    };
    // จำเฉพาะ batch ที่ commit แล้ว — batch ที่ถูกปฏิเสธแก้แล้วส่งใหม่ด้วย batch_ref เดิมได้
    if (committed) batches.set(req.batch_ref, { fingerprint, receipt });
    return receipt;
  }

  return { summary, personToday, recordEvidence, rules: RULES };
}
