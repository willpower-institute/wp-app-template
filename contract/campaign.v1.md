# campaign.v1 — contract ระหว่างแอปสาขากับระบบกลาง (แคมเปญสะสมนาที)

สถานะ: **ร่าง v0.3** — ระบบกลางมีเครื่องนับแบบ pure แล้ว (pstack-vidhisa addon `minute_campaign`) แต่ยังไม่มี endpoint ·
**ไฟล์นี้เป็นฉบับหลัก เนื้อหาเป็นของระบบกลาง** (ทีมอนุฯ IT) · แก้ผ่านใบงานของระบบกลาง ·
ระบบกลางจำลอง `mock-central.js` ต้องตามไฟล์นี้ให้ตรง · `contract_version` ยังเป็น `"campaign.v1"`

ที่มา: ADR-0001 ของ `willpower-institute/pstack` (สาขาส่ง evidence ดิบ · ระบบกลางคิดผล) ·
รูปแบบเดียวกับ `docs/BRANCH_FRONTEND_INTEGRATION.md` ของ `willpower-institute/pstack-lms`
(batch_ref · ส่งซ้ำได้ · all-or-nothing · รหัสปฏิเสธเป็นตัวพิมพ์ใหญ่) เพื่อให้สาขาเรียนรู้ครั้งเดียวใช้ได้ทุกโครงการ ·
กติกาแคมเปญตามหน้า overview ของต้นแบบ vitisa76m

### สิ่งที่เปลี่ยนใน v0.3 (จาก v0.2)

ที่มา: brief `dis-54732ec6` #26 · เครื่องนับของระบบกลาง pstack-vidhisa `minute_campaign` (PR #1 @ `72d79a4`) ·
เพิ่มกติกา ไม่เปลี่ยนรูปข้อมูล

1. **`OUTSIDE_CAMPAIGN_PERIOD` (409 ระดับ batch):** วันที่ที่ระบบกลางรับ ตามเขตเวลาของสาขา อยู่นอกช่วงแคมเปญ ·
   ตรวจหลังขั้น replay — batch ที่ commit แล้วส่งซ้ำยังได้ใบรับเดิมแม้พ้นช่วงแล้ว (ข้อ 4, 5)
2. **`person_ref` ห้ามมีช่องว่างหน้าหรือหลัง:** `source` หรือ `value` ที่ไม่เท่ากับค่าที่ตัดช่องว่างแล้ว = `INVALID_PERSON_REF` ·
   ระบบกลาง**ไม่ตัดให้** — กันรหัสเดียวกันกลายเป็นหลายคนแล้วได้เพดานซ้อน (ข้อ 3.1, 5, 6)
3. **`batch_ref` นับต่อสาขา:** `batch_ref` เดียวกันคนละสาขาไม่เกี่ยวกัน (ข้อ 4)
4. **เขตเวลา:** วันที่ของแถวตามเขตเวลาของสาขา · `today_minutes` ตามเขตเวลาของแคมเปญ ·
   `branch.today_minutes` ตามเขตเวลาของสาขา (ข้อ 3.3)
5. **ตัวตน = `person_ref.value` (member_code)** ใช้ key เดียวกันทุกที่ — slot · เพดานต่อวัน · participants · สถิติรายคน · CSV ·
   `person_ref.source` ต้องอยู่ในรายการที่แคมเปญรับ (76m: `"member"` · โหมดตัวอย่าง: `"demo"`) นอกรายการ = `INVALID_PERSON_REF` ·
   ปิดข้อ 8.2 (ข้อ 3.1, 5, 8)

### สิ่งที่เปลี่ยนใน v0.2 (จาก v0.1)

ที่มา: brief `dis-54732ec6` #1 ค่าตั้งต้นข้อ 12–15 · กระทู้ออกแบบ `dis-f18e1c94` (ช่องทางเชื่อมของสาขา)

