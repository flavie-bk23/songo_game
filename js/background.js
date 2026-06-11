// background.js — Fond bois réaliste en canvas 2D (fallback si pas d'image Midjourney)
(function() {
  const cv = document.getElementById('bg-canvas');
  const ctx = cv.getContext('2d');

  function resize() {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    drawBackground();
  }

  function rng(a, b) { return a + Math.random() * (b - a); }

  function drawBackground() {
    const W = cv.width, H = cv.height;

    // Tente de charger l'image Midjourney
    const img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0, W, H);
      addVignette(W, H);
    };
    img.onerror = function() {
      // Fallback : bois peint à la main
      drawWoodFallback(W, H);
    };
    img.src = 'assets/board_bg.jpg';
  }

  function drawWoodFallback(W, H) {
    // Sol en bois / terre
    const floorGrad = ctx.createLinearGradient(0, 0, 0, H);
    floorGrad.addColorStop(0,   '#3D2208');
    floorGrad.addColorStop(0.4, '#5C3418');
    floorGrad.addColorStop(1,   '#2A1506');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, W, H);

    // Grain du sol
    for (let i = 0; i < 120; i++) {
      const x = rng(0, W);
      const y = rng(0, H);
      const len = rng(60, 300);
      const alpha = rng(0.03, 0.09);
      ctx.strokeStyle = `rgba(${rng(180,220)|0},${rng(100,150)|0},${rng(20,60)|0},${alpha})`;
      ctx.lineWidth = rng(0.4, 1.4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + rng(-20, 20), y + len * 0.3,
        x + rng(-20, 20), y + len * 0.7,
        x + rng(-10, 10), y + len
      );
      ctx.stroke();
    }

    // Nœuds dans le bois
    for (let k = 0; k < 6; k++) {
      const nx = rng(50, W - 50), ny = rng(50, H - 50);
      const rx = rng(20, 50), ry = rng(12, 30);
      ctx.strokeStyle = `rgba(20,8,0,0.18)`;
      ctx.lineWidth = rng(0.5, 1.2);
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        ctx.ellipse(nx, ny, rx * ring * 0.28, ry * ring * 0.28, rng(-0.3, 0.3), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Lumière ambiante
    const ambientGrad = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.7);
    ambientGrad.addColorStop(0, 'rgba(255,200,100,0.10)');
    ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, W, H);

    addVignette(W, H);
  }

  function addVignette(W, H) {
    const vg = ctx.createRadialGradient(W/2, H/2, W*0.28, W/2, H/2, W*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  window.addEventListener('resize', resize);
  resize();
})();
