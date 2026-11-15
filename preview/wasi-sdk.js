// Which WASI SDK build the C++ preview uses on this computer, where it is installed, and the SHA-256 that GitHub lists
// for each release archive (https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34).
const os=require('node:os'),path=require('node:path');
const VERSION='34';
const HASHES={
  'arm64-macos':'9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9',
  'x86_64-macos':'87d27fa8adc68dee59bfbf2e22a6d34ef717c34d6bf1d8af2a56fc929d9ce0eb',
  'arm64-linux':'f7e243dff54d60bcc576e94d6166b69f410f2500ae4a9ceef34315be10e77971',
  'x86_64-linux':'b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4',
  'arm64-windows':'45e1c71f3e965621e7b98ebe1d37b0e4b1f77f3e8072113ffb4534e67b1a4b7c',
  'x86_64-windows':'cccb5c323a9b34f0349a9b09e8804a0a7632c68c3310f4b5f437ed57d7e71d8f',
};
function wasiSdk(platform=process.platform,arch=process.arch,home=os.homedir()){
  const system={darwin:'macos',linux:'linux',win32:'windows'}[platform];
  const cpu={arm64:'arm64',x64:'x86_64'}[arch];
  const target=system&&cpu?`${cpu}-${system}`:null;
  if(!target||!HASHES[target])return null;
  const name=`wasi-sdk-${VERSION}.0-${target}`,root=path.join(home,'.iq-raw','preview'),folder=path.join(root,name);
  return {name,root,folder,sha256:HASHES[target],archive:name+'.tar.gz',
    url:`https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${VERSION}/${name}.tar.gz`,
    clang:path.join(folder,'bin','clang++'+(platform==='win32'?'.exe':''))};
}
module.exports={wasiSdk,HASHES};
