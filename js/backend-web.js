// Web edition "server": everything the PC server does, but inside the browser.
// - The AI model runs in Chrome via WebGPU (WebLLM), downloaded once and cached by the browser.
// - Memory and settings live in this browser (localStorage).
// - Web search uses Wikipedia, which allows requests from web pages; background learning
//   researches recent questions while the page is open and idle.
import { CreateMLCEngine, CreateWebWorkerMLCEngine } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';

export const MODELS = {
  // WebLLM's Gemma 3 record sets both window sizes; it requires exactly one, so turn the sliding one off.
  light: { id: 'gemma3-1b-it-q4f16_1-MLC', label: 'LIGHT', size: '0.7 GB', chatOpts: { sliding_window_size: -1 } },
  balanced: { id: 'gemma-2-2b-it-q4f16_1-MLC', idF32: 'gemma-2-2b-it-q4f32_1-MLC', label: 'BALANCED', size: '1.9 GB' },
  smart: { id: 'gemma-4-E2B-it-q4f16_1-MLC', idF32: 'gemma-4-E2B-it-q4f32_1-MLC', label: 'SMART', size: '3.4 GB' },
};
const MAX_MESSAGES = 1500;
const RECENT = 8;
const LEARN_EVERY_MS = 20 * 60 * 1000;

// ------------------------------------------------------------------ storage
const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('jarvis.web.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jarvis.web.' + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
const DEFAULT_SETTINGS = { color: '#00e5ff', voice_lang: 'he-IL', speak_replies: true, model_tier: 'balanced' };

// ------------------------------------------------------------------ text helpers (same idea as backend/memory.py)
const HEB = /[֐-׿]/;
const STOP = new Set(['את', 'של', 'על', 'עם', 'זה', 'זו', 'מה', 'מי', 'איך', 'למה', 'אני', 'אתה', 'הוא', 'היא', 'יש', 'אין',
  'לי', 'לך', 'גם', 'כל', 'אבל', 'או', 'אם', 'כי', 'רק', 'עוד', 'כמה', 'איזה', 'אדוני', 'תגיד', 'the', 'a', 'an', 'is', 'are',
  'what', 'who', 'how', 'why', 'do', 'does', 'i', 'you', 'me', 'my', 'to', 'of', 'in', 'on', 'and', 'or', 'it', 'this', 'that',
  'for', 'jarvis', 'tell', 'please', 'can']);
function keywords(text) {
  const out = [];
  for (let w of text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []) {
    w = w.replace(/^[ובלמשהכ]{1,2}(?=[֐-׿]{3,})/, '').replace(/'/g, '');
    if (w.length >= 2 && !STOP.has(w) && !/ארביס|jarvis/.test(w) && !out.includes(w)) out.push(w);
  }
  return out;
}
function overlap(a, b) { const s = new Set(b); return a.filter((w) => s.has(w)).length; }
const when = (ts) => new Date(ts).toLocaleDateString('en-GB');

// ------------------------------------------------------------------ commands the web edition can do
const OPEN_VERB = /(תפתח|פתח|לפתוח|תפעיל|הפעל|\bopen\b|\blaunch\b|\bgo to\b)/i;
const SITES = {
  'https://www.youtube.com': ['youtube', 'יוטיוב'], 'https://www.google.com': ['google', 'גוגל'],
  'https://mail.google.com': ['gmail', "ג'ימייל"], 'https://web.whatsapp.com': ['whatsapp', 'וואטסאפ', 'ווטסאפ'],
  'https://www.netflix.com': ['netflix', 'נטפליקס'], 'https://www.instagram.com': ['instagram', 'אינסטגרם'],
  'https://www.ynet.co.il': ['ynet', 'ווינט'], 'https://maps.google.com': ['maps', 'מפות'],
};
function command(text) {
  if (!OPEN_VERB.test(text)) return null;
  const he = HEB.test(text);
  const domain = text.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})(\/\S*)?/i);
  let url = domain ? `https://${domain[0].replace(/^https?:\/\//, '')}` : null;
  if (!url) {
    for (const [u, names] of Object.entries(SITES)) if (names.some((n) => text.toLowerCase().includes(n))) url = u;
  }
  if (url) return { reply: he ? 'פותח, אדוני.' : 'Opening it now, sir.', actions: [{ type: 'open_url', url }] };
  return { reply: he ? 'בגרסת האתר אני לא יכול לפתוח תוכנות במחשב, רק אתרים. בגרסה שמותקנת במחשב אני יכול.'
    : "In the web edition I can open websites, but not programs on your computer. The installed edition can.", actions: [] };
}

