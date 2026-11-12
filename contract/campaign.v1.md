# campaign.v1 — ร่าง contract ระหว่างแอปสาขากับระบบกลาง (แคมเปญสะสมนาที)

สถานะ: **ร่าง v0.1 ฝั่งแอป** — ระบบกลางยังไม่มี endpoint เหล่านี้ · ไฟล์นี้เขียนจากฝั่งที่ใช้
เพื่อให้แอปสาขาเริ่มได้ด้วยระบบกลางจำลอง (`mock-central.js`) · เมื่อทีมระบบกลางออก contract จริง
ให้ยึดของระบบกลางและแก้ไฟล์นี้ตาม ไม่ใช่กลับกัน

ที่มา: ADR-0001 ของ `willpower-institute/pstack` (สาขาส่ง evidence ดิบ · ระบบกลางคิดผล) ·
รูปแบบเดียวกับ `docs/BRANCH_FRONTEND_INTEGRATION.md` ของ `willpower-institute/pstack-lms`
(batch_ref · ส่งซ้ำได้ · all-or-nothing · รหัสปฏิเสธเป็นตัวพิมพ์ใหญ่) เพื่อให้สาขาเรียนรู้ครั้งเดียวใช้ได้ทุกโครงการ ·
กติกาแคมเปญตามหน้า overview ของต้นแบบ vitisa76m

## 1. บทบาท

- **แอปสาขา** ส่ง evidence ดิบ: "คน X นั่งครบหนึ่งช่วง ช่วงเช้า" · ไม่ส่งนาที วันที่ หรือคะแนน
- **ระบบกลาง** ถือกติกา (version ตามวันมีผล) · ตัดวันตามเขตเวลาของสาขา · คิดนาที เพดานต่อวัน ยอด และอันดับ

## 2. การยืนยันตัวตน

- **แอป:** `Authorization: Bearer <token>` · token หนึ่งชุดผูก (สาขา × โครงการ) ออกโดยระบบกลางหลังอนุมัติคำขอเข้าร่วม ·
  เก็บเป็น secret ของแพลตฟอร์ม ใช้จาก server ของแอปเท่านั้น
- **สมาชิก:** ยังไม่ตัดสิน (login ที่ระบบกลางทั้งหมด หรือสาขามี login เอง) · ระหว่างนี้แอปปิดการบันทึกรายคนในโหมดจริง
  (`MEMBER_AUTH_NOT_DECIDED`) · `person_ref.source = "demo"` ใช้ได้กับระบบกลางจำลองเท่านั้น

## 3. Endpoint (ฝั่งระบบกลาง)

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| `GET` | `/campaign/v1/branches/{branch}/summary` | ยอดรวม · วันนี้ · ผู้ร่วม · เป้า |
| `GET` | `/campaign/v1/branches/{branch}/people/{source}:{value}/today` | สถานะ 3 ช่วงของวันนี้ของคนหนึ่ง |
| `POST` | `/campaign/v1/branches/{branch}/evidence` | ส่ง evidence |

`POST` body:

```json
{
  "contract_version": "campaign.v1",
  "branch": "000",
  "batch_ref": "uuid-ที่แอปสร้างต่อการบันทึกหนึ่งครั้ง",
  "source_ref": "wp-app-template@0.1.0",
  "envelopes": [
    { "evidence_id": "uuid", "kind": "practice_session", "slot": "morning",
      "person_ref": { "source": "…", "value": "…" } }
  ]
}
```

ใบรับ: `{ batch_ref, committed, accepted: [{ evidence_id, date, slot, minutes }], rejected: [{ evidence_id, code }] }`

## 4. ส่งซ้ำ

- `batch_ref` เดิม + เนื้อหาเดิม = คืนใบรับเดิม (`replayed: true`) ยอดไม่เพิ่ม — แอปกดซ้ำตอนเน็ตหลุดได้
- `batch_ref` เดิม + เนื้อหาต่าง หลัง commit แล้ว = `BATCH_REF_REUSED`
- batch ที่ถูกปฏิเสธไม่ถูกจำ แก้แล้วส่งด้วย `batch_ref` เดิมได้
- มีรายการใดถูกปฏิเสธ = ไม่บันทึกทั้ง batch (`committed: false`)

## 5. รหัสปฏิเสธ

| รหัส | ความหมาย |
|---|---|
| `UNSUPPORTED_CONTRACT_VERSION` | ไม่ใช่ `campaign.v1` |
| `BRANCH_MISMATCH` | `branch` ไม่ตรงกับ path หรือกับ token |
| `INVALID_BATCH_REF` / `INVALID_ENVELOPES` / `INVALID_EVIDENCE_ID` / `INVALID_PERSON_REF` | รูปแบบผิด |
| `BATCH_REF_REUSED` | ดูข้อ 4 |
| `DUPLICATE_EVIDENCE_IN_BATCH` | `evidence_id` ซ้ำใน batch เดียว |
| `UNKNOWN_EVIDENCE_KIND` / `UNKNOWN_SLOT` | ไม่อยู่ในรายการที่รับ |
| `SLOT_ALREADY_RECORDED` | ช่วงนี้ของวันนี้บันทึกแล้ว |
| `DAILY_CAP_REACHED` | เกินเพดานต่อวัน |

## 6. ยังเปิดอยู่

1. วิธียืนยันตัวตนสมาชิก (ข้อ 2) — กำหนดว่า `person_ref` มาจากไหนในโหมดจริง
2. รหัสสมาชิก (เช่น 003-0006) เป็นแค่รหัส login หรือเป็น ref ในระบบกลางด้วย
3. งาน QR (บันทึกโดยไม่สมัคร) และหน่วยงาน/โรงเรียน — ต้องเพิ่ม `kind` และ endpoint
4. อันดับรายสาขา/จังหวัด และการแสดงชื่อตาม consent — endpoint อ่านเพิ่ม
