// Install as an app on every platform – no store, no server.
// Android / Windows / Mac (Chrome, Edge): the browser's own install prompt.
// iPhone / iPad (Safari): Share → "Add to Home Screen".  Mac Safari: File → "Add to Dock".
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('prime-installable')); });

export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canPrompt = () => !!deferred;

export function platform() {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua)) return /Chrome|Edg\//.test(ua) ? 'mac' : 'mac-safari';
  if (/Windows/.test(ua)) return 'windows';
  return 'other';
}

export const STEPS = {
  ios: ['פתח את הדף ב־Safari', 'לחץ על כפתור השיתוף ⬆️ למטה', 'בחר "הוסף למסך הבית" ➕', 'לחץ "הוסף" – ג\'רוויס פריים יופיע עם אייקון משלו'],
  android: ['פתח ב־Chrome', 'לחץ "התקן" (או ⋮ ← "התקנת אפליקציה")', 'ג\'רוויס פריים יופיע במסך הבית'],
  windows: ['פתח ב־Chrome או Edge', 'לחץ "התקן" (או על סמל ההתקנה בשורת הכתובת)', 'ג\'רוויס פריים ייפתח בחלון משלו ויופיע בתפריט התחל'],
  mac: ['פתח ב־Chrome או Edge', 'לחץ "התקן" (או על סמל ההתקנה בשורת הכתובת)', 'ג\'רוויס פריים יופיע ב־Launchpad וב־Dock'],
  'mac-safari': ['ב־Safari: תפריט "קובץ" ← "הוסף ל־Dock"', 'ג\'רוויס פריים יופיע ב־Dock כאפליקציה'],
  other: ['פתח ב־Chrome, Edge או Safari', 'חפש "התקן" או "הוסף למסך הבית" בתפריט הדפדפן'],
};
export const NAMES = { ios: 'iPhone / iPad', android: 'אנדרואיד', windows: 'Windows', mac: 'Mac', 'mac-safari': 'Mac (Safari)', other: 'המכשיר שלך' };

// Returns 'installed' | 'dismissed' | 'manual' (show STEPS)
export async function install() {
  if (isInstalled()) return 'installed';
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferred = null;
    return outcome === 'accepted' ? 'installed' : 'dismissed';
  }
  return 'manual';
}
