/* Лесная техника: харвестер (vehicle/logger), корчеватель-мульчер (vehicle/grinder), форвардер (vehicle/forwarder), лесовоз (truck/logtruck).
   Реалистичные PBR-модели (three.js r128, без внешних файлов). Перед = +Z, начало координат — центр опоры на земле, 1 единица ~ 1 м.
   Все формы авторские (по мотивам скандинавской техники «хлыстами/сортиментами»): сочленённая рама, шины с грунтозацепами, боги,
   кабина с панорамным стеклом, шарнирный кран с гидроцилиндрами и шлангами, харвестерная головка, брёвна с годичными кольцами. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
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
  function rboxGeo(w, h, d, r, seg, cs) {
    r = Math.max(0.001, Math.min(r == null ? 0.1 : r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const bev = Math.min(r * 0.7, d / 2 - 0.001, 0.3), hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.0005, Math.min(r, hw - 0.0005, hh - 0.0005)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh); sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: seg, curveSegments: cs });
    g.translate(0, 0, -(d - 2 * bev) / 2); return g;
  }
  /** Скруглённая коробка w×h×d (x,y,z), радиус r; q: 0 дёшево, 1 обычно, 2 качественно. Нормали сглажены по углу. */
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
      const ax = p1[0] + (p0[0] - p1[0]) / d1 * rr, ay = p1[1] + (p0[1] - p1[1]) / d1 * rr, bx2 = p1[0] + (p2[0] - p1[0]) / d2 * rr, by = p1[1] + (p2[1] - p1[1]) / d2 * rr;
      if (i) sh.lineTo(ax, ay); else sh.moveTo(ax, ay);
      sh.quadraticCurveTo(p1[0], p1[1], bx2, by);
    }
    sh.closePath(); return sh;
  }
  /** Выдавливание контура. plane 'zy': контур (z,y) вытянут по X на ширину w (профиль сбоку); 'xz': контур (x,z) вытянут по Y; иначе контур (x,y) вытянут по Z. */
  function ex(pts, w, o) {
    o = o || {}; const b = o.b == null ? 0.02 : o.b, rad = o.r == null ? 0.1 : o.r, q = o.q == null ? 2 : o.q;
    const g = new T.ExtrudeGeometry(o.shape || rshape(pts, rad), { depth: Math.max(0.002, w - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: [1, 2, 3][q], curveSegments: o.cs || [2, 4, 6][q] });
    g.translate(0, 0, -(w - 2 * b) / 2);
    if (o.plane === 'zy') g.rotateY(-PI / 2); else if (o.plane === 'xz') g.rotateX(PI / 2);
    return crease(g, 42);
  }
  const lathe = (prof, seg, axis) => { const g = new T.LatheGeometry(prof.map((p) => new T.Vector2(p[0], p[1])), seg || 24); if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'nx') g.rotateZ(PI / 2); else if (axis === 'z') g.rotateX(PI / 2); return g; };
  const _cg = {};
  const cylG = (rt, rbm, h, seg) => { const k = [rt, rbm, h, seg].join('|'); return _cg[k] || (_cg[k] = new T.CylinderGeometry(rt, rbm, h, seg)); };
  const _bxg = new T.BoxGeometry(1, 1, 1);

  // ====================================================================== добавление деталей
  let TAG = ''; const tag = (t) => { TAG = t; };
  const mk = (geo, mat, x, y, z, rx, ry, rz) => { const m = C.mesh(geo, mat, x, y, z, rx, ry, rz); m.userData.tag = TAG; return m; };
  const put = (g, geo, mat, x, y, z, rx, ry, rz) => { const m = mk(geo, mat, x, y, z, rx, ry, rz); g.add(m); return m; };
  /** Дешёвая острая коробка (12 тр.). */
  function bx(g, mat, w, h, d, x, y, z, rx, ry, rz) { const m = mk(_bxg, mat, x, y, z, rx, ry, rz); m.scale.set(w, h, d); g.add(m); return m; }
  /** Скруглённая коробка. */
  const rbx = (g, mat, w, h, d, x, y, z, r, rx, ry, rz) => put(g, rb(w, h, d, r == null ? Math.min(w, h, d) * 0.28 : r), mat, x, y, z, rx, ry, rz);
  /** Цилиндр: ось 'y' (по умолч.), 'x' или 'z'; r — радиус, r2 — радиус «верха». */
  function cy(g, mat, r, h, x, y, z, ax, seg, r2) {
    const m = mk(cylG(r2 == null ? r : r2, r, h, seg || (r < 0.05 ? 8 : r < 0.2 ? 14 : 22)), mat, x, y, z);
    if (ax === 'x') m.rotation.z = PI / 2; else if (ax === 'z') m.rotation.x = PI / 2; g.add(m); return m;
  }
  const _sg = {};
  const sph = (g, mat, r, x, y, z, sx, sy, sz, seg) => { const k = [seg || 14].join(); const m = mk(_sg[k] || (_sg[k] = new T.SphereGeometry(1, seg || 14, Math.max(6, (seg || 14) >> 1))), mat, x, y, z); m.scale.set(r * (sx || 1), r * (sy || 1), r * (sz || 1)); g.add(m); return m; };
  function quatDir(dir, up) {
    let u = up || UP; if (Math.abs(dir.y) > 0.995 && !up) u = V3(0, 0, 1);
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(dir, V3(0, 0, 0), u));
  }
  /** Стержень (цилиндр/конус) между двумя точками. */
  function rod(g, mat, a, b, r, seg, r2) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length(); if (L < 1e-5) return null;
    const m = mk(cylG(r2 == null ? r : r2, r, L, seg || (r < 0.03 ? 6 : 12)), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.copy(new T.Quaternion().setFromUnitVectors(UP, d.normalize())); g.add(m); return m;
  }
  /** Скруглённый брус между двумя точками: w — ширина, h — высота (поперёк, вверх), длина вдоль a→b. */
  function bar(g, mat, a, b, w, h, r, up) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length(); if (L < 1e-5) return null;
    const m = mk(rb(w, h, L, r == null ? Math.min(w, h) * 0.3 : r, 0), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.copy(quatDir(d.normalize(), up)); g.add(m); return m;
  }
  /** Шланг/труба по ломаной через CatmullRom. */
  function hose(g, mat, pts, r, segs, radial) {
    const cu = new T.CatmullRomCurve3(pts.map(toV), false, 'catmullrom', 0.5);
    return put(g, new T.TubeGeometry(cu, segs || pts.length * 5, r, radial || 6, false), mat, 0, 0, 0);
  }
  /** Балка со скруглённым прямоугольным сечением, протянутая по пути (массив V3). prof(t) -> {w,h,r}. side — направление ширины сечения. */
  function sweepGeo(pts, prof, side) {
    side = side || V3(1, 0, 0);
    const n = pts.length, K = 2, ring = 4 * (K + 1), pos = [], idx = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tan = b.clone().sub(a).normalize();
      const up = tan.clone().cross(side).normalize(), sd = up.clone().cross(tan).normalize();
      const pr = prof(t), hw = pr.w / 2, hh = pr.h / 2, r = Math.min(pr.r == null ? 0.07 : pr.r, hw * 0.95, hh * 0.95);
      const cs = [[hw - r, hh - r], [-hw + r, hh - r], [-hw + r, -hh + r], [hw - r, -hh + r]];
      for (let q = 0; q < 4; q++) for (let k = 0; k <= K; k++) {
        const ang = q * PI / 2 + k / K * PI / 2, u = cs[q][0] + r * Math.cos(ang), v = cs[q][1] + r * Math.sin(ang), p = pts[i];
        pos.push(p.x + sd.x * u + up.x * v, p.y + sd.y * u + up.y * v, p.z + sd.z * u + up.z * v);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + (j + 1) % ring, c = (i + 1) * ring + j, d = (i + 1) * ring + (j + 1) % ring; idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // торцы (плоские)
    const caps = [], capPos = [];
    for (const e of [0, n - 1]) {
      const p = pts[e], base = e * ring, cp = [];
      for (let j = 0; j < ring; j++) cp.push([pos[(base + j) * 3], pos[(base + j) * 3 + 1], pos[(base + j) * 3 + 2]]);
      for (let j = 0; j < ring; j++) { const a = cp[j], b = cp[(j + 1) % ring]; if (e === 0) capPos.push(p.x, p.y, p.z, b[0], b[1], b[2], a[0], a[1], a[2]); else capPos.push(p.x, p.y, p.z, a[0], a[1], a[2], b[0], b[1], b[2]); }
    }
    const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.Float32BufferAttribute(capPos, 3)); cg.computeVertexNormals();
    return mergeGeos([g.toNonIndexed(), cg]);
  }
  function mergeGeos(list) {
    const gs = list.map((g) => (g.index ? g.toNonIndexed() : g)); let n = 0; for (const g of gs) n += g.attributes.position.count;
    const p = new Float32Array(n * 3), nn = new Float32Array(n * 3); let o = 0;
    for (const g of gs) { p.set(g.attributes.position.array, o * 3); nn.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(p, 3)); out.setAttribute('normal', new T.BufferAttribute(nn, 3)); return out;
  }
  /** Контур-обод из окружностей (выпуклая оболочка в плоскости (u,v), обход против часовой): для гусениц. */
  function hull2D(circ, arcSeg) {
    const n = circ.length, ang = [], pts = [];
    for (let i = 0; i < n; i++) {
      const A = circ[i], B = circ[(i + 1) % n], dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      const sb = clamp((A[2] - B[2]) / d, -1, 1), cb = Math.sqrt(1 - sb * sb), px = uy, py = -ux;
      ang.push(Math.atan2(py * cb + uy * sb, px * cb + ux * sb));
    }
    for (let i = 0; i < n; i++) {
      const a0 = ang[(i + n - 1) % n]; let a1 = ang[i]; while (a1 < a0) a1 += TAU; const c = circ[i], st = arcSeg || 8;
      for (let k = 0; k <= st; k++) { const a = a0 + (a1 - a0) * k / st; pts.push([c[0] + Math.cos(a) * c[2], c[1] + Math.sin(a) * c[2]]); }
    }
    return pts;
  }

  // ====================================================================== текстуры: декали и брёвна
  const canvasTex = (cv, rep) => { const t = new T.CanvasTexture(cv); t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
  const ATL = { haz: [0, 0, 128, 64], hazY: [128, 0, 256, 64], band1: [0, 70, 512, 102], band2: [0, 106, 512, 138], band3: [0, 142, 512, 174],
    p1: [0, 180, 256, 244], p2: [256, 180, 512, 244], p3: [0, 248, 256, 312], p4: [256, 248, 512, 312], p5: [0, 316, 256, 380], p6: [256, 316, 512, 380],
    num: [0, 384, 128, 448], warn: [128, 384, 256, 448], logo: [256, 384, 320, 448], plate: [320, 384, 512, 448], grid: [0, 452, 512, 512] };
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
    const band = (r, cols) => { const h = r[3] - r[1]; let yy = r[1]; for (const [c, f] of cols) { g.fillStyle = c; g.fillRect(r[0], yy, r[2] - r[0], Math.ceil(h * f)); yy += h * f; } };
    band(ATL.band1, [['#17181b', 0.62], ['#f2f2ee', 0.1], ['#17181b', 0.28]]);
    band(ATL.band2, [['#f1c40f', 0.6], ['#17181b', 0.1], ['#f1c40f', 0.3]]);
    band(ATL.band3, [['#f2f2ee', 0.6], ['#17181b', 0.12], ['#f2f2ee', 0.28]]);
    const plate = (r, bg, fg, txt, sub) => {
      const [x, y, x1, y1] = r, w = x1 - x, h = y1 - y; g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = fg; let fs = Math.round(h * 0.56); g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; while (g.measureText(txt).width > w * 0.9 && fs > 8) { fs -= 2; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; } g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, x + w / 2, y + h * (sub ? 0.38 : 0.52));
      if (sub) { fs = Math.round(h * 0.22); g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; while (g.measureText(sub).width > w * 0.9 && fs > 6) { fs -= 1; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; } g.fillText(sub, x + w / 2, y + h * 0.8); }
    };
    plate(ATL.p1, '#15171a', '#f2f2ee', 'HX 780', 'CUT-TO-LENGTH · 8W'); plate(ATL.p2, '#f2f2ee', '#15171a', 'FX 910', 'FORWARDER · 20 T');
    plate(ATL.p3, '#15171a', '#f3c614', 'MULCH-PRO', 'GX 650 · 420 HP'); plate(ATL.p4, '#f2f2ee', '#15171a', 'TIMBERLINE', 'FOREST SYSTEMS');
    plate(ATL.p5, '#15171a', '#f2f2ee', 'LT 480', 'TIMBER HAULER'); plate(ATL.p6, '#c4211c', '#f2f2ee', 'HX 620', 'HARVESTER');
    plate(ATL.num, '#15171a', '#f2f2ee', '780'); plate(ATL.plate, '#f2f2ee', '#15171a', 'MAX 30 KM/H');
    { const [x, y, x1, y1] = ATL.warn, w = x1 - x, h = y1 - y; g.fillStyle = '#f3c614'; g.fillRect(x, y, w, h); g.fillStyle = '#15171a'; g.beginPath(); g.moveTo(x + w / 2, y + 6); g.lineTo(x + w - 10, y + h - 8); g.lineTo(x + 10, y + h - 8); g.closePath(); g.fill(); g.fillStyle = '#f3c614'; g.beginPath(); g.moveTo(x + w / 2, y + 17); g.lineTo(x + w - 24, y + h - 14); g.lineTo(x + 24, y + h - 14); g.closePath(); g.fill(); g.fillStyle = '#15171a'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', x + w / 2, y + h * 0.62); }
    // логотип: ёлочка в круге
    { const [x, y, x1, y1] = ATL.logo, w = x1 - x, h = y1 - y; g.fillStyle = '#f2f2ee'; g.fillRect(x, y, w, h); g.fillStyle = '#1f6b34'; g.beginPath(); g.arc(x + w / 2, y + h / 2, h * 0.46, 0, TAU); g.fill(); g.fillStyle = '#f2f2ee';
      for (let i = 0; i < 3; i++) { const yy = y + h * (0.24 + i * 0.17), ww = h * (0.16 + i * 0.1); g.beginPath(); g.moveTo(x + w / 2, yy - h * 0.12); g.lineTo(x + w / 2 + ww, yy + h * 0.1); g.lineTo(x + w / 2 - ww, yy + h * 0.1); g.closePath(); g.fill(); } g.fillRect(x + w / 2 - 2, y + h * 0.72, 4, h * 0.12); }
    // решётка радиатора
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
  /** Декаль из атласа в точке pos: ширина вдоль along, нормаль normal (куда смотрит). */
  function decal(g, name, w, h, pos, along, normal, off) {
    const m = mk(decalGeo(name, w, h), atlasMat(), 0, 0, 0);
    const X = toV(along).clone().normalize(), Z = toV(normal).clone().normalize(), Y = Z.clone().cross(X).normalize(); X.copy(Y.clone().cross(Z));
    m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
    m.position.copy(toV(pos)).addScaledVector(Z, off == null ? 0.004 : off); m.castShadow = false; g.add(m); return m;
  }
  /** Декаль на боковой стенке: side=+1 — на +X, -1 — на -X (читается слева направо снаружи). */
  const decalX = (g, name, w, h, x, y, z, side) => decal(g, name, w, h, V3(x, y, z), V3(0, 0, -side), V3(side, 0, 0));
  const decalZ = (g, name, w, h, x, y, z, dir) => decal(g, name, w, h, V3(x, y, z), V3(dir, 0, 0), V3(0, 0, dir));

  // брёвна: кора (слева, 4 образца) + торцы с годичными кольцами (справа, 4 образца)
  let _logMat = null;
  function logMat() {
    if (_logMat) return _logMat;
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d'), rnd = lcg(777);
    g.fillStyle = '#43301f'; g.fillRect(0, 0, 512, 512);
    const barks = ['#5d402b', '#4e3827', '#69492f', '#58402f'];
    for (let i = 0; i < 4; i++) {
      const y0 = i * 128; g.save(); g.beginPath(); g.rect(0, y0, 256, 128); g.clip(); g.fillStyle = barks[i]; g.fillRect(0, y0, 256, 128);
      for (let k = 0; k < 340; k++) { const x = rnd() * 256, w = 1 + rnd() * 3.5; g.fillStyle = rnd() < 0.55 ? `rgba(25,15,8,${0.25 + rnd() * 0.35})` : `rgba(165,122,82,${0.14 + rnd() * 0.25})`; g.fillRect(x, y0 + rnd() * 128 - 20, w, 14 + rnd() * 80); }
      for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(20,12,6,0.5)'; g.beginPath(); g.ellipse(rnd() * 256, y0 + rnd() * 128, 2 + rnd() * 4, 4 + rnd() * 8, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    const pals = [{ a: '#ead6a8', b: '#cfaa6c', pith: '#8a5a2a' }, { a: '#e4c288', b: '#cda064', h: '#c4813f', h2: '#a8662c', pith: '#7a4a1e' }, { a: '#dcbf8a', b: '#bf945a', pith: '#7a4a22' }, { a: '#eedfbd', b: '#d6bb8a', pith: '#946a3a' }];
    pals.forEach((pl, i) => {
      const cx = 256 + 64 + (i % 2) * 128, cy = 64 + (i >> 1) * 128, r2 = lcg(31 + i * 17), ox = (r2() - 0.5) * 5, oy = (r2() - 0.5) * 5;
      g.fillStyle = '#43301f'; g.fillRect(cx - 64, cy - 64, 128, 128); g.beginPath(); g.arc(cx, cy, 60, 0, TAU); g.fillStyle = '#4a3322'; g.fill();
      let rad = 56, k = 0;
      while (rad > 1.5) {
        const t = 1 - rad / 56; g.fillStyle = (pl.h && t > 0.5) ? (k % 2 ? pl.h : pl.h2) : (k % 2 ? pl.a : pl.b);
        g.beginPath(); g.ellipse(cx + ox * t, cy + oy * t, rad * (1 + 0.025 * Math.sin(k * 1.7)), rad, k * 0.3, 0, TAU); g.fill(); rad -= 1.8 + r2() * 3.4; k++;
      }
      g.fillStyle = pl.pith; g.beginPath(); g.arc(cx + ox, cy + oy, 2.4, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = 1.3; for (let c = 0; c < 3; c++) { const a = r2() * TAU; g.beginPath(); g.moveTo(cx + ox + Math.cos(a) * 4, cy + oy + Math.sin(a) * 4); g.lineTo(cx + Math.cos(a) * (28 + r2() * 24), cy + Math.sin(a) * (28 + r2() * 24)); g.stroke(); }
      g.strokeStyle = 'rgba(70,45,20,0.28)'; g.lineWidth = 0.8; for (let rr = 54; rr > 4; rr -= 6) { g.beginPath(); g.ellipse(cx + ox * (1 - rr / 56), cy + oy * (1 - rr / 56), rr, rr * 0.99, 0, 0, TAU); g.stroke(); }
    });
    return (_logMat = new T.MeshStandardMaterial({ map: canvasTex(cv), metalness: 0, roughness: 0.92, envMapIntensity: 0.15 }));
  }
  /** Бревно вдоль Z (от -len/2 до +len/2): радиусы r0 (комель) и r1 (вершина), кора bark 0..3, торцы ring0/ring1 0..3. */
  function logGeo(r0, r1, len, seg, bark, ring0, ring1) {
    const pos = [], nor = [], uv = [], idx = [], bv0 = 1 - (bark * 128 + 3) / 512, bv1 = 1 - (bark * 128 + 125) / 512;
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * TAU, c = Math.cos(a), s = Math.sin(a), u = k / seg * 0.48 + 0.01;
      for (let e = 0; e < 2; e++) { const r = e ? r1 : r0; pos.push(c * r, s * r, e ? len / 2 : -len / 2); const sl = (r0 - r1) / len, nl = Math.hypot(1, sl); nor.push(c / nl, s / nl, sl / nl); uv.push(u, e ? bv1 : bv0); }
    }
    for (let k = 0; k < seg; k++) { const a = k * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, c, d, b); }
    const cap = (e, ring) => {
      const base = pos.length / 3, cxp = 256 + 64 + (ring % 2) * 128, cyp = 64 + (ring >> 1) * 128, z = e ? len / 2 : -len / 2, r = e ? r1 : r0;
      pos.push(0, 0, z); nor.push(0, 0, e ? 1 : -1); uv.push(cxp / 512, 1 - cyp / 512);
      for (let k = 0; k <= seg; k++) { const a = k / seg * TAU, c = Math.cos(a), s = Math.sin(a); pos.push(c * r, s * r, z); nor.push(0, 0, e ? 1 : -1); uv.push((cxp + c * 57) / 512, 1 - (cyp + s * 57) / 512); }
      for (let k = 0; k < seg; k++) { if (e) idx.push(base, base + 1 + k, base + 2 + k); else idx.push(base, base + 2 + k, base + 1 + k); }
    };
    cap(0, ring0); cap(1, ring1);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  }
  /** Штабель брёвен вдоль Z. o: x0,x1 (ширина), y0 (пол), hmax (высота), zc, len, rmin, rmax, seg, ragged. Возвращает число брёвен. */
  function logPile(g, P, rnd, o) {
    let n = 0, row = 0; const rAvg = (o.rmin + o.rmax) / 2, pitch = rAvg * 1.74, seg = o.seg || 10;
    for (;;) {
      const yc = o.y0 + rAvg * 1.04 + row * pitch; if (yc + rAvg > o.y0 + o.hmax + 0.02) break;
      let x = o.x0 + rAvg * (row % 2 ? 1.9 : 1.0);
      while (x < o.x1 - rAvg * 0.6) {
        const r = o.rmin + rnd() * (o.rmax - o.rmin); if (x + r > o.x1 + 0.02) break;
        const top = yc + pitch * 0.9 > o.y0 + o.hmax;
        if (!(top && o.ragged && rnd() < 0.3)) {
          const len = o.len * (0.9 + rnd() * 0.12), zc = o.zc + (rnd() - 0.5) * (o.zjit == null ? 0.3 : o.zjit), but = r * (1.05 + rnd() * 0.1), tip = r * (0.9 + rnd() * 0.07), fl = rnd() < 0.5;
          const m = mk(logGeo(fl ? but : tip, fl ? tip : but, len, seg, (rnd() * 4) | 0, (rnd() * 4) | 0, (rnd() * 4) | 0), P.log, x + (rnd() - 0.5) * 0.03, yc + (rnd() - 0.5) * 0.05, zc);
          m.rotation.z = rnd() * TAU; g.add(m); n++;
        }
        x += r * 2 + 0.012 + rnd() * 0.02;
      }
      row++;
    }
    return n;
  }
  /** Куча щепы: холм (шум) + россыпь стружки. cx,cz — центр, rx,rz — полуоси, h — высота. */
  function chips(g, P, rnd, cx, cz, rx, rz, h, shards) {
    const sg = new T.SphereGeometry(1, 18, 8, 0, TAU, 0, PI / 2), p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.16 * Math.sin(a * 3 + 1.3) + 0.1 * Math.sin(a * 7 + 0.4) + (y > 0.05 ? (rnd() - 0.5) * 0.1 : 0); p.setXYZ(i, x * k, y * (1 + (rnd() - 0.5) * 0.12), z * k); }
    sg.computeVertexNormals(); const m = mk(sg, P.chip, cx, 0, cz); m.scale.set(rx, h, rz); g.add(m);
    const cg = new T.BoxGeometry(1, 1, 1);
    for (let i = 0; i < shards; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()), x = cx + Math.cos(a) * rx * (0.55 + d * 0.65), z = cz + Math.sin(a) * rz * (0.55 + d * 0.65), s = 0.05 + rnd() * 0.09;
      const q = mk(cg, P.chip, x, s * 0.2, z, (rnd() - 0.5) * 0.9, rnd() * TAU, (rnd() - 0.5) * 0.9); q.scale.set(s * 2.2, s * 0.35, s * 0.8); g.add(q);
    }
  }

  // ====================================================================== материалы
  /** Палитра: o.body, o.accent — краска, o.dark — рама. */
  function palette(o) {
    return {
      body: C.paint(o.body, { roughness: 0.3, metalness: 0.4, envMapIntensity: 0.75 }),
      accent: C.paint(o.accent, { roughness: 0.34, metalness: 0.35, envMapIntensity: 0.7 }),
      rim: o.rimSteel ? C.metal(0xaab0b8) : C.paint(o.rim == null ? o.accent : o.rim, { roughness: 0.34, metalness: 0.35, envMapIntensity: 0.7 }),
      dark: C.pmat(o.dark || 0x30343a, { metalness: 0.5, roughness: 0.55, envMapIntensity: 0.5 }),
      black: C.pmat(0x131416, { metalness: 0.0, roughness: 0.6, envMapIntensity: 0.45 }),
      rubber: C.rubberM(), steel: C.metal(0xaab0b8), chrome: C.chromeM(), lamp: C.lightM(0xfff4d0), amber: C.lightM(0xff9d12), red: C.lightM(0xff2a1a),
      decal: atlasMat(), log: logMat(), chip: C.matte(0xb88b52),
    };
  }

  // ====================================================================== шины и колёса
  /** Box without the bottom face (10 triangles): for tyre lugs. */
  function lugBox(w, h, d) { const g = new T.BoxGeometry(w, h, d).toNonIndexed(), p = g.attributes.position, n = g.attributes.normal, keep = []; for (let f = 0; f < p.count; f += 3) if (n.getY(f) > -0.5) keep.push(f); const np = [], nn = []; for (const f of keep) for (let k = 0; k < 3; k++) { np.push(p.getX(f + k), p.getY(f + k), p.getZ(f + k)); nn.push(n.getX(f + k), n.getY(f + k), n.getZ(f + k)); } const o = new T.BufferGeometry(); o.setAttribute('position', new T.Float32BufferAttribute(np, 3)); o.setAttribute('normal', new T.Float32BufferAttribute(nn, 3)); return o; }
  const _tg = new Map();
  /** Шина (ось X, центр в нуле): покрышка с профилем + грунтозацепы «ёлочкой». o: R, W, rimR, lugs, lugH, N, chev. */
  function tyreGeo(o) {
    const key = [o.R, o.W, o.rimR, o.lugs, o.lugH, o.N, o.chev].join('|'); if (_tg.has(key)) return _tg.get(key);
    const R = o.R, W = o.W, rr = o.rimR, lugs = o.lugs || 0, lh = lugs ? (o.lugH || 0) : 0, Rb = R - lh, H = Rb - rr, N = o.N || 26;
    const half = [[0, 0.43], [0.34, 0.5], [0.84, 0.47], [0.985, 0.37], [1, 0.2], [1, 0]];
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
      const psi = (o.chev == null ? 32 : o.chev) * PI / 180, thick = TAU * Rb / lugs * 0.36, lenA = W * 0.44 / Math.cos(psi), la = W * 0.22, bg = lugBox(lenA, lh + 0.008, thick), q = new T.Quaternion(), m4 = new T.Matrix4(), mb = new T.Matrix4(), one = V3(1, 1, 1);
      for (let i = 0; i < lugs; i++) for (const sd of [-1, 1]) {
        const tt = (i + 0.5) / lugs * TAU + (sd < 0 ? PI / lugs : 0), c = Math.cos(tt), s = Math.sin(tt), rho = Rb - 0.008 + (lh + 0.008) / 2;
        mb.makeBasis(V3(1, 0, 0), V3(0, c, s), V3(0, -s, c)); q.setFromRotationMatrix(mb); q.multiply(new T.Quaternion().setFromAxisAngle(V3(0, 1, 0), sd * psi));
        m4.compose(V3(sd * la, rho * c, rho * s), q, one); parts.push(bg.clone().applyMatrix4(m4));
      }
    }
    const out = parts.length > 1 ? mergeGeos(parts) : parts[0]; _tg.set(key, out); return out;
  }
  const _rg = new Map();
  /** Обод-диск: ось X, наружу +X (side>0) или -X. */
  function rimGeo(rr, W, axis) {
    const key = [rr, W, axis].join('|'); if (_rg.has(key)) return _rg.get(key);
    const hw = W * 0.5, p = [[0, -0.8 * hw], [rr * 0.94, -0.8 * hw], [rr * 0.99, 0.72 * hw], [rr * 1.03, 0.86 * hw], [rr * 0.97, 0.9 * hw], [rr * 0.86, 0.66 * hw], [rr * 0.45, 0.62 * hw], [rr * 0.24, 0.9 * hw], [0, 1.0 * hw]];
    const g = crease(lathe(p, 14, axis), 50); _rg.set(key, g); return g;
  }
  function hubGeo(rr, W, side, nb) {
    const key = ['h', rr, W, side, nb].join('|'); if (_rg.has(key)) return _rg.get(key);
    const ax = side > 0 ? 'x' : 'nx', parts = [lathe([[0, 0], [rr * 0.17, 0], [rr * 0.14, 0.05 * rr], [0, 0.07 * rr]], 12, ax)];
    for (let i = 0; i < nb; i++) { const a = i / nb * TAU, c = new T.CylinderGeometry(rr * 0.045, rr * 0.045, 0.03, 5); c.rotateZ(PI / 2); c.translate(side * 0.005, Math.cos(a) * rr * 0.3, Math.sin(a) * rr * 0.3); parts.push(c); }
    const out = mergeGeos(parts); _rg.set(key, out); return out;
  }
  /** Колесо: шина + обод + ступица. side: +1 наружу к +X, -1 к -X. */
  function wheel(g, P, x, y, z, side, o) {
    put(g, tyreGeo(o), P.rubber, x, y, z);
    put(g, rimGeo(o.rimR, o.W, side > 0 ? 'x' : 'nx'), o.rimMat || P.accent, x, y, z);
    put(g, hubGeo(o.rimR, o.W, side, o.bolts || 6), P.steel, x + side * o.W * 0.45, y, z);
  }
  /** Крыло-арка вокруг оси X: радиус Rf, ширина w, полу-угол a (от верха), вид сверху. */
  const _fg = {};
  function fenderGeo(Rf, w, a, t) {
    const k = [Rf, w, a, t].join('|'); if (_fg[k]) return _fg[k];
    const hw = w / 2, tt = t || 0.035, prof = [[Rf, -hw], [Rf + tt, -hw], [Rf + tt, hw], [Rf, hw], [Rf, -hw]].map((p) => new T.Vector2(p[0], p[1]));
    const g = new T.LatheGeometry(prof, Math.max(6, Math.round(a * 9)), -PI / 2 - a, 2 * a); g.rotateZ(-PI / 2);
    return (_fg[k] = crease(g, 60));
  }

  // ====================================================================== стекло, отделка, регистрация
  function glassQuad(gl, a, b, c, d) {
    const A = toV(a), B = toV(b), Cc = toV(c), D = toV(d), n = B.clone().sub(A).cross(D.clone().sub(A)).normalize();
    const pos = [], nor = [];
    for (const [p, q, r, sgn] of [[A, B, Cc, 1], [A, Cc, D, 1], [A, Cc, B, -1], [A, D, Cc, -1]]) for (const v of [p, q, r]) { pos.push(v.x, v.y, v.z); nor.push(n.x * sgn, n.y * sgn, n.z * sgn); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const m = new T.Mesh(geo, C.glassM(0x7b9bab)); m.castShadow = false; gl.push(m); return m;
  }
  function mergeMeshes(list, material) {
    const pos = [], nor = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    for (const o of list) {
      o.updateMatrix(); const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(o.matrix);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrix); pos.push(v.x, v.y, v.z); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const m = new T.Mesh(geo, material); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; return m;
  }
  /** Склейка: непрозрачное по материалам (bakeTex), стекло одним мешем; zc — какая точка по z станет началом координат (по умолч. центр габарита); s — масштаб. */
  function finish(g, glass, zc, s) {
    if (window.__DBG) { const cnt = {}; g.traverse((o) => { if (o.isMesh) { const k = o.userData.tag || '?'; cnt[k] = (cnt[k] || 0) + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); console.warn('DBG ' + JSON.stringify(cnt)); }
    const out = C.bakeTex(g), root = new T.Group();
    if (glass && glass.length) out.add(mergeMeshes(glass, C.glassM(0x7b9bab)));
    root.add(out);
    const bb = new T.Box3().setFromObject(root); out.position.z = -(zc == null ? (bb.min.z + bb.max.z) / 2 : zc); out.position.x = -(bb.min.x + bb.max.x) / 2 * (zc == null ? 1 : 0);
    if (s && s !== 1) root.scale.setScalar(s);
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

  // ====================================================================== общие узлы: гидроцилиндр, фара, зеркало, лестница, кабина
  /** Гидроцилиндр между проушинами a и b: корпус (краска) + хромированный шток + проушины. r — радиус корпуса. */
  function hyd(g, P, a, b, r, frac, mat) {
    a = toV(a); b = toV(b); const d = b.clone().sub(a), L = d.length(); if (L < 0.05) return;
    const dn = d.clone().normalize(), mid = a.clone().addScaledVector(dn, L * (frac || 0.55));
    rod(g, mat || P.dark, a, mid, r, 14); rod(g, P.steel, mid.clone().addScaledVector(dn, -0.03), mid.clone().addScaledVector(dn, 0.03), r * 1.18, 14);
    rod(g, P.chrome, mid.clone().addScaledVector(dn, -L * 0.18), b, r * 0.5, 10);
    for (const p of [a, b]) cy(g, P.steel, r * 0.8, r * 2.6, p.x, p.y, p.z, 'x', 10);
  }
  /** Фара: корпус + линза (светящаяся). dir: 'z+','z-','x+','x-'. */
  function lamp(g, P, x, y, z, w, h, dir, m) {
    const d = 0.06, hs = dir[0] === 'x', off = (dir[1] === '+' ? 1 : -1) * (d / 2 + 0.001);
    bx(g, P.black, hs ? d : w, h, hs ? w : d, x, y, z);
    bx(g, m || P.lamp, hs ? 0.012 : w * 0.8, h * 0.78, hs ? w * 0.8 : 0.012, x + (hs ? off : 0), y, z + (hs ? 0 : off));
  }
  function mirror(g, P, x, y, z, side, sz) {
    sz = sz || 1;
    rod(g, P.black, V3(x, y, z), V3(x + side * 0.3 * sz, y + 0.05, z + 0.12 * sz), 0.018, 6);
    put(g, rb(0.05, 0.34 * sz, 0.2 * sz, 0.02), P.black, x + side * 0.32 * sz, y + 0.05, z + 0.12 * sz);
    put(g, rb(0.012, 0.3 * sz, 0.17 * sz, 0.004), P.steel, x + side * (0.32 * sz + 0.027), y + 0.05, z + 0.12 * sz);
  }
  /** Ступени с поручнем: от p0 (низ) к p1 (верх), n ступеней, ширина wd (по Z). Ступени — рифлёные пластины. */
  function steps(g, P, x, y0, y1, z, wd, n, rail) {
    for (let i = 0; i < n; i++) { const y = lerp(y0, y1, (i + 1) / n); rbx(g, P.dark, 0.34, 0.05, wd, x, y, z, 0.02); }
    for (const s of [-1, 1]) rod(g, P.steel, V3(x - 0.08, y0 + 0.05, z + s * (wd / 2 - 0.03)), V3(x - 0.08, y1 - 0.02, z + s * (wd / 2 - 0.03)), 0.022, 6);
    if (rail) { rod(g, P.accent, V3(x - 0.14, y1 + 0.95, z - wd / 2 + 0.05), V3(x - 0.14, y1 + 0.05, z - wd / 2 + 0.05), 0.024, 8); rod(g, P.accent, V3(x - 0.14, y1 + 0.95, z - wd / 2 + 0.05), V3(x - 0.14, y1 + 0.95, z + wd / 2 + 0.1), 0.024, 8); rod(g, P.accent, V3(x - 0.14, y1 + 0.95, z + wd / 2 + 0.1), V3(x - 0.14, y0 + 0.55, z + wd / 2 + 0.1), 0.024, 8); }
  }
  /** Кабина лесной машины с панорамным стеклом. o: cz, y0 (пол), w, d, h, tier. Передняя стойка наклонена назад, окно крыши над головой оператора. */
  function cab(g, gl, P, o) {
    tag('cab');
    const w = o.w, d = o.d, h = o.h, y0 = o.y0, cz = o.cz, tier = o.tier || 0, hx = w / 2, zf = cz + d / 2, zb = cz - d / 2, sill = 0.42, yr = y0 + h, yb = y0 + sill, lean = 0.28;
    // основание и нижняя панель
    rbx(g, P.dark, w - 0.08, 0.2, d - 0.08, 0, y0 - 0.1, cz, 0.05);
    rbx(g, P.body, w, sill + 0.04, d, 0, y0 + sill / 2 - 0.02, cz, 0.12);
    // стойки: точки по высоте (передние наклонены назад)
    const at = (sx, front, y) => { const u = (y - yb) / (yr - yb); return V3(sx * (hx - 0.03 - 0.04 * u), y, front ? zf - 0.03 - lean * u : zb + 0.03 + 0.0 * u); };
    for (const s of [-1, 1]) for (const fr of [true, false]) rod(g, P.body, at(s, fr, yb - 0.02), at(s, fr, yr), 0.046, 10);
    // средняя стойка двери (сзади)
    for (const s of [-1, 1]) { const zz = zb + d * 0.36; rod(g, P.black, V3(s * (hx - 0.035), yb, zz), V3(s * (hx - 0.075), yr, zz), 0.022, 6); }
    // крыша: задняя часть глухая, перед — наклонное окно
    const zrf = zf - lean - 0.55;  // перед глухой крыши
    rbx(g, P.body, w + 0.12, 0.13, (zrf - zb) + 0.2, 0, yr + 0.065, (zrf + zb) / 2 - 0.03, 0.06);
    rbx(g, P.accent, w + 0.14, 0.035, 0.26, 0, yr + 0.02, zf - lean + 0.07, 0.015);        // козырёк
    rod(g, P.black, V3(-hx + 0.08, yr, zf - lean), V3(hx - 0.08, yr, zf - lean), 0.025, 6);
    rod(g, P.black, V3(-hx + 0.08, yr, zrf), V3(hx - 0.08, yr, zrf), 0.022, 6);
    for (const s of [-1, 1]) rod(g, P.black, V3(s * (hx - 0.1), yr, zf - lean), V3(s * (hx - 0.1), yr, zrf), 0.022, 6);
    const P3 = (sx, front, y) => at(sx, front, y);
    // стёкла
    glassQuad(gl, V3(-hx + 0.09, yr + 0.02, zrf), V3(hx - 0.09, yr + 0.02, zrf), V3(hx - 0.09, yr, zf - lean), V3(-hx + 0.09, yr, zf - lean)); // окно крыши
    glassQuad(gl, P3(-1, true, yb + 0.06), P3(1, true, yb + 0.06), P3(1, true, yr - 0.02), P3(-1, true, yr - 0.02));                 // лобовое
    glassQuad(gl, P3(-1, false, yb + 0.06), P3(-1, true, yb + 0.06), P3(-1, true, yr - 0.02), P3(-1, false, yr - 0.02));
    glassQuad(gl, P3(1, true, yb + 0.06), P3(1, false, yb + 0.06), P3(1, false, yr - 0.02), P3(1, true, yr - 0.02));
    glassQuad(gl, P3(1, false, yb + 0.06), P3(-1, false, yb + 0.06), P3(-1, false, yr - 0.02), P3(1, false, yr - 0.02));              // заднее
    // защита лобового (FOPS): вертикальные и горизонтальные прутки
    const fy = (y) => zf + 0.025 - lean * ((y - yb) / (yr - yb));
    for (const x of [-0.6, -0.3, 0, 0.3, 0.6].filter((_, i) => tier > 0 || i % 2 === 0)) rod(g, P.black, V3(x * w / 1.4, yb + 0.1, fy(yb + 0.1)), V3(x * w / 1.4, yr - 0.04, fy(yr - 0.04)), 0.014, 5);
    for (const yy of [yb + 0.5, yb + 0.95, yb + 1.4].filter((v) => v < yr - 0.1)) rod(g, P.black, V3(-hx + 0.08, yy, fy(yy)), V3(hx - 0.08, yy, fy(yy)), 0.014, 5);
    // каркас безопасности (ROPS) поверх крыши
    if (tier >= 1) {
      const ty = yr + 0.2, xs = hx + 0.02, zA = zf - lean + 0.1, zB = zb - 0.05;
      for (const [x, z] of [[-xs, zA], [xs, zA], [xs, zB], [-xs, zB]]) { rod(g, P.black, V3(x, yr - 0.1, z), V3(x, ty, z), 0.032, 8); sph(g, P.black, 0.04, x, ty, z); }
      for (const s of [-1, 1]) rod(g, P.black, V3(s * xs, ty, zA), V3(s * xs, ty, zB), 0.03, 8);
      rod(g, P.black, V3(-xs, ty, zA), V3(xs, ty, zA), 0.03, 8); rod(g, P.black, V3(-xs, ty, zB), V3(xs, ty, zB), 0.03, 8);
    }
    // салон: сиденье, подлокотники с джойстиками, пульт
    const sy = y0 + 0.02;
    rbx(g, P.black, 0.52, 0.16, 0.5, 0, sy + 0.38, cz - 0.1, 0.05); rbx(g, P.black, 0.5, 0.7, 0.12, 0, sy + 0.78, cz - 0.38, 0.05, -0.12, 0, 0); rbx(g, P.black, 0.3, 0.2, 0.08, 0, sy + 1.25, cz - 0.42, 0.04, -0.12, 0, 0);
    cy(g, P.dark, 0.05, 0.3, 0, sy + 0.17, cz - 0.1);
    for (const s of [-1, 1]) { rbx(g, P.black, 0.12, 0.1, 0.5, s * 0.34, sy + 0.66, cz + 0.02, 0.04); rod(g, P.black, V3(s * 0.34, sy + 0.7, cz + 0.1), V3(s * 0.34, sy + 0.88, cz + 0.12), 0.016, 5); }
    rbx(g, P.black, w - 0.3, 0.46, 0.3, 0, y0 + 0.28, zf - 0.34, 0.06); rbx(g, P.black, 0.3, 0.2, 0.05, 0.12, y0 + 0.66, zf - 0.32, 0.02, -0.3, 0, 0);
    // козырёк и зеркала, дворники
    for (const sx of [-0.3, 0.25]) rod(g, P.black, V3(sx, yb + 0.15, fy(yb + 0.15) + 0.02), V3(sx + 0.36, yr - 0.3, fy(yr - 0.3) + 0.02), 0.009, 4);
    for (const s of [-1, 1]) mirror(g, P, s * (hx + 0.03), yr - 0.45, zf - lean * 0.6, s, 1);
    // свет на крыше
    const nl = [2, 4, 6][tier], lz = zf - lean + 0.17, ly = yr + 0.1;
    for (let i = 0; i < nl; i++) lamp(g, P, (i - (nl - 1) / 2) * ((w - 0.3) / Math.max(1, nl - 1)), ly, lz, 0.2, 0.1, 'z+');
    if (tier >= 1) for (const s of [-1, 1]) lamp(g, P, s * (hx + 0.1), yr + 0.1, zf - lean - 0.5, 0.16, 0.09, s > 0 ? 'x+' : 'x-', P.amber);
    for (const s of [-1, 1]) lamp(g, P, s * (w * 0.34), yr + 0.1, zb - 0.1, 0.16, 0.09, 'z-');
    if (tier >= 1) { cy(g, P.black, 0.08, 0.05, hx - 0.2, yr + 0.32, zb + 0.2, 'y', 14, 0.09); put(g, lathe([[0, 0], [0.07, 0], [0.07, 0.05], [0.05, 0.1], [0, 0.12]], 12), P.amber, hx - 0.2, yr + 0.345, zb + 0.2); }
    if (tier >= 1) { rbx(g, P.dark, 0.7, 0.14, 0.5, 0, yr + 0.2, zb + 0.3, 0.05); }
    if (tier >= 2) { sph(g, P.dark, 0.1, 0, yr + 0.3, zb + 0.35, 1, 0.7, 1, 12); rod(g, P.black, V3(-hx + 0.2, yr + 0.2, zb + 0.15), V3(-hx + 0.22, yr + 0.95, zb + 0.17), 0.008, 4); }
  }

  // ====================================================================== шасси: сочленённая рама, колёса, боги, крылья
  /** o: R, Wt, rimR, xw (колея), axF/axR (z осей: 1 ось или 2 в боге), zB (передний бампер), zE (задний край), zP (шарнир), fenderMat. */
  function carrier(g, P, o) {
    const { R, Wt, rimR, xw, axF, axR, zB, zE, zP } = o;
    tag('wheels');
    const wo = { R, W: Wt, rimR, lugs: o.lugs || 13, lugH: o.lugH || 0.08, N: 26, chev: 30, bolts: 6, rimMat: P.rim };
    for (const z of axF.concat(axR)) for (const s of [-1, 1]) wheel(g, P, s * xw, R, z, s, wo);
    tag('chassis');
    const fy = 1.17, fh = 0.52, zFa = zB - 0.3, zFb = zP + 0.3, zRa = zP - 0.3, zRb = zE + 0.3, hubX = xw - Wt / 2;
    rbx(g, P.dark, 1.3, fh, zFa - zFb, 0, fy, (zFa + zFb) / 2, 0.1); rbx(g, P.dark, 1.3, fh, zRa - zRb, 0, fy, (zRa + zRb) / 2, 0.1);
    // центральный шарнир и цилиндры поворота
    cy(g, P.steel, 0.3, 0.9, 0, fy, zP, 'y', 24); cy(g, P.dark, 0.4, 0.1, 0, fy + 0.36, zP, 'y', 24); cy(g, P.dark, 0.4, 0.1, 0, fy - 0.36, zP, 'y', 24);
    for (const s of [-1, 1]) hyd(g, P, V3(s * 0.74, fy + 0.02, zP + 0.52), V3(s * 0.52, fy + 0.02, zP - 0.6), 0.055, 0.5);
    // мосты и боги
    const single = (z) => { cy(g, P.dark, 0.14, 2 * hubX + 0.1, 0, R, z, 'x', 16); sph(g, P.dark, 0.3, 0, R + 0.02, z, 1, 0.8, 1, 16); for (const s of [-1, 1]) cy(g, P.dark, 0.21, 0.24, s * (hubX - 0.02), R, z, 'x', 16); };
    const bogie = (zs) => {
      const zm = (zs[0] + zs[1]) / 2, len = Math.abs(zs[0] - zs[1]) + 0.62;
      for (const s of [-1, 1]) { rbx(g, P.dark, 0.26, 0.5, len, s * (hubX - 0.14), R, zm, 0.1); for (const z of zs) cy(g, P.dark, 0.21, 0.24, s * (hubX - 0.02), R, z, 'x', 16); cy(g, P.steel, 0.1, 0.34, s * (hubX - 0.28), R, zm, 'x', 14); }
      cy(g, P.dark, 0.15, 2 * (hubX - 0.14) + 0.1, 0, R + 0.1, zm, 'x', 16);
    };
    [axF, axR].forEach((a) => (a.length === 1 ? single(a[0]) : bogie(a)));
    // крылья над колёсами (арки) и перемычка между колёсами бога
    const fm = o.fenderMat || P.body, Rf = R + 0.07, fw = Wt + 0.14;
    for (const a of [axF, axR]) {
      for (const z of a) for (const s of [-1, 1]) put(g, fenderGeo(Rf, fw, 1.15, 0.04), fm, s * xw, R, z);
      if (a.length > 1) for (const s of [-1, 1]) rbx(g, fm, fw, 0.045, Math.abs(a[0] - a[1]), s * xw, R + Rf + 0.02, (a[0] + a[1]) / 2, 0.02);
    }
    // бампер, фаркоп
    rbx(g, P.dark, 2.1, 0.4, 0.34, 0, 1.02, zB - 0.12, 0.14); decalZ(g, 'hazY', 1.9, 0.22, 0, 1.02, zB + 0.053, 1);
    rbx(g, P.dark, 1.9, 0.36, 0.3, 0, 1.05, zE + 0.1, 0.12); decalZ(g, 'hazY', 1.7, 0.2, 0, 1.05, zE - 0.054, -1);
    for (const s of [-1, 1]) { lamp(g, P, s * 0.82, 1.06, zB + 0.06, 0.2, 0.12, 'z+'); lamp(g, P, s * 0.82, 1.08, zE - 0.06, 0.2, 0.1, 'z-', P.red); }
  }

  // ====================================================================== кран: турель, стрела, рукоять, телескоп, цилиндры, шланги
  /** o: zT (турель), y0 (верх рамы), dir (+1 вперёд, -1 назад), k (масштаб стрелы), reachJ (рукоять), extL (телескоп), tier. Возвращает ключевые точки. */
  function crane(g, P, o) {
    tag('crane');
    const zT = o.zT, y0 = o.y0, sd = o.dir || 1, k = o.k, tier = o.tier, body = o.bodyMat || P.body, Z = (dz) => zT + sd * dz;
    cy(g, P.dark, 0.5, 0.14, 0, y0 + 0.07, zT, 'y', 28); cy(g, P.steel, 0.42, 0.1, 0, y0 + 0.19, zT, 'y', 28);
    rbx(g, body, 1.0, 0.8, 1.1, 0, y0 + 0.64, Z(-0.02), 0.22);
    rbx(g, P.dark, 0.64, 0.06, 0.7, 0, y0 + 1.05, Z(-0.2), 0.03);
    const J0 = V3(0, y0 + 1.0, Z(0.3));
    for (const s of [-1, 1]) rbx(g, P.dark, 0.08, 0.5, 0.42, s * 0.26, y0 + 0.9, Z(0.22), 0.03);
    cy(g, P.steel, 0.07, 0.66, 0, J0.y, J0.z, 'x', 12);
    // стрела 1 (подъёмная, изогнутая)
    const J1 = V3(0, J0.y + 1.7 * k, Z(0.3 + 1.9 * k));
    const c1 = new T.CatmullRomCurve3([V3(0, J0.y - 0.05, Z(0.02)), V3(0, J0.y + 0.55 * k, Z(0.15 + 0.2 * k)), V3(0, J0.y + 1.25 * k, Z(0.3 + 1.05 * k)), J1], false, 'catmullrom', 0.5);
    put(g, sweepGeo(c1.getPoints(14), (t) => ({ w: 0.4 - 0.07 * t, h: 0.64 - 0.24 * t, r: 0.09 })), body, 0, 0, 0);
    // рукоять 2
    const rj = o.reachJ, J2 = V3(0, J1.y - 0.24 * rj, J1.z + sd * rj), dj = J2.clone().sub(J1).normalize();
    const jp = []; for (let i = 0; i <= 6; i++) jp.push(J1.clone().addScaledVector(dj, -0.32).lerp(J2, 0).addScaledVector(dj, (rj + 0.32) * i / 6));
    put(g, sweepGeo(jp, (t) => ({ w: 0.34 - 0.04 * t, h: 0.52 - 0.12 * t, r: 0.08 })), body, 0, 0, 0);
    // телескопическая секция
    const J3 = J2.clone().addScaledVector(dj, o.extL), ep = []; for (let i = 0; i <= 4; i++) ep.push(J2.clone().addScaledVector(dj, -0.9 + (o.extL + 0.9) * i / 4));
    put(g, sweepGeo(ep, () => ({ w: 0.25, h: 0.3, r: 0.06 })), P.dark, 0, 0, 0);
    rbx(g, P.steel, 0.3, 0.38, 0.18, 0, J2.y, J2.z, 0.04, -Math.atan2(dj.y, Math.abs(dj.z)) * sd * 0 + 0, 0, 0).quaternion.copy(quatDir(dj, UP));
    cy(g, P.steel, 0.17, 0.5, 0, J1.y, J1.z, 'x', 18); cy(g, P.steel, 0.12, 0.4, 0, J3.y, J3.z, 'x', 14);
    // предупреждающие полосы на конце телескопа
    if (tier >= 1) for (const s of [-1, 1]) decal(g, 'hazY', 0.55, 0.22, J3.clone().addScaledVector(dj, -0.42).add(V3(s * 0.126, 0, 0)), dj.clone().multiplyScalar(1), V3(s, 0, 0));
    // гидроцилиндры: подъём (двойной), наклон рукояти
    const up = (v) => V3(0, v.z, -v.y);
    for (const s of [-1, 1]) {
      const pb = c1.getPoint(0.5), tb = c1.getTangent(0.5), ub = up(tb).normalize();
      hyd(g, P, V3(s * 0.27, y0 + 0.5, Z(0.5)), V3(s * 0.27, pb.y - ub.y * 0.2, pb.z - ub.z * 0.2), 0.065, 0.55);
    }
    { const pa = c1.getPoint(0.74), ta = c1.getTangent(0.74), ua = up(ta).normalize(), pbj = J1.clone().addScaledVector(dj, 0.5), ub = up(dj).normalize();
      const A = V3(0, pa.y + ua.y * 0.34, pa.z + ua.z * 0.34), B = V3(0, pbj.y + ub.y * 0.3, pbj.z + ub.z * 0.3);
      hyd(g, P, A, B, 0.06, 0.5); bar(g, P.steel, pa, A, 0.1, 0.06); bar(g, P.steel, pbj, B, 0.1, 0.06); }
    // шланги вдоль стрелы
    for (const [xo, yo] of [[0.25, 0.2], [-0.25, 0.2], [0.25, -0.1]].slice(0, tier >= 1 ? 3 : 2)) {
      const pts = [V3(xo, y0 + 1.05, Z(-0.15)), c1.getPoint(0.3).add(V3(xo, yo * 0.6, 0)), c1.getPoint(0.7).add(V3(xo, yo * 0.7, 0)), V3(xo, J1.y + yo * 0.7, J1.z), J1.clone().addScaledVector(dj, rj * 0.5).add(V3(xo, yo * 0.7, 0)), J2.clone().add(V3(xo * 0.8, 0.22, 0)), J3.clone().add(V3(xo * 0.6, -0.1, 0))];
      hose(g, P.black, pts, 0.03, 40, 6);
    }
    // рабочие фары на стреле
    const nl = [0, 2, 4][tier]; for (let i = 0; i < nl; i++) lamp(g, P, (i % 2 ? 1 : -1) * 0.12, (i < 2 ? J1.y + 0.36 : J2.y + 0.3), (i < 2 ? J1.z : J2.z - sd * 0.2), 0.15, 0.09, sd > 0 ? 'z+' : 'z-');
    return { J0, J1, J2, J3, dj };
  }

  // ====================================================================== харвестерная головка
  /** Головка: начало в шарнире на конце крана; ось бревна на y=-1.0*hs вдоль Z. hm — краска корпуса. */
  function harvHead(P, hs, hm, tier, rnd) {
    const H = new T.Group(), ya = -1.0 * hs, S = (v) => v * hs;
    tag('head');
    // ротатор и наклонная серьга
    cy(H, P.steel, S(0.17), S(0.3), 0, S(-0.14), 0, 'y', 20); cy(H, P.dark, S(0.2), S(0.08), 0, S(0.02), 0, 'y', 20);
    rbx(H, P.dark, S(0.36), S(0.2), S(0.4), 0, S(-0.34), 0, S(0.06));
    for (const s of [-1, 1]) rbx(H, P.dark, S(0.07), S(0.34), S(0.4), s * S(0.18), S(-0.52), 0, S(0.02));
    cy(H, P.steel, S(0.05), S(0.5), 0, S(-0.6), 0, 'x', 10);
    // щёки и верхняя балка
    for (const s of [-1, 1]) put(H, ex([[S(-0.62), ya - S(0.38)], [S(0.46), ya - S(0.42)], [S(0.6), ya + S(0.0)], [S(0.3), ya + S(0.5)], [S(-0.5), ya + S(0.55)]], S(0.09), { plane: 'zy', r: S(0.12), b: 0.012, q: 1 }), hm, s * S(0.62), 0, 0);
    rbx(H, hm, S(1.3), S(0.24), S(1.15), 0, ya + S(0.5), S(-0.05), S(0.07));
    rbx(H, P.dark, S(0.5), S(0.12), S(0.3), 0, ya + S(0.34), S(-0.55), S(0.04));
    // подающие вальцы (вертикальные оси) с шипами
    const roller = (x, z, r, hgt, rows) => {
      cy(H, P.dark, r, hgt, x, ya, z, 'y', 18);
      cy(H, P.steel, r * 0.7, hgt + S(0.05), x, ya, z, 'y', 12);
      for (const yy of [-1, 1]) cy(H, P.black, r * 1.04, S(0.03), x, ya + yy * hgt * 0.5, z, 'y', 18);
      const n = 12; for (let rr = 0; rr < rows; rr++) for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rr * 0.26, d = V3(Math.cos(a), 0, Math.sin(a)), m = mk(cylG(0, S(0.032), S(0.085), 5), P.steel, x + d.x * r, ya + (rows === 1 ? 0 : (rr - 0.5) * hgt * 0.5), z + d.z * r); m.quaternion.setFromUnitVectors(UP, d); H.add(m);
      }
    };
    for (const s of [-1, 1]) roller(s * S(0.37), S(0.12), S(0.2), S(0.44), 2);
    if (tier >= 1) for (const s of [-1, 1]) roller(s * S(0.345), S(-0.36), S(0.15), S(0.38), 1);
    // ножи (кольца обрезки сучьев)
    for (const z of [S(0.58), S(-0.68)]) { put(H, new T.TorusGeometry(S(0.27), S(0.04), 6, 16, PI), P.steel, 0, ya, z); put(H, new T.TorusGeometry(S(0.27), S(0.04), 6, 16, PI), hm, 0, ya, z, 0, 0, PI); }
    // пильная шина с цепью
    rbx(H, hm, S(0.5), S(0.22), S(0.36), 0, ya - S(0.34), S(-0.3), S(0.06));
    put(H, ex(null, S(0.03), { shape: rshape([[0, S(-0.095)], [S(0.62), S(-0.095)], [S(0.62), S(0.095)], [0, S(0.095)]], S(0.09)), b: 0.004, plane: 'xz', q: 0 }), P.black, S(-0.12), ya - S(0.255), S(-0.3));
    put(H, ex(null, S(0.034), { shape: rshape([[0, S(-0.07)], [S(0.58), S(-0.07)], [S(0.58), S(0.07)], [0, S(0.07)]], S(0.065)), b: 0.004, plane: 'xz', q: 0 }), P.steel, S(-0.1), ya - S(0.255), S(-0.3));
    // гидроцилиндры рычагов вальцов, измерительное колесо, фара
    for (const s of [-1, 1]) hyd(H, P, V3(s * S(0.5), ya + S(0.5), S(0.0)), V3(s * S(0.44), ya + S(0.12), S(0.28)), S(0.036), 0.5);
    cy(H, P.rubber, S(0.1), S(0.07), S(0.0), ya + S(0.27), S(0.5), 'x', 14); rod(H, P.dark, V3(0, ya + S(0.28), S(0.5)), V3(0, ya + S(0.5), S(0.3)), S(0.03), 6);
    if (tier >= 1) lamp(H, P, 0, ya + S(0.5), S(0.55), S(0.24), S(0.1), 'z+');
    for (const s of [-1, 1]) decalX(H, 'p6', S(0.5), S(0.15), s * S(0.668), ya + S(0.12), S(-0.05), s);
    return H;
  }

  // ====================================================================== ХАРВЕСТЕР (vehicle/logger)
  function buildHarvester(opts) {
    const lv = lvOf(opts), tier = lv <= 3 ? 0 : lv <= 6 ? 1 : 2, eight = lv >= 7, t10 = (lv - 1) / 9;
    const SC = [0.80, 0.84, 0.88, 0.90, 0.94, 0.98, 0.98, 1.02, 1.05, 1.08][lv - 1];
    const P = palette(tier === 2 ? { body: 0xee6a14, accent: 0x18191c, dark: 0x2c2f35, rimSteel: true } : tier === 1 ? { body: 0x1f7a3b, accent: 0xf3c418 } : { body: 0x34963f, accent: 0xf1c40f });
    const g = new T.Group(), gl = [], rnd = lcg(1000 + lv * 31 + (opts.seed | 0) * 7);
    const R = tier === 2 ? 0.76 : 0.70, Wt = tier === 2 ? 0.72 : 0.64, rimR = tier === 2 ? 0.4 : 0.37, xw = 1.2;
    const axF = eight ? [3.25, 1.65] : [2.5], axR = eight ? [-1.75, -3.35] : [-1.55, -3.15];
    const zB = eight ? 4.5 : 3.75, zE = eight ? -4.5 : -4.25, zP = -0.05, fenderMat = tier === 2 ? P.accent : P.body;
    carrier(g, P, { R, Wt, rimR, xw, axF, axR, zB, zE, zP, fenderMat });
    // палубы
    tag('deck');
    const dy = 1.585; rbx(g, P.dark, 2.3, 0.07, (zB - 0.12) - (zP + 0.16), 0, dy, ((zB - 0.12) + (zP + 0.16)) / 2, 0.03); rbx(g, P.dark, 2.3, 0.07, (zP - 0.16) - (zE + 0.1), 0, dy, ((zP - 0.16) + (zE + 0.1)) / 2, 0.03);
    // баки и ступени
    tag('tanks');
    const zf0 = axR[0] + R + 0.12, zf1 = axF[axF.length - 1] - R - 0.12, zmid = (zf0 + zf1) / 2;
    rbx(g, P.accent, 0.5, 0.7, Math.min(1.5, zf1 - zf0 - 0.2), 1.04, 1.17, zmid + 0.1, 0.12); cy(g, P.steel, 0.07, 0.06, 1.04, 1.55, zmid + 0.4, 'y', 12); decalX(g, 'warn', 0.3, 0.3, 1.294, 1.17, zmid + 0.1, 1);
    rbx(g, P.accent, 0.5, 0.62, 1.0, -1.04, 1.13, zf0 + 0.7, 0.12); cy(g, P.steel, 0.06, 0.06, -1.04, 1.47, zf0 + 0.7, 'y', 12);
    steps(g, P, -1.42, 0.12, 1.55, zf1 - 0.45, 0.7, 3, true);
    // кабина
    const cabD = 1.85, cabZ0 = eight ? 0.2 : 0.05, cabY = 1.8;
    cab(g, gl, P, { cz: cabZ0 + cabD / 2, y0: cabY, w: 1.8, d: cabD, h: tier === 0 ? 1.85 : 1.95, tier });
    // капот двигателя
    tag('hood');
    const hz1 = zP - 0.5, hz0 = zE + 0.05, hp = [[hz0, 1.62], [hz0, 2.7], [hz0 + 0.34, 2.98], [hz1 - 1.2, 2.98], [hz1 - 0.25, 2.5], [hz1, 2.42], [hz1, 1.62]];
    put(g, ex(hp, 2.0, { plane: 'zy', r: [0.04, 0.3, 0.3, 0.4, 0.14, 0.05, 0.04], b: 0.05, q: 2 }), P.body, 0, 0, 0);
    const hm = (hz0 + hz1) / 2, hl = hz1 - hz0;
    for (const s of [-1, 1]) {
      decalX(g, tier === 2 ? 'band1' : 'band2', hl * 0.9, 0.16, s * 1.003, 2.0, hm, s); decalX(g, 'grid', Math.min(1.7, hl * 0.5), 0.5, s * 1.003, 2.55, hm - 0.1, s);
      if (tier >= 1) decalX(g, tier === 2 ? 'p1' : 'p4', 1.0, 0.26, s * 1.003, 2.0 - 0.28, hm + hl * 0.12, s);
    }
    decalZ(g, 'grid', 1.5, 0.95, 0, 2.15, hz0 - 0.003, -1); decalZ(g, 'logo', 0.3, 0.3, 0.55, 2.62, hz0 - 0.003, -1);
    // выхлоп, воздухозаборник, глушитель
    cy(g, P.steel, 0.17, 0.5, -0.62, 3.2, hz0 + 0.8, 'y', 18); rod(g, P.chrome, V3(-0.62, 3.4, hz0 + 0.8), V3(-0.62, 4.0, hz0 + 0.8), 0.062, 14); cy(g, P.dark, 0.1, 0.05, -0.62, 4.03, hz0 + 0.8, 'y', 14);
    rod(g, P.black, V3(0.7, 2.95, hz0 + 1.05), V3(0.7, 3.55, hz0 + 1.05), 0.085, 12); cy(g, P.black, 0.12, 0.09, 0.7, 3.6, hz0 + 1.05, 'y', 14, 0.06);
    if (tier >= 1) { rbx(g, P.accent, 0.5, 0.4, 0.9, 1.08, 2.26, zE + 1.3, 0.1); rbx(g, P.accent, 0.5, 0.4, 0.9, -1.08, 2.26, zE + 1.3, 0.1); }
    if (tier >= 2) { cy(g, P.dark, 0.2, 1.1, 0, 2.0, zE - 0.14, 'x', 18); for (const s of [-1, 1]) cy(g, P.steel, 0.27, 0.05, s * 0.58, 2.0, zE - 0.14, 'x', 18); }
    // кран и головка
    const zT = eight ? 3.1 : 2.45, k = lerp(0.82, 1.0, t10), cr = crane(g, P, { zT, y0: 1.62, dir: 1, k, reachJ: lerp(1.8, 3.1, t10), extL: lerp(1.1, 2.0, t10), tier });
    const hs = lerp(0.82, 1.05, t10), head = harvHead(P, hs, tier === 2 ? P.body : P.accent, tier, rnd);
    head.position.copy(cr.J3).add(V3(0, -0.05, 0.0)); head.rotation.x = -0.28; g.add(head);
    // удерживаемое бревно
    tag('log');
    const Ll = lerp(2.6, 3.6, t10), lg = mk(logGeo(0.2 * hs * 1.02, 0.15 * hs, Ll, 14, 1, 1, 3), P.log, 0, -1.0 * hs, Ll * 0.2); head.add(lg);
    // передняя крышка, фары
    tag('front');
    rbx(g, P.body, 1.9, 0.4, 0.9, 0, 1.85, zB - 0.65, 0.14); decalZ(g, 'p1', 0.8, 0.2, 0, 1.85, zB - 0.2 + 0.003, 1);
    for (const s of [-1, 1]) lamp(g, P, s * 0.7, 1.98, zB - 0.19, 0.24, 0.1, 'z+');
    return finish(g, gl, (zB + zE) / 2, SC);
  }
  reg('vehicle', 'logger', buildHarvester);

  // ====================================================================== грейфер, стойки, коники (форвардер, лесовоз)
  /** Грейфер на роторе: начало = конец стрелы, центр колец челюстей на y = -1.12*s. ld — держит пачку брёвен. */
  function grapple(P, s, rnd, hm, ld) {
    const H = new T.Group(), S = (v) => v * s, yc = S(-1.12);
    tag('grapple');
    cy(H, P.steel, S(0.15), S(0.34), 0, S(-0.14), 0, 'y', 18); cy(H, P.dark, S(0.2), S(0.07), 0, S(0.05), 0, 'y', 18);
    rbx(H, hm, S(0.46), S(0.28), S(0.5), 0, S(-0.4), 0, S(0.07));
    cy(H, P.steel, S(0.045), S(0.78), 0, S(-0.47), 0, 'x', 10);
    const R = S(0.52), tb = S(0.05), tg = new T.TorusGeometry(R, tb, 7, 15, 2.97);
    for (const sd of [-1, 1]) {
      for (const z of [-S(0.34), S(0.34)]) put(H, tg, hm, 0, yc, z, 0, 0, sd > 0 ? -1.83 : 2.0);
      for (const z of [-S(0.34), S(0.34)]) { rod(H, P.dark, V3(sd * S(0.22), yc + S(0.47), z), V3(sd * S(0.34), S(-0.47), z * 0.55), S(0.035), 8); }
      rod(H, hm, V3(sd * S(0.36), S(-0.47), -S(0.34)), V3(sd * S(0.36), S(-0.47), S(0.34)), S(0.05), 8);
      hyd(H, P, V3(sd * S(0.12), S(-0.5), 0), V3(sd * S(0.4), yc + S(0.36), 0), S(0.03), 0.5);
      for (const z of [-S(0.34), S(0.34)]) { cy(H, P.steel, S(0.06), S(0.06), sd * R * Math.cos(-1.83 + 0.0) * 0 + sd * S(0.4) * 0, yc - R + S(0.0), z, 'x', 8); }
    }
    if (ld) {
      const spec = [[-0.28, -0.12, 0.16], [0.28, -0.12, 0.16], [0, -0.15, 0.15], [-0.15, 0.16, 0.14], [0.15, 0.16, 0.15]];
      for (const [x, y, r] of spec) { const L = S(2.2 + rnd() * 0.9); put(H, logGeo(S(r) * 1.05, S(r) * 0.95, L, 10, (rnd() * 4) | 0, (rnd() * 4) | 0, (rnd() * 4) | 0), P.log, S(x), yc + S(y), (rnd() - 0.5) * S(0.5)).rotation.z = rnd() * TAU; }
    }
    return H;
  }
  /** Стойка коника: гнездо + наклонённая вовне труба-стойка + колпачок. */
  function stake(g, P, x, y0, z, h, side, mat) {
    const tilt = 0.045;
    rbx(g, P.dark, 0.2, 0.34, 0.22, x, y0 + 0.17, z, 0.05);
    rbx(g, mat, 0.1, h, 0.15, x + side * h * 0.5 * tilt, y0 + h / 2, z, 0.04, 0, 0, -side * tilt);
    rbx(g, P.dark, 0.15, 0.08, 0.19, x + side * h * tilt, y0 + h, z, 0.03);
  }
  /** Коник (грузовая платформа со стойками): z0 — перед, z1 — зад, y — верх пола, x — полуширина, n пар стоек, h — высота стоек, bulk — защитный щит спереди. */
  function bunk(g, P, o) {
    const L = o.z0 - o.z1, zc = (o.z0 + o.z1) / 2, x = o.x, mat = o.mat || P.accent;
    rbx(g, P.dark, x * 2 + 0.5, 0.12, L + 0.2, 0, o.y - 0.06, zc, 0.04);
    for (const sd of [-1, 1]) rbx(g, P.dark, 0.2, 0.22, L + 0.3, sd * (x + 0.12), o.y - 0.2, zc, 0.06);
    for (let i = 0; i < o.n; i++) { const z = o.z0 - (i + 0.5) * L / o.n; for (const sd of [-1, 1]) stake(g, P, sd * (x + 0.12), o.y - 0.0, z, o.h, sd, mat); }
    if (o.bulk) {
      const zb = o.z0 + 0.02, hh = o.bulk;
      for (const sd of [-1, 1]) rbx(g, mat, 0.12, hh, 0.14, sd * (x - 0.05), o.y + hh / 2, zb, 0.04);
      for (const yy of [0.3, 0.8, 1.3, hh - 0.08]) if (yy < hh) rbx(g, mat, 2 * (x - 0.05), 0.09, 0.1, 0, o.y + yy, zb, 0.03);
      for (let i = -3; i <= 3; i++) rod(g, P.dark, V3(i * x * 0.28, o.y + 0.1, zb), V3(i * x * 0.28, o.y + hh - 0.1, zb), 0.02, 6);
    }
  }
  /** Нагрузка брёвнами между стойками. */
  function loadLogs(g, P, rnd, o) { tag('logs'); return logPile(g, P, rnd, o); }

  // ====================================================================== ФОРВАРДЕР (vehicle/forwarder)
  function buildForwarder(opts) {
    const lv = lvOf(opts), tier = lv <= 3 ? 0 : lv <= 6 ? 1 : 2, t10 = (lv - 1) / 9;
    const SC = [0.80, 0.84, 0.88, 0.91, 0.95, 0.99, 1.0, 1.03, 1.06, 1.09][lv - 1];
    const P = palette(tier === 2 ? { body: 0xee6a14, accent: 0x18191c, dark: 0x2c2f35, rimSteel: true } : tier === 1 ? { body: 0x1f7a3b, accent: 0xf3c418 } : { body: 0x34963f, accent: 0xf1c40f });
    const g = new T.Group(), gl = [], rnd = lcg(2000 + lv * 37 + (opts.seed | 0) * 7);
    const R = tier === 2 ? 0.78 : 0.72, Wt = tier === 2 ? 0.76 : 0.68, rimR = tier === 2 ? 0.42 : 0.38, xw = 1.22;
    const bunkL = lerp(4.4, 5.9, t10), zP = -0.55, bz0 = -0.95, bz1 = bz0 - bunkL, zB = 4.55, zE = bz1 - 0.5;
    const axF = [3.15, 1.55], axR = [zE + 3.35, zE + 1.75], fenderMat = tier === 2 ? P.accent : P.body;
    carrier(g, P, { R, Wt, rimR, xw, axF, axR, zB, zE, zP, fenderMat });
    tag('deck');
    rbx(g, P.dark, 2.3, 0.07, (zB - 0.12) - (zP + 0.16), 0, 1.585, ((zB - 0.12) + (zP + 0.16)) / 2, 0.03);
    // баки, ступени
    tag('tanks');
    rbx(g, P.accent, 0.5, 0.7, 1.3, 1.04, 1.17, -1.05, 0.12); cy(g, P.steel, 0.07, 0.06, 1.04, 1.55, -0.7, 'y', 12); decalX(g, 'warn', 0.3, 0.3, 1.294, 1.17, -1.05, 1);
    rbx(g, P.accent, 0.5, 0.62, 1.1, -1.04, 1.13, -1.05, 0.12); cy(g, P.steel, 0.06, 0.06, -1.04, 1.47, -0.7, 'y', 12);
    steps(g, P, -1.42, 0.12, 1.55, 0.3, 0.7, 3, true);
    // кабина (впереди)
    const cabD = 1.85, cabZ = 2.85;
    cab(g, gl, P, { cz: cabZ, y0: 1.8, w: 1.8, d: cabD, h: tier === 0 ? 1.85 : 1.95, tier });
    // капот двигателя за кабиной
    tag('hood');
    const hp = [[0.3, 1.62], [0.3, 2.45], [0.55, 2.75], [1.2, 2.75], [1.85, 2.4], [1.85, 1.62]], hz = 1.07;
    put(g, ex(hp, 1.7, { plane: 'zy', r: [0.04, 0.26, 0.26, 0.34, 0.06, 0.04], b: 0.05, q: 2 }), P.body, 0, 0, 0);
    for (const s of [-1, 1]) {
      decalX(g, tier === 2 ? 'band1' : 'band2', 1.4, 0.14, s * 0.853, 1.98, hz, s); decalX(g, 'grid', 1.05, 0.48, s * 0.853, 2.38, hz, s);
      if (tier >= 1) decalX(g, tier === 2 ? 'p2' : 'p4', 0.95, 0.24, s * 0.853, 1.74, hz + 0.1, s);
    }
    cy(g, P.steel, 0.16, 0.5, -0.55, 2.95, 0.7, 'y', 18); rod(g, P.chrome, V3(-0.55, 3.15, 0.7), V3(-0.55, 3.9, 0.7), 0.06, 14); cy(g, P.dark, 0.1, 0.05, -0.55, 3.92, 0.7, 'y', 14);
    rod(g, P.black, V3(0.55, 2.7, 1.2), V3(0.55, 3.3, 1.2), 0.08, 12); cy(g, P.black, 0.12, 0.09, 0.55, 3.35, 1.2, 'y', 14, 0.06);
    // кран на пьедестале + грейфер
    const y0c = 2.0;
    cy(g, P.dark, 0.5, y0c - 1.45, 0, (y0c + 1.45) / 2, -0.3, 'y', 24);
    const cr = crane(g, P, { zT: -0.3, y0: y0c, dir: 1, k: lerp(0.95, 1.2, t10), reachJ: lerp(2.0, 3.0, t10), extL: lerp(1.2, 1.9, t10), tier });
    const gs = lerp(0.88, 1.12, t10), gr = grapple(P, gs, rnd, tier === 2 ? P.body : P.accent, true); gr.position.copy(cr.J3); g.add(gr);
    // коник с брёвнами
    const bx0 = 1.3, hmax = lerp(1.35, 2.1, t10), bY = 1.82, nst = tier === 0 ? 3 : 4;
    tag('bunk'); bunk(g, P, { z0: bz0, z1: bz1, y: bY, x: bx0, n: nst, h: hmax + 0.4, mat: P.accent, bulk: tier >= 1 ? hmax + 0.6 : 0 });
    loadLogs(g, P, rnd, { x0: -bx0 + 0.04, x1: bx0 - 0.04, y0: bY, hmax, zc: (bz0 + bz1) / 2 - 0.05, len: bunkL * 0.96, rmin: lerp(0.12, 0.15, t10), rmax: lerp(0.2, 0.26, t10), seg: 10, ragged: true });
    // передний бампер-крышка и фары
    tag('front');
    rbx(g, P.body, 1.9, 0.34, 0.8, 0, 1.78, zB - 0.5, 0.12); decalZ(g, 'p2', 0.8, 0.2, 0, 1.78, zB - 0.1 + 0.003, 1);
    for (const s of [-1, 1]) lamp(g, P, s * 0.7, 1.9, zB - 0.09, 0.24, 0.1, 'z+');
    return finish(g, gl, (zB + zE) / 2, SC);
  }
  reg('vehicle', 'forwarder', buildForwarder);

  // @@MODELS@@
})();
