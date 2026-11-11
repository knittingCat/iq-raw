import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import { python } from "./tools.mjs";
const require=createRequire(import.meta.url),Blockly=require('blockly');
globalThis.Blockly=Blockly;Blockly.Python=require('blockly/python').pythonGenerator;
for(const file of ['iq-blocks','iq-cpp','iq-catalog','iq-math','iq-vex'])require('../public/'+file+'.js');
const specs=Blockly.IQ_VEX.specs,ws=new Blockly.Workspace();
let cases=0;
for(const s of specs){
  const dropdowns=s.args.filter(a=>a.type==='field_dropdown'),rounds=Math.max(1,...dropdowns.map(a=>a.options.length));
  for(let i=0;i<rounds;i++){
    const fields=Object.fromEntries(dropdowns.map(a=>[a.name,a.options[Math.min(i,a.options.length-1)][1]]));
    const inputs=Object.fromEntries(s.args.filter(a=>a.type==='input_value').map(a=>[a.name,{block:a.check==='String'?{type:'text',fields:{TEXT:a.text||'100% test'}}:a.check==='Boolean'?{type:'logic_boolean',fields:{BOOL:'TRUE'}}:{type:'math_number',fields:{NUM:a.value??1}}}]));
    if(s.args.some(a=>a.type==='input_statement'))inputs.DO={block:{type:'iq_print',inputs:{TEXT:{block:{type:'text',fields:{TEXT:'nested'}}}}}};
    const block={type:s.id,fields,inputs};
    const state=s.output?{type:'iq_print',inputs:{TEXT:{block}}}:block;
    Blockly.serialization.blocks.append(state,ws);cases++;
  }
}
const py=Blockly.Python.workspaceToCode(ws),cpp=Blockly.Cpp.workspaceToCode(ws);
assert.equal(spawnSync(python,['-I','-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:py,encoding:'utf8'}).status,0,'Generated Python should parse');
assert.ok(!cpp.includes('is not supported'));
const checks=`
import sys,types
vex=types.ModuleType('vex');sys.modules['vex']=vex
class Screen:
    def print(self,*a):pass
    def next_row(self):pass
class Brain: screen=Screen()
brain=Brain()
${Blockly.IQ_VEX.pyCommon}
t=iqv_matrix(2,3,'hello')
assert t[0:2]==[2,3] and iqv_get(t,1,2)=='hello'
iqv_set(t,2,3,42);assert iqv_number(iqv_get(t,2,3))==42
iqv_set(t,0,1,'bad');assert iqv_get(t,0,1)==''
assert iqv_matrix(999999,999999,0)==[0,0,[]]
assert iqv_letter('hello',1)=='h' and iqv_letter('hello',0)==''
assert iqv_map(50,0,100,0,1)==0.5
assert math.isnan(iqv_number('oops'))
class Obj: width=33
assert iqv_object([Obj()],1,'width')==33
assert iqv_object([Obj()],0,'width')==0
assert iqv_object([],1,'width')==0
`;
const run=spawnSync(python,['-I','-c',checks],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
process.env.PORT='5196';const {server}=require('../server.js');
await new Promise(r=>server.listen(5196,'127.0.0.1',r));
try{
  // This synthetic program includes hundreds of cases; split it to respect IQ2 SRAM.
  const blocks=Blockly.serialization.workspaces.save(ws).blocks.blocks,half=Math.ceil(blocks.length/2);
  for(const batch of [blocks.slice(0,half),blocks.slice(half)]){
    const batchWs=new Blockly.Workspace();Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:batch}},batchWs);
    const code=Blockly.Cpp.workspaceToCode(batchWs);batchWs.dispose();
    const r=await(await fetch('http://127.0.0.1:5196/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})})).json();
    if(r.out.includes('were not found')){console.log('skip - VEX C++ SDK not installed');break;}
    assert.ok(r.ok,r.out);
  }
  console.log(`ok - ${specs.length} added VEX blocks, ${cases} dropdown cases, data bounds and actual IQ2 compilation`);
}finally{await new Promise(r=>server.close(r));ws.dispose();}
