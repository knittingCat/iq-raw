// Where VEX's VS Code extension keeps its files on each OS. Shared by the server and scripts/pack-iq2-sdk.mjs.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Extension folders, for VS Code and the other editors that share its extension format.
const EXT_ROOTS = ['.vscode', '.vscode-insiders', '.vscode-oss', '.cursor', '.windsurf', '.vscode-server'].map((d) => path.join(os.homedir(), d, 'extensions'));
// The extension keeps its downloads (vexcom, the C++ SDK and toolchain) in the editor's per-user storage folder, which
// lives in a different place on each OS. VEX_STORAGE overrides the search.
const USER_DATA = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
  : process.platform === 'win32' ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const STORAGES = process.env.VEX_STORAGE ? [process.env.VEX_STORAGE]
  : ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf'].map((app) => path.join(USER_DATA, app, 'User', 'globalStorage', 'vexrobotics.vexcode'));

const newestFirst = (a, b) => b.localeCompare(a, undefined, { numeric: true });

// The newest installed IQ2 C++ SDK folder (sdk/cpp/IQ2/<version>), or null.
function findSdk() {
  for (const storage of STORAGES) {
    const sdkRoot = path.join(storage, 'sdk', 'cpp', 'IQ2');
    let sdks = [];
    try { sdks = fs.readdirSync(sdkRoot).filter((d) => fs.existsSync(path.join(sdkRoot, d, 'vexiq2', 'libviq2rt.a'))).sort(newestFirst); } catch { continue; /* none */ }
    if (sdks.length) return path.join(sdkRoot, sdks[0]);
  }
  return null;
}

// The empty IQ2 C++ project template from the newest installed extension, or null.
function findTemplate() {
  for (const extRoot of EXT_ROOTS) {
    let dirs = [];
    try { dirs = fs.readdirSync(extRoot).filter((d) => /^vexrobotics\.vexcode-/i.test(d)).sort(newestFirst); } catch { continue; /* editor not installed */ }
    const zip = dirs.map((d) => path.join(extRoot, d, 'resources', 'templates', 'projects', 'IQ2', 'cpp_iq2_vsc_empty.zip')).find((z) => fs.existsSync(z));
    if (zip) return zip;
  }
  return null;
}

module.exports = { EXT_ROOTS, STORAGES, findSdk, findTemplate };
