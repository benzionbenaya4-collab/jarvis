// JARVIS PRIME – main. Everything runs on this device; nothing is sent to any server.
import { load, save } from './settings.js';
import { openSetup } from './setup.js';
import { makeCore } from './core.js';
import { reply } from './brain.js';
import { speak, setHooks, GREETING_HE } from './voice.js';
import * as diary from './diary.js';
import * as kb from './knowledge.js';

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
  if (r.listen && viaVoice) listenNext = true; // typed → keep typing; spoken → keep listening
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
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#btn-mic'), wakeBtn = $('#btn-wake');
const mic = {};
if (!SR) { micBtn.hidden = true; wakeBtn.hidden = true; }
else {
  const make = (continuous) => {
    const r = new SR(); r.lang = 'he-IL'; r.continuous = continuous; r.interimResults = false;
    if ('processLocally' in r) r.processLocally = true;
    return r;
  };
  const local = 'processLocally' in SR.prototype;
  let warned = false;
  const warn = () => { if (!local && !warned) { warned = true; addMsg('שים לב: בדפדפן הזה זיהוי הדיבור עובר דרך שרת של הדפדפן. בהקלדה – הכול נשאר במכשיר.', 'j'); } };

  // push-to-talk
  const once = make(false);
  once.onstart = () => { micBtn.classList.add('on'); core?.setMode('listening'); };
  once.onend = () => { micBtn.classList.remove('on'); if (core?.mode === 'listening') core.setMode('idle'); if (wake.on) wake.resume(); };
  once.onresult = (e) => handle(e.results[0][0].transcript, true);
  mic.listenOnce = () => { wake.pause(); try { once.start(); } catch {} };
  micBtn.onclick = () => { if (micBtn.classList.contains('on')) { once.stop(); return; } warn(); mic.listenOnce(); };

  // wake word: listens only while the app is open and the 👂 button is on
  const wake = { on: false, rec: null,
    start() { this.on = true; this.resume(); wakeBtn.classList.add('on'); wakeBtn.setAttribute('aria-pressed', 'true'); },
    stop() { this.on = false; this.pause(); wakeBtn.classList.remove('on'); wakeBtn.setAttribute('aria-pressed', 'false'); },
    pause() { const r = this.rec; this.rec = null; try { r?.abort(); } catch {} },
    resume() {
      if (!this.on || this.rec || document.hidden) return;
      const r = this.rec = make(true);
      r.onresult = (e) => {
        const t = e.results[e.results.length - 1][0].transcript.trim();
        if (/ג['׳]?ר?וויס|ג'ארוויס|jarvis/i.test(t)) handle(t, true);
      };
      r.onend = () => { if (this.rec === r) { this.rec = null; setTimeout(() => this.resume(), 300); } };
      try { r.start(); } catch { this.rec = null; }
    } };
  wakeBtn.onclick = () => { if (wake.on) { wake.stop(); s.wake = false; } else { warn(); wake.start(); s.wake = true; } save(s); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) wake.pause(); else wake.resume(); });
  if (s.wake) wake.start();
}

// clock
const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 10000);

if (s.installed) start();
else openSetup(s, (ns) => { s = ns; start().then(() => say(GREETING_HE)); });