- envelope รับ `external_ref` ต่อแถว — แถวเดิมจากระบบต้นทางไม่นับซ้ำ ตอบเป็น `duplicates` (ข้อ 4)
- `kind: "group_report"` รายงานกลุ่มของหน่วยงานที่ลงทะเบียนกับสาขา (ข้อ 3.2) · รหัสปฏิเสธใหม่ของรายงานกลุ่ม external_ref และการแบ่งหน้า (ข้อ 5)
- API อ่าน: สถิติรายคน (แบ่งหน้า) และแถวรายวันแบบ CSV · ทุกคำตอบมี `as_of` (ข้อ 3.3)
- หัวข้อใหม่: ช่องทางเชื่อม 5 ทาง (ข้อ 6) · หน้าดูยอดสมาชิกสำหรับสาขาที่ไม่มีแดชบอร์ด (ข้อ 7)
- summary แยกยอด: `branch.minutes` / `branch.today_minutes` = นาทีรายคนของสาขาเท่านั้น · `group_minutes` = รายงานกลุ่มของสาขา ·
  `total_minutes` = ยอดรวมแคมเปญ (รวมทั้งสอง) — นาทีกลุ่มไม่นับเข้ายอดรายสาขาตามกติกา 49m (ข้อ 3.2, 3.3)
- ใบรับมี `duplicates` และ `as_of` เพิ่ม · ช่องเดิมไม่เปลี่ยน แอปที่ใช้ v0.1 ทำงานต่อได้

## 1. บทบาท

- **แอปสาขา** ส่ง evidence ดิบ: "คน X นั่งครบหนึ่งช่วง ช่วงเช้า" · ไม่ส่งนาที วันที่ หรือคะแนน
- **ระบบกลาง** ถือกติกา (version ตามวันมีผล) · ตัดวันตามเขตเวลาของสาขา · คิดนาที เพดานต่อวัน ยอด และอันดับ

## 2. การยืนยันตัวตน

- **แอป (app credential):** `Authorization: Bearer <app credential>` · credential ของแอปสาขา ใช้ได้เฉพาะ grant ที่ผูกไว้ (สาขา × โครงการ) ออกโดยระบบกลางหลังอนุมัติคำขอเข้าร่วม ·
  เก็บเป็น secret ของแพลตฟอร์ม ใช้จาก server ของแอปเท่านั้น
- **สมาชิก:** ยังไม่ตัดสิน (login ที่ระบบกลางทั้งหมด หรือสาขามี login เอง) · ระหว่างนี้แอปปิดการบันทึกรายคนในโหมดจริง
  (`MEMBER_AUTH_NOT_DECIDED`) · `person_ref.source = "demo"` ใช้ได้กับระบบกลางจำลองเท่านั้น

## 3. Endpoint (ฝั่งระบบกลาง)

| Method | Path | grant ที่ต้องมี | ใช้ทำอะไร |
|---|---|---|---|
| `GET` | `/campaign/v1/branches/{branch}/summary` | `branch.read` | ยอดรวม · วันนี้ · ผู้ร่วม · เป้า · `as_of` |
| `GET` | `/campaign/v1/branches/{branch}/people/{source}:{value}/today` | `branch.read` | สถานะ 3 ช่วงของวันนี้ของคนหนึ่ง |
| `GET` | `/campaign/v1/branches/{branch}/members?cursor=&limit=` | `branch.read` | สถิติรายคนของสาขา (ข้อ 3.3) |
| `GET` | `/campaign/v1/branches/{branch}/daily.csv?cursor=&limit=` | `branch.read` | แถวรายวันแบบ CSV (ข้อ 3.3) |
| `POST` | `/campaign/v1/branches/{branch}/evidence` | `branch.submit` | ส่ง evidence |

`branch.submit` ไม่ให้สิทธิ์อ่าน และ `branch.read` ไม่ให้สิทธิ์ส่ง (ตาม `pstack-willpower`) ·
แอปเต็มที่เข้าร่วมผ่านคำขอเข้าร่วมได้ทั้งสองใบ · แดชบอร์ดควรใช้ credential ที่มีแค่ `branch.read`

