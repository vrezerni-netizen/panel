/* Модели техники и транспорта (процедурные, three.js r128): vehicle / truck / trailer / car.
   Перед у всех моделей смотрит в +Z, начало координат — центр опоры на земле, 1 единица ~ 1 м. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, G = C.G, mat = C.mat, texMat = C.texMat;
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  // ------------------------------------------------------------------ текстуры (почти белые, цвет задаётся тоном материала)
  C.addProc('veh_corrug', (cv, g) => { // вертикальный гофрированный лист
    const s = cv.width, n = 16, w = s / n, r = lcg(11);
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.42, '#ececec'); gr.addColorStop(0.5, '#a9a9a9'); gr.addColorStop(0.58, '#ececec'); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.fillRect(i * w, 0, w, s);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,80,60,${0.03 + r() * 0.05})`; g.fillRect(r() * s, r() * s * 0.4, 1 + r() * 2, 40 + r() * 140); }
  }, 128);
  C.addProc('veh_planks', (cv, g) => { // горизонтальные доски
    const s = cv.width, n = 6, h = s / n, r = lcg(23);
    for (let i = 0; i < n; i++) {
      const k = 200 + Math.floor(r() * 50); g.fillStyle = `rgb(${k},${k - 14},${k - 38})`; g.fillRect(0, i * h, s, h);
      for (let j = 0; j < 9; j++) { g.strokeStyle = `rgba(80,55,30,${0.10 + r() * 0.14})`; g.lineWidth = 1; const y = i * h + 3 + r() * (h - 6); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 4, s * 0.6, y + (r() - 0.5) * 4, s, y + (r() - 0.5) * 3); g.stroke(); }
      if (r() < 0.5) { g.fillStyle = 'rgba(70,45,25,0.35)'; g.beginPath(); g.ellipse(r() * s, i * h + h / 2, 5 + r() * 4, 3, 0, 0, PI * 2); g.fill(); }
      g.fillStyle = 'rgba(30,20,10,0.75)'; g.fillRect(0, i * h, s, 2);
      g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(0, i * h + 2, s, 2);
      const bx = r() * s; g.fillStyle = 'rgba(40,40,40,0.8)'; g.fillRect(8, i * h + h / 2 - 1, 3, 3); g.fillRect(s - 12, i * h + h / 2 - 1, 3, 3);
    }
  }, 128);
  C.addProc('veh_diamond', (cv, g) => { // рифлёный металл (подножки, платформы)
    const s = cv.width, r = lcg(5); g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.save(); g.translate(x * s / 8 + s / 16 + ((y % 2) ? s / 16 : 0), y * s / 8 + s / 16); g.rotate(((x + y) % 2) ? 0.78 : -0.78);
      g.fillStyle = '#f2f2f2'; g.fillRect(-s / 40, -s / 14, s / 20, s / 7); g.restore();
    }
  }, 128);

  // ------------------------------------------------------------------ примитивы
  const add = (g, geom, color, o) => { const m = new T.Mesh(geom, mat(color, o)); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  function ext(g, color, x0, x1, y0, y1, z0, z1, o) { // коробка по границам
    const m = add(g, G.box(), color, o);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.scale.set(Math.abs(x1 - x0) || 0.001, Math.abs(y1 - y0) || 0.001, Math.abs(z1 - z0) || 0.001); return m;
  }
  function box(g, color, cx, cy, cz, w, h, d, rx, ry, rz, o) { // коробка по центру с поворотом
    const m = add(g, G.box(), color, o); m.position.set(cx, cy, cz); m.scale.set(w, h, d);
    if (rx || ry || rz) { m.rotation.order = 'YXZ'; m.rotation.set(rx || 0, ry || 0, rz || 0); } return m;
  }
  const cylGeos = {};
  const cylGeo = (seg, k) => { const key = seg + '|' + k; return cylGeos[key] || (cylGeos[key] = new T.CylinderGeometry(0.5 * k, 0.5, 1, seg)); };
  /** цилиндр вдоль оси ('x'|'y'|'z') с центром в (cx,cy,cz); k — отношение радиуса «плюсового» торца к «минусовому» */
  function cyl(g, color, axis, cx, cy, cz, r, len, seg, k, o) {
    const m = add(g, cylGeo(seg || 12, k == null ? 1 : k), color, o); m.position.set(cx, cy, cz);
    if (axis === 'x') { m.rotation.z = -PI / 2; m.scale.set(r * 2, len, r * 2); }
    else if (axis === 'z') { m.rotation.x = PI / 2; m.scale.set(r * 2, len, r * 2); }
    else m.scale.set(r * 2, len, r * 2);
    return m;
  }
  const sphGeos = {};
  function sph(g, color, cx, cy, cz, rx, ry, rz, ws, hs, o) {
    const key = (ws || 10) + '|' + (hs || 8); const geo = sphGeos[key] || (sphGeos[key] = new T.SphereGeometry(0.5, ws || 10, hs || 8));
    const m = add(g, geo, color, o); m.position.set(cx, cy, cz); m.scale.set(rx * 2, (ry == null ? rx : ry) * 2, (rz == null ? rx : rz) * 2); return m;
  }
  const V3 = (a) => new T.Vector3(a[0], a[1], a[2]);
  function beam(g, color, a, b, w, h, o) { // брус между двумя точками
    const A = V3(a), B = V3(b), d = B.clone().sub(A), len = d.length(); if (len < 1e-5) return null;
    const m = add(g, G.box(), color, o); m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.scale.set(w, len, h == null ? w : h); return m;
  }
  function tube(g, color, a, b, r, seg, o) { // труба между двумя точками
    const A = V3(a), B = V3(b), d = B.clone().sub(A), len = d.length(); if (len < 1e-5) return null;
    const m = add(g, cylGeo(seg || 8, 1), color, o); m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.scale.set(r * 2, len, r * 2); return m;
  }
  /** выпуклая «коробка» из 8 точек: низ [пл,пп,зп,зл], верх [пл,пп,зп,зл] (пл — передний левый и т.д.) */
  function hullGeo(bot, top) {
    const P = bot.concat(top), cen = [0, 0, 0]; P.forEach((p) => { cen[0] += p[0] / 8; cen[1] += p[1] / 8; cen[2] += p[2] / 8; });
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]], pos = [];
    for (const f of faces) {
      let q = f.map((i) => P[i]); const fc = [0, 0, 0]; q.forEach((p) => { fc[0] += p[0] / 4; fc[1] += p[1] / 4; fc[2] += p[2] / 4; });
      const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) < 0) q = [q[0], q[3], q[2], q[1]];
      for (const i of [0, 1, 2, 0, 2, 3]) pos.push(q[i][0], q[i][1], q[i][2]);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); return geo;
  }
  const hull = (g, color, bot, top, o) => add(g, hullGeo(bot, top), color, o);
  /** усечённая коробка: низ w0×d0 (центр по x=0, z=zc0), верх w1×d1 (zc1), от y0 до y1 */
  function taper(g, color, x, y0, y1, zc0, d0, w0, zc1, d1, w1, o) {
    const r = (w, d, zc, y) => [[x - w / 2, y, zc + d / 2], [x + w / 2, y, zc + d / 2], [x + w / 2, y, zc - d / 2], [x - w / 2, y, zc - d / 2]];
    return hull(g, color, r(w0, d0, zc0, y0), r(w1, d1, zc1, y1), o);
  }
  /** профиль сбоку (точки [z,y]) выдавливается на ширину width вдоль X, с лёгкой фаской */
  function sideGeo(pts, width, bv) {
    bv = bv == null ? 0.05 : bv;
    const sh = new T.Shape(pts.map((p) => new T.Vector2(p[0], p[1])));
    const geo = new T.ExtrudeGeometry(sh, { depth: width - 2 * bv, bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * 0.8, bevelSegments: 2, curveSegments: 6 });
    geo.rotateY(-PI / 2); geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0); return geo;
  }
  const sideProfile = (g, color, pts, width, bv, o) => add(g, sideGeo(pts, width, bv), color, o);
  /** дуга-полоса (крыло): кольцевой сектор в плоскости YZ, выдавлен вдоль X от x0 до x1; углы от +Z вверх */
  function arcStrip(g, color, x0, x1, cy, cz, R, t, a0, a1, o) {
    const pts = [], n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (PI / 14)));
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(new T.Vector2(cz + (R + t) * Math.cos(a), cy + (R + t) * Math.sin(a))); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push(new T.Vector2(cz + R * Math.cos(a), cy + R * Math.sin(a))); }
    const geo = new T.ExtrudeGeometry(new T.Shape(pts), { depth: Math.abs(x1 - x0), bevelEnabled: false, curveSegments: 1 });
    geo.rotateY(-PI / 2); geo.translate(Math.max(x0, x1), 0, 0); return add(g, geo, color, o);
  }
  /** тело вращения (профиль [радиус, высота] вокруг оси Y), затем поворот к оси */
  function latheGeo(prof, seg, axis) {
    const geo = new T.LatheGeometry(prof.map((p) => new T.Vector2(p[0], p[1])), seg || 16);
    if (axis === 'z') geo.rotateX(PI / 2); else if (axis === 'x') geo.rotateZ(-PI / 2); return geo;
  }
  /** капсула-бочка: цилиндр радиуса r длиной len с эллиптическими днищами глубиной dome (профиль для latheGeo, снизу вверх) */
  function capsuleProf(r, len, dome, steps) {
    const h = len / 2, p = []; steps = steps || 5;
    for (let i = 0; i <= steps; i++) { const a = i / steps * PI / 2; p.push([Math.max(0.001, r * Math.sin(a)), -h - dome * Math.cos(a)]); }
    for (let i = 0; i <= steps; i++) { const a = i / steps * PI / 2; p.push([Math.max(0.001, r * Math.cos(a)), h + dome * Math.sin(a)]); }
    return p;
  }
  /** коробка с развёрнутыми по размеру UV для текстуры name (tile — метров на повтор) */
  function texBox(g, name, color, x0, x1, y0, y1, z0, z1, tile) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0), geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv, t = tile || 1;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / t, uv.getY(k) * dims[f][1] / t); }
    const m = new T.Mesh(geo, texMat(name, 1, 1, color, 0, 0, 0, { color })); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }

  // ------------------------------------------------------------------ стекло, фары (после запекания), слияние
  const GLASS = () => mat(0x86aec4, { transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false, flatShading: false });
  function pane(post, a, b, c, d) {
    const geo = new T.BufferGeometry(), p = [a, b, c, a, c, d].flat();
    geo.setAttribute('position', new T.Float32BufferAttribute(p, 3)); geo.computeVertexNormals();
    const m = new T.Mesh(geo, GLASS()); post.add(m); return m;
  }
  const lampMat = (c, e, k) => mat(c, { emissive: e, emissiveIntensity: k == null ? 0.85 : k, flatShading: false });
  function lamp(post, cx, cy, cz, w, h, d, color, emis, k) { const m = new T.Mesh(G.box(), lampMat(color, emis == null ? color : emis, k)); m.position.set(cx, cy, cz); m.scale.set(w, h, d); post.add(m); return m; }
  function lampSph(post, cx, cy, cz, rx, ry, rz, color, emis, k) { const m = new T.Mesh(G.sph(), lampMat(color, emis == null ? color : emis, k)); m.position.set(cx, cy, cz); m.scale.set(rx * 2, ry * 2, rz * 2); post.add(m); return m; }
  function mergeByMat(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    group.traverse((o) => {
      if (!o.isMesh) return; let B = buckets.get(o.material); if (!B) buckets.set(o.material, B = { pos: [], nor: [] });
      let geo = o.geometry; if (geo.index) geo = geo.toNonIndexed(); if (!geo.attributes.normal) { geo = geo.clone(); geo.computeVertexNormals(); }
      const pa = geo.attributes.position, na = geo.attributes.normal; nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); B.pos.push(v.x, v.y, v.z); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); B.nor.push(n.x, n.y, n.z); }
    });
    const out = new T.Group();
    for (const [mt, B] of buckets) {
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(B.pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(B.nor, 3));
      const m = new T.Mesh(geo, mt); m.castShadow = false; m.receiveShadow = false; if (mt.transparent) m.renderOrder = 2; out.add(m);
    }
    return out;
  }
  /** запекание без Math.random: цвет деталей почти одинаков и всегда один и тот же для одних opts */
  function bakeDet(g, seed) {
    const r = lcg(seed || 1), saved = Math.random; Math.random = () => 0.5 + (r() - 0.5) * 0.4;
    try { return C.bakeTex(g); } finally { Math.random = saved; }
  }
  function finish(g, post, seed, scale) {
    g.updateMatrixWorld(true);
    const out = new T.Group(); out.add(bakeDet(g, seed)); if (post && post.children.length) out.add(mergeByMat(post));
    if (scale && scale !== 1) out.scale.setScalar(scale);
    // поставить на землю: опустить/поднять так, чтобы нижняя точка была на y=0
    out.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(out); if (isFinite(bb.min.y) && Math.abs(bb.min.y) > 0.001) { out.children.forEach((c) => { c.position.y -= bb.min.y; }); }
    return out;
  }

  // ------------------------------------------------------------------ колёса
  let _lug = null;
  function lugGeo() { if (!_lug) { const b = new T.BoxGeometry(1, 1, 1), idx = b.index.array, keep = []; for (let i = 0; i < idx.length; i++) if (i < 6 || i >= 12) keep.push(idx[i]); b.setIndex(keep); _lug = b; } return _lug; }
  /** Колесо: шина (тело вращения) + диск + ступица. Ось вращения — X; side=+1: наружу смотрит +X, -1: -X. */
  function wheel(g, x, y, z, R, W, side, o) {
    o = o || {};
    const kind = o.kind || 'plain', rr = (o.rr || 0.5) * R, tire = o.tire || 0x1d1e20, rim = o.rim || 0x8a8f94, hub = o.hub || 0x4d5258, seg = o.seg || (R > 0.7 ? 20 : 16);
    const tg = new T.Group(), sh = Math.min(W * 0.26, R * 0.14), h2 = W / 2;
    const pr = [[rr * 0.97, -h2 * 0.97], [R - sh * 1.1, -h2], [R - sh * 0.3, -h2 + sh * 0.4], [R, -h2 + sh * 1.1]];
    if (kind === 'plain' || kind === 'car') { const gd = R * 0.012, a = W * 0.17, b = W * 0.06; pr.push([R, -a - b], [R - gd, -a - b * 0.6], [R - gd, -a + b * 0.6], [R, -a + b], [R, a - b], [R - gd, a - b * 0.6], [R - gd, a + b * 0.6], [R, a + b]); }
    pr.push([R, h2 - sh * 1.1], [R - sh * 0.3, h2 - sh * 0.4], [R - sh * 1.1, h2], [rr * 0.97, h2 * 0.97]);
    const tg0 = new T.LatheGeometry(pr.map((p) => new T.Vector2(p[0], p[1])), seg);
    add(tg, tg0, tire);
    if (kind === 'lug') { // грунтозацепы ёлочкой (коробки без внутренней грани)
      const n = o.lugs || 16, lh = R * 0.05, lw = W * 0.5, lt = 2 * PI * R / n * 0.36, lc = o.lugC || tire;
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
        const a = (i + (s > 0 ? 0.5 : 0)) / n * PI * 2, m = add(tg, lugGeo(), lc);
        m.rotation.order = 'YXZ'; m.rotation.set(-s * 0.55, -a, 0); m.position.set(Math.cos(a) * (R + lh * 0.05), s * W * 0.2, Math.sin(a) * (R + lh * 0.05)); m.scale.set(lh * 1.5, lw * 0.5, lt);
      }
    }
    // диск и ступица (наружная сторона = +Y в локальных координатах колеса)
    const rs = Math.min(seg, 14);
    cyl(tg, rim, 'y', 0, 0, 0, rr, W * 0.7, rs);
    if (!o.noHub) {
      cyl(tg, rim, 'y', 0, h2 * 0.5 + 0.02, 0, rr * 0.86, 0.05, rs);
      cyl(tg, hub, 'y', 0, h2 * 0.55 + 0.03, 0, rr * 0.34, Math.max(0.12, W * 0.28), 10);
      cyl(tg, o.cap || hub, 'y', 0, h2 * 0.55 + 0.03 + Math.max(0.12, W * 0.28) / 2, 0, rr * 0.2, 0.05, 8);
      const nn = R > 0.7 ? (o.nuts || 0) : 0; for (let i = 0; i < nn; i++) { const a = i / nn * PI * 2; box(tg, 0x2a2c2f, Math.cos(a) * rr * 0.6, h2 * 0.5 + 0.06, Math.sin(a) * rr * 0.6, 0.045, 0.04, 0.045); }
      if (kind === 'car') for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; const sp = box(tg, rim, Math.cos(a) * rr * 0.55, h2 * 0.5 + 0.035, Math.sin(a) * rr * 0.55, rr * 0.2, 0.025, rr * 0.9); sp.rotation.set(0, -a + PI / 2, 0); sp.position.set(Math.cos(a) * rr * 0.52, h2 * 0.5 + 0.035, Math.sin(a) * rr * 0.52); }
    } else cyl(tg, hub, 'y', 0, -h2 * 0.4, 0, rr * 0.4, 0.04, 10);
    tg.position.set(x, y, z); tg.rotation.z = side > 0 ? -PI / 2 : PI / 2; g.add(tg); return tg;
  }

  // ------------------------------------------------------------------ кабина: стойки, крыша, стёкла
  function cabin(g, post, S) {
    const P = S.p || 0.08, col = S.color, rc = S.roof || col, yb = S.yb, yt = S.yt;
    const corner = (sx, top, fr) => top ? [sx * S.xt, yt, fr ? S.zft : S.zbt] : [sx * S.xb, yb, fr ? S.zfb : S.zbb];
    for (const sx of [-1, 1]) for (const fr of [true, false]) beam(g, col, corner(sx, 0, fr), corner(sx, 1, fr), P, P);
    const o = S.over == null ? 0.05 : S.over, th = S.roofT || 0.07, xr = S.xt + o, zf = S.zft + o, zb = S.zbt - o, ya = yt - th * 0.6;
    hull(g, rc, [[-xr, ya, zf], [xr, ya, zf], [xr, ya, zb], [-xr, ya, zb]], [[-xr + 0.05, ya + th, zf - 0.05], [xr - 0.05, ya + th, zf - 0.05], [xr - 0.05, ya + th, zb + 0.05], [-xr + 0.05, ya + th, zb + 0.05]]);
    const L = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    if (S.front !== false) pane(post, corner(-1, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(-1, 1, 1));
    if (S.rear !== false) pane(post, corner(1, 0, 0), corner(-1, 0, 0), corner(-1, 1, 0), corner(1, 1, 0));
    const marks = [0].concat(S.mid || []).concat([1]);
    for (const sx of [-1, 1]) {
      const fb = corner(sx, 0, 1), bb = corner(sx, 0, 0), ft = corner(sx, 1, 1), bt = corner(sx, 1, 0);
      for (let i = 0; i < marks.length - 1; i++) {
        const f0 = marks[i], f1 = marks[i + 1];
        if (S.side !== false) pane(post, L(fb, bb, f0), L(fb, bb, f1), L(ft, bt, f1), L(ft, bt, f0));
        if (i > 0) beam(g, col, L(fb, bb, f0), L(ft, bt, f0), P * 0.8, P * 0.8);
      }
      if (S.belt) beam(g, col, L(fb, bb, 0), L(fb, bb, 1), P * 0.7, P * 0.7);
    }
  }

  // ================================================================== ТРАКТОР
  const SCALE = [1, 1.0, 1.04, 1.1, 1.15, 1.2, 1.26, 1.32, 1.38, 1.44];
  const tierOf = (lv) => (lv <= 3 ? 0 : lv <= 6 ? 1 : 2);
  const TRACTOR_PAL = {
    tractor: (t) => ({ body: [0x4f8442, 0x3f7a42, 0x2f6a3d][t], dark: [0x35602f, 0x2c5a33, 0x22492b][t], trim: 0xd4ab38, rim: [0xc9a43f, 0xd0a73a, 0xd6ae38][t], roof: 0xdedacb, stripe: 0xd4ab38 }),
    spreader: (t) => ({ body: [0xc06a2e, 0xb8622a, 0xa95a28][t], dark: 0x6b4a2f, trim: 0x7a5535, rim: 0xd9d0b8, roof: 0xdcd3bf, stripe: 0x6b4a2f }),
  };
  /** Трактор (перёд +Z, начало у середины колёсной базы). o: {tier, pal, dual, weights, drawbarOnly} */
  function buildTractor(g, post, o) {
    const tier = o.tier, P = o.pal, dual = tier >= 2 && o.dual !== false;
    const BODY = P.body, DARK = P.dark, TRIM = P.trim, RIM = P.rim, ROOF = P.roof;
    const K = 0x25272a, GR = 0x707680, ST = 0x464b51, IRON = 0x4c5258;
    const RR = 0.98, RW = dual ? 0.4 : 0.5, FRr = 0.58, FW = 0.32, rz = -1.15, fz = 1.55, rx = dual ? 1.04 : 1.07, fx = 0.97;
    for (const s of [-1, 1]) {
      wheel(g, s * rx, RR, rz, RR, RW, s, { kind: 'lug', rr: 0.47, lugs: 14, rim: RIM, hub: ST, nuts: dual ? 0 : 8, noHub: dual, lugC: 0x26272a });
      if (dual) {
        wheel(g, s * (rx + RW + 0.03), RR, rz, RR, RW, s, { kind: 'lug', rr: 0.47, lugs: 14, rim: RIM, hub: ST, nuts: 8, lugC: 0x26272a });
        cyl(g, RIM, 'x', s * (rx + RW / 2 + 0.015), RR, rz, RR * 0.34, 0.1, 12);
      }
      wheel(g, s * fx, FRr, fz, FRr, FW, s, { kind: 'lug', rr: 0.5, lugs: 12, rim: RIM, hub: ST, lugC: 0x26272a });
    }
    // мосты и силовая часть
    cyl(g, ST, 'x', 0, RR, rz, 0.14, 2 * rx + 0.1, 10);
    for (const s of [-1, 1]) cyl(g, IRON, 'x', s * 0.6, RR, rz, 0.2, 0.55, 12);
    ext(g, IRON, -0.42, 0.42, 0.55, 1.35, -1.6, -0.78);
    ext(g, IRON, -0.36, 0.36, 0.62, 1.3, -0.8, 0.45);
    ext(g, IRON, -0.40, 0.40, 0.62, 1.05, 0.4, 2.3);
    ext(g, 0x34383d, -0.3, 0.3, 0.5, 0.64, 0.5, 2.0);
    cyl(g, ST, 'x', 0, FRr, fz, 0.1, 2 * fx - 0.3, 10);
    ext(g, IRON, -0.2, 0.2, 0.5, 0.95, fz - 0.35, fz + 0.35);
    for (const s of [-1, 1]) { tube(g, ST, [s * 0.66, FRr + 0.06, fz - 0.1], [s * 0.22, 0.62, fz - 0.4], 0.025, 6); cyl(g, ST, 'y', s * (fx - 0.2), FRr + 0.05, fz, 0.07, 0.3, 8); }
    // капот, решётка, фары
    hull(g, BODY, [[-0.46, 0.98, 2.3], [0.46, 0.98, 2.3], [0.52, 0.98, 0.12], [-0.52, 0.98, 0.12]], [[-0.34, 1.62, 2.26], [0.34, 1.62, 2.26], [0.4, 1.85, 0.16], [-0.4, 1.85, 0.16]]);
    ext(g, K, -0.2, 0.2, 1.8, 1.84, 0.32, 0.78);
    for (let i = 0; i < 4; i++) ext(g, GR, -0.18 + i * 0.12, -0.14 + i * 0.12, 1.806, 1.846, 0.34, 0.76);
    ext(g, K, -0.3, 0.3, 1.06, 1.54, 2.25, 2.31);
    for (let i = 0; i < 7; i++) ext(g, GR, -0.27 + i * 0.09, -0.25 + i * 0.09, 1.08, 1.52, 2.305, 2.325);
    ext(g, TRIM, -0.35, 0.35, 1.55, 1.62, 2.24, 2.32);
    ext(g, DARK, -0.36, 0.36, 0.96, 1.07, 2.24, 2.31);
    for (const s of [-1, 1]) { box(g, K, s * 0.37, 1.43, 2.285, 0.26, 0.17, 0.06); lamp(post, s * 0.37, 1.43, 2.32, 0.2, 0.11, 0.04, 0xfff3c4, 0xffe9a0, 0.9); }
    if (tier >= 2) { const hs = P.stripe; for (const s of [-1, 1]) for (const [y0, y1] of [[1.2, 1.28], [1.32, 1.36]]) {
      const xr = (y) => 0.52 - (y - 0.98) / 0.87 * 0.12, xf = (y) => 0.46 - (y - 0.98) / 0.64 * 0.12, e = 0.012;
      hull(g, hs, [[s * xf(y0), y0, 2.27], [s * xf(y1), y1, 2.27], [s * xr(y1), y1, 0.2], [s * xr(y0), y0, 0.2]], [[s * (xf(y0) + e), y0, 2.27], [s * (xf(y1) + e), y1, 2.27], [s * (xr(y1) + e), y1, 0.2], [s * (xr(y0) + e), y0, 0.2]]); } }
    // передние грузы
    ext(g, IRON, -0.4, 0.4, 0.52, 0.76, 2.27, 2.52);
    const nw = tier >= 1 ? 5 : 3;
    for (let i = 0; i < nw; i++) { ext(g, 0x5a616b, -0.34, 0.34, 0.5, 1.1, 2.52 + i * 0.1, 2.6 + i * 0.1); ext(g, 0x3c4147, -0.1, 0.1, 1.1, 1.14, 2.52 + i * 0.1, 2.6 + i * 0.1); }
    ext(g, K, -0.07, 0.07, 0.78, 1.0, 2.52, 2.52 + nw * 0.1);
    // кабина
    ext(g, DARK, -0.78, 0.78, 1.04, 1.16, -1.92, 0.16);
    ext(g, BODY, -0.76, 0.76, 1.16, 1.5, -1.8, 0.1);
    for (const s of [-1, 1]) ext(g, DARK, s * 0.755, s * 0.775, 1.2, 1.44, -1.15, -0.45);
    cabin(g, post, { color: BODY, roof: ROOF, xb: 0.74, xt: 0.7, yb: 1.5, yt: 3.0, zfb: 0.08, zft: -0.06, zbt: -1.72, zbb: -1.78, p: 0.09, mid: [0.5], over: 0.07 });
    ext(g, DARK, -0.62, 0.62, 1.5, 1.86, -0.14, 0.08); // панель приборов
    ext(g, K, -0.45, 0.45, 1.86, 1.9, -0.3, 0.06);
    box(g, K, 0, 1.4, -1.14, 0.52, 0.24, 0.5); box(g, K, 0, 1.74, -1.4, 0.5, 0.62, 0.1, -0.15, 0, 0);
    box(g, K, 0, 1.52, -1.14, 0.1, 0.44, 0.1);
    tube(g, K, [0, 1.52, -0.1], [0, 1.98, -0.38], 0.025, 6);
    { const sw = cyl(g, K, 'y', 0, 2.02, -0.42, 0.17, 0.035, 14); sw.rotation.x = -0.95; }
    ext(g, K, 0.42, 0.58, 1.5, 1.7, -1.3, -0.55);
    // крыша: кондиционер, фонари, проблесковый маячок, антенна GPS
    ext(g, ROOF, -0.32, 0.32, 3.03, 3.12, -1.6, -1.1);
    if (tier >= 1) {
      const xs = tier >= 2 ? [-0.62, -0.22, 0.22, 0.62] : [-0.45, 0.45];
      for (const x of xs) { box(g, K, x, 3.07, 0.0, 0.2, 0.1, 0.08); lamp(post, x, 3.075, 0.045, 0.16, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.95); }
      for (const x of [-0.5, 0.5]) { box(g, K, x, 3.07, -1.8, 0.18, 0.1, 0.08); lamp(post, x, 3.075, -1.845, 0.14, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.95); }
      cyl(g, K, 'y', -0.5, 3.1, -1.4, 0.08, 0.1, 10); lampSph(post, -0.5, 3.17, -1.4, 0.09, 0.08, 0.09, 0xd88a22, 0xe0902a, 0.9);
    }
    if (tier >= 2) { sph(g, 0xe3e3df, 0.0, 3.1, -0.7, 0.17, 0.09, 0.17, 12, 6); cyl(g, K, 'y', 0.45, 3.22, -1.5, 0.01, 0.35, 5); }
    // зеркала
    for (const s of [-1, 1]) {
      const big = tier >= 1; tube(g, K, [s * 0.78, 2.15, 0.02], [s * 1.2, big ? 2.5 : 2.4, 0.16], 0.018, 6); tube(g, K, [s * 0.78, 2.7, 0.02], [s * 1.2, big ? 2.5 : 2.4, 0.16], 0.018, 6);
      box(g, K, s * 1.22, big ? 2.5 : 2.4, 0.16, 0.05, big ? 0.46 : 0.34, big ? 0.22 : 0.17); box(g, 0xb4c4cf, s * 1.245, big ? 2.5 : 2.4, 0.16, 0.012, big ? 0.4 : 0.29, big ? 0.18 : 0.13);
    }
    // выхлопная и воздухозаборная трубы
    tube(g, K, [-0.34, 1.78, 0.62], [-0.34, 3.17, 0.62], 0.055, 8); cyl(g, 0x3a3c40, 'y', -0.34, 1.9, 0.62, 0.095, 0.16, 10); box(g, K, -0.34, 3.2, 0.62, 0.14, 0.025, 0.14, -0.55, 0, 0);
    if (tier >= 2) { tube(g, K, [-0.46, 1.74, 0.5], [-0.46, 2.95, 0.5], 0.04, 8); }
    tube(g, IRON, [0.34, 1.78, 0.55], [0.34, 2.45, 0.55], 0.07, 10); cyl(g, K, 'y', 0.34, 2.48, 0.55, 0.1, 0.07, 10);
    // крылья
    for (const s of [-1, 1]) {
      const xa = s * (rx - RW / 2 - 0.04), xb = s * (rx + RW / 2 + 0.05 + (dual ? RW + 0.03 : 0));
      arcStrip(g, BODY, Math.min(xa, xb), Math.max(xa, xb), RR, rz, RR + 0.1, 0.05, 0.12, 3.05);
      ext(g, DARK, Math.min(xa, xb), Math.max(xa, xb), 1.1, 1.14, -2.26, -2.2);
      lamp(post, s * (rx + 0.1), 1.2, -2.24, 0.14, 0.1, 0.04, 0xb83024, 0xc03020, 0.8);
      if (tier >= 1) arcStrip(g, BODY, s * (fx - FW / 2 - 0.04) - 0.0, s * (fx + FW / 2 + 0.04), FRr, fz, FRr + 0.08, 0.04, 0.4, 2.7);
    }
    // подножки и поручень
    for (const [y, z0, z1] of [[0.62, 0.0, 0.5], [0.98, 0.0, 0.46]]) ext(g, GR, -1.0, -0.6, y - 0.025, y + 0.025, z0, z1);
    tube(g, K, [-0.84, 1.1, 0.2], [-0.84, 2.5, 0.12], 0.02, 6);
    // навеска: нижние тяги, подъёмные тяги, верхняя тяга, прицепной брус, ВОМ
    ext(g, DARK, -0.7, 0.7, 0.62, 1.1, -2.0, -1.55);
    for (const s of [-1, 1]) {
      tube(g, IRON, [s * 0.62, 1.0, -1.9], [s * 0.62, 1.55, -2.2], 0.05, 8);
      tube(g, GR, [s * 0.62, 1.55, -2.2], [s * 0.58, 0.62, -2.14], 0.025, 6);
      tube(g, K, [s * 0.45, 0.55, -1.6], [s * 0.55, 0.5, -2.4], 0.04, 8); sph(g, K, s * 0.55, 0.5, -2.42, 0.06, 0.06, 0.06, 8, 6);
    }
    tube(g, GR, [0, 1.3, -1.95], [0, 1.0, -2.42], 0.03, 6);
    ext(g, K, -0.18, 0.18, 0.4, 0.48, -2.35, -1.6); cyl(g, GR, 'y', 0, 0.5, -2.3, 0.03, 0.14, 8);
    cyl(g, GR, 'z', 0, 0.82, -2.12, 0.035, 0.26, 8);
    return { rearZ: -2.45, frontZ: 2.52 + nw * 0.1 };
  }
  FM.register('vehicle', 'tractor', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    buildTractor(g, post, { tier, pal: TRACTOR_PAL.tractor(tier) });
    return finish(g, post, 100 + lv, SCALE[lv - 1]);
  });

  // ================================================================== КОМБАЙН
  /** гусеничная лента-«стадион» с грунтозацепами и катками; перёд +Z, центр по z=zc, ширина W, длина len, высота hgt */
  function crawler(g, cx, zc, len, hgt, W, belt, disc) {
    const r = hgt / 2, t = 0.13, s = len - 2 * r, side = cx > 0 ? 1 : -1;
    const loop = (rad) => { const p = []; const n = 10;
      for (let i = 0; i <= n; i++) { const a = -PI / 2 + PI * i / n; p.push(new T.Vector2(zc + s / 2 + rad * Math.cos(a), r + rad * Math.sin(a))); }
      for (let i = 0; i <= n; i++) { const a = PI / 2 + PI * i / n; p.push(new T.Vector2(zc - s / 2 + rad * Math.cos(a), r + rad * Math.sin(a))); } return p; };
    const sh = new T.Shape(loop(r)); sh.holes.push(new T.Path(loop(r - t).reverse()));
    const geo = new T.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false, curveSegments: 1 }); geo.rotateY(-PI / 2); geo.translate(cx + W / 2, 0, 0);
    add(g, geo, belt);
    const n = Math.round((2 * s + 2 * PI * r) / 0.34), L = 2 * s + 2 * PI * r;
    for (let i = 0; i < n; i++) {
      let d = i / n * L, z, y, ang;
      if (d < s) { z = zc - s / 2 + d; y = 0; ang = -PI / 2; }
      else if (d < s + PI * r) { const a = -PI / 2 + (d - s) / r; z = zc + s / 2 + r * Math.cos(a); y = r + r * Math.sin(a); ang = a; }
      else if (d < 2 * s + PI * r) { z = zc + s / 2 - (d - s - PI * r); y = 2 * r; ang = PI / 2; }
      else { const a = PI / 2 + (d - 2 * s - PI * r) / r; z = zc - s / 2 + r * Math.cos(a); y = r + r * Math.sin(a); ang = a; }
      const m = add(g, G.box(), 0x2a2b2d); m.position.set(cx + W / 2, y + Math.sin(ang) * 0.03 - (ang === -PI / 2 ? 0.0 : 0), z + Math.cos(ang) * 0.03); m.rotation.x = -(ang + PI / 2) + PI / 2 * 0; m.rotation.x = ang === -PI / 2 ? 0 : -(ang + PI / 2); m.scale.set(W * 1.02, 0.07, 0.12);
    }
    const ro = r - t - 0.02;
    for (const z of [zc + s / 2, zc - s / 2]) { cyl(g, disc, 'x', cx + W / 2, r, z, ro, W * 0.72, 14); cyl(g, 0x3b3f44, 'x', cx + W / 2 + side * (W * 0.36), r, z, ro * 0.45, 0.06, 10); }
    ext(g, disc, cx + W * 0.15, cx + W * 0.85, r * 0.55, hgt - t * 1.2, zc - s / 2, zc + s / 2);
    for (let i = 0; i < 3; i++) { const z = zc - s / 2 + s * (i + 0.5) / 3; cyl(g, 0x3b3f44, 'x', cx + W / 2 + side * (W * 0.36), r * 0.55, z, 0.17, 0.06, 10); }
  }
  /** мотовило жатки: ось вдоль X, радиус R, длина 2*hw */
  function reel(g, cz, cy, R, hw, bar, spid) {
    cyl(g, spid, 'x', 0, cy, cz, 0.1, 2 * hw + 0.2, 8);
    const nb = 6;
    for (const x of [-hw + 0.05, 0, hw - 0.05]) for (let i = 0; i < nb; i++) { const a = i / nb * PI * 2; beam(g, spid, [x, cy, cz], [x, cy + Math.sin(a) * R, cz + Math.cos(a) * R], 0.06, 0.04); }
    for (let i = 0; i < nb; i++) { const a = i / nb * PI * 2 + 0.2, y = cy + Math.sin(a) * R, z = cz + Math.cos(a) * R;
      box(g, bar, 0, y, z, 2 * hw, 0.07, 0.1, -a + PI / 2 - 0.0, 0, 0); }
  }
  function buildCombine(g, post, o) {
    const tier = o.tier, P = o.pal, RED = P.body, RD = P.dark, ROOF = P.roof, YEL = P.trim;
    const K = 0x25272a, GR = 0x717780, ST = 0x464b51, IRON = 0x4c5258, hw = [1.95, 2.1, 2.35][tier], tracks = tier >= 2;
    // ходовая: ведущие колёса (или гусеницы) спереди, управляемые сзади
    for (const s of [-1, 1]) {
      if (tracks) crawler(g, s * 1.2, 1.55, 2.9, 1.3, 0.85, 0x2d2e30, 0x565c62);
      else wheel(g, s * 1.55, 0.95, 1.55, 0.95, 0.72, s, { kind: 'lug', rr: 0.5, lugs: 12, rim: YEL, hub: ST, nuts: 8, lugC: 0x26272a });
      wheel(g, s * 1.3, 0.62, -3.45, 0.62, 0.42, s, { kind: 'lug', rr: 0.5, lugs: 10, rim: YEL, hub: ST, lugC: 0x26272a });
    }
    cyl(g, ST, 'x', 0, 0.62, -3.45, 0.12, 2.6, 8); cyl(g, ST, 'x', 0, 0.95, 1.55, 0.16, 2.9, 8);
    // нижний корпус, молотилка, шасси
    ext(g, 0x4f555b, -1.1, 1.1, 0.8, 1.35, -3.0, 2.0);
    ext(g, RED, -1.15, 1.15, 1.35, 2.05, -3.0, 2.0);
    ext(g, RD, -1.17, 1.17, 1.2, 1.36, -3.0, 2.0);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) ext(g, RD, s * 1.15, s * 1.19, 1.5 + i * 0.12, 1.56 + i * 0.12, -2.8, -0.9); // жалюзи молотилки
    // кабина
    ext(g, RD, -0.98, 0.98, 2.0, 2.62, 0.7, 2.6);
    ext(g, RED, -1.0, 1.0, 2.0, 2.3, 0.65, 2.65);
    cabin(g, post, { color: RED, roof: ROOF, xb: 0.95, xt: 0.92, yb: 2.62, yt: 3.92, zfb: 2.55, zft: 2.38, zbt: 0.82, zbb: 0.82, p: 0.1, mid: [0.5], over: 0.1, roofT: 0.09 });
    ext(g, K, -0.7, 0.7, 2.62, 3.0, 0.9, 1.15); ext(g, RD, -0.6, 0.6, 2.62, 2.95, 2.42, 2.58);
    box(g, K, 0, 2.9, 1.5, 0.5, 0.35, 0.5); box(g, K, 0, 3.25, 1.2, 0.5, 0.65, 0.1, -0.15, 0, 0);
    tube(g, K, [0, 2.95, 2.4], [0, 3.35, 2.1], 0.025, 6); { const sw = cyl(g, K, 'y', 0, 3.4, 2.05, 0.17, 0.035, 12); sw.rotation.x = -0.95; }
    ext(g, ROOF, -0.4, 0.4, 4.0, 4.1, 1.0, 1.7); // кондиционер
    // питатель и жатка
    hull(g, RED, [[-0.85, 0.5, 3.2], [0.85, 0.5, 3.2], [0.85, 1.35, 1.9], [-0.85, 1.35, 1.9]], [[-0.85, 1.25, 3.2], [0.85, 1.25, 3.2], [0.85, 2.45, 2.0], [-0.85, 2.45, 2.0]]);
    for (const s of [-1, 1]) ext(g, RD, s * 0.86, s * 0.9, 0.55, 2.2, 1.95, 3.2);
    hull(g, RED, [[-hw, 0.2, 4.45], [hw, 0.2, 4.45], [hw, 0.44, 3.15], [-hw, 0.44, 3.15]], [[-hw, 0.3, 4.45], [hw, 0.3, 4.45], [hw, 0.54, 3.15], [-hw, 0.54, 3.15]]);
    ext(g, RED, -hw, hw, 0.4, 1.3, 3.08, 3.22);
    cyl(g, RD, 'x', 0, 0.84, 3.42, 0.3, 2 * hw - 0.2, 14); for (let i = -3; i <= 3; i++) cyl(g, GR, 'x', i * hw / 3.4, 0.84, 3.42, 0.315, 0.05, 14);
    ext(g, 0x3e4349, -hw, hw, 0.14, 0.3, 4.44, 4.62); // режущий брус
    const nf = Math.round(hw * 2 / 0.2);
    for (let i = 0; i < nf; i++) { const x = -hw + (i + 0.5) * (2 * hw) / nf, m = add(g, cylGeo3(), 0x8f969c); m.rotation.x = PI / 2; m.position.set(x, 0.22, 4.62 + 0.18); m.scale.set(0.15, 0.36, 0.07); }
    for (const s of [-1, 1]) {
      sideProfile(g, RED, [[3.1, 0.42], [3.1, 1.35], [3.7, 1.28], [4.3, 0.62], [4.5, 0.24], [4.0, 0.3]], 0.09, 0.0).position.x = s * (hw + 0.045);
      hull(g, RD, [[s * (hw - 0.05), 0.18, 5.15], [s * (hw + 0.1), 0.18, 5.15], [s * (hw + 0.1), 0.2, 4.4], [s * (hw - 0.05), 0.2, 4.4]], [[s * (hw - 0.05), 0.5, 4.8], [s * (hw + 0.1), 0.5, 4.8], [s * (hw + 0.1), 1.1, 4.3], [s * (hw - 0.05), 1.1, 4.3]]);
      tube(g, GR, [s * (hw + 0.12), 0.55, 3.2], [s * (hw + 0.12), 1.35, 4.05], 0.03, 6);
      tube(g, K, [s * (hw - 0.06), 0.9, 3.3], [s * (hw - 0.06), 1.5, 4.1], 0.045, 6);
    }
    reel(g, 4.05, 1.5, 0.7, hw - 0.1, 0xd1b04a, RD);
    // зерновой бак
    taper(g, RED, 0, 2.05, 3.4, -0.9, 3.0, 2.4, -0.95, 3.2, 3.0);
    hull(g, ROOF, [[-1.45, 3.4, 0.62], [1.45, 3.4, 0.62], [1.45, 3.4, -2.55], [-1.45, 3.4, -2.55]], [[-1.15, 3.62, 0.5], [1.15, 3.62, 0.5], [1.15, 3.62, -2.4], [-1.15, 3.62, -2.4]]);
    for (const s of [-1, 1]) ext(g, 0xb8d0c0, s * 1.2, s * 1.23, 2.75, 3.15, -1.2, -0.3, { transparent: false });
    for (const s of [-1, 1]) ext(g, RD, s * 1.2, s * 1.215, 2.55, 2.62, -2.3, 0.4);
    // моторный отсек
    hull(g, RED, [[-1.12, 2.05, -2.4], [1.12, 2.05, -2.4], [1.0, 2.05, -4.0], [-1.0, 2.05, -4.0]], [[-1.0, 3.3, -2.4], [1.0, 3.3, -2.4], [0.9, 3.15, -3.95], [-0.9, 3.15, -3.95]]);
    cyl(g, 0x2d3034, 'y', 0, 3.38, -3.1, 0.62, 0.14, 16); cyl(g, GR, 'y', 0, 3.47, -3.1, 0.52, 0.03, 16); for (let i = 0; i < 6; i++) beam(g, 0x55595e, [0, 3.5, -3.1], [Math.cos(i * 1.047) * 0.5, 3.5, -3.1 + Math.sin(i * 1.047) * 0.5], 0.03, 0.02);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) ext(g, 0x2a2c30, s * 1.0, s * 1.07, 2.35 + i * 0.13, 2.4 + i * 0.13, -3.8, -2.6);
    ext(g, 0x2a2c30, -0.6, 0.6, 2.3, 3.0, -4.02, -3.95); for (let i = 0; i < 6; i++) ext(g, GR, -0.55, 0.55, 2.35 + i * 0.1, 2.39 + i * 0.1, -4.04, -4.0);
    tube(g, K, [0.75, 3.1, -2.65], [0.75, 3.88, -2.65], 0.07, 8); box(g, K, 0.75, 3.92, -2.65, 0.15, 0.03, 0.15, -0.5, 0, 0);
    // разбрасыватель половы, задний бампер
    ext(g, 0x4f555b, -1.0, 1.0, 1.0, 1.5, -4.1, -3.55); ext(g, RD, -1.1, 1.1, 1.65, 1.82, -4.12, -3.9);
    for (const s of [-1, 1]) { lamp(post, s * 0.95, 2.6, -4.03, 0.2, 0.12, 0.04, 0xb83024, 0xc03020, 0.8); lamp(post, s * 0.85, 2.45, -4.03, 0.14, 0.08, 0.04, 0xd89a2a, 0xe0a030, 0.6); }
    // выгрузной шнек (в сложенном положении)
    tube(g, RED, [-1.3, 2.8, -2.2], [-1.3, 3.82, -2.2], 0.2, 12); sph(g, RED, -1.3, 3.82, -2.2, 0.22, 0.22, 0.22, 10, 8);
    tube(g, RED, [-1.3, 3.82, -2.2], [-1.3, 3.82, 0.5], 0.17, 12); cyl(g, RD, 'y', -1.3, 2.85, -2.2, 0.26, 0.2, 12);
    tube(g, 0xcfa23a, [-1.3, 3.82, 0.45], [-1.3, 3.5, 1.05], 0.19, 12, { }); sph(g, RD, -1.3, 3.82, 0.5, 0.18, 0.18, 0.18, 10, 8);
    for (let i = 0; i < 3; i++) cyl(g, RD, 'z', -1.3, 3.82, -1.8 + i * 0.9, 0.185, 0.08, 12);
    // подножка и лестница
    ext(g, 0x6c7176, -1.52, -1.0, 2.0, 2.06, 0.3, 2.3); tube(g, K, [-1.5, 2.05, 0.35], [-1.5, 2.85, 0.35], 0.025, 6); tube(g, K, [-1.5, 2.85, 0.35], [-1.5, 2.85, 2.2], 0.025, 6);
    for (const x of [-1.35, -1.12]) tube(g, 0x8b9096, [x, 0.1, -0.35], [x + 0.03, 2.05, -0.1], 0.025, 6);
    for (let i = 0; i < 6; i++) { const y = 0.3 + i * 0.33; tube(g, 0x8b9096, [-1.35 + 0.0015 * y, y, -0.35 + 0.13 * y / 2.05], [-1.12 + 0.0015 * y, y, -0.35 + 0.13 * y / 2.05], 0.02, 5); }
    // зеркала, маячок, фонари
    for (const s of [-1, 1]) { tube(g, K, [s * 0.98, 3.3, 2.3], [s * 1.35, 3.5, 2.5], 0.02, 6); box(g, K, s * 1.38, 3.5, 2.5, 0.05, 0.44, 0.22); box(g, 0xb4c4cf, s * 1.405, 3.5, 2.5, 0.012, 0.38, 0.18); }
    for (const x of [-0.5, 0.5]) { box(g, K, x, 3.78, 2.33, 0.2, 0.1, 0.08); lamp(post, x, 3.78, 2.38, 0.16, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.95); }
    if (tier >= 1) {
      for (const x of tier >= 2 ? [-0.8, -0.3, 0.3, 0.8] : [-0.55, 0.55]) { box(g, K, x, 4.03, 2.42, 0.2, 0.1, 0.08); lamp(post, x, 4.03, 2.47, 0.16, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.95); }
      cyl(g, K, 'y', 0.7, 4.06, 0.95, 0.08, 0.1, 10); lampSph(post, 0.7, 4.14, 0.95, 0.09, 0.08, 0.09, 0xd88a22, 0xe0902a, 0.9);
      for (const x of [-0.4, 0.4]) { box(g, K, x, 3.7, 0.7, 0.18, 0.1, 0.07); lamp(post, x, 3.7, 0.655, 0.14, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.9); }
    }
    for (const s of [-1, 1]) { box(g, K, s * 0.5, 2.5, 2.68, 0.3, 0.16, 0.06); lamp(post, s * 0.5, 2.5, 2.715, 0.24, 0.1, 0.03, 0xfff3c4, 0xffe9a0, 0.9); }
    if (tier >= 2) {
      sph(g, 0xe3e3df, 0.0, 4.06, 1.25, 0.18, 0.09, 0.18, 12, 6);
      for (const s of [-1, 1]) for (const [y0, y1] of [[2.18, 2.3], [2.4, 2.46]]) ext(g, P.stripe, s * 1.152, s * 1.17, y0, y1, -3.0, 2.0);
      for (const s of [-1, 1]) ext(g, P.stripe, s * 1.5, s * 1.52, 2.5, 2.64, -2.4, 0.5);
      ext(g, P.stripe, -hw, hw, 1.0, 1.1, 3.075, 3.09);
    }
    ext(g, P.stripe, -0.9, 0.9, 1.1, 1.2, 3.07, 3.1);
  }
  let _c3 = null; function cylGeo3() { return _c3 || (_c3 = new T.ConeGeometry(0.5, 1, 3, 1)); }
  const COMBINE_PAL = (t) => ({ body: [0xb04132, 0xa83a2c, 0x9a3328][t], dark: [0x7d2e24, 0x742b22, 0x6a261e][t], roof: 0xd9d4c4, trim: 0xcfa23a, stripe: 0xd8c27a });
  FM.register('vehicle', 'combine', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    buildCombine(g, post, { tier, pal: COMBINE_PAL(tier) });
    return finish(g, post, 200 + lv, SCALE[lv - 1]);
  });

  // ================================================================== ОПРЫСКИВАТЕЛЬ («waterer»)
  /** ферма штанги от точки a до b (по нижнему поясу), высота фермы h, диагонали с шагом ~step */
  function truss(g, a, b, h, step, col, tubeCol, thick) {
    const A = V3(a), B = V3(b), len = A.distanceTo(B), n = Math.max(2, Math.round(len / step)), up = [0, h, 0];
    const pt = (i, top) => [A.x + (B.x - A.x) * i / n, A.y + (B.y - A.y) * i / n + (top ? h : 0), A.z + (B.z - A.z) * i / n];
    tube(g, tubeCol, pt(0, 0), pt(n, 0), 0.035, 6); tube(g, col, pt(0, 1), pt(n, 1), 0.04, 6);
    for (let i = 0; i < n; i++) { if (i % 2) beam(g, col, pt(i, 1), pt(i + 1, 0), thick, thick); else beam(g, col, pt(i, 0), pt(i + 1, 1), thick, thick); }
    for (let i = 0; i <= n; i += 2) beam(g, col, pt(i, 0), pt(i, 1), thick, thick);
  }
  function buildSprayer(g, post, o) {
    const tier = o.tier, P = o.pal, BLUE = P.body, BD = P.dark, YEL = P.trim, ROOF = P.roof;
    const K = 0x25272a, GR = 0x737982, ST = 0x464b51, IRON = 0x4c5258, WHITE = 0xdedbd0;
    const WR = 1.05, WW = 0.42, wx = 1.25, fz = 2.15, rz = -2.0;
    for (const s of [-1, 1]) for (const z of [fz, rz]) wheel(g, s * wx, WR, z, WR, WW, s, { kind: 'lug', rr: 0.5, lugs: 12, rim: YEL, hub: ST, nuts: 8, lugC: 0x26272a, tire: 0x1f2021 });
    // стойки подвески (ноги) и мосты
    for (const s of [-1, 1]) for (const z of [fz, rz]) { box(g, YEL, s * 1.0, 1.55, z, 0.16, 1.05, 0.22); cyl(g, ST, 'x', s * 1.12, WR, z, 0.09, 0.3, 8); }
    cyl(g, ST, 'x', 0, WR, fz, 0.12, 2.2, 8); cyl(g, ST, 'x', 0, WR, rz, 0.12, 2.2, 8);
    // рама
    for (const s of [-1, 1]) ext(g, YEL, s * 0.62 - 0.1, s * 0.62 + 0.1, 1.3, 1.62, -3.4, 3.2);
    ext(g, ST, -0.62, 0.62, 1.3, 1.45, -3.4, 3.2);
    for (const z of [-3.2, -1.6, 0.0, 1.6, 3.0]) ext(g, YEL, -0.72, 0.72, 1.55, 1.68, z - 0.07, z + 0.07);
    // кабина (спереди), капот двигателя
    ext(g, BLUE, -0.86, 0.86, 1.62, 2.28, 1.85, 3.25); ext(g, BD, -0.88, 0.88, 1.62, 1.75, 1.85, 3.27);
    ext(g, K, -0.5, 0.5, 1.82, 2.1, 3.25, 3.29); for (let i = 0; i < 6; i++) ext(g, GR, -0.46 + i * 0.18, -0.42 + i * 0.18, 1.84, 2.08, 3.285, 3.3);
    cabin(g, post, { color: BLUE, roof: ROOF, xb: 0.8, xt: 0.76, yb: 2.28, yt: 3.5, zfb: 3.2, zft: 3.0, zbt: 1.95, zbb: 1.95, p: 0.09, mid: [0.5], over: 0.08 });
    box(g, K, 0, 2.58, 2.35, 0.5, 0.3, 0.5); box(g, K, 0, 2.95, 2.1, 0.5, 0.62, 0.1, -0.15, 0, 0);
    ext(g, K, -0.55, 0.55, 2.28, 2.7, 2.85, 3.05); tube(g, K, [0, 2.7, 2.95], [0, 3.05, 2.75], 0.025, 6); { const sw = cyl(g, K, 'y', 0, 3.08, 2.7, 0.17, 0.035, 12); sw.rotation.x = -0.95; }
    ext(g, ROOF, -0.35, 0.35, 3.52, 3.6, 2.2, 2.7);
    ext(g, IRON, -0.7, 0.7, 1.68, 2.45, 0.7, 1.85); // капот двигателя
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) ext(g, K, s * 0.7, s * 0.74, 1.85 + i * 0.1, 1.9 + i * 0.1, 0.9, 1.65);
    // бак
    const tank = add(g, latheGeo(capsuleProf(0.95, 3.0, 0.42, 5), 22, 'z'), BLUE); tank.position.set(0, 2.68, -1.45);
    for (const z of [-0.4, -1.45, -2.5]) cyl(g, BD, 'z', 0, 2.68, z, 0.965, 0.11, 22);
    for (const z of [-0.4, -2.5]) ext(g, ST, -0.9, 0.9, 1.65, 1.78, z - 0.2, z + 0.2);
    cyl(g, BD, 'y', 0, 3.66, -0.9, 0.3, 0.16, 12); cyl(g, K, 'y', 0, 3.76, -0.9, 0.22, 0.05, 12); cyl(g, BD, 'y', 0, 3.7, -2.2, 0.12, 0.1, 8);
    ext(g, ST, -0.45, 0.45, 3.58, 3.6, -2.7, 0.2); // мостик на баке
    for (const s of [-1, 1]) { tube(g, 0xcfd8dc, [s * 1.08, 2.0, -0.35], [s * 1.08, 3.3, -0.35], 0.03, 6); for (const y of [2.0, 3.3]) ext(g, ST, s * 0.95, s * 1.1, y - 0.03, y + 0.03, -0.38, -0.32); }
    // боковые баки и платформа
    cyl(g, 0x555b61, 'z', -0.98, 1.38, 0.1, 0.33, 1.3, 14); cyl(g, tier >= 1 ? 0x4a7ab0 : BLUE, 'z', 0.98, 1.4, 0.1, 0.36, 1.35, 14);
    for (const z of [-0.35, 0.55]) { ext(g, ST, -1.0, -0.6, 1.1, 1.15, z - 0.04, z + 0.04); ext(g, ST, 0.6, 1.0, 1.1, 1.15, z - 0.04, z + 0.04); }
    ext(g, 0x7d8388, -1.4, -0.7, 1.74, 1.8, -0.6, 1.7); tube(g, K, [-1.38, 1.8, 1.7], [-1.38, 2.5, 1.7], 0.025, 6); tube(g, K, [-1.38, 2.5, 1.7], [-1.38, 2.5, -0.5], 0.025, 6); tube(g, K, [-1.38, 2.5, -0.5], [-1.38, 1.8, -0.5], 0.025, 6);
    for (const x of [-1.38, -1.1]) tube(g, 0x8b9096, [x, 0.05, 0.6], [x, 1.78, 0.55], 0.025, 6);
    for (let i = 0; i < 5; i++) { const y = 0.3 + i * 0.36; tube(g, 0x8b9096, [-1.38, y, 0.6 - 0.0], [-1.1, y, 0.6], 0.02, 5); }
    // трубопроводы/шланги в задней части
    for (const s of [-1, 1]) { tube(g, K, [s * 0.25, 1.75, -3.0], [s * 0.35, 1.6, -3.85], 0.045, 6); tube(g, GR, [s * 0.5, 1.8, -2.4], [s * 0.45, 1.55, -3.6], 0.03, 6); }
    // зеркала, свет
    for (const s of [-1, 1]) { tube(g, K, [s * 0.82, 3.0, 3.0], [s * 1.35, 3.2, 3.15], 0.02, 6); box(g, K, s * 1.38, 3.2, 3.15, 0.05, 0.5, 0.24); box(g, 0xb4c4cf, s * 1.405, 3.2, 3.15, 0.012, 0.44, 0.2); box(g, K, s * 0.7, 1.95, 3.29, 0.3, 0.16, 0.05); lamp(post, s * 0.7, 1.95, 3.32, 0.24, 0.1, 0.03, 0xfff3c4, 0xffe9a0, 0.9); }
    if (tier >= 1) {
      for (const x of tier >= 2 ? [-0.6, -0.2, 0.2, 0.6] : [-0.4, 0.4]) { box(g, K, x, 3.57, 3.02, 0.2, 0.1, 0.08); lamp(post, x, 3.575, 3.07, 0.16, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.95); }
      cyl(g, K, 'y', -0.5, 3.64, 2.0, 0.08, 0.1, 10); lampSph(post, -0.5, 3.72, 2.0, 0.09, 0.08, 0.09, 0xd88a22, 0xe0902a, 0.9);
      for (const s of [-1, 1]) arcStrip(g, YEL, s * (wx - WW / 2 - 0.05), s * (wx + WW / 2 + 0.06) , WR, fz, WR + 0.08, 0.04, 0.6, 2.7);
    }
    if (tier >= 2) { for (const s of [-1, 1]) { ext(g, P.stripe, s * 0.955, s * 0.97, 2.55, 2.68, -3.0, 0.3); } sph(g, 0xe3e3df, 0, 3.64, 2.5, 0.17, 0.09, 0.17, 12, 6); }
    ext(g, K, -0.35, 0.35, 0.05, 0.05, 0, 0); // placeholder (no-op)
    for (const s of [-1, 1]) lamp(post, s * 0.6, 1.7, -3.45, 0.14, 0.1, 0.04, 0xb83024, 0xc03020, 0.8);
    // рама штанги и сами штанги (разложены на ширину ~16 м)
    const bz = -3.9, half = 8.0 + (tier >= 2 ? 0.0 : 0), by = 1.15;
    ext(g, YEL, -1.0, 1.0, 1.25, 1.5, -3.55, -3.4);
    for (const s of [-1, 1]) { box(g, YEL, s * 0.9, 1.65, -3.8, 0.12, 1.0, 0.12); tube(g, GR, [s * 0.9, 1.1, -3.6], [s * 0.9, 1.8, -3.5], 0.04, 6); tube(g, K, [s * 0.5, 1.3, -3.55], [s * 0.9, 1.2, -3.85], 0.035, 6); }
    ext(g, YEL, -1.0, 1.0, 1.1, 1.22, bz - 0.06, bz + 0.06); ext(g, YEL, -1.0, 1.0, 1.7, 1.78, bz - 0.06, bz + 0.06);
    for (const s of [-1, 1]) {
      const xi = s * 1.0, xm = s * (half - 1.5), xo = s * half;
      truss(g, [xi, by, bz], [xm, by, bz], 0.6, 0.62, YEL, GR, 0.035);
      truss(g, [xm, by, bz], [s * (half - 0.2), by + 0.9, bz], 0.45, 0.5, YEL, GR, 0.03); // загнутый вверх конец
      tube(g, GR, [s * 3.2, by + 0.6, bz], [s * 1.1, 2.15, -3.75], 0.02, 5); tube(g, GR, [s * 6.4, by + 0.6, bz], [s * 1.1, 2.15, -3.75], 0.018, 5);
      box(g, K, xm, by + 0.3, bz, 0.12, 0.8, 0.18); cyl(g, ST, 'z', xm, by + 0.65, bz + 0.12, 0.05, 0.3, 6);
      // форсунки по нижнему поясу
      const nn = 14;
      for (let i = 0; i < nn; i++) { const x = s * (1.4 + i * (half - 3.4) / nn); const m = cyl(g, K, 'y', x, by - 0.1, bz + 0.1, 0.022, 0.2, 5); cyl(g, i % 2 ? 0xd9b238 : 0xd9d6c8, 'y', x, by - 0.23, bz + 0.1, 0.035, 0.06, 6, 1.3); }
      for (let i = 0; i < 3; i++) { const t = (i + 0.5) / 3, x = xm + (s * (half - 0.2) - xm) * t, y = by + 0.9 * t; cyl(g, K, 'y', x, y - 0.1, bz + 0.1, 0.022, 0.2, 5); cyl(g, i % 2 ? 0xd9b238 : 0xd9d6c8, 'y', x, y - 0.23, bz + 0.1, 0.035, 0.06, 6, 1.3); }
      tube(g, 0xb8bdc2, [xi, by - 0.03, bz + 0.1], [xm, by - 0.03, bz + 0.1], 0.02, 5);
      tube(g, 0xb8bdc2, [xm, by - 0.03, bz + 0.1], [s * (half - 0.2), by + 0.87, bz + 0.1], 0.02, 5);
      box(g, 0xc5642a, s * (half - 0.15), by + 0.95, bz, 0.06, 0.35, 0.12);
    }
  }
  const SPRAYER_PAL = (t) => ({ body: [0x4377a8, 0x3b6ea0, 0x30608f][t], dark: [0x2f567f, 0x2a4f78, 0x22446b][t], trim: [0xcfa535, 0xd2a834, 0xd8ae32][t], roof: 0xdedbd0, stripe: 0xe8e2cf });
  FM.register('vehicle', 'waterer', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    buildSprayer(g, post, { tier, pal: SPRAYER_PAL(tier) });
    return finish(g, post, 300 + lv, SCALE[lv - 1]);
  });

  // ================================================================== РАЗБРАСЫВАТЕЛЬ (трактор + прицеп с дисками)
  function buildSpreaderTrailer(g, post, tier, P) {
    const BR = P.trailer, DK = 0x4a3626, IR = 0x474b50, GR = 0x777c82, K = 0x25272a;
    const z0 = -2.35, z1 = 1.25, yb = 1.0, yt = 2.2 + tier * 0.12, wb = 0.55, wt = 1.12 + tier * 0.04, rng = lcg(77);
    const WR = 0.74, WW = 0.52, wx = 1.18;
    // рама, дышло, ось
    for (const s of [-1, 1]) { ext(g, IR, s * 0.45 - 0.07, s * 0.45 + 0.07, 0.76, 1.02, -2.65, 1.9); beam(g, IR, [s * 0.45, 0.86, 1.8], [s * 0.04, 0.86, 3.0], 0.13, 0.14); }
    for (const z of [-2.2, -1.2, 0.5, 1.4]) ext(g, IR, -0.55, 0.55, 0.8, 0.96, z - 0.05, z + 0.05);
    cyl(g, K, 'y', 0, 0.86, 3.0, 0.15, 0.14, 12); cyl(g, GR, 'y', 0, 0.86, 3.0, 0.08, 0.16, 8);
    tube(g, GR, [0, 0.9, 2.45], [0, 0.1, 2.45], 0.04, 6); ext(g, K, -0.17, 0.17, 0.0, 0.06, 2.3, 2.6);
    const axles = tier >= 2 ? [-0.1, -1.2] : [-0.6];
    for (const az of axles) {
      cyl(g, IR, 'x', 0, WR, az, 0.1, 2 * wx, 8);
      for (const s of [-1, 1]) {
        wheel(g, s * wx, WR, az, WR, WW, s, { kind: 'plain', rr: 0.5, rim: P.rim, hub: IR, nuts: 0, tire: 0x1f2021 });
        if (az === axles[0]) arcStrip(g, BR, s * (wx - WW / 2 - 0.04) - 0.0, s * (wx + WW / 2 + 0.05), WR, az - (axles.length > 1 ? 0.55 : 0), WR + 0.09 + (axles.length > 1 ? 0.0 : 0), 0.04, 0.35, 2.8);
      }
    }
    // бункер: трапеция в сечении, рёбра, борт
    hull(g, BR, [[-wb, yb, z1], [wb, yb, z1], [wb, yb, z0], [-wb, yb, z0]], [[-wt, yt, z1], [wt, yt, z1], [wt, yt, z0], [-wt, yt, z0]]);
    const al = Math.atan((wt - wb) / (yt - yb)), hyp = Math.hypot(wt - wb, yt - yb);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 8; i++) { const z = z0 + 0.22 + i * (z1 - z0 - 0.44) / 7; box(g, DK, s * ((wb + wt) / 2 + 0.03), (yb + yt) / 2, z, 0.06, hyp, 0.12, 0, 0, -s * al); }
      ext(g, DK, s * wt - (s > 0 ? 0.04 : -0.14), s * wt + (s > 0 ? 0.14 : -0.04), yt - 0.08, yt + 0.07, z0 - 0.08, z1 + 0.08);
      if (tier >= 2) { const xs = (y) => wb + (y - yb) / (yt - yb) * (wt - wb); for (const [y0, y1] of [[1.5, 1.62], [1.7, 1.76]]) hull(g, P.stripe, [[s * xs(y0), y0, z1], [s * xs(y1), y1, z1], [s * xs(y1), y1, z0], [s * xs(y0), y0, z0]], [[s * (xs(y0) + 0.05), y0, z1], [s * (xs(y1) + 0.05), y1, z1], [s * (xs(y1) + 0.05), y1, z0], [s * (xs(y0) + 0.05), y0, z0]]); }
    }
    ext(g, DK, -wt - 0.04, wt + 0.04, yt - 0.08, yt + 0.07, z0 - 0.08, z0 + 0.04); ext(g, DK, -wt - 0.04, wt + 0.04, yt - 0.08, yt + 0.07, z1 - 0.04, z1 + 0.08);
    if (tier >= 1) ext(g, BR, -wt, wt, yt, yt + 0.5, z1 - 0.06, z1 + 0.02);
    // груз: навал навоза/удобрения
    const heap = [0x4a3626, 0x57402c, 0x3f2e20, 0x634a33];
    for (let i = 0; i < 9; i++) {
      const x = (rng() - 0.5) * 1.5, z = z0 + 0.5 + rng() * (z1 - z0 - 1.0), r = 0.4 + rng() * 0.3;
      sph(g, heap[i % 4], x, yt + 0.02 + rng() * 0.08, z, r + 0.2, 0.3 + rng() * 0.12, r + 0.1, 7, 5);
    }
    // выгрузка: центральный шнек/гребёнка, диски, кожух
    ext(g, DK, -0.8, 0.8, 1.0, 1.45, z0 - 0.4, z0 + 0.04);
    ext(g, IR, -0.6, 0.6, 0.85, 1.0, -2.7, -2.5);
    for (const s of [-1, 1]) {
      const cx = s * 0.56, cz = -2.78;
      cyl(g, K, 'y', cx, 0.98, cz, 0.05, 0.2, 6); cyl(g, 0x6b7076, 'y', cx, 1.1, cz, 0.5, 0.05, 16); cyl(g, IR, 'y', cx, 1.14, cz, 0.12, 0.05, 10);
      for (let i = 0; i < 4; i++) { const a = i * PI / 2 + (s > 0 ? 0.5 : 0.1); beam(g, 0xa4a8ac, [cx + Math.cos(a) * 0.1, 1.17, cz + Math.sin(a) * 0.1], [cx + Math.cos(a) * 0.5, 1.2, cz + Math.sin(a) * 0.5], 0.06, 0.07); }
    }
    ext(g, BR, -0.95, 0.95, 1.3, 1.9, -3.28, -3.2); for (const s of [-1, 1]) { box(g, BR, s * 1.0, 1.55, -3.08, 0.08, 0.7, 0.45, 0, s * 0.5, 0); lamp(post, s * 0.85, 1.55, -3.3, 0.14, 0.1, 0.04, 0xb83024, 0xc03020, 0.8); lamp(post, s * 0.85, 1.38, -3.3, 0.14, 0.07, 0.04, 0xd89a2a, 0xe0a030, 0.5); }
    // карданный вал к тракторному ВОМ
    tube(g, K, [0, 0.9, 1.9], [0, 0.82, 3.05], 0.035, 6); cyl(g, GR, 'z', 0, 0.9, 1.95, 0.06, 0.12, 8); cyl(g, GR, 'z', 0, 0.83, 2.9, 0.06, 0.12, 8);
    ext(g, IR, -0.2, 0.2, 0.9, 1.15, 1.7, 2.1);
    // шланги гидравлики
    tube(g, K, [0.2, 0.9, 2.6], [0.28, 0.75, 3.1], 0.025, 5);
  }
  const SPREADER_PAL = (t) => Object.assign(TRACTOR_PAL.spreader(t), { trailer: [0x7d5a38, 0x76532f, 0x6b4a2b][t] });
  FM.register('vehicle', 'spreader', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    const P = SPREADER_PAL(tier), tz = 5.3;
    buildSpreaderTrailer(g, post, tier, P);
    const tg = new T.Group(), tp = new T.Group(); tg.position.z = tz; tp.position.z = tz; g.add(tg); post.add(tp);
    buildTractor(tg, tp, { tier, pal: P, dual: tier >= 2 });
    g.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(g); const zc = (bb.min.z + bb.max.z) / 2; g.position.z = -zc; post.position.z = -zc;
    return finish(g, post, 400 + lv, SCALE[lv - 1]);
  });

  /* @@MORE@@ */
})();
