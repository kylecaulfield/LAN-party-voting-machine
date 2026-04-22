'use strict';
const Wheel = (() => {
  const COLORS = [
    '#7c3aed','#2563eb','#0891b2','#059669',
    '#d97706','#dc2626','#9333ea','#0284c7',
    '#0d9488','#16a34a','#ca8a04','#b91c1c',
  ];

  function spin(games, winnerIdx, onComplete) {
    const overlay = document.createElement('div');
    overlay.className = 'wheel-overlay';

    const label = document.createElement('div');
    label.className = 'wheel-label';
    label.textContent = '🎡 Spinning…';

    const canvas = document.createElement('canvas');
    const size = Math.min(window.innerWidth * 0.85, window.innerHeight * 0.72, 560);
    canvas.width = canvas.height = size;

    overlay.appendChild(label);
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const r = size / 2 - 16;
    const n = games.length;
    const sliceAngle = (2 * Math.PI) / n;

    // Final base angle so winner's center lands at -π/2 (top pointer)
    const winnerCenter = winnerIdx * sliceAngle + sliceAngle / 2;
    const finalAngle = ((-Math.PI / 2 - winnerCenter) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const totalRotation = 6 * 2 * Math.PI + finalAngle;

    const duration = 4500;
    let startTime = null;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(fallbackTimer);
      label.textContent = '\uD83C\uDFC6 Winner!';
      setTimeout(() => {
        overlay.classList.remove('show');
        setTimeout(() => { overlay.remove(); onComplete(); }, 300);
      }, 1200);
    }

    // Safety net: if rAF is throttled (background tab, locked screen), force completion
    const fallbackTimer = setTimeout(() => { draw(totalRotation); finish(); }, duration + 2000);

    function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

    function draw(baseAngle) {
      ctx.clearRect(0, 0, size, size);

      for (let i = 0; i < n; i++) {
        const sa = baseAngle + i * sliceAngle;
        const ea = sa + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, sa, ea);
        ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sa + sliceAngle / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        const fs = Math.max(10, Math.min(16, size / (n * 2.2)));
        ctx.font = `bold ${fs}px Segoe UI, system-ui, sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,.8)';
        ctx.shadowBlur = 4;
        const name = games[i].name.length > 13 ? games[i].name.slice(0, 12) + '\u2026' : games[i].name;
        ctx.fillText((games[i].emoji || '\uD83C\uDFAE') + ' ' + name, r - 14, fs * 0.38);
        ctx.restore();
      }

      // Hub circle
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
      ctx.fillStyle = '#0b0d14';
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Fixed pointer at top center
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 11, 4);
      ctx.lineTo(cx + 11, 4);
      ctx.lineTo(cx, 32);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.restore();
    }

    function animate(ts) {
      if (!startTime) startTime = ts;
      const t = Math.min(1, (ts - startTime) / duration);
      draw(easeOut(t) * totalRotation);
      if (t < 1) requestAnimationFrame(animate);
      else finish();
    }

    draw(0);
    requestAnimationFrame(animate);
  }

  return { spin };
})();
