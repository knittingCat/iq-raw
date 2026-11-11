import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{findSdk,findTemplate}=require('../vex-paths.js'),{readZipEntry}=require('../zip.js');
const found=findSdk();if(!found)throw Error('Install the IQ2 C++ SDK with the VEX VS Code extension first.');const version=path.basename(found);
const sdk=path.join(found,'vexiq2'),files={};
function walk(from,prefix){for(const entry of fs.readdirSync(from,{withFileTypes:true})){if(entry.isDirectory())walk(path.join(from,entry.name),prefix+'/'+entry.name);else files[prefix+'/'+entry.name]=fs.readFileSync(path.join(from,entry.name)).toString('base64');}}
walk(path.join(sdk,'include'),'sdk/include');walk(path.join(sdk,'gcc/include'),'sdk/gcc/include');
for(const name of ['libviq2rt.a','lscript.ld','license.pdf'])files['sdk/'+name]=fs.readFileSync(path.join(sdk,name)).toString('base64');
for(const name of ['libc_nano.a','libstdc++_nano.a','libm.a','libgcc.a'])files['sdk/gcc/libs/'+name]=fs.readFileSync(path.join(sdk,'gcc/libs',name)).toString('base64');
const template=findTemplate();if(!template)throw Error('The IQ2 C++ project template from the VEX VS Code extension was not found. Reinstall the extension.');
const vexHeader=readZipEntry(template,'include/vex.h');if(!vexHeader)throw Error(`include/vex.h is missing from the VEX project template ${template}. Reinstall the VEX VS Code extension.`);
files['include/vex.h']=vexHeader.toString('base64');
const target=path.resolve(process.argv[2]||'public/compiler/iq2-sdk.json.gz');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,zlib.gzipSync(JSON.stringify({version,files}),{level:9}));console.log('Packed '+Object.keys(files).length+' IQ2 SDK files: '+fs.statSync(target).size+' bytes');
