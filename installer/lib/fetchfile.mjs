// Downloads that survive the internet: resume with HTTP Range (.part + rename), sha256 while it streams,
// wait-and-retry when the connection drops (the screen says "se cortó, sigo desde donde quedó"), and a
// disk-space check first. Plus unpacking with the system's tar (macOS, Linux, and Windows 10+ — bsdtar
// there also opens .zip).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Free bytes where `dir` lives, or null if this runtime can't tell
export function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

// Hash a file that's already on disk (the part we resume from, or a finished download)
async function hashFile(file, hash, onBytes) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024);
  let n;
  let done = 0;
  try {
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
      done += n;
      onBytes?.(done);
      if (done % (256 * 1024 * 1024) < buf.length) await sleep(0); // let the screen breathe
    }
  } finally {
    fs.closeSync(fd);
  }
  return done;
}

// → dest. onProgress({ step: 'check'|'download'|'verify'|'waiting', bytes, total, rate, frac, retryIn, error })
// A `dest.sha256` marker remembers a verified file, so a 20 GB model isn't re-hashed on every start.
export async function download({ url, dest, bytes = 0, sha256 = '', onProgress = () => {}, signal, fetchImpl = fetch }) {
  const marker = `${dest}.sha256`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    const st = fs.statSync(dest);
    const mark = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
    if ((!bytes || st.size === bytes) && sha256 && mark === `${sha256} ${st.size} ${Math.floor(st.mtimeMs)}`) {
      onProgress({ step: 'verify', bytes: st.size, total: st.size, frac: 1 });
      return dest;
    }
    if (sha256 && (!bytes || st.size === bytes)) {
      const h = crypto.createHash('sha256');
      await hashFile(dest, h, (b) => onProgress({ step: 'verify', bytes: b, total: st.size, frac: b / st.size }));
      if (h.digest('hex') === sha256) {
        fs.writeFileSync(marker, `${sha256} ${st.size} ${Math.floor(fs.statSync(dest).mtimeMs)}\n`);
        return dest;
      }
    }
    fs.rmSync(dest, { force: true });
  }

  const part = `${dest}.part`;
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (bytes && have > bytes) { fs.rmSync(part); have = 0; }
  const free = freeBytes(path.dirname(dest));
  if (bytes && free !== null && free < bytes - have + 256 * 1024 * 1024) {
    const e = new Error(`no_space ${bytes - have} ${free}`);
    e.code = 'no_space';
    e.need = bytes - have;
    e.free = free;
    throw e;
  }

  // The part we already have goes into the hash first
  let hash = crypto.createHash('sha256');
  if (have) {
    onProgress({ step: 'check', bytes: 0, total: have, frac: 0 });
    await hashFile(part, hash, (b) => onProgress({ step: 'check', bytes: b, total: have, frac: b / have }));
  }

  let wait = 2000;
  const window = []; // [ms, bytes] for the rate
  for (;;) {
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    if (bytes && have === bytes) break;
    let res;
    try {
      res = await fetchImpl(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal, redirect: 'follow' });
      if (have && res.status === 200) {
        // The server ignored the Range: start over
        hash = crypto.createHash('sha256');
        have = 0;
        fs.truncateSync(part, 0);
      } else if (res.status === 416 && bytes && have === bytes) {
        break;
      } else if (!(res.status === 200 || res.status === 206)) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      }
      const total = bytes || (Number(res.headers.get('content-length')) || 0) + have;
      const fd = fs.openSync(part, have ? 'a' : 'w');
      try {
        for await (const chunk of res.body) {
          fs.writeSync(fd, chunk);
          hash.update(chunk);
          have += chunk.length;
          const now = Date.now();
          window.push([now, have]);
          while (window.length > 2 && now - window[0][0] > 4000) window.shift();
          const [t0, b0] = window[0];
          const rate = now > t0 ? ((have - b0) * 1000) / (now - t0) : 0;
          onProgress({ step: 'download', bytes: have, total, rate, frac: total ? have / total : 0 });
          wait = 2000;
        }
      } finally {
        fs.closeSync(fd);
      }
      if (!bytes) break;
      if (have < bytes) throw new Error('connection closed early');
    } catch (e) {
      if (signal?.aborted || e.name === 'AbortError') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      // 4xx other than a hiccup: the URL is wrong, waiting won't fix it
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
      onProgress({ step: 'waiting', bytes: have, total: bytes, frac: bytes ? have / bytes : 0, retryIn: Math.round(wait / 1000), error: e.message });
      await sleep(wait);
      wait = Math.min(wait * 2, 60000);
    }
  }

  onProgress({ step: 'verify', bytes: have, total: have, frac: 1 });
  const got = hash.digest('hex');
  if (sha256 && got !== sha256) {
    fs.rmSync(part, { force: true }); // a corrupt file never gets a second chance
    const e = new Error(`sha256 mismatch: got ${got}`);
    e.code = 'bad_sha256';
    throw e;
  }
  fs.renameSync(part, dest);
  if (sha256) fs.writeFileSync(marker, `${sha256} ${have} ${Math.floor(fs.statSync(dest).mtimeMs)}\n`);
  return dest;
}

// tar -xf works for .tar.gz everywhere and for .zip on Windows 10+ (bsdtar)
export function unpack(archive, dir) {
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve, reject) => {
    const args = archive.endsWith('.zip') ? ['-xf', archive, '-C', dir] : ['-xzf', archive, '-C', dir];
    const p = spawn('tar', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve(dir) : reject(new Error(`tar ${code}: ${err.slice(0, 200)}`))));
  });
}

// The first file called `name` (or name.exe) under dir
export function findFile(dir, name) {
  const want = [name, `${name}.exe`];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isFile() && want.includes(e.name)) return p;
      if (e.isDirectory()) stack.push(p);
    }
  }
  return null;
}
