// ส่วน server เล็กของแอปสาขา (Hono) — รันได้ทั้ง Cloudflare Workers, Vercel และ Node (Cloud Run)
//
// หน้าที่มีแค่สามอย่าง:
//   1. ถือ token ของสาขา (secret ของแพลตฟอร์ม) แล้วคุยกับระบบกลางแทนเบราว์เซอร์
//   2. ส่ง evidence ดิบ (เช่น "นั่งครบ 5 นาที ช่วงเช้า") ตาม contract — ไม่คิดนาที ยอด หรืออันดับเอง
//   3. ส่งค่าสาธารณะใน wp.config.js ให้หน้าเว็บ
//
// ไม่มี WP_CENTRAL_URL และ WP_TOKEN = โหมดตัวอย่าง ใช้ระบบกลางจำลองใน contract/mock-central.js

import { Hono } from 'hono';
import { env as platformEnv } from 'hono/adapter';
import { secureHeaders } from 'hono/secure-headers';
import config from '../wp.config.js';
import { CONTRACT_VERSION, ContractError, createMockCentral } from '../contract/mock-central.js';
import { createCentralClient } from './central.js';

export const APP_VERSION = '0.1.0';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const MEMBER_PATTERN = /^[0-9A-Za-z-]{3,32}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const SLOTS = new Set(['morning', 'midday', 'evening']);

/** อ่านโหมดจาก env — ตั้งค่าครึ่งเดียวถือว่าผิด และปฏิเสธทุกคำขอ (ไม่ถอยไปโหมดตัวอย่างเงียบ ๆ) */
export function resolveMode(e = {}) {
  const url = String(e.WP_CENTRAL_URL ?? '').trim();
  const token = String(e.WP_TOKEN ?? '').trim();
  if (!url && !token) return { mode: 'demo' };
  if (!url) return { mode: 'misconfigured', reason: 'CENTRAL_URL_MISSING' };
  if (!token) return { mode: 'misconfigured', reason: 'TOKEN_MISSING' };
  let u;
  try {
    u = new URL(url);
  } catch {
    return { mode: 'misconfigured', reason: 'CENTRAL_URL_INVALID' };
  }
  const httpOk = u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname));
  if (!httpOk) return { mode: 'misconfigured', reason: 'CENTRAL_URL_NOT_HTTPS' };
  return { mode: 'live', url, token };
}

/** ค่าที่ส่งให้เบราว์เซอร์ — เลือกเฉพาะ field ที่ประกาศไว้ ไม่ส่งทั้ง object */
export function publicConfig(cfg) {
  const projects = {};
  for (const [key, p] of Object.entries(cfg.projects ?? {})) {
    projects[key] = { enabled: Boolean(p.enabled), title: p.title ?? key, subtitle: p.subtitle ?? '' };
  }
  return {
    branch: {
      code: cfg.branch.code,
      name: cfg.branch.name,
      timezone: cfg.branch.timezone,
      contact: cfg.branch.contact ?? '',
    },
    theme: { ...cfg.theme },
    projects,
  };
}

export function createApp({ readEnv = (c) => platformEnv(c), cfg = config, mock } = {}) {
  const demoCentral = mock ?? createMockCentral({ timezone: cfg.branch.timezone });
  const branchCode = cfg.branch.code;
  const app = new Hono();

  app.use('/api/*', secureHeaders());
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('cache-control', 'no-store');
  });

  const modeOf = (c) => resolveMode(readEnv(c) ?? {});
  const backend = (c) => {
    const m = modeOf(c);
    if (m.mode === 'demo') return { mode: 'demo', central: demoCentral };
    if (m.mode === 'live') {
      return { mode: 'live', central: createCentralClient({ baseUrl: m.url, token: m.token }) };
    }
    throw new ContractError(503, m.reason);
  };

  app.get('/api/health', (c) => {
    const m = modeOf(c);
    return c.json({
      ok: m.mode !== 'misconfigured',
      mode: m.mode,
      ...(m.reason ? { reason: m.reason } : {}),
      app_version: APP_VERSION,
      contract_version: CONTRACT_VERSION,
    });
  });

  app.get('/api/config', (c) => c.json({ ...publicConfig(cfg), mode: modeOf(c).mode }));

  // ---- โครงการ: แคมเปญสะสมนาที (campaign.v1) ----
  const campaign = new Hono();
  campaign.use('*', async (c, next) => {
    if (!cfg.projects?.campaign?.enabled) return c.json({ code: 'PROJECT_DISABLED' }, 404);
    await next();
  });

  campaign.get('/summary', async (c) => {
    const { central } = backend(c);
    return c.json(await central.summary(branchCode));
  });

  // ตัวตนสมาชิกในโหมดจริงยังไม่ได้ตัดสิน (login ที่ระบบกลาง vs ที่สาขา) — ปิดไว้ก่อน ไม่เดา
  const demoMemberOnly = (c) => {
    const b = backend(c);
    if (b.mode !== 'demo') throw new ContractError(501, 'MEMBER_AUTH_NOT_DECIDED');
    return b.central;
  };

  campaign.get('/today', async (c) => {
    const central = demoMemberOnly(c);
    const member = c.req.query('member') ?? '';
    if (!MEMBER_PATTERN.test(member)) throw new ContractError(400, 'INVALID_MEMBER');
    return c.json(await central.personToday(branchCode, { source: 'demo', value: member }));
  });

  campaign.post('/practice', async (c) => {
    const central = demoMemberOnly(c);
    let body;
    try {
      body = await c.req.json();
    } catch {
      throw new ContractError(400, 'INVALID_JSON');
    }
    const { member, slot, event_id: eventId } = body ?? {};
    if (!MEMBER_PATTERN.test(member ?? '')) throw new ContractError(400, 'INVALID_MEMBER');
    if (!SLOTS.has(slot)) throw new ContractError(400, 'UNKNOWN_SLOT');
    if (!EVENT_ID_PATTERN.test(eventId ?? '')) throw new ContractError(400, 'INVALID_EVENT_ID');

    // evidence ดิบตาม contract: ไม่มีนาที ไม่มีวันที่ให้ผู้ใช้เลือก — ระบบกลางเป็นคนตัดสิน
    const request = {
      contract_version: CONTRACT_VERSION,
      branch: branchCode,
      batch_ref: eventId,
      source_ref: `wp-app-template@${APP_VERSION}`,
      envelopes: [
        {
          evidence_id: eventId,
          kind: 'practice_session',
          slot,
          person_ref: { source: 'demo', value: member },
        },
      ],
    };
    const receipt = await central.recordEvidence(branchCode, request);
    return c.json(receipt, receipt.committed ? 200 : 422);
  });

  app.route('/api/campaign', campaign);

  app.notFound((c) => c.json({ code: 'NOT_FOUND' }, 404));
  app.onError((err, c) => {
    if (err instanceof ContractError) return c.json({ code: err.code }, err.status);
    // ไม่พิมพ์ข้อความ error เต็ม — กันข้อมูลจากระบบกลางหลุดลง log ของแพลตฟอร์ม
    console.error('[wp-app] unexpected error:', err?.name ?? 'Error');
    return c.json({ code: 'INTERNAL_ERROR' }, 500);
  });

  return app;
}
