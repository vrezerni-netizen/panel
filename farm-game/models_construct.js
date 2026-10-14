/* Процедурные модели стройки (kind 'construct'): shed, house, barn (opts.stage 0..4) и sign. Three.js r128, без внешних файлов.
   Перед = +Z, начало координат = центр площадки на земле, 1 единица ≈ 1 м. Здания растут по стадиям на одном и том же основании. */
(function () {
  'use strict';
  const C = window.FarmCore, FM = window.FarmModels;
  if (!C || !FM) return;
  const T = C.T, PI = Math.PI, TAU = PI * 2;

  // ------------------------------------------------------------------ утилиты
  function lcg(seed) { let s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const rgb = (r, g, b, a) => a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  function pn(seed, per) { // периодический value-noise
    const r = lcg(seed), L = new Float32Array(per * per); for (let i = 0; i < L.length; i++) L[i] = r();
    return (u, v) => {
      u = (u - Math.floor(u)) * per; v = (v - Math.floor(v)) * per;
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
      const a = L[y0 * per + x0], b = L[y0 * per + x1], c = L[y1 * per + x0], d = L[y1 * per + x1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }
  function fbm(seed, base) { const n = [pn(seed, base), pn(seed + 1, base * 2), pn(seed + 2, base * 4), pn(seed + 3, base * 8)]; return (u, v) => n[0](u, v) * 0.5 + n[1](u, v) * 0.27 + n[2](u, v) * 0.15 + n[3](u, v) * 0.08; }
  function pix(S, fn) { return (cv, g) => { const im = g.createImageData(S, S), d = im.data; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = fn(x / S, y / S, x, y), i = (y * S + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } g.putImageData(im, 0, 0); }; }
  function wrap9(S, x, y, rad, fn) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx * S, Y = y + dy * S; if (X + rad < 0 || Y + rad < 0 || X - rad > S || Y - rad > S) continue; fn(X, Y); } }
  function blotches(g, S, r, n, rmin, rmax, col, amin, amax) {
    for (let i = 0; i < n; i++) { const x = r() * S, y = r() * S, rad = rmin + r() * (rmax - rmin), a = amin + r() * (amax - amin); wrap9(S, x, y, rad, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, rgb(col[0], col[1], col[2], a)); gr.addColorStop(1, rgb(col[0], col[1], col[2], 0)); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); }); }
  }

  // ------------------------------------------------------------------ текстуры (серые/цветные; тонируются материалом)
  C.addProc('cn_concrete', pix(256, (() => { const a = fbm(5, 4), b = fbm(9, 8), c = fbm(21, 3); return (u, v, x, y) => {
    let l = 172 + (a(u, v) - 0.5) * 46 + (b(u * 2, v * 2) - 0.5) * 20 + (hash2(x, y) - 0.5) * 20;
    if (hash2(x * 1.7 + 3, y * 1.3) > 0.993) l -= 48;
    const st = Math.max(0, c(u, v) - 0.55) * 60;
    return [l - st * 0.4, l - st * 0.55 - 1, l - st * 0.9 - 4];
  }; })()), 256);
  C.addProc('cn_dirt', pix(256, (() => { const a = fbm(31, 4), b = fbm(37, 8), c = fbm(41, 16); return (u, v, x, y) => {
    const k = a(u, v), m = b(u, v), cl = c(u, v);
    let l = 0.62 + (k - 0.5) * 0.6 + (m - 0.5) * 0.35 + (cl - 0.5) * 0.25 + (hash2(x, y) - 0.5) * 0.18;
    let r = 112 * l, g = 86 * l, bl = 60 * l;
    if (hash2(x * 2.3 + 1, y * 1.9) > 0.985) { r += 50; g += 46; bl += 38; }
    return [r, g, bl];
  }; })()), 256);
  C.addProc('cn_plaster', pix(256, (() => { const a = fbm(51, 4), b = fbm(55, 8); return (u, v, x, y) => {
    const l = 238 + (a(u, v) - 0.5) * 24 + (b(u, v) - 0.5) * 12 + (hash2(x, y) - 0.5) * 8; const st = Math.max(0, fbm(61, 3)(u, v) - 0.6) * 50;
    return [l - st * 0.3, l - 2 - st * 0.5, l - 8 - st * 0.8];
  }; })()), 256);
  C.addProc('cn_timber', pix(256, (() => { const s1 = pn(71, 16), s2 = pn(73, 32), s3 = pn(77, 6), kn = pn(79, 4); return (u, v, x, y) => {
    let t = 0.84 + (s1(u * 10, v) - 0.5) * 0.3 + (s2(u * 36, v * 2) - 0.5) * 0.14;
    t += Math.sin((u + (s3(u * 2, v) - 0.5) * 0.25) * TAU * 6) * 0.045;
    const k = kn(u * 2, v * 2); if (k > 0.82) t -= (k - 0.82) * 1.6;
    return [t * 255, t * 238, t * 212];
  }; })()), 256);
  C.addProc('cn_boards', (cv, g) => {
    const S = 512, r = lcg(23), n = 8, w = S / n; g.fillStyle = '#777'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) {
      const L = 0.62 + r() * 0.3, x0 = i * w;
      g.fillStyle = rgb(L * 255, L * 249, L * 241); g.fillRect(x0, 0, w, S);
      const gr = g.createLinearGradient(x0, 0, x0 + w, 0); gr.addColorStop(0, rgb(0, 0, 0, 0.22)); gr.addColorStop(0.14, rgb(0, 0, 0, 0.02)); gr.addColorStop(0.55, rgb(255, 255, 255, 0.06)); gr.addColorStop(1, rgb(0, 0, 0, 0.2)); g.fillStyle = gr; g.fillRect(x0, 0, w, S);
      for (let k = 0; k < 28; k++) {
        const x = x0 + 3 + r() * (w - 6), a = 0.04 + r() * 0.16, ph = r() * 6, am = 0.5 + r() * 1.6, f = (1 + Math.floor(r() * 3)) * TAU / S;
        g.strokeStyle = r() < 0.75 ? rgb(35, 24, 14, a) : rgb(255, 245, 230, a * 0.7); g.lineWidth = 0.6 + r() * 1.2; g.beginPath();
        for (let y = 0; y <= S; y += 16) { const xx = x + Math.sin(y * f + ph) * am; y === 0 ? g.moveTo(xx, y) : g.lineTo(xx, y); } g.stroke();
      }
      if (r() < 0.6) { const kx = x0 + w * (0.25 + r() * 0.5), ky = 30 + r() * (S - 60); for (let q = 3; q >= 1; q--) { g.fillStyle = rgb(40, 26, 14, 0.2 + (4 - q) * 0.1); g.beginPath(); g.ellipse(kx, ky, 2.5 + q * 2.2, 5 + q * 4.5, 0, 0, TAU); g.fill(); } }
      g.fillStyle = rgb(10, 6, 3, 0.85); g.fillRect(x0 + w - 3, 0, 3, S); g.fillStyle = rgb(255, 248, 235, 0.25); g.fillRect(x0, 0, 1.5, S);
      for (let y = 40; y < S; y += 128) { g.fillStyle = rgb(30, 30, 34, 0.65); g.beginPath(); g.arc(x0 + 9, y, 1.7, 0, TAU); g.arc(x0 + w - 12, y + 3, 1.7, 0, TAU); g.fill(); g.fillStyle = rgb(90, 50, 30, 0.18); g.fillRect(x0 + 8, y + 2, 2, 20); g.fillRect(x0 + w - 13, y + 5, 2, 20); }
    }
    blotches(g, S, r, 26, 40, 110, [40, 30, 20], 0.05, 0.13); blotches(g, S, r, 14, 30, 80, [235, 235, 230], 0.04, 0.09);
  }, 512);
  C.addProc('cn_tile', (cv, g) => {
    const S = 256, r = lcg(31), cols = 8, rows = 8, tw = S / cols, th = S / rows, ov = th * 0.2; g.fillStyle = rgb(48, 22, 15); g.fillRect(0, 0, S, S);
    for (let row = rows - 1; row >= 0; row--) for (let c = -1; c <= cols; c++) for (const dy of [0, -S]) {
      const x = c * tw + (row % 2 ? tw / 2 : 0), y = row * th + dy, k = (r() - 0.5) * 34, dark = r() < 0.1 ? -22 : 0, h = th + ov;
      const gr = g.createLinearGradient(0, y, 0, y + h); const R = 170 + k + dark, G = 74 + k * 0.6 + dark * 0.6, B = 48 + k * 0.45 + dark * 0.4;
      gr.addColorStop(0, rgb(R * 0.62, G * 0.62, B * 0.62)); gr.addColorStop(0.3, rgb(R * 0.95, G * 0.95, B * 0.95)); gr.addColorStop(0.78, rgb(R * 1.08, G * 1.08, B * 1.08)); gr.addColorStop(1, rgb(R * 0.7, G * 0.7, B * 0.7));
      g.fillStyle = gr; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + tw - 1, y); g.lineTo(x + tw - 1, y + h - 8); g.quadraticCurveTo(x + tw - 1, y + h, x + tw - 9, y + h); g.lineTo(x + 9, y + h); g.quadraticCurveTo(x + 1, y + h, x + 1, y + h - 8); g.closePath(); g.fill();
      g.strokeStyle = rgb(30, 12, 8, 0.7); g.lineWidth = 1.4; g.stroke(); g.fillStyle = rgb(255, 220, 190, 0.1); g.fillRect(x + tw * 0.28, y + 3, tw * 0.22, h - 9);
    }
    blotches(g, S, r, 18, 20, 60, [30, 40, 25], 0.05, 0.1);
  }, 256);
  C.addProc('cn_corr', (cv, g) => {
    pix(256, (() => { const f = fbm(81, 4), st = pn(83, 32); return (u, v, x, y) => {
      const s = 0.5 + 0.5 * Math.sin(u * TAU * 8), l = 0.5 + 0.46 * Math.pow(s, 0.8) + (st(u * 8, v) - 0.5) * 0.12, rust = Math.max(0, f(u, v) - 0.56) * 2.2, L = l * 255;
      return [L * (1 + rust * 0.5), L * (1 - rust * 0.12), L * (1 - rust * 0.45)];
    }; })())(cv, g);
    const r = lcg(87); g.fillStyle = rgb(0, 0, 0, 0.4); g.fillRect(0, 0, 256, 2); g.fillStyle = rgb(255, 255, 255, 0.22); g.fillRect(0, 2, 256, 2);
    for (let y = 40; y < 256; y += 120) for (let i = 0; i < 8; i += 2) { const x = (i + 0.5) * 32; g.fillStyle = rgb(25, 25, 28, 0.7); g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); g.fillStyle = rgb(255, 255, 255, 0.35); g.fillRect(x - 1, y - 3, 1.5, 1.5); }
    for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? rgb(70, 50, 35, r() * 0.12) : rgb(255, 255, 255, r() * 0.1); g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 6 + r() * 30); }
  }, 256);
  C.addProc('cn_brick', (cv, g) => {
    const S = 256, r = lcg(91), cols = 8, rows = 16, bw = S / cols, bh = S / rows; g.fillStyle = rgb(196, 188, 172); g.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) for (let c = -1; c <= cols; c++) {
      const x = c * bw + (row % 2) * bw / 2, y = row * bh, k = (r() - 0.5) * 38, d = r() < 0.08 ? -30 : 0;
      g.fillStyle = rgb(160 + k + d, 78 + k * 0.6 + d * 0.6, 58 + k * 0.5 + d * 0.5); g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      g.fillStyle = rgb(255, 235, 210, 0.12); g.fillRect(x + 1, y + 1, bw - 2, 2); g.fillStyle = rgb(0, 0, 0, 0.16); g.fillRect(x + 1, y + bh - 3, bw - 2, 2);
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = rgb(40, 25, 15, r() * 0.08); g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
    blotches(g, S, r, 10, 30, 70, [50, 40, 30], 0.05, 0.1);
  }, 256);
  C.addProc('cn_stone', (cv, g) => {
    const S = 512, r = lcg(97), rows = 8; g.fillStyle = rgb(86, 80, 72); g.fillRect(0, 0, S, S);
    const hs = []; let sum = 0; for (let i = 0; i < rows; i++) { hs.push(0.7 + r() * 0.6); sum += hs[i]; }
    let y = 0;
    for (let row = 0; row < rows; row++) {
      const h = hs[row] / sum * S, ws = []; let ss = 0; for (let i = 0; i < 4; i++) { ws.push(0.6 + r() * 0.8); ss += ws[i]; }
      let x = -r() * 30;
      for (let i = 0; i < 4; i++) {
        const w = ws[i] / ss * S, x0 = x + 2.5, y0 = y + 2.5, w0 = w - 5, h0 = h - 5, rr = 10 + r() * 10, base = 128 + (r() - 0.5) * 60, warm = r() * 14;
        for (const dx of [0, -S]) {
          const gr = g.createLinearGradient(x0 + dx, y0, x0 + dx + w0 * 0.5, y0 + h0); gr.addColorStop(0, rgb(base + 28 + warm, base + 24 + warm * 0.6, base + 14)); gr.addColorStop(1, rgb(base - 24 + warm, base - 24 + warm * 0.6, base - 30));
          g.fillStyle = gr; g.beginPath(); g.moveTo(x0 + dx + rr, y0); g.lineTo(x0 + dx + w0 - rr, y0); g.quadraticCurveTo(x0 + dx + w0, y0, x0 + dx + w0, y0 + rr); g.lineTo(x0 + dx + w0, y0 + h0 - rr); g.quadraticCurveTo(x0 + dx + w0, y0 + h0, x0 + dx + w0 - rr, y0 + h0); g.lineTo(x0 + dx + rr, y0 + h0); g.quadraticCurveTo(x0 + dx, y0 + h0, x0 + dx, y0 + h0 - rr); g.lineTo(x0 + dx, y0 + rr); g.quadraticCurveTo(x0 + dx, y0, x0 + dx + rr, y0); g.fill();
        }
        x += w;
      }
      y += h;
    }
    for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? rgb(40, 36, 30, r() * 0.14) : rgb(255, 250, 240, r() * 0.1); g.fillRect(r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 2.5); }
    blotches(g, S, r, 16, 30, 90, [40, 50, 30], 0.05, 0.1);
  }, 512);
  C.addProc('cn_stripe', pix(128, (() => { const nz = pn(101, 8); return (u, v, x, y) => {
    const t = (u + v) - Math.floor(u + v), e = 0.012, d = Math.min(Math.abs(t - 0.5), Math.min(t, 1 - t)), mix = clamp(d / e, 0, 1);
    let col; const orange = t < 0.5; const sc = 1 + (nz(u * 4, v * 4) - 0.5) * 0.14 + (hash2(x, y) - 0.5) * 0.06;
    col = orange ? [236, 104, 22] : [240, 238, 230]; if (d < e) { const o2 = orange ? [240, 238, 230] : [236, 104, 22]; col = col.map((c, i) => lerp(o2[i], c, 0.5 + 0.5 * mix)); }
    return [col[0] * sc, col[1] * sc, col[2] * sc];
  }; })()), 128);
  C.addProc('cn_sign', (cv, g) => {
    const S = 1024, y0 = S * 0.17, H = S * 0.66, r = lcg(113), ff = '"DejaVu Sans","Liberation Sans",Arial,Helvetica,sans-serif';
    g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, S, S); g.fillStyle = '#f2b100'; g.fillRect(0, y0, S, H);
    g.save(); g.beginPath(); g.rect(22, y0 + 22, S - 44, 74); g.clip(); g.fillStyle = '#16140e'; g.fillRect(22, y0 + 22, S - 44, 74);
    g.fillStyle = '#f2b100'; for (let x = -100; x < S + 100; x += 76) { g.beginPath(); g.moveTo(x, y0 + 96); g.lineTo(x + 38, y0 + 96); g.lineTo(x + 38 + 74, y0 + 22); g.lineTo(x + 74, y0 + 22); g.closePath(); g.fill(); } g.restore();
    g.strokeStyle = '#16140e'; g.lineWidth = 14; g.strokeRect(10, y0 + 10, S - 20, H - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (txt, wgt, maxW, size) => { g.font = `${wgt} ${size}px ${ff}`; const w = g.measureText(txt).width; if (w > maxW) size *= maxW / w; g.font = `${wgt} ${size}px ${ff}`; return size; };
    fit('СТРОЙКА', 'bold', 880, 220); g.fillStyle = '#16140e'; g.fillText('СТРОЙКА', S / 2, y0 + 235);
    g.fillRect(70, y0 + 345, S - 140, 8);
    g.fillStyle = '#16140e'; g.fillRect(70, y0 + 375, S - 140, 130); fit('Свободный участок', 'bold', 840, 92); g.fillStyle = '#fff6d8'; g.fillText('Свободный участок', S / 2, y0 + 442);
    fit('ВХОД ПОСТОРОННИМ ВОСПРЕЩЁН', 'bold', 820, 44); g.fillStyle = '#16140e'; g.fillText('ВХОД ПОСТОРОННИМ ВОСПРЕЩЁН', S / 2, y0 + 560);
    blotches(g, S, r, 30, 20, 70, [60, 40, 10], 0.05, 0.12);
    for (let i = 0; i < 260; i++) { g.fillStyle = rgb(40, 30, 10, r() * 0.25); g.fillRect(r() * S, y0 + r() * H, 1 + r() * 3, 1 + r() * 3); }
    g.fillStyle = rgb(70, 70, 70); for (const [px, py] of [[30, 34], [S - 30, 34], [30, H - 14], [S - 30, H - 14]]) { g.beginPath(); g.arc(px, y0 + py, 6, 0, TAU); g.fill(); }
  }, 1024);

  // ------------------------------------------------------------------ материалы и «спецификации» поверхностей
  const lamCache = {};
  const lam = (c) => lamCache[c] || (lamCache[c] = new T.MeshLambertMaterial({ color: c }));
  const col = (c) => ({ tex: false, mat: lam(c) });
  const tex = (name, tint, su, sv, grain) => ({ tex: true, mat: C.texMat(name, 1, 1, tint, 0, 0, 0, { color: tint }), su, sv, grain });
  const steel = (c) => ({ tex: false, mat: C.metal(c || 0xb5babf, { roughness: 0.42 }) });
  const K = { black: col(0x1b1c1e), dark: col(0x2e3033), rubber: col(0x1a1a1c), white: col(0xeeebe2), grey: col(0x8c8f91), steelDk: col(0x5a5f64) };

  // ------------------------------------------------------------------ строитель: текущая группа, примитивы
  let cur = null, RND = null, GL = null;
  function begin(seed) { cur = new T.Group(); RND = lcg(seed); GL = []; return cur; }
  function sub(x, y, z, ry, fn) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); g.rotation.y = ry || 0; const prev = cur; prev.add(g); cur = g; try { fn(); } finally { cur = prev; } return g; }
  function projUV(g, s, off, grain) {
    const p = g.attributes.position; if (!g.attributes.normal) g.computeVertexNormals(); const n = g.attributes.normal, uv = new Float32Array(p.count * 2), gr = grain || s.grain || 'b', su = s.su, sv = s.sv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + off[0], y = p.getY(i) + off[1], z = p.getZ(i) + off[2], ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let a, b, an, bn;
      if (ax >= ay && ax >= az) { a = z; b = y; an = 'z'; bn = 'y'; } else if (ay >= az) { a = x; b = z; an = 'x'; bn = 'z'; } else { a = x; b = y; an = 'x'; bn = 'y'; }
      const swap = gr === 'a' ? true : gr === 'b' ? false : an === gr;
      uv[i * 2] = swap ? b / su : a / su; uv[i * 2 + 1] = swap ? a / sv : b / sv;
    }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  }
  function put(s, g, x, y, z, ry, rx, rz, grain, w, h, d) {
    if (s.tex) {
      let gr = grain; if (!gr && s.grain === 'L' && w != null) gr = (w >= h && w >= d) ? 'x' : (h >= d ? 'y' : 'z');
      const rot = ry || rx || rz; projUV(g, s, rot ? [RND() * 9, RND() * 9, RND() * 9] : [x, y, z], gr);
    }
    const m = new T.Mesh(g, s.mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.order = 'YXZ'; m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; m.receiveShadow = true; cur.add(m); return m;
  }
  const bx = (s, w, h, d, x, y, z, ry, rx, rz) => put(s, new T.BoxGeometry(w, h, d), x, y, z, ry, rx, rz, null, w, h, d);
  const cyl = (s, rt, rb, h, x, y, z, seg, rx, rz, open) => put(s, new T.CylinderGeometry(rt, rb, h, seg || 12, 1, !!open), x, y, z, 0, rx, rz);
  const sph = (s, r, x, y, z, sx, sy, sz, ws, hs) => { const g = new T.SphereGeometry(r, ws || 10, hs || 8); if (sx != null) g.scale(sx, sy, sz); return put(s, g, x, y, z); };
  const lathe = (s, pts, seg, x, y, z, rx, rz) => put(s, new T.LatheGeometry(pts.map((p) => new T.Vector2(p[0], p[1])), seg || 16), x, y, z, 0, rx, rz);
  const rbx = (s, w, h, d, r, x, y, z, ry, rx, rz) => put(s, C.rbox(w, h, d, r, 2), x, y, z, ry, rx, rz, null, w, h, d);
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3(), _m = new T.Matrix4();
  /** Брус между двумя точками: w — ширина (поперёк, ⟂ up), h — высота сечения (вдоль up), up — подсказка «вверх». */
  function beam(s, p, q, w, h, up) {
    const dir = _a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = dir.length(); if (L < 1e-5) return null; dir.normalize();
    const u = _b.set(up ? up[0] : 0, up ? up[1] : 1, up ? up[2] : 0); const xa = _c.crossVectors(u, dir);
    if (xa.lengthSq() < 1e-6) { u.set(0, 0, 1); xa.crossVectors(u, dir); if (xa.lengthSq() < 1e-6) { u.set(1, 0, 0); xa.crossVectors(u, dir); } }
    xa.normalize(); const ya = _d.crossVectors(dir, xa); _m.makeBasis(xa, ya, dir);
    const m = put(s, new T.BoxGeometry(w, h, L), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, 0, 0, 0, 'z');
    m.quaternion.setFromRotationMatrix(_m); m.rotation.order = 'XYZ'; return m;
  }
  /** Круглая труба между двумя точками. */
  function tube(s, p, q, r, seg, open) {
    const dir = _a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = dir.length(); if (L < 1e-5) return null; dir.normalize();
    const m = put(s, new T.CylinderGeometry(r, r, L, seg || 8, 1, open !== false), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    m.quaternion.setFromUnitVectors(_b.set(0, 1, 0), dir); return m;
  }
  /** Плоский многоугольник (контур [[x,y]...], отверстия), выдавленный по Z на толщину d (центрирован), опционально с фаской. */
  function poly(s, pts, holes, d, x, y, z, ry, bev) {
    const sh = new T.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    for (const h of holes || []) { const path = new T.Path(); h.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]))); sh.holes.push(path); }
    const b = bev || 0, g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: !!b, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    if (s.tex) projUV(g, s, [x || 0, y || 0, z || 0], s.grain === 'L' ? 'y' : null);
    const m = new T.Mesh(g, s.mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.y = ry || 0; m.castShadow = m.receiveShadow = true; cur.add(m); return m;
  }
  /** Боковой профиль [[вперёд,вверх]...], выдавленный на ширину w по X (центр), «вперёд» = +Z. */
  function prof(s, pts, w, bev, x, y, z, ry) {
    const sh = new T.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const b = bev || 0, g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, w - 2 * b), bevelEnabled: !!b, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(w - 2 * b) / 2); g.rotateY(-PI / 2);
    return put(s, g, x, y, z, ry);
  }
  function pane(w, h, x, y, z, ry) { const g = new T.BoxGeometry(w, h, 0.014); g.rotateY(ry || 0); g.translate(x, y, z); GL.push({ g, grp: cur }); }
  function finish(root, glassTint) {
    root.updateMatrixWorld(true);
    const old = Math.random; Math.random = lcg(4242); let out; try { out = C.bakeTex(root); } finally { Math.random = old; }
    if (GL.length) {
      const pos = [], nor = [];
      for (const e of GL) { let g = e.g.index ? e.g.toNonIndexed() : e.g; g.applyMatrix4(e.grp.matrixWorld); const pa = g.attributes.position, na = g.attributes.normal; for (let i = 0; i < pa.count; i++) { pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); } }
      const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); gg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      const gm = new T.Mesh(gg, C.glassM(glassTint || 0x8fb4c8)); gm.castShadow = false; gm.receiveShadow = false; gm.renderOrder = 2; out.add(gm);
    }
    return out;
  }

  // ------------------------------------------------------------------ общие материалы (по умолчанию)
  const M = {
    conc: () => tex('cn_concrete', 0xdad8d2, 3, 3, 'b'),
    dirt: () => tex('cn_dirt', 0xffffff, 3.5, 3.5, 'b'),
    pine: () => tex('cn_timber', 0xe9c590, 1.0, 1.0, 'L'),
    oldwood: () => tex('cn_timber', 0xa58a68, 1.0, 1.0, 'L'),
    stripe: () => tex('cn_stripe', 0xffffff, 0.5, 0.5, 'b'),
    sand: () => tex('cn_concrete', 0xfff0c4, 2.2, 2.2, 'b'),
    gravel: () => tex('cn_concrete', 0xb4b2ad, 0.9, 0.9, 'b'),
  };

  // ------------------------------------------------------------------ реквизит
  /** Пятно уплотнённой земли вокруг стройки (скруглённый прямоугольник с неровным краем). */
  function dirtPatch(cx, cz, hw, hd, seed) {
    const r = lcg(seed || 5), N = 56, pts = [], p1 = r() * 6, p2 = r() * 6, e = 5;
    for (let i = 0; i < N; i++) { const t = i / N * TAU, c = Math.cos(t), s = Math.sin(t), k = 1 + 0.045 * Math.sin(t * 5 + p1) + 0.035 * Math.sin(t * 9 + p2); pts.push([hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * k, hd * Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * k]); }
    const sh = new T.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const g = new T.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.18, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-PI / 2); g.translate(0, 0.03, 0); const s = M.dirt(); projUV(g, s, [cx, 0, cz], 'b'); const m = new T.Mesh(g, s.mat); m.position.set(cx, 0, cz); m.castShadow = false; m.receiveShadow = true; cur.add(m);
  }
  function smoothNormals(g) {
    g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal, map = new Map();
    for (let i = 0; i < p.count; i++) { const k = Math.round(p.getX(i) * 1e3) + '_' + Math.round(p.getY(i) * 1e3) + '_' + Math.round(p.getZ(i) * 1e3); const e = map.get(k); if (e) e.push(i); else map.set(k, [i]); }
    for (const ids of map.values()) { if (ids.length < 2) continue; let x = 0, y = 0, z = 0; for (const i of ids) { x += n.getX(i); y += n.getY(i); z += n.getZ(i); } const l = Math.hypot(x, y, z) || 1; for (const i of ids) n.setXYZ(i, x / l, y / l, z / l); }
  }
  /** Куча сыпучего: бугристый конус с мягкой вершиной + россыпь камешков. */
  function pile(cx, cz, rad, h, spec, kind, seed, stones) {
    const r = lcg(seed), pts = [], seg = 30, ring = 14, ph = [r() * 6, r() * 6, r() * 6];
    for (let j = 0; j <= ring; j++) { const t = j / ring, rr = rad * (1 - Math.pow(t, 1.15)), y = h * (1 - Math.pow(1 - t, 1.7)) ; pts.push([Math.max(0.002, rr), y]); }
    const g = new T.LatheGeometry(pts.map((p) => new T.Vector2(p[0], p[1])), seg), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), a = Math.atan2(z, x), t = Math.hypot(x, z) / rad;
      const k = 1 + 0.1 * Math.sin(a * 2 + ph[0]) + 0.06 * Math.sin(a * 5 + ph[1]) + 0.025 * Math.sin(a * 11 + ph[2]) * (1 - t), kh = 1 + 0.08 * Math.sin(a * 3 + ph[1] + t * 4) + 0.04 * Math.sin(a * 8 + ph[0] - t * 6);
      pa.setXYZ(i, x * k, y * kh, z * k);
    }
    smoothNormals(g); put(spec, g, cx, 0, cz, 0, 0, 0, 'b');
    for (let i = 0; i < (stones == null ? (kind === 'gravel' ? 26 : 5) : stones); i++) {
      const a = r() * TAU, t = Math.sqrt(r()) * 0.85, rr = rad * t * 0.85, y = h * (1 - Math.pow(1 - (1 - t), 1.7)) * 0.95, sz = kind === 'gravel' ? 0.06 + r() * 0.06 : 0.07 + r() * 0.08;
      const gg = new T.IcosahedronGeometry(sz, 1); gg.scale(1 + r() * 0.4, 0.6 + r() * 0.3, 1 + r() * 0.4);
      put(col(kind === 'gravel' ? [0x7c7a75, 0x96928a, 0x6a6864, 0xa59f93][i % 4] : [0xa38e63, 0xb59d70, 0x8d7a54][i % 3]), gg, cx + Math.cos(a) * rr, y + sz * 0.1, cz + Math.sin(a) * rr, r() * 3, r() * 3, r() * 3);
    }
  }
  /** Куча песка и куча щебня рядом. */
  function sandGravel(x, z, rot) {
    sub(x, 0, z, rot || 0, () => {
      pile(0, 0, 1.7, 1.15, M.sand(), 'sand', 11); pile(2.9, 0.4, 1.35, 0.9, M.gravel(), 'gravel', 12);
      // лопата воткнута в песок
      bx(col(0x6a4a2c), 0.035, 1.2, 0.035, -0.55, 1.15, 0.2, 0, 0.5, -0.18); bx(col(0x7a8086), 0.2, 0.26, 0.012, -0.2, 0.62, 0.0, 0, 0.5, -0.18);
    });
  }
  function boardStack(x, z, ry, len, layers, spec, seed) {
    const r = lcg(seed || 3), s = spec || M.pine();
    sub(x, 0, z, ry, () => {
      for (const px of [-len * 0.38, 0, len * 0.38]) bx(M.oldwood(), 0.1, 0.1, 0.9, px, 0.05, 0);
      for (let l = 0; l < layers; l++) for (let i = 0; i < 4; i++) {
        const L = len * (0.96 + r() * 0.04), y = 0.1 + l * 0.05 + 0.025; bx(s, L, 0.05, 0.2, (r() - 0.5) * 0.06, y, -0.33 + i * 0.22 + (r() - 0.5) * 0.015);
      }
      for (const px of [-len * 0.38, len * 0.38]) { bx(M.oldwood(), 0.09, 0.05, 0.9, px, 0.1 + layers * 0.05 + 0.025, 0); }
      bx(K.black, 0.5, 0.01, 0.5, 0, 0.1 + layers * 0.05 + 0.08, 0.1, 0.4);
    });
  }
  function sawhorse(x, z, ry) {
    sub(x, 0, z, ry, () => {
      const s = M.pine(); bx(s, 1.1, 0.09, 0.09, 0, 0.78, 0);
      for (const sx of [-0.42, 0.42]) for (const sz of [-1, 1]) beam(s, [sx, 0.77, 0], [sx + (sx > 0 ? 0.08 : -0.08), 0, sz * 0.32], 0.07, 0.07);
      bx(s, 0.04, 0.04, 0.0, 0, 0.4, 0); bx(s, 1.0, 0.04, 0.2, 0, 0.84, 0.0);
    });
  }
  function ladder(x, z, ry, tilt, len) {
    len = len || 4.2; sub(x, 0, z, ry, () => {
      const s = M.pine(), c = Math.cos(tilt), sn = Math.sin(tilt), n = Math.floor(len / 0.3);
      for (const sx of [-0.23, 0.23]) beam(s, [sx, 0, 0], [sx, len * c, -len * sn], 0.05, 0.075, [1, 0, 0]);
      for (let i = 1; i <= n; i++) { const t = i * 0.3; tube(steel(0xa0a4a8), [-0.23, t * c, -t * sn], [0.23, t * c, -t * sn], 0.014, 6); }
    });
  }
  function palletsAt(x, z, ry, n, seed, hs) {
    const r = lcg(seed || 1);
    sub(x, 0, z, ry, () => {
      const s = M.oldwood();
      for (let i = 0; i < n; i++) {
        sub((r() - 0.5) * 0.08, 0.144 * i, (r() - 0.5) * 0.08, (r() - 0.5) * 0.1, () => {
          for (let k = 0; k < 5; k++) bx(s, 1.2, 0.022, 0.145, 0, 0.133, -0.34 + k * 0.17);
          for (let k = 0; k < 3; k++) bx(s, 1.2, 0.022, 0.1, 0, 0.011, -0.35 + k * 0.35);
          for (const px of [-0.55, 0, 0.55]) for (const pz of [-0.33, 0, 0.33]) bx(s, 0.1, 0.1, 0.1, px, 0.072, pz);
        });
      }
    });
  }
  function leanPallet(x, z, ry, lean) {
    sub(x, 0, z, ry, () => { const s = M.oldwood(); sub(0, 0.6, 0, 0, () => { cur.rotation.x = -lean; cur.rotation.order = 'YXZ'; for (let k = 0; k < 5; k++) bx(s, 1.2, 0.022, 0.145, 0, 0.0, -0.34 + k * 0.17); for (let k = 0; k < 3; k++) bx(s, 1.2, 0.1, 0.022, 0, 0, -0.35 + k * 0.35, 0, 0, 0); }); });
  }
  function cone(x, z, ry) {
    sub(x, 0, z, ry || 0, () => {
      bx(K.black, 0.38, 0.03, 0.38, 0, 0.015, 0); const or = col(0xe9570f), wh = col(0xf1efe8);
      cyl(or, 0.035, 0.145, 0.66, 0, 0.36, 0, 14, 0, 0, true); cyl(wh, 0.0885, 0.1055, 0.1, 0, 0.5, 0, 14, 0, 0, true); cyl(wh, 0.067, 0.0765, 0.07, 0, 0.64, 0, 14, 0, 0, true); cyl(or, 0.035, 0.035, 0.02, 0, 0.695, 0, 10);
      cyl(or, 0.15, 0.15, 0.025, 0, 0.04, 0, 14);
    });
  }
  function bucket(x, z, c, open, ry) {
    sub(x, 0, z, ry || 0, () => {
      cyl(col(0xd8d9d6), 0.14, 0.12, 0.34, 0, 0.17, 0, 16); cyl(col(c), 0.145, 0.145, 0.07, 0, 0.3, 0, 16); cyl(col(0x8a8d90), 0.148, 0.148, 0.012, 0, 0.12, 0, 16);
      if (open) { cyl(col(c), 0.125, 0.125, 0.015, 0, 0.345, 0, 16); } else { cyl(col(c), 0.147, 0.147, 0.02, 0, 0.345, 0, 16); }
      put(K.steelDk, new T.TorusGeometry(0.14, 0.006, 4, 12, PI), 0, 0.34, 0, 0, 0, 0);
    });
  }
  function wheelbarrow(x, z, ry) {
    sub(x, 0, z, ry, () => {
      const body = col(0xd8541c), fr = col(0x3a3d41), wood = M.pine();
      rbx(body, 0.58, 0.035, 0.74, 0.015, 0, 0.4, 0.14, 0, -0.08);
      for (const sx of [-0.3, 0.3]) prof(body, [[-0.5, 0.64], [-0.34, 0.4], [0.3, 0.43], [0.52, 0.74], [0.5, 0.75], [0.28, 0.46], [-0.34, 0.44], [-0.5, 0.65]], 0.028, 0, sx, 0, 0);
      bx(body, 0.6, 0.3, 0.03, 0, 0.58, 0.64, 0, -0.62); bx(body, 0.6, 0.24, 0.03, 0, 0.53, -0.45, 0, 0.3);
      for (const sx of [-0.2, 0.2]) { beam(wood, [sx, 0.48, -0.1], [sx * 1.4, 0.7, -1.18], 0.045, 0.045); beam(fr, [sx, 0.4, 0.2], [sx * 0.4, 0.24, 0.86], 0.035, 0.035); beam(fr, [sx * 1.05, 0.4, -0.55], [sx * 1.2, 0.0, -0.45], 0.035, 0.035); }
      bx(fr, 0.4, 0.03, 0.03, 0, 0.26, 0.86);
      put(K.rubber, new T.TorusGeometry(0.17, 0.06, 8, 18), 0, 0.23, 0.9, 0, PI / 2 * 0, 0).rotation.y = PI / 2;
      cyl(col(0x9ea3a8), 0.1, 0.1, 0.05, 0, 0.23, 0.9, 12, 0, PI / 2);
    });
  }
  function mixer(x, z, ry) {
    sub(x, 0, z, ry, () => {
      const or = col(0xe3701a), dk = col(0x35383c);
      for (const sx of [-0.42, 0.42]) { beam(dk, [sx, 0.85, 0], [sx * 1.2, 0.0, 0.5], 0.05, 0.05); beam(dk, [sx, 0.85, 0], [sx * 1.2, 0.0, -0.5], 0.05, 0.05); put(K.rubber, new T.TorusGeometry(0.17, 0.065, 8, 16), sx * 1.55, 0.24, 0.02, PI / 2); cyl(col(0xa0a4a8), 0.1, 0.1, 0.03, sx * 1.62, 0.24, 0.02, 10, 0, PI / 2); }
      cyl(dk, 0.03, 0.03, 1.1, 0, 0.24, 0.02, 8, 0, PI / 2);
      rbx(col(0xd9d9d4), 0.5, 0.34, 0.42, 0.05, 0, 0.62, -0.18);
      sub(0, 0.98, 0.0, 0, () => {
        cur.rotation.x = 0.7; cur.rotation.order = 'YXZ';
        lathe(or, [[0.001, -0.6], [0.16, -0.58], [0.34, -0.46], [0.46, -0.22], [0.5, 0.02], [0.48, 0.2], [0.38, 0.38], [0.29, 0.5], [0.27, 0.56]], 26, 0, 0, 0);
        cyl(col(0x1d1e20), 0.265, 0.265, 0.012, 0, 0.5, 0, 20); put(dk, new T.TorusGeometry(0.5, 0.03, 6, 26), 0, 0.02, 0, 0, PI / 2);
        put(dk, new T.TorusGeometry(0.27, 0.02, 6, 20), 0, 0.56, 0, 0, PI / 2);
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; bx(col(0xb8561a), 0.03, 0.34, 0.03, Math.cos(a) * 0.4, 0.02, Math.sin(a) * 0.4, -a, 0, 0); }
        cyl(col(0x777b80), 0.045, 0.045, 0.22, 0, -0.66, 0, 8);
      });
      bx(col(0xd9d9d4), 0.1, 0.1, 0.1, 0.5, 0.95, 0.0); cyl(dk, 0.025, 0.025, 0.3, 0.52, 1.0, 0.18, 8, PI / 2);
      bx(col(0xd8321c), 0.08, 0.05, 0.08, 0.4, 0.5, -0.38);
    });
  }
  /** Колышки с обноской (шнуры) вокруг будущего здания. */
  function survey(x0, x1, z0, z1, off, hgt) {
    const strCol = col(0xf2d21a), stake = M.pine(), board = M.pine(), paint = col(0xe8481c);
    const corners = [[x0, z0, -1, -1], [x1, z0, 1, -1], [x1, z1, 1, 1], [x0, z1, -1, 1]];
    for (const [cx, cz, sx, sz] of corners) {
      const px = cx + sx * off, pz = cz + sz * off;
      for (const dz of [-0.55, 0.55]) bx(stake, 0.05, 0.62, 0.05, px, 0.31, cz + dz);
      for (const dx of [-0.55, 0.55]) bx(stake, 0.05, 0.62, 0.05, cx + dx, 0.31, pz);
      bx(board, 0.025, 0.12, 1.3, px, hgt - 0.06, cz); bx(board, 1.3, 0.12, 0.025, cx, hgt - 0.06, pz);
      bx(paint, 0.052, 0.07, 0.052, px, 0.58, cz - 0.55); bx(paint, 0.052, 0.07, 0.052, cx + 0.55, 0.58, pz);
      bx(col(0xf2f0e8), 0.06, 0.012, 0.9, cx, 0.062, cz + sz * 0.0 + 0 * 1, 0); // метка угла
      bx(col(0xe8481c), 0.9, 0.012, 0.06, cx, 0.064, cz);
      bx(col(0xe8481c), 0.06, 0.012, 0.9, cx, 0.064, cz);
    }
    const y = hgt + 0.012;
    tube(strCol, [x0 - off, y, z0], [x1 + off, y, z0], 0.005, 3); tube(strCol, [x0 - off, y, z1], [x1 + off, y, z1], 0.005, 3);
    tube(strCol, [x0, y, z0 - off], [x0, y, z1 + off], 0.005, 3); tube(strCol, [x1, y, z0 - off], [x1, y, z1 + off], 0.005, 3);
    // линия разметки (известью) по контуру
    const wl = col(0xf4f2ea), m = 0.0;
    bx(wl, x1 - x0 + 2 * m + 0.06, 0.012, 0.07, (x0 + x1) / 2, 0.066, z0 - 0.7); bx(wl, x1 - x0 + 0.06, 0.012, 0.07, (x0 + x1) / 2, 0.066, z1 + 0.7);
    bx(wl, 0.07, 0.012, z1 - z0, x0 - 0.7, 0.066, (z0 + z1) / 2); bx(wl, 0.07, 0.012, z1 - z0, x1 + 0.7, 0.066, (z0 + z1) / 2);
  }
  /** Нивелир на треноге и красно-белая рейка. */
  function surveyor(x, z) {
    sub(x, 0, z, 0.4, () => {
      for (let i = 0; i < 3; i++) { const a = i * TAU / 3; tube(col(0xc9a064), [0, 1.45, 0], [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], 0.018, 6); }
      cyl(K.dark, 0.1, 0.1, 0.06, 0, 1.46, 0, 12); cyl(col(0xe8b814), 0.07, 0.07, 0.2, 0, 1.6, 0, 12); cyl(K.dark, 0.035, 0.035, 0.34, 0, 1.64, 0.1, 8, PI / 2);
      sph(K.dark, 0.05, 0, 1.64, 0.28);
    });
    sub(x + 2.4, 0, z + 0.6, 0, () => { for (let i = 0; i < 10; i++) bx(i % 2 ? col(0xf2f0e8) : col(0xd8321c), 0.06, 0.2, 0.025, 0, 0.1 + i * 0.2, 0); bx(col(0x1b1c1e), 0.07, 0.02, 0.03, 0, 2.01, 0); });
  }
  /** Леса из круглых труб: идут вдоль X от x=0 до len, стена на z=0, леса впереди (+Z). */
  function scaffold(len, bays, lifts, o) {
    o = o || {}; const lift = o.lift || 2.0, dep = o.dep || 1.05, gap = o.gap || 0.3, s = steel(0xaab0b6), wood = M.oldwood(), r = 0.0245, y0 = 0.45;
    const bw = len / bays, topY = y0 + (lifts - 1) * lift;
    for (let i = 0; i <= bays; i++) for (const zz of [gap, gap + dep]) {
      tube(s, [i * bw, 0.1, zz], [i * bw, topY + 1.15, zz], r, 8);
      bx(K.steelDk, 0.15, 0.012, 0.15, i * bw, 0.1, zz); cyl(s, 0.03, 0.03, 0.14, i * bw, 0.17, zz, 8);
    }
    for (let k = 0; k < lifts; k++) {
      const y = y0 + k * lift;
      for (let i = 0; i < bays; i++) {
        for (const zz of [gap, gap + dep]) tube(s, [i * bw, y, zz], [(i + 1) * bw, y, zz], r, 8);
        // настил
        for (let b = 0; b < 4; b++) bx(wood, bw - 0.04, 0.038, 0.225, (i + 0.5) * bw, y + 0.06, gap + 0.07 + b * 0.235);
        // ограждение и бортовая доска
        tube(s, [i * bw, y + 0.5, gap + dep], [(i + 1) * bw, y + 0.5, gap + dep], r, 8); tube(s, [i * bw, y + 1.0, gap + dep], [(i + 1) * bw, y + 1.0, gap + dep], r, 8);
        bx(wood, bw - 0.04, 0.15, 0.03, (i + 0.5) * bw, y + 0.17, gap + dep + 0.03);
      }
      for (let i = 0; i <= bays; i++) { tube(s, [i * bw, y - 0.05, gap], [i * bw, y - 0.05, gap + dep], r, 8); for (const zz of [gap, gap + dep]) bx(K.steelDk, 0.07, 0.07, 0.07, i * bw, y, zz); }
      // торцевые ограждения
      for (const xx of [0, len]) { tube(s, [xx, y + 0.5, gap], [xx, y + 0.5, gap + dep], r, 8); tube(s, [xx, y + 1.0, gap], [xx, y + 1.0, gap + dep], r, 8); }
    }
    // диагональные связи по внешней стороне
    for (let i = 0; i < bays; i++) if (i % 2 === 0) for (let k = 0; k < lifts; k++) { const y = y0 + k * lift; const rise = k === lifts - 1 ? 1.0 : lift; if (k % 2 === 0) tube(s, [i * bw, y, gap + dep + 0.03], [(i + 1) * bw, y + rise, gap + dep + 0.03], r * 0.9, 8); else tube(s, [(i + 1) * bw, y, gap + dep + 0.03], [i * bw, y + rise, gap + dep + 0.03], r * 0.9, 8); }
    // лестница на леса
    sub(len * 0.5 + bw * 0.5 - 0.2, 0, gap + dep + 0.3, 0, () => {
      const L = topY + 0.9, n = Math.floor(L / 0.28), tl = 0.0;
      for (const sx of [-0.2, 0.2]) tube(s, [sx, 0, 0.55], [sx, topY + 0.5, 0.0], 0.02, 6);
      for (let i = 1; i < n; i++) { const t = i * 0.28 / (topY + 0.5); if (t > 1) break; tube(s, [-0.2, t * (topY + 0.5), 0.55 * (1 - t)], [0.2, t * (topY + 0.5), 0.55 * (1 - t)], 0.012, 5); }
    });
  }
  function dumpster(x, z, ry) {
    sub(x, 0, z, ry, () => {
      const body = col(0x2f6fa8), rub = [0xb89a72, 0x8f8f8a, 0xc9c2b4, 0x7a5a3a, 0xa14b36];
      prof(body, [[-1.0, 0.18], [1.0, 0.18], [1.2, 1.15], [-1.2, 1.15], [-1.2, 1.08], [-0.95, 0.26], [1.0, 0.26], [1.12, 1.08], [-1.12, 1.08]].slice(0, 4), 0.06, 0, 0.72, 0, 0);
      // стенки: днище, 2 торца, 2 борта
      bx(body, 1.5, 0.08, 2.2, 0, 0.22, 0); bx(body, 0.07, 0.85, 2.3, -0.82, 0.62, 0, 0, 0, 0.1); bx(body, 0.07, 0.85, 2.3, 0.82, 0.62, 0, 0, 0, -0.1);
      bx(body, 1.6, 0.85, 0.07, 0, 0.62, -1.1, 0, -0.1); bx(body, 1.6, 0.85, 0.07, 0, 0.62, 1.1, 0, 0.1);
      bx(col(0x25557f), 1.8, 0.07, 0.07, 0, 1.06, 1.18); bx(col(0x25557f), 1.8, 0.07, 0.07, 0, 1.06, -1.18); bx(col(0x25557f), 0.07, 0.07, 2.4, 0.9, 1.06, 0); bx(col(0x25557f), 0.07, 0.07, 2.4, -0.9, 1.06, 0);
      for (const sz of [-0.8, 0.8]) bx(col(0x25557f), 1.7, 0.1, 0.1, 0, 0.1, sz);
      const r = lcg(31); for (let i = 0; i < 14; i++) { const g = new T.IcosahedronGeometry(0.14 + r() * 0.18, 0); g.scale(1 + r() * 0.5, 0.6 + r() * 0.4, 1 + r() * 0.5); put(col(rub[Math.floor(r() * 5)]), g, (r() - 0.5) * 1.1, 0.4 + r() * 0.4, (r() - 0.5) * 1.8, r() * 3, r() * 3, r() * 3); }
      bx(M.pine(), 0.08, 0.04, 1.6, 0.2, 0.95, 0.1, 0.2, 0.15, 0.3); bx(M.pine(), 1.4, 0.04, 0.12, -0.2, 0.9, -0.3, 0.5, 0.0, -0.3);
    });
  }

  // ------------------------------------------------------------------ табличка «СТРОЙКА»
  function signBoard(x, z) {
    sub(x, 0, z, 0, () => {
      const wood = M.oldwood(), conc = M.conc();
      for (const sx of [-1.45, 1.45]) { bx(wood, 0.18, 3.7, 0.18, sx, 1.85, 0); bx(conc, 0.5, 0.35, 0.5, sx, 0.12, 0); bx(wood, 0.1, 0.1, 0.9, sx, 0.2, 0.0, 0, 0, 0); beam(wood, [sx, 0.25, 0.55], [sx, 1.2, 0.1], 0.08, 0.08); beam(wood, [sx, 0.25, -0.55], [sx, 1.2, -0.1], 0.08, 0.08); }
      bx(M.pine(), 3.6, 2.2, 0.08, 0, 2.55, 0.05); bx(col(0x3a3d41), 3.7, 0.08, 0.14, 0, 3.69, 0.05); bx(col(0x3a3d41), 3.7, 0.08, 0.14, 0, 1.41, 0.05);
      for (const sx of [-1.85, 1.85]) bx(col(0x3a3d41), 0.08, 2.3, 0.14, sx, 2.55, 0.05);
      const pg = new T.PlaneGeometry(3.45, 2.1); const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.17 + uv.getY(i) * 0.66);
      const sm = C.texMat('cn_sign', 1, 1, 0xffffff, 0, 0, 0, { color: 0xffffff }); const m = new T.Mesh(pg, sm); m.position.set(0, 2.55, 0.095); m.castShadow = true; m.receiveShadow = true; cur.add(m);
      for (const sx of [-1.7, 1.7]) for (const sy of [1.55, 3.55]) cyl(col(0x777b80), 0.025, 0.025, 0.02, sx, sy, 0.1, 8, PI / 2);
      bx(col(0x55595e), 0.4, 0.06, 0.28, 0, 3.8, 0.2); // светильник
    });
  }
  function barrier(x0, z0, x1, z1, seg) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / (seg || 2.3))), ry = Math.atan2(dx, dz) - PI / 2, sl = L / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + dx * (i + 0.5) / n, cz = z0 + dz * (i + 0.5) / n;
      sub(cx, 0, cz, ry + PI, () => {
        const st = M.stripe(), pst = col(0xf1efe8);
        for (const sx of [-sl / 2 + 0.12, sl / 2 - 0.12]) { bx(pst, 0.07, 1.1, 0.07, sx, 0.55, 0); bx(col(0x35383c), 0.05, 0.05, 0.75, sx, 0.03, 0); bx(col(0x35383c), 0.5, 0.05, 0.05, sx, 0.03, 0.0); }
        bx(st, sl - 0.04, 0.2, 0.03, 0, 0.98, 0.05); bx(st, sl - 0.04, 0.2, 0.03, 0, 0.62, 0.05);
        bx(col(0xbfc2c4), 0.05, 0.01, 0.05, -sl / 2 + 0.12, 1.1, 0);
      });
    }
  }

  FM.register('construct', 'shed', (o) => shedBuild(clamp(o.stage | 0, 0, 4)));
  FM.register('construct', 'sign', (opts) => {
    const g = begin(901);
    dirtPatch(0, 0.5, 8.6, 6.0, 7);
    signBoard(0, 3.2);
    barrier(-9.4, 6.9, -2.6, 6.9); barrier(2.6, 6.9, 9.4, 6.9); barrier(-9.4, 6.9, -9.4, -1.6, 2.4); barrier(9.4, 6.9, 9.4, -1.6, 2.4);
    cone(-2.0, 7.2, 0.3); cone(2.0, 7.2, 1.1); cone(-3.1, 7.9, 0.5); cone(3.3, 7.8, 0.9); cone(-6.0, 7.6, 2); cone(6.2, 7.3, 1.2);
    palletsAt(6.4, -3.4, 0.25, 6, 4); palletsAt(5.1, -4.2, -0.2, 3, 5); leanPallet(7.9, -1.4, PI / 2, 0.22);
    boardStack(-6.5, -3.2, 0.1, 3.6, 4, M.pine(), 7);
    bx(col(0xf2d21a), 0.05, 0.9, 0.05, -3.9, 0.45, 2.3, 0, 0, 0.05); bx(col(0xf2d21a), 0.05, 0.9, 0.05, 4.1, 0.45, 1.4, 0, 0, -0.05);
    return finish(g);
  });

  // ------------------------------------------------------------------ стены, окна, крыши (общие узлы)
  /** Каркас стены (локально: x вдоль стены 0..L, y вверх 0..H, z — толщина по центру). Окна/двери: {x0,x1,y0,y1}. */
  function studWall(L, H, ops, o) {
    o = o || {}; const s = M.pine(), pw = 0.1, T0 = o.t || 0.1, sw = 0.05; ops = ops || [];
    bx(s, L, pw, T0, L / 2, pw / 2, 0); bx(s, L, pw, T0, L / 2, H - pw / 2, 0); bx(s, L - 0.2, pw, T0, L / 2, H - pw * 1.5, 0);
    const inOp = (x) => ops.find((q) => x > q.x0 - 0.06 && x < q.x1 + 0.06);
    bx(s, 0.09, H - 2 * pw, T0, 0.06, H / 2, 0); bx(s, 0.09, H - 2 * pw, T0, L - 0.06, H / 2, 0);
    for (const q of ops) {
      bx(s, 0.09, H - 2 * pw, T0, q.x0 - 0.045, H / 2, 0); bx(s, 0.09, H - 2 * pw, T0, q.x1 + 0.045, H / 2, 0);
      bx(s, q.x1 - q.x0 + 0.2, 0.14, T0, (q.x0 + q.x1) / 2, q.y1 + 0.07, 0);
      if (q.y0 > 0.05) bx(s, q.x1 - q.x0 + 0.1, 0.07, T0, (q.x0 + q.x1) / 2, q.y0 - 0.035, 0);
    }
    for (let x = 0.6; x < L - 0.3; x += 0.6) {
      const q = inOp(x);
      if (!q) bx(s, sw, H - 2 * pw, T0, x, H / 2, 0);
      else if (x > q.x0 && x < q.x1) { if (q.y0 > 0.05) bx(s, sw, q.y0 - pw - 0.07, T0, x, pw + (q.y0 - pw - 0.07) / 2, 0); const th = H - pw * 2 - q.y1 - 0.14; if (th > 0.05) bx(s, sw, th, T0, x, q.y1 + 0.14 + th / 2, 0); }
    }
    if (o.braces !== false) for (const [bx0, dir] of [[0.1, 1], [L - 0.1, -1]]) beam(s, [bx0, H - 1.25, 0], [bx0 + dir * 1.15, H - pw * 1.9, 0], 0.05, 0.09, [0, 0, 1]);
    if (o.diag) beam(s, [o.diag[0], pw, 0], [o.diag[1], H - pw * 1.9, 0], 0.05, 0.08, [0, 0, 1]);
  }
  /** Обшивка стены (экструзия контура с проёмами). gable: высота фронтона над H (вершина по центру). Проёмы-двери (y0=0) вырезаются из нижней кромки. */
  function cladWall(spec, L, H, ops, gable, th) {
    th = th || 0.04; ops = (ops || []).slice().sort((a, b) => a.x0 - b.x0); const pts = [[0, 0]], holes = [];
    for (const q of ops) { if (q.y0 <= 0.001) { pts.push([q.x0, 0], [q.x0, q.y1], [q.x1, q.y1], [q.x1, 0]); } else holes.push([[q.x0, q.y0], [q.x0, q.y1], [q.x1, q.y1], [q.x1, q.y0]]); }
    pts.push([L, 0], [L, H]); if (gable) pts.push([L / 2, H + gable]); pts.push([0, H]);
    return poly(spec, pts, holes, th, 0, 0, th / 2, 0);
  }
  /** Окно в локальной системе стены: рама, переплёт, подоконник, стекло. o: {panes:'cross'|'two'|'one', glass:true, trim, frame:colour} */
  function win(q, o) {
    o = o || {}; const w = q.x1 - q.x0, h = q.y1 - q.y0, cx = (q.x0 + q.x1) / 2, cy = (q.y0 + q.y1) / 2, fr = col(o.frame || 0xece7da), fw = o.fw || 0.06;
    bx(fr, w, fw, 0.09, cx, q.y0 + fw / 2, 0.015); bx(fr, w, fw, 0.09, cx, q.y1 - fw / 2, 0.015); bx(fr, fw, h - 2 * fw, 0.09, q.x0 + fw / 2, cy, 0.015); bx(fr, fw, h - 2 * fw, 0.09, q.x1 - fw / 2, cy, 0.015);
    if (o.panes !== 'one') bx(fr, fw * 0.7, h - 2 * fw, 0.05, cx, cy, 0.015);
    if (o.panes === 'cross') bx(fr, w - 2 * fw, fw * 0.7, 0.05, cx, cy, 0.015);
    if (o.glass !== false) pane(w - fw, h - fw, cx, cy, 0.0, 0);
    if (o.trim !== false) { const tw = 0.08; bx(fr, w + 2 * tw, tw, 0.035, cx, q.y1 + tw / 2, 0.05); bx(fr, tw, h, 0.035, q.x0 - tw / 2, cy, 0.05); bx(fr, tw, h, 0.035, q.x1 + tw / 2, cy, 0.05); bx(fr, w + 0.2, 0.05, 0.14, cx, q.y0 - 0.025, 0.09); }
  }
  /** Стропила, обрешётка и покрытие двускатной крыши с коньком вдоль X (центр cx,cz). */
  function rafters(o) {
    const s = o.spec || M.pine(), dy = o.yR - o.yE, al = Math.atan2(dy, o.hs), off = o.d / 2 / Math.cos(al);
    for (let i = 0; i < o.n; i++) { const x = lerp(o.x0, o.x1, i / (o.n - 1)); for (const sd of [1, -1]) beam(s, [x, o.yE - off, o.cz + sd * o.hs], [x, o.yR - off, o.cz], o.w, o.d, [0, 1, 0]); if (o.collar && i % 2 === 0) { const hh = o.collar, zz = hh / dy * o.hs; bx(s, o.w, 0.045, 2 * zz - 0.1, x, o.yR - hh - off, o.cz); } if (o.tie && i % 2 === 0) bx(s, o.w, 0.15, 2 * o.tie, x, o.plate - 0.075, o.cz); }
    bx(s, o.x1 - o.x0 + 0.5, 0.2, 0.05, (o.x0 + o.x1) / 2, o.yR - 0.12, o.cz);
  }
  function gableSlabs(s, o) {
    const dz = o.hs, dy = o.yR - o.yE, L = Math.hypot(dz, dy) + (o.ext || 0), al = Math.atan2(dy, dz);
    for (const sd of (o.only ? [o.only] : [1, -1])) { const k = (o.off || 0) - o.th / 2, ny = Math.cos(al), nz = sd * Math.sin(al); bx(s, o.len, o.th, L, o.cx, (o.yE + o.yR) / 2 + ny * k, o.cz + sd * dz / 2 + nz * k, sd > 0 ? 0 : PI, al); }
  }
  function battens(o) {
    const s = M.pine(), dz = o.hs, dy = o.yR - o.yE, L = Math.hypot(dz, dy), al = Math.atan2(dy, dz), n = Math.floor(L / o.sp);
    for (const sd of [1, -1]) for (let i = 0; i <= n; i++) { const t = (0.12 + i * o.sp) / L; if (t > 0.985) break; const z = sd * dz * (1 - t), y = o.yE + dy * t; bx(s, o.len, 0.03, 0.05, o.cx, y + 0.015 / Math.cos(al), o.cz + z, 0, sd * al); }
  }
  const halfRound = (s, len, r, x, y, z) => { const g = new T.CylinderGeometry(r, r, len, 10, 1, true, -PI / 2, PI); g.rotateZ(PI / 2); g.rotateX(-PI / 2); return put(s, g, x, y, z); };
  function gutter(x0, x1, y, z, sd) { const m = col(0x7a7f84); bx(m, x1 - x0, 0.03, 0.1, (x0 + x1) / 2, y - 0.07, z + sd * 0.05); bx(m, x1 - x0, 0.09, 0.02, (x0 + x1) / 2, y - 0.03, z + sd * 0.1); bx(m, x1 - x0, 0.07, 0.015, (x0 + x1) / 2, y - 0.03, z); }

  // ------------------------------------------------------------------ САРАЙ 8 x 6 м
  const SH = { yb: 0.22, plate: 2.62, hs: 3.45, yE: 2.54, yR: 4.08 };
  function cementBags(x, z, n, ry) { const r = lcg(n * 7 + 1); sub(x, 0, z, ry || 0, () => { for (let i = 0; i < n; i++) { const L = i % 3, h = Math.floor(i / 3); rbx(col(i % 2 ? 0xcdc8bc : 0xbdb8ab), 0.8, 0.14, 0.5, 0.05, (r() - 0.5) * 0.05, 0.07 + h * 0.15, (L - 1) * 0.52 + (r() - 0.5) * 0.04, (r() - 0.5) * 0.1); } }); }
  function hammer(x, y, z, ry) { sub(x, y, z, ry, () => { bx(M.pine(), 0.32, 0.03, 0.03, 0, 0.015, 0); bx(col(0x55595e), 0.04, 0.045, 0.1, 0.15, 0.03, 0); }); }

  const wall0 = (spec) => spec;
  /** Створка сдвижной двери: доски + Z-образная рама. Локально: центр (cx, cy), лицо в +Z на уровне z. */
  function doorLeaf(boardSpec, w, h, cx, cy, z) {
    const tr = col(0xe7e1d2); bx(boardSpec, w, h, 0.035, cx, cy, z);
    const t = 0.14; bx(tr, w, t, 0.03, cx, cy + h / 2 - t / 2, z + 0.03); bx(tr, w, t, 0.03, cx, cy - h / 2 + t / 2, z + 0.03); bx(tr, t, h - 2 * t, 0.03, cx - w / 2 + t / 2, cy, z + 0.03); bx(tr, t, h - 2 * t, 0.03, cx + w / 2 - t / 2, cy, z + 0.03);
    beam(tr, [cx - w / 2 + t, cy - h / 2 + t, z + 0.03], [cx + w / 2 - t, cy + h / 2 - t, z + 0.03], 0.13, 0.03, [0, 0, 1]);
  }
  function barrel(x, z, c) {
    sub(x, 0, z, 0, () => {
      lathe(col(c || 0x2e6a52), [[0.001, 0.0], [0.27, 0.0], [0.31, 0.06], [0.345, 0.45], [0.31, 0.84], [0.28, 0.9], [0.27, 0.9]], 20, 0, 0, 0);
      cyl(col(0x1b2a24), 0.27, 0.27, 0.02, 0, 0.88, 0, 18); for (const y of [0.12, 0.45, 0.78]) cyl(K.dark, y === 0.45 ? 0.352 : 0.322, y === 0.45 ? 0.352 : 0.322, 0.028, 0, y, 0, 20, 0, 0, true);
    });
  }
  function woodpile(x, z, ry, cols, rows) {
    const r = lcg(cols * 13 + rows);
    sub(x, 0, z, ry, () => {
      const cs = [0x8b6b45, 0x7a5a3a, 0x9a7a50, 0x6b4d30], rr = 0.09;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols - (j % 2); i++) { const px = (i - (cols - 1) / 2 + (j % 2) * 0.5) * rr * 2.05, py = rr + j * rr * 1.8; cyl(col(cs[Math.floor(r() * 4)]), rr * (0.9 + r() * 0.15), rr * (0.9 + r() * 0.15), 1.0 + r() * 0.1, px, py, (r() - 0.5) * 0.06, 6, PI / 2); }
      for (const sx of [-1, 1]) bx(M.oldwood(), 0.07, rows * rr * 2 + 0.1, 0.07, sx * (cols * rr + 0.05), rows * rr + 0.05, 0.0);
    });
  }
  function rake(x, z) { sub(x, 0, z, 0.2, () => { bx(M.pine(), 0.03, 1.7, 0.03, 0, 0.85, 0.0, 0, 0.12); bx(col(0x6d7276), 0.4, 0.03, 0.03, 0, 0.12, 0.2, 0, 0.12); }); }
  function shedBuild(stage) {
    const g = begin(2100 + stage), P = SH, yb = P.yb, conc = M.conc(), pine = M.pine(), Hs = P.plate - yb;
    const wall = tex('cn_boards', 0xb28d62, 1.6, 2.4, 'b'), trim = col(0xe7e1d2);
    const WL = { front: [-4, 3, 0, 8], back: [4, -3, PI, 8], right: [4, 3, PI / 2, 6], left: [-4, -3, -PI / 2, 6] };
    const OPS = { front: [{ x0: 1.1, x1: 4.3, y0: 0, y1: 2.2 }, { x0: 5.65, x1: 6.95, y0: 1.0, y1: 1.95 }], back: [{ x0: 3.35, x1: 4.65, y0: 1.0, y1: 1.95 }], right: [{ x0: 2.5, x1: 3.5, y0: 1.0, y1: 1.95 }], left: [] };
    const onWall = (k, fn) => { const w = WL[k]; sub(w[0], yb, w[1], w[2], fn); };
    if (stage <= 3) dirtPatch(0.4, 0.3, 9.6, 6.8, 3);
    // --- фундамент: плита
    rbx(conc, 8.3, yb, 6.3, 0.05, 0, yb / 2, 0);
    if (stage === 0) {
      const rb = col(0x8a5a38), r = lcg(15);
      for (let i = 0; i <= 8; i++) for (const sz of [-2.93, 2.93]) { const x = -3.93 + i, a = r() * 0.06; tube(rb, [x, yb, sz], [x + a, yb + 0.5 + r() * 0.15, sz + 0.03], 0.008, 5); tube(rb, [x + 0.05, yb, sz], [x + 0.05 - a, yb + 0.42 + r() * 0.2, sz], 0.008, 5); }
      for (let i = 1; i < 6; i++) for (const sx of [-3.93, 3.93]) { const z = -3 + i; tube(rb, [sx, yb, z], [sx, yb + 0.5 + r() * 0.15, z + 0.03], 0.008, 5); tube(rb, [sx, yb, z + 0.05], [sx + 0.03, yb + 0.4 + r() * 0.2, z + 0.05], 0.008, 5); }
      for (const [x, z] of [[-3.93, -2.93], [3.93, -2.93], [3.93, 2.93], [-3.93, 2.93]]) { cyl(col(0x6c7075), 0.012, 0.012, 0.25, x + 0.14, yb + 0.12, z, 6); cyl(col(0x6c7075), 0.022, 0.022, 0.015, x + 0.14, yb + 0.14, z, 6); }
      for (let i = 0; i < 3; i++) bx(M.oldwood(), 3.0, 0.035, 0.2, -6.6 + i * 0.1, 0.1 + 0.04 + i * 0.045, -4.3 + i * 0.02, 0.05);
      for (let i = 0; i < 5; i++) bx(M.oldwood(), 0.05, 0.5, 0.05, 6.4 + i * 0.1, 0.17, -4.7 - i * 0.08, 1.2, 1.5, 0.2 * i);
      survey(-4, 4, -3, 3, 1.9, 0.5); sandGravel(-8.2, 2.8, 1.1); boardStack(7.7, 0.8, PI / 2, 4.0, 5, M.pine(), 5);
      wheelbarrow(-6.0, 4.6, 0.7); surveyor(5.2, 5.0); bucket(6.5, -4.4, 0xe8b814, false);
      return finish(g);
    }
    // --- каркас
    if (stage === 1) for (const k of ['front', 'back', 'right', 'left']) onWall(k, () => studWall(WL[k][3], Hs, OPS[k], { diag: k === 'right' ? [0.4, 2.4] : null }));
    for (const [x, z] of [[-3.93, -2.93], [3.93, -2.93], [3.93, 2.93], [-3.93, 2.93]]) bx(pine, 0.16, Hs + 0.1, 0.16, x, yb + (Hs + 0.1) / 2, z);
    const R = { x0: -4.3, x1: 4.3, n: 12, hs: P.hs, yE: P.yE, yR: P.yR, d: 0.13, w: 0.055, cz: 0, collar: 0.75, tie: 2.93, plate: P.plate };
    rafters(R);
    for (const sz of [-1, 1]) bx(pine, 8.2, 0.12, 0.14, 0, P.plate - 0.06, sz * 2.96);
    for (const sx of [-1, 1]) bx(pine, 0.14, 0.12, 6.0, sx * 3.97, P.plate - 0.06, 0);
    if (stage === 1) {
      for (const sx of [-1, 1]) { bx(pine, 0.1, P.yR - 0.2 - P.plate, 0.07, sx * 3.95, (P.yR - 0.2 + P.plate) / 2, 0); for (const sz of [-1.5, 1.5]) bx(pine, 0.08, 0.5 + Math.abs(sz) * 0.0, 0.07, sx * 3.95, P.plate + 0.3, sz); }
      boardStack(7.2, 1.2, PI / 2, 4.0, 6, M.pine(), 5); boardStack(-6.6, -2.5, 0.15, 3.6, 3, M.pine(), 6); sawhorse(6.2, -4.5, 0.4); sawhorse(7.4, -4.1, -0.1); bx(pine, 2.4, 0.04, 0.2, 6.8, 0.94, -4.3, 0.3);
      ladder(-4.45, 3.7, 0.2, 0.28, 4.4); sandGravel(-8.0, 3.8, 0.4); wheelbarrow(-6.4, 5.0, 2.4);
      for (let i = 0; i < 6; i++) bx(pine, 0.6 + (i * 0.37) % 0.8, 0.04, 0.12, 4.8 + (i % 3) * 0.2, 0.13 + (i % 2) * 0.04, 4.6 + i * 0.12, i * 0.9);
      return finish(g);
    }
    // --- обшивка стен
    const fresh = tex('cn_boards', 0xd9b47e, 1.6, 2.4, 'b'), stained = tex('cn_boards', 0xa97c4d, 1.6, 2.4, 'b'), WM = stage === 4 ? stained : fresh;
    onWall('front', () => cladWall(WM, 8, Hs, OPS.front, 0)); onWall('back', () => cladWall(WM, 8, Hs, OPS.back, 0));
    onWall('right', () => cladWall(WM, 6, Hs, OPS.right, 1.3)); onWall('left', () => cladWall(WM, 6, Hs, OPS.left, 1.3));
    // --- крыша
    const RO = { len: 8.7, th: 0.03, hs: P.hs, yE: P.yE, yR: P.yR, cx: 0, cz: 0 }, al = Math.atan2(P.yR - P.yE, P.hs);
    if (stage === 2) {
      battens(Object.assign({ sp: 0.42 }, RO)); gableSlabs(col(0x2a2c30), Object.assign({}, RO, { th: 0.012, off: 0.0, len: 8.6, only: -1 }));
      sub(4.04, 0, 3.7, PI / 2, () => scaffold(7.4, 3, 2)); mixer(7.0, 0.6, 2.2); sandGravel(-7.8, 3.4, 0.7);
      wheelbarrow(-5.6, 5.4, 0.2); cementBags(7.1, -2.4, 7, 0.3); boardStack(-6.4, -3.2, 0.1, 3.6, 3, M.pine(), 6);
      for (let i = 0; i < 4; i++) bx(pine, 2.4 - i * 0.3, 0.05, 0.14, -6.0, 0.14 + i * 0.05, -5.2 + i * 0.01);
      return finish(g);
    }
    const roofM = tex('cn_corr', 0xaeb3b7, 0.96, 2.0, 'b');
    gableSlabs(roofM, Object.assign({}, RO, { th: 0.035, off: 0.065, len: 8.8 }));
    for (const sd of [1, -1]) { const dn = [0, -Math.sin(al), sd * Math.cos(al)], n = [0, Math.cos(al), sd * Math.sin(al)], w = 0.34; bx(roofM, 8.84, 0.03, w, 0, P.yR + dn[1] * (w / 2 - 0.03) + n[1] * 0.085, dn[2] * (w / 2 - 0.03) + n[2] * 0.085, sd > 0 ? 0 : PI, al); }
    // свесы: фасад, фронтонные доски, водостоки
    for (const sd of [1, -1]) { bx(trim, 8.8, 0.17, 0.03, 0, P.yE - 0.05, sd * (P.hs + 0.02)); gutter(-4.2, 4.2, P.yE - 0.02, sd * (P.hs + 0.03), sd); }
    for (const sx of [-1, 1]) for (const sd of [1, -1]) beam(trim, [sx * 4.38, P.yE - 0.03, sd * (P.hs + 0.01)], [sx * 4.38, P.yR + 0.04, 0], 0.17, 0.035, [1, 0, 0]);
    // окна и дверь
    const FR = 0xece7da, wq = OPS.front[1];
    onWall('back', () => win(OPS.back[0], { panes: 'cross', frame: FR })); onWall('right', () => win(OPS.right[0], { panes: 'two', frame: FR }));
    if (stage === 3) {
      onWall('front', () => { win(wq, { panes: 'cross', glass: false, frame: FR }); bx(K.steelDk, 6.4, 0.09, 0.1, 2.9, 2.34, 0.2); for (const hx of [1.5, 3.9]) bx(K.steelDk, 0.05, 0.12, 0.06, hx, 2.28, 0.16); });
      sub(-4.22, 0.0, 0.3, -PI / 2, () => { cur.rotation.x = 0; sub(0, 0.0, 0, 0, () => { cur.rotation.x = -0.16; doorLeaf(wall0(fresh), 3.2, 2.2, 0, 1.1, 0.0); }); });
      sub(5.9, 0, 4.2, 0.35, () => { cur.rotation.x = 0; sub(0, 0.0, 0, 0, () => { cur.rotation.x = -0.14; pane(1.2, 0.9, 0, 0.5, 0, 0); bx(col(0xd8c9a0), 1.28, 0.97, 0.03, 0, 0.5, -0.03); }); });
      sub(4.04, 0, 3.7, PI / 2, () => scaffold(7.4, 3, 2));
      bucket(-1.4, 4.0, 0x3c7a46, false); bucket(-0.9, 4.15, 0xeee9dc, true); bucket(-1.0, 3.7, 0x8b2f26, true); bucket(-1.9, 3.9, 0xeee9dc, false);
      sawhorse(-5.8, 4.4, 0.3); bx(pine, 2.0, 0.04, 0.2, -5.8, 0.86, 4.4, 0.3); hammer(-5.5, 0.88, 4.4, 0.8);
      dumpster(7.6, -3.6, 0.5); palletsAt(-7.1, -3.4, 0.2, 4, 3); palletsAt(-7.3, -1.4, -0.1, 2, 8); cementBags(6.9, 3.6, 4, -0.3);
      for (let i = 0; i < 5; i++) bx(pine, 1.0 + (i * 0.3) % 0.9, 0.04, 0.1, -3.5 + i * 0.5, 0.13, 5.0 + (i % 2) * 0.3, i * 1.3);
      cyl(col(0x1d1f22), 0.2, 0.2, 1.0, -7.0, 0.3, 4.3, 14, 0, PI / 2);
      return finish(g);
    }
    // --- стадия 4: готовый сарай
    onWall('front', () => {
      win(wq, { panes: 'cross', frame: FR });
      bx(K.steelDk, 6.6, 0.09, 0.1, 2.9, 2.36, 0.22); for (const hx of [1.7, 3.7]) { bx(K.steelDk, 0.05, 0.16, 0.06, hx, 2.28, 0.17); cyl(K.dark, 0.05, 0.05, 0.05, hx, 2.2, 0.2, 10, PI / 2); }
      doorLeaf(wall0(stained), 3.3, 2.25, 2.7, 1.125, 0.115);
      bx(K.steelDk, 0.04, 0.3, 0.05, 1.5, 1.1, 0.18); bx(K.dark, 0.1, 0.12, 0.05, 1.45, 1.1, 0.17);
      bx(col(0x6d7276), 3.3, 0.04, 0.06, 2.7, 0.06, 0.16);
    });
    for (const [x, z] of [[-3.98, -2.98], [3.98, -2.98], [3.98, 2.98], [-3.98, 2.98]]) bx(trim, 0.13, Hs + 0.02, 0.13, x, yb + Hs / 2 + 0.01, z);
    rbx(conc, 4.2, 0.1, 1.5, 0.03, -1.3, 0.05, 3.8); rbx(conc, 3.4, 0.17, 0.5, 0.03, -1.3, 0.085, 3.35);
    rbx(M.gravel(), 9.4, 0.04, 1.2, 0.015, 0, 0.02, 5.2);
    cyl(col(0x777b80), 0.045, 0.045, P.yE - 0.1 - yb, -4.2, yb + (P.yE - 0.1 - yb) / 2, 3.5, 10); barrel(-4.2, 3.9, 0x2e6a52);
    woodpile(4.7, -0.4, PI / 2, 7, 4); rake(-4.1, 3.1);
    bx(col(0xe9d9a0), 0.2, 0.26, 0.14, 0.5, 1.95, 3.1 + 0.06); sph(col(0xfff1c0), 0.0, 0, 0, 0);
    return finish(g);
  }

  // @@END
})();
