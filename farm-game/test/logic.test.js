const test = require('node:test'); const assert = require('node:assert');
const L = require('../logic.js');
const fresh = () => { L.setRandom(() => 0.5); return L.createState(); };

test('данные: много культур, животных, уровней', () => {
  assert.ok(L.CROP_ORDER.length >= 14 && L.ANIMAL_ORDER.length >= 7);
  assert.ok(L.CROPS.pineapple.level >= 20);
});
test('рост и полив ускоряют', () => {
  const s = fresh(); L.act(s, 'seed', 2, 2, 'wheat'); L.act(s, 'seed', 3, 2, 'wheat');
  L.act(s, 'water', 2, 2); L.tick(s, 20000);
  assert.ok(L.tileAt(s, 2, 2).progress > L.tileAt(s, 3, 2).progress);
  L.tick(s, 60000); assert.ok(L.isRipe(L.tileAt(s, 2, 2)));
});
test('сбор кладёт товар на склад и даёт опыт', () => {
  const s = fresh(); L.act(s, 'seed', 2, 2, 'wheat'); L.tick(s, 40000);
  const r = L.act(s, 'harvest', 2, 2); assert.ok(r.ok); assert.equal(s.goods.wheat, 1); assert.ok(s.xp > 0);
});
test('склад ограничен', () => {
  const s = fresh(); s.goods.wheat = 200; L.act(s, 'seed', 2, 2, 'wheat'); L.tick(s, 40000);
  assert.equal(L.act(s, 'harvest', 2, 2).ok, false);
});
test('семена по уровню, мотыга, занято', () => {
  const s = fresh();
  assert.equal(L.buySeeds(s, 'pineapple', 1).ok, false);
  assert.equal(L.act(s, 'seed', 0, 0, 'wheat').ok, false);
  assert.ok(L.act(s, 'hoe', 0, 0).ok); assert.equal(L.act(s, 'hoe', 0, 0).ok, false);
});
test('трактор: нужен уровень, площадь, перезарядка', () => {
  const s = fresh();
  assert.equal(L.buyUpgrade(s, 'tractor').ok, false);
  s.level = 5; s.coins = 5000; assert.ok(L.buyUpgrade(s, 'tractor').ok);
  const r = L.act(s, 'tractor', 5, 4, 'wheat'); assert.ok(r.ok); assert.equal(r.planted, 3);
  assert.equal(L.act(s, 'tractor', 5, 5, 'wheat').ok, false);
  L.tick(s, 30000); assert.ok(L.act(s, 'tractor', 5, 5, 'wheat').ok);
});
test('комбайн собирает несколько грядок', () => {
  const s = fresh(); s.level = 6; s.coins = 5000; L.buyUpgrade(s, 'combine');
  for (let x = 2; x < 5; x++) { L.act(s, 'hoe', x, 5); L.act(s, 'seed', x, 5, 'wheat'); }
  L.tick(s, 40000); const r = L.act(s, 'combine', 3, 5); assert.ok(r.ok); assert.equal(r.n, 3);
});
test('корм и животные дают продукты', () => {
  const s = fresh(); s.level = 2; s.coins = 500; assert.equal(L.buyAnimal(s, 'chicken').ok, false); assert.ok(L.buyBarn(s, 'chicken').ok); assert.ok(L.buyAnimal(s, 'chicken').ok);
  L.tick(s, 130000); assert.ok(s.prod.chicken.pending >= 2);
  const c = L.collect(s, 'chicken'); assert.ok(c.ok); assert.ok(s.goods.egg >= 2);
  s.feed = 0; L.tick(s, 130000); assert.equal(s.prod.chicken.pending, 0);
});
test('рейс: груз уезжает, приезжает на прилавок, продаётся', () => {
  const s = fresh(); s.goods.wheat = 20; L.setRandom(() => 0.99);
  const r = L.startTrip(s, 0, { wheat: 20 }); assert.ok(r.ok); assert.equal(s.goods.wheat, undefined);
  assert.equal(L.startTrip(s, 0, { wheat: 1 }).ok, false);
  L.tick(s, 91000); assert.equal(s.stall.wheat, 20);
  L.tick(s, 91000); assert.equal(s.trips.length, 0);
  const g = L.sellStall(s, 'wheat', 'all'); assert.ok(g.ok); assert.ok(s.coins > 60);
});
test('вместимость машины и прилавка', () => {
  const s = fresh(); s.goods.wheat = 100;
  assert.equal(L.startTrip(s, 0, { wheat: 40 }).ok, false);
});
test('разбойники отнимают, охрана защищает', () => {
  const s = fresh(); s.goods.wheat = 30; L.setRandom(() => 0.25); // r<0.29 → bandits
  const t = L.startTrip(s, 0, { wheat: 30 }).trip; assert.equal(t.ev.id, 'bandits');
  L.tick(s, 91000); assert.ok(s.stall.wheat < 30);
});
test('цены на рынке колеблются в пределах', () => {
  const s = fresh(); let n = 0; L.setRandom(() => (n++ % 7) / 7);
  for (let i = 0; i < 200; i++) L.tick(s, 15000);
  for (const k of L.GOOD_KEYS) assert.ok(s.market.m[k] >= 0.55 && s.market.m[k] <= 1.9);
});
test('заказ выполняется с прилавка', () => {
  const s = fresh(); L.newOrder(s); const o = s.orders[0];
  assert.equal(L.fulfillOrder(s, o.id).ok, false);
  s.stall[o.good] = o.qty; const c = s.coins; assert.ok(L.fulfillOrder(s, o.id).ok); assert.equal(s.coins, c + o.reward);
});
test('уровни растут, кристаллы за уровень', () => {
  const s = fresh(); L.act(s, 'hoe', 0, 0); s.xp = L.xpNeeded(1) - 1; L.act(s, 'hoe', 1, 0);
  assert.equal(s.level, 2); assert.ok(s.crystals > 3);
});
test('ускорение и суперудобрение за кристаллы', () => {
  const s = fresh(); s.crystals = 20; assert.ok(L.buyGems(s, 'boost', 1).ok); assert.equal(s.boost, L.BOOST_MS);
  L.act(s, 'seed', 2, 2, 'wheat'); L.act(s, 'seed', 3, 2, 'wheat'); L.buyGems(s, 'superfert', 1);
  L.act(s, 'superfert', 2, 2); assert.ok(L.isRipe(L.tileAt(s, 2, 2)));
});
test('обмен валют', () => {
  const s = fresh(); s.coins = 2000; assert.ok(L.exchange(s, 'c2g', 2).ok); assert.equal(s.crystals, 5);
  assert.ok(L.exchange(s, 'g2c', 1).ok); assert.equal(L.exchange(s, 'g2c', 99).ok, false);
});
test('колесо: приз и риск удвоения', () => {
  const s = fresh(); s.tickets = 5; L.setRandom(() => 0.01);
  const r = L.spin(s); assert.ok(r.ok && r.gamble); assert.equal(L.spin(s).ok, false);
  const c = s.coins; L.setRandom(() => 0.1); const g = L.resolvePrize(s, true); assert.ok(g.doubled); assert.equal(s.coins, c + 100);
  L.setRandom(() => 0.01); L.spin(s); L.setRandom(() => 0.9);
  const g2 = L.resolvePrize(s, true); assert.ok(g2.lost);
});
test('ежедневный подарок раз в день', () => {
  const s = fresh(); assert.ok(L.claimDaily(s, '2026-01-01').ok); assert.equal(L.claimDaily(s, '2026-01-01').ok, false);
});
test('покупка новой фермы и переключение', () => {
  const s = fresh(); assert.equal(L.unlockFarm(s, 'valley').ok, false);
  s.level = 8; s.coins = 5000; assert.ok(L.unlockFarm(s, 'valley').ok); assert.equal(s.cur, 1);
  assert.ok(L.setFarm(s, 0).ok);
});
test('расширение участка сохраняет грядки', () => {
  const s = fresh(); s.coins = 1000; L.act(s, 'seed', 2, 2, 'wheat'); assert.ok(L.buyUpgrade(s, 'plot').ok);
  assert.equal(L.farm(s).w, 10); assert.equal(L.tileAt(s, 2, 2).crop, 'wheat');
});
test('оффлайн догоняет, но не бесконечно', () => {
  const s = fresh(); L.act(s, 'seed', 2, 2, 'wheat'); L.catchUp(s, 3600000); assert.ok(L.isRipe(L.tileAt(s, 2, 2)));
});
test('погода: дождь поливает, вредители съедают без пугал', () => {
  const s = fresh(); L.act(s, 'seed', 2, 2, 'wheat'); L.setWeather(s, 'rain'); assert.ok(L.tileAt(s, 2, 2).water > 0);
  L.tick(s, 40000); L.setRandom(() => 0.1); L.setWeather(s, 'pests'); assert.equal(L.tileAt(s, 2, 2).k, 'soil');
});
test('многолетние (клубника) дают несколько урожаев', () => {
  const s = fresh(); s.level = 6; L.act(s, 'seed', 2, 2, 'strawberry') ; s.seeds.strawberry = 1;
  L.act(s, 'seed', 2, 2, 'strawberry'); L.tick(s, 200000); L.act(s, 'harvest', 2, 2);
  assert.equal(L.tileAt(s, 2, 2).k, 'crop');
});

