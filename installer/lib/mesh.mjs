// Pools run on mesh-llm (github.com/Mesh-LLM/mesh-llm, Apache-2.0): QUIC between the machines, encrypted,
// through NAT, each machine downloads only its own layers, and the same OpenAI API on every node.
// LLMule drives the released `mesh-llm` binary (pinned + sha256, lib/engine.mjs) as a child process:
//   serve --log-format json  → events on stdout (invite token, peers, stages)
//   GET :<console>/api/status → node id, token, peers (rtt), runtime.stages (who has which layers, ready?)
// Not the npm SDK (@mesh-llm/sdk 0.79.0): 378 MB unpacked, native addons per OS — too big to embed in a
// `deno compile` binary, and it wasn't tried under Deno (DESIGN.md §12).
//
// mesh-llm keeps its keys, logs and model cache under $HOME/.mesh-llm and the HF cache: on Mac/Linux we give
// it HOME=~/.llmule/mesh-home so all of that lives in one folder LLMule can remove. (Windows: its own
// %LOCALAPPDATA% paths, untouched [A].) Analytics are turned off before EVERY start (cheap, and safe if HOME moved).
//
// Who may connect (0.2.1, audit 2026-11-16): each machine has its own mesh-llm owner key (~/.llmule/mesh-owner-key.json,
// 0600, made on first pool use). Every start passes --owner-key + --owner-required + --trust-policy allowlist +
// --trust-owner <id> for each pool member (the list comes from mulePools, members only). A node signed by any other
// owner is refused at the door: the invite token alone no longer lets anyone in, nor run inference through
// TUNNEL_HTTP. The list is read at start, so pool-run restarts the node when it changes. After start we check
// /api/status: owner verified (ours) and publication "private", or we stop.
// Never passed: --listen-all (API/console stay on 127.0.0.1), --publish / --nostr-discovery (no public mesh),
// --auto-update. --bind-ip only for tests (on loopback everything goes by relay, and IPv6 [::] stays open anyway).
//
// Env for tests (two nodes on one machine): LLMULE_MESH_PORT (9337), LLMULE_MESH_CONSOLE (3131),
// LLMULE_MESH_BIND_PORT (UDP for QUIC), LLMULE_MESH_BIND_IP, LLMULE_MESH_MAX_VRAM (GB), LLMULE_MESH_CTX (16384).

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { P } from './paths.mjs';
import { MESH_TAG, meshAsset } from './engine.mjs';
import { download, unpack, findFile } from './fetchfile.mjs';
import { killStale, writePid } from './pidfile.mjs';

export const MESH_PORT = Number(process.env.LLMULE_MESH_PORT) || 9337;
export const MESH_CONSOLE = Number(process.env.LLMULE_MESH_CONSOLE) || 3131;

const meshEnv = () => (process.platform === 'win32' ? { ...process.env } : { ...process.env, HOME: P.meshHome });

const execMesh = (bin, args) => new Promise((resolve, reject) => {
  execFile(bin, args, { env: meshEnv(), timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
    if (err) reject(Object.assign(new Error(`mesh-llm ${args.slice(0, 2).join(' ')}: ${String(stderr || err.message).trim().slice(0, 200)}`), { code: 'mesh_cmd' }));
    else resolve(`${stdout}\n${stderr}`); // `auth` prints to stderr, `analytics` to stdout
  });
});

// An owner id: the hex of an ed25519 public key (64 chars)
export const isOwnerId = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const parseOwnerId = (text) => (/Owner ID:\s+([0-9a-f]{64})/.exec(String(text || '')) || [])[1] || '';

