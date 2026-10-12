/* Реалистичные процедурные модели техники (three.js r128): vehicle/tractor и vehicle/spreader.
   Трактор: L1-3 колёсный зелёный + дисковая борона, L4-6 современный колёсный + сеялка-культиватор, L7-10 красный гусеничный + широкая сеялка.
   Разбрасыватель: синий колёсный трактор + разбрасыватель (кузовной / с роторами / цистерна со штангой).
   Перёд = +Z, начало координат — центр опоры на земле, 1 единица = 1 м. Ориентиры формы — реальные классы машин, оригинальный дизайн без брендов. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, V3 = T.Vector3, M4 = T.Matrix4;
  const { paint, matte, metal, rubberM, chromeM, glassM, lightM, rbox, ext, mesh, pmat } = C;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, rad = (d) => d * PI / 180;
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  // ------------------------------------------------------------------ регистрация с кэшем (одна сборка на набор opts)
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = opts || {};
      const lv = clamp(Math.round(opts.level || 1), 1, 10), key = [kind, name, lv, opts.variant | 0, opts.seed | 0].join('|');
      if (!_cache[key]) _cache[key] = fn(lv, opts);
      return _cache[key].clone(true);
    });
  }

  // ------------------------------------------------------------------ геометрия: сглаживание по углу, лофт скруглённых сечений, накопитель
  /** Нормали с порогом излома: грани внутри угла deg сглаживаются, острые рёбра остаются острыми. */
  function crease(geo, deg) {
    const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, n = pa.count, nf = (n / 3) | 0;
    const fn = new Float32Array(nf * 3), A = new V3(), B = new V3(), Cc = new V3(), map = new Map(), keys = new Array(n);
    for (let f = 0; f < nf; f++) {
      A.fromBufferAttribute(pa, f * 3); B.fromBufferAttribute(pa, f * 3 + 1); Cc.fromBufferAttribute(pa, f * 3 + 2);
      B.sub(A); Cc.sub(A); B.cross(Cc); const l = B.length(); if (l > 1e-12) B.divideScalar(l); else B.set(0, 1, 0);
      fn[f * 3] = B.x; fn[f * 3 + 1] = B.y; fn[f * 3 + 2] = B.z;
    }
    for (let i = 0; i < n; i++) { const k = keys[i] = Math.round(pa.getX(i) * 2000) + ',' + Math.round(pa.getY(i) * 2000) + ',' + Math.round(pa.getZ(i) * 2000); let a = map.get(k); if (!a) map.set(k, a = []); a.push((i / 3) | 0); }
    const cosT = Math.cos(deg * PI / 180), out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const f = (i / 3) | 0, list = map.get(keys[i]); let x = 0, y = 0, z = 0;
      for (let q = 0; q < list.length; q++) { const f2 = list[q], d = fn[f * 3] * fn[f2 * 3] + fn[f * 3 + 1] * fn[f2 * 3 + 1] + fn[f * 3 + 2] * fn[f2 * 3 + 2]; if (d >= cosT) { x += fn[f2 * 3]; y += fn[f2 * 3 + 1]; z += fn[f2 * 3 + 2]; } }
      const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
    g.setAttribute('normal', new T.BufferAttribute(out, 3)); return g;
  }
  /** Скругление выпуклого многоугольника [[x,y]..] (против часовой): у каждого угла seg+1 точек, радиус rad число или массив. */
  function roundPoly(pts, rd, seg) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n], r = Math.max(1e-4, Array.isArray(rd) ? rd[i] : rd);
      let ux = A[0] - P[0], uy = A[1] - P[1], vx = B[0] - P[0], vy = B[1] - P[1]; const lu = Math.hypot(ux, uy) || 1e-6, lv = Math.hypot(vx, vy) || 1e-6;
      ux /= lu; uy /= lu; vx /= lv; vy /= lv;
      const phi = Math.acos(clamp(ux * vx + uy * vy, -1, 1)); let d = r / Math.max(1e-4, Math.tan(phi / 2)); d = Math.min(d, lu * 0.5, lv * 0.5);
      const t1x = P[0] + ux * d, t1y = P[1] + uy * d, t2x = P[0] + vx * d, t2y = P[1] + vy * d;
      for (let k = 0; k <= seg; k++) { const t = k / seg, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; out.push([a * t1x + b * P[0] + c * t2x, a * t1y + b * P[1] + c * t2y]); }
    }
    return out;
  }
  /** Сечение для лофта: трапеция (низ w0, верх w1) от y0 до y1 на позиции z, радиусы углов r (число или [лн,пн,пв,лв]), сдвиг cx. */
  const sec = (z, y0, y1, w0, w1, r, cx) => ({ z, cx: cx || 0, r: r == null ? 0.05 : r, poly: [[-w0 / 2, y0], [w0 / 2, y0], [w1 / 2, y1], [-w1 / 2, y1]] });
  /** Круглое/овальное сечение для лофта (n точек против часовой, старт снизу). */
  const circSec = (z, rx, ry, cx, cy, n, off) => { const ring = []; for (let i = 0; i < n; i++) { const a = -PI / 2 + i / n * PI * 2; ring.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return { z, cx: off || 0, ring }; };
  /** Лофт: поверхность через последовательность сечений вдоль +Z (скруглённый кузов, капот, бак). Нормали сглажены по углу. */
  function loft(secs, o) {
    o = o || {}; const seg = o.seg || 4, rings = secs.map((s) => s.ring || roundPoly(s.poly, s.r, seg)), n = rings[0].length, m = rings.length, pos = [], idx = [];
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) pos.push(rings[i][j][0] + (secs[i].cx || 0), rings[i][j][1], secs[i].z);
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + (j + 1) % n, d = (i + 1) * n + j; idx.push(a, b, c, a, c, d); }
    const cap = (i, flip) => {
      const base = pos.length / 3; let cx = 0, cy = 0; for (let j = 0; j < n; j++) { cx += rings[i][j][0]; cy += rings[i][j][1]; } cx /= n; cy /= n;
      for (let j = 0; j < n; j++) pos.push(rings[i][j][0] + (secs[i].cx || 0), rings[i][j][1], secs[i].z); pos.push(cx + (secs[i].cx || 0), cy, secs[i].z);
      for (let j = 0; j < n; j++) { const a = base + j, b = base + (j + 1) % n; if (flip) idx.push(base + n, b, a); else idx.push(base + n, a, b); }
    };
    if (o.capStart !== false) cap(0, true); if (o.capEnd !== false) cap(m - 1, false);
    let vol = 0; const P = (k) => [pos[idx[k] * 3], pos[idx[k] * 3 + 1], pos[idx[k] * 3 + 2]];
    for (let k = 0; k < idx.length; k += 3) { const a = P(k), b = P(k + 1), c = P(k + 2); vol += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
    if (vol < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return crease(g, o.crease || 50);
  }
  /** Накопитель: склеивает много копий геометрии (диски, зубья, шипы) в один меш. */
  const _m = new M4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new V3(), _s = new V3(), _v = new V3(), _n = new V3(), _nm = new T.Matrix3();
  class Acc {
    constructor() { this.p = []; this.n = []; }
    add(geo, m) {
      const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, na = g.attributes.normal; _nm.getNormalMatrix(m);
      for (let i = 0; i < pa.count; i++) { _v.fromBufferAttribute(pa, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z); _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); this.n.push(_n.x, _n.y, _n.z); }
      return this;
    }
    at(geo, x, y, z, rx, ry, rz, sx, sy, sz) {
      _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0);
      const a = sx == null ? 1 : sx; _s.set(a, sy == null ? a : sy, sz == null ? a : sz);
      return this.add(geo, _m.compose(_p, _q, _s));
    }
    geometry() { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3)); return g; }
    mesh(mat) { const o = new T.Mesh(this.geometry(), mat); o.castShadow = true; o.receiveShadow = true; return o; }
    get empty() { return !this.p.length; }
  }

  // ------------------------------------------------------------------ кэши примитивов и мелкие помощники
  const RBC = {}, CYC = {}, SXC = {};
  /** Лёгкий скруглённый брус (≈90 треугольников); совсем мелкие детали — обычный Box. */
  function rbox2(w, h, d, r) {
    r = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const bev = Math.min(r * 0.8, d / 2 - 0.001), hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.001, Math.min(r, hw - 0.001, hh - 0.001)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh); sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: 1, curveSegments: 2 });
    g.translate(0, 0, -(d - 2 * bev) / 2); return g;
  }
  const rb = (w, h, d, r) => { const k = [w, h, d, r].map((v) => v == null ? '' : +(+v).toFixed(4)).join('_'); return RBC[k] || (RBC[k] = Math.min(w, h, d) < 0.105 ? new T.BoxGeometry(w, h, d) : crease(rbox2(w, h, d, r == null ? 0.03 : r), 52)); };
  const cyg = (r1, r2, h, s) => { const k = [r1, r2, h, s].join('_'); return CYC[k] || (CYC[k] = new T.CylinderGeometry(r1, r2, h, s || 14)); };
  const BALL = {}; const ball = (r) => BALL[r] || (BALL[r] = new T.SphereGeometry(r, 8, 6));
  /** Профиль в плоскости (z,y), выдавленный на ширину w по оси X (центр по X=0): крылья, борта, рамы. */
  function sx(pts, w, bev) { const g = ext(pts, w, bev == null ? 0.012 : bev, 1); g.rotateY(-PI / 2); return crease(g, 40); }
  const put = (g, geo, m, x, y, z, rx, ry, rz) => { const o = mesh(geo, m, x, y, z, rx, ry, rz); g.add(o); return o; };
  const cylX = (g, m, r, len, x, y, z, s) => put(g, cyg(r, r, len, s || 14), m, x, y, z, 0, 0, PI / 2);
  const cylZ = (g, m, r, len, x, y, z, s) => put(g, cyg(r, r, len, s || 14), m, x, y, z, PI / 2, 0, 0);
  const cylY = (g, m, r, len, x, y, z, s) => put(g, cyg(r, r, len, s || 14), m, x, y, z);
  /** Балка (скруглённая) между точками a и b. */
  function beam(g, m, a, b, w, d, r) {
    const A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]), D = B.clone().sub(A), L = Math.max(0.01, D.length()), o = mesh(rb(w, L, d, r == null ? Math.min(w, d) * 0.3 : r), m);
    o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new V3(0, 1, 0), D.normalize()); g.add(o); return o;
  }
  /** Труба (цилиндр) между точками. r2 — радиус у точки b. */
  function rod(g, m, a, b, r, s, r2) {
    const A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]), D = B.clone().sub(A), L = Math.max(0.01, D.length()), o = mesh(cyg(r2 == null ? r : r2, r, L, s || 12), m);
    o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new V3(0, 1, 0), D.normalize()); g.add(o); return o;
  }
  /** Гидроцилиндр: корпус (краска) + хромированный шток + проушины. */
  function hyd(g, mb, mc, a, b, r) {
    const A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]), D = B.clone().sub(A), L = D.length(), u = D.clone().normalize(), mid = A.clone().add(u.clone().multiplyScalar(L * 0.5));
    rod(g, mb, a, [mid.x, mid.y, mid.z], r, 12); rod(g, mc, [mid.x, mid.y, mid.z], b, r * 0.5, 10);
    const e = A.clone().add(u.clone().multiplyScalar(L * 0.5)); void e;
    put(g, cyg(r * 0.9, r * 0.9, r * 1.6, 8), mb, a[0], a[1], a[2], 0, 0, PI / 2); put(g, cyg(r * 0.6, r * 0.6, r * 1.6, 8), mc, b[0], b[1], b[2], 0, 0, PI / 2);
  }
  /** Гибкий шланг/кабель по точкам (Catmull-Rom). */
  function hose(g, m, pts, r, segs, rs) {
    const curve = new T.CatmullRomCurve3(pts.map((p) => new V3(p[0], p[1], p[2])));
    return put(g, new T.TubeGeometry(curve, segs || Math.max(8, pts.length * 4), r, rs || 6, false), m, 0, 0, 0);
  }
  const _nrm = new V3(); void _nrm;

  // ------------------------------------------------------------------ процедурные текстуры
  const canvasOf = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  const DM = {};
  /** Материал-наклейка (PBR + карта). Кэшируется по ключу. */
  function decalMat(key, w, h, draw, o) {
    if (DM[key]) return DM[key];
    const t = new T.CanvasTexture(canvasOf(w, h, draw)); t.anisotropy = 8;
    return (DM[key] = new T.MeshStandardMaterial(Object.assign({ map: t, roughness: 0.5, metalness: 0.15, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o || {})));
  }
  /** Плоская наклейка w×h на поверхность; ry=±PI/2 — боковая, rz — наклон бокового борта. */
  function decal(g, m, w, h, x, y, z, ry, rz, rx) { const o = new T.Mesh(new T.PlaneGeometry(w, h), m); o.rotation.order = 'ZYX'; o.rotation.set(rx || 0, ry || 0, rz || 0); o.position.set(x, y, z); o.castShadow = false; o.receiveShadow = true; g.add(o); return o; }
  // тайловые текстуры через addProc (общий реестр world3d)
  C.addProc('mach_hazard_rw', (cv, g) => { const s = cv.width, n = 4, w = s / n; g.fillStyle = '#f1f1ec'; g.fillRect(0, 0, s, s); g.fillStyle = '#c3151b'; for (let i = -n; i < 2 * n; i++) { g.beginPath(); g.moveTo(i * w, s); g.lineTo(i * w + w / 2, s); g.lineTo(i * w + w / 2 + s, 0); g.lineTo(i * w + s, 0); g.closePath(); g.fill(); } }, 128);
  C.addProc('mach_hazard_yb', (cv, g) => { const s = cv.width, n = 4, w = s / n; g.fillStyle = '#f5c518'; g.fillRect(0, 0, s, s); g.fillStyle = '#1b1b1b'; for (let i = -n; i < 2 * n; i++) { g.beginPath(); g.moveTo(i * w, s); g.lineTo(i * w + w / 2, s); g.lineTo(i * w + w / 2 + s, 0); g.lineTo(i * w + s, 0); g.closePath(); g.fill(); } }, 128);
  C.addProc('mach_corrug', (cv, g) => { // гофрированный оцинкованный лист (вертикальные волны)
    const s = cv.width, n = 12, w = s / n; g.fillStyle = '#d9dcdc'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) { const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0); gr.addColorStop(0, '#f4f6f6'); gr.addColorStop(0.45, '#e2e5e5'); gr.addColorStop(0.5, '#8d9393'); gr.addColorStop(0.58, '#d0d4d4'); gr.addColorStop(1, '#f4f6f6'); g.fillStyle = gr; g.fillRect(i * w, 0, w, s); }
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(70,60,50,' + (0.03 + ((i * 37) % 7) * 0.008) + ')'; g.fillRect(((i * 97) % s), ((i * 53) % (s / 2)), 2, 30 + (i * 29) % 80); }
  }, 128);
  C.addProc('mach_manure', (cv, g) => { // навоз: бурая масса с волокнами
    const s = cv.width; g.fillStyle = '#4a3420'; g.fillRect(0, 0, s, s); let k = 5;
    const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    for (let i = 0; i < 700; i++) { const v = 40 + r() * 60; g.fillStyle = `rgba(${v + 30},${v + 10},${v - 8},${0.25 + r() * 0.4})`; g.beginPath(); g.ellipse(r() * s, r() * s, 2 + r() * 7, 1.5 + r() * 4, r() * 3, 0, PI * 2); g.fill(); }
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(150,125,60,${0.25 + r() * 0.3})`; g.lineWidth = 1; g.beginPath(); const x = r() * s, y = r() * s; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 22, y + (r() - 0.5) * 12); g.stroke(); }
  }, 128);
  const hazardRW = (rx, ry) => C.texMat('mach_hazard_rw', rx, ry, 0xffffff, 0, 0, 0, { side: T.FrontSide });
  const hazardYB = (rx, ry) => C.texMat('mach_hazard_yb', rx, ry, 0xffffff, 0, 0, 0, { side: T.FrontSide });
  const corrug = (rx, ry) => C.texMat('mach_corrug', rx, ry, 0xffffff, 0, 0, 0, { side: T.FrontSide });

  // ------------------------------------------------------------------ колесо: покрышка с грунтозацепами, окрашенный диск, ступица
  const WC = {};
  function wheelParts(R, W, o) {
    const key = [R, W, o.rimK, o.lugs, o.seg, o.lugH, o.road ? 1 : 0].join('|'); if (WC[key]) return WC[key];
    const hw = W / 2, lugH = R * (o.lugH == null ? 0.05 : o.lugH), Rc = R - lugH * 0.85, rimR = R * (o.rimK || 0.56), H = Rc - rimR, seg = o.seg || 32, P = (r, y) => new T.Vector2(r, y);
    const prof = [P(rimR + 0.012, -hw * 0.82), P(rimR + H * 0.25, -hw), P(rimR + H * 0.62, -hw * 0.96), P(Rc - H * 0.08, -hw * 0.72), P(Rc, -hw * 0.5), P(Rc, hw * 0.5), P(Rc - H * 0.08, hw * 0.72), P(rimR + H * 0.62, hw * 0.96), P(rimR + H * 0.25, hw), P(rimR + 0.012, hw * 0.82)];
    const carcass = new T.LatheGeometry(prof, seg);
    const lugs = new Acc(), nl = o.lugs == null ? 20 : o.lugs;
    if (nl > 0) {
      const lug = cyg(0.7071 * 0.8, 0.7071, 1, 4).clone(); lug.rotateY(PI / 4); lug.translate(0, 0.5, 0); { const ix = lug.index.array, g2 = lug.groups[2]; lug.setIndex(Array.from(ix).slice(0, g2.start)); lug.clearGroups(); } const ya = rad(34), pitch = PI * 2 * Rc / nl, mx = new M4(), xa = new V3(), ya_ = new V3(), za = new V3();
      for (let s = -1; s <= 1; s += 2) for (let k = 0; k < nl; k++) {
        const th = (k + (s > 0 ? 0 : 0.5)) * PI * 2 / nl, rh = new V3(Math.cos(th), 0, Math.sin(th)), tg = new V3(-Math.sin(th), 0, Math.cos(th));
        xa.set(0, s * Math.cos(ya), 0).addScaledVector(tg, Math.sin(ya)); ya_.copy(rh); za.crossVectors(xa, ya_);
        mx.makeBasis(xa, ya_, za); mx.scale(new V3(hw * 0.84 / Math.cos(ya), lugH, pitch * 0.42));
        mx.setPosition(rh.x * (Rc - lugH * 0.15), s * hw * 0.42, rh.z * (Rc - lugH * 0.15)); lugs.add(lug, mx.clone());
      }
    }
    const rim = new T.LatheGeometry([P(rimR + 0.03, hw * 0.86), P(rimR + 0.006, hw * 0.80), P(rimR - 0.012, hw * 0.62), P(rimR * 0.92, hw * 0.38), P(rimR * 0.70, hw * 0.40), P(rimR * 0.42, hw * 0.52), P(rimR * 0.30, hw * 0.56)], Math.max(18, seg - 8));
    const hubA = new Acc(); hubA.at(cyg(rimR * 0.27, rimR * 0.29, hw * 0.34, 12), 0, hw * 0.58, 0); hubA.at(new T.SphereGeometry(rimR * 0.2, 12, 4, 0, PI * 2, 0, PI / 2), 0, hw * 0.74, 0, 0, 0, 0, 1, 0.55, 1);
    const nuts = new Acc(), nn = o.nuts == null ? 5 : o.nuts; for (let i = 0; i < nn; i++) { const a = i / nn * PI * 2; nuts.at(cyg(rimR * 0.05, rimR * 0.05, 0.03, 4), Math.cos(a) * rimR * 0.46, hw * 0.52, Math.sin(a) * rimR * 0.46); }
    return (WC[key] = { carcass, lugs: lugs.geometry(), rim, hub: hubA.geometry(), nuts: nuts.geometry(), Rc, rimR });
  }
  /** Колесо в группу g: side=+1 правое (диск наружу +X), -1 левое. Центр на (x,y=R,z). */
  function wheel(g, mt, side, x, z, R, W, rimMat, o) {
    o = o || {}; const p = wheelParts(R, W, o), wg = new T.Group(); wg.position.set(x, R, z); wg.rotation.set(o.spin || 0, 0, side > 0 ? -PI / 2 : PI / 2);
    wg.add(mesh(p.carcass, mt.rubber)); if (p.lugs.attributes.position.count) wg.add(mesh(p.lugs, mt.rubber)); wg.add(mesh(p.rim, rimMat)); wg.add(mesh(p.hub, mt.steel)); wg.add(mesh(p.nuts, mt.chrome)); g.add(wg); return wg;
  }

  // ------------------------------------------------------------------ собираем итоговую модель: склейка по материалам + стекло
  let GLA = null; // накопитель стекла текущей модели
  const glassBox = (w, h, d, x, y, z, rx, ry, rz) => GLA.at(new T.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  function begin() { GLA = new Acc(); return new T.Group(); }
  function finish(g, tint, gscale) {
    if (window.__MM_DEBUG) { // отладка: самые тяжёлые детали до склейки
      const L = []; g.traverse((o) => { if (o.isMesh) { const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; L.push([n, o.geometry.type, o.material.color ? o.material.color.getHexString() : '', o.position.x.toFixed(1), o.position.y.toFixed(1), o.position.z.toFixed(1)]); } });
      L.sort((a, b) => b[0] - a[0]); console.log('MMDBG ' + L.slice(0, 28).map((r) => r.join(' ')).join(' | ') + ' | total meshes ' + L.length + ' glass ' + GLA.p.length / 9);
    }
    const out = C.bakeTex(g);
    if (!GLA.empty) { const gm = GLA.mesh(glassM(tint || 0x86aebd)); gm.castShadow = false; gm.receiveShadow = false; if (gscale && gscale !== 1) gm.scale.setScalar(gscale); out.add(gm); }
    // центрируем опору по оси Z, опускаем на землю
    out.updateMatrixWorld(true); const b = new T.Box3().setFromObject(out), cz = (b.min.z + b.max.z) / 2; out.children.forEach((c) => { c.position.z -= cz; c.position.y -= b.min.y; });
    return out;
  }
  const tierOf = (lv) => lv <= 3 ? 0 : lv <= 6 ? 1 : 2;
  const tOf = (lv) => lv <= 3 ? (lv - 1) / 2 : lv <= 6 ? (lv - 4) / 2 : (lv - 7) / 3;

  // ------------------------------------------------------------------ кабина
  /** Кабина с большим остеклением. c: {zc,L,W,yf,yr,rake}. Стекло идёт в накопитель GLA. */
  function buildCab(g, mt, c, modern, lights) {
    const zF = c.zc + c.L / 2, zR = c.zc - c.L / 2, hw = c.W / 2, yf = c.yf, yr = c.yr, pw = modern ? 0.1 : 0.08, rake = c.rake;
    put(g, rb(c.W, 0.34, c.L, 0.07), mt.body, 0, yf + 0.04, c.zc);
    put(g, rb(c.W - 0.12, 0.05, c.L - 0.12, 0.02), mt.dark, 0, yf + 0.23, c.zc);
    for (const s of [-1, 1]) {
      beam(g, mt.dark, [s * (hw - 0.03), yf + 0.2, zF - 0.03], [s * (hw - 0.05), yr - 0.03, zF - rake], pw, pw, 0.03);
      beam(g, mt.dark, [s * (hw - 0.03), yf + 0.2, zR + 0.03], [s * (hw - 0.03), yr - 0.03, zR + 0.05], pw, pw, 0.03);
      beam(g, mt.dark, [s * (hw - 0.03), yr - 0.04, zF - rake], [s * (hw - 0.03), yr - 0.04, zR + 0.05], 0.07, 0.06, 0.02);
      beam(g, mt.dark, [s * (hw - 0.03), yf + 0.3, zR + 0.55], [s * (hw - 0.03), yr - 0.04, zR + 0.55], 0.045, 0.05, 0.015);
      beam(g, mt.dark, [s * (hw - 0.02), yf + 0.3, c.zc + 0.28], [s * (hw - 0.02), yr - 0.04, c.zc + 0.28], 0.04, 0.045, 0.015);
      // ручка двери и поручень у входа
      beam(g, mt.chrome, [s * (hw + 0.03), yf + 0.62, c.zc + 0.5], [s * (hw + 0.03), yf + 1.1, c.zc + 0.5], 0.03, 0.03, 0.012);
      put(g, rb(0.06, 0.04, 0.16, 0.015), mt.dark, s * (hw + 0.02), yf + 0.56, c.zc - 0.18);
    }
    // стекло: боковые, лобовое, заднее
    const gT = yr - 0.07, gB = yf + 0.3;
    for (const s of [-1, 1]) glassBox(0.02, gT - gB, c.L - 0.2, s * (hw - 0.02), (gT + gB) / 2, c.zc - 0.02);
    const fh = (yr - 0.05) - (yf + 0.28), fa = Math.atan(rake / fh);
    glassBox(c.W - 0.14, fh / Math.cos(fa), 0.02, 0, (yr - 0.05 + yf + 0.28) / 2, zF - rake / 2 - 0.01, -fa, 0, 0);
    glassBox(c.W - 0.12, gT - gB, 0.02, 0, (gT + gB) / 2, zR + 0.01);
    // крыша: скруглённая плита с козырьком
    const ov = modern ? 0.2 : 0.1, zr0 = zR - 0.1, zr1 = zF - rake + ov, wR = c.W + 0.12, tk = modern ? 0.16 : 0.13;
    put(g, loft([sec(zr0, yr - 0.03, yr - 0.03 + tk * 0.7, wR - 0.05, wR - 0.18, [0.04, 0.04, 0.06, 0.06]), sec(zr0 + 0.15, yr - 0.03, yr + tk, wR, wR - 0.1, [0.04, 0.04, 0.08, 0.08]), sec((zr0 + zr1) / 2, yr - 0.03, yr + tk + 0.03, wR, wR - 0.08, [0.04, 0.04, 0.09, 0.09]), sec(zr1 - 0.15, yr - 0.03, yr + tk, wR, wR - 0.1, [0.04, 0.04, 0.08, 0.08]), sec(zr1, yr - 0.03, yr - 0.03 + tk * 0.65, wR - 0.04, wR - 0.18, [0.04, 0.04, 0.06, 0.06])]), mt.roof, 0, 0, 0);
    put(g, rb(0.46, 0.06, 0.56, 0.025), mt.dark, 0, yr + tk + 0.04, c.zc - 0.12);   // люк-вентиляция
    // салон: сиденье, руль, приборная панель
    put(g, rb(0.5, 0.16, 0.5, 0.05), mt.dark, 0, yf + 0.48, c.zc - 0.3); put(g, rb(0.48, 0.62, 0.13, 0.05), mt.dark, 0, yf + 0.86, c.zc - 0.55, -0.12);
    put(g, rb(0.14, 0.4, 0.22, 0.04), mt.dark, 0.34, yf + 0.52, c.zc - 0.25);
    put(g, rb(c.W - 0.25, 0.3, 0.4, 0.07), mt.dark, 0, yf + 0.5, zF - 0.38, -0.2); cylY(g, mt.dark, 0.022, 0.5, 0, yf + 0.78, zF - 0.55, 8).rotation.x = -0.8;
    put(g, new T.TorusGeometry(0.17, 0.02, 8, 18), mt.dark, 0, yf + 0.98, zF - 0.64, -0.85);
    if (modern) { put(g, rb(c.W - 0.4, 0.04, 0.12, 0.015), mt.dark, 0, yr - 0.1, zF - rake - 0.06); }
    // зеркала на кронштейнах
    for (const s of [-1, 1]) {
      const mx = s * (hw + (modern ? 0.5 : 0.42)), my = yr - 0.55, mz = zF - rake - 0.05;
      beam(g, mt.dark, [s * (hw - 0.02), my - 0.45, zF - 0.1], [mx, my - 0.1, mz - 0.1], 0.03, 0.03, 0.012); beam(g, mt.dark, [s * (hw - 0.02), my + 0.3, zF - rake - 0.02], [mx, my + 0.1, mz - 0.1], 0.03, 0.03, 0.012);
      put(g, rb(0.04, 0.3, 0.2, 0.015), mt.dark, mx, my - 0.05, mz - 0.12); put(g, rb(0.02, 0.26, 0.16, 0.01), mt.chrome, mx, my - 0.05, mz - 0.135 - 0.02, 0.0);
    }
    // проблесковый маяк и рабочие фары на крыше
    if (lights >= 1) { cylY(g, mt.dark, 0.075, 0.05, 0, yr + tk + 0.1, c.zc - 0.9, 14); cylY(g, mt.amber, 0.06, 0.09, 0, yr + tk + 0.17, c.zc - 0.9, 14); }
    if (lights >= 2) for (const s of [-1, 1]) for (const k of [0.34, 0.6]) { put(g, rb(0.14, 0.1, 0.1, 0.03), mt.dark, s * k, yr + tk * 0.4 - 0.02, zr1 - 0.1); put(g, rb(0.11, 0.07, 0.03, 0.01), mt.lamp, s * k, yr + tk * 0.4 - 0.02, zr1 - 0.04); }
    return { zF, zR, yr, tk };
  }


  // ------------------------------------------------------------------ колёсный трактор (классический L1-3 и современный L4-6)
  const DIM = {
    A: { Rr: 0.90, Wr: 0.62, xr: 1.02, Rf: 0.56, Wf: 0.40, xf: 0.95, WB: 2.65, rimKr: 0.56, rimKf: 0.52,
      hood: { z0: 0.52, z1: 3.08, yb: 0.86, yt0: 1.98, yt1: 1.62, wb0: 1.02, wb1: 0.94, wt0: 0.86, wt1: 0.76, curve: 1.2 },
      cab: { zc: -0.50, L: 1.72, W: 1.30, yf: 1.06, yr: 2.98, rake: 0.20 }, hitchZ: -2.25, hitchY: 0.50 },
    B: { Rr: 1.00, Wr: 0.74, xr: 1.14, Rf: 0.70, Wf: 0.56, xf: 1.10, WB: 3.10, rimKr: 0.57, rimKf: 0.55,
      hood: { z0: 0.64, z1: 3.6, yb: 0.98, yt0: 2.22, yt1: 1.78, wb0: 1.16, wb1: 1.04, wt0: 0.96, wt1: 0.84, curve: 1.0 },
      cab: { zc: -0.56, L: 2.05, W: 1.56, yf: 1.20, yr: 3.34, rake: 0.40 }, hitchZ: -2.5, hitchY: 0.55 },
  };
  function fenderPts(zc, yc, R, a0, a1, th, lip) {
    const ro = R + lip + th, ri = R + lip, pts = [], n = 10;
    for (let i = 0; i <= n; i++) { const a = rad(lerp(a0, a1, i / n)); pts.push([zc + ro * Math.cos(a), yc + ro * Math.sin(a)]); }
    for (let i = n; i >= 0; i--) { const a = rad(lerp(a0, a1, i / n)); pts.push([zc + ri * Math.cos(a), yc + ri * Math.sin(a)]); }
    return pts;
  }
  function hoodDecal(txt, bg, stripe, fg) {
    return decalMat('hood|' + txt + bg + stripe, 512, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = stripe; g.fillRect(0, h - 22, w, 10); g.fillRect(0, h - 8, w, 4);
      g.font = 'italic 900 62px "Arial Black",Impact,Arial,sans-serif'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(txt, 22, 38); g.fillStyle = fg; g.fillText(txt, 18, 34);
    }, { alphaTest: 0.45 });
  }
  function grilleMat(modern, accent) {
    return decalMat('grille|' + modern + accent, 256, 160, (g, w, h) => {
      g.fillStyle = '#111316'; g.fillRect(0, 0, w, h);
      const n = modern ? 9 : 7;
      for (let i = 0; i < n; i++) { const y = 10 + i * (h - 20) / n; const gr = g.createLinearGradient(0, y, 0, y + (h - 20) / n); gr.addColorStop(0, '#5a6068'); gr.addColorStop(0.35, '#2a2e33'); gr.addColorStop(1, '#101215'); g.fillStyle = gr; g.fillRect(10, y, w - 20, (h - 20) / n - 4); }
      g.strokeStyle = accent; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = accent; g.fillRect(0, h / 2 - 5, w, 10);
    }, { roughness: 0.45, metalness: 0.5 });
  }

  /** Колёсный трактор. o: {modern, col:{body,trim,roof}, lv, label, accent}. Возвращает {g, hz, hy}. */
  function buildWheeled(o) {
    const g = begin(), D = o.modern ? DIM.B : DIM.A, col = o.col, lv = o.lv, modern = !!o.modern;
    const mt = { body: paint(col.body), trim: paint(col.trim), roof: paint(col.roof), dark: pmat(0x1b1d20, { metalness: 0.25, roughness: 0.5, envMapIntensity: 0.5 }), steel: metal(0x5f656c, { roughness: 0.45 }), chrome: chromeM(), rubber: rubberM(), lamp: lightM(0xfff3cf), amber: lightM(0xffa51f) };
    const { Rr, Wr, xr, Rf, Wf, xf, WB } = D, H = D.hood, c = D.cab, rimMat = mt.trim, lights = o.lights == null ? 0 : o.lights;
    // колёса
    for (const s of [-1, 1]) {
      wheel(g, mt, s, s * xr, 0, Rr, Wr, rimMat, { rimK: D.rimKr, lugs: 14, seg: 26, spin: s * 0.21, lugH: 0.052 });
      wheel(g, mt, s, s * xf, WB, Rf, Wf, rimMat, { rimK: D.rimKf, lugs: 12, seg: 22, spin: s * 0.4, lugH: 0.055 });
    }
    // мосты, КПП, рама, двигатель
    cylX(g, mt.steel, 0.12, 2 * xr, 0, Rr, 0, 14);
    put(g, rb(0.86, 0.66, 1.55, 0.16), mt.body, 0, c.yf - 0.38, c.zc + 0.2);
    put(g, rb(0.62, 0.52, H.z1 - 0.2, 0.1), mt.dark, 0, H.yb - 0.24, (H.z1 + 0.2) / 2);
    put(g, rb(2 * xf - Wf + 0.1, 0.2, 0.3, 0.06), mt.steel, 0, Rf, WB); put(g, rb(0.5, 0.3, 0.55, 0.08), mt.dark, 0, Rf + 0.1, WB);
    for (const s of [-1, 1]) { rod(g, mt.steel, [s * 0.3, Rf + 0.1, WB + 0.2], [s * (xf - Wf / 2 - 0.08), Rf + 0.12, WB + 0.22], 0.028, 8); cylX(g, mt.chrome, 0.045, Wf * 0.55, s * (xf - Wf / 2 - 0.04), Rf, WB, 12); }
    // капот: плавный лофт с зауженным верхом
    const secs = [], N = 8;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), z = lerp(H.z0, H.z1, t), yt = lerp(H.yt0, H.yt1, Math.pow(t, H.curve)) - (i === N - 1 ? 0.04 : 0), wb = lerp(H.wb0, H.wb1, t), wt = lerp(H.wt0, H.wt1, t) - (i === N - 1 ? 0.03 : 0);
      secs.push(sec(z, H.yb + (i === N - 1 ? 0.03 : 0), yt, wb, wt, [0.05, 0.05, 0.13, 0.13]));
    }
    put(g, loft(secs), mt.body, 0, 0, 0);
    const hw_at = (z, y) => { const t = clamp((z - H.z0) / (H.z1 - H.z0), 0, 1), yt = lerp(H.yt0, H.yt1, Math.pow(t, H.curve)), f = clamp((y - H.yb) / (yt - H.yb), 0, 1); return lerp(lerp(H.wb0, H.wb1, t), lerp(H.wt0, H.wt1, t), f) / 2; };
    const slope = Math.atan(((H.wb0 - H.wt0) / 2) / (H.yt0 - H.yb));
    // решётка, фары, бампер
    const zf = H.z1 + 0.003, gy = lerp(H.yb, H.yt1, modern ? 0.52 : 0.5), gw = H.wt1 * (modern ? 0.86 : 0.72), gh = (H.yt1 - H.yb) * (modern ? 0.72 : 0.62);
    decal(g, grilleMat(modern, o.accent || '#c8c8c8'), gw, gh, 0, gy, zf + 0.003, 0, 0);
    if (!modern) {
      for (const s of [-1, 1]) {
        const lx = s * (H.wt1 / 2 + 0.02), ly = H.yt1 - 0.2, lz = H.z1 - 0.02;
        put(g, cyg(0.12, 0.12, 0.09, 24), mt.chrome, lx, ly, lz, PI / 2); put(g, new T.SphereGeometry(0.1, 20, 8, 0, PI * 2, 0, PI / 2), mt.lamp, lx, ly, lz + 0.03, PI / 2, 0, 0).scale.set(1, 0.55, 1);
        put(g, rb(0.07, 0.07, 0.07, 0.02), mt.amber, s * (H.wb1 / 2 + 0.01), H.yb + 0.08, lz + 0.01);
      }
      put(g, rb(H.wb1 + 0.12, 0.1, 0.1, 0.03), mt.chrome, 0, H.yb - 0.02, H.z1 + 0.02);
    } else {
      for (const s of [-1, 1]) {
        const lx = s * (H.wt1 / 2 - 0.02), ly = H.yt1 - 0.15, lz = H.z1 - 0.12;
        put(g, rb(0.36, 0.2, 0.2, 0.05), mt.dark, lx, ly, lz); put(g, rb(0.3, 0.07, 0.04, 0.02), mt.lamp, lx, ly + 0.04, lz + 0.1); put(g, rb(0.3, 0.025, 0.04, 0.01), mt.lamp, lx, ly - 0.05, lz + 0.1);
        for (let k = -1; k <= 1; k++) put(g, cyg(0.025, 0.025, 0.03, 10), mt.lamp, lx + k * 0.1, ly - 0.015, lz + 0.115, PI / 2);
        put(g, rb(0.08, 0.14, 0.08, 0.02), mt.amber, s * (H.wb1 / 2 + 0.02), H.yb + 0.15, H.z1 - 0.05);
      }
      put(g, rb(H.wb1 + 0.1, 0.22, 0.14, 0.05), mt.dark, 0, H.yb - 0.05, H.z1 + 0.03);
      put(g, rb(H.wb1 * 0.7, 0.04, 0.05, 0.015), mt.chrome, 0, H.yb + 0.06, H.z1 + 0.11);
    }
    // линия-перегиб на капоте и воздухозаборник; боковые решётки
    for (const s of [-1, 1]) {
      const zc = (H.z0 + H.z1) / 2 - 0.1, yy = H.yb + 0.28, hwid = hw_at(zc, yy) + 0.006;
      decal(g, hoodDecal(o.label || 'N150', '#' + new T.Color(col.body).getHexString(), o.stripe || '#f2c418', '#ffffff'), 1.3, 0.24, s * hwid, yy, zc, s * PI / 2, s * slope);
    }
    // выхлопная труба и предочиститель
    { const ex = 0.42, ez = H.z0 + 0.65 + (modern ? 0.2 : 0), by = H.yb + 0.15, top = c.yr - (modern ? 0.2 : 0.45);
      const sx_ = modern ? c.W / 2 + 0.06 : ex; const sz_ = modern ? c.zc + c.L / 2 - 0.15 : ez;
      cylY(g, mt.chrome, 0.05, top - by, sx_, (top + by) / 2, sz_, 14); put(g, cyg(0.045, 0.075, 0.12, 14), mt.chrome, sx_, top + 0.05, sz_);
      put(g, rb(0.14, 0.012, 0.12, 0.004), mt.dark, sx_, top + 0.13, sz_, 0.5);
      for (const k of [0.25, 0.7]) put(g, rb(0.14, 0.05, 0.1, 0.015), mt.dark, sx_ - (modern ? 0.03 : 0.0), by + (top - by) * k, sz_ - 0.04); }
    // кабина
    const cb = buildCab(g, mt, c, modern, lights);
    // крылья (задние всегда, передние у современного)
    for (const s of [-1, 1]) {
      put(g, sx(fenderPts(0, Rr, Rr, 14, 168, 0.04, 0.05), Wr + 0.14), mt.body, s * xr, 0, 0);
      put(g, rb(0.05, 0.08, 0.7, 0.02), mt.dark, s * (xr - Wr / 2 - 0.02), Rr + Rr + 0.03, -0.1);
      if (modern) { put(g, sx(fenderPts(WB, Rf, Rf, 24, 160, 0.035, 0.05), Wf + 0.14), mt.body, s * xf, 0, 0);
        put(g, rb(0.14, 0.04, 0.3, 0.015), mt.dark, s * (xf - Wf / 2 + 0.03), Rf * 2 + 0.1, WB); }
    }
    // ступеньки слева, топливный бак справа
    for (let i = 0; i < 2; i++) put(g, rb(0.42, 0.045, 0.34, 0.015), mt.dark, -(c.W / 2 - 0.1), 0.38 + i * 0.36, c.zc + 0.4);
    put(g, rb(0.05, 0.75, 0.3, 0.02), mt.dark, -(c.W / 2 - 0.3), 0.7, c.zc + 0.4);
    cylZ(g, mt.dark, 0.26, 0.9, c.W / 2 - 0.08, c.yf - 0.3, c.zc + 0.75, 20);
    // передние грузы (L2+) или передний навес современного
    if (!modern && lv >= 2) { put(g, rb(0.46, 0.34, 0.26, 0.04), mt.dark, 0, H.yb - 0.02, H.z1 + 0.2); for (let i = 0; i < 3; i++) put(g, rb(0.62, 0.12, 0.26, 0.03), mt.steel, 0, H.yb - 0.2 + i * 0.13, H.z1 + 0.34); put(g, rb(0.06, 0.1, 0.1, 0.02), mt.chrome, 0, H.yb + 0.28, H.z1 + 0.34); }
    if (modern) {
      for (const s of [-1, 1]) { beam(g, mt.dark, [s * 0.34, 0.62, H.z1 - 0.2], [s * 0.42, 0.55, H.z1 + 0.65], 0.09, 0.08, 0.03); hyd(g, mt.dark, mt.chrome, [s * 0.6, 0.55, H.z1 - 0.1], [s * 0.45, 0.62, H.z1 + 0.4], 0.04); }
      put(g, rb(1.1, 0.12, 0.1, 0.03), mt.steel, 0, 0.58, H.z1 + 0.66);
    }
    // задняя навеска, ВОМ, прицепная скоба
    const hz = D.hitchZ, hy = D.hitchY;
    for (const s of [-1, 1]) {
      beam(g, mt.steel, [s * 0.46, 0.64, c.zc - c.L / 2 - 0.02], [s * 0.62, 0.52, hz + 0.25], 0.075, 0.07, 0.03);
      put(g, new T.SphereGeometry(0.06, 10, 8), mt.chrome, s * 0.62, 0.52, hz + 0.25);
      beam(g, mt.body, [s * 0.74, 1.05, c.zc - c.L / 2 + 0.2], [s * 0.74, 1.12, hz + 0.5], 0.09, 0.07, 0.03);
      rod(g, mt.steel, [s * 0.74, 1.08, hz + 0.55], [s * 0.66, 0.6, hz + 0.28], 0.025, 8);
      hyd(g, mt.dark, mt.chrome, [s * 0.5, 0.78, c.zc - c.L / 2 + 0.25], [s * 0.72, 1.02, hz + 1.05], 0.045);
    }
    beam(g, mt.steel, [0, 1.15, c.zc - c.L / 2 - 0.02], [0, 0.98, hz + 0.45], 0.07, 0.07, 0.03);
    put(g, rb(0.12, 0.16, 0.2, 0.03), mt.dark, 0, 0.72, c.zc - c.L / 2 + 0.02);
    cylZ(g, mt.chrome, 0.035, 0.22, 0, 0.84, c.zc - c.L / 2 - 0.1, 12);
    put(g, rb(0.3, 0.06, 0.8, 0.02), mt.steel, 0, hy, hz + 0.46); put(g, cyg(0.035, 0.035, 0.12, 12), mt.chrome, 0, hy + 0.04, hz + 0.18);
    return { g, mt, hz, hy };
  }



  // ------------------------------------------------------------------ навесное/прицепное: дисковая борона (L1-3)
  const DISC = (() => { let c; return () => c || (c = new T.LatheGeometry([new T.Vector2(0.001, 0), new T.Vector2(0.55, 0.04), new T.Vector2(1, 0.12)], 12)); })();
  const hoseM = () => pmat(0x232528, { metalness: 0.0, roughness: 0.7 });
  /** Трёхточечная сцепка: eye на (0,hy,0), всё тянется в -Z. */
  function drawbarA(g, mt, hy, wf, zf, yb) {
    for (const s of [-1, 1]) beam(g, mt.body, [s * 0.04, hy + 0.04, -0.05], [s * wf, yb, zf], 0.11, 0.1, 0.03);
    put(g, new T.TorusGeometry(0.1, 0.035, 8, 16), mt.chrome, 0, hy + 0.06, -0.06, PI / 2);
    put(g, rb(0.3, 0.07, 0.34, 0.02), mt.steel, 0, hy + 0.02, -0.16);
    beam(g, mt.body, [-wf, yb, zf], [wf, yb, zf], 0.2, 0.16, 0.04);
  }
  function buildDisc(g, mt, W, hy) {
    const dm = pmat(0xa7adb3, { metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9, side: T.DoubleSide });
    const zf = -2.2, zr = -3.9, yb = 0.98;
    drawbarA(g, mt, hy, 0.8, zf, yb);
    // рама: поперечные и продольные балки
    for (const z of [zf, zr]) beam(g, mt.body, [-W * 0.46, yb, z], [W * 0.46, yb, z], 0.2, 0.2, 0.04);
    for (const x of [-W * 0.36, -W * 0.18, 0, W * 0.18, W * 0.36]) beam(g, mt.body, [x, yb, zf], [x, yb, zr], 0.14, 0.16, 0.03);
    // батареи дисков: два ряда «Х»
    const A = new Acc(), AX = new Acc(), n = Math.floor(W / 2 / 0.27), gz = [-2.75, -3.35];
    for (let r = 0; r < 2; r++) for (const h of [-1, 1]) {
      const yaw = (r === 0 ? 1 : -1) * h * rad(11), dx = h * Math.cos(yaw), dz = -Math.sin(yaw) * Math.abs(h), x0 = h * 0.14, len = W / 2 - 0.2;
      for (let i = 0; i < n; i++) { const sp = (i + 0.5) * len / n; A.at(DISC(), x0 + dx * sp, 0.31, gz[r] + dz * sp * (h > 0 ? 1 : 1), 0, yaw, PI / 2, 0.31); }
      const e = [x0 + dx * len, 0.31, gz[r] + dz * len], b0 = [x0, 0.31, gz[r]];
      rod(g, mt.steel, b0, e, 0.04, 8);
      for (const f of [0.15, 0.5, 0.85]) { const hx = lerp(b0[0], e[0], f), hz = lerp(b0[2], e[2], f); beam(g, mt.dark, [hx, 0.31, hz], [hx, yb - 0.1, lerp(r === 0 ? zf : zr, hz, 0.35)], 0.06, 0.1, 0.02); }
    }
    g.add(A.mesh(dm));
    // каток-прикатыватель из колец
    const ry = 0.29, rz = -4.45;
    for (const h of [-1, 1]) {
      const x0 = h * 0.06, x1 = h * (W * 0.47); cylX(g, mt.dark, ry - 0.03, Math.abs(x1 - x0), (x0 + x1) / 2, ry, rz, 14);
      const nr = Math.floor(Math.abs(x1 - x0) / 0.5); for (let i = 0; i < nr; i++) AX.at(cyg(ry + 0.02, ry + 0.02, 0.07, 10), x0 + h * (i + 0.5) * Math.abs(x1 - x0) / nr, ry, rz, 0, 0, PI / 2);
    }
    g.add(AX.mesh(mt.steel));
    for (const x of [-W * 0.4, -W * 0.15, W * 0.15, W * 0.4]) { beam(g, mt.body, [x, yb, zr], [x, ry + 0.1, rz + 0.05], 0.09, 0.1, 0.03); beam(g, mt.dark, [x, ry, rz + 0.05], [x, ry, rz], 0.07, 0.07, 0.02); }
    // опорные колёса и гидроцилиндр подъёма
    for (const s of [-1, 1]) { wheel(g, mt, s, s * (W * 0.5 - 0.1), zf - 0.1, 0.36, 0.24, mt.trim, { rimK: 0.5, lugs: 0, seg: 16, nuts: 0 }); beam(g, mt.dark, [s * (W * 0.5 - 0.45), yb, zf - 0.1], [s * (W * 0.5 - 0.2), 0.4, zf - 0.1], 0.08, 0.1, 0.02); beam(g, mt.body, [s * (W * 0.46), yb, zf], [s * (W * 0.46 - 0.4), yb, zf - 0.1], 0.1, 0.1, 0.03); }
    hyd(g, mt.dark, mt.chrome, [0, 1.12, -0.95], [0, 1.0, -2.0], 0.05);
    // шланги от трактора
    for (const s of [-1, 1]) hose(g, hoseM(), [[s * 0.14, 0.82, 0.95], [s * 0.18, 0.6, 0.35], [s * 0.15, 0.8, -0.55], [s * 0.06, 1.12, -0.95]], 0.017, 16, 5);
    // световой щит сзади
    put(g, rb(0.9, 0.3, 0.04, 0.01), mt.dark, 0, 0.9, zr - 0.62); decal(g, hazardRW(3, 1), 0.84, 0.24, 0, 0.9, zr - 0.64, PI);
  }

  /** Сборка трактора L1-3 с дисковой бороной. */
  function tractorTier0(lv) {
    const root = begin(), t = tOf(lv), k = lerp(0.94, 1.05, t);
    const w = buildWheeled({ modern: false, lv, lights: lv >= 3 ? 2 : (lv >= 2 ? 1 : 0), label: 'N' + (110 + lv * 20), col: { body: 0x2a7d32, trim: 0xf2c418, roof: 0x2a7d32 }, accent: '#f2c418' });
    w.g.scale.setScalar(k); root.add(w.g);
    const ig = new T.Group(); ig.position.set(0, 0, (w.hz + 0.18) * k); buildDisc(ig, w.mt, 5.4 + 0.6 * (lv - 1), w.hy * k); root.add(ig);
    return finish(root, 0x86aebd, k);
  }



  // ------------------------------------------------------------------ гусеничный трактор (L7-10)
  const DT = { zf: 2.1, zr: -2.0, xt: 1.17, Wt: 0.76,
    hood: { z0: 0.78, z1: 4.05, yb: 1.30, yt0: 2.66, yt1: 2.16, wb0: 1.62, wb1: 1.52, wt0: 1.3, wt1: 1.18, curve: 1.1 },
    cab: { zc: -0.55, L: 2.2, W: 1.64, yf: 1.66, yr: 3.66, rake: 0.42 }, hitchZ: -4.55, hitchY: 0.88 };
  function hull2(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  /** Резиновая гусеница: лента-кольцо по выпуклой оболочке катков, грунтозацепы, ведущее колесо, направляющие и опорные катки. */
  function buildTrack(g, mt, x, zc, W) {
    const tb = 0.1, wh = [{ z: 0.84, y: 0.54, r: 0.44 }, { z: -0.84, y: 0.54, r: 0.44 }, { z: 0, y: 1.16, r: 0.36 }];
    const cp = (r) => { const a = []; for (const w of wh) for (let i = 0; i < 14; i++) { const t = i / 14 * PI * 2; a.push([w.z + (w.r + r) * Math.cos(t), w.y + (w.r + r) * Math.sin(t)]); } return hull2(a); };
    const outer = cp(tb), inner = cp(0.0);
    const sh = new T.Shape(outer.map((p) => new T.Vector2(p[0], p[1]))); sh.holes.push(new T.Path(inner.map((p) => new T.Vector2(p[0], p[1])).reverse()));
    const bg = new T.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false, curveSegments: 1 }); bg.translate(0, 0, -W / 2); bg.rotateY(-PI / 2);
    put(g, crease(bg, 35), mt.rubber, x, 0, zc);
    // грунтозацепы вдоль внешнего контура
    const cl = new Acc(), box = new T.BoxGeometry(1, 1, 1); let per = 0; const seg = []; for (let i = 0; i < outer.length; i++) { const a = outer[i], b = outer[(i + 1) % outer.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); per += l; }
    const nc = Math.round(per / 0.19), step = per / nc; let acc = 0, si = 0;
    for (let k = 0; k < nc; k++) {
      const d = k * step; while (si < seg.length - 1 && acc + seg[si] < d) { acc += seg[si]; si++; }
      const a = outer[si], b = outer[(si + 1) % outer.length], t = (d - acc) / (seg[si] || 1), px = lerp(a[0], b[0], t), py = lerp(a[1], b[1], t), dz = (b[0] - a[0]) / seg[si], dy = (b[1] - a[1]) / seg[si], al = Math.atan2(-dy, dz);
      cl.at(box, x, py + dz * 0.045, zc + px - dy * 0.045, al, 0, 0, W * 0.97, 0.075, 0.1);
    }
    g.add(cl.mesh(mt.rubber));
    // колёса внутри ленты
    const hw = W * 0.5 - 0.06;
    for (const w of wh) { const y = w.y, z = zc + w.z; cylX(g, mt.steel, w.r, hw * 2, x, y, z, 18); }
    for (const s of [-1, 1]) {
      const ox = x + s * (W / 2 - 0.02);
      for (const w of wh) { const sp = w === wh[2]; cylX(g, sp ? mt.dark : mt.steel, w.r * 0.97 + 0.02, 0.06, ox - s * 0.04, w.y, zc + w.z, 18); cylX(g, mt.body, w.r * 0.34, 0.07, ox - s * 0.02, w.y, zc + w.z, 12); }
      for (const dz of [-0.52, -0.18, 0.18, 0.52]) { cylX(g, mt.steel, 0.235, hw * 2, x, 0.345, zc + dz, 12); cylX(g, mt.dark, 0.17, 0.06, ox - s * 0.04, 0.345, zc + dz, 10); }
    }
    // зубья ведущей звёздочки
    const tt = new Acc(), tb2 = new T.BoxGeometry(0.1, 0.1, 0.16); for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; tt.at(tb2, x, wh[2].y + Math.sin(a) * 0.37, zc + Math.cos(a) * 0.37, -a + PI / 2, 0, 0, W * 0.8 / 0.1, 1, 1); }
    g.add(tt.mesh(mt.dark));
    // рама катков (внутренняя стенка)
    put(g, rb(0.08, 0.5, 1.9, 0.03), mt.dark, x - (W / 2 - 0.1) * Math.sign(x), 0.8, zc);
  }
  function exhaustStack(g, mt, x, z, by, top, chromeTop) {
    cylY(g, mt.chrome, 0.055, top - by, x, (top + by) / 2, z, 12); put(g, cyg(0.05, 0.085, 0.13, 12), mt.chrome, x, top + 0.05, z);
    put(g, rb(0.15, 0.012, 0.13, 0.004), mt.dark, x, top + 0.14, z, 0.5);
    for (const k of [0.3, 0.75]) put(g, rb(0.13, 0.05, 0.1, 0.015), mt.dark, x - 0.03, by + (top - by) * k, z - 0.05);
  }
  function hoodLoft(H, N) {
    const secs = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), z = lerp(H.z0, H.z1, t), yt = lerp(H.yt0, H.yt1, Math.pow(t, H.curve)) - (i === N - 1 ? 0.04 : 0), wb = lerp(H.wb0, H.wb1, t), wt = lerp(H.wt0, H.wt1, t) - (i === N - 1 ? 0.03 : 0);
      secs.push(sec(z, H.yb + (i === N - 1 ? 0.03 : 0), yt, wb, wt, [0.05, 0.05, 0.14, 0.14]));
    }
    return loft(secs);
  }

  function buildTracked(o) {
    const g = begin(), D = DT, lv = o.lv, H = D.hood, c = D.cab, W = D.Wt;
    const mt = { body: paint(o.col.body), trim: paint(o.col.trim), roof: paint(o.col.roof), dark: pmat(0x1b1d20, { metalness: 0.25, roughness: 0.5, envMapIntensity: 0.5 }), steel: metal(0x5f656c, { roughness: 0.45 }), chrome: chromeM(), rubber: rubberM(), lamp: lightM(0xfff3cf), amber: lightM(0xffa51f) };
    for (const s of [-1, 1]) { buildTrack(g, mt, s * D.xt, D.zf, W); buildTrack(g, mt, s * D.xt, D.zr, W); }
    // рамы и оси
    put(g, rb(1.4, 0.56, 3.3, 0.1), mt.dark, 0, 1.1, 2.3); put(g, rb(1.4, 0.56, 3.0, 0.1), mt.dark, 0, 1.1, -2.25);
    cylX(g, mt.steel, 0.16, 2 * D.xt - W + 0.1, 0, 1.16, D.zf, 14); cylX(g, mt.steel, 0.16, 2 * D.xt - W + 0.1, 0, 1.16, D.zr, 14);
    // шарнир сочленения: гофрированная «гармошка» и два цилиндра поворота
    cylZ(g, mt.rubber, 0.5, 1.5, 0, 1.18, -0.02, 16); for (let i = 0; i < 6; i++) put(g, new T.TorusGeometry(0.5, 0.05, 6, 16), mt.rubber, 0, 1.18, -0.7 + i * 0.28);
    for (const s of [-1, 1]) hyd(g, mt.dark, mt.chrome, [s * 0.72, 1.05, 0.95], [s * 0.88, 1.05, -0.8], 0.07);
    // капот
    put(g, hoodLoft(H, 8), mt.body, 0, 0, 0);
    const hw_at = (z, y) => { const t = clamp((z - H.z0) / (H.z1 - H.z0), 0, 1), yt = lerp(H.yt0, H.yt1, Math.pow(t, H.curve)), f = clamp((y - H.yb) / (yt - H.yb), 0, 1); return lerp(lerp(H.wb0, H.wb1, t), lerp(H.wt0, H.wt1, t), f) / 2; };
    const slope = Math.atan(((H.wb0 - H.wt0) / 2) / (H.yt0 - H.yb));
    decal(g, grilleMat(true, o.accent), H.wt1 * 0.86, (H.yt1 - H.yb) * 0.78, 0, lerp(H.yb, H.yt1, 0.5), H.z1 + 0.006, 0, 0);
    for (const s of [-1, 1]) {
      const lx = s * (H.wt1 / 2 - 0.04), ly = H.yt1 - 0.14, lz = H.z1 - 0.14;
      put(g, rb(0.42, 0.24, 0.24, 0.06), mt.dark, lx, ly, lz); put(g, rb(0.36, 0.08, 0.04, 0.02), mt.lamp, lx, ly + 0.05, lz + 0.12); put(g, rb(0.36, 0.03, 0.04, 0.01), mt.lamp, lx, ly - 0.06, lz + 0.12);
      for (let k = -1; k <= 1; k++) put(g, cyg(0.03, 0.03, 0.03, 10), mt.lamp, lx + k * 0.12, ly - 0.015, lz + 0.13, PI / 2);
      const zc = 2.0, yy = H.yb + 0.78, hwid = hw_at(zc, yy) + 0.006;
      decal(g, hoodDecal(o.label, '#' + new T.Color(o.col.body).getHexString(), o.stripe, '#ffffff'), 1.7, 0.31, s * hwid, yy, zc, s * PI / 2, s * slope);
    }
    // бампер с предупреждающими полосами, передние грузы
    put(g, rb(2.4, 0.46, 0.36, 0.09), mt.dark, 0, 1.0, H.z1 + 0.12); decal(g, hazardRW(1.2, 0.8), 0.62, 0.4, -0.88, 1.0, H.z1 + 0.305, 0, 0); decal(g, hazardRW(1.2, 0.8), 0.62, 0.4, 0.88, 1.0, H.z1 + 0.305, 0, 0);
    put(g, rb(1.1, 0.12, 0.22, 0.03), mt.steel, 0, 0.72, H.z1 + 0.18); if (lv >= 9) for (let i = 0; i < 3; i++) put(g, rb(0.9, 0.14, 0.3, 0.03), mt.steel, 0, 0.55 + i * 0.0, H.z1 + 0.34 + i * 0.0 - i * 0.0);
    // крылья над гусеницами
    for (const s of [-1, 1]) for (const zc of [D.zf, D.zr]) {
      put(g, sx([[-1.42, 1.34], [-1.2, 1.62], [-0.6, 1.76], [0.6, 1.76], [1.2, 1.62], [1.42, 1.34], [1.3, 1.34], [1.1, 1.54], [0.55, 1.66], [-0.55, 1.66], [-1.1, 1.54], [-1.3, 1.34]], 0.95), mt.body, s * (D.xt + 0.03), 0, zc);
    }
    // кабина (большая, с остеклением), выхлоп вдоль стойки
    put(g, rb(1.62, 0.55, 2.4, 0.1), mt.body, 0, 1.38, c.zc);
    const cb = buildCab(g, mt, c, true, o.lights);
    exhaustStack(g, mt, c.W / 2 + 0.07, c.zc + c.L / 2 - 0.12, 2.0, c.yr - 0.15);
    // задняя часть: капот-крышка бака, ящики
    put(g, loft([sec(-1.8, 1.32, 1.98, 1.5, 1.4, [0.05, 0.05, 0.12, 0.12]), sec(-2.5, 1.32, 1.94, 1.5, 1.38, [0.05, 0.05, 0.12, 0.12]), sec(-3.2, 1.32, 1.78, 1.42, 1.3, [0.05, 0.05, 0.12, 0.12]), sec(-3.62, 1.36, 1.66, 1.3, 1.16, [0.05, 0.05, 0.12, 0.12])]), mt.body, 0, 0, 0);
    cylY(g, mt.chrome, 0.09, 0.09, 0.5, 2.0, -2.3, 14); cylY(g, mt.dark, 0.09, 0.07, -0.5, 2.0, -2.3, 14);
    // лестница слева
    for (let i = 0; i < 3; i++) put(g, rb(0.5, 0.05, 0.36, 0.02), mt.dark, -(c.W / 2 + 0.2), 0.72 + i * 0.32, c.zc + 0.5); put(g, rb(0.05, 0.95, 0.3, 0.02), mt.dark, -(c.W / 2 - 0.02), 1.1, c.zc + 0.5);
    // задняя тяга: сцепное устройство
    const hz = D.hitchZ, hy = D.hitchY;
    put(g, rb(0.5, 0.15, 1.15, 0.04), mt.steel, 0, hy - 0.02, hz + 0.4); for (const s of [-1, 1]) beam(g, mt.dark, [s * 0.5, 1.15, -3.3], [s * 0.22, hy, hz + 0.7], 0.13, 0.12, 0.03);
    cylY(g, mt.chrome, 0.045, 0.3, 0, hy + 0.04, hz + 0.18, 12); cylZ(g, mt.chrome, 0.04, 0.24, 0, 1.18, -3.74, 12);
    return { g, mt, hz, hy };
  }


  // ------------------------------------------------------------------ широкие орудия: сеялка-культиватор (L4-6) и сеялка с крыльями (L7-10)
  const DISCF = (() => { let c; return () => c || (c = new T.CylinderGeometry(0.14, 1, 0.13, 12, 1, true)); })();
  const COULT = (() => { let c; return () => c || (c = new T.CylinderGeometry(1, 1, 0.1, 10)); })();
  const BOX1 = new T.BoxGeometry(1, 1, 1);
  /** Простое колесо орудия: покрышка + диск + колпак. */
  const WSC = {};
  function wheelS(g, mt, side, x, z, R, W, rimMat) {
    const key = R + '|' + W; let G = WSC[key];
    if (!G) { const hw = W / 2, r0 = R * 0.5, P = (r, y) => new T.Vector2(r, y); G = WSC[key] = { c: new T.LatheGeometry([P(r0, -hw * 0.8), P(R * 0.78, -hw), P(R * 0.96, -hw * 0.72), P(R, -hw * 0.4), P(R, hw * 0.4), P(R * 0.96, hw * 0.72), P(R * 0.78, hw), P(r0, hw * 0.8)], 18), r: cyg(R * 0.52, R * 0.52, W * 0.9, 14), h: cyg(R * 0.17, R * 0.2, W * 1.04, 8) }; }
    const wg = new T.Group(); wg.position.set(x, R, z); wg.rotation.set(0, 0, side > 0 ? -PI / 2 : PI / 2);
    wg.add(mesh(G.c, mt.rubber)); wg.add(mesh(G.r, rimMat)); wg.add(mesh(G.h, mt.steel)); g.add(wg); return wg;
  }
  function buildBar(root, mt, P) {
    const { W, Wc, L1, hy, big, lv } = P, wl = (W - Wc) / 2, yb = big ? 1.1 : 1.0, ang = big ? 0.12 : 0.05, bw = big ? 0.3 : 0.2;
    const zA = -L1, zD = zA - (big ? 0.7 : 0.55), zM = zA - (big ? 1.7 : 1.4), zC = zM - 0.12, zB = zA - (big ? 2.9 : 2.4), zR = zA - (big ? 3.7 : 3.1), ry = big ? 0.34 : 0.29;
    const dm = pmat(0xa7adb3, { metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9, side: T.DoubleSide });
    const wheelsX = big ? [Wc / 2 - 0.55, Wc / 2 - 1.25, -(Wc / 2 - 0.55), -(Wc / 2 - 1.25)] : [Wc / 2 - 0.45, -(Wc / 2 - 0.45)];
    const wheelZs = big ? [zM + 0.35, zM - 0.35] : [zM];
    const skip = (x) => { for (const wx of wheelsX) if (Math.abs(x - wx) < 0.42) return true; return false; };
    // дышло (А-образная рама)
    const hb = big ? 0.55 : 0.5;
    for (const s of [-1, 1]) beam(root, mt.dark, [s * 0.05, hy + 0.05, -0.05], [s * hb, yb, zA], big ? 0.2 : 0.14, big ? 0.18 : 0.14, 0.03);
    beam(root, mt.dark, [-hb, yb, zA], [hb, yb, zA], big ? 0.3 : 0.2, big ? 0.28 : 0.2, 0.05);
    put(root, new T.TorusGeometry(0.11, 0.04, 8, 16), mt.chrome, 0, hy + 0.06, -0.06, PI / 2); put(root, rb(0.34, 0.08, 0.4, 0.02), mt.steel, 0, hy + 0.02, -0.18);
    rod(root, mt.steel, [0, hy, -0.5], [0, 0.0, -0.9], 0.05, 8); put(root, cyg(0.12, 0.12, 0.04, 10), mt.steel, 0, 0.02, -0.9);   // опорная стойка
    // секция рамы со всеми рабочими органами между x0 и x1 (в координатах орудия)
    function section(gx, x0, x1, skipWheels) {
      const len = Math.abs(x1 - x0), sg = Math.sign(x1 - x0), xm = (x0 + x1) / 2;
      for (const z of [zA, zM, zB]) beam(gx, mt.dark, [x0, yb, z], [x1, yb, z], bw, bw, 0.04);
      for (const f of [0.1, 0.5, 0.9]) beam(gx, mt.dark, [lerp(x0, x1, f), yb, zA], [lerp(x0, x1, f), yb, zB], 0.14, 0.14, 0.03);
      // передние диски на оси
      const D1 = new Acc(), U1 = new Acc(), dp = big ? 0.36 : 0.32, nd = Math.floor(len / dp);
      for (let i = 0; i < nd; i++) { const x = x0 + sg * (i + 0.5) * len / nd; if (skipWheels && skip(x)) continue; D1.at(DISCF(), x, 0.26, zD, 0, 0, PI / 2, 0.25, 1, 0.25); }
      gx.add(D1.mesh(dm)); rod(gx, mt.steel, [x0, 0.26, zD], [x1, 0.26, zD], 0.035, 8);
      for (const f of [0.15, 0.5, 0.85]) beam(gx, mt.dark, [lerp(x0, x1, f), yb, zA], [lerp(x0, x1, f), 0.3, zD], 0.07, 0.1, 0.02);
      // сошники-диски на стойках
      const cp = big ? 0.34 : 0.3, nc = Math.floor(len / cp);
      for (let i = 0; i < nc; i++) {
        const x = x0 + sg * (i + 0.5) * len / nc; if (skipWheels && skip(x)) continue;
        U1.at(COULT(), x, 0.2, zC, 0, 0, PI / 2, 0.17, 1, 0.17);
        const dy = yb - 0.1 - 0.25, dz = zM - zC, l = Math.hypot(dy, dz) + 0.05; U1.at(BOX1, x, (yb - 0.1 + 0.25) / 2, (zM + zC) / 2, Math.atan2(dz, dy), 0, 0, 0.045, l, 0.07);
      }
      gx.add(U1.mesh(mt.steel));
      // каток-прикатыватель из колец
      const AX = new Acc(), nr = Math.floor(len / 0.5); cylX(gx, mt.dark, ry - 0.03, len, xm, ry, zR, 12);
      for (let i = 0; i < nr; i++) AX.at(cyg(ry + 0.03, ry + 0.03, 0.08, 10), x0 + sg * (i + 0.5) * len / nr, ry, zR, 0, 0, PI / 2);
      gx.add(AX.mesh(mt.steel));
      for (const f of [0.12, 0.5, 0.88]) { const x = lerp(x0, x1, f); beam(gx, mt.dark, [x, yb, zB], [x, ry + 0.12, zR + 0.05], 0.08, 0.1, 0.02); }
    }
    section(root, -Wc / 2, Wc / 2, true);
    for (const x of wheelsX) for (const z of wheelZs) { wheelS(root, mt, x > 0 ? 1 : -1, x, z, big ? 0.58 : 0.5, big ? 0.46 : 0.4, mt.trim); beam(root, mt.dark, [x, yb, z], [x, 0.5, z], 0.1, 0.1, 0.03); }
    // крылья на шарнирах с цилиндрами складывания
    for (const s of [-1, 1]) {
      const pv = new T.Group(); pv.position.set(s * Wc / 2, yb, 0); pv.rotation.z = s * ang; const inner = new T.Group(); inner.position.set(-s * Wc / 2, -yb, 0); pv.add(inner); root.add(pv);
      section(inner, s * Wc / 2, s * W / 2, false);
      for (const z of [zA, zM, zB]) put(inner, rb(0.2, 0.34, 0.34, 0.04), mt.steel, s * Wc / 2 + s * 0.05, yb, z);
      wheelS(inner, mt, s > 0 ? 1 : -1, s * (Wc / 2 + wl * 0.6), zM, big ? 0.4 : 0.34, 0.3, mt.trim); beam(inner, mt.dark, [s * (Wc / 2 + wl * 0.6), yb, zM], [s * (Wc / 2 + wl * 0.6), 0.4, zM], 0.08, 0.09, 0.02);
      if (big) { wheelS(inner, mt, s > 0 ? 1 : -1, s * (Wc / 2 + wl * 0.9), zM, 0.34, 0.26, mt.trim); beam(inner, mt.dark, [s * (Wc / 2 + wl * 0.9), yb, zM], [s * (Wc / 2 + wl * 0.9), 0.34, zM], 0.07, 0.08, 0.02); }
      put(inner, rb(0.2, 0.2, 0.2, 0.03), mt.steel, s * (Wc / 2 + 1.1), yb + 0.2, zM);
      hyd(root, mt.dark, mt.chrome, [s * (Wc / 2 - 0.55), yb + 0.55, zM], [s * (Wc / 2 + 1.1 * Math.cos(ang)), yb + 0.2 * Math.cos(ang) + 1.1 * Math.sin(ang), zM], big ? 0.07 : 0.055);
      beam(root, mt.dark, [s * (Wc / 2 - 0.55), yb, zM], [s * (Wc / 2 - 0.55), yb + 0.55, zM], 0.1, 0.1, 0.02);
      // маркёрные щитки и габаритные огни на концах
      const ex = s * (W / 2 - 0.15);
      put(inner, rb(0.9, 0.5, 0.05, 0.01), mt.dark, ex, yb + 0.35, zB - 0.25); decal(inner, hazardRW(3, 1.4), 0.84, 0.44, ex, yb + 0.35, zB - 0.28, PI);
      beam(inner, mt.dark, [ex, yb, zB], [ex, yb + 0.35, zB - 0.25], 0.06, 0.06, 0.02);
    }
    // бункер: профиль-лофт со скошенной передней стенкой, люки, лестница и площадка
    const hl = big ? 1.75 : 1.2, hwT = big ? 4.9 : 2.5, hwB = big ? 1.5 : 1.0, zh = zA - (big ? 1.5 : 1.15), y0 = yb + (big ? 0.3 : 0.3), y1 = yb + (big ? 2.0 : 1.5);
    const R1 = [0.05, 0.05, 0.14, 0.14];
    put(root, loft([sec(zh - hl, y0 + 0.28, y1 - 0.2, hwB * 0.7, hwT * 0.86, R1), sec(zh - hl + 0.14, y0, y1, hwB, hwT, R1), sec(zh + hl - 0.4, y0, y1 - 0.05, hwB, hwT, R1), sec(zh + hl, y0 + 0.2, y1 - 0.5, hwB * 0.8, hwT * 0.9, R1)]), mt.body, 0, 0, 0);
    // питающие блоки под бункером и распределительная головка
    const nm = big ? 6 : 4; for (let i = 0; i < nm; i++) { const x = (i - (nm - 1) / 2) * (hwB / (nm - 1 || 1)) * 0.8; put(root, cyg(0.13, 0.1, 0.34, 12), mt.dark, x, y0 - 0.16, zh); }
    // крышки люков
    const hatches = big ? [-1.5, -0.5, 0.5, 1.5] : [-0.6, 0.6];
    for (const hx of hatches) { put(root, cyg(0.32, 0.34, 0.07, 16), mt.dark, hx, y1 + 0.04, zh - 0.3); put(root, cyg(0.12, 0.12, 0.06, 10), mt.chrome, hx, y1 + 0.1, zh - 0.3); }
    put(root, rb(hwT * 0.6, 0.08, 0.12, 0.03), mt.trim, 0, y1 + 0.02, zh + 0.6);
    // лестница сзади, поручни
    const lx = big ? 1.3 : 0.9, lz = zh - hl - 0.05;
    for (const dx of [-0.22, 0.22]) beam(root, mt.dark, [lx + dx, 0.55, lz - 0.28], [lx + dx, y1 - 0.15, lz - 0.02], 0.05, 0.05, 0.02);
    const nr2 = big ? 9 : 6; for (let i = 0; i < nr2; i++) { const f = (i + 0.5) / nr2; put(root, rb(0.42, 0.04, 0.06, 0.01), mt.steel, lx, lerp(0.7, y1 - 0.3, f), lerp(lz - 0.26, lz - 0.05, f)); }
    // шланги от бункера к рядам
    const nh = big ? 12 : 8; for (let i = 0; i < nh; i++) {
      const f = (i + 0.5) / nh, xo = (f - 0.5) * hwB * 0.8, xt = (f - 0.5) * (W * 0.82), sg = Math.sign(xt) || 1, ax = (f - 0.5) * Wc * 0.9;
      hose(root, hoseM(), [[xo, y0 - 0.3, zh + 0.02], [xo * 1.3, y0 - 0.5, zh + 0.5], [ax * 1.0, yb + 0.45, zM + 0.4 + (i % 2) * 0.12], [Math.abs(xt) < Wc / 2 ? xt : sg * (Wc / 2 - 0.05), yb + 0.18, zM + 0.05]], big ? 0.032 : 0.026, 10, 5);
    }
    // гидрошланги к тягачу
    for (const s of [-1, 1]) hose(root, hoseM(), [[s * 0.16, hy - 0.04, 0.9], [s * 0.2, hy + 0.1, 0.2], [s * 0.2, yb - 0.05, zA + 0.7], [s * 0.3, yb + 0.2, zA - 0.2]], big ? 0.026 : 0.02, 14, 5);
    // огни и номерная панель сзади по центру
    put(root, rb(1.0, 0.3, 0.05, 0.01), mt.dark, 0, ry + 0.4, zR - 0.4); decal(root, hazardRW(3, 1), 0.92, 0.24, 0, ry + 0.4, zR - 0.43, PI);
    return { zA, zh, y1, hl, hwT, yb };
  }

  const barDecal = (txt, bg, fg) => decalMat('bar|' + txt + bg, 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 78px "Arial Black",Impact,Arial,sans-serif'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(txt, 14, 70); g.fillStyle = fg; g.fillText(txt, 10, 66); g.fillStyle = fg; g.fillRect(8, 108, w - 16, 8); }, { alphaTest: 0.45 });

  /** Сборка L4-6: современный колёсный трактор + сеялка-культиватор ~9 м. */
  function tractorTier1(lv) {
    const root = begin(), t = tOf(lv), k = lerp(0.96, 1.06, t);
    const w = buildWheeled({ modern: true, lv, lights: lv >= 5 ? 2 : 1, label: 'M' + (200 + lv * 15), col: { body: 0x7cb518, trim: 0xc8201a, roof: 0x22262a }, accent: '#c8201a', stripe: '#c8201a' });
    w.g.scale.setScalar(k); root.add(w.g);
    const ig = new T.Group(); ig.position.set(0, 0, (w.hz + 0.18) * k); root.add(ig);
    const info = buildBar(ig, w.mt, { W: 8.4 + 0.6 * (lv - 4), Wc: 3.2, L1: 3.0, hy: w.hy * k, big: false, lv });
    for (const s of [-1, 1]) decal(ig, barDecal('SD ' + (80 + lv * 5), '', '#ffffff'), 1.6, 0.4, s * (info.hwT * 0.5 * 0.82 + 0.02), info.yb + 0.95, info.zh, s * PI / 2, s * Math.atan((info.hwT * 0.86 - 1.0) / 2 / 1.2));
    return finish(root, 0x5e7d8a, k);
  }
  /** Сборка L7-10: красный гусеничный трактор + широкая сеялка с крыльями 12-16 м. */
  function tractorTier2(lv) {
    const root = begin(), t = tOf(lv);
    const w = buildTracked({ lv, lights: lv >= 8 ? 2 : 1, label: 'T' + (520 + (lv - 7) * 60), col: { body: 0xa31616, trim: 0xe8e8e8, roof: 0xe9e9e6 }, accent: '#e8e8e8', stripe: '#ffffff' });
    root.add(w.g);
    const ig = new T.Group(); ig.position.set(0, 0, w.hz + 0.18); root.add(ig);
    const W = [12, 13.4, 14.7, 16][lv - 7];
    const info = buildBar(ig, w.mt, { W, Wc: 6.2, L1: 3.6, hy: w.hy, big: true, lv });
    void t;
    return finish(root, 0x5e7d8a, 1);
  }
  reg('vehicle', 'tractor', (lv) => tierOf(lv) === 0 ? tractorTier0(lv) : tierOf(lv) === 1 ? tractorTier1(lv) : tractorTier2(lv));

  // @@MORE@@
})();
