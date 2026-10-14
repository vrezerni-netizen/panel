/* Грузовики для вывоза урожая и городской транспорт: процедурные PBR-модели (three.js r128, без внешних файлов и сети).
   kind 'truck': cart (ур.0, ручная телега), pickup (1), truck (2, фургон со шторами), semi (3, седельный тягач + 13-метровый рефрижератор).
   kind 'car': sedan, hatch, suv, van.   kind 'bus': bus.
   Перед = +Z, начало координат = центр опоры на земле, 1 единица ~ 1 м, колёса стоят на y = 0.
   Все формы авторские, без чужих логотипов и торговых марок. Кузова-лофты со скруглёнными сечениями, лаковая краска, стекло с салоном,
   настоящие шины с протектором, диски, тормозные диски, фары, бамперы, зеркала. Ручная телега без животных: оглобли для человека. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM || !C.pmat) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const UP = V3(0, 1, 0);
  const toV = (p) => (p && p.isVector3 ? p : V3(p[0], p[1], p[2]));

  // ====================================================================== реестр с кэшем (одинаковые opts -> одна и та же модель)
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = Object.assign({}, opts || {}); opts.variant = (((opts.variant | 0) % 8) + 8) % 8;
      const key = [kind, name, opts.level | 0, opts.variant | 0, opts.seed | 0, opts.stage | 0, opts.length | 0].join('|');
      if (!_cache[key]) _cache[key] = fn(opts);
      return _cache[key].clone(true);
    });
  }

  // ====================================================================== геометрия
  /** Нормали усредняются только между гранями с углом меньше deg: фаски гладкие, рёбра чёткие. */
  function crease(geo, deg) {
    const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, n = pa.count, cosT = Math.cos((deg || 50) * PI / 180);
    const fn = new Float32Array(n * 3), buckets = new Map(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    for (let f = 0; f < n; f += 3) {
      a.fromBufferAttribute(pa, f); b.fromBufferAttribute(pa, f + 1); c.fromBufferAttribute(pa, f + 2);
      b.sub(a); c.sub(a); b.cross(c);
      for (let k = 0; k < 3; k++) {
        const i = f + k; fn[i * 3] = b.x; fn[i * 3 + 1] = b.y; fn[i * 3 + 2] = b.z;
        const key = Math.round(pa.getX(i) * 400) + ',' + Math.round(pa.getY(i) * 400) + ',' + Math.round(pa.getZ(i) * 400);
        let l = buckets.get(key); if (!l) buckets.set(key, (l = [])); l.push(i);
      }
    }
    const out = new Float32Array(n * 3);
    for (const l of buckets.values()) {
      for (const i of l) {
        const ix = fn[i * 3], iy = fn[i * 3 + 1], iz = fn[i * 3 + 2], li = Math.hypot(ix, iy, iz);
        if (li < 1e-14) { out[i * 3 + 1] = 1; continue; }
        let sx = 0, sy = 0, sz = 0;
        for (const j of l) {
          const jx = fn[j * 3], jy = fn[j * 3 + 1], jz = fn[j * 3 + 2], lj = Math.hypot(jx, jy, jz);
          if (lj < 1e-14) continue;
          if ((ix * jx + iy * jy + iz * jz) / (li * lj) >= cosT) { sx += jx / lj; sy += jy / lj; sz += jz / lj; }
        }
        const L = Math.hypot(sx, sy, sz) || 1; out[i * 3] = sx / L; out[i * 3 + 1] = sy / L; out[i * 3 + 2] = sz / L;
      }
    }
    g.setAttribute('normal', new T.BufferAttribute(out, 3)); return g;
  }
  const _bx = {};
  /** Простая коробка (кэш) — для мелких деталей без скруглений. */
  const bx = (w, h, d) => { const k = w + '|' + h + '|' + d; return _bx[k] || (_bx[k] = new T.BoxGeometry(w, h, d)); };
  const _rb = {};
  /** Скруглённая коробка w×h×d (x,y,z), радиус r; q — качество 0/1/2. Гладкие нормали, кэшируется. */
  function rb(w, h, d, r, q) {
    if (q == null) q = Math.min(w, h, d) < 0.1 ? 0 : 1;
    if (q === 0 && Math.min(w, h, d) < 0.13) return bx(w, h, d);
    const k = [w, h, d, r, q].map((v) => (v == null ? 'n' : v.toFixed(3))).join('|');
    if (_rb[k]) return _rb[k];
    r = Math.max(0.001, Math.min(r == null ? 0.05 : r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const bev = Math.min(r * 0.7, d / 2 - 0.001, 0.3), hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.0005, Math.min(r, hw - 0.0005, hh - 0.0005)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh);
    sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: [1, 2, 3][q], curveSegments: [2, 3, 5][q] });
    g.translate(0, 0, -(d - 2 * bev) / 2);
    return (_rb[k] = crease(g, 50));
  }
  /** Контур с радиусами скругления углов (rad — число или массив). */
  function rshape(pts, rad) {
    const n = pts.length, sh = new T.Shape();
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], r = Array.isArray(rad) ? rad[i] : rad;
      if (!r) { if (i) sh.lineTo(p1[0], p1[1]); else sh.moveTo(p1[0], p1[1]); continue; }
      const d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), rr = Math.min(r, d1 * 0.5, d2 * 0.5);
      const ax = p1[0] + (p0[0] - p1[0]) / d1 * rr, ay = p1[1] + (p0[1] - p1[1]) / d1 * rr, bx = p1[0] + (p2[0] - p1[0]) / d2 * rr, by = p1[1] + (p2[1] - p1[1]) / d2 * rr;
      if (i) sh.lineTo(ax, ay); else sh.moveTo(ax, ay);
      sh.quadraticCurveTo(p1[0], p1[1], bx, by);
    }
    sh.closePath(); return sh;
  }
  /** Выдавливание контура. plane 'zy': контур (z,y) вытянут по X шириной w (профиль кузова сбоку; перед = +z).
      'xy': контур (x,y) вдоль Z (вид спереди). 'xz': контур (x,z), вытянут вверх по Y, y от -w/2 до w/2. */
  function ex(pts, w, o) {
    o = o || {}; const b = o.b == null ? 0.03 : o.b, rad = o.r == null ? 0.08 : o.r;
    const g = new T.ExtrudeGeometry(o.shape || rshape(pts, rad), { depth: Math.max(0.002, w - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: o.seg || 3, curveSegments: o.cs || 5 });
    g.translate(0, 0, -(w - 2 * b) / 2);
    if (o.plane === 'zy') g.rotateY(-PI / 2); else if (o.plane === 'xz') g.rotateX(PI / 2);
    return crease(g, 50);
  }
  /** Тело вращения. prof — точки [r, a, (v)]: r — радиус, a — координата вдоль оси, v — необязательная UV-координата.
      Идти по профилю надо так, чтобы видимая сторона была СПРАВА (r вправо, a вверх). Острые углы (>hard°) режутся, остальное гладко. */
  function lat(prof, seg, axis, o) {
    o = o || {}; seg = seg || 24; const n = prof.length, cosH = Math.cos((o.hard == null ? 40 : o.hard) * PI / 180), sn = [], cum = [0];
    for (let i = 0; i < n - 1; i++) { const dr = prof[i + 1][0] - prof[i][0], da = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, da) || 1e-9; sn.push([da / l, -dr / l]); cum.push(cum[i] + l); }
    const tot = cum[n - 1] || 1, rows = [], rin = [], rout = [];
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? sn[i - 1] : null, b = i < n - 1 ? sn[i] : null, v = prof[i][2] != null ? prof[i][2] : cum[i] / tot;
      if (a && b) {
        const d = a[0] * b[0] + a[1] * b[1];
        if (d >= cosH) { let nr = a[0] + b[0], na = a[1] + b[1]; const l = Math.hypot(nr, na) || 1; rows.push([prof[i][0], prof[i][1], nr / l, na / l, v]); rin[i] = rout[i] = rows.length - 1; }
        else { rows.push([prof[i][0], prof[i][1], a[0], a[1], v]); rin[i] = rows.length - 1; rows.push([prof[i][0], prof[i][1], b[0], b[1], v]); rout[i] = rows.length - 1; }
      } else { const s = a || b; rows.push([prof[i][0], prof[i][1], s[0], s[1], v]); rin[i] = rout[i] = rows.length - 1; }
    }
    const W = seg + 1, pos = [], nor = [], uv = [], idx = [], ur = o.uRep || 1;
    for (const [r, a, nr, na, v] of rows) for (let k = 0; k <= seg; k++) {
      const th = k / seg * TAU, c = Math.cos(th), s = Math.sin(th);
      if (axis === 'x') { pos.push(a, r * c, r * s); nor.push(na, nr * c, nr * s); } else if (axis === 'z') { pos.push(r * c, r * s, a); nor.push(nr * c, nr * s, na); } else { pos.push(r * c, a, r * s); nor.push(nr * c, na, nr * s); }
      uv.push(k / seg * ur, v);
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
      const A = rout[i] * W + k, B = A + 1, Cc = rin[i + 1] * W + k, D = Cc + 1;
      idx.push(A, B, D, A, D, Cc);
    }
    // ориентация граней: по нормали у первой невырожденной грани (до setIndex — он копирует массив)
    { const p0 = V3(0, 0, 0), p1 = V3(0, 0, 0), p2 = V3(0, 0, 0), nn = V3(0, 0, 0), pg = (i, v) => v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      for (let t = 0; t < idx.length; t += 3) {
        pg(idx[t], p0); pg(idx[t + 1], p1); pg(idx[t + 2], p2); p1.sub(p0); p2.sub(p0); p1.cross(p2);
        if (p1.lengthSq() > 1e-12) { nn.set(nor[idx[t] * 3], nor[idx[t] * 3 + 1], nor[idx[t] * 3 + 2]); if (nn.lengthSq() < 1e-6) continue; if (p1.dot(nn) < 0) for (let q = 0; q < idx.length; q += 3) { const tmp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tmp; } break; }
      } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  const _cy = {};
  /** Цилиндр вдоль оси ('x'|'y'|'z') радиусом r (r2 — другой торец), длиной len. */
  function cyl(r, len, seg, axis, r2, open) {
    const k = [r, len, seg, axis, r2, open].join('|'); if (_cy[k]) return _cy[k];
    const g = new T.CylinderGeometry(r2 == null ? r : r2, r, len, seg || 16, 1, !!open);
    if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'z') g.rotateX(PI / 2);
    return (_cy[k] = g);
  }
  const sphG = (rx, ry, rz, ws, hs) => { const g = new T.SphereGeometry(1, ws || 14, hs || 10); g.scale(rx, ry == null ? rx : ry, rz == null ? rx : rz); return g; };
  /** Труба по ломаной (CatmullRom). */
  function tube(pts, r, segs, radial, closed) {
    const cu = new T.CatmullRomCurve3(pts.map(toV), !!closed, 'catmullrom', 0.5);
    return new T.TubeGeometry(cu, segs || pts.length * 4, r, radial || 6, !!closed);
  }
  /** Стержень между двумя точками (r2 — радиус второго конца). */
  function rod(a, b, r, seg, r2) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length();
    const g = new T.CylinderGeometry(r2 == null ? r : r2, r, L, seg || 10, 1, false);
    g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(UP, d.normalize())));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
  }
  /** Поверхность по функции fn(u,v,out) на сетке nu×nv. hint — направление «наружу» (для ориентации граней). UV = (u,v). */
  function sheet(fn, nu, nv, hint) {
    const pos = [], uv = [], idx = [], p = new T.Vector3();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
    const W = nu + 1, ci = Math.floor(nu / 2), cj = Math.floor(nv / 2), a0 = Math.min(cj * W + ci, (nv - 1) * W + nu - 1);
    const A = V3(pos[a0 * 3], pos[a0 * 3 + 1], pos[a0 * 3 + 2]), B = V3(pos[(a0 + 1) * 3], pos[(a0 + 1) * 3 + 1], pos[(a0 + 1) * 3 + 2]), D = V3(pos[(a0 + W + 1) * 3], pos[(a0 + W + 1) * 3 + 1], pos[(a0 + W + 1) * 3 + 2]);
    const nrm = B.sub(A).cross(D.sub(A)); const flip = hint ? nrm.dot(hint) < 0 : false;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (!flip) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /** Плоский прямоугольник в плоскости x=c / z=c / y=c (нормаль к +осиу, flip — к -оси). a0..a1 — по первой оси плоскости, b0..b1 — по второй.
      'x': a = z, b = y;  'z': a = x, b = y;  'y': a = x, b = z. uv = [u0,v0,u1,v1] — подокно текстуры. */
  function quad(axis, a0, a1, b0, b1, c, flip, uv) {
    const g = new T.PlaneGeometry(1, 1), p = g.attributes.position, uva = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = uva.getX(i), v = uva.getY(i), A = lerp(a0, a1, u), B = lerp(b0, b1, v);
      if (axis === 'x') p.setXYZ(i, c, B, A); else if (axis === 'z') p.setXYZ(i, A, B, c); else p.setXYZ(i, A, c, B);
      if (uv) uva.setXY(i, lerp(uv[0], uv[2], u), lerp(uv[1], uv[3], v));
    }
    const idx = g.index.array, pa = g.attributes.position, a = V3(pa.getX(idx[0]), pa.getY(idx[0]), pa.getZ(idx[0])), b = V3(pa.getX(idx[1]), pa.getY(idx[1]), pa.getZ(idx[1])), d = V3(pa.getX(idx[2]), pa.getY(idx[2]), pa.getZ(idx[2]));
    const n = b.sub(a).cross(d.sub(a)), want = axis === 'x' ? V3(1, 0, 0) : axis === 'z' ? V3(0, 0, 1) : V3(0, 1, 0);
    if ((n.dot(want) < 0) !== !!flip) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } }
    g.computeVertexNormals(); return g;
  }
  /** Склеивание нескольких геометрий (с матрицами) в одну неиндексированную. */
  function mergeWorld(list) {
    const pos = [], nor = [], uv = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    for (const { geo, m } of list) {
      const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; nm.getNormalMatrix(m || new T.Matrix4());
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); if (m) v.applyMatrix4(m); pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(na, i); if (m) n.applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); return g;
  }
  /** Копия геометрии с обратной ориентацией (нормали внутрь) — для внутренней обшивки салона. */
  function inv(geo) {
    const g = geo.clone(); if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); } else { g.computeVertexNormals(); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
    return g;
  }
  /** Монотонная кубическая интерполяция по точкам [[x,y],...] (без перерегулирования). */
  function interp(pts) {
    if (typeof pts === 'function') return pts; if (typeof pts === 'number') return () => pts;
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; } else { const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } } }
    return (x) => {
      if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  /** Точки дуги окружности (для профилей). */
  const arc = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; };

  // ====================================================================== лофт: кузов из скруглённых сечений (суперэллипс) вдоль оси Z
  const taperF = (t, q) => { t = clamp(t, 0, 1); return Math.pow(Math.max(0, 1 - Math.pow(1 - t, q)), 1 / q); };
  /** z0..z1 (перед +z); yb/yt — низ/верх сечения, hwb/hwt — полуширина снизу/сверху ([[z,v]...] / число / функция), n — «квадратность» сечения,
      R0/R1 — длина скругления заднего/переднего торца, q0/q1 — форма торцов. */
  function Loft(o) {
    this.z0 = o.z0; this.z1 = o.z1; this.R0 = o.R0 == null ? 0.3 : o.R0; this.R1 = o.R1 == null ? 0.3 : o.R1; this.q0 = o.q0 || 3; this.q1 = o.q1 || 3;
    this.yb = interp(o.yb); this.yt = interp(o.yt); this.hwb = interp(o.hwb); this.hwt = interp(o.hwt); this.n = o.n || 3.5; this.extra = o.extra || [];
  }
  Loft.prototype.f = function (z) {
    let f = 1; const a = (z - this.z0) / this.R0, b = (this.z1 - z) / this.R1;
    if (a < 1) f = Math.min(f, taperF(a, this.q0)); if (b < 1) f = Math.min(f, taperF(b, this.q1)); return f;
  };
  /** Точка сечения на станции z при угле th (0 = борт +x, PI/2 = верх). inf — вынос наружу. */
  Loft.prototype.P = function (z, th, inf, out) {
    inf = inf || 0; const f = this.f(z), yb = this.yb(z), yt = this.yt(z), yc = (yb + yt) / 2, hh = (yt - yb) / 2 * f + inf;
    const c = Math.cos(th), s = Math.sin(th), e = 2 / this.n;
    const ex_ = Math.sign(c) * Math.pow(Math.abs(c), e), ey = Math.sign(s) * Math.pow(Math.abs(s), e), v = (ey + 1) / 2, wb = this.hwb(z), wt = this.hwt(z);
    const hw = (wb + (wt - wb) * v) * f + inf;
    return (out || V3(0, 0, 0)).set(hw * ex_, yc + hh * ey, z);
  };
  /** Точка на боковой поверхности (sd = +1 / -1) на высоте y. */
  Loft.prototype.side = function (sd, z, y, inf, out) {
    const f = this.f(z), yb = this.yb(z), yt = this.yt(z), yc = (yb + yt) / 2, hh = (yt - yb) / 2 * f;
    const ey = clamp((y - yc) / (hh || 1e-6), -0.995, 0.995), s = Math.sign(ey) * Math.pow(Math.abs(ey), this.n / 2), th = Math.asin(s);
    const P = this.P(z, th, inf, out); if (sd < 0) P.x = -P.x; return P;
  };
  Loft.prototype.stations = function (nMid) {
    const us = [0, 0.025, 0.07, 0.14, 0.26, 0.45, 0.72, 1], zs = [], a = this.z0 + this.R0, b = this.z1 - this.R1;
    us.forEach((u) => zs.push(this.z0 + this.R0 * u));
    for (let i = 1; i < nMid; i++) zs.push(a + (b - a) * i / nMid);
    for (let j = us.length - 1; j >= 0; j--) zs.push(this.z1 - this.R1 * us[j]);
    for (const e of this.extra) zs.push(e); zs.sort((p, q) => p - q);
    return zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-5);
  };
  /** Геометрия лофта. o: M — точек в сечении, nMid, zA/zB — ограничение по z, a0/a1 — дуга сечения (для открытых панелей), inf — вынос. */
  Loft.prototype.geo = function (o) {
    o = o || {}; const M = o.M || 24, inf = o.inf || 0, a0 = o.a0 == null ? 0 : o.a0, a1 = o.a1 == null ? TAU : o.a1, open = a1 - a0 < TAU - 1e-6, cols = open ? M + 1 : M;
    let zs = o.zs || this.stations(o.nMid || 14);
    if (o.zA != null || o.zB != null) { const A = o.zA == null ? -1e9 : o.zA, B = o.zB == null ? 1e9 : o.zB; zs = zs.filter((z) => z >= A - 1e-6 && z <= B + 1e-6); if (o.zA != null && zs[0] > o.zA + 1e-5) zs.unshift(o.zA); if (o.zB != null && zs[zs.length - 1] < o.zB - 1e-5) zs.push(o.zB); }
    const pos = [], idx = [], p = new T.Vector3();
    for (const z of zs) for (let k = 0; k < cols; k++) { const th = a0 + (a1 - a0) * k / M; this.P(z, th, 0, p); pos.push(p.x, p.y, p.z); }
    const S = zs.length;
    for (let i = 0; i < S - 1; i++) for (let k = 0; k < M; k++) {
      const k1 = open ? k + 1 : (k + 1) % M, v00 = i * cols + k, v01 = i * cols + k1, v10 = (i + 1) * cols + k, v11 = (i + 1) * cols + k1;
      idx.push(v00, v01, v11, v00, v11, v10);
    }
    // аналитические нормали (без артефактов на схлопнутых торцах); смещение inf — строго по нормали
    const nor = new Float32Array(pos.length), a = V3(0, 0, 0), b = V3(0, 0, 0), c2 = V3(0, 0, 0), d = V3(0, 0, 0), dt = 2e-3, dz = 2e-3, mid = (this.z0 + this.z1) / 2;
    let vi = 0;
    for (const z of zs) for (let k = 0; k < cols; k++) {
      const th = a0 + (a1 - a0) * k / M, zl = clamp(z - dz, this.z0, this.z1), zh = clamp(z + dz, this.z0, this.z1);
      this.P(z, th + dt, 0, a); this.P(z, th - dt, 0, b); this.P(zh, th, 0, c2); this.P(zl, th, 0, d);
      a.sub(b); c2.sub(d); a.cross(c2);
      if (a.length() < 1e-9) a.set(0, 0, z > mid ? 1 : -1); else a.normalize();
      nor[vi * 3] = a.x; nor[vi * 3 + 1] = a.y; nor[vi * 3 + 2] = a.z;
      if (inf) { pos[vi * 3] += a.x * inf; pos[vi * 3 + 1] += a.y * inf; pos[vi * 3 + 2] += a.z * inf; }
      vi++;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); return g;
  };
  /** Лист на боковой поверхности: z в [zA,zB], y в [yA,yB]. */
  Loft.prototype.panel = function (sd, zA, zB, yA, yB, inf, nu, nv) {
    return sheet((u, v, out) => this.side(sd, lerp(zA, zB, u), lerp(yA, yB, v), inf, out), nu || 8, nv || 4, V3(sd, 0, 0));
  };
  /** Лист по сечению: z в [zA,zB], угол th в [t0,t1] (верх: PI/2). Для лобового стекла и крыши. */
  Loft.prototype.patch = function (zA, zB, t0, t1, inf, nu, nv, hint) {
    return sheet((u, v, out) => this.P(lerp(zA, zB, u), lerp(t0, t1, v), inf, out), nu || 8, nv || 8, hint || UP);
  };
  /** Круг/диск на боковой поверхности (центр zc, yc; радиус r). */
  Loft.prototype.disc = function (sd, zc, yc, r, inf, y0) {
    const ymin = y0 == null ? this.yb(zc) + 0.004 : y0;
    return sheet((u, v, out) => { const a = u * TAU, rr = v * r; this.side(sd, zc + rr * Math.cos(a), Math.max(ymin, yc + rr * Math.sin(a)), inf, out); }, 24, 2, V3(sd, 0, 0));
  };
  Loft.prototype.rail = function (sd, pts, inf, r, radial) { return tube(pts.map(([z, y]) => this.side(sd, z, y, inf)), r, pts.length * 3, radial || 4); };

  // ====================================================================== материалы и текстуры
  const texCache = {};
  function canvasTex(key, w, h, draw, rep) {
    if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.anisotropy = 8; t.wrapS = t.wrapT = T.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
    return (texCache[key] = t);
  }
  const matCache = {};
  /** PBR-материал с текстурой (кэш по ключу). */
  function texPbr(key, w, h, draw, o, rep) { const k = 'S' + key; return matCache[k] || (matCache[k] = new T.MeshStandardMaterial(Object.assign({ map: canvasTex(key, w, h, draw, rep), metalness: 0.05, roughness: 0.6, envMapIntensity: 0.5 }, o || {}))); }
  /** Простой матовый материал (идёт в общий «вертексный» ведро bakeTex: один вызов отрисовки на все цвета). */
  const lamC = {};
  const lam = (c) => lamC[c] || (lamC[c] = new T.MeshLambertMaterial({ color: c }));
  const hex = (c) => '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  const shade = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = (v) => clamp(Math.round(v * k), 0, 255); return (f(r) << 16) | (f(g) << 8) | f(b); };
  const mixC = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
  /** Для графики по белому: слишком светлый цвет заменяется тёмно-синим. */
  const inkCol = (c) => { const l = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255; return l > 0.68 ? 0x2b5f8f : c; };
  const glassCache = {};
  /** Стекло: прозрачное (для лофтов с салоном). */
  const glassT = (t) => glassCache['t' + t] || (glassCache['t' + t] = new T.MeshStandardMaterial({ color: t || 0x2a3b48, metalness: 0.85, roughness: 0.05, envMapIntensity: 1.1, transparent: true, opacity: 0.42, depthWrite: false }));
  /** Непрозрачное тёмное стекло с бликами (для плоских окон на кузове). */
  const glassO = (t) => glassCache['o' + t] || (glassCache['o' + t] = new T.MeshStandardMaterial({
    map: canvasTex('glassO' + t, 256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hex(mixC(t || 0x1d2a35, 0x6f8da3, 0.35))); gr.addColorStop(0.55, hex(t || 0x1d2a35)); gr.addColorStop(1, hex(shade(t || 0x1d2a35, 0.7)));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo(w * 0.15, 0); g.lineTo(w * 0.42, 0); g.lineTo(w * 0.12, h); g.lineTo(-w * 0.15, h); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(w * 0.55, 0); g.lineTo(w * 0.66, 0); g.lineTo(w * 0.36, h); g.lineTo(w * 0.25, h); g.fill();
    }), color: 0xffffff, metalness: 0.7, roughness: 0.08, envMapIntensity: 1.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const MT = {
    trim: () => C.matte(0x1b1c1f, { roughness: 0.74 }),
    rubber: () => C.rubberM(),
    chrome: () => C.pmat(0xeef1f4, { metalness: 1, roughness: 0.17, envMapIntensity: 1.55 }),
    alloy: () => C.metal(0xcfd4da, { roughness: 0.24 }),
    dark: () => C.metal(0x2a2d32, { roughness: 0.5 }),
    steel: () => C.metal(0x8f969e, { roughness: 0.42 }),
    lampW: () => C.lightM(0xfff3d2), lampR: () => C.lightM(0xc81a14), lampA: () => C.lightM(0xffa017),
    lensH: () => C.pmat(0x9fb0bd, { metalness: 0.85, roughness: 0.1, envMapIntensity: 1.2, emissive: 0x1d2c3a, emissiveIntensity: 0.25 }),
    lensR: () => C.pmat(0x8e1310, { metalness: 0.2, roughness: 0.16, envMapIntensity: 0.9, emissive: 0xa8120e, emissiveIntensity: 0.55 }),
    seat: () => C.matte(0x24252a, { roughness: 0.9 }),
    paint: (c, o) => C.paint(c, o),
  };
  /** Декаль-материал (текстура поверх кузова), с polygonOffset против мерцания на расстоянии. */
  const decalOpts = { metalness: 0.35, roughness: 0.4, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const put = (g, geo, m, x, y, z, rx, ry, rz) => {
    const o = C.mesh(geo, m, x, y, z, rx, ry, rz); g.add(o);
    return o;
  };
  /** Завершение: склейка по материалам (детерминированно), прозрачные (стекло) склеиваются в один меш и добавляются после. */
  function finish(g, seed) {
    g.updateMatrixWorld(true);
    const rnd = lcg(seed || 7), rr = Math.random; Math.random = rnd;
    let out; try { out = C.bakeTex(g); } finally { Math.random = rr; }
    const glass = new Map();
    g.traverse((o) => { if (o.isMesh && o.material.transparent) { if (!glass.has(o.material)) glass.set(o.material, []); glass.get(o.material).push({ geo: o.geometry, m: o.matrixWorld.clone() }); } });
    for (const [m, list] of glass) { const mesh = new T.Mesh(mergeWorld(list), m); mesh.renderOrder = 2; out.add(mesh); }
    return out;
  }
  const both = (fn) => { fn(1); fn(-1); };
  /** Смещает группу так, чтобы нижняя точка стала y=0 (страховка от «висения/проваливания»), и центрирует по заданным границам. */
  /** Центрирует по z (центр опоры) и ставит на землю. */
  function center(g) { const b = new T.Box3().setFromObject(g); if (isFinite(b.min.z)) g.position.z -= (b.min.z + b.max.z) / 2; return ground(g); }
  function ground(g) { const b = new T.Box3().setFromObject(g); if (isFinite(b.min.y) && Math.abs(b.min.y) > 1e-4) g.position.y -= b.min.y; return g; }


  // ====================================================================== шины и диски
  /** Шина с рисунком протектора и текстом на боковине (u — по окружности, v: 0 внутренняя боковина .. 1 наружная; протектор 0.33..0.67). */
  function tyreMat(kind) {
    const big = kind === 'truck', ag = kind === 'agri';
    return texPbr('tyre_' + kind, 1024, 256, (g, w, h) => {
      g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h);
      const y = (v) => h * (1 - v); // v -> canvas y
      // боковины: лёгкая зернистость и кольцевые рёбра
      const rr = lcg(41); for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(255,255,255,' + (rr() * 0.035) + ')'; g.fillRect(rr() * w, rr() * h, 2, 1); }
      g.strokeStyle = 'rgba(60,62,66,0.9)'; g.lineWidth = 3;
      for (const v of [0.08, 0.13, 0.22, 0.78, 0.87, 0.92]) { g.beginPath(); g.moveTo(0, y(v)); g.lineTo(w, y(v)); g.stroke(); }
      // протектор
      const n = big ? 44 : ag ? 28 : 56, bw = w / n, t0 = y(0.67), t1 = y(0.33);
      g.fillStyle = '#0d0d0f'; g.fillRect(0, t0, w, t1 - t0);
      for (let i = 0; i < n; i++) {
        const x = i * bw;
        if (ag) { // ёлочка (сельхоз)
          g.fillStyle = '#2b2c30'; g.beginPath(); g.moveTo(x, t1); g.lineTo(x + bw * 0.5, (t0 + t1) / 2 + 4); g.lineTo(x + bw * 0.5, (t0 + t1) / 2 - 6); g.lineTo(x, t1 - 12); g.fill();
          g.beginPath(); g.moveTo(x + bw, t1); g.lineTo(x + bw * 0.5, (t0 + t1) / 2 + 4); g.lineTo(x + bw * 0.5, (t0 + t1) / 2 - 6); g.lineTo(x + bw, t1 - 12); g.fill();
        } else if (big) {
          g.fillStyle = '#2c2d31'; const m = (t1 - t0) / 3;
          g.fillRect(x + 2, t0 + 2, bw - 5, m - 3); g.fillRect(x + 2, t0 + m + 2, bw - 5, m - 3); g.fillRect(x + 2, t0 + 2 * m + 2, bw - 5, m - 3);
          g.fillStyle = '#1a1a1d'; g.fillRect(x + 2, t0 + 2, 4, t1 - t0 - 4);
        } else {
          g.fillStyle = '#2a2b2f'; const m = (t1 - t0) / 4;
          for (let r = 0; r < 4; r++) { g.fillRect(x + 1, t0 + r * m + 2, bw - 3, m - 4); }
          g.fillStyle = '#17171a'; g.fillRect(x + bw * 0.5, t0 + 3, 2, t1 - t0 - 6);
        }
      }
      // текст на наружной боковине (v ~ 0.80) и внутренней (v ~ 0.2)
      g.fillStyle = 'rgba(150,152,158,0.55)'; g.font = 'bold ' + Math.round(h * 0.085) + 'px sans-serif'; g.textBaseline = 'middle';
      const txt = big ? 'RADIAL TUBELESS   295/80 R22.5   152/148M   ' : ag ? 'AGRI RADIAL   480/70 R34   ' : 'RADIAL TUBELESS   205/55 R16   91V   ';
      g.fillText(txt + txt, 4, y(0.83)); g.fillText(txt + txt, 4, y(0.17));
      g.fillStyle = 'rgba(200,200,200,0.4)'; g.beginPath(); g.arc(w * 0.62, y(0.9), h * 0.012, 0, TAU); g.fill();
    }, { metalness: 0, roughness: 0.9, envMapIntensity: 0.2 });
  }
  const _wh = {};
  /** Геометрия колеса (ось X, наружу +x). Стили: 'alloy' (литой диск, spokes), 'steel' (штамповка с гайками, truck/pickup). */
  function wheelGeos(s) {
    const key = JSON.stringify(s); if (_wh[key]) return _wh[key];
    const R = s.R, W = s.W, rR = s.rimR, h = R - rR, hw = W / 2, seg = s.seg || 28, r = {};
    const aO = 0.80 * hw;
    const tp = s.lod === 2 ? [[rR - 0.004, -0.8 * hw, 0.0], [rR + 0.55 * h, -1.0 * hw, 0.2], [R, -0.5 * hw, 0.38], [R, 0.5 * hw, 0.62], [rR + 0.55 * h, 1.0 * hw, 0.8], [rR - 0.004, 0.8 * hw, 1.0]] : s.lod ? [
      [rR - 0.004, -0.80 * hw, 0.0], [rR + 0.5 * h, -1.00 * hw, 0.14], [R - 0.014, -0.70 * hw, 0.3], [R, -0.5 * hw, 0.34], [R, 0.5 * hw, 0.66], [R - 0.014, 0.70 * hw, 0.7], [rR + 0.5 * h, 1.00 * hw, 0.86], [rR - 0.004, 0.80 * hw, 1.0]] : [
      [rR - 0.004, -0.80 * hw, 0.00], [rR + 0.10 * h, -0.96 * hw, 0.07], [rR + 0.45 * h, -1.00 * hw, 0.15], [rR + 0.80 * h, -0.93 * hw, 0.25], [R - 0.012, -0.72 * hw, 0.31],
      [R, -0.54 * hw, 0.34], [R, 0.54 * hw, 0.66], [R - 0.012, 0.72 * hw, 0.69], [rR + 0.80 * h, 0.93 * hw, 0.75], [rR + 0.45 * h, 1.00 * hw, 0.85], [rR + 0.10 * h, 0.96 * hw, 0.93], [rR - 0.004, 0.80 * hw, 1.00]];
    r.tyre = lat(tp, s.lod ? Math.min(seg, s.lod === 2 ? 16 : 22) : seg, 'x');
    const lipEnd = s.style === 'steel' ? null : [];
    // кромка обода (идём наружу -> внутрь, видимая сторона справа)
    const lip = [[rR + 0.012, aO - 0.02], [rR + 0.014, aO - 0.004], [rR + 0.007, aO + 0.004], [rR - 0.005, aO + 0.007], [rR - 0.016, aO + 0.001], [rR - 0.021, aO - 0.012], [rR - 0.023, aO - 0.05]];
    if (s.style === 'steel') {
      // штампованный диск: кромка, тарелка, выпуклая ступица
      const f = s.lod === 2 ? [[rR + 0.012, aO - 0.02], [rR - 0.02, aO + 0.005], [rR * 0.84, aO - 0.09], [rR * 0.42, aO], [0.001, aO + 0.01]] : s.lod ? [[rR + 0.012, aO - 0.02], [rR + 0.006, aO + 0.006], [rR - 0.014, aO + 0.004], [rR - 0.024, aO - 0.04], [rR * 0.84, aO - 0.08], [rR * 0.5, aO - 0.09], [rR * 0.42, aO + 0.005], [rR * 0.2, aO + 0.012], [0.001, aO + 0.004]]
        : [...lip, [rR - 0.03, aO - 0.075], [rR * 0.88, aO - 0.08], [rR * 0.64, aO - 0.10], [rR * 0.50, aO - 0.05], [rR * 0.42, aO - 0.012], [rR * 0.40, aO + 0.01], [rR * 0.28, aO + 0.016], [rR * 0.18, aO + 0.012], [0.001, aO + 0.004]];
      r.face = lat(f, seg, 'x');
      const lugs = [], nL = s.lugs || 10, rl = rR * 0.325, lg = cyl(R * 0.021, 0.034, s.lod === 2 ? 4 : s.lod ? 5 : 6, 'x');
      for (let i = 0; i < nL; i++) { const a = i / nL * TAU; lugs.push({ geo: lg, m: new T.Matrix4().makeTranslation(aO + 0.012, Math.sin(a) * rl, Math.cos(a) * rl) }); }
      r.lugs = mergeWorld(lugs);
      if (!s.lod) { const hs = [], nh = nL; for (let i = 0; i < nh; i++) { const a = (i + 0.5) / nh * TAU, gg = cyl(rR * 0.075, 0.006, 10, 'x'); hs.push({ geo: gg, m: new T.Matrix4().makeTranslation(aO - 0.078, Math.sin(a) * rR * 0.66, Math.cos(a) * rR * 0.66) }); } r.holes = mergeWorld(hs); }
      r.hub = lat([[rR * 0.2, aO + 0.012], [rR * 0.19, aO + 0.03], [rR * 0.13, aO + 0.045], [rR * 0.06, aO + 0.05], [0.001, aO + 0.05]], s.lod === 2 ? 8 : s.lod ? 12 : 18, 'x');
    } else {
      const L1 = s.lod, sg = L1 ? Math.min(seg, 20) : seg;
      r.lip = lat(L1 ? [[rR + 0.012, aO - 0.02], [rR + 0.004, aO + 0.005], [rR - 0.016, aO + 0.002], [rR - 0.023, aO - 0.05]] : lip, sg, 'x');
      const aF = aO - 0.045, th = 0.024, sp = [], nS = s.spokes || 5, dbl = !!s.double, y0 = rR * 0.2, y1 = rR - 0.024;
      for (let i = 0; i < nS; i++) {
        const base = i / nS * TAU + 0.3;
        const offs = dbl ? [-0.13, 0.13] : [0];
        for (const o of offs) {
          const wr = dbl ? rR * 0.045 : rR * 0.12, wt = dbl ? rR * 0.07 : rR * 0.20;
          const pts = [[-wr, y0], [wr, y0], [wt, y1], [-wt, y1]], gg = ex(pts, th, { plane: 'zy', b: 0, r: 0.006, seg: 1, cs: 1 });
          const m = new T.Matrix4().makeRotationX(base + o); m.setPosition(aF - th / 2, 0, 0); sp.push({ geo: gg, m });
        }
      }
      r.spokes = mergeWorld(sp);
      r.hub = lat(L1 ? [[rR * 0.27, aF - 0.012], [rR * 0.2, aF + 0.028], [0.001, aF + 0.035]] : [[rR * 0.27, aF - 0.012], [rR * 0.265, aF + 0.012], [rR * 0.2, aF + 0.028], [rR * 0.08, aF + 0.034], [0.001, aF + 0.035]], L1 ? 14 : 20, 'x');
      if (!L1) { const lugs = [], rl = rR * 0.19, lg = cyl(0.0085, 0.016, 6, 'x'); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; lugs.push({ geo: lg, m: new T.Matrix4().makeTranslation(aF + 0.03, Math.sin(a) * rl, Math.cos(a) * rl) }); } r.lugs = mergeWorld(lugs); }
      r.disc = lat(L1 ? [[rR * 0.86, aF - 0.045], [rR * 0.30, aF - 0.045]] : [[rR * 0.86, aF - 0.07], [rR * 0.86, aF - 0.045], [rR * 0.30, aF - 0.045], [rR * 0.30, aF - 0.075]], L1 ? 20 : 28, 'x');
      r.caliper = rb(0.045, rR * 0.30, rR * 0.52, 0.012, 0); r.caliperPos = [aF - 0.06, rR * 0.62, -rR * 0.1];
    }
    // колодец обода: тёмная бочка и задняя стенка
    r.well = lat(s.lod ? [[rR - 0.023, aO - 0.05], [rR - 0.024, -0.46 * hw], [0.001, -0.5 * hw]] : [[rR - 0.023, aO - 0.05], [rR - 0.024, -0.46 * hw], [rR * 0.5, -0.5 * hw], [0.001, -0.5 * hw]], s.lod ? Math.min(seg, 20) : seg, 'x');
    return (_wh[key] = r);
  }
  /** Колесо в точке (x,y,z). side: +1 — лицевая сторона к +x, -1 — к -x. M: {tyre, dark, rim, chrome, steel}. simple — внутренний сдвоенный (без деталей). */
  function wheel(g, x, y, z, side, s, M, simple, phase) {
    const w = wheelGeos(s), ry = side > 0 ? 0 : PI, rx = phase == null ? 0 : phase;
    put(g, w.tyre, M.tyre, x, y, z, rx, ry, 0);
    if (!simple && s.lod !== 2) put(g, w.well, M.dark, x, y, z, rx, ry, 0);
    if (w.face) { if (!simple) { put(g, w.face, M.rim, x, y, z, rx, ry, 0); put(g, w.lugs, M.chrome, x, y, z, rx, ry, 0); if (w.holes) put(g, w.holes, M.dark, x, y, z, rx, ry, 0); put(g, w.hub, M.chrome, x, y, z, rx, ry, 0); } }
    else {
      put(g, w.lip, M.rim, x, y, z, rx, ry, 0); put(g, w.spokes, M.rim, x, y, z, rx, ry, 0); put(g, w.hub, M.rim, x, y, z, rx, ry, 0);
      if (!simple) { if (w.lugs) put(g, w.lugs, M.chrome, x, y, z, rx, ry, 0); put(g, w.disc, M.dark, x, y, z, rx, ry, 0); if (M.caliper) { const o = put(g, w.caliper, M.caliper, x, y, z, 0, 0, 0); const p = w.caliperPos; o.position.set(x + side * p[0], y + p[1], z + p[2]); } }
    }
  }
  const carWheelMats = () => ({ tyre: tyreMat('car'), dark: MT.dark(), rim: MT.alloy(), chrome: MT.chrome(), caliper: null });
  const truckWheelMats = (rim) => ({ tyre: tyreMat('truck'), dark: MT.dark(), rim: rim || C.metal(0xbfc5cc, { roughness: 0.38 }), chrome: MT.chrome() });

  // ====================================================================== общие детали кузовов (лофты)
  /** Поверхность лофта у торца: для точки (x,y) — z, где сечение перестаёт содержать точку (front: к +z, иначе к -z) и наклоны (yaw, pitch). */
  Loft.prototype.endAt = function (x, y, front) {
    const inside = (z) => {
      const f = this.f(z), yb = this.yb(z), yt = this.yt(z), yc = (yb + yt) / 2, hh = (yt - yb) / 2 * f, v = clamp((y - yb) / ((yt - yb) || 1e-6), 0, 1), wb = this.hwb(z), wt = this.hwt(z), hw = (wb + (wt - wb) * v) * f;
      if (hh < 1e-4 || hw < 1e-4) return false;
      return Math.pow(Math.abs(x) / hw, this.n) + Math.pow(Math.abs(y - yc) / hh, this.n) <= 1;
    };
    const find = (xx, yy) => {
      const sv = [x, y]; x = xx; y = yy;
      let a = front ? this.z1 - (this.R1 || 0.3) - 0.2 : this.z0 + (this.R0 || 0.3) + 0.2, b = front ? this.z1 : this.z0;
      for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (inside(m)) a = m; else b = m; }
      const r = (a + b) / 2; x = sv[0]; y = sv[1]; return r;
    };
    const z = find(x, y), d = 0.05;
    const Zx = (find(x + d, y) - find(x - d, y)) / (2 * d), Zy = (find(x, y + d) - find(x, y - d)) / (2 * d);
    // dy — поворот вокруг Y от осевого направления (перед: yaw = dy; зад: yaw = PI + dy), pitch — наклон вокруг X
    return { z, dy: Math.atan(-Zx), pitch: front ? Math.atan(Zy) : -Math.atan(Zy) };
  };
  /** z поверхности торца в точке (x,y) (без наклонов) — для облегающих накладок. */
  Loft.prototype.zAt = function (x, y, front) {
    x = Math.abs(x);
    const inside = (z) => {
      const f = this.f(z), yb = this.yb(z), yt = this.yt(z), yc = (yb + yt) / 2, hh = (yt - yb) / 2 * f, v = clamp((y - yb) / ((yt - yb) || 1e-6), 0, 1), wb = this.hwb(z), wt = this.hwt(z), hw = (wb + (wt - wb) * v) * f;
      if (hh < 1e-4 || hw < 1e-4) return false;
      return Math.pow(x / hw, this.n) + Math.pow(Math.abs(y - yc) / hh, this.n) <= 1;
    };
    let a = front ? this.z1 - (this.R1 || 0.3) - 0.3 : this.z0 + (this.R0 || 0.3) + 0.3, b = front ? this.z1 : this.z0;
    if (!inside(a)) { // точка вне максимального сечения: прижимаем к контуру
      const f = this.f(a), yb = this.yb(a), yt = this.yt(a), yc = (yb + yt) / 2, hh = (yt - yb) / 2 * f, v = clamp((y - yb) / ((yt - yb) || 1e-6), 0, 1), hw = (this.hwb(a) + (this.hwt(a) - this.hwb(a)) * v) * f;
      const e = Math.min(1, Math.abs(y - yc) / (hh || 1)), xm = hw * Math.pow(Math.max(0, 1 - Math.pow(e, this.n)), 1 / this.n) * 0.97; x = Math.min(x, xm);
      if (!inside(a) && !(x > 1e-4)) return a;
    }
    for (let i = 0; i < 36; i++) { const m = (a + b) / 2; if (inside(m)) a = m; else b = m; }
    return (a + b) / 2;
  };
  /** Накладка (лист), облегающая торец лофта: x0..x1, y0..y1, смещение off наружу. */
  function endPatch(L, front, x0, x1, y0, y1, off, nu, nv) {
    const d = 0.03, sg = front ? 1 : -1;
    return sheet((u, v, out) => {
      const x = lerp(x0, x1, u), y = lerp(y0, y1, v), z = L.zAt(x, y, front), sx = Math.sign(x) || 1;
      const zx = (L.zAt(Math.abs(x) + d, y, front) - L.zAt(Math.abs(x) - d, y, front)) / (2 * d) * sx, zy = (L.zAt(x, y + d, front) - L.zAt(x, y - d, front)) / (2 * d);
      let nx = -zx * sg, ny = -zy * sg, nz = sg; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      out.set(x + nx * off, y + ny * off, z + nz * off);
    }, nu || 6, nv || 2, V3(0, 0, sg));
  }
  /** Ориентация элемента по поверхности (порядок вращений YXZ). */
  function orient(o, yaw, pitch, roll) { o.rotation.order = 'YXZ'; o.rotation.set(pitch || 0, yaw || 0, roll || 0); return o; }

  const plateAtlas = () => texPbr('plates', 256, 64, (g, w, h) => {
    const plate = (x, txt, yel) => {
      g.fillStyle = yel ? '#e8c43a' : '#f2f1ea'; g.fillRect(x, 0, w / 2, h); g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.strokeRect(x + 2, 2, w / 2 - 4, h - 4);
      g.fillStyle = '#17365f'; g.fillRect(x + 4, 4, 14, h - 8); g.fillStyle = '#1b1b1b'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + w / 4 + 8, h / 2 + 2);
    };
    plate(0, 'FM 5870'); plate(w / 2, 'FA 2431', true);
  }, { roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const PLATE_FRONT = [0, 0, 0.5, 1], PLATE_REAR = [1, 0, 0.5, 1];

  /** Дорожный автомобиль «кузов + остекление» по спецификации. Перед = +Z. */
  function buildCar(S, col, o) {
    o = o || {};
    const g = new T.Group(), pa = MT.paint(col, { roughness: 0.26, metalness: 0.5, envMapIntensity: 0.8 }), tr = MT.trim(), ch = MT.chrome(), gl = glassT(0x2a3b48), dk = MT.dark(), sm = tr;
    const tub = new Loft(S.tub), gh = new Loft(Object.assign({}, S.gh, { yb: S.gh.yb || ((z) => tub.yt(z) - S.gh.drop) }));
    const al = S.gh.alpha, beltY = S.beltY, pc = S.capCol != null ? MT.paint(S.capCol, { roughness: 0.3, metalness: 0.4 }) : pa;
    put(g, tub.geo({ M: S.M || 30, nMid: S.nMid || 18 }), pa, 0, 0, 0);
    const cargo = S.cargo ? new Loft(S.cargo) : null, RL = cargo || tub;
    if (cargo) put(g, cargo.geo({ M: 28, nMid: 10 }), pa, 0, 0, 0);
    // ---- остекление (замкнутая оболочка) + тёмная внутренняя обшивка + крыша и стойки в краске
    put(g, gh.geo({ M: 20, nMid: 8 }), gl, 0, 0, 0);
    put(g, inv(gh.geo({ M: 12, nMid: 4, inf: -0.022 })), sm, 0, 0, 0);
    if (S.covers) for (const cv of S.covers) put(g, gh.geo({ M: S.coverM || 18, nMid: 6, zA: cv[0], zB: cv[1], inf: 0.006 }), pc, 0, 0, 0);
    const capA = S.gh.capA, capB = S.gh.capB;
    put(g, gh.geo({ M: 12, a0: PI / 2 - al, a1: PI / 2 + al, zA: capB, zB: capA, inf: 0.012, nMid: 10 }), pc, 0, 0, 0);
    const hdr = (z, rad) => { const pts = []; for (let k = 0; k <= 10; k++) pts.push(gh.P(z, PI / 2 - al + 2 * al * k / 10, 0.012)); return tube(pts, rad || 0.022, 20, 5); };
    put(g, hdr(capA), pc, 0, 0, 0); put(g, hdr(capB), pc, 0, 0, 0);
    both((sd) => {
      // кромка крыши: стойки А и С потолще, по крыше тоньше
      const seg = (zA, zB, r, n) => { const pts = []; for (let i = 0; i <= n; i++) { const p = gh.P(lerp(zA, zB, i / n), PI / 2 - al, 0.006); p.x *= sd; pts.push(p); } put(g, tube(pts, r, n * 2, 5), pc, 0, 0, 0); };
      seg(S.gh.railA, capA, S.gh.railR || 0.038, 5); seg(capA, capB, 0.02, 8); seg(capB, S.gh.railB, S.gh.railR || 0.038, 5);
      for (const zb of S.gh.pillars) { const pts2 = []; for (let k = 0; k <= 8; k++) { const th = lerp(-0.3, PI / 2 - al, k / 8); const p = gh.P(zb, th, 0.006); p.x *= sd; pts2.push(p); } put(g, tube(pts2, S.gh.pillarR || 0.026, 10, 5), pc, 0, 0, 0); }
    });
    // дворники в положении покоя у основания лобового стекла
    { const zw = S.wiperZ != null ? S.wiperZ : S.gh.z1 - 0.1; for (const [a0, a1] of [[0.28, 0.82], [-0.82, -0.12]]) { const pts = []; for (let k = 0; k <= 5; k++) pts.push(gh.P(zw, PI / 2 + lerp(a0, a1, k / 5), 0.01)); put(g, tube(pts, 0.008, 8, 4), tr, 0, 0, 0); } }
    // ---- арки колёс, пороги, швы дверей, ручки, зеркала
    const W = S.wheel, wz = [S.zf, S.zr], wy = W.R, bodyFor = (z) => (cargo && z < cargo.z1 - 0.3 ? cargo : tub);
    both((sd) => {
      for (const z of (S.archZ || wz)) {
        const B = bodyFor(z);
        put(g, B.disc(sd, z, wy, W.R + S.arch, 0.004), tr, 0, 0, 0);
        const lp = []; for (let k = 0; k <= 14; k++) { const a = -0.3 + (PI + 0.6) * k / 14; lp.push(B.side(sd, z + (W.R + S.arch + 0.01) * Math.cos(a), wy + (W.R + S.arch + 0.01) * Math.sin(a), 0.006)); }
        put(g, tube(lp, S.lipR || 0.016, 16, 4), S.lipBlack ? tr : pa, 0, 0, 0);
      }
      if (cargo) {
        put(g, cargo.panel(sd, S.zr + W.R + S.arch + 0.03, cargo.z1 - 0.15, S.sillY0 + 0.05, S.sillY1, 0.006, 10, 2), tr, 0, 0, 0);
        put(g, tub.panel(sd, cargo.z1 + 0.05, S.zf - W.R - S.arch - 0.03, S.sillY0, S.sillY1, 0.006, 6, 2), tr, 0, 0, 0);
        for (const zl of (S.cargoSeams || [])) put(g, cargo.rail(sd, [[zl, cargo.yb(zl) + 0.5], [zl, S.cargoTop || 1.85]], 0.004, 0.006, 3), tr, 0, 0, 0);
      } else put(g, tub.panel(sd, S.sillA != null ? S.sillA : S.zr + W.R + S.arch + 0.03, S.sillB != null ? S.sillB : S.zf - W.R - S.arch - 0.03, S.sillY0, S.sillY1, 0.006, 10, 2), tr, 0, 0, 0);
      { const bp = []; for (let i = 0; i <= 10; i++) bp.push(gh.side(sd, lerp(S.gh.beltA, S.gh.beltB, i / 10), beltY + 0.035, 0.004)); put(g, tube(bp, 0.007, 14, 3), ch, 0, 0, 0); }
      for (const zl of S.seams) put(g, tub.rail(sd, [[zl, S.sillY1 + 0.03], [zl, beltY - 0.03]], 0.003, 0.0055, 3), tr, 0, 0, 0);
      for (const zh of S.handles) put(g, bx(0.024, 0.028, 0.15), ch, tub.side(sd, zh, beltY - 0.1, 0.012).x, beltY - 0.1, zh);
      const gx = gh.side(sd, S.mirrorZ, S.mirrorY || beltY + 0.1, 0.0).x, MR = S.mirror || { w: 0.1, h: 0.13, d: 0.2 }, my = S.mirrorY || beltY + 0.12, mm = MR.black ? tr : pa;
      put(g, rod(V3(gx * 0.97, my - 0.04, S.mirrorZ - 0.02), V3(gx + sd * (MR.w * 0.5 + 0.03), my - 0.01, S.mirrorZ + 0.0), MR.black ? 0.02 : 0.014), tr, 0, 0, 0);
      put(g, rb(MR.w, MR.h, MR.d, MR.w * 0.45, 1), mm, gx + sd * (MR.w * 0.5 + 0.11), my + 0.03, S.mirrorZ + 0.01, 0, sd * 0.2, 0);
      put(g, bx(MR.w * 0.86, MR.h * 0.82, 0.012), dk, gx + sd * (MR.w * 0.5 + 0.11), my + 0.03, S.mirrorZ + 0.01 - MR.d * 0.5 - 0.002, 0, sd * 0.2, 0);
    });
    // ---- нос: фары, решётка, бампер
    both((sd) => {
      if (!S.noFront) {
      const L = S.lamp, x0 = L.x - L.w / 2, x1 = L.x + L.w / 2, y0 = L.y - L.h / 2, y1 = L.y + L.h / 2, m = 0.012, sx = (x) => sd * x;
      const P = (xa, xb, ya, yb, off) => { const g0 = endPatch(tub, true, sx(xa), sx(xb), ya, yb, off, 8, 2); return g0; };
      put(g, P(x0 - m, x1 + m, y0 - m, y1 + m, 0.006), tr, 0, 0, 0);
      put(g, P(x0, x1, y0, y1, 0.014), MT.lensH(), 0, 0, 0);
      if (!S.noDRL) put(g, P(x0 + 0.02, x1 - 0.02, y1 - L.h * 0.3, y1 - L.h * 0.12, 0.02), MT.lampW(), 0, 0, 0);
      for (const k of [0.3, 0.7]) { const cx = lerp(x0, x1, k), pr = L.h * 0.22; put(g, P(cx - pr, cx + pr, L.y - L.h * 0.34, L.y + L.h * 0.1, 0.02), dk, 0, 0, 0); }
      if (S.fog) { const fe = tub.endAt(S.fog.x, S.fog.y, true); const f = put(g, cyl(0.045, 0.06, 14, 'z'), MT.lensH(), sd * S.fog.x, S.fog.y, fe.z - 0.02); orient(f, sd * fe.dy, fe.pitch); }
      }
      if (S.noRear) return;
      const T_ = S.tail, tx0 = T_.x - T_.w / 2, tx1 = T_.x + T_.w / 2, ty0 = T_.y - T_.h / 2, ty1 = T_.y + T_.h / 2, tm = 0.012;
      const Q = (xa, xb, ya, yb, off) => endPatch(RL, false, sd * xa, sd * xb, ya, yb, off, 8, 2);
      put(g, Q(tx0 - tm, tx1 + tm, ty0 - tm, ty1 + tm, 0.006), tr, 0, 0, 0);
      put(g, Q(tx0, tx1, ty0, ty1, 0.014), MT.lensR(), 0, 0, 0);
      put(g, Q(tx0 + T_.w * 0.08, tx0 + T_.w * 0.4, ty0 + T_.h * 0.1, ty0 + T_.h * 0.4, 0.02), MT.lampA(), 0, 0, 0);
      put(g, Q(tx0 + T_.w * 0.45, tx1 - T_.w * 0.08, ty1 - T_.h * 0.3, ty1 - T_.h * 0.1, 0.02), MT.lampR(), 0, 0, 0);
    });
    if (!S.noFront) {
    const gr = S.grille, fe0 = tub.endAt(0, gr.y, true);
    put(g, rb(gr.w, gr.h, 0.1, 0.025, 1), tr, 0, gr.y, fe0.z - 0.03);
    put(g, rb(gr.w + 0.05, 0.028, 0.11, 0.012, 0), ch, 0, gr.y + gr.h / 2 + 0.012, fe0.z - 0.024); put(g, rb(gr.w + 0.05, 0.024, 0.11, 0.012, 0), ch, 0, gr.y - gr.h / 2 - 0.008, fe0.z - 0.024);
    const nb = gr.bars || 3; for (let i = 0; i < nb; i++) put(g, bx(gr.w - 0.04, gr.bh || 0.012, 0.11), ch, 0, gr.y + (i - (nb - 1) / 2) * gr.h * (0.9 / Math.max(1, nb - 1)), fe0.z - 0.02);
    const lowY = tub.yb(tub.z1 - 0.3) + (S.lowY || 0.17), fl = tub.endAt(0, lowY, true);
    put(g, rb(gr.w * 1.55, 0.15, 0.1, 0.045, 1), tr, 0, lowY, fl.z - 0.04);
    put(g, rb(gr.w * 1.9, 0.02, 0.1, 0.01, 0), tr, 0, tub.yb(tub.z1 - 0.2) + 0.03, tub.endAt(0, tub.yb(tub.z1 - 0.2) + 0.03, true).z - 0.02);
    put(g, rb(0.2, 0.05, 0.03, 0.012, 0), ch, 0, gr.y + gr.h / 2 + 0.07, tub.endAt(0, gr.y + gr.h / 2 + 0.07, true).z - 0.005);
    // номерные знаки
    if (!S.noPlateF) put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false, PLATE_FRONT), plateAtlas(), 0, lowY + 0.1, tub.endAt(0, lowY + 0.15, true).z + 0.012);
    }
    if (!S.noRear) {
    const pr = put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, true, PLATE_REAR), plateAtlas(), 0, S.tail.y - 0.22, RL.endAt(0, S.tail.y - 0.2, false).z - 0.012);
    // задний бампер-диффузор и выхлоп
    const rl = RL.yb(RL.z0 + 0.2) + 0.1;
    put(g, rb(RL.hwb(RL.z0 + 0.4) * 1.5, 0.16, 0.1, 0.05, 0), tr, 0, rl, RL.endAt(0, rl, false).z + 0.045);
    put(g, cyl(0.034, 0.16, 12, 'z'), ch, S.exhaustX, rl - 0.03, RL.endAt(S.exhaustX, rl, false).z - 0.03);
    }
    // днище
    if (!S.noUnder) put(g, rb(tub.hwb(0) * 1.55, 0.14, S.zf - S.zr + 0.5, 0.045, 0), dk, 0, 0.17, (S.zf + S.zr) / 2);
    // ---- салон: пол на уровне пояса, спинки сидений, передняя панель, руль
    const fl0 = S.floor;
    put(g, rb(S.floor.w, 0.06, fl0.z1 - fl0.z0, 0.02, 0), sm, 0, beltY - 0.01, (fl0.z0 + fl0.z1) / 2);
    for (const sx of [-1, 1]) for (const st of S.seats) {
      const top = Math.min(beltY + 0.36, gh.yt(st.z) - 0.1), brTop = top - 0.13, brH = brTop - (beltY - 0.03), xx = sx * (S.seatX || 0.37);
      if (S.cheapSeats) { put(g, bx(0.46, brH, 0.12), sm, xx, (brTop + beltY - 0.03) / 2, st.z); put(g, bx(0.2, 0.14, 0.09), sm, xx, top - 0.07, st.z - 0.03); continue; }
      put(g, rb(0.46, brH, 0.14, 0.06, 0), sm, xx, (brTop + beltY - 0.03) / 2, st.z, -0.2, 0, 0);
      put(g, rb(0.2, 0.15, 0.1, 0.04, 0), sm, xx, top - 0.07, st.z - 0.045, -0.2, 0, 0);
    }
    put(g, rb(S.floor.w, 0.2, 0.34, 0.07, 0), tr, 0, beltY + 0.02, S.dashZ).rotation.x = 0.3;
    put(g, new T.TorusGeometry(0.17, 0.017, 6, 18), tr, -0.36, beltY + 0.2, S.dashZ - 0.25, 1.05, 0, 0);
    if (S.roofRails) both((sd) => { const a = gh.P(S.gh.railB + 0.1, PI / 2 - al + 0.12, 0.04), b = gh.P(S.gh.railA - 0.2, PI / 2 - al + 0.12, 0.04); put(g, tube([[sd * a.x, a.y + 0.03, a.z], [sd * (a.x + b.x) / 2, (a.y + b.y) / 2 + 0.03, (a.z + b.z) / 2], [sd * b.x, b.y + 0.03, b.z]], 0.02, 6, 6), dk, 0, 0, 0); });
    if (S.fin) put(g, rb(0.05, 0.07, 0.2, 0.02, 0), pa, 0, gh.P(S.fin, PI / 2, 0.012).y + 0.03, S.fin);
    // ---- колёса
    if (!S.noWheels) { const wm = carWheelMats(); wm.caliper = MT.trim(); both((sd) => { for (const z of wz) wheel(g, sd * S.track, wy, z, sd, W, wm, false, (z * 3.7 + sd) % TAU); }); }
    if (S.custom) S.custom(g, { tub, gh, pa, tr, ch, dk, col, S });
    return g;
  }
  const CAR_COLS = [0xb3b8bc, 0x1e2024, 0xe4e5e1, 0x8e2430, 0x25416d, 0x2f5441, 0xb5a17e, 0x4b5258];

  // ====================================================================== легковые: спецификации
  const SEDAN = {
    M: 28, nMid: 14, arch: 0.05, sillY0: 0.2, sillY1: 0.38, beltY: 0.99, mirrorZ: 0.7, dashZ: 0.72, exhaustX: 0.52, track: 0.745, zf: 1.42, zr: -1.38,
    wheel: { R: 0.32, W: 0.215, rimR: 0.205, spokes: 5, seg: 20, lod: 1 },
    tub: { z0: -2.3, z1: 2.32, R0: 0.2, R1: 0.22, q0: 4, q1: 4.5, n: 4.6, yb: [[-2.3, 0.3], [-2.0, 0.24], [-1.4, 0.2], [1.4, 0.2], [2.0, 0.23], [2.32, 0.28]],
      yt: [[-2.3, 0.95], [-2.0, 1.02], [-1.4, 1.03], [-0.6, 1.0], [0.5, 0.99], [1.0, 0.98], [1.5, 0.94], [1.9, 0.88], [2.32, 0.8]],
      hwb: [[-2.3, 0.62], [-2.05, 0.75], [-1.5, 0.84], [0, 0.88], [1.5, 0.86], [2.05, 0.8], [2.32, 0.64]], hwt: [[-2.3, 0.66], [-2.05, 0.79], [-1.5, 0.89], [0, 0.92], [1.5, 0.9], [2.05, 0.84], [2.32, 0.68]] },
    gh: { drop: 0.24, z0: -1.5, z1: 1.04, R0: 0.06, R1: 0.05, n: 3.2, alpha: 1.12, capA: 0.42, capB: -1.15, railA: 1.02, railB: -1.46, pillars: [-0.1], beltA: -1.3, beltB: 0.88,
      yt: [[-1.5, 1.0], [-1.35, 1.1], [-1.15, 1.25], [-0.9, 1.35], [-0.6, 1.41], [-0.2, 1.445], [0.2, 1.44], [0.47, 1.4], [0.72, 1.27], [0.92, 1.12], [1.04, 1.0]],
      hwb: 0.87, hwt: 0.68, extra: [-1.35, 0.57] },
    lamp: { x: 0.64, y: 0.75, w: 0.4, h: 0.11 }, tail: { x: 0.6, y: 0.92, w: 0.34, h: 0.1 }, grille: { w: 0.62, h: 0.1, y: 0.6 },
    seams: [0.68, -0.1, -1.0], handles: [0.34, -0.74], floor: { w: 1.5, z0: -1.3, z1: 0.82 },
    seats: [{ z: 0.24 }, { z: -0.75 }],
  };

  reg('car', 'sedan', (o) => finish(buildCar(SEDAN, CAR_COLS[(o.variant | 0) % 8]), 11 + (o.variant | 0)));


  const HATCH = {
    M: 28, nMid: 12, arch: 0.05, sillY0: 0.19, sillY1: 0.36, beltY: 0.95, mirrorZ: 0.5, dashZ: 0.58, exhaustX: 0.46, track: 0.7, zf: 1.25, zr: -1.22,
    wheel: { R: 0.3, W: 0.195, rimR: 0.19, spokes: 5, double: true, seg: 20, lod: 1 },
    tub: { z0: -1.92, z1: 2.04, R0: 0.14, R1: 0.2, q0: 4.5, q1: 4.5, n: 4.6, yb: [[-1.92, 0.3], [-1.6, 0.23], [-1.3, 0.19], [1.3, 0.19], [1.8, 0.22], [2.04, 0.27]],
      yt: [[-1.92, 0.96], [-1.7, 0.98], [-1.3, 0.98], [-0.5, 0.96], [0.5, 0.96], [0.9, 0.95], [1.3, 0.92], [1.7, 0.86], [2.04, 0.78]],
      hwb: [[-1.92, 0.68], [-1.7, 0.76], [-1.3, 0.8], [0, 0.84], [1.3, 0.82], [1.8, 0.76], [2.04, 0.62]], hwt: [[-1.92, 0.72], [-1.7, 0.8], [-1.3, 0.85], [0, 0.88], [1.3, 0.86], [1.8, 0.8], [2.04, 0.66]] },
    gh: { drop: 0.24, z0: -1.9, z1: 0.9, R0: 0.05, R1: 0.05, n: 3.2, alpha: 1.1, capA: 0.36, capB: -1.45, railA: 0.88, railB: -1.86, pillars: [-0.18, -1.0], beltA: -1.7, beltB: 0.76,
      yt: [[-1.9, 0.98], [-1.86, 1.08], [-1.76, 1.2], [-1.55, 1.3], [-1.1, 1.4], [-0.5, 1.47], [0.2, 1.5], [0.42, 1.45], [0.65, 1.31], [0.8, 1.14], [0.9, 0.98]],
      hwb: 0.84, hwt: 0.69, extra: [-1.8, 0.5] },
    lamp: { x: 0.6, y: 0.74, w: 0.36, h: 0.11 }, tail: { x: 0.56, y: 0.82, w: 0.2, h: 0.3 }, grille: { w: 0.56, h: 0.09, y: 0.58 },
    seams: [0.5, -0.22, -0.95], handles: [0.2, -0.78], floor: { w: 1.42, z0: -1.4, z1: 0.72 },
    seats: [{ z: 0.1 }, { z: -0.78 }], fin: -0.9,
  };
  reg('car', 'hatch', (o) => finish(buildCar(HATCH, CAR_COLS[((o.variant | 0) + 2) % 8]), 21 + (o.variant | 0)));

  const SUV = {
    M: 28, nMid: 14, arch: 0.07, sillY0: 0.3, sillY1: 0.5, beltY: 1.12, mirrorZ: 0.75, dashZ: 0.8, exhaustX: 0.6, track: 0.78, zf: 1.5, zr: -1.3, lipBlack: true, lipR: 0.03, roofRails: true,
    wheel: { R: 0.37, W: 0.245, rimR: 0.245, spokes: 5, double: true, seg: 20, lod: 1 },
    tub: { z0: -2.3, z1: 2.36, R0: 0.2, R1: 0.24, q0: 4.5, q1: 4.5, n: 5.0, yb: [[-2.3, 0.4], [-2.0, 0.32], [-1.4, 0.28], [1.4, 0.28], [2.0, 0.32], [2.36, 0.4]],
      yt: [[-2.3, 1.12], [-2.0, 1.14], [-1.4, 1.14], [-0.5, 1.12], [0.6, 1.12], [1.1, 1.12], [1.6, 1.08], [2.0, 1.02], [2.36, 0.94]],
      hwb: [[-2.3, 0.7], [-2.1, 0.8], [-1.5, 0.9], [0, 0.93], [1.5, 0.92], [2.1, 0.86], [2.36, 0.7]], hwt: [[-2.3, 0.74], [-2.1, 0.83], [-1.5, 0.94], [0, 0.96], [1.5, 0.95], [2.1, 0.89], [2.36, 0.73]] },
    gh: { drop: 0.26, z0: -2.26, z1: 1.2, R0: 0.06, R1: 0.05, n: 3.6, alpha: 1.2, capA: 0.52, capB: -2.05, railA: 1.18, railB: -2.2, railR: 0.04, pillars: [0.0, -1.2], beltA: -2.1, beltB: 1.0,
      yt: [[-2.26, 1.1], [-2.22, 1.3], [-2.12, 1.58], [-2.0, 1.7], [-1.5, 1.74], [-0.5, 1.755], [0.3, 1.74], [0.62, 1.68], [0.9, 1.52], [1.08, 1.32], [1.2, 1.12]],
      hwb: 0.92, hwt: 0.78, extra: [-2.1, 0.62] },
    lamp: { x: 0.68, y: 0.9, w: 0.36, h: 0.12 }, tail: { x: 0.7, y: 0.86, w: 0.18, h: 0.4 }, grille: { w: 0.7, h: 0.2, y: 0.82 }, lowY: 0.2, fog: { x: 0.62, y: 0.55 },
    seams: [0.78, 0.0, -0.78, -1.6], handles: [0.4, -0.25, -0.98], floor: { w: 1.6, z0: -2.0, z1: 0.95 },
    seats: [{ z: 0.32 }, { z: -0.62 }, { z: -1.5 }],
  };
  reg('car', 'suv', (o) => finish(buildCar(SUV, CAR_COLS[((o.variant | 0) + 5) % 8]), 31 + (o.variant | 0)));

  const VAN = {
    M: 28, nMid: 12, arch: 0.06, sillY0: 0.22, sillY1: 0.44, beltY: 1.05, mirrorZ: 0.95, dashZ: 1.0, exhaustX: 0.6, track: 0.78, zf: 1.5, zr: -1.2, cargoTop: 1.85, cargoSeams: [-0.45],
    wheel: { R: 0.34, W: 0.205, rimR: 0.2, spokes: 5, seg: 20, lod: 1 },
    tub: { z0: -2.3, z1: 2.52, R0: 0.2, R1: 0.24, q0: 4.5, q1: 4, n: 4.6, yb: [[-2.3, 0.4], [-2.0, 0.3], [-1.3, 0.26], [1.5, 0.26], [2.2, 0.3], [2.52, 0.34]],
      yt: [[-2.3, 1.05], [-1.0, 1.05], [0.5, 1.05], [1.4, 1.02], [1.9, 0.95], [2.52, 0.84]],
      hwb: [[-2.3, 0.78], [-1.5, 0.88], [0, 0.9], [1.5, 0.88], [2.2, 0.82], [2.52, 0.64]], hwt: [[-2.3, 0.8], [-1.5, 0.9], [0, 0.93], [1.5, 0.91], [2.2, 0.85], [2.52, 0.68]] },
    cargo: { z0: -2.3, z1: 0.18, R0: 0.14, R1: 0.1, q0: 4.5, q1: 4, n: 5.4, yb: 0.36, yt: [[-2.3, 1.93], [0.18, 1.95]], hwb: 0.9, hwt: 0.88 },
    gh: { drop: 0.3, z0: -0.5, z1: 1.55, R0: 0.05, R1: 0.05, n: 3.4, alpha: 1.15, capA: 0.65, capB: -0.5, railA: 1.52, railB: -0.45, railR: 0.04, pillars: [0.08], beltA: -0.3, beltB: 1.3,
      yt: [[-0.5, 1.91], [0.3, 1.92], [0.65, 1.9], [0.9, 1.75], [1.15, 1.5], [1.4, 1.25], [1.55, 1.07]],
      hwb: 0.89, hwt: 0.8, extra: [0.4] },
    lamp: { x: 0.66, y: 0.83, w: 0.36, h: 0.14 }, tail: { x: 0.8, y: 1.0, w: 0.14, h: 0.42 }, grille: { w: 0.66, h: 0.16, y: 0.7 }, lowY: 0.18,
    seams: [1.05], handles: [0.65], floor: { w: 1.7, z0: -0.1, z1: 1.35 },
    seats: [{ z: 0.62 }],
  };
  reg('car', 'van', (o) => finish(buildCar(VAN, CAR_COLS[((o.variant | 0) + 1) % 8]), 41 + (o.variant | 0)));

  // @@APPEND

  // ====================================================================== груз: ящики с овощами, мешки, дерево
  const woodTex = (key, base, grain) => canvasTex('wood_' + key, 256, 256, (g, w, h) => {
    const r = lcg(77); g.fillStyle = hex(base); g.fillRect(0, 0, w, h);
    const n = 5, pw = w / n;
    for (let p = 0; p < n; p++) {
      const x0 = p * pw, tone = (r() - 0.5) * 0.18;
      g.fillStyle = hex(shade(base, 1 + tone)); g.fillRect(x0, 0, pw, h);
      for (let i = 0; i < 26; i++) { // волокна
        const y = r() * h, len = 40 + r() * 140, x = x0 + 3 + r() * (pw - 6);
        g.strokeStyle = 'rgba(' + grain + ',' + (0.08 + r() * 0.18) + ')'; g.lineWidth = 0.8 + r() * 1.6; g.beginPath(); g.moveTo(x, y);
        g.bezierCurveTo(x + (r() - 0.5) * 6, y + len * 0.3, x + (r() - 0.5) * 6, y + len * 0.7, x + (r() - 0.5) * 5, y + len); g.stroke();
      }
      if (r() < 0.7) { const kx = x0 + pw * (0.25 + r() * 0.5), ky = r() * h; g.fillStyle = 'rgba(' + grain + ',0.35)'; g.beginPath(); g.ellipse(kx, ky, 4 + r() * 3, 8 + r() * 6, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(' + grain + ',0.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(kx, ky, 8 + r() * 3, 15 + r() * 6, 0, 0, TAU); g.stroke(); }
      g.fillStyle = 'rgba(20,12,6,0.5)'; g.fillRect(x0, 0, 1.5, h); // шов между досками
    }
  });
  const woodC = {};
  /** Деревянный PBR-материал с текстурой; color — оттенок (покраска). */
  const woodM = (tint, base) => { const k = tint + '|' + (base || 0); return woodC[k] || (woodC[k] = new T.MeshStandardMaterial({ map: woodTex('n' + (base || 0), base || 0xc6a06a, '60,38,18'), color: tint == null ? 0xffffff : tint, metalness: 0, roughness: 0.82, envMapIntensity: 0.25 })); };
  const ironM = () => C.metal(0x2c2e32, { roughness: 0.55 });

  let _sack = null;
  /** Бугристость: смещает вершины вдоль нормали-радиуса функцией от позиции (шов не рвётся), нормали пересчитываются со склейкой по позиции. */
  function lumpy(geo, amp, ph) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x), k = 1 + amp * (Math.sin(th * 3 + y * 11 + ph) * 0.6 + Math.sin(th * 5 - y * 7 + ph * 2) * 0.4); p.setXYZ(i, x * k, y, z * k); }
    return crease(geo, 85);
  }
  const sackGeo = () => _sack || (_sack = lumpy(lat([[0.001, 0], [0.15, 0.006], [0.225, 0.07], [0.255, 0.19], [0.225, 0.31], [0.15, 0.39], [0.082, 0.435], [0.056, 0.465], [0.075, 0.495], [0.055, 0.535], [0.02, 0.56], [0.001, 0.55]], 14, 'y', { hard: 75 }), 0.08, 1.3));
  /** Мешок (джут), основание на y. */
  function sack(g, x, y, z, ry, sc, tone) {
    const o = put(g, sackGeo(), lam(tone || 0xc8b078), x, y, z, 0.06 * Math.sin(ry * 3), ry || 0, 0.09 * Math.cos(ry * 2)); o.scale.set(1.1 * (sc || 1), 0.92 * (sc || 1), 0.9 * (sc || 1)); return o;
  }
  const _sp = {};
  const ball = (n) => _sp[n] || (_sp[n] = new T.SphereGeometry(1, n, Math.max(4, n - 2)));
  const VEG = { tomato: [0xd8352a, 0.045, 0.2], cabbage: [0x92c45e, 0.095, 0.3], potato: [0xb6925c, 0.05, 0.2], pumpkin: [0xe5821f, 0.105, 0.3], apple: [0xc9372c, 0.042, 0.2], onion: [0xd19a4a, 0.048, 0.2], lemon: [0xe8d13a, 0.04, 0.2], beet: [0x8a2b4a, 0.05, 0.2] };
  /** Овощи россыпью на прямоугольнике w×d с центром (cx,cy,cz). */
  function pile(g, kind, cx, cy, cz, w, d, rnd) {
    if (kind === 'carrot') {
      const n = Math.max(4, Math.round(d / 0.06));
      for (let i = 0; i < n; i++) { const zz = cz - d / 2 + (i + 0.5) * d / n; for (const lay of [0, 1]) { const o = put(g, cyl(0.02, 0.5, 6, 'x', 0.006), lam(0xee7f1c), cx + (rnd() - 0.5) * 0.03, cy + 0.02 + lay * 0.035, zz + (rnd() - 0.5) * 0.015, 0, (rnd() - 0.5) * 0.15, 0); o.scale.x = w / 0.5; } put(g, bx(0.1, 0.03, 0.04), lam(0x4f9d3a), cx - w / 2 + 0.03, cy + 0.07, zz); }
      return;
    }
    const v = VEG[kind] || VEG.tomato, r = v[1], nx = Math.max(2, Math.floor(w / (r * 2.25))), nz = Math.max(2, Math.floor(d / (r * 2.25)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const px = cx - w / 2 + r + (nx > 1 ? (w - 2 * r) * i / (nx - 1) : 0) + (rnd() - 0.5) * r * 0.4, pz = cz - d / 2 + r + (nz > 1 ? (d - 2 * r) * j / (nz - 1) : 0) + (rnd() - 0.5) * r * 0.4;
      const o = put(g, ball(6), lam(shade(v[0], 0.9 + rnd() * 0.2)), px, cy + r * 0.55 + (i + j) % 2 * r * 0.35, pz); o.scale.set(r, r * (kind === 'pumpkin' ? 0.8 : 1), r);
      if (kind === 'cabbage') { const o2 = put(g, ball(6), lam(0x6f9f3e), px, cy + r * 0.3, pz); o2.scale.set(r * 1.08, r * 0.7, r * 1.08); }
      if (kind === 'pumpkin') put(g, cyl(0.015, 0.05, 5), lam(0x5d6b2a), px, cy + r * 1.0, pz);
    }
  }
  /** Деревянный ящик (открытый сверху, внутри овощи). */
  function crate(g, x, y, z, ry, kind, rnd, sx) {
    const w = 0.54 * (sx || 1), h = 0.27, d = 0.4, grp = new T.Group(); grp.position.set(x, y, z); grp.rotation.y = ry || 0;
    put(grp, bx(w, h, d), lam(0xa87b46), 0, h / 2, 0);
    for (const yy of [0.045, 0.135, 0.225]) put(grp, bx(w + 0.012, 0.024, d + 0.012), lam(0x8a6334), 0, yy, 0);
    for (const sxx of [-1, 1]) put(grp, bx(0.03, h + 0.02, d + 0.016), lam(0x8a6334), sxx * (w / 2 - 0.015), h / 2, 0);
    pile(grp, kind, 0, h - 0.04, 0, w - 0.06, d - 0.06, rnd);
    g.add(grp); return grp;
  }
  /** Брезент по профилю: path(z) — высота над полом, x-профиль r(|x|). Возвращает геометрию. */
  function tarpGeo(o) {
    const zA = o.zA, zB = o.zB, fl = o.floor, H = o.H, hx = o.hx, edge = o.edge || 0.24, rp = interp(o.rx || [[0, 1], [0.5, 0.96], [0.82, 0.86], [0.96, 0.62], [1.06, 0.3]]);
    const f = (u, v, out) => {
      const x = lerp(-hx, hx, u), z = lerp(zA, zB, v), t = clamp(Math.min(Math.abs(zA - z), Math.abs(z - zB)) / edge, 0, 1), hh = H * (1 - Math.pow(1 - t, 2.4));
      const wob = 0.014 * Math.sin(x * 9 + z * 6) * t + 0.01 * Math.sin(x * 17 - z * 11) * t;
      out.set(x, fl + hh * rp(Math.abs(x)) * 1 + wob + 0.0, z);
    };
    return { geo: sheet(f, 22, 18, UP), f };
  }

  // ====================================================================== PICKUP (ур. 1): двойная кабина, кузов с тентом и ящиками
  const FLEET = [0xe6e8e4, 0xa02e29, 0x284a78, 0x2f6a49, 0xc7a02f, 0x8c949b];
  function pickupBed(g, X, o) {
    const { pa, tr, ch, dk, tub } = X, rnd = lcg(900 + (o.variant | 0)), ironm = dk;
    const zf = -0.8, zb = -2.88, xo = 0.95, yTop = 1.48, floorY = 0.93;
    // боковины кузова с вырезом под колесо (профиль z,y)
    const acx = -1.65, acy = 0.4, ar = 0.5, yb0 = 0.6, dz = Math.sqrt(ar * ar - (yb0 - acy) * (yb0 - acy)), aL = Math.atan2(yb0 - acy, -dz), aR = Math.atan2(yb0 - acy, dz);
    const pts = [[zb, yb0], [acx - dz, yb0]], rad = [0.03, 0, ];
    for (let i = 1; i < 14; i++) { const a = lerp(aL, aR, i / 14); pts.push([acx + ar * Math.cos(a), acy + ar * Math.sin(a)]); rad.push(0); }
    pts.push([acx + dz, yb0], [zf, yb0], [zf, yTop], [zb, yTop]); rad.push(0, 0.03, 0.03, 0.03);
    const side = ex(pts, 0.1, { plane: 'zy', b: 0.012, r: rad, seg: 2, cs: 3 });
    both((sd) => {
      put(g, side, pa, sd * xo, 0, 0);
      put(g, bx(0.15, 0.04, zf - zb + 0.02), tr, sd * xo, yTop + 0.012, (zf + zb) / 2); // верхняя планка борта
      // чёрная окантовка арки
      const lp = []; for (let i = 0; i <= 16; i++) { const a = lerp(aL - 0.05, aR + 0.05, i / 16); lp.push([sd * (xo + 0.05), acy + (ar + 0.012) * Math.sin(a), acx + (ar + 0.012) * Math.cos(a)]); }
      put(g, tube(lp, 0.03, 20, 5), tr, 0, 0, 0);
      // колёсная ниша внутри кузова
      put(g, rb(0.3, 0.46, 1.1, 0.07, 0), tr, sd * 0.76, floorY + 0.2, acx);
      // боковые фонари
      const bz = zb - 0.02;
      put(g, rb(0.13, 0.4, 0.09, 0.03, 0), tr, sd * 0.9, 1.2, bz); put(g, rb(0.1, 0.36, 0.1, 0.03, 0), MT.lensR(), sd * 0.9, 1.2, bz - 0.012); put(g, rb(0.09, 0.1, 0.1, 0.02, 0), MT.lampA(), sd * 0.9, 1.03, bz - 0.017);
      // подножки
      put(g, rb(0.22, 0.07, 1.7, 0.03, 0), tr, sd * 1.0, 0.55, 0.28); put(g, rb(0.05, 0.05, 1.7, 0.02, 0), ch, sd * 1.1, 0.57, 0.28);
      // рама и подвеска (видны снизу)
      put(g, rb(0.14, 0.22, 5.0, 0.04, 0), ironm, sd * 0.5, 0.47, -0.2);
      put(g, rb(0.08, 0.05, 1.2, 0.02, 0), ironm, sd * 0.72, 0.4, -1.65); put(g, rb(0.08, 0.05, 0.9, 0.02, 0), ironm, sd * 0.72, 0.36, 1.75);
      put(g, cyl(0.04, 0.5, 8, 'y'), ironm, sd * 0.78, 0.5, -1.65);
    });
    put(g, cyl(0.09, 1.7, 12, 'x'), ironm, 0, 0.4, -1.65); put(g, sphG(0.17, 0.17, 0.2, 12, 8), ironm, 0, 0.4, -1.62);
    put(g, cyl(0.07, 1.7, 12, 'x'), ironm, 0, 0.4, 1.75); put(g, sphG(0.16, 0.16, 0.16, 12, 8), ironm, 0, 0.4, 1.8);
    put(g, cyl(0.035, 3.4, 8, 'z'), ironm, 0, 0.42, 0.1);
    // пол, переборка, задний борт
    put(g, rb(1.82, 0.07, zf - zb, 0.025, 0), ironm, 0, floorY, (zf + zb) / 2);
    put(g, rb(1.86, 0.62, 0.1, 0.035, 1), pa, 0, 1.24, zf - 0.05);
    put(g, rb(1.8, 0.54, 0.09, 0.03, 1), pa, 0, 1.21, zb - 0.02);
    put(g, rb(1.62, 0.2, 0.02, 0.03, 0), tr, 0, 1.15, zb - 0.075); // штамповка
    put(g, rb(0.5, 0.05, 0.03, 0.02, 0), ch, 0, 1.4, zb - 0.075); // ручка
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, true, PLATE_REAR), plateAtlas(), 0, 0.92, zb - 0.07);
    // бамперы: передний хромированный и задний ступенчатый
    const fz = tub.endAt(0, 0.6, true).z;
    put(g, rb(2.04, 0.3, 0.24, 0.09, 1), ch, 0, 0.6, fz + 0.0); put(g, rb(1.3, 0.2, 0.2, 0.06, 0), tr, 0, 0.36, fz - 0.14);
    put(g, rb(0.8, 0.12, 0.05, 0.03, 0), tr, 0, 0.6, fz + 0.115);
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false, PLATE_FRONT), plateAtlas(), 0, 0.53, fz + 0.14);
    both((sd) => { put(g, cyl(0.05, 0.07, 14, 'z'), MT.lensH(), sd * 0.78, 0.6, fz + 0.12); put(g, cyl(0.025, 0.2, 8, 'z'), tr, sd * 0.3, 0.42, fz + 0.1); });
    put(g, rb(1.96, 0.22, 0.26, 0.07, 1), ch, 0, 0.62, zb - 0.16); put(g, bx(0.66, 0.04, 0.2), tr, 0, 0.74, zb - 0.16);
    put(g, rb(0.2, 0.2, 0.4, 0.03, 0), ironm, 0, 0.44, zb - 0.12); // фаркоп
    put(g, cyl(0.04, 0.3, 12, 'z'), ch, 0.5, 0.45, zb - 0.1);
    // ---- груз: ящики с овощами у кабины, остальное под зелёным тентом
    const fl = floorY + 0.035;
    crate(g, -0.44, fl, -1.06, 0.0, 'tomato', rnd); crate(g, 0.44, fl, -1.06, 0.0, 'cabbage', rnd); crate(g, -0.44, fl + 0.27, -1.06, 0.05, 'carrot', rnd, 0.9); crate(g, 0.05, fl, -1.06, 0.0, 'pumpkin', rnd, 0.9);
    sack(g, 0.2, fl, -1.25, 0.4, 0.9, 0xc8b078);
    const tp = tarpGeo({ zA: -1.42, zB: -2.8, floor: fl, H: 0.62, hx: 1.0, edge: 0.26, rx: [[0, 1], [0.5, 0.97], [0.8, 0.95], [0.95, 0.9], [1.0, 0.86]] });
    put(g, tp.geo, lam(0x41603c), 0, 0, 0);
    const v = new T.Vector3();
    for (const zr of [-1.7, -2.1, -2.5]) { const rp = []; for (let i = 0; i <= 14; i++) { tp.f(i / 14, (zr - -1.42) / (-2.8 - -1.42), v); rp.push([v.x, v.y + 0.012, v.z]); } put(g, tube(rp, 0.011, 28, 4), lam(0xd9c9a0), 0, 0, 0); }
    // крепёжные петли по бортам
  }
  const PICKUP = {
    M: 24, nMid: 8, arch: 0.08, sillY0: 0.4, sillY1: 0.6, beltY: 1.28, mirrorZ: 1.08, dashZ: 1.12, exhaustX: 0.5, track: 0.84, zf: 1.9, zr: -1.65, lipBlack: true, lipR: 0.03,
    archZ: [1.9], sillA: -0.7, noRear: true, noUnder: true, noPlateF: true, lowY: 0.14, mirror: { w: 0.12, h: 0.26, d: 0.2, black: true },
    wheel: { R: 0.4, W: 0.275, rimR: 0.235, spokes: 5, double: true, seg: 20, lod: 1 },
    tub: { z0: -0.8, z1: 2.86, R0: 0.08, R1: 0.2, q0: 5, q1: 5, n: 5.6, yb: [[-0.8, 0.46], [0.5, 0.44], [2.3, 0.44], [2.86, 0.5]],
      yt: [[-0.8, 1.3], [0.6, 1.29], [1.3, 1.29], [2.0, 1.27], [2.5, 1.24], [2.86, 1.19]],
      hwb: [[-0.8, 0.95], [0, 0.97], [2.3, 0.95], [2.86, 0.78]], hwt: [[-0.8, 0.98], [0, 1.0], [2.3, 0.98], [2.86, 0.82]] },
    gh: { drop: 0.3, z0: -0.78, z1: 1.32, R0: 0.05, R1: 0.05, n: 3.8, alpha: 1.2, capA: 0.72, capB: -0.62, railA: 1.3, railB: -0.74, railR: 0.04, pillars: [0.15], beltA: -0.6, beltB: 1.18,
      yt: [[-0.78, 1.4], [-0.74, 1.75], [-0.64, 1.94], [-0.4, 2.0], [0.5, 2.02], [0.78, 1.98], [1.02, 1.78], [1.22, 1.5], [1.32, 1.3]],
      hwb: 0.93, hwt: 0.8, extra: [0.7] },
    lamp: { x: 0.72, y: 1.02, w: 0.44, h: 0.15 }, tail: { x: 0.7, y: 1.1, w: 0.2, h: 0.3 }, grille: { w: 0.92, h: 0.38, y: 0.9, bars: 5, bh: 0.02 }, fog: null,
    seams: [1.27, 0.15, -0.74], handles: [0.62, -0.3], floor: { w: 1.7, z0: -0.6, z1: 1.1 }, seats: [{ z: 0.58 }, { z: -0.3 }],
  };
  reg('truck', 'pickup', (o) => {
    const spec = Object.assign({}, PICKUP, { custom: (g, X) => pickupBed(g, X, o) });
    return center(finish(buildCar(spec, FLEET[((o.variant | 0) + 2) % 6], o), 51 + (o.variant | 0)));
  });

  // @@APPEND

  // ====================================================================== CART (ур. 0): ручная двухколёсная телега (без животных — оглобли и поперечная рукоять для человека)
  const CART_PAINT = [0x3f6b4a, 0x9a3b30, 0x3d5f86, 0xc09a3e, 0x6b6f72, null];
  function spokedWheel(g, x, y, z, side, R, wood, dark, iron) {
    const wg = new T.Group(); wg.position.set(x, y, z); if (side < 0) wg.rotation.y = PI; g.add(wg);
    const tw = 0.05; // половина ширины шины
    // стальной бандаж, обод из дерева, ступица
    put(wg, lat([[R, -tw], [R, tw], [R - 0.045, tw], [R - 0.045, -tw], [R, -tw]], 36, 'x', { hard: 30 }), iron, 0, 0, 0);
    put(wg, lat([[R - 0.045, -0.042], [R - 0.045, 0.042], [R - 0.125, 0.042], [R - 0.125, -0.042], [R - 0.045, -0.042]], 36, 'x', { hard: 30 }), wood, 0, 0, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; put(wg, bx(0.088, 0.09, 0.008), iron, 0, Math.sin(a + 0.26) * (R - 0.085), Math.cos(a + 0.26) * (R - 0.085), PI / 2 - (a + 0.26), 0, 0); } // стыки секторов обода
    put(wg, lat([[0.001, -0.125], [0.07, -0.125], [0.1, -0.095], [0.128, -0.035], [0.128, 0.035], [0.1, 0.095], [0.07, 0.125], [0.001, 0.125]], 20, 'x', { hard: 60 }), wood, 0, 0, 0);
    for (const aa of [-0.065, 0.065]) put(wg, cyl(0.138, 0.03, 20, 'x'), iron, aa, 0, 0);
    put(wg, cyl(0.05, 0.05, 12, 'x'), iron, 0.135, 0, 0);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, dish = 0.018; // чуть «тарелкой»
      put(wg, rod(V3(dish, Math.sin(a) * 0.1, Math.cos(a) * 0.1), V3(-dish, Math.sin(a) * (R - 0.11), Math.cos(a) * (R - 0.11)), 0.03, 8, 0.019), wood, 0, 0, 0);
    }
    return wg;
  }
  function buildCart(o) {
    const g = new T.Group(), v = (o.variant | 0) % 6, rnd = lcg(300 + v), paintC = CART_PAINT[v];
    const wN = woodM(0xffffff, 0xb28a58), wD = woodM(0xffffff, 0x8c6c42), wP = paintC == null ? woodM(0xffffff, 0xa88252) : woodM(paintC, 0xe9e7e0), iron = ironM();
    const R = 0.82, tr = 0.88, zOff = -0.88; // zOff — центрирование по опоре
    g.position.z = zOff;
    // колёса и ось
    both((sd) => spokedWheel(g, sd * tr, R, 0, sd, R, wD, wN, iron));
    put(g, cyl(0.04, 2.1, 12, 'x'), iron, 0, R, 0);
    // рама: лонжероны, поперечины, колодки оси
    both((sd) => {
      put(g, rb(0.1, 0.12, 2.9, 0.02, 0), wN, sd * 0.46, 0.93, 0.05);
      put(g, rb(0.15, 0.1, 0.22, 0.02, 0), wN, sd * 0.46, 0.8 + 0.07 * 0, 0);
      put(g, bx(0.025, 0.2, 0.34), iron, sd * 0.53, 0.88, 0); // стяжка оси
    });
    for (const zz of [-1.15, -0.5, 0.6, 1.1]) put(g, rb(1.24, 0.08, 0.1, 0.02, 0), wN, 0, 0.93, zz);
    // дно: доски вдоль
    put(g, rb(1.3, 0.045, 2.5, 0.012, 0), wN, 0, 1.0, 0.0);
    // борта: две доски + стойки + верхний брус
    both((sd) => {
      for (const yy of [1.1, 1.33]) put(g, rb(0.04, 0.2, 2.5, 0.01, 0), wP, sd * 0.66, yy, 0.0);
      for (const zz of [-1.2, -0.6, 0, 0.6, 1.2]) { put(g, rb(0.07, 0.56, 0.07, 0.015, 0), wN, sd * 0.69, 1.25, zz); put(g, bx(0.012, 0.1, 0.075), iron, sd * 0.727, 1.05, zz); put(g, bx(0.012, 0.1, 0.075), iron, sd * 0.727, 1.4, zz); }
      put(g, rb(0.08, 0.05, 2.6, 0.02, 0), wN, sd * 0.69, 1.55, 0);
    });
    put(g, rb(1.3, 0.3, 0.04, 0.01, 0), wP, 0, 1.15, 1.27); // передний борт
    put(g, rb(1.3, 0.1, 0.05, 0.015, 0), wN, 0, 1.33, 1.27);
    put(g, rb(1.3, 0.4, 0.04, 0.01, 0), wP, 0, 1.2, -1.27); // задний борт
    put(g, rb(1.36, 0.06, 0.06, 0.02, 0), wN, 0, 1.43, -1.27);
    for (const sx of [-0.5, 0.5]) put(g, cyl(0.014, 0.1, 8, 'z'), iron, sx, 1.2, -1.33); // цепные крюки
    // оглобли и поперечная рукоять (для человека), опорная стойка
    both((sd) => {
      put(g, rod(V3(sd * 0.36, 0.935, -0.4), V3(sd * 0.4, 0.9, 2.95), 0.04, 10, 0.03), wN, 0, 0, 0);
      put(g, bx(0.03, 0.05, 0.28), iron, sd * 0.36, 0.995, 0.9); // накладки
      put(g, rod(V3(sd * 0.4, 0.9, 2.55), V3(sd * 0.42, 0.01, 2.75), 0.028, 8, 0.024), wN, 0, 0, 0); // опорная нога
      put(g, cyl(0.045, 0.02, 10, 'y'), iron, sd * 0.42, 0.01, 2.75);
    });
    put(g, cyl(0.032, 1.08, 12, 'x'), wN, 0, 0.9, 2.97); put(g, rb(0.05, 0.05, 0.05, 0.02, 0), wN, 0.55, 0.9, 2.97); put(g, rb(0.05, 0.05, 0.05, 0.02, 0), wN, -0.55, 0.9, 2.97);
    put(g, cyl(0.02, 0.9, 8, 'x'), wN, 0, 0.66, 2.73); // распорка между ногами
    put(g, rod(V3(-0.4, 0.93, 1.0), V3(0.4, 0.93, 2.0), 0.014, 6), iron, 0, 0, 0); // раскос
    // ---- груз: мешки сзади, ящики с овощами впереди
    const fl = 1.022;
    sack(g, -0.36, fl, -0.9, 0.3, 1, 0xc8b078); sack(g, 0.0, fl, -0.96, 1.6, 1, 0xbca46c); sack(g, 0.38, fl, -0.88, 2.4, 1, 0xc8b078);
    sack(g, -0.18, fl, -0.5, 0.9, 0.95, 0xd0ba84); sack(g, 0.22, fl, -0.52, 3.1, 0.95, 0xbca46c); sack(g, 0.02, fl + 0.34, -0.8, 0.5, 0.9, 0xc8b078);
    crate(g, -0.32, fl, 0.26, 0.02, 'tomato', rnd); crate(g, 0.32, fl, 0.26, -0.02, 'cabbage', rnd);
    crate(g, -0.32, fl, 0.76, 0.0, 'carrot', rnd); crate(g, 0.32, fl, 0.76, 0.03, 'potato', rnd);
    crate(g, 0.0, fl + 0.27, 0.5, 0.1, 'apple', rnd, 0.92);
    for (const [px, pz] of [[-0.35, 1.07], [0.3, 1.05]]) { const o2 = put(g, ball(10), lam(0xe5821f), px, fl + 0.1, pz); o2.scale.set(0.15, 0.12, 0.15); put(g, cyl(0.015, 0.05, 5), lam(0x5d6b2a), px, fl + 0.21, pz); }
    return center(finish(g, 61 + v));
  }
  reg('truck', 'cart', (o) => buildCart(o));

  // @@APPEND

  // ====================================================================== общие детали грузовиков
  /** Полосы: верхняя половина текстуры красно-белая (светоотражающая лента), нижняя жёлто-чёрная (предупреждение). */
  const hazardMat = () => texPbr('hazard', 256, 256, (g, w) => {
    g.scale(1, 256 / 192);
    const band = (y0, y1, c1, c2) => {
      g.save(); g.beginPath(); g.rect(0, y0, w, y1 - y0); g.clip(); g.fillStyle = c1; g.fillRect(0, y0, w, y1 - y0); g.fillStyle = c2;
      const hh = y1 - y0, sl = hh * 1.45;
      for (let i = -2; i < 8; i++) { const x = i * 64; g.beginPath(); g.moveTo(x, y1); g.lineTo(x + 32, y1); g.lineTo(x + 32 + sl, y0); g.lineTo(x + sl, y0); g.closePath(); g.fill(); }
      g.restore();
    };
    band(0, 64, '#f3f2ee', '#c4201a'); band(64, 128, '#e9bf1c', '#1a1a1a');
    const plate = (x, txt, yel) => {
      g.fillStyle = yel ? '#e8c43a' : '#f2f1ea'; g.fillRect(x, 128, w / 2, 64); g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.strokeRect(x + 2, 130, w / 2 - 4, 60);
      g.fillStyle = '#17365f'; g.fillRect(x + 4, 132, 14, 56); g.fillStyle = '#1b1b1b'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + w / 4 + 8, 162);
    };
    plate(0, 'FM 5870'); plate(w / 2, 'FA 2431', true);
  }, { roughness: 0.45, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const HZ_RW = (rep) => [0, 2 / 3, rep, 1], HZ_YB = (rep) => [0, 1 / 3, rep, 2 / 3], HZ_PF = [0, 0, 0.5, 1 / 3], HZ_PR = [1, 0, 0.5, 1 / 3];
  /** Мудфлэп (брызговик): резиновый щиток на кронштейне. */
  function mudflap(g, x, y, z, w, h, M) { put(g, bx(w, h, 0.014), M.tr, x, y, z); put(g, bx(w * 1.02, 0.03, 0.03), M.dk, x, y + h / 2 + 0.012, z + 0.012); put(g, bx(w * 0.56, h * 0.16, 0.018), M.ch, x, y - h * 0.18, z - 0.001); }
  /** Крыло-дуга над колесом (профиль z,y), ширина по x = w. */
  function fenderArc(g, x, zc, yc, R, w, th, M, ang0, ang1, zoff) {
    const pts = [], a0 = ang0 == null ? 0.05 : ang0, a1 = ang1 == null ? PI - 0.05 : ang1, ro = R + 0.04, ri = R + 0.04 - th, n = 6;
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([zc + ro * Math.cos(a), yc + ro * Math.sin(a)]); }
    for (let i = n; i >= 0; i--) { const a = lerp(a0, a1, i / n); pts.push([zc + ri * Math.cos(a), yc + ri * Math.sin(a)]); }
    put(g, ex(pts, w, { plane: 'zy', b: 0, r: 0.004, seg: 1, cs: 1 }), M, x, 0, zoff || 0);
  }
  /** Ось с дифференциалом/балкой, рессорами. */
  function axle(g, z, y, halfTrack, dk, diff, leaf) {
    put(g, cyl(0.07, halfTrack * 2, 12, 'x'), dk, 0, y, z);
    if (diff) put(g, sphG(0.22, 0.2, 0.24, 10, 6), dk, 0, y - 0.01, z - 0.03);
    if (leaf) both((sd) => { put(g, rb(0.09, 0.06, 1.15, 0.02, 0), dk, sd * 0.62, y + 0.15, z); put(g, bx(0.12, 0.12, 0.1), dk, sd * 0.62, y + 0.08, z); });
  }
  /** Фирменная графика борта (вымышленная «FARM FRESH»). w×h — пропорции борта; rep — сколько раз повторить логотип. */
  function printTex(col0, key, w, h, rep) {
    const col = inkCol(col0);
    const ph = Math.pow(2, Math.ceil(Math.log2(h)));
    return texPbr('print_' + key, w, ph, (g) => {
      g.scale(1, ph / h); const css = hex(col), u = h;
      g.fillStyle = '#eef0ec'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 11) { g.fillStyle = 'rgba(0,0,0,' + (0.012 + (x % 33 === 0 ? 0.02 : 0)) + ')'; g.fillRect(x, 0, 3, h); }
      if (rep > 1) { g.fillStyle = 'rgba(70,74,70,0.16)'; for (let x = w / 11; x < w - 4; x += w / 11) g.fillRect(x - 1, 0, 2.5, h); g.fillStyle = 'rgba(70,74,70,0.2)'; for (let x = 8; x < w; x += 22) { g.fillRect(x, h * 0.03, 3, 3); } }
      g.fillStyle = css; g.fillRect(0, h * 0.82, w, h * 0.18);
      g.fillStyle = '#eef0ec'; g.fillRect(0, h * 0.775, w, h * 0.014); g.fillStyle = hex(shade(col, 1.25)); g.fillRect(0, h * 0.79, w, h * 0.02);
      g.strokeStyle = css; g.lineWidth = h * 0.012; g.beginPath(); g.moveTo(0, h * 0.745); g.lineTo(w, h * 0.745); g.stroke();
      for (let k = 0; k < (rep || 1); k++) {
        const x0 = w * (rep > 1 ? 0.04 + k * 0.5 : 0.04), cx = x0 + 0.5 * u, cy = h * 0.4, r = h * 0.2;
        g.fillStyle = hex(0xf2b632); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
        g.fillStyle = hex(0x3f8a43); g.beginPath(); g.ellipse(cx - r * 0.2, cy + r * 0.05, r * 0.62, r * 0.22, -0.9, 0, TAU); g.fill(); g.beginPath(); g.ellipse(cx + r * 0.25, cy - r * 0.05, r * 0.62, r * 0.22, 0.9, 0, TAU); g.fill();
        g.fillStyle = hex(0x2d6a30); g.fillRect(cx - 3, cy + r * 0.05, 6, r * 0.8);
        const avail = w / (rep || 1) - 0.07 * w - 0.95 * u, fs = Math.min(h * 0.34, avail / 7.4); g.fillStyle = css; g.font = 'italic 900 ' + Math.round(fs) + 'px "Arial Black", Impact, sans-serif'; g.textBaseline = 'alphabetic'; g.fillText('FARM FRESH', x0 + 0.95 * u, h * 0.5);
        g.fillStyle = '#4b5258'; g.font = '600 ' + Math.round(Math.min(h * 0.1, fs * 0.3)) + 'px sans-serif'; g.fillText('FROM FIELD TO MARKET  ·  COLD CHAIN DELIVERY', x0 + 0.97 * u, h * 0.5 + Math.min(h * 0.16, fs * 0.5));
      }
    }, { roughness: 0.75, metalness: 0, envMapIntensity: 0.3 });
  }
  const curtainTex = (col, key) => printTex(col, 'c' + key, 1024, 395, 1);

  // ====================================================================== TRUCK (ур. 2): средний фургон со шторами, кабина над двигателем, задний гидроборт
  const TRUCK_CAB = {
    wiperZ: 4.02, M: 24, nMid: 6, arch: 0.07, sillY0: 0.84, sillY1: 1.02, beltY: 2.08, mirrorZ: 3.78, dashZ: 3.62, exhaustX: 0, track: 0.92, zf: 2.9, zr: 0, seatX: 0.5,
    archZ: [2.9], sillA: 2.0, noRear: true, noUnder: true, noPlateF: true, noWheels: true, noDRL: true, lowY: 0.12, mirror: { w: 0.2, h: 0.46, d: 0.1, black: true },
    wheel: { R: 0.45, W: 0.23, rimR: 0.222 },
    tub: { z0: 1.95, z1: 4.06, R0: 0.12, R1: 0.14, q0: 4.5, q1: 4.5, n: 5.6, yb: 0.82, yt: [[1.95, 2.08], [4.06, 2.02]], hwb: 1.06, hwt: 1.08 },
    gh: { drop: 0.32, z0: 1.95, z1: 4.04, R0: 0.08, R1: 0.05, n: 4.0, alpha: 1.3, capA: 3.86, capB: 2.3, railA: 3.99, railB: 2.0, railR: 0.04, pillars: [2.85], beltA: 2.4, beltB: 3.98,
      yt: [[1.95, 2.9], [2.02, 3.1], [2.2, 3.15], [3.3, 3.15], [3.72, 3.14], [3.88, 2.98], [3.98, 2.5], [4.04, 2.12]], hwb: 1.05, hwt: 0.99, extra: [2.3, 3.5, 3.9] }, covers: [[1.95, 2.32]],
    lamp: { x: 0.8, y: 1.18, w: 0.4, h: 0.26 }, tail: { x: 0.8, y: 1, w: 0.2, h: 0.2 }, grille: { w: 0.95, h: 0.62, y: 1.52, bars: 7, bh: 0.02 },
    seams: [2.85, 3.96], handles: [3.1], floor: { w: 2.0, z0: 2.1, z1: 3.8 }, seats: [{ z: 3.25 }],
  };
  function truckHook(g, X, o) {
    const { tub, pa, tr, ch, dk } = X, v = ((o.variant | 0) + 3) % 6, col = FLEET[v], pw = MT.paint(0xeceeed, { roughness: 0.4 }), M = { tr, dk, ch };
    const wm = truckWheelMats(), wspec = { R: 0.45, W: 0.23, rimR: 0.222, style: 'steel', lugs: 8, seg: 22, lod: 1 }, rim = wm.rim, hz = hazardMat();
    const zFront = 1.88, zRear = -4.02, zMid = (zFront + zRear) / 2, L = zFront - zRear, HW = 1.25;
    // --- рама, оси, колёса, подвеска
    both((sd) => { put(g, rb(0.13, 0.22, 7.9, 0.03, 0), dk, sd * 0.45, 0.9, -0.0); });
    for (const zz of [2.2, 0.9, -0.9, -2.9, -3.7]) put(g, rb(0.95, 0.1, 0.1, 0.02, 0), dk, 0, 0.88, zz);
    axle(g, 2.9, 0.45, 0.85, dk, false, true); axle(g, -2.2, 0.45, 0.95, dk, true, true);
    both((sd) => {
      wheel(g, sd * 0.93, 0.45, 2.9, sd, wspec, wm, false, sd + 2);
      wheel(g, sd * 1.03, 0.45, -2.2, sd, wspec, wm, false, sd * 1.3);
      wheel(g, sd * 0.73, 0.45, -2.2, sd, wspec, wm, true, sd * 2.1);
      // брызговики, подножки, поручни, защита бортов
      mudflap(g, sd * 1.03, 0.4, -2.78, 0.52, 0.4, M); mudflap(g, sd * 0.93, 0.34, 2.43, 0.42, 0.3, M);
      fenderArc(g, sd * 1.0, -2.2, 0.45, 0.45, 0.78, 0.02, tr, 0.15, 1.2, 0); fenderArc(g, sd * 1.0, -2.2, 0.45, 0.45, 0.78, 0.02, tr, 1.95, PI - 0.1, 0);
      put(g, rb(0.42, 0.045, 0.3, 0.02, 0), tr, sd * 1.0, 0.5, 3.5); put(g, rb(0.42, 0.045, 0.3, 0.02, 0), tr, sd * 1.0, 0.85, 3.5);
      put(g, tube([[sd * 1.12, 1.0, 3.92], [sd * 1.14, 1.5, 3.95], [sd * 1.12, 2.05, 3.94]], 0.02, 8, 6), ch, 0, 0, 0);
      put(g, tube([[sd * 1.12, 0.62, 1.4], [sd * 1.12, 0.62, -1.5]], 0.025, 6, 6), dk, 0, 0, 0);
      for (const zz of [1.2, -0.1, -1.4]) put(g, bx(0.04, 0.2, 0.05), dk, sd * 1.12, 0.74, zz);
    });
    // --- бак, батарейный ящик, воздушный ресивер, глушитель
    put(g, cyl(0.3, 1.3, 18, 'z'), rim, -1.0, 0.7, 0.3); for (const zz of [-0.15, 0.75]) put(g, cyl(0.31, 0.04, 18, 'z'), dk, -1.0, 0.7, zz);
    put(g, rb(0.55, 0.4, 0.7, 0.04, 0), dk, 1.0, 0.75, 0.8); put(g, cyl(0.15, 0.9, 12, 'z'), dk, 0.95, 0.62, -0.4); put(g, cyl(0.14, 0.7, 14, 'z'), rim, 0.85, 0.66, -1.2);
    put(g, cyl(0.05, 0.8, 8, 'z'), dk, 0.6, 0.55, -3.0);
    // --- кабина: бампер, ступени, козырёк, дефлектор, маркёры
    const zn = 4.08;
    put(g, rb(2.18, 0.3, 0.3, 0.1, 1), tr, 0, 0.72, zn - 0.02); put(g, rb(1.5, 0.12, 0.05, 0.03, 0), dk, 0, 0.72, zn + 0.14);
    both((sd) => { put(g, cyl(0.06, 0.06, 14, 'z'), MT.lensH(), sd * 0.82, 0.72, zn + 0.14); put(g, rb(0.14, 0.05, 0.06, 0.02, 0), ch, sd * 0.38, 0.55, zn + 0.02); });
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false, HZ_PF), hz, 0, 0.64, zn + 0.158);
    put(g, rb(2.1, 0.1, 0.24, 0.04, 0), pa, 0, 3.12, 3.9).rotation.x = -0.1;
    for (const mx of [-0.78, -0.39, 0, 0.39, 0.78]) put(g, cyl(0.04, 0.05, 10, 'y'), MT.lampA(), mx, 3.2, 3.88);
    put(g, ex([[3.2, 3.12], [2.8, 3.18], [2.45, 3.33], [2.2, 3.5], [2.08, 3.5], [2.05, 3.12]], 2.0, { plane: 'zy', b: 0.02, r: 0.12, seg: 2, cs: 4 }), pa, 0, 0, 0);
    // --- кузов со шторами
    const dkS = dk;
    put(g, rb(2.5, 0.13, L, 0.03, 0), dk, 0, 1.04, zMid);
    both((sd) => { put(g, rb(0.08, 0.16, L, 0.02, 0), rim, sd * (HW - 0.01), 1.1, zMid); put(g, rb(0.08, 0.11, L, 0.02, 0), rim, sd * (HW - 0.01), 3.37, zMid); });
    put(g, rb(2.5, 2.3, 0.14, 0.04, 1), pw, 0, 2.25, zFront - 0.05);
    put(g, rb(2.5, 0.1, L + 0.04, 0.04, 1), pw, 0, 3.46, zMid);
    put(g, rb(2.5, 0.3, 0.1, 0.03, 0), pw, 0, 3.27, zRear + 0.02);
    for (const zz of [1.75, 0.55, -0.65, -1.85, -3.05]) both((sd) => put(g, rb(0.07, 2.2, 0.07, 0.02, 0), rim, sd * (HW - 0.04), 2.25, zz));
    // шторы: полотно с рисунком, прогиб между стойками
    const cm = curtainTex(col, 'v' + v), bays = [1.75, 0.55, -0.65, -1.85, -3.05, -4.0];
    both((sd) => {
      const f = (u, w, out) => {
        const z = sd > 0 ? lerp(1.74, -3.98, u) : lerp(-3.98, 1.74, u); let b = 0, zz = z; for (let i = 0; i < bays.length - 1; i++) if (z <= bays[i] && z >= bays[i + 1]) { b = Math.sin(PI * (bays[i] - z) / (bays[i] - bays[i + 1])); break; }
        out.set(sd * (HW + 0.004 + 0.022 * b), lerp(1.17, 3.35, w), zz);
      };
      put(g, sheet(f, 60, 4, V3(sd, 0, 0)), cm, 0, 0, 0);
      // ремни/стяжки у стоек
      for (const zz of bays.slice(1, 5)) put(g, bx(0.012, 2.15, 0.07), dk, sd * (HW + 0.005), 2.26, zz);
    });
    // --- задние двери, замки, фонари, бампер, лента
    for (const sd of [-1, 1]) {
      put(g, rb(1.19, 2.12, 0.06, 0.02, 0), pw, sd * 0.6, 2.2, zRear - 0.0); // створки
      for (const bxx of [0.12, 0.5]) { put(g, cyl(0.014, 2.0, 8, 'y'), ch, sd * bxx, 2.2, zRear - 0.05); put(g, bx(0.06, 0.04, 0.03), ch, sd * bxx, 3.12, zRear - 0.06); put(g, bx(0.06, 0.04, 0.03), ch, sd * bxx, 1.3, zRear - 0.06); }
      put(g, bx(0.1, 0.03, 0.03), ch, sd * 0.2, 2.1, zRear - 0.06);
      put(g, bx(0.05, 0.18, 0.06), dk, sd * 1.19, 1.4, zRear + 0.0); put(g, bx(0.05, 0.18, 0.06), dk, sd * 1.19, 3.0, zRear + 0.0); // петли
      // задние фонари: блок на углу
      put(g, rb(0.2, 0.5, 0.1, 0.03, 0), tr, sd * 1.12, 1.55, zRear - 0.07);
      put(g, rb(0.15, 0.17, 0.11, 0.03, 0), MT.lensR(), sd * 1.12, 1.76, zRear - 0.075); put(g, rb(0.15, 0.13, 0.11, 0.03, 0), MT.lampA(), sd * 1.12, 1.57, zRear - 0.075); put(g, rb(0.15, 0.1, 0.11, 0.03, 0), MT.lensR(), sd * 1.12, 1.4, zRear - 0.075);
    }
    put(g, rb(2.3, 0.18, 0.14, 0.03, 0), dk, 0, 0.66, zRear - 0.1); both((sd) => put(g, bx(0.09, 0.4, 0.07), dk, sd * 1.0, 0.82, zRear - 0.06));
    put(g, quad('z', -1.1, 1.1, 0.585, 0.745, zRear - 0.18, true, HZ_RW(5)), hz, 0, 0, 0);
    put(g, quad('z', -1.2, 1.2, 1.2, 1.32, zRear - 0.031, true, HZ_RW(5.5)), hz, 0, 0, 0);
    put(g, quad('z', -1.2, 1.2, 3.12, 3.24, zRear - 0.031, true, HZ_RW(5.5)), hz, 0, 0, 0);
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, true, HZ_PR), hz, 0, 1.45, zRear - 0.062);
    // --- задний гидроборт (в положении погрузки) + цилиндры
    const zl = zRear - 0.55;
    put(g, rb(2.3, 0.08, 1.0, 0.02, 0), dk, 0, 1.07, zl - 0.05); put(g, quad('y', -1.15, 1.15, zl - 0.52, zl - 0.38, 1.112, false, HZ_YB(5)), hz, 0, 0, 0);
    put(g, rb(2.3, 0.14, 0.08, 0.02, 0), dk, 0, 1.1, zl - 0.58);
    both((sd) => {
      put(g, rb(0.13, 1.0, 0.13, 0.03, 0), dk, sd * 1.14, 0.78, zRear - 0.2); put(g, rb(0.1, 0.1, 0.9, 0.02, 0), dk, sd * 1.0, 0.9, zRear - 0.4);
      put(g, rod(V3(sd * 0.95, 0.7, zRear - 0.1), V3(sd * 0.95, 0.95, zRear - 0.55), 0.035, 8), dk, 0, 0, 0); put(g, rod(V3(sd * 0.95, 0.85, zRear - 0.35), V3(sd * 0.95, 0.96, zRear - 0.55), 0.016, 6), ch, 0, 0, 0);
    });
  }
  reg('truck', 'truck', (o) => {
    const v = o.variant | 0, spec = Object.assign({}, TRUCK_CAB, { custom: (g, X) => truckHook(g, X, o) }), g = buildCar(spec, FLEET[(v + 3) % 6], o);
    return center(finish(g, 71 + v));
  });

  // @@APPEND

  // ====================================================================== SEMI (ур. 3): седельный тягач с длинным капотом и спальником + рефрижераторный прицеп 13,6 м
  const SEMI_CAB = {
    wiperZ: 5.875, M: 22, nMid: 10, arch: 0, sillY0: 1.2, sillY1: 1.32, beltY: 2.1, mirrorZ: 5.72, dashZ: 5.45, track: 0.93, zf: 6.7, zr: 0, seatX: 0.5,
    archZ: [], sillA: 4.3, sillB: 5.7, noRear: true, noUnder: true, noPlateF: true, noWheels: true, noDRL: true, noFront: true, mirror: { w: 0.2, h: 0.55, d: 0.1, black: true },
    wheel: { R: 0.52, W: 0.3, rimR: 0.286 },
    tub: { z0: 4.2, z1: 5.9, R0: 0.1, R1: 0.14, q0: 4.5, q1: 4.5, n: 5.4, yb: 1.15, yt: [[4.2, 2.1], [5.9, 2.1]], hwb: 1.19, hwt: 1.2 },
    gh: { drop: 0.32, z0: 4.2, z1: 5.88, R0: 0.08, R1: 0.05, n: 4.0, alpha: 1.25, capA: 5.62, capB: 4.4, railA: 5.84, railB: 4.25, railR: 0.045, pillars: [4.85], beltA: 4.5, beltB: 5.85,
      yt: [[4.2, 2.95], [4.28, 3.15], [4.5, 3.2], [5.45, 3.2], [5.62, 3.1], [5.78, 2.7], [5.86, 2.3], [5.88, 2.1]], hwb: 1.18, hwt: 1.12, extra: [4.4, 5.5, 5.8] }, covers: [[4.2, 4.45]],
    seams: [4.85, 5.82], handles: [5.1], floor: { w: 2.0, z0: 4.4, z1: 5.7 }, seats: [{ z: 5.0 }],
  };
  function semiHook(g, X, o) {
    const { pa, tr, ch, dk } = X, v = ((o.variant | 0) + 1) % 6, col = FLEET[v], pw = MT.paint(0xeceeed, { roughness: 0.4 }), hz = hazardMat(), M = { tr, dk, ch };
    const rimP = C.metal(0xdde1e6, { roughness: 0.18 }), wm = truckWheelMats(rimP);
    const wSteer = { R: 0.52, W: 0.3, rimR: 0.286, style: 'steel', lugs: 10, seg: 22, lod: 1 }, wLow = { R: 0.52, W: 0.3, rimR: 0.286, style: 'steel', lugs: 8, seg: 16, lod: 2 };
    // ---------- капот, крылья, бампер, решётка
    const hood = new Loft({ z0: 5.86, z1: 7.86, R0: 0.08, R1: 0.14, q0: 4, q1: 4.5, n: 3.4, yb: 1.28, yt: [[5.86, 2.34], [6.8, 2.3], [7.5, 2.2], [7.86, 2.1]], hwb: 0.86, hwt: 0.72 });
    put(g, hood.geo({ M: 22, nMid: 6 }), pa, 0, 0, 0);
    both((sd) => {
      put(g, rb(0.52, 0.07, 2.0, 0.03, 0), pa, sd * 1.07, 1.3, 6.85);
      fenderArc(g, sd * 1.07, 6.7, 0.52, 0.66, 0.52, 0.035, pa, 0.0, PI, 0);
      put(g, rb(0.52, 0.5, 0.05, 0.03, 0), pa, sd * 1.07, 1.05, 7.88); // скос крыла спереди
      // фары: хромированные ковши на передних углах
      put(g, rb(0.32, 0.26, 0.2, 0.06, 0), ch, sd * 1.0, 1.52, 7.76); put(g, rb(0.26, 0.2, 0.06, 0.04, 0), MT.lensH(), sd * 1.0, 1.52, 7.875);
      put(g, rb(0.2, 0.07, 0.08, 0.02, 0), MT.lampA(), sd * 1.1, 1.3, 7.9);
      // подножки, поручни, зеркала, баки, стойки выхлопа
      put(g, rb(0.55, 0.05, 0.4, 0.02, 0), tr, sd * 1.1, 0.62, 5.3); put(g, rb(0.5, 0.05, 0.38, 0.02, 0), tr, sd * 1.12, 0.98, 5.3);
      put(g, tube([[sd * 1.24, 1.15, 5.84], [sd * 1.26, 2.0, 5.88], [sd * 1.24, 3.0, 5.82]], 0.022, 10, 6), ch, 0, 0, 0);
      put(g, cyl(0.3, 1.2, 18, 'z'), rimP, sd * 1.0, 0.83, 4.0); for (const zz of [3.55, 4.45]) put(g, cyl(0.31, 0.05, 18, 'z'), dk, sd * 1.0, 0.83, zz);
      put(g, sphG(0.3, 0.3, 0.06, 14, 8), rimP, sd * 1.0, 0.83, 4.6); put(g, cyl(0.045, 0.12, 8, 'y'), dk, sd * 1.0, 1.17, 4.0);
      // хромированные трубы выхлопа
      put(g, cyl(0.065, 2.65, 14, 'y'), ch, sd * 1.34, 2.72, 3.4); put(g, cyl(0.08, 0.9, 14, 'y'), ch, sd * 1.34, 1.9, 3.4); put(g, cyl(0.082, 0.04, 14, 'y'), ch, sd * 1.34, 1.43, 3.4);
      put(g, cyl(0.075, 0.03, 12, 'y', 0.08), ch, sd * 1.34, 4.07, 3.4); put(g, bx(0.08, 0.06, 0.4), dk, sd * 1.3, 2.3, 3.4); put(g, bx(0.08, 0.06, 0.4), dk, sd * 1.3, 3.3, 3.4);
      put(g, tube([[sd * 1.34, 1.4, 3.4], [sd * 1.28, 1.2, 3.55], [sd * 1.1, 1.18, 3.9]], 0.06, 10, 8), ch, 0, 0, 0);
    });
    both((sd) => { // капот: стык с крылом, нижняя кромка, жалюзи
      put(g, hood.rail(sd, [[6.1, 1.45], [6.9, 1.45], [7.6, 1.47]], 0.004, 0.006, 3), dk, 0, 0, 0);
      put(g, hood.panel(sd, 6.25, 6.75, 1.72, 1.98, 0.004, 4, 2), tr, 0, 0, 0);
      for (let i = 0; i < 4; i++) put(g, hood.rail(sd, [[6.28, 1.76 + i * 0.065], [6.72, 1.76 + i * 0.065]], 0.01, 0.007, 4), ch, 0, 0, 0);
      put(g, bx(0.04, 0.06, 0.4), dk, sd * 1.0, 1.0, 4.9 + 0.0); // кронштейны
    });
    put(g, cyl(0.012, 0.32, 8, 'x'), ch, 1.2, 0.55, -0.95 + 3.3 - 3.3); put(g, cyl(0.014, 0.14, 8, 'y'), ch, 1.36, 0.62, -0.95); // рукоять опоры
    put(g, rb(2.4, 0.38, 0.34, 0.12, 1), ch, 0, 0.92, 7.95); put(g, rb(1.8, 0.2, 0.12, 0.05, 0), dk, 0, 0.58, 7.9);
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false, HZ_PF), hz, 0, 0.8, 8.12);
    for (const sx of [-0.7, 0.7]) put(g, cyl(0.03, 0.2, 8, 'z'), dk, sx, 0.8, 8.12);
    const gz = hood.endAt(0, 1.7, true).z;
    put(g, rb(1.3, 0.88, 0.2, 0.09, 1), ch, 0, 1.7, gz - 0.06); put(g, rb(1.1, 0.7, 0.1, 0.05, 0), tr, 0, 1.7, gz + 0.02);
    for (let i = 0; i < 9; i++) put(g, bx(0.035, 0.7, 0.06), ch, (i - 4) * 0.12, 1.7, gz + 0.075);
    put(g, rb(0.26, 0.13, 0.03, 0.02, 0), ch, 0, 2.02, gz + 0.04); // эмблема-плашка
    // ---------- спальник, обтекатель, козырёк, сигнальные огни, рога
    const slp = new Loft({ z0: 2.95, z1: 4.28, R0: 0.1, R1: 0.05, q0: 4.5, q1: 4, n: 5.0, yb: 1.15, yt: [[2.95, 3.38], [3.5, 3.45], [4.28, 3.4]], hwb: 1.19, hwt: 1.17 });
    put(g, slp.geo({ M: 22, nMid: 4 }), pa, 0, 0, 0);
    both((sd) => {
      const sx = slp.side(sd, 3.7, 2.7, 0.004).x;
      put(g, quad('x', 3.35, 4.05, 2.4, 3.0, sx, sd < 0), tr, 0, 0, 0);
      put(g, bx(0.02, 0.5, 0.025), dk, sx, 2.3, 4.12); put(g, bx(0.025, 0.06, 0.2), ch, sx, 2.2, 4.0);
      put(g, rb(0.3, 0.12, 0.08, 0.03, 0), MT.lampA(), sd * 1.1, 3.2, 2.92); put(g, rb(0.14, 0.14, 0.1, 0.03, 0), MT.lensR(), sd * 1.15, 1.4, 2.93);
    });
    put(g, ex([[5.5, 3.2], [5.05, 3.28], [4.55, 3.5], [3.95, 3.7], [3.3, 3.78], [3.1, 3.76], [3.1, 3.2]], 2.28, { plane: 'zy', b: 0.03, r: 0.14, seg: 2, cs: 4 }), pa, 0, 0, 0);
    put(g, rb(2.34, 0.13, 0.4, 0.05, 0), pa, 0, 3.15, 5.78).rotation.x = 0.28;
    for (const mx of [-0.9, -0.45, 0, 0.45, 0.9]) put(g, cyl(0.04, 0.06, 10, 'y'), MT.lampA(), mx, 3.25, 5.82);
    for (const hx of [-0.3, 0.3]) { put(g, cyl(0.05, 0.4, 10, 'z', 0.1), ch, hx, 3.38, 5.05); }
    // ---------- рама, оси, колёса
    both((sd) => put(g, rb(0.14, 0.3, 8.1, 0.04, 0), dk, sd * 0.5, 1.0, 3.7));
    for (const zz of [7.4, 5.8, 4.4, 3.0, 1.8, 0.7, -0.2]) put(g, bx(1.0, 0.16, 0.12), dk, 0, 0.98, zz);
    put(g, cyl(0.05, 4.2, 8, 'z'), dk, 0, 0.72, 3.6);
    axle(g, 6.7, 0.52, 0.9, dk, false, true); axle(g, 1.65, 0.52, 1.0, dk, true, false); axle(g, 0.35, 0.52, 1.0, dk, true, false);
    both((sd) => {
      wheel(g, sd * 0.94, 0.52, 6.7, sd, wSteer, wm, false, sd * 3);
      for (const z of [1.65, 0.35]) { wheel(g, sd * 1.0, 0.52, z, sd, wLow, wm, false, z * 5 + sd); wheel(g, sd * 0.64, 0.52, z, sd, wLow, wm, true, z * 7); put(g, cyl(0.15, 0.3, 12, 'y'), dk, sd * 0.55, 0.86, z); }
      mudflap(g, sd * 1.0, 0.5, -0.32, 0.62, 0.46, M); mudflap(g, sd * 0.96, 0.4, 6.15, 0.5, 0.36, M);
      for (const z of [1.65, 0.35]) fenderArc(g, sd * 1.0, z, 0.52, 0.66, 0.9, 0.03, tr, 0.0, PI, 0);
      put(g, rb(0.9, 0.04, 1.3, 0.02, 0), tr, sd * 1.0, 1.23, 1.0);
      put(g, rb(0.3, 0.2, 0.5, 0.05, 0), dk, sd * 0.55, 0.85, 6.1); // тормозные камеры/аккумуляторный ящик
    });
    // седельное устройство, площадка, шланги
    put(g, cyl(0.58, 0.1, 28, 'y'), dk, 0, 1.28, 1.35); put(g, rb(1.2, 0.07, 0.9, 0.03, 0), rimP, 0, 1.3, 0.3);
    put(g, rb(1.7, 0.05, 0.85, 0.02, 0), rimP, 0, 1.31, 2.55);
    for (const [x, c] of [[-0.35, 0xc23a2a], [0.35, 0x2f68c8]]) { put(g, bx(0.1, 0.1, 0.05), lam(c), x, 2.2, 2.92); put(g, tube([[x, 2.2, 2.9], [x * 1.2, 1.75, 2.72], [x * 1.1, 1.62, 2.55], [x, 1.9, 2.38]], 0.022, 14, 5), lam(c), 0, 0, 0); }
    // ---------- прицеп-рефрижератор 13,6 м
    const tz0 = 2.35, tz1 = -11.25, tL = tz0 - tz1, tc = (tz0 + tz1) / 2, W2 = 1.3;
    put(g, rb(2.6, 2.6, tL, 0.07, 1), pw, 0, 2.75, tc);
    both((sd) => { put(g, rb(0.16, 0.3, tL - 0.4, 0.03, 0), dk, sd * 0.6, 1.3, tc); put(g, rb(0.06, 0.1, tL - 0.05, 0.02, 0), rimP, sd * (W2 - 0.005), 1.47, tc); put(g, rb(0.07, 0.09, tL - 0.05, 0.02, 0), rimP, sd * (W2 - 0.005), 4.02, tc); });
    for (const zz of [1.9, -1.0, -3.5, -6.0, -8.0]) put(g, bx(1.3, 0.12, 0.12), dk, 0, 1.3, zz);
    put(g, rb(1.1, 0.06, 1.1, 0.03, 0), dk, 0, 1.4, 1.35);
    // боковая графика + ленты + габаритные огни
    const pt = printTex(col, 'semi' + v, 2048, 380, 2);
    both((sd) => {
      put(g, quad('x', sd > 0 ? 2.28 : -11.18, sd > 0 ? -11.18 : 2.28, 1.55, 4.0, sd * (W2 + 0.005), sd < 0), pt, 0, 0, 0);
      put(g, quad('x', sd > 0 ? 2.28 : -11.18, sd > 0 ? -11.18 : 2.28, 1.455, 1.57, sd * (W2 + 0.006), sd < 0, HZ_RW(30)), hz, 0, 0, 0);
      for (let i = 0; i < 6; i++) put(g, bx(0.05, 0.07, 0.17), MT.lampA(), sd * (W2 + 0.012), 1.68, 1.8 - i * 2.35);
      put(g, bx(0.05, 0.07, 0.17), MT.lensR(), sd * (W2 + 0.012), 1.68, -11.1);
      // юбки, шасси, колёса прицепа
      put(g, rb(0.03, 0.5, 6.0, 0.01, 0), pw, sd * (W2 - 0.02), 1.15, -4.6);
      axle(g, -9.0, 0.52, 1.0, dk, false, false); axle(g, -10.3, 0.52, 1.0, dk, false, false);
      for (const z of [-9.0, -10.3]) { wheel(g, sd * 1.0, 0.52, z, sd, wLow, wm, false, z * 3 + sd); wheel(g, sd * 0.64, 0.52, z, sd, wLow, wm, true, z * 5); put(g, cyl(0.15, 0.3, 12, 'y'), dk, sd * 0.55, 0.86, z); }
      mudflap(g, sd * 1.0, 0.5, -10.95, 0.62, 0.46, M);
      // опорное устройство
      put(g, rb(0.14, 1.2, 0.16, 0.03, 0), dk, sd * 1.0, 0.8, -0.95); put(g, rb(0.1, 0.5, 0.12, 0.02, 0), dk, sd * 1.0, 0.45, -0.95); put(g, rb(0.5, 0.05, 0.3, 0.02, 0), dk, sd * 1.0, 0.025, -0.95);
      // задние фонари и замки
      put(g, rb(0.18, 0.62, 0.08, 0.03, 0), tr, sd * 1.12, 1.95, tz1 - 0.04);
      put(g, rb(0.14, 0.18, 0.09, 0.03, 0), MT.lensR(), sd * 1.12, 2.15, tz1 - 0.05); put(g, rb(0.14, 0.14, 0.09, 0.03, 0), MT.lampA(), sd * 1.12, 1.95, tz1 - 0.05); put(g, rb(0.14, 0.18, 0.09, 0.03, 0), MT.lensR(), sd * 1.12, 1.77, tz1 - 0.05);
      // двери: створка, замковые штанги, петли
      put(g, rb(1.18, 2.42, 0.05, 0.02, 0), pw, sd * 0.62, 2.75, tz1 - 0.02);
      for (const bxx of [0.17, 0.98]) { put(g, cyl(0.018, 2.45, 8, 'y'), ch, sd * bxx, 2.75, tz1 - 0.07); for (const yy of [1.6, 2.2, 3.3, 3.9]) put(g, bx(0.07, 0.04, 0.03), ch, sd * bxx, yy, tz1 - 0.075); }
      for (const yy of [1.85, 2.5, 3.1, 3.7]) put(g, bx(0.05, 0.14, 0.06), dk, sd * 1.265, yy, tz1 - 0.03);
      put(g, bx(0.1, 0.04, 0.04), ch, sd * 0.08, 2.5, tz1 - 0.08);
      put(g, bx(0.04, 0.9, 0.05), dk, sd * 1.0, 0.95, tz1 - 0.12);
    });
    put(g, rb(2.46, 0.24, 0.16, 0.04, 0), dk, 0, 0.74, tz1 - 0.2);
    put(g, quad('z', -1.2, 1.2, 0.64, 0.82, tz1 - 0.282, true, HZ_RW(5)), hz, 0, 0, 0);
    put(g, quad('z', -1.2, 1.2, 1.5, 1.64, tz1 - 0.1, true, HZ_RW(5.5)), hz, 0, 0, 0);
    put(g, quad('z', -1.2, 1.2, 3.86, 4.0, tz1 - 0.1, true, HZ_RW(5.5)), hz, 0, 0, 0);
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, true, HZ_PR), hz, 0, 0.95, tz1 - 0.215);
    // холодильная установка на передней стенке
    put(g, rb(2.1, 1.15, 0.45, 0.08, 1), pw, 0, 3.4, tz0 + 0.225);
    put(g, rb(1.5, 0.82, 0.05, 0.04, 0), dk, 0, 3.42, tz0 + 0.46); for (let i = 0; i < 6; i++) put(g, bx(1.46, 0.025, 0.06), rimP, 0, 3.12 + i * 0.12, tz0 + 0.47);
    put(g, rb(1.3, 0.32, 0.36, 0.05, 0), dk, 0, 2.42, tz0 + 0.2); put(g, bx(0.04, 0.3, 0.04), dk, 0.5, 2.7, tz0 + 0.2);
    put(g, rb(2.6, 0.12, 0.03, 0.01, 0), pw, 0, 4.0, tz0 + 0.01);
  }
  reg('truck', 'semi', (o) => {
    const v = o.variant | 0, spec = Object.assign({}, SEMI_CAB, { custom: (g, X) => semiHook(g, X, o) }), g = buildCar(spec, FLEET[(v + 1) % 6], o), out = finish(g, 81 + v);
    return center(out);
  });

  // @@APPEND

  // ====================================================================== BUS: городской автобус
  const busPrint = (col0, key) => { const col = inkCol(col0); return texPbr('busprint_' + key, 2048, 256, (g, w) => {
    const h = 160; g.scale(1, 256 / 160);
    g.fillStyle = hex(col); g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f3ef'; g.beginPath(); g.moveTo(0, h * 0.2); g.bezierCurveTo(w * 0.3, h * 0.05, w * 0.55, h * 0.55, w, h * 0.12); g.lineTo(w, h * 0.42); g.bezierCurveTo(w * 0.55, h * 0.8, w * 0.3, h * 0.38, 0, h * 0.5); g.closePath(); g.fill();
    g.fillStyle = hex(shade(col, 0.7)); g.fillRect(0, h * 0.9, w, h * 0.1);
    g.fillStyle = '#f2f3ef'; g.font = 'italic 900 ' + Math.round(h * 0.52) + 'px "Arial Black", Impact, sans-serif'; g.textBaseline = 'middle'; g.fillText('CITY LINE', w * 0.07, h * 0.7);
    g.font = '700 ' + Math.round(h * 0.3) + 'px sans-serif'; g.fillText('route 24 · market square', w * 0.38, h * 0.72);
  }, { roughness: 0.4, metalness: 0.3, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); };
  const BUS = {
    wiperZ: 5.712, M: 28, nMid: 14, arch: 0.08, sillY0: 0.45, sillY1: 0.62, beltY: 1.2, mirrorZ: 5.4, mirrorY: 2.05, dashZ: 5.2, exhaustX: 0.9, track: 1.0, zf: 3.15, zr: -2.65, seatX: 0.6, cheapSeats: true, lipBlack: true,
    archZ: [3.15, -2.65], noUnder: true, noWheels: true, noDRL: true, lowY: 0.2, mirror: { w: 0.16, h: 0.5, d: 0.1, black: true }, capCol: 0xeef0ee,
    wheel: { R: 0.48, W: 0.275, rimR: 0.286 },
    tub: { z0: -5.75, z1: 5.75, R0: 0.2, R1: 0.22, q0: 4.5, q1: 4.5, n: 6.0, yb: [[-5.75, 0.46], [-5, 0.4], [5, 0.4], [5.75, 0.44]], yt: 1.2, hwb: 1.24, hwt: 1.25 },
    gh: { drop: 0.3, z0: -5.7, z1: 5.72, R0: 0.05, R1: 0.05, n: 5.0, alpha: 1.5, capA: 5.62, capB: -5.0, railA: 5.7, railB: -5.0, railR: 0.04, pillarR: 0.05,
      pillars: [5.35, 4.2, 3.0, 1.85, 0.75, -0.4, -1.55, -2.7, -3.85, -4.95], beltA: -4.9, beltB: 5.6,
      yt: [[-5.7, 2.9], [-5.6, 3.04], [-5.3, 3.08], [0, 3.1], [5.2, 3.08], [5.5, 3.0], [5.66, 2.55], [5.72, 1.2]], hwb: 1.24, hwt: 1.18, extra: [4.9, 5.5, 5.65] }, covers: [[-5.72, -4.95]],
    lamp: { x: 0.9, y: 0.8, w: 0.4, h: 0.16 }, tail: { x: 1.0, y: 0.95, w: 0.16, h: 0.46 }, grille: { w: 0.9, h: 0.24, y: 0.62, bars: 4, bh: 0.02 },
    seams: [], handles: [], floor: { w: 2.2, z0: -4.9, z1: 5.3 },
    seats: [4.0, 3.0, 1.9, 0.9, -0.3, -1.4, -2.6, -3.7].map((z) => ({ z })),
  };
  function busHook(g, X, o) {
    const { tub, gh, tr, ch, dk } = X, v = ((o.variant | 0) + 2) % 6, col = FLEET[v], wm = truckWheelMats(), pcw = MT.paint(0xeef0ee, { roughness: 0.3, metalness: 0.4 });
    const wspec = { R: 0.48, W: 0.275, rimR: 0.286, style: 'steel', lugs: 8, seg: 20, lod: 1 }, wlow = Object.assign({}, wspec, { lod: 2, seg: 16 });
    // оси, колёса (сзади — сдвоенные)
    axle(g, 3.15, 0.48, 0.9, dk, false, false); axle(g, -2.65, 0.48, 0.95, dk, true, false);
    both((sd) => {
      wheel(g, sd * 1.0, 0.48, 3.15, sd, wspec, wm, false, sd * 2);
      wheel(g, sd * 1.02, 0.48, -2.65, sd, wlow, wm, false, sd * 3); wheel(g, sd * 0.68, 0.48, -2.65, sd, wlow, wm, true, sd);
      // зеркала-«уши»: кронштейны
      put(g, tube([[sd * 1.2, 2.0, 5.5], [sd * 1.34, 2.0, 5.6], [sd * 1.36, 2.2, 5.5]], 0.018, 6, 5), tr, 0, 0, 0);
      // двери (правый борт = -x): две двери с тёмным стеклом, у каждой центральный шов
      // боковая графика
      const px = tub.side(sd, 0, 0.85, 0.008).x;
      put(g, quad('x', sd > 0 ? 5.2 : -5.2, sd > 0 ? -5.2 : 5.2, 0.5, 1.1, px, sd < 0), busPrint(col, 'v' + v), 0, 0, 0);
      // фары и повторители
      put(g, rb(0.5, 0.2, 0.08, 0.04, 0), tr, sd * 0.9, 0.82, 5.8);
      put(g, bx(0.1, 0.1, 0.05), MT.lampA(), sd * 1.18, 0.82, 5.62);
      put(g, bx(0.1, 0.1, 0.05), MT.lampA(), sd * 1.18, 0.82, -5.62);
      // брызговики
      put(g, bx(0.5, 0.34, 0.014), tr, sd * 1.02, 0.3, -3.3); put(g, bx(0.4, 0.3, 0.014), tr, sd * 1.0, 0.28, 2.55);
    });
    // двери на правом борту
    for (const [za, zb] of [[4.28, 5.3], [-0.32, 0.68]]) {
      const dx = gh.side(-1, (za + zb) / 2, 1.6, 0.01).x;
      put(g, quad('x', za, zb, 0.62, 2.4, dx, true), tr, 0, 0, 0);
      put(g, bx(0.03, 1.8, 0.04), ch, dx - 0.01, 1.5, (za + zb) / 2);
      put(g, bx(0.04, 0.08, 1.05), tr, dx - 0.01, 2.43, (za + zb) / 2);
      for (const zz of [za + 0.28, za + 0.74]) put(g, bx(0.04, 1.3, 0.025), ch, dx - 0.015, 1.5, zz);
    }
    // передняя часть: решётка, бампер, табло, дворники
    put(g, rb(2.4, 0.3, 0.2, 0.08, 0), tr, 0, 0.55, 5.78); put(g, rb(1.5, 0.3, 0.06, 0.03, 0), dk, 0, 0.9, 5.82);
    put(g, bx(1.7, 0.2, 0.05), tr, 0, 2.62, 5.73); put(g, bx(1.5, 0.1, 0.03), MT.lampA(), 0, 2.62, 5.76);
    for (const wx of [-0.45, 0.25]) put(g, bx(0.6, 0.015, 0.02), tr, wx, 1.5, 5.74).rotation.z = wx < 0 ? 0.15 : -0.15;
    // крыша: кондиционер, люк, антенна
    put(g, rb(1.7, 0.3, 3.2, 0.12, 1), pcw, 0, 3.22, -2.2); put(g, rb(1.2, 0.08, 1.0, 0.03, 0), pcw, 0, 3.15, 1.5); put(g, cyl(0.015, 0.45, 6, 'y'), tr, 0.5, 3.3, 0.2);
    // моторный отсек сзади: жалюзи
    for (let i = 0; i < 6; i++) put(g, bx(1.5, 0.05, 0.04), dk, 0, 1.5 + i * 0.14, -5.745);
    both((sd) => put(g, bx(0.2, 0.06, 0.06), dk, sd * 0.9, 0.5, tub.endAt(0.9, 0.5, false).z - 0.02));
  }
  reg('bus', 'bus', (o) => {
    const v = o.variant | 0, spec = Object.assign({}, BUS, { custom: (g, X) => busHook(g, X, o) }), g = buildCar(spec, FLEET[(v + 2) % 6], o);
    return center(finish(g, 91 + v));
  });

  // @@APPEND
})();