### 3.1 ส่ง evidence

`POST` body:

```json
{
  "contract_version": "campaign.v1",
  "branch": "000",
  "batch_ref": "uuid-ที่แอปสร้างต่อการบันทึกหนึ่งครั้ง",
  "source_ref": "wp-app-template@0.1.0",
  "envelopes": [
    { "evidence_id": "uuid", "kind": "practice_session", "slot": "morning",
      "person_ref": { "source": "…", "value": "…" },
      "external_ref": "ไม่บังคับ เช่น response ID ของ Google Form" }
  ]
}
```

- `external_ref` (ไม่บังคับ · ข้อความ 1–200 ตัว): รหัสของแถวในระบบต้นทาง ใช้กันนับซ้ำ (ข้อ 4)
- **ตัวตน = `person_ref.value`** (member_code) — slot · เพดานต่อวัน · participants · สถิติรายคน และ CSV ใช้ค่านี้เป็น key เดียวกัน ·
  รหัสเดียวกันที่ส่งมาต่าง `source` คือคนเดียวกัน
- `person_ref.source` ต้องอยู่ในรายการที่แคมเปญรับ ซึ่งระบบกลางประกาศต่อแคมเปญ — 76m: `"member"` = รหัสสมาชิกถาวรของระบบกลาง ·
  โหมดตัวอย่างของแอป: `"demo"` · นอกรายการ = `INVALID_PERSON_REF` · LINE userId **ไม่ใช่** source — ระบบกลางแปลง LINE เป็นรหัสสมาชิกเอง
- `person_ref.source` และ `person_ref.value` ต้องไม่ว่าง และ**ไม่มีช่องว่างหน้าหรือหลัง** (รวม tab/ขึ้นบรรทัด) —
  ไม่งั้นแถวนั้นได้ `INVALID_PERSON_REF` · ระบบกลางไม่ตัดให้ เพราะ `"000-0001"` กับ `"000-0001 "` จะกลายเป็นคนละคน
  แล้วได้เพดานต่อวันซ้อนกัน · `GET …/people/{source}:{value}/today` ใช้กติกาเดียวกัน (ผิด = 400 `INVALID_PERSON_REF`)
- วันที่ของแถว = วันที่ระบบกลางรับ ตามเขตเวลาของสาขาที่ส่ง · ต้องอยู่ในช่วงแคมเปญ ไม่งั้นทั้ง batch ได้ `OUTSIDE_CAMPAIGN_PERIOD`
- `source_ref` ของ batch ไปปรากฏในคอลัมน์ `source` ของ CSV — ใช้บอกว่าแถวมาจากช่องทางไหน

ใบรับ:

```json
{ "batch_ref": "…", "committed": true, "as_of": "ISO-8601",
  "accepted":   [{ "evidence_id": "…", "date": "YYYY-MM-DD", "slot": "morning", "minutes": 5 }],
  "duplicates": [{ "evidence_id": "…", "external_ref": "…", "duplicate_of": "evidence_id เดิม" }],
  "rejected":   [{ "evidence_id": "…", "code": "…" }] }
```

### 3.2 รายงานกลุ่ม (`kind: "group_report"`)

หน่วยงาน (โรงเรียน วัด บริษัท) ที่ทำกิจกรรมเป็นกลุ่มโดยสมาชิกไม่ได้บันทึกรายคน

```json
{ "evidence_id": "uuid", "kind": "group_report", "org_ref": "org-school-0001",
  "participant_count": 40, "minutes": 600, "external_ref": "ไม่บังคับ" }
```

