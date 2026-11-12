// เทสต์ระบบกลางจำลองตาม contract campaign.v1 v0.2:
// external_ref ไม่นับซ้ำ · รายงานกลุ่ม · API อ่าน (ยอด · รายคนแบ่งหน้า · CSV)
// รัน: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_BOM, CSV_COLUMNS, createMockCentral } from '../contract/mock-central.js';

const BRANCH = '000';
const ORG = 'org-school-0001'; // หน่วยงานตั้งต้นของสาขา 000 ใน mock

let seq = 0;
const id = (prefix = 'e') => `${prefix}-${++seq}`;
const practice = (member, slot, extra = {}) => ({
  evidence_id: id(),
  kind: 'practice_session',
  slot,
  person_ref: { source: 'demo', value: member },
  ...extra,
});
const group = (extra = {}) => ({
  evidence_id: id('g'),
  kind: 'group_report',
  org_ref: ORG,
  participant_count: 10,
  minutes: 150,
  ...extra,
});
const batch = (envelopes, extra = {}) => ({
  contract_version: 'campaign.v1',
  branch: BRANCH,
  batch_ref: id('batch'),
  source_ref: 'tests@0.2',
  envelopes,
  ...extra,
});

function clock(start = '2027-01-10T02:00:00Z') {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), nextDay: () => { t += 24 * 3600 * 1000; } };
}

// ---------- external_ref ----------

test('external_ref ซ้ำใน batch เดียวกัน: แถวหลังเป็น duplicate ชี้ evidence_id เดิม ไม่นับซ้ำ', () => {
  const central = createMockCentral();
  const first = practice('000-0001', 'morning', { external_ref: 'form-resp-1' });
  const again = practice('000-0001', 'midday', { external_ref: 'form-resp-1' });
  const r = central.recordEvidence(BRANCH, batch([first, again]));
  assert.equal(r.committed, true);
  assert.deepEqual(r.rejected, []);
  assert.deepEqual(r.accepted.map((a) => a.evidence_id), [first.evidence_id]);
  assert.deepEqual(r.duplicates, [
    { evidence_id: again.evidence_id, external_ref: 'form-resp-1', duplicate_of: first.evidence_id },
  ]);
  assert.equal(central.summary(BRANCH).total_minutes, 5);
});

test('external_ref ซ้ำข้าม batch: ไม่นับซ้ำ · ไม่ใช่ rejection · batch_ref เดิมยัง replay ได้', () => {
  const central = createMockCentral();
  const first = practice('000-0001', 'morning', { external_ref: 'form-resp-2' });
  const b1 = batch([first]);
  central.recordEvidence(BRANCH, b1);

  const later = practice('000-0002', 'morning', { external_ref: 'form-resp-2' });
  const fresh = practice('000-0002', 'midday', { external_ref: 'form-resp-3' });
  const r = central.recordEvidence(BRANCH, batch([later, fresh]));
  assert.equal(r.committed, true);
  assert.deepEqual(r.rejected, []);
  assert.deepEqual(r.duplicates, [
    { evidence_id: later.evidence_id, external_ref: 'form-resp-2', duplicate_of: first.evidence_id },
  ]);
  assert.deepEqual(r.accepted.map((a) => a.evidence_id), [fresh.evidence_id]);
  assert.equal(central.summary(BRANCH).total_minutes, 10);

  // กติกา batch_ref เดิมไม่เปลี่ยน
  assert.equal(central.recordEvidence(BRANCH, b1).replayed, true);
  assert.throws(() => central.recordEvidence(BRANCH, { ...b1, envelopes: [fresh] }), { code: 'BATCH_REF_REUSED' });
  assert.equal(central.summary(BRANCH).total_minutes, 10);
});

