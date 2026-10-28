// J.A.R.V.I.S front-end bootstrap: wires the 3D core, voice, gestures, color picker and backend.
import { JarvisCore } from './scene.js';
import { AudioReactor } from './audio.js';
import { Listener, Speaker } from './speech.js';
import { GestureController } from './gestures.js';
import { ColorPicker, hexToRgb } from './colorPicker.js';
import { JarvisTerminal, playAlarm } from './terminal.js';

const $ = (id) => document.getElementById(id);
// Web edition (hosted website, AI inside the browser) vs. the PC edition (local Python server).
const WEB = Boolean(window.JARVIS_WEB);
const webBackend = WEB ? await import('./backend-web.js') : null;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('jarvis.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jarvis.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ------------------------------------------------------------------ access (phone / tunnel)
// The install link carries the access code in the #fragment, which browsers never send to a server.
// It's exchanged once for an HttpOnly cookie, then removed from the address bar.
async function login(code) {
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: code }),
  });
  return res.ok ? 'ok' : res.status === 429 ? 'locked' : 'wrong';
}

async function ensureAccess() {
  const hashCode = new URLSearchParams(location.hash.slice(1)).get('token');
  if (hashCode) {
    history.replaceState(null, '', location.pathname);
    await login(hashCode);
  }
  let res;
  try { res = await fetch('/api/session'); } catch { return; } // offline: shell only
  if (res.status !== 401) return;

  const lock = $('lock');
  lock.hidden = false;
  $('lock-input').focus();
  await new Promise((resolve) => {
    $('lock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await login($('lock-input').value.trim());
      if (result === 'ok') { lock.hidden = true; resolve(); return; }
      $('lock-error').textContent = result === 'locked'
        ? 'יותר מדי ניסיונות. נסה שוב בעוד 10 דקות.'
        : 'קוד שגוי. הקוד מופיע בחלון של tunnel.py במחשב.';
      $('lock-input').select();
    });
  });
}
if (!WEB) await ensureAccess();

const sessionId = store.get('session', null) || (() => {
  const id = (crypto.randomUUID?.() || String(Math.random()).slice(2)).slice(0, 32);
  store.set('session', id);
  return id;
})();

async function api(path, opts = {}) {
  if (WEB) return webBackend.api(path, opts);
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// ------------------------------------------------------------------ state & settings
let settings = { color: store.get('color', '#00e5ff'), voice_lang: store.get('lang', 'he-IL'), speak_replies: store.get('speak', true) };
try { settings = { ...settings, ...(await api('/api/settings')) }; } catch { /* offline: local settings */ }

const core = new JarvisCore($('scene'), settings.color);
const reactor = new AudioReactor();
let busy = false;

function applyAccent(hex) {
  const [r, g, b] = hexToRgb(hex);
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  $('core-hex').textContent = hex.toUpperCase();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#000308');
}
applyAccent(settings.color);

async function saveColor(hex) {
  settings.color = hex;
  store.set('color', hex);
  try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ color: hex }) }); } catch { /* keep local */ }
}

function setColor(hex) {
  core.setColor(hex);
  applyAccent(hex);
  saveColor(hex);
  log(`CHROMA → ${hex.toUpperCase()}`);
}

