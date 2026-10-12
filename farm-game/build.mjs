// Собирает игру в один HTML-файл: node build.mjs [куда] [--fragment]
import fs from 'fs'; import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const js = (f) => rd(f).replace(/<\/script/gi, '<\\/script');
const out = process.argv[2] || path.join(dir, 'dist', 'farm.html'), fragment = process.argv.includes('--fragment');
const html = rd('index.html');
// текстуры из папки textures/*.jpg -> textures.js (window.FARM_TEXTURES)
const texDir = path.join(dir, 'textures');
if (fs.existsSync(texDir)) {
  const o = {}; for (const f of fs.readdirSync(texDir).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) o[f.replace(/\.[^.]+$/, '')] = `data:image/${/png$/i.test(f) ? 'png' : 'jpeg'};base64,` + fs.readFileSync(path.join(texDir, f)).toString('base64');
  fs.writeFileSync(path.join(dir, 'textures.js'), 'window.FARM_TEXTURES=' + JSON.stringify(o) + ';\n');
}
const texJs = fs.existsSync(path.join(dir, 'textures.js')) ? `<script>${js('textures.js')}</script>\n` : '';
const body = html.match(/<div id="app">[\s\S]*?<\/div>\s*(?=<script)/)[0];
const page = `<title>Ферма и Город</title>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>${rd('style.css')}</style>
${body}
<script>${js('vendor/three.min.js')}</script>
<script>${js('logic.js')}</script>
${texJs}<script>${js('world3d.js')}</script>
${['models_buildings.js', 'models_vehicles.js', 'models_props.js', 'models_crops.js'].filter((f) => fs.existsSync(path.join(dir, f))).map((f) => `<script>${js(f)}</script>`).join('\n')}
<script>${js('game.js')}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, fragment ? page : `<!doctype html><html lang="ru"><head><meta charset="utf-8">${page.replace('<title>', '<title>').replace(/<\/script>\n$/, '</script>')}`.replace('</head>', '') .replace('<div id="app">', '</head><body><div id="app">') + '</body></html>');
console.log('ok', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
