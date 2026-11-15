#!/usr/bin/env node
// Local server for iq-raw: serves the editor and runs VEX's own `vexcom` tool to talk to the IQ (2nd gen) brain over USB.
// It listens on 127.0.0.1 only, because anything that can reach it can overwrite programs on the brain.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { extractZip } = require('./zip');

const PORT = Number(process.env.PORT) || 5174;
const ROOT = __dirname;
const HOME_DIR = path.join(os.homedir(), '.iq-raw', 'vexcom');
const MAX_CODE = 200000;

// ---- finding vexcom ----
// VEX ships vexcom inside its VS Code extension (without the executable bit, and one folder per platform). Copy it, with
// its libusb, to our own folder. Looks in VS Code and the other editors that share its extension format.
const EXE = process.platform === 'win32' ? 'vexcom.exe' : 'vexcom';
const PLATFORM_DIR = process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'win32' : `linux-${{ x64: 'x64', arm64: 'arm64', arm: 'arm32' }[process.arch] || process.arch}`;
const { EXT_ROOTS, STORAGES, findSdk, findTemplate } = require('./vex-paths');
// The extension downloads vexcom into its storage folder (tools/vexcom/<version>/<platform>) the first time it runs;
// older versions bundled it inside the extension folder instead.
const STORE_ROOTS = STORAGES.map((s) => path.join(s, 'tools', 'vexcom'));
const PALETTE_KEYS = process.platform === 'darwin' ? 'Cmd+Shift+P' : 'Ctrl+Shift+P';
let lastSearch = '';

function installVexcom(src) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(HOME_DIR, f));
  fs.chmodSync(path.join(HOME_DIR, EXE), 0o755);
  return path.join(HOME_DIR, EXE);
}

function findVexcom() {
  if (process.env.VEXCOM) return process.env.VEXCOM;
  const own = path.join(HOME_DIR, EXE);
  if (fs.existsSync(own)) return own;
  for (const root of STORE_ROOTS) {
    let versions = [];
    try { versions = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, PLATFORM_DIR, EXE))); } catch { continue; /* not downloaded */ }
    versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (versions.length) return installVexcom(path.join(root, versions[versions.length - 1], PLATFORM_DIR));
  }
  const seen = [];
  for (const root of EXT_ROOTS) {
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch { continue; /* editor not installed */ }
    for (const d of dirs) {
      if (/vex/i.test(d)) seen.push(path.join(root, d));
      const src = path.join(root, d, 'resources', 'tools', 'vexcom', PLATFORM_DIR);
      if (!fs.existsSync(path.join(src, EXE))) continue;
      return installVexcom(src);
    }
  }
  lastSearch = `Looked in: ${STORE_ROOTS.join(', ')} and in resources/tools/vexcom/${PLATFORM_DIR} of ${EXT_ROOTS.join(', ')}. VEX-looking extension folders found: ${seen.length ? seen.join(', ') : 'none'}.`;
  return null;
}

const notFound = () => `vexcom was not found. Install the VS Code extension "VEX" by VEX Robotics (id vexrobotics.vexcode). Then open VS Code once and create a new VEX project (${PALETTE_KEYS}, "New Project"), so the extension downloads its tools, and retry. Or set VEXCOM=/path/to/${EXE}.\n${lastSearch}`;

