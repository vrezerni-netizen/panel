/* Лесной набор: пни, камни, молодые деревья, брёвна, доски, хворост, щепа, подлесок (kind 'forest')
   и здания kind 'building': лесопилка (sawmill), избушка лесорубов (loggerHut). Three.js r128, без внешних файлов.
   Перед = +Z, начало координат = центр основания на земле, 1 единица ~ 1 м. Клетка леса = 3 x 3 м.
   Модели авторские: собираются из процедурных поверхностей (смещённые шары, конические трубки-ветви, карточки листвы
   с альфа-атласом), PBR-материалы с вершинными цветами и холст-текстурами (кора, торцы с годичными кольцами, гранит, гофролист...).
   Всё склеивается в 1-4 меша на модель (свой склеиватель: вершинные цвета сохраняются, шум детерминирован — одинаковые opts дают одну модель). */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function lcg(seed) { let s = (Math.imul((seed | 0) ^ 0x9e3779b9, 2654435761) >>> 0) || 1; const f = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; f(); f(); return f; }
  // ------------------------------------------------------------------ шум
  function ih(x, y, z) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vn(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const a = (i, j, k) => ih(xi + i, yi + j, zi + k);
    return lerp(lerp(lerp(a(0, 0, 0), a(1, 0, 0), u), lerp(a(0, 1, 0), a(1, 1, 0), u), v), lerp(lerp(a(0, 0, 1), a(1, 0, 1), u), lerp(a(0, 1, 1), a(1, 1, 1), u), v), w);
  }
  function fbm(x, y, z, o) { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < (o || 3); i++) { s += a * vn(x * f, y * f, z * f); t += a; f *= 2.03; a *= 0.5; } return s / t; }
  /** Периодический 2D-шум (период px, py клеток) для бесшовных текстур. */
  function pn(x, y, px, py, sd) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const w = (a, p) => ((a % p) + p) % p, x0 = w(xi, px), x1 = w(xi + 1, px), y0 = w(yi, py), y1 = w(yi + 1, py), s = (sd | 0) * 7919;
    return lerp(lerp(ih(x0, y0, s), ih(x1, y0, s), u), lerp(ih(x0, y1, s), ih(x1, y1, s), u), v);
  }
  // ------------------------------------------------------------------ цвет
  const _col = new T.Color();
  const rgb = (h) => { _col.set(h); return [_col.r, _col.g, _col.b]; };
  const mixc = (a, b, t) => { const A = typeof a === 'number' ? rgb(a) : a, B = typeof b === 'number' ? rgb(b) : b; return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]; };
  const mulc = (a, k) => { const A = typeof a === 'number' ? rgb(a) : a; return [A[0] * k, A[1] * k, A[2] * k]; };
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const UPV = V3(0, 1, 0);

  // ------------------------------------------------------------------ геометрия: сварка нормалей и фабрики
  /** Гладкие нормали по позициям (швы и дубликаты вершин склеиваются). Работает и для indexed, и для non-indexed. */
  function weld(g) {
    const p = g.attributes.position, n = p.count, idx = g.index ? g.index.array : null, tri = idx ? idx.length / 3 : n / 3;
    const keys = new Array(n), map = new Map(), K = 3000;
    for (let i = 0; i < n; i++) { const k = Math.round(p.getX(i) * K) + ',' + Math.round(p.getY(i) * K) + ',' + Math.round(p.getZ(i) * K); keys[i] = k; if (!map.has(k)) map.set(k, [0, 0, 0]); }
    const a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0);
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2); b.sub(a); c.sub(a); b.cross(c);
      for (const i of [i0, i1, i2]) { const s = map.get(keys[i]); s[0] += b.x; s[1] += b.y; s[2] += b.z; }
    }
    const nn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const s = map.get(keys[i]), l = Math.hypot(s[0], s[1], s[2]) || 1; nn[i * 3] = s[0] / l; nn[i * 3 + 1] = s[1] / l; nn[i * 3 + 2] = s[2] / l; }
    g.setAttribute('normal', new T.BufferAttribute(nn, 3)); return g;
  }
  /** Нормали со сваркой по углу излома: внутри плоской грани гладко, на рёбрах резко (для скал). Только non-indexed. */
  function weldCrease(g, deg) {
    const p = g.attributes.position, n = p.count, tc = n / 3, cosT = Math.cos(deg * PI / 180), keys = new Array(n), map = new Map(), fnu = new Float32Array(tc * 3), fnn = new Float32Array(tc * 3), a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0), K = 3000;
    for (let t = 0; t < tc; t++) {
      a.fromBufferAttribute(p, t * 3); b.fromBufferAttribute(p, t * 3 + 1); c.fromBufferAttribute(p, t * 3 + 2); b.sub(a); c.sub(a); b.cross(c); fnu[t * 3] = b.x; fnu[t * 3 + 1] = b.y; fnu[t * 3 + 2] = b.z; const l = b.length() || 1; fnn[t * 3] = b.x / l; fnn[t * 3 + 1] = b.y / l; fnn[t * 3 + 2] = b.z / l;
      for (let k = 0; k < 3; k++) { const i = t * 3 + k, key = Math.round(p.getX(i) * K) + ',' + Math.round(p.getY(i) * K) + ',' + Math.round(p.getZ(i) * K); keys[i] = key; let m = map.get(key); if (!m) map.set(key, m = []); m.push(t); }
    }
    const nn = new Float32Array(n * 3);
    for (let t = 0; t < tc; t++) for (let k = 0; k < 3; k++) {
      const i = t * 3 + k, list = map.get(keys[i]); let x = 0, y = 0, z = 0;
      for (const u of list) { if (fnn[u * 3] * fnn[t * 3] + fnn[u * 3 + 1] * fnn[t * 3 + 1] + fnn[u * 3 + 2] * fnn[t * 3 + 2] > cosT) { x += fnu[u * 3]; y += fnu[u * 3 + 1]; z += fnu[u * 3 + 2]; } }
      const l = Math.hypot(x, y, z) || 1; nn[i * 3] = x / l; nn[i * 3 + 1] = y / l; nn[i * 3 + 2] = z / l;
    }
    g.setAttribute('normal', new T.BufferAttribute(nn, 3)); return g;
  }
  /** Тип проекции по нормали грани (трипланарно, по треугольникам): задаёт uv из мировых координат * s. Только для non-indexed. */
  function triplanar(g, s, ox, oy) {
    const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2), a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0);
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2); const e1 = b.clone().sub(a), e2 = c.clone().sub(a), nr = e1.cross(e2), ax = Math.abs(nr.x), ay = Math.abs(nr.y), az = Math.abs(nr.z);
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3; let fx, fy;
      const ax_ = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
      // сдвиг на целое число повторов по центру треугольника: uv остаются малыми и непрерывными внутри треугольника
      const q = (v) => Math.floor(v * s);
      for (let k = 0; k < 3; k++) {
        const P = k === 0 ? a : k === 1 ? b : c; let u, v;
        if (ax_ === 0) { u = P.z * s - q(cz) + (ox || 0); v = P.y * s - q(cy) + (oy || 0); } else if (ax_ === 1) { u = P.x * s - q(cx) + (ox || 0); v = P.z * s - q(cz) + (oy || 0); } else { u = P.x * s - q(cx) + (ox || 0); v = P.y * s - q(cy) + (oy || 0); }
        uv[(t + k) * 2] = u; uv[(t + k) * 2 + 1] = v;
      }
    }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); return g;
  }
  const _gc = {};
  const gcache = (k, f) => _gc[k] || (_gc[k] = f());
  const boxG = () => gcache('box', () => new T.BoxGeometry(1, 1, 1));
  const cylG = (seg, open) => gcache('cyl' + seg + (open ? 'o' : ''), () => new T.CylinderGeometry(1, 1, 1, seg, 1, !!open));
  const sphG = (w, h) => gcache('sph' + w + 'x' + h, () => new T.SphereGeometry(1, w, h));
  /** Трубка (ветвь, корень, шланг, труба) вдоль ломаной pts [[x,y,z]|Vector3], радиусы rads (массив или f(t)). Нормали аналитические; торцы по желанию cap0/cap1 = [u,v,r] (uv диска). */
  function tube(pts, rads, seg, o) {
    o = o || {}; seg = seg || 8;
    const P = pts.map((p) => (p.isVector3 ? p : V3(p[0], p[1], p[2]))), n = P.length, R = typeof rads === 'function' ? P.map((_, i) => rads(i / (n - 1))) : rads;
    const pos = [], nor = [], uv = [], idx = [], Tn = [], L = [0];
    for (let i = 0; i < n; i++) { const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)]; Tn.push(b.clone().sub(a).normalize()); if (i) L.push(L[i - 1] + P[i].distanceTo(P[i - 1])); }
    let N = Math.abs(Tn[0].y) < 0.9 ? UPV.clone() : V3(1, 0, 0); N.addScaledVector(Tn[0], -N.dot(Tn[0])).normalize();
    const uR = o.uRep == null ? 1 : o.uRep, vR = o.vRep == null ? 1 : o.vRep, fr = [];
    for (let i = 0; i < n; i++) {
      const t = Tn[i]; if (i) { N = N.clone().addScaledVector(t, -N.dot(t)); if (N.lengthSq() < 1e-8) N = Math.abs(t.y) < 0.9 ? UPV.clone().addScaledVector(t, -t.y) : V3(1, 0, 0); N.normalize(); }
      const B = t.clone().cross(N), i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, n - 1), sl = (R[i1] - R[i0]) / Math.max(1e-6, P[i1].distanceTo(P[i0])), rr = R[i], ov = o.ov || 1;
      fr.push([N.clone(), B.clone()]);
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * TAU, ca = Math.cos(a), sa = Math.sin(a), d = N.clone().multiplyScalar(ca).addScaledVector(B, sa), nr = d.clone().addScaledVector(t, -sl), nfl = o.flat || 1; if (nfl !== 1) { d.y *= nfl; nr.y /= nfl; } nr.normalize(); const _x = 0, q = o.wob ? 1 + o.wob * (vn(P[i].x * 3 + ca * 2, P[i].y * 3 + sa * 2, P[i].z * 3) - 0.5) : 1;
        pos.push(P[i].x + d.x * rr * q * (j ? 1 : 1), P[i].y + d.y * rr * q, P[i].z + d.z * rr * q); nor.push(nr.x, nr.y, nr.z); uv.push(j / seg * uR, L[i] * vR);
      }
      if (o.f) o.f(i, pos, P[i], rr);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const cap = (i, c, sgn) => {
      const base = pos.length / 3, t = Tn[i], [N_, B_] = fr[i]; pos.push(P[i].x, P[i].y, P[i].z); nor.push(t.x * sgn, t.y * sgn, t.z * sgn); uv.push(c[0], c[1]);
      for (let j = 0; j <= seg; j++) { const a = j / seg * TAU, ca = Math.cos(a), sa = Math.sin(a); pos.push(P[i].x + (N_.x * ca + B_.x * sa) * R[i], P[i].y + (N_.y * ca + B_.y * sa) * R[i], P[i].z + (N_.z * ca + B_.z * sa) * R[i]); nor.push(t.x * sgn, t.y * sgn, t.z * sgn); uv.push(c[0] + ca * c[2], c[1] + sa * c[2]); }
      for (let j = 0; j < seg; j++) { if (sgn > 0) idx.push(base, base + 1 + j, base + 2 + j); else idx.push(base, base + 2 + j, base + 1 + j); }
    };
    if (o.cap0) cap(0, o.cap0, -1); if (o.cap1) cap(n - 1, o.cap1, 1);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  }
  /** Регулярная сетка (nu x nv) с повторяющимся швом по u; fn(i,j)->[x,y,z]; нормали свариваются. uvf(i,j)->[u,v]. */
  function grid(nu, nv, fn, uvf, flip) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i, j); pos.push(p[0], p[1], p[2]); const q = uvf ? uvf(i, j) : [i / nu, j / nv]; uv.push(q[0], q[1]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return weld(g);
  }
  /** Смещённый шар-комок (листва, мох, кусты, камни без граней). o: detail, amp, freq, sd. Радиусы rx, ry, rz; нормали гладкие. */
  function blob(rx, ry, rz, o) {
    o = o || {}; const g = new T.IcosahedronGeometry(1, o.detail == null ? 1 : o.detail), p = g.attributes.position, sd = o.sd || 0, amp = o.amp == null ? 0.22 : o.amp, fq = o.freq || 1.4, v = V3(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const k = 1 + amp * (fbm(v.x * fq + sd * 3.1, v.y * fq + sd * 1.7, v.z * fq - sd * 2.3, 2) - 0.5) * 2; p.setXYZ(i, v.x * k * rx, v.y * k * ry, v.z * k * rz);
    }
    return weld(g);
  }
  /** Ромб-карточка листвы: основание в (0,0,0) вдоль +Y, ширина вдоль X; uv из ячейки атласа c = [u0,v0,du,dv]. Двойная (две стороны, одинаковые нормали). */
  const dirOut = V3(0, 1, 0);

  // ------------------------------------------------------------------ склеиватель: по одному мешу на материал, вершинные цвета, детерминированный
  const _v = V3(0, 0, 0), _n = V3(0, 0, 0), _nm = new T.Matrix3();
  function Bld() { this.b = {}; this.aoH = 0.32; this.aoK = 0.38; this.tris = 0; }
  const toRGB = (c) => (c == null ? [1, 1, 1] : typeof c === 'number' ? rgb(c) : c.isColor ? [c.r, c.g, c.b] : c);
  /** Добавить геометрию g в корзину материала key. o: m — Matrix4, col — цвет (hex | [r,g,b] | f(x,y,z,nx,ny,nz)->[r,g,b]), uvt — [u0,v0,su,sv], ao — 0 чтобы отключить затемнение у земли. */
  Bld.prototype.add = function (key, g, o) {
    o = o || {}; let B = this.b[key]; if (!B) B = this.b[key] = { pos: [], nor: [], col: [], uv: [], idx: [] };
    let m = o.m || null; if (this.mat) m = m ? this.mat.clone().multiply(m) : this.mat; const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color, n = pa.count, base = B.pos.length / 3, col = o.col, isF = typeof col === 'function', useGeo = !isF && col == null && !!ca, cc = isF || useGeo ? null : toRGB(col), uvt = o.uvt;
    if (m) _nm.getNormalMatrix(m);
    const aoH = o.ao === 0 ? 0 : this.aoH, aoK = this.aoK;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pa, i); _n.fromBufferAttribute(na, i);
      if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
      B.pos.push(_v.x, _v.y, _v.z); B.nor.push(_n.x, _n.y, _n.z);
      let c = isF ? col(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, i) : useGeo ? [ca.getX(i), ca.getY(i), ca.getZ(i)] : cc, k = 1;
      if (aoH && _v.y < aoH) k = 1 - aoK * (1 - sstep(0, aoH, _v.y));
      B.col.push(c[0] * k, c[1] * k, c[2] * k);
      if (ua) { const u = ua.getX(i), v = ua.getY(i); if (uvt) B.uv.push(uvt[0] + u * uvt[2], uvt[1] + v * uvt[3]); else B.uv.push(u, v); } else B.uv.push(0, 0);
    }
    const flip = m && m.determinant() < 0, ix = g.index ? g.index.array : null, cnt = ix ? ix.length : n;
    for (let i = 0; i < cnt; i += 3) { const a = base + (ix ? ix[i] : i), b = base + (ix ? ix[i + 1] : i + 1), c = base + (ix ? ix[i + 2] : i + 2); if (flip) B.idx.push(a, c, b); else B.idx.push(a, b, c); }
    this.tris += cnt / 3; return this;
  };
  /** Матрица положения: позиция, поворот (Euler XYZ), масштаб. */
  const _e = new T.Euler(), _q = new T.Quaternion(), _s = V3(1, 1, 1), _p = V3(0, 0, 0);
  function MX(x, y, z, rx, ry, rz, sx, sy, sz) { _e.set(rx || 0, ry || 0, rz || 0, 'XYZ'); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0); _s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz); return new T.Matrix4().compose(_p, _q, _s); }
  /** Матрица: позиция, ось Y направлена вдоль dir (Vector3), масштаб (sx, sy, sz). */
  function MD(x, y, z, dir, sx, sy, sz, roll) { _q.setFromUnitVectors(UPV, dir.clone().normalize()); if (roll) _q.multiply(new T.Quaternion().setFromAxisAngle(UPV, roll)); _p.set(x, y, z); _s.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); return new T.Matrix4().compose(_p, _q, _s); }
  // быстрые примитивы
  Bld.prototype.box = function (key, x, y, z, sx, sy, sz, col, rx, ry, rz, o) { return this.add(key, boxG(), Object.assign({ m: MX(x, y, z, rx, ry, rz, sx, sy, sz), col }, o)); };
  Bld.prototype.cyl = function (key, x, y, z, rt, rb, h, seg, col, rx, ry, rz, o) {   // цилиндр: радиус сверху rt, снизу rb, высота h; центр по высоте = y
    const g = gcache('cy' + seg + '_' + rt.toFixed(3) + '_' + rb.toFixed(3), () => { const q = new T.CylinderGeometry(rt, rb, 1, seg, 1, false); return q; });
    return this.add(key, g, Object.assign({ m: MX(x, y, z, rx, ry, rz, 1, h, 1), col }, o));
  };
  Bld.prototype.sph = function (key, x, y, z, rx, ry, rz, col, rot, o) { return this.add(key, sphG(14, 10), Object.assign({ m: MX(x, y, z, rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, rx, ry, rz), col }, o)); };
  Bld.prototype.rbox = function (key, w, h, d, r, x, y, z, col, rx, ry, rz, o) { return this.add(key, gcache('rb' + [w, h, d, r].join('_'), () => C.rbox(w, h, d, r, 3)), Object.assign({ m: MX(x, y, z, rx, ry, rz, 1, 1, 1), col }, o)); };
  /** Выполнить fn, пока все добавления преобразуются матрицей m (локальные координаты узла). */
  Bld.prototype.withM = function (m, fn) { const old = this.mat; this.mat = old ? old.clone().multiply(m) : m; fn(); this.mat = old; return this; };
  Bld.prototype.done = function (mats) {
    const out = new T.Group();
    for (const key of Object.keys(this.b)) {
      const B = this.b[key], g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(B.pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(B.nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(B.col, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(B.uv, 2));
      g.setIndex(B.pos.length / 3 > 65000 ? new T.Uint32BufferAttribute(B.idx, 1) : new T.Uint16BufferAttribute(B.idx, 1));
      g.computeBoundingBox(); g.computeBoundingSphere();
      const m = new T.Mesh(g, MAT(key)); m.castShadow = key !== 'glass'; m.receiveShadow = true; m.name = key; if (key === 'glass') { m.renderOrder = 3; m.receiveShadow = false; } out.add(m);
    }
    out.userData.tris = this.tris; return out;
  };

  // ------------------------------------------------------------------ регистрация с кэшем (геометрия и материалы общие у клонов)
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = opts || {};
      const o = { level: clamp(Math.round(opts.level || 1), 1, 10), variant: Math.max(0, opts.variant | 0), stage: clamp(opts.stage | 0, 0, 2), size: clamp(Math.round(opts.size || 1), 1, 3), seed: (opts.seed | 0) & 15, length: opts.length };
      const key = [kind, name, o.level, o.variant, o.stage, o.size, o.seed, o.length || 0].join('|');
      if (!_cache[key]) _cache[key] = fn(o);
      return _cache[key].clone(true);
    });
  }

  // ====================================================================== текстуры (рисуются лениво при первом использовании)
  function mkTex(w, h, draw, an) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h); const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = an || 4; return t; }
  /** Попиксельная заливка: fn(x,y) -> [r,g,b(,a)] в 0..1. */
  function pix(g, w, h, fn) {
    const im = g.createImageData(w, h), d = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y), i = (y * w + x) * 4; d[i] = c[0] * 255; d[i + 1] = c[1] * 255; d[i + 2] = c[2] * 255; d[i + 3] = c.length > 3 ? c[3] * 255 : 255; }
    g.putImageData(im, 0, 0);
  }
  const TEXD = {}, TEXS = {};
  const TX = (name) => TEXS[name] || (TEXS[name] = TEXD[name]());
  /** Рисование с заворачиванием через края (бесшовность). */
  function wrap9(S, x, y, rad, fn) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx * S, Y = y + dy * S; if (X + rad < 0 || Y + rad < 0 || X - rad > S || Y - rad > S) continue; fn(X, Y); } }
  const rgba = (r, g, b, a) => `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a == null ? 1 : a})`;

  // кора: вертикальные борозды (тайл 0.35 м по u, 1.2 м по v; цвет серо-бурый, оттенок даёт вершинный цвет)
  TEXD.bark = () => mkTex(512, 512, (g, w, h) => pix(g, w, h, (x, y) => {
    const u = x / w, v = y / h, wp = (pn(u * 4, v * 2, 4, 2, 1) - 0.5) * 1.3 + (pn(u * 9, v * 5, 9, 5, 2) - 0.5) * 0.35;
    const s = Math.abs(Math.sin(PI * (u * 7 + wp)));
    let valley = 1 - sstep(0.0, 0.3, s); valley *= sstep(0.25, 0.5, pn(u * 7, v * 6, 7, 6, 3));
    const cr = 1 - sstep(0.0, 0.045, Math.abs(pn(u * 7 + 2, v * 8, 7, 8, 4) - 0.5)); valley = Math.max(valley, cr * 0.7 * sstep(0.2, 0.55, s));
    const fine = pn(u * 140, v * 60, 140, 60, 5), mot = pn(u * 3, v * 2, 3, 2, 6), hi = sstep(0.55, 1.0, s);
    const L = 0.78 - 0.55 * valley + 0.2 * (mot - 0.5) + 0.22 * (fine - 0.5) + 0.14 * hi * (1 - valley);
    return [L, L * 0.92, L * 0.82];
  }));
  // берёза: белая кора с чёрными поперечными чечевичками
  TEXD.birch = () => mkTex(512, 512, (g, w, h) => {
    pix(g, w, h, (x, y) => { const u = x / w, v = y / h, m = pn(u * 4, v * 4, 4, 4, 11), f = pn(u * 60, v * 90, 60, 90, 12), L = 0.9 + 0.07 * (m - 0.5) + 0.05 * (f - 0.5), cu = pn(u * 2, v * 6, 2, 6, 13); return [L * 1.0, L * 0.985, L * 0.94 - 0.04 * sstep(0.6, 0.9, cu)]; });
    const r = lcg(5);
    for (let i = 0; i < 150; i++) { const x = r() * w, y = r() * h, len = 14 + r() * 90, th = 2.5 + r() * 6, a = 0.55 + r() * 0.4; wrap9(w, x, y, len, (X, Y) => { g.fillStyle = rgba(0.1, 0.085, 0.075, a); g.beginPath(); g.ellipse(X, Y, len / 2, th / 2, 0, 0, TAU); g.fill(); }); }
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, len = 40 + r() * 120; wrap9(w, x, y, len, (X, Y) => { g.fillStyle = rgba(0.72, 0.7, 0.64, 0.45); g.fillRect(X - len / 2, Y, len, 2 + r() * 3); }); }
  });
  // торцы с годичными кольцами: атлас 2x2 ячеек (0 ель, 1 сосна, 2 дуб, 3 выветренная серая)
  TEXD.end = () => mkTex(512, 512, (g, w, h) => {
    const S = 256, SAP = [[0.88, 0.76, 0.54], [0.9, 0.76, 0.52], [0.86, 0.74, 0.54], [0.58, 0.54, 0.49]], HEART = [[0.8, 0.64, 0.42], [0.76, 0.55, 0.36], [0.68, 0.48, 0.29], [0.5, 0.45, 0.4]];
    const cr = []; for (let c = 0; c < 4; c++) { const a = []; for (let k = 0; k < (c === 3 ? 9 : 5); k++) a.push(ih(c, k, 91) * TAU); cr.push(a); }
    pix(g, w, h, (x, y) => {
      const c = (x >= S ? 1 : 0) + (y >= S ? 2 : 0), lx = x % S, ly = y % S, cx = 128 + ((c * 37) % 11) - 5, cy = 128 + ((c * 53) % 9) - 4, dx = lx - cx, dy = ly - cy, ang = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy * 1.05) / 118, warp = (vn(lx * 0.045 + c * 9, ly * 0.045, c) - 0.5) * 0.11 + (vn(Math.cos(ang) * 2 + c * 5, Math.sin(ang) * 2, 1.7) - 0.5) * 0.07, rr = r + warp;
      if (r > 1.03) return [0.26, 0.2, 0.15];
      if (r > 0.925) { const f = vn(lx * 0.3, ly * 0.3, c) * 0.5; return [0.2 + f * 0.2, 0.15 + f * 0.15, 0.11 + f * 0.1]; }
      if (r > 0.9) return [0.8, 0.7, 0.54];
      const N = c === 3 ? 11 : c === 1 ? 20 : 17, ph = rr * N, t = ph - Math.floor(ph), late = sstep(0.5, 0.96, t), heart = sstep(0.62, 0.5, rr);
      const sa = SAP[c], he = HEART[c]; let R = lerp(sa[0], he[0], heart), G = lerp(sa[1], he[1], heart), B = lerp(sa[2], he[2], heart);
      const dark = c === 3 ? 0.1 : 0.24; R *= 1 - late * dark; G *= 1 - late * dark * 1.05; B *= 1 - late * dark * 1.15;
      const fb = 1 + (pn(lx * 0.8, ly * 0.8, 200, 200, c) - 0.5) * 0.1 + (vn(Math.cos(ang) * 15 + c, rr * 3, 2.2) - 0.5) * 0.06;
      R *= fb; G *= fb; B *= fb; if (c < 3) { const gy = (R + G + B) / 3; R = lerp(R, gy, 0.2); G = lerp(G, gy, 0.2); B = lerp(B, gy, 0.2); const sw = Math.sin((lx * 0.62 + ly * 0.78) * 1.25 + 6 * vn(lx * 0.02, ly * 0.02, c)) * 0.022 + (pn(lx * 0.3, ly * 0.3, 100, 100, c + 5) - 0.5) * 0.06; R += sw; G += sw; B += sw; }
      let crack = 0; for (const a of cr[c]) { const da = Math.abs((((ang - a + PI) % TAU) + TAU) % TAU - PI); const wd = (0.012 + 0.022 * rr) * (0.5 + 1.1 * vn(rr * 14 + c * 3, a * 3, 1.3)) / Math.max(rr, 0.25); if (rr > 0.12 + 0.35 * ih(c, Math.floor(a * 10), 3) && da < wd) crack = Math.max(crack, 1 - da / wd); }
      const k = 1 - crack * (c === 3 ? 0.7 : 0.55); if (rr < 0.035) return [0.28, 0.17, 0.1];
      return [R * k, G * k, B * k];
    });
  });
  // гранит: тайл 1.2 м: зернистость, трещины, пятна лишайника (тон — вершинными цветами)
  TEXD.rock = () => mkTex(512, 512, (g, w, h) => {
    pix(g, w, h, (x, y) => {
      const u = x / w, v = y / h, m = (pn(u * 5, v * 5, 5, 5, 21) - 0.5) * 0.3 + (pn(u * 14, v * 14, 14, 14, 22) - 0.5) * 0.22 + (pn(u * 40, v * 40, 40, 40, 23) - 0.5) * 0.14;
      let L = 0.66 + m; const sp = ih(x, y, 77);
      if (sp > 0.955) L *= 0.45; else if (sp < 0.035) L = Math.min(1, L * 1.4); const warm = (pn(u * 7, v * 7, 7, 7, 24) - 0.5) * 0.08;
      return [L + warm, L, L - warm * 0.8];
    });
    const r = lcg(31);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = r() * w, y = r() * h, a = r() * TAU; g.strokeStyle = rgba(0.12, 0.12, 0.12, 0.55); g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * (8 + r() * 14); y += Math.sin(a) * (8 + r() * 14); g.lineTo(x, y); } g.stroke();
    }
    for (let i = 0; i < 12; i++) {                       // лишайник: россыпь точек, плотная в центре
      const cx = r() * w, cy = r() * h, rad = 5 + r() * 14, tone = r(), col = tone < 0.55 ? [0.7, 0.73, 0.54] : tone < 0.8 ? [0.76, 0.6, 0.3] : [0.82, 0.82, 0.76], n = (rad * rad * 0.7) | 0;
      wrap9(w, cx, cy, rad, (X, Y) => { for (let k = 0; k < n; k++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * rad * (0.7 + 0.5 * vn(Math.cos(a) * 2 + i, Math.sin(a) * 2, 5)); g.fillStyle = rgba(col[0] * (0.85 + r() * 0.25), col[1] * (0.85 + r() * 0.25), col[2] * (0.85 + r() * 0.25), 0.5 + r() * 0.4); const s = 1 + r() * 2.2; g.fillRect(X + Math.cos(a) * d, Y + Math.sin(a) * d, s, s); } });
    }
  });
  // пиломатериал: боковая/верхняя грань доски (волокна вдоль u; тайл 1 м по u, 0.2 м по v: швы между досками на краях v)
  TEXD.timberL = () => mkTex(256, 256, (g, w, h) => {
    pix(g, w, h, (x, y) => {
      const u = x / w, v = y / h, wp = (pn(u * 2, v * 3, 2, 3, 41) - 0.5) * 0.5, ln = pn(u * 3, v * 90 + wp * 90, 3, 90, 42), ring = Math.sin((v * 7 + wp * 3 + pn(u * 2, v * 2, 2, 2, 43) * 2) * PI * 2) * 0.5 + 0.5;
      let L = 0.86 + 0.1 * (ln - 0.5) + 0.07 * (ring - 0.5) + 0.05 * (pn(u * 40, v * 200, 40, 200, 44) - 0.5);
      const seam = Math.min(v, 1 - v) * h; if (seam < 1.6) L *= 0.28 + seam * 0.2;
      return [L, L * 0.89, L * 0.72];
    });
    const r = lcg(45); for (let i = 0; i < 2; i++) { const kx = r() * w, ky = (0.25 + r() * 0.5) * h; g.fillStyle = 'rgba(70,38,16,0.5)'; g.beginPath(); g.ellipse(kx, ky, 7 + r() * 7, 4 + r() * 3, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(70,38,16,0.3)'; g.lineWidth = 1; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(kx, ky, 7 + k * 6, 4 + k * 3, 0, 0, TAU); g.stroke(); } }
  });
  // торец доски 0.2 x 0.05 м: дуги годичных колец и зазоры по краям
  TEXD.timberE = () => mkTex(256, 64, (g, w, h) => {
    pix(g, w, h, (x, y) => {
      const cx = w * 0.5 + (ih(x >> 8, 3, 7) - 0.5) * 90, cy = h * (1.6 + 0.4 * ih(1, 2, 3)), d = Math.hypot(x - cx, (y - cy) * 1.0) / 5.2 + (vn(x * 0.03, y * 0.05, 3) - 0.5) * 1.4, t = d - Math.floor(d), late = sstep(0.45, 0.95, t);
      let L = 0.9 - 0.2 * late + 0.05 * (pn(x * 0.5, y * 0.5, 128, 32, 51) - 0.5); if (x < 2 || x > w - 3) L *= 0.25; else if (x < 4 || x > w - 5) L *= 0.7; if (y < 1.5) L *= 0.8;
      return [L, L * 0.86, L * 0.66];
    });
  });
  // щепа: чешуйки светлой и тёмной древесины
  TEXD.chips = () => mkTex(512, 512, (g, w, h) => {
    const r = lcg(61); g.fillStyle = '#7a5a34'; g.fillRect(0, 0, w, h);
    const cols = ['#cfae72', '#bf9558', '#a97c45', '#dcc088', '#8a6334', '#e6cf9a', '#9a6d3a', '#6f4d29', '#c9a468'];
    for (let i = 0; i < 4200; i++) { const x = r() * w, y = r() * h, cw = 5 + r() * 15, ch = 2.5 + r() * 6, a = r() * PI; wrap9(w, x, y, cw, (X, Y) => { g.save(); g.translate(X, Y); g.rotate(a); g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(-cw / 2, -ch / 2, cw, ch); g.fillStyle = 'rgba(40,24,10,0.3)'; g.fillRect(-cw / 2, ch / 2 - 1, cw, 1.2); g.restore(); }); }
    for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(30,18,8,0.4)'; g.fillRect(r() * w, r() * h, 3 + r() * 5, 2); }
  });

  // атлас листвы с альфой 1024x512: 8 ячеек по 256 (рисуется светлым, цвет задают вершинные цвета)
  //   0 дуб, 1 берёза, 2 ель (плоская лапа), 3 сосна (пучки хвои), 4 папоротник, 5 трава, 6 лещина/куст, 7 кислица/клевер
  const CELLS = 8;
  const cellUV = (c) => { const col = c % 4, row = (c / 4) | 0, e = 0.004; return [col * 0.25 + e, 1 - (row + 1) * 0.5 + e, 0.25 - 2 * e, 0.5 - 2 * e]; };
  TEXD.atlas = () => mkTex(1024, 512, (g, w, h) => {
    const S = 256, r = lcg(404);
    const cell = (c, fn) => { g.save(); g.translate((c % 4) * S, ((c / 4) | 0) * S); g.beginPath(); g.rect(2, 2, S - 4, S - 4); g.clip(); fn(); g.restore(); };
    const leafShape = (x, y, ang, len, wid, k, lobes, serr) => {
      g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); const N = 24, hw = [];
      for (let i = 0; i <= N; i++) { const t = i / N, bs = Math.sin(PI * Math.pow(t, 0.72)), md = lobes ? 0.7 + 0.3 * Math.cos(lobes * PI * t + 0.5) : 1, sr = serr ? 1 + 0.1 * (i % 2 ? 1 : -1) : 1; hw.push(wid * 0.5 * bs * md * sr); }
      for (let i = 0; i <= N; i++) g.lineTo(hw[i], -len * i / N); for (let i = N; i >= 0; i--) g.lineTo(-hw[i], -len * i / N); g.closePath();
      const gr = g.createLinearGradient(-wid / 2, 0, wid / 2, 0); gr.addColorStop(0, rgba(0.74 * k, 0.88 * k, 0.55 * k)); gr.addColorStop(0.5, rgba(0.9 * k, 1.0 * k, 0.72 * k)); gr.addColorStop(1, rgba(0.68 * k, 0.82 * k, 0.5 * k)); g.fillStyle = gr; g.fill();
      g.strokeStyle = rgba(0.45 * k, 0.6 * k, 0.32 * k, 0.55); g.lineWidth = 1; g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.9); g.strokeStyle = rgba(0.55 * k, 0.68 * k, 0.4 * k, 0.7); g.stroke();
      if (len > 40) { g.lineWidth = 0.8; for (let i = 1; i < 6; i++) { const t = i / 6.4; g.beginPath(); g.moveTo(0, -len * t); g.lineTo(hw[(t * N) | 0] * 0.8, -len * (t + 0.1)); g.moveTo(0, -len * t); g.lineTo(-hw[(t * N) | 0] * 0.8, -len * (t + 0.1)); g.stroke(); } }
      g.restore();
    };
    const twig = (x0, y0, x1, y1, bend, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); g.stroke(); };
    // плотный кусок кроны: n листьев веером от основания, нижние рисуются раньше (темнее)
    const mass = (n, lmin, lmax, wr, lobes, serr, spread, dmin, dmax, tw) => {
      const L = [];
      for (let i = 0; i < n; i++) { const ang = (r() - 0.5) * spread, dist = dmin + Math.pow(r(), 0.85) * (dmax - dmin), px = 128 + Math.sin(ang) * dist * 0.95, py = 252 - Math.cos(ang) * dist; L.push([px, py, ang + (r() - 0.5) * 1.3, lmin + r() * (lmax - lmin)]); }
      L.sort((p, q) => q[1] - p[1]);
      for (let i = 0; i < tw; i++) { const q = L[(i * 7 + 3) % L.length]; twig(128, 254, q[0], q[1] + 12, (r() - 0.5) * 20, 2.4, rgba(0.6, 0.54, 0.4)); }
      for (const [px, py, a, len] of L) { const k = 0.6 + 0.4 * (1 - py / 256) + (r() - 0.5) * 0.18; leafShape(px, py + len * 0.35, a, len, len * wr, k, lobes, serr); }
    };
    cell(0, () => mass(40, 54, 80, 0.62, 5, false, 2.8, 30, 195, 5));          // 0: дуб
    cell(1, () => mass(62, 34, 52, 0.7, 0, true, 3.0, 25, 200, 6));             // 1: берёза
    // 2: ель — плоская лапа: ось и боковые веточки с хвоей щёткой
    cell(2, () => {
      const rach = (t) => [128 + Math.sin(t * 2.4) * 4, 252 - t * 240];
      g.lineCap = 'round'; twig(128, 252, 128, 12, 3, 3, rgba(0.62, 0.58, 0.44));
      for (let i = 0; i < 26; i++) {
        const t = 0.04 + i / 26 * 0.9, [px, py] = rach(t), Ls = 118 * (1 - Math.pow(t, 1.15)) + 14;
        for (const sd of [-1, 1]) {
          const ex = px + sd * Ls, ey = py - Ls * 0.55; twig(px, py, ex, ey, sd * 4, 2.2, rgba(0.6, 0.56, 0.42));
          const nn = Math.max(5, (Ls / 4.2) | 0);
          for (let k = 0; k < nn; k++) { const q = (k + 0.5) / nn, bx = px + (ex - px) * q, by = py + (ey - py) * q, nl = 13 + r() * 6 - q * 3; for (const s2 of [-1, 1]) { const a = Math.atan2(ey - py, ex - px) + s2 * (1.05 + r() * 0.35), kk = 0.72 + r() * 0.32; g.strokeStyle = rgba(0.55 * kk, 0.78 * kk, 0.45 * kk, 0.97); g.lineWidth = 2.1; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * nl, by + Math.sin(a) * nl); g.stroke(); } }
        }
      }
    });
    // 3: сосна — пучки длинной хвои на ветке
    cell(3, () => {
      twig(128, 254, 128, 90, 4, 5, rgba(0.62, 0.52, 0.4));
      const nodes = [[128, 170, -0.3], [128, 120, 0.4], [128, 90, 0], [116, 150, -0.9], [142, 140, 0.9], [100, 190, -1.1], [156, 186, 1.1], [128, 215, 0.1]];
      for (const [x, y, a] of nodes) {
        twig(x > 128 ? 128 : x < 128 ? 128 : x, y + 24, x, y, 0, 2.5, rgba(0.6, 0.5, 0.38));
        for (let k = 0; k < 46; k++) { const aa = a + (r() - 0.5) * 2.3, len = 50 + r() * 34, kk = 0.7 + r() * 0.3; g.strokeStyle = rgba(0.6 * kk, 0.82 * kk, 0.5 * kk, 0.98); g.lineWidth = 1.7; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(aa) * len * 0.5, y - Math.cos(aa) * len * 0.5 + 6, x + Math.sin(aa) * len, y - Math.cos(aa) * len + 12); g.stroke(); }
      }
    });
    // 4: папоротник — дважды перистая вайя
    cell(4, () => {
      const ax = (t) => 128 + Math.sin(t * 2.6 - 0.4) * 9 + t * 8, ay = (t) => 252 - t * 238;
      twig(ax(0), ay(0), ax(1), ay(1), 0, 3, rgba(0.58, 0.6, 0.42)); g.strokeStyle = rgba(0.58, 0.62, 0.42); g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24; if (i) g.lineTo(ax(t), ay(t)); else g.moveTo(ax(t), ay(t)); } g.stroke();
      for (let i = 0; i < 24; i++) {
        const t = 0.1 + i / 24 * 0.88, L = 66 * Math.pow(Math.sin(PI * (t * 0.95 + 0.03)), 0.65) + 8;
        for (const sd of [-1, 1]) { const a = sd * (1.1 - 0.12 * t) * 1.0; leafShape(ax(t), ay(t), a + sd * 0.0, L, Math.max(9, L * 0.22), 0.8 + r() * 0.24, 6, true); }
      }
      leafShape(ax(1), ay(1), 0.0, 22, 9, 0.9, 0, true);
    });
    // 5: трава — пучок изогнутых лезвий
    cell(5, () => {
      for (let i = 0; i < 17; i++) {
        const bx = 128 + (r() - 0.5) * 64, L = 110 + r() * 125, dx = (r() - 0.5) * 120, k = 0.74 + r() * 0.3, wd = 7 + r() * 4;
        g.beginPath(); g.moveTo(bx - wd / 2, 254); g.quadraticCurveTo(bx - wd * 0.35 + dx * 0.15, 254 - L * 0.55, bx + dx, 254 - L); g.quadraticCurveTo(bx + wd * 0.35 + dx * 0.15 + 2, 254 - L * 0.55, bx + wd / 2, 254); g.closePath();
        const gr = g.createLinearGradient(0, 254, 0, 254 - L); gr.addColorStop(0, rgba(0.6 * k, 0.74 * k, 0.4 * k)); gr.addColorStop(1, rgba(0.92 * k, 0.98 * k, 0.6 * k)); g.fillStyle = gr; g.fill();
      }
    });
    cell(6, () => mass(24, 56, 82, 0.88, 0, true, 2.8, 30, 180, 4));            // 6: куст (лещина)
    // 7: кислица/клевер — гроздь трёхраздельных листиков на тонких черешках
    cell(7, () => {
      for (let i = 0; i < 11; i++) {
        const a = (r() - 0.5) * 2.0, L = 90 + r() * 80, x0 = 128 + (r() - 0.5) * 20, ex = x0 + Math.sin(a) * L * 0.7, ey = 250 - Math.cos(a) * L; twig(x0, 252, ex, ey, 0, 1.6, rgba(0.6, 0.66, 0.42));
        const k = 0.78 + r() * 0.26, rad = 21 + r() * 7; for (let j = 0; j < 3; j++) { const b = j / 3 * TAU + a * 2; g.beginPath(); g.ellipse(ex + Math.cos(b) * rad * 0.62, ey + Math.sin(b) * rad * 0.62, rad * 0.62, rad * 0.48, b + PI / 2, 0, TAU); g.fillStyle = rgba(0.72 * k, 0.88 * k, 0.52 * k); g.fill(); g.strokeStyle = rgba(0.45 * k, 0.6 * k, 0.32 * k, 0.6); g.lineWidth = 1; g.stroke(); }
      }
    });
  }, 8);

  // ====================================================================== материалы (все с вершинными цветами; стекло — отдельный прозрачный)
  const _mats = {};
  const std = (o) => new T.MeshStandardMaterial(Object.assign({ vertexColors: true, metalness: 0, roughness: 0.9, envMapIntensity: 0.35 }, o));
  const MK = {
    bark: () => std({ map: TX('bark'), roughness: 0.97, envMapIntensity: 0.22 }),
    birch: () => std({ map: TX('birch'), roughness: 0.82, envMapIntensity: 0.3 }),
    end: () => std({ map: TX('end'), roughness: 0.88, envMapIntensity: 0.3 }),
    rock: () => std({ map: TX('rock'), roughness: 0.9, envMapIntensity: 0.4 }),
    chips: () => std({ map: TX('chips'), roughness: 0.96, envMapIntensity: 0.2 }),
    timberL: () => std({ map: TX('timberL'), roughness: 0.82, envMapIntensity: 0.3 }),
    timberE: () => std({ map: TX('timberE'), roughness: 0.86, envMapIntensity: 0.3 }),
    leaf: () => new T.MeshLambertMaterial({ vertexColors: true }),
    card: () => new T.MeshLambertMaterial({ vertexColors: true, map: TX('atlas'), alphaTest: 0.45 }),
    matte: () => std({ roughness: 0.92 }),
    paint: () => std({ metalness: 0.35, roughness: 0.42, envMapIntensity: 0.6 }),
    metal: () => std({ metalness: 0.85, roughness: 0.4, envMapIntensity: 0.85 }),
    rubber: () => std({ roughness: 0.96, envMapIntensity: 0.15 }),
    glass: () => C.glassM(0x8fb4c4),
  };
  function MAT(k) { if (!_mats[k]) { if (!MK[k]) throw new Error('forest: нет материала ' + k); _mats[k] = MK[k](); } return _mats[k]; }

  // ====================================================================== текстуры построек
  // гофролист: вертикальные волны (тайл 0.9 м по u, 1.8 м по v), винты по гребням, потёки; цвет — вершинным цветом
  TEXD.corrug = () => mkTex(512, 512, (g, w, h) => {
    pix(g, w, h, (x, y) => {
      const u = x / w, v = y / h, wave = Math.sin(TAU * 12 * u), spec = Math.pow(Math.max(0, Math.cos(TAU * 12 * u + 0.6)), 6) * 0.14;
      const streak = pn(u * 70, v * 2.5, 70, 3, 61), dirt = pn(u * 5, v * 3, 5, 3, 62), grime = sstep(0.55, 0.9, streak) * 0.2 * (0.5 + v * 0.7);
      let L = 0.72 + 0.2 * wave + spec - grime + 0.1 * (dirt - 0.5) + 0.05 * (pn(u * 200, v * 60, 200, 60, 63) - 0.5);
      const rust = sstep(0.72, 0.95, pn(u * 9, v * 6, 9, 6, 64)) * 0.5; return [L * (1 + rust * 0.45), L * (1 - rust * 0.15), L * (1 - rust * 0.55)];
    });
    g.fillStyle = 'rgba(40,40,44,0.7)';
    for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) { const cx = (i + 0.25) / 12 * w, cy = (row + 0.5) / 4 * h; g.beginPath(); g.arc(cx, cy, 1.9, 0, TAU); g.fill(); }
  });
  // бетон: швы, пятна масла, трещины (тайл 3 м)
  TEXD.concrete = () => mkTex(512, 512, (g, w, h) => {
    pix(g, w, h, (x, y) => {
      const u = x / w, v = y / h, L = 0.62 + 0.12 * (pn(u * 4, v * 4, 4, 4, 71) - 0.5) + 0.08 * (pn(u * 16, v * 16, 16, 16, 72) - 0.5) + 0.07 * (pn(u * 90, v * 90, 90, 90, 73) - 0.5), oil = sstep(0.72, 0.9, pn(u * 3, v * 3, 3, 3, 74)) * 0.18;
      let k = L - oil; const e = Math.min(Math.min(x, w - x), Math.min(y, h - y)); if (e < 2) k *= 0.45; else if (e < 5) k *= 0.8; return [k, k * 0.99, k * 0.96];
    });
    const r = lcg(75); g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { let x = r() * w, y = r() * h, a = r() * TAU; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 10; y += Math.sin(a) * 10; g.lineTo(x, y); } g.stroke(); }
  });
  // вагонка: горизонтальные доски (тайл 1.2 м, 8 досок)
  TEXD.clap = () => mkTex(256, 256, (g, w, h) => {
    pix(g, w, h, (x, y) => {
      const u = x / w, v = y / h, b = v * 8, f = b - Math.floor(b), id = Math.floor(b), grain = pn(u * 6, v * 120, 6, 120, 81 + id), L = 0.88 + 0.08 * (ih(id, 5, 5) - 0.5) + 0.06 * (grain - 0.5);
      let k = L * (f < 0.1 ? 0.55 + f * 4.5 : f > 0.9 ? 1.0 : 1.0 - (f - 0.1) * 0.12); if (f > 0.96) k *= 0.5; return [k, k, k * 0.98];
    });
  });
  // дранка: ряды деревянных плиток (тайл 1 м: 8 рядов)
  TEXD.shingle = () => mkTex(512, 512, (g, w, h) => {
    const r = lcg(91); g.fillStyle = '#2a2018'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let row = rows - 1; row >= 0; row--) {
      let x = -(r() * 30); const y0 = row * rh;
      while (x < w) {
        const sw = 24 + r() * 22, L = 0.52 + r() * 0.3, warm = r(), wx = Math.max(-1, x), cw = Math.min(sw, w - wx);
        const gr = g.createLinearGradient(0, y0, 0, y0 + rh * 1.35); gr.addColorStop(0, rgba(L * 0.7, L * 0.62 * (0.9 + warm * 0.1), L * 0.52)); gr.addColorStop(0.7, rgba(L, L * 0.9, L * 0.76)); gr.addColorStop(1, rgba(L * 0.5, L * 0.45, L * 0.38));
        g.fillStyle = gr; g.beginPath(); g.moveTo(wx + 1, y0 - rh * 0.4); g.lineTo(wx + cw - 1, y0 - rh * 0.4); g.lineTo(wx + cw - 1, y0 + rh * 1.08 + (r() - 0.5) * 3); g.lineTo(wx + cw * 0.5, y0 + rh * 1.16 + (r() - 0.5) * 3); g.lineTo(wx + 1, y0 + rh * 1.06 + (r() - 0.5) * 3); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(20,14,8,0.5)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { const gx = wx + 3 + r() * (cw - 6); g.beginPath(); g.moveTo(gx, y0); g.lineTo(gx + (r() - 0.5) * 2, y0 + rh); g.stroke(); }
        x += sw;
      }
    }
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rad = 6 + r() * 16; wrap9(w, x, y, rad, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, 'rgba(70,92,40,0.55)'); gr.addColorStop(1, 'rgba(70,92,40,0)'); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); }); }
  });
  // полевой камень: кладка из окатышей (тайл 1 м), раствор тёмный
  TEXD.stone = () => mkTex(512, 512, (g, w, h) => {
    const N = 5, pts = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.2 + 0.6 * ih(i, j, 101)) / N, (j + 0.2 + 0.6 * ih(i, j, 102)) / N, 0.38 + 0.4 * ih(i, j, 103), ih(i, j, 104)]);
    pix(g, w, h, (x, y) => {
      const u = x / w, v = y / h; let d1 = 9, d2 = 9, id = 0, cx = 0, cy = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ci = ((Math.floor(u * N) + i) % N + N) % N, cj = ((Math.floor(v * N) + j) % N + N) % N, p = pts[cj * N + ci], px = p[0] + Math.floor(u * N + i - ci) / N * 0 + (Math.floor(u * N) + i - ci) / N, py = p[1] + (Math.floor(v * N) + j - cj) / N, d = Math.hypot((u - px) * N, (v - py) * N * (0.8 + 0.4 * p[3]));
        if (d < d1) { d2 = d1; d1 = d; id = cj * N + ci; cx = px; cy = py; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1, p = pts[id], L = p[2] + 0.1 * (pn(u * 30, v * 30, 30, 30, 105) - 0.5) + 0.06 * (pn(u * 120, v * 120, 120, 120, 106) - 0.5), shade = 1.0 - 0.28 * Math.min(1, d1 * 1.4) + ((cy - v) * 0.5);
      const tint = p[3]; if (edge < 0.07) return [0.12, 0.11, 0.1]; const k = L * shade; return [k * (0.95 + tint * 0.12), k * (0.93 + tint * 0.04), k * (0.9 - tint * 0.08)];
    });
  });
  // колотые дрова: торцы поленьев в штабеле (тайл 0.5 м)
  TEXD.firewood = () => mkTex(256, 256, (g, w, h) => {
    const r = lcg(111); g.fillStyle = '#17110b'; g.fillRect(0, 0, w, h);
    const draw = (cx, cy, rad, sd) => {
      wrap9(w, cx, cy, rad, (X, Y) => {
        const q = r(), wedge = q < 0.5, a0 = r() * TAU;
        g.beginPath(); if (wedge) { const sp = 1.7 + r() * 1.4; g.moveTo(X, Y); g.arc(X, Y, rad, a0, a0 + sp); g.closePath(); } else g.ellipse(X, Y, rad, rad * (0.85 + r() * 0.15), a0, 0, TAU);
        const L = 0.7 + r() * 0.25; g.fillStyle = rgba(0.82 * L, 0.66 * L, 0.45 * L); g.fill();
        g.save(); g.clip(); g.strokeStyle = rgba(0.5 * L, 0.34 * L, 0.2 * L, 0.7); g.lineWidth = 1.1; const ox = X + (r() - 0.5) * rad * 0.4, oy = Y + (r() - 0.5) * rad * 0.4; for (let k = 3; k < rad + 12; k += 4.2) { g.beginPath(); g.arc(ox, oy, k, 0, TAU); g.stroke(); } g.restore();
        g.strokeStyle = rgba(0.22, 0.15, 0.1); g.lineWidth = 3; g.beginPath(); if (wedge) { g.arc(X, Y, rad - 1, a0, a0 + 1.7); } else g.ellipse(X, Y, rad - 1, rad * 0.9, a0, 0, TAU); g.stroke();
      });
    };
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) draw((i + 0.5 + (j % 2) * 0.25 + (r() - 0.5) * 0.15) / 4 * w, (j + 0.5 + (r() - 0.5) * 0.15) / 4 * h, 24 + r() * 9);
  });
  const rgbaT = rgba;
  Object.assign(MK, {
    corrug: () => std({ map: TX('corrug'), metalness: 0.55, roughness: 0.46, envMapIntensity: 0.7 }),
    concrete: () => std({ map: TX('concrete'), roughness: 0.93, envMapIntensity: 0.2 }),
    clap: () => std({ map: TX('clap'), roughness: 0.86, envMapIntensity: 0.25 }),
    shingle: () => std({ map: TX('shingle'), roughness: 0.94, envMapIntensity: 0.2 }),
    stone: () => std({ map: TX('stone'), roughness: 0.95, envMapIntensity: 0.25 }),
    firewood: () => std({ map: TX('firewood'), roughness: 0.92, envMapIntensity: 0.2 }),
  });

  // ====================================================================== общие вспомогательные геометрии: диск-торец, четырёхугольник, лента-вайя, брус
  /** Диск, обращённый в nrm, с uv-кругом (cx,cy,rr) и поворотом rot; seg сторон. Нормаль плоская. */
  function disc(p, nrm, rad, seg, cx, cy, rr, rot, wob, sd) {
    const n = nrm.clone().normalize(), a0 = Math.abs(n.y) < 0.9 ? UPV : V3(1, 0, 0), u = a0.clone().cross(n).normalize(), v = n.clone().cross(u), pos = [p.x, p.y, p.z], nor = [n.x, n.y, n.z], uv = [cx, cy], idx = [];
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * TAU, ca = Math.cos(a), sa = Math.sin(a), k = wob ? 1 + wob * (vn(ca * 2 + (sd || 0), sa * 2, 4.1) - 0.5) : 1;
      pos.push(p.x + (u.x * ca + v.x * sa) * rad * k, p.y + (u.y * ca + v.y * sa) * rad * k, p.z + (u.z * ca + v.z * sa) * rad * k); nor.push(n.x, n.y, n.z); uv.push(cx + Math.cos(a + (rot || 0)) * rr, cy + Math.sin(a + (rot || 0)) * rr);
    }
    for (let j = 0; j < seg; j++) idx.push(0, 1 + j, 2 + j);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  }
  /** Четырёхугольник по 4 точкам (против часовой снаружи) с uv; плоская нормаль (или nrm). */
  function quadG(a, b, c, d, uva, uvb, uvc, uvd, nrm) {
    const n = nrm || b.clone().sub(a).cross(d.clone().sub(a)).normalize(), pos = [], nor = [], uv = [];
    for (const [p, q] of [[a, uva], [b, uvb], [c, uvc], [d, uvd]]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(q[0], q[1]); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 2, 0, 2, 3]); return g;
  }
  /** Брус-коробка x0..x1, y0..y1, z0..z1 с «бочковым» uv: ключ материала key, uvk(face, w, h) -> [u0,v0,su,sv]. faces: строка из 'tbfbrl...' не нужна — рисуем все, кроме низа (если noBottom). */
  function boxUV(B, key, x0, y0, z0, x1, y1, z1, col, uvf, skip) {
    skip = skip || '';
    const P = (x, y, z) => V3(x, y, z), w = x1 - x0, h = y1 - y0, d = z1 - z0, add = (f, a, b, c, dd, W, H) => { if (skip.indexOf(f) >= 0) return; const t = uvf ? uvf(f, W, H) : [0, 0, W, H]; B.add(key, quadG(a, b, c, dd, [t[0], t[1]], [t[0] + t[2], t[1]], [t[0] + t[2], t[1] + t[3]], [t[0], t[1] + t[3]]), { col }); };
    add('t', P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), w, d);
    add('b', P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), w, d);
    add('f', P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), w, h);
    add('k', P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), w, h);
    add('r', P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), d, h);
    add('l', P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), d, h);
  }
  /** Изогнутая лента-вайя (папоротник, трава): n сегментов, база base, горизонтальное направление dir (единичное), длина len, ширина wid, изгиб droop (0..1.5). Двойная. */
  function frondG(cell, base, dir, len, wid, rise, droop, nrmUp, c0, c1, n) {
    n = n || 4; const uv = cellUV(cell), side = V3(-dir.z, 0, dir.x), pts = [], pos = [], nor = [], col = [], tuv = [], idx = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(base.clone().addScaledVector(dir, len * t * (0.5 + 0.5 * Math.sin(t * PI * 0.5 + 0.0)) * (1 - 0.3 * droop * t)).add(V3(0, len * (rise * t - droop * 0.55 * t * t), 0))); }
    const nn = V3(0, 1, 0).multiplyScalar(nrmUp).addScaledVector(dir, 0.3).normalize();
    for (let s = 0; s < 2; s++) for (let i = 0; i <= n; i++) {
      const t = i / n, w = wid * 0.5 * (1 - 0.12 * t), cc = mixc(c0, c1, t);
      for (const sg of [-1, 1]) { const q = pts[i].clone().addScaledVector(side, sg * w); pos.push(q.x, q.y, q.z); nor.push(nn.x, nn.y, nn.z); col.push(cc[0], cc[1], cc[2]); tuv.push(uv[0] + (sg < 0 ? 0 : uv[2]), uv[1] + uv[3] * t); }
    }
    const m = (n + 1) * 2;
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); const b = m + i * 2; idx.push(b, b + 3, b + 1, b, b + 2, b + 3); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(tuv, 2)); g.setIndex(idx); return g;
  }

  // ====================================================================== растительность: карточки листвы, ветви, кроны
  const ROOTC = { oak: [0.3, 0.25, 0.2], pine: [0.34, 0.24, 0.17], birch: [0.8, 0.79, 0.74] };
  const SPC = {                                    // цвета кроны (итог = цвет вершины * светлая текстура атласа)
    oak: { dark: [0.2, 0.38, 0.12], light: [0.5, 0.7, 0.26], coreD: [0.1, 0.2, 0.07], coreL: [0.2, 0.34, 0.1], bark: [0.34, 0.27, 0.2] },
    pine: { dark: [0.12, 0.28, 0.15], light: [0.36, 0.58, 0.27], coreD: [0.06, 0.15, 0.08], coreL: [0.12, 0.26, 0.12], bark: [0.3, 0.22, 0.15] },
    birch: { dark: [0.34, 0.54, 0.14], light: [0.7, 0.86, 0.3], coreD: [0.22, 0.36, 0.09], coreL: [0.36, 0.5, 0.15], bark: [0.86, 0.85, 0.8] },
  };
  /** Карточка листвы (две встречные грани, одна нормаль — мягкий объёмный свет). base — точка основания, ax — вдоль роста, sd — вширь. */
  function cardGeo(cell, base, ax, sd, w, h, nrm, c0, c1, fl) {
    const uv = cellUV(cell), pos = [], nor = [], col = [], tuv = [], idx = [];
    const A = base.clone().addScaledVector(sd, -w / 2), Bp = base.clone().addScaledVector(sd, w / 2), Cc = Bp.clone().addScaledVector(ax, h), D = A.clone().addScaledVector(ax, h), V = [A, Bp, Cc, D], U = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let s = 0; s < 2; s++) for (let k = 0; k < 4; k++) { pos.push(V[k].x, fl == null ? V[k].y : Math.max(V[k].y, fl), V[k].z); nor.push(nrm.x, nrm.y, nrm.z); const c = k < 2 ? c0 : c1; col.push(c[0], c[1], c[2]); tuv.push(uv[0] + U[k][0] * uv[2], uv[1] + U[k][1] * uv[3]); }
    idx.push(0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(tuv, 2)); g.setIndex(idx); return g;
  }
  /** Облако карточек в эллипсоиде c (Vector3) радиусами rad [rx,ry,rz]. cw, ch — размер карточки. o.axis — склонение осей (по умолчанию чуть вверх), o.shell — доля у поверхности. */
  function cluster(B, r, c, rad, n, cell, cw, ch, dark, light, o) {
    o = o || {}; const bias = o.axis || V3(0, 0.35, 0), upN = o.nup == null ? 0.35 : o.nup;
    for (let i = 0; i < n; i++) {
      const yy = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - yy * yy), d = V3(q * Math.cos(a), yy, q * Math.sin(a)), k = (o.inner == null ? 0.5 : o.inner) + (1 - (o.inner == null ? 0.5 : o.inner)) * Math.sqrt(r());
      const p = V3(c.x + d.x * rad[0] * k, c.y + d.y * rad[1] * k, c.z + d.z * rad[2] * k), nrm = d.clone().multiplyScalar(0.8).add(V3(0, upN, 0)).normalize();
      const t = V3(r() - 0.5, r() - 0.5, r() - 0.5).add(bias); t.addScaledVector(nrm, -t.dot(nrm)); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).addScaledVector(nrm, -nrm.x); t.normalize();
      const sd = t.clone().cross(nrm).normalize(), w = cw * (0.75 + 0.5 * r()), h = ch * (0.75 + 0.5 * r()), base = p.clone().addScaledVector(t, -h * 0.4), tt = clamp(0.5 + 0.5 * d.y * k + (r() - 0.5) * 0.55, 0, 1), c1 = mixc(dark, light, tt);
      B.add('card', cardGeo(cell, base, t, sd, w, h, nrm, mulc(c1, 0.8), c1, o.floor), { ao: 0 });
    }
  }
  /** Тёмное ядро кроны: смещённый шар с вершинным градиентом. */
  function coreBlob(B, r, x, y, z, rx, ry, rz, dark, light, sd, det) {
    const g = blob(rx, ry, rz, { detail: det == null ? 2 : det, amp: 0.26, sd: sd || 0 });
    B.add('leaf', g, { m: MX(x, y, z, r() * 6, r() * 6, r() * 6), col: (px, py, pz, nx, ny) => mixc(dark, light, clamp(0.45 + 0.35 * ny + 0.3 * (py - y) / Math.max(ry, 0.01) + 0.3 * (fbm(px * 2.2, py * 2.2, pz * 2.2, 2) - 0.5), 0, 1)) });
  }
  /** Ветвь-трубка с изгибом, провисанием, радиусом r0 -> r1; возвращает {pts, tip, d}. */
  function limb(B, key, p0, dir, len, r0, r1, o) {
    o = o || {}; const n = o.n || 5, rg = o.rng, d = dir.clone().normalize(), pts = [p0.clone()]; let p = p0.clone();
    for (let i = 1; i <= n; i++) {
      if (rg) d.add(V3((rg() - 0.5) * (o.wob || 0.2), (rg() - 0.5) * (o.wob || 0.2) * 0.6, (rg() - 0.5) * (o.wob || 0.2)));
      d.y += ((o.up || 0) - (o.sag || 0)) / n; d.normalize(); p = p.clone().addScaledVector(d, len / n); if (o.floor != null) p.y = Math.max(p.y, o.floor + r1); pts.push(p);
    }
    const g = tube(pts, (t) => lerp(r0, r1, Math.pow(t, o.pw || 1)), o.seg || 5, { uRep: o.uRep || Math.max(1, Math.round(TAU * r0 / 0.35)), vRep: o.vRep || 0.83, cap0: o.cap0, cap1: o.cap1, wob: o.tw });
    B.add(key, g, { col: o.col, m: o.m }); return { pts, tip: p, d };
  }
  const sph3 = (r) => { const y = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - y * y); return V3(q * Math.cos(a), y, q * Math.sin(a)); };
  /** Колышек-подвязка для саженца (лёгкое дерево, на leaf-материале с вершинным цветом). */
  function stake(B, x, z, h) { B.cyl('leaf', x, h / 2, z, 0.014, 0.018, h, 6, [0.55, 0.42, 0.26], 0.03, 0, 0.02); B.cyl('leaf', x, h * 0.62, z, 0.024, 0.024, 0.03, 6, [0.2, 0.3, 0.45], 0, 0, 0); }
  /** Пучок травы у основания: несколько карточек (ячейка 5). */
  function tuft(B, r, x, z, s, tone) {
    for (let i = 0; i < 3; i++) { const a = r() * TAU + i * 2.1, nrm = V3(Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5).normalize(), sd = V3(Math.cos(a + PI / 2), 0, Math.sin(a + PI / 2)), ax = V3(Math.cos(a) * 0.18, 1, Math.sin(a) * 0.18).normalize(), c1 = mixc([0.45, 0.5, 0.2], tone || [0.65, 0.72, 0.3], r()); B.add('card', cardGeo(5, V3(x, -0.01, z), ax, sd, s * (0.9 + 0.3 * r()), s * (0.8 + 0.4 * r()), nrm, mulc(c1, 0.7), c1), { ao: 0 }); }
  }

  // ---------------------------------------------------------------- молодое дерево: stage 0 саженец, 1 молодое, 2 почти взрослое; variant 0 дуб, 1 сосна/ель, 2 берёза
  function oakYoung(B, r, st) {
    const H = [1.15, 3.2, 5.6][st], tr = [0.012, 0.05, 0.12][st], sp = SPC.oak, lean = (r() - 0.5) * (st ? 0.2 : 0.1) * H, key = st ? 'bark' : 'leaf';
    const tp = (t) => V3(lean * t * t + Math.sin(t * 3 + 1) * 0.02 * H, H * 0.74 * t - 0.03, Math.sin(t * 2.2) * 0.025 * H), pts = []; for (let i = 0; i <= 8; i++) pts.push(tp(i / 8));
    const bk = st ? [0.66, 0.6, 0.54] : sp.bark;
    B.add(key, tube(pts, (t) => tr * (0.5 + 1.0 * Math.exp(-t * 7.5)) * (1 - t * 0.35), 8, { uRep: Math.max(1, Math.round(TAU * tr / 0.35)), vRep: 0.83, wob: 0.18 }), { col: bk });
    const top = pts[8], nB = [3, 6, 9][st], br = [0.4, 1.0, 1.7][st];
    const crownC = V3(top.x * 0.9, H * [0.8, 0.72, 0.7][st], top.z), rad = [[0.36, 0.3, 0.36], [0.95, 0.85, 0.95], [1.5, 1.3, 1.5]][st];
    if (st >= 1) coreBlob(B, r, crownC.x, crownC.y - 0.05, crownC.z, rad[0] * 0.5, rad[1] * 0.45, rad[2] * 0.5, sp.coreD, sp.coreL, 1, 2);
    for (let i = 0; i < nB; i++) {
      const t = 0.34 + 0.6 * (i + r() * 0.5) / nB, a = i * 2.4 + r() * 0.7, p0 = tp(t), el = 0.4 + r() * 0.5, dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), L = br * (0.55 + 0.6 * r()) * (1.15 - 0.45 * t);
      const lm = limb(B, key, p0, dir, L, tr * (0.5 - t * 0.2) * (1 + (st ? 0.2 : 0)), tr * 0.12 + 0.002, { rng: r, seg: 5, wob: 0.25, up: 0.15, n: 4, col: bk });
      if (st === 2 && i % 2 === 0) coreBlob(B, r, lm.tip.x, lm.tip.y + 0.1, lm.tip.z, 0.34 + r() * 0.1, 0.28, 0.34 + r() * 0.1, sp.coreD, sp.coreL, i, 2);
      cluster(B, r, V3(lm.tip.x, lm.tip.y + 0.1 * st, lm.tip.z), [rad[0] * 0.5, rad[1] * 0.45, rad[2] * 0.5], [3, 7, 10][st], 0, [0.4, 0.8, 1.1][st], [0.4, 0.8, 1.1][st], sp.dark, sp.light);
    }
    cluster(B, r, crownC, rad, [6, 22, 44][st], 0, [0.42, 0.85, 1.15][st], [0.42, 0.85, 1.15][st], sp.dark, sp.light, { inner: 0.55 });
    if (st === 0) stake(B, 0.17, 0.05, 0.95); tuft(B, r, 0.05, -0.1, [0.3, 0.45, 0.6][st]);
  }
  function pineYoung(B, r, st) {
    const H = [1.0, 3.3, 6.0][st], tr = [0.012, 0.045, 0.1][st], sp = SPC.pine, nW = [3, 7, 12][st], Lmax = [0.42, 1.0, 1.55][st], per = [4, 5, 6][st], lean = (r() - 0.5) * 0.05 * H;
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V3(lean * t, H * t - 0.03, 0)); }
    B.add(st ? 'bark' : 'leaf', tube(pts, (t) => tr * (1.5 - 1.4 * t) * (1 + 0.5 * Math.exp(-t * 12)) + 0.003, 8, { uRep: Math.max(1, Math.round(TAU * tr / 0.35)), vRep: 0.83 }), { col: st ? [0.68, 0.55, 0.46] : sp.bark });
    for (let k = 0; k < nW; k++) {
      const t = 0.14 + 0.82 * k / (nW - 1), y = H * t, L = Lmax * (1 - Math.pow(t, 1.05)) * (0.9 + 0.2 * r()) + 0.14, off = k * 0.9 + r();
      const cr = L * 0.5, ch = H * 0.14 + 0.12; B.add('leaf', gcache('cone10', () => new T.ConeGeometry(1, 1, 10, 1, true)), { m: MX(lean * t, y - ch * 0.2, 0, 0, off, 0, cr, ch, cr), col: (px, py) => mixc(sp.coreD, sp.coreL, clamp((py - y) / ch + 0.5, 0, 1) * 0.6) });
      for (let i = 0; i < per; i++) {
        const a = off + i / per * TAU + (r() - 0.5) * 0.5, el = lerp(-0.4, 0.3, t) + (r() - 0.5) * 0.2, dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), p0 = V3(lean * t, y, 0);
        const lm = limb(B, 'leaf', p0, dir, L * 0.7, 0.012 + tr * 0.25, 0.005, { rng: r, seg: 4, wob: 0.12, sag: 0.35 * (1 - t) + 0.1, n: 3, col: [0.2, 0.18, 0.1], pw: 0.8 });
        for (let c = 0; c < 3; c++) {
          const yaw = (c - 1) * 0.45 + (r() - 0.5) * 0.3, cs = Math.cos(yaw), sn = Math.sin(yaw), bd = lm.d.clone(); bd.set(bd.x * cs - bd.z * sn, bd.y, bd.x * sn + bd.z * cs);
          const ax = bd.add(V3(0, -0.12 - 0.12 * r() + (c === 1 ? 0.12 : 0), 0)).normalize(), base = p0.clone().lerp(lm.tip, 0.18), nrm = V3(0, 1, 0).addScaledVector(V3(dir.x, 0, dir.z), 0.5).normalize();
          const t2 = ax.clone().addScaledVector(nrm, -ax.dot(nrm)).normalize(), sd = t2.clone().cross(nrm).normalize(), sz = L * (c === 1 ? 1.35 : 1.15) + 0.2, wd = sz * (0.8 + 0.3 * r()), c1 = mixc(sp.dark, sp.light, clamp(t * 0.6 + r() * 0.45, 0, 1));
          B.add('card', cardGeo(2, base, t2, sd, wd, sz, nrm, mulc(c1, 0.66), mulc(c1, 1.05)), { ao: 0 });
        }
      }
    }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, nrm = V3(Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5).normalize(), ax = V3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(), sd = V3(-Math.sin(a), 0, Math.cos(a)); B.add('card', cardGeo(2, V3(lean, H - 0.3 - st * 0.12, 0), ax, sd, 0.3 + st * 0.14, 0.45 + st * 0.2, nrm, mulc(sp.dark, 1), sp.light), { ao: 0 }); }
    if (st === 0) stake(B, 0.16, 0.05, 0.8); tuft(B, r, 0.04, -0.08, [0.3, 0.45, 0.6][st]);
  }
  function birchYoung(B, r, st) {
    const H = [1.25, 3.7, 6.3][st], tr = [0.012, 0.04, 0.085][st], sp = SPC.birch, nB = [4, 8, 12][st], lean = (r() - 0.5) * 0.12 * H, tp = (t) => V3(lean * t * t + Math.sin(t * 4) * 0.025 * H, H * 0.86 * t - 0.03, Math.cos(t * 3) * 0.02 * H), pts = [];
    for (let i = 0; i <= 9; i++) pts.push(tp(i / 9));
    const rep = Math.max(1, Math.round(TAU * tr / 0.5));
    B.add('birch', tube(pts, (t) => tr * (1 - 0.72 * t) * (1 + 0.5 * Math.exp(-t * 14)) + 0.003, 8, { uRep: rep, vRep: 1 / 0.5, wob: 0.12 }), { col: (x, y) => mulc([0.97, 0.96, 0.94], y < 0.25 ? 0.45 + 0.55 * sstep(0.0, 0.25, y) : 1) });
    const crownR = [0.4, 0.9, 1.25][st], crownH = [0.55, 1.5, 2.3][st], cen = V3(tp(0.85).x, H * 0.82, tp(0.85).z), cs = [0.42, 0.75, 1.0][st];
    if (st >= 1) coreBlob(B, r, cen.x, cen.y, cen.z, crownR * 0.42, crownH * 0.3, crownR * 0.42, sp.coreD, sp.coreL, 3, 2);
    for (let i = 0; i < nB; i++) {
      const t = 0.3 + 0.62 * (i + r() * 0.6) / nB, a = i * 2.4 + r() * 0.8, el = 0.3 + r() * 0.5, p0 = tp(t), dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), L = [0.36, 0.95, 1.5][st] * (0.6 + 0.6 * r()) * (1.15 - 0.5 * t);
      const lm = limb(B, 'birch', p0, dir, L, tr * 0.35 + 0.004, 0.004, { rng: r, seg: 5, wob: 0.18, sag: 0.4, n: 4, uRep: 1, vRep: 2, col: [0.9, 0.89, 0.86] });
      cluster(B, r, V3(lm.tip.x, lm.tip.y - 0.1 * st, lm.tip.z), [crownR * 0.5, crownH * 0.25, crownR * 0.5], [3, 6, 9][st], 1, cs, cs, sp.dark, sp.light, { axis: V3(0, -0.8, 0), nup: 0.5 });
    }
    cluster(B, r, cen, [crownR, crownH * 0.5, crownR], [5, 18, 34][st], 1, cs, cs, sp.dark, sp.light, { axis: V3(0, -0.8, 0), inner: 0.5, nup: 0.5 });
    if (st === 0) stake(B, 0.16, 0.05, 1.0); tuft(B, r, 0.05, -0.1, [0.3, 0.45, 0.6][st]);
  }
  reg('forest', 'young', (o) => {
    const B = new Bld(), r = lcg(300 + o.variant * 77 + o.stage * 13 + o.seed * 5), v = Math.min(2, o.variant), st = o.stage;
    (v === 1 ? pineYoung : v === 2 ? birchYoung : oakYoung)(B, r, st); return B.done();
  });

  // ====================================================================== пни
  const endCell = (c) => [(c % 2) * 0.5, 1 - ((c >> 1) + 1) * 0.5];
  const MOSSC = [0.15, 0.26, 0.08], MOSSL = [0.29, 0.4, 0.12], MOSSV = [0.2, 0.34, 0.11], MOSSVL = [0.34, 0.46, 0.16];
  /** Мох-подушка: приплюснутый комок, ось вдоль нормали n. */
  function mossPad(B, r, x, y, z, n, sz, dark, light) {
    const q0 = new T.Quaternion().setFromUnitVectors(UPV, n.clone().normalize()), cnt = 4 + ((sz * 24) | 0);
    for (let i = 0; i < cnt; i++) {            // клочок мха: несколько мелких бугров на диске
      const a = r() * TAU, d = Math.sqrt(r()) * sz * 0.9, s = sz * (0.3 + 0.35 * r()), g = blob(s, s * 0.55, s * (0.8 + 0.3 * r()), { detail: 0, amp: 0.4, sd: Math.floor(r() * 99) }), q = q0.clone().multiply(new T.Quaternion().setFromAxisAngle(UPV, r() * TAU));
      const off = V3(Math.cos(a) * d, 0, Math.sin(a) * d).applyQuaternion(q0);
      B.add('leaf', g, { m: new T.Matrix4().compose(V3(x + off.x, y + off.y, z + off.z), q, V3(1, 1, 1)), col: (px, py, pz, nx, ny, nz) => mixc(dark || MOSSC, light || MOSSL, clamp(0.35 + 0.5 * ny + 1.2 * (fbm(px * 18, py * 18, pz * 18, 2) - 0.5), 0, 1)) });
    }
  }
  function mushroom(B, x, y, z, s, cap, stem) {
    B.cyl('leaf', x, y + s * 0.55, z, s * 0.16, s * 0.2, s * 1.1, 6, stem || [0.84, 0.8, 0.7]);
    B.add('leaf', sphG(10, 6), { m: MX(x, y + s * 1.1, z, 0, 0, 0, s * 0.62, s * 0.34, s * 0.62), col: (px, py, pz, nx, ny) => mixc(cap, mulc(cap, 0.7), clamp(-ny + 0.4, 0, 1)) });
  }
  /** Грибы-трутовики на боку: полудиски, нормаль наружу. */
  function bracket(B, x, y, z, ang, s, col) {
    B.add('leaf', sphG(12, 6), { m: MX(x, y, z, 0, -ang, 0, s * 0.5, s * 0.1, s * 0.34), col: (px, py, pz, nx, ny) => mixc(col, mulc(col, 0.55), clamp(0.6 - ny, 0, 1)) });
  }
  function sprout(B, r, x, y, z, ang, L, cell, dark, light, tone) {
    const dir = V3(Math.cos(ang) * 0.35, 1, Math.sin(ang) * 0.35).normalize(), lm = limb(B, 'leaf', V3(x, y, z), dir, L, 0.012, 0.005, { rng: r, seg: 4, wob: 0.15, n: 4, col: tone || [0.4, 0.3, 0.2], sag: 0.1 });
    cluster(B, r, lm.tip.clone().add(V3(0, 0.05, 0)), [L * 0.3, L * 0.22, L * 0.3], 7, cell, L * 0.5, L * 0.5, dark, light, { inner: 0.4 });
  }
  /** Тело пня. c: R, H, flare, nRoots, reach, top(th, rho)->доп. высота, hollow(th,rho)->углубление, capR, cap (ячейка торца), tint(x,y,z,nx,ny,nz)->цвет коры, mat ('bark'|'birch'). Лопасти раструба совпадают с корнями. */
  function stumpBody(B, r, c) {
    const R = c.R, H = c.H, NU = c.nu || 32, NV = 11, sd = r() * 50, fh = c.fh || (0.26 * H + 0.05), mk = c.mat || 'bark', tile = mk === 'birch' ? 0.5 : 0.35, vt = mk === 'birch' ? 0.5 : 1.2, ra = [];
    for (let k = 0; k < c.nRoots; k++) ra.push(k / c.nRoots * TAU + (r() - 0.5) * 0.7 + 0.3);
    const sg = 0.3 + 0.9 / c.nRoots, lobe = (th) => { let m = 0; for (const a of ra) { const d = Math.abs((((th - a + PI) % TAU) + TAU) % TAU - PI); m = Math.max(m, Math.exp(-(d * d) / (sg * sg))); } return m; };
    const rad = (th, y) => {
      const fl = Math.exp(-Math.max(y, 0) / fh);
      return R * (1 + 0.06 * (1 - clamp(y / H, 0, 1)) + c.flare * fl * (0.18 + 1.35 * lobe(th))) * (1 + 0.05 * (vn(Math.cos(th) * 1.6 + sd, y * 2.4, Math.sin(th) * 1.6) - 0.5));
    };
    const ytop = (th, rho) => H + (c.top ? c.top(th, rho) : 0), uR = Math.max(1, Math.round(TAU * R * 1.15 / tile));
    const ys = []; for (let j = 0; j < NV; j++) { const s = j / (NV - 1); ys.push(-0.05 + (H + 0.05) * Math.pow(s, 1.55)); }
    const side = grid(NU, NV - 1, (i, j) => { const th = i / NU * TAU, y = j === NV - 1 ? ytop(th, 1) : ys[j], rr = rad(th, y); return [Math.cos(th) * rr, y, Math.sin(th) * rr]; }, (i, j) => [i / NU * uR, (ys[j] + 0.05) / vt]);
    B.add(mk, side, { col: c.tint });
    // торец: полярная сетка; центр может быть углублён (дупло)
    const K = 6, cell = endCell(c.cap || 0), capR = c.capR || 0.97, Rm = R * 1.04;
    const top = grid(NU, K, (i, k) => { const th = i / NU * TAU, rho = k / K, rr = rad(th, ytop(th, 1)) * rho, y = ytop(th, rho) - (c.hollow ? c.hollow(th, rho) : 0) + (k < K ? 0.004 * (vn(Math.cos(th) * 6 * rho + sd, rho * 4, Math.sin(th) * 6 * rho) - 0.5) : 0); return [Math.cos(th) * rr, y, Math.sin(th) * rr]; },
      (i, k) => { const th = i / NU * TAU, rho = k / K, rr = rad(th, ytop(th, 1)) * rho; return [cell[0] + 0.25 + Math.cos(th) * rr / Rm * capR * 0.2305, cell[1] + 0.25 - Math.sin(th) * rr / Rm * capR * 0.2305]; }, true);
    B.add('end', top, { col: c.topTint || [1, 1, 1], ao: 0 });
    // корни продолжают лопасти раструба и уходят в землю
    for (let k = 0; k < c.nRoots; k++) {
      const a = ra[k], ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca, rc = c.reach * (0.85 + 0.3 * r()), wob = (r() - 0.5) * 0.5, rw = 0.2 * (0.85 + 0.35 * r()), d0 = rad(a, 0.14 * H), dg = rad(a, 0);
      const prof = [[d0 * 0.9, 0.16 * H + 0.03, 1], [dg + 0.18 * R * rc, 0.075 * H + 0.02, 0.9], [dg + 0.55 * R * rc, 0.035, 0.72], [dg + 0.95 * R * rc, 0.0, 0.5], [dg + 1.35 * R * rc, -0.02, 0.22]], pts = [], rs = [];
      prof.forEach(([d, y, rr], i) => { const lat = wob * R * Math.sin(i / 4 * PI) * 0.9, rg = rw * R * rr; pts.push(V3(ca * d + px * lat, Math.max(y, 0.2 * rg - 0.02), sa * d + pz * lat)); rs.push(rg); });
      B.add(mk, tube(pts, rs, 8, { uRep: Math.max(1, Math.round(TAU * rw * R / tile)), vRep: 1 / vt, wob: 0.18, flat: 0.6 }), { col: c.tint });
    }
    return { rad, ytop };
  }
  function stump(o) {
    const B = new Bld(), r = lcg(500 + o.variant * 31 + o.seed * 7), v = Math.min(3, o.variant), nb = Math.floor(r() * 40);
    const tintBase = (bk, mossAmt, mossBias) => (x, y, z, nx, ny, nz) => {
      let t = mulc(bk, 0.82 + 0.35 * fbm(x * 6 + nb, y * 3, z * 6, 2)); if (mossAmt) { const m = sstep(0.42, 0.62, fbm(x * 2.6 + nb, y * 1.4, z * 2.6, 3) * 0.9 + 0.22 * ny + mossBias - y * 0.18); t = mixc(t, mixc(MOSSV, MOSSVL, fbm(x * 5, y * 5, z * 5, 2)), m * mossAmt); }
      return t;
    };
    if (v === 0) {         // дуб
      const R = 0.56, H = 0.6, b = stumpBody(B, r, { R, H, flare: 0.5, nRoots: 6, reach: 0.75, cap: 2, capR: 0.97, top: (th, rho) => 0.035 * Math.cos(th + 1) * rho + 0.012 * (vn(rho * 5, th * 2, 1) - 0.5), tint: tintBase([0.62, 0.55, 0.47], 0.35, -0.02), topTint: [1.0, 0.97, 0.92] });
      sprout(B, r, R * 0.92, 0.22, 0.1, 0.4, 0.5, 0, SPC.oak.dark, SPC.oak.light); sprout(B, r, -R * 0.5, 0.18, -R * 0.78, 3.6, 0.38, 0, SPC.oak.dark, SPC.oak.light);
      mossPad(B, r, R * 1.3, 0.04, -R * 0.9, V3(0.2, 1, 0), 0.16); mossPad(B, r, -R * 1.2, 0.04, R * 0.5, V3(-0.2, 1, 0.2), 0.13);
    } else if (v === 1) {  // сосна
      const R = 0.4, H = 0.52;
      stumpBody(B, r, { R, H, flare: 0.3, nRoots: 5, reach: 0.8, cap: 1, capR: 0.97, top: (th, rho) => 0.07 * Math.cos(th - 0.5) * rho + 0.01 * Math.sin(rho * 22 + th) * rho, tint: tintBase([0.7, 0.52, 0.42], 0.1, -0.1), topTint: [1.0, 0.98, 0.95] });
      B.add('leaf', sphG(10, 8), { m: MX(0.72, 0.045, -0.55, 0, 0.5, 1.5, 0.04, 0.04, 0.085), col: (px, py, pz, nx, ny) => mixc([0.3, 0.2, 0.12], [0.5, 0.36, 0.22], clamp(0.5 + 0.5 * Math.sin(py * 70 + px * 60), 0, 1)) });
      mossPad(B, r, -0.62, 0.03, 0.5, V3(0, 1, 0.1), 0.12);
    } else if (v === 2) {  // берёза
      const R = 0.26, H = 0.62, b = stumpBody(B, r, { R, H, flare: 0.2, nRoots: 4, reach: 0.7, nu: 28, mat: 'birch', cap: 0, capR: 0.86, top: (th, rho) => 0.16 * Math.cos(th - 0.9) * rho + 0.02 * (vn(th * 3, rho * 3, 4) - 0.5), tint: (x, y, z, nx, ny, nz) => mulc([0.97, 0.96, 0.93], y < 0.2 ? 0.4 + 0.6 * sstep(-0.05, 0.2, y) : 0.9 + 0.1 * fbm(x * 7, y * 7, z * 7, 2)), topTint: [1.04, 1.0, 0.94] });
      sprout(B, r, 0.2, 0.3, 0.08, 0.2, 0.7, 1, SPC.birch.dark, SPC.birch.light, [0.5, 0.42, 0.34]); sprout(B, r, -0.14, 0.26, 0.17, 2.4, 0.55, 1, SPC.birch.dark, SPC.birch.light, [0.5, 0.42, 0.34]); sprout(B, r, 0.0, 0.2, -0.24, 4.5, 0.45, 1, SPC.birch.dark, SPC.birch.light, [0.5, 0.42, 0.34]);
      mushroom(B, 0.38, 0.0, 0.2, 0.06, [0.62, 0.34, 0.18]); mushroom(B, 0.44, 0.0, 0.12, 0.045, [0.62, 0.34, 0.18]);
    } else {               // старый, замшелый, с дуплом
      const R = 0.6, H = 1.0;
      const rim = (th) => 0.42 * sstep(0.55, 0.9, vn(Math.cos(th) * 1.3 + 9, Math.sin(th) * 1.3, 3)) - 0.12 * (vn(Math.cos(th) * 2.3, Math.sin(th) * 2.3, 7) - 0.5);
      const b = stumpBody(B, r, { R, H, flare: 0.6, nRoots: 7, reach: 0.45, nu: 36, cap: 3, capR: 0.9, top: (th, rho) => rim(th) * (0.3 + 0.7 * rho) + 0.06 * (vn(Math.cos(th) * 5, Math.sin(th) * 5, rho * 3) - 0.5), hollow: (th, rho) => 0.38 * Math.pow(1 - rho, 1.6) * sstep(0.0, 0.4, 1 - rho + 0.15), tint: tintBase([0.52, 0.48, 0.4], 0.95, 0.12), topTint: [0.85, 0.82, 0.75] });
      // мох на торце и верхних корнях, трутовики, мелкие грибы, папоротник
      for (let i = 0; i < 9; i++) { const th = r() * TAU, rho = 0.3 + 0.65 * r(), rr = b.rad(th, H) * rho; mossPad(B, r, Math.cos(th) * rr, b.ytop(th, rho) - 0.38 * Math.pow(1 - rho, 1.6) + 0.02, Math.sin(th) * rr, V3(0, 1, 0), 0.1 + 0.12 * r()); }
      for (let i = 0; i < 9; i++) { const th = r() * TAU, y = 0.1 + r() * 0.5, rr = b.rad(th, y); mossPad(B, r, Math.cos(th) * (rr + 0.0), y, Math.sin(th) * rr, V3(Math.cos(th), 0.5, Math.sin(th)), 0.1 + 0.1 * r()); }
      bracket(B, Math.cos(2.2) * (b.rad(2.2, 0.55) + 0.01), 0.55, Math.sin(2.2) * (b.rad(2.2, 0.55) + 0.01), 2.2, 0.28, [0.56, 0.4, 0.26]); bracket(B, Math.cos(2.5) * (b.rad(2.5, 0.72) + 0.01), 0.72, Math.sin(2.5) * (b.rad(2.5, 0.72) + 0.01), 2.5, 0.2, [0.62, 0.46, 0.3]); bracket(B, Math.cos(5.2) * (b.rad(5.2, 0.4) + 0.01), 0.4, Math.sin(5.2) * (b.rad(5.2, 0.4) + 0.01), 5.2, 0.22, [0.5, 0.36, 0.22]);
      mushroom(B, 0.95, 0.0, 0.45, 0.07, [0.7, 0.28, 0.2]); mushroom(B, 1.02, 0.0, 0.35, 0.05, [0.7, 0.28, 0.2]); mushroom(B, -0.9, 0.0, -0.6, 0.06, [0.74, 0.62, 0.42]);
      for (let i = 0; i < 4; i++) { const a = 0.8 + i * 1.3, rr = 0.9 + 0.2 * r(), nrm = V3(Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5).normalize(), ax = nrm.clone(), sd = V3(-Math.sin(a), 0, Math.cos(a)), c1 = mixc([0.2, 0.4, 0.14], [0.4, 0.6, 0.22], r()); B.add('card', cardGeo(4, V3(Math.cos(a) * rr, 0.0, Math.sin(a) * rr), ax.clone().normalize(), sd, 0.7, 0.65, nrm, mulc(c1, 0.75), c1), { ao: 0 }); }
    }
    return B.done();
  }
  reg('forest', 'stump', stump);

  // ====================================================================== камни: гранитные валуны (грани-плоскости + шум), мох и лишайник
  /** Остроугольный валун: икосфера, срезанная случайными плоскостями, + шум. Возвращает non-indexed геометрию со сваренными нормалями и трипланарными uv. */
  function rockGeo(r, o) {
    const g = new T.IcosahedronGeometry(1, o.detail == null ? 6 : o.detail), p = g.attributes.position, planes = [], sd = Math.floor(r() * 500), v = V3(0, 0, 0), rg = o.rough == null ? 0.012 : o.rough;
    for (let k = 0; k < o.cuts; k++) { const n = sph3(r); if (n.y < -0.35) n.y = -n.y * 0.5; planes.push([n, lerp(o.dmin || 0.6, o.dmax || 0.84, r())]); }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); v.multiplyScalar(1 + (o.lump == null ? 0.14 : o.lump) * (fbm(v.x * 1.1 + sd, v.y * 1.1, v.z * 1.1, 2) - 0.5) * 2);
      for (const [n, d] of planes) { const s = v.dot(n) - d; if (s > 0) v.addScaledVector(n, -s); }
      v.set(v.x * o.rx, v.y * o.ry, v.z * o.rz);
      const q = (fbm(v.x * 7 + sd, v.y * 7, v.z * 7, 2) - 0.5) * rg * 2; v.set(v.x + q * 0.6, v.y + q, v.z + q * 0.6);
      if (o.flat != null && v.y < -o.ry * o.flat) v.y = -o.ry * o.flat;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    weldCrease(g, o.crease || 34); g.computeBoundingBox(); const dy = -g.boundingBox.min.y - (o.bury == null ? 0.03 : o.bury); g.translate(0, dy, 0); triplanar(g, 1 / 1.2, r(), r()); return g;
  }
  const GRAN = [[0.7, 0.69, 0.67], [0.64, 0.67, 0.7], [0.74, 0.69, 0.64], [0.68, 0.65, 0.63]];
  /** Добавляет камень (геометрия rockGeo) с мхом: цвет вершин по шуму и нормали; подушки мха на верхних гранях; возвращает позиции вершин. */
  function addRock(B, r, o, x, z, ry, tilt) {
    const g = rockGeo(r, o), sd = Math.floor(r() * 200), tone = GRAN[Math.floor(r() * GRAN.length)], p = g.attributes.position, nrm = g.attributes.normal;
    g.computeBoundingBox(); const top = g.boundingBox.max.y, m = MX(x, 0, z, tilt ? tilt[0] : 0, ry, tilt ? tilt[1] : 0, 1, 1, 1), mb = o.mossBias == null ? 0 : o.mossBias;
    const mossAt = (px, py, pz, ny) => sstep(0.5, 0.68, fbm(px * 1.9 + sd, py * 1.9, pz * 1.9, 3) * 0.85 + 0.38 * Math.max(ny, 0) + mb - (py / Math.max(top, 0.3)) * 0.12 + (py < 0.35 ? 0.1 : 0));
    B.add('rock', g, { m, col: (px, py, pz, nx, ny) => { const lx = px - x, mm = mossAt(px - x, py, pz - z, ny); return mixc(mulc(tone, (0.82 + 0.34 * fbm(lx * 3 + sd, py * 3, (pz - z) * 3, 2)) * (0.78 + 0.3 * fbm(lx * 4 + sd, py * 0.5, (pz - z) * 4, 2))), mixc(MOSSC, MOSSL, fbm(px * 6, py * 6, pz * 6, 2)), mm * 0.92); } });
    // подушки мха
    const mat = m, tmp = V3(0, 0, 0), tn = V3(0, 0, 0), nm = new T.Matrix3().getNormalMatrix(mat);
    for (let i = 0, n = 0; i < p.count && n < (o.pads == null ? 8 : o.pads); i += 3) {
      tmp.fromBufferAttribute(p, i); tn.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); const w = tmp.clone().applyMatrix4(mat);
      if (tn.y > 0.4 && mossAt(w.x - x, w.y, w.z - z, tn.y) > 0.62 && ih(i, sd, 5) < 0.2 * (o.padDens || 1)) { mossPad(B, r, w.x, w.y - 0.01, w.z, tn, 0.07 + 0.11 * r()); n++; }
    }
    return g;
  }
  function rock(o) {
    const B = new Bld(), r = lcg(700 + o.variant * 41 + o.seed * 3), v = Math.min(3, o.variant);
    if (v === 0) {         // большой валун
      addRock(B, r, { rx: 1.2, ry: 0.82, rz: 1.0, cuts: 15, detail: 7, mossBias: 0.07, pads: 9 }, 0, 0, 0.6);
      for (let i = 0; i < 6; i++) { const a = i * 1.1 + r(), d = 1.0 + 0.3 * r(); tuft(B, r, Math.cos(a) * d, Math.sin(a) * d * 0.9, 0.55 + 0.25 * r()); }
    } else if (v === 1) {  // россыпь: большой + средние + мелкие
      addRock(B, r, { rx: 0.78, ry: 0.56, rz: 0.66, cuts: 14, detail: 7, mossBias: 0.05, pads: 6 }, -0.25, 0.1, 0.4);
      addRock(B, r, { rx: 0.55, ry: 0.4, rz: 0.5, cuts: 12, detail: 5, pads: 3 }, 0.78, -0.5, 1.9);
      addRock(B, r, { rx: 0.34, ry: 0.26, rz: 0.3, cuts: 11, detail: 4, pads: 2 }, 0.55, 0.85, 0.7);
      addRock(B, r, { rx: 0.3, ry: 0.22, rz: 0.28, cuts: 11, detail: 4, pads: 1 }, -0.95, -0.62, 2.5);
      addRock(B, r, { rx: 0.21, ry: 0.16, rz: 0.2, cuts: 9, detail: 4, pads: 0 }, 0.12, -0.95, 1.1);
      addRock(B, r, { rx: 0.17, ry: 0.13, rz: 0.15, cuts: 9, detail: 3, pads: 0 }, -0.7, 0.85, 0.3);
      for (let i = 0; i < 7; i++) { const a = i * 0.95 + r(), d = 1.0 + 0.4 * r(); tuft(B, r, Math.cos(a) * d, Math.sin(a) * d, 0.45 + 0.25 * r()); }
    } else if (v === 2) {  // плоская плита с наклонной второй
      addRock(B, r, { rx: 1.15, ry: 0.36, rz: 0.88, cuts: 13, detail: 7, dmin: 0.66, dmax: 0.9, flat: 0.6, mossBias: 0.2, pads: 11, padDens: 1.4, lump: 0.08 }, 0, 0, 0.35);
      addRock(B, r, { rx: 0.58, ry: 0.22, rz: 0.45, cuts: 11, detail: 5, dmin: 0.66, dmax: 0.9, flat: 0.5, mossBias: 0.1, pads: 3 }, 0.85, 0.35, 1.2, [0, 0.0]);
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + r(), d = 1.1 + 0.35 * r(); tuft(B, r, Math.cos(a) * d, Math.sin(a) * d * 0.8, 0.45 + 0.2 * r()); }
    } else {               // средний валун с папоротником у основания
      addRock(B, r, { rx: 0.82, ry: 0.72, rz: 0.68, cuts: 16, detail: 7, mossBias: -0.02, pads: 5 }, 0, 0, 2.3);
      for (let i = 0; i < 5; i++) { const a = 0.4 + i * 1.25 + r() * 0.4, d = 0.85 + 0.25 * r(), nrm = V3(Math.cos(a) * 0.6, 0.55, Math.sin(a) * 0.6).normalize(), sd = V3(-Math.sin(a), 0, Math.cos(a)), ax = V3(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize(), c1 = mixc([0.2, 0.4, 0.14], [0.36, 0.56, 0.2], r()); B.add('card', cardGeo(4, V3(Math.cos(a) * d, 0, Math.sin(a) * d), ax, sd, 0.95, 0.9, nrm, mulc(c1, 0.75), c1), { ao: 0 }); }
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + r(), d = 1.05 + 0.3 * r(); tuft(B, r, Math.cos(a) * d, Math.sin(a) * d, 0.5 + 0.2 * r()); }
    }
    return B.done();
  }
  reg('forest', 'rock', rock);

  // ====================================================================== брёвна: штабель, поваленное дерево
  const LOGSP = [{ bark: [0.56, 0.47, 0.4], cell: 0 }, { bark: [0.66, 0.5, 0.4], cell: 1 }, { bark: [0.54, 0.5, 0.46], cell: 2 }];
  /** Брёвно вдоль оси Z: бочка с лёгким изгибом и кора; торцы — диски из атласа колец. */
  function addLog(B, r, x, y, zc, len, r0, r1, sp, seg, o) {
    o = o || {}; const n = 4, pts = [], rads = [], bx = (r() - 0.5) * 0.05, by = (r() - 0.5) * 0.025, ph = r() * 6;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(V3(x + bx * Math.sin(t * PI), y + by * Math.sin(t * PI), zc - len / 2 + len * t)); rads.push(lerp(r0, r1, t) * (1 + 0.035 * Math.sin(ph + t * 7) + (i === 0 ? 0.04 : 0))); }
    const key = o.mat || 'bark', bk = sp.bark, jt = 0.85 + 0.3 * r(), dark = o.dark || 1;
    B.add(key, tube(pts, rads, seg || 14, { uRep: Math.max(1, Math.round(TAU * r0 / (key === 'birch' ? 0.5 : 0.35))), vRep: key === 'birch' ? 2 : 0.83 }), { m: o.m, col: (px, py, pz, nx, ny, nz) => mulc(bk, jt * dark * (0.9 + 0.2 * fbm(px * 5, py * 5, pz * 2, 2))) });
    const cu = endCell(sp.cell), rr = 0.97 * 0.2305, rot = r() * TAU;
    B.add('end', disc(pts[0], V3(0, 0, -1), rads[0], seg || 14, cu[0] + 0.25, cu[1] + 0.25, rr, rot), { m: o.m, col: [0.95 * dark, 0.95 * dark, 0.95 * dark], ao: 0 });
    B.add('end', disc(pts[n], V3(0, 0, 1), rads[n], seg || 14, cu[0] + 0.25, cu[1] + 0.25, rr, rot + 2), { m: o.m, col: [0.95 * dark, 0.95 * dark, 0.95 * dark], ao: 0 });
    return pts;
  }
  /** Раскладка штабеля: ряды nb, nb-1, ... брёвен, каждое лежит на двух нижних (касание окружностей). */
  function pileLayout(r, nb, rows, base) {
    let tw = 0; const r0s = [], lay = []; for (let i = 0; i < nb; i++) { const rr = 0.165 + r() * 0.075; r0s.push(rr); tw += rr * 2.02; }
    let cur = -tw / 2; lay.push(r0s.map((rr) => { const x = cur + rr; cur += rr * 2.02; return { x, y: base + rr - 0.01, r: rr }; }));
    for (let j = 1; j < rows; j++) { const prev = lay[j - 1], n = nb - j; if (n < 2) break; const row = []; for (let k = 0; k < n; k++) { const rr = 0.16 + r() * 0.07, x = (prev[k].x + prev[k + 1].x) / 2 + (r() - 0.5) * 0.03; let y = 0; for (const L of [prev[k], prev[k + 1]]) y = Math.max(y, L.y + Math.sqrt(Math.max(0, (rr + L.r) * (rr + L.r) - (x - L.x) * (x - L.x)))); row.push({ x, y: y - 0.015, r: rr }); } lay.push(row); }
    return { lay, tw };
  }
  function logpile(o) {
    const B = new Bld(), r = lcg(900 + o.size * 13 + o.seed * 7), nb = [4, 6, 7][o.size - 1], rows = [3, 4, 5][o.size - 1], Ln = [2.5, 2.7, 2.9][o.size - 1], seg = o.size === 3 ? 12 : 14, PL = pileLayout(r, nb, rows, 0.1), lay = PL.lay, tw = PL.tw;
    let top = 0; for (const row of lay) for (const L of row) { const sp = LOGSP[r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2], len = Ln * (0.9 + 0.2 * r()), zc = (r() - 0.5) * 0.22, rev = r() < 0.5; addLog(B, r, L.x, L.y, zc, len, L.r * (rev ? 0.9 : 1.04), L.r * (rev ? 1.04 : 0.9), sp, seg); top = Math.max(top, L.y + L.r); }
    const hw = tw / 2, wdn = (px, py, pz, kz) => [0, 0, 0];
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {            // стойки-распорки по краям штабеля
      const x = sx * (hw + 0.1), z = sz * Ln * 0.36, h = top * 0.8 + 0.1, pts = [V3(x, 0, z), V3(x + sx * 0.008, h * 0.5, z), V3(x + sx * 0.016, h, z)];
      B.add('bark', tube(pts, [0.075, 0.068, 0.02], 8, { uRep: 1, vRep: 0.83 }), { col: [0.8, 0.68, 0.5] });
    }
    for (const sz of [-1, 1]) boxUV(B, 'timberL', -hw - 0.18, 0, sz * Ln * 0.3 - 0.07, hw + 0.18, 0.1, sz * Ln * 0.3 + 0.07, [0.55, 0.46, 0.36], (f, W, H) => (f === 't' || f === 'b' ? [0, 0.3, W, 0.2] : f === 'f' || f === 'k' ? [0, 0.3, W, 0.2] : [0, 0.3, W * 0.2, 0.2]));
    for (let i = 0; i < 14; i++) {           // кора и опилки на земле
      const a = r() * TAU, d = (0.3 + r() * 0.9) * (hw + 0.3), x = Math.cos(a) * d, z = Math.sin(a) * Ln * 0.5 * (0.5 + r() * 0.7), s = 0.05 + r() * 0.09, rot = r() * TAU, c = Math.cos(rot), sn = Math.sin(rot), u0 = r(), v0 = r();
      B.add('chips', quadG(V3(x - c * s, 0.012, z - sn * s), V3(x + c * s, 0.012, z + sn * s * 0.0 + sn * s), V3(x + c * s + sn * s, 0.012, z + sn * s - c * s), V3(x - c * s + sn * s, 0.012, z - sn * s - c * s), [u0, v0], [u0 + 0.1, v0], [u0 + 0.1, v0 + 0.1], [u0, v0 + 0.1], V3(0, 1, 0)), { col: [0.8, 0.7, 0.6], ao: 0 });
    }
    return B.done();
  }
  reg('forest', 'logpile', logpile);

  // ---------------------------------------------------------------- поваленное дерево
  function stub(B, r, p0, dir, len, rd, bark) {
    const pts = [p0.clone(), p0.clone().addScaledVector(dir, len * 0.5), p0.clone().addScaledVector(dir, len)];
    B.add('bark', tube(pts, [rd * 1.25, rd * 1.05, rd], 7, { uRep: 1, vRep: 0.83 }), { col: bark }); B.add('end', disc(pts[2], dir, rd, 7, 0.25, 0.25, 0.2, r() * TAU), { ao: 0 });
  }
  function felled(o) {
    const B = new Bld(), r = lcg(1100 + o.variant * 37 + o.seed * 3), v = Math.min(2, o.variant), sp = [SPC.oak, SPC.pine, SPC.birch][v];
    const Lt = [5.4, 7.6, 6.8][v] * (o.length ? o.length / 8 : 1), rb = [0.38, 0.3, 0.19][v], rt = [0.11, 0.025, 0.035][v], z0 = -Lt * 0.5 - [0.4, 0, 0.1][v], lift = [0.3, 0.5, 0.3][v], sway = [0.2, 0.14, 0.24][v], ph = r() * 6;
    const R = (t) => lerp(rb, rt, Math.pow(t, 0.8)) * (1 + 0.35 * Math.exp(-t * 16)), cl = (t) => V3(sway * Math.sin(t * 2.4 + ph), R(t) * 0.98 + lift * sstep(0.3, 1, t) + 0.02, z0 + Lt * t);
    const pts = [], rads = []; const nT = 18; for (let i = 0; i <= nT; i++) { const t = i / nT; pts.push(cl(t)); rads.push(R(t)); }
    const key = v === 2 ? 'birch' : 'bark', bkc = v === 0 ? [0.5, 0.44, 0.38] : v === 1 ? [0.58, 0.43, 0.34] : [0.9, 0.89, 0.86];
    B.add(key, tube(pts, rads, 16, { uRep: Math.max(1, Math.round(TAU * rb / (v === 2 ? 0.5 : 0.35))), vRep: v === 2 ? 2 : 0.83 }), { col: (px, py, pz) => mulc(bkc, 0.88 + 0.24 * fbm(px * 4, py * 4, pz * 1.5, 2)) });
    const cu = endCell([2, 1, 0][v]);
    B.add('end', disc(pts[0], V3(0, 0, -1), rads[0], 16, cu[0] + 0.25, cu[1] + 0.25, 0.97 * 0.2305, r() * TAU), { ao: 0 });
    B.add('end', disc(pts[nT], V3(0, 0, 1), rads[nT], 16, cu[0] + 0.25, cu[1] + 0.25, 0.97 * 0.2305, 1), { ao: 0 });
    // торцевой срез: клин-подпил сверху у комля и щепа вокруг
    const bb = pts[0];
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 0.25 + r() * 1.1, x = bb.x + Math.cos(a) * d * 0.9, z = bb.z - 0.1 - Math.abs(Math.sin(a)) * d * 0.9, s = 0.04 + r() * 0.08, rot = r() * TAU, c = Math.cos(rot), sn = Math.sin(rot), u0 = r() * 0.9, v0 = r() * 0.9; B.add('chips', quadG(V3(x - c * s, 0.012, z - sn * s), V3(x + c * s, 0.012, z + sn * s), V3(x + c * s - sn * s * 0.8, 0.012, z + sn * s + c * s * 0.8), V3(x - c * s - sn * s * 0.8, 0.012, z - sn * s + c * s * 0.8), [u0, v0], [u0 + 0.1, v0], [u0 + 0.1, v0 + 0.1], [u0, v0 + 0.1], V3(0, 1, 0)), { col: [0.9, 0.82, 0.7], ao: 0 }); }
    const at = (t, a, off) => { const c = cl(t), rr = R(t) * (off == null ? 0.9 : off); return V3(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, c.z); };
    const tw = (p0, dir, len, r0, r1, col, big) => limb(B, big ? 'bark' : 'leaf', p0, dir, len, r0, r1, { rng: r, seg: big ? 6 : 4, wob: 0.22, sag: 0.35, n: big ? 5 : 3, col, floor: 0.0, uRep: 1 });
    if (v === 1) {                // ель: ветви по всей верхней части, снизу придавленные
      const nb = 38;
      for (let k = 0; k < nb; k++) {
        const t = 0.08 + 0.9 * k / (nb - 1), a = k * 2.4 + r(), Lb = (1.55 * (1 - 0.82 * t) + 0.18) * (0.8 + 0.4 * r()), down = Math.sin(a) < -0.25;
        const p0 = at(t, a, 0.8), dir = V3(Math.cos(a), Math.sin(a) * 0.55 + 0.1, 0.9).normalize();
        if (down) { stub(B, r, p0, V3(Math.cos(a), Math.sin(a), 0.3).normalize(), 0.12 + 0.08 * r(), 0.014, [0.34, 0.24, 0.17]); continue; }
        const lm = tw(p0, dir, Lb * 0.75, 0.016 + 0.02 * (1 - t), 0.005, [0.24, 0.19, 0.12], false);
        for (let c = 0; c < 3; c++) {
          const yaw = (c - 1) * 0.5 + (r() - 0.5) * 0.3, cs = Math.cos(yaw), sn = Math.sin(yaw), bd = lm.d.clone(); bd.set(bd.x * cs - bd.z * sn, bd.y, bd.x * sn + bd.z * cs); const ax = bd.add(V3(0, -0.1 - 0.1 * r(), 0)).normalize(), base = p0.clone().lerp(lm.tip, 0.15), nrm = V3(0, 1, 0).addScaledVector(V3(dir.x, 0, dir.z), 0.5).normalize();
          const t2 = ax.clone().addScaledVector(nrm, -ax.dot(nrm)).normalize(), sd = t2.clone().cross(nrm).normalize(), sz = Lb * (c === 1 ? 1.3 : 1.1) + 0.2, c1 = mixc(sp.dark, sp.light, clamp(0.25 + r() * 0.5, 0, 1)); base.y = Math.max(base.y, 0.05);
          B.add('card', cardGeo(2, base, t2, sd, sz * (0.8 + 0.3 * r()), sz, nrm, mulc(c1, 0.66), mulc(c1, 1.05), 0.03), { ao: 0 });
        }
      }
    } else {                     // дуб / берёза: нижние сучья-пеньки и раскидистая крона у вершины
      for (let k = 0; k < (v === 0 ? 9 : 6); k++) { const t = 0.08 + 0.4 * r(), a = r() * PI * 1.2 - 0.1; stub(B, r, at(t, a, 0.92), V3(Math.cos(a), Math.sin(a), 0.25).normalize(), 0.12 + 0.18 * r(), (v === 0 ? 0.03 : 0.018) + 0.015 * r(), v === 0 ? [0.6, 0.54, 0.48] : [0.9, 0.89, 0.86]); }
      const nbr = v === 0 ? 8 : 9, cs = v === 0 ? 1.05 : 0.8, cell = v === 0 ? 0 : 1;
      for (let k = 0; k < nbr; k++) {
        const t = (v === 0 ? 0.52 : 0.4) + 0.46 * (k + r() * 0.6) / nbr, a = (k % 2 ? 1 : -1) * (0.15 + r() * 1.2) + (r() - 0.5) * 0.5 + PI * 0.4, Lb = (v === 0 ? 2.0 : 1.7) * (0.65 + 0.5 * r()) * (1.1 - 0.5 * (t - 0.4));
        const p0 = at(t, a, 0.7), dir = V3(Math.cos(a) * 0.95, Math.max(Math.sin(a), 0.2) * 0.5, 0.75).normalize();
        const lm = tw(p0, dir, Lb, (v === 0 ? 0.07 : 0.03) * (1 - t * 0.5), 0.012, v === 0 ? [0.6, 0.54, 0.48] : [0.9, 0.89, 0.86], v === 0);
        for (let q = 0; q < 2; q++) { const tt = 0.45 + 0.5 * q, bp = lm.pts[Math.min(lm.pts.length - 1, Math.round(tt * (lm.pts.length - 1)))], ad = (q ? 1 : -1) * 0.8, d2 = V3(Math.cos(ad) * dir.x - Math.sin(ad) * dir.z, 0.15, Math.sin(ad) * dir.x + Math.cos(ad) * dir.z).normalize(); const sb = tw(bp, d2, Lb * 0.45, 0.015, 0.006, v === 0 ? [0.5, 0.44, 0.38] : [0.88, 0.87, 0.84], false); const cy = Math.max(sb.tip.y, 0.34); cluster(B, r, V3(sb.tip.x, cy, sb.tip.z), [0.5, 0.3, 0.5], v === 0 ? 7 : 6, cell, cs * 0.8, cs * 0.8, sp.dark, sp.light, { inner: 0.4, floor: 0.03, axis: v === 0 ? V3(0, 0.35, 0) : V3(0, -0.5, 0) }); }
        const cy = Math.max(lm.tip.y, 0.42); coreBlob(B, r, lm.tip.x, cy, lm.tip.z, 0.28 + 0.1 * r(), 0.2, 0.28 + 0.1 * r(), sp.coreD, sp.coreL, k, 2);
        cluster(B, r, V3(lm.tip.x, cy, lm.tip.z), [0.8, 0.38, 0.8], v === 0 ? 14 : 10, cell, cs, cs, sp.dark, sp.light, { inner: 0.35, floor: 0.03, axis: v === 0 ? V3(0, 0.3, 0) : V3(0, -0.4, 0) });
      }
      const tipc = cl(1); coreBlob(B, r, tipc.x, Math.max(tipc.y, 0.4), tipc.z + 0.2, 0.34, 0.22, 0.34, sp.coreD, sp.coreL, 5, 2); cluster(B, r, V3(tipc.x, Math.max(tipc.y, 0.45), tipc.z + 0.3), [0.7, 0.3, 0.7], 9, cell, cs, cs, sp.dark, sp.light, { inner: 0.4, floor: 0.03 });
    }
    return B.done();
  }
  reg('forest', 'felled', felled);

  // ====================================================================== штабель досок, куча хвороста, щепа, подлесок
  /** Слой досок: верх/бока — timberL, торцы — timberE. x0..x1 (ширина), y0..y1, z0..z1; ux — смещение для совпадения швов. */
  function timberLayer(B, x0, x1, y0, y1, z0, z1, col, wref, top) {
    const P = (x, y, z) => V3(x, y, z), ux = (x) => (x + wref) / 0.2;
    if (top !== false) B.add('timberL', quadG(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [z1, ux(x0)], [z1, ux(x1)], [z0, ux(x1)], [z0, ux(x0)]), { col, ao: 0 });
    B.add('timberL', quadG(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), [z1, 0.3], [z0, 0.3], [z0, 0.45], [z1, 0.45]), { col });
    B.add('timberL', quadG(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [z0, 0.3], [z1, 0.3], [z1, 0.45], [z0, 0.45]), { col });
    B.add('timberE', quadG(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [ux(x0), 0], [ux(x1), 0], [ux(x1), 1], [ux(x0), 1]), { col });
    B.add('timberE', quadG(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [ux(x1), 0], [ux(x0), 0], [ux(x0), 1], [ux(x1), 1]), { col });
  }
  /** Пакет досок длиной Ln (по Z), шириной W (по X), layers слоёв. o.stick: 'full' | 'core'; o.bearers, o.straps — z-координаты. */
  function plankPack(B, r, W, layers, Ln, o) {
    const bt = o.bt || 0.045, st = o.st || 0.03, pitch = bt + st, base = o.base == null ? 0.14 : o.base, hw = W / 2, zs = o.stz || [-1.28, -0.64, 0, 0.64, 1.28];
    for (const z of o.bearers || [-1.22, 0, 1.22]) boxUV(B, 'timberL', -hw - 0.05, 0, z - 0.06, hw + 0.05, base, z + 0.06, [0.62, 0.55, 0.46], (f, w, h) => (f === 'l' || f === 'r' ? [0, 0.3, 0.12, 0.45] : [0, 0.3, w, 0.15]), 'b');
    if (o.stick === 'core') B.box('matte', 0, base + (layers * pitch) / 2, 0, W - 0.1, layers * pitch, Ln - 0.5, [0.2, 0.15, 0.1], 0, 0, 0, { ao: 0 });
    for (let j = 0; j < layers; j++) {
      const y0 = base + j * pitch + st, y1 = y0 + bt, len = Ln * (0.96 + 0.04 * r()), zc = (r() - 0.5) * 0.06, v = 0.86 + 0.2 * r(), col = [v, v * 0.96, v * 0.9];
      timberLayer(B, -hw, hw, y0, y1, zc - len / 2, zc + len / 2, j % 7 === 3 ? mulc(col, 0.84) : col, hw);
      if (o.stick === 'core') continue;
      for (const z of zs) {
        const ya = y0 - st, yb = y0, xa = -hw + 0.012, xb = hw - 0.012, P = (x, y, zz) => V3(x, y, zz), c2 = [0.7, 0.62, 0.5];
        B.add('timberL', quadG(P(xb, ya, z + 0.022), P(xb, ya, z - 0.022), P(xb, yb, z - 0.022), P(xb, yb, z + 0.022), [0, 0.3], [0.1, 0.3], [0.1, 0.4], [0, 0.4]), { col: c2, ao: 0 });
        B.add('timberL', quadG(P(xa, ya, z - 0.022), P(xa, ya, z + 0.022), P(xa, yb, z + 0.022), P(xa, yb, z - 0.022), [0, 0.3], [0.1, 0.3], [0.1, 0.4], [0, 0.4]), { col: c2, ao: 0 });
        B.add('timberL', quadG(P(xa, ya, z + 0.022), P(xb, ya, z + 0.022), P(xb, yb, z + 0.022), P(xa, yb, z + 0.022), [0, 0.3], [0.4, 0.3], [0.4, 0.4], [0, 0.4]), { col: c2, ao: 0 });
        B.add('timberL', quadG(P(xb, ya, z - 0.022), P(xa, ya, z - 0.022), P(xa, yb, z - 0.022), P(xb, yb, z - 0.022), [0, 0.3], [0.4, 0.3], [0.4, 0.4], [0, 0.4]), { col: c2, ao: 0 });
      }
    }
    const top = base + (layers - 1) * pitch + st + bt;
    for (const z of o.straps || []) {                    // стяжные ленты
      B.box('rubber', 0, top + 0.004, z, W + 0.016, 0.008, 0.032, [0.1, 0.12, 0.14], 0, 0, 0, { ao: 0 });
      for (const sx of [-1, 1]) { B.box('rubber', sx * (hw + 0.004), base + (top - base) / 2, z, 0.008, top - base + 0.008, 0.032, [0.1, 0.12, 0.14], 0, 0, 0, { ao: 0 }); B.box('metal', sx * (hw + 0.009), base + (top - base) * 0.45, z, 0.012, 0.05, 0.075, [0.62, 0.64, 0.68], 0, 0, 0, { ao: 0 }); B.box('rubber', sx * hw, top + 0.016, z, 0.06, 0.03, 0.05, [0.12, 0.14, 0.16], 0, 0, 0, { ao: 0 }); }
    }
    return top;
  }
  function plankstack(o) {
    const B = new Bld(), r = lcg(1300 + o.size * 11 + o.seed), W = [1.15, 1.55, 2.05][o.size - 1], layers = [11, 15, 21][o.size - 1];
    plankPack(B, r, W, layers, 3.0, { stick: 'full', straps: o.size === 1 ? [-0.8, 0.8] : [-1.0, 0.0, 1.0] });
    return B.done();
  }
  reg('forest', 'plankstack', plankstack);

  // ---------------------------------------------------------------- куча хвороста
  function branchpile(o) {
    const B = new Bld(), r = lcg(1500 + o.seed * 5), N = 70, DRY = [[0.4, 0.38, 0.16], [0.62, 0.5, 0.24]], GRN = [[0.2, 0.34, 0.14], [0.4, 0.54, 0.22]];
    const height = (d) => 0.08 + 0.55 * Math.max(0, 1 - (d / 1.15) * (d / 1.15));
    const spray = (p, ax0, dry, sz, cell, up) => {
      const ad = (r() - 0.5) * 1.8, ax = V3(Math.cos(ad) * ax0.x - Math.sin(ad) * ax0.z, ax0.y - 0.1 + up, Math.sin(ad) * ax0.x + Math.cos(ad) * ax0.z).normalize(), nrm = V3(0, 1, 0).addScaledVector(V3(ax0.x, 0, ax0.z), 0.3).normalize();
      const t2 = ax.clone().addScaledVector(nrm, -ax.dot(nrm)).normalize(), sd = t2.clone().cross(nrm).normalize(), c1 = mixc(dry ? DRY[0] : GRN[0], dry ? DRY[1] : GRN[1], r());
      B.add('card', cardGeo(cell, p, t2, sd, sz * (cell === 2 ? 0.8 : 0.75), sz, nrm, mulc(c1, 0.72), c1, 0.03), { ao: 0 });
    };
    for (let k = 0; k < N + 7; k++) {
      const big = k >= N, ang = r() * TAU, d = Math.sqrt(r()) * 0.85, base = V3(Math.cos(ang) * d, height(d) * (0.25 + 0.75 * r()), Math.sin(ang) * d), yaw = ang + PI * (0.5 + r() * 1.0) + (r() - 0.5) * 0.8, pit = 0.06 + r() * 0.5;
      const dir = V3(Math.cos(yaw) * Math.cos(pit), Math.sin(pit), Math.sin(yaw) * Math.cos(pit)), len = big ? 0.9 + r() * 0.5 : 0.8 + r() * 1.0, r0 = big ? 0.04 + r() * 0.03 : 0.008 + r() * r() * 0.03, dry = r() < 0.7;
      const lm = limb(B, big ? 'bark' : 'leaf', base, dir, len, r0, r0 * (big ? 0.7 : 0.3), { rng: r, seg: big ? 6 : 4, wob: 0.28, sag: 0.25, n: 4, col: big ? [0.56, 0.5, 0.44] : [0.3, 0.23, 0.17], floor: 0.0, uRep: 1 });
      if (big || r0 > 0.02) B.add('end', disc(base, dir.clone().negate(), r0, big ? 6 : 4, 0.25, 0.25, 0.2, r() * TAU), { ao: 0 });
      if (big) { B.add('end', disc(lm.tip, lm.d, r0 * 0.7, 6, 0.25, 0.25, 0.2, r() * TAU), { ao: 0 }); continue; }
      const cell = r() < 0.6 ? 2 : r() < 0.5 ? 3 : 0, nf = 2 + ((r() * 2) | 0);
      for (let f = 0; f < nf; f++) {       // боковые веточки с мелкой хвоей/листвой
        const t = 0.4 + 0.5 * r(), bp = base.clone().lerp(lm.tip, t), sa = (f % 2 ? 1 : -1) * (0.6 + r() * 0.6), d2 = V3(Math.cos(sa) * lm.d.x - Math.sin(sa) * lm.d.z, lm.d.y + 0.1, Math.sin(sa) * lm.d.x + Math.cos(sa) * lm.d.z).normalize();
        const sb = limb(B, 'leaf', bp, d2, 0.3 + r() * 0.3, Math.max(0.004, r0 * 0.4), 0.003, { rng: r, seg: 3, wob: 0.3, n: 2, col: [0.3, 0.23, 0.17], floor: 0.0 });
        spray(bp.clone().lerp(sb.tip, 0.3), d2, dry, 0.32 + r() * 0.2, cell, 0);
      }
      spray(base.clone().lerp(lm.tip, 0.55), lm.d, dry, 0.45 + r() * 0.3, cell, 0); spray(lm.tip.clone().addScaledVector(lm.d, -0.1), lm.d, dry, 0.42 + r() * 0.3, cell, 0.05);
    }
    return B.done();
  }
  reg('forest', 'branchpile', branchpile);

  // ---------------------------------------------------------------- куча щепы
  function chips(o) {
    const B = new Bld(), r = lcg(1700 + o.seed * 3), NU = 40, NV = 11, sd = r() * 40, H = 0.95, R0 = 1.35;
    const Rth = (th) => R0 * (0.86 + 0.28 * (vn(Math.cos(th) * 1.3 + sd, Math.sin(th) * 1.3, 2) - 0.5) * 2 * 0.5 + 0.12 * Math.sin(th * 3 + sd)), cone = (th) => 0.8 + 0.3 * (vn(Math.cos(th) * 1.1 + 9, Math.sin(th) * 1.1, 5) - 0.2);
    const pos = (th, rho) => { const rr = Rth(th) * rho, x = Math.cos(th) * rr, z = Math.sin(th) * rr, h = H * cone(th) * Math.pow(Math.max(0, 1 - rho * rho), 0.85) + 0.07 * (fbm(x * 3 + sd, z * 3, 1.5, 3) - 0.4) * Math.sin(Math.min(1, rho * 3) * 1.5) + (rho > 0.97 ? 0 : 0); return [x, Math.max(h, 0.0) + (rho < 1 ? 0.012 : 0), z]; };
    const g = grid(NU, NV, (i, j) => pos(i / NU * TAU, j / NV), (i, j) => { const p = pos(i / NU * TAU, j / NV); return [p[0] / 1.2, p[2] / 1.2]; }, true);
    B.add('chips', g, { col: (x, y, z, nx, ny) => mixc([0.9, 0.86, 0.78], [0.6, 0.5, 0.4], clamp(0.55 - y * 0.5 + (fbm(x * 2 + sd, z * 2, 2.2, 3) - 0.5) * 0.9, 0, 1)) });
    for (let i = 0; i < 90; i++) {   // россыпь отдельных щепок по склонам и вокруг
      const th = r() * TAU, rho = Math.sqrt(r()) * 1.18, p = pos(th, Math.min(rho, 1)), x = rho > 1 ? Math.cos(th) * Rth(th) * rho : p[0], z = rho > 1 ? Math.sin(th) * Rth(th) * rho : p[2], y = rho > 1 ? 0.012 : p[1] + 0.012, s = 0.04 + r() * 0.08, rot = r() * TAU, c = Math.cos(rot), sn = Math.sin(rot), u0 = r() * 0.9, v0 = r() * 0.9, tl = (r() - 0.5) * 0.5;
      B.add('chips', quadG(V3(x - c * s, y, z - sn * s), V3(x + c * s, y + tl * s, z + sn * s), V3(x + c * s - sn * s * 0.7, y + tl * s, z + sn * s + c * s * 0.7), V3(x - c * s - sn * s * 0.7, y, z - sn * s + c * s * 0.7), [u0, v0], [u0 + 0.1, v0], [u0 + 0.1, v0 + 0.1], [u0, v0 + 0.1], V3(0, 1, 0)), { col: mixc([0.9, 0.82, 0.7], [0.6, 0.5, 0.38], r()), ao: 0 });
    }
    for (let i = 0; i < 5; i++) {    // обрезки брёвнышек, наполовину в куче
      const th = r() * TAU, rho = 0.45 + 0.5 * r(), p = pos(th, rho), yaw = r() * TAU, len = 0.35 + 0.35 * r(), rr = 0.045 + 0.035 * r(), dir = V3(Math.cos(yaw), -0.05 + r() * 0.15, Math.sin(yaw)).normalize(), a = V3(p[0], p[1] + rr * 0.1, p[2]).addScaledVector(dir, -len / 2);
      const pts = [a, a.clone().addScaledVector(dir, len / 2), a.clone().addScaledVector(dir, len)];
      B.add('bark', tube(pts, [rr, rr * 1.02, rr], 8, { uRep: 1, vRep: 0.83 }), { col: [0.58, 0.5, 0.42] }); B.add('end', disc(pts[0], dir.clone().negate(), rr, 8, 0.25, 0.25, 0.2, r() * TAU), { ao: 0 }); B.add('end', disc(pts[2], dir, rr, 8, 0.25, 0.25, 0.2, r() * TAU), { ao: 0 });
    }
    return B.done();
  }
  reg('forest', 'chips', chips);

  // ---------------------------------------------------------------- подлесок: папоротники, кусты, трава, цветы, грибы
  function undergrowth(o) {
    const B = new Bld(), r = lcg(1900 + o.seed * 7 + o.variant * 3);
    const FERN = [[0.18, 0.34, 0.1], [0.4, 0.6, 0.2]], dryGrass = [[0.5, 0.52, 0.22], [0.74, 0.76, 0.34]];
    const fern = (x, z, s) => {
      const nf = 8 + ((r() * 3) | 0);
      for (let k = 0; k < nf; k++) {
        const a = k / nf * TAU + (r() - 0.5) * 0.5, dir = V3(Math.cos(a), 0, Math.sin(a)), len = s * (0.8 + 0.4 * r()), c1 = mixc(FERN[0], FERN[1], r());
        B.add('card', frondG(4, V3(x, 0.0, z), dir, len, len * 0.5, 0.75 + r() * 0.4, 0.6 + r() * 0.5, 0.8, mulc(c1, 0.6), c1, 4), { ao: 0 });
      }
    };
    fern(-0.55, 0.35, 1.05); fern(0.6, -0.5, 0.95); fern(0.1, 0.85, 0.8); if (o.variant !== 1) fern(-0.2, -0.85, 0.75);
    const bush = (x, z, s, cell, dark, light) => { coreBlob(B, r, x, 0.3 * s, z, 0.34 * s, 0.26 * s, 0.34 * s, [0.1, 0.2, 0.07], [0.2, 0.32, 0.1], 3, 2); cluster(B, r, V3(x, 0.38 * s, z), [0.42 * s, 0.3 * s, 0.42 * s], 13, cell, 0.5 * s, 0.5 * s, dark, light, { inner: 0.45, floor: 0.04 }); };
    bush(0.85, 0.55, 1.0, 6, [0.22, 0.4, 0.12], [0.5, 0.68, 0.24]); bush(-0.95, -0.4, 0.85, 6, [0.2, 0.36, 0.1], [0.44, 0.62, 0.2]);
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 0.25 + r() * 1.05; tuft(B, r, Math.cos(a) * d, Math.sin(a) * d, 0.4 + r() * 0.35, i % 3 === 0 ? dryGrass[1] : null); }
    for (let i = 0; i < 6; i++) {    // кислица: низкие листья по земле
      const a = r() * TAU, d = 0.2 + r() * 1.1, nrm = V3(0, 1, 0), c1 = mixc([0.18, 0.4, 0.14], [0.36, 0.58, 0.2], r()), dir = V3(Math.cos(a), 0, Math.sin(a));
      B.add('card', frondG(7, V3(Math.cos(a) * d, 0.0, Math.sin(a) * d), dir, 0.34, 0.34, 0.5, 0.3, 1, mulc(c1, 0.7), c1, 2), { ao: 0 });
    }
    // цветы: тонкие стебли и маленькие головки
    const FL = [[0.95, 0.95, 0.9], [0.95, 0.82, 0.2], [0.62, 0.4, 0.78], [0.88, 0.4, 0.5]];
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = 0.2 + r() * 1.15, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.2 + r() * 0.3, lean = V3((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12), col = FL[(i / 4 | 0) % 4 === 3 && r() < 0.5 ? 3 : (r() * 3) | 0];
      B.add('leaf', tube([V3(x, 0, z), V3(x + lean.x * 0.5, h * 0.5, z + lean.z * 0.5), V3(x + lean.x, h, z + lean.z)], [0.004, 0.0035, 0.0028], 4, {}), { col: [0.22, 0.38, 0.12] });
      B.add('leaf', blob(0.035, 0.014, 0.035, { detail: 1, amp: 0.2, sd: i }), { m: MX(x + lean.x, h + 0.006, z + lean.z, (r() - 0.5) * 0.3, r() * 6, (r() - 0.5) * 0.3, 1, 1, 1), col: col, ao: 0 });
      B.add('leaf', blob(0.013, 0.01, 0.013, { detail: 0, amp: 0.1, sd: i + 3 }), { m: MX(x + lean.x, h + 0.016, z + lean.z, 0, 0, 0, 1, 1, 1), col: [0.9, 0.75, 0.2], ao: 0 });
    }
    mushroom(B, 0.35, 0.0, -0.1, 0.07, [0.74, 0.22, 0.16]); mushroom(B, 0.43, 0.0, -0.17, 0.05, [0.74, 0.22, 0.16]); mushroom(B, -0.7, 0.0, 0.7, 0.05, [0.6, 0.45, 0.3]);
    mossPad(B, r, -0.2, 0.0, 0.2, V3(0, 1, 0), 0.22, MOSSC, MOSSL);
    return B.done();
  }
  reg('forest', 'undergrowth', undergrowth);

  // ====================================================================== общие примитивы для построек
  const toV = (p) => (p.isVector3 ? p : V3(p[0], p[1], p[2]));
  /** Брус между точками: w — размер по локальной X, d — по локальной Z (при горизонтали вдоль X: w = вертикаль, d = ширина по Z; вдоль Z: w = по X, d = вертикаль). */
  function beam(B, key, p0, p1, w, d, col, o) {
    const a = toV(p0), b = toV(p1), dir = b.clone().sub(a), L = dir.length(); if (L < 1e-4) return;
    B.add(key, boxG(), Object.assign({ m: MD((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, dir, w, L, d, o && o.roll), col }, o));
  }
  /** Круглый стержень/труба между точками. */
  function rod(B, key, p0, p1, r, seg, col, o) {
    const a = toV(p0), b = toV(p1), dir = b.clone().sub(a), L = dir.length(); if (L < 1e-4) return;
    B.add(key, cylG(seg || 10), Object.assign({ m: MD((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, dir, r, L, r), col }, o));
  }
  function ring(B, key, x, y, z, R, r, rx, ry, rz, col, seg) { B.add(key, gcache('tor' + R + '_' + r + '_' + (seg || 28), () => new T.TorusGeometry(R, r, 8, seg || 28)), { m: MX(x, y, z, rx, ry, rz), col }); }
  /** Ровная плоскость по 4 точкам с двух сторон (стена, лист кровли): масштаб текстуры uS, vS метров на тайл. */
  function wallQ(B, key, col, pts, uS, vS, o) {
    const [a, b, c, d] = pts.map(toV), u1 = a.distanceTo(b) / uS, v1 = a.distanceTo(d) / vS, n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    B.add(key, quadG(a, b, c, d, [0, 0], [u1, 0], [u1, v1], [0, v1], n), Object.assign({ col }, o)); B.add(key, quadG(a, d, c, b, [0, 0], [0, v1], [u1, v1], [u1, 0], n.clone().negate()), Object.assign({ col }, o));
  }
  /** Треугольник с двух сторон. */
  function triQ(B, key, col, a, b, c, uvs, o) {
    a = toV(a); b = toV(b); c = toV(c); const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize(), mk = (p, q, r, uvq, nn) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z], 3)); g.setAttribute('normal', new T.Float32BufferAttribute([nn.x, nn.y, nn.z, nn.x, nn.y, nn.z, nn.x, nn.y, nn.z], 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvq, 2)); return g; };
    const u = uvs || [0, 0, 1, 0, 0.5, 1]; B.add(key, mk(a, b, c, u, n), Object.assign({ col }, o)); B.add(key, mk(a, c, b, [u[0], u[1], u[4], u[5], u[2], u[3]], n.clone().negate()), Object.assign({ col }, o));
  }
  /** Гладкая траектория по контрольным точкам (CatmullRom). */
  function curvePts(ctrl, n) { return new T.CatmullRomCurve3(ctrl.map(toV), false, 'catmullrom', 0.3).getPoints(n || 24); }
  /** Труба-воздуховод с фланцами каждые step метров. */
  function duct(B, ctrl, r, col, n, step) {
    const pts = curvePts(ctrl, n || 30); B.add('metal', tube(pts, pts.map(() => r), 12, { uRep: 1, vRep: 0.5 }), { col });
    let acc = 0; for (let i = 1; i < pts.length; i++) { acc += pts[i].distanceTo(pts[i - 1]); if (acc > (step || 1.4)) { acc = 0; const dir = pts[i].clone().sub(pts[i - 1]); rod(B, 'metal', pts[i].clone().addScaledVector(dir.normalize(), -0.04), pts[i].clone().addScaledVector(dir, 0.04), r * 1.18, 12, mulc(col, 0.8)); } }
  }
  /** Куча по полярной сетке (опилки/щепа): радиус R, высота H, материал 'chips'. */
  function mound(B, x, z, R, H, sd, tone) {
    const NU = 28, NV = 8, Rth = (th) => R * (0.88 + 0.2 * Math.sin(th * 3 + sd) + 0.12 * (vn(Math.cos(th) + sd, Math.sin(th), 3) - 0.5)), pos = (th, rho) => { const rr = Rth(th) * rho; return [Math.cos(th) * rr, H * Math.pow(Math.max(0, 1 - rho * rho), 0.8) * (0.9 + 0.2 * vn(Math.cos(th) * 1.5 + sd, Math.sin(th) * 1.5, 1)) + (rho < 1 ? 0.012 : 0), Math.sin(th) * rr]; };
    const g = grid(NU, NV, (i, j) => pos(i / NU * TAU, j / NV), (i, j) => { const p = pos(i / NU * TAU, j / NV); return [p[0] / 0.7, p[2] / 0.7]; }, true);
    B.add('chips', g, { m: MX(x, 0, z, 0, 0, 0), col: (px, py, pz) => mulc(tone || [0.95, 0.9, 0.8], 0.82 + 0.3 * fbm(px * 3 + sd, pz * 3, 1.3, 3) + 0.2 * py / H) });
  }
  /** Паллет 1.2 x 0.8 x 0.15 (3 бруска, настил, нижние доски). */
  function pallet(B, x, y, z, ry, col) {
    const m = MX(x, y, z, 0, ry || 0, 0), c = col || [0.7, 0.58, 0.42], P = (key, sx, sy, sz, px, py, pz) => B.add(key, boxG(), { m: m.clone().multiply(MX(px, py, pz, 0, 0, 0, sx, sy, sz)), col: c, uvt: [0, 0.3, Math.max(sx, sz) / 1.0, 0.1], ao: 0 });
    for (const bx of [-0.52, 0, 0.52]) P('timberL', 0.1, 0.09, 0.8, bx, 0.065, 0);
    for (let i = 0; i < 5; i++) P('timberL', 1.2, 0.022, 0.1, 0, 0.113 + 0.011, -0.34 + i * 0.17);
    for (const bz of [-0.34, 0, 0.34]) P('timberL', 1.2, 0.022, 0.1, 0, 0.011, bz);
  }
})();
