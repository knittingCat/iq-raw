importScripts('/iq-sounds.js','/simulator-devices.js','/simulator-core.js');
let runtime,draws=[];
function flush(){if(draws.length){postMessage({type:'draw-batch',commands:draws});draws=[];}}
function trace(){const nodes=runtime?.takeTrace();if(nodes?.length)postMessage({type:'trace',nodes});}
function emit(message){if(['error','finished','stopped'].includes(message.type))trace();if(message.type==='draw'){draws.push(message);if(draws.length>=64)flush();}else{flush();postMessage(message);}}
setInterval(()=>{flush();trace();},50);
self.onmessage=({data})=>{
  if(data.type==='run'){runtime?.stop();runtime=new IQSimulatorCore.Runtime(emit,{language:data.language,trace:data.trace});runtime.run(data.state);}
  if(data.type==='button')runtime?.press(data.name,data.down);
  if(data.type==='stop'){runtime?.stop();flush();}
};
