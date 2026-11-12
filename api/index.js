// Vercel: หน้าเว็บใน public/ เสิร์ฟเป็นไฟล์นิ่ง · /api/* ถูก rewrite มาที่ function นี้ (vercel.json)
import { handle } from 'hono/vercel';
import { createApp } from '../server/app.js';

export const config = { runtime: 'edge' };

export default handle(createApp({ readEnv: () => process.env }));