// ------------------------------------------------------------------ HUD helpers
function log(text) {
  const ul = $('sys-log');
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString('en-GB')} ${text}`;
  ul.prepend(li);
  while (ul.children.length > 7) ul.lastChild.remove();
}

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function setStatus(text) { $('status').textContent = text; }

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.dir = 'auto';
  if (role === 'thinking') {
    div.className = 'msg jarvis thinking';
    div.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  } else {
    div.textContent = text;
  }
  $('transcript').appendChild(div);
  $('transcript').scrollTop = $('transcript').scrollHeight;
  while ($('transcript').children.length > 30) $('transcript').firstChild.remove();
  return div;
}

setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('en-GB'); }, 1000);

core.onFrame = ({ audio, scale }) => {
  core.setAudioLevel(reactor.level());
  $('audio-bar').style.width = `${Math.round(audio * 100)}%`;
  $('scale-bar').style.width = `${Math.round(((scale - 0.5) / 1.4) * 100)}%`;
};

// ------------------------------------------------------------------ voice out
const speaker = new Speaker({
  onStart: () => { reactor.setSpeaking(true); core.setMode('speaking'); setStatus('SPEAKING'); },
  onEnd: () => {
    reactor.setSpeaking(false); core.setMode('idle'); setStatus(conversation ? 'CONVERSATION' : 'ONLINE');
    listenNext(); // in conversation mode, Jarvis listens again once he finishes talking
  },
  onBoundary: () => reactor.wordBoundary(),
});
speaker.enabled = settings.speak_replies;
$('btn-voice').classList.toggle('active', speaker.enabled);

function jarvisSay(text) {
  addMessage('jarvis', text);
  if (speaker.enabled) speaker.speak(text);
  // If speech never starts (no voice installed, voice off), don't leave the conversation hanging.
  setTimeout(() => {
    if (!('speechSynthesis' in window) || (!speechSynthesis.speaking && !speechSynthesis.pending)) listenNext(0);
  }, 1500);
}

// ------------------------------------------------------------------ local commands
const HEB = /[֐-׿]/;
const COLOR_WORD = /(צבע|colou?r|theme)/i;
const CHANGE_WORD = /(תחליף|תשנה|שנה|החלף|לשנות|להחליף|תבחר|בחר|change|switch|pick|choose|set|new)/i;
const NAMED_COLORS = [
  [/(אדום|red)/i, '#ff2d3d'], [/(ירוק|green)/i, '#2bff88'], [/(סגול|purple|violet)/i, '#7b5cff'],
  [/(ורוד|pink|magenta)/i, '#ff2bd6'], [/(כתום|orange)/i, '#ff8a00'], [/(צהוב|זהב|yellow|gold)/i, '#ffd400'],
  [/(לבן|white)/i, '#e8f4ff'], [/(טורקיז|תכלת|cyan|turquoise)/i, '#00e5ff'], [/(כחול|blue)/i, '#1e6bff'],
];

/** Handle color commands instantly in the browser. Returns true if handled. */
function handleLocalCommand(text) {
  if (!(COLOR_WORD.test(text) && CHANGE_WORD.test(text))) return false;
  const he = HEB.test(text);
  const named = NAMED_COLORS.find(([re]) => re.test(text));
  if (named) {
    setColor(named[1]);
    jarvisSay(he ? 'בוצע, אדוני. הליבה עודכנה.' : 'Done, sir. Core recolored.');
  } else {
    openColorPicker();
    jarvisSay(he ? 'פותח את בורר הצבעים, אדוני.' : 'Opening the chroma panel, sir.');
  }
  return true;
}

// ------------------------------------------------------------------ terminal, code & timers
const term = new JarvisTerminal({
  // Code only runs from an explicit click (or saying "תריץ") - never on its own.
  onRun: async (file) => {
    term.print(`running ${file} ...`, 'dim');
    try {
      const r = await api('/api/terminal/run', { method: 'POST', body: JSON.stringify({ file }) });
      term.runResult(r);
    } catch (e) {
      term.print(`✗ ${e.message}`, 'err');
    }
  },
  onCancelTimer: async (id) => {
    try { term.setTimers((await api(`/api/timers/${id}`, { method: 'DELETE' })).timers); } catch { /* offline */ }
  },
});

function timerRang(t) {
  term.open();
  term.timerDone(t);
  playAlarm();
  const he = HEB.test(t.label) || listener.lang.startsWith('he');
  const what = t.kind === 'alarm' ? (he ? 'השעון המעורר' : 'Your alarm') : (he ? 'הטיימר' : 'Your timer');
  const generic = /^(טיימר|שעון מעורר|timer|alarm)$/i.test(t.label);
  toast(`⏰ ${t.label}`);
  jarvisSay(he ? `אדוני, ${what} צלצל${generic ? '' : `: ${t.label}`}.` : `Sir, ${what} is up${generic ? '' : `: ${t.label}`}.`);
}

// ------------------------------------------------------------------ backend chat
function applyActions(actions = []) {
  for (const a of actions) {
    if (a.type === 'terminal_open') term.open();
    else if (a.type === 'terminal_close') term.close();
    else if (a.type === 'terminal_code') term.code(a);
    else if (a.type === 'terminal_run') term.runResult(a.result);
    else if (a.type === 'terminal_print') term.print(a.text);
    else if (a.type === 'timers_changed') term.setTimers(a.timers);
    if (a.type === 'open_color_picker') openColorPicker();
    else if (a.type === 'set_color') setColor(a.hex);
    else if (a.type === 'app_opened') { toast(`LAUNCHED ${a.name.toUpperCase()}`); log(`EXEC ${a.app}`); }
    else if (a.type === 'url_opened') { toast('OPENING WEB LINK'); log(`URL ${a.url}`); }
    else if (a.type === 'web_searched') { log('WEB SEARCH'); }
    else if (a.type === 'open_url') {
      // Browsers may block pop-ups that don't come from a click; then offer a link instead.
      if (!window.open(a.url, '_blank', 'noopener')) {
        const link = document.createElement('a');
        link.href = a.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = a.url;
        addMessage('system', '').appendChild(link);
      }
      log(`URL ${a.url}`);
    }
  }
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  addMessage('user', text);
  if (term.isOpen) term.command(text);
  if (handleLocalCommand(text)) return;

  busy = true;
  speaker.cancel();
  core.setMode('thinking');
  setStatus('PROCESSING');
  const pending = addMessage('thinking');
  try {
    const data = await api('/api/chat', {
      method: 'POST', body: JSON.stringify({ message: text, session_id: sessionId }),
      // Web edition streams the reply as it's written.
      onToken: (t) => { pending.className = 'msg jarvis'; pending.textContent = t; },
    });
    pending.remove();
    applyActions(data.actions);
    jarvisSay(data.reply);
    if (data.error) log(`ERR ${data.error}`);
  } catch (e) {
    pending.remove();
    jarvisSay(HEB.test(text) ? 'אין חיבור לשרת המקומי, אדוני.' : "I can't reach the local server, sir.");
    log('LINK FAILURE');
    console.error(e);
  } finally {
    busy = false;
    // Speech onStart switches to "speaking" right after, if a reply is being read aloud.
    if (core.mode === 'thinking') { core.setMode('idle'); setStatus('ONLINE'); }
  }
}

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chat-input');
  send(input.value);
  input.value = '';
});

// ------------------------------------------------------------------ voice in
const listener = new Listener({
  lang: settings.voice_lang,
  onInterim: (t) => { $('interim').textContent = t; },
  onFinal: (t) => {
    $('interim').textContent = '';
    heardFinal = true;
    lastHeard = Date.now();
    if (immersive && SHOW_BUTTONS.test(t)) { setImmersive(false); return; }
    if (conversation && isGoodbye(t)) { addMessage('user', t); endConversation(true); return; }
    send(t);
  },
  onState: async (on) => {
    $('btn-mic').classList.toggle('listening', on);
    if (on) {
      heardFinal = false;
      speaker.cancel();
      core.setMode('listening');
      setStatus('LISTENING');
      try { await reactor.startMic(); } catch (e) { console.warn('Mic analyser unavailable', e); }
    } else {
      reactor.stopMic();
      if (!busy) { core.setMode('idle'); setStatus(conversation ? 'CONVERSATION' : 'ONLINE'); }
      // Silence in conversation mode: keep listening, but give up after 2 quiet minutes.
      if (conversation && !heardFinal) {
        if (Date.now() - lastHeard > CONVERSATION_IDLE_MS) endConversation(false);
        else listenNext(250);
      }
    }
  },
  onError: (err) => {
    toast(err === 'not-allowed' ? 'MICROPHONE BLOCKED' : `VOICE ERROR: ${err}`);
    log(`MIC ${err}`);
    // Errors that won't fix themselves end conversation mode instead of retrying forever.
    if (conversation && ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(err)) {
      endConversation(false);
    }
  },
});

$('btn-mic').addEventListener('click', () => {
  if (!listener.supported) { toast('SPEECH RECOGNITION NOT SUPPORTED - USE CHROME / EDGE'); return; }
  if (conversation) { endConversation(false); return; }
  listener.toggle();
});

// ------------------------------------------------------------------ conversation mode
// One press starts a hands-free conversation: listen → answer aloud → listen again,
// until the button is pressed again or the user says "תודה ג'ארביס" / "bye".
const CONVERSATION_IDLE_MS = 2 * 60 * 1000;
const GOODBYE = /^(תודה( רבה)?|ביי|להתראות|סיים|סיום|עצור|די|זהו|זה הכל|stop|bye|goodbye|thanks|thank you|that's all)$/i;
let conversation = false;
let heardFinal = false;
let lastHeard = 0;
let voiceBeforeConversation = true;

function isGoodbye(text) {
  return GOODBYE.test(text.replace(/ג['׳]?ארביס|jarvis/gi, '').replace(/[.,!?]/g, '').trim());
}

function listenNext(delay = 350) {
  if (!conversation) return;
  setTimeout(() => {
    const talking = 'speechSynthesis' in window && speechSynthesis.speaking;
    if (conversation && !busy && !listener.listening && !talking) listener.start();
  }, delay);
}

function startConversation() {
  if (!listener.supported) { toast('SPEECH RECOGNITION NOT SUPPORTED - USE CHROME / EDGE'); return; }
  conversation = true;
  lastHeard = Date.now();
  voiceBeforeConversation = speaker.enabled;
  speaker.enabled = true; // a conversation is spoken both ways
  $('btn-call').classList.add('active');
  $('btn-call').setAttribute('aria-pressed', 'true');
  setStatus('CONVERSATION');
  log('CONVERSATION ON');
  const he = listener.lang.startsWith('he');
  toast(he ? 'מצב שיחה · אמור "תודה ג׳ארביס" לסיום' : 'CONVERSATION · SAY "THANKS JARVIS" TO END');
  jarvisSay(he ? 'אני מקשיב, אדוני.' : "I'm listening, sir.");
}

function endConversation(sayGoodbye) {
  conversation = false;
  listener.stop();
  $('btn-call').classList.remove('active');
  $('btn-call').setAttribute('aria-pressed', 'false');
  log('CONVERSATION OFF');
  if (sayGoodbye) jarvisSay(listener.lang.startsWith('he') ? 'בשמחה, אדוני. אני כאן אם תצטרך.' : 'My pleasure, sir. I am here if you need me.');
  speaker.enabled = voiceBeforeConversation;
  if (!busy && !(speechSynthesis?.speaking)) setStatus('ONLINE');
}

$('btn-call').addEventListener('click', () => (conversation ? endConversation(false) : startConversation()));

// ------------------------------------------------------------------ clean mode
// Hides every button and the chat; only the energy core stays, and you just talk.
// Back: Esc, double-click/double-tap the screen, or say "תחזיר את הכפתורים" / "show buttons".
const SHOW_BUTTONS = /(תחזיר|החזר|תראה|הצג|show|bring back).*(כפתורים|כפתור|צ'אט|הצ'אט|buttons|chat)|צא ממצב נקי|exit clean mode/i;
let immersive = false;

function setImmersive(on) {
  immersive = on;
  document.body.classList.toggle('immersive', on);
  $('clean-confirm').hidden = true;
  const he = listener.lang.startsWith('he');
  if (on) {
    if (!conversation) startConversation();
    toast(he ? 'ליציאה: Esc, לחיצה כפולה, או "תחזיר את הכפתורים"' : 'EXIT: ESC, DOUBLE-CLICK, OR SAY "SHOW BUTTONS"');
    log('CLEAN MODE ON');
  } else {
    toast(he ? 'הכפתורים חזרו' : 'CONTROLS RESTORED');
    log('CLEAN MODE OFF');
  }
}

$('btn-clean').addEventListener('click', () => { $('clean-confirm').hidden = false; $('clean-yes').focus(); });
$('clean-yes').addEventListener('click', () => setImmersive(true));
$('clean-no').addEventListener('click', () => { $('clean-confirm').hidden = true; });
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (immersive) setImmersive(false);
  else $('clean-confirm').hidden = true;
});
$('scene').addEventListener('dblclick', () => { if (immersive) setImmersive(false); });

const updateLangChip = () => { $('btn-lang').textContent = listener.lang.startsWith('he') ? 'עב' : 'EN'; };
updateLangChip();
$('btn-lang').addEventListener('click', () => {
  listener.lang = listener.lang.startsWith('he') ? 'en-US' : 'he-IL';
  store.set('lang', listener.lang);
  api('/api/settings', { method: 'PUT', body: JSON.stringify({ voice_lang: listener.lang }) }).catch(() => {});
  updateLangChip();
  toast(listener.lang.startsWith('he') ? 'זיהוי דיבור: עברית' : 'VOICE INPUT: ENGLISH');
});

$('btn-voice').addEventListener('click', () => {
  speaker.enabled = !speaker.enabled;
  if (!speaker.enabled) speaker.cancel();
  $('btn-voice').classList.toggle('active', speaker.enabled);
  store.set('speak', speaker.enabled);
  api('/api/settings', { method: 'PUT', body: JSON.stringify({ speak_replies: speaker.enabled }) }).catch(() => {});
});

// Space = push-to-talk toggle (when not typing)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && !e.repeat) {
    e.preventDefault();
    $('btn-mic').click();
  }
});

// ------------------------------------------------------------------ color picker
const picker = new ColorPicker({
  onPreview: (hex) => { core.setColor(hex, false); applyAccent(hex); },
  onConfirm: (hex) => { setColor(hex); toast('CHROMA LOCKED'); },
  onCancel: (orig) => { core.setColor(orig, false); applyAccent(orig); },
});
function openColorPicker() { picker.open(settings.color); }
$('btn-color').addEventListener('click', openColorPicker);

// ------------------------------------------------------------------ gestures
const gestures = new GestureController({
  video: $('cam-video'),
  overlay: $('cam-overlay'),
  accent: () => settings.color,
  onScale: (s) => core.setGestureScale(s),
  onStatus: (status, scale) => {
    $('cam-status').textContent = status;
    $('pinch-readout').textContent = scale ? `x${scale.toFixed(2)}` : '--';
  },
});
$('btn-cam').addEventListener('click', async () => {
  const btn = $('btn-cam');
  if (gestures.running) {
    gestures.stop();
    $('cam-panel').classList.add('hidden');
    btn.classList.remove('active');
    log('OPTICS OFFLINE');
    return;
  }
  try {
    $('cam-panel').classList.remove('hidden');
    await gestures.start();
    btn.classList.add('active');
    log('OPTICS ONLINE');
    toast('PINCH TO SHRINK · SPREAD TO EXPAND');
  } catch (e) {
    $('cam-panel').classList.add('hidden');
    toast('CAMERA UNAVAILABLE');
    console.error(e);
  }
});

// ------------------------------------------------------------------ server events (global hotkey)
function connectEvents() {
  const es = new EventSource('/api/events');
  es.onopen = () => { $('link-bar').style.width = '100%'; };
  es.onerror = () => { $('link-bar').style.width = '15%'; };
  es.onmessage = (msg) => {
    const ev = JSON.parse(msg.data);
    if (ev.type === 'wake') {
      toast('AT YOUR SERVICE');
      log('HOTKEY WAKE');
      window.focus();
      if (listener.supported && !listener.listening) listener.start();
    } else if (ev.type === 'timer_done') {
      timerRang(ev.timer);
    } else if (ev.type === 'code_progress') {
      term.streamCode(ev);
    } else if (ev.type === 'settings' && ev.settings.color !== settings.color) {
      settings.color = ev.settings.color;
      core.setColor(settings.color);
      applyAccent(settings.color);
    }
  };
}
if (!WEB) connectEvents();

// ------------------------------------------------------------------ web edition: in-browser AI model
if (WEB) {
  $('btn-cam').title = 'Hand gestures';
  const chip = $('btn-model');
  chip.hidden = false;
  const tierLabel = () => webBackend.MODELS[settings.model_tier || 'balanced'].label;
  chip.textContent = `AI: ${tierLabel()}`;
  const order = ['light', 'balanced', 'smart'];
  chip.addEventListener('click', () => {
    const next = order[(order.indexOf(settings.model_tier || 'balanced') + 1) % order.length];
    settings.model_tier = next;
    api('/api/settings', { method: 'PUT', body: JSON.stringify({ model_tier: next }) });
    chip.textContent = `AI: ${tierLabel()}`;
    toast(`${webBackend.MODELS[next].label} · ${webBackend.MODELS[next].size}`);
    webBackend.loadEngine().catch(() => {});
  });

  const box = $('model-progress');
  webBackend.onProgress(({ progress, done }) => {
    box.hidden = Boolean(done);
    $('model-progress-bar').style.width = `${Math.round((progress || 0) * 100)}%`;
    $('model-progress-text').textContent = `טוען את המוח של ג'ארביס... ${Math.round((progress || 0) * 100)}%`;
    if (done) { log('AI MODEL READY'); setStatus('ONLINE'); }
  });

  const gpu = await webgpuCheck();
  if (gpu) {
    // Start loading right away (first visit downloads the model; later visits load it from cache).
    setStatus('LOADING AI');
    webBackend.loadEngine().catch((e) => {
      console.error(e);
      box.hidden = true;
      log('AI LOAD FAILED');
      setStatus('ONLINE');
      const noSpace = /quota|cache|storage/i.test(`${e?.name} ${e?.message}`);
      addMessage('system', noSpace
        ? 'אין מספיק מקום בדפדפן בשביל המודל. פנה מקום בדיסק, או לחץ על AI כדי לבחור מודל קטן יותר, ורענן את הדף.'
        : 'לא הצלחתי לטעון את המוח של ג׳ארביס. בדוק את החיבור לאינטרנט ורענן את הדף.');
    });
  }
}

