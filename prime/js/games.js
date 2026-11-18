// Mini-game maker: the Doodle Fighters editor + Shirbuton (pure-code builder, no AI, offline),
// loaded only when asked for.
const $ = (s) => document.querySelector(s);
export function openGame(cmd = '') {
  const wrap = $('#game'); const fr = $('#game-frame');
  wrap.hidden = false;
  const go = () => {
    const w = fr.contentWindow;
    try { w.openMaker(true); w.openBot(); if (cmd) setTimeout(() => w.botAsk(cmd), 300); } catch (e) { console.warn('game hook', e); }
  };
  if (fr.dataset.ready) go();
  else { fr.onload = () => { fr.dataset.ready = '1'; go(); }; fr.src = 'games/doodle.html'; }
}
export function closeGame() { $('#game').hidden = true; }
