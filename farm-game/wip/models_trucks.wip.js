/* Грузовики для вывоза урожая и городской транспорт (процедурные PBR-модели, three.js r128, без внешних файлов).
   kind 'truck': cart (ур. 0, телега), pickup (1), truck (2, фургон со шторами), semi (3, седельный тягач с рефрижераторным прицепом).
   kind 'car': sedan, hatch, suv, van.  kind 'bus': bus.   Перед = +Z, начало координат — центр опоры на земле, 1 единица ~ 1 м.
   Все формы авторские (без чужих логотипов): кузова — лофты со скруглёнными сечениями, лаковая краска, стекло, настоящие шины и диски. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const UP = V3(0, 1, 0);

  // ====================================================================== реестр с кэшем
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = opts || {};
      const key = [kind, name, opts.level | 0, opts.variant | 0, opts.seed | 0, opts.stage | 0, opts.length | 0].join('|');
      if (!_cache[key]) _cache[key] = fn(opts);
      return _cache[key].clone(true);
    });
  }

  // ====================================================================== геометрия: общий набор
  /** Нормали усредняются только между гранями с углом меньше deg: скруглённые фаски гладкие, рёбра чёткие. */
  function crease(geo, deg) {
    const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, n = pa.count, cosT = Math.cos((deg || 40) * PI / 180);
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
  /** Скруглённая коробка w×h×d (x,y,z), радиус r; q — качество 0/1/2. Нормали сглажены. */
  function rb(w, h, d, r, q) {
    if (q == null) q = Math.min(w, h, d) < 0.1 ? 0 : 1;
    const k = [w, h, d, r, q].map((v) => (v == null ? 'n' : v.toFixed(3))).join('|');
    if (_rb[k]) return _rb[k];
    r = Math.max(0.001, Math.min(r == null ? 0.05 : r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const bev = Math.min(r * 0.7, d / 2 - 0.001, 0.3), hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.0005, Math.min(r, hw - 0.0005, hh - 0.0005)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh);
    sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: [1, 2, 3][q], curveSegments: [2, 3, 5][q] });
    g.translate(0, 0, -(d - 2 * bev) / 2);
    return (_rb[k] = crease(g, 42));
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
  /** Выдавливание контура. plane 'zy': контур (z,y) вытянут по X шириной w (профиль кузова сбоку; перед = +z). plane 'xy': контур (x,y) вдоль Z. 'xz': контур (x,z) вверх по Y. */
  function ex(pts, w, o) {
    o = o || {}; const b = o.b == null ? 0.03 : o.b, rad = o.r == null ? 0.08 : o.r;
    const g = new T.ExtrudeGeometry(o.shape || rshape(pts, rad), { depth: Math.max(0.002, w - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: o.seg || 2, curveSegments: o.cs || 4 });
    g.translate(0, 0, -(w - 2 * b) / 2);
    if (o.plane === 'zy') g.rotateY(-PI / 2); else if (o.plane === 'xz') g.rotateX(PI / 2);
    return crease(g, 42);
  }
  const lathe = (prof, seg, axis) => { const g = new T.LatheGeometry(prof.map((p) => new T.Vector2(p[0], p[1])), seg || 20); if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'z') g.rotateX(PI / 2); return g; };
  const _cy = {};
  /** Цилиндр вдоль оси ('x'|'y'|'z') радиусом r (r2 — другой торец), длиной len. */
  function cyl(r, len, seg, axis, r2, open) {
    const k = [r, len, seg, axis, r2, open].join('|'); if (_cy[k]) return _cy[k];
    const g = new T.CylinderGeometry(r2 == null ? r : r2, r, len, seg || 14, 1, !!open);
    if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'z') g.rotateX(PI / 2);
    return (_cy[k] = g);
  }
  const sphG = (rx, ry, rz, ws, hs) => { const g = new T.SphereGeometry(1, ws || 12, hs || 8); g.scale(rx, ry == null ? rx : ry, rz == null ? rx : rz); return g; };
  /** Труба по ломаной (CatmullRom). */
  function tube(pts, r, segs, radial, closed) {
    const cu = new T.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V3(p[0], p[1], p[2]))), !!closed, 'catmullrom', 0.5);
    return new T.TubeGeometry(cu, segs || pts.length * 4, r, radial || 6, !!closed);
  }
  const toV = (p) => (p && p.isVector3 ? p : V3(p[0], p[1], p[2]));
  /** Стержень между двумя точками (цилиндр, r2 — радиус второго конца). */
  function rod(a, b, r, seg, r2) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length();
    const g = new T.CylinderGeometry(r2 == null ? r : r2, r, L, seg || 8, 1, false);
    g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(UP, d.normalize())));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
  }
  /** Поверхность по функции fn(u,v,out) на сетке nu×nv. hint — направление наружу (для автоматической ориентации граней). Есть UV (u,v). */
  function sheet(fn, nu, nv, hint) {
    const pos = [], uv = [], idx = [], p = new T.Vector3();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
    const W = nu + 1, ci = Math.floor(nu / 2), cj = Math.floor(nv / 2), a0 = cj * W + ci;
    const A = V3(pos[a0 * 3], pos[a0 * 3 + 1], pos[a0 * 3 + 2]), B = V3(pos[(a0 + 1) * 3], pos[(a0 + 1) * 3 + 1], pos[(a0 + 1) * 3 + 2]), D = V3(pos[(a0 + W + 1) * 3], pos[(a0 + W + 1) * 3 + 1], pos[(a0 + W + 1) * 3 + 2]);
    const nrm = B.sub(A).cross(D.sub(A)); const flip = hint ? nrm.dot(hint) < 0 : false;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (!flip) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /** Плоский прямоугольник-декаль в плоскости x=const / z=const / y=const. */
  function quad(axis, a0, a1, b0, b1, c, flip) {
    const g = new T.PlaneGeometry(1, 1); const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i), A = lerp(a0, a1, u), B = lerp(b0, b1, v);
      if (axis === 'x') p.setXYZ(i, c, B, A); else if (axis === 'z') p.setXYZ(i, A, B, c); else p.setXYZ(i, A, c, B);
    }
    g.computeVertexNormals();
    // ориентируем нормаль наружу: x -> +x, z -> +z, y -> +y (flip инвертирует)
    const n = V3(0, 0, 0); const idx = g.index.array; const a = V3(p.getX(idx[0]), p.getY(idx[0]), p.getZ(idx[0])), b = V3(p.getX(idx[1]), p.getY(idx[1]), p.getZ(idx[1])), d = V3(p.getX(idx[2]), p.getY(idx[2]), p.getZ(idx[2]));
    n.copy(b.sub(a)).cross(d.sub(a)); const want = axis === 'x' ? V3(1, 0, 0) : axis === 'z' ? V3(0, 0, 1) : V3(0, 1, 0);
    if ((n.dot(want) < 0) !== !!flip) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  }
  /** Склеивание нескольких геометрий (с матрицами) в одну неиндексированную. */
  function mergeWorld(list) {
    const pos = [], nor = [], uv = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    for (const { geo, m } of list) {
      const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; nm.getNormalMatrix(m);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); return g;
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

  // ====================================================================== лофт: кузов из скруглённых сечений (суперэллипс), вдоль оси Z
  const taperF = (t, q) => { t = clamp(t, 0, 1); return Math.pow(Math.max(0, 1 - Math.pow(1 - t, q)), 1 / q); };
  /** Кузов-лофт: z0..z1 (спереди +z), yb/yt — низ/верх сечения, hwb/hwt — полуширина снизу/сверху (функции z или массивы [[z,v]]), n — «квадратность» сечения, R0/R1 — радиусы скругления торцов. */
  function Loft(o) {
    this.z0 = o.z0; this.z1 = o.z1; this.R0 = o.R0 == null ? 0.3 : o.R0; this.R1 = o.R1 == null ? 0.3 : o.R1; this.q0 = o.q0 || 3; this.q1 = o.q1 || 3;
    this.yb = interp(o.yb); this.yt = interp(o.yt); this.hwb = interp(o.hwb); this.hwt = interp(o.hwt); this.n = o.n || 3.5; this.extra = o.extra || [];
  }
  Loft.prototype.f = function (z) {
    let f = 1; const a = (z - this.z0) / this.R0, b = (this.z1 - z) / this.R1;
    if (a < 1) f = Math.min(f, taperF(a, this.q0)); if (b < 1) f = Math.min(f, taperF(b, this.q1)); return f;
  };
  /** Точка сечения на станции z при угле th (0 = бок +x, PI/2 = верх). inf — вынос наружу. */
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
  /** Геометрия лофта. o: M — число точек в сечении, nMid, zA/zB — ограничение по z, a0/a1 — дуга сечения (для открытых панелей), inf — вынос. */
  Loft.prototype.geo = function (o) {
    o = o || {}; const M = o.M || 24, inf = o.inf || 0, a0 = o.a0 == null ? 0 : o.a0, a1 = o.a1 == null ? TAU : o.a1, open = a1 - a0 < TAU - 1e-6, cols = open ? M + 1 : M;
    let zs = o.zs || this.stations(o.nMid || 14); if (o.zA != null || o.zB != null) { const A = o.zA == null ? -1e9 : o.zA, B = o.zB == null ? 1e9 : o.zB; zs = zs.filter((z) => z >= A - 1e-6 && z <= B + 1e-6); if (o.zA != null && zs[0] > o.zA + 1e-5) zs.unshift(o.zA); if (o.zB != null && zs[zs.length - 1] < o.zB - 1e-5) zs.push(o.zB); }
    const pos = [], idx = [], p = new T.Vector3();
    for (const z of zs) for (let k = 0; k < cols; k++) { const th = a0 + (a1 - a0) * (open ? k / M : k / M); this.P(z, th, inf, p); pos.push(p.x, p.y, p.z); }
    const S = zs.length;
    for (let i = 0; i < S - 1; i++) for (let k = 0; k < (open ? M : M); k++) {
      const k1 = open ? k + 1 : (k + 1) % M, v00 = i * cols + k, v01 = i * cols + k1, v10 = (i + 1) * cols + k, v11 = (i + 1) * cols + k1;
      idx.push(v00, v01, v11, v00, v11, v10);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  /** Лист на боковой поверхности лофта: z в [zA,zB], y в [yA,yB]. */
  Loft.prototype.panel = function (sd, zA, zB, yA, yB, inf, nu, nv) {
    const hint = V3(sd, 0, 0);
    return sheet((u, v, out) => this.side(sd, lerp(zA, zB, u), lerp(yA, yB, v), inf, out), nu || 8, nv || 4, hint);
  };
  /** Круг/диск на боковой поверхности лофта (центр zc, yc; радиус r; arc — только дуга). */
  Loft.prototype.disc = function (sd, zc, yc, r, inf, y0) {
    const hint = V3(sd, 0, 0), ymin = y0 == null ? this.yb(zc) + 0.004 : y0;
    return sheet((u, v, out) => { const a = u * TAU, rr = v * r; this.side(sd, zc + rr * Math.cos(a), Math.max(ymin, yc + rr * Math.sin(a)), inf, out); }, 20, 2, hint);
  };
  Loft.prototype.rail = function (sd, pts, inf, r, radial) { // труба по точкам (z,y) на боковой поверхности
    return tube(pts.map(([z, y]) => this.side(sd, z, y, inf)), r, pts.length * 3, radial || 4);
  };

  // ====================================================================== материалы и текстуры
  const texCache = {};
  function canvasTex(key, w, h, draw, rep) {
    if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return (texCache[key] = t);
  }
  const matCache = {};
  /** Стандартный PBR-материал с текстурой (кэш по ключу). */
  function texPbr(key, w, h, draw, o, rep) { const k = 'S' + key; return matCache[k] || (matCache[k] = new T.MeshStandardMaterial(Object.assign({ map: canvasTex(key, w, h, draw, rep), metalness: 0.05, roughness: 0.6, envMapIntensity: 0.5 }, o || {}))); }
  function texLam(key, w, h, draw, o, rep) { const k = 'L' + key; return matCache[k] || (matCache[k] = new T.MeshLambertMaterial(Object.assign({ map: canvasTex(key, w, h, draw, rep) }, o || {}))); }
  const hex = (c) => '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  const shade = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = (v) => clamp(Math.round(v * k), 0, 255); return (f(r) << 16) | (f(g) << 8) | f(b); };
  const mixC = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
  const MT = {
    trim: () => C.matte(0x1c1d20, { roughness: 0.72 }),
    rubber: () => C.rubberM(),
    chrome: () => C.chromeM(),
    alloy: () => C.metal(0xc9ced4, { roughness: 0.26 }),
    dark: () => C.metal(0x2b2e33, { roughness: 0.5 }),
    glass: (t) => C.glassM(t || 0x2b3d4a),
    lampW: () => C.lightM(0xfff3d2), lampR: () => C.lightM(0xc81a14), lampA: () => C.lightM(0xff9d12),
    seat: () => C.matte(0x58534b, { roughness: 0.85 }),
    paint: (c, o) => C.paint(c, o),
  };
  const put = (g, geo, m, x, y, z, rx, ry, rz) => { const o = C.mesh(geo, m, x, y, z, rx, ry, rz); g.add(o); return o; };
  /** Завершение: склейка по материалам, прозрачные (стекло) склеиваются в один меш и добавляются после. */
  function finish(g) {
    g.updateMatrixWorld(true);
    const out = C.bakeTex(g), glass = new Map();
    g.traverse((o) => { if (o.isMesh && o.material.transparent) { if (!glass.has(o.material)) glass.set(o.material, []); glass.get(o.material).push({ geo: o.geometry, m: o.matrixWorld.clone() }); } });
    for (const [m, list] of glass) { const mesh = new T.Mesh(mergeWorld(list), m); mesh.renderOrder = 2; out.add(mesh); }
    return out;
  }
  /** Колёсная пара/фонари: вызвать fn(+1) и fn(-1). */
  const both = (fn) => { fn(1); fn(-1); };

  // ====================================================================== колёса
  const _wh = {};
  /** Профиль шины (r,a) → LatheGeometry вокруг оси X; наружу +x. */
  function wheelGeos(s) {
    const key = JSON.stringify(s); if (_wh[key]) return _wh[key];
    const R = s.R, W = s.W, rR = s.rimR, h = R - rR, hw = W / 2, seg = s.seg || 20, truck = s.kind === 'truck', gr = s.grooves;
    const tp = [[rR - 0.006, -0.78 * hw], [rR + 0.22 * h, -0.97 * hw], [rR + 0.58 * h, -1.0 * hw], [rR + 0.88 * h, -0.86 * hw], [R - 0.012, -0.62 * hw]];
    if (gr) { tp.push([R, -0.46 * hw], [R, -0.24 * hw], [R - 0.016, -0.17 * hw], [R - 0.016, 0.17 * hw], [R, 0.24 * hw], [R, 0.46 * hw]); }
    else tp.push([R, -0.4 * hw], [R, 0.4 * hw]);
    tp.push([R - 0.012, 0.62 * hw], [rR + 0.88 * h, 0.86 * hw], [rR + 0.58 * h, 1.0 * hw], [rR + 0.22 * h, 0.97 * hw], [rR - 0.006, 0.78 * hw]);
    const r = {};
    r.tyre = lathe(tp, seg, 'x');
    // обод: губа + бочка (вид снаружи) — +x наружу
    const aO = 0.78 * hw, lip = [[rR + 0.012, aO - 0.02], [rR + 0.004, aO + 0.004], [rR - 0.012, aO + 0.006], [rR - 0.02, aO - 0.012], [rR - 0.022, aO - 0.08 * W]];
    r.lip = lathe(lip, seg, 'x');
    const bar = [[rR - 0.022, aO - 0.08 * W], [rR - 0.024, -0.6 * hw], [rR * 0.4, -0.6 * hw]];  // бочка + задняя стенка (тёмная)
    r.barrel = lathe(bar, seg, 'x');
    // диск ступицы / колпак
    const aH = aO - 0.12 * W;
    if (s.style === 'steel') {
      const face = [[rR - 0.02, aO - 0.02 * W], [rR * 0.82, aO - 0.05 * W], [rR * 0.55, aH - 0.02 * W], [rR * 0.36, aH], [rR * 0.30, aH + 0.035 * W], [rR * 0.16, aH + 0.035 * W], [0.001, aH + 0.02 * W]];
      r.face = lathe(face, seg, 'x');
      const lugs = [], nL = s.lugs || 8, rl = rR * 0.27;
      for (let i = 0; i < nL; i++) { const a = i / nL * TAU, gg = cyl(R * 0.027, W * 0.07, 6, 'x'); const m = new T.Matrix4().makeTranslation(aH + 0.05 * W, Math.sin(a) * rl, Math.cos(a) * rl); lugs.push({ geo: gg, m }); }
      r.lugs = mergeWorld(lugs);
    } else {
      const nS = s.spokes || 5, sp = [], len = rR * 0.8 - rR * 0.12;
      for (let i = 0; i < nS; i++) {
        const a = i / nS * TAU + 0.3, bg = new T.BoxGeometry(W * 0.075, len, rR * 0.2); bg.translate(aH, rR * 0.12 + len / 2 + (rR * 0.1), 0); bg.rotateX(a);
        sp.push({ geo: bg, m: new T.Matrix4() });
      }
      r.spokes = mergeWorld(sp);
      r.hub = lathe([[rR * 0.34, aH - 0.02], [rR * 0.34, aH + 0.012 * W], [rR * 0.24, aH + 0.03 * W], [0.001, aH + 0.04 * W]], 16, 'x');
      r.disc = cyl(rR * 0.86, 0.012 * W + 0.01, 18, 'x'); r.disc.translate(-0.02 * W, 0, 0);
      r.caliper = new T.BoxGeometry(0.06 * W + 0.03, rR * 0.3, rR * 0.4); r.caliper.translate(-0.01, rR * 0.7, rR * 0.35);
    }
    return (_wh[key] = r);
  }
  /** Колесо в точке (x,y,z). side: +1 — наружная сторона к +x, -1 — к -x. detail: 0 — упрощённое (внутреннее сдвоенное). */
  function wheel(g, x, y, z, side, s, mats, detail) {
    const w = wheelGeos(s), ry = side > 0 ? 0 : PI, M = mats;
    put(g, w.tyre, M.tyre || M.rubber, x, y, z, 0, ry, 0);
    if (detail === 0) { put(g, w.barrel, M.dark, x, y, z, 0, ry, 0); put(g, w.lip, M.rim, x, y, z, 0, ry, 0); if (w.face) put(g, w.face, M.rim, x, y, z, 0, ry, 0); return; }
    put(g, w.lip, M.rim, x, y, z, 0, ry, 0); put(g, w.barrel, M.dark, x, y, z, 0, ry, 0);
    if (w.face) { put(g, w.face, M.rim, x, y, z, 0, ry, 0); put(g, w.lugs, M.chrome, x, y, z, 0, ry, 0); }
    else { put(g, w.spokes, M.rim, x, y, z, 0, ry, 0); put(g, w.hub, M.rim, x, y, z, 0, ry, 0); put(g, w.disc, M.dark, x, y, z, 0, ry, 0); if (M.caliper) put(g, w.caliper, M.caliper, x, y, z, 0, ry, 0); }
  }
  const carWheelMats = () => ({ tyre: tyreMat(false), dark: MT.dark(), rim: MT.alloy(), chrome: MT.chrome(), caliper: C.paint(0x9c2a22) });
  const truckWheelMats = (rim) => ({ tyre: tyreMat(true), dark: MT.dark(), rim: rim || C.metal(0xb9bfc6, { roughness: 0.4 }), chrome: MT.chrome() });
  /** Шина с текстурой протектора/боковины. */
  function tyreMat(big) {
    const key = big ? 'tyreT' : 'tyreC';
    return texPbr(key, 512, 64, (g, w, h) => {
      g.fillStyle = '#17181a'; g.fillRect(0, 0, w, h);
      const n = big ? 28 : 36, bw = w / n;
      // v = индекс точки профиля: протектор ~ центр (v: .33-.67), боковины по краям
      for (let i = 0; i < n; i++) {
        g.fillStyle = 'rgba(70,72,76,0.55)'; g.fillRect(i * bw + 1, h * 0.34, bw * 0.55, h * 0.32);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(i * bw + bw * 0.5, h * 0.34, 2, h * 0.32);
      }
      g.fillStyle = 'rgba(120,122,126,0.35)'; g.font = 'bold ' + Math.round(h * 0.11) + 'px sans-serif'; g.textBaseline = 'middle';
      g.fillText(big ? 'ROADMASTER 295/80 R22.5   ' : 'ROADMASTER 205/55 R16   ', 8, h * 0.17); g.fillText(big ? 'ROADMASTER 295/80 R22.5   ' : 'ROADMASTER 205/55 R16   ', 8, h * 0.83);
      g.strokeStyle = 'rgba(100,100,104,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.3); g.lineTo(w, h * 0.3); g.moveTo(0, h * 0.7); g.lineTo(w, h * 0.7); g.stroke();
    }, { metalness: 0, roughness: 0.9, envMapIntensity: 0.25 });
  }

  // ====================================================================== АВТОМОБИЛИ
  const CAR_COLS = [0xb3b8bc, 0x1e2024, 0xe4e5e1, 0x8e2430, 0x25416d, 0x2f5441, 0xb5a17e, 0x4b5258];
  const FLEET = [0xe6e8e4, 0xa02e29, 0x284a78, 0x2f6a49, 0xc7a02f, 0x8c949b];
  const plateTex = (txt) => texPbr('plate' + txt, 128, 32, (g, w, h) => {
    g.fillStyle = '#f1f0e8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#222'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#16365e'; g.fillRect(3, 3, 14, h - 6); g.fillStyle = '#222'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2 + 6, h / 2 + 1);
  }, { roughness: 0.5, metalness: 0.1 });

  /** Легковой автомобиль по спецификации (седан / хэтчбек / внедорожник). */
  function buildCar(S, variant) {
    const col = CAR_COLS[(variant | 0) % 8], g = new T.Group(), pa = MT.paint(col), tr = MT.trim(), ch = MT.chrome(), gl = MT.glass();
    const tub = new Loft(S.tub), gh = new Loft(Object.assign({ yb: (z) => tub.yt(z) - S.gh.drop }, S.gh, { z0: S.gh.z0, z1: S.gh.z1 }));
    put(g, tub.geo({ M: S.M || 26, nMid: S.nMid || 16 }), pa, 0, 0, 0);
    // зелёная зона: стекло + крыша + стойки
    put(g, gh.geo({ M: 22, nMid: 14, zs: null }), gl, 0, 0, 0);
    const al = S.gh.alpha, capA = gh.geo({ M: 10, a0: PI / 2 - al, a1: PI / 2 + al, zA: S.gh.capA, zB: S.gh.capB, inf: 0.012, nMid: 8 });
    put(g, capA, pa, 0, 0, 0);
    // рамки: передняя и задняя поперечины крыши
    const hdr = (z) => { const pts = []; for (let k = 0; k <= 8; k++) pts.push(gh.P(z, PI / 2 - al + 2 * al * k / 8, 0.012)); return tube(pts, 0.02, 16, 4); };
    put(g, hdr(S.gh.capA), pa, 0, 0, 0); put(g, hdr(S.gh.capB), pa, 0, 0, 0);
    // рейлинги/стойки по краям крыши
    const railZ = []; for (let z = S.gh.railA; z >= S.gh.railB - 1e-6; z -= (S.gh.railA - S.gh.railB) / 22) railZ.push(z);
    both((sd) => {
      const pts = railZ.map((z) => { const p = gh.P(z, PI / 2 - al, 0.004); p.x *= sd; return p; });
      put(g, tube(pts, 0.026, 40, 5), pa, 0, 0, 0);
      // B-стойка (и C-стойка для длинных кузовов)
      for (const zb of S.gh.pillars) { const pts2 = []; for (let k = 0; k <= 7; k++) { const th = lerp(0.12, PI / 2 - al, k / 7); const p = gh.P(zb, th, 0.004); p.x *= sd; pts2.push(p); } put(g, tube(pts2, 0.024, 14, 5), pa, 0, 0, 0); }
    });
    // ---- арки колёс, пороги, швы дверей
    const W = S.wheel, wz = [S.zf, S.zr], wy = W.R;
    both((sd) => {
      for (const z of wz) {
        put(g, tub.disc(sd, z, wy, W.R + S.arch, 0.005), tr, 0, 0, 0);
        const lp = []; for (let k = 0; k <= 12; k++) { const a = -0.25 + (PI + 0.5) * k / 12; lp.push(tub.side(sd, z + (W.R + S.arch + 0.012) * Math.cos(a), wy + (W.R + S.arch + 0.012) * Math.sin(a), 0.006)); }
        put(g, tube(lp, S.lipR || 0.016, 28, 5), S.lipBlack ? tr : pa, 0, 0, 0);
      }
      // нижняя пластиковая накладка (пороги)
      put(g, tub.panel(sd, S.zr + W.R + S.arch + 0.05, S.zf - W.R - S.arch - 0.05, S.tub.yb[2] ? S.sillY0 : S.sillY0, S.sillY1, 0.006, 10, 2), tr, 0, 0, 0);
      for (const zl of S.seams) put(g, tub.rail(sd, [[zl, S.sillY1 + 0.02], [zl, (S.beltY - 0.02)]], 0.003, 0.0045, 3), tr, 0, 0, 0);
      // ручки дверей, зеркала
      for (const zh of S.handles) put(g, rb(0.022, 0.026, 0.14, 0.01, 0), ch, tub.side(sd, zh, S.beltY - 0.1, 0.012).x, S.beltY - 0.1, zh);
      const mx = gh.side(sd, S.mirrorZ, S.beltY + 0.05, 0.0).x;
      put(g, rod(V3(sd * (Math.abs(mx) - 0.02), S.beltY + 0.0, S.mirrorZ - 0.02), V3(sd * (Math.abs(mx) + 0.1), S.beltY + 0.06, S.mirrorZ + 0.0), 0.014), tr, 0, 0, 0);
      put(g, rb(0.1, 0.12, 0.2, 0.04, 1), pa, sd * (Math.abs(mx) + 0.16), S.beltY + 0.1, S.mirrorZ + 0.02, 0, sd * 0.18, 0);
      put(g, rb(0.02, 0.09, 0.16, 0.01, 0), tr, sd * (Math.abs(mx) + 0.115), S.beltY + 0.1, S.mirrorZ + 0.04, 0, sd * 0.18, 0);
    });
    // ---- нос: фары, решётка, бампер
    const zFront = (x) => { const hw = S.tub.hwt(S.tub.z1 - 0.2) * 0.98, f = clamp(Math.abs(x) / hw, 0, 0.995); return S.tub.z1 - S.tub.R1 * (1 - Math.pow(1 - Math.pow(f, S.tub.q1 || 3), 1 / (S.tub.q1 || 3))); };
    const zRear = (x) => { const hw = S.tub.hwt(S.tub.z0 + 0.2) * 0.98, f = clamp(Math.abs(x) / hw, 0, 0.995); return S.tub.z0 + S.tub.R0 * (1 - Math.pow(1 - Math.pow(f, S.tub.q0 || 3), 1 / (S.tub.q0 || 3))); };
    const yawAt = (zf, x, sgn) => { const dx = 0.05, dz = zf(x + dx) - zf(x); return Math.atan2(sgn * -dz, dx * sgn * sgn) ; };
    both((sd) => {
      const hx = sd * S.lamp.x, hz = zFront(S.lamp.x), a = Math.atan2(-(zFront(S.lamp.x + 0.05) - zFront(S.lamp.x)), 0.05);
      const L = put(g, rb(S.lamp.w, S.lamp.h, 0.1, 0.035, 1), MT.lampW(), hx, S.lamp.y, hz - 0.02, 0, sd * a, 0);
      put(g, rb(S.lamp.w + 0.04, S.lamp.h + 0.03, 0.08, 0.04, 1), tr, hx, S.lamp.y, hz - 0.045, 0, sd * a, 0);
      put(g, rb(S.lamp.w * 0.45, S.lamp.h * 0.4, 0.04, 0.012, 0), MT.lampA(), sd * (S.lamp.x + S.lamp.w * 0.3), S.lamp.y - S.lamp.h * 0.3, hz - 0.02 + 0.03, 0, sd * a, 0).scale.set(0.001, 0.001, 0.001); // скрыто (резерв)
      // задние фонари
      const tx = S.tail.x, tz = zRear(tx), ta = Math.atan2((zRear(tx + 0.05) - zRear(tx)), 0.05);
      put(g, rb(S.tail.w, S.tail.h, 0.08, 0.03, 1), MT.lampR(), sd * tx, S.tail.y, tz + 0.015, 0, PI + sd * (PI - 0) * 0 + sd * -ta * 1 + 0, 0);
    });
    // решётка радиатора
    put(g, rb(S.grille.w, S.grille.h, 0.06, 0.02, 0), tr, 0, S.grille.y, zFront(0) - 0.02);
    put(g, rb(S.grille.w + 0.04, 0.025, 0.07, 0.01, 0), ch, 0, S.grille.y + S.grille.h / 2 + 0.01, zFront(0) - 0.012);
    put(g, rb(S.grille.w + 0.04, 0.02, 0.07, 0.01, 0), ch, 0, S.grille.y - S.grille.h / 2 - 0.005, zFront(0) - 0.012);
    for (let i = 0; i < 3; i++) put(g, rb(S.grille.w - 0.06, 0.012, 0.075, 0.005, 0), ch, 0, S.grille.y + (i - 1) * S.grille.h * 0.28, zFront(0) - 0.012);
    put(g, rb(S.grille.w * 1.5, 0.16, 0.08, 0.04, 1), tr, 0, S.tub.yb(S.tub.z1 - 0.3) + 0.2, zFront(0) - 0.065); // нижняя воздухозаборная решётка
    put(g, rb(0.2, 0.05, 0.03, 0.012, 0), ch, 0, S.grille.y + S.grille.h / 2 + 0.05, zFront(0) + 0.0); // эмблема-плашка
    // номерные знаки
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false), plateTex('FA 2431'), 0, S.tail.y - 0.2, zRear(0) - 0.012).rotation.y = PI;
    put(g, quad('z', -0.26, 0.26, 0, 0.13, 0, false), plateTex('FM 5870'), 0, S.tub.yb(S.tub.z1 - 0.3) + 0.06, zFront(0) + 0.0);
    // выхлоп
    put(g, cyl(0.032, 0.14, 10, 'z'), ch, S.exhaustX, S.tub.yb(S.tub.z0 + 0.2) - 0.01, S.tub.z0 - 0.02);
    // днище
    put(g, rb(S.tub.hwb(0) * 1.5, 0.14, S.zf - S.zr + 0.4, 0.04, 0), MT.dark(), 0, 0.16, (S.zf + S.zr) / 2);
    // салон: сиденья, панель, руль
    const sm = MT.seat();
    for (const sx of [-1, 1]) for (const sset of S.seats) {
      put(g, rb(0.46, 0.12, 0.5, 0.05, 1), sm, sx * 0.38, sset.y, sset.z);
      put(g, rb(0.46, 0.56, 0.13, 0.06, 1), sm, sx * 0.38, sset.y + 0.34, sset.z - 0.24, -0.18, 0, 0);
      put(g, rb(0.2, 0.17, 0.09, 0.04, 0), sm, sx * 0.38, sset.y + 0.72, sset.z - 0.29, -0.18, 0, 0);
    }
    put(g, rb(1.5, 0.3, 0.45, 0.08, 1), sm, 0, S.beltY - 0.05, S.dashZ);
    const sw = put(g, new T.TorusGeometry(0.17, 0.016, 6, 16), tr, -0.36, S.beltY + 0.05, S.dashZ - 0.28, 1.0, 0, 0);
    // кузов по высоте крыши: поручни (внедорожник)
    if (S.roofRails) both((sd) => { const a = gh.P(S.gh.railB + 0.1, PI / 2 - al + 0.15, 0.03), b = gh.P(S.gh.railA - 0.2, PI / 2 - al + 0.15, 0.03); put(g, tube([[sd * a.x, a.y + 0.02, a.z], [sd * b.x, b.y + 0.02, b.z]], 0.018, 4, 5), MT.dark(), 0, 0, 0); });
    // колёса
    const wm = carWheelMats();
    both((sd) => { for (const z of wz) wheel(g, sd * S.track, wy, z, sd, W, wm); });
    return g;
  }

  // ---- спецификации
  const SEDAN = {
    M: 26, nMid: 16, arch: 0.05, sillY0: 0.2, sillY1: 0.38, beltY: 0.99, mirrorZ: 0.6, dashZ: 0.62, exhaustX: 0.52, track: 0.745, zf: 1.42, zr: -1.38,
    wheel: { R: 0.32, W: 0.215, rimR: 0.205, spokes: 5, seg: 18 },
    tub: { z0: -2.3, z1: 2.32, R0: 0.34, R1: 0.42, n: 3.6, yb: [[-2.3, 0.3], [-2.0, 0.24], [-1.4, 0.2], [1.4, 0.2], [2.0, 0.24], [2.32, 0.32]],
      yt: [[-2.3, 0.93], [-2.0, 1.01], [-1.4, 1.02], [-0.6, 1.0], [0.5, 0.99], [0.9, 0.98], [1.4, 0.92], [1.9, 0.86], [2.32, 0.78]],
      hwb: [[-2.3, 0.72], [-1.5, 0.84], [0, 0.88], [1.5, 0.86], [2.32, 0.78]], hwt: [[-2.3, 0.76], [-1.5, 0.89], [0, 0.92], [1.5, 0.9], [2.32, 0.82]] },
    gh: { drop: 0.24, z0: -1.9, z1: 0.9, R0: 0.06, R1: 0.05, n: 2.7, alpha: 0.95, capA: 0.34, capB: -1.0, railA: 0.86, railB: -1.78, pillars: [-0.22],
      yt: [[-1.9, 0.98], [-1.6, 1.07], [-1.3, 1.21], [-1.0, 1.34], [-0.7, 1.42], [-0.3, 1.455], [0.1, 1.44], [0.35, 1.38], [0.6, 1.25], [0.8, 1.1], [0.9, 1.0]],
      hwb: 0.87, hwt: 0.66, extra: [-1.75, 0.45] },
    lamp: { x: 0.66, y: 0.8, w: 0.4, h: 0.1 }, tail: { x: 0.7, y: 0.93, w: 0.4, h: 0.1 }, grille: { w: 0.62, h: 0.1, y: 0.6 },
    seams: [0.56, -0.22, -1.1], handles: [0.22, -0.86],
    seats: [{ y: 0.52, z: 0.14 }, { y: 0.55, z: -0.88 }],
  };

  reg('car', 'sedan', (o) => finish(buildCar(SEDAN, o.variant)));

  // @@APPEND
})();
