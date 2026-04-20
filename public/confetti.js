// Canvas confetti — no dependencies
const Confetti = (() => {
  const COLORS = ['#7c3aed','#a855f7','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#fff'];
  let canvas, ctx, raf, particles = [], spawnTimer = null;

  function mkParticle() {
    const w = Math.random() * 11 + 5, h = Math.random() * 6 + 3;
    return {
      x:  Math.random() * (canvas?.width || window.innerWidth),
      y:  -h,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 2.5 + 1.5,
      rot: Math.random() * 360,
      rs:  (Math.random() - 0.5) * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w, h, alpha: 1,
      shape: Math.random() > 0.7 ? 'circle' : 'rect',
    };
  }

  function frame() {
    if (!canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.06;
      p.rot += p.rs;
      if (p.y > canvas.height * 0.65) p.alpha = Math.max(0, p.alpha - 0.018);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    particles = particles.filter(p => p.alpha > 0.01 && p.y < canvas.height + 20);
    if (particles.length > 0) raf = requestAnimationFrame(frame);
    else hide();
  }

  function hide() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (canvas) canvas.style.display = 'none';
  }

  function ensure() {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
      document.body.appendChild(canvas);
    }
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    ctx = canvas.getContext('2d');
  }

  return {
    start(total = 180, burstMs = 2200) {
      ensure();
      particles = [];
      if (spawnTimer) clearTimeout(spawnTimer);

      // spawn particles over burstMs
      let spawned = 0;
      const interval = burstMs / total;
      const spawn = () => {
        if (spawned++ < total) {
          particles.push(mkParticle());
          spawnTimer = setTimeout(spawn, interval);
        }
      };
      spawn();
      if (raf) cancelAnimationFrame(raf);
      frame();
    },
    stop: hide,
  };
})();
