// PRIME FORGE – Jarvis builds games himself, by talking (Shirbuton's ideas, rebuilt inside Jarvis).
// Pure code, offline, nothing leaves the device. Opened in Jarvis's own terminal during the chat.
const T = 40;                          // tile size (px)
const KEY = 'prime.forge.v1';
const COLORS = { אדום: '#ff4d5e', כחול: '#3d8bff', ירוק: '#3ddc84', צהוב: '#ffd23f', כתום: '#ff9a3d', סגול: '#a96bff', ורוד: '#ff6bcb',
  לבן: '#ffffff', שחור: '#05070c', תכלת: '#00e5ff', זהב: '#ffcc33', אפור: '#8a96a8', חום: '#a0642d' };
const NUM = { אחד: 1, אחת: 1, שניים: 2, שתיים: 2, שני: 2, שתי: 2, שלושה: 3, שלוש: 3, ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5, שישה: 6, שש: 6,
  שבעה: 7, שבע: 7, שמונה: 8, תשעה: 9, תשע: 9, עשרה: 10, עשר: 10, הרבה: 8, כמה: 3 };
const THEMES = {
  ניאון: { bg: '#03070f', ground: '#00e5ff', plat: '#7ef9ff', accent: '#00e5ff' },
  חלל: { bg: '#05031a', ground: '#a96bff', plat: '#d6b8ff', accent: '#ffd23f', stars: true },
  יער: { bg: '#0c2416', ground: '#3ddc84', plat: '#a0642d', accent: '#ffd23f' },
  לבה: { bg: '#1a0604', ground: '#ff6a3d', plat: '#ffb03d', accent: '#ffd23f' },
  שלג: { bg: '#dfeefc', ground: '#ffffff', plat: '#9fd0ff', accent: '#3d8bff' },
  מים: { bg: '#021a33', ground: '#3d8bff', plat: '#7ef9ff', accent: '#ffd23f' },
};

const blank = () => ({ w: 60, h: 14, theme: 'ניאון', bg: null, hero: '#ffffff', grav: 1, spd: 1, jump: 1, dbl: false, inf: false,
  lives: 3, enemySpd: 1, objs: [] });
let L = load(), undo = [], log = null, cv = null, g = null, play = null, raf = 0, onSay = () => {};

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || starter(); } catch { return starter(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch {} }
function snap() { undo.push(JSON.stringify(L)); if (undo.length > 40) undo.shift(); }
function starter() {
  const l = blank();
  for (let x = 0; x < l.w; x++) l.objs.push({ k: 'block', x, y: l.h - 1 });
  l.objs.push({ k: 'start', x: 2, y: l.h - 2 }, { k: 'flag', x: l.w - 3, y: l.h - 2 });
  return l;
}

// ---------------------------------------------------------------- helpers
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const at = (x, y) => L.objs.find((o) => o.x === x && o.y === y && o.k !== 'start');
const groundY = (x) => { for (let y = 0; y < L.h; y++) if (L.objs.some((o) => o.x === x && o.y === y && (o.k === 'block' || o.k === 'plat'))) return y; return L.h; };
const put = (k, x, y, extra) => { if (x < 0 || y < 0 || x >= L.w || y >= L.h) return false; L.objs = L.objs.filter((o) => !(o.x === x && o.y === y && o.k !== 'start')); L.objs.push({ k, x, y, ...extra }); return true; };
const freeX = () => { for (let i = 0; i < 60; i++) { const x = rnd(5, L.w - 5); const gy = groundY(x); if (gy > 1 && !at(x, gy - 1)) return [x, gy - 1]; } return null; };
const count = (s) => { const m = s.match(/(\d+)/); if (m) return Math.min(+m[1], 40); for (const [w, n] of Object.entries(NUM)) if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(s)) return n; return null; };
const colorIn = (s) => Object.entries(COLORS).find(([w]) => s.includes(w))?.[1];

