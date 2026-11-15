// Headless check of the block generators and the server's guards. No brain needed.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Blockly = require('blockly');
const { pythonGenerator } = require('blockly/python');
globalThis.Blockly = Blockly;
Blockly.Python = pythonGenerator;
require('../public/iq-blocks.js');
require('../public/iq-cpp.js');

const ws = new Blockly.Workspace();
const chain = (list) => list.reduceRight((next, b) => (next ? { ...b, next: { block: next } } : b), null);
const n = (v) => ({ block: { type: 'math_number', fields: { NUM: v } } });
const loopBody = chain([
  { type: 'iq_motor_spin', fields: { PORT: '6', DIR: 'FORWARD' }, inputs: { SPEED: { block: { type: 'iq_axis', fields: { AXIS: 'A' } } } } },
  { type: 'iq_port_led', fields: { PORT: '3', COLOR: 'GREEN' } },
  { type: 'iq_port_volts', fields: { PORT: '1', DIR: 'REVERSE' }, inputs: { VOLTS: n(4) } },
  { type: 'iq_raw_if', fields: { COND: 'x > 0 and y' }, inputs: { DO: { block: { type: 'iq_raw_stmt', fields: { CODE: 'x = 1' } } } } },
  { type: 'iq_port_write', fields: { PORT: '2', DEV: 'Touchled', CALL: 'set_color(Color.RED)' } },
  { type: 'iq_pin_write', fields: { TARGET: 2, PORT: '4', LEVEL: 'True' } },
  { type: 'iq_print', inputs: { TEXT: { block: { type: 'iq_bitop', fields: { OP: '&' }, inputs: { A: n(6), B: n(3) } } } } },
]);
Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [chain([
  { type: 'iq_motor_setup', fields: { PORT: '6', REV: true } },
  { type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, inputs: { BOOL: { block: { type: 'iq_button', fields: { BTN: 'RUp' } } }, DO: { block: loopBody } } },
])] } }, ws);
const out = pythonGenerator.workspaceToCode(ws);
console.log(out);
for (const want of [
  'from vex import *', 'brain = Brain()', 'controller = Controller()',
  'motor_6 = Motor(Ports.PORT6, True)', 'motor_1 = Motor(Ports.PORT1, False)', 'touchled_3 = Touchled(Ports.PORT3)', 'touchled_2 = Touchled(Ports.PORT2)',
  'while controller.buttonRUp.pressing():', 'motor_6.spin(FORWARD, controller.axisA.position(), PERCENT)',
  'touchled_3.set_color(Color.GREEN)', 'motor_1.spin(REVERSE, 4, VOLT)', 'if x > 0 and y:\n        x = 1', 'touchled_2.set_color(Color.RED)', 'brain.screen.print(6 & 3)', '# pin blocks need C++ mode',
]) assert.ok(out.includes(want), 'missing: ' + want);
assert.ok(out.indexOf('from vex import *') < out.indexOf('brain = Brain()'));
// empty if body still valid python
const ws2 = new Blockly.Workspace();
Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: 'iq_raw_while', fields: { COND: 'True' } }] } }, ws2);
assert.ok(pythonGenerator.workspaceToCode(ws2).includes('while True:\n    pass'));
console.log('ok - generators');

// C++ output
const cppOut = Blockly.Cpp.workspaceToCode(ws);
console.log(cppOut);
for (const want of [
  '#include "vex.h"', 'vex::brain Brain;', 'vex::motor motor_6(PORT6, true);', 'vex::controller Controller;', 'vex::touchled touchled_3(PORT3);',
  'while (Controller.ButtonRUp.pressing()) {', 'motor_6.spin(forward, Controller.AxisA.position(), percent);', 'touchled_3.setColor(color::green);',
  'motor_1.spin(reverse, 4, volt);', 'if (x > 0 and y) {', 'touchled_2.set_color(Color.RED);', 'vexGenericDigitalOutput(PORT4, 2, 1);', 'Brain.Screen.print("%g", (double)((6) & (3)));',
]) assert.ok(cppOut.includes(want), 'missing in C++: ' + want);
console.log('ok - C++ generator');

