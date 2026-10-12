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
  const TS = 3; // размер одной клетки поля в единицах мира (1 единица ≈ 1 метр)
  const SLOT = { home: [-144, -30], meadow: [-48, -30], grove: [48, -30], valley: [144, -30], lake: [-144, 30], hills: [-48, 30], orchard: [48, 30] };
  const FIELD_LEFT = 8; // левый край поля от центра участка: поле растёт вправо
  const TOWN = { market: [-68, 82], seeds: [-34, 82], tech: [0, 82], bank: [34, 82], casino: [68, 82] };
  const TOWN_MODEL = { market: 'market', seeds: 'seedshop', tech: 'techcenter', bank: 'bank', casino: 'casino' };
  const ROAD_Z = [0.2, 66, 100], ROAD_X = [-192, -96, 0, 96, 192], RW = 8;
  const CITY = {
    names: { market: '🏪 Рынок', seeds: '🌱 Семена и корм', tech: '🚜 Техцентр', bank: '🏦 Банк', casino: '🎰 Колесо удачи', warehouse: '📦 Склад' },
    route: [[-134, -14], [-134, 0.2], [-96, 0.2], [-96, 100], [-68, 100], [-68, 93]],
    center: [0, 30],
  };
  const VEH_KEYS = ['tractor', 'combine', 'waterer', 'spreader'];
  const VEH_START = { tractor: [-147, -8], combine: [-139, -8], waterer: [-130, -8], spreader: [-121, -8] };
  const VEH_VER = 3;
  const MODEL = (kind, name, opts, fb, sc) => { const FM = root.FarmModels; let m = FM && FM.has(kind, name) ? FM.make(kind, name, opts) : null; if (!m) { m = fb ? fb() : new T.Group(); if (sc) m.scale.multiplyScalar(sc); } return m; };
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

  function create(canvas, labelBox, cb) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(); scene.background = new T.Color(0x8ecbf0); scene.fog = new T.Fog(0x8ecbf0, 320, 1500);
    const camera = new T.PerspectiveCamera(42, 1, 0.5, 3200);
    const hemi = new T.HemisphereLight(0xd6e2ec, 0x4a5530, 0.7); scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff1d0, 0.9); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 78; sc.bottom = -78; sc.near = 1; sc.far = 800;
    scene.add(sun); scene.add(sun.target);
    const skyDome = new T.Mesh(new T.SphereGeometry(2600, 24, 12), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new T.Color(0x5c8fb8) }, bot: { value: new T.Color(0xc6d8e2) } }, vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, pow(clamp(h,0.0,1.0), 0.6)), 1.0); }' }));
    skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
    const ground = new T.Mesh(new T.PlaneGeometry(5200, 5200), texMat('grass', 1300, 1300, 0x6fae4f)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const world = new T.Group(); scene.add(world);
    const W = { mode: 'map', cb, renderer, scene, camera, time: 0, S: null, inputOn: true, lite: !!(root.matchMedia && root.matchMedia('(hover:none) and (pointer:coarse)').matches) };
    if (W.lite) { sun.shadow.mapSize.set(2048, 2048); }

    // --- DOM-метки
    const labels = [];
    function addLabel(group, html, pos, cls, onClick) {
      const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = html; labelBox.appendChild(el);
      if (onClick) { el.style.pointerEvents = 'auto'; el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); }); el.addEventListener('pointerdown', (e) => e.stopPropagation()); }
      const o = { el, pos: pos.clone(), group, maxCam: (cls || '').indexOf('bld') >= 0 ? 380 : (cls || '').indexOf('vlbl') >= 0 || (cls || '').indexOf('tlbl') >= 0 ? 520 : 260 }; labels.push(o); return o;
    }
    const dropLabel = (o) => { o.el.remove(); const i = labels.indexOf(o); if (i >= 0) labels.splice(i, 1); };

    // --- статика: дороги, город, деревни, лес, холмы
    const bMeshes = {}, clouds = [], cars = [], townLabels = {};
    (function buildStatic() {
      const road = (x, z, w, d) => { const m = part('box', 0x4a4f57, x, 0.04, z, w, 0.08, d); m.material = texMat('asphalt', w / 6, d / 6, 0x4a4f57); m.castShadow = false; world.add(m); };
      const line = (x, z, w, d, col) => { const m = part('box', col || 0xe2c64a, x, 0.1, z, w, 0.02, d); m.castShadow = false; world.add(m); };
      const ZEND = ROAD_Z[ROAD_Z.length - 1], zTop = -80, zBot = 205, zMid = (zTop + zBot) / 2, zLen = zBot - zTop;
      for (const z of ROAD_Z) road(0, z, 620, RW);
      for (const x of ROAD_X) road(x, zMid, RW, zLen);
      for (const z of ROAD_Z) { for (let x = -300; x < 300; x += 10) line(x, z, 5, 0.35); line(0, z - RW / 2 + 0.5, 620, 0.3, 0xd9c35a); line(0, z + RW / 2 - 0.5, 620, 0.3, 0xd9c35a); }
      for (const x of ROAD_X) { for (let z = zTop; z < zBot; z += 10) line(x, z, 0.35, 5); line(x - RW / 2 + 0.5, zMid, 0.3, zLen, 0xd9c35a); line(x + RW / 2 - 0.5, zMid, 0.3, zLen, 0xd9c35a); }
      // город: ряд зданий у дороги
      for (const [id, [x, z]] of Object.entries(TOWN)) {
        const b = MODEL('building', TOWN_MODEL[id], {}, () => { const m = buildingModel(id); m.scale.setScalar(2.5); return m; });
        b.position.set(x, 0, z); b.rotation.y = 0; world.add(b); bMeshes[id] = b;
        b.traverse((o) => { o.userData.bid = id; });
        townLabels[id] = addLabel('map', CITY.names[id], new T.Vector3(x, 17, z), 'bld', () => cb.onBuilding(id));
      }
      // пруд с пирсом на свободном участке
      const pond = part('cyl', 0x3f9fd6, 144, 0.07, 30, 54, 0.1, 42); pond.castShadow = false; world.add(pond);
      { const d = MODEL('prop', 'dock', {}, () => new T.Group()); d.position.set(144, 0, 12); d.rotation.y = Math.PI; world.add(d); }
      // дома, деревни и деревья
      const rng = (() => { let q = 5; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
      const decor = new T.Group();
      const VILLAGES = [[-330, 10], [330, 10], [-300, 150], [320, 140], [0, -170], [-230, -150], [240, -150]]; // центры деревень (улица идёт по оси X)
      const hcol = [0xf4d6a0, 0xe8c0c0, 0xc9e0f0, 0xe0e8b0], rcol = [0xb23a2a, 0xa5402d, 0x7a2f23];
      const cottage = (i) => { i = Math.abs(Math.round(i)); const m = MODEL('building', 'cottage', { variant: i % 4, seed: i % 3 }, () => { const h = house(3 + rng() * 1.4, 3 + rng() * 1.2, 2 + rng(), hcol[i % 4], rcol[i % 3]); h.scale.setScalar(2.2); return h; }); return m; };
      const treeM = (i, big) => { i = Math.abs(Math.round(i)); return MODEL('tree', big ? ['oak', 'pine', 'birch', 'fruit'][i % 4] : ['oakLow', 'pineLow', 'oakLow', 'oakLow'][i % 4], { seed: i % 3 }, () => tree((big ? 2.4 : 1.8) + rng() * 0.8, i % 3 === 0 ? 'pine' : 'oak')); };
      // улицы с домами: дома стоят ровными рядами лицом к улице, с палисадниками и деревьями
      const fenceG = new T.Group();
      const street = (x0, x1, zc, seed) => {
        road((x0 + x1) / 2, zc, x1 - x0, 7); { for (let x = x0; x < x1; x += 9) line(x + 3, zc, 4, 0.3); }
        for (const sd of [-1, 1]) { const sw = part('box', 0xb9b6ac, (x0 + x1) / 2, 0.05, zc + sd * 5.3, x1 - x0, 0.1, 3.2); sw.material = texMat('concrete', (x1 - x0) / 8, 0.5, 0xb9b6ac); sw.castShadow = false; world.add(sw); }
        let n = 0;
        for (let x = x0 + 8; x <= x1 - 8; x += 15) {
          if (ROAD_X.some((rx) => Math.abs(x - rx) < 12)) continue;
          for (const sd of [-1, 1]) {
            n++; const h = cottage(seed + n + (sd > 0 ? 2 : 0)); h.position.set(x, 0, zc + sd * 12.5); h.rotation.y = sd < 0 ? 0 : Math.PI; decor.add(h);
            for (const sx of [-1, 1]) { const fx0 = x + sx * 1.9, fx1 = x + sx * 7.4; for (let q = 0; q <= 3; q++) { const fx = lerp(fx0, fx1, q / 3); fenceG.add(part('box', 0xf2eee4, fx, 0.5, zc + sd * 7.4, 0.14, 1.0, 0.14)); } const fl = Math.abs(fx1 - fx0); for (const yy of [0.35, 0.8]) fenceG.add(part('box', 0xf2eee4, (fx0 + fx1) / 2, yy, zc + sd * 7.4, fl, 0.1, 0.08)); }
            if (n % 3 === 0) { const t = treeM(n); t.position.set(x + 7.4, 0, zc + sd * 14); decor.add(t); }
          }
          if (((x - x0) / 15) % 2 === 0) { const lp = MODEL('prop', 'streetLamp', {}, () => { const g = new T.Group(); g.add(part('cyl', 0x37474f, 0, 2.2, 0, 0.18, 4.4, 0.18)); g.add(part('sph', 0xfff59d, 0, 4.5, 0, 0.6, 0.6, 0.6, { emissive: 0x887722 })); return g; }); lp.position.set(x + 7.5, 0, zc - 5.4); lp.rotation.y = 0; world.add(lp); }
        }
      };
      street(-150, 150, 130, 0); street(-150, 150, 170, 40);
      for (const [vx, vz] of VILLAGES) street(vx - 50, vx + 50, vz, vx);
      world.add(bake(fenceG, 0.04));
      for (let i = 0; i < 120; i++) { // рощи между фермами и дорогами
        const x = (rng() - 0.5) * 400, z = 6 + rng() * 58;
        if (ROAD_X.some((rx) => Math.abs(x - rx) < 8)) continue; if (z < 8 || z > 62) continue;
        if (Object.values(SLOT).some(([sx, sz]) => sz > 0 && Math.abs(x - sx) < 52 && z > 16 && z < 62)) continue;
        const t = treeM(i); t.position.set(x, 0, z); decor.add(t);
      }
      world.add(bakeTex(decor));
      // пятна на траве: сухая трава и тёмные места с мягкими краями, чтобы земля не была однотонной
      { const pg = new T.CircleGeometry(1, 24), cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#aaa'); gr.addColorStop(1, '#000'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
        const soft = new T.CanvasTexture(cv); const dryMat = [], darkMat = new T.MeshLambertMaterial({ color: 0x35511f, alphaMap: soft, transparent: true, opacity: 0.55, depthWrite: false });
        for (let i = 0; i < 220; i++) {
          const dry = rng() < 0.5, r = 25 + rng() * 70;
          let mt = darkMat; if (dry) { mt = texMat('grass_dry', r / 9, r / 9, 0xe0dcb0, 0, 0, 0, { alphaMap: soft, transparent: true, opacity: 0.7, depthWrite: false }); }
          const m = new T.Mesh(pg, mt); m.rotation.x = -Math.PI / 2; m.scale.set(r, r * (0.6 + rng() * 0.5), 1); m.rotation.z = rng() * 3; m.position.set((rng() - 0.5) * 900, 0.012 + i * 0.0004, -250 + rng() * 650); m.receiveShadow = true; world.add(m);
        } }
      // фонари и столбы вдоль главных дорог
      for (let x = -300; x <= 300; x += 30) for (const z of [-RW / 2 - 2.5, RW / 2 + 2.5, ROAD_Z[1] - RW / 2 - 2.5, ROAD_Z[1] + RW / 2 + 2.5, ROAD_Z[2] - RW / 2 - 2.5, ROAD_Z[2] + RW / 2 + 2.5]) {
        const lp = (x / 30) % 2 === 0 ? MODEL('prop', 'powerPole', {}, () => { const g = new T.Group(); g.add(part('cyl', 0x6d4c2f, 0, 4.5, 0, 0.35, 9, 0.35)); g.add(part('box', 0x6d4c2f, 0, 8.4, 0, 3.2, 0.25, 0.25)); return g; }) : MODEL('prop', 'streetLamp', {}, () => { const g = new T.Group(); g.add(part('cyl', 0x37474f, 0, 2.2, 0, 0.18, 4.4, 0.18)); g.add(part('sph', 0xfff59d, 0, 4.5, 0, 0.6, 0.6, 0.6, { emissive: 0x887722 })); return g; });
        lp.position.set(x, 0, z); lp.rotation.y = z < 30 ? (z < 0 ? 0 : Math.PI) : (z < ROAD_Z[1] ? 0 : Math.PI); world.add(lp);
      }
      // лес по краям карты (instancing)
      const treeSpots = [];
      const deco = [[-300, -30, 110, 60], [-300, 60, 110, 60], [300, -30, 110, 60], [300, 60, 110, 60], [-100, -150, 130, 50], [100, -150, 130, 50], [-60, 190, 120, 34], [210, 195, 100, 34]];
      for (let i = 0; i < 16000 && treeSpots.length < 6500; i++) {
        const x = (rng() - 0.5) * 1100, z = -420 + rng() * 900;
        const inCore = x > -240 && x < 240 && z > -112 && z < 190; if (inCore) continue;
        if (deco.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + 4 && Math.abs(z - cz) < d / 2 + 4)) continue;
        if (VILLAGES.some(([vx, vz]) => Math.abs(x - vx) < 60 && Math.abs(z - vz) < 28)) continue;
        treeSpots.push([x, z, 1.8 + rng() * 1.8, rng()]);
      }
      // большие поля по краям карты: просто для красоты, как на настоящей ферме
      deco.forEach(([cx, cz, w, d], i) => {
        const kind = ['wheat_field', 'soil_plowed', 'grass', 'wheat_field', 'soil_plowed', 'wheat_field', 'grass', 'soil_plowed'][i], col = { wheat_field: 0xe0b44a, soil_plowed: 0x7a4e2b, grass: 0x82c45a }[kind];
        const f = part('box', col, cx, 0.05, cz, w, 0.1, d); f.material = texMat(kind, w / 14, d / 14, col); f.castShadow = false; world.add(f);
        for (let k = -1; k <= 1; k += 2) { const h = part('box', 0xa89268, cx, 0.03, cz + k * (d / 2 + 1.5), w + 6, 0.06, 3); h.material = texMat('dirt_path', w / 8, 0.5, 0xa89268); h.castShadow = false; world.add(h); }
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
      // дальние холмы и облака
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r = 1050 + (i % 3) * 80; const h = part('sph', 0x3d7a3a, Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 0.8 + 40, 200 + (i % 4) * 40, 110 + (i % 5) * 30, 200 + (i % 4) * 40); h.castShadow = false; world.add(h); }
      for (let i = 0; i < 16; i++) { const cl = new T.Group(); for (let k = 0; k < 4; k++) { const b = part('sph', 0xffffff, k * 3.2 - 4.8, 0.6 * (k % 2), 0, 7.2, 3.2, 4.8, { transparent: true, opacity: 0.92 }); b.castShadow = false; cl.add(b); } cl.position.set(-420 + i * 55, 150 + (i % 3) * 14, -250 + (i % 5) * 110); clouds.push(cl); scene.add(cl); }
      for (let i = 0; i < 8; i++) { const c = MODEL('car', i % 3 === 2 ? 'van' : 'sedan', { variant: i }, () => { const g = new T.Group(); const col = [0xef5350, 0x42a5f5, 0xffee58, 0x66bb6a, 0xab47bc, 0xff7043][i % 6]; g.add(part('box', col, 0, 0.7, 0, 1.8, 0.8, 4.2)); g.add(part('box', 0xcfe9ff, 0, 1.35, -0.2, 1.6, 0.6, 2.2)); return g; }); c.userData = { dir: i % 2 ? -1 : 1, off: i * 31, z: ROAD_Z[i % 3] }; cars.push(c); world.add(c); }
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
    function tileMaterial(kind, wet, x, y) {
      const v = (x * 7 + y * 13) % 4, ox = (v & 1) * 0.5, oy = (v >> 1) * 0.5;
      if (kind === 'grass') return hasTex('grass') ? texMat('grass', 0.5, 0.5, 0x74b84f, ox, oy, ((x + y) % 2) * Math.PI / 2) : mat(tileCol.grass[(x + y) & 1]);
      return wet ? texMat('soil_wet', 0.5, 0.5, tileCol.wet, ox, oy) : texMat('soil_plowed', 0.5, 0.5, tileCol.soil, ox, oy);
    }
    const tileSig = (t, wet) => (t.k === 'crop' ? 'c' + t.crop + L.stage(t) + (wet ? 'w' : '') : t.k);

    function createView(di) {
      const def = L.FARM_DEFS[di], [sx, sz] = SLOT[def.id];
      const fv = { di, def, id: def.id, sx, sz, sgn: sz < 0 ? 1 : -1, cx: sx + FIELD_LEFT + def.plots[0][0] * TS / 2, cz: sz, key: '', w: 0, h: 0, tiles: [], g: new T.Group(), tg: new T.Group(), crops: new T.Group(), props: new T.Group(), w3: new T.Group(), extra: null, sig: '', sfi: -1, animals: [], animalSig: '', pen: null, drone: null, labels: [], penLabel: null };
      fv.g.scale.setScalar(TS); fv.g.add(fv.tg); fv.g.add(fv.crops); fv.g.add(fv.props); world.add(fv.g);
      fv.w3.position.set(sx, 0, sz); world.add(fv.w3);
      return fv;
    }
    /** Двор фермы: дом, амбар, силосы, сарай, хозяйственные постройки и (на домашней ферме) загон для животных. Координаты: x от центра участка, zr от центра к дороге. */
    function buildStead(fv, owned, S) {
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
        { const bay = MODEL('prop', 'parkingBay', {}, () => { const b = part('box', 0xb9b9b4, 0, 0.04, 0, 15, 0.08, 10); b.material = texMat('concrete', 3, 2, 0xb9b9b4); return b; }); bay.position.set(-138, 0, -8); g.add(bay); bay.position.set(-138 - fv.sx, 0, -8 - fv.sz); }
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
      fv.w = w; fv.h = h; fv.cx = fv.sx + FIELD_LEFT + w * TS / 2; fv.g.position.set(fv.cx, 0, fv.cz);
      const fenceC = 0x8a6a42;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = part('box', 0x74b84f, x - w / 2 + 0.5, 0.05, y - h / 2 + 0.5, 0.97, 0.1, 0.97); m.material = tileMaterial('grass', false, x, y); m.castShadow = false;
        fv.tg.add(m); fv.tiles.push({ mesh: m, sig: '', model: null });
      }
      // забор с воротами у дороги
      const gateX = Math.floor(w / 2), side = fv.sgn;
      for (let x = -1; x <= w; x++) for (const zz of [-1, h]) { const isRoadSide = (side > 0 && zz === h) || (side < 0 && zz === -1); if (isRoadSide && (x === gateX || x === gateX - 1)) continue; fv.props.add(part('box', fenceC, x - w / 2 + 0.5, 0.3, zz - h / 2 + 0.5, 0.1, 0.6, 0.1)); if (x < w) fv.props.add(part('box', fenceC, x - w / 2 + 1, 0.42, zz - h / 2 + 0.5, 1, 0.05, 0.05)); }
      for (let y = -1; y <= h; y++) for (const xx of [-1, w]) { fv.props.add(part('box', fenceC, xx - w / 2 + 0.5, 0.3, y - h / 2 + 0.5, 0.1, 0.6, 0.1)); if (y < h) fv.props.add(part('box', fenceC, xx - w / 2 + 0.5, 0.42, y - h / 2 + 1, 0.05, 0.05, 1)); }
      // дорожка от ворот к дороге
      const pathLen = Math.abs(fv.sz) - (h * TS) / 2 - RW / 2, pathZ = side > 0 ? h / 2 + 0.5 + pathLen / TS / 2 : -h / 2 - 0.5 - pathLen / TS / 2;
      { const pth = part('box', 0xb08d57, gateX - w / 2, 0.03, pathZ, 2.4, 0.06, pathLen / TS); pth.material = texMat('dirt_path', 1, Math.max(1, pathLen / 6), 0xb08d57); pth.castShadow = false; fv.props.add(pth); }
      buildStead(fv, owned, S);
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
        if (c.model) { fv.crops.remove(c.model); disposeObj(c.model); c.model = null; }
        c.mesh.material = tileMaterial(t.k, wet, i % f.w, (i / f.w) | 0);
        c.mesh.scale.y = t.k === 'grass' ? 0.1 : 0.16; c.mesh.position.y = t.k === 'grass' ? 0.05 : 0.08;
        if (t.k === 'crop') { const b = MODEL('crop', t.crop, { stage: L.stage(t), seed: i }, () => fieldPlants(t.crop, L.stage(t), i)); b.position.set(c.mesh.position.x, 0.16, c.mesh.position.z); b.scale.y = hasModel('crop', t.crop) ? 0.62 : 1; fv.crops.add(b); c.model = b; }
      }
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
    function syncViews(S) { if (!views.length) L.FARM_DEFS.forEach((d, i) => views.push(createView(i))); for (const v of views) syncView(v, S); }
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
          if (!S.veh[k]) S.veh[k] = { x: VEH_START[k][0], z: VEH_START[k][1], r: 0 };
          g.position.set(S.veh[k].x, 0.1, S.veh[k].z); g.rotation.y = S.veh[k].r; world.add(g);
          if (old) { world.remove(old.g); old.g = g; old.lv = lv; } else vehs[k] = { g, key: k, lv, lab: addLabel('map', '', new T.Vector3(), 'vlbl'), anim: null };
          vehs[k].g = g; vehs[k].lv = lv;
        }
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
        if (!o) { const tl = S.trucks[t.truck] ? S.trucks[t.truck].lvl : 0, m = MODEL('truck', ['cart', 'pickup', 'truck', 'semi'][tl], { level: tl }, () => { const q = truckModel(tl); q.scale.multiplyScalar(2.6); return q; }); world.add(m); o = truckMeshes[t.id] = { m, lab: addLabel('map', '', new T.Vector3(), 'tlbl') }; }
        const p = t.phase === 'out' ? 1 - t.left / t.total : t.left / t.total, rp = routePos(p), side = (t.truck % 2 ? 2 : -2) * (t.phase === 'out' ? 1 : -1), horiz = Math.abs(Math.cos(rp.a)) < 0.5;
        o.m.position.set(rp.x + (horiz ? 0 : side), 0.05, rp.z + (horiz ? side : 0)); o.m.rotation.y = rp.a + (t.phase === 'out' ? 0 : Math.PI);
        o.lab.pos.set(o.m.position.x, 7, o.m.position.z);
        o.lab.el.textContent = (t.ev && t.ev.id === 'broke' ? '🔧 ' : t.ev && t.ev.id === 'jam' ? '🚦 ' : '') + (t.phase === 'out' ? '📦 ' : '↩️ ') + Math.ceil(t.left / 1000) + ' с';
      }
    }

    // --- камера: вращение, перемещение, масштаб
    const cam = { tx: -150, tz: -20, yaw: 0, pitch: 0.95, dist: 90, gx: -150, gz: -20, gd: 90 };
    const keys = {};
    function applyCamera() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), dd = cam.dist * (camera.aspect < 1 ? 1 + (1 - camera.aspect) * 1.4 : 1);
      camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * dd, sp * dd, cam.tz + Math.cos(cam.yaw) * cp * dd);
      camera.lookAt(cam.tx, 0, cam.tz);
    }
    function panBy(dx, dz) { // в осях экрана (вправо, вперёд)
      const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      cam.gx = Math.max(-520, Math.min(520, cam.gx + dx * c + dz * s)); cam.gz = Math.max(-360, Math.min(420, cam.gz - dx * s + dz * c));
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
    const ptrs = new Map(); let gest = null;
    const gInfo0 = () => { const a = [...ptrs.values()]; return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, ang: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x) }; };
    const gInfo = () => { const g = gInfo0(); if (gest) { g.acc = gest.acc || 0; g.rot = gest.rot; } return g; };
    const panPx = (dx, dy) => { const dd = cam.dist * (camera.aspect < 1 ? 1 + (1 - camera.aspect) * 1.4 : 1), k = 2 * dd * Math.tan(camera.fov * Math.PI / 360) / (canvas.clientHeight || 700); panBy(-dx * k, -dy * k / Math.max(0.5, Math.sin(cam.pitch))); cam.tx = cam.gx; cam.tz = cam.gz; };
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size >= 2) { drag = null; paint = null; highlight(null); gest = gInfo(); return; }
      if (ev.button === 2 || ev.button === 1) { pan = { x: ev.clientX, y: ev.clientY, mode: ev.button === 1 || ev.shiftKey ? 'rot' : 'pan' }; return; }
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
      const S = W.S;
      if (drag) {
        if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4) drag.moved = true;
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
        else if (h && h.pen) cb.onPen();
        else { const b = pickBuilding(ev); if (b) cb.onBuilding(b); }
      } else if (paint && !paint.touch && !paint.moved && !paint.active) {
        const b = pickBuilding(ev); if (b) cb.onBuilding(b);
        else { const p = groundAt(ev), hit = p && pickFarm(p); if (hit && hit.pen) cb.onPen(); }
      }
      paint = null; lastTile = '';
    });
    canvas.addEventListener('pointercancel', (ev) => { ptrs.delete(ev.pointerId); if (!ptrs.size) { gest = null; drag = null; paint = null; highlight(null); } });
    canvas.addEventListener('pointerleave', () => { cb.onHover && cb.onHover(null); });

    // --- эффекты
    const parts = [];
    function burst(kind, x, y, z) {
      const col = { dig: 0x7a4e2b, plant: 0x7cb342, water: 0x4fc3f7, harvest: 0xffd54f, build: 0xb0bec5, fert: 0xce93d8, coin: 0xffc107, remove: 0x9e9e9e, gold: 0xffeb3b }[kind] || 0xffffff;
      for (let i = 0; i < 10; i++) { const m = new T.Mesh(G.box(), new T.MeshBasicMaterial({ color: col })); m.scale.setScalar(0.28 + Math.random() * 0.2); m.position.set(x, y, z); scene.add(m); parts.push({ m, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 2.4, vz: (Math.random() - 0.5) * 2.4, life: 0.7 }); }
    }
    function fx(kind, sfi, tx, ty, opts) { const fv = sfiView(sfi); if (!fv) return; const [x, z] = tileWorld(fv, tx, ty); burst(opts && opts.gold ? 'gold' : kind, x, 0.6, z); }
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
      const ang = tod * Math.PI * 2, day = Math.max(0, Math.min(1, 0.5 + Math.sin(ang - Math.PI / 2) * -0.5 * 1.4 + 0.15)), light = Math.max(0.06, day);
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
      syncViews(S); syncVehicles(S); syncTrips(S);
      lighting(S.clock / L.DAY_MS, S.weather.type);
      rain.visible = S.weather.type === 'rain';
      if (rain.visible) { const a = rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 22; if (y < 0) y = 50; a.setY(i, y); } a.needsUpdate = true; rain.position.set(cam.tx, 0, cam.tz); }
      for (const cl of clouds) { cl.position.x += dt * 1.6; if (cl.position.x > 520) cl.position.x = -520; }
      for (const b of Object.values(bMeshes)) b.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 1.2; });
      for (const c of cars) { const u = c.userData, len = 600, t = (W.time * 12 + u.off * 20) % len; c.position.set(u.dir > 0 ? -300 + t : 300 - t, 0.02, u.z + (u.dir > 0 ? 2 : -2)); c.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      for (const fv of views) {
        for (const a of fv.animals) {
          a.wait -= dt; if (a.wait <= 0) { const p = fv.pen; a.tx = p.x + (Math.random() - 0.5) * (p.w - 3); a.tz = p.z + (Math.random() - 0.5) * (p.d - 3); a.wait = 2 + Math.random() * 4; }
          const dx = a.tx - a.g.position.x, dz = a.tz - a.g.position.z, d = Math.hypot(dx, dz);
          if (a.key === 'bee') { a.g.position.x += Math.cos(W.time + a.ph) * dt * 1.4; a.g.position.z += Math.sin(W.time * 1.3 + a.ph) * dt * 1.4; a.g.position.y = 1.2 + Math.sin(W.time * 5 + a.ph) * 0.2; }
          else if (d > 0.1) { a.g.position.x += dx / d * dt * 1.4; a.g.position.z += dz / d * dt * 1.4; a.g.rotation.y = Math.atan2(dx, dz); a.g.position.y = Math.abs(Math.sin(W.time * 6 + a.ph)) * 0.07; } else a.g.position.y = 0;
        }
        if (fv.drone) { const a = W.time * 0.5; fv.drone.position.set(fv.cx - fv.sx + Math.cos(a) * fv.w * TS * 0.35, 6 + Math.sin(W.time * 2) * 0.3, fv.cz - fv.sz + Math.sin(a) * fv.h * TS * 0.3); fv.drone.rotation.y = -a; }
      }
      for (const k of Object.keys(vehs)) {
        const v = vehs[k]; if (v.anim) { v.anim.t += dt; const u = v.anim.t / 1.1; if (u >= 1) { v.anim = null; setVehPos(k, v.g.position.x, v.g.position.z); } else { v.g.position.x = v.anim.x + Math.sin(u * Math.PI * 2) * 6 * (1 - u * 0.2); } }
        const lv = S.up[k] || 0, cool = S.cool[k] || 0; v.lab.pos.set(v.g.position.x, 8, v.g.position.z);
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
        const far = (l.el.classList.contains('bld') ? 700 : l.el.classList.contains('penlbl') ? 170 : 150);
        if (v3.z > 1 || dist > far || (l.maxCam && cam.dist > l.maxCam)) { l.el.style.display = 'none'; continue; }
        l.el.style.display = ''; l.el.style.transform = `translate(-50%,-100%) translate(${(v3.x * 0.5 + 0.5) * r.width}px,${(-v3.y * 0.5 + 0.5) * r.height}px)`;
      }
    }
    function focusHome() { focus(-138, -24, 92); }
    function focusTown() { focus(0, 84, 150); }
    function focusFarm(id) { const s = SLOT[id]; if (s) focus(s[0] - 6, s[1] + (s[1] < 0 ? 8 : -8), 92); }
    function focusAll() { focus(0, 30, 620); }
    window.addEventListener('resize', resize);
    resize(); cam.gx = cam.tx = -138; cam.gz = cam.tz = -24; cam.gd = cam.dist = 92;
    Object.assign(W, { update, fx, highlight, resize, tileScreen, vehScreen, workAnim, focusHome, focusTown, focusFarm, focusAll, screenshot: () => canvas.toDataURL("image/png"), CITY, setVehPos, pickVehicle, pickFarm, groundAt, focus, cam });
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
  root.FarmCore = { T, mat, part, texMat, gable, bake, bakeTex, hasTex, G, geo, rgb, lerp, addProc, cropModel, animalModel, vehicleModel, truckModel, tree, house, buildingModel };
  root.World3D = { create, CITY, cropModel, animalModel };
})(typeof self !== 'undefined' ? self : this);
