// JARVIS PRIME brain – pure code first (instant, no network), AI only at the "heavy" level.
// Order: wake word → shortcuts → reminders/diary → memory → math → knowledge pack → AI → "not yet".
import { GREETING_HE } from './voice.js';
import * as diary from './diary.js';
import * as kb from './knowledge.js';

const MEM = 'prime.memory.v1';
const mem = { get() { try { return JSON.parse(localStorage.getItem(MEM)) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem(MEM, JSON.stringify(v)); } catch {} } };

export const norm = (t) => t.toLowerCase()
  .replace(/[׳`’]/g, "'").replace(/ג'ארוויס|ג׳רוויס|גרוויס|ג'רביס/g, "ג'רוויס")
  .replace(/[.,!?؟"״]/g, ' ').replace(/\s+/g, ' ').trim();

const you = (x) => (' ' + x + ' ').replace(/ אני /g, ' אתה ').replace(/ שלי /g, ' שלך ').replace(/ לי /g, ' לך ').replace(/ אותי /g, ' אותך ').trim();
let pending = null; // waiting for a follow-up answer (e.g. "when?")

const time = () => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const HELP = 'אני יודע, אדוני: לענות לשלום, להגיד שעה ותאריך, לחשב ("כמה זה 7 כפול 8"), '
  + 'לרשום ביומן ("תרשום ביומן…"), להזכיר ("תזכיר לי לשתות בעוד 10 דקות"), לזכור דברים ("תזכור ש…") ולענות על שאלות ידע.';

const SHORTCUTS = [
  [/^(שלום|היי|הי|אהלן|הלו|hello|hi|hey)( ג'רוויס| פריים)?$/, () => GREETING_HE],
  [/^(בוקר טוב)( ג'רוויס)?$/, () => 'בוקר טוב, אדוני. במה אוכל לעזור?'],
  [/^(ערב טוב|לילה טוב)( ג'רוויס)?$/, (m) => (m[1] === 'לילה טוב' ? 'לילה טוב, אדוני. אני כאן אם תצטרך.' : 'ערב טוב, אדוני. במה אוכל לעזור?')],
  [/^(מה השעה|כמה השעה|שעה)$/, () => `השעה ${time()}, אדוני.`],
  [/^(מה התאריך|איזה יום היום|תאריך|מה היום)$/, () => `היום ${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`],
  [/^(תודה|תודה רבה|thanks)( ג'רוויס)?$/, () => 'לשירותך, אדוני.'],
  [/^(מי אתה|מה אתה|מה השם שלך|איך קוראים לך)$/, () => "אני ג'רוויס פריים, העוזר האישי שלך. אני רץ רק אצלך במכשיר – בלי שרתים."],
  [/^(מה שלומך|מה נשמע|מה קורה|מה המצב)$/, () => 'כל המערכות תקינות, אדוני. ומה שלומך?'],
  [/^(עזרה|מה אתה יודע לעשות|מה אתה יכול לעשות|פקודות)$/, () => HELP],
];

// ---------------------------------------------------------------- main
export async function reply(raw, ctx = {}) {
  let t = norm(raw);

  // wake word: "ג'רוויס" alone → "כן, אדוני?"; "ג'רוויס, <command>" → the command
  if (/^(היי |הי )?ג'רוויס$/.test(t)) return { text: 'כן, אדוני?', via: 'wake', listen: true };
  t = t.replace(/^(היי |הי )?ג'רוויס /, '');

  if (pending) { const p = pending; pending = null; const r = p(t); if (r) return r; }

  for (const [re, f] of SHORTCUTS) { const m = t.match(re); if (m) return { text: f(m), via: 'shortcut' }; }

  // ---- reminders
  let m = t.match(/^(?:תזכיר לי|תזכורת|תזכירי לי)\s*(.*)$/);
  if (m) return reminder(m[1]);

  // ---- diary
  if ((m = t.match(/^(?:תרשום|תכתוב|רשום|כתוב|תוסיף)(?: לי)? ביומן[: ]*(.+)$/))) {
    diary.addNote(m[1]);
    return { text: 'נרשם ביומן, אדוני.', via: 'diary', openDiary: false };
  }
  if (/^(מה (יש )?ביומן|תקריא (לי )?את היומן|יומן|תפתח (את )?היומן)$/.test(t)) {
    const n = diary.notes().slice(-5);
    return { text: n.length ? 'ביומן, אדוני: ' + n.map((x) => x.text).join(' · ') : 'היומן ריק, אדוני.', via: 'diary', openDiary: true };
  }
  if (/^(מה התזכורות|אילו תזכורות|מה יש לי היום|מה מתוכנן|תזכורות)$/.test(t)) {
    const r = diary.reminders().filter((x) => !x.done).sort((a, b) => a.when - b.when);
    return { text: r.length ? 'התזכורות שלך: ' + r.map((x) => `${x.text} – ${diary.fmtWhen(x.when)}`).join(' · ') : 'אין תזכורות פתוחות, אדוני.', via: 'diary', openDiary: true };
  }

  // ---- memory: "תזכור ש…" / "מה אמרתי לך על…"
  if ((m = t.match(/^(?:תזכור|זכור|תזכרי)(?: ש| כי |:)\s*(.+)$/))) {
    const all = mem.get(); all.push({ text: m[1], at: Date.now() }); mem.set(all);
    return { text: 'אזכור, אדוני.', via: 'memory' };
  }
  if ((m = t.match(/^(?:מה אמרתי לך על|מה אתה זוכר על|מה זכרת על|מה אתה יודע על)\s+(.+)$/))) {
    const q = kb.words(m[1]);
    const hit = mem.get().filter((x) => q.some((w) => x.text.includes(w))).map((x) => x.text);
    if (hit.length) return { text: 'אמרת לי ש' + hit.slice(-3).map(you).join(', ו') + '.', via: 'memory' };
  }
  if (/^(מה אתה זוכר|מה אתה זוכר עליי)$/.test(t)) {
    const all = mem.get(); return { text: all.length ? 'אני זוכר ש' + all.slice(-5).map((x) => you(x.text)).join(', ו') + '.' : 'עוד לא ביקשת ממני לזכור כלום, אדוני.', via: 'memory' };
  }

  // ---- math
  const calc = math(t); if (calc != null) return { text: calc, via: 'math' };

  // ---- knowledge pack
  const k = kb.lookup(t); if (k) return { text: k, via: 'knowledge' };

  // ---- full AI (heavy level only)
  if (kb.aiAvailable()) {
    try { const a = await kb.askAI(raw, ctx.onToken, ctx.onProgress); if (a) return { text: a, via: 'ai' }; } catch { /* model failed to load */ }
  }
  return { text: 'עוד לא למדתי את זה, אדוני. תגיד "עזרה" כדי לשמוע מה אני כבר יודע.', via: 'unknown' };
}

function reminder(body) {
  const p = diary.parseWhen(body);
  const what = (p ? p.rest : body).replace(/^(ש|על |ל)(?=\S)/, (x) => (x === 'ל' ? 'ל' : '')).trim();
  if (!what) { pending = (ans) => reminder(ans + (p ? ' ' : '')); return { text: 'על מה להזכיר לך, אדוני?', via: 'reminder', listen: true }; }
  if (!p) { pending = (ans) => reminder(what + ' ' + ans); return { text: 'מתי להזכיר לך, אדוני?', via: 'reminder', listen: true }; }
  const r = diary.addReminder(what, p.when);
  return { text: `אזכיר לך ${what} ${diary.fmtWhen(r.when)}, אדוני.`, via: 'reminder', reminder: r };
}

const MATH_WORDS = [[/כפול|פעמים|x|×/g, '*'], [/חלקי|לחלק ל|÷/g, '/'], [/פלוס|ועוד|ו?עוד/g, '+'], [/מינוס|פחות/g, '-'], [/בחזקת/g, '**']];
function math(t) {
  const m = t.match(/^(?:כמה זה|כמה|תחשב|חשב|מה זה)\s+(.+?)\s*\??$/) || t.match(/^([\d\s+\-*/().]+)$/);
  if (!m) return null;
  let e = m[1];
  for (const [re, op] of MATH_WORDS) e = e.replace(re, ` ${op} `);
  e = e.replace(/שורש(?: של)?\s*(\d+(?:\.\d+)?)/g, 'Math.sqrt($1)');
  if (!/\d/.test(e) || !/^[\d\s+\-*/().]*(Math\.sqrt\(\d+(\.\d+)?\)[\d\s+\-*/().]*)*$/.test(e)) return null;
  try {
    const v = Function(`"use strict";return (${e})`)();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return `${+v.toFixed(6)}, אדוני.`;
  } catch { return null; }
}