- `org_ref` ต้องเป็นหน่วยงานที่**ลงทะเบียนกับสาขานั้นแล้ว**ที่ระบบกลาง (หน่วยงานของสาขาอื่นใช้ไม่ได้) → ไม่งั้น `ORG_NOT_REGISTERED`
- `participant_count` จำนวนเต็ม ≥ 1 ของคนที่ทำจริงในวันนั้น → ไม่งั้น `INVALID_PARTICIPANT_COUNT`
- `minutes` จำนวนเต็ม ≥ 1 (`INVALID_MINUTES`) และ ≤ `participant_count × 15` (เพดานต่อวันต่อคน) → ไม่งั้น `GROUP_MINUTES_OVER_CAP`
- หน่วยงาน × วัน ส่งได้ครั้งเดียว ทั้งข้าม batch และใน batch เดียว → `GROUP_REPORT_ALREADY_RECORDED`
- วันที่คือวันที่ระบบกลางรับ ตามเขตเวลาของสาขา (เหมือน `practice_session`)
- นับเข้ายอดรวมแคมเปญ (`total_minutes` / `today_minutes`) และแยกใน `group_minutes` ของสาขา ·
  **ไม่นับเข้ายอดรายสาขา** (`branch.minutes` / `branch.today_minutes`) · ไม่นับเป็นผู้ร่วมรายคน ไม่อยู่ในสถิติรายคนหรือ CSV รายคน
- เหตุผล: กติกาที่ 49m ใช้จริง — นาทีของหน่วยงานภายนอกนับเข้ายอดแคมเปญ แต่อันดับสาขาไม่ได้แต้มจากหน่วยงานที่สาขาบันทึกแทน

### 3.3 API อ่าน (อ่านอย่างเดียว)

ทุกคำตอบมี `as_of` (เวลาที่ระบบกลางคิดยอด) · ยอดทางการคิดที่ระบบกลางเท่านั้น ผู้อ่านห้ามคิดยอดทางการเอง

**เขตเวลา:** แต่ละสาขามีเขตเวลาของตัวเอง (สาขาต่างประเทศ) และแคมเปญมีเขตเวลาของแคมเปญ ·
วันที่ของแถว = วันตามเขตเวลาของสาขาที่ส่ง · `today_minutes` = แถวที่วันที่ตรงกับวันนี้ตามเขตเวลาของ**แคมเปญ** ·
`branch.today_minutes` = แถวของสาขานี้ที่วันที่ตรงกับวันนี้ตามเขตเวลาของ**สาขา** · เมื่อข้ามวัน แถวของเมื่อวานไม่อยู่ใน today

**ยอดสาขา** `GET …/summary`:

```json
{ "as_of": "ISO-8601", "target_minutes": 76000000,
  "total_minutes": 0, "today_minutes": 0, "participants": 0,
  "group_minutes": 0,
  "branch": { "code": "000", "minutes": 0, "today_minutes": 0 } }
```

| ช่อง | ความหมาย |
|---|---|
| `total_minutes` / `today_minutes` | ยอดรวมแคมเปญ ทั้งหมด / วันนี้ — รวมรายคนและรายงานกลุ่ม |
| `group_minutes` | นาทีรายงานกลุ่มของสาขานี้ (แยกไว้ ไม่อยู่ใน `branch.minutes`) |
| `branch.minutes` / `branch.today_minutes` | นาที**รายคน**ของสาขานี้ ทั้งหมด / วันนี้ — ใช้จัดอันดับสาขา |

**แบ่งหน้า:** `limit` จำนวนเต็ม 1–500 (ไม่ใส่ = 100 · เกินหรือผิดรูป = `INVALID_LIMIT`) ·
`cursor` เป็นค่าทึบที่ได้จากหน้าก่อน (ผิดรูป = `INVALID_CURSOR`) · ไล่ตาม key ที่เรียงคงที่ แถวใหม่ระหว่างไล่จึงไม่ทำให้ซ้ำหรือตก ·
ไม่มีหน้าถัดไป = `next_cursor: null`

**สถิติรายคน** `GET …/members`:

```json
{ "as_of": "ISO-8601", "branch": { "code": "000" }, "next_cursor": "…|null",
  "items": [{ "member_code": "000-0001", "total_minutes": 450, "active_days": 30,
              "last_active_date": "YYYY-MM-DD", "official_status": "none" }] }
```