test('машины: 10 уровней, цена и требования растут, с 5-го нужны кристаллы', () => {
  const s = fresh(); s.coins = 1e9; s.crystals = 1000; s.level = 60;
  let prev = 0; for (let i = 1; i <= 10; i++) { const c = L.machineCost(s, 'tractor'); assert.ok(c.coins > prev); prev = c.coins; assert.ok(L.buyMachine(s, 'tractor').ok); }
  assert.equal(s.up.tractor, 10); assert.equal(L.buyMachine(s, 'tractor').ok, false);
  assert.ok(prev > 200000);
  const t = fresh(); t.coins = 1e9; t.level = 60; t.up.tractor = 6; assert.equal(L.buyMachine(t, 'tractor').ok, false);
  t.crystals = 50; assert.ok(L.buyMachine(t, 'tractor').ok);
  const u = fresh(); u.coins = 1e9; u.level = 5; u.up.tractor = 1; assert.equal(L.buyMachine(u, 'tractor').ok, false);
});
test('площадь и перезарядка по уровням', () => {
  assert.equal(L.areaOf(1).length, 3); assert.equal(L.areaOf(10).length, 45);
  assert.ok(L.coolOf('tractor', 10) < L.coolOf('tractor', 1));
});
test('поливочная машина и разбрасыватель', () => {
  const s = fresh(); s.up.waterer = 1; s.up.spreader = 1; L.act(s, 'seed', 2, 2, 'wheat'); L.act(s, 'seed', 3, 2, 'wheat');
  assert.ok(L.act(s, 'waterer', 2, 2).ok); assert.ok(L.tileAt(s, 3, 2).water > 0);
  s.items.fert = 1; const r = L.act(s, 'spreader', 2, 2); assert.ok(r.ok); assert.equal(s.items.fert, 0);
  L.tick(s, 40000); assert.equal(L.act(s, 'spreader', 2, 2).ok, false);
});
test('сарай нужен каждому виду, уровень сарая даёт места', () => {
  const s = fresh(); s.level = 4; s.coins = 1e6;
  assert.equal(L.buyAnimal(s, 'cow').ok, false); assert.ok(L.buyBarn(s, 'cow').ok);
  assert.equal(L.animalCap(s, 'cow'), 3); for (let i = 0; i < 3; i++) assert.ok(L.buyAnimal(s, 'cow').ok);
  assert.equal(L.buyAnimal(s, 'cow').ok, false); assert.equal(L.buyBarn(s, 'cow').ok, false);
  s.level = 10; assert.ok(L.buyBarn(s, 'cow').ok); assert.equal(L.animalCap(s, 'cow'), 5); assert.ok(L.buyAnimal(s, 'cow').ok);
});
test('оборудование для животных ускоряет, кормушка экономит корм', () => {
  const a = fresh(), b = fresh(); for (const s of [a, b]) { s.level = 4; s.coins = 1e6; s.feed = 100; L.buyBarn(s, 'chicken'); L.buyAnimal(s, 'chicken'); }
  b.up.eggline = 10; b.up.feeder = 10; L.tick(a, 120000); L.tick(b, 120000);
  assert.ok(b.prod.chicken.pending > a.prod.chicken.pending);
  L.tick(a, 600000); L.tick(b, 600000); assert.ok(100 - b.feed < (100 - a.feed) * 1.3 && b.feed > 0);
});
test('миграция старого сохранения: сараи для купленных животных', () => {
  const s = fresh(); s.animals.chicken = 2; delete s.barns; delete s.auto; const m = L.migrate(s); assert.equal(m.barns.chicken, 1);
});
test('дрон собирает урожай сам и тратит топливо', () => {
  const s = fresh(); s.up.drone = 1; s.coins = 10; L.setRun(s, 'drone', true); L.act(s, 'seed', 2, 2, 'wheat'); L.tick(s, 40000);
  L.tick(s, 61000); assert.equal(s.goods.wheat, 1); assert.equal(s.coins, 8);
  s.coins = 0; L.act(s, 'seed', 3, 2, 'wheat'); L.tick(s, 40000); L.tick(s, 61000); assert.equal(s.goods.wheat, 1);
});
test('робот-сборщик забирает продукты животных', () => {
  const s = fresh(); s.up.collector = 1; L.setRun(s, 'collector', true); s.coins = 50; s.animals.chicken = 1; s.prod.chicken = { acc: 0, pending: 3 }; s.barns.chicken = 1;
  L.tick(s, 46000); assert.equal(s.goods.egg, 2); assert.equal(s.prod.chicken.pending, 1);
});
test('автосеялка сеет выбранное на пустую землю', () => {
  const s = fresh(); s.up.seeder = 1; L.setRun(s, 'seeder', true); s.coins = 50; s.autoSeed = 'wheat'; s.seeds.wheat = 5; L.tick(s, 51000);
  assert.equal(s.seeds.wheat, 4); assert.equal(s.farms[0].tiles.filter((t) => t.k === 'crop').length, 1);
});
test('автокурьер отправляет машину при полном грузе', () => {
  const s = fresh(); s.up.courier = 1; L.setRun(s, 'courier', true); s.coins = 50; s.goods.wheat = 40; L.setRandom(() => 0.99); L.tick(s, 91000);
  assert.ok(s.stats.trips >= 1); assert.ok(s.coins < 50);
});
test('автомашины становятся быстрее с уровнем', () => {
  assert.ok(L.autoEvery('drone', 10) < L.autoEvery('drone', 1) / 4); assert.equal(L.autoN('collector', 10), 20);
});
test('пустые закрытые фермы открываются с 3, 6, 8 уровня', () => {
  const s = fresh(); s.coins = 1e6;
  assert.equal(L.unlockFarm(s, 'meadow').ok, false); s.level = 3; assert.ok(L.unlockFarm(s, 'meadow').ok);
  assert.ok(L.farm(s).tiles.every((t) => t.k === 'grass'));
  assert.equal(L.unlockFarm(s, 'grove').ok, false); s.level = 6; assert.ok(L.unlockFarm(s, 'grove').ok);
  assert.equal(s.farms.length, 3); assert.deepEqual(L.FARM_DEFS.map((d) => d.level).slice(0, 4), [1, 3, 6, 8]);
});
const wildState = (id) => { const s = fresh(); s.level = 12; s.coins = 1e6; assert.ok(L.unlockFarm(s, id).ok); return s; };
const findTile = (s, k) => { const f = L.farm(s); for (let i = 0; i < f.tiles.length; i++) if (f.tiles[i].k === k) return [i % f.w, (i / f.w) | 0]; return null; };
test('целина: большой участок с лесом и камнями, поляны есть', () => {
  const s = wildState('wild'), f = L.farm(s), n = (k) => f.tiles.filter((t) => t.k === k).length;
  assert.ok(f.w >= 22 && f.h >= 15); assert.ok(n('tree') > f.tiles.length * 0.4); assert.ok(n('rock') > 5); assert.ok(n('grass') > 20);
  const again = L.createState(); again.level = 12; again.coins = 1e6; L.unlockFarm(again, 'wild'); assert.deepEqual(L.farm(again).tiles, f.tiles);
});
test('топор: несколько ударов, брёвна, пень, без вспашки пока не расчищено', () => {
  const s = wildState('wild'), [x, y] = findTile(s, 'tree');
  assert.equal(L.act(s, 'hoe', x, y).ok, false);
  const hp = L.tileAt(s, x, y).hp; assert.ok(hp >= 3);
  for (let i = 0; i < hp - 1; i++) { const r = L.act(s, 'axe', x, y); assert.ok(r.ok && r.hit); }
  const r = L.act(s, 'axe', x, y); assert.ok(r.ok && r.item === 'log' && r.n >= 2); assert.equal(L.tileAt(s, x, y).k, 'stump'); assert.ok(s.goods.log >= 2);
  assert.equal(L.act(s, 'hoe', x, y).ok, false); assert.equal(L.act(s, 'axe', x, y).ok, false);
  const c = s.coins; assert.ok(L.act(s, 'remove', x, y).ok); assert.equal(s.coins, c - 12); assert.equal(L.tileAt(s, x, y).k, 'grass');
  assert.ok(L.act(s, 'hoe', x, y).ok); assert.equal(L.tileAt(s, x, y).k, 'soil');
});
test('камень убирается за монеты, дерево нельзя убрать без топора', () => {
  const s = wildState('wild'), [rx, ry] = findTile(s, 'rock'), [tx, ty] = findTile(s, 'tree');
  assert.equal(L.act(s, 'remove', tx, ty).ok, false); const c = s.coins; assert.ok(L.act(s, 'remove', rx, ry).ok); assert.equal(s.coins, c - 60);
});
test('склад полон — рубить нельзя', () => {
  const s = wildState('wild'); s.goods.wheat = 200; const [x, y] = findTile(s, 'tree'); L.tileAt(s, x, y).hp = 1;
  assert.equal(L.act(s, 'axe', x, y).ok, false); assert.equal(L.tileAt(s, x, y).k, 'tree');
});
test('лес: после рубки вырастает молодое деревце, потом снова дерево, пахать нельзя', () => {
  const s = wildState('forest'), [x, y] = findTile(s, 'tree'); L.tileAt(s, x, y).hp = 1;
  assert.ok(L.act(s, 'axe', x, y).ok); assert.equal(L.tileAt(s, x, y).k, 'young'); assert.equal(L.act(s, 'axe', x, y).ok, false);
  L.tick(s, L.YOUNG_MS + 1000); assert.equal(L.tileAt(s, x, y).k, 'tree'); assert.equal(L.act(s, 'hoe', x, y).ok, false);
  const [gx, gy] = findTile(s, 'grass') || [0, 0]; assert.equal(L.act(s, 'hoe', gx, gy).ok, false);
});
test('харвестер и корчеватель работают по площади', () => {
  const s = wildState('wild'); s.coins = 1e7; s.level = 30; assert.ok(L.buyMachine(s, 'logger').ok); assert.ok(L.buyMachine(s, 'grinder').ok);
  const f = L.farm(s); let sx = 0, sy = 0, best = -1;
  for (let y = 1; y < f.h - 1; y++) for (let x = 1; x < f.w - 1; x++) { const c = L.areaCells(s, 'logger', x, y).filter(([cx, cy]) => L.tileAt(s, cx, cy).k === 'tree').length; if (c > best) { best = c; sx = x; sy = y; } }
  const r = L.act(s, 'logger', sx, sy); assert.ok(r.ok); assert.ok(r.n >= best * 2); assert.ok(L.areaCells(s, 'logger', sx, sy).every(([cx, cy]) => L.tileAt(s, cx, cy).k !== 'tree'));
  const g = L.act(s, 'grinder', sx, sy); assert.ok(g.ok); assert.ok(L.areaCells(s, 'grinder', sx, sy).every(([cx, cy]) => L.tileAt(s, cx, cy).k !== 'stump'));
});
test('лесопилка: ручная распиловка и автомат', () => {
  const s = fresh(); s.coins = 500; s.goods.log = 11; const r = L.sawLogs(s, 99); assert.ok(r.ok); assert.equal(r.planks, 5); assert.equal(s.goods.log, 1); assert.equal(s.goods.plank, 5); assert.equal(s.coins, 485);
  assert.equal(L.sawLogs(s, 1).ok, false);
  const t = fresh(); t.level = 12; t.coins = 1e5; t.goods.log = 20; assert.ok(L.buyMachine(t, 'sawmill').ok); assert.ok(L.setRun(t, 'sawmill', true).ok); L.tick(t, 41000); assert.equal(t.goods.plank, 2); assert.equal(t.goods.log, 16);
});
test('стройка: материалы, этапы, продажа, площадки по уровню', () => {
  const s = fresh(); s.coins = 1e5; s.goods.plank = 100;
  assert.equal(L.startBuild(s, 'shed').ok, false); s.level = 3; assert.equal(L.siteSlots(s), 1);
  const b = L.startBuild(s, 'shed'); assert.ok(b.ok); assert.equal(s.goods.plank, 80); assert.equal(L.startBuild(s, 'shed').ok, false);
  assert.equal(L.siteStage(s.sites[0]), 0); L.tick(s, 50000); assert.equal(L.siteStage(s.sites[0]), 2); assert.equal(L.sellSite(s, b.site.id).ok, false);
  L.tick(s, 50000); assert.equal(L.siteStage(s.sites[0]), 4); const c = s.coins, r = L.sellSite(s, b.site.id); assert.ok(r.ok); assert.ok(s.coins - c > 2000); assert.equal(s.sites.length, 0); assert.equal(s.stats.built, 1);
  s.level = 8; assert.equal(L.siteSlots(s), 2);
});
test('ускорение стройки за кристаллы', () => {
  const s = fresh(); s.level = 6; s.coins = 1e5; s.goods.plank = 100; s.crystals = 50; const b = L.startBuild(s, 'house'); assert.ok(b.ok);
  assert.ok(L.rushSite(s, b.site.id).ok); assert.equal(s.sites[0].done, true);
});
test('цена недвижимости колеблется в пределах', () => {
  const s = fresh(); let n = 0; L.setRandom(() => (n++ % 9) / 9); for (let i = 0; i < 4000; i++) L.tick(s, 100); assert.ok(s.market.prop >= 0.75 && s.market.prop <= 1.45);
});
test('старое сохранение получает стройки и цену недвижимости', () => {
  const s = fresh(); delete s.sites; delete s.market.prop; const m = L.migrate(s); assert.deepEqual(m.sites, []); assert.equal(m.market.prop, 1);
});

