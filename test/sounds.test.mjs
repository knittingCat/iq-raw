import assert from'node:assert/strict';import{createRequire}from'node:module';import fs from'node:fs';
const require=createRequire(import.meta.url),sounds=require('../public/iq-sounds'),{Runtime}=require('../public/simulator-core'),{Audio}=require('../public/simulator-audio');
assert.equal(Object.keys(sounds.recipes).length,12);
const signatures=new Set();
for(const [name,sound]of Object.entries(sounds.recipes)){
 signatures.add(JSON.stringify(sound.notes));assert.ok(sounds.duration(name)>0&&sounds.duration(name)<2000);
 for(const[o,n,ms,gap]of sound.notes){assert.ok([3,4].includes(o));assert.ok(n>=0&&n<=6);assert.ok(ms>0&&gap>=0);}
 const timeline=sounds.timeline(name);assert.equal(timeline.length,sound.notes.length);assert.ok(timeline.every(([at,seconds,from,to])=>at>=0&&seconds>0&&from===to&&Number.isFinite(from)));
 const events=[],rt=new Runtime(e=>events.push(e));let slept=0;rt.sleep=async ms=>{slept+=ms;};
 await rt.run({blocks:{blocks:[{id:'sound',type:'iq_s_sound',fields:{S:'IQRawSound.'+name}}]}});
 assert.ok(events.some(e=>e.type==='sound'&&e.name===name));assert.equal(slept,sounds.duration(name));
}
assert.equal(signatures.size,12,'Original effects should be distinct');
// Render scheduling is checked without opening an audio device or making sound.
const audio=new Audio(),played=[];audio.ctx={currentTime:0};audio.tone=(...args)=>played.push(args);audio.play({kind:'sound',name:'LASER_ZAP'});assert.equal(played.length,sounds.recipes.LASER_ZAP.notes.length);assert.equal(played[0][2],sounds.timeline('LASER_ZAP')[0][2]);
audio.muted=true;audio.play({kind:'sound',name:'ROBOT_HELLO'});assert.equal(played.length,sounds.recipes.LASER_ZAP.notes.length);
let stopped=0;audio.nodes.add({stop(){stopped++;}});audio.reset();assert.equal(stopped,1);assert.equal(audio.nodes.size,0);
// Generate a program containing every new sound; the catalog suite also builds all dropdown cases.
const B=require('blockly');globalThis.Blockly=B;B.Python=require('blockly/python').pythonGenerator;for(const file of ['iq-blocks','iq-cpp','iq-catalog'])require('../public/'+file);
const ws=new B.Workspace();let tail=ws.newBlock('iq_when_started');for(const name of Object.keys(sounds.recipes)){const b=ws.newBlock('iq_s_sound');b.setFieldValue('IQRawSound.'+name,'S');tail.nextConnection.connect(b.previousConnection);tail=b;}
const cpp=B.Cpp.workspaceToCode(ws),py=B.Python.workspaceToCode(ws);assert.equal((cpp.match(/void iqraw_sound_\w+\(vex::brain &brain\) \{/g)||[]).length,12);assert.equal((py.match(/def iqraw_sound_/g)||[]).length,12);assert.ok(!cpp.includes('IQRawSound.')&&!py.includes('IQRawSound.'),'Hardware code must use supported notes, not pretend SDK sound IDs');
fs.writeFileSync('/private/tmp/iqraw-original-sounds.cpp',cpp);ws.dispose();
console.log('ok - 12 distinct original sounds, hardware-safe notes, preview timing, audio scheduling/mute/stop, and Python/C++ generation');
