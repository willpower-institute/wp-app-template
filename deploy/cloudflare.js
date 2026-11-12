// Cloudflare Workers: หน้าเว็บใน public/ เสิร์ฟจาก Static Assets (wrangler.jsonc)
// request ที่ไม่ตรงกับไฟล์ใด ๆ (เช่น /api/*) จะมาถึง Worker นี้ · env อ่านจาก secret ของ Worker
import { createApp } from '../server/app.js';

export default createApp();
