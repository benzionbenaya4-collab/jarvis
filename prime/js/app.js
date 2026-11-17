// JARVIS PRIME – main. Everything runs on this device; nothing is sent to any server.
import { load } from './settings.js';
import { openSetup } from './setup.js';
import { makeCore } from './core.js';
import { reply } from './brain.js';
import { speak, setHooks } from './voice.js';

const $ = (s) => document.querySelector(s);
let s = load();
let core = null;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

async function start() {
  $('#hud').hidden = false;
  core?.dispose?.();
  if (core?.renderer) { core.renderer.setAnimationLoop(null); }
  // a fresh canvas each time: 2D and WebGL contexts can't share one
  const old = $('#core'); const cv = old.cloneNode(); old.replaceWith(cv);
  core = await makeCore(cv, s);
  let speakTimer = 0;
  setHooks({
    onStart: () => { core.setMode('speaking'); clearInterval(speakTimer); speakTimer = setInterval(() => core.setAudioLevel(0.35 + Math.random() * 0.55), 90); },
    onEnd: () => { clearInterval(speakTimer); core.setAudioLevel(0); core.setMode('idle'); },
  });
}

function say(text) {
  addMsg(text, 'j');
  speak(text, { preset: s.voice, voiceName: s.voiceName, pitch: s.pitch, rate: s.rate });
}

function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = `msg ${who}`;
  m.textContent = text;
  $('#log').append(m);
  $('#log').scrollTop = $('#log').scrollHeight;
}

function handle(text) {
  if (!text.trim()) return;
  addMsg(text, 'me');
  core?.setMode('thinking');
  const r = reply(text);
  say(r.text);
}

$('#ask').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q'); handle(q.value); q.value = ''; });
$('#btn-settings').addEventListener('click', () => openSetup(s, (ns) => { s = ns; start(); }));

// --- microphone (on-device recognition when the browser supports it) ---
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('#btn-mic');
if (!SR) mic.hidden = true;
else {
  const rec = new SR();
  rec.lang = 'he-IL'; rec.interimResults = false; rec.maxAlternatives = 1;
  const local = 'processLocally' in rec;
  if (local) rec.processLocally = true;
  let warned = false;
  rec.onstart = () => { mic.classList.add('on'); core?.setMode('listening'); };
  rec.onend = () => { mic.classList.remove('on'); if (core?.mode === 'listening') core.setMode('idle'); };
  rec.onresult = (e) => handle(e.results[0][0].transcript);
  mic.addEventListener('click', () => {
    if (mic.classList.contains('on')) { rec.stop(); return; }
    if (!local && !warned) {
      warned = true;
      addMsg('שים לב: בדפדפן הזה זיהוי הדיבור עובר דרך שרת של הדפדפן. להקלדה – הכול נשאר במכשיר.', 'j');
    }
    try { rec.start(); } catch { /* already running */ }
  });
}

// clock
const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 10000);

if (s.installed) start();
else openSetup(s, (ns) => { s = ns; start().then(() => say('שלום אדוני, במה אוכל לעזור לך?')); });
