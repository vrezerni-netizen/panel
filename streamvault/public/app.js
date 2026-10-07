const $app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let hls = null;

async function api(path, method = 'GET', body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
  return data;
}

function loginView() {
  $app.innerHTML = `<div class="card"><h2>Вход</h2>
    <form id="f1"><input name="u" placeholder="Логин" autocomplete="username" required>
    <input name="p" type="password" placeholder="Пароль" autocomplete="current-password" required>
    <button>Далее</button><div class="err" id="e"></div></form></div>`;
  document.getElementById('f1').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    try {
      const { pending } = await api('/api/login', 'POST', { username: f.u.value, password: f.p.value });
      totpView(pending);
    } catch (e) { document.getElementById('e').textContent = 'Неверные данные'; }
  };
}

function totpView(pending) {
  $app.innerHTML = `<div class="card"><h2>Код подтверждения</h2>
    <p class="mut">Введите 6 цифр из приложения Authenticator</p>
    <form id="f2"><input name="c" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
    <button>Войти</button><div class="err" id="e"></div></form></div>`;
  document.getElementById('f2').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api('/api/login/totp', 'POST', { pending, code: ev.target.c.value });
      start();
    } catch (e) {
      document.getElementById('e').textContent = e.status === 401 && e.message === 'expired' ? 'Время вышло, войдите заново' : 'Неверный код';
      if (e.message === 'expired') setTimeout(loginView, 1500);
    }
  };
}

async function viewerView(me) {
  const names = await api('/api/streams');
  $app.innerHTML = `<div class="row"><b>${esc(me.username)}</b>
    ${me.role === 'admin' ? '<button class="sec" id="adm">Админка</button>' : ''}
    <button class="sec" id="out">Выйти</button></div>
    <div class="card"><div class="row" id="list">${names.length ? '' : '<span class="mut">Нет эфиров</span>'}</div>
    <video id="v" controls playsinline autoplay muted></video></div>`;
  document.getElementById('out').onclick = async () => { await api('/api/logout', 'POST', {}); loginView(); };
  if (me.role === 'admin') document.getElementById('adm').onclick = () => adminView(me);
  const list = document.getElementById('list');
  for (const n of names) {
    const b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => play(n);
    list.append(b);
  }
  if (names.length) play(names[0]);
}

function play(name) {
  const v = document.getElementById('v');
  const src = `/hls/${encodeURIComponent(name)}/index.m3u8`;
  if (hls) hls.destroy();
  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ liveSyncDurationCount: 2 });
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.response?.code === 401) start(); });
    hls.loadSource(src);
    hls.attachMedia(v);
  } else v.src = src; // Safari
}

async function adminView(me) {
  const [users, streams] = await Promise.all([api('/api/admin/users'), api('/api/admin/streams')]);
  $app.innerHTML = `<div class="row"><button class="sec" id="back">← Эфир</button></div>
  <div class="card"><h3>Пользователи</h3><div id="ul"></div>
    <form id="nu"><input name="u" placeholder="Логин" required><input name="p" type="password" placeholder="Пароль (≥12)" minlength="12" required>
    <button>Создать</button></form><div id="enroll"></div></div>
  <div class="card"><h3>Ключи эфира (для Android-передатчика)</h3><div id="sl"></div>
    <form id="ns"><input name="n" placeholder="имя: tablet1" required><button>Создать ключ</button></form><div id="key"></div></div>`;
  document.getElementById('back').onclick = start;
  const ul = document.getElementById('ul');
  for (const u of users) {
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<span>${esc(u.username)} <span class="mut">${esc(u.role)}${u.disabled ? ', отключён' : ''}</span></span>`;
    if (u.role !== 'admin') {
      const mk = (t, fn) => { const b = document.createElement('button'); b.className = 'sec'; b.textContent = t; b.onclick = fn; d.append(b); };
      mk(u.disabled ? 'Включить' : 'Отключить', async () => { await api(`/api/admin/users/${u.id}/disable`, 'POST', { disabled: !u.disabled }); adminView(me); });
      mk('Сбросить 2FA', async () => showEnroll(u.username, await api(`/api/admin/users/${u.id}/reset-2fa`, 'POST', {})));
      mk('Новый пароль', async () => { const p = prompt('Новый пароль (≥12)'); if (p) { await api(`/api/admin/users/${u.id}/password`, 'POST', { password: p }); alert('Готово'); } });
      mk('Удалить', async () => { if (confirm('Удалить?')) { await api(`/api/admin/users/${u.id}`, 'DELETE'); adminView(me); } });
    }
    ul.append(d);
  }
  const sl = document.getElementById('sl');
  for (const s of streams) {
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<span>${esc(s.name)} ${s.revoked ? '<span class="mut">(отозван)</span>' : ''}</span>`;
    if (!s.revoked) {
      const b = document.createElement('button'); b.className = 'sec'; b.textContent = 'Отозвать';
      b.onclick = async () => { await api(`/api/admin/streams/${s.id}/revoke`, 'POST', {}); adminView(me); };
      d.append(b);
    }
    sl.append(d);
  }
  document.getElementById('nu').onsubmit = async (ev) => {
    ev.preventDefault();
    try { showEnroll(ev.target.u.value, await api('/api/admin/users', 'POST', { username: ev.target.u.value, password: ev.target.p.value })); ev.target.reset(); }
    catch (e) { alert(e.message); }
  };
  document.getElementById('ns').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('/api/admin/streams', 'POST', { name: ev.target.n.value });
      document.getElementById('key').innerHTML = `<p class="mut">Ключ показан один раз:</p><code>${esc(r.key)}</code>
        <p class="mut">RTMP: rtmp://ВАШ_СЕРВЕР/live/${esc(r.name)}?user=pub&pass=КЛЮЧ</p>`;
    } catch (e) { alert(e.message); }
  };
}

function showEnroll(username, r) {
  document.getElementById('enroll').innerHTML = `<p>Authenticator для <b>${esc(username)}</b> (показывается один раз):</p>
    <img class="qr" src="${esc(r.qr)}" alt="QR"><p>Секрет: <code>${esc(r.secret)}</code></p>`;
}

async function start() {
  try {
    const me = await api('/api/me');
    await viewerView(me);
  } catch { loginView(); }
}
start();
