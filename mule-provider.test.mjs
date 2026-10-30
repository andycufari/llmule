// node mule-provider.test.mjs — what a job from the network can and can't make the provider do.
// 1) buildBody on its own. 2) The real script against a fake llmule + a fake upstream on localhost.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Works from any directory (the README runs it from the repo root)
const SCRIPT = fileURLToPath(new URL('./mule-provider.mjs', import.meta.url));

process.env.LLMULE_NO_MAIN = '1';
const { buildBody, upstreamServes, pickIndexes, publicName, followModels } = await import('./mule-provider.mjs');

const models = { 'qwen3.8-27b': 'local-brain' };
const msg = [{ role: 'user', content: 'hola' }];

// Rebuilt from the allowlist: server-specific knobs never reach the upstream
const b = buildBody({
  model: 'qwen3.8-27b', messages: msg, temperature: 0.2,
  chat_template: '{{ cycler.__init__.__globals__ }}', chat_template_kwargs: { x: 1 },
  options: { num_ctx: 1000000 }, keep_alive: -1, stream: true, max_tokens: 999999,
}, models, {}, 4096);
assert.deepEqual(b, { messages: msg, temperature: 0.2, max_tokens: 4096, model: 'local-brain', stream: false });

assert.equal(buildBody({ model: 'qwen3.8-27b', messages: msg }, models, {}, 4096).max_tokens, 4096, 'default cap');
assert.equal(buildBody({ model: 'qwen3.8-27b', messages: msg, max_tokens: 50 }, models, {}, 4096).max_tokens, 50);
assert.equal(buildBody({ model: 'qwen3.8-27b', messages: msg, max_tokens: -3 }, models, {}, 4096).max_tokens, 4096);

// EXTRA_BODY is the owner's: it wins, but model and stream stay ours
assert.deepEqual(
  buildBody({ model: 'qwen3.8-27b', messages: msg }, models, { chat_template_kwargs: { enable_thinking: false }, model: 'x', stream: true }, 10),
  { messages: msg, max_tokens: 10, chat_template_kwargs: { enable_thinking: false }, model: 'local-brain', stream: false });

// Only models the owner listed — not "whatever else Ollama has"
assert.throws(() => buildBody({ model: 'llama3:70b', messages: msg }, models), /not shared/);
assert.throws(() => buildBody({ model: 'local-brain', messages: msg }, models), /not shared/, 'local name is not public');
assert.throws(() => buildBody({ model: '__proto__', messages: msg }, models), /not shared/);
assert.throws(() => buildBody({ model: 'toString', messages: msg }, models), /not shared/);
assert.throws(() => buildBody({ model: 'qwen3.8-27b' }, models), /messages/);
assert.throws(() => buildBody(null, models), /bad request/);
assert.throws(() => buildBody({ model: 'qwen3.8-27b', messages: [{ role: 'user', content: 'x'.repeat(1_100_000) }] }, models), /too large/);

// Offline unless the upstream really serves it
const vllm = [{ id: 'local-brain', root: '/app/models/Qwen3.8-27B-W4A16' }];
assert.equal(upstreamServes(vllm, models, ''), true);
assert.equal(upstreamServes(vllm, models, 'Qwen3.8-27B'), true);
assert.equal(upstreamServes(vllm, models, 'Llama-4'), false, 'same id, other weights');
assert.equal(upstreamServes([], models, ''), false);
assert.equal(upstreamServes(undefined, models, ''), false);
assert.equal(upstreamServes([{ id: 'llama3.2:latest' }], { 'llama3.2': 'llama3.2' }, ''), true, 'ollama :latest');

