// Dev only: a pool for real with two mesh-llm nodes on THIS machine, coordinated by a local fake
// llmule.xyz (tools/fake-site.mjs). Real mesh-llm (pinned + sha256), a real split of a tiny model
// (llama-3.2-1b-test, ~1 GB), the head publishing pool/<model> through the real provider, a chat through
// the fake site, tokens credited by layer share, then the worker dropping.
// Security (0.2.1): both nodes must report owner-verified + private; an outsider node signed by ANOTHER owner key
// tries to join with the head's real invite token and must be refused (0 peers on its side, not among the head's
// peers, no inference through it); at the end the worker leaves and the head restarts without its owner id.
// mesh-llm analytics are off in every node's HOME before its first start (lib/mesh.mjs meshIdentity; the outsider
// here gets `analytics disable` before anything else).
//
//   node tools/e2e-pool.mjs --scratch <dir> [--api http://127.0.0.1:8787]
//   node tools/e2e-pool.mjs --node head|worker ...   (internal: one node, spawned by the above)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const api = arg('api', 'http://127.0.0.1:8787');
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, body, key) => {
  const r = await fetch(api + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) }, body: JSON.stringify(body) });
  return r.json();
};

// ---------- one node (child process) ----------
if (arg('node')) {
  process.stdout.on('error', () => {}); // the orchestrator may be gone: keep the node alive, it logs to a file too
  const flog = fs.createWriteStream(path.join(process.env.LLMULE_HOME, 'node.log'), { flags: 'a' });
  const out = console.log;
  console.log = (...a) => { flog.write(a.join(' ') + '\n'); try { out(...a); } catch { /* pipe closed */ } };
  const { realEffects } = await import('../lib/effects-real.mjs');
  const fx = realEffects({ api });
  const machine = await fx.detectMachine();
  const cfg = JSON.parse(fs.readFileSync(arg('cfg'), 'utf8'));
  const run = fx.startPoolRun({ key: cfg.key, pool: cfg.pool, role: cfg.role, machine, nick: cfg.nick }, (k, t) => console.log(`log ${k}: ${t}`));
  let last = '';
  const tick = setInterval(() => {
    const s = run.state;
    const line = `phase=${s.phase} role=${s.role} peers=${s.peers?.length || 0} rtt=${s.rtt ?? '-'}${s.path ? `(${s.path})` : ''} stages=${JSON.stringify((s.status?.stages || []).map((x) => [x.node, x.start, x.end, x.state]))} dl=${Math.round((s.downloaded || 0) / 1e6)}MB provider=${s.providerOn}${s.install && s.install.step !== 'done' ? ` install=${s.install.step}:${Math.round((s.install.frac || 0) * 100)}%` : ''}${s.error ? ` error=${s.error}` : ''}`;
    if (line !== last) { last = line; console.log('state', line); }
  }, 1000);
  const bye = async () => { clearInterval(tick); await run.stop(); process.exit(0); };
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
  await new Promise(() => {});
}

// ---------- the orchestrator ----------
const scratch = path.resolve(arg('scratch', ''));
if (!arg('scratch')) { console.error('--scratch <dir> is required'); process.exit(1); }
const me = fileURLToPath(import.meta.url);
const head = await post('/__user', { email: 'e2e-head@example.com', nick: 'e2ehead' });
const worker = await post('/__user', { email: 'e2e-worker@example.com', nick: 'e2eworker' });
const consumer = await post('/__user', { email: 'e2e-poolconsumer@example.com', nick: 'e2epoolc' });
const node = { gb: 3, gpu: 'Apple M1 Pro', os: 'macOS' };

const created = await post('/api/mulePools', { op: 'create', model: 'llama-3.2-1b-test', node }, head.apiKey);
assert.equal(created.role, 'head', JSON.stringify(created));
const code = (await post('/api/mulePools', { op: 'invite', id: created.pool.id }, head.apiKey)).code;
const joined = await post('/api/mulePools', { op: 'join', code, node }, worker.apiKey);
assert.equal(joined.role, 'worker');
say('pool', created.pool.id, 'invite', code, '→ worker joined');