test('external_ref นับแยกตามสาขา และ batch ที่ไม่ commit ไม่ถูกจำ', () => {
  const central = createMockCentral();
  for (const [branch, member] of [['001', '001-0001'], [BRANCH, '000-0001']]) {
    const r = central.recordEvidence(branch, batch([practice(member, 'morning', { external_ref: 'shared-ref' })], { branch }));
    assert.equal(r.accepted.length, 1, branch);
    assert.deepEqual(r.duplicates, [], branch);
  }

  const failed = central.recordEvidence(
    BRANCH,
    batch([practice('000-0009', 'morning', { external_ref: 'retry-ref' }), practice('000-0009', 'night')]),
  );
  assert.equal(failed.committed, false);
  const retry = central.recordEvidence(BRANCH, batch([practice('000-0009', 'morning', { external_ref: 'retry-ref' })]));
  assert.equal(retry.accepted.length, 1);
  assert.deepEqual(retry.duplicates, []);

  for (const bad of ['', '   ', 'x'.repeat(201), 42]) {
    const r = central.recordEvidence(BRANCH, batch([practice('000-0010', 'morning', { external_ref: bad })]));
    assert.equal(r.rejected[0].code, 'INVALID_EXTERNAL_REF', String(bad));
  }
});

// ---------- group_report ----------

test('group_report ทางปกติ: นับเข้ายอดแคมเปญ · external_ref ซ้ำไม่นับซ้ำ', () => {
  const c = clock();
  const central = createMockCentral({ now: c.now });
  const report = group({ participant_count: 4, minutes: 60, external_ref: 'sheet-row-7' });
  const r = central.recordEvidence(BRANCH, batch([report]));
  assert.equal(r.committed, true);
  assert.deepEqual(r.accepted, [
    { evidence_id: report.evidence_id, kind: 'group_report', date: '2027-01-10', org_ref: ORG, minutes: 60 },
  ]);
  const s = central.summary(BRANCH);
  assert.equal(s.total_minutes, 60);
  assert.equal(s.group_minutes, 60);
  assert.equal(s.today_minutes, 60);
  assert.equal(s.participants, 0, 'รายงานกลุ่มไม่สร้างผู้ร่วมรายคน');

  const again = central.recordEvidence(BRANCH, batch([group({ external_ref: 'sheet-row-7' })]));
  assert.equal(again.duplicates[0].duplicate_of, report.evidence_id);
  assert.equal(central.summary(BRANCH).total_minutes, 60);

  // วันถัดไปหน่วยงานเดิมส่งได้อีก
  c.nextDay();
  assert.equal(central.recordEvidence(BRANCH, batch([group()])).committed, true);
});

test('summary: นาทีกลุ่มนับเข้ายอดแคมเปญ แต่ไม่นับเข้ายอดรายสาขา (กติกา 49m)', () => {
  const central = createMockCentral();
  const r = central.recordEvidence(BRANCH, batch([practice('000-0001', 'morning'), group({ participant_count: 4, minutes: 60 })]));
  assert.equal(r.committed, true);
  const s = central.summary(BRANCH);
  assert.equal(s.branch.minutes, 5);
  assert.equal(s.branch.today_minutes, 5);
  assert.equal(s.group_minutes, 60);
  assert.equal(s.total_minutes, 65);
  assert.equal(s.today_minutes, 65);
  // สาขาอื่นไม่เห็นนาทีของสาขานี้ในยอดรายสาขาหรือยอดกลุ่ม
  const other = central.summary('001');
  assert.equal(other.branch.minutes, 0);
  assert.equal(other.group_minutes, 0);
});

test('group_report: เพดานนาที = participant_count × 15 พอดีผ่าน เกิน 1 ไม่ผ่าน', () => {
  const central = createMockCentral();
  central.registerOrg(BRANCH, 'org-cap-0001');
  central.registerOrg(BRANCH, 'org-cap-0002');
  const over = central.recordEvidence(BRANCH, batch([group({ org_ref: 'org-cap-0001', participant_count: 3, minutes: 46 })]));
  assert.equal(over.committed, false);
  assert.equal(over.rejected[0].code, 'GROUP_MINUTES_OVER_CAP');
  const exact = central.recordEvidence(BRANCH, batch([group({ org_ref: 'org-cap-0002', participant_count: 3, minutes: 45 })]));
  assert.equal(exact.committed, true);
  assert.equal(central.summary(BRANCH).total_minutes, 45);
});

