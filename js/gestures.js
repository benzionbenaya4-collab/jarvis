// Hand-gesture control with MediaPipe Hands: thumb tip (4) <-> index tip (8) distance
// drives the scale of the 3D core. Spread fingers = bigger, pinch = smaller.

const MP_VERSION = '0.4.1675469240';
const THUMB_TIP = 4, INDEX_TIP = 8, WRIST = 0, MIDDLE_MCP = 9;

export class GestureController {
  constructor({ video, overlay, onScale, onStatus, accent = () => '#00e5ff' }) {
    Object.assign(this, { video, overlay, onScale, onStatus, accent });
    this.ctx = overlay.getContext('2d');
    this.running = false;
    this.stream = null;
    this.hands = null;
    this.lastSeen = 0;
    this.busy = false;
  }

  async start() {
    if (this.running) return;
    if (!window.Hands) throw new Error('MediaPipe Hands failed to load (check internet connection).');

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.hands) {
      this.hands = new window.Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}/${f}`,
      });
      this.hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      this.hands.onResults((r) => this.#onResults(r));
    }
    this.running = true;
    this.onStatus?.('LOADING MODEL');
    this.#loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.onScale?.(null);
  }

  async #loop() {
    if (!this.running) return;
    if (!this.busy && this.video.readyState >= 2) {
      this.busy = true;
      try { await this.hands.send({ image: this.video }); } catch (e) { console.warn(e); }
      this.busy = false;
    }
    if (performance.now() - this.lastSeen > 700) { this.onScale?.(null); }
    requestAnimationFrame(() => this.#loop());
  }

  #onResults(results) {
    const { overlay: cv, ctx } = this;
    cv.width = this.video.videoWidth || 640;
    cv.height = this.video.videoHeight || 480;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const lm = results.multiHandLandmarks?.[0];
    if (!lm) { this.onStatus?.('NO HAND'); return; }
    this.lastSeen = performance.now();

    // Normalise the pinch distance by palm size so it works at any distance from the camera.
    const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, (lm[a].z - lm[b].z) * 0.5);
    const ratio = d(THUMB_TIP, INDEX_TIP) / Math.max(d(WRIST, MIDDLE_MCP), 1e-3);
    const t = Math.min(1, Math.max(0, (ratio - 0.18) / (1.25 - 0.18)));
    const scale = 0.55 + t * 1.25;
    this.onScale?.(scale);
    this.onStatus?.(t < 0.12 ? 'PINCH' : t > 0.85 ? 'SPREAD' : 'TRACKING', scale);

    this.#draw(lm, t);
  }

  #draw(lm, t) {
    const { ctx, overlay: cv } = this;
    const color = this.accent();
    const P = (i) => [lm[i].x * cv.width, lm[i].y * cv.height];

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    for (const [a, b] of window.HAND_CONNECTIONS || []) {
      ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    lm.forEach((_, i) => { ctx.beginPath(); ctx.arc(...P(i), 2.5, 0, Math.PI * 2); ctx.fill(); });

    // Thumb-index "energy beam"
    ctx.save();
    ctx.shadowBlur = 18; ctx.shadowColor = color;
    ctx.strokeStyle = color; ctx.lineWidth = 3 + t * 5;
    ctx.beginPath(); ctx.moveTo(...P(THUMB_TIP)); ctx.lineTo(...P(INDEX_TIP)); ctx.stroke();
    ctx.fillStyle = color;
    [THUMB_TIP, INDEX_TIP].forEach((i) => { ctx.beginPath(); ctx.arc(...P(i), 7, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }
}
