// Jarvis Prime voice: an ORIGINAL calm "butler computer" voice built from the
// device's own speech engine (Web Speech API). No cloning, no server.
export const GREETING_HE = 'שלום אדוני, במה אוכל לעזור לך?';
export const GREETING_EN = 'Hello sir, how may I help you?';

export const PRESETS = [
  { id: 'deep', name: 'קול 1 – עמוק ורגוע', desc: 'גברי, נמוך, נינוח', lang: 'he', pitch: 0.8, rate: 0.95 },
  { id: 'formal', name: 'קול 2 – רשמי', desc: 'גברי, קצב איטי ומדוד', lang: 'he', pitch: 0.92, rate: 0.86 },
  { id: 'bright', name: 'קול 3 – חד ומהיר', desc: 'בהיר ויעיל', lang: 'he', pitch: 1.05, rate: 1.08 },
  { id: 'en', name: 'קול 4 – באנגלית', desc: 'English, deep and calm', lang: 'en', pitch: 0.8, rate: 0.95 },
];

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices = [];
const listeners = new Set();
function refresh() { voices = synth ? synth.getVoices() : []; listeners.forEach((f) => f(voices)); }
if (synth) { refresh(); synth.addEventListener?.('voiceschanged', refresh); }

export const supported = !!synth;
export function onVoices(fn) { listeners.add(fn); if (voices.length) fn(voices); }
export function allVoices() { return voices; }

const MALE = /(male|asaf|avri|daniel|george|ryan|arthur|guy|oliver|james|thomas|david)/i;
function pick(lang, name) {
  if (name) { const v = voices.find((x) => x.name === name); if (v) return v; }
  const base = lang === 'en' ? 'en' : 'he';
  const m = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base) || (base === 'he' && /^iw/i.test(v.lang)));
  if (base === 'en') return m.find((v) => /en-GB/i.test(v.lang) && MALE.test(v.name)) || m.find((v) => /en-GB/i.test(v.lang)) || m.find((v) => MALE.test(v.name)) || m[0];
  return m.find((v) => MALE.test(v.name)) || m[0];
}

let hooks = {};
export function setHooks(h) { hooks = h || {}; }

// speak(text, {preset, voiceName, pitch, rate})
export function speak(text, opt = {}) {
  if (!synth || !text) return Promise.resolve();
  const p = PRESETS.find((x) => x.id === opt.preset) || PRESETS[0];
  const lang = /[\u0590-\u05FF]/.test(text) ? 'he' : 'en';
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'he' ? 'he-IL' : 'en-GB';
    const v = pick(lang, opt.voiceName);
    if (v) u.voice = v;
    u.pitch = opt.pitch ?? p.pitch;
    u.rate = opt.rate ?? p.rate;
    u.onstart = () => hooks.onStart?.();
    u.onboundary = () => hooks.onBoundary?.();
    u.onend = u.onerror = () => { hooks.onEnd?.(); resolve(); };
    synth.speak(u);
  });
}

export function stop() { synth?.cancel(); }