test('group_report: ทุกรหัสปฏิเสธ และไม่มีอะไรถูกบันทึก', () => {
  const central = createMockCentral();
  const cases = [
    [{ org_ref: 'org-unknown-9999' }, 'ORG_NOT_REGISTERED'],
    [{ org_ref: undefined }, 'ORG_NOT_REGISTERED'],
    [{ participant_count: 0 }, 'INVALID_PARTICIPANT_COUNT'],
    [{ participant_count: -2 }, 'INVALID_PARTICIPANT_COUNT'],
    [{ participant_count: 2.5 }, 'INVALID_PARTICIPANT_COUNT'],
    [{ participant_count: '10' }, 'INVALID_PARTICIPANT_COUNT'],
    [{ minutes: 0 }, 'INVALID_MINUTES'],
    [{ minutes: 1.5 }, 'INVALID_MINUTES'],
    [{ participant_count: 2, minutes: 31 }, 'GROUP_MINUTES_OVER_CAP'],
  ];
  for (const [change, code] of cases) {
    const r = central.recordEvidence(BRANCH, batch([group(change)]));
    assert.equal(r.committed, false, code);
    assert.deepEqual(r.rejected.map((x) => x.code), [code]);
  }
  // หน่วยงานของอีกสาขาใช้กับสาขานี้ไม่ได้
  central.registerOrg('001', 'org-other-0001');
  assert.equal(
    central.recordEvidence(BRANCH, batch([group({ org_ref: 'org-other-0001' })])).rejected[0].code,
    'ORG_NOT_REGISTERED',
  );
  assert.equal(central.summary(BRANCH).total_minutes, 0);
});

test('group_report: หน่วยงานเดียวกันวันเดียวกันส่งได้ครั้งเดียว (ข้าม batch และใน batch เดียว)', () => {
  const central = createMockCentral();
  assert.equal(central.recordEvidence(BRANCH, batch([group()])).committed, true);
  const second = central.recordEvidence(BRANCH, batch([group({ minutes: 10 })]));
  assert.equal(second.committed, false);
  assert.equal(second.rejected[0].code, 'GROUP_REPORT_ALREADY_RECORDED');

  const fresh = createMockCentral();
  const both = fresh.recordEvidence(BRANCH, batch([group(), group({ minutes: 10 })]));
  assert.equal(both.committed, false);
  assert.equal(both.rejected[0].code, 'GROUP_REPORT_ALREADY_RECORDED');
  assert.equal(fresh.summary(BRANCH).total_minutes, 0);
});

test('ลงทะเบียนหน่วยงานแล้วส่งรายงานกลุ่มได้', () => {
  const central = createMockCentral();
  const report = group({ org_ref: 'org-new-0003' });
  assert.equal(central.recordEvidence(BRANCH, batch([report])).rejected[0].code, 'ORG_NOT_REGISTERED');
  central.registerOrg(BRANCH, 'org-new-0003');
  assert.equal(central.recordEvidence(BRANCH, batch([group({ org_ref: 'org-new-0003' })])).committed, true);
});

// ---------- API อ่าน ----------

function seeded(memberCount) {
  const c = clock();
  const central = createMockCentral({ now: c.now });
  for (let day = 0; day < 2; day++) {
    for (let start = 0; start < memberCount; start += 3) {
      const envs = [];
      for (let m = start; m < Math.min(start + 3, memberCount); m++) {
        const code = `000-${String(m).padStart(4, '0')}`;
        envs.push(practice(code, 'morning'));
        if (m % 2 === 0) envs.push(practice(code, 'evening'));
      }
      assert.equal(central.recordEvidence(BRANCH, batch(envs)).committed, true);
    }
    if (day === 0) c.nextDay();
  }
  return { central, clock: c };
}

