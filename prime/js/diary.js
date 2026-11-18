// Personal diary + reminders. Stored only on this device (localStorage).
const KEY = 'prime.diary.v1';
let db = read();
let notify = () => {};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { notes: [], reminders: [] }; } catch { return { notes: [], reminders: [] }; }
}
function write() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked */ } }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const notes = () => db.notes;
export const reminders = () => db.reminders;

export function addNote(text) { const n = { id: uid(), text, at: Date.now() }; db.notes.push(n); write(); return n; }
export function addReminder(text, when) { const r = { id: uid(), text, when: +when, done: false }; db.reminders.push(r); write(); return r; }
export function remove(id) {
  db.notes = db.notes.filter((x) => x.id !== id);
  db.reminders = db.reminders.filter((x) => x.id !== id); write();
}
export function clearDone() { db.reminders = db.reminders.filter((r) => !r.done); write(); }

// ------------------------------------------------------------ time parsing (Hebrew)
const NUM = { אחת: 1, אחד: 1, שתיים: 2, שניים: 2, שתי: 2, שני: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10, 'אחת עשרה': 11, 'שתים עשרה': 12, רבע: 15, חצי: 30 };
const num = (w) => (w == null ? null : /^\d+$/.test(w) ? +w : NUM[w] ?? null);

// Returns { when: Date, rest: string } or null. Understands:
// "בעוד 10 דקות", "בעוד שעה", "בעוד חצי שעה", "ב-17:30", "בשעה 5", "מחר ב-8", "מחר בבוקר", "בערב"
export function parseWhen(text, now = new Date()) {
  let t = ' ' + text + ' ', when = null;
  const cut = (re) => { t = t.replace(re, ' '); };
  let m;
  if ((m = t.match(/\sבעוד\s+(\S+)?\s*(דקות|דקה|שעות|שעה|ימים|יום)\s/))) {
    let n = m[1] ? num(m[1]) : 1; if (n == null) n = 1;
    if (m[1] === 'חצי') n = 0.5; if (m[1] === 'רבע') n = 0.25;
    const unit = /דק/.test(m[2]) ? 60e3 : /שע/.test(m[2]) ? 3600e3 : 86400e3;
    when = new Date(now.getTime() + n * unit); cut(m[0]);
  } else {
    let day = 0;
    if (/\sמחרתיים\s/.test(t)) { day = 2; cut(/\sמחרתיים\s/); } else if (/\sמחר\s/.test(t)) { day = 1; cut(/\sמחר\s/); }
    let h = null, mi = 0;
    if ((m = t.match(/\s(?:ב-?|בשעה\s+|ב־)(\d{1,2})(?::(\d{2}))?\s/))) { h = +m[1]; mi = m[2] ? +m[2] : 0; cut(m[0]); }
    else if ((m = t.match(/\sבשעה\s+(\S+)\s/)) && num(m[1]) != null) { h = num(m[1]); cut(m[0]); }
    let part = null;
    if ((m = t.match(/\s(בבוקר|בצהריים|אחר הצהריים|בערב|בלילה)\s/))) { part = m[1]; cut(m[0]); }
    if (h == null && part) h = { בבוקר: 8, בצהריים: 12, 'אחר הצהריים': 16, בערב: 19, בלילה: 21 }[part];
    if (h != null) {
      if (h < 12 && (part === 'בערב' || part === 'בלילה' || part === 'אחר הצהריים')) h += 12;
      when = new Date(now); when.setDate(when.getDate() + day); when.setHours(h, mi, 0, 0);
      // "at 5" with no part of day: pick the next 5 o'clock that is still ahead
      if (!part && !day && h < 12 && when <= now) when.setHours(h + 12);
      if (when <= now) when.setDate(when.getDate() + 1);
    } else if (day) { when = new Date(now); when.setDate(when.getDate() + day); when.setHours(9, 0, 0, 0); }
  }
  if (!when) return null;
  return { when, rest: t.replace(/\s+/g, ' ').trim() };
}

export function fmtWhen(d) {
  d = new Date(d);
  const today = new Date(); const tm = new Date(); tm.setDate(tm.getDate() + 1);
  const hm = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `היום ב־${hm}`;
  if (d.toDateString() === tm.toDateString()) return `מחר ב־${hm}`;
  return `${d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })} ב־${hm}`;
}

// ------------------------------------------------------------ alerts while Jarvis is open
export function startAlerts(onDue) {
  notify = onDue;
  const check = () => {
    const now = Date.now();
    for (const r of db.reminders) if (!r.done && r.when <= now) { r.done = true; write(); fire(r); }
  };
  check(); setInterval(check, 15e3);
  document.addEventListener('visibilitychange', check);
}
function fire(r) {
  notify(r);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('JARVIS PRIME · תזכורת', { body: r.text, icon: '../icons/icon-192.png', tag: r.id }); } catch { /* mobile needs SW */ }
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification?.('JARVIS PRIME · תזכורת', { body: r.text, icon: '../icons/icon-192.png', tag: r.id })).catch(() => {});
  }
}
export async function askPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { await Notification.requestPermission(); } catch { /* ignore */ }
}

// ------------------------------------------------------------ "add to calendar" (.ics with alarm)
const pad = (n) => String(n).padStart(2, '0');
const icsDate = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const esc = (s) => s.replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

export function ics(r) {
  const start = new Date(r.when), end = new Date(r.when + 15 * 60e3);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JARVIS PRIME//HE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${r.id}@jarvis-prime`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(r.text)}`, 'DESCRIPTION:תזכורת מג\'רוויס פריים',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(r.text)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export async function addToCalendar(r) {
  const file = new File([ics(r)], 'jarvis-reminder.ics', { type: 'text/calendar' });
  // Phones: the share sheet hands the file straight to the calendar app.
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: r.text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
