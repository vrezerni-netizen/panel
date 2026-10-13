/* Ферма и Город — игровая логика (без графики: проверяется автотестами).
   Время везде в миллисекундах. Случайность можно подменить (L.setRandom) для тестов. */
(function (root) {
  'use strict';
  let rnd = Math.random;
  const setRandom = (f) => { rnd = f || Math.random; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // ---------------------------------------------------------------- данные
  // [название, значок, уровень, рост (с), цена семян, цена продажи, опыт, многолетнее]
  const CROP_DEFS = {
    wheat:      ['Пшеница',   '🌾', 1, 30, 4, 9, 2, 0],
    carrot:     ['Морковь',   '🥕', 1, 45, 7, 16, 3, 0],
    potato:     ['Картофель', '🥔', 2, 60, 10, 24, 4, 0],
    tomato:     ['Помидор',   '🍅', 3, 90, 16, 40, 6, 0],
    corn:       ['Кукуруза',  '🌽', 4, 120, 24, 62, 8, 0],
    cucumber:   ['Огурец',    '🥒', 5, 150, 30, 80, 10, 0],
    strawberry: ['Клубника',  '🍓', 6, 180, 40, 105, 13, 1],
    cabbage:    ['Капуста',   '🥬', 7, 210, 50, 130, 16, 0],
    pumpkin:    ['Тыква',     '🎃', 8, 270, 65, 170, 20, 0],
    eggplant:   ['Баклажан',  '🍆', 10, 330, 85, 225, 26, 0],
    watermelon: ['Арбуз',     '🍉', 12, 420, 110, 300, 34, 0],
    sunflower:  ['Подсолнух', '🌻', 14, 480, 130, 360, 40, 0],
    grape:      ['Виноград',  '🍇', 16, 600, 170, 480, 52, 1],
    pineapple:  ['Ананас',    '🍍', 20, 900, 300, 900, 90, 0],
  };
  const CROPS = {}, CROP_ORDER = Object.keys(CROP_DEFS);
  for (const k of CROP_ORDER) { const d = CROP_DEFS[k]; CROPS[k] = { name: d[0], icon: d[1], level: d[2], growMs: d[3] * 1000, seedCost: d[4], sell: d[5], xp: d[6], perennial: !!d[7] }; }
  const PERENNIAL_HARVESTS = 5;

  // [название, значок, продукт, уровень, цена, период (с), вместимость, постройка]
  const ANIMAL_DEFS = {
    chicken: ['Курица', '🐔', 'egg',      2, 60,   60, 4, 'Курятник'],
    cow:     ['Корова', '🐄', 'milk',     4, 300, 120, 3, 'Хлев'],
    duck:    ['Утка',   '🦆', 'duckegg',  3, 120,  80, 4, 'Курятник'],
    sheep:   ['Овца',   '🐑', 'wool',     6, 500, 150, 4, 'Загон'],
    goat:    ['Коза',   '🐐', 'goatmilk', 8, 800, 170, 3, 'Загон'],
    pig:     ['Свинья', '🐖', 'truffle', 10, 1400, 240, 3, 'Загон'],
    bee:     ['Пчёлы',  '🐝', 'honey',   12, 2000, 200, 5, 'Пасека'],
  };
  const ANIMALS = {}, ANIMAL_ORDER = ['chicken', 'duck', 'cow', 'sheep', 'goat', 'pig', 'bee'];
  for (const k of ANIMAL_ORDER) { const d = ANIMAL_DEFS[k]; ANIMALS[k] = { name: d[0], icon: d[1], product: d[2], level: d[3], cost: d[4], every: d[5] * 1000, cap: d[6], building: d[7], feed: k === 'bee' ? 0 : 1 }; }

  const PRODUCTS = { log: ['Брёвна', '🪵', 35], plank: ['Доски', '🪚', 85], egg: ['Яйца', '🥚', 12], duckegg: ['Утиные яйца', '🦆', 20], milk: ['Молоко', '🥛', 45], wool: ['Шерсть', '🧶', 70], goatmilk: ['Козье молоко', '🧀', 95], truffle: ['Трюфели', '🍄', 220], honey: ['Мёд', '🍯', 180] };
  const GOODS = {};
  for (const k of CROP_ORDER) GOODS[k] = { name: CROPS[k].name, icon: CROPS[k].icon, sell: CROPS[k].sell };
  for (const k of Object.keys(PRODUCTS)) GOODS[k] = { name: PRODUCTS[k][0], icon: PRODUCTS[k][1], sell: PRODUCTS[k][2] };
  const GOOD_KEYS = Object.keys(GOODS);

  const TRUCKS = [ // вместимость, время в пути в одну сторону (с), цена улучшения
    { name: 'Тележка', icon: '🛒', cap: 30, trip: 90, cost: 0 },
    { name: 'Пикап', icon: '🛻', cap: 80, trip: 60, cost: 600 },
    { name: 'Грузовик', icon: '🚚', cap: 200, trip: 45, cost: 2200 },
    { name: 'Фура', icon: '🚛', cap: 500, trip: 35, cost: 7500 },
  ];
  const TRUCK_SLOTS = [{ level: 1, cost: 0 }, { level: 6, cost: 1500 }, { level: 12, cost: 6000 }];
  // ---- техника, оборудование для животных и автоматика: у каждой уровни 1..10, улучшение дорожает вдвое
  const MACH_MAX = 10;
  const MACHINES = {
    tractor:   { kind: 'field', name: 'Трактор', icon: '🚜', need: 5, base: 800, g: 1.9, cool: 25, desc: 'Пашет и сеет несколько клеток сразу' },
    combine:   { kind: 'field', name: 'Комбайн', icon: '🌾', need: 6, base: 1200, g: 1.9, cool: 30, desc: 'Собирает созревший урожай площадью' },
    waterer:   { kind: 'field', name: 'Поливочная машина', icon: '🚒', need: 7, base: 1000, g: 1.9, cool: 20, desc: 'Поливает площадь за одно нажатие' },
    spreader:  { kind: 'field', name: 'Разбрасыватель удобрений', icon: '🧂', need: 9, base: 1500, g: 2.0, cool: 35, desc: 'Удобряет площадь, тратит удобрения' },
    feeder:    { kind: 'animal', name: 'Автокормушка', icon: '🥣', need: 3, base: 500, g: 1.85, animals: null, desc: 'Все животные едят меньше корма' },
    eggline:   { kind: 'animal', name: 'Яйцелиния', icon: '🥚', need: 4, base: 600, g: 1.85, animals: ['chicken', 'duck'], desc: 'Куры и утки несут быстрее, бывают двойные яйца' },
    milker:    { kind: 'animal', name: 'Доильный аппарат', icon: '🥛', need: 6, base: 900, g: 1.85, animals: ['cow', 'goat'], desc: 'Коровы и козы дают молока быстрее' },
    shearer:   { kind: 'animal', name: 'Стригальная машина', icon: '✂️', need: 8, base: 1200, g: 1.9, animals: ['sheep'], desc: 'Овцы дают шерсть быстрее' },
    extractor: { kind: 'animal', name: 'Медогонка и трюфельный сборщик', icon: '🍯', need: 11, base: 1800, g: 1.9, animals: ['bee', 'pig'], desc: 'Пчёлы и свиньи дают мёд и трюфели быстрее' },
    logger:    { kind: 'field', name: 'Харвестер', icon: '🌲', need: 4, base: 1500, g: 1.9, cool: 30, desc: 'Валит деревья на площади сразу и даёт брёвна' },
    grinder:   { kind: 'field', name: 'Корчеватель', icon: '🪓', need: 5, base: 1100, g: 1.9, cool: 25, desc: 'Убирает пни и камни на площади, расчищает землю под поле' },
    sawmill:   { kind: 'auto', name: 'Лесопилка', icon: '🪚', need: 5, base: 1800, g: 1.9, every: 40, desc: 'Сама пилит брёвна на доски: 2 бревна дают 1 доску (опилки и топливо: 2🪙 за доску)' },
    drone:     { kind: 'auto', name: 'Дрон-сборщик', icon: '🛸', need: 7, base: 2000, g: 2.0, every: 60, desc: 'Сам собирает созревший урожай (топливо 2🪙 за грядку)' },
    collector: { kind: 'auto', name: 'Робот-сборщик', icon: '🤖', need: 5, base: 1200, g: 1.9, every: 45, desc: 'Сам собирает продукты животных (топливо 1🪙 за штуку)' },
    seeder:    { kind: 'auto', name: 'Автосеялка', icon: '🌱', need: 9, base: 2500, g: 2.0, every: 50, desc: 'Сама сеет выбранные семена на пустую землю (1🪙 за грядку)' },
    courier:   { kind: 'auto', name: 'Автокурьер', icon: '📦', need: 10, base: 3000, g: 2.0, every: 90, desc: 'Сам отправляет свободную машину на рынок, когда склад накопил груз (10🪙 за рейс)' },
  };
  const MACH_KEYS = Object.keys(MACHINES), FIELD_TOOLS = MACH_KEYS.filter((k) => MACHINES[k].kind === 'field'), AUTO_KEYS = MACH_KEYS.filter((k) => MACHINES[k].kind === 'auto');
  const AREA_W = [3, 3, 5, 5, 5, 7, 7, 7, 9, 9], AREA_R = [1, 2, 2, 3, 3, 3, 4, 4, 5, 5];
  function areaOf(lv) {
    const w = AREA_W[lv - 1], r = AREA_R[lv - 1], out = [], y0 = -Math.floor((r - 1) / 2);
    for (let j = 0; j < r; j++) for (let i = 0; i < w; i++) out.push([i - (w - 1) / 2, y0 + j]);
    return out;
  }
  const coolOf = (k, lv) => Math.round(MACHINES[k].cool * Math.pow(0.88, lv - 1));
  const autoEvery = (k, lv) => Math.round(MACHINES[k].every * Math.pow(0.82, lv - 1) * 10) / 10;
  const autoN = (k, lv) => ({ drone: lv, collector: lv * 2, seeder: lv, courier: 1, sawmill: lv * 4 }[k]);
  const speedOf = (lv) => 1 + 0.08 * lv, doubleOf = (lv) => 0.04 * lv, feedUseOf = (lv) => Math.max(0.4, 1 - 0.06 * lv);
  const plotsOf = (c, first) => ({ plots: [first || [8, 6], [10, 7], [12, 8], [14, 9]], plotCost: [0, Math.round(c * 0.15) + 120, Math.round(c * 0.45) + 350, Math.round(c * 1.1) + 900] });
  const FARM_DEFS = [  // фермы открываются с уровнем; новые участки пустые
    Object.assign({ id: 'home', name: 'Моя ферма', icon: '🏡', level: 1, cost: 0, bonus: 1 }, plotsOf(0)),
    Object.assign({ id: 'meadow', name: 'Цветочный луг', icon: '🌼', level: 3, cost: 500, bonus: 1.05 }, plotsOf(500)),
    Object.assign({ id: 'grove', name: 'Тихая роща', icon: '🌳', level: 6, cost: 2000, bonus: 1.1 }, plotsOf(2000)),
    Object.assign({ id: 'valley', name: 'Долина', icon: '🌄', level: 8, cost: 4000, bonus: 1.2 }, plotsOf(4000)),
    Object.assign({ id: 'lake', name: 'Берег озера', icon: '🏞️', level: 11, cost: 9000, bonus: 1.3 }, plotsOf(9000)),
    Object.assign({ id: 'hills', name: 'Горные террасы', icon: '⛰️', level: 16, cost: 15000, bonus: 1.4 }, plotsOf(15000, [10, 7])),
    Object.assign({ id: 'wild', name: 'Целина с лесом', icon: '🌲', level: 2, cost: 600, bonus: 1.0, wild: true }, { plots: [[22, 15], [26, 17], [30, 19], [34, 21]], plotCost: [0, 900, 2600, 6500] }),
    Object.assign({ id: 'forest', name: 'Лесной участок', icon: '🪵', level: 5, cost: 3500, bonus: 1.0, forestry: true }, { plots: [[18, 12], [22, 14], [26, 16]], plotCost: [0, 1800, 5200] }),
    Object.assign({ id: 'orchard', name: 'Королевский сад', icon: '🍎', level: 20, cost: 40000, bonus: 1.6 }, plotsOf(40000, [10, 7])),
  ];
  const WATER_MS = [60000, 90000, 150000, 240000], CAN_COSTS = [0, 150, 400, 1000];
  const BARN_CAP = [200, 500, 1200, 3000], BARN_COSTS = [0, 400, 1500, 5000];
  const STALL_CAP = [300, 800, 2000], STALL_COSTS = [0, 500, 2500];
  const GUARD_COSTS = [0, 700, 2500];            // охрана машин: меньше шансов, что отнимут груз
  const SPRINKLER = { cost: 150, need: 4, every: 20000, base: 2, perLevel: 1 };
  const SCARECROW_COST = 250, FEED_COST = 3, FEED_CAP = [100, 250, 600, 1500];
  const FERT_COST = 25;
  const SHOP_CRYSTALS = { superfert: 3, boost: 5, rush: 2 };      // цены в кристаллах
  const BOOST_MS = 5 * 60000;
  const DAY_MS = 360000, OFFLINE_CAP = 8 * 3600 * 1000;
  const MARKET_STEP = 15000, MARKET_MIN = 0.55, MARKET_MAX = 1.9;
  const WHEEL = [ // приз, шанс (вес)
    { id: 'c50', icon: '🪙', text: '50 монет', w: 22, coins: 50 },
    { id: 'c200', icon: '🪙', text: '200 монет', w: 16, coins: 200 },
    { id: 'c800', icon: '💰', text: '800 монет', w: 7, coins: 800 },
    { id: 'g1', icon: '💎', text: '1 кристалл', w: 16, gems: 1 },
    { id: 'g3', icon: '💎', text: '3 кристалла', w: 7, gems: 3 },
    { id: 't2', icon: '🎟️', text: '2 билета', w: 12, tickets: 2 },
    { id: 'f3', icon: '🧪', text: '3 удобрения', w: 10, fert: 3 },
    { id: 'sf', icon: '⚡', text: 'Суперудобрение', w: 6, superfert: 1 },
    { id: 'jp', icon: '🏆', text: 'ДЖЕКПОТ 5000', w: 1.4, coins: 5000, gems: 10 },
    { id: 'no', icon: '💨', text: 'Пусто', w: 3, none: true },
  ];

  const xpNeeded = (level) => Math.round(30 * Math.pow(level, 1.9) + 20);
  const levelGems = (level) => 2 + Math.floor(level / 5);

  // ---------------------------------------------------------------- состояние
  const newTiles = (w, h) => Array.from({ length: w * h }, () => ({ k: 'grass' }));
  const WOOD = { oak: { name: 'Дуб', logs: 4, hp: 4 }, pine: { name: 'Сосна', logs: 3, hp: 3 }, birch: { name: 'Берёза', logs: 2, hp: 3 } };
  const YOUNG_MS = 180000;
  /** Детерминированная «дикая» раскладка: деревья, камни, поляны. Не зависит от rnd, чтобы сохранения и тесты были стабильными. */
  function wildTile(def, x, y) {
    let h = (x * 374761393 + y * 668265263 + def.id.length * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const r = ((h >>> 0) % 10000) / 10000, r2 = (((h >>> 8) >>> 0) % 1000) / 1000, sp = r2 < 0.45 ? 'pine' : r2 < 0.8 ? 'oak' : 'birch';
    const clearing = def.wild && Math.sin(x * 0.5 + 1) * Math.cos(y * 0.6) > 0.8; // пара небольших полян
    if (clearing && r < 0.9) return { k: 'grass' };
    if (def.wild) return r < 0.66 ? { k: 'tree', sp, hp: WOOD[sp].hp } : r < 0.72 ? { k: 'rock', v: (h >>> 4) & 3 } : { k: 'grass' };
    return r < 0.86 ? { k: 'tree', sp, hp: WOOD[sp].hp } : r < 0.9 ? { k: 'rock', v: (h >>> 4) & 3 } : { k: 'grass' };
  }
  function fillWild(f, def, oldW, oldH) { for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (x >= oldW || y >= oldH) f.tiles[y * f.w + x] = wildTile(def, x, y); }
  const makeFarm = (def) => {
    const [w, h] = def.plots[0], f = { id: def.id, w, h, tiles: newTiles(w, h), sprinklers: [], scarecrows: 0, plot: 0 };
    if (def.wild || def.forestry) fillWild(f, def, 0, 0);
    return f;
  };

  function createState() { return migrate(newState()); }
  function newState() {
    const f = makeFarm(FARM_DEFS[0]);
    for (let i = 0; i < 4; i++) f.tiles[(2 + (i >> 1)) * f.w + 2 + (i % 2)] = { k: 'soil' };
    const m = {}; for (const k of GOOD_KEYS) m[k] = 1;
    return {
      v: 2, coins: 60, crystals: 3, tickets: 2, rep: 0, xp: 0, level: 1,
      farms: [f], cur: 0, seeds: { wheat: 6, carrot: 2 }, goods: {}, stall: {}, feed: 6,
      items: { fert: 2, superfert: 0 }, animals: {}, prod: {},
      up: { barn: 0, stall: 0, can: 0, guard: 0 }, trucks: [{ lvl: 0 }],
      cool: {}, barns: {}, auto: {}, autoSeed: null, run: {}, job: {}, runIdle: {}, runWhy: {}, runSeed: null, jobN: 0, feedDebt: 0, trips: [], orders: [], nextTripId: 1, nextOrderId: 1, orderAt: 0,
      market: { m, tr: {}, t: 0, ev: [], evAt: 60000, prop: 1 }, weather: { type: 'sun', left: 150000 }, boost: 0,
      clock: DAY_MS * 0.25, day: 1, sprAt: 0, log: [], pending: null,
      daily: { key: '' }, stats: { harvested: 0, earned: 0, trips: 0, golden: 0, spins: 0, logs: 0, built: 0 }, sites: [], nextSiteId: 1,
    };
  }
  /** Достраивает старые сохранения: новые поля, сараи для уже купленных животных. */
  function migrate(s) {
    s.barns = s.barns || {}; s.auto = s.auto || {}; s.cool = s.cool || {}; s.feedDebt = s.feedDebt || 0; if (s.autoSeed === undefined) s.autoSeed = null;
    for (const k of MACH_KEYS) if (s.up[k] == null) s.up[k] = 0;
    for (const k of FIELD_TOOLS) if (s.cool[k] == null) s.cool[k] = 0;
    for (const k of Object.keys(s.animals)) if (s.animals[k] > 0 && !s.barns[k]) s.barns[k] = 1;
    // работа техники: только по команде игрока. Старые сохранения: уже купленная автоматика продолжает работать, как раньше.
    if (!s.run) { s.run = {}; for (const k of AUTO_KEYS) if (s.up[k] > 0) s.run[k] = true; }
    s.job = s.job || {}; s.runIdle = s.runIdle || {}; s.runWhy = s.runWhy || {}; s.jobN = s.jobN || 0; if (s.runSeed === undefined) s.runSeed = null;
    s.sites = s.sites || []; s.nextSiteId = s.nextSiteId || 1; s.stats.logs = s.stats.logs || 0; s.stats.built = s.stats.built || 0; if (s.market && s.market.prop == null) s.market.prop = 1;
    return s;
  }
  const farm = (s) => s.farms[s.cur];
  const note = (s, msg, kind) => { s.log.push({ msg, kind: kind || 'info', n: (s.logN = (s.logN || 0) + 1) }); if (s.log.length > 30) s.log.shift(); };
  const farmDef = (s) => FARM_DEFS.find((d) => d.id === farm(s).id);
  const inRange = (f, x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h;
  const tileAt = (s, x, y) => { const f = farm(s); return inRange(f, x, y) ? f.tiles[y * f.w + x] : null; };
  const isRipe = (t) => !!t && t.k === 'crop' && t.progress >= CROPS[t.crop].growMs;
  const stage = (t) => { const p = t.progress / CROPS[t.crop].growMs; return p >= 1 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0; };
  const progressOf = (t) => Math.min(1, t.progress / CROPS[t.crop].growMs);
  const fail = (msg) => ({ ok: false, msg });
  const total = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const barnCap = (s) => BARN_CAP[s.up.barn], stallCap = (s) => STALL_CAP[s.up.stall], feedCap = (s) => FEED_CAP[s.up.barn];
  const repBonus = (s) => Math.min(0.3, Math.floor(s.rep / 10) / 100);
  const guardBlock = (s) => [0, 0.5, 0.85][s.up.guard];

  function addXp(s, n) {
    let up = 0; s.xp += n;
    while (s.xp >= xpNeeded(s.level)) {
      s.xp -= xpNeeded(s.level); s.level++; up++;
      s.crystals += levelGems(s.level); s.tickets += 1;
      note(s, `🎉 Уровень ${s.level}! +${levelGems(s.level)}💎 и +1🎟️`, 'good');
    }
    return up > 0;
  }

  // ---------------------------------------------------------------- рынок
  function basePrice(key) { return GOODS[key].sell; }
  function price(s, key) { return Math.max(1, Math.round(basePrice(key) * s.market.m[key] * (1 + repBonus(s)))); }
  function trendOf(s, key) { const d = s.market.tr[key] || 0; return d > 0.02 ? 1 : d < -0.02 ? -1 : 0; }
  function tickMarket(s, dt) {
    s.market.t += dt;
    while (s.market.t >= MARKET_STEP) {
      s.market.t -= MARKET_STEP;
      for (const k of GOOD_KEYS) {
        const before = s.market.m[k];
        let push = 0;
        for (const e of s.market.ev) if (e.good === k) push += (e.mult - before) * 0.35;
        const next = before + (1 - before) * 0.08 + (rnd() - 0.5) * 0.14 + push;
        s.market.m[k] = Math.min(MARKET_MAX, Math.max(MARKET_MIN, next));
        s.market.tr[k] = s.market.m[k] - before;
      }
      for (const e of s.market.ev) e.left -= MARKET_STEP;
      s.market.ev = s.market.ev.filter((e) => e.left > 0);
    }
    s.market.prop = Math.min(1.45, Math.max(0.75, (s.market.prop || 1) + ((s.market.prop || 1) < 1 ? 1 : -1) * 0.0006 * dt / 1000 + (rnd() - 0.5) * 0.0008 * dt / 15))
    s.market.evAt -= dt;
    if (s.market.evAt <= 0) {
      s.market.evAt = 90000 + rnd() * 90000;
      const key = pick(GOOD_KEYS), boom = rnd() < 0.55;
      s.market.ev.push({ good: key, mult: boom ? 1.7 : 0.55, left: 90000 });
      note(s, boom ? `📈 На рынке спрос на ${GOODS[key].icon} ${GOODS[key].name}! Цена растёт` : `📉 ${GOODS[key].icon} ${GOODS[key].name} дешевеет: завезли много`, boom ? 'good' : 'bad');
    }
  }

  // ---------------------------------------------------------------- погода
  function setWeather(s, type) {
    s.weather = { type, left: 120000 + rnd() * 120000 };
    if (type === 'rain') { for (const f of s.farms) for (const t of f.tiles) if (t.k === 'crop') t.water = Math.max(t.water, WATER_MS[s.up.can]); note(s, '🌧️ Начался дождь: все грядки политы, растения растут быстрее', 'good'); }
    else if (type === 'drought') note(s, '🌵 Засуха! Вода уходит вдвое быстрее. Поливайте чаще или поставьте поливалки', 'bad');
    else if (type === 'pests') {
      let lost = 0;
      for (const f of s.farms) for (let i = 0; i < f.tiles.length; i++) { const t = f.tiles[i]; if (isRipe(t) && rnd() < 0.28 * (f.scarecrows > 0 ? 0.3 : 1)) { f.tiles[i] = { k: 'soil' }; lost++; } }
      note(s, lost ? `🐛 Нашествие вредителей! Потеряно созревших грядок: ${lost}. Пугала помогают` : '🐛 Вредители прилетели, но урожай цел', lost ? 'bad' : 'info');
    } else note(s, '☀️ Погода наладилась', 'info');
  }
  function tickWeather(s, dt) {
    s.weather.left -= dt;
    if (s.weather.left <= 0) { const r = rnd(); setWeather(s, s.weather.type !== 'sun' ? 'sun' : r < 0.45 ? 'sun' : r < 0.7 ? 'rain' : r < 0.88 ? 'drought' : 'pests'); }
  }

  // ---------------------------------------------------------------- время
  function tick(s, dt) {
    if (dt <= 0) return;
    const gMul = (s.boost > 0 ? 2 : 1) * (s.weather.type === 'rain' ? 1.25 : 1);
    const boostUse = Math.min(dt, s.boost);
    for (const f of s.farms) {
      const bonus = FARM_DEFS.find((d) => d.id === f.id).bonus;
      for (const t of f.tiles) {
        if (t.k !== 'crop') continue;
        const c = CROPS[t.crop];
        if (t.progress >= c.growMs) continue;
        const wet = Math.min(dt, t.water);
        t.water -= wet * (s.weather.type === 'drought' ? 2 : 1); if (t.water < 0) t.water = 0;
        const boostShare = dt > 0 ? boostUse / dt : 0;
        const mul = bonus * (1 + (gMul / (s.weather.type === 'rain' ? 1.25 : 1) - 1) * boostShare) * (s.weather.type === 'rain' ? 1.25 : 1);
        t.progress = Math.min(c.growMs, t.progress + (dt + wet) * mul);
      }
    }
    for (const f of s.farms) { const d = FARM_DEFS.find((x) => x.id === f.id); if (!d || !d.forestry) continue; for (let i = 0; i < f.tiles.length; i++) { const t = f.tiles[i]; if (t.k === 'young') { t.progress += dt; if (t.progress >= YOUNG_MS) f.tiles[i] = { k: 'tree', sp: t.sp, hp: WOOD[t.sp].hp }; } } }
    s.boost = Math.max(0, s.boost - dt);
    tickSites(s, dt);
    // поливалки
    s.sprAt += dt;
    while (s.sprAt >= SPRINKLER.every) {
      s.sprAt -= SPRINKLER.every;
      for (const f of s.farms) for (const sp of f.sprinklers) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = sp.x + dx, y = sp.y + dy; if (!inRange(f, x, y)) continue;
        const t = f.tiles[y * f.w + x]; if (t.k === 'crop' && !isRipe(t)) t.water = WATER_MS[s.up.can];
      }
    }
    // животные
    for (const k of Object.keys(s.animals)) {
      const n = s.animals[k]; if (!n) continue;
      const a = ANIMALS[k], p = s.prod[k] || (s.prod[k] = { acc: 0, pending: 0 }), max = (animalCap(s, k) || a.cap) * 2;
      const mk = animalMachine(k), speed = mk ? speedOf(s.up[mk] || 0) : 1, dbl = mk ? doubleOf(s.up[mk] || 0) : 0;
      let time = dt * n * speed;
      while (time > 0) {
        const need = a.every - p.acc, step = Math.min(time, need);
        if (a.feed && s.feed <= 0) break;                      // нет корма — не доят и не собирают
        p.acc += step; time -= step;
        if (p.acc >= a.every) {
          p.acc = 0; if (a.feed) useFeed(s);
          p.pending = Math.min(max, p.pending + 1 + (dbl && rnd() < dbl ? 1 : 0));
        }
        if (p.pending >= max) { p.acc = 0; break; }
      }
    }
    tickAutos(s, dt); tickRuns(s, dt);
    // перезарядка техники
    for (const k of Object.keys(s.cool)) s.cool[k] = Math.max(0, s.cool[k] - dt);
    // доставки
    for (const tr of s.trips) {
      tr.left -= dt;
      while (tr.left <= 0 && tr.phase !== 'done') {
        const over = -tr.left;
        if (tr.phase === 'out') { arrive(s, tr); tr.phase = 'back'; tr.left = tr.backMs - over; tr.total = tr.backMs; }
        else { tr.phase = 'done'; tr.left = 0; }
      }
    }
    s.trips = s.trips.filter((t) => t.phase !== 'done');
    // рынок, погода, заказы, время
    tickMarket(s, dt); tickWeather(s, dt);
    for (const o of s.orders) o.left -= dt;
    s.orders = s.orders.filter((o) => o.left > 0);
    s.orderAt -= dt;
    if (s.orderAt <= 0 && s.orders.length < 3) { s.orderAt = 60000; newOrder(s); }
    s.clock += dt;
    while (s.clock >= DAY_MS) { s.clock -= DAY_MS; s.day++; }
  }
  const catchUp = (s, ms) => { const total = Math.min(Math.max(0, ms), OFFLINE_CAP); const step = 5000; for (let t = 0; t < total; t += step) tick(s, Math.min(step, total - t)); };

  function animalMachine(k) { return MACH_KEYS.find((m) => MACHINES[m].kind === 'animal' && MACHINES[m].animals && MACHINES[m].animals.includes(k)) || null; }
  function useFeed(s) {
    s.feedDebt = (s.feedDebt || 0) + feedUseOf(s.up.feeder || 0);
    const whole = Math.floor(s.feedDebt); s.feed = Math.max(0, s.feed - whole); s.feedDebt -= whole;
  }
  const animalCap = (s, k) => { const lv = s.barns[k] || 0; return lv ? ANIMALS[k].cap + (lv - 1) * 2 : 0; };

  // ---------------------------------------------------------------- автоматика
  const pay = (s, c) => { if (s.coins < c) return false; s.coins -= c; return true; };
  function tickAutos(s, dt) {
    for (const k of AUTO_KEYS) {
      const lv = s.up[k] || 0; if (!lv || !s.run[k]) continue; // без команды игрока автоматика стоит
      s.auto[k] = (s.auto[k] || 0) + dt; const every = autoEvery(k, lv) * 1000; let guard = 0;
      while (s.auto[k] >= every && guard++ < 40) { s.auto[k] -= every; runAuto(s, k, lv); }
    }
  }
  function runAuto(s, k, lv) {
    let n = autoN(k, lv);
    if (k === 'drone') {
      for (const f of s.farms) for (let i = 0; i < f.tiles.length && n > 0; i++) {
        if (!isRipe(f.tiles[i])) continue;
        if (!pay(s, 2)) return; const r = harvestTile(s, f, i); if (!r) { s.coins += 2; return; }
        addXp(s, r.xp); n--;
      }
    } else if (k === 'sawmill') {
      while (n >= 2 && (s.goods.log || 0) >= 2 && s.coins >= 2) { s.goods.log -= 2; n -= 2; s.coins -= 2; s.goods.plank = (s.goods.plank || 0) + 1; }
      if (!s.goods.log) delete s.goods.log;
    } else if (k === 'collector') {
      for (const key of Object.keys(s.prod)) {
        const p = s.prod[key], a = ANIMALS[key];
        while (p.pending > 0 && n > 0) {
          if (barnCap(s) - total(s.goods) < 1) return; if (!pay(s, 1)) return;
          s.goods[a.product] = (s.goods[a.product] || 0) + 1; p.pending--; n--;
        }
      }
    } else if (k === 'seeder') {
      const key = s.autoSeed; if (!key || !CROPS[key] || CROPS[key].level > s.level) return;
      for (const f of s.farms) for (let i = 0; i < f.tiles.length && n > 0; i++) {
        if (f.tiles[i].k !== 'soil') continue;
        if (!(s.seeds[key] > 0) || !pay(s, 1)) return;
        plantTile(s, f, i, key); addXp(s, 2); n--;
      }
    } else if (k === 'courier') {
      for (let i = 0; i < s.trucks.length; i++) {
        if (!truckFree(s, i)) continue;
        const cap = truckInfo(s, i).cap;
        if (total(s.goods) < Math.min(cap, Math.floor(barnCap(s) * 0.9))) return;
        const load = {}; let room = cap;
        for (const g of Object.keys(s.goods).sort((x, y) => price(s, y) - price(s, x))) { const m = Math.min(s.goods[g], room); if (m > 0) { load[g] = m; room -= m; } }
        if (!pay(s, 10)) return;
        const r = startTrip(s, i, load); if (!r.ok) { s.coins += 10; return; }
        note(s, '📦 Автокурьер отправил машину на рынок', 'info'); return;
      }
    }
  }

  // ---------------------------------------------------------------- работа техники по команде игрока
  // Без команды ничего не меняется: машина стоит, пока игрок сам не включит «Работать самой» (или не перетащит её на грядку).
  const RUN_TRAVEL_MS = 3500, RUN_IDLE_MS = 8000;
  const FUEL = { tractor: 3, combine: 4, waterer: 2, spreader: 3, logger: 5, grinder: 4 };   // монет за один выезд
  const FXQ = [];                                      // события для картинки: что машина только что сделала
  const drainFx = () => FXQ.splice(0, FXQ.length);
  const isRun = (s, k) => !!(s.run && s.run[k]);
  /** Включить или выключить автоработу. Для полевой техники on = true, farmId — на какой ферме она работает. */
  function setRun(s, k, on, farmId) {
    const d = MACHINES[k]; if (!d || d.kind === 'animal') return fail('Это оборудование работает само по себе');
    if (!(s.up[k] > 0)) return fail(`${d.name}: сначала купи в Техцентре`);
    if (!on) { delete s.run[k]; delete s.job[k]; delete s.runWhy[k]; return { ok: true, on: false }; }
    if (d.kind === 'field') {
      const id = farmId || farm(s).id; if (!s.farms.some((f) => f.id === id)) return fail('Нет такой фермы');
      s.run[k] = id; delete s.job[k]; s.runIdle[k] = 0; delete s.runWhy[k];
    } else s.run[k] = true;
    return { ok: true, on: true };
  }
  const runSeedOf = (s) => (s.runSeed && CROPS[s.runSeed] && CROPS[s.runSeed].level <= s.level && s.seeds[s.runSeed] > 0 ? s.runSeed : null);
  function runCan(s, k, d, t, seed) {
    switch (k) {
      case 'tractor': return !d.forestry && (t.k === 'grass' || (t.k === 'soil' && !!seed));
      case 'combine': return isRipe(t);
      case 'waterer': return t.k === 'crop' && !isRipe(t) && !(t.water > 0);
      case 'spreader': return t.k === 'crop' && !isRipe(t) && s.items.fert > 0;
      case 'logger': return t.k === 'tree';
      case 'grinder': return t.k === 'stump' || (t.k === 'rock' && s.up.grinder >= 2);
    }
    return false;
  }
  /** Куда машине ехать: первая по порядку грядка с работой, а центр выбираем так, чтобы площадь захватила как можно больше нужных клеток. */
  function pickRunTarget(s, k, fi) {
    const f = s.farms[fi], d = FARM_DEFS.find((x) => x.id === f.id), seed = runSeedOf(s);
    if (k === 'tractor' && d.forestry) return { why: 'в лесу не пашут' };
    if ((k === 'combine' || k === 'logger') && barnCap(s) - total(s.goods) < 1) return { why: 'склад полон: отправь товар на рынок' };
    if (k === 'spreader' && !(s.items.fert > 0)) return { why: 'нет удобрения: купи в магазине' };
    if (s.coins < FUEL[k]) return { why: `нет монет на топливо (${FUEL[k]}🪙)` };
    const can = (x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && runCan(s, k, d, f.tiles[y * f.w + x], seed), cells = areaOf(s.up[k]);
    let first = -1; for (let i = 0; i < f.tiles.length; i++) if (can(i % f.w, (i / f.w) | 0)) { first = i; break; }
    if (first < 0) return { why: { tractor: 'всё вспахано', combine: 'пока нечего собирать', waterer: 'всё полито', spreader: 'нечего удобрять', logger: 'деревьев нет', grinder: 'пней и камней нет' }[k] };
    const fx = first % f.w, fy = (first / f.w) | 0; let best = [fx, fy], bs = -1;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const cx = fx + dx, cy = fy + dy; if (cx < 0 || cy < 0 || cx >= f.w || cy >= f.h) continue;
      let sc = 0, covers = false; for (const [ax, ay] of cells) if (can(cx + ax, cy + ay)) { sc++; if (cx + ax === fx && cy + ay === fy) covers = true; }
      if (covers && sc > bs) { bs = sc; best = [cx, cy]; }
    }
    return { x: best[0], y: best[1] };
  }
  function tickRuns(s, dt) {
    for (const k of FIELD_TOOLS) {
      const id = s.run[k]; if (!id) { delete s.job[k]; continue; }
      const fi = s.farms.findIndex((f) => f.id === id);
      if (fi < 0 || !(s.up[k] > 0)) { delete s.run[k]; delete s.job[k]; continue; }
      let job = s.job[k];
      if (!job) {
        if (s.cool[k] > 0) continue;
        s.runIdle[k] = Math.max(0, (s.runIdle[k] || 0) - dt); if (s.runIdle[k] > 0) continue;
        const tg = pickRunTarget(s, k, fi);
        if (tg.why) { s.runWhy[k] = tg.why; s.runIdle[k] = RUN_IDLE_MS; continue; }
        delete s.runWhy[k]; s.job[k] = { id: ++s.jobN, farm: id, x: tg.x, y: tg.y, t: RUN_TRAVEL_MS, total: RUN_TRAVEL_MS };
        continue;
      }
      job.t -= dt; if (job.t > 0) continue;
      delete s.job[k];
      if (s.coins < FUEL[k]) { s.runWhy[k] = `нет монет на топливо (${FUEL[k]}🪙)`; s.runIdle[k] = RUN_IDLE_MS; continue; }
      const prev = s.cur; s.cur = fi; let cells, r;
      try {
        cells = areaCells(s, k, job.x, job.y).map(([cx, cy]) => { const t = f_tile(s, cx, cy); return [cx, cy, t && t.k, t && t.sp]; });
        r = act(s, k, job.x, job.y, runSeedOf(s));
      } finally { s.cur = prev; }
      if (r.ok) { s.coins -= FUEL[k]; FXQ.push({ key: k, sfi: fi, x: job.x, y: job.y, cells, r }); if (FXQ.length > 200) FXQ.shift(); }
      else { s.runWhy[k] = r.msg; s.runIdle[k] = RUN_IDLE_MS; }
    }
  }
  const f_tile = (s, x, y) => { const f = farm(s); return inRange(f, x, y) ? f.tiles[y * f.w + x] : null; };
  /** Что сейчас делает машина (для кнопок и подписи): off | move | cool | idle */
  function runStatus(s, k) {
    if (!isRun(s, k)) return { on: false, state: 'off' };
    if (MACHINES[k].kind !== 'field') return { on: true, state: 'work' };
    return { on: true, state: s.job[k] ? 'move' : s.cool[k] > 0 ? 'cool' : 'idle', why: s.runWhy[k] || '', farm: s.run[k] };
  }

  // ---------------------------------------------------------------- лес и стройка
  /** Срубить дерево: брёвна на склад, на целине остаётся пень, в лесу вырастает новое деревце. Возвращает null, если склад полон. */
  function fellTree(s, f, idx) {
    const t = f.tiles[idx], w = WOOD[t.sp], room = barnCap(s) - total(s.goods);
    if (room < 1) return null;
    const n = Math.min(room, w.logs + (rnd() < 0.2 ? 1 : 0));
    s.goods.log = (s.goods.log || 0) + n; s.stats.logs += n;
    const d = FARM_DEFS.find((x) => x.id === f.id);
    f.tiles[idx] = d && d.forestry ? { k: 'young', sp: t.sp, progress: 0 } : { k: 'stump', sp: t.sp };
    return { n, xp: 3 + w.logs };
  }
  /** Ручная распиловка: 2 бревна → 1 доска, 3🪙 за доску. */
  function sawLogs(s, planks) {
    const have = Math.floor((s.goods.log || 0) / 2); planks = Math.min(Math.max(1, planks | 0), have);
    if (planks <= 0) return fail('Нужно хотя бы 2 бревна');
    const fee = planks * 3; if (s.coins < fee) return fail(`Нужно ${fee}🪙 за работу пилы`);
    s.coins -= fee; s.goods.log -= planks * 2; if (s.goods.log <= 0) delete s.goods.log; s.goods.plank = (s.goods.plank || 0) + planks;
    return { ok: true, planks, fee };
  }
  const SITE_TYPES = {
    shed:  { name: 'Сарай', icon: '🛖', planks: 20, coins: 300, ms: 90000, price: 2700, xp: 40, level: 3 },
    house: { name: 'Дом', icon: '🏠', planks: 60, coins: 900, ms: 240000, price: 8400, xp: 150, level: 6 },
    barn:  { name: 'Амбар', icon: '🏚️', planks: 140, coins: 2500, ms: 480000, price: 22000, xp: 400, level: 11 },
  };
  const SITE_SLOTS = [{ level: 3 }, { level: 8 }, { level: 14 }];
  const siteSlots = (s) => SITE_SLOTS.filter((x) => s.level >= x.level).length;
  function startBuild(s, type) {
    const d = SITE_TYPES[type]; if (!d) return fail('Нет такой постройки');
    if (s.level < d.level) return fail(`${d.name}: с ${d.level} уровня`);
    if (s.sites.length >= siteSlots(s)) return fail(siteSlots(s) < SITE_SLOTS.length ? `Все стройплощадки заняты. Следующая откроется на ${SITE_SLOTS[siteSlots(s)].level} уровне` : 'Все стройплощадки заняты: продай готовое здание');
    if ((s.goods.plank || 0) < d.planks) return fail(`Нужно досок: ${d.planks} (есть ${s.goods.plank || 0}). Распили брёвна`);
    if (s.coins < d.coins) return fail(`Нужно ${d.coins}🪙`);
    s.goods.plank -= d.planks; if (s.goods.plank <= 0) delete s.goods.plank; s.coins -= d.coins;
    const site = { id: s.nextSiteId++, type, prog: 0, total: d.ms, done: false, slot: s.sites.length };
    s.sites.push(site); return { ok: true, site };
  }
  const siteStage = (site) => (site.done ? 4 : Math.min(3, Math.floor((site.prog / site.total) * 4)));
  function tickSites(s, dt) { for (const st of s.sites) if (!st.done) { st.prog += dt; if (st.prog >= st.total) { st.done = true; st.prog = st.total; note(s, `🏗️ ${SITE_TYPES[st.type].name} построен! Можно продавать`, 'good'); } } }
  const sitePrice = (s, site) => Math.round(SITE_TYPES[site.type].price * (s.market.prop || 1) * (1 + repBonus(s)));
  function sellSite(s, id) {
    const i = s.sites.findIndex((x) => x.id === id); if (i < 0) return fail('Стройка не найдена');
    const st = s.sites[i]; if (!st.done) return fail('Ещё строится');
    const gain = sitePrice(s, st), d = SITE_TYPES[st.type]; s.sites.splice(i, 1); s.sites.forEach((x, k) => { x.slot = k; });
    s.coins += gain; s.stats.earned += gain; s.stats.built++; s.rep += 1; return { ok: true, gain, xp: d.xp, levelUp: addXp(s, d.xp) };
  }
  function rushSite(s, id) {
    const st = s.sites.find((x) => x.id === id); if (!st || st.done) return fail('Нечего ускорять');
    const cost = Math.max(1, Math.ceil(((st.total - st.prog) / st.total) * (st.type === 'barn' ? 8 : st.type === 'house' ? 4 : 2)));
    if (s.crystals < cost) return fail(`Не хватает кристаллов: ${cost}💎`);
    s.crystals -= cost; st.prog = st.total; st.done = true; return { ok: true, cost };
  }

  // ---------------------------------------------------------------- действия на грядках
  function harvestTile(s, f, idx) {
    const t = f.tiles[idx], key = t.crop, c = CROPS[key];
    const room = barnCap(s) - total(s.goods);
    if (room < 1) return null;
    const golden = rnd() < 0.04, n = Math.min(room, golden ? 3 : 1);
    s.goods[key] = (s.goods[key] || 0) + n; s.stats.harvested++;
    let gold = false;
    if (golden) { s.tickets++; s.stats.golden++; gold = true; note(s, `✨ Золотой ${c.name}! Урожай ×3 и +1🎟️`, 'good'); }
    if (c.perennial && (t.harvests || 0) + 1 < PERENNIAL_HARVESTS) f.tiles[idx] = { k: 'crop', crop: key, progress: c.growMs * 0.35, water: 0, harvests: (t.harvests || 0) + 1 };
    else f.tiles[idx] = { k: 'soil' };
    return { key, n, gold, xp: c.xp };
  }
  function plantTile(s, f, idx, seedKey) {
    const c = CROPS[seedKey];
    f.tiles[idx] = { k: 'crop', crop: seedKey, progress: 0, water: 0 }; s.seeds[seedKey]--;
    return c;
  }
  function areaCells(s, tool, x, y) {
    const lv = s.up[tool], cells = areaOf(lv), f = farm(s);
    return cells.map(([dx, dy]) => [x + dx, y + dy]).filter(([cx, cy]) => inRange(f, cx, cy));
  }

  /** Действие по клетке. tool: hoe | seed | water | harvest | remove | fert | superfert | sprinkler | scarecrow | tractor | combine */
  function act(s, tool, x, y, seedKey) {
    const f = farm(s), t = tileAt(s, x, y);
    if (!t) return fail('Тут нельзя');
    const idx = y * f.w + x;
    switch (tool) {
      case 'axe': {
        if (t.k !== 'tree') return fail(t.k === 'young' ? 'Молодое деревце: пусть подрастёт' : t.k === 'stump' ? 'Пень не срубишь. Выкорчуй его (инструмент «Убрать»)' : 'Тут нечего рубить');
        t.hp--; if (t.hp > 0) return { ok: true, fx: 'chop', hit: true };
        const r = fellTree(s, f, idx); if (!r) return fail('Склад полон! Отвези брёвна на рынок или распили');
        return { ok: true, fx: 'fell', item: 'log', n: r.n, xp: r.xp, levelUp: addXp(s, r.xp) };
      }
      case 'hoe':
        if (farmDef(s).forestry) return fail('В лесу не пашут: тут можно рубить');
        if (t.k === 'tree') return fail('Сначала спили дерево топором 🪓');
        if (t.k === 'stump') return fail('Сначала выкорчуй пень (инструмент «Убрать»)');
        if (t.k === 'rock') return fail('Камень мешает: убери его (инструмент «Убрать»)');
        if (t.k !== 'grass') return fail('Тут уже вскопано');
        f.tiles[idx] = { k: 'soil' }; return { ok: true, fx: 'dig', xp: 1, levelUp: addXp(s, 1) };
      case 'seed': {
        const c = CROPS[seedKey];
        if (!c) return fail('Выбери семена');
        if (t.k === 'grass') return fail('Сначала вскопай землю');
        if (t.k !== 'soil') return fail('Тут уже занято');
        if (c.level > s.level) return fail(`${c.name} с ${c.level} уровня`);
        if (!(s.seeds[seedKey] > 0)) return fail('Нет семян: купи в магазине');
        plantTile(s, f, idx, seedKey); return { ok: true, fx: 'plant', xp: 2, levelUp: addXp(s, 2) };
      }
      case 'water':
        if (t.k !== 'crop') return fail('Поливать нечего');
        if (isRipe(t)) return fail('Уже созрело: собирай');
        t.water = WATER_MS[s.up.can]; return { ok: true, fx: 'water' };
      case 'harvest': {
        if (t.k !== 'crop') return fail('Тут нечего собирать');
        if (!isRipe(t)) return fail('Ещё не созрело');
        const r = harvestTile(s, f, idx);
        if (!r) return fail('Склад полон! Отправь товар на рынок');
        return { ok: true, fx: 'harvest', item: r.key, n: r.n, gold: r.gold, xp: r.xp, levelUp: addXp(s, r.xp) };
      }
      case 'remove':
        if (t.k === 'tree') return fail('Сначала спили дерево топором 🪓');
        if (t.k === 'young') return fail('Молодое деревце: пусть растёт');
        if (t.k === 'stump') { if (s.coins < 12) return fail('Корчевание пня стоит 12🪙'); s.coins -= 12; f.tiles[idx] = { k: 'grass' }; return { ok: true, fx: 'remove', xp: 2, levelUp: addXp(s, 2) }; }
        if (t.k === 'rock') { if (s.coins < 60) return fail('Убрать камень стоит 60🪙'); s.coins -= 60; f.tiles[idx] = { k: 'grass' }; return { ok: true, fx: 'remove', xp: 5, levelUp: addXp(s, 5) }; }
        if (t.k === 'grass') {
          const si = f.sprinklers.findIndex((p) => p.x === x && p.y === y);
          if (si < 0) return fail('Тут и так трава');
          f.sprinklers.splice(si, 1); return { ok: true, fx: 'remove' };
        }
        f.tiles[idx] = { k: 'grass' }; return { ok: true, fx: 'remove' };
      case 'fert': case 'superfert': {
        if (t.k !== 'crop') return fail('Удобрение для растений');
        if (isRipe(t)) return fail('Уже созрело');
        const item = tool;
        if (!(s.items[item] > 0)) return fail(item === 'fert' ? 'Нет удобрения: купи в магазине' : 'Нет суперудобрения');
        s.items[item]--;
        t.progress = item === 'fert' ? Math.min(CROPS[t.crop].growMs, t.progress + CROPS[t.crop].growMs * 0.5) : CROPS[t.crop].growMs;
        return { ok: true, fx: 'fert' };
      }
      case 'sprinkler': {
        if (s.level < SPRINKLER.need) return fail(`Поливалки с ${SPRINKLER.need} уровня`);
        if (f.sprinklers.some((p) => p.x === x && p.y === y)) return fail('Тут уже стоит поливалка');
        if (t.k === 'crop') return fail('Поставь поливалку на траву или землю без растения');
        if (f.sprinklers.length >= SPRINKLER.base + SPRINKLER.perLevel * Math.floor(s.level / 3)) return fail('Больше поливалок пока нельзя: растёт с уровнем');
        if (s.coins < SPRINKLER.cost) return fail(`Не хватает монет (${SPRINKLER.cost}🪙)`);
        s.coins -= SPRINKLER.cost; f.sprinklers.push({ x, y }); return { ok: true, fx: 'build' };
      }
      case 'tractor': case 'combine': case 'waterer': case 'spreader': case 'logger': case 'grinder': {
        const def = MACHINES[tool], lv = s.up[tool] || 0;
        if (lv < 1) return fail(`${def.name}: купи в Техцентре`);
        if (s.cool[tool] > 0) return fail(`${def.name} остывает: ещё ${Math.ceil(s.cool[tool] / 1000)} с`);
        if (tool === 'tractor' && farmDef(s).forestry) return fail('В лесу не пашут: тут работает харвестер');
        let did = 0, got = 0, xp = 0, planted = 0;
        for (const [cx, cy] of areaCells(s, tool, x, y)) {
          const i = cy * f.w + cx, tt = f.tiles[i];
          if (tool === 'tractor') {
            if (tt.k === 'grass') { f.tiles[i] = { k: 'soil' }; did++; xp += 1; }
            if (f.tiles[i].k === 'soil' && seedKey && CROPS[seedKey] && CROPS[seedKey].level <= s.level && s.seeds[seedKey] > 0) { plantTile(s, f, i, seedKey); planted++; xp += 2; }
          } else if (tool === 'logger') { if (tt.k === 'tree') { const r = fellTree(s, f, i); if (r) { got += r.n; xp += r.xp; did++; } } }
          else if (tool === 'grinder') { if (tt.k === 'stump' || (tt.k === 'rock' && lv >= 2)) { f.tiles[i] = { k: 'grass' }; xp += tt.k === 'rock' ? 4 : 2; did++; } }
          else if (tool === 'combine') { if (isRipe(tt)) { const r = harvestTile(s, f, i); if (r) { got += r.n; xp += r.xp; did++; } } }
          else if (tool === 'waterer') { if (tt.k === 'crop' && !isRipe(tt)) { tt.water = WATER_MS[s.up.can]; did++; } }
          else if (tt.k === 'crop' && !isRipe(tt) && s.items.fert > 0) { s.items.fert--; tt.progress = Math.min(CROPS[tt.crop].growMs, tt.progress + CROPS[tt.crop].growMs * 0.5); did++; }
        }
        if (!did && !planted) return fail({ tractor: 'Тут нечего пахать и сеять', combine: 'Тут нечего собирать', waterer: 'Тут нечего поливать', spreader: s.items.fert > 0 ? 'Тут нечего удобрять' : 'Нет удобрения: купи в магазине', logger: 'Тут нет деревьев', grinder: 'Тут нет пней (камни убирает корчеватель с 2 уровня)' }[tool]);
        s.cool[tool] = coolOf(tool, lv) * 1000;
        return { ok: true, fx: tool, xp, n: got, planted, levelUp: addXp(s, xp) };
      }
      default: return fail('Неизвестный инструмент');
    }
  }

  // ---------------------------------------------------------------- магазины
  function buySeeds(s, key, n) {
    const c = CROPS[key]; if (!c) return fail('Нет такого товара');
    if (c.level > s.level) return fail(`С ${c.level} уровня`);
    n = Math.max(1, n | 0); const cost = c.seedCost * n;
    if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.seeds[key] = (s.seeds[key] || 0) + n; return { ok: true, spent: cost };
  }
  function buyFeed(s, n) {
    n = Math.max(1, n | 0);
    if (s.feed + n > feedCap(s)) n = feedCap(s) - s.feed;
    if (n <= 0) return fail('Кормушка полна');
    const cost = FEED_COST * n; if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.feed += n; return { ok: true, spent: cost, n };
  }
  function buyFert(s, n) {
    n = Math.max(1, n | 0); const cost = FERT_COST * n;
    if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.items.fert += n; return { ok: true, spent: cost };
  }
  function buyScarecrow(s) {
    if (s.coins < SCARECROW_COST) return fail('Не хватает монет');
    s.coins -= SCARECROW_COST; farm(s).scarecrows++; return { ok: true, spent: SCARECROW_COST };
  }
  /** Покупки за кристаллы: superfert | boost (рост ×2 на 5 минут) */
  function buyGems(s, what, n) {
    n = Math.max(1, n | 0); const cost = SHOP_CRYSTALS[what] * n;
    if (!SHOP_CRYSTALS[what] || what === 'rush') return fail('Нет такого товара');
    if (s.crystals < cost) return fail('Не хватает кристаллов 💎');
    s.crystals -= cost;
    if (what === 'superfert') s.items.superfert += n; else s.boost = Math.max(s.boost, 0) + BOOST_MS * n;
    return { ok: true, spent: cost };
  }
  function upgradeCost(s, kind) {
    const tbl = { barn: BARN_COSTS, stall: STALL_COSTS, can: CAN_COSTS, guard: GUARD_COSTS }[kind];
    if (tbl) return s.up[kind] + 1 < tbl.length ? tbl[s.up[kind] + 1] : null;
    if (kind === 'plot') { const d = farmDef(s); return farm(s).plot + 1 < d.plotCost.length ? d.plotCost[farm(s).plot + 1] : null; }
    if (MACHINES[kind]) { const c = machineCost(s, kind); return c ? c.coins : null; }
    return null;
  }
  /** Цена следующего уровня машины: монеты растут ×1,9 за уровень, с 5-го уровня нужны ещё кристаллы, и растёт требуемый уровень игрока. */
  function machineCost(s, k) {
    const d = MACHINES[k], lv = s.up[k] || 0; if (lv >= MACH_MAX) return null;
    return { coins: Math.round(d.base * Math.pow(d.g, lv)), gems: lv >= 4 ? (lv - 3) * 2 : 0, need: d.need + lv * 2 };
  }
  function buyMachine(s, k) {
    const d = MACHINES[k], c = machineCost(s, k); if (!c) return fail('Максимальный уровень');
    if (s.level < c.need) return fail(`${d.name}: нужен ${c.need} уровень`);
    if (s.coins < c.coins) return fail('Не хватает монет');
    if (s.crystals < c.gems) return fail('Не хватает кристаллов 💎');
    s.coins -= c.coins; s.crystals -= c.gems; s.up[k] = (s.up[k] || 0) + 1; return { ok: true, spent: c.coins };
  }
  /** Сарай для каждого вида животных: без него животных не купить, уровень сарая даёт места. */
  function barnCost(s, k) {
    const a = ANIMALS[k], lv = s.barns[k] || 0; if (lv >= MACH_MAX) return null;
    return { coins: Math.round(a.cost * 3 * Math.pow(1.7, lv)), gems: lv >= 5 ? (lv - 4) * 2 : 0, need: a.level + lv };
  }
  function buyBarn(s, k) {
    const c = ANIMALS[k] && barnCost(s, k); if (!c) return fail('Максимальный уровень сарая');
    if (s.level < c.need) return fail(`Нужен ${c.need} уровень`);
    if (s.coins < c.coins) return fail('Не хватает монет');
    if (s.crystals < c.gems) return fail('Не хватает кристаллов 💎');
    s.coins -= c.coins; s.crystals -= c.gems; s.barns[k] = (s.barns[k] || 0) + 1; return { ok: true, spent: c.coins };
  }
  function buyUpgrade(s, kind) {
    if (MACHINES[kind]) return buyMachine(s, kind);
    const cost = upgradeCost(s, kind);
    if (cost == null) return fail('Максимальный уровень');
    if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost;
    if (kind === 'plot') {
      const f = farm(s); f.plot++; const [w2, h2] = farmDef(s).plots[f.plot], t2 = newTiles(w2, h2);
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) t2[y * w2 + x] = f.tiles[y * f.w + x];
      const ow = f.w, oh = f.h; f.w = w2; f.h = h2; f.tiles = t2; { const dd = farmDef(s); if (dd.wild || dd.forestry) fillWild(f, dd, ow, oh); }
    } else s.up[kind]++;
    return { ok: true, spent: cost };
  }
  function buyAnimal(s, key) {
    const a = ANIMALS[key]; if (!a) return fail('Нет такого животного');
    if (a.level > s.level) return fail(`${a.name} с ${a.level} уровня`);
    if (!s.barns[key]) return fail(`Сначала построй сарай: ${a.building}`);
    if ((s.animals[key] || 0) >= animalCap(s, key)) return fail('В сарае нет места: улучши сарай');
    if (s.coins < a.cost) return fail('Не хватает монет');
    s.coins -= a.cost; s.animals[key] = (s.animals[key] || 0) + 1; if (!s.prod[key]) s.prod[key] = { acc: 0, pending: 0 };
    return { ok: true, spent: a.cost };
  }
  function collect(s, key) {
    const a = ANIMALS[key], p = s.prod[key];
    if (!a || !p || p.pending <= 0) return fail('Пока пусто');
    const room = barnCap(s) - total(s.goods); if (room < 1) return fail('Склад полон! Отправь товар на рынок');
    const n = Math.min(p.pending, room); s.goods[a.product] = (s.goods[a.product] || 0) + n; p.pending -= n;
    return { ok: true, item: a.product, n };
  }
  function unlockFarm(s, id) {
    const d = FARM_DEFS.find((x) => x.id === id);
    if (!d || s.farms.some((f) => f.id === id)) return fail('Уже куплено');
    if (d.level > s.level) return fail(`С ${d.level} уровня`);
    if (s.coins < d.cost) return fail('Не хватает монет');
    s.coins -= d.cost; s.farms.push(makeFarm(d)); s.cur = s.farms.length - 1; return { ok: true, spent: d.cost };
  }
  function setFarm(s, i) { if (i < 0 || i >= s.farms.length) return fail('Нет такой фермы'); s.cur = i; return { ok: true }; }

  // ---------------------------------------------------------------- транспорт и рынок
  function truckInfo(s, i) { return TRUCKS[s.trucks[i].lvl]; }
  function upgradeTruck(s, i) {
    const tr = s.trucks[i]; if (!tr) return fail('Нет такой машины');
    if (s.trips.some((t) => t.truck === i)) return fail('Машина в рейсе');
    const next = TRUCKS[tr.lvl + 1]; if (!next) return fail('Максимальный уровень');
    if (s.coins < next.cost) return fail('Не хватает монет');
    s.coins -= next.cost; tr.lvl++; return { ok: true, spent: next.cost };
  }
  function buyTruckSlot(s) {
    const slot = TRUCK_SLOTS[s.trucks.length]; if (!slot) return fail('Это максимум машин');
    if (slot.level > s.level) return fail(`Вторая и третья машины с ${TRUCK_SLOTS[1].level} и ${TRUCK_SLOTS[2].level} уровня`);
    if (s.coins < slot.cost) return fail('Не хватает монет');
    s.coins -= slot.cost; s.trucks.push({ lvl: 0 }); return { ok: true, spent: slot.cost };
  }
  const truckFree = (s, i) => !s.trips.some((t) => t.truck === i);
  function loadValue(s, items) { let v = 0; for (const k of Object.keys(items)) v += price(s, k) * items[k]; return v; }
  /** Отправить машину i на рынок с грузом items {товар: штук}. */
  function startTrip(s, i, items) {
    if (!s.trucks[i]) return fail('Нет такой машины');
    const info = truckInfo(s, i);
    if (!truckFree(s, i)) return fail('Машина уже в рейсе');
    let count = 0; const load = {};
    for (const k of Object.keys(items)) { const n = Math.min(items[k] | 0, s.goods[k] || 0); if (n > 0) { load[k] = n; count += n; } }
    if (count <= 0) return fail('Выбери, что везти');
    if (count > info.cap) return fail(`Не влезает: ${info.name} возит до ${info.cap}`);
    if (total(s.stall) + count > stallCap(s)) return fail('На рынке не хватит места на прилавке: продай накопленное');
    for (const k of Object.keys(load)) { s.goods[k] -= load[k]; if (s.goods[k] <= 0) delete s.goods[k]; }
    // события в дороге
    const r = rnd(); let ev = null, outMs = info.trip * 1000;
    if (r < 0.15) { ev = { id: 'jam', text: '🚦 Пробка на дороге' }; outMs *= 1.3; }
    else if (r < 0.23) { ev = { id: 'broke', text: '🔧 Поломка в пути', repair: Math.round(40 + rnd() * 110) }; outMs *= 1.5; }
    else if (r < 0.29) { ev = { id: 'bandits', text: '🥷 Напали разбойники!', lose: 0.2 + rnd() * 0.2 }; }
    else if (r < 0.37) { ev = { id: 'lucky', text: '🍀 Удачный рейс: покупатель дал чаевые' }; }
    const tr = { id: s.nextTripId++, truck: i, items: load, count, phase: 'out', left: outMs, total: outMs, backMs: info.trip * 1000, ev };
    s.trips.push(tr); s.stats.trips++;
    return { ok: true, trip: tr };
  }
  function arrive(s, tr) {
    let lost = 0;
    if (tr.ev) {
      if (tr.ev.id === 'bandits') {
        const keep = guardBlock(s) > rnd() ? 0 : tr.ev.lose;   // охрана может отбить нападение
        if (keep > 0) for (const k of Object.keys(tr.items)) { const l = Math.floor(tr.items[k] * keep); tr.items[k] -= l; lost += l; }
        note(s, keep > 0 ? `🥷 Разбойники отняли ${lost} шт. груза! Нанять охрану можно в Техцентре` : '🛡️ Охрана отбила нападение разбойников!', keep > 0 ? 'bad' : 'good');
      } else if (tr.ev.id === 'broke') { const pay = Math.min(s.coins, tr.ev.repair); s.coins -= pay; note(s, `🔧 Поломка в пути: ремонт ${pay}🪙`, 'bad'); }
      else if (tr.ev.id === 'lucky') { s.tickets++; s.crystals += rnd() < 0.3 ? 1 : 0; note(s, '🍀 Чаевые: +1🎟️', 'good'); }
      else note(s, tr.ev.text, 'info');
    }
    for (const k of Object.keys(tr.items)) if (tr.items[k] > 0) s.stall[k] = (s.stall[k] || 0) + tr.items[k];
    tr.arrived = true; note(s, `${TRUCKS[s.trucks[tr.truck].lvl].icon} Машина привезла товар на рынок: продавай на прилавке`, 'good');
  }
  function sellStall(s, key, n) {
    const have = s.stall[key] || 0; if (have <= 0) return fail('Нечего продавать');
    n = n === 'all' ? have : Math.min(have, Math.max(1, n | 0));
    const gain = price(s, key) * n; s.stall[key] = have - n; if (s.stall[key] <= 0) delete s.stall[key];
    s.coins += gain; s.stats.earned += gain; s.rep += 0; return { ok: true, gain, n };
  }
  function sellAllStall(s) {
    let gain = 0; for (const k of Object.keys(s.stall)) { const r = sellStall(s, k, 'all'); if (r.ok) gain += r.gain; }
    return gain > 0 ? { ok: true, gain } : fail('На прилавке пусто');
  }
  /** Срочно вернуть машину за кристаллы. */
  function rushTrip(s, id) {
    const tr = s.trips.find((t) => t.id === id); if (!tr) return fail('Рейс не найден');
    if (s.crystals < SHOP_CRYSTALS.rush) return fail('Не хватает кристаллов 💎');
    s.crystals -= SHOP_CRYSTALS.rush; tick(s, tr.left + 1); return { ok: true };
  }

  // ---------------------------------------------------------------- заказы (контракты)
  function newOrder(s) {
    const avail = CROP_ORDER.filter((k) => CROPS[k].level <= s.level);
    const prods = Object.keys(s.animals).filter((k) => s.animals[k] > 0).map((k) => ANIMALS[k].product);
    const good = pick(avail.concat(prods)), qty = 3 + Math.floor(rnd() * 8) + Math.floor(s.level / 3);
    const base = basePrice(good) * qty, big = rnd() < 0.2;
    const o = { id: s.nextOrderId++, good, qty, reward: Math.round(base * (big ? 2.6 : 1.7) * (0.9 + rnd() * 0.3)), xp: Math.round(base / 12) + 4, rep: big ? 5 : 2, gems: big ? 1 + Math.floor(rnd() * 2) : 0, left: (big ? 8 : 6) * 60000, big };
    s.orders.push(o); note(s, `📜 Новый заказ: ${qty} × ${GOODS[good].icon} ${GOODS[good].name}`, 'info');
  }
  function fulfillOrder(s, id) {
    const o = s.orders.find((x) => x.id === id); if (!o) return fail('Заказ уже пропал');
    if ((s.stall[o.good] || 0) < o.qty) return fail(`На прилавке нужно ${o.qty} шт.: привези товар на рынок`);
    s.stall[o.good] -= o.qty; if (s.stall[o.good] <= 0) delete s.stall[o.good];
    s.coins += o.reward; s.rep += o.rep; s.crystals += o.gems; s.stats.earned += o.reward;
    s.orders = s.orders.filter((x) => x.id !== id);
    return { ok: true, levelUp: addXp(s, o.xp), reward: o.reward, rep: o.rep, gems: o.gems, xp: o.xp };
  }

  // ---------------------------------------------------------------- банк, бонусы, колесо
  const EXCHANGE = { gemCoins: 120, coinsForGem: 650 };     // 1💎 = 120🪙 при продаже; купить 1💎 стоит 650🪙
  function exchange(s, dir, n) {
    n = Math.max(1, n | 0);
    if (dir === 'g2c') { if (s.crystals < n) return fail('Не хватает кристаллов'); s.crystals -= n; s.coins += n * EXCHANGE.gemCoins; return { ok: true, gain: n * EXCHANGE.gemCoins }; }
    const cost = n * EXCHANGE.coinsForGem; if (s.coins < cost) return fail('Не хватает монет');
    s.coins -= cost; s.crystals += n; return { ok: true, spent: cost };
  }
  function claimDaily(s, key) {
    if (s.daily.key === key) return fail('Подарок на сегодня уже получен');
    s.daily.key = key; const gems = 2 + Math.floor(s.level / 6), coins = 100 + s.level * 40;
    s.coins += coins; s.crystals += gems; s.tickets += 2; return { ok: true, coins, gems, tickets: 2 };
  }
  function spin(s) {
    if (s.pending) return fail('Сначала реши, что делать с призом');
    if (s.tickets < 1) return fail('Нет билетов 🎟️');
    s.tickets--; s.stats.spins++;
    let r = rnd() * WHEEL.reduce((a, b) => a + b.w, 0), prize = WHEEL[0];
    for (const p of WHEEL) { r -= p.w; if (r <= 0) { prize = p; break; } }
    if (prize.coins && prize.coins < 5000) { s.pending = { id: prize.id, coins: prize.coins }; return { ok: true, prize, gamble: true }; }
    giveBack(s, prize); return { ok: true, prize, gamble: false };
  }
  function giveBack(s, p) {
    if (p.coins) s.coins += p.coins; if (p.gems) s.crystals += p.gems; if (p.tickets) s.tickets += p.tickets;
    if (p.fert) s.items.fert += p.fert; if (p.superfert) s.items.superfert += p.superfert;
  }
  /** После выигрыша монет: забрать или рискнуть (шанс 45%: приз ×2, иначе 0). */
  function resolvePrize(s, risk) {
    if (!s.pending) return fail('Нечего решать');
    const base = s.pending.coins; s.pending = null;
    if (!risk) { s.coins += base; return { ok: true, won: base }; }
    if (rnd() < 0.45) { s.coins += base * 2; return { ok: true, won: base * 2, doubled: true }; }
    return { ok: true, won: 0, lost: true };
  }

  const api = {
    CROPS, CROP_ORDER, ANIMALS, ANIMAL_ORDER, PRODUCTS, GOODS, GOOD_KEYS, TRUCKS, TRUCK_SLOTS, MACHINES, MACH_MAX, MACH_KEYS, FIELD_TOOLS, AUTO_KEYS, FARM_DEFS, WATER_MS, CAN_COSTS,
    BARN_CAP, BARN_COSTS, STALL_CAP, STALL_COSTS, GUARD_COSTS, SPRINKLER, SCARECROW_COST, FEED_COST, FERT_COST, SHOP_CRYSTALS, BOOST_MS,
    DAY_MS, OFFLINE_CAP, WHEEL, EXCHANGE, PERENNIAL_HARVESTS,
    makeFarm, WOOD, SITE_TYPES, SITE_SLOTS, siteSlots, siteStage, sitePrice, startBuild, sellSite, rushSite, sawLogs, fellTree, YOUNG_MS,
    machineCost, buyMachine, barnCost, buyBarn, animalCap, animalMachine, areaOf, coolOf, autoEvery, autoN, speedOf, doubleOf, feedUseOf, migrate,
    setRun, isRun, runStatus, drainFx, pickRunTarget, FUEL, RUN_TRAVEL_MS, RUN_IDLE_MS, runSeedOf,
    setRandom, xpNeeded, levelGems, createState, farm, farmDef, tileAt, isRipe, stage, progressOf, tick, catchUp, act, areaCells,
    buySeeds, buyFeed, buyFert, buyScarecrow, buyGems, upgradeCost, buyUpgrade, buyAnimal, collect, unlockFarm, setFarm,
    truckInfo, upgradeTruck, buyTruckSlot, truckFree, loadValue, startTrip, sellStall, sellAllStall, rushTrip,
    price, trendOf, repBonus, newOrder, fulfillOrder, exchange, claimDaily, spin, resolvePrize, total, barnCap, stallCap, feedCap, setWeather, note,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FarmLogic = api;
})(typeof self !== 'undefined' ? self : this);
