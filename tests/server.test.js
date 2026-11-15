// เทสต์ส่วน server: โหมดตัวอย่าง · ตั้งค่าครึ่งเดียวต้องปฏิเสธ · โหมดจริงต่อระบบกลางปลอม
// รัน: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp, resolveMode } from '../server/app.js';
import { createMockCentral, localDate } from '../contract/mock-central.js';
import { createCentralClient } from '../server/central.js';
import baseConfig from '../wp.config.js';

const CREDENTIAL = 'wp_test_credential_DO_NOT_LEAK_7f3a9c'; // gitleaks:allow — credential ปลอมสำหรับเทสต์

const appWith = (env = {}, cfg = baseConfig) => createApp({ readEnv: () => env, cfg });
const json = async (res) => ({ status: res.status, body: await res.json() });
const post = (app, path, body) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---------- โหมดตัวอย่าง ----------

test('ไม่มี env = โหมดตัวอย่าง', async () => {
  const app = appWith();
  const { status, body } = await json(await app.request('/api/health'));
  assert.equal(status, 200);
  assert.equal(body.mode, 'demo');
  assert.equal(body.ok, true);
  assert.equal(body.contract_version, 'campaign.v1');
});

test('/api/config ส่งเฉพาะค่าสาธารณะ', async () => {
  const app = appWith();
  const { body } = await json(await app.request('/api/config'));
  assert.deepEqual(Object.keys(body).sort(), ['branch', 'mode', 'projects', 'theme']);
  assert.deepEqual(Object.keys(body.branch).sort(), ['code', 'contact', 'name', 'timezone']);
  assert.equal(body.mode, 'demo');
});

test('/api/config ไม่ส่งช่องที่ไม่ได้ประกาศ แม้มีคนเพิ่มลงใน wp.config.js', async () => {
  const cfg = {
    ...baseConfig,
    internal_note: 'ห้ามหลุด',
    branch: { ...baseConfig.branch, internal_note: 'ห้ามหลุด' },
    projects: { campaign: { ...baseConfig.projects.campaign, internal_note: 'ห้ามหลุด' } },
  };
  const text = await (await appWith({}, cfg).request('/api/config')).text();
  assert.ok(!text.includes('ห้ามหลุด'), text);
});

test('บันทึกสมาธิในโหมดตัวอย่าง: บันทึกได้ · ส่งซ้ำไม่นับซ้ำ · ช่วงเดิมซ้ำไม่ได้', async () => {
  const app = appWith();
  const member = '000-0001';

  let r = await json(await app.request(`/api/campaign/today?member=${member}`));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.slots, { morning: false, midday: false, evening: false });

  const first = { member, slot: 'morning', event_id: 'evt-0001-aaaa' };
  r = await json(await post(app, '/api/campaign/practice', first));
  assert.equal(r.status, 200);
  assert.equal(r.body.committed, true);
  assert.equal(r.body.accepted[0].minutes, 5);

  // ส่งซ้ำด้วย event เดิม (เช่น เน็ตหลุดแล้วกดใหม่) = ใบรับเดิม ยอดไม่เพิ่ม
  r = await json(await post(app, '/api/campaign/practice', first));
  assert.equal(r.status, 200);
  assert.equal(r.body.replayed, true);
  let s = await json(await app.request('/api/campaign/summary'));
  assert.equal(s.body.total_minutes, 5);
  assert.equal(s.body.participants, 1);

  // event ใหม่ ช่วงเดิม = ปฏิเสธ
  r = await json(await post(app, '/api/campaign/practice', { member, slot: 'morning', event_id: 'evt-0002-bbbb' }));
  assert.equal(r.status, 422);
  assert.equal(r.body.committed, false);
  assert.equal(r.body.rejected[0].code, 'SLOT_ALREADY_RECORDED');

  // event เดิม เนื้อหาต่าง = ปฏิเสธ
  r = await json(await post(app, '/api/campaign/practice', { member, slot: 'evening', event_id: 'evt-0001-aaaa' }));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'BATCH_REF_REUSED');

  r = await json(await app.request(`/api/campaign/today?member=${member}`));
  assert.equal(r.body.slots.morning, true);
  assert.equal(r.body.minutes_today, 5);
  s = await json(await app.request('/api/campaign/summary'));
  assert.equal(s.body.total_minutes, 5);
});

