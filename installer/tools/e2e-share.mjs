// Dev only: the "share my model" path for real on this machine, against a local fake llmule.xyz
// (tools/fake-site.mjs, real site functions). Real downloads (llama.cpp from GitHub, a model from HF),
// a real llama-server, the real provider, a real chat through the fake site, tokens counted.
//
//   LLMULE_HOME=<scratch>/home LLMULE_DESKTOP=<scratch>/desktop node tools/e2e-share.mjs [--model qwen3.5-4b] [--api http://127.0.0.1:8787]
//
// Everything lands in LLMULE_HOME / LLMULE_DESKTOP; delete them after.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { realEffects } from '../lib/effects-real.mjs';
import { engineAsset } from '../lib/engine.mjs';
import { CATALOG } from '../lib/catalog.mjs';
import { P } from '../lib/paths.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const api = arg('api', 'http://127.0.0.1:8787');
if (!process.env.LLMULE_HOME || !process.env.LLMULE_DESKTOP) { console.error('set LLMULE_HOME and LLMULE_DESKTOP (scratch dirs)'); process.exit(1); }
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
const post = async (p, body, key) => (await fetch(api + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) }, body: JSON.stringify(body) })).json();

const fx = realEffects({ api });
const machine = await fx.detectMachine();
say('machine:', machine.os, machine.cpu, `${machine.vramGB} GB usable`);

// 1. link: the console asks, a (made-up) person approves on the web, the key arrives once
const link = await fx.startLink(machine);
say('link code', link.code);
const approved = await post('/__approve', { email: 'e2e-sharer@example.com', code: link.code });
assert.equal(approved.status, 'approved');
let r;
do { await new Promise((ok) => setTimeout(ok, link.interval * 1000)); r = await fx.pollLink(); } while (r.status === 'pending' || r.status === 'slow_down');
assert.equal(r.status, 'approved');
const key = r.key;
fx.saveConfig({ LLMULE_KEY: key, LLMULE_API: api });
assert.equal(fs.statSync(P.config).mode & 0o777, 0o600);
say('linked, key saved 0600 at', P.config);

// 2. profile
const nick = `e2e${Date.now() % 100000}`;
await fx.saveProfile({ nick, avatar: 2, bio: 'prueba local' }, key);
assert.equal((await fx.me(key)).nick, nick);
say('profile ok, nick', nick);

// 3. llama-server from the pinned release, sha256 checked
let last = '';
const engine = await fx.installEngine(engineAsset(machine), (p) => { const s = `${p.step} ${p.file || ''}`; if (s !== last) { last = s; say('engine:', s); } });
say('llama-server at', engine.bin);

// 4. the model: download, cut it halfway, resume
const model = CATALOG.find((m) => m.id === arg('model', 'qwen3.5-4b'));
const ac = new AbortController();
let shown = 0;
const already = fs.existsSync(`${P.models}/${model.file}`); // a second run: no cut to test
const first = !already && (await import('../lib/fetchfile.mjs')).download({
  url: (await import('../lib/catalog.mjs')).urlOf(model), dest: `${P.models}/${model.file}`, bytes: model.bytes, sha256: model.sha256, signal: ac.signal,
  onProgress: (p) => { if (p.frac > 0.3) ac.abort(); if (p.frac - shown > 0.1) { shown = p.frac; say(`model ${Math.round(p.frac * 100)}% ${Math.round((p.rate || 0) / 1e6)} MB/s`); } },
}).catch((e) => e);
if (!already) {
  const cut = await first;
  assert.equal(cut.code, 'cancelled');
  const partSize = fs.statSync(`${P.models}/${model.file}.part`).size;
  say(`cut at ${(partSize / 1e9).toFixed(2)} GB — resuming`);
}
shown = 0;
const steps = new Set();
const dl = await fx.downloadModel(model, (p) => { steps.add(p.step); if (p.frac - shown > 0.2) { shown = p.frac; say(`resume ${p.step} ${Math.round(p.frac * 100)}%`); } });
if (!already) assert.ok(steps.has('check'), 'rehashed the part it had');
say('model verified (sha256) at', dl.path);

// 5. load it, ask the test question
const loaded = await fx.loadModel(engine, { ...model, path: dl.path }, (s) => say('engine state', s));
const test = await fx.testQuestion(loaded, { id: model.id, local: 'llmule-local' }, '¿Qué es una mula? Respondé en dos líneas.', () => {});
say(`test answer (${test.tokens} tok, ${test.tokPerSec} tok/s): ${test.text.slice(0, 120).replace(/\n/g, ' ')}`);
assert.ok(test.text.length > 10);

// 6. desktop icon (into LLMULE_DESKTOP)
const icons = await fx.createShortcuts({ desktop: true, autostart: false });
assert.ok(fs.existsSync(icons.desktop.replace(/^~/, process.env.HOME)));
say('icon:', icons.desktop);

// 7. share: the provider as a child, a consumer chats through the fake site, tokens get counted
const consumer = (await post('/__user', { email: 'e2e-consumer@example.com', nick: 'e2econsumer' })).apiKey;
const events = [];
const sharing = fx.startSharing({ key, upstream: loaded.url, models: `${model.id}=llmule-local`, name: machine.host, extraBody: { chat_template_kwargs: { enable_thinking: false } } }, (e) => { events.push(e); if (e.type !== 'log') say('provider:', e.type, e.id || '', e.tok ?? ''); });
while (!events.some((e) => e.type === 'online')) await new Promise((ok) => setTimeout(ok, 300));
const chat = await post('/v1/chat/completions', { model: `${nick}/${model.id}`, messages: [{ role: 'user', content: 'Decí tres animales de granja.' }], max_tokens: 64 }, consumer);
assert.ok(chat.choices?.[0]?.message?.content, JSON.stringify(chat).slice(0, 200));
say('consumer got:', chat.choices[0].message.content.slice(0, 100).replace(/\n/g, ' '), '· usage', JSON.stringify(chat.usage));
await new Promise((ok) => setTimeout(ok, 500));
assert.ok(events.some((e) => e.type === 'start'), 'the "job started" line');
const me = await fx.me(key);
say('whoami:', JSON.stringify(me));
assert.ok(me.tokensServed > 0 && me.tokensServed <= 64);
assert.equal(me.rank, 1);

// 8. pause = bye on stdin: the site stops offering it jobs right away
await sharing.stop();
const prov = (await (await fetch(`${api}/__db?t=mule_providers`)).json()).find((p) => p.name === machine.host);
assert.ok(prov.goneMs > 0, 'said bye');
say('stopped sharing, the site got the bye');
await fx.cleanup();
say('ALL OK');
