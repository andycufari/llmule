#!/usr/bin/env node
// LLMule provider — share a local model on the LLMule network. Node 18+, no dependencies.
//
//   node mule-provider.mjs setup     ← first time: finds your local server, you pick the models
//   node mule-provider.mjs           ← share
//
// It asks llmule.xyz for work (long poll, outbound only: works behind any NAT), runs each job
// against a local OpenAI-compatible server (Ollama by default) and sends the answer back.
//
// Setup saves ~/.llmule/provider.json (only you can read it). Env vars override it:
//   LLMULE_KEY    your API key (required)
//   LLMULE_API    default https://llmule.xyz
//   UPSTREAM      local OpenAI-compatible base URL. Default http://localhost:11434/v1 (Ollama)
//   UPSTREAM_KEY  bearer for the upstream, if it needs one
//   MODELS        what to share. Default: every model the upstream lists.
//                 "public=local" renames: MODELS="qwen3.6-27b=hyperqwen,llama3.2"
//   EXTRA_BODY    JSON merged into every upstream request, e.g. '{"chat_template_kwargs":{"enable_thinking":false}}'
//   NAME          how this machine shows up. Default: hostname
//   MAX_TOKENS    cap on max_tokens per request. Default 4096
//   ROOT_MATCH    text the upstream's model "root" must contain (vLLM reports the weights path), e.g.
//                 "Qwen3.8-27B". If your server swaps models behind the same name, this keeps you honest.
//   FOLLOW        local model id whose weights change (a "brain" that serves whatever preset is loaded
//                 under one id). The public name comes from the weights (vLLM's "root": .../Qwen3.8-27B-W4A16
//                 → "qwen3.8-27b") and follows every swap — no restart. Replaces MODELS and ROOT_MATCH.
//
// While the upstream is down — or serving something else — this goes offline instead of failing jobs.
//
// What a job can make this script do: ONE POST to UPSTREAM/chat/completions, for a model you
// listed, with only the fields below. It opens no port, runs no tools, writes no files. The
// request is rebuilt here — nothing the network sends is trusted as-is, not even from llmule.xyz.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const CONFIG_PATH = process.env.LLMULE_CONFIG || path.join(os.homedir(), '.llmule', 'provider.json');
const CFG = (() => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
})();
const conf = (k, fallback) => process.env[k] ?? CFG[k] ?? fallback;

const KEY = conf('LLMULE_KEY');
const API = conf('LLMULE_API', 'https://llmule.xyz').replace(/\/$/, '');
const UPSTREAM = conf('UPSTREAM', 'http://localhost:11434/v1').replace(/\/$/, '');
const UPSTREAM_KEY = conf('UPSTREAM_KEY', '');
const EXTRA_BODY = (() => {
  const v = conf('EXTRA_BODY', {});
  return typeof v === 'string' ? JSON.parse(v) : v;
})();
const NAME = conf('NAME', os.hostname());
const INSTANCE = crypto.randomBytes(12).toString('hex');
const UPSTREAM_TIMEOUT_MS = 55000; // the consumer gives up at 50s anyway
const MAX_TOKENS = Number(conf('MAX_TOKENS')) || 4096;
const MAX_REQUEST_BYTES = 1_000_000;
const ROOT_MATCH = conf('ROOT_MATCH', '');
const FOLLOW = conf('FOLLOW', '');
// Plain OpenAI fields. Server-specific knobs stay out: vLLM's chat_template (Jinja), Ollama's
// options/keep_alive (num_ctx, num_gpu…) — a job must not reconfigure your server.
const FIELDS = ['messages', 'temperature', 'top_p', 'max_tokens', 'stop', 'seed', 'presence_penalty',
  'frequency_penalty', 'response_format', 'tools', 'tool_choice'];

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const upstreamHeaders = { 'Content-Type': 'application/json', ...(UPSTREAM_KEY && { Authorization: `Bearer ${UPSTREAM_KEY}` }) };

async function resolveModels() {
  if (FOLLOW) return {}; // filled from the upstream on every loop
  // public name → local name
  const list = conf('MODELS');
  if (list) {
    return Object.fromEntries(list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [pub, local] = s.split('=');
      return [pub, local || pub];
    }));
  }
  const res = await fetch(`${UPSTREAM}/models`, { headers: upstreamHeaders });
  if (!res.ok) throw new Error(`upstream /models → ${res.status}`);
  const { data } = await res.json();
  return Object.fromEntries(data.map((m) => [m.id, m.id]));
}

