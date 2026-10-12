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
      const tex = !!o.material.map, key = tex ? o.material.uuid : 'vc';
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
  const TS = 2; // размер одной клетки поля в единицах мира
  const SLOT = { home: [-78, -28], meadow: [-26, -28], grove: [26, -28], valley: [78, -28], lake: [-78, 28], hills: [-26, 28], orchard: [26, 28] };
  const FIELD_SHIFT = 6;
  const TOWN = { market: [-70, 70], seeds: [-35, 70], tech: [0, 70], bank: [35, 70], casino: [70, 70] };
  const ROAD_Z = [0.2, 54], ROAD_X = [-104, -52, 0, 52, 104];
  const CITY = {
    names: { market: '🏪 Рынок', seeds: '🌱 Семена и корм', tech: '🚜 Техцентр', bank: '🏦 Банк', casino: '🎰 Колесо удачи', warehouse: '📦 Склад' },
    route: [[-72, -20], [-72, 0.2], [-52, 0.2], [-52, 54], [-70, 54], [-70, 62]],
    center: [0, 10],
  };
  const VEH_KEYS = ['tractor', 'combine', 'waterer', 'spreader'];
  const VEH_START = { tractor: [-100, -9], combine: [-92, -9], waterer: [-84, -9], spreader: [-76, -9] };

  function create(canvas, labelBox, cb) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(); scene.background = new T.Color(0x8ecbf0); scene.fog = new T.Fog(0x8ecbf0, 200, 900);
    const camera = new T.PerspectiveCamera(42, 1, 0.5, 1800);
    const hemi = new T.HemisphereLight(0xd6e2ec, 0x4a5530, 0.7); scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff1d0, 0.9); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400;
    scene.add(sun); scene.add(sun.target);
    const skyDome = new T.Mesh(new T.SphereGeometry(1200, 24, 12), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new T.Color(0x5c8fb8) }, bot: { value: new T.Color(0xc6d8e2) } }, vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, pow(clamp(h,0.0,1.0), 0.6)), 1.0); }' }));
    skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
    const ground = new T.Mesh(new T.PlaneGeometry(2600, 2600), texMat('grass', 650, 650, 0x6fae4f)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const world = new T.Group(); scene.add(world);
    const W = { mode: 'map', cb, renderer, scene, camera, time: 0, S: null, inputOn: true };

    // --- DOM-метки
    const labels = [];
    function addLabel(group, html, pos, cls, onClick) {
      const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = html; labelBox.appendChild(el);
      if (onClick) { el.style.pointerEvents = 'auto'; el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); }); el.addEventListener('pointerdown', (e) => e.stopPropagation()); }
      const o = { el, pos: pos.clone(), group, maxD: 0 }; labels.push(o); return o;
    }
    const dropLabel = (o) => { o.el.remove(); const i = labels.indexOf(o); if (i >= 0) labels.splice(i, 1); };

    // --- статика: дороги, город, лес, холмы
    const bMeshes = {}, clouds = [], cars = [], townLabels = {};
    (function buildStatic() {
      const road = (x, z, w, d) => { const m = part('box', 0x4a4f57, x, 0.04, z, w, 0.08, d); m.material = texMat('asphalt', w / 4, d / 4, 0x4a4f57); m.castShadow = false; world.add(m); };
      for (const z of ROAD_Z) road(0, z, 260, 6.4);
      for (const x of ROAD_X) road(x, (ROAD_Z[0] + ROAD_Z[1]) / 2 - 14, 6.4, ROAD_Z[1] - ROAD_Z[0] + 120);
      for (let x = -126; x < 126; x += 7) for (const z of ROAD_Z) { const m = part('box', 0xe9dc8a, x, 0.09, z, 3, 0.02, 0.26); m.castShadow = false; world.add(m); }
      for (const x of ROAD_X) for (let z = -72; z < 54; z += 7) { const m = part('box', 0xe9dc8a, x, 0.09, z, 0.26, 0.02, 3); m.castShadow = false; world.add(m); }
      // город: ряд зданий у дороги
      for (const [id, [x, z]] of Object.entries(TOWN)) {
        const b = buildingModel(id); b.position.set(x, 0, z); b.rotation.y = Math.PI; b.scale.setScalar(2.1); world.add(b); bMeshes[id] = b;
        b.traverse((o) => { o.userData.bid = id; });
        townLabels[id] = addLabel('map', CITY.names[id], new T.Vector3(x, 12, z), 'bld', () => cb.onBuilding(id));
      }
      // парк на пустом участке: пруд и скамейки
      const pond = part('cyl', 0x3f9fd6, 78, 0.07, 28, 34, 0.1, 26); pond.castShadow = false; world.add(pond);
      const boat = new T.Group(); boat.add(part('box', 0x8d6e63, 0, 0.2, 0, 0.9, 0.3, 2.4)); boat.add(part('box', 0xeceff1, 0, 0.45, 0, 0.6, 0.15, 1.2)); boat.scale.setScalar(1.8); boat.position.set(74, 0.1, 26); boat.rotation.y = 0.6; world.add(boat);
      // дома и деревья внутри карты
      const rng = (() => { let q = 5; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
      const decor = new T.Group();
      const VILLAGES = [[-215, 10], [215, 10], [-200, 120], [210, 110], [0, -120], [-150, -110], [160, -110]], SLOT_XS = [-78, -26, 26, 78];
      const hcol = [0xf4d6a0, 0xe8c0c0, 0xc9e0f0, 0xe0e8b0], rcol = [0xb23a2a, 0xa5402d, 0x7a2f23];
      for (let i = 0; i < 90; i++) {
        const x = (rng() - 0.5) * 260, z = 84 + rng() * 34; if (Math.abs(x) > 128) continue;
        if (Object.values(TOWN).some(([bx, bz]) => Math.abs(bx - x) < 14 && Math.abs(bz - z) < 12)) continue;
        const h = house(2 + rng() * 1.2, 2 + rng() * 1.2, 1.5 + rng(), hcol[i % 4], rcol[i % 3]); h.scale.setScalar(1.9); h.position.set(x, 0, z + 4); h.rotation.y = Math.PI + (rng() - 0.5) * 0.4; decor.add(h);
      }
      // пятна на траве: сухая трава, тёмные места, чтобы земля не была однотонной
      { const pg = new T.CircleGeometry(1, 18);
        for (let i = 0; i < 160; i++) {
          const dry = rng() < 0.5, r = 14 + rng() * 38;
          const m = new T.Mesh(pg, dry ? texMat('grass_dry', r / 9, r / 9, 0xe0dcb0, 0, 0, 0, { transparent: true, opacity: 0.42, depthWrite: false }) : mat(0x3a5a26, { transparent: true, opacity: 0.3, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; m.scale.set(r, r * (0.6 + rng() * 0.5), 1); m.rotation.z = rng() * 3; m.position.set((rng() - 0.5) * 520, 0.012 + i * 0.0004, -150 + rng() * 420); m.receiveShadow = true; world.add(m);
        } }
      // деревни по краям карты
      for (const [vx, vz] of VILLAGES) for (let i = 0; i < 12; i++) {
        const h = house(2 + rng() * 1.4, 2 + rng() * 1.4, 1.5 + rng(), hcol[i % 4], rcol[i % 3]); h.scale.setScalar(1.9); h.position.set(vx + (i % 6) * 12 - 30, 0, vz + Math.floor(i / 6) * 14 - 7); h.rotation.y = (rng() - 0.5) * 0.6; decor.add(h);
        if (rng() < 0.7) { const t = tree(1.3 + rng() * 0.6, 'oak'); t.position.set(h.position.x + 6, 0, h.position.z + 5); decor.add(t); }
      }
      for (let i = 0; i < 140; i++) {
        const x = (rng() - 0.5) * 250, z = 4 + rng() * 48;
        if (ROAD_X.some((rx) => Math.abs(x - rx) < 5)) continue;
        if (z > 12 && z < 46 && SLOT_XS.some((sx) => Math.abs(x - sx - 4) < 22)) continue;
        if (z < 6 || z > 51) continue;
        const t = tree(1.1 + rng() * 0.9); t.position.set(x, 0, z); decor.add(t);
      }
      world.add(bakeTex(decor));
      // лампы
      for (let x = -120; x <= 120; x += 18) for (const z of [-4.2, 4.6, ROAD_Z[1] - 4.2, ROAD_Z[1] + 4.6]) { const lp = new T.Group(); lp.add(part('cyl', 0x37474f, 0, 0.9, 0, 0.08, 1.8, 0.08)); lp.add(part('sph', 0xfff59d, 0, 1.85, 0, 0.25, 0.25, 0.25, { emissive: 0x887722 })); lp.position.set(x, 0, z); lp.scale.setScalar(1.9); world.add(lp); }
      // лес по краям карты (instancing)
      const treeSpots = [];
      const deco = [[-170, -28, 80, 44], [-170, 50, 80, 44], [170, -28, 80, 44], [170, 50, 80, 44], [-60, -108, 100, 40], [60, -108, 100, 40], [-30, 130, 90, 30], [120, 135, 70, 30]];
      for (let i = 0; i < 12000 && treeSpots.length < 5200; i++) {
        const x = (rng() - 0.5) * 760, z = -260 + rng() * 600;
        const inCore = x > -132 && x < 132 && z > -78 && z < 142; if (inCore) continue;
        if (deco.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + 3 && Math.abs(z - cz) < d / 2 + 3)) continue;
        if (VILLAGES.some(([vx, vz]) => Math.abs(x - vx) < 40 && Math.abs(z - vz) < 20)) continue;
        treeSpots.push([x, z, 1.4 + rng() * 1.6, rng()]);
      }
      // большие поля по краям карты: просто для красоты, как на настоящей ферме
      deco.forEach(([cx, cz, w, d], i) => {
        const kind = ['wheat_field', 'soil_plowed', 'grass', 'wheat_field', 'soil_plowed', 'wheat_field', 'grass', 'soil_plowed'][i], col = { wheat_field: 0xe0b44a, soil_plowed: 0x7a4e2b, grass: 0x82c45a }[kind];
        const f = part('box', col, cx, 0.05, cz, w, 0.1, d); f.material = texMat(kind, w / 14, d / 14, col); f.castShadow = false; world.add(f);
        for (let k = -1; k <= 1; k += 2) { const h = part('box', 0xa89268, cx, 0.03, cz + k * (d / 2 + 1.2), w + 4, 0.06, 2.2); h.material = texMat('dirt_path', w / 8, 0.5, 0xa89268); h.castShadow = false; world.add(h); }
      });
      const pines = treeSpots.filter((t) => t[3] < 0.55), oaks = treeSpots.filter((t) => t[3] >= 0.55);
      const trunkGeo = G.cyl(), coneGeo = G.cone(), sphGeo = new T.SphereGeometry(0.5, 7, 6);
      const mk = (geoms, list, build) => {
        const m = new T.InstancedMesh(geoms, new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), list.length); m.castShadow = true; m.receiveShadow = true;
        const d = new T.Object3D(), c = new T.Color();
        list.forEach((t, i) => { build(d, t, c); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, c); }); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; world.add(m); return m;
      };
      const green = (c, t) => c.setHSL(0.24 + (t[3] * 7 % 1) * 0.08, 0.36, 0.13 + (t[3] * 13 % 1) * 0.12);
      mk(trunkGeo, treeSpots, (d, t, c) => { d.position.set(t[0], 0.5 * t[2], t[1]); d.scale.set(0.25 * t[2], 1.0 * t[2], 0.25 * t[2]); d.rotation.set(0, 0, 0); c.set(0x5d4037); });
      mk(coneGeo, pines, (d, t, c) => { d.position.set(t[0], 1.8 * t[2], t[1]); d.scale.set(1.5 * t[2], 2.4 * t[2], 1.5 * t[2]); green(c, t); });
      mk(coneGeo, pines, (d, t, c) => { d.position.set(t[0], 2.8 * t[2], t[1]); d.scale.set(1.1 * t[2], 1.8 * t[2], 1.1 * t[2]); green(c, t); });
      mk(sphGeo, oaks, (d, t, c) => { d.position.set(t[0], 2.0 * t[2], t[1]); d.scale.set(2.3 * t[2], 1.9 * t[2], 2.3 * t[2]); green(c, t); c.offsetHSL(0.02, 0.05, 0.03); });
      // дальние холмы
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r = 620 + (i % 3) * 50; const h = part('sph', 0x3d7a3a, Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 0.8 + 20, 120 + (i % 4) * 30, 70 + (i % 5) * 20, 120 + (i % 4) * 30); h.castShadow = false; world.add(h); }
      for (let i = 0; i < 14; i++) { const cl = new T.Group(); for (let k = 0; k < 4; k++) { const b = part('sph', 0xffffff, k * 1.6 - 2.4, 0.3 * (k % 2), 0, 3.6, 1.6, 2.4, { transparent: true, opacity: 0.92 }); b.castShadow = false; cl.add(b); } cl.position.set(-260 + i * 40, 90 + (i % 3) * 8, -120 + (i % 5) * 60); clouds.push(cl); scene.add(cl); }
      for (let i = 0; i < 6; i++) { const c = new T.Group(); c.scale.setScalar(1.9); const col = [0xef5350, 0x42a5f5, 0xffee58, 0x66bb6a, 0xab47bc, 0xff7043][i]; c.add(part('box', col, 0, 0.3, 0, 0.6, 0.3, 1.1)); c.add(part('box', 0xcfe9ff, 0, 0.55, 0, 0.5, 0.25, 0.55)); c.userData = { dir: i % 2 ? -1 : 1, off: i * 31, z: i < 3 ? ROAD_Z[0] : ROAD_Z[1] }; cars.push(c); world.add(c); }
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
      return g;
    }
    function tileMaterial(kind, wet, x, y) {
      const v = (x * 7 + y * 13) % 4, ox = (v & 1) * 0.5, oy = (v >> 1) * 0.5;
      if (kind === 'grass') return hasTex('grass') ? texMat('grass', 0.5, 0.5, 0x74b84f, ox, oy, ((x + y) % 2) * Math.PI / 2) : mat(tileCol.grass[(x + y) & 1]);
      return wet ? texMat('soil_wet', 0.5, 0.5, tileCol.wet, ox, oy) : texMat('soil_plowed', 0.5, 0.5, tileCol.soil, ox, oy);
    }
    const tileSig = (t, wet) => (t.k === 'crop' ? 'c' + t.crop + L.stage(t) + (wet ? 'w' : '') : t.k);

    function createView(di) {
      const def = L.FARM_DEFS[di], [sx, sz] = SLOT[def.id];
      const fv = { di, def, id: def.id, cx: sx + FIELD_SHIFT, cz: sz, key: '', w: 0, h: 0, tiles: [], g: new T.Group(), tg: new T.Group(), crops: new T.Group(), props: new T.Group(), extra: null, sig: '', sfi: -1, animals: [], animalSig: '', pen: null, drone: null };
      fv.g.position.set(fv.cx, 0, fv.cz); fv.g.scale.setScalar(TS); fv.g.add(fv.tg); fv.g.add(fv.crops); fv.g.add(fv.props); world.add(fv.g);
      return fv;
    }
    function buildStatic(fv, S, owned, w, h) {
      for (const g of [fv.tg, fv.crops, fv.props]) { while (g.children.length) { const c = g.children[0]; g.remove(c); if (c.geometry && c.geometry.userData.own) c.geometry.dispose(); } }
      for (const l of fv.labels || []) dropLabel(l); fv.labels = []; fv.tiles = []; fv.animals = []; fv.animalSig = ''; fv.sig = ''; fv.extra = null; fv.drone = null; fv.pen = null; fv.penLabel = null;
      fv.w = w; fv.h = h;
      const fenceC = 0xa1783f, def = fv.def;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = part('box', 0x74b84f, x - w / 2 + 0.5, 0.05, y - h / 2 + 0.5, 0.97, 0.1, 0.97); m.material = tileMaterial('grass', false, x, y); m.castShadow = false;
        fv.tg.add(m); fv.tiles.push({ mesh: m, sig: '', model: null });
      }
      // забор с воротами у дороги
      const gateX = Math.floor(w / 2), side = fv.cz < 0 ? 1 : -1; // дорога ниже для верхнего ряда и выше для нижнего
      for (let x = -1; x <= w; x++) for (const zz of [-1, h]) { const isRoadSide = (side > 0 && zz === h) || (side < 0 && zz === -1); if (isRoadSide && (x === gateX || x === gateX - 1)) continue; fv.props.add(part('box', fenceC, x - w / 2 + 0.5, 0.3, zz - h / 2 + 0.5, 0.12, 0.6, 0.12)); if (x < w && !(isRoadSide && (x === gateX || x === gateX - 1))) fv.props.add(part('box', fenceC, x - w / 2 + 1, 0.42, zz - h / 2 + 0.5, 1, 0.07, 0.07)); }
      for (let y = -1; y <= h; y++) for (const xx of [-1, w]) { fv.props.add(part('box', fenceC, xx - w / 2 + 0.5, 0.3, y - h / 2 + 0.5, 0.12, 0.6, 0.12)); if (y < h) fv.props.add(part('box', fenceC, xx - w / 2 + 0.5, 0.42, y - h / 2 + 1, 0.07, 0.07, 1)); }
      // дорожка к воротам
      const pathZ = side > 0 ? h / 2 + 0.5 + 2.2 : -h / 2 - 0.5 - 2.2;
      { const pth = part('box', 0xb08d57, gateX - w / 2, 0.03, pathZ, 2, 0.06, 4.4); pth.material = texMat('dirt_path', 1, 2, 0xb08d57); pth.castShadow = false; fv.props.add(pth); }
      if (!owned) {
        const sign = new T.Group(); sign.add(part('cyl', 0x8d6e63, -0.9, 0.9, 0, 0.12, 1.8, 0.12)); sign.add(part('cyl', 0x8d6e63, 0.9, 0.9, 0, 0.12, 1.8, 0.12)); sign.add(part('box', 0xcdb38b, 0, 1.6, 0, 2.2, 0.8, 0.1)); sign.position.set(0, 0, side > 0 ? h / 2 + 1.2 : -h / 2 - 1.2); fv.props.add(sign);
        const lock = !(S.level >= def.level);
        fv.labels.push(addLabel('map', `${def.icon} ${def.name}<br><small>${lock ? '🔒 с ' + def.level + ' уровня' : '🛒 купить за ' + def.cost + ' 🪙'}</small>`, new T.Vector3(fv.cx, 7, fv.cz), 'bld' + (lock ? ' locked' : ''), () => cb.onFarmSign(def.id)));
        fv.labels[0].dyn = true;
        return;
      }
      // амбар и силос слева от поля
      const barn = buildingModel(def.id); barn.scale.setScalar(0.9); barn.position.set(-(w / 2 + 4.6), 0, 0); barn.children[0].visible = false; barn.rotation.y = Math.PI / 2; fv.props.add(barn);
      barn.traverse((o) => { o.userData.bid = 'warehouse'; });
      fv.labels.push(addLabel('map', `${def.icon} ${def.name}`, new T.Vector3(fv.cx - (w / 2 + 4.6) * TS, 11, fv.cz), 'bld', () => cb.onBuilding('warehouse')));
      if (def.id === 'home') {
        const px = -(w / 2 + 4.6) - 0.5, pz = -8.4; fv.pen = { x: px, z: pz, w: 7, d: 5 };
        const p = fv.pen;
        { const pf = part('box', 0x93c46d, px, 0.04, pz, p.w, 0.08, p.d); pf.material = texMat('dirt_path', 3, 2, 0x93c46d); pf.castShadow = false; fv.props.add(pf); }
        for (let i = 0; i <= 14; i++) { const fx = px - p.w / 2 + i * p.w / 14; fv.props.add(part('box', fenceC, fx, 0.3, pz + p.d / 2, 0.1, 0.6, 0.1)); fv.props.add(part('box', fenceC, fx, 0.3, pz - p.d / 2, 0.1, 0.6, 0.1)); }
        for (let i = 0; i <= 10; i++) { const fz = pz - p.d / 2 + i * p.d / 10; fv.props.add(part('box', fenceC, px - p.w / 2, 0.3, fz, 0.1, 0.6, 0.1)); fv.props.add(part('box', fenceC, px + p.w / 2, 0.3, fz, 0.1, 0.6, 0.1)); }
        fv.props.add(part('box', fenceC, px, 0.42, pz + p.d / 2, p.w, 0.07, 0.07)); fv.props.add(part('box', fenceC, px, 0.42, pz - p.d / 2, p.w, 0.07, 0.07));
        fv.props.add(part('box', 0x6d4c2f, px + 2.6, 0.2, pz + 1.6, 1.2, 0.4, 0.5)); fv.props.add(part('box', 0xc9a24a, px + 2.6, 0.42, pz + 1.6, 1.1, 0.06, 0.4));
        fv.penLabel = addLabel('map', '', new T.Vector3(fv.cx + px * TS, 5.6, fv.cz + pz * TS), 'penlbl', () => cb.onPen()); fv.labels.push(fv.penLabel);
      }
    }
    function syncView(fv, S) {
      const sfi = S.farms.findIndex((f) => f.id === fv.id), owned = sfi >= 0, f = owned ? S.farms[sfi] : null;
      const w = owned ? f.w : fv.def.plots[0][0], h = owned ? f.h : fv.def.plots[0][1];
      const key = fv.id + ':' + owned + ':' + w + 'x' + h + ':' + (owned || S.level >= fv.def.level);
      if (fv.key !== key) { fv.key = key; buildStatic(fv, S, owned, w, h); }
      fv.sfi = sfi; if (!owned) return;
      for (let i = 0; i < f.tiles.length; i++) {
        const t = f.tiles[i], c = fv.tiles[i], wet = t.k === 'crop' && t.water > 0, sig = tileSig(t, wet);
        if (sig === c.sig) continue; c.sig = sig;
        if (c.model) { fv.crops.remove(c.model); c.model.geometry.dispose(); c.model = null; }
        c.mesh.material = tileMaterial(t.k, wet, i % f.w, (i / f.w) | 0);
        c.mesh.scale.y = t.k === 'grass' ? 0.1 : 0.16; c.mesh.position.y = t.k === 'grass' ? 0.05 : 0.08;
        if (t.k === 'crop') { const m = fieldPlants(t.crop, L.stage(t), i); m.position.set(c.mesh.position.x, 0.16, c.mesh.position.z); const b = bake(m, 0.1); fv.crops.add(b); c.model = b; }
      }
      const esig = JSON.stringify(f.sprinklers) + f.scarecrows + [S.up.drone, S.up.collector, S.up.courier].join() + JSON.stringify(S.barns);
      if (fv.sig !== esig) {
        fv.sig = esig; if (fv.extra) fv.props.remove(fv.extra);
        const ex = new T.Group();
        for (const p of f.sprinklers) { const sp = new T.Group(); sp.add(part('cyl', 0x546e7a, 0, 0.25, 0, 0.12, 0.5, 0.12)); sp.add(part('cyl', 0x29b6f6, 0, 0.55, 0, 0.35, 0.1, 0.35)); sp.position.set(p.x - f.w / 2 + 0.5, 0, p.y - f.h / 2 + 0.5); ex.add(sp); }
        for (let i = 0; i < Math.min(f.scarecrows, 4); i++) { const sc2 = new T.Group(); sc2.add(part('cyl', 0x8d6e63, 0, 0.7, 0, 0.08, 1.4, 0.08)); sc2.add(part('box', 0x8d6e63, 0, 1.0, 0, 0.9, 0.08, 0.08)); sc2.add(part('sph', 0xf3d9a4, 0, 1.5, 0, 0.3)); sc2.add(part('cone', 0xb71c1c, 0, 1.78, 0, 0.45, 0.3, 0.45)); sc2.add(part('box', 0x1976d2, 0, 0.95, 0, 0.4, 0.5, 0.18)); sc2.position.set(-f.w / 2 - 0.6, 0, -f.h / 2 + 1.5 + i * 1.6); ex.add(sc2); }
        if (fv.pen) {
          const pen = fv.pen; let bi = 0; const roofs = { chicken: 0xe53935, duck: 0x1e88e5, cow: 0x6d4c41, sheep: 0x8e24aa, goat: 0xf9a825, pig: 0xec407a, bee: 0xffb300 };
          for (const k of L.ANIMAL_ORDER) if (S.barns && S.barns[k]) { const lv = S.barns[k], hh = house(0.9, 0.9, 0.7, 0xf3e3c3, roofs[k]); hh.scale.setScalar(0.75 + lv * 0.05); hh.position.set(pen.x - pen.w / 2 + 0.7 + bi * (pen.w - 1.4) / 6, 0.05, pen.z - pen.d / 2 + 0.8); bi++; ex.add(hh); }
          fv.drone = null;
          if (S.up.drone > 0) { const d = new T.Group(); d.add(part('box', 0x37474f, 0, 0, 0, 0.5, 0.14, 0.5)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) d.add(part('cyl', 0xb0bec5, x * 0.3, 0.1, z * 0.3, 0.3, 0.03, 0.3)); d.add(part('sph', 0xff5252, 0, -0.1, 0.2, 0.1)); d.scale.setScalar(1.2); ex.add(d); fv.drone = d; }
          if (S.up.collector > 0) { const r = new T.Group(); r.add(part('box', 0x90a4ae, 0, 0.35, 0, 0.4, 0.5, 0.3)); r.add(part('box', 0xcfd8dc, 0, 0.75, 0, 0.3, 0.26, 0.26)); r.add(part('box', 0x00e5ff, 0, 0.77, 0.14, 0.2, 0.08, 0.04, { emissive: 0x005566 })); r.position.set(pen.x + pen.w / 2 + 0.9, 0, pen.z + pen.d / 2 - 0.6); ex.add(r); }
          if (S.up.courier > 0) { const v = truckModel(1); v.position.set(pen.x + pen.w / 2 + 2.6, 0, pen.z + 0.4); v.rotation.y = 1.6; ex.add(v); }
        }
        fv.extra = ex; fv.props.add(ex);
      }
      if (fv.pen) {
        const sig = L.ANIMAL_ORDER.map((k) => S.animals[k] || 0).join(',');
        if (sig !== fv.animalSig) {
          fv.animalSig = sig; for (const a of fv.animals) fv.props.remove(a.g); fv.animals = [];
          for (const k of L.ANIMAL_ORDER) for (let i = 0; i < (S.animals[k] || 0); i++) { const g = animalModel(k), p = fv.pen; g.position.set(p.x + (Math.random() - 0.5) * (p.w - 1), 0.08, p.z + 0.6 + (Math.random() - 0.5) * (p.d - 2.2)); fv.props.add(g); fv.animals.push({ g, key: k, tx: g.position.x, tz: g.position.z, wait: Math.random() * 3, ph: Math.random() * 6 }); }
        }
        const pend = L.ANIMAL_ORDER.reduce((a, k) => a + ((S.prod[k] && S.prod[k].pending) || 0), 0), own = L.ANIMAL_ORDER.reduce((a, k) => a + (S.animals[k] || 0), 0);
        if (fv.penLabel) { fv.penLabel.el.innerHTML = own ? (pend ? `🧺 Собрать (${pend})` : '🐾 Животные') : '➕ Животные'; fv.penLabel.el.classList.toggle('ready', pend > 0); }
      }
    }
    function syncViews(S) { if (!views.length) L.FARM_DEFS.forEach((d, i) => views.push(createView(i))); for (const v of views) syncView(v, S); }
    const sfiView = (sfi) => views.find((v) => v.sfi === sfi);
    const tileWorld = (fv, x, y) => [fv.cx + (x - fv.w / 2 + 0.5) * TS, fv.cz + (y - fv.h / 2 + 0.5) * TS];

    // --- машины (перетаскиваются мышью)
    const vehs = {};
    function syncVehicles(S) {
      S.veh = S.veh || {};
      for (const k of VEH_KEYS) {
        const lv = S.up[k] || 0;
        if (lv > 0 && !vehs[k]) {
          const g = vehicleModel(k, lv > 5); g.scale.setScalar(1.9); g.traverse((o) => { o.userData.veh = k; });
          if (!S.veh[k]) { S.veh[k] = { x: VEH_START[k][0], z: VEH_START[k][1], r: 1.57 }; }
          g.position.set(S.veh[k].x, 0.1, S.veh[k].z); g.rotation.y = S.veh[k].r; world.add(g);
          vehs[k] = { g, key: k, lab: addLabel('map', '', new T.Vector3(), 'vlbl'), anim: null };
        }
        if (vehs[k]) { const sc = 1 + Math.min(lv, 10) * 0.025; vehs[k].g.scale.setScalar(1.9 * sc); }
      }
    }
    function setVehPos(k, x, z, r) { const v = vehs[k], S = W.S; if (!v) return; v.g.position.set(x, 0.1, z); if (r != null) v.g.rotation.y = r; S.veh[k] = { x, z, r: v.g.rotation.y }; }
    function workAnim(k) { const v = vehs[k]; if (v) v.anim = { t: 0, x: v.g.position.x, z: v.g.position.z }; }

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
        if (!o) { const m = truckModel(S.trucks[t.truck] ? S.trucks[t.truck].lvl : 0); m.scale.multiplyScalar(1.9); world.add(m); o = truckMeshes[t.id] = { m, lab: addLabel('map', '', new T.Vector3(), 'tlbl') }; }
        const p = t.phase === 'out' ? 1 - t.left / t.total : t.left / t.total, rp = routePos(p), side = (t.truck % 2 ? 1.5 : -1.5) * (t.phase === 'out' ? 1 : -1), horiz = Math.abs(Math.cos(rp.a)) < 0.5;
        o.m.position.set(rp.x + (horiz ? 0 : side), 0.05, rp.z + (horiz ? side : 0)); o.m.rotation.y = rp.a + (t.phase === 'out' ? 0 : Math.PI);
        o.lab.pos.set(o.m.position.x, 5, o.m.position.z);
        o.lab.el.textContent = (t.ev && t.ev.id === 'broke' ? '🔧 ' : t.ev && t.ev.id === 'jam' ? '🚦 ' : '') + (t.phase === 'out' ? '📦 ' : '↩️ ') + Math.ceil(t.left / 1000) + ' с';
      }
    }

    // --- камера: вращение, перемещение, масштаб
    const cam = { tx: -20, tz: 4, yaw: 0, pitch: 0.95, dist: 60, gx: -20, gz: 4, gd: 60 };
    const keys = {};
    function applyCamera() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, sp * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
      camera.lookAt(cam.tx, 0, cam.tz);
    }
    function panBy(dx, dz) { // в осях экрана (вправо, вперёд)
      const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      cam.gx = Math.max(-260, Math.min(260, cam.gx + dx * c + dz * s)); cam.gz = Math.max(-170, Math.min(200, cam.gz - dx * s + dz * c));
    }
    function focus(x, z, d) { cam.gx = x; cam.gz = z; if (d) cam.gd = d; }
    function resize() {
      const r = canvas.parentElement.getBoundingClientRect(); const w = Math.max(300, r.width), h = Math.max(300, r.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    window.addEventListener('keydown', (e) => { if (!W.inputOn || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return; const k = e.key.toLowerCase(); keys[k] = true; keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.gd = Math.min(420, Math.max(12, cam.gd * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

    // --- мышь
    const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), -0.16);
    const setRay = (ev) => { const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
    const groundAt = (ev) => { setRay(ev); const p = new T.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; };
    function pickFarm(p) {
      for (const fv of views) {
        const x = Math.floor((p.x - fv.cx) / TS + fv.w / 2), y = Math.floor((p.z - fv.cz) / TS + fv.h / 2);
        if (fv.w && x >= 0 && y >= 0 && x < fv.w && y < fv.h) return { fv, sfi: fv.sfi, x, y, owned: fv.sfi >= 0 };
        if (fv.pen && Math.abs(p.x - fv.cx - fv.pen.x * TS) < fv.pen.w * TS / 2 && Math.abs(p.z - fv.cz - fv.pen.z * TS) < fv.pen.d * TS / 2) return { fv, pen: true };
      }
      return null;
    }
    function pickVehicle(ev) {
      setRay(ev); const objs = Object.values(vehs).map((v) => v.g); const hits = ray.intersectObjects(objs, true);
      for (const h of hits) { let o = h.object; while (o && !o.userData.veh) o = o.parent; if (o && o.userData.veh) return o.userData.veh; if (h.object.userData.veh) return h.object.userData.veh; }
      return null;
    }
    function pickBuilding(ev) {
      setRay(ev); const hits = ray.intersectObjects(world.children, true);
      for (const h of hits) { if (h.object.userData.bid) return h.object.userData.bid; if (h.object.isInstancedMesh) return null; }
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
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      if (ev.button === 2 || ev.button === 1) { pan = { x: ev.clientX, y: ev.clientY, mode: ev.button === 1 || ev.shiftKey ? 'rot' : 'pan' }; return; }
      const k = pickVehicle(ev);
      if (k && vehs[k]) { const p = groundAt(ev); drag = { k, off: p ? [vehs[k].g.position.x - p.x, vehs[k].g.position.z - p.z] : [0, 0], moved: false, sx: ev.clientX, sy: ev.clientY }; vehs[k].g.position.y = 0.35; cb.onVehicleGrab && cb.onVehicleGrab(k); return; }
      const p = groundAt(ev), hit = p && pickFarm(p);
      paint = { moved: false, sx: ev.clientX, sy: ev.clientY, ev };
      if (hit && hit.owned && !hit.pen) { lastTile = hit.sfi + ',' + hit.x + ',' + hit.y; paint.active = true; cb.onTile(hit.sfi, hit.x, hit.y, true); }
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (pan) { const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y; pan.x = ev.clientX; pan.y = ev.clientY;
        if (pan.mode === 'rot') { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.35, Math.min(1.35, cam.pitch + dy * 0.005)); }
        else { const k = cam.dist * 0.0017; panBy(-dx * k, -dy * k * 1.3); cam.tx = cam.gx; cam.tz = cam.gz; } return; }
      const S = W.S;
      if (drag) {
        if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4) drag.moved = true;
        const p = groundAt(ev); if (p) { const v = vehs[drag.k], nx = p.x + drag.off[0], nz = p.z + drag.off[1]; const dxm = nx - v.g.position.x, dzm = nz - v.g.position.z; setVehPos(drag.k, nx, nz, Math.hypot(dxm, dzm) > 0.05 ? Math.atan2(dxm, dzm) : null); v.g.position.y = 0.35;
          highlight(vehCells(drag.k, pickFarm(p), S), 0xffc83d); } return; }
      const p = groundAt(ev), hit = p && pickFarm(p);
      if (hit && hit.owned && !hit.pen) { cb.onHover && cb.onHover({ sfi: hit.sfi, x: hit.x, y: hit.y, wx: tileWorld(hit.fv, hit.x, hit.y) }); } else { cb.onHover && cb.onHover(null); }
      canvas.style.cursor = pickVehicle(ev) ? 'grab' : 'default';
      if (paint) {
        if (Math.hypot(ev.clientX - paint.sx, ev.clientY - paint.sy) > 6) paint.moved = true;
        if (paint.active && hit && hit.owned && !hit.pen && ev.buttons & 1) { const k = hit.sfi + ',' + hit.x + ',' + hit.y; if (k !== lastTile) { lastTile = k; cb.onTile(hit.sfi, hit.x, hit.y, false); } }
      }
    });
    canvas.addEventListener('pointerup', (ev) => {
      if (pan) { pan = null; return; }
      if (drag) {
        const v = vehs[drag.k], S = W.S; v.g.position.y = 0.1; highlight(null);
        const p = groundAt(ev), hit = p && pickFarm(p);
        if (drag.moved && hit && hit.owned && !hit.pen) cb.onVehicleDrop(drag.k, hit.sfi, hit.x, hit.y);
        else if (!drag.moved) cb.onVehicleClick && cb.onVehicleClick(drag.k);
        drag = null; return;
      }
      if (paint && !paint.moved && !paint.active) {
        const b = pickBuilding(ev); if (b) cb.onBuilding(b);
        else { const p = groundAt(ev), hit = p && pickFarm(p); if (hit && hit.pen) cb.onPen(); }
      }
      paint = null; lastTile = '';
    });
    canvas.addEventListener('pointerleave', () => { cb.onHover && cb.onHover(null); });

    // --- эффекты
    const parts = [];
    function burst(kind, x, y, z) {
      const col = { dig: 0x7a4e2b, plant: 0x7cb342, water: 0x4fc3f7, harvest: 0xffd54f, build: 0xb0bec5, fert: 0xce93d8, coin: 0xffc107, remove: 0x9e9e9e, gold: 0xffeb3b }[kind] || 0xffffff;
      for (let i = 0; i < 10; i++) { const m = new T.Mesh(G.box(), new T.MeshBasicMaterial({ color: col })); m.scale.setScalar(0.18 + Math.random() * 0.12); m.position.set(x, y, z); scene.add(m); parts.push({ m, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 2.4, vz: (Math.random() - 0.5) * 2.4, life: 0.7 }); }
    }
    function fx(kind, sfi, tx, ty, opts) { const fv = sfiView(sfi); if (!fv) return; const [x, z] = tileWorld(fv, tx, ty); burst(opts && opts.gold ? 'gold' : kind, x, 0.6, z); }
    function tileScreen(sfi, tx, ty) { const fv = sfiView(sfi); if (!fv) return { x: 0, y: 0 }; const [x, z] = tileWorld(fv, tx, ty); const v = new T.Vector3(x, 0.6, z).project(camera), r = canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top }; }
    function vehScreen(k) { const v = vehs[k]; if (!v) return { x: 0, y: 0 }; const p = v.g.position.clone(); p.y = 2.4; p.project(camera); const r = canvas.getBoundingClientRect(); return { x: (p.x * 0.5 + 0.5) * r.width + r.left, y: (-p.y * 0.5 + 0.5) * r.height + r.top }; }

    // --- цикл
    const rain = (() => {
      const n = 900, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 120; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 100; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const p = new T.Points(g, new T.PointsMaterial({ color: 0xaad4ff, size: 0.22, transparent: true, opacity: 0.8 })); p.visible = false; p.frustumCulled = false; scene.add(p); return p;
    })();
    const skyDay = rgb(0xa4c4d8), skyNight = rgb(0x0b1330), skyDusk = rgb(0xf0a070), skyRain = rgb(0x7a8794), skyDry = rgb(0xe8c58a);
    function lighting(tod, weather) {
      const ang = tod * Math.PI * 2, day = Math.max(0, Math.min(1, 0.5 + Math.sin(ang - Math.PI / 2) * -0.5 * 1.4 + 0.15)), light = Math.max(0.06, day);
      const skyC = skyNight.clone().lerp(skyDay, light), dusk = Math.max(0, 1 - Math.abs(day - 0.45) * 5) * 0.45; skyC.lerp(skyDusk, dusk);
      if (weather === 'rain') skyC.lerp(skyRain, 0.6); else if (weather === 'drought') skyC.lerp(skyDry, 0.45);
      scene.background.copy(skyC); scene.fog.color.copy(skyC);
      skyDome.material.uniforms.bot.value.copy(skyC); skyDome.material.uniforms.top.value.copy(skyC).multiplyScalar(0.62).lerp(skyNight, 1 - light).offsetHSL(0, 0.12, -0.02);
      hemi.intensity = 0.3 + light * 0.45; sun.intensity = 0.06 + light * 1.05 * (weather === 'rain' ? 0.5 : 1); sun.color.set(dusk > 0.1 ? 0xffa860 : 0xffe9c4);
      { const e = Math.min(170, Math.max(60, cam.dist * 0.95)); if (Math.abs(sc.right - e) > 1) { sc.left = -e; sc.right = e; sc.top = e * 0.87; sc.bottom = -e * 0.87; sc.far = 500; sc.updateProjectionMatrix(); } }
      sun.position.set(cam.tx + Math.cos(ang) * 60, 40 + Math.max(0, Math.sin(ang)) * 60, cam.tz + 30); sun.target.position.set(cam.tx, 0, cam.tz);
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
      syncViews(S); syncVehicles(S); syncTrips(S);
      lighting(S.clock / L.DAY_MS, S.weather.type);
      rain.visible = S.weather.type === 'rain';
      if (rain.visible) { const a = rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 18; if (y < 0) y = 30; a.setY(i, y); } a.needsUpdate = true; rain.position.set(cam.tx, 0, cam.tz); }
      for (const cl of clouds) { cl.position.x += dt * 0.8; if (cl.position.x > 300) cl.position.x = -300; }
      for (const b of Object.values(bMeshes)) b.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 1.2; });
      for (const c of cars) { const u = c.userData, len = 260, t = (W.time * 7 + u.off * 6) % len; c.position.set(u.dir > 0 ? -130 + t : 130 - t, 0.02, u.z + (u.dir > 0 ? 1.7 : -1.7)); c.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      for (const fv of views) {
        for (const a of fv.animals) {
          a.wait -= dt; if (a.wait <= 0) { const p = fv.pen; a.tx = p.x + (Math.random() - 0.5) * (p.w - 1.2); a.tz = p.z + 0.6 + (Math.random() - 0.5) * (p.d - 2.2); a.wait = 2 + Math.random() * 4; }
          const dx = a.tx - a.g.position.x, dz = a.tz - a.g.position.z, d = Math.hypot(dx, dz);
          if (a.key === 'bee') { a.g.position.x += Math.cos(W.time + a.ph) * dt * 0.6; a.g.position.z += Math.sin(W.time * 1.3 + a.ph) * dt * 0.6; a.g.position.y = 0.4 + Math.sin(W.time * 5 + a.ph) * 0.08; }
          else if (d > 0.08) { a.g.position.x += dx / d * dt * 0.7; a.g.position.z += dz / d * dt * 0.7; a.g.rotation.y = Math.atan2(dx, dz); a.g.position.y = 0.08 + Math.abs(Math.sin(W.time * 8 + a.ph)) * 0.05; } else a.g.position.y = 0.08;
        }
        if (fv.drone) { const a = W.time * 0.5; fv.drone.position.set(Math.cos(a) * fv.w * 0.35, 3.2 + Math.sin(W.time * 2) * 0.15, Math.sin(a) * fv.h * 0.3); fv.drone.rotation.y = -a; }
      }
      for (const k of Object.keys(vehs)) {
        const v = vehs[k]; if (v.anim) { v.anim.t += dt; const u = v.anim.t / 1.1; if (u >= 1) { v.anim = null; setVehPos(k, v.g.position.x, v.g.position.z); } else { v.g.position.x = v.anim.x + Math.sin(u * Math.PI * 2) * 3.4 * (1 - u * 0.2); } }
        const lv = S.up[k] || 0, cool = S.cool[k] || 0; v.lab.pos.set(v.g.position.x, 5, v.g.position.z);
        const txt = `${L.MACHINES[k].icon} ур.${lv} · ${cool > 0 ? Math.ceil(cool / 1000) + ' с' : 'готов'}`; if (v.lab.el.textContent !== txt) v.lab.el.textContent = txt; v.lab.el.classList.toggle('ready', cool <= 0);
      }
      for (const [id, o] of Object.entries(townLabels)) { const extra = id === 'market' && Object.keys(S.stall).length ? ' 📦' : id === 'casino' && S.tickets > 0 ? ` 🎟️${S.tickets}` : ''; const txt = CITY.names[id] + extra; if (o.el.textContent !== txt) o.el.textContent = txt; }
      for (const fv of views) for (const l of fv.labels || []) if (l.dyn) { const lock = !(S.level >= fv.def.level); const txt = `${fv.def.icon} ${fv.def.name}\n${lock ? '🔒 с ' + fv.def.level + ' уровня' : '🛒 купить за ' + fv.def.cost + ' 🪙'}`; l.el.classList.toggle('locked', lock); }
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy -= 9 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.scale.multiplyScalar(0.97); if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
      skyDome.position.copy(camera.position);
      applyCamera();
      renderer.render(scene, camera);
      const r = canvas.getBoundingClientRect(), v3 = new T.Vector3();
      for (const l of labels) {
        v3.copy(l.pos).project(camera); const dist = camera.position.distanceTo(l.pos);
        const far = (l.el.classList.contains('bld') ? 340 : l.el.classList.contains('penlbl') ? 90 : 80);
        if (v3.z > 1 || dist > far) { l.el.style.display = 'none'; continue; }
        l.el.style.display = ''; l.el.style.transform = `translate(-50%,-100%) translate(${(v3.x * 0.5 + 0.5) * r.width}px,${(-v3.y * 0.5 + 0.5) * r.height}px)`;
      }
    }
    function focusHome() { focus(-80, -16, 70); }
    function focusTown() { focus(0, 66, 110); }
    function focusFarm(id) { const s = SLOT[id]; if (s) focus(s[0] + FIELD_SHIFT, s[1] + (s[1] < 0 ? 6 : -6), 62); }
    function focusAll() { focus(0, 25, 330); }
    window.addEventListener('resize', resize);
    resize(); cam.gx = cam.tx = -80; cam.gz = cam.tz = -14; cam.gd = cam.dist = 66;
    Object.assign(W, { update, fx, highlight, resize, tileScreen, vehScreen, workAnim, focusHome, focusTown, focusFarm, focusAll, screenshot: () => canvas.toDataURL('image/png'), CITY, setVehPos });
    return W;
  }

  root.World3D = { create, CITY, cropModel, animalModel };
})(typeof self !== 'undefined' ? self : this);