test('ข้อมูลผิดรูปถูกปฏิเสธก่อนถึงระบบกลาง', async () => {
  const app = appWith();
  const cases = [
    [{ member: 'x', slot: 'morning', event_id: 'evt-0003-cccc' }, 'INVALID_MEMBER'],
    [{ member: '000-0002', slot: 'night', event_id: 'evt-0003-cccc' }, 'UNKNOWN_SLOT'],
    [{ member: '000-0002', slot: 'morning', event_id: 'short' }, 'INVALID_EVENT_ID'],
  ];
  for (const [body, code] of cases) {
    const r = await json(await post(app, '/api/campaign/practice', body));
    assert.equal(r.status, 400, code);
    assert.equal(r.body.code, code);
  }
});

test('ปิดโครงการใน wp.config.js แล้ว route ของโครงการตอบ 404', async () => {
  const cfg = { ...baseConfig, projects: { campaign: { enabled: false, title: 'x' } } };
  const r = await json(await appWith({}, cfg).request('/api/campaign/summary'));
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'PROJECT_DISABLED');
});

// ---------- ตั้งค่าครึ่งเดียว ----------

test('ตั้งค่าไม่ครบหรือผิด = ปฏิเสธทุกคำขอ ไม่ถอยไปโหมดตัวอย่าง', async () => {
  assert.equal(resolveMode({ WP_CENTRAL_URL: 'https://central.example' }).reason, 'APP_CREDENTIAL_MISSING');
  assert.equal(resolveMode({ WP_APP_CREDENTIAL: CREDENTIAL }).reason, 'CENTRAL_URL_MISSING');
  assert.equal(resolveMode({ WP_CENTRAL_URL: 'not a url', WP_APP_CREDENTIAL: CREDENTIAL }).reason, 'CENTRAL_URL_INVALID');
  assert.equal(
    resolveMode({ WP_CENTRAL_URL: 'http://central.example', WP_APP_CREDENTIAL: CREDENTIAL }).reason,
    'CENTRAL_URL_NOT_HTTPS',
  );
  assert.equal(resolveMode({ WP_CENTRAL_URL: 'http://127.0.0.1:9', WP_APP_CREDENTIAL: CREDENTIAL }).mode, 'live');

  const app = appWith({ WP_CENTRAL_URL: 'https://central.example' });
  const h = await json(await app.request('/api/health'));
  assert.equal(h.body.ok, false);
  assert.equal(h.body.mode, 'misconfigured');
  const r = await json(await app.request('/api/campaign/summary'));
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'APP_CREDENTIAL_MISSING');
});

// ---------- โหมดจริง (ระบบกลางปลอม) ----------

async function fakeCentral(handler) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    const { status, body } = handler(req);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, seen, close: () => new Promise((r) => server.close(r)) };
}

test('โหมดจริง: ส่ง app credential ไประบบกลางเท่านั้น ไม่หลุดกลับมาที่ผู้ใช้', async () => {
  const central = await fakeCentral(() => ({
    status: 200,
    body: { contract_version: 'campaign.v1', total_minutes: 120, today_minutes: 15, participants: 3, target_minutes: 76000000, as_of: new Date().toISOString() },
  }));
  try {
    const app = appWith({ WP_CENTRAL_URL: central.url, WP_APP_CREDENTIAL: CREDENTIAL });
    const responses = [];
    for (const path of ['/api/health', '/api/config', '/api/campaign/summary']) {
      const res = await app.request(path);
      responses.push(await res.text());
    }
    assert.equal(JSON.parse(responses[0]).mode, 'live');
    assert.equal(JSON.parse(responses[2]).total_minutes, 120);
    assert.equal(central.seen[0].url, `/campaign/v1/branches/${baseConfig.branch.code}/summary`);
    assert.equal(central.seen[0].auth, `Bearer ${CREDENTIAL}`);
    for (const text of responses) assert.ok(!text.includes(CREDENTIAL), 'credential หลุดใน response');
  } finally {
    await central.close();
  }
});

