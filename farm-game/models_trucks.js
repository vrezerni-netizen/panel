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
      opts = opts || {};
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
  const _rb = {};
  /** Скруглённая коробка w×h×d (x,y,z), радиус r; q — качество 0/1/2. Гладкие нормали, кэшируется. */
  function rb(w, h, d, r, q) {
    if (q == null) q = Math.min(w, h, d) < 0.1 ? 0 : 1;
    const k = [w, h, d, r, q].map((v) => (v == null ? 'n' : v.toFixed(3))).join('|');
    if (_rb[k]) return _rb[k];
    r = Math.max(0.001, Math.min(r == null ? 0.05 : r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const bev = Math.min(r * 0.7, d / 2 - 0.001, 0.3), hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.0005, Math.min(r, hw - 0.0005, hh - 0.0005)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh);
    sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: [2, 3, 4][q], curveSegments: [2, 3, 5][q] });
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
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    // ориентация граней: по нормали у первой невырожденной грани
    const pa = g.attributes.position, na_ = g.attributes.normal; const p0 = V3(0, 0, 0), p1 = V3(0, 0, 0), p2 = V3(0, 0, 0), nn = V3(0, 0, 0);
    for (let t = 0; t < idx.length; t += 3) {
      p0.fromBufferAttribute(pa, idx[t]); p1.fromBufferAttribute(pa, idx[t + 1]); p2.fromBufferAttribute(pa, idx[t + 2]); p1.sub(p0); p2.sub(p0); p1.cross(p2);
      if (p1.lengthSq() > 1e-12) { nn.fromBufferAttribute(na_, idx[t]); if (nn.lengthSq() < 1e-6) continue; if (p1.dot(nn) < 0) for (let q = 0; q < idx.length; q += 3) { const tmp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tmp; } break; }
    }
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
    const us = [0, 0.03, 0.1, 0.22, 0.4, 0.65, 1], zs = [], a = this.z0 + this.R0, b = this.z1 - this.R1;
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
    for (const z of zs) for (let k = 0; k < cols; k++) { const th = a0 + (a1 - a0) * k / M; this.P(z, th, inf, p); pos.push(p.x, p.y, p.z); }
    const S = zs.length;
    for (let i = 0; i < S - 1; i++) for (let k = 0; k < M; k++) {
      const k1 = open ? k + 1 : (k + 1) % M, v00 = i * cols + k, v01 = i * cols + k1, v10 = (i + 1) * cols + k, v11 = (i + 1) * cols + k1;
      idx.push(v00, v01, v11, v00, v11, v10);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
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
    chrome: () => C.chromeM(),
    alloy: () => C.metal(0xcfd4da, { roughness: 0.24 }),
    dark: () => C.metal(0x2a2d32, { roughness: 0.5 }),
    steel: () => C.metal(0x8f969e, { roughness: 0.42 }),
    lampW: () => C.lightM(0xfff3d2), lampR: () => C.lightM(0xc81a14), lampA: () => C.lightM(0xffa017),
    seat: () => C.matte(0x3a3b3f, { roughness: 0.85 }),
    paint: (c, o) => C.paint(c, o),
  };
  /** Декаль-материал (текстура поверх кузова), с polygonOffset против мерцания на расстоянии. */
  const decalOpts = { metalness: 0.35, roughness: 0.4, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const put = (g, geo, m, x, y, z, rx, ry, rz) => { const o = C.mesh(geo, m, x, y, z, rx, ry, rz); g.add(o); return o; };
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
  function ground(g) { const b = new T.Box3().setFromObject(g); if (isFinite(b.min.y) && Math.abs(b.min.y) > 1e-4) g.position.y -= b.min.y; return g; }


  // ====================================================================== шины и диски
  /** Шина с рисунком протектора и текстом на боковине (u — по окружности, v: 0 внутренняя боковина .. 1 наружная; протектор 0.33..0.67). */
  function tyreMat(kind) {
    const big = kind === 'truck', ag = kind === 'agri';
    return texPbr('tyre_' + kind, 1024, 256, (g, w, h) => {
      g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h);
      const y = (v) => h * (1 - v); // v -> canvas y
      // боковины: лёгкая зернистость и кольцевые рёбра
      for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.035) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
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
    const tp = [
      [rR - 0.004, -0.80 * hw, 0.00], [rR + 0.10 * h, -0.96 * hw, 0.07], [rR + 0.45 * h, -1.00 * hw, 0.15], [rR + 0.80 * h, -0.93 * hw, 0.25], [R - 0.012, -0.72 * hw, 0.31],
      [R, -0.54 * hw, 0.34], [R, 0.54 * hw, 0.66], [R - 0.012, 0.72 * hw, 0.69], [rR + 0.80 * h, 0.93 * hw, 0.75], [rR + 0.45 * h, 1.00 * hw, 0.85], [rR + 0.10 * h, 0.96 * hw, 0.93], [rR - 0.004, 0.80 * hw, 1.00]];
    r.tyre = lat(tp, seg, 'x');
    const lipEnd = s.style === 'steel' ? null : [];
    // кромка обода (идём наружу -> внутрь, видимая сторона справа)
    const lip = [[rR + 0.012, aO - 0.02], [rR + 0.014, aO - 0.004], [rR + 0.007, aO + 0.004], [rR - 0.005, aO + 0.007], [rR - 0.016, aO + 0.001], [rR - 0.021, aO - 0.012], [rR - 0.023, aO - 0.05]];
    if (s.style === 'steel') {
      // штампованный диск: кромка, ступенька, тарелка, выпуклая ступица
      const f = [...lip, [rR - 0.03, aO - 0.075], [rR * 0.88, aO - 0.08], [rR * 0.64, aO - 0.10], [rR * 0.50, aO - 0.05], [rR * 0.42, aO - 0.012], [rR * 0.40, aO + 0.01], [rR * 0.28, aO + 0.016], [rR * 0.18, aO + 0.012], [0.001, aO + 0.004]];
      r.face = lat(f, seg, 'x');
      const lugs = [], nL = s.lugs || 10, rl = rR * 0.325, lg = cyl(R * 0.021, 0.034, 6, 'x');
      for (let i = 0; i < nL; i++) { const a = i / nL * TAU; lugs.push({ geo: lg, m: new T.Matrix4().makeTranslation(aO + 0.012, Math.sin(a) * rl, Math.cos(a) * rl) }); }
      r.lugs = mergeWorld(lugs);
      // отверстия-«ручки» на тарелке: тёмные овалы
      const hs = [], nh = nL; for (let i = 0; i < nh; i++) { const a = (i + 0.5) / nh * TAU, gg = cyl(rR * 0.075, 0.006, 10, 'x'); hs.push({ geo: gg, m: new T.Matrix4().makeTranslation(aO - 0.078, Math.sin(a) * rR * 0.66, Math.cos(a) * rR * 0.66) }); }
      r.holes = mergeWorld(hs);
      r.hub = lat([[rR * 0.2, aO + 0.012], [rR * 0.19, aO + 0.03], [rR * 0.13, aO + 0.045], [rR * 0.06, aO + 0.05], [0.001, aO + 0.05]], 18, 'x');
    } else {
      r.lip = lat(lip, seg, 'x');
      const aF = aO - 0.045, th = 0.024, sp = [], nS = s.spokes || 5, dbl = !!s.double, y0 = rR * 0.2, y1 = rR - 0.024;
      for (let i = 0; i < nS; i++) {
        const base = i / nS * TAU + 0.3;
        const offs = dbl ? [-0.13, 0.13] : [0];
        for (const o of offs) {
          const wr = dbl ? rR * 0.045 : rR * 0.12, wt = dbl ? rR * 0.07 : rR * 0.20;
          const pts = [[-wr, y0], [wr, y0], [wt, y1], [-wt, y1]], gg = ex(pts, th, { plane: 'zy', b: 0.005, r: 0.01, seg: 2 });
          const m = new T.Matrix4().makeRotationX(base + o); m.setPosition(aF - th / 2, 0, 0); sp.push({ geo: gg, m });
        }
      }
      r.spokes = mergeWorld(sp);
      r.hub = lat([[rR * 0.27, aF - 0.012], [rR * 0.265, aF + 0.012], [rR * 0.2, aF + 0.028], [rR * 0.08, aF + 0.034], [0.001, aF + 0.035]], 20, 'x');
      const lugs = [], rl = rR * 0.19, lg = cyl(0.0085, 0.016, 6, 'x'); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; lugs.push({ geo: lg, m: new T.Matrix4().makeTranslation(aF + 0.03, Math.sin(a) * rl, Math.cos(a) * rl) }); }
      r.lugs = mergeWorld(lugs);
      r.disc = lat([[rR * 0.86, aF - 0.07], [rR * 0.86, aF - 0.045], [rR * 0.30, aF - 0.045], [rR * 0.30, aF - 0.075]], 28, 'x'); // тормозной диск (внешняя плоскость + борт)
      r.caliper = rb(0.045, rR * 0.30, rR * 0.52, 0.012, 0); r.caliperPos = [aF - 0.06, rR * 0.62, -rR * 0.1];
    }
    // колодец обода: тёмная бочка и задняя стенка
    r.well = lat([[rR - 0.023, aO - 0.05], [rR - 0.024, -0.46 * hw], [rR * 0.5, -0.5 * hw], [0.001, -0.5 * hw]], seg, 'x');
    if (s.style === 'steel') r.well = lat([[rR - 0.023, aO - 0.05], [rR - 0.024, -0.46 * hw], [rR * 0.5, -0.5 * hw], [0.001, -0.5 * hw]], seg, 'x');
    return (_wh[key] = r);
  }
  /** Колесо в точке (x,y,z). side: +1 — лицевая сторона к +x, -1 — к -x. M: {tyre, dark, rim, chrome, steel}. simple — внутренний сдвоенный (без деталей). */
  function wheel(g, x, y, z, side, s, M, simple, phase) {
    const w = wheelGeos(s), ry = side > 0 ? 0 : PI, rx = phase == null ? 0 : phase;
    put(g, w.tyre, M.tyre, x, y, z, rx, ry, 0);
    put(g, w.well, M.dark, x, y, z, rx, ry, 0);
    if (w.face) { put(g, w.face, M.rim, x, y, z, rx, ry, 0); if (!simple) { put(g, w.lugs, M.chrome, x, y, z, rx, ry, 0); put(g, w.holes, M.dark, x, y, z, rx, ry, 0); put(g, w.hub, M.chrome, x, y, z, rx, ry, 0); } }
    else {
      put(g, w.lip, M.rim, x, y, z, rx, ry, 0); put(g, w.spokes, M.rim, x, y, z, rx, ry, 0); put(g, w.hub, M.rim, x, y, z, rx, ry, 0);
      if (!simple) { put(g, w.lugs, M.chrome, x, y, z, rx, ry, 0); put(g, w.disc, M.dark, x, y, z, rx, ry, 0); if (M.caliper) { const o = put(g, w.caliper, M.caliper, x, y, z, 0, 0, 0); const p = w.caliperPos; o.position.set(x + side * p[0], y + p[1], z + p[2]); } }
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
  /** Ориентация элемента по поверхности (порядок вращений YXZ). */
  function orient(o, yaw, pitch, roll) { o.rotation.order = 'YXZ'; o.rotation.set(pitch || 0, yaw || 0, roll || 0); return o; }

  const plateAtlas = () => texPbr('plates', 256, 64, (g, w, h) => {
    const plate = (x, txt, yel) => {
      g.fillStyle = yel ? '#e8c43a' : '#f2f1ea'; g.fillRect(x, 0, w / 2, h); g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.strokeRect(x + 2, 2, w / 2 - 4, h - 4);
      g.fillStyle = '#17365f'; g.fillRect(x + 4, 4, 14, h - 8); g.fillStyle = '#1b1b1b'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + w / 4 + 8, h / 2 + 2);
    };
    plate(0, 'FM 5870'); plate(w / 2, 'FA 2431', true);
  }, { roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const PLATE_FRONT = [0, 0, 0.5, 1], PLATE_REAR = [0.5, 0, 1, 1];

  /** Дорожный автомобиль «кузов + остекление» по спецификации. Перед = +Z. */
  function buildCar(S, col, o) {
    o = o || {};
    const g = new T.Group(), pa = MT.paint(col, { roughness: 0.26, metalness: 0.5, envMapIntensity: 0.8 }), tr = MT.trim(), ch = MT.chrome(), gl = glassT(0x2a3b48), dk = MT.dark(), sm = MT.seat();
    const tub = new Loft(S.tub), gh = new Loft(Object.assign({}, S.gh, { yb: S.gh.yb || ((z) => tub.yt(z) - S.gh.drop) }));
    const al = S.gh.alpha, beltY = S.beltY;
    put(g, tub.geo({ M: S.M || 30, nMid: S.nMid || 18 }), pa, 0, 0, 0);
    // ---- остекление (замкнутая оболочка) + тёмная внутренняя обшивка + крыша и стойки в краске
    put(g, gh.geo({ M: 26, nMid: 16 }), gl, 0, 0, 0);
    put(g, inv(gh.geo({ M: 22, nMid: 12, inf: -0.022 })), sm, 0, 0, 0);
    if (S.covers) for (const cv of S.covers) put(g, gh.geo({ M: 26, nMid: 8, zA: cv[0], zB: cv[1], inf: 0.006 }), pa, 0, 0, 0);
    const capA = S.gh.capA, capB = S.gh.capB;
    put(g, gh.geo({ M: 12, a0: PI / 2 - al, a1: PI / 2 + al, zA: capB, zB: capA, inf: 0.012, nMid: 10 }), pa, 0, 0, 0);
    const hdr = (z, rad) => { const pts = []; for (let k = 0; k <= 10; k++) pts.push(gh.P(z, PI / 2 - al + 2 * al * k / 10, 0.012)); return tube(pts, rad || 0.022, 20, 5); };
    put(g, hdr(capA), pa, 0, 0, 0); put(g, hdr(capB), pa, 0, 0, 0);
    both((sd) => {
      // рейлинг по кромке крыши = передняя стойка (А) и задняя (С)
      const railZ = []; const nr = 28; for (let i = 0; i <= nr; i++) railZ.push(lerp(S.gh.railA, S.gh.railB, i / nr));
      const pts = railZ.map((z) => { const p = gh.P(z, PI / 2 - al, 0.006); p.x *= sd; return p; });
      put(g, tube(pts, S.gh.railR || 0.03, 56, 6), pa, 0, 0, 0);
      for (const zb of S.gh.pillars) { const pts2 = []; for (let k = 0; k <= 8; k++) { const th = lerp(-0.3, PI / 2 - al, k / 8); const p = gh.P(zb, th, 0.006); p.x *= sd; pts2.push(p); } put(g, tube(pts2, 0.026, 16, 6), pa, 0, 0, 0); }
    });
    // ---- арки колёс, пороги, швы дверей, ручки, зеркала
    const W = S.wheel, wz = [S.zf, S.zr], wy = W.R;
    both((sd) => {
      for (const z of wz) {
        put(g, tub.disc(sd, z, wy, W.R + S.arch, 0.004), tr, 0, 0, 0);
        const lp = []; for (let k = 0; k <= 14; k++) { const a = -0.3 + (PI + 0.6) * k / 14; lp.push(tub.side(sd, z + (W.R + S.arch + 0.01) * Math.cos(a), wy + (W.R + S.arch + 0.01) * Math.sin(a), 0.006)); }
        put(g, tube(lp, S.lipR || 0.016, 30, 5), S.lipBlack ? tr : pa, 0, 0, 0);
      }
      put(g, tub.panel(sd, S.zr + W.R + S.arch + 0.03, S.zf - W.R - S.arch - 0.03, S.sillY0, S.sillY1, 0.006, 10, 2), tr, 0, 0, 0);
      for (const zl of S.seams) put(g, tub.rail(sd, [[zl, S.sillY1 + 0.03], [zl, beltY - 0.03]], 0.003, 0.0045, 3), tr, 0, 0, 0);
      for (const zh of S.handles) put(g, rb(0.024, 0.028, 0.15, 0.011, 0), ch, tub.side(sd, zh, beltY - 0.1, 0.012).x, beltY - 0.1, zh);
      const gx = gh.side(sd, S.mirrorZ, beltY + 0.1, 0.0).x, my = beltY + 0.12;
      put(g, rod(V3(gx * 0.97, my - 0.04, S.mirrorZ - 0.02), V3(gx + sd * 0.1, my - 0.01, S.mirrorZ + 0.0), 0.014), tr, 0, 0, 0);
      const mh = put(g, rb(0.1, 0.13, 0.2, 0.045, 1), pa, gx + sd * 0.16, my + 0.03, S.mirrorZ + 0.01, 0, sd * 0.2, 0);
      put(g, rb(0.02, 0.1, 0.17, 0.01, 0), dk, gx + sd * 0.162 - sd * 0.0, my + 0.03, S.mirrorZ + 0.045, 0, sd * 0.2, 0);
    });
    // ---- нос: фары, решётка, бампер
    both((sd) => {
      const L = S.lamp, e = tub.endAt(L.x, L.y, true);
      const lamp = put(g, rb(L.w, L.h, 0.14, 0.04, 1), MT.lampW(), sd * L.x, L.y, e.z - 0.05); orient(lamp, sd * e.dy, e.pitch);
      const bez = put(g, rb(L.w + 0.04, L.h + 0.035, 0.1, 0.045, 1), tr, sd * L.x, L.y, e.z - 0.08); orient(bez, sd * e.dy, e.pitch);
      if (S.fog) { const fe = tub.endAt(S.fog.x, S.fog.y, true); const f = put(g, cyl(0.045, 0.06, 14, 'z'), MT.lampW(), sd * S.fog.x, S.fog.y, fe.z - 0.02); orient(f, sd * fe.dy, fe.pitch); }
      const T_ = S.tail, te = tub.endAt(T_.x, T_.y, false);
      const tl = put(g, rb(T_.w, T_.h, 0.12, 0.035, 1), MT.lampR(), sd * T_.x, T_.y, te.z + 0.03); orient(tl, PI + sd * te.dy, te.pitch);
      const tb = put(g, rb(T_.w + 0.03, T_.h + 0.03, 0.08, 0.035, 1), tr, sd * T_.x, T_.y, te.z + 0.06); orient(tb, PI + sd * te.dy, te.pitch);
      if (S.tail.amber) put(g, rb(T_.w * 0.35, T_.h * 0.4, 0.05, 0.015, 0), MT.lampA(), sd * (T_.x + T_.w * 0.18), T_.y - T_.h * 0.1, te.z + 0.0).visible = false;
    });
    const gr = S.grille, fe0 = tub.endAt(0, gr.y, true);
    put(g, rb(gr.w, gr.h, 0.1, 0.025, 1), tr, 0, gr.y, fe0.z - 0.03);
    put(g, rb(gr.w + 0.05, 0.028, 0.11, 0.012, 0), ch, 0, gr.y + gr.h / 2 + 0.012, fe0.z - 0.024); put(g, rb(gr.w + 0.05, 0.024, 0.11, 0.012, 0), ch, 0, gr.y - gr.h / 2 - 0.008, fe0.z - 0.024);
    for (let i = 0; i < 3; i++) put(g, rb(gr.w - 0.04, 0.012, 0.11, 0.005, 0), ch, 0, gr.y + (i - 1) * gr.h * 0.3, fe0.z - 0.02);
    const lowY = tub.yb(tub.z1 - 0.3) + (S.lowY || 0.17), fl = tub.endAt(0, lowY, true);
    put(g, rb(gr.w * 1.55, 0.15, 0.1, 0.045, 1), tr, 0, lowY, fl.z - 0.04);
    put(g, rb(gr.w * 1.9, 0.02, 0.1, 0.01, 0), tr, 0, tub.yb(tub.z1 - 0.2) + 0.03, tub.endAt(0, tub.yb(tub.z1 - 0.2) + 0.03, true).z - 0.02);
    put(g, rb(0.2, 0.05, 0.03, 0.012, 0), ch, 0, gr.y + gr.h / 2 + 0.07, tub.endAt(0, gr.y + gr.h / 2 + 0.07, true).z - 0.005);
    // номерные знаки
    const pf = put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false, PLATE_FRONT), plateAtlas(), 0, lowY + 0.1, tub.endAt(0, lowY + 0.15, true).z + 0.012);
    const pr = put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, true, PLATE_REAR), plateAtlas(), 0, S.tail.y - 0.22, tub.endAt(0, S.tail.y - 0.2, false).z - 0.012);
    // задний бампер-диффузор и выхлоп
    const rl = tub.yb(tub.z0 + 0.2) + 0.1;
    put(g, rb(tub.hwb(tub.z0 + 0.4) * 1.5, 0.16, 0.1, 0.05, 1), tr, 0, rl, tub.endAt(0, rl, false).z + 0.045);
    put(g, cyl(0.034, 0.16, 12, 'z'), ch, S.exhaustX, rl - 0.03, tub.endAt(S.exhaustX, rl, false).z - 0.03);
    // днище
    put(g, rb(tub.hwb(0) * 1.55, 0.14, S.zf - S.zr + 0.5, 0.045, 0), dk, 0, 0.17, (S.zf + S.zr) / 2);
    // ---- салон: пол на уровне пояса, спинки сидений, передняя панель, руль
    const fl0 = S.floor;
    put(g, rb(S.floor.w, 0.06, fl0.z1 - fl0.z0, 0.02, 0), sm, 0, beltY - 0.01, (fl0.z0 + fl0.z1) / 2);
    for (const sx of [-1, 1]) for (const st of S.seats) {
      const top = Math.min(beltY + 0.36, gh.yt(st.z) - 0.1), brTop = top - 0.13, brH = brTop - (beltY - 0.03);
      put(g, rb(0.46, brH, 0.14, 0.06, 1), sm, sx * 0.37, (brTop + beltY - 0.03) / 2, st.z, -0.2, 0, 0);
      put(g, rb(0.2, 0.15, 0.1, 0.04, 0), sm, sx * 0.37, top - 0.07, st.z - 0.045, -0.2, 0, 0);
    }
    put(g, rb(S.floor.w, 0.28, 0.4, 0.09, 1), sm, 0, beltY + 0.07, S.dashZ).rotation.x = 0.35;
    put(g, new T.TorusGeometry(0.17, 0.017, 8, 20), tr, -0.36, beltY + 0.22, S.dashZ - 0.28, 1.05, 0, 0);
    if (S.roofRails) both((sd) => { const a = gh.P(S.gh.railB + 0.1, PI / 2 - al + 0.12, 0.04), b = gh.P(S.gh.railA - 0.2, PI / 2 - al + 0.12, 0.04); put(g, tube([[sd * a.x, a.y + 0.03, a.z], [sd * (a.x + b.x) / 2, (a.y + b.y) / 2 + 0.03, (a.z + b.z) / 2], [sd * b.x, b.y + 0.03, b.z]], 0.02, 6, 6), dk, 0, 0, 0); });
    if (S.fin) put(g, rb(0.05, 0.07, 0.2, 0.02, 0), pa, 0, gh.P(S.fin, PI / 2, 0.012).y + 0.03, S.fin);
    // ---- колёса
    const wm = carWheelMats(); wm.caliper = MT.trim();
    both((sd) => { for (const z of wz) wheel(g, sd * S.track, wy, z, sd, W, wm, false, (z * 3.7 + sd) % TAU); });
    return g;
  }
  const CAR_COLS = [0xb3b8bc, 0x1e2024, 0xe4e5e1, 0x8e2430, 0x25416d, 0x2f5441, 0xb5a17e, 0x4b5258];

  // ====================================================================== легковые: спецификации
  const SEDAN = {
    M: 32, nMid: 20, arch: 0.05, sillY0: 0.2, sillY1: 0.38, beltY: 0.99, mirrorZ: 0.58, dashZ: 0.62, exhaustX: 0.52, track: 0.745, zf: 1.42, zr: -1.38,
    wheel: { R: 0.32, W: 0.215, rimR: 0.205, spokes: 5, seg: 28 },
    tub: { z0: -2.3, z1: 2.32, R0: 0.34, R1: 0.44, n: 3.6, yb: [[-2.3, 0.3], [-2.0, 0.24], [-1.4, 0.2], [1.4, 0.2], [2.0, 0.24], [2.32, 0.32]],
      yt: [[-2.3, 0.93], [-2.0, 1.01], [-1.4, 1.02], [-0.6, 1.0], [0.5, 0.99], [0.9, 0.98], [1.4, 0.92], [1.9, 0.86], [2.32, 0.78]],
      hwb: [[-2.3, 0.72], [-1.5, 0.84], [0, 0.88], [1.5, 0.86], [2.32, 0.78]], hwt: [[-2.3, 0.76], [-1.5, 0.89], [0, 0.92], [1.5, 0.9], [2.32, 0.82]] },
    gh: { drop: 0.24, z0: -1.9, z1: 0.9, R0: 0.06, R1: 0.05, n: 2.7, alpha: 0.95, capA: 0.34, capB: -1.0, railA: 0.86, railB: -1.78, pillars: [-0.22],
      yt: [[-1.9, 0.98], [-1.6, 1.07], [-1.3, 1.21], [-1.0, 1.34], [-0.7, 1.42], [-0.3, 1.455], [0.1, 1.44], [0.35, 1.38], [0.6, 1.25], [0.8, 1.1], [0.9, 1.0]],
      hwb: 0.87, hwt: 0.66, extra: [-1.75, 0.45] },
    lamp: { x: 0.66, y: 0.8, w: 0.4, h: 0.1 }, tail: { x: 0.7, y: 0.93, w: 0.4, h: 0.1 }, grille: { w: 0.62, h: 0.1, y: 0.62 },
    seams: [0.56, -0.22, -1.1], handles: [0.22, -0.86], floor: { w: 1.5, z0: -1.6, z1: 0.7 },
    seats: [{ z: 0.12 }, { z: -0.85 }],
  };

  reg('car', 'sedan', (o) => finish(buildCar(SEDAN, CAR_COLS[(o.variant | 0) % 8]), 11 + (o.variant | 0)));

  // @@APPEND
})();
