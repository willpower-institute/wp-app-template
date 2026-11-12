// ตัวเชื่อมระบบกลางจริง (โหมด live) — คุยแบบ server ต่อ server ด้วย app credential ของสาขา
// credential ไม่เคยออกจากไฟล์นี้: ไม่ส่งให้เบราว์เซอร์ ไม่เขียนลง log ไม่ใส่ใน error
// path ตามร่าง contract `campaign.v1` (contract/campaign.v1.md) — จะปรับเมื่อระบบกลางออก contract จริง

import { ContractError } from '../contract/mock-central.js';

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const TIMEOUT_MS = 8000;

export function createCentralClient({ baseUrl, credential, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/+$/, '');

  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${credential}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
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