const ITEMS = [ // what can be added: word patterns → tile kind
  [/אויב|מפלצ|רובוט|זומבי/, 'enemy', 'אויבים'], [/מטבע|כסף|יהלום|אוצר/, 'coin', 'מטבעות'], [/קוצ|מלכוד|מוקש/, 'spike', 'קוצים'],
  [/לבה|אש/, 'lava', 'לבה'], [/קפיצ|קפיץ|טרמפולינ/, 'spring', 'קפיצים'], [/כוכב|כוח|שיקוי|לב/, 'star', 'כוכבי כוח'],
  [/פלטפורמ|במה|מדף/, 'plat', 'פלטפורמות'], [/בלוק|קוביי|קיר|לבנ/, 'block', 'בלוקים'], [/דגל|סיום|יציאה/, 'flag', 'דגל'],
];

// ---------------------------------------------------------------- the builder (Jarvis's game brain)
// Returns a short Hebrew reply if the command was about the game, else null.
export function command(raw) {
  const t = raw.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  const done = (msg, keep) => { if (!keep) { save(); if (!play) draw(); } term(msg); return msg; };

  if (/^(שחק|תשחק|נסה|תנסה|הפעל|יאללה|תתחיל|בוא נשחק|שחק במשחק)( את המשחק)?$/.test(t)) { start(); return done('▶ משחקים! חצים/כפתורים לזוז, רווח/⤒ לקפוץ.', true); }
  if (/^(עצור|תעצור|ערוך|עריכה|חזור לעריכה|stop)$/.test(t)) { stopPlay(); return done('⏸ חזרנו לעריכה.', true); }
  if (/^(בטל|תבטל|אנדו|undo|תחזיר)$/.test(t)) { if (!undo.length) return done('אין מה לבטל.', true); L = JSON.parse(undo.pop()); return done('↶ ביטלתי.'); }
  if (/^(משחק חדש|תבנה (?:לי )?משחק(?: חדש)?|תתחיל מחדש|תנקה הכל|נקה הכל|מחק הכל)$/.test(t)) { snap(); L = starter(); return done('🆕 משחק חדש: רצפה, נקודת התחלה ודגל סיום. מה להוסיף?'); }

  snap();
  // themes & colours
  for (const name of Object.keys(THEMES)) if (t.includes(name) && /(עולם|נושא|סגנון|תעשה|תהפוך|שלב|רקע|משחק)/.test(t)) { L.theme = name; L.bg = null; return done(`🎨 עולם ${name}.`); }
  if ((m = t.match(/רקע/)) && colorIn(t)) { L.bg = colorIn(t); return done('🎨 צבעתי את הרקע.'); }
  if (/(דמות|גיבור|שחקן)/.test(t) && colorIn(t)) { L.hero = colorIn(t); return done('🎨 צבעתי את הדמות.'); }

  // physics & player
  if (/(מהיר|מהירה|מהירים)/.test(t) && /(אויב|מפלצ)/.test(t)) { L.enemySpd = 1.8; return done('👾 האויבים מהירים עכשיו.'); }
  if (/(איטי|איטיים)/.test(t) && /(אויב|מפלצ)/.test(t)) { L.enemySpd = 0.5; return done('🐢 האויבים איטיים עכשיו.'); }
  if (/(מהיר|מהירה|ספרינט)/.test(t)) { L.spd = 1.7; return done('⚡ הדמות מהירה.'); }
  if (/(איטי|איטית)/.test(t)) { L.spd = 0.6; return done('🐢 הדמות איטית.'); }
  if (/קפיצה כפולה|דאבל ג'מפ|לקפוץ פעמיים/.test(t)) { L.dbl = !/(בלי|תוריד|תבטל)/.test(t); return done(L.dbl ? '⤒⤒ קפיצה כפולה הופעלה.' : 'קפיצה כפולה כבויה.'); }
  if (/קפיצה (גבוהה|ענקית)|לקפוץ גבוה|סופר קפיצה/.test(t)) { L.jump = 1.45; return done('🦘 קפיצה גבוהה.'); }
  if (/קפיצה (נמוכה|קטנה)/.test(t)) { L.jump = 0.75; return done('קפיצה נמוכה.'); }
  if (/(בלי|אין) (כוח )?משיכה|מבט מלמעלה|לעוף|ריחוף|חלל חופשי/.test(t)) { L.grav = 0; return done('🛸 בלי כוח משיכה – זזים לכל הכיוונים.'); }
  if (/(עם|תחזיר|יש) (כוח )?משיכה/.test(t)) { L.grav = 1; return done('⬇ כוח משיכה חזר.'); }
  if (/(אין ?סוף|אינסופי|בלי סוף)/.test(t)) { L.inf = !/(בלי אין|תבטל|תוריד)/.test(t); return done(L.inf ? '♾ המשחק ממשיך ימינה בלי סוף.' : 'המשחק חזר להיות עם סוף.'); }
  if ((m = t.match(/(\d+|\S+) (חיים|לבבות)/)) && count(m[1] + ' ')) { L.lives = count(m[1] + ' '); return done(`❤ ${L.lives} חיים.`); }
  if ((m = t.match(/(ארוך|ארוכה|תאריך|תגדיל|גדול)/)) && /(משחק|שלב|מפה|עולם)/.test(t)) { extend(30); return done(`📏 הגדלתי את השלב ל־${L.w} משבצות.`); }

  // structures
  const S = [
    [/מבצר|טירה|ארמון/, fortress, '🏰 בניתי מבצר עם שומרים.'], [/גשר/, bridge, '🌉 בניתי גשר מעל בור.'],
    [/מדרגות|מדרגה/, stairs, '🪜 בניתי מדרגות.'], [/פירמידה/, pyramid, '🔺 בניתי פירמידה.'],
    [/מגדל/, tower, '🗼 בניתי מגדל עם כוכב למעלה.'], [/בור|תהום|חור/, pit, '🕳 חפרתי בור – תיזהר.'],
    [/מערה|מנהרה/, tunnel, '⛏ בניתי מנהרה.'], [/מבוך/, maze, '🌀 בניתי מבוך קטן.'],
  ];
  for (const [re, fn, msg] of S) if (re.test(t) && /(תבנה|בנה|תוסיף|תעשה|תשים|צור|תיצור|תחפור)/.test(t)) { fn(); return done(msg); }

  // remove
  if (/(תמחק|מחק|תוריד|תעיף|בלי) /.test(t)) {
    for (const [re, k, name] of ITEMS) if (re.test(t)) { const n = L.objs.length; L.objs = L.objs.filter((o) => o.k !== k); return done(`🗑 מחקתי ${n - L.objs.length} ${name}.`); }
  }
  // add N items
  if (/(תוסיף|הוסף|תשים|שים|תיצור|צור|תעשה|תבנה|עוד|תן)/.test(t)) {
    for (const [re, k, name] of ITEMS) if (re.test(t)) {
      const n = count(t) || (k === 'flag' ? 1 : 3);
      let added = 0;
      for (let i = 0; i < n; i++) {
        if (k === 'plat') { const x = rnd(4, L.w - 6), y = rnd(Math.max(2, L.h - 8), L.h - 4); for (let d = 0; d < 3; d++) put('plat', x + d, y); added++; continue; }
        const p = freeX(); if (!p) break;
        if (k === 'lava' || k === 'spike') { put(k, p[0], p[1] + 1 <= L.h - 1 ? p[1] + 1 : p[1]); added++; continue; }
        if (k === 'coin' || k === 'star') { put(k, p[0], Math.max(0, p[1] - rnd(0, 2))); added++; continue; }
        put(k, p[0], p[1]); added++;
      }
      return done(added ? `✅ הוספתי ${added} ${name}.` : 'אין מקום פנוי – תגדיל את השלב ("תעשה שלב ארוך").');
    }
    // anything else ("תוסיף דרקון", "תוסיף 3 עצים") – Jarvis draws it himself and gives it a role
    const mm = t.match(/(?:תוסיף|הוסף|תשים|שים|תיצור|צור|תעשה|תבנה|עוד|תן)(?: לי)?(?: עוד)?\s+(?:\d+\s+|\S+\s+(?=\S))?(\S+)$/);
    if (mm && mm[1].length > 1 && !/משחק|שלב/.test(mm[1])) {
      const word = mm[1], n = count(t) || 1;
      const friendly = /עץ|עצים|פרח|בית|ענן|שמש|אבן|שלט|דשא|הר|ירח|כוכבים|חומה|בניין|מכונית|ספסל/.test(word);
      let added = 0;
      for (let i = 0; i < n; i++) { const p = freeX(); if (!p) break; put(friendly ? 'deco' : 'enemy', p[0], p[1], { name: word }); added++; }
      return done(added ? `✨ יצרתי ${added === 1 ? '' : added + ' '}${word}${friendly ? '' : ' – זהירות, זה אויב'}.` : 'אין מקום פנוי.');
    }
  }
  undo.pop();
  return null;
}

export const HELP = 'אני בונה משחקים בעצמי, אדוני. נסה: "תבנה משחק", "תוסיף 5 אויבים", "תוסיף מטבעות", "תבנה מבצר / גשר / מדרגות / פירמידה / מגדל / מבוך", '
  + '"תחפור בור", "קפיצה כפולה", "קפיצה גבוהה", "דמות מהירה", "אויבים מהירים", "בלי כוח משיכה", "אין סוף ימינה", "עולם חלל / יער / לבה / שלג / מים", '
  + '"רקע סגול", "דמות אדומה", "5 חיים", "תמחק את האויבים", "בטל", ואז "שחק".';

// ---------------------------------------------------------------- structures
function fortress() { const x0 = Math.min(L.w - 12, rnd(15, L.w - 14)), gy = groundY(x0);
  for (let x = x0; x < x0 + 9; x++) put('block', x, gy - 1); for (let y = gy - 5; y < gy - 1; y++) { put('block', x0, y); put('block', x0 + 8, y); }
  for (let x = x0; x < x0 + 9; x += 2) put('block', x, gy - 6); for (let x = x0 + 1; x < x0 + 8; x++) put('plat', x, gy - 4);
  put('enemy', x0 + 3, gy - 2); put('enemy', x0 + 5, gy - 5); put('star', x0 + 4, gy - 2); }
function bridge() { const x0 = rnd(8, L.w - 14); pitAt(x0, 6); for (let x = x0 - 1; x < x0 + 7; x++) put('plat', x, L.h - 4); }
function stairs() { const x0 = rnd(6, L.w - 12), gy = groundY(x0); for (let i = 0; i < 6; i++) for (let y = gy - 1 - i; y < gy; y++) put('block', x0 + i, y); put('coin', x0 + 5, gy - 8); }
function pyramid() { const x0 = rnd(6, L.w - 14), gy = groundY(x0); for (let r = 0; r < 5; r++) for (let x = x0 + r; x < x0 + 10 - r; x++) put('block', x, gy - 1 - r); put('star', x0 + 5, gy - 7); }
function tower() { const x0 = rnd(6, L.w - 8), gy = groundY(x0); for (let y = Math.max(1, gy - 8); y < gy; y++) { put('block', x0, y); put('block', x0 + 2, y); } for (let y = gy - 2; y > gy - 8; y -= 2) put('plat', x0 + 1, y); put('star', x0 + 1, Math.max(0, gy - 9)); }
function pitAt(x0, w) { L.objs = L.objs.filter((o) => !(o.x >= x0 && o.x < x0 + w && o.y >= L.h - 2)); for (let x = x0; x < x0 + w; x++) put('lava', x, L.h - 1); }
function pit() { pitAt(rnd(8, L.w - 10), 3); }
function tunnel() { const x0 = rnd(6, L.w - 16); for (let x = x0; x < x0 + 10; x++) { put('block', x, L.h - 4); put('coin', x, L.h - 2); } }
function maze() { const x0 = rnd(6, L.w - 16), gy = L.h - 1; for (let i = 0; i < 5; i++) { const x = x0 + i * 2; const top = i % 2 ? gy - 5 : gy - 3; for (let y = top; y < gy; y++) if (!(i % 2 === 0 && y === gy - 1)) put('block', x, y); } put('coin', x0 + 5, gy - 1); put('enemy', x0 + 3, gy - 1); }
function extend(n) { const w0 = L.w; L.w += n; L.objs = L.objs.filter((o) => o.k !== 'flag'); for (let x = w0; x < L.w; x++) put('block', x, L.h - 1); put('flag', L.w - 3, L.h - 2); }

// ---------------------------------------------------------------- terminal UI
export function open(container, say) {
  onSay = say || onSay;
  container.hidden = false;
  cv = container.querySelector('canvas'); g = cv.getContext('2d'); log = container.querySelector('.fl');
  fit(); draw();
  if (!log.children.length) term('PRIME FORGE מוכן. ' + HELP.replace('אני בונה משחקים בעצמי, אדוני. ', ''));
  window.addEventListener('resize', fit);
}
export function close(container) { stopPlay(); container.hidden = true; }
function term(msg) { if (!log) return; const p = document.createElement('p'); p.textContent = '> ' + msg; log.append(p); log.scrollTop = log.scrollHeight; }
function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); if (!play) draw(); }
const theme = () => THEMES[L.theme] || THEMES['ניאון'];

