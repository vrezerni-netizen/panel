/* Модели животных, деревьев и мелкого реквизита фермы (процедурные, three.js r128).
   kind: 'animal' | 'tree' | 'prop'. Перед модели смотрит в +Z, начало координат — центр опоры на земле, 1 единица ~ 1 м.
   Каждая модель собирается один раз на набор opts (seed квантуется до 0..15), дальше отдаётся клон с общей геометрией. */
(function () {
  'use strict';
  const C = window.FarmCore, T = C.T, FM = window.FarmModels;
  if (!C || !FM) return;
  const mat = C.mat, texMat = C.texMat;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash3(i, j, k) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    const a = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
    return lerp(lerp(lerp(a(0, 0, 0), a(1, 0, 0), xf), lerp(a(0, 1, 0), a(1, 1, 0), xf), yf), lerp(lerp(a(0, 0, 1), a(1, 0, 1), xf), lerp(a(0, 1, 1), a(1, 1, 1), xf), yf), zf);
  }
  const hex = (c) => new T.Color(c);
  /** смешать два цвета (hex) -> hex */
  const mix = (a, b, t) => hex(a).lerp(hex(b), t).getHex();
  /** яркость hex * k */
  const shade = (a, k) => hex(a).multiplyScalar(k).getHex();

  // ------------------------------------------------------------------ регистрация с кэшем
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = opts || {};
      const o = { level: opts.level | 0, variant: opts.variant | 0, seed: (opts.seed | 0) & 15, stage: opts.stage | 0, length: opts.length };
      const key = [kind, name, o.level, o.variant, o.seed, o.stage, o.length].join('|');
      if (!_cache[key]) _cache[key] = fn(o);
      const out = _cache[key].clone(true), t0 = Math.random() * 6;
      out.traverse((g) => {                               // userData.spin: группа сама вращается вокруг Y (1 = 1.2 рад/с), игре ничего делать не нужно
        if (!g.userData || !g.userData.spin) return;
        const rate = 1.2 * g.userData.spin;
        g.traverse((m) => { if (m.isMesh) m.onBeforeRender = () => { g.rotation.y = (t0 + performance.now() * 0.001 * rate) % TAU; }; });
      });
      return out;
    });
  }

  // ------------------------------------------------------------------ геометрия и сборка
  const DM = new T.MeshLambertMaterial({ color: 0xffffff }); // общий материал для всех ненарисованных частей: цвет хранится в userData.color
  const _g = {};
  const G_ = (k, f) => _g[k] || (_g[k] = f());
  const boxG = () => G_('b', () => new T.BoxGeometry(1, 1, 1));
  const sphG = (w, h) => G_('s' + w + ',' + h, () => new T.SphereGeometry(0.5, w, h));
  const cylG = (rt, rb, seg, open) => G_('c' + rt + ',' + rb + ',' + seg + (open ? 'o' : ''), () => new T.CylinderGeometry(rt, rb, 1, seg, 1, !!open));
  const UP = new T.Vector3(0, 1, 0);

  /** Универсальное добавление меша: color — hex (хранится в userData.color), o.mat — готовый материал (текстура). */
  function add(g, geom, color, x, y, z, sx, sy, sz, o) {
    o = o || {};
    const m = new T.Mesh(geom, o.mat || DM);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (color != null) m.userData.color = color;
    if (o.vc) m.userData.vc = o.vc;
    if (o.pr) m.userData.pr = o.pr;
    if (o.grad) m.userData.grad = o.grad;
    if (o.keep) m.userData.keep = 1;
    if (o.jit != null) m.userData.jit = o.jit;
    m.castShadow = m.receiveShadow = true;
    g.add(m); return m;
  }
  /** box: центр (x,y,z), размеры (w,h,d) */
  const bx = (g, c, x, y, z, w, h, d, o) => add(g, boxG(), c, x, y, z, w, h, d, o);
  /** сфера/эллипсоид: центр, размеры по осям (диаметры) */
  const sp = (g, c, x, y, z, w, h, d, o) => { o = o || {}; return add(g, sphG(o.ws || 10, o.hs || 7), c, x, y, z, w, h, d == null ? w : d, o); };
  /** цилиндр вдоль Y: центр, радиусы верх/низ, высота */
  const cy = (g, c, x, y, z, rt, rb, h, o) => { o = o || {}; return add(g, cylG(rt, rb, o.seg || 8, o.open), c, x, y, z, 1, h, 1, o); };
  /** конус вершиной вверх: центр, радиус основания, высота */
  const cn = (g, c, x, y, z, r, h, o) => { o = o || {}; return add(g, cylG(0, r, o.seg || 7, o.open), c, x, y, z, 1, h, 1, o); };
  /** цилиндр между точками a (радиус r1) и b (радиус r2) */
  function bm(g, c, a, b, r1, r2, o) {
    o = o || {};
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1e-4;
    const m = add(g, cylG(r2, r1, o.seg || 6, o.open), c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1, len, 1, o);
    m.quaternion.setFromUnitVectors(UP, new T.Vector3(dx / len, dy / len, dz / len)); return m;
  }
  /** брус между точками a и b, сечение w x d (оба вокруг оси) */
  function bb(g, c, a, b, w, d, o) {
    o = o || {};
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1e-4;
    const m = add(g, boxG(), c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, w, len, d, o);
    m.quaternion.setFromUnitVectors(UP, new T.Vector3(dx / len, dy / len, dz / len)); return m;
  }

  /** икосаэдр с шумом: «комок» кроны, камня, куста */
  function blobGeo(seed, detail, noise, flat, freq) {
    const g = detail === 'o' ? new T.OctahedronGeometry(1, 1) : new T.IcosahedronGeometry(1, detail), p = g.attributes.position, ox = seed * 7.13 + 1.7, oy = seed * 3.91 + 9.1, oz = seed * 5.37 + 4.3;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      const n = noise3(x * freq + ox, y * freq + oy, z * freq + oz) * 0.65 + noise3(x * freq * 2.3 + oy, y * freq * 2.3 + oz, z * freq * 2.3 + ox) * 0.35;
      const d = 1 + noise * (n * 2 - 1);
      p.setXYZ(i, x * d, y * d, z * d);
    }
    if (flat) g.computeVertexNormals(); else smoothNormals(g);
    return g;
  }
  /** сглаженные нормали для неиндексированной геометрии (по совпадающим позициям) */
  function smoothNormals(g) {
    const p = g.attributes.position, acc = new Map(), keyOf = (i) => Math.round(p.getX(i) * 2000) + ',' + Math.round(p.getY(i) * 2000) + ',' + Math.round(p.getZ(i) * 2000);
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.copy(c).sub(b).cross(a.clone().sub(b));
      for (let k = 0; k < 3; k++) { const key = keyOf(i + k); let v = acc.get(key); if (!v) { v = new T.Vector3(); acc.set(key, v); } v.add(n); }
    }
    const out = new Float32Array(p.count * 3), t = new T.Vector3();
    for (let i = 0; i < p.count; i++) { t.copy(acc.get(keyOf(i))).normalize(); out[i * 3] = t.x; out[i * 3 + 1] = t.y; out[i * 3 + 2] = t.z; }
    g.setAttribute('normal', new T.BufferAttribute(out, 3));
  }
  /** эллипсоидный комок с радиусами (rx,ry,rz) */
  function blob(g, c, x, y, z, rx, ry, rz, seed, o) {
    o = o || {};
    return add(g, blobGeo(seed, o.detail == null ? 1 : o.detail, o.noise == null ? 0.16 : o.noise, o.flat, o.freq || 1.3), c, x, y, z, rx, ry, rz, o);
  }

  /** Труба по пути: st = [[z, y, rx, ry], ...] — кольца (суперэллипс степени p) вдоль линии в плоскости YZ, кольцо перпендикулярно касательной.
      Концы стягиваются в точку. Даёт гладкие туловища, шеи, головы. */
  function tubeGeo(st, seg, p) {
    seg = seg || 12; p = p || 2; const pos = [], idx = [], n = st.length, e = 2 / p;
    for (let i = 0; i < n; i++) {
      const a = st[Math.max(0, i - 1)], b = st[Math.min(n - 1, i + 1)];
      let tz = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
      const uy = tz, uz = -ty, s = st[i];                      // U = T x X
      for (let j = 0; j < seg; j++) {
        const an = j / seg * TAU, ca = Math.cos(an), sa = Math.sin(an);
        const cx = Math.sign(ca) * Math.pow(Math.abs(ca), e) * s[2], cu = Math.sign(sa) * Math.pow(Math.abs(sa), e) * s[3];
        pos.push(cx, s[1] + uy * cu, s[0] + uz * cu);
      }
    }
    const c0 = pos.length / 3; pos.push(0, st[0][1], st[0][0]); const c1 = c0 + 1; pos.push(0, st[n - 1][1], st[n - 1][0]);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
      idx.push(a, b, c, b, d, c);
    }
    for (let j = 0; j < seg; j++) { idx.push((j + 1) % seg, j, c0); idx.push((n - 1) * seg + j, (n - 1) * seg + (j + 1) % seg, c1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /** точка на пути трубы (t от 0 до 1) -> {y, z, ry, uy, uz}: для гривы, шерсти и т.п. */
  function tubePt(st, t) {
    const f = clamp(t, 0, 1) * (st.length - 1), i = Math.min(st.length - 2, Math.floor(f)), k = f - i, a = st[i], b = st[i + 1];
    let tz = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
    return { z: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), rx: lerp(a[2], b[2], k), ry: lerp(a[3], b[3], k), uy: tz, uz: -ty };
  }
  const tb = (g, c, st, o) => { o = o || {}; return add(g, tubeGeo(st, o.seg || 12, o.p || 2), c, 0, 0, 0, 1, 1, 1, o); };

  /** перевернуть грани (для внутренней стороны стенок) */
  function invGeo(g) {
    g = g.index ? g.toNonIndexed() : g.clone(); const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z);
      const a = n.getX(i + 1), b = n.getY(i + 1), c = n.getZ(i + 1); n.setXYZ(i + 1, n.getX(i + 2), n.getY(i + 2), n.getZ(i + 2)); n.setXYZ(i + 2, a, b, c);
      if (u) { const uu = u.getX(i + 1), vv = u.getY(i + 1); u.setXY(i + 1, u.getX(i + 2), u.getY(i + 2)); u.setXY(i + 2, uu, vv); }
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return g;
  }
  // ------------------------------------------------------------------ цвет через таблицы (переживает повторную склейку C.bakeTex)
  // C.bakeTex (world3d.js) выбрасывает атрибут color и красит меш одним цветом материала, поэтому деревья в «декоре» игры становились белыми.
  // Текстурные материалы она сохраняет вместе с UV, так что цвет вершины кодируется в UV двух таблиц:
  //  PAL  — палитра HSV: строка = оттенок и насыщенность (общие на треугольник), столбец = яркость (плавно по вершинам);
  //  RAMP — рампа по скаляру t из userData.pr (пятна коровы, полосы пчелы): резкие границы считает текстура на каждом пикселе.
  // Атрибут color остаётся в геометрии (для тех, кто подменит материал на vertexColors).
  const PAL_HQ = 96, PAL_SQ = 8, PAL_W = 64, PAL_H = PAL_HQ * PAL_SQ;
  function hsv2rgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (((i % 6) + 6) % 6) { case 0: return [v, t, p]; case 1: return [q, v, p]; case 2: return [p, v, t]; case 3: return [p, q, v]; case 4: return [t, p, v]; default: return [v, p, q]; }
  }
  function rgb2hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
    return [h, mx > 1e-6 ? d / mx : 0, mx];
  }
  const palData = new Uint8Array(PAL_W * PAL_H * 4);
  for (let hi = 0; hi < PAL_HQ; hi++) for (let si = 0; si < PAL_SQ; si++) for (let x = 0; x < PAL_W; x++) {
    const rgb = hsv2rgb(hi / PAL_HQ, si / (PAL_SQ - 1), x / (PAL_W - 1)), o = ((hi * PAL_SQ + si) * PAL_W + x) * 4;
    palData[o] = Math.round(rgb[0] * 255); palData[o + 1] = Math.round(rgb[1] * 255); palData[o + 2] = Math.round(rgb[2] * 255); palData[o + 3] = 255;
  }
  const lutTex = (data, w, h) => { const t = new T.DataTexture(data, w, h, T.RGBAFormat); t.minFilter = t.magFilter = T.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  const PALM = new T.MeshLambertMaterial({ map: lutTex(palData, PAL_W, PAL_H) });
  const RAMP_W = 128, RAMP_H = 32, rampData = new Uint8Array(RAMP_W * RAMP_H * 4), rampRows = {}, rampTex = lutTex(rampData, RAMP_W, RAMP_H);
  const RAMPM = new T.MeshLambertMaterial({ map: rampTex });
  /** строка рампы: fn(t) -> [r,g,b] (0..1), t = 0..1 по ширине таблицы */
  function rampRow(key, fn) {
    if (rampRows[key] != null) return rampRows[key];
    const row = Math.min(RAMP_H - 1, Object.keys(rampRows).length); rampRows[key] = row;
    for (let x = 0; x < RAMP_W; x++) { const rgb = fn(x / (RAMP_W - 1)), o = (row * RAMP_W + x) * 4; rampData[o] = Math.round(clamp(rgb[0], 0, 1) * 255); rampData[o + 1] = Math.round(clamp(rgb[1], 0, 1) * 255); rampData[o + 2] = Math.round(clamp(rgb[2], 0, 1) * 255); rampData[o + 3] = 255; }
    rampTex.needsUpdate = true; return row;
  }
  /** рампа из двух цветов A и B с резким переходом на t = 0.5 (w — ширина перехода) */
  function rampTwo(A, B, w) {
    const a = hex(A), b = hex(B), row = rampRow(A + '-' + B, (t) => { const k = smooth(clamp((t - 0.5) / (w || 0.16) + 0.5, 0, 1)); return [lerp(a.r, b.r, k), lerp(a.g, b.g, k), lerp(a.b, b.b, k)]; });
    return { row, fill: (t, c) => c.copy(t > 0.5 ? b : a) };
  }

  // ------------------------------------------------------------------ запекание
  /** Склеивает всё в меши с таблицами цвета PAL/RAMP (+ текстурные по материалам). Прозрачное и o.keep остаётся отдельными мешами.
      userData меша: color (hex), jit (разброс яркости), grad [низ,верх] (яркость по локальной высоте),
      vc(x,y,z,nx,ny,nz,color) — функция покраски вершины (координаты в системе модели),
      pr {row, fill, t(x,y,z,nx,ny,nz)} — рампа (t = 0..1 интерполируется по треугольнику, цвет берётся из таблицы по пикселям).
      opt.gao — затемнение у земли. */
  function bake(group, opt) {
    opt = opt || {};
    const gao = opt.gao == null ? 0.16 : opt.gao, jitDef = opt.jit == null ? 0.07 : opt.jit;
    group.updateMatrixWorld(true);
    const buckets = new Map(), keep = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
    let idx = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const mt = o.material;
      if (mt.transparent || o.userData.keep) { keep.push(o); return; }
      const tex = !!mt.map, ud = o.userData, key = tex ? mt.uuid : ud.pr ? 'ramp' : 'pal';
      if (!buckets.has(key)) buckets.set(key, { mat: tex ? mt : ud.pr ? RAMPM : PALM, pos: [], nor: [], col: [], uv: [], tex });
      const B = buckets.get(key);
      let g = o.geometry; if (g.index) g = g.toNonIndexed();
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
      nm.getNormalMatrix(o.matrixWorld);
      if (!g.boundingBox) g.computeBoundingBox();
      const y0 = g.boundingBox.min.y, yh = (g.boundingBox.max.y - y0) || 1;
      const base = ud.color != null ? new T.Color(ud.color) : (mt.color ? mt.color.clone() : new T.Color(0xffffff));
      const jit = ud.jit != null ? ud.jit : jitDef;
      base.multiplyScalar(1 + (hash3(idx, 7, 3) - 0.5) * jit); idx++;
      const cols = [], ts = [];
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); const ly = v.y; v.applyMatrix4(o.matrixWorld);
        n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        B.pos.push(v.x, v.y, v.z); B.nor.push(n.x, n.y, n.z);
        if (B.tex) { B.uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0); continue; }
        if (ud.pr) {
          const t = clamp(ud.pr.t(v.x, v.y, v.z, n.x, n.y, n.z), 0, 1); ud.pr.fill(t, c);
          B.col.push(c.r, c.g, c.b); B.uv.push((t * (RAMP_W - 1) + 0.5) / RAMP_W, (ud.pr.row + 0.5) / RAMP_H); continue;
        }
        c.copy(base);
        if (ud.vc) ud.vc(v.x, v.y, v.z, n.x, n.y, n.z, c);
        if (ud.grad) c.multiplyScalar(lerp(ud.grad[0], ud.grad[1], (ly - y0) / yh));
        if (gao > 0 && v.y < 0.7) c.multiplyScalar(1 - gao * (1 - Math.max(0, v.y) / 0.7));
        B.col.push(c.r, c.g, c.b); cols.push(c.r, c.g, c.b);
      }
      if (!B.tex && !ud.pr) {                           // палитра: на треугольник одна строка (оттенок/насыщенность), яркость у каждой вершины своя
        for (let i = 0; i + 2 < pa.count; i += 3) {
          const j = i * 3, mr = (cols[j] + cols[j + 3] + cols[j + 6]) / 3, mg = (cols[j + 1] + cols[j + 4] + cols[j + 7]) / 3, mb = (cols[j + 2] + cols[j + 5] + cols[j + 8]) / 3;
          const hs = rgb2hsv(mr, mg, mb), row = ((Math.round(hs[0] * PAL_HQ) % PAL_HQ) * PAL_SQ + clamp(hs[1], 0, 1) * (PAL_SQ - 1) + 0.5) / PAL_H;
          for (let k = 0; k < 3; k++) { const br = clamp(Math.max(cols[j + k * 3], cols[j + k * 3 + 1], cols[j + k * 3 + 2]), 0, 1); B.uv.push((br * (PAL_W - 1) + 0.5) / PAL_W, row); }
        }
      }
    });
    if (opt.floor != null) {                            // сдвиг по Y: самая низкая точка = opt.floor
      let mn = 1e9; for (const B of buckets.values()) for (let i = 1; i < B.pos.length; i += 3) mn = Math.min(mn, B.pos[i]);
      for (const K of keep) { /* прозрачные не учитываются */ }
      const dy = opt.floor - mn; for (const B of buckets.values()) for (let i = 1; i < B.pos.length; i += 3) B.pos[i] += dy;
    }
    const out = new T.Group();
    for (const B of buckets.values()) {
      const geom = new T.BufferGeometry();
      geom.setAttribute('position', new T.Float32BufferAttribute(B.pos, 3)); geom.setAttribute('normal', new T.Float32BufferAttribute(B.nor, 3));
      geom.setAttribute('uv', new T.Float32BufferAttribute(B.uv, 2)); if (!B.tex) geom.setAttribute('color', new T.Float32BufferAttribute(B.col, 3));
      const m = new T.Mesh(geom, B.mat); m.castShadow = true; m.receiveShadow = true; out.add(m);
    }
    const km = new Map();                               // прозрачное и светящееся: склеиваем по материалу
    for (const o of keep) {
      let K = km.get(o.material.uuid); if (!K) { K = { mat: o.material, pos: [], nor: [], shadow: !o.material.transparent }; km.set(o.material.uuid, K); }
      let g = o.geometry; if (g.index) g = g.toNonIndexed();
      const pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); K.pos.push(v.x, v.y, v.z); K.nor.push(n.x, n.y, n.z); }
    }
    for (const K of km.values()) {
      const geom = new T.BufferGeometry(); geom.setAttribute('position', new T.Float32BufferAttribute(K.pos, 3)); geom.setAttribute('normal', new T.Float32BufferAttribute(K.nor, 3));
      const m = new T.Mesh(geom, K.mat); m.castShadow = K.shadow; m.receiveShadow = false; out.add(m);
    }
    return out;
  }

  // ------------------------------------------------------------------ процедурные текстуры (светлые, тон задаёт материал)
  C.addProc('prop_grain', (cv, g) => { // волокна дерева вдоль U
    const s = cv.width, r = lcg(41); g.fillStyle = '#e2d4bd'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { const y = r() * s, k = r(); g.strokeStyle = `rgba(${k < 0.5 ? '90,66,40' : '255,244,222'},${0.06 + r() * 0.14})`; g.lineWidth = 0.6 + r() * 1.8; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 8, s * 0.65, y + (r() - 0.5) * 8, s, y + (r() - 0.5) * 6); g.stroke(); }
    for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(80,56,32,0.28)'; g.beginPath(); g.ellipse(r() * s, r() * s, 7 + r() * 5, 3 + r() * 2, 0, 0, TAU); g.fill(); }
  }, 128);
  C.addProc('prop_straw', (cv, g) => { // солома: боковина тюка
    const s = cv.width, r = lcg(53); g.fillStyle = '#c9ae5e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 520; i++) { const x = r() * s, y = r() * s, l = 8 + r() * 26, k = r(); g.strokeStyle = k < 0.45 ? `rgba(246,226,150,${0.25 + r() * 0.35})` : `rgba(120,90,36,${0.12 + r() * 0.25})`; g.lineWidth = 0.8 + r() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 3); g.stroke(); }
  }, 128);
  C.addProc('prop_hayend', (cv, g) => { // торец рулона: спираль
    const s = cv.width, r = lcg(61); g.fillStyle = '#bfa352'; g.fillRect(0, 0, s, s);
    for (let rr = s * 0.02; rr < s * 0.5; rr += 2.2) { g.strokeStyle = `rgba(${r() < 0.5 ? '240,220,140' : '110,82,32'},${0.25 + r() * 0.3})`; g.lineWidth = 1 + r() * 1.2; g.beginPath(); for (let a = 0; a < TAU + 0.1; a += 0.15) { const q = rr + a * 0.35; g.lineTo(s / 2 + Math.cos(a) * q, s / 2 + Math.sin(a) * q); } g.stroke(); }
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.55); gr.addColorStop(0, 'rgba(60,40,10,0)'); gr.addColorStop(1, 'rgba(60,40,10,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }, 128);
  C.addProc('prop_pad', (cv, g) => { // бетонная площадка 14 x 9 м с жёлтой разметкой (рисуем в метрах)
    const s = cv.width, r = lcg(73); g.fillStyle = '#9b9a94'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) { const k = r(); g.fillStyle = k < 0.5 ? `rgba(70,66,58,${r() * 0.08})` : `rgba(255,252,240,${r() * 0.1})`; g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3); }
    g.save(); g.scale(s / 14, s / 9);
    g.strokeStyle = 'rgba(60,56,50,0.35)'; g.lineWidth = 0.035; // швы плит
    for (let x = 0; x <= 14.01; x += 3.5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 9); g.stroke(); }
    for (let y = 0; y <= 9.01; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(14, y); g.stroke(); }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(30,28,26,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(1 + r() * 12, 1 + r() * 7, 0.2 + r() * 0.5, 0.1 + r() * 0.2, r() * 3, 0, TAU); g.fill(); } // масляные пятна
    g.strokeStyle = '#e1b62d'; g.lineWidth = 0.17; g.lineJoin = 'miter'; g.strokeRect(0.55, 0.55, 12.9, 7.9);
    g.lineWidth = 0.11; g.setLineDash([0.9, 0.7]); g.beginPath(); g.moveTo(7, 0.9); g.lineTo(7, 8.1); g.stroke(); g.setLineDash([]);
    g.lineWidth = 0.1; for (const [x, y] of [[0.55, 0.55], [13.45, 0.55], [0.55, 8.45], [13.45, 8.45]]) { g.beginPath(); g.arc(x, y, 0.5, 0, TAU); g.stroke(); }
    g.restore();
  }, 1024);
  C.addProc('prop_sign', (cv, g) => { // табличка с условным текстом (холст 256x256 растянут на доску ~1 x 0.28 м)
    const s = cv.width, r = lcg(83); g.fillStyle = '#e8dcc2'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#4a3320'; g.lineWidth = 14; g.strokeRect(7, 14, s - 14, s - 28);
    g.fillStyle = '#3a2a1c'; let x = 34;
    while (x < s - 60) { const w = 14 + r() * 18; g.fillRect(x, 78, w * 0.42, 100); g.fillRect(x, 78, w, 22); if (r() < 0.6) g.fillRect(x, 130, w, 18); x += w + 14; }
  }, 256);
  C.addProc('prop_stripes', (cv, g) => { // жёлто-чёрные полосы (тумбы)
    const s = cv.width; g.fillStyle = '#e3b72b'; g.fillRect(0, 0, s, s); g.fillStyle = '#27251f';
    for (let i = 0; i < 2; i++) g.fillRect(0, i * s / 2 + s / 4, s, s / 4);
  }, 64);
  C.addProc('prop_plaid', (cv, g) => { // клетчатая рубашка чучела
    const s = cv.width; g.fillStyle = '#a8412f'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(30,20,20,0.45)'; for (let i = 0; i < 4; i++) { g.fillRect(i * s / 4 + s / 16, 0, s / 8, s); g.fillRect(0, i * s / 4 + s / 16, s, s / 8); }
    g.fillStyle = 'rgba(240,220,190,0.35)'; for (let i = 0; i < 4; i++) { g.fillRect(i * s / 4 + s / 5, 0, 3, s); g.fillRect(0, i * s / 4 + s / 5, s, 3); }
  }, 64);

  const grainMat = (tint) => texMat('prop_grain', 1, 1, tint, 0, 0, 0, { color: tint });
  const strawMat = () => texMat('prop_straw', 1, 1, 0xffffff, 0, 0, 0, { color: 0xffffff });
  const strawEndMat = () => texMat('prop_hayend', 1, 1, 0xffffff, 0, 0, 0, { color: 0xffffff });
  const concreteMat = (tint, rx, ry) => texMat('concrete', rx || 1, ry || 1, tint, 0, 0, 0, { color: tint });
  const WATERM = (col, op) => new T.MeshLambertMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
  const GLOWM = (col) => new T.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.9 });

  // ================================================================== ЖИВОТНЫЕ
  /** пятна: A — основной цвет, B — цвет пятен, thr — порог (больше = меньше пятен), sc — масштаб, lowWhite — ниже этой высоты нога светлеет до A.
      Возвращает рампу {row, fill, t}: поле t интерполируется по треугольнику, а резкую границу пятна рисует таблица на каждом пикселе. */
  function patches(seed, A, B, thr, sc, lowWhite) {
    const ox = seed * 3.7 + 1.3, oy = seed * 5.1 + 2.9, oz = seed * 2.3 + 7.7, ramp = rampTwo(A, B, 0.16);
    return {
      row: ramp.row, fill: ramp.fill,
      t: (x, y, z) => {
        const n = noise3(x * sc + ox, y * sc * 1.2 + oy, z * sc + oz) * 0.7 + noise3(x * sc * 2.4 + oy, y * sc * 2.4 + oz, z * sc * 2.4 + ox) * 0.3;
        let t = clamp((n - thr) / 0.1 + 0.5, 0, 1);
        if (lowWhite != null && y < lowWhite) t *= 1 - clamp((lowWhite - y) / (lowWhite * 0.5), 0, 1);
        return t;
      },
    };
  }
  const both = (f) => { f(1); f(-1); };
  const sub = (g, x, y, z, rx, ry, rz) => { const s = new T.Group(); s.position.set(x, y, z); s.rotation.order = 'YXZ'; s.rotation.set(rx || 0, ry || 0, rz || 0); g.add(s); return s; };
  const eyeP = (g, x, y, z, s, bg, pu) => { sp(g, bg, x, y, z, s, s * 0.95, s * 0.6, { ws: 5, hs: 4, jit: 0 }); sp(g, pu, x * 1.03, y, z + s * 0.16, s * 0.6, s * 0.6, s * 0.4, { ws: 4, hs: 3, jit: 0 }); };

  // ---------------------------------------------------------------- корова (голштинская), ~2.6 x 1.5 м
  reg('animal', 'cow', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 131 + 7), brown = o.seed % 5 === 4;
    const WH = 0xefece3, BK = brown ? 0x70432a : 0x1e1d1c, PINK = 0xdca9a2, HOOF = 0x2a2420, NOSE = 0xc3a099;
    const pat = patches(o.seed, WH, BK, 0.5, 1.25, 0.55), patH = patches(o.seed + 3, WH, BK, 0.4, 1.5, null);
    const graze = o.seed % 4 === 3, yaw = (r() - 0.5) * 0.7, S = 0.96 + r() * 0.08;
    tb(g, WH, [[-1.02, 1.2, 0.16, 0.22], [-0.9, 1.18, 0.3, 0.36], [-0.6, 1.1, 0.39, 0.45], [-0.2, 1.03, 0.41, 0.47], [0.2, 1.03, 0.4, 0.47], [0.55, 1.08, 0.36, 0.47], [0.82, 1.12, 0.28, 0.4], [1.0, 1.15, 0.2, 0.3]], { seg: 12, p: 2.4, pr: pat, jit: 0.03 });
    const hy = graze ? 0.86 : 1.27, hz = graze ? 1.42 : 1.24;
    tb(g, WH, [[0.8, 1.15, 0.22, 0.31], [1.0, graze ? 1.02 : 1.2, 0.18, 0.24], [hz, hy, 0.15, 0.19]], { seg: 10, p: 2.2, pr: patH, jit: 0.03 });
    const h = sub(g, 0, hy, hz, graze ? 1.0 : 0.38, yaw, 0);
    tb(h, WH, [[-0.14, 0.03, 0.11, 0.15], [0.0, 0.04, 0.155, 0.19], [0.18, 0.0, 0.15, 0.17], [0.32, -0.05, 0.12, 0.125], [0.44, -0.08, 0.125, 0.105]], { seg: 10, p: 2.2, pr: patH, jit: 0.03 });
    sp(h, PINK, 0, -0.085, 0.455, 0.235, 0.18, 0.1, { ws: 8, hs: 6, jit: 0 });
    both((s) => {
      sp(h, 0x2c1e1c, s * 0.06, -0.075, 0.505, 0.04, 0.03, 0.03, { ws: 4, hs: 3, jit: 0 });
      eyeP(h, s * 0.15, 0.1, 0.13, 0.07, 0xf4f1e8, 0x16100e);
      sp(h, BK, s * 0.255, 0.12, -0.02, 0.21, 0.045, 0.12, { ws: 5, hs: 4, r: [0, s * -0.3, s * -0.3], jit: 0.04 });          // ухо
      sp(h, PINK, s * 0.25, 0.115, -0.005, 0.14, 0.02, 0.075, { ws: 5, hs: 3, r: [0, s * -0.3, s * -0.3], jit: 0 });
      bm(h, 0xdad0b2, [s * 0.11, 0.19, -0.02], [s * 0.18, 0.3, -0.04], 0.035, 0.012, { seg: 5, jit: 0.03 }); // рожки
    });
    const leg = (x, z, hind) => {
      if (!hind) { sp(g, WH, x * 1.12, 1.0, z - 0.02, 0.2, 0.5, 0.4, { pr: pat, jit: 0.03, ws: 7, hs: 5 }); bm(g, WH, [x, 0.94, z], [x, 0.52, z + 0.02], 0.105, 0.085, { pr: pat, jit: 0.03, seg: 7 }); bm(g, WH, [x, 0.52, z + 0.02], [x, 0.1, z + 0.03], 0.075, 0.058, { pr: pat, jit: 0.03, seg: 6, open: true }); cy(g, HOOF, x, 0.055, z + 0.04, 0.062, 0.075, 0.11, { seg: 6, jit: 0.02 }); }
      else { sp(g, WH, x * 1.1, 1.0, z + 0.03, 0.24, 0.55, 0.5, { pr: pat, jit: 0.03, ws: 7, hs: 5 }); bm(g, WH, [x * 0.8, 0.98, z + 0.05], [x * 0.95, 0.56, z + 0.22], 0.13, 0.09, { pr: pat, jit: 0.03, seg: 7 }); bm(g, WH, [x * 0.95, 0.56, z + 0.22], [x, 0.1, z - 0.02], 0.08, 0.058, { pr: pat, jit: 0.03, seg: 6, open: true }); cy(g, HOOF, x, 0.055, z, 0.062, 0.075, 0.11, { seg: 6, jit: 0.02 }); }
    };
    both((s) => { leg(s * 0.23, 0.6, false); leg(s * 0.26, -0.62, true); });
    sp(g, PINK, 0, 0.68, -0.42, 0.34, 0.25, 0.4, { ws: 8, hs: 6, jit: 0.03 });
    for (const [x, z] of [[0.085, -0.32], [-0.085, -0.32], [0.085, -0.52], [-0.085, -0.52]]) cy(g, PINK, x, 0.55, z, 0.016, 0.022, 0.1, { seg: 5, jit: 0 });
    bm(g, WH, [0, 1.5, -0.95], [0, 0.82, -1.1], 0.04, 0.022, { pr: pat, jit: 0.03, seg: 5 });
    sp(g, BK, 0, 0.66, -1.1, 0.1, 0.34, 0.1, { ws: 6, hs: 5, jit: 0.03 });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.02 });
  });

  // ---------------------------------------------------------------- овца с густой шерстью
  reg('animal', 'sheep', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 97 + 5);
    const WOOL = [0xe9e4d6, 0xe2dccd, 0xf0ece0, 0xd9d3c3], DARK = o.seed % 3 === 1 ? 0x6a5846 : 0x39312c, S = 0.95 + r() * 0.1, yaw = (r() - 0.5) * 0.6;
    const wl = { grad: [0.78, 1.08], ws: 7, hs: 5, jit: 0.05 };
    sp(g, WOOL[0], 0, 0.6, 0, 0.58, 0.52, 0.92, { grad: [0.8, 1.05], ws: 9, hs: 6 });
    sp(g, WOOL[1], 0, 0.62, 0.36, 0.5, 0.5, 0.4, wl); sp(g, WOOL[2], 0, 0.62, -0.38, 0.52, 0.5, 0.4, wl);
    for (let i = 0; i < 13; i++) {
      const th = r() * TAU, u = (r() * 2 - 1) * 0.92, z = u * 0.42, rx = 0.25 * Math.sqrt(1 - u * u * 0.5);
      sp(g, WOOL[Math.floor(r() * 4)], Math.cos(th) * rx, 0.62 + Math.sin(th) * 0.2, z, 0.26 + r() * 0.12, 0.26 + r() * 0.1, 0.28 + r() * 0.1, wl);
    }
    sp(g, WOOL[1], 0, 0.78, 0.5, 0.34, 0.26, 0.3, wl);           // загривок
    sp(g, WOOL[3], 0, 0.56, -0.56, 0.16, 0.22, 0.16, wl);        // хвост
    const h = sub(g, 0, 0.7, 0.55, 0.28, yaw, 0);
    sp(h, DARK, 0, -0.05, 0.16, 0.18, 0.22, 0.32, { ws: 8, hs: 6, jit: 0.04 });
    sp(h, mix(DARK, 0x8a6a6a, 0.25), 0, -0.12, 0.3, 0.12, 0.1, 0.1, { ws: 6, hs: 5, jit: 0 });
    sp(h, WOOL[1], 0, 0.1, 0.02, 0.2, 0.12, 0.16, wl);           // чёлка
    both((s) => {
      sp(h, DARK, s * 0.13, 0.01, 0.02, 0.17, 0.04, 0.09, { ws: 6, hs: 4, r: [0.1, 0, s * -0.4], jit: 0.04 });
      sp(h, 0xdad4a8, s * 0.082, 0.02, 0.2, 0.035, 0.03, 0.02, { ws: 5, hs: 4, jit: 0 });
    });
    const leg = (x, z) => { bm(g, DARK, [x, 0.42, z], [x, 0.04, z], 0.046, 0.034, { seg: 6, open: true, jit: 0.04 }); bx(g, 0x241e1a, x, 0.025, z + 0.01, 0.07, 0.05, 0.095, { jit: 0.03 }); };
    both((s) => { leg(s * 0.14, 0.3); leg(s * 0.15, -0.3); });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.03 });
  });

  // ---------------------------------------------------------------- коза с рогами и бородой
  reg('animal', 'goat', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 71 + 11), k = o.seed % 3;
    const BASE = [0x8c6b47, 0xe9e2d3, 0x3a2f2a][k], SEC = [0xf0e8d8, 0x8a6840, 0xc59a62][k], HORN = 0x5d4c3a, S = 0.95 + r() * 0.1, yaw = (r() - 0.5) * 0.6;
    const pat = patches(o.seed, BASE, SEC, 0.55, 2.2, null);
    tb(g, BASE, [[-0.52, 0.76, 0.1, 0.17], [-0.38, 0.74, 0.17, 0.22], [-0.05, 0.7, 0.2, 0.23], [0.3, 0.72, 0.18, 0.23], [0.5, 0.75, 0.13, 0.18]], { seg: 10, p: 2.2, pr: pat });
    tb(g, BASE, [[0.38, 0.76, 0.12, 0.19], [0.52, 0.9, 0.09, 0.14], [0.66, 1.02, 0.08, 0.11]], { seg: 8, pr: pat });
    const h = sub(g, 0, 1.03, 0.66, 0.3, yaw, 0);
    tb(h, BASE, [[-0.08, 0.0, 0.07, 0.1], [0.06, 0.0, 0.09, 0.115], [0.2, -0.03, 0.065, 0.085], [0.32, -0.06, 0.05, 0.06]], { seg: 8, pr: pat });
    sp(h, 0x2a201c, 0, -0.065, 0.335, 0.07, 0.05, 0.04, { ws: 5, hs: 4, jit: 0 });
    cn(h, mix(BASE, 0xd8d0c0, 0.4), 0, -0.14, 0.2, 0.026, 0.14, { seg: 5, r: [PI, 0, 0], jit: 0.04 });   // борода
    both((s) => {
      eyeP(h, s * 0.075, 0.04, 0.12, 0.045, 0xe4d9a0, 0x16100e);
      sp(h, BASE, s * 0.13, 0.03, 0.0, 0.17, 0.04, 0.09, { pr: pat, ws: 6, hs: 4, r: [0, s * -0.1, s * -0.45] });
      bm(h, HORN, [s * 0.04, 0.09, 0.0], [s * 0.06, 0.17, -0.06], 0.03, 0.026, { seg: 5, jit: 0.05 });
      bm(h, HORN, [s * 0.06, 0.17, -0.06], [s * 0.075, 0.21, -0.17], 0.026, 0.02, { seg: 5, jit: 0.05 });
      bm(h, HORN, [s * 0.075, 0.21, -0.17], [s * 0.085, 0.2, -0.28], 0.02, 0.013, { seg: 5, jit: 0.05 });
      bm(h, HORN, [s * 0.085, 0.2, -0.28], [s * 0.09, 0.15, -0.35], 0.013, 0.006, { seg: 4, jit: 0.05 });
    });
    const leg = (x, z, hind) => {
      if (!hind) { bm(g, BASE, [x, 0.72, z], [x, 0.38, z + 0.02], 0.065, 0.04, { pr: pat, seg: 6, open: true }); bm(g, BASE, [x, 0.38, z + 0.02], [x, 0.05, z + 0.02], 0.036, 0.028, { pr: pat, seg: 6, open: true }); }
      else { sp(g, BASE, x * 1.2, 0.68, z + 0.02, 0.1, 0.3, 0.3, { pr: pat, ws: 7, hs: 5 }); bm(g, BASE, [x * 0.9, 0.7, z], [x, 0.4, z + 0.1], 0.07, 0.04, { pr: pat, seg: 6 }); bm(g, BASE, [x, 0.4, z + 0.1], [x, 0.05, z - 0.02], 0.038, 0.028, { pr: pat, seg: 6, open: true }); }
      bx(g, 0x2a2420, x, 0.025, z + (hind ? -0.02 : 0.03), 0.06, 0.05, 0.08, { jit: 0.02 });
    };
    both((s) => { leg(s * 0.12, 0.32, false); leg(s * 0.13, -0.32, true); });
    bm(g, BASE, [0, 0.88, -0.5], [0, 1.0, -0.55], 0.045, 0.022, { pr: pat, seg: 5 });
    sp(g, mix(BASE, 0xf0d0c0, 0.5), 0, 0.52, -0.32, 0.12, 0.1, 0.14, { ws: 6, hs: 5, jit: 0.03 });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.03 });
  });

  // ---------------------------------------------------------------- свинья
  reg('animal', 'pig', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 53 + 13), PINK = [0xe8aaa2, 0xe3a39b, 0xedb5ac, 0xdd9f98][o.seed % 4], SNOUT = 0xd68b86, S = 0.95 + r() * 0.1, yaw = (r() - 0.5) * 0.5;
    const spots = o.seed % 3 === 2 ? patches(o.seed, PINK, 0x4a3b36, 0.6, 1.7, null) : o.seed % 3 === 1 ? patches(o.seed, PINK, 0xc98479, 0.56, 1.8, null) : undefined;
    tb(g, PINK, [[-0.56, 0.52, 0.14, 0.2], [-0.42, 0.54, 0.25, 0.3], [-0.1, 0.53, 0.3, 0.33], [0.24, 0.53, 0.3, 0.33], [0.44, 0.52, 0.25, 0.29], [0.58, 0.5, 0.17, 0.21]], { seg: 12, p: 2.2, pr: spots });
    const h = sub(g, 0, 0.5, 0.55, 0.2, yaw, 0);
    tb(h, PINK, [[-0.12, 0.0, 0.15, 0.17], [0.04, 0.0, 0.18, 0.19], [0.2, -0.03, 0.14, 0.14], [0.32, -0.05, 0.11, 0.11]], { seg: 10, p: 2.2, pr: spots });
    cy(h, SNOUT, 0, -0.05, 0.37, 0.085, 0.09, 0.07, { seg: 10, r: [PI / 2, 0, 0], jit: 0.02 });
    sp(h, 0x7a3b3a, -0.03, -0.05, 0.41, 0.025, 0.035, 0.012, { ws: 5, hs: 4, jit: 0 }); sp(h, 0x7a3b3a, 0.03, -0.05, 0.41, 0.025, 0.035, 0.012, { ws: 5, hs: 4, jit: 0 });
    both((s) => {
      eyeP(h, s * 0.13, 0.05, 0.16, 0.04, 0xf2e4d0, 0x1c120f);
      sp(h, mix(PINK, 0xc98479, 0.3), s * 0.17, 0.16, 0.08, 0.17, 0.035, 0.17, { ws: 6, hs: 4, r: [0.7, s * 0.3, s * 0.5], jit: 0.04 }); // ухо
    });
    const leg = (x, z) => { bm(g, PINK, [x, 0.4, z], [x, 0.07, z], 0.075, 0.05, { seg: 6, open: true, jit: 0.03, pr: spots }); bx(g, 0x4a3631, x, 0.03, z + 0.01, 0.08, 0.06, 0.1, { jit: 0.02 }); };
    both((s) => { leg(s * 0.2, 0.3); leg(s * 0.2, -0.3); });
    add(g, G_('tor', () => new T.TorusGeometry(0.06, 0.016, 5, 10, PI * 1.7)), SNOUT, 0, 0.64, -0.6, 1, 1, 1, { r: [0, PI / 2, 0.9], jit: 0 }); // закрученный хвост
    g.scale.setScalar(S);
    return bake(g, { jit: 0.03 });
  });

  // ---------------------------------------------------------------- лошадь
  reg('animal', 'horse', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 41 + 3), k = o.seed % 5;
    const COAT = [0x7b4a2d, 0x9a5530, 0x28221f, 0xb4b1a9, 0xc7a066][k], MANE = [0x1f1814, 0x5e3219, 0x15110f, 0x8a8780, 0xe7dcc2][k], HOOF = 0x2a2420, S = 0.96 + r() * 0.08, yaw = (r() - 0.5) * 0.5;
    const socks = o.seed % 2 === 0, blaze = o.seed % 3 !== 1, legC = [0x2a1d16, COAT, 0x161210, 0x8f8c85, 0xc7a066][k];
    const pat = (x, y, z, nx, ny, nz, c) => { if (y < 0.7) c.lerp(hex(socks && y < 0.3 ? 0xece6da : legC), clamp((0.7 - y) / 0.2, 0, 1)); };
    tb(g, COAT, [[-0.98, 1.42, 0.14, 0.24], [-0.76, 1.34, 0.26, 0.39], [-0.4, 1.27, 0.31, 0.45], [0.0, 1.22, 0.31, 0.46], [0.4, 1.26, 0.29, 0.46], [0.7, 1.32, 0.24, 0.4], [0.92, 1.38, 0.18, 0.3]], { seg: 12, p: 2.3, vc: pat, jit: 0.025 });
    const NK = [[0.55, 1.38, 0.2, 0.24], [0.78, 1.58, 0.18, 0.27], [0.98, 1.82, 0.13, 0.2], [1.1, 2.0, 0.105, 0.16]];
    tb(g, COAT, NK, { seg: 10, p: 2.2, vc: pat, jit: 0.025 });
    const h = sub(g, 0, 2.0, 1.1, 0.95, yaw, 0);
    const hp = 0.95, headVc = (x, y, z, nx, ny, nz, c) => {
      const dx = x, dy = y - 2.0, dz = z - 1.1, c1 = Math.cos(-yaw), s1 = Math.sin(-yaw), x1 = dx * c1 + dz * s1, z1 = -dx * s1 + dz * c1, c2 = Math.cos(-hp), s2 = Math.sin(-hp);
      const y2 = dy * c2 - z1 * s2, z2 = dy * s2 + z1 * c2;
      if (blaze && Math.abs(x1) < 0.075 && y2 > 0.0 && z2 > 0.0 && z2 < 0.42) c.lerp(hex(0xeee8dc), clamp(1.15 - Math.abs(x1) / 0.07, 0, 1));
    };
    tb(h, COAT, [[-0.12, 0.03, 0.095, 0.14], [0.06, 0.0, 0.12, 0.17], [0.26, -0.04, 0.1, 0.13], [0.4, -0.08, 0.078, 0.1], [0.52, -0.1, 0.082, 0.088]], { seg: 12, p: 2.2, jit: 0.025, vc: headVc });
    sp(h, 0x1c1614, 0, -0.1, 0.52, 0.13, 0.09, 0.05, { ws: 6, hs: 5, jit: 0 });
    both((s) => {
      eyeP(h, s * 0.112, 0.07, 0.16, 0.05, 0xf1ead8, 0x120d0b);
      sp(h, 0x1c1614, s * 0.04, -0.09, 0.545, 0.03, 0.04, 0.02, { ws: 5, hs: 4, jit: 0 });
      cn(h, COAT, s * 0.075, 0.2, -0.02, 0.045, 0.17, { seg: 5, r: [-0.2, 0, s * -0.15], jit: 0.03 });
    });
    for (let i = 0; i <= 7; i++) { const t = i / 7, p = tubePt(NK, t), cy0 = p.y + p.uy * p.ry * 0.95, cz0 = p.z + p.uz * p.ry * 0.95; bb(g, MANE, [0, cy0 + 0.02, cz0 + 0.0], [0, cy0 - 0.2, cz0 - 0.07], 0.06, 0.09, { jit: 0.12 }); }
    bm(h, MANE, [0, 0.17, 0.0], [0, 0.07, 0.12], 0.045, 0.02, { seg: 5, jit: 0.1 });
    bm(g, COAT, [0, 1.5, -0.86], [0, 1.28, -1.04], 0.07, 0.05, { vc: pat, jit: 0.02, seg: 6 });
    bm(g, MANE, [0, 1.32, -1.04], [0, 0.5, -1.14], 0.055, 0.02, { jit: 0.1, seg: 6 }); bm(g, MANE, [0.04, 1.3, -1.04], [0.1, 0.55, -1.1], 0.04, 0.012, { jit: 0.1, seg: 5 }); bm(g, MANE, [-0.04, 1.3, -1.04], [-0.1, 0.52, -1.1], 0.04, 0.012, { jit: 0.1, seg: 5 });
    const leg = (x, z, hind) => {
      if (!hind) { sp(g, COAT, x * 1.1, 1.14, z - 0.02, 0.18, 0.46, 0.42, { vc: pat, jit: 0.025, ws: 7, hs: 5 }); bm(g, COAT, [x, 1.0, z], [x, 0.64, z + 0.02], 0.1, 0.075, { vc: pat, jit: 0.025, seg: 7 }); bm(g, COAT, [x, 0.64, z + 0.02], [x, 0.14, z + 0.03], 0.058, 0.046, { vc: pat, jit: 0.025, seg: 6, open: true }); }
      else { sp(g, COAT, x * 1.12, 1.08, z + 0.02, 0.2, 0.5, 0.46, { vc: pat, jit: 0.025, ws: 7, hs: 5 }); bm(g, COAT, [x * 0.8, 1.12, z + 0.05], [x * 0.95, 0.68, z + 0.2], 0.12, 0.078, { vc: pat, jit: 0.025, seg: 7 }); bm(g, COAT, [x * 0.95, 0.68, z + 0.2], [x, 0.14, z - 0.04], 0.062, 0.046, { vc: pat, jit: 0.025, seg: 6, open: true }); }
      sp(g, socks ? 0xece6da : legC, x, 0.1, z + (hind ? -0.05 : 0.04), 0.095, 0.12, 0.11, { ws: 6, hs: 5, jit: 0.03 });
      cy(g, HOOF, x, 0.045, z + (hind ? -0.05 : 0.04), 0.06, 0.07, 0.09, { seg: 7, jit: 0.02 });
    };
    both((s) => { leg(s * 0.19, 0.55, false); leg(s * 0.21, -0.62, true); });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.02 });
  });

  // ---------------------------------------------------------------- курица
  reg('animal', 'chicken', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 29 + 1), k = o.seed % 3;
    const BODY = [0xf0ede4, 0xa65d2e, 0x5a463a][k], TAILC = [0xe2ddd0, 0x2a1d17, 0x2a2420][k], S = 0.95 + r() * 0.1, yaw = (r() - 0.5) * 0.8, RED = 0xc4322b, ORG = 0xe2a02c;
    const fleck = k === 2 ? (x, y, z, nx, ny, nz, c) => { if (noise3(x * 38, y * 38, z * 38) > 0.62) c.lerp(hex(0xe9e1d2), 0.85); } : undefined;
    const b = sub(g, 0, 0, 0, -0.2, yaw * 0.3, 0);
    sp(b, BODY, 0, 0.27, 0.0, 0.26, 0.28, 0.4, { vc: fleck, ws: 9, hs: 7 });
    sp(b, BODY, 0, 0.34, 0.12, 0.2, 0.26, 0.2, { vc: fleck, ws: 7, hs: 5 });
    both((s) => sp(b, mix(BODY, 0x000000, 0.12), s * 0.115, 0.285, -0.02, 0.06, 0.18, 0.3, { vc: fleck, ws: 7, hs: 5, r: [-0.15, 0, s * 0.12], jit: 0.04 }));
    for (let i = -2; i <= 2; i++) bb(b, i % 2 ? TAILC : mix(TAILC, 0xffffff, 0.15), [i * 0.012, 0.32, -0.18], [i * 0.07, 0.5 - Math.abs(i) * 0.045, -0.33 - Math.abs(i) * 0.015], 0.075, 0.016, { jit: 0.06 });
    const SICK = k === 0 ? 0x2c3a33 : 0x1c1614;
    bm(b, SICK, [0, 0.33, -0.19], [0, 0.5, -0.3], 0.024, 0.016, { seg: 5, jit: 0 }); bm(b, SICK, [0, 0.5, -0.3], [0, 0.52, -0.4], 0.016, 0.006, { seg: 5, jit: 0 });
    bm(b, SICK, [0.02, 0.33, -0.19], [0.06, 0.48, -0.3], 0.018, 0.006, { seg: 4, jit: 0 }); bm(b, SICK, [-0.02, 0.33, -0.19], [-0.06, 0.48, -0.3], 0.018, 0.006, { seg: 4, jit: 0 });
    bm(b, BODY, [0, 0.4, 0.13], [0, 0.5, 0.18], 0.05, 0.036, { seg: 6 });
    const h = sub(b, 0, 0.5, 0.19, 0.05, 0, 0);
    sp(h, BODY, 0, 0.02, 0.01, 0.11, 0.13, 0.14, { ws: 7, hs: 5 });
    cn(h, ORG, 0, 0.0, 0.1, 0.028, 0.07, { seg: 5, r: [PI / 2, 0, 0], jit: 0 });
    for (let i = 0; i < 3; i++) sp(h, RED, 0, 0.1 + (i === 1 ? 0.012 : 0), 0.04 - i * 0.04, 0.025, 0.045 + (i === 1 ? 0.012 : 0), 0.04, { ws: 5, hs: 4, jit: 0 });
    sp(h, RED, 0, -0.06, 0.07, 0.03, 0.06, 0.025, { ws: 5, hs: 4, jit: 0 });
    both((s) => eyeP(h, s * 0.055, 0.035, 0.045, 0.02, 0xe6a23a, 0x120d0b));
    both((s) => {
      bm(g, ORG, [s * 0.055, 0.17, -0.02], [s * 0.055, 0.02, 0.0], 0.014, 0.011, { seg: 5, jit: 0.03 });
      for (const a of [-0.35, 0, 0.35]) bm(g, ORG, [s * 0.055, 0.012, 0.0], [s * 0.055 + Math.sin(a) * 0.05, 0.008, 0.06], 0.009, 0.006, { seg: 4, jit: 0 });
    });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.03 });
  });

  // ---------------------------------------------------------------- утка
  reg('animal', 'duck', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 37 + 9), k = o.seed % 3, S = 0.95 + r() * 0.1, yaw = (r() - 0.5) * 0.8;
    const white = k === 2, HEAD = white ? 0xf3f0e6 : 0x2e6b4b, BODY = white ? 0xf1eee4 : 0x9a9488, CHEST = white ? 0xf1eee4 : 0x7b5236, BILL = white ? 0xe9a02e : 0xc9c04a;
    const b = sub(g, 0, 0, 0, 0.18, yaw * 0.2, 0);
    sp(b, BODY, 0, 0.22, 0.0, 0.28, 0.24, 0.46, { ws: 10, hs: 7 });
    sp(b, CHEST, 0, 0.26, 0.13, 0.25, 0.22, 0.24, { ws: 8, hs: 6 });
    both((s) => sp(b, mix(BODY, 0x2a2420, white ? 0.06 : 0.28), s * 0.12, 0.26, -0.03, 0.06, 0.16, 0.32, { ws: 7, hs: 5, r: [0, 0, s * 0.12], jit: 0.04 }));
    cn(b, white ? 0xe9e5d8 : 0x2a2622, 0, 0.27, -0.27, 0.055, 0.12, { seg: 5, r: [-1.35, 0, 0], jit: 0.04 });
    bm(g, white ? BODY : 0xf0ede6, [0, 0.3, 0.17], [0, 0.42, 0.22], 0.055, 0.042, { seg: 6 });
    if (!white) bm(g, 0xf3f0e8, [0, 0.355, 0.195], [0, 0.375, 0.205], 0.056, 0.05, { seg: 7, jit: 0 });
    const h = sub(g, 0, 0.43, 0.22, 0.12, yaw, 0);
    sp(h, HEAD, 0, 0.01, 0.01, 0.12, 0.12, 0.15, { ws: 8, hs: 6 });
    sp(h, BILL, 0, -0.015, 0.1, 0.065, 0.024, 0.11, { ws: 7, hs: 4, jit: 0.02 });
    both((s) => eyeP(h, s * 0.052, 0.03, 0.05, 0.03, 0xf2d58a, 0x120d0b));
    both((s) => { bx(g, 0xe08a2a, s * 0.05, 0.075, 0.0, 0.016, 0.1, 0.016, { jit: 0.03 }); bx(g, 0xe08a2a, s * 0.052, 0.012, 0.035, 0.085, 0.016, 0.12, { jit: 0.03 }); });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.03 });
  });

  // ---------------------------------------------------------------- гусь
  reg('animal', 'goose', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 43 + 17), grey = o.seed % 3 === 1, S = 0.95 + r() * 0.1, yaw = (r() - 0.5) * 0.8;
    const BODY = grey ? 0x9b958a : 0xf2efe6, BELLY = grey ? 0xe6e1d4 : 0xf2efe6, NECK = grey ? 0xa9a396 : 0xf2efe6, BILL = 0xe99a2b;
    const b = sub(g, 0, 0, 0, 0.1, yaw * 0.2, 0);
    sp(b, BODY, 0, 0.4, 0.0, 0.38, 0.34, 0.68, { ws: 10, hs: 7 });
    sp(b, BELLY, 0, 0.33, 0.04, 0.32, 0.22, 0.54, { ws: 8, hs: 6 });
    sp(b, NECK, 0, 0.5, 0.26, 0.24, 0.3, 0.28, { ws: 8, hs: 6 });
    both((s) => sp(b, mix(BODY, 0x2a2420, grey ? 0.2 : 0.05), s * 0.17, 0.44, -0.04, 0.07, 0.22, 0.46, { ws: 7, hs: 5, r: [0, 0, s * 0.15], jit: 0.04 }));
    cn(b, grey ? 0xcfc9bb : 0xe9e5d8, 0, 0.45, -0.4, 0.09, 0.2, { seg: 5, r: [-1.4, 0, 0], jit: 0.03 });
    tb(g, NECK, [[0.2, 0.5, 0.12, 0.14], [0.27, 0.64, 0.085, 0.1], [0.33, 0.8, 0.062, 0.065], [0.35, 0.95, 0.054, 0.054], [0.4, 1.04, 0.052, 0.052]], { seg: 8 });
    const h = sub(g, 0, 1.05, 0.41, 0.2, yaw, 0);
    sp(h, NECK, 0, 0, 0.03, 0.1, 0.1, 0.17, { ws: 8, hs: 6 });
    cn(h, BILL, 0, -0.01, 0.14, 0.04, 0.12, { seg: 6, r: [PI / 2, 0, 0], jit: 0.02 }); sp(h, 0xc8741f, 0, 0.04, 0.1, 0.03, 0.03, 0.04, { ws: 5, hs: 4, jit: 0 });
    both((s) => eyeP(h, s * 0.048, 0.025, 0.06, 0.028, 0xe4d4a0, 0x120d0b));
    both((s) => { bm(g, BILL, [s * 0.075, 0.26, 0.0], [s * 0.075, 0.025, 0.02], 0.02, 0.014, { seg: 5, jit: 0.03 }); bx(g, BILL, s * 0.078, 0.013, 0.07, 0.1, 0.02, 0.15, { jit: 0.03 }); });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.03 });
  });

  // ---------------------------------------------------------------- пчела (крупная, читаемая), ~0.5 м
  reg('animal', 'bee', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 19 + 2), S = 1 + (r() - 0.5) * 0.12, YEL = 0xe8b021, BLK = 0x1d1a16;
    const yc = hex(YEL), bc = hex(BLK), BANDS = [0.15, 0.31, 0.46, 0.62, 0.77];             // границы полос вдоль брюшка: жёлтая, чёрная, жёлтая, ...
    const stripeRamp = rampRow('bee-stripes', (t) => {
      let k = 0; for (const b of BANDS) if (t > b) k++;
      let e = 1; for (const b of BANDS) e = Math.min(e, Math.abs(t - b));
      const cur = k % 2 ? bc : yc, oth = k % 2 ? yc : bc, mixk = 0.5 * (1 - smooth(clamp(e / 0.012, 0, 1)));  // у границы смешиваем с соседней полосой
      return [lerp(cur.r, oth.r, mixk), lerp(cur.g, oth.g, mixk), lerp(cur.b, oth.b, mixk)];
    });
    const stripe = { row: stripeRamp, fill: (t, c) => { let k = 0; for (const b of BANDS) if (t > b) k++; c.copy(k % 2 ? bc : yc); }, t: (x, y, z) => (0.05 * S - z) / (0.34 * S) };
    const thor = (x, y, z, nx, ny, nz, c) => { c.set(mix(0x8a5a1c, 0xd9a934, clamp(ny * 0.5 + 0.55, 0, 1))); };
    const by = 0.2;
    sp(g, YEL, 0, by, -0.12, 0.2, 0.19, 0.34, { pr: stripe, ws: 12, hs: 9, jit: 0 });
    sp(g, 0x1d1a16, 0, by - 0.005, -0.3, 0.07, 0.07, 0.08, { ws: 6, hs: 5, jit: 0 });
    cn(g, 0x2a2622, 0, by - 0.005, -0.37, 0.022, 0.1, { seg: 5, r: [-PI / 2, 0, 0], jit: 0 });
    sp(g, 0xc99a34, 0, by + 0.01, 0.1, 0.2, 0.2, 0.2, { vc: thor, ws: 10, hs: 8, jit: 0 });
    sp(g, 0x241e19, 0, by + 0.0, 0.24, 0.15, 0.15, 0.13, { ws: 8, hs: 6, jit: 0.03 });
    both((s) => {
      sp(g, 0x2d3a42, s * 0.068, by + 0.025, 0.27, 0.075, 0.09, 0.09, { ws: 7, hs: 6, jit: 0.03 });
      sp(g, 0xdcd9c8, s * 0.098, by + 0.045, 0.3, 0.018, 0.022, 0.014, { ws: 5, hs: 4, jit: 0 });
      bm(g, 0x1d1a16, [s * 0.03, by + 0.07, 0.3], [s * 0.07, by + 0.17, 0.36], 0.008, 0.006, { seg: 4, jit: 0 });
      bm(g, 0x1d1a16, [s * 0.07, by + 0.17, 0.36], [s * 0.1, by + 0.2, 0.43], 0.006, 0.005, { seg: 4, jit: 0 });
      sp(g, 0x1d1a16, s * 0.1, by + 0.2, 0.435, 0.026, 0.026, 0.026, { ws: 5, hs: 4, jit: 0 });
      for (const [z, zz] of [[0.16, 0.18], [0.09, 0.1], [0.02, -0.02]]) { bm(g, 0x241e19, [s * 0.05, by - 0.05, z], [s * 0.11, 0.07, zz], 0.012, 0.009, { seg: 4, jit: 0 }); bm(g, 0x241e19, [s * 0.11, 0.07, zz], [s * 0.13, 0.008, zz + 0.03], 0.009, 0.006, { seg: 4, jit: 0 }); }
      const w = (len, wid, z, t) => { const m = new T.Mesh(sphG(10, 6), WINGM); m.scale.set(len, 0.006, wid); m.position.set(s * (0.05 + 0.5 * len * Math.cos(t)), by + 0.1 + 0.5 * len * Math.sin(t), z); m.rotation.set(0, s * 0.3, s * t); m.castShadow = true; g.add(m); };
      w(0.3, 0.12, 0.05, 0.7); w(0.22, 0.09, -0.06, 0.55);
    });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.02, gao: 0 });
  });
  const WINGM = new T.MeshLambertMaterial({ color: 0xdfeaf4, transparent: true, opacity: 0.52, side: T.DoubleSide, depthWrite: false });

  // ================================================================== ДЕРЕВЬЯ
  const rdir = (r) => { const y = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - y * y); return [q * Math.cos(a), y, q * Math.sin(a)]; };
  /** крона из комков: cfg {c:[x,y,z], rad:[rx,ry,rz], n, rmin, rmax, dark, light, nSmall, noise, detail, sq, pts(out)} */
  function canopy(g, r, cfg) {
    const [cx, cy, cz] = cfg.c, [rx, ry, rz] = cfg.rad, sd = Math.floor(r() * 1000), pts = cfg.pts || [];
    // тёмная сердцевина, чтобы не было просветов
    blob(g, mix(cfg.dark, 0x000000, 0.18), cx, cy - ry * 0.1, cz, rx * 0.5, ry * 0.58, rz * 0.5, sd, { detail: 1, noise: 0.12, grad: [0.7, 1.0] });
    for (let i = 0; i < cfg.n; i++) {
      const d = rdir(r), k = 0.4 + 0.6 * Math.sqrt(r()), sq = d[1] < 0 ? 1 + d[1] * (cfg.sq == null ? 0.25 : cfg.sq) : 1;
      const x = cx + d[0] * rx * k, y = cy + d[1] * ry * k, z = cz + d[2] * rz * k;
      const br = lerp(cfg.rmin, cfg.rmax, r()) * (0.78 + 0.3 * k) * sq;
      const t = clamp(0.4 + 0.5 * d[1] * k + (r() - 0.5) * 0.5, 0, 1);
      blob(g, mix(cfg.dark, cfg.light, t), x, y, z, br * (cfg.hx || 1), br * (cfg.hy || 0.88), br * (cfg.hx || 1), sd + i * 7 + 1, { detail: cfg.detail == null ? 1 : cfg.detail, flat: cfg.flat, noise: cfg.noise == null ? 0.2 : cfg.noise, grad: [0.55, 1.16], jit: 0.14 });
      pts.push({ x, y, z, r: br, d });
    }
    for (let i = 0; i < (cfg.nSmall || 0); i++) {      // мелкие кластеры листвы по контуру
      const d = rdir(r), k = 0.86 + 0.26 * r();
      const t = clamp(0.5 + 0.5 * d[1] + (r() - 0.5) * 0.5, 0, 1), br = lerp(cfg.rmin, cfg.rmax, 0.4) * (0.55 + 0.25 * r());
      const x = cx + d[0] * rx * k, y = cy + d[1] * ry * k, z = cz + d[2] * rz * k;
      blob(g, mix(cfg.dark, cfg.light, t), x, y, z, br, br * 0.85, br, sd + i * 11 + 500, { detail: 0, flat: cfg.flat, noise: 0.28, grad: [0.6, 1.16], jit: 0.16 });
      pts.push({ x, y, z, r: br, d });
    }
    return pts;
  }
  const BARK = (seed) => (x, y, z, nx, ny, nz, c) => { c.multiplyScalar(0.82 + 0.3 * noise3(x * 5 + seed, y * 1.3, z * 5)); };

  // ---------------------------------------------------------------- дуб
  function oak(o, low) {
    const g = new T.Group(), r = lcg(o.seed * 211 + 5), S = 0.86 + r() * 0.28;
    const bark = mix(0x5a4632, 0x4a392a, r());
    if (low) {
      bm(g, bark, [0, 0, 0], [0, 3.4, 0], 0.5, 0.34, { seg: 5, open: true, grad: [0.55, 1], jit: 0.04 });
      const g2 = [mix(0x2d4e27, 0x35602c, r()), mix(0x4a7632, 0x58803a, r())];
      blob(g, g2[0], 0, 6.4, 0, 3.7, 2.7, 3.7, o.seed, { detail: 1, noise: 0.18, grad: [0.62, 1.1] });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + r(), up = i % 2; blob(g, mix(g2[0], g2[1], 0.3 + up * 0.5), Math.cos(a) * 2.4, 6.3 + up * 1.5, Math.sin(a) * 2.4, 1.9, 1.6, 1.9, o.seed + i + 3, { detail: 0, noise: 0.2, grad: [0.62, 1.12] }); }
      g.scale.setScalar(S); return bake(g, { jit: 0.05, gao: 0.2 });
    }
    // ствол с наплывами у корня
    bm(g, bark, [0, 0, 0], [0.12, 4.0, 0.05], 0.58, 0.34, { seg: 8, vc: BARK(o.seed), grad: [0.55, 1.05], jit: 0.04 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + r() * 0.6; bm(g, bark, [Math.cos(a) * 1.15, 0.0, Math.sin(a) * 1.15], [Math.cos(a) * 0.28, 1.1, Math.sin(a) * 0.28], 0.07, 0.3, { seg: 5, grad: [0.5, 1], jit: 0.05 }); }
    // толстые ветви и вершина
    const tips = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r() * 0.8, dist = 1.9 + r() * 0.9, hh = 5.6 + r() * 1.4; const tip = [Math.cos(a) * dist, hh, Math.sin(a) * dist]; tips.push(tip); bm(g, bark, [0.1, 3.2 + r() * 0.6, 0.05], tip, 0.27, 0.12, { seg: 6, grad: [0.7, 1], jit: 0.05 }); }
    bm(g, bark, [0.1, 3.4, 0.05], [0.0, 7.4, 0.0], 0.3, 0.12, { seg: 6, jit: 0.05 });
    const dk = mix(0x2a4a25, 0x2f5228, r()), lt = mix(0x58803a, 0x679046, r());
    canopy(g, r, { c: [0, 7.1, 0], rad: [4.4, 2.5, 4.4], n: 44, rmin: 0.85, rmax: 1.45, dark: dk, light: lt, nSmall: 14, noise: 0.28, detail: 'o' });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.05, gao: 0.2 });
  }
  reg('tree', 'oak', (o) => oak(o, false));
  reg('tree', 'oakLow', (o) => oak(o, true));

  // ---------------------------------------------------------------- ель/сосна: ярусы свисающих лап
  function pineLayer(R, H, seg, rng) {
    const P = [], rim = [], n = seg * 2;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (rng() - 0.5) * 0.12, big = i % 2 === 0, rr = R * (big ? 1 : 0.7) * (0.9 + rng() * 0.2), yy = big ? -0.04 * H : 0.2 * H + rng() * 0.05 * H;
      rim.push([Math.cos(a) * rr, yy, Math.sin(a) * rr]);
    }
    const apex = [(rng() - 0.5) * 0.1 * R, H, (rng() - 0.5) * 0.1 * R], ctr = [0, 0.3 * H, 0];
    for (let i = 0; i < n; i++) { const a = rim[i], b = rim[(i + 1) % n]; P.push(...apex, ...b, ...a); P.push(...ctr, ...a, ...b); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
  }
  function pine(o, low) {
    const g = new T.Group(), r = lcg(o.seed * 157 + 9), S = 0.86 + r() * 0.28, bark = 0x4e3b2b;
    const layers = low ? 6 : 13, seg = low ? 4 : 9, top = 11.6;
    bm(g, bark, [0, 0, 0], [0, top - 0.5, 0], 0.4, 0.07, { seg: low ? 5 : 7, open: low, grad: [0.55, 1], jit: 0.04 });
    const dark = mix(0x27472b, 0x2d502e, r()), light = mix(0x4a7a3c, 0x56853f, r());
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1), y = lerp(1.5, top - 2.2, t), R = lerp(3.4, 0.55, Math.pow(t, 0.9)) * (0.94 + r() * 0.12), H = lerp(2.9, 1.9, t);
      const m = add(g, pineLayer(R, H, seg, r), mix(dark, light, clamp(t * 0.9 + (r() - 0.5) * 0.3, 0, 1)), 0, y, 0, 1, 1, 1, { grad: [0.6, 1.1], jit: 0.1 });
      m.rotation.y = r() * TAU;
    }
    const m = add(g, pineLayer(0.4, 1.7, low ? 4 : 5, r), light, 0, top - 0.7, 0, 1, 1, 1, { grad: [0.8, 1.15], jit: 0.04 });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.05, gao: 0.18 });
  }
  reg('tree', 'pine', (o) => pine(o, false));
  reg('tree', 'pineLow', (o) => pine(o, true));

  // ---------------------------------------------------------------- берёза
  reg('tree', 'birch', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 83 + 21), S = 0.88 + r() * 0.24, WHITE = 0xe9e5db, lean = (r() - 0.5) * 0.5;
    const mark = (x, y, z, nx, ny, nz, c) => { c.multiplyScalar(0.9 + 0.2 * noise3(x * 4, y * 2, z * 4)); };
    bm(g, WHITE, [0, 0, 0], [lean * 0.4, 3.0, 0.1], 0.25, 0.19, { seg: 7, vc: mark, jit: 0.03 });
    bm(g, WHITE, [lean * 0.4, 3.0, 0.1], [lean, 5.2, 0.1], 0.19, 0.11, { seg: 7, vc: mark, jit: 0.03 });
    bm(g, 0x3a332c, [0, -0.02, 0], [0, 0.5, 0], 0.3, 0.27, { seg: 7, jit: 0.04 });
    const tips = [[1.1, 6.4, 0.4], [-0.9, 6.7, -0.6], [0.2, 7.0, 1.0], [-0.3, 6.2, -1.1]];
    for (const t of tips) bm(g, WHITE, [lean * 0.8, 4.0 + r() * 1.0, 0.1], [t[0] + lean, t[1], t[2]], 0.09, 0.04, { seg: 5, jit: 0.03 });
    for (let i = 0; i < 24; i++) {                     // тёмные поперечные отметины коры
      const y = 0.4 + r() * 4.6, a = r() * TAU, rad = y < 3 ? lerp(0.25, 0.19, y / 3) : lerp(0.19, 0.11, (y - 3) / 2.2), cx = lean * 0.4 * (y / 3);
      const w = 0.1 + r() * 0.1, bx0 = Math.cos(a) * rad * 0.98 + (y < 3 ? lean * 0.4 * y / 3 : lean * 0.4 + (lean * 0.6) * (y - 3) / 2.2), bz0 = Math.sin(a) * rad * 0.98 + 0.1 * (y / 5.2);
      bx(g, 0x2a2521, bx0, y, bz0, w, 0.03 + r() * 0.05, 0.04, { r: [0, -a + PI / 2, 0], jit: 0.05 });
    }
    canopy(g, r, { c: [lean * 1.1, 6.6, 0.1], rad: [2.5, 2.6, 2.5], n: 26, rmin: 0.75, rmax: 1.2, dark: mix(0x56803a, 0x628c3e, r()), light: mix(0x7ea34a, 0x92b454, r()), nSmall: 12, noise: 0.28, hy: 0.95, detail: 'o' });
    g.scale.setScalar(S);
    return bake(g, { jit: 0.05, gao: 0.15 });
  });

  // ---------------------------------------------------------------- плодовое дерево (яблоня/апельсин/груша по seed)
  reg('tree', 'fruit', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 61 + 33), S = 0.9 + r() * 0.2, k = (o.variant ? o.variant : o.seed) % 3;
    const bark = 0x5b4733, FR = [[0xc2392b, 0xd8503a, 0xa82e24], [0xe08a2a, 0xeb9d3a, 0xd47a1f], [0xb7c04a, 0xc9cf5c, 0xa3ae3d]][k];
    bm(g, bark, [0, 0, 0], [0.05, 1.8, 0], 0.3, 0.22, { seg: 7, vc: BARK(o.seed), grad: [0.55, 1], jit: 0.04 });
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r() * 0.8; bm(g, bark, [0.05, 1.6, 0], [Math.cos(a) * 1.3, 3.3 + r() * 0.6, Math.sin(a) * 1.3], 0.17, 0.08, { seg: 5, jit: 0.05 }); }
    const cfg = { c: [0, 4.0, 0], rad: [2.7, 1.8, 2.7], n: 24, rmin: 0.7, rmax: 1.15, dark: mix(0x436f2e, 0x4c7a33, r()), light: mix(0x6b9a3e, 0x79a845, r()), nSmall: 14, noise: 0.26, hy: 0.9, pts: [], detail: 'o' };
    canopy(g, r, cfg);
    for (let i = 0, n = 0; n < 30 && i < 200; i++) {   // плоды на внешней стороне комков
      const p = cfg.pts[Math.floor(r() * cfg.pts.length)]; if (!p || p.d[1] < -0.35 || p.r < 0.6) continue;
      const col = FR[Math.floor(r() * 3)]; n++;
      sp(g, col, p.x + p.d[0] * p.r * 0.95, p.y + p.d[1] * p.r * 0.85, p.z + p.d[2] * p.r * 0.95, 0.27, 0.27, 0.27, { ws: 5, hs: 4, jit: 0.08, grad: [0.8, 1.1] });
    }
    g.scale.setScalar(S);
    return bake(g, { jit: 0.05, gao: 0.15 });
  });

  // ---------------------------------------------------------------- тополь (колонна)
  reg('tree', 'poplar', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 47 + 14), S = 0.9 + r() * 0.2, bark = 0x62513e;
    bm(g, bark, [0, 0, 0], [0.04, 4.6, 0], 0.36, 0.2, { seg: 7, vc: BARK(o.seed), grad: [0.55, 1], jit: 0.04 });
    bm(g, bark, [0.04, 4.6, 0], [0, 11, 0], 0.2, 0.06, { seg: 5, jit: 0.04 });
    const dk = mix(0x44702d, 0x4e7a30, r()), lt = mix(0x6e9a3a, 0x7ba644, r()), sd = Math.floor(r() * 900), N = 26;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), y = 3.4 + t * 9.9, w = 0.5 + 1.0 * Math.pow(Math.sin(PI * clamp(0.1 + 0.9 * t, 0, 1)), 0.75), a = r() * TAU, off = 0.25 * (1 - t);
      const br = w * (0.85 + r() * 0.15), cl = clamp(0.35 + 0.5 * t + (r() - 0.5) * 0.35, 0, 1);
      blob(g, mix(dk, lt, cl), Math.cos(a) * off, y, Math.sin(a) * off, br, br * 1.3, br, sd + i * 5, { detail: 'o', noise: 0.26, grad: [0.62, 1.12], jit: 0.1 });
    }
    for (let i = 0; i < 14; i++) { const t = r(), y = 3.6 + t * 9.4, w = 0.5 + 1.0 * Math.pow(Math.sin(PI * clamp(0.1 + 0.9 * t, 0, 1)), 0.75), a = r() * TAU, br = 0.4 + 0.25 * r(); blob(g, mix(dk, lt, 0.6 + 0.4 * r()), Math.cos(a) * w * 0.95, y, Math.sin(a) * w * 0.95, br, br * 1.1, br, sd + i * 3 + 200, { detail: 0, noise: 0.25, grad: [0.7, 1.12], jit: 0.12 }); }
    g.scale.setScalar(S);
    return bake(g, { jit: 0.05, gao: 0.15 });
  });

  // ---------------------------------------------------------------- куст ~1.5 м
  reg('tree', 'bush', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 29 + 7), S = 0.85 + r() * 0.3, k = (o.variant ? o.variant : o.seed) % 3;
    const cfg = { c: [0, 0.72, 0], rad: [0.95, 0.55, 0.95], n: 18, rmin: 0.3, rmax: 0.52, dark: mix(0x335c28, 0x3d6a2c, r()), light: mix(0x5c8c38, 0x6a9a40, r()), nSmall: 10, noise: 0.28, sq: 0.05, hy: 1.0, pts: [], detail: 'o' };
    canopy(g, r, cfg);
    if (k > 0) for (let i = 0, n = 0; n < 18 && i < 200; i++) {          // цветы или ягоды
      const p = cfg.pts[Math.floor(r() * cfg.pts.length)]; if (!p || p.d[1] < 0.0) continue; n++;
      const col = k === 1 ? [0xf0d8e0, 0xe58aa8, 0xf5f0e6][Math.floor(r() * 3)] : [0xb02a2a, 0x7a1f3a, 0xc9402a][Math.floor(r() * 3)];
      sp(g, col, p.x + p.d[0] * p.r * 0.95, p.y + p.d[1] * p.r * 0.9, p.z + p.d[2] * p.r * 0.95, k === 1 ? 0.15 : 0.1, 0.1, k === 1 ? 0.15 : 0.1, { ws: 5, hs: 4, jit: 0.1 });
    }
    g.scale.setScalar(S);
    return bake(g, { jit: 0.05, gao: 0.25, floor: -0.03 });
  });

  // ================================================================== РЕКВИЗИТ (1): заборы, столбы, камни, сено, корыта, ёмкости
  const prop = (name, fn) => reg('prop', name, fn);
  const segsOf = (o, def, max) => clamp(Math.round(o.length > 0 ? o.length : def), 1, max || 40);

  // ---------------------------------------------------------------- белый штакетник: секции по 2 м вдоль X, лицо (штакеты) к +Z
  const picketG = () => G_('picket', () => {
    const sh = new T.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0.5, 0.86); sh.lineTo(0, 1); sh.lineTo(-0.5, 0.86); sh.lineTo(-0.5, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
  });
  prop('fenceWhite', (o) => {
    const g = new T.Group(), L = segsOf(o, 4), r = lcg(L * 31 + 5), W = L * 2, WH = 0xf0ede4, POST = 0xe9e5da;
    for (let i = 0; i <= L; i++) {
      const x = -L + i * 2;
      bx(g, POST, x, 0.6, 0, 0.13, 1.2, 0.13, { jit: 0.04 });
      cn(g, POST, x, 1.24, 0, 0.1, 0.1, { seg: 4, r: [0, PI / 4, 0], jit: 0.03 });
    }
    for (const y of [0.3, 0.78]) bx(g, 0xd9d4c6, 0, y, -0.065, W, 0.07, 0.04, { jit: 0.03 });   // рейки с тыльной стороны
    for (let s = 0; s < L; s++) {
      const n = 12;
      for (let k = 0; k < n; k++) {
        const x = -L + s * 2 + 0.17 + k * (1.66 / (n - 1)), h = 0.9 + (r() - 0.5) * 0.03;
        add(g, picketG(), WH, x, 0.06, 0.035, 0.085, h, 0.022, { r: [0, 0, (r() - 0.5) * 0.025], jit: 0.05 });
      }
    }
    return bake(g, { jit: 0.03, gao: 0.18 });
  });

  // ---------------------------------------------------------------- тёмный пастбищный забор в 3 жерди
  prop('fenceWood', (o) => {
    const g = new T.Group(), L = segsOf(o, 4), r = lcg(L * 17 + 9), W = L * 2, POST = 0x4a3324, RAIL = 0x5a3d2b;
    const rm = grainMat(0x6a4a34);
    for (let i = 0; i <= L; i++) {
      const x = -L + i * 2, h = 1.32 + (r() - 0.5) * 0.06;
      cy(g, POST, x, h / 2, 0, 0.065, 0.078, h, { seg: 7, jit: 0.1, grad: [0.7, 1.05] });
      cy(g, mix(POST, 0x8a6a4a, 0.3), x, h + 0.01, 0, 0, 0.07, 0.04, { seg: 7, jit: 0.1 });
    }
    for (let s = 0; s < L; s++) {
      const x0 = -L + s * 2, x1 = x0 + 2, sideF = s % 2 === 0 ? 1 : -1;
      for (let k = 0; k < 3; k++) {
        const y = 0.42 + k * 0.38 + (r() - 0.5) * 0.02, z = 0.095 * sideF * (k % 2 ? -1 : 1);
        bx(g, RAIL, (x0 + x1) / 2, y, z, 2.06, 0.11, 0.05, { mat: rm, jit: 0.12 });
        bx(g, 0x2c2c2c, x0 + 0.02 * sideF, y, z + 0.03 * Math.sign(z), 0.025, 0.025, 0.012, { jit: 0 });   // гвозди
      }
    }
    return bake(g, { jit: 0.06, gao: 0.2 });
  });

  // ---------------------------------------------------------------- двойные деревянные ворота (3.5 м между столбами)
  prop('gate', (o) => {
    const g = new T.Group(), POST = 0x4e382a, WOOD = 0x6f4e33, DARK = 0x2a2a2a, gm = grainMat(0x7a5a3d);
    for (const s of [-1, 1]) {
      bx(g, POST, s * 1.9, 0.9, 0, 0.22, 1.8, 0.22, { jit: 0.06, grad: [0.7, 1.05] });
      cn(g, mix(POST, 0x8a6a4a, 0.2), s * 1.9, 1.86, 0, 0.18, 0.12, { seg: 4, r: [0, PI / 4, 0], jit: 0.05 });
    }
    for (const s of [-1, 1]) {                           // створка: от шарнира (x=±1.76) к центру (x=±0.04)
      const x0 = s * 1.76, x1 = s * 0.04, cx = (x0 + x1) / 2, w = Math.abs(x0 - x1);
      for (const y of [0.22, 0.52, 0.82, 1.12]) bx(g, WOOD, cx, y, 0, w, 0.12, 0.06, { mat: gm, jit: 0.08 });
      bx(g, WOOD, x0 - s * 0.06, 0.67, 0.0, 0.12, 1.14, 0.07, { jit: 0.08 }); bx(g, WOOD, x1 + s * 0.06, 0.67, 0.0, 0.12, 1.14, 0.07, { jit: 0.08 });
      bx(g, WOOD, cx, 0.67, 0.0, 0.1, 1.0, 0.07, { jit: 0.08 });
      bb(g, mix(WOOD, 0x3a2a1c, 0.12), [x1 + s * 0.08, 0.2, 0.045], [x0 - s * 0.1, 1.12, 0.045], 0.09, 0.05, { jit: 0.08 });  // диагональная связь
      for (const y of [0.32, 1.02]) { bx(g, DARK, x0 - s * 0.3, y, 0.05, 0.62, 0.06, 0.02, { jit: 0.03 }); bx(g, DARK, x0, y, 0.0, 0.07, 0.1, 0.12, { jit: 0.03 }); }  // петли
    }
    bx(g, DARK, 0, 0.7, 0.07, 0.06, 0.34, 0.02, { jit: 0 }); bx(g, DARK, 0.0, 0.6, 0.075, 0.2, 0.05, 0.02, { jit: 0 });   // засов
    return bake(g, { jit: 0.05, gao: 0.18 });
  });

  // ---------------------------------------------------------------- столб ЛЭП 9 м (линия вдоль Z, траверсы вдоль X)
  prop('powerPole', (o) => {
    const g = new T.Group(), WOOD = 0x6d5842, IRON = 0x33383a, WIRE = 0x1b1c1d, PORC = 0xc9ccc4;
    const creo = (x, y, z, nx, ny, nz, c) => { if (y < 1.3) c.multiplyScalar(0.55 + 0.45 * y / 1.3); c.multiplyScalar(0.9 + 0.2 * noise3(x * 6, y * 0.8, z * 6)); };
    cy(g, WOOD, 0, 4.5, 0, 0.115, 0.175, 9.0, { seg: 9, vc: creo, jit: 0.04 });
    const arm = (y, w, n) => {
      bx(g, WOOD, 0, y, 0.0, w, 0.12, 0.14, { jit: 0.08 });
      for (const s of [-1, 1]) bb(g, WOOD, [s * 0.1, y - 0.75, 0.0], [s * w * 0.38, y - 0.05, 0.0], 0.07, 0.07, { jit: 0.08 });
      bx(g, IRON, 0, y, 0.0, 0.2, 0.15, 0.17, { jit: 0.03 });
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -w * 0.4 + i * (w * 0.8 / (n - 1)), top = y + 0.06;
        cy(g, IRON, x, top + 0.07, 0, 0.012, 0.016, 0.14, { seg: 5, jit: 0 });
        for (let k = 0; k < 3; k++) cy(g, PORC, x, top + 0.06 + k * 0.045, 0, 0.05 - k * 0.01, 0.075 - k * 0.01, 0.04, { seg: 8, jit: 0.03 });
        for (const sz of [-1, 1]) { bm(g, WIRE, [x, top + 0.18, 0], [x, top + 0.14, sz * 0.7], 0.012, 0.012, { seg: 4, jit: 0 }); bm(g, WIRE, [x, top + 0.14, sz * 0.7], [x, top + 0.02, sz * 1.5], 0.012, 0.012, { seg: 4, jit: 0 }); }
      }
    };
    arm(8.55, 2.4, 3); arm(7.55, 1.9, 2);
    bx(g, IRON, 0, 8.95, 0.0, 0.1, 0.5, 0.1, { jit: 0.03 });                             // верхний хомут
    bm(g, WIRE, [0.19, 0.1, 0.0], [0.15, 8.9, 0.0], 0.008, 0.008, { seg: 4, jit: 0 });    // заземляющий провод
    for (let i = 0; i < 6; i++) { const a = i * 1.2, y = 2.2 + i * 0.62; bx(g, IRON, Math.cos(a) * 0.15, y, Math.sin(a) * 0.15, 0.05, 0.03, 0.14, { r: [0, -a, 0], jit: 0.04 }); } // скобы
    if (o.variant === 1) {                                                                // трансформатор
      cy(g, 0x7a8588, 0.34, 6.55, 0, 0.19, 0.19, 0.6, { seg: 10, jit: 0.04 }); cy(g, 0x677175, 0.34, 6.88, 0, 0.14, 0.2, 0.1, { seg: 10, jit: 0.04 });
      for (const dz of [-0.09, 0.09]) cy(g, PORC, 0.34 + dz * 0.2, 7.0, dz, 0.025, 0.03, 0.16, { seg: 5, jit: 0.03 });
      bb(g, IRON, [0.08, 6.8, 0], [0.18, 6.7, 0], 0.06, 0.06, { jit: 0.03 });
    }
    return bake(g, { jit: 0.04, gao: 0.1 });
  });

  // ---------------------------------------------------------------- уличный фонарь: изогнутая консоль к +Z
  prop('streetLamp', (o) => {
    const g = new T.Group(), METAL = 0x4a5558, DARKM = 0x2f383a, H = 5.4;
    cy(g, DARKM, 0, 0.4, 0, 0.17, 0.23, 0.8, { seg: 8, jit: 0.03, grad: [0.75, 1] }); cy(g, DARKM, 0, 0.84, 0, 0.12, 0.17, 0.08, { seg: 8, jit: 0.03 });
    cy(g, METAL, 0, H / 2 + 0.4, 0, 0.045, 0.075, H - 0.8, { seg: 8, jit: 0.03 });
    bx(g, DARKM, 0, 1.4, 0.0, 0.16, 0.26, 0.05, { jit: 0.03 });
    let prev = [0, H - 0.1, 0];
    for (let i = 1; i <= 7; i++) {   // дуга: вверх и вперёд
      const a = i / 7 * PI * 0.5, p = [0, H - 0.1 + Math.sin(a) * 0.55, Math.cos(Math.PI / 2 - a) * 1.45 * (1 - Math.cos(a) * 0.0) * (i / 7)];
      p[2] = (1 - Math.cos(a)) * 1.5; bm(g, METAL, prev, p, 0.05 - (i - 1) * 0.004, 0.05 - i * 0.004, { seg: 6, jit: 0.03 }); prev = p;
    }
    const lx = prev[2];
    bx(g, DARKM, 0, prev[1] - 0.02, lx + 0.12, 0.28, 0.1, 0.62, { jit: 0.03 });
    bx(g, METAL, 0, prev[1] + 0.06, lx + 0.12, 0.22, 0.05, 0.5, { r: [0.0, 0, 0], jit: 0.03 });
    const bulb = bx(g, 0xfff0b8, 0, prev[1] - 0.085, lx + 0.12, 0.2, 0.025, 0.46, { keep: true, mat: GLOWM(0xffeeb0) });
    return bake(g, { jit: 0.03, gao: 0.1 });
  });

  // ---------------------------------------------------------------- подстриженная живая изгородь: opts.length метров вдоль X
  prop('hedge', (o) => {
    const g = new T.Group(), Lm = clamp(o.length > 0 ? o.length : 6, 1, 40), r = lcg(Math.round(Lm) * 13 + 3), sd = r() * 50;
    const sh = new T.Shape(), w = 0.46, h = 1.3, rr = 0.26;
    sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, h - rr); sh.quadraticCurveTo(w, h, w - rr, h); sh.lineTo(-w + rr, h); sh.quadraticCurveTo(-w, h, -w, h - rr); sh.lineTo(-w, 0);
    const geo = new T.ExtrudeGeometry(sh, { depth: Lm, steps: Math.max(1, Math.round(Lm / 0.5)), bevelEnabled: false, curveSegments: 3 });
    geo.rotateY(PI / 2); geo.translate(-Lm / 2, 0, 0);
    const pat = (x, y, z, nx, ny, nz, c) => { const n = noise3(x * 2.4 + sd, y * 2.4, z * 2.4) * 0.6 + noise3(x * 6 + sd, y * 6, z * 6) * 0.4; c.lerp(hex(n > 0.5 ? 0x5c8a38 : 0x2c5326), clamp(Math.abs(n - 0.5) * 2.2, 0, 0.7)); c.multiplyScalar(0.65 + 0.4 * clamp(y / 1.3, 0, 1)); };
    add(g, geo, 0x34602a, 0, 0, 0, 1, 1, 1, { vc: pat, jit: 0 });
    const step = Lm > 32 ? 0.95 : Lm > 20 ? 0.72 : 0.42, nb = Math.max(2, Math.round(Lm / step)), dense = Lm <= 8 ? 2 : Lm <= 14 ? 1 : 0;
    const leaf = (x, y, z, br, sx, sy, sz, k) => blob(g, mix(0x2f5a28, 0x64933e, r()), x, y, z, br * sx, br * sy, br * sz, k, { detail: 'o', noise: 0.28, grad: [0.62, 1.12], jit: 0.12 });
    for (let i = 0; i < nb; i++) {                       // листовые бугры: верх и бока
      const x = -Lm / 2 + (i + 0.5) * Lm / nb + (r() - 0.5) * 0.1;
      leaf(x, 1.27 + r() * 0.04, (r() - 0.5) * 0.5, 0.3 + r() * 0.08, 1.15, 0.62, 1.0, i * 3 + 1);
      leaf(x + 0.18, 1.2, (i % 2 ? 1 : -1) * 0.3, 0.26 + r() * 0.06, 1.1, 0.7, 1.0, i * 3 + 2);
      for (const s of [-1, 1]) if (dense >= 1 || (i + (s > 0 ? 1 : 0)) % 2) leaf(x + (r() - 0.5) * 0.15, 0.78 + r() * 0.3, s * 0.42, 0.26 + r() * 0.06, 1.0, 1.0, 0.6, i * 7 + (s > 0 ? 4 : 5));
      if (dense >= 2) for (const s of [-1, 1]) leaf(x + 0.2 + (r() - 0.5) * 0.15, 0.3 + r() * 0.15, s * 0.43, 0.24 + r() * 0.05, 1.0, 0.9, 0.55, i * 11 + (s > 0 ? 6 : 7));
    }
    return bake(g, { jit: 0.05, gao: 0.25 });
  });

  // ---------------------------------------------------------------- камни (variant 0..2)
  prop('rock', (o) => {
    const g = new T.Group(), v = ((o.variant % 3) + 3) % 3, r = lcg(v * 77 + 3 + o.seed * 5), sd = r() * 40;
    const base = [0x7c7b75, 0x74706a, 0x80796c][v], moss = 0x59703e;
    const vcf = (x, y, z, nx, ny, nz, c) => {
      c.multiplyScalar(0.8 + 0.4 * noise3(x * 2.1 + sd, y * 2.1, z * 2.1));
      if (ny > 0.5) c.lerp(hex(moss), clamp((ny - 0.5) * 1.6, 0, 0.75) * (0.35 + 0.65 * noise3(x * 3 + sd, y * 3, z * 3)));
      if (Math.sin(y * 9 + noise3(x * 1.5 + sd, y, z * 1.5) * 7) > 0.82) c.multiplyScalar(0.78);
      c.multiplyScalar(0.7 + 0.3 * clamp(y / 0.5, 0, 1));
    };
    const rk = (x, z, rx, ry, rz, s, d) => blob(g, base, x, ry * 0.86, z, rx, ry, rz, sd + s, { detail: d == null ? 2 : d, noise: 0.3, freq: 1.9, flat: true, vc: vcf, jit: 0.1, r: [0, r() * TAU, 0] });
    if (v === 0) { rk(0, 0, 1.3, 0.95, 1.05, 1); rk(1.2, 0.5, 0.45, 0.32, 0.4, 2, 1); rk(-1.0, 0.8, 0.3, 0.22, 0.28, 3, 1); }
    else if (v === 1) { rk(-0.5, 0.0, 1.05, 0.8, 0.95, 4); rk(0.85, 0.5, 0.68, 0.52, 0.6, 5); rk(0.2, -0.95, 0.5, 0.4, 0.48, 6); rk(1.3, -0.4, 0.28, 0.2, 0.26, 7, 1); rk(-1.5, 0.9, 0.22, 0.16, 0.2, 8, 1); }
    else { rk(0, 0, 1.55, 0.55, 1.0, 9); rk(-0.7, 0.9, 0.65, 0.4, 0.55, 10); rk(1.3, 0.6, 0.42, 0.3, 0.38, 11, 1); for (let i = 0; i < 4; i++) rk(-1.8 + i * 0.9 + r() * 0.3, 1.4 + r() * 0.4, 0.17, 0.11, 0.15, 20 + i, 0); }
    return bake(g, { jit: 0.05, gao: 0.25, floor: -0.04 });
  });

  // ---------------------------------------------------------------- тюки: пирамида квадратных + рулоны
  function roundBale(g, x, y, z, R, wd, axisZ) {
    const sm = strawMat(), em = strawEndMat(), rot = axisZ ? [PI / 2, 0, 0] : [0, 0, PI / 2];
    add(g, cylG(R, R, 18, true), null, x, y, z, 1, wd, 1, { mat: sm, r: rot });
    for (const s of [-1, 1]) {
      const cap = add(g, G_('disc18', () => new T.CircleGeometry(1, 18)), null, x, y, z, R, R, 1, { mat: em });
      if (axisZ) { cap.position.z = z + s * wd / 2; cap.rotation.set(0, s > 0 ? 0 : PI, 0); } else { cap.position.x = x + s * wd / 2; cap.rotation.set(0, s > 0 ? PI / 2 : -PI / 2, 0); }
    }
    for (const t of [-0.3, 0, 0.3]) add(g, cylG(R * 1.008, R * 1.008, 18, true), 0x5b4e2a, x + (axisZ ? 0 : t * wd), y, z + (axisZ ? t * wd : 0), 1, 0.035, 1, { r: rot, jit: 0.1 });
  }
  function squareBale(g, x, y, z, ry) {
    const sm = strawMat(), c = Math.cos(ry), s = Math.sin(ry);
    bx(g, null, x, y, z, 0.92, 0.46, 0.5, { mat: sm, r: [0, ry, 0] });
    for (const t of [-0.22, 0.22]) bx(g, 0xd2a43a, x + c * t, y, z - s * t, 0.03, 0.475, 0.525, { r: [0, ry, 0], jit: 0.08 });
  }
  prop('hayBales', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 19 + 7);
    const row = [[-2.55, 0], [-1.55, 0], [-0.55, 0], [-2.05, 1], [-1.05, 1], [-1.55, 2]];   // пирамида 3-2-1 из квадратных
    for (const [x, k] of row) squareBale(g, x + (r() - 0.5) * 0.06, 0.23 + k * 0.47, -0.8 + (r() - 0.5) * 0.12, (r() - 0.5) * 0.07);
    for (const [x, k] of [[-2.55, 0], [-1.55, 0], [-2.05, 1]]) squareBale(g, x + (r() - 0.5) * 0.06, 0.23 + k * 0.47, 0.0 + (r() - 0.5) * 0.12, (r() - 0.5) * 0.07);
    roundBale(g, 1.3, 0.66, -0.7, 0.66, 1.2, false); roundBale(g, 1.3, 0.66, 0.68, 0.66, 1.2, false); roundBale(g, 1.3, 1.78, -0.01, 0.66, 1.2, false);
    for (let i = 0; i < 9; i++) bx(g, mix(0xc9ae5e, 0xa68a42, r()), -3 + r() * 6.2, 0.012, -1.6 + r() * 3.2, 0.3 + r() * 0.4, 0.02, 0.05, { r: [0, r() * 3, 0], jit: 0.1 });   // россыпь соломы
    return bake(g, { jit: 0.04, gao: 0.1 });
  });

  // ---------------------------------------------------------------- стог сена (копна)
  prop('haystack', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 7 + 2), sd = r() * 30;
    const prof = [[2.0, 0], [2.05, 0.3], [1.9, 0.95], [1.6, 1.65], [1.2, 2.3], [0.75, 2.85], [0.35, 3.25], [0.1, 3.5], [0.0, 3.6]].map((p) => new T.Vector2(p[0], p[1]));
    const geo = new T.LatheGeometry(prof, 16), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), d = 1 + 0.07 * (noise3(x * 1.4 + sd, y * 1.4, z * 1.4) * 2 - 1); pa.setXYZ(i, x * d, y, z * d); }
    geo.computeVertexNormals();
    add(g, geo, null, 0, 0, 0, 1, 1, 1, { mat: strawMat() });
    cy(g, 0x5a4630, 0, 3.75, 0, 0.03, 0.045, 0.7, { seg: 5, jit: 0.05 });
    cy(g, 0xb89a4e, 0, 0.03, 0, 2.5, 2.5, 0.06, { seg: 14, jit: 0.1 });
    for (let i = 0; i < 12; i++) { const a = r() * TAU, d = 2.0 + r() * 0.5; bx(g, mix(0xc9ae5e, 0xa68a42, r()), Math.cos(a) * d, 0.04, Math.sin(a) * d, 0.5, 0.05, 0.08, { r: [0, -a, 0], jit: 0.1 }); }
    return bake(g, { jit: 0.04, gao: 0.12 });
  });

  // ---------------------------------------------------------------- поилка (деревянное корыто с водой), 2.6 x 0.7 м
  prop('waterTrough', (o) => {
    const g = new T.Group(), WOOD = 0x7a5a3c, gm = grainMat(0x86643f), METAL = 0x3b4144;
    bx(g, WOOD, 0, 0.3, 0, 2.6, 0.08, 0.72, { mat: gm });
    for (const s of [-1, 1]) { bx(g, WOOD, 0, 0.5, s * 0.33, 2.6, 0.42, 0.07, { mat: gm }); bx(g, WOOD, s * 1.265, 0.5, 0, 0.07, 0.42, 0.72, { mat: gm }); }
    for (const x of [-1.0, 0, 1.0]) { for (const s of [-1, 1]) bx(g, METAL, x, 0.5, s * 0.375, 0.05, 0.44, 0.02, { jit: 0.03 }); bx(g, METAL, x, 0.275, 0, 0.05, 0.02, 0.74, { jit: 0.03 }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { bx(g, 0x55402c, sx * 1.1, 0.14, sz * 0.27, 0.1, 0.28, 0.1, { jit: 0.06 }); }
    for (const sx of [-1, 1]) bx(g, 0x55402c, sx * 1.1, 0.12, 0, 0.08, 0.06, 0.6, { jit: 0.06 });
    bx(g, 0x55402c, 0, 0.1, 0, 2.2, 0.06, 0.08, { jit: 0.06 });
    cy(g, METAL, -1.52, 0.5, 0, 0.022, 0.022, 1.0, { seg: 6, jit: 0.03 });                  // подводка
    bb(g, METAL, [-1.52, 1.0, 0], [-1.2, 1.0, 0], 0.044, 0.044, { jit: 0.03 }); cy(g, METAL, -1.2, 0.96, 0, 0.02, 0.02, 0.08, { seg: 6, jit: 0.03 });
    sp(g, 0x586366, -1.36, 0.98, 0, 0.18, 0.14, 0.14, { ws: 6, hs: 5, jit: 0.04 });          // поплавковый клапан
    bx(g, 0x4c86a0, 0, 0.62, 0, 2.5, 0.01, 0.6, { mat: WATERM(0x4a86a2, 0.82) });
    return bake(g, { jit: 0.05, gao: 0.15 });
  });

  // ---------------------------------------------------------------- круглая кормушка с рулоном сена: диаметр ~3 м
  prop('roundFeeder', (o) => {
    const g = new T.Group(), R = 1.5, STEEL = 0x7e8b86, RUST = 0x7a5b46;
    const torus = (rr, tube, y, col) => add(g, G_('tor' + rr + ',' + tube, () => new T.TorusGeometry(rr, tube, 5, 28)), col, 0, y, 0, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.05 });
    torus(R, 0.035, 0.12, STEEL); torus(R, 0.035, 0.55, STEEL); torus(R, 0.04, 1.08, STEEL);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; bx(g, i % 5 === 0 ? RUST : STEEL, Math.cos(a) * R, 0.6, Math.sin(a) * R, 0.035, 1.0, 0.035, { jit: 0.08 }); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; bx(g, STEEL, Math.cos(a) * R, 0.04, Math.sin(a) * R, 0.2, 0.08, 0.2, { r: [0, -a, 0], jit: 0.05 }); }
    add(g, cylG(0.98, 0.98, 18, true), null, 0, 0.62, 0, 1, 1.1, 1, { mat: strawMat() });
    add(g, G_('disc18', () => new T.CircleGeometry(1, 18)), null, 0, 1.175, 0, 0.98, 0.98, 1, { mat: strawEndMat(), r: [-PI / 2, 0, 0] });
    for (const t of [-0.3, 0.0, 0.3]) add(g, cylG(0.99, 0.99, 18, true), 0x5b4e2a, 0, 0.62 + t * 1.1, 0, 1, 0.035, 1, { jit: 0.1 });
    sp(g, 0xc2a456, 0, 1.19, 0, 1.5, 0.24, 1.5, { ws: 12, hs: 5, jit: 0.1, vc: (x, y, z, nx, ny, nz, c) => { c.multiplyScalar(0.85 + 0.3 * noise3(x * 5, y * 5, z * 5)); } });
    for (let i = 0; i < 16; i++) { const a = i * 2.4, d = 1.0 + (i % 5) * 0.2; bx(g, mix(0xc9ae5e, 0xa68a42, (i % 3) / 3), Math.cos(a) * d, 0.02, Math.sin(a) * d, 0.5, 0.03, 0.07, { r: [0, a, 0], jit: 0.1 }); }
    return bake(g, { jit: 0.04, gao: 0.1 });
  });

  // ---------------------------------------------------------------- круглая ёмкость для навоза: ~6 м, коричневая жижа
  prop('manureTank', (o) => {
    const g = new T.Group(), R = 3.0, H = 2.4, CON = 0xaaa9a2, DK = 0x8e8d86, STEEL = 0x6c7476;
    const cm = concreteMat(0xb8b7b0, 6, 1);
    add(g, cylG(R, R, 32, true), null, 0, H / 2, 0, 1, H, 1, { mat: cm });
    add(g, invGeo(cylG(R - 0.25, R - 0.25, 32, true)), CON, 0, H / 2, 0, 1, H, 1, { jit: 0.04, grad: [0.55, 1] });
    add(g, G_('ringTop', () => new T.RingGeometry(R - 0.25, R + 0.02, 32)), CON, 0, H + 0.001, 0, 1, 1, 1, { r: [-PI / 2, 0, 0], jit: 0.03 });
    cy(g, DK, 0, 0.1, 0, R + 0.18, R + 0.22, 0.2, { seg: 32, jit: 0.04 });                     // фундаментное кольцо
    for (let k = 1; k <= 3; k++) cy(g, 0x9c9b94, 0, k * 0.6, 0, R + 0.012, R + 0.012, 0.035, { seg: 32, jit: 0.04, open: true });   // швы опалубки
    cy(g, 0x9a9992, 0, H - 0.08, 0, R + 0.03, R + 0.03, 0.2, { seg: 32, jit: 0.04, open: true });          // пояс по верху
    const liq = add(g, G_('disc32', () => new T.CircleGeometry(1, 32)), 0x5a4224, 0, H - 0.5, 0, R - 0.26, R - 0.26, 1, { r: [-PI / 2, 0, 0], jit: 0, vc: (x, y, z, nx, ny, nz, c) => { const n = noise3(x * 1.1, 4, z * 1.1); c.lerp(hex(n > 0.55 ? 0x7a6038 : 0x3f2e18), clamp(Math.abs(n - 0.5) * 2, 0, 0.8)); } });
    for (let i = 0; i < 7; i++) { const a = i * 1.9, d = 0.6 + i * 0.25; blob(g, 0x7a6238, Math.cos(a) * d, H - 0.48, Math.sin(a) * d, 0.35 + (i % 3) * 0.12, 0.05, 0.3 + (i % 2) * 0.1, i, { detail: 0, noise: 0.2, jit: 0.1 }); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, x = Math.cos(a) * (R - 0.12), z = Math.sin(a) * (R - 0.12); cy(g, STEEL, x, H + 0.5, z, 0.022, 0.022, 1.0, { seg: 5, jit: 0.04 }); }
    add(g, G_('torRail', () => new T.TorusGeometry(R - 0.12, 0.022, 4, 36)), STEEL, 0, H + 1.0, 0, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.04 });
    add(g, G_('torRail2', () => new T.TorusGeometry(R - 0.12, 0.018, 4, 36)), STEEL, 0, H + 0.55, 0, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.04 });
    for (const s of [-0.22, 0.22]) bx(g, STEEL, R + 0.22, (H + 0.55) / 2, s, 0.04, H + 0.55, 0.05, { jit: 0.04 });        // лестница
    for (let i = 0; i < 9; i++) bx(g, STEEL, R + 0.22, 0.25 + i * 0.28, 0, 0.04, 0.035, 0.46, { jit: 0.04 });
    cy(g, 0x40484b, R + 0.75, 0.55, 0.0, 0.12, 0.12, 1.3, { seg: 8, r: [0, 0, PI / 2], jit: 0.04 });                      // труба
    cy(g, 0x3a4144, R + 1.4, 0.55, 0.0, 0.16, 0.16, 0.1, { seg: 8, r: [0, 0, PI / 2], jit: 0.04 });
    cy(g, 0x3a4144, R + 0.5, 0.8, 0.0, 0.03, 0.03, 0.4, { seg: 5, jit: 0.04 });
    add(g, G_('torValve', () => new T.TorusGeometry(0.13, 0.02, 4, 12)), 0xb0392e, R + 0.5, 1.02, 0.0, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.05 });
    return bake(g, { jit: 0.04, gao: 0.1 });
  });

  // ================================================================== РЕКВИЗИТ (2)
  // ---------------------------------------------------------------- ящики с овощами
  function crate(g, x, y, z, ry, r, kind, big) {
    const W = 0.62, D = 0.42, Hh = 0.32, c = Math.cos(ry), s = Math.sin(ry), WOOD = 0xa07d52, gm = grainMat(0xb08a58);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const box = (lx, ly, lz, w, h, d, o) => { const p = P(lx, ly, lz); return bx(g, WOOD, p[0], p[1], p[2], w, h, d, Object.assign({ r: [0, ry, 0], jit: 0.09 }, o)); };
    box(0, 0.015, 0, W - 0.02, 0.03, D - 0.02, { mat: gm });
    for (const sz of [-1, 1]) for (const yy of [0.09, 0.22]) box(0, yy, sz * (D / 2 - 0.012), W, 0.1, 0.024, { mat: gm });
    for (const sx of [-1, 1]) for (const yy of [0.09, 0.22]) box(sx * (W / 2 - 0.012), yy, 0, 0.024, 0.1, D - 0.04, { mat: gm });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (W / 2 - 0.02), Hh / 2, sz * (D / 2 - 0.02), 0.04, Hh, 0.04, {});
    const m = P(0, 0.2, 0);
    const veg = (col, n, rr, h) => { for (let i = 0; i < n; i++) { const lx = (r() - 0.5) * (W - 0.18), lz = (r() - 0.5) * (D - 0.14), p = P(lx, 0.2 + h * 0.5 + r() * 0.04, lz); sp(g, mix(col, 0xffffff, r() * 0.12), p[0], p[1], p[2], rr * (0.9 + r() * 0.2), rr * (0.85 + r() * 0.2), rr * (0.9 + r() * 0.2), { ws: 6, hs: 4, jit: 0.1, grad: [0.75, 1.08] }); } };
    if (kind === 0) veg(0xc23a2e, 9, 0.15, 0.05);               // помидоры
    else if (kind === 1) { for (let i = 0; i < 8; i++) { const lx = (i - 3.5) * 0.065, p0 = P(lx, 0.24, -0.1 + (i % 2) * 0.05), p1 = P(lx * 1.1, 0.2, 0.12); bm(g, 0xe07b24, p0, p1, 0.035, 0.015, { seg: 5, jit: 0.1 }); bm(g, 0x4f8a35, p0, P(lx, 0.31, -0.13), 0.02, 0.008, { seg: 4, jit: 0.1 }); } }  // морковь
    else if (kind === 2) veg(0x8ab04a, 4, 0.22, 0.1);           // капуста
    else if (kind === 3) veg(0xb58a55, 11, 0.12, 0.04);         // картофель
    else veg(0xcf4a38, 9, 0.12, 0.05);                          // яблоки
  }
  prop('crates', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 23 + 5), v = o.variant;
    const lay = [[-0.7, 0, 0], [-0.06, 0, 0.02], [-0.7, 0, 0.5], [-0.06, 0, 0.52], [-0.38, 1, 0.26], [0.65, 0, 0.1], [0.62, 1, 0.12]];
    lay.forEach((p, i) => crate(g, p[0], p[1] * 0.33, p[2] - 0.2 + (r() - 0.5) * 0.04, (r() - 0.5) * 0.18 + (i === 5 ? 0.5 : 0), r, (i + v + o.seed) % 5));
    crate(g, 0.0, 0.0, 1.15, 0.35, r, (v + 2) % 5);
    return bake(g, { jit: 0.04, gao: 0.18 });
  });

  // ---------------------------------------------------------------- бочки и бидоны
  function steelDrum(g, x, z, col, y0, lying) {
    const R = 0.29, H = 0.88, y = y0 || 0;
    const o = lying ? { r: [0, 0, PI / 2] } : {};
    const at = (dy) => lying ? [x + dy, R, z] : [x, y + dy, z];
    const cyl = (dy, rt, rb, h, c, seg) => { const p = at(dy); return cy(g, c, p[0], p[1], p[2], rt, rb, h, Object.assign({ seg: seg || 12, jit: 0.05 }, o)); };
    cyl(H / 2, R, R, H, col);
    for (const d of [0.02, H - 0.02]) cyl(d, R + 0.012, R + 0.012, 0.04, mix(col, 0x000000, 0.18));
    for (const d of [0.3, 0.58]) cyl(d, R + 0.008, R + 0.008, 0.03, mix(col, 0x000000, 0.1));
    cyl(H + 0.002, R * 0.94, R * 0.94, 0.012, mix(col, 0x000000, 0.28));
    const bp = lying ? [x + H - 0.05, R + 0.11, z + 0.07] : [x + 0.1, y + H + 0.02, z + 0.08]; cy(g, 0x3b3b3b, bp[0], bp[1], bp[2], 0.035, 0.035, 0.03, { seg: 6, jit: 0 });
  }
  function woodBarrel(g, x, z, y0) {
    const pts = [[0.001, 0], [0.22, 0], [0.245, 0.12], [0.275, 0.3], [0.245, 0.48], [0.22, 0.6], [0.001, 0.6]].map((p) => new T.Vector2(p[0], p[1])), y = y0 || 0;
    add(g, G_('barrel', () => new T.LatheGeometry(pts, 12)), 0x8a6338, x, y, z, 1, 1, 1, { jit: 0.1, grad: [0.75, 1.08] });
    for (const [h, rr] of [[0.06, 0.237], [0.18, 0.266], [0.42, 0.266], [0.54, 0.237]]) cy(g, 0x3a3d3f, x, y + h, z, rr, rr, 0.03, { seg: 12, jit: 0.04 });
    cy(g, 0x9a7442, x, y + 0.601, z, 0.2, 0.2, 0.01, { seg: 12, jit: 0.05 });
  }
  prop('barrels', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 5 + 1), cols = [0x3d6a8f, 0x9c3a2e, 0x4a6b3a, 0x8a5a38, 0x56606a];
    steelDrum(g, -0.5, 0.0, cols[(o.seed) % 5]); steelDrum(g, 0.15, -0.1, cols[(o.seed + 1) % 5]); steelDrum(g, -0.2, 0.62, cols[(o.seed + 2) % 5]);
    steelDrum(g, -0.45, -0.1, cols[(o.seed + 3) % 5], 0.88);
    steelDrum(g, 1.1, 0.5, cols[(o.seed + 4) % 5], 0, true);
    woodBarrel(g, 0.95, -0.55); woodBarrel(g, 1.55, -0.2); woodBarrel(g, 1.25, -0.4, 0.6);
    return bake(g, { jit: 0.04, gao: 0.2 });
  });

  // ---------------------------------------------------------------- стопка покрышек
  prop('tireStack', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 11 + 5), RUB = 0x25272a;
    const tor = (R, tr) => G_('tire' + R + ',' + tr, () => new T.TorusGeometry(R, tr, 7, 14));
    for (let i = 0; i < 6; i++) add(g, tor(0.27, 0.115), mix(RUB, 0x3a3c40, r() * 0.5), (r() - 0.5) * 0.05, 0.115 + i * 0.205, (r() - 0.5) * 0.05, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.12 });
    for (let i = 0; i < 4; i++) add(g, tor(0.27, 0.115), mix(RUB, 0x3a3c40, r() * 0.5), 0.75 + (r() - 0.5) * 0.04, 0.115 + i * 0.205, 0.0, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.12 });
    add(g, tor(0.27, 0.115), RUB, -0.85, 0.37, 0.85, 1, 1, 1, { r: [0.0, 0.5, 0.0], jit: 0.12 });     // стоит на ребре
    add(g, tor(0.27, 0.115), RUB, -0.58, 0.115, 1.12, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.12 });
    add(g, tor(0.52, 0.2), 0x2c2e31, 1.55, 0.2, 0.75, 1, 1, 1, { r: [PI / 2, 0, 0], jit: 0.12 });         // большая тракторная
    cy(g, 0x7d4a30, 1.55, 0.14, 0.75, 0.3, 0.3, 0.1, { seg: 10, jit: 0.08 });
    return bake(g, { jit: 0.05, gao: 0.18 });
  });

  // ---------------------------------------------------------------- указатель с табличками
  prop('signpost', (o) => {
    const g = new T.Group(), WOOD = 0x6b4b32, r = lcg(o.seed * 3 + 11);
    bx(g, WOOD, 0, 1.3, 0, 0.13, 2.6, 0.13, { jit: 0.08, grad: [0.7, 1.05] });
    cn(g, mix(WOOD, 0x8a6a4a, 0.3), 0, 2.64, 0, 0.12, 0.12, { seg: 4, r: [0, PI / 4, 0], jit: 0.05 });
    const tints = [0xf3ead6, 0xd8e6c8, 0xf0d2b6];
    [[2.3, 1, 0.18, 1.0], [1.95, -1, -0.12, 0.9], [1.6, 1, 0.06, 0.8]].forEach((sg, i) => {
      const [y, dir, rot, len] = sg, m = texMat('prop_sign', 1, 1, tints[i], 0, 0, 0, { color: tints[i] });
      const gp = new T.Group(); gp.position.set(0, y, 0); gp.rotation.y = rot; g.add(gp);
      bx(gp, WOOD, dir * (len / 2 + 0.07), 0, 0.085, len, 0.26, 0.04, { mat: m });
      bx(gp, WOOD, dir * (len + 0.07), 0, 0.085, 0.185, 0.185, 0.04, { r: [0, 0, PI / 4], jit: 0.05, mat: m });
      bx(gp, 0x3a2c20, dir * 0.0, 0, 0.065, 0.2, 0.28, 0.02, { jit: 0.05 });
    });
    return bake(g, { jit: 0.05, gao: 0.18 });
  });

  // ---------------------------------------------------------------- почтовый ящик на столбике (дверца к +Z)
  prop('mailbox', (o) => {
    const g = new T.Group(), WOOD = 0x6e4e34, BODY = [0x3b5f8a, 0x2f5a3c, 0x8a3a2e][(o.variant + o.seed) % 3];
    bx(g, WOOD, 0, 0.55, 0, 0.1, 1.1, 0.1, { jit: 0.08, grad: [0.7, 1.05] });
    bx(g, WOOD, 0, 1.1, 0.0, 0.2, 0.05, 0.62, { jit: 0.08 });
    bb(g, WOOD, [0, 0.7, 0.04], [0, 1.08, 0.24], 0.05, 0.05, { jit: 0.08 });
    bx(g, BODY, 0, 1.2, 0, 0.26, 0.13, 0.5, { jit: 0.04 });
    cy(g, BODY, 0, 1.265, 0, 0.13, 0.13, 0.5, { seg: 10, r: [PI / 2, 0, 0], jit: 0.04 });
    cy(g, mix(BODY, 0x000000, 0.25), 0, 1.2, 0.255, 0.128, 0.128, 0.015, { seg: 10, r: [PI / 2, 0, 0], jit: 0.04 });   // дверца
    bx(g, 0xb8bcbe, 0, 1.2, 0.268, 0.05, 0.03, 0.01, { jit: 0.03 });
    bx(g, 0xb0332a, 0.16, 1.28, -0.08, 0.02, 0.2, 0.06, { jit: 0.04 }); bx(g, 0xb0332a, 0.16, 1.38, -0.08, 0.03, 0.03, 0.09, { jit: 0.04 });   // флажок
    bx(g, 0xe9e5d6, 0.0, 1.0, 0.24, 0.18, 0.1, 0.01, { jit: 0.03 });                                                                    // табличка
    return bake(g, { jit: 0.04, gao: 0.15 });
  });

  // ---------------------------------------------------------------- колодец с крышей и воротом
  prop('well', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 9 + 4), R = 0.95;
    for (let c = 0; c < 3; c++) {
      const n = 12, off = c % 2 ? PI / n : 0;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + off, sx = 0.42 + r() * 0.1, sy = 0.27 + r() * 0.04, col = mix(0x8f8b80, 0xa39d8c, r()) ;
        bx(g, col, Math.cos(a) * R, 0.15 + c * 0.3, Math.sin(a) * R, sx, sy, 0.3, { r: [0, -a + PI / 2, 0], jit: 0.12 });
      }
    }
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; bx(g, mix(0x9a9588, 0xb0aa98, r()), Math.cos(a) * (R + 0.02), 0.97, Math.sin(a) * (R + 0.02), 0.46, 0.08, 0.38, { r: [0, -a + PI / 2, 0], jit: 0.1 }); }
    add(g, invGeo(cylG(R - 0.15, R - 0.15, 14, true)), 0x6e6a60, 0, 0.5, 0, 1, 1.0, 1, { jit: 0.04, grad: [0.35, 1] });
    cy(g, 0x0f1d24, 0, 0.3, 0, R - 0.18, R - 0.18, 0.02, { seg: 14, jit: 0, gao: 0 });
    for (const s of [-1, 1]) {
      bx(g, 0x5a4330, s * 1.12, 1.1, 0, 0.14, 2.2, 0.14, { jit: 0.08, grad: [0.7, 1.05] });
      bb(g, 0x5a4330, [s * 1.1, 0.7, 0.0], [s * 0.65, 1.8, 0.0], 0.09, 0.09, { jit: 0.08 });
    }
    const rm = texMat('roof_tile', 2, 1, 0xa8402c, 0, 0, 0, { side: T.DoubleSide });
    g.add(C.gable(2.9, 2.0, 0.95, 0xa8402c, 0, 2.2, 0, rm));
    bx(g, 0x5a4330, 0, 3.12, 0, 0.12, 0.08, 2.0, { jit: 0.08 });
    cy(g, 0x5a4330, 0, 1.55, 0.0, 0.055, 0.055, 2.24, { seg: 6, r: [0, 0, PI / 2], jit: 0.06 });                 // вал
    bm(g, 0x3b3f41, [1.12, 1.55, 0.0], [1.32, 1.55, 0.18], 0.025, 0.025, { seg: 5, jit: 0.04 }); bm(g, 0x3b3f41, [1.32, 1.55, 0.18], [1.32, 1.3, 0.18], 0.025, 0.025, { seg: 5, jit: 0.04 }); cy(g, 0x5a4330, 1.32, 1.28, 0.18, 0.03, 0.03, 0.14, { seg: 6, r: [0, 0, PI / 2], jit: 0.04 });
    cy(g, 0xb8a888, 0, 1.2, 0, 0.012, 0.012, 0.7, { seg: 4, jit: 0.04 });                                         // верёвка
    cy(g, 0x8a6338, 0, 0.7, 0, 0.13, 0.1, 0.22, { seg: 9, jit: 0.1 }); cy(g, 0x3a3d3f, 0, 0.73, 0, 0.13, 0.13, 0.025, { seg: 9, jit: 0.04 });
    for (let i = 0; i < 3; i++) bx(g, 0x8a8478, R + 0.3 + i * 0.25, 0.04, 0.2 + (i - 1) * 0.35, 0.3, 0.06, 0.25, { r: [0, r(), 0], jit: 0.1 });   // плиты вокруг
    return bake(g, { jit: 0.05, gao: 0.18 });
  });

  // ---------------------------------------------------------------- пирс и лодка + пятно воды
  function hullGeo(L, B, D) {
    const ns = 11, np = 9, pos = [], idx = [];
    for (let i = 0; i < ns; i++) {
      const t = i / (ns - 1), z = -L / 2 + t * L, q = z / (L / 2);
      const bh = q >= 0 ? (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(q, 2.2)), 0.62) : (B / 2) * lerp(1, 0.66, Math.pow(-q, 2)), top = D + 0.12 * q * q, yk = 0.04 + (q > 0 ? 0.12 * q * q : 0.03 * q * q);
      for (let j = 0; j < np; j++) { const th = (j / (np - 1) - 0.5) * PI, x = bh * Math.sin(th), y = top - (top - yk) * Math.cos(th); pos.push(x, y, z); }
    }
    for (let i = 0; i < ns - 1; i++) for (let j = 0; j < np - 1; j++) { const a = i * np + j, b = a + 1, c = a + np, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  prop('dock', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 7 + 31), WOOD = 0x7a5d40, DK = 0x4c3b2c, gm = grainMat(0x8a6c4a);
    // водяное пятно (неровный край) и илистый берег
    const wob = (rad, sd) => { const gg = new T.CircleGeometry(1, 40), p = gg.attributes.position; for (let i = 1; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), a = Math.atan2(y, x), d = 1 + 0.12 * (noise3(Math.cos(a) * 1.6 + sd, Math.sin(a) * 1.6, 3) * 2 - 1); p.setXY(i, x * d, y * d * 0.95); } gg.computeVertexNormals(); return gg; };
    add(g, wob(1, 3), 0x5a4a34, 0.6, 0.02, 2.0, 3.0, 3.0, 1, { r: [-PI / 2, 0, 0], jit: 0 });
    add(g, wob(1, 3), 0x3f7d90, 0.6, 0.05, 2.0, 2.7, 2.7, 1, { r: [-PI / 2, 0, 0], keep: true, mat: WATERM(0x3a6f78, 0.88) });
    // настил: поперечные доски, лаги вдоль Z, сваи
    const z0 = -3.6, z1 = 3.9, n = 31, deck = 0.52;
    for (let i = 0; i < n; i++) bx(g, WOOD, 0 + (r() - 0.5) * 0.02, deck, z0 + (i + 0.5) * (z1 - z0) / n, 1.9 + (r() - 0.5) * 0.06, 0.06, (z1 - z0) / n - 0.035, { mat: gm, jit: 0.1 });
    for (const s of [-1, 1]) bx(g, DK, s * 0.72, 0.4, (z0 + z1) / 2, 0.14, 0.16, z1 - z0 + 0.1, { jit: 0.08 });
    for (let k = 0; k < 5; k++) { const z = z0 + 0.4 + k * (z1 - z0 - 0.8) / 4; for (const s of [-1, 1]) { cy(g, DK, s * 0.88, 0.5, z, 0.095, 0.11, 1.0, { seg: 7, jit: 0.1, grad: [0.6, 1.05] }); } if (k > 0) bb(g, DK, [-0.88, 0.2, z], [0.88, 0.55, z - 0.6], 0.05, 0.05, { jit: 0.08 }); }
    for (const s of [-1, 1]) { cy(g, DK, s * 0.88, 0.78, z1 - 0.1, 0.1, 0.09, 0.5, { seg: 7, jit: 0.08 }); cy(g, 0x6a4a30, s * 0.88, 0.85, z1 - 0.1, 0.1, 0.1, 0.06, { seg: 7, jit: 0.08 }); }
    for (const s of [-1, 1]) bx(g, 0x2e3335, s * 0.55, 0.37, z1 + 0.05, 0.04, 0.74, 0.04, { jit: 0.03 });                              // лестница
    for (let i = 0; i < 4; i++) bx(g, 0x2e3335, 0.0, 0.12 + i * 0.22, z1 + 0.05, 1.1, 0.03, 0.04, { jit: 0.03 });
    // верёвка
    bm(g, 0x9a8a68, [0.88, 0.85, z1 - 0.1], [1.65, 0.3, 1.25], 0.018, 0.018, { seg: 4, jit: 0.05 });
    // лодка рядом с пирсом
    const B = new T.Group(); B.position.set(2.0, 0.0, 1.4); B.rotation.y = -0.06; g.add(B);
    const hull = hullGeo(3.1, 1.3, 0.5);
    add(B, hull, 0x3c6a7c, 0, 0.04, 0, 1, 1, 1, { jit: 0, vc: (x, y, z, nx, ny, nz, c) => { if (y > 0.5) c.set(0xe9e4d6); else if (y > 0.42) c.set(0x9a3a2e); c.multiplyScalar(0.7 + 0.35 * clamp(y / 0.5, 0, 1)); } });
    add(B, invGeo(hull), 0xc9b690, 0, 0.065, 0, 0.955, 0.98, 0.985, { jit: 0.04, grad: [0.55, 1.0] });
    for (const z of [-0.65, 0.15, 0.85]) bx(B, 0x9a7a4a, 0, 0.36, z, 1.1 - Math.abs(z) * 0.2, 0.045, 0.22, { jit: 0.08 });
    for (const s of [-1, 1]) { bm(B, 0x7a5a3a, [s * 0.2, 0.42, 0.1], [s * 1.05, 0.62, -0.1], 0.022, 0.017, { seg: 5, jit: 0.06 }); bx(B, 0x7a5a3a, s * 1.2, 0.62, -0.09, 0.1, 0.012, 0.42, { r: [0, 0.05, 0], jit: 0.06 }); bx(B, 0x2e3335, s * 0.52, 0.5, 0.0, 0.05, 0.04, 0.05, { jit: 0.03 }); }
    // камыш по краю
    for (let i = 0; i < 12; i++) { const a = i * 0.52 + r() * 0.3, d = 2.55 + r() * 0.3, x = 0.6 + Math.cos(a) * d, z = 2.0 + Math.sin(a) * d * 0.95; if (x > -0.9 && x < 1.1 && z < 4.3) continue; const h = 0.8 + r() * 0.7; bm(g, 0x5f7b3a, [x, 0, z], [x + (r() - 0.5) * 0.2, h, z + (r() - 0.5) * 0.2], 0.012, 0.007, { seg: 3, jit: 0.1 }); if (i % 3 === 0) cy(g, 0x5a3b22, x + 0.02, h * 0.82, z, 0.025, 0.025, 0.2, { seg: 5, jit: 0.1 }); }
    return bake(g, { jit: 0.05, gao: 0 });
  });

  // ---------------------------------------------------------------- клумба с цветами
  prop('flowerBed', (o) => {
    const g = new T.Group(), r = lcg(o.seed * 37 + 5), sd = r() * 30, W = 3.0, D = 1.4;
    const cols = [0xc83a3a, 0xe6c13a, 0xd77aa0, 0x7a4fa0, 0xf0ece0, 0xe08a2a];
    const brick = [0xa8a49a, 0x9c9588];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) bx(g, mix(brick[0], brick[1], r()), -W / 2 + (i + 0.5) * W / 7, 0.11, s * D / 2, W / 7 - 0.01, 0.22, 0.17, { jit: 0.1 });
      for (let i = 0; i < 3; i++) bx(g, mix(brick[0], brick[1], r()), s * W / 2, 0.11, -D / 2 + 0.17 + i * (D - 0.34) / 2, 0.17, 0.22, (D - 0.34) / 2 - 0.01 + 0.17, { jit: 0.1 });
    }
    blob(g, 0x3b2b1e, 0, 0.18, 0, W / 2 - 0.1, 0.12, D / 2 - 0.08, 3, { detail: 1, noise: 0.08, jit: 0.1 });
    for (let i = 0; i < 12; i++) blob(g, mix(0x3f6e2f, 0x5b8a3a, r()), (r() - 0.5) * (W - 0.4), 0.3, (r() - 0.5) * (D - 0.3), 0.2, 0.12, 0.2, i + 7, { detail: 'o', noise: 0.25, grad: [0.7, 1.1] });
    for (let i = 0; i < 52; i++) {
      const x = (r() - 0.5) * (W - 0.35), z = (r() - 0.5) * (D - 0.3), n = noise3(x * 1.1 + sd, 2, z * 1.1 + sd), col = cols[Math.floor(clamp(n * 1.2 + (r() - 0.5) * 0.35, 0, 0.99) * 6)], h = 0.22 + r() * 0.2;
      bm(g, 0x4a7a35, [x, 0.22, z], [x + (r() - 0.5) * 0.04, 0.22 + h, z + (r() - 0.5) * 0.04], 0.008, 0.007, { seg: 3, jit: 0.1 });
      sp(g, col, x, 0.22 + h + 0.03, z, 0.17 + r() * 0.04, 0.1, 0.17 + r() * 0.04, { ws: 6, hs: 3, jit: 0.1, grad: [0.8, 1.1] });
      sp(g, 0xe9c74a, x, 0.22 + h + 0.06, z, 0.04, 0.03, 0.04, { ws: 4, hs: 3, jit: 0.05 });
    }
    return bake(g, { jit: 0.05, gao: 0.12 });
  });

  // ---------------------------------------------------------------- пугало с вороной
  prop('scarecrow', (o) => {
    const g = new T.Group(), WOOD = 0x6b4f35, STRAW = 0xd9bf5e, SACK = 0xc7aa78, r = lcg(o.seed * 5 + 17);
    const pm = texMat('prop_plaid', 2, 2, 0xffffff, 0, 0, 0, { color: 0xffffff });
    cy(g, WOOD, 0, 1.15, 0, 0.045, 0.06, 2.3, { seg: 6, jit: 0.08, grad: [0.6, 1.05] });
    bm(g, WOOD, [-1.0, 1.58, 0], [1.0, 1.56, 0], 0.035, 0.035, { seg: 6, jit: 0.08 });
    bx(g, null, 0, 1.3, 0.0, 0.5, 0.62, 0.3, { mat: pm });                                           // рубаха
    for (const s of [-1, 1]) {
      bm(g, 0xa8412f, [s * 0.22, 1.55, 0], [s * 0.88, 1.56, 0.0], 0.095, 0.08, { seg: 7, jit: 0.1, mat: pm });
      for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.28; bm(g, mix(STRAW, 0x9a8030, r() * 0.5), [s * 0.88, 1.56, 0], [s * (1.0 + r() * 0.1), 1.56 + Math.sin(a) * 0.14 - 0.04, Math.cos(a) * 0.1 - 0.02], 0.02, 0.006, { seg: 3, jit: 0.1 }); }
      bm(g, mix(0x3f4a6a, 0x2f3a58, r()), [s * 0.12, 1.0, 0], [s * 0.13, 0.5, 0.02 * s], 0.11, 0.095, { seg: 7, jit: 0.1 });                  // штанины
      bx(g, 0xb8884a, s * 0.13, 0.78, 0.1, 0.12, 0.12, 0.02, { jit: 0.08 });                                                                      // заплатка
      for (let k = 0; k < 6; k++) bm(g, mix(STRAW, 0x9a8030, r() * 0.5), [s * 0.13, 0.52, 0.0], [s * (0.13 + (r() - 0.5) * 0.14), 0.3 + r() * 0.08, (r() - 0.5) * 0.12], 0.02, 0.006, { seg: 3, jit: 0.1 });
    }
    bx(g, 0x3f4a6a, 0, 0.98, 0.0, 0.36, 0.14, 0.26, { jit: 0.06 });
    bx(g, 0x4a3320, 0, 1.0, 0.152, 0.38, 0.05, 0.02, { jit: 0.05 });                               // ремень
    sp(g, SACK, 0, 1.96, 0, 0.36, 0.4, 0.36, { ws: 9, hs: 7, jit: 0.05, grad: [0.8, 1.05] });        // голова-мешок
    cn(g, SACK, 0, 2.2, 0, 0.04, 0.1, { seg: 5, jit: 0.04 });
    for (const s of [-1, 1]) { bx(g, 0x2a2018, s * 0.075, 1.99, 0.175, 0.07, 0.015, 0.01, { r: [0, 0, 0.8], jit: 0 }); bx(g, 0x2a2018, s * 0.075, 1.99, 0.176, 0.07, 0.015, 0.01, { r: [0, 0, -0.8], jit: 0 }); }
    cn(g, 0xb0613a, 0, 1.94, 0.185, 0.03, 0.07, { seg: 3, r: [PI / 2, 0, 0], jit: 0.05 });
    for (let k = 0; k < 6; k++) bx(g, 0x2a2018, -0.1 + k * 0.04, 1.86 + (k % 2) * 0.012, 0.175, 0.025, 0.012, 0.01, { r: [0, 0, 0], jit: 0 });
    cy(g, 0xc9a84e, 0, 2.15, 0, 0.36, 0.38, 0.03, { seg: 14, jit: 0.1 });                            // шляпа
    cy(g, 0xc2a044, 0, 2.28, 0, 0.17, 0.2, 0.22, { seg: 12, jit: 0.1 }); cy(g, 0x8a2f2a, 0, 2.2, 0, 0.205, 0.205, 0.05, { seg: 12, jit: 0.05 });
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU * 0.8 + 0.4; bm(g, mix(STRAW, 0x9a8030, r() * 0.5), [Math.cos(a) * 0.17, 2.08, Math.sin(a) * 0.17 + 0.03], [Math.cos(a) * 0.26, 1.98 - r() * 0.05, Math.sin(a) * 0.26 + 0.04], 0.016, 0.005, { seg: 3, jit: 0.1 });}
    const cx = 0.78, cyy = 1.6;                                                                     // ворона на руке
    sp(g, 0x1b1c1f, cx, cyy + 0.16, 0.0, 0.2, 0.2, 0.34, { ws: 7, hs: 5, r: [0.3, 0, 0], jit: 0.04 }); sp(g, 0x1b1c1f, cx, cyy + 0.32, 0.14, 0.12, 0.12, 0.13, { ws: 6, hs: 5, jit: 0.04 });
    cn(g, 0x4a4a4c, cx, cyy + 0.31, 0.24, 0.035, 0.1, { seg: 4, r: [PI / 2, 0, 0], jit: 0.03 }); cn(g, 0x1b1c1f, cx, cyy + 0.1, -0.22, 0.07, 0.2, { seg: 4, r: [-1.9, 0, 0], jit: 0.04 });
    sp(g, 0xe8e0c0, cx + 0.04, cyy + 0.34, 0.2, 0.025, 0.025, 0.02, { ws: 4, hs: 3, jit: 0 });
    bx(g, 0x4a4a4c, cx - 0.04, cyy + 0.03, 0.0, 0.015, 0.06, 0.015, { jit: 0 }); bx(g, 0x4a4a4c, cx + 0.04, cyy + 0.03, 0.0, 0.015, 0.06, 0.015, { jit: 0 });
    return bake(g, { jit: 0.05, gao: 0.12 });
  });

  // ---------------------------------------------------------------- спринклер: вращающаяся голова на тренопе (вращается группа с userData.spin)
  prop('sprinkler', (o) => {
    const g = new T.Group(), STEEL = 0x5b6c74, BRASS = 0xb08a3a, BL = 0x2f7fb0;
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; bm(g, 0x474f52, [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [0, 0.78, 0], 0.014, 0.016, { seg: 5, jit: 0.04 }); bx(g, 0x2d3335, Math.cos(a) * 0.4, 0.015, Math.sin(a) * 0.4, 0.08, 0.03, 0.08, { jit: 0.03 }); }
    cy(g, STEEL, 0, 0.6, 0, 0.032, 0.032, 1.2, { seg: 8, jit: 0.04 }); cy(g, BRASS, 0, 0.6, 0, 0.042, 0.042, 0.06, { seg: 8, jit: 0.05 }); cy(g, BLK(), 0, 1.0, 0, 0.045, 0.045, 0.1, { seg: 8, jit: 0.04 });
    bx(g, 0x2d3335, 0, 0.45, 0.06, 0.07, 0.08, 0.05, { jit: 0.03 });
    cy(g, 0x2f4a3a, 0.14, 0.05, 0.02, 0.025, 0.025, 0.3, { seg: 6, r: [0, 0, PI / 2], jit: 0.05 });                      // шланг
    const H = new T.Group();
    cy(H, BRASS, 0, 0, 0, 0.055, 0.045, 0.14, { seg: 8, jit: 0.04 }); cy(H, STEEL, 0, 0.1, 0, 0.04, 0.055, 0.07, { seg: 8, jit: 0.04 });
    bm(H, STEEL, [0, 0.08, 0], [0.34, 0.14, 0], 0.025, 0.02, { seg: 6, jit: 0.04 }); cy(H, BRASS, 0.38, 0.17, 0, 0.018, 0.026, 0.1, { seg: 6, r: [0, 0, -1.1], jit: 0.04 });
    bm(H, STEEL, [0, 0.08, 0], [-0.26, 0.1, 0], 0.025, 0.02, { seg: 6, jit: 0.04 }); cy(H, BRASS, -0.3, 0.12, 0, 0.018, 0.026, 0.1, { seg: 6, r: [0, 0, 1.1], jit: 0.04 });
    bx(H, 0x3a4144, -0.1, 0.19, 0.0, 0.06, 0.04, 0.04, { jit: 0.04 }); bm(H, 0x3a4144, [-0.04, 0.2, 0], [0.12, 0.17, 0], 0.01, 0.01, { seg: 4, jit: 0.04 });
    const wm = WATERM(0x9fd6f2, 0.55);
    for (const [sx, tilt] of [[1, 1], [-1, 0.75]]) {                                                                    // струя из капель по параболе
      for (let k = 0; k < 18; k++) {
        const t = (k + 1) / 19, x = sx * (0.42 + 2.5 * t * tilt), y = 0.22 + 1.5 * tilt * 4 * t * (1 - t) * 0.6;
        sp(H, 0x9fd6f2, x, y, (k % 3 - 1) * 0.02, 0.1 - 0.03 * t, 0.1 - 0.03 * t, 0.1 - 0.03 * t, { ws: 5, hs: 3, jit: 0, keep: true, mat: wm });
      }
    }
    const HB = bake(H, { jit: 0.04, gao: 0 }); HB.position.set(0, 1.28, 0); HB.userData.spin = 1;
    const base = bake(g, { jit: 0.04, gao: 0.15 }), out = new T.Group(); out.add(base); out.add(HB);
    function BLK() { return 0x444c50; }
    return out;
  });

  // ---------------------------------------------------------------- парковка для техники 14 x 9 м с разметкой и 4 тумбами
  prop('parkingBay', (o) => {
    const g = new T.Group(), W = 14, D = 9, TH = 0.12;
    bx(g, 0xb4b3ac, 0, TH / 2, 0, W, TH, D, { jit: 0.03 });
    add(g, G_('plane1', () => new T.PlaneGeometry(1, 1)), null, 0, TH + 0.012, 0, W - 0.04, D - 0.04, 1, { r: [-PI / 2, 0, 0], mat: texMat('prop_pad', 1, 1, 0xffffff, 0, 0, 0, { color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }) });   // сдвиг + polygonOffset: иначе разметка мерцает на дальних планах
    const sm = texMat('prop_stripes', 1, 3, 0xffffff, 0, 0, 0, { color: 0xffffff });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 6.45, z = sz * 3.95;
      add(g, cylG(0.1, 0.11, 10, true), null, x, TH + 0.45, z, 1, 0.9, 1, { mat: sm });
      sp(g, 0xe3b72b, x, TH + 0.9, z, 0.22, 0.2, 0.22, { ws: 8, hs: 4, jit: 0.04 });
      cy(g, 0x55534c, x, TH + 0.04, z, 0.16, 0.17, 0.08, { seg: 10, jit: 0.04 });
      cy(g, 0xe9e9e0, x, TH + 0.66, z, 0.113, 0.113, 0.05, { seg: 10, jit: 0.02 });
    }
    return bake(g, { jit: 0.03, gao: 0 });
  });
})();
