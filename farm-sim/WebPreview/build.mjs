// Собирает показ поля в один HTML: node build.mjs <выход.html> [--local-three]
// --local-three: вместо cdnjs вставить three.js из farm-game/vendor (для проверки без сети)
import fs from 'fs'; import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2] || path.join(dir, 'dist', 'field-demo.html');
const local = process.argv.includes('--local-three');
let html = fs.readFileSync(path.join(dir, 'field-demo.html'), 'utf8');
const js = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<!--INLINE:(.+?)-->/g, (_, f) => `<script>/* ${path.basename(f)} */\n${js(f)}\n</script>`);
if (local) html = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>', `<script>${js('../../farm-game/vendor/three.min.js')}</script>`);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log('ok', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
