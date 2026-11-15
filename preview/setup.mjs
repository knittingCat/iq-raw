// Installs the WASI SDK that compiles C++ previews, for this OS and CPU, into ~/.iq-raw/preview.
// The archive is checked against GitHub's SHA-256 before anything is extracted.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
const {wasiSdk}=createRequire(import.meta.url)('./wasi-sdk.js');
const sdk=wasiSdk();
if(!sdk)throw Error(`No C++ preview compiler is published for ${process.platform} on ${process.arch}. Supported: macOS, Windows and Linux on x64 or arm64.`);
fs.mkdirSync(sdk.root,{recursive:true});
if(fs.existsSync(sdk.clang)){console.log('Browser preview compiler is already installed.');process.exit(0);}
const archive=path.join(sdk.root,sdk.archive),partial=archive+'.part';
// An archive left by an earlier run (for example, one whose extraction failed) is reused if its checksum matches.
const sha256=file=>new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');fs.createReadStream(file).on('data',d=>h.update(d)).on('error',reject).on('end',()=>resolve(h.digest('hex')));});
if(fs.existsSync(archive)&&await sha256(archive)===sdk.sha256)console.log('Using the already downloaded '+sdk.archive);
else await download();
// Windows 10+ ships bsdtar as System32\tar.exe; prefer it over a GNU tar from Git, which misreads C:\ paths.
const windowsTar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
const tar=process.platform==='win32'&&fs.existsSync(windowsTar)?windowsTar:'tar';
const unpack=spawnSync(tar,['-xzf',archive,'-C',sdk.root],{stdio:'inherit'});
if(unpack.status!==0||!fs.existsSync(sdk.clang))throw Error('WASI SDK extraction failed.');
fs.unlinkSync(archive);console.log('Installed browser-preview compiler: '+sdk.folder);

// The archives are 200-600 MB and a single GitHub connection is often slow, so the file is fetched as 4 MB ranges over
// several connections, retrying each range on its own. Servers that ignore ranges get one plain streamed download.
async function download(){
  console.log(`Downloading ${sdk.url}`);
  const probe=await fetch(sdk.url,{headers:{range:'bytes=0-0'}});
  if(!probe.ok)throw Error(`WASI SDK download failed: HTTP ${probe.status}.`);
  const total=probe.status===206?Number((probe.headers.get('content-range')||'').split('/')[1])||0:0;
  await probe.body?.cancel();
  let received=0,shown=-1;
  const progress=bytes=>{
    received+=bytes;if(!total)return;
    const percent=Math.floor(received*100/total);
    if(percent!==shown&&percent%5===0){shown=percent;process.stdout.write(`\r${percent}% of ${Math.round(total/1048576)} MB`);}
  };
  if(total)await ranged(total,progress);else await streamed(progress);
  process.stdout.write('\n');
  if(await sha256(partial)!==sdk.sha256){fs.rmSync(partial,{force:true});throw Error('WASI SDK checksum did not match. The archive was deleted, not extracted.');}
  fs.renameSync(partial,archive);
}
async function ranged(total,progress){
  const size=4*1048576,ranges=[];
  for(let start=0;start<total;start+=size)ranges.push([start,Math.min(total,start+size)-1]);
  const file=await fs.promises.open(partial,'w');
  try{
    await file.truncate(total);
    const worker=async()=>{
      for(let range;(range=ranges.shift());){
        const [start,end]=range;
        for(let attempt=1;;attempt++){
          try{
            const response=await fetch(sdk.url,{headers:{range:`bytes=${start}-${end}`}});
            if(response.status!==206)throw Error(`HTTP ${response.status}`);
            const data=Buffer.from(await response.arrayBuffer());
            if(data.length!==end-start+1)throw Error(`short read of ${data.length} bytes`);
            await file.write(data,0,data.length,start);progress(data.length);break;
          }catch(error){
            if(attempt===6)throw Error(`WASI SDK download failed at byte ${start}: ${error.message}. Run npm run setup-preview again.`);
            await new Promise(resolve=>setTimeout(resolve,1000*attempt));
          }
        }
      }
    };
    await Promise.all(Array.from({length:8},worker));
  }finally{await file.close();}
}
async function streamed(progress){
  const response=await fetch(sdk.url);
  if(!response.ok)throw Error(`WASI SDK download failed: HTTP ${response.status}.`);
  const out=fs.createWriteStream(partial);
  for await(const chunk of response.body){progress(chunk.length);if(!out.write(chunk))await new Promise(resolve=>out.once('drain',resolve));}
  await new Promise((resolve,reject)=>out.end(error=>error?reject(error):resolve()));
}
