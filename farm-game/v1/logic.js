/* Ферма — игровая логика (без графики и без браузера: проверяется автотестами). */
(function (root) {
  'use strict';

  // Время роста — в миллисекундах. Полив даёт двойную скорость, пока «вода» не кончилась.
  const CROPS = {
    wheat: { name: 'Пшеница', icon: '🌾', growMs: 45000, seedCost: 5, sell: 12, xp: 3, level: 1 },
    carrot: { name: 'Морковь', icon: '🥕', growMs: 60000, seedCost: 8, sell: 20, xp: 4, level: 1 },
    corn: { name: 'Кукуруза', icon: '🌽', growMs: 120000, seedCost: 18, sell: 48, xp: 8, level: 2 },
    strawberry: { name: 'Клубника', icon: '🍓', growMs: 180000, seedCost: 30, sell: 80, xp: 12, level: 3 },
    pumpkin: { name: 'Тыква', icon: '🎃', growMs: 300000, seedCost: 60, sell: 170, xp: 22, level: 4 },
  };
  const CROP_ORDER = ['wheat', 'carrot', 'corn', 'strawberry', 'pumpkin'];

  const ANIMALS = {
    chicken: { name: 'Курица', icon: '🐔', product: 'egg', cost: 80, level: 3, every: 90000, cap: 4, building: 'Курятник' },
    cow: { name: 'Корова', icon: '🐄', product: 'milk', cost: 400, level: 5, every: 180000, cap: 3, building: 'Хлев' },
  };

  const GOODS = {
    wheat: { name: 'Пшеница', icon: '🌾', sell: CROPS.wheat.sell },
    carrot: { name: 'Морковь', icon: '🥕', sell: CROPS.carrot.sell },
    corn: { name: 'Кукуруза', icon: '🌽', sell: CROPS.corn.sell },
    strawberry: { name: 'Клубника', icon: '🍓', sell: CROPS.strawberry.sell },
    pumpkin: { name: 'Тыква', icon: '🎃', sell: CROPS.pumpkin.sell },
    egg: { name: 'Яйца', icon: '🥚', sell: 14 },
    milk: { name: 'Молоко', icon: '🥛', sell: 55 },
  };

  const WATER_MS = [60000, 90000, 150000, 240000];   // сколько длится полив (по уровню лейки)
  const CAN_COSTS = [0, 150, 400, 1000];
  const PLOTS = [[8, 6], [10, 7], [12, 8], [14, 9]];  // размеры участка
  const PLOT_COSTS = [0, 120, 350, 900];
  const FERT_COST = 25;
  const DAY_MS = 360000;                               // сутки в игре = 6 минут
  const OFFLINE_CAP = 8 * 3600 * 1000;                 // сколько времени «растёт» без игрока

  const xpNeeded = (level) => 40 * level * level;

  function newTiles(w, h) {
    return Array.from({ length: w * h }, () => ({ k: 'grass' }));
  }

  function createState() {
    const [w, h] = PLOTS[0];
    const s = {
      v: 1, coins: 40, xp: 0, level: 1, w, h, tiles: newTiles(w, h),
      seeds: { wheat: 6, carrot: 2 }, goods: {}, items: { fert: 1 },
      animals: { chicken: 0, cow: 0 }, prod: { chicken: { acc: 0, pending: 0 }, cow: { acc: 0, pending: 0 } },
      up: { can: 0, plot: 0 }, clock: DAY_MS * 0.25, day: 1, stats: { harvested: 0, earned: 0 },
    };
    for (let i = 0; i < 4; i++) s.tiles[(2 + Math.floor(i / 2)) * w + 2 + (i % 2)] = { k: 'soil' }; // пара вскопанных клеток для старта
    return s;
  }

  const inRange = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h;
  const tileAt = (s, x, y) => (inRange(s, x, y) ? s.tiles[y * s.w + x] : null);
  const isRipe = (t) => t && t.k === 'crop' && t.progress >= CROPS[t.crop].growMs;
  function stage(t) {
    const p = t.progress / CROPS[t.crop].growMs;
    return p >= 1 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0;
  }
  const progressOf = (t) => Math.min(1, t.progress / CROPS[t.crop].growMs);

  function addXp(s, n) {
    let up = false;
    s.xp += n;
    while (s.xp >= xpNeeded(s.level)) { s.xp -= xpNeeded(s.level); s.level++; up = true; }
    return up;
  }

  /** Проходит время dt (мс): растения растут, животные дают продукты, идёт игровое время. */
  function tick(s, dt) {
    if (dt <= 0) return;
    for (const t of s.tiles) {
      if (t.k !== 'crop' || t.progress >= CROPS[t.crop].growMs) continue;
      const wet = Math.min(dt, t.water);
      t.water -= wet;
      t.progress = Math.min(CROPS[t.crop].growMs, t.progress + dt + wet); // пока политое — растёт вдвое быстрее
    }
    for (const type of Object.keys(ANIMALS)) {
      const n = s.animals[type];
      if (!n) continue;
      const a = ANIMALS[type], p = s.prod[type], max = a.cap * 2;
      p.acc += dt * n;
      while (p.acc >= a.every) { p.acc -= a.every; if (p.pending < max) p.pending++; }
      if (p.pending >= max) p.acc = 0;
    }
    s.clock += dt;
    while (s.clock >= DAY_MS) { s.clock -= DAY_MS; s.day++; }
  }

  /** Время, пока игрок не заходил: игра «догоняет» (не больше 8 часов). */
  function catchUp(s, elapsedMs) { tick(s, Math.min(Math.max(0, elapsedMs), OFFLINE_CAP)); }

  const fail = (msg) => ({ ok: false, msg });

  /** Действие инструментом по клетке. tool: hoe | water | seed | harvest | remove | fert */
  function act(s, tool, x, y, seedKey) {
    const t = tileAt(s, x, y);
    if (!t) return fail('Тут нельзя');
    switch (tool) {
      case 'hoe':
        if (t.k !== 'grass') return fail('Тут уже вскопано');
        s.tiles[y * s.w + x] = { k: 'soil' };
        return { ok: true, fx: 'dig', levelUp: addXp(s, 1), xp: 1 };
      case 'seed': {
        const c = CROPS[seedKey];
        if (!c) return fail('Выбери семена');
        if (t.k === 'grass') return fail('Сначала вскопай землю мотыгой');
        if (t.k === 'crop') return fail('Тут уже растёт');
        if (c.level > s.level) return fail(`${c.name} с ${c.level} уровня`);
        if (!(s.seeds[seedKey] > 0)) return fail('Нет семян — купи в магазине');
        s.seeds[seedKey]--;
        s.tiles[y * s.w + x] = { k: 'crop', crop: seedKey, progress: 0, water: 0 };
        return { ok: true, fx: 'plant', levelUp: addXp(s, 2), xp: 2 };
      }
      case 'water':
        if (t.k !== 'crop') return fail('Поливать нечего');
        if (isRipe(t)) return fail('Уже созрело — собирай');
        t.water = WATER_MS[s.up.can];
        return { ok: true, fx: 'water' };
      case 'harvest': {
        if (t.k !== 'crop') return fail('Тут нечего собирать');
        if (!isRipe(t)) return fail('Ещё не созрело');
        const key = t.crop, c = CROPS[key];
        s.goods[key] = (s.goods[key] || 0) + 1;
        s.stats.harvested++;
        s.tiles[y * s.w + x] = { k: 'soil' };
        return { ok: true, fx: 'harvest', item: key, levelUp: addXp(s, c.xp), xp: c.xp };
      }
      case 'remove':
        if (t.k === 'grass') return fail('Тут и так трава');
        s.tiles[y * s.w + x] = { k: 'grass' };
        return { ok: true, fx: 'remove' };
      case 'fert': {
        if (t.k !== 'crop') return fail('Удобрение — для растений');
        if (isRipe(t)) return fail('Уже созрело');
        if (!(s.items.fert > 0)) return fail('Нет удобрения — купи в магазине');
        s.items.fert--;
        t.progress = Math.min(CROPS[t.crop].growMs, t.progress + CROPS[t.crop].growMs * 0.5);
        return { ok: true, fx: 'fert' };
      }
      default: return fail('Неизвестный инструмент');
    }
  }

  // ---- магазин ----
  function buySeeds(s, key, n) {
    const c = CROPS[key];
    if (!c) return fail('Нет такого товара');
    if (c.level > s.level) return fail(`С ${c.level} уровня`);
    n = Math.max(1, n | 0);
    const cost = c.seedCost * n;
    if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.seeds[key] = (s.seeds[key] || 0) + n;
    return { ok: true, spent: cost };
  }
  function buyFert(s, n) {
    n = Math.max(1, n | 0);
    const cost = FERT_COST * n;
    if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.items.fert = (s.items.fert || 0) + n;
    return { ok: true, spent: cost };
  }
  function sell(s, key, n) {
    const have = s.goods[key] || 0;
    if (!GOODS[key] || have <= 0) return fail('Нечего продавать');
    n = n === 'all' ? have : Math.min(have, Math.max(1, n | 0));
    const gain = GOODS[key].sell * n;
    s.goods[key] = have - n; s.coins += gain; s.stats.earned += gain;
    return { ok: true, gain, n };
  }
  function sellAll(s) {
    let gain = 0;
    for (const key of Object.keys(s.goods)) { const r = sell(s, key, 'all'); if (r.ok) gain += r.gain; }
    return gain > 0 ? { ok: true, gain } : fail('Нечего продавать');
  }
  function upgradeCost(s, kind) {
    const lvl = s.up[kind];
    const costs = kind === 'plot' ? PLOT_COSTS : CAN_COSTS;
    return lvl + 1 < costs.length ? costs[lvl + 1] : null;
  }
  function buyUpgrade(s, kind) {
    const cost = upgradeCost(s, kind);
    if (cost == null) return fail('Максимальный уровень');
    if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.up[kind]++;
    if (kind === 'plot') { // участок расширяется, прежние клетки остаются на месте
      const [w2, h2] = PLOTS[s.up.plot], t2 = newTiles(w2, h2);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) t2[y * w2 + x] = s.tiles[y * s.w + x];
      s.w = w2; s.h = h2; s.tiles = t2;
    }
    return { ok: true, spent: cost };
  }
  function buyAnimal(s, type) {
    const a = ANIMALS[type];
    if (!a) return fail('Нет такого животного');
    if (a.level > s.level) return fail(`${a.name} с ${a.level} уровня`);
    if (s.animals[type] >= a.cap) return fail('В постройке нет места');
    if (s.coins < a.cost) return fail('Не хватает монет');
    s.coins -= a.cost; s.animals[type]++;
    return { ok: true, spent: a.cost };
  }
  function collect(s, type) {
    const a = ANIMALS[type], p = s.prod[type];
    if (!a || p.pending <= 0) return fail('Пока пусто');
    const n = p.pending;
    s.goods[a.product] = (s.goods[a.product] || 0) + n;
    p.pending = 0;
    return { ok: true, item: a.product, n };
  }

  const api = {
    CROPS, CROP_ORDER, ANIMALS, GOODS, WATER_MS, CAN_COSTS, PLOTS, PLOT_COSTS, FERT_COST, DAY_MS, OFFLINE_CAP,
    xpNeeded, createState, tileAt, isRipe, stage, progressOf, tick, catchUp, act,
    buySeeds, buyFert, sell, sellAll, upgradeCost, buyUpgrade, buyAnimal, collect,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FarmLogic = api;
})(typeof self !== 'undefined' ? self : this);
