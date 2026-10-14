/* Редактор карты (только для владельца игры). Работает поверх world3d.js и даёт полный доступ ко ВСЕЙ карте:
   двигать, ставить и стирать дома, деревья, фонари, дороги, участки земли, лес и большие объекты (здания города, дворы, поля, пруд…).
   Инструменты: move (двигать), place (ставить, можно кистью), erase (ластик), road (дорога), patch (участок земли), select (выделение рамкой).
   Сам редактор ничего не знает про кнопки: интерфейс (game.js) вызывает setTool / rotate / copy / remove / undo и слушает onChange. */
(function () {
  'use strict';
  const root = typeof self !== 'undefined' ? self : this;
  const LX = 1000, LZ0 = -800, LZ1 = 800;   // границы карты для редактора

  function create(api) {
    const T = api.T, { DEC, DEC_R, BIG } = api;
    const ED = { on: false, tool: 'move', place: null, sel: null, canUndo: false, changed: false, onChange: null, roadStart: null, brush: false, patchKind: 0, roadKind: 0 };
    const stack = []; let base = null, drag = null, cur = null, strokeOpen = false, lastRot = 0, lastCut = null, forestT = 0, brushLast = null;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const cx = (v) => clamp(v, -LX, LX), cz = (v) => clamp(v, LZ0, LZ1);
    const snap = (v, g) => Math.round(v / g) * g;
    const fire = () => { ED.canUndo = stack.length > 0; if (ED.onChange) ED.onChange(); };

    // ---- маркеры на земле
    const mat = (col, op) => new T.MeshBasicMaterial({ color: col || 0xffc83d, transparent: true, opacity: op || 0.38, depthWrite: false, side: T.DoubleSide });
    const circ = new T.Mesh(new T.CircleGeometry(1, 40), mat()), eraser = new T.Mesh(new T.CircleGeometry(1, 40), mat(0xe5483b)), pin = new T.Mesh(new T.CircleGeometry(1, 20), mat(0x2ea84f, 0.8));
    const rectG = new T.Group(), rectM = new T.Mesh(new T.PlaneGeometry(1, 1), mat()), band = new T.Mesh(new T.PlaneGeometry(1, 1), mat(0x3d8bff, 0.3));
    rectM.rotation.x = -Math.PI / 2; rectG.add(rectM);
    for (const m of [circ, eraser, pin, band]) m.rotation.x = -Math.PI / 2;
    for (const m of [circ, eraser, pin, band, rectG]) { m.position.y = 0.6; m.visible = false; m.renderOrder = 5; api.scene.add(m); }
    // выбранные несколько предметов: кружки (предметы, деревья) и прямоугольники (дороги) — через instancing
    const MAXC = 4000, MAXR = 800, dotM = new T.InstancedMesh(new T.CircleGeometry(1, 14), mat(0x3d8bff, 0.55), MAXC), bar = new T.InstancedMesh(new T.PlaneGeometry(1, 1), mat(0x3d8bff, 0.4), MAXR);
    for (const m of [dotM, bar]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 5; m.visible = false; api.scene.add(m); }
    const tmp = new T.Object3D(); tmp.rotation.x = -Math.PI / 2;

    const decArea = (it) => it.t === 'patch' ? Math.max(it.w, it.d) / 2 : (DEC_R[it.t] || 3) * (it.s || 1);
    const bigOk = (b) => !b.hidden;
    function hitSel(x, z) {
      const s = ED.sel; if (!s) return false;
      if (s.k === 'dec') { if (s.it.t === 'patch') return pickPatch(s.it, x, z); return Math.hypot(s.it.x - x, s.it.z - z) < decArea(s.it) + 0.8; }
      if (s.k === 'big') return !!s.b.hit(x, z);
      return false;
    }
    function pickPatch(it, x, z) { const c = Math.cos(it.r || 0), sn = Math.sin(it.r || 0), dx = x - it.x, dz = z - it.z; return Math.abs(dx * c - dz * sn) < it.w / 2 && Math.abs(dx * sn + dz * c) < it.d / 2; }
    function pickAny(x, z) {
      const it = api.decNear(x, z); if (it && it.t !== 'patch') return { k: 'dec', it };
      const tr = api.forestNear(x, z, 2.6); if (tr) return { k: 'tree', t: tr };
      let bb = null; for (const b of Object.values(BIG)) if (bigOk(b) && b.hit && b.hit(x, z) && (!bb || b.area < bb.area)) bb = b;
      if (bb) return { k: 'big', b: bb };
      let br = null, bd = 4.6; for (const r of api.ROADS) { const d = api.roadDist(r, x, z); if (d < bd) { bd = d; br = r; } }
      if (br) return { k: 'road', r: br };
      if (it) return { k: 'dec', it };
      return null;
    }
    const newMulti = () => ({ k: 'multi', decs: [], roads: [], trees: [], rects: [], dirty: false });
    const multiCount = (s) => s.decs.length + s.roads.length + s.trees.length;
    function updateMarker() {
      circ.visible = rectG.visible = false; dotM.visible = bar.visible = false; const s = ED.sel; if (!s) return;
      if (s.k === 'dec') {
        if (s.it.t === 'patch') { rectM.scale.set(s.it.w, s.it.d, 1); rectG.position.set(s.it.x, 0.6, s.it.z); rectG.rotation.y = s.it.r || 0; rectG.visible = true; }
        else { const r = decArea(s.it); circ.scale.set(r, r, 1); circ.position.set(s.it.x, 0.6, s.it.z); circ.visible = true; }
      } else if (s.k === 'tree') { circ.scale.set(1.6, 1.6, 1); circ.position.set(s.t[0], 0.6, s.t[1]); circ.visible = true; }
      else if (s.k === 'big') { const b = s.b.bounds(); rectM.scale.set(b[2] - b[0], b[3] - b[1], 1); rectG.position.set((b[0] + b[2]) / 2, 0.6, (b[1] + b[3]) / 2); rectG.rotation.y = 0; rectG.visible = true; }
      else if (s.k === 'road') { const b = api.roadBox(s.r); rectM.scale.set(b[2] - b[0], b[3] - b[1], 1); rectG.position.set((b[0] + b[2]) / 2, 0.6, (b[1] + b[3]) / 2); rectG.rotation.y = 0; rectG.visible = true; }
      else if (s.k === 'multi') {
        let n = 0;
        const dot = (x, z, r) => { if (n >= MAXC) return; tmp.position.set(x, 0.62, z); tmp.scale.set(r, r, 1); tmp.updateMatrix(); dotM.setMatrixAt(n++, tmp.matrix); };
        for (const it of s.decs) dot(it.x, it.z, it.t === 'patch' ? Math.min(6, decArea(it)) : Math.max(1.4, decArea(it) * 0.8));
        for (const t of s.trees) dot(t[0], t[1], 1.3);
        dotM.count = n; dotM.instanceMatrix.needsUpdate = true; dotM.visible = n > 0;
        let m = 0;
        for (const r of s.roads) { if (m >= MAXR) break; const b = api.roadBox(r); tmp.position.set((b[0] + b[2]) / 2, 0.62, (b[1] + b[3]) / 2); tmp.scale.set(b[2] - b[0], b[3] - b[1], 1); tmp.updateMatrix(); bar.setMatrixAt(m++, tmp.matrix); }
        bar.count = m; bar.instanceMatrix.needsUpdate = true; bar.visible = m > 0;
      }
    }
    function select(o) { ED.sel = o; updateMarker(); fire(); }
    function push() { try { stack.push(JSON.stringify(api.exportLayout())); if (stack.length > 40) stack.shift(); } catch (e) { /* без отмены */ } ED.changed = true; }
    const rebuildForest = () => { forestT = 0; api.forestRebuild(); };

    // ---- действия, которые вызывает интерфейс
    ED.enter = () => { ED.on = true; ED.changed = false; stack.length = 0; base = JSON.stringify(api.exportLayout()); ED.tool = 'move'; ED.place = null; ED.sel = null; ED.roadStart = null; ED.brush = false; api.setLimits(true); updateMarker(); fire(); };
    ED.exit = (keep) => {
      if (!ED.on) return; ED.on = false; drag = cur = null; pin.visible = eraser.visible = band.visible = false; ED.sel = null; updateMarker(); api.setLimits(false);
      if (!keep && base) api.applyLayout(JSON.parse(base)); else api.forestRebuild();
      fire();
    };
    ED.layout = () => api.exportLayout();
    ED.setTool = (tool, place) => { ED.tool = tool; ED.place = place || null; ED.roadStart = null; pin.visible = false; if (tool !== 'move' && tool !== 'place') { ED.sel = null; updateMarker(); } else if (tool === 'place' && ED.sel && ED.sel.k === 'multi') { ED.sel = null; updateMarker(); } fire(); };
    ED.setBrush = (v) => { ED.brush = !!v; fire(); };
    ED.setPatch = (k) => { ED.patchKind = k | 0; fire(); };
    ED.setRoadKind = (k) => { ED.roadKind = k | 0; fire(); };
    ED.selCount = () => { const s = ED.sel; return !s ? 0 : s.k === 'multi' ? multiCount(s) : 1; };
    ED.info = () => {
      const s = ED.sel; if (!s) return null;
      if (s.k === 'multi') { const n = multiCount(s); return n ? { name: `Выбрано: ${n}`, rot: false, copy: false, del: true, multi: true } : null; }
      if (s.k === 'dec') {
        if (s.it.t === 'patch') return { name: 'Участок: ' + api.PATCH[s.it.v | 0][0] + ` ${Math.round(s.it.w)}×${Math.round(s.it.d)} м`, rot: true, copy: true, del: true };
        let nm = s.it.t; for (const g of api.PALETTE) for (const a of g.items) if (a[0] === s.it.t && (a[1] === s.it.v % 4 || s.it.t !== 'cottage')) nm = a[2]; return { name: nm, rot: true, copy: true, del: true };
      }
      if (s.k === 'tree') return { name: 'Дерево леса', rot: false, copy: false, del: true };
      if (s.k === 'big') return { name: s.b.name, rot: !!s.b.canRot, copy: false, del: !!s.b.hidable, hide: !!s.b.hidable };
      return { name: s.r.k === 1 ? 'Улица' : 'Дорога', rot: false, copy: false, del: true };
    };
    ED.rotate = () => {
      const s = ED.sel; if (!s) return; push();
      if (s.k === 'dec') { api.decSet(s.it.id, { r: ((s.it.r || 0) + Math.PI / 4) % (Math.PI * 2) }); lastRot = s.it.r; api.decFlush(); }
      else if (s.k === 'big' && s.b.canRot) { const g = s.b.get(); s.b.set(g[0], g[1], (g[2] + s.b.rotStep) % (Math.PI * 2)); s.b.commit && s.b.commit(); }
      updateMarker(); fire();
    };
    ED.copy = () => {
      const s = ED.sel; if (!s || s.k !== 'dec') return; push();
      const it = api.decAdd({ t: s.it.t, v: s.it.v, x: cx(s.it.x + 4), z: cz(s.it.z + 4), r: s.it.r, s: s.it.s, w: s.it.w, d: s.it.d }); api.decFlush(); select({ k: 'dec', it });
    };
    /** Удалить выбранное. Для нескольких предметов — одним действием (одна отмена). */
    ED.remove = () => {
      const s = ED.sel; if (!s) return;
      if (s.k === 'dec') { push(); api.decRemove(s.it.id); api.decFlush(); }
      else if (s.k === 'road') { push(); api.roadsRemove(s.r); api.roadsFlush(); }
      else if (s.k === 'tree') { push(); api.cutAdd([s.t[0], s.t[1], 0.9]); rebuildForest(); }
      else if (s.k === 'big') { if (!s.b.hidable) return; push(); api.bigVis(s.b.id, false); }
      else if (s.k === 'multi') {
        if (!multiCount(s)) return; push();
        for (const it of s.decs) api.decRemove(it.id);
        for (const r of s.roads) api.roadsRemove(r);
        if (s.trees.length) { if (s.trees.length >= 40 && !s.dirty && s.rects.length) for (const r of s.rects) api.cutAdd(r); else for (const t of s.trees) api.cutAdd([t[0], t[1], 0.9]); }
        api.decFlush(); api.roadsFlush(); if (s.trees.length) rebuildForest();
      } else return;
      select(null);
    };
    /** Весь лес по краям карты: убрать / вернуть. */
    ED.forestAll = (off) => { push(); api.setNoForest(!!off); rebuildForest(); fire(); };
    ED.hasForest = () => !api.noForest();
    ED.reset = () => { push(); api.applyLayout(api.defaultLayout()); ED.sel = null; updateMarker(); fire(); };
    ED.clean = () => { push(); api.applyLayout(api.cleanLayout()); ED.sel = null; updateMarker(); fire(); };
    ED.undo = () => { const s = stack.pop(); if (!s) return; api.applyLayout(JSON.parse(s)); ED.sel = null; updateMarker(); fire(); };
    ED.markSaved = () => { base = JSON.stringify(api.exportLayout()); ED.changed = false; };
    /** Открыть другую карту: история шагов назад начинается заново. */
    ED.switchTo = (Ly) => { api.applyLayout(Ly); stack.length = 0; base = JSON.stringify(api.exportLayout()); ED.changed = false; ED.sel = null; updateMarker(); fire(); };
    ED.clearSel = () => select(null);
    ED.load = (Ly) => { push(); api.applyLayout(Ly); ED.sel = null; updateMarker(); fire(); };
    ED.bigList = () => Object.values(BIG).map((b) => ({ id: b.id, name: b.name, hidden: !!b.hidden, hidable: !!b.hidable })).sort((a, c) => a.name.localeCompare(c.name, 'ru'));
    ED.bigToggle = (id) => { const b = BIG[id]; if (!b || !b.hidable) return; push(); api.bigVis(id, !!b.hidden); fire(); };
    ED.bigFocus = (id) => { const b = BIG[id]; if (!b) return; const g = b.get(); api.cam.gx = g[0]; api.cam.gz = g[1]; api.cam.gd = 140; };
    ED.selectBig = (id) => { const b = BIG[id]; if (b && !b.hidden) { ED.tool = 'move'; select({ k: 'big', b }); } };

    // ---- рамка выделения
    function collect(x0, z0, x1, z1) {
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1), za = Math.min(z0, z1), zb = Math.max(z0, z1);
      const s = ED.sel && ED.sel.k === 'multi' ? ED.sel : newMulti(), ids = new Set(s.decs.map((i) => i.id));
      for (const it of DEC.items.values()) if (it.x >= xa && it.x <= xb && it.z >= za && it.z <= zb && !ids.has(it.id)) { s.decs.push(it); ids.add(it.id); }
      const rs = new Set(s.roads);
      for (const r of api.ROADS) { const b = api.roadBox(r); if (b[2] >= xa && b[0] <= xb && b[3] >= za && b[1] <= zb && !rs.has(r)) { s.roads.push(r); rs.add(r); } }
      const ts = new Set(s.trees.map((t) => t[0] + ',' + t[1]));
      for (const t of api.forestIn(xa, za, xb, zb)) if (!ts.has(t[0] + ',' + t[1])) { s.trees.push(t); ts.add(t[0] + ',' + t[1]); }
      s.rects.push([xa, za, xb, zb]);
      select(multiCount(s) ? s : null);
    }
    function toggleAt(x, z) {
      const p = pickAny(x, z); if (!p) return;
      const s = ED.sel && ED.sel.k === 'multi' ? ED.sel : newMulti();
      const flip = (arr, v, same) => { const i = arr.findIndex((q) => same(q, v)); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
      if (p.k === 'dec') flip(s.decs, p.it, (a, b) => a.id === b.id);
      else if (p.k === 'road') flip(s.roads, p.r, (a, b) => a === b);
      else if (p.k === 'tree') { flip(s.trees, p.t, (a, b) => a[0] === b[0] && a[1] === b[1]); s.dirty = true; }
      else return;
      select(multiCount(s) ? s : null);
    }

    // ---- касания
    function eraseAt(x, z) {
      const R = 5; let n = 0;
      for (const it of [...DEC.items.values()]) {
        if (it.t === 'patch') { if (pickPatch(it, x, z)) { api.decRemove(it.id); n++; } continue; }
        if (Math.hypot(it.x - x, it.z - z) < R + Math.min(decArea(it), 4) * 0.5) { api.decRemove(it.id); n++; }
      }
      let rr = 0; for (const r of [...api.ROADS]) if (api.roadDist(r, x, z) < R - 1) { api.roadsRemove(r); rr++; }
      if (api.forestIn(x - R, z - R, x + R, z + R).some((t) => Math.hypot(t[0] - x, t[1] - z) < R)) {
        if (!lastCut || Math.hypot(lastCut[0] - x, lastCut[1] - z) > 2.4) { api.cutAdd([x, z, R]); lastCut = [x, z]; n++; const now = Date.now(); if (now - forestT > 220) { forestT = now; api.forestRebuild(); } }
      }
      if (n || rr) { api.decFlush(); api.roadsFlush(); ED.changed = true; }
      eraser.scale.set(R, R, 1); eraser.position.set(x, 0.6, z); eraser.visible = true;
    }
    function placeItem(x, z, jitter) {
      const t = ED.place; if (!t) return null;
      const it = api.decAdd({ t: t.t, v: t.v, x: cx(snap(x, 1)), z: cz(snap(z, 1)), r: jitter ? Math.random() * 6.28 : lastRot, s: jitter ? 0.9 + Math.random() * 0.25 : 1 }); return it;
    }
    function tap(p) {
      const x = p.x, z = p.z;
      if (ED.tool === 'erase') { push(); lastCut = null; eraseAt(x, z); eraser.visible = false; rebuildForest(); fire(); return; }
      if (ED.tool === 'select') { toggleAt(x, z); return; }
      if (ED.tool === 'road') {
        const gx = snap(x, 5), gz = snap(z, 5);
        if (!ED.roadStart) { ED.roadStart = [gx, gz]; pin.scale.set(3, 3, 1); pin.position.set(gx, 0.7, gz); pin.visible = true; fire(); return; }
        const [sx, sz] = ED.roadStart, horiz = Math.abs(gx - sx) >= Math.abs(gz - sz), a = horiz ? [sx, sz, gx, sz] : [sx, sz, sx, gz], len = horiz ? Math.abs(gx - sx) : Math.abs(gz - sz);
        pin.visible = false; ED.roadStart = null;
        if (len >= 8) { push(); const rs = api.roadsAddLine(a, ED.roadKind); api.roadsFlush(); const s = newMulti(); s.roads = rs; select(s); } else fire();
        return;
      }
      if (ED.tool === 'patch') {
        push(); const it = api.decAdd({ t: 'patch', v: ED.patchKind, x: cx(snap(x, 2)), z: cz(snap(z, 2)), r: 0, s: 1, w: 16, d: 16 }); api.decFlush(); select({ k: 'dec', it }); return;
      }
      if (ED.tool === 'place' && ED.place) {
        if (ED.sel && hitSel(x, z)) { select(null); return; }
        push(); const it = placeItem(x, z, false); api.decFlush(); select({ k: 'dec', it }); return;
      }
      select(pickAny(x, z));
    }
    function placeClone(m, x, z, r, s) { m.position.set(x, 0.05, z); m.rotation.y = r || 0; if (s && s !== 1) m.scale.multiplyScalar(s); }
    const bandOn = (ev) => ED.tool === 'select' || (ev.shiftKey && ED.tool !== 'erase' && ED.tool !== 'road');
    ED.down = (ev) => {
      const p = api.groundAt(ev); if (!p) return;
      cur = { sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false, p, id: ev.pointerId, band: false, patch: false, brush: false };
      if (ED.tool === 'erase') { strokeOpen = true; lastCut = null; push(); eraseAt(p.x, p.z); return; }
      if (bandOn(ev) || ED.tool === 'patch') { cur.band = true; cur.patch = ED.tool === 'patch' && !ev.shiftKey; return; }
      if (ED.tool === 'place' && ED.brush && ED.place) { cur.brush = true; brushLast = null; push(); return; }
      if (ED.sel && (ED.tool === 'move' || ED.tool === 'place') && hitSel(p.x, p.z)) {
        const s = ED.sel;
        if (s.k === 'dec') drag = { k: 'dec', it: s.it, off: [s.it.x - p.x, s.it.z - p.z], started: false };
        else if (s.k === 'big') { const g = s.b.get(); drag = { k: 'big', b: s.b, off: [g[0] - p.x, g[1] - p.z], rot: g[2], started: false }; }
      }
    };
    ED.move = (ev) => {
      if (!cur) return;
      const dx = ev.clientX - cur.lx, dy = ev.clientY - cur.ly; cur.lx = ev.clientX; cur.ly = ev.clientY;
      if (!cur.moved && Math.hypot(ev.clientX - cur.sx, ev.clientY - cur.sy) > (ev.pointerType === 'touch' ? 9 : 4)) cur.moved = true;
      if (ED.tool === 'erase') { const p = api.groundAt(ev); if (p && strokeOpen) eraseAt(p.x, p.z); return; }
      if (cur.band) {
        if (!cur.moved) return; const p = api.groundAt(ev); if (!p) return;
        const x0 = cur.p.x, z0 = cur.p.z, x1 = cx(p.x), z1 = cz(p.z); cur.q = [x1, z1];
        band.scale.set(Math.abs(x1 - x0) || 0.1, Math.abs(z1 - z0) || 0.1, 1); band.position.set((x0 + x1) / 2, 0.7, (z0 + z1) / 2); band.visible = true; return;
      }
      if (cur.brush) {
        const p = api.groundAt(ev); if (!p) return;
        const t = ED.place, sp = Math.max(2, (DEC_R[t.t] || 3) * (t.t === 'fenceWhite' || t.t === 'fenceWood' || t.t === 'hedge' ? 1.8 : 1.15));
        if (!brushLast || Math.hypot(p.x - brushLast[0], p.z - brushLast[1]) >= sp) {
          const line = t.t === 'fenceWhite' || t.t === 'fenceWood' || t.t === 'hedge', it = placeItem(p.x, p.z, !line);
          if (it) { if (line && brushLast) api.decSet(it.id, { r: Math.atan2(p.x - brushLast[0], p.z - brushLast[1]) + Math.PI / 2 }); brushLast = [p.x, p.z]; api.decFlush(); }
        }
        return;
      }
      if (drag) {
        if (!cur.moved) return; const p = api.groundAt(ev); if (!p) return;
        if (drag.k === 'dec') {
          const it = drag.it, x = cx(snap(p.x + drag.off[0], 1)), z = cz(snap(p.z + drag.off[1], 1));
          if (!drag.started) { drag.started = true; push(); api.decSet(it.id, { lift: true }); api.decFlush(); drag.clone = api.decModel(it); drag.clone.scale.setScalar(it.s || 1); api.scene.add(drag.clone); }
          it.x = x; it.z = z; placeClone(drag.clone, x, z, it.r, 1); circ.position.set(x, 0.6, z); rectG.position.set(x, 0.6, z);
        } else {
          if (!drag.started) { drag.started = true; push(); }
          drag.b.set(cx(snap(p.x + drag.off[0], 2)), cz(snap(p.z + drag.off[1], 2)), drag.rot); updateMarker();
        }
        return;
      }
      if (cur.moved) api.panPx(dx, dy);
    };
    ED.up = (ev) => {
      const c = cur; cur = null;
      if (strokeOpen) { strokeOpen = false; eraser.visible = false; rebuildForest(); fire(); return; }
      if (c && c.band) {
        band.visible = false;
        if (c.moved && c.q) {
          const x0 = c.p.x, z0 = c.p.z, x1 = c.q[0], z1 = c.q[1];
          if (c.patch) { const w = Math.max(4, Math.round(Math.abs(x1 - x0) / 2) * 2), d = Math.max(4, Math.round(Math.abs(z1 - z0) / 2) * 2); push(); const it = api.decAdd({ t: 'patch', v: ED.patchKind, x: cx(snap((x0 + x1) / 2, 1)), z: cz(snap((z0 + z1) / 2, 1)), r: 0, s: 1, w, d }); api.decFlush(); select({ k: 'dec', it }); }
          else collect(x0, z0, x1, z1);
          return;
        }
        if (c && !c.moved) tap(c.p);
        return;
      }
      if (c && c.brush) { if (brushLast) { brushLast = null; fire(); return; } brushLast = null; }
      if (drag) {
        const d = drag; drag = null;
        if (d.started) {
          if (d.k === 'dec') { api.scene.remove(d.clone); api.decSet(d.it.id, { x: d.it.x, z: d.it.z, lift: false }); api.decFlush(); }
          else { d.b.commit && d.b.commit(); }
          updateMarker(); fire(); return;
        }
      }
      if (c && !c.moved) tap(c.p);
    };
    ED.cancel = () => { cur = null; band.visible = false; if (drag && drag.clone) api.scene.remove(drag.clone); if (drag && drag.k === 'dec') { api.decSet(drag.it.id, { lift: false }); api.decFlush(); } drag = null; strokeOpen = false; eraser.visible = false; };
    return ED;
  }

  root.FarmEditor = { create };
})();
