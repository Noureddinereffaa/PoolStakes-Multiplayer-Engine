export function buildOffscreenTable(): HTMLCanvasElement {
  const offCanvas = document.createElement('canvas');
  offCanvas.width  = 800;
  offCanvas.height = 400;
  const ctx = offCanvas.getContext('2d')!;

  // ── Casino Wood Rails (Dark Mahogany) ─────────────────────────────────
  const topRailGrad = ctx.createLinearGradient(0, 0, 800, 22);
  topRailGrad.addColorStop(0,    '#0d0502');
  topRailGrad.addColorStop(0.12, '#1a0804');
  topRailGrad.addColorStop(0.35, '#3d1a0c');
  topRailGrad.addColorStop(0.5,  '#5c2812');
  topRailGrad.addColorStop(0.65, '#3d1a0c');
  topRailGrad.addColorStop(0.88, '#1a0804');
  topRailGrad.addColorStop(1,    '#0d0502');
  ctx.fillStyle = topRailGrad;
  ctx.fillRect(0, 0, 800, 22);
  ctx.fillRect(0, 378, 800, 22);

  const sideRailGrad = ctx.createLinearGradient(0, 0, 22, 400);
  sideRailGrad.addColorStop(0,   '#0d0502');
  sideRailGrad.addColorStop(0.12, '#1a0804');
  sideRailGrad.addColorStop(0.5, '#3d1a0c');
  sideRailGrad.addColorStop(0.88, '#1a0804');
  sideRailGrad.addColorStop(1,   '#0d0502');
  ctx.fillStyle = sideRailGrad;
  ctx.fillRect(0,   22, 22, 356);
  ctx.fillRect(778, 22, 22, 356);

  // Mahogany wood grain on rails
  ctx.strokeStyle = 'rgba(100, 40, 15, 0.22)';
  ctx.lineWidth   = 1.0;
  for (let pass = 0; pass < 2; pass++) {
    const offset = pass * 2;
    for (let i = 3; i < 20; i += 5) {
      ctx.beginPath();
      for (let x = 22; x <= 778; x += 8) {
        const wave = Math.sin(x * 0.025 + i * 1.7 + offset) * 2.4 + Math.sin(x * 0.05 + i * 0.7) * 1.2;
        x === 22 ? ctx.moveTo(x, i + wave) : ctx.lineTo(x, i + wave);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let x = 22; x <= 778; x += 8) {
        const wave = Math.sin(x * 0.025 + i * 1.7 + offset) * 2.4 + Math.sin(x * 0.05 + i * 0.7) * 1.2;
        x === 22 ? ctx.moveTo(x, 378 + i + wave) : ctx.lineTo(x, 378 + i + wave);
      }
      ctx.stroke();
    }
    for (let i = 3; i < 20; i += 5) {
      ctx.beginPath();
      for (let y = 22; y <= 378; y += 8) {
        const wave = Math.sin(y * 0.025 + i * 1.7 + offset) * 2.4 + Math.sin(y * 0.05 + i * 0.7) * 1.2;
        y === 22 ? ctx.moveTo(i + wave, y) : ctx.lineTo(i + wave, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let y = 22; y <= 378; y += 8) {
        const wave = Math.sin(y * 0.025 + i * 1.7 + offset) * 2.4 + Math.sin(y * 0.05 + i * 0.7) * 1.2;
        y === 22 ? ctx.moveTo(778 + i + wave, y) : ctx.lineTo(778 + i + wave, y);
      }
      ctx.stroke();
    }
  }

  // ── Gold Outer Frame ──────────────────────────────────────────────────
  // Outer gold border
  ctx.strokeStyle = '#c2780e';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 760, 360);

  // Inner gold border
  ctx.strokeStyle = '#d4942a';
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, 756, 356);

  // Gold glow border
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.12)';
  ctx.lineWidth = 3;
  ctx.strokeRect(19, 19, 762, 362);

  // ── Casino Baize Felt ─────────────────────────────────────────────────
  const felt = ctx.createRadialGradient(400, 200, 40, 400, 200, 520);
  felt.addColorStop(0,    '#0e7a4a');
  felt.addColorStop(0.15, '#0c6a3f');
  felt.addColorStop(0.4,  '#095534');
  felt.addColorStop(0.7,  '#06422a');
  felt.addColorStop(0.9,  '#04321f');
  felt.addColorStop(1,    '#022515');
  ctx.fillStyle = felt;
  ctx.fillRect(22, 22, 756, 356);

  // Felt crosshatch texture
  ctx.strokeStyle = 'rgba(255,255,255,0.015)';
  ctx.lineWidth = 0.4;
  for (let i = 24; i < 376; i += 4) {
    ctx.beginPath();
    ctx.moveTo(24, i);
    ctx.lineTo(776, i);
    ctx.stroke();
  }
  for (let i = 24; i < 776; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 24);
    ctx.lineTo(i, 376);
    ctx.stroke();
  }

  // Felt wear spots (lighter areas where balls travel)
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < 45; i++) {
    const rx = 30 + (i * 37 + 11) % 740;
    const ry = 30 + (i * 29 + 7) % 340;
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Felt usage patches (ellipses)
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  ctx.beginPath();
  ctx.ellipse(260, 200, 120, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(540, 200, 120, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(400, 200, 60, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spotlight effect from above (bright center)
  const spotlight = ctx.createRadialGradient(400, 150, 50, 400, 200, 400);
  spotlight.addColorStop(0, 'rgba(255,255,240,0.06)');
  spotlight.addColorStop(0.5, 'rgba(255,255,240,0.03)');
  spotlight.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spotlight;
  ctx.fillRect(22, 22, 756, 356);

  // Cushion shadow inner
  const cShadows: [number, number, number, number, number, number, number, number][] = [
    [22, 22, 756, 12,   22,22, 22,34],
    [22, 366, 756, 12,  22,378, 22,366],
    [22, 22, 12, 356,   22,22, 34,22],
    [766, 22, 12, 356,  778,22, 766,22],
  ];
  cShadows.forEach(([x,y,w,h, x1,y1,x2,y2]) => {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  });

  // ── Cushion Bevels ─────────────────────────────────────────────────────
  const cushionGrads: [number,number,number,number, [number,number][], string[]][] = [
    [22,22, 756,12, [[32,22],[768,22],[752,34],[48,34]], ['#063822','#0a5c36','#0e7a4a']],
    [22,366, 756,12, [[32,378],[768,378],[752,366],[48,366]], ['#031f12','#063822','#0a5c36']],
    [22,22, 12,356, [[22,32],[22,368],[34,352],[34,48]], ['#031f12','#063822','#0a5c36']],
    [766,22, 12,356, [[778,32],[778,368],[766,352],[766,48]], ['#031f12','#063822','#0a5c36']],
  ];
  cushionGrads.forEach(([_x,_y,_w,_h, pts, colors]) => {
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.4, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  });

  // ── Gold Diamond Markers ──────────────────────────────────────────────
  const goldDiamond = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 5);
  goldDiamond.addColorStop(0, '#fef08a');
  goldDiamond.addColorStop(0.3, '#fbbf24');
  goldDiamond.addColorStop(0.7, '#d97706');
  goldDiamond.addColorStop(1, '#78350f');

  // Center markers (long)
  ctx.strokeStyle = 'rgba(250,204,21,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(400, 17); ctx.lineTo(400, 24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(400, 376); ctx.lineTo(400, 383); ctx.stroke();

  const dSpX = 800 / 8;
  for (let i = 1; i <= 7; i++) {
    if (i === 4) continue;
    [[i * dSpX, 10], [i * dSpX, 390]].forEach(([tx, ty]) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.beginPath();
      ctx.moveTo(0,-5); ctx.lineTo(3.5,0); ctx.lineTo(0,5); ctx.lineTo(-3.5,0);
      ctx.closePath();
      ctx.fillStyle = goldDiamond; ctx.fill();
      ctx.strokeStyle = 'rgba(120,55,15,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      // Glow
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(251,191,36,0.3)';
      ctx.beginPath();
      ctx.moveTo(0,-5); ctx.lineTo(3.5,0); ctx.lineTo(0,5); ctx.lineTo(-3.5,0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }
  const dSpY = 400 / 4;
  for (let j = 1; j <= 3; j++) {
    [[10, j * dSpY], [790, j * dSpY]].forEach(([tx, ty]) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.beginPath();
      ctx.moveTo(-5,0); ctx.lineTo(0,-3.5); ctx.lineTo(5,0); ctx.lineTo(0,3.5);
      ctx.closePath();
      ctx.fillStyle = goldDiamond; ctx.fill();
      ctx.strokeStyle = 'rgba(120,55,15,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(251,191,36,0.3)';
      ctx.beginPath();
      ctx.moveTo(-5,0); ctx.lineTo(0,-3.5); ctx.lineTo(5,0); ctx.lineTo(0,3.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }

  // ── Leather Pockets ────────────────────────────────────────────────────
  const pockets: { x: number; y: number; ang: number }[] = [
    { x: 24,  y: 24,  ang: Math.PI * 0.25  },
    { x: 400, y: 18,  ang: Math.PI * 0.5   },
    { x: 776, y: 24,  ang: Math.PI * 0.75  },
    { x: 24,  y: 376, ang: -Math.PI * 0.25 },
    { x: 400, y: 382, ang: -Math.PI * 0.5  },
    { x: 776, y: 376, ang: -Math.PI * 0.75 },
  ];

  pockets.forEach((p) => {
    // Outer shadow ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, 29, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fill();

    // Leather rim (dark brown ring)
    const leatherGrad = ctx.createRadialGradient(p.x, p.y, 16, p.x, p.y, 26);
    leatherGrad.addColorStop(0, '#1a0a04');
    leatherGrad.addColorStop(0.3, '#2d1208');
    leatherGrad.addColorStop(0.6, '#4a1e0d');
    leatherGrad.addColorStop(0.8, '#6b2d15');
    leatherGrad.addColorStop(0.95, '#3d1a0c');
    leatherGrad.addColorStop(1, '#1a0a04');
    ctx.beginPath();
    ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
    ctx.fillStyle = leatherGrad;
    ctx.fill();

    // Leather texture dots
    ctx.fillStyle = 'rgba(80,30,10,0.2)';
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 7;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gold rim ring
    ctx.strokeStyle = 'rgba(217,119,6,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 25, 0, Math.PI * 2);
    ctx.stroke();

    // Gold inner ring
    ctx.strokeStyle = 'rgba(251,191,36,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 23, 0, Math.PI * 2);
    ctx.stroke();

    // Ornamental screws (gold dots around rim)
    ctx.fillStyle = 'rgba(217,119,6,0.85)';
    [0, Math.PI*0.5, Math.PI, Math.PI*1.5].forEach(sa => {
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(sa)*22, p.y + Math.sin(sa)*22, 1.5, 0, Math.PI*2);
      ctx.fill();
      // Highlight on screw
      ctx.fillStyle = 'rgba(255,255,200,0.5)';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(sa)*22 - 0.4, p.y + Math.sin(sa)*22 - 0.4, 0.5, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(217,119,6,0.85)';
    });

    // Dark void (hole)
    const voidGrad = ctx.createRadialGradient(p.x-2, p.y-2, 2, p.x, p.y, 18);
    voidGrad.addColorStop(0, '#000000');
    voidGrad.addColorStop(0.5, '#050302');
    voidGrad.addColorStop(0.8, '#0a0705');
    voidGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = voidGrad;
    ctx.fill();

    // Pocket mouth shadow (deep cut)
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18.5, p.ang - 0.8, p.ang + 0.8);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#030202';
    ctx.stroke();
  });

  // ── Gold Corner Brass Plates ────────────────────────────────────────────
  [
    { x:0,   y:0,   r:0           },
    { x:800, y:0,   r:Math.PI*0.5 },
    { x:0,   y:400, r:-Math.PI*0.5},
    { x:800, y:400, r:Math.PI     },
  ].forEach(({ x, y, r }) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    // Brass plate
    const bg = ctx.createLinearGradient(0,0,28,28);
    bg.addColorStop(0,   '#78350f');
    bg.addColorStop(0.2, '#a16207');
    bg.addColorStop(0.5, '#fbbf24');
    bg.addColorStop(0.8, '#d97706');
    bg.addColorStop(1,   '#78350f');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(30,0);
    ctx.bezierCurveTo(28,18, 18,28, 0,30);
    ctx.closePath();
    ctx.fill();
    // Gold shine
    ctx.fillStyle = 'rgba(255,255,200,0.2)';
    ctx.beginPath();
    ctx.moveTo(2,2);
    ctx.lineTo(15,2);
    ctx.bezierCurveTo(14,10, 10,14, 2,15);
    ctx.closePath();
    ctx.fill();
    // Border
    ctx.strokeStyle = 'rgba(255,255,200,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(30,0);
    ctx.bezierCurveTo(28,18, 18,28, 0,30);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });

  // ── Head String ────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(200, 22);
  ctx.lineTo(200, 378);
  ctx.stroke();

  // Head string arc
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(200, 200, 48, Math.PI * 0.5, Math.PI * 1.5, false);
  ctx.stroke();

  // Gold foot spot
  const footSpotGrad = ctx.createRadialGradient(553, 200, 0.5, 553, 200, 5);
  footSpotGrad.addColorStop(0, '#fef08a');
  footSpotGrad.addColorStop(0.5, '#d97706');
  footSpotGrad.addColorStop(1, 'rgba(217,119,6,0)');
  ctx.beginPath();
  ctx.arc(553, 200, 4, 0, Math.PI * 2);
  ctx.fillStyle = footSpotGrad;
  ctx.fill();
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(251,191,36,0.15)';
  ctx.beginPath();
  ctx.arc(553, 200, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Head spot
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(200, 200, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(200, 200, 1.2, 0, Math.PI * 2);
  ctx.fill();

  return offCanvas;
}