// ------------------------------------------------------------------ Wikipedia search
const SEARCH_TRIGGER = /(תחפש|חפש|לחפש|בגוגל|באינטרנט|ברשת|גוגל|ויקיפדיה|search|google|look up|wikipedia)/i;
const STRIP = /(ג['׳]?ארביס|jarvis|תחפש לי|תחפש|חפש לי|חפש|לחפש|בגוגל|באינטרנט|ברשת|בויקיפדיה|search for|search|google|look up|please|בבקשה)/gi;
const cleanQuery = (t) => t.replace(STRIP, ' ').replace(/\s+/g, ' ').replace(/^[\s?.!,]+|[\s?.!,]+$/g, '') || t;

async function wikiSearch(query) {
  const lang = HEB.test(query) ? 'he' : 'en';
  try {
    const s = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=2&srsearch=${encodeURIComponent(query)}`);
    const hits = (await s.json()).query?.search || [];
    const pages = await Promise.all(hits.map(async (h) => {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title)}`);
      const j = await r.json();
      return j.extract ? { title: h.title, text: j.extract.slice(0, 500) } : null;
    }));
    const results = pages.filter(Boolean);
    if (results.length) {
      const knowledge = ls.get('knowledge', []);
      knowledge.push({ ts: Date.now(), query, text: results.map((r) => `- ${r.title}: ${r.text}`).join('\n') });
      ls.set('knowledge', knowledge.slice(-300));
    }
    return results;
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ the engine
let engine = null;
let engineModel = null;
let loading = null;
let progressHandler = () => {};
let lastChat = 0;

export function onProgress(fn) { progressHandler = fn; }

export async function webgpuStatus() {
  if (!navigator.gpu) return { ok: false, reason: 'no-webgpu' };
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  if (!adapter) return { ok: false, reason: 'no-adapter' };
  return { ok: true, f16: adapter.features.has('shader-f16') };
}

async function modelIdFor(tier) {
  const m = MODELS[tier] || MODELS.balanced;
  const gpu = await webgpuStatus();
  return !gpu.f16 && m.idF32 ? m.idF32 : m.id;
}

function startWorker() {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./brain-worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(null);
      return;
    }
    // The worker says hello once its code has loaded; no hello (or an error) means it can't run here.
    const done = (ok) => {
      clearTimeout(timer);
      worker.removeEventListener('message', onReady);
      worker.onerror = null;
      if (!ok) worker.terminate();
      resolve(ok ? worker : null);
    };
    const onReady = (e) => { if (e.data?.kind === 'jarvis-worker-ready') done(true); };
    const timer = setTimeout(() => done(false), 20000);
    worker.addEventListener('message', onReady);
    worker.onerror = () => done(false);
  });
}

export async function loadEngine() {
  const settings = { ...DEFAULT_SETTINGS, ...ls.get('settings', {}) };
  const id = await modelIdFor(settings.model_tier);
  const chatOpts = (MODELS[settings.model_tier] || MODELS.balanced).chatOpts;
  if (engine && engineModel === id) return engine;
  if (loading) return loading;
  loading = (async () => {
    const gpu = await webgpuStatus();
    if (!gpu.ok) throw Object.assign(new Error('WebGPU unavailable'), { code: gpu.reason });
    if (engine) { await engine.unload(); engine = null; }
    const opts = { initProgressCallback: (p) => progressHandler({ progress: p.progress, text: p.text, model: id }) };
    const worker = await startWorker();
    // A worker keeps the 3D core smooth; if this browser can't start one, run on the page instead.
    engine = worker ? await CreateWebWorkerMLCEngine(worker, id, opts, chatOpts) : await CreateMLCEngine(id, opts, chatOpts);
    engineModel = id;
    progressHandler({ progress: 1, done: true, model: id });
    return engine;
  })();
  try { return await loading; } finally { loading = null; }
}

const SYSTEM = (now, context) => `You are J.A.R.V.I.S., a personal AI assistant in the spirit of Tony Stark's: calm, precise, \
loyal, with dry British wit. Occasionally address the user as "sir" (or "אדוני" in Hebrew).
Rules:
- Always answer in the same language the user wrote in. If the user writes Hebrew, answer in Hebrew only.
- Replies are read aloud: one to three short sentences, plain text, no markdown, no lists, no emoji, no URLs.
- Use the memories and Wikipedia notes below when relevant. Never invent facts; if unsure, say so.
- You run inside a web browser, so you can't control the computer.
Current date and time: ${now}.${context}`;