// FOLLOW: the public name comes from the weights and follows a swap
assert.equal(publicName('/app/models/Qwen3.8-27B-W4A16-AutoRound-fast'), 'qwen3.8-27b');
assert.equal(publicName('/models/Llama-3.3-70B-Instruct-Q4_K_M.gguf'), 'llama-3.3-70b-instruct');
assert.equal(publicName('gguf/cachito10-bf16.gguf'), 'cachito10');
assert.equal(publicName('/m/Mistral-Small-3.2-24B-AWQ/'), 'mistral-small-3.2-24b');
assert.equal(publicName('local-brain'), 'local-brain', 'no root: the id itself');
assert.equal(publicName(''), '');
assert.deepEqual(followModels([{ id: 'local-brain', root: '/app/models/Qwen3.8-27B-W4A16' }, { id: 'x' }], 'local-brain'), { 'qwen3.8-27b': 'local-brain' });
assert.deepEqual(followModels([{ id: 'local-brain', root: '/m/Gemma-4-31B-FP8' }], 'local-brain'), { 'gemma-4-31b': 'local-brain' });
assert.deepEqual(followModels([], 'local-brain'), {});
assert.deepEqual(followModels(null, 'local-brain'), {});

// --- end to end: fake llmule hands out two jobs, fake upstream records what it gets ---
const listen = (handler) => new Promise((r) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => r(s)); });
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });

const upstreamGot = [];
const upstreamPaths = [];
const upstream = await listen(async (req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'local-brain', root: '/app/models/Qwen3.8-27B' }] }));
  }
  upstreamPaths.push(req.method + ' ' + req.url);
  const body = await readBody(req);
  upstreamGot.push(body);
  if (body.messages[0].content === 'fail') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'model not found at /home/owner/secret/models' } }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { completion_tokens: 1 } }));
});

const jobs = [
  { id: 'j1', request: { model: 'qwen3.8-27b', messages: msg, options: { num_gpu: 0 } } },
  { id: 'j2', request: { model: 'llama3:70b', messages: msg } },
  { id: 'j3', request: { model: 'qwen3.8-27b', messages: [{ role: 'user', content: 'fail' }] } },
];
const results = [];
let done;
const allDone = new Promise((r) => (done = r));
const api = await listen(async (req, res) => {
  const body = await readBody(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/api/muleProviderPoll') return res.end(JSON.stringify({ job: jobs.shift() || null }));
  results.push(body);
  res.end('{}');
  if (results.length === 3) done();
});

const child = spawn(process.execPath, [SCRIPT], {
  env: {
    PATH: process.env.PATH, LLMULE_KEY: 'llm_test', LLMULE_API: `http://127.0.0.1:${api.address().port}`,
    UPSTREAM: `http://127.0.0.1:${upstream.address().port}/v1`, MODELS: 'qwen3.8-27b=local-brain', MAX_TOKENS: '256', ROOT_MATCH: 'Qwen3.8-27B', LLMULE_CONFIG: '/nonexistent/provider.json',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));

await Promise.race([allDone, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout\n' + out)), 10000))]);
child.kill();
upstream.close();
api.close();

assert.deepEqual(upstreamPaths, ['POST /v1/chat/completions', 'POST /v1/chat/completions'], 'j2 never reached the upstream');
assert.deepEqual(upstreamGot[0], { messages: msg, max_tokens: 256, model: 'local-brain', stream: false });
assert.equal(results[0].jobId, 'j1');
assert.equal(results[0].response.choices[0].message.content, 'ok');
assert.deepEqual([results[1].jobId, results[1].error], ['j2', 'model not shared here']);
assert.deepEqual([results[2].jobId, results[2].error], ['j3', 'upstream error 500'], 'no local paths leak');
assert.match(out, /\/home\/owner\/secret/, 'but the owner sees the detail in their log');

// --- FOLLOW end to end: the brain swaps weights while the provider runs ---
let root = '/app/models/Qwen3.8-27B-W4A16-AutoRound-fast';
const brain = await listen((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: [{ id: 'local-brain', root }] }));
});
const announced = [];
let swapped;
const sawSwap = new Promise((r) => (swapped = r));
const net = await listen(async (req, res) => {
  const body = await readBody(req);
  announced.push(body.models.join(','));
  if (announced.length === 2) root = '/app/models/Gemma-4-31B-FP8'; // the preset changes
  if (body.models[0] === 'gemma-4-31b') swapped();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{"job":null}');
});
const follower = spawn(process.execPath, [SCRIPT], {
  env: {
    PATH: process.env.PATH, LLMULE_KEY: 'llm_test', LLMULE_CONFIG: '/nonexistent/provider.json',
    LLMULE_API: `http://127.0.0.1:${net.address().port}`, UPSTREAM: `http://127.0.0.1:${brain.address().port}/v1`, FOLLOW: 'local-brain',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let fout = '';
follower.stdout.on('data', (d) => (fout += d));
await Promise.race([sawSwap, new Promise((_, rej) => setTimeout(() => rej(new Error('no swap\n' + fout)), 10000))]);
follower.kill();
brain.close();
net.close();
assert.equal(announced[0], 'qwen3.8-27b');
assert.equal(announced.at(-1), 'gemma-4-31b', 'follows the swap without a restart');
assert.match(fout, /online — sharing qwen3\.8-27b/);
assert.match(fout, /online — sharing gemma-4-31b/);

// --- setup: a person answering the questions ---
assert.deepEqual(pickIndexes('', 3), [0, 1, 2]);
assert.deepEqual(pickIndexes('1, 3', 3), [0, 2]);
assert.deepEqual(pickIndexes('2 2', 3), [1]);
assert.equal(pickIndexes('4', 3), null);
assert.equal(pickIndexes('x', 3), null);

const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmule-setup-'));
const cfgPath = path.join(dir, 'sub', 'provider.json');

const fakeServer = await listen(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'llama3.2:latest' }, { id: 'qwen2.5:7b' }] }));
  res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
});
const fakeLlmule = await listen((req, res) => {
  const ok = req.headers.authorization === 'Bearer llm_good';
  res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(ok ? '{"data":[]}' : '{"error":{}}');
});

