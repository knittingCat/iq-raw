import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {createConsole}=require('../serial-console');
const {JSDOM}=require('jsdom');
class FakePort extends EventEmitter {
  static instances=[];
  constructor(options){super();this.options=options;this.isOpen=false;this.written=[];FakePort.instances.push(this);}
  open(callback){this.isOpen=true;queueMicrotask(()=>callback());}
  close(callback){this.isOpen=false;this.emit('close');callback();}
  write(text,callback){this.written.push(text);callback();}
  drain(callback){callback();}
}
let queries=0;
const service=createConsole({SerialPort:FakePort,query:async()=>{queries++;return{code:0,out:JSON.stringify({device:{connection:'brain',admin:'/dev/tty.usbmodemADMIN',user:'/dev/tty.usbmodemTEST'}})};}});
const response=new EventEmitter();response.frames=[];response.writeHead=()=>{};response.write=text=>(response.frames.push(text),true);response.end=()=>response.emit('close');
service.subscribe({},response);
await Promise.all([service.connect(),service.connect()]);assert.equal(queries,1);
const port=FakePort.instances[0];assert.equal(port.options.path,'/dev/cu.usbmodemTEST');
assert.equal(service.state().connected,true);
assert.equal(service.adminPort(),'/dev/tty.usbmodemADMIN','Commands must target the separate discovered admin port');
const bytes=Buffer.from('π\n');port.emit('data',bytes.subarray(0,1));port.emit('data',bytes.subarray(1));
assert.ok(response.frames.some(frame=>frame.includes('π')));
await service.input('hello\n');assert.deepEqual(port.written,['hello\n']);
await assert.rejects(service.input('x'.repeat(4097)),/4096/);
await assert.rejects(service.withSuspended(async()=>{
  assert.equal(service.state().connected,false);
  await assert.rejects(service.connect(),/paused/);
  throw Error('mock transfer failed');
}),/mock transfer failed/);
assert.equal(service.state().connected,true,'Console should reconnect after a failed transfer');
assert.equal(queries,2);
service.clear();assert.ok(response.frames.some(frame=>frame.includes('event: clear')));
await service.disconnect();assert.equal(service.state().connected,false);
assert.equal(service.adminPort(),null);
await assert.rejects(service.input('hello'),/Connect/);
await service.close();
const bad=createConsole({SerialPort:FakePort,query:async()=>({code:0,out:'{"device":{"connection":"brain","user":"/etc/passwd"}}'})});
await assert.rejects(bad.connect(),/No IQ brain console port/);
for(const [user,admin] of [['COM7','COM6'],['/dev/ttyACM1','/dev/ttyACM0']]){
  const other=createConsole({SerialPort:FakePort,query:async()=>({code:0,out:JSON.stringify({device:{connection:'brain',user,admin}})})});
  await other.connect();assert.equal(FakePort.instances.at(-1).options.path,user,user+' should open as-is');
  assert.equal(other.adminPort(),admin,admin+' should be the admin port');await other.close();
}
const oddAdmin=createConsole({SerialPort:FakePort,query:async()=>({code:0,out:JSON.stringify({device:{connection:'brain',user:'COM7',admin:'--erase'}})})});
await oddAdmin.connect();assert.equal(oddAdmin.adminPort(),null,'an admin value that is not a port name must not reach vexcom');await oddAdmin.close();
for(const user of ['COM7 ','\\\\.\\COM7','/dev/ttyACM1/../sda','/dev/ttyUSB0']){
  const other=createConsole({SerialPort:FakePort,query:async()=>({code:0,out:JSON.stringify({device:{connection:'brain',user}})})});
  await assert.rejects(other.connect(),/No IQ brain console port/,user+' must be refused');
}
const dom=new JSDOM('<dl id="monitors" hidden></dl><pre id="log"></pre>',{runScripts:'outside-only'});
dom.window.eval(fs.readFileSync('public/console-renderer.js','utf8'));
const root=dom.window.document.getElementById('log'),monitors=dom.window.document.getElementById('monitors'),terminal=dom.window.IQConsole.create(root,monitors);
terminal.append('<script>alert(1)</script>');assert.equal(root.querySelector('script'),null);
terminal.append('\x1b[3');terminal.append('1mred');assert.ok(root.lastChild.style.color);
terminal.append('\x1b[2Jclean');assert.equal(root.textContent,'clean');
terminal.append('\x1b[38;2;255;128;0mRGB');assert.equal(root.lastChild.style.color,'rgb(255, 128, 0)');
terminal.append('x'.repeat(220000));assert.ok(root.textContent.length<=200000);
terminal.clear();terminal.append('ordinary output\n\x1eIQRAW_MON');terminal.append('ITOR\ttimer\t42\n');
assert.equal(root.textContent,'ordinary output\n');assert.equal(monitors.hidden,false);
assert.equal(monitors.querySelector('dd').textContent,'42');
terminal.append('\x1eIQRAW_MONITOR\ttimer\t<script>bad</script>\n');assert.equal(monitors.querySelectorAll('div').length,1);assert.equal(monitors.querySelector('script'),null);
terminal.append('\x1eIQRAW_HIDE\ttimer\n');assert.equal(monitors.hidden,true);
dom.window.close();
console.log('ok - serial console discovery, concurrency, UTF-8, input limits, disconnect, ANSI and text-only rendering');
