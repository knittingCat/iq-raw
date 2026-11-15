// Shared test helpers. `python` is a working Python 3: on Windows, `python3` is often the Microsoft Store stub, so try the usual names in turn.
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
export const python = ['python3', 'python', 'py'].find((name) => {
  const r = spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)'], { encoding: 'utf8' });
  return r.status === 0;
}) || 'python3';

// Writes a minimal ZIP: [name, contents, deflate?] per entry; a name ending in "/" is a folder.
export function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text = '', deflate = false] of entries) {
    const raw = Buffer.from(text), data = deflate ? zlib.deflateRawSync(raw) : raw, fname = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(fname.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(fname.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, fname, data); centrals.push(central, fname);
    offset += 30 + fname.length + data.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
