import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const dict = JSON.parse(read('data/dictionary.json'));
const main = read('src/main.js');
const desktop = read('src/desktop.js');
const desktopCss = read('src/desktop.css');
const electron = read('electron/main.cjs');
const preload = read('electron/preload.cjs');

test('npm scripts regenerate icons before packaging', () => {
  for (const name of ['build:win', 'build:dir', 'build:linux', 'build:mac']) {
    assert.match(pkg.scripts[name], /npm run icons && electron-builder/);
  }
  assert.match(pkg.scripts.prestart, /icons/);
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.ok(existsSync(path.join(root, 'assets/icon.svg')));
});

test('frame-less window has native Win11 corners and isolated preload', () => {
  assert.match(electron, /frame: false/);
  assert.match(electron, /roundedCorners: true/);
  assert.match(electron, /contextIsolation: true/);
  assert.match(electron, /nodeIntegration: false/);
  assert.match(electron, /sandbox: true/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
});

test('controls are in standard Windows order and use the real SVG assets', () => {
  assert.ok(desktop.indexOf('data-action="minimize"') < desktop.indexOf('data-action="maximize"'));
  assert.ok(desktop.indexOf('data-action="maximize"') < desktop.indexOf('data-action="close"'));
  for (const name of ['minimzar', 'maximizar', 'restaurar', 'fechar']) {
    assert.ok(desktop.includes(`assets/${name}.svg`));
    assert.ok(existsSync(path.join(root, `assets/${name}.svg`)));
  }
  assert.match(desktop, /header\.before\(shell\)/);
  assert.match(desktop, /windowState\(\)\.then\(setWindowState\)/);
});

test('Termo, Dueto and Quarteto preserve independent progress', () => {
  assert.match(main, /count:1, attempts:6/);
  assert.match(main, /count:2,attempts:7/);
  assert.match(main, /count:4,attempts:9/);
  assert.match(main, /game:\$\{mode\}/);
});

test('dictionary file is shared by all game modes, including TRENS', () => {
  assert.equal(dict.index.length, 11296);
  assert.equal(dict.answers.length, 2137);
  assert.ok(dict.index.some(([base]) => base === 'TRENS'));
  assert.match(electron, /data.*dictionary\.json/);
  assert.match(main, /window\.termoDesktop\?\.loadDictionary/);
});

test('only the native window has rounded external corners, and game components keep original radii', () => {
  assert.doesNotMatch(desktopCss, /html\.electron\s+body\s*\{[^}]*border-radius/s);
  assert.doesNotMatch(desktopCss, /html\.electron\s+wc-bar\s*\{[^}]*border-radius/s);
  assert.doesNotMatch(desktopCss, /html\.electron\s+wc-modal/);
  assert.doesNotMatch(desktop, /addShadowRules\(['"]wc-kbd['"]/);
  assert.doesNotMatch(desktop, /addShadowRules\(['"]wc-modal['"]/);
  assert.doesNotMatch(desktop, /button img, button div[^\n]*border-radius/);
  assert.match(desktopCss, /desktop-window-control\s*\{[^}]*border-radius: 20%/s);
  assert.doesNotMatch(main, /rowSheet\.insertRule\(.*border-radius/);
});

test('space skips a letter position without modifying its content, in both sources', () => {
  assert.match(main, /function advanceCursor\(\)/);
  assert.match(main, /game\.cursor\+\+;save\(\);renderEditable\(\)/);
  assert.match(main, /value==='SPACE'\)return advanceCursor\(\)/);
  assert.match(main, /e\.key===' '\|\|e\.key==='Spacebar'\|\|e\.code==='Space'/);
  const standalone=read('termo-abrir-direto.html');
  assert.match(standalone,/function advanceCursor\(\)/);
  assert.match(standalone,/e\.code==='Space'/);
});

test('mode transitions reuse actual row nodes and animate geometry with fade on added/removed rows', () => {
  assert.match(main,/rememberBoardGeometry\(m\)/);
  assert.match(main,/const el=former\[b\]\|\|document\.createElement\('wc-board'\)/);
  assert.match(main,/let row=formerRows\[r\]/);
  assert.match(main,/const sx=previous\.width\/next\.width/);
  assert.match(main,/row\.animate\(frames,/);
  assert.match(main,/showDepartingRows\(snapshot\.departing\)/);
  assert.match(main,/\{opacity:0,transform:'translateY\(-6px\) scale\(\.97\)'\}/);
  assert.match(main,/prefers-reduced-motion: reduce/);
  assert.match(main,/\[mode-morphing\]/);
});


test('web service worker changes cache version so previous main.js is not served after update', () => {
  assert.match(read('sw.js'), /termo-original-template-v6-split-keyboard/);
});


test('submission does not show redundant registered notification', () => {
  assert.doesNotMatch(main, /Tentativa registrada/);
  assert.match(main, /turnTimer=setTimeout\(\(\)=>\{locked=false;renderAll\(\);if\(game.finished\)/);
});

test('typed letters remain visually outlined until the guess is confirmed', () => {
  const styles = read('src/styles.js');
  assert.match(main, /cell\.classList\.add\('pending'\)/);
  assert.match(styles, /\.letter\.empty, \.letter\.pending/);
  assert.match(styles, /\.letter\.future/);
  assert.match(styles, /border-radius: 10%/);
  assert.doesNotMatch(main, /rowSheet\.insertRule\(.*border-radius/);
});

test('dragging works from top header and mode bar, except on actual controls', () => {
  assert.match(desktopCss, /\.desktop-heading\s*\{[^}]*-webkit-app-region: drag/s);
  assert.match(desktopCss, /\.desktop-window-control\s*\{[^}]*-webkit-app-region: no-drag/s);
  assert.match(desktop, /addShadowRules\('wc-bar'[\s\S]*:host \{[^}]*-webkit-app-region: drag/);
  assert.match(desktop, /a \{ -webkit-app-region: no-drag; \}/);
  assert.match(desktop, /addShadowRules\('wc-header'[\s\S]*:host \{[^}]*-webkit-app-region: drag/);
});

test('window control hover stays inside close, maximize and minimize borders', () => {
  assert.match(desktopCss, /\.desktop-window-control\s*\{[^}]*width: 32px;[^}]*height: 32px;/s);
  assert.match(desktopCss, /\.desktop-window-control\s*\{[^}]*border: 2px solid/s);
  assert.match(desktopCss, /\.desktop-window-control:hover \{ background-color:/);
  assert.doesNotMatch(desktopCss, /\.desktop-window-control img \{[^}]*border: /s);
  assert.match(desktopCss, /gap: 5px/);
});

test('keyboard shows per-board feedback in two halves or four quadrants', () => {
  const html = read('index.html');
  assert.match(html, /button\.split-2\s*\{/);
  assert.match(html, /button\.split-4\s*\{/);
  assert.match(html, /background-position: left top, left bottom/);
  assert.match(html, /background-size: 100% 50%/);
  assert.match(main, /const byBoard=Array\.from\(\{length:count\}/);
  assert.match(main, /for\(let b=0;b<count;b\+\+\)/);
  assert.match(main, /button\.classList\.add\(`split-\$\{count\}`\)/);
  assert.match(main, /statuses\.every\(status=>status==='wrong'\)/);
  assert.match(main, /--key-board-\$\{b\}/);
  const standalone = read('termo-abrir-direto.html');
  assert.match(standalone, /button\.split-4/);
  assert.match(standalone, /const byBoard=Array\.from/);
});

// Ajustes de navegação entre as casas (Termo, Dueto e Quarteto).
test('typing skips occupied cells and removes highlight when all five are complete', () => {
  assert.match(main,/function nextEmptyAfter\(position\)/);
  assert.match(main,/\(position\+step\)%5/);
  assert.match(main,/game\.current\.includes\(''\)\&\&i===game\.cursor/);
  assert.match(main,/game\.cursor=nextEmptyAfter\(pos\)/);
});
test('backspace on complete row deletes last tile and stays there', () => {
  assert.match(main,/if\(i===5\)i=4/);
  assert.match(main,/game\.current\[i\]='';game\.cursor=i/);
});
