// กันความลับหลุดไปฝั่งเบราว์เซอร์: ทุกไฟล์ใน public/ ถูกเสิร์ฟให้ทุกคนอ่านได้
// และ wp.config.js ถูกส่งออกผ่าน /api/config — ห้ามมี app credential ทั้งสองที่

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../wp.config.js';

const root = fileURLToPath(new URL('..', import.meta.url));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const SUSPICIOUS = [
  /WP_(APP_CREDENTIAL|TOKEN)/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/,
  /\bpsk_[A-Za-z0-9_-]{8,}/, // รูปแบบ API key ของ pstack
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

test('ไฟล์ใน public/ ไม่อ้าง credential หรือมีรูปแบบความลับ', async () => {
  for (const file of await walk(join(root, 'public'))) {
    const text = await readFile(file, 'utf8');
    for (const pattern of SUSPICIOUS) {
      assert.ok(!pattern.test(text), `${file} ตรงกับ ${pattern}`);
    }
  }
});

test('wp.config.js ไม่มีช่องที่ชื่อเหมือนความลับ', () => {
  const bad = /token|secret|password|api[_-]?key|credential/i;
  const visit = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(!bad.test(k), `wp.config.js มีช่อง ${path}${k}`);
      if (v && typeof v === 'object') visit(v, `${path}${k}.`);
    }
  };
  visit(config, '');
});