const answers = [
  [/Paste it:/, 'llm_bad'],
  [/Paste it:/, 'llm_good'],
  [/paste another URL/, `http://127.0.0.1:${fakeServer.address().port}/v1`],
  [/Enter for all:/, '9'],
  [/Enter for all:/, '1'],
  [/Name for this machine/, 'mi-pc'],
  [/Start sharing now/, 'n'],
];
const setupRun = spawn(process.execPath, [SCRIPT, 'setup'], {
  env: { PATH: process.env.PATH, LLMULE_CONFIG: cfgPath, LLMULE_API: `http://127.0.0.1:${fakeLlmule.address().port}` },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let screen = '';
let seen = 0;
setupRun.stderr.on('data', (d) => (screen += d));
setupRun.stdout.on('data', (d) => {
  screen += d;
  while (answers.length && answers[0][0].test(screen.slice(seen))) {
    const [re, a] = answers.shift();
    seen += screen.slice(seen).search(re) + 1;
    setupRun.stdin.write(a + '\n');
  }
});
const code = await Promise.race([
  new Promise((r) => setupRun.on('exit', r)),
  new Promise((_, rej) => setTimeout(() => rej(new Error('setup hung\n' + screen)), 15000)),
]);
const serverPort = fakeServer.address().port;
fakeServer.close();
fakeLlmule.close();
assert.equal(code, 0, screen);
assert.match(screen, /didn't accept that key/);
assert.match(screen, /use the numbers from the list/);
assert.match(screen, /✓ answered in/);
const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
assert.deepEqual(saved, {
  LLMULE_KEY: 'llm_good', UPSTREAM: `http://127.0.0.1:${serverPort}/v1`,
  MODELS: 'llama3.2=llama3.2:latest', NAME: 'mi-pc',
});
assert.equal(fs.statSync(cfgPath).mode & 0o777, 0o600, 'config only readable by the owner');
fs.rmSync(dir, { recursive: true });

console.log('ok — mule-provider');