const nodes = {};
const startNode = (role, user, ports) => {
  const home = path.join(scratch, `pool-${role}`);
  fs.mkdirSync(home, { recursive: true });
  const cfg = path.join(home, 'e2e.json');
  fs.writeFileSync(cfg, JSON.stringify({ key: user.apiKey, nick: user.nick, role, pool: created.pool }));
  const env = { ...process.env, LLMULE_HOME: home, LLMULE_MESH_PORT: ports[0], LLMULE_MESH_CONSOLE: ports[1], LLMULE_MESH_BIND_PORT: ports[2], LLMULE_MESH_BIND_IP: '127.0.0.1', LLMULE_MESH_MAX_VRAM: '3', LLMULE_MESH_CTX: '4096' };
  const child = spawn(process.execPath, [me, '--node', role, '--cfg', cfg, '--api', api], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(scratch, `${role}.log`));
  const pre = role.padEnd(6);
  for (const s of [child.stdout, child.stderr]) {
    let buf = '';
    s.setEncoding('utf8');
    s.on('data', (d) => {
      log.write(d);
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (/^(state|log)/.test(l) || /Error/.test(l)) say(pre, l.slice(0, 230)); }
    });
  }
  nodes[role] = child;
  return child;
};

startNode('head', head, ['9447', '3232', '7842']);
startNode('worker', worker, ['9448', '3233', '7843']);

// Children never outlive this script
const killAll = () => Object.values(nodes).forEach((c) => { try { c.kill('SIGTERM'); } catch { /* gone */ } });
process.on('exit', killAll);
process.on('uncaughtException', (e) => { console.error(e); killAll(); setTimeout(() => process.exit(1), 9000); });

// Wait for the split + the head's provider on the fake site
const until = async (what, fn, ms) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await sleep(3000);
  }
};
const view = async () => (await post('/api/mulePools', { op: 'get', id: created.pool.id }, head.apiKey)).pool;
const running = await until('pool running with 2 stages', async () => { const p = await view(); return p.state === 'running' && p.machines.filter((m) => m.from !== null).length === 2 ? p : null; }, 20 * 60 * 1000);
say('RUNNING:', running.machines.map((m) => `${m.nick} ${m.from}–${m.to}${m.head ? ' (cabeza)' : ''}`).join(' · '));
const online = await until('pool/ model online', async () => {
  const m = await (await fetch(`${api}/v1/models`, { headers: { Authorization: `Bearer ${consumer.apiKey}` } })).json();
  return (m.data || []).some((x) => x.id === 'pool/llama-3.2-1b-test');
}, 3 * 60 * 1000);
assert.ok(online);

const before = { h: (await post('/api/muleWhoami', {}, head.apiKey)).tokServed, w: (await post('/api/muleWhoami', {}, worker.apiKey)).tokServed };
const t = Date.now();
const chat = await post('/v1/chat/completions', { model: 'pool/llama-3.2-1b-test', messages: [{ role: 'user', content: 'What is a mule? Two lines.' }], max_tokens: 60 }, consumer.apiKey);
assert.ok(chat.choices?.[0]?.message?.content, JSON.stringify(chat).slice(0, 300));
say(`CHAT via pool (${Date.now() - t} ms):`, chat.choices[0].message.content.slice(0, 120).replace(/\n/g, ' '), JSON.stringify(chat.usage));
await sleep(500);
const after = { h: (await post('/api/muleWhoami', {}, head.apiKey)).tokServed, w: (await post('/api/muleWhoami', {}, worker.apiKey)).tokServed };
const p2 = await view();
say(`CREDIT head +${after.h - before.h} · worker +${after.w - before.w} (of ${chat.usage.completion_tokens}) · pool today ${p2.tokToday}`);
assert.ok(after.h - before.h + after.w - before.w > 0);

