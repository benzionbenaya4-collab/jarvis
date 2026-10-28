// Audio reactivity: real microphone level + a synthetic envelope while Jarvis speaks.
// (Browsers don't expose speechSynthesis output to the Web Audio API, so Jarvis's
// own voice is approximated from word-boundary events.)

export class AudioReactor {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.buf = null;
    this.speaking = false;
    this.kick = 0;
    this.noiseFloor = 0.01;
  }

  async startMic() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.buf = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser);
  }

  stopMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
  }

  wordBoundary() { this.kick = 1; }
  setSpeaking(on) { this.speaking = on; if (on) this.kick = 1; }

  /** Combined level in [0, 1] for the visualizer. */
  level(time = performance.now() / 1000) {
    let mic = 0;
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length);
      // Adaptive noise floor so room hum doesn't keep the core excited.
      this.noiseFloor = rms < this.noiseFloor ? rms : this.noiseFloor * 0.999 + rms * 0.001;
      mic = Math.min(1, Math.max(0, (rms - this.noiseFloor * 1.5) * 9));
    }

    let voice = 0;
    if (this.speaking) {
      this.kick *= 0.9;
      const syllables = 0.5 + 0.5 * Math.sin(time * 17) * Math.sin(time * 5.3 + 1.7);
      voice = Math.min(1, 0.22 + syllables * 0.3 + this.kick * 0.45);
    }
    return Math.max(mic, voice);
  }
}