function allMembers(central, limit) {
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const page = central.memberStats(BRANCH, { cursor, limit });
    assert.ok(page.as_of, 'ทุกหน้ามี as_of');
    assert.ok(page.items.length <= limit);
    seen.push(...page.items);
    cursor = page.next_cursor;
    pages++;
  } while (cursor);
  return { seen, pages };
}

test('สถิติรายคน: แบ่งหน้าครบ ไม่ซ้ำ ไม่ตก · ไม่มีชื่อหรือเบอร์ · official_status = none', () => {
  const { central } = seeded(23);
  const { seen, pages } = allMembers(central, 5);
  assert.equal(pages, 5);
  const codes = seen.map((m) => m.member_code);
  assert.equal(new Set(codes).size, 23);
  assert.deepEqual(codes, [...codes].sort());
  for (const m of seen) {
    assert.deepEqual(Object.keys(m).sort(), [
      'active_days',
      'last_active_date',
      'member_code',
      'official_status',
      'total_minutes',
    ]);
    assert.equal(m.official_status, 'none');
    assert.equal(m.active_days, 2);
    assert.equal(m.last_active_date, '2027-01-11');
    const index = Number(m.member_code.slice(4));
    assert.equal(m.total_minutes, index % 2 === 0 ? 20 : 10);
  }
  const text = JSON.stringify(seen);
  assert.ok(!/name|phone|tel/i.test(text), text);
});

test('สถิติรายคน: สมาชิกใหม่ระหว่างไล่หน้าไม่ทำให้แถวซ้ำหรือตก', () => {
  const { central } = seeded(6);
  const first = central.memberStats(BRANCH, { limit: 3 });
  assert.deepEqual(first.items.map((m) => m.member_code), ['000-0000', '000-0001', '000-0002']);
  // แทรกสมาชิกที่เรียงอยู่ก่อนหน้าปัจจุบัน และหลังหน้าปัจจุบัน
  central.recordEvidence(BRANCH, batch([practice('000-0000a', 'morning'), practice('000-0099', 'morning')]));
  const rest = [];
  let cursor = first.next_cursor;
  while (cursor) {
    const page = central.memberStats(BRANCH, { cursor, limit: 3 });
    rest.push(...page.items.map((m) => m.member_code));
    cursor = page.next_cursor;
  }
  assert.deepEqual(rest, ['000-0003', '000-0004', '000-0005', '000-0099']);
});

test('limit: ค่าเริ่มต้น 100 · สูงสุด 500 · เกินหรือผิดรูปถูกปฏิเสธ · cursor ปลอมถูกปฏิเสธ', () => {
  const { central } = seeded(3);
  assert.equal(central.memberStats(BRANCH).items.length, 3);
  assert.equal(central.memberStats(BRANCH, { limit: 500 }).items.length, 3);
  assert.equal(central.memberStats(BRANCH, { limit: '500' }).items.length, 3);
  for (const limit of [501, '501', 0, -1, 1.5, 'abc', 10_000]) {
    assert.throws(() => central.memberStats(BRANCH, { limit }), { code: 'INVALID_LIMIT' }, String(limit));
    assert.throws(() => central.dailyRowsCsv(BRANCH, { limit }), { code: 'INVALID_LIMIT' }, String(limit));
  }
  for (const cursor of ['not-a-cursor!!', 'e30', btoa('"x"')]) {
    assert.throws(() => central.memberStats(BRANCH, { cursor }), { code: 'INVALID_CURSOR' }, cursor);
  }
});

function parseCsv(body) {
  return body.slice(1).trimEnd().split('\r\n').map((line) => line.split(','));
}

