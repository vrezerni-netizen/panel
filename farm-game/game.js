/* Ферма и Город — интерфейс, меню, магазины, сохранение. 3D живёт в world3d.js, правила в logic.js */
(function () {
  'use strict';
  const L = window.FarmLogic;
  const $ = (id) => document.getElementById(id);
  const SAVE = 'farm2.save', HELP = 'farm2.help';
  const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ничего */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ничего */ } },
  };

  let S, world;
  const ui = { mode: 'farm', tool: 'hoe', seed: null, modal: null, tab: {}, load: {}, truck: 0, sound: true, spinning: false, hold: null, wheelAngle: 0, lastLog: 0, confirm: null, toastAt: {} };
  window.__game = { get S() { return S; }, ui, L, open: (id, t) => openModal(id, t) };

  // ---------------------------------------------------------------- звук
  let actx = null;
  function beep(f, d, type, vol) {
    if (!ui.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      g.gain.value = vol || 0.05; g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch (e) { /* без звука */ }
  }
  const sfx = {
    dig: () => beep(140, 0.1, 'triangle'), plant: () => beep(520, 0.08), water: () => beep(700, 0.12, 'sine', 0.03),
    harvest: () => { beep(660, 0.08); setTimeout(() => beep(880, 0.1), 70); }, coin: () => { beep(988, 0.07, 'square', 0.03); setTimeout(() => beep(1319, 0.14, 'square', 0.03), 70); },
    bad: () => beep(150, 0.25, 'sawtooth', 0.04), level: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18), i * 110)),
  };

  // ---------------------------------------------------------------- сохранение
  function save() { store.set(SAVE, JSON.stringify({ s: S, t: Date.now(), sound: ui.sound })); }
  function load() {
    const raw = store.get(SAVE); if (!raw) return null;
    try { const d = JSON.parse(raw); if (!d.s || d.s.v !== 2) return null; ui.sound = d.sound !== false; return d; } catch (e) { return null; }
  }
  const todayKey = () => new Date().toLocaleDateString('sv');

  // ---------------------------------------------------------------- уведомления
  function toast(msg, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg; $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 3700);
  }
  function toastOnce(msg, kind) { const n = Date.now(); if (ui.toastAt[msg] && n - ui.toastAt[msg] < 1500) return; ui.toastAt[msg] = n; toast(msg, kind); }
  function floatAt(x, y, html) { const el = document.createElement('div'); el.className = 'fl'; el.style.left = x + 'px'; el.style.top = y + 'px'; el.innerHTML = html; $('floats').appendChild(el); setTimeout(() => el.remove(), 1200); }
  const gi = (k) => (L.GOODS[k] ? L.GOODS[k].icon : '❓');

  // ---------------------------------------------------------------- действия на ферме
  const TOOLS = [
    { id: 'hoe', icon: '⛏️', name: 'Копать' }, { id: 'seed', icon: '🌱', name: 'Сеять' }, { id: 'water', icon: '💧', name: 'Полив' }, { id: 'harvest', icon: '🧺', name: 'Сбор' },
    { id: 'fert', icon: '🧪', name: 'Удобр.' }, { id: 'superfert', icon: '⚡', name: 'Супер' }, { id: 'sprinkler', icon: '🚿', name: 'Поливалка' },
    { id: 'tractor', icon: '🚜', name: 'Трактор' }, { id: 'combine', icon: '🌾', name: 'Комбайн' }, { id: 'waterer', icon: '🚒', name: 'Поливмаш' }, { id: 'spreader', icon: '🧂', name: 'Удобр.маш' }, { id: 'remove', icon: '🪓', name: 'Убрать' },
  ];
  const needSeed = () => ui.tool === 'seed' || ui.tool === 'tractor';
  function pickSeed() {
    if (ui.seed && S.seeds[ui.seed] > 0) return;
    ui.seed = L.CROP_ORDER.find((k) => S.seeds[k] > 0 && L.CROPS[k].level <= S.level) || null;
  }
  function onTile(x, y, first) {
    if (ui.modal) return;
    pickSeed();
    const tool = ui.tool;
    if (needSeed() && tool === 'seed' && !ui.seed) { toastOnce('Нет семян — купи в магазине 🌱 в городе', 'bad'); return; }
    const had = S.level;
    const r = L.act(S, tool, x, y, ui.seed);
    if (!r.ok) { toastOnce(r.msg, 'bad'); if (first) sfx.bad(); return; }
    const sp = world.tileScreen(x, y);
    const kind = { dig: 'dig', plant: 'plant', water: 'water', harvest: 'harvest', fert: 'fert', build: 'build', remove: 'remove', tractor: 'dig', combine: 'harvest', waterer: 'water', spreader: 'fert' }[r.fx] || 'dig';
    if (L.MACHINES[tool] && L.MACHINES[tool].kind === 'field') {
      world.drive(tool, y);
      for (const [cx, cy] of L.areaCells(S, tool, x, y)) world.fx(kind, cx, cy);
    } else world.fx(kind, x, y, { gold: r.gold });
    let txt = '';
    if (r.item) txt += `+${r.n}${gi(r.item)} `;
    if (tool === 'combine') txt += `+${r.n}📦 `;
    if (tool === 'tractor' && r.planted) txt += `🌱×${r.planted} `;
    if (r.xp) txt += `<span style="color:#ffd54f">+${r.xp}⭐</span>`;
    if (r.gold) txt = `✨ ЗОЛОТОЙ ×3 ${txt}`;
    if (txt) floatAt(sp.x, sp.y, txt);
    (sfx[kind] || sfx.dig)(); if (r.gold) sfx.coin();
    if (S.level > had) onLevelUp();
    pickSeed(); lastBar = ''; renderBar();
  }
  function onHover(t) {
    if (!t) { world.highlight(null); return; }
    const big = L.MACHINES[ui.tool] && L.MACHINES[ui.tool].kind === 'field' && S.up[ui.tool] > 0;
    world.highlight(big ? L.areaCells(S, ui.tool, t.x, t.y) : [[t.x, t.y]], big ? 0xffc83d : 0xffffff);
  }
  function unlocksAt(lv) {
    const out = [];
    for (const k of L.CROP_ORDER) if (L.CROPS[k].level === lv) out.push(`${L.CROPS[k].icon} ${L.CROPS[k].name}`);
    for (const k of L.ANIMAL_ORDER) if (L.ANIMALS[k].level === lv) out.push(`${L.ANIMALS[k].icon} ${L.ANIMALS[k].name}`);
    for (const k of L.MACH_KEYS) if (L.MACHINES[k].need === lv) out.push(`${L.MACHINES[k].icon} ${L.MACHINES[k].name}`);
    for (const f of L.FARM_DEFS) if (f.level === lv && f.cost) out.push(`🗺️ Ферма «${f.name}»`);
    if (lv === L.SPRINKLER.need) out.push('🚿 Поливалки');
    L.TRUCK_SLOTS.forEach((t, i) => { if (i && t.level === lv) out.push(`🚚 Машина №${i + 1}`); });
    return out;
  }
  function onLevelUp() {
    sfx.level(); const u = unlocksAt(S.level);
    toast(`🎉 Уровень ${S.level}!${u.length ? ' Открылось: ' + u.join(', ') : ''}`, 'good');
    world.refreshCity(S);
  }

  // ---------------------------------------------------------------- HUD
  let lastHud = '', lastBar = '', lastSeed = '';
  function clockText() { const h = (S.clock / L.DAY_MS) * 24; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; }
  const WEATHER = { sun: ['☀️', 'Ясно'], rain: ['🌧️', 'Дождь'], drought: ['🌵', 'Засуха'], pests: ['🐛', 'Вредители'] };
  function mmss(ms) { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  let hudBuilt = false;
  const setT = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; };
  const setH = (id, hide) => { const e = $(id); if (e && e.hidden !== hide) e.hidden = hide; };
  function renderHud() {
    if (!hudBuilt) {
      hudBuilt = true;
      $('hud').innerHTML = `
      <div class="lvl" data-act="modal" data-id="levels"><div class="b" id="h-lv"></div><div class="t"><b id="h-lvt"></b><small id="h-xpt"></small><div class="xp"><i id="h-xp"></i></div></div></div>
      <div class="hsp"></div>
      <div class="pill" data-act="modal" data-id="bank">🪙 <span id="h-c"></span></div>
      <div class="pill" data-act="modal" data-id="bank">💎 <span id="h-g"></span><span class="plus">+</span></div>
      <div class="pill" data-act="modal" data-id="casino">🎟️ <span id="h-t"></span></div>
      <div class="row2">
        <button class="tab2" id="h-mf" data-act="mode" data-m="farm">🌾 Ферма</button>
        <button class="tab2" id="h-mc" data-act="mode" data-m="city">🏙️ Город</button>
        <span class="chip" id="h-w"></span><span class="chip boost" id="h-b"></span><span class="chip" id="h-tr"></span>
        <div class="hsp"></div>
        <button class="ibtn glow" id="h-d" data-act="daily">🎁</button>
        <button class="ibtn" data-act="modal" data-id="orders">📜<span class="bd" id="h-o"></span></button>
        <button class="ibtn" data-act="modal" data-id="menu">☰</button>
      </div>`;
    }
    const v = ui.hold || S, need = L.xpNeeded(S.level), w = WEATHER[S.weather.type];
    setT('h-lv', S.level); setT('h-lvt', 'Уровень ' + S.level); setT('h-xpt', `${fmt(S.xp)} / ${fmt(need)} ⭐ · репутация ${S.rep}`);
    $('h-xp').style.width = Math.min(100, S.xp / need * 100) + '%';
    setT('h-c', fmt(v.coins)); setT('h-g', fmt(v.crystals)); setT('h-t', fmt(v.tickets));
    $('h-mf').classList.toggle('on', ui.mode === 'farm'); $('h-mc').classList.toggle('on', ui.mode === 'city');
    setT('h-w', `${w[0]} ${w[1]} · ${clockText()} · день ${S.day}`);
    setH('h-b', !(S.boost > 0)); setT('h-b', `⚡ рост ×2 · ${mmss(S.boost)}`);
    setH('h-tr', !S.trips.length); setT('h-tr', `🚚 в пути: ${S.trips.length}`);
    setH('h-d', S.daily.key === todayKey()); setH('h-o', !S.orders.length); setT('h-o', S.orders.length);
  }
  function renderBar() {
    let html = '';
    if (ui.mode === 'farm') {
      for (const t of TOOLS) {
        let extra = '', dis = '';
        if (t.id === 'fert') extra = `<span class="n">${S.items.fert}</span>`;
        if (t.id === 'superfert') extra = `<span class="n">${S.items.superfert}</span>`;
        if (L.MACHINES[t.id]) {
          if (!S.up[t.id]) { dis = 'dis'; extra = `<span class="cd">🔒${L.MACHINES[t.id].need}</span>`; }
          else if (S.cool[t.id] > 0) extra = `<span class="cd">${Math.ceil(S.cool[t.id] / 1000)}</span>`;
        }
        if (t.id === 'sprinkler' && S.level < L.SPRINKLER.need) { dis = 'dis'; extra = `<span class="cd">🔒${L.SPRINKLER.need}</span>`; }
        html += `<button class="tool ${ui.tool === t.id ? 'on' : ''} ${dis}" data-act="tool" data-t="${t.id}"><b>${t.icon}</b>${t.name}${extra}</button>`;
      }
      html += `<button class="bigbtn" data-act="modal" data-id="animals">🐄 Загон</button><button class="bigbtn g" data-act="modal" data-id="barn">📦 Склад ${fmt(L.total(S.goods))}/${L.barnCap(S)}</button><button class="bigbtn b" data-act="mode" data-m="city">🏙️ В город</button>`;
    } else {
      html = `<button class="bigbtn g" data-act="modal" data-id="barn">📦 Склад: отправить на рынок</button><button class="bigbtn" data-act="modal" data-id="market">🏪 Рынок</button><button class="bigbtn" data-act="modal" data-id="orders">📜 Заказы ${S.orders.length}</button><button class="bigbtn b" data-act="mode" data-m="farm">🌾 На ферму</button>`;
    }
    if (html !== lastBar) { lastBar = html; $('bar').innerHTML = html; }
    // семена
    let sh = '';
    if (ui.mode === 'farm' && needSeed()) {
      const list = L.CROP_ORDER.filter((k) => L.CROPS[k].level <= S.level + 1);
      sh = list.map((k) => { const c = L.CROPS[k], lock = c.level > S.level, n = S.seeds[k] || 0; return `<div class="seed ${ui.seed === k ? 'on' : ''} ${lock || !n ? 'off' : ''}" data-act="seedpick" data-k="${k}"><b>${c.icon}</b><span>${lock ? '🔒' + c.level : n}</span></div>`; }).join('');
      sh += '<div class="seed" data-act="modal" data-id="seeds"><b>🛒</b><span>купить</span></div>';
    }
    if (sh !== lastSeed) { lastSeed = sh; $('seedbar').innerHTML = sh; }
    $('seedbar').style.display = sh ? '' : 'none';
  }

  // ---------------------------------------------------------------- переключение сцены
  function goMode(m) {
    if (m === ui.mode) return;
    $('fade').classList.add('on');
    setTimeout(() => {
      ui.mode = m; world.setMode(m, S); lastBar = ''; renderBar(); renderHud(); world.highlight(null);
      if (m === 'city') { world.refreshCity(S); if (L.total(S.goods) > 0) toastOnce('📦 На складе есть урожай — отправь машину на рынок!', 'good'); }
      $('fade').classList.remove('on');
    }, 230);
  }

  // ---------------------------------------------------------------- окна
  const MODALS = {};
  function openModal(id, tab) {
    ui.modal = id; if (tab != null) ui.tab[id] = tab; ui.confirm = null;
    $('modal').hidden = false; renderModal(true);
  }
  function closeModal() { if (ui.spinning) return; ui.modal = null; $('modal').hidden = true; world.highlight(null); }
  function renderModal(reset) {
    const m = MODALS[ui.modal]; if (!m) return;
    const tab = ui.tab[ui.modal] != null ? ui.tab[ui.modal] : (m.tabs ? m.tabs[0][0] : null);
    $('mtitle').textContent = typeof m.title === 'function' ? m.title() : m.title;
    $('mtabs').innerHTML = m.tabs ? m.tabs.map(([k, n]) => `<button class="mtab ${k === tab ? 'on' : ''}" data-act="tab" data-t="${k}">${n}</button>`).join('') : '';
    const body = $('mbody'), top = reset ? 0 : body.scrollTop, html = m.render(tab);
    if (reset || html !== ui.mhtml) { ui.mhtml = html; body.innerHTML = html; body.scrollTop = top; }
  }
  const card = (ic, name, sub, btns, cls) => `<div class="card ${cls || ''}"><div class="ic">${ic}</div><div class="in"><b>${name}</b><small>${sub || ''}</small></div><div>${btns || ''}</div></div>`;
  const btn = (act, data, label, cls, dis) => `<button class="btn ${cls || ''} ${dis ? 'dis' : ''}" data-act="${act}" ${Object.entries(data || {}).map(([k, v]) => `data-${k}="${v}"`).join(' ')}>${label}</button>`;
  const trend = (k) => { const t = L.trendOf(S, k); return t > 0 ? '<span class="up">▲</span>' : t < 0 ? '<span class="dn">▼</span>' : '<span>▬</span>'; };
  const ratio = (k) => S.market.m[k];
  const priceTag = (k) => { const r = ratio(k); return r >= 1.25 ? '<span class="up">выгодно!</span>' : r <= 0.8 ? '<span class="dn">дёшево</span>' : ''; };
  const canBuy = (c) => S.coins >= c;

  // --- Склад: погрузка и отправка
  MODALS.barn = {
    title: '📦 Склад и доставка',
    render() {
      const goods = Object.keys(S.goods).filter((k) => S.goods[k] > 0);
      if (!S.trucks[ui.truck]) ui.truck = 0;
      const tr = S.trucks[ui.truck], info = L.TRUCKS[tr.lvl], busy = !L.truckFree(S, ui.truck);
      let loaded = 0; for (const k of Object.keys(ui.load)) { ui.load[k] = Math.min(ui.load[k], S.goods[k] || 0); if (!ui.load[k]) delete ui.load[k]; else loaded += ui.load[k]; }
      const val = L.loadValue(S, ui.load);
      let h = `<div class="hint">Урожай нельзя продать на ферме: его надо <b>отвезти на рынок в город</b>. Выбери машину, загрузи товар и отправь. В пути бывают пробки, поломки и разбойники — а на рынке цена каждую минуту меняется!</div>`;
      h += `<div class="trucks">${S.trucks.map((t, i) => { const I = L.TRUCKS[t.lvl], b = !L.truckFree(S, i), trp = S.trips.find((x) => x.truck === i); return `<div class="tr ${ui.truck === i ? 'on' : ''} ${b ? 'busy' : ''}" data-act="truck" data-i="${i}"><b>${I.icon}</b>${I.name}<br>до ${I.cap} шт.<br>${b ? (trp.phase === 'out' ? '→ ' : '← ') + mmss(trp.left) : 'свободна'}</div>`; }).join('')}</div>`;
      h += `<div class="hint">Склад: ${L.total(S.goods)} / ${L.barnCap(S)} · Груз: <b>${loaded} / ${info.cap}</b> · примерно <b>${fmt(val)} 🪙</b></div><div class="bar"><i style="width:${Math.min(100, loaded / info.cap * 100)}%"></i></div><div style="height:10px"></div>`;
      if (!goods.length) h += '<div class="hint center">Склад пуст. Вырасти урожай на ферме 🌾</div>';
      for (const k of goods) {
        const n = ui.load[k] || 0;
        h += `<div class="card"><div class="ic">${gi(k)}</div><div class="in"><b>${L.GOODS[k].name} · ${S.goods[k]} шт.</b><small>на рынке ${L.price(S, k)}🪙 ${trend(k)} ${priceTag(k)}</small></div><div class="step"><button data-act="ld" data-k="${k}" data-d="-5">−</button><span>${n}</span><button data-act="ld" data-k="${k}" data-d="1">+</button><button data-act="ld" data-k="${k}" data-d="max">⏫</button></div></div>`;
      }
      h += `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">${btn('ldall', {}, 'Загрузить побольше', 'b')}${btn('ldclr', {}, 'Очистить', 'y')}${btn('send', {}, `🚚 Отправить (${loaded})`, '', busy || !loaded)}</div>`;
      if (busy) h += '<div class="hint">Эта машина сейчас в рейсе — выбери другую или подожди.</div>';
      const c = L.upgradeCost(S, 'barn');
      h += `<div style="height:14px"></div>` + card('🏚️', `Склад: вместимость ${L.barnCap(S)}`, c == null ? 'Максимум' : `Улучшение до ${L.BARN_CAP[S.up.barn + 1]}`, c == null ? '' : btn('upg', { k: 'barn' }, `${fmt(c)} 🪙`, 'y', !canBuy(c)));
      return h;
    },
  };

  // --- Рынок
  MODALS.market = {
    title: '🏪 Городской рынок',
    tabs: [['stall', '📦 Прилавок'], ['prices', '📊 Цены'], ['orders', '📜 Заказы']],
    render(tab) {
      if (tab === 'orders') return renderOrders();
      if (tab === 'prices') {
        let h = '<div class="hint">Цены каждые 15 секунд меняются сами. Бывает спрос (цена вверх 📈) и перепроизводство (вниз 📉) — продавай, когда выгодно! Репутация даёт надбавку до +30%.</div><table>';
        for (const k of L.GOOD_KEYS) { const unlocked = L.CROPS[k] ? L.CROPS[k].level <= S.level + 2 : true; if (!unlocked) continue; const base = L.GOODS[k].sell, p = L.price(S, k), pc = Math.round((ratio(k) - 1) * 100); h += `<tr><td>${gi(k)} ${L.GOODS[k].name}</td><td><b>${p}🪙</b></td><td>${trend(k)}</td><td class="${pc >= 0 ? 'up' : 'dn'}">${pc >= 0 ? '+' : ''}${pc}%</td><td>${priceTag(k)}</td></tr>`; }
        return h + '</table>';
      }
      const keys = Object.keys(S.stall);
      let h = `<div class="hint">Прилавок: ${L.total(S.stall)} / ${L.stallCap(S)}. Привезённый товар лежит здесь, пока ты не продашь. Можно подождать выгодной цены.</div>`;
      if (!keys.length) h += '<div class="hint center">Прилавок пуст. Отвези товар со склада 🚚</div>';
      let all = 0;
      for (const k of keys) { all += L.price(S, k) * S.stall[k]; h += card(gi(k), `${L.GOODS[k].name} · ${S.stall[k]} шт.`, `${L.price(S, k)}🪙 за шт. ${trend(k)} ${priceTag(k)} · всего ${fmt(L.price(S, k) * S.stall[k])}🪙`, btn('sell', { k, n: 1 }, '×1', 'y') + ' ' + btn('sell', { k, n: 'all' }, 'Всё')); }
      if (keys.length) h += `<div style="text-align:right">${btn('sellall', {}, `Продать всё: +${fmt(all)} 🪙`, 'y')}</div>`;
      const c = L.upgradeCost(S, 'stall');
      return h + '<div style="height:14px"></div>' + card('🧺', `Прилавок: ${L.stallCap(S)} мест`, c == null ? 'Максимум' : `Улучшение до ${L.STALL_CAP[S.up.stall + 1]}`, c == null ? '' : btn('upg', { k: 'stall' }, `${fmt(c)} 🪙`, 'y', !canBuy(c)));
    },
  };
  function renderOrders() {
    let h = '<div class="hint">Заказы городских жителей: заплатят намного больше обычной цены, дадут репутацию и опыт. Товар берётся с <b>прилавка на рынке</b>. Время ограничено!</div>';
    if (!S.orders.length) h += '<div class="hint center">Новые заказы появляются каждую минуту.</div>';
    for (const o of S.orders) {
      const have = S.stall[o.good] || 0;
      h += card(gi(o.good), `${o.qty} × ${L.GOODS[o.good].name} ${o.big ? '⭐ крупный' : ''}`, `Награда: <b>${fmt(o.reward)}🪙</b> · ${o.xp}⭐ · репутация +${o.rep}${o.gems ? ' · ' + o.gems + '💎' : ''}<br>На прилавке: ${have}/${o.qty} · осталось ${mmss(o.left)}`, btn('order', { id: o.id }, 'Выполнить', have >= o.qty ? '' : 'dis'));
    }
    return h;
  }
  MODALS.orders = { title: '📜 Заказы', render: renderOrders };

  // --- Магазин семян
  MODALS.seeds = {
    title: '🌱 Семена и корм',
    tabs: [['seeds', '🌱 Семена'], ['stuff', '🧪 Товары'], ['gems', '💎 За кристаллы']],
    render(tab) {
      if (tab === 'stuff') {
        const fc = L.feedCap(S);
        return `<div class="hint">Корм нужен всем животным (кроме пчёл). Без корма они не дают продукты.</div>`
          + card('🌾', `Корм · ${S.feed}/${fc}`, `${L.FEED_COST}🪙 за порцию`, btn('feed', { n: 10 }, '×10', 'y') + ' ' + btn('feed', { n: 50 }, '×50'))
          + card('🧪', `Удобрение · ${S.items.fert} шт.`, `Ускоряет рост на 50% · ${L.FERT_COST}🪙`, btn('fert', { n: 1 }, '×1', 'y') + ' ' + btn('fert', { n: 5 }, '×5'))
          + card('🧍', `Пугало · стоит ${L.farm(S).scarecrows}`, `Защита от вредителей на этой ферме · ${L.SCARECROW_COST}🪙`, btn('scare', {}, `${L.SCARECROW_COST} 🪙`, 'y', !canBuy(L.SCARECROW_COST)));
      }
      if (tab === 'gems') {
        return `<div class="hint">Кристаллы 💎 дают за уровни, заказы, колесо и подарки. Можно купить в банке.</div>`
          + card('⚡', 'Ускорение ×2 на 5 минут', `Всё на ферме растёт вдвое быстрее · ${L.SHOP_CRYSTALS.boost}💎`, btn('gbuy', { w: 'boost' }, `${L.SHOP_CRYSTALS.boost} 💎`, 'b', S.crystals < L.SHOP_CRYSTALS.boost))
          + card('🌟', `Суперудобрение · ${S.items.superfert} шт.`, `Мгновенно доращивает растение · ${L.SHOP_CRYSTALS.superfert}💎`, btn('gbuy', { w: 'superfert' }, `${L.SHOP_CRYSTALS.superfert} 💎`, 'b', S.crystals < L.SHOP_CRYSTALS.superfert));
      }
      let h = '<div class="hint">Новые культуры открываются с уровнем. Дорогие растут дольше, но приносят больше.</div>';
      for (const k of L.CROP_ORDER) {
        const c = L.CROPS[k], lock = c.level > S.level;
        h += card(c.icon, `${c.name} ${S.seeds[k] ? '· у тебя ' + S.seeds[k] : ''}`, lock ? `Откроется на ${c.level} уровне` : `Рост ${c.growMs / 1000 >= 60 ? Math.round(c.growMs / 6000) / 10 + ' мин' : c.growMs / 1000 + ' с'} · продажа ~${c.sell}🪙${c.perennial ? ' · 5 урожаев с одного куста' : ''}`,
          lock ? '🔒' : btn('seedbuy', { k, n: 1 }, `${c.seedCost}🪙`, 'y', !canBuy(c.seedCost)) + ' ' + btn('seedbuy', { k, n: 10 }, `×10`, '', !canBuy(c.seedCost * 10)), lock ? 'lock' : '');
      }
      return h;
    },
  };

  // --- Техцентр
  const pips = (lv) => '●'.repeat(lv) + '○'.repeat(L.MACH_MAX - lv);
  function machEffect(k, lv) {
    const d = L.MACHINES[k]; if (!lv) return 'не куплено';
    if (d.kind === 'field') return `${L.areaOf(lv).length} клеток · перезарядка ${L.coolOf(k, lv)} с`;
    if (d.kind === 'auto') return `каждые ${L.autoEvery(k, lv)} с по ${L.autoN(k, lv)} шт.`;
    if (k === 'feeder') return `корма −${Math.round((1 - L.feedUseOf(lv)) * 100)}%`;
    return `скорость +${Math.round((L.speedOf(lv) - 1) * 100)}%, двойной урожай ${Math.round(L.doubleOf(lv) * 100)}%`;
  }
  function machCard(k) {
    const d = L.MACHINES[k], lv = S.up[k] || 0, c = L.machineCost(S, k);
    const lock = c && S.level < c.need, lack = c && (S.coins < c.coins || S.crystals < c.gems);
    let sub = `${d.desc}<br><span style="letter-spacing:1px;color:var(--gold)">${pips(lv)}</span> ур. ${lv}/${L.MACH_MAX} · ${machEffect(k, lv)}`;
    if (c) sub += `<br>Дальше: ${machEffect(k, lv + 1)}<br>${lock ? `<span class="bad">Нужен ${c.need} уровень игрока</span>` : `Нужен ${c.need} ур.`}${c.gems ? ` · ${c.gems}💎` : ''}`;
    let extra = '';
    if (k === 'seeder') extra = `<br>Сеет: ${S.autoSeed ? L.CROPS[S.autoSeed].icon + ' ' + L.CROPS[S.autoSeed].name : '— выбери семена'} ${btn('autoseed', {}, 'Выбрать текущие семена', 'b sm')}`;
    if (d.animals) extra = `<br><small>Для: ${d.animals.map((a) => L.ANIMALS[a].icon).join(' ')}</small>`;
    return card(d.icon, d.name, sub + extra, c ? btn('upg', { k }, `${lv ? 'Улучшить' : 'Купить'}<br>${fmt(c.coins)} 🪙${c.gems ? ' + ' + c.gems + '💎' : ''}`, 'y', lock || lack) : '<b>МАКС</b>', lock ? 'lock' : '');
  }
  MODALS.tech = {
    title: '🚜 Техцентр',
    tabs: [['tech', '🚜 Полевая'], ['animals', '🐄 Для животных'], ['auto', '🤖 Автоматика'], ['trucks', '🚚 Транспорт'], ['farm', '🏡 Ферма']],
    render(tab) {
      if (tab === 'tech') return '<div class="hint">Техника работает по площади за одно нажатие. Каждый уровень сильнее, но улучшение дорожает вдвое, с 5-го уровня нужны кристаллы, а требуемый уровень игрока растёт.</div>' + L.FIELD_TOOLS.map(machCard).join('');
      if (tab === 'animals') return '<div class="hint">Оборудование для животных. Для каждой группы своё: яйца, молоко, шерсть, мёд и трюфели. Сарай для каждого вида строится в загоне 🐄.</div>' + L.MACH_KEYS.filter((k) => L.MACHINES[k].kind === 'animal').map(machCard).join('');
      if (tab === 'auto') return '<div class="hint">Автоматика работает сама, пока ты в игре или ушёл. Каждый вид тратит монеты на топливо: если монет нет, он стоит. Сильнее с каждым уровнем.</div>' + L.AUTO_KEYS.map(machCard).join('');
      if (tab === 'trucks') {
        let h = '<div class="hint">Чем лучше машина, тем больше везёт и быстрее едет. Охрана защищает от разбойников.</div>';
        S.trucks.forEach((t, i) => {
          const I = L.TRUCKS[t.lvl], nx = L.TRUCKS[t.lvl + 1];
          h += card(I.icon, `Машина ${i + 1}: ${I.name}`, `Возит до ${I.cap} шт. · в одну сторону ${I.trip} с${nx ? `<br>Дальше: ${nx.name} (до ${nx.cap}, ${nx.trip} с)` : ''}`, nx ? btn('truckup', { i }, `${fmt(nx.cost)} 🪙`, 'y', !canBuy(nx.cost) || !L.truckFree(S, i)) : '<b>МАКС</b>');
        });
        const slot = L.TRUCK_SLOTS[S.trucks.length];
        if (slot) h += card('➕', 'Ещё одна машина', slot.level > S.level ? `Откроется на ${slot.level} уровне` : 'Две машины возят одновременно', btn('truckbuy', {}, `${fmt(slot.cost)} 🪙`, 'y', slot.level > S.level || !canBuy(slot.cost)), slot.level > S.level ? 'lock' : '');
        const g = L.upgradeCost(S, 'guard');
        return h + card('💂', `Охрана машин · ур. ${S.up.guard}`, `Шанс отбить разбойников: ${['0%', '50%', '85%'][S.up.guard]}`, g == null ? '<b>МАКС</b>' : btn('upg', { k: 'guard' }, `${fmt(g)} 🪙`, 'y', !canBuy(g)));
      }
      const f = L.farm(S);
      const rows = [['plot', '🟫', `Участок фермы ${f.w}×${f.h}`, 'Больше места для грядок'], ['can', '🪣', `Лейка · вода на ${L.WATER_MS[S.up.can] / 1000} с`, 'Полив держится дольше, растения растут быстрее'], ['barn', '🏚️', `Склад ${L.barnCap(S)}`, 'Больше товара'], ['stall', '🧺', `Прилавок ${L.stallCap(S)}`, 'Больше товара на рынке']];
      return '<div class="hint">Улучшения для текущей фермы и общего хозяйства.</div>' + rows.map(([k, ic, n, d]) => { const c = L.upgradeCost(S, k); return card(ic, n, d, c == null ? '<b>МАКС</b>' : btn('upg', { k }, `${fmt(c)} 🪙`, 'y', !canBuy(c))); }).join('');
    },
  };

  // --- Банк
  MODALS.bank = {
    title: '🏦 Банк',
    render() {
      let h = `<div class="hint">Обмен валют. Монеты 🪙 — основные деньги, кристаллы 💎 — редкие, билеты 🎟️ — для колеса удачи.</div>`;
      h += card('💎→🪙', 'Продать кристаллы', `1 💎 = ${L.EXCHANGE.gemCoins} 🪙`, btn('ex', { d: 'g2c', n: 1 }, '×1', 'y', S.crystals < 1) + ' ' + btn('ex', { d: 'g2c', n: 10 }, '×10', '', S.crystals < 10));
      h += card('🪙→💎', 'Купить кристаллы', `1 💎 = ${L.EXCHANGE.coinsForGem} 🪙`, btn('ex', { d: 'c2g', n: 1 }, '×1', 'b', !canBuy(L.EXCHANGE.coinsForGem)) + ' ' + btn('ex', { d: 'c2g', n: 5 }, '×5', 'b', !canBuy(L.EXCHANGE.coinsForGem * 5)));
      h += `<div class="hint" style="margin-top:12px"><b>Статистика</b><br>Заработано на рынке: ${fmt(S.stats.earned)} 🪙 · Собрано: ${fmt(S.stats.harvested)} · Рейсов: ${S.stats.trips} · Золотых: ${S.stats.golden} · Прокруток: ${S.stats.spins}<br>Репутация ${S.rep} → надбавка к ценам +${Math.round(L.repBonus(S) * 100)}%</div>`;
      return h;
    },
  };

  // --- Колесо удачи
  function wheelHtml() {
    const n = L.WHEEL.length, cols = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f4511e', '#3949ab', '#fdd835', '#546e7a'];
    const grad = L.WHEEL.map((p, i) => `${cols[i % cols.length]} ${i * 360 / n}deg ${(i + 1) * 360 / n}deg`).join(',');
    const icons = L.WHEEL.map((p, i) => `<i style="transform:rotate(${i * 360 / n + 180 / n}deg)"><span>${p.icon}</span></i>`).join('');
    return `<div class="wheelbox"><div class="pointer">▼</div><div class="wheel" id="wheel" style="background:conic-gradient(${grad});transform:rotate(${ui.wheelAngle}deg)">${icons}</div></div>`;
  }
  MODALS.casino = {
    title: '🎰 Колесо удачи',
    render() {
      let h = wheelHtml();
      if (S.pending && !ui.spinning) {
        h += `<div class="center big">Выигрыш ${fmt(S.pending.coins)} 🪙!</div><div class="hint center">Забрать или рискнуть? 45% — приз ×2, иначе — всё сгорит.</div><div style="display:flex;gap:10px;justify-content:center">${btn('take', {}, `Забрать ${fmt(S.pending.coins)}`, 'y')}${btn('risk', {}, `Рискнуть → ${fmt(S.pending.coins * 2)}`, 'r')}</div>`;
      } else h += `<div class="center">${btn('spin', {}, `Крутить · 🎟️ ${S.tickets}`, 'y', ui.spinning || S.tickets < 1)}</div><div class="hint center">Билеты дают за уровни, золотые урожаи, заказы, рейсы и ежедневный подарок. Джекпот: 5000 🪙 + 10 💎</div>`;
      h += `<div class="hint"><b>Призы:</b> ${L.WHEEL.map((p) => p.icon + ' ' + p.text).join(' · ')}</div>`;
      if (S.daily.key !== todayKey()) h += `<div class="center">${btn('daily', {}, '🎁 Забрать ежедневный подарок', 'b')}</div>`;
      return h;
    },
  };

  // --- Животные
  MODALS.animals = {
    title: '🐄 Загон и сараи',
    render() {
      const fc = L.feedCap(S);
      let h = `<div class="hint">У каждого вида свой сарай: без него животных не купить, а уровень сарая даёт места (до 10 уровня). Нужен корм: <b>${Math.floor(S.feed)}/${fc}</b> ${btn('feed', { n: 10 }, 'Корм ×10 · ' + L.FEED_COST * 10 + '🪙', 'y', !canBuy(L.FEED_COST * 10))}<br>Оборудование для животных — в Техцентре.</div>`;
      for (const k of L.ANIMAL_ORDER) {
        const a = L.ANIMALS[k], n = S.animals[k] || 0, p = S.prod[k] || { acc: 0, pending: 0 }, lock = a.level > S.level;
        const prod = L.GOODS[a.product], bl = S.barns[k] || 0, cap = L.animalCap(S, k), bc = L.barnCost(S, k), mk = L.animalMachine(k);
        let sub = lock ? `Откроется на ${a.level} уровне` : `${prod.icon} ${prod.name} каждые ${Math.round(a.every / 1000)} с · на рынке ~${prod.sell}🪙<br>🏚️ ${a.building}: ${bl ? `ур. ${bl}/${L.MACH_MAX} · ${n}/${cap} мест` : 'не построен'}${n ? ` · готово: ${p.pending}` : ''}`;
        if (!lock && bc) sub += `<br><small>${bl ? 'Улучшение' : 'Постройка'}: ${bc.need > S.level ? `<span class="bad">нужен ${bc.need} ур.</span>` : `нужен ${bc.need} ур.`}${bc.gems ? ` · ${bc.gems}💎` : ''}</small>`;
        if (!lock && mk && S.up[mk]) sub += `<br><small>${L.MACHINES[mk].icon} ${L.MACHINES[mk].name} ур. ${S.up[mk]}</small>`;
        const col = (x) => `<div style="display:flex;flex-direction:column;gap:4px;align-items:stretch">${x}</div>`;
        const barnBtn = bc ? btn('barn', { k }, `${bl ? 'Улучшить сарай' : 'Построить сарай'}<br>${fmt(bc.coins)}🪙${bc.gems ? ' + ' + bc.gems + '💎' : ''}`, bl ? 'b sm' : 'y', bc.need > S.level || S.coins < bc.coins || S.crystals < bc.gems) : '';
        h += card(a.icon, `${a.name}`, sub, lock ? '🔒' : col(`${p.pending ? btn('collect', { k }, `Собрать ${p.pending}`, '') : ''}${bl ? btn('abuy', { k }, `Купить ${fmt(a.cost)}🪙`, 'y sm', n >= cap || !canBuy(a.cost)) : ''}${barnBtn}`), lock ? 'lock' : '');
      }
      return h;
    },
  };

  // --- Уровни
  MODALS.levels = {
    title: '⭐ Уровни и награды',
    render() {
      let h = `<div class="hint">Опыт даёт всё: посадка, сбор, заказы. За каждый уровень — 💎 кристаллы и 🎟️ билет.</div>`;
      for (let lv = 2; lv <= 24; lv++) { const u = unlocksAt(lv); h += card(String(lv), `Уровень ${lv}${lv <= S.level ? ' ✅' : ''}`, `${u.length ? u.join(', ') : 'Больше поливалок и бонусов'} · награда ${L.levelGems(lv)}💎`, '', lv <= S.level ? '' : lv === S.level + 1 ? '' : 'lock'); }
      return h;
    },
  };

  // --- Покупка фермы
  MODALS.buyfarm = {
    title: '🗺️ Новая ферма',
    render() {
      const d = L.FARM_DEFS.find((x) => x.id === ui.buyId); if (!d) return '';
      return `<div class="center" style="font-size:60px">${d.id === 'valley' ? '🌄' : '⛰️'}</div><div class="center big">${d.name}</div><div class="hint center">Отдельная ферма на карте города. Растения здесь растут на ${Math.round((d.bonus - 1) * 100)}% быстрее!<br>Нужен ${d.level} уровень · цена ${fmt(d.cost)} 🪙</div><div class="center">${btn('farmbuy', { id: d.id }, `Купить за ${fmt(d.cost)} 🪙`, 'y', S.level < d.level || !canBuy(d.cost))}</div>`;
    },
  };

  // --- Меню
  MODALS.menu = {
    title: '☰ Меню',
    render() {
      let h = card('🔊', 'Звук', ui.sound ? 'Включён' : 'Выключен', btn('snd', {}, ui.sound ? 'Выключить' : 'Включить', 'y'));
      h += card('❓', 'Как играть', 'Правила и подсказки', btn('modal', { id: 'help' }, 'Открыть', 'b'));
      h += card('🌍', 'Мои фермы', S.farms.map((f, i) => (i === S.cur ? '▶ ' : '') + L.FARM_DEFS.find((d) => d.id === f.id).name).join(' · '), '');
      h += card('🗑️', 'Начать заново', 'Весь прогресс будет удалён', btn('reset', {}, ui.confirm === 'reset' ? 'Точно? Нажми ещё раз' : 'Сбросить', 'r'));
      return h;
    },
  };
  MODALS.help = {
    title: '❓ Как играть',
    render() {
      return `<div class="hint" style="font-size:15px">
        <b>1.</b> На ферме выбери ⛏️ и копай землю, потом 🌱 — сажай семена, 💧 — поливай (полив ускоряет рост).<br>
        <b>2.</b> Когда созреет — 🧺 собери. Урожай попадает на <b>склад</b>.<br>
        <b>3.</b> Продать урожай можно <b>только на рынке в городе</b>: открой «📦 Склад», выбери машину, загрузи и отправь 🚚. В пути бывают пробки, поломки и разбойники.<br>
        <b>4.</b> На рынке цены меняются — продавай, когда выгодно. Выполняй 📜 заказы — они платят в разы больше.<br>
        <b>5.</b> Копи монеты 🪙 → покупай животных, 🚜 трактор и 🌾 комбайн, машины побольше, новые фермы.<br>
        <b>6.</b> Билеты 🎟️ крутят 🎰 колесо: можно рискнуть и удвоить приз! 💎 кристаллы дают ускорение ×2.<br>
        Нажми на здание в городе — откроется магазин.</div>${btn('close', {}, 'Поехали!', 'y')}`;
    },
  };

  // ---------------------------------------------------------------- обработчики
  const A = {
    close: closeModal,
    modal: (d) => openModal(d.id),
    tab: (d) => { ui.tab[ui.modal] = d.t; ui.confirm = null; renderModal(true); },
    mode: (d) => goMode(d.m),
    tool: (d) => { ui.tool = d.t; lastBar = ''; if (d.t === 'sprinkler' && S.level < L.SPRINKLER.need) toast(`Поливалки с ${L.SPRINKLER.need} уровня`, 'bad'); if (L.MACHINES[d.t] && !S.up[d.t]) { toast(`${L.MACHINES[d.t].name} покупается в Техцентре 🏙️ (с ${L.MACHINES[d.t].need} уровня)`, 'bad'); } pickSeed(); renderBar(); },
    seedpick: (d) => { if (!S.seeds[d.k]) { if (L.CROPS[d.k].level > S.level) return toast(`С ${L.CROPS[d.k].level} уровня`, 'bad'); toast('Семян нет — купи в магазине', 'bad'); return openModal('seeds', 'seeds'); } ui.seed = d.k; lastSeed = ''; renderBar(); },
    daily: () => { const r = L.claimDaily(S, todayKey()); if (r.ok) { sfx.coin(); toast(`🎁 Подарок: ${r.coins}🪙 ${r.gems}💎 ${r.tickets}🎟️`, 'good'); } else toast(r.msg, 'bad'); },
    ld: (d) => {
      const tr = L.TRUCKS[S.trucks[ui.truck].lvl], have = S.goods[d.k] || 0; let cur = ui.load[d.k] || 0;
      const used = Object.values(ui.load).reduce((a, b) => a + b, 0) - cur, room = Math.max(0, tr.cap - used);
      cur = d.d === 'max' ? Math.min(have, room) : Math.max(0, Math.min(have, room, cur + (+d.d)));
      if (cur > 0) ui.load[d.k] = cur; else delete ui.load[d.k]; renderModal();
    },
    ldall: () => { const tr = L.TRUCKS[S.trucks[ui.truck].lvl]; let room = tr.cap; ui.load = {}; const ks = Object.keys(S.goods).sort((a, b) => L.price(S, b) - L.price(S, a)); for (const k of ks) { const n = Math.min(S.goods[k], room); if (n > 0) { ui.load[k] = n; room -= n; } } renderModal(); },
    ldclr: () => { ui.load = {}; renderModal(); },
    truck: (d) => { ui.truck = +d.i; ui.load = {}; renderModal(); },
    send: () => {
      const r = L.startTrip(S, ui.truck, ui.load);
      if (!r.ok) return toast(r.msg, 'bad');
      ui.load = {}; sfx.coin(); toast(`${L.TRUCKS[S.trucks[ui.truck].lvl].icon} Машина выехала на рынок!${r.trip.ev ? ' ' + r.trip.ev.text : ''}`, 'good'); closeModal(); goMode('city');
    },
    sell: (d) => { const r = L.sellStall(S, d.k, d.n === 'all' ? 'all' : +d.n); if (r.ok) { sfx.coin(); toast(`+${fmt(r.gain)} 🪙`, 'good'); } else toast(r.msg, 'bad'); },
    sellall: () => { const r = L.sellAllStall(S); if (r.ok) { sfx.coin(); toast(`Продано на ${fmt(r.gain)} 🪙`, 'good'); } else toast(r.msg, 'bad'); },
    order: (d) => { const r = L.fulfillOrder(S, +d.id); if (r.ok) { sfx.coin(); toast(`Заказ выполнен! +${fmt(r.reward)}🪙 +${r.xp}⭐${r.gems ? ' +' + r.gems + '💎' : ''}`, 'good'); if (r.levelUp) onLevelUp(); } else toast(r.msg, 'bad'); },
    seedbuy: (d) => { const r = L.buySeeds(S, d.k, +d.n); r.ok ? sfx.plant() : toast(r.msg, 'bad'); pickSeed(); },
    feed: (d) => { const r = L.buyFeed(S, +d.n); r.ok ? sfx.plant() : toast(r.msg, 'bad'); },
    fert: (d) => { const r = L.buyFert(S, +d.n); r.ok ? sfx.plant() : toast(r.msg, 'bad'); },
    scare: () => { const r = L.buyScarecrow(S); r.ok ? sfx.plant() : toast(r.msg, 'bad'); },
    gbuy: (d) => { const r = L.buyGems(S, d.w, 1); if (r.ok) { sfx.level(); toast(d.w === 'boost' ? '⚡ Рост ×2 на 5 минут!' : '🌟 Суперудобрение добавлено', 'good'); } else toast(r.msg, 'bad'); },
    upg: (d) => { const r = L.buyUpgrade(S, d.k); if (r.ok) { sfx.level(); toast('Улучшено!', 'good'); lastBar = ''; } else toast(r.msg, 'bad'); },
    truckup: (d) => { const r = L.upgradeTruck(S, +d.i); r.ok ? (sfx.level(), toast('Машина улучшена!', 'good')) : toast(r.msg, 'bad'); },
    truckbuy: () => { const r = L.buyTruckSlot(S); r.ok ? (sfx.level(), toast('Новая машина в гараже!', 'good')) : toast(r.msg, 'bad'); },
    barn: (d) => { const r = L.buyBarn(S, d.k); r.ok ? (sfx.level(), toast('Сарай готов!', 'good')) : toast(r.msg, 'bad'); },
    autoseed: () => { pickSeed(); if (!ui.seed) return toast('Сначала выбери семена на панели семян (нужны в запасе)', 'bad'); S.autoSeed = ui.seed; toast(`Автосеялка будет сеять ${L.CROPS[ui.seed].icon}`, 'good'); },
    abuy: (d) => { const r = L.buyAnimal(S, d.k); r.ok ? sfx.coin() : toast(r.msg, 'bad'); },
    collect: (d) => { const r = L.collect(S, d.k); if (r.ok) { sfx.harvest(); toast(`+${r.n} ${gi(r.item)}`, 'good'); } else toast(r.msg, 'bad'); },
    ex: (d) => { const r = L.exchange(S, d.d, +d.n); r.ok ? sfx.coin() : toast(r.msg, 'bad'); },
    farmbuy: (d) => { const r = L.unlockFarm(S, d.id); if (r.ok) { sfx.level(); toast('Новая ферма твоя! 🎉', 'good'); closeModal(); world.refreshCity(S); goMode('farm'); } else toast(r.msg, 'bad'); },
    snd: () => { ui.sound = !ui.sound; renderModal(); },
    reset: () => { if (ui.confirm !== 'reset') { ui.confirm = 'reset'; renderModal(); return; } store.del(SAVE); location.reload(); },
    spin: () => {
      if (ui.spinning) return;
      ui.hold = { coins: S.coins, crystals: S.crystals, tickets: S.tickets - 1 };
      const r = L.spin(S); if (!r.ok) { ui.hold = null; return toast(r.msg, 'bad'); }
      const idx = L.WHEEL.findIndex((p) => p.id === r.prize.id), step = 360 / L.WHEEL.length;
      ui.wheelAngle = Math.ceil(ui.wheelAngle / 360) * 360 + 360 * 5 + (360 - (idx * step + step / 2));
      ui.spinning = true; renderModal(); const w = $('wheel'); if (w) { w.style.transition = 'none'; w.getBoundingClientRect(); w.style.transition = ''; }
      requestAnimationFrame(() => { const w2 = $('wheel'); if (w2) w2.style.transform = `rotate(${ui.wheelAngle}deg)`; });
      let n = 0; const tk = setInterval(() => { beep(500 + (n++ % 6) * 40, 0.04, 'square', 0.02); }, 140);
      setTimeout(() => {
        clearInterval(tk); ui.spinning = false; ui.hold = null; sfx[r.prize.none ? 'bad' : 'level']();
        toast(r.prize.none ? '💨 Пусто... повезёт в следующий раз' : `${r.prize.icon} Выпало: ${r.prize.text}!`, r.prize.none ? 'bad' : 'good'); if (ui.modal === 'casino') renderModal();
      }, 4200);
    },
    take: () => { const r = L.resolvePrize(S, false); if (r.ok) { sfx.coin(); toast(`+${fmt(r.won)} 🪙`, 'good'); } renderModal(); },
    risk: () => { const r = L.resolvePrize(S, true); if (r.ok) { r.doubled ? (sfx.level(), toast(`🔥 УДВОИЛ! +${fmt(r.won)} 🪙`, 'good')) : (sfx.bad(), toast('💥 Не повезло — приз сгорел', 'bad')); } renderModal(); },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.classList.contains('dis')) return;
    const f = A[el.dataset.act]; if (!f) return;
    f(el.dataset); lastBar = ''; lastSeed = ''; renderHud(); renderBar(); if (ui.modal) renderModal();
  });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });

  function onBuilding(id) {
    if (ui.modal) return;
    const fd = L.FARM_DEFS.find((d) => d.id === id);
    if (fd) {
      const i = S.farms.findIndex((f) => f.id === id);
      if (i >= 0) { L.setFarm(S, i); goMode('farm'); }
      else { ui.buyId = id; openModal('buyfarm'); }
      return;
    }
    openModal(id);
  }

  // ---------------------------------------------------------------- главный цикл
  let last = performance.now(), acc = 0, uiAcc = 0, modalAcc = 0, saveAcc = 0;
  function frame(now) {
    const dt = Math.min(0.2, (now - last) / 1000); last = now;
    acc += dt * 1000; uiAcc += dt; modalAcc += dt; saveAcc += dt;
    if (acc >= 100) { L.tick(S, acc); acc = 0; }
    if (uiAcc >= 0.25) {
      uiAcc = 0; renderHud(); renderBar();
      for (const l of S.log) if (l.n > ui.lastLog) { ui.lastLog = l.n; toast(l.msg, l.kind === 'good' ? 'good' : l.kind === 'bad' ? 'bad' : ''); if (l.kind === 'good') sfx.coin(); else if (l.kind === 'bad') sfx.bad(); }
    }
    if (modalAcc >= 1 && ui.modal && !ui.spinning) { modalAcc = 0; renderModal(); }
    if (saveAcc >= 8) { saveAcc = 0; save(); }
    world.update(dt, S);
    requestAnimationFrame(frame);
  }

  function start() {
    const d = load();
    S = d ? L.migrate(d.s) : L.createState();
    if (d) { const away = Date.now() - d.t; if (away > 30000) { const before = { c: S.coins, g: L.total(S.goods) }; L.catchUp(S, away); toast(`С возвращением! Тебя не было ${Math.round(away / 60000)} мин — работа не стояла 🌾`, 'good'); } }
    ui.lastLog = S.logN || 0;
    try {
      world = window.World3D.create($('gl'), $('labels'), { onTile, onBuilding, onHover, onPen: () => { if (!ui.modal) openModal('animals'); } });
    } catch (err) { console.error(err); $('nogl').hidden = false; return; }
    world.setMode('farm', S); world.refreshCity(S);
    pickSeed();
    window.__world = world;
    renderHud(); renderBar();
    if (!store.get(HELP)) { store.set(HELP, '1'); openModal('help'); }
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    requestAnimationFrame(frame);
  }
  // смена фермы из города должна пересобрать сцену
  window.addEventListener('load', start);
})();