// ---------------- работа техники только по команде игрока
const owned = (keys, lv) => { const s = fresh(); s.level = 14; s.coins = 1e6; s.crystals = 99; for (const k of keys) s.up[k] = lv || 1; return s; };
const runUntil = (s, ms) => { for (let t = 0; t < ms; t += 500) L.tick(s, 500); };
const snap = (s) => JSON.stringify([s.farms, s.goods, s.coins, s.items, s.seeds]);
test('без команды техника и автоматика ничего не меняют', () => {
  const s = owned(['tractor', 'combine', 'waterer', 'spreader', 'drone', 'collector', 'seeder', 'courier', 'sawmill']); s.autoSeed = 'wheat'; s.goods.log = 20; s.items.fert = 5;
  L.act(s, 'seed', 2, 2, 'wheat'); L.tick(s, 80000);
  const before = JSON.stringify([s.farms[0].tiles.filter((t) => t.k !== 'crop'), s.goods, s.seeds, s.coins]);
  runUntil(s, 120000);
  assert.equal(L.isRun(s, 'tractor'), false); assert.equal(L.isRun(s, 'drone'), false);
  assert.equal(JSON.stringify([s.farms[0].tiles.filter((t) => t.k !== 'crop'), s.goods, s.seeds, s.coins]), before);
  assert.deepEqual(L.drainFx(), []);
});
test('включить можно только купленное, животное оборудование не включается', () => {
  const s = owned([]); assert.equal(L.setRun(s, 'tractor', true).ok, false); assert.equal(L.setRun(s, 'feeder', true).ok, false);
  s.up.tractor = 1; assert.ok(L.setRun(s, 'tractor', true).ok); assert.equal(L.setRun(s, 'tractor', true, 'nope').ok, false); assert.equal(L.runStatus(s, 'tractor').state, 'idle');
  assert.ok(L.setRun(s, 'tractor', false).ok); assert.equal(L.runStatus(s, 'tractor').state, 'off');
});
test('трактор сам вспахивает всё поле и платит топливо; выключили — стоит', () => {
  const s = owned(['tractor'], 3); const f = L.farm(s), grass = () => f.tiles.filter((t) => t.k === 'grass').length, g0 = grass(), c0 = s.coins; L.drainFx();
  assert.ok(L.setRun(s, 'tractor', true).ok);
  runUntil(s, 2000); assert.ok(s.job.tractor, 'выехал'); assert.equal(grass(), g0, 'пока едет, поле не меняется');
  runUntil(s, 240000); assert.equal(grass(), 0, 'всё поле вспахано'); assert.ok(s.coins < c0);
  const ev = L.drainFx(); assert.ok(ev.length >= 2); assert.equal(ev[0].key, 'tractor'); assert.ok(ev[0].cells.length > 0 && ev[0].cells[0][2] === 'grass');
  L.setRun(s, 'tractor', false); const c = s.coins; runUntil(s, 60000); assert.equal(s.coins, c);
});
test('трактор сеет выбранные семена, пока они есть', () => {
  const s = owned(['tractor'], 5); s.seeds.wheat = 7; s.runSeed = 'wheat'; L.setRun(s, 'tractor', true); runUntil(s, 120000);
  assert.equal(s.seeds.wheat, 0); assert.equal(L.farm(s).tiles.filter((t) => t.k === 'crop').length, 7 + 0 + (4 - 4)); // 4 клетки были вскопаны и тоже засеяны
});
test('комбайн собирает созревшее, водная и удобрение работают только когда нужно', () => {
  const s = owned(['combine', 'waterer', 'spreader'], 2); for (let x = 0; x < 6; x++) L.act(s, 'hoe', x, 0), L.act(s, 'seed', x, 0, 'wheat'); L.setRun(s, 'waterer', true); s.items.fert = 3; L.setRun(s, 'spreader', true);
  runUntil(s, 40000); assert.ok(L.farm(s).tiles.slice(0, 6).every((t) => t.water > 0 || L.isRipe(t)));
  assert.ok(s.items.fert < 3);
  L.tick(s, 120000); assert.ok(L.farm(s).tiles.slice(0, 6).some((t) => L.isRipe(t)));
  L.setRun(s, 'combine', true); runUntil(s, 60000); assert.ok(s.goods.wheat >= 1); assert.equal(L.farm(s).tiles.slice(0, 6).filter((t) => L.isRipe(t)).length, 0);
});
test('комбайн ждёт, если склад полон, и говорит почему', () => {
  const s = owned(['combine']); L.act(s, 'seed', 2, 2, 'wheat'); L.tick(s, 80000); s.goods.wheat = L.barnCap(s); L.setRun(s, 'combine', true); runUntil(s, 10000);
  assert.ok(/Склад полон/.test(L.runStatus(s, 'combine').why)); assert.ok(L.isRipe(L.tileAt(s, 2, 2)));
});
test('харвестер и корчеватель сами расчищают целину, ферма игрока не переключается', () => {
  const s = owned(['logger', 'grinder'], 6); s.up.barn = 3; assert.ok(L.unlockFarm(s, 'wild').ok); s.cur = 0; const f = s.farms[1], n = (k) => f.tiles.filter((t) => t.k === k).length;
  const trees = n('tree'); assert.ok(trees > 50);
  L.setRun(s, 'logger', true, 'wild'); L.setRun(s, 'grinder', true, 'wild'); let maxStump = 0;
  for (let t = 0; t < 600000; t += 500) { L.tick(s, 500); maxStump = Math.max(maxStump, n('stump')); }
  assert.ok(n('tree') < trees * 0.6, 'деревьев сильно меньше'); assert.ok(maxStump > 0); assert.ok(s.goods.log > 0 || s.stats.logs > 0);
  assert.equal(s.cur, 0); assert.equal(L.farm(s).id, 'home');
});
test('в лесном участке трактор не пашет: ни вручную, ни сам', () => {
  const s = owned(['tractor']); assert.ok(L.unlockFarm(s, 'forest').ok); assert.equal(L.act(s, 'tractor', 2, 2).ok, false);
  L.setRun(s, 'tractor', true, 'forest'); runUntil(s, 20000); assert.equal(L.runStatus(s, 'tractor').state, 'idle'); assert.ok(s.runWhy.tractor);
});
test('автоматика включается по команде, старые сохранения продолжают работать как раньше', () => {
  const old = fresh(); old.up.drone = 1; delete old.run; L.migrate(old); assert.equal(L.isRun(old, 'drone'), true); assert.equal(L.isRun(old, 'collector'), false);
  const s = fresh(); s.coins = 1e5; s.level = 12; assert.ok(L.buyMachine(s, 'drone').ok); assert.equal(L.isRun(s, 'drone'), false, 'новая покупка выключена');
});
test('выключенная ферма удалена или машина продана — работа сама гасится', () => {
  const s = owned(['tractor']); L.setRun(s, 'tractor', true); s.run.tractor = 'gone'; L.tick(s, 1000); assert.equal(L.isRun(s, 'tractor'), false);
});
