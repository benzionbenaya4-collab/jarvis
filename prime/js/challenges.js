// RIVALS challenges – Jarvis gives a challenge, you play, you report back. Score kept on this device.
// Weapon names as they appear in the game (English). The list can be edited by talking:
// "תוסיף נשק X" / "תמחק נשק X".
const KEY = 'prime.challenges.v1';
const DEFAULT_WEAPONS = ['Assault Rifle', 'Burst Rifle', 'Sniper', 'Shotgun', 'Handgun', 'Revolver', 'Uzi', 'Minigun', 'RPG',
  'Bow', 'Crossbow', 'Katana', 'Scythe', 'Fists', 'Chainsaw', 'Knife', 'Grenade', 'Flare Gun', 'Paintball Gun', 'Slingshot', 'Exogun'];
const MELEE = ['Katana', 'Scythe', 'Fists', 'Chainsaw', 'Knife'];

let st = load();
function load() { try { return { weapons: DEFAULT_WEAPONS, done: 0, failed: 0, streak: 0, best: 0, n: 0, cur: null, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { weapons: DEFAULT_WEAPONS, done: 0, failed: 0, streak: 0, best: 0, n: 0, cur: null }; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pickNot = (a, not) => pick(a.filter((x) => x !== not)) || pick(a);

const EASY = [
  (w) => `לנצח סבב אחד רק עם ${w}.`,
  (w) => `להשיג 3 הריגות עם ${w}.`,
  (w) => `לשחק סבב שלם עם ${w} – ובלי למות פעמיים.`,
];
const HARD = [
  (w) => `לנצח משחק שלם רק עם ${w}.`,
  (w) => `לנצח סבב עם ${w} – בלי לקפוץ אפילו פעם אחת.`,
  (w) => `להשיג 5 הריגות ברצף עם ${w}.`,
  (w, a) => `לנצח סבב כשאתה מחליף נשק אחרי כל הריגה: מתחילים עם ${w}, אחר כך ${a}.`,
  () => `לנצח סבב רק עם נשק קרב מגע: ${pick(MELEE.filter((m) => st.weapons.includes(m))) || 'Fists'}.`,
  (w) => `לנצח סבב עם ${w} כשאתה לא מתכופף ולא מחליק.`,
];

export function command(t, raw = t) {
  let m;
  if (/^(?:תן|תביא|תעשה)(?: לי)? (?:אתגר|צ'אלנג')(?: .*)?$|^(?:אתגר|עוד אתגר|אתגר חדש|אתגר קשה|אתגר קל)(?: ב?רייבלס| ב?rivals)?$/.test(t)) {
    const hard = /קשה|מטורף|אכזרי/.test(t), w = pickNot(st.weapons, st.last), a = pickNot(st.weapons, w);
    st.last = w;
    st.n++; st.cur = { text: (hard ? pick(HARD) : pick(EASY))(w, a), hard, at: Date.now() }; save();
    return { text: `אתגר מספר ${st.n}${hard ? ' – קשה 🔥' : ''}: ${st.cur.text} בהצלחה, אדוני.`, via: 'challenge', card: { n: st.n, hard, text: st.cur.text } };
  }
  if (/^(השלמתי|עשיתי את זה|הצלחתי|ניצחתי|סיימתי את האתגר)$/.test(t)) {
    if (!st.cur) return { text: 'אין אתגר פתוח, אדוני. תגיד "תן לי אתגר".', via: 'challenge' };
    st.done++; st.streak++; st.best = Math.max(st.best, st.streak); st.cur = null; save();
    return { text: `מרשים, אדוני! 🏆 אתגר הושלם. רצף: ${st.streak}. ${st.streak >= 3 ? 'אתה בלתי ניתן לעצירה.' : 'מוכן לעוד אחד?'}`, via: 'challenge' };
  }
  if (/^(נכשלתי|לא הצלחתי|הפסדתי|ויתרתי)$/.test(t)) {
    if (!st.cur) return { text: 'אין אתגר פתוח, אדוני.', via: 'challenge' };
    st.failed++; st.streak = 0; st.cur = null; save();
    return { text: 'גם לגיבורים יש ימים כאלה, אדוני. הרצף התאפס – רוצה הזדמנות נוספת?', via: 'challenge' };
  }
  if (/^(מה האתגר|מה האתגר שלי|תזכיר לי את האתגר)$/.test(t)) return { text: st.cur ? `האתגר שלך: ${st.cur.text}` : 'אין אתגר פתוח, אדוני.', via: 'challenge' };
  if (/^(כמה אתגרים|סטטיסטיקה|התוצאות שלי|מה התוצאות)$/.test(t)) return { text: `הושלמו ${st.done}, נכשלו ${st.failed}. רצף נוכחי ${st.streak}, השיא שלך ${st.best}.`, via: 'challenge' };
  if ((m = t.match(/^(?:תוסיף|הוסף) נשק (.+)$/i))) { m = raw.match(/נשק\s+(.+?)\s*$/) || m; st.weapons = [...new Set([...st.weapons, m[1].trim()])]; save(); return { text: `הוספתי את ${m[1].trim()} לרשימת הנשקים.`, via: 'challenge' }; }
  if ((m = t.match(/^(?:תמחק|תוריד|מחק) נשק (.+)$/i))) { const w = m[1].trim().toLowerCase(); st.weapons = st.weapons.filter((x) => x.toLowerCase() !== w); save(); return { text: `הורדתי את ${m[1].trim()}.`, via: 'challenge' }; }
  if (/^(אילו נשקים|רשימת נשקים|נשקים)$/.test(t)) return { text: 'הנשקים שלי: ' + st.weapons.join(', '), via: 'challenge' };
  return null;
}
