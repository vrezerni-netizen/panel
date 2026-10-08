const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  live: '<path d="M8 5v14l11-7z"/>',
  rec: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0zm15-5a6 6 0 0 1 5 5h-4a8 8 0 0 0-1-5z"/>',
  key: '<path d="M7 14a4 4 0 1 1 3.9-5H21v3h-2v2h-3v-2h-5.1A4 4 0 0 1 7 14zm0-5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>',
  log: '<path d="M5 4h14v2H5zm0 7h14v2H5zm0 7h14v2H5z"/>',
  out: '<path d="M10 4h8v16h-8v-2h6V6h-6zM3 12l4-4v3h7v2H7v3z"/>',
  image: '<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 11h12l-3.5-4.5-3 3.8L9 12zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
  cam: '<path d="M4 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2l5-3v12l-5-3v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
};
const svg = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor">${ICON[n]}</svg>`;
const root = $('#root');
let me = null;
let hls = null;
let poll = null;

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
}

async function api(path, method = 'GET', body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : (method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined),
    body: body ? JSON.stringify(body) : (method !== 'GET' ? '{}' : undefined),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
  return data;
}
const fmtSize = (b) => (b > 1073741824 ? (b / 1073741824).toFixed(2) + ' ГБ' : (b / 1048576).toFixed(1) + ' МБ');
const fmtDate = (ms) => new Date(ms).toLocaleString('ru-RU');

/* ---------- login ---------- */
const brandHtml = `<div class="brand"><div class="logo">${svg('live', '')}</div><span class="n">Ахмат Запад</span></div>`;

function loginView() {
  stopPoll(); destroyHls();
  root.innerHTML = `<div class="auth"><div class="box"><div class="brand"><div class="logo">${svg('live', '')}</div><span>Ахмат Запад</span></div>
    <div class="card"><h2 style="margin-bottom:14px">Вход</h2>
    <form id="f1"><input name="u" placeholder="Логин" autocomplete="username" required>
    <input name="p" type="password" placeholder="Пароль" autocomplete="current-password" required>
    <button class="btn">Далее</button><div class="err" id="e"></div></form></div></div></div>`;
  $('#f1').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    try {
      const { pending } = await api('/api/login', 'POST', { username: f.u.value, password: f.p.value });
      totpView(pending);
    } catch { $('#e').textContent = 'Неверный логин или пароль'; }
  };
}

function totpView(pending) {
  root.innerHTML = `<div class="auth"><div class="box"><div class="brand"><div class="logo">${svg('live', '')}</div><span>Ахмат Запад</span></div>
    <div class="card"><h2 style="margin-bottom:6px">Код подтверждения</h2>
    <p class="mut" style="margin:0 0 14px">Введите 6 цифр из приложения Authenticator</p>
    <form id="f2"><input name="c" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code" required autofocus style="font-size:1.4rem;text-align:center;letter-spacing:8px">
    <button class="btn">Войти</button><div class="err" id="e"></div></form></div></div></div>`;
  $('#f2').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/api/login/totp', 'POST', { pending, code: ev.target.c.value }); start(); }
    catch (e) {
      $('#e').textContent = e.message === 'expired' ? 'Время вышло, войдите заново' : 'Неверный код';
      if (e.message === 'expired') setTimeout(loginView, 1500);
    }
  };
}

/* ---------- shell ---------- */
const PAGES = [
  { id: 'live', label: 'Эфир', icon: 'live', admin: false },
  { id: 'rec', label: 'Записи', icon: 'rec', admin: true },
  { id: 'users', label: 'Пользователи', icon: 'users', admin: true },
  { id: 'keys', label: 'Ключи эфира', icon: 'key', admin: true },
  { id: 'look', label: 'Оформление', icon: 'image', admin: true },
  { id: 'log', label: 'Журнал', icon: 'log', admin: true },
];

