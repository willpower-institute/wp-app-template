# wp-app-template

แม่แบบแอปของสาขา สถาบันพลังจิตตานุภาพ — **กดปุ่มเดียว deploy ได้เองบน Cloudflare, Vercel หรือ Google**
ใช้งานได้ทันทีในโหมดตัวอย่าง ขอเข้าร่วมโครงการแล้วได้ app credential มาเชื่อมระบบกลาง ปรับหน้าตาและต่อยอดเองได้ภายหลัง

> สถานะ: **v0.1 ร่าง** — โครงการแรกคือแคมเปญสะสมนาที (วิทิสาสมาธิ) · ระบบกลางยังไม่เปิด endpoint ตาม contract ·
> ขั้นขอเข้าร่วมโครงการยังไม่เปิด · รายละเอียดที่ [ข้อจำกัด](#ข้อจำกัดของ-v01)

## แอปนี้อยู่ตรงไหน

```
เบราว์เซอร์ ──► แอปของสาขา (repo นี้) ──► ระบบกลาง (pstack · ทีมอนุฯ IT ดูแลและสำรอง)
               หน้าเว็บ + server เล็ก        กติกา · คะแนน · ยอด · ข้อมูลส่วนบุคคล
               ถือ app credential
```

- **สาขาถือแค่หน้าจอ** — กติกา ยอด และข้อมูลส่วนบุคคลอยู่ที่ระบบกลาง (ADR-0001 ของ `willpower-institute/pstack`)
- **app credential ไม่เคยไปถึงเบราว์เซอร์** — server เล็กของแอปเป็นคนถือและคุยกับระบบกลางแทน
- repo นี้ต่างจาก [`pstack-app-template`](https://github.com/willpower-institute/pstack-app-template):
  ตัวนั้นใช้สร้าง addon ของระบบกลาง ส่วนตัวนี้ใช้สร้างแอปของสาขา

## Deploy ใน 5 นาที

เลือกแพลตฟอร์มเดียว กดปุ่ม แล้วทำตามหน้าจอ (ต้องมีบัญชี GitHub และบัญชีของแพลตฟอร์มนั้น)

| แพลตฟอร์ม | ปุ่ม | สิ่งที่เกิดขึ้น |
|---|---|---|
| Cloudflare | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/willpower-institute/wp-app-template) | คัดลอก repo ไปไว้ในบัญชี GitHub ของสาขา แล้ว deploy เป็น Worker |
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwillpower-institute%2Fwp-app-template&project-name=wp-app) | คัดลอก repo ไปไว้ในบัญชี Git ของสาขา แล้ว deploy |
| Google Cloud | [![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run/?git_repo=https://github.com/willpower-institute/wp-app-template) | เปิด Cloud Shell สร้าง container จาก `Dockerfile` แล้ว deploy ขึ้น Cloud Run (ต้องเปิด billing) |

deploy เสร็จจะได้แอปใน **โหมดตัวอย่าง**: ลองบันทึกสมาธิได้ครบ แต่ข้อมูลไม่นับเข้ายอดจริงและหายเมื่อแอปรีสตาร์ต

ขั้นต่อไป: แก้ `wp.config.js` ใน repo ที่ได้ (รหัสสาขา ชื่อ สี โลโก้) แล้ว push — แพลตฟอร์มจะ deploy ใหม่ให้เอง

## เชื่อมระบบกลาง

คำสามคำที่ใช้คู่กันเสมอ:

| คำ | บอกว่า | ใครถือ |
|---|---|---|
| **app credential** | คำขอมาจาก *แอปไหน* (แอปของสาขา X) | server เล็กของแอป — ไม่เคยถึงเบราว์เซอร์ |
| **member session** | *ใคร* เป็นคนกด (สมาชิกคนไหน) | เบราว์เซอร์ของสมาชิก · ยังไม่ได้ตกลงรูปแบบ |
| **grant** | แอปนั้น *ทำอะไรได้* (โครงการไหน · หมดอายุเมื่อไร) | ระบบกลาง (pstack-willpower) |

ไม่ใช้คำว่า "client token" เพราะ "client" ในเอกสารของเราหมายถึงฝั่งหน้าเว็บ ซึ่งเป็นฝั่งที่ห้ามถือ credential

1. ยื่นคำขอเข้าร่วมโครงการกับระบบกลาง (สาขา · โครงการ · URL ของแอป) — *ช่องทางยังไม่เปิด*
2. หัวหน้าทีมอนุฯ IT อนุมัติ → ระบบกลางออก grant ต่อ (สาขา × โครงการ) และ app credential ให้แอป แสดงครั้งเดียว
3. ใส่สองค่านี้ในหน้าตั้งค่าของแพลตฟอร์ม แล้ว deploy ใหม่

| ชื่อ | ค่า | เป็นความลับ |
|---|---|---|
| `WP_CENTRAL_URL` | ที่อยู่ระบบกลาง (ต้องเป็น `https://`) | ไม่ |
| `WP_APP_CREDENTIAL` | app credential ที่ได้ในข้อ 2 | **ใช่** |

- Cloudflare: Worker → Settings → Variables and Secrets → เลือกชนิด **Secret** สำหรับ `WP_APP_CREDENTIAL`
- Vercel: Project → Settings → Environment Variables → แล้ว Redeploy
- Google Cloud Run: เก็บ `WP_APP_CREDENTIAL` ใน Secret Manager แล้วผูกเป็น env ของ service

กติกา: ใส่ครบทั้งสองค่า = โหมดจริง · ไม่ใส่ทั้งคู่ = โหมดตัวอย่าง · **ใส่ค่าเดียว = แอปปฏิเสธทุกคำขอ** (กันเข้าใจผิดว่าเชื่อมแล้ว)
app credential หลุดหรือสงสัยว่าหลุด → แจ้งทีมอนุฯ IT ให้ถอนแล้วออกใหม่ ไม่กระทบสาขาอื่น

> template นี้ไม่มีไฟล์ `.env.example` โดยตั้งใจ — ปุ่มของ Cloudflare จะอ่านไฟล์นั้นแล้วบังคับถาม credential ตอน deploy
> ทั้งที่สาขายังไม่มี credential

## ปรับแต่งและต่อยอด

- **ค่าของสาขา:** `wp.config.js` — ห้ามใส่ความลับ ทุกค่าถูกส่งให้เบราว์เซอร์
- **หน้าเว็บ:** `public/` เป็น HTML/CSS/JS ล้วน ไม่มีขั้น build แก้แล้ว push ได้เลย
- **ใช้ AI ช่วย:** ให้ AI อ่าน [`AGENTS.md`](AGENTS.md) ก่อน ในนั้นมีกติกาที่ห้ามละเมิด
  (app credential อยู่ใน server เท่านั้น · แอปไม่คิดคะแนนเอง ฯลฯ) และเทสต์จะจับถ้าละเมิด
- **สิ่งที่ห้ามทำ:** คิดนาที ยอด หรืออันดับในแอป · ใส่ app credential ในหน้าเว็บ · ต่อฐานข้อมูลของระบบกลางตรง

## รันบนเครื่อง

```bash
npm install
npm run dev            # http://localhost:8080 โหมดตัวอย่าง (เพิ่ม ?fast=1 ให้ตัวจับเวลาเหลือ 10 วินาที)
npm test               # server · contract จำลอง · กันความลับรั่ว
npm run test:mobile    # จอ 390px ตัวอักษร 1.6 เท่า ไม่ล้นจอ (ต้องมี Chrome) · ภาพอยู่ที่ artifacts/
npm run dev:cf         # รันแบบ Cloudflare (workerd) · env ใส่ใน .dev.vars
```

## โครงสร้าง

```
public/                หน้าเว็บ
server/app.js          /api/health · /api/config · /api/campaign/*
server/central.js      ตัวเชื่อมระบบกลางจริง (ถือ app credential)
contract/              ร่าง contract campaign.v1 + ระบบกลางจำลองสำหรับโหมดตัวอย่าง
deploy/cloudflare.js   ทางเข้า Cloudflare   (wrangler.jsonc)
api/index.js           ทางเข้า Vercel       (vercel.json)
deploy/node.js         ทางเข้า Node / Cloud Run (Dockerfile · app.json)
wp.config.js           ค่าของสาขา
```

## ข้อจำกัดของ v0.1

- **ระบบกลางยังไม่มี endpoint ของ `campaign.v1`** — `contract/campaign.v1.md` เป็นร่างฝั่งแอป ตามแบบ
  `docs/BRANCH_FRONTEND_INTEGRATION.md` ของ pstack-lms · จะแก้ตามเมื่อระบบกลางออกของจริง
- **ยังไม่ได้ตกลงวิธียืนยันตัวตนสมาชิก** — โหมดจริงจึงแสดงได้แค่ยอดรวม การบันทึกรายคนปิดไว้ (`MEMBER_AUTH_NOT_DECIDED`)
- **ยังไม่ได้กดปุ่ม deploy จริงทั้งสามแพลตฟอร์ม** — ทดสอบแล้วบน Node, workerd (`wrangler dev`) และ handler ของ Vercel แบบจำลอง
- โครงการถัดไป (LMS ครูสมาธิ/วิทันตสา, งาน QR, หน่วยงาน/โรงเรียน) ยังไม่มี

## อ้างอิง

- ADR-0001: `willpower-institute/pstack` · `docs/adr/0001-branch-frontend-central-backend.md`
- รูปแบบการเชื่อม: `willpower-institute/pstack-lms` · `docs/BRANCH_FRONTEND_INTEGRATION.md`
- กติกาและ requirement ของแคมเปญ 76M: ต้นแบบ vitisa76m (หน้า overview) · กระทู้ `dis-174e74f7` บนโต๊ะกลาง
