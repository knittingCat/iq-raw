const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const headers=new Set(['vex.h','stdint.h','cstdint','stddef.h','cstddef','stdio.h','cstdio','stdlib.h','cstdlib','math.h','cmath','string','cstring','string.h','vector','array','complex','algorithm','limits','utility','numeric','functional','iostream','sstream','iomanip','cassert','assert.h','stdbool.h','stdbool.h','cctype','ctype.h','climits','limits.h','float.h','cfloat','unistd.h','fcntl.h']);
function validate(code){
  if(typeof code!=='string'||!code.trim()||code.length>200000)throw Error('Preview requires nonempty code, at most 200000 characters.');
  const normalized=code.replace(/\\\r?\n/g,'').replace(/\/\*[\s\S]*?\*\//g,' ');
  // Only #-lines are checked below, so the other spellings of a directive are refused outright: the %: digraph for #,
  // __has_include (which probes host files) and _Pragma (the operator form of #pragma).
  if(/%:|\b__has_include|\b_Pragma\b/.test(normalized))throw Error('Code preview does not accept %: digraphs, __has_include or _Pragma. Write directives with #.');
  for(const line of normalized.split(/\r?\n/)){
    const directive=line.match(/^\s*#\s*(\w+)(.*)$/);if(!directive)continue;
    const [,name,args]=directive;
    if(name==='include'){
      const include=args.match(/^\s*[<"]([^>"]+)[>"]\s*(?:\/\/.*)?$/);
      if(!include||!headers.has(include[1]))throw Error('Code preview only accepts vex.h and supported standard-library includes. Local files and computed includes are unavailable.');
    }else if(!['define','undef','if','ifdef','ifndef','elif','else','endif','error','warning','line'].includes(name)&&!(name==='pragma'&&args.trim()==='once'))throw Error('Unsupported preprocessor directive in preview: '+name);
  }
  if(/\b(?:asm|__asm|__asm__)\b|\.incbin|__has_embed/.test(normalized))throw Error('Assembly and embedded host files are unavailable in code preview.');
}
function execute(bin,args,{cwd,env=process.env,timeout=30000}={}){
  return new Promise(resolve=>{
    const child=spawn(bin,args,{cwd,env});let out='';let ended=false;
    const timer=setTimeout(()=>{out+='\nPreview compilation timed out.';child.kill('SIGKILL');},timeout);
    const finish=code=>{if(ended)return;ended=true;clearTimeout(timer);resolve({code,out});};
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{out=(out+chunk).slice(-64000);});
    child.on('error',error=>{out+=error.message;finish(-1);});child.on('close',(code,signal)=>{if(signal)out+='\nCompiler terminated by '+signal;finish(code??-1);});
  });
}
let building=false;
async function compile(code){
  validate(code);
  const wasi=require('./wasi-sdk').wasiSdk();
  if(!wasi)throw Error(`C++ code preview has no compiler for ${process.platform} on ${process.arch}. Block and Python previews run in the browser.`);
  const tool=wasi.folder,clang=wasi.clang;
  if(!fs.existsSync(clang))throw Error('The browser-preview compiler is not installed. Run npm run setup-preview once, then retry.');
  if(building)throw Error('Another code preview is compiling. Wait for it to finish and retry.');
  building=true;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iqraw-preview-'));
  try{
    fs.writeFileSync(path.join(dir,'main.cpp'),code);fs.copyFileSync(path.join(__dirname,'vex.h'),path.join(dir,'vex.h'));
    const flags=['-std=c++17','-O1','-fno-exceptions','-fno-rtti','-ftemplate-depth=128','-fconstexpr-depth=128','-fconstexpr-steps=200000','-I',dir,'main.cpp','-o','raw.wasm','-Wl,--export=malloc','-Wl,--max-memory=67108864','-Wl,-z,stack-size=1048576'];
    let result;
    if(process.platform==='darwin'){
      const quote=s=>JSON.stringify(fs.realpathSync(s));
      const profile=`(version 1)(allow default)(deny network*)(deny file-read-data (subpath "/Users")(subpath "/private")(subpath "/Volumes"))(allow file-read-data (subpath ${quote(tool)})(subpath ${quote(dir)})(subpath "/private/var/db/dyld"))(deny file-write*)(allow file-write* (subpath ${quote(dir)})(literal "/dev/null"))`;
      result=await execute('/usr/bin/sandbox-exec',['-p',profile,clang,...flags],{cwd:dir,env:{PATH:path.join(tool,'bin')+':/usr/bin:/bin',HOME:dir,TMPDIR:dir,LC_ALL:'C'}});
    }else{
      // Windows and Linux have no sandbox-exec. validate() still limits the source to allow-listed headers with no
      // assembly or embedded files, and clang runs in a throwaway folder with a minimal environment. (VEX's own C++
      // build already runs its clang on the same code unsandboxed on every OS.)
      const bin=path.join(tool,'bin'),system=process.platform==='win32'?[path.join(process.env.SystemRoot||'C:\\Windows','System32')]:['/usr/bin','/bin'];
      const env={PATH:[bin,...system].join(path.delimiter),HOME:dir,TMPDIR:dir,TMP:dir,TEMP:dir,LC_ALL:'C'};
      if(process.platform==='win32')Object.assign(env,{SystemRoot:process.env.SystemRoot||'C:\\Windows',USERPROFILE:dir});
      result=await execute(clang,flags,{cwd:dir,env});
    }
    if(result.code!==0)return {ok:false,out:result.out};
    if(fs.statSync(path.join(dir,'raw.wasm')).size>8*1024*1024)throw Error('Compiled preview is too large (8 MB maximum).');
    const converted=await execute(process.execPath,[path.join(__dirname,'asyncify.mjs'),path.join(dir,'raw.wasm'),path.join(dir,'preview.wasm')],{cwd:ROOT});
    if(converted.code!==0)return {ok:false,out:converted.out};
    return {ok:true,wasm:fs.readFileSync(path.join(dir,'preview.wasm')).toString('base64'),out:result.out.trim()};
  }finally{building=false;fs.rmSync(dir,{recursive:true,force:true});}
}
module.exports={compile,validate};
