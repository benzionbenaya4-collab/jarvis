// Settings live only on this device (localStorage). Nothing is ever sent anywhere.
const KEY = 'prime.settings.v1';

export const DEFAULTS = {
  installed: false,
  voice: 'deep',          // preset id (see voice.js)
  voiceName: '',          // optional device voice override
  pitch: 0.8,
  rate: 0.95,
  core: '2d',             // '2d' | '3d'
  fx: 'high',             // 3D only: 'low' | 'high'
  features: { games: true, hands: false, pose: false, knowledge: true },
  knowledge: 'light',     // 'light' | 'medium' | 'heavy'
};

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return { ...DEFAULTS, ...s, features: { ...DEFAULTS.features, ...(s.features || {}) } };
  } catch { /* private mode / blocked storage */ }
  return structuredClone(DEFAULTS);
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
