// JARVIS PRIME – main. Everything runs on this device; nothing is sent to any server.
import { load, save } from './settings.js';
import { openSetup } from './setup.js';
import { makeCore } from './core.js';
import { reply } from './brain.js';
import { speak, setHooks, GREETING_HE } from './voice.js';
import * as diary from './diary.js';
import * as kb from './knowledge.js';
// camera.js and games.js are loaded only when used (speed)

const $ = (s) => document.querySelector(s);
let s = load();
let core = null;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

async function start() {
  $('#hud').hidden = false;
  core?.dispose?.();
  core?.renderer?.setAnimationLoop(null);
  const old = $('#core'); const cv = old.cloneNode(); old.replaceWith(cv); // 2D & WebGL can't share a canvas
  core = await makeCore(cv, s);
  let timer = 0;
  setHooks({
    onStart: () => { core.setMode('speaking'); clearInterval(timer); timer = setInterval(() => core.setAudioLevel(0.35 + Math.random() * 0.55), 90); },
    onEnd: () => { clearInterval(timer); core.setAudioLevel(0); core.setMode('idle'); if (listenNext) { listenNext = false; mic.listenOnce?.(); } },
  });
  if (s.features.knowledge) kb.loadLevel(s.knowledge);
  $('#btn-hands').hidden = !s.features.hands;
  $('#btn-pose').hidden = !s.features.pose;
  (await cam())?.stop?.();
}

// ------------------------------------------------------------ camera features + games (lazy)
let camMod = null;
const cam = async (load = false) => (camMod ||= load ? await import('./camera.js') : null);
const camStatus = (t) => { $('#cam-status').textContent = t; };
let camBusy = false;
async function toggleCam(kind) {
  if (camBusy) return; camBusy = true;
  try { await toggleCamInner(kind); } finally { camBusy = false; }
}
async function toggleCamInner(kind) {
  const c = await cam(true);
  const btn = $(kind === 'hands' ? '#btn-hands' : '#btn-pose');
  if (c.running() === kind) { c.stop(); btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); return; }
  document.querySelectorAll('#btn-hands,#btn-pose').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
  try {
    if (kind === 'hands') await c.startHands(core, camStatus); else await c.startPose(camStatus);
    btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
  } catch (e) {
    c.stop();
    const n = e?.name || '', msg = String(e?.message || e);
    say(/NotAllowed|Permission|Security/i.test(n + msg) ? 'אין לי הרשאה למצלמה, אדוני. לחץ על 🔒 ליד הכתובת ← הרשאות ← מצלמה ← לאפשר.'
      : /NotReadable|TrackStart|in use/i.test(n + msg) ? 'המצלמה תפוסה באפליקציה אחרת, אדוני. סגור אותה ונסה שוב.'
      : /NotFound|Overconstrained/i.test(n) ? 'לא מצאתי מצלמה מתאימה, אדוני.'
      : /load|fetch|import|script|network/i.test(msg) ? 'לא הצלחתי להוריד את מודל הזיהוי – צריך אינטרנט בפעם הראשונה, אדוני.'
      : `לא הצלחתי להפעיל את המצלמה, אדוני. (${(n || msg).slice(0, 60)})`);
  }
}
$('#btn-hands').onclick = () => toggleCam('hands');
$('#btn-pose').onclick = () => toggleCam('pose');
$('#cam-close').onclick = async () => { (await cam())?.stop(); document.querySelectorAll('#btn-hands,#btn-pose').forEach((b) => b.classList.remove('on')); };
// PRIME FORGE – Jarvis's own game terminal
let forge = null;
async function openForge() {
  forge ||= await import('./forge.js');
  forge.open($('#forge'), (t) => say(t));
  return forge;
}
$('#forge-close').onclick = () => forge?.close($('#forge'));
$('#forge-play').onclick = () => { if (forge) handleGame(forge.isPlaying() ? 'עצור' : 'שחק'); };
for (const b of document.querySelectorAll('.fpad [data-pad]')) {
  const k = b.dataset.pad, on = (e) => { e.preventDefault(); forge?.pad(k, true); }, off = () => forge?.pad(k, false);
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
}
function handleGame(text) {
  const r = forge.command(text);
  if (!r) return false;
  $('#forge-play').textContent = forge.isPlaying() ? '⏸ עצור' : '▶ שחק';
  say(r.replace(/^[^\p{L}\d]+/u, ''));
  return true;
}

