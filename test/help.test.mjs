// The troubleshooting guide, its renderer, and the console's "How to fix" links must agree with each other.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<div id="out"></div>', { runScripts: 'outside-only' });
const w = dom.window;
for (const file of ['public/markdown.js', 'public/troubleshoot.js']) w.eval(fs.readFileSync(file, 'utf8'));
const out = w.document.getElementById('out');
try {
  const guide = fs.readFileSync('TROUBLESHOOTING.md', 'utf8');
  w.IQMarkdown.render(guide, out);
  const ids = new Set([...out.querySelectorAll('[id]')].map((e) => e.id));
  assert.ok(out.querySelectorAll('h2').length >= 10, 'the guide should have its sections');
  assert.ok(out.querySelector('table td'), 'the exit-code table should render');
  for (const anchor of w.IQHelp.anchors) assert.ok(ids.has(anchor), `console links to #${anchor}, which the guide lacks`);
  for (const a of out.querySelectorAll('a[href^="#"]')) assert.ok(ids.has(a.getAttribute('href').slice(1)), `broken link in the guide: ${a.getAttribute('href')}`);
  assert.equal(out.querySelectorAll('h2 a, script, iframe').length, 0);
  // Anchors from the README into the guide must resolve too.
  for (const [, anchor] of fs.readFileSync('README.md', 'utf8').matchAll(/TROUBLESHOOTING\.md#([\w-]+)/g)) assert.ok(ids.has(anchor), `README links to missing #${anchor}`);
  console.log(`ok - troubleshooting guide renders ${ids.size} anchors; console, README and in-guide links all resolve`);

  // Renderer: GitHub-style slugs, and nothing from the text becomes markup or a script link.
  out.replaceChildren();
  w.IQMarkdown.render('## Version error (code 3)\n## C++ builds\n## C++ builds\n<img src=x onerror=alert(1)> **bold `code`** [bad](javascript:alert(1)) [ok](https://example.com) [far](//evil.example) [far2](/\\evil.example) [local](/help.html)\n\n- one\n  continued\n- two\n\n1. first\n\n```\n<b>raw</b>\n```\n\n| a | b |\n|---|---|\n| `x` | y |', out);
  assert.deepEqual([...out.querySelectorAll('h2')].map((h) => h.id), ['version-error-code-3', 'c-builds', 'c-builds-1']);
  assert.equal(out.querySelector('img'), null);
  assert.ok(out.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.equal(out.querySelector('strong code').textContent, 'code');
  assert.equal(out.querySelector('a[href^="javascript"]'), null);
  assert.equal(out.querySelector('a[href="https://example.com"]').rel, 'noopener noreferrer');
  assert.deepEqual([...out.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['https://example.com', '/help.html'], 'protocol-relative //host and /\\host links are dropped');
  assert.equal(out.querySelector('ul').children.length, 2);
  assert.equal(out.querySelector('ul li').textContent, 'one continued');
  assert.equal(out.querySelector('ol li').textContent, 'first');
  assert.equal(out.querySelector('pre code').textContent, '<b>raw</b>');
  assert.equal(out.querySelector('pre b'), null);
  assert.equal(out.querySelectorAll('tbody tr').length, 1);
  assert.equal(out.querySelector('td code').textContent, 'x');
  console.log('ok - markdown renderer: slugs, lists, tables, code, and no HTML or script links from text');

  // Error text to guide section.
  const where = (text) => w.IQHelp.match(text).anchor;
  assert.equal(where('vexcom was not found. Install the VS Code extension'), 'vexcom-was-not-found');
  assert.equal(where('Device not found\n\nvexcom exited with code 5 (device not found; connect the powered-on brain directly by USB).'), 'brain-not-found');
  assert.equal(where('vexcom exited with code 6 (serial port error)'), 'the-brain-is-busy-or-the-port-is-in-use');
  assert.equal(where('vexcom exited with code 2 (brain communication failed)'), 'the-brain-is-busy-or-the-port-is-in-use');
  assert.equal(where('vexcom exited with code 3 (version error)'), 'version-error-code-3');
  assert.equal(where('vexcom exited with code 1 (operation failed)'), 'download-fails-with-code-1');
  assert.equal(where('progress 40%\n[timed out]\n\nvexcom exited with code -1'), 'an-action-times-out');
  assert.equal(where('vexcom terminated by SIGTERM.'), 'an-action-times-out');
  assert.equal(where('The VEX IQ2 C++ tools were not found or their installation is incomplete.'), 'c-builds');
  assert.equal(where("src/main.cpp:3:12: error: use of undeclared identifier 'nope'\nmake: *** [build/src/main.o] Error 1"), 'c-builds');
  assert.equal(where('Cannot reach the iq-raw server. Start it again'), 'the-page-will-not-load-or-looks-broken');
  assert.equal(where('No IQ brain console port found.'), 'live-console');
  assert.equal(where('No code to send (or too long).'), 'downloading-slots-and-names');
  assert.equal(where('Bluetooth requires Chrome or Edge with Web Bluetooth support.'), 'bluetooth');
  assert.equal(where('Bluetooth response timed out. Transfer completion was not confirmed.'), 'bluetooth');
  assert.equal(where('Connect and pair an IQ2 brain first.'), 'bluetooth');
  assert.equal(where('Console connection failed: busy\nProgram output may be missed'), 'live-console');
  assert.equal(where('The C++ preview compiler is not installed. Run npm run setup-preview once, then retry.'), 'brain-preview-and-program-tree');
  assert.equal(where('something nobody has seen before'), 'start-here');
  console.log('ok - console errors link to the matching troubleshooting section');
} finally {
  dom.window.close();
}

// The server serves the guide and the help page, and nothing else from the project root.
process.env.PORT = '5195';
const { server } = require('../server.js');
await new Promise((r) => server.listen(5195, '127.0.0.1', r));
try {
  const get = (p) => fetch('http://127.0.0.1:5195' + p);
  const md = await get('/docs/TROUBLESHOOTING.md');
  assert.equal(md.status, 200);
  assert.match(md.headers.get('content-type'), /text\/markdown/);
  assert.equal(await md.text(), fs.readFileSync('TROUBLESHOOTING.md', 'utf8'));
  for (const p of ['/help.html', '/help.js', '/markdown.js', '/troubleshoot.js']) assert.equal((await get(p)).status, 200, p);
  for (const p of ['/docs/README.md', '/docs/../server.js', '/TROUBLESHOOTING.md']) assert.equal((await get(p)).status, 404, p);
  console.log('ok - server serves the guide and help page only');
} finally {
  server.close();
}