// Every local model answers in the upstream's /models (Ollama adds ":latest"), and is what ROOT_MATCH says
export function upstreamServes(data, models, rootMatch = ROOT_MATCH) {
  return Object.values(models).every((local) => (data || []).some((m) =>
    (m.id === local || m.id === `${local}:latest`) && (!rootMatch || String(m.root || '').includes(rootMatch))));
}

// Weights path → public name: last segment, minus quantization and format noise
// ".../Qwen3.8-27B-W4A16-AutoRound-fast" → "qwen3.8-27b", "Llama-3.3-70B-Instruct-Q4_K_M.gguf" → "llama-3.3-70b-instruct"
const NOISE = /^(w\d+a\d+|autoround|fast|gguf|awq|gptq|fp8|fp16|bf16|f16|int4|int8|nf4|q\d.*|iq\d.*|mlx|\d+bit|exl2|dflash\d*)$/;
export function publicName(root) {
  const last = String(root || '').split('/').filter(Boolean).pop() || '';
  const parts = last.replace(/\.gguf$/i, '').toLowerCase().split('-');
  while (parts.length > 1 && NOISE.test(parts[parts.length - 1])) parts.pop();
  return parts.join('-').replace(/[^a-z0-9._-]/g, '').slice(0, 64);
}

// With FOLLOW: share that id under the name of whatever weights it has right now
export function followModels(data, follow) {
  const m = (data || []).find((x) => x.id === follow);
  const name = m && publicName(m.root || m.id);
  return name ? { [name]: follow } : {};
}

async function upstreamList() {
  try {
    const res = await fetch(`${UPSTREAM}/models`, { headers: upstreamHeaders, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()).data || null;
  } catch {
    return null;
  }
}

async function mule(path, body, timeoutMs) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
    ...(timeoutMs && { signal: AbortSignal.timeout(timeoutMs) }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // An HTML page here means a wrong path or a site problem — never treat it as "no job"
    throw new Error(`${path} → ${res.status}, not JSON: ${text.slice(0, 80)}`);
  }
  if (!res.ok) throw new Error(`${path} → ${res.status} ${data.error?.message || ''}`);
  return data;
}

// The upstream body, built from scratch. Throws if the job asks for something we don't serve.
export function buildBody(request, models, extra = EXTRA_BODY, maxTokens = MAX_TOKENS) {
  if (!request || typeof request !== 'object') throw new Error('bad request');
  if (JSON.stringify(request).length > MAX_REQUEST_BYTES) throw new Error('request too large');
  if (!Object.hasOwn(models, request.model)) throw new Error('model not shared here');
  if (!Array.isArray(request.messages) || !request.messages.length) throw new Error('messages missing');
  const body = {};
  for (const k of FIELDS) if (request[k] !== undefined) body[k] = request[k];
  const asked = Number(body.max_tokens);
  body.max_tokens = asked > 0 ? Math.min(asked, maxTokens) : maxTokens;
  return { ...body, ...extra, model: models[request.model], stream: false };
}