test('CSV รายวัน: ขึ้นต้นด้วย UTF-8 BOM · คอลัมน์ตามสัญญา ไม่มีชื่อ/เบอร์ · มี as_of', () => {
  const { central } = seeded(4);
  const res = central.dailyRowsCsv(BRANCH, { limit: 500 });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^text\/csv; charset=utf-8$/);
  assert.ok(res.headers['x-campaign-as-of']);
  assert.equal(res.headers['x-campaign-next-cursor'], undefined);
  assert.equal(res.body.charCodeAt(0), 0xfeff);
  assert.ok(res.body.startsWith(CSV_BOM));
  assert.equal(new TextEncoder().encode(res.body).slice(0, 3).join(','), '239,187,191');
  const [header, ...lines] = parseCsv(res.body);
  assert.deepEqual(header, ['date', 'member_code', 'slot', 'minutes', 'source']);
  assert.deepEqual(CSV_COLUMNS, header);
  assert.ok(!header.some((h) => /name|phone|tel/i.test(h)));
  assert.equal(lines.length, 12); // 4 คน × 2 วัน + เย็นของคนเลขคู่ 2 คน × 2 วัน
  assert.deepEqual(lines[0], ['2027-01-10', '000-0000', 'evening', '5', 'tests@0.2']);
});

test('CSV รายวัน: แบ่งหน้าครบไม่ซ้ำ · ทุกหน้ามี BOM และ header', () => {
  const { central } = seeded(5);
  const rows = [];
  let cursor;
  let pages = 0;
  do {
    const res = central.dailyRowsCsv(BRANCH, { cursor, limit: 4 });
    assert.ok(res.body.startsWith(CSV_BOM));
    assert.ok(res.headers['x-campaign-as-of']);
    const [header, ...lines] = parseCsv(res.body);
    assert.deepEqual(header, [...CSV_COLUMNS]);
    assert.ok(lines.length <= 4);
    rows.push(...lines.map((l) => l.join(',')));
    cursor = res.headers['x-campaign-next-cursor'];
    pages++;
  } while (cursor);
  assert.equal(rows.length, 16); // 5 × 2 + คนเลขคู่ 3 × 2
  assert.equal(new Set(rows).size, rows.length);
  assert.equal(pages, 4);
});

test('CSV กันสูตรในชีต: ค่าที่ขึ้นต้นด้วย = + - @ ถูกนำหน้าด้วย apostrophe', () => {
  const central = createMockCentral();
  central.recordEvidence(BRANCH, batch([practice('=HYPERLINK("x")', 'morning')], { source_ref: '@cmd' }));
  const body = central.dailyRowsCsv(BRANCH).body;
  assert.ok(body.includes(`"'=HYPERLINK(""x"")"`), body);
  assert.ok(body.includes(",'@cmd"), body);
});

test('as_of มีในทุกคำตอบของระบบกลางจำลอง', () => {
  const central = createMockCentral();
  const receipt = central.recordEvidence(BRANCH, batch([practice('000-0001', 'morning')]));
  const answers = [
    central.summary(BRANCH),
    central.personToday(BRANCH, { source: 'demo', value: '000-0001' }),
    central.memberStats(BRANCH),
    receipt,
  ];
  for (const a of answers) assert.ok(!Number.isNaN(Date.parse(a.as_of)), JSON.stringify(a));
  assert.ok(!Number.isNaN(Date.parse(central.dailyRowsCsv(BRANCH).headers['x-campaign-as-of'])));
});

test('API อ่านเห็นเฉพาะสาขาตัวเอง', () => {
  const central = createMockCentral();
  central.recordEvidence(BRANCH, batch([practice('000-0001', 'morning')]));
  central.recordEvidence('001', batch([practice('001-0001', 'morning')], { branch: '001' }));
  assert.deepEqual(central.memberStats('001').items.map((m) => m.member_code), ['001-0001']);
  const [, ...lines] = parseCsv(central.dailyRowsCsv(BRANCH).body);
  assert.deepEqual(lines.map((l) => l[1]), ['000-0001']);
});

// ---------- v0.3 ----------

function settableClock(iso) {
  let t = new Date(iso);
  return { now: () => t, set: (next) => { t = new Date(next); } };
}

const outside = { status: 409, code: 'OUTSIDE_CAMPAIGN_PERIOD' };

