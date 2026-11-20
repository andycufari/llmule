// The new site functions (muleLink, muleWhoami, token counters, mulePools) run for real on the fake platform.
//   node tools/site.test.mjs
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8790 + Math.floor(Math.random() * 100);
const API = `http://127.0.0.1:${PORT}`;
const site = spawn(process.execPath, [path.join(HERE, 'fake-site.mjs'), '--port', String(PORT), '--quiet'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => site.stdout.on('data', (d) => String(d).includes('fake llmule') && ok()));

const post = async (p, body, headers = {}) => {
  const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const auth = (key) => ({ Authorization: `Bearer ${key}` });
let n = 0;
const test = async (name, fn) => {
  try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, e); site.kill(); process.exit(1); }
};

let ana, beto, caro;
await test('users', async () => {
  ana = (await post('/__user', { email: 'ana@example.com', nick: 'ana' })).data.apiKey;
  beto = (await post('/__user', { email: 'beto@example.com', nick: 'beto' })).data.apiKey;
  caro = (await post('/__user', { email: 'caro@example.com' })).data.apiKey;
  assert.ok(ana.startsWith('llm_'));
});

await test('link: start → pending → approve → key once', async () => {
  const s = (await post('/api/muleLink', { op: 'start', name: 'mula-box', os: 'Ubuntu 24.04' })).data;
  assert.match(s.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(s.deviceSecret.length >= 64);
  assert.equal((await post('/api/muleLink', { op: 'poll', deviceSecret: s.deviceSecret })).data.status, 'pending');
  // too fast → slow_down
  assert.equal((await post('/api/muleLink', { op: 'poll', deviceSecret: s.deviceSecret })).data.status, 'slow_down');
  // peek needs a session
  assert.equal((await post('/api/muleLink', { op: 'peek', code: s.code })).status, 401);
  const ok = await post('/__approve', { email: 'ana@example.com', code: s.code.toLowerCase().replace('-', ' ') });
  assert.equal(ok.data.status, 'approved');
  await new Promise((r) => setTimeout(r, 2600));
  const got = (await post('/api/muleLink', { op: 'poll', deviceSecret: s.deviceSecret })).data;
  assert.equal(got.status, 'approved');
  assert.equal(got.key, ana);
  assert.equal(got.nick, 'ana');
  // exactly once
  assert.equal((await post('/api/muleLink', { op: 'poll', deviceSecret: s.deviceSecret })).data.status, 'delivered');
  // the code can't be approved again
  assert.equal((await post('/__approve', { email: 'beto@example.com', code: s.code })).status, 409);
});

await test('link: wrong codes are limited per account', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post('/__approve', { email: 'caro@example.com', code: 'AAAA-AAAA' })).status, 404);
  assert.equal((await post('/__approve', { email: 'caro@example.com', code: 'AAAA-AAAA' })).status, 429);
});

await test('whoami + setProfile', async () => {
  let w = (await post('/api/muleWhoami', {}, auth(caro))).data;
  assert.equal(w.nick, null);
  assert.equal(w.tokServed, 0);
  assert.match(w.week, /^\d{4}-W\d\d$/);
  assert.equal((await post('/api/muleWhoami', { op: 'setProfile', nick: 'ana' }, auth(caro))).status, 409);
  assert.equal((await post('/api/muleWhoami', { op: 'setProfile', nick: 'pool' }, auth(caro))).status, 409);
  w = (await post('/api/muleWhoami', { op: 'setProfile', nick: 'caro', avatar: 3, bio: 'Una <b>3060</b>\nen Lanús' }, auth(caro))).data;
  assert.equal(w.nick, 'caro');
  assert.equal(w.avatar, 3);
  assert.equal(w.bio, 'Una b 3060 /b en Lanús');
  assert.equal((await post('/api/muleWhoami', {}, { Authorization: 'Bearer llm_nope' })).status, 401);
});

// A provider that answers what we tell it, then the counters
const pollOnce = async (key, instance, models) => post('/api/muleProviderPoll', { instance, name: 'test', models }, auth(key));
async function serveOne(providerKey, instance, model, consumerKey, answer) {
  const chat = post('/v1/chat/completions', { model, messages: [{ role: 'user', content: 'hola, contame algo de mulas' }], max_tokens: 50 }, auth(consumerKey));
  await new Promise((r) => setTimeout(r, 300));
  const job = (await pollOnce(providerKey, instance, [model])).data.job;
  assert.ok(job, 'got a job');
  const res = await post('/api/muleProviderResult', { instance, jobId: job.id, response: answer }, auth(providerKey));
  return { res: res.data, chat: (await chat).data };
}