async function webgpuCheck() {
  const s = await webBackend.webgpuStatus();
  if (s.ok) return true;
  addMessage('system', 'הדפדפן הזה לא תומך בהרצת בינה מלאכותית (WebGPU). פתח את הקישור בכרום מעודכן במחשב.');
  return false;
}

// ------------------------------------------------------------------ PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((e) => console.warn('SW registration failed', e));
}
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('btn-install').classList.remove('hidden');
});
$('btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('btn-install').classList.add('hidden');
});

// ------------------------------------------------------------------ boot
setStatus('ONLINE');
log('CORE ONLINE');
try {
  const h = await api('/api/health');
  log(`MODEL ${h.model}`);
  if (h.messages !== undefined) log(`MEMORY ${h.messages} MSG · ${h.knowledge} FACTS`);
  $('link-bar').style.width = '100%';
} catch {
  log('BACKEND OFFLINE');
  setStatus('OFFLINE');
}

// Timers that are still running from before (they keep counting while Jarvis is closed).
if (!WEB) {
  try { term.setTimers(await api('/api/timers')); } catch { /* offline */ }
}

// One continuing conversation: show where we left off.
try {
  const past = await api('/api/history?limit=30');
  for (const m of past) addMessage(m.role === 'user' ? 'user' : 'jarvis', m.content);
  if (past.length) addMessage('system', listener.lang.startsWith('he') ? '— המשך השיחה —' : '— conversation continues —');
} catch { /* offline: start fresh on screen */ }
addMessage('jarvis', HEB.test(navigator.language) || listener.lang.startsWith('he')
  ? 'כל המערכות פועלות. במה אוכל לעזור, אדוני?'
  : 'All systems online. How may I assist you, sir?');