test('โหมดจริง: บันทึกรายคนปิดไว้จนกว่าจะตกลงวิธียืนยันตัวตนสมาชิก', async () => {
  const central = await fakeCentral(() => ({ status: 200, body: {} }));
  try {
    const app = appWith({ WP_CENTRAL_URL: central.url, WP_APP_CREDENTIAL: CREDENTIAL });
    let r = await json(await post(app, '/api/campaign/practice', { member: '000-0001', slot: 'morning', event_id: 'evt-0009-zzzz' }));
    assert.equal(r.status, 501);
    assert.equal(r.body.code, 'MEMBER_AUTH_NOT_DECIDED');
    r = await json(await app.request('/api/campaign/today?member=000-0001'));
    assert.equal(r.status, 501);
    assert.equal(central.seen.length, 0, 'ต้องไม่ยิงไปถึงระบบกลาง');
  } finally {
    await central.close();
  }
});

test('โหมดจริง: แปลง error ของระบบกลางโดยไม่ส่งรายละเอียดต่อ', async () => {
  const cases = [
    [{ status: 401, body: { detail: 'credential revoked for branch 000' } }, 502, 'CENTRAL_AUTH_FAILED'],
    [{ status: 403, body: { code: 'BRANCH_MISMATCH' } }, 403, 'BRANCH_MISMATCH'],
    [{ status: 500, body: { message: 'stack trace…' } }, 502, 'CENTRAL_ERROR'],
    [{ status: 400, body: { code: 'lower-case not allowed' } }, 400, 'CENTRAL_ERROR'],
  ];
  for (const [reply, status, code] of cases) {
    const central = await fakeCentral(() => reply);
    try {
      const app = appWith({ WP_CENTRAL_URL: central.url, WP_APP_CREDENTIAL: CREDENTIAL });
      const res = await app.request('/api/campaign/summary');
      const text = await res.text();
      assert.equal(res.status, status, code);
      assert.deepEqual(JSON.parse(text), { code });
    } finally {
      await central.close();
    }
  }
});

test('โหมดจริง: ระบบกลางล่ม = 503 CENTRAL_UNREACHABLE', async () => {
  const central = await fakeCentral(() => ({ status: 200, body: {} }));
  const url = central.url;
  await central.close();
  const app = appWith({ WP_CENTRAL_URL: url, WP_APP_CREDENTIAL: CREDENTIAL });
  const r = await json(await app.request('/api/campaign/summary'));
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'CENTRAL_UNREACHABLE');
});

// ---------- โหมดจริง: retry ของ CONCURRENT_SUBMIT (v0.4) ----------

// fetch ปลอมที่ตอบตามลำดับ และจำทุกคำขอ · sleep ปลอมไม่รอจริง
function scriptedCentral(replies) {
  const calls = [];
  const waits = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers.authorization });
    const { status, body } = replies[Math.min(calls.length, replies.length) - 1];
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  const client = createCentralClient({
    baseUrl: 'https://central.invalid/',
    credential: CREDENTIAL,
    fetchImpl,
    retryDelayMs: () => 321,
    sleep: async (ms) => { waits.push(ms); },
  });
  return { client, calls, waits };
}

const evidenceRequest = () => ({
  contract_version: 'campaign.v1',
  branch: '000',
  batch_ref: 'batch-retry-1',
  source_ref: 'tests',
  envelopes: [{ evidence_id: 'e-1', kind: 'practice_session', slot: 'morning', person_ref: { source: 'member', value: '000-0001' } }],
});
const CONCURRENT = { status: 409, body: { code: 'CONCURRENT_SUBMIT' } };
const RECEIPT = { status: 200, body: { batch_ref: 'batch-retry-1', committed: true, accepted: [], duplicates: [], rejected: [] } };

test('โหมดจริง: 409 CONCURRENT_SUBMIT แล้ว 200 = สำเร็จ · ส่ง body เดิมทุกไบต์ซ้ำครั้งเดียว', async () => {
  const { client, calls, waits } = scriptedCentral([CONCURRENT, RECEIPT]);
  const receipt = await client.recordEvidence('000', evidenceRequest());
  assert.equal(receipt.committed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, calls[0].body);
  assert.equal(typeof calls[0].body, 'string');
  assert.equal(calls[0].url, calls[1].url);
  assert.equal(calls[0].url, 'https://central.invalid/campaign/v1/branches/000/evidence');
  assert.deepEqual(waits, [321]);
});

