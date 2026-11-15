const { StringDecoder } = require('node:string_decoder');

// Only VEXcom's discovered user port may be opened; HTTP callers cannot supply paths.
// macOS names the brain's ports /dev/tty.usbmodem…, Linux /dev/ttyACM…, Windows COM….
const PORT_NAME=/^(?:\/dev\/(?:tty|cu)\.usbmodem[\w.-]+|\/dev\/ttyACM\d+|COM\d+)$/;
function createConsole({ SerialPort, query }) {
  let port=null, opening=null, history='',suspended=0,resume=false,admin=null;
  const clients=new Set();
  const state=()=>({connected:!!port?.isOpen});
  const send=(event,data)=>{
    const frame=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for(const client of clients) { if(!client.write(frame)){client.end();clients.delete(client);} }
  };
  async function connect() {
    if(suspended)throw Error('The console is paused for a brain transfer. It will reconnect when the transfer finishes.');
    if(port?.isOpen)return state();
    if(opening)return opening;
    opening=(async()=>{
      const result=await query();
      let info;
      try{info=JSON.parse(result.out.slice(result.out.indexOf('{')));}catch{throw Error(result.out||'The brain did not return its console port.');}
      const device=info.device;
      if(result.code!==0||device?.connection!=='brain'||!PORT_NAME.test(device?.user||'')) throw Error('No IQ brain console port found. Connect the powered-on brain directly by USB, and close VEXcode’s connection.');
      const path=device.user.replace('/dev/tty.','/dev/cu.');
      admin=PORT_NAME.test(device.admin||'')?device.admin:null;
      const current=new SerialPort({path,baudRate:115200,parity:'none',stopBits:1,xon:true,xoff:true,autoOpen:false});
      const decoder=new StringDecoder('utf8');port=current;
      current.on('data',bytes=>{
        const text=decoder.write(bytes);if(!text)return;
        history=(history+text).slice(-65536);send('data',text);
      });
      current.on('error',error=>send('console-error','Console: '+error.message));
      current.on('close',()=>{if(port===current){port=null;admin=null;}send('state',state());});
      try{await new Promise((resolve,reject)=>current.open(error=>error?reject(error):resolve()));}
      catch(error){if(port===current)port=null;throw Error('Could not open the brain console: '+error.message);}
      send('state',state());return state();
    })();
    try{return await opening;}finally{opening=null;}
  }
  async function disconnect({temporary=false}={}){
    if(!temporary)resume=false;
    if(opening){try{await opening;}catch{/* failed connection is already closed */}}
    const current=port;
    if(current?.isOpen)await new Promise((resolve,reject)=>current.close(error=>error?reject(error):resolve()));
    port=null;send('state',state());return state();
  }
  async function withSuspended(action){
    resume=resume||!!port?.isOpen||!!opening;suspended++;
    try{await disconnect({temporary:true});return await action();}
    finally{
      suspended--;
      if(!suspended&&resume){resume=false;try{await connect();}catch(error){send('console-error',error.message);}}
    }
  }
  async function input(text){
    if(typeof text!=='string'||Buffer.byteLength(text)>4096)throw Error('Console input must be text, at most 4096 bytes.');
    if(!port?.isOpen)throw Error('Connect the brain console before sending input.');
    const current=port;
    await new Promise((resolve,reject)=>current.write(text,error=>error?reject(error):current.drain(error=>error?reject(error):resolve())));
  }
  function subscribe(req,res){
    if(clients.size>=16){res.writeHead(429).end('Too many console connections');return;}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive'});
    res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
    if(history)res.write(`event: data\ndata: ${JSON.stringify(history)}\n\n`);
    clients.add(res);
    const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);heartbeat.unref();
    res.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});
  }
  return {connect,disconnect,input,withSuspended,subscribe,state,adminPort:()=>admin,clear(){history='';send('clear',null);},async close(){for(const c of clients)c.end();clients.clear();await disconnect();}};
}
module.exports={createConsole};
