// What this machine has: OS, CPU, RAM, GPU + VRAM, and which local engines answer. Read-only:
// runs a few query tools (nvidia-smi, sysctl, reg query…) and probes localhost ports. Nothing else.

import os from 'node:os';
import fs from 'node:fs';
import { execFile } from 'node:child_process';

const run = (cmd, args, timeout = 4000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
});

const GB = 1024 ** 3;

async function osLabel() {
  if (process.platform === 'darwin') {
    const v = (await run('sw_vers', ['-productVersion']))?.trim();
    return `macOS ${v || os.release()}`;
  }
  if (process.platform === 'linux') {
    try {
      const m = /PRETTY_NAME="?([^"\n]+)/.exec(fs.readFileSync('/etc/os-release', 'utf8'));
      if (m) return m[1];
    } catch { /* no os-release */ }
    return `Linux ${os.release()}`;
  }
  if (process.platform === 'win32') return os.version ? os.version() : `Windows ${os.release()}`;
  return `${process.platform} ${os.release()}`;
}

// NVIDIA on any OS (nvidia-smi ships with the driver; on Windows it's in System32)
export function parseNvidia(csv) {
  return String(csv || '').trim().split('\n').filter(Boolean).map((line) => {
    const [name, total, used, driver] = line.split(',').map((s) => s.trim());
    return { vendor: 'nvidia', name, vramGB: Math.round((Number(total) / 1024) * 10) / 10, usedGB: Math.round((Number(used) / 1024) * 10) / 10, ...(driver && { driver }) };
  }).filter((g) => g.name && g.vramGB > 0);
}

async function nvidia() {
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total,memory.used,driver_version', '--format=csv,noheader,nounits']);
  return parseNvidia(out);
}

// AMD on Linux: the amdgpu driver exposes VRAM in sysfs, no tool needed
function amdLinux() {
  const gpus = [];
  try {
    for (const card of fs.readdirSync('/sys/class/drm')) {
      if (!/^card\d+$/.test(card)) continue;
      const dir = `/sys/class/drm/${card}/device`;
      try {
        const bytes = Number(fs.readFileSync(`${dir}/mem_info_vram_total`, 'utf8'));
        if (bytes > 512 * 1024 * 1024) gpus.push({ vendor: 'amd', name: 'AMD Radeon', vramGB: Math.round((bytes / GB) * 10) / 10 });
      } catch { /* not amdgpu */ }
    }
  } catch { /* no sysfs */ }
  return gpus;
}

// Windows, non-NVIDIA: Win32_VideoController.AdapterRAM caps at 4 GB, the registry has the real number
export function parseWinRegistry(text) {
  const gpus = [];
  let cur = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^HKEY_/.test(line)) { if (cur.name && cur.bytes) gpus.push(cur); cur = {}; continue; }
    const m = /^\s+(\S+)\s+REG_\w+\s+(.*)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'DriverDesc') cur.name = m[2].trim();
    if (m[1] === 'HardwareInformation.qwMemorySize') cur.bytes = Number(m[2].trim());
  }
  if (cur.name && cur.bytes) gpus.push(cur);
  return gpus.map((g) => ({ vendor: /nvidia/i.test(g.name) ? 'nvidia' : /amd|radeon/i.test(g.name) ? 'amd' : /intel/i.test(g.name) ? 'intel' : 'other', name: g.name, vramGB: Math.round((g.bytes / GB) * 10) / 10 }));
}

async function windowsGpus() {
  const out = await run('reg', ['query', 'HKLM\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}', '/s', '/v', '*'], 8000);
  return parseWinRegistry(out).filter((g) => g.vendor !== 'nvidia');
}

// Apple Silicon: one memory for CPU and GPU. Metal lets the GPU use ~2/3 of it (~3/4 from 64 GB)
export function appleUsable(ramGB) {
  return Math.floor(ramGB * (ramGB >= 64 ? 0.75 : 0.66));
}

export async function detectMachine() {
  const ramGB = Math.round(os.totalmem() / GB);
  const cpus = os.cpus();
  const machine = {
    platform: process.platform,
    arch: process.arch,
    os: await osLabel(),
    cpu: (cpus[0]?.model || 'CPU').replace(/\s+/g, ' ').trim(),
    cores: cpus.length,
    ramGB,
    host: os.hostname().replace(/\.local$/, ''),
    gpus: [],
    apple: null,
  };
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    const chip = (await run('sysctl', ['-n', 'machdep.cpu.brand_string']))?.trim() || 'Apple Silicon';
    machine.apple = { chip, unifiedGB: ramGB, usableGB: appleUsable(ramGB) };
    machine.cpu = chip;
  } else {
    machine.gpus = await nvidia();
    if (!machine.gpus.length && process.platform === 'linux') machine.gpus = amdLinux();
    if (!machine.gpus.length && process.platform === 'win32') machine.gpus = await windowsGpus();
  }
  machine.vramGB = bestVram(machine);
  return machine;
}

// The memory a model can use: the biggest dedicated GPU, or Apple's usable share. 0 = CPU only.
export function bestVram(m) {
  if (m.apple) return m.apple.usableGB;
  const usable = (m.gpus || []).filter((g) => g.vendor === 'nvidia' || g.vendor === 'amd');
  return usable.length ? Math.max(...usable.map((g) => g.vramGB)) : 0;
}

