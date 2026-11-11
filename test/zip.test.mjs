// The built-in ZIP extractor used for the C++ project template. No unzip program needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeZip } from './tools.mjs';
const require = createRequire(import.meta.url);
const { extractZip, readZipEntry } = require('../zip.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iqraw-zip-'));
try {
  const good = path.join(dir, 'good.zip'), out = path.join(dir, 'out');
  const makefile = 'all:\n\t@echo build\n'.repeat(50);
  fs.writeFileSync(good, makeZip([['src/'], ['src/main.cpp', 'int main() {}\n'], ['makefile', makefile, true], ['include/vex.h', '#pragma once\n', true]]));
  extractZip(good, out);
  assert.equal(fs.readFileSync(path.join(out, 'src', 'main.cpp'), 'utf8'), 'int main() {}\n');
  assert.equal(fs.readFileSync(path.join(out, 'makefile'), 'utf8'), makefile);
  assert.equal(fs.readFileSync(path.join(out, 'include', 'vex.h'), 'utf8'), '#pragma once\n');
  assert.equal(readZipEntry(good, 'include/vex.h').toString(), '#pragma once\n');
  assert.equal(readZipEntry(good, 'makefile').toString(), makefile);
  assert.equal(readZipEntry(good, 'missing.h'), null);

  const evil = path.join(dir, 'evil.zip');
  fs.writeFileSync(evil, makeZip([['../escaped.txt', 'nope']]));
  assert.throws(() => extractZip(evil, path.join(dir, 'evil')), /outside its folder/);
  assert.ok(!fs.existsSync(path.join(dir, 'escaped.txt')));

  const cut = path.join(dir, 'cut.zip');
  fs.writeFileSync(cut, fs.readFileSync(good).subarray(0, 40));
  assert.throws(() => extractZip(cut, path.join(dir, 'cut')), /not a ZIP file/);
  console.log('ok - ZIP extraction, folders, deflate, path escape and truncated files');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
