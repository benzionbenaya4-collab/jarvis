// Futuristic HSV color picker panel with live preview, hex input and presets.

const PRESETS = ['#00e5ff', '#1e6bff', '#7b5cff', '#ff2bd6', '#ff2d3d', '#ff8a00', '#ffd400', '#2bff88'];

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

export class ColorPicker {
  constructor({ onPreview, onConfirm, onCancel }) {
    Object.assign(this, { onPreview, onConfirm, onCancel });
    this.panel = document.getElementById('color-panel');
    this.sv = document.getElementById('sv-canvas');
    this.hue = document.getElementById('hue-canvas');
    this.svCursor = document.getElementById('sv-cursor');
    this.hueCursor = document.getElementById('hue-cursor');
    this.hexInput = document.getElementById('color-hex');
    this.orb = document.getElementById('color-orb');
    this.h = 186; this.s = 1; this.v = 1;
    this.original = '#00e5ff';
    this.isOpen = false;

    this.#drawHue();
    this.#bindDrag(this.sv, (x, y) => { this.s = x; this.v = Math.max(0.3, 1 - y); /* too dark would hide the HUD */ this.#update(); });
    this.#bindDrag(this.hue, (x) => { this.h = x * 360; this.#drawSV(); this.#update(); });

    this.hexInput.addEventListener('input', () => {
      const v = this.hexInput.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(v)) this.#setHex(v.startsWith('#') ? v : '#' + v, false);
    });

    const sw = document.getElementById('swatches');
    PRESETS.forEach((hex) => {
      const b = document.createElement('button');
      b.type = 'button'; b.style.background = hex; b.title = hex;
      b.style.boxShadow = `0 0 10px ${hex}`;
      b.addEventListener('click', () => this.#setHex(hex));
      sw.appendChild(b);
    });

    document.getElementById('color-confirm').addEventListener('click', () => this.confirm());
    document.getElementById('color-cancel').addEventListener('click', () => this.cancel());
    document.getElementById('color-close').addEventListener('click', () => this.cancel());
    window.addEventListener('keydown', (e) => { if (this.isOpen && e.key === 'Escape') this.cancel(); });
  }

  get hex() { return rgbToHex(...hsvToRgb(this.h, this.s, this.v)); }

  open(currentHex) {
    this.original = currentHex;
    this.#setHex(currentHex, true, false);
    this.isOpen = true;
    this.panel.classList.add('open');
    this.panel.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.panel.setAttribute('aria-hidden', 'true');
  }

  confirm() { this.close(); this.onConfirm?.(this.hex); }
  cancel() { this.close(); this.onCancel?.(this.original); }

  #setHex(hex, writeInput = true, preview = true) {
    [this.h, this.s, this.v] = rgbToHsv(...hexToRgb(hex));
    this.#drawSV();
    this.#update(writeInput, preview);
  }

  #update(writeInput = true, preview = true) {
    const hex = this.hex;
    if (writeInput) this.hexInput.value = hex.toUpperCase();
    this.orb.style.setProperty('--pick', hex);
    this.svCursor.style.left = `${this.s * 100}%`;
    this.svCursor.style.top = `${(1 - this.v) * 100}%`;
    this.svCursor.style.background = hex;
    this.hueCursor.style.left = `${(this.h / 360) * 100}%`;
    if (preview) this.onPreview?.(hex);
  }

  #drawHue() {
    const c = this.hue.getContext('2d');
    const g = c.createLinearGradient(0, 0, this.hue.width, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.hue.width, this.hue.height);
  }

  #drawSV() {
    const c = this.sv.getContext('2d');
    const { width: w, height: h } = this.sv;
    c.fillStyle = `hsl(${this.h},100%,50%)`;
    c.fillRect(0, 0, w, h);
    const white = c.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, '#fff'); white.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = white; c.fillRect(0, 0, w, h);
    const black = c.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, '#000');
    c.fillStyle = black; c.fillRect(0, 0, w, h);
  }

  #bindDrag(el, fn) {
    const handle = (e) => {
      const r = el.getBoundingClientRect();
      fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      handle(e);
      const move = (ev) => handle(ev);
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }
}
