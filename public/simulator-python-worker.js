// Module worker (Pyodide no longer loads in classic workers). The helper scripts are plain scripts that attach to `self`.
import {loadPyodide} from '/vendor/pyodide/pyodide.mjs';
import '/iq-sounds.js';
import '/simulator-devices.js';
import '/simulator-python.js';
self.onmessage=async({data})=>{
  if(data.type==='button')self.IQSimulatorPython.setButton(data.name,data.down);
  if(data.type!=='run-python')return;
  try{
    const vexSource=await (await fetch('/simulator-vex.py')).text();
    const shared=data.shared?{buttons:new Int32Array(data.shared,0,4),sleep:new Int32Array(data.shared,16,1)}:null;
    const message=await self.IQSimulatorPython.run({loadPyodide,pyodideOptions:{indexURL:'/vendor/pyodide/'},vexSource,source:data.code,post:postMessage,shared});
    postMessage(message?{type:'error',message}:{type:'finished',interactive:false});
  }catch(error){postMessage({type:'error',message:'Python preview failed: '+(error?.message||error)});}
};