function shell(page) {
  const items = PAGES.filter((p) => !p.admin || me.role === 'admin');
  root.innerHTML = `<div class="shell"><aside class="side">
    <div class="brand"><div class="logo">${svg('live', '')}</div><span class="n">Ахмат Запад</span></div>
    <nav>${items.map((p) => `<button data-p="${p.id}" class="${p.id === page ? 'on' : ''}">${svg(p.icon)}<span class="lbl">${p.label}</span></button>`).join('')}</nav>
    <div class="spacer"></div>
    <div class="me"><div class="avatar">${esc(me.username[0].toUpperCase())}</div>
      <div><div class="nm">${esc(me.username)}</div><small>${me.role === 'admin' ? 'администратор' : 'зритель'}</small></div>
      <button id="out" title="Выйти">${svg('out')}</button></div>
    </aside><main class="content" id="c"></main></div>`;
  root.querySelectorAll('nav button').forEach((b) => (b.onclick = () => { location.hash = '#/' + b.dataset.p; }));
  $('#out').onclick = async () => { await api('/api/logout', 'POST'); me = null; loginView(); };
  return $('#c');
}

function stopPoll() { clearInterval(poll); poll = null; clearInterval(ticker); ticker = null; }
function destroyHls() { if (hls) { hls.destroy(); hls = null; } }