// ---- running tools, one command at a time (one USB device, and builds share the template) ----
let queue = Promise.resolve();
function run(bin, args, { timeoutMs = 30000, cwd, env, onOutput } = {}) {
  const job = queue.then(() => new Promise((resolve) => {
    if (!bin) return resolve({ code: -1, out: notFound() });
    // A .js tool (VEXCOM=/path/to/fake.js) runs under this Node, since Windows cannot start a script from its shebang line.
    const [exe, argv] = /\.[cm]?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
    const p = spawn(exe, argv, { cwd: cwd || path.dirname(bin), env: env || process.env, windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { out += '\n[timed out]'; p.kill(); }, timeoutMs);
    p.stdout.on('data', (d) => {out += d;onOutput?.(d,'stdout');});
    p.stderr.on('data', (d) => {out += d;onOutput?.(d,'stderr');});
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: String(e) }); });
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, signal, out: out.replace(/\r/g, '\n') });
    });
  }));
  queue = job.catch(() => {});
  return job;
}
// Exit meanings from VEX's extension. Some failures print only the version banner.
const VEX_ERRORS = {
  1: 'operation failed; no specific cause reported',
  2: 'brain communication failed; disconnect the brain in VEXcode IQ or quit VEXcode, then reconnect USB',
  3: 'version error; vexcom did not identify which component is incompatible',
  4: 'command error',
  5: 'device not found; connect the powered-on brain directly by USB',
  6: 'serial port error; close other VEX apps and check the USB connection',
  7: 'invalid command parameter',
  8: 'VEXos error',
};
const vexcom = async (args, timeoutMs = 30000, onProgress) => {
  const parser=require('./transfer-progress').progressParser;
  const streams=onProgress?{stdout:parser(onProgress),stderr:parser(onProgress)}:null;
  const r = await run(findVexcom(), args, { timeoutMs,onOutput:streams?(data,stream)=>streams[stream].write(data):undefined });
  if(streams){streams.stdout.end();streams.stderr.end();}
  if (r.code !== 0) {
    const detail = r.signal ? `terminated by ${r.signal}` : `exited with code ${r.code} (${VEX_ERRORS[r.code] || 'tool could not complete the command'})`;
    r.out = `${r.out.trim()}\n\nvexcom ${detail}.`.trim();
  }
  return r;
};
const brainConsole = require('./serial-console').createConsole({ SerialPort: require('serialport').SerialPort, query: () => vexcom(['--json'],20000) });

async function portDiagnostics(){
  // Windows and Linux cannot cheaply name which app holds a port, but can say whether the brain's ports exist at all.
  // VEX devices use USB vendor ID 2888.
  if(process.platform!=='darwin'){
    let ports=[];
    try{ports=(await require('serialport').SerialPort.list()).filter(p=>String(p.vendorId||'').toLowerCase()==='2888').map(p=>p.path);}catch{return '';}
    if(!ports.length)return '\nNo VEX USB ports are present. Reconnect the powered-on brain using a USB data cable.';
    return '\nVEX USB ports present: '+ports.join(', ')+'. If VEXcode IQ or VS Code\'s VEX extension is connected to the brain, disconnect it there (or quit it), then retry. The transfer was not retried automatically.';
  }
  const ports=fs.readdirSync('/dev').filter(name=>/^(?:tty|cu)\.usbmodem[\w.-]+$/.test(name)).slice(0,64).map(name=>'/dev/'+name);
  if(!ports.length)return '\nNo USB modem ports are present. Reconnect the powered-on brain using a USB data cable.';
  const result=await run('/usr/sbin/lsof',['-nP',...ports],{timeoutMs:5000});
  const owners=[...new Set(result.out.split('\n').slice(1).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length>2&&Number(parts[1])!==process.pid).map(parts=>parts[0]))];
  return owners.length?'\nUSB ports are also open in: '+owners.join(', ')+'. Disconnect the brain in those apps, then retry the download.': '\nCheck the USB cable and brain screen, then reconnect USB before retrying. The transfer was not retried automatically.';
}