- เรียงตาม `member_code` · **ไม่มีชื่อหรือเบอร์โทร**
- `official_status` ระบบกลางเป็นผู้คิด · ตอนนี้เป็น `none` เสมอเพราะยังไม่มีเกณฑ์เกียรติบัตร

**แถวรายวัน** `GET …/daily.csv`:

- `content-type: text/csv; charset=utf-8` · เนื้อหาขึ้นต้นด้วย UTF-8 BOM (Excel/Sheets อ่านภาษาไทยถูก) · บรรทัดคั่นด้วย CRLF
- คอลัมน์: `date,member_code,slot,minutes,source` · ทุกหน้ามีบรรทัดหัว · เรียงตาม date, member_code, slot
- `as_of` อยู่ใน header `X-Campaign-As-Of` · หน้าถัดไปอยู่ใน `X-Campaign-Next-Cursor` (ไม่มี = หน้าสุดท้าย)
- ค่าที่ขึ้นต้นด้วย `= + - @` ถูกนำหน้าด้วย `'` กันสูตรทำงานในชีต
## 4. ส่งซ้ำ

- `batch_ref` **นับต่อสาขา** — `batch_ref` เดียวกันคนละสาขาไม่เกี่ยวกัน · สาขาหนึ่งไม่รู้ว่าสาขาอื่นใช้ `batch_ref` อะไร
- `batch_ref` เดิม + เนื้อหาเดิม = คืนใบรับเดิม (`replayed: true`) ยอดไม่เพิ่ม — แอปกดซ้ำตอนเน็ตหลุดได้ ·
  ได้ใบรับเดิมแม้พ้นช่วงแคมเปญแล้ว (ตรวจ replay ก่อน `OUTSIDE_CAMPAIGN_PERIOD`)
- `batch_ref` เดิม + เนื้อหาต่าง หลัง commit แล้ว = `BATCH_REF_REUSED`
- batch ที่ถูกปฏิเสธไม่ถูกจำ แก้แล้วส่งด้วย `batch_ref` เดิมได้
- มีรายการใดถูกปฏิเสธ = ไม่บันทึกทั้ง batch (`committed: false`)
- **`external_ref` ต่อแถว:** แถวที่ `external_ref` เคยถูกรับแล้ว**ในสาขาเดียวกัน** (ข้าม batch) หรือซ้ำกับแถวก่อนหน้าใน batch เดียวกัน
  ไม่นับซ้ำ · ไม่ใช่ rejection · อยู่ใน `duplicates` พร้อม `duplicate_of` = evidence_id ของแถวที่รับไว้ ·
  ไม่เทียบเนื้อหา (`external_ref` ตรง = แถวเดียวกัน) · batch ที่ไม่ commit ไม่จำ `external_ref` ·
  กติกา `batch_ref` ข้างบนใช้เหมือนเดิม — Apps Script ที่รันซ้ำทั้งชีตจึงไม่ทำให้ยอดเพิ่ม

## 5. รหัสปฏิเสธ

