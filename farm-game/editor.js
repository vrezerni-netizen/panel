/* Редактор карты (только для владельца игры). Работает поверх world3d.js: двигает дома, деревья, фонари, большие объекты
   (здания города, дворы ферм, поля, лесопилка, пруд…), рисует дороги и стирает лишнее.
   Управление пальцем: тап по предмету выбирает его, перетаскивание выбранного двигает, перетаскивание пустого места двигает камеру.
   Сам редактор ничего не знает про кнопки: интерфейс (game.js) вызывает setTool / rotate / copy / remove / undo и слушает onChange. */
(function () {
  'use strict';
  const root = typeof self !== 'undefined' ? self : this;

  function create(api) {
    const T = api.T, { DEC, DEC_R, BIG } = api;
    const ED = { on: false, tool: 'move', place: null, sel: null, canUndo: false, changed: false, onChange: null, roadStart: null };
    const stack = []; let base = null, drag = null, cur = null, strokeOpen = false, lastRot = 0;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const snap = (v, g) => Math.round(v / g) * g;
    const fire = () => { ED.canUndo = stack.length > 0; if (ED.onChange) ED.onChange(); };

    // ---- маркеры на земле: выбранный предмет, ластик, начало дороги
    const mat = () => new T.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.38, depthWrite: false, side: T.DoubleSide });
    const circ = new T.Mesh(new T.CircleGeometry(1, 40), mat()), rect = new T.Mesh(new T.PlaneGeometry(1, 1), mat()), eraser = new T.Mesh(new T.CircleGeometry(1, 40), mat()), pin = new T.Mesh(new T.CircleGeometry(1, 20), mat());
    for (const m of [circ, rect, eraser, pin]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.55; m.visible = false; m.renderOrder = 5; api.scene.add(m); }
    eraser.material.color.set(0xe5483b); pin.material.color.set(0x2ea84f); pin.material.opacity = 0.8;

    const decArea = (it) => (DEC_R[it.t] || 3) * (it.s || 1);
    function hitSel(x, z) {
      const s = ED.sel; if (!s) return false;
      if (s.k === 'dec') return Math.hypot(s.it.x - x, s.it.z - z) < decArea(s.it) + 0.8;
      if (s.k === 'big') return !!s.b.hit(x, z);
      return false;
    }
    function pickAny(x, z) {
      const it = api.decNear(x, z); if (it) return { k: 'dec', it };
      let bb = null; for (const b of Object.values(BIG)) if (b.hit && b.hit(x, z) && (!bb || b.area < bb.area)) bb = b;
      if (bb) return { k: 'big', b: bb };
      let br = null, bd = 4; for (const r of api.ROADS) { const d = api.roadDist(r, x, z); if (d < bd) { bd = d; br = r; } }
      if (br) return { k: 'road', r: br };
      return null;
    }
    function updateMarker() {
      circ.visible = rect.visible = false; const s = ED.sel; if (!s) return;
      if (s.k === 'dec') { const r = decArea(s.it); circ.scale.set(r, r, 1); circ.position.set(s.it.x, 0.55, s.it.z); circ.visible = true; }
      else if (s.k === 'big') { const b = s.b.bounds(); rect.scale.set(b[2] - b[0], b[3] - b[1], 1); rect.position.set((b[0] + b[2]) / 2, 0.55, (b[1] + b[3]) / 2); rect.visible = true; }
      else if (s.k === 'road') { const [x0, z0, x1, z1] = s.r.a; const h = Math.abs(x1 - x0) >= Math.abs(z1 - z0); rect.scale.set(h ? Math.abs(x1 - x0) + 2 : 10, h ? 10 : Math.abs(z1 - z0) + 2, 1); rect.position.set((x0 + x1) / 2, 0.55, (z0 + z1) / 2); rect.visible = true; }
    }
    function select(o) { ED.sel = o; updateMarker(); fire(); }
    function push() { try { stack.push(JSON.stringify(api.exportLayout())); if (stack.length > 40) stack.shift(); } catch (e) { /* без отмены */ } ED.changed = true; }

    // ---- действия, которые вызывает интерфейс
    ED.enter = () => { ED.on = true; ED.changed = false; stack.length = 0; base = JSON.stringify(api.exportLayout()); ED.tool = 'move'; ED.place = null; ED.sel = null; ED.roadStart = null; updateMarker(); fire(); };
    ED.exit = (keep) => {
      if (!ED.on) return; ED.on = false; drag = cur = null; pin.visible = eraser.visible = false; ED.sel = null; updateMarker();
      if (!keep && base) api.applyLayout(JSON.parse(base)); else api.forestRebuild();
      fire();
    };
    ED.layout = () => api.exportLayout();
    ED.setTool = (tool, place) => { ED.tool = tool; ED.place = place || null; ED.roadStart = null; pin.visible = false; if (tool !== 'move' && tool !== 'place') { ED.sel = null; updateMarker(); } fire(); };
    ED.info = () => {
      const s = ED.sel; if (!s) return null;
      if (s.k === 'dec') { let nm = s.it.t; for (const g of api.PALETTE) for (const a of g.items) if (a[0] === s.it.t && (a[1] === s.it.v % 4 || s.it.t !== 'cottage')) nm = a[2]; return { name: nm, rot: true, copy: true, del: true }; }
      if (s.k === 'big') return { name: s.b.name, rot: !!s.b.canRot, copy: false, del: false };
      return { name: 'Дорога', rot: false, copy: false, del: true };
    };
    ED.rotate = () => {
      const s = ED.sel; if (!s) return; push();
      if (s.k === 'dec') { api.decSet(s.it.id, { r: ((s.it.r || 0) + Math.PI / 4) % (Math.PI * 2) }); lastRot = s.it.r; api.decFlush(); }
      else if (s.k === 'big' && s.b.canRot) { const g = s.b.get(); s.b.set(g[0], g[1], (g[2] + s.b.rotStep) % (Math.PI * 2)); s.b.commit && s.b.commit(); }
      updateMarker(); fire();
    };
    ED.copy = () => {
      const s = ED.sel; if (!s || s.k !== 'dec') return; push();
      const it = api.decAdd({ t: s.it.t, v: s.it.v, x: clamp(s.it.x + 4, -560, 560), z: clamp(s.it.z + 4, -420, 460), r: s.it.r, s: s.it.s }); api.decFlush(); select({ k: 'dec', it });
    };
    ED.remove = () => {
      const s = ED.sel; if (!s) return;
      if (s.k === 'dec') { push(); api.decRemove(s.it.id); api.decFlush(); }
      else if (s.k === 'road') { push(); api.roadsRemove(s.r); }
      else return;
      select(null);
    };
    ED.reset = () => { push(); api.applyLayout(api.defaultLayout()); ED.sel = null; updateMarker(); fire(); };
    ED.undo = () => { const s = stack.pop(); if (!s) return; api.applyLayout(JSON.parse(s)); ED.sel = null; updateMarker(); fire(); };

    // ---- касания
    function eraseAt(x, z) {
      const R = 5; let n = 0;
      for (const it of [...DEC.items.values()]) if (Math.hypot(it.x - x, it.z - z) < R + Math.min(decArea(it), 4) * 0.5) { api.decRemove(it.id); n++; }
      for (const r of [...api.ROADS]) if (api.roadDist(r, x, z) < R - 1) { api.roadsRemove(r); n++; }
      if (n) { api.decFlush(); ED.changed = true; }
      eraser.scale.set(R, R, 1); eraser.position.set(x, 0.55, z); eraser.visible = true;
    }
    function tap(p) {
      const x = p.x, z = p.z;
      if (ED.tool === 'erase') { push(); eraseAt(x, z); eraser.visible = false; fire(); return; }
      if (ED.tool === 'road') {
        const gx = snap(x, 5), gz = snap(z, 5);
        if (!ED.roadStart) { ED.roadStart = [gx, gz]; pin.scale.set(3, 3, 1); pin.position.set(gx, 0.6, gz); pin.visible = true; fire(); return; }
        const [sx, sz] = ED.roadStart, horiz = Math.abs(gx - sx) >= Math.abs(gz - sz), a = horiz ? [sx, sz, gx, sz] : [sx, sz, sx, gz], len = horiz ? Math.abs(gx - sx) : Math.abs(gz - sz);
        pin.visible = false; ED.roadStart = null;
        if (len >= 8) { push(); const r = api.roadsAdd(a); select({ k: 'road', r }); } else fire();
        return;
      }
      if (ED.tool === 'place' && ED.place) {
        if (ED.sel && hitSel(x, z)) { select(null); return; }
        push(); const it = api.decAdd({ t: ED.place.t, v: ED.place.v, x: clamp(snap(x, 1), -560, 560), z: clamp(snap(z, 1), -420, 460), r: lastRot, s: 1 }); api.decFlush(); select({ k: 'dec', it }); return;
      }
      select(pickAny(x, z));
    }
    function placeClone(m, x, z, r, s) { m.position.set(x, 0.05, z); m.rotation.y = r || 0; if (s && s !== 1) m.scale.multiplyScalar(s); }
    ED.down = (ev) => {
      const p = api.groundAt(ev); if (!p) return;
      cur = { sx: ev.clientX, sy: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false, p, id: ev.pointerId };
      if (ED.tool === 'erase') { strokeOpen = true; push(); eraseAt(p.x, p.z); return; }
      if (ED.sel && (ED.tool === 'move' || ED.tool === 'place') && hitSel(p.x, p.z)) {
        const s = ED.sel;
        if (s.k === 'dec') {
          drag = { k: 'dec', it: s.it, off: [s.it.x - p.x, s.it.z - p.z], started: false };
        } else if (s.k === 'big') { const g = s.b.get(); drag = { k: 'big', b: s.b, off: [g[0] - p.x, g[1] - p.z], rot: g[2], started: false }; }
      }
    };
    ED.move = (ev) => {
      if (!cur) return;
      const dx = ev.clientX - cur.lx, dy = ev.clientY - cur.ly; cur.lx = ev.clientX; cur.ly = ev.clientY;
      if (!cur.moved && Math.hypot(ev.clientX - cur.sx, ev.clientY - cur.sy) > (ev.pointerType === 'touch' ? 9 : 4)) cur.moved = true;
      if (ED.tool === 'erase') { const p = api.groundAt(ev); if (p && strokeOpen) eraseAt(p.x, p.z); return; }
      if (drag) {
        if (!cur.moved) return; const p = api.groundAt(ev); if (!p) return;
        if (drag.k === 'dec') {
          const it = drag.it, x = clamp(snap(p.x + drag.off[0], 1), -560, 560), z = clamp(snap(p.z + drag.off[1], 1), -420, 460);
          if (!drag.started) { drag.started = true; push(); api.decSet(it.id, { lift: true }); api.decFlush(); drag.clone = api.decModel(it); api.scene.add(drag.clone); }
          it.x = x; it.z = z; placeClone(drag.clone, x, z, it.r, it.s); circ.position.set(x, 0.55, z);
        } else {
          if (!drag.started) { drag.started = true; push(); }
          drag.b.set(clamp(snap(p.x + drag.off[0], 2), -560, 560), clamp(snap(p.z + drag.off[1], 2), -420, 460), drag.rot); updateMarker();
        }
        return;
      }
      if (cur.moved) api.panPx(dx, dy);
    };
    ED.up = (ev) => {
      const c = cur; cur = null;
      if (strokeOpen) { strokeOpen = false; eraser.visible = false; fire(); return; }
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
    ED.cancel = () => { cur = null; if (drag && drag.clone) api.scene.remove(drag.clone); if (drag && drag.k === 'dec') { api.decSet(drag.it.id, { lift: false }); api.decFlush(); } drag = null; strokeOpen = false; eraser.visible = false; };
    return ED;
  }

  root.FarmEditor = { create };
})();