// Before every start: analytics off, and this machine's owner key (created once, 0600) → its owner id
export async function meshIdentity(bin) {
  fs.mkdirSync(P.meshHome, { recursive: true });
  const off = await execMesh(bin, ['analytics', 'disable']);
  if (!/disabled/i.test(off)) throw new Error(`mesh-llm analytics disable: unexpected answer: ${off.trim().slice(0, 120)}`);
  if (!fs.existsSync(P.meshOwnerKey)) {
    // --no-passphrase: no prompt and no OS keychain (headless Linux has none); the file is the secret
    await execMesh(bin, ['auth', 'init', '--owner-key', P.meshOwnerKey, '--no-passphrase']);
  }
  try { fs.chmodSync(P.meshOwnerKey, 0o600); } catch { /* Windows: per-user folder */ }
  const id = parseOwnerId(await execMesh(bin, ['auth', 'status', '--owner-key', P.meshOwnerKey]));
  if (!id) throw new Error('mesh-llm auth status: no Owner ID');
  return id;
}

export function installedMesh() {
  return findFile(path.join(P.mesh, MESH_TAG), 'mesh-llm');
}

// → { bin }. onProgress like download(), plus { step: 'unpack' }
export async function installMesh(machine, onProgress = () => {}) {
  const have = installedMesh();
  if (have) return { bin: have, already: true };
  const asset = meshAsset(machine);
  if (!asset) throw Object.assign(new Error('mesh-llm has no build for this machine'), { code: 'no_build' });
  const dir = path.join(P.mesh, MESH_TAG);
  for (const f of asset.files) {
    const file = await download({ url: f.url, dest: path.join(P.downloads, f.name), bytes: f.bytes, sha256: f.sha256, onProgress: (p) => onProgress({ ...p, file: f.name }) });
    onProgress({ step: 'unpack', file: f.name });
    await unpack(file, dir);
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.sha256`, { force: true });
  }
  const bin = findFile(dir, 'mesh-llm');
  if (!bin) throw new Error('mesh-llm not found in the archive');
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  await meshIdentity(bin); // analytics off before anything else runs + this machine's owner key
  return { bin };
}

// One line of `--log-format json` → an event, or null
export function parseMeshLine(line) {
  let d;
  try { d = JSON.parse(line); } catch { return null; }
  const msg = String(d.message || '');
  if (d.event === 'invite_token' && d.token) return { type: 'token', token: d.token, meshId: d.mesh_id };
  if (d.event === 'api_ready') return { type: 'api', url: d.url };
  if (d.event === 'discovery_joined') return { type: 'joined' };
  if (d.event === 'waiting_for_peers') return { type: 'waiting-peers' };
  let m;
  if ((m = /Peer (\w+) RTT(?: recheck)?: (\d+)ms \((\w+)\)/.exec(msg))) return { type: 'rtt', peer: m[1], ms: Number(m[2]), path: m[3] };
  if (/split_capacity_shortfall/.test(msg)) return { type: 'shortfall', text: msg.slice(0, 200) };
  if (/stage_ready/.test(msg)) return { type: 'stage-ready' };
  if (d.event === 'request_failed') return { type: 'request-failed', text: msg.slice(0, 160) };
  if (d.level === 'error' || d.level === 'fatal') return { type: 'error', text: msg.slice(0, 200) };
  return null;
}

// Short view of /api/status for the screens and the coordinator
export function readStatus(d) {
  const stages = ((d.runtime && d.runtime.stages) || []).map((s) => ({
    node: String(s.node_id || '').slice(0, 10), start: s.layer_start, end: s.layer_end, state: s.state, cert: s.split_certification,
  }));
  return {
    nodeId: String(d.node_id || '').slice(0, 10),
    token: d.token || '',
    meshId: d.mesh_id || '',
    peers: (d.peers || []).map((p) => ({ id: String(p.id || '').slice(0, 10), rtt: p.rtt_ms ?? null, name: p.hostname || p.name || '' })),
    stages,
    ready: stages.length > 0 ? stages.every((s) => s.state === 'ready') : !!d.llama_ready,
    model: (d.serving_models || [])[0] || d.model_name || '',
    vramGB: d.my_vram_gb ?? null,
    ownerId: (d.owner && d.owner.owner_id) || '',
    ownerVerified: !!(d.owner && d.owner.verified === true),
    ownerStatus: (d.owner && d.owner.status) || 'missing',
    publication: d.publication_state || 'unknown',
    nostr: d.nostr_discovery === true,
  };
}

// Is this node what LLMule asked for: signed by our owner key, private mesh? → '' or why not
export function privateProblem(st, ownerId) {
  if (!st.ownerVerified) return `owner ${st.ownerStatus}`;
  if (st.ownerId !== ownerId) return 'owner distinto';
  if (st.publication !== 'private' || st.nostr) return `mesh ${st.publication}${st.nostr ? ' (nostr)' : ''}`;
  return '';
}

// Bytes in mesh-llm's model cache (the layers it downloaded so far)
export function cacheBytes() {
  const roots = [path.join(P.meshHome, 'Library', 'Caches', 'huggingface'), path.join(P.meshHome, '.cache', 'huggingface')];
  let total = 0;
  const walk = (d) => {
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* moving */ } }
    }
  };
  roots.forEach(walk);
  return total;
}

// The serve arguments. trustOwners: the pool members' owner ids (ours included) — nobody else gets in.
export function meshArgs(cfg) {
  const owners = [...new Set(cfg.trustOwners || [])].filter(isOwnerId);
  if (!owners.length) throw new Error('mesh-llm: no trusted owners');
  const args = ['--log-format', 'json', 'serve', '--model', cfg.ref, '--split', '--headless',
    '--name', cfg.name || 'llmule', '--port', String(MESH_PORT), '--console', String(MESH_CONSOLE),
    '--ctx-size', String(Number(process.env.LLMULE_MESH_CTX) || 16384),
    '--owner-key', cfg.ownerKey || P.meshOwnerKey, '--owner-required', '--trust-policy', 'allowlist',
    ...owners.flatMap((o) => ['--trust-owner', o])];
  if (cfg.joinFile) args.push('--join-file', cfg.joinFile);
  if (process.env.LLMULE_MESH_BIND_PORT) args.push('--bind-port', process.env.LLMULE_MESH_BIND_PORT);
  if (process.env.LLMULE_MESH_BIND_IP) args.push('--bind-ip', process.env.LLMULE_MESH_BIND_IP);
  if (process.env.LLMULE_MESH_MAX_VRAM) args.push('--max-vram', process.env.LLMULE_MESH_MAX_VRAM);
  return args;
}

// cfg: { bin, ref, name, joinFile?, trustOwners } → { stop(), status(), api, consoleUrl, ownerId }
export async function startMesh(cfg, onEvent = () => {}) {
  const ownerId = await meshIdentity(cfg.bin); // analytics off + our key, every time
  const args = meshArgs({ ...cfg, trustOwners: [...(cfg.trustOwners || []), ownerId] });
  killStale('mesh-llm', cfg.bin);
  const child = spawn(cfg.bin, args, { env: meshEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  writePid('mesh-llm', child.pid);
  const logFile = fs.openSync(path.join(P.home, 'mesh.log'), 'a');
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    fs.writeSync(logFile, d);
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const e = parseMeshLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (e) onEvent(e);
    }
  });
  child.stderr.on('data', (d) => fs.writeSync(logFile, d));
  child.on('exit', (code) => { onEvent({ type: 'exit', code }); try { fs.closeSync(logFile); } catch { /* closed */ } });
  const consoleUrl = `http://127.0.0.1:${MESH_CONSOLE}`;
  return {
    api: `http://127.0.0.1:${MESH_PORT}/v1`,
    consoleUrl,
    pid: child.pid,
    ownerId,
    async status() {
      const r = await fetch(`${consoleUrl}/api/status`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(`status ${r.status}`);
      return readStatus(await r.json());
    },
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM'); // it leaves the mesh cleanly (verified: exits in ~3 s, plugins too)
      setTimeout(() => child.kill('SIGKILL'), 8000).unref();
    }),
  };
}
