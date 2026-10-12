/* 3D-мир игры «Ферма и Город»: город с дорогами и зданиями + ферма с грядками, животными и техникой.
   Только отрисовка (Three.js r128). Логика игры живёт в logic.js. */
(function (root) {
  'use strict';
  const T = root.THREE;
  const L = root.FarmLogic;

  const matCache = {};
  const mat = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); return matCache[k] || (matCache[k] = new T.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o || {}))); };
  const geoCache = {};
  const geo = (k, f) => geoCache[k] || (geoCache[k] = f());
  const G = {
    box: () => geo('box', () => new T.BoxGeometry(1, 1, 1)),
    cyl: () => geo('cyl', () => new T.CylinderGeometry(0.5, 0.5, 1, 10)),
    cone: () => geo('cone', () => new T.ConeGeometry(0.5, 1, 7)),
    sph: () => geo('sph', () => new T.SphereGeometry(0.5, 10, 8)),
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

  function tree(h) {
    const g = new T.Group(); h = h || 1;
    g.add(part('cyl', 0x6d4c2f, 0, 0.3 * h, 0, 0.22, 0.6 * h, 0.22));
    g.add(part('cone', 0x2e7d32, 0, 1.0 * h, 0, 1.0 * h, 1.1 * h, 1.0 * h)); g.add(part('cone', 0x388e3c, 0, 1.5 * h, 0, 0.75 * h, 0.9 * h, 0.75 * h));
    return g;
  }
  function house(w, d, h, wall, roof) {
    const g = new T.Group();
    g.add(part('box', wall, 0, h / 2, 0, w, h, d));
    const r = part('cone', roof, 0, h + 0.4, 0, Math.max(w, d) * 0.85, 0.9, Math.max(w, d) * 0.85); r.rotation.y = Math.PI / 4; g.add(r);
    g.add(part('box', 0x5d4037, 0, 0.35, d / 2 + 0.01, 0.4, 0.7, 0.05));
    g.add(part('box', 0xffe082, w * 0.28, h * 0.62, d / 2 + 0.01, 0.3, 0.3, 0.05));
    g.add(part('box', 0xffe082, -w * 0.28, h * 0.62, d / 2 + 0.01, 0.3, 0.3, 0.05));
    return g;
  }

  // ---------------------------------------------------------------- здания города
  function buildingModel(id) {
    const g = new T.Group();
    g.add(part('box', 0xcfd3d8, 0, 0.05, 0, 7, 0.1, 6)); // площадка
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
      case 'home': case 'valley': case 'hills': {
        const colors = { home: 0xc62828, valley: 0x1565c0, hills: 0x6a1b9a };
        const barn = new T.Group(); barn.add(part('box', colors[id], 0, 1.2, 0, 2.6, 2.4, 3)); barn.add(part('box', 0xffffff, 0, 1.0, 1.52, 1.0, 1.6, 0.05));
        const roof = part('cone', 0x5d4037, 0, 3.1, 0, 3.3, 1.5, 3.3); roof.rotation.y = Math.PI / 4; roof.scale.z = 2.6; barn.add(roof);
        barn.position.set(-1.6, 0, -1); g.add(barn);
        g.add(part('cyl', 0xb0bec5, 1.6, 1.8, -1.4, 1.1, 3.6, 1.1)); g.add(part('sph', 0x90a4ae, 1.6, 3.7, -1.4, 1.1, 0.8, 1.1));
        for (let i = 0; i < 3; i++) g.add(part('box', i % 2 ? 0x8bc34a : 0x558b2f, -0.8 + i * 1.5, 0.16, 2.0, 1.2, 0.12, 1.4));
        if (id === 'hills') g.add(part('cone', 0x78909c, 2.2, 1.6, 0.6, 2.2, 3.2, 2.2));
        break;
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- мир
  const CITY = {
    size: [46, 34],
    buildings: {
      home: { x: -16, z: -6, rot: 0 }, valley: { x: -16, z: 7, rot: 0 }, hills: { x: 16, z: 7, rot: 0 },
      market: { x: 16, z: -6, rot: 0 }, seeds: { x: -5.5, z: -6, rot: 0 }, tech: { x: 5.5, z: -6, rot: 0 },
      bank: { x: -5.5, z: 6.5, rot: Math.PI }, casino: { x: 5.5, z: 6.5, rot: Math.PI },
    },
    names: { home: '🏡 Моя ферма', valley: '🌄 Долина', hills: '⛰️ Горы', market: '🏪 Рынок', seeds: '🌱 Семена и корм', tech: '🚜 Техцентр', bank: '🏦 Банк', casino: '🎰 Колесо удачи' },
    route: [[-12.5, -6], [-12.5, 0.4], [12.5, 0.4], [12.5, -6], [13, -6]],
  };

  function create(canvas, labelBox, cb) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(); scene.background = new T.Color(0x8ecbf0); scene.fog = new T.Fog(0x8ecbf0, 60, 140);
    const camera = new T.PerspectiveCamera(42, 1, 0.5, 300);
    const hemi = new T.HemisphereLight(0xdff2ff, 0x55623a, 0.7); scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff1d0, 0.9); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 120;
    scene.add(sun); scene.add(sun.target);

    const ground = new T.Mesh(new T.PlaneGeometry(400, 400), mat(0x6fae4f)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const city = new T.Group(), farm = new T.Group(); scene.add(city); scene.add(farm);
    const W = { mode: 'city', zoom: 1, cb, renderer, scene, camera, time: 0, weather: 'sun', tod: 0.25 };

    // --- DOM-метки
    const labels = [];
    function addLabel(group, html, pos, cls, onClick) {
      const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = html; labelBox.appendChild(el);
      if (onClick) { el.style.pointerEvents = 'auto'; el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); }); }
      const o = { el, pos: pos.clone(), group }; labels.push(o); return o;
    }
    const clearLabels = (group) => { for (let i = labels.length - 1; i >= 0; i--) if (labels[i].group === group) { labels[i].el.remove(); labels.splice(i, 1); } };

    // --- город
    const bMeshes = {}, truckMeshes = {}, cars = [], clouds = [];
    (function buildCity() {
      const [cw, cd] = CITY.size;
      const road = (x, z, w, d) => { const m = part('box', 0x4a4f57, x, 0.04, z, w, 0.08, d); m.castShadow = false; city.add(m); };
      road(0, 0.4, cw, 3); road(-12.5, -1, 3, cd - 2); road(12.5, -1, 3, cd - 2); road(0, -1, 3, cd - 2);
      for (let x = -cw / 2 + 1; x < cw / 2; x += 3) { const m = part('box', 0xf5f5f5, x, 0.09, 0.4, 1.3, 0.02, 0.14); m.castShadow = false; city.add(m); }
      for (const [id, p] of Object.entries(CITY.buildings)) {
        const b = buildingModel(id); b.position.set(p.x, 0, p.z); b.rotation.y = p.rot; b.userData.id = id; city.add(b); bMeshes[id] = b;
        b.traverse((o) => { o.userData.bid = id; });
      }
      const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
      const spots = Object.values(CITY.buildings);
      for (let i = 0; i < 90; i++) {
        const x = (rng() - 0.5) * (cw + 14), z = (rng() - 0.5) * (cd + 10);
        if (Math.abs(z - 0.4) < 3.2 || Math.abs(Math.abs(x) - 12.5) < 2.6 || Math.abs(x) < 2.6 && Math.abs(z) < cd / 2) continue;
        if (spots.some((p) => Math.abs(p.x - x) < 5 && Math.abs(p.z - z) < 4.6)) continue;
        if (rng() < 0.78) { const t = tree(0.8 + rng() * 0.7); t.position.set(x, 0, z); city.add(t); }
        else { const h = house(1.6 + rng(), 1.6 + rng(), 1.3 + rng(), [0xf4d6a0, 0xe8c0c0, 0xc9e0f0, 0xe0e8b0][i % 4], [0xb23a2a, 0x37618a][i % 2]); h.position.set(x, 0, z); h.rotation.y = rng() * 6; city.add(h); }
      }
      // лампы
      for (let x = -18; x <= 18; x += 6) { for (const z of [-1.6, 2.4]) { const l = part('cyl', 0x37474f, x, 0.9, z, 0.08, 1.8, 0.08); city.add(l); city.add(part('sph', 0xfff59d, x, 1.85, z, 0.25, 0.25, 0.25, { emissive: 0x887722 })); } }
      for (let i = 0; i < 3; i++) { const c = truckModel(1 + i % 2); c.userData = { dir: i % 2 ? -1 : 1, off: i }; cars.push(c); city.add(c); }
      for (let i = 0; i < 5; i++) { const c = new T.Group(); const col = [0xef5350, 0x42a5f5, 0xffee58, 0x66bb6a, 0xab47bc][i]; c.add(part('box', col, 0, 0.3, 0, 0.55, 0.3, 1.0)); c.add(part('box', 0xcfe9ff, 0, 0.55, 0, 0.5, 0.25, 0.55)); c.userData = { dir: i % 2 ? -1 : 1, off: i * 9 + 3, car: 1 }; cars.push(c); city.add(c); }
      for (let i = 0; i < 6; i++) { const cl = new T.Group(); for (let k = 0; k < 4; k++) { const b = part('sph', 0xffffff, k * 1.1 - 1.6, 0.2 * (k % 2), 0, 2.4, 1.1, 1.6, { transparent: true, opacity: 0.92 }); b.castShadow = false; cl.add(b); } cl.position.set(-40 + i * 17, 34 + (i % 3) * 2, -20 + (i % 4) * 12); clouds.push(cl); scene.add(cl); }
    })();
    const lblCity = {};
    function layoutCityLabels(s) {
      clearLabels('city');
      for (const [id, p] of Object.entries(CITY.buildings)) {
        const fd = L.FARM_DEFS.find((d) => d.id === id);
        const locked = fd && !s.farms.some((f) => f.id === id);
        const txt = CITY.names[id] + (locked ? ` 🔒 ${fd.level} ур.` : '');
        lblCity[id] = addLabel('city', txt, new T.Vector3(p.x, 5.4, p.z), 'bld' + (locked ? ' locked' : ''), () => cb.onBuilding(id));
      }
    }

    // --- ферма
    const F = { key: '', tiles: [], w: 0, h: 0, tileGroup: new T.Group(), crops: new T.Group(), props: new T.Group(), animals: [], animalSig: '', hi: [], vehicles: [], park: {} };
    farm.add(F.tileGroup); farm.add(F.crops); farm.add(F.props);
    const hiMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
    for (let i = 0; i < 9; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.96, 0.96), hiMat.clone()); m.rotation.x = -Math.PI / 2; m.position.y = 0.2; m.visible = false; farm.add(m); F.hi.push(m); }
    const tileCol = { grass: [0x74b84f, 0x6cae49], soil: 0x7a4e2b, wet: 0x4e3320 };

    function farmKey(s) { const f = L.farm(s); return f.id + ':' + f.w + 'x' + f.h; }
    function buildFarmStatic(s) {
      const f = L.farm(s), w = f.w, h = f.h, bonus = L.farmDef(s);
      F.w = w; F.h = h; F.key = farmKey(s);
      for (const g of [F.tileGroup, F.crops, F.props]) while (g.children.length) g.remove(g.children[0]);
      F.tiles = []; clearLabels('farm'); F.animals = []; F.animalSig = ''; F.vehicles = []; F.sprSig = ''; F.extra = null; F.drone = null;
      const groundCol = f.id === 'hills' ? 0x8aa65a : f.id === 'valley' ? 0x5fb66a : 0x6fae4f;
      ground.material = mat(groundCol);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const m = part('box', tileCol.grass[(x + y) & 1], x - w / 2 + 0.5, 0.05, y - h / 2 + 0.5, 0.97, 0.1, 0.97);
        m.castShadow = false; F.tileGroup.add(m); F.tiles.push({ mesh: m, sig: '', model: null });
      }
      // забор по периметру
      const fenceC = 0xa1783f;
      for (let x = -1; x <= w; x++) for (const z of [-1, h]) { if (z === -1 && x > 0 && x < w - 1) continue; F.props.add(part('box', fenceC, x - w / 2 + 0.5, 0.3, z - h / 2 + 0.5, 0.12, 0.6, 0.12)); }
      for (let x = -1; x <= w; x += 1) { const hbar = part('box', fenceC, x - w / 2 + 0.5, 0.42, h / 2 + 0.5, 1, 0.07, 0.07); F.props.add(hbar); }
      for (let y = -1; y <= h; y++) for (const x of [-1, w]) { F.props.add(part('box', fenceC, x - w / 2 + 0.5, 0.3, y - h / 2 + 0.5, 0.12, 0.6, 0.12)); if (y < h) F.props.add(part('box', fenceC, x - w / 2 + 0.5, 0.42, y - h / 2 + 1, 0.07, 0.07, 1)); }
      // амбар и силос
      const barn = buildingModel(f.id === 'home' ? 'home' : f.id); barn.scale.setScalar(0.85); barn.position.set(-w / 2 + 1.2, 0, -h / 2 - 4.4); barn.children[0].visible = false; F.props.add(barn);
      // загон животных
      const px = w / 2 - 1.6, pz = -h / 2 - 3.8; F.pen = { x: px, z: pz, w: 6, d: 4.4 };
      F.props.add(part('box', 0x93c46d, px, 0.04, pz, F.pen.w, 0.08, F.pen.d));
      for (let i = 0; i <= 12; i++) { const fx = px - F.pen.w / 2 + i * F.pen.w / 12; F.props.add(part('box', fenceC, fx, 0.3, pz + F.pen.d / 2, 0.1, 0.6, 0.1)); F.props.add(part('box', fenceC, fx, 0.3, pz - F.pen.d / 2, 0.1, 0.6, 0.1)); }
      for (let i = 0; i <= 8; i++) { const fz = pz - F.pen.d / 2 + i * F.pen.d / 8; F.props.add(part('box', fenceC, px - F.pen.w / 2, 0.3, fz, 0.1, 0.6, 0.1)); F.props.add(part('box', fenceC, px + F.pen.w / 2, 0.3, fz, 0.1, 0.6, 0.1)); }
      F.props.add(part('box', fenceC, px, 0.42, pz + F.pen.d / 2, F.pen.w, 0.07, 0.07)); F.props.add(part('box', fenceC, px, 0.42, pz - F.pen.d / 2, F.pen.w, 0.07, 0.07));
      F.props.add(part('box', 0x6d4c2f, px + 2.4, 0.2, pz + 1.4, 1.2, 0.4, 0.5)); F.props.add(part('box', 0xc9a24a, px + 2.4, 0.42, pz + 1.4, 1.1, 0.06, 0.4));
      F.penLabel = addLabel('farm', '', new T.Vector3(px, 2.2, pz), 'penlbl', () => cb.onPen());
      // деревья вокруг
      const rng = (() => { let q = 11; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
      for (let i = 0; i < 26; i++) { const a = rng() * 6.28, r = Math.max(w, h) / 2 + 5 + rng() * 9; const t = tree(0.8 + rng() * 0.9); t.position.set(Math.cos(a) * r * 1.3, 0, Math.sin(a) * r * 0.9 + 3); if (Math.abs(t.position.x) < w / 2 + 3 && Math.abs(t.position.z) < h / 2 + 3 || t.position.z < -h / 2 - 1.5 && t.position.z > -h / 2 - 7 && t.position.x > -w / 2 && t.position.x < w / 2 + 1) continue; F.props.add(t); }
      if (f.id === 'hills') for (let i = 0; i < 6; i++) F.props.add(part('cone', 0x78909c, -w / 2 - 6 + i * 3.2, 1.6, -h / 2 - 11, 4, 4, 4));
      layoutCamera();
    }
    function tileSig(t, wet) { return t.k === 'crop' ? 'c' + t.crop + L.stage(t) + (wet ? 'w' : '') : t.k + (t.wet ? 'w' : ''); }
    function syncFarm(s) {
      if (F.key !== farmKey(s)) buildFarmStatic(s);
      const f = L.farm(s);
      for (let i = 0; i < f.tiles.length; i++) {
        const t = f.tiles[i], c = F.tiles[i], wet = t.k === 'crop' && t.water > 0;
        const sig = tileSig(t, wet);
        if (sig === c.sig) continue; c.sig = sig;
        if (c.model) { F.crops.remove(c.model); c.model = null; }
        c.mesh.material = mat(t.k === 'grass' ? tileCol.grass[(i + ((i / f.w) | 0)) & 1] : wet ? tileCol.wet : tileCol.soil);
        c.mesh.scale.y = t.k === 'grass' ? 0.1 : 0.16; c.mesh.position.y = t.k === 'grass' ? 0.05 : 0.08;
        if (t.k === 'crop') {
          const m = cropModel(t.crop, L.stage(t)); m.position.set(c.mesh.position.x, 0.16, c.mesh.position.z); m.rotation.y = (i * 1.7) % 6.28;
          if (L.CROPS[t.crop].perennial === true && L.stage(t) < 3) m.scale.setScalar(0.95);
          F.crops.add(m); c.model = m;
        }
      }
      // поливалки и пугала
      const esig = JSON.stringify(f.sprinklers) + f.scarecrows + ['tractor', 'combine', 'waterer', 'spreader', 'drone', 'collector', 'courier'].map((k) => s.up[k] || 0).join() + JSON.stringify(s.barns);
      if (F.sprSig !== esig) {
        F.sprSig = esig;
        if (F.extra) F.props.remove(F.extra);
        const ex = new T.Group();
        for (const p of f.sprinklers) { const sp = new T.Group(); sp.add(part('cyl', 0x546e7a, 0, 0.25, 0, 0.12, 0.5, 0.12)); sp.add(part('cyl', 0x29b6f6, 0, 0.55, 0, 0.35, 0.1, 0.35)); sp.position.set(p.x - f.w / 2 + 0.5, 0, p.y - f.h / 2 + 0.5); ex.add(sp); }
        for (let i = 0; i < Math.min(f.scarecrows, 4); i++) { const sc2 = new T.Group(); sc2.add(part('cyl', 0x8d6e63, 0, 0.7, 0, 0.08, 1.4, 0.08)); sc2.add(part('box', 0x8d6e63, 0, 1.0, 0, 0.9, 0.08, 0.08)); sc2.add(part('sph', 0xf3d9a4, 0, 1.5, 0, 0.3)); sc2.add(part('cone', 0xb71c1c, 0, 1.78, 0, 0.45, 0.3, 0.45)); sc2.add(part('box', 0x1976d2, 0, 0.95, 0, 0.4, 0.5, 0.18)); sc2.position.set(-f.w / 2 - 0.6 + i * 0.01, 0, -f.h / 2 + 1.5 + i * 2); ex.add(sc2); }
        const park = [['tractor', 0.8], ['combine', 2.2], ['waterer', 3.6], ['spreader', 5]];
        for (const [k, dz] of park) if (s.up[k] > 0) { const t = vehicleModel(k, s.up[k] > 5); t.position.set(f.w / 2 + 2.3, 0, -f.h / 2 + dz); t.rotation.y = 1.5 + (dz % 3) * 0.1; t.scale.setScalar(0.9 + s.up[k] * 0.03); ex.add(t); }
        // сараи: у каждого вида животных свой
        const pen = F.pen; let bi = 0; const roofs = { chicken: 0xe53935, duck: 0x1e88e5, cow: 0x6d4c41, sheep: 0x8e24aa, goat: 0xf9a825, pig: 0xec407a, bee: 0xffb300 };
        for (const k of L.ANIMAL_ORDER) if (s.barns && s.barns[k]) {
          const lv = s.barns[k], h = house(0.9, 0.9, 0.7, 0xf3e3c3, roofs[k]); h.scale.setScalar(0.75 + lv * 0.05);
          h.position.set(pen.x - pen.w / 2 + 0.7 + bi * (pen.w - 1.4) / 6, 0.05, pen.z - pen.d / 2 + 0.8); bi++; ex.add(h);
        }
        F.drone = null;
        if (s.up.drone > 0) { const d = new T.Group(); d.add(part('box', 0x37474f, 0, 0, 0, 0.5, 0.14, 0.5)); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { d.add(part('cyl', 0xb0bec5, x * 0.3, 0.1, z * 0.3, 0.3, 0.03, 0.3)); } d.add(part('sph', 0xff5252, 0, -0.1, 0.2, 0.1)); d.scale.setScalar(1.2); ex.add(d); F.drone = d; }
        if (s.up.collector > 0) { const r = new T.Group(); r.add(part('box', 0x90a4ae, 0, 0.35, 0, 0.4, 0.5, 0.3)); r.add(part('box', 0xcfd8dc, 0, 0.75, 0, 0.3, 0.26, 0.26)); r.add(part('box', 0x00e5ff, 0, 0.77, 0.14, 0.2, 0.08, 0.04, { emissive: 0x005566 })); r.position.set(pen.x - pen.w / 2 - 0.9, 0, pen.z + pen.d / 2 - 0.6); ex.add(r); }
        if (s.up.courier > 0) { const v = truckModel(1); v.position.set(pen.x + pen.w / 2 + 1.4, 0, pen.z + 0.4); v.rotation.y = 1.6; ex.add(v); }
        F.extra = ex; F.props.add(ex);
      }
      // животные
      const sig = L.ANIMAL_ORDER.map((k) => s.animals[k] || 0).join(',');
      if (sig !== F.animalSig) {
        F.animalSig = sig; for (const a of F.animals) F.props.remove(a.g); F.animals = [];
        for (const k of L.ANIMAL_ORDER) for (let i = 0; i < (s.animals[k] || 0); i++) {
          const g = animalModel(k); const p = F.pen; g.position.set(p.x + (Math.random() - 0.5) * (p.w - 1), 0.08, p.z + 0.6 + (Math.random() - 0.5) * (p.d - 2.2));
          F.props.add(g); F.animals.push({ g, key: k, tx: g.position.x, tz: g.position.z, wait: Math.random() * 3, ph: Math.random() * 6 });
        }
      }
      const pend = L.ANIMAL_ORDER.reduce((a, k) => a + ((s.prod[k] && s.prod[k].pending) || 0), 0);
      const own = L.ANIMAL_ORDER.reduce((a, k) => a + (s.animals[k] || 0), 0);
      if (F.penLabel) F.penLabel.el.innerHTML = own ? (pend ? `🧺 Собрать (${pend})` : '🐾 Животные') : '➕ Животные';
      F.penLabel && F.penLabel.el.classList.toggle('ready', pend > 0);
    }

    // --- камера
    const view = { target: new T.Vector3(), d: 30, elev: 0.95, az: 0 };
    function layoutCamera() {
      const a = camera.aspect, tan = Math.tan(camera.fov * Math.PI / 360);
      let W2, D2, tx, tz;
      if (W.mode === 'city') { W2 = a < 0.9 ? 20 : 46; D2 = a < 0.9 ? 20 : 36; tx = 0; tz = 0; view.elev = 0.92; }
      else { const fw = F.w || 8, fh = F.h || 6; W2 = fw + 5; D2 = fh + 13; tx = 0; tz = -3; view.elev = 1.0; }
      const dw = W2 / (2 * tan * a), dh = D2 * Math.sin(view.elev) / (2 * tan);
      view.d = Math.max(dw, dh) * 1.02; view.target.set(tx, 0, tz);
    }
    function applyCamera() {
      const d = view.d * W.zoom, e = view.elev;
      camera.position.set(view.target.x + view.pan.x, view.target.y + Math.sin(e) * d, view.target.z + view.pan.z + Math.cos(e) * d);
      camera.lookAt(view.target.x + view.pan.x, 0, view.target.z + view.pan.z);
    }
    view.pan = new T.Vector3();
    function resize() {
      const r = canvas.parentElement.getBoundingClientRect(); const w = Math.max(200, r.width), h = Math.max(200, r.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix(); layoutCamera();
    }

    // --- выбор мышью / пальцем
    const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), -0.16);
    function groundAt(ev) {
      const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); const p = new T.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null;
    }
    function tileFrom(ev) {
      const p = groundAt(ev); if (!p) return null;
      const x = Math.floor(p.x + F.w / 2), y = Math.floor(p.z + F.h / 2);
      if (x >= 0 && y >= 0 && x < F.w && y < F.h) return { x, y };
      return { x: -1, y: -1, pen: F.pen && Math.abs(p.x - F.pen.x) < F.pen.w / 2 && Math.abs(p.z - F.pen.z) < F.pen.d / 2 };
    }
    function buildingFrom(ev) {
      const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects(city.children, true);
      for (const h of hits) if (h.object.userData.bid) return h.object.userData.bid;
      return null;
    }
    let down = null, last = '';
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      down = { x: ev.clientX, y: ev.clientY, moved: false, id: ev.pointerId };
      if (W.mode === 'farm') { const t = tileFrom(ev); if (t && t.x >= 0) { last = t.x + ',' + t.y; cb.onTile(t.x, t.y, true); } }
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (W.mode === 'farm') {
        const t = tileFrom(ev); cb.onHover && cb.onHover(t && t.x >= 0 ? t : null);
        if (down && t && t.x >= 0 && (ev.buttons || ev.pointerType === 'touch')) { const k = t.x + ',' + t.y; if (k !== last) { last = k; cb.onTile(t.x, t.y, false); } }
      }
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) down.moved = true;
      if (down && down.moved && W.mode === 'city') {
        const r = canvas.getBoundingClientRect(), k = (2 * view.d * W.zoom * Math.tan(camera.fov * Math.PI / 360)) / r.height;
        view.pan.x = Math.max(-24, Math.min(24, view.pan.x - (ev.clientX - (down.lx == null ? down.x : down.lx)) * k));
        view.pan.z = Math.max(-18, Math.min(18, view.pan.z - (ev.clientY - (down.ly == null ? down.y : down.ly)) * k / Math.sin(view.elev)));
      }
      if (down) { down.lx = ev.clientX; down.ly = ev.clientY; }
    });
    canvas.addEventListener('pointerup', (ev) => {
      if (!down) return;
      if (!down.moved) {
        if (W.mode === 'city') { const b = buildingFrom(ev); if (b) cb.onBuilding(b); }
        else { const t = tileFrom(ev); if (t && t.pen) cb.onPen(); }
      }
      down = null; last = '';
    });
    canvas.addEventListener('pointerleave', () => { cb.onHover && cb.onHover(null); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); W.zoom = Math.min(1.5, Math.max(0.5, W.zoom * (e.deltaY > 0 ? 1.08 : 0.92))); }, { passive: false });
    const touches = new Map(); let pinch0 = 0;
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch0) W.zoom = Math.min(1.5, Math.max(0.5, W.zoom * pinch0 / d)); pinch0 = d; down = null; e.preventDefault(); }
    }, { passive: false });
    canvas.addEventListener('touchend', () => { pinch0 = 0; });

    // --- эффекты
    const parts = [];
    function burst(kind, x, y, z) {
      const col = { dig: 0x7a4e2b, plant: 0x7cb342, water: 0x4fc3f7, harvest: 0xffd54f, build: 0xb0bec5, fert: 0xce93d8, coin: 0xffc107, remove: 0x9e9e9e, gold: 0xffeb3b }[kind] || 0xffffff;
      for (let i = 0; i < 10; i++) {
        const m = new T.Mesh(G.box(), new T.MeshBasicMaterial({ color: col })); m.scale.setScalar(0.09 + Math.random() * 0.06);
        m.position.set(x, y, z); scene.add(m); parts.push({ m, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 2.4, vz: (Math.random() - 0.5) * 2.4, life: 0.7 });
      }
    }
    function fx(kind, tx, ty, opts) {
      if (W.mode !== 'farm') return;
      const x = tx - F.w / 2 + 0.5, z = ty - F.h / 2 + 0.5;
      burst(opts && opts.gold ? 'gold' : kind, x, 0.3, z);
    }
    function drive(kind, ty, dur) {
      const m = vehicleModel(kind, false); m.rotation.y = Math.PI / 2; m.scale.setScalar(1.15); farm.add(m);
      F.vehicles.push({ m, t: 0, dur: dur || 1.3, z: ty - F.h / 2 + 0.5, x0: -F.w / 2 - 2.5, x1: F.w / 2 + 2.5 });
    }
    function screenOf(wx, wy, wz) {
      const v = new T.Vector3(wx, wy, wz).project(camera); const r = canvas.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
    }
    function tileScreen(tx, ty) { return screenOf(tx - F.w / 2 + 0.5, 0.6, ty - F.h / 2 + 0.5); }

    // --- рейсы
    function routePos(prog) { // 0..1 по маршруту
      const r = CITY.route; let total = 0; const segs = [];
      for (let i = 0; i < r.length - 1; i++) { const l = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]); segs.push(l); total += l; }
      let d = Math.max(0, Math.min(1, prog)) * total;
      for (let i = 0; i < segs.length; i++) { if (d <= segs[i] || i === segs.length - 1) { const t = segs[i] ? d / segs[i] : 0; return { x: lerp(r[i][0], r[i + 1][0], t), z: lerp(r[i][1], r[i + 1][1], t), a: Math.atan2(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]) }; } d -= segs[i]; }
    }
    function syncTrips(s) {
      const ids = new Set(s.trips.map((t) => t.id));
      for (const id of Object.keys(truckMeshes)) if (!ids.has(+id)) { city.remove(truckMeshes[id].m); truckMeshes[id].lab.el.remove(); labels.splice(labels.indexOf(truckMeshes[id].lab), 1); delete truckMeshes[id]; }
      for (const t of s.trips) {
        let o = truckMeshes[t.id];
        if (!o) { const m = truckModel(s.trucks[t.truck] ? s.trucks[t.truck].lvl : 0); city.add(m); o = truckMeshes[t.id] = { m, lab: addLabel('trip', '', new T.Vector3(), 'tlbl') }; }
        const p = t.phase === 'out' ? 1 - t.left / t.total : t.left / t.total;
        const rp = routePos(p), side = (t.truck % 2 ? 0.6 : -0.6) * (t.phase === 'out' ? 1 : -1);
        o.m.position.set(rp.x + (Math.abs(Math.cos(rp.a)) > 0.5 ? 0 : side * 0.5), 0.05, rp.z + (Math.abs(Math.cos(rp.a)) > 0.5 ? side : 0));
        o.m.rotation.y = rp.a + (t.phase === 'out' ? 0 : Math.PI);
        o.lab.pos.set(o.m.position.x, 2.4, o.m.position.z);
        o.lab.el.textContent = (t.ev && t.ev.id === 'broke' ? '🔧 ' : t.ev && t.ev.id === 'jam' ? '🚦 ' : '') + (t.phase === 'out' ? '📦 ' : '↩️ ') + Math.ceil(t.left / 1000) + ' с';
      }
    }

    // --- цикл
    const rain = (() => {
      const n = 500, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 22; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const p = new T.Points(g, new T.PointsMaterial({ color: 0xaad4ff, size: 0.18, transparent: true, opacity: 0.8 })); p.visible = false; p.frustumCulled = false; scene.add(p); return p;
    })();
    const skyDay = rgb(0x8ecbf0), skyNight = rgb(0x0b1330), skyDusk = rgb(0xf0a070), skyRain = rgb(0x7a8794), skyDry = rgb(0xe8c58a);
    function lighting(tod, weather) {
      const ang = tod * Math.PI * 2; // 0.25 = полдень
      const h = Math.sin((tod - 0.0) * Math.PI * 2 - Math.PI / 2 + Math.PI / 2); // -1..1
      const day = Math.max(0, Math.min(1, 0.5 + Math.sin(ang - Math.PI / 2) * -0.5 * 1.4 + 0.15));
      const light = Math.max(0.06, day);
      const sky = skyNight.clone().lerp(skyDay, light);
      const dusk = Math.max(0, 1 - Math.abs(day - 0.45) * 5) * 0.45; sky.lerp(skyDusk, dusk);
      if (weather === 'rain') sky.lerp(skyRain, 0.6); else if (weather === 'drought') sky.lerp(skyDry, 0.45);
      scene.background.copy(sky); scene.fog.color.copy(sky);
      hemi.intensity = 0.25 + light * 0.55; sun.intensity = 0.05 + light * 0.95 * (weather === 'rain' ? 0.5 : 1);
      sun.color.set(dusk > 0.1 ? 0xffb070 : 0xfff1d0);
      sun.position.set(Math.cos(ang) * 28, 14 + Math.max(0, Math.sin(ang)) * 22, 14); sun.target.position.set(0, 0, 0);
    }

    function update(dt, s) {
      W.time += dt;
      W.weather = s.weather.type; W.tod = s.clock / L.DAY_MS;
      lighting(W.tod, W.weather);
      city.visible = W.mode === 'city'; farm.visible = W.mode === 'farm';
      rain.visible = s.weather.type === 'rain';
      if (rain.visible) { const a = rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 16; if (y < 0) y = 22; a.setY(i, y); } a.needsUpdate = true; rain.position.set(view.target.x, 0, view.target.z); }
      for (const cl of clouds) { cl.position.x += dt * 0.6; if (cl.position.x > 55) cl.position.x = -55; cl.visible = true; }
      // город
      if (W.mode === 'city') {
        for (const b of Object.values(bMeshes)) b.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 1.2; });
        for (const c of cars) { const u = c.userData, len = 44, t = ((W.time * (u.car ? 3.2 : 2.4) + u.off * 5) % len); c.position.set(u.dir > 0 ? -22 + t : 22 - t, 0.02, u.dir > 0 ? 1.15 : -0.35); c.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        syncTrips(s);
        for (const [id, el] of Object.entries(lblCity)) { const fd = L.FARM_DEFS.find((d) => d.id === id); if (fd) { const lock = !s.farms.some((f) => f.id === id); el.el.classList.toggle('locked', lock); const txt = CITY.names[id] + (lock ? ` 🔒 ${fd.level} ур.` : ''); if (el.el.textContent !== txt) el.el.textContent = txt; } }
        const notifs = { market: Object.keys(s.stall).length ? '📦' : '', seeds: '', tech: '', bank: '', casino: s.tickets > 0 ? ` 🎟️${s.tickets}` : '' };
        for (const id of Object.keys(notifs)) { const el = lblCity[id]; if (!el) continue; const txt = CITY.names[id] + notifs[id]; if (el.el.textContent !== txt) el.el.textContent = txt; }
      } else {
        syncFarm(s);
        for (const a of F.animals) {
          a.wait -= dt;
          if (a.wait <= 0) { const p = F.pen; a.tx = p.x + (Math.random() - 0.5) * (p.w - 1.2); a.tz = p.z + 0.6 + (Math.random() - 0.5) * (p.d - 2.2); a.wait = 2 + Math.random() * 4; }
          const dx = a.tx - a.g.position.x, dz = a.tz - a.g.position.z, d = Math.hypot(dx, dz);
          if (a.key === 'bee') { a.g.position.x += Math.cos(W.time + a.ph) * dt * 0.6; a.g.position.z += Math.sin(W.time * 1.3 + a.ph) * dt * 0.6; a.g.position.y = 0.4 + Math.sin(W.time * 5 + a.ph) * 0.08; }
          else if (d > 0.08) { a.g.position.x += dx / d * dt * 0.7; a.g.position.z += dz / d * dt * 0.7; a.g.rotation.y = Math.atan2(dx, dz); a.g.position.y = 0.08 + Math.abs(Math.sin(W.time * 8 + a.ph)) * 0.05; } else a.g.position.y = 0.08;
        }
        if (F.drone) { const a = W.time * 0.5; F.drone.position.set(Math.cos(a) * F.w * 0.35, 3.2 + Math.sin(W.time * 2) * 0.15, Math.sin(a) * F.h * 0.3); F.drone.rotation.y = -a; }
        for (const v of F.vehicles) { v.t += dt; const k = Math.min(1, v.t / v.dur); v.m.position.set(lerp(v.x0, v.x1, k), 0.12, v.z); }
        for (let i = F.vehicles.length - 1; i >= 0; i--) if (F.vehicles[i].t >= F.vehicles[i].dur) { farm.remove(F.vehicles[i].m); F.vehicles.splice(i, 1); }
        // колышем растения
        F.crops.children.forEach((c, i) => { c.rotation.z = Math.sin(W.time * 1.5 + i) * 0.03; });
      }
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy -= 9 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.scale.multiplyScalar(0.97); if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
      applyCamera();
      renderer.render(scene, camera);
      const r = canvas.getBoundingClientRect(); const v = new T.Vector3();
      for (const l of labels) {
        const vis = (l.group === 'city' && W.mode === 'city') || (l.group === 'farm' && W.mode === 'farm') || (l.group === 'trip' && W.mode === 'city');
        if (!vis) { l.el.style.display = 'none'; continue; }
        v.copy(l.pos).project(camera);
        if (v.z > 1) { l.el.style.display = 'none'; continue; }
        l.el.style.display = ''; l.el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * r.width}px,${(-v.y * 0.5 + 0.5) * r.height}px)`;
      }
    }

    function setMode(m, s) {
      W.mode = m; W.zoom = 1; view.pan.set(0, 0, 0);
      if (m === 'farm') { F.key = ''; syncFarm(s); }
      layoutCamera();
    }
    function highlight(cells, color) {
      F.hi.forEach((m, i) => {
        const c = cells && cells[i]; m.visible = !!c;
        if (c && F.w) { m.position.set(c[0] - F.w / 2 + 0.5, 0.22, c[1] - F.h / 2 + 0.5); m.material.color.set(color || 0xffffff); }
      });
    }
    function refreshCity(s) { layoutCityLabels(s); }
    function screenshot() { return canvas.toDataURL('image/png'); }
    window.addEventListener('resize', resize);
    Object.assign(W, { setMode, refreshCity, syncFarm, update, fx, drive, highlight, resize, tileScreen, screenshot, CITY });
    resize();
    return W;
  }

  const api = { create, CITY, cropModel, animalModel };
  root.World3D = api;
})(typeof self !== 'undefined' ? self : this);
