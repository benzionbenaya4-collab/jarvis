// Speech-to-Text (Web Speech API) and Text-to-Speech for Jarvis's voice.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export class Listener {
  constructor({ lang = 'he-IL', onInterim, onFinal, onState, onError } = {}) {
    this.supported = !!SR;
    this.lang = lang;
    this.listening = false;
    Object.assign(this, { onInterim, onFinal, onState, onError });
    if (!this.supported) return;

    this.rec = new SR();
    this.rec.continuous = false;
    this.rec.interimResults = true;
    this.rec.maxAlternatives = 1;

    this.rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      if (interim) this.onInterim?.(interim);
      if (final.trim()) this.onFinal?.(final.trim());
    };
    this.rec.onstart = () => { this.listening = true; this.onState?.(true); };
    this.rec.onend = () => { this.listening = false; this.onState?.(false); this.onInterim?.(''); };
    this.rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') this.onError?.(e.error); };
  }

  start() {
    if (!this.supported || this.listening) return;
    this.rec.lang = this.lang;
    try { this.rec.start(); } catch { /* already started */ }
  }

  stop() { if (this.supported && this.listening) this.rec.stop(); }
  toggle() { this.listening ? this.stop() : this.start(); }
}

export class Speaker {
  constructor({ onStart, onEnd, onBoundary } = {}) {
    this.supported = 'speechSynthesis' in window;
    this.enabled = true;
    Object.assign(this, { onStart, onEnd, onBoundary });
    this.voices = [];
    if (this.supported) {
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }

  #pickVoice(lang) {
    const base = lang.slice(0, 2);
    const matches = this.voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
    if (base === 'en') {
      // Prefer a British male-sounding voice for the classic Jarvis feel.
      return matches.find((v) => /en-GB/i.test(v.lang) && /(male|daniel|george|ryan|arthur)/i.test(v.name))
        || matches.find((v) => /en-GB/i.test(v.lang)) || matches[0];
    }
    return matches.find((v) => /(asaf|avri|male)/i.test(v.name)) || matches[0];
  }

  speak(text) {
    if (!this.supported || !this.enabled || !text) return;
    speechSynthesis.cancel();
    const lang = /[֐-׿]/.test(text) ? 'he-IL' : 'en-GB';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voice = this.#pickVoice(lang);
    if (voice) u.voice = voice;
    u.rate = 1.03;
    u.pitch = 0.9;
    u.onstart = () => this.onStart?.();
    u.onend = u.onerror = () => this.onEnd?.();
    u.onboundary = () => this.onBoundary?.();
    speechSynthesis.speak(u);
  }

  cancel() { if (this.supported) speechSynthesis.cancel(); }
}
