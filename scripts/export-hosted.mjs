import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(process.argv[2]||path.join(root,'hosted'));
const base='/iq-raw/';
const revision=crypto.createHash('sha256').update(fs.readdirSync(path.join(root,'public')).filter(n=>/\.(js|mjs|html|css|py)$/.test(n)).sort().map(n=>fs.readFileSync(path.join(root,'public',n))).join('')).digest('hex').slice(0,12);
fs.mkdirSync(target,{recursive:true});
function copy(from,to){
  fs.mkdirSync(path.dirname(to),{recursive:true});
  if(/\.(html|js|mjs|css|py)$/.test(from)){
    let text=fs.readFileSync(from,'utf8');
    text=text.replace(/(["'`])\/(?=(?:[\w.-]+\.(?:js|mjs|css|html|py)|assets\/|vendor\/|compiler\/|api\/|docs\/))/g,(_,q)=>q+base);
    if(from.endsWith("settings.html")||from.endsWith("help.html"))text=text.replace('href="/"','href="'+base+'"');
    text=text.replace(/(["'`])((?:\/iq-raw\/|\.\.?\/)[\w./-]+\.(?:js|mjs|css|py|json\.gz))\1/g,(match,q,url)=>url.includes('/vendor/')?match:q+url+'?v='+revision+q);
    fs.writeFileSync(to,text);
  }else fs.copyFileSync(from,to);
}
function tree(from,to,filter=()=>true){
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
    if(!filter(entry.name))continue;
    if(entry.isDirectory())tree(path.join(from,entry.name),path.join(to,entry.name),filter);
    else copy(path.join(from,entry.name),path.join(to,entry.name));
  }
}
tree(path.join(root,'public'),target);
// The Help page renders the same troubleshooting guide that the local server serves.
fs.mkdirSync(path.join(target,'docs'),{recursive:true});
fs.copyFileSync(path.join(root,'TROUBLESHOOTING.md'),path.join(target,'docs','TROUBLESHOOTING.md'));
for(const [folder,dest] of [['blockly','blockly'],['@dagrejs/dagre/dist','dagre'],['microbit-clang-wasm/gen','compiler'],['pyodide','preview/python'],['pyodide','pyodide'],['asyncify-wasm/dist','preview/asyncify'],['@bjorn3/browser_wasi_shim/dist','preview/wasi']]){
  // Vendor modules use relative imports; keep their contents untouched.
  const from=path.join(root,'node_modules',folder),to=path.join(target,'vendor',dest);fs.mkdirSync(to,{recursive:true});
  for(const entry of fs.readdirSync(from,{withFileTypes:true}))if(entry.isFile()&&/\.(js|mjs|wasm|zip|json|tar)$/.test(entry.name))fs.copyFileSync(path.join(from,entry.name),path.join(to,entry.name));
}
fs.cpSync(path.join(root,'node_modules/blockly/media'),path.join(target,'vendor/blockly/media'),{recursive:true});
fs.mkdirSync(path.join(target,'vendor/blockly/msg'),{recursive:true});
fs.copyFileSync(path.join(root,'node_modules/blockly/msg/en.js'),path.join(target,'vendor/blockly/msg/en.js'));
let html=fs.readFileSync(path.join(target,'index.html'),'utf8');

html=html.replace('<body>','<body>\n<div class="hosted-notice" role="note"><a href="/">← TKS Tools</a> · IQ Raw web editor · C++ compiles in your browser. Choose Bluetooth to download wirelessly. USB downloads use the <a href="http://localhost:5174/">local app</a> (<a href="https://github.com/knittingCat/iq-raw#readme" target="_blank" rel="noopener">setup</a>).</div>');
html=html.replace('<head>','<head>\n<script src="'+base+'hosted.js?v='+revision+'"></script>');
fs.writeFileSync(path.join(target,'index.html'),html);
fs.writeFileSync(path.join(target,'hosted.js'),`// Hosted edition has no local device server. Never send source to a cloud compiler.
window.IQHosted=true;
const fetchOriginal=window.fetch.bind(window);
window.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin===location.origin&&url.pathname.startsWith('${base}api/'))return Promise.resolve(new Response(JSON.stringify({ok:false,error:'Open the local IQ Raw app for C++ compilation and device operations.',out:'Open the local IQ Raw app for C++ compilation and device operations.',connected:false}),{status:200,headers:{'content-type':'application/json'}}));
 return fetchOriginal(input,options);
};
window.EventSource=class {addEventListener(){} close(){}};
document.addEventListener('DOMContentLoaded',()=>{
 for(const id of ['vm','refresh','programs','probe']){
  const element=document.getElementById(id);if(element){element.disabled=true;element.title='Available in the local IQ Raw app';}
 }
 const mode=document.getElementById('transferMode');if(mode){mode.value='bluetooth';mode.dispatchEvent(new Event('change'));}
 const brain=document.getElementById('brain');if(brain){brain.className='';brain.textContent='Web editor · compile C++ here and connect Bluetooth to transfer';}
});
`);
for(const [source,destination]of [['microbit-clang-wasm/LICENSES','vendor/compiler/LICENSES'],['@dagrejs/dagre/LICENSE','vendor/dagre/LICENSE']]){const from=path.join(root,'node_modules',source);if(fs.existsSync(from))fs.cpSync(from,path.join(target,destination),{recursive:true});}
fs.appendFileSync(path.join(target,'app.css'),'\n.hosted-notice{padding:10px 16px;background:var(--panel,#202a3a);color:var(--ink,#eee);font:13px/1.5 system-ui}.hosted-notice a{color:inherit;text-decoration:underline}\n');
console.log('Exported IQ Raw web editor to '+target);
