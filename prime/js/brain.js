// JARVIS PRIME brain – layer 1: instant shortcuts in pure code (<1ms, no AI, no network).
// Batch 2 extends this with commands, memory, diary and knowledge levels.
import { GREETING_HE } from './voice.js';

const norm = (t) => t.toLowerCase()
  .replace(/[׳']/g, "'")
  .replace(/[.,!?؟"״]/g, ' ')
  .replace(/\s+/g, ' ').trim();

const SHORTCUTS = [
  { re: /^(שלום|היי|הי|אהלן|הלו|בוקר טוב|ערב טוב|hello|hi|hey)( ג'?רוויס| פריים)?$/, say: () => GREETING_HE },
  { re: /^(ג'?רוויס|ג'ארוויס|jarvis)$/, say: () => 'כן, אדוני?' },
  { re: /^(מה השעה|כמה השעה|שעה)$/, say: () => `השעה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}, אדוני.` },
  { re: /^(מה התאריך|איזה יום היום|תאריך)$/, say: () => `היום ${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}.` },
  { re: /^(תודה|תודה רבה|thanks)( ג'?רוויס)?$/, say: () => 'לשירותך, אדוני.' },
  { re: /^(מי אתה|מה אתה)$/, say: () => "אני ג'רוויס פריים, העוזר האישי שלך. אני רץ רק אצלך במכשיר – בלי שרתים." },
];

export function reply(text) {
  const t = norm(text);
  for (const s of SHORTCUTS) if (s.re.test(t)) return { text: s.say(), via: 'shortcut' };
  return { text: 'עוד לא למדתי את זה, אדוני. בקרוב.', via: 'unknown' };
}