// ---------- security: what each node reports, and an outsider with the real token ----------
const status = async (consolePort) => (await fetch(`http://127.0.0.1:${consolePort}/api/status`, { signal: AbortSignal.timeout(3000) })).json();
const sh = await status(3232);
const sw = await status(3233);
for (const [who, st] of [['head', sh], ['worker', sw]]) {
  assert.equal(st.owner?.verified, true, `${who} owner verified`);
  assert.equal(st.publication_state, 'private', `${who} private`);
  assert.equal(st.nostr_discovery, false, `${who} no nostr`);
}
assert.notEqual(sh.owner.owner_id, sw.owner.owner_id, 'one owner key per machine');
const siteNodes = await (await fetch(`${api}/__db?t=mule_pool_nodes`)).json();
assert.deepEqual(siteNodes.filter((n) => !n.leftMs).map((n) => n.meshOwnerId).sort(), [sh.owner.owner_id, sw.owner.owner_id].sort());
say('OWNERS: head', sh.owner.owner_id.slice(0, 12), '· worker', sw.owner.owner_id.slice(0, 12), '· both verified + private');
for (const role of ['head', 'worker']) {
  const keyFile = path.join(scratch, `pool-${role}`, 'mesh-owner-key.json');
  assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600, `${role} owner key 0600`);
  const cfgToml = fs.readFileSync(path.join(scratch, `pool-${role}`, 'mesh-home', '.mesh-llm', 'config.toml'), 'utf8');
  assert.match(cfgToml, /\[analytics\]\s*\n\s*enabled\s*=\s*false/, `${role} analytics off`);
}

// The outsider: its own owner key, default trust policy (it would accept anyone), the head's real token
const findBin = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { const f = findBin(p); if (f) return f; } else if (e.name === 'mesh-llm' || e.name === 'mesh-llm.exe') return p;
  }
  return null;
};
const meshBin = findBin(path.join(scratch, 'pool-head', 'mesh'));
const outHome = path.join(scratch, 'pool-outsider');
fs.mkdirSync(outHome, { recursive: true });
const outEnv = { ...process.env, HOME: outHome };
execFileSync(meshBin, ['analytics', 'disable'], { env: outEnv, stdio: 'ignore' }); // before its first start
assert.match(fs.readFileSync(path.join(outHome, '.mesh-llm', 'config.toml'), 'utf8'), /enabled\s*=\s*false/);
const outKey = path.join(outHome, 'owner.json');
if (!fs.existsSync(outKey)) execFileSync(meshBin, ['auth', 'init', '--owner-key', outKey, '--no-passphrase'], { env: outEnv, stdio: 'ignore' });
const headToken = sh.token;
assert.ok(headToken);
const outsider = spawn(meshBin, ['--log-format', 'json', 'serve', '--headless', '--port', '9449', '--console', '3234', '--bind-port', '7844', '--bind-ip', '127.0.0.1',
  '--join', headToken, '--owner-key', outKey], { env: outEnv, stdio: ['ignore', fs.openSync(path.join(scratch, 'outsider.log'), 'w'), fs.openSync(path.join(scratch, 'outsider.err'), 'w')] });
nodes.outsider = outsider;
say('OUTSIDER: another owner key tries to join with the head\'s real invite token');
await sleep(45000);
const so = await status(3234);
const sh2 = await status(3232);
const outId = String(so.node_id || '');
say(`outsider: owner ${so.owner?.owner_id?.slice(0, 12)} ${so.owner?.status} · peers ${so.peers?.length} · head peers ${JSON.stringify((sh2.peers || []).map((p) => String(p.id).slice(0, 10)))}`);
assert.equal(so.owner?.verified, true, 'the outsider is properly signed (by its own owner)');
assert.equal((so.peers || []).length, 0, 'outsider got no peers');
assert.ok(!(sh2.peers || []).some((p) => outId && String(p.id).startsWith(outId.slice(0, 10))), 'outsider not among the head\'s peers');
const tunnel = await fetch('http://127.0.0.1:9449/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: running.ref || 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 3 }), signal: AbortSignal.timeout(20000) })
  .then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 160) })).catch((e) => ({ status: 0, body: e.message }));