test('v0.3 OUTSIDE_CAMPAIGN_PERIOD: วันแรกและวันสุดท้ายรับ · วันก่อนและวันหลัง 409 (ตามเขตเวลา)', () => {
  const c = settableClock('2026-12-31T16:59:59Z'); // 31 ธ.ค. 23:59:59 ที่ไทย
  const central = createMockCentral({ now: c.now, campaignStart: '2027-01-01', campaignEnd: '2027-01-31' });
  assert.throws(() => central.recordEvidence(BRANCH, batch([practice('000-0001', 'morning')])), outside);
  c.set('2026-12-31T17:00:00Z'); // 1 ม.ค. 00:00 ที่ไทย
  assert.equal(central.recordEvidence(BRANCH, batch([practice('000-0002', 'morning')])).committed, true);
  c.set('2027-01-31T16:59:59Z'); // 31 ม.ค. 23:59:59 ที่ไทย
  assert.equal(central.recordEvidence(BRANCH, batch([practice('000-0003', 'morning')])).committed, true);
  c.set('2027-01-31T17:00:00Z'); // 1 ก.พ. ที่ไทย
  assert.throws(() => central.recordEvidence(BRANCH, batch([practice('000-0004', 'morning')])), outside);
  assert.equal(central.summary(BRANCH).total_minutes, 10);
});

test('v0.3 OUTSIDE_CAMPAIGN_PERIOD ตรวจหลัง replay: batch ที่ commit แล้วส่งซ้ำได้ใบรับเดิมแม้พ้นช่วง', () => {
  const c = settableClock('2027-01-10T02:00:00Z');
  const central = createMockCentral({ now: c.now, campaignStart: '2027-01-01', campaignEnd: '2027-01-31' });
  const req = batch([practice('000-0001', 'morning')]);
  const first = central.recordEvidence(BRANCH, req);
  c.set('2027-03-01T02:00:00Z');
  assert.deepEqual(central.recordEvidence(BRANCH, req), { ...first, replayed: true });
  assert.throws(() => central.recordEvidence(BRANCH, { ...req, envelopes: [practice('000-0001', 'midday')] }), {
    code: 'BATCH_REF_REUSED',
  });
  // ตรวจรูปแบบ batch ก่อนช่วงแคมเปญ
  assert.throws(() => central.recordEvidence(BRANCH, batch([])), { code: 'INVALID_ENVELOPES' });
  assert.equal(central.summary(BRANCH).total_minutes, 5);
});

test('v0.3 ไม่ใส่ช่วงแคมเปญ = ไม่จำกัด · ใส่ด้านเดียวได้ · ค่าผิดรูปหรือกลับด้าน = throw', () => {
  const c = settableClock('1999-01-01T02:00:00Z');
  assert.equal(createMockCentral({ now: c.now }).recordEvidence(BRANCH, batch([practice('000-0001', 'morning')])).committed, true);
  c.set('2099-12-31T02:00:00Z');
  assert.equal(createMockCentral({ now: c.now }).recordEvidence(BRANCH, batch([practice('000-0001', 'morning')])).committed, true);
  const startOnly = createMockCentral({ now: c.now, campaignStart: '2100-01-01' });
  assert.throws(() => startOnly.recordEvidence(BRANCH, batch([practice('000-0001', 'morning')])), outside);
  const endOnly = createMockCentral({ now: c.now, campaignEnd: '2099-12-30' });
  assert.throws(() => endOnly.recordEvidence(BRANCH, batch([practice('000-0001', 'morning')])), outside);
  for (const bad of ['2027-1-01', '2027/01/01', '2027-02-30', '2569-13-01', 20270101, '', 'today']) {
    assert.throws(() => createMockCentral({ campaignStart: bad }), TypeError, String(bad));
    assert.throws(() => createMockCentral({ campaignEnd: bad }), TypeError, String(bad));
  }
  assert.throws(() => createMockCentral({ campaignStart: '2027-02-01', campaignEnd: '2027-01-31' }), TypeError);
  assert.doesNotThrow(() => createMockCentral({ campaignStart: '2027-01-31', campaignEnd: '2027-01-31' }));
});

