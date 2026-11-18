// Feature catalog for the modular install. Sizes are approximate downloads (MB).
// "always" features are pure code and ship with the app shell.
export const ALWAYS = [
  { id: 'brain', ic: '💬', name: 'מוח בקוד + קיצורים', desc: '"שלום", "ג\'רוויס" → "כן, אדוני?"' },
  { id: 'diary', ic: '📒', name: 'יומן ותזכורות', desc: 'התראות + "הוסף ליומן"' },
  { id: 'learn', ic: '🧠', name: 'לומד מתיקונים', desc: 'זוכר איך אתה אוהב שיענו לך' },
];

export const OPTIONAL = [
  { id: 'games', ic: '🎮', name: 'יצירת משחקים (שרבוטון)', desc: 'מיני־משחקים בקוד', mb: 0.3, urls: ['games/doodle.html'] },
  { id: 'hands', ic: '✋', name: 'ידיים – זום במצלמה', desc: 'הגדלה והקטנה של הליבה בצביטה', mb: 8,
    urls: ['https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js', '../js/gestures.js'] },
  { id: 'pose', ic: '🧍', name: 'זיהוי אנשים – שלד תלת־מימד', desc: 'רק "יש פה אדם ואיך הוא עומד" – בלי לזהות מי', mb: 10,
    urls: ['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'] },
  { id: 'knowledge', ic: '📚', name: 'רמת ידע', desc: 'כמה ג\'רוויס יודע ומסביר', levels: true },
];

export const KNOWLEDGE = [
  { id: 'light', label: '🟢 קליל', mb: 5, desc: 'הדברים החשובים והמקיפים, בקצרה' },
  { id: 'medium', label: '🟡 בינוני', mb: 50, desc: 'יותר נושאים ויותר הסברים' },
  { id: 'heavy', label: '🔴 קשוח', mb: 700, desc: 'הכול מהכול, עם מוח AI מלא במכשיר' },
];

export const CORE3D_MB = 0.6;
export const SHELL_MB = 0.2;

export function totalMB(s) {
  let mb = SHELL_MB;
  if (s.core === '3d') mb += CORE3D_MB;
  for (const f of OPTIONAL) {
    if (!s.features[f.id]) continue;
    mb += f.levels ? KNOWLEDGE.find((k) => k.id === s.knowledge).mb : f.mb;
  }
  return mb;
}

export function fmtMB(mb) {
  return mb >= 100 ? `${Math.round(mb)}MB` : `${mb.toFixed(1)}MB`;
}
