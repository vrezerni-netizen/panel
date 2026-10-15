/* Весёлая ферма — графика, ввод, интерфейс. Вся игровая логика в logic.js. */
(() => {
  'use strict';
  const L = FarmLogic;
  const S = 48;                // размер клетки (логические пиксели)
  const YARD = 2 * S;          // двор с постройками над полем
  const KEY = 'farm_save_v1';
  const $ = (s) => document.querySelector(s);

  let state, tool = 'hoe', sel = 'wheat', hover = null, muted = false, shake = 0;
  const particles = [], floats = [];

  // ---------------------------------------------------------------- сохранение
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.state && d.state.v === 1) {
        state = d.state; tool = d.tool || tool; sel = d.sel || sel; muted = !!d.muted;
        const away = Date.now() - d.t;
        if (away > 60000) {
          L.catchUp(state, away);
          const m = Math.round(Math.min(away, L.OFFLINE_CAP) / 60000);
          setTimeout(() => toast(`Пока тебя не было (${m >= 60 ? Math.floor(m / 60) + ' ч ' : ''}${m % 60} мин), урожай рос 🌱`), 600);
        }
      }
    } catch { /* повреждённое сохранение — начнём заново */ }
    if (!state) state = L.createState();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), state, tool, sel, muted })); } catch { /* ignore */ } }

  // ---------------------------------------------------------------- звук
  let ac;
  function beep(f, dur, type = 'square', vol = 0.05, slide = 0) {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.linearRampToValueAtTime(f + slide, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
    } catch { /* звук недоступен */ }
  }
  const SFX = {
    dig: () => beep(130, 0.12, 'sawtooth', 0.07, -50),
    plant: () => beep(520, 0.1, 'triangle', 0.07),
    water: () => beep(720, 0.1, 'sine', 0.05, -350),
    harvest: () => { beep(660, 0.08, 'square', 0.05); setTimeout(() => beep(880, 0.12, 'square', 0.05), 80); },
    coin: () => { beep(988, 0.07, 'square', 0.05); setTimeout(() => beep(1319, 0.16, 'square', 0.05), 70); },
    no: () => beep(160, 0.15, 'square', 0.05),
    level: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.08), i * 110)),
  };

  // ---------------------------------------------------------------- спрайты (рисуются кодом)
  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sprite(fn) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d');
    fn((px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); });
    return c;
  }
  const SP = { grass: [], soil: null, wet: null, crop: {}, drop: null, star: null };
  function buildSprites() {
    for (let v = 0; v < 5; v++) {
      const r = rng(100 + v);
      SP.grass.push(sprite((p) => {
        p(0, 0, 16, 16, '#74c365');
        for (let i = 0; i < 9; i++) p((r() * 15) | 0, (r() * 15) | 0, 1, 1, r() > 0.5 ? '#62b356' : '#8bd47a');
        if (v === 3) { p(7, 9, 1, 3, '#3f9b3f'); p(6, 7, 3, 3, '#fff'); p(7, 8, 1, 1, '#f5b932'); }
        if (v === 4) { p(10, 5, 1, 3, '#3f9b3f'); p(9, 3, 3, 3, '#ff8fb1'); p(10, 4, 1, 1, '#fff2a8'); }
      }));
    }
    const soil = (base, dark, light) => sprite((p) => {
      p(0, 0, 16, 16, base);
      for (const y of [3, 7, 11]) { p(1, y, 14, 1, dark); p(1, y + 1, 14, 1, light); }
      p(0, 0, 16, 1, dark); p(0, 15, 16, 1, dark); p(0, 0, 1, 16, dark); p(15, 0, 1, 16, dark);
    });
    SP.soil = soil('#8a5a30', '#6e4520', '#9d6c3c');
    SP.wet = soil('#5f3c1c', '#4a2d12', '#6c4524');
    const tint = { wheat: '#e8c14a', carrot: '#f08a2c', corn: '#f4d63c', strawberry: '#e23b3b', pumpkin: '#f08a2c' };
    for (const key of L.CROP_ORDER) {
      const st = [];
      st.push(sprite((p) => { p(7, 10, 2, 3, '#4caf50'); p(6, 9, 1, 1, '#66c866'); p(9, 9, 1, 1, '#66c866'); }));
      st.push(sprite((p) => { p(7, 6, 2, 7, '#3f9b3f'); p(5, 8, 2, 2, '#4caf50'); p(9, 7, 2, 2, '#4caf50'); }));
      st.push(sprite((p) => { p(7, 4, 2, 9, '#3f9b3f'); p(4, 6, 3, 2, '#4caf50'); p(9, 5, 3, 2, '#4caf50'); p(5, 9, 2, 2, '#4caf50'); p(9, 9, 2, 2, '#4caf50'); p(7, 3, 2, 2, tint[key]); }));
      st.push(sprite((p) => ripe(p, key)));
      SP.crop[key] = st;
    }
    SP.drop = sprite((p) => { p(7, 3, 2, 2, '#58b8ff'); p(6, 5, 4, 4, '#58b8ff'); p(7, 9, 2, 1, '#58b8ff'); p(7, 5, 1, 2, '#c9ecff'); });
    SP.star = sprite((p) => { p(7, 2, 2, 12, '#ffe066'); p(2, 7, 12, 2, '#ffe066'); p(5, 5, 6, 6, '#fff3b0'); });
  }
  function ripe(p, key) {
    if (key === 'wheat') { for (const x of [3, 6, 9, 12]) { p(x, 6, 1, 8, '#d9a93a'); p(x - 1, 2, 3, 5, '#f2d36b'); p(x, 1, 1, 1, '#f2d36b'); } p(2, 12, 12, 2, '#6fbf4a'); }
    else if (key === 'carrot') { p(5, 3, 2, 5, '#3f9b3f'); p(7, 2, 2, 6, '#4caf50'); p(9, 3, 2, 5, '#3f9b3f'); p(5, 8, 6, 3, '#f08a2c'); p(6, 11, 4, 2, '#e07818'); p(7, 13, 2, 1, '#e07818'); }
    else if (key === 'corn') { p(7, 1, 2, 13, '#3f9b3f'); p(3, 4, 4, 2, '#4caf50'); p(9, 6, 4, 2, '#4caf50'); p(9, 8, 3, 5, '#f4d63c'); p(4, 9, 3, 4, '#f4d63c'); p(10, 9, 1, 3, '#d9b82a'); }
    else if (key === 'strawberry') { p(2, 6, 12, 7, '#2f8f3f'); p(3, 5, 10, 2, '#3fa84f'); for (const [x, y] of [[4, 8], [7, 7], [10, 9], [6, 10], [11, 7]]) { p(x, y, 2, 2, '#e23b3b'); p(x, y, 1, 1, '#ff7a7a'); } }
    else if (key === 'pumpkin') { p(3, 7, 10, 6, '#f08a2c'); p(2, 8, 12, 4, '#f08a2c'); p(5, 7, 1, 6, '#d9701a'); p(8, 7, 1, 6, '#d9701a'); p(11, 7, 1, 6, '#d9701a'); p(7, 5, 2, 3, '#3f7f2f'); }
  }
  const sprBig = (c, x, y, w = S, h = S) => ctx.drawImage(c, x, y, w, h);

  // ---------------------------------------------------------------- canvas
  const cv = $('#cv'); const ctx = cv.getContext('2d');
  let logW = 0, logH = 0;
  function resize() {
    logW = state.w * S; logH = YARD + state.h * S;
    const stage = $('#stage').getBoundingClientRect();
    const k = Math.min((stage.width - 14) / logW, (stage.height - 14) / logH);
    const cssW = Math.max(160, Math.floor(logW * k)), cssH = Math.floor(logH * (cssW / logW));
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  }

  // ---------------------------------------------------------------- отрисовка
  function darkness() {
    const hours = ((state.clock / L.DAY_MS) * 24 + 6) % 24;
    return Math.max(0, (Math.cos((hours / 24) * Math.PI * 2) - 0.2) / 0.8);
  }
  function drawCoop(x, y, w, h, unlocked, count, pending, now) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#c98b4a'; ctx.fillRect(4, 22, w - 8, h - 24);
    ctx.fillStyle = '#a56d33'; for (let i = 0; i < 6; i++) ctx.fillRect(4, 26 + i * 10, w - 8, 2);
    ctx.fillStyle = '#b23a3a'; ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(w / 2, 2); ctx.lineTo(w, 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8c2a2a'; ctx.fillRect(0, 22, w, 4);
    ctx.fillStyle = '#5a3414'; ctx.fillRect(w / 2 - 9, h - 26, 18, 24);
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(w / 2 - 4, 14, 8, 6);
    for (let i = 0; i < count; i++) { // курочки гуляют перед домиком
      const bx = 10 + ((i * 23 + Math.sin(now / 700 + i * 2) * 8 + 40) % (w - 20)), by = h - 8 - (i % 2) * 4;
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by - 8, 9, 7); ctx.fillRect(bx + 6, by - 12, 5, 5);
      ctx.fillStyle = '#e24c4c'; ctx.fillRect(bx + 8, by - 14, 2, 2);
      ctx.fillStyle = '#f5b932'; ctx.fillRect(bx + 11, by - 10, 2, 2); ctx.fillRect(bx + 2, by - 1, 1, 3); ctx.fillRect(bx + 6, by - 1, 1, 3);
    }
    ctx.restore();
    if (!unlocked) lockOverlay(x, y, w, h, L.ANIMALS.chicken.level);
    else if (pending > 0) badge(x + w - 20, y + 16 + Math.sin(now / 250) * 3, '🥚', pending);
  }
  function drawBarn(x, y, w, h, unlocked, count, pending, now) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(4, 24, w - 8, h - 26);
    ctx.fillStyle = '#8c2a20'; ctx.beginPath(); ctx.moveTo(0, 28); ctx.lineTo(w * 0.2, 4); ctx.lineTo(w * 0.8, 4); ctx.lineTo(w, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(w / 2 - 14, h - 34, 28, 32);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.strokeRect(w / 2 - 12, h - 32, 24, 28);
    ctx.beginPath(); ctx.moveTo(w / 2 - 12, h - 32); ctx.lineTo(w / 2 + 12, h - 4); ctx.moveTo(w / 2 + 12, h - 32); ctx.lineTo(w / 2 - 12, h - 4); ctx.stroke();
    for (let i = 0; i < count; i++) { // коровы у хлева
      const bx = w - 6 - i * 30 + Math.sin(now / 900 + i) * 3, by = h - 4;
      ctx.fillStyle = '#fff'; ctx.fillRect(bx - 22, by - 16, 22, 11); ctx.fillRect(bx - 4, by - 20, 10, 9);
      ctx.fillStyle = '#333'; ctx.fillRect(bx - 17, by - 14, 6, 5); ctx.fillRect(bx - 8, by - 10, 4, 4);
      ctx.fillStyle = '#f0a8b8'; ctx.fillRect(bx + 2, by - 14, 4, 3);
      ctx.fillStyle = '#fff'; for (const lx of [-20, -14, -6, -2]) ctx.fillRect(bx + lx, by - 5, 3, 5);
    }
    ctx.restore();
    if (!unlocked) lockOverlay(x, y, w, h, L.ANIMALS.cow.level);
    else if (pending > 0) badge(x + w - 20, y + 16 + Math.sin(now / 250 + 1) * 3, '🥛', pending);
  }
  function lockOverlay(x, y, w, h, lvl) {
    ctx.fillStyle = 'rgba(40,40,40,.6)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔒 Ур. ' + lvl, x + w / 2, y + h / 2 + 5);
  }
  function badge(x, y, icon, n) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - 14, y - 10, 40, 24, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a2e12'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(icon + n, x + 6, y + 7);
  }
  const buildings = () => ({ coop: [8, 4, 104, 88], barn: [Math.max(130, state.w * S * 0.38), 0, 128, 92] });

  function render(now) {
    ctx.setTransform(cv.width / logW, 0, 0, cv.height / logH, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // двор
    ctx.fillStyle = '#8fd47e'; ctx.fillRect(0, 0, logW, YARD);
    for (let x = 0; x < state.w; x++) for (let y = 0; y < 2; y++) sprBig(SP.grass[(x * 7 + y * 3) % 3], x * S, y * S);
    ctx.fillStyle = '#c99a5b'; for (let x = 0; x < logW; x += 14) ctx.fillRect(x, YARD - 14, 8, 14);
    ctx.fillStyle = '#a97b3f'; ctx.fillRect(0, YARD - 9, logW, 3);
    const b = buildings();
    drawCoop(b.coop[0], b.coop[1], b.coop[2], b.coop[3], state.level >= L.ANIMALS.chicken.level, state.animals.chicken, state.prod.chicken.pending, now);
    drawBarn(b.barn[0], b.barn[1], b.barn[2], b.barn[3], state.level >= L.ANIMALS.cow.level, state.animals.cow, state.prod.cow.pending, now);
    // поле
    for (let y = 0; y < state.h; y++) for (let x = 0; x < state.w; x++) {
      const t = state.tiles[y * state.w + x], px = x * S, py = YARD + y * S;
      if (t.k === 'grass') sprBig(SP.grass[(x * 7 + y * 13) % 5], px, py);
      else {
        sprBig(t.k === 'crop' && t.water > 0 ? SP.wet : SP.soil, px, py);
        if (t.k === 'crop') {
          const st = L.stage(t), bob = st === 3 ? Math.sin(now / 300 + x + y) * 1.5 : 0;
          sprBig(SP.crop[t.crop][st], px, py - 2 + bob);
          if (st === 3) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 250 + x * 2); sprBig(SP.star, px + S - 18, py + 2, 14, 14); ctx.globalAlpha = 1; }
          else {
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(px + 8, py + S - 8, S - 16, 5);
            ctx.fillStyle = '#7ddc5b'; ctx.fillRect(px + 8, py + S - 8, (S - 16) * L.progressOf(t), 5);
            if (t.water <= 0) sprBig(SP.drop, px + S - 18, py + 2, 16, 16);
          }
        }
      }
    }
    if (hover && hover.ty >= 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(hover.tx * S + 2, YARD + hover.ty * S + 2, S - 4, S - 4); }
    // частицы
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); }
    ctx.globalAlpha = 1;
    for (const f of floats) { ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.5)); ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#3b2610'; ctx.strokeText(f.t, f.x, f.y); ctx.fillStyle = f.c; ctx.fillText(f.t, f.x, f.y); }
    ctx.globalAlpha = 1;
    // ночь
    const d = darkness();
    if (d > 0.02) { ctx.fillStyle = `rgba(12,20,70,${d * 0.5})`; ctx.fillRect(0, 0, logW, logH); }
  }

  // ---------------------------------------------------------------- эффекты
  function burst(x, y, color, n, spread = 40) {
    for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * spread, g: 90, life: 0.5 + Math.random() * 0.4, max: 0.9, c: color, s: 3 });
  }
  function floatText(x, y, t, c = '#fff') { floats.push({ x, y, t, c, life: 1.1 }); }
  const tileXY = (tx, ty) => [tx * S + S / 2, YARD + ty * S + S / 2];
  function stepFx(dt) {
    for (const p of particles) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (const f of floats) { f.life -= dt; f.y -= 22 * dt; }
    while (particles.length && particles[0].life <= 0) particles.shift();
    for (let i = floats.length - 1; i >= 0; i--) if (floats[i].life <= 0) floats.splice(i, 1);
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
  }

  // ---------------------------------------------------------------- действия игрока
  function apply(tx, ty) {
    const [cx, cy] = tileXY(tx, ty);
    const hadLevel = state.level;
    const r = L.act(state, tool, tx, ty, sel);
    if (!r.ok) { floatText(cx, cy - 8, r.msg, '#ffb3a8'); SFX.no(); return false; }
    ({
      dig: () => { SFX.dig(); burst(cx, cy, '#7a4a22', 8, 50); },
      plant: () => { SFX.plant(); burst(cx, cy, '#7ddc5b', 6, 30); },
      water: () => { SFX.water(); burst(cx, cy - 10, '#58b8ff', 10, 30); },
      harvest: () => { SFX.harvest(); burst(cx, cy, '#ffe066', 12, 70); floatText(cx, cy - 6, '+1 ' + L.GOODS[r.item].icon, '#fff'); },
      remove: () => { SFX.dig(); burst(cx, cy, '#6aa84f', 8, 40); },
      fert: () => { SFX.plant(); burst(cx, cy, '#d6a3ff', 12, 50); floatText(cx, cy - 8, 'Ускорено! ✨', '#e8c8ff'); },
    }[r.fx] || (() => {}))();
    if (r.xp) floatText(cx + 14, cy + 16, '+' + r.xp + ' ⭐', '#ffe066');
    if (state.level > hadLevel) levelUp();
    changed();
    return true;
  }
  function yardClick(lx, ly) {
    const b = buildings();
    for (const [type, name] of [['chicken', 'coop'], ['cow', 'barn']]) {
      const [x, y, w, h] = b[name];
      if (lx >= x && lx <= x + w && ly >= y && ly <= y + h) {
        const a = L.ANIMALS[type];
        if (state.level < a.level) { toast(`${a.building} откроется на ${a.level} уровне`); SFX.no(); return; }
        const r = L.collect(state, type);
        if (r.ok) { SFX.harvest(); burst(x + w / 2, y + 20, '#fff', 14, 70); floatText(x + w / 2, y + 10, `+${r.n} ${L.GOODS[r.item].icon}`, '#fff'); changed(); }
        else toast(state.animals[type] ? 'Пока пусто — подожди немного' : `Купи ${a.name === 'Курица' ? 'курочек' : 'коров'} в магазине 🛒 (вкладка «Животные»)`);
        return;
      }
    }
  }
  function levelUp() {
    SFX.level(); shake = 8;
    const lvl = state.level, news = [];
    for (const k of L.CROP_ORDER) if (L.CROPS[k].level === lvl) news.push(`${L.CROPS[k].icon} ${L.CROPS[k].name}`);
    for (const k of Object.keys(L.ANIMALS)) if (L.ANIMALS[k].level === lvl) news.push(`${L.ANIMALS[k].icon} ${L.ANIMALS[k].building}`);
    openModal(`<div class="card"><h2>🎉 Новый уровень!<button data-x>✕</button></h2><div class="body big"><div style="font-size:3rem">⭐</div><h3>Уровень ${lvl}</h3>
      <p class="note">${news.length ? 'Открыто: <b>' + news.join(', ') + '</b>' : 'Продолжай в том же духе!'}</p><button class="btn gold" data-x>Ура!</button></div></div>`);
  }

  // ---------------------------------------------------------------- интерфейс
  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }
  function openModal(html) { const m = $('#modal'); m.innerHTML = html; m.hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-x]')) closeModal(); });

  let lastHud = '';
  function hud() {
    const need = L.xpNeeded(state.level), hours = ((state.clock / L.DAY_MS) * 24 + 6) % 24;
    const hh = String(Math.floor(hours)).padStart(2, '0'), mm = String(Math.floor((hours % 1) * 60)).padStart(2, '0');
    const night = hours >= 20 || hours < 5;
    const sig = [state.coins, state.level, state.xp, hh, mm, state.items.fert, tool, sel, Object.values(state.seeds).join()].join('|');
    if (sig === lastHud) return; lastHud = sig;
    $('#coins b').textContent = state.coins;
    $('#lvl').textContent = state.level;
    $('#xpbar').style.width = (state.xp / need * 100) + '%';
    $('#xptxt').textContent = `${state.xp}/${need}`;
    $('#clock').innerHTML = `${night ? '🌙' : '☀️'} <span>День ${state.day}, ${hh}:${mm}</span>`;
    $('#fertN').textContent = state.items.fert || 0;
    $('#fertN').style.display = state.items.fert ? '' : 'none';
    document.querySelectorAll('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    const sb = $('#seedbar'); sb.hidden = tool !== 'seed';
    if (!sb.hidden) {
      sb.innerHTML = L.CROP_ORDER.map((k) => {
        const c = L.CROPS[k], lock = c.level > state.level;
        return `<button data-seed="${k}" class="${k === sel ? 'on' : ''} ${lock ? 'lock' : ''}">${lock ? '🔒' : c.icon} ${c.name}<small>${lock ? 'Ур. ' + c.level : 'есть: ' + (state.seeds[k] || 0)}</small></button>`;
      }).join('');
    }
    const resizeNeeded = state.w * S !== logW || YARD + state.h * S !== logH;
    if (resizeNeeded) resize();
  }
  function hintText() {
    const tiles = state.tiles, crops = tiles.filter((t) => t.k === 'crop'), soil = tiles.filter((t) => t.k === 'soil');
    const gotGoods = Object.values(state.goods).some((n) => n > 0), seeds = Object.values(state.seeds).some((n) => n > 0);
    if (state.stats.harvested >= 6) return '';
    if (crops.some((t) => L.isRipe(t))) return '🧺 Урожай созрел! Выбери «Сбор» и коснись растения (над ним блестит звёздочка)';
    if (gotGoods) return '🛒 Продай урожай в магазине и купи новые семена — ферма будет расти!';
    if (crops.some((t) => t.water <= 0)) return '💧 Выбери «Лейку» и полей растения: с водой они растут вдвое быстрее';
    if (!crops.length && soil.length && seeds) return '🌱 Выбери «Посев», нужные семена — и коснись вскопанной (коричневой) земли';
    if (!crops.length && !soil.length) return '⛏️ Выбери «Мотыгу» и коснись травы, чтобы вскопать грядку';
    return crops.length ? '⏳ Растения растут. Пока можно вскопать ещё грядок или заглянуть в магазин 🛒' : '';
  }
  document.querySelectorAll('#tools [data-tool]').forEach((b) => b.addEventListener('click', () => { tool = b.dataset.tool; lastHud = ''; hud(); save(); }));
  $('#seedbar').addEventListener('click', (e) => { const b = e.target.closest('[data-seed]'); if (!b) return; const k = b.dataset.seed; if (L.CROPS[k].level > state.level) { toast(`${L.CROPS[k].name} откроется на ${L.CROPS[k].level} уровне`); SFX.no(); return; } sel = k; lastHud = ''; hud(); save(); });
  $('#btnSound').addEventListener('click', () => { muted = !muted; $('#btnSound').textContent = muted ? '🔇' : '🔊'; save(); });

  // ---- магазин
  let shopTab = 'seeds';
  function shop() {
    const tabs = [['seeds', '🌱 Семена'], ['sell', '💰 Продать'], ['up', '⬆️ Улучшения'], ['animals', '🐔 Животные']];
    let body = '';
    if (shopTab === 'seeds') {
      body = L.CROP_ORDER.map((k) => {
        const c = L.CROPS[k], lock = c.level > state.level;
        return `<div class="row"><div class="ic">${c.icon}</div><div class="tx"><b>${c.name}</b><small>${lock ? '🔒 с ' + c.level + ' уровня' : `растёт ${Math.round(c.growMs / 1000)} с · продажа ${c.sell} 🪙 · есть ${state.seeds[k] || 0}`}</small></div>
          ${lock ? '' : `<button class="btn" data-buy="${k}" data-n="1" ${state.coins < c.seedCost ? 'disabled' : ''}>1 · ${c.seedCost}🪙</button><button class="btn" data-buy="${k}" data-n="5" ${state.coins < c.seedCost * 5 ? 'disabled' : ''}>5 · ${c.seedCost * 5}🪙</button>`}</div>`;
      }).join('') + `<div class="row"><div class="ic">🧪</div><div class="tx"><b>Удобрение</b><small>мгновенно ускоряет рост на 50% · есть ${state.items.fert || 0}</small></div>
        <button class="btn" data-fert="1" ${state.coins < L.FERT_COST ? 'disabled' : ''}>1 · ${L.FERT_COST}🪙</button><button class="btn" data-fert="5" ${state.coins < L.FERT_COST * 5 ? 'disabled' : ''}>5 · ${L.FERT_COST * 5}🪙</button></div>`;
    } else if (shopTab === 'sell') {
      const keys = Object.keys(state.goods).filter((k) => state.goods[k] > 0);
      const total = keys.reduce((s, k) => s + state.goods[k] * L.GOODS[k].sell, 0);
      body = keys.length ? keys.map((k) => `<div class="row"><div class="ic">${L.GOODS[k].icon}</div><div class="tx"><b>${L.GOODS[k].name} × ${state.goods[k]}</b><small>${L.GOODS[k].sell} 🪙 за штуку</small></div><button class="btn gold" data-sell="${k}">Продать за ${state.goods[k] * L.GOODS[k].sell}🪙</button></div>`).join('') +
        `<button class="btn gold" data-sellall style="padding:12px;font-size:1.05rem">Продать всё за ${total} 🪙</button>` : '<p class="note big">Пока нечего продавать. Вырасти урожай 🌾 или собери яйца у курочек 🥚</p>';
    } else if (shopTab === 'up') {
      const pc = L.upgradeCost(state, 'plot'), cc = L.upgradeCost(state, 'can');
      body = `<div class="row"><div class="ic">🏞️</div><div class="tx"><b>Расширить участок</b><small>сейчас ${state.w}×${state.h}${pc ? ` → ${L.PLOTS[state.up.plot + 1].join('×')}` : ' · максимум'}</small></div>${pc ? `<button class="btn" data-up="plot" ${state.coins < pc ? 'disabled' : ''}>${pc}🪙</button>` : ''}</div>
        <div class="row"><div class="ic">🚿</div><div class="tx"><b>Большая лейка</b><small>полив держится ${L.WATER_MS[state.up.can] / 1000} с${cc ? ` → ${L.WATER_MS[state.up.can + 1] / 1000} с` : ' · максимум'}</small></div>${cc ? `<button class="btn" data-up="can" ${state.coins < cc ? 'disabled' : ''}>${cc}🪙</button>` : ''}</div>`;
    } else {
      body = Object.keys(L.ANIMALS).map((k) => {
        const a = L.ANIMALS[k], lock = a.level > state.level, full = state.animals[k] >= a.cap;
        return `<div class="row"><div class="ic">${a.icon}</div><div class="tx"><b>${a.name}</b><small>${lock ? '🔒 ' + a.building + ' с ' + a.level + ' уровня' : `даёт ${L.GOODS[a.product].icon} ${L.GOODS[a.product].name.toLowerCase()} каждые ${Math.round(a.every / 1000)} с · в ${a.building.toLowerCase()}е ${state.animals[k]}/${a.cap}`}</small></div>
          ${lock ? '' : `<button class="btn" data-animal="${k}" ${full || state.coins < a.cost ? 'disabled' : ''}>${full ? 'Нет места' : a.cost + '🪙'}</button>`}</div>`;
      }).join('') + '<p class="note">Продукты копятся в постройке — коснись курятника или хлева наверху поля, чтобы их собрать.</p>';
    }
    openModal(`<div class="card"><h2>🛒 Магазин · <span>🪙 ${state.coins}</span><button data-x>✕</button></h2>
      <div class="tabs">${tabs.map(([id, n]) => `<button data-tab="${id}" class="${id === shopTab ? 'on' : ''}">${n}</button>`).join('')}</div><div class="body">${body}</div></div>`);
  }
  $('#btnShop').addEventListener('click', shop);
  $('#modal').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t || $('#modal').hidden) return;
    const d = t.dataset; let r;
    if (d.tab) { shopTab = d.tab; shop(); return; }
    if (d.buy) r = L.buySeeds(state, d.buy, +d.n);
    else if (d.fert) r = L.buyFert(state, +d.fert);
    else if (d.sell) r = L.sell(state, d.sell, 'all');
    else if ('sellall' in d) r = L.sellAll(state);
    else if (d.up) r = L.buyUpgrade(state, d.up);
    else if (d.animal) r = L.buyAnimal(state, d.animal);
    else return;
    if (r.ok) { (r.gain ? SFX.coin : SFX.plant)(); changed(); } else { toast(r.msg); SFX.no(); }
    shop();
  });

  // ---- меню
  $('#btnMenu').addEventListener('click', () => openModal(`<div class="card"><h2>⚙️ Меню<button data-x>✕</button></h2><div class="body">
    <p class="note"><b>Как играть:</b> вскопай землю ⛏️ → посади семена 🌱 → поливай 💧 → собирай урожай 🧺 → продавай в магазине 🛒 и покупай новые семена, расширяй участок, заводи курочек и коров.</p>
    <p class="note">Игра сохраняется сама. Когда тебя нет, растения продолжают расти (до 8 часов).</p>
    <p class="note">⭐ Собрано урожая: <b>${state.stats.harvested}</b> · 🪙 Заработано: <b>${state.stats.earned}</b></p>
    <button class="btn" data-save>💾 Сохранить сейчас</button><button class="btn red" data-reset>🗑️ Начать заново</button></div></div>`));
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-save]')) { save(); toast('Сохранено 💾'); }
    const r = e.target.closest('[data-reset]');
    if (r) { // подтверждение прямо на кнопке: нажми второй раз в течение 4 секунд
      if (!r.dataset.armed) {
        r.dataset.armed = '1'; r.textContent = '⚠️ Нажми ещё раз: удалить всё';
        setTimeout(() => { if (r.isConnected) { delete r.dataset.armed; r.textContent = '🗑️ Начать заново'; } }, 4000);
        return;
      }
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      state = L.createState(); particles.length = 0; closeModal(); changed(); resize(); toast('Новая ферма! 🌱');
    }
  });

  // ---------------------------------------------------------------- ввод
  let dragging = false, visited = new Set();
  function pos(e) {
    const r = cv.getBoundingClientRect(), lx = (e.clientX - r.left) * logW / r.width, ly = (e.clientY - r.top) * logH / r.height;
    return { lx, ly, tx: Math.floor(lx / S), ty: Math.floor((ly - YARD) / S) };
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (p.ly < YARD) { yardClick(p.lx, p.ly); return; }
    dragging = true; visited = new Set(); hover = p;
    if (p.tx >= 0 && p.tx < state.w && p.ty >= 0 && p.ty < state.h) { visited.add(p.tx + ',' + p.ty); apply(p.tx, p.ty); }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pos(e); hover = p.ty >= 0 && p.tx >= 0 && p.tx < state.w && p.ty < state.h ? p : null;
    if (dragging && hover) { const k = p.tx + ',' + p.ty; if (!visited.has(k)) { visited.add(k); apply(p.tx, p.ty); } } // зажми и води: вскопать/полить сразу несколько клеток
  });
  const endDrag = () => { dragging = false; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { hover = null; });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (!$('#modal').hidden) return;
    const map = { 1: 'hoe', 2: 'seed', 3: 'water', 4: 'harvest', 5: 'fert', 6: 'remove' };
    if (map[e.key]) { tool = map[e.key]; lastHud = ''; hud(); }
    if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы') shop();
  });
  addEventListener('resize', resize);
  addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // ---------------------------------------------------------------- цикл
  let saveDirty = false;
  function changed() { saveDirty = true; lastHud = ''; }
  let last = performance.now(), hintAt = 0, saveAt = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    L.tick(state, dt * 1000); stepFx(dt); hud(); render(now);
    if (now - hintAt > 700) { hintAt = now; $('#hint').textContent = hintText(); }
    if ((saveDirty || now - saveAt > 10000) && now - saveAt > 3000) { saveAt = now; saveDirty = false; save(); }
    requestAnimationFrame(frame);
  }

  load(); buildSprites();
  $('#btnSound').textContent = muted ? '🔇' : '🔊';
  resize(); hud();
  requestAnimationFrame(frame);
  window.__farm = { get state() { return state; }, L, advance: (ms) => { L.tick(state, ms); changed(); }, setTool: (t) => { tool = t; lastHud = ''; hud(); }, setSeed: (k) => { sel = k; lastHud = ''; hud(); }, save, resize };
})();
