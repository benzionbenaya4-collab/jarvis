// Picks the core the user chose. The 3D core is the original J.A.R.V.I.S core
// (../../js/scene.js, untouched) and is only loaded when chosen.
import { Core2D } from './core2d.js';

export async function makeCore(canvas, s) {
  if (s.core === '3d') {
    try {
      const { JarvisCore } = await import('../../js/scene.js');
      const core = new JarvisCore(canvas, '#00e5ff');
      if (s.fx === 'low') {
        core.bloom.enabled = false;               // no glow pass
        core.renderer.setPixelRatio(1);           // fewer pixels
      }
      return core;
    } catch (e) {
      console.warn('3D core unavailable, using 2D', e);
    }
  }
  return new Core2D(canvas);
}
