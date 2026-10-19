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
  function tmat(name, tint, extra) { const dbl = !!(extra && extra.side === T.DoubleSide); return C.texMat(name, 1, 1, tint, dbl ? 0.0001 : 0, 0, 0, Object.assign({ color: tint }, extra || {})); }
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
    seg = seg || 10; const geo = cylU[seg] || (cylU[seg] = new T.CylinderGeometry(0.5, 0.5, 1, seg));
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
  function facePoly(g, spec, pts, x, y, z, ry, dbl) {
    const sh = new T.Shape(pts.map((p) => new T.Vector2(p[0], p[1]))), geo = new T.ShapeGeometry(sh);
    let m;
    if (typeof spec === 'number') m = new T.Mesh(geo, C.mat(spec));
    else { const s = TILE[spec.tex] || [1, 1], uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / s[0], uv.getY(i) / s[1]); m = new T.Mesh(geo, tmat(spec.tex, spec.tint, dbl ? { side: T.DoubleSide } : null)); }
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
  const WHITE = 0xf1ede2;
  const PLINTH = surf('bld_stone', 0x8f8b82);

  /** Окно, лицом к +Z, начало = низ-центр на поверхности стены. */
  function windowUnit(o) {
    const g = new T.Group(), w = o.w, h = o.h, f = o.frame != null ? o.frame : WHITE, ft = o.ft || 0.07, mull = o.mull || 'cross';
    B(g, o.glass != null ? o.glass : 0x4f6a7a, 0, h / 2, 0.02, w - ft, h - ft, 0.04);
    B(g, f, 0, h - ft / 2, 0.05, w, ft, 0.1); B(g, f, 0, ft / 2, 0.05, w, ft, 0.1); B(g, f, -w / 2 + ft / 2, h / 2, 0.05, ft, h, 0.1); B(g, f, w / 2 - ft / 2, h / 2, 0.05, ft, h, 0.1);
    if (mull === 'cross' || mull === 'v') B(g, f, 0, h / 2, 0.06, 0.045, h - ft, 0.07);
    if (mull === 'cross') B(g, f, 0, h * 0.6, 0.06, w - ft, 0.045, 0.07);
    if (mull === 'grid') { B(g, f, -w / 6, h / 2, 0.06, 0.035, h - ft, 0.06); B(g, f, w / 6, h / 2, 0.06, 0.035, h - ft, 0.06); B(g, f, 0, h * 0.5, 0.06, w - ft, 0.035, 0.06); }
    if (o.sill !== false) B(g, o.sill != null ? o.sill : 0xcfc8b8, 0, -0.03, 0.1, w + 0.2, 0.07, 0.2);
    if (o.lintel != null) B(g, o.lintel, 0, h + 0.08, 0.05, w + 0.3, 0.14, 0.12);
    if (o.shutter != null) for (const s of [-1, 1]) {
      const sw = w * 0.5 - 0.02, sx = s * (w / 2 + sw / 2 + 0.05), sc = o.shutter;
      B(g, sc, sx, h / 2, 0.04, sw, h + 0.04, 0.05);
      for (let k = 0; k < 2; k++) B(g, shade(sc, 0.78), sx, h * (0.3 + k * 0.4), 0.075, sw - 0.06, 0.05, 0.02);
    }
    if (o.box) {
      const bw = w + 0.12, bc = o.boxColor != null ? o.boxColor : 0x6b4a30;
      B(g, bc, 0, -0.17, 0.22, bw, 0.22, 0.26); B(g, shade(bc, 0.8), 0, -0.07, 0.23, bw - 0.04, 0.03, 0.22);
      const cols = o.flowers || [0xc23b2a, 0xd9768a, 0xe6c03a, 0xf2efe6];
      blob(g, 0x4a7a3a, -bw * 0.22, -0.02, 0.22, bw * 0.55, 0.18, 0.24); blob(g, 0x4a7a3a, bw * 0.22, -0.02, 0.22, bw * 0.55, 0.18, 0.24);
      for (let k = 0; k < 3; k++) { const bx = -bw / 2 + 0.2 + k * (bw - 0.4) / 2; blob(g, cols[k % cols.length], bx + (k % 2 ? 0.04 : -0.04), 0.1, 0.25, 0.15); }
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
    { plaster: 0xeee4cf, timber: 0x4f3524, roof: 0xa9452f, shut: 0x4d6b45, trim: 0xf1ede2, porch: 'shed', dorm: 3, chim: 1, flowers: [0xc23b2a, 0xd9768a, 0xe6c03a, 0xf2efe6] },
    { plaster: 0xe9dcb4, timber: 0x3e2c20, roof: 0x8e4a38, shut: 0x56708a, trim: 0xf1ede2, porch: 'gable', dorm: 2, chim: 2, flowers: [0xd9768a, 0xf2efe6, 0x9a6fc0, 0xe6c03a] },
    { plaster: 0xe3dfd2, timber: 0x5a3d2a, roof: 0xa85c3a, shut: 0x7c3a30, trim: 0xd9d2c0, porch: 'wide', dorm: 3, chim: 2, flowers: [0xe6c03a, 0xc23b2a, 0xf2efe6, 0xe08a3a] },
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
  function farmEnd(g, V, x0, ry, hw, yw, yr, zc) {
    const W = new T.Group(); W.position.set(x0, 0, zc); W.rotation.y = ry; g.add(W);
    const tb = V.timber, d = 0.14, zp = d / 2 - 0.02, ww = hw * 2;
    B(W, tb, 0, 0.55, zp, ww + 0.1, 0.22, d); B(W, tb, 0, 3.2, zp, ww + 0.1, 0.3, d + 0.04); B(W, tb, 0, 5.62, zp, ww + 0.1, 0.2, d);
    for (const x of [-hw + 0.0, hw - 0.0]) B(W, tb, x * 0.995, 3.1, zp + 0.01, 0.26, 5.3, d + 0.06);
    for (const x of [-1.5, 1.5]) { B(W, tb, x, 1.85, zp, 0.14, 2.7, d); B(W, tb, x, 4.4, zp, 0.14, 2.4, d); }
    for (const y of [1.3, 3.95]) { const u = windowUnit({ w: 0.95, h: y < 2 ? 1.4 : 1.3, shutter: V.shut, frame: V.trim }); u.position.set(0, y, 0); W.add(u); }
    // фронтон
    facePoly(W, surf('bld_plaster', V.plaster), [[-hw, yw], [hw, yw], [0, yr - 0.1]], 0, 0, 0.0, 0);
    B(W, tb, 0, (7.04 + yr - 0.15) / 2, zp + 0.01, 0.15, yr - 0.15 - 7.04, d);
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
    B(g, shade(o.roof, 0.82), x, yr + cth * 0.95, zm, 0.14, 0.14, wd + 0.02, 0, 0, PI / 4);
    B(g, o.trim, x, yw + 0.02, zf + 0.06, w + 0.2, 0.08, 0.08);
  }
  reg('farmhouse', (opts) => {
    const { v } = optsOf(opts), V = FARM_V[v % 3], g = new T.Group(), gl = new T.Group();
    const hw = 3.0, zc = -0.5, yw = 5.7, th = 0.18, pitch = 50 * PI / 180, tn = Math.tan(pitch), ov = 0.55, ovx = 0.5, L = 10;
    const topEave = yw + th / Math.cos(pitch), yr = topEave + hw * tn;
    B(g, PLINTH, 0, 0.225, zc, 10.3, 0.45, hw * 2 + 0.3);
    B(g, surf('bld_plaster', V.plaster), 0, 3.075, zc, 10, 5.25, hw * 2);
    farmWall(g, V, zc + hw + 0.0, 0, true, V); farmWall(g, V, zc - hw, PI, false, V);
    farmEnd(g, V, 5.0, PI / 2, hw, yw, yr - 0.15, zc); farmEnd(g, V, -5.0, -PI / 2, hw, yw, yr - 0.15, zc);
    // крыша
    const rs = surf('bld_tile', V.roof);
    for (const s of [-1, 1]) slab3(g, rs, [0, topEave - ov * tn, zc + s * (hw + ov)], [0, yr, zc], [1, 0, 0], L + 2 * ovx, th);
    B(g, shade(V.roof, 0.82), 0, yr + 0.03, zc, L + 2 * ovx + 0.06, 0.3, 0.3, PI / 4);
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
    const wood = surf('bld_planks', 0x9a7a55), zw = zc + hw, pz = zw + 1.4;
    if (V.porch === 'wide') {
      B(g, wood, 0, 0.5, zw + 0.75, 9.6, 0.12, 1.5); B(g, PLINTH, 0, 0.22, zw + 0.75, 9.4, 0.44, 1.4);
      for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) B(g, V.trim, x, 1.55, pz - 0.05, 0.16, 2.2, 0.16);
      slab3(g, rs, [0, 3.35, zw], [0, 2.6, pz + 0.35], [1, 0, 0], 10.2, 0.12); B(g, V.trim, 0, 2.55, pz + 0.35, 10.2, 0.1, 0.1);
      for (let i = -4; i <= 4; i++) if (Math.abs(i * 1.1) > 1.2) B(g, V.trim, i * 1.1, 0.95, pz - 0.05, 0.05, 0.85, 0.05); B(g, V.trim, -2.9, 1.4, pz - 0.05, 3.7, 0.07, 0.08); B(g, V.trim, 2.9, 1.4, pz - 0.05, 3.7, 0.07, 0.08);
      B(g, 0xa9a498, 0, 0.19, pz + 0.28, 1.9, 0.38, 0.45); B(g, 0xa9a498, 0, 0.095, pz + 0.7, 1.9, 0.19, 0.42);
    } else if (V.porch === 'gable') {
      B(g, wood, 0, 0.5, zw + 0.75, 3.6, 0.12, 1.5); B(g, PLINTH, 0, 0.22, zw + 0.75, 3.4, 0.44, 1.4);
      for (const s of [-1, 1]) { B(g, V.trim, s * 1.6, 1.5, pz + 0.05, 0.18, 2.1, 0.18); for (let k = 0; k < 5; k++) B(g, V.trim, s * (0.4 + k * 0.28) + 0.0, 0.95, pz + 0.05, 0.05, 0.8, 0.05); }
      B(g, V.trim, -1.0, 1.4, pz + 0.05, 1.2, 0.07, 0.08); B(g, V.trim, 1.0, 1.4, pz + 0.05, 1.2, 0.07, 0.08);
      for (const s of [-1, 1]) { slab3(g, rs, [s * 2.05, 2.75, zw + 0.9], [0, 3.85, zw + 0.9], [0, 0, 1], 2.5, 0.12); }
      facePoly(g, surf('bld_plaster', V.plaster), [[-1.95, 2.65], [1.95, 2.65], [0, 3.8]], 0, 0, pz + 0.12, 0); B(g, V.timber, 0, 2.62, pz + 0.12, 4.2, 0.12, 0.1);
      B(g, shade(V.roof, 0.82), 0, 3.9, zw + 0.9, 0.12, 0.12, 2.52, 0, 0, PI / 4);
      B(g, 0xa9a498, 0, 0.19, pz + 0.28, 1.9, 0.38, 0.45); B(g, 0xa9a498, 0, 0.095, pz + 0.7, 1.9, 0.19, 0.42);
    } else {
      B(g, wood, 0, 0.5, zw + 0.75, 6.0, 0.12, 1.5); B(g, PLINTH, 0, 0.22, zw + 0.75, 5.8, 0.44, 1.4);
      for (const x of [-2.8, -0.9, 0.9, 2.8]) B(g, V.trim, x, 1.55, pz, 0.15, 2.2, 0.15);
      slab3(g, rs, [0, 3.35, zw], [0, 2.6, pz + 0.35], [1, 0, 0], 6.6, 0.12); B(g, V.trim, 0, 2.55, pz + 0.35, 6.6, 0.1, 0.1);
      for (let k = 0; k < 7; k++) { B(g, V.trim, -2.7 + k * 0.26, 0.98, pz, 0.05, 0.85, 0.05); B(g, V.trim, 2.7 - k * 0.26, 0.98, pz, 0.05, 0.85, 0.05); }
      B(g, V.trim, -1.85, 1.4, pz, 1.9, 0.07, 0.08); B(g, V.trim, 1.85, 1.4, pz, 1.9, 0.07, 0.08);
      for (const s of [-1, 1]) { for (let k = 0; k < 6; k++) B(g, V.trim, s * 2.8, 0.98, zw + 0.2 + k * 0.28, 0.05, 0.85, 0.05); B(g, V.trim, s * 2.8, 1.4, zw + 0.85, 0.08, 0.07, 1.6); }
      B(g, 0xa9a498, 0, 0.19, pz + 0.28, 1.9, 0.38, 0.45); B(g, 0xa9a498, 0, 0.095, pz + 0.7, 1.9, 0.19, 0.42);
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
    const ovf = o.ovf == null ? ov : o.ovf;
    for (const s of [-1, 1]) { const oo = s > 0 ? ovf : ov; slab3(g, o.spec, [o.xc, topEave - oo * tn, o.zc + s * (o.hw + oo)], [o.xc, yr, o.zc], [1, 0, 0], W, th); }
    if (o.cap !== false) { const cs2 = o.capS || 0.26; B(g, o.ridge != null ? o.ridge : 0x9a3f2a, o.xc, yr + 0.03, o.zc, W + 0.06, cs2, cs2, PI / 4); }
    if (o.gutter !== false) { gutterLine(g, o.xc - W / 2 + 0.1, o.xc + W / 2 - 0.1, topEave - ovf * tn - 0.05, o.zc + o.hw + ovf - 0.03); gutterLine(g, o.xc - W / 2 + 0.1, o.xc + W / 2 - 0.1, topEave - ov * tn - 0.05, o.zc - o.hw - ov + 0.03); }
    return { yr, topEave, tn, ov, W };
  }
  function gableEnds(g, spec, o, yr) {
    for (const s of [-1, 1]) facePoly(g, spec, [[-o.hw, o.yw], [o.hw, o.yw], [0, yr - 0.12]], o.xc + s * o.L / 2, 0, o.zc, s > 0 ? PI / 2 : -PI / 2, true);
  }
  /** Группа-стена: x вдоль стены, z наружу. */
  function wallGroup(g, x, z, ry) { const W = new T.Group(); W.position.set(x, 0, z); W.rotation.y = ry || 0; g.add(W); return W; }
  function cornerBoards(g, x1, x2, z1, z2, y0, y1, col, w) { for (const x of [x1, x2]) for (const z of [z1, z2]) B(g, col, x, (y0 + y1) / 2, z, w || 0.2, y1 - y0, w || 0.2); }

  // ================================================================== КОТТЕДЖ
  const COT_V = [
    { wall: 0xeee3c8, roof: 0xa7452f, dorm: true, chim: true, shut: 0x4d6b45, box: true },
    { wall: 0xe0bb72, roof: 0xa7452f, dorm: false, chim: true, shut: 0x7c3a30, box: false },
    { wall: 0xe9c9bd, roof: 0x5f4538, dorm: true, chim: false, shut: 0x5a6e5a, box: true },
    { wall: 0xb4c3cf, roof: 0x5f4538, dorm: false, chim: false, shut: 0xece6d4, box: false },
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
    // ворота укладываются под свес гамбрел-крыши (верх 3.1 м), направляющая висит под кровлей, а не на скате
    const dTop = 3.1, dH = dTop - 0.4, dC = (dTop + 0.4) / 2;
    for (const s of [-1, 1]) {
      const cx = xm + s * 1.2;
      B(g, doorS, cx, dC, DZ, 2.35, dH, 0.1);
      B(g, trim, cx, dTop - 0.08, DZ + 0.06, 2.35, 0.15, 0.05); B(g, trim, cx, 0.5, DZ + 0.06, 2.35, 0.15, 0.05);
      B(g, trim, cx - 1.1, dC, DZ + 0.06, 0.15, dH, 0.05); B(g, trim, cx + 1.1, dC, DZ + 0.06, 0.15, dH, 0.05); B(g, trim, cx, dC, DZ + 0.06, 0.15, dH, 0.05);
      beam(g, trim, [cx - 1.1, 0.5, DZ + 0.07], [cx + 1.1, dTop - 0.1, DZ + 0.07], 0.14, 0.05, [0, 0, 1]); beam(g, trim, [cx - 1.1, dTop - 0.1, DZ + 0.07], [cx + 1.1, 0.5, DZ + 0.07], 0.14, 0.05, [0, 0, 1]);
      B(g, 0x3a3a38, cx - s * 0.2, 1.6, DZ + 0.1, 0.05, 0.5, 0.05);
    }
    B(g, trim, xm - 2.47, (0.4 + dTop + 0.15) / 2, hz + 0.06, 0.16, dTop + 0.15 - 0.4, 0.1); B(g, trim, xm + 2.47, (0.4 + dTop + 0.15) / 2, hz + 0.06, 0.16, dTop + 0.15 - 0.4, 0.1); B(g, trim, xm, dTop + 0.1, hz + 0.08, 5.1, 0.18, 0.12);
    B(g, 0x555a5e, xm, dTop + 0.22, hz + 0.2, 9.6, 0.1, 0.1); for (const x of [-3.8, -1.2, 1.2, 3.8]) B(g, 0x555a5e, xm + x, dTop + 0.15, hz + 0.13, 0.07, 0.14, 0.2);
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
      B(g, 0x5e4538, x, Ry + 0.45, 0, 0.9, 0.6, 0.9); for (let k = 0; k < 3; k++) for (const [dx, dz, sx, sz] of [[0, 0.46, 0.7, 0.04], [0, -0.46, 0.7, 0.04], [0.46, 0, 0.04, 0.7], [-0.46, 0, 0.04, 0.7]]) B(g, 0x2a211b, x + dx, Ry + 0.28 + k * 0.17, dz, sx, 0.07, sz);
      CT(g, rcap, x, Ry + 1.0, 0, 0.72, 0.02, 0.62, 4, 0, PI / 4, 0);
    }
    B(g, 0x3a3a38, xm + 4.2, Ry + 1.55, 0, 0.04, 0.45, 0.04); B(g, 0x3a3a38, xm + 4.2, Ry + 1.78, 0, 0.7, 0.08, 0.04); blob(g, 0x3a3a38, xm + 4.55, Ry + 1.78, 0, 0.12);
    // --- пристройка (навес) справа
    {
      const x1 = xm + BW / 2, x2 = x1 + 3.55, zz = 4.5, wall = surf('bld_planks', 0x6e5242);
      B(g, wood, x2 - 0.1, 1.55, 0, 0.2, 2.3, zz * 2 - 0.2); B(g, PLINTH, (x1 + x2) / 2, 0.2, 0, x2 - x1 + 0.2, 0.4, zz * 2 + 0.1);
      facePoly(g, wall, [[x1, 0.4], [x2 - 0.1, 0.4], [x2 - 0.1, 2.8], [x1, 3.95]], 0, 0, -zz + 0.05, PI);
      B(g, wall, (x1 + x2) / 2, 1.2, 0, 0.0, 0.0, 0.0);
      const rs2 = surf('bld_seam', shade(v === 1 ? 0x7a3d30 : (v === 2 ? 0x4a4f54 : 0x376a47), 0.92));
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
    const PL = [0xf0ebdc, 0xe8e1cd, 0xeaeadf][v % 3], roofT = [0xa7452f, 0x8f4c38, 0xa65a38][v % 3];
    const plast = surf('bld_plaster', PL), rs = surf('bld_tile', roofT), tm = 0x4f3524;
    B(g, PLINTH, 0, 0.2, 0, L + 0.2, 0.4, hw * 2 + 0.2);
    B(g, plast, 0, (y0 + yw) / 2, -hw + 0.15, L, yw - y0, 0.3);               // задняя стена
    for (const s of [-1, 1]) B(g, plast, s * (L / 2 - 0.15), (y0 + yw) / 2, 0, 0.3, yw - y0, hw * 2);   // торцы
    const xs = -3, xe = L / 2;
    B(g, plast, (xs + xe) / 2, (y0 + yw) / 2, hw - 0.15, xe - xs, yw - y0, 0.3);   // закрытая часть фасада
    B(g, 0x6b5a45, (xs - L / 2) / 2 - 0.0, 0.5, 0.0, L / 2 + xs - 0.4, 0.2, hw * 2 - 0.6);   // пол (солома/земля) открытой части
    B(g, 0xb89a55, (xs - L / 2) / 2, 0.62, -1.6, L / 2 + xs - 0.6, 0.12, 1.5);
    const R = gableRoofX(g, { spec: rs, xc: 0, zc: 0, L, hw, yw, pitch: 31 * PI / 180, th: 0.16, ov: 0.7, ovf: 0.55, ovx: 0.5, ridge: shade(roofT, 0.82) });
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
    for (const x of [-8.8, -6.9, -5.0, -3.1]) { B(g, tm, x, 1.46, oz, 0.22, 2.92, 0.22); B(g, 0x4a4338, x, 0.1, oz, 0.4, 0.2, 0.4); }   // столбы стоят на земле, верх под кровлей
    B(g, tm, -5.95, 2.72, oz, 6.0, 0.22, 0.22);
    for (const x of [-7.8, -6.0, -4.2]) { beam(g, tm, [x, 2.75, oz], [x + 0.4, 2.35, oz], 0.1, 0.1); beam(g, tm, [x, 2.75, oz], [x - 0.4, 2.35, oz], 0.1, 0.1); }
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
    // задняя стена: окна и служебная дверь (раньше была глухой)
    { const K = wallGroup(g, 0, -hw, PI);
      for (const x of [-7.4, -4.4, -2.0, 2.0, 4.4, 7.4]) { const u = windowUnit({ w: 0.8, h: 0.7, frame: trim, mull: 'cross', shutter: 0x4d6b45 }); u.position.set(x, 1.5, 0); K.add(u); }
      const sd = doorUnit({ color: 0x5e4430, frame: trim, w: 1.0, h: 2.1 }); sd.position.set(0, y0, 0); K.add(sd); }
    for (const x of [-1.8, 1.8, 5.5]) downpipe(g, x > 0 ? 9.15 : -9.15, hw + 0.1, 0.4, 2.6);
    // перед входом: поилка и коновязь
    B(g, 0x6b4a30, 5.0, 0.4, hw + 1.1, 1.8, 0.4, 0.55); B(g, 0x4a7a9a, 5.0, 0.52, hw + 1.1, 1.6, 0.06, 0.4);
    for (const x of [1.0, 7.0]) B(g, tm, x, 0.55, hw + 1.5, 0.12, 1.1, 0.12); B(g, tm, 4.0, 0.95, hw + 1.5, 6.1, 0.1, 0.1);
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
    const R = gableRoofX(g, { spec: surf('bld_tile', mix(0xa7452f, 0x5f4538, v * 0.4)), xc: hx, zc: hz, L: 2.0, hw: 0.75, yw: floorY + 1.35, pitch: 28 * PI / 180, th: 0.08, ov: 0.3, ovx: 0.25, ridge: 0x6a3a2c, gutter: false, capS: 0.12 });
    gableEnds(g, wall, { xc: hx, zc: hz, L: 2.0, hw: 0.75, yw: floorY + 1.35 }, R.yr);
    const F = wallGroup(g, hx, hz + 0.75, 0);
    B(F, 0x1d1612, 0.0, 0.55, 0.01, 0.46, 0.56, 0.04); B(F, trim, 0, 0.9, 0.04, 0.58, 0.07, 0.06); B(F, trim, -0.27, 0.55, 0.04, 0.07, 0.56, 0.06); B(F, trim, 0.27, 0.55, 0.04, 0.07, 0.56, 0.06);
    const u = windowUnit({ w: 0.5, h: 0.5, frame: trim, mull: 'cross' }); u.position.set(0.7, 0.9, 0); F.add(u);
    B(F, 0x5a432f, -0.6, 0.62, 0.15, 0.04, 0.5, 0.04); B(F, 0x5a432f, -0.9, 0.62, 0.15, 0.04, 0.5, 0.04);
    // трап
    beam(g, 0x9a7a55, [hx, floorY + 0.12, hz + 0.9], [hx, 0.12, hz + 2.1], 0.04, 0.4, [1, 0, 0]);
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; B(g, 0x5a432f, hx, floorY + 0.12 + (0.1 - floorY - 0.12) * t + 0.04, hz + 0.9 + 1.2 * t, 0.4, 0.03, 0.04, -0.5, 0, 0); }
    // гнездовые ящики сбоку
    const nx = hx + 1.55;
    B(g, wall, nx - 0.05, floorY + 0.4, hz, 0.7, 0.6, 1.3); B(g, 0x5a432f, nx - 0.05, floorY + 0.7, hz, 0.78, 0.05, 1.38);
    slab3(g, surf('bld_tile', 0x5f4538), [nx - 0.45, floorY + 0.95, hz], [nx + 0.4, floorY + 0.68, hz], [0, 0, 1], 1.45, 0.05);
    for (const dz of [-0.4, 0.0, 0.4]) { B(g, 0x2a211b, nx + 0.3, floorY + 0.4, hz + dz, 0.04, 0.3, 0.3); blob(g, 0xd9b35a, nx + 0.15, floorY + 0.25, hz + dz, 0.3, 0.12, 0.28); }
    // выгул
    const x1 = -2.0, x2 = 1.9, z1 = -1.45, z2 = 1.45, fc = 0x8a6a42;
    B(g, 0x76674d, 0, 0.012, 0.35, 3.8, 0.025, 2.4);
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
    B(g, brick, 0, 1.065, zb, 5.8, 1.83, 0.3);                       // задняя стена доходит до самой кровли (без щели)
    for (const s of [-1, 1]) {
      B(g, brick, s * 2.85, 0.85, -0.75, 0.3, 1.4, 2.6);
      // кирпичный треугольник над боковой стеной до подошвы односкатной крыши
      facePoly(g, brick, s > 0 ? [[2.05, 1.55], [-0.25, 1.55], [2.05, 2.02]] : [[-2.05, 1.55], [0.25, 1.55], [-2.05, 2.02]], s * 3.0, 0, 0, s * PI / 2, true);
    }
    B(g, brick, 0, 0.8, -0.75, 0.22, 1.2, 2.4);
    // фасад-стенка с проёмами (стена идёт до кровли, над проёмами деревянные перемычки)
    for (const [a, b] of [[-3.0, -2.0], [-1.0, 1.0], [2.0, 3.0]]) B(g, brick, (a + b) / 2, 0.815, zf, b - a, 1.33, 0.3);
    for (const x of [-1.5, 1.5]) { B(g, timber, x - 0.52, 0.8, zf + 0.03, 0.12, 1.2, 0.34); B(g, timber, x + 0.52, 0.8, zf + 0.03, 0.12, 1.2, 0.34); B(g, timber, x, 1.42, zf + 0.03, 1.2, 0.14, 0.34); B(g, 0x1d1612, x, 0.7, zf - 0.05, 0.9, 1.1, 0.05); B(g, cap, x, 0.17, zf + 0.12, 1.0, 0.06, 0.4); }
    // крыша односкатная к фасаду + конёк
    const rs = surf('bld_tile', mix(0xa7452f, 0x8a5a48, v * 0.35));
    slab3(g, rs, [0, 2.15, zb - 0.25], [0, 1.55, zf + 0.5], [1, 0, 0], 6.3, 0.12);
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
    for (const [x, z, r, sc] of [[-1.5, -0.8, 0.3, 1], [1.4, -0.6, -0.5, 0.9], [-0.2, 1.4, 0.6, 0.85], [2.5, 1.45, -0.3, 0.8]]) { const p = new T.Group(); blob(p, 0xe9a3b0, 0, 0.32, 0, 0.8, 0.5, 0.45); blob(p, 0xe9a3b0, 0.42, 0.34, 0, 0.32, 0.3, 0.3); blob(p, 0xd98a9a, 0.6, 0.31, 0, 0.12, 0.12, 0.14); for (const dx of [-0.25, 0.25]) for (const dz of [-0.14, 0.14]) B(p, 0xd98a9a, dx, 0.08, dz, 0.07, 0.16, 0.07); p.position.set(x, 0, z); p.rotation.y = r; p.scale.setScalar(sc); g.add(p); }
    barrel(g, 3.3, 0, 0.5, 0.28, 0.8, 0x4a6a8a); B(g, 0xb89a6a, -3.3, 0.2, 0.6, 0.45, 0.4, 0.4);
    return finish(g, 61 + v);
  });

  defTex('bld_bales', 0.9, 0.92, 256, (cv, g, S) => {
    const r = lcg(137); g.fillStyle = '#d3ad55'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < 2; row++) {
      const y = row * S / 2, off = row ? S * 0.5 : 0;
      for (let i = 0; i < 260; i++) { g.strokeStyle = r() < 0.5 ? rgb(150, 110, 40, 0.5) : rgb(245, 215, 120, 0.6); g.lineWidth = 1; const x = r() * S, yy = y + r() * S / 2; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 12 + r() * 26, yy + (r() - 0.5) * 3); g.stroke(); }
      g.fillStyle = rgb(60, 40, 20, 0.9); g.fillRect(0, y, S, 3);
      for (let k = -1; k < 2; k++) { const bx = off + k * S; g.fillStyle = rgb(60, 40, 20, 0.85); g.fillRect(bx % S - 1.5, y, 3, S / 2); g.fillStyle = rgb(70, 50, 28, 0.9); g.fillRect((bx + S * 0.3) % S, y, 2, S / 2); g.fillRect((bx + S * 0.7) % S, y, 2, S / 2); }
    }
  });

  // ================================================================== СИЛОС
  function siloUnit(g, x, z, r, h, o) {
    o = o || {}; const tint = o.tint != null ? o.tint : 0xbcc1c4, y0 = 0.5, yb = y0 + h;
    Y(g, 0xb2afa4, x, 0.3, z, r + 0.2, 0.6, 20);
    const geo = new T.CylinderGeometry(r, r, h, 20, 1, true), uv = geo.attributes.uv, rx = Math.max(2, Math.round(2 * PI * r / 2.0)), ry = h / 2.56;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
    const body = new T.Mesh(geo, tmat('bld_silo', tint)); body.position.set(x, y0 + h / 2, z); body.castShadow = body.receiveShadow = true; g.add(body);
    for (let y = 2.5; y < h - 0.5; y += 2.5) Y(g, 0x7f8588, x, y0 + y, z, r + 0.035, 0.1, 20);
    Y(g, 0x80868a, x, yb - 0.02, z, r + 0.1, 0.22, 20);
    const capH = r * 0.62; CT(g, o.cap != null ? o.cap : 0x8f969b, x, yb + capH / 2, z, r + 0.1, 0.18, capH, 20);
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; beam(g, 0x70777c, [x + (r + 0.06) * Math.cos(a), yb + 0.08, z + (r + 0.06) * Math.sin(a)], [x + 0.2 * Math.cos(a), yb + capH, z + 0.2 * Math.sin(a)], 0.07, 0.05); }
    Y(g, 0x6f767b, x, yb + capH + 0.1, z, 0.24, 0.3, 10); CT(g, 0x5f666b, x, yb + capH + 0.38, z, 0.34, 0.02, 0.26, 10);
    B(g, 0x70777c, x + r * 0.35, yb + capH * 0.55, z - r * 0.3, 0.5, 0.5, 0.5, 0, 0.4, 0); // люк
    return yb + capH;
  }
  function siloLadder(g, x, z, r, h, ang) {
    const L = new T.Group(); L.position.set(x, 0, z); L.rotation.y = ang; g.add(L);
    const zr = r + 0.14, top = 0.5 + h + 0.3, bot = 0.4, rc = 0x4f5559;
    for (const s of [-1, 1]) B(L, rc, s * 0.25, (bot + top) / 2, zr, 0.05, top - bot, 0.05);
    for (let y = bot + 0.3; y < top; y += 0.4) B(L, rc, 0, y, zr, 0.5, 0.03, 0.03);
    for (let y = 1.2; y < top; y += 2.4) for (const s of [-1, 1]) B(L, rc, s * 0.25, y, zr - 0.07, 0.04, 0.04, 0.16);
    const hoop = new T.TorusGeometry(0.36, 0.016, 3, 7, PI * 1.5); hoop.rotateX(PI / 2); hoop.rotateY(0.25 * PI);
    for (let y = 2.8; y < top; y += 1.3) { const m = new T.Mesh(hoop, C.mat(rc)); m.position.set(0, y, zr + 0.08); m.castShadow = true; L.add(m); }
    for (const a of [-0.3, 0, 0.3]) B(L, rc, a, (2.8 + top) / 2, zr + 0.44, 0.025, top - 2.8, 0.025);
    return L;
  }
  function siloOutlet(g, x, z, r, ang, col) {
    const P = new T.Group(); P.position.set(x, 0, z); P.rotation.y = ang; g.add(P); col = col || 0x5f7a66;
    Y(P, 0x808689, 0, 0.95, r + 0.4, 0.14, 0.8, 10, PI / 2, 0, 0); blob(P, 0x808689, 0, 0.95, r + 0.8, 0.34);
    Y(P, 0x808689, 0, 0.55, r + 0.8, 0.14, 0.8, 10); B(P, col, 0, 0.62, r + 0.8, 0.4, 0.26, 0.4); Y(P, 0xa04a30, 0, 0.84, r + 0.8, 0.13, 0.04, 10); B(P, 0x3a3d40, 0, 0.04, r + 0.8, 0.95, 0.08, 0.95);
    return P;
  }
  reg('silo', (opts) => {
    const g = new T.Group(), r = 2.2, h = 10.2, top = siloUnit(g, 0, 0, r, h, {});
    siloLadder(g, 0, 0, r, h, 0.55); siloOutlet(g, 0, 0, r, -0.5);
    // наклонная труба-шнек к люку
    beam(g, 0x7c8387, [-r * 0.2, 1.0, -r - 0.9], [-r * 0.25, 11.0, -r + 0.1], 0.36, 0.36, [1, 0, 0]);
    for (const y of [3.0, 5.4, 7.8, 10.0]) { const t = (y - 1.0) / 10.0; B(g, 0x555a5e, -r * 0.2 - r * 0.05 * t, y, -r - 0.9 + 1.0 * t, 0.5, 0.06, 0.1); }
    B(g, 0xb2afa4, -0.5, 0.1, -r - 1.2, 1.4, 0.2, 1.1);
    return finish(g, 71);
  });
  reg('silos', (opts) => {
    const g = new T.Group(), zs = -1.5, S = [[-5.6, 2.0, 9.6, 0xc0c4c6], [0, 2.4, 12.4, 0xb8bdc0], [5.6, 2.0, 7.2, 0xc6c9c4]];
    S.forEach(([x, r, h, t]) => { siloUnit(g, x, zs, r, h, { tint: t }); siloOutlet(g, x, zs, r, 0, x === 0 ? 0x7a6a4a : 0x5f7a66); });
    siloLadder(g, -5.6, zs, 2.0, 9.6, -0.9); siloLadder(g, 0, zs, 2.4, 12.4, 0.8);
    // манифольд-труба по низу
    B(g, 0x808689, 0, 0.62, zs + 2.4 + 0.8 - 0.8 + 0.8, 0.0, 0.0, 0.0);
    const mz = zs + 3.2; Y(g, 0x808689, 0, 0.95, mz, 0.15, 12.0, 10, 0, 0, PI / 2); for (const x of [-5.6, 0, 5.6]) blob(g, 0x808689, x, 0.95, mz, 0.36);
    // мостик с перилами
    const wy = 6.9, wz = zs + 3.5 - 0.8;
    B(g, 0x6d7478, 0, wy, wz, 13.4, 0.1, 1.0);
    for (const x of [-6.4, -2.8, 2.8, 6.4]) { beam(g, 0x6d7478, [x, wy - 0.05, wz], [x, wy - 0.05, zs + 2.3], 0.1, 0.1); beam(g, 0x6d7478, [x, wy - 0.05, wz - 0.3], [x - 0.0, wy - 1.2, zs + 2.2], 0.08, 0.08); }
    B(g, 0x8a9096, 0, wy + 1.0, wz + 0.5, 13.4, 0.06, 0.06); B(g, 0x8a9096, 0, wy + 0.5, wz + 0.5, 13.4, 0.05, 0.05);
    for (let x = -6.6; x <= 6.7; x += 1.1) B(g, 0x8a9096, x, wy + 0.5, wz + 0.5, 0.05, 1.0, 0.05);
    for (const x of [-6.7, 6.7]) B(g, 0x555a5e, x, 3.45, wz, 0.2, 6.9, 0.2);
    for (const x of [-3.0, 3.0]) B(g, 0x555a5e, x, 3.45, wz + 0.45, 0.14, 6.9, 0.14);
    // лестница на мостик (слева)
    const sx = -7.6; for (const dx of [-0.38, 0.38]) beam(g, 0x6d7478, [sx + dx, 0.3, wz + 2.4], [sx + dx, wy, wz + 0.0], 0.12, 0.08, [1, 0, 0]); for (const dx of [-0.42, 0.42]) { beam(g, 0x8a9096, [sx + dx, 1.0, wz + 2.4], [sx + dx, wy + 1.0, wz + 0.0], 0.05, 0.05); }
    for (let i = 0; i < 11; i++) { const t = (i + 0.5) / 11; B(g, 0x8a9096, sx, 0.3 + (wy - 0.3) * t + 0.1, wz + 2.4 - 2.4 * t, 0.8, 0.05, 0.25); }
    // соединительные трубы на крыше между конусами
    const ty = 10.9; Y(g, 0x80868a, -2.8, ty - 1.2, zs + 0.6, 0.16, 5.6, 8, 0, 0, PI / 2); Y(g, 0x80868a, 2.8, 8.4, zs + 0.6, 0.16, 5.6, 8, 0, 0, PI / 2);
    // будка управления
    const hx = 3.0, hz = 4.6, hut = surf('bld_corr', 0x8fa08f);
    B(g, PLINTH, hx, 0.15, hz, 4.3, 0.3, 3.1); B(g, hut, hx, 1.55, hz, 4.0, 2.5, 2.8);
    slab3(g, surf('bld_seam', 0x555a5e), [hx, 3.12, hz - 1.7], [hx, 2.95, hz + 1.8], [1, 0, 0], 4.6, 0.14);
    const F = wallGroup(g, hx, hz + 1.4, 0);
    const dr = doorUnit({ color: 0x4a5a6a, frame: 0xd8d6cc, w: 0.9, h: 2.0, glass: true }); dr.position.set(-1.0, 0.3, 0); F.add(dr);
    const u = windowUnit({ w: 1.3, h: 0.9, frame: 0xd8d6cc, mull: 'v' }); u.position.set(0.9, 1.1, 0); F.add(u);
    B(F, 0xd8d6cc, 0, 2.5, 0.05, 4.05, 0.08, 0.1);
    B(g, 0x3a3d40, hx + 1.8, 2.3, hz + 0.5, 0.04, 1.2, 0.04); B(g, 0x3a3d40, hx - 2.05, 1.0, hz - 0.5, 0.1, 1.6, 0.5);
    return finish(g, 72);
  });

  // ================================================================== ТЕПЛИЦА
  reg('greenhouse', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), gl = new T.Group(), L = 16, hw = 4.5, ye = 2.2, y0 = 0.45, frame = 0xe9ecec, pitch = 28 * PI / 180, tn = Math.tan(pitch), yr = ye + hw * tn;
    const conc = surf('bld_conc', 0xc4c4bc);
    B(g, conc, 0, 0.225, hw, L + 0.2, 0.45, 0.2); B(g, conc, 0, 0.225, -hw, L + 0.2, 0.45, 0.2); for (const s of [-1, 1]) B(g, conc, s * L / 2, 0.225, 0, 0.2, 0.45, hw * 2);
    B(g, 0x8a7458, 0, 0.03, 0, L - 0.2, 0.06, hw * 2 - 0.2);
    // каркас
    for (let x = -8; x <= 8.01; x += 2) { for (const s of [-1, 1]) { B(g, frame, x, (y0 + ye) / 2, s * hw, 0.09, ye - y0, 0.09); beam(g, frame, [x, ye, s * hw], [x, yr, 0], 0.08, 0.09, [1, 0, 0]); } }
    for (let x = -7; x <= 7.01; x += 2) for (const s of [-1, 1]) beam(g, frame, [x, ye + 0.01, s * hw], [x, yr, 0], 0.04, 0.05, [1, 0, 0]);
    for (const s of [-1, 1]) { B(g, frame, 0, ye, s * hw, L + 0.1, 0.1, 0.1); B(g, frame, 0, yr + 0.02, 0, L + 0.1, 0.14, 0.14); B(g, frame, 0, ye + (yr - ye) / 3, s * hw * 2 / 3, L + 0.05, 0.05, 0.05); B(g, frame, 0, ye + (yr - ye) * 2 / 3, s * hw / 3, L + 0.05, 0.05, 0.05); B(g, frame, 0, 1.35, s * hw, L + 0.05, 0.05, 0.05); }
    for (const s of [-1, 1]) { const x = s * L / 2; for (let z = -4.5; z <= 4.51; z += 1.5) { const hh = ye + (hw - Math.abs(z)) * tn; B(g, frame, x, (y0 + hh) / 2, z, 0.08, hh - y0, 0.08); } for (const z of [-3.0, -1.5, 1.5, 3.0]) { B(g, frame, x, 1.35, z, 0.05, 0.05, 1.5); } B(g, frame, x, ye, 0, 0.1, 0.1, hw * 2); beam(g, frame, [x, ye, -hw], [x, yr, 0], 0.08, 0.1, [1, 0, 0]); beam(g, frame, [x, ye, hw], [x, yr, 0], 0.08, 0.1, [1, 0, 0]); }
    // дверь по центру фасада
    for (const x of [-1.0, 1.0]) B(g, frame, x, 1.35, hw + 0.04, 0.1, 1.8, 0.1); B(g, frame, 0, 2.2, hw + 0.04, 2.1, 0.1, 0.1); B(g, frame, 0, 0.5, hw + 0.04, 2.0, 0.08, 0.08); B(g, frame, 0, 1.35, hw + 0.04, 0.06, 1.7, 0.08);
    for (const s of [-1, 1]) { B(g, 0x9aa0a4, s * 0.15, 1.3, hw + 0.1, 0.04, 0.4, 0.04); B(gl, 0xffffff, s * 0.5, 1.35, hw + 0.02, 0.9, 1.7, 0.02); }
    B(g, 0xa9a498, 0, 0.08, hw + 0.6, 2.4, 0.16, 1.0);
    // вентиляционные створки на крыше
    for (const x of [-5, 0, 5]) { const a = [x - 1.0, ye + 1.0, hw * 0.35 + 0.2]; beam(g, frame, [x - 0.95, ye + (hw - hw * 0.62) * tn + 0.0, hw * 0.62], [x - 0.95, ye + (hw - hw * 0.2) * tn + 0.12, hw * 0.2 + 0.2], 0.05, 0.05, [1, 0, 0]); beam(g, frame, [x + 0.95, ye + (hw - hw * 0.62) * tn + 0.0, hw * 0.62], [x + 0.95, ye + (hw - hw * 0.2) * tn + 0.12, hw * 0.2 + 0.2], 0.05, 0.05, [1, 0, 0]); }
    // стекло: стены и крыша
    for (const s of [-1, 1]) {
      const m1 = new T.Mesh(new T.PlaneGeometry(L, ye - y0), glassMat); m1.position.set(0, (y0 + ye) / 2, s * hw); if (s < 0) m1.rotation.y = PI; gl.add(m1);
      slab3(gl, 0xffffff, [0, ye, s * hw], [0, yr, 0], [1, 0, 0], L, 0.02);
      const pent = new T.Mesh(new T.ShapeGeometry(new T.Shape([[-hw, y0], [hw, y0], [hw, ye], [0, yr], [-hw, ye]].map((p) => new T.Vector2(p[0], p[1])))), glassMat); pent.position.set(s * L / 2, 0, 0); pent.rotation.y = s > 0 ? PI / 2 : -PI / 2; gl.add(pent);
    }
    // внутри: грядки
    const soil = 0x4a3626;
    for (const bz of [-3.2, -1.1, 1.1, 3.2]) for (const [xa, xb] of [[-7.5, -1.3], [1.3, 7.5]]) {
      const cx = (xa + xb) / 2, len = xb - xa;
      B(g, 0x8a6a42, cx, 0.18, bz - 0.62, len, 0.3, 0.05); B(g, 0x8a6a42, cx, 0.18, bz + 0.62, len, 0.3, 0.05); B(g, soil, cx, 0.17, bz, len, 0.3, 1.2);
      const climb = (bz === -3.2 || bz === 3.2);
      const nB = Math.floor(len / 0.75), rr = lcg(Math.floor(bz * 10 + xa * 7 + 99));
      for (let i = 0; i < nB; i++) { const x = xa + 0.4 + i * (len - 0.8) / (nB - 1); blob(g, [0x3f7a3a, 0x4d8a40, 0x376a34][i % 3], x, climb ? 0.8 : 0.55, bz + (rr() - 0.5) * 0.15, 1.15, climb ? 1.15 : 0.7, 0.95);
        if (rr() < 0.7) blob(g, climb ? 0xc23b2a : [0xd9c04a, 0xe08a3a, 0xc23b2a][i % 3], x + (rr() - 0.5) * 0.4, climb ? 0.6 : 0.5, bz + 0.35 + (rr() - 0.5) * 0.1, 0.17); }
      if (climb) { for (let i = 0; i <= nB; i += 2) { const x = xa + 0.1 + i * (len - 0.2) / nB; B(g, 0xb89a6a, x, 1.05, bz, 0.04, 2.0, 0.04); } B(g, 0xb89a6a, cx, 2.0, bz, len, 0.03, 0.03); }
    }
    // снаружи: бочка, поддоны с рассадой, шланг
    barrel(g, 8.7, 0, 1.5, 0.38, 0.95, 0x4a6a8a); downpipe(g, 8.15, 1.8, 0.4, 2.0, 0x8a9096);
    for (let i = 0; i < 3; i++) { B(g, 0x6b4a30, -5.5 + i * 0.9, 0.35, hw + 0.9, 0.8, 0.3, 0.5); blob(g, 0x4d8a40, -5.5 + i * 0.9, 0.6, hw + 0.9, 0.5, 0.3, 0.4); blob(g, [0xc23b2a, 0xe6c03a, 0xd9768a][i], -5.4 + i * 0.9, 0.72, hw + 0.95, 0.18); }
    B(g, 0x6b4a30, -4.4, 0.8, hw + 1.1, 1.8, 0.07, 0.6); for (const x of [-5.2, -3.6]) B(g, 0x6b4a30, x, 0.4, hw + 1.1, 0.08, 0.8, 0.5);
    for (let i = 0; i < 4; i++) Y(g, 0xb5603f, -4.9 + i * 0.35, 0.9, hw + 1.1, 0.13, 0.2, 8);
    return finish(g, 81 + v, [mergeInto(gl, glassMat)]);
  });

  /** Ферма под кровлей (видна через открытый фасад): затяжка, стропила, стойка. */
  function truss(g, col, x, yw, hw, tn) {
    const yu = (z) => yw + (hw - Math.abs(z)) * tn - 0.16, z0 = hw - 0.3;
    B(g, col, x, yw - 0.1, 0, 0.16, 0.16, hw * 2 - 0.2);
    beam(g, col, [x, yu(z0), z0], [x, yu(0), 0], 0.12, 0.14, [1, 0, 0]); beam(g, col, [x, yu(-z0), -z0], [x, yu(0), 0], 0.12, 0.14, [1, 0, 0]);
    B(g, col, x, (yw - 0.02 + yu(0)) / 2, 0, 0.12, yu(0) - yw + 0.02, 0.12);
  }

  // ================================================================== НАВЕС ДЛЯ ТЕХНИКИ
  reg('shed', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), L = 14, hw = 4.0, yw = 4.2, wallT = [0x8a9696, 0x9aa090, 0x8f8f9a][v % 3], tm = 0x5a432f;
    const corr = surf('bld_corr', wallT), roofS = surf('bld_corr', [0x8f989b, 0x9b6a50, 0x7f8f86][v % 3]);
    B(g, surf('bld_conc', 0xc8c8c0), 0, 0.08, 0.0, L + 0.6, 0.16, hw * 2 + 1.0);
    B(g, corr, 0, (0.16 + yw) / 2, -hw + 0.1, L, yw - 0.16, 0.2);
    B(g, corr, -L / 2 + 0.1, (0.16 + yw) / 2, 0, 0.2, yw - 0.16, hw * 2);
    B(g, 0x6b5a45, 0, 0.45, -hw + 0.3, L - 0.2, 0.9, 0.12); B(g, surf('bld_planks', 0x7a6048), 0, 0.5, -hw + 0.22, L - 0.2, 1.0, 0.1);
    const R = gableRoofX(g, { spec: roofS, xc: 0, zc: 0, L, hw, yw, pitch: 16 * PI / 180, th: 0.1, ov: 0.9, ovf: 0.4, ovx: 0.5, ridge: 0x6b7276 });
    gableEnds(g, corr, { xc: 0, zc: 0, L, hw, yw }, R.yr);
    const xs = [-6.5, -3.25, 0, 3.25, 6.5];
    for (const x of xs) { B(g, tm, x, (0.16 + yw - 0.3) / 2, hw - 0.1, 0.26, yw - 0.46, 0.26); B(g, 0x4a3828, x, 0.3, hw - 0.1, 0.4, 0.3, 0.4); }
    B(g, tm, 0, yw - 0.17, hw - 0.1, L + 0.1, 0.3, 0.26);
    for (const x of xs) truss(g, tm, x, yw, hw, R.tn);
    for (const x of [-4.875, -1.625, 1.625, 4.875]) { beam(g, tm, [x - 0.1, yw - 0.75, hw - 0.1], [x - 1.4, yw - 0.34, hw - 0.1], 0.1, 0.1); beam(g, tm, [x + 0.1, yw - 0.75, hw - 0.1], [x + 1.4, yw - 0.34, hw - 0.1], 0.1, 0.1); }
    // содержимое: верстак, ящики, бочки, мешки, колёса
    B(g, 0x8a6a42, -5.2, 0.95, -hw + 0.8, 3.0, 0.1, 0.8); for (const x of [-6.5, -3.9]) B(g, 0x6b4a30, x, 0.45, -hw + 0.8, 0.1, 0.9, 0.7); B(g, 0x555a5e, -4.4, 1.05, -hw + 0.8, 0.18, 0.14, 0.12);
    B(g, 0x8a8f94, -4.6, 1.6, -hw + 0.3, 1.4, 0.06, 0.2); for (const x of [-5.1, -4.1]) B(g, 0x6b4a30, x, 1.4, -hw + 0.3, 0.05, 0.5, 0.05);
    for (let i = 0; i < 3; i++) crate(g, 3.5 + i * 0.95, 0, -hw + 0.8, 0.85, 0.7, 0.8, [0xa07a46, 0x8e6a3c, 0xb08a52][i]); crate(g, 3.9, 0.7, -hw + 0.8, 0.8, 0.6, 0.7, 0xb08a52); crate(g, 5.0, 0.7, -hw + 0.8, 0.8, 0.6, 0.7, 0x8e6a3c);
    barrel(g, 6.2, 0, -hw + 1.0, 0.33, 0.95, 0x4a6a8a); barrel(g, 5.5, 0, -hw + 1.9, 0.33, 0.95, 0x8a3a30); barrel(g, 6.4, 0, -hw + 1.9, 0.33, 0.95, 0x2f5a3c);
    B(g, 0x7a6a50, -1.2, 0.08, -hw + 1.4, 1.2, 0.14, 1.2); for (let i = 0; i < 4; i++) B(g, surf('bld_burlap', 0xffffff), -1.4 + (i % 2) * 0.5, 0.35 + Math.floor(i / 2) * 0.3, -hw + 1.2 + (i % 2) * 0.1, 0.45, 0.28, 0.7);
    for (let i = 0; i < 3; i++) { Y(g, 0x2a2a2a, 1.0, 0.18 + i * 0.3, -hw + 1.0, 0.45, 0.28, 12); Y(g, 0x6b6b6b, 1.0, 0.18 + i * 0.3, -hw + 1.0, 0.2, 0.3, 8); }
    // плуг-борона у стены
    B(g, 0x555a5e, 0.0, 0.45, -hw + 0.7, 2.6, 0.08, 0.1); for (let i = 0; i < 5; i++) beam(g, 0x6b7276, [-1.1 + i * 0.55, 0.45, -hw + 0.7], [-1.1 + i * 0.55 - 0.2, 0.0, -hw + 0.95], 0.08, 0.06);
    B(g, 0xa9a498, 0, 0.17, hw + 0.9, 8.0, 0.02, 1.0);
    return finish(g, 91 + v);
  });

  // ================================================================== ГАРАЖ / МАСТЕРСКАЯ
  reg('garage', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), lamps = new T.Group(), L = 12, hw = 4.0, yw = 4.4, y0 = 0.3, brick = surf('bld_brick', [0xffffff, 0xe0d0c4, 0xd8c4b4][v % 3]), conc = 0xc9c7bf;
    const doorT = [0xcfd2d3, 0x7a9a7e, 0xe0d8c0][v % 3];
    B(g, PLINTH, 0, 0.15, 0, L + 0.2, 0.3, hw * 2 + 0.2); B(g, brick, 0, (y0 + yw) / 2, 0, L, yw - y0, hw * 2);
    B(g, conc, 0, yw - 0.1, hw, L + 0.15, 0.22, 0.18); B(g, conc, 0, yw - 0.1, -hw, L + 0.15, 0.22, 0.18); for (const s of [-1, 1]) B(g, conc, s * L / 2, yw - 0.1, 0, 0.18, 0.22, hw * 2 + 0.15);
    const R = gableRoofX(g, { spec: surf('bld_corr', 0x8c9599), xc: 0, zc: 0, L, hw, yw: yw + 0.01, pitch: 17 * PI / 180, th: 0.1, ov: 0.45, ovx: 0.3, ridge: 0x6b7276 });
    gableEnds(g, brick, { xc: 0, zc: 0, L, hw, yw }, R.yr);
    const F = wallGroup(g, 0, hw, 0);
    const cx = [-3.9, 0, 3.9];
    for (const x of cx) {
      B(F, 0x5a5f63, x, 1.9, 0.07, 3.55, 3.7, 0.14); B(F, surf('bld_roller', doorT), x, 1.85, 0.12, 3.2, 3.4, 0.08);
      B(F, 0x1d2226, x, 3.3, 0.17, 2.8, 0.22, 0.02); for (let k = 0; k < 4; k++) B(F, 0x4f6a7a, x - 1.05 + k * 0.7, 3.3, 0.18, 0.5, 0.16, 0.02);
      B(F, 0x5a5f63, x, 0.34, 0.15, 3.3, 0.1, 0.1); B(F, 0xe0b830, x, 0.7, 0.18, 0.4, 0.12, 0.02);
      B(F, conc, x, 3.9, 0.12, 3.7, 0.28, 0.24);
      // лампа над воротами
      B(F, 0x2f3236, x, 4.15, 0.34, 0.06, 0.06, 0.4); B(F, 0x3a3d40, x, 4.05, 0.55, 0.3, 0.1, 0.22); B(lamps, 0xffffff, x, 3.97, hw + 0.55, 0.2, 0.06, 0.14);
    }
    for (const x of [-5.7, -1.95, 1.95, 5.7]) B(F, brick, x, 2.35, 0.06, 0.55, 4.1, 0.12);
    B(F, 0x4a4e52, 0, 4.1 + 0.0, 0.0, 0.0, 0.0, 0.0);
    B(F, surf('bld_conc', 0xd8d4c8), 0, 4.15, 0.12, 2.2, 0.0, 0.0);
    B(g, 0xefe6cf, 0, yw - 0.4 + 0.0, hw + 0.3, 3.2, 0.5, 0.1);
    for (const x of [-4.8, -1.9, 1.9, 4.8]) downpipe(g, x * 1.19 > 5.9 ? x * 1.19 : x + (x > 0 ? 0.98 : -0.98), hw + 0.1, 0.3, yw - 0.1);
    // боковая дверь и окна
    const E = wallGroup(g, L / 2, 0, PI / 2); const sd = doorUnit({ color: 0x5a6a74, frame: 0xd8d6cc, w: 1.0, h: 2.15, panels: true }); sd.position.set(1.2, y0, 0); E.add(sd);
    B(E, 0x2f3236, 1.2, 2.8, 0.25, 0.06, 0.06, 0.35); B(E, 0x3a3d40, 1.2, 2.7, 0.43, 0.26, 0.1, 0.2); B(lamps, 0xffffff, L / 2 + 0.43, 2.64, 1.2, 0.14, 0.05, 0.16);
    const wu = windowUnit({ w: 1.3, h: 1.0, frame: 0xd8d6cc, mull: 'grid', glass: 0x3f5560 }); wu.position.set(-1.4, 2.0, 0); E.add(wu);
    const W2 = wallGroup(g, -L / 2, 0, -PI / 2); const w2 = windowUnit({ w: 1.3, h: 1.0, frame: 0xd8d6cc, mull: 'grid', glass: 0x3f5560 }); w2.position.set(0, 2.0, 0); W2.add(w2);
    const K = wallGroup(g, 0, -hw, PI); for (const x of [-3.5, 0, 3.5]) { const u = windowUnit({ w: 1.3, h: 1.0, frame: 0xd8d6cc, mull: 'grid', glass: 0x3f5560 }); u.position.set(x, 2.6, 0); K.add(u); }
    // вытяжки на крыше
    for (const x of [-4, 0, 4]) { B(g, 0x70777c, x, R.yr + 0.28, 0.0, 0.8, 0.5, 0.8); for (let k = 0; k < 3; k++) { B(g, 0x4a5055, x, R.yr + 0.15 + k * 0.14, 0.41, 0.7, 0.05, 0.04); B(g, 0x4a5055, x, R.yr + 0.15 + k * 0.14, -0.41, 0.7, 0.05, 0.04); } B(g, 0x5a6065, x, R.yr + 0.6, 0.0, 1.0, 0.07, 1.0); }
    // бетонная площадка с жёлтой линией, бордюр
    B(g, surf('bld_conc', 0xc2c2ba), 0, 0.04, hw + 0.9, L + 0.4, 0.08, 1.6); B(g, 0xe0b830, 0, 0.09, hw + 1.55, L + 0.2, 0.01, 0.12);
    const gl = mergeInto(lamps, lampMat, false);
    return finish(g, 101 + v, [gl]);
  });

  // ================================================================== СЕНОВАЛ
  reg('haybarn', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), L = 10, hw = 3.5, yw = 4.3, tm = 0x5a432f, wall = surf('bld_planks', 0x6a523e);
    const roofS = surf('bld_corr', [0x9a6a4c, 0x7f8f86, 0x8f989b][v % 3]);
    B(g, surf('bld_conc', 0xbdbdb5), 0, 0.06, 0, L + 0.5, 0.12, hw * 2 + 0.5);
    B(g, wall, 0, (0.12 + yw) / 2, -hw + 0.1, L, yw - 0.12, 0.2); B(g, wall, -L / 2 + 0.1, (0.12 + yw) / 2, 0, 0.2, yw - 0.12, hw * 2);
    const R = gableRoofX(g, { spec: roofS, xc: 0, zc: 0, L, hw, yw, pitch: 24 * PI / 180, th: 0.1, ov: 0.7, ovf: 0.35, ovx: 0.5, ridge: 0x5a6065 });
    gableEnds(g, wall, { xc: 0, zc: 0, L, hw, yw }, R.yr);
    for (let i = 0; i < 4; i++) { const x = -4.5 + i * 3; B(g, tm, x, (0.12 + yw - 0.3) / 2, hw - 0.1, 0.28, yw - 0.42, 0.28); B(g, 0x4a3828, x, 0.25, hw - 0.1, 0.42, 0.26, 0.42); }
    B(g, tm, 0, yw - 0.17, hw - 0.1, L + 0.1, 0.3, 0.26);
    for (const x of [-4.5, -1.5, 1.5, 4.5]) truss(g, tm, x, yw, hw, R.tn);
    for (const x of [-3.0, 0.0, 3.0]) { beam(g, tm, [x - 0.1, yw - 0.7, hw - 0.1], [x - 1.1, yw - 0.34, hw - 0.1], 0.1, 0.1); beam(g, tm, [x + 0.1, yw - 0.7, hw - 0.1], [x + 1.1, yw - 0.34, hw - 0.1], 0.1, 0.1); }
    // стога
    const bl = surf('bld_bales', 0xffffff);
    B(g, bl, -2.4, 1.2, -1.4, 5.4, 2.2, 3.4); B(g, bl, -2.2, 2.55, -1.8, 4.5, 0.5, 2.5); B(g, bl, -3.4, 3.3, -2.0, 2.5, 0.9, 2.0);
    B(g, bl, 3.4, 0.7, -2.3, 3.0, 1.4, 1.8); B(g, bl, 3.4, 1.6, -2.5, 2.4, 0.5, 1.4);
    const bale = surf('bld_hay', 0xffffff);
    for (let i = 0; i < 3; i++) B(g, bale, 0.6 + i * 0.95, 0.35, 1.1, 0.9, 0.46, 0.5, 0, 0.0, 0); for (let i = 0; i < 2; i++) B(g, bale, 1.05 + i * 0.95, 0.81, 1.1, 0.9, 0.46, 0.5);
    blob(g, 0xd8b358, 3.6, 0.35, 0.6, 2.4, 0.7, 1.6); blob(g, 0xc9a24a, 4.2, 0.25, 1.0, 1.4, 0.5, 1.1);
    // круглые тюки перед сараем
    for (const [x, z] of [[-3.2, hw + 1.2], [-1.7, hw + 1.4]]) { const rb = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 1.2, 14), tmat('bld_hay', 0xffffff)); rb.rotation.x = PI / 2; rb.rotation.z = 0.0; rb.position.set(x, 0.75, z); rb.castShadow = rb.receiveShadow = true; g.add(rb); }
    const rb2 = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 1.2, 14), tmat('bld_hay', 0xffffff)); rb2.rotation.z = PI / 2; rb2.position.set(-2.4, 2.1, hw + 1.3); rb2.rotation.x = 0; g.add(rb2);
    // лестница, вилы, тачка
    beam(g, tm, [3.6, 0.1, hw + 0.9], [3.2, 2.8, hw + 0.3], 0.06, 0.04, [0, 0, 1]); beam(g, tm, [4.0, 0.1, hw + 0.9], [3.6, 2.8, hw + 0.3], 0.06, 0.04, [0, 0, 1]);
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; B(g, tm, 3.8 - 0.4 * t, 0.1 + 2.7 * t, hw + 0.9 - 0.6 * t, 0.42, 0.03, 0.03); }
    B(g, 0x555a5e, 4.5, 0.38, hw + 0.8, 0.6, 0.3, 0.8); Y(g, 0x222222, 4.5, 0.2, hw + 1.25, 0.2, 0.08, 10, 0, 0, PI / 2);
    return finish(g, 111 + v);
  });

  // ------------------------------------------------------------------ вспомогательные тела вращения с метрическими UV
  function texCyl(g, spec, rb, rt, h, seg, x, y, z, rotY) {
    const geo = new T.CylinderGeometry(rt, rb, h, seg, 1, false), uv = geo.attributes.uv, s = TILE[spec.tex] || [1, 1], rm = (rb + rt) / 2, slant = Math.sqrt(h * h + (rb - rt) * (rb - rt));
    const rx = Math.max(1, Math.round(2 * PI * rm / s[0])), ry = slant / s[1];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
    const m = new T.Mesh(geo, tmat(spec.tex, spec.tint)); m.position.set(x, y, z); m.rotation.y = rotY || 0; m.castShadow = m.receiveShadow = true; g.add(m); return m;
  }
  function ladderUnit(g, h, y0, tilt, rc) {
    const L = new T.Group(); L.rotation.x = tilt || 0; g.add(L); rc = rc || 0x4f5559;
    for (const s of [-1, 1]) B(L, rc, s * 0.25, y0 + h / 2, 0, 0.05, h, 0.05);
    for (let y = y0 + 0.3; y < y0 + h; y += 0.32) B(L, rc, 0, y, 0, 0.5, 0.03, 0.03);
    return L;
  }

  // ================================================================== ВЕТРЯНАЯ МЕЛЬНИЦА
  reg('windmill', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), wood = 0x5a432f, dark = 0x4e3a30;
    const body = [0xeee4cf, 0xe8d8b8, 0xe4e0d6][v % 3], rB = 2.95, rM = 2.55, rT = 1.65, yM = 2.8, yT = 8.0, ph = PI / 8;
    const rAt = (y) => y <= yM ? rB + (rM - rB) * y / yM : rM + (rT - rM) * (y - yM) / (yT - yM);
    texCyl(g, surf('bld_stone', 0x9d978c), rB, rM, yM, 8, 0, yM / 2, 0, ph);
    texCyl(g, surf('bld_plaster', body), rM, rT, yT - yM, 8, 0, yM + (yT - yM) / 2, 0, ph);
    Y(g, 0x3a3228, 0, 0.06, 0, rB + 0.35, 0.12, 8, 0, ph, 0);
    const face = (k, y, o) => { // группа на грани k (0 = +Z), высота y; локально x вдоль грани, z наружу
      const a = rAt(y) * Math.cos(PI / 8), dr = (o && o.below) ? 0 : 0, ang = k * PI / 4, outer = new T.Group(), inner = new T.Group();
      const y1 = y + 0.5, a1 = rAt(y1) * Math.cos(PI / 8), tilt = Math.atan((a - a1) / 0.5);
      outer.position.set(a * Math.sin(ang), y, a * Math.cos(ang)); outer.rotation.y = ang; inner.rotation.x = -tilt; outer.add(inner); g.add(outer); return inner;
    };
    // дверь, окна
    const dg = face(0, 0.0), dr = doorUnit({ color: 0x5e4430, frame: 0xd8d2c0, w: 1.1, h: 2.0, step: 0xa9a498 }); dr.position.set(0, 0.0, -0.02); dg.add(dr);
    B(dg, 0xa9a498, 0, 0.1, 0.9, 1.9, 0.2, 0.7); B(dg, 0xa9a498, 0, 0.04, 1.25, 1.9, 0.08, 0.5);
    for (const [k, y] of [[0, 4.6], [0, 6.5], [2, 4.2], [6, 4.2], [3, 6.0], [5, 6.0], [4, 5.0], [1, 2.0], [7, 2.0]]) { const wg = face(k, y), u = windowUnit({ w: 0.7, h: y < 3 ? 0.9 : 1.0, frame: 0xd8d2c0, mull: 'cross', sill: 0xb0aa9c }); u.position.set(0, 0, -0.03); wg.add(u); }
    // галерея
    const gy = 3.55, gr = 3.5;
    Y(g, wood, 0, gy, 0, gr, 0.16, 8, 0, ph, 0); Y(g, 0x4a3828, 0, gy - 0.12, 0, gr - 0.1, 0.1, 8, 0, ph, 0);
    for (let k = 0; k < 8; k++) { const a = ph + k * PI / 4, a2 = ph + (k + 1) * PI / 4, R0 = gr - 0.08, p1 = [R0 * Math.sin(a), 0, R0 * Math.cos(a)], p2 = [R0 * Math.sin(a2), 0, R0 * Math.cos(a2)], rr = rAt(gy - 0.1) * 0.93;
      B(g, 0xd8d2c0, p1[0], gy + 0.55, p1[2], 0.1, 1.0, 0.1); beam(g, 0xd8d2c0, [p1[0], gy + 1.05, p1[2]], [p2[0], gy + 1.05, p2[2]], 0.08, 0.07); beam(g, 0xd8d2c0, [p1[0], gy + 0.55, p1[2]], [p2[0], gy + 0.55, p2[2]], 0.06, 0.05);
      const am = (a + a2) / 2; beam(g, wood, [rr * Math.sin(am), gy - 0.55, rr * Math.cos(am)], [(gr - 0.5) * Math.sin(am), gy - 0.1, (gr - 0.5) * Math.cos(am)], 0.12, 0.12); }
    const gd = face(1, gy + 0.08), gdoor = doorUnit({ color: 0x5e4430, frame: 0xd8d2c0, w: 0.9, h: 1.8, step: 0x5e4430 }); gd.add(gdoor); gdoor.position.z = -0.03;
    // колпак
    Y(g, dark, 0, yT + 0.12, 0, 1.95, 0.24, 8, 0, ph, 0);
    texCyl(g, surf('bld_tile', 0x6a5444), 1.9, 0.28, 1.75, 8, 0, yT + 0.24 + 0.87, 0, ph);
    blob(g, 0x3a3028, 0, yT + 2.1, 0, 0.3); B(g, 0x3a3028, 0, yT + 2.4, 0, 0.04, 0.5, 0.04);
    B(g, dark, 0, yT + 0.95, 1.55, 1.1, 1.3, 1.3); slab3(g, surf('bld_tile', 0x6a5444), [0, yT + 1.75, 0.9], [0, yT + 1.5, 2.3], [1, 0, 0], 1.4, 0.1);
    // вал, ступица и крылья
    const hubY = yT + 0.95, hubZ = 3.5;
    Y(g, 0x3a3228, 0, hubY, 2.5, 0.22, 2.0, 8, PI / 2, 0, 0); B(g, 0x3a3228, 0, hubY, hubZ, 0.75, 0.75, 0.55); CT(g, 0x7a7a72, 0, hubY, hubZ + 0.45, 0.32, 0.06, 0.4, 8, PI / 2, 0, 0);
    // хвостовой шест с лестницей
    beam(g, wood, [0, yT + 0.8, -1.5], [0, 0.35, -4.7], 0.22, 0.2); beam(g, wood, [0.28, yT + 0.8, -1.5], [0.28, 0.35, -4.7], 0.06, 0.06); beam(g, wood, [-0.28, yT + 0.8, -1.5], [-0.28, 0.35, -4.7], 0.06, 0.06);
    B(g, wood, 0, 0.5, -4.8, 0.3, 1.0, 0.3); B(g, 0x555a5e, 0, 0.65, -4.8, 0.7, 0.1, 0.1);
    // мешки, бочки у входа
    for (let i = 0; i < 4; i++) { const sx = 1.8 + (i % 2) * 0.45, sy = 0.22 + Math.floor(i / 2) * 0.32; B(g, surf('bld_burlap', 0xffffff), sx, sy, 3.5 + (i % 2) * 0.1, 0.42, 0.3, 0.6, 0, 0.2 * i, 0); }
    barrel(g, -1.9, 0, 3.6, 0.33, 0.9, 0x6b4a30); shrub(g, -2.8, 2.5, 0.8); shrub(g, 2.9, 2.2, 0.7, 0x45743a, 0x5a8944);
    const base = finish(g, 121 + v);
    // крылья: плоский диск в XZ, внешний wrapper поворачивает его лицом к +Z
    const wrap = new T.Group(); wrap.position.set(0, hubY, hubZ + 0.3); wrap.rotation.x = PI / 2; base.add(wrap);
    const spinner = new T.Group(); spinner.userData.spin = 0.5; wrap.add(spinner);
    const sg = new T.Group(), R = 5.0, st = 0x6b4a30, cloth = 0xe6dcc2;
    for (let k = 0; k < 4; k++) {
      const arm = new T.Group(); arm.rotation.y = k * PI / 2 + 0.3; sg.add(arm);
      B(arm, st, (0.3 + R) / 2, 0, 0, R - 0.3, 0.16, 0.16);
      B(arm, st, (1.4 + R) / 2, 0.02, 1.25, R - 1.4, 0.08, 0.08); B(arm, st, 1.4, 0.02, 0.62, 0.08, 0.08, 1.25); B(arm, st, R - 0.05, 0.02, 0.62, 0.08, 0.08, 1.3);
      for (let x = 1.75; x < R - 0.2; x += 0.42) B(arm, st, x, 0.02, 0.62, 0.05, 0.06, 1.24);
      B(arm, cloth, (3.4 + R - 0.15) / 2, 0.07, 0.62, R - 0.15 - 3.4, 0.02, 1.2);
    }
    B(sg, 0x3a3228, 0, 0, 0, 0.7, 0.4, 0.7); Y(sg, 0x7a7a72, 0, 0.25, 0, 0.3, 0.14, 8);
    const old = Math.random; Math.random = lcg(122); try { spinner.add(C.bakeTex(sg)); } finally { Math.random = old; }
    return base;
  });

  // ================================================================== ВОДОНАПОРНАЯ БАШНЯ
  reg('watertower', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), leg = [0x4f5f58, 0x5a5f66, 0x6a4a3a][v % 3], tank = [0xdcd8c8, 0xc9d4d6, 0xd8c8b0][v % 3], roofC = [0x56666c, 0x6a3a30, 0x4a5a50][v % 3];
    const pb = 2.0, pt = 1.55, H = 7.0, lv = [0, 2.3, 4.7, 7.0];
    const P = (sx, sz, y) => { const r = pb + (pt - pb) * y / H; return [sx * r, y, sz * r]; };
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) { beam(g, leg, P(sx, sz, 0.1), P(sx, sz, H), 0.28, 0.28, [0, 0, 1]); B(g, 0xa9a498, sx * (pb + 0.1), 0.2, sz * (pb + 0.1), 0.8, 0.4, 0.8); }
    for (let i = 1; i < lv.length; i++) for (let c = 0; c < 4; c++) { const a = corners[c], b = corners[(c + 1) % 4]; const pa = P(a[0], a[1], lv[i]), pbb = P(b[0], b[1], lv[i]); beam(g, leg, pa, pbb, 0.16, 0.16, [0, 1, 0]); }
    for (let i = 0; i < 3; i++) for (let c = 0; c < 4; c++) { const a = corners[c], b = corners[(c + 1) % 4]; beam(g, 0x8a9096, P(a[0], a[1], lv[i] + (i ? 0 : 0.1)), P(b[0], b[1], lv[i + 1]), 0.07, 0.07, [0, 1, 0]); beam(g, 0x8a9096, P(b[0], b[1], lv[i] + (i ? 0 : 0.1)), P(a[0], a[1], lv[i + 1]), 0.07, 0.07, [0, 1, 0]); }
    // площадка, бак, крыша
    Y(g, 0x6d7478, 0, 7.12, 0, 2.85, 0.16, 20);
    CT(g, tank, 0, 7.6, 0, 1.5, 2.45, 0.9, 20); Y(g, tank, 0, 9.05, 0, 2.45, 2.0, 20);
    for (const y of [8.05, 8.9, 9.75, 10.0]) Y(g, 0x8a8f90, 0, y, 0, 2.5, 0.08, 20);
    CT(g, roofC, 0, 10.65, 0, 2.62, 0.3, 1.3, 20); Y(g, 0x6b7276, 0, 11.45, 0, 0.3, 0.3, 10); CT(g, 0x6b7276, 0, 11.75, 0, 0.35, 0.02, 0.35, 10); B(g, 0x3a3d40, 0, 12.0, 0, 0.04, 0.5, 0.04);
    // перила
    for (let k = 0; k < 16; k++) { const a = k / 16 * PI * 2; B(g, 0x8a9096, 2.72 * Math.sin(a), 7.65, 2.72 * Math.cos(a), 0.06, 1.0, 0.06); }
    const rail = new T.Mesh(new T.TorusGeometry(2.72, 0.03, 4, 28), C.mat(0x8a9096)); rail.rotation.x = PI / 2; rail.position.y = 8.15; g.add(rail);
    // лестница по стойке (+Z грань)
    const lg = new T.Group(); lg.position.set(0, 0, pb + 0.35); g.add(lg); const lad = ladderUnit(lg, 6.9, 0.3, -Math.atan((pb - pt) / H), 0x4f5559);
    const hoop = new T.TorusGeometry(0.36, 0.016, 3, 7, PI * 1.5); hoop.rotateX(PI / 2); hoop.rotateY(0.25 * PI);
    for (let y = 2.6; y < 7.0; y += 1.1) { const m = new T.Mesh(hoop, C.mat(0x4f5559)); const zz = (pb - (pb - pt) * y / H) - pb; m.position.set(0, y, zz + 0.05); lg.add(m); }
    // трубы
    Y(g, 0x6d7478, 0, 3.6, 0, 0.2, 7.2, 10); for (const y of [1.0, 4.0, 6.8]) Y(g, 0x4f5559, 0, y, 0, 0.28, 0.1, 10);
    B(g, 0x8a3a30, 0.0, 1.2, 0.22, 0.34, 0.2, 0.34); Y(g, 0xa04a30, 0, 1.55, 0.0, 0.18, 0.04, 10); Y(g, 0x6d7478, 1.2, 0.4, 0, 0.16, 2.4, 10, 0, 0, PI / 2); blob(g, 0x6d7478, 0.0, 0.4, 0, 0.42); Y(g, 0x6d7478, 0, 0.2, 0, 0.16, 0.4, 10);
    B(g, 0xa9a498, 2.5, 0.06, 0, 0.8, 0.12, 0.6);
    return finish(g, 131 + v);
  });

  // ================================================================== ГОРОДСКИЕ ЗДАНИЯ (общие помощники)
  function townPad(g, w, d, col) {
    B(g, surf('bld_conc', col || 0xd2d2ca), 0, 0.04, 0, w, 0.08, d);
    const c = 0xa9a79e; B(g, c, 0, 0.06, d / 2 - 0.06, w, 0.12, 0.12); B(g, c, 0, 0.06, -d / 2 + 0.06, w, 0.12, 0.12); B(g, c, w / 2 - 0.06, 0.06, 0, 0.12, 0.12, d); B(g, c, -w / 2 + 0.06, 0.06, 0, 0.12, 0.12, d);
  }
  /** Плоская вывесочная плита (простой параллелепипед) с рамкой. */
  function signBoard(g, x, y, z, w, h, body, trim) {
    B(g, trim, x, y, z - 0.03, w + 0.34, h + 0.34, 0.2); B(g, body, x, y, z + 0.08, w, h, 0.2);
  }
  function archPts(w, h, seg) { const r = w / 2, yS = h - r, pts = [[-r, 0], [r, 0], [r, yS]]; for (let i = 1; i < seg; i++) { const a = i / seg * PI; pts.push([r * Math.cos(a), yS + r * Math.sin(a)]); } pts.push([-r, yS]); return pts; }
  function archOpening(g, x, y0, w, h, z, frameCol, darkCol) {
    facePoly(g, frameCol, archPts(w + 0.44, h + 0.22, 10), x, y0 - 0.0, z + 0.01, 0);
    facePoly(g, darkCol, archPts(w, h, 10), x, y0, z + 0.04, 0);
    B(g, frameCol, x, y0 + h + 0.12, z + 0.08, 0.34, 0.3, 0.14);
  }
  function pile(g, col, cx, cy, cz, n, spread, size, seed) {
    const r = lcg(seed || 5);
    for (let i = 0; i < n; i++) { const a = i * 2.4, rr = spread * Math.sqrt((i + 0.5) / n); blob(g, col, cx + Math.cos(a) * rr + (r() - 0.5) * 0.03, cy + size * 0.45 + (i % 3) * 0.02, cz + Math.sin(a) * rr * 0.8, size, size * 0.92, size); }
  }
  function sack(g, x, z, col, ry, y) {
    const m = new T.Group(); B(m, surf('bld_burlap', col == null ? 0xffffff : col), 0, 0.32, 0, 0.5, 0.64, 0.3); B(m, surf('bld_burlap', col == null ? 0xffffff : col), 0, 0.68, 0, 0.36, 0.1, 0.22); m.position.set(x, y || 0, z); m.rotation.y = ry || 0; g.add(m); return m;
  }
  function wheelbarrow(g, x, z, ry, load) {
    const m = new T.Group(); m.position.set(x, 0, z); m.rotation.y = ry || 0; g.add(m);
    B(m, 0x4a6a3a, 0, 0.5, 0.05, 0.7, 0.28, 0.9); B(m, 0x3a5a2c, 0, 0.62, 0.05, 0.62, 0.04, 0.82);
    Y(m, 0x2a2a2a, 0, 0.26, 0.55, 0.26, 0.08, 10, 0, 0, PI / 2); for (const s of [-1, 1]) { beam(m, 0x8a6a42, [s * 0.28, 0.5, -0.3], [s * 0.3, 0.7, -0.95], 0.05, 0.05); B(m, 0x6b4a30, s * 0.28, 0.2, -0.3, 0.05, 0.4, 0.05); }
    if (load) load(m);
  }
  function miniTractor(g, x, z, ry, sc) {
    const m = new T.Group(); m.position.set(x, 0, z); m.rotation.y = ry || 0; m.scale.setScalar(sc || 1); g.add(m);
    const col = 0x3f7a40, tire = 0x262626;
    B(m, col, 0, 0.75, 0.55, 0.85, 0.7, 1.35); B(m, shade(col, 0.8), 0, 0.5, 0.2, 0.7, 0.3, 2.2); B(m, 0x2a2a2a, 0, 0.82, 1.3, 0.55, 0.45, 0.06);
    B(m, col, 0, 0.62, -0.45, 1.0, 0.5, 0.9); B(m, 0xdcdcd0, 0, 1.55, -0.55, 1.0, 0.07, 1.1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(m, 0x2a2a2a, sx * 0.48, 1.05, -0.55 + sz * 0.5, 0.06, 1.0, 0.06);
    B(m, 0x40586a, 0, 1.12, -1.07, 0.92, 0.7, 0.04); B(m, 0x40586a, 0, 1.12, -0.03, 0.92, 0.7, 0.04); for (const sx of [-1, 1]) B(m, 0x40586a, sx * 0.5, 1.1, -0.55, 0.04, 0.72, 0.9);
    for (const sx of [-1, 1]) { Y(m, tire, sx * 0.72, 0.6, -0.55, 0.6, 0.38, 14, 0, 0, PI / 2); Y(m, 0xd6b020, sx * 0.72, 0.6, -0.55, 0.28, 0.4, 10, 0, 0, PI / 2); B(m, col, sx * 0.72, 1.2, -0.55, 0.42, 0.06, 1.1); Y(m, tire, sx * 0.52, 0.34, 1.3, 0.34, 0.24, 12, 0, 0, PI / 2); Y(m, 0xd6b020, sx * 0.52, 0.34, 1.3, 0.16, 0.26, 8, 0, 0, PI / 2); B(m, 0xf2e3a0, sx * 0.3, 0.82, 1.5, 0.12, 0.1, 0.04); }
    Y(m, 0x3a3a38, 0.3, 1.35, 1.0, 0.045, 0.7, 6); B(m, 0x555a5e, 0, 0.3, -1.15, 0.5, 0.12, 0.2);
  }

  // ================================================================== РЫНОК
  reg('market', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), tm = 0x4f3524, trim = 0xf1ede2;
    const wallC = [0xf0e2c4, 0xe9dcb8, 0xece3d0][v % 3], roofT = [0xa7452f, 0x8e4a38, 0xa85c3a][v % 3];
    townPad(g, 15.8, 11.8);
    const hz = -3.0, yw = 5.2, zf = hz + 2.5, plaster = surf('bld_plaster', wallC);
    B(g, PLINTH, 0, 0.3, hz, 14.3, 0.6, 5.3); B(g, plaster, 0, (0.6 + yw) / 2, hz, 14, yw - 0.6, 5.0);
    for (const x of [-7, -2.3, 2.3, 7]) B(g, tm, x, (0.6 + yw) / 2, zf + 0.06, 0.4, yw - 0.6, 0.14);
    B(g, tm, 0, yw - 0.12, zf + 0.06, 14.2, 0.28, 0.16); B(g, tm, 0, 0.7, zf + 0.06, 14.2, 0.2, 0.14);
    for (const x of [-4.65, 0, 4.65]) { const w = x === 0 ? 3.3 : 2.8; archOpening(g, x, 0.6, w, 3.5, zf, 0xd8cfb8, 0x2a2018); }
    signBoard(g, 0, 4.45, zf + 0.04, 8.6, 0.85, 0x2f4a3a, 0xefe3c5);
    const R = gableRoofX(g, { spec: surf('bld_tile', roofT), xc: 0, zc: hz, L: 14, hw: 2.5, yw, pitch: 29 * PI / 180, th: 0.16, ov: 0.9, ovx: 0.5, ridge: shade(roofT, 0.82) });
    gableEnds(g, plaster, { xc: 0, zc: hz, L: 14, hw: 2.5, yw }, R.yr);
    for (const s of [-1, 1]) { const x0 = s * 7.0, E = wallGroup(g, x0, hz, s * PI / 2); B(E, tm, 0, 6.2, 0.05, 0.14, 1.3, 0.12); const u = windowUnit({ w: 0.8, h: 1.1, frame: trim, mull: 'cross' }); u.position.set(-1.2, 1.7, 0); E.add(u); const u2 = windowUnit({ w: 0.8, h: 1.1, frame: trim, mull: 'cross' }); u2.position.set(1.2, 1.7, 0); E.add(u2); }
    // башенка с часами
    { const cy = R.yr, cx = 0; B(g, tm, cx, cy + 0.9, hz, 1.3, 1.8, 1.3); for (const [dx, dz, ry] of [[0, 0.68, 0], [0, -0.68, PI], [0.68, 0, PI / 2], [-0.68, 0, -PI / 2]]) { const f = new T.Group(); f.position.set(cx + dx, cy + 1.05, hz + dz); f.rotation.y = ry; g.add(f); Y(f, 0xf1ead6, 0, 0, 0.02, 0.42, 0.04, 14, PI / 2, 0, 0); B(f, 0x2a2a2a, 0, 0.12, 0.05, 0.04, 0.24, 0.02); B(f, 0x2a2a2a, 0.1, 0, 0.05, 0.2, 0.04, 0.02); }
      CT(g, shade(0xa7452f, 0.8), cx, cy + 2.55, hz, 1.1, 0.02, 1.5, 4, 0, PI / 4, 0); B(g, 0xd4af37, cx, cy + 3.4, hz, 0.1, 0.35, 0.1); blob(g, 0xd4af37, cx, cy + 3.62, hz, 0.22); }
    // прилавки
    const kinds = [{ c: [0xb83a2c, 0x7a9a3a, 0xc9442f], n: 'apples' }, { c: [0xdb8a2a, 0xe2c24a, 0xe09a30], n: 'citrus' }, { c: [0x8fb35a, 0xd9722a, 0xc0392b], n: 'veg' }, { c: [0xd9768a, 0xe6c03a, 0x8a6ac0], n: 'flowers' }];
    const rs = surf('bld_stripe', 0xffffff), wood = surf('bld_planks', 0xa88458), woodD = 0x6b4a30;
    kinds.forEach((K, i) => {
      const cx = -5.25 + i * 3.5, rr = lcg(300 + i);
      for (const sx of [-1, 1]) { B(g, woodD, cx + sx * 1.55, 1.2, 3.5, 0.1, 2.4, 0.1); B(g, woodD, cx + sx * 1.55, 1.55, 1.4, 0.1, 3.1, 0.1); }
      slab3(g, rs, [cx, 3.1, 1.3], [cx, 2.45, 3.65], [1, 0, 0], 3.4, 0.07);
      for (let k = 0; k < 8; k++) B(g, k % 2 ? 0xf0e6d0 : 0xb53e2e, cx - 1.47 + k * 0.42, 2.3, 3.68, 0.4, 0.26, 0.04);
      B(g, wood, cx, 0.87, 4.3, 2.9, 0.08, 0.95); B(g, 0x7a5a38, cx, 0.43, 4.77, 2.9, 0.86, 0.06); for (const sx of [-1, 1]) B(g, 0x7a5a38, cx + sx * 1.42, 0.43, 4.32, 0.06, 0.86, 0.9);
      B(g, wood, cx, 1.5, 1.45, 3.0, 2.2, 0.08);
      for (let k = 0; k < 3; k++) { const sy = 0.7 + k * 0.7; B(g, wood, cx, sy, 1.75, 3.0, 0.05, 0.5); for (let j = 0; j < 4; j++) { const c = K.c[(j + k) % 3]; if (k === 2 && K.n === 'flowers') { Y(g, 0xb5603f, cx - 1.1 + j * 0.73, sy + 0.12, 1.75, 0.1, 0.2, 8); blob(g, c, cx - 1.1 + j * 0.73, sy + 0.32, 1.75, 0.3, 0.25, 0.3); } else B(g, shade(c, 0.9), cx - 1.1 + j * 0.73, sy + 0.12, 1.75, 0.3, 0.22, 0.28); } }
      for (let j = 0; j < 3; j++) { const x = cx - 0.95 + j * 0.95, c = K.c[j]; crate(g, x, 0.91, 4.3, 0.82, 0.26, 0.6, 0xa07a46); if (K.n === 'flowers') { blob(g, 0x4a7a3a, x, 1.3, 4.3, 0.7, 0.4, 0.5); pile(g, c, x, 1.2, 4.3, 4, 0.25, 0.2, 20 + j); } else pile(g, c, x, 1.17, 4.3, 5, 0.28, K.n === 'veg' ? 0.26 : 0.2, 30 + j + i); }
      if (i === 1) { const sx0 = cx + 1.0; B(g, 0x3a3a38, sx0, 0.96, 4.55, 0.5, 0.1, 0.34); B(g, 0x3a3a38, sx0, 1.4, 4.55, 0.08, 0.8, 0.08); B(g, 0x3a3a38, sx0, 1.82, 4.55, 1.2, 0.06, 0.06); blob(g, 0xd4af37, sx0, 1.88, 4.55, 0.16); for (const sx of [-1, 1]) { Y(g, 0xb8a050, sx0 + sx * 0.52, 1.46, 4.55, 0.2, 0.03, 12); B(g, 0x3a3a38, sx0 + sx * 0.52, 1.64, 4.55, 0.02, 0.36, 0.02); B(g, 0x6a6a68, sx0 + sx * 0.52, 1.1 + 0.0, 4.55 + 0.0, 0.0, 0.0, 0.0); } crate(g, sx0 + 0.52, 0.96, 4.55, 0.12, 0.08, 0.12, 0x3a3a38); }
      if (K.n === 'apples') { barrel(g, cx - 1.9, 0, 4.0, 0.3, 0.8, 0x6b4a30); pile(g, 0xb83a2c, cx - 1.9, 0.8, 4.0, 5, 0.18, 0.2, 77); }
      if (K.n === 'veg') { sack(g, cx + 1.9, 3.9, 0xffffff, 0.3); sack(g, cx + 2.2, 4.2, 0xffffff, -0.4); }
      for (let j = 0; j < 2; j++) crate(g, cx - 1.2 + j * 1.0, 0.0, 5.0, 0.7, 0.45, 0.5, 0x8e6a3c);
    });
    wheelbarrow(g, 7.0, 3.2, 0.4, (m) => { pile(m, 0xd9722a, 0, 0.62, 0.05, 6, 0.22, 0.2, 9); });
    sack(g, -7.1, 0.0, 0xffffff, 0.2); sack(g, -6.65, -0.1, 0xffffff, -0.3); barrel(g, 7.0, 0, 0.2, 0.3, 0.8, 0x6b4a30); crate(g, 6.3, 0, 0.1, 0.8, 0.5, 0.6); crate(g, 6.3, 0.5, 0.1, 0.7, 0.45, 0.55, 0xb08a52);
    shrub(g, -7.4, 5.0, 0.8); shrub(g, 7.4, 5.2, 0.8, 0x45743a, 0x5a8944);
    return finish(g, 141 + v);
  });

  // ================================================================== МАГАЗИН СЕМЯН
  function shopWindow(w, h, frame, shelfCol, rr) {
    const g = new T.Group(); const ft = 0.1;
    B(g, 0x3b4f5a, 0, h / 2, 0.02, w - ft, h - ft, 0.04);
    for (const [x, y, ww, hh] of [[0, h - ft / 2, w, ft], [0, ft / 2, w, ft], [-w / 2 + ft / 2, h / 2, ft, h], [w / 2 - ft / 2, h / 2, ft, h]]) B(g, frame, x, y, 0.06, ww, hh, 0.12);
    for (const x of [-w / 6, w / 6]) B(g, frame, x, h / 2, 0.07, 0.05, h - ft, 0.08);
    const cols = [0xc23b2a, 0x4a8a3a, 0xe6c03a, 0xd9768a, 0x5a7ab0, 0xe08a3a, 0xf0ead6];
    for (let k = 0; k < 3; k++) { const y = 0.45 + k * 0.5; B(g, shelfCol, 0, y, 0.2, w - 0.2, 0.05, 0.3); for (let j = 0; j < 5; j++) { const x = -w / 2 + 0.38 + j * (w - 0.76) / 4; if (rr() < 0.25) { Y(g, 0xb5603f, x, y + 0.13, 0.2, 0.1, 0.2, 8); blob(g, 0x4a8a3a, x, y + 0.28, 0.2, 0.22, 0.2, 0.22); } else B(g, cols[Math.floor(rr() * cols.length)], x, y + 0.14, 0.2, 0.17, 0.24, 0.05); } }
    B(g, 0xcfc8b8, 0, -0.03, 0.12, w + 0.2, 0.07, 0.22);
    return g;
  }
  reg('seedshop', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), trim = 0xf1ede2, tb = 0x4a3222;
    const plasterC = [0xeee4cf, 0xe6e0c8, 0xe9dcb4][v % 3], roofT = [0xa7452f, 0x8e4a38, 0x8e5a48][v % 3], green = [0x3f6a45, 0x4a6a8a, 0x6a4a6a][v % 3];
    townPad(g, 15.8, 11.8);
    const zc = -2.0, hw = 3.0, yw = 6.0, L = 11, zf = zc + hw, pitch = 42 * PI / 180, rr = lcg(500 + v);
    B(g, PLINTH, 0, 0.2, zc, L + 0.3, 0.4, hw * 2 + 0.3); B(g, surf('bld_plaster', plasterC), 0, (0.4 + yw) / 2, zc, L, yw - 0.4, hw * 2);
    const F = wallGroup(g, 0, zf, 0);
    B(F, tb, 0, 0.5, 0.05, L + 0.1, 0.22, 0.14); B(F, tb, 0, 3.7, 0.05, L + 0.1, 0.3, 0.16); B(F, tb, 0, 5.92, 0.05, L + 0.1, 0.2, 0.14);
    for (const s of [-1, 1]) B(F, tb, s * (L / 2 - 0.02), 3.2, 0.06, 0.26, yw - 0.3, 0.2);
    for (const x of [-1.0, 1.0]) B(F, tb, x, 2.1, 0.05, 0.14, 3.2, 0.14); for (const x of [-4.8, -2.4, 0, 2.4, 4.8]) B(F, tb, x, 4.8, 0.05, 0.14, 2.2, 0.14);
    for (const s of [-1, 1]) { const sw = shopWindow(3.0, 1.9, trim, 0x8a6a42, rr); sw.position.set(s * 3.4, 0.85, 0); F.add(sw); B(F, green, s * 3.4, 0.55, 0.1, 3.2, 0.8, 0.08); }
    const dr = doorUnit({ color: green, frame: trim, w: 1.3, h: 2.35, glass: true }); dr.position.set(0, 0.4, 0); F.add(dr);
    signBoard(F, 0, 3.15, 0.1, 8.8, 0.78, 0xf0e4c2, tb);
    for (const x of [-3.6, -1.2, 1.2, 3.6]) { const u = windowUnit({ w: 1.0, h: 1.2, shutter: green, frame: trim, box: true, flowers: [0xd9768a, 0xe6c03a, 0xf2efe6, 0xc23b2a] }); u.position.set(x, 4.4, 0); F.add(u); xPanel(F, tb, x, 1.3, 3.9, 4.3, 0.06); }
    // боковые стены/задняя
    for (const s of [-1, 1]) { const E = wallGroup(g, s * L / 2, zc, s * PI / 2); B(E, tb, 0, 0.5, 0.05, hw * 2 + 0.1, 0.22, 0.14); B(E, tb, 0, 3.7, 0.05, hw * 2 + 0.1, 0.3, 0.16); B(E, tb, 0, 5.92, 0.05, hw * 2 + 0.1, 0.2, 0.14); B(E, tb, 0, 3.2, 0.06, 0.14, yw - 0.3, 0.14); for (const y of [1.6, 4.5]) { const u = windowUnit({ w: 0.9, h: 1.2, frame: trim, shutter: y < 3 ? green : null }); u.position.set(0, y - 0.6, 0); E.add(u); } }
    const K = wallGroup(g, 0, zc - hw, PI); for (const x of [-3.6, -1.2, 1.2, 3.6]) for (const y of (Math.abs(x) > 2 ? [1.2, 4.4] : [4.4])) { const u = windowUnit({ w: 1.0, h: 1.2, frame: trim, mull: 'v', sill: false }); u.position.set(x, y, 0); K.add(u); }
    const R = gableRoofX(g, { spec: surf('bld_tile', roofT), xc: 0, zc, L, hw, yw, pitch, th: 0.18, ov: 0.6, ovx: 0.5, ridge: shade(roofT, 0.82) });
    gableEnds(g, surf('bld_plaster', plasterC), { xc: 0, zc, L, hw, yw }, R.yr);
    for (const s of [-1, 1]) { const E = wallGroup(g, s * L / 2, zc, s * PI / 2); B(E, tb, 0, 7.0, 0.05, 0.14, 1.9, 0.12); const u = windowUnit({ w: 0.6, h: 0.8, frame: trim, mull: 'v' }); u.position.set(0, 6.2, 0); E.add(u); }
    const zr = 1.9, yS = R.yr - zr * R.tn;
    for (const x of [-3.0, 3.0]) dormer(g, { x, zf: zc + zr, yb: yS - 0.35, yw: yS + 1.45, w: 1.6, plaster: plasterC, roof: roofT, trim, pitch: 0.75, depth: 1.5 });
    chimney(g, -4.0, zc - 0.4, R.yr - 1.6, R.yr + 1.3, 0.9, 0.9, surf('bld_brick', 0xffffff));
    downpipe(g, L / 2 + 0.1, zf + 0.1, 0.4, 5.6); downpipe(g, -L / 2 - 0.1, zf + 0.1, 0.4, 5.6);
    // вывеска-кронштейн
    beam(g, 0x2a2a2a, [5.2, 4.3, zf + 0.1], [5.2, 4.3, zf + 1.35], 0.05, 0.05); beam(g, 0x2a2a2a, [5.2, 4.0, zf + 0.1], [5.2, 4.3, zf + 0.9], 0.04, 0.04);
    B(g, 0xefe3c5, 5.2, 3.75, zf + 1.1, 0.07, 0.8, 0.9); blob(g, 0x4a8a3a, 5.27, 3.8, zf + 1.1, 0.05, 0.4, 0.5); blob(g, 0x6aaa4a, 5.27, 3.9, zf + 1.2, 0.05, 0.3, 0.3);
    // перед магазином: мешки, ящики, стеллаж с семенами
    for (let i = 0; i < 4; i++) sack(g, -5.3 + (i % 2) * 0.6, zf + 0.7 + Math.floor(i / 2) * 0.55, 0xffffff, (rr() - 0.5) * 0.6, 0);
        for (let i = 0; i < 3; i++) { B(g, 0x8a6a42, 4.2, 0.55 + i * 0.5, zf + 1.1, 1.7, 0.05, 0.4); for (let j = 0; j < 5; j++) B(g, [0xc23b2a, 0x4a8a3a, 0xe6c03a, 0xd9768a, 0xe08a3a][(i + j) % 5], 3.6 + j * 0.3, 0.68 + i * 0.5, zf + 1.1, 0.2, 0.22, 0.05); }
    B(g, 0x6b4a30, 3.4, 0.6, zf + 1.1, 0.06, 1.2, 0.4); B(g, 0x6b4a30, 5.0, 0.6, zf + 1.1, 0.06, 1.2, 0.4);
    // доска-мольберт
    for (const sx of [-1, 1]) B(g, 0x2f4a38, -1.9, 0.55, zf + 1.4 + sx * 0.2, 0.9, 1.0, 0.04, sx * 0.2, 0, 0); B(g, 0xf0ead6, -1.9, 0.75, zf + 1.62, 0.7, 0.07, 0.02, 0.2, 0, 0); B(g, 0xf0ead6, -1.9, 0.55, zf + 1.62, 0.55, 0.05, 0.02, 0.2, 0, 0);
    wheelbarrow(g, 1.8, zf + 1.6, -0.5, (m) => { for (let i = 0; i < 5; i++) blob(m, [0xd9768a, 0xe6c03a, 0xc23b2a, 0xf2efe6, 0x9a6fc0][i], (i - 2) * 0.12, 0.72, 0.05 + (i % 2) * 0.12, 0.22); blob(m, 0x4a7a3a, 0, 0.66, 0.05, 0.6, 0.2, 0.7); });
    for (let i = 0; i < 3; i++) { Y(g, 0xb5603f, -3.3 + i * 0.5, 0.18, zf + 1.6, 0.17, 0.36, 8); blob(g, [0x4d8a40, 0xd9768a, 0xe6c03a][i], -3.3 + i * 0.5, 0.52, zf + 1.6, 0.42, 0.34, 0.42); }
    barrel(g, 6.4, 0, zf + 0.6, 0.32, 0.85, 0x6b4a30); barrel(g, 6.9, 0, zf + 1.0, 0.32, 0.85, 0x7a4a30); for (const [bx, bz] of [[6.4, zf + 0.6], [6.9, zf + 1.0]]) Y(g, 0xd9b358, bx, 0.87, bz, 0.26, 0.04, 10);
    shrub(g, -7.4, zf + 1.0, 0.8); shrub(g, 7.4, zf + 2.4, 0.7, 0x45743a, 0x5a8944);
    return finish(g, 151 + v);
  });

  // ================================================================== ТЕХЦЕНТР
  reg('techcenter', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), lamps = new T.Group(), trim = 0xf1ede2;
    const brick = surf('bld_brick', [0xffffff, 0xe6d6c8, 0xdcc8b8][v % 3]), steel = [0x6a7a8a, 0x5f7a66, 0x8a6a4a][v % 3], yel = 0xd6a62a;
    townPad(g, 15.8, 11.8, 0xc8c8c0);
    const hx = -2.6, hw = 3.4, hz = -2.1, yw = 6.2, L = 10.8, zf = hz + hw;
    B(g, PLINTH, hx, 0.2, hz, L + 0.3, 0.4, hw * 2 + 0.3); B(g, brick, hx, (0.4 + yw) / 2, hz, L, yw - 0.4, hw * 2);
    for (const x of [hx - L / 2, hx, hx + L / 2]) B(g, brick, x, (0.4 + yw) / 2, zf + 0.06, 0.7, yw - 0.4, 0.14);
    B(g, 0xc9c7bf, hx, yw - 0.12, zf + 0.1, L + 0.3, 0.3, 0.22); B(g, 0xc9c7bf, hx, 4.55, zf + 0.04, L, 0.2, 0.1);
    const F = wallGroup(g, 0, zf, 0), doorX = [hx - 2.7, hx + 2.7];
    for (const x of doorX) {
      B(F, 0x4a4f54, x, 2.4, 0.07, 4.9, 4.4, 0.14); B(F, surf('bld_roller', steel), x, 2.25, 0.14, 4.4, 4.1, 0.08);
      for (let k = 0; k < 8; k++) { B(F, k % 2 ? 0x2a2a2a : yel, x - 2.4 + k * 0.6 + 0.0, 0.5, 0.2, 0.3, 0.12, 0.03, 0, 0, 0.0); }
      for (let k = 0; k < 11; k++) B(F, k % 2 ? 0x2a2a2a : yel, x - 2.3 + k * 0.46, 4.52, 0.15, 0.24, 0.22, 0.02);
      for (let k = 0; k < 4; k++) B(F, 0x1d2226, x - 1.4 + k * 0.95, 3.7, 0.2, 0.85, 0.28, 0.02);
      B(F, 0x3a3a38, x, 4.82, 0.2, 0.1, 0.1, 0.1);
      B(F, 0x2f3236, x - 1.6, 4.7, 0.35, 0.06, 0.06, 0.4); B(F, 0x3a3d40, x - 1.6, 4.62, 0.55, 0.3, 0.1, 0.22); B(lamps, 0xffffff, x - 1.6, 4.54, zf + 0.55, 0.2, 0.06, 0.14);
    }
    signBoard(F, hx, 5.35, 0.2, 8.4, 0.9, 0x2f3b4a, 0xe8e0cc);
    // крыша: низкий двускат + парапет
    const R = gableRoofX(g, { spec: surf('bld_corr', 0x8c9599), xc: hx, zc: hz, L, hw, yw: yw + 0.15, pitch: 13 * PI / 180, th: 0.1, ov: 0.4, ovx: 0.3, ridge: 0x6b7276, gutter: false });
    gableEnds(g, brick, { xc: hx, zc: hz, L, hw, yw }, R.yr);
    for (const x of [hx - 3, hx + 1.0, hx + 3.5]) { B(g, 0x70777c, x, R.yr + 0.3, hz, 0.8, 0.5, 0.8); B(g, 0x5a6065, x, R.yr + 0.62, hz, 1.0, 0.07, 1.0); }
    Y(g, 0x7a8085, hx - 1.5, R.yr + 0.5, hz + 0.6, 0.5, 0.9, 10); // водяной бак/вытяжка
    // пристройка-офис
    const ox = 5.5, ow = 5.0, od = 3.2, oz = -1.2, oy = 3.6;
    B(g, PLINTH, ox, 0.2, oz, ow + 0.2, 0.4, od * 2 + 0.2); B(g, brick, ox, (0.4 + oy) / 2, oz, ow, oy - 0.4, od * 2);
    B(g, 0x9a9a94, ox, oy + 0.08, oz, ow + 0.3, 0.2, od * 2 + 0.3); B(g, brick, ox, oy + 0.45, oz + od - 0.1, ow, 0.5, 0.2); B(g, brick, ox, oy + 0.45, oz - od + 0.1, ow, 0.5, 0.2); B(g, brick, ox + ow / 2 - 0.1, oy + 0.45, oz, 0.2, 0.5, od * 2); B(g, brick, ox - ow / 2 + 0.1, oy + 0.45, oz, 0.2, 0.5, od * 2);
    B(g, 0x8a9096, ox + 0.5, oy + 0.45, oz, 1.4, 0.7, 0.9); B(g, 0x70777c, ox + 0.5, oy + 0.85, oz, 1.5, 0.1, 1.0); Y(g, 0x5a6065, ox - 1.2, oy + 0.55, oz, 0.35, 0.5, 10);
    const OF = wallGroup(g, ox, oz + od, 0);
    for (const x of [-1.5, 0.6]) { const u = windowUnit({ w: 1.4, h: 1.3, frame: trim, mull: 'v', sill: 0xc9c7bf, lintel: 0xc9c7bf }); u.position.set(x, 1.2, 0); OF.add(u); }
    const od1 = doorUnit({ color: steel, frame: trim, w: 1.0, h: 2.2, glass: true }); od1.position.set(1.9, 0.4, 0); OF.add(od1);
    // подъёмный кран-консоль
    const cx = 7.0, cz = 3.4;
    B(g, 0xa9a498, cx, 0.1, cz, 1.2, 0.2, 1.2); B(g, yel, cx, 2.6, cz, 0.3, 5.0, 0.3); B(g, yel, cx, 5.2, cz, 0.4, 0.4, 0.4);
    beam(g, yel, [cx, 5.15, cz], [cx - 4.4, 5.15, cz], 0.26, 0.26, [0, 0, 1]); beam(g, yel, [cx, 3.9, cz], [cx - 3.2, 5.05, cz], 0.14, 0.14, [0, 0, 1]);
    B(g, 0x3a3a38, cx - 3.8, 5.0, cz, 0.4, 0.2, 0.3); B(g, 0x3a3a38, cx - 3.8, 4.1, cz, 0.03, 1.8, 0.03); B(g, 0x3a3a38, cx - 3.8, 3.1, cz, 0.12, 0.16, 0.12);
    B(g, 0x555a5e, cx - 3.8, 2.65, cz, 0.7, 0.5, 0.5); B(g, 0x8a3a30, cx - 3.8, 2.97, cz, 0.45, 0.14, 0.4); B(g, 0x555a5e, cx - 3.8, 3.0, cz, 0.04, 0.5, 0.04);
    // стопки шин
    const tyre = new T.TorusGeometry(0.42, 0.2, 5, 10); tyre.rotateX(PI / 2);
    for (const [x, z, n] of [[-7.4, 3.6, 4], [-6.3, 4.3, 3], [-7.5, 5.0, 2]]) for (let i = 0; i < n; i++) { const m = new T.Mesh(tyre, C.mat(0x2a2a2a)); m.position.set(x, 0.2 + i * 0.4, z); m.rotation.y = i; m.castShadow = true; g.add(m); }
    for (const [x, z] of [[-4.8, 5.2], [-4.2, 5.4], [3.6, 5.0]]) { barrel(g, x, 0, z, 0.3, 0.85, [0x2f5a3c, 0x8a3a30, 0x3a4a6a][(x * 10 | 0) % 3 < 0 ? 0 : 1]); }
    crate(g, 3.0, 0, 5.0, 0.9, 0.7, 0.8); crate(g, 3.0, 0.7, 5.0, 0.8, 0.6, 0.7, 0xb08a52);
    miniTractor(g, -1.9, 4.1, 0.35, 1.1);
    // ограждение/жёлтые тумбы
    for (let i = 0; i < 4; i++) { Y(g, 0xe0b830, -3 + i * 1.8, 0.4, 5.6, 0.1, 0.8, 8); }
    const gl = mergeInto(lamps, lampMat, false);
    return finish(g, 161 + v, [gl]);
  });

  // ================================================================== БАНК
  reg('bank', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), lamps = new T.Group();
    const stoneC = [0xdfd8c6, 0xd8d8d0, 0xe2d2b8][v % 3], stone = surf('bld_stone', stoneC), dome = [0x62997f, 0x80563c, 0x5f8f86][v % 3], gold = 0xd4af37, lead = 0x8d9296;
    townPad(g, 15.8, 11.8, 0xd6d4cc);
    const bz = -2.5, bw = 14.6, bd = 6.0, yw = 6.4, zf = bz + bd / 2;
    B(g, PLINTH, 0, 0.3, bz, bw + 0.4, 0.6, bd + 0.4); B(g, stone, 0, (0.6 + yw) / 2, bz, bw, yw - 0.6, bd);
    B(g, stone, 0, yw + 0.1, bz, bw + 0.5, 0.35, bd + 0.5); B(g, shade(stoneC, 1.05), 0, yw - 0.25, bz, bw + 0.3, 0.2, bd + 0.3);
    B(g, stone, 0, yw + 0.55, zf + 0.18, bw + 0.4, 0.6, 0.2); B(g, stone, 0, yw + 0.55, bz - bd / 2 - 0.18, bw + 0.4, 0.6, 0.2); for (const s of [-1, 1]) B(g, stone, s * (bw / 2 + 0.2), yw + 0.55, bz, 0.2, 0.6, bd + 0.4);
    B(g, 0x8a8f90, 0, yw + 0.3, bz, bw - 0.2, 0.06, bd - 0.2);
    // стилобат и ступени
    B(g, stone, 0, 0.45, 2.55, 12.8, 0.9, 4.0); for (let k = 0; k < 4; k++) B(g, stone, 0, 0.12 + k * 0.0, 4.9 + 0.4 * (3 - k) + 0.0, 8.4 + (3 - k) * 0.6, 0.24 + (k === 0 ? 0 : 0), 0.0);
    for (let k = 0; k < 4; k++) B(g, stone, 0, 0.11 + k * 0.2, 4.95 + (3 - k) * 0.42, 9.0 + (3 - k) * 0.0, 0.22 + k * 0.0, 0.42);
    const colH = 4.9, y0 = 0.9;
    for (const x of [-5.0, -3.0, -1.0, 1.0, 3.0, 5.0]) { Y(g, stone, x, y0 + 0.15, 4.0, 0.62, 0.3, 12); Y(g, stone, x, y0 + 0.3 + colH / 2, 4.0, 0.46, colH, 14); B(g, stone, x, y0 + colH + 0.4, 4.0, 1.1, 0.3, 1.1); Y(g, shade(stoneC, 0.92), x, y0 + colH + 0.25, 4.0, 0.58, 0.14, 14); }
    const ey = y0 + colH + 0.55;
    B(g, stone, 0, ey + 0.55, 2.55, 12.6, 1.1, 4.3);
    signBoard(g, 0, ey + 0.55, 4.77, 7.6, 0.74, 0x2e4a3e, gold);
    B(g, shade(stoneC, 1.06), 0, ey + 1.2, 2.55, 12.9, 0.2, 4.6);
    // фронтон
    const pe = ey + 1.3; facePoly(g, stone, [[-6.2, pe], [6.2, pe], [0, pe + 1.55]], 0, 0, 4.7, 0);
    for (const s of [-1, 1]) { slab3(g, 0x6f777a, [s * 6.4, pe - 0.1, 2.55], [0, pe + 1.7, 2.55], [0, 0, 1], 4.9, 0.14); beam(g, shade(stoneC, 1.06), [s * 6.3, pe + 0.02, 4.78], [0, pe + 1.66, 4.78], 0.3, 0.24, [0, 0, 1]); }
    B(g, gold, 0, pe + 0.62, 4.74, 1.0, 1.0, 0.06); Y(g, 0xe8c85a, 0, pe + 0.62, 4.78, 0.42, 0.06, 16, PI / 2, 0, 0); Y(g, 0xb8942a, 0, pe + 0.62, 4.82, 0.28, 0.05, 12, PI / 2, 0, 0);
    // вход
    const FW = wallGroup(g, 0, zf, 0);
    const dr = doorUnit({ color: 0x6a4a2a, frame: stoneC, w: 2.2, h: 3.4, step: stoneC, panels: true }); dr.position.set(0, 0.9, 0.0); FW.add(dr);
    facePoly(FW, 0x2a2e30, archPts(2.4, 1.2, 8), 0, 4.35, 0.04, 0); B(FW, gold, 0, 4.95, 0.1, 0.05, 1.0, 0.04); B(FW, gold, 0, 2.6, 0.12, 0.05, 3.4, 0.03);
    for (const s of [-1, 1]) { const u = windowUnit({ w: 0.95, h: 2.7, frame: stoneC, mull: 'grid', lintel: stoneC, sill: 0xcfc8b8, glass: 0x3b4f5a }); u.position.set(s * 6.55, 1.3, 0); FW.add(u); const u2 = windowUnit({ w: 1.1, h: 2.4, frame: stoneC, mull: 'grid', lintel: stoneC, sill: 0xcfc8b8, glass: 0x3b4f5a }); u2.position.set(s * 3.6, 1.35, 0); FW.add(u2); }
    for (const s of [-1, 1]) { const E = wallGroup(g, s * bw / 2, bz, s * PI / 2); for (const x of [-1.8, 0, 1.8]) { const u = windowUnit({ w: 1.0, h: 2.7, frame: stoneC, mull: 'grid', lintel: stoneC, sill: 0xcfc8b8, glass: 0x3b4f5a }); u.position.set(x, 1.6, 0); E.add(u); } }
    // купол
    const dz = bz, dy = yw + 0.65;
    Y(g, stone, 0, dy + 0.9, dz, 2.4, 1.8, 16); Y(g, stone, 0, dy + 1.85, dz, 2.55, 0.2, 16); Y(g, stone, 0, dy + 0.1, dz, 2.7, 0.3, 16);
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2 + PI / 8; B(g, 0x3b4f5a, 2.42 * Math.sin(a), dy + 1.0, dz + 2.42 * Math.cos(a), 0.5, 0.9, 0.1, 0, a, 0); }
    const dm = new T.Mesh(new T.SphereGeometry(2.4, 18, 8, 0, PI * 2, 0, PI / 2), C.mat(dome, { flatShading: false })); dm.position.set(0, dy + 1.95, dz); dm.castShadow = true; g.add(dm);
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; beam(g, shade(dome, 0.8), [2.42 * Math.sin(a), dy + 1.95, dz + 2.42 * Math.cos(a)], [0.3 * Math.sin(a), dy + 4.3, dz + 0.3 * Math.cos(a)], 0.1, 0.07); }
    Y(g, stone, 0, dy + 4.45, dz, 0.55, 0.7, 10); CT(g, dome, 0, dy + 5.05, dz, 0.6, 0.05, 0.6, 10); blob(g, gold, 0, dy + 5.5, dz, 0.3); B(g, gold, 0, dy + 5.85, dz, 0.04, 0.5, 0.04);
    // фонари, кадки
    for (const x of [-4.8, 4.8]) { lampPost(g, x, 6.6, 2.8, 0x2f3236); B(lamps, 0xffffff, x, 2.72, 6.6, 0.22, 0.28, 0.22); shrub(g, x * 1.3, 6.2, 0.7); }
    for (const x of [-7.2, 7.2]) shrub(g, x, 5.4, 0.9);
    const gl = mergeInto(lamps, lampMat, false);
    return finish(g, 171 + v, [gl]);
  });

  // ================================================================== КАЗИНО
  reg('casino', (opts) => {
    const { v } = optsOf(opts), g = new T.Group(), bulbsA = new T.Group(), bulbsB = new T.Group(), bulbsC = new T.Group();
    const wallC = [0x8a2d4a, 0x1f6a6a, 0x5a3a7a][v % 3], gold = 0xc49a34, cream = 0xf0e4c8, dark = 0x2a1a22;
    townPad(g, 15.8, 11.8, 0xcfcac4);
    const bz = -2.0, bw = 14.0, bd = 7.0, yw = 6.6, zf = bz + bd / 2;
    B(g, PLINTH, 0, 0.25, bz, bw + 0.3, 0.5, bd + 0.3); B(g, surf('bld_plaster', wallC), 0, (0.5 + yw) / 2, bz, bw, yw - 0.5, bd);
    B(g, gold, 0, yw - 0.2, bz, bw + 0.35, 0.4, bd + 0.35); B(g, 0x4a4a52, 0, yw + 0.12, bz, bw + 0.3, 0.24, bd + 0.3);
    for (const [px, pz, pw, pd] of [[0, bd / 2 + 0.1, bw + 0.5, 0.3], [0, -bd / 2 - 0.1, bw + 0.5, 0.3], [bw / 2 + 0.1, 0, 0.3, bd + 0.5], [-bw / 2 - 0.1, 0, 0.3, bd + 0.5]]) { B(g, shade(wallC, 0.75), px, yw + 0.55, bz + pz, pw, 0.6, pd); B(g, gold, px, yw + 0.9, bz + pz, pw + 0.1, 0.1, pd + 0.1); }
    // арки и пилястры
    const F = wallGroup(g, 0, zf, 0);
    for (const x of [-4.8, 4.8]) { archOpening(F, x, 0.6, 2.6, 4.0, 0, gold, 0xf0c070); B(F, 0x2a1a22, x, 3.3, 0.06, 0.06, 2.6, 0.02); B(F, 0x2a1a22, x, 2.2, 0.07, 2.4, 0.06, 0.02); B(F, 0x2a1a22, x, 3.2, 0.07, 2.4, 0.06, 0.02); }
    archOpening(F, 0, 0.6, 3.2, 4.4, 0, gold, 0xf0c070); B(F, 0x2a1a22, 0, 2.7, 0.06, 0.07, 4.2, 0.02); B(F, 0x2a1a22, 0, 3.4, 0.07, 3.0, 0.07, 0.02);
    for (const x of [-7.0, -2.4, 2.4, 7.0]) { B(F, gold, x, 3.55, 0.14, 0.5, 6.1, 0.2); B(F, gold, x, 6.5, 0.14, 0.7, 0.2, 0.3); B(F, gold, x, 0.6, 0.14, 0.7, 0.2, 0.3); }
    for (const s of [-1, 1]) for (const xx of [2.2, 7.15]) { }
    signBoard(F, 0, 5.75, 0.2, 8.0, 0.95, 0x20243e, gold);
    // козырёк-маркиза над входом, красная дорожка
    B(g, gold, 0, 4.7, zf + 1.4, 5.8, 0.28, 2.8); B(g, 0x8f2a2a, 0, 4.88, zf + 1.4, 5.5, 0.1, 2.6); B(g, gold, 0, 4.4, zf + 2.78, 5.9, 0.2, 0.16);
    for (const s of [-1, 1]) { B(g, gold, s * 2.75, 2.5, zf + 2.6, 0.16, 4.4, 0.16); Y(g, gold, s * 2.75, 0.2, zf + 2.6, 0.22, 0.4, 10); }
    B(g, 0xa02a2a, 0, 0.1, zf + 1.9, 2.4, 0.06, 3.8); for (let k = 0; k < 2; k++) B(g, 0xb8b2a4, 0, 0.1 + k * 0.1, zf + 3.5 + k * 0.4, 3.2 - k * 0.3, 0.2, 0.4);
    // лампочки: карниз, маркиза, контур центральной арки
    const bulb = (grp, x, y, z, s) => blob(grp, 0xffffff, x, y, z, s || 0.2);
    for (let x = -6.8; x <= 6.81; x += 0.55) bulb(Math.round((x + 7) / 0.55) % 3 === 1 ? bulbsB : bulbsA, x, yw - 0.2, zf + 0.26);
    for (let x = -2.7; x <= 2.71; x += 0.45) bulb(bulbsA, x, 4.4, zf + 2.9, 0.18);
    for (let z = 0; z <= 2.6; z += 0.5) { bulb(bulbsC, -2.9, 4.5, zf + 0.2 + z, 0.16); bulb(bulbsC, 2.9, 4.5, zf + 0.2 + z, 0.16); }
    for (let k = 0; k <= 10; k++) { const a = k / 10 * PI; bulb(bulbsB, 2.0 * Math.cos(a), 0.6 + 2.8 + 2.0 * Math.sin(a) * 0.9 + 0.2, zf + 0.22, 0.18); }
    for (const s of [-1, 1]) for (let k = 0; k <= 6; k++) { const a = k / 6 * PI; bulb(bulbsC, s * 4.8 + 1.5 * Math.cos(a), 0.6 + 2.7 + 1.5 * Math.sin(a) * 0.9 + 0.1, zf + 0.22, 0.16); }
    // боковые окна
    for (const s of [-1, 1]) { const E = wallGroup(g, s * bw / 2, bz, s * PI / 2); for (const x of [-2.2, 2.2]) { const u = windowUnit({ w: 1.1, h: 2.4, frame: gold, mull: 'v', glass: 0xe0b060, sill: gold }); u.position.set(x, 1.8, 0); E.add(u); } B(E, gold, 0, 3.6, 0.06, 7.0, 0.14, 0.1); }
    // крыша и колесо фортуны
    const wr = 2.6, wy = yw + 4.15, wz = bz + 0.2;
    for (const x of [-1.5, 1.5]) { beam(g, 0x3a3a46, [x * 1.3, yw + 0.35, wz - 0.9], [x * 0.2, wy - 0.2, wz - 0.65], 0.24, 0.24, [0, 0, 1]); beam(g, 0x3a3a46, [x * 1.3, yw + 0.35, wz + 0.9], [x * 0.2, wy - 0.2, wz + 0.45], 0.2, 0.2, [0, 0, 1]); }
    B(g, 0x3a3a46, 0, yw + 0.3, wz, 4.8, 0.14, 2.4); B(g, 0x3a3a46, 0, wy - 0.2, wz - 0.65, 0.5, 0.3, 0.3);
    const wrapper = new T.Group(); wrapper.position.set(0, wy, wz + 0.0); wrapper.rotation.x = PI / 2; 
    const spinner = new T.Group(); spinner.userData.spin = 1; wrapper.add(spinner);
    const sg = new T.Group(), segs = 12, wc = [0xa8302e, 0xf0e4c8, 0x2f7d5a, 0xd4a93a, 0x233a6a, 0xf0e4c8];
    for (let i = 0; i < segs; i++) { const th0 = i / segs * PI * 2, dth = PI * 2 / segs; const w = new T.Mesh(new T.CylinderGeometry(wr, wr, 0.3, 3, 1, false, th0, dth), C.mat(wc[i % 6])); w.castShadow = true; sg.add(w); const a = th0; B(sg, gold, (wr - 0.05) * Math.sin(a), 0.16, (wr - 0.05) * Math.cos(a), 0.12, 0.08, 0.5, 0, a, 0); }
    const rim = new T.TorusGeometry(wr, 0.12, 5, 40); rim.rotateX(PI / 2); const rm = new T.Mesh(rim, C.mat(gold)); rm.castShadow = true; sg.add(rm);
    Y(sg, gold, 0, 0.12, 0, 0.55, 0.4, 14); Y(sg, 0xf0e4c8, 0, 0.34, 0, 0.3, 0.06, 12); Y(sg, 0x8a2d4a, 0, 0.1, 0, 0.08, 0.7, 6);
    const spb = new T.Group(); for (let k = 0; k < 24; k++) { const a = k / 24 * PI * 2; blob(spb, 0xffffff, (wr + 0.05) * Math.sin(a), 0.2, (wr + 0.05) * Math.cos(a), 0.2); }
    const old = Math.random; Math.random = lcg(173); let baked; try { baked = C.bakeTex(sg); } finally { Math.random = old; }
    spinner.add(baked); spinner.add(mergeInto(spb, bulbMat, false));
    CT(wrapper, 0xe05030, 0, 0.3, -(wr + 0.4), 0.28, 0.02, 0.8, 4, PI / 2, 0, 0); // стрелка-указатель (вниз к центру колеса)
    // кадки и швейцарские столбики
    for (const x of [-4.2, 4.2]) { Y(g, gold, x, 0.3, zf + 1.0, 0.3, 0.6, 10); blob(g, 0x3e6a36, x, 0.9, zf + 1.0, 0.7, 0.8, 0.7); }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { Y(g, gold, s * 1.6, 0.5, zf + 1.3 + k * 1.0, 0.05, 1.0, 6); blob(g, gold, s * 1.6, 1.02, zf + 1.3 + k * 1.0, 0.12); }
    const out = finish(g, 181 + v, [mergeInto(bulbsA, bulbMat, false), mergeInto(bulbsB, bulbMatB, false), mergeInto(bulbsC, bulbMatC, false), wrapper]);
    return out;
  });

  // @@END
})();
