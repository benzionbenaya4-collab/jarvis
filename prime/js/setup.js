// Setup screen shown before install (and later from the ⚙ button).
import { PRESETS, GREETING_HE, GREETING_EN, speak, stop, onVoices, supported as ttsOK } from './voice.js';
import { ALWAYS, OPTIONAL, KNOWLEDGE, CORE3D_MB, totalMB, fmtMB } from './features.js';
import { save } from './settings.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

import { install, isInstalled, platform, STEPS, NAMES } from './install.js';

export function openSetup(s, onDone) {
  const root = $('#setup');
  root.hidden = false;
  $('#hud').hidden = true;
  window.scrollTo(0, 0);
  $('#btn-install').textContent = s.installed ? 'שמור ✓' : 'התקן ⬇';

  // ---------------------------------------------------------- 1 · voice
  const vbox = $('#voices'); vbox.innerHTML = '';
  for (const p of PRESETS) {
    const card = el('div', 'card' + (s.voice === p.id ? ' sel' : ''));
    card.setAttribute('role', 'radio'); card.tabIndex = 0;
    card.setAttribute('aria-checked', String(s.voice === p.id));
    card.innerHTML = `<span class="ic">🎙️</span><span class="t"><b>${p.name}</b><i>${p.desc}</i></span>`;
    const play = el('button', 'play', '▶ שלום'); play.type = 'button';
    play.setAttribute('aria-label', `השמע את ${p.name}`);
    card.append(play);
    const choose = () => {
      s.voice = p.id; s.pitch = p.pitch; s.rate = p.rate;
      vbox.querySelectorAll('.card').forEach((c) => { c.classList.toggle('sel', c === card); c.setAttribute('aria-checked', String(c === card)); });
      syncSliders();
    };
    const hear = async (e) => {
      e?.stopPropagation(); choose();
      if (!ttsOK) { $('#install-msg').textContent = 'הדפדפן הזה לא תומך בהקראה.'; return; }
      vbox.querySelectorAll('.play').forEach((b) => b.classList.remove('playing'));
      play.classList.add('playing');
      await speak(p.lang === 'en' ? GREETING_EN : GREETING_HE, { preset: p.id, voiceName: s.voiceName, pitch: s.pitch, rate: s.rate });
      play.classList.remove('playing');
    };
    play.addEventListener('click', hear);
    card.addEventListener('click', hear);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hear(); } });
    vbox.append(card);
  }
  const sel = $('#voice-name');
  onVoices((vs) => {
    sel.innerHTML = '<option value="">אוטומטי (הכי מתאים)</option>' +
      vs.filter((v) => /^(he|iw|en)/i.test(v.lang)).map((v) => `<option value="${v.name.replace(/"/g, '&quot;')}">${v.name} · ${v.lang}</option>`).join('');
    sel.value = s.voiceName || '';
  });
  sel.onchange = () => { s.voiceName = sel.value; };
  const pitch = $('#pitch'), rate = $('#rate');
  const syncSliders = () => { pitch.value = s.pitch; rate.value = s.rate; };
  syncSliders();
  pitch.oninput = () => { s.pitch = +pitch.value; };
  rate.oninput = () => { s.rate = +rate.value; };
  pitch.onchange = rate.onchange = () => speak(GREETING_HE, { preset: s.voice, voiceName: s.voiceName, pitch: s.pitch, rate: s.rate });

  // ---------------------------------------------------------- 2 · core
  // speed: on a weak device suggest the light 2D core
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
  root.querySelector('[data-size="core3d"]').textContent = fmtMB(CORE3D_MB) + (weak ? ' · למכשיר חזק' : '');
  const picks = root.querySelectorAll('[data-core]');
  const fx = $('#fx');
  const syncCore = () => {
    picks.forEach((b) => { b.classList.toggle('sel', b.dataset.core === s.core); b.setAttribute('aria-pressed', String(b.dataset.core === s.core)); });
    fx.classList.toggle('disabled', s.core !== '3d');
    fx.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.fx === s.fx); b.setAttribute('aria-checked', String(b.dataset.fx === s.fx)); b.setAttribute('role', 'radio'); });
    updateTotal();
  };
  picks.forEach((b) => { b.onclick = () => { s.core = b.dataset.core; syncCore(); }; });
  fx.querySelectorAll('button').forEach((b) => { b.onclick = () => { s.fx = b.dataset.fx; syncCore(); }; });

  // ---------------------------------------------------------- 3 · features
  const always = $('#feat-always'); always.innerHTML = '';
  for (const f of ALWAYS) {
    const c = el('div', 'card feat');
    c.innerHTML = `<span class="ic">${f.ic}</span><span class="t"><b>${f.name}</b><i>${f.desc}</i></span><span class="sz free">כמעט 0</span>`;
    const tg = el('button', 'tg'); tg.type = 'button'; tg.disabled = true; tg.setAttribute('role', 'switch'); tg.setAttribute('aria-checked', 'true'); tg.setAttribute('aria-label', `${f.name} – תמיד פועל`);
    c.append(tg); always.append(c);
  }
  const opt = $('#feat-opt'); opt.innerHTML = '';
  for (const f of OPTIONAL) {
    const c = el('div', 'card feat');
    const size = el('span', 'sz');
    c.innerHTML = `<span class="ic">${f.ic}</span><span class="t"><b>${f.name}</b><i>${f.desc}</i></span>`;
    c.append(size);
    const tg = el('button', 'tg'); tg.type = 'button'; tg.setAttribute('role', 'switch'); tg.setAttribute('aria-label', f.name);
    c.append(tg);
    let seg = null, note = null;
    if (f.levels) {
      seg = el('div', 'seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'רמת ידע');
      for (const k of KNOWLEDGE) {
        const b = el('button', '', `${k.label} · ${k.mb}MB`); b.type = 'button'; b.dataset.k = k.id; b.setAttribute('role', 'radio');
        b.onclick = () => { s.knowledge = k.id; sync(); };
        seg.append(b);
      }
      note = el('p', 'note');
      c.append(seg, note);
    }
    const sync = () => {
      const on = !!s.features[f.id];
      tg.setAttribute('aria-checked', String(on));
      c.classList.toggle('sel', on);
      if (f.levels) {
        const k = KNOWLEDGE.find((x) => x.id === s.knowledge);
        size.textContent = fmtMB(k.mb);
        seg.classList.toggle('disabled', !on);
        seg.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.k === s.knowledge); b.setAttribute('aria-checked', String(b.dataset.k === s.knowledge)); });
        note.textContent = on ? `${k.label}: ${k.desc}` : 'כבוי – ג\'רוויס יענה רק מהקיצורים והפקודות.';
      } else size.textContent = fmtMB(f.mb);
      updateTotal();
    };
    tg.onclick = () => { s.features[f.id] = !s.features[f.id]; sync(); };
    sync();
    opt.append(c);
  }

  function updateTotal() { $('#total').textContent = fmtMB(totalMB(s)); }
  syncCore();

  // ---------------------------------------------------------- install
  const btn = $('#btn-install'), msg = $('#install-msg');
  btn.onclick = async () => {
    stop();
    btn.disabled = true;
    msg.textContent = 'מתקין… שומר את הבחירות שלך במכשיר.';
    s.installed = true;
    if (!save(s)) msg.textContent = 'שים לב: הדפדפן חוסם שמירה – ההגדרות יישמרו רק עד שתסגור.';
    try { await cacheSelected(s); } catch { /* offline cache is a bonus */ }
    // install as an app (Android/Windows/Mac prompt; iPhone/Mac-Safari get the steps once)
    if (!isInstalled()) {
      const res = await install().catch(() => 'manual');
      if (res === 'manual' && !s.installTip) { s.installTip = true; save(s); window.__primeInstallTip = `להתקנה כאפליקציה ב${NAMES[platform()]}: ` + STEPS[platform()].join(' ← '); }
    }
    btn.disabled = false;
    root.hidden = true;
    msg.textContent = '';
    onDone(s);
  };
}

// Ask the service worker to keep only what the user picked for offline use.
async function cacheSelected(s) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const urls = [];
  if (s.core === '3d') urls.push('../js/scene.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js');
  for (const f of OPTIONAL) if (s.features[f.id] && f.urls) urls.push(...f.urls);
  if (s.features.knowledge) urls.push('knowledge/light.json', ...(s.knowledge !== 'light' ? ['knowledge/medium.json'] : []));
  reg.active?.postMessage({ type: 'cache-features', urls });
}
