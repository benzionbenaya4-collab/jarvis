// JARVIS PRIME flat 2D core – light and fast (Canvas 2D, no three.js).
// Same public API as the 3D JarvisCore: setAudioLevel, setGestureScale, setMode, setColor.
export class Core2D {
  constructor(canvas, hex = '#00e5ff') {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.audio = 0; this.audioT = 0;
    this.scale = 1; this.scaleT = 1;
    this.mode = 'idle';
    this.setColor(hex);
    this.t0 = performance.now();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.running = true;
    const loop = (t) => { if (!this.running) return; this.draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setAudioLevel(v) { this.audioT = Math.max(0, Math.min(1, v)); }
  setGestureScale(s) { this.scaleT = s == null ? 1 : Math.max(0.5, Math.min(1.9, s)); }
  setMode(m) { this.mode = m; }
  setColor(hex) { this.hex = hex; }
  dispose() { this.running = false; window.removeEventListener('resize', this.resize); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.c.width = Math.round(window.innerWidth * dpr);
    this.c.height = Math.round(window.innerHeight * dpr);
  }

  draw(now) {
    const g = this.g, W = this.c.width, H = this.c.height, t = (now - this.t0) / 1000;
    this.audio += (this.audioT - this.audio) * 0.2;
    this.scale += (this.scaleT - this.scale) * 0.12;
    const busy = this.mode === 'thinking' ? 1 : 0;
    const listen = this.mode === 'listening' ? 1 : 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000308'; g.fillRect(0, 0, W, H);

    // core sits a bit above center so the chat has room below
    const u = Math.min(W, H) / 600 * this.scale * (W < H ? 1.05 : 0.85);
    g.translate(W / 2, H * 0.42);
    g.scale(u, u);
    const col = this.hex;
    g.strokeStyle = col; g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = 14;

    // glowing center – pulses with the voice
    const r0 = 46 + this.audio * 14 + Math.sin(t * 2) * 1.5;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r0);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, '#9ff6ff'); grad.addColorStop(1, col);
    g.fillStyle = grad; g.beginPath(); g.arc(0, 0, r0, 0, Math.PI * 2); g.fill();

    const ring = (r, w, a = 1, dash = null) => {
      g.globalAlpha = a; g.lineWidth = w; g.setLineDash(dash || []);
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
    };
    ring(70 + this.audio * 6, 3);
    ring(100, 1.5, 0.7);

    // bump ring – rotates slowly, faster while thinking
    g.save(); g.rotate(t * (0.15 + busy * 0.9));
    ring(128, 2);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, big = i % 3 === 0;
      const r2 = big ? 150 + this.audio * 10 : 136;
      g.lineWidth = big ? 6 : 3;
      g.beginPath(); g.moveTo(Math.cos(a) * 128, Math.sin(a) * 128); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); g.stroke();
    }
    g.restore();

    // dashed ring – counter-rotates
    g.save(); g.rotate(-t * (0.1 + listen * 0.6));
    ring(170, 2, 0.9, [70, 18]);
    g.restore();
    ring(200, 1, 0.5);

    // clock ticks
    g.shadowBlur = 0; g.globalAlpha = 0.7; g.lineWidth = 1.5;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, long = i % 6 === 0;
      g.beginPath(); g.moveTo(Math.cos(a) * 210, Math.sin(a) * 210);
      g.lineTo(Math.cos(a) * (long ? 222 : 216), Math.sin(a) * (long ? 222 : 216)); g.stroke();
    }
    g.globalAlpha = 1;
  }
}