async function route() {
  if (!me) return;
  stopPoll(); destroyHls();
  const [page = 'live', arg] = location.hash.replace(/^#\//, '').split('/');
  const p = PAGES.find((x) => x.id === page && (!x.admin || me.role === 'admin')) || PAGES[0];
  const c = shell(p.id);
  try { await ({ live: livePage, rec: recPage, users: usersPage, keys: keysPage, look: lookPage, log: logPage }[p.id])(c, decodeURIComponent(arg || '')); }
  catch (e) { if (e.status === 401) { me = null; loginView(); } else c.innerHTML = `<div class="card err">Ошибка: ${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);

/* ---------- live ---------- */
let ticker = null;
const POSN = { tl: 'Слева вверху', tr: 'Справа вверху', bl: 'Слева внизу', br: 'Справа внизу' };
const COLORS = ['#3b82f6', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#e6ebf6'];
const fmtClock = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
};

function applyOverlay(o, state) {
  const pl = $('#pl'); if (!pl) return;
  const v = $('#v');
  let ar = 16 / 9;
  if (o.aspect && o.aspect !== 'auto') { const [a, b] = o.aspect.split(':').map(Number); ar = a / b; }
  else if (v && v.videoWidth) ar = v.videoWidth / v.videoHeight;
  pl.style.setProperty('--ar', ar.toFixed(4));
  const frame = $('#frame'), t = $('#ovTitle'), tm = $('#ovTimer');
  frame.style.display = o.showFrame ? 'block' : 'none';
  frame.style.borderColor = o.frameColor; frame.style.borderWidth = o.frameWidth + 'px';
  t.hidden = !(o.showTitle && o.title); t.textContent = o.title; t.className = 'ov ov-title pos-' + o.titlePos;
  const showT = o.showTimer && state.liveSince;
  tm.hidden = !showT; tm.className = 'ov ov-timer pos-' + o.timerPos;
  if (showT) $('#ovClock').textContent = fmtClock((Date.now() - state.liveSince) / 1000);
}

function dockHtml(o) {
  const tog = (k, label) => `<button class="tg ${o[k] ? 'on' : ''}" data-t="${k}"><span class="sw"></span>${label}</button>`;
  const corners = (k) => `<div class="corners">${['tl', 'tr', 'bl', 'br'].map((p) => `<button class="${o[k] === p ? 'on' : ''}" data-c="${k}" data-p="${p}" title="${POSN[p]}"></button>`).join('')}</div>`;
  return `<aside class="dock"><div class="card dockc">
    <h3>Оформление эфира</h3><div class="mut sm">Меняется сразу у всех зрителей</div>
    <div class="grp">Показывать</div>${tog('showTitle', 'Название')}${tog('showTimer', 'Таймер эфира')}${tog('showFrame', 'Рамка')}
    <div class="grp">Название на экране</div>
    <div class="form-row"><input id="dTitle" maxlength="40" value="${esc(o.title)}"><button class="btn sm" id="dSave">Применить</button></div>
    <div class="grp">Где название</div>${corners('titlePos')}
    <div class="grp">Где таймер</div>${corners('timerPos')}
    <div class="grp">Цвет рамки</div><div class="sw-row">${COLORS.map((c) => `<button class="clr ${o.frameColor === c ? 'on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>
    <div class="grp">Толщина рамки</div><div class="seg">${[[2, 'Тонкая'], [4, 'Средняя'], [8, 'Толстая'], [12, 'Очень']].map(([w, l]) => `<button class="${o.frameWidth === w ? 'on' : ''}" data-w="${w}">${l}</button>`).join('')}</div>
    <div class="grp">Формат видео</div><div class="seg">${[['auto', 'Как у экрана'], ['16:9', '16:9 широкий'], ['4:3', '4:3'], ['1:1', 'Квадрат'], ['3:4', 'Вертикально 3:4'], ['9:16', 'Вертикально 9:16']].map(([a, l]) => `<button class="${o.aspect === a ? 'on' : ''}" data-a="${a}">${l}</button>`).join('')}</div>
    <div class="grp">Быстрые действия</div>
    <div class="quick"><button class="btn sec sm" data-go="keys">Новый ключ эфира</button><button class="btn sec sm" data-go="users">Новый зритель</button>
    <button class="btn sec sm" data-go="look">Фон сайта</button><button class="btn sec sm" data-go="rec">Записи</button><button class="btn sec sm" data-go="log">Журнал</button></div>
  </div></aside>`;
}

async function livePage(c) {
  let current = null, playing = null, lastKey = '', overlay = await api('/api/settings');
  const st = { liveSince: null }; let skew = 0, streams = [];
  const admin = me.role === 'admin';
  c.innerHTML = `<div class="head"><div><h2>Эфир</h2><div class="sub" id="sub"></div></div></div>
    <div class="live-layout ${admin ? 'withdock' : ''}"><div class="main">
    <div class="card" style="padding:14px"><div class="player" id="pl"><video id="v" controls playsinline muted></video>
      <div class="frame" id="frame"></div>
      <div class="ov ov-title" id="ovTitle" hidden></div>
      <div class="ov ov-timer" id="ovTimer" hidden><span class="rd"></span><span id="ovClock">00:00</span></div>
      <div class="ph" id="ph">${svg('cam', '')}<div>Выберите эфир ниже</div></div></div>
      <div class="bar"><span id="nowname" class="mut"></span><span class="spacer"></span>
        <button class="btn sec sm" id="fs">Во весь экран</button><button class="btn sec sm" id="rl">Обновить</button></div></div>
    <h3 style="margin:0 0 12px">Каналы</h3><div class="grid" id="grid"></div></div>${admin ? dockHtml(overlay) : ''}</div>`;
  const v = $('#v');
  v.addEventListener('loadedmetadata', () => applyOverlay(overlay, st));
  v.addEventListener('resize', () => applyOverlay(overlay, st));
  $('#fs').onclick = () => $('#pl').requestFullscreen?.();
  $('#rl').onclick = () => current && play(current, true);
  applyOverlay(overlay, st);

  if (admin) {
    const save = async (patch) => { try { overlay = await api('/api/admin/settings', 'PUT', patch); applyOverlay(overlay, st); redock(); } catch (e) { toast(e.message, true); } };
    const redock = () => { const d = $('.dock'); d.outerHTML = dockHtml(overlay); wireDock(); };
    const wireDock = () => {
      const d = $('.dock');
      d.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => save({ [b.dataset.t]: !overlay[b.dataset.t] })));
      d.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => save({ [b.dataset.c]: b.dataset.p })));
      d.querySelectorAll('[data-col]').forEach((b) => (b.onclick = () => save({ frameColor: b.dataset.col })));
      d.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => save({ aspect: b.dataset.a })));
      d.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => save({ frameWidth: Number(b.dataset.w) })));
      d.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { location.hash = '#/' + b.dataset.go; }));
      $('#dSave').onclick = () => save({ title: $('#dTitle').value });
      $('#dTitle').onkeydown = (e) => { if (e.key === 'Enter') save({ title: e.target.value }); };
    };
    wireDock();
  }

  function play(name, force) {
    if (playing === name && !force) return;
    current = name; playing = name;
    $('#nowname').innerHTML = `<span class="chip live"><span class="dot"></span>${esc(name)}</span>`;
    $('#ph').hidden = true;
    destroyHls();
    const src = `/hls/${encodeURIComponent(name)}/index.m3u8`;
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 8, levelLoadingMaxRetry: 8, fragLoadingMaxRetry: 8 });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.response && d.response.code === 401) { me = null; loginView(); return; }
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setTimeout(() => { if (current === name) play(name, true); }, 3000);
      });
      hls.loadSource(src); hls.attachMedia(v);
      v.play().catch(() => {});
    } else { v.src = src; v.play().catch(() => {}); }
  }

  function syncSince() {
    const s = streams.find((x) => x.name === current);
    st.liveSince = s && s.live && s.since ? s.since - skew : null;
    applyOverlay(overlay, st);
  }

  async function refresh() {
    const r = await api('/api/streams');
    skew = r.now - Date.now(); streams = r.streams;
    const list = streams, liveN = list.filter((s) => s.live).length;
    $('#sub').textContent = list.length ? `В эфире: ${liveN} из ${list.length}` : 'Каналов пока нет';
    const key = JSON.stringify(list.map((s) => [s.name, s.live])) + current;
    if (key !== lastKey) {
      lastKey = key;
      $('#grid').innerHTML = list.length ? list.map((s) => `<button class="tile ${s.name === current ? 'sel' : ''}" data-n="${esc(s.name)}">
        <div class="big">${svg('cam', '')}</div><div class="t">${esc(s.name)}</div>
        ${s.live ? '<span class="chip live"><span class="dot"></span>Идёт эфир</span>' : '<span class="chip">Не в эфире</span>'}</button>`).join('')
        : `<div class="card empty" style="grid-column:1/-1">Нет каналов.${admin ? ' Создайте ключ эфира в разделе «Ключи эфира».' : ''}</div>`;
      $('#grid').querySelectorAll('.tile').forEach((t) => (t.onclick = () => { play(t.dataset.n, true); lastKey = ''; syncSince(); refresh(); }));
    }
    if (!current) { const first = list.find((s) => s.live); if (first) play(first.name); }
    syncSince();
  }
  await refresh();
  poll = setInterval(() => refresh().catch(() => {}), 5000);
  ticker = setInterval(() => applyOverlay(overlay, st), 1000);
}

