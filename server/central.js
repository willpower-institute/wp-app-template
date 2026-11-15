// ตัวเชื่อมระบบกลางจริง (โหมด live) — คุยแบบ server ต่อ server ด้วย app credential ของสาขา
// credential ไม่เคยออกจากไฟล์นี้: ไม่ส่งให้เบราว์เซอร์ ไม่เขียนลง log ไม่ใส่ใน error
// path ตามร่าง contract `campaign.v1` (contract/campaign.v1.md) — จะปรับเมื่อระบบกลางออก contract จริง
// 409 CONCURRENT_SUBMIT ของ POST evidence (v0.4): ไม่มีอะไรถูกบันทึก → รอสั้น ๆ แล้วส่ง body เดิมทุกไบต์ซ้ำครั้งเดียว ·
// รหัสอื่นและ GET ไม่ retry

import { ContractError } from '../contract/mock-central.js';

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const TIMEOUT_MS = 8000;
const RETRY_CODE = 'CONCURRENT_SUBMIT';

const defaultRetryDelayMs = () => 200 + Math.floor(Math.random() * 301); // 200–500 ms
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createCentralClient({
  baseUrl,
  credential,
  fetchImpl = fetch,
  // เทสต์ใส่ค่าแทนได้ เพื่อไม่ต้องรอจริง
  retryDelayMs = defaultRetryDelayMs,
  sleep = defaultSleep,
}) {
  const base = baseUrl.replace(/\/+$/, '');

  async function call(method, path, body) {
    // serialize ครั้งเดียว: การส่งซ้ำใช้ body เดิมทุกไบต์ ระบบกลางจึงตอบ replay หรือ commit ได้ถูก
    const payload = body ? JSON.stringify(body) : undefined;
    try {
      return await send(method, path, payload);
    } catch (err) {
      if (method !== 'POST' || !(err instanceof ContractError) || err.status !== 409 || err.code !== RETRY_CODE) {
        throw err;
      }
    }
    await sleep(retryDelayMs());
    return send(method, path, payload); // ครั้งเดียว · ชนอีกก็ส่ง 409 CONCURRENT_SUBMIT ต่อ
  }

  async function send(method, path, payload) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${credential}`,
          accept: 'application/json',
          ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ContractError(503, 'CENTRAL_UNREACHABLE');
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok && data) return data;

    // credential ผิด/หมดอายุ/ถูกถอน — ไม่บอกรายละเอียดต่อ เพราะผู้ใช้ปลายทางแก้เองไม่ได้
    if (res.status === 401) throw new ContractError(502, 'CENTRAL_AUTH_FAILED');
    const code = data && typeof data.code === 'string' && CODE_PATTERN.test(data.code) ? data.code : 'CENTRAL_ERROR';
    const status = res.status >= 500 || !res.status ? 502 : res.status;
    throw new ContractError(status, code);
  }

  const branchPath = (branch) => `/campaign/v1/branches/${encodeURIComponent(branch)}`;

  return {
    summary: (branch) => call('GET', `${branchPath(branch)}/summary`),
    personToday: (branch, ref) =>
      call('GET', `${branchPath(branch)}/people/${encodeURIComponent(`${ref.source}:${ref.value}`)}/today`),
    recordEvidence: (branch, req) => call('POST', `${branchPath(branch)}/evidence`, req),
  };
}