say('outsider chat through the mesh:', tunnel.status, tunnel.body.replace(/\n/g, ' '));
assert.ok(!/"choices"/.test(tunnel.body), 'no inference for the outsider');
const outLog = fs.readFileSync(path.join(scratch, 'outsider.log'), 'utf8');
const refused = (outLog.match(/Failed to join any peer[^"]*/) || [''])[0];
say('outsider log:', refused || '(no join message)');
assert.ok(refused, 'the outsider says it could not join');
outsider.kill('SIGTERM');
delete nodes.outsider;
// The member is still in and the pool still answers
const still = await post('/v1/chat/completions', { model: 'pool/llama-3.2-1b-test', messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 5 }, consumer.apiKey);
assert.ok(still.choices?.[0]?.message?.content, JSON.stringify(still).slice(0, 200));
say('REFUSED: the outsider stayed out; the pool still serves with its member');


// The worker drops: the in-flight question fails and the pool waits (with --split, mesh-llm doesn't fall
// back to one machine); the worker comes back with the same invite and the pool serves again
say('DROP: stopping the worker');
nodes.worker.kill('SIGTERM');
const t1 = Date.now();
const during = await post('/v1/chat/completions', { model: 'pool/llama-3.2-1b-test', messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 5 }, consumer.apiKey);
say(`right after the drop (${Date.now() - t1} ms):`, JSON.stringify(during).slice(0, 200));
await until('worker marked down', async () => { const p = await view(); const w = p.machines.find((m) => m.nick === 'e2eworker'); return w && !w.alive; }, 2 * 60 * 1000);
say(`coordinator marked the worker down after ${Math.round((Date.now() - t1) / 1000)} s`);
await sleep(10000);
say('REJOIN: the worker comes back with the same invitation');
const t2 = Date.now();
startNode('worker', worker, ['9448', '3233', '7843']);
const back = await until('pool serving again', async () => {
  const r = await post('/v1/chat/completions', { model: 'pool/llama-3.2-1b-test', messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 5 }, consumer.apiKey);
  return r.choices ? r : null;
}, 8 * 60 * 1000);
say(`serving again ${Math.round((Date.now() - t2) / 1000)} s after the worker came back:`, back.choices[0].message.content);

// The worker leaves the pool: its owner id drops out of the list, the head restarts without it, the worker's node stops
say('LEAVE: the worker leaves the pool');
fs.appendFileSync(path.join(scratch, 'pool-head', 'node.log'), 'LEAVE-MARK\n');
await post('/api/mulePools', { op: 'leave', id: created.pool.id }, worker.apiKey);
const headLog = path.join(scratch, 'pool-head', 'node.log');
await until('head restarted with the shorter list', async () => /cambiaron las máquinas[^\n]*\n[\s\S]*nodo arrancado: acepta sólo a 1 máquina/.test(fs.readFileSync(headLog, 'utf8').split('LEAVE-MARK').pop()), 90 * 1000);
await until('worker stopped (not in the pool)', async () => /Ya no estás en este pool/.test(fs.readFileSync(path.join(scratch, 'pool-worker', 'node.log'), 'utf8')), 60 * 1000);
const sh3 = await until('head back up, verified', async () => { const st = await status(3232); return st.owner?.verified && st.publication_state === 'private' ? st : null; }, 60 * 1000);
await sleep(20000);
assert.equal(((await status(3232)).peers || []).length, 0, 'nobody left in the head\'s mesh');
say('LEFT: head restarted trusting only itself, verified:', sh3.owner.verified);

killAll();
await sleep(9000);
say('ALL OK');
process.exit(0);