/* ---------- recordings (folders) ---------- */
function parseRec(r) {
  const m = /^live_(.+?)-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(r.name);
  if (!m) return { ...r, stream: 'Прочее', when: fmtDate(r.mtime) };
  return { ...r, stream: m[1], when: `${m[4]}.${m[3]}.${m[2]} ${m[5]}:${m[6]}:${m[7]}` };
}

async function recPage(c, folder) {
  const recs = (await api('/api/admin/recordings')).map(parseRec);
  const note = `<div class="note">🔒 Записи зашифрованы. Скачайте файл и откройте его на компьютере с флешкой: запустите
    <code>decrypt-recording.bat</code> (папка программы), укажите файл и ключ <code>streamvault.key</code> с флешки.
    Результат — обычный видеофайл MP4 (H.264 + AAC), открывается в VLC и любом плеере. Файл можно скачать кнопкой «Скачать» и выбрать флешку или любую папку. Без флешки посмотреть запись нельзя никому, даже администратору.</div>`;
  if (!folder) {
    const groups = {};
    for (const r of recs) (groups[r.stream] ||= []).push(r);
    c.innerHTML = `<div class="head"><div><h2>Записи</h2><div class="sub">Папки по каналам</div></div></div>${note}` +
      (recs.length ? `<div class="grid">${Object.entries(groups).map(([n, a]) => `<button class="tile folder" data-f="${esc(n)}">
        <div class="big">${svg('rec', '')}</div><div class="t">${esc(n)}</div>
        <span class="chip">${a.length} файл(ов) · ${fmtSize(a.reduce((s, x) => s + x.size, 0))}</span></button>`).join('')}</div>`
        : `<div class="card empty">Записей пока нет.<br>Запись включается при первом запуске, если указать флешку для ключа.</div>`);
    c.querySelectorAll('.tile').forEach((t) => (t.onclick = () => { location.hash = '#/rec/' + encodeURIComponent(t.dataset.f); }));
    return;
  }
  const list = recs.filter((r) => r.stream === folder);
  c.innerHTML = `<div class="crumbs"><button id="back">Записи</button> / <b style="color:var(--fg)">${esc(folder)}</b></div>${note}
    <div class="card tbl-wrap"><table><thead><tr><th>Дата и время</th><th>Размер</th><th></th></tr></thead><tbody>
    ${list.map((r) => `<tr><td>${esc(r.when)}</td><td>${fmtSize(r.size)}</td><td><div class="row">
      <a class="btn sm" href="/api/admin/recordings/${encodeURIComponent(r.name)}">Скачать</a>
      <button class="btn danger sm" data-d="${esc(r.name)}">Удалить</button></div></td></tr>`).join('') || '<tr><td colspan="3" class="empty">Пусто</td></tr>'}
    </tbody></table></div>`;
  $('#back').onclick = () => { location.hash = '#/rec'; };
  c.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Удалить запись безвозвратно?')) return;
    await api('/api/admin/recordings/' + encodeURIComponent(b.dataset.d), 'DELETE'); route();
  }));
}

