// มาตรฐาน QA ของ อ.เต้: จอมือถือกว้าง 390px และขยายตัวอักษร 1.6 เท่า ต้องไม่ล้นจอแนวนอน
// รันแอปจริงด้วย Node (โหมดตัวอย่าง) แล้วเปิดด้วย Chrome · ภาพหน้าจอเก็บที่ artifacts/
// รัน: npm run test:mobile   (ตั้ง CHROME_PATH ได้ ถ้า Chrome ไม่ได้อยู่ที่ /usr/bin/google-chrome)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const WIDTH = 390;
const TEXT_SCALE = 1.6;

let server;
let baseUrl;
let browser;

before(async () => {
  if (!existsSync(chromePath)) return;
  server = spawn(process.execPath, ['deploy/node.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', WP_CENTRAL_URL: '', WP_APP_CREDENTIAL: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server ไม่ขึ้นใน 10 วินาที')), 10_000);
    server.stdout.on('data', (chunk) => {
      const m = String(chunk).match(/http:\/\/localhost:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
  });
  browser = await chromium.launch({ executablePath: chromePath });
  await mkdir(`${root}/artifacts`, { recursive: true });
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function assertNoHorizontalOverflow(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert.ok(scrollWidth <= innerWidth, `${label}: กว้าง ${scrollWidth}px เกินจอ ${innerWidth}px`);
}

test(`จอ ${WIDTH}px · ตัวอักษร ${TEXT_SCALE}× ไม่ล้นจอทุกสถานะหลัก`, { skip: !existsSync(chromePath) && 'ไม่พบ Chrome' }, async () => {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`${baseUrl}/?fast=1`);
  // ขยายตัวอักษรผ่าน CSSOM (ไม่ฉีด <style>) เพื่อให้ CSP ของแอปยังบังคับใช้ระหว่างเทสต์
  await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%`; }, TEXT_SCALE);
  await page.waitForSelector('#campaign:not([hidden])');
  await page.waitForFunction(() => document.getElementById('stat-total').textContent !== '–');
  await assertNoHorizontalOverflow(page, 'หน้าแรก');
  await page.screenshot({ path: `${root}/artifacts/mobile-1-home.png`, fullPage: true });

  await page.fill('#member', '000-0001');
  await page.click('#member-form button[type=submit]');
  await page.waitForSelector('#slots:not([hidden]) li');
  await assertNoHorizontalOverflow(page, 'รายการช่วง');
  await page.screenshot({ path: `${root}/artifacts/mobile-2-slots.png`, fullPage: true });

  await page.click('#slots li:first-child button');
  await page.waitForSelector('#timer:not([hidden])');
  assert.ok(await page.isHidden('#slots'), 'ระหว่างจับเวลาต้องซ่อนรายการช่วง');
  await assertNoHorizontalOverflow(page, 'ตัวจับเวลา');
  await page.screenshot({ path: `${root}/artifacts/mobile-3-timer.png`, fullPage: true });

  // ?fast=1 = 10 วินาที แล้วบันทึกอัตโนมัติ
  await page.waitForSelector('.message.ok', { timeout: 20_000 });
  assert.match(await page.textContent('#practice-message'), /บันทึกช่วงเช้าแล้ว/);
  await page.waitForFunction(() => document.getElementById('stat-total').textContent === '5');
  await assertNoHorizontalOverflow(page, 'หลังบันทึก');
  await page.screenshot({ path: `${root}/artifacts/mobile-4-recorded.png`, fullPage: true });

  assert.deepEqual(errors, [], 'มี error ใน console ของหน้าเว็บ');
  await page.close();
});
