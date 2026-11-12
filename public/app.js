// หน้าเว็บของสาขา — คุยกับ /api ของแอปตัวเองเท่านั้น (same-origin) ไม่เคยเห็น token
// กติกา: หน้าเว็บไม่คิดนาที ยอด หรืออันดับเอง แสดงตามที่ระบบกลางตอบมา
// ตัวจับเวลาเป็นแค่ UX — ระบบกลางเป็นคนตัดสินว่าบันทึกนับได้หรือไม่

const SLOT_LABELS = { morning: 'เช้า', midday: 'กลางวัน', evening: 'เย็น' };

// รหัสจาก server → ข้อความที่ผู้ใช้อ่านเข้าใจ (รหัสที่ไม่รู้จักแสดงรหัสตรง ๆ ให้แจ้งผู้ดูแล)
const MESSAGES = {
  SLOT_ALREADY_RECORDED: 'ช่วงนี้บันทึกไปแล้ววันนี้',
  DAILY_CAP_REACHED: 'วันนี้บันทึกครบแล้ว',
  INVALID_MEMBER: 'รหัสสมาชิกไม่ถูกต้อง',
  MEMBER_AUTH_NOT_DECIDED: 'การบันทึกรายคนยังปิดอยู่',
  PROJECT_DISABLED: 'สาขานี้ยังไม่ได้เปิดโครงการนี้',
  CENTRAL_UNREACHABLE: 'ติดต่อระบบกลางไม่ได้ ลองใหม่อีกครั้ง',
  CENTRAL_AUTH_FAILED: 'การเชื่อมระบบกลางของสาขามีปัญหา โปรดแจ้งผู้ดูแลสาขา',
  TOKEN_MISSING: 'แอปตั้งค่าไม่ครบ โปรดแจ้งผู้ดูแลสาขา',
  CENTRAL_URL_MISSING: 'แอปตั้งค่าไม่ครบ โปรดแจ้งผู้ดูแลสาขา',
  CENTRAL_URL_INVALID: 'แอปตั้งค่าไม่ถูกต้อง โปรดแจ้งผู้ดูแลสาขา',
  CENTRAL_URL_NOT_HTTPS: 'แอปตั้งค่าไม่ถูกต้อง โปรดแจ้งผู้ดูแลสาขา',
};
const say = (code) => MESSAGES[code] ?? `เกิดข้อผิดพลาด (${code})`;

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('th-TH');

async function api(path, init) {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { /* ไม่ใช่ JSON */ }
  return { ok: res.ok, status: res.status, data };
}

function applyTheme(theme = {}) {
  const root = document.documentElement.style;
  if (theme.primary) root.setProperty('--primary', theme.primary);
  if (theme.background) root.setProperty('--background', theme.background);
  if (theme.text) root.setProperty('--text', theme.text);
  if (theme.logo) $('logo').src = theme.logo;
}

function showBanner(mode) {
  const el = $('mode-banner');
  el.hidden = false;
  if (mode === 'demo') {
    el.textContent = 'โหมดตัวอย่าง — ข้อมูลในหน้านี้ไม่นับเข้ายอดจริง และจะหายเมื่อแอปเริ่มใหม่';
  } else if (mode === 'live') {
    el.textContent = 'เชื่อมระบบกลางแล้ว';
    el.classList.add('live');
  } else {
    el.textContent = 'แอปตั้งค่าไม่ครบ โปรดแจ้งผู้ดูแลสาขา';
    el.classList.add('error');
  }
}

async function loadSummary() {
  const { ok, data } = await api('/campaign/summary');
  if (!ok) {
    $('progress-text').textContent = say(data.code);
    return;
  }
  $('stat-total').textContent = fmt.format(data.total_minutes);
  $('stat-today').textContent = fmt.format(data.today_minutes);
  $('stat-people').textContent = fmt.format(data.participants);
  const pct = data.target_minutes ? (data.total_minutes / data.target_minutes) * 100 : 0;
  $('progress-bar').style.width = `${Math.min(100, pct)}%`;
  $('progress-text').textContent =
    `${pct.toFixed(4)}% ของเป้า ${fmt.format(data.target_minutes)} นาที · ข้อมูล ณ ${new Date(data.as_of).toLocaleString('th-TH')}`;
}

