// Jarvis's terminal: hidden until asked for ("תפתח טרמינל", a code request, a timer).
// Shows code Jarvis wrote (with Run / Copy), program output, and live timers.

const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class JarvisTerminal {
  constructor({ onRun, onCancelTimer }) {
    this.onRun = onRun;
    this.onCancelTimer = onCancelTimer;
    this.panel = document.getElementById('terminal');
    this.log = document.getElementById('term-log');
    this.timersBox = document.getElementById('term-timers');
    this.timers = [];
    this.isOpen = false;

    document.getElementById('term-close').addEventListener('click', () => this.close());
    document.getElementById('term-clear').addEventListener('click', () => { this.log.textContent = ''; this.print('cleared', 'dim'); });
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); this.toggle(); }
    });
    setInterval(() => this.#renderTimers(), 1000);
    this.print('J.A.R.V.I.S terminal ready. Ask for code, a timer or an alarm.', 'dim');
  }

  open() { this.isOpen = true; this.panel.classList.add('open'); this.panel.setAttribute('aria-hidden', 'false'); }
  close() { this.isOpen = false; this.panel.classList.remove('open'); this.panel.setAttribute('aria-hidden', 'true'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  print(text, cls = '') {
    const line = el('div', `term-line ${cls}`, text);
    this.log.appendChild(line);
    this.#scroll();
    return line;
  }

  command(text) { this.print(`jarvis> ${text}`, 'cmd'); }

  code({ file, language, code, runnable, model }) {
    const block = el('div', 'term-code');
    const head = el('div', 'term-code-head');
    head.append(el('span', 'term-file', `${file}`), el('span', 'term-lang', `${language}${model ? ' · ' + model : ''}`));
    const actions = el('div', 'term-actions');
    const copy = el('button', 'term-btn', 'COPY');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); copy.textContent = 'COPIED'; } catch { copy.textContent = 'COPY FAILED'; }
      setTimeout(() => { copy.textContent = 'COPY'; }, 1500);
    });
    actions.append(copy);
    if (runnable) {
      const run = el('button', 'term-btn run', language === 'html' ? '▶ OPEN' : '▶ RUN');
      run.type = 'button';
      run.title = 'הרץ את הקוד (רק כשאתה מאשר)';
      run.addEventListener('click', () => this.onRun(file));
      actions.append(run);
    }
    head.append(actions);
    const pre = el('pre', 'term-pre');
    code.replace(/\n$/, '').split('\n').forEach((ln) => pre.append(el('code', '', ln || ' ')));
    block.append(head, pre);
    this.log.appendChild(block);
    this.#scroll();
  }

  /** Live view of code while the model writes it (big models on a CPU take minutes). */
  streamCode({ model, text, started, done }) {
    if (started || !this.live) {
      this.live?.box.remove();
      const box = el('div', 'term-code live');
      const head = el('div', 'term-code-head');
      const label = el('span', 'term-file', 'writing code…');
      const clock = el('span', 'term-lang', model || '');
      head.append(label, clock);
      const pre = el('pre', 'term-pre live-pre');
      box.append(head, pre);
      this.log.appendChild(box);
      const t0 = Date.now();
      const tick = setInterval(() => { clock.textContent = `${model || ''} · ${fmt((Date.now() - t0) / 1000)}`; }, 1000);
      this.live = { box, pre, label, tick };
      this.open();
    }
    // Show only the code part once the model starts the ``` block.
    const fence = text.indexOf('```');
    const shown = fence >= 0 ? text.slice(text.indexOf('\n', fence) + 1).replace(/```[\s\S]*$/, '') : '';
    this.live.label.textContent = fence >= 0 ? 'writing code…' : 'thinking…';
    this.live.pre.textContent = shown;
    this.live.pre.scrollTop = this.live.pre.scrollHeight;
    this.#scroll();
    if (done) {
      clearInterval(this.live.tick);
      this.live.box.remove();
      this.live = null;
    }
  }

  runResult(r) {
    if (!r) return;
    if (!r.ok) { this.print(`✗ ${r.error === 'no_code' ? 'no code to run yet' : r.error}`, 'err'); return; }
    this.print(`$ python ${r.file}`, 'cmd');
    if (r.output) this.print(r.output.replace(/\n$/, ''), r.exit_code === 0 && !r.timed_out ? 'out' : 'err');
    this.print(r.timed_out ? '⏱ stopped: time limit reached'
      : `${r.exit_code === 0 ? '✓' : '✗'} exit ${r.exit_code} · ${r.seconds}s`, r.exit_code === 0 && !r.timed_out ? 'ok' : 'err');
  }

  setTimers(list = []) {
    this.timers = list;
    this.#renderTimers();
  }

  timerDone(t) {
    this.timers = this.timers.filter((x) => x.id !== t.id);
    this.#renderTimers();
    this.print(`⏰ ${t.kind === 'alarm' ? 'ALARM' : 'TIMER'} · ${t.label}`, 'alarm');
  }

  #renderTimers() {
    this.timersBox.hidden = !this.timers.length;
    const now = Date.now() / 1000;
    this.timersBox.textContent = '';
    for (const t of this.timers) {
      const row = el('div', 'term-timer');
      const left = t.due - now;
      const when = t.kind === 'alarm'
        ? new Date(t.due * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : fmt(left);
      row.append(el('span', 'term-timer-icon', t.kind === 'alarm' ? '⏰' : '⏱'),
        el('span', 'term-timer-label', t.label), el('span', 'term-timer-time', when));
      if (t.kind === 'alarm') row.append(el('span', 'term-timer-sub', `in ${fmt(left)}`));
      const x = el('button', 'term-btn', '✕');
      x.type = 'button';
      x.title = 'Cancel';
      x.addEventListener('click', () => this.onCancelTimer(t.id));
      row.append(x);
      this.timersBox.appendChild(row);
    }
  }

  #scroll() { this.log.scrollTop = this.log.scrollHeight; }
}

/** A short repeating alarm tone in the browser (the PC also beeps on its own). */
export function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = i % 2 ? 1175 : 880;
      const t0 = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.25);
    }
    setTimeout(() => ctx.close(), 2500);
  } catch { /* no audio */ }
}