// ---------- engines ----------

// llama-server moved its default port from 8080 to 9931 (Oct 2026): probe both.
// OpenAI-compatible servers: vLLM's default :8000, and :8001 (cm64labs' "brain" port: strata-brain, vllm-brain and
// llama-brain all serve there). By IP, not "localhost": Strata 0.1.43+ refuses Host names it doesn't know (IPs pass).
export const ENGINES = [
  { id: 'ollama', name: 'Ollama', url: 'http://localhost:11434/v1' },
  { id: 'lmstudio', name: 'LM Studio', url: 'http://localhost:1234/v1' },
  { id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:9931/v1' },
  { id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:8080/v1' },
  { id: 'openai', name: 'vLLM / OpenAI', url: 'http://127.0.0.1:8000/v1' },
  { id: 'openai', name: 'vLLM / OpenAI', url: 'http://127.0.0.1:8001/v1' },
];

// Embedding and reranker models can't chat: never offer one as "the model". By name, for engines that don't say the
// type (Ollama, vLLM, llama-server): nomic-embed-text, mxbai-embed-large, all-minilm, bge-m3, gte-…, e5-…
const EMBED = /embed|rerank|all-minilm|(^|[/:_-])(bge|gte|e5)([-_:.]|$)/i;
export const isEmbeddingId = (id) => EMBED.test(String(id || ''));

// An OpenAI /v1/models list → { models: chat ids, skipped: how many weren't chat }. Loaded state unknown.
export function chatModels(ids) {
  const all = (ids || []).filter(Boolean);
  const models = all.filter((id) => !isEmbeddingId(id));
  return { models, loaded: null, skipped: all.length - models.length };
}

// LM Studio's /api/v0/models says type (llm | vlm | embeddings) and state (loaded | not-loaded):
// chat ones only (llm, vlm), loaded first. → { models, loaded: the loaded ids, skipped }
export function lmStudioModels(data) {
  const all = (data?.data || []).filter((m) => m && m.id);
  const chat = all.filter((m) => (m.type ? m.type === 'llm' || m.type === 'vlm' : true) && !isEmbeddingId(m.id));
  const loaded = chat.filter((m) => m.state === 'loaded').map((m) => m.id);
  return { models: [...loaded, ...chat.filter((m) => m.state !== 'loaded').map((m) => m.id)], loaded, skipped: all.length - chat.length };
}

// The model to offer from an engine row: the first chat model (loaded first). load = it's there but not loaded
// (only LM Studio tells; elsewhere loaded is null and the engine loads on demand).
export function pickChatModel(row) {
  const id = row?.models?.[0] || null;
  return { id, load: !!(id && Array.isArray(row.loaded) && !row.loaded.includes(id)) };
}

// What an engine said when it refused a request, short enough for one or two lines
export function engineErrorText(status, body) {
  let msg = '';
  try {
    const d = JSON.parse(body);
    const e = d?.error;
    msg = (typeof e === 'string' ? e : e?.message) || d?.message || d?.detail || '';
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
  } catch {
    msg = String(body || '');
  }
  msg = msg.replace(/\s+/g, ' ').trim();
  if (!msg) return status ? `HTTP ${status}` : '';
  return msg.length > 200 ? `${msg.slice(0, 199)}…` : msg;
}

// → { up, models (chat only), loaded (ids, or null when the engine doesn't say), skipped }.
// lmstudio: ask /api/v0/models first (type + state), /v1/models if that isn't there.
export async function probeEngine(url, timeoutMs = 1500, { lmstudio = false } = {}) {
  if (lmstudio) {
    try {
      const res = await fetch(`${url.replace(/\/v1$/, '')}/api/v0/models`, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) return { up: true, ...lmStudioModels(data) };
      }
    } catch { /* not LM Studio, or an old one: /v1/models */ }
  }
  try {
    const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { up: false, status: res.status };
    const data = await res.json();
    return { up: true, ...chatModels((data.data || []).map((m) => m.id)) };
  } catch {
    return { up: false };
  }
}

// llama-server answers /health 503 "Loading model" while it loads: that's "cargando", not "caído"
export async function engineHealth(url) {
  const base = url.replace(/\/v1$/, '');
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.status === 503) return 'loading';
    if (res.ok) return 'up';
  } catch { /* fall through to /models */ }
  return (await probeEngine(url)).up ? 'up' : 'down';
}

export async function detectEngines() {
  const found = [];
  for (const e of ENGINES) {
    if (found.some((f) => f.id === e.id && f.up)) continue;
    const r = await probeEngine(e.url, 1500, { lmstudio: e.id === 'lmstudio' });
    found.push({ ...e, up: r.up, models: r.models || [], loaded: r.loaded ?? null, skipped: r.skipped || 0 });
  }
  // One row per engine: the port that answered, else the first
  const byId = {};
  for (const f of found) if (!byId[f.id] || (f.up && !byId[f.id].up)) byId[f.id] = f;
  return Object.values(byId);
}
