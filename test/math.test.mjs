import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { python } from "./tools.mjs";
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const Blockly=require('blockly');
const {pythonGenerator}=require('blockly/python');
globalThis.Blockly=Blockly;Blockly.Python=pythonGenerator;
for(const file of ['iq-blocks','iq-cpp','iq-catalog','iq-math']) require('../public/'+file+'.js');
const {specs,pyRuntime,cppRuntime,realOps}=Blockly.IQ_MATH;
const n=v=>({block:{type:'math_number',fields:{NUM:v}}});
const x=()=>({block:{type:'iqm_x'}});
const square=()=>({block:{type:'iqm_power',inputs:{A:x(),B:n(2)}}});
const complex=()=>({block:{type:'iqm_complex',inputs:{RE:n(2),IM:n(1)}}});
const statements=[];
for(const s of specs) {
  const dropdowns=s.args.filter(a=>a.type==='field_dropdown');
  const rounds=Math.max(1,...dropdowns.map(a=>a.options.length));
  for(let k=0;k<rounds;k++) {
    const fields=Object.fromEntries(dropdowns.map(a=>[a.name,a.options[Math.min(k,a.options.length-1)][1]]));
    const inputs=Object.fromEntries(s.args.filter(a=>a.type==='input_value').map(a=>[a.name,a.name==='F'?square():a.check==='IQComplex'?complex():a.check==='String'?{block:{type:'text',fields:{TEXT:'100% "quoted"'}}}:n(a.value??0)]));
    const block={type:s.id,fields,inputs};
    statements.push(s.output?{type:s.output==='IQComplex'?'iqm_print_complex':'iq_print',inputs:{[s.output==='IQComplex'?'Z':'TEXT']:{block}}}:block);
  }
}
const chain=list=>list.reduceRight((next,b)=>next?{...b,next:{block:next}}:b,null);
const ws=new Blockly.Workspace();
Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[chain([{type:'iq_when_started'},...statements])]}},ws);
const py=pythonGenerator.workspaceToCode(ws),cpp=Blockly.Cpp.workspaceToCode(ws);
const parsed=spawnSync(python,['-I','-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:py,encoding:'utf8'});
assert.equal(parsed.status,0,parsed.stderr);
assert.ok(py.includes('lambda iqm_x:'));
assert.ok(cpp.includes('[&](double iqm_x)'));
const simulated=spawnSync(python,['-I','-c',`
import sys,types
vex=types.ModuleType('vex')
class Screen:
    def __getattr__(self,name): return lambda *args,**kwargs: None
class Brain:
    def __init__(self): self.screen=Screen()
vex.Brain=Brain;vex.Color=lambda *args:args
sys.modules['vex']=vex
exec(sys.stdin.read())
def callback(): iqmz_z[0]=3+4j
callback()
assert iqmz_z[0]==3+4j
`],{input:py,encoding:'utf8'});
assert.equal(simulated.status,0,'Generated Python must execute with a simulated screen:\n'+simulated.stderr);

// Execute the numerical helpers on known answers and record drawing calls.
const pyChecks=`
import math, cmath, json
class Screen:
    def __init__(self): self.lines=[]; self.pixels=[]
    def set_origin(self,*args): pass
    def set_clip_region(self,*args): pass
    def draw_line(self,*args): self.lines.append(args)
    def draw_pixel(self,*args): self.pixels.append(args)
    def render(self): pass
class Brain: pass
brain=Brain(); brain.screen=Screen()
${Object.values(pyRuntime).join('\n')}
def close(a,b,tol=1e-6): assert abs(a-b)<tol, (a,b)
close(iqm_root(-8,3),-2);close(iqm_root(16,-2),0.25)
assert all(math.isnan(iqm_real(op,arg)) for op,arg in [(0,-1),(2,0),(8,0),(26,1)])
assert math.isnan(iqm_root(1,0));assert math.isnan(iqm_root(-4,2))
close(iqm_round(2.5,0,0),3);close(iqm_round(-2.5,0,0),-3)
close(iqm_round(3.14159,2,0),3.14);close(iqm_round(-1.2,0,1),-2)
close(iqm_integral(lambda x:x*x,0,1,128),1/3)
close(iqm_integral(lambda x:x*x,1,0,127),-1/3)
close(iqm_derivative(lambda x:x*x,3,0.01,1),6)
close(iqm_derivative(lambda x:x*x,3,0.01,2),2)
close(iqm_series(lambda x:x,1,100,0),5050)
close(iqm_series(lambda x:x,1,5,1),120)
close(iqm_series(lambda x:x,2,1,0),0);close(iqm_series(lambda x:x,2,1,1),1)
assert math.isnan(iqm_integral(lambda x:x,0,float('inf'),128))
assert math.isnan(iqm_series(lambda x:x,1,5000,0))
assert math.isnan(iqm_derivative(lambda x:x,0,0,1))
assert math.isnan(iqm_eval(lambda x:1/x,0))
close(iqm_complex_fn(0,-1+0j).imag,1)
close(iqm_complex_fn(1,1j*math.pi).real,-1)
close(iqm_complex_op(2,2+3j,2-3j).real,13)
close(iqm_complex_op(3,3+4j,1j).real,4)
iqm_axes(-1,1,-1,1);assert len(brain.screen.lines)==2
iqm_graph(lambda x:x,-1,1,-1,1)
assert all(0<=x<=159 and 0<=y<=107 for line in brain.screen.lines for x,y in zip(line[::2],line[1::2]))
brain.screen.lines=[];brain.screen.pixels=[]
iqm_graph(lambda x:1/x,-1,1,-1,1)
assert not brain.screen.lines, 'Do not join the two sides of an asymptote'
brain.screen.pixels=[]
iqm_graph(lambda x:float('nan'),-1,1,-1,1)
assert not brain.screen.pixels
iqm_graph(lambda x:x,-1e308,1e308,-1,1)
assert not brain.screen.pixels
brain.screen.lines=[]
iqm_arc(80,54,30,20,0,360);assert len(brain.screen.lines)==72
brain.screen.lines=[]
iqm_triangle(0,0,10,0,5,10);assert len(brain.screen.lines)==3
assert iqm_channel(300)==255 and iqm_channel(-2)==0
values=[]
for op in range(29):
    arg=2.0 if op in [2,3,12,15,16,24,26] else 0.5
    if op==12: arg=0.5
    if op==16: arg=2.0
    values.append(iqm_real(op,arg))
print(json.dumps(values))
`;
const result=spawnSync(python,['-I','-c',pyChecks],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
const pyValues=JSON.parse(result.stdout.trim());

// Run the same helpers as native C++ and compare both backends numerically.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iqraw-math-'));
try {
  const source=`#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <cassert>
// VEX's headers and libc++ also declare these globally; libstdc++ (GCC, MinGW) only has them in std.
using std::isfinite; using std::isnan; using std::isinf;
struct ScreenStub { template<typename... T> void print(const char*,T...){} void setOrigin(int,int){} void setClipRegion(int,int,int,int){} void drawLine(int,int,int,int){} void drawPixel(int,int){} void render(){} };
struct BrainStub { ScreenStub Screen; } Brain;
${Object.values(cppRuntime).join('\n')}
int main(){
assert(fabs(iqm_root(-8,3)+2)<1e-9);assert(isnan(iqm_root(-4,2)));
assert(isnan(iqm_real(0,-1)));assert(isnan(iqm_real(2,0)));assert(isnan(iqm_real(8,0)));assert(isnan(iqm_real(26,1)));
assert(iqm_round(-2.5,0,0)==-3);
assert(fabs(iqm_integral([](double x){return x*x;},0,1,128)-1.0/3)<1e-9);
assert(fabs(iqm_derivative([](double x){return x*x;},3,0.01,1)-6)<1e-7);
assert(fabs(iqm_derivative([](double x){return x*x;},3,0.01,2)-2)<1e-6);
assert(iqm_series([](double x){return x;},1,100,false)==5050);
assert(iqm_series([](double x){return x;},1,5,true)==120);
assert(isnan(iqm_series([](double x){return x;},1,5000,true)));
assert(fabs(iqm_complex_fn(0,IQComplex(-1,0)).imag()-1)<1e-9);
assert(fabs(iqm_complex_op(2,IQComplex(2,3),IQComplex(2,-3)).real()-13)<1e-9);
for(int op=0;op<29;++op){ double arg=(op==2||op==3||op==15||op==16||op==24||op==26)?2:0.5;printf("%.17g\\n",iqm_real(op,arg)); }
}
`;
  fs.writeFileSync(path.join(dir,'math.cpp'),source);
  const build=spawnSync('c++',['-std=c++11',path.join(dir,'math.cpp'),'-o',path.join(dir,'math')],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(path.join(dir,'math'),[],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const cppValues=run.stdout.trim().split('\n').map(Number);
  assert.equal(cppValues.length,realOps.length);
  for(let i=0;i<cppValues.length;i++) assert.ok(Math.abs(cppValues[i]-pyValues[i])<1e-10,realOps[i]+' must agree');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
console.log('ok - numerical calculus, complex identities, all real functions, rounding, invalid domains and graph gaps');

// Link all dropdown options and all drawing calls against the actual IQ2 SDK.
process.env.PORT='5197';
const {server}=require('../server.js');
await new Promise(r=>server.listen(5197,'127.0.0.1',r));
try {
  const r=await (await fetch('http://127.0.0.1:5197/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:cpp})})).json();
  if(r.out.includes('were not found')) console.log('skip - VEX C++ SDK not installed');
  else assert.ok(r.ok,'All new math and drawing blocks must link with VEX SDK:\n'+r.out);
  console.log(`ok - generated ${statements.length} math/drawing cases in both languages`);
} finally { await new Promise(r=>server.close(r)); ws.dispose(); }
