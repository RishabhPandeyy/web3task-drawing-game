const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildClient } = require('../scripts/build-client');

test('static build includes the Socket.IO client and loads backend configuration before each page script', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'quickdraw-build-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  buildClient('https://game.example.com/', output);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(output, 'js', 'config.js'), 'utf8'), context);
  assert.equal(context.window.QUICKDRAW_CONFIG.serverUrl, 'https://game.example.com');
  const browser = { console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(output, 'socket.io', 'socket.io.js'), 'utf8'), browser);
  assert.equal(typeof browser.io, 'function');
  for (const page of ['index', 'lobby', 'game']) {
    const html = fs.readFileSync(path.join(output, `${page}.html`), 'utf8');
    assert.ok(html.indexOf('src="/js/config.js"') < html.indexOf(`src="/js/${page}.js"`));
    assert.match(fs.readFileSync(path.join(output, 'js', `${page}.js`), 'utf8'), /io\(window\.QUICKDRAW_CONFIG\.serverUrl \|\| undefined\)/);
  }
});

test('static build rejects missing configuration and URLs that are not backend origins', () => {
  for (const url of [undefined, '', 'file:///tmp/backend', 'https://example.com/api', 'https://user:password@example.com', 'https://example.com?token=x']) {
    assert.throws(() => buildClient(url));
  }
});