async function versionDiagnostics(lang){
  const status=await vexcom(['--json','--verbose'],20000);
  let info;
  try{info=JSON.parse(status.out.slice(status.out.indexOf('{')));}catch{return '\nCould not read versions after the failure. Disconnect the brain in other VEX apps, reconnect USB, and check again.';}
  const version=hex=>{const n=parseInt(hex,16);return Number.isFinite(n)?[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.'): 'unknown';};
  let message='\nBrain VEXos: '+version(info.iq2?.brain?.vexos)+'.';
  if(lang==='cpp'){
    try{
      const sdk=findCpp(),manifest=JSON.parse(fs.readFileSync(path.join(sdk.sdk,'manifest.json'),'utf8'));
      const target=manifest.platforms.find(p=>p.name==='vexiq2')?.vexos;
      if(target)message+=' C++ SDK target VEXos: '+target+'.';
    }catch{/* SDK details are optional diagnostics */}
  }else message+=' Python VM is '+(info.iq2?.vms?.items?.some(item=>item.binfile==='python_vm.bin')?'installed':'not reported as installed')+'.';
  return message+'\nA version error alone does not establish that brain firmware is outdated. Use the VEX extension to check the matching tools/runtime before updating firmware.';
}

// ---- the C++ toolchain: VEX's SDK, clang and make, downloaded by the VEX VS Code extension ----
// Toolchain folder names, per OS and CPU, as VEX's extension names them. ARM machines fall back to the x64 build, which
// macOS (Rosetta) and Windows on ARM can run.
const TOOLCHAINS = {
  darwin: process.arch === 'arm64' ? ['toolchain_osxarm64', 'toolchain_osx64'] : ['toolchain_osx64'],
  win32: process.arch === 'arm64' ? ['toolchain_winarm64', 'toolchain_win32'] : ['toolchain_win32'],
  linux: process.arch === 'arm64' ? ['toolchain_linuxarm64'] : ['toolchain_linux64'],
}[process.platform] || [];
const DOT_EXE = process.platform === 'win32' ? '.exe' : '';
function findCpp() {
  const isTool = (file) => { try { fs.accessSync(file + DOT_EXE, fs.constants.X_OK); return true; } catch { return false; } };
  const toolRoots = [...STORAGES.map((s) => path.join(s, 'tools', 'cpp')), path.join(os.homedir(), '.iq-raw', 'toolchains')];
  const tools = TOOLCHAINS.flatMap((name) => toolRoots.map((root) => path.join(root, name)))
    .find((root) => ['clang/bin/clang', 'gcc/bin/arm-none-eabi-ld', 'gcc/bin/arm-none-eabi-objcopy', 'gcc/bin/arm-none-eabi-ar', 'gcc/bin/arm-none-eabi-size', 'tools/bin/make']
      .every((file) => isTool(path.join(root, file))));
  const sdk = findSdk();
  if (!sdk || !tools) return null;
  const zip = findTemplate();
  if (!zip) return null;
  // Same search order as VEX's extension: the SDK, then gcc, clang, make's own folder, then the user's PATH.
  const pathDirs = [sdk, ...['gcc/bin', 'clang/bin', 'tools/bin'].map((d) => path.join(tools, d))];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH')); // Windows spells it Path
  env.PATH = [...pathDirs, process.env.PATH || process.env.Path || ''].join(path.delimiter);
  return { sdk, zip, env, make: path.join(tools, 'tools', 'bin', 'make' + DOT_EXE) };
}

// Compile main.cpp into a .bin using the stock IQ2 project template and its makefile. Returns { ok, out, dir, bin }; the caller removes dir.
async function buildCpp(code) {
  const cpp = findCpp();
  if (!cpp) return { ok: false, out: `The VEX IQ2 C++ tools were not found or their installation is incomplete. In VS Code, create an IQ (2nd gen) C++ project, then run VEX’s "Download Toolchain" command from the Command Palette (${PALETTE_KEYS}) and wait for it to finish. A ZIP file alone is not an installed compiler. Looked for ${TOOLCHAINS.join(' or ') || 'a toolchain for this OS'} in ${STORAGES[0]} and ~/.iq-raw/toolchains.` };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-raw-cpp-'));
  try { extractZip(cpp.zip, dir); } catch (e) { return { ok: false, out: `Could not unpack VEX's project template: ${e.message}`, dir }; }
  fs.writeFileSync(path.join(dir, 'src', 'main.cpp'), code);
  const r = await run(cpp.make, [`T=${cpp.sdk}`, 'P=iqraw', 'PRINTF_FLOAT=1'], { cwd: dir, env: cpp.env, timeoutMs: 120000 });
  const bin = path.join(dir, 'build', 'iqraw.bin');
  return { ok: r.code === 0 && fs.existsSync(bin), out: r.out, dir, bin };
}

const cleanSlot = (s) => (Number.isInteger(s) && s >= 1 && s <= 8 ? s : null);
const cleanName = (n) => (typeof n === 'string' && /^[\w .-]{1,32}$/.test(n.trim()) ? n.trim() : 'iq-raw');

async function prepareConsole(){
  try{await brainConsole.connect();return '';}
  catch(error){return '\nConsole connection failed: '+error.message+'\nProgram output may be missed until the console is connected.';}
}

async function download({ code, slot, name, run: runAfter, lang = 'python', timeoutMs = 120000, onProgress=()=>{} }) {
  let dir = null;
  try {
    let file;
    onProgress({phase:lang==='cpp'?'build':'prepare',percent:null});
    if (lang === 'cpp') {
      const b = await buildCpp(code);
      dir = b.dir || null;
      if (!b.ok) return { code: 1, out: b.out };
      file = b.bin;
    } else {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-raw-'));
      file = path.join(dir, 'main.py');
      fs.writeFileSync(file, code);
    }
    // Match VEX's extension, including structured error output. Be verbose on
    // the first attempt rather than repeating a possibly partially completed transfer.
    const base = ['--slot', String(slot), '--write', file, '--json', '--progress', '--verbose'];
    let warning='';
    if (runAfter){
      onProgress({phase:'console',percent:null});
      warning=await prepareConsole();
      base.push('--run');
    }
    // IQ2 USB has separate admin and user ports. Keep the terminal listening before
    // startup, and explicitly direct VEXcom commands to the discovered admin port.
    const admin=brainConsole.adminPort();if(admin)base.push(admin);
    onProgress({phase:'download',percent:null});
    const r = await (async()=>{
      let result=await vexcom(['--name', name, ...base], timeoutMs,onProgress);
      // Retry only an explicitly unsupported option, never an interrupted transfer.
      const transferStarted=/"(?:phase|action)"\s*:\s*"(?:program|download)"/.test(result.out);
      if(result.code!==0&&!transferStarted&&/unknown|unrecognized|invalid option|usage/i.test(result.out))result=await vexcom(base,timeoutMs,onProgress);
      if(result.code===3)result.out+='\n'+await versionDiagnostics(lang);
      if(result.code!==0&&[2,3,4,5,6].includes(result.code))result.out+='\n'+await portDiagnostics();
      return result;
    })();
    r.out+=warning;
    r.warning=warning;
    if (r.code === 1 && lang !== 'cpp') r.out += '\n\nFor Python, also check that the Python VM has been installed on this brain using "Install Python VM".';
    return r;
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A tiny program that asks the brain's own Python what it offers, and prints it back through vexcom's stdio relay.
const PROBE = `from vex import *
brain = Brain()
print("PROBE brain:", dir(brain))
print("PROBE three_wire_port:", hasattr(brain, "three_wire_port"))
print("PROBE names:", [n for n in dir() if n[:1].isupper()])
brain.screen.print("probe done")
`;

// ---- HTTP ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mjs': 'text/javascript; charset=utf-8', '.wasm':'application/wasm', '.json':'application/json', '.py':'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

// Cross-origin isolation lets the Python preview worker sleep and read the brain buttons through shared memory.
// Everything the page loads is same-origin, so nothing breaks.
const ISOLATION = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };

function sendFile(res, file, cache = 'no-store') {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': cache, ...ISOLATION });
    res.end(data);
  });
}

async function streamOperation(res,action){
  res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.flushHeaders();
  const emit=event=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(event)+'\n');};
  try{emit({type:'result',...await action(progress=>emit({type:'progress',...progress}))});}
  catch(error){emit({type:'result',ok:false,out:String(error.message||error)});}
  res.end();
}