/* ---------- users ---------- */
async function usersPage(c) {
  const users = await api('/api/admin/users');
  c.innerHTML = `<div class="head"><div><h2>Пользователи</h2><div class="sub">Кто может смотреть эфир. Регистрации нет, всех создаёте вы.</div></div></div>
    <div class="card tbl-wrap"><table><thead><tr><th>Логин</th><th>Роль</th><th>Статус</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td>${u.role === 'admin' ? 'администратор' : 'зритель'}</td>
      <td>${u.disabled ? '<span class="chip off">отключён</span>' : '<span class="chip ok"><span class="dot"></span>активен</span>'}</td>
      <td>${u.role === 'admin' ? '' : `<div class="row">
        <button class="btn sec sm" data-a="dis" data-i="${u.id}" data-v="${u.disabled ? 0 : 1}">${u.disabled ? 'Включить' : 'Отключить'}</button>
        <button class="btn sec sm" data-a="2fa" data-i="${u.id}" data-u="${esc(u.username)}">Сбросить 2FA</button>
        <button class="btn sec sm" data-a="pw" data-i="${u.id}">Пароль</button>
        <button class="btn danger sm" data-a="del" data-i="${u.id}">Удалить</button></div>`}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="card"><h3 style="margin-bottom:12px">Новый зритель</h3>
      <form id="nu" class="form-row"><input name="u" placeholder="Логин (латиница)" required><input name="p" type="password" placeholder="Пароль, минимум 12 символов" minlength="12" required>
      <button class="btn">Создать</button></form><div id="enroll"></div></div>`;
  c.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
    const { a, i } = b.dataset;
    try {
      if (a === 'dis') { await api(`/api/admin/users/${i}/disable`, 'POST', { disabled: b.dataset.v === '1' }); route(); }
      if (a === '2fa') showEnroll(b.dataset.u, await api(`/api/admin/users/${i}/reset-2fa`, 'POST'));
      if (a === 'pw') { const p = prompt('Новый пароль (минимум 12 символов)'); if (p) { await api(`/api/admin/users/${i}/password`, 'POST', { password: p }); toast('Пароль изменён'); } }
      if (a === 'del' && confirm('Удалить пользователя?')) { await api(`/api/admin/users/${i}`, 'DELETE'); route(); }
    } catch (e) { toast(e.message, true); }
  }));
  $('#nu').onsubmit = async (ev) => {
    ev.preventDefault();
    try { const r = await api('/api/admin/users', 'POST', { username: ev.target.u.value, password: ev.target.p.value }); showEnroll(ev.target.u.value, r); ev.target.reset(); }
    catch (e) { toast(e.message === 'exists' ? 'Такой логин уже есть' : e.message, true); }
  };
}

