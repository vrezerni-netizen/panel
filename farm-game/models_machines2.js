/* Техника 2: комбайн (vehicle/combine), самоходный опрыскиватель (vehicle/waterer), прицепы (trailer/grain, trailer/flat).
   Реалистичные PBR-модели (three.js r128, без внешних файлов). Перед = +Z, начало координат — центр опоры на земле, 1 единица ~ 1 м.
   Все формы авторские: скруглённые кузова, лаковая краска, настоящие шины с протектором, стекло, гидравлика, шланги, декали. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const toV = (p) => (p && p.isVector3 ? p : V3(p[0], p[1], p[2]));
  const UP = V3(0, 1, 0);

  // ====================================================================== геометрия: сглаживание по углу излома
  /** Нормали усредняются только между гранями с углом меньше deg: скруглённые фаски гладкие, рёбра остаются чёткими. */
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
          if ((ix * jx + iy * jy + iz * jz) / (li * lj) >= cosT) { sx += jx; sy += jy; sz += jz; }
        }
        const L = Math.hypot(sx, sy, sz) || 1; out[i * 3] = sx / L; out[i * 3 + 1] = sy / L; out[i * 3 + 2] = sz / L;
      }
    }
    g.setAttribute('normal', new T.BufferAttribute(out, 3)); return g;
  }
  const _rb = {};
  /** Скруглённая коробка w×h×d (по x,y,z), радиус r; q — качество (0 дёшево ~70 тр., 1 обычное ~200, 2 высокое ~450); нормали сглажены. */
  function rboxGeo(w, h, d, r, seg, cs) {
    r = Math.max(0.001, Math.min(r == null ? 0.1 : r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const bev = Math.min(r * 0.7, d / 2 - 0.001, 0.3), hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.0005, Math.min(r, hw - 0.0005, hh - 0.0005)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh); sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: seg, curveSegments: cs });
    g.translate(0, 0, -(d - 2 * bev) / 2); return g;
  }
  const rb = (w, h, d, r, q) => {
    if (q == null) q = Math.min(w, h, d) < 0.12 ? 0 : 1;
    const k = [w, h, d, r, q].map((v) => (v == null ? 'n' : v.toFixed(3))).join('|');
    return _rb[k] || (_rb[k] = crease(rboxGeo(w, h, d, r, [1, 2, 3][q], [2, 3, 5][q]), 42));
  };
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
  /** Выдавливание контура: plane 'zy' — контур (z,y) вытянут по X шириной w (профиль кузова сбоку); 'xy' — контур (x,y) вытянут по Z на длину w. */
  function ex(pts, w, o) {
    o = o || {}; const b = o.b == null ? 0.02 : o.b, rad = o.r == null ? 0.1 : o.r;
    const g = new T.ExtrudeGeometry(o.shape || rshape(pts, rad), { depth: Math.max(0.002, w - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: [1, 2, 3][o.q == null ? 2 : o.q], curveSegments: o.cs || [2, 4, 6][o.q == null ? 2 : o.q] });
    g.translate(0, 0, -(w - 2 * b) / 2);
    if (o.plane === 'zy') g.rotateY(-PI / 2);
    return crease(g, 42);
  }
  const lathe = (prof, seg, axis) => { const g = new T.LatheGeometry(prof.map((p) => new T.Vector2(p[0], p[1])), seg || 24); if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'nx') g.rotateZ(PI / 2); else if (axis === 'z') g.rotateX(PI / 2); return g; };

  // ====================================================================== добавление деталей
  let TAG = ''; const tag = (t) => { TAG = t; };
  const mk = (geo, mat, x, y, z, rx, ry, rz) => { const m = C.mesh(geo, mat, x, y, z, rx, ry, rz); m.userData.tag = TAG; return m; };
  const put = (g, geo, mat, x, y, z, rx, ry, rz) => { const m = mk(geo, mat, x, y, z, rx, ry, rz); g.add(m); return m; };
  function quatDir(dir, up) {
    let u = up || UP; if (Math.abs(dir.y) > 0.995 && !up) u = V3(0, 0, 1);
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(dir, V3(0, 0, 0), u));
  }
  /** Стержень (цилиндр/конус) между двумя точками. */
  function rod(g, mat, a, b, r, seg, r2) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length(); if (L < 1e-5) return null;
    const m = mk(new T.CylinderGeometry(r2 == null ? r : r2, r, L, seg || (r < 0.03 ? 5 : 8), 1, r < 0.025), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.copy(new T.Quaternion().setFromUnitVectors(UP, d.normalize())); g.add(m); return m;
  }
  /** Скруглённый брус между двумя точками: w — ширина, h — высота (поперёк, в плоскости вверх), длина — вдоль a→b. */
  function bar(g, mat, a, b, w, h, r, up) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length(); if (L < 1e-5) return null;
    const m = mk(rb(w, h, L, r == null ? Math.min(w, h) * 0.3 : r), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.copy(quatDir(d.normalize(), up)); g.add(m); return m;
  }
  /** Шланг/труба по ломаной через CatmullRom. */
  function hose(g, mat, pts, r, segs, radial) {
    const cu = new T.CatmullRomCurve3(pts.map(toV), false, 'catmullrom', 0.5);
    return put(g, new T.TubeGeometry(cu, segs || pts.length * 6, r, radial || 6, false), mat, 0, 0, 0);
  }
  /** Контур-обод из окружностей (выпуклая оболочка в плоскости (u,v), обход против часовой): для гусениц, крыльев. */
  function hull2D(circ, arcSeg) {
    const n = circ.length, ang = [], pts = [];
    for (let i = 0; i < n; i++) {
      const A = circ[i], B = circ[(i + 1) % n], dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      const sb = clamp((A[2] - B[2]) / d, -1, 1), cb = Math.sqrt(1 - sb * sb), px = uy, py = -ux; // правая нормаль
      ang.push(Math.atan2(py * cb + uy * sb, px * cb + ux * sb));
    }
    for (let i = 0; i < n; i++) {
      const a0 = ang[(i + n - 1) % n]; let a1 = ang[i]; while (a1 < a0) a1 += TAU; const c = circ[i], st = arcSeg || 8;
      for (let k = 0; k <= st; k++) { const a = a0 + (a1 - a0) * k / st; pts.push([c[0] + Math.cos(a) * c[2], c[1] + Math.sin(a) * c[2]]); }
    }
    return pts;
  }

  // ====================================================================== текстуры
  const canvasTex = (cv, rep) => { const t = new T.CanvasTexture(cv); t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
  const ATL = { haz: [0, 0, 128, 64], hazY: [128, 0, 256, 64], white: [260, 4, 280, 20], black: [290, 4, 310, 20], grey: [320, 4, 340, 20], yel: [350, 4, 370, 20], red: [380, 4, 400, 20], dred: [410, 4, 430, 20],
    band1: [0, 70, 512, 102], band2: [0, 106, 512, 138], band3: [0, 142, 512, 174],
    t1: [0, 180, 256, 244], t2: [256, 180, 512, 244], t3: [0, 248, 256, 312], t4: [256, 248, 512, 312], t5: [0, 316, 256, 380], t6: [256, 316, 512, 380], num: [0, 384, 128, 448], warn: [128, 384, 256, 448], logo: [256, 384, 320, 448], plate: [320, 384, 512, 448], grid: [0, 452, 512, 512] };
  let _atlasTex = null, _atlasMat = null;
  function atlasTex() {
    if (_atlasTex) return _atlasTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 512, 512);
    const haz = (r, c1, c2) => {
      const [x, y, x1, y1] = r, w = x1 - x, h = y1 - y; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = c2; g.fillRect(x, y, w, h); g.fillStyle = c1;
      for (let i = -h; i < w + h; i += 64) { g.beginPath(); g.moveTo(x + i, y1); g.lineTo(x + i + 32, y1); g.lineTo(x + i + 32 + h, y); g.lineTo(x + i + h, y); g.closePath(); g.fill(); } g.restore();
    };
    haz(ATL.haz, '#c3201c', '#f1f1ee'); haz(ATL.hazY, '#16161a', '#f3c614');
    const solid = (r, c) => { g.fillStyle = c; g.fillRect(r[0] - 4, r[1] - 4, r[2] - r[0] + 8, r[3] - r[1] + 8); };
    solid(ATL.white, '#f2f2ee'); solid(ATL.black, '#17181b'); solid(ATL.grey, '#8d9399'); solid(ATL.yel, '#f0c020'); solid(ATL.red, '#c4211c'); solid(ATL.dred, '#7c1612');
    // полосы-декали вдоль борта (слева направо): белая, чёрная, красная/серая
    const band = (r, cols) => { const h = r[3] - r[1]; let yy = r[1]; for (const [c, f] of cols) { g.fillStyle = c; g.fillRect(r[0], yy, r[2] - r[0], h * f); yy += h * f; } };
    band(ATL.band1, [['#f2f2ee', 0.5], ['#17181b', 0.14], ['#f2f2ee', 0.12], ['#17181b', 0.24]]);
    band(ATL.band2, [['#17181b', 0.4], ['#8d9399', 0.12], ['#17181b', 0.48]]);
    band(ATL.band3, [['#f0c020', 0.5], ['#17181b', 0.14], ['#f0c020', 0.36]]);
    const plate = (r, bg, fg, txt, sub) => {
      const [x, y, x1, y1] = r, w = x1 - x, h = y1 - y; g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.56)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, x + w / 2, y + h * (sub ? 0.38 : 0.52));
      if (sub) { g.font = `bold ${Math.round(h * 0.22)}px Arial, Helvetica, sans-serif`; g.fillText(sub, x + w / 2, y + h * 0.8); }
    };
    plate(ATL.t1, '#15171a', '#f2f2ee', 'AGRIMAX', 'HX 8800 / TURBO'); plate(ATL.t2, '#c4211c', '#f2f2ee', 'HX 640', 'CLASS 7 · 9.0 L');
    plate(ATL.t3, '#15171a', '#f3c614', 'SPRAYTEC', 'AUTO-BOOM 4300'); plate(ATL.t4, '#f2f2ee', '#15171a', 'AQUA-PRO', '6000 L · 24 M');
    plate(ATL.t5, '#15171a', '#f2f2ee', 'BULKMASTER', '28 T · AXLE-TECH'); plate(ATL.t6, '#2a5d9a', '#f2f2ee', 'TRANSLOAD', 'FLAT-DECK 12 T');
    plate(ATL.num, '#15171a', '#f2f2ee', '640'); plate(ATL.plate, '#f2f2ee', '#15171a', 'MAX 40 KM/H');
    // знак «осторожно»
    { const [x, y, x1, y1] = ATL.warn, w = x1 - x, h = y1 - y; g.fillStyle = '#f3c614'; g.fillRect(x, y, w, h); g.fillStyle = '#15171a'; g.beginPath(); g.moveTo(x + w / 2, y + 6); g.lineTo(x + w - 10, y + h - 8); g.lineTo(x + 10, y + h - 8); g.closePath(); g.fill(); g.fillStyle = '#f3c614'; g.beginPath(); g.moveTo(x + w / 2, y + 17); g.lineTo(x + w - 24, y + h - 14); g.lineTo(x + 24, y + h - 14); g.closePath(); g.fill(); g.fillStyle = '#15171a'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', x + w / 2, y + h * 0.62); }
    // логотип: щит с колосом
    { const [x, y, x1, y1] = ATL.logo, w = x1 - x, h = y1 - y; g.fillStyle = '#f2f2ee'; g.fillRect(x, y, w, h); g.fillStyle = '#c4211c'; g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + w - 6, y + 6); g.lineTo(x + w - 6, y + h * 0.55); g.quadraticCurveTo(x + w / 2, y + h - 2, x + 6, y + h * 0.55); g.closePath(); g.fill(); g.strokeStyle = '#f2f2ee'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y + h * 0.82); g.lineTo(x + w / 2, y + h * 0.2); g.stroke(); for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + w / 2, y + h * (0.65 - i * 0.12)); g.lineTo(x + w / 2 - 12, y + h * (0.55 - i * 0.12)); g.moveTo(x + w / 2, y + h * (0.65 - i * 0.12)); g.lineTo(x + w / 2 + 12, y + h * (0.55 - i * 0.12)); g.stroke(); } }
    // сетка (решётка радиатора/вентиляции): светлая сетка на тёмном
    { const [x, y, x1, y1] = ATL.grid; g.fillStyle = '#101113'; g.fillRect(x, y, x1 - x, y1 - y); g.strokeStyle = '#3c4046'; g.lineWidth = 2; for (let i = 0; i < 128; i++) { g.beginPath(); g.moveTo(x + i * 4, y); g.lineTo(x + i * 4, y1); g.stroke(); } for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(x, y + i * 4); g.lineTo(x1, y + i * 4); g.stroke(); } }
    return (_atlasTex = canvasTex(cv));
  }
  function atlasMat() { return _atlasMat || (_atlasMat = new T.MeshStandardMaterial({ map: atlasTex(), metalness: 0.05, roughness: 0.5, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); }
  const _dg = {};
  function decalGeo(name, w, h) {
    const k = name + '|' + w.toFixed(3) + '|' + h.toFixed(3); if (_dg[k]) return _dg[k];
    const r = ATL[name], g = new T.PlaneGeometry(w, h), uv = g.attributes.uv, u0 = r[0] / 512, u1 = r[2] / 512, vb = 1 - r[3] / 512, vt = 1 - r[1] / 512;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), vb + (vt - vb) * uv.getY(i)); return (_dg[k] = g);
  }
  /** Декаль из атласа: плоская табличка w×h в точке (x,y,z), повёрнутая (ry — вокруг Y: 0 смотрит на +Z, ±PI/2 — на ±X, PI — на -Z); tiles — повтор полосы вдоль ширины. */
  function decal(g, name, w, h, x, y, z, ry, rx, tiles) {
    tiles = tiles || 1; const tw = w / tiles;
    for (let i = 0; i < tiles; i++) {
      const off = (i - (tiles - 1) / 2) * tw, m = mk(decalGeo(name, tw, h), atlasMat(), 0, 0, 0, rx || 0, ry || 0, 0);
      const c = Math.cos(ry || 0), s = Math.sin(ry || 0); m.position.set(x + off * c, y, z - off * s); m.castShadow = false; g.add(m);
    }
  }
  // «гребёнка»: пальцы мотовила (чёрные) и защитные пальцы ножа (стальные): альфа-тест
  let _comb = null;
  function combMats() {
    if (_comb) return _comb;
    const c1 = document.createElement('canvas'); c1.width = 128; c1.height = 64; let g = c1.getContext('2d'); g.clearRect(0, 0, 128, 64); g.fillStyle = '#222428';
    for (let i = 0; i < 8; i++) { g.fillRect(i * 16 + 5, 0, 6, 64); }
    g.fillStyle = '#d4a21a'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 16 + 4, 40); g.lineTo(i * 16 + 12, 40); g.lineTo(i * 16 + 10, 64); g.lineTo(i * 16 + 6, 64); g.fill(); } g.fillStyle = '#222428'; g.fillRect(0, 0, 128, 6);
    const c2 = document.createElement('canvas'); c2.width = 128; c2.height = 64; g = c2.getContext('2d'); g.clearRect(0, 0, 128, 64);
    for (let i = 0; i < 2; i++) { const x0 = i * 64; g.fillStyle = '#9ea4aa'; g.beginPath(); g.moveTo(x0 + 6, 0); g.lineTo(x0 + 58, 0); g.lineTo(x0 + 54, 28); g.lineTo(x0 + 36, 64); g.lineTo(x0 + 28, 64); g.lineTo(x0 + 10, 28); g.closePath(); g.fill(); g.fillStyle = '#5b6168'; g.beginPath(); g.moveTo(x0 + 24, 6); g.lineTo(x0 + 40, 6); g.lineTo(x0 + 34, 46); g.lineTo(x0 + 30, 46); g.closePath(); g.fill(); }
    const mk = (cv, col) => new T.MeshStandardMaterial({ map: canvasTex(cv, true), alphaTest: 0.5, side: T.DoubleSide, metalness: col ? 0.7 : 0.1, roughness: col ? 0.4 : 0.6, envMapIntensity: 0.6 });
    return (_comb = { tine: mk(c1, false), guard: mk(c2, true) });
  }
  /** Горизонтальная/вертикальная пластина-гребёнка: ширина w по X, высота h (радиально/по Z), rep — число повторов по X. */
  function comb(g, which, w, h, rep, x, y, z, rx, ry, rz) {
    const geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
    const m = mk(geo, combMats()[which], x, y, z, rx, ry, rz); m.castShadow = false; g.add(m); return m;
  }

  // ====================================================================== материалы
  /** Палитра машины: o.body — цвет краски, o.accent — второй цвет, o.rough — глянец (меньше = глянцевее). */
  function palette(o) {
    const rough = o.rough == null ? 0.32 : o.rough, mm = o.metallic == null ? 0.38 : o.metallic;
    const P = {
      body: C.paint(o.body, { roughness: rough, metalness: mm, envMapIntensity: 0.75 }),
      grey: C.paint(o.grey || 0xdcdfe1, { roughness: rough + 0.07, metalness: 0.18, envMapIntensity: 0.7 }),
      dark: C.pmat(o.dark || 0x383c42, { metalness: 0.45, roughness: 0.55, envMapIntensity: 0.5 }),
      black: C.pmat(0x141517, { metalness: 0.0, roughness: 0.62, envMapIntensity: 0.5 }),
      rubber: C.rubberM(), steel: C.metal(0xaeb4bb), lamp: C.lightM(0xfff4d0), amber: C.lightM(0xffa21a), decal: atlasMat(),
      tine: combMats().tine, guard: combMats().guard,
    };
    P.accent = o.accent != null ? C.paint(o.accent, { roughness: rough, metalness: mm, envMapIntensity: 0.75 }) : P.body;
    return P;
  }

  // ====================================================================== шины и колёса
  const _tg = new Map();
  /** Шина с профилем и протектором (ось X, центр в нуле). lugs — число зубьев протектора (ёлочка), lugH — их высота. */
  function tyreGeo(o) {
    const key = [o.R, o.W, o.rimR, o.lugs, o.lugH, o.flip ? 1 : 0, o.per, o.slant, o.duty, o.N].join('|'); if (_tg.has(key)) return _tg.get(key);
    const R = o.R, W = o.W, rr = o.rimR, H = R - rr, lugs = o.lugs || 0, lh = o.lugH || 0, per = o.per || 5, N = lugs ? lugs * per : (o.N || 48), fl = o.flip ? -1 : 1;
    const slant = o.slant == null ? 0.8 : o.slant, duty = o.duty == null ? 0.5 : o.duty;
    const half = [[0, 0.43, 0], [0.3, 0.5, 0], [0.7, 0.485, 0], [0.92, 0.435, 0.3], [0.985, 0.375, 0.85], [1, 0.3, 1], [1, 0.12, 1], [1, 0, 1]];
    const prof = []; for (const p of half) prof.push([p[0], -p[1], p[2]]); for (let i = half.length - 2; i >= 0; i--) prof.push([half[i][0], half[i][1], half[i][2]]);
    const pos = [], nr = prof.length;
    for (let i = 0; i < N; i++) {
      const th = i / N * TAU, c = Math.cos(th), s = Math.sin(th);
      for (let j = 0; j < nr; j++) {
        const rF = prof[j][0], aF = prof[j][1], lw = prof[j][2]; let rho = rr + H * rF;
        if (rF >= 1) rho -= R * 0.015 * (aF / 0.3) * (aF / 0.3);
        if (lugs && lw > 0) { const ph = th / TAU * lugs + Math.abs(aF) / 0.3 * slant, fr = ph - Math.floor(ph); rho += lh * lw * smoothstep(0, 0.16, fr) * (1 - smoothstep(duty, duty + 0.16, fr)); }
        pos.push(aF * W * fl, rho * c, rho * s);
      }
    }
    const idx = [];
    for (let i = 0; i < N; i++) { const i2 = (i + 1) % N; for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = i2 * nr + j; idx.push(a, b, a + 1, b, b + 1, a + 1); } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const jm = (nr - 1) >> 1, nn = g.attributes.normal, vi = jm; if (nn.getY(vi) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    _tg.set(key, g); return g;
  }
  const _rg = new Map();
  /** Диск колеса (обод, ступица): ось Y, наружу +Y; потом поворачивается на X. */
  function rimGeo(rr, W, axis) {
    const key = [rr, W, axis].join('|'); if (_rg.has(key)) return _rg.get(key);
    const hw = W * 0.5, p = [[0, -0.8 * hw], [rr * 0.94, -0.8 * hw], [rr * 0.99, 0.72 * hw], [rr * 1.03, 0.86 * hw], [rr * 0.97, 0.9 * hw], [rr * 0.88, 0.7 * hw], [rr * 0.62, 0.6 * hw], [rr * 0.34, 0.66 * hw], [rr * 0.26, 0.9 * hw], [rr * 0.1, 0.99 * hw], [0, 1.0 * hw]];
    const g = crease(lathe(p, 24, axis), 50); _rg.set(key, g); return g;
  }
  /** Колесо: шина + обод + ступица с болтами. side: +1 наружу к +X, -1 к -X. o: R, W, rimR, lugs, lugH, rimMat. */
  function wheel(g, P, x, y, z, side, o) {
    const rimMat = o.rimMat || P.body;
    put(g, tyreGeo(Object.assign({}, o, { flip: side < 0 })), P.rubber, x, y, z);
    put(g, rimGeo(o.rimR, o.W, side > 0 ? 'x' : 'nx'), rimMat, x, y, z);
    const hx = x + side * o.W * 0.5 * 0.9, nb = o.bolts || 6, br = o.rimR * 0.2;
    put(g, lathe([[0, 0], [o.rimR * 0.17, 0], [o.rimR * 0.14, 0.05 * o.rimR], [0, 0.07 * o.rimR]], 12, side > 0 ? 'x' : 'nx'), P.steel, hx, y, z);
    for (let i = 0; i < nb; i++) { const a = i / nb * TAU; put(g, new T.CylinderGeometry(o.rimR * 0.03, o.rimR * 0.03, 0.03, 5), P.steel, hx + side * 0.005, y + Math.cos(a) * br, z + Math.sin(a) * br, 0, 0, PI / 2); }
    // тормозной суппорт/ступичный редуктор с внутренней стороны
    put(g, new T.CylinderGeometry(o.rimR * 0.3, o.rimR * 0.3, o.W * 0.5, 12), P.dark, x - side * o.W * 0.28, y, z, 0, 0, PI / 2);
  }

  // ====================================================================== лестница, фара, зеркало
  function ladder(g, P, p0, p1, wd, n, rail) {
    p0 = toV(p0); p1 = toV(p1);
    for (const s of [-1, 1]) { rod(g, P.steel, V3(p0.x, p0.y, p0.z + s * wd / 2), V3(p1.x, p1.y, p1.z + s * wd / 2), 0.022, 8); }
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, p = p0.clone().lerp(p1, t); rod(g, P.steel, V3(p.x, p.y, p.z - wd / 2), V3(p.x, p.y, p.z + wd / 2), 0.014, 6); put(g, rb(0.2, 0.025, wd * 0.96, 0.01), P.dark, p.x + (p1.x >= p0.x ? 0.1 : -0.1) * 0, p.y, p.z); }
    if (rail) rod(g, P.steel, V3(p0.x, p0.y + 0.9, p0.z - wd / 2 - 0.06), V3(p1.x, p1.y + 0.4, p1.z - wd / 2 - 0.06), 0.02, 8);
  }
  /** Фара: корпус + линза (светящаяся), смотрит по dir ('z+','z-','x+','x-'). */
  function lampUnit(g, P, x, y, z, w, h, dir, mat) {
    const d = 0.05, hs = dir[0] === 'x';
    put(g, rb(hs ? d : w, h, hs ? w : d, 0.02), P.black, x, y, z);
    const off = (dir[1] === '+' ? 1 : -1) * (d / 2 + 0.001);
    put(g, rb(hs ? 0.01 : w * 0.8, h * 0.78, hs ? w * 0.8 : 0.01, 0.004), mat || P.lamp, x + (hs ? off : 0), y, z + (hs ? 0 : off));
  }
  function mirror(g, P, x, y, z, side, sz) {
    sz = sz || 1;
    rod(g, P.black, V3(x, y, z), V3(x + side * 0.28 * sz, y + 0.06, z + 0.1 * sz), 0.018, 6);
    put(g, rb(0.05, 0.34 * sz, 0.2 * sz, 0.02), P.black, x + side * 0.3 * sz, y + 0.06, z + 0.1 * sz);
    put(g, rb(0.012, 0.3 * sz, 0.17 * sz, 0.004), P.steel, x + side * (0.3 * sz + 0.027), y + 0.06, z + 0.1 * sz);
  }
  // чистое стекло как отдельные панели (потом сливаются в один меш)
  function pane(gl, w, h, x, y, z, rx, ry, rz) {
    const m = mk(new T.BoxGeometry(w, h, 0.014), C.glassM(0x7b9bab), x, y, z, rx, ry, rz); m.castShadow = false; gl.push(m); return m;
  }
  /** Сливает набор мешей в один (для стекла: один вызов отрисовки). */
  function mergeMeshes(list, material) {
    const pos = [], nor = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    for (const o of list) {
      o.updateMatrix(); const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(o.matrix);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrix); pos.push(v.x, v.y, v.z); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const m = new T.Mesh(geo, material); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; return m;
  }
  /** Склейка модели: непрозрачное по материалам (bakeTex), стекло одним мешем, центровка по z. */
  function finish(g, glass) {
    if (window.__DBG) { const cnt = {}; g.traverse((o) => { if (o.isMesh) { const k = o.userData.tag || '?'; cnt[k] = (cnt[k] || 0) + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); console.warn('DBG ' + JSON.stringify(cnt)); }
    const out = C.bakeTex(g), root = new T.Group();
    if (glass && glass.length) out.add(mergeMeshes(glass, C.glassM(0x7b9bab)));
    root.add(out);
    const bb = new T.Box3().setFromObject(root); out.position.z = -(bb.min.z + bb.max.z) / 2;
    return root;
  }
  const _cache = {};
  function reg(kind, name, fn) {
    FM.register(kind, name, (opts) => {
      opts = opts || {}; const key = [kind, name, clamp(Math.round(opts.level || 1), 1, 10), opts.variant | 0, opts.seed | 0, opts.length | 0, opts.stage | 0].join('|');
      if (!_cache[key]) _cache[key] = fn(opts);
      return _cache[key].clone(true);
    });
  }
  const lvOf = (opts) => clamp(Math.round(opts.level || 1), 1, 10);

  // ====================================================================== кабина (общая для комбайна и опрыскивателя)
  /** o: cz (центр по z), y0 (пол), w, d, h (от пола до крыши), sill (высота глухого низа), tilt (наклон лобового), tier (0..2: огни, маяк, GPS). */
  function cab(g, gl, P, o) {
    tag('cab');
    const w = o.w, d = o.d, h = o.h, y0 = o.y0, cz = o.cz, tl = o.tilt == null ? 0.16 : o.tilt, sill = o.sill == null ? 0.3 : o.sill, tier = o.tier || 0;
    const yf = y0 + 0.14, yr = y0 + h, zf = cz + d / 2, zb = cz - d / 2, hx = w / 2, zAt = (y) => zf - tl * (y - yf) / (yr - yf);
    put(g, rb(w + 0.12, 0.14, d + 0.12, 0.05), P.dark, 0, y0 + 0.07, cz);
    put(g, rb(w + 0.03, sill, d + 0.03, 0.05), o.lowerMat || P.body, 0, yf + sill / 2, cz);
    // стойки: передние наклонены назад
    for (const s of [-1, 1]) {
      rod(g, P.black, V3(s * hx, yf + sill - 0.02, zf), V3(s * (hx - 0.03), yr, zf - tl), 0.05, 8);
      rod(g, P.black, V3(s * hx, yf + sill - 0.02, zb), V3(s * (hx - 0.03), yr, zb + 0.05), 0.05, 8);
      rod(g, P.black, V3(s * (hx + 0.004), yf + sill, cz + 0.12), V3(s * (hx + 0.004), yr, cz + 0.12), 0.011, 6);
      rod(g, P.black, V3(s * (hx + 0.004), yf + sill, zb + 0.32), V3(s * (hx + 0.004), yr, zb + 0.32), 0.011, 6);
      put(g, rb(0.03, 0.05, 0.16, 0.012), P.steel, s * (hx + 0.022), yf + sill * 0.7, cz - 0.1);
    }
    rod(g, P.black, V3(-hx, yr - 0.02, zf - tl), V3(hx, yr - 0.02, zf - tl), 0.034, 8); rod(g, P.black, V3(-hx, yf + sill - 0.04, zf - 0.01), V3(hx, yf + sill - 0.04, zf - 0.01), 0.03, 8);
    // крыша со свесом, козырёк, кондиционер
    put(g, rb(w + 0.3, 0.13, d + 0.36, 0.06, 1), P.grey, 0, yr + 0.065, cz + 0.02);
    put(g, rb(w * 0.62, 0.14, d * 0.42, 0.06, 1), P.grey, 0, yr + 0.19, cz - d * 0.22);
    for (let i = 0; i < 4; i++) put(g, rb(w * 0.5, 0.012, 0.025, 0.004), P.black, 0, yr + 0.2, cz - d * 0.22 - d * 0.17 + 0.06 + i * 0.05 - 0.0 + d * 0.0).position.y = yr + 0.262;
    put(g, rb(w + 0.04, 0.035, 0.26, 0.015), P.black, 0, yr - 0.015, zf - tl + 0.1, 0.28, 0, 0);
    // стёкла
    const yl = yf + 0.1, yt = yr - 0.02, zl = zAt(yl), zt = zAt(yt), dz = zt - zl, hf = yt - yl;
    pane(gl, w - 0.1, Math.hypot(hf, dz), 0, (yl + yt) / 2, (zl + zt) / 2 + 0.005, Math.atan2(dz, hf), 0, 0);
    for (const s of [-1, 1]) pane(gl, 0.014, yt - (yf + sill), s * (hx + 0.002), (yt + yf + sill) / 2, (zb + 0.06 + zf - 0.1) / 2, 0, 0, 0).scale.z = (zf - 0.1 - zb - 0.06) / 0.014;
    pane(gl, w - 0.1, yt - (yf + sill) - 0.04, 0, (yt + yf + sill) / 2, zb - 0.002, 0, 0, 0);
    // дворники
    for (const s of [-0.28, 0.2]) { const ya = yl + 0.06, yb2 = yt - 0.2; rod(g, P.black, V3(s, ya, zAt(ya) + 0.02), V3(s + 0.34, yb2, zAt(yb2) + 0.02), 0.009, 5); }
    // салон: сиденье, руль, консоль, подлокотник с джойстиком, монитор
    put(g, rb(0.5, 0.14, 0.5, 0.05), P.black, 0, yf + 0.4, cz - 0.2); put(g, rb(0.5, 0.7, 0.11, 0.05), P.black, 0, yf + 0.78, cz - 0.46, -0.12, 0, 0); put(g, rb(0.3, 0.2, 0.08, 0.04), P.black, 0, yf + 1.23, cz - 0.5, -0.12, 0, 0);
    rod(g, P.dark, V3(0, yf + 0.02, cz - 0.2), V3(0, yf + 0.34, cz - 0.2), 0.05, 8);
    put(g, rb(0.56, 0.42, 0.34, 0.06), P.black, 0, yf + 0.3, zf - 0.28); put(g, rb(0.56, 0.12, 0.3, 0.05), P.black, 0, yf + 0.55, zf - 0.34);
    rod(g, P.black, V3(0, yf + 0.55, zf - 0.34), V3(0, yf + 0.86, zf - 0.54), 0.025, 8);
    put(g, new T.TorusGeometry(0.17, 0.017, 6, 20), P.black, 0, yf + 0.9, zf - 0.56, -0.95, 0, 0);
    put(g, rb(0.14, 0.12, 0.5, 0.04), P.black, hx - 0.2, yf + 0.66, cz - 0.15); rod(g, P.black, V3(hx - 0.2, yf + 0.7, cz - 0.02), V3(hx - 0.2, yf + 0.86, cz - 0.04), 0.017, 6);
    put(g, rb(0.26, 0.2, 0.04, 0.02), P.black, hx - 0.28, yf + 0.9, cz + 0.2, 0, -0.35, 0);
    // зеркала
    for (const s of [-1, 1]) mirror(g, P, s * (hx + 0.03), yr - 0.5, zf - tl * 0.7 - 0.05, s, o.mirror || 1);
    // огни на крыше
    const nl = [2, 4, 6][tier], zr = zf + 0.17;
    for (let i = 0; i < nl; i++) lampUnit(g, P, (i - (nl - 1) / 2) * (w * 0.8 / Math.max(1, nl - 1)), yr + 0.065, zr, 0.17, 0.1, 'z+');
    if (tier >= 1) for (const s of [-1, 1]) lampUnit(g, P, s * (hx + 0.1), yr + 0.065, zb + 0.2, 0.12, 0.09, s > 0 ? 'x+' : 'x-', P.amber);
    for (const s of [-1, 1]) lampUnit(g, P, s * (w * 0.4), yr + 0.065, zb - 0.16, 0.14, 0.08, 'z-', P.lamp);
    if (tier >= 1) { // маячок
      put(g, new T.CylinderGeometry(0.08, 0.09, 0.05, 14), P.black, hx - 0.18, yr + 0.15, zb + 0.22);
      put(g, lathe([[0, 0], [0.07, 0], [0.07, 0.05], [0.05, 0.1], [0, 0.12]], 16), P.amber, hx - 0.18, yr + 0.175, zb + 0.22);
    }
    if (tier >= 2) { // GPS-купол и антенны
      put(g, rb(0.34, 0.05, 0.34, 0.02), P.dark, 0, yr + 0.15, cz + d * 0.22);
      put(g, lathe([[0, 0], [0.15, 0], [0.16, 0.03], [0.13, 0.09], [0.06, 0.13], [0, 0.14]], 18), P.grey, 0, yr + 0.175, cz + d * 0.22);
      rod(g, P.black, V3(-hx + 0.25, yr + 0.13, zb + 0.16), V3(-hx + 0.22, yr + 0.85, zb + 0.18), 0.008, 5); put(g, new T.SphereGeometry(0.02, 8, 6), P.black, -hx + 0.22, yr + 0.86, zb + 0.18);
    } else rod(g, P.black, V3(-hx + 0.25, yr + 0.13, zb + 0.16), V3(-hx + 0.24, yr + 0.62, zb + 0.18), 0.008, 5);
  }

  // @@CAB@@
  // ====================================================================== общие узлы: крыло-дуга, гусеница, винтовая лента шнека
  /** Дуговая пластина (крыло): дуга радиусов rIn..rOut вокруг (cz,cy), углы a0..a1 от +Z вверх, ширина по X. */
  function arcPlate(g, mat, x, cy, cz, rIn, rOut, a0, a1, width, step) {
    const pts = [], n = step || 14;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cz + Math.cos(a) * rOut, cy + Math.sin(a) * rOut]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push([cz + Math.cos(a) * rIn, cy + Math.sin(a) * rIn]); }
    return put(g, ex(pts, width, { plane: 'zy', r: 0, b: 0.012, q: 0 }), mat, x, 0, 0);
  }
  /** Винтовая лента шнека вдоль оси X: от x0 на длину L, радиусы r1..r2, шаг pitch, направление dir (+1/-1). Двусторонняя. */
  function helixGeo(L, r1, r2, pitch, dir, steps) {
    const turns = L / pitch, N = Math.max(8, Math.round(turns * (steps || 12))), pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const u = i / N, th = u * turns * TAU * dir, x = u * L; for (const r of [r1, r2]) pos.push(x, Math.cos(th) * r, Math.sin(th) * r); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g1 = new T.BufferGeometry(); g1.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g1.setIndex(idx); g1.computeVertexNormals();
    const g2 = g1.clone(), i2 = idx.slice(); for (let k = 0; k < i2.length; k += 3) { const t = i2[k + 1]; i2[k + 1] = i2[k + 2]; i2[k + 2] = t; } g2.setIndex(i2); g2.computeVertexNormals();
    const a = g1.toNonIndexed(), b = g2.toNonIndexed(), p = new Float32Array(a.attributes.position.count * 6), nn = new Float32Array(p.length);
    p.set(a.attributes.position.array, 0); p.set(b.attributes.position.array, a.attributes.position.array.length); nn.set(a.attributes.normal.array, 0); nn.set(b.attributes.normal.array, a.attributes.normal.array.length);
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(p, 3)); out.setAttribute('normal', new T.BufferAttribute(nn, 3)); return out;
  }
  /** Резиновая полугусеница: три катка (z,y,r) по часовой стрелке наоборот; x — центр гусеницы, tw — ширина. */
  function trackUnit(g, P, x, side, circ, tw) {
    const outer = hull2D(circ, 10), inner = hull2D(circ.map((c) => [c[0], c[1], c[2] - 0.085]), 10);
    const sh = new T.Shape(); outer.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const hp = new T.Path(); inner.forEach((p, i) => (i ? hp.lineTo(p[0], p[1]) : hp.moveTo(p[0], p[1]))); sh.holes.push(hp);
    put(g, ex(null, tw, { shape: sh, b: 0.012, plane: 'zy', q: 0 }), P.rubber, x, 0, 0);
    // грунтозацепы по внешнему контуру
    const cum = [0]; for (let i = 1; i <= outer.length; i++) { const a = outer[i - 1], b = outer[i % outer.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const Lt = cum[cum.length - 1], nc = Math.round(Lt / 0.26), cg = new T.BoxGeometry(tw * 0.97, 0.075, 0.12);
    for (let k = 0; k < nc; k++) {
      const s = (k + 0.5) / nc * Lt; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = outer[i - 1], b = outer[i % outer.length], f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f, dz = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dz, dy) || 1;
      const nz = dy / dl, ny = -dz / dl; put(g, cg, P.rubber, x, py + ny * 0.03, px + nz * 0.03, Math.atan2(-dy, dz), 0, 0);
    }
    // катки, ведущая звёздочка, ступицы (видны сбоку)
    const fx = x + side * (tw * 0.5 - 0.06);
    circ.forEach((c, i) => {
      const r = c[2] - 0.11; put(g, new T.CylinderGeometry(r, r, 0.42, 22), P.dark, x, c[1], c[0], 0, 0, PI / 2);
      put(g, new T.CylinderGeometry(r * 0.6, r * 0.6, 0.06, 18), P.body, fx + side * 0.19, c[1], c[0], 0, 0, PI / 2);
      put(g, new T.CylinderGeometry(r * 0.28, r * 0.28, 0.08, 14), P.steel, fx + side * 0.2, c[1], c[0], 0, 0, PI / 2);
      for (let b = 0; b < 8; b++) { const a = b / 8 * TAU, rr = r * 0.46; put(g, new T.CylinderGeometry(0.018, 0.018, 0.05, 6), P.steel, fx + side * 0.2, c[1] + Math.cos(a) * rr, c[0] + Math.sin(a) * rr, 0, 0, PI / 2); }
    });
    const z0 = circ[0][0], z1 = circ[1][0];
    for (let i = 0; i < 4; i++) { const z = z0 + (z1 - z0) * (0.2 + i * 0.2); put(g, new T.CylinderGeometry(0.17, 0.17, 0.42, 16), P.dark, x, 0.255, z, 0, 0, PI / 2); put(g, new T.CylinderGeometry(0.09, 0.09, 0.07, 12), P.steel, fx + side * 0.2, 0.255, z, 0, 0, PI / 2); }
  }

  // ====================================================================== жатка комбайна
  function header(g, P, hw, z0, t, lv) {
    tag('hdr-body');
    // корпус: корыто с задней стенкой, лоток шнека и передняя губа
    const pr = [[0, 0.45], [0.12, 0.27], [1.2, 0.25], [1.56, 0.27], [1.58, 0.36], [1.2, 0.42], [0.85, 0.5]];
    for (let a = -90; a >= -180; a -= 15) pr.push([0.5 + 0.4 * Math.cos(a * PI / 180), 0.95 + 0.4 * Math.sin(a * PI / 180)]);
    pr.push([0.1, 1.3], [0.0, 1.38]);
    put(g, ex(pr, hw, { plane: 'zy', r: 0.03, b: 0.015, q: 0 }), P.body, 0, 0, z0);
    // тёмная вставка на лотке и полозья снизу
    put(g, rb(hw - 0.08, 0.05, 0.62, 0.02), P.dark, 0, 0.5, z0 + 0.95); put(g, rb(hw - 0.06, 0.05, 1.4, 0.02), P.dark, 0, 0.23, z0 + 0.8);
    tag('hdr-auger');
    // шнек: ось + две встречные винтовые ленты + пальцы по центру
    const ax = z0 + 0.5, ay = 0.95, half = hw / 2 - 0.06;
    rod(g, P.steel, V3(-half, ay, ax), V3(half, ay, ax), 0.2, 20);
    const pitch = 0.46; for (const s of [-1, 1]) { const m = put(g, helixGeo(half - 0.08, 0.19, 0.385, pitch, -1, 12), P.steel, s * 0.04, ay, ax); if (s < 0) m.scale.x = -1; }
    put(g, rb(1.5, 0.52, 0.4, 0.06), P.dark, 0, 0.98, ax + 0.0);
    for (let i = 0; i < 6; i++) rod(g, P.steel, V3(-0.62 + i * 0.25, ay, ax + 0.2), V3(-0.62 + i * 0.25, ay + 0.1, ax + 0.45), 0.018, 6);
    tag('cutter');
    // ножевой брус: пальцы-гребёнка вперёд от губы + нож
    comb(g, 'guard', hw, 0.34, hw / 0.152, 0, 0.305, z0 + 1.7, -PI / 2, 0, 0);
    rod(g, P.steel, V3(-hw / 2 + 0.02, 0.325, z0 + 1.58), V3(hw / 2 - 0.02, 0.325, z0 + 1.58), 0.014, 6);
    put(g, rb(hw - 0.02, 0.05, 0.08, 0.02), P.steel, 0, 0.3, z0 + 1.56);
    tag('reel');
    // мотовило
    const rcz = z0 + 1.1, rcy = 1.3, rR = 0.56, nArm = hw > 6 ? 3 + Math.floor((hw - 6) / 3) : 2, nb = 6;
    const arms = []; for (let i = 0; i < nArm; i++) arms.push(-hw / 2 + 0.2 + (hw - 0.4) * i / (nArm - 1));
    rod(g, P.steel, V3(-hw / 2 + 0.06, rcy, rcz), V3(hw / 2 - 0.06, rcy, rcz), 0.05, 12);
    for (const xs of arms) {
      put(g, new T.CylinderGeometry(0.1, 0.1, 0.14, 14), P.dark, xs, rcy, rcz, 0, 0, PI / 2);
      for (let k = 0; k < nb; k++) { const a = k / nb * TAU + 0.2; rod(g, P.dark, V3(xs, rcy, rcz), V3(xs, rcy + Math.cos(a) * rR * 0.93, rcz + Math.sin(a) * rR * 0.93), 0.016, 5); }
      bar(g, P.dark, V3(xs, 1.28, z0 + 0.1), V3(xs, rcy, rcz - 0.05), 0.09, 0.12, 0.03);
    }
    for (let k = 0; k < nb; k++) {
      const a = k / nb * TAU + 0.2, ca = Math.cos(a), sa = Math.sin(a), br = rR * 0.93;
      rod(g, P.dark, V3(-hw / 2 + 0.12, rcy + ca * br, rcz + sa * br), V3(hw / 2 - 0.12, rcy + ca * br, rcz + sa * br), 0.024, 8);
      comb(g, 'tine', hw - 0.3, 0.2, (hw - 0.3) / 0.72, 0, rcy + ca * (br + 0.07), rcz + sa * (br + 0.07), Math.atan2(sa, ca) + 0.0, 0, 0);
    }
    tag('dividers');
    for (const s of [-1, 1]) {
      put(g, ex([[1.35, 0.3], [2.4, 0.3], [2.5, 0.42], [1.5, 1.0], [1.05, 1.34], [0.85, 0.95]], 0.14, { plane: 'zy', r: 0.05, b: 0.02, q: 1 }), P.body, s * (hw / 2 + 0.07), 0, z0);
      decal(g, 'hazY', 0.5, 0.2, s * (hw / 2 + 0.143), 0.52, z0 + 2.0, s * PI / 2, 0, 1);
      put(g, rb(0.1, 0.4, 0.14, 0.03), P.dark, s * (hw / 2 + 0.06), 0.88, z0 + 0.22);
    }
    // боковые щитки с логотипом и фонари
    for (const s of [-1, 1]) {
      if (t >= 1) { decal(g, 'haz', 0.6, 0.26, s * (hw / 2 + 0.0), 1.12, z0 + 0.0 - 0.0, 0, 0, 1); }
    }
    decal(g, 't1', 0.9, 0.22, 0, 0.7, z0 - 0.003, PI, 0, 1);
    if (t >= 1) for (const s of [-1, 1]) { lampUnit(g, P, s * (hw / 2 - 0.25), 1.38, z0 + 0.03, 0.14, 0.1, 'z-', P.amber); lampUnit(g, P, s * (hw / 2 - 0.5), 1.38, z0 + 0.03, 0.2, 0.1, 'z-', P.lamp); }
    // транспортная рама на колёсах (топ-комплектации): жатка 10-12 м едет на собственной раме
    if (t >= 2) {
      const tx = hw / 2 - 1.7;
      for (const s of [-1, 1]) {
        const wx = s * tx;
        bar(g, P.dark, V3(wx, 0.75, z0), V3(wx, 0.62, z0 - 1.05), 0.14, 0.16, 0.04);
        bar(g, P.dark, V3(wx + s * 0.25, 0.62, z0 - 0.05), V3(wx + s * 0.2, 0.55, z0 - 1.05), 0.1, 0.1, 0.03);
        rod(g, P.dark, V3(wx - 0.4, 0.5, z0 - 1.05), V3(wx + 0.4, 0.5, z0 - 1.05), 0.07, 10);
        wheel(g, P, wx - 0.4, 0.36, z0 - 1.05, -1, { R: 0.36, W: 0.26, rimR: 0.2, lugs: 0, N: 28, rimMat: P.grey, bolts: 5 });
        wheel(g, P, wx + 0.4, 0.36, z0 - 1.05, 1, { R: 0.36, W: 0.26, rimR: 0.2, lugs: 0, N: 28, rimMat: P.grey, bolts: 5 });
      }
      bar(g, P.dark, V3(-tx, 0.9, z0 - 0.2), V3(tx, 0.9, z0 - 0.2), 0.12, 0.1, 0.03);
    }
  }

  // ====================================================================== КОМБАЙН
  const HDR_W = [4.5, 4.5, 4.8, 7.2, 7.5, 7.8, 10.0, 10.8, 11.4, 12.0];
  function buildCombine(lv) {
    const g = new T.Group(), gl = [], t = lv <= 3 ? 0 : lv <= 6 ? 1 : 2, tracks = lv >= 8;
    const P = palette({ body: [0x9b241f, 0xa81e19, 0xa5151a][t], rough: [0.46, 0.34, 0.22][t], dark: 0x3a3e44 });
    const zEnd = -(3.75 + 0.42 * t), tankL = [2.55, 3.15, 3.7][t], tankTop = [3.95, 4.12, 4.28][t], tankHW = [1.3, 1.38, 1.46][t], tankZ1 = 0.72, tankZ0 = tankZ1 - tankL;
    const fz = 1.55, fR = [0.86, 0.98, 1.1][t], fW = [0.62, 0.74, 0.9][t], fx = [1.37, 1.43, 1.5][t], rzA = zEnd + 0.8, rR = [0.55, 0.6, 0.66][t], rW = [0.38, 0.42, 0.5][t], rx = [1.0, 1.05, 1.1][t];
    // --- нижний корпус: молотилка/соломотряс (сзади) и передний модуль
    tag('нижний корпус');
    put(g, ex([[zEnd, 2.05], [zEnd + 0.35, 1.45], [0.45, 1.38], [0.55, 2.72], [zEnd + 0.1, 2.72], [zEnd - 0.02, 2.45]], 2.5, { plane: 'zy', r: 0.15, b: 0.03, q: 1 }), P.body, 0, 0, 0);
    put(g, ex([[0.35, 1.34], [2.4, 1.22], [2.64, 1.5], [2.66, 2.46], [0.35, 2.5]], 2.0, { plane: 'zy', r: 0.12, b: 0.03, q: 1 }), P.body, 0, 0, 0);
    // --- бункер для зерна со скошенными стенками
    tag('бункер для зер');
    { const y0 = 2.62, ys = tankTop - 0.62, tw = tankHW - 0.42;
      put(g, ex([[-1.0, y0], [1.0, y0], [tankHW, y0 + 0.38], [tankHW, ys], [tw, tankTop], [-tw, tankTop], [-tankHW, ys], [-tankHW, y0 + 0.38]], tankL, { r: 0.22, b: 0.06, q: 2 }), P.body, 0, 0, (tankZ0 + tankZ1) / 2);
      for (const s of [-1, 1]) { put(g, rb(0.05, tankTop - y0 - 0.55, tankL - 0.5, 0.02), P.grey, s * (tankHW + 0.015), (tankTop + y0) / 2 - 0.05, (tankZ0 + tankZ1) / 2); }
      put(g, rb(2 * tw - 0.3, 0.07, tankL - 0.35, 0.03), P.grey, 0, tankTop + 0.015, (tankZ0 + tankZ1) / 2 + 0.05);
      for (let i = 0; i < 3; i++) put(g, rb(2 * tw - 0.3, 0.025, 0.05, 0.01), P.dark, 0, tankTop + 0.07, tankZ0 + 0.5 + i * (tankL - 1) / 2);
    }
    // --- моторный отсек с решётками и выхлопом
    tag('моторный отсек');
    { const ez0 = zEnd + 0.12, ez1 = tankZ0 - 0.04, ey = 3.55;
      put(g, ex([[ez0, 2.7], [ez1, 2.7], [ez1, ey - 0.05], [ez0 + 0.45, ey], [ez0 - 0.02, 3.1]], 1.9, { plane: 'zy', r: 0.2, b: 0.04, q: 1 }), P.grey, 0, 0, 0);
      decal(g, 'grid', 1.5, 0.52, 0, 3.33, ez0 - 0.12 + 0.06, PI, 0.78, 1);
      for (const s of [-1, 1]) { for (let i = 0; i < 7; i++) put(g, rb(0.03, 0.06, 0.6, 0.012), P.black, s * 0.955, 2.95 + i * 0.08, (ez0 + ez1) / 2 + 0.2, 0, 0, 0); decal(g, 'num', 0.5, 0.25, s * 0.958, 3.28, ez1 - 0.45, s * PI / 2, 0, 1); }
      put(g, rb(1.2, 0.03, (ez1 - ez0) - 0.9, 0.012), P.black, 0, ey + 0.02, (ez0 + ez1) / 2 + 0.3);
      for (let i = 0; i < 6; i++) put(g, rb(1.2, 0.02, 0.025, 0.008), P.dark, 0, ey + 0.04, ez0 + 0.9 + i * 0.12 * 1.0);
      // выхлоп и предочиститель воздуха
      const exz = ez1 - 0.25, exx = -0.78;
      rod(g, P.steel, V3(exx, ey - 0.05, exz), V3(exx, ey + 0.95, exz), 0.065, 12); rod(g, P.steel, V3(exx, ey + 0.95, exz), V3(exx + 0.0, ey + 1.13, exz - 0.1), 0.065, 12);
      put(g, new T.CylinderGeometry(0.1, 0.1, 0.05, 14), P.black, exx, ey + 0.08, exz); put(g, new T.TorusGeometry(0.067, 0.012, 6, 14), P.dark, exx, ey + 0.2, exz, PI / 2, 0, 0);
      put(g, lathe([[0, 0], [0.16, 0], [0.18, 0.4], [0.12, 0.6], [0.0, 0.64]], 18), P.dark, 0.45, ey, ez1 - 0.45);
    }
    // --- задняя часть: измельчитель, разбрасыватель, фонари
    tag('задняя часть');
    put(g, rb(1.9, 0.5, 0.55, 0.1), P.dark, 0, 1.85, zEnd - 0.1);
    for (const s of [-1, 1]) { put(g, lathe([[0, 0], [0.34, 0.02], [0.36, 0.05], [0, 0.04]], 20), P.steel, s * 0.45, 1.5, zEnd - 0.2, 0.2, 0, 0); }
    for (const s of [-1, 1]) { lampUnit(g, P, s * 0.88, 2.38, zEnd + 0.0, 0.2, 0.12, 'z-', P.body); lampUnit(g, P, s * 0.88, 2.2, zEnd - 0.01, 0.2, 0.08, 'z-', P.amber); }
    if (t >= 2) decal(g, 'haz', 1.1, 0.3, 0, 2.0, zEnd - 0.375, PI, 0, 4);
    // --- рама, мосты, подъёмные цилиндры
    tag('рама, мосты, п');
    for (const s of [-1, 1]) bar(g, P.dark, V3(s * 0.85, 1.12, zEnd + 0.3), V3(s * 0.85, 1.12, 2.3), 0.16, 0.26, 0.04);
    rod(g, P.dark, V3(-fx + 0.2, fR, fz), V3(fx - 0.2, fR, fz), 0.19, 14);
    bar(g, P.dark, V3(-rx, rR, rzA), V3(rx, rR, rzA), 0.22, 0.2, 0.05);
    for (const s of [-1, 1]) { rod(g, P.steel, V3(s * 0.35, 1.0, rzA + 0.28), V3(s * (rx - 0.15), rR + 0.05, rzA + 0.2), 0.03, 8); put(g, new T.CylinderGeometry(0.06, 0.06, 0.5, 10), P.dark, s * 0.45, 1.0, rzA + 0.26, 0, 0, PI / 2); }
    // --- колёса или гусеницы
    tag('колёса или гус');
    for (const s of [-1, 1]) {
      if (tracks) trackUnit(g, P, s * fx, s, [[fz - 1.05, 0.46, 0.46], [fz + 1.2, 0.5, 0.5], [fz - 0.38, 1.36, 0.6]], 0.78);
      else wheel(g, P, s * fx, fR, fz, s, { R: fR, W: fW, rimR: fR * 0.62, lugs: [14, 15, 16][t], lugH: fR * 0.085, per: 4, rimMat: P.body });
      wheel(g, P, s * rx, rR, rzA, s, { R: rR, W: rW, rimR: rR * 0.58, lugs: 10, lugH: rR * 0.05, per: 4, rimMat: P.dark, bolts: 5 });
      arcPlate(g, P.body, s * rx, rR, rzA, rR + 0.04, rR + 0.09, 0.12, PI * 0.88, rW + 0.1, 12);
    }
    // --- кабина
    tag('кабина');
    cab(g, gl, P, { cz: 1.78, y0: 2.5, w: [1.75, 1.85, 1.95][t], d: 1.64, h: [1.5, 1.55, 1.6][t], sill: 0.3, tilt: 0.16, tier: t, lowerMat: P.body });
    // --- наклонная камера и подъёмные цилиндры
    tag('наклонная каме');
    bar(g, P.body, V3(0, 1.82, 2.4), V3(0, 1.0, 3.98), 1.55, 0.9, 0.12);
    put(g, rb(1.8, 1.05, 0.16, 0.05), P.dark, 0, 1.0, 3.98);
    for (const s of [-1, 1]) { rod(g, P.dark, V3(s * 0.6, 1.0, 2.2), V3(s * 0.6, 1.12, 2.85), 0.075, 10); rod(g, P.steel, V3(s * 0.6, 1.12, 2.85), V3(s * 0.6, 1.2, 3.3), 0.04, 8); }
    // --- разгрузочный шнек (сложен вдоль левого борта бункера, сторона +X)
    tag('разгрузочный ш');
    { const xa = tankHW + 0.2, za = tankZ0 + 0.12, yT = tankTop + 0.02, zF = tankZ1 + [-0.15, 1.5, 2.0][t];
      rod(g, P.body, V3(xa, 2.75, za), V3(xa, yT, za), 0.21, 18); put(g, new T.SphereGeometry(0.235, 18, 14), P.body, xa, yT, za);
      rod(g, P.body, V3(xa, yT, za), V3(xa, yT, zF), 0.2, 18);
      for (const zz of [za + 0.5, (za + zF) / 2, zF - 0.4]) put(g, new T.TorusGeometry(0.21, 0.02, 8, 20), P.grey, xa, yT, zz, 0, PI / 2, 0);
      rod(g, P.dark, V3(xa, yT, zF), V3(xa, yT - 0.2, zF + 0.32), 0.19, 14, 0.12); put(g, new T.TorusGeometry(0.15, 0.015, 6, 16), P.steel, xa, yT - 0.18, zF + 0.3, PI / 2 - 0.5, 0, 0);
      rod(g, P.dark, V3(xa - 0.1, 3.0, za + 0.05), V3(xa - 0.05, yT - 0.12, za + 0.8), 0.04, 8); rod(g, P.steel, V3(xa - 0.05, yT - 0.12, za + 0.8), V3(xa, yT - 0.05, za + 1.1), 0.026, 8);
      if (t >= 1) rod(g, P.dark, V3(xa, 2.62, za), V3(xa, 2.8, za), 0.24, 14);
      if (t >= 2) { put(g, new T.SphereGeometry(0.22, 16, 12), P.grey, xa, yT, (za + zF) / 2); }
    }
    // --- лестница, площадка, поручни слева
    tag('лестница, площ');
    ladder(g, P, V3(tankHW + 0.28, 0.35, 0.25), V3(tankHW + 0.15, 2.55, 0.7), 0.46, 9, true);
    put(g, rb(0.5, 0.05, 0.2, 0.02), P.dark, tankHW - 0.05 + 0.0, 2.55, 0.85);
    rod(g, P.steel, V3(1.12, 3.5, 0.85), V3(1.12, 3.5, 1.0), 0.02, 6);
    // --- фары и габариты
    tag('фары и габарит');
    for (const s of [-1, 1]) { lampUnit(g, P, s * 0.78, 2.12, 2.66, 0.28, 0.14, 'z+'); lampUnit(g, P, s * 0.48, 2.12, 2.66, 0.28, 0.14, 'z+'); lampUnit(g, P, s * 0.9, 1.78, 2.66, 0.18, 0.1, 'z+', P.amber); }
    // --- декали: полоса вдоль борта, шильдики
    tag('декали');
    for (const s of [-1, 1]) {
      decal(g, 'band1', 2.4, 0.2, s * 1.254, 2.12, -1.3, s * PI / 2, 0, 1);
      decal(g, t >= 1 ? 't1' : 't2', 1.3, 0.33, s * (tankHW + 0.047), tankTop - 0.65, (tankZ0 + tankZ1) / 2, s * PI / 2, 0, 1);
      decal(g, 'logo', 0.34, 0.34, s * 1.012, 2.0, 2.05, s * PI / 2, 0, 1);
    }
    if (t >= 2) for (const s of [-1, 1]) decal(g, 'band2', 2.8, 0.14, s * 1.254, 1.82, -1.0, s * PI / 2, 0, 1);
    // --- жатка
    tag('жатка');
    header(g, P, HDR_W[lv - 1], 4.0, t, lv);
    return finish(g, gl);
  }
  reg('vehicle', 'combine', (opts) => buildCombine(lvOf(opts)));

  // @@COMBINE@@
  // @@SPRAYER@@
  // @@TRAILERS@@
})();
