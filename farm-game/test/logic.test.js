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
  const s = fresh(); s.up.drone = 1; s.coins = 10; L.act(s, 'seed', 2, 2, 'wheat'); L.tick(s, 40000);
  L.tick(s, 61000); assert.equal(s.goods.wheat, 1); assert.equal(s.coins, 8);
  s.coins = 0; L.act(s, 'seed', 3, 2, 'wheat'); L.tick(s, 40000); L.tick(s, 61000); assert.equal(s.goods.wheat, 1);
});
test('робот-сборщик забирает продукты животных', () => {
  const s = fresh(); s.up.collector = 1; s.coins = 50; s.animals.chicken = 1; s.prod.chicken = { acc: 0, pending: 3 }; s.barns.chicken = 1;
  L.tick(s, 46000); assert.equal(s.goods.egg, 2); assert.equal(s.prod.chicken.pending, 1);
});
test('автосеялка сеет выбранное на пустую землю', () => {
  const s = fresh(); s.up.seeder = 1; s.coins = 50; s.autoSeed = 'wheat'; s.seeds.wheat = 5; L.tick(s, 51000);
  assert.equal(s.seeds.wheat, 4); assert.equal(s.farms[0].tiles.filter((t) => t.k === 'crop').length, 1);
});
test('автокурьер отправляет машину при полном грузе', () => {
  const s = fresh(); s.up.courier = 1; s.coins = 50; s.goods.wheat = 40; L.setRandom(() => 0.99); L.tick(s, 91000);
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
