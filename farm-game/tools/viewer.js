/* Просмотр моделей. Параметры: ?kind=building&name=barn&angle=0..5&level=3
   или ?kind=building&all=1 — все модели этого вида в сетке (контактный лист). Готовность: window.__ready = true */
(function () {
  const T = THREE, q = new URLSearchParams(location.search);
  const kind = q.get('kind') || 'building', name = q.get('name'), angle = +(q.get('angle') || 0), level = +(q.get('level') || 1), all = q.get('all');
  const canvas = document.getElementById('c'), W = canvas.width, H = canvas.height;
  const r = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H, false); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(); scene.background = new T.Color(0xa4c4d8);
  const hemi = new T.HemisphereLight(0xd6e2ec, 0x4a5530, 0.75); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe9c4, 1.0); sun.position.set(30, 50, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.far = 200; scene.add(sun);
  const C = window.FarmCore;
  const ground = new T.Mesh(new T.PlaneGeometry(400, 400), C.texMat('grass', 100, 100, 0x6fae4f)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const cam = new T.PerspectiveCamera(40, W / H, 0.1, 1000);
  const items = [];
  if (all) { const names = window.FarmModels.list(kind); names.forEach((n) => { const m = window.FarmModels.make(kind, n, { level }); if (m) { m.userData.n = n; items.push(m); } }); }
  else { const m = window.FarmModels.make(kind, name, { level }); if (m) items.push(m); else document.title = 'MISSING ' + kind + ':' + name; }
  const box = new T.Box3(); let x = 0, rowZ = 0, rowH = 0; const per = all ? Math.ceil(Math.sqrt(items.length)) : 1;
  items.forEach((m, i) => {
    const b = new T.Box3().setFromObject(m), sz = b.getSize(new T.Vector3()), gap = 4;
    m.position.set(x + sz.x / 2 - (b.min.x + sz.x / 2), 0, rowZ + sz.z / 2 - (b.min.z + sz.z / 2) + 0); m.position.x += 0;
    x += sz.x + gap; rowH = Math.max(rowH, sz.z + gap); if ((i + 1) % per === 0) { x = 0; rowZ += rowH; rowH = 0; }
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(m);
  });
  scene.updateMatrixWorld(true); items.forEach((m) => box.expandByObject(m));
  const ctr = box.getCenter(new T.Vector3()), rad = Math.max(box.getSize(new T.Vector3()).length() * 0.6, 3);
  const az = (angle * 60 + 30) * Math.PI / 180, el = (all ? 55 : 32) * Math.PI / 180, dist = rad / Math.sin(20 * Math.PI / 180) * 0.62;
  cam.position.set(ctr.x + Math.sin(az) * Math.cos(el) * dist, ctr.y + Math.sin(el) * dist, ctr.z + Math.cos(az) * Math.cos(el) * dist); cam.lookAt(ctr);
  const label = document.createElement('div'); label.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:14px sans-serif;text-shadow:0 1px 2px #000'; label.textContent = items.map((m) => m.userData.n || name).join(', ') + ' · ' + kind + ' · level ' + level; document.body.appendChild(label);
  function go() { r.render(scene, cam); window.__ready = true; window.__count = items.length; }
  setTimeout(go, 600); setTimeout(go, 1500);
})();
