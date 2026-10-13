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
    if (o.plane === 'zy') g.rotateY(-PI / 2); else if (o.plane === 'xz') g.rotateX(PI / 2);
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
    const m = mk(rb(w, h, L, r == null ? Math.min(w, h) * 0.3 : r, 0), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
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
      const [x, y, x1, y1] = r, w = x1 - x, h = y1 - y; g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = fg; let fs = Math.round(h * 0.56); g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; while (g.measureText(txt).width > w * 0.9 && fs > 8) { fs -= 2; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; } g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, x + w / 2, y + h * (sub ? 0.38 : 0.52));
      if (sub) { fs = Math.round(h * 0.22); g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; while (g.measureText(sub).width > w * 0.9 && fs > 6) { fs -= 1; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; } g.fillText(sub, x + w / 2, y + h * 0.8); }
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
  function atlasMat() { return _atlasMat || (_atlasMat = new T.MeshStandardMaterial({ map: atlasTex(), metalness: 0.0, roughness: 0.82, envMapIntensity: 0.18, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); }
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
      grey: C.paint(o.grey || 0xc3c7cb, { roughness: Math.min(0.75, rough + 0.22), metalness: 0.1, envMapIntensity: 0.4 }),
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
  /** Склейка геометрий (позиции+нормали) в одну неиндексированную. */
  function mergeGeos(list) {
    const gs = list.map((g) => (g.index ? g.toNonIndexed() : g)); let n = 0; for (const g of gs) n += g.attributes.position.count;
    const p = new Float32Array(n * 3), nn = new Float32Array(n * 3); let o = 0;
    for (const g of gs) { p.set(g.attributes.position.array, o * 3); nn.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(p, 3)); out.setAttribute('normal', new T.BufferAttribute(nn, 3)); return out;
  }
  /** Шина (ось X, центр в нуле): гладкая покрышка с настоящим профилем + отдельные грунтозацепы «ёлочкой» (lugs шт., высота lugH). */
  function tyreGeo(o) {
    const key = [o.R, o.W, o.rimR, o.lugs, o.lugH, o.N, o.chev, o.thick].join('|'); if (_tg.has(key)) return _tg.get(key);
    const R = o.R, W = o.W, rr = o.rimR, lugs = o.lugs || 0, lh = lugs ? (o.lugH || 0) : 0, Rb = R - lh, H = Rb - rr, N = o.N || 40;
    const half = [[0, 0.43], [0.3, 0.5], [0.72, 0.485], [0.93, 0.435], [0.99, 0.375], [1, 0.3], [1, 0]];
    const prof = []; for (const p of half) prof.push([p[0], -p[1]]); for (let i = half.length - 2; i >= 0; i--) prof.push([half[i][0], half[i][1]]);
    const pos = [], nr = prof.length;
    for (let i = 0; i < N; i++) {
      const th = i / N * TAU, c = Math.cos(th), s = Math.sin(th);
      for (let j = 0; j < nr; j++) { const rF = prof[j][0], aF = prof[j][1]; let rho = rr + H * rF; if (rF >= 1) rho -= Rb * 0.012 * (aF / 0.3) * (aF / 0.3); pos.push(aF * W, rho * c, rho * s); }
    }
    const idx = [];
    for (let i = 0; i < N; i++) { const i2 = (i + 1) % N; for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = i2 * nr + j; idx.push(a, b, a + 1, b, b + 1, a + 1); } }
    let g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(((nr - 1) >> 1)) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    const parts = [g.toNonIndexed()];
    if (lugs) {
      const psi = (o.chev == null ? 32 : o.chev) * PI / 180, thick = o.thick || (TAU * Rb / lugs * 0.34), lenA = W * 0.42 / Math.cos(psi), la = W * 0.21, bg = new T.BoxGeometry(lenA, lh + 0.006, thick), q = new T.Quaternion(), m4 = new T.Matrix4(), mb = new T.Matrix4(), one = V3(1, 1, 1);
      for (let i = 0; i < lugs; i++) for (const sd of [-1, 1]) {
        const tt = (i + 0.5) / lugs * TAU - la * Math.tan(psi) / Rb, c = Math.cos(tt), s = Math.sin(tt), rho = Rb - 0.006 + (lh + 0.006) / 2;
        mb.makeBasis(V3(1, 0, 0), V3(0, c, s), V3(0, -s, c)); q.setFromRotationMatrix(mb); q.multiply(new T.Quaternion().setFromAxisAngle(V3(0, 1, 0), sd * psi));
        m4.compose(V3(sd * la, rho * c, rho * s), q, one); parts.push(bg.clone().applyMatrix4(m4));
      }
    }
    const out = parts.length > 1 ? mergeGeos(parts) : parts[0]; _tg.set(key, out); return out;
  }
  const _rg = new Map();
  /** Диск колеса (обод): ось Y, наружу +Y; потом поворачивается на X. */
  function rimGeo(rr, W, axis, lite) {
    const key = [rr, W, axis, lite ? 1 : 0].join('|'); if (_rg.has(key)) return _rg.get(key);
    const hw = W * 0.5, p = [[0, -0.8 * hw], [rr * 0.94, -0.8 * hw], [rr * 0.99, 0.72 * hw], [rr * 1.03, 0.86 * hw], [rr * 0.97, 0.9 * hw], [rr * 0.86, 0.66 * hw], [rr * 0.45, 0.62 * hw], [rr * 0.24, 0.9 * hw], [0, 1.0 * hw]];
    const g = crease(lathe(p, lite ? 12 : 16, axis), 50); _rg.set(key, g); return g;
  }
  /** Ступица (сталь): колпак + болты, одной геометрией. */
  function hubGeo(rr, W, side, nb) {
    const key = ['h', rr, W, side, nb].join('|'); if (_rg.has(key)) return _rg.get(key);
    const ax = side > 0 ? 'x' : 'nx', parts = [lathe([[0, 0], [rr * 0.17, 0], [rr * 0.14, 0.05 * rr], [0, 0.07 * rr]], 10, ax)];
    for (let i = 0; i < nb; i++) { const a = i / nb * TAU, c = new T.CylinderGeometry(rr * 0.032, rr * 0.032, 0.03, 4); c.rotateZ(PI / 2); c.translate(side * 0.005, Math.cos(a) * rr * 0.21, Math.sin(a) * rr * 0.21); parts.push(c); }
    const out = mergeGeos(parts); _rg.set(key, out); return out;
  }
  /** Колесо: шина + обод + ступица. side: +1 наружу к +X, -1 к -X. o: R, W, rimR, lugs, lugH, N, rimMat; lite — упрощённое. */
  function wheel(g, P, x, y, z, side, o) {
    put(g, tyreGeo(o), P.rubber, x, y, z);
    put(g, rimGeo(o.rimR, o.W, side > 0 ? 'x' : 'nx', o.lite), o.rimMat || P.body, x, y, z);
    if (o.lite) return;
    put(g, hubGeo(o.rimR, o.W, side, o.bolts || 6), P.steel, x + side * o.W * 0.45, y, z);
    put(g, new T.CylinderGeometry(o.rimR * 0.3, o.rimR * 0.3, o.W * 0.5, 8), P.dark, x - side * o.W * 0.28, y, z, 0, 0, PI / 2);
  }

  // ====================================================================== лестница, фара, зеркало
  function ladder(g, P, p0, p1, wd, n, rail) {
    p0 = toV(p0); p1 = toV(p1);
    for (const s of [-1, 1]) rod(g, P.steel, V3(p0.x, p0.y, p0.z + s * wd / 2), V3(p1.x, p1.y, p1.z + s * wd / 2), 0.022, 6);
    for (let i = 0; i < n; i++) { const p = p0.clone().lerp(p1, (i + 0.5) / n); bx(g, P.dark, 0.16, 0.025, wd * 0.96, p.x, p.y, p.z); }
    if (rail) rod(g, P.steel, V3(p0.x, p0.y + 0.9, p0.z - wd / 2 - 0.06), V3(p1.x, p1.y + 0.4, p1.z - wd / 2 - 0.06), 0.02, 6);
  }
  /** Фара: корпус + линза (светящаяся), смотрит по dir ('z+','z-','x+','x-'). */
  function lampUnit(g, P, x, y, z, w, h, dir, mat) {
    const d = 0.05, hs = dir[0] === 'x', off = (dir[1] === '+' ? 1 : -1) * (d / 2 + 0.001);
    bx(g, P.black, hs ? d : w, h, hs ? w : d, x, y, z);
    bx(g, mat || P.lamp, hs ? 0.01 : w * 0.8, h * 0.78, hs ? w * 0.8 : 0.01, x + (hs ? off : 0), y, z + (hs ? 0 : off));
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
  /** Стеклянная пластина по четырём точкам (двусторонняя). */
  function glassQuad(gl, a, b, c, d) {
    const A = toV(a), B = toV(b), Cc = toV(c), D = toV(d), n = B.clone().sub(A).cross(D.clone().sub(A)).normalize();
    const pos = [], nor = [];
    for (const [p, q, r, sgn] of [[A, B, Cc, 1], [A, Cc, D, 1], [A, Cc, B, -1], [A, D, Cc, -1]]) for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); nor.push(n.x * sgn, n.y * sgn, n.z * sgn); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const m = new T.Mesh(geo, C.glassM(0x7b9bab)); m.castShadow = false; gl.push(m); return m;
  }
  /** o: cz (центр по z), y0 (пол), w, d, h (от пола до крыши), sill (высота глухого низа), tilt (наклон лобового), chamfer (скос передних углов), tier (0..2: огни, маяк, GPS). */
  function cab(g, gl, P, o) {
    tag('cab');
    const w = o.w, d = o.d, h = o.h, y0 = o.y0, cz = o.cz, tl = o.tilt == null ? 0.16 : o.tilt, sill = o.sill == null ? 0.3 : o.sill, tier = o.tier || 0, c = o.chamfer == null ? 0.22 : o.chamfer;
    const hx = w / 2, zf = cz + d / 2, zb = cz - d / 2, yf = y0 + 0.14, yr = y0 + h, ybase = yf + sill - 0.02;
    const fp = (ix, iz0, iz1) => [[-hx + c - ix, zf + iz1], [hx - c + ix, zf + iz1], [hx + ix, zf - c], [hx + ix, zb + 0.07], [hx - 0.07 + ix, zb - iz0], [-hx + 0.07 - ix, zb - iz0], [-hx - ix, zb + 0.07], [-hx - ix, zf - c]];
    const foot = (pts, th, y, mat, r, q) => put(g, ex(null, th, { shape: rshape(pts, r), b: 0.02, plane: 'xz', q: q == null ? 0 : q }), mat, 0, y, 0);
    foot(fp(0.06, 0.06, 0.06), 0.14, y0 + 0.07, P.dark, 0.1);
    foot(fp(0.012, 0.012, 0.012), sill, yf + sill / 2, o.lowerMat || P.body, 0.08, 1);
    // стойки (передние наклонены назад) и стекло
    const ps = [[-hx + c, zf, 0, -tl], [hx - c, zf, 0, -tl], [hx, zf - c, -0.025, -tl * 0.55], [hx, zb + 0.07, -0.03, 0], [hx - 0.07, zb, -0.03, 0.04], [-hx + 0.07, zb, 0.03, 0.04], [-hx, zb + 0.07, 0.03, 0], [-hx, zf - c, 0.025, -tl * 0.55]];
    // знаки x у «правых» вершин внутрь = минус, у левых = плюс (сделано выше)
    const at = (i, y) => { const p = ps[i], u = (y - ybase) / (yr - ybase); return V3(p[0] + p[2] * u, y, p[1] + p[3] * u); };
    for (let i = 0; i < 8; i++) rod(g, P.black, at(i, ybase), at(i, yr), 0.042, 7);
    const yt = yr - 0.02;
    const pane = (i, j, yb) => glassQuad(gl, at(i, yb), at(j, yb), at(j, yt), at(i, yt));
    pane(0, 1, yf + 0.1); pane(1, 2, yf + 0.1); pane(7, 0, yf + 0.1); pane(2, 3, yf + sill); pane(6, 7, yf + sill); pane(4, 5, yf + sill + 0.05); pane(3, 4, yf + sill + 0.05); pane(5, 6, yf + sill + 0.05);
    rod(g, P.black, at(0, yt), at(1, yt), 0.03, 6); rod(g, P.black, at(0, yf + 0.1), at(1, yf + 0.1), 0.028, 6);
    for (const s of [-1, 1]) {
      const i3 = s > 0 ? 3 : 6, i2 = s > 0 ? 2 : 7;
      rod(g, P.black, V3(s * (hx + 0.004), yf + sill, cz + 0.1), V3(s * (hx + 0.004), yr, cz + 0.1), 0.01, 4); rod(g, P.black, V3(s * (hx + 0.004), yf + sill, zb + 0.3), V3(s * (hx + 0.004), yr, zb + 0.3), 0.01, 4);
      bx(g, P.steel, 0.025, 0.045, 0.15, s * (hx + 0.02), yf + sill * 0.72, cz - 0.1);
    }
    // крыша со свесом и козырьком; блок кондиционера
    foot(fp(0.14, 0.2, 0.3), 0.13, yr + 0.065, P.grey, 0.14, 1);
    put(g, rb(w * 0.62, 0.14, d * 0.4, 0.06, 0), P.grey, 0, yr + 0.19, cz - d * 0.2);
    for (let i = 0; i < 4; i++) bx(g, P.black, w * 0.5, 0.012, 0.022, 0, yr + 0.262, cz - d * 0.2 - 0.12 + i * 0.07);
    // салон: сиденье, руль, консоль, подлокотник с джойстиком, монитор
    put(g, rb(0.5, 0.14, 0.5, 0.05, 0), P.black, 0, yf + 0.4, cz - 0.2); put(g, rb(0.5, 0.7, 0.11, 0.05, 0), P.black, 0, yf + 0.78, cz - 0.46, -0.12, 0, 0); put(g, rb(0.3, 0.2, 0.08, 0.04, 0), P.black, 0, yf + 1.23, cz - 0.5, -0.12, 0, 0);
    rod(g, P.dark, V3(0, yf + 0.02, cz - 0.2), V3(0, yf + 0.34, cz - 0.2), 0.05, 6);
    put(g, rb(0.56, 0.42, 0.34, 0.06, 0), P.black, 0, yf + 0.3, zf - 0.3); put(g, rb(0.56, 0.12, 0.3, 0.05, 0), P.black, 0, yf + 0.55, zf - 0.36);
    rod(g, P.black, V3(0, yf + 0.55, zf - 0.36), V3(0, yf + 0.86, zf - 0.56), 0.025, 6);
    put(g, new T.TorusGeometry(0.17, 0.017, 4, 14), P.black, 0, yf + 0.9, zf - 0.58, -0.95, 0, 0);
    put(g, rb(0.14, 0.12, 0.5, 0.04, 0), P.black, hx - 0.2, yf + 0.66, cz - 0.15); rod(g, P.black, V3(hx - 0.2, yf + 0.7, cz - 0.02), V3(hx - 0.2, yf + 0.86, cz - 0.04), 0.017, 5);
    put(g, rb(0.26, 0.2, 0.04, 0.02, 0), P.black, hx - 0.3, yf + 0.9, cz + 0.2, 0, -0.35, 0);
    // дворники
    for (const sx of [-0.3, 0.22]) { const ya = yf + 0.16, yb2 = yr - 0.28; rod(g, P.black, V3(sx, ya, at(0, ya).z + 0.02), V3(sx + 0.34, yb2, at(0, yb2).z + 0.02), 0.009, 4); }
    // зеркала
    for (const s of [-1, 1]) mirror(g, P, s * (hx + 0.03), yr - 0.5, zf - c - tl * 0.5, s, o.mirror || 1);
    // огни на крыше
    const nl = [2, 4, 6][tier], zr = zf + 0.3 - 0.02;
    for (let i = 0; i < nl; i++) lampUnit(g, P, (i - (nl - 1) / 2) * ((w - 2 * c) * 0.95 / Math.max(1, nl - 1)), yr + 0.065, zr, 0.17, 0.1, 'z+');
    if (tier >= 1) for (const s of [-1, 1]) lampUnit(g, P, s * (hx + 0.17), yr + 0.065, cz + 0.15, 0.14, 0.09, s > 0 ? 'x+' : 'x-', P.amber);
    for (const s of [-1, 1]) lampUnit(g, P, s * (w * 0.38), yr + 0.065, zb - 0.22, 0.14, 0.08, 'z-', P.lamp);
    if (o.beacon || tier >= 1) {
      put(g, new T.CylinderGeometry(0.08, 0.09, 0.05, 12), P.black, hx - 0.18, yr + 0.15, zb + 0.2);
      put(g, lathe([[0, 0], [0.07, 0], [0.07, 0.05], [0.05, 0.1], [0, 0.12]], 12), P.amber, hx - 0.18, yr + 0.175, zb + 0.2);
    }
    if (o.gps || tier >= 2) {
      bx(g, P.dark, 0.34, 0.05, 0.34, 0, yr + 0.15, cz + d * 0.2);
      put(g, lathe([[0, 0], [0.15, 0], [0.16, 0.03], [0.13, 0.09], [0.06, 0.13], [0, 0.14]], 14), P.grey, 0, yr + 0.175, cz + d * 0.2);
      rod(g, P.black, V3(-hx + 0.25, yr + 0.13, zb + 0.16), V3(-hx + 0.22, yr + 0.85, zb + 0.18), 0.008, 4); put(g, new T.SphereGeometry(0.02, 6, 5), P.black, -hx + 0.22, yr + 0.86, zb + 0.18);
    } else rod(g, P.black, V3(-hx + 0.25, yr + 0.13, zb + 0.16), V3(-hx + 0.24, yr + 0.62, zb + 0.18), 0.008, 4);
  }

  // @@CAB@@
  // ====================================================================== общие узлы: крыло-дуга, гусеница, винтовая лента шнека
  const _bxg = new T.BoxGeometry(1, 1, 1);
  /** Дешёвая коробка (12 треугольников) с центром в (x,y,z) и размерами w,h,d. */
  function bx(g, mat, w, h, d, x, y, z, rx, ry, rz) { const m = mk(_bxg, mat, x, y, z, rx, ry, rz); m.scale.set(w, h, d); g.add(m); return m; }
  /** Дуговая пластина (крыло): дуга радиусов rIn..rOut вокруг (cz,cy), углы a0..a1 от +Z вверх, ширина по X. */
  function arcPlate(g, mat, x, cy, cz, rIn, rOut, a0, a1, width, step) {
    const pts = [], n = step || 14;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cz + Math.cos(a) * rOut, cy + Math.sin(a) * rOut]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push([cz + Math.cos(a) * rIn, cy + Math.sin(a) * rIn]); }
    return put(g, ex(pts, width, { plane: 'zy', r: 0, b: 0.012, q: 0 }), mat, x, 0, 0);
  }
  /** Винтовая лента шнека вдоль оси X: на длину L, радиусы r1..r2, шаг pitch, направление dir (+1/-1). Двусторонняя. */
  function helixGeo(L, r1, r2, pitch, dir, steps) {
    const turns = L / pitch, N = Math.max(8, Math.round(turns * (steps || 10))), pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const u = i / N, th = u * turns * TAU * dir, x = u * L; for (const r of [r1, r2]) pos.push(x, Math.cos(th) * r, Math.sin(th) * r); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g1 = new T.BufferGeometry(); g1.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g1.setIndex(idx); g1.computeVertexNormals();
    const g2 = g1.clone(), i2 = idx.slice(); for (let k = 0; k < i2.length; k += 3) { const t = i2[k + 1]; i2[k + 1] = i2[k + 2]; i2[k + 2] = t; } g2.setIndex(i2); g2.computeVertexNormals();
    return mergeGeos([g1.toNonIndexed(), g2.toNonIndexed()]);
  }
  /** Резиновая полугусеница: круги катков (z,y,r) против часовой; x — центр, tw — ширина, side — наружу. */
  function trackUnit(g, P, x, side, circ, tw) {
    const outer = hull2D(circ, 9), inner = hull2D(circ.map((c) => [c[0], c[1], c[2] - 0.085]), 9);
    const sh = new T.Shape(); outer.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const hp = new T.Path(); inner.forEach((p, i) => (i ? hp.lineTo(p[0], p[1]) : hp.moveTo(p[0], p[1]))); sh.holes.push(hp);
    put(g, ex(null, tw, { shape: sh, b: 0.012, plane: 'zy', q: 0 }), P.rubber, x, 0, 0);
    const cum = [0]; for (let i = 1; i <= outer.length; i++) { const a = outer[i - 1], b = outer[i % outer.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const Lt = cum[cum.length - 1], nc = Math.round(Lt / 0.27), cg = new T.BoxGeometry(tw * 0.97, 0.07, 0.12);
    for (let k = 0; k < nc; k++) {
      const s = (k + 0.5) / nc * Lt; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = outer[i - 1], b = outer[i % outer.length], f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f, dz = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dz, dy) || 1;
      put(g, cg, P.rubber, x, py - dz / dl * 0.028, px + dy / dl * 0.028, Math.atan2(-dy, dz), 0, 0);
    }
    const fx = x + side * (tw * 0.5 - 0.06);
    circ.forEach((c) => {
      const r = c[2] - 0.11; put(g, new T.CylinderGeometry(r, r, 0.42, 20), P.dark, x, c[1], c[0], 0, 0, PI / 2);
      put(g, new T.CylinderGeometry(r * 0.62, r * 0.62, 0.06, 16), P.body, fx + side * 0.19, c[1], c[0], 0, 0, PI / 2);
      put(g, new T.CylinderGeometry(r * 0.28, r * 0.28, 0.08, 12), P.steel, fx + side * 0.2, c[1], c[0], 0, 0, PI / 2);
    });
    const z0 = circ[0][0], z1 = circ[1][0];
    for (let i = 0; i < 4; i++) { const z = z0 + (z1 - z0) * (0.2 + i * 0.2); put(g, new T.CylinderGeometry(0.17, 0.17, 0.42, 14), P.dark, x, 0.255, z, 0, 0, PI / 2); put(g, new T.CylinderGeometry(0.09, 0.09, 0.07, 10), P.steel, fx + side * 0.2, 0.255, z, 0, 0, PI / 2); }
  }
  /** Поручень по ломаной (стойки + верхняя труба). */
  function railing(g, P, pts, h, spacing) {
    h = h || 0.9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = toV(pts[i]), b = toV(pts[i + 1]), len = a.distanceTo(b), n = Math.max(1, Math.round(len / (spacing || 0.7)));
      for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); if (i && !k) continue; rod(g, P.steel, p, V3(p.x, p.y + h, p.z), 0.017, 5); }
      rod(g, P.steel, V3(a.x, a.y + h, a.z), V3(b.x, b.y + h, b.z), 0.019, 6); rod(g, P.steel, V3(a.x, a.y + h * 0.5, a.z), V3(b.x, b.y + h * 0.5, b.z), 0.013, 5);
    }
  }

  // ====================================================================== жатка комбайна
  function header(g, P, hw, z0, t, lv) {
    tag('hdr-body');
    const pr = [[0, 0.45], [0.12, 0.27], [1.2, 0.25], [1.56, 0.27], [1.58, 0.36], [1.2, 0.42], [0.85, 0.5]];
    for (let a = -90; a >= -180; a -= 22.5) pr.push([0.5 + 0.4 * Math.cos(a * PI / 180), 0.95 + 0.4 * Math.sin(a * PI / 180)]);
    pr.push([0.1, 1.3], [0.0, 1.38]);
    put(g, ex(pr, hw, { plane: 'zy', r: 0.04, b: 0.015, q: 0 }), t >= 2 ? P.dark : P.body, 0, 0, z0);
    put(g, rb(hw - 0.08, 0.05, 0.62, 0.02, 0), P.dark, 0, 0.5, z0 + 0.95);
    bx(g, P.dark, hw - 0.06, 0.05, 1.3, 0, 0.23, z0 + 0.8);
    // задняя стенка: кронштейн наклонной камеры и логотип
    put(g, rb(1.7, 1.0, 0.1, 0.05, 0), P.dark, 0, 0.9, z0 - 0.05);
    decal(g, 't1', 0.95, 0.24, 0, 1.06, z0 - 0.0 - 0.004, PI, 0, 1);
    for (const s of [-1, 1]) { decal(g, 'logo', 0.3, 0.3, s * (hw / 2 + 0.003), 0.78, z0 + 0.35, s * PI / 2, 0, 1); if (t >= 1 || lv >= 3) decal(g, 'haz', 0.7, 0.2, s * (hw / 2 + 0.003), 1.12, z0 + 0.5, s * PI / 2, 0, 1); }
    tag('hdr-auger');
    const ax = z0 + 0.5, ay = 0.95, half = hw / 2 - 0.06;
    rod(g, P.steel, V3(-half, ay, ax), V3(half, ay, ax), 0.2, 16);
    const pitch = 0.5; for (const s of [-1, 1]) { const m = put(g, helixGeo(half - 0.08, 0.19, 0.385, pitch, -1, 9), P.steel, s * 0.04, ay, ax); if (s < 0) m.scale.x = -1; }
    put(g, rb(1.5, 0.52, 0.4, 0.06, 0), P.dark, 0, 0.98, ax);
    for (let i = 0; i < 5; i++) rod(g, P.steel, V3(-0.5 + i * 0.25, ay, ax + 0.2), V3(-0.5 + i * 0.25, ay + 0.08, ax + 0.46), 0.016, 5);
    tag('cutter');
    comb(g, 'guard', hw, 0.34, hw / 0.152, 0, 0.305, z0 + 1.7, -PI / 2, 0, 0);
    rod(g, P.steel, V3(-hw / 2 + 0.02, 0.325, z0 + 1.58), V3(hw / 2 - 0.02, 0.325, z0 + 1.58), 0.014, 5);
    bx(g, P.steel, hw - 0.02, 0.05, 0.08, 0, 0.3, z0 + 1.56);
    tag('reel');
    const rcz = z0 + 1.12, rcy = 1.22, rR = 0.6, nArm = hw > 6 ? 3 + Math.floor((hw - 6) / 3) : 2, nb = 6;
    const arms = []; for (let i = 0; i < nArm; i++) arms.push(-hw / 2 + 0.2 + (hw - 0.4) * i / (nArm - 1));
    rod(g, P.steel, V3(-hw / 2 + 0.06, rcy, rcz), V3(hw / 2 - 0.06, rcy, rcz), 0.05, 10);
    for (const xs of arms) {
      put(g, new T.CylinderGeometry(0.1, 0.1, 0.14, 12), P.dark, xs, rcy, rcz, 0, 0, PI / 2);
      for (let k = 0; k < nb; k++) { const a = k / nb * TAU + 0.2; rod(g, P.dark, V3(xs, rcy, rcz), V3(xs, rcy + Math.cos(a) * rR * 0.93, rcz + Math.sin(a) * rR * 0.93), 0.02, 5); }
      bar(g, P.dark, V3(xs, 1.28, z0 + 0.08), V3(xs, rcy, rcz - 0.05), 0.09, 0.12, 0.03, V3(1, 0, 0));
    }
    for (const s of [-1, 1]) { rod(g, P.dark, V3(s * (hw / 2 - 0.12), 0.9, z0 + 0.2), V3(s * (hw / 2 - 0.12), 1.12, z0 + 0.62), 0.045, 8); rod(g, P.steel, V3(s * (hw / 2 - 0.12), 1.12, z0 + 0.62), V3(s * (hw / 2 - 0.12), 1.2, z0 + 0.9), 0.025, 6); }
    for (let k = 0; k < nb; k++) {
      const a = k / nb * TAU + 0.2, ca = Math.cos(a), sa = Math.sin(a), br = rR * 0.93;
      rod(g, P.dark, V3(-hw / 2 + 0.12, rcy + ca * br, rcz + sa * br), V3(hw / 2 - 0.12, rcy + ca * br, rcz + sa * br), 0.026, 6);
      comb(g, 'tine', hw - 0.3, 0.24, (hw - 0.3) / 0.72, 0, rcy + ca * (br + 0.1), rcz + sa * (br + 0.1), Math.atan2(sa, ca), 0, 0);
    }
    tag('dividers');
    for (const s of [-1, 1]) {
      put(g, ex([[1.35, 0.3], [2.4, 0.3], [2.5, 0.42], [1.5, 1.0], [1.05, 1.34], [0.85, 0.95]], 0.14, { plane: 'zy', r: 0.04, b: 0.015, q: 0 }), P.body, s * (hw / 2 + 0.07), 0, z0);
      decal(g, 'hazY', 0.5, 0.2, s * (hw / 2 + 0.143), 0.52, z0 + 2.0, s * PI / 2, 0, 1);
    }
    if (t >= 1) for (const s of [-1, 1]) { lampUnit(g, P, s * (hw / 2 - 0.25), 1.38, z0 + 0.03, 0.14, 0.1, 'z-', P.amber); lampUnit(g, P, s * (hw / 2 - 0.5), 1.38, z0 + 0.03, 0.2, 0.1, 'z-', P.lamp); }
    if (t >= 2) {
      tag('hdr-frame');
      const tx = hw / 2 - 1.7;
      for (const s of [-1, 1]) {
        const wx = s * tx;
        bar(g, P.dark, V3(wx, 0.75, z0), V3(wx, 0.55, z0 - 1.05), 0.14, 0.16, 0.04);
        rod(g, P.dark, V3(wx - 0.22, 0.4, z0 - 1.05), V3(wx + 0.22, 0.4, z0 - 1.05), 0.06, 8);
        wheel(g, P, wx - 0.12, 0.4, z0 - 1.05, -1, { R: 0.4, W: 0.3, rimR: 0.22, lugs: 0, N: 20, rimMat: P.grey, lite: true });
        wheel(g, P, wx + 0.12, 0.4, z0 - 1.05, 1, { R: 0.4, W: 0.3, rimR: 0.22, lugs: 0, N: 20, rimMat: P.grey, lite: true });
      }
      bar(g, P.dark, V3(-tx, 0.9, z0 - 0.2), V3(tx, 0.9, z0 - 0.2), 0.12, 0.1, 0.03);
    }
  }

  // ====================================================================== КОМБАЙН
  const HDR_W = [4.5, 4.5, 4.8, 7.2, 7.5, 7.8, 10.0, 10.8, 11.4, 12.0];
  function buildCombine(lv) {
    const g = new T.Group(), gl = [], t = lv <= 3 ? 0 : lv <= 6 ? 1 : 2, tracks = lv >= 8;
    const P = palette({ body: [0x9b241f, 0xa81e19, 0xa5151a][t], rough: [0.46, 0.34, 0.22][t], dark: 0x3a3e44, grey: 0xaeb3b8 });
    const sub = t === 2 ? lv - 7 : (lv - 1) % 3, tankL = [2.6, 3.2, 3.8][t] + 0.1 * sub, tankTop = [4.0, 4.18, 4.34][t] + 0.03 * sub, tankHW = [1.32, 1.4, 1.48][t], tankZ1 = 0.72, tankZ0 = tankZ1 - tankL, tcz = (tankZ0 + tankZ1) / 2, zEnd = tankZ0 - [1.92, 1.77, 1.62][t];
    const fz = 1.55, fR = [0.86, 0.98, 1.1][t], fW = [0.62, 0.74, 0.9][t], fx = [1.37, 1.43, 1.5][t], rzA = zEnd + 0.8, rR = [0.55, 0.6, 0.66][t], rW = [0.38, 0.42, 0.5][t], rx = [1.0, 1.05, 1.1][t];
    const cabT = lv >= 3 ? Math.max(t, 1) : 0, cabW = [1.9, 1.98, 2.06][t];
    tag('lower body');
    put(g, ex([[zEnd, 2.1], [zEnd + 0.4, 1.5], [0.45, 1.4], [0.55, 2.75], [zEnd + 0.15, 2.75], [zEnd, 2.5]], 2.5, { plane: 'zy', r: 0.18, b: 0.03, q: 1 }), P.body, 0, 0, 0);
    put(g, ex([[0.35, 1.34], [2.4, 1.22], [2.64, 1.5], [2.66, 2.46], [0.35, 2.5]], 2.0, { plane: 'zy', r: 0.12, b: 0.03, q: 1 }), P.body, 0, 0, 0);
    for (const s of [-1, 1]) {
      bar(g, P.dark, V3(s * 1.22, 1.5, zEnd + 0.6), V3(s * 1.22, 1.5, 0.3), 0.07, 0.1, 0.02);
      for (let i = 0; i < 3; i++) { const z = zEnd + 1.0 + i * 1.5 - (t ? 0 : 0.15); put(g, rb(0.035, 0.85, 1.1, 0.05, 0), P.body, s * 1.265, 2.05, z); bx(g, P.dark, 0.03, 0.07, 0.16, s * 1.29, 2.05, z + 0.4); }
      decal(g, 'grid', 0.9, 0.16, s * 1.284, 2.62, zEnd + 1.95, s * PI / 2, 0, 1);
    }
    tag('tank');
    { const y0 = 2.62, ys = tankTop - 0.62, tw = tankHW - 0.45;
      put(g, ex([[-1.0, y0], [1.0, y0], [tankHW, y0 + 0.38], [tankHW, ys], [tw, tankTop], [-tw, tankTop], [-tankHW, ys], [-tankHW, y0 + 0.38]], tankL, { r: 0.22, b: 0.06, q: 1 }), P.body, 0, 0, tcz);
      for (const s of [-1, 1]) {
        put(g, rb(0.05, 0.7, tankL - 0.45, 0.02, 0), P.body, s * (tankHW + 0.02), (y0 + 0.4 + ys) / 2, tcz);
        pane(gl, 0.02, 0.2, s * (tankHW + 0.05), (y0 + 0.4 + ys) / 2 + 0.05, tankZ1 - 0.7, 0, 0, 0).scale.z = 0.9 / 0.014;
        for (const k of [0, 1, 2, 3]) bx(g, P.dark, 0.02, 0.27, 0.025, s * (tankHW + 0.05), (y0 + 0.4 + ys) / 2 + 0.05, tankZ1 - 1.15 + k * 0.3);
        decal(g, t >= 1 ? 't1' : 't2', 1.15, 0.29, s * (tankHW + 0.047), tankTop - 0.82, tcz - 0.25, s * PI / 2, 0, 1);
      }
      put(g, rb(2 * tw - 0.35, 0.06, tankL - 0.4, 0.025), P.body, 0, tankTop + 0.02, tcz + 0.05);
      for (let i = 0; i < 3; i++) put(g, rb(2 * tw - 0.4, 0.05, 0.12, 0.02, 0), P.dark, 0, tankTop + 0.07, tankZ0 + 0.55 + i * (tankL - 1.1) / 2);
      put(g, rb(0.46, 0.06, 0.46, 0.04, 0), P.dark, tw - 0.45, tankTop + 0.07, tcz + 0.4);
      railing(g, P, [[-tw + 0.1, tankTop + 0.045, tankZ0 + 0.15], [-tw + 0.1, tankTop + 0.045, tankZ1 - 0.2]], 0.5, 1.0);
    }
    tag('engine');
    { const ez0 = zEnd + 0.12, ez1 = tankZ0 - 0.04, ey = 3.58, ec = (ez0 + ez1) / 2;
      put(g, ex([[ez0, 2.7], [ez1, 2.7], [ez1, ey - 0.05], [ez0 + 0.5, ey], [ez0 - 0.02, 3.1]], 1.9, { plane: 'zy', r: 0.2, b: 0.04, q: 1 }), P.body, 0, 0, 0);
      put(g, rb(1.5, 0.05, ez1 - ez0 - 0.9, 0.02, 0), P.grey, 0, ey + 0.015, ec + 0.35);
      decal(g, 'grid', 1.2, ez1 - ez0 - 1.2, 0, ey + 0.045, ec + 0.35, 0, -PI / 2, 1);
      decal(g, 'grid', 1.5, 0.62, 0, 3.33, ez0 - 0.06, PI, 0.78, 1);
      for (const s of [-1, 1]) { decal(g, 'grid', 0.9, 0.55, s * 0.958, 3.0, ec + 0.2, s * PI / 2, 0, 1); decal(g, 'num', 0.5, 0.25, s * 0.958, 3.33, ez1 - 0.4, s * PI / 2, 0, 1); }
      const exz = ez1 - 0.2, exx = -0.78;
      rod(g, P.steel, V3(exx, ey - 0.05, exz), V3(exx, ey + 0.95, exz), 0.065, 12); rod(g, P.steel, V3(exx, ey + 0.95, exz), V3(exx, ey + 1.12, exz - 0.1), 0.065, 12);
      put(g, new T.CylinderGeometry(0.1, 0.1, 0.05, 12), P.black, exx, ey + 0.08, exz); put(g, new T.CylinderGeometry(0.085, 0.085, 0.03, 12), P.black, exx, ey + 1.13, exz - 0.1, 0.4, 0, 0);
      put(g, lathe([[0, 0], [0.16, 0], [0.18, 0.4], [0.12, 0.6], [0.0, 0.64]], 14), P.dark, 0.45, ey, ez1 - 0.45);
      rod(g, P.dark, V3(0.45, ey + 0.55, ez1 - 0.45), V3(0.2, ey + 0.2, ez1 - 0.05), 0.045, 8);
    }
    tag('rear');
    put(g, ex([[zEnd + 0.1, 2.25], [zEnd - 0.5, 2.0], [zEnd - 0.55, 1.65], [zEnd + 0.1, 1.55]], 1.8, { plane: 'zy', r: 0.1, b: 0.03, q: 0 }), P.body, 0, 0, 0);
    for (const s of [-1, 1]) { put(g, lathe([[0, 0], [0.34, 0.02], [0.37, 0.05], [0, 0.05]], 16), P.steel, s * 0.45, 1.5, zEnd - 0.3, 0.25, 0, 0); lampUnit(g, P, s * 0.88, 2.38, zEnd + 0.0, 0.2, 0.12, 'z-', P.body); lampUnit(g, P, s * 0.88, 2.2, zEnd - 0.01, 0.2, 0.08, 'z-', P.amber); }
    decal(g, 'haz', 1.3, 0.26, 0, 1.8, zEnd - 0.53, PI, 0, 4);
    if (t >= 1) decal(g, 'warn', 0.3, 0.3, 0.6, 2.4, zEnd - 0.0 - 0.004, PI, 0, 1);
    tag('chassis');
    for (const s of [-1, 1]) bar(g, P.dark, V3(s * 0.85, 1.12, zEnd + 0.3), V3(s * 0.85, 1.12, 2.3), 0.16, 0.26, 0.04);
    rod(g, P.dark, V3(-fx + 0.2, fR, fz), V3(fx - 0.2, fR, fz), 0.19, 12);
    bar(g, P.dark, V3(-rx, rR, rzA), V3(rx, rR, rzA), 0.22, 0.2, 0.05);
    for (const s of [-1, 1]) { rod(g, P.steel, V3(s * 0.35, 1.0, rzA + 0.28), V3(s * (rx - 0.15), rR + 0.05, rzA + 0.2), 0.03, 6); put(g, new T.CylinderGeometry(0.06, 0.06, 0.5, 8), P.dark, s * 0.45, 1.0, rzA + 0.26, 0, 0, PI / 2); }
    tag('wheels');
    for (const s of [-1, 1]) {
      if (tracks) trackUnit(g, P, s * fx, s, [[fz - 1.05, 0.53, 0.46], [fz + 1.2, 0.57, 0.5], [fz - 0.38, 1.43, 0.6]], 0.78);
      else wheel(g, P, s * fx, fR, fz, s, { R: fR, W: fW, rimR: fR * 0.62, lugs: [18, 20, 22][t], lugH: fR * 0.055, N: 36, rimMat: P.body });
      wheel(g, P, s * rx, rR, rzA, s, { R: rR, W: rW, rimR: rR * 0.58, lugs: 14, lugH: rR * 0.04, N: 26, chev: 18, rimMat: P.dark, bolts: 5 });
      arcPlate(g, P.body, s * rx, rR, rzA, rR + 0.04, rR + 0.09, 0.12, PI * 0.88, rW + 0.1, 10);
    }
    tag('cab');
    cab(g, gl, P, { cz: 1.74, y0: 2.5, w: cabW, d: 1.76, h: [1.62, 1.66, 1.7][t], sill: 0.3, tilt: 0.16, tier: cabT, beacon: lv >= 3, gps: lv >= 6, lowerMat: P.body, mirror: 1.15 });
    tag('feeder');
    put(g, ex([[2.3, 2.05], [3.98, 1.5], [3.98, 0.6], [2.3, 1.2]], 1.5, { plane: 'zy', r: 0.12, b: 0.04, q: 1 }), P.body, 0, 0, 0);
    put(g, rb(0.9, 0.05, 1.1, 0.02, 0), P.dark, 0, 1.82, 3.15, -0.34, 0, 0);
    for (const s of [-1, 1]) decal(g, 'grid', 0.7, 0.3, s * 0.762, 1.3, 3.0, s * PI / 2, -0.33, 1);
    put(g, rb(1.62, 0.12, 0.3, 0.04, 0), P.dark, 0, 1.5, 3.9, -0.34, 0, 0);
    for (const s of [-1, 1]) { rod(g, P.dark, V3(s * 0.6, 1.0, 2.2), V3(s * 0.6, 1.12, 2.85), 0.075, 10); rod(g, P.steel, V3(s * 0.6, 1.12, 2.85), V3(s * 0.6, 1.2, 3.3), 0.04, 8); }
    hose(g, P.black, [[0.5, 1.25, 2.45], [0.5, 0.95, 3.0], [0.55, 0.75, 3.6], [0.45, 0.75, 3.95]], 0.025, 12, 5);
    hose(g, P.black, [[-0.5, 1.25, 2.45], [-0.5, 0.95, 3.0], [-0.55, 0.75, 3.6], [-0.45, 0.75, 3.95]], 0.025, 12, 5);
    tag('auger');
    { const xa = tankHW + 0.2, za = tankZ0 + 0.12, yT = tankTop + 0.02, zF = tankZ1 + [-0.15, 1.5, 2.0][t];
      rod(g, P.body, V3(xa, 2.75, za), V3(xa, yT, za), 0.21, 16); put(g, new T.SphereGeometry(0.235, 14, 10), P.body, xa, yT, za);
      rod(g, P.body, V3(xa, yT, za), V3(xa, yT, zF), 0.2, 16);
      for (const zz of [za + 0.5, (za + zF) / 2, zF - 0.4]) put(g, new T.CylinderGeometry(0.225, 0.225, 0.06, 16), P.grey, xa, yT, zz, PI / 2, 0, 0);
      rod(g, P.dark, V3(xa, yT, zF), V3(xa, yT - 0.2, zF + 0.32), 0.19, 14, 0.12); put(g, new T.CylinderGeometry(0.14, 0.16, 0.04, 14), P.steel, xa, yT - 0.2, zF + 0.32, 0.5, 0, 0);
      rod(g, P.dark, V3(xa - 0.1, 3.0, za + 0.05), V3(xa - 0.05, yT - 0.12, za + 0.8), 0.04, 8); rod(g, P.steel, V3(xa - 0.05, yT - 0.12, za + 0.8), V3(xa, yT - 0.05, za + 1.1), 0.026, 6);
      if (t >= 1) put(g, new T.CylinderGeometry(0.24, 0.24, 0.18, 14), P.dark, xa, 2.7, za);
      if (t >= 2) put(g, new T.SphereGeometry(0.22, 12, 8), P.grey, xa, yT, (za + zF) / 2);
    }
    tag('ladder');
    { const yp = 2.55; ladder(g, P, V3(tankHW + 0.3, 0.3, 0.15), V3(tankHW + 0.18, yp, 0.62), 0.46, 9, false);
      put(g, rb(0.62, 0.05, 1.8, 0.02, 0), P.dark, cabW / 2 + 0.28 + 0.06, yp, 1.72);
      bar(g, P.dark, V3(cabW / 2 + 0.05, 2.05, 1.2), V3(cabW / 2 + 0.55, 2.5, 1.2), 0.06, 0.08, 0.02); bar(g, P.dark, V3(cabW / 2 + 0.05, 2.05, 2.3), V3(cabW / 2 + 0.55, 2.5, 2.3), 0.06, 0.08, 0.02);
      railing(g, P, [[cabW / 2 + 0.6, yp, 0.6], [cabW / 2 + 0.6, yp, 2.6], [cabW / 2 + 0.2, yp, 2.65]], 0.9, 0.65);
      put(g, rb(0.5, 0.05, 0.4, 0.02, 0), P.dark, -(cabW / 2 + 0.2), 2.5, 2.4);
    }
    tag('lights');
    for (const s of [-1, 1]) { lampUnit(g, P, s * 0.78, 2.12, 2.66, 0.28, 0.14, 'z+'); lampUnit(g, P, s * 0.48, 2.12, 2.66, 0.28, 0.14, 'z+'); lampUnit(g, P, s * 0.9, 1.78, 2.66, 0.18, 0.1, 'z+', P.amber); }
    if (t >= 1) for (const s of [-1, 1]) lampUnit(g, P, s * 0.45, 1.78, 2.665, 0.22, 0.1, 'z+');
    tag('decals');
    for (const s of [-1, 1]) {
      if (lv >= 2) decal(g, 'band1', 2.4, 0.2, s * 1.285, 2.3, -1.3, s * PI / 2, 0, 1);
      decal(g, 'logo', 0.34, 0.34, s * 1.012, 2.0, 2.05, s * PI / 2, 0, 1);
      if (t >= 2) decal(g, 'band2', 2.8, 0.14, s * 1.285, 1.82, -1.0, s * PI / 2, 0, 1);
    }
    header(g, P, HDR_W[lv - 1], 4.0, t, lv);
    return finish(g, gl);
  }
  reg('vehicle', 'combine', (opts) => buildCombine(lvOf(opts)));

  // @@COMBINE@@
  // ====================================================================== САМОХОДНЫЙ ОПРЫСКИВАТЕЛЬ («waterer»)
  let _noz = null;
  function nozGeo() {
    if (_noz) return _noz;
    const a = new T.CylinderGeometry(0.02, 0.016, 0.16, 5, 1, false), c = new T.ConeGeometry(0.03, 0.08, 6, 1, true); a.translate(0, -0.08, 0); c.rotateX(PI); c.translate(0, -0.2, 0);
    return (_noz = mergeGeos([a, c]));
  }
  /** Ферма штанги (треугольное сечение) от x0 до x1 с форсунками; y0,y1 — высота нижнего пояса на концах. */
  function truss(g, P, x0, x1, y0, y1, zb, depth, o) {
    o = o || {}; const len = Math.abs(x1 - x0), n = Math.max(2, Math.round(len / 0.62)), sg = Math.sign(x1 - x0) || 1, hz = 0.2;
    const pt = (k, c) => { const u = k / n, x = x0 + (x1 - x0) * u, yb = y0 + (y1 - y0) * u; return c === 't' ? V3(x, yb + depth, zb) : c === 'f' ? V3(x, yb, zb + hz) : V3(x, yb, zb - hz); };
    rod(g, o.chord || P.body, pt(0, 't'), pt(n, 't'), 0.034, 6); rod(g, o.chord || P.body, pt(0, 'f'), pt(n, 'f'), 0.03, 6); rod(g, o.chord || P.body, pt(0, 'b'), pt(n, 'b'), 0.03, 6);
    for (let k = 0; k < n; k++) {
      const e = k % 2 === 0;
      rod(g, P.dark, e ? pt(k, 'f') : pt(k, 't'), e ? pt(k + 1, 't') : pt(k + 1, 'f'), 0.014, 4); rod(g, P.dark, e ? pt(k, 'b') : pt(k, 't'), e ? pt(k + 1, 't') : pt(k + 1, 'b'), 0.014, 4);
      if (k % 2 === 0) rod(g, P.dark, pt(k, 'f'), pt(k, 'b'), 0.012, 4);
    }
    rod(g, P.dark, pt(n, 'f'), pt(n, 'b'), 0.012, 4);
    // линия распыла и форсунки
    const yb = (u) => y0 + (y1 - y0) * u, pz = zb + hz + 0.03;
    rod(g, P.steel, V3(x0, y0 - 0.05, pz), V3(x1, y1 - 0.05, pz), 0.017, 5);
    const nn = Math.max(2, Math.round(len / 0.5)), ng = nozGeo();
    for (let i = 0; i < nn; i++) { const u = (i + 0.5) / nn; put(g, ng, i % 2 ? P.amber : P.steel, x0 + (x1 - x0) * u, yb(u) - 0.05, pz); }
  }
  function sprayBoom(g, P, half, zb, t, lv) {
    const ybot = 1.28, depth = 0.55, inner = 1.1, hinge = Math.max(3.2, half * 0.42), hinge2 = half - 1.3 - t * 0.2, lift = 0.34;
    tag('boom');
    // подвеска штанги: центральная рама на двух стойках, параллелограмм, гидроцилиндры
    for (const s of [-1, 1]) {
      bar(g, P.dark, V3(s * 0.62, 0.95, zb - 0.1), V3(s * 0.62, 3.05, zb - 0.1), 0.13, 0.13, 0.03);
      bar(g, P.dark, V3(s * 0.62, 1.1, zb - 0.1), V3(s * 0.5, 1.45, zb + 0.18), 0.07, 0.07, 0.02);
      rod(g, P.dark, V3(s * 0.62, 2.2, zb - 0.1), V3(s * 0.9, ybot + depth, zb + 0.0), 0.05, 8); rod(g, P.steel, V3(s * 0.9, ybot + depth, zb), V3(s * 1.05, ybot + depth - 0.15, zb), 0.03, 6);
    }
    bar(g, P.dark, V3(-0.62, 3.05, zb - 0.1), V3(0.62, 3.05, zb - 0.1), 0.12, 0.1, 0.03); bar(g, P.dark, V3(-0.62, 1.1, zb - 0.1), V3(0.62, 1.1, zb - 0.1), 0.12, 0.1, 0.03); bar(g, P.dark, V3(-0.62, 2.0, zb - 0.1), V3(0.62, 2.0, zb - 0.1), 0.1, 0.08, 0.03);
    put(g, rb(1.5, 0.3, 0.3, 0.08, 0), P.body, 0, ybot + depth * 0.5 + 0.0, zb);
    truss(g, P, -inner - 0.1, inner + 0.1, ybot, ybot, zb, depth, { chord: P.body });
    for (const s of [-1, 1]) {
      truss(g, P, s * inner, s * hinge, ybot, ybot, zb, depth, { chord: P.body });
      truss(g, P, s * hinge, s * hinge2, ybot, ybot, zb, depth * 0.9, { chord: P.body });
      truss(g, P, s * hinge2, s * (half - 0.1), ybot, ybot + lift, zb, depth * 0.75, { chord: P.body });
      for (const xh of [hinge, hinge2]) { put(g, rb(0.12, depth + 0.1, 0.34, 0.03, 0), P.dark, s * xh, ybot + depth / 2 - 0.02, zb); rod(g, P.steel, V3(s * xh, ybot + depth + 0.1, zb - 0.13), V3(s * xh, ybot - 0.08, zb - 0.13), 0.03, 6); }
      put(g, rb(0.1, 0.5, 0.4, 0.04, 0), P.dark, s * (half - 0.04), ybot + lift + 0.1, zb);
      // тросовые растяжки и гидроцилиндры складывания
      rod(g, P.black, V3(s * 0.62, 3.0, zb - 0.1), V3(s * hinge, ybot + depth, zb), 0.008, 4); if (t >= 1) rod(g, P.black, V3(s * 0.62, 3.0, zb - 0.1), V3(s * hinge2, ybot + depth * 0.9, zb), 0.008, 4);
      rod(g, P.dark, V3(s * (hinge - 0.4), ybot + depth + 0.03, zb - 0.0), V3(s * (hinge + 0.15), ybot + depth + 0.25, zb - 0.0), 0.04, 6);
      // шланги вдоль штанги
      hose(g, P.black, [[s * 0.9, 1.2, zb + 0.25], [s * 1.3, 1.0, zb + 0.25], [s * 1.7, 1.17, zb + 0.28], [s * 2.2, 1.22, zb + 0.28]], 0.02, 10, 5);
    }
  }
  function buildSprayer(lv) {
    const g = new T.Group(), gl = [], t = lv <= 3 ? 0 : lv <= 6 ? 1 : 2;
    const half = 7 + (lv - 1) * 5 / 9;
    const P = palette({ body: t < 2 ? [0x1c5fae, 0x1a55a2][t] : 0xdfae0f, accent: 0xeef0f2, rough: [0.44, 0.33, 0.22][t], dark: t < 2 ? 0x353a42 : 0x2b2e33, grey: 0xc9ced2, metallic: 0.3 });
    const R = [0.85, 0.88, 0.9, 0.95, 0.98, 1.0, 1.03, 1.06, 1.09, 1.12][lv - 1], W = 0.36 + 0.012 * (lv - 1), wx = [1.28, 1.3, 1.32, 1.36, 1.38, 1.4, 1.42, 1.45, 1.47, 1.5][lv - 1];
    const fz = 2.45, rz = [-1.9, -2.2, -2.5][t], sub = t === 2 ? lv - 7 : (lv - 1) % 3, tr = [0.88, 1.0, 1.12][t] + 0.025 * sub, tlen = [2.6, 3.2, 3.8][t] + 0.12 * sub, tz1 = 0.25, tcz = tz1 - tlen / 2, tyc = 1.95 + tr, zEnd = tz1 - tlen - 0.45, zb = zEnd - 0.1;
    // --- колёса на высоких ногах
    tag('wheels');
    for (const s of [-1, 1]) for (const z of [fz, rz]) {
      wheel(g, P, s * wx, R, z, s, { R, W, rimR: R * 0.66, lugs: 18, lugH: R * 0.05, N: 34, chev: 28, rimMat: t >= 2 ? P.body : P.grey, bolts: 6 });
      tag('legs');
      bar(g, P.dark, V3(s * (wx - W / 2 - 0.1), R + 0.1, z), V3(s * (wx - W / 2 - 0.1), 1.7, z), 0.17, 0.3, 0.05);
      put(g, new T.CylinderGeometry(0.2, 0.2, 0.34, 14), P.dark, s * (wx - W / 2 - 0.15), R, z, 0, 0, PI / 2);
      bar(g, P.dark, V3(s * 0.55, 1.45, z), V3(s * (wx - W / 2 - 0.1), 1.45, z), 0.2, 0.24, 0.05);
      rod(g, P.steel, V3(s * 0.7, 1.3, z + 0.18), V3(s * (wx - W / 2 - 0.12), R + 0.5, z + 0.12), 0.03, 6); rod(g, P.dark, V3(s * 0.7, 1.3, z - 0.18), V3(s * (wx - W / 2 - 0.12), R + 0.5, z - 0.12), 0.04, 6);
      tag('wheels');
    }
    // --- рама, мосты, нижние агрегаты
    tag('frame');
    for (const s of [-1, 1]) bar(g, P.dark, V3(s * 0.62, 1.52, zEnd), V3(s * 0.62, 1.52, 3.55), 0.22, 0.3, 0.05);
    for (const z of [zEnd + 0.1, tz1 - tlen * 0.5, tz1 - 0.1, 1.2, 2.1, 3.3]) bar(g, P.dark, V3(-0.7, 1.55, z), V3(0.7, 1.55, z), 0.2, 0.2, 0.04);
    put(g, rb(1.5, 0.55, 1.1, 0.1, 0), P.dark, 0, 1.2, 3.1);                       // топливный бак / передний модуль
    put(g, rb(0.9, 0.4, 0.8, 0.08, 0), P.dark, -0.2, 1.25, zEnd + 0.7);              // насос
    put(g, new T.CylinderGeometry(0.17, 0.17, 0.45, 14), P.accent, 0.35, 1.2, zEnd + 0.7, 0, 0, PI / 2);
    hose(g, P.black, [[0.2, 1.2, zEnd + 0.5], [0.3, 0.95, zEnd - 0.1], [0.1, 1.2, zb + 0.1]], 0.04, 12, 6);
    hose(g, P.black, [[-0.4, 1.3, zEnd + 0.5], [-0.5, 1.0, zEnd - 0.1], [-0.3, 1.25, zb + 0.1]], 0.035, 12, 6);
    tag('hood');
    put(g, ex([[0.3, 1.7], [1.95, 1.7], [1.95, 2.45], [1.4, 2.6], [0.3, 2.5]], 1.5, { plane: 'zy', r: 0.16, b: 0.03, q: 1 }), P.body, 0, 0, 0);
    for (const s of [-1, 1]) { decal(g, 'grid', 1.0, 0.45, s * 0.763, 2.12, 1.1, s * PI / 2, 0, 1); decal(g, 'num', 0.5, 0.25, s * 0.763, 2.42, 1.25, s * PI / 2, 0, 1); }
    decal(g, 'grid', 0.9, 0.5, 0, 2.58, 1.0, 0, -PI / 2, 1);
    // --- кабина
    tag('cab');
    put(g, rb(1.7, 0.5, 1.5, 0.1), P.body, 0, 1.78, 3.0);
    cab(g, gl, P, { cz: 2.95, y0: 2.03, w: [1.72, 1.8, 1.88][t], d: 1.72, h: [1.62, 1.66, 1.7][t], sill: 0.28, tilt: 0.2, tier: t, beacon: lv >= 3, gps: lv >= 6, lowerMat: P.body, mirror: 1.1 });
    tag('lights');
    for (const s of [-1, 1]) { lampUnit(g, P, s * 0.6, 1.9, 3.77, 0.26, 0.13, 'z+'); lampUnit(g, P, s * 0.92, 1.9, 3.75, 0.14, 0.1, 'z+', P.amber); }
    if (t >= 1) for (const s of [-1, 1]) lampUnit(g, P, s * 0.3, 1.9, 3.77, 0.2, 0.1, 'z+');
    // --- бак
    tag('tank');
    { const L = tlen / 2, k = 0.42, prof = [[0, -L]]; for (let a = 0; a <= 9; a++) { const th = a / 9 * PI / 2; prof.push([tr * Math.sin(th), -L + k * (1 - Math.cos(th))]); } prof.push([tr, L - k]); for (let a = 1; a <= 9; a++) { const th = a / 9 * PI / 2; prof.push([tr * Math.cos(th), L - k + k * Math.sin(th)]); }
      prof[prof.length - 1] = [0, L];
      put(g, lathe(prof, 28, 'z'), P.accent, 0, tyc, tcz);
      for (const zz of [-L * 0.62, 0, L * 0.62]) put(g, new T.CylinderGeometry(tr + 0.02, tr + 0.02, 0.13, 28), P.dark, 0, tyc, tcz + zz, PI / 2, 0, 0);
      for (const zz of [-L * 0.62, L * 0.62]) { bar(g, P.dark, V3(-tr * 0.8, 1.65, tcz + zz), V3(tr * 0.8, 1.65, tcz + zz), 0.2, 0.2, 0.04); }
      // окно уровня: прозрачная вставка и синяя жидкость
      for (const s of [-1, 1]) {
        const a0 = (s > 0 ? PI / 2 : -PI / 2) - 0.34, lw = 0.68;
        put(g, (() => { const c = new T.CylinderGeometry(tr + 0.006, tr + 0.006, 1.0, 14, 1, true, a0, lw); c.rotateX(PI / 2); return c; })(), P.body, 0, tyc, tcz - 0.35);
        const pg = new T.CylinderGeometry(tr + 0.016, tr + 0.016, 1.04, 14, 1, true, a0 - 0.02, lw + 0.04); pg.rotateX(PI / 2); const pm = mk(pg, C.glassM(0x9fb8c6), 0, tyc, tcz - 0.35); pm.castShadow = false; gl.push(pm);
        for (let i = 0; i < 6; i++) { const yy = tyc - 0.34 + i * 0.136, xx = Math.sqrt(Math.max(0.01, tr * tr - (yy - tyc) * (yy - tyc))); bx(g, P.dark, 0.012, 0.012, 0.14, s * (xx + 0.012), yy, tcz - 0.7); }
        decal(g, t >= 2 ? 't3' : 't4', 1.1, 0.28, s * (tr + 0.003), tyc + 0.42, tcz + 0.6, s * PI / 2, 0, 1);
      }
      // люк с крышкой, фильтр заправки, поручни по верху бака
      put(g, new T.CylinderGeometry(0.28, 0.3, 0.1, 18), P.dark, 0, tyc + tr + 0.04, tcz + 0.4); put(g, new T.SphereGeometry(0.2, 12, 6, 0, TAU, 0, PI / 2), P.black, 0, tyc + tr + 0.08, tcz + 0.4);
      put(g, new T.CylinderGeometry(0.1, 0.1, 0.12, 10), P.amber, 0, tyc + tr + 0.03, tcz - 0.8);
      railing(g, P, [[-tr * 0.55, tyc + tr * 0.84, tz1 - 0.25], [-tr * 0.55, tyc + tr * 0.84, tz1 - tlen + 0.3]], 0.42, 0.9);
      put(g, rb(0.6, 0.05, tlen - 0.6, 0.02, 0), P.dark, 0.0, tyc + tr * 0.99, tcz);
      // лесенка слева и площадка
      ladder(g, P, V3(tr + 0.3, 0.3, tz1 - 0.35), V3(tr + 0.12, 1.85, tz1 - 0.35), 0.5, 7, true);
      put(g, rb(0.55, 0.05, 0.7, 0.02, 0), P.dark, tr + 0.1, 1.9, tz1 - 0.4); railing(g, P, [[tr + 0.38, 1.9, tz1 - 0.05], [tr + 0.38, 1.9, tz1 - 0.75]], 0.8, 0.6);
    }
    // --- дополнительные баки по бортам (топ-комплектации)
    if (t >= 2) { tag('extra tanks');
      for (const s of [-1, 1]) {
        const pr = [[0, -1.5]]; for (let a = 0; a <= 6; a++) { const th = a / 6 * PI / 2; pr.push([0.4 * Math.sin(th), -1.5 + 0.25 * (1 - Math.cos(th))]); } pr.push([0.4, 1.25]); for (let a = 1; a <= 6; a++) { const th = a / 6 * PI / 2; pr.push([0.4 * Math.cos(th), 1.25 + 0.25 * Math.sin(th)]); } pr[pr.length - 1] = [0, 1.5];
        put(g, lathe(pr, 20, 'z'), P.body, s * 1.0, 1.15, 0.1 - 0.0);
        for (const zz of [-0.9, 0.2, 1.1]) put(g, new T.CylinderGeometry(0.42, 0.42, 0.1, 20), P.dark, s * 1.0, 1.15, 0.1 + zz, PI / 2, 0, 0);
        decal(g, 'band3', 2.0, 0.1, s * 1.403, 1.2, 0.0, s * PI / 2, 0, 1);
      }
    }
    // --- штанга
    sprayBoom(g, P, half, zb, t, lv);
    tag('rear lights');
    for (const s of [-1, 1]) { lampUnit(g, P, s * 0.62, 1.4, zEnd - 0.12, 0.2, 0.1, 'z-', P.body); lampUnit(g, P, s * 0.62, 1.68, zEnd - 0.12, 0.2, 0.08, 'z-', P.amber); }
    decal(g, 'haz', 1.2, 0.22, 0, 1.55, zEnd - 0.14, PI, 0, 4);
    if (lv >= 5) decal(g, 'warn', 0.3, 0.3, 0.6, 1.9, zEnd - 0.0, PI, 0, 1);
    return finish(g, gl);
  }
  reg('vehicle', 'waterer', (opts) => buildSprayer(lvOf(opts)));

  // @@SPRAYER@@
  // ====================================================================== прицепы: общие узлы
  /** Дешёвый брус (12 треугольников) между двумя точками. */
  function bxbar(g, mat, a, b, w, h, up) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length(); if (L < 1e-5) return null;
    const m = mk(_bxg, mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); m.scale.set(w, h, L); m.quaternion.copy(quatDir(d.normalize(), up)); g.add(m); return m;
  }
  /** Точки скруглённого прямоугольника (по часовой, если смотреть сверху): центр (0,zc), полуширина hw, полуглубина hd, радиус r. */
  function rrPts(hw, hd, zc, r, nc) {
    r = Math.min(r, hw - 0.01, hd - 0.01); const out = [];
    const cs = [[hw - r, zc - hd + r, -PI / 2], [hw - r, zc + hd - r, 0], [-hw + r, zc + hd - r, PI / 2], [-hw + r, zc - hd + r, PI]];
    for (const [cx, cz, a0] of cs) for (let i = 0; i <= nc; i++) { const a = a0 + (PI / 2) * (i / nc); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    return out;
  }
  /** Лофт по скруглённым кольцам [{y,hw,hd,zc,r}] — бункер/ванна с гладкими нормалями; inward — обратный порядок граней (внутренняя стенка). */
  function loftRR(rings, nc, inward) {
    const per = 4 * (nc + 1), pos = [], idx = [];
    for (const rg of rings) for (const p of rrPts(rg.hw, rg.hd, rg.zc, rg.r, nc)) pos.push(p[0], rg.y, p[1]);
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < per; i++) {
      const i2 = (i + 1) % per, a = k * per + i, b = k * per + i2, c = (k + 1) * per + i, d = (k + 1) * per + i2;
      if (inward) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // проверка направления: нормаль боковой точки должна смотреть наружу (inward — внутрь)
    const n = g.attributes.normal, p0 = g.attributes.position; let i0 = 0; const rg0 = rings[0];
    const outx = p0.getX(i0) - 0, dot = n.getX(i0) * outx + n.getZ(i0) * (p0.getZ(i0) - rg0.zc);
    if ((dot < 0) !== !!inward) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }
  let _woodM = null, _decksM = {}, _sackM = null;
  function woodMat() {
    if (_woodM) return _woodM;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d'), r = lcg(77); c.fillStyle = '#b08a5a'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6; i++) { const x = i * 256 / 6, k = 150 + Math.floor(r() * 40); c.fillStyle = `rgb(${k + 20},${k - 10},${k - 55})`; c.fillRect(x + 1, 0, 256 / 6 - 2, 256);
      for (let j = 0; j < 14; j++) { c.strokeStyle = `rgba(70,45,20,${0.12 + r() * 0.2})`; c.lineWidth = 1; c.beginPath(); const xx = x + 4 + r() * (256 / 6 - 8); c.moveTo(xx, 0); c.bezierCurveTo(xx + (r() - 0.5) * 6, 80, xx + (r() - 0.5) * 6, 160, xx + (r() - 0.5) * 3, 256); c.stroke(); }
      c.fillStyle = 'rgba(40,25,10,0.8)'; c.fillRect(x, 0, 2, 256); if (r() < 0.6) { c.fillStyle = 'rgba(60,40,20,0.5)'; c.beginPath(); c.ellipse(x + 20, r() * 256, 4, 9, 0, 0, TAU); c.fill(); } }
    for (let j = 0; j < 4; j++) { c.fillStyle = 'rgba(25,20,15,0.65)'; c.fillRect(0, j * 64 + 30, 256, 2); for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(30,30,30,0.9)'; c.fillRect(i * 43 + 8, j * 64 + 28, 3, 3); } }
    return (_woodM = new T.MeshStandardMaterial({ map: canvasTex(cv, true), roughness: 0.8, metalness: 0.0, envMapIntensity: 0.3 }));
  }
  /** Коробка с текстурой дерева: повтор (rx, ry) по граням. */
  function woodBox(g, w, h, d, x, y, z, rx, ry) {
    const geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (rx || 1), uv.getY(i) * (ry || 1));
    return put(g, geo, woodMat(), x, y, z);
  }
  let _grainM = null;
  function grainMat() {
    if (_grainM) return _grainM;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), r = lcg(5); c.fillStyle = '#a98334'; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { const k = 120 + Math.floor(r() * 90); c.fillStyle = `rgba(${k + 30},${k - 10},${k - 80},${0.35 + r() * 0.4})`; c.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 1.5); }
    return (_grainM = new T.MeshStandardMaterial({ map: canvasTex(cv, true), roughness: 1, metalness: 0, envMapIntensity: 0.05, color: 0xd9c9a4 }));
  }
  function sackMat() {
    if (_sackM) return _sackM;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), r = lcg(41); c.fillStyle = '#cdbb92'; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = i * 64, y = j * 64, gr = c.createRadialGradient(x + 32, y + 32, 6, x + 32, y + 32, 44); gr.addColorStop(0, '#e6d8b4'); gr.addColorStop(1, '#a89468'); c.fillStyle = gr; c.fillRect(x + 1, y + 1, 62, 62);
      c.strokeStyle = 'rgba(70,55,30,0.55)'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, 62, 62);
      for (let k = 0; k < 18; k++) { c.strokeStyle = `rgba(110,90,55,${0.1 + r() * 0.15})`; c.lineWidth = 1; const yy = y + 4 + r() * 56; c.beginPath(); c.moveTo(x + 3, yy); c.lineTo(x + 61, yy + (r() - 0.5) * 3); c.stroke(); }
      c.fillStyle = 'rgba(40,40,40,0.65)'; for (let k = 0; k < 9; k++) c.fillRect(x + 8 + k * 6, y + 4, 3, 1.5);
      c.fillStyle = 'rgba(180,40,30,0.6)'; c.fillRect(x + 18, y + 24, 28, 7); c.fillStyle = 'rgba(30,60,120,0.55)'; c.fillRect(x + 18, y + 34, 28, 4);
    }
    return (_sackM = new T.MeshStandardMaterial({ map: canvasTex(cv, true), roughness: 0.95, metalness: 0, envMapIntensity: 0.15 }));
  }
  /** Слой мешков 2×2 на поддоне (один брусок с текстурой). */
  function sackLayerGeo() {
    const g = new T.BoxGeometry(1.18, 0.17, 0.78), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) if (f !== 2 && f !== 3) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setY(k, uv.getY(k) * 0.5); }
    return g;
  }
  function wrapMat(col) { return C.pmat(col || 0xdfe9d6, { metalness: 0.1, roughness: 0.28, envMapIntensity: 0.7 }); }

  // ====================================================================== ЗЕРНОВОЙ ПРИЦЕП (trailer/grain)
  function buildGrain(lv, variant, loaded) {
    const g = new T.Group(), gl = [], k = (lv - 1) / 9, t = lv <= 3 ? 0 : lv <= 6 ? 1 : 2, blue = variant === 1;
    const P = palette({ body: blue ? [0x244f9a, 0x1f4b97, 0x1a4392][t] : [0x2f7a3c, 0x2a7336, 0x206a30][t], accent: blue ? 0xeceff1 : 0xe2b71b, rough: [0.46, 0.34, 0.22][t], dark: 0x30363c, grey: 0xc9ced1, metallic: 0.3 });
    const Lb = lerp(4.4, 7.6, k), Ht = lerp(2.5, 3.3, k), yb = lerp(0.98, 1.1, k), hb = lerp(0.78, 0.95, k), ht = lerp(1.25, 1.5, k);
    const R = lerp(0.62, 0.78, k), Wd = lerp(0.46, 0.64, k), hwAt = (y) => hb + (ht - hb) * clamp((y - yb) / (Ht - yb), 0, 1);
    const wx = hwAt(2 * R + 0.04) + Wd / 2 + 0.04, za = -Lb * 0.16 + 0.68, zb = za - 1.36, zf0 = Lb / 2 - 1.0, zr0 = -Lb / 2 + 0.55;
    tag('wheels');
    for (const s of [-1, 1]) for (const z of [za, zb]) {
      wheel(g, P, s * wx, R, z, s, { R, W: Wd, rimR: R * 0.58, lugs: 14, lugH: R * 0.045, N: 28, chev: 24, rimMat: P.accent, bolts: 6 });
      tag('fenders'); }
    for (const s of [-1, 1]) { arcPlate(g, P.body, s * wx, R, (za + zb) / 2 + 0.0, R + 0.05, R + 0.1, 0.05, PI - 0.05, Wd + 0.12, 4); }
    tag('chassis');
    for (const s of [-1, 1]) bar(g, P.dark, V3(s * 0.55, 0.86, -Lb / 2 + 0.3), V3(s * 0.55, 0.86, zf0 + 0.2), 0.2, 0.28, 0.04);
    for (const z of [za, zb]) { rod(g, P.dark, V3(-wx + 0.2, R, z), V3(wx - 0.2, R, z), 0.1, 12); }
    for (const s of [-1, 1]) { bar(g, P.dark, V3(s * (wx - Wd / 2 - 0.12), R + 0.25, za), V3(s * (wx - Wd / 2 - 0.12), R + 0.25, zb), 0.12, 0.2, 0.03); rod(g, P.steel, V3(s * (wx - Wd / 2 - 0.1), R + 0.1, za - 0.0), V3(s * (wx - Wd / 2 - 0.1), 0.95, za + 0.0), 0.04, 6); }
    for (const z of [-Lb / 2 + 0.3, (za + zb) / 2, zf0 + 0.1]) bar(g, P.dark, V3(-0.62, 0.9, z), V3(0.62, 0.9, z), 0.2, 0.2, 0.03);
    // дышло: А-образная рама с проушиной, домкрат
    tag('drawbar');
    for (const s of [-1, 1]) bar(g, P.dark, V3(s * 0.55, 0.88, zf0 + 0.1), V3(s * 0.08, 0.72, zf0 + 2.1), 0.14, 0.2, 0.03);
    rod(g, P.dark, V3(0, 0.72, zf0 + 2.0), V3(0, 0.72, zf0 + 2.35), 0.08, 10); put(g, new T.TorusGeometry(0.115, 0.03, 8, 16), P.steel, 0, 0.74, zf0 + 2.43, PI / 2, 0, 0);
    bar(g, P.dark, V3(-0.4, 0.82, zf0 + 1.0), V3(0.4, 0.82, zf0 + 1.0), 0.1, 0.1, 0.02);
    rod(g, P.steel, V3(0.38, 0.86, zf0 + 1.15), V3(0.38, 0.25, zf0 + 1.15), 0.05, 8); put(g, new T.CylinderGeometry(0.1, 0.1, 0.03, 12), P.dark, 0.38, 0.2, zf0 + 1.15); rod(g, P.dark, V3(0.38, 0.62, zf0 + 1.15), V3(0.58, 0.62, zf0 + 1.15), 0.015, 5);
    hose(g, P.black, [[-0.2, 1.0, zf0 + 0.25], [-0.2, 0.7, zf0 + 1.0], [-0.14, 0.62, zf0 + 1.6], [-0.06, 0.74, zf0 + 2.2]], 0.025, 14, 6);
    hose(g, P.black, [[0.1, 1.0, zf0 + 0.25], [0.12, 0.66, zf0 + 1.0], [0.12, 0.6, zf0 + 1.7], [0.06, 0.72, zf0 + 2.25]], 0.022, 14, 6);
    // --- бункер
    tag('hopper');
    const ringsOut = [{ y: yb, hw: hb, hd: (zf0 - zr0) / 2, zc: (zf0 + zr0) / 2, r: 0.22 }, { y: (yb + Ht) / 2, hw: (hb + ht) / 2, hd: (Lb / 2 - (-Lb / 2) + (zf0 - zr0)) / 4, zc: (Lb / 2 - Lb / 2 + (zf0 + zr0) / 2) / 2, r: 0.3 }, { y: Ht, hw: ht, hd: Lb / 2, zc: 0, r: 0.42 }];
    put(g, loftRR(ringsOut, 5), P.body, 0, 0, 0);
    put(g, loftRR([{ y: yb + 0.04, hw: hb - 0.05, hd: (zf0 - zr0) / 2 - 0.05, zc: (zf0 + zr0) / 2, r: 0.2 }, { y: Ht + 0.02, hw: ht - 0.05, hd: Lb / 2 - 0.05, zc: 0, r: 0.4 }], 5, true), P.dark, 0, 0, 0);
    put(g, rb(2 * hb - 0.3, 0.1, zf0 - zr0 - 0.3, 0.04, 0), P.dark, 0, yb + 0.02, (zf0 + zr0) / 2);
    // верхний борт — труба по периметру
    { const pts = rrPts(ht + 0.02, Lb / 2 + 0.02, 0, 0.42, 4).map((p) => V3(p[0], Ht + 0.03, p[1])); const cu = new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.3); put(g, new T.TubeGeometry(cu, pts.length * 2, 0.05, 6, true), P.dark, 0, 0, 0); }
    // ребра жёсткости по бортам, переду и сзади
    { const wallX = (y) => hwAt(y) + 0.035, nr = Math.max(3, Math.round(Lb / 1.0));
      for (const s of [-1, 1]) for (let i = 0; i < nr; i++) { const z = -Lb / 2 + 0.7 + (Lb - 1.4) * i / (nr - 1); const zz = clamp(z, zr0 + 0.2, Lb / 2 - 0.2); bxbar(g, P.body, V3(s * wallX(yb + 0.15), yb + 0.15, zz), V3(s * wallX(Ht - 0.1), Ht - 0.1, z), 0.07, 0.05, V3(0, 0, 1)); }
      for (const s of [-1, 1]) bxbar(g, P.dark, V3(s * (wallX(yb + 0.7) + 0.0), yb + 0.7, zr0 + 0.3), V3(s * wallX(yb + 0.7), yb + 0.7, zf0 - 0.2), 0.06, 0.07);
      for (const s of [-0.9, -0.3, 0.3, 0.9]) { const x = s * hwAt(Ht - 0.1) * 0.9; bxbar(g, P.body, V3(x * hb / ht, yb + 0.3, zf0 + 0.04 + 0.05), V3(x, Ht - 0.1, Lb / 2 + 0.04), 0.07, 0.05, V3(1, 0, 0)); }
    }
    // груз: зерно с холмиком
    if (loaded) { const m = new T.SphereGeometry(1, 22, 9, 0, TAU, 0, PI / 2); m.scale(ht - 0.12, 0.42, Lb / 2 - 0.12); { const uv = m.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 6); put(g, m, grainMat(), 0, Ht - 0.12, 0); } }
    // --- выгрузной шнек (слева спереди): наклонная труба вдоль переднего угла
    tag('auger');
    { const zfw = (y) => zf0 + (Lb / 2 - zf0) * clamp((y - yb) / (Ht - yb), 0, 1), r0 = lerp(0.2, 0.3, k), x0 = 0.5, y0 = yb + 0.25, x1 = ht + 0.3 + 0.1 * k, y1 = Ht + 0.45 + 0.2 * k, z0 = zfw(y0) + 0.28, z1 = zfw(Ht) + 0.3;
      put(g, rb(0.7, 0.55, 0.5, 0.1), P.dark, x0 - 0.1, y0, z0 - 0.05);
      const pm = V3((x0 + x1) / 2, (y0 + y1) / 2 - 0.0, (z0 + z1) / 2);
      rod(g, P.body, V3(x0, y0, z0), pm, r0, 16); rod(g, P.body, pm, V3(x1, y1, z1), r0 * 0.92, 16);
      put(g, new T.SphereGeometry(r0 * 1.02, 12, 8), P.body, pm.x, pm.y, pm.z); put(g, new T.CylinderGeometry(r0 * 1.12, r0 * 1.12, 0.08, 16), P.grey, pm.x, pm.y, pm.z, 0.5, 0, 1.2);
      put(g, new T.CylinderGeometry(r0 * 1.1, r0 * 1.1, 0.1, 16), P.grey, x1 - 0.15, y1 - 0.12, z1 - 0.05, 0.4, 0, 1.0);
      const sp = V3(x1 + 0.28, y1 - 0.03, z1 + 0.02); rod(g, P.dark, V3(x1, y1, z1), sp, r0 * 1.0, 14, r0 * 0.9); rod(g, P.dark, sp, V3(sp.x + 0.12, sp.y - 0.3, sp.z), r0 * 0.95, 14, r0 * 1.35);
      rod(g, P.dark, V3(pm.x + 0.05, pm.y - 0.15, pm.z - 0.2), V3(pm.x + 0.5, pm.y + 0.35, pm.z - 0.08), 0.045, 8); rod(g, P.steel, V3(pm.x + 0.5, pm.y + 0.35, pm.z - 0.08), V3(pm.x + 0.7, pm.y + 0.55, pm.z - 0.02), 0.028, 6);
      hose(g, P.black, [[0.0, 1.3, zfw(1.3) + 0.12], [0.2, 1.1, zfw(1.1) + 0.5], [0.4, 0.95, zfw(1.0) + 0.5], [0.5, y0, z0 - 0.1]], 0.026, 10, 6);
    }
    // --- ступени, оконце, фонари, декали
    tag('details');
    ladder(g, P, V3(-hwAt(1.2) - 0.55, 0.35, zr0 - 0.2), V3(-hwAt(1.8) - 0.4, 1.55, zr0 - 0.2), 0.4, 6, false);
    put(g, rb(0.46, 0.06, 0.4, 0.02, 0), P.dark, -hwAt(1.8) - 0.22, 1.6, zr0 - 0.2);
    if (t >= 1) { ladder(g, P, V3(0.75, 0.55, -Lb / 2 - 0.12), V3(0.75, Ht - 0.1, -Lb / 2 - 0.12), 0.42, 6 + Math.round(2 * k), false); }
    for (const s of [-1, 1]) {
      const wy = Ht * 0.62; pane(gl, 0.02, 0.28, s * (hwAt(wy) + 0.02), wy, 0.4, 0, 0, 0).scale.z = 0.7 / 0.014; put(g, rb(0.04, 0.34, 0.76, 0.02, 0), P.dark, s * (hwAt(wy) + 0.0), wy, 0.4);
      decal(g, 't5', 1.5, 0.37, s * (hwAt(Ht * 0.78) + 0.04), Ht * 0.78, -Lb * 0.12, s * PI / 2, 0, 1);
      decal(g, 'band1', Lb * 0.7, 0.14, s * (hwAt(Ht * 0.92) + 0.045), Ht * 0.92, -Lb * 0.04, s * PI / 2, 0, 1);
      lampUnit(g, P, s * (ht - 0.1), Ht - 0.35, -Lb / 2 - 0.02, 0.2, 0.12, 'z-', P.body); lampUnit(g, P, s * (ht - 0.1), Ht - 0.55, -Lb / 2 - 0.02, 0.2, 0.08, 'z-', P.amber); lampUnit(g, P, s * (hb + 0.1), yb + 0.2, -Lb / 2 + 0.3, 0.2, 0.1, 'z-', P.body);
      lampUnit(g, P, s * 0.8, yb + 0.05, zf0 + 0.28, 0.2, 0.1, 'z+', P.amber); lampUnit(g, P, s * (ht - 0.1), Ht - 0.2, Lb / 2 + 0.0, 0.14, 0.1, 'z+', P.amber);
    }
    decal(g, 'haz', 1.4, 0.3, 0, yb + 0.15, zr0 - 0.0 - 0.0, PI, 0, 4); put(g, rb(1.5, 0.12, 0.15, 0.04, 0), P.dark, 0, yb + 0.35, zr0 - 0.08); decal(g, 'plate', 0.5, 0.14, 0.0, yb + 0.5, zr0 - 0.2, PI, 0, 1);
    if (t >= 1) { put(g, new T.CylinderGeometry(0.15, 0.15, ht * 1.6, 12), P.black, 0, Ht + 0.14, Lb / 2 - 0.25, 0, 0, PI / 2); for (const x of [-0.7, 0, 0.7]) bx(g, P.dark, 0.06, 0.34, 0.06, x * ht * 0.9, Ht + 0.08, Lb / 2 - 0.22); }
    if (t >= 1) for (const x of t >= 2 ? [-0.9, -0.3, 0.3, 0.9] : [-0.4, 0.4]) lampUnit(g, P, x, Ht - 0.1, Lb / 2 + 0.03, 0.2, 0.1, 'z+');
    if (t >= 2) { put(g, rb(0.3, 0.3, 0.3, 0.05, 0), P.dark, ht - 0.3, Ht + 0.12, Lb / 2 - 0.3); put(g, new T.CylinderGeometry(0.06, 0.06, 0.3, 8), P.black, ht - 0.3, Ht + 0.4, Lb / 2 - 0.3); }
    return finish(g, gl);
  }
  FM.register('trailer', 'grain', (() => {
    const cache = {};
    return (opts) => { opts = opts || {}; const lv = lvOf(opts), v = (opts.variant | 0) % 2, loaded = !(opts.empty || opts.load === 0), key = lv + '|' + v + '|' + (loaded ? 1 : 0); return (cache[key] || (cache[key] = buildGrain(lv, v, loaded))).clone(true); };
  })());

  // ====================================================================== ПЛАТФОРМА (trailer/flat)
  let _diaM = null;
  function diamondMat() {
    if (_diaM) return _diaM;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = '#9aa0a6'; c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.save(); c.translate(x * 16 + 8 + (y % 2 ? 8 : 0), y * 16 + 8); c.rotate((x + y) % 2 ? 0.8 : -0.8); const gr = c.createLinearGradient(-2, 0, 2, 0); gr.addColorStop(0, '#6c7279'); gr.addColorStop(0.5, '#e3e7ea'); gr.addColorStop(1, '#6c7279'); c.fillStyle = gr; c.fillRect(-2.5, -6.5, 5, 13); c.restore(); }
    return (_diaM = new T.MeshStandardMaterial({ map: canvasTex(cv, true), metalness: 0.7, roughness: 0.45, envMapIntensity: 0.7 }));
  }
  function diaBox(g, w, h, d, x, y, z, rx, ry, rz) {
    const geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, w / 0.8), uv.getY(i) * Math.max(1, d / 0.8));
    return put(g, geo, diamondMat(), x, y, z, rx, ry, rz);
  }
  let _baleG = null;
  function baleGeo() {
    if (_baleG) return _baleG;
    const p = [[0, 0], [0.55, 0], [0.61, 0.03], [0.63, 0.1], [0.63, 1.1], [0.61, 1.17], [0.55, 1.2], [0, 1.2]];
    return (_baleG = lathe(p, 20));
  }
  let _slG = null;
  function pallet(g, P, x, y, z, ry, nl) {
    const gg = new T.Group(); gg.position.set(x, y, z); gg.rotation.y = ry || 0; g.add(gg);
    woodBox(gg, 1.2, 0.03, 0.8, 0, 0.145, 0, 1, 1); for (const xx of [-0.5, 0, 0.5]) woodBox(gg, 0.1, 0.1, 0.8, xx, 0.075, 0, 1, 1); for (const zz of [-0.34, 0.34]) woodBox(gg, 1.2, 0.025, 0.12, 0, 0.0125, zz, 1, 1);
    _slG = _slG || sackLayerGeo();
    for (let l = 0; l < nl; l++) put(gg, _slG, sackMat(), (l % 2 ? 0.01 : -0.01), 0.16 + 0.085 + l * 0.17, (l % 2 ? 0.01 : -0.01), 0, (l % 2) * 0.05 - 0.025, 0);
    for (const yy of [0.3, 0.3 + (nl - 1) * 0.17 * 0.8]) bx(gg, P.black, 1.22, 0.012, 0.82, 0, yy, 0).scale.set(1.22, 0.012, 0.82);
    return gg;
  }
  function buildFlat(lv, variant) {
    const g = new T.Group(), gl = [], k = (lv - 1) / 9, t = lv <= 3 ? 0 : lv <= 6 ? 1 : 2, blue = (variant | 0) % 2 === 1, cargoSel = Math.floor((variant | 0) / 2) % 3;
    const P = palette({ body: blue ? [0x2b5ba2, 0x24509a, 0x1c4590][t] : [0xa92f25, 0xa0261f, 0x951c18][t], accent: 0xe4b81c, rough: [0.46, 0.34, 0.22][t], dark: 0x2f353b, grey: 0xc9ced1, metallic: 0.3 });
    const len = lerp(5.4, 9.6, k), wid = lerp(2.3, 2.55, k), dh = lerp(1.0, 1.15, k), R = lerp(0.56, 0.66, k), Wd = lerp(0.34, 0.46, k), zF = len / 2 - 1.3, zR = -len / 2 + 1.35, wx = wid / 2 - Wd / 2 + 0.06;
    tag('deck');
    woodBox(g, wid - 0.1, 0.07, len, 0, dh - 0.035, 0, wid / 1.5, len / 2.0);
    for (const s of [-1, 1]) {
      bar(g, P.dark, V3(s * 0.62, dh - 0.2, -len / 2 + 0.05), V3(s * 0.62, dh - 0.2, len / 2 - 0.05), 0.13, 0.26, 0.03);
      bar(g, P.body, V3(s * (wid / 2 - 0.04), dh - 0.045, -len / 2 + 0.04), V3(s * (wid / 2 - 0.04), dh - 0.045, len / 2 - 0.04), 0.1, 0.14, 0.03);
      bx(g, P.steel, 0.012, 0.05, len - 0.4, s * (wid / 2 + 0.012), dh - 0.05, 0);
    }
    for (let z = -len / 2 + 0.2; z < len / 2; z += 0.72) bx(g, P.dark, wid - 0.2, 0.09, 0.07, 0, dh - 0.115, z);
    bar(g, P.body, V3(-wid / 2 + 0.05, dh - 0.045, len / 2 - 0.04), V3(wid / 2 - 0.05, dh - 0.045, len / 2 - 0.04), 0.1, 0.14, 0.03); bar(g, P.body, V3(-wid / 2 + 0.05, dh - 0.045, -len / 2 + 0.04), V3(wid / 2 - 0.05, dh - 0.045, -len / 2 + 0.04), 0.1, 0.14, 0.03);
    // рым-болты крепления груза и стойки с бортовым прутом
    const nst = Math.max(4, Math.round(len / 1.5));
    for (const s of [-1, 1]) for (let i = 0; i <= nst; i++) {
      const z = -len / 2 + 0.3 + (len - 0.6) * i / nst;
      put(g, new T.TorusGeometry(0.045, 0.012, 4, 8), P.steel, s * (wid / 2 + 0.02), dh - 0.03, z, 0, PI / 2, 0);
      bx(g, P.dark, 0.06, 0.4, 0.06, s * (wid / 2 - 0.08), dh + 0.18, z);
    }
    for (const s of [-1, 1]) { rod(g, P.steel, V3(s * (wid / 2 - 0.08), dh + 0.34, -len / 2 + 0.3), V3(s * (wid / 2 - 0.08), dh + 0.34, len / 2 - 0.3), 0.017, 5); rod(g, P.steel, V3(s * (wid / 2 - 0.08), dh + 0.2, -len / 2 + 0.3), V3(s * (wid / 2 - 0.08), dh + 0.2, len / 2 - 0.3), 0.014, 5); }
    if (t >= 2) for (const s of [-1, 1]) woodBox(g, 0.04, 0.3, len - 0.6, s * (wid / 2 - 0.06), dh + 0.2, 0, 1, 3);
    // передний щит-ограждение
    tag('headboard');
    { const hy = 1.25 + 0.15 * k, zh = len / 2 - 0.12;
      for (const s of [-1, 1]) bar(g, P.body, V3(s * (wid / 2 - 0.1), dh, zh), V3(s * (wid / 2 - 0.1), dh + hy, zh), 0.1, 0.1, 0.03);
      bar(g, P.body, V3(-wid / 2 + 0.1, dh + hy, zh), V3(wid / 2 - 0.1, dh + hy, zh), 0.1, 0.1, 0.03); bar(g, P.body, V3(-wid / 2 + 0.1, dh + hy * 0.5, zh), V3(wid / 2 - 0.1, dh + hy * 0.5, zh), 0.07, 0.07, 0.02);
      for (let i = 1; i < 6; i++) { const x = -wid / 2 + 0.1 + (wid - 0.2) * i / 6; bx(g, P.body, 0.045, hy, 0.045, x, dh + hy / 2, zh); }
      decal(g, 't6', 1.3, 0.33, 0, dh + hy * 0.75, zh + 0.03, 0, 0, 1);
    }
    // --- оси: передняя поворотная с кругом, задняя; колёса
    tag('wheels');
    for (const s of [-1, 1]) for (const z of [zF, zR]) {
      wheel(g, P, s * wx, R, z, s, { R, W: Wd, rimR: R * 0.6, lugs: 14, lugH: R * 0.045, N: 26, chev: 26, rimMat: P.accent, bolts: 6 });
      tag('fenders');
      arcPlate(g, P.dark, s * wx, R, z, R + 0.05, R + 0.1, 0.0, PI, Wd + 0.1, 8); bx(g, P.dark, 0.05, 0.4, 0.04, s * (wx + Wd / 2 + 0.03), R * 0.55, z - R - 0.03);
      bx(g, P.black, Wd - 0.04, 0.34, 0.025, s * wx, R * 0.5, z - R - 0.12);
    }
    tag('axles');
    for (const z of [zF, zR]) { rod(g, P.dark, V3(-wx + 0.15, R, z), V3(wx - 0.15, R, z), 0.075, 10); bar(g, P.dark, V3(-wx + 0.2, R + 0.1, z), V3(wx - 0.2, R + 0.1, z), 0.1, 0.12, 0.03); }
    put(g, new T.CylinderGeometry(0.42, 0.46, 0.14, 24), P.dark, 0, dh - 0.34, zF); put(g, new T.CylinderGeometry(0.2, 0.2, 0.06, 16), P.steel, 0, dh - 0.4, zF);
    for (const s of [-1, 1]) { bar(g, P.dark, V3(s * 0.55, dh - 0.36, zR - 0.1), V3(s * (wx - Wd / 2 - 0.08), R + 0.3, zR), 0.1, 0.12, 0.03); rod(g, P.steel, V3(s * 0.55, dh - 0.32, zF - 0.0), V3(s * (wx - Wd / 2 - 0.1), R + 0.28, zF), 0.03, 6); }
    // дышло с проушиной и опорой
    tag('drawbar');
    { const ze = len / 2 + 2.6;
      for (const s of [-1, 1]) bar(g, P.dark, V3(s * 0.48, dh - 0.4, zF - 0.1), V3(s * 0.08, 0.66, ze - 0.2), 0.12, 0.17, 0.03);
      rod(g, P.dark, V3(0, 0.66, ze - 0.3), V3(0, 0.66, ze + 0.0), 0.07, 10); put(g, new T.TorusGeometry(0.11, 0.028, 8, 16), P.steel, 0, 0.68, ze + 0.08, PI / 2, 0, 0);
      bar(g, P.dark, V3(-0.3, 0.9, zF + 0.9), V3(0.3, 0.9, zF + 0.9), 0.1, 0.1, 0.02);
      rod(g, P.steel, V3(0, 0.78, ze - 0.7), V3(0, 0.22, ze - 0.7), 0.05, 8); put(g, new T.CylinderGeometry(0.11, 0.11, 0.03, 12), P.dark, 0, 0.19, ze - 0.7);
      hose(g, P.black, [[-0.1, dh - 0.35, zF + 0.1], [-0.18, 0.8, zF + 1.2], [-0.12, 0.7, zF + 2.0], [-0.04, 0.72, ze - 0.3]], 0.022, 14, 6);
      hose(g, P.black, [[0.1, dh - 0.35, zF + 0.1], [0.18, 0.8, zF + 1.2], [0.12, 0.68, zF + 2.0], [0.04, 0.7, ze - 0.3]], 0.022, 14, 6);
    }
    // --- аппарели
    tag('ramps');
    { const Lr = (dh - 0.04) / 0.46;
      for (const s of [-1, 1]) {
        const x = s * (wid / 2 - 0.62), a = V3(x, dh - 0.02, -len / 2 - 0.02), b = V3(x, 0.04, -len / 2 - Lr);
        const m = diaBox(g, 0.62, 0.05, Lr, x, (a.y + b.y) / 2, (a.z + b.z) / 2); m.rotation.x = Math.atan2(dh - 0.06, Lr); 
        for (const sx of [-1, 1]) { const mm = bx(g, P.dark, 0.04, 0.09, Lr, x + sx * 0.33, (a.y + b.y) / 2 + 0.02, (a.z + b.z) / 2); mm.rotation.x = Math.atan2(dh - 0.06, Lr); }
        bx(g, P.dark, 0.7, 0.04, 0.12, x, 0.025, b.z - 0.02);
      }
    }
    // --- груз
    tag('cargo');
    { const mode = cargoSel || (t === 0 ? 2 : t === 1 ? 1 : 3), nAlong = Math.max(2, Math.floor((len - 1.2) / 1.3)), zS = -len / 2 + 0.75 + 0.65;
      const palletsAt = (zs) => { for (let i = 0; i < zs.length; i++) pallet(g, P, i % 2 ? 0.55 : -0.55, dh, zs[i], 0, 4 + (i % 2)); };
      const balesAt = (zs, cols) => { zs.forEach((z, i) => { const col = cols[i % cols.length]; for (const x of [-0.64, 0.64]) put(g, baleGeo(), wrapMat(col), x, dh, z); }); };
      const zl = []; for (let i = 0; i < nAlong; i++) zl.push(zS + i * 1.3);
      if (mode === 1) balesAt(zl, [0xe9efe1, 0x2f6a35]);
      else if (mode === 2) palletsAt([zl[0], zl[0] + 0.9, zl[1] + 0.8].filter((z) => z < len / 2 - 1));
      else { balesAt(zl.slice(0, Math.max(1, nAlong - 2)), [0xe9efe1, 0x2f6a35]); palletsAt([len / 2 - 1.2, len / 2 - 2.1]); }
      // стяжные ремни
      const sy = dh + 1.25 + 0.0;
      if (mode !== 2) for (const z of zl.slice(0, 2)) { bx(g, P.black, wid * 0.88, 0.02, 0.05, 0, dh + 1.22, z); for (const s of [-1, 1]) bx(g, P.steel, 0.07, 0.06, 0.02, s * (wid / 2 - 0.08), dh + 0.1, z + 0.0); }
    }
    // --- ящик для инструмента, фонари, декали
    tag('details');
    put(g, rb(0.9, 0.38, 0.42, 0.05, 0), P.dark, -wid / 2 + 0.55, dh - 0.45, 0.0); bx(g, P.steel, 0.06, 0.05, 0.02, -wid / 2 + 0.55, dh - 0.4, 0.22);
    bar(g, P.dark, V3(-wid / 2 + 0.3, 0.52, -len / 2 - 0.15), V3(wid / 2 - 0.3, 0.52, -len / 2 - 0.15), 0.1, 0.1, 0.02);
    for (const s of [-1, 1]) { lampUnit(g, P, s * (wid / 2 - 0.14), dh - 0.04, -len / 2 - 0.03, 0.18, 0.12, 'z-', P.body); lampUnit(g, P, s * (wid / 2 - 0.14 - 0.2), dh - 0.04, -len / 2 - 0.03, 0.18, 0.12, 'z-', P.amber); lampUnit(g, P, s * (wid / 2 - 0.1), dh - 0.04, len / 2 + 0.01, 0.12, 0.1, 'z+', P.amber); lampUnit(g, P, s * (wid / 2 + 0.04), dh - 0.1, 0, 0.16, 0.08, s > 0 ? 'x+' : 'x-', P.amber); bar(g, P.dark, V3(s * (wid / 2 - 0.02), dh - 0.2, -len / 2 + 0.2), V3(s * (wid / 2 - 0.02), dh - 0.2, -len / 2 + 0.4), 0.05, 0.05, 0.01); }
    decal(g, 'haz', 1.1, 0.22, 0, dh - 0.06, -len / 2 - 0.13, PI, 0, 4); decal(g, 'plate', 0.5, 0.14, 0.0, 0.7, -len / 2 - 0.2, PI, 0, 1);
    for (const s of [-1, 1]) decal(g, 't6', 1.3, 0.33, s * (wid / 2 + 0.017), dh - 0.04, len * 0.15, s * PI / 2, 0, 1);
    if (lv >= 5) for (const s of [-1, 1]) decal(g, 'band3', len * 0.6, 0.07, s * (wid / 2 + 0.017), dh - 0.04, -len * 0.18, s * PI / 2, 0, 1);
    return finish(g, gl);
  }
  FM.register('trailer', 'flat', (() => {
    const cache = {};
    return (opts) => { opts = opts || {}; const lv = lvOf(opts), v = opts.variant | 0, key = lv + '|' + v; return (cache[key] || (cache[key] = buildFlat(lv, v))).clone(true); };
  })());

  // @@TRAILERS@@
})();