function inside(base, p) {
  const full = path.resolve(base, '.' + path.sep + p);
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > MAX_CODE + 5000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const host = String(req.headers.host || '');
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return void res.writeHead(403).end('Forbidden');
  const url = new URL(req.url, `http://${host}`);
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };

  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(415, { error: 'JSON only' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(403, { error: 'Bad origin' });
    }
    try {
      if (url.pathname === '/api/console/events' && req.method === 'GET') {
        if(req.headers.origin && req.headers.origin!==`http://${host}`) return void res.writeHead(403).end('Bad origin');
        return brainConsole.subscribe(req,res);
      }
      if (url.pathname === '/api/info' && req.method === 'GET') {
        const r = await vexcom(['--json'], 20000);
        let info = null;
        try { info = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* not JSON, e.g. no brain */ }
        return json(200, { ok: r.code === 0 && !!info, info, out: r.out });
      }
      if (url.pathname === '/api/programs' && req.method === 'GET') {
        const r = await vexcom(['--programs'], 20000);
        return json(200, { ok: r.code === 0, out: r.out });
      }
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const body = await readJson(req);
      if(url.pathname==='/api/preview/compile')return json(200,await require('./preview/compiler').compile(body.code));
      if(url.pathname==='/api/console/connect') return json(200,{ok:true,...await brainConsole.connect()});
      if(url.pathname==='/api/console/disconnect') return json(200,{ok:true,...await brainConsole.disconnect()});
      if(url.pathname==='/api/console/input'){await brainConsole.input(body.text);return json(200,{ok:true});}
      if(url.pathname==='/api/console/clear'){brainConsole.clear();return json(200,{ok:true});}
      if (url.pathname === '/api/download') {
        const slot = cleanSlot(body.slot);
        if (!slot) return json(400, { error: 'Slot must be 1 to 8.' });
        if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > MAX_CODE) return json(400, { error: 'No code to send (or too long).' });
        const options={ code: body.code.replace(/\r\n/g, '\n'), slot, name: cleanName(body.name), run: body.run === true, lang: body.lang === 'cpp' ? 'cpp' : 'python' };
        if(body.stream===true){
          return streamOperation(res,async onProgress=>{const r=await download({...options,onProgress});return {ok:r.code===0,out:r.out,warning:r.warning};});
        }
        const r = await download(options);
        return json(200, { ok: r.code === 0, out: r.out, warning:r.warning });
      }
      if(url.pathname==='/api/bluetooth/build'){
        if(typeof body.code!=='string'||!body.code.trim()||body.code.length>MAX_CODE)return json(400,{error:'No code to build (or too long).'});
        const built=await buildCpp(body.code.replace(/\r\n/g,'\n'));
        try{return json(200,{ok:built.ok,out:built.out,binary:built.ok?fs.readFileSync(built.bin).toString('base64'):undefined});}
        finally{if(built.dir)fs.rmSync(built.dir,{recursive:true,force:true});}
      }
      if (url.pathname === '/api/build') {
        if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > MAX_CODE) return json(400, { error: 'No code to build (or too long).' });
        const build=async()=>{
          const b=await buildCpp(body.code.replace(/\r\n/g,'\n'));
          if(b.dir)fs.rmSync(b.dir,{recursive:true,force:true});
          return {ok:b.ok,out:b.ok?(b.out.trim()+'\nBuild OK.'):b.out};
        };
        if(body.stream===true)return streamOperation(res,onProgress=>{onProgress({phase:'build',percent:null});return build();});
        return json(200,await build());
      }
      if (url.pathname === '/api/probe') {
        const slot = cleanSlot(body.slot) || 8;
        const r = await download({ code: PROBE, slot, name: 'probe', run: true, timeoutMs: 25000 });
        return json(200, { ok: /PROBE /.test(r.out), out: r.out });
      }
      if (url.pathname === '/api/python-vm') {
        const r = await brainConsole.withSuspended(()=>vexcom(['--python', '--timer', '--progress'], 180000));
        return json(200, { ok: r.code === 0, out: r.out });
      }
      if (url.pathname === '/api/run' || url.pathname === '/api/stop' || url.pathname === '/api/erase') {
        const slot = cleanSlot(body.slot);
        if (url.pathname !== '/api/stop' && !slot) return json(400, { error: 'Slot must be 1 to 8.' });
        const warning=url.pathname==='/api/run'?await prepareConsole():'';
        const args = url.pathname === '/api/stop' ? ['--stop'] : url.pathname === '/api/run' ? ['--slot', String(slot), '--run'] : ['--erase', String(slot)];
        const admin=brainConsole.adminPort();if(admin)args.push(admin);
        const r = await vexcom(args, 30000);r.out+=warning;
        return json(200, { ok: r.code === 0, out: r.out, warning });
      }
      return json(404, { error: 'No such call.' });
    } catch (e) {
      return json(400, { error: String(e.message || e) });
    }
  }

  // The help page renders the same guide that GitHub shows; only this one file outside public/ is served.
  if (url.pathname === '/docs/TROUBLESHOOTING.md') return sendFile(res, path.join(ROOT, 'TROUBLESHOOTING.md'));
  if(url.pathname==='/simulator-python-worker.js')res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src http://${host}/vendor/pyodide/ http://${host}/simulator-vex.py; worker-src 'none'; child-src 'none';`);
  if(url.pathname==='/compiler-worker.mjs')res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src http://${host}/vendor/compiler/ http://${host}/compiler/; worker-src 'none'; child-src 'none';`);
  if(url.pathname==='/simulator-code-worker.mjs'){
    // User code has no network path to the app's USB-control API, even via Python's js module.
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src http://${host}/vendor/preview/python/ http://${host}/simulator-vex.py http://${host}/simulator-vex-async.py; worker-src 'none'; child-src 'none';`);
  }
  for(const [prefix,folder]of [['/vendor/compiler/','microbit-clang-wasm/gen'],['/vendor/dagre/','@dagrejs/dagre/dist'],['/vendor/preview/asyncify/','asyncify-wasm/dist'],['/vendor/preview/wasi/','@bjorn3/browser_wasi_shim/dist'],['/vendor/preview/python/','pyodide']]){
    if(url.pathname.startsWith(prefix)){
      const f=inside(path.join(ROOT,'node_modules',folder),url.pathname.slice(prefix.length));
      return f?sendFile(res,f):void res.writeHead(404).end('Not found');
    }
  }
  if (url.pathname.startsWith('/vendor/blockly/')) {
    const f = inside(path.join(ROOT, 'node_modules', 'blockly'), url.pathname.slice('/vendor/blockly/'.length));
    return f ? sendFile(res, f) : void res.writeHead(404).end('Not found');
  }
  if (url.pathname.startsWith('/vendor/pyodide/')) {
    const f = inside(path.join(ROOT, 'node_modules', 'pyodide'), url.pathname.slice('/vendor/pyodide/'.length));
    return f ? sendFile(res, f, 'public, max-age=3600') : void res.writeHead(404).end('Not found');
  }
  const f = inside(path.join(ROOT, 'public'), url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  return f ? sendFile(res, f) : void res.writeHead(404).end('Not found');
});

if (require.main === module) {
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`iq-raw: port ${PORT} is already in use, probably by another iq-raw window. Open http://localhost:${PORT}, or stop the other one first (or run with PORT=5175).`);
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => console.log(`iq-raw: open http://localhost:${PORT}  (vexcom: ${findVexcom() || 'NOT FOUND'})`));
}
module.exports = { server, vexcom, findVexcom };
server.on('close',()=>brainConsole.close().catch(()=>{}));
