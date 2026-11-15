// Builds every catalog block in both languages: the Python must parse, and the C++ must compile with VEX's own toolchain
// (the compile is skipped if the VEX extension's C++ SDK is not installed).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { python } from "./tools.mjs";
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Blockly = require('blockly');
const { pythonGenerator } = require('blockly/python');
globalThis.Blockly = Blockly;
Blockly.Python = pythonGenerator;
require('../public/iq-blocks.js');
require('../public/iq-cpp.js');
require('../public/iq-catalog.js');

const chain = (list) => list.reduceRight((next, b) => (next ? { ...b, next: { block: next } } : b), null);
const say = { type: 'iq_print', inputs: { TEXT: { block: { type: 'text', fields: { TEXT: 'x' } } } } };
const specs = Blockly.IQ_SPECS;

// one program per dropdown position k: every dropdown is set to its k-th option (or its last, if it has fewer)
function stateFor(k) {
  const stmts = [];
  const hats = [];
  const fieldsOf = (spec) => Object.fromEntries(spec.args.filter((a) => a.t === 'dd').map((a) => {
    const o = a.opts[Math.min(k, a.opts.length - 1)];
    return [a.name, Array.isArray(o) ? o[1] : o];
  }));
  for (const s of specs) {
    const fields = fieldsOf(s);
    if (s.kind === 's') stmts.push({ type: s.id, fields });
    else if (s.kind === 'h') hats.push({ type: s.id, fields, inputs: { DO: { block: say } } });
    else stmts.push({ type: 'iq_print', inputs: { TEXT: { block: { type: s.id, fields } } } });
  }
  stmts.unshift({ type: 'iq_dt_setup', fields: { LP: '1', RP: '6', RREV: true } });
  return { blocks: { languageVersion: 0, blocks: [chain([{ type: 'iq_when_started' }, ...stmts]), ...hats.map((h, i) => ({ ...h, x: 10, y: 10 + i * 40 }))] } };
}
const rounds = Math.max(...specs.flatMap((s) => s.args.filter((a) => a.t === 'dd').map((a) => a.opts.length)));

function make(gen, state) {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  return gen.workspaceToCode(ws);
}
const pyParses = (code) => spawnSync(python, ['-I', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: code, encoding: 'utf8' });

// functions, loops, variables and a Python-only list block, in a second program
const extraState = { blocks: { languageVersion: 0, blocks: [
  { type: 'procedures_defnoreturn', fields: { NAME: 'wiggle' }, x: 10, y: 10, inputs: { STACK: { block: { type: 'iq_print', inputs: { TEXT: { block: { type: 'text', fields: { TEXT: 'wiggle' } } } } } } } },
  chain([
    { type: 'iq_when_started' },
    { type: 'procedures_callnoreturn', extraState: { name: 'wiggle' } },
    { type: 'controls_for', fields: { VAR: { name: 'i' } }, inputs: { FROM: { block: { type: 'math_number', fields: { NUM: 1 } } }, TO: { block: { type: 'math_number', fields: { NUM: 5 } } }, BY: { block: { type: 'math_number', fields: { NUM: 1 } } }, DO: { block: { type: 'iq_print', inputs: { TEXT: { block: { type: 'variables_get', fields: { VAR: { name: 'i' } } } } } } } } },
    { type: 'variables_set', fields: { VAR: { name: 'count' } }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 3 } } } } },
    { type: 'iq_thread', fields: { NAME: 'wiggle' } },
    { type: 'iq_print', inputs: { TEXT: { block: { type: 'lists_length' } } } },
  ]),
] }, variables: [{ name: 'i', id: 'i' }, { name: 'count', id: 'count' }] };

process.env.PORT = '5198';
const { server } = require('../server.js');
await new Promise((r) => server.listen(5198, '127.0.0.1', r));
const build = async (code) => (await fetch('http://127.0.0.1:5198/api/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
const sdk = !(await build('x')).out.includes('were not found');

for (let k = 0; k < rounds; k++) {
  const state = stateFor(k);
  const pyCode = make(pythonGenerator, state);
  const parsed = pyParses(pyCode);
  assert.equal(parsed.status, 0, `Python (option ${k}) should parse:\n${parsed.stderr}\n${pyCode}`);
  if (k === 0) {
    assert.ok(pyCode.includes('drivetrain = SmartDrive(drivetrain_left, drivetrain_right, brain_inertial, 200, 173, 76, MM, 1)'));
    assert.ok(pyCode.includes('def ev_brain_pressed_1():') && pyCode.includes('brain.button.pressed(ev_brain_pressed_1)'));
  }
  const cppCode = make(Blockly.Cpp, state);
  if (k === 0) assert.ok(cppCode.includes('void ev_bumper_pressed_1();'));
  if (sdk) {
    const r = await build(cppCode);
    if (!r.ok) console.log(cppCode);
    assert.ok(r.ok, `C++ (option ${k}) should compile:\n${r.out}`);
  }
}
console.log(`ok - Python for all ${specs.length} catalog blocks parses, with every dropdown option (${rounds} programs)`);
console.log(sdk ? `ok - C++ for all ${specs.length} catalog blocks compiles, with every dropdown option` : 'skip - VEX C++ SDK not installed');

{
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(extraState, ws);
  const py = pythonGenerator.workspaceToCode(ws);
  assert.equal(pyParses(py).status, 0, 'Python extras should parse:\n' + py);
  assert.ok(py.includes('Thread(wiggle)'), py);
  const ws2 = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(extraState, ws2);
  const cc = Blockly.Cpp.workspaceToCode(ws2);
  assert.ok(cc.includes('void f_wiggle();') && cc.includes('thread(f_wiggle);') && cc.includes('is not supported in C++ mode'), cc);
  if (sdk) { const r = await build(cc); assert.ok(r.ok, 'C++ extras should compile:\n' + r.out + '\n' + cc); }
  console.log('ok - functions, for loop, variables, threads and the Python-only list block');
}
server.close();
