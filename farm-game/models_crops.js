/* Процедурные модели грядок (kind 'crop'): по одной модели на культуру, opts.stage 0..3 (посев / молодые / зрелая зелень / урожай).
   Один тайл поля: 1.0 x 1.0, начало координат = центр поверхности почвы, ряды идут вдоль Z, перед = +Z.
   Three.js r128, без внешних файлов. Геометрия собирается вручную в один меш с цветами вершин (градиенты листьев, плоды). */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2, LIM = 0.497;

  // ------------------------------------------------------------------ случайные числа
  function lcg(seed) { let s = (seed >>> 0) || 1; const f = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; for (let i = 0; i < 8; i++) f(); return f; }
  let rnd = lcg(1);
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

  // ------------------------------------------------------------------ цвета
  const _col = new T.Color();
  const hx = (h) => { _col.setHex(h); return [_col.r, _col.g, _col.b]; };
  const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const jit = (c, a) => mul(c, 1 + (rnd() - 0.5) * 2 * a);
  const SOIL = hx(0x5f442b);

  // ------------------------------------------------------------------ сборщик треугольников
  function Mesher() { this.P = []; this.N = []; this.K = []; }
  Mesher.prototype.tri = function (a, b, c, ca, cb, cc, na, nb, nc) {
    if (!na) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-12) return; nx /= l; ny /= l; nz /= l; na = nb = nc = [nx, ny, nz];
    }
    cb = cb || ca; cc = cc || ca;
    this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.N.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.K.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  };
  Mesher.prototype.quad = function (a, b, c, d, ca, cb, cc, cd) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd || cc); };

  // ------------------------------------------------------------------ геометрия
  const _e = new T.Euler(), _mx = new T.Matrix4();
  function frame(yaw, pitch, roll) { _e.set(pitch || 0, yaw || 0, roll || 0, 'YXZ'); _mx.makeRotationFromEuler(_e); const e = _mx.elements; return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]]; }
  const xf = (f, o, x, y, z) => [o[0] + f[0] * x + f[3] * y + f[6] * z, o[1] + f[1] * x + f[4] * y + f[7] * z, o[2] + f[2] * x + f[5] * y + f[8] * z];
  const rotv = (f, x, y, z) => { const a = f[0] * x + f[3] * y + f[6] * z, b = f[1] * x + f[4] * y + f[7] * z, c = f[2] * x + f[5] * y + f[8] * z, l = Math.sqrt(a * a + b * b + c * c) || 1; return [a / l, b / l, c / l]; };

  // не даём листьям выйти за границу тайла: горизонтальное смещение от основания равномерно сжимается
  function fit(pts, ox, oz) {
    let f = 1;
    for (const p of pts) {
      const dx = p[0] - ox, dz = p[2] - oz;
      if (p[0] > LIM && dx > 1e-6) f = Math.min(f, (LIM - ox) / dx); else if (p[0] < -LIM && dx < -1e-6) f = Math.min(f, (-LIM - ox) / dx);
      if (p[2] > LIM && dz > 1e-6) f = Math.min(f, (LIM - oz) / dz); else if (p[2] < -LIM && dz < -1e-6) f = Math.min(f, (-LIM - oz) / dz);
    }
    if (f < 1) { f = Math.max(f, 0.08); for (const p of pts) { p[0] = ox + (p[0] - ox) * f; p[2] = oz + (p[2] - oz) * f; } }
  }

  // профили листа: [положение 0..1 вдоль оси, относительная ширина]
  const PROF = {
    grass: [[0, 1], [0.5, 0.75], [1, 0]],
    blade: [[0, 0.7], [0.55, 1], [1, 0]],
    lance: [[0, 0.3], [0.3, 1], [0.68, 0.72], [1, 0]],
    ovate: [[0, 0.2], [0.35, 1], [0.7, 0.82], [1, 0]],
    round: [[0, 0.35], [0.45, 1], [1, 0]],
    zig: [[0, 0.15], [0.27, 0.85], [0.5, 0.4], [0.75, 0.72], [1, 0]],
    lobe: [[0, 0.2], [0.3, 1], [0.5, 0.45], [0.72, 0.85], [1, 0]],
    ribbon: [[0, 1], [1, 0.85]],
    spike: [[0, 1], [1, 0]],
    sword: [[0, 0.55], [0.5, 1], [1, 0]],
    wavy: [[0, 0.3], [0.3, 1], [0.6, 0.95], [0.85, 0.6], [1, 0]],
  };

  /** Лист / стебель-лента. o: x,y,z основание; yaw направление; rise подъём оси от горизонтали (pi/2 = вертикаль); curve изгиб (<0 — вершина опускается); len, wid; prof; fold; c0, c1; roll. */
  function leaf(m, o) {
    const f = frame(o.yaw, -(o.rise || 0), o.roll || 0), prof = o.prof || PROF.lance, L = o.len, hw = o.wid / 2, fold = o.fold || 0, curve = o.curve || 0;
    const base = [o.x, o.y, o.z], st = [], pts = [], c0 = o.c0, c1 = o.c1 || o.c0;
    for (let k = 0; k < prof.length; k++) {
      const t = prof[k][0], u = t * L, w = prof[k][1] * hw, yl = curve * L * t * t;
      const s = { w, c: mix(c0, c1, t) };
      s.L = xf(f, base, -w, yl, u); s.R = xf(f, base, w, yl, u); pts.push(s.L, s.R);
      if (fold) { s.S = xf(f, base, 0, yl + fold * w, u); pts.push(s.S); s.cs = mul(s.c, 1.1); } else s.S = s.L;
      st.push(s);
    }
    fit(pts, o.x, o.z);
    for (let k = 0; k < st.length - 1; k++) {
      const a = st[k], b = st[k + 1], e = mul(a.c, 0.94), e2 = mul(b.c, 0.94);
      if (a.w === 0 && b.w === 0) continue;
      if (b.w === 0) {
        if (fold) { m.tri(a.S, a.R, b.L, a.cs, e, b.cs); m.tri(a.S, b.L, a.L, a.cs, b.cs, e); } else m.tri(a.L, a.R, b.L, e, e, e2);
      } else if (a.w === 0) {
        if (fold) { m.tri(a.L, b.R, b.S, a.cs, e2, b.cs); m.tri(a.L, b.S, b.L, a.cs, b.cs, e2); } else m.tri(a.L, b.R, b.L, e, e2, e2);
      } else if (fold) {
        m.tri(a.S, a.R, b.R, a.cs, e, e2); m.tri(a.S, b.R, b.S, a.cs, e2, b.cs);
        m.tri(a.S, b.S, b.L, a.cs, b.cs, e2); m.tri(a.S, b.L, a.L, a.cs, e2, e);
      } else m.quad(a.L, a.R, b.R, b.L, e, e, e2, e2);
    }
  }

  /** Призматический стебель по ломаной pts, радиус r0 -> r1. */
  function stem(m, pts, r0, r1, c0, c1, sides, cap) {
    sides = sides || 3; const rings = [], n = pts.length;
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
      const h = Math.abs(dy) > 0.85 ? [1, 0, 0] : [0, 1, 0];
      let e1x = h[1] * dz - h[2] * dy, e1y = h[2] * dx - h[0] * dz, e1z = h[0] * dy - h[1] * dx; const l1 = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z) || 1; e1x /= l1; e1y /= l1; e1z /= l1;
      const e2x = dy * e1z - dz * e1y, e2y = dz * e1x - dx * e1z, e2z = dx * e1y - dy * e1x;
      const r = r0 + (r1 - r0) * (k / (n - 1)), ring = [];
      for (let j = 0; j < sides; j++) { const ph = TAU * j / sides + 0.5, cs = Math.cos(ph) * r, sn = Math.sin(ph) * r; ring.push([pts[k][0] + e1x * cs + e2x * sn, pts[k][1] + e1y * cs + e2y * sn, pts[k][2] + e1z * cs + e2z * sn]); }
      rings.push({ ring, c: mix(c0, c1, k / (n - 1)) });
    }
    for (let k = 0; k < n - 1; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let j = 0; j < sides; j++) { const j2 = (j + 1) % sides, sh = j & 1 ? 0.9 : 1; m.quad(A.ring[j], A.ring[j2], B.ring[j2], B.ring[j], mul(A.c, sh), mul(A.c, sh), mul(B.c, sh), mul(B.c, sh)); }
    }
    if (cap) { const R = rings[n - 1]; for (let j = 1; j < sides - 1; j++) m.tri(R.ring[0], R.ring[j], R.ring[j + 1], mul(R.c, 1.1)); }
  }

  /** Эллипсоид (плод, колос, бутон) с плавными нормалями. o: x,y,z центр; rx,ry,rz; yaw,pitch,roll; seg, rings; prof(v) v=0 верх; colf(v,j,i). */
  function ell(m, o) {
    const seg = o.seg || 6, rg = o.rings || 3, f = frame(o.yaw, o.pitch, o.roll), rx = o.rx, ry = o.ry, rz = o.rz == null ? rx : o.rz;
    const ribs = o.ribs || 0, wob = o.wob || 0, org = [o.x, o.y, o.z], V = [], Nn = [];
    const colf = o.colf || ((v) => mix(o.c1, o.c0, v));
    for (let i = 0; i <= rg; i++) {
      const v = i / rg, th = PI * (o.vmap ? o.vmap(v) : v), cy = Math.cos(th), sr = Math.sin(th), ps = o.prof ? o.prof(v) : 1, pole = i === 0 || i === rg, n = pole ? 1 : seg, ring = [], nr = [];
      for (let j = 0; j < n; j++) {
        const ph = TAU * j / seg + (o.phase || 0), k = ps * (ribs && (j & 1) ? 1 - ribs : 1) * (wob ? 1 + (rnd() - 0.5) * wob : 1);
        const lx = rx * sr * Math.cos(ph) * k, ly = ry * cy * (pole ? 1 : 1), lz = rz * sr * Math.sin(ph) * k;
        ring.push(xf(f, org, lx, ly, lz)); nr.push(rotv(f, lx / (rx * rx + 1e-9), ly / (ry * ry), lz / (rz * rz + 1e-9)));
      }
      V.push(ring); Nn.push(nr);
    }
    for (let i = 0; i < rg; i++) {
      const A = V[i], B = V[i + 1], NA = Nn[i], NB = Nn[i + 1], va = i / rg, vb = (i + 1) / rg;
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg, ca = colf(va, j, i), cb = colf(vb, j, i);
        if (i === 0) m.tri(A[0], B[j2], B[j], ca, cb, cb, NA[0], NB[j2], NB[j]);
        else if (i === rg - 1) m.tri(A[j], A[j2], B[0], ca, ca, cb, NA[j], NA[j2], NB[0]);
        else { m.tri(A[j], A[j2], B[j2], ca, ca, cb, NA[j], NA[j2], NB[j2]); m.tri(A[j], B[j2], B[j], ca, cb, cb, NA[j], NB[j2], NB[j]); }
      }
    }
  }

  /** Плоский диск-веер (цветок, шляпка, срез моркови). normal = локальная Y; pitch наклоняет нормаль к +Z. */
  function disc(m, o) {
    const f = frame(o.yaw, o.pitch, o.roll), n = o.n || 8, org = [o.x, o.y, o.z], ctr = xf(f, org, 0, o.dome || 0, 0), ring = [];
    for (let j = 0; j < n; j++) { const ph = TAU * j / n + (o.phase || 0), rv = o.r * (1 + (o.wob ? (rnd() - 0.5) * o.wob : 0)); ring.push(xf(f, org, Math.cos(ph) * rv, 0, Math.sin(ph) * rv)); }
    const cc = o.c0, cr = o.c1 || o.c0;
    for (let j = 0; j < n; j++) m.tri(ctr, ring[(j + 1) % n], ring[j], cc, mul(cr, j & 1 ? 0.94 : 1.04), mul(cr, j & 1 ? 1.04 : 0.94));
  }

  /** Плоская лента между двумя точками (проволока, шпагат). */
  function bar(m, a, b, w, ca, cb) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
    const h = Math.abs(dy) > 0.85 ? [0, 0, 1] : [0, 1, 0];
    let sx = h[1] * dz - h[2] * dy, sy = h[2] * dx - h[0] * dz, sz = h[0] * dy - h[1] * dx; const ls = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1; sx = sx / ls * w / 2; sy = sy / ls * w / 2; sz = sz / ls * w / 2;
    m.quad([a[0] - sx, a[1] - sy, a[2] - sz], [a[0] + sx, a[1] + sy, a[2] + sz], [b[0] + sx, b[1] + sy, b[2] + sz], [b[0] - sx, b[1] - sy, b[2] - sz], ca, ca, cb || ca, cb || ca);
  }

  // ------------------------------------------------------------------ грядки и раскладка
  function rowXs(n) { const a = []; for (let i = 0; i < n; i++) a.push((i + 0.5) / n - 0.5); return a; }
  /** Точки посадки: nx рядов вдоль Z, по nz растений в ряду. */
  function grid(nx, nz, o) {
    o = o || {}; const out = [], xs = rowXs(nx), jx = o.jx == null ? 0.015 : o.jx, jz = o.jz == null ? 0.04 : o.jz, mg = o.margin == null ? 0.05 : o.margin;
    for (let r = 0; r < nx; r++) for (let j = 0; j < nz; j++) {
      let z = (j + 0.5) / nz - 0.5; if (o.stag) z += ((r & 1) ? 0.25 : -0.25) / nz;
      const x = Math.max(-0.5 + mg, Math.min(0.5 - mg, xs[r] + (rnd() - 0.5) * jx)); z = Math.max(-0.5 + mg, Math.min(0.5 - mg, z + (rnd() - 0.5) * jz));
      out.push({ r, j, x, z, sc: 0.88 + rnd() * 0.24 });
    }
    return out;
  }
  /** Земляной валик ряда вдоль Z (концы одинаковой высоты — ряды соседних тайлов смыкаются). */
  function ridge(m, x, hw, h, col) {
    const n = 2, pts = []; col = col || SOIL;
    for (let k = 0; k <= n; k++) {
      const z = -0.5 + k / n, end = k === 0 || k === n, hk = end ? h : h * (0.82 + 0.3 * rnd()), w = end ? hw : hw * (0.92 + 0.16 * rnd()), cx = end ? x : x + (rnd() - 0.5) * 0.012;
      pts.push({ l: [cx - w, 0, z], p: [cx, hk, z], r: [cx + w, 0, z] });
    }
    const cb = mul(col, 0.74 + rnd() * 0.06), cp = mul(col, 0.98 + rnd() * 0.1);
    for (let k = 0; k < n; k++) { const a = pts[k], b = pts[k + 1]; m.quad(a.l, a.p, b.p, b.l, cb, cp, cp, cb); m.quad(a.p, a.r, b.r, b.p, cp, cb, cb, cp); }
    m.tri(pts[0].l, pts[0].p, pts[0].r, cb, cp, cb); m.tri(pts[n].l, pts[n].p, pts[n].r, cb, cp, cb);
  }
  function ridges(m, xs, hw, h, col) { for (const x of xs) ridge(m, x, hw, h, col); }
  /** Сомкнутая «крона» ряда (пшеница): мягкий гранёный валик от земли, цвет от cBase (низ) к cTop (верх). */
  function band(m, x, hw, h, cBase, cTop) {
    const ns = 4, XS = [[-1, 0], [-0.88, 0.45], [-0.55, 0.86], [0, 1], [0.55, 0.86], [0.88, 0.45], [1, 0]], np = XS.length, st = [];
    for (let k = 0; k <= ns; k++) {
      const z = -0.5 + k / ns, end = k === 0 || k === ns, w = hw * (end ? 1 : rr(0.95, 1.05));
      st.push(XS.map((p, i) => {
        const edge = i === 0 || i === np - 1, fix = end || edge, hk = h * (fix ? 1 : rr(0.9, 1.1)), tint = 1 + (rnd() - 0.5) * 0.2;
        return { p: [x + p[0] * w + (fix ? 0 : (rnd() - 0.5) * 0.014), p[1] * hk, z], c: mix(mul(cBase, tint), mul(cTop, tint), Math.pow(p[1], 0.8)) };
      }));
    }
    for (let k = 0; k < ns; k++) for (let i = 0; i < np - 1; i++) { const A = st[k][i], B = st[k][i + 1], Cc = st[k + 1][i + 1], D = st[k + 1][i]; m.quad(A.p, B.p, Cc.p, D.p, A.c, B.c, Cc.c, D.c); }
    for (const k of [0, ns]) { const q = st[k]; for (let i = 1; i < np - 1; i++) m.tri(q[0].p, q[i].p, q[i + 1].p, q[0].c, q[i].c, q[i + 1].c); }
  }

  // ---- текстурированная «крона» (волнистая поверхность с рядами), используется для сплошных посевов
  const tintMats = {};
  function texTint(name, tint, fb) {
    const k = name + '|' + tint; if (tintMats[k]) return tintMats[k];
    const base = C.texMat(name, 1, 1, fb); if (!base.map) return (tintMats[k] = base);
    const mt = base.clone(); if (Array.isArray(tint)) mt.color.setRGB(tint[0], tint[1], tint[2]); else mt.color.setHex(tint); mt.side = T.DoubleSide; return (tintMats[k] = mt);
  }
  /** Поверхность посева высотой h с волнами рядов amp (nrows рядов вдоль Z) и боковыми стенками; края на границах тайла не зависят от seed. Возвращает функцию высоты. */
  function canopy(m, name, tint, fb, h, amp, nrows, noise, uvs) {
    const NX = 20, NZ = 6, P = [], N = [], U = [], ph1 = rnd() * TAU, ph2 = rnd() * TAU, ou = rnd(), ov = rnd(); uvs = uvs || 0.5;
    const rowPh = nrows * TAU, H = (x, z) => { const win = Math.sin(PI * (x + 0.5)) * Math.sin(PI * (z + 0.5)); return Math.max(0.01, h + amp * Math.cos(rowPh * x) + win * noise * h * (Math.sin(x * 9 + z * 7 + ph1) + Math.sin(x * 5 - z * 11 + ph2)) * 0.5); };
    const V = [], E = 0.004;
    for (let i = 0; i <= NX; i++) { V.push([]); for (let j = 0; j <= NZ; j++) { const x = -0.5 + i / NX, z = -0.5 + j / NZ, win = Math.sin(PI * (x + 0.5)) * Math.sin(PI * (z + 0.5)); const y = H(x, z) + (rnd() - 0.5) * noise * 0.5 * h * win; const nx = -(H(x + E, z) - H(x - E, z)) / (2 * E), nz = -(H(x, z + E) - H(x, z - E)) / (2 * E), l = Math.sqrt(nx * nx + 1 + nz * nz); V[i].push({ p: [x, y, z], n: [nx / l, 1 / l, nz / l], uv: [(x + 0.5) * uvs + ou, (z + 0.5) * uvs + ov] }); } }
    const push = (a, b, c) => { for (const q of [a, b, c]) { P.push(q.p[0], q.p[1], q.p[2]); N.push(q.n[0], q.n[1], q.n[2]); U.push(q.uv[0], q.uv[1]); } };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const a = V[i][j], b = V[i + 1][j], c = V[i + 1][j + 1], d = V[i][j + 1]; push(a, d, c); push(a, c, b); }
    const wall = (p0, p1, n, ua) => { // p0,p1 — верхние точки, вниз до земли
      const g = (p) => ({ p: [p.p[0], 0, p.p[2]], n, uv: [p.uv[ua], ov] }), t0 = { p: p0.p, n, uv: [p0.uv[ua], p0.p[1] * uvs + ov] }, t1 = { p: p1.p, n, uv: [p1.uv[ua], p1.p[1] * uvs + ov] }; push(t0, t1, g(p1)); push(t0, g(p1), g(p0)); };
    for (let j = 0; j < NZ; j++) { wall(V[0][j + 1], V[0][j], [-1, 0, 0], 1); wall(V[NX][j], V[NX][j + 1], [1, 0, 0], 1); }
    for (let i = 0; i < NX; i++) { wall(V[i][0], V[i + 1][0], [0, 0, -1], 0); wall(V[i + 1][NZ], V[i][NZ], [0, 0, 1], 0); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
    const mesh = new T.Mesh(g, texTint(name, tint, fb)); mesh.castShadow = true; mesh.receiveShadow = true; (m.extra = m.extra || []).push(mesh);
    return H;
  }

  // небольшие повторяющиеся элементы
  function tuft(m, x, y, z, n, len, c0, c1, wid) {
    for (let i = 0; i < n; i++) leaf(m, { x: x + (rnd() - 0.5) * 0.012, y, z: z + (rnd() - 0.5) * 0.012, yaw: rnd() * TAU, rise: rr(0.95, 1.4), curve: -0.35, len: len * 1.35 * rr(0.7, 1.15), wid: (wid || 0.011) * 1.9, prof: PROF.grass, c0: jit(c0, 0.1), c1: jit(c1, 0.1), roll: rnd() * PI });
  }
  function cotyl(m, x, y, z, size, c0, c1, n) {
    const yaw = rnd() * TAU; n = n || 2; size *= 1.9;
    for (let i = 0; i < n; i++) leaf(m, { x, y, z, yaw: yaw + i * TAU / n + rr(-0.2, 0.2), rise: rr(0.35, 0.8), curve: -0.35, len: size, wid: size * 0.72, prof: PROF.round, c0: jit(c0, 0.08), c1: jit(c1, 0.08) });
  }
  function mound(m, x, z, r, h, col) { disc(m, { x, y: 0, z, r, n: 6, dome: h, c0: mul(col, 1.08), c1: mul(col, 0.8), wob: 0.2, phase: rnd() * 3 }); }
  const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const clampT = (v, l) => Math.max(-l, Math.min(l, v));

  // ------------------------------------------------------------------ палитра
  const G = { dk: hx(0x3f6b2e), md: hx(0x56853a), lt: hx(0x6a9a3a), sprout: hx(0x7fae4c), sprout2: hx(0xa5c764) };
  const gr = (t) => mix(G.dk, G.lt, t);
  const WOOD = hx(0x8f7048), WOOD_L = hx(0xb89a6c), WIRE = hx(0x56534c);
  PROF.corn = [[0, 0.25], [0.3, 1], [0.65, 0.8], [1, 0]];
  PROF.diamond = [[0, 0], [0.5, 1], [1, 0]];
  PROF.feather = [[0, 0.3], [0.35, 1], [0.65, 0.5], [1, 0]];

  // ================================================================== КУЛЬТУРЫ
  const CROPS = {};

  // ---- пшеница: сомкнутый посев (текстура + волны рядов) с колосьями над кроной
  CROPS.wheat = (m, st) => {
    const xs = rowXs(5), wind = 0.9;
    if (st === 0) { ridges(m, xs, 0.06, 0.03); for (const s of grid(5, 6, { jz: 0.05, jx: 0.02 })) tuft(m, s.x, 0.02, s.z, 3, 0.06, hx(0x6f9f42), G.sprout2); return; }
    if (st === 1) {
      const H = canopy(m, 'grass', 0xb2de78, 0x5f9a3c, 0.07, 0.022, 5, 0.25, 0.7);
      for (const s of grid(5, 5, { jz: 0.05, jx: 0.02 })) tuft(m, s.x, H(s.x, s.z) - 0.01, s.z, 3, 0.1 * s.sc, hx(0x4c7f33), hx(0x80b24c), 0.016);
      return;
    }
    const ripe = st === 3, hB = ripe ? 0.34 : 0.28;
    const H = canopy(m, 'wheat_field', ripe ? [1.1, 1.2, 1.22] : [0.9, 1.4, 0.72], ripe ? 0xc89a3c : 0x8aa23e, hB, 0.032, 5, 0.12, 0.6);
    for (const s of grid(5, 10, { jz: 0.05, jx: 0.05 })) {
      const tilt = rr(0.03, ripe ? 0.32 : 0.2), hd = wind + rr(-1.5, 1.5), bx = clampT(s.x, 0.465), bz = clampT(s.z, 0.47), y0 = H(bx, bz) - 0.05;
      const topY = H(bx, bz) + (ripe ? rr(0.05, 0.17) : rr(0.04, 0.1)), L = (topY - y0) / Math.cos(tilt);
      leaf(m, { x: bx, y: y0, z: bz, yaw: hd, rise: PI / 2 - tilt, len: L, wid: 0.011, prof: PROF.ribbon, roll: rnd() * PI, c0: jit(ripe ? hx(0xb8933f) : hx(0x6f9a38), 0.08), c1: jit(ripe ? hx(0xe6cb78) : hx(0xa3b24a), 0.08) });
      const top = [bx + Math.sin(tilt) * Math.sin(hd) * L, y0 + Math.cos(tilt) * L, bz + Math.sin(tilt) * Math.cos(hd) * L];
      const t2 = tilt + (ripe ? 0.45 : 0.1), eh = ripe ? 0.07 : 0.055;
      const dx = Math.sin(t2) * Math.sin(hd), dy = Math.cos(t2), dz = Math.sin(t2) * Math.cos(hd);
      ell(m, { x: clampT(top[0] + dx * eh, LIM - 0.02), y: top[1] + dy * eh, z: clampT(top[2] + dz * eh, LIM - 0.02), rx: ripe ? 0.016 : 0.013, ry: eh, yaw: hd, pitch: t2, seg: 3, rings: 2, colf: (v) => mix(ripe ? hx(0xf6e08e) : hx(0xbac45e), ripe ? hx(0xd8b050) : hx(0x9aa844), v) });
    }
  };

  // ---- морковь: перистая ботва, оранжевые плечики
  CROPS.carrot = (m, st) => {
    const xs = rowXs(5); ridges(m, xs, 0.08, 0.04);
    for (const s of grid(5, 5, { jz: 0.05 })) {
      const y0 = 0.035;
      if (st === 0) { tuft(m, s.x, y0 - 0.005, s.z, 3, 0.045, hx(0x7fae4c), hx(0xb4d072), 0.008); continue; }
      const nf = st === 1 ? 3 : 5, ln = (st === 1 ? 0.11 : 0.24) * s.sc;
      const cA = st === 3 ? hx(0x3d6a2c) : hx(0x477a31), cB = st === 3 ? hx(0x70a040) : hx(0x78ad45);
      for (let i = 0; i < nf; i++) leaf(m, { x: s.x, y: y0, z: s.z, yaw: i * TAU / nf + rnd() * 1.2, rise: rr(0.95, 1.3), curve: -0.55, len: ln * rr(0.8, 1.1), wid: st === 1 ? 0.035 : 0.06, prof: st === 1 ? PROF.round : PROF.feather, c0: jit(cA, 0.1), c1: jit(cB, 0.1), roll: rr(-0.4, 0.4) });
      if (st === 3) disc(m, { x: s.x, y: y0 - 0.004, z: s.z, r: 0.042 * s.sc, n: 6, dome: 0.02, c0: hx(0xd8741f), c1: hx(0xeb9340), phase: rnd() * 3, wob: 0.15 });
    }
  };

  // ---- картофель: окученные ряды, густая ботва, цветы, клубни
  CROPS.potato = (m, st) => {
    const xs = rowXs(4); ridges(m, xs, 0.1, 0.05);
    for (const s of grid(4, 3, { jz: 0.04, stag: true })) {
      const y0 = 0.045;
      if (st === 0) { mound(m, s.x, s.z, 0.04, 0.012, SOIL); cotyl(m, s.x, y0, s.z, 0.04, hx(0x7fae4c), hx(0xa2c562)); continue; }
      const ns = st === 1 ? 4 : 7, ln = (st === 1 ? 0.1 : 0.23) * s.sc;
      const cA = st === 3 ? hx(0x547a31) : hx(0x3f6b2e), cB = st === 3 ? hx(0x8a9c40) : hx(0x6e9c40);
      for (let i = 0; i < ns; i++) leaf(m, { x: s.x, y: y0 + 0.02, z: s.z, yaw: i * TAU / ns + rnd() * 0.9, rise: rr(0.45, 1.0), curve: -0.35, len: ln * rr(0.85, 1.1), wid: ln * 0.55, prof: st === 1 ? PROF.round : PROF.zig, c0: jit(cA, 0.1), c1: jit(cB, 0.1), roll: rr(-0.3, 0.3) });
      if (st >= 2) for (let i = 0; i < 2; i++) { const a = rnd() * TAU, d = rr(0.02, 0.08); disc(m, { x: s.x + Math.cos(a) * d, y: y0 + 0.13 * s.sc + rnd() * 0.04, z: s.z + Math.sin(a) * d, r: 0.026, n: 5, pitch: rr(0.2, 0.7), yaw: a, c0: hx(0xe3cb55), c1: pick([hx(0xeee8f2), hx(0xcdb9de), hx(0xe6dcef)]), phase: rnd() * 3 }); }
      if (st === 3 && (s.j + s.r) % 2 === 0) { const a = s.r * 1.7 + rnd(); ell(m, { x: s.x + Math.cos(a) * 0.06, y: 0.05, z: s.z + Math.sin(a) * 0.06, rx: 0.04, ry: 0.028, rz: 0.032, yaw: a, seg: 5, rings: 2, colf: (v) => mix(hx(0xcfb070), hx(0xa98a52), v), wob: 0.2 }); }
    }
  };

  // ---- помидор: подвязанные кусты на кольях
  CROPS.tomato = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.04);
    for (const s of grid(3, 3, { jz: 0.04, stag: true, margin: 0.08 })) {
      const y0 = 0.035;
      if (st === 0) { mound(m, s.x, s.z, 0.035, 0.01, SOIL); cotyl(m, s.x, y0, s.z, 0.04, hx(0x7fae4c), hx(0xa2c562)); continue; }
      const H = [0, 0.26, 0.5, 0.66][st] * s.sc, lean = rr(0.04, 0.12), hd = rnd() * TAU, sx = s.x + 0.04, sh = [0, 0.5, 0.8, 0.95][st];
      const top = [s.x + Math.sin(lean) * Math.sin(hd) * H, y0 + H, s.z + Math.sin(lean) * Math.cos(hd) * H];
      stem(m, [[sx, 0, s.z], [sx, sh, s.z]], 0.011, 0.008, WOOD, WOOD_L, 3, true);
      stem(m, [[s.x, y0, s.z], top], 0.014, 0.007, hx(0x5d7a35), hx(0x7a9a45), 3);
      const nl = st === 1 ? 3 : 7;
      for (let i = 0; i < nl; i++) {
        const t = 0.2 + 0.8 * (i + rnd() * 0.6) / nl, p = lerpPt([s.x, y0, s.z], top, t);
        leaf(m, { x: p[0], y: p[1], z: p[2], yaw: i * 2.4 + rnd() * 0.6, rise: rr(0.15, 0.7), curve: -0.4, len: (st === 1 ? 0.13 : 0.23) * s.sc * (1.0 - 0.25 * t), wid: (st === 1 ? 0.07 : 0.13) * s.sc, prof: PROF.feather, c0: jit(gr(0.2 + 0.2 * rnd()), 0.1), c1: jit(gr(0.55 + 0.3 * rnd()), 0.1), roll: rr(-0.3, 0.3) });
      }
      if (st === 2) disc(m, { x: top[0] + rr(-0.05, 0.05), y: y0 + H * rr(0.5, 0.9), z: top[2] + rr(-0.05, 0.05), r: 0.02, n: 5, pitch: 0.6, yaw: rnd() * TAU, c0: hx(0xd9b83a), c1: hx(0xe8cf55) });
      if (st >= 2) {
        const nfr = st === 2 ? 2 : 3, ripe = st === 3;
        for (let i = 0; i < nfr; i++) {
          const t = 0.3 + 0.4 * rnd(), a = rnd() * TAU, d = rr(0.05, 0.09), ry = ripe ? 0.046 : 0.028, p = lerpPt([s.x, y0, s.z], top, t);
          const red = ripe ? pick([hx(0xe0452f), hx(0xd73d2c), hx(0xe85a32), hx(0xe0452f)]) : hx(0x84a243);
          ell(m, { x: p[0] + Math.cos(a) * d, y: p[1] - 0.03, z: p[2] + Math.sin(a) * d, rx: ry * 1.15, ry: ry * 0.95, rz: ry * 1.15, seg: 6, rings: 2, wob: 0.08, phase: rnd() * 3, colf: (v) => v < 0.2 ? hx(0x4f7a2e) : mix(mul(red, 1.12), mul(red, 0.84), v) });
        }
      }
    }
  };

  // ---- кукуруза: высокие стебли, длинные листья, початки, метёлки
  CROPS.corn = (m, st) => {
    let extraCobs = 0; const xs = rowXs(4); ridges(m, xs, 0.085, 0.035);
    for (const s of grid(4, 3, { jz: 0.05, jx: 0.02, stag: true, margin: 0.07 })) {
      const y0 = 0.03;
      if (st === 0) { mound(m, s.x, s.z, 0.04, 0.01, SOIL); tuft(m, s.x, y0, s.z, 3, 0.09, hx(0x6f9f42), hx(0xa5c764), 0.016); continue; }
      const H = [0, 0.3, 1.15, rr(1.7, 1.9)][st] * (0.96 + 0.04 * s.sc), lean = rr(0.02, 0.07), hd = rnd() * TAU, ripe = st === 3;
      const base = [s.x, y0, s.z], top = [s.x + Math.sin(lean) * Math.sin(hd) * H, y0 + H, s.z + Math.sin(lean) * Math.cos(hd) * H];
      stem(m, [base, top], 0.026 * Math.min(1, 0.4 + H * 0.5), 0.013, hx(ripe ? 0x7f8c3c : 0x62903a), hx(ripe ? 0x9aa24d : 0x7aa645), 3);
      const nl = st === 1 ? 4 : 7;
      for (let i = 0; i < nl; i++) {
        const t = st === 1 ? 0.2 + i * 0.14 : 0.14 + 0.72 * i / (nl - 1), p = lerpPt(base, top, t);
        const lenL = st === 1 ? 0.2 * s.sc : H * (0.2 + 0.1 * Math.sin(t * PI)) * s.sc * (0.92 + 0.16 * rnd()), low = 1 - t;
        leaf(m, { x: p[0], y: p[1], z: p[2], yaw: hd + i * PI + rr(-0.5, 0.5) + 0.3, rise: st === 1 ? rr(0.7, 1.0) : rr(0.6, 1.0), curve: -0.8, len: lenL, wid: st === 1 ? 0.04 : 0.1, prof: st === 1 ? PROF.blade : PROF.corn, c0: jit(ripe ? mix(hx(0x5d8636), hx(0x9a9a45), low * 0.8) : hx(0x4d7e33), 0.08), c1: jit(ripe ? mix(hx(0x7c9c42), hx(0xb0a74e), low * 0.7) : hx(0x75a540), 0.08), roll: rr(-0.25, 0.25) });
      }
      if (st >= 2) for (let i = 0; i < 4; i++) leaf(m, { x: top[0], y: top[1] - 0.02, z: top[2], yaw: i * TAU / 4 + rnd(), rise: rr(1.0, 1.35), curve: -0.35, len: ripe ? 0.22 : 0.12, wid: 0.018, prof: PROF.ribbon, c0: ripe ? hx(0xb09a52) : hx(0x8fa850), c1: ripe ? hx(0xd7c379) : hx(0xa8bd62), roll: rnd() * PI });
      if (ripe) {
        const nc = rnd() < 0.2 && extraCobs < 3 ? (extraCobs++, 2) : 1;
        for (let i = 0; i < nc; i++) {
          const t = 0.5 - 0.1 * i, p = lerpPt(base, top, t), a = hd + (i ? PI : 0) + rr(-0.5, 0.5);
          ell(m, { x: p[0] + Math.sin(a) * 0.06, y: p[1] + 0.06, z: p[2] + Math.cos(a) * 0.06, rx: 0.052, ry: 0.115, rz: 0.052, yaw: a, pitch: 0.5, seg: 4, rings: 3, phase: 0.78, colf: (v) => v < 0.1 ? hx(0x8a6a3a) : v < 0.42 ? hx(0xe3bc3c) : mix(hx(0xa9ac5c), hx(0x8a9c4a), v) });
        }
      }
    }
  };

  // ---- огурец: шпалеры с лианами
  CROPS.cucumber = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035);
    const TH = [0.18, 0.5, 0.88, 0.98][st];
    for (const x of xs) {
      if (st >= 1) {
        for (const pz of [-0.42, 0.42]) stem(m, [[x, 0, pz], [x, TH + 0.1, pz]], 0.013, 0.01, WOOD, WOOD_L, 3, true);
        bar(m, [x, TH + 0.09, -0.5], [x, TH + 0.09, 0.5], 0.008, WIRE); bar(m, [x, TH * 0.45, -0.5], [x, TH * 0.45, 0.5], 0.007, WIRE);
        for (const pz of [-0.14, 0.14]) bar(m, [x, 0.03, pz], [x, TH + 0.09, pz], 0.006, hx(0xc9c2a2));
      }
      for (const z of [-0.28, 0, 0.28]) {
        const zz = z + rr(-0.04, 0.04);
        if (st === 0) { mound(m, x, zz, 0.035, 0.01, SOIL); cotyl(m, x, 0.035, zz, 0.04, hx(0x7fae4c), hx(0xa2c562)); continue; }
        const Hv = TH * rr(0.85, 1.0), sway = rr(-0.05, 0.05);
        bar(m, [x, 0.035, zz], [x + 0.012, 0.035 + Hv * 0.5, zz + sway * 0.5], 0.012, hx(0x4d7a35), hx(0x5f8a3d)); bar(m, [x + 0.012, 0.035 + Hv * 0.5, zz + sway * 0.5], [x - 0.006, 0.035 + Hv, zz + sway], 0.01, hx(0x5f8a3d), hx(0x6e9a45));
        const nl = st === 1 ? 3 : 5;
        for (let i = 0; i < nl; i++) {
          const t0 = st === 1 ? 0.15 : st === 3 ? 0.5 : 0.42, t = t0 + (st === 1 ? 0.82 : 1 - t0) * (i + rnd() * 0.5) / nl, side = (i & 1) ? 1 : -1;
          leaf(m, { x: x + side * 0.012, y: 0.035 + Hv * t, z: zz + sway * t, yaw: side * PI / 2 + rr(-0.7, 0.7), rise: rr(-0.1, 0.5), curve: -0.35, len: (st === 1 ? 0.1 : 0.21) * (0.9 + 0.2 * rnd()), wid: (st === 1 ? 0.1 : 0.21) * 0.9, prof: PROF.lobe, c0: jit(gr(0.15 + 0.25 * rnd()), 0.1), c1: jit(gr(0.5 + 0.35 * rnd()), 0.1), roll: rr(-0.2, 0.2) });
        }
        if (st === 2) disc(m, { x: x + rr(-0.06, 0.06), y: 0.035 + Hv * rr(0.4, 0.85), z: zz + rr(-0.03, 0.03), r: 0.018, n: 5, pitch: 0.9, yaw: rr(-0.6, 0.6), c0: hx(0xc7a22c), c1: hx(0xe3c64a) });
        if (st >= 2) {
          const nc = st === 3 ? 2 : 1;
          for (let i = 0; i < nc; i++) {
            const t = 0.5 + 0.1 * rnd() + i * 0.07, side = i ? 1 : -1, ln = st === 3 ? 0.145 : 0.05, rad = st === 3 ? 0.043 : 0.016;
            ell(m, { x: x + side * 0.055 + rr(-0.012, 0.012), y: 0.035 + Hv * t - ln, z: zz + sway * t + rr(-0.03, 0.03), rx: rad, ry: ln, rz: rad, yaw: rnd() * 3, pitch: rr(-0.1, 0.1), seg: 5, rings: st === 3 ? 3 : 2, wob: 0.08, prof: (v) => 0.78 + 0.22 * Math.sin(v * PI), colf: (v) => st === 3 ? (v > 0.84 ? hx(0xd2d88c) : v < 0.1 ? hx(0xb2c46c) : mix(hx(0x74aa44), hx(0x4f8a34), v)) : mix(hx(0x6f9a45), hx(0x5a8a3a), v) });
          }
        }
      }
    }
  };

  // ---- клубника: невысокие грядки, мульча, красные ягоды
  CROPS.strawberry = (m, st) => {
    const xs = rowXs(4), straw = hx(0xa88f5c);
    ridges(m, xs, 0.1, 0.045, st === 0 ? SOIL : mix(SOIL, straw, st === 1 ? 0.3 : 0.55));
    for (const s of grid(4, 4, { jz: 0.04, jx: 0.012, stag: true })) {
      const y0 = 0.045;
      if (st === 0) { cotyl(m, s.x, y0, s.z, 0.04, hx(0x6f9f42), hx(0x98bf5a), 3); continue; }
      const nlf = st === 1 ? 3 : 4, ls = (st === 1 ? 0.07 : 0.105) * s.sc;
      for (let i = 0; i < nlf; i++) {
        const a = i * TAU / nlf + rnd() * 0.8, bx = s.x + Math.sin(a) * 0.015, bz = s.z + Math.cos(a) * 0.015;
        for (let k = -1; k <= 1; k++) leaf(m, { x: bx + Math.sin(a) * 0.02, y: y0 + 0.03, z: bz + Math.cos(a) * 0.02, yaw: a + k * 0.8, rise: rr(0.25, 0.6), curve: -0.3, len: ls, wid: ls * 0.85, prof: PROF.diamond, c0: jit(hx(0x3f7233), 0.1), c1: jit(hx(0x6a9c3d), 0.1) });
      }
      if (st === 2) disc(m, { x: s.x + rr(-0.03, 0.03), y: y0 + 0.07, z: s.z + rr(-0.03, 0.03), r: 0.018, n: 5, pitch: 0.5, yaw: rnd() * TAU, c0: hx(0xe3c64a), c1: hx(0xf1ede0) });
      if (st === 3) for (let i = 0; i < 2; i++) {
        const a = s.j * 2 + i * 3.1 + rnd() * 0.6, d = rr(0.055, 0.09);
        ell(m, { x: s.x + Math.sin(a) * d, y: y0 + 0.032, z: s.z + Math.cos(a) * d, rx: 0.032, ry: 0.036, rz: 0.032, pitch: PI, seg: 5, rings: 2, prof: (v) => v < 0.5 ? 1 : 0.9, colf: (v) => v < 0.12 ? hx(0x4d8030) : mix(hx(0xd23a38), hx(0xa82a2c), v) });
      }
    }
  };

  // ---- капуста: розетки листьев, светлый кочан
  CROPS.cabbage = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035);
    for (const s of grid(3, 3, { jz: 0.05, jx: 0.02, stag: true, margin: 0.1 })) {
      const y0 = 0.03;
      if (st === 0) { mound(m, s.x, s.z, 0.04, 0.01, SOIL); cotyl(m, s.x, y0, s.z, 0.045, hx(0x7fae4c), hx(0xa2c562)); continue; }
      const R = [0, 0.1, 0.2, 0.24][st] * s.sc, nl = st === 1 ? 4 : 6, a0 = rnd() * TAU;
      for (let i = 0; i < nl; i++) {
        const a = a0 + i * TAU / nl + rr(-0.2, 0.2), lift = st === 3 ? rr(0.5, 0.85) : rr(0.2, 0.55);
        leaf(m, { x: s.x, y: y0 + 0.01, z: s.z, yaw: a, rise: lift * (i & 1 ? 0.8 : 1), curve: 0.25, len: R * 1.1, wid: R * 1.15, prof: PROF.wavy, c0: jit(hx(0x4f7d3c), 0.08), c1: jit(i & 1 ? hx(0x8cae6a) : hx(0x7aa05a), 0.08), fold: i === 0 ? 0.22 : 0, roll: rr(-0.1, 0.1) });
      }
      if (st >= 2) {
        const hr = st === 2 ? 0.055 : 0.105;
        ell(m, { x: s.x, y: y0 + hr * 0.75, z: s.z, rx: hr, ry: hr * 0.85, rz: hr, seg: 6, rings: 3, wob: 0.08, phase: rnd(), colf: (v) => st === 3 ? mix(hx(0xbdd48a), hx(0x93b468), v) : mix(hx(0x9cbf6e), hx(0x6f9a4a), v) });
        if (st === 3) for (let i = 0; i < 2; i++) leaf(m, { x: s.x, y: y0 + 0.02, z: s.z, yaw: a0 + i * 3.1 + 0.5, rise: rr(1.0, 1.25), curve: -0.5, len: hr * 1.9, wid: hr * 1.5, prof: PROF.round, c0: hx(0x6f9a52), c1: hx(0xa3c47c), fold: 0.18 });
      }
    }
  };

  // ---- общие вспомогательные для ползучих (тыква, арбуз)
  const HILLS = [[-0.33, -0.2], [-0.33, 0.22], [0, -0.38], [0, 0.02], [0, 0.4], [0.33, -0.2], [0.33, 0.22]];
  function sprawlHills() { return HILLS.map((h) => ({ x: h[0] + rr(-0.03, 0.03), z: h[1] + rr(-0.03, 0.03) })); }
  function vineRun(m, x, z, yaw, len, c0, c1) {
    let px = x, pz = z, a = yaw; const pts = [[px, 0.025, pz]];
    for (let k = 0; k < 3; k++) { a += rr(-0.55, 0.55); px = clampT(px + Math.sin(a) * len / 3, LIM); pz = clampT(pz + Math.cos(a) * len / 3, LIM); pts.push([px, 0.024 + 0.006 * k, pz]); }
    for (let k = 0; k < 3; k++) bar(m, pts[k], pts[k + 1], 0.014 - k * 0.003, c0, c1);
    return pts;
  }

  // ---- тыква: плети, крупные листья, рёбристые оранжевые тыквы
  CROPS.pumpkin = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035, SOIL);
    for (const h of sprawlHills()) {
      if (st === 0) { mound(m, h.x, h.z, 0.05, 0.016, SOIL); cotyl(m, h.x, 0.04, h.z, 0.05, hx(0x7fae4c), hx(0xa2c562)); continue; }
      const nl = st === 1 ? 3 : 5, ls = (st === 1 ? 0.1 : 0.21) * (0.9 + 0.2 * rnd()), cv = [hx(0x3f6e30), hx(0x6a9a3c)];
      if (st >= 2) for (let i = 0; i < 2; i++) { const run = vineRun(m, h.x, h.z, rnd() * TAU, rr(0.2, 0.3), hx(0x4d6e2e), hx(0x6e8a3c)); const e = run[run.length - 1]; leaf(m, { x: e[0], y: 0.05, z: e[2], yaw: rnd() * TAU, rise: rr(0.0, 0.25), curve: -0.2, len: ls * 0.8, wid: ls * 0.9, prof: PROF.ovate, c0: jit(cv[0], 0.1), c1: jit(cv[1], 0.1) }); }
      for (let i = 0; i < nl; i++) {
        const a = i * TAU / nl + rnd() * 0.8, d = 0.03;
        leaf(m, { x: h.x + Math.sin(a) * d, y: 0.06 + rnd() * 0.05, z: h.z + Math.cos(a) * d, yaw: a, rise: rr(0.12, 0.5), curve: -0.3, len: ls, wid: ls * 1.05, prof: PROF.ovate, c0: jit(cv[0], 0.1), c1: jit(cv[1], 0.1), fold: i === 0 ? 0.12 : 0, roll: rr(-0.15, 0.15) });
      }
      if (st === 2) disc(m, { x: h.x + rr(-0.05, 0.05), y: 0.11, z: h.z + rr(-0.05, 0.05), r: 0.03, n: 5, pitch: 0.4, yaw: rnd() * 6, c0: hx(0xd9a22a), c1: hx(0xe8b53a) });
      if (st >= 2) {
        const rad = st === 3 ? rr(0.1, 0.125) : rr(0.04, 0.055), px = h.x + 0.01, pz = clampT(h.z + 0.08, 0.5 - rad - 0.02);
        const col = st === 3 ? pick([hx(0xc8721f), hx(0xcf7c26), hx(0xbf6a1d)]) : hx(0x86a247);
        ell(m, { x: px, y: rad * 0.7 + 0.02, z: pz, rx: rad, ry: rad * 0.72, rz: rad, seg: 8, rings: 3, ribs: 0.1, wob: 0.05, phase: rnd() * 3, colf: (v, j) => mix(mul(col, 1.12 * (j & 1 ? 0.92 : 1)), mul(col, 0.8 * (j & 1 ? 0.92 : 1)), v) });
        stem(m, [[px, rad * 1.35 + 0.01, pz], [px + 0.012, rad * 1.35 + 0.06, pz + 0.004]], 0.015, 0.011, hx(0x657a34), hx(0x8a8444), 3, true);
      }
    }
  };

  // ---- арбуз: плети с резными листьями, полосатые арбузы
  CROPS.watermelon = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035, SOIL);
    for (const h of sprawlHills()) {
      if (st === 0) { mound(m, h.x, h.z, 0.05, 0.016, SOIL); cotyl(m, h.x, 0.04, h.z, 0.05, hx(0x7fae4c), hx(0xa2c562)); continue; }
      const nl = st === 1 ? 3 : 4, ls = (st === 1 ? 0.11 : 0.2) * (0.9 + 0.2 * rnd()), cv = [hx(0x4a7d45), hx(0x7aa862)];
      if (st >= 2) for (let i = 0; i < 2; i++) { const run = vineRun(m, h.x, h.z, rnd() * TAU, rr(0.2, 0.3), hx(0x57764a), hx(0x7a9a5a)); const e = run[run.length - 1]; leaf(m, { x: e[0], y: 0.05, z: e[2], yaw: rnd() * TAU, rise: rr(0, 0.25), curve: -0.2, len: ls * 0.8, wid: ls * 0.8, prof: PROF.lobe, c0: jit(cv[0], 0.1), c1: jit(cv[1], 0.1) }); }
      for (let i = 0; i < nl; i++) {
        const a = i * TAU / nl + rnd() * 0.9, d = 0.03;
        leaf(m, { x: h.x + Math.sin(a) * d, y: 0.055 + rnd() * 0.04, z: h.z + Math.cos(a) * d, yaw: a, rise: rr(0.1, 0.45), curve: -0.3, len: ls, wid: ls * 0.9, prof: PROF.lobe, c0: jit(cv[0], 0.1), c1: jit(cv[1], 0.1), fold: i === 0 ? 0.1 : 0, roll: rr(-0.15, 0.15) });
      }
      if (st === 2) disc(m, { x: h.x + rr(-0.05, 0.05), y: 0.09, z: h.z + rr(-0.05, 0.05), r: 0.022, n: 5, pitch: 0.4, yaw: rnd() * 6, c0: hx(0xd6bf3a), c1: hx(0xe8d257) });
      if (st >= 2) {
        const ripe = st === 3, ry = ripe ? rr(0.13, 0.16) : rr(0.045, 0.06), rx = ripe ? rr(0.09, 0.105) : ry * 0.8, ang = rr(-0.6, 0.6);
        const dk = hx(0x2b5a2c), lt = ripe ? hx(0x78a455) : hx(0x8fb066), pz = clampT(h.z + 0.08, 0.5 - ry - 0.02);
        ell(m, { x: h.x + 0.01, y: rx * 0.85 + 0.015, z: pz, rx, ry, rz: rx, yaw: ang, pitch: PI / 2, seg: 8, rings: 3, wob: 0.04, phase: 0.2, prof: (v) => 0.82 + 0.18 * Math.sin(v * PI), colf: (v, j) => { const c = j & 1 ? dk : lt; return mix(mul(c, 1.1), mul(c, 0.85), Math.abs(v - 0.5) * 1.6); } });
      }
    }
  };

  // ---- баклажан: кусты с крупными листьями и фиолетовыми плодами
  CROPS.eggplant = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035);
    for (const s of grid(3, 3, { jz: 0.05, jx: 0.02, stag: true, margin: 0.1 })) {
      const y0 = 0.03;
      if (st === 0) { mound(m, s.x, s.z, 0.035, 0.01, SOIL); cotyl(m, s.x, y0, s.z, 0.04, hx(0x7fae4c), hx(0xa2c562)); continue; }
      const H = [0, 0.16, 0.36, 0.46][st] * s.sc, hd = rnd() * TAU, lean = rr(0.02, 0.1);
      const base = [s.x, y0, s.z], top = [s.x + Math.sin(lean) * Math.sin(hd) * H, y0 + H, s.z + Math.sin(lean) * Math.cos(hd) * H];
      stem(m, [base, top], 0.017, 0.008, hx(0x5b6e33), hx(0x7a8a46), 3);
      const nl = st === 1 ? 4 : 6;
      for (let i = 0; i < nl; i++) {
        const t0 = st === 3 ? 0.42 : 0.3, t = t0 + (1 - t0) * (i + rnd() * 0.5) / nl, p = lerpPt(base, top, t);
        leaf(m, { x: p[0], y: p[1], z: p[2], yaw: i * 2.4 + rnd() * 0.5, rise: rr(0.1, 0.6), curve: -0.4, len: (st === 1 ? 0.1 : 0.2) * s.sc * (1.05 - 0.2 * t), wid: (st === 1 ? 0.07 : 0.15) * s.sc, prof: PROF.ovate, c0: jit(hx(0x3f6234), 0.1), c1: jit(hx(0x6f9458), 0.1), fold: st >= 2 && i % 3 === 0 ? 0.1 : 0, roll: rr(-0.2, 0.2) });
      }
      if (st === 2) for (let i = 0; i < 2; i++) disc(m, { x: top[0] + rr(-0.05, 0.05), y: y0 + H * rr(0.55, 0.95), z: top[2] + rr(-0.05, 0.05), r: 0.028, n: 5, pitch: 0.7, yaw: rnd() * 6, c0: hx(0xe3c64a), c1: hx(0xa58ac8) });
      if (st === 3) {
        const nf = (s.r + s.j) % 2 ? 3 : 2;
        for (let i = 0; i < nf; i++) {
          const t = 0.42 + 0.25 * rnd(), a = rnd() * TAU, d = rr(0.05, 0.085), ln = rr(0.095, 0.115), p = lerpPt(base, top, t);
          const pu = pick([hx(0x6a3a86), hx(0x74408f), hx(0x5f3480)]);
          ell(m, { x: p[0] + Math.cos(a) * d, y: p[1] - 0.012 - ln, z: p[2] + Math.sin(a) * d, rx: 0.056, ry: ln, rz: 0.056, yaw: a, pitch: rr(-0.18, 0.18), seg: 5, rings: 3, wob: 0.06, phase: rnd() * 3, vmap: (v) => v <= 0.67 ? 1.08 * v : 0.72 + (v - 0.667) * 0.84, prof: (v) => v < 0.34 ? 0.4 + 0.65 * v : 0.62 + 1.05 * (v - 0.333), colf: (v) => v < 0.2 ? hx(0x62803f) : mix(mul(pu, 1.3), mul(pu, 0.85), v) });
        }
      }
    }
  };

  // ---- подсолнух: высокие стебли, крупные жёлтые головки лицом к +Z
  CROPS.sunflower = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035);
    for (const s of grid(3, 3, { jz: 0.04, jx: 0.02, stag: true, margin: 0.1 })) {
      const y0 = 0.03;
      if (st === 0) { mound(m, s.x, s.z, 0.04, 0.012, SOIL); cotyl(m, s.x, y0 + 0.005, s.z, 0.055, hx(0x7fae4c), hx(0xa8c966)); continue; }
      const H = [0, 0.4, 1.1, rr(1.45, 1.7)][st] * (0.95 + 0.05 * s.sc), hd = rr(-0.5, 0.5);
      const fw = st >= 2 ? 0.05 + 0.03 * rnd() : 0.01;
      const p1 = [s.x, y0 + H * 0.6, s.z - fw * 0.1], top = [s.x, y0 + H, s.z + fw];
      stem(m, [[s.x, y0, s.z], p1, top], 0.028 * Math.min(1, 0.45 + H * 0.4), 0.02, hx(st === 3 ? 0x6e8a3a : 0x5a8a38), hx(st === 3 ? 0x8a9a45 : 0x76a042), 3);
      const nl = st === 1 ? 4 : 5;
      for (let i = 0; i < nl; i++) {
        const t = st === 1 ? 0.25 + i * 0.18 : 0.16 + 0.6 * i / (nl - 1), low = 1 - t;
        const ln = (st === 1 ? 0.13 : 0.21) * s.sc * (0.7 + 0.5 * Math.sin(t * PI * 0.8 + 0.3));
        leaf(m, { x: s.x, y: y0 + H * t, z: s.z - fw * 0.1 * t, yaw: i * 2.4 + rr(-0.4, 0.4), rise: rr(0.1, 0.6), curve: -0.45, len: ln, wid: ln * 0.85, prof: PROF.ovate, c0: jit(st === 3 ? mix(hx(0x5c8238), hx(0x98a043), low * 0.6) : hx(0x4a7d36), 0.08), c1: jit(st === 3 ? mix(hx(0x6a9438), hx(0xa09f4a), low * 0.5) : hx(0x629838), 0.08), fold: i % 2 ? 0.1 : 0, roll: rr(-0.2, 0.2) });
      }
      if (st >= 2) {
        const ripe = st === 3, hr = ripe ? rr(0.11, 0.14) : rr(0.045, 0.055), pt = ripe ? rr(1.0, 1.3) : 0.75, hy = rr(-0.35, 0.35);
        const nx = Math.sin(hy) * Math.sin(pt), ny = Math.cos(pt), nz = Math.cos(hy) * Math.sin(pt), cx = top[0] - nx * 0.01, cy = top[1] - ny * 0.01 + (ripe ? 0.0 : 0.02), cz = top[2] - nz * 0.01;
        disc(m, { x: cx - nx * 0.012, y: cy - ny * 0.012, z: cz - nz * 0.012, yaw: hy, pitch: pt, roll: 0, r: hr * 1.08, n: 8, dome: -hr * 0.18, c0: hx(0x6a7a36), c1: hx(0x536b30) });
        if (ripe) {
          const np = 10, f = frame(hy, pt, 0), org = [cx, cy, cz];
          for (let i = 0; i < np; i++) {
            const a = i * TAU / np + rnd() * 0.15, ca = Math.cos(a), sa = Math.sin(a), w = hr * 0.26, ln = hr * rr(0.8, 1.0), sx = -sa, sz = ca, r0 = hr * 0.85;
            const b1 = xf(f, org, ca * r0 + sx * w, 0.004, sa * r0 + sz * w), b2 = xf(f, org, ca * r0 - sx * w, 0.004, sa * r0 - sz * w);
            const mid1 = xf(f, org, ca * hr * 1.25 + sx * w * 0.9, 0.012, sa * hr * 1.25 + sz * w * 0.9), mid2 = xf(f, org, ca * hr * 1.25 - sx * w * 0.9, 0.012, sa * hr * 1.25 - sz * w * 0.9);
            const tp = xf(f, org, ca * (r0 + ln), 0.006, sa * (r0 + ln));
            const pc = jit(pick([hx(0xe3b520), hx(0xdcae1e), hx(0xe8bd2c)]), 0.04), pc2 = mul(pc, 1.1), pd = mul(pc, 0.8);
            m.tri(b1, b2, mid2, pd, pd, pc); m.tri(b1, mid2, mid1, pd, pc, pc); m.tri(mid1, mid2, tp, pc, pc, pc2);
          }
          disc(m, { x: cx, y: cy + 0.004, z: cz, yaw: hy, pitch: pt, r: hr * 0.9, n: 8, dome: hr * 0.12, c0: hx(0x3d2a18), c1: hx(0x5b4224), phase: 0.2 });
        } else {
          for (let i = 0; i < 7; i++) { const a = i * TAU / 7; leaf(m, { x: cx + nx * 0.01 + Math.cos(a) * hr * 0.4 * Math.cos(hy), y: cy + ny * 0.01, z: cz + nz * 0.01 + Math.sin(a) * hr * 0.4, yaw: a + hy, rise: 0.9, len: hr * 1.2, wid: hr * 0.5, prof: PROF.spike, c0: hx(0x5d8a3a), c1: hx(0x9ab04a) }); }
          disc(m, { x: cx, y: cy + 0.004, z: cz, yaw: hy, pitch: pt, r: hr * 0.8, n: 8, dome: hr * 0.2, c0: hx(0x7a9a3c), c1: hx(0xb3b652), phase: 0.2 });
        }
      }
    }
  };

  // ---- виноград: шпалера, лозы, листья, гроздья
  CROPS.grape = (m, st) => {
    const xs = rowXs(3).map((x) => x * 0.95); ridges(m, xs, 0.1, 0.035);
    const cord = hx(0x5a4630), WH = 0.78, PH = 1.28;
    for (const x of xs) {
      stem(m, [[x, 0, 0], [x, PH, 0]], 0.02, 0.016, WOOD, WOOD_L, 3, true);
      bar(m, [x - 0.07, PH - 0.02, 0], [x + 0.07, PH - 0.02, 0], 0.016, WOOD);
      for (const dx of [-0.07, 0.07]) bar(m, [x + dx, PH - 0.02, -0.5], [x + dx, PH - 0.02, 0.5], 0.007, WIRE);
      bar(m, [x, WH, -0.5], [x, WH, 0.5], 0.007, WIRE);
      if (st === 0) { for (const z of [-0.3, 0.05, 0.38]) { mound(m, x, z, 0.04, 0.012, SOIL); bar(m, [x, 0.03, z], [x + 0.01, 0.12, z + 0.005], 0.012, hx(0x7a6a44), hx(0x8a8a50)); leaf(m, { x: x + 0.01, y: 0.12, z: z + 0.005, yaw: rnd() * 6, rise: 0.8, curve: -0.2, len: 0.075, wid: 0.075, prof: PROF.round, c0: hx(0x7fae4c), c1: hx(0xa2c562) }); } continue; }
      stem(m, [[x, 0.03, 0.0], [x + 0.012, WH * 0.5, 0.0], [x, WH, 0.0]], 0.02, 0.014, cord, hx(0x6e5a3e), 3);
      for (let k = 0; k < 4; k++) bar(m, [x + (k & 1 ? 0.01 : -0.01), WH + (k & 1 ? 0.012 : 0), -0.5 + k / 4], [x + (k & 1 ? -0.01 : 0.01), WH + (k & 1 ? 0 : 0.012), -0.25 + k / 4], 0.016, cord, hx(0x6e5a3e));
      const nl = st === 1 ? 10 : st === 2 ? 16 : 17, hmax = st === 1 ? 0.6 : st === 2 ? 1.1 : 1.2;
      if (st >= 2) for (const z of [-0.32, -0.1, 0.18, 0.38]) bar(m, [x + rr(-0.01, 0.01), WH, z], [x + rr(-0.05, 0.05), hmax + 0.05, z + rr(-0.03, 0.03)], 0.012, hx(0x7a6a3e), hx(0x8a9a4a));
      for (let i = 0; i < nl; i++) {
        const z = -0.45 + 0.9 * (i + rnd() * 0.7) / nl, side = (i & 1) ? 1 : -1, hyMin = st >= 2 ? WH * 0.94 : WH * 0.7, hy = hyMin + rnd() * (hmax - hyMin), ls = (st === 1 ? 0.13 : 0.18) * rr(0.9, 1.15);
        leaf(m, { x: x + side * 0.015, y: hy, z, yaw: side * PI / 2 + rr(-0.6, 0.6), rise: rr(-0.25, 0.45), curve: -0.35, len: ls, wid: ls * 1.1, prof: PROF.lobe, c0: jit(gr(0.1 + 0.3 * rnd()), 0.1), c1: jit(gr(0.45 + 0.4 * rnd()), 0.1), roll: rr(-0.2, 0.2) });
      }
      if (st >= 2) {
        const nc = st === 3 ? 5 : 3;
        for (let i = 0; i < nc; i++) {
          const z = -0.4 + 0.8 * (i + rnd() * 0.5) / nc, side = (i & 1) ? 1 : -1, ln = st === 3 ? rr(0.11, 0.14) : rr(0.05, 0.07), rad = st === 3 ? 0.06 : 0.026;
          const pur = pick([hx(0x6c3c7c), hx(0x5e3272), hx(0x7a4688)]), grn = pick([hx(0x7c9c4e), hx(0x8aa857)]);
          ell(m, { x: x + side * 0.055, y: WH - 0.02 - ln, z, rx: rad, ry: ln, rz: rad, yaw: rnd() * 3, pitch: rr(-0.1, 0.1), seg: 5, rings: 3, wob: 0.2, ribs: 0.12, phase: rnd() * 3, prof: (v) => Math.pow(1 - v * 0.8, 0.7), colf: (v, j) => { const b = st === 3 ? pur : grn; return mix(mul(b, 1.25 * (j & 1 ? 0.92 : 1)), mul(b, 0.8), v * 0.9); } });
        }
      }
    }
  };

  // ---- ананас: колючие розетки с золотым плодом
  CROPS.pineapple = (m, st) => {
    const xs = rowXs(3); ridges(m, xs, 0.1, 0.035);
    for (const s of grid(3, 3, { jz: 0.05, jx: 0.02, stag: true, margin: 0.12 })) {
      const y0 = 0.03;
      if (st === 0) { mound(m, s.x, s.z, 0.04, 0.012, SOIL); for (let i = 0; i < 4; i++) leaf(m, { x: s.x, y: y0, z: s.z, yaw: i * 1.6 + rnd() * 0.5, rise: rr(0.9, 1.3), curve: -0.2, len: 0.1, wid: 0.024, prof: PROF.spike, c0: hx(0x6f9f6a), c1: hx(0x9cc283) }); continue; }
      const sc = [0, 0.4, 0.8, 1][st] * s.sc, nl = st === 1 ? 6 : 8;
      for (let i = 0; i < nl; i++) leaf(m, { x: s.x, y: y0 + 0.03, z: s.z, yaw: i * TAU / nl + rnd() * 0.4, rise: rr(0.45, 0.85), curve: -0.55, len: 0.34 * sc, wid: 0.06 * sc, prof: PROF.sword, c0: jit(hx(0x4f7d52), 0.08), c1: jit(i & 1 ? hx(0x8d9a52) : hx(0x9c9a56), 0.08), fold: i & 1 ? 0.25 : 0 });
      if (st >= 2) for (let i = 0; i < 4; i++) leaf(m, { x: s.x, y: y0 + 0.05, z: s.z, yaw: i * 1.6 + 0.4 + rnd() * 0.5, rise: rr(1.15, 1.4), curve: -0.35, len: 0.26 * sc, wid: 0.05 * sc, prof: PROF.sword, c0: jit(hx(0x57855a), 0.08), c1: jit(hx(0x93a05a), 0.08), fold: i & 1 ? 0.25 : 0 });
      if (st >= 2) {
        const ripe = st === 3, ry = ripe ? 0.105 : 0.045, rx = ripe ? 0.065 : 0.03, hh = ripe ? 0.25 : 0.14, px = s.x + rr(-0.01, 0.01), pz = s.z + rr(-0.01, 0.01);
        const gold = ripe ? [hx(0xd9a233), hx(0xc98a28)] : [hx(0x8aa84a), hx(0x739a40)];
        ell(m, { x: px, y: y0 + hh, z: pz, rx, ry, rz: rx, seg: 6, rings: 3, wob: 0.04, prof: (v) => 0.78 + 0.22 * Math.sin(v * PI), colf: (v, j, i) => { const c = gold[(j + i) & 1]; return mix(mul(c, 1.12), mul(c, 0.85), v); } });
        for (let i = 0; i < 5; i++) leaf(m, { x: px, y: y0 + hh + ry * 0.85, z: pz, yaw: i * 1.26 + rnd() * 0.3, rise: rr(1.05, 1.4), curve: -0.3, len: ripe ? 0.15 : 0.1, wid: ripe ? 0.034 : 0.024, prof: PROF.spike, c0: hx(0x4f8052), c1: hx(0x7aa465) });
      }
    }
  };

  // ------------------------------------------------------------------ сборка
  const MAT = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, color: 0xf0f0f0 });
  // подлистья и тыльные грани: рассеянный свет смешивается с лицевым, чтобы не было чёрных пластин (Lambert r128 считает обратную сторону по перевёрнутой нормали)
  MAT.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('reflectedLight.indirectDiffuse += ( gl_FrontFacing ) ? vIndirectFront : vIndirectBack;', 'reflectedLight.indirectDiffuse += ( gl_FrontFacing ) ? vIndirectFront * 0.6 + vIndirectBack * 0.4 : vIndirectBack * 0.6 + vIndirectFront * 0.4;');
  };
  function finish(m) {
    const P = new Float32Array(m.P);
    for (let i = 0; i < P.length; i += 3) { P[i] = Math.max(-0.5, Math.min(0.5, P[i])); P[i + 1] = Math.max(0, P[i + 1]); P[i + 2] = Math.max(-0.5, Math.min(0.5, P[i + 2])); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(m.N, 3)); g.setAttribute('color', new T.Float32BufferAttribute(m.K, 3));
    const mesh = new T.Mesh(g, MAT); mesh.castShadow = true; mesh.receiveShadow = true;
    const grp = new T.Group(); grp.add(mesh); if (m.extra) for (const e of m.extra) grp.add(e); return grp;
  }

  const NAMES = ['wheat', 'carrot', 'potato', 'tomato', 'corn', 'cucumber', 'strawberry', 'cabbage', 'pumpkin', 'eggplant', 'watermelon', 'sunflower', 'grape', 'pineapple'];
  const NVAR = 8, CACHE = {}; // на каждую (культура, стадия) строится до 8 вариантов тайла; тайлы выбирают вариант по seed и получают копию геометрии
  NAMES.forEach((name, idx) => {
    FM.register('crop', name, (opts) => {
      opts = opts || {};
      const stage = Math.max(0, Math.min(3, Math.round(opts.stage != null ? opts.stage : (opts.level != null ? opts.level : 1) - 1)));
      let h = Math.imul((opts.seed | 0) + 1013, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; const variant = (h >>> 0) % NVAR, key = name + '|' + stage + '|' + variant;
      let src = CACHE[key];
      if (!src) {
        rnd = lcg((idx * 7919 + stage * 104729 + variant * 15485863 + 12345) >>> 0);
        const m = new Mesher(); CROPS[name](m, stage); src = CACHE[key] = finish(m);
      }
      const g = new T.Group();
      for (const c of src.children) { const mesh = new T.Mesh(c.geometry.clone(), c.material); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
      return g;
    });
  });
})();