await test('tokens: counted from the answer, capped, self-use free', async () => {
  await pollOnce(ana, 'inst-ana-0001', ['qwen3.5-4b']); // online
  // claims 9999 tokens for 40 characters with max_tokens 50 → min(9999, min(50, 40)) = 40
  const big = { choices: [{ message: { role: 'assistant', content: 'x'.repeat(40) } }], usage: { completion_tokens: 9999, prompt_tokens: 3 } };
  const r = await serveOne(ana, 'inst-ana-0001', 'qwen3.5-4b', beto, big);
  assert.equal(r.res.tokens, 40);
  assert.equal(r.chat.choices[0].message.content.length, 40);
  let w = (await post('/api/muleWhoami', {}, auth(ana))).data;
  assert.equal(w.tokServed, 40);
  assert.equal(w.tokServedWeek, 40);
  assert.equal(w.rank, 1);
  assert.equal((await post('/api/muleWhoami', {}, auth(beto))).data.tokUsed, 43);
  // no usage → ~chars/4
  const r2 = await serveOne(ana, 'inst-ana-0001', 'qwen3.5-4b', beto, { choices: [{ message: { content: 'y'.repeat(100) } }] });
  assert.equal(r2.res.tokens, 25);
  // serving yourself: nothing
  await serveOne(ana, 'inst-ana-0001', 'qwen3.5-4b', ana, big);
  w = (await post('/api/muleWhoami', {}, auth(ana))).data;
  assert.equal(w.tokServed, 65);
  const net = await (await fetch(API + '/api/muleNetwork')).json();
  assert.equal(net.tokens.total[0].nick, 'ana');
  assert.equal(net.tokens.week[0].tokens, 65);
});

let pool;
await test('pools: create (invite-only), not visible, invite code, join', async () => {
  assert.equal((await post('/api/mulePools', { op: 'create', model: 'nope' }, auth(ana))).status, 400);
  const c = (await post('/api/mulePools', { op: 'create', model: 'llama-3.2-1b-test', node: { gb: 24, gpu: 'RTX 3090', os: 'linux' } }, auth(ana))).data;
  pool = c.pool;
  assert.equal(c.role, 'head');
  assert.equal(pool.publicModel, 'pool/llama-3.2-1b-test');
  assert.equal(pool.open, false);
  assert.equal((await post('/api/mulePools', { op: 'create', model: 'kimi-k3' }, auth(ana))).status, 409); // one at a time
  // beto can't see it nor join it
  assert.equal((await post('/api/mulePools', { op: 'list' }, auth(beto))).data.pools.length, 0);
  assert.equal((await post('/api/mulePools', { op: 'join', id: pool.id, node: { gb: 12 } }, auth(beto))).status, 403);
  // only the owner invites
  assert.equal((await post('/api/mulePools', { op: 'invite', id: pool.id }, auth(beto))).status, 403);
  const inv = (await post('/api/mulePools', { op: 'invite', id: pool.id }, auth(ana))).data;
  const j = await post('/api/mulePools', { op: 'join', code: inv.code, node: { gb: 12, gpu: 'RTX 3060', os: 'windows' } }, auth(beto));
  assert.equal(j.data.role, 'worker');
  // the code is one use
  assert.equal((await post('/api/mulePools', { op: 'join', code: inv.code, node: { gb: 8 } }, auth(caro))).status, 409);
  // no head heartbeat yet → no token for members
  assert.equal(j.data.pool.token, undefined);
});

await test('pools: heartbeats, token only to members, stages, pool/ only from the head', async () => {
  // beto tries to publish pool/… before anything: dropped
  assert.equal((await pollOnce(beto, 'inst-beto-001', ['pool/llama-3.2-1b-test'])).status, 400);
  const hb = await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'aaaaaaaaaa', state: 'ready', token: 'TOKEN123', tps: 41.5,
    stages: [{ node: 'bbbbbbbbbb', start: 0, end: 12 }, { node: 'aaaaaaaaaa', start: 12, end: 16 }] }, auth(ana));
  assert.equal(hb.data.role, 'head');
  const hb2 = await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'bbbbbbbbbb', state: 'ready' }, auth(beto));
  assert.equal(hb2.data.pool.token, 'TOKEN123');
  assert.equal(hb2.data.pool.state, 'running');
  assert.equal(hb2.data.pool.machines.length, 2);
  // caro (not a member) gets no token
  const g = await post('/api/mulePools', { op: 'get', id: pool.id }, auth(caro));
  assert.equal(g.data.pool.token, undefined);
  assert.equal(g.data.pool.machines, undefined);
  // ana (head) can publish it
  assert.equal((await pollOnce(ana, 'inst-ana-pool1', ['pool/llama-3.2-1b-test'])).status, 200);
});

