/* Модели техники и транспорта (процедурные, three.js r128): vehicle / truck / trailer / car.
   Перед у всех моделей смотрит в +Z, начало координат — центр опоры на земле, 1 единица ~ 1 м. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, G = C.G, mat = C.mat, texMat = C.texMat;
  const PI = Math.PI;
  const _cache = {};
  /** Регистрация с кэшем: модель строится один раз на набор opts, дальше отдаётся клон (геометрия и материалы общие). */
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = opts || {};
      const key = [kind, name, opts.level | 0, opts.variant | 0, opts.seed | 0, opts.stage | 0, opts.length | 0, opts.load, opts.empty ? 1 : 0].join('|');
      if (!_cache[key]) _cache[key] = fn(opts);
      return _cache[key].clone(true);
    });
  }
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
    { const b0 = new T.Box3().setFromObject(g), zc = (b0.min.z + b0.max.z) / 2; if (isFinite(zc) && Math.abs(zc) > 1e-4) { g.position.z -= zc; if (post) post.position.z -= zc; g.updateMatrixWorld(true); } } // центр опоры по длине — в начале координат
    const out = new T.Group(); out.add(bakeDet(g, seed)); if (post && post.children.length) out.add(mergeByMat(post));
    if (scale && scale !== 1) out.scale.setScalar(scale);
    // поставить на землю: опустить/поднять так, чтобы нижняя точка была на y=0
    out.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(out), sc = scale || 1; if (isFinite(bb.min.y) && Math.abs(bb.min.y) > 0.001) { out.children.forEach((c) => { c.position.y -= bb.min.y / sc; }); }
    return out;
  }

  // ------------------------------------------------------------------ колёса
  /** Шина: сетка (кольца × профиль) с протектором ёлочкой, вытянутым прямо из вершин: kind 'lug' — зацепы, иначе гладкая. Ось Y. */
  function tyreGeo(R, W, rr, N, kind, depth) {
    const h2 = W / 2, sh = Math.min(W * 0.28, R * 0.15), P = [[rr * 0.97, -h2 * 0.97, -1], [R - sh, -h2, -1], [R, -h2 + sh * 1.1, 0]];
    if (kind === 'lug') P.push([R, 0, 1]);
    P.push([R, h2 - sh * 1.1, 2], [R - sh, h2, -1], [rr * 0.97, h2 * 0.97, -1]);
    const M = P.length, pos = [], tpos = [], vtx = (i, j) => {
      const q = P[j], th = (i % N) / N * PI * 2; let r = q[0];
      if (kind === 'lug' && q[2] >= 0) { const ph = q[2] === 1 ? 1 : 0; if ((i + ph) % 2 === 1) r -= depth; }
      return [r * Math.cos(th), q[1], r * Math.sin(th)];
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < M - 1; j++) {
      const A = vtx(i, j), B = vtx(i + 1, j), C = vtx(i + 1, j + 1), D = vtx(i, j + 1), dst = (P[j][2] >= 0 && P[j + 1][2] >= 0) ? tpos : pos;
      dst.push(...A, ...C, ...B, ...A, ...D, ...C);
    }
    const mk = (a) => { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(a, 3)); geo.computeVertexNormals(); return geo; };
    return { side: mk(pos), tread: mk(tpos) };
  }
  const tyreCache = {};
  /** Колесо: шина + диск + ступица. Ось вращения — X; side=+1: наружу смотрит +X, -1: -X. */
  function wheel(g, x, y, z, R, W, side, o) {
    o = o || {};
    const kind = o.kind || 'plain', rr = (o.rr || 0.5) * R, tire = o.tire || 0x1d1e20, rim = o.rim || 0x8a8f94, hub = o.hub || 0x4d5258;
    const N = kind === 'lug' ? (o.lugs || 12) * 2 : (o.seg || (R > 0.7 ? 18 : 14)), h2 = W / 2;
    const key = [R, W, rr, N, kind].join('|'); const geo = tyreCache[key] || (tyreCache[key] = tyreGeo(R, W, rr, N, kind, Math.max(0.035, R * 0.085)));
    const tg = new T.Group(); add(tg, geo.side, tire); add(tg, geo.tread, o.lugC || (kind === 'lug' ? 0x3b372f : 0x2a2b2e));
    const rs = Math.min(N, 10);
    cyl(tg, rim, 'y', 0, 0, 0, rr, W * 0.7, rs);
    if (!o.noHub) {
      cyl(tg, rim, 'y', 0, h2 * 0.5 + 0.02, 0, rr * 0.9, 0.05, rs);
      const hl = Math.max(0.1, W * 0.26);
      cyl(tg, hub, 'y', 0, h2 * 0.55 + 0.03, 0, rr * 0.34, hl, 8);
      if (R > 0.45) cyl(tg, o.cap || hub, 'y', 0, h2 * 0.55 + 0.03 + hl / 2, 0, rr * 0.2, 0.05, 6);
      const nn = R > 0.9 ? Math.min(6, o.nuts || 0) : 0; for (let i = 0; i < nn; i++) { const a = i / nn * PI * 2; box(tg, 0x2a2c2f, Math.cos(a) * rr * 0.6, h2 * 0.5 + 0.06, Math.sin(a) * rr * 0.6, 0.05, 0.045, 0.05); }
      if (kind === 'car') for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; const sp = box(tg, rim, 0, h2 * 0.5 + 0.035, 0, rr * 0.2, 0.025, rr * 0.9); sp.rotation.set(0, -a + PI / 2, 0); sp.position.set(Math.cos(a) * rr * 0.52, h2 * 0.5 + 0.035, Math.sin(a) * rr * 0.52); }
    } else cyl(tg, hub, 'y', 0, -h2 * 0.4, 0, rr * 0.4, 0.04, 8);
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
  const SCALE = [1, 1, 1.02, 1.06, 1.1, 1.14, 1.18, 1.22, 1.26, 1.3];
  const tierOf = (lv) => (lv <= 3 ? 0 : lv <= 6 ? 1 : 2);
  const subOf = (lv) => (lv <= 3 ? lv - 1 : lv <= 6 ? lv - 4 : lv - 7);
  const TRACTOR_PAL = {
    tractor: (t) => ({ body: [0x4f8442, 0x3f7a42, 0x2f6a3d][t], dark: [0x35602f, 0x2c5a33, 0x22492b][t], trim: 0xd4ab38, rim: [0xc9a43f, 0xd0a73a, 0xd6ae38][t], roof: 0xb9b5a6, stripe: 0xd4ab38 }),
    spreader: (t) => ({ body: [0xc06a2e, 0xb8622a, 0xa95a28][t], dark: 0x6b4a2f, trim: 0x7a5535, rim: 0xd9d0b8, roof: 0xc2b9a5, stripe: 0x6b4a2f }),
  };
  /** Трактор (перёд +Z, начало у середины колёсной базы). o: {tier, pal, dual, weights, drawbarOnly} */
  function buildTractor(g, post, o) {
    const tier = o.tier, sub = o.sub || 0, P = o.pal, dual = tier >= 2 && o.dual !== false;
    const BODY = P.body, DARK = P.dark, TRIM = P.trim, RIM = P.rim, ROOF = P.roof;
    const K = 0x25272a, GR = 0x707680, ST = 0x464b51, IRON = 0x4c5258;
    const RR = 0.98, RW = dual ? 0.4 : 0.5, FRr = 0.58, FW = 0.32, rz = -1.15, fz = 1.55, rx = dual ? 1.04 : 1.07, fx = 0.97;
    for (const s of [-1, 1]) {
      wheel(g, s * rx, RR, rz, RR, RW, s, { kind: 'lug', rr: 0.47, lugs: dual ? 9 : 11, rim: RIM, hub: ST, nuts: dual ? 0 : 8, noHub: dual });
      if (dual) {
        wheel(g, s * (rx + RW + 0.03), RR, rz, RR, RW, s, { kind: 'lug', rr: 0.47, lugs: 9, rim: RIM, hub: ST, nuts: 6 });
        cyl(g, RIM, 'x', s * (rx + RW / 2 + 0.015), RR, rz, RR * 0.34, 0.1, 12);
      }
      wheel(g, s * fx, FRr, fz, FRr, FW, s, { kind: 'lug', rr: 0.5, lugs: 9, rim: RIM, hub: ST });
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
    hull(g, BODY, [[-0.46, 0.98, 2.3], [0.46, 0.98, 2.3], [0.568, 0.98, 0.12], [-0.568, 0.98, 0.12]], [[-0.34, 1.62, 2.26], [0.34, 1.62, 2.26], [0.4, 1.85, 0.16], [-0.4, 1.85, 0.16]]);
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
    // детали капота: боковые швы, жалюзи, шильдик
    for (const s of [-1, 1]) {
      const xr = (y) => 0.568 - (y - 0.98) / 0.87 * 0.168, xf = (y) => 0.46 - (y - 0.98) / 0.64 * 0.12, e = 0.012;
      hull(g, DARK, [[s * xf(1.5), 1.5, 2.27], [s * xf(1.53), 1.53, 2.27], [s * xr(1.53), 1.53, 0.2], [s * xr(1.5), 1.5, 0.2]], [[s * (xf(1.5) + e), 1.5, 2.27], [s * (xf(1.53) + e), 1.53, 2.27], [s * (xr(1.53) + e), 1.53, 0.2], [s * (xr(1.5) + e), 1.5, 0.2]]);
      for (let i = 0; i < 4; i++) { const y0 = 1.12 + i * 0.07, y1 = y0 + 0.035; hull(g, K, [[s * xr(y0), y0, 0.55], [s * xr(y1), y1, 0.55], [s * xr(y1), y1, 1.05], [s * xr(y0), y0, 1.05]], [[s * (xr(y0) + e), y0, 0.55], [s * (xr(y1) + e), y1, 0.55], [s * (xr(y1) + e), y1, 1.05], [s * (xr(y0) + e), y0, 1.05]]); }
    }
    if (tier === 1 && sub >= 1) { const hs = P.stripe; for (const s of [-1, 1]) { const xr = (y) => 0.568 - (y - 0.98) / 0.87 * 0.168, xf = (y) => 0.46 - (y - 0.98) / 0.64 * 0.12, e = 0.012, y0 = 1.28, y1 = 1.33;
      hull(g, hs, [[s * xf(y0), y0, 2.27], [s * xf(y1), y1, 2.27], [s * xr(y1), y1, 1.2], [s * xr(y0), y0, 1.2]], [[s * (xf(y0) + e), y0, 2.27], [s * (xf(y1) + e), y1, 2.27], [s * (xr(y1) + e), y1, 1.2], [s * (xr(y0) + e), y0, 1.2]]); } }
    ext(g, TRIM, -0.1, 0.1, 1.575, 1.6, 2.32, 2.335); ext(g, K, -0.03, 0.03, 1.57, 1.6, 2.335, 2.345);
    // передние грузы
    ext(g, IRON, -0.4, 0.4, 0.52, 0.76, 2.27, 2.52);
    const nw = tier === 0 ? 2 + sub : tier === 1 ? 4 + sub : 5 + sub;
    for (let i = 0; i < nw; i++) { ext(g, 0x5a616b, -0.34, 0.34, 0.5, 1.1, 2.52 + i * 0.1, 2.6 + i * 0.1); ext(g, 0x3c4147, -0.1, 0.1, 1.1, 1.14, 2.52 + i * 0.1, 2.6 + i * 0.1); }
    ext(g, K, -0.07, 0.07, 0.78, 1.0, 2.52, 2.52 + nw * 0.1);
    // кабина
    ext(g, DARK, -0.78, 0.78, 1.04, 1.16, -1.92, 0.16);
    ext(g, BODY, -0.76, 0.76, 1.16, 1.5, -1.8, 0.1);
    for (const s of [-1, 1]) ext(g, DARK, s * 0.755, s * 0.775, 1.2, 1.44, -1.15, -0.45);
    for (const s of [-1, 1]) { ext(g, DARK, s * 0.758, s * 0.768, 1.17, 1.5, -0.78, -0.76); ext(g, DARK, s * 0.758, s * 0.768, 1.17, 1.5, -1.62, -1.6); box(g, GR, s * 0.77, 1.42, -0.9, 0.03, 0.035, 0.14); }
    tube(g, K, [0.25, 1.62, 0.05], [-0.25, 2.2, 0.05], 0.012, 4); tube(g, K, [0.1, 1.55, 0.06], [0.1, 1.95, 0.06], 0.01, 4);
    ext(g, DARK, -0.45, 0.45, 1.5, 1.52, -1.8, -1.78);
    lamp(post, -0.5, 1.1, -2.0, 0.16, 0.08, 0.03, 0xe8e6de); lamp(post, 0.5, 1.1, -2.0, 0.16, 0.08, 0.03, 0xe8e6de, 0xe8e6de, 0.2);
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
      const xs = (tier >= 2 || sub >= 2) ? [-0.62, -0.22, 0.22, 0.62] : [-0.45, 0.45];
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
    if (tier >= 2 && sub >= 2) { tube(g, K, [-0.46, 1.74, 0.5], [-0.46, 2.95, 0.5], 0.04, 8); }
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
    if (tier >= 2 && sub >= 1 && !o.noBallast) { // навесной задний груз
      ext(g, 0x59606a, -0.55, 0.55, 0.62, 1.35, -3.0, -2.6); ext(g, 0x3c4147, -0.2, 0.2, 1.35, 1.42, -2.95, -2.65); for (const s of [-1, 1]) ext(g, 0x3c4147, s * 0.55 - 0.02, s * 0.55 + 0.02, 0.62, 1.35, -3.02, -2.58);
      for (let i = 0; i < 3; i++) ext(g, 0x4c5258, -0.5, 0.5, 0.7 + i * 0.22, 0.72 + i * 0.22, -3.02, -2.98);
    }
    if (tier >= 2 && sub >= 3) { ext(g, K, -1.0, -0.8, 1.2, 1.5, -1.6, -0.9); ext(g, GR, -1.0, -0.8, 1.5, 1.52, -1.6, -0.9); cyl(g, K, 'y', 0.5, 3.1, -1.4, 0.08, 0.1, 10); lampSph(post, 0.5, 3.17, -1.4, 0.09, 0.08, 0.09, 0xd88a22, 0xe0902a, 0.9); }
    return { rearZ: o.noBallast || sub < 1 || tier < 2 ? -2.45 : -3.02, frontZ: 2.52 + nw * 0.1 };
  }
  reg('vehicle', 'tractor', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    buildTractor(g, post, { tier, sub: subOf(lv), pal: TRACTOR_PAL.tractor(tier) });
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
    const tier = o.tier, sub = o.sub || 0, P = o.pal, RED = P.body, RD = P.dark, ROOF = P.roof, YEL = P.trim;
    const K = 0x25272a, GR = 0x717780, ST = 0x464b51, IRON = 0x4c5258, hw = [1.95, 2.1, 2.35][tier] + 0.06 * sub, tracks = tier >= 2;
    // ходовая: ведущие колёса (или гусеницы) спереди, управляемые сзади
    for (const s of [-1, 1]) {
      if (tracks) crawler(g, s * 1.2, 1.55, 2.9, 1.3, 0.85, 0x2d2e30, 0x565c62);
      else wheel(g, s * 1.55, 0.95, 1.55, 0.95, 0.72, s, { kind: 'lug', rr: 0.5, lugs: 12, rim: YEL, hub: ST, nuts: 8 });
      wheel(g, s * 1.3, 0.62, -3.45, 0.62, 0.42, s, { kind: 'lug', rr: 0.5, lugs: 10, rim: YEL, hub: ST });
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
    ext(g, K, -0.7, 0.7, 2.62, 3.0, 0.9, 1.15); ext(g, RD, -0.7, 0.7, 2.62, 2.76, 2.42, 2.58);
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
    for (const x of [-0.7, 0, 0.7]) ext(g, 0xaaa699, x - 0.03, x + 0.03, 3.6, 3.67, -2.3, 0.42);
    for (const z of [-2.1, -1.3, -0.5, 0.2]) ext(g, 0xaaa699, -1.12, 1.12, 3.6, 3.65, z - 0.03, z + 0.03);
    ext(g, 0xd3d0c4, -0.35, 0.35, 3.62, 3.7, -1.9, -1.4); ext(g, 0x8f8b80, -0.3, 0.3, 3.7, 3.72, -1.85, -1.45);
    for (const s of [-1, 1]) { const xs = (y) => 1.2 + (y - 2.05) / 1.35 * 0.3; const e = 0.02; hull(g, 0x9fb7a8, [[s * xs(2.7), 2.7, -0.2], [s * xs(3.2), 3.2, -0.2], [s * xs(3.2), 3.2, -1.3], [s * xs(2.7), 2.7, -1.3]], [[s * (xs(2.7) + e), 2.7, -0.2], [s * (xs(3.2) + e), 3.2, -0.2], [s * (xs(3.2) + e), 3.2, -1.3], [s * (xs(2.7) + e), 2.7, -1.3]]);
      for (let i = 0; i < 4; i++) { const z = -0.45 - i * 0.28; ext(g, 0xc9d9cf, s * (xs(2.95) + 0.01), s * (xs(2.95) + 0.03), 2.78, 3.12, z - 0.03, z); } }
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
      for (const x of (tier >= 2 || sub >= 2) ? [-0.8, -0.3, 0.3, 0.8] : [-0.55, 0.55]) { box(g, K, x, 4.03, 2.42, 0.2, 0.1, 0.08); lamp(post, x, 4.03, 2.47, 0.16, 0.07, 0.03, 0xfff3d0, 0xffe9b0, 0.95); }
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
  const COMBINE_PAL = (t) => ({ body: [0xb04132, 0xa83a2c, 0x9a3328][t], dark: [0x7d2e24, 0x742b22, 0x6a261e][t], roof: 0xb2aea0, trim: 0xcfa23a, stripe: 0xd8c27a });
  reg('vehicle', 'combine', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    buildCombine(g, post, { tier, sub: subOf(lv), pal: COMBINE_PAL(tier) });
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
    const tier = o.tier, sub = o.sub || 0, P = o.pal, BLUE = P.body, BD = P.dark, YEL = P.trim, ROOF = P.roof;
    const K = 0x25272a, GR = 0x737982, ST = 0x464b51, IRON = 0x4c5258, WHITE = 0xdedbd0;
    const WR = 1.05, WW = 0.36, wx = 1.25, fz = 2.15, rz = -2.0;
    for (const s of [-1, 1]) for (const z of [fz, rz]) wheel(g, s * wx, WR, z, WR, WW, s, { kind: 'lug', rr: 0.5, lugs: 12, rim: YEL, hub: ST, nuts: 8, tire: 0x1f2021 });
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
    for (const s of [-1, 1]) lamp(post, s * 0.6, 1.7, -3.45, 0.14, 0.1, 0.04, 0xb83024, 0xc03020, 0.8);
    // рама штанги и сами штанги (разложены на ширину ~16 м)
    const bz = -3.9, half = [8.0, 8.3, 8.6][tier], by = 1.15;
    ext(g, YEL, -1.0, 1.0, 1.25, 1.5, -3.55, -3.4);
    for (const s of [-1, 1]) { box(g, YEL, s * 0.9, 1.65, -3.8, 0.12, 1.0, 0.12); tube(g, GR, [s * 0.9, 1.1, -3.6], [s * 0.9, 1.8, -3.5], 0.04, 6); tube(g, K, [s * 0.5, 1.3, -3.55], [s * 0.9, 1.2, -3.85], 0.035, 6); }
    ext(g, YEL, -1.0, 1.0, 1.1, 1.22, bz - 0.06, bz + 0.06); ext(g, YEL, -1.0, 1.0, 1.7, 1.78, bz - 0.06, bz + 0.06);
    for (const s of [-1, 1]) {
      const xi = s * 1.0, xm = s * (half - 1.5), xo = s * half;
      truss(g, [xi, by, bz], [xm, by, bz], 0.6, 0.62, YEL, GR, 0.035);
      truss(g, [xm, by, bz], [s * (half - 0.2), by + 0.9, bz], 0.45, 0.5, YEL, GR, 0.03); // загнутый вверх конец
      tube(g, GR, [s * 3.2, by + 0.6, bz], [s * 1.1, 2.15, -3.75], 0.02, 5); tube(g, GR, [s * 6.4, by + 0.6, bz], [s * 1.1, 2.15, -3.75], 0.018, 5);
      box(g, K, xm, by + 0.3, bz, 0.12, 0.8, 0.18); cyl(g, ST, 'z', xm, by + 0.65, bz + 0.12, 0.05, 0.3, 6);
      // форсунки по нижнему поясу (конус-ножка + цветной наконечник)
      const nz = (x, y, i) => { const m = add(g, cylGeo3(), K); m.rotation.x = PI; m.position.set(x, y - 0.12, bz + 0.1); m.scale.set(0.05, 0.26, 0.05); const t = add(g, cylGeo3(), i % 2 ? 0xd9b238 : 0xd9d6c8); t.rotation.x = PI; t.position.set(x, y - 0.27, bz + 0.1); t.scale.set(0.1, 0.09, 0.1); };
      const nn = 12 + sub * 2;
      for (let i = 0; i < nn; i++) nz(s * (1.4 + i * (half - 3.4) / nn), by, i);
      for (let i = 0; i < 3; i++) { const t = (i + 0.5) / 3; nz(xm + (s * (half - 0.2) - xm) * t, by + 0.9 * t, i); }
      tube(g, 0xb8bdc2, [xi, by - 0.03, bz + 0.1], [xm, by - 0.03, bz + 0.1], 0.02, 5);
      tube(g, 0xb8bdc2, [xm, by - 0.03, bz + 0.1], [s * (half - 0.2), by + 0.87, bz + 0.1], 0.02, 5);
      box(g, 0xc5642a, s * (half - 0.15), by + 0.95, bz, 0.06, 0.35, 0.12);
    }
  }
  const SPRAYER_PAL = (t) => ({ body: [0x4377a8, 0x3b6ea0, 0x30608f][t], dark: [0x2f567f, 0x2a4f78, 0x22446b][t], trim: [0xcfa535, 0xd2a834, 0xd8ae32][t], roof: 0xbab7ac, stripe: 0xe8e2cf });
  reg('vehicle', 'waterer', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    buildSprayer(g, post, { tier, sub: subOf(lv), pal: SPRAYER_PAL(tier) });
    return finish(g, post, 300 + lv, SCALE[lv - 1]);
  });

  // ================================================================== РАЗБРАСЫВАТЕЛЬ (трактор + прицеп с дисками)
  function buildSpreaderTrailer(g, post, tier, P, sub) {
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
        wheel(g, s * wx, WR, az, WR, WW, s, { kind: 'plain', rr: 0.5, rim: P.rim, hub: IR, nuts: 0, tire: 0x1f2021, seg: 14 });
        if (az === axles[0]) arcStrip(g, BR, s * (wx - WW / 2 - 0.04) - 0.0, s * (wx + WW / 2 + 0.05), WR, az - (axles.length > 1 ? 0.55 : 0), WR + 0.09 + (axles.length > 1 ? 0.0 : 0), 0.04, 0.35, 2.8);
      }
    }
    // бункер: трапеция в сечении, рёбра, борт
    hull(g, BR, [[-wb, yb, z1], [wb, yb, z1], [wb, yb, z0], [-wb, yb, z0]], [[-wt, yt, z1], [wt, yt, z1], [wt, yt, z0], [-wt, yt, z0]]);
    const al = Math.atan((wt - wb) / (yt - yb)), hyp = Math.hypot(wt - wb, yt - yb);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) { const z = z0 + 0.25 + i * (z1 - z0 - 0.5) / 5; box(g, DK, s * ((wb + wt) / 2 + 0.03), (yb + yt) / 2, z, 0.06, hyp, 0.12, 0, 0, -s * al); }
      ext(g, DK, s * wt - (s > 0 ? 0.04 : -0.14), s * wt + (s > 0 ? 0.14 : -0.04), yt - 0.08, yt + 0.07, z0 - 0.08, z1 + 0.08);
      if (tier >= 2) { const xs = (y) => wb + (y - yb) / (yt - yb) * (wt - wb); for (const [y0, y1] of [[1.5, 1.62], [1.7, 1.76]]) hull(g, P.stripe, [[s * xs(y0), y0, z1], [s * xs(y1), y1, z1], [s * xs(y1), y1, z0], [s * xs(y0), y0, z0]], [[s * (xs(y0) + 0.05), y0, z1], [s * (xs(y1) + 0.05), y1, z1], [s * (xs(y1) + 0.05), y1, z0], [s * (xs(y0) + 0.05), y0, z0]]); }
    }
    ext(g, DK, -wt - 0.04, wt + 0.04, yt - 0.08, yt + 0.07, z0 - 0.08, z0 + 0.04); ext(g, DK, -wt - 0.04, wt + 0.04, yt - 0.08, yt + 0.07, z1 - 0.04, z1 + 0.08);
    if (tier >= 1) ext(g, BR, -wt, wt, yt, yt + 0.5, z1 - 0.06, z1 + 0.02);
    // груз: навал навоза (основание + комья по куполу)
    const heap = [0x4a3626, 0x57402c, 0x3f2e20, 0x634a33, 0x4e3a29], zm = (z0 + z1) / 2, hl = (z1 - z0) / 2;
    hull(g, 0x4a3626, [[-wt + 0.1, yt - 0.1, z1 - 0.1], [wt - 0.1, yt - 0.1, z1 - 0.1], [wt - 0.1, yt - 0.1, z0 + 0.1], [-wt + 0.1, yt - 0.1, z0 + 0.1]], [[-wt + 0.25, yt + 0.18, z1 - 0.25], [wt - 0.25, yt + 0.18, z1 - 0.25], [wt - 0.25, yt + 0.18, z0 + 0.25], [-wt + 0.25, yt + 0.18, z0 + 0.25]]);
    add(g, moundGeo(-wt + 0.2, wt - 0.2, z0 + 0.22, z1 - 0.22, yt + 0.12, 0.62, 12, 18, rng, 0.55, 0.55), 0x4e3a29);
    for (let i = 0, nl = 5 + (sub || 0); i < nl; i++) {
      const u = (rng() * 2 - 1) * 0.6, w = (rng() * 2 - 1) * 0.7, x = u * (wt - 0.4), z = zm + w * (hl - 0.45), dome = Math.max(0, (1 - u * u) * (1 - w * w)), r = 0.14 + rng() * 0.1;
      sph(g, heap[i % 5], x, yt + 0.2 + Math.pow(dome, 0.55) * 0.6, z, r + 0.06, r * 0.75, r + 0.04, 6, 4);
    }
    // выгрузка: окно, диски, кожух
    ext(g, DK, -0.8, 0.8, 1.0, 1.45, z0 - 0.4, z0 + 0.04);
    ext(g, IR, -0.7, 0.7, 0.88, 1.0, -2.95, -2.55);
    for (const s of [-1, 1]) {
      const cx = s * 0.58, cz = -2.85;
      cyl(g, K, 'y', cx, 0.98, cz, 0.05, 0.2, 6); cyl(g, 0x8a8f94, 'y', cx, 1.1, cz, 0.55, 0.05, 16); cyl(g, IR, 'y', cx, 1.15, cz, 0.13, 0.06, 10);
      for (let i = 0; i < 6; i++) { const a = i * PI / 3 + (s > 0 ? 0.5 : 0.1); beam(g, 0xc2c6c9, [cx + Math.cos(a) * 0.1, 1.2, cz + Math.sin(a) * 0.1], [cx + Math.cos(a) * 0.54, 1.25, cz + Math.sin(a) * 0.54], 0.06, 0.09); }
    }
    for (const s of [-1, 1]) { hull(g, BR, [[s * 1.18, 1.1, -3.3], [s * 1.28, 1.1, -3.3], [s * 1.28, 1.1, -2.4], [s * 1.18, 1.1, -2.4]], [[s * 1.18, 1.75, -3.25], [s * 1.28, 1.75, -3.25], [s * 1.28, 1.75, -2.45], [s * 1.18, 1.75, -2.45]]);
      lamp(post, s * 1.0, 1.3, -3.3, 0.14, 0.1, 0.04, 0xb83024, 0xc03020, 0.8); lamp(post, s * 1.0, 1.15, -3.3, 0.14, 0.07, 0.04, 0xd89a2a, 0xe0a030, 0.5); }
    ext(g, BR, -0.95, 0.95, 1.1, 1.4, -3.32, -3.26);
    // карданный вал к тракторному ВОМ
    tube(g, K, [0, 0.9, 1.9], [0, 0.82, 3.05], 0.035, 6); cyl(g, GR, 'z', 0, 0.9, 1.95, 0.06, 0.12, 8); cyl(g, GR, 'z', 0, 0.83, 2.9, 0.06, 0.12, 8);
    ext(g, IR, -0.2, 0.2, 0.9, 1.15, 1.7, 2.1);
    // шланги гидравлики
    tube(g, K, [0.2, 0.9, 2.6], [0.28, 0.75, 3.1], 0.025, 5);
  }
  const SPREADER_PAL = (t) => Object.assign(TRACTOR_PAL.spreader(t), { trailer: [0x7d5a38, 0x76532f, 0x6b4a2b][t] });
  reg('vehicle', 'spreader', (opts) => {
    const lv = clamp(Math.round(opts.level || 1), 1, 10), tier = tierOf(lv), g = new T.Group(), post = new T.Group();
    const P = SPREADER_PAL(tier), tz = 5.3;
    buildSpreaderTrailer(g, post, tier, P, subOf(lv));
    const tg = new T.Group(), tp = new T.Group(); tg.position.z = tz; tp.position.z = tz; g.add(tg); post.add(tp);
    buildTractor(tg, tp, { tier, sub: subOf(lv), pal: P, dual: tier >= 2, noBallast: true });
    g.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(g); const zc = (bb.min.z + bb.max.z) / 2; g.position.z = -zc; post.position.z = -zc;
    return finish(g, post, 400 + lv, SCALE[lv - 1]);
  });

  // ================================================================== ТРАНСПОРТ: общие вещи
  const CAB_COLORS = [0x2f5a7a, 0xa23a2c, 0x3f6a4a, 0xbb9226, 0x5c6168, 0xd8d4c6];
  const vOf = (opts) => (((opts.variant | 0) % 6) + 6) % 6;
  /** дуга выреза колеса для профиля кузова: точки [z,y] от переда к заду (z убывает) */
  function archPts(cz, cy, r, yb, n) {
    const a0 = Math.asin(clamp((yb - cy) / r, -1, 1)), p = [];
    for (let i = 0; i <= (n || 9); i++) { const a = a0 + (PI - 2 * a0) * i / (n || 9); p.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return p;
  }
  /** простые сиденья и руль в кабине: backH — высота спинки, rel — высота руля над полом */
  function seats(g, zSeat, zWheel, yFloor, xs, col, backH, rel) {
    const c = col || 0x2a2c30, bh = backH || 0.55, wy = rel || 0.62;
    for (const x of xs) { box(g, c, x, yFloor + 0.17, zSeat, 0.5, 0.2, 0.5); box(g, c, x, yFloor + 0.2 + bh / 2, zSeat - 0.22, 0.5, bh, 0.1, -0.12, 0, 0); }
    const x0 = xs[0]; tube(g, c, [x0, yFloor + 0.3, zWheel - 0.22], [x0, yFloor + wy, zWheel], 0.022, 6); const sw = cyl(g, c, 'y', x0, yFloor + wy + 0.03, zWheel + 0.04, 0.15, 0.035, 12); sw.rotation.x = 0.9;
  }

  /** мешок: округлое тулово, перетянутая горловина с «ушком» (тело вращения, чуть наклонён) */
  let _sackGeo = null;
  function sack(g, c, x, y, z, k) {
    k = k || 1;
    if (!_sackGeo) _sackGeo = latheGeo([[0.001, 0], [0.14, 0.012], [0.222, 0.075], [0.255, 0.19], [0.235, 0.31], [0.165, 0.395], [0.075, 0.445], [0.058, 0.475], [0.098, 0.52], [0.115, 0.575], [0.055, 0.62], [0.001, 0.635]], 9);
    const m = add(g, _sackGeo, c); m.position.set(x, y, z); m.scale.setScalar(k);
    m.rotation.z = Math.sin(x * 12.9 + z * 78.2) * 0.09; m.rotation.x = Math.sin(x * 37.1 + z * 11.3) * 0.07; m.rotation.y = Math.sin(x * 5.7 + z * 21.9) * 3;
    const t = cyl(g, 0x6e5c3c, 'y', x, y + 0.475 * k, z, 0.066 * k, 0.045 * k, 7); t.rotation.z = m.rotation.z; t.rotation.x = m.rotation.x;
  }
  /** сглаженный навал (насыпь): сетка nx×nz над прямоугольником, высота H в центре, края плавно сходят на y0; lump — доля случайных бугров */
  function moundGeo(x0, x1, z0, z1, y0, H, nx, nz, rng, lump, pw) {
    const pos = [], idx = [], ph = [rng() * 6, rng() * 6, rng() * 6, rng() * 6];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1, w = j / nz * 2 - 1;
      const e = Math.max(0, 1 - Math.pow(Math.abs(u), 2.2)) * Math.max(0, 1 - Math.pow(Math.abs(w), 3));
      const n = 0.5 * Math.sin(3.3 * u + ph[0]) * Math.cos(2.9 * w + ph[1]) + 0.3 * Math.sin(7.1 * u + ph[2]) * Math.sin(6.3 * w + ph[3]) + 0.25 * (rng() - 0.5);
      pos.push(x0 + (x1 - x0) * i / nx, y0 + H * Math.pow(e, pw || 0.6) * (1 + lump * n * Math.min(1, e * 3)), z0 + (z1 - z0) * j / nz);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  }
  // ================================================================== TRUCK / cart
  function spokeWheel(g, x, y, z, R, side) {
    const WOOD = 0x8a6a45, IRON = 0x3a3d41, n = 8;
    const t1 = new T.TorusGeometry(R, 0.04, 5, 20); t1.rotateY(PI / 2); const m1 = add(g, t1, WOOD); m1.position.set(x, y, z);
    const t2 = new T.TorusGeometry(R + 0.035, 0.022, 4, 20); t2.rotateY(PI / 2); t2.scale(1.9, 1, 1); const m2 = add(g, t2, IRON); m2.position.set(x, y, z);
    for (let i = 0; i < n; i++) { const a = i / n * PI * 2; beam(g, WOOD, [x, y, z], [x, y + Math.sin(a) * R, z + Math.cos(a) * R], 0.05, 0.05); }
    cyl(g, 0x5a4330, 'x', x, y, z, 0.1, 0.2, 8); cyl(g, IRON, 'x', x + side * 0.1, y, z, 0.06, 0.06, 8);
  }
  reg('truck', 'cart', (opts) => {
    const v = vOf(opts), g = new T.Group(), post = new T.Group(), WOOD = 0x8a6a45, DW = 0x5b4430, IRON = 0x3a3d41, rng = lcg(31 + v);
    const R = 0.58, wx = 0.8, cz = -0.1;
    for (const s of [-1, 1]) spokeWheel(g, s * wx, R, cz, R, s);
    cyl(g, IRON, 'x', 0, R, cz, 0.04, 2 * wx + 0.1, 6);
    // платформа и борта
    texBox(g, 'veh_planks', 0xb08a5a, -0.64, 0.64, 0.66, 0.72, -1.05, 0.85, 1.0);
    for (const s of [-1, 1]) { ext(g, DW, s * 0.6 - 0.04, s * 0.6 + 0.04, 0.6, 0.67, -1.05, 0.85); }
    ext(g, DW, -0.62, 0.62, 0.58, 0.66, -1.0, -0.9); ext(g, DW, -0.62, 0.62, 0.58, 0.66, 0.7, 0.8);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) texBox(g, 'veh_planks', 0xa88458, s * 0.66 - 0.025, s * 0.66 + 0.025, 0.74 + i * 0.13, 0.84 + i * 0.13, -1.05, 0.85, 1.2);
    for (const s of [-1, 1]) for (const z of [-1.0, -0.1, 0.8]) ext(g, DW, s * 0.66 - 0.04, s * 0.66 + 0.04, 0.66, 1.15, z - 0.04, z + 0.04);
    for (let i = 0; i < 3; i++) texBox(g, 'veh_planks', 0xa88458, -0.62, 0.62, 0.74 + i * 0.13, 0.84 + i * 0.13, 0.81, 0.86, 1.2);
    for (let i = 0; i < 2; i++) texBox(g, 'veh_planks', 0xa88458, -0.62, 0.62, 0.74 + i * 0.13, 0.84 + i * 0.13, -1.09, -1.04, 1.2);
    // оглобли с поперечной ручкой, подпорка
    for (const s of [-1, 1]) { beam(g, DW, [s * 0.45, 0.58, -0.7], [s * 0.4, 0.78, 2.05], 0.07, 0.07); ext(g, IRON, s * 0.45 - 0.05, s * 0.45 + 0.05, 0.6, 0.64, 0.4, 0.5); }
    cyl(g, DW, 'x', 0, 0.78, 2.05, 0.035, 0.95, 8); for (const s of [-1, 1]) cyl(g, IRON, 'x', s * 0.47, 0.78, 2.05, 0.04, 0.03, 8);
    tube(g, DW, [0, 0.72, 1.45], [0, 0.0, 1.45], 0.03, 6); ext(g, DW, -0.2, 0.2, 0.0, 0.04, 1.4, 1.5);
    // мешки, ящик, бочка
    const sacks = [[-0.3, -0.55], [0.25, -0.6], [-0.28, 0.0], [0.28, -0.05], [0.0, -0.3]], tan = [0xb59f72, 0xa8935f, 0xbca877];
    sacks.forEach(([x, z], i) => sack(g, tan[(i + v) % 3], x, i === 4 ? 0.98 : 0.72, z, 1 + (i % 2) * 0.1));
    ext(g, 0x9a7a4e, -0.5, -0.12, 0.72, 1.0, 0.25, 0.8); ext(g, DW, -0.52, -0.1, 0.96, 1.0, 0.23, 0.82);
    for (let i = 0; i < 3; i++) sph(g, [0xb8442e, 0x8aa84a, 0xd9a52e][(i + v) % 3], -0.42 + i * 0.12, 1.02, 0.5, 0.11, 0.08, 0.11, 6, 5);
    cyl(g, 0x7d5a38, 'y', 0.35, 0.96, 0.5, 0.2, 0.5, 12); for (const y of [0.78, 1.14]) cyl(g, IRON, 'y', 0.35, y, 0.5, 0.215, 0.04, 12);
    return finish(g, post, 500 + v, 1);
  });
  function cone(g, color, x, y, z, rx, h, rz) { const m = add(g, cylGeo(6, 0.15), color); m.position.set(x, y, z); m.scale.set(rx * 2, h, rz * 2); return m; }

  // ================================================================== PICKUP
  function buildPickup(g, post, col, v) {
    const BODY = col, DK = 0x2a2c30, CH = 0xb4b9be, CHASSIS = 0x2e3034, rng = lcg(900 + v);
    const WR = 0.4, WW = 0.27, wx = 0.86, fz = 1.6, rz = -1.4;
    for (const s of [-1, 1]) for (const z of [fz, rz]) { wheel(g, s * wx, WR, z, WR, WW, s, { kind: 'car', rr: 0.58, rim: 0xb5bac0, hub: 0x6a6f75, seg: 16 }); }
    cyl(g, CHASSIS, 'x', 0, WR, fz, 0.06, 1.6, 6); cyl(g, CHASSIS, 'x', 0, WR, rz, 0.06, 1.6, 6);
    ext(g, CHASSIS, -0.62, 0.62, 0.38, 0.56, -2.35, 2.4); ext(g, 0x3a3d42, -0.3, 0.3, 0.3, 0.5, -1.0, 0.9);
    const pts = [[-0.55, 0.52], [-0.55, 1.2], [1.25, 1.2], [2.32, 1.13], [2.47, 1.0], [2.5, 0.78], [2.45, 0.52]].concat(archPts(fz, 0.4, 0.5, 0.52, 8), [[-0.55, 0.52]]);
    sideProfile(g, BODY, pts.slice(0, -1), 1.9, 0.05);
    // кузов (платформа): борта с вырезами, пол, передний борт, задний борт
    const bp = [[-0.58, 1.15], [-2.44, 1.15], [-2.44, 0.52]].concat(archPts(rz, 0.4, 0.5, 0.52, 8).reverse(), [[-0.58, 0.52]]);
    for (const s of [-1, 1]) {
      const m = sideProfile(g, BODY, bp, 0.08, 0); m.position.x = s * 0.93;
      ext(g, BODY, s * 0.89, s * 0.99, 1.15, 1.2, -2.46, -0.56); ext(g, DK, s * 0.935, s * 0.945, 0.6, 0.64, -2.44, -0.58);
      arcStrip(g, DK, s * 0.93 - 0.05, s * 0.93 + 0.05, 0.4, rz, 0.5, 0.04, 0.2, PI - 0.2); arcStrip(g, DK, s * 0.95 - 0.05, s * 0.95 + 0.05, 0.4, fz, 0.5, 0.04, 0.2, PI - 0.2);
      ext(g, DK, s * 0.62 - 0.25 * (s > 0 ? 1 : 0), s * 0.62 + 0.25 * (s < 0 ? 1 : 0), 0.86, 1.0, -1.95, -0.85);
    }
    ext(g, 0x34373c, -0.88, 0.88, 0.76, 0.86, -2.45, -0.56); ext(g, BODY, -0.9, 0.9, 0.86, 1.45, -0.6, -0.5);
    ext(g, BODY, -0.9, 0.9, 0.5, 1.17, -2.52, -2.45); ext(g, DK, -0.3, 0.3, 1.0, 1.06, -2.53, -2.5); // задний борт + ручка
    ext(g, CH, -0.97, 0.97, 0.5, 0.7, -2.68, -2.5); ext(g, 0xe8e6de, -0.3, 0.3, 0.72, 0.86, -2.53, -2.51);
    // кабина
    cabin(g, post, { color: BODY, roof: BODY, xb: 0.9, xt: 0.78, yb: 1.2, yt: 1.9, zfb: 1.25, zft: 0.66, zbt: -0.4, zbb: -0.5, p: 0.07, mid: [0.52], over: 0.04, roofT: 0.06 });
    ext(g, 0x33373c, -0.85, 0.85, 1.235, 1.27, -0.5, 1.2); seats(g, 0.05, 0.6, 1.22, [-0.4, 0.4], 0x2a2c30, 0.36, 0.36);
    ext(g, DK, -0.8, 0.8, 1.25, 1.33, 1.0, 1.2);
    for (const s of [-1, 1]) { ext(g, DK, s * 0.948, s * 0.96, 0.62, 1.2, 0.64, 0.665); ext(g, DK, s * 0.948, s * 0.96, 0.62, 1.2, -0.5, -0.475); box(g, CH, s * 0.965, 1.1, 0.7, 0.03, 0.04, 0.16); box(g, CH, s * 0.965, 1.1, -0.43, 0.03, 0.04, 0.16);
      tube(g, DK, [s * 0.88, 1.5, 1.12], [s * 1.04, 1.52, 1.18], 0.015, 5); box(g, DK, s * 1.07, 1.52, 1.2, 0.05, 0.2, 0.14); box(g, 0xb4c4cf, s * 1.075, 1.52, 1.2, 0.012, 0.16, 0.1); }
    // передок: решётка, бампер, фары, номер
    ext(g, DK, -0.6, 0.6, 0.62, 0.98, 2.47, 2.52); for (let i = 0; i < 4; i++) ext(g, CH, -0.58, 0.58, 0.68 + i * 0.08, 0.72 + i * 0.08, 2.5, 2.54);
    ext(g, CH, -0.97, 0.97, 0.38, 0.58, 2.42, 2.64); ext(g, DK, -0.5, 0.5, 0.5, 0.57, 2.62, 2.66); ext(g, 0xe8e6de, -0.25, 0.25, 0.4, 0.52, 2.64, 2.66);
    for (const s of [-1, 1]) { box(g, CH, s * 0.72, 0.9, 2.46, 0.4, 0.2, 0.08); lamp(post, s * 0.72, 0.9, 2.5, 0.34, 0.14, 0.03, 0xfff3c4, 0xffe9a0, 0.9); lamp(post, s * 0.95, 0.77, 2.4, 0.04, 0.1, 0.14, 0xd89a2a, 0xe0a030, 0.6); lamp(post, s * 0.88, 0.95, -2.54, 0.2, 0.14, 0.03, 0xb83024, 0xc03020, 0.8); lamp(post, s * 0.72, 0.53, 2.65, 0.1, 0.06, 0.02, 0xfff3c4, 0xffe9a0, 0.8); }
    // груз: мешки/ящики/запаска
    const cargo = v % 3;
    if (cargo === 0) { for (let i = 0; i < 4; i++) sack(g, [0xcdb78a, 0xbfa97a][i % 2], -0.36 + (i % 2) * 0.72, 0.86, -1.1 - Math.floor(i / 2) * 0.8, 1.0); }
    else if (cargo === 1) { ext(g, 0x9a7a4e, -0.7, -0.05, 0.86, 1.3, -2.3, -1.6); ext(g, 0x8a6a42, -0.65, -0.1, 1.3, 1.5, -2.2, -1.7); ext(g, 0x9a7a4e, 0.1, 0.7, 0.86, 1.2, -1.5, -0.9); }
    else { const w = wheel(g, 0, 1.2, -0.9 - 0.0, 0.34, 0.2, 1, { kind: 'car', rr: 0.55, rim: 0x6a6f75, hub: 0x555b60, seg: 14 }); w.rotation.z = 0; w.rotation.x = -PI / 2 + 0.0; w.position.set(-0.3, 0.98, -1.5); cyl(g, DK, 'z', 0.4, 0.95, -2.0, 0.12, 0.8, 8); }
    ext(g, DK, -0.97, 0.97, 0.9, 0.96, -0.58, -0.53);
    for (const s of [-1, 1]) { ext(g, DK, s * 0.72, s * 1.0, 0.2, 0.52, -1.93, -1.9); ext(g, DK, s * 0.72, s * 1.0, 0.2, 0.52, 2.0, 2.03); }
  }
  reg('truck', 'pickup', (opts) => {
    const v = vOf(opts), g = new T.Group(), post = new T.Group();
    buildPickup(g, post, [0x3f6a8f, 0x9c3b2e, 0xbab6a6, 0x4c6b4a, 0x6f7378, 0x9a7a2c][v], v);
    return finish(g, post, 600 + v, 1);
  });

  // ================================================================== BOX TRUCK
  function buildBoxTruck(g, post, col, v) {
    const CAB = col, BOXC = [0xd2cec2, 0xc6c9ca, 0xd2cec2, 0xc4bea9, 0xcacccc, 0xc6c0b0][v], DK = 0x2a2c30, CH = 0xb4b9be, FR = 0x2b2d31;
    const WR = 0.52, fz = 2.9, rz = -2.5;
    for (const s of [-1, 1]) {
      wheel(g, s * 1.0, WR, fz, WR, 0.3, s, { kind: 'plain', rr: 0.55, rim: 0xb5bac0, hub: 0x6a6f75, nuts: 0, seg: 14 });
      wheel(g, s * 0.77, WR, rz, WR, 0.3, s, { kind: 'plain', rr: 0.55, rim: 0xb5bac0, hub: 0x6a6f75, noHub: true, seg: 14 });
      wheel(g, s * 1.12, WR, rz, WR, 0.28, s, { kind: 'plain', rr: 0.55, rim: 0xb5bac0, hub: 0x6a6f75, seg: 14 });
      ext(g, FR, s * 0.9 - 0.1, s * 0.9 + 0.1, 0.7, 0.98, -4.05, 3.7); ext(g, 0x3b3e43, s * 0.72, s * 1.05, 0.83, 0.9, rz - 0.6, rz + 0.6); ext(g, 0x3b3e43, s * 0.8, s * 1.15, 0.83, 0.9, fz - 0.5, fz + 0.5);
      ext(g, DK, s * 0.62, s * 1.3, 0.36, 0.96, -3.18, -3.14); ext(g, 0xb83024, s * 0.62, s * 1.3, 0.3, 0.36, -3.18, -3.14);
      cyl(g, 0x8b9096, 'z', s * 1.0, 0.68, -0.6, 0.32, 1.1, 12);
    }
    cyl(g, FR, 'x', 0, WR, fz, 0.07, 2.0, 6); cyl(g, FR, 'x', 0, WR, rz, 0.1, 1.8, 8); ext(g, FR, -0.8, 0.8, 0.7, 0.9, -4.0, 3.6);
    for (const z of [-3.5, -1.5, 0.5, 2.0]) ext(g, FR, -1.0, 1.0, 0.85, 0.97, z - 0.06, z + 0.06);
    // кузов-фургон
    texBox(g, 'veh_corrug', BOXC, -1.28, 1.28, 1.05, 3.4, -4.1, 1.85, 1.0);
    ext(g, 0x8a8f94, -1.3, 1.3, 3.38, 3.44, -4.12, 1.87); ext(g, 0x6c7176, -1.3, 1.3, 1.0, 1.1, -4.12, 1.87);
    ext(g, 0xa4a7a9, -1.24, 1.24, 3.39, 3.452, -4.08, 1.83);
    for (const x of [-0.85, -0.45, -0.05, 0.35, 0.75]) ext(g, 0x909496, x - 0.025, x + 0.025, 3.45, 3.5, -4.0, 1.75);
    for (const z of [-3.2, -1.4, 0.2]) ext(g, 0x909496, -1.2, 1.2, 3.45, 3.49, z - 0.03, z + 0.03);
    ext(g, 0xbfc2c2, -0.5, 0.5, 3.49, 3.58, -2.4, -1.5); ext(g, 0x9aa0a6, -0.45, 0.45, 3.58, 3.6, -2.35, -1.55); ext(g, 0xbfc2c2, 0.7, 1.0, 3.49, 3.55, 0.6, 1.2);
    for (const x of [-1.28, 1.28]) for (const z of [-4.1, 1.85]) ext(g, 0x9aa0a6, x - 0.04, x + 0.04, 1.02, 3.42, z - 0.04, z + 0.04);
    for (const s of [-1, 1]) { ext(g, CAB, s * 1.279, s * 1.293, 2.0, 2.28, -4.1, 1.85); for (let i = 0; i < 6; i++) ext(g, 0xd9942a, s * 1.28, s * 1.295, 3.3, 3.36, -3.9 + i * 0.95, -3.75 + i * 0.95); }
    ext(g, DK, -0.012, 0.012, 1.1, 3.34, -4.12, -4.098); for (const x of [-0.55, 0.55, -1.0, 1.0]) tube(g, CH, [x, 1.2, -4.14], [x, 3.25, -4.14], 0.022, 6);
    for (const x of [-0.55, 0.55]) for (const y of [1.6, 2.5]) box(g, DK, x, y, -4.15, 0.12, 0.05, 0.05);
    for (const s of [-1, 1]) { lamp(post, s * 1.15, 1.3, -4.13, 0.14, 0.34, 0.03, 0xb83024, 0xc03020, 0.8); lamp(post, s * 1.15, 1.58, -4.13, 0.14, 0.06, 0.03, 0xd89a2a, 0xe0a030, 0.5); }
    ext(g, 0x8a8f94, -1.2, 1.2, 0.74, 0.95, -4.32, -4.1); ext(g, 0xe8e6de, -0.3, 0.3, 0.98, 1.1, -4.14, -4.1);
    // кабина над двигателем
    ext(g, CAB, -1.1, 1.1, 1.08, 1.8, 2.0, 3.65); ext(g, DK, -1.12, 1.12, 1.0, 1.1, 2.0, 3.67);
    cabin(g, post, { color: CAB, roof: CAB, xb: 1.08, xt: 1.03, yb: 1.8, yt: 3.02, zfb: 3.62, zft: 3.4, zbt: 2.02, zbb: 2.02, p: 0.09, mid: [0.5], over: 0.06, roofT: 0.08 });
    ext(g, 0x33373c, -1.0, 1.0, 1.78, 1.84, 2.0, 3.6); seats(g, 2.7, 3.3, 1.84, [-0.5, 0.5], 0x2a2c30, 0.6, 0.75); ext(g, DK, -1.0, 1.0, 1.8, 2.05, 3.45, 3.62);
    ext(g, DK, -0.7, 0.7, 1.2, 1.72, 3.65, 3.7); for (let i = 0; i < 5; i++) ext(g, CH, -0.66, 0.66, 1.28 + i * 0.1, 1.32 + i * 0.1, 3.68, 3.72);
    ext(g, DK, -1.12, 1.12, 0.78, 1.02, 3.6, 3.92); ext(g, 0x8a8f94, -1.0, 1.0, 0.82, 0.94, 3.9, 3.95);
    for (const s of [-1, 1]) {
      box(g, DK, s * 0.88, 1.5, 3.66, 0.36, 0.26, 0.06); lamp(post, s * 0.88, 1.5, 3.7, 0.3, 0.2, 0.03, 0xfff3c4, 0xffe9a0, 0.9); lamp(post, s * 0.88, 1.2, 3.7, 0.3, 0.08, 0.03, 0xd89a2a, 0xe0a030, 0.5);
      ext(g, DK, s * 1.103, s * 1.12, 1.1, 1.8, 2.54, 2.565); box(g, CH, s * 1.12, 1.62, 2.65, 0.03, 0.05, 0.2); ext(g, 0x7d8388, s * 0.95, s * 1.25, 0.58, 0.64, 2.3, 2.9); ext(g, 0x7d8388, s * 0.95, s * 1.25, 0.84, 0.9, 2.3, 2.9);
      tube(g, DK, [s * 1.1, 2.1, 3.3], [s * 1.35, 2.35, 3.4], 0.02, 5); tube(g, DK, [s * 1.1, 2.9, 3.3], [s * 1.35, 2.35, 3.4], 0.02, 5); box(g, DK, s * 1.38, 2.35, 3.4, 0.05, 0.52, 0.2); box(g, 0xb4c4cf, s * 1.405, 2.35, 3.4, 0.012, 0.46, 0.16);
    }
    for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) lamp(post, x, 3.07, 3.5, 0.14, 0.06, 0.05, 0xd89a2a, 0xe0a030, 0.5);
    tube(g, CH, [1.18, 1.1, 1.95], [1.18, 3.2, 1.95], 0.05, 8); cyl(g, DK, 'y', 1.18, 1.3, 1.95, 0.08, 0.2, 8);
  }
  reg('truck', 'truck', (opts) => {
    const v = vOf(opts), g = new T.Group(), post = new T.Group();
    buildBoxTruck(g, post, CAB_COLORS[v], v);
    return finish(g, post, 700 + v, 1);
  });

  // ================================================================== SEMI (тягач + полуприцеп)
  function buildSemi(g, post, col, v) {
    const CAB = col, DK = 0x2a2c30, CH = 0xb4b9be, FR = 0x2b2d31, tarp = v % 2 === 1;
    const BOXC = [0xd2cec2, 0xc6c9ca, 0xd2cec2, 0xc4bea9, 0xcacccc, 0xc6c0b0][v];
    const WR = 0.5, TW = 0.38, tx = 1.02, tz = [1.5, 2.8], dz = [8.6, 9.8], fz = 12.5;
    // колёса и оси
    for (const s of [-1, 1]) {
      for (const z of tz) { wheel(g, s * tx, WR, z, WR, TW, s, { kind: 'plain', rr: 0.55, rim: 0xb5bac0, hub: 0x6a6f75, seg: 12 }); }
      for (const z of dz) wheel(g, s * 1.0, WR, z, WR, TW, s, { kind: 'plain', rr: 0.55, rim: 0xb5bac0, hub: 0x6a6f75, seg: 12 });
      wheel(g, s * 1.0, WR, fz, WR, 0.32, s, { kind: 'plain', rr: 0.55, rim: 0xb5bac0, hub: 0x6a6f75, seg: 12 });
    }
    for (const z of tz.concat(dz, [fz])) cyl(g, FR, 'x', 0, WR, z, 0.08, 2.0, 6);
    // рама тягача и полуприцепа
    for (const s of [-1, 1]) { ext(g, FR, s * 0.5 - 0.09, s * 0.5 + 0.09, 0.78, 1.04, 8.0, 13.2); ext(g, FR, s * 0.9 - 0.08, s * 0.9 + 0.08, 0.9, 1.1, 0.2, 7.4); }
    for (const z of [0.6, 2.2, 3.9, 5.6, 7.2]) ext(g, FR, -0.9, 0.9, 0.95, 1.07, z - 0.05, z + 0.05);
    ext(g, 0x4a4e53, -0.62, 0.62, 1.04, 1.14, 8.1, 9.6); ext(g, 0x2e3034, -0.12, 0.12, 1.0, 1.14, 8.7, 9.0); cyl(g, 0x2e3034, 'y', 0, 1.12, 8.8, 0.12, 0.1, 8);
    // оси/рессоры
    for (const z of dz) for (const s of [-1, 1]) ext(g, 0x3b3e43, s * 0.8, s * 1.0, 0.82, 0.9, z - 0.5, z + 0.5);
    // полуприцеп: фургон или платформа с тентом
    const L0 = 0.1, L1 = 9.6;
    ext(g, 0x3b3e43, -1.25, 1.25, 1.07, 1.2, L0, L1);
    if (!tarp) {
      texBox(g, 'veh_corrug', BOXC, -1.3, 1.3, 1.2, 3.85, L0, L1, 1.0);
      ext(g, 0x8a8f94, -1.32, 1.32, 3.83, 3.9, L0 - 0.02, L1 + 0.02);
      ext(g, 0xa4a7a9, -1.27, 1.27, 3.84, 3.912, L0 + 0.02, L1 - 0.02);
      for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) ext(g, 0x909496, x - 0.025, x + 0.025, 3.91, 3.96, L0 + 0.1, L1 - 0.1);
      for (let i = 0; i < 6; i++) ext(g, 0x909496, -1.25, 1.25, 3.91, 3.95, 0.8 + i * 1.6 - 0.03, 0.8 + i * 1.6 + 0.03);
      ext(g, 0xbfc2c2, -0.5, 0.5, 3.91, 4.0, 3.0, 3.9);
      for (const x of [-1.3, 1.3]) for (const z of [L0, L1]) ext(g, 0x9aa0a6, x - 0.04, x + 0.04, 1.2, 3.88, z - 0.04, z + 0.04);
      for (const s of [-1, 1]) { ext(g, CAB, s * 1.299, s * 1.312, 2.3, 2.62, L0, L1); ext(g, 0xe8e6de, s * 1.299, s * 1.312, 2.66, 2.72, L0, L1); }
      ext(g, DK, -0.012, 0.012, 1.25, 3.8, L0 - 0.025, L0 - 0.003); for (const x of [-0.55, 0.55, -1.05, 1.05]) tube(g, CH, [x, 1.4, L0 - 0.05], [x, 3.65, L0 - 0.05], 0.022, 6);
      for (const x of [-0.6, 0.6]) for (const y of [1.9, 2.8]) box(g, DK, x, y, L0 - 0.07, 0.12, 0.05, 0.05);
      for (const s of [-1, 1]) for (let i = 0; i < 7; i++) ext(g, 0xd9942a, s * 1.3, s * 1.315, 3.72, 3.78, 0.5 + i * 1.3, 0.65 + i * 1.3);
    } else {
      ext(g, 0x6c7176, -1.3, 1.3, 1.2, 1.3, L0, L1); ext(g, 0x4a4e53, -1.3, 1.3, 1.3, 1.34, L0, L1);
      for (const s of [-1, 1]) for (let i = 0; i < 8; i++) ext(g, 0x6c7176, s * 1.28 - 0.03, s * 1.28 + 0.03, 1.3, 2.0, L0 + 0.1 + i * 1.2, L0 + 0.18 + i * 1.2);
      const tc = [0x44614c, 0x44566b, 0x7a6a4a][(v - 1) / 2 | 0], sh = new T.Shape(), hw = 1.27, ya = 1.3, yt = 3.75, rr = 0.55;
      sh.moveTo(-hw, ya); sh.lineTo(hw, ya); sh.lineTo(hw, yt - rr); sh.quadraticCurveTo(hw, yt, hw - rr, yt); sh.lineTo(-hw + rr, yt); sh.quadraticCurveTo(-hw, yt, -hw, yt - rr); sh.lineTo(-hw, ya);
      const tg = new T.ExtrudeGeometry(sh, { depth: L1 - L0 - 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 5 }); tg.translate(0, 0, L0 + 0.05); add(g, tg, tc);
      for (let i = 0; i < 6; i++) { const z = L0 + 0.5 + i * 1.65; ext(g, 0x25272a, -1.31, 1.31, 1.3, 1.34, z - 0.05, z + 0.05); for (const s of [-1, 1]) ext(g, 0x25272a, s * 1.31 - (s > 0 ? 0.02 : -0.02), s * 1.31 + (s > 0 ? 0.02 : -0.02), 1.3, 3.2, z - 0.05, z + 0.05); for (let k = 0; k < 2; k++) ext(g, 0x25272a, -1.0 + k * 1.0, -0.85 + k * 1.0, 3.7, 3.84, z - 0.05, z + 0.05); }
    }
    // под днищем: ходовая тележка, шасси, опоры
    for (const s of [-1, 1]) { tube(g, 0x6c7176, [s * 0.9, 1.05, 6.6], [s * 0.9, 0.0, 6.6], 0.06, 6); ext(g, 0x4a4e53, s * 0.9 - 0.15, s * 0.9 + 0.15, 0.0, 0.05, 6.45, 6.75); ext(g, 0x3b3e43, s * 0.8, s * 1.06, 0.88, 0.95, tz[0] - 0.5, tz[1] + 0.5); ext(g, 0x2a2c30, s * 0.55, s * 1.3, 0.34, 0.98, 0.05, 0.08); ext(g, 0xb83024, s * 0.55, s * 1.3, 0.28, 0.34, 0.05, 0.08);
      ext(g, 0x7d8388, s * 1.25 - 0.015, s * 1.25 + 0.015, 0.45, 1.05, 1.1, 4.0); cyl(g, 0x8b9096, 'z', s * 1.0, 0.75, 5.0, 0.2, 0.9, 10); }
    ext(g, 0x8a8f94, -1.25, 1.25, 0.58, 0.8, -0.2, 0.05); ext(g, 0xe8e6de, -0.3, 0.3, 0.84, 0.95, 0.0, 0.05);
    for (const s of [-1, 1]) { lamp(post, s * 1.15, 1.38, 0.05, 0.14, 0.14, 0.03, 0xb83024, 0xc03020, 0.8); lamp(post, s * 1.15, 1.62, 0.05, 0.14, 0.06, 0.03, 0xd89a2a, 0xe0a030, 0.5); }
    // тягач: кабина, капот, бампер, баки, выхлопы
    const cz0 = 10.3, cz1 = 11.95;
    ext(g, CAB, -1.2, 1.2, 1.15, 2.0, cz0, cz1); ext(g, DK, -1.22, 1.22, 1.08, 1.2, cz0, cz1 + 0.05);
    cabin(g, post, { color: CAB, roof: CAB, xb: 1.18, xt: 1.1, yb: 2.0, yt: 3.45, zfb: cz1 - 0.02, zft: cz1 - 0.3, zbt: cz0 + 0.02, zbb: cz0 + 0.02, p: 0.09, mid: [0.5], over: 0.06, roofT: 0.09 });
    ext(g, 0x33373c, -1.1, 1.1, 2.0, 2.05, cz0, cz1); seats(g, cz0 + 0.55, cz1 - 0.4, 2.05, [-0.55, 0.55], 0x2a2c30, 0.65, 0.8); ext(g, DK, -1.1, 1.1, 2.0, 2.3, cz1 - 0.2, cz1);
    hull(g, CAB, [[-1.18, 3.5, cz1 - 0.3], [1.18, 3.5, cz1 - 0.3], [1.18, 3.5, cz0 - 0.1], [-1.18, 3.5, cz0 - 0.1]], [[-1.15, 3.95, cz1 - 0.6], [1.15, 3.95, cz1 - 0.6], [1.15, 3.95, cz0 - 0.2], [-1.15, 3.95, cz0 - 0.2]]); // обтекатель
    ext(g, 0x9a9fa4, -1.0, 1.0, 3.5, 3.56, cz1 - 0.35, cz1 + 0.15);
    hull(g, CAB, [[-0.62, 1.1, 13.25], [0.62, 1.1, 13.25], [0.7, 1.1, cz1 - 0.05], [-0.7, 1.1, cz1 - 0.05]], [[-0.55, 2.0, 13.2], [0.55, 2.0, 13.2], [0.66, 2.1, cz1 - 0.05], [-0.66, 2.1, cz1 - 0.05]]);
    ext(g, 0x8a8f94, -0.5, 0.5, 1.2, 1.9, 13.2, 13.28); for (let i = 0; i < 7; i++) ext(g, CH, -0.46 + i * 0.153, -0.4 + i * 0.153, 1.22, 1.88, 13.27, 13.31);
    ext(g, DK, -1.15, 1.15, 0.65, 1.0, 13.15, 13.5); ext(g, 0x8a8f94, -1.15, 1.15, 0.72, 0.9, 13.45, 13.55);
    for (const s of [-1, 1]) {
      box(g, DK, s * 0.78, 1.75, 13.18, 0.36, 0.28, 0.08); lamp(post, s * 0.78, 1.75, 13.22, 0.3, 0.2, 0.03, 0xfff3c4, 0xffe9a0, 0.9); lamp(post, s * 0.78, 1.45, 13.22, 0.3, 0.08, 0.03, 0xd89a2a, 0xe0a030, 0.5);
      cyl(g, 0x8b9096, 'z', s * 1.08, 0.9, 11.1, 0.36, 1.4, 14); ext(g, 0x6c7176, s * 0.85, s * 1.15, 1.0, 1.06, 10.5, 11.7);
      ext(g, 0x7d8388, s * 0.95, s * 1.3, 0.56, 0.62, 10.5, 11.8); ext(g, 0x7d8388, s * 0.95, s * 1.3, 0.8, 0.86, 10.5, 11.8); ext(g, DK, s * 1.213, s * 1.226, 1.15, 2.0, 11.0, 11.025); box(g, CH, s * 1.23, 1.7, 11.12, 0.03, 0.05, 0.22);
      tube(g, CH, [s * 1.25, 3.0, 10.7], [s * 1.25, 1.15, 10.7], 0.012, 4);
      tube(g, CH, [s * 1.3, 1.1, 10.0], [s * 1.3, 3.4, 10.0], 0.065, 8); cyl(g, DK, 'y', s * 1.3, 1.5, 10.0, 0.1, 0.2, 8); box(g, DK, s * 1.3, 3.43, 10.0, 0.16, 0.025, 0.16, -0.5, 0, 0);
      tube(g, DK, [s * 1.15, 3.2, cz1 - 0.2], [s * 1.5, 3.4, cz1 - 0.05], 0.02, 5); tube(g, DK, [s * 1.15, 2.6, cz1 - 0.2], [s * 1.5, 3.4, cz1 - 0.05], 0.02, 5); box(g, DK, s * 1.52, 3.4, cz1 - 0.05, 0.05, 0.55, 0.22); box(g, 0xb4c4cf, s * 1.545, 3.4, cz1 - 0.05, 0.012, 0.5, 0.18);
      arcStrip(g, DK, s * 0.62, s * 1.38, WR, dz[0] + 0.6, WR + 0.13, 0.05, 0.1, PI - 0.1);
      ext(g, DK, s * 0.62, s * 1.3, 0.35, 0.95, dz[1] + 0.8, dz[1] + 0.84);
    }
    for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) lamp(post, x, 3.52, cz1 - 0.35, 0.14, 0.06, 0.05, 0xd89a2a, 0xe0a030, 0.5);
    cyl(g, 0x2e3034, 'z', 0, 1.2, 9.3, 0.18, 0.5, 8); tube(g, 0x25272a, [0.3, 1.3, 9.6], [0.1, 1.3, 8.8], 0.05, 6);
    ext(g, 0x25272a, -0.55, 0.55, 0.8, 0.9, 12.0, 13.0);
  }
  reg('truck', 'semi', (opts) => {
    const v = vOf(opts), g = new T.Group(), post = new T.Group();
    buildSemi(g, post, CAB_COLORS[v], v);
    g.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(g), zc = (bb.min.z + bb.max.z) / 2; g.position.z = -zc; post.position.z = -zc;
    return finish(g, post, 800 + v, 1);
  });

  // ================================================================== ПРИЦЕПЫ: grain, flat
  function drawbar(g, col, hw, zA, zEye, y) {
    for (const s of [-1, 1]) beam(g, col, [s * hw, y, zA], [s * 0.05, y, zEye], 0.13, 0.15);
    cyl(g, 0x25272a, 'y', 0, y, zEye, 0.16, 0.15, 12); cyl(g, 0x777c82, 'y', 0, y, zEye, 0.09, 0.17, 8);
    tube(g, 0x6c7176, [0, y + 0.05, zEye - 0.8], [0, 0.1, zEye - 0.8], 0.04, 6); ext(g, 0x25272a, -0.15, 0.15, 0.0, 0.05, zEye - 0.95, zEye - 0.65);
    tube(g, 0x25272a, [0.2, y + 0.1, zEye - 0.3], [0.5, y + 0.0, zA + 0.2], 0.022, 5); tube(g, 0xb83024, [-0.2, y + 0.1, zEye - 0.3], [-0.5, y + 0.0, zA + 0.2], 0.022, 5);
  }
  function tandem(g, zs, x, R, W, rim, tire) {
    for (const z of zs) { cyl(g, 0x2b2d31, 'x', 0, R, z, 0.09, 2 * x, 8); for (const s of [-1, 1]) { wheel(g, s * x, R, z, R, W, s, { kind: 'plain', rr: 0.55, rim: rim || 0xb5bac0, hub: 0x6a6f75, seg: 14, nuts: 0, tire: tire }); ext(g, 0x3b3e43, s * (x - 0.2), s * (x + 0.2), R + 0.1, R + 0.17, z - 0.45, z + 0.45); } }
    const zm = (zs[0] + zs[zs.length - 1]) / 2;
    for (const s of [-1, 1]) ext(g, 0x3b3e43, s * (x - 0.05) - 0.03, s * (x - 0.05) + 0.03, R * 0.5, R + 0.1, Math.min(...zs), Math.max(...zs));
  }
  function trailerLights(g, post, z, xs, y, dir) {
    for (const s of [-1, 1]) { lamp(post, s * xs, y, z + dir * 0.02, 0.16, 0.16, 0.03, 0xb83024, 0xc03020, 0.8); lamp(post, s * xs, y + 0.2, z + dir * 0.02, 0.16, 0.06, 0.03, 0xd89a2a, 0xe0a030, 0.5); }
    ext(g, 0xe8e6de, -0.25, 0.25, y - 0.1, y + 0.05, z - 0.02 + (dir < 0 ? -0.04 : 0), z + 0.02 + (dir > 0 ? 0.04 : 0));
  }
  function buildGrain(g, post, v, load) {
    const BODY = v === 1 ? 0x80878d : 0x2f5e8a, DK = v === 1 ? 0x5d646a : 0x244a6e, FR = 0x2b2d31, hw = 1.25, z0 = -2.9, z1 = 2.7, yb = 1.22, yt = 2.9;
    tandem(g, [-1.9, -0.7], 1.03, 0.52, 0.38);
    for (const s of [-1, 1]) { ext(g, FR, s * 0.62 - 0.1, s * 0.62 + 0.1, 0.92, 1.2, z0 - 0.05, 3.0); ext(g, FR, s * 1.1 - 0.05, s * 1.1 + 0.05, 1.12, 1.22, z0, z1); }
    for (const z of [-2.7, -1.3, 0.1, 1.5, 2.6]) ext(g, FR, -1.05, 1.05, 1.05, 1.2, z - 0.06, z + 0.06);
    hull(g, DK, [[-1.0, 1.1, z1], [1.0, 1.1, z1], [1.0, 1.1, z0], [-1.0, 1.1, z0]], [[-hw, 1.28, z1], [hw, 1.28, z1], [hw, 1.28, z0], [-hw, 1.28, z0]]);
    for (const s of [-1, 1]) {
      texBox(g, 'veh_corrug', BODY, s * (hw - 0.06), s * hw, 1.28, yt, z0, z1, 1.0);
      ext(g, DK, s * (hw - 0.1), s * (hw + 0.06), yt - 0.06, yt + 0.06, z0 - 0.06, z1 + 0.06);
      for (let i = 0; i < 7; i++) { const z = z0 + 0.2 + i * (z1 - z0 - 0.4) / 6; ext(g, DK, s * hw - (s > 0 ? 0.0 : 0.05), s * hw + (s > 0 ? 0.05 : 0.0), 1.28, yt, z - 0.045, z + 0.045); }
      ext(g, DK, s * hw - (s > 0 ? 0.0 : 0.04), s * hw + (s > 0 ? 0.04 : 0.0), 1.9, 2.0, z0, z1);
      ext(g, 0x7d8388, s * 1.18, s * 1.34, 1.08, 1.13, -2.6, -0.0);
    }
    texBox(g, 'veh_corrug', BODY, -hw, hw, 1.28, yt, z1 - 0.06, z1, 1.0); texBox(g, 'veh_corrug', BODY, -hw, hw, 1.28, yt, z0, z0 + 0.06, 1.0);
    ext(g, DK, -hw - 0.04, hw + 0.04, yt - 0.06, yt + 0.06, z1 - 0.1, z1 + 0.06); ext(g, DK, -hw - 0.04, hw + 0.04, yt - 0.06, yt + 0.06, z0 - 0.06, z0 + 0.1);
    ext(g, 0x4b5156, -hw + 0.06, hw - 0.06, 1.2, 1.3, z0 + 0.06, z1 - 0.06);
    if (load) {
      hull(g, 0x967c33, [[-hw + 0.06, 1.3, z1 - 0.06], [hw - 0.06, 1.3, z1 - 0.06], [hw - 0.06, 1.3, z0 + 0.06], [-hw + 0.06, 1.3, z0 + 0.06]], [[-hw + 0.06, 2.42, z1 - 0.06], [hw - 0.06, 2.42, z1 - 0.06], [hw - 0.06, 2.42, z0 + 0.06], [-hw + 0.06, 2.42, z0 + 0.06]]);
      add(g, moundGeo(-hw + 0.06, hw - 0.06, z0 + 0.06, z1 - 0.06, 2.41, 0.42, 14, 24, lcg(41), 0.1, 0.7), 0xa68a3a);
    }
    // задний борт, защёлки, лестница, гидроцилиндр
    for (const s of [-1, 1]) { ext(g, 0x8a8f94, s * (hw - 0.14), s * (hw - 0.06), 1.3, yt, z0 - 0.04, z0); box(g, 0x25272a, s * (hw - 0.1), 2.5, z0 - 0.06, 0.06, 0.18, 0.06); box(g, 0x25272a, s * (hw - 0.1), 1.6, z0 - 0.06, 0.06, 0.18, 0.06); box(g, 0x25272a, s * 0.7, yt, z0 - 0.1, 0.1, 0.12, 0.1); }
    ext(g, 0x8a8f94, -hw + 0.1, hw - 0.1, 1.9, 1.96, z0 - 0.04, z0); ext(g, 0x25272a, -hw, hw, 1.12, 1.26, z0 - 0.08, z0);
    for (const s of [-1, 1]) tube(g, 0x8b9096, [s * 0.35, 1.3, z1 + 0.05], [s * 0.35, yt, z1 + 0.05], 0.025, 6);
    for (let i = 0; i < 7; i++) tube(g, 0x8b9096, [-0.35, 1.5 + i * 0.2, z1 + 0.05], [0.35, 1.5 + i * 0.2, z1 + 0.05], 0.02, 5);
    tube(g, 0x6c7176, [0, 1.0, 1.6], [0, 1.45, 2.2], 0.06, 8); tube(g, 0xa7acb1, [0, 1.3, 2.0], [0, 1.5, 2.3], 0.04, 8);
    drawbar(g, FR, 0.5, 2.4, 4.15, 1.0);
    trailerLights(g, post, z0 - 0.08, 1.12, 1.55, -1);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) ext(g, 0xd9942a, s * (hw + 0.045), s * (hw + 0.08), 1.2, 1.26, -2.4 + i * 1.6, -2.25 + i * 1.6);
  }
  reg('trailer', 'grain', (opts) => {
    const v = vOf(opts) % 2, g = new T.Group(), post = new T.Group();
    buildGrain(g, post, v, opts.load !== 0 && opts.empty !== true);
    g.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(g), zc = (bb.min.z + bb.max.z) / 2; g.position.z = -zc; post.position.z = -zc;
    return finish(g, post, 900 + v, 1);
  });

  function buildFlat(g, post, v) {
    const FR = 0x2b2d31, STEEL = v === 2 ? 0x4a5560 : 0x4f565c, DECK = 0xb8956a, hw = 1.25, z0 = -3.2, z1 = 3.0, rng = lcg(1200 + v);
    tandem(g, [-1.6, -0.4], 1.02, 0.52, 0.36);
    for (const s of [-1, 1]) { ext(g, FR, s * 0.5 - 0.1, s * 0.5 + 0.1, 0.92, 1.12, z0, z1 - 0.2); ext(g, STEEL, s * hw - 0.08, s * hw + 0.08, 1.1, 1.25, z0, z1); }
    for (const z of [-3.0, -1.9, -0.8, 0.3, 1.4, 2.5, 2.9]) ext(g, FR, -1.2, 1.2, 1.05, 1.14, z - 0.05, z + 0.05);
    texBox(g, 'veh_planks', DECK, -hw + 0.08, hw - 0.08, 1.14, 1.26, z0, z1, 1.2);
    ext(g, STEEL, -hw, hw, 1.1, 1.25, z0 - 0.06, z0 + 0.02); ext(g, STEEL, -hw, hw, 1.1, 1.25, z1 - 0.02, z1 + 0.06);
    // стойки-колышки и цепи
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) { const z = z0 + 0.25 + i * (z1 - z0 - 0.5) / 6; ext(g, 0x6c7176, s * hw - 0.05, s * hw + 0.05, 1.1, 1.3, z - 0.07, z + 0.07); if (v !== 1) ext(g, STEEL, s * (hw - 0.02) - 0.03, s * (hw - 0.02) + 0.03, 1.3, 2.1, z - 0.04, z + 0.04); }
    if (v !== 1) for (const s of [-1, 1]) { ext(g, STEEL, s * (hw - 0.02) - 0.03, s * (hw - 0.02) + 0.03, 1.75, 1.82, z0 + 0.2, z1 - 0.2); }
    // передний борт: рама
    for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) ext(g, STEEL, x - 0.04, x + 0.04, 1.26, 2.45, z1 - 0.12, z1 - 0.04);
    for (const y of [1.3, 1.9, 2.4]) ext(g, STEEL, -1.24, 1.24, y, y + 0.08, z1 - 0.13, z1 - 0.03);
    tandemFenders(g, hw);
    // груз
    if (v === 0) { for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) for (let k = 0; k < 2; k++) { const x = -0.6 + c * 1.2 + (rng() - 0.5) * 0.05, z = -2.0 + k * 1.55 + (rng() - 0.5) * 0.08; ext(g, [0xa8924f, 0x9d8846][(r + c + k) % 2], x - 0.55, x + 0.55, 1.26 + r * 0.5, 1.26 + (r + 1) * 0.5, z - 0.7, z + 0.7); for (const q of [-0.3, 0.3]) ext(g, 0x6d5a32, x - 0.56, x + 0.56, 1.28 + r * 0.5, 1.46 + r * 0.5 + 0.02, z + q - 0.015, z + q + 0.015); } for (const s of [-1, 1]) for (const z of [-2.7, -0.4]) ext(g, 0x25272a, -hw, hw, 2.26, 2.3, z - 0.03, z + 0.03); }
    else if (v === 2) { // паллеты с мешками и ящик
      for (let i = 0; i < 4; i++) { texBox(g, 'veh_planks', 0xa88458, -1.0, 1.0, 1.26 + i * 0.09, 1.34 + i * 0.09, -2.9 + i * 0.0, -1.0, 1.0); }
      [[-0.5, -2.5], [0.5, -2.5], [-0.5, -1.9], [0.5, -1.9], [-0.5, -1.3], [0.5, -1.3]].forEach(([x, z], i) => sack(g, [0xb59f72, 0xa8935f, 0xbca877][i % 3], x, 1.62, z, 1.1));
      texBox(g, 'veh_planks', 0xa88458, -1.0, 1.0, 1.26, 1.34, 0.2, 2.3, 1.0); texBox(g, 'veh_planks', 0xb08e5e, -0.9, 0.1, 1.34, 2.1, 0.4, 2.1, 1.0);
      for (const y of [1.5, 1.95]) ext(g, 0x4a4036, -0.92, 0.12, y, y + 0.06, 0.38, 2.12);
      ext(g, 0x4c6a8a, 0.2, 0.85, 1.34, 1.74, 0.5, 1.2); ext(g, 0x4c6a8a, 0.2, 0.85, 1.34, 1.74, 1.3, 2.0); ext(g, 0x3f5a77, 0.2, 0.85, 1.74, 1.78, 0.5, 2.0);
    }
    else { for (const s of [-1, 1]) for (let i = 0; i < 3; i++) tube(g, 0x3a3d41, [s * 1.1, 1.3, -2.0 + i * 1.8], [s * 0.9, 1.3, -2.0 + i * 1.8 + 0.2], 0.03, 5); }
    drawbar(g, FR, 0.5, 2.4, 4.3, 1.05);
    trailerLights(g, post, z0 - 0.06, 1.1, 1.4, -1);
  }
  function tandemFenders(g, hw) { for (const s of [-1, 1]) { ext(g, 0x3b3e43, s * 0.78, s * 1.34, 1.1, 1.14, -2.15, 0.15); arcStrip(g, 0x3b3e43, s * 0.78, s * 1.34, 0.52, -2.0, 0.6, 0.04, 1.4, 2.7); } }
  reg('trailer', 'flat', (opts) => {
    const v = vOf(opts) % 3, g = new T.Group(), post = new T.Group();
    buildFlat(g, post, v);
    g.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(g), zc = (bb.min.z + bb.max.z) / 2; g.position.z = -zc; post.position.z = -zc;
    return finish(g, post, 1000 + v, 1);
  });

  // ================================================================== ЛЕГКОВЫЕ: sedan, van
  const SEDAN_COLORS = [0x9c3b2e, 0x3d6a8e, 0xb9b5a8, 0x44624a, 0x6e7378, 0x93753a];
  const VAN_COLORS = [0xbfbcb1, 0xaeb1b3, 0x3d6a8e, 0x9c3b2e, 0x44624a, 0xa68a38];
  /** тонкая пластина по наклонному участку профиля (z,y) A->B: для лобового стекла и пр. */
  function slopePlate(g, color, A, B, xh, inset, off) {
    const dz = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dz, dy), ux = dz / L, uy = dy / L, nz = uy, ny = -ux; // нормаль (наружу — в сторону +z/+y при A ниже/впереди)
    const sg = nz * 1 + ny * 1 >= 0 ? 1 : -1, a = [A[0] + ux * inset, A[1] + uy * inset], b = [B[0] - ux * inset, B[1] - uy * inset];
    const o = [nz * sg * off, ny * sg * off];
    return hull(g, color, [[-xh, a[1], a[0]], [xh, a[1], a[0]], [xh, b[1], b[0]], [-xh, b[1], b[0]]], [[-xh, a[1] + o[1], a[0] + o[0]], [xh, a[1] + o[1], a[0] + o[0]], [xh, b[1] + o[1], b[0] + o[0]], [-xh, b[1] + o[1], b[0] + o[0]]]);
  }
  function buildSedan(g, post, col, v) {
    const BODY = col, DK = 0x24262a, CH = 0xc2c7cb, WR = 0.32, WW = 0.2, wx = 0.78, fz = 1.35, rz = -1.3, GLS = 0x2c3b47;
    for (const s of [-1, 1]) for (const z of [fz, rz]) wheel(g, s * wx, WR, z, WR, WW, s, { kind: 'car', rr: 0.62, rim: 0xc0c5c9, hub: 0x777c82, seg: 14, tire: 0x1c1d1f });
    for (const z of [fz, rz]) cyl(g, 0x2e3034, 'x', 0, WR, z, 0.04, 1.4, 6);
    ext(g, 0x2b2d31, -0.55, 0.55, 0.28, 0.4, -2.0, 2.0);
    const pts = [[-2.2, 0.36], [-2.23, 0.62], [-2.19, 0.88], [-1.55, 0.97], [0.85, 0.99], [2.0, 0.9], [2.2, 0.74], [2.23, 0.45], [2.12, 0.3]].concat(archPts(fz, 0.32, 0.43, 0.3, 8), archPts(rz, 0.32, 0.43, 0.3, 8), [[-2.12, 0.3]]);
    sideProfile(g, BODY, pts.slice(0, -1), 1.8, 0.05);
    cabin(g, post, { color: BODY, roof: BODY, xb: 0.83, xt: 0.7, yb: 1.0, yt: 1.5, zfb: 0.85, zft: 0.3, zbt: -0.85, zbb: -1.45, p: 0.065, mid: [0.5], over: 0.03, roofT: 0.05 });
    ext(g, 0x34373c, -0.8, 0.8, 1.04, 1.07, -1.5, 0.78);
    for (const x of [-0.38, 0.38]) { box(g, 0x2a2c30, x, 1.13, 0.1, 0.5, 0.12, 0.5); box(g, 0x2a2c30, x, 1.28, -0.13, 0.5, 0.3, 0.09, -0.12, 0, 0); }
    box(g, 0x2a2c30, 0, 1.11, -0.75, 1.5, 0.1, 0.4); box(g, 0x2a2c30, 0, 1.2, -0.97, 1.5, 0.2, 0.09, -0.2, 0, 0);
    tube(g, 0x2a2c30, [-0.38, 1.12, 0.55], [-0.38, 1.27, 0.4], 0.02, 6); { const sw = cyl(g, 0x2a2c30, 'y', -0.38, 1.3, 0.37, 0.13, 0.03, 12); sw.rotation.x = 0.9; }
    // торпедо целиком за лобовым стеклом (стекло идёт от z=0.85,y=1.0 к z=0.3,y=1.5)
    hull(g, 0x2b2e33, [[-0.72, 1.04, 0.76], [0.72, 1.04, 0.76], [0.72, 1.04, 0.42], [-0.72, 1.04, 0.42]], [[-0.72, 1.17, 0.6], [0.72, 1.17, 0.6], [0.72, 1.17, 0.36], [-0.72, 1.17, 0.36]]);
    for (const s of [-1, 1]) {
      ext(g, DK, s * 0.9, s * 0.915, 0.4, 0.99, 0.46, 0.48); ext(g, DK, s * 0.9, s * 0.915, 0.4, 0.99, -0.2, -0.18); ext(g, DK, s * 0.9, s * 0.915, 0.4, 0.99, -0.95, -0.93);
      box(g, CH, s * 0.915, 0.9, 0.38, 0.03, 0.035, 0.14); box(g, CH, s * 0.915, 0.9, -0.3, 0.03, 0.035, 0.14);
      // порог: только между колёсными арками, чтобы не перекрывать колёса
      for (const [za, zb] of [[-0.84, 0.89], [1.82, 2.05], [-2.05, -1.77]]) ext(g, 0x34373c, s * 0.9, s * 0.912, 0.36, 0.46, za, zb);
      tube(g, BODY, [s * 0.82, 1.03, 0.78], [s * 0.96, 1.07, 0.74], 0.018, 5); box(g, BODY, s * 1.0, 1.1, 0.72, 0.1, 0.12, 0.16);
      lamp(post, s * 0.66, 0.79, 2.21, 0.34, 0.12, 0.03, 0xfff3c4, 0xffe9a0, 0.9); lamp(post, s * 0.82, 0.62, 2.23, 0.1, 0.07, 0.03, 0xd89a2a, 0xe0a030, 0.6);
      lamp(post, s * 0.7, 0.78, -2.245, 0.36, 0.12, 0.03, 0xb83024, 0xc03020, 0.8);
    }
    ext(g, DK, -0.5, 0.5, 0.5, 0.73, 2.215, 2.235); for (let i = 0; i < 3; i++) ext(g, CH, -0.48, 0.48, 0.55 + i * 0.07, 0.58 + i * 0.07, 2.23, 2.245);
    ext(g, 0x4a4d52, -0.9, 0.9, 0.3, 0.46, 2.1, 2.3); ext(g, 0x4a4d52, -0.9, 0.9, 0.3, 0.46, -2.3, -2.12); ext(g, 0xe8e6de, -0.25, 0.25, 0.4, 0.5, 2.3, 2.315); ext(g, 0xe8e6de, -0.25, 0.25, 0.5, 0.6, -2.255, -2.24);
    ext(g, 0x2b2e33, -0.5, 0.5, 0.9, 0.915, 1.0, 2.05);
    tube(g, DK, [0.55, 1.5, -0.95], [0.6, 1.95, -1.15], 0.008, 4);
  }
  reg('car', 'sedan', (opts) => {
    const v = vOf(opts), g = new T.Group(), post = new T.Group();
    buildSedan(g, post, SEDAN_COLORS[v], v);
    return finish(g, post, 1100 + v, 1);
  });

  function buildVan(g, post, col, v) {
    const BODY = col, DK = 0x24262a, CH = 0xc2c7cb, WR = 0.36, WW = 0.24, wx = 0.88, fz = 1.65, rz = -1.55, GLS = 0x2b3a46, CLAD = 0x3b3f44;
    for (const s of [-1, 1]) for (const z of [fz, rz]) wheel(g, s * wx, WR, z, WR, WW, s, { kind: 'car', rr: 0.62, rim: 0xc0c5c9, hub: 0x777c82, seg: 14, tire: 0x1c1d1f });
    for (const z of [fz, rz]) cyl(g, 0x2e3034, 'x', 0, WR, z, 0.04, 1.6, 6);
    ext(g, 0x2b2d31, -0.6, 0.6, 0.3, 0.42, -2.3, 2.3);
    const pts = [[-2.6, 0.45], [-2.63, 0.7], [-2.63, 2.0], [-2.52, 2.3], [1.4, 2.32], [1.8, 2.2], [2.18, 1.5], [2.55, 1.22], [2.64, 1.0], [2.62, 0.55], [2.52, 0.4], [2.45, 0.35]].concat(archPts(fz, 0.36, 0.46, 0.35, 8), archPts(rz, 0.36, 0.46, 0.35, 8), [[-2.5, 0.35]]);
    sideProfile(g, BODY, pts.slice(0, -1), 2.0, 0.07);
    // окна: лобовое и боковые (тёмное стекло на кузове)
    slopePlate(g, GLS, [2.18, 1.5], [1.8, 2.2], 0.84, 0.05, 0.08);
    for (const s of [-1, 1]) {
      const x0 = s * 1.0, x1 = s * 1.016;
      hull(g, GLS, [[x0, 1.42, 1.95], [x0, 2.12, 1.6], [x0, 2.12, 0.95], [x0, 1.42, 0.95]], [[x1, 1.42, 1.95], [x1, 2.12, 1.6], [x1, 2.12, 0.95], [x1, 1.42, 0.95]]);
      if (v % 2 === 0 || s < 0) hull(g, GLS, [[x0, 1.5, -0.55], [x0, 2.05, -0.55], [x0, 2.05, -1.45], [x0, 1.5, -1.45]], [[x1, 1.5, -0.55], [x1, 2.05, -0.55], [x1, 2.05, -1.45], [x1, 1.5, -1.45]]);
      for (const [za, zb] of [[-1.07, 1.17], [2.13, 2.4], [-2.55, -2.03]]) ext(g, CLAD, s * 1.0, s * 1.014, 0.4, 0.66, za, zb); // обвес только между арками
      ext(g, DK, s * 1.0, s * 1.012, 0.44, 2.2, 0.9, 0.915); ext(g, DK, s * 1.0, s * 1.012, 0.44, 2.2, -0.55, -0.535); ext(g, DK, s * 1.0, s * 1.012, 0.44, 2.2, -2.0, -1.985);
      ext(g, DK, s * 1.0, s * 1.012, 0.7, 0.715, -1.07, 0.9); box(g, CH, s * 1.014, 1.2, 0.8, 0.03, 0.04, 0.16); box(g, CH, s * 1.014, 1.2, -0.62, 0.03, 0.04, 0.16);
      tube(g, DK, [s * 0.98, 1.65, 2.0], [s * 1.18, 1.85, 2.05], 0.018, 5); tube(g, DK, [s * 0.98, 2.0, 1.85], [s * 1.18, 1.85, 2.05], 0.018, 5); box(g, DK, s * 1.2, 1.85, 2.05, 0.05, 0.3, 0.17); box(g, 0xb4c4cf, s * 1.225, 1.85, 2.05, 0.012, 0.26, 0.13);
      lamp(post, s * 0.74, 1.02, 2.66, 0.34, 0.14, 0.03, 0xfff3c4, 0xffe9a0, 0.9); lamp(post, s * 0.9, 0.78, 2.6, 0.1, 0.08, 0.04, 0xd89a2a, 0xe0a030, 0.6); lamp(post, s * 0.96, 1.0, -2.65, 0.07, 0.56, 0.03, 0xb83024, 0xc03020, 0.8);
      ext(g, CLAD, s * 0.6 - 0.35, s * 0.6 + 0.35, 0.36, 0.45, 2.5, 2.62);
    }
    for (const x of [-0.4, 0.4]) hull(g, GLS, [[x - 0.34, 1.45, -2.63], [x + 0.34, 1.45, -2.63], [x + 0.34, 1.98, -2.63], [x - 0.34, 1.98, -2.63]], [[x - 0.34, 1.45, -2.65], [x + 0.34, 1.45, -2.65], [x + 0.34, 1.98, -2.65], [x - 0.34, 1.98, -2.65]]);
    ext(g, DK, -0.01, 0.01, 0.5, 2.25, -2.655, -2.64); ext(g, 0x34373c, -1.0, 1.0, 0.36, 0.62, -2.72, -2.55); ext(g, 0xe8e6de, -0.25, 0.25, 0.7, 0.8, -2.655, -2.64); box(g, DK, 0.0, 1.0, -2.67, 0.2, 0.05, 0.04);
    ext(g, DK, -0.5, 0.5, 0.62, 0.95, 2.63, 2.67); for (let i = 0; i < 3; i++) ext(g, CH, -0.5, 0.5, 0.7 + i * 0.09, 0.74 + i * 0.09, 2.655, 2.675); ext(g, 0x34373c, -1.0, 1.0, 0.36, 0.6, 2.5, 2.74); ext(g, 0xe8e6de, -0.25, 0.25, 0.44, 0.56, 2.74, 2.755);
    ext(g, 0xa9aeb2, -0.5, 0.5, 2.36, 2.46, -1.0, -0.4); ext(g, 0x7d8388, -0.45, 0.45, 2.46, 2.48, -0.95, -0.45);
    for (const x of [-0.72, 0.72]) ext(g, 0x8d9296, x - 0.03, x + 0.03, 2.37, 2.42, -2.45, 1.25);
    for (const z of [-2.3, -1.4, -0.2, 0.9]) ext(g, 0x8d9296, -0.76, 0.76, 2.37, 2.41, z - 0.03, z + 0.03);
    if (v % 2 === 1) for (const s of [-1, 1]) ext(g, 0xe6e2d6, s * 1.0, s * 1.01, 1.05, 1.18, -2.6, 0.9);
    else for (const s of [-1, 1]) ext(g, 0x22252a, s * 1.0, s * 1.01, 0.72, 0.8, -1.07, 0.9);
  }
  reg('car', 'van', (opts) => {
    const v = vOf(opts), g = new T.Group(), post = new T.Group();
    buildVan(g, post, VAN_COLORS[v], v);
    return finish(g, post, 1200 + v, 1);
  });

  /* @@MORE@@ */
})();
