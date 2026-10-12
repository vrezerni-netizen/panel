// Собирает игру в один HTML-файл: node build.mjs [куда] [--fragment]
import fs from 'fs'; import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const js = (f) => rd(f).replace(/<\/script/gi, '<\\/script');
const out = process.argv[2] || path.join(dir, 'dist', 'farm.html'), fragment = process.argv.includes('--fragment');
const html = rd('index.html');
const body = html.match(/<div id="app">[\s\S]*?<\/div>\s*(?=<script)/)[0];
const page = `<title>Ферма и Город</title>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>${rd('style.css')}</style>
${body}
<script>${js('vendor/three.min.js')}</script>
<script>${js('logic.js')}</script>
<script>${js('world3d.js')}</script>
<script>${js('game.js')}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, fragment ? page : `<!doctype html><html lang="ru"><head><meta charset="utf-8">${page.replace('<title>', '<title>').replace(/<\/script>\n$/, '</script>')}`.replace('</head>', '') .replace('<div id="app">', '</head><body><div id="app">') + '</body></html>');
console.log('ok', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
