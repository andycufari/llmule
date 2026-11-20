// The real world. Same interface as effects-demo.mjs: the screens can't tell which one runs.
// Everything LLMule writes lives in ~/.llmule (lib/paths.mjs), except the desktop icon (lib/shortcuts.mjs).
// Network: llmule.xyz (LLMULE_API), github.com (pinned engines), huggingface.co (models). Nothing listens on
// anything but localhost, except the mesh-llm node of a pool (QUIC, its own encryption).

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { detectMachine, detectEngines, engineHealth, probeEngine, engineErrorText } from './detect.mjs';
import { startProvider } from './provider-run.mjs';
import { download, unpack, findFile } from './fetchfile.mjs';
import { LLAMA_TAG, LLAMA_PORT, serverArgs } from './engine.mjs';
import { urlOf } from './catalog.mjs';
import { createShortcuts } from './shortcuts.mjs';
import { startPoolRun } from './pool-run.mjs';
import { P, tilde } from './paths.mjs';
import { killStale, writePid } from './pidfile.mjs';
import { writePrefs } from './prefs.mjs';

export class NotYet extends Error {
  constructor(what) {
    super(`${what}: not yet`);
    this.code = 'not_yet';
  }
}

const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
};

// The browser, without a shell: open / xdg-open / rundll32 (no cmd.exe parsing of the URL)
function openUrl(url) {
  if (!/^https?:\/\/[\w.:/?=&%-]+$/.test(url)) return false;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => {});
    p.unref();
    return true;
  } catch {
    return false;
  }
}

// LM Studio's CLI: ~/.lmstudio/bin/lms (where LM Studio puts it), else on the PATH. null = not installed
export function lmsPath({ home = os.homedir(), envPath = process.env.PATH || '', win = process.platform === 'win32' } = {}) {
  const exe = win ? 'lms.exe' : 'lms';
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  const own = path.join(home, '.lmstudio', 'bin', exe);
  if (isFile(own)) return own;
  for (const dir of envPath.split(path.delimiter)) if (dir && isFile(path.join(dir, exe))) return path.join(dir, exe);
  return null;
}

// `lms load <id> -y`: no shell, the id checked. onLine(the last line it printed: its progress bar). Resolves when
// lms exits 0; else throws with what it said (code lms_failed).
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
export function lmsLoad(bin, id, onLine = () => {}, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    if (!bin) return reject(Object.assign(new Error('lms not found'), { code: 'lms_missing' }));
    if (!/^[\w./:@-]+$/.test(id)) return reject(Object.assign(new Error(`bad model id: ${id}`), { code: 'lms_failed' }));
    let out = '';
    let child;
    try {
      child = spawn(bin, ['load', id, '-y'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      return reject(Object.assign(new Error(e.message), { code: 'lms_failed' }));
    }
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    const take = (d) => {
      out = (out + String(d).replace(ANSI, '')).slice(-8192);
      const last = out.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).at(-1);
      if (last) onLine(last);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (e) => { clearTimeout(timer); reject(Object.assign(new Error(e.message), { code: 'lms_failed' })); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      // What it said, without the progress bars: the last few lines
      const said = out.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l && !/\d+(\.\d+)?%/.test(l)).slice(-3).join(' ');
      reject(Object.assign(new Error(said || `lms exit ${code}`), { code: 'lms_failed', exitCode: code }));
    });
  });
}