test('โหมดจริง: CONCURRENT_SUBMIT สองครั้ง = ContractError 409 CONCURRENT_SUBMIT · ไม่ retry เกินครั้งเดียว', async () => {
  const { client, calls, waits } = scriptedCentral([CONCURRENT, CONCURRENT, RECEIPT]);
  await assert.rejects(client.recordEvidence('000', evidenceRequest()), (err) => {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'CONCURRENT_SUBMIT');
    assert.ok(!String(err.message).includes(CREDENTIAL));
    return true;
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [321]);
});

test('โหมดจริง: รหัสอื่นและ GET ไม่ retry', async () => {
  for (const reply of [
    { status: 409, body: { code: 'BATCH_REF_REUSED' } },
    { status: 409, body: { code: 'OUTSIDE_CAMPAIGN_PERIOD' } },
    { status: 401, body: { code: 'CONCURRENT_SUBMIT' } },
    { status: 503, body: { code: 'CONCURRENT_SUBMIT' } },
  ]) {
    const { client, calls, waits } = scriptedCentral([reply, RECEIPT]);
    await assert.rejects(client.recordEvidence('000', evidenceRequest()));
    assert.equal(calls.length, 1, reply.body.code);
    assert.deepEqual(waits, []);
  }
  const { client, calls } = scriptedCentral([CONCURRENT, CONCURRENT, RECEIPT]);
  await assert.rejects(client.summary('000'), { status: 409, code: 'CONCURRENT_SUBMIT' });
  await assert.rejects(client.personToday('000', { source: 'member', value: '000-0001' }), { code: 'CONCURRENT_SUBMIT' });
  assert.equal(calls.length, 2); // หนึ่งครั้งต่อ GET
  assert.ok(calls.every((c) => c.method === 'GET' && c.body === undefined));
});

test('โหมดจริง: CONCURRENT_SUBMIT ผ่าน HTTP จริง: ยิงสองครั้งพร้อม credential ใน header แล้วส่ง 409 ต่อ', async () => {
  let n = 0;
  const central = await fakeCentral(() => (++n <= 2 ? CONCURRENT : RECEIPT));
  try {
    const client = createCentralClient({ baseUrl: central.url, credential: CREDENTIAL, sleep: async () => {} });
    await assert.rejects(client.recordEvidence('000', evidenceRequest()), { status: 409, code: 'CONCURRENT_SUBMIT' });
    assert.equal(central.seen.length, 2);
    assert.ok(central.seen.every((r) => r.auth === `Bearer ${CREDENTIAL}`));
  } finally {
    await central.close();
  }
});

// ---------- ระบบกลางจำลอง ----------

test('ตัดวันตามเขตเวลาของสาขา ไม่ใช่นาฬิกาเครื่อง', () => {
  const instant = new Date('2027-01-01T02:00:00Z'); // 09:00 ที่ไทย · 21:00 ของวันก่อนที่โตรอนโต
  assert.equal(localDate('Asia/Bangkok', instant), '2027-01-01');
  assert.equal(localDate('America/Toronto', instant), '2026-12-31');
});

test('batch ที่มีรายการผิดไม่บันทึกอะไรเลย (all-or-nothing) และ 3 ช่วงครบ = 15 นาที', () => {
  const central = createMockCentral({ timezone: 'Asia/Bangkok' });
  const person = { source: 'demo', value: '000-0003' };
  const env = (id, slot) => ({ evidence_id: id, kind: 'practice_session', slot, person_ref: person });
  const req = (batch, envelopes) => ({ contract_version: 'campaign.v1', branch: '000', batch_ref: batch, envelopes });

  let r = central.recordEvidence('000', req('b1', [env('e1', 'morning'), env('e2', 'night')]));
  assert.equal(r.committed, false);
  assert.equal(central.summary('000').total_minutes, 0);

  r = central.recordEvidence('000', req('b2', [env('e1', 'morning'), env('e2', 'midday'), env('e3', 'evening')]));
  assert.equal(r.committed, true);
  assert.equal(central.personToday('000', person).minutes_today, 15);

  assert.throws(
    () => central.recordEvidence('000', { ...req('b3', [env('e4', 'morning')]), branch: '001' }),
    { code: 'BRANCH_MISMATCH' },
  );
});
