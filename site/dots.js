// The Stupid Company: a quiet field of clay dots that lights up around your mouse and follows it softly, the way the
// tabs in The Stupid Browser glide. Click and the dots ripple out once, like Buddy landing. Only with a real mouse,
// and not when you've asked your system for less motion.
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const GAP = 22, RADIUS = 170, DOT = 1.3;
  const c = document.createElement('canvas'); c.className = 'dots'; c.setAttribute('aria-hidden', 'true');
  document.body.prepend(c);
  const g = c.getContext('2d');
  let w = 0, h = 0, dpr = 1, color = '217,119,87';
  const size = () => {
    dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight;
    c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(css); if (m) color = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(',');
    kick();
  };
  // Where the glow is (it eases after the mouse), how bright it is (fades in and out), and any ripple from a click.
  const target = { x: -999, y: -999 }, at = { x: -999, y: -999 };
  let shown = 0, want = 0, ripple = null, raf = 0;
  function frame(t) {
    raf = 0;
    at.x += (target.x - at.x) * 0.18; at.y += (target.y - at.y) * 0.18;
    shown += (want - shown) * 0.12;
    g.clearRect(0, 0, w, h);
    const r = RADIUS * (0.85 + 0.15 * shown);
    const rip = ripple && (t - ripple.t) / 700;
    if (rip >= 1) ripple = null;
    const reach = ripple ? Math.max(r, rip * 420 + 20) : r;
    const cx = ripple ? ripple.x : at.x, cy = ripple ? ripple.y : at.y;
    const x0 = Math.max(0, Math.floor((Math.min(at.x, cx) - reach) / GAP)), x1 = Math.ceil((Math.max(at.x, cx) + reach) / GAP);
    const y0 = Math.max(0, Math.floor((Math.min(at.y, cy) - reach) / GAP)), y1 = Math.ceil((Math.max(at.y, cy) + reach) / GAP);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const x = i * GAP + GAP / 2, y = j * GAP + GAP / 2;
      const d = Math.hypot(x - at.x, y - at.y);
      let a = d < r ? (1 - d / r) ** 1.6 * shown : 0;
      if (ripple) { const ring = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - rip * 420); if (ring < 26) a = Math.max(a, (1 - ring / 26) * (1 - rip) * 0.9); }
      if (a < 0.02) continue;
      g.fillStyle = `rgba(${color},${(a * 0.55).toFixed(3)})`;
      g.beginPath(); g.arc(x, y, DOT + a * 1.4, 0, Math.PI * 2); g.fill();
    }
    const moving = Math.abs(target.x - at.x) > 0.3 || Math.abs(target.y - at.y) > 0.3 || Math.abs(want - shown) > 0.01 || ripple;
    if (moving) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (want === 0 && shown < 0.05) { at.x = e.clientX; at.y = e.clientY; }   // appear where the mouse is, not fly in
    target.x = e.clientX; target.y = e.clientY; want = 1; kick();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { want = 0; kick(); });
  addEventListener('blur', () => { want = 0; kick(); });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { ripple = { x: e.clientX, y: e.clientY, t: performance.now() }; kick(); } }, { passive: true });
  addEventListener('resize', size);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', size);
  size();
})();