export function realEffects({ api = process.env.LLMULE_API || 'https://llmule.xyz' } = {}) {
  api = api.replace(/\/$/, '');
  let linkSecret = null;
  let llama = null; // our llama-server child

  const mule = async (fn, body, key, timeout = 15000) => {
    const res = await fetch(`${api}/api/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    let d;
    try { d = JSON.parse(text); } catch { throw Object.assign(new Error(`${fn} → ${res.status}`), { code: 'offline' }); }
    if (!res.ok) throw Object.assign(new Error(d.error?.message || `${fn} ${res.status}`), { status: res.status, code: d.error?.code });
    return d;
  };

  const stopLlama = () => new Promise((resolve) => {
    const c = llama;
    llama = null;
    if (!c || c.exitCode !== null) return resolve();
    c.once('exit', () => resolve());
    c.kill('SIGTERM');
    setTimeout(() => c.kill('SIGKILL'), 4000).unref();
  });

  const fx = {
    demo: false,
    api,
    home: P.home,
    detectMachine,
    detectEngines,

    // Up = the public network endpoint answers JSON. Polled every 30 s (it's cached 10 s server-side)
    async siteStatus() {
      try {
        const res = await fetch(`${api}/api/muleNetwork`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return 'down';
        await res.json();
        return 'up';
      } catch {
        return 'down';
      }
    },

    // Somebody who already ran `mule-provider.mjs setup` (or linked before) has a key: use it
    async savedKey() {
      const k = readJson(P.config).LLMULE_KEY;
      return typeof k === 'string' && k.startsWith('llm_') ? k : null;
    },

    // ---------- the engine ----------
    // → the engine row. onProgress({ step: download|check|verify|waiting|unpack, frac, bytes, total, rate, file })
    async installEngine(asset, onProgress) {
      const dir = path.join(P.engine, LLAMA_TAG);
      let bin = findFile(dir, 'llama-server');
      if (!bin) {
        for (const f of asset.files) {
          const file = await download({ url: f.url, dest: path.join(P.downloads, f.name), bytes: f.bytes, sha256: f.sha256, onProgress: (p) => onProgress({ ...p, file: f.name }) });
          onProgress({ step: 'unpack', frac: 1, file: f.name });
          await unpack(file, dir);
          fs.rmSync(file, { force: true });
          fs.rmSync(`${file}.sha256`, { force: true });
        }
        bin = findFile(dir, 'llama-server');
        if (!bin) throw Object.assign(new Error('llama-server not in the download'), { code: 'llama_missing' });
        if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
      }
      onProgress({ step: 'unpack', frac: 1, done: true });
      return { id: 'llamacpp', name: 'llama.cpp', url: `http://127.0.0.1:${LLAMA_PORT}/v1`, up: false, models: [], ours: true, bin, gpu: asset.gpu };
    },

    // → { path }. Resumes a .part, checks sha256, waits when the connection drops
    async downloadModel(model, onProgress) {
      const dest = path.join(P.models, model.file);
      await download({ url: urlOf(model), dest, bytes: model.bytes, sha256: model.sha256, onProgress });
      return { path: dest };
    },

    // An engine that already runs needs nothing. Ours: start llama-server with the model, wait for /health
    async loadModel(engineRow, model, onState) {
      if (!engineRow.ours) {
        onState(await engineHealth(engineRow.url));
        return engineRow;
      }
      const file = model.path || (model.catalog && path.join(P.models, model.catalog.file)) || (model.file && path.join(P.models, model.file));
      if (!file || !fs.existsSync(file)) throw Object.assign(new Error('model file not found'), { code: 'model_file' });
      await stopLlama();
      if (killStale('llama-server', engineRow.bin)) await new Promise((r) => setTimeout(r, 1500));
      onState('loading');
      const gpu = !(engineRow.gpu === 'cpu');
      const log = fs.openSync(path.join(P.home, 'llama-server.log'), 'a');
      llama = spawn(engineRow.bin, serverArgs(file, { gpu }), { stdio: ['ignore', log, log], windowsHide: true });
      const child = llama;
      writePid('llama-server', child.pid);
      let died = null;
      child.on('exit', (code) => { died = code; });
      const t0 = Date.now();
      for (;;) {
        if (died !== null) throw Object.assign(new Error(`llama-server exit ${died}`), { code: 'llama_exit', exitCode: died });
        const s = await engineHealth(engineRow.url);
        if (s === 'up') break;
        if (Date.now() - t0 > 10 * 60 * 1000) throw Object.assign(new Error('llama-server load timeout'), { code: 'llama_timeout' });
        await new Promise((r) => setTimeout(r, 800));
      }
      onState('up');
      const probe = await probeEngine(engineRow.url);
      return { ...engineRow, up: true, models: probe.models || ['llmule-local'], modelPath: file };
    },

    engineState: (engineRow) => engineHealth(engineRow.url),
    // The engine's models again (after loading one in LM Studio): the same row, fresh models/loaded
    async refreshEngine(engineRow) {
      const r = await probeEngine(engineRow.url, 3000, { lmstudio: engineRow.id === 'lmstudio' || engineRow.id === 'custom' });
      return { ...engineRow, up: r.up, models: r.models || [], loaded: r.loaded ?? null, skipped: r.skipped || 0 };
    },
    lmsPath: () => lmsPath(),
    lmsLoad: (id, onLine) => lmsLoad(lmsPath(), id, onLine),
    stopEngine: stopLlama,

    // ---------- link (DESIGN §4) ----------
    async startLink(machine) {
      const r = await mule('muleLink', { op: 'start', name: machine?.host || os.hostname(), os: machine?.os || process.platform });
      linkSecret = r.deviceSecret;
      return { code: r.code, url: r.url, expiresAt: Date.now() + r.expiresIn * 1000, interval: r.interval };
    },
    // → { status: pending|approved|denied|expired|slow_down, key?, email?, nick? }
    async pollLink() {
      if (!linkSecret) throw new Error('no link started');
      const r = await mule('muleLink', { op: 'poll', deviceSecret: linkSecret });
      if (r.status === 'approved') linkSecret = null;
      return r;
    },
    openBrowser: openUrl,

    // Only what the person changed: avatar and bio belong to the account, shared by all its machines
    async saveProfile(patch, key) {
      if (!key) return { ok: false };
      const body = { op: 'setProfile' };
      for (const k of ['nick', 'avatar', 'bio']) if (patch[k] !== undefined) body[k] = patch[k];
      return mule('muleWhoami', body, key);
    },

    // Local only: one chat completion to the user's own engine
    async testQuestion(engineRow, model, question, onText) {
      const t = Date.now();
      // When it fails, the engine's own words go up to the screen (e.detail): "No models loaded…"
      const fail = (detail, extra) => Object.assign(new Error(detail), { code: 'engine_error', detail, ...extra });
      let res;
      try {
        res = await fetch(`${engineRow.url}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Ours is llama-server: thinking off for a quick answer (other engines may reject unknown fields)
          body: JSON.stringify({ model: model.local || model.id, messages: [{ role: 'user', content: question }], max_tokens: 160, stream: false, ...(engineRow.ours && { chat_template_kwargs: { enable_thinking: false } }) }),
          signal: AbortSignal.timeout(180000), // a cold load can be slow
        });
      } catch (e) {
        throw fail(e.name === 'TimeoutError' ? 'timeout (180 s)' : e.cause?.code || e.cause?.message || e.message);
      }
      const body = await res.text();
      if (!res.ok) throw fail(engineErrorText(res.status, body), { status: res.status });
      let data;
      try { data = JSON.parse(body); } catch { throw fail(engineErrorText(res.status, body)); }
      if (data.error || !Array.isArray(data.choices)) throw fail(engineErrorText(res.status, body));
      const text = String(data.choices?.[0]?.message?.content || '').trim();
      onText(text);
      const ms = Date.now() - t;
      const tokens = data.usage?.completion_tokens || Math.round(text.length / 4);
      const tps = data.timings?.predicted_per_second || tokens / (ms / 1000);
      return { text, ms, tokens, tokPerSec: Math.round(tps * 10) / 10 };
    },

    createShortcuts,

    // The installer writes what the provider reads: same file, same 0600, same keys
    saveConfig(patch) {
      const cfg = { ...readJson(P.config), ...patch };
      fs.mkdirSync(path.dirname(P.config), { recursive: true, mode: 0o700 });
      fs.writeFileSync(P.config, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
      fs.chmodSync(P.config, 0o600);
      return tilde(P.config);
    },
    savePrefs: writePrefs,
    // What setup chose, so the icon opens straight on the panel
    loadState: () => readJson(P.state),
    saveState(s) {
      fs.mkdirSync(P.home, { recursive: true, mode: 0o700 });
      fs.writeFileSync(P.state, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
    },

    startSharing(cfg, onEvent) {
      return startProvider({ api, key: cfg.key, upstream: cfg.upstream, models: cfg.models, name: cfg.name, extraBody: cfg.extraBody }, onEvent);
    },

    // What the network says about you
    async me(key) {
      const w = await mule('muleWhoami', {}, key);
      return { nick: w.nick, tokensServed: w.tokServed, tokensServedWeek: w.tokServedWeek, rank: w.rank, rankWeek: w.rankWeek, avatar: w.avatar, bio: w.bio };
    },

    // ---------- pools (DESIGN §12, mulePools) ----------
    async listPools(key, q) {
      if (!key) return { pools: [], models: [] };
      return mule('mulePools', { op: 'list', q }, key);
    },
    pools: (key, op, body) => mule('mulePools', { op, ...body }, key),
    startPoolRun(cfg, onLog) {
      return startPoolRun({ ...cfg, api, startProvider: (c, onEvent) => startProvider({ ...c, api }, onEvent) }, onLog);
    },

    async cleanup() {
      await stopLlama();
    },
  };
  return fx;
}