function showEnroll(username, r) {
  $('#enroll').innerHTML = `<div class="note" style="margin-top:16px">Покажите этот QR пользователю <b>${esc(username)}</b> (виден только сейчас):</div>
    <div class="row" style="align-items:flex-start"><img class="qr" src="${esc(r.qr)}" alt="QR">
    <div><div class="mut">Если сканировать нельзя, введите секрет вручную:</div><div class="keybox"><code>${esc(r.secret)}</code></div></div></div>`;
}

/* ---------- stream keys ---------- */
async function keysPage(c) {
  const streams = await api('/api/admin/streams');
  c.innerHTML = `<div class="head"><div><h2>Ключи эфира</h2><div class="sub">Ключ вводится в приложении на планшете. Показывается один раз.</div></div></div>
    <div class="card tbl-wrap"><table><thead><tr><th>Канал</th><th>Статус</th><th></th></tr></thead><tbody>
    ${streams.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${s.revoked ? '<span class="chip off">отозван</span>' : '<span class="chip ok"><span class="dot"></span>действует</span>'}</td>
      <td><div class="row">${s.revoked ? '' : `<button class="btn danger sm" data-r="${s.id}">Отозвать</button>`}</div></td></tr>`).join('') || '<tr><td colspan="3" class="empty">Ключей нет</td></tr>'}
    </tbody></table></div>
    <div class="card"><h3 style="margin-bottom:12px">Новый канал</h3>
      <form id="ns" class="form-row"><input name="n" placeholder="Имя, например tablet1" pattern="[a-z0-9_-]{1,32}" required><button class="btn">Создать ключ</button></form>
      <div id="key"></div></div>`;
  c.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => {
    if (confirm('Отозвать ключ? Эфир с него сразу перестанет приниматься.')) { await api(`/api/admin/streams/${b.dataset.r}/revoke`, 'POST'); route(); }
  }));
  $('#ns').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('/api/admin/streams', 'POST', { name: ev.target.n.value });
      $('#key').innerHTML = `<div class="note" style="margin-top:16px">Канал создан. Скопируйте ключ сейчас, потом он не покажется.</div>
        <div class="mut">Имя в приложении:</div><div class="keybox"><code>${esc(r.name)}</code></div>
        <div class="mut">Ключ эфира:</div><div class="keybox"><code id="kv">${esc(r.key)}</code><button class="btn sec sm" id="cp">Копировать</button></div>
        <div class="mut" style="margin-top:8px">Сервер в приложении: <code>rtmp://адрес-этого-компьютера</code> (адрес показан в чёрном окне запуска)</div>`;
      $('#cp').onclick = () => { navigator.clipboard?.writeText(r.key); toast('Ключ скопирован'); };
    } catch (e) { toast(e.message === 'exists' ? 'Такое имя уже есть' : e.message, true); }
  };
}

