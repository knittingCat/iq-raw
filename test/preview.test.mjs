// The C++ code preview: the right WASI SDK for every OS, source checks, and (when installed) a real compile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { wasiSdk, HASHES } = require('../preview/wasi-sdk.js');
const { validate, compile } = require('../preview/compiler.js');

for (const [platform, arch, target] of [['darwin', 'arm64', 'arm64-macos'], ['darwin', 'x64', 'x86_64-macos'], ['win32', 'x64', 'x86_64-windows'], ['win32', 'arm64', 'arm64-windows'], ['linux', 'x64', 'x86_64-linux'], ['linux', 'arm64', 'arm64-linux']]) {
  const sdk = wasiSdk(platform, arch, '/home/u');
  assert.equal(sdk.name, 'wasi-sdk-34.0-' + target);
  assert.equal(sdk.url, `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/wasi-sdk-34.0-${target}.tar.gz`);
  assert.match(sdk.sha256, /^[0-9a-f]{64}$/);
  assert.ok(sdk.clang.endsWith(platform === 'win32' ? 'clang++.exe' : 'clang++'));
}
assert.equal(wasiSdk('freebsd', 'x64'), null);
assert.equal(wasiSdk('linux', 'ia32'), null);
assert.equal(new Set(Object.values(HASHES)).size, 6, 'each archive has its own checksum');
console.log('ok - C++ preview picks the WASI SDK for macOS, Windows and Linux on x64 and arm64');

validate('#include "vex.h"\n#include <cmath>\nint main() { return 0; }');
for (const bad of ['#include "secret.txt"', '#include </etc/passwd>', '#include MACRO', '#import "x"', 'asm("nop");', '__asm__("nop");', '.incbin "x"', '#if __has_embed("x")\n#endif', '%:include "/etc/passwd"', ' %: include <C:/secret.txt>', '#if __has_include("/etc/passwd")\n#endif', '#if __has_include_next(<x>)\n#endif', '_Pragma("clang system_header")', '']) {
  assert.throws(() => validate(bad), Error, JSON.stringify(bad) + ' must be refused');
}
validate('#include <cstdio>\nint main() { std::printf("50%% done\\n"); return 0; }');
console.log('ok - preview source checks refuse host files (including digraph and __has_include), assembly and empty code');

const sdk = wasiSdk();
if (!sdk || !fs.existsSync(sdk.clang)) console.log('skip - C++ preview compiler not installed (npm run setup-preview)');
else {
  const good = await compile('#include "vex.h"\nint main() { int total = 0; for (int i = 1; i <= 10; ++i) total += i; return total == 55 ? 0 : 1; }');
  assert.ok(good.ok, good.out);
  assert.deepEqual([...Buffer.from(good.wasm, 'base64').subarray(0, 4)], [0, 0x61, 0x73, 0x6d], 'the result should be WebAssembly');
  const bad = await compile('int main() { return nope; }');
  assert.equal(bad.ok, false);
  assert.match(bad.out, /nope/);
  console.log(`ok - compiles a C++ preview to WebAssembly with ${sdk.name}, and reports compiler errors`);
}
