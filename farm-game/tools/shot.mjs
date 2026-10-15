// Снимок модели: node tools/shot.mjs <порт> "<query>" <файл.png>   (сервер: python3 -m http.server <порт> --directory farm-game)
import { createRequire } from 'module'; import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [port, query, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 640 } })).newPage(); const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); p.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto(`http://localhost:${port}/tools/viewer.html?${query}`); await p.waitForFunction(() => window.__ready, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.screenshot({ path: out }); console.log('models:', await p.evaluate(() => window.__count), 'title:', await p.title(), errs.join(' | ') || 'no errors'); await b.close();