const PADDED_REFS = [
  { source: 'demo', value: '000-0001 ' },
  { source: 'demo', value: ' 000-0001' },
  { source: 'demo', value: '000-0001\t' },
  { source: 'demo', value: '\t000-0001' },
  { source: 'demo ', value: '000-0001' },
  { source: ' demo', value: '000-0001' },
  { source: 'demo\t', value: '000-0001' },
];

test('v0.3 person_ref มีช่องว่างหน้า/หลัง = INVALID_PERSON_REF ทั้ง recordEvidence และ personToday', () => {
  const central = createMockCentral();
  for (const ref of PADDED_REFS) {
    const r = central.recordEvidence(BRANCH, batch([practice('000-0009', 'morning'), { ...practice('x', 'midday'), person_ref: ref }]));
    assert.equal(r.committed, false, JSON.stringify(ref));
    assert.deepEqual(r.rejected.map((x) => x.code), ['INVALID_PERSON_REF']);
    assert.throws(() => central.personToday(BRANCH, ref), { status: 400, code: 'INVALID_PERSON_REF' }, JSON.stringify(ref));
  }
  assert.equal(central.summary(BRANCH).participants, 0);
});

test('v0.3 "000-0001" ครบเพดานแล้ว "000-0001␠" ไม่ได้นาทีเพิ่ม และไม่นับเป็นผู้ร่วมใหม่', () => {
  const central = createMockCentral();
  const full = ['morning', 'midday', 'evening'].map((slot) => practice('000-0001', slot));
  assert.equal(central.recordEvidence(BRANCH, batch(full)).committed, true);
  for (const value of ['000-0001 ', ' 000-0001', '000-0001\t']) {
    const r = central.recordEvidence(BRANCH, batch([practice(value, 'morning')]));
    assert.deepEqual(r.rejected.map((x) => x.code), ['INVALID_PERSON_REF']);
  }
  assert.equal(central.personToday(BRANCH, { source: 'demo', value: '000-0001' }).minutes_today, 15);
  const s = central.summary(BRANCH);
  assert.equal(s.participants, 1);
  assert.equal(s.total_minutes, 15);
  assert.equal(s.branch.minutes, 15);
});

test('v0.3 batch_ref นับต่อสาขา: คนละสาขา commit ได้ทั้งคู่ · สาขาเดียวกันเนื้อหาต่าง = BATCH_REF_REUSED', () => {
  const central = createMockCentral();
  const a = central.recordEvidence(BRANCH, { ...batch([practice('000-0001', 'morning')]), batch_ref: 'shared-batch' });
  const b = central.recordEvidence('001', { ...batch([practice('001-0001', 'morning')], { branch: '001' }), batch_ref: 'shared-batch' });
  assert.equal(a.committed, true);
  assert.equal(b.committed, true);
  assert.equal(b.replayed, undefined);
  assert.throws(
    () => central.recordEvidence(BRANCH, { ...batch([practice('000-0002', 'morning')]), batch_ref: 'shared-batch' }),
    { status: 409, code: 'BATCH_REF_REUSED' },
  );
  assert.equal(central.memberStats('001').items.length, 1);
});

test('today_minutes และ branch.today_minutes ข้ามวัน: แถวเมื่อวานไม่อยู่ใน today (backlog W3.1)', () => {
  const c = clock();
  const central = createMockCentral({ now: c.now });
  central.recordEvidence(BRANCH, batch([practice('000-0001', 'morning'), group({ participant_count: 2, minutes: 20 })]));
  let s = central.summary(BRANCH);
  assert.equal(s.today_minutes, 25);
  assert.equal(s.branch.today_minutes, 5);
  c.nextDay();
  s = central.summary(BRANCH);
  assert.equal(s.today_minutes, 0);
  assert.equal(s.branch.today_minutes, 0);
  assert.equal(s.total_minutes, 25);
  assert.equal(s.branch.minutes, 5);
  central.recordEvidence(BRANCH, batch([practice('000-0001', 'morning')]));
  s = central.summary(BRANCH);
  assert.equal(s.today_minutes, 5);
  assert.equal(s.branch.today_minutes, 5);
});