async function chat(text, onToken) {
  lastChat = Date.now();
  const cmd = command(text);
  const messages = ls.get('messages', []);
  const save = (reply) => {
    messages.push({ ts: Date.now(), role: 'user', content: text }, { ts: Date.now(), role: 'assistant', content: reply });
    ls.set('messages', messages.slice(-MAX_MESSAGES));
  };
  if (cmd) { save(cmd.reply); return cmd; }

  const he = HEB.test(text);
  let eng;
  try {
    eng = await loadEngine();
  } catch (e) {
    const reply = e.code === 'no-webgpu' || e.code === 'no-adapter'
      ? (he ? 'הדפדפן הזה לא תומך בהרצת בינה מלאכותית (WebGPU). נסה בכרום מעודכן במחשב.' : "This browser can't run the AI (no WebGPU). Try an up-to-date Chrome on a computer.")
      : (he ? 'לא הצלחתי לטעון את המוח שלי. בדוק את החיבור לאינטרנט ונסה שוב.' : "I couldn't load my brain. Check the internet connection and try again.");
    return { reply, actions: [], error: 'engine' };
  }

  // Context: older memories, learned notes, and a live Wikipedia search when asked.
  const words = keywords(text);
  const recent = messages.slice(-RECENT);
  const older = messages.slice(0, -RECENT).map((m) => ({ m, s: overlap(words, keywords(m.content)) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.m);
  const parts = [];
  if (older.length) parts.push('Earlier conversations you remember:\n' + older.map((m) => `- [${when(m.ts)}] ${m.role === 'user' ? 'User' : 'You'}: ${m.content}`).join('\n'));
  let searched = false;
  if (SEARCH_TRIGGER.test(text)) {
    searched = true;
    const results = await wikiSearch(cleanQuery(text));
    parts.push(results.length ? 'Wikipedia results:\n' + results.map((r) => `- ${r.title}: ${r.text}`).join('\n')
      : 'A Wikipedia search found nothing.');
  } else {
    const known = ls.get('knowledge', []).map((k) => ({ k, s: overlap(words, keywords(k.query + ' ' + k.text)) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.k);
    if (known.length) parts.push('Things you learned from Wikipedia:\n' + known.map((k) => k.text.slice(0, 600)).join('\n'));
  }
  const now = new Date().toLocaleString(he ? 'he-IL' : 'en-GB', { dateStyle: 'full', timeStyle: 'short' });
  const context = parts.length ? '\n\n' + parts.join('\n\n') : '';

  let reply = '';
  try {
    const stream = await eng.chat.completions.create({
      messages: [{ role: 'system', content: SYSTEM(now, context) }, ...recent.map(({ role, content }) => ({ role, content })),
        { role: 'user', content: text }],
      temperature: 0.6, max_tokens: 220, stream: true,
    });
    for await (const chunk of stream) {
      reply += chunk.choices[0]?.delta?.content || '';
      onToken?.(reply);
    }
  } catch (e) {
    console.error(e);
    return { reply: he ? 'משהו השתבש במוח שלי. נסה שוב.' : 'Something went wrong in my brain. Please try again.', actions: [], error: 'chat' };
  }
  reply = reply.trim() || (he ? 'כן, אדוני.' : 'Yes, sir.');
  save(reply);
  return { reply, actions: searched ? [{ type: 'web_searched' }] : [] };
}

// ------------------------------------------------------------------ background learning
setInterval(async () => {
  if (document.hidden || Date.now() - lastChat < 2 * 60 * 1000) return;
  const msgs = ls.get('messages', []).filter((m) => m.role === 'user' && Date.now() - m.ts < 3 * 86400000);
  const known = ls.get('knowledge', []);
  let learned = 0;
  for (const m of msgs.reverse()) {
    if (learned >= 2) break;
    const q = cleanQuery(m.content);
    const w = keywords(q);
    if (w.length < 2 || OPEN_VERB.test(m.content)) continue;
    if (known.some((k) => overlap(w, keywords(k.query)) >= Math.max(1, w.length * 0.6))) continue;
    if ((await wikiSearch(q)).length) learned++;
  }
}, LEARN_EVERY_MS);

// ------------------------------------------------------------------ fetch-like API used by main.js
export async function api(path, opts = {}) {
  const body = opts.body ? JSON.parse(opts.body) : {};
  const method = (opts.method || 'GET').toUpperCase();
  const [route, query] = path.split('?');
  switch (`${method} ${route}`) {
    case 'GET /api/settings': return { ...DEFAULT_SETTINGS, ...ls.get('settings', {}) };
    case 'PUT /api/settings': { const s = { ...DEFAULT_SETTINGS, ...ls.get('settings', {}), ...body }; ls.set('settings', s); return s; }
    case 'GET /api/health': {
      const s = { ...DEFAULT_SETTINGS, ...ls.get('settings', {}) };
      return { status: 'online', model: MODELS[s.model_tier]?.label || 'BALANCED', messages: ls.get('messages', []).length, knowledge: ls.get('knowledge', []).length, web: true };
    }
    case 'GET /api/history': {
      const limit = Number(new URLSearchParams(query).get('limit')) || 40;
      return ls.get('messages', []).slice(-limit);
    }
    case 'POST /api/chat': return chat(String(body.message || ''), opts.onToken);
    case 'DELETE /api/memory': ls.set('messages', []); ls.set('knowledge', []); return { ok: true };
    default: throw new Error(`Not available in the web edition: ${method} ${route}`);
  }
}
