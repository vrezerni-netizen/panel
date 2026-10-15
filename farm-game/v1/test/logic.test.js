const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

test('цикл: вскопать, посеять, полить, дождаться, собрать, продать', () => {
  const s = L.createState();
  assert.equal(L.act(s, 'hoe', 0, 0).ok, true);               // вскопали
  assert.equal(L.act(s, 'hoe', 0, 0).ok, false);              // второй раз нельзя
  assert.equal(L.act(s, 'seed', 0, 0, 'wheat').ok, true);
  assert.equal(s.seeds.wheat, 5);
  assert.equal(L.act(s, 'harvest', 0, 0).ok, false);          // рано
  assert.equal(L.act(s, 'water', 0, 0).ok, true);
  L.tick(s, 30000);                                           // 30 с полива = 60 с роста > 45 с
  assert.equal(L.isRipe(L.tileAt(s, 0, 0)), true);
  const h = L.act(s, 'harvest', 0, 0);
  assert.equal(h.ok, true); assert.equal(s.goods.wheat, 1);
  assert.equal(L.tileAt(s, 0, 0).k, 'soil');                  // грядка осталась вскопанной
  const r = L.sell(s, 'wheat', 'all');
  assert.equal(r.gain, 12); assert.equal(s.coins, 52);
});

test('неполитое растёт вдвое медленнее, чем политое', () => {
  const a = L.createState(), b = L.createState();
  for (const s of [a, b]) { L.act(s, 'seed', 2, 2, 'wheat'); }
  L.act(b, 'water', 2, 2);
  L.tick(a, 20000); L.tick(b, 20000);
  assert.equal(L.tileAt(a, 2, 2).progress, 20000);
  assert.equal(L.tileAt(b, 2, 2).progress, 40000);
});

test('полив кончается: после окончания скорость снова обычная', () => {
  const s = L.createState();
  L.act(s, 'seed', 2, 2, 'wheat'); L.act(s, 'water', 2, 2);
  L.tick(s, 100000);                                           // 60 с полива (x2) + 40 с обычного, но созрело раньше
  assert.equal(L.isRipe(L.tileAt(s, 2, 2)), true);
  const t = { k: 'crop', crop: 'pumpkin', progress: 0, water: 0 }; s.tiles[0] = t;
  L.tick(s, 10000); assert.equal(t.progress, 10000);
});

test('ошибки: семена, уровень, трава, чужой инструмент', () => {
  const s = L.createState();
  assert.equal(L.act(s, 'seed', 0, 0, 'wheat').ok, false);     // трава
  assert.equal(L.act(s, 'seed', 2, 2, 'pumpkin').ok, false);   // не хватает уровня
  s.seeds.carrot = 0;
  assert.equal(L.act(s, 'seed', 2, 2, 'carrot').ok, false);    // нет семян
  assert.equal(L.act(s, 'water', 2, 2).ok, false);             // нечего поливать
  assert.equal(L.act(s, 'seed', 99, 99, 'wheat').ok, false);   // за краем
});

test('опыт и уровни; новые культуры открываются по уровню', () => {
  const s = L.createState();
  s.coins = 1000;
  assert.equal(L.buySeeds(s, 'corn', 1).ok, false);            // кукуруза со 2 уровня
  s.xp = L.xpNeeded(1) - 1;
  L.act(s, 'hoe', 0, 0);
  assert.equal(s.level, 2);
  assert.equal(L.buySeeds(s, 'corn', 2).ok, true);
  assert.equal(s.seeds.corn, 2); assert.equal(s.coins, 1000 - 36);
});

test('магазин: нехватка денег, продажа всего, удобрение', () => {
  const s = L.createState();
  s.coins = 4;
  assert.equal(L.buySeeds(s, 'wheat', 1).ok, false);
  s.goods = { wheat: 3, carrot: 2, egg: 1 };
  const r = L.sellAll(s);
  assert.equal(r.gain, 3 * 12 + 2 * 20 + 14);
  assert.equal(L.sellAll(s).ok, false);
  L.act(s, 'seed', 2, 2, 'wheat');
  assert.equal(L.act(s, 'fert', 2, 2).ok, true);               // было 1 удобрение
  assert.equal(L.tileAt(s, 2, 2).progress, 22500);
  assert.equal(L.act(s, 'fert', 2, 2).ok, false);              // кончилось
});

test('расширение участка сохраняет грядки; улучшение лейки', () => {
  const s = L.createState();
  L.act(s, 'seed', 2, 2, 'wheat');
  s.coins = 10000;
  const before = s.w;
  assert.equal(L.buyUpgrade(s, 'plot').ok, true);
  assert.ok(s.w > before && s.tiles.length === s.w * s.h);
  assert.equal(L.tileAt(s, 2, 2).crop, 'wheat');               // грядка осталась на месте
  assert.equal(L.buyUpgrade(s, 'can').ok, true);
  L.act(s, 'water', 2, 2);
  assert.equal(L.tileAt(s, 2, 2).water, L.WATER_MS[1]);
  s.up.plot = 3; assert.equal(L.buyUpgrade(s, 'plot').ok, false);  // максимум
});

test('животные: покупка по уровню, продукты копятся и собираются, есть предел', () => {
  const s = L.createState();
  s.coins = 5000;
  assert.equal(L.buyAnimal(s, 'chicken').ok, false);           // с 3 уровня
  s.level = 3;
  assert.equal(L.buyAnimal(s, 'chicken').ok, true);
  L.tick(s, 90000 * 2);
  assert.equal(s.prod.chicken.pending, 2);
  assert.equal(L.collect(s, 'chicken').n, 2); assert.equal(s.goods.egg, 2);
  assert.equal(L.collect(s, 'chicken').ok, false);
  L.tick(s, 90000 * 100);
  assert.equal(s.prod.chicken.pending, L.ANIMALS.chicken.cap * 2);   // предел накопления
  for (let i = 0; i < 10; i++) L.buyAnimal(s, 'chicken');
  assert.equal(s.animals.chicken, L.ANIMALS.chicken.cap);
});

test('игра «догоняет» время без игрока, но не больше 8 часов; сутки меняются', () => {
  const s = L.createState();
  L.act(s, 'seed', 2, 2, 'wheat');
  const d0 = s.day;
  L.catchUp(s, 3600 * 1000);
  assert.equal(L.isRipe(L.tileAt(s, 2, 2)), true);
  assert.ok(s.day > d0);
  const t = { k: 'crop', crop: 'pumpkin', progress: 0, water: 0 }; s.tiles[0] = t;
  L.catchUp(s, 100 * 3600 * 1000);
  assert.equal(t.progress, Math.min(L.CROPS.pumpkin.growMs, L.OFFLINE_CAP));
});

test('сохранение: состояние переживает JSON', () => {
  const s = L.createState();
  L.act(s, 'seed', 2, 2, 'wheat'); L.act(s, 'water', 2, 2); L.tick(s, 12345);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  L.tick(copy, 1000); L.tick(s, 1000);
  assert.deepEqual(copy, s);
});
