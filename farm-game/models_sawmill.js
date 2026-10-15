/* Лесопилка, хижина лесоруба и пруд — процедурные модели (three.js r128, без внешних файлов).
   Регистрируют: building:sawmill, building:loggerHut, prop:pond. Перед = +Z, начало = центр основания на земле, 1 единица = 1 м. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = (t) => t * t * (3 - 2 * t);
  function lcg(seed) { let s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash2(i, j) { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), xf), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), xf), yf); }
  /** периодический гладкий шум по углу, значения 0..1 */
  function pn(theta, freq, seed) { const n = Math.round(freq), u = (theta / TAU) * n, i = Math.floor(u), f = smooth(u - i); const m = (k) => ((k % n) + n) % n; return lerp(hash2(m(i), seed), hash2(m(i + 1), seed), f); }
  const rgb = (r, g, b, a) => a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  const shade = (c, f) => { const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f); return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b); };
  const mix = (a, b, t) => new T.Color(a).lerp(new T.Color(b), t).getHex();

  // ================================================================== текстуры
  const CV = {};
  function defTex(name, size, draw) { C.addProc(name, (cv, g) => { CV[name] = cv; draw(cv, g, size); }, size); }
  function wrapDraw(S, x, y, rad, fn) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx * S, Y = y + dy * S; if (X + rad < 0 || Y + rad < 0 || X - rad > S || Y - rad > S) continue; fn(X, Y); } }
  function blot(g, S, x, y, rad, col, a) { wrapDraw(S, x, y, rad, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, rgb(col[0], col[1], col[2], a)); gr.addColorStop(1, rgb(col[0], col[1], col[2], 0)); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); }); }
  const CORR_N = 16;
  /** профилированный лист: 16 волн на тайл, стыки листов в 0 и S/2, ржавые потёки от крепежа */
  function drawCorr(g, S, base, seed, o) {
    const r = lcg(seed), w = S / CORR_N;
    g.fillStyle = rgb(base[0], base[1], base[2]); g.fillRect(0, 0, S, S);
    for (let i = 0; i < o.blots; i++) blot(g, S, r() * S, r() * S, 30 + r() * 80, r() < 0.5 ? o.dark : o.light, 0.05 + r() * 0.12);
    for (let x = 0; x < S; x++) { const s = 0.5 + 0.5 * Math.cos(((x + 0.5) / w - 0.5) * TAU); g.fillStyle = rgb(0, 0, 0, (1 - s) * 0.26); g.fillRect(x, 0, 1, S); g.fillStyle = rgb(255, 255, 255, s * s * 0.10); g.fillRect(x, 0, 1, S); }
    for (let i = 0; i < o.streaks; i++) {
      const x = r() * S, y0 = r() * S, len = 30 + r() * 170, wd = 1 + r() * 3, a = 0.10 + r() * 0.26, rust = r() < o.rust, col = rust ? [152 + r() * 30, 72 + r() * 20, 32] : [28, 26, 22];
      for (const yy of [y0, y0 - S]) { const gr = g.createLinearGradient(0, yy, 0, yy + len); gr.addColorStop(0, rgb(col[0], col[1], col[2], a)); gr.addColorStop(1, rgb(col[0], col[1], col[2], 0)); g.fillStyle = gr; g.fillRect(x, yy, wd, len); }
    }
    for (let k = 0; k < 2; k++) { const y = k * S / 2; g.fillStyle = rgb(0, 0, 0, 0.42); g.fillRect(0, y, S, 3); g.fillStyle = rgb(255, 255, 255, 0.20); g.fillRect(0, y + 3, S, 2); g.fillStyle = rgb(0, 0, 0, 0.10); g.fillRect(0, y + 5, S, 7); }
    for (let k = 0; k < 2; k++) for (let c = 0; c < CORR_N; c++) {
      const x = (c + 0.5) * w, y = k * S / 2 + 14; g.fillStyle = rgb(35, 33, 30, 0.8); g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill();
      const gr = g.createLinearGradient(0, y, 0, y + 40 + r() * 40); gr.addColorStop(0, rgb(150, 70, 30, 0.35)); gr.addColorStop(1, rgb(150, 70, 30, 0)); g.fillStyle = gr; g.fillRect(x - 1, y, 2, 80);
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? rgb(0, 0, 0, r() * 0.07) : rgb(255, 255, 255, r() * 0.06); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 3); }
  }
  defTex('smw_roof', 512, (cv, g, S) => drawCorr(g, S, [176, 182, 184], 17, { blots: 30, dark: [90, 80, 70], light: [235, 238, 240], streaks: 90, rust: 0.55 }));
  defTex('smw_wall', 512, (cv, g, S) => drawCorr(g, S, [70, 104, 86], 29, { blots: 26, dark: [20, 40, 30], light: [140, 170, 150], streaks: 55, rust: 0.28 }));
  defTex('smw_corr_n', 512, (cv, g, S) => {
    const im = g.createImageData(S, S), w = S / CORR_N;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ph = ((x + 0.5) / w - 0.5) * TAU; let nx = Math.sin(ph) * 0.95, ny = 0;
      for (let k = 0; k < 2; k++) { const d = y - k * S / 2; if (d >= 0 && d < 4) ny = 0.55; else if (d >= 4 && d < 9) ny = -0.3; }
      const len = Math.sqrt(nx * nx + ny * ny + 1), i = (y * S + x) * 4;
      im.data[i] = (nx / len * 0.5 + 0.5) * 255; im.data[i + 1] = (ny / len * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
  // выветренные вертикальные доски
  defTex('smw_wood', 256, (cv, g, S) => {
    const r = lcg(91), n = 8, w = S / n;
    for (let i = 0; i < n; i++) {
      const L = 0.62 + r() * 0.30, gr = r() * 0.12; g.fillStyle = rgb(L * 182 - gr * 60, L * 152, L * 118 + gr * 60); g.fillRect(i * w, 0, w, S);
      for (let k = 0; k < 14; k++) { const x = i * w + 2 + r() * (w - 4), a = 0.06 + r() * 0.2, ph = r() * 6; g.strokeStyle = rgb(45, 32, 20, a); g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= S; y += 24) g.lineTo(x + Math.sin(y * 0.05 + ph) * 1.4, y); g.stroke(); }
      if (r() < 0.6) { const kx = i * w + w * (0.3 + r() * 0.4), ky = r() * S; g.fillStyle = rgb(48, 32, 20, 0.5); g.beginPath(); g.ellipse(kx, ky, 3.2, 7, 0, 0, TAU); g.fill(); g.strokeStyle = rgb(48, 32, 20, 0.3); g.beginPath(); g.ellipse(kx, ky, 5.5, 12, 0, 0, TAU); g.stroke(); }
      g.fillStyle = rgb(18, 10, 5, 0.85); g.fillRect(i * w + w - 2, 0, 2, S); g.fillStyle = rgb(255, 240, 215, 0.16); g.fillRect(i * w, 0, 1.5, S);
      for (const yy of [10, S - 10]) { g.fillStyle = rgb(30, 25, 22, 0.8); g.fillRect(i * w + w / 2 - 1, yy, 2, 2); }
    }
    for (let i = 0; i < 40; i++) blot(g, S, r() * S, r() * S, 16 + r() * 36, r() < 0.5 ? [40, 30, 20] : [200, 195, 180], 0.05 + r() * 0.08);
    for (let i = 0; i < 700; i++) { g.fillStyle = rgb(30, 20, 10, r() * 0.07); g.fillRect(r() * S, r() * S, 1, 3 + r() * 9); }
  });
  // штабель сырых досок с прокладками (горизонтальные слои)
  defTex('smw_lumber', 256, (cv, g, S) => {
    const r = lcg(53), n = 8, h = S / n;
    for (let i = 0; i < n; i++) {
      const L = 0.80 + r() * 0.20; g.fillStyle = rgb(L * 226, L * 190, L * 128); g.fillRect(0, i * h, S, h);
      for (let k = 0; k < 7; k++) { const y = i * h + 3 + r() * (h - 12), a = 0.08 + r() * 0.18; g.strokeStyle = rgb(120, 82, 40, a); g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.04 + k) * 0.8); g.stroke(); }
      g.fillStyle = rgb(35, 24, 12, 0.88); g.fillRect(0, i * h + h - 8, S, 8); g.fillStyle = rgb(255, 235, 190, 0.28); g.fillRect(0, i * h, S, 2);
      for (let k = 0; k < 4; k++) { g.fillStyle = rgb(255, 215, 150, 0.35); g.fillRect(k * 64 + 6, i * h + h - 8, 14, 4); }
      if (r() < 0.3) { g.fillStyle = rgb(70, 45, 22, 0.35); g.fillRect(r() * S, i * h + 3, 5 + r() * 10, h - 12); }
    }
  });
  defTex('smw_conc', 256, (cv, g, S) => {
    const r = lcg(127); g.fillStyle = rgb(176, 174, 166); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 36; i++) blot(g, S, r() * S, r() * S, 20 + r() * 60, r() < 0.6 ? [96, 94, 88] : [226, 224, 216], 0.06 + r() * 0.10);
    for (let i = 0; i < 4; i++) blot(g, S, r() * S, r() * S, 12 + r() * 20, [30, 28, 26], 0.18 + r() * 0.2); // масляные пятна
    for (let i = 0; i < 2200; i++) { g.fillStyle = r() < 0.5 ? rgb(80, 78, 72, r() * 0.14) : rgb(255, 255, 250, r() * 0.14); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
    for (let k = 0; k < 3; k++) { g.strokeStyle = rgb(60, 58, 54, 0.45); g.lineWidth = 1; g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let j = 0; j < 7; j++) { x += (r() - 0.5) * 22; y += 8 + r() * 14; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = rgb(60, 58, 54, 0.5); g.lineWidth = 1.5; g.strokeRect(0.5, 0.5, S - 1, S - 1);
  });
  // кора + торец бревна (атлас 2:1; слева кора, справа торец)
  defTex('smw_log', 256, (cv, g) => {
    cv.width = 512; cv.height = 256; const r = lcg(71), S = 256;
    g.fillStyle = rgb(176, 150, 122); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { const x0 = r() * S, a = 0.12 + r() * 0.3, dark = r() < 0.7; g.strokeStyle = dark ? rgb(60, 44, 30, a) : rgb(224, 196, 160, a * 0.8); g.lineWidth = 1 + r() * 3; for (const sx of [-S, 0, S]) { g.beginPath(); let x = x0 + sx; g.moveTo(x, 0); for (let y = 0; y <= S; y += 16) { x += (r() - 0.5) * 3.5; g.lineTo(x, y); } g.stroke(); } }
    for (let i = 0; i < 26; i++) blot(g, S, r() * S, r() * S, 12 + r() * 30, r() < 0.6 ? [70, 52, 38] : [210, 186, 150], 0.1 + r() * 0.12);
    for (let i = 0; i < 20; i++) { const x = r() * S, y = r() * S; g.fillStyle = rgb(50, 36, 24, 0.55); g.beginPath(); g.ellipse(x, y, 2 + r() * 3, 5 + r() * 7, 0, 0, TAU); g.fill(); }
    for (let i = 0; i < 10; i++) blot(g, S, r() * S, r() * S, 6 + r() * 12, [120, 140, 100], 0.18); // лишайник
    g.fillStyle = rgb(118, 96, 74); g.fillRect(S, 0, S, S); const cx = 384, cy = 128;
    g.fillStyle = rgb(70, 52, 36); g.beginPath(); g.arc(cx, cy, 124, 0, TAU); g.fill();
    g.fillStyle = rgb(232, 206, 150); g.beginPath(); g.arc(cx, cy, 118, 0, TAU); g.fill();
    g.fillStyle = rgb(206, 160, 104); g.beginPath(); g.arc(cx, cy, 72, 0, TAU); g.fill();
    for (let k = 1; k <= 24; k++) { const rad = k * 4.9; g.strokeStyle = rgb(120, 82, 44, 0.28 + r() * 0.2); g.lineWidth = 0.8 + r() * 0.8; g.beginPath(); for (let a = 0; a <= TAU + 0.1; a += 0.2) { const rr = rad * (1 + 0.025 * Math.sin(a * 3 + k)); g.lineTo(cx + Math.cos(a) * rr + 1.2 * Math.sin(k), cy + Math.sin(a) * rr); } g.stroke(); }
    for (let k = 0; k < 5; k++) { const a = r() * TAU, l = 40 + r() * 60; g.strokeStyle = rgb(60, 38, 20, 0.7); g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); }
    g.fillStyle = rgb(100, 60, 30); g.beginPath(); g.arc(cx, cy, 4, 0, TAU); g.fill();
  });
  defTex('smw_shingle', 256, (cv, g, S) => {
    const r = lcg(33), rows = 7, rh = S / rows;
    g.fillStyle = rgb(60, 48, 38); g.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) {
      let x = -r() * 30; const y = row * rh;
      while (x < S) {
        const w = 22 + r() * 22, L = 0.62 + r() * 0.38, wa = r() * 0.1; g.fillStyle = rgb(L * 150 + wa * 40, L * 122, L * 96 - wa * 20); g.fillRect(x + 1, y, w - 2, rh + 3);
        for (let k = 0; k < 4; k++) { g.strokeStyle = rgb(50, 36, 24, 0.2 + r() * 0.2); g.lineWidth = 1; const gx = x + 3 + r() * (w - 6); g.beginPath(); g.moveTo(gx, y); g.lineTo(gx + (r() - 0.5) * 2, y + rh); g.stroke(); }
        g.fillStyle = rgb(0, 0, 0, 0.28); g.fillRect(x + 1, y + rh - 2, w - 2, 3); g.fillStyle = rgb(0, 0, 0, 0.5); g.fillRect(x + w - 2, y, 2, rh);
        if (r() < 0.07) { g.fillStyle = rgb(90, 112, 62, 0.45); g.fillRect(x + 1, y, w - 2, rh * 0.6); }
        x += w;
      }
      const gr = g.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, rgb(0, 0, 0, 0.42)); gr.addColorStop(0.5, rgb(0, 0, 0, 0)); g.fillStyle = gr; g.fillRect(0, y, S, rh);
    }
    for (let i = 0; i < 24; i++) blot(g, S, r() * S, r() * S, 14 + r() * 30, r() < 0.5 ? [30, 24, 18] : [190, 175, 150], 0.08 + r() * 0.1);
  });
  defTex('smw_stone', 256, (cv, g, S) => {
    const r = lcg(83); g.fillStyle = rgb(70, 66, 60); g.fillRect(0, 0, S, S);
    const rows = [0, 52, 100, 150, 200, 256];
    for (let ri = 0; ri < rows.length - 1; ri++) {
      const y0 = rows[ri], y1 = rows[ri + 1]; let x = -r() * 40;
      while (x < S) {
        const w = 36 + r() * 52, L = 0.62 + r() * 0.38, tint = r(); g.fillStyle = rgb(L * (150 + tint * 40), L * (146 + tint * 10), L * (134 - tint * 20));
        const rad = 8; const xa = x + 2, ya = y0 + 2, wa = w - 4, ha = y1 - y0 - 4; g.beginPath(); g.moveTo(xa + rad, ya); g.lineTo(xa + wa - rad, ya); g.quadraticCurveTo(xa + wa, ya, xa + wa, ya + rad); g.lineTo(xa + wa, ya + ha - rad); g.quadraticCurveTo(xa + wa, ya + ha, xa + wa - rad, ya + ha); g.lineTo(xa + rad, ya + ha); g.quadraticCurveTo(xa, ya + ha, xa, ya + ha - rad); g.lineTo(xa, ya + rad); g.quadraticCurveTo(xa, ya, xa + rad, ya); g.fill();
        g.fillStyle = rgb(255, 255, 255, 0.12); g.fillRect(xa + 4, ya + 2, wa - 8, 3); g.fillStyle = rgb(0, 0, 0, 0.16); g.fillRect(xa + 4, ya + ha - 5, wa - 8, 4);
        x += w;
      }
    }
    for (let i = 0; i < 30; i++) blot(g, S, r() * S, r() * S, 10 + r() * 28, r() < 0.5 ? [30, 28, 24] : [170, 190, 120], 0.08 + r() * 0.1);
    for (let i = 0; i < 1400; i++) { g.fillStyle = rgb(30, 28, 24, r() * 0.12); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  });

  // мелкая рябь воды (карта нормалей, бесшовная)
  defTex('smw_ripple', 256, (cv, g, S) => {
    const r = lcg(909), W = [], N = 14;
    for (let i = 0; i < N; i++) W.push({ kx: Math.round((r() - 0.5) * 10), ky: Math.round((r() - 0.5) * 10), ph: r() * TAU, a: 0.4 + r() });
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0;
      for (const w of W) { if (!w.kx && !w.ky) continue; const c = Math.cos(((w.kx * x + w.ky * y) / S) * TAU + w.ph) * w.a * TAU / S; dx += c * w.kx; dy += c * w.ky; }
      dx *= 2.2; dy *= 2.2; const len = Math.sqrt(dx * dx + dy * dy + 1), i = (y * S + x) * 4;
      im.data[i] = (-dx / len * 0.5 + 0.5) * 255; im.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });

  // ================================================================== материалы
  function CVT(name) { const t = new T.CanvasTexture(CV[name]); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t; }
  const corrN = CVT('smw_corr_n');
  function corrMat(tex, o) { const m = new T.MeshStandardMaterial(Object.assign({ map: CVT(tex), normalMap: corrN, normalScale: new T.Vector2(1, 1), metalness: 0.5, roughness: 0.5, envMapIntensity: 0.8 }, o || {})); m.userData.tile = [3.2, 3.2]; return m; }
  function tm(name, tile, tint, extra) { const m = C.texMat(name, 1, 1, tint == null ? 0xffffff : tint, 0, 0, 0, extra); m.userData.tile = tile; return m; }
  const roofM = corrMat('smw_roof'), wallM = corrMat('smw_wall');
  const woodM = tm('smw_wood', [2.4, 2.4]), lumberM = tm('smw_lumber', [0.8, 0.8]), concM = tm('smw_conc', [3, 3]);
  const logM = tm('smw_log', null), shingleM = tm('smw_shingle', [0.9, 0.9]), stoneM = tm('smw_stone', [1.6, 1.6]);
  const steelM = C.pmat(0x3d4851, { metalness: 0.6, roughness: 0.5, envMapIntensity: 0.6 });
  const galvM = C.metal(0xb7bec3, { roughness: 0.42 });
  const orangeM = C.paint(0xd0701c);
  const rubber = C.rubberM();
  const V = (c) => C.mat(c);

  // ================================================================== помощники сборки
  const unitBox = new T.BoxGeometry(1, 1, 1), cylCache = {}, sphCache = {};
  const cylG = (seg) => cylCache[seg] || (cylCache[seg] = new T.CylinderGeometry(0.5, 0.5, 1, seg));
  function add(g, geo, m, x, y, z, rx, ry, rz, sx, sy, sz) { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); if (sx != null) o.scale.set(sx, sy, sz); o.castShadow = o.receiveShadow = true; g.add(o); return o; }
  function boxUV(w, h, d, tile, off) {
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, dm = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], ou = (off || 0) % 1, ov = ((off || 0) * 0.37) % 1;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dm[f][0] / tile[0] + ou, uv.getY(i) * dm[f][1] / tile[1] + ov); }
    return g;
  }
  /** параллелепипед w×h×d (x,y,z), центр (x,y,z); у текстурных материалов UV в метрах */
  function bx(g, m, x, y, z, w, h, d, rx, ry, rz) { const t = m.userData && m.userData.tile; return t ? add(g, boxUV(w, h, d, t, x * 7.31 + z * 3.17 + y * 1.3), m, x, y, z, rx, ry, rz) : add(g, unitBox, m, x, y, z, rx, ry, rz, w, h, d); }
  function cy(g, m, x, y, z, r, h, seg, rx, ry, rz) { return add(g, cylG(seg || 14), m, x, y, z, rx, ry, rz, r * 2, h, r * 2); }
  function cone(g, m, x, y, z, rb, rt, h, seg, rx, ry, rz) { return add(g, new T.CylinderGeometry(rt, rb, h, seg || 16), m, x, y, z, rx, ry, rz); }
  function ball(g, m, x, y, z, r, sx, sy, sz) { const k = 'b'; const geo = sphCache[k] || (sphCache[k] = new T.SphereGeometry(1, 8, 5)); return add(g, geo, m, x, y, z, 0, 0, 0, r * (sx || 1), r * (sy || 1), r * (sz || 1)); }
  const _v = new T.Vector3(), _z = new T.Vector3(0, 0, 1), _y = new T.Vector3(0, 1, 0);
  /** брус между точками a и b, сечение t1 (по x) × t2 (по y) */
  function bm(g, m, a, b, t1, t2) { _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _v.length(); const o = bx(g, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, t1, t2, len); o.rotation.set(0, 0, 0); o.quaternion.setFromUnitVectors(_z, _v.clone().normalize()); return o; }
  /** круглый стержень/труба между точками */
  function rod(g, m, a, b, r, seg) { _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _v.length(); const o = cy(g, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r, len, seg || 10); o.quaternion.setFromUnitVectors(_y, _v.clone().normalize()); return o; }
  /** плита с заданной осью ската (вниз по скату) и шириной; верхняя грань проходит через центр+нормаль*h/2 */
  function slab(g, m, c, down, wdir, w, h, d) {
    const Z = new T.Vector3(down[0], down[1], down[2]).normalize(), X = new T.Vector3(wdir[0], wdir[1], wdir[2]).normalize();
    let Y = new T.Vector3().crossVectors(Z, X).normalize(); if (Y.y < 0) { Y.negate(); X.negate(); }
    const Zc = new T.Vector3().crossVectors(X, Y).normalize();
    const o = bx(g, m, c[0], c[1], c[2], w, h, d); o.rotation.set(0, 0, 0); o.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Zc)); return o;
  }
  /** многоугольник (в плоскости XY) с отверстиями, выдавленный на depth; UV в метрах/тайл */
  function polyG(pts, holes, depth, tile) {
    const sh = new T.Shape(pts.map((p) => new T.Vector2(p[0], p[1])));
    (holes || []).forEach((h) => sh.holes.push(new T.Path(h.map((p) => new T.Vector2(p[0], p[1])))));
    const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 }), uv = g.attributes.uv;
    if (tile) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile[0], uv.getY(i) / tile[1]);
    return g;
  }
  /** журнал: геометрия бревна вдоль оси Y (r0 снизу, r1 сверху), торцы с годовыми кольцами из атласа */
  function logGeo(r0, r1, len, seg, rings, rnd, wob) {
    seg = seg || 10; rings = rings || 2; wob = wob == null ? 0.04 : wob;
    const pos = [], nor = [], uv = [], idx = [], slope = (r0 - r1) / len, bend = (rnd ? (rnd() - 0.5) * 0.06 * len / 3 : 0);
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, y = -len / 2 + t * len, rad = lerp(r0, r1, t) * (1 + (rnd ? (rnd() - 0.5) * wob : 0)), off = Math.sin(t * PI) * bend;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, k = (rnd && i < seg) ? 1 + (rnd() - 0.5) * wob : 1, cs = Math.cos(a), sn = Math.sin(a);
        pos.push(cs * rad * k + off, y, sn * rad * k); const nl = Math.sqrt(1 + slope * slope); nor.push(cs / nl, slope / nl, sn / nl); uv.push((i / seg) * 0.5, t);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    for (const top of [false, true]) {
      const y = top ? len / 2 : -len / 2, rad = top ? r1 : r0, base = pos.length / 3; pos.push(0, y, 0); nor.push(0, top ? 1 : -1, 0); uv.push(0.75, 0.5);
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU, cs = Math.cos(a), sn = Math.sin(a); pos.push(cs * rad, y, sn * rad); nor.push(0, top ? 1 : -1, 0); uv.push(0.75 + 0.234 * cs, 0.5 + 0.469 * sn); }
      for (let i = 0; i < seg; i++) top ? idx.push(base, base + 2 + i, base + 1 + i) : idx.push(base, base + 1 + i, base + 2 + i);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  }
  /** бревно: axis 'x'|'y'|'z', центр (x,y,z) */
  function logAt(g, m, x, y, z, r0, r1, len, axis, rnd, seg, rings) {
    const geo = logGeo(r0, r1, len, seg || 12, rings || 2, rnd), o = add(g, geo, m, x, y, z);
    if (axis === 'x') o.rotation.z = -PI / 2; else if (axis === 'z') o.rotation.x = PI / 2; return o;
  }
  /** слить всё из группы в один прозрачный/особый материал */
  function mergeInto(group, material, shadow) {
    group.updateMatrixWorld(true);
    const pos = [], nor = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    group.traverse((o) => {
      if (!o.isMesh) return; let gg = o.geometry; if (gg.index) gg = gg.toNonIndexed();
      const pa = gg.attributes.position, na = gg.attributes.normal; nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); }
    });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const m = new T.Mesh(geo, material); m.castShadow = !!shadow; m.receiveShadow = false; return m;
  }
  function finish(main, seed, extras) {
    const out = new T.Group(), old = Math.random; Math.random = lcg(seed || 7);
    try { out.add(C.bakeTex(main)); } finally { Math.random = old; }
    (extras || []).forEach((e) => e && out.add(e));
    return out;
  }
  /** сдвиг содержимого, чтобы начало координат было в центре габарита */
  function centred(out, dx, dz) { const w = new T.Group(); out.position.set(dx, 0, dz); w.add(out); return w; }
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => { const key = kind + ':' + name; if (!_cache[key]) _cache[key] = fn(opts || {}); return _cache[key].clone(true); });
  }
  const lampM = C.lightM(0xfff1c8), blobG = new T.SphereGeometry(1, 8, 4);

  // ================================================================== ЛЕСОПИЛКА
  function buildSawmill() {
    const g = new T.Group(), gl = new T.Group(), R = lcg(4242);
    const EH = 6.0, FL = 0.2, SX0 = -6.0, SX1 = 6.9, SZ0 = -6.4, SZ1 = 2.6, ZR = (SZ0 + SZ1) / 2, ANG = 12 * PI / 180, TAN = Math.tan(ANG), HALF = SZ1 - ZR;
    const XS = [-5.85, -2.7, 0.45, 3.6, 6.75], XM = (SX0 + SX1) / 2;
    const roofY = (dz) => EH + 0.3 + (HALF - Math.abs(dz)) * TAN; // верх кровли на расстоянии dz от конька
    const timber = V(0x7a5a3a), timberD = V(0x5a4128), yellow = V(0xe0b020), tankRed = V(0x8e2f24), black = V(0x222426);

    // --- бетонная плита, цоколь
    bx(g, concM, XM + 0.1, FL / 2, -1.8, 13.4, FL, 9.8);
    bx(g, concM, XM, 0.5, SZ0 - 0.04, 13.2, 0.8, 0.3);                    // цоколь сзади
    bx(g, concM, SX0 - 0.04, 0.5, (SZ0 + SZ1) / 2, 0.3, 0.8, SZ1 - SZ0);   // и по торцам
    bx(g, concM, SX1 + 0.04, 0.5, (SZ0 + SZ1) / 2, 0.3, 0.8, SZ1 - SZ0);
    // --- каркас: колонны и фермы
    for (const x of XS) for (const z of [SZ1 - 0.12, SZ0 + 0.12]) {
      bx(g, steelM, x, (FL + EH) / 2, z, 0.22, EH - FL, 0.22); bx(g, steelM, x, FL + 0.02, z, 0.46, 0.04, 0.46);
      bx(g, steelM, x, EH - 0.02, z, 0.36, 0.06, 0.36);
    }
    for (const x of XS) {
      const yc = EH - 0.5, topY = (dz) => roofY(dz) - 0.24 - 0.1;
      bm(g, steelM, [x, yc, SZ0 + 0.12], [x, yc, SZ1 - 0.12], 0.14, 0.16);                                  // нижний пояс
      bm(g, steelM, [x, topY(HALF - 0.12), SZ1 - 0.12], [x, topY(0), ZR], 0.12, 0.16);                      // верхний пояс
      bm(g, steelM, [x, topY(HALF - 0.12), SZ0 + 0.12], [x, topY(0), ZR], 0.12, 0.16);
      for (const dz of [0, -2.25, 2.25]) bm(g, steelM, [x, yc, ZR + dz], [x, topY(Math.abs(dz)), ZR + dz], 0.09, 0.09);
      for (const s of [-1, 1]) bm(g, steelM, [x, yc, ZR + s * 2.25], [x, topY(0), ZR], 0.08, 0.08);
    }
    bx(g, steelM, XM, EH - 0.1, SZ1 - 0.05, 13.8, 0.34, 0.16);    // передняя обвязка
    bx(g, steelM, XM, EH - 0.1, SZ0 + 0.05, 13.8, 0.34, 0.16);
    // --- кровля (низкий двускат, коньком вдоль X), выносы, стропила, обрешётка
    const slopeLen = 5.4 / Math.cos(ANG) + 0.1, rx0 = SX0 - 0.7, rx1 = SX1 + 0.7, rw = rx1 - rx0, rcx = (rx0 + rx1) / 2;
    for (const s of [1, -1]) {
      const zr0 = ZR, y0 = roofY(0), ze = ZR + s * 5.4, ye = roofY(5.4);
      const cz = (zr0 + ze) / 2 - s * 0.04 * Math.sin(ANG) - s * 0.03, cyy = (y0 + ye) / 2 - 0.04 * Math.cos(ANG) + 0.02;
      slab(g, roofM, [rcx, cyy, cz], [0, -Math.sin(ANG), s * Math.cos(ANG)], [1, 0, 0], rw, 0.08, slopeLen);
      for (let x = rx0 + 0.3; x < rx1; x += 1.05) bm(g, timberD, [x, y0 - 0.13, ZR], [x, ye - 0.13, ze], 0.07, 0.14);
      bx(g, galvM, XM, ye - 0.04, ZR + s * 5.45, rw + 0.06, 0.09, 0.14);                                      // водосточный жёлоб
      bx(g, steelM, XM, ye - 0.09, ZR + s * 5.0, rw, 0.07, 0.07);                                              // прогон
      bx(g, galvM, rcx, y0 + 0.04, ZR + s * 0.17, rw + 0.04, 0.035, 0.36, s * -ANG, 0, 0);                    // коньковый элемент
    }
    for (const x of [rx0 + 0.02, rx1 - 0.02]) for (const s of [1, -1]) bm(g, galvM, [x, roofY(5.4) - 0.02, ZR + s * 5.4], [x, roofY(0) + 0.05, ZR], 0.05, 0.12);  // торцевые планки
    for (const [x, z] of [[SX0 - 0.55, SZ1 + 0.75], [SX1 + 0.55, SZ1 + 0.75]]) rod(g, galvM, [x, EH + 0.05, z], [x, 0.3, z], 0.05, 8);  // водосточные трубы
    // --- стены: профлист
    bx(g, wallM, XM, (0.8 + EH) / 2, SZ0 - 0.06, SX1 - SX0 + 0.3, EH - 0.8, 0.08);
    const gabPts = (z0, z1) => [[z0, 0.8], [z1, 0.8], [z1, EH + 0.06], [ZR, roofY(0) - 0.24], [z0, EH + 0.06]];
    const west = add(g, polyG(gabPts(SZ0 - 0.1, SZ1), null, 0.08, wallM.userData.tile), wallM, SX0, 0, 0, 0, -PI / 2, 0);
    const east = add(g, polyG(gabPts(SZ0 - 0.1, SZ1), [[[-4.6, 0.95], [-3.5, 0.95], [-3.5, 2.35], [-4.6, 2.35]]], 0.08, wallM.userData.tile), wallM, SX1 + 0.08, 0, 0, 0, -PI / 2, 0);
    for (let i = 0; i < 3; i++) bx(g, steelM, XM, 1.6 + i * 1.5, SZ0 + 0.02, 12.8, 0.08, 0.05);                 // ригели обшивки на внутренней стене
    // вентиляционные жалюзи и окна на задней стене
    for (const x of [-3.6, 2.2, 5.4]) { bx(g, V(0x2a3a42), x, 4.5, SZ0 - 0.11, 1.5, 0.7, 0.03); for (let k = 0; k < 4; k++) bx(g, steelM, x, 4.25 + k * 0.17, SZ0 - 0.14, 1.56, 0.04, 0.05, 0.4); }
    for (const x of XS) bx(g, steelM, x, (0.8 + EH) / 2, SZ0 - 0.13, 0.22, EH - 0.8, 0.06);                         // наружные пилястры
    bx(g, galvM, XM, 0.86, SZ0 - 0.12, 13.2, 0.1, 0.12); bx(g, galvM, XM, EH + 0.02, SZ0 - 0.12, 13.2, 0.1, 0.12);   // отливы
    bx(g, V(0x8a9096), -2.2, 1.6, SZ0 - 0.2, 0.7, 0.9, 0.22); bx(g, V(0x5c6168), -2.2, 1.6, SZ0 - 0.32, 0.6, 0.8, 0.03); rod(g, black, [-2.2, 2.05, SZ0 - 0.2], [-2.2, 5.0, SZ0 - 0.2], 0.03, 6); // шкаф и кабель-канал
    // дверь в торце
    bx(g, V(0x4d5f56), SX0 - 0.1, 1.15, -4.4, 0.06, 2.0, 0.95); for (const dz of [-0.55, 0.55]) bx(g, V(0xd8d4c4), SX0 - 0.13, 1.15, -4.4 + dz, 0.05, 2.1, 0.1); bx(g, V(0xd8d4c4), SX0 - 0.13, 2.22, -4.4, 0.05, 0.1, 1.2); bx(g, concM, SX0 - 0.35, 0.12, -4.4, 0.7, 0.24, 1.4); bx(g, steelM, SX0 - 0.15, 1.1, -4.12, 0.04, 0.12, 0.05);
    // --- рельсы и тележка (каретка) вдоль X
    const rz1 = -0.65, rz2 = 0.85;
    for (let x = -5.5; x < 6.4; x += 0.9) bx(g, timberD, x, FL + 0.07, (rz1 + rz2) / 2, 0.2, 0.14, 2.1);
    for (const z of [rz1, rz2]) { bx(g, steelM, 0.55, FL + 0.19, z, 12.2, 0.1, 0.09); bx(g, steelM, 0.55, FL + 0.14, z, 12.2, 0.04, 0.22); }
    const CX = -2.75;
    for (const z of [rz1, rz2]) bx(g, orangeM, CX, 0.84, z, 5.4, 0.22, 0.2);
    for (const dx of [-2.05, 0, 2.05]) { bx(g, orangeM, CX + dx, 0.84, (rz1 + rz2) / 2, 0.3, 0.18, 1.9); bx(g, steelM, CX + dx, 1.0, 0.1, 0.34, 0.14, 1.5); bx(g, steelM, CX + dx, 1.5, 0.64, 0.14, 1.0, 0.12); bx(g, steelM, CX + dx - 0.04, 2.02, 0.64, 0.05, 0.16, 0.12, 0, 0, 0.5); }
    for (const dx of [-2.05, 2.05]) for (const z of [rz1, rz2]) { cy(g, steelM, CX + dx, FL + 0.38, z, 0.2, 0.1, 14, PI / 2, 0, 0); bx(g, orangeM, CX + dx, 0.62, z, 0.14, 0.4, 0.14); }
    logAt(g, logM, CX, 1.5, 0.0, 0.43, 0.38, 4.9, 'x', R, 12, 2);
    // --- ленточнопильный станок (головной)
    const SXP = 0.45, ZC = -1.58, WR = 0.78, ZB = ZC + WR;
    bx(g, orangeM, SXP, 2.85, -2.9, 0.7, 5.7, 0.7); bx(g, steelM, SXP, 0.22, -2.9, 1.2, 0.04, 1.5);
    for (const y of [1.05, 4.35]) {
      cy(g, galvM, SXP, y, ZC, WR, 0.3, 22, 0, 0, PI / 2);
      for (const s of [-1, 1]) { cy(g, orangeM, SXP + s * 0.2, y, ZC, 0.86, 0.05, 22, 0, 0, PI / 2); cy(g, galvM, SXP + s * 0.26, y, ZC, 0.2, 0.08, 10, 0, 0, PI / 2); }
      bx(g, orangeM, SXP, y, ZC - 0.9, 0.62, 0.8, 1.0);
    }
    bx(g, galvM, SXP, (1.05 + 4.35) / 2, ZB, 0.2, 3.3, 0.015);                                       // полотно пилы
    bx(g, orangeM, SXP, 4.35 + 0.86, ZC + 0.1, 0.5, 0.18, 1.3);                                         // верхний кожух
    bx(g, steelM, SXP + 0.5, 2.9, -1.25, 0.14, 3.5, 0.18);                                              // направляющая линейка
    bx(g, yellow, SXP - 0.5, 3.1, -1.25, 0.12, 0.5, 0.14);
    // опилки вокруг
    for (let i = 0; i < 4; i++) add(g, blobG, V(0xcaa66a), SXP + (R() - 0.5) * 3.2, FL, -1.3 - R() * 1.4, 0, R() * 3, 0, 0.7 + R() * 0.5, 0.1 + R() * 0.08, 0.6 + R() * 0.4);
    // --- выходной рольганг/ленточный конвейер для досок через проём в восточной стене
    const BZ = -4.05;
    bx(g, rubber, 4.55, 1.0, BZ, 8.2, 0.07, 0.8); bx(g, steelM, 4.55, 0.92, BZ - 0.45, 8.3, 0.18, 0.08); bx(g, steelM, 4.55, 0.92, BZ + 0.45, 8.3, 0.18, 0.08);
    for (let x = 1.2; x < 8.6; x += 1.6) for (const s of [-1, 1]) bx(g, steelM, x, 0.55, BZ + s * 0.42, 0.1, 0.7, 0.1);
    for (const [x, len, dz] of [[3.1, 3.4, -0.18], [5.8, 3.6, 0.15], [7.7, 2.2, -0.1]]) bx(g, lumberM, x, 1.07, BZ + dz, len, 0.05, 0.22);
    // --- пылеотсос: трубы, циклон, силос
    const duct = (a, b) => rod(g, galvM, a, b, 0.27, 12), joint = (p) => ball(g, galvM, p[0], p[1], p[2], 0.29);
    const P1 = [SXP, 0.9, -3.75], P2 = [SXP, 5.0, -3.75], P3 = [SXP, 5.0, -6.85], P4 = [7.9, 5.0, -6.85], P5 = [7.9, 8.1, -6.85], P6 = [9.1, 8.1, -6.85];
    bx(g, galvM, SXP, 0.55, -3.75, 0.9, 0.8, 0.7);
    [[P1, P2], [P2, P3], [P3, P4], [P4, P5], [P5, P6]].forEach(([a, b]) => duct(a, b)); [P2, P3, P4, P5].forEach(joint);
    const T1 = [4.2, 1.2, -4.45], T2 = [4.2, 5.0, -4.45], T3 = [4.2, 5.0, -6.85]; bx(g, galvM, 4.2, 1.15, -4.45, 0.7, 0.4, 0.5); duct(T1, T2); duct(T2, T3); joint(T2); ball(g, galvM, 4.2, 5.0, -6.85, 0.3);
    for (let x = 0.9; x < 7.8; x += 1.6) { cy(g, steelM, x, 5.0, -6.85, 0.31, 0.08, 12, PI / 2, 0, 0); bx(g, steelM, x, 5.4, -6.7, 0.06, 0.8, 0.06); }
    for (let y = 1.6; y < 5.0; y += 1.2) { cy(g, steelM, SXP, y, -3.75, 0.31, 0.08, 12); }
    // силос из гофрированного листа с кольцами жёсткости
    const SXs = 9.65, SZs = -6.6, SR = 1.35, SH = 5.4;
    cy(g, concM, SXs, 0.2, SZs, 1.6, 0.4, 24);
    const silo = add(g, (() => { const cg = new T.CylinderGeometry(SR, SR, SH, 28, 1, true), uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * SH / 3.2, u * TAU * SR / 3.2); } return cg; })(), roofM, SXs, 0.4 + SH / 2, SZs);
    cone(g, roofM, SXs, 0.4 + SH + 0.45, SZs, SR + 0.12, 0.35, 0.9, 28);
    for (const y of [1.2, 2.6, 4.0, 5.3]) cy(g, steelM, SXs, y, SZs, SR + 0.03, 0.07, 28);
    cy(g, galvM, SXs, 6.0, SZs, 0.42, 0.5, 16);                                                          // ротационный клапан/патрубок
    cone(g, galvM, SXs, 7.0, SZs, 0.85, 0.22, 1.5, 24);
    cy(g, galvM, SXs, 7.9, SZs, 0.85, 1.3, 24); cy(g, steelM, SXs, 8.58, SZs, 0.9, 0.1, 24); cy(g, galvM, SXs, 9.4, SZs, 0.32, 1.5, 14); cone(g, galvM, SXs, 10.28, SZs, 0.55, 0.05, 0.28, 14);
    for (const [dx, dz] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) bx(g, steelM, SXs + dx, 10.0, SZs + dz, 0.04, 0.4, 0.04);
    bx(g, steelM, 8.8, 8.1, -6.85, 0.5, 0.4, 0.4);
    // лестница с ограждением по силосу
    const lx = SXs + 0.15, lz = SZs + SR + 0.08;
    for (const s of [-1, 1]) bx(g, steelM, lx + s * 0.22, 3.2, lz, 0.05, 5.6, 0.06);
    for (let y = 0.8; y < 5.9; y += 0.32) bx(g, steelM, lx, y, lz, 0.44, 0.03, 0.03);
    for (const y of [3.2, 4.2, 5.2]) add(g, new T.TorusGeometry(0.42, 0.014, 4, 10, PI), steelM, lx, y, lz + 0.05, PI / 2, 0, 0);
    // выгрузной рукав силоса
    bx(g, steelM, SXs + 0.9, 0.65, SZs + 1.0, 0.6, 0.9, 0.6); cone(g, galvM, SXs + 0.9, 1.9, SZs + 0.2, 0.6, 0.14, 1.0, 14);
    // --- навес для сушки досок (пристроен к восточному торцу)
    const LX0 = SX1 + 0.1, LX1 = 10.85, LZ0 = -5.0, LZ1 = 2.6;
    bx(g, concM, (LX0 + LX1) / 2, FL / 2 - 0.02, (LZ0 + LZ1) / 2, LX1 - LX0, FL, LZ1 - LZ0);
    const lt = 15 * PI / 180, yH = 4.7, yL = yH - (LX1 - LX0) * Math.tan(lt);
    bx(g, woodM, (LX0 + LX1) / 2, 2.2, LZ0 + 0.04, LX1 - LX0, 4.0, 0.08);       // задняя стенка из досок
    for (const z of [LZ0 + 0.15, -1.9, 0.9, LZ1 - 0.15]) { bx(g, timber, LX1 - 0.12, (yL - 0.2 + FL) / 2, z, 0.2, yL - 0.2 - FL, 0.2); bx(g, timberD, LX1 - 0.12, yL - 0.28, z, 0.34, 0.12, 0.34); }
    bx(g, timber, LX1 - 0.12, yL - 0.14, (LZ0 + LZ1) / 2, 0.22, 0.24, LZ1 - LZ0 + 0.3);
    const lrl = (LX1 + 0.5 - LX0) / Math.cos(lt);
    slab(g, roofM, [(LX0 + LX1 + 0.5) / 2, (yH + yL - 0.1) / 2 + 0.1, (LZ0 + LZ1) / 2], [Math.cos(lt), -Math.sin(lt), 0], [0, 0, 1], LZ1 - LZ0 + 0.6, 0.08, lrl);
    for (let z = LZ0 + 0.1; z <= LZ1; z += 0.95) bm(g, timberD, [LX0, yH - 0.1, z], [LX1 + 0.4, yL - 0.17, z], 0.08, 0.14);
    // стеллажи с досками (два яруса) и перекладины
    const bays = [-4.15, -2.45, -0.75, 0.95];
    for (const bz of bays) {
      for (const px of [LX0 + 0.45, LX1 - 0.45]) for (const pz of [bz - 0.68, bz + 0.68]) bx(g, timber, px, 1.35, pz, 0.1, 2.3, 0.1);
      for (const y of [0.42, 1.78]) bx(g, timberD, (LX0 + LX1) / 2, y - 0.07, bz, 3.5, 0.1, 1.55);
      bx(g, lumberM, (LX0 + LX1) / 2 + 0.05, 0.42 + 0.58, bz, 3.3, 1.1, 1.3);
      if (R() < 0.8) bx(g, lumberM, (LX0 + LX1) / 2 - 0.1, 1.78 + 0.45, bz, 3.1 + R() * 0.2, 0.85, 1.3);
      bx(g, steelM, LX0 + 0.9, 1.0, bz, 0.04, 1.14, 1.34);
    }
    // --- поддоны
    function pallet(px, py, pz, ry, c) {
      const pg = new T.Group(); pg.position.set(px, py, pz); pg.rotation.y = ry || 0; g.add(pg); const col = V(c || 0xb8975e), colD = V(shade(c || 0xb8975e, 0.8));
      for (const z of [-0.33, 0, 0.33]) bx(pg, colD, 0, 0.067, z, 1.2, 0.09, 0.07);
      for (let i = 0; i < 5; i++) bx(pg, col, -0.5 + i * 0.25, 0.139, 0, 0.12, 0.022, 0.8);
      for (const x of [-0.55, 0, 0.55]) bx(pg, col, x, 0.011, 0, 0.12, 0.022, 0.8);
    }
    for (let i = 0; i < 3; i++) pallet(-8.9, i * 0.152, 3.3, 0.05 * i, 0xb89560 + i * 0x040302);
    pallet(-7.6, 0, 2.6, 0.5, 0xc2a066); pallet(-10.2, 0, 3.9, -0.2, 0xa88a58);
    pallet(LX0 + 0.8, FL - 0.02, LZ1 - 0.5, 0.1, 0xb89560); pallet(LX0 + 2.2, FL - 0.02, LZ1 - 0.5, 0.0, 0xc2a066); pallet(LX0 + 0.8, FL + 0.13, LZ1 - 0.5, 0.15, 0xad8d58);
    // --- дизельный бак в обваловании
    const DX = -9.2, DZ = -3.6;
    bx(g, concM, DX, 0.1, DZ, 4.2, 0.2, 2.5); for (const [dx, dz, w, d] of [[0, -1.2, 4.2, 0.18], [0, 1.2, 4.2, 0.18], [-2.0, 0, 0.18, 2.5], [2.0, 0, 0.18, 2.5]]) bx(g, concM, DX + dx, 0.45, DZ + dz, w, 0.5, d);
    for (const dx of [-1.0, 1.0]) bx(g, steelM, DX + dx, 0.55, DZ, 0.18, 0.7, 1.3);
    cy(g, tankRed, DX, 1.25, DZ, 0.72, 2.9, 24, 0, 0, PI / 2); for (const s of [-1, 1]) ball(g, tankRed, DX + s * 1.45, 1.25, DZ, 0.72, 0.28, 1, 1);
    cy(g, steelM, DX - 0.3, 2.0, DZ, 0.17, 0.12, 12); cy(g, galvM, DX + 0.5, 2.0, DZ + 0.2, 0.08, 0.16, 8);
    bx(g, yellow, DX, 1.25, DZ + 0.73, 2.9, 0.08, 0.02); bx(g, steelM, DX + 1.1, 0.8, DZ + 0.78, 0.5, 0.7, 0.3);
    rod(g, black, [DX + 1.1, 1.0, DZ + 0.95], [DX + 1.5, 0.3, DZ + 1.4], 0.03, 6); bx(g, steelM, DX + 1.6, 0.3, DZ + 1.5, 0.08, 0.14, 0.2);
    for (let i = 0; i < 3; i++) { cy(g, V([0x2c4f8a, 0x8e3a2a, 0x2f6b46][i]), DX - 1.7 + i * 0.62, 0.45, DZ + 1.75, 0.27, 0.9, 12); cy(g, steelM, DX - 1.7 + i * 0.62, 0.45, DZ + 1.75, 0.285, 0.05, 12); }
    // --- бревенчатый подъёмник (наклонный цепной транспортёр) подаёт брёвна с площадки к каретке
    const slopeA = Math.atan2(0.95, 5.6);
    for (const cxs of [-4.3, -1.2]) {
      const zc = 4.3;
      bx(g, steelM, cxs, 0.7, zc, 0.42, 0.36, 5.7, slopeA, 0, 0);
      bx(g, black, cxs, 0.93, zc, 0.2, 0.08, 5.7, slopeA, 0, 0);
      for (let k = 0; k < 6; k++) { const z = 6.7 - k * 1.0, y = 0.98 + (6.8 - z) / 5.6 * 0.95; bx(g, steelM, cxs, y + 0.14, z, 0.16, 0.26, 0.14); bx(g, steelM, cxs, y + 0.22, z + 0.07, 0.14, 0.1, 0.22, slopeA * 2, 0, 0); }
      for (const z of [6.6, 4.8, 3.0]) { const yb = 0.5 + (6.8 - z) / 5.6 * 0.95; bx(g, steelM, cxs, yb / 2 - 0.1, z, 0.2, yb - 0.3, 0.2); bx(g, steelM, cxs, yb - 0.3, z, 0.55, 0.06, 0.4); }
      cy(g, steelM, cxs, 0.82, 7.1, 0.2, 0.46, 14, 0, 0, PI / 2); bx(g, steelM, cxs + 0.4, 2.0, 1.0, 0.35, 0.5, 0.5); cy(g, galvM, cxs, 1.55, 1.1, 0.24, 0.5, 14, 0, 0, PI / 2);
    }
    bx(g, steelM, -2.75, 2.3, 1.0, 3.1, 0.12, 0.12);
    logAt(g, logM, -2.75, 1.78, 3.4, 0.37, 0.34, 4.8, 'x', R, 12, 2); logAt(g, logM, -2.75, 0.98, 5.7, 0.4, 0.36, 4.6, 'x', R, 12, 2);
    logAt(g, logM, -2.9, 0.4, 7.7, 0.4, 0.33, 4.9, 'x', R, 12, 2); logAt(g, logM, -2.3, 0.37, 8.35, 0.37, 0.3, 4.2, 'x', R, 12, 2);
    for (const x of [-4.4, -1.1]) bx(g, timberD, x, 0.12, 7.9, 0.28, 0.24, 1.8);
    // --- контора
    const OX0 = 4.6, OX1 = 10.9, OZ0 = 3.9, OZ1 = 7.2, OXC = (OX0 + OX1) / 2, OZC = (OZ0 + OZ1) / 2, OH1 = 2.9, OH0 = 2.55;
    bx(g, concM, OXC, 0.2, OZC, OX1 - OX0 + 0.1, 0.4, OZ1 - OZ0 + 0.1);
    bx(g, woodM, OXC, 0.4 + (OH1 - 0.4) / 2, OZ1 - 0.04, OX1 - OX0, OH1 - 0.4, 0.1);
    bx(g, woodM, OXC, 0.4 + (OH0 - 0.4) / 2, OZ0 + 0.04, OX1 - OX0, OH0 - 0.4, 0.1);
    for (const [x, ry] of [[OX0 + 0.04, 0], [OX1 - 0.04, 0]]) add(g, polyG([[OZ0, 0.4], [OZ1, 0.4], [OZ1, OH1], [OZ0, OH0]], null, 0.1, woodM.userData.tile), woodM, x + (x > OXC ? 0.06 : 0.06), 0, 0, 0, -PI / 2, 0);
    // кровля конторы (скат назад) + ограждение под вывеску
    const oa = Math.atan2(OH1 - OH0, OZ1 - OZ0);
    slab(g, roofM, [OXC, (OH1 + OH0) / 2 + 0.07, OZC + 0.1], [0, -Math.sin(oa), -Math.cos(oa)], [1, 0, 0], OX1 - OX0 + 0.8, 0.09, OZ1 - OZ0 + 0.9);
    bx(g, galvM, OXC, OH1 + 0.1, OZ1 + 0.45, OX1 - OX0 + 0.8, 0.08, 0.1);
    // окна
    const win = (x, y, w, h, side) => {
      const z = OZ1 + 0.02;
      bx(g, V(0x26343c), x, y, z + 0.0, w, h, 0.05); for (const [dx, dy, ww, hh] of [[0, h / 2, w + 0.14, 0.08], [0, -h / 2, w + 0.14, 0.08], [-w / 2, 0, 0.08, h], [w / 2, 0, 0.08, h], [0, 0, 0.05, h], [0, 0.1, w, 0.05]]) bx(g, V(0xe8e4d6), x + dx, y + dy, z + 0.05, ww, hh, 0.07);
      bx(g, concM, x, y - h / 2 - 0.09, z + 0.1, w + 0.3, 0.07, 0.2);
      bx(gl, V(0xffffff), x, y, z + 0.03, w - 0.06, h - 0.06, 0.02);
    };
    win(7.35, 1.55, 1.3, 1.1); win(9.7, 1.55, 1.3, 1.1);
    // дверь, ступени, поручни, навес
    const DXo = 5.75;
    bx(g, V(0x4b3a2a), DXo, 1.2, OZ1 + 0.03, 0.95, 2.05, 0.06); bx(g, V(0xe8e4d6), DXo, 2.3, OZ1 + 0.05, 1.15, 0.12, 0.08); for (const s of [-1, 1]) bx(g, V(0xe8e4d6), DXo + s * 0.55, 1.2, OZ1 + 0.05, 0.1, 2.1, 0.08);
    bx(g, V(0x26343c), DXo, 1.55, OZ1 + 0.07, 0.56, 0.7, 0.02); bx(gl, V(0xffffff), DXo, 1.55, OZ1 + 0.08, 0.5, 0.64, 0.02); ball(g, galvM, DXo + 0.32, 1.05, OZ1 + 0.09, 0.04);
    for (let i = 0; i < 3; i++) { const hh = 0.38 - i * 0.12; bx(g, concM, DXo, hh / 2, OZ1 + 0.4 + i * 0.3, 1.4, hh, 0.34); }
    for (const s of [-1, 1]) { const px = DXo + s * 0.75; bx(g, steelM, px, 0.7, OZ1 + 0.38, 0.05, 1.0, 0.05); bx(g, steelM, px, 0.4, OZ1 + 1.0, 0.05, 0.7, 0.05); bm(g, steelM, [px, 1.1, OZ1 + 0.35], [px, 0.8, OZ1 + 1.05], 0.05, 0.05); }
    bm(g, V(0xe0b020), [DXo - 0.75, 1.1, OZ1 + 0.35], [DXo - 0.75, 0.8, OZ1 + 1.05], 0.05, 0.05);
    slab(g, roofM, [DXo, 2.75, OZ1 + 0.55], [0, -Math.sin(0.2), Math.cos(0.2)], [1, 0, 0], 1.7, 0.06, 1.3);
    for (const s of [-1, 1]) bm(g, steelM, [DXo + s * 0.8, 2.3, OZ1 + 0.05], [DXo + s * 0.8, 2.55, OZ1 + 1.0], 0.05, 0.05);
    // печная труба и кондиционер
    cy(g, steelM, 5.6, OH0 + 0.6, 4.7, 0.09, 1.2, 10); cone(g, steelM, 5.6, OH0 + 1.28, 4.7, 0.2, 0.01, 0.2, 10);
    bx(g, V(0xd4d4d0), OX1 + 0.12, 1.9, 5.6, 0.25, 0.4, 0.7); bx(g, black, OX1 + 0.26, 1.9, 5.6, 0.02, 0.3, 0.6);
    // --- светильники
    const lamps = new T.Group();
    for (const x of [-5.85, 0.45, 6.75]) { bx(g, black, x, 5.3, SZ1 + 0.2, 0.4, 0.3, 0.3); bx(lamps, lampM, x, 5.26, SZ1 + 0.38, 0.34, 0.18, 0.04); rod(g, steelM, [x, 5.5, SZ1 + 0.1], [x, 5.8, SZ1 + 0.1], 0.03, 6); }
    bx(g, black, DXo + 0.9, 2.45, OZ1 + 0.1, 0.18, 0.18, 0.14); bx(lamps, lampM, DXo + 0.9, 2.4, OZ1 + 0.2, 0.14, 0.1, 0.03);
    cy(g, steelM, -7.5, 3.5, 6.0, 0.07, 7.0, 8); bx(g, black, -7.5, 7.0, 6.2, 0.2, 0.2, 0.9); bx(lamps, lampM, -7.5, 6.86, 6.55, 0.3, 0.05, 0.3); bx(g, concM, -7.5, 0.1, 6.0, 0.5, 0.2, 0.5);
    cy(g, steelM, 1.0, 5.0, -3.0, 0.02, 0.8, 6); ball(lamps, lampM, 1.0, 4.5, -3.0, 0.14);
    // --- вывеска-щит (отдельный Mesh, чтобы подпись можно было заменить): 6 × 1.2 м, смотрит в +Z
    const sx = OXC, sy = OH1 + 0.2 + 0.7, sz = OZ1 + 0.38;
    for (const s of [-1, 1]) { bx(g, steelM, sx + s * 2.6, sy - 0.05, sz - 0.2, 0.12, 1.5, 0.12); bm(g, steelM, [sx + s * 2.6, OH1 + 0.1, sz - 0.12], [sx + s * 2.6, sy, sz - 0.5], 0.08, 0.08); }
    bx(g, V(0x2b2f2c), sx, sy, sz - 0.07, 6.3, 1.5, 0.1);
    const signM = new T.MeshLambertMaterial({ color: 0xe9e1c6 });
    const sign = new T.Mesh(new T.PlaneGeometry(6, 1.2), signM); sign.position.set(sx, sy, sz); sign.name = 'sign'; sign.userData.sign = true; sign.castShadow = false; sign.receiveShadow = true;
    // --- сборка
    const out = finish(g, 11, [mergeInto(lamps, lampM, false), mergeInto(gl, C.glassM(0xa9cbd8), false), sign]);
    return centred(out, 0.02, -0.3);
  }

  reg('building', 'sawmill', buildSawmill);

  // ================================================================== ИЗБА ЛЕСОРУБА
  function buildHut() {
    const g = new T.Group(), gl = new T.Group(), lamps = new T.Group(), R = lcg(777);
    const hutLog = tm('smw_log', null, 0xe8b87c), hutWood = tm('smw_wood', [2.4, 2.4], 0xd8ae82), hutWoodD = tm('smw_wood', [2.4, 2.4], 0xa88060);
    const dark = V(0x2a1f16), iron = V(0x26282a), brown = V(0x5a3d26), chop = V(0xd9bf8c);
    const xw = -3.2, xe = 3.2, zf = 1.4, zb = -3.0, zc = (zf + zb) / 2, lr = 0.19, pitch = 0.33, nC = 7, y0 = 0.26 + lr;
    const RP = 40 * PI / 180, TP = Math.tan(RP), yEave = 2.88, yRidge = yEave + 2.2 * TP;
    // фундамент и внутренняя «коробка», чтобы через проёмы не было видно насквозь
    bx(g, stoneM, 0, 0.13, zc, xe - xw + 0.55, 0.26, zf - zb + 0.55);
    bx(g, dark, 0, 1.5, zc, xe - xw - 0.1, 2.7, zf - zb - 0.1);
    for (const [x, z] of [[xw - 0.2, zf + 0.2], [xe + 0.2, zf + 0.2], [xw - 0.2, zb - 0.2], [xe + 0.2, zb - 0.2]]) bx(g, stoneM, x, 0.2, z, 0.55, 0.4, 0.55);
    // проёмы (по осям стен): x/z-диапазон и высота
    const OP = {
      front: [{ a: -0.4, b: 0.8, y0: 0, y1: 2.15 }, { a: -2.5, b: -1.5, y0: 0.88, y1: 1.8 }, { a: 1.8, b: 2.8, y0: 0.88, y1: 1.8 }],
      back: [{ a: -0.1, b: 0.9, y0: 0.88, y1: 1.8 }],
      east: [{ a: -1.25, b: -0.35, y0: 0.88, y1: 1.8 }], west: [],
    };
    const runs = (a0, a1, gaps) => { const out = []; let c = a0; gaps.slice().sort((p, q) => p.a - q.a).forEach((gp) => { if (gp.a > c) out.push([c, gp.a]); c = Math.max(c, gp.b); }); if (c < a1) out.push([c, a1]); return out; };
    const ov = 0.4;
    for (let k = 0; k < nC; k++) {
      const yF = y0 + k * pitch, yS = yF + pitch / 2, rk = lr * (0.95 + R() * 0.1), flip = k % 2 ? 1 : -1;
      for (const [name, z] of [['front', zf], ['back', zb]]) {
        const gaps = OP[name].filter((o) => yF > o.y0 && yF < o.y1);
        for (const [a, b] of runs(xw - ov, xe + ov, gaps)) { const rr = rk * (0.97 + R() * 0.06); logAt(g, hutLog, (a + b) / 2, yF, z, rr * (1 + 0.05 * flip), rr * (1 - 0.05 * flip), b - a, 'x', R, 9, 1); }
      }
      for (const [name, x] of [['west', xw], ['east', xe]]) {
        const gaps = OP[name].filter((o) => yS > o.y0 && yS < o.y1);
        for (const [a, b] of runs(zb - ov, zf + ov, gaps)) { const rr = rk * (0.97 + R() * 0.06); logAt(g, hutLog, x, yS, (a + b) / 2, rr * (1 - 0.05 * flip), rr * (1 + 0.05 * flip), b - a, 'z', R, 9, 1); }
      }
    }
    // фронтоны из вертикальных досок
    const gabY = (dz) => yEave + (2.2 - Math.abs(dz)) * TP - 0.26;
    for (const x of [xw, xe]) add(g, polyG([[-2.2, 2.45], [2.2, 2.45], [2.2, gabY(2.2)], [0, gabY(0)], [-2.2, gabY(2.2)]], null, 0.1, hutWood.userData.tile), hutWood, x + 0.05, 0, zc, 0, -PI / 2, 0);
    for (const x of [xw, xe]) { cy(g, dark, x + (x > 0 ? 0.08 : -0.08), 3.4, zc, 0.22, 0.04, 14, 0, 0, PI / 2); add(g, new T.TorusGeometry(0.22, 0.03, 5, 14), hutWoodD, x + (x > 0 ? 0.1 : -0.1), 3.4, zc, 0, PI / 2, 0); }
    // кровля: шингл, 40°, свесы
    const slopeL = 2.75 / Math.cos(RP) + 0.12, rx0 = xw - 0.19 - 0.5, rx1 = xe + 0.19 + 0.5, rw = rx1 - rx0, rcx = (rx0 + rx1) / 2;
    for (const s of [1, -1]) {
      const ye = yRidge - 2.75 * TP, cz = zc + s * 1.375 - s * 0.05 * Math.sin(RP), cyy = (yRidge + ye) / 2 - 0.05 * Math.cos(RP);
      slab(g, shingleM, [rcx, cyy, cz], [0, -Math.sin(RP), s * Math.cos(RP)], [1, 0, 0], rw, 0.1, slopeL);
      for (let x = rx0 + 0.35; x < rx1; x += 0.85) bm(g, brown, [x, yRidge - 0.22, zc], [x, ye - 0.2, zc + s * 2.75], 0.09, 0.12);
      bx(g, brown, rcx, yRidge + 0.03, zc + s * 0.16, rw + 0.05, 0.05, 0.4, s * -RP, 0, 0);
      for (const x of [rx0 + 0.02, rx1 - 0.02]) bm(g, brown, [x, ye - 0.04, zc + s * 2.75], [x, yRidge + 0.03, zc + s * 0.05], 0.07, 0.2);
    }
    // дверь
    const door = new T.Group(); door.position.set(0.2, 0.26, zf + lr); g.add(door);
    bx(door, hutWoodD, 0, 1.0, -0.1, 1.0, 1.95, 0.07); for (const x of [-0.31, 0, 0.31]) bx(door, hutWood, x, 1.0, -0.06, 0.28, 1.9, 0.03);
    bm(door, hutWoodD, [-0.4, 0.2, -0.03], [0.4, 1.8, -0.03], 0.1, 0.03); for (const y of [0.35, 1.6]) bx(door, iron, 0.0, y, -0.03, 0.9, 0.09, 0.02);
    cy(door, iron, 0.38, 1.0, 0.0, 0.025, 0.12, 6, PI / 2, 0, 0); bx(door, iron, 0.38, 1.0, -0.03, 0.05, 0.16, 0.02);
    for (const sx of [-1, 1]) bx(door, hutWoodD, sx * 0.62, 1.1, 0.04, 0.12, 2.25, 0.3); bx(door, hutWoodD, 0, 2.25, 0.04, 1.4, 0.14, 0.3);
    bx(door, stoneM, 0, 0.0, 0.2, 1.4, 0.08, 0.5);
    // окна (рама, ставни, стекло)
    function windowAt(wx, wy, wz, ry, w, h, shut) {
      const u = new T.Group(); u.position.set(wx, wy, wz); u.rotation.y = ry; g.add(u);
      bx(u, V(0x1b2830), 0, h / 2, -0.12, w, h, 0.05);
      for (const [dx, dy, ww, hh] of [[0, h + 0.04, w + 0.18, 0.09], [0, -0.02, w + 0.18, 0.09], [-w / 2 - 0.04, h / 2, 0.09, h + 0.14], [w / 2 + 0.04, h / 2, 0.09, h + 0.14], [0, h / 2, 0.05, h], [0, h * 0.58, w, 0.05]]) bx(u, hutWoodD, dx, dy, 0.0, ww, hh, 0.1);
      bx(u, hutWoodD, 0, -0.1, 0.1, w + 0.34, 0.07, 0.2); bx(gl, V(0xffffff), 0, h / 2, -0.09, w - 0.04, h - 0.04, 0.02);
      if (shut) for (const sx of [-1, 1]) { const lx = sx * (w / 2 + 0.1 + 0.25); bx(u, hutWood, lx, h / 2, 0.02, 0.5, h + 0.08, 0.05, 0, sx * 0.1, 0); bm(u, hutWoodD, [lx - 0.2, h * 0.2, 0.06], [lx + 0.2, h * 0.8, 0.06], 0.07, 0.025); bx(u, hutWoodD, lx, h * 0.15, 0.06, 0.52, 0.07, 0.025); bx(u, hutWoodD, lx, h * 0.85, 0.06, 0.52, 0.07, 0.025); }
    }
    windowAt(-2.0, 0.91, zf + lr, 0, 1.0, 0.86, true); windowAt(2.3, 0.91, zf + lr, 0, 1.0, 0.86, true);
    windowAt(0.4, 0.91, zb - lr, PI, 1.0, 0.86, false); windowAt(xe + lr, 0.91, -0.8, PI / 2, 0.9, 0.86, true);
    // каменная труба на западном торце, колпак
    const chx = xw - lr - 0.5, chz = zc;
    bx(g, stoneM, chx + 0.05, 0.85, chz, 1.15, 1.7, 1.6); bx(g, stoneM, chx + 0.1, 1.95, chz, 1.0, 0.7, 1.25); bx(g, stoneM, chx + 0.1, 3.5, chz, 0.85, 3.2, 1.0);
    bx(g, stoneM, chx + 0.1, 5.25, chz, 1.05, 0.14, 1.2); bx(g, stoneM, chx + 0.1, 5.38, chz, 0.95, 0.12, 1.1); cy(g, V(0x6a3a28), chx + 0.1, 5.65, chz, 0.2, 0.44, 12);
    for (const [dx, dz] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) bx(g, iron, chx + 0.1 + dx, 5.78, chz + dz, 0.035, 0.25, 0.035);
    add(g, new T.ConeGeometry(0.42, 0.22, 4), iron, chx + 0.1, 6.0, chz, 0, PI / 4, 0);
    // крыльцо: настил, ступени, столбы, перила, двускатный навес
    const pX = 0.2, pz0 = zf + lr, pz1 = 3.6;
    bx(g, hutWood, pX + 0.1, 0.17, (pz0 + pz1) / 2, 3.2, 0.2, pz1 - pz0); for (const x of [-1.2, 1.6]) for (const z of [pz0 + 0.1, pz1 - 0.1]) bx(g, stoneM, x, 0.07, z, 0.3, 0.14, 0.3);
    for (let i = 0; i < 2; i++) bx(g, hutWood, pX, 0.1 - i * 0.0 + (i ? -0.0 : 0.0), pz1 + 0.18 + i * 0.28, 1.3, 0.12 + (1 - i) * 0.1, 0.3);
    for (const x of [-1.25, 1.65]) { logAt(g, hutLog, x, 1.27, pz1 - 0.15, 0.1, 0.09, 2.2, 'y', R, 8, 1); bx(g, hutWoodD, x, 2.42, (pz0 + pz1 - 0.15) / 2, 0.16, 0.2, pz1 - pz0 + 0.05); bx(g, hutWoodD, x, 0.95, (pz0 + pz1 - 0.15) / 2 + 0.1, 0.07, 0.07, pz1 - pz0 - 0.4); bx(g, hutWoodD, x, 0.55, (pz0 + pz1 - 0.15) / 2 + 0.1, 0.05, 0.05, pz1 - pz0 - 0.4); }
    bx(g, hutWoodD, pX + 0.2, 2.42, pz1 - 0.15, 3.1, 0.2, 0.16);
    const PR = 30 * PI / 180, PTn = Math.tan(PR), pyEdge = 2.7, pyRidge = pyEdge + 1.85 * PTn, pzA = 0.45, pzB = pz1 + 0.12, pL = 1.85 / Math.cos(PR) + 0.1;
    for (const s of [1, -1]) {
      slab(g, shingleM, [pX + s * 0.925 - s * 0.05 * Math.sin(PR), (pyRidge + pyEdge) / 2 - 0.05 * Math.cos(PR), (pzA + pzB) / 2], [s * Math.cos(PR), -Math.sin(PR), 0], [0, 0, 1], pzB - pzA, 0.1, pL);
      for (let z = pz0 + 0.1; z < pzB; z += 0.85) bm(g, brown, [pX, pyRidge - 0.18, z], [pX + s * 1.85, pyEdge - 0.16, z], 0.1, 0.1);
      bx(g, brown, pX + s * 0.12, pyRidge + 0.03, (pzA + pzB) / 2, 0.4, 0.05, pzB - pzA + 0.05, 0, 0, s * PR);
    }
    add(g, polyG([[-1.78, 2.5], [1.78, 2.5], [0, pyRidge - 0.28]], null, 0.06, hutWood.userData.tile), hutWood, pX, 0, pz1 - 0.2, 0, 0, 0).scale.set(1, 1, 1);
    // дрова на крыльце
    for (let L = 0; L < 2; L++) for (let i = 0; i < 6; i++) logAt(g, logM, -0.98 + (L % 2) * 0.0 + (R() - 0.5) * 0.05, 0.27 + 0.07 + L * 0.14, pz0 + 0.25 + i * 0.2 + (L ? 0.1 : 0), 0.07, 0.065, 0.5, 'x', R, 6, 1);
    // дровница у восточной стены
    bx(g, dark, xe + lr + 0.4, 0.5, -1.25, 0.6, 1.0, 2.0);
    for (let L = 0; L < 3; L++) for (let i = 0; i < 7 - (L > 1 ? 1 : 0); i++) logAt(g, logM, xe + lr + 0.4 + (R() - 0.5) * 0.04, 0.1 + L * 0.16, -2.2 + i * 0.3 + (L % 2) * 0.15, 0.075 + R() * 0.02, 0.07, 0.62, 'x', R, 6, 1);
    // стремянка, прислонённая к стене
    const ladX = xe + lr + 0.12;
    for (const dz of [-0.24, 0.24]) bm(g, hutWoodD, [ladX + 0.5, 0.0, 0.55 + dz], [ladX + 0.04, 2.6, 0.55 + dz], 0.06, 0.04);
    for (let i = 0; i < 8; i++) { const t = (i + 0.7) / 8.4; bx(g, hutWoodD, ladX + 0.5 - t * 0.46, t * 2.6, 0.55, 0.04, 0.04, 0.5); }
    // колода с топором и щепа
    logAt(g, logM, -2.5, 0.31, 3.35, 0.3, 0.33, 0.62, 'y', R, 12, 1);
    rod(g, hutWoodD, [-2.5, 0.64, 3.35], [-2.15, 1.5, 3.55], 0.022, 6); bx(g, V(0x8c9298), -2.52, 0.7, 3.35, 0.2, 0.17, 0.035, 0, 0.2, 0.3);
    for (let i = 0; i < 5; i++) bx(g, chop, -2.5 + (R() - 0.5) * 1.4, 0.03, 3.35 + (R() - 0.5) * 1.2, 0.12, 0.03, 0.05, 0, R() * 3, 0);
    for (let i = 0; i < 3; i++) logAt(g, logM, -3.3 + R() * 0.5, 0.07, 2.9 + i * 0.35, 0.08, 0.075, 0.45, 'x', R, 6, 1);
    // фонарь у крыльца
    rod(g, iron, [1.65, 2.3, pz1 - 0.15], [1.95, 2.3, pz1 - 0.15], 0.018, 5); rod(g, iron, [1.95, 2.3, pz1 - 0.15], [1.95, 2.05, pz1 - 0.15], 0.012, 5);
    cy(g, iron, 1.95, 1.9, pz1 - 0.15, 0.085, 0.3, 8); cy(g, iron, 1.95, 2.07, pz1 - 0.15, 0.11, 0.03, 8); cy(lamps, lampM, 1.95, 1.9, pz1 - 0.15, 0.06, 0.24, 8);
    // бочка с дождевой водой у угла
    cy(g, hutWoodD, -3.6, 0.5, zf + 0.7, 0.36, 1.0, 14); for (const y of [0.2, 0.8]) cy(g, iron, -3.6, y, zf + 0.7, 0.37, 0.04, 14);
    return centred(finish(g, 21, [mergeInto(lamps, lampM, false), mergeInto(gl, C.glassM(0xa9cbd8), false)]), 0.15, -0.3);
  }
  reg('building', 'loggerHut', buildHut);

  // ================================================================== ПРУД
  /** накопитель треугольников с вершинными цветами (для камней, камыша, листьев) */
  function Acc() { this.p = []; this.n = []; this.c = []; }
  Acc.prototype.geo = function (geo, mtx, colorFn) {
    const pa = geo.attributes.position, na = geo.attributes.normal, idx = geo.index, nm = new T.Matrix3().getNormalMatrix(mtx), v = new T.Vector3(), n = new T.Vector3(), col = [], cnt = pa.count;
    for (let i = 0; i < cnt; i++) { v.fromBufferAttribute(pa, i); n.fromBufferAttribute(na, i); const c = colorFn(v.clone(), n.clone(), i); v.applyMatrix4(mtx); n.applyMatrix3(nm).normalize(); col.push([v.x, v.y, v.z, n.x, n.y, n.z, c[0], c[1], c[2]]); }
    const order = idx ? Array.from(idx.array) : Array.from({ length: cnt }, (_, i) => i);
    for (const i of order) { const q = col[i]; this.p.push(q[0], q[1], q[2]); this.n.push(q[3], q[4], q[5]); this.c.push(q[6], q[7], q[8]); }
  };
  Acc.prototype.tri = function (a, b, c, n, ca, cb, cc) { for (const [v, cl] of [[a, ca], [b, cb], [c, cc]]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(cl[0], cl[1], cl[2]); } };
  Acc.prototype.mesh = function (material) {
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    const m = new T.Mesh(geo, material); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const lerpRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function keyLerp(keys, s, fn) { if (s <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) { const t = smooth((s - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])); return fn(keys[i - 1][1], keys[i][1], t); } return keys[keys.length - 1][1]; }

  function buildPond() {
    const RX = 27, RZ = 21, NA = 72, R = lcg(5151), WL = 0.12;
    const go = (a) => clamp(0.935 + 0.17 * (0.5 * pn(a, 3, 3) + 0.32 * pn(a, 7, 7) + 0.18 * pn(a, 15, 5) - 0.5), 0.8, 0.984);
    const bw = (a) => 0.105 + 0.06 * (pn(a, 6, 21) - 0.5);
    const at = (a, f) => [Math.cos(a) * RX * f, Math.sin(a) * RZ * f];
    const KY = [[0, 0.012], [0.15, 0.09], [0.4, 0.26], [0.62, 0.19], [0.8, 0.125], [0.9, 0.085], [1.0, 0.05]];
    const profY = (s) => keyLerp(KY, s, (a, b, t) => lerp(a, b, t));
    const bankY = (s, x, z) => { const nz = ((vn(x * 0.17 + 3.1, z * 0.17 - 2.2) - 0.5) * 0.09 + (vn(x * 0.8, z * 0.8) - 0.5) * 0.03) * smooth(clamp(s / 0.2, 0, 1)); return Math.max(0.012, profY(s) + nz); };
    const CK = [[0, hexRGB(0x4f7a35)], [0.1, hexRGB(0x58803a)], [0.22, hexRGB(0x76804a)], [0.38, hexRGB(0x938867)], [0.52, hexRGB(0x7d6c4d)], [0.68, hexRGB(0x5d4a31)], [0.8, hexRGB(0x3d3023)], [0.92, hexRGB(0x2f2c20)], [1.0, hexRGB(0x252d22)]];
    const bankCol = (s, a, x, z) => {
      let c = keyLerp(CK, s, lerpRGB); const m = 0.66 * (0.82 + 0.34 * vn(x * 0.5 + 7, z * 0.5) + (vn(x * 2.2, z * 2.2) - 0.5) * 0.18);
      const moss = smooth(clamp((pn(a, 11, 77) - 0.45) * 4, 0, 1)) * smooth(clamp((s - 0.45) / 0.3, 0, 1)) * (1 - smooth(clamp((s - 0.85) / 0.15, 0, 1))); if (moss > 0) c = lerpRGB(c, hexRGB(0x5b7233), moss * 0.55);
      return [c[0] * m, c[1] * m, c[2] * m];
    };
    const sRing = [0, 0.06, 0.13, 0.21, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.84, 0.92, 1.0], iF = [0.8, 0.6, 0.4, 0.2];
    // --- берег и дно: один меш с вершинными цветами и прозрачным внешним краем
    const pos = [], col = [], idx = [], ringStart = [];
    const pushV = (x, y, z, c, alpha) => { pos.push(x, y, z); col.push(c[0], c[1], c[2], alpha); };
    for (const s of sRing) {
      ringStart.push(pos.length / 3);
      for (let i = 0; i < NA; i++) { const a = (i / NA) * TAU, f = go(a) - s * bw(a), [x, z] = at(a, f); pushV(x, bankY(s, x, z), z, bankCol(s, a, x, z), s < 0.001 ? 0 : clamp(0.15 + s / 0.1, 0, 1)); }
    }
    iF.forEach((u, k) => {
      ringStart.push(pos.length / 3);
      for (let i = 0; i < NA; i++) { const a = (i / NA) * TAU, f = (go(a) - bw(a)) * u, [x, z] = at(a, f), y = lerp(0.05, 0.032, (k + 1) / (iF.length + 1)) + (vn(x * 0.4, z * 0.4) - 0.5) * 0.012, c = lerpRGB(hexRGB(0x2c3528), hexRGB(0x1c2620), (k + 1) / iF.length), m = 0.9 + 0.2 * vn(x * 0.6 + 3, z * 0.6); pushV(x, y, z, [c[0] * m, c[1] * m, c[2] * m], 1); }
    });
    const cIdx = pos.length / 3; pushV(0, 0.03, 0, hexRGB(0x182019), 1);
    const nR = ringStart.length;
    for (let r = 0; r < nR - 1; r++) for (let i = 0; i < NA; i++) { const a0 = ringStart[r] + i, a1 = ringStart[r] + (i + 1) % NA, b0 = ringStart[r + 1] + i, b1 = ringStart[r + 1] + (i + 1) % NA; idx.push(a0, a1, b0, a1, b1, b0); }
    for (let i = 0; i < NA; i++) idx.push(ringStart[nR - 1] + i, ringStart[nR - 1] + (i + 1) % NA, cIdx);
    const bgeo = new T.BufferGeometry(); bgeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bgeo.setAttribute('color', new T.Float32BufferAttribute(col, 4)); bgeo.setIndex(idx); bgeo.computeVertexNormals();
    const bank = new T.Mesh(bgeo, new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: true, side: T.DoubleSide })); bank.renderOrder = 1; bank.receiveShadow = true; bank.name = 'bank';
    // --- вода: ряды от уреза к центру, цвет темнее к центру, прозрачнее у берега
    const wpos = [], wuv = [], wcol = [], wnor = [], widx = [], wRing = [], sW = 0.84, wF = [1, 0.84, 0.66, 0.48, 0.3, 0.14];
    const deep = hexRGB(0x0b2e30), shallow = hexRGB(0x426f5c);
    wF.forEach((u, k) => {
      wRing.push(wpos.length / 3);
      for (let i = 0; i < NA; i++) {
        const a = (i / NA) * TAU, fe = go(a) - sW * bw(a), [x, z] = at(a, fe * u), t = k / (wF.length - 1), c = lerpRGB(shallow, deep, smooth(clamp(t * 1.15, 0, 1))), m = 0.94 + 0.12 * vn(x * 0.12 + 5, z * 0.12);
        wpos.push(x, WL, z); wuv.push(x / 4.5, z / 4.5); wcol.push(c[0] * m, c[1] * m, c[2] * m, lerp(0.4, 0.98, smooth(clamp(t * 2.2, 0, 1))));
        const nx = (vn(x * 0.35 + 11, z * 0.35) - 0.5) * 0.07, nz = (vn(x * 0.35, z * 0.35 + 17) - 0.5) * 0.07, nl = Math.sqrt(1 + nx * nx + nz * nz); wnor.push(nx / nl, 1 / nl, nz / nl);
      }
    });
    const wc = wpos.length / 3; wpos.push(0, WL, 0); wuv.push(0, 0); wcol.push(deep[0] * 0.9, deep[1] * 0.9, deep[2] * 0.9, 0.98); wnor.push(0, 1, 0);
    for (let r = 0; r < wRing.length - 1; r++) for (let i = 0; i < NA; i++) { const a0 = wRing[r] + i, a1 = wRing[r] + (i + 1) % NA, b0 = wRing[r + 1] + i, b1 = wRing[r + 1] + (i + 1) % NA; widx.push(a0, b0, a1, a1, b0, b1); }
    for (let i = 0; i < NA; i++) widx.push(wRing[wRing.length - 1] + i, wc, wRing[wRing.length - 1] + (i + 1) % NA);
    const wgeo = new T.BufferGeometry(); wgeo.setAttribute('position', new T.Float32BufferAttribute(wpos, 3)); wgeo.setAttribute('color', new T.Float32BufferAttribute(wcol, 4)); wgeo.setAttribute('normal', new T.Float32BufferAttribute(wnor, 3)); wgeo.setAttribute('uv', new T.Float32BufferAttribute(wuv, 2)); wgeo.setIndex(widx);
    const water = new T.Mesh(wgeo, new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.05, metalness: 0.1, envMapIntensity: 0.95, transparent: true, opacity: 0.88, depthWrite: false, normalMap: CVT('smw_ripple'), normalScale: new T.Vector2(0.22, 0.22) })); water.renderOrder = 3; water.name = 'water'; water.receiveShadow = true;
    // --- камни, тростник, рогоз, кувшинки: один меш с вершинными цветами
    const acc = new T.Group(), A = new Acc(), M4 = new T.Matrix4(), Q = new T.Quaternion(), S3 = new T.Vector3(), P3 = new T.Vector3();
    const shore = (s, a) => { const f = go(a) - s * bw(a), [x, z] = at(a, f); return [x, z, bankY(s, x, z)]; };
    const rockBase = new T.SphereGeometry(1, 6, 4);
    function rock(a, s, rad, tone) {
      const [x, z, y] = shore(s, a), g2 = rockBase.clone(), pa = g2.attributes.position, sd = R() * 50;
      for (let i = 0; i < pa.count; i++) { const vx = pa.getX(i), vy = pa.getY(i), vz = pa.getZ(i), k = 1 + 0.32 * (vn(vx * 1.6 + sd, vz * 1.6 + vy * 1.3) - 0.5) * 2; pa.setXYZ(i, vx * k, vy * k * 0.66, vz * k); }
      g2.computeVertexNormals();
      M4.compose(P3.set(x, y + rad * 0.12, z), Q.setFromEuler(new T.Euler((R() - 0.5) * 0.4, R() * TAU, (R() - 0.5) * 0.4)), S3.set(rad * (0.9 + R() * 0.4), rad * (0.8 + R() * 0.3), rad * (0.9 + R() * 0.4)));
      const base = tone[R() * tone.length | 0], vv = 0.85 + R() * 0.3;
      A.geo(g2, M4, (v, n, i) => { const m = vv * (0.8 + 0.3 * vn(v.x * 3 + sd, v.z * 3)), moss = smooth(clamp((-v.y + 0.1) * 2.2, 0, 1)) * 0.7; const b = hexRGB(base), c = lerpRGB([b[0] * m, b[1] * m, b[2] * m], hexRGB(0x4f6a30), moss * 0.5 * (0.5 + 0.5 * n.y * -1)); return c; });
    }
    const tones = [0x8a8a84, 0x7a7a74, 0x9a968a, 0x6f6e68, 0xa49e90];
    for (let i = 0; i < 6; i++) rock((i + R() * 0.7) / 6 * TAU, 0.55 + R() * 0.4, 0.55 + R() * 0.4, tones);
    for (let i = 0; i < 14; i++) rock(R() * TAU, 0.45 + R() * 0.5, 0.25 + R() * 0.25, tones);
    for (let i = 0; i < 9; i++) rock(R() * TAU, 0.3 + R() * 0.65, 0.1 + R() * 0.14, tones);
    // лезвия тростника
    const Gb = [hexRGB(0x4a6a2c), hexRGB(0x78a042), hexRGB(0xb5c25e)], Gy = [hexRGB(0x5a6a2a), hexRGB(0xa0b04a), hexRGB(0xd6c872)];
    function blade(x, y, z, h, wd, lx, lz, phi, pal, nrm) {
      const wx = Math.cos(phi), wz = Math.sin(phi), ts = [0, 0.4, 0.75, 1], ws = [1, 0.92, 0.55, 0], pts = ts.map((t, i) => ({ p: [x + lx * t * t, y + h * t * (1 - 0.1 * t), z + lz * t * t], w: wd * ws[i] * 0.5, c: t < 0.5 ? lerpRGB(pal[0], pal[1], t / 0.5) : lerpRGB(pal[1], pal[2], (t - 0.5) / 0.5) }));
      const nv = (() => { const nx0 = -wz, nz0 = wx, l = Math.hypot(0.5, 1); return [nx0 * 0.4 / l, 1 / l * 0.92, nz0 * 0.4 / l]; })();
      for (let i = 0; i < 3; i++) {
        const a = pts[i], b = pts[i + 1], la = [a.p[0] - wx * a.w, a.p[1], a.p[2] - wz * a.w], ra = [a.p[0] + wx * a.w, a.p[1], a.p[2] + wz * a.w], lb = [b.p[0] - wx * b.w, b.p[1], b.p[2] - wz * b.w], rb = [b.p[0] + wx * b.w, b.p[1], b.p[2] + wz * b.w];
        A.tri(la, ra, lb, nv, a.c, a.c, b.c); if (i < 2) A.tri(ra, rb, lb, nv, a.c, b.c, b.c);
      }
    }
    function reedCluster(a, s, n, hMin, hMax, spread, cattail) {
      const [cx, cz, cyy] = shore(s, a), dirA = a + PI;
      for (let i = 0; i < n; i++) {
        const ang = R() * TAU, d = Math.sqrt(R()) * spread, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d, h = hMin + R() * (hMax - hMin);
        const lean = 0.12 + R() * 0.5, lx = (Math.cos(R() * TAU) * 0.6 + Math.cos(dirA) * 0.3) * lean * h * 0.4, lz = (Math.sin(R() * TAU) * 0.6 + Math.sin(dirA) * 0.3) * lean * h * 0.4;
        blade(x, Math.max(0.03, cyy - 0.04), z, h, cattail ? 0.07 : 0.045 + R() * 0.02, lx, lz, R() * PI, R() < 0.25 ? Gy : Gb);
      }
    }
    const clusterAngs = []; for (let i = 0; i < 34; i++) { let a, tries = 0; do { a = R() * TAU; tries++; } while (pn(a, 7, 41) < 0.42 && tries < 12); clusterAngs.push(a); }
    clusterAngs.forEach((a, i) => reedCluster(a, 0.72 + R() * 0.2, 10 + (R() * 5 | 0), 1.2, 2.5, 0.6 + R() * 0.5, false));
    // рогоз: стебель + коричневый початок
    function cattail(a, s) {
      const [cx, cz, cyy] = shore(s, a); const n = 3 + (R() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const x = cx + (R() - 0.5) * 1.1, z = cz + (R() - 0.5) * 1.1, h = 1.3 + R() * 0.8, lx = (R() - 0.5) * 0.4, lz = (R() - 0.5) * 0.4, y0 = Math.max(0.03, cyy - 0.04);
        blade(x, y0, z, h * 0.55, 0.06, lx * 0.2, lz * 0.2, R() * PI, Gb); blade(x + 0.02, y0, z, h * 0.7, 0.06, -lx * 0.3, lz * 0.3, R() * PI, Gb);
        const tx = x + lx, tz = z + lz, ty = y0 + h;
        A.geo(new T.CylinderGeometry(0.012, 0.012, h, 4, 1, true), M4.compose(P3.set(x + lx * 0.5, y0 + h / 2, z + lz * 0.5), Q.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(lx, h, lz).normalize()), S3.set(1, 1, 1)), () => hexRGB(0x6c8a3c));
        A.geo(new T.CylinderGeometry(0.036, 0.034, 0.24, 6, 1), M4.compose(P3.set(tx, ty - 0.1, tz), Q.identity(), S3.set(1, 1, 1)), (v) => lerpRGB(hexRGB(0x4a2f1c), hexRGB(0x6b4328), 0.5 + v.y * 2));
        A.geo(new T.ConeGeometry(0.014, 0.16, 4, 1), M4.compose(P3.set(tx, ty + 0.1, tz), Q.identity(), S3.set(1, 1, 1)), () => hexRGB(0x7c8a3a));
      }
    }
    for (let i = 0; i < 9; i++) { let a, tries = 0; do { a = R() * TAU; tries++; } while (pn(a, 7, 41) < 0.35 && tries < 12); cattail(a, 0.76 + R() * 0.16); }
    // кувшинки с цветами
    const padG = new T.CircleGeometry(1, 12, 0.35, TAU - 0.5); padG.rotateX(-PI / 2);
    function padGroup(a, f, n, spread) {
      const [cx, cz] = at(a, f);
      for (let i = 0; i < n; i++) {
        const x = cx + (R() - 0.5) * spread, z = cz + (R() - 0.5) * spread, rad = 0.22 + R() * 0.24, cc = lerpRGB(hexRGB(0x3c6b2c), hexRGB(0x5d8f3c), R());
        M4.compose(P3.set(x, WL + 0.012 + R() * 0.006, z), Q.setFromEuler(new T.Euler(0, R() * TAU, 0)), S3.set(rad, 1, rad));
        A.geo(padG, M4, (v) => { const k = 0.9 + 0.2 * Math.hypot(v.x, v.z); return [cc[0] * k, cc[1] * k, cc[2] * k]; });
        if (R() < 0.3) {
          const fx = x + (R() - 0.5) * 0.2, fz = z + (R() - 0.5) * 0.2, fy = WL + 0.03;
          for (let k = 0; k < 8; k++) { const a1 = k / 8 * TAU, a2 = (k + 1) / 8 * TAU, ar = (a1 + a2) / 2; A.tri([fx + Math.cos(a1) * 0.04, fy, fz + Math.sin(a1) * 0.04], [fx + Math.cos(a2) * 0.04, fy, fz + Math.sin(a2) * 0.04], [fx + Math.cos(ar) * 0.11, fy + 0.07, fz + Math.sin(ar) * 0.11], [Math.cos(ar) * 0.6, 0.8, Math.sin(ar) * 0.6], hexRGB(0xf3f0e6), hexRGB(0xf3f0e6), hexRGB(0xffffff)); }
          for (let k = 0; k < 5; k++) { const a1 = k / 5 * TAU + 0.3, a2 = (k + 1) / 5 * TAU + 0.3, ar = (a1 + a2) / 2; A.tri([fx + Math.cos(a1) * 0.025, fy + 0.02, fz + Math.sin(a1) * 0.025], [fx + Math.cos(a2) * 0.025, fy + 0.02, fz + Math.sin(a2) * 0.025], [fx + Math.cos(ar) * 0.05, fy + 0.1, fz + Math.sin(ar) * 0.05], [Math.cos(ar) * 0.3, 0.9, Math.sin(ar) * 0.3], hexRGB(0xfff7d0), hexRGB(0xfff7d0), hexRGB(0xf5d44e)); }
        }
      }
    }
    padGroup(2.2, 0.55, 6, 3.4); padGroup(3.0, 0.7, 4, 2.2); padGroup(5.4, 0.62, 4, 2.4);
    const props = A.mesh(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
    // плавающие брёвна
    const logsG = new T.Group(), pondLogM = tm('smw_log', null, 0x8f8070);
    for (const [a, f, len, ry] of [[0.6, 0.55, 3.6, 0.7], [4.1, 0.5, 2.8, 2.4]]) { const [x, z] = at(a, f * (go(a) - sW * bw(a))), o = add(logsG, logGeo(0.2, 0.17, len, 10, 2, R), pondLogM, x, WL - 0.04, z, 0, ry, 0); o.rotation.set(0, ry, PI / 2 + 0.05); o.rotation.order = 'YXZ'; }
    const out = new T.Group(); out.add(bank); out.add(props); out.add(logsG); out.add(water);
    return out;
  }
  reg('prop', 'pond', buildPond);
})();