// ------------------------------------------------------------ chat
function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = `msg ${who}`;
  const p = document.createElement('span'); p.textContent = text; m.append(p);
  $('#log').append(m);
  $('#log').scrollTop = $('#log').scrollHeight;
  return m;
}
function say(text) { const m = addMsg(text, 'j'); speak(text, voiceOpts()); return m; }
const voiceOpts = () => ({ preset: s.voice, voiceName: s.voiceName, pitch: s.pitch, rate: s.rate });

let listenNext = false;
async function handle(text, viaVoice = false) {
  if (!text.trim()) return;
  addMsg(text, 'me');
  // while the game terminal is open, build commands go straight to Jarvis's game builder
  if (forge && !$('#forge').hidden && handleGame(text.replace(/^(היי |הי )?ג['׳]?רוויס,? /, ''))) return;
  core?.setMode('thinking');
  let live = null;
  const r = await reply(text, {
    onProgress: (p) => { live ||= addMsg('', 'j'); live.firstChild.textContent = `טוען את המוח המלא… ${Math.round((p.progress || 0) * 100)}%`; },
    onToken: (t) => { live ||= addMsg('', 'j'); live.firstChild.textContent = t; },
  });
  live?.remove();
  const m = say(r.text);
  if (r.reminder) {
    diary.askPermission();
    addActions(m, [['📅 הוסף ליומן של הטלפון', () => diary.addToCalendar(r.reminder)]]);
  }
  if (r.openDiary) addActions(m, [['📒 פתח יומן', openDiary]]);
  if (r.listen && viaVoice) listenNext = true;
  if (r.game != null) {
    if (s.features.games) { await openForge(); if (r.game.trim()) handleGame(r.game); }
    else m.firstChild.textContent = 'יצירת משחקים כבויה בהגדרות, אדוני. אפשר להדליק אותה ב־⚙.';
  }
  if (r.open) {
    const w = window.open(r.open, '_blank');
    if (w) { try { w.opener = null; } catch {} } else addActions(m, [[`↗ פתח את ${r.openName}`, () => window.open(r.open, '_blank', 'noopener')]]);
  }
  if (r.pose) { if (s.features.pose) toggleCam('pose'); else m.firstChild.textContent = 'זיהוי אנשים כבוי בהגדרות, אדוני. אפשר להדליק אותו ב־⚙.'; }
  if (r.hands) { if (s.features.hands) toggleCam('hands'); else m.firstChild.textContent = 'הידיים כבויות בהגדרות, אדוני. אפשר להדליק אותן ב־⚙.'; } // typed → keep typing; spoken → keep listening
  if (!$('#diary').hidden) renderDiary();
}
function addActions(m, list) {
  const box = document.createElement('div'); box.className = 'acts';
  for (const [label, fn] of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'msg-act'; b.textContent = label; b.onclick = fn; box.append(b); }
  m.append(box);
  $('#log').scrollTop = $('#log').scrollHeight;
}

$('#ask').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q'); const v = q.value; q.value = ''; handle(v); });
$('#btn-settings').addEventListener('click', () => openSetup(s, (ns) => { s = ns; start(); }));

// ------------------------------------------------------------ diary panel
function openDiary() { $('#diary').hidden = false; renderDiary(); }
$('#btn-diary').onclick = openDiary;
$('#diary-close').onclick = () => { $('#diary').hidden = true; };
$('#note-form').onsubmit = (e) => { e.preventDefault(); const v = $('#note-in').value.trim(); if (v) { diary.addNote(v); $('#note-in').value = ''; renderDiary(); } };
function item(text, sub, btns, cls = '') {
  const d = document.createElement('div'); d.className = 'pitem ' + cls;
  const t = document.createElement('div'); t.className = 't'; t.textContent = text;
  if (sub) { const sm = document.createElement('small'); sm.textContent = sub; t.append(sm); }
  d.append(t);
  for (const [label, aria, fn] of btns) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.onclick = fn; d.append(b); }
  return d;
}
function renderDiary() {
  const rl = $('#rem-list'), nl = $('#note-list');
  rl.replaceChildren(); nl.replaceChildren();
  const rs = [...diary.reminders()].sort((a, b) => a.when - b.when);
  if (!rs.length) rl.innerHTML = '<p class="empty">אין תזכורות. נסה: "תזכיר לי לשתות מים בעוד 20 דקות".</p>';
  for (const r of rs) rl.append(item(r.text, (r.done ? '✓ ' : '') + diary.fmtWhen(r.when),
    [['📅', 'הוסף ליומן של הטלפון', () => diary.addToCalendar(r)], ['🗑', 'מחק', () => { diary.remove(r.id); renderDiary(); }]], r.done ? 'done' : ''));
  const ns = [...diary.notes()].reverse();
  if (!ns.length) nl.innerHTML = '<p class="empty">היומן ריק.</p>';
  for (const n of ns) nl.append(item(n.text, new Date(n.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }),
    [['🗑', 'מחק', () => { diary.remove(n.id); renderDiary(); }]]));
}

// reminders fire while Jarvis is open (also in a background tab)
diary.startAlerts((r) => {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = '⏰ ' + r.text; document.body.append(t);
  setTimeout(() => t.remove(), 8000);
  say(`אדוני, תזכורת: ${r.text}`);
});

// ------------------------------------------------------------ microphone + wake word
// Privacy first: on-device recognition when the browser has it for Hebrew. Otherwise the browser
// can only recognise speech through its maker's server (Google/Apple) – we ask ONCE before using that.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#btn-mic'), wakeBtn = $('#btn-wake');
const mic = {};
if (!SR) { micBtn.hidden = true; wakeBtn.hidden = true; }
else {
  let mode = null; // 'local' | 'cloud' | null (not decided yet)
  async function decideMode() {
    if (mode) return mode;
    if ('processLocally' in SR.prototype && SR.available) {
      try {
        let st = await SR.available({ langs: ['he-IL'], processLocally: true });
        if ((st === 'downloadable' || st === 'downloading') && SR.install) {
          addMsg('מוריד זיהוי דיבור בעברית למכשיר – פעם אחת…', 'j');
          if (await SR.install({ langs: ['he-IL'], processLocally: true })) st = 'available';
        }
        if (st === 'available') return (mode = 'local');
      } catch { /* fall through */ }
    }
    if (s.micCloud === true) return (mode = 'cloud');
    if (s.micCloud === false) return null;
    return new Promise((done) => {
      const m = addMsg('כדי להבין דיבור בעברית, הדפדפן בטלפון הזה צריך לשלוח את הקול לשרת של Google (כמו במקלדת הקולית). כל השאר נשאר רק אצלך. להפעיל?', 'j');
      addActions(m, [
        ['🎤 כן, להפעיל', () => { s.micCloud = true; save(s); m.querySelector('.acts')?.remove(); done(mode = 'cloud'); }],
        ['⌨️ לא, אקליד', () => { s.micCloud = false; save(s); m.querySelector('.acts')?.remove(); done(null); }],
      ]);
    });
  }
  const make = (continuous) => {
    const r = new SR(); r.lang = 'he-IL'; r.continuous = continuous; r.interimResults = false; r.maxAlternatives = 1;
    if (mode === 'local' && 'processLocally' in r) r.processLocally = true;
    return r;
  };
  const ERR = {
    'not-allowed': 'אין לי הרשאה למיקרופון, אדוני. לחץ על 🔒 ליד הכתובת ← הרשאות ← מיקרופון ← לאפשר. (באפליקציה מותקנת: הגדרות הטלפון ← אפליקציות ← PRIME ← הרשאות.)',
    'service-not-allowed': 'הדפדפן חוסם זיהוי דיבור כאן, אדוני. נסה ב־Chrome.',
    'audio-capture': 'לא מצאתי מיקרופון, אדוני.',
    'network': 'זיהוי הדיבור צריך אינטרנט במכשיר הזה, אדוני.',
    'language-not-supported': 'הדפדפן לא מכיר עברית בזיהוי דיבור, אדוני.',
  };
  const onErr = (e) => {
    if (e.error === 'no-speech') { addMsg('לא שמעתי, אדוני. נסה שוב.', 'j'); return; }
    if (e.error === 'aborted') return;
    if (mode === 'local' && e.error !== 'not-allowed') { mode = null; s.micCloud = undefined; } // local failed → ask about cloud next time
    if (e.error === 'not-allowed' && wake.on) wake.stop();
    say(ERR[e.error] || `המיקרופון לא עבד (${e.error}), אדוני.`);
  };

  // ask the browser for microphone access first – shows the real "allow microphone?" dialog
  async function askMic() {
    try { const st = await navigator.permissions?.query({ name: 'microphone' }); if (st?.state === 'granted') return true; } catch {}
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); return true; }
    catch (e) { say(ERR[/NotFound/.test(e.name) ? 'audio-capture' : 'not-allowed']); return false; }
  }
  mic.askMic = askMic;

  // push-to-talk
  let once = null;
  mic.listenOnce = async () => {
    if (!(await askMic())) return;
    if (!(await decideMode())) return;
    wake.pause();
    once = make(false);
    once.onstart = () => { micBtn.classList.add('on'); core?.setMode('listening'); };
    once.onend = () => { micBtn.classList.remove('on'); if (core?.mode === 'listening') core.setMode('idle'); if (wake.on) wake.resume(); };
    once.onerror = onErr;
    once.onresult = (e) => handle(e.results[0][0].transcript, true);
    try { once.start(); } catch (e) { say('המיקרופון תפוס, אדוני. נסה שוב.'); }
  };
  micBtn.onclick = () => { if (micBtn.classList.contains('on')) { once?.stop(); return; } mic.listenOnce(); };

  // wake word: listens only while the app is open and the 👂 button is on
  const wake = { on: false, rec: null, fails: 0,
    async start() { if (!(await askMic())) return; if (!(await decideMode())) return; this.on = true; this.fails = 0; this.resume(); wakeBtn.classList.add('on'); wakeBtn.setAttribute('aria-pressed', 'true'); addMsg('מקשיב ל"ג\'רוויס", אדוני.', 'j'); },
    stop() { this.on = false; this.pause(); wakeBtn.classList.remove('on'); wakeBtn.setAttribute('aria-pressed', 'false'); },
    pause() { const r = this.rec; this.rec = null; try { r?.abort(); } catch {} },
    resume() {
      if (!this.on || this.rec || document.hidden) return;
      const r = this.rec = make(true);
      r.onresult = (e) => {
        const t = e.results[e.results.length - 1][0].transcript.trim();
        this.fails = 0;
        if (/ג['׳]?ר?וויס|ג'ארוויס|jarvis/i.test(t)) handle(t, true);
      };
      r.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; if (++this.fails > 2) { this.stop(); onErr(e); } };
      r.onend = () => { if (this.rec === r) { this.rec = null; setTimeout(() => this.resume(), 400); } };
      try { r.start(); } catch { this.rec = null; }
    } };
  wakeBtn.onclick = () => { if (wake.on) { wake.stop(); s.wake = false; } else { wake.start(); s.wake = true; } save(s); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) wake.pause(); else wake.resume(); });
  if (s.wake && s.micCloud !== undefined) wake.start();
}

// clock
const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 10000);

if (s.installed) start();
else openSetup(s, (ns) => { s = ns; start().then(() => { say(GREETING_HE); if (window.__primeInstallTip) addMsg(window.__primeInstallTip, 'j'); }); });
