/* Процедурные модели зданий (kind 'building'). Three.js r128, без внешних файлов.
   Перед = +Z, начало координат = центр основания на земле, 1 единица ≈ 1 м. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, part = C.part;

  // ------------------------------------------------------------------ утилиты
  function lcg(seed) { let s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const shade = (c, f) => { const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f); return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b); };
  const mix = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
  const V3 = (x, y, z) => new T.Vector3(x, y, z);

  // ------------------------------------------------------------------ текстуры (серые/цветные, тонируются материалом)
  const TILE = {}; // размер одного тайла в метрах
  function defTex(name, su, sv, size, draw) { TILE[name] = [su, sv]; C.addProc(name, (cv, g) => draw(cv, g, size || 256), size || 256); }
  const rgb = (r, g, b, a) => a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  function wrap9(size, x, y, rad, fn) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx * size, Y = y + dy * size; if (X + rad < 0 || Y + rad < 0 || X - rad > size || Y - rad > size) continue; fn(X, Y); } }

  defTex('bld_plaster', 2.5, 2.5, 256, (cv, g, S) => {
    const r = lcg(11); g.fillStyle = '#f3eee2'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 20; i++) { const x = r() * S, y = r() * S, rad = 22 + r() * 50, a = 0.05 + r() * 0.07; wrap9(S, x, y, rad, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, rgb(150, 130, 95, a)); gr.addColorStop(1, rgb(150, 130, 95, 0)); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); }); }
    for (let i = 0; i < 2800; i++) { const a = r() * 0.09; g.fillStyle = r() < 0.7 ? rgb(110, 95, 70, a) : rgb(255, 255, 255, a * 2); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  });
  defTex('bld_planks', 2.4, 2.4, 256, (cv, g, S) => {
    const r = lcg(23), n = 10, w = S / n;
    for (let i = 0; i < n; i++) {
      const L = 0.76 + r() * 0.22; g.fillStyle = rgb(L * 255, L * 244, L * 232); g.fillRect(i * w, 0, w, S);
      for (let k = 0; k < 12; k++) { const x = i * w + 2 + r() * (w - 4), a = 0.05 + r() * 0.15, ph = r() * 6; g.strokeStyle = rgb(40, 28, 18, a); g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * 0.04 + ph) * 1.4, y); g.stroke(); }
      if (r() < 0.5) { const kx = i * w + w * (0.3 + r() * 0.4), ky = r() * S; g.fillStyle = rgb(50, 34, 20, 0.35); g.beginPath(); g.ellipse(kx, ky, 3, 6, 0, 0, 6.3); g.fill(); }
      g.fillStyle = rgb(15, 8, 4, 0.8); g.fillRect(i * w + w - 2, 0, 2, S); g.fillStyle = rgb(255, 245, 230, 0.22); g.fillRect(i * w, 0, 1.5, S);
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = rgb(30, 20, 10, r() * 0.06); g.fillRect(r() * S, r() * S, 1, 3 + r() * 8); }
  });
  defTex('bld_tile', 2.4, 2.4, 256, (cv, g, S) => {
    const r = lcg(31), rows = 8, th = S / rows, tw = S / 8;
    for (let row = 0; row < rows; row++) for (let c = -1; c < 9; c++) {
      const x = c * tw + (row % 2) * tw / 2, y = row * th, L = 0.76 + r() * 0.22;
      g.fillStyle = rgb(L * 255, L * 251, L * 247); g.fillRect(x + 0.5, y, tw - 1, th);
      const gr = g.createLinearGradient(0, y, 0, y + th); gr.addColorStop(0, rgb(0, 0, 0, 0.30)); gr.addColorStop(0.45, rgb(255, 255, 255, 0.04)); gr.addColorStop(0.85, rgb(255, 255, 255, 0.10)); gr.addColorStop(1, rgb(0, 0, 0, 0.5));
      g.fillStyle = gr; g.fillRect(x + 0.5, y, tw - 1, th);
      g.fillStyle = rgb(0, 0, 0, 0.30); g.fillRect(x, y, 1.6, th); g.fillStyle = rgb(255, 255, 255, 0.09); g.fillRect(x + tw * 0.3, y, tw * 0.4, th);
    }
    for (let i = 0; i < 500; i++) { g.fillStyle = rgb(30, 20, 10, r() * 0.07); g.fillRect(r() * S, r() * S, 2, 2); }
  });
  defTex('bld_seam', 2.0, 2.0, 256, (cv, g, S) => {
    const r = lcg(41), n = 4, w = S / n;
    for (let i = 0; i < n; i++) {
      const L = 0.80 + r() * 0.10; g.fillStyle = rgb(L * 255, L * 255, L * 255); g.fillRect(i * w, 0, w, S);
      const gr = g.createLinearGradient(i * w, 0, i * w + w, 0); gr.addColorStop(0, rgb(255, 255, 255, 0.12)); gr.addColorStop(0.5, rgb(0, 0, 0, 0.02)); gr.addColorStop(1, rgb(0, 0, 0, 0.12)); g.fillStyle = gr; g.fillRect(i * w, 0, w, S);
      g.fillStyle = rgb(255, 255, 255, 0.55); g.fillRect(i * w + w - 7, 0, 3, S); g.fillStyle = rgb(0, 0, 0, 0.55); g.fillRect(i * w + w - 4, 0, 4, S); g.fillStyle = rgb(0, 0, 0, 0.25); g.fillRect(i * w, 0, 2, S);
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = rgb(0, 0, 0, r() * 0.07); g.fillRect(r() * S, r() * S, 1, 4 + r() * 14); }
    g.fillStyle = rgb(0, 0, 0, 0.4); g.fillRect(0, 0, S, 2);
  });
  defTex('bld_corr', 1.6, 2.0, 256, (cv, g, S) => {
    const r = lcg(53), n = 8, w = S / n;
    for (let x = 0; x < S; x++) { const s = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2); const L = 0.52 + 0.46 * s; g.fillStyle = rgb(L * 255, L * 255, L * 255); g.fillRect(x, 0, 1, S); }
    for (let i = 0; i < 1100; i++) { g.fillStyle = r() < 0.5 ? rgb(60, 40, 25, r() * 0.10) : rgb(255, 255, 255, r() * 0.08); g.fillRect(r() * S, r() * S, 1 + r() * 2, 6 + r() * 24); }
    g.fillStyle = rgb(0, 0, 0, 0.35); g.fillRect(0, 0, S, 2); g.fillStyle = rgb(255, 255, 255, 0.25); g.fillRect(0, 2, S, 2);
  });
  defTex('bld_silo', 2.0, 2.56, 256, (cv, g, S) => {
    const r = lcg(61), n = 8, h = S / n;
    for (let y = 0; y < S; y++) { const s = 0.5 + 0.5 * Math.sin((y / h) * Math.PI * 2); const L = 0.62 + 0.36 * s; g.fillStyle = rgb(L * 255, L * 255, L * 255); g.fillRect(0, y, S, 1); }
    for (let i = 0; i < 4; i++) { const x = i * (S / 4); g.fillStyle = rgb(0, 0, 0, 0.30); g.fillRect(x, 0, 2, S); g.fillStyle = rgb(255, 255, 255, 0.25); g.fillRect(x + 2, 0, 1, S); for (let y = 6; y < S; y += h) { g.fillStyle = rgb(0, 0, 0, 0.55); g.fillRect(x + 4, y, 2, 2); } }
    for (let i = 0; i < 700; i++) { g.fillStyle = rgb(70, 60, 40, r() * 0.07); g.fillRect(r() * S, r() * S, 1 + r() * 2, 5 + r() * 20); }
  });
  defTex('bld_brick', 2.0, 1.28, 256, (cv, g, S) => {
    const r = lcg(71), cols = 8, rows = 16, bw = S / cols, bh = S / rows;
    g.fillStyle = '#c4baa8'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) for (let c = -1; c < cols + 1; c++) {
      const x = c * bw + (row % 2) * bw / 2, y = row * bh, k = (r() - 0.5) * 36, d = r() < 0.08 ? -26 : 0;
      g.fillStyle = rgb(158 + k + d, 78 + k * 0.6 + d * 0.6, 60 + k * 0.5 + d * 0.5); g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      g.fillStyle = rgb(255, 235, 210, 0.10); g.fillRect(x + 1, y + 1, bw - 2, 2); g.fillStyle = rgb(0, 0, 0, 0.12); g.fillRect(x + 1, y + bh - 3, bw - 2, 2);
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = rgb(40, 25, 15, r() * 0.08); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  });
  defTex('bld_stone', 2.0, 2.0, 256, (cv, g, S) => {
    const r = lcg(83), rows = 4, bh = S / rows;
    g.fillStyle = '#8c887c'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) {
      let x = -(r() * 60), y = row * bh;
      while (x < S) {
        const w = 70 + r() * 90, L = 0.84 + r() * 0.14; g.fillStyle = rgb(L * 240, L * 234, L * 220); g.fillRect(x + 1.5, y + 1.5, w - 3, bh - 3);
        g.fillStyle = rgb(255, 255, 255, 0.12); g.fillRect(x + 1.5, y + 1.5, w - 3, 3); g.fillStyle = rgb(0, 0, 0, 0.10); g.fillRect(x + 1.5, y + bh - 5, w - 3, 3.5); x += w;
      }
    }
    for (let i = 0; i < 1200; i++) { g.fillStyle = rgb(60, 55, 45, r() * 0.10); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  });
  defTex('bld_roller', 1.6, 1.6, 256, (cv, g, S) => {
    const n = 16, h = S / n;
    for (let i = 0; i < n; i++) { const y = i * h; g.fillStyle = rgb(215, 215, 215); g.fillRect(0, y, S, h); g.fillStyle = rgb(255, 255, 255, 0.9); g.fillRect(0, y, S, 3); g.fillStyle = rgb(120, 120, 120); g.fillRect(0, y + h - 5, S, 3); g.fillStyle = rgb(40, 40, 40, 0.8); g.fillRect(0, y + h - 2, S, 2); }
    const r = lcg(97); for (let i = 0; i < 400; i++) { g.fillStyle = rgb(0, 0, 0, r() * 0.06); g.fillRect(r() * S, r() * S, 1, 3 + r() * 6); }
  });
  defTex('bld_stripe', 1.4, 1.4, 128, (cv, g, S) => {
    const r = lcg(101), n = 4, w = S / n;
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#f0e6d0' : '#b53e2e'; g.fillRect(i * w, 0, w, S); }
    for (let i = 0; i < 500; i++) { g.fillStyle = rgb(0, 0, 0, r() * 0.06); g.fillRect(r() * S, r() * S, 1, 2 + r() * 5); }
  });
  defTex('bld_hay', 0.9, 0.9, 128, (cv, g, S) => {
    const r = lcg(113); g.fillStyle = '#d8b358'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 380; i++) { const L = r(); g.strokeStyle = L < 0.5 ? rgb(150, 110, 40, 0.5) : rgb(245, 215, 120, 0.6); g.lineWidth = 1; const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + r() * 24, y + (r() - 0.5) * 3); g.stroke(); }
    g.fillStyle = rgb(60, 40, 20, 0.85); g.fillRect(S * 0.28, 0, 3, S); g.fillRect(S * 0.7, 0, 3, S);
  });
  defTex('bld_conc', 3.0, 3.0, 128, (cv, g, S) => {
    const r = lcg(127); g.fillStyle = '#cfcfca'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? rgb(90, 90, 85, r() * 0.12) : rgb(255, 255, 250, r() * 0.14); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
    g.strokeStyle = rgb(70, 70, 65, 0.3); g.lineWidth = 1; g.strokeRect(0.5, 0.5, S - 1, S - 1);
  });
  defTex('bld_burlap', 0.5, 0.5, 64, (cv, g, S) => {
    const r = lcg(131); g.fillStyle = '#cdb98c'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 3) { g.fillStyle = rgb(120, 95, 55, 0.22); g.fillRect(i, 0, 1, S); g.fillRect(0, i, S, 1); }
    for (let i = 0; i < 160; i++) { g.fillStyle = rgb(255, 245, 210, r() * 0.2); g.fillRect(r() * S, r() * S, 2, 1); }
  });

  // ------------------------------------------------------------------ геометрические помощники
  function tmat(name, tint, extra) { return C.texMat(name, 1, 1, tint, 0, 0, 0, Object.assign({ color: tint }, extra || {})); }
  const surf = (tex, tint) => ({ tex, tint: tint == null ? 0xffffff : tint });
  const UVF = [['d', 'h'], ['d', 'h'], ['w', 'd'], ['w', 'd'], ['w', 'h'], ['w', 'h']];
  function boxGeoUV(w, h, d, tex) {
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, s = TILE[tex] || [1, 1], dm = { w, h, d };
    for (let f = 0; f < 6; f++) { const a = UVF[f][0], b = UVF[f][1]; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dm[a] / s[0], uv.getY(i) * dm[b] / s[1]); } }
    return g;
  }
  function mkBox(spec, w, h, d) {
    if (typeof spec === 'number') return part('box', spec, 0, 0, 0, w, h, d);
    const m = new T.Mesh(boxGeoUV(w, h, d, spec.tex), tmat(spec.tex, spec.tint)); m.castShadow = m.receiveShadow = true; return m;
  }
  function B(g, spec, x, y, z, w, h, d, rx, ry, rz) { const m = mkBox(spec, w, h, d); m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); g.add(m); return m; }
  const cylU = {};
  function Y(g, col, x, y, z, r, h, seg, rx, ry, rz) { // цилиндр, ось Y
    seg = seg || 12; const geo = cylU[seg] || (cylU[seg] = new T.CylinderGeometry(0.5, 0.5, 1, seg));
    const m = new T.Mesh(geo, C.mat(col)); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = m.receiveShadow = true; g.add(m); return m;
  }
  const cylT = {};
  function CT(g, col, x, y, z, rb, rt, h, seg, rx, ry, rz) { // усечённый конус
    seg = seg || 12; const k = [rb, rt, h, seg].join('|'); const geo = cylT[k] || (cylT[k] = new T.CylinderGeometry(rt, rb, h, seg));
    const m = new T.Mesh(geo, C.mat(col)); m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = m.receiveShadow = true; g.add(m); return m;
  }
  let icoG = null;
  function blob(g, col, x, y, z, sx, sy, sz) { icoG = icoG || new T.IcosahedronGeometry(0.5, 0); const m = new T.Mesh(icoG, C.mat(col)); m.position.set(x, y, z); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
  function orient(m, X, Y, Z) { m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z)); }
  /** Брус между точками a и b: сечение t1 (в плоскости, по «up» × ось) и t2. */
  function beam(g, spec, a, b, t1, t2, up) {
    const A = V3(a[0], a[1], a[2]), Bp = V3(b[0], b[1], b[2]), d = Bp.clone().sub(A), len = d.length(), Z = d.clone().normalize();
    let U = up ? V3(up[0], up[1], up[2]) : V3(0, 1, 0); if (Math.abs(Z.dot(U)) > 0.98) U = V3(0, 0, 1);
    const X = U.clone().cross(Z).normalize(), Yv = Z.clone().cross(X).normalize();
    const m = mkBox(spec, t1, t2, len); m.position.copy(A.clone().add(Bp).multiplyScalar(0.5)); orient(m, X, Yv, Z); g.add(m); return m;
  }
  /** Плита (кровельный скат): верхняя поверхность проходит через p1-p2 по оси ската, wdir — направление ширины. */
  function slab3(g, spec, p1, p2, wdir, width, thick) {
    const A = V3(p1[0], p1[1], p1[2]), Bp = V3(p2[0], p2[1], p2[2]), d = Bp.clone().sub(A), len = d.length(), Zs = d.clone().normalize(), X = V3(wdir[0], wdir[1], wdir[2]).normalize();
    let N = X.clone().cross(Zs).normalize(); if (N.y < 0) N.multiplyScalar(-1);
    const Zv = X.clone().cross(N).normalize(), m = mkBox(spec, width, thick, len);
    m.position.copy(A.clone().add(Bp).multiplyScalar(0.5).sub(N.clone().multiplyScalar(thick / 2))); orient(m, X, N, Zv); g.add(m); return m;
  }
  /** Плоский многоугольник (в локальной плоскости XY, лицом к +Z), потом поворот по Y и сдвиг. UV — в метрах. */
  function facePoly(g, spec, pts, x, y, z, ry) {
    const sh = new T.Shape(pts.map((p) => new T.Vector2(p[0], p[1]))), geo = new T.ShapeGeometry(sh);
    let m;
    if (typeof spec === 'number') m = new T.Mesh(geo, C.mat(spec));
    else { const s = TILE[spec.tex] || [1, 1], uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s[0], uv.getY(i) / s[1]); m = new T.Mesh(geo, tmat(spec.tex, spec.tint)); }
    m.position.set(x, y, z); m.rotation.y = ry || 0; m.castShadow = m.receiveShadow = true; g.add(m); return m;
  }
  /** Склейка всего содержимого группы в один Mesh с заданным материалом (стекло, лампочки). */
  function mergeInto(group, material, shadow) {
    group.updateMatrixWorld(true);
    const pos = [], nor = [], v = V3(0, 0, 0), n = V3(0, 0, 0), nm = new T.Matrix3();
    group.traverse((o) => {
      if (!o.isMesh) return; let gg = o.geometry; if (gg.index) gg = gg.toNonIndexed();
      const pa = gg.attributes.position, na = gg.attributes.normal; nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); }
    });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const m = new T.Mesh(geo, material); m.castShadow = !!shadow; m.receiveShadow = false; return m;
  }
  const glassMat = new T.MeshLambertMaterial({ color: 0xcfe6ea, transparent: true, opacity: 0.34, depthWrite: false, side: T.FrontSide });
  const glassMatDS = new T.MeshLambertMaterial({ color: 0xcfe6ea, transparent: true, opacity: 0.34, depthWrite: false, side: T.DoubleSide });
  const bulbMat = new T.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc94a, emissiveIntensity: 0.95 });
  const bulbMatB = new T.MeshLambertMaterial({ color: 0xffb0c8, emissive: 0xff5f8e, emissiveIntensity: 0.8 });
  const bulbMatC = new T.MeshLambertMaterial({ color: 0xbfe9ff, emissive: 0x4fc4ff, emissiveIntensity: 0.8 });
  const lampMat = new T.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd36b, emissiveIntensity: 0.9 });
  /** Запекает основной слой (детерминированно) и добавляет прозрачные/светящиеся части. */
  function finish(main, seed, extras) {
    const out = new T.Group(), old = Math.random; Math.random = lcg(seed || 7);
    try { out.add(C.bakeTex(main)); } finally { Math.random = old; }
    (extras || []).forEach((e) => e && out.add(e));
    return out;
  }
  function reg(name, fn) { FM.register('building', name, fn); }
  const optsOf = (o) => { o = o || {}; const v = (o.variant | 0), seed = (o.seed | 0); return { v, seed, rnd: lcg(seed * 97 + v * 31 + 5) }; };

  // ------------------------------------------------------------------ общие детали
  const WHITE = 0xf1ede2, TIMBER = 0x4f3524, PLASTER = 0xeee4cf, ROOFRED = 0xe0603f;
  const PLINTH = surf('bld_stone', 0x8f8b82);

  /** Окно, лицом к +Z, начало = низ-центр на поверхности стены. */
  function windowUnit(o) {
    const g = new T.Group(), w = o.w, h = o.h, f = o.frame != null ? o.frame : WHITE, ft = o.ft || 0.07, mull = o.mull || 'cross';
    B(g, o.glass != null ? o.glass : 0x4f6a7a, 0, h / 2, 0.02, w - ft, h - ft, 0.04);
    B(g, f, 0, h - ft / 2, 0.05, w, ft, 0.1); B(g, f, 0, ft / 2, 0.05, w, ft, 0.1); B(g, f, -w / 2 + ft / 2, h / 2, 0.05, ft, h, 0.1); B(g, f, w / 2 - ft / 2, h / 2, 0.05, ft, h, 0.1);
    if (mull === 'cross' || mull === 'v') B(g, f, 0, h / 2, 0.06, 0.045, h - ft, 0.07);
    if (mull === 'cross') B(g, f, 0, h * 0.6, 0.06, w - ft, 0.045, 0.07);
    if (mull === 'grid') { B(g, f, -w / 6, h / 2, 0.06, 0.035, h - ft, 0.06); B(g, f, w / 6, h / 2, 0.06, 0.035, h - ft, 0.06); B(g, f, 0, h * 0.5, 0.06, w - ft, 0.035, 0.06); }
    B(g, o.sill != null ? o.sill : 0xcfc8b8, 0, -0.03, 0.1, w + 0.2, 0.07, 0.2);
    if (o.lintel != null) B(g, o.lintel, 0, h + 0.08, 0.05, w + 0.3, 0.14, 0.12);
    if (o.shutter != null) for (const s of [-1, 1]) {
      const sw = w * 0.5 - 0.02, sx = s * (w / 2 + sw / 2 + 0.05), sc = o.shutter;
      B(g, sc, sx, h / 2, 0.04, sw, h + 0.04, 0.05);
      for (let k = 0; k < 4; k++) B(g, shade(sc, 0.78), sx, h * (0.14 + k * 0.23), 0.075, sw - 0.06, 0.035, 0.02);
    }
    if (o.box) {
      const bw = w + 0.12, bc = o.boxColor != null ? o.boxColor : 0x6b4a30;
      B(g, bc, 0, -0.17, 0.22, bw, 0.22, 0.26); B(g, shade(bc, 0.8), 0, -0.07, 0.23, bw - 0.04, 0.03, 0.22);
      const cols = o.flowers || [0xc23b2a, 0xd9768a, 0xe6c03a, 0xf2efe6];
      for (let k = 0; k < 5; k++) { const bx = -bw / 2 + 0.14 + k * (bw - 0.28) / 4; blob(g, 0x4a7a3a, bx, -0.02, 0.22, 0.2, 0.16, 0.2); blob(g, cols[k % cols.length], bx + (k % 2 ? 0.04 : -0.04), 0.07, 0.25, 0.12); }
    }
    return g;
  }
  /** Дверь, лицом к +Z, начало = низ-центр. */
  function doorUnit(o) {
    const g = new T.Group(), w = o.w || 1.1, h = o.h || 2.15, c = o.color != null ? o.color : 0x6b4a30, f = o.frame != null ? o.frame : WHITE;
    B(g, c, 0, h / 2, 0.03, w, h, 0.06);
    B(g, f, 0, h + 0.05, 0.05, w + 0.2, 0.12, 0.12); B(g, f, -w / 2 - 0.05, h / 2, 0.05, 0.1, h, 0.12); B(g, f, w / 2 + 0.05, h / 2, 0.05, 0.1, h, 0.12);
    if (o.panels !== false) { for (const s of [-1, 1]) { B(g, shade(c, 1.22), s * w * 0.23, h * 0.28, 0.07, w * 0.34, h * 0.32, 0.03); B(g, shade(c, 1.22), s * w * 0.23, h * 0.72, 0.07, w * 0.34, h * 0.22, 0.03); } }
    if (o.glass) B(g, 0x4f6a7a, 0, h * 0.72, 0.075, w * 0.62, h * 0.22, 0.02);
    blob(g, 0xd4af37, w * 0.36, h * 0.46, 0.1, 0.07);
    B(g, o.step != null ? o.step : 0xa9a498, 0, 0.02, 0.28, w + 0.5, 0.05, 0.5);
    return g;
  }
  function chimney(g, x, z, yb, yt, w, d, brick) {
    B(g, brick, x, (yb + yt) / 2, z, w, yt - yb, d);
    B(g, 0x8a867c, x, yt - 0.2, z, w + 0.12, 0.12, d + 0.12); B(g, 0x8a867c, x, yt + 0.05, z, w + 0.26, 0.14, d + 0.26);
    Y(g, 0xb0583a, x - w * 0.2, yt + 0.32, z, 0.13, 0.4, 8); Y(g, 0xb0583a, x + w * 0.2, yt + 0.3, z, 0.13, 0.36, 8);
  }
  function gutterLine(g, x1, x2, y, z, col) { B(g, col || 0x7d8388, (x1 + x2) / 2, y, z, Math.abs(x2 - x1), 0.09, 0.11); }
  function downpipe(g, x, z, y0, y1, col) { Y(g, col || 0x7d8388, x, (y0 + y1) / 2, z, 0.045, y1 - y0, 6); }
  function shrub(g, x, z, s, c1, c2) { blob(g, c1 || 0x3e6a36, x, s * 0.32, z, s, s * 0.7, s * 0.9); blob(g, c2 || 0x4d7b3e, x + s * 0.28, s * 0.45, z - s * 0.1, s * 0.7, s * 0.6, s * 0.7); }
  function crate(g, x, y, z, w, h, d, col) { B(g, col || 0xa07a46, x, y + h / 2, z, w, h, d); B(g, shade(col || 0xa07a46, 0.75), x, y + h / 2, z, w + 0.02, 0.05, d + 0.02); B(g, shade(col || 0xa07a46, 0.75), x, y + h * 0.18, z, w + 0.02, 0.05, d + 0.02); }
  function barrel(g, x, y, z, r, h, col) { Y(g, col || 0x6b4a30, x, y + h / 2, z, r, h, 10); Y(g, 0x3a3a38, x, y + h * 0.2, z, r * 1.03, 0.05, 10); Y(g, 0x3a3a38, x, y + h * 0.8, z, r * 1.03, 0.05, 10); }
  function lampPost(g, x, z, h, col) { Y(g, col || 0x2f3236, x, h / 2, z, 0.06, h, 6); B(g, col || 0x2f3236, x, h + 0.1, z, 0.28, 0.06, 0.28); Y(g, 0xf3e7b8, x, h - 0.08, z, 0.1, 0.28, 6); }

  // ================================================================== ФЕРМЕРСКИЙ ДОМ
  const FARM_V = [
    { plaster: 0xeee4cf, timber: 0x4f3524, roof: 0xe0603f, shut: 0x4d6b45, trim: 0xf1ede2, porch: 'shed', dorm: 3, chim: 1, flowers: [0xc23b2a, 0xd9768a, 0xe6c03a, 0xf2efe6] },
    { plaster: 0xe9dcb4, timber: 0x3e2c20, roof: 0xb4553c, shut: 0x56708a, trim: 0xf1ede2, porch: 'gable', dorm: 2, chim: 2, flowers: [0xd9768a, 0xf2efe6, 0x9a6fc0, 0xe6c03a] },
    { plaster: 0xe3dfd2, timber: 0x5a3d2a, roof: 0xc8683f, shut: 0x7c3a30, trim: 0xd9d2c0, porch: 'wide', dorm: 3, chim: 2, flowers: [0xe6c03a, 0xc23b2a, 0xf2efe6, 0xe08a3a] },
  ];
  function xPanel(W, tb, xc, w, y0, y1, z, t) {
    beam(W, tb, [xc - w / 2, y0, z], [xc + w / 2, y1, z], t || 0.08, 0.07, [0, 0, 1]); beam(W, tb, [xc - w / 2, y1, z], [xc + w / 2, y0, z], t || 0.08, 0.07, [0, 0, 1]);
  }
  /** Фасад/задняя стена фермерского дома в локальных координатах стены (x вдоль, z наружу). */
  function farmWall(g, V, z0, ry, front, wv) {
    const W = new T.Group(); W.position.set(0, 0, z0); W.rotation.y = ry; g.add(W);
    const tb = V.timber, d = 0.14, zp = d / 2 - 0.02, hw = 5;
    B(W, tb, 0, 0.55, zp, hw * 2 + 0.1, 0.22, d); B(W, tb, 0, 3.2, zp, hw * 2 + 0.1, 0.3, d + 0.04); B(W, tb, 0, 5.62, zp, hw * 2 + 0.1, 0.2, d);
    for (const s of [-1, 1]) B(W, tb, s * 4.97, 3.1, zp + 0.01, 0.26, 5.3, d + 0.06);
    const lowX = front ? [-2.6, -0.78, 0.78, 2.6] : [-2.6, 2.6], upX = [-2.6, 0, 2.6];
    for (const x of lowX) B(W, tb, x, 1.85, zp, 0.14, 2.7, d); for (const x of upX) B(W, tb, x, 4.4, zp, 0.14, 2.4, d);
    const win = (x, y, w, h, up, extra) => { const u = windowUnit(Object.assign({ w, h, shutter: wv.shut, frame: wv.trim }, extra || {})); u.position.set(x, y, 0); W.add(u); xPanel(W, tb, x, w + 0.3, y < 2 ? 0.58 : 3.36, y - 0.08, zp + 0.01); };
    if (front) {
      for (const s of [-1, 1]) {
        win(s * 3.8, 1.3, 1.1, 1.4, false, { box: true, flowers: V.flowers, boxColor: 0x5b3f2a });
        win(s * 1.69, 1.4, 0.7, 1.2, false, { shutter: null });
        win(s * 3.8, 3.95, 0.95, 1.3, true, { box: true, flowers: V.flowers, boxColor: 0x5b3f2a });
        win(s * 1.3, 3.95, 0.95, 1.3, true, { shutter: null });
      }
      const dr = doorUnit({ color: wv.door || 0x5e4430, frame: wv.trim, glass: true }); dr.position.set(0, 0.5, 0); W.add(dr);
    } else {
      for (const x of [-3.8, 0, 3.8]) win(x, 3.95, 0.95, 1.3, true, { shutter: null });
      win(-3.8, 1.3, 1.1, 1.4, false, { shutter: null }); win(3.8, 1.3, 1.1, 1.4, false, { shutter: null });
      const dr = doorUnit({ color: 0x5e4430, frame: wv.trim, w: 1.0 }); dr.position.set(0, 0.5, 0); W.add(dr);
      B(W, 0xa9a498, 0, 0.3, 0.55, 1.4, 0.3, 0.7);
    }
    return W;
  }
  function farmEnd(g, V, x0, ry, hw, yw, yr) {
    const W = new T.Group(); W.position.set(x0, 0, -0.7); W.rotation.y = ry; g.add(W);
    const tb = V.timber, d = 0.14, zp = d / 2 - 0.02, ww = hw * 2;
    B(W, tb, 0, 0.55, zp, ww + 0.1, 0.22, d); B(W, tb, 0, 3.2, zp, ww + 0.1, 0.3, d + 0.04); B(W, tb, 0, 5.62, zp, ww + 0.1, 0.2, d);
    for (const x of [-hw + 0.0, hw - 0.0]) B(W, tb, x * 0.995, 3.1, zp + 0.01, 0.26, 5.3, d + 0.06);
    for (const x of [-1.5, 1.5]) { B(W, tb, x, 1.85, zp, 0.14, 2.7, d); B(W, tb, x, 4.4, zp, 0.14, 2.4, d); }
    for (const y of [1.3, 3.95]) { const u = windowUnit({ w: 0.95, h: y < 2 ? 1.4 : 1.3, shutter: V.shut, frame: V.trim }); u.position.set(0, y, 0); W.add(u); }
    // фронтон
    facePoly(W, surf('bld_plaster', V.plaster), [[-hw, yw], [hw, yw], [0, yr - 0.1]], 0, 0, 0.0, 0);
    B(W, tb, 0, (yw + yr) / 2 - 0.1, zp + 0.01, 0.15, yr - yw - 0.4, d);
    for (const s of [-1, 1]) { B(W, tb, s * 0.62, 6.35, zp, 0.12, 1.3, d); beam(W, tb, [s * 0.65, 6.98, zp + 0.01], [s * 2.4, 5.7, zp + 0.01], 0.12, 0.1, [0, 0, 1]); }
    B(W, tb, 0, 6.98, zp, 1.5, 0.12, d);
    const u = windowUnit({ w: 0.6, h: 0.8, frame: V.trim, mull: 'v' }); u.position.set(0, 5.85, 0); W.add(u);
    return W;
  }
  /** Мансардное окно (дормер) на скате с коньком вдоль X; скат лицом к +Z. */
  function dormer(g, o) {
    const w = o.w || 1.7, x = o.x, zf = o.zf, yb = o.yb, yw = o.yw, tn = Math.tan(o.pitch || 0.8), hr = (w / 2 + 0.12) * tn, yr = yw + hr, depth = o.depth || 1.5, th = 0.1;
    const wall = surf('bld_plaster', o.plaster);
    B(g, wall, x, (yb + yw) / 2, zf - 0.08, w, yw - yb, 0.16);
    facePoly(g, wall, [[-w / 2, yw], [w / 2, yw], [0, yr - 0.04]], x, 0, zf, 0);
    for (const s of [-1, 1]) B(g, wall, x + s * (w / 2 - 0.05), (yb + yw) / 2, zf - depth / 2, 0.1, yw - yb, depth);
    const u = windowUnit({ w: 0.7, h: 0.95, frame: o.trim, mull: 'cross', sill: 0xcfc8b8 }); u.position.set(x, yw - 1.35, zf); g.add(u);
    const fz = zf + 0.14, bz = zf - depth, zm = (fz + bz) / 2, wd = fz - bz, rs = surf('bld_tile', o.roof), cth = 0.1 / Math.cos(o.pitch || 0.8);
    for (const s of [-1, 1]) slab3(g, rs, [x + s * (w / 2 + 0.14), yw - 0.14 * tn + 0.02 + cth, zm], [x, yr + cth * 0.9, zm], [0, 0, 1], wd, th);
    B(g, 0xa0452d, x, yr + cth * 0.95, zm, 0.14, 0.14, wd + 0.02, 0, 0, PI / 4);
    B(g, o.trim, x, yw + 0.02, zf + 0.06, w + 0.2, 0.08, 0.08);
  }
  reg('farmhouse', (opts) => {
    const { v } = optsOf(opts), V = FARM_V[v % 3], g = new T.Group(), gl = new T.Group();
    const hw = 3.2, zc = -0.7, yw = 5.7, th = 0.18, pitch = 50 * PI / 180, tn = Math.tan(pitch), ov = 0.55, ovx = 0.5, L = 10;
    const topEave = yw + th / Math.cos(pitch), yr = topEave + hw * tn;
    B(g, PLINTH, 0, 0.225, zc, 10.3, 0.45, 6.7);
    B(g, surf('bld_plaster', V.plaster), 0, 3.075, zc, 10, 5.25, 6.4);
    farmWall(g, V, zc + hw + 0.0, 0, true, V); farmWall(g, V, zc - hw, PI, false, V);
    farmEnd(g, V, 5.0, PI / 2, hw, yw, yr - 0.15); farmEnd(g, V, -5.0, -PI / 2, hw, yw, yr - 0.15);
    // крыша
    const rs = surf('bld_tile', V.roof);
    for (const s of [-1, 1]) slab3(g, rs, [0, topEave - ov * tn, zc + s * (hw + ov)], [0, yr, zc], [1, 0, 0], L + 2 * ovx, th);
    B(g, 0x9a3f2a, 0, yr + 0.03, zc, L + 2 * ovx + 0.06, 0.3, 0.3, PI / 4);
    gutterLine(g, -L / 2 - ovx + 0.1, L / 2 + ovx - 0.1, topEave - ov * tn - 0.05, zc + hw + ov - 0.02); gutterLine(g, -L / 2 - ovx + 0.1, L / 2 + ovx - 0.1, topEave - ov * tn - 0.05, zc - hw - ov + 0.02);
    for (const s of [-1, 1]) { downpipe(g, s * 5.15, zc + hw + 0.12, 0.5, topEave - ov * tn - 0.1); downpipe(g, s * 5.15, zc - hw - 0.12, 0.5, topEave - ov * tn - 0.1); }
    // дормеры
    const dz = [], nD = V.dorm; for (let i = 0; i < nD; i++) dz.push(nD === 3 ? (i - 1) * 3.1 : (i ? 2.8 : -2.8));
    const zr = 2.15 + 0.0, yS = yr - zr * tn;
    for (const x of dz) dormer(g, { x, zf: zc + zr, yb: yS - 0.35, yw: yS + 1.5, w: 1.7, plaster: V.plaster, roof: V.roof, trim: V.trim, pitch: 0.75, depth: 1.6 });
    // трубы
    const brick = surf('bld_brick', 0xffffff);
    chimney(g, -3.9, zc + 0.3, yr - 1.6, yr + 1.45, 0.95, 0.95, brick);
    if (V.chim > 1) chimney(g, 3.9, zc - 0.2, yr - 1.6, yr + 1.1, 0.8, 0.8, brick);
    // крыльцо
    const wood = surf('bld_planks', 0x9a7a55), zw = zc + hw, pz = zw + 1.65;
    if (V.porch === 'wide') {
      B(g, wood, 0, 0.5, zw + 0.8, 9.6, 0.12, 1.6);
      for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) B(g, V.trim, x, 1.55, pz - 0.05, 0.16, 2.2, 0.16);
      slab3(g, rs, [0, 3.35, zw], [0, 2.6, pz + 0.35], [1, 0, 0], 10.2, 0.12); B(g, V.trim, 0, 2.55, pz + 0.35, 10.2, 0.1, 0.1);
      for (let i = -4; i <= 4; i++) if (Math.abs(i * 1.1) > 1.2) B(g, V.trim, i * 1.1, 0.95, pz - 0.05, 0.05, 0.85, 0.05); B(g, V.trim, -2.9, 1.4, pz - 0.05, 3.7, 0.07, 0.08); B(g, V.trim, 2.9, 1.4, pz - 0.05, 3.7, 0.07, 0.08);
      B(g, 0xa9a498, 0, 0.22, pz + 0.3, 1.9, 0.18, 0.5); B(g, 0xa9a498, 0, 0.1, pz + 0.6, 1.9, 0.18, 0.5);
    } else if (V.porch === 'gable') {
      B(g, wood, 0, 0.5, zw + 0.85, 3.6, 0.12, 1.7);
      for (const s of [-1, 1]) { B(g, V.trim, s * 1.6, 1.5, pz + 0.05, 0.18, 2.1, 0.18); for (let k = 0; k < 5; k++) B(g, V.trim, s * (0.4 + k * 0.28) + 0.0, 0.95, pz + 0.05, 0.05, 0.8, 0.05); }
      B(g, V.trim, -1.0, 1.4, pz + 0.05, 1.2, 0.07, 0.08); B(g, V.trim, 1.0, 1.4, pz + 0.05, 1.2, 0.07, 0.08);
      for (const s of [-1, 1]) { slab3(g, rs, [s * 2.05, 2.75, zw + 0.9], [0, 3.85, zw + 0.9], [0, 0, 1], 2.5, 0.12); }
      facePoly(g, surf('bld_plaster', V.plaster), [[-1.95, 2.65], [1.95, 2.65], [0, 3.8]], 0, 0, pz + 0.12, 0); B(g, V.timber, 0, 2.62, pz + 0.12, 4.2, 0.12, 0.1);
      B(g, 0x9a3f2a, 0, 3.9, zw + 0.9, 0.12, 0.12, 2.52, 0, 0, PI / 4);
      B(g, 0xa9a498, 0, 0.22, pz + 0.32, 1.9, 0.18, 0.5); B(g, 0xa9a498, 0, 0.1, pz + 0.62, 1.9, 0.18, 0.5);
    } else {
      B(g, wood, 0, 0.5, zw + 0.85, 6.0, 0.12, 1.7);
      for (const x of [-2.8, -0.9, 0.9, 2.8]) B(g, V.trim, x, 1.55, pz, 0.15, 2.2, 0.15);
      slab3(g, rs, [0, 3.35, zw], [0, 2.6, pz + 0.35], [1, 0, 0], 6.6, 0.12); B(g, V.trim, 0, 2.55, pz + 0.35, 6.6, 0.1, 0.1);
      for (let k = 0; k < 7; k++) { B(g, V.trim, -2.7 + k * 0.26, 0.98, pz, 0.05, 0.85, 0.05); B(g, V.trim, 2.7 - k * 0.26, 0.98, pz, 0.05, 0.85, 0.05); }
      B(g, V.trim, -1.85, 1.4, pz, 1.9, 0.07, 0.08); B(g, V.trim, 1.85, 1.4, pz, 1.9, 0.07, 0.08);
      for (const s of [-1, 1]) { for (let k = 0; k < 6; k++) B(g, V.trim, s * 2.8, 0.98, zw + 0.2 + k * 0.28, 0.05, 0.85, 0.05); B(g, V.trim, s * 2.8, 1.4, zw + 0.85, 0.08, 0.07, 1.6); }
      B(g, 0xa9a498, 0, 0.22, pz + 0.32, 1.9, 0.18, 0.5); B(g, 0xa9a498, 0, 0.1, pz + 0.62, 1.9, 0.18, 0.5);
    }
    // кусты и грядки у стен
    for (const x of [-4.4, -2.2, 2.2, 4.4]) shrub(g, x, zw + 0.55 + (Math.abs(x) < 3 ? 0.9 : 0), 0.7, 0x3e6a36, 0x557f40);
    for (const s of [-1, 1]) { shrub(g, s * 5.45, zc + 1.4, 0.75); shrub(g, s * 5.4, zc - 1.6, 0.6, 0x45743a, 0x5a8944); }
    // фонарь у двери
    B(g, 0x2f3236, 1.15, 2.3, zw + 0.12, 0.14, 0.2, 0.14); B(g, 0xf3e7b8, 1.15, 2.3, zw + 0.14, 0.1, 0.14, 0.1);
    return finish(g, 11 + v, [gl.children.length ? mergeInto(gl, glassMat) : null]);
  });

  // ------------------------------------------------------------------ общие крыши
  /** Двускатная крыша с коньком вдоль X. o: spec, xc, zc, L (длина стены), hw (полуглубина), yw (верх стены), pitch, th, ov, ovx, ridge */
  function gableRoofX(g, o) {
    const th = o.th || 0.15, cs = Math.cos(o.pitch), tn = Math.tan(o.pitch), ov = o.ov == null ? 0.5 : o.ov, ovx = o.ovx == null ? 0.4 : o.ovx;
    const topEave = o.yw + th / cs, yr = topEave + o.hw * tn, W = o.L + 2 * ovx;
    for (const s of [-1, 1]) slab3(g, o.spec, [o.xc, topEave - ov * tn, o.zc + s * (o.hw + ov)], [o.xc, yr, o.zc], [1, 0, 0], W, th);
    if (o.cap !== false) B(g, o.ridge != null ? o.ridge : 0x9a3f2a, o.xc, yr + 0.03, o.zc, W + 0.06, 0.26, 0.26, PI / 4);
    if (o.gutter !== false) { const gy = topEave - ov * tn - 0.05; gutterLine(g, o.xc - W / 2 + 0.1, o.xc + W / 2 - 0.1, gy, o.zc + o.hw + ov - 0.03); gutterLine(g, o.xc - W / 2 + 0.1, o.xc + W / 2 - 0.1, gy, o.zc - o.hw - ov + 0.03); }
    return { yr, topEave, tn, ov, W };
  }
  function gableEnds(g, spec, o, yr) {
    for (const s of [-1, 1]) facePoly(g, spec, [[-o.hw, o.yw], [o.hw, o.yw], [0, yr - 0.12]], o.xc + s * o.L / 2, 0, o.zc, s > 0 ? PI / 2 : -PI / 2);
  }
  /** Группа-стена: x вдоль стены, z наружу. */
  function wallGroup(g, x, z, ry) { const W = new T.Group(); W.position.set(x, 0, z); W.rotation.y = ry || 0; g.add(W); return W; }
  function cornerBoards(g, x1, x2, z1, z2, y0, y1, col, w) { for (const x of [x1, x2]) for (const z of [z1, z2]) B(g, col, x, (y0 + y1) / 2, z, w || 0.2, y1 - y0, w || 0.2); }
  function quoins(g, x, z, y0, y1, col) { const n = Math.floor((y1 - y0) / 0.4); for (let i = 0; i < n; i++) { const wd = i % 2 ? 0.34 : 0.5; for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, col, x + sx * (0.0), y0 + 0.2 + i * 0.4, z + sz * 0, wd, 0.36, wd); } }

  // ================================================================== КОТТЕДЖ
  const COT_V = [
    { wall: 0xeee3c8, roof: 0xc25a3c, dorm: true, chim: true, shut: 0x4d6b45, box: true },
    { wall: 0xe0bb72, roof: 0xc25a3c, dorm: false, chim: true, shut: 0x7c3a30, box: false },
    { wall: 0xe9c9bd, roof: 0x7e5848, dorm: true, chim: false, shut: 0x5a6e5a, box: true },
    { wall: 0xb4c3cf, roof: 0x7e5848, dorm: false, chim: false, shut: 0xece6d4, box: false },
  ];
  reg('cottage', (opts) => {
    const { v } = optsOf(opts), V = COT_V[v % 4], g = new T.Group();
    const hw = 2.1, bw = 5.2, y0 = 0.35, yw = 2.95, pitch = 42 * PI / 180, trim = 0xf1ede2, stone = 0x9a958a;
    B(g, PLINTH, 0, 0.2, 0, bw + 0.2, 0.4, hw * 2 + 0.2);
    B(g, surf('bld_plaster', V.wall), 0, (y0 + yw) / 2, 0, bw, yw - y0, hw * 2);
    cornerBoards(g, -bw / 2, bw / 2, -hw, hw, y0, yw, mix(V.wall, 0xffffff, 0.35), 0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) { const wd = i % 2 ? 0.3 : 0.46; B(g, stone, sx * (bw / 2 - wd / 2 + 0.03), y0 + 0.2 + i * 0.4, sz * (hw - 0.1) + sz * 0.1, wd, 0.36, 0.22); }
    const rs = surf('bld_tile', V.roof), R = gableRoofX(g, { spec: rs, xc: 0, zc: 0, L: bw, hw, yw, pitch, th: 0.14, ov: 0.42, ovx: 0.36, ridge: shade(V.roof, 0.8) & 0xffffff });
    gableEnds(g, surf('bld_plaster', V.wall), { xc: 0, zc: 0, L: bw, hw, yw }, R.yr);
    // фасад
    const F = wallGroup(g, 0, hw, 0), K = wallGroup(g, 0, -hw, PI);
    for (const s of [-1, 1]) { const u = windowUnit({ w: 0.9, h: 1.1, shutter: V.shut, frame: trim, box: V.box, flowers: [0xc23b2a, 0xd9768a, 0xe6c03a, 0xf2efe6] }); u.position.set(s * 1.75, 1.05, 0); F.add(u); }
    const dr = doorUnit({ color: 0x5e4430, frame: trim, w: 0.95, h: 2.05, glass: v % 2 === 0 }); dr.position.set(0, 0.4, 0); F.add(dr);
    if (v === 3) { slab3(F, rs, [0, 2.95, 0.0], [0, 2.4, 1.0], [1, 0, 0], 1.6, 0.1); beam(F, trim, [-0.7, 2.3, 0.95], [-0.7, 0.4, 0.95], 0.1, 0.1); beam(F, trim, [0.7, 2.3, 0.95], [0.7, 0.4, 0.95], 0.1, 0.1); }
    else { slab3(F, rs, [0, 2.7, 0.02], [0, 2.4, 0.8], [1, 0, 0], 1.7, 0.08); beam(F, trim, [-0.65, 2.45, 0.1], [-0.65, 2.2, 0.8], 0.06, 0.06); beam(F, trim, [0.65, 2.45, 0.1], [0.65, 2.2, 0.8], 0.06, 0.06); }
    for (const x of [-1.6, 1.6]) { const u = windowUnit({ w: 0.9, h: 1.1, frame: trim, shutter: V.shut }); u.position.set(x, 1.05, 0); K.add(u); }
    for (const s of [-1, 1]) { const E = wallGroup(g, s * bw / 2, 0, s * PI / 2), u = windowUnit({ w: 0.8, h: 1.0, frame: trim, shutter: V.shut }); u.position.set(0, 1.1, 0); E.add(u); const a = windowUnit({ w: 0.5, h: 0.6, frame: trim, mull: 'v' }); a.position.set(0, 3.25, 0.0); E.add(a); }
    if (V.dorm) {
      const zr = 1.2, yS = R.yr - zr * R.tn; dormer(g, { x: 0, zf: zr, yb: yS - 0.3, yw: yS + 1.1, w: 1.4, plaster: V.wall, roof: V.roof, trim, pitch: 0.75, depth: 1.3 });
    }
    const brick = surf('bld_brick', 0xffffff);
    if (V.chim) chimney(g, 1.75, -0.25, R.yr - 1.2, R.yr + 0.95, 0.8, 0.8, brick);
    for (const s of [-1, 1]) downpipe(g, s * (bw / 2 + 0.02), hw + 0.04, 0.4, R.topEave - R.ov * R.tn - 0.1);
    // крыльцо-мелочи: скамья, горшки, кусты
    B(g, 0xb89a6a, 1.5, 0.45, hw + 0.45, 1.1, 0.07, 0.38); for (const x of [1.05, 1.95]) B(g, 0x6b4a30, x, 0.22, hw + 0.45, 0.07, 0.44, 0.34);
    for (const x of [-0.95, 0.95]) { Y(g, 0xb5603f, x, 0.2, hw + 0.45, 0.17, 0.4, 8); blob(g, 0x4a7a3a, x, 0.5, hw + 0.45, 0.4, 0.3, 0.4); blob(g, 0xd9768a, x + 0.06, 0.62, hw + 0.45, 0.16); }
    shrub(g, -2.6, hw + 0.35, 0.7); shrub(g, 2.7, hw + 0.3, 0.6, 0x45743a, 0x5a8944); shrub(g, -2.85, -0.4, 0.55);
    return finish(g, 21 + v);
  });

  // ================================================================== АМБАР (мансардная/гамбрел крыша)
  reg('barn', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), xm = -1.6, BW = 12.8, hz = 5, yw = 4.0, y0 = 0.4;
    const wood = surf('bld_planks', v === 1 ? 0x6b3c30 : 0x5e4538), doorS = surf('bld_planks', v === 1 ? 0x8a5a44 : 0x7b3f2e), trim = 0xe8e0cc;
    const roofS = surf('bld_seam', v === 1 ? 0x7a3d30 : (v === 2 ? 0x4a4f54 : 0x376a47)), rcap = v === 1 ? 0x5a2c24 : (v === 2 ? 0x34383c : 0x28513a);
    B(g, PLINTH, xm, 0.2, 0, BW + 0.25, 0.4, hz * 2 + 0.25);
    B(g, wood, xm, (y0 + yw) / 2, 0, BW, yw - y0, hz * 2);
    cornerBoards(g, xm - BW / 2, xm + BW / 2, -hz, hz, y0, yw, trim, 0.22);
    for (const z of [-hz, hz]) B(g, trim, xm, 2.25, z + (z > 0 ? 0.03 : -0.03), BW + 0.2, 0.1, 0.06);
    // --- ворота
    const DZ = hz + 0.09;
    for (const s of [-1, 1]) {
      const cx = xm + s * 1.2;
      B(g, doorS, cx, 2.2, DZ, 2.35, 3.6, 0.1);
      B(g, trim, cx, 3.95 - 0.1, DZ + 0.06, 2.35, 0.15, 0.05); B(g, trim, cx, 0.5, DZ + 0.06, 2.35, 0.15, 0.05);
      B(g, trim, cx - 1.1, 2.2, DZ + 0.06, 0.15, 3.6, 0.05); B(g, trim, cx + 1.1, 2.2, DZ + 0.06, 0.15, 3.6, 0.05); B(g, trim, cx, 2.2, DZ + 0.06, 0.15, 3.6, 0.05);
      beam(g, trim, [cx - 1.1, 0.5, DZ + 0.07], [cx + 1.1, 3.9, DZ + 0.07], 0.14, 0.05, [0, 0, 1]); beam(g, trim, [cx - 1.1, 3.9, DZ + 0.07], [cx + 1.1, 0.5, DZ + 0.07], 0.14, 0.05, [0, 0, 1]);
      B(g, 0x3a3a38, cx - s * 0.2, 1.8, DZ + 0.1, 0.05, 0.5, 0.05);
    }
    B(g, trim, xm - 2.47, 2.25, hz + 0.06, 0.16, 3.7, 0.1); B(g, trim, xm + 2.47, 2.25, hz + 0.06, 0.16, 3.7, 0.1); B(g, trim, xm, 4.08, hz + 0.08, 5.1, 0.18, 0.12);
    B(g, 0x555a5e, xm, 4.28, hz + 0.23, 9.6, 0.12, 0.1); for (const x of [-3.8, -1.2, 1.2, 3.8]) B(g, 0x555a5e, xm + x, 4.15, hz + 0.18, 0.08, 0.3, 0.08);
    B(g, 0xa9a498, xm, 0.05, hz + 0.5, 5.4, 0.1, 1.0);
    // окна
    const F = wallGroup(g, 0, hz, 0), K = wallGroup(g, 0, -hz, PI);
    for (const s of [-1, 1]) { const u = windowUnit({ w: 1.0, h: 1.0, mull: 'grid', frame: trim, glass: 0x3f5560 }); u.position.set(xm + s * 5.2, 1.6, 0); F.add(u); }
    for (const x of [-4.8, 0, 4.8]) { const u = windowUnit({ w: 1.0, h: 1.0, mull: 'grid', frame: trim, glass: 0x3f5560 }); u.position.set(xm + x, 1.7, 0); K.add(u); }
    // --- крыша «гамбрел»
    const TH = 0.22, OVX = 0.45, Wr = BW + 2 * OVX, Ez = 5.45, Ey = 3.5, Kz = 3.25, Ky = 7.4, Ry = 9.5;
    for (const s of [-1, 1]) {
      slab3(g, roofS, [xm, Ky, s * Kz], [xm, Ry, 0], [1, 0, 0], Wr, TH);
      if (s < 0) slab3(g, roofS, [xm, Ey, s * Ez], [xm, Ky, s * Kz], [1, 0, 0], Wr, TH);
      else { const hx = 1.6, l1 = xm - hx, r1 = xm + hx, xa = xm - BW / 2 - OVX, xb = xm + BW / 2 + OVX;
        slab3(g, roofS, [(xa + l1) / 2, Ey, Ez], [(xa + l1) / 2, Ky, Kz], [1, 0, 0], l1 - xa, TH); slab3(g, roofS, [(r1 + xb) / 2, Ey, Ez], [(r1 + xb) / 2, Ky, Kz], [1, 0, 0], xb - r1, TH); }
    }
    B(g, rcap, xm, Ry + 0.03, 0, Wr + 0.06, 0.28, 0.28, PI / 4);
    for (const s of [-1, 1]) B(g, rcap, xm, Ky + 0.0, s * Kz, Wr + 0.04, 0.18, 0.18, PI / 4);
    // фронтоны
    const pent = [[-5, yw], [5, yw], [3.2, 7.2], [0, 9.3], [-3.2, 7.2]];
    facePoly(g, wood, pent, xm + BW / 2 + 0.01, 0, 0, PI / 2); facePoly(g, wood, pent, xm - BW / 2 - 0.01, 0, 0, -PI / 2);
    // слуховое окно-сеновал по центру
    {
      const dw = 3.0, zf = hz, yTop = 6.4, yR = 8.05;
      B(g, wood, xm, (yw + yTop) / 2, zf - 0.08, dw, yTop - yw, 0.16);
      facePoly(g, wood, [[-dw / 2, yTop], [dw / 2, yTop], [0, yR - 0.05]], xm, 0, zf, 0);
      for (const s of [-1, 1]) B(g, wood, xm + s * (dw / 2 - 0.05), (yw + yTop) / 2, zf - 1.3, 0.1, yTop - yw, 2.6);
      B(g, 0x1d1612, xm, 5.25, zf + 0.01, 1.4, 1.65, 0.05);
      B(g, surf('bld_hay', 0xffffff), xm, 4.7, zf - 0.1, 1.3, 0.45, 0.45);
      B(g, trim, xm, 6.15, zf + 0.06, 1.7, 0.14, 0.08); B(g, trim, xm - 0.78, 5.25, zf + 0.06, 0.12, 1.65, 0.08); B(g, trim, xm + 0.78, 5.25, zf + 0.06, 0.12, 1.65, 0.08); B(g, trim, xm, 4.38, zf + 0.06, 1.7, 0.1, 0.08);
      for (const s of [-1, 1]) { B(g, doorS, xm + s * 1.1, 5.25, zf + 0.12, 0.5, 1.6, 0.06); }
      const tn = (yR + 0.2 - yTop) / (dw / 2), zm = (zf + 0.35 + 2.2) / 2;
      for (const s of [-1, 1]) slab3(g, roofS, [xm + s * (dw / 2 + 0.15), yR + 0.2 - (dw / 2 + 0.15) * tn, zm], [xm, yR + 0.2, zm], [0, 0, 1], zf + 0.35 - 2.2, 0.14);
      B(g, rcap, xm, yR + 0.22, zm, 0.14, 0.14, zf + 0.37 - 2.2, 0, 0, PI / 4);
      beam(g, 0x4a3a2e, [xm, 7.78, zf + 0.0], [xm, 7.78, zf + 1.7], 0.16, 0.16); beam(g, 0x4a3a2e, [xm, 7.0, zf + 0.05], [xm, 7.7, zf + 1.35], 0.1, 0.1, [1, 0, 0]);
      Y(g, 0x444a4e, xm, 7.55, zf + 1.62, 0.15, 0.1, 10, 0, 0, PI / 2); Y(g, 0x6b5a3a, xm + 0.0, 6.9, zf + 1.62, 0.015, 1.3, 4);
      B(g, 0x555a5e, xm, 6.22, zf + 1.62, 0.1, 0.12, 0.1);
    }
    // малые мансарды-окна на нижнем скате
    for (const s of [-1, 1]) {
      const x = xm + s * 4.5, zf = 4.15, yS = Ey + (Ez - zf) * (Ky - Ey) / (Ez - Kz);
      B(g, wood, x, yS + 0.55, zf - 0.08, 1.1, 1.3, 0.16); facePoly(g, wood, [[-0.55, yS + 1.2], [0.55, yS + 1.2], [0, yS + 1.75]], x, 0, zf, 0);
      for (const t of [-1, 1]) B(g, wood, x + t * 0.5, yS + 0.55, zf - 0.6, 0.08, 1.3, 1.2);
      const u = windowUnit({ w: 0.6, h: 0.7, frame: trim, mull: 'cross', glass: 0x3f5560 }); u.position.set(x, yS + 0.28, zf); g.add(u);
      for (const t of [-1, 1]) slab3(g, roofS, [x + t * 0.68, yS + 1.18 - 0.0, zf - 0.55], [x, yS + 1.78, zf - 0.55], [0, 0, 1], 1.5, 0.1);
    }
    // вентиляционные башенки на коньке
    for (const x of [xm - 4.2, xm + 4.2]) {
      B(g, 0x5e4538, x, Ry + 0.55, 0, 0.9, 0.7, 0.9); for (let k = 0; k < 3; k++) for (const [dx, dz, sx, sz] of [[0, 0.46, 0.7, 0.04], [0, -0.46, 0.7, 0.04], [0.46, 0, 0.04, 0.7], [-0.46, 0, 0.04, 0.7]]) B(g, 0x2a211b, x + dx, Ry + 0.35 + k * 0.2, dz, sx, 0.08, sz);
      CT(g, rcap, x, Ry + 1.3, 0, 0.72, 0.02, 0.75, 4, 0, PI / 4, 0);
    }
    B(g, 0x3a3a38, xm + 4.2, Ry + 1.95, 0, 0.04, 0.5, 0.04); B(g, 0x3a3a38, xm + 4.2, Ry + 2.2, 0, 0.7, 0.08, 0.04); blob(g, 0x3a3a38, xm + 4.55, Ry + 2.2, 0, 0.12);
    // --- пристройка (навес) справа
    {
      const x1 = xm + BW / 2, x2 = x1 + 3.55, zz = 4.5, wall = surf('bld_planks', 0x6e5242);
      B(g, wood, x2 - 0.1, 1.55, 0, 0.2, 2.3, zz * 2 - 0.2); B(g, PLINTH, (x1 + x2) / 2, 0.2, 0, x2 - x1 + 0.2, 0.4, zz * 2 + 0.1);
      facePoly(g, wall, [[x1, 0.4], [x2 - 0.1, 0.4], [x2 - 0.1, 2.8], [x1, 3.95]], 0, 0, -zz + 0.05, PI);
      B(g, wall, (x1 + x2) / 2, 1.2, 0, 0.0, 0.0, 0.0);
      const rs2 = surf('bld_seam', mix(0x376a47, 0x555a5e, v === 0 ? 0.0 : 0.5));
      slab3(g, rs2, [x1 - 0.05, 4.0, 0], [x2 + 0.5, 2.75, 0], [0, 0, 1], zz * 2 + 0.8, 0.16);
      for (const z of [zz, -zz]) B(g, trim, (x1 + x2) / 2 + 0.2, 3.2, z, 3.7, 0.12, 0.12, 0, 0, -0.32);
      for (const x of [x1 + 0.15, x2 - 0.2]) B(g, 0x5a432f, x, 1.5, zz - 0.1, 0.2, 3.0, 0.2);
      B(g, 0x5a432f, (x1 + x2) / 2, 3.15, zz - 0.1, 3.4, 0.2, 0.2, 0, 0, -0.32);
      // внутри: тюки и ящики
      const hay = surf('bld_hay', 0xffffff);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) B(g, hay, x1 + 0.85 + j * 0.95, 0.45 + 0.23, -1.0 - i * 0.52 - 1.2, 0.9, 0.46, 0.5);
      for (let i = 0; i < 2; i++) B(g, hay, x1 + 1.3 + i * 0.95, 0.9, -1.0 - 0.52 - 1.2 + 0.0, 0.9, 0.46, 0.5);
      B(g, 0x1d1612, (x1 + x2) / 2, 0.02, 0, x2 - x1 - 0.2, 0.04, zz * 2 - 0.3);
      crate(g, x2 - 0.8, 0.0, 2.6, 0.7, 0.5, 0.7); crate(g, x2 - 0.8, 0.5, 2.6, 0.6, 0.45, 0.6, 0xb08a52); barrel(g, x1 + 0.9, 0, 3.2, 0.32, 0.9);
    }
    // перед амбаром: бидоны, ящики, тюк
    for (const [x, z] of [[xm + 3.8, hz + 0.9], [xm + 4.15, hz + 0.75]]) { Y(g, 0xb8bcc0, x, 0.35, z, 0.17, 0.5, 8); CT(g, 0xb8bcc0, x, 0.68, z, 0.17, 0.08, 0.15, 8); }
    crate(g, xm - 3.8, 0.0, hz + 0.7, 0.8, 0.5, 0.6); B(g, surf('bld_hay', 0xffffff), xm - 4.3, 0.23, hz + 1.5, 0.9, 0.46, 0.5, 0, 0.3, 0);
    for (const s of [-1, 1]) downpipe(g, xm + s * (BW / 2 + 0.12), hz + 0.05, 0.4, 3.6);
    return finish(g, 31 + v);
  });

  // ================================================================== КОНЮШНЯ / ХЛЕВ
  reg('stable', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), L = 18, hw = 3.5, yw = 3.1, y0 = 0.35, trim = 0xf1ede2;
    const PL = [0xf0ebdc, 0xe8e1cd, 0xeaeadf][v % 3], roofT = [0xc25a3c, 0xaa5a42, 0xb86a42][v % 3];
    const plast = surf('bld_plaster', PL), rs = surf('bld_tile', roofT), tm = 0x4f3524;
    B(g, PLINTH, 0, 0.2, 0, L + 0.2, 0.4, hw * 2 + 0.2);
    B(g, plast, 0, (y0 + yw) / 2, -hw + 0.15, L, yw - y0, 0.3);               // задняя стена
    for (const s of [-1, 1]) B(g, plast, s * (L / 2 - 0.15), (y0 + yw) / 2, 0, 0.3, yw - y0, hw * 2);   // торцы
    const xs = -3, xe = L / 2;
    B(g, plast, (xs + xe) / 2, (y0 + yw) / 2, hw - 0.15, xe - xs, yw - y0, 0.3);   // закрытая часть фасада
    B(g, 0x6b5a45, (xs - L / 2) / 2 - 0.0, 0.5, 0.0, L / 2 + xs - 0.4, 0.2, hw * 2 - 0.6);   // пол (солома/земля) открытой части
    B(g, 0xb89a55, (xs - L / 2) / 2, 0.62, -1.6, L / 2 + xs - 0.6, 0.12, 1.5);
    const R = gableRoofX(g, { spec: rs, xc: 0, zc: 0, L, hw, yw, pitch: 33 * PI / 180, th: 0.16, ov: 0.9, ovx: 0.5, ridge: 0x9a3f2a });
    gableEnds(g, plast, { xc: 0, zc: 0, L, hw, yw }, R.yr);
    // фасад: двери конюшен
    const F = wallGroup(g, 0, hw, 0);
    B(F, tm, (xs + xe) / 2, 0.55, 0.0, xe - xs, 0.22, 0.12); B(F, tm, (xs + xe) / 2, yw - 0.06, 0.0, xe - xs, 0.2, 0.12);
    for (let i = 0; i <= 4; i++) B(F, tm, xs + i * 3, 1.75, 0.0, 0.2, yw - 0.4, 0.14);
    for (let i = 0; i < 4; i++) {
      const dx = xs + i * 3 + 1.0;
      B(F, 0x5e4430, dx, 0.5 + 0.55, 0.06, 1.2, 1.1, 0.07); B(F, shade(0x5e4430, 1.2), dx, 1.0, 0.1, 0.9, 0.7, 0.03);
      B(F, 0x1d1612, dx, 0.5 + 1.1 + 0.55, 0.01, 1.2, 1.1, 0.03);
      B(F, trim, dx, 2.75, 0.07, 1.5, 0.12, 0.08); B(F, tm, dx - 0.64, 1.65, 0.07, 0.1, 2.35, 0.1); B(F, tm, dx + 0.64, 1.65, 0.07, 0.1, 2.35, 0.1);
      B(F, 0x3a3a38, dx + 0.45, 1.1, 0.12, 0.12, 0.05, 0.04);
      const u = windowUnit({ w: 0.7, h: 0.7, frame: trim, mull: 'cross', box: i % 2 === 0, flowers: [0xc23b2a, 0xe6c03a, 0xf2efe6, 0xd9768a] }); u.position.set(dx + 1.2, 1.35, 0); F.add(u);
      B(g, 0x555a5e, dx, 2.28, hw + 0.04, 0.06, 0.06, 0.06);
    }
    // открытая часть: столбы, кормушка, ясли
    const oz = hw + 0.55;
    for (const x of [-8.8, -6.9, -5.0, -3.1]) B(g, tm, x, (0.4 + 3.2) / 2, oz, 0.22, 2.9, 0.22);
    B(g, tm, -5.95, 3.15, oz, 6.0, 0.22, 0.22);
    for (const x of [-7.8, -6.0, -4.2]) { beam(g, tm, [x, 3.05, oz], [x + 0.4, 2.6, oz], 0.1, 0.1); beam(g, tm, [x, 3.05, oz], [x - 0.4, 2.6, oz], 0.1, 0.1); }
    B(g, 0x8a6a42, -6.0, 0.7, oz - 0.1, 5.6, 0.35, 0.55); B(g, 0x6b4a30, -6.0, 0.9, oz - 0.1, 5.6, 0.06, 0.6); B(g, surf('bld_hay', 0xffffff), -6.0, 0.98, oz - 0.1, 5.0, 0.2, 0.4);
    for (const x of [-8.3, -3.8]) B(g, 0x6b4a30, x, 0.35, oz - 0.1, 0.12, 0.7, 0.5);
    for (const x of [-8.0, -6.2, -4.4]) { B(g, 0x6b4a30, x, 1.45, -hw + 0.4, 0.06, 1.3, 0.4); } B(g, 0x6b4a30, -6.1, 2.0, -hw + 0.4, 4.0, 0.08, 0.5); B(g, 0x6b4a30, -6.1, 1.25, -hw + 0.4, 4.0, 0.08, 0.5);
    B(g, surf('bld_hay', 0xffffff), -6.1, 1.6, -hw + 0.55, 3.6, 0.5, 0.25);
    for (let i = 0; i < 3; i++) B(g, surf('bld_hay', 0xffffff), -8.3 + i * 0.95, 0.85, -hw + 0.85, 0.9, 0.46, 0.5);
    for (let i = 0; i < 2; i++) B(g, surf('bld_hay', 0xffffff), -8.3 + i * 0.95, 1.3, -hw + 0.85, 0.9, 0.46, 0.5);
    // слуховое окно-сеновал и вентиляция
    {
      const x = 4.5, zr = 2.1, yS = R.yr - zr * R.tn;
      dormer(g, { x, zf: zr, yb: yS - 0.3, yw: yS + 1.15, w: 1.6, plaster: PL, roof: roofT, trim, pitch: 0.7, depth: 1.3 });
      dormer(g, { x: -4.5, zf: zr, yb: yS - 0.3, yw: yS + 1.15, w: 1.6, plaster: PL, roof: roofT, trim, pitch: 0.7, depth: 1.3 });
      for (const x of [-1.5, 1.5]) { const hx = x + 0; B(g, 0x3a3a38, hx, R.yr + 0.45, 0, 0.7, 0.55, 0.7); CT(g, 0x7a3a28, hx, R.yr + 0.95, 0, 0.6, 0.03, 0.5, 4, 0, PI / 4, 0); }
    }
    for (const s of [-1, 1]) { const E = wallGroup(g, s * L / 2, 0, s * PI / 2), u = windowUnit({ w: 0.8, h: 0.9, frame: trim }); u.position.set(0, 1.4, 0); E.add(u); const a = windowUnit({ w: 0.5, h: 0.6, frame: trim, mull: 'v' }); a.position.set(0, 3.45, 0); E.add(a); }
    for (const x of [-1.8, 1.8, 5.5]) downpipe(g, x > 0 ? 9.15 : -9.15, hw + 0.1, 0.4, 2.6);
    // перед входом: поилка и коновязь
    B(g, 0x6b4a30, 5.0, 0.4, hw + 1.4, 1.8, 0.4, 0.55); B(g, 0x4a7a9a, 5.0, 0.52, hw + 1.4, 1.6, 0.06, 0.4);
    for (const x of [1.0, 7.0]) B(g, tm, x, 0.55, hw + 1.9, 0.12, 1.1, 0.12); B(g, tm, 4.0, 0.95, hw + 1.9, 6.1, 0.1, 0.1);
    crate(g, 8.2, 0.0, hw + 0.6, 0.7, 0.5, 0.6); shrub(g, 8.7, hw + 1.1, 0.8); shrub(g, -9.3, hw + 0.5, 0.7);
    return finish(g, 41 + v);
  });

  // ================================================================== КУРЯТНИК
  reg('coop', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), trim = 0xf1ede2;
    const col = [0x9a4a3a, 0xd9cfae, 0x6f8a78][v % 3], wall = surf('bld_planks', mix(col, 0xffffff, 0.15));
    const hx = -0.75, hz = -0.65, floorY = 0.65;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0x5a432f, hx + sx * 0.95, floorY / 2, hz + sz * 0.7, 0.13, floorY, 0.13);
    B(g, 0x6b5a45, hx, floorY + 0.03, hz, 2.2, 0.08, 1.7);
    B(g, wall, hx, floorY + 0.7, hz, 2.0, 1.3, 1.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, trim, hx + sx * 1.0, floorY + 0.7, hz + sz * 0.75, 0.1, 1.3, 0.1);
    const R = gableRoofX(g, { spec: surf('bld_tile', mix(0xc25a3c, 0x7e5848, v * 0.4)), xc: hx, zc: hz, L: 2.0, hw: 0.75, yw: floorY + 1.35, pitch: 28 * PI / 180, th: 0.08, ov: 0.3, ovx: 0.25, ridge: 0x7a3a28, gutter: false });
    gableEnds(g, wall, { xc: hx, zc: hz, L: 2.0, hw: 0.75, yw: floorY + 1.35 }, R.yr);
    const F = wallGroup(g, hx, hz + 0.75, 0);
    B(F, 0x1d1612, 0.0, 0.55, 0.01, 0.46, 0.56, 0.04); B(F, trim, 0, 0.9, 0.04, 0.58, 0.07, 0.06); B(F, trim, -0.27, 0.55, 0.04, 0.07, 0.56, 0.06); B(F, trim, 0.27, 0.55, 0.04, 0.07, 0.56, 0.06);
    const u = windowUnit({ w: 0.5, h: 0.5, frame: trim, mull: 'cross' }); u.position.set(0.7, 0.9, 0); F.add(u);
    B(F, 0x5a432f, -0.6, 0.62, 0.15, 0.04, 0.5, 0.04); B(F, 0x5a432f, -0.9, 0.62, 0.15, 0.04, 0.5, 0.04);
    // трап
    beam(g, 0x9a7a55, [hx, floorY + 0.12, hz + 0.9], [hx, 0.04, hz + 2.1], 0.4, 0.04, [1, 0, 0]);
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; B(g, 0x5a432f, hx, floorY + 0.12 + (0.04 - floorY - 0.12) * t + 0.03, hz + 0.9 + 1.2 * t, 0.4, 0.03, 0.04, -0.5, 0, 0); }
    // гнездовые ящики сбоку
    const nx = hx + 1.55;
    B(g, wall, nx - 0.05, floorY + 0.4, hz, 0.7, 0.6, 1.3); B(g, 0x5a432f, nx - 0.05, floorY + 0.7, hz, 0.78, 0.05, 1.38);
    slab3(g, surf('bld_tile', 0x7e5848), [nx - 0.45, floorY + 0.95, hz], [nx + 0.4, floorY + 0.68, hz], [0, 0, 1], 1.45, 0.05);
    for (const dz of [-0.4, 0.0, 0.4]) { B(g, 0x2a211b, nx + 0.3, floorY + 0.4, hz + dz, 0.04, 0.3, 0.3); blob(g, 0xd9b35a, nx + 0.15, floorY + 0.25, hz + dz, 0.3, 0.12, 0.28); }
    // выгул
    const x1 = -2.0, x2 = 1.9, z1 = -1.45, z2 = 1.45, fc = 0x8a6a42;
    B(g, 0x8a7458, 0, 0.012, 0.35, 3.8, 0.025, 2.4);
    const post = (x, z) => B(g, fc, x, 0.55, z, 0.09, 1.1, 0.09);
    for (let x = x1; x <= x2 + 0.01; x += 0.975) { post(x, z2); post(x, z1); }
    for (let z = z1 + 0.725; z < z2; z += 0.725) { post(x1, z); post(x2, z); }
    const rail = (xa, za, xb, zb, y) => beam(g, fc, [xa, y, za], [xb, y, zb], 0.05, 0.05, [0, 1, 0]);
    for (const y of [0.35, 0.75, 1.08]) { rail(x1, z2, -0.35, z2, y); rail(0.35, z2, x2, z2, y); rail(x1, z1, x2, z1, y); rail(x1, z1, x1, z2, y); rail(x2, z1, x2, z2, y); }
    // калитка
    B(g, trim, 0.0, 0.62, z2, 0.7, 0.07, 0.05); B(g, trim, 0.0, 0.92, z2, 0.7, 0.07, 0.05); beam(g, trim, [-0.34, 0.45, z2 + 0.01], [0.34, 1.0, z2 + 0.01], 0.06, 0.04, [0, 0, 1]);
    // кормушка и поилка, жёрдочка
    Y(g, 0x9aa0a4, 0.9, 0.12, 0.6, 0.2, 0.24, 10); CT(g, 0x8a9096, 0.9, 0.35, 0.6, 0.12, 0.2, 0.3, 10); CT(g, 0x7a8086, 0.9, 0.56, 0.6, 0.3, 0.02, 0.14, 10);
    Y(g, 0x4a7a9a, -0.4, 0.06, 0.9, 0.2, 0.1, 10); B(g, 0x6b4a30, 1.5, 0.28, -0.7, 0.08, 0.56, 0.08); B(g, 0x6b4a30, 1.5, 0.52, 0.05, 0.08, 0.06, 1.6);
    blob(g, 0xd9b35a, 1.2, 0.07, -0.9, 0.5, 0.14, 0.4);
    const mesh = new T.Group();
    for (const [xa, za, xb, zb] of [[x1, z2, x2, z2], [x1, z1, x1, z2], [x2, z1, x2, z2]]) { const l = Math.hypot(xb - xa, zb - za), m = new T.Mesh(new T.PlaneGeometry(l, 0.85), glassMatDS); m.position.set((xa + xb) / 2, 0.58, (za + zb) / 2); m.rotation.y = Math.atan2(xb - xa, zb - za) - PI / 2; mesh.add(m); }
    const wire = new T.MeshLambertMaterial({ color: 0xc8cdd0, transparent: true, opacity: 0.26, depthWrite: false, side: T.DoubleSide });
    return finish(g, 51 + v, [mergeInto(mesh, wire, false)]);
  });

  // ================================================================== СВИНАРНИК
  reg('pigsty', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), brick = surf('bld_brick', [0xffffff, 0xe8d2c0, 0xf0e0d0][v % 3]), cap = 0xb8b2a4, timber = 0x7a5a3a;
    const zb = -1.85, zf = 0.35;
    B(g, PLINTH, 0, 0.1, -0.7, 6.0, 0.2, 2.9);
    B(g, brick, 0, 0.9, zb, 5.8, 1.5, 0.3);
    for (const s of [-1, 1]) B(g, brick, s * 2.85, 0.85, -0.75, 0.3, 1.4, 2.6);
    B(g, brick, 0, 0.8, -0.75, 0.22, 1.2, 2.4);
    // фасад-стенка с проёмами
    for (const [a, b] of [[-3.0, -2.0], [-1.0, 1.0], [2.0, 3.0]]) B(g, brick, (a + b) / 2, 0.55, zf, b - a, 0.9, 0.3);
    for (const x of [-1.5, 1.5]) { B(g, timber, x - 0.52, 0.8, zf + 0.03, 0.12, 1.2, 0.34); B(g, timber, x + 0.52, 0.8, zf + 0.03, 0.12, 1.2, 0.34); B(g, timber, x, 1.42, zf + 0.03, 1.2, 0.14, 0.34); B(g, 0x1d1612, x, 0.7, zf - 0.05, 0.9, 1.1, 0.05); }
    B(g, cap, 0, 1.06, zf, 6.0, 0.08, 0.38); // перекрытие-закрепление (поручень) не перекрывает проёмы
    B(g, cap, 0, 1.68, zb, 6.0, 0.1, 0.4);
    // крыша односкатная к фасаду + конёк
    const rs = surf('bld_tile', mix(0xc25a3c, 0x8a5a48, v * 0.35));
    slab3(g, rs, [0, 2.15, zb - 0.25], [0, 1.55, zf + 0.5], [1, 0, 0], 6.3, 0.12);
    for (const s of [-1, 1]) B(g, brick, s * 2.85, 1.6, -0.75, 0.3, 0.2, 2.6);
    B(g, timber, 0, 2.18, zb - 0.3, 6.35, 0.12, 0.12); B(g, timber, 0, 1.57, zf + 0.55, 6.35, 0.1, 0.1);
    for (const x of [-2.7, 0, 2.7]) beam(g, timber, [x, 1.5, zf + 0.35], [x, 1.45, zf + 0.35], 0.1, 0.1);
    for (const x of [-3.0, 3.0]) B(g, timber, x, 0.8, zf + 0.42, 0.12, 1.6, 0.12);
    B(g, 0x7d8388, 0, 1.5, zf + 0.58, 6.3, 0.07, 0.1);
    // двор: забор и грязь
    const z2 = 2.0, fc = 0x8a6a42;
    B(g, 0x5a4530, 0.0, 0.015, 1.2, 5.6, 0.03, 1.5); B(g, 0x4a3828, 1.3, 0.025, 1.3, 1.6, 0.04, 0.9);
    for (let x = -3.0; x <= 3.01; x += 1.0) { B(g, fc, x, 0.5, z2, 0.1, 1.0, 0.1); }
    for (const s of [-1, 1]) for (let z = zf + 0.55; z < z2; z += 0.55) B(g, fc, s * 3.0, 0.5, z, 0.1, 1.0, 0.1);
    for (const y of [0.35, 0.75]) { B(g, fc, -1.5, y, z2, 3.0, 0.07, 0.06); B(g, fc, 2.0, y, z2, 2.0, 0.07, 0.06); for (const s of [-1, 1]) B(g, fc, s * 3.0, y, (zf + z2) / 2 + 0.1, 0.06, 0.07, z2 - zf - 0.1); }
    // калитка
    B(g, 0xb89a6a, 0.0, 0.35, z2 + 0.02, 0.9, 0.07, 0.05); B(g, 0xb89a6a, 0.0, 0.75, z2 + 0.02, 0.9, 0.07, 0.05); beam(g, 0xb89a6a, [-0.42, 0.35, z2 + 0.05], [0.42, 0.78, z2 + 0.05], 0.07, 0.04, [0, 0, 1]);
    // корыта
    for (const x of [-1.5, 1.5]) { const tz = 1.1; B(g, 0x6b4a30, x, 0.17, tz, 1.1, 0.12, 0.34); B(g, 0x6b4a30, x, 0.3, tz - 0.18, 1.1, 0.26, 0.05, -0.25, 0, 0); B(g, 0x6b4a30, x, 0.3, tz + 0.18, 1.1, 0.26, 0.05, 0.25, 0, 0); B(g, 0x8a7a4a, x, 0.26, tz, 1.0, 0.05, 0.22); for (const dx of [-0.45, 0.45]) B(g, 0x5a432f, x + dx, 0.08, tz, 0.07, 0.16, 0.4); }
    // свиньи (простые)
    for (const [x, z, r, sc] of [[-1.5, -0.8, 0.3, 1], [1.4, -0.6, -0.5, 0.9], [-2.0, 1.4, 0.8, 0.8]]) { const p = new T.Group(); blob(p, 0xe9a3b0, 0, 0.32, 0, 0.8, 0.5, 0.45); blob(p, 0xe9a3b0, 0.42, 0.34, 0, 0.32, 0.3, 0.3); blob(p, 0xd98a9a, 0.6, 0.31, 0, 0.12, 0.12, 0.14); for (const dx of [-0.25, 0.25]) for (const dz of [-0.14, 0.14]) B(p, 0xd98a9a, dx, 0.08, dz, 0.07, 0.16, 0.07); p.position.set(x, 0, z); p.rotation.y = r; p.scale.setScalar(sc); g.add(p); }
    barrel(g, 3.35, 0, 0.9, 0.3, 0.8, 0x4a6a8a); B(g, 0xb89a6a, -3.4, 0.2, 0.9, 0.5, 0.4, 0.4);
    return finish(g, 61 + v);
  });

  // @@END
})();
