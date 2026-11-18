// Knowledge levels – all on this device.
//  light  : small Hebrew fact pack (knowledge/light.json)
//  medium : light + more topics with longer explanations (knowledge/medium.json – skeleton, grows over time)
//  heavy  : medium + a full AI brain running in the browser (WebLLM, ~700MB, downloaded once)
let items = [];
let level = null;
let llm = null;

const STOP = new Set(['מה', 'מי', 'איך', 'למה', 'כמה', 'איזה', 'איזו', 'זה', 'זו', 'של', 'את', 'על', 'עם', 'יש', 'הוא', 'היא',
  'אני', 'אתה', 'לי', 'לך', 'תגיד', 'תספר', 'ספר', 'אדוני', 'בבקשה', 'ג\'רוויס', 'גרוויס', 'הכי', 'בעולם', 'יש', 'היה', 'היתה', 'זה', 'דבר', 'יודע']);
export function words(t) {
  return (t.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).filter((w) => w.length > 1 && !STOP.has(w));
}
const stem = (w) => w.length > 3 ? w.replace(/(ים|ות|ה|ת|י)$/, '') : w;
// Hebrew glues prefixes (ה, ב, ל, ו, מ, ש, כ) to words – try each reading.
function variants(w) {
  const v = new Set([stem(w)]);
  const m1 = w.match(/^[והבלמשכ]([֐-׿]{2,})$/); if (m1) v.add(stem(m1[1]));
  const m2 = w.match(/^[והבלמשכ]{2}([֐-׿]{2,})$/); if (m2) v.add(stem(m2[1]));
  return v;
}
const match = (a, b) => { for (const x of a) for (const y of b) if (x === y || (x.length > 2 && y.length > 2 && (x.startsWith(y) || y.startsWith(x)))) return true; return false; };

export async function loadLevel(lv) {
  if (!lv || lv === level) return;
  level = lv; items = [];
  const packs = lv === 'light' ? ['light'] : ['light', 'medium'];
  for (const p of packs) {
    try { const r = await fetch(new URL(`../knowledge/${p}.json`, import.meta.url)); items.push(...(await r.json()).items); } catch { /* offline & not cached */ }
  }
}

// Best fact for the question, or null.
export function lookup(text) {
  const q = words(text).filter((w) => !STOP.has(w)).map(variants);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const it of items) {
    it._v ||= it.k.map((k) => variants(k.toLowerCase()));
    let hit = 0;
    for (const w of q) if (it._v.some((k) => match(w, k))) hit++;
    const score = hit / Math.max(2, q.length) + hit * 0.01;
    if (hit >= Math.min(2, it.k.length) && score > bestScore) { best = it; bestScore = score; }
  }
  if (!best || bestScore < 0.5) return null;
  return level !== 'light' && best.m ? best.m : best.a;
}

// --------------------------------------------------------------- heavy: AI in the browser
export const aiAvailable = () => level === 'heavy' && 'gpu' in navigator;

export async function askAI(text, onToken, onProgress) {
  if (!aiAvailable()) return null;
  if (!llm) {
    const { CreateMLCEngine } = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm');
    llm = await CreateMLCEngine('gemma3-1b-it-q4f16_1-MLC',
      { initProgressCallback: (p) => onProgress?.(p) }, { sliding_window_size: -1 });
  }
  const chunks = await llm.chat.completions.create({
    stream: true, temperature: 0.5, max_tokens: 220,
    messages: [
      { role: 'system', content: "You are JARVIS PRIME, a polite, calm personal assistant. Address the user as 'אדוני'. Answer in the user's language, briefly (1-3 sentences)." },
      { role: 'user', content: text },
    ],
  });
  let out = '';
  for await (const c of chunks) { const d = c.choices[0]?.delta?.content || ''; out += d; onToken?.(out); }
  return out.trim();
}