// ---- ฝึกและบันทึก ----
let currentMember = '';
let timer = null;

function setMessage(text, kind = '') {
  const el = $('practice-message');
  el.textContent = text;
  el.className = `message ${kind}`;
}

async function loadToday(member) {
  const { ok, data } = await api(`/campaign/today?member=${encodeURIComponent(member)}`);
  if (!ok) {
    setMessage(say(data.code), 'error');
    $('slots').hidden = true;
    return;
  }
  currentMember = member;
  const list = $('slots');
  list.replaceChildren();
  for (const [slot, done] of Object.entries(data.slots)) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `ช่วง${SLOT_LABELS[slot] ?? slot}`;
    li.append(label);
    if (done) {
      const mark = document.createElement('span');
      mark.className = 'done';
      mark.textContent = 'บันทึกแล้ว';
      li.append(mark);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `เริ่ม ${data.session_minutes} นาที`;
      btn.addEventListener('click', () => startTimer(slot, data.session_minutes));
      li.append(btn);
    }
    list.append(li);
  }
  list.hidden = false;
  setMessage(`วันนี้ (${data.date}) บันทึกแล้ว ${data.minutes_today} จาก ${data.daily_cap_minutes} นาที`);
}

function startTimer(slot, minutes) {
  // ?fast=1 ย่อเวลาเหลือ 10 วินาที ไว้ทดลองหน้าจอ — ระบบกลางจริงไม่สนเวลาที่หน้าเว็บนับ
  const fast = new URLSearchParams(location.search).get('fast') === '1';
  let left = fast ? 10 : minutes * 60;
  const eventId = crypto.randomUUID();
  $('slots').hidden = true;
  $('timer').hidden = false;
  $('timer-label').textContent = `กำลังฝึกช่วง${SLOT_LABELS[slot] ?? slot}`;
  setMessage('');
  const tick = () => {
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    $('timer-clock').textContent = `${m}:${s}`;
    if (left <= 0) {
      stopTimer();
      record(slot, eventId);
      return;
    }
    left -= 1;
  };
  tick();
  timer = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
  $('timer').hidden = true;
}

async function record(slot, eventId) {
  setMessage('กำลังบันทึก…');
  const body = JSON.stringify({ member: currentMember, slot, event_id: eventId });
  const { ok, data } = await api('/campaign/practice', { method: 'POST', body });
  // โหลดสถานะใหม่ก่อน แล้วค่อยแสดงผลการบันทึก (loadToday เขียนข้อความของตัวเองทับ)
  await Promise.all([loadToday(currentMember), loadSummary()]);
  if (ok && data.committed) {
    setMessage(`บันทึกช่วง${SLOT_LABELS[slot] ?? slot}แล้ว`, 'ok');
  } else {
    const code = data.rejected?.[0]?.code ?? data.code ?? 'UNKNOWN';
    setMessage(say(code), 'error');
  }
}

async function main() {
  const { ok, data: cfg } = await api('/config');
  if (!ok) {
    $('branch-name').textContent = 'โหลดค่าแอปไม่ได้';
    return;
  }
  applyTheme(cfg.theme);
  $('branch-name').textContent = cfg.branch.name;
  document.title = `${cfg.branch.name} · สถาบันพลังจิตตานุภาพ`;
  if (cfg.branch.contact) $('contact').textContent = `ติดต่อผู้ประสานงาน: ${cfg.branch.contact}`;
  showBanner(cfg.mode);

  const campaign = cfg.projects.campaign;
  if (campaign?.enabled) {
    $('campaign').hidden = false;
    $('campaign-title').textContent = campaign.title;
    $('campaign-subtitle').textContent = campaign.subtitle;
    $('practice').hidden = false;
    if (cfg.mode !== 'demo') {
      $('practice-locked').hidden = false;
      $('member-form').hidden = true;
    }
    await loadSummary();
  }

  $('member-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadToday($('member').value.trim());
  });
  $('timer-cancel').addEventListener('click', () => {
    stopTimer();
    $('slots').hidden = false;
    setMessage('ยกเลิกแล้ว ไม่ได้บันทึก');
  });
}

main();