| รหัส | ความหมาย |
|---|---|
| `UNSUPPORTED_CONTRACT_VERSION` | ไม่ใช่ `campaign.v1` |
| `BRANCH_MISMATCH` | `branch` ไม่ตรงกับ path หรือกับ grant ของ credential |
| `INVALID_BATCH_REF` / `INVALID_ENVELOPES` / `INVALID_EVIDENCE_ID` | รูปแบบผิด |
| `INVALID_PERSON_REF` | `person_ref` ไม่ครบ ว่าง · `source`/`value` มีช่องว่างหน้าหรือหลัง · หรือ `source` ไม่อยู่ในรายการที่แคมเปญรับ |
| `BATCH_REF_REUSED` | ดูข้อ 4 |
| `OUTSIDE_CAMPAIGN_PERIOD` | (409 ระดับ batch) วันที่รับตามเขตเวลาของสาขาอยู่นอกช่วงแคมเปญ · ตรวจหลังขั้น replay |
| `DUPLICATE_EVIDENCE_IN_BATCH` | `evidence_id` ซ้ำใน batch เดียว |
| `UNKNOWN_EVIDENCE_KIND` / `UNKNOWN_SLOT` | ไม่อยู่ในรายการที่รับ |
| `SLOT_ALREADY_RECORDED` | ช่วงนี้ของวันนี้บันทึกแล้ว |
| `DAILY_CAP_REACHED` | เกินเพดานต่อวัน |
| `INVALID_EXTERNAL_REF` | `external_ref` ว่างหรือยาวเกิน 200 ตัว |
| `ORG_NOT_REGISTERED` | `org_ref` ไม่ได้ลงทะเบียนกับสาขานี้ |
| `INVALID_PARTICIPANT_COUNT` | `participant_count` ไม่ใช่จำนวนเต็ม ≥ 1 |
| `INVALID_MINUTES` | `minutes` ของรายงานกลุ่มไม่ใช่จำนวนเต็ม ≥ 1 |
| `GROUP_MINUTES_OVER_CAP` | `minutes` เกิน `participant_count × 15` |
| `GROUP_REPORT_ALREADY_RECORDED` | หน่วยงานนี้ส่งรายงานของวันนี้แล้ว |
| `INVALID_LIMIT` / `INVALID_CURSOR` | การแบ่งหน้าของ API อ่านผิดรูป (HTTP 400) |

## 6. ช่องทางเชื่อมของสาขา (5 ทาง)

สาขาเลือกได้ตามกำลัง · ทุกทางใช้ contract ชุดเดียวกัน และยอดทางการคิดที่ระบบกลางเท่านั้น

| ช่องทาง | endpoint | credential อยู่ที่ไหน |
|---|---|---|
| 1. แอปเต็ม (template นี้) | `POST …/evidence` · `GET …/summary` | `WP_APP_CREDENTIAL` ใน secret ของแพลตฟอร์ม ใช้จาก server ของแอปเท่านั้น |
| 2. Apps Script (Google Form/Sheet ของสาขา) | `POST …/evidence` ใส่ `external_ref` = response ID หรือรหัสแถว · `batch_ref` ใหม่ต่อการรัน · **ตัดช่องว่างหน้าหลังของรหัสสมาชิกก่อนส่ง** (เซลล์ชีตมีช่องว่างท้ายบ่อย · ระบบกลางไม่ตัดให้) | Script Properties ของโปรเจกต์ Apps Script ที่บัญชีสาขาเป็นเจ้าของ · ไม่อยู่ในชีตหรือในโค้ด |
| 3. ระบบกลางดึงชีตเอง | ไม่มีฝั่งสาขา · ระบบกลางอ่านชีตแล้วสร้าง evidence เอง (`external_ref` = ชีต + รหัสแถว) | ไม่มี credential ที่สาขา · สาขาแชร์ชีตให้บัญชี service ของระบบกลางแบบ**ดูได้อย่างเดียว** |
| 4. แดชบอร์ดอ่านอย่างเดียว (Streamlit, Looker Studio, Sheets) | `GET …/summary` · `…/members` · `…/daily.csv` | credential ที่มีแค่ `branch.read` ใน secret ของแพลตฟอร์ม (เช่น Streamlit secrets) หรือ Script Properties ของ Apps Script ที่ดึงข้อมูลมาเขียนลงชีต |
| 5. CSV ผ่านหน้า admin กลาง | หน้า admin ของระบบกลาง (ไม่ใช่ API ของ contract นี้) | ไม่มี app credential · แอดมินสาขา login ที่ระบบกลาง |

กติกาบังคับ:

- **ห้ามใส่ credential ใน URL** — เช่นสูตร `IMPORTDATA`/`IMPORTXML` ของ Sheets หรือ query string · URL ถูกเก็บใน log, ประวัติ และสูตรที่ทุกคนที่แก้ชีตได้เห็น ·
  credential ส่งใน header `Authorization: Bearer` จาก server หรือ Apps Script เท่านั้น