/* ---------- appearance: background photo ---------- */
async function lookPage(c) {
  let t = await api('/api/theme');
  c.innerHTML = `<div class="head"><div><h2>Оформление сайта</h2><div class="sub">Фоновое фото для входа и всех страниц</div></div></div>
    <div class="look-grid"><div class="card"><h3 style="margin-bottom:12px">Фоновое фото</h3>
      <div class="bgprev" id="prev"><span class="chip" id="cur"></span></div>
      <div class="row" style="margin-top:14px"><label class="btn" for="file">Загрузить своё фото</label>
        <input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="btn sec" id="reset">Вернуть стандартный фон</button></div>
      <div class="mut sm" style="margin-top:10px">JPG, PNG или WEBP до 10 МБ. Лучше всего подходит фото 1920×1080 и больше.</div></div>
      <div class="card"><h3 style="margin-bottom:12px">Настройка</h3>
      <div class="grp" style="margin-top:0">Затемнение фона: <b id="dv"></b></div><input type="range" id="dim" min="0" max="90" step="5" style="width:100%">
      <div class="grp">Размытие фона: <b id="bv"></b></div><input type="range" id="blur" min="0" max="20" step="1" style="width:100%">
      <div class="mut sm" style="margin-top:12px">Затемнение делает текст читаемее, размытие смягчает фото.</div></div></div>`;
  const paint = () => {
    $('#prev').style.backgroundImage = `url("${t.bg}")`;
    $('#prev').style.setProperty('--dim', t.dim);
    $('#cur').textContent = t.custom ? 'Ваше фото' : 'Стандартный фон';
    $('#dim').value = Math.round(t.dim * 100); $('#dv').textContent = Math.round(t.dim * 100) + '%';
    $('#blur').value = t.blur; $('#bv').textContent = t.blur + ' px';
    applyTheme(t);
  };
  paint();
  const saveLook = async () => { try { await api('/api/admin/theme', 'PUT', { dim: t.dim, blur: t.blur }); } catch (e) { toast(e.message, true); } };
  $('#dim').oninput = (e) => { t.dim = e.target.value / 100; paint(); };
  $('#dim').onchange = saveLook;
  $('#blur').oninput = (e) => { t.blur = Number(e.target.value); paint(); };
  $('#blur').onchange = saveLook;
  $('#file').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast('Файл больше 10 МБ', true);
    const fr = new FileReader();
    fr.onload = async () => {
      try { await api('/api/admin/background', 'POST', { data: fr.result }); t = await api('/api/theme'); paint(); toast('Фон обновлён'); }
      catch (err) { toast(err.message, true); }
    };
    fr.readAsDataURL(f);
  };
  $('#reset').onclick = async () => { await api('/api/admin/background', 'DELETE'); t = await api('/api/theme'); paint(); toast('Возвращён стандартный фон'); };
}

/* ---------- audit log ---------- */
const EV = { 'login.ok': 'Вход выполнен', 'login.fail': 'Неверный пароль', 'login.totp_fail': 'Неверный код', 'login.locked': 'Вход заблокирован',
  'user.create': 'Создан пользователь', 'user.delete': 'Удалён пользователь', 'user.disable': 'Пользователь отключён', 'user.enable': 'Пользователь включён',
  'user.reset2fa': 'Сброшена 2FA', 'user.password': 'Сменён пароль', 'stream.create': 'Создан ключ эфира', 'stream.revoke': 'Ключ отозван',
  'publish.denied': 'Отклонена публикация', 'settings.update': 'Изменено оформление эфира', 'theme.background': 'Загружен фон', 'theme.background.reset': 'Сброшен фон', 'theme.update': 'Изменён фон', 'recording.download': 'Скачана запись', 'recording.delete': 'Удалена запись' };
async function logPage(c) {
  const rows = await api('/api/admin/audit');
  c.innerHTML = `<div class="head"><div><h2>Журнал</h2><div class="sub">Последние 200 событий безопасности</div></div></div>
    <div class="card tbl-wrap"><table><thead><tr><th>Время</th><th>Кто</th><th>Событие</th><th>Детали</th><th>IP</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${fmtDate(r.ts)}</td><td>${esc(r.actor || '—')}</td><td>${esc(EV[r.event] || r.event)}</td><td class="mut">${esc(r.detail || '')}</td><td class="mut">${esc(r.ip || '')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function applyTheme(t) {
  const r = document.documentElement.style;
  r.setProperty('--bg-img', `url("${t.bg}")`);
  r.setProperty('--dim', String(t.dim));
  r.setProperty('--blur', (t.blur || 0) + 'px');
}
async function loadTheme() { try { applyTheme(await api('/api/theme')); } catch { /* default css */ } }

async function start() {
  await loadTheme();
  try { me = await api('/api/me'); if (!location.hash) location.hash = '#/live'; route(); }
  catch { me = null; loginView(); }
}
start();