// A startup hat is a top-level entry point; its attached stack runs once in order.
const startup = new Blockly.Workspace();
Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [chain([
  { type: 'iq_when_started' },
  { type: 'controls_repeat_ext', inputs: { TIMES: n(2), DO: { block: { type: 'iq_clear' } } } },
  { type: 'iq_motor_spin', fields: { PORT: '2', DIR: 'FORWARD' }, inputs: { SPEED: n(25) } },
  { type: 'iq_motor_stop', fields: { PORT: '2' } },
])] } }, startup);
const start = startup.getTopBlocks()[0];
assert.equal(start.previousConnection, null);
assert.ok(start.nextConnection);
assert.equal(start.hat, 'cap');
const startupPy = pythonGenerator.workspaceToCode(startup);
const startupCpp = Blockly.Cpp.workspaceToCode(startup);
assert.ok(startupCpp.indexOf('setvbuf(stdout, nullptr, _IONBF, 0);')<startupCpp.indexOf('// When started'),'Console must be unbuffered before user startup code');
assert.match(startupPy, /# When started\nfor .* in range\(2\):\n    brain.screen.clear_screen\(\)/);
assert.match(startupPy, /motor_2.spin\(FORWARD, 25, PERCENT\)\nmotor_2.stop\(\)/);
assert.match(startupCpp, /\/\/ When started\n    for \(int i_0 = 0;/);
assert.match(startupCpp, /motor_2.spin\(forward, 25, percent\);\n    motor_2.stop\(\);/);
assert.equal((startupCpp.match(/int main\(/g) || []).length, 1);
const restored = new Blockly.Workspace();
Blockly.serialization.workspaces.load(Blockly.serialization.workspaces.save(startup), restored);
assert.equal(restored.getTopBlocks()[0].hat, 'cap');
assert.equal(pythonGenerator.workspaceToCode(restored), startupPy);
assert.equal(Blockly.Cpp.workspaceToCode(restored), startupCpp);
startup.clear();
startup.newBlock('iq_when_started');
assert.match(pythonGenerator.workspaceToCode(startup), /# When started/);
assert.match(Blockly.Cpp.workspaceToCode(startup), /int main\(\)/);
startup.dispose();
restored.dispose();
console.log('ok - startup block, execution order, empty stack and saved workspace');

// server guards
process.env.PORT = '5199';
const { server } = require('../server.js');
await new Promise((r) => server.listen(5199, '127.0.0.1', r));
const get = (p, h = {}) => fetch('http://127.0.0.1:5199' + p, { headers: h });
assert.equal((await get('/')).status, 200);
for (const asset of ['/settings.html', '/base.css', '/app.css', '/theme.js', '/preferences.js', '/settings.js', '/transfer-ui.js', '/simulator-core.js', '/simulator-worker.js', '/simulator-screen.js', '/simulator-ui.js', '/simulator-devices.js', '/simulator-audio.js', '/simulator-python.js', '/simulator-python-worker.js', '/simulator-vex.py', '/vendor/pyodide/pyodide.mjs', '/vendor/pyodide/pyodide.asm.wasm', '/assets/iq2-brain-simulator.png']) {
  assert.equal((await get(asset)).status, 200, asset + ' should be served');
}
assert.equal((await get('/vendor/pyodide/pyodide.asm.wasm')).headers.get('content-type'), 'application/wasm');
assert.equal((await get('/')).headers.get('cross-origin-embedder-policy'), 'require-corp', 'the Python preview needs cross-origin isolation');
assert.equal((await get('/vendor/blockly/blockly_compressed.js')).status, 200);
assert.equal((await get('/vendor/blockly/../../package.json')).status, 404);
assert.equal((await get('/%2e%2e/server.js')).status, 404);
const rawStatus = (host) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: 5199, path: '/', headers: { host } }, (r) => { r.resume(); res(r.statusCode); }); q.on('error', rej); q.end(); });
assert.equal(await rawStatus('evil.example:5199'), 403);
assert.equal(await rawStatus('localhost:5199'), 200);
const post = (b, h = {}) => fetch('http://127.0.0.1:5199/api/download', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
assert.equal((await post({ code: 'x', slot: 9 })).status, 400);
assert.equal((await post({ code: '', slot: 1 })).status, 400);
assert.equal((await post({ code: 'x', slot: 1 }, { origin: 'http://evil.example' })).status, 403);
assert.equal((await fetch('http://127.0.0.1:5199/api/download', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
console.log('ok - server guards');
// a real compile of a pin program with VEX's own toolchain (skipped if the extension's SDK is not installed)
const buildStream=await fetch('http://127.0.0.1:5199/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'x',stream:true})});
const buildEvents=(await buildStream.text()).trim().split('\n').map(JSON.parse);
assert.equal(buildEvents[0].phase,'build');assert.equal(buildEvents.at(-1).type,'result');
const sdkThere=buildEvents.at(-1).out.includes('were not found')===false;
if (sdkThere) {
  const wsPins = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [chain([
    { type: 'iq_prong_write', fields: { LEVEL: 'False', PORT: '12' } },
    { type: 'iq_pin_enable', fields: { PORT: '3', OPTIONS: 1 } },
    { type: 'iq_pin_write', fields: { TARGET: 0, PORT: '3', LEVEL: 'True' } },
    { type: 'iq_print', inputs: { TEXT: { block: { type: 'iq_pin_digital', fields: { PORT: '3' } } } } },
    { type: 'iq_print', inputs: { TEXT: { block: { type: 'iq_pin_analog', fields: { PORT: '3' } } } } },
    { type: 'iq_print', inputs: { TEXT: { block: { type: 'iq_pin_read', fields: { TARGET: 1, PORT: '5' } } } } },
    { type: 'iq_motor_spin_for', fields: { PORT: '1', DIR: 'FORWARD' }, inputs: { DEG: n(90) } },
    { type: 'iq_port_distance', },
  ].slice(0, 7))] } }, wsPins);
  const good = Blockly.Cpp.workspaceToCode(wsPins);
  const ok = await (await fetch('http://127.0.0.1:5199/api/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: good }) })).json();
  assert.ok(ok.ok, 'pin program should compile:\n' + ok.out + '\n' + good);
  const bad = await (await fetch('http://127.0.0.1:5199/api/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'int main() { return nope; }' }) })).json();
  assert.equal(bad.ok, false);
  console.log('ok - C++ pin program compiles with the VEX toolchain');
} else console.log('skip - VEX C++ SDK not installed');

// Exercise downloads against a fake tool; these tests never touch a USB brain.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'iqraw-vexcom-test-'));
const originalVexcom = process.env.VEXCOM;
try {
  const tool = path.join(fixture, 'vexcom.js');
  const calls = path.join(fixture, 'calls.jsonl');
  fs.writeFileSync(tool, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if(!args.includes('--write')){console.log(JSON.stringify({iq2:{brain:{vexos:'0x01000900'},vms:{items:[{binfile:'python_vm.bin'}]}}}));process.exit(0);}
const file = args[args.indexOf('--write') + 1];
fs.appendFileSync(process.env.IQRAW_TEST_CALLS, JSON.stringify({ args, file, source: fs.readFileSync(file, 'utf8') }) + '\\n');
if (process.env.IQRAW_TEST_MODE === 'signal') process.kill(process.pid, 'SIGTERM');
else if (process.env.IQRAW_TEST_MODE === 'old' && args.includes('--name')) { console.error('unknown option --name'); process.exitCode = 7; }
else if (process.env.IQRAW_TEST_MODE === 'silent') { console.error('Device: /dev/tty.usbmodem101\\nvexcom utility V1.0.2b2'); process.exitCode = 1; }
else if (process.env.IQRAW_TEST_MODE === 'port') process.exitCode = 6;
else if (process.env.IQRAW_TEST_MODE === 'version') process.exitCode = 3;
else if (process.env.IQRAW_TEST_MODE === 'partial') {console.log('{"phase":"program","action":"download","percent":7}');console.error('unknown response; usage unavailable');process.exitCode=4;}
else if (process.env.IQRAW_TEST_MODE === 'progress') {process.stdout.write('{"phase":"program","action":"download","per');setTimeout(()=>{process.stdout.write('cent":7}\\n');setTimeout(()=>{fs.writeFileSync(process.env.IQRAW_TEST_CALLS+'.done','done');console.log('{"status":0}');},300);},25);}
else console.log('{"status":0,"message":"Download complete"}');
`);
  fs.chmodSync(tool, 0o755);
  process.env.VEXCOM = tool;
  process.env.IQRAW_TEST_CALLS = calls;
  const attempts = () => fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
  const send = async (mode, run = false) => {
    process.env.IQRAW_TEST_MODE = mode;
    return (await post({ code: 'print("hello")\r\n', slot: 8, name: 'test robot', lang: 'python', run })).json();
  };
  const failed = await send('silent');
  assert.equal(failed.ok, false);
  assert.match(failed.out, /vexcom exited with code 1/);
  assert.equal(attempts().length, 1, 'ambiguous failure must not repeat the transfer');
  const first = attempts()[0];
  for (const flag of ['--name', '--slot', '--write', '--json', '--progress', '--verbose']) assert.ok(first.args.includes(flag));
  assert.ok(!first.args.includes('--run'));
  assert.ok(!first.args.includes('--timer'));
  assert.equal(first.args[first.args.indexOf('--slot') + 1], '8');
  assert.equal(first.source, 'print("hello")\n');
  assert.ok(!fs.existsSync(first.file), 'temporary code should be cleaned after failure');
  const port = await send('port');
  assert.match(port.out, /code 6 \(serial port error/);
  if (process.platform !== 'darwin') assert.match(port.out, /VEX USB ports (are )?present/, 'Windows/Linux should report whether the brain ports exist');
  const version = await send('version');
  assert.match(version.out,/Brain VEXos: 1\.0\.9\.0/);
  assert.match(version.out,/Python VM is installed/);
  const beforePartial=attempts().length;
  const partial=await send('partial');
  assert.equal(partial.ok,false);
  assert.equal(attempts().length-beforePartial,1,'A partially completed download must never trigger the option fallback');
  const killed = await send('signal');
  assert.equal(killed.ok, false);
  // Windows has no signals: a process that kills itself simply exits with code 1.
  assert.match(killed.out, process.platform === 'win32' ? /exited with code 1/ : /terminated by SIGTERM/);
  const beforeOld = attempts().length;
  const old = await send('old', true);
  assert.equal(old.ok, true);
  assert.match(old.warning,/Console connection failed/,'A successful download must still expose a failed terminal connection');
  const fallback = attempts().slice(beforeOld);
  assert.equal(fallback.length, 2);
  assert.ok(fallback[0].args.includes('--name'));
  assert.ok(!fallback[1].args.includes('--name'));
  assert.ok(fallback[1].args.includes('--run'));
  assert.ok(!fs.existsSync(fallback[1].file), 'temporary code should be cleaned after success');
  process.env.IQRAW_TEST_MODE='progress';
  const streaming=await post({code:'print("hello")',slot:8,stream:true});
  assert.match(streaming.headers.get('content-type'),/application\/x-ndjson/);
  const reader=streaming.body.getReader(),decoder=new TextDecoder();let text='';
  while(!text.includes('"percent":7')){const chunk=await reader.read();assert.equal(chunk.done,false);text+=decoder.decode(chunk.value,{stream:true});}
  assert.equal(fs.existsSync(calls+'.done'),false,'Progress must arrive before vexcom exits');
  while(true){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value,{stream:true});}
  const events=text.trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'result');assert.equal(events.at(-1).ok,true);
  console.log('ok - download flags, silent errors, signals, compatibility and cleanup (mock tool)');
} finally {
  if (originalVexcom === undefined) delete process.env.VEXCOM;
  else process.env.VEXCOM = originalVexcom;
  delete process.env.IQRAW_TEST_CALLS;
  delete process.env.IQRAW_TEST_MODE;
  fs.rmSync(fixture, { recursive: true, force: true });
}
server.close();

