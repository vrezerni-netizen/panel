/* 3D-мир игры «Ферма и Город»: город с дорогами и зданиями + ферма с грядками, животными и техникой.
   Только отрисовка (Three.js r128). Логика игры живёт в logic.js. */
(function (root) {
  'use strict';
  const T = root.THREE;
  const L = root.FarmLogic;

  const matCache = {};
  const mat = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); return matCache[k] || (matCache[k] = new T.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o || {}))); };
  // ---- реалистичные текстуры (необязательные: если textures.js нет, рисуются цвета)
  const TEX = root.FARM_TEXTURES || {};
  const PROC = {
    roof_tile(c, g) { // красная черепица рядами
      g.fillStyle = '#9c3d27'; g.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 9; r++) for (let i = -1; i < 9; i++) {
        const x = i * 32 + (r % 2) * 16, y = r * 30, k = (Math.sin(r * 12.9 + i * 7.3) * 0.5 + 0.5) * 24 - 12;
        g.fillStyle = `rgb(${176 + k},${72 + k * 0.6},${46 + k * 0.4})`; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 31, y); g.lineTo(x + 31, y + 22); g.quadraticCurveTo(x + 16, y + 40, x + 1, y + 22); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(70,20,10,.55)'; g.lineWidth = 1.5; g.stroke();
      }
      const gr = g.createLinearGradient(0, 0, 0, 30); gr.addColorStop(0, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      for (let r = 0; r < 9; r++) { g.save(); g.translate(0, r * 30); g.fillStyle = gr; g.fillRect(0, 0, 256, 30); g.restore(); }
    },
    plaster(c, g) { // белая штукатурка с тёмными балками
      g.fillStyle = '#eee4cf'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
      g.strokeStyle = '#4f3524'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 244); g.lineWidth = 10; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
      g.lineWidth = 8; g.beginPath(); g.moveTo(10, 120); g.lineTo(120, 10); g.moveTo(246, 120); g.lineTo(136, 10); g.moveTo(10, 136); g.lineTo(120, 246); g.moveTo(246, 136); g.lineTo(136, 246); g.stroke();
    },
    brick(c, g) {
      g.fillStyle = '#cdc3b3'; g.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 10; r++) for (let i = -1; i < 5; i++) { const x = i * 64 + (r % 2) * 32, k = (Math.sin(r * 5.1 + i * 3.7) * 0.5 + 0.5) * 30 - 15; g.fillStyle = `rgb(${150 + k},${74 + k * 0.6},${58 + k * 0.5})`; g.fillRect(x + 2, r * 26 + 2, 60, 22); }
    },
  };
  for (const k of Object.keys(PROC)) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; PROC[k](cv, cv.getContext('2d')); PROC[k] = cv; }
  const imgs = {};
  function imgOf(name) {
    if (!TEX[name] && PROC[name]) { if (!imgs[name]) imgs[name] = { im: PROC[name], subs: [] }; return imgs[name]; }
    if (!TEX[name]) return null;
    if (!imgs[name]) { const im = new Image(); im.src = TEX[name]; imgs[name] = { im, subs: [] }; im.onload = () => imgs[name].subs.forEach((t) => { t.needsUpdate = true; }); }
    return imgs[name];
  }
  const TINT = { grass: 0xd6d9a4, grass_dry: 0xe0dcb0, soil_plowed: 0xb3a090, soil_wet: 0xc0b4aa, asphalt: 0xb4b6b8, dirt_path: 0xd8c8b0, concrete: 0xd0d0cc, wheat_field: 0xf0d9a0 };
  const texMats = {};
  /** Материал с текстурой name; rx, ry — повторы; ox, oy — сдвиг (разные участки одной текстуры); rot — поворот. Без текстуры вернёт цветной материал. */
  function texMat(name, rx, ry, color, ox, oy, rot, extra) {
    const k = [name, rx, ry, color, ox, oy, rot, extra ? 'x' : ''].join('|');
    if (texMats[k]) return texMats[k];
    const I = imgOf(name); if (!I) return (texMats[k] = mat(color || 0x888888));
    const t = new T.Texture(I.im); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.offset.set(ox || 0, oy || 0);
    if (rot) { t.center.set(0.5, 0.5); t.rotation = rot; }
    t.anisotropy = 8; I.subs.push(t); if (I.im.complete === undefined || (I.im.complete && I.im.naturalWidth)) t.needsUpdate = true;
    return (texMats[k] = new T.MeshLambertMaterial(Object.assign({ map: t, color: TINT[name] != null ? TINT[name] : 0xffffff }, extra || {})));
  }
  const hasTex = (n) => !!TEX[n] || !!PROC[n];
  const bakedMat = new T.MeshLambertMaterial({ vertexColors: true });
  /** Склеивает все части группы в один объект (быстро рисуется), цвета берёт из материалов с лёгким разбросом. */
  function bake(group, jitter) {
    group.updateMatrixWorld(true);
    const pos = [], nor = [], col = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
    group.traverse((o) => {
      if (!o.isMesh || o.material.transparent || !o.material.color) return;
      let g = o.geometry; if (g.index) g = g.toNonIndexed();
      const pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(o.matrixWorld);
      c.copy(o.material.color).multiplyScalar(1 + (Math.random() - 0.5) * (jitter == null ? 0.14 : jitter));
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
      }
    });
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geom.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geom.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const m = new T.Mesh(geom, bakedMat); m.castShadow = true; m.receiveShadow = true; return m;
  }
  /** Склейка с сохранением текстур: возвращает группу из нескольких объектов (по одному на материал). */
  function bakeTex(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
    group.traverse((o) => {
      if (!o.isMesh || o.material.transparent) return;
      const tex = !!o.material.map || !!o.material.isMeshStandardMaterial, key = tex ? o.material.uuid : 'vc';
      if (!buckets.has(key)) buckets.set(key, { mat: tex ? o.material : bakedMat, pos: [], nor: [], col: [], uv: [], tex });
      const B = buckets.get(key); let g = o.geometry; if (g.index) g = g.toNonIndexed();
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; nm.getNormalMatrix(o.matrixWorld);
      const tint = o.userData.bakeColor != null ? c.set(o.userData.bakeColor) : c.copy(o.material.color || c.set(0xffffff)); tint.multiplyScalar(1 + (Math.random() - 0.5) * 0.16);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); B.pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); B.nor.push(n.x, n.y, n.z); B.col.push(c.r, c.g, c.b);
        if (B.tex) B.uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      }
    });
    const out = new T.Group();
    for (const B of buckets.values()) {
      const geom = new T.BufferGeometry(); geom.setAttribute('position', new T.Float32BufferAttribute(B.pos, 3)); geom.setAttribute('normal', new T.Float32BufferAttribute(B.nor, 3));
      if (B.tex) geom.setAttribute('uv', new T.Float32BufferAttribute(B.uv, 2)); else geom.setAttribute('color', new T.Float32BufferAttribute(B.col, 3));
      const m = new T.Mesh(geom, B.mat); m.castShadow = true; m.receiveShadow = true; out.add(m);
    }
    return out;
  }
  /** Двускатная крыша: основание w×d, конёк высотой h вдоль оси z. */
  function gable(w, d, h, color, x, y, z, material) {
    const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [w / 2, 0, d / 2], dd = [-w / 2, 0, d / 2], r1 = [0, h, -d / 2], r2 = [0, h, d / 2];
    const tri = [a, b, r1, dd, r2, c, a, dd, r1, dd, r2, r1, b, r1, c, c, r1, r2, a, r1, b, dd, c, r2].flat();
    const uvs = []; for (let i = 0; i < tri.length / 3; i++) uvs.push((i % 3) * 0.5, (i % 2));
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(tri, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
    const m = new T.Mesh(g, material || mat(color, { side: T.DoubleSide })); m.userData.bakeColor = color; m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m;
  }
  // ---- физически корректные материалы (PBR): краска, резина, хром, стекло. Освещаются картой окружения (scene.environment).
  const pbrCache = {};
  function pmat(color, o) { const k = color + JSON.stringify(o || {}); return pbrCache[k] || (pbrCache[k] = new T.MeshStandardMaterial(Object.assign({ color, metalness: 0.1, roughness: 0.6, envMapIntensity: 0.4 }, o || {}))); }
  const paint = (color, o) => pmat(color, Object.assign({ metalness: 0.45, roughness: 0.32, envMapIntensity: 0.6 }, o || {}));
  const matte = (color, o) => pmat(color, Object.assign({ metalness: 0.0, roughness: 0.85 }, o || {}));
  const metal = (color, o) => pmat(color, Object.assign({ metalness: 0.85, roughness: 0.35, envMapIntensity: 0.8 }, o || {}));
  const rubberM = () => pmat(0x161618, { metalness: 0, roughness: 0.92 });
  const chromeM = () => pmat(0xdfe3e8, { metalness: 1, roughness: 0.14, envMapIntensity: 1.0 });
  const glassM = (tint) => pbrCache['glass' + (tint || 0)] || (pbrCache['glass' + (tint || 0)] = new T.MeshStandardMaterial({ color: tint || 0x9cc3d6, metalness: 0.9, roughness: 0.04, envMapIntensity: 1.0, transparent: true, opacity: 0.38, depthWrite: false }));
  const lightM = (color) => pmat(color || 0xfff6d0, { emissive: color || 0xfff6d0, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3 });
  /** Скруглённый параллелепипед: ширина w (x), высота h (y), глубина d (z), радиус скругления r. Геометрия с гладкими нормалями. */
  function rbox(w, h, d, r, seg) {
    r = Math.max(0.001, Math.min(r == null ? 0.1 : r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); const bev = Math.min(r * 0.7, d / 2 - 0.001, 0.3), cr = Math.max(0.0005, r - bev * 0.0);
    const hw = w / 2 - bev, hh = h / 2 - bev, rr = Math.max(0.0005, Math.min(cr, hw - 0.0005, hh - 0.0005)), sh = new T.Shape();
    sh.moveTo(-hw + rr, -hh); sh.lineTo(hw - rr, -hh); sh.quadraticCurveTo(hw, -hh, hw, -hh + rr); sh.lineTo(hw, hh - rr); sh.quadraticCurveTo(hw, hh, hw - rr, hh); sh.lineTo(-hw + rr, hh); sh.quadraticCurveTo(-hw, hh, -hw, hh - rr); sh.lineTo(-hw, -hh + rr); sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: 0, bevelSegments: seg || 3, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * bev) / 2); return g;
  }
  /** Выдавливание контура (массив [x,y]) по оси Z на глубину d с фаской b: профиль кузова, капот, крыло. */
  function ext(points, d, b, seg) {
    const sh = new T.Shape(); points.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * (b || 0)), bevelEnabled: !!b, bevelThickness: b || 0, bevelSize: b || 0, bevelSegments: seg || 2, curveSegments: 8 });
    g.translate(0, 0, -(d - 2 * (b || 0)) / 2); return g;
  }
  /** Mesh из любой геометрии и материала (тени включены). */
  function mesh(g, m, x, y, z, rx, ry, rz) { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; o.receiveShadow = true; return o; }
  /** Карта окружения для металла и стекла: небо, горизонт, земля и яркое солнце. */
  function makeEnv(renderer) {
    const es = new T.Scene(), sg = new T.SphereGeometry(50, 32, 16), pos = sg.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50, t = Math.max(0, y), g = Math.max(0, -y);
      const r = y >= 0 ? 0.52 + (0.2 - 0.52) * Math.pow(t, 0.55) : 0.26 + (0.1 - 0.26) * Math.min(1, g * 1.6), gg = y >= 0 ? 0.6 + (0.34 - 0.6) * Math.pow(t, 0.55) : 0.3 + (0.14 - 0.3) * Math.min(1, g * 1.6), bb = y >= 0 ? 0.68 + (0.58 - 0.68) * Math.pow(t, 0.55) : 0.2 + (0.08 - 0.2) * Math.min(1, g * 1.6);
      col.push(r, gg, bb);
    }
    sg.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    es.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const sun = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({ color: new T.Color(2.4, 2.2, 1.8), side: T.DoubleSide })); sun.position.set(22, 30, 14); sun.lookAt(0, 0, 0); es.add(sun);
    const fill = new T.Mesh(new T.PlaneGeometry(40, 10), new T.MeshBasicMaterial({ color: new T.Color(0.8, 0.85, 0.95), side: T.DoubleSide })); fill.position.set(-30, 10, -20); fill.lookAt(0, 2, 0); es.add(fill);
    const pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(es, 0.03).texture; pm.dispose(); return tex;
  }
  const geoCache = {};
  const geo = (k, f) => geoCache[k] || (geoCache[k] = f());
  const G = {
    box: () => geo('box', () => new T.BoxGeometry(1, 1, 1)),
    cyl: () => geo('cyl', () => new T.CylinderGeometry(0.5, 0.5, 1, 10)),
    cone: () => geo('cone', () => new T.ConeGeometry(0.5, 1, 7)),
    sph: () => geo('sph', () => new T.SphereGeometry(0.5, 9, 7)),
  };
  function part(g, color, x, y, z, sx, sy, sz, o) {
    const m = new T.Mesh(G[g](), mat(color, o));
    m.position.set(x, y, z); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    m.castShadow = true; m.receiveShadow = true; return m;
  }
  const rgb = (h) => new T.Color(h);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------- модели
  const CROP_LOOK = {
    wheat:      { leaf: 0xc9b24a, fruit: 'ears', fc: 0xe8c547 },
    carrot:     { leaf: 0x4caf50, fruit: 'carrot', fc: 0xff8c1a },
    potato:     { leaf: 0x5a9e44, fruit: 'ball', fc: 0xb98b54, fs: 0.2 },
    tomato:     { leaf: 0x3f9e3f, fruit: 'ball', fc: 0xe53935, fs: 0.2, many: 4 },
    corn:       { leaf: 0x6ab04c, fruit: 'cob', fc: 0xffd23f, tall: 1 },
    cucumber:   { leaf: 0x2e8b3a, fruit: 'long', fc: 0x7cc576 },
    strawberry: { leaf: 0x3a9a4a, fruit: 'ball', fc: 0xe91e63, fs: 0.12, many: 5 },
    cabbage:    { leaf: 0x9ccc65, fruit: 'head', fc: 0xb5e07a },
    pumpkin:    { leaf: 0x4a8f3a, fruit: 'pump', fc: 0xff7a00 },
    eggplant:   { leaf: 0x3d8a45, fruit: 'long', fc: 0x6a1b9a, many: 3 },
    watermelon: { leaf: 0x2f7d32, fruit: 'melon', fc: 0x2e7d32 },
    sunflower:  { leaf: 0x4a9a3a, fruit: 'flower', fc: 0xffc107, tall: 1 },
    grape:      { leaf: 0x3b8a3b, fruit: 'ball', fc: 0x7b1fa2, fs: 0.13, many: 7 },
    pineapple:  { leaf: 0x5aa04a, fruit: 'pine', fc: 0xe0a21b },
  };
  function cropModel(key, stage) {
    const g = new T.Group(), c = CROP_LOOK[key];
    if (stage === 0) { g.add(part('cone', 0x6bbf59, 0, 0.1, 0, 0.12, 0.2, 0.12)); g.add(part('cone', 0x6bbf59, 0.07, 0.07, 0.03, 0.08, 0.14, 0.08)); return g; }
    const sc = stage === 1 ? 0.55 : stage === 2 ? 0.85 : 1, tall = c.tall ? 1.7 : 1;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = 0.17 * sc;
      const l = part('cone', c.leaf, Math.cos(a) * r, 0.17 * sc * tall, Math.sin(a) * r, 0.16 * sc, 0.34 * sc * tall, 0.16 * sc);
      l.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(l);
    }
    if (c.tall) g.add(part('cyl', 0x4f9a3a, 0, 0.3 * sc * tall, 0, 0.07, 0.6 * sc * tall, 0.07));
    if (stage < 3) return g;
    const y0 = 0.1;
    switch (c.fruit) {
      case 'ears': for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(part('cyl', c.fc, Math.cos(a) * 0.16, 0.52, Math.sin(a) * 0.16, 0.07, 0.24, 0.07)); } break;
      case 'carrot': for (let i = 0; i < 3; i++) { const o = part('cone', c.fc, (i - 1) * 0.12, 0.09, 0, 0.1, 0.22, 0.1); o.rotation.x = Math.PI; g.add(o); } break;
      case 'ball': for (let i = 0; i < (c.many || 2); i++) { const a = i * 2.4; g.add(part('sph', c.fc, Math.cos(a) * 0.17, y0 + 0.08 + (i % 3) * 0.09, Math.sin(a) * 0.17, c.fs * 1.4, c.fs * 1.4, c.fs * 1.4)); } break;
      case 'cob': for (let i = 0; i < 2; i++) g.add(part('cyl', c.fc, (i ? 0.1 : -0.1), 0.62, 0.08, 0.1, 0.3, 0.1)); break;
      case 'long': for (let i = 0; i < (c.many || 3); i++) { const o = part('cyl', c.fc, (i - 1) * 0.16, 0.12, 0.15, 0.1, 0.32, 0.1); o.rotation.z = 1.2 - i * 0.5; g.add(o); } break;
      case 'head': g.add(part('sph', c.fc, 0, 0.2, 0, 0.5, 0.42, 0.5)); g.add(part('sph', 0x7cb342, 0, 0.14, 0, 0.58, 0.28, 0.58)); break;
      case 'pump': { const p = part('sph', c.fc, 0, 0.2, 0, 0.55, 0.42, 0.55); g.add(p); g.add(part('cyl', 0x4e6b2a, 0, 0.44, 0, 0.07, 0.1, 0.07)); break; }
      case 'melon': { const p = part('sph', c.fc, 0, 0.2, 0, 0.62, 0.46, 0.46); g.add(p); for (let i = -1; i <= 1; i++) g.add(part('box', 0x1b5e20, i * 0.13, 0.2, 0, 0.05, 0.46, 0.4)); break; }
      case 'flower': g.add(part('cyl', c.fc, 0, 1.0, 0.06, 0.62, 0.08, 0.62)); g.add(part('cyl', 0x5d3a1a, 0, 1.03, 0.1, 0.3, 0.08, 0.3)); g.children[g.children.length - 2].rotation.x = 0.35; g.children[g.children.length - 1].rotation.x = 0.35; break;
      case 'pine': g.add(part('sph', c.fc, 0, 0.3, 0, 0.4, 0.5, 0.4)); for (let i = 0; i < 5; i++) { const a = i * 1.26; const lf = part('cone', 0x388e3c, Math.cos(a) * 0.06, 0.62, Math.sin(a) * 0.06, 0.1, 0.3, 0.1); lf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(lf); } break;
    }
    return g;
  }

  function animalModel(key) {
    const g = new T.Group();
    const body = (c, sx, sy, sz, y) => g.add(part('box', c, 0, y, 0, sx, sy, sz));
    const legs = (c, h, dx, dz) => { for (const x of [-dx, dx]) for (const z of [-dz, dz]) g.add(part('box', c, x, h / 2, z, 0.08, h, 0.08)); };
    switch (key) {
      case 'chicken': body(0xffffff, 0.3, 0.26, 0.36, 0.25); g.add(part('box', 0xffffff, 0, 0.42, 0.2, 0.18, 0.2, 0.18)); g.add(part('box', 0xe53935, 0, 0.55, 0.2, 0.06, 0.08, 0.1)); g.add(part('cone', 0xffa000, 0, 0.42, 0.33, 0.07, 0.1, 0.07)).rotation.x = Math.PI / 2; legs(0xffa000, 0.14, 0.06, 0); break;
      case 'duck': body(0xfff3c4, 0.28, 0.24, 0.4, 0.22); g.add(part('box', 0x2e7d32, 0, 0.42, 0.2, 0.17, 0.18, 0.17)); g.add(part('box', 0xffa000, 0, 0.4, 0.31, 0.12, 0.05, 0.1)); legs(0xffa000, 0.1, 0.06, 0); break;
      case 'cow': body(0xffffff, 0.5, 0.45, 0.9, 0.55); g.add(part('box', 0x222222, 0.1, 0.6, 0.1, 0.3, 0.3, 0.3)); g.add(part('box', 0xffffff, 0, 0.7, 0.55, 0.3, 0.3, 0.3)); g.add(part('box', 0xf4b6c2, 0, 0.62, 0.72, 0.2, 0.14, 0.06)); legs(0xffffff, 0.34, 0.17, 0.32); g.add(part('box', 0x555555, -0.1, 0.9, 0.55, 0.05, 0.1, 0.05)); g.add(part('box', 0x555555, 0.1, 0.9, 0.55, 0.05, 0.1, 0.05)); break;
      case 'sheep': body(0xf5f5f5, 0.5, 0.42, 0.62, 0.48); g.add(part('box', 0x3a3a3a, 0, 0.55, 0.38, 0.2, 0.22, 0.22)); legs(0x3a3a3a, 0.26, 0.15, 0.2); break;
      case 'goat': body(0xd8c6a5, 0.34, 0.34, 0.65, 0.5); g.add(part('box', 0xd8c6a5, 0, 0.7, 0.38, 0.2, 0.22, 0.22)); g.add(part('box', 0x5b4a33, -0.06, 0.88, 0.38, 0.04, 0.12, 0.04)); g.add(part('box', 0x5b4a33, 0.06, 0.88, 0.38, 0.04, 0.12, 0.04)); legs(0xb9a684, 0.3, 0.1, 0.22); break;
      case 'pig': body(0xf7a8b8, 0.46, 0.4, 0.7, 0.36); g.add(part('box', 0xf7a8b8, 0, 0.42, 0.4, 0.3, 0.3, 0.26)); g.add(part('box', 0xe58a9c, 0, 0.4, 0.55, 0.18, 0.12, 0.05)); legs(0xf7a8b8, 0.2, 0.14, 0.24); break;
      case 'bee': g.add(part('sph', 0xffc107, 0, 0.7, 0, 0.18, 0.14, 0.26)); g.add(part('box', 0x222222, 0, 0.7, 0, 0.19, 0.05, 0.06)); g.add(part('box', 0xffffff, 0.1, 0.8, 0, 0.14, 0.02, 0.1)); g.add(part('box', 0xffffff, -0.1, 0.8, 0, 0.14, 0.02, 0.1)); break;
    }
    return g;
  }

  function vehicleModel(kind, big) {
    const g = new T.Group(), c = { tractor: 0x2e9b3a, combine: 0xe53935, waterer: 0x1e88e5, spreader: 0x8e6c3a }[kind] || 0xe53935;
    if (kind === 'tractor') {
      g.add(part('box', c, 0, 0.45, 0.2, 0.55, 0.4, 0.7)); g.add(part('box', 0xeeeeee, 0, 0.8, -0.15, 0.5, 0.5, 0.4)); g.add(part('box', 0x9ad7ff, 0, 0.82, -0.15, 0.52, 0.28, 0.42, { transparent: true, opacity: 0.8 }));
      for (const x of [-0.34, 0.34]) { g.add(part('cyl', 0x222222, x, 0.3, -0.15, 0.55, 0.16, 0.55)).rotation.z = Math.PI / 2; g.add(part('cyl', 0x222222, x, 0.2, 0.5, 0.36, 0.14, 0.36)).rotation.z = Math.PI / 2; }
      if (big) g.add(part('box', 0x888888, 0, 0.18, 0.95, 1.3, 0.1, 0.2));
    } else {
      g.add(part('box', c, 0, 0.5, 0, 0.9, 0.55, 1.3)); g.add(part('box', 0xeeeeee, 0, 0.95, -0.35, 0.55, 0.4, 0.5)); g.add(part('box', 0xffc107, 0, 0.3, 0.85, 1.7, 0.4, 0.28));
      for (const x of [-0.5, 0.5]) { g.add(part('cyl', 0x222222, x, 0.28, -0.3, 0.55, 0.2, 0.55)).rotation.z = Math.PI / 2; g.add(part('cyl', 0x222222, x, 0.2, 0.4, 0.4, 0.16, 0.4)).rotation.z = Math.PI / 2; }
    }
    return g;
  }

  function truckModel(lvl) {
    const g = new T.Group(), colors = [0x8d6e63, 0x42a5f5, 0xffb300, 0xe53935], c = colors[lvl] || 0x42a5f5;
    const len = [0.9, 1.3, 1.7, 2.3][lvl] || 1.3, wid = [0.6, 0.75, 0.85, 0.95][lvl] || 0.75;
    g.add(part('box', c, 0, 0.55, len * 0.2, wid, 0.5, len * 0.6)); // кузов
    g.add(part('box', 0xeeeeee, 0, 0.62, -len * 0.38, wid, 0.55, len * 0.28)); // кабина
    g.add(part('box', 0x9ad7ff, 0, 0.72, -len * 0.5, wid * 0.9, 0.28, 0.05));
    for (const x of [-wid / 2, wid / 2]) for (const z of [-len * 0.3, len * 0.1, len * 0.45]) { if (lvl < 2 && z > len * 0.3) continue; g.add(part('cyl', 0x222222, x, 0.2, z, 0.4, 0.14, 0.4)).rotation.z = Math.PI / 2; }
    if (lvl === 0) g.scale.setScalar(0.8);
    return g;
  }

  function tree(h, kind) {
    const g = new T.Group(); h = h || 1; const r = Math.random;
    const greens = [0x35602c, 0x42702f, 0x52803a, 0x3a5e2c, 0x2c4c26];
    if (kind === 'pine' || (kind == null && r() < 0.4)) {
      g.add(part('cyl', 0x5d4037, 0, 0.35 * h, 0, 0.18, 0.7 * h, 0.18));
      for (let i = 0; i < 4; i++) g.add(part('cone', greens[(i + 4) % 5], 0, (0.8 + i * 0.5) * h, 0, (1.3 - i * 0.28) * h, 0.9 * h, (1.3 - i * 0.28) * h));
    } else {
      g.add(part('cyl', 0x6d4c2f, 0, 0.45 * h, 0, 0.22, 0.9 * h, 0.22));
      for (let i = 0; i < 5; i++) { const a = r() * 6.28, d = r() * 0.5 * h; g.add(part('sph', greens[Math.floor(r() * 5)], Math.cos(a) * d, (1.25 + r() * 0.7) * h, Math.sin(a) * d, (0.9 + r() * 0.5) * h, (0.8 + r() * 0.4) * h, (0.9 + r() * 0.5) * h)); }
    }
    return g;
  }
  const roofMat = (rx, ry) => texMat('roof_tile', rx, ry, 0xb23a2a, 0, 0, 0, { side: T.DoubleSide });
  function house(w, d, h, wall, roof) {
    const g = new T.Group();
    const body = part('box', wall, 0, h / 2, 0, w, h, d); body.material = texMat('plaster', Math.max(1, w / 2.2), Math.max(1, h / 2), wall); g.add(body);
    g.add(gable(w * 1.2, d * 1.14, h * 0.62, roof, 0, h, 0, roofMat(Math.max(1, w / 2.5), 1)));
    g.add(part('box', 0x5d4037, 0, 0.35, d / 2 + 0.01, 0.4, 0.7, 0.05));
    g.add(part('box', 0xffe082, w * 0.28, h * 0.62, d / 2 + 0.01, 0.3, 0.3, 0.05));
    g.add(part('box', 0xffe082, -w * 0.28, h * 0.62, d / 2 + 0.01, 0.3, 0.3, 0.05));
    g.add(part('box', 0x8d6e63, w * 0.3, h + h * 0.55, -d * 0.1, 0.22, 0.6, 0.22));
    return g;
  }

  // ---------------------------------------------------------------- здания города
  function buildingModel(id) {
    const g = new T.Group();
    { const pl = part('box', 0xcfd3d8, 0, 0.05, 0, 7, 0.1, 6); pl.material = texMat('concrete', 2, 2, 0xcfd3d8); g.add(pl); } // площадка
    switch (id) {
      case 'market': {
        g.add(part('box', 0xf5e6c8, 0, 0.9, -1.2, 5.4, 1.8, 1.2));
        for (let i = 0; i < 6; i++) g.add(part('box', i % 2 ? 0xffffff : 0xe53935, -2.25 + i * 0.9, 2.1, 0.2, 0.9, 0.12, 2.6)).rotation.x = 0.18;
        for (const x of [-2.6, 2.6]) g.add(part('cyl', 0x8d6e63, x, 1.0, 1.4, 0.12, 2, 0.12));
        for (let i = 0; i < 4; i++) g.add(part('box', 0xa1783f, -2 + i * 1.3, 0.35, 0.6, 0.8, 0.6, 0.7));
        for (let i = 0; i < 4; i++) g.add(part('sph', [0xe53935, 0xff9800, 0x7cb342, 0xffd54f][i], -2 + i * 1.3, 0.8, 0.6, 0.45));
        g.add(part('box', 0xffd54f, 0, 2.8, -1.2, 3, 0.7, 0.15));
        break;
      }
      case 'seeds': {
        g.add(house(4, 3, 2, 0xf6ecd2, 0x2e7d32)); g.add(part('box', 0xffffff, 0, 2.2, 1.7, 2.6, 0.7, 0.1));
        for (let i = 0; i < 3; i++) g.add(part('sph', [0x7cb342, 0xff9800, 0xe53935][i], -1 + i, 0.4, 2.3, 0.5));
        g.add(part('box', 0xa1783f, 0, 0.25, 2.3, 3.2, 0.5, 0.7)).material = mat(0xa1783f);
        for (let i = 0; i < 3; i++) g.add(part('sph', [0x7cb342, 0xff9800, 0xe53935][i], -1 + i, 0.65, 2.3, 0.45));
        break;
      }
      case 'tech': {
        g.add(part('box', 0xb0bec5, 0, 1.3, -0.5, 5, 2.6, 3.4)); g.add(part('box', 0x607d8b, 0, 2.7, -0.5, 5.2, 0.25, 3.6));
        g.add(part('box', 0x37474f, -0.9, 1.0, 1.22, 2, 2, 0.1)); g.add(part('box', 0xffc107, 1.7, 2.0, 1.22, 1.2, 0.6, 0.1));
        const t = vehicleModel('tractor'); t.position.set(1.8, 0.1, 2.1); t.rotation.y = 0.6; t.scale.setScalar(1.1); g.add(t);
        break;
      }
      case 'bank': {
        g.add(part('box', 0xf0ead8, 0, 1.4, -0.4, 4.6, 2.8, 3.2));
        for (let i = 0; i < 5; i++) g.add(part('cyl', 0xffffff, -1.8 + i * 0.9, 1.3, 1.5, 0.35, 2.6, 0.35));
        g.add(part('box', 0xd4af37, 0, 3.0, 0.2, 5.2, 0.4, 4.2)); g.add(part('cone', 0xd4af37, 0, 3.7, 0.2, 3, 1.2, 3));
        g.add(part('box', 0xd4af37, 0, 3.2, 2.3, 1, 0.5, 0.1));
        break;
      }
      case 'casino': {
        g.add(part('box', 0x4a148c, 0, 1.5, -0.3, 4.6, 3, 3.4)); g.add(part('box', 0xff4081, 0, 3.1, -0.3, 4.8, 0.25, 3.6));
        const pivot = new T.Group(); pivot.position.set(0, 4.5, 0.1); pivot.rotation.x = Math.PI / 2; g.add(pivot);
        const spinner = new T.Group(); spinner.userData.spin = 1; pivot.add(spinner);
        spinner.add(part('cyl', 0xffd54f, 0, 0, 0, 2.4, 0.3, 2.4));
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; spinner.add(part('box', i % 2 ? 0xe53935 : 0x212121, Math.cos(a) * 0.75, 0.2, Math.sin(a) * 0.75, 0.5, 0.1, 0.5)); }
        spinner.add(part('cyl', 0xffffff, 0, 0.22, 0, 0.35, 0.12, 0.35));
        g.add(part('box', 0x1de9b6, 0, 0.9, 1.45, 1.2, 1.8, 0.1));
        for (let i = 0; i < 5; i++) g.add(part('sph', [0xffeb3b, 0xff4081, 0x40c4ff][i % 3], -1.8 + i * 0.9, 3.35, 1.55, 0.2, 0.2, 0.2, { emissive: 0x555500 }));
        break;
      }
      default: {
        const colors = { home: 0xc62828, meadow: 0xd81b60, grove: 0x2e7d32, valley: 0x1565c0, lake: 0x00838f, hills: 0x6a1b9a, orchard: 0xf9a825 };
        const barn = new T.Group(); const wall = part('box', colors[id] || 0x2e7d32, 0, 1.2, 0, 2.6, 2.4, 3.4);
        if (id === 'home') wall.material = texMat('wood_barn', 1, 1, 0xc62828); barn.add(wall);
        barn.add(part('box', 0xffffff, 0, 1.0, 1.72, 1.1, 1.7, 0.06)); barn.add(part('box', 0x8d1b1b, 0, 1.0, 1.75, 1.0, 0.1, 0.04).rotateZ(0.8)); barn.add(part('box', 0xffffff, 0, 2.0, 1.74, 0.5, 0.4, 0.05));
        barn.add(gable(3.1, 3.8, 1.5, 0x7a2f23, 0, 2.4, 0, roofMat(2, 2)));
        barn.position.set(-1.6, 0, -1); g.add(barn);
        g.add(part('cyl', 0xcfd8dc, 1.6, 1.8, -1.4, 1.1, 3.6, 1.1)); for (let i = 1; i < 6; i++) g.add(part('cyl', 0x90a4ae, 1.6, i * 0.6, -1.4, 1.14, 0.05, 1.14)); g.add(part('sph', 0x90a4ae, 1.6, 3.7, -1.4, 1.1, 0.8, 1.1));
        for (let i = 0; i < 3; i++) { const fl = part('box', i % 2 ? 0x8bc34a : 0x558b2f, -0.8 + i * 1.5, 0.16, 2.0, 1.2, 0.12, 1.4); if (hasTex('wheat_field') && i !== 1) fl.material = texMat('wheat_field', 1, 1, 0xe0a84a); else if (hasTex('soil_plowed')) fl.material = texMat('soil_plowed', 1, 1, 0x7a4e2b); g.add(fl); }
        if (id === 'hills') g.add(part('cone', 0x78909c, 2.2, 1.6, 0.6, 2.2, 3.2, 2.2));
        if (id === 'lake') g.add(part('cyl', 0x4fc3f7, 1.6, 0.14, 1.6, 2.6, 0.08, 1.8));
        if (id === 'meadow') for (let i = 0; i < 6; i++) g.add(part('sph', [0xff4081, 0xffeb3b, 0xffffff][i % 3], -1.5 + i * 0.7, 0.3, 2.5, 0.3));
        if (id === 'grove' || id === 'orchard') for (let i = 0; i < 3; i++) { const t = tree(0.7); t.position.set(1.4 + i * 0.7, 0.1, 1.9); g.add(t); if (id === 'orchard') g.add(part('sph', 0xe53935, 1.4 + i * 0.7, 1.1, 2.2, 0.2)); }
        break;
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- мир: одна большая карта
  const TS = 3; // размер одной клетки поля в единицах мира (1 единица ≈ 1 метр)
  const SLOT = { wild: [-150, -150], forest: [40, -150], home: [-200, -30], meadow: [-70, -30], grove: [60, -30], valley: [190, -30], lake: [-200, 30], hills: [-70, 30], orchard: [60, 30] };
  // Поля: каждое поле лежит отдельно от двора, домов и улиц — большим рядом в «полевом районе» на юге.
  // Дворы (дом, амбар, силосы, загон) остаются у дорог внутри карты.
  const FIELD_POS = { home: [-450, 305], meadow: [-300, 305], grove: [-150, 305], valley: [0, 305], lake: [150, 305], hills: [300, 305], orchard: [450, 305] };   // поля растут до 42×24 клеток, поэтому стоят через 150 м
  const FW_MAX = 42, ROAD_F = 243;                                  // самая широкая вспаханная часть, дорога вдоль полей
  const DECO = [{ cx: 0, cz: 285, w: 1120, d: 150 }];                   // здесь деревья и кусты не растут
  const FIELD_LEFT = 8; // левый край поля от центра участка: поле растёт вправо
  const TOWN = { market: [-112, 82], seeds: [-76, 82], tech: [-40, 82], bank: [28, 82], casino: [64, 82] };
  const TOWN_MODEL = { market: 'market', seeds: 'seedshop', tech: 'techcenter', bank: 'bank', casino: 'casino' };
  const ROAD_Z = [0.2, 66, 100], ROAD_X = [-266, -141, -11, 119, 249], RW = 8;
  const CITY = {
    names: { bay: '🚜 Стоянка техники', sawmill: '🪚 Лесопилка', market: '🏪 Рынок', seeds: '🌱 Семена и корм', tech: '🚜 Техцентр', bank: '🏦 Банк', casino: '🎰 Колесо удачи', warehouse: '📦 Склад' },
    route: [[-178, -16], [-178, 0.2], [-141, 0.2], [-141, 100], [-108, 100], [-108, 93]],
    center: [0, 30],
  };
  const VEH_KEYS = ['tractor', 'combine', 'waterer', 'spreader', 'logger', 'grinder'];
  const VEH_START = { tractor: [-468, 255], combine: [-449, 255], waterer: [-430, 255], spreader: [-411, 255], logger: [-170, -116], grinder: [-188, -116] };  // стоянка у поля «Моя ферма»
  const VEH_VER = 7;   // 7: стоянка техники переехала к первому полю — все машины встают на новое место
  const ROAD_N = -100; // северная дорога вдоль леса и целины
  const SITE_POS = [[165, -135], [198, -135], [231, -135]]; // три стройплощадки
  const SAWMILL_POS = [-28, -128];
  const POND = [214, 30], BAY = [-439, 255];                   // пруд и стоянка техники
  const TOWN_ROT = {}, BIG_ROT = {};                           // повороты зданий (задаёт редактор карты)
  const DEF_BIG = (() => { // стандартные места больших объектов (для «сбросить к стандартной карте»)
    const o = {}; for (const [k, v] of Object.entries(TOWN)) o[k] = [v[0], v[1], 0];
    for (const [k, v] of Object.entries(SLOT)) o['y:' + k] = [v[0], v[1], v[1] < 0 ? 0 : Math.PI];
    for (const [k, v] of Object.entries(FIELD_POS)) o['f:' + k] = [v[0], v[1], 0];
    o.sawmill = [SAWMILL_POS[0], SAWMILL_POS[1], 0]; SITE_POS.forEach((p, i) => { o['site' + i] = [p[0], p[1], 0]; }); o.pond = [POND[0], POND[1], 0]; o.bay = [BAY[0], BAY[1], 0]; return o;
  })();
  const MODEL = (kind, name, opts, fb, sc) => { const FM = root.FarmModels; let m = null; if (FM && FM.has(kind, name)) { try { m = FM.make(kind, name, opts); } catch (err) { m = null; if (!MODEL.bad[kind + ':' + name]) { MODEL.bad[kind + ':' + name] = 1; console.warn('модель сломана, взята простая:', kind, name, err && err.message); } } } if (!m) { m = fb ? fb() : new T.Group(); if (sc) m.scale.multiplyScalar(sc); } return m; };
  MODEL.bad = {};
  const hasModel = (kind, name) => !!(root.FarmModels && root.FarmModels.has(kind, name));
  const disposeObj = (o) => o.traverse((c) => { if (c.geometry && c.geometry.dispose) c.geometry.dispose(); });
  /** Забор из столбов и перекладин по ломаной точек (x,z). */
  function rails(parent, pts, color, h, spacing) {
    const g = new T.Group(); h = h || 1.1; spacing = spacing || 2.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / spacing)), ang = Math.atan2(x2 - x1, z2 - z1);
      for (let k = 0; k <= n; k++) { const x = lerp(x1, x2, k / n), z = lerp(z1, z2, k / n); g.add(part('box', color, x, h / 2, z, 0.18, h, 0.18)); }
      for (const yy of [h * 0.5, h * 0.88]) { const r = part('box', color, (x1 + x2) / 2, yy, (z1 + z2) / 2, 0.08, 0.1, len); r.rotation.y = ang; g.add(r); }
    }
    parent.add(bake(g, 0.1)); return g;
  }

  /** Расстановка города от владельца: ставит позиции больших объектов до постройки мира. */
  function applyBigConsts(big) {
    if (!big) return;
    for (const [id, a] of Object.entries(big)) {
      const x = +a[0], z = +a[1], r = +a[2] || 0; if (!isFinite(x) || !isFinite(z)) continue;
      if (TOWN[id]) { TOWN[id] = [x, z]; TOWN_ROT[id] = r; }
      else if (id.indexOf('y:') === 0 && SLOT[id.slice(2)]) { SLOT[id.slice(2)] = [x, z]; BIG_ROT[id] = r; }
      else if (id.indexOf('f:') === 0 && FIELD_POS[id.slice(2)]) FIELD_POS[id.slice(2)] = [x, z];
      else if (id === 'sawmill') { SAWMILL_POS[0] = x; SAWMILL_POS[1] = z; BIG_ROT.sawmill = r; }
      else if (/^site[0-2]$/.test(id)) SITE_POS[+id[4]] = [x, z];
      else if (id === 'pond') { POND[0] = x; POND[1] = z; BIG_ROT.pond = r; }
      else if (id === 'bay') { BAY[0] = x; BAY[1] = z; BIG_ROT.bay = r; }
    }
  }

  /** Земля: трава с плавными пятнами света, тени и сухих мест, чтобы не было видно однообразного повтора текстуры. */
  function groundMat() {
    const m = texMat('grass', 1300, 1300, 0x6fae4f).clone();
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nfloat h21(vec2 p){return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);}\nfloat vn(vec2 p){vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);}')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gn = vn(vWp.xz * 0.011) * 0.5 + vn(vWp.xz * 0.045) * 0.32 + vn(vWp.xz * 0.19) * 0.18;\ndiffuseColor.rgb *= mix(vec3(0.78, 0.88, 0.68), vec3(1.14, 1.09, 0.88), gn);');
    };
    return m;
  }
  function create(canvas, labelBox, cb, layout0) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(); scene.background = new T.Color(0x8ecbf0); scene.fog = new T.Fog(0x8ecbf0, 320, 1500);
    try { scene.environment = makeEnv(renderer); } catch (e) { console.warn('env', e); }
    const camera = new T.PerspectiveCamera(42, 1, 0.5, 3200);
    const hemi = new T.HemisphereLight(0xd6e2ec, 0x4a5530, 0.7); scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff1d0, 0.9); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 78; sc.bottom = -78; sc.near = 1; sc.far = 800;
    scene.add(sun); scene.add(sun.target);
    const skyDome = new T.Mesh(new T.SphereGeometry(2600, 24, 12), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new T.Color(0x5c8fb8) }, bot: { value: new T.Color(0xc6d8e2) } }, vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, pow(clamp(h,0.0,1.0), 0.6)), 1.0); }' }));
    skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
    const ground = new T.Mesh(new T.PlaneGeometry(5200, 5200), groundMat()); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const world = new T.Group(); scene.add(world);
    const W = { mode: 'map', cb, renderer, scene, camera, time: 0, S: null, inputOn: true, lite: !!(root.matchMedia && root.matchMedia('(hover:none) and (pointer:coarse)').matches) };
    if (W.lite) { sun.shadow.mapSize.set(1024, 1024); }
    const LAY0 = layout0 && (layout0.v === 1 || layout0.v === 2) && Array.isArray(layout0.items) ? layout0 : null;   // готовая расстановка города или null = стандартная
    if (LAY0) applyBigConsts(LAY0.big);

    // --- DOM-метки
    const labels = [];
    function addLabel(group, html, pos, cls, onClick) {
      const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = html; labelBox.appendChild(el);
      if (onClick) { el.style.pointerEvents = 'auto'; el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); }); el.addEventListener('pointerdown', (e) => e.stopPropagation()); }
      const o = { el, pos: pos.clone(), group, maxCam: (cls || '').indexOf('bld') >= 0 ? 380 : (cls || '').indexOf('vlbl') >= 0 || (cls || '').indexOf('tlbl') >= 0 ? 520 : 260 }; labels.push(o); return o;
    }
    const dropLabel = (o) => { o.el.remove(); const i = labels.indexOf(o); if (i >= 0) labels.splice(i, 1); };

    // ============================================================ расставляемые предметы (дома, деревья, фонари…)
    // Редактор карты двигает именно их. Предметы собраны в «квадраты» 64×64 м, каждый квадрат склеен в один меш (быстро рисуется).
    const hcol = [0xf4d6a0, 0xe8c0c0, 0xc9e0f0, 0xe0e8b0], rcol = [0xb23a2a, 0xa5402d, 0x7a2f23];
    const TREE_T = { oak: 1, pine: 1, birch: 1, fruit: 1, poplar: 1, oakLow: 1, pineLow: 1, bush: 1 };
    const BLD_T = { cottage: 1, farmhouse: 1, barn: 1, stable: 1, coop: 1, pigsty: 1, silo: 1, silos: 1, greenhouse: 1, shed: 1, garage: 1, haybarn: 1, windmill: 1, watertower: 1 };
    const DEC_R = { cottage: 9, farmhouse: 10, barn: 13, stable: 10, coop: 6, pigsty: 6, silo: 4, silos: 8, greenhouse: 8, shed: 7, garage: 6, haybarn: 9, windmill: 7, watertower: 5, oak: 4, pine: 3.5, birch: 3.5, fruit: 3.5, poplar: 3, oakLow: 3, pineLow: 2.5, bush: 2, streetLamp: 1.6, powerPole: 1.8, fenceWhite: 5, fenceWood: 5, hedge: 5, flowerBed: 2.5, hayBales: 2.5, haystack: 3.5, well: 2.5, mailbox: 1.2, signpost: 1.4, crates: 2, barrels: 2, rock: 2.5, gate: 3.5, tireStack: 2, waterTrough: 2.5, roundFeeder: 2.5, scarecrow: 1.2, manureTank: 5, patch: 6 };
    const PALETTE = [
      { id: 'houses', name: 'Дома', icon: '🏠', items: [['cottage', 0, 'Коттедж жёлтый', '🏡'], ['cottage', 1, 'Коттедж розовый', '🏡'], ['cottage', 2, 'Коттедж голубой', '🏡'], ['cottage', 3, 'Коттедж зелёный', '🏡'], ['farmhouse', 0, 'Дом фермера', '🏠'], ['barn', 0, 'Амбар', '🏚️'], ['stable', 0, 'Конюшня', '🐴'], ['shed', 0, 'Сарай', '🛖'], ['garage', 0, 'Гараж', '🚗'], ['greenhouse', 0, 'Теплица', '🌱'], ['haybarn', 0, 'Сеновал', '🌾'], ['coop', 0, 'Курятник', '🐔'], ['pigsty', 0, 'Свинарник', '🐖'], ['silos', 0, 'Силосы', '🛢️'], ['windmill', 0, 'Мельница', '🌬️'], ['watertower', 0, 'Водонапорка', '🗼']] },
      { id: 'green', name: 'Зелень', icon: '🌳', items: [['oak', 0, 'Дуб', '🌳'], ['pine', 0, 'Сосна', '🌲'], ['birch', 0, 'Берёза', '🌳'], ['fruit', 0, 'Яблоня', '🍎'], ['poplar', 0, 'Тополь', '🌳'], ['oakLow', 0, 'Деревце', '🌳'], ['pineLow', 0, 'Ёлочка', '🌲'], ['bush', 0, 'Куст', '🌿'], ['hedge', 0, 'Живая изгородь', '🟩'], ['flowerBed', 0, 'Клумба', '🌸']] },
      { id: 'decor', name: 'Декор', icon: '🛋️', items: [['streetLamp', 0, 'Фонарь', '💡'], ['powerPole', 0, 'Столб', '⚡'], ['fenceWhite', 0, 'Забор белый', '🚧'], ['fenceWood', 0, 'Забор деревянный', '🪵'], ['gate', 0, 'Ворота', '🚪'], ['well', 0, 'Колодец', '⛲'], ['mailbox', 0, 'Почтовый ящик', '📮'], ['signpost', 0, 'Указатель', '🪧'], ['hayBales', 0, 'Тюки сена', '🌾'], ['haystack', 0, 'Стог', '🌾'], ['crates', 0, 'Ящики', '📦'], ['barrels', 0, 'Бочки', '🛢️'], ['rock', 0, 'Камень', '🪨'], ['tireStack', 0, 'Шины', '⚫'], ['waterTrough', 0, 'Поилка', '🚰'], ['roundFeeder', 0, 'Кормушка', '🍽️'], ['scarecrow', 0, 'Пугало', '🧑‍🌾'], ['manureTank', 0, 'Цистерна', '🛢️']] },
    ];
    /** Коттедж с палисадником: дом лицом к +z, белый заборчик спереди. */
    function cottageFull(v) {
      const g = new T.Group();
      g.add(MODEL('building', 'cottage', { variant: v % 4, seed: v % 3 }, () => { const h = house(3.7, 3.6, 2.5, hcol[v % 4], rcol[v % 3]); h.scale.setScalar(2.2); return h; }));
      for (const sx of [-1, 1]) {
        const fx0 = sx * 1.9, fx1 = sx * 7.4;
        for (let q = 0; q <= 3; q++) g.add(part('box', 0xf2eee4, lerp(fx0, fx1, q / 3), 0.5, 5.1, 0.14, 1.0, 0.14));
        for (const yy of [0.35, 0.8]) g.add(part('box', 0xf2eee4, (fx0 + fx1) / 2, yy, 5.1, Math.abs(fx1 - fx0), 0.1, 0.08));
      }
      return g;
    }
    // участки земли: прямоугольные «заплатки» (вспаханная земля, гравий, бетон, асфальт, трава, песок, вода, пшеница)
    const PATCH = [['Вспаханная земля', 'soil_plowed', 0x7a4e2b], ['Гравий', 'dirt_path', 0xb08d57], ['Бетон', 'concrete', 0xb9b6ac], ['Асфальт', 'asphalt', 0x4a4f57], ['Трава', 'grass', 0x74b84f], ['Песок', null, 0xd8c690], ['Вода', null, 0x2f8fc4], ['Пшеница', 'wheat_field', 0xe0b44a]];
    function patchModel(it) {
      const k = Math.max(0, Math.min(PATCH.length - 1, it.v | 0)), P = PATCH[k], w = Math.max(2, it.w || 20), d = Math.max(2, it.d || 20), g = new T.Group();
      const material = k === 6 ? pmat(P[2], { roughness: 0.08, metalness: 0.05, envMapIntensity: 1.1 }) : P[1] && hasTex(P[1]) ? texMat(P[1], 1, 1, P[2]) : mat(P[2]);
      const m = new T.Mesh(uvBox(w, 0.03, d, w / 8, d / 8), material); m.position.y = 0.02 + k * 0.003; m.receiveShadow = true; m.castShadow = false; g.add(m); return g;
    }
    function decModel(it) {
      const t = it.t, v = Math.abs(Math.round(it.v || 0));
      let m;
      if (t === 'cottage') m = cottageFull(v);
      else if (t === 'patch') m = patchModel(it);
      else if (TREE_T[t]) m = MODEL('tree', t, { seed: v % 3 }, () => (t === 'bush' ? part('sph', 0x3f6b2a, 0, 0.8, 0, 1.8, 1.4, 1.8) : tree(2.2, t.indexOf('pine') >= 0 ? 'pine' : 'oak')));
      else if (BLD_T[t]) m = MODEL('building', t, { variant: v % 3 }, () => part('box', 0xd9c8a0, 0, 3, 0, 9, 6, 7));
      else m = MODEL('prop', t, { variant: v % 3, seed: v % 3 }, () => part('box', 0x9aa0a6, 0, 0.8, 0, 1.6, 1.6, 1.6));
      return m;
    }
    const DEC = { items: new Map(), chunks: new Map(), root: new T.Group(), CH: 64, seq: 0, dirty: new Set() };
    world.add(DEC.root);
    const decKey = (x, z) => Math.floor(x / DEC.CH) + ',' + Math.floor(z / DEC.CH);
    function decPlaceModel(it) { const m = decModel(it); m.position.set(it.x, 0, it.z); m.rotation.y = it.r || 0; if (it.s && it.s !== 1) m.scale.multiplyScalar(it.s); return m; }
    function decBake(key) {
      const c = DEC.chunks.get(key); if (!c) return;
      if (c.mesh) { DEC.root.remove(c.mesh); disposeObj(c.mesh); c.mesh = null; }
      const g = new T.Group(); let n = 0;
      for (const id of c.ids) { const it = DEC.items.get(id); if (!it || it.lift) continue; g.add(decPlaceModel(it)); n++; }
      if (n) { c.mesh = bakeTex(g); DEC.root.add(c.mesh); } else if (!c.ids.size) DEC.chunks.delete(key);
    }
    function decDirty(key) { DEC.dirty.add(key); }
    function decFlush() { for (const k of DEC.dirty) decBake(k); DEC.dirty.clear(); }
    function decAdd(it) {
      const wd = it.t === 'patch' ? { w: Math.max(2, +it.w || 20), d: Math.max(2, +it.d || 20) } : {};
      it = Object.assign({ t: it.t, v: it.v | 0, x: it.x, z: it.z, r: it.r || 0, s: it.s || 1 }, wd); it.id = 'd' + (++DEC.seq); it.key = decKey(it.x, it.z);
      DEC.items.set(it.id, it); let c = DEC.chunks.get(it.key); if (!c) { c = { ids: new Set(), mesh: null }; DEC.chunks.set(it.key, c); } c.ids.add(it.id); decDirty(it.key); return it;
    }
    function decRemove(id) { const it = DEC.items.get(id); if (!it) return; const c = DEC.chunks.get(it.key); if (c) c.ids.delete(id); DEC.items.delete(id); decDirty(it.key); }
    function decSet(id, patch) {
      const it = DEC.items.get(id); if (!it) return; Object.assign(it, patch);
      const nk = decKey(it.x, it.z);
      if (nk !== it.key) { const c = DEC.chunks.get(it.key); if (c) c.ids.delete(id); decDirty(it.key); it.key = nk; let c2 = DEC.chunks.get(nk); if (!c2) { c2 = { ids: new Set(), mesh: null }; DEC.chunks.set(nk, c2); } c2.ids.add(id); }
      decDirty(it.key);
    }
    function decSetAll(list) {
      for (const c of DEC.chunks.values()) if (c.mesh) { DEC.root.remove(c.mesh); disposeObj(c.mesh); }
      DEC.chunks.clear(); DEC.items.clear(); DEC.dirty.clear();
      for (const a of list) { const it = Array.isArray(a) ? { t: a[0], v: a[1], x: a[2], z: a[3], r: a[4], s: a[5], w: a[6], d: a[7] } : a; if (it && it.t && isFinite(it.x) && isFinite(it.z)) decAdd(it); }
      decFlush();
    }
    const r1 = (n) => Math.round(n * 10) / 10, r3 = (n) => Math.round(n * 1000) / 1000;
    const decExport = () => [...DEC.items.values()].map((it) => { const a = [it.t, it.v | 0, r1(it.x), r1(it.z), r3(it.r || 0), it.s && it.s !== 1 ? r1(it.s) : 1]; if (it.t === 'patch') a.push(r1(it.w), r1(it.d)); return a; });
    /** Ближайший предмет к точке (по размеру: маленькие выбираются легче больших). */
    function decNear(x, z) {
      let best = null, bs = 1e9;
      for (const it of DEC.items.values()) {
        if (it.t === 'patch') { const c = Math.cos(it.r || 0), sn = Math.sin(it.r || 0), dx = x - it.x, dz = z - it.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c; if (Math.abs(lx) < it.w / 2 && Math.abs(lz) < it.d / 2) { const sc = 1000 + it.w * it.d * 0.001; if (sc < bs) { bs = sc; best = it; } } continue; }
        const rad = (DEC_R[it.t] || 3) * (it.s || 1), d = Math.hypot(it.x - x, it.z - z); if (d < rad) { const sc = d / rad + rad * 0.02; if (sc < bs) { bs = sc; best = it; } }
      }
      return best;
    }

    // ============================================================ дороги (все дороги — одинаковые «куски», любой можно стереть или нарисовать новый)
    // Кусок: {a:[x0,z0,x1,z1], k, key}; k=0 — шоссе (8 м, разметка по краям), k=1 — улица в деревне (7 м, тротуары). Куски склеены по квадратам 64 м.
    const roadsG = new T.Group(); world.add(roadsG); const ROADS = [], ROADCH = new Map(), ROADDIRTY = new Set();
    const RKW = [RW, 7];
    let RAS = null, RCON = null;
    const uvBox = (w, h, d, ru, rv) => { const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv); return g; };
    const rkey = (a) => decKey((a[0] + a[2]) / 2, (a[1] + a[3]) / 2);
    function roadPieceInto(g, r) {
      if (!RAS) { RAS = texMat('asphalt', 1, 1, 0x4a4f57); RCON = texMat('concrete', 1, 1, 0xb9b6ac); }
      const [x0, z0, x1, z1] = r.a, horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0), w = RKW[r.k] || RW, L = Math.max(4, horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0)), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const put = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; };
      put(new T.Mesh(uvBox(horiz ? L : w, 0.08, horiz ? w : L, (horiz ? L : w) / 6, (horiz ? w : L) / 6), RAS), cx, 0.045, cz).receiveShadow = true;
      const d0 = -L / 2 + (r.k === 1 ? 3 : 2.5), dl = r.k === 1 ? 4 : 5, dw = r.k === 1 ? 0.3 : 0.35, step = r.k === 1 ? 9 : 10;
      for (let q = d0; q < L / 2 - 1.5; q += step) g.add(put(part('box', 0xe2c64a, 0, 0, 0, horiz ? dl : dw, 0.02, horiz ? dw : dl), horiz ? cx + q : cx, 0.1, horiz ? cz : cz + q));
      if (r.k === 0) for (const sd of [-1, 1]) g.add(put(part('box', 0xd9c35a, 0, 0, 0, horiz ? L : 0.3, 0.02, horiz ? 0.3 : L), horiz ? cx : cx + sd * (w / 2 - 0.5), 0.1, horiz ? cz + sd * (w / 2 - 0.5) : cz));
      else for (const sd of [-1, 1]) { const sw = new T.Mesh(uvBox(horiz ? L : 3.2, 0.1, horiz ? 3.2 : L, (horiz ? L : 3.2) / 8, (horiz ? 3.2 : L) / 8), RCON); put(sw, horiz ? cx : cx + sd * 5.3, 0.05, horiz ? cz + sd * 5.3 : cz).receiveShadow = true; }
    }
    function roadBake(key) {
      const c = ROADCH.get(key); if (!c) return;
      if (c.mesh) { roadsG.remove(c.mesh); disposeObj(c.mesh); c.mesh = null; }
      if (!c.list.size) { ROADCH.delete(key); return; }
      const g = new T.Group(); for (const r of c.list) roadPieceInto(g, r);
      c.mesh = bakeTex(g); roadsG.add(c.mesh);
    }
    function roadsFlush() { for (const k of ROADDIRTY) roadBake(k); ROADDIRTY.clear(); }
    function roadsAdd(a, k) {
      const r = { a: [+a[0], +a[1], +a[2], +a[3]], k: k === 1 ? 1 : 0 }; r.key = rkey(r.a); ROADS.push(r);
      let c = ROADCH.get(r.key); if (!c) { c = { list: new Set(), mesh: null }; ROADCH.set(r.key, c); } c.list.add(r); ROADDIRTY.add(r.key); return r;
    }
    /** Дорога любой длины: режется на куски по ~31 м, чтобы стирать можно было по частям. */
    function roadsAddLine(a, k) {
      const [x0, z0, x1, z1] = a, horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.max(1, Math.round(len / 31)), out = [];
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; out.push(roadsAdd([x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1], k)); }
      return out;
    }
    function roadsRemove(r) { const i = ROADS.indexOf(r); if (i < 0) return; ROADS.splice(i, 1); const c = ROADCH.get(r.key); if (c) c.list.delete(r); ROADDIRTY.add(r.key); }
    function roadsSetAll(list) {
      for (const c of ROADCH.values()) if (c.mesh) { roadsG.remove(c.mesh); disposeObj(c.mesh); }
      ROADCH.clear(); ROADS.length = 0; ROADDIRTY.clear();
      for (const a of list || []) if (a.length >= 4 && a.slice(0, 4).every(isFinite)) roadsAdd(a, a[4]);
      roadsFlush();
    }
    const roadsExport = () => ROADS.map((r) => [...r.a.map(r1), r.k]);
    function roadDist(r, x, z) { const [x0, z0, x1, z1] = r.a, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)); return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)); }
    const roadBox = (r) => { const [x0, z0, x1, z1] = r.a, hw = (RKW[r.k] || RW) / 2 + (r.k === 1 ? 3.2 : 0); const h = Math.abs(x1 - x0) >= Math.abs(z1 - z0); return h ? [Math.min(x0, x1), z0 - hw, Math.max(x0, x1), z0 + hw] : [x0 - hw, Math.min(z0, z1), x0 + hw, Math.max(z0, z1)]; };
    const DEFROADS = [];   // стандартные дороги карты (заполняется при сборке)

    // --- статика: дороги, город, деревни, лес, холмы
    const bMeshes = {}, clouds = [], townLabels = {}, BIG = {}, bGroups = {};
    let forestRebuild = null, defaultItemsRef = [];
    // лес по краям карты: владелец может вырубить любые деревья. CUTS — круги [x,z,r] и прямоугольники [x0,z0,x1,z1], где лес не растёт; NOFOREST — весь лес убран.
    const CUTS = [], NOFOREST = { v: false }, FOREST = { all: [], spots: [] };
    const cutHit = (x, z) => CUTS.some((c) => c.length === 3 ? Math.hypot(x - c[0], z - c[1]) < c[2] : x >= c[0] && x <= c[2] && z >= c[1] && z <= c[3]);
    const roadsSplit = (a, k) => { const [x0, z0, x1, z1] = a, h = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = h ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.max(1, Math.round(len / 31)), o = []; for (let i = 0; i < n; i++) o.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, x0 + (x1 - x0) * (i + 1) / n, z0 + (z1 - z0) * (i + 1) / n, k]); return o; };
    (function buildStatic() {
      const ZEND = ROAD_Z[ROAD_Z.length - 1], zTop = -100, zBot = ROAD_F + RW / 2, zMid = (zTop + zBot) / 2, zLen = zBot - zTop;
      const defRoad = (x0, z0, x1, z1, k) => { const h = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = h ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.max(1, Math.round(len / 31)); for (let i = 0; i < n; i++) DEFROADS.push([r1(x0 + (x1 - x0) * i / n), r1(z0 + (z1 - z0) * i / n), r1(x0 + (x1 - x0) * (i + 1) / n), r1(z0 + (z1 - z0) * (i + 1) / n), k]); };
      for (const z of [ROAD_N, ...ROAD_Z]) defRoad(-310, z, 310, z, 0);
      defRoad(-540, ROAD_F, 540, ROAD_F, 0);   // дорога вдоль полей длиннее: поля стоят шире города
      for (const x of ROAD_X) defRoad(x, zTop, x, zBot, 0);
      const bayG = new T.Group(); bayG.position.set(BAY[0], 0, BAY[1]); bayG.rotation.y = BIG_ROT.bay || 0; world.add(bayG); bGroups.bayG = bayG;   // стоянка техники рядом с полем
      { const bay = part('box', 0xb9b6ac, 0, 0.05, 0, 72, 0.1, 14); bay.material = texMat('concrete', 14, 3, 0xbdb9ad); bay.castShadow = false; bayG.add(bay);
        townLabels.bay = addLabel('map', '🚜 Стоянка техники', new T.Vector3(BAY[0], 9, BAY[1]), 'bld', () => cb.onBuilding('tech')); townLabels.bay.maxCam = 260; }
      // город: ряд зданий у дороги
      for (const [id, [x, z]] of Object.entries(TOWN)) {
        const b = MODEL('building', TOWN_MODEL[id], {}, () => { const m = buildingModel(id); m.scale.setScalar(2.5); return m; });
        b.position.set(x, 0, z); b.rotation.y = TOWN_ROT[id] || 0; world.add(b); bMeshes[id] = b;
        b.traverse((o) => { o.userData.bid = id; });
        townLabels[id] = addLabel('map', CITY.names[id], new T.Vector3(x, 17, z), 'bld', () => cb.onBuilding(id));
      }
      // лесопилка у северной дороги (всё в одной группе: её можно двигать и поворачивать)
      { const smG = new T.Group(); smG.position.set(SAWMILL_POS[0], 0, SAWMILL_POS[1]); smG.rotation.y = BIG_ROT.sawmill || 0; world.add(smG); bGroups.sawmillG = smG;
        const sm = MODEL('building', 'sawmill', {}, () => { const g = new T.Group(); g.add(part('box', 0x8a9096, 0, 4, 0, 18, 8, 12)); g.add(gable(20, 14, 3, 0x6d7378, 0, 8, 0)); return g; });
        smG.add(sm); sm.traverse((o) => { o.userData.bid = 'sawmill'; }); bMeshes.sawmill = sm;
        const yard = part('box', 0xb3a58a, 0, 0.03, 6, 46, 0.06, 40); yard.material = texMat('dirt_path', 10, 8, 0xb9ab8e); yard.castShadow = false; smG.add(yard);
        townLabels.sawmill = addLabel('map', '🪚 Лесопилка', new T.Vector3(SAWMILL_POS[0], 15, SAWMILL_POS[1]), 'bld', () => cb.onBuilding('sawmill'));
        const lane = part('box', 0x4a4f57, 0, 0.05, (ROAD_N - SAWMILL_POS[1]) / 2 + 8, 7, 0.08, ROAD_N - SAWMILL_POS[1] + 6); lane.material = texMat('asphalt', 1, 3, 0x4a4f57); lane.castShadow = false; smG.add(lane);
        for (let i = 0; i < 4; i++) { const lp = MODEL('forest', 'logpile', { size: 1 + (i % 3) }, () => part('cyl', 0x6d4c2f, 0, 0.8, 0, 2, 1.6, 6)); lp.position.set(-22 + i * 7, 0, 15); lp.rotation.y = i * 0.7; smG.add(lp); }
        for (let i = 0; i < 3; i++) { const pk = MODEL('forest', 'plankstack', { size: 1 + (i % 3) }, () => part('box', 0xd9b779, 0, 0.8, 0, 3, 1.6, 1.8)); pk.position.set(14 + i * 5, 0, 14); smG.add(pk); } }
      // стройплощадки (по уровню): бетонные площадки у северной дороги; каждая в своей группе
      const siteG = SITE_POS.map(([x, z]) => { const g = new T.Group(); g.position.set(x, 0, z); const pad = part('box', 0xb9b6ac, 0, 0.05, 0, 28, 0.1, 22); pad.material = texMat('concrete', 5, 4, 0xbdb9ad); pad.castShadow = false; g.add(pad); const pth = part('box', 0xb08d57, 0, 0.04, (ROAD_N - z) / 2 + 6, 5, 0.06, z - ROAD_N - 22 + 12); pth.material = texMat('dirt_path', 1, 3, 0xb08d57); pth.castShadow = false; g.add(pth); world.add(g); return g; });
      bGroups.siteG = siteG;
      // пруд с пирсом на свободном участке (в группе)
      const pondG = new T.Group(); pondG.position.set(POND[0], 0, POND[1]); pondG.rotation.y = BIG_ROT.pond || 0; world.add(pondG); bGroups.pondG = pondG;
      { const pond = MODEL('prop', 'pond', {}, () => { const q = part('cyl', 0x3f9fd6, 0, 0.07, 0, 54, 0.1, 42); q.castShadow = false; return q; }); pondG.add(pond);
        const d = MODEL('prop', 'dock', {}, () => new T.Group()); d.position.set(0, 0, -18); d.rotation.y = Math.PI; pondG.add(d); }
      // дома, деревни и деревья: сначала собираем СТАНДАРТНЫЙ список предметов; если у владельца есть своя расстановка, берём её
      const rng = (() => { let q = 5; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
      const defItems = [], pushI = (t, v, x, z, r, s) => defItems.push({ t, v: Math.abs(Math.round(v)), x, z, r: r || 0, s: s || 1 });
      const lowT = (i) => ['oakLow', 'pineLow', 'oakLow', 'oakLow'][Math.abs(Math.round(i)) % 4], bigT = (i) => ['oak', 'pine', 'birch', 'fruit'][Math.abs(Math.round(i)) % 4];
      const VILLAGES = [[-330, 10], [330, 10], [-300, 150], [320, 140], [-40, -250], [-290, -170], [330, -170]]; // центры деревень (улица идёт по оси X)
      // улицы с домами: дома стоят ровными рядами лицом к улице, с палисадниками и деревьями
      const street = (x0, x1, zc, seed) => {
        defRoad(x0, zc, x1, zc, 1);
        let n = 0;
        for (let x = x0 + 8; x <= x1 - 8; x += 15) {
          if (ROAD_X.some((rx) => Math.abs(x - rx) < 12)) continue;
          for (const sd of [-1, 1]) {
            n++; pushI('cottage', seed + n + (sd > 0 ? 2 : 0), x, zc + sd * 12.5, sd < 0 ? 0 : Math.PI);
            if (n % 3 === 0) pushI(lowT(n), n, x + 7.4, zc + sd * 14, 0);
          }
          if (((x - x0) / 15) % 2 === 0) pushI('streetLamp', 0, x + 7.5, zc - 5.4, 0);
        }
      };
      street(-150, 150, 130, 0); street(-150, 150, 170, 40);
      for (const [vx, vz] of VILLAGES) street(vx - 50, vx + 50, vz, vx);
      // рощи: деревья растут группами (как в природе), а не одиночками посреди травы
      const farmBoxes = Object.values(SLOT).map(([sx, sz]) => [sx - 66, sx + 66, sz - 46, sz + 46]);
      const free = (x, z, m) => {
        if (ROAD_X.some((rx) => Math.abs(x - rx) < RW / 2 + m)) return false;
        if (ROAD_Z.concat([ROAD_N]).some((rz) => Math.abs(z - rz) < RW / 2 + m)) return false;
        if (farmBoxes.some(([a, b, c, d]) => x > a - m && x < b + m && z > c - m && z < d + m)) return false;
        if (z > 60 && z < 106 && x > -135 && x < 90) return false; // город
        if (z > 110 && z < 190 && x > -165 && x < 165) return false; // улицы с домами
        if (Math.hypot(x - POND[0], z - POND[1]) < 36) return false; // пруд
        if (Math.abs(x - SAWMILL_POS[0]) < 36 && z < ROAD_N + 2 && z > ROAD_N - 50) return false;
        if (SITE_POS.some(([sx, sz]) => Math.abs(x - sx) < 24 && Math.abs(z - sz) < 26)) return false;
        if (VILLAGES.some(([vx, vz]) => Math.abs(x - vx) < 60 && Math.abs(z - vz) < 24)) return false;
        if (DECO.some((f) => Math.abs(x - f.cx) < f.w / 2 + m + 6 && Math.abs(z - f.cz) < f.d / 2 + m + 6)) return false;
        if (Math.abs(x) > 335) return false;
        return true;
      };
      let tn = 0;
      for (let c = 0, tries = 0; c < 46 && tries < 900; tries++) { // рощи
        const cx = (rng() - 0.5) * 640, cz = -96 + rng() * 300, R = 7 + rng() * 11, n = 7 + Math.floor(rng() * 12);
        if (!free(cx, cz, R * 0.6)) continue; c++;
        for (let j = 0; j < n; j++) {
          const a = rng() * 6.283, d = Math.sqrt(rng()) * R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
          if (!free(x, z, 3)) continue; tn++;
          const edge = d > R * 0.7 && rng() < 0.55, big = edge ? false : rng() < 0.28, ti = tn + c * 3, rot = rng() * 6.283, sc = edge ? 1 : 0.8 + rng() * 0.5;
          if (edge) pushI('bush', tn, x, z, rot, 1); else pushI(big ? bigT(ti) : lowT(ti), ti, x, z, rot, sc);
        }
      }
      for (let k = 0, tries = 0; k < 60 && tries < 500; tries++) { // живые изгороди и одиночные кусты вдоль дорог
        const horiz = rng() < 0.5, z0 = ROAD_Z[Math.floor(rng() * ROAD_Z.length)], x0 = ROAD_X[Math.floor(rng() * ROAD_X.length)];
        const len = 14 + Math.floor(rng() * 20), sd = rng() < 0.5 ? -1 : 1, off = RW / 2 + 3.2;
        const ax = horiz ? (rng() - 0.5) * 560 : x0 + sd * off, az = horiz ? z0 + sd * off : -90 + rng() * 280;
        if (!free(ax, az, 1.5) || !free(horiz ? ax + len : ax, horiz ? az : az + len, 1.5)) continue; k++;
        for (let q = 0; q < len; q += 3.2) { tn++; pushI('bush', tn, horiz ? ax + q : ax, horiz ? az : az + q, rng() * 6.283, 1); }
      }
      // фонари и столбы вдоль главных дорог
      for (let x = -300; x <= 300; x += 30) for (const z of [-RW / 2 - 2.5, RW / 2 + 2.5, ROAD_Z[1] - RW / 2 - 2.5, ROAD_Z[1] + RW / 2 + 2.5, ROAD_Z[2] - RW / 2 - 2.5, ROAD_Z[2] + RW / 2 + 2.5])
        pushI((x / 30) % 2 === 0 ? 'powerPole' : 'streetLamp', 0, x, z, z < 30 ? (z < 0 ? 0 : Math.PI) : (z < ROAD_Z[1] ? 0 : Math.PI));
      defaultItemsRef = defItems; decSetAll(LAY0 ? LAY0.items : defItems);
      roadsSetAll(LAY0 && LAY0.rd ? LAY0.rd : DEFROADS.concat(((LAY0 && LAY0.roads) || []).flatMap((a) => roadsSplit(a, 0))));
      if (LAY0) { CUTS.length = 0; for (const c of LAY0.cut || []) CUTS.push(c.map(Number)); NOFOREST.v = !!LAY0.nf; }
      // лес по краям карты (instancing): можно пересобрать после правок в редакторе, чтобы деревья не росли сквозь дома
      const deco = DECO.map((f) => [f.cx, f.cz, f.w, f.d]), forestMeshes = [];
      const nz = (x, z) => (Math.sin(x * 0.0113 + 1.3) + Math.sin(z * 0.0131 + 0.4) + Math.sin((x + z) * 0.0071 + 2.1) + Math.sin((x - z) * 0.0173 + 0.7) + 0.7 * Math.sin(x * 0.031 + z * 0.027)) / 4.7;
      const sm = (e0, e1, v) => { const q = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return q * q * (3 - 2 * q); };
      const trunkGeo = G.cyl(), coneGeo = G.cone(), sphGeo = new T.SphereGeometry(0.5, 7, 6);
      forestRebuild = () => {
        for (const m of forestMeshes) { world.remove(m); m.dispose && m.dispose(); } forestMeshes.length = 0;
        let q = 4242; const frng = () => (q = (q * 16807) % 2147483647) / 2147483647;
        const grid = new Set(), mark = (x0, z0, x1, z1) => { for (let gx = Math.floor(x0 / 12); gx <= Math.floor(x1 / 12); gx++) for (let gz = Math.floor(z0 / 12); gz <= Math.floor(z1 / 12); gz++) grid.add(gx + ',' + gz); };
        for (const it of DEC.items.values()) if (BLD_T[it.t]) { const r = (DEC_R[it.t] || 6) + 9; mark(it.x - r, it.z - r, it.x + r, it.z + r); }
        for (const b of Object.values(BIG)) { const bb = b.bounds && b.bounds(); if (bb) mark(bb[0] - 9, bb[1] - 9, bb[2] + 9, bb[3] + 9); }
        for (const r of ROADS) { const [x0, z0, x1, z1] = r.a; mark(Math.min(x0, x1) - 10, Math.min(z0, z1) - 10, Math.max(x0, x1) + 10, Math.max(z0, z1) + 10); }
        const blocked = (x, z) => grid.has(Math.floor(x / 12) + ',' + Math.floor(z / 12));
        const treeSpots = [], FS = W.lite ? 8 : 6; FOREST.all = [];
        for (let x = -560; x <= 560; x += FS) for (let z = -430; z <= 480; z += FS) {
          const rA = frng(), rB = frng(), rC = frng(), rD = frng(), rE = frng(), rF = frng();   // одинаковое число случайных чисел на клетку: лес не «перетасовывается» от правок
          const px = x + (rA - 0.5) * (FS - 1), pz = z + (rB - 0.5) * (FS - 1);
          if (NOFOREST.v) continue;
          const inCore = px > -300 && px < 290 && pz > -192 && pz < 190;
          if (deco.some(([cx, cz, w, d]) => Math.abs(px - cx) < w / 2 + 4 && Math.abs(pz - cz) < d / 2 + 4)) continue;
          if (VILLAGES.some(([vx, vz]) => Math.abs(px - vx) < 60 && Math.abs(pz - vz) < 28)) continue;
          if (inCore) continue;   // внутри обжитой части лес не растёт: там всё расставляет владелец
          if (blocked(px, pz)) continue;
          const dc = Math.hypot(Math.max(-300 - px, px - 290, 0), Math.max(-192 - pz, pz - 190, 0)); // расстояние до обжитой части карты
          const p = sm(-0.12, 0.18, nz(px, pz) + 0.55 * sm(40, 200, dc) - 0.15 * (1 - sm(0, 40, dc))); if (rC > p && rD > 0.001) continue;
          const stand = nz(px * 0.6 + 90, pz * 0.6 - 40) > 0;
          const sp = [px, pz, 1.8 + rE * 1.8, stand ? rF * 0.62 : 0.4 + rF * 0.6]; FOREST.all.push(sp);
          if (cutHit(px, pz)) continue;
          treeSpots.push(sp);
        }
        FOREST.spots = treeSpots;
        const pines = treeSpots.filter((t) => t[3] < 0.55), oaks = treeSpots.filter((t) => t[3] >= 0.55);
        const mk = (geoms, list, build) => {
          const m = new T.InstancedMesh(geoms, new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, list.length)); m.castShadow = !W.lite; m.receiveShadow = true; m.count = list.length;
          const d = new T.Object3D(), c = new T.Color();
          list.forEach((t, i) => { build(d, t, c); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, c); }); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; world.add(m); forestMeshes.push(m); return m;
        };
        const green = (c, t) => c.setHSL(0.24 + (t[3] * 7 % 1) * 0.08, 0.36, 0.13 + (t[3] * 13 % 1) * 0.12);
        mk(trunkGeo, treeSpots, (d, t, c) => { d.position.set(t[0], 0.5 * t[2], t[1]); d.scale.set(0.25 * t[2], 1.0 * t[2], 0.25 * t[2]); d.rotation.set(0, 0, 0); c.set(0x5d4037); });
        mk(coneGeo, pines, (d, t, c) => { d.position.set(t[0], 1.8 * t[2], t[1]); d.scale.set(1.5 * t[2], 2.4 * t[2], 1.5 * t[2]); green(c, t); });
        mk(coneGeo, pines, (d, t, c) => { d.position.set(t[0], 2.8 * t[2], t[1]); d.scale.set(1.1 * t[2], 1.8 * t[2], 1.1 * t[2]); green(c, t); });
        mk(sphGeo, oaks, (d, t, c) => { d.position.set(t[0], 2.0 * t[2], t[1]); d.scale.set(2.3 * t[2], 1.9 * t[2], 2.3 * t[2]); green(c, t); c.offsetHSL(0.02, 0.05, 0.03); });
      };
      // большие поля по краям карты: просто для красоты, как на настоящей ферме
      DECO.forEach(({ cx, cz, w, d, kind }) => {
        if (!kind) return;
        const col = { wheat_field: 0xe0b44a, soil_plowed: 0x7a4e2b, grass: 0x82c45a }[kind];
        const f = part('box', col, cx, 0.05, cz, w, 0.1, d); f.material = texMat(kind, w / 14, d / 14, col); f.castShadow = false; world.add(f);
        for (let k = -1; k <= 1; k += 2) { const h = part('box', 0xa89268, cx, 0.03, cz + k * (d / 2 + 1.5), w + 6, 0.06, 3); h.material = texMat('dirt_path', w / 8, 0.5, 0xa89268); h.castShadow = false; world.add(h); }
      });
      // дальние холмы и облака
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r = 1050 + (i % 3) * 80; const h = part('sph', 0x3d7a3a, Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 0.8 + 40, 200 + (i % 4) * 40, 110 + (i % 5) * 30, 200 + (i % 4) * 40); h.castShadow = false; world.add(h); }
      // облаков нет: они висели над картой белыми пятнами
    })();

    // --- фермы
    const views = [];
    const tileCol = { grass: [0x74b84f, 0x6cae49], soil: 0x7a4e2b, wet: 0x4e3320 };
    const BIGPLANT = { pumpkin: 1, watermelon: 1, cabbage: 1, pineapple: 1, eggplant: 1 };
    function fieldPlants(key, stage, i) {
      const g = new T.Group(), dens = BIGPLANT[key] ? 2 : 3, sc = dens === 3 ? 0.46 : 0.6;
      for (let a = 0; a < dens; a++) for (let b = 0; b < dens; b++) {
        const m = cropModel(key, stage); m.scale.setScalar(sc * (0.9 + ((i * 7 + a * 3 + b) % 5) * 0.05));
        m.position.set(((a + 0.5) / dens - 0.5) * 0.86 + (((i + a) % 3) - 1) * 0.02, 0, ((b + 0.5) / dens - 0.5) * 0.86); m.rotation.y = (i + a * 2 + b * 5) % 6.28; g.add(m);
      }
      return bake(g, 0.1);
    }
    // --- лес: деревья рисуются через InstancedMesh (быстро), пни, камни и молодые деревья — отдельными моделями
    const treePartsCache = {};
    function treeParts(sp, v) {
      const key = sp + v; if (treePartsCache[key]) return treePartsCache[key];
      const g = MODEL('tree', sp, { seed: v }, () => { const q = tree(3 + v * 0.5, sp === 'pine' ? 'pine' : 'oak'); return bake(q, 0.12); });
      g.updateMatrixWorld(true); const parts = []; g.traverse((o) => { if (o.isMesh && !o.material.transparent) parts.push({ geo: o.geometry, mat: o.material, mw: o.matrixWorld.clone() }); });
      return (treePartsCache[key] = parts);
    }
    const hash2 = (i, k) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    function treeInit(fv, w, h) { fv.treeInst = {}; fv.treeAt = new Array(w * h).fill(null); }
    function treeAdd(fv, i, sp) {
      const v = Math.floor(hash2(i, 1) * 3), key = sp + v; let ent = fv.treeInst[key];
      if (!ent) { const cap = fv.w * fv.h; ent = fv.treeInst[key] = { tiles: [], meshes: treeParts(sp, v).map((pt) => { const m = new T.InstancedMesh(pt.geo, pt.mat, cap); m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false; world.add(m); return { m, pt }; }) }; }
      const x = i % fv.w, y = (i / fv.w) | 0, [wx, wz] = tileWorld(fv, x, y), M = new T.Matrix4(), sc = 0.85 + hash2(i, 2) * 0.4;
      M.compose(new T.Vector3(wx + (hash2(i, 3) - 0.5) * 1.6, 0, wz + (hash2(i, 4) - 0.5) * 1.6), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), hash2(i, 5) * 6.28), new T.Vector3(sc, sc * (0.9 + hash2(i, 6) * 0.25), sc));
      const slot = ent.tiles.length; ent.tiles.push(i); fv.treeAt[i] = { key, slot, M };
      for (const { m, pt } of ent.meshes) { m.setMatrixAt(slot, new T.Matrix4().multiplyMatrices(M, pt.mw)); m.count = ent.tiles.length; m.instanceMatrix.needsUpdate = true; }
    }
    function treeRemove(fv, i) {
      const at = fv.treeAt[i]; if (!at) return; const ent = fv.treeInst[at.key], last = ent.tiles.length - 1, li = ent.tiles[last];
      if (at.slot !== last) { const lm = fv.treeAt[li].M; for (const { m, pt } of ent.meshes) m.setMatrixAt(at.slot, new T.Matrix4().multiplyMatrices(lm, pt.mw)); ent.tiles[at.slot] = li; fv.treeAt[li].slot = at.slot; }
      ent.tiles.pop(); for (const { m } of ent.meshes) { m.count = ent.tiles.length; m.instanceMatrix.needsUpdate = true; } fv.treeAt[i] = null;
    }
    function treeClear(fv) { for (const ent of Object.values(fv.treeInst || {})) for (const { m } of ent.meshes) { world.remove(m); m.dispose && m.dispose(); } fv.treeInst = {}; fv.treeAt = []; }
    const falling = [];
    function fellAnim(fv, x, y, sp) {
      const [wx, wz] = tileWorld(fv, x, y), v = Math.floor(hash2(y * fv.w + x, 1) * 3);
      const g = MODEL('tree', sp || 'oak', { seed: v }, () => tree(3, sp === 'pine' ? 'pine' : 'oak')); const piv = new T.Group(); piv.position.set(wx, 0, wz); piv.add(g); world.add(piv);
      falling.push({ piv, t: 0, dir: Math.random() * 6.28 });
    }
    function tileMaterial(kind, wet, x, y) {
      if (kind === 'forest') return hasTex('grass') ? texMat('grass', 0.5, 0.5, 0x6b7c45, (x % 2) * 0.5, (y % 2) * 0.5, ((x + y) % 2) * Math.PI / 2) : mat(0x4a5a2a);
      const v = (x * 7 + y * 13) % 4, ox = (v & 1) * 0.5, oy = (v >> 1) * 0.5;
      if (kind === 'grass') return hasTex('grass') ? texMat('grass', 0.5, 0.5, 0x74b84f, ox, oy, ((x + y) % 2) * Math.PI / 2) : mat(tileCol.grass[(x + y) & 1]);
      return wet ? texMat('soil_wet', 0.5, 0.5, tileCol.wet, ox, oy) : texMat('soil_plowed', 0.5, 0.5, tileCol.soil, ox, oy);
    }
    const tileSig = (t, wet) => (t.k === 'crop' ? 'c' + t.crop + L.stage(t) + (wet ? 'w' : '') : t.k === 'tree' ? 'tree' + t.sp : t.k === 'stump' ? 'stump' + t.sp : t.k === 'rock' ? 'rock' + t.v : t.k === 'young' ? 'young' + t.sp + Math.min(2, Math.floor(t.progress / L.YOUNG_MS * 3)) : t.k);

    function createView(di) {
      const def = L.FARM_DEFS[di], [sx, sz] = SLOT[def.id];
      const fv = { di, def, id: def.id, sx, sz, sgn: BIG_ROT['y:' + def.id] != null ? (BIG_ROT['y:' + def.id] > 1.5 ? -1 : 1) : (sz < 0 ? 1 : -1), cx: FIELD_POS[def.id] ? FIELD_POS[def.id][0] - FW_MAX * TS / 2 + def.plots[0][0] * TS / 2 : sx + FIELD_LEFT + def.plots[0][0] * TS / 2, cz: FIELD_POS[def.id] ? FIELD_POS[def.id][1] : sz, key: '', w: 0, h: 0, tiles: [], g: new T.Group(), tg: new T.Group(), crops: new T.Group(), props: new T.Group(), w3: new T.Group(), extra: null, sig: '', sfi: -1, animals: [], animalSig: '', pen: null, drone: null, labels: [], penLabel: null };
      fv.g.scale.setScalar(TS); fv.g.add(fv.tg); fv.g.add(fv.crops); fv.g.add(fv.props); world.add(fv.g);
      fv.w3.position.set(sx, 0, sz); world.add(fv.w3);
      return fv;
    }
    /** Двор фермы: дом, амбар, силосы, сарай, хозяйственные постройки и (на домашней ферме) загон для животных. Координаты: x от центра участка, zr от центра к дороге. */
    /** Лагерь лесорубов у целины/леса: домик, брёвна, стоянка техники. */
    function buildWildStead(fv, owned, S) {
      const g = fv.w3, sg = fv.sgn, face = sg > 0 ? 0 : Math.PI, Z = (zr) => sg * zr, def = fv.def;
      const place = (m, x, zr, rot) => { m.position.set(x, 0, Z(zr)); m.rotation.y = face + (rot || 0); g.add(m); return m; };
      { const yard = part('box', 0xa89a7c, -26, 0.03, Z(-6), 52, 0.06, 56); yard.material = texMat('dirt_path', 10, 10, 0xa89a7c); yard.castShadow = false; g.add(yard); }
      place(MODEL('building', 'loggerHut', {}, () => { const h = house(5, 4, 2.6, 0xa8794a, 0x5d4037); h.scale.setScalar(1.7); return h; }), -34, 8);
      for (let i = 0; i < 3; i++) place(MODEL('forest', 'logpile', { size: 1 + (i % 3) }, () => part('cyl', 0x6d4c2f, 0, 0.8, 0, 2, 1.6, 6)), -44 + i * 5, -14, i * 0.5);
      place(MODEL('forest', 'branchpile', {}, () => part('sph', 0x6b5a3a, 0, 0.7, 0, 3, 1.4, 3)), -12, -26, 0.3);
      place(MODEL('forest', 'chips', {}, () => part('sph', 0xcaa56a, 0, 0.5, 0, 3, 1, 3)), -8, -14);
      { const bay = MODEL('prop', 'parkingBay', {}, () => { const b = part('box', 0xb9b9b4, 0, 0.04, 0, 15, 0.08, 10); b.material = texMat('concrete', 3, 2, 0xb9b9b4); return b; }); bay.position.set(-38, 0, Z(-28)); g.add(bay); }
      rails(g, [[-50, Z(-40)], [-2, Z(-40)]], 0x8a6a42, 1.1, 3);
      if (owned) fv.labels.push(addLabel('map', `${def.icon} ${def.name}`, new T.Vector3(fv.sx - 34, 12, fv.sz + Z(8)), 'bld', () => cb.onFarmSign(def.id)));
      else { const lock = !(S.level >= def.level); const l = addLabel('map', `${def.icon} ${def.name}<br><small>${lock ? '🔒 с ' + def.level + ' уровня' : '🛒 купить за ' + def.cost + ' 🪙'}</small>`, new T.Vector3(fv.sx - 20, 14, fv.sz + Z(6)), 'bld' + (lock ? ' locked' : ''), () => cb.onFarmSign(def.id)); l.dyn = true; fv.labels.push(l); }
    }
    function buildStead(fv, owned, S) {
      if (fv.def.wild || fv.def.forestry) return buildWildStead(fv, owned, S);
      const g = fv.w3, sg = fv.sgn, face = sg > 0 ? 0 : Math.PI, Z = (zr) => sg * zr, def = fv.def;
      const place = (m, x, zr, rot) => { m.position.set(x, 0, Z(zr)); m.rotation.y = face + (rot || 0); g.add(m); return m; };
      { const yard = part('box', 0xb3a58a, -22, 0.03, Z(0), 62, 0.06, 40); yard.material = texMat('dirt_path', 14, 9, 0xb3a58a); yard.material = texMat('concrete', 10, 7, 0xc9c3b0); yard.castShadow = false; g.add(yard); }
      { const lane = part('box', 0x4a4f57, -30, 0.05, Z(24), 7, 0.08, 18); lane.material = texMat('asphalt', 1, 3, 0x4a4f57); lane.castShadow = false; g.add(lane); }
      const farmhouse = place(MODEL('building', 'farmhouse', { variant: fv.di % 3 }, () => { const h = house(5, 4, 3, 0xeee4cf, 0xb23a2a); h.scale.setScalar(2.4); return h; }), -8, 9);
      const barn = place(MODEL('building', 'barn', { variant: fv.di % 3 }, () => { const b = buildingModel(def.id); b.children[0].visible = false; b.scale.setScalar(2.8); return b; }), -31, -8);
      barn.traverse((o) => { o.userData.bid = 'warehouse'; });
      place(MODEL('building', 'silos', {}, () => { const s2 = new T.Group(); for (let i = 0; i < 3; i++) s2.add(part('cyl', 0xcfd8dc, i * 5 - 5, 6, 0, 4.4, 12 + i * 2, 4.4)); return s2; }), -52, -9);
      place(MODEL('building', 'shed', {}, () => { const s3 = new T.Group(); s3.add(part('box', 0x9aa0a6, 0, 3, -3, 14, 6, 0.4)); s3.add(gable(15, 8, 2.5, 0x8a9096, 0, 6, 0)); return s3; }), -8, -10);
      place(MODEL('building', fv.di % 2 ? 'greenhouse' : 'haybarn', {}, () => { const s4 = new T.Group(); s4.add(part('box', 0xd9c27a, 0, 1.5, 0, 9, 3, 6)); return s4; }), 2, -17);
      place(MODEL('building', 'stable', {}, () => { const s5 = house(7, 3, 2.4, 0xf0e8d2, 0xb23a2a); s5.scale.setScalar(2.2); return s5; }), -36, 10);
      // деревья вокруг двора
      for (let i = 0; i < 9; i++) { if (fv.id === 'home' && i % 2 === 0 && i < 7) continue; const t = MODEL('tree', i % 3 === 0 ? 'fruit' : i % 3 === 1 ? 'oak' : 'birch', { seed: i % 3 }, () => tree(2 + (i % 3) * 0.5, 'oak')); t.position.set(-60 + i * 8, 0, Z(fv.id === 'home' ? -19 : (i % 2 ? 19 : -19))); g.add(t); }
      // белый забор вокруг дома
      rails(g, [[-17, Z(3)], [3, Z(3)], [3, Z(16)], [-17, Z(16)], [-17, Z(3)]], 0xf2eee4, 1.0, 2);
      if (fv.id === 'home') { // стоянка техники и загон
        const pen = { x: -36, z: Z(21), w: 28, d: 11 }; fv.pen = pen;
        { const pf = part('box', 0x93c46d, pen.x, 0.04, pen.z, pen.w, 0.08, pen.d); pf.material = texMat('dirt_path', 6, 2.5, 0x93c46d); pf.castShadow = false; g.add(pf); }
        rails(g, [[pen.x - pen.w / 2, pen.z - pen.d / 2], [pen.x + pen.w / 2, pen.z - pen.d / 2], [pen.x + pen.w / 2, pen.z + pen.d / 2], [pen.x - pen.w / 2, pen.z + pen.d / 2], [pen.x - pen.w / 2, pen.z - pen.d / 2]], 0x5e432a, 1.3, 2.5);
        const fd = MODEL('prop', 'roundFeeder', {}, () => { const f = new T.Group(); f.add(part('cyl', 0x6d4c2f, 0, 0.6, 0, 3, 1.2, 3)); f.add(part('cyl', 0xd8c06a, 0, 1.0, 0, 2.6, 0.5, 2.6)); return f; }); fd.position.set(pen.x - 8, 0, pen.z); g.add(fd);
        const tr = MODEL('prop', 'waterTrough', {}, () => part('box', 0x7a8a96, 0, 0.5, 0, 4, 0.9, 1.2)); tr.position.set(pen.x + 7, 0, pen.z + sg * 3); g.add(tr);
        const mt = MODEL('prop', 'manureTank', {}, () => part('cyl', 0x9ea3a6, 0, 1.2, 0, 8, 2.4, 8)); mt.position.set(pen.x + 22, 0, Z(26)); g.add(mt);
        fv.penLabel = addLabel('map', '', new T.Vector3(fv.sx + pen.x, 8, fv.sz + pen.z), 'penlbl', () => cb.onPen()); fv.labels.push(fv.penLabel);
      }
      if (owned) fv.labels.push(addLabel('map', `${def.icon} ${def.name}`, new T.Vector3(fv.sx - 31, 16, fv.sz + Z(-8)), 'bld', () => cb.onBuilding('warehouse')));
      else {
        const lock = !(S.level >= def.level);
        const l = addLabel('map', `${def.icon} ${def.name}<br><small>${lock ? '🔒 с ' + def.level + ' уровня' : '🛒 купить за ' + def.cost + ' 🪙'}</small>`, new T.Vector3(fv.sx - 8, 14, fv.sz + Z(9)), 'bld' + (lock ? ' locked' : ''), () => cb.onFarmSign(def.id)); l.dyn = true; fv.labels.push(l);
      }
    }
    function buildStatic(fv, S, owned, w, h) {
      for (const g of [fv.tg, fv.crops, fv.props, fv.w3]) { while (g.children.length) { const c = g.children[0]; g.remove(c); disposeObj(c); } }
      for (const l of fv.labels || []) dropLabel(l); fv.labels = []; fv.tiles = []; fv.animals = []; fv.animalSig = ''; fv.sig = ''; fv.extra = null; fv.drone = null; fv.pen = null; fv.penLabel = null;
      const FP = FIELD_POS[fv.id];
      treeClear(fv); fv.w = w; fv.h = h; fv.cx = FP ? FP[0] - FW_MAX * TS / 2 + w * TS / 2 : fv.sx + FIELD_LEFT + w * TS / 2; fv.cz = FP ? FP[1] : fv.sz; fv.g.position.set(fv.cx, 0, fv.cz); treeInit(fv, w, h);
      const fenceC = 0x8a6a42;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = part('box', 0x74b84f, x - w / 2 + 0.5, 0.05, y - h / 2 + 0.5, 1.0, 0.1, 1.0); m.material = tileMaterial('grass', false, x, y); m.castShadow = false;
        fv.tg.add(m); fv.tiles.push({ mesh: m, sig: '', model: null });
      }
      if (FP) {
        // отдельное большое поле: без забора, по краям полевая дорожка, к дороге ведёт колея, на углах жёлтые колышки
        const tr = (x, z, sx2, sz2) => { const t = part('box', 0xb08d57, x, 0.03, z, sx2, 0.06, sz2); t.material = texMat('dirt_path', Math.max(1, sx2 / 2), Math.max(1, sz2 / 2), 0xb08d57); t.castShadow = false; fv.props.add(t); };
        tr(0, -h / 2 - 0.6, w + 2.4, 1.2); tr(0, h / 2 + 0.6, w + 2.4, 1.2); tr(-w / 2 - 0.6, 0, 1.2, h); tr(w / 2 + 0.6, 0, 1.2, h);
        const toRoad = (fv.cz - h * TS / 2 - 1.2 * TS) - (ROAD_F + RW / 2);
        if (toRoad > 0) tr(0, -h / 2 - 1.2 - toRoad / TS / 2, 1.6, toRoad / TS);
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fv.props.add(part('cyl', 0xf2c230, px * (w / 2 + 0.6), 0.5, pz * (h / 2 + 0.6), 0.14, 1.0, 0.14));
      } else {
      // забор с воротами у дороги
      const gateX = Math.floor(w / 2), side = fv.sgn;
      for (let x = -1; x <= w; x++) for (const zz of [-1, h]) { const isRoadSide = (side > 0 && zz === h) || (side < 0 && zz === -1); if (isRoadSide && (x === gateX || x === gateX - 1)) continue; fv.props.add(part('box', fenceC, x - w / 2 + 0.5, 0.3, zz - h / 2 + 0.5, 0.1, 0.6, 0.1)); if (x < w) fv.props.add(part('box', fenceC, x - w / 2 + 1, 0.42, zz - h / 2 + 0.5, 1, 0.05, 0.05)); }
      for (let y = -1; y <= h; y++) for (const xx of [-1, w]) { fv.props.add(part('box', fenceC, xx - w / 2 + 0.5, 0.3, y - h / 2 + 0.5, 0.1, 0.6, 0.1)); if (y < h) fv.props.add(part('box', fenceC, xx - w / 2 + 0.5, 0.42, y - h / 2 + 1, 0.05, 0.05, 1)); }
      // дорожка от ворот к дороге
      const roadZ = fv.sz < -100 ? ROAD_N : 0.2, pathLen = Math.abs(roadZ - fv.sz) - (h * TS) / 2 - RW / 2, pathZ = side > 0 ? h / 2 + 0.5 + pathLen / TS / 2 : -h / 2 - 0.5 - pathLen / TS / 2;
      { const pth = part('box', 0xb08d57, gateX - w / 2, 0.03, pathZ, 2.4, 0.06, pathLen / TS); pth.material = texMat('dirt_path', 1, Math.max(1, pathLen / 6), 0xb08d57); pth.castShadow = false; fv.props.add(pth); }
      }
      buildStead(fv, owned, S); fv.yardLabels = fv.labels.slice(); fv.fieldLabels = [];
      if (FP) {
        const lp = new T.Vector3(fv.cx, 7, fv.cz - h * TS / 2 - 5);
        if (owned) { const fl = addLabel('map', `🌾 Поле: ${fv.def.name}`, lp, 'bld', () => cb.onFarmSign(fv.def.id)); fv.labels.push(fl); fv.fieldLabels.push(fl); }
        else { const lock = !(S.level >= fv.def.level); const l = addLabel('map', `🌾 Поле: ${fv.def.name}<br><small>${lock ? '🔒 с ' + fv.def.level + ' уровня' : '🛒 купить за ' + fv.def.cost + ' 🪙'}</small>`, lp, 'bld' + (lock ? ' locked' : ''), () => cb.onFarmSign(fv.def.id)); l.dyn = true; fv.labels.push(l); fv.fieldLabels.push(l); }
      }
    }
    function syncView(fv, S) {
      const sfi = S.farms.findIndex((f) => f.id === fv.id), owned = sfi >= 0, wildDef = fv.def.wild || fv.def.forestry, f = owned ? S.farms[sfi] : (wildDef ? (fv.preview || (fv.preview = L.makeFarm(fv.def))) : null);
      const w = owned ? f.w : fv.def.plots[0][0], h = owned ? f.h : fv.def.plots[0][1];
      const key = fv.id + ':' + owned + ':' + w + 'x' + h + ':' + (owned || S.level >= fv.def.level);
      if (fv.key !== key) { fv.key = key; buildStatic(fv, S, owned, w, h); }
      fv.sfi = sfi; if (!f) return;
      for (let i = 0; i < f.tiles.length; i++) {
        const t = f.tiles[i], c = fv.tiles[i], wet = t.k === 'crop' && t.water > 0, sig = tileSig(t, wet);
        if (sig === c.sig) continue; c.sig = sig;
        if (c.model) { fv.crops.remove(c.model); disposeObj(c.model); c.model = null; }
        if (fv.treeAt[i]) treeRemove(fv, i);
        const wildK = t.k === 'tree' || t.k === 'stump' || t.k === 'rock' || t.k === 'young';
        c.mesh.material = tileMaterial(wildK ? 'forest' : t.k, wet, i % f.w, (i / f.w) | 0);
        c.mesh.scale.y = t.k === 'grass' || wildK ? 0.1 : 0.16; c.mesh.position.y = t.k === 'grass' || wildK ? 0.05 : 0.08;
        if (t.k === 'tree') treeAdd(fv, i, t.sp);
        else if (t.k === 'stump' || t.k === 'rock' || t.k === 'young') {
          const nm = t.k === 'young' ? { stage: Math.min(2, Math.floor(t.progress / L.YOUNG_MS * 3)), variant: ['oak', 'pine', 'birch'].indexOf(t.sp) } : { variant: t.k === 'rock' ? t.v : ['oak', 'pine', 'birch'].indexOf(t.sp) };
          const b = MODEL('forest', t.k, nm, () => part(t.k === 'rock' ? 'sph' : 'cyl', t.k === 'rock' ? 0x8a8d8f : 0x6b4f33, 0, 0.4, 0, 1.4, 0.8, 1.4)); b.position.set(c.mesh.position.x + (hash2(i, 8) - 0.5) * 0.3, 0.1, c.mesh.position.z + (hash2(i, 9) - 0.5) * 0.3); b.rotation.y = hash2(i, 10) * 6.28; b.scale.multiplyScalar(0.33 * (t.k === 'rock' ? 1.15 : 1)); fv.crops.add(b); c.model = b;
        }
        if (t.k === 'crop') { const b = MODEL('crop', t.crop, { stage: L.stage(t), seed: i }, () => fieldPlants(t.crop, L.stage(t), i)); b.position.set(c.mesh.position.x, 0.16, c.mesh.position.z); b.scale.y = hasModel('crop', t.crop) ? 0.62 : 1; fv.crops.add(b); c.model = b; }
      }
      if (!owned) return;
      const esig = JSON.stringify(f.sprinklers) + f.scarecrows + [S.up.drone, S.up.collector, S.up.courier].join() + JSON.stringify(S.barns);
      if (fv.sig !== esig) {
        fv.sig = esig; if (fv.extra) { fv.props.remove(fv.extra); fv.w3.remove(fv.extra2); }
        const ex = new T.Group(), ex2 = new T.Group();
        for (const p of f.sprinklers) { const sp = MODEL('prop', 'sprinkler', {}, () => { const q = new T.Group(); q.add(part('cyl', 0x546e7a, 0, 0.25, 0, 0.12, 0.5, 0.12)); q.add(part('cyl', 0x29b6f6, 0, 0.55, 0, 0.35, 0.1, 0.35)); return q; }); sp.scale.multiplyScalar(0.34); sp.position.set(p.x - f.w / 2 + 0.5, 0, p.y - f.h / 2 + 0.5); ex.add(sp); }
        for (let i = 0; i < Math.min(f.scarecrows, 4); i++) { const sc2 = MODEL('prop', 'scarecrow', {}, () => { const q = new T.Group(); q.add(part('cyl', 0x8d6e63, 0, 0.7, 0, 0.08, 1.4, 0.08)); q.add(part('box', 0x8d6e63, 0, 1.0, 0, 0.9, 0.08, 0.08)); q.add(part('sph', 0xf3d9a4, 0, 1.5, 0, 0.3)); q.add(part('box', 0x1976d2, 0, 0.95, 0, 0.4, 0.5, 0.18)); return q; }); sc2.scale.multiplyScalar(0.34); sc2.position.set(-f.w / 2 - 0.6, 0, -f.h / 2 + 1.5 + i * 1.6); ex.add(sc2); }
        if (fv.pen) {
          const pen = fv.pen; let bi = 0; const roofs = { chicken: 0xe53935, duck: 0x1e88e5, cow: 0x6d4c41, sheep: 0x8e24aa, goat: 0xf9a825, pig: 0xec407a, bee: 0xffb300 };
          for (const k of L.ANIMAL_ORDER) if (S.barns && S.barns[k]) { const lv = S.barns[k], hh = house(1.6, 1.6, 1.2, 0xf3e3c3, roofs[k]); hh.scale.setScalar(1.4 + lv * 0.08); hh.rotation.y = fv.sgn > 0 ? Math.PI : 0; hh.position.set(pen.x - pen.w / 2 + 2.4 + bi * (pen.w - 4.8) / 6, 0.05, pen.z - fv.sgn * (pen.d / 2 - 1.8)); bi++; ex2.add(hh); }
          fv.drone = null;
          if (S.up.drone > 0) { const d = new T.Group(); d.add(part('box', 0x37474f, 0, 0, 0, 1, 0.3, 1)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) d.add(part('cyl', 0xb0bec5, x * 0.7, 0.25, z * 0.7, 0.8, 0.06, 0.8)); d.add(part('sph', 0xff5252, 0, -0.2, 0.5, 0.25)); d.scale.setScalar(1.6); ex2.add(d); fv.drone = d; }
          if (S.up.collector > 0) { const r = new T.Group(); r.add(part('box', 0x90a4ae, 0, 0.9, 0, 1, 1.3, 0.8)); r.add(part('box', 0xcfd8dc, 0, 1.9, 0, 0.8, 0.7, 0.7)); r.add(part('box', 0x00e5ff, 0, 1.95, 0.36, 0.5, 0.2, 0.1, { emissive: 0x005566 })); r.position.set(pen.x + pen.w / 2 + 2, 0, pen.z); ex2.add(r); }
          if (S.up.courier > 0) { const v = MODEL('truck', 'pickup', {}, () => { const q = truckModel(1); q.scale.setScalar(2.4); return q; }); v.position.set(pen.x + pen.w / 2 + 7, 0, pen.z); v.rotation.y = Math.PI / 2; ex2.add(v); }
        }
        fv.extra = ex; fv.extra2 = ex2; fv.props.add(ex); fv.w3.add(ex2);
      }
      if (fv.pen) {
        const sig = L.ANIMAL_ORDER.map((k) => S.animals[k] || 0).join(',');
        if (sig !== fv.animalSig) {
          fv.animalSig = sig; for (const a of fv.animals) fv.w3.remove(a.g); fv.animals = [];
          for (const k of L.ANIMAL_ORDER) for (let i = 0; i < (S.animals[k] || 0); i++) { const g = MODEL('animal', k, { seed: i }, () => { const q = animalModel(k); q.scale.setScalar(2.2); return q; }), p = fv.pen; g.position.set(p.x + (Math.random() - 0.5) * (p.w - 3), 0, p.z + (Math.random() - 0.5) * (p.d - 3)); fv.w3.add(g); fv.animals.push({ g, key: k, tx: g.position.x, tz: g.position.z, wait: Math.random() * 3, ph: Math.random() * 6 }); }
        }
        const pend = L.ANIMAL_ORDER.reduce((a, k) => a + ((S.prod[k] && S.prod[k].pending) || 0), 0), own = L.ANIMAL_ORDER.reduce((a, k) => a + (S.animals[k] || 0), 0);
        if (fv.penLabel) { fv.penLabel.el.innerHTML = own ? (pend ? `🧺 Собрать (${pend})` : '🐾 Животные') : '➕ Животные'; fv.penLabel.el.classList.toggle('ready', pend > 0); }
      }
    }
    // --- стройплощадки
    const siteViews = SITE_POS.map(() => ({ sig: '', g: null, lab: null })), HIDE = new Set();
    function syncSites(S) {
      SITE_POS.forEach(([x, z], i) => {
        const v = siteViews[i], open = i < L.siteSlots(S), st = S.sites[i], stage = st ? L.siteStage(st) : -1;
        const sig = !open ? 'lock' : st ? st.type + stage : 'free';
        if (v.sig !== sig) {
          v.sig = sig; if (v.g) { world.remove(v.g); disposeObj(v.g); v.g = null; }
          if (st) { v.g = MODEL('construct', st.type, { stage, variant: i }, () => { const q = new T.Group(); q.add(part('box', st.type === 'barn' ? 0x9c6b3f : 0xd9c8a0, 0, 2 + stage, 0, 8, 4 + stage * 1.5, 6)); return q; }); }
          else if (open) { v.g = MODEL('construct', 'sign', {}, () => part('box', 0xc9a56a, 0, 1.4, 0, 3, 2, 0.3)); }
          if (v.g) { v.g.position.set(x, 0.1, z); v.g.rotation.y = 0; world.add(v.g); v.g.traverse((o) => { o.userData.bid = 'sites'; }); }
        }
        if (!v.lab) v.lab = addLabel('map', '', new T.Vector3(x, 14, z), 'bld', () => cb.onBuilding('sites'));
        v.lab.pos.set(x, st && st.type === 'barn' ? 17 : 13, z);
        { const hid = HIDE.has('site' + i); if (v.g) v.g.visible = !hid; v.lab.off = hid; }
        const txt = !open ? `🔒 Стройка · с ${L.SITE_SLOTS[i].level} ур.` : st ? (st.done ? `${L.SITE_TYPES[st.type].icon} ${L.SITE_TYPES[st.type].name} готов: продать` : `${L.SITE_TYPES[st.type].icon} ${L.SITE_TYPES[st.type].name} ${Math.floor(st.prog / st.total * 100)}%`) : `➕ Стройплощадка ${i + 1}`;
        if (v.lab.el.textContent !== txt) { v.lab.el.textContent = txt; v.lab.el.classList.toggle('locked', !open); v.lab.el.classList.toggle('ready', !!(st && st.done)); }
      });
    }
    function syncViews(S) { if (!views.length) { L.FARM_DEFS.forEach((d, i) => views.push(createView(i))); regFarmBigs(); forestRebuild(); } for (const v of views) syncView(v, S); }
    const sfiView = (sfi) => views.find((v) => v.sfi === sfi);
    const tileWorld = (fv, x, y) => [fv.cx + (x - fv.w / 2 + 0.5) * TS, fv.cz + (y - fv.h / 2 + 0.5) * TS];

    // --- машины (перетаскиваются мышью)
    const vehs = {};
    function syncVehicles(S) {
      if (S.vehV !== VEH_VER) { S.veh = {}; S.vehV = VEH_VER; for (const k of Object.keys(vehs)) { world.remove(vehs[k].g); dropLabel(vehs[k].lab); delete vehs[k]; } }
      S.veh = S.veh || {};
      for (const k of VEH_KEYS) {
        const lv = S.up[k] || 0;
        if (lv > 0 && (!vehs[k] || vehs[k].lv !== lv)) {
          const old = vehs[k], g = MODEL('vehicle', k, { level: lv }, () => { const q = vehicleModel(k, lv > 5); q.scale.setScalar(2.6); return q; });
          g.traverse((o) => { o.userData.veh = k; });
          if (!S.veh[k]) { const bayK = ['tractor', 'combine', 'waterer', 'spreader'].indexOf(k) >= 0; S.veh[k] = { x: VEH_START[k][0] + (bayK ? BAY[0] + 439 : 0), z: VEH_START[k][1] + (bayK ? BAY[1] - 255 : 0), r: 0 }; }
          g.position.set(S.veh[k].x, 0.1, S.veh[k].z); g.rotation.y = S.veh[k].r; world.add(g);
          if (old) { world.remove(old.g); old.g = g; old.lv = lv; } else vehs[k] = { g, key: k, lv, lab: addLabel('map', '', new T.Vector3(), 'vlbl'), anim: null };
          vehs[k].g = g; vehs[k].lv = lv;
        }
      }
    }
    function setVehPos(k, x, z, r) { const v = vehs[k], S = W.S; if (!v) return; v.g.position.set(x, 0.1, z); if (r != null) v.g.rotation.y = r; S.veh[k] = { x, z, r: v.g.rotation.y }; }
    function arrive(k, sfi, tx, ty) { const v = vehs[k], fv = sfiView(sfi); if (!v || !fv) return; const [x, z] = tileWorld(fv, tx, ty); setVehPos(k, x, z, v.g.rotation.y); v.jobId = 0; v.to = null; }
    function workAnim(k) { const v = vehs[k]; if (v) v.anim = { t: 0, x: v.g.position.x, z: v.g.position.z }; }

    // --- волки в северном лесу: живут своей жизнью (гуляют, сидят, лежат, воют), ничего не портят
    const wolves = [], WOLF_AREAS = []; // волков в игре нет: владелец их не просил // чаща к северу от лесных ферм, мимо деревни
    function wolfPose(w, v) { if (w.pose === v) return; w.pose = v; w.poses.forEach((m, i) => { m.visible = i === v; }); }
    function initWolves() {
      let i = 0;
      for (const [ax, az, ar, cnt] of WOLF_AREAS) for (let k = 0; k < cnt; k++, i++) {
        const g = new T.Group(), poses = [0, 1, 2].map((v) => { const m = MODEL('animal', 'wolf', { seed: i, variant: v }, () => part('sph', 0x777777, 0, 0.5, 0, 1.2, 0.8, 0.6)); m.visible = v === 0; g.add(m); return m; });
        const a = i * 2.4, rr = Math.sqrt(((i * 37) % 100) / 100) * ar * 0.9;
        g.position.set(ax + Math.cos(a) * rr, 0, az + Math.sin(a) * rr); g.rotation.y = i * 1.3; g.scale.setScalar(3); g.traverse((o) => { o.userData.wolf = true; }); world.add(g); const lab = addLabel('map', '🐺 Волк', new T.Vector3(), 'vlbl'); lab.maxCam = 110;
        wolves.push({ g, lab, poses, area: [ax, az, ar], st: 'idle', t: 1 + (i % 5), tx: g.position.x, tz: g.position.z, ph: i * 1.7, pose: 0, trot: false });
      }
    }
    function updateWolves(dt) {
      for (const w of wolves) {
        w.t -= dt; const p = w.g.position; w.lab.pos.set(p.x, w.pose === 0 ? 4.4 : 3.6, p.z);
        if (w.st === 'walk') {
          const dx = w.tx - p.x, dz = w.tz - p.z, d = Math.hypot(dx, dz);
          if (d < 1 || w.t <= 0) { w.st = 'idle'; w.t = 2 + Math.random() * 4; w.g.position.y = 0; w.g.rotation.z = 0; }
          else {
            const sp = w.trot ? 6.5 : 3.2; p.x += dx / d * sp * dt; p.z += dz / d * sp * dt;
            let da = Math.atan2(dx, dz) - w.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); w.g.rotation.y += da * Math.min(1, dt * 4);
            const f = W.time * (w.trot ? 11 : 7) + w.ph; p.y = Math.abs(Math.sin(f)) * (w.trot ? 0.2 : 0.1); w.g.rotation.z = Math.sin(f) * 0.04;
          }
        } else if (w.st === 'idle') {
          if (w.t > 0) continue;
          const r = Math.random();
          if (r < 0.58) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * w.area[2]; w.tx = w.area[0] + Math.cos(a) * rr; w.tz = w.area[1] + Math.sin(a) * rr; w.trot = Math.hypot(w.tx - p.x, w.tz - p.z) > 40; w.st = 'walk'; w.t = 40; }
          else if (r < 0.82) { wolfPose(w, 1); w.st = 'sit'; w.t = 5 + Math.random() * 5; if (Math.random() < 0.5 && cb.onHowl) cb.onHowl(Math.max(0, 1 - camera.position.distanceTo(p) / 320)); }
          else { wolfPose(w, 2); w.st = 'lie'; w.t = 7 + Math.random() * 8; }
        } else if (w.t <= 0) { wolfPose(w, 0); w.st = 'idle'; w.t = 1.5 + Math.random() * 2; }
      }
    }
    function pickWolf(ev) { if (!wolves.length) return false; setRay(ev); return ray.intersectObjects(wolves.map((w) => w.poses[w.pose]), true).length > 0; }

    // --- рейсы
    const truckMeshes = {};
    function routePos(prog) {
      const r = CITY.route; let total = 0; const segs = [];
      for (let i = 0; i < r.length - 1; i++) { const l = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]); segs.push(l); total += l; }
      let d = Math.max(0, Math.min(1, prog)) * total;
      for (let i = 0; i < segs.length; i++) { if (d <= segs[i] || i === segs.length - 1) { const t = segs[i] ? d / segs[i] : 0; return { x: lerp(r[i][0], r[i + 1][0], t), z: lerp(r[i][1], r[i + 1][1], t), a: Math.atan2(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]) }; } d -= segs[i]; }
    }
    function syncTrips(S) {
      const ids = new Set(S.trips.map((t) => t.id));
      for (const id of Object.keys(truckMeshes)) if (!ids.has(+id)) { world.remove(truckMeshes[id].m); dropLabel(truckMeshes[id].lab); delete truckMeshes[id]; }
      for (const t of S.trips) {
        let o = truckMeshes[t.id];
        if (!o) { const tl = S.trucks[t.truck] ? S.trucks[t.truck].lvl : 0, m = MODEL('truck', ['cart', 'pickup', 'truck', 'semi'][tl], { level: tl }, () => { const q = truckModel(tl); q.scale.multiplyScalar(2.6); return q; }); world.add(m); o = truckMeshes[t.id] = { m, lab: addLabel('map', '', new T.Vector3(), 'tlbl') }; }
        const p = t.phase === 'out' ? 1 - t.left / t.total : t.left / t.total, rp = routePos(p), side = (t.truck % 2 ? 2 : -2) * (t.phase === 'out' ? 1 : -1), horiz = Math.abs(Math.cos(rp.a)) < 0.5;
        o.m.position.set(rp.x + (horiz ? 0 : side), 0.05, rp.z + (horiz ? side : 0)); o.m.rotation.y = rp.a + (t.phase === 'out' ? 0 : Math.PI);
        o.lab.pos.set(o.m.position.x, 7, o.m.position.z);
        o.lab.el.textContent = (t.ev && t.ev.id === 'broke' ? '🔧 ' : t.ev && t.ev.id === 'jam' ? '🚦 ' : '') + (t.phase === 'out' ? '📦 ' : '↩️ ') + Math.ceil(t.left / 1000) + ' с';
      }
    }

    // --- камера: вращение, перемещение, масштаб
    const cam = { tx: -194, tz: -20, yaw: 0, pitch: 0.95, dist: 90, gx: -194, gz: -20, gd: 90 };
    const keys = {}, LIM = { big: false };
    function applyCamera() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), dd = cam.dist * (camera.aspect < 1 ? 1 + (1 - camera.aspect) * 1.4 : 1);
      camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * dd, sp * dd, cam.tz + Math.cos(cam.yaw) * cp * dd);
      camera.lookAt(cam.tx, 0, cam.tz);
    }
    function panBy(dx, dz) { // в осях экрана (вправо, вперёд)
      const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      const bx = LIM.big ? 1100 : 520, bz0 = LIM.big ? -900 : -360, bz1 = LIM.big ? 900 : 420;
      cam.gx = Math.max(-bx, Math.min(bx, cam.gx + dx * c + dz * s)); cam.gz = Math.max(bz0, Math.min(bz1, cam.gz - dx * s + dz * c));
    }
    function focus(x, z, d) { cam.gx = x; cam.gz = z; if (d) cam.gd = d; }
    function resize() {
      const r = canvas.parentElement.getBoundingClientRect(); const w = Math.max(300, r.width), h = Math.max(300, r.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, W.lite ? 1.25 : 2)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    window.addEventListener('keydown', (e) => { if (!W.inputOn || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return; const k = e.key.toLowerCase(); keys[k] = true; keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.gd = Math.min(900, Math.max(14, cam.gd * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

    // --- мышь
    const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), -0.16);
    const setRay = (ev) => { const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
    const groundAt = (ev) => { setRay(ev); const p = new T.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; };
    function pickFarm(p) {
      for (const fv of views) {
        const x = Math.floor((p.x - fv.cx) / TS + fv.w / 2), y = Math.floor((p.z - fv.cz) / TS + fv.h / 2);
        if (fv.w && x >= 0 && y >= 0 && x < fv.w && y < fv.h) return { fv, sfi: fv.sfi, x, y, owned: fv.sfi >= 0 };
        if (fv.pen && Math.abs(p.x - fv.sx - fv.pen.x) < fv.pen.w / 2 && Math.abs(p.z - fv.sz - fv.pen.z) < fv.pen.d / 2) return { fv, pen: true };
      }
      return null;
    }
    function pickVehicle(ev) {
      setRay(ev); const objs = Object.values(vehs).map((v) => v.g); const hits = ray.intersectObjects(objs, true);
      for (const h of hits) { let o = h.object; while (o && !o.userData.veh) o = o.parent; if (o && o.userData.veh) return o.userData.veh; if (h.object.userData.veh) return h.object.userData.veh; }
      return null;
    }
    const visChain = (o) => { for (; o; o = o.parent) if (o.visible === false) return false; return true; };
    function pickBuilding(ev) {
      setRay(ev); const hits = ray.intersectObjects(world.children, true);
      for (const h of hits) { if (!visChain(h.object)) continue; if (h.object.userData.bid) return h.object.userData.bid; if (h.object.isInstancedMesh) return null; }
      return null;
    }
    const hiPool = []; const hiMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
    for (let i = 0; i < 49; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.96, 0.96), hiMat.clone()); m.rotation.x = -Math.PI / 2; m.scale.setScalar(TS); m.position.y = 0.4; m.visible = false; scene.add(m); hiPool.push(m); }
    function highlight(cells, color) { hiPool.forEach((m, i) => { const c = cells && cells[i]; m.visible = !!c; if (c) { m.position.set(c[0], 0.4, c[1]); m.material.color.set(color || 0xffffff); } }); }
    function vehCells(k, hit, S) {
      if (!hit || !hit.owned) return null; const f = S.farms[hit.sfi]; const out = [];
      for (const [dx, dy] of L.areaOf(S.up[k])) { const x = hit.x + dx, y = hit.y + dy; if (x >= 0 && y >= 0 && x < f.w && y < f.h) out.push(tileWorld(hit.fv, x, y)); }
      return out;
    }
    let drag = null, paint = null, pan = null, lastTile = '';
    const ptrs = new Map(); let gest = null;
    const gInfo0 = () => { const a = [...ptrs.values()]; return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, ang: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x) }; };
    const gInfo = () => { const g = gInfo0(); if (gest) { g.acc = gest.acc || 0; g.rot = gest.rot; } return g; };
    const panPx = (dx, dy) => { const dd = cam.dist * (camera.aspect < 1 ? 1 + (1 - camera.aspect) * 1.4 : 1), k = 2 * dd * Math.tan(camera.fov * Math.PI / 360) / (canvas.clientHeight || 700); panBy(-dx * k, -dy * k / Math.max(0.5, Math.sin(cam.pitch))); cam.tx = cam.gx; cam.tz = cam.gz; };
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size >= 2) { drag = null; paint = null; highlight(null); if (W.ed && W.ed.on) W.ed.cancel(); gest = gInfo(); return; }
      if (ev.button === 2 || ev.button === 1) { pan = { x: ev.clientX, y: ev.clientY, mode: ev.button === 1 || ev.shiftKey ? 'rot' : 'pan' }; return; }
      if (W.ed && W.ed.on) { W.ed.down(ev); return; }
      const k = pickVehicle(ev);
      if (k && vehs[k]) { const p = groundAt(ev); drag = { k, off: p ? [vehs[k].g.position.x - p.x, vehs[k].g.position.z - p.z] : [0, 0], moved: false, sx: ev.clientX, sy: ev.clientY }; vehs[k].g.position.y = 0.35; cb.onVehicleGrab && cb.onVehicleGrab(k); return; }
      const p = groundAt(ev), hit = p && pickFarm(p);
      if (ev.pointerType === 'touch') { paint = { touch: true, moved: false, sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, hit }; return; }
      paint = { moved: false, sx: ev.clientX, sy: ev.clientY, ev };
      if (hit && hit.owned && !hit.pen) { lastTile = hit.sfi + ',' + hit.x + ',' + hit.y; paint.active = true; cb.onTile(hit.sfi, hit.x, hit.y, true); }
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size >= 2 && gest) {
        const g = gInfo(); cam.gd = Math.min(900, Math.max(14, cam.gd * gest.d / g.d)); cam.dist = cam.gd;
        let da = g.ang - gest.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        g.acc = (gest.acc || 0) + da; g.rot = gest.rot || Math.abs(g.acc) > 0.3; if (g.rot) cam.yaw -= da;
        panPx(g.cx - gest.cx, g.cy - gest.cy);
        gest = g; return;
      }
      if (pan) { const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y; pan.x = ev.clientX; pan.y = ev.clientY;
        if (pan.mode === 'rot') { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.35, Math.min(1.35, cam.pitch + dy * 0.005)); }
        else { const k = cam.dist * 0.0017; panBy(-dx * k, -dy * k * 1.3); cam.tx = cam.gx; cam.tz = cam.gz; } return; }
      if (W.ed && W.ed.on) { W.ed.move(ev); return; }
      const S = W.S;
      if (drag) {
        if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > (ev.pointerType === 'touch' ? 10 : 4)) drag.moved = true;
        const p = groundAt(ev); if (p) { const v = vehs[drag.k], nx = p.x + drag.off[0], nz = p.z + drag.off[1]; const dxm = nx - v.g.position.x, dzm = nz - v.g.position.z; setVehPos(drag.k, nx, nz, Math.hypot(dxm, dzm) > 0.05 ? Math.atan2(dxm, dzm) : null); v.g.position.y = 0.35;
          highlight(vehCells(drag.k, pickFarm(p), S), 0xffc83d); } return; }
      if (paint && paint.touch) {
        const dx = ev.clientX - paint.lx, dy = ev.clientY - paint.ly; paint.lx = ev.clientX; paint.ly = ev.clientY;
        if (!paint.moved && Math.hypot(ev.clientX - paint.sx, ev.clientY - paint.sy) > 9) { paint.moved = true; if (W.brush && paint.hit && paint.hit.owned && !paint.hit.pen) { paint.active = true; lastTile = paint.hit.sfi + ',' + paint.hit.x + ',' + paint.hit.y; cb.onTile(paint.hit.sfi, paint.hit.x, paint.hit.y, true); } }
        if (paint.moved) {
          if (paint.active) { const p2 = groundAt(ev), h2 = p2 && pickFarm(p2); if (h2 && h2.owned && !h2.pen) { const k = h2.sfi + ',' + h2.x + ',' + h2.y; if (k !== lastTile) { lastTile = k; cb.onTile(h2.sfi, h2.x, h2.y, false); } } }
          else panPx(dx, dy);
        }
        return;
      }
      const p = groundAt(ev), hit = p && pickFarm(p);
      if (hit && hit.owned && !hit.pen) { cb.onHover && cb.onHover({ sfi: hit.sfi, x: hit.x, y: hit.y, wx: tileWorld(hit.fv, hit.x, hit.y) }); } else { cb.onHover && cb.onHover(null); }
      canvas.style.cursor = pickVehicle(ev) ? 'grab' : 'default';
      if (paint) {
        if (Math.hypot(ev.clientX - paint.sx, ev.clientY - paint.sy) > 6) paint.moved = true;
        if (paint.active && hit && hit.owned && !hit.pen && ev.buttons & 1) { const k = hit.sfi + ',' + hit.x + ',' + hit.y; if (k !== lastTile) { lastTile = k; cb.onTile(hit.sfi, hit.x, hit.y, false); } }
      }
    });
    canvas.addEventListener('pointerup', (ev) => {
      const wasG = ptrs.size >= 2 || gest; ptrs.delete(ev.pointerId); if (wasG) { if (ptrs.size < 2) gest = ptrs.size ? gest : null; if (ptrs.size === 0) gest = null; paint = null; drag = null; return; }
      if (pan) { pan = null; return; }
      if (W.ed && W.ed.on) { W.ed.up(ev); return; }
      if (drag) {
        const v = vehs[drag.k], S = W.S; v.g.position.y = 0.1; highlight(null);
        const p = groundAt(ev), hit = p && pickFarm(p);
        if (drag.moved && hit && hit.owned && !hit.pen) cb.onVehicleDrop(drag.k, hit.sfi, hit.x, hit.y);
        else if (!drag.moved) cb.onVehicleClick && cb.onVehicleClick(drag.k);
        drag = null; return;
      }
      if (paint && paint.touch && !paint.moved) {
        const h = paint.hit;
        if (h && h.owned && !h.pen) cb.onTile(h.sfi, h.x, h.y, true);
        else if (pickWolf(ev)) cb.onWolf && cb.onWolf();
        else if (h && h.pen) cb.onPen();
        else { const b = pickBuilding(ev); if (b) cb.onBuilding(b); }
      } else if (paint && !paint.touch && !paint.moved && !paint.active) {
        const b = pickBuilding(ev); if (b) cb.onBuilding(b);
        else if (pickWolf(ev)) cb.onWolf && cb.onWolf();
        else { const p = groundAt(ev), hit = p && pickFarm(p); if (hit && hit.pen) cb.onPen(); }
      }
      paint = null; lastTile = '';
    });
    canvas.addEventListener('pointercancel', (ev) => { ptrs.delete(ev.pointerId); if (W.ed && W.ed.on) W.ed.cancel(); if (!ptrs.size) { gest = null; drag = null; paint = null; highlight(null); } });
    canvas.addEventListener('pointerleave', () => { cb.onHover && cb.onHover(null); });

    // --- эффекты
    const parts = [];
    function burst(kind, x, y, z) {
      const col = { chop: 0xc79a5b, fell: 0x8a6a42, dig: 0x7a4e2b, plant: 0x7cb342, water: 0x4fc3f7, harvest: 0xffd54f, build: 0xb0bec5, fert: 0xce93d8, coin: 0xffc107, remove: 0x9e9e9e, gold: 0xffeb3b }[kind] || 0xffffff;
      for (let i = 0; i < 10; i++) { const m = new T.Mesh(G.box(), new T.MeshBasicMaterial({ color: col })); m.scale.setScalar(0.28 + Math.random() * 0.2); m.position.set(x, y, z); scene.add(m); parts.push({ m, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 2.4, vz: (Math.random() - 0.5) * 2.4, life: 0.7 }); }
    }
    function fx(kind, sfi, tx, ty, opts) { const fv = sfiView(sfi); if (!fv) return; const [x, z] = tileWorld(fv, tx, ty); if (kind === 'fell' && opts && opts.sp) fellAnim(fv, tx, ty, opts.sp); burst(opts && opts.gold ? 'gold' : kind, x, kind === 'fell' || kind === 'chop' ? 1.6 : 0.6, z); }
    function tileScreen(sfi, tx, ty) { const fv = sfiView(sfi); if (!fv) return { x: 0, y: 0 }; const [x, z] = tileWorld(fv, tx, ty); const v = new T.Vector3(x, 0.6, z).project(camera), r = canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top }; }
    function vehScreen(k) { const v = vehs[k]; if (!v) return { x: 0, y: 0 }; const p = v.g.position.clone(); p.y = 1.2; p.project(camera); const r = canvas.getBoundingClientRect(); return { x: (p.x * 0.5 + 0.5) * r.width + r.left, y: (-p.y * 0.5 + 0.5) * r.height + r.top }; }

    // --- цикл
    const rain = (() => {
      const n = 1600, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 220; pos[i * 3 + 1] = Math.random() * 50; pos[i * 3 + 2] = (Math.random() - 0.5) * 180; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const p = new T.Points(g, new T.PointsMaterial({ color: 0xaad4ff, size: 0.5, transparent: true, opacity: 0.8 })); p.visible = false; p.frustumCulled = false; scene.add(p); return p;
    })();
    const skyDay = rgb(0xa4c4d8), skyNight = rgb(0x0b1330), skyDusk = rgb(0xf0a070), skyRain = rgb(0x7a8794), skyDry = rgb(0xe8c58a);
    function lighting(tod, weather) {
      const ang = tod * Math.PI * 2, day = Math.max(0, Math.min(1, 0.5 + Math.sin(ang - Math.PI / 2) * -0.5 * 1.4 + 0.15)), light = Math.max(0.3, day);
      const skyC = skyNight.clone().lerp(skyDay, light), dusk = Math.max(0, 1 - Math.abs(day - 0.45) * 5) * 0.45; skyC.lerp(skyDusk, dusk);
      if (weather === 'rain') skyC.lerp(skyRain, 0.6); else if (weather === 'drought') skyC.lerp(skyDry, 0.45);
      scene.background.copy(skyC); scene.fog.color.copy(skyC);
      skyDome.material.uniforms.bot.value.copy(skyC); skyDome.material.uniforms.top.value.copy(skyC).multiplyScalar(0.62).lerp(skyNight, 1 - light).offsetHSL(0, 0.12, -0.02);
      hemi.intensity = 0.3 + light * 0.45; sun.intensity = 0.06 + light * 1.05 * (weather === 'rain' ? 0.5 : 1); sun.color.set(dusk > 0.1 ? 0xffa860 : 0xffe9c4);
      { const e = Math.min(260, Math.max(90, cam.dist * 0.95)); if (Math.abs(sc.right - e) > 1) { sc.left = -e; sc.right = e; sc.top = e * 0.87; sc.bottom = -e * 0.87; sc.far = 900; sc.updateProjectionMatrix(); } }
      sun.position.set(cam.tx + Math.cos(ang) * 110, 70 + Math.max(0, Math.sin(ang)) * 110, cam.tz + 55); sun.target.position.set(cam.tx, 0, cam.tz);
    }
    function update(dt, S) {
      W.S = S; W.time += dt;
      // управление камерой
      const sp = cam.dist * 0.9 * dt;
      if (W.inputOn) {
        let mx = 0, mz = 0;
        if (keys.a || keys.ArrowLeft || keys['ф']) mx -= 1; if (keys.d || keys.ArrowRight || keys['в']) mx += 1; if (keys.w || keys.ArrowUp || keys['ц']) mz -= 1; if (keys.s || keys.ArrowDown || keys['ы']) mz += 1;
        if (mx || mz) panBy(mx * sp, mz * sp);
        if (keys.q || keys['й']) cam.yaw += dt * 1.3; if (keys.e || keys['у']) cam.yaw -= dt * 1.3;
      }
      cam.tx += (cam.gx - cam.tx) * Math.min(1, dt * 8); cam.tz += (cam.gz - cam.tz) * Math.min(1, dt * 8); cam.dist += (cam.gd - cam.dist) * Math.min(1, dt * 8);
      syncViews(S); syncVehicles(S); syncTrips(S); syncSites(S);
      for (let i = falling.length - 1; i >= 0; i--) { const f = falling[i]; f.t += dt; const k = Math.min(1, f.t / 1.1), a = k * k * 1.45; f.piv.rotation.set(Math.cos(f.dir) * a, 0, Math.sin(f.dir) * a); if (k >= 1) { f.piv.scale.multiplyScalar(0.94); if (f.t > 1.7) { world.remove(f.piv); disposeObj(f.piv); falling.splice(i, 1); } } }
      lighting(S.clock / L.DAY_MS, S.weather.type);
      rain.visible = S.weather.type === 'rain';
      if (rain.visible) { const a = rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 22; if (y < 0) y = 50; a.setY(i, y); } a.needsUpdate = true; rain.position.set(cam.tx, 0, cam.tz); }
      for (const cl of clouds) { cl.position.x += dt * 1.6; if (cl.position.x > 520) cl.position.x = -520; }
      for (const b of Object.values(bMeshes)) b.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 1.2; });
      for (const fv of views) {
        for (const a of fv.animals) {
          a.wait -= dt; if (a.wait <= 0) { const p = fv.pen; a.tx = p.x + (Math.random() - 0.5) * (p.w - 3); a.tz = p.z + (Math.random() - 0.5) * (p.d - 3); a.wait = 2 + Math.random() * 4; }
          const dx = a.tx - a.g.position.x, dz = a.tz - a.g.position.z, d = Math.hypot(dx, dz);
          if (a.key === 'bee') { a.g.position.x += Math.cos(W.time + a.ph) * dt * 1.4; a.g.position.z += Math.sin(W.time * 1.3 + a.ph) * dt * 1.4; a.g.position.y = 1.2 + Math.sin(W.time * 5 + a.ph) * 0.2; }
          else if (d > 0.1) { a.g.position.x += dx / d * dt * 1.4; a.g.position.z += dz / d * dt * 1.4; a.g.rotation.y = Math.atan2(dx, dz); a.g.position.y = Math.abs(Math.sin(W.time * 6 + a.ph)) * 0.07; } else a.g.position.y = 0;
        }
        if (fv.drone) { const a = W.time * 0.5; fv.drone.position.set(fv.cx - fv.sx + Math.cos(a) * fv.w * TS * 0.35, 6 + Math.sin(W.time * 2) * 0.3, fv.cz - fv.sz + Math.sin(a) * fv.h * TS * 0.3); fv.drone.rotation.y = -a; }
      }
      updateWolves(dt);
      for (const k of Object.keys(vehs)) {
        const v = vehs[k], job = S.job && S.job[k];
        if (job && !(drag && drag.k === k)) { // по команде игрока машина сама едет к месту работы: положение считаем по прогрессу выезда, поэтому скорость игры и пауза учитываются
          if (v.jobId !== job.id) { v.jobId = job.id; v.from = [v.g.position.x, v.g.position.z]; const jv = views.find((q) => q.id === job.farm); v.to = jv ? tileWorld(jv, job.x, job.y) : null; }
          if (v.to) {
            const u = Math.min(1, Math.max(0, 1 - job.t / job.total)), e = u * u * (3 - 2 * u), nx = lerp(v.from[0], v.to[0], e), nz = lerp(v.from[1], v.to[1], e), dx = v.to[0] - v.from[0], dz = v.to[1] - v.from[1];
            const q = Math.min(1, dt * 12); v.g.position.set(v.g.position.x + (nx - v.g.position.x) * q, 0.1, v.g.position.z + (nz - v.g.position.z) * q); // игра считает 10 раз в секунду, глаже двигаем
            if (Math.hypot(dx, dz) > 0.5) { let da = Math.atan2(dx, dz) - v.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); v.g.rotation.y += da * Math.min(1, dt * 5); }
          }
        } else if (v.jobId) {
          v.jobId = 0; if (v.to && S.run && S.run[k]) setVehPos(k, v.to[0], v.to[1], v.g.rotation.y); else setVehPos(k, v.g.position.x, v.g.position.z, v.g.rotation.y); v.to = null;
        }
        if (v.anim) { v.anim.t += dt; const u = v.anim.t / 1.1; if (u >= 1) { v.anim = null; setVehPos(k, v.g.position.x, v.g.position.z); } else { v.g.position.x = v.anim.x + Math.sin(u * Math.PI * 2) * 6 * (1 - u * 0.2); } }
        const lv = S.up[k] || 0, cool = S.cool[k] || 0; v.lab.pos.set(v.g.position.x, 8, v.g.position.z);
        const run = S.run && S.run[k], txt = `${L.MACHINES[k].icon} ур.${lv} · ${run ? (job ? 'едет 🔁' : cool > 0 ? Math.ceil(cool / 1000) + ' с 🔁' : 'ждёт 🔁') : cool > 0 ? Math.ceil(cool / 1000) + ' с' : 'готов'}`; if (v.lab.el.textContent !== txt) v.lab.el.textContent = txt; v.lab.el.classList.toggle('ready', cool <= 0);
      }
      for (const [id, o] of Object.entries(townLabels)) { const extra = id === 'market' && Object.keys(S.stall).length ? ' 📦' : id === 'casino' && S.tickets > 0 ? ` 🎟️${S.tickets}` : ''; const txt = CITY.names[id] + extra; if (o.el.textContent !== txt) o.el.textContent = txt; }
      for (const fv of views) for (const l of fv.labels || []) if (l.dyn) { const lock = !(S.level >= fv.def.level); const txt = `${fv.def.icon} ${fv.def.name}\n${lock ? '🔒 с ' + fv.def.level + ' уровня' : '🛒 купить за ' + fv.def.cost + ' 🪙'}`; l.el.classList.toggle('locked', lock); }
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy -= 9 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.scale.multiplyScalar(0.97); if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
      sun.castShadow = cam.dist < 230 && !(W.lite && cam.dist > 150);
      skyDome.position.copy(camera.position);
      applyCamera();
      renderer.render(scene, camera);
      const r = canvas.getBoundingClientRect(), v3 = new T.Vector3();
      for (const l of labels) {
        if (l.off) { l.el.style.display = 'none'; continue; }
        v3.copy(l.pos).project(camera); const dist = camera.position.distanceTo(l.pos);
        const far = (l.el.classList.contains('bld') ? 700 : l.el.classList.contains('penlbl') ? 170 : 150);
        if (v3.z > 1 || dist > far || (l.maxCam && cam.dist > l.maxCam)) { l.el.style.display = 'none'; continue; }
        l.el.style.display = ''; l.el.style.transform = `translate(-50%,-100%) translate(${(v3.x * 0.5 + 0.5) * r.width}px,${(-v3.y * 0.5 + 0.5) * r.height}px)`;
      }
    }
    function focusWild() { focus(-106, -140, 110); }
    function focusForest() { focus(75, -140, 100); }
    function focusSites() { focus(SITE_POS[1][0], SITE_POS[1][1], 95); }
    function focusSawmill() { focus(SAWMILL_POS[0], SAWMILL_POS[1] + 3, 80); }
    function focusHome() { focusFarm('home'); }
    function focusTown() { const t = Object.values(TOWN), mx = t.reduce((a, q) => a + q[0], 0) / t.length, mz = t.reduce((a, q) => a + q[1], 0) / t.length; focus(mx, mz, 170); }
    function focusFarm(id) {
      const FP = FIELD_POS[id]; if (FP) { const fv = views.find((q) => q.id === id); const w0 = fv && fv.w ? fv.w : 12, cx = FP[0] - FW_MAX * TS / 2 + w0 * TS / 2; focus(cx, FP[1] - 12, Math.max(125, w0 * TS * 1.9)); return; }
      const s = SLOT[id]; if (s) focus(s[0] - 6, s[1] + (s[1] < 0 ? 8 : -8), 92);
    }
    function focusAll() { focus(-10, 30, 640); }
    window.addEventListener('resize', resize);
    resize(); cam.gx = cam.tx = FIELD_POS.home[0] + 18; cam.gz = cam.tz = FIELD_POS.home[1] - 12; cam.gd = cam.dist = 125;
    // ============================================================ большие объекты (редактор карты их двигает)
    // get() → [x, z, поворот]; set() двигает «вживую», commit() — после того как отпустили палец
    const regBig = (id, o) => { BIG[id] = Object.assign({ id, canRot: false, rotStep: Math.PI / 2, area: 400, commit: null }, o); return BIG[id]; };
    const rectB = (cx, cz, hw, hd) => [cx - hw, cz - hd, cx + hw, cz + hd];
    const inRect = (b, x, z) => { const bb = b.bounds(); return x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3]; };
    for (const id of Object.keys(TOWN)) {
      regBig(id, { name: CITY.names[id], canRot: true, area: 700, get: () => [TOWN[id][0], TOWN[id][1], TOWN_ROT[id] || 0],
        set(x, z, r) { TOWN[id] = [x, z]; TOWN_ROT[id] = r; const m = bMeshes[id]; m.position.set(x, 0, z); m.rotation.y = r; townLabels[id].pos.set(x, 17, z); },
        bounds: () => rectB(TOWN[id][0], TOWN[id][1], 14, 14), hit(x, z) { return inRect(this, x, z); },
        commit() { const m = TOWN.market; if (id === 'market') { CITY.route[CITY.route.length - 2] = [m[0] + 4, 100]; CITY.route[CITY.route.length - 1] = [m[0] + 4, m[1] + 11]; } } });
    }
    regBig('sawmill', { name: 'Лесопилка', canRot: true, area: 1100, get: () => [SAWMILL_POS[0], SAWMILL_POS[1], BIG_ROT.sawmill || 0],
      set(x, z, r) { SAWMILL_POS[0] = x; SAWMILL_POS[1] = z; BIG_ROT.sawmill = r; bGroups.sawmillG.position.set(x, 0, z); bGroups.sawmillG.rotation.y = r; townLabels.sawmill.pos.set(x, 15, z); },
      bounds: () => rectB(SAWMILL_POS[0], SAWMILL_POS[1] + 6, 23, 24), hit(x, z) { return inRect(this, x, z); } });
    SITE_POS.forEach((p, i) => regBig('site' + i, { name: 'Стройплощадка ' + (i + 1), area: 620, get: () => [SITE_POS[i][0], SITE_POS[i][1], 0],
      set(x, z) { SITE_POS[i] = [x, z]; bGroups.siteG[i].position.set(x, 0, z); siteViews[i].sig = ''; },
      bounds: () => rectB(SITE_POS[i][0], SITE_POS[i][1], 14, 11), hit(x, z) { return inRect(this, x, z); } }));
    regBig('pond', { name: 'Пруд', canRot: true, area: 1800, get: () => [POND[0], POND[1], BIG_ROT.pond || 0],
      set(x, z, r) { POND[0] = x; POND[1] = z; BIG_ROT.pond = r; bGroups.pondG.position.set(x, 0, z); bGroups.pondG.rotation.y = r; },
      bounds: () => rectB(POND[0], POND[1], 27, 21), hit(x, z) { return Math.hypot((x - POND[0]) / 27, (z - POND[1]) / 21) < 1; } });
    regBig('bay', { name: 'Стоянка техники', canRot: true, area: 1000, get: () => [BAY[0], BAY[1], BIG_ROT.bay || 0],
      set(x, z, r) { const dx = x - BAY[0], dz = z - BAY[1]; if ((dx || dz) && W.S && W.S.veh) for (const k of ['tractor', 'combine', 'waterer', 'spreader']) { const q = W.S.veh[k]; if (q && vehs[k] && Math.abs(q.x - BAY[0]) < 45 && Math.abs(q.z - BAY[1]) < 16) setVehPos(k, q.x + dx, q.z + dz, null); } BAY[0] = x; BAY[1] = z; BIG_ROT.bay = r; bGroups.bayG.position.set(x, 0, z); bGroups.bayG.rotation.y = r; townLabels.bay.pos.set(x, 9, z); },
      bounds: () => rectB(BAY[0], BAY[1], 36, 7), hit(x, z) { return inRect(this, x, z); } });
    // «удалить» большой объект = спрятать (его кнопки остаются в меню «Город»); вернуть можно в списке «Объекты»
    const HIDEF = {};
    for (const id of Object.keys(TOWN)) HIDEF[id] = (v) => { bMeshes[id].visible = v; townLabels[id].off = !v; };
    HIDEF.sawmill = (v) => { bGroups.sawmillG.visible = v; townLabels.sawmill.off = !v; };
    SITE_POS.forEach((p, i) => { HIDEF['site' + i] = (v) => { if (siteViews[i].g) siteViews[i].g.visible = v; if (siteViews[i].lab) siteViews[i].lab.off = !v; bGroups.siteG[i].visible = v; }; });
    HIDEF.pond = (v) => { bGroups.pondG.visible = v; };
    HIDEF.bay = (v) => { bGroups.bayG.visible = v; townLabels.bay.off = !v; };
    function bigVis(id, vis) { if (vis) HIDE.delete(id); else HIDE.add(id); const f = HIDEF[id]; if (f) f(vis); if (BIG[id]) BIG[id].hidden = !vis; }
    for (const id of Object.keys(HIDEF)) if (BIG[id]) { BIG[id].hidable = true; BIG[id].hidden = false; }
    function regFarmBigs() {
    for (const fv of views) {
      const id = fv.id;
      regBig('y:' + id, { name: 'Двор: ' + fv.def.name, canRot: true, rotStep: Math.PI, area: 5200, get: () => [fv.sx, fv.sz, fv.sgn > 0 ? 0 : Math.PI],
        set(x, z, r) { const dx = x - fv.sx, dz = z - fv.sz; fv.sx = x; fv.sz = z; SLOT[id] = [x, z]; fv.w3.position.set(x, 0, z); for (const l of fv.yardLabels || []) { l.pos.x += dx; l.pos.z += dz; } const sg = r > 1.5 ? -1 : 1; if (sg !== fv.sgn) { fv.sgn = sg; fv.needRebuild = true; } BIG_ROT['y:' + id] = r; },
        commit() { fv.key = ''; fv.needRebuild = false; },
        bounds: () => rectB(fv.sx - 24, fv.sz + (fv.sgn > 0 ? 6 : -6), 40, 30), hit(x, z) { return inRect(this, x, z); } });
      if (FIELD_POS[id]) regBig('f:' + id, { name: 'Поле: ' + fv.def.name, area: 3000, get: () => [FIELD_POS[id][0], FIELD_POS[id][1], 0],
        set(x, z) { FIELD_POS[id] = [x, z]; fv.cx = x - FW_MAX * TS / 2 + (fv.w || 12) * TS / 2; fv.cz = z; fv.g.position.set(fv.cx, 0, fv.cz); const L0 = fv.fieldLabels && fv.fieldLabels[0]; if (L0) L0.pos.set(fv.cx, 7, fv.cz - (fv.h || 8) * TS / 2 - 5); },
        commit() { fv.key = ''; },
        bounds: () => rectB(fv.cx, fv.cz, (fv.w || 12) * TS / 2 + 2, (fv.h || 8) * TS / 2 + 2), hit(x, z) { return inRect(this, x, z); } });
    }
    }
    const layRev = { n: (LAY0 && LAY0.rev) || 0 };
    for (const id of (LAY0 && LAY0.hide) || []) if (HIDEF[id]) bigVis(id, false);
    if (LAY0 && BIG.market && BIG.market.commit) BIG.market.commit();
    // расстановка карты целиком: v:2 — rd (все дороги), cut/nf (вырубленный лес), hide (спрятанные большие объекты)
    function exportLayout() {
      const big = {}; for (const b of Object.values(BIG)) { const g = b.get(); big[b.id] = [r1(g[0]), r1(g[1]), r3(g[2] || 0)]; }
      return { v: 2, rev: layRev.n, items: decExport(), rd: roadsExport(), big, cut: CUTS.map((c) => c.map(r1)), nf: NOFOREST.v ? 1 : 0, hide: [...HIDE] };
    }
    function applyLayout(Ly) {
      if (!Ly) return;
      for (const [id, a] of Object.entries(Ly.big || {})) { const b = BIG[id]; if (b) { b.set(+a[0], +a[1], +a[2] || 0); b.commit && b.commit(); } }
      decSetAll(Ly.items || []);
      roadsSetAll(Ly.rd ? Ly.rd : DEFROADS.concat((Ly.roads || []).flatMap((a) => roadsSplit(a, 0))));
      CUTS.length = 0; for (const c of Ly.cut || []) CUTS.push(c.map(Number)); NOFOREST.v = !!Ly.nf;
      for (const id of Object.keys(HIDEF)) bigVis(id, !(Ly.hide || []).includes(id));
      layRev.n = Ly.rev || layRev.n; if (forestRebuild) forestRebuild();
    }
    const defaultLayout = () => ({ v: 2, rev: 0, items: defaultItemsRef.map((i) => [i.t, i.v, i.x, i.z, i.r, i.s]), rd: DEFROADS.map((a) => a.slice()), big: JSON.parse(JSON.stringify(DEF_BIG)), cut: [], nf: 0, hide: [] });
    /** Пустая карта: дороги и большие объекты на местах, но без домов, деревьев, леса. */
    const cleanLayout = () => Object.assign(defaultLayout(), { items: [], nf: 1 });
    // лес: поиск и вырубка (круг или прямоугольник)
    const forestNear = (x, z, r) => { let b = null, bd = r; for (const t of FOREST.spots) { const d = Math.hypot(t[0] - x, t[1] - z); if (d < bd) { bd = d; b = t; } } return b; };
    const forestIn = (x0, z0, x1, z1) => FOREST.spots.filter((t) => t[0] >= Math.min(x0, x1) && t[0] <= Math.max(x0, x1) && t[1] >= Math.min(z0, z1) && t[1] <= Math.max(z0, z1));
    const cutAdd = (c) => { CUTS.push(c.map(Number)); };
    const edApi = { T, scene, camera, canvas, cam, groundAt, panPx, BIG, DEC, DEC_R, PALETTE, TS, PATCH, decAdd, decRemove, decSet, decFlush, decNear, decModel, roadsAdd, roadsAddLine, roadsRemove, roadsFlush, ROADS, roadDist, roadBox, exportLayout, applyLayout, defaultLayout, cleanLayout, forestRebuild: () => forestRebuild && forestRebuild(), forestNear, forestIn, cutAdd, bigVis, setNoForest: (v) => { NOFOREST.v = !!v; }, noForest: () => NOFOREST.v, world, W, bumpRev: () => { layRev.n++; }, setLimits: (big) => { LIM.big = !!big; } };
    W.ed = root.FarmEditor ? root.FarmEditor.create(edApi) : null;
    W.screenAt = (x, z, y) => { const v = new T.Vector3(x, y || 0.5, z).project(camera), r = canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top }; };
    W.forestCount = () => FOREST.spots.length; W.palette = PALETTE; W.patches = PATCH; W.cleanLayout = cleanLayout; W.exportLayout = exportLayout; W.applyLayout = applyLayout; W.defaultLayout = defaultLayout;
    initWolves();
    Object.assign(W, { wolves, update, fx, highlight, resize, tileScreen, vehScreen, workAnim, arrive, focusWild, focusForest, focusSites, focusSawmill, focusHome, focusTown, focusFarm, focusAll, screenshot: () => canvas.toDataURL("image/png"), CITY, setVehPos, pickVehicle, pickFarm, groundAt, focus, cam });
    return W;
  }

  // ---- общий реестр моделей: файлы models_*.js регистрируют сюда свои модели
  const REG = {};
  root.FarmModels = {
    register(kind, name, fn) { (REG[kind] = REG[kind] || {})[name] = fn; },
    make(kind, name, opts) { const f = REG[kind] && REG[kind][name]; return f ? f(opts || {}) : null; },
    has(kind, name) { return !!(REG[kind] && REG[kind][name]); },
    list(kind) { return kind ? Object.keys(REG[kind] || {}) : Object.fromEntries(Object.entries(REG).map(([k, v]) => [k, Object.keys(v)])); },
  };
  function addProc(name, draw, size) { const cv = document.createElement('canvas'); cv.width = cv.height = size || 256; draw(cv, cv.getContext('2d')); PROC[name] = cv; delete imgs[name]; }
  root.FarmCore = { pmat, paint, matte, metal, rubberM, chromeM, glassM, lightM, rbox, ext, mesh, makeEnv, T, mat, part, texMat, gable, bake, bakeTex, hasTex, G, geo, rgb, lerp, addProc, cropModel, animalModel, vehicleModel, truckModel, tree, house, buildingModel };
  root.World3D = { create, CITY, cropModel, animalModel };
})(typeof self !== 'undefined' ? self : this);
