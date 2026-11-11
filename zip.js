// Reads a plain ZIP (stored or deflated entries, no ZIP64 or encryption) with Node's own zlib, so C++ builds need no
// unzip program. That matters on Windows, which has none. Entry names that would escape the target folder are refused.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Lists the entries as { name, read() }, where read() returns the uncompressed contents.
function entries(file) {
  const zip = fs.readFileSync(file);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error(`${file} is not a ZIP file (or it is incomplete).`);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const list = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file} has a damaged directory.`);
    const flags = zip.readUInt16LE(at + 8), method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28), extraLen = zip.readUInt16LE(at + 30), commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString(flags & 0x800 ? 'utf8' : 'latin1', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    list.push({ name, read() {
      if (flags & 1) throw new Error(`${file} is encrypted.`);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`${file} uses unsupported compression (method ${method}) for ${name}.`);
    } });
  }
  return list;
}

function extractZip(file, dest) {
  const root = path.resolve(dest);
  for (const entry of entries(file)) {
    const out = path.resolve(root, entry.name);
    if (out !== root && !out.startsWith(root + path.sep)) throw new Error(`${file} has an entry outside its folder: ${entry.name}`);
    if (entry.name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, entry.read());
  }
}

// Returns one file's contents, or null when the ZIP has no such entry.
function readZipEntry(file, name) {
  const entry = entries(file).find((e) => e.name === name);
  return entry ? entry.read() : null;
}

module.exports = { extractZip, readZipEntry };