function tile(c, k, x, y, s, th, t) {
  const cx = x + s / 2, cy = y + s / 2;
  c.shadowBlur = 0;
  switch (k) {
    case 'block': c.fillStyle = th.ground + '33'; c.fillRect(x, y, s, s); c.strokeStyle = th.ground; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, s - 2, s - 2); break;
    case 'plat': c.fillStyle = th.plat; c.fillRect(x, y + s * 0.1, s, s * 0.22); break;
    case 'coin': c.fillStyle = '#ffd23f'; c.shadowColor = '#ffd23f'; c.shadowBlur = 10; c.beginPath(); c.ellipse(cx, cy, s * 0.22 * Math.abs(Math.cos(t * 3)) + 2, s * 0.24, 0, 0, 7); c.fill(); break;
    case 'star': c.fillStyle = '#fff'; c.shadowColor = th.accent; c.shadowBlur = 14; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.14 : s * 0.32, a = i * Math.PI / 5 - Math.PI / 2 + t; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.fill(); break;
    case 'spike': c.fillStyle = '#ff4d5e'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + i * s / 3, y + s); c.lineTo(x + i * s / 3 + s / 6, y + s * 0.35); c.lineTo(x + (i + 1) * s / 3, y + s); c.fill(); } break;
    case 'lava': c.fillStyle = '#ff6a3d'; c.shadowColor = '#ff6a3d'; c.shadowBlur = 12; c.fillRect(x, y + s * 0.25 + Math.sin(t * 4 + x) * 3, s, s * 0.75); break;
    case 'spring': c.strokeStyle = '#3ddc84'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i <= 6; i++) c.lineTo(x + (i % 2 ? s * 0.8 : s * 0.2), y + s - i * s * 0.1); c.stroke(); c.fillStyle = '#3ddc84'; c.fillRect(x + s * 0.1, y + s * 0.3, s * 0.8, s * 0.12); break;
    case 'flag': c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + s * 0.25, y + s); c.lineTo(x + s * 0.25, y - s * 0.6); c.stroke(); c.fillStyle = th.accent; c.beginPath(); c.moveTo(x + s * 0.25, y - s * 0.6); c.lineTo(x + s * 0.9, y - s * 0.35); c.lineTo(x + s * 0.25, y - s * 0.1); c.fill(); break;
    case 'enemy': c.fillStyle = '#ff4d5e'; c.shadowColor = '#ff4d5e'; c.shadowBlur = 10; c.beginPath(); c.arc(cx, cy + 3, s * 0.36, Math.PI, 0); c.lineTo(x + s * 0.86, y + s); c.lineTo(x + s * 0.14, y + s); c.fill(); c.shadowBlur = 0; c.fillStyle = '#fff'; c.fillRect(cx - 9, cy - 2, 6, 6); c.fillRect(cx + 3, cy - 2, 6, 6); break;
    case 'deco': c.strokeStyle = th.plat; c.lineWidth = 2; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(cx, y + s); c.lineTo(cx, y + s * 0.45); c.stroke(); c.fillStyle = th.ground + '55'; c.beginPath(); c.arc(cx, y + s * 0.35, s * 0.32, 0, 7); c.fill(); c.globalAlpha = 1; break;
    case 'start': c.strokeStyle = '#ffffff66'; c.setLineDash([4, 4]); c.strokeRect(x + 4, y + 4, s - 8, s - 8); c.setLineDash([]); break;
  }
}
function label(c, txt, x, y) { c.shadowBlur = 0; c.font = 'bold 12px Heebo, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffffcc'; c.fillText(txt, x, y); }
function hero(c, x, y, s, col, face) {
  c.shadowColor = col; c.shadowBlur = 16; c.fillStyle = col; c.beginPath(); c.roundRect(x - s * 0.32, y - s * 0.42, s * 0.64, s * 0.84, 10); c.fill();
  c.shadowBlur = 0; c.fillStyle = '#03070f'; c.fillRect(x + face * s * 0.08 - 3, y - s * 0.2, 6, 8); c.fillRect(x + face * s * 0.08 + 7 * face - 3, y - s * 0.2, 6, 8);
}
function background(c, W, H, th, t, camX) {
  c.fillStyle = L.bg || th.bg; c.fillRect(0, 0, W, H);
  if (th.stars) { c.fillStyle = '#ffffffaa'; for (let i = 0; i < 60; i++) { const x = ((i * 137 - camX * 0.2) % W + W) % W, y = (i * 71) % H; c.fillRect(x, y, 2, 2); } }
  c.strokeStyle = (th.accent) + '14'; c.lineWidth = 1; for (let x = -camX % T; x < W; x += T) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
}
function draw() {
  if (!g) return; const W = cv.width, H = cv.height, s = Math.min(H / L.h, 999), th = theme(), t = performance.now() / 1000;
  const sc = s / T; g.setTransform(1, 0, 0, 1, 0, 0); background(g, W, H, th, t, 0);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  for (const o of L.objs) { tile(g, o.k, o.x * T, o.y * T, T, th, t); if (o.name) label(g, o.name, o.x * T + T / 2, o.y * T - 4); }
  const st = L.objs.find((o) => o.k === 'start'); if (st) hero(g, st.x * T + T / 2, st.y * T + T / 2, T, L.hero, 1);
}

