# AGENTS.md: wp-app-template

> กติกากลางของทุก repo: Knowledge Standard ขององค์กร (ร่าง v0.2 อยู่ใน repo กลางแบบ private) · ไฟล์นี้บันทึกเฉพาะกติกาของ repo นี้
> Metadata: [`repo.yaml`](repo.yaml) · last_reviewed: 2026-11-12

## repo นี้คืออะไร

แม่แบบแอปของ **สาขา** สถาบันพลังจิตตานุภาพ · สาขากด deploy เองบน Cloudflare / Vercel / Google แล้วต่อยอดได้
แอปเชื่อมระบบกลาง (pstack + addon ต่อโดเมน เช่น pstack-lms, pstack-vidhisa) ผ่าน contract เท่านั้น

- เป็น "reference frontend กลาง" ตาม ADR-0001 ของ `willpower-institute/pstack`
- **ไม่ใช่** `pstack-app-template` — ตัวนั้นสำหรับทีมอนุฯ IT สร้าง addon ของระบบกลาง (Python + Docker)

## กติกาที่ห้ามละเมิด (ทั้งคนและ AI)

1. **token อยู่ใน server เท่านั้น** — อ่านจาก env `WP_TOKEN` ใน `server/` · ห้ามอยู่ใน `public/`, `wp.config.js`,
   ข้อความ error, log หรือ response ใด ๆ · เทสต์ `tests/no-secret.test.js` และเทสต์โหมดจริงจับเรื่องนี้
2. **หน้าเว็บและ server ของแอปไม่คิดผลเอง** — นาที ยอด เพดาน อันดับ วันที่ เป็นของระบบกลาง ·
   แอปส่ง evidence ดิบตาม contract แล้วแสดงตามที่ระบบกลางตอบ · ข้อยกเว้นเดียวคือ `contract/mock-central.js` ที่เล่นบทระบบกลาง
3. **ตั้งค่าครึ่งเดียว = ปฏิเสธ** — มี URL ไม่มี token (หรือกลับกัน) ต้องตอบ 503 ไม่ถอยไปโหมดตัวอย่าง
4. **ไม่เดาเรื่องที่ยังไม่ตัดสิน** — เช่นวิธียืนยันตัวตนสมาชิก · ปิดไว้ (`MEMBER_AUTH_NOT_DECIDED`) จนกว่าระบบกลางออก contract
5. **ระบบกลางเป็นเจ้าของ contract** — `contract/campaign.v1.md` เป็นร่างฝั่งแอป · เมื่อระบบกลางออกของจริง แก้ตามระบบกลาง
6. ทุก `/api/*` ส่ง error เป็น `{ "code": "ตัวพิมพ์ใหญ่" }` ไม่ส่งรายละเอียดจากระบบกลางต่อ

## เมื่อสาขาสร้างแอปจาก template นี้

- แก้ `wp.config.js` (รหัสสาขา ชื่อ เขตเวลา สี โลโก้ โครงการที่เปิด) — ไม่ใส่ความลับ
- แก้ `repo.yaml` และไฟล์นี้ให้เป็นของสาขา (ชื่อ เจ้าของ วันที่ทบทวน)
- ต่อยอดหน้าเว็บใน `public/` ได้อิสระ ตราบที่ยังผ่านเทสต์ทั้งหมด

## รัน / เทสต์

- `npm install` แล้ว `npm run dev` → http://localhost:8080 (โหมดตัวอย่าง)
- `npm test` — server, contract จำลอง, กันความลับรั่ว
- `npm run test:mobile` — จอ 390px ตัวอักษร 1.6 เท่าไม่ล้นจอ (ต้องมี Chrome · ตั้ง `CHROME_PATH` ได้) · ภาพอยู่ที่ `artifacts/`
- `npm run dev:cf` — รันบน workerd แบบ Cloudflare · ค่า env ใส่ใน `.dev.vars` (ไม่ commit)

## โครงสร้าง

| ที่ | หน้าที่ |
|---|---|
| `public/` | หน้าเว็บ (HTML/CSS/JS ล้วน ไม่มีขั้น build) |
| `server/app.js` | Hono: `/api/health` `/api/config` `/api/campaign/*` |
| `server/central.js` | ตัวเชื่อมระบบกลางจริง (ถือ token) |
| `contract/` | ร่าง contract + ระบบกลางจำลอง |
| `deploy/cloudflare.js` · `api/index.js` · `deploy/node.js` | ทางเข้าของ Cloudflare · Vercel · Node/Cloud Run |
| `wrangler.jsonc` · `vercel.json` · `Dockerfile` + `app.json` | config ของแต่ละแพลตฟอร์ม |

เพิ่มโครงการใหม่ (เช่น LMS): เพิ่ม route ใน `server/app.js` แยก Hono sub-app ต่อโครงการ · ตัวเชื่อมใน `server/` ·
contract ใน `contract/` · ช่องเปิด/ปิดใน `wp.config.js` · เทสต์ทั้งโหมดตัวอย่างและโหมดจริง

## ยังไม่รู้ / TBD

- ผู้อนุมัติฝั่งคนของ template นี้: TBD
- license: TBD
- ยังไม่ได้กดปุ่ม deploy จริงบนทั้งสามแพลตฟอร์ม (ทดสอบแล้ว: Node, workerd ผ่าน `wrangler dev`, handler ของ Vercel แบบจำลอง)
