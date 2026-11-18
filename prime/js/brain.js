// JARVIS PRIME brain – pure code first (instant, no network), AI only at the "heavy" level.
// Order: wake word → shortcuts → reminders/diary → memory → math → knowledge pack → AI → "not yet".
import { GREETING_HE } from './voice.js';
import * as diary from './diary.js';
import * as kb from './knowledge.js';

const MEM = 'prime.memory.v1';
const LEARN = 'prime.learn.v1';
const learned = { get() { try { return JSON.parse(localStorage.getItem(LEARN)) || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(LEARN, JSON.stringify(v)); } catch {} } };
let lastQ = null; // last question Jarvis answered – target for "לא, התשובה היא…"
const mem = { get() { try { return JSON.parse(localStorage.getItem(MEM)) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem(MEM, JSON.stringify(v)); } catch {} } };

export const norm = (t) => t.toLowerCase()
  .replace(/[׳`’]/g, "'").replace(/ג'ארוויס|ג׳רוויס|גרוויס|ג'רביס/g, "ג'רוויס")
  .replace(/[.,!?؟"״]/g, ' ').replace(/\s+/g, ' ').trim();

const you = (x) => (' ' + x + ' ').replace(/ אני /g, ' אתה ').replace(/ שלי /g, ' שלך ').replace(/ לי /g, ' לך ').replace(/ אותי /g, ' אותך ').trim();
let pending = null; // waiting for a follow-up answer (e.g. "when?")

const time = () => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const HELP = 'אני יודע, אדוני: לבנות משחקים בעצמי ("תבנה משחק", "תוסיף 3 אויבים", "שחק"), לפתוח אפליקציות ("תפתח יוטיוב", "תחפש ביוטיוב…"), לבנות משחק עם שרבוטון ("תפתח משחק"), ללמוד ממך ("כשאני אומר X תגיד Y" או "לא, התשובה היא…"), לענות לשלום, להגיד שעה ותאריך, לחשב ("כמה זה 7 כפול 8"), '
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
  const r = await think(raw, ctx);
  if (!/^(learn|learned|wake|reminder)$/.test(r.via)) lastQ = norm(raw).replace(/^(היי |הי )?ג'רוויס /, '');
  return r;
}

async function think(raw, ctx) {
  let t = norm(raw);

  // wake word: "ג'רוויס" alone → "כן, אדוני?"; "ג'רוויס, <command>" → the command
  if (/^(היי |הי )?ג'רוויס$/.test(t)) return { text: 'כן, אדוני?', via: 'wake', listen: true };
  t = t.replace(/^(היי |הי )?ג'רוויס /, '');

  if (pending) { const p = pending; pending = null; const r = p(t); if (r) return r; }

  // ---- learning from corrections (checked first, so what you taught always wins)
  let L = t.match(/^כשאני (?:אומר|אגיד|כותב) (.+?) (?:תגיד|תענה|תאמר)(?: לי)? (.+)$/);
  if (L) { const all = learned.get(); all[L[1].trim()] = L[2].trim(); learned.set(all); return { text: `למדתי, אדוני. כשתגיד "${L[1].trim()}" אענה "${L[2].trim()}".`, via: 'learn' }; }
  L = t.match(/^(?:לא נכון|טעות|טעית|לא)[ ,]+(?:התשובה (?:היא|הנכונה היא) |תגיד |צריך להיות )?(.+)$/);
  if (L && lastQ) { const all = learned.get(); all[lastQ] = L[1].trim(); learned.set(all); const q = lastQ; lastQ = null; return { text: `תודה על התיקון, אדוני. מעכשיו על "${q}" אענה: ${L[1].trim()}`, via: 'learn' }; }
  L = t.match(/^(?:תשכח|שכח) (?:את )?(.+)$/);
  if (L) { const all = learned.get(); if (all[L[1].trim()]) { delete all[L[1].trim()]; learned.set(all); return { text: 'שכחתי, אדוני.', via: 'learn' }; } }
  if (/^(מה למדת|מה לימדתי אותך)$/.test(t)) { const all = Object.entries(learned.get()); return { text: all.length ? 'למדתי: ' + all.slice(-6).map(([q, a]) => `"${q}" → ${a}`).join(' · ') : 'עוד לא לימדת אותי כלום, אדוני.', via: 'learn' }; }
  const taught = learned.get()[t]; if (taught) { lastQ = t; return { text: taught, via: 'learned' }; }

  // ---- open apps & sites ("תפתח יוטיוב", "תחפש ביוטיוב שירים")
  const o = openTarget(t); if (o) return o;

  // ---- games with Shirbuton (pure code, opens instantly)
  if (/^(?:תפתח (?:לי )?)?(?:משחק|מיני משחק|משחק עם לבנים|בוא נשחק|תבנה (?:לי )?משחק|שרבוטון)(?: .*)?$/.test(t)) {
    return { text: 'פותח את הטרמינל שלי, אדוני. תגיד מה לבנות – אני בונה תוך כדי שיחה.', via: 'game', game: t.replace(/^(?:תפתח (?:לי )?)?(?:משחק|מיני משחק|משחק עם לבנים|בוא נשחק|תבנה (?:לי )?משחק|שרבוטון) ?(?:עם לבנים ?)?/, '') };
  }
  if (/^(?:תדליק|תפעיל|פתח|תפתח) (?:את )?(?:המצלמה|זיהוי אנשים|זיהוי)$/.test(t)) return { text: 'מפעיל זיהוי אנשים, אדוני. אני מזהה רק תנוחה – לא מי האדם.', via: 'pose', pose: true };
  if (/^(?:תדליק|תפעיל) (?:את )?(?:הידיים|זום|ידיים)$/.test(t)) return { text: 'צבוט כדי להקטין, פשק כדי להגדיל, אדוני.', via: 'hands', hands: true };

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

// Apps & sites. On phones these links open the installed app (YouTube, WhatsApp, Maps…).
const APPS = [
  [/^(יוטיוב|יו טיוב|youtube)$/, 'יוטיוב', 'https://www.youtube.com/'],
  [/^(וואטסאפ|ווטסאפ|וואצאפ|ווצאפ|whatsapp)$/, 'וואטסאפ', 'https://wa.me/'],
  [/^(גוגל|google)$/, 'גוגל', 'https://www.google.com/'],
  [/^(מפות|גוגל מפות|google maps|מפה)$/, 'מפות', 'https://maps.google.com/'],
  [/^(וויז|ווייז|waze)$/, 'Waze', 'https://waze.com/ul'],
  [/^(ספוטיפיי|spotify)$/, 'ספוטיפיי', 'https://open.spotify.com/'],
  [/^(טיקטוק|tiktok)$/, 'טיקטוק', 'https://www.tiktok.com/'],
  [/^(אינסטגרם|אינסטה|instagram)$/, 'אינסטגרם', 'https://www.instagram.com/'],
  [/^(ג'ימייל|גימייל|מייל|gmail)$/, 'Gmail', 'https://mail.google.com/'],
  [/^(ויקיפדיה|wikipedia)$/, 'ויקיפדיה', 'https://he.wikipedia.org/'],
  [/^(שרבוטים לוחמים|שרבוטים)$/, 'שרבוטים לוחמים', 'https://benzionbenaya4-collab.github.io/doodle-game/'],
  [/^(קוביקה)$/, 'קוביקה', 'https://blockland-ibdp.onrender.com/'],
];
function openTarget(t) {
  let m = t.match(/^(?:תחפש|חפש|תמצא)(?: לי)? ב(יוטיוב|גוגל|ויקיפדיה|מפות|ספוטיפיי) (.+)$/);
  if (m) {
    const q = encodeURIComponent(m[2]);
    const url = { יוטיוב: `https://www.youtube.com/results?search_query=${q}`, גוגל: `https://www.google.com/search?q=${q}`,
      ויקיפדיה: `https://he.wikipedia.org/w/index.php?search=${q}`, מפות: `https://maps.google.com/?q=${q}`, ספוטיפיי: `https://open.spotify.com/search/${q}` }[m[1]];
    return { text: `מחפש ב${m[1]}: ${m[2]}, אדוני.`, via: 'open', open: url, openName: m[1] };
  }
  m = t.match(/^(?:תפתח|פתח|תיכנס|כנס|תעבור)(?: לי)?(?: את| ל| אל)?\s*(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  for (const [re, label, url] of APPS) if (re.test(name)) return { text: `פותח את ${label}, אדוני.`, via: 'open', open: url, openName: label };
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(name)) return { text: `פותח את ${name}, אדוני.`, via: 'open', open: 'https://' + name.replace(/^https?:\/\//, ''), openName: name };
  return null;
}