async function run(job, models) {
  const t = Date.now();
  try {
    const body = buildBody(job.request, models);
    const res = await fetch(`${UPSTREAM}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Full detail stays in your log; the network only learns the status (no local paths or versions)
      log(`job ${job.id} upstream ${res.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
      throw new Error(`upstream error ${res.status}`);
    }
    const r = await mule('/api/muleProviderResult', { instance: INSTANCE, jobId: job.id, response: data });
    log(`job ${job.id} ${body.model} ${Date.now() - t}ms ${data.usage?.completion_tokens ?? '?'} tok${r.late ? ' (too late, consumer gave up)' : ''}`);
  } catch (e) {
    log(`job ${job.id} failed: ${e.message}`);
    const error = e.name === 'TimeoutError' ? 'upstream timeout' : e.message.slice(0, 120);
    await mule('/api/muleProviderResult', { instance: INSTANCE, jobId: job.id, error }).catch(() => {});
  }
}

// Stopping (systemctl stop, docker restart, Ctrl+C): tell the network before leaving. Our last long poll is
// still open on the server and would otherwise take the next job for a process that no longer exists
// (the consumer got a 504 after 50s). The server stops offering us jobs and re-queues one we held.
let leaving = false;
async function goodbye(signal) {
  if (leaving) return;
  leaving = true;
  log(`${signal} — leaving the network`);
  try {
    await mule('/api/muleProviderPoll', { instance: INSTANCE, bye: true }, 3000);
  } catch (e) {
    log(`could not say goodbye: ${e.message}`);
  }
  process.exit(0);
}

async function main() {
  if (!KEY) {
    console.error('No LLMule key. Run: node mule-provider.mjs setup');
    process.exit(1);
  }
  process.on('SIGTERM', () => goodbye('SIGTERM'));
  process.on('SIGINT', () => goodbye('SIGINT'));
  let models = await resolveModels();
  log(`sharing ${FOLLOW ? `whatever "${FOLLOW}" runs` : Object.keys(models).join(', ')} from ${UPSTREAM} as "${NAME}" → ${API}`);
  let backoff = 1000;
  let ready = null;
  let shown = '';
  for (;;) {
    // Not polling = the network stops listing us within 30s
    const list = await upstreamList();
    if (FOLLOW) models = followModels(list, FOLLOW);
    const now = Object.keys(models).length > 0 && upstreamServes(list, models);
    const names = Object.keys(models).join(', ');
    if (now !== ready || (now && names !== shown)) {
      log(now ? `online — sharing ${names}` : `upstream down or not serving ${FOLLOW || Object.values(models).join(', ')}${ROOT_MATCH ? ` (${ROOT_MATCH})` : ''} — offline`);
    }
    ready = now;
    shown = now ? names : '';
    if (!ready) {
      await sleep(15000);
      continue;
    }
    try {
      const t = Date.now();
      const data = await mule('/api/muleProviderPoll', { instance: INSTANCE, name: NAME, models: Object.keys(models) });
      if (!('job' in data)) throw new Error(`poll answered without "job": ${JSON.stringify(data).slice(0, 80)}`);
      backoff = 1000;
      if (data.job) await run(data.job, models);
      // The server holds an empty poll ~20s. Coming back much faster means something is off: never spin
      else if (Date.now() - t < 1000) await sleep(1000);
    } catch (e) {
      log(`poll failed: ${e.message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}

// ---------- setup: the configurator ----------

// The usual local servers and where they listen
const KNOWN_SERVERS = [
  ['Ollama', 'http://localhost:11434/v1'],
  ['LM Studio', 'http://localhost:1234/v1'],
  ['llama.cpp', 'http://localhost:8080/v1'],
  ['vLLM', 'http://localhost:8000/v1'],
  ['Jan', 'http://localhost:1337/v1'],
  ['KoboldCpp', 'http://localhost:5001/v1'],
];

async function probe(url, key) {
  try {
    const res = await fetch(`${url}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(1500),
    });
    if (res.status === 401 || res.status === 403) return { auth: true };
    if (!res.ok) return null;
    const { data } = await res.json();
    return { models: (data || []).map((m) => m.id).filter(Boolean) };
  } catch {
    return null;
  }
}

// "1,3" → [0, 2]; empty → all
export function pickIndexes(answer, count) {
  if (!answer.trim()) return [...Array(count).keys()];
  const picked = answer.split(/[\s,]+/).filter(Boolean).map((n) => Number(n) - 1);
  if (!picked.length || picked.some((i) => !Number.isInteger(i) || i < 0 || i >= count)) return null;
  return [...new Set(picked)];
}

async function setup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = '') => (await rl.question(def ? `${q} [${def}] ` : `${q} `)).trim() || def;
  const cfg = { ...CFG };

  console.log(`\nLLMule provider — share your local models with people who don't have a GPU.\n`);

  // 1. Key
  console.log('1/4  Your LLMule key — log in at https://llmule.xyz to see it.');
  for (;;) {
    const shown = cfg.LLMULE_KEY ? `${cfg.LLMULE_KEY.slice(0, 8)}…` : '';
    const typed = await ask('     Paste it:', shown);
    const key = typed === shown ? cfg.LLMULE_KEY : typed;
    const res = await fetch(`${API}/v1/models`, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
    if (res && res.ok) {
      cfg.LLMULE_KEY = key;
      console.log('     ✓ key works\n');
      break;
    }
    console.log(res ? '     ✗ llmule.xyz didn\'t accept that key, try again' : `     ✗ can't reach ${API} — check your connection`);
  }

  // 2. Local server
  console.log('2/4  Looking for a local model server…');
  const found = [];
  for (const [name, url] of KNOWN_SERVERS) {
    const r = await probe(url);
    if (r && r.models) found.push({ name, url, models: r.models });
  }
  found.forEach((f, i) => console.log(`     [${i + 1}] ${f.name} — ${f.models.length} model(s) at ${f.url}`));
  if (!found.length) console.log('     none on the usual ports.');
  let server;
  for (;;) {
    const a = await ask(`     Pick one${found.length ? ' or' : ':'} paste another URL (OpenAI-compatible, ends in /v1)${found.length ? ':' : ''}`, found.length ? '1' : '');
    if (/^\d+$/.test(a) && found[Number(a) - 1]) {
      server = found[Number(a) - 1];
      break;
    }
    if (/^https?:\/\//.test(a)) {
      const url = a.replace(/\/$/, '');
      let r = await probe(url);
      let key = '';
      if (r && r.auth) {
        key = await ask('     That server wants a key:');
        r = await probe(url, key);
      }
      if (r && r.models) {
        server = { name: url, url, models: r.models, key };
        break;
      }
      console.log(`     ✗ no OpenAI-compatible /models at ${url}`);
    }
  }
  if (!server.models.length) {
    console.log(`     ${server.name} is up but has no models loaded. Load one and run setup again.`);
    rl.close();
    process.exit(1);
  }
  cfg.UPSTREAM = server.url;
  if (server.key) cfg.UPSTREAM_KEY = server.key;
  else delete cfg.UPSTREAM_KEY;
  console.log('');

  // 3. Models
  console.log('3/4  Which models do you want to share?');
  server.models.forEach((m, i) => console.log(`     [${i + 1}] ${m}`));
  let picked;
  while (!(picked = pickIndexes(await ask('     Numbers separated by commas, Enter for all:'), server.models.length))) {
    console.log('     ✗ use the numbers from the list');
  }
  // Ollama's ":latest" is noise in a public name
  cfg.MODELS = picked.map((i) => {
    const local = server.models[i];
    const pub = local.replace(/:latest$/, '');
    return pub === local ? local : `${pub}=${local}`;
  }).join(',');
  console.log('');

  // 4. Name
  cfg.NAME = await ask('4/4  Name for this machine on the network:', cfg.NAME || os.hostname());

  // Try one model before saying it works
  const first = server.models[picked[0]];
  process.stdout.write(`\n     Testing ${first}… `);
  const t = Date.now();
  try {
    const res = await fetch(`${server.url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(server.key && { Authorization: `Bearer ${server.key}` }) },
      body: JSON.stringify({ model: first, messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 5, stream: false }),
      signal: AbortSignal.timeout(120000), // first load can be slow
    });
    console.log(res.ok ? `✓ answered in ${((Date.now() - t) / 1000).toFixed(1)}s` : `✗ ${res.status} — check it in ${server.name}`);
  } catch (e) {
    console.log(`✗ ${e.name === 'TimeoutError' ? 'no answer in 2 min' : e.message}`);
  }

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(CONFIG_PATH, 0o600);
  console.log(`\n     Saved ${CONFIG_PATH} (only you can read it).`);
  console.log(`
     What sharing does: this asks llmule.xyz for work and sends each request to ${server.name}.
     It opens no port, runs no tools, writes no files, and only uses the models you picked.
     People's prompts reach your machine without their name, email or IP.
`);
  const go = (await ask('     Start sharing now? (Y/n)', 'y')).toLowerCase();
  rl.close();
  if (go.startsWith('n')) {
    console.log(`     Later: node ${path.basename(process.argv[1])}\n`);
    return;
  }
  // Fresh process so it reads the saved config
  spawn(process.execPath, [process.argv[1]], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0));
}

// The test imports buildBody with LLMULE_NO_MAIN=1: don't start polling
if (!process.env.LLMULE_NO_MAIN) {
  const wantsSetup = process.argv[2] === 'setup' || (!KEY && process.stdin.isTTY);
  (wantsSetup ? setup() : main()).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