const OA = 'a'.repeat(64), OB = 'b'.repeat(63) + 'c', OC = 'c'.repeat(64);
await test('pools: mesh owner ids — stored per member, validated, the allowlist only for members', async () => {
  // bad formats are ignored (uppercase, short, not a string)
  await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'aaaaaaaaaa', state: 'ready', meshOwner: 'A'.repeat(64) }, auth(ana));
  await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'bbbbbbbbbb', state: 'ready', meshOwner: 'abc' }, auth(beto));
  let hb = (await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'bbbbbbbbbb', state: 'ready', meshOwner: { x: 1 } }, auth(beto))).data;
  assert.deepEqual(hb.pool.meshOwners, []);
  assert.equal(hb.pool.headMeshOwner, '');
  // the head's id first: the worker sees it as headMeshOwner
  await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'aaaaaaaaaa', state: 'ready', token: 'TOKEN123', meshOwner: OA }, auth(ana));
  hb = (await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'bbbbbbbbbb', state: 'ready', meshOwner: OB }, auth(beto))).data;
  assert.deepEqual(hb.pool.meshOwners, [OA, OB]);
  assert.equal(hb.pool.headMeshOwner, OA);
  assert.equal(hb.pool.token, 'TOKEN123');
  // a machine that re-made its key: the new id replaces the old one
  hb = (await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshNodeId: 'bbbbbbbbbb', state: 'ready', meshOwner: OC }, auth(beto))).data;
  assert.deepEqual(hb.pool.meshOwners, [OA, OC]);
  // not a member: no list, and its heartbeat can't add itself
  const g = (await post('/api/mulePools', { op: 'get', id: pool.id }, auth(caro))).data.pool;
  assert.equal(g.meshOwners, undefined);
  assert.equal(g.headMeshOwner, undefined);
  assert.equal((await post('/api/mulePools', { op: 'heartbeat', id: pool.id, meshOwner: 'd'.repeat(64) }, auth(caro))).status, 404);
  assert.deepEqual((await post('/api/mulePools', { op: 'get', id: pool.id }, auth(ana))).data.pool.meshOwners, [OA, OC]);
  // nor through list (the open listing shows no member details)
  await post('/api/mulePools', { op: 'setOpen', id: pool.id, open: true }, auth(ana));
  const l = (await post('/api/mulePools', { op: 'list' }, auth(caro))).data.pools[0];
  assert.equal(l.meshOwners, undefined);
  await post('/api/mulePools', { op: 'setOpen', id: pool.id, open: false }, auth(ana));
});

await test('pools: tokens credited by layer share, computed server-side', async () => {
  const before = { ana: (await post('/api/muleWhoami', {}, auth(ana))).data.tokServed, beto: (await post('/api/muleWhoami', {}, auth(beto))).data.tokServed };
  const answer = { choices: [{ message: { content: 'z'.repeat(64) } }], usage: { completion_tokens: 32, prompt_tokens: 5 } };
  const r = await serveOne(ana, 'inst-ana-pool1', 'pool/llama-3.2-1b-test', caro, answer);
  assert.equal(r.res.tokens, 32);
  const after = { ana: (await post('/api/muleWhoami', {}, auth(ana))).data.tokServed, beto: (await post('/api/muleWhoami', {}, auth(beto))).data.tokServed };
  // beto ran 12 of 16 layers, ana 4
  assert.equal(after.beto - before.beto, 24);
  assert.equal(after.ana - before.ana, 8);
  // beto using the pool himself: his own share doesn't count, ana's does
  await serveOne(ana, 'inst-ana-pool1', 'pool/llama-3.2-1b-test', beto, answer);
  assert.equal((await post('/api/muleWhoami', {}, auth(beto))).data.tokServed, after.beto);
  assert.equal((await post('/api/muleWhoami', {}, auth(ana))).data.tokServed, after.ana + 8);
  const g = (await post('/api/mulePools', { op: 'get', id: pool.id }, auth(ana))).data.pool;
  assert.equal(g.tokToday, 64);
});

await test('pools: open → listed and searchable; setHead; leave; close', async () => {
  await post('/api/mulePools', { op: 'setOpen', id: pool.id, open: true }, auth(ana));
  const l = (await post('/api/mulePools', { op: 'list', q: 'llama' }, auth(caro))).data;
  assert.equal(l.pools.length, 1);
  assert.equal((await post('/api/mulePools', { op: 'list', q: 'kimi' }, auth(caro))).data.pools.length, 0);
  assert.equal((await post('/api/mulePools', { op: 'setHead', id: pool.id, nick: 'caro' }, auth(ana))).status, 400); // not a member
  const sh = (await post('/api/mulePools', { op: 'setHead', id: pool.id, nick: 'beto' }, auth(ana))).data.pool;
  assert.equal(sh.head, 'beto');
  assert.equal(sh.token, undefined); // a new head brings its own token
  // the old head can't publish pool/ anymore
  assert.equal((await pollOnce(ana, 'inst-ana-pool2', ['pool/llama-3.2-1b-test'])).status, 400);
  await post('/api/mulePools', { op: 'leave', id: pool.id }, auth(beto));
  const afterLeave = (await post('/api/mulePools', { op: 'get', id: pool.id }, auth(ana))).data.pool;
  assert.equal(afterLeave.head, null);
  assert.deepEqual(afterLeave.meshOwners, [OA]); // the one who left drops out of the allowlist
  assert.equal(afterLeave.headMeshOwner, '');
  assert.equal((await post('/api/mulePools', { op: 'close', id: pool.id }, auth(beto))).status, 403);
  assert.equal((await post('/api/mulePools', { op: 'close', id: pool.id }, auth(ana))).data.ok, true);
  assert.equal((await post('/api/mulePools', { op: 'get', id: pool.id }, auth(ana))).status, 404);
});

console.log(`${n} site tests passed`);
site.kill();