// ---------------------------------------------------------------- play mode (physics)
const keys = {};
addEventListener('keydown', (e) => { if (!play) return; keys[e.key] = true; if ([' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key) && document.activeElement?.tagName !== 'INPUT') e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.key] = false; });
export function pad(btn, down) { keys['pad' + btn] = down; }

function start() {
  stopPlay();
  const st = L.objs.find((o) => o.k === 'start') || { x: 2, y: L.h - 2 };
  const world = { solids: new Map(), items: [], enemies: [], w: L.w };
  const addTile = (o, dx = 0) => {
    const k = o.k, x = o.x + dx;
    if (k === 'block' || k === 'plat') world.solids.set(x + ',' + o.y, k);
    else if (k === 'enemy') world.enemies.push({ name: o.name, x: x * T + T / 2, y: o.y * T + T / 2, vx: (Math.random() < 0.5 ? -1 : 1) * 70 * L.enemySpd, vy: 0, alive: true });
    else if (k !== 'start') world.items.push({ k, x, y: o.y, on: true, name: o.name });
  };
  L.objs.forEach((o) => addTile(o));
  let chunk = 1;
  const grow = () => { // infinite mode: copy the level again to the right with a few random extras
    const dx = chunk * L.w; chunk++;
    L.objs.filter((o) => o.k !== 'flag' && o.k !== 'start').forEach((o) => addTile(o, dx));
    for (let i = 0; i < 4; i++) world.enemies.push({ x: (dx + rnd(4, L.w - 4)) * T, y: (L.h - 2) * T + T / 2, vx: -70 * L.enemySpd, vy: 0, alive: true });
    world.w += L.w;
  };
  play = { p: { x: st.x * T + T / 2, y: st.y * T + T / 2, vx: 0, vy: 0, ground: false, jumps: 0, face: 1, inv: 0, sx: st.x * T + T / 2, sy: st.y * T + T / 2 },
    world, grow, score: 0, lives: L.lives, camX: 0, msg: null, over: false, jHeld: false, power: 0 };
  let last = performance.now();
  const loop = (now) => { if (!play) return; const dt = Math.min(0.033, (now - last) / 1000); last = now; step(dt); render(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
}
function stopPlay() { cancelAnimationFrame(raf); play = null; draw(); }
const solidAt = (px, py) => play.world.solids.get(Math.floor(px / T) + ',' + Math.floor(py / T));

function step(dt) {
  const P = play, p = P.p, wd = P.world, hw = T * 0.3, hh = T * 0.42;
  if (P.over) return;
  const L1 = keys.ArrowLeft || keys.a || keys.padL, R1 = keys.ArrowRight || keys.d || keys.padR, U = keys.ArrowUp || keys.w || keys[' '] || keys.padU, D = keys.ArrowDown || keys.s || keys.padD;
  const sp = 260 * L.spd;
  if (L.grav) {
    p.vx += ((R1 ? 1 : 0) - (L1 ? 1 : 0)) * sp * 10 * dt; p.vx *= p.ground ? 0.8 : 0.92; p.vx = Math.max(-sp, Math.min(sp, p.vx));
    if (U && !P.jHeld && (p.ground || (L.dbl && p.jumps < 2))) { p.vy = -620 * Math.sqrt(L.jump); p.jumps = p.ground ? 1 : 2; p.ground = false; }
    P.jHeld = U; p.vy = Math.min(p.vy + 1700 * dt, 1100);
  } else { p.vx = ((R1 ? 1 : 0) - (L1 ? 1 : 0)) * sp; p.vy = ((D ? 1 : 0) - (U ? 1 : 0)) * sp; }
  if (R1) p.face = 1; if (L1) p.face = -1;
  // move X
  p.x += p.vx * dt;
  for (const yy of [p.y - hh + 2, p.y + hh - 2]) { const k = solidAt(p.x + (p.vx > 0 ? hw : -hw), yy); if (k === 'block') { p.x = p.vx > 0 ? Math.floor((p.x + hw) / T) * T - hw - 0.01 : Math.floor((p.x - hw) / T + 1) * T + hw + 0.01; p.vx = 0; } }
  // move Y
  const oldBottom = p.y + hh; p.y += p.vy * dt; p.ground = false;
  for (const xx of [p.x - hw + 2, p.x + hw - 2]) {
    const kb = solidAt(xx, p.y + hh);
    if (p.vy >= 0 && kb && (kb === 'block' || oldBottom <= Math.floor((p.y + hh) / T) * T + 4)) { p.y = Math.floor((p.y + hh) / T) * T - hh; p.vy = 0; p.ground = true; p.jumps = 0; }
    const kt = solidAt(xx, p.y - hh); if (p.vy < 0 && kt === 'block') { p.y = Math.floor((p.y - hh) / T + 1) * T + hh; p.vy = 0; }
  }
  p.x = Math.max(hw, Math.min(wd.w * T - hw, p.x)); if (!L.grav) p.y = Math.max(hh, Math.min(L.h * T - hh, p.y));
  p.inv -= dt; P.power -= dt;
  if (L.inf && p.x > (wd.w - L.w * 0.6) * T) P.grow();
  // items
  for (const it of wd.items) {
    if (!it.on) continue; const ix = it.x * T + T / 2, iy = it.y * T + T / 2;
    if (Math.abs(ix - p.x) > T * 0.75 || Math.abs(iy - p.y) > T * 0.8) continue;
    if (it.k === 'coin') { it.on = false; P.score += 10; }
    else if (it.k === 'star') { it.on = false; P.power = 6; P.score += 50; P.msg = { t: '⭐ כוח על!', life: 1.5 }; }
    else if (it.k === 'spring' && p.vy >= 0) { p.vy = -1000; p.ground = false; }
    else if (it.k === 'spike' || it.k === 'lava') hurt();
    else if (it.k === 'flag' && !L.inf) { P.over = true; P.msg = { t: `🏆 ניצחת! ${P.score} נקודות`, life: 99 }; onSay(`ניצחת, אדוני! ${P.score} נקודות.`); }
  }
  // enemies
  for (const e of wd.enemies) {
    if (!e.alive) continue;
    e.vy = Math.min(e.vy + 1700 * dt, 1100); e.x += e.vx * dt; e.y += e.vy * dt;
    if (solidAt(e.x, e.y + T * 0.4)) { e.y = Math.floor((e.y + T * 0.4) / T) * T - T * 0.4; e.vy = 0; if (!solidAt(e.x + Math.sign(e.vx) * T * 0.5, e.y + T * 0.6)) e.vx *= -1; }
    if (solidAt(e.x + Math.sign(e.vx) * T * 0.45, e.y) === 'block') e.vx *= -1;
    if (e.y > L.h * T + 200) e.alive = false;
    if (Math.abs(e.x - p.x) < T * 0.6 && Math.abs(e.y - p.y) < T * 0.75) {
      if ((L.grav && p.vy > 60 && p.y < e.y - T * 0.2) || P.power > 0) { e.alive = false; p.vy = -450; P.score += 100; } else hurt();
    }
  }
  if (L.grav && p.y > L.h * T + 100) { hurt(true); }
  P.camX = Math.max(0, Math.min(wd.w * T - cv.width / (cv.height / (L.h * T)), p.x - (cv.width / (cv.height / (L.h * T))) * 0.4));
  if (P.msg) { P.msg.life -= dt; if (P.msg.life <= 0) P.msg = null; }
}
function hurt(fell) {
  const P = play, p = P.p; if (P.over || (p.inv > 0 && !fell)) return;
  P.lives--; p.inv = 1.5;
  if (fell || P.lives <= 0) { p.x = p.sx; p.y = p.sy; p.vx = p.vy = 0; }
  if (P.lives <= 0) { P.over = true; P.msg = { t: `💥 נגמר! ${P.score} נקודות – כתבו "שחק" כדי לנסות שוב`, life: 99 }; onSay('נגמרו החיים, אדוני. רוצה לנסות שוב?'); }
}
function render() {
  const P = play, W = cv.width, H = cv.height, sc = H / (L.h * T), th = theme(), t = performance.now() / 1000;
  g.setTransform(1, 0, 0, 1, 0, 0); background(g, W, H, th, t, P.camX * sc);
  g.setTransform(sc, 0, 0, sc, -P.camX * sc, 0);
  const x0 = Math.floor(P.camX / T) - 1, x1 = x0 + Math.ceil(W / sc / T) + 2;
  for (const [key, k] of P.world.solids) { const [x, y] = key.split(',').map(Number); if (x >= x0 && x <= x1) tile(g, k, x * T, y * T, T, th, t); }
  for (const it of P.world.items) if (it.on && it.x >= x0 && it.x <= x1) { tile(g, it.k, it.x * T, it.y * T, T, th, t); if (it.name) label(g, it.name, it.x * T + T / 2, it.y * T - 4); }
  for (const e of P.world.enemies) if (e.alive) { tile(g, 'enemy', e.x - T / 2, e.y - T / 2, T, th, t); if (e.name) label(g, e.name, e.x, e.y - T / 2 - 4); }
  if (!(P.p.inv > 0 && Math.floor(t * 10) % 2)) hero(g, P.p.x, P.p.y, T, P.power > 0 ? '#ffd23f' : L.hero, P.p.face);
  g.setTransform(1, 0, 0, 1, 0, 0); g.shadowBlur = 0;
  const f = Math.round(16 * Math.min(2, devicePixelRatio || 1));
  g.font = `bold ${f}px Heebo, sans-serif`; g.fillStyle = '#fff'; g.textAlign = 'right';
  g.fillText(`⭐ ${P.score}   ❤ ${Math.max(0, P.lives)}`, W - 12, f + 8);
  if (P.msg) { // fit the message to the screen; a second line after " – "
    g.textAlign = 'center'; const [l1, l2] = P.msg.t.split(' – ');
    let fs = f * 1.5; g.font = `bold ${fs}px Heebo, sans-serif`;
    while (g.measureText(l1).width > W * 0.9 && fs > 10) { fs -= 2; g.font = `bold ${fs}px Heebo, sans-serif`; }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H / 2 - fs * 1.3, W, fs * (l2 ? 2.6 : 1.8));
    g.fillStyle = '#fff'; g.fillText(l1, W / 2, H / 2);
    if (l2) { const s2 = Math.min(fs * 0.6, f); g.font = `bold ${s2}px Heebo, sans-serif`; g.fillStyle = '#ffd23f'; g.fillText(l2.replace(/"/g, ''), W / 2, H / 2 + fs * 0.95); }
  }
}
export const isPlaying = () => !!play;

// read-only peek for automated tests / recordings
export const _peek = () => play && { p: play.p, enemies: play.world.enemies, items: play.world.items, over: play.over, msg: play.msg, score: play.score, solid: (x, y) => solidAt(x, y), T, w: play.world.w };
