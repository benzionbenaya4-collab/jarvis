// Camera features – loaded only when the user turns them on. Video never leaves the device.
//  hands : pinch/spread zoom of the core (the original J.A.R.V.I.S GestureController)
//  pose  : people → glowing 3D-style skeletons. Body POSE only – no face recognition, no identity.
const $ = (s) => document.querySelector(s);
let active = null; // { kind, stop }

function loadScript(src) {
  return new Promise((ok, bad) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = bad; document.head.append(s); });
}
function box(show, big) {
  const b = $('#cam'); b.hidden = !show; b.classList.toggle('big', !!big);
}
export const running = () => active?.kind || null;
export function stop() { active?.stop(); active = null; box(false); }

export async function startHands(core, onStatus) {
  stop();
  try { await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js'); } catch { throw new Error('load hands model failed'); }
  const { GestureController } = await import('../../js/gestures.js');
  const g = new GestureController({ video: $('#cam-video'), overlay: $('#cam-overlay'),
    onScale: (sc) => core.setGestureScale(sc), onStatus: (st) => onStatus?.(st) });
  box(true, false);
  try { await g.start(); } catch (e) { g.stop(); throw e; }
  active = { kind: 'hands', stop: () => g.stop() };
}

// MediaPipe Pose skeleton (body joints only: shoulders, arms, hips, legs)
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
export async function startPose(onStatus, accent = '#00e5ff') {
  stop();
  const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const { PoseLandmarker, FilesetResolver } = await import(`${V}/vision_bundle.mjs`);
  onStatus?.('טוען את מודל הזיהוי…');
  const fs = await FilesetResolver.forVisionTasks(`${V}/wasm`);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate },
    runningMode: 'VIDEO', numPoses: 4,
  });
  let pl;
  try { pl = await PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch { pl = await PoseLandmarker.createFromOptions(fs, opts('CPU')); } // some phones have no WebGL2
  const video = $('#cam-video'), cv = $('#cam-overlay'), g = cv.getContext('2d');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 960 } }, audio: false }); }
  catch (e) { pl.close(); throw e; }
  video.srcObject = stream; await video.play();
  box(true, true);
  let on = true, last = -1, count = -1;
  const loop = () => {
    if (!on) return;
    if (video.readyState >= 2 && video.currentTime !== last) {
      last = video.currentTime;
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      const r = pl.detectForVideo(video, performance.now());
      g.clearRect(0, 0, cv.width, cv.height);
      (r.landmarks || []).forEach((lm, i) => drawSkeleton(g, cv, lm, accent, i));
      const n = r.landmarks?.length || 0;
      if (n !== count) { count = n; onStatus?.(n ? `זוהו ${n} אנשים` : 'לא רואה אנשים'); }
    }
    requestAnimationFrame(loop);
  };
  loop();
  active = { kind: 'pose', stop: () => { on = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; g.clearRect(0, 0, cv.width, cv.height); pl.close(); } };
}

export function drawSkeleton(g, cv, lm, accent, i = 0) {
  const P = (k) => [lm[k].x * cv.width, lm[k].y * cv.height];
  // depth (z) → closer joints are thicker and brighter: the "3D" look
  const depth = (k) => Math.max(0.35, Math.min(1.6, 1 - lm[k].z * 1.5));
  g.save(); g.lineCap = 'round'; g.shadowColor = accent; g.shadowBlur = 16;
  for (const [a, b] of BONES) {
    if ((lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
    const d = (depth(a) + depth(b)) / 2;
    g.strokeStyle = accent; g.globalAlpha = 0.45 + d * 0.35; g.lineWidth = 3 + d * 5;
    g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke();
  }
  g.globalAlpha = 1; g.fillStyle = '#fff';
  for (let k = 11; k < 33; k++) { if ((lm[k].visibility ?? 1) < 0.4) continue; g.beginPath(); g.arc(...P(k), 2.5 + depth(k) * 2.5, 0, Math.PI * 2); g.fill(); }
  // head = a plain ring at the nose position (no facial features are drawn or analysed)
  const sh = Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y) * cv.width;
  g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.arc(...P(0), Math.max(12, sh * 0.35), 0, Math.PI * 2); g.stroke();
  g.font = 'bold 16px Orbitron, sans-serif'; g.fillStyle = accent; g.fillText(`#${i + 1}`, P(0)[0] + sh * 0.4, P(0)[1]);
  g.restore();
}
