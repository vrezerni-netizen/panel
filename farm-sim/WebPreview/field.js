/* Логика полей для браузерного показа: построчный перенос Assets/FarmSim/Fields/Runtime (FieldCell, FieldCrops, FieldOps, FieldGrid).
   Раскладка бит та же, что в C# и в шейдере. Сетка без чанков (поле маленькое), всё остальное — как в Unity-версии. */
(function (root) {
  'use strict';
  const G = { None: 0, Grass: 1, Stubble: 2, Cultivated: 3, Plowed: 4, Seeded: 5 };
  const C = { None: 0, Wheat: 1, Barley: 2, Oat: 3, Canola: 4, Corn: 5, Sunflower: 6, Soybean: 7, Potato: 8, SugarBeet: 9 };
  const OP = { Plow: 0, Cultivate: 1, Sow: 2, Roll: 3, Fertilize: 4, Lime: 5, Weed: 6, Herbicide: 7, Harvest: 8, Mulch: 9, StonePick: 10, Irrigate: 11 };

  const get = (s, sh, b) => (s >>> sh) & ((1 << b) - 1);
  const put = (s, sh, b, v) => { const m = (((1 << b) - 1) << sh) >>> 0; return (((s & ~m) | ((v << sh) & m)) >>> 0); };
  const flag = (s, sh) => ((s >>> sh) & 1) === 1;
  const putF = (s, sh, v) => (v ? (s | (1 << sh)) >>> 0 : (s & ~(1 << sh)) >>> 0);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const Cell = {
    ground: (s) => get(s, 0, 4), withGround: (s, g) => put(s, 0, 4, g),
    angle: (s) => get(s, 4, 3), withAngle: (s, a) => put(s, 4, 3, a),
    rolled: (s) => flag(s, 7), withRolled: (s, v) => putF(s, 7, v),
    crop: (s) => get(s, 8, 5), withCrop: (s, c) => put(s, 8, 5, c),
    growth: (s) => get(s, 13, 4), withGrowth: (s, g) => put(s, 13, 4, clamp(g, 0, 15)),
    fert: (s) => get(s, 17, 2), withFert: (s, f) => put(s, 17, 2, clamp(f, 0, 3)),
    weeds: (s) => get(s, 19, 3), withWeeds: (s, w) => put(s, 19, 3, clamp(w, 0, 7)),
    lime: (s) => flag(s, 22), withLime: (s, v) => putF(s, 22, v),
    fertNow: (s) => flag(s, 23), withFertNow: (s, v) => putF(s, 23, v),
    plowNeed: (s) => get(s, 24, 2), withPlowNeed: (s, v) => put(s, 24, 2, clamp(v, 0, 3)),
    straw: (s) => flag(s, 26), withStraw: (s, v) => putF(s, 26, v),
    stones: (s) => get(s, 27, 2), withStones: (s, v) => put(s, 27, 2, clamp(v, 0, 3)),
    moisture: (s) => get(s, 29, 3), withMoisture: (s, v) => put(s, 29, 3, clamp(v, 0, 7)),
    angleFromHeading(deg) { let a = deg % 180; if (a < 0) a += 180; return Math.round(a / 22.5) % 8; },
    fresh(g) { return Cell.withMoisture(Cell.withGround(0, g), 4); },
  };

  const CROPS = {
    [C.Wheat]: { name: 'Пшеница', ready: 8, lpm2: 0.9 },
    [C.Barley]: { name: 'Ячмень', ready: 7, lpm2: 0.95 },
    [C.Oat]: { name: 'Овёс', ready: 5, lpm2: 0.75 },
    [C.Canola]: { name: 'Рапс', ready: 9, lpm2: 0.5 },
    [C.Corn]: { name: 'Кукуруза', ready: 7, lpm2: 1.1 },
    [C.Sunflower]: { name: 'Подсолнечник', ready: 8, lpm2: 0.55 },
    [C.Soybean]: { name: 'Соя', ready: 7, lpm2: 0.4 },
    [C.Potato]: { name: 'Картофель', ready: 7, lpm2: 4 },
    [C.SugarBeet]: { name: 'Сахарная свёкла', ready: 8, lpm2: 6.5 },
  };
  const cropDef = (c) => CROPS[c] || { name: '—', ready: 0, lpm2: 0 };
  function yieldFactor(s) {
    let k = 1 + 0.15 * Math.min(Cell.fert(s), 2);
    if (!Cell.lime(s)) k -= 0.15;
    if (Cell.plowNeed(s) >= 3) k -= 0.15;
    const w = Cell.weeds(s); if (w >= 1 && w <= 3) k -= 0.1; else if (w >= 4 && w <= 6) k -= 0.3;
    k -= 0.05 * Cell.stones(s); if (Cell.rolled(s)) k += 0.025; if (Cell.moisture(s) <= 1) k -= 0.2;
    return Math.max(0, k);
  }

  /** То же, что FieldOp.TryApply в C#: возвращает новое состояние или -1 (клетка не меняется). acc.yield += урожай. */
  function tryApply(op, s, cellArea, acc) {
    const g = Cell.ground(s); if (g === G.None) return -1;
    let n = s;
    switch (op.kind) {
      case OP.Plow:
        n = Cell.withGround(n, G.Plowed); n = Cell.withAngle(n, op.angle); n = Cell.withCrop(n, 0); n = Cell.withGrowth(n, 0); n = Cell.withWeeds(n, 0);
        n = Cell.withRolled(n, false); n = Cell.withPlowNeed(n, 0); n = Cell.withStraw(n, false); break;
      case OP.Cultivate:
        n = Cell.withGround(n, G.Cultivated); n = Cell.withAngle(n, op.angle); n = Cell.withCrop(n, 0); n = Cell.withGrowth(n, 0); n = Cell.withWeeds(n, 0);
        n = Cell.withRolled(n, false); n = Cell.withStraw(n, false); break;
      case OP.Sow: {
        if (!op.crop) return -1;
        const ok = g === G.Cultivated || g === G.Plowed || (op.direct && (g === G.Stubble || g === G.Grass)); if (!ok) return -1;
        n = Cell.withGround(n, G.Seeded); n = Cell.withAngle(n, op.angle); n = Cell.withCrop(n, op.crop); n = Cell.withGrowth(n, 1); n = Cell.withRolled(n, false); n = Cell.withStraw(n, false); break;
      }
      case OP.Roll:
        if (g === G.Seeded && Cell.growth(s) > 2) return -1;
        if (g !== G.Seeded && g !== G.Cultivated && g !== G.Plowed) return -1;
        n = Cell.withRolled(n, true); break;
      case OP.Fertilize:
        if (Cell.fertNow(s) || Cell.fert(s) >= 3) return -1;
        n = Cell.withFertNow(Cell.withFert(n, Cell.fert(s) + 1), true); break;
      case OP.Lime: if (Cell.lime(s)) return -1; n = Cell.withLime(n, true); break;
      case OP.Weed: { const w = Cell.weeds(s); if (w < 1 || w > 3 || (g === G.Seeded && Cell.growth(s) > 3)) return -1; n = Cell.withWeeds(n, 0); break; }
      case OP.Herbicide: { const w = Cell.weeds(s); if (w < 1 || w > 6) return -1; n = Cell.withWeeds(n, 7); break; }
      case OP.Harvest: {
        const c = Cell.crop(s); if (!c || (op.crop && c !== op.crop)) return -1;
        const d = cropDef(c), st = Cell.growth(s); if (st < d.ready) return -1;
        if (st === d.ready) acc.yield += d.lpm2 * cellArea * yieldFactor(s);
        n = Cell.withGround(n, G.Stubble); n = Cell.withCrop(n, 0); n = Cell.withGrowth(n, 0); n = Cell.withFert(n, 0); n = Cell.withFertNow(n, false);
        n = Cell.withWeeds(n, 0); n = Cell.withRolled(n, false); n = Cell.withPlowNeed(n, Cell.plowNeed(s) + 1); n = Cell.withStraw(n, true); break;
      }
      case OP.Mulch: if (!Cell.straw(s)) return -1; n = Cell.withStraw(n, false); break;
      case OP.StonePick: if (!Cell.stones(s)) return -1; n = Cell.withStones(n, 0); break;
      case OP.Irrigate: n = Cell.withMoisture(n, 7); break;
    }
    return n === s ? -1 : n;
  }

  function hash(a, b) {
    let h = (Math.imul(a, 0x9E3779B1) ^ Math.imul((b + 0x7F4A7C15) | 0, 0x85EBCA77)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15;
    return h >>> 0;
  }

  class Grid {
    constructor(ox, oz, cell, w, h) {
      this.ox = ox; this.oz = oz; this.cell = cell; this.inv = 1 / cell; this.area = cell * cell; this.w = w; this.h = h;
      this.state = new Uint32Array(w * h); this.fid = new Uint16Array(w * h);
      this.period = 0; this.weedChance = 10; this.dirty = true;
    }
    toCell(x, z) { return [Math.floor((x - this.ox) * this.inv), Math.floor((z - this.oz) * this.inv)]; }
    get(cx, cz) { return cx < 0 || cz < 0 || cx >= this.w || cz >= this.h ? 0 : this.state[cz * this.w + cx]; }
    getAt(x, z) { const [cx, cz] = this.toCell(x, z); return this.get(cx, cz); }
    addFieldRect(id, x0, z0, x1, z1, ground) {
      let n = 0; const f = Cell.fresh(ground);
      for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
        const px = this.ox + (cx + 0.5) * this.cell, pz = this.oz + (cz + 0.5) * this.cell;
        if (px < x0 || px > x1 || pz < z0 || pz > z1) continue; const i = cz * this.w + cx; if (this.fid[i]) continue;
        this.fid[i] = id; this.state[i] = f; n++;
      }
      this.dirty = true; return n;
    }
    /** Как FieldGrid.ApplyTriangles: клетка поля, чей центр внутри любого треугольника, меняется не больше одного раза. */
    applyTriangles(op, t) {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < t.length; i += 2) { minX = Math.min(minX, t[i]); maxX = Math.max(maxX, t[i]); minZ = Math.min(minZ, t[i + 1]); maxZ = Math.max(maxZ, t[i + 1]); }
      const x0 = Math.max(0, Math.floor((minX - this.ox) * this.inv)), z0 = Math.max(0, Math.floor((minZ - this.oz) * this.inv));
      const x1 = Math.min(this.w - 1, Math.floor((maxX - this.ox) * this.inv)), z1 = Math.min(this.h - 1, Math.floor((maxZ - this.oz) * this.inv));
      const res = { cells: 0, area: 0, yield: 0 };
      for (let cz = z0; cz <= z1; cz++) {
        const pz = this.oz + (cz + 0.5) * this.cell;
        for (let cx = x0; cx <= x1; cx++) {
          const i = cz * this.w + cx; if (!this.fid[i]) continue;
          const px = this.ox + (cx + 0.5) * this.cell; if (!inAny(t, px, pz)) continue;
          const n = tryApply(op, this.state[i], this.area, res); if (n < 0) continue;
          this.state[i] = n; res.cells++;
        }
      }
      res.area = res.cells * this.area; if (res.cells) this.dirty = true; return res;
    }
    applyQuad(op, ax, az, bx, bz, cx, cz, dx, dz) { return this.applyTriangles(op, [ax, az, bx, bz, cx, cz, ax, az, cx, cz, dx, dz]); }
    /** Есть ли работа для действия в прямоугольнике (для авто-челнока: пустые проходы пропускаются). */
    hasWork(op, x0, z0, x1, z1) {
      const acc = { yield: 0 }; const [a, b] = this.toCell(x0, z0), [c, d] = this.toCell(x1, z1);
      for (let cz = Math.max(0, b); cz <= Math.min(this.h - 1, d); cz++) for (let cx = Math.max(0, a); cx <= Math.min(this.w - 1, c); cx++) {
        const i = cz * this.w + cx; if (this.fid[i] && tryApply(op, this.state[i], this.area, acc) >= 0) return true;
      }
      return false;
    }
    /** Период роста целиком (в Unity — порциями по кадрам; здесь поле маленькое). */
    grow(rain) {
      this.period++;
      for (let i = 0; i < this.state.length; i++) { if (!this.fid[i]) continue; this.state[i] = this.growCell(this.state[i], hash(i, this.period), rain); }
      this.dirty = true;
    }
    growCell(s, h, rain) {
      const g = Cell.ground(s); if (g === G.None) return s;
      s = Cell.withMoisture(Cell.withFertNow(s, false), rain ? 7 : Cell.moisture(s) - 1);
      const c = Cell.crop(s);
      if (c) { const d = cropDef(c); let st = Cell.growth(s); if (st < d.ready) { if (Cell.moisture(s) > 0) st++; } s = Cell.withGrowth(s, st); }
      let w = Cell.weeds(s);
      if (w === 0) { if ((g === G.Cultivated || g === G.Plowed || g === G.Seeded) && h % 100 < this.weedChance) w = 1; }
      else if (w < 6 && Cell.moisture(s) > 0) w++;
      return Cell.withWeeds(s, w);
    }
    stats(id) {
      const st = { cells: 0, grass: 0, stubble: 0, cult: 0, plowed: 0, seeded: 0, ready: 0 };
      for (let i = 0; i < this.state.length; i++) {
        if (this.fid[i] !== id) continue; const s = this.state[i]; st.cells++;
        const g = Cell.ground(s); if (g === G.Grass) st.grass++; else if (g === G.Stubble) st.stubble++; else if (g === G.Cultivated) st.cult++; else if (g === G.Plowed) st.plowed++; else if (g === G.Seeded) st.seeded++;
        const c = Cell.crop(s); if (c && Cell.growth(s) === cropDef(c).ready) st.ready++;
      }
      return st;
    }
  }
  function inAny(t, px, pz) {
    for (let k = 0; k + 5 < t.length; k += 6) {
      const ax = t[k], az = t[k + 1], bx = t[k + 2], bz = t[k + 3], cx = t[k + 4], cz = t[k + 5];
      const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0; if (!(neg && pos)) return true;
    }
    return false;
  }

  root.FieldSim = { G, C, OP, Cell, CROPS, cropDef, yieldFactor, tryApply, Grid };
})(typeof self !== 'undefined' ? self : this);