- **ห้ามเปิดชีตที่มีข้อมูลรายคนแบบ "ทุกคนที่มีลิงก์"** — แชร์เฉพาะบัญชีที่ต้องใช้ (รวมบัญชี service ของระบบกลางในช่องทาง 3)
- **ยอดทางการคิดที่ระบบกลางเท่านั้น** — ยอดที่แดชบอร์ดหรือชีตคิดเองเป็นยอดประกอบการทำงาน ไม่ใช่ยอดประกาศ
- ช่องทาง 5: แอดมินสาขาได้แค่ `branch.read` จากคำขอเข้าร่วม · สิทธิ์อัปโหลด CSV ต้องตัดสินแยก (ข้อ 8)

## 7. ทางเลือกสำหรับสาขาที่ไม่มีแดชบอร์ด: หน้าดูยอดสมาชิก

ระบบกลางจะมีหน้าดูยอดแบบ**ลิงก์ลับต่อสาขา** (แบบ me-ui ของ 49m) ให้สาขาส่งต่อสมาชิกได้โดยไม่ต้องสร้างอะไรเอง

- สมาชิกกรอกรหัสสมาชิกแล้ว**เห็นเฉพาะยอดของตัวเอง** (นาทีรวม จำนวนวัน วันล่าสุด สถานะทางการ) · เบอร์โทรถูกปิดบางส่วน · ไม่แสดงชื่อหรือยอดของคนอื่น
- มี rate limit ต่อลิงก์และต่อผู้ใช้ กันการไล่เดารหัสสมาชิก
- ระบบกลางออกลิงก์และหมุนลิงก์ใหม่ได้ (ลิงก์เดิมใช้ไม่ได้ทันที) · ลิงก์ไม่ใช่ app credential และไม่ให้สิทธิ์ส่งหรืออ่านข้อมูลรายคนอื่น
- ยังไม่มีโค้ดใน repo นี้ · เป็นของระบบกลาง

## 8. ยังเปิดอยู่

1. วิธียืนยันตัวตนสมาชิก (ข้อ 2) — กำหนดว่า `person_ref` มาจากไหนในโหมดจริง
2. ~~รหัสสมาชิกเป็นแค่รหัส login หรือเป็น ref ในระบบกลาง~~ — **ตัดสินแล้ว** ดูด้านล่าง
3. งาน QR (บันทึกโดยไม่สมัคร) — ต้องเพิ่ม `kind` · หน่วยงาน/โรงเรียนใช้ `group_report` ได้แล้ว แต่ endpoint ลงทะเบียนหน่วยงานยังไม่มี (mock มี `registerOrg` สำหรับเทสต์)
4. อันดับรายสาขา/จังหวัด และการแสดงชื่อตาม consent — endpoint อ่านเพิ่ม
5. รายงานกลุ่มย้อนหลัง (ส่งของเมื่อวาน) — v0.2 ใช้วันที่ระบบกลางรับเท่านั้น
6. สิทธิ์อัปโหลด CSV ของแอดมินสาขาที่หน้า admin กลาง (ช่องทาง 5)
7. เกณฑ์ `official_status` (เกียรติบัตร) — ระบบกลางกำหนด
8. ช่วงวันของแคมเปญ 76m (วันเริ่ม/วันสิ้นสุด) ยังไม่ได้จากทีม 76m

**ตัดสินแล้ว (ค่าตั้งต้น 13 พ.ย. 2569 · ปรับได้)**

- **ข้อ 8.2 ตัวตนของสมาชิก:** ตัวตน = `person_ref.value` (member_code ถาวรของระบบกลาง เช่น `003-0006`) ใช้เป็น key เดียวกันทุกที่ ·
  `person_ref.source` เป็นแค่รายการที่แคมเปญรับ (76m: `"member"` · โหมดตัวอย่าง: `"demo"`) · LINE userId ไม่ใช่ source ·
  ข้อ 8.1 (วิธียืนยันตัวตนสมาชิก) ยังเปิด
