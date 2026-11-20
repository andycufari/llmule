// node llmule.test.mjs — pure functions + every screen rendered headless at 80×24 and 140×40,
// in 16/256/truecolor, with the demo effects. No terminal, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseKeys, colorDepth, to256, to16, Screen } from './lib/term.mjs';
import { parseProviderLine, selfArgs } from './lib/provider-run.mjs';
import { pickList, recommended, CATALOG } from './lib/catalog.mjs';
import { parseNvidia, parseWinRegistry, appleUsable, bestVram } from './lib/detect.mjs';
import { engineAsset, meshAsset } from './lib/engine.mjs';
import { parseMeshLine, readStatus, meshArgs, privateProblem, parseOwnerId, isOwnerId } from './lib/mesh.mjs';
import { ENGINES, isEmbeddingId, chatModels, lmStudioModels, pickChatModel, engineErrorText, probeEngine } from './lib/detect.mjs';
import { download } from './lib/fetchfile.mjs';
import { PATHS } from './lib/screens.mjs';
import { wrap, fmtNum, sparkline, hueShift, fitStatus, len } from './lib/ui.mjs';
import { levelOf, SCREENS } from './lib/screens.mjs';
const profileFields = (app) => SCREENS.find((s) => s.id === 'profile').fields(app);
import { createApp } from './lib/app.mjs';
import { demoEffects, DEMO_MACHINES, DEMO_POOLS } from './lib/effects-demo.mjs';
import { planLayers, creditTokens } from './lib/pool.mjs';
import { ES, EN, strings, systemLang, pickLang } from './lib/strings.mjs';

test('keys: arrows, F3 in its three dialects, enter, esc, text', () => {
  assert.deepEqual(parseKeys('\x1b[A\x1b[B\x1bOC\x1b[1;5D'), ['up', 'down', 'right', 'left']);
  assert.deepEqual(parseKeys('\x1bOR'), ['f3']); // xterm, macOS Terminal
  assert.deepEqual(parseKeys('\x1b[13~'), ['f3']); // rxvt-style
  assert.deepEqual(parseKeys('\x1b[[C'), ['f3']); // libuv on Windows, Linux console
  assert.deepEqual(parseKeys('\r\n'), ['enter']);
  assert.deepEqual(parseKeys('\x1b'), ['esc']);
  assert.deepEqual(parseKeys('\x03\t\x7f '), ['ctrl-c', 'tab', 'backspace', 'space']);
  assert.deepEqual(parseKeys('añ'), [{ ch: 'a' }, { ch: 'ñ' }]);
  assert.deepEqual(parseKeys('\x1b[Z'), ['shift-tab']);
  // The terminal's answer to the size query vs shift/ctrl+F3 (same shape: ESC [ a ; b R)
  assert.deepEqual(parseKeys('\x1b[25;80R'), [{ cpr: [25, 80] }]);
  assert.deepEqual(parseKeys('\x1b[1;2R\x1b[1;5R'), ['f3', 'f3']);
});

// Every key of the Spanish table exists in English with the same shape, and the other way around
test('strings: Spanish and English have the same keys', () => {
  const shape = (v) => (typeof v === 'function' ? 'fn' : Array.isArray(v) ? `array${v.length}` : v && typeof v === 'object' ? 'object' : typeof v);
  const walk = (a, b, at) => {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `keys of ${at || 'root'}`);
    for (const k of Object.keys(a)) {
      assert.equal(shape(a[k]), shape(b[k]), `${at}.${k}`);
      if (shape(a[k]) === 'object') walk(a[k], b[k], `${at}.${k}`);
      if (Array.isArray(a[k]) && Array.isArray(a[k][0])) a[k].forEach((row, i) => assert.equal(row.length, b[k][i].length, `${at}.${k}[${i}]`));
    }
  };
  walk(ES, EN, '');
  // Function strings take the same arguments and say something in both
  const pool = { modelName: 'm', quant: 'q', sizeGB: 1.5, layers: 2, owner: 'o', head: 'h' };
  const call = (k, f) => (k === 'line' ? f(pool, String) : f(1, 2, 3));
  for (const t of [ES, EN]) {
    for (const [k, v] of Object.entries(t)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, f] of Object.entries(v)) if (typeof f === 'function') assert.ok(String(call(k2, f)).length, `${t.lang}.${k}.${k2}`);
    }
  }
  assert.equal(EN.errorOf({ code: 'llama_exit', exitCode: 3 }), 'llama-server quit (code 3). See ~/.llmule/llama-server.log');
  assert.equal(ES.errorOf({ code: 'llama_exit', exitCode: 3 }), 'llama-server salió (código 3). Mirá ~/.llmule/llama-server.log');
  assert.equal(ES.dec(7.4), '7,4');
  assert.equal(EN.dec(7.4), '7.4');
});

test('language: --lang, then the saved choice, then the system locale', () => {
  const intl = (l) => () => l;
  assert.equal(systemLang({ LANG: 'es_AR.UTF-8' }, intl('en-US')), 'es');
  assert.equal(systemLang({ LANG: 'en_US.UTF-8' }, intl('es-AR')), 'en');
  assert.equal(systemLang({ LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' }, intl('en')), 'es'); // LC_ALL first
  assert.equal(systemLang({ LC_MESSAGES: 'pt_BR.UTF-8', LANG: 'es_AR.UTF-8' }, intl('es')), 'en');
  assert.equal(systemLang({ LANG: 'C.UTF-8' }, intl('es-MX')), 'es'); // C says nothing: the OS decides
  assert.equal(systemLang({}, intl('es-419')), 'es'); // Windows: no LANG, Intl from the OS
  assert.equal(systemLang({}, intl('de-DE')), 'en');
  assert.equal(systemLang({}, () => { throw new Error('no Intl'); }), 'en');
  assert.equal(systemLang({ LANG: 'esperanto' }, intl('en')), 'en'); // "es" must be the whole language code
  assert.equal(pickLang({ flag: 'en', saved: 'es', env: { LANG: 'es_AR' } }), 'en');
  assert.equal(pickLang({ flag: true, saved: 'es', env: { LANG: 'en_US' } }), 'es'); // a bare --lang falls through
  assert.equal(pickLang({ saved: 'xx', env: { LANG: 'es_AR' } }), 'es');
  assert.equal(strings('fr'), EN);
});

// The status bar never cuts a word: it shortens, then drops the least important parts (Andy saw "apgdo")
test('status bar: whole words at any width, in both languages', () => {
  const S = createApp({ fx: demoEffects({ fast: true }), scr: new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 }), S: ES, opts: {}, quit: () => {} });
  for (const T of [ES, EN]) {
    S.S = T;
    for (const status of [
      { site: 'checking', engine: 'none', login: 'no', share: 'off' },
      { site: 'up', engine: 'up', engineName: 'llama.cpp', model: 'qwen3.6-35b-a3b', login: 'yes', nick: 'mula-andina', share: 'on' },
      { site: 'down', engine: 'loading', engineName: 'vLLM / OpenAI', model: 'qwen3.6-35b-a3b-iq3', login: 'wait', share: 'waiting' },
    ]) {
      Object.assign(S.status, { model: '', nick: '', engineName: '' }, status);
      const segs = S.segments();
      const words = new Set(segs.flatMap((s) => [s.label, s.value, s.short || ''].join(' ').split(' ')));
      for (const w of [80, 100, 140, 60, 40]) {
        const fit = fitStatus(segs, w - 9);
        assert.ok(fit.reduce((a, s) => a + len(s.text) + 5, -1) <= w - 9 || fit.length === 1, `${T.lang} ${w}`);
        if (w >= 80) for (const s of fit) for (const word of s.text.split(' ')) assert.ok(words.has(word), `${T.lang} ${w}: "${word}" in "${s.text}"`);
        assert.ok(fit.some((s) => s.label === T.status.share), `${T.lang} ${w}: the share state always stays`);
      }
    }
  }
});

test('color depth from the environment', () => {
  assert.equal(colorDepth({ COLORTERM: 'truecolor' }, 'linux'), 24);
  assert.equal(colorDepth({ WT_SESSION: 'x' }, 'win32'), 24);
  assert.equal(colorDepth({}, 'win32'), 256);
  assert.equal(colorDepth({ TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm-256color' }, 'darwin'), 256);
  assert.equal(colorDepth({ TERM: 'xterm' }, 'linux'), 16);
  assert.equal(colorDepth({ LLMULE_COLORS: '16', COLORTERM: 'truecolor' }, 'linux'), 16);
  assert.equal(to256('#ffffff'), 231);
  assert.equal(to16('#3a6ea5'), 4);
});

test('provider log lines → events (lines copied from mule-provider.mjs)', () => {
  assert.deepEqual(parseProviderLine('2026-11-15T12:00:00.000Z job abc123 qwen3.6-35b-a3b 2310ms 212 tok'),
    { type: 'done', id: 'abc123', model: 'qwen3.6-35b-a3b', ms: 2310, tok: 212, late: false });
  assert.equal(parseProviderLine('2026-11-15T12:00:00.000Z job abc m 50000ms ? tok (too late, consumer gave up)').late, true);
  assert.equal(parseProviderLine('2026-11-15T12:00:00.000Z job abc failed: upstream timeout').type, 'fail');
  assert.deepEqual(parseProviderLine('2026-11-15T12:00:00.000Z online — sharing a, b'), { type: 'online', models: ['a', 'b'] });
  assert.equal(parseProviderLine('2026-11-15T12:00:00.000Z upstream down or not serving x — offline').why, 'engine');
  const w = parseProviderLine('2026-11-15T12:00:00.000Z poll failed: /api/muleProviderPoll → 502  — retrying in 4s');
  assert.equal(w.why, 'site');
  assert.equal(w.retry, 4);
  assert.equal(parseProviderLine('2026-11-15T12:00:00.000Z SIGTERM — leaving the network').type, 'stopped');
});

test('self respawn args', () => {
  const a = selfArgs('__provider');
  assert.equal(a[a.length - 1], '__provider');
});

test('catalog: the recommended model by VRAM', () => {
  assert.equal(recommended(24).id, 'qwen3.6-35b-a3b');
  assert.equal(recommended(31).id, 'qwen3.6-35b-a3b'); // Apple 48 GB
  assert.equal(recommended(20).id, 'qwen3.6-27b');
  assert.equal(recommended(16).id, 'qwen3.6-35b-a3b-iq3');
  assert.equal(recommended(8).id, 'qwen3.5-9b');
  assert.equal(recommended(6).id, 'qwen3.5-4b');
  assert.equal(recommended(0, 16).id, 'qwen3.5-4b'); // CPU only
  assert.equal(recommended(2), null);
  assert.equal(pickList(24).filter((m) => m.recommended).length, 1);
  for (const m of CATALOG) assert.match(m.sha256, /^[0-9a-f]{64}$/);
});

test('detection parsers', () => {
  assert.deepEqual(parseNvidia('NVIDIA GeForce RTX 3090, 24576, 410\nNVIDIA GeForce RTX 3090, 24576, 9000\n').map((g) => g.vramGB), [24, 24]);
  const reg = `
HKEY_LOCAL_MACHINE\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000
    DriverDesc    REG_SZ    AMD Radeon RX 7900 XTX
    HardwareInformation.qwMemorySize    REG_QWORD    0x600000000
`.replace('0x600000000', String(24 * 1024 ** 3));
  assert.deepEqual(parseWinRegistry(reg), [{ vendor: 'amd', name: 'AMD Radeon RX 7900 XTX', vramGB: 24 }]);
  assert.equal(appleUsable(48), 31);
  assert.equal(appleUsable(128), 96);
  assert.equal(bestVram({ gpus: [{ vendor: 'intel', vramGB: 2 }] }), 0);
});

test('llama.cpp asset per machine', () => {
  const names = (a) => a.files.map((f) => f.name);
  assert.deepEqual(names(engineAsset(DEMO_MACHINES[3090])), ['llama-b12359-bin-ubuntu-cuda-13.5-x64.tar.gz', 'cudart-llama-b12359-bin-ubuntu-cuda-13.5-x64.tar.gz']);
  assert.equal(engineAsset(DEMO_MACHINES.mac).gpu, 'metal');
  assert.equal(names(engineAsset(DEMO_MACHINES.small))[0], 'llama-b12359-bin-win-cuda-13.5-x64.zip');
  assert.equal(names(engineAsset(DEMO_MACHINES.cpu))[0], 'llama-b12359-bin-ubuntu-x64.tar.gz');
  // An old driver gets CUDA 12
  const old = { ...DEMO_MACHINES[3090], gpus: [{ ...DEMO_MACHINES[3090].gpus[0], driver: '550.90.07' }] };
  assert.equal(names(engineAsset(old))[0], 'llama-b12359-bin-ubuntu-cuda-12.8-x64.tar.gz');
  assert.match(meshAsset(old).files[0].name, /cuda-12\.tar\.gz$/);
  // Every file we'd fetch has a pinned size and sha256
  for (const m of [...Object.values(DEMO_MACHINES), old]) {
    for (const f of [...engineAsset(m).files, ...(meshAsset(m)?.files || [])]) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/, f.name);
      assert.ok(f.bytes > 1e6, f.name);
    }
  }
  assert.equal(meshAsset({ platform: 'darwin', arch: 'x64', gpus: [] }), null); // no mesh-llm for Intel Macs
  assert.equal(meshAsset(DEMO_MACHINES.mac).files[0].name, 'mesh-llm-v0.79.0-aarch64-apple-darwin.tar.gz');
});

test('mesh-llm: json log lines and /api/status (shapes seen from v0.79.0)', () => {
  assert.deepEqual(parseMeshLine('{"event":"invite_token","level":"info","mesh_id":"75dc","token":"eyJ"}'), { type: 'token', token: 'eyJ', meshId: '75dc' });
  assert.deepEqual(parseMeshLine('{"context":null,"event":"info","message":"📡 Peer 042098b0bc RTT: 367ms (relay)"}'), { type: 'rtt', peer: '042098b0bc', ms: 367, path: 'relay' });
  assert.equal(parseMeshLine('{"event":"info","message":"Split waiting to retry: split_capacity_shortfall: unable to plan"}').type, 'shortfall');
  assert.equal(parseMeshLine('not json'), null);
  const st = readStatus({ node_id: '6939767a36', token: 'T', peers: [{ id: '042098b0bc', rtt_ms: 183 }], serving_models: ['meshllm/x-layers'],
    runtime: { stages: [{ node_id: '042098b0bc1e006d', layer_start: 0, layer_end: 15, state: 'ready' }, { node_id: '6939767a36d4c07e', layer_start: 15, layer_end: 16, state: 'ready' }] } });
  assert.equal(st.ready, true);
  assert.deepEqual(st.stages.map((x) => [x.node, x.start, x.end]), [['042098b0bc', 0, 15], ['6939767a36', 15, 16]]);
  assert.equal(st.model, 'meshllm/x-layers');
  assert.equal(readStatus({ runtime: { stages: [{ node_id: 'a', layer_start: 0, layer_end: 1, state: 'starting' }] } }).ready, false);
});

test('mesh-llm: only pool members get in, private mesh, nothing public', () => {
  const A = 'a4604c0859c01a375ca30916da64b16ff27c1bc49311bcffda40b068caf15a98';
  const B = 'b'.repeat(64);
  // `auth status` / `auth init` output (v0.79.0, on stderr)
  assert.equal(parseOwnerId(`Owner keystore:  /x/ok.json\nStatus:          present\nOwner ID:        ${A}\nSigning key:     d043`), A);
  assert.equal(parseOwnerId('Status: missing'), '');
  assert.equal(isOwnerId(A.toUpperCase()), false);
  const args = meshArgs({ ref: 'hf://m', trustOwners: [A, B, A, 'nope'], joinFile: '/t/token' });
  assert.deepEqual(args.slice(args.indexOf('--owner-key') + 2, args.indexOf('--owner-key') + 5), ['--owner-required', '--trust-policy', 'allowlist']);
  assert.deepEqual(args.flatMap((a, i) => (a === '--trust-owner' ? [args[i + 1]] : [])), [A, B]);
  for (const bad of ['--listen-all', '--publish', '--nostr-discovery', '--auto-update', '--auto', '--discover']) assert.ok(!args.includes(bad), bad);
  if (!process.env.LLMULE_MESH_BIND_IP) assert.ok(!args.includes('--bind-ip'));
  assert.throws(() => meshArgs({ ref: 'hf://m', trustOwners: ['nope'] }));
  // /api/status as a signed, private node reports it (v0.79.0, measured)
  const ok = readStatus({ node_id: '3a5ffa0c20', owner: { owner_id: A, status: 'verified', verified: true }, publication_state: 'private', nostr_discovery: false });
  assert.equal(privateProblem(ok, A), '');
  assert.equal(privateProblem(ok, B), 'owner distinto');
  assert.equal(privateProblem(readStatus({ owner: { owner_id: A, status: 'unsigned', verified: false }, publication_state: 'private' }), A), 'owner unsigned');
  assert.equal(privateProblem(readStatus({ publication_state: 'private' }), A), 'owner missing');
  assert.match(privateProblem(readStatus({ owner: { owner_id: A, verified: true }, publication_state: 'public' }), A), /public/);
  assert.match(privateProblem(readStatus({ owner: { owner_id: A, verified: true }, publication_state: 'private', nostr_discovery: true }), A), /nostr/);
});

test('engines: vLLM / OpenAI on :8000 and :8001 (cm64labs brain), by IP', () => {
  const urls = ENGINES.filter((e) => e.id === 'openai').map((e) => e.url);
  assert.deepEqual(urls, ['http://127.0.0.1:8000/v1', 'http://127.0.0.1:8001/v1']);
  assert.equal(ENGINES.find((e) => e.id === 'openai').name, 'vLLM / OpenAI');
});

test('download: resumes after a cut, checks sha256, refuses a corrupt file', async () => {
  const { createServer } = await import('node:http');
  const { createHash } = await import('node:crypto');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const data = Buffer.alloc(3 * 1024 * 1024, 7);
  data.write('LLMule', 12345);
  const sha = createHash('sha256').update(data).digest('hex');
  let cuts = 1;
  let ranges = 0;
  const srv = createServer((req, res) => {
    const m = /bytes=(\d+)-/.exec(req.headers.range || '');
    const from = m ? Number(m[1]) : 0;
    if (m) ranges++;
    res.writeHead(m ? 206 : 200, { 'Content-Length': data.length - from });
    if (cuts-- > 0) { res.write(data.subarray(from, from + 1024 * 1024)); return setTimeout(() => res.destroy(), 20); }
    res.end(data.subarray(from));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/f`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmule-dl-'));
  const steps = new Set();
  const out = await download({ url, dest: path.join(dir, 'f.bin'), bytes: data.length, sha256: sha, onProgress: (p) => steps.add(p.step) });
  assert.equal(createHash('sha256').update(fs.readFileSync(out)).digest('hex'), sha);
  assert.ok(steps.has('waiting'), 'it waited after the cut');
  assert.equal(ranges, 1, 'and resumed with a Range');
  // A second call trusts the marker; a wrong sha256 is refused and leaves nothing behind
  await download({ url, dest: out, bytes: data.length, sha256: sha });
  await assert.rejects(download({ url, dest: path.join(dir, 'g.bin'), bytes: data.length, sha256: '0'.repeat(64) }), { code: 'bad_sha256' });
  assert.equal(fs.existsSync(path.join(dir, 'g.bin.part')), false);
  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ui helpers', () => {
  assert.deepEqual(wrap('uno dos tres', 7), ['uno dos', 'tres']);
  assert.equal(fmtNum(1234567, 'es'), '1,2 M');
  assert.equal(fmtNum(12345, 'es'), '12.345');
  assert.equal(fmtNum(1234567, 'en'), '1.2 M');
  assert.equal(fmtNum(12345, 'en'), '12,345');
  assert.equal(sparkline([0, 8], 2), ' █');
  assert.match(hueShift('#3a6ea5', -95), /^#[0-9a-f]{6}$/);
  assert.equal(levelOf(ES.levels, 0).name, 'Burrito');
  assert.equal(levelOf(ES.levels, 1_200_000).name, 'Mula de tiro');
  assert.equal(levelOf(ES.levels, 5e8).next, null);
});

test('pool: layers proportional to memory, contiguous, all covered; credit by layers', () => {
  const pool = { sizeGB: 343, layers: 78 };
  assert.equal(planLayers(pool, [{ id: 'a', gb: 176 }, { id: 'b', gb: 128 }, { id: 'c', gb: 48 }]), null); // 5 GB short
  const plan = planLayers(pool, [{ id: 'a', gb: 176 }, { id: 'b', gb: 128 }, { id: 'c', gb: 48 }, { id: 'vos', gb: 24 }]);
  assert.equal(plan[0].from, 1);
  assert.equal(plan.at(-1).to, 78);
  plan.slice(1).forEach((p, i) => assert.equal(p.from, plan[i].to + 1));
  for (const p of plan) assert.ok(p.gb <= [176, 128, 48, 24][plan.indexOf(p)] - 2);
  const credit = creditTokens(1000, plan);
  assert.ok(Math.abs(Object.values(credit).reduce((a, b) => a + b, 0) - 1000) <= 2);
});

test('paths: steps are numbered per mode and both paths end on a panel', () => {
  const app = createApp({ fx: demoEffects({ fast: true }), scr: new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 }), S: ES, opts: {}, quit: () => {} });
  assert.deepEqual(app.stepOf('welcome'), [1, 10]);
  assert.deepEqual(app.stepOf('install'), app.stepOf('engine'));
  app.setMode('pool');
  assert.deepEqual(app.stepOf('pools'), [6, 9]);
  assert.equal(app.stepOf('pooldash'), null);
  assert.equal(app.path.at(-1), 'pooldash');
  app.setMode('poolnew');
  assert.deepEqual(app.stepOf('poolnew'), [6, 8]);
  assert.equal(app.path.at(-1), 'pooldash');
});

// Every screen, headless: catches a screen that throws or draws outside the terminal
test('every screen renders at 80×24, 100×30 and 140×40 in 16/256/24 colors, in Spanish and English', async () => {
  const sink = { columns: 80, rows: 24, write() {} };
  for (const [w, h, depth, lang] of [[80, 24], [100, 30], [140, 40]].flatMap(([w, h]) => [16, 256, 24].flatMap((d) => ['es', 'en'].map((l) => [w, h, d, l])))) {
    {
      const scr = new Screen({ out: { ...sink, columns: w, rows: h }, depth });
      const opts = { fast: true, lang };
      const fx = demoEffects(opts);
      const app = createApp({ fx, scr, S: strings(lang), opts, quit: () => {} });
      app.machine = structuredClone(DEMO_MACHINES[3090]);
      app.engine = { id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:9931/v1', up: true, models: [] };
      app.model = { id: 'qwen3.6-35b-a3b', local: 'llmule-local' };
      app.key = 'llm_demo';
      app.pool = (await fx.pools('', 'join', { id: DEMO_POOLS[0].id })).pool;
      app.poolRole = 'worker';
      for (const s of SCREENS) {
        app.setMode(s.id === 'poolnew' ? 'poolnew' : PATHS.pool.includes(s.id) ? 'pool' : 'share');
        app.go(s.id, { push: false });
        app.render();
        assert.equal(scr.ch.length, w * h, `${s.id} ${w}x${h}`);
        // Nothing from the other language leaks in (a word only one table has)
        const other = lang === 'es' ? /\b(Next|Quit|Back)=/ : /\b(Seguir|Salir|Atrás)=/;
        assert.doesNotMatch(scr.text().split('\n').at(-1), other, `${s.id} ${lang} key bar`);
      }
      // The pool screens again once the demo run has the split and the machines
      await new Promise((r) => setTimeout(r, 2500));
      for (const id of ['mesh', 'pooldash']) { app.go(id, { push: false }); app.render(); }
      app.modal = { title: 'x', lines: ['a'], labels: ['b', 'c'], focus: 0 };
      app.render();
      if (app.sharing) await app.sharing.stop();
      if (app.poolRun) await app.poolRun.stop();
    }
  }
});

test('Q asks to exit like F3, except while typing in a field', () => {
  const app = createApp({ fx: demoEffects({ fast: true }), scr: new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 }), S: ES, opts: {}, quit: () => {} });
  app.go('welcome', { push: false });
  app.onKey({ ch: 'q' });
  assert.equal(app.modal?.title, ES.exit.title);
  app.modal = null;
  app.go('profile', { push: false });
  app.st.profile.focus = 0; // the machine-name field
  app.onKey({ ch: 'Q' });
  assert.equal(app.modal, null);
  assert.match(app.profile.machine, /Q$/);
});

test('real mode: every screen is reachable (no "test build" stop)', async () => {
  const { realEffects } = await import('./lib/effects-real.mjs');
  const app = createApp({ fx: realEffects({ api: 'http://127.0.0.1:9' }), scr: new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 }), S: ES, opts: {}, quit: () => {} });
  assert.deepEqual(app.path, [...PATHS.base, ...PATHS.share]);
  app.go('menu', { push: false });
  assert.equal(app.screen.id, 'menu');
  assert.equal(app.modal, null);
});

test('version', async () => {
  const { VERSION, versionLine } = await import('./lib/version.mjs');
  assert.equal(VERSION, '0.2.3-test');
  assert.match(versionLine(), /^LLMule 0\.2\.3-test \(build /);
});

// Welcome: L switches the language everywhere; the version line stays clear of the buttons' shadow
test('welcome: L switches the language, the version never sits on a button shadow', () => {
  for (const [w, h] of [[80, 24], [80, 25], [100, 30], [140, 40]]) {
    const scr = new Screen({ out: { columns: w, rows: h, write() {} }, depth: 24 });
    const saved = [];
    const fx = { ...demoEffects({ fast: true }), savePrefs: (p) => saved.push(p) };
    const app = createApp({ fx, scr, S: ES, opts: { lang: 'es' }, quit: () => {} });
    app.go('welcome', { push: false });
    app.render();
    assert.match(scr.text(), /Paso 1 de 10/);
    // The shadow row under the buttons: no letter from the version line on a shadow cell
    const rows = scr.text().split('\n');
    const shadowY = rows.findIndex((l) => /▀▀▀▀/.test(l) && !/▄/.test(l) && rows[rows.indexOf(l) - 1]?.includes('Empezar'));
    if (shadowY > 0) {
      const line = rows[shadowY];
      const lastShadow = line.lastIndexOf('▀');
      const v = line.search(/v0\.|versión/);
      assert.ok(v === -1 || v > lastShadow + 1, `${w}x${h}: "${line}"`);
    }
    app.onKey({ ch: 'l' });
    app.render();
    assert.equal(app.S.lang, 'en');
    assert.deepEqual(saved, [{ lang: 'en' }]);
    assert.match(scr.text(), /Step 1 of 10/);
    assert.match(scr.text().split('\n').at(-1), /L=Español/);
    app.onKey({ ch: 'L' });
    assert.equal(app.S.lang, 'es');
  }
});

// A second machine on an account that already has a mule and a bio: the profile step shows them and,
// with no edits, sends nothing about them (muleWhoami setProfile would overwrite the account's)
test('profile: linking a second machine keeps the account\'s mule and bio', async () => {
  const account = { nick: 'andy', avatar: 3, bio: 'x' };
  const sent = [];
  const fx = {
    ...demoEffects({ fast: true }),
    me: async () => ({ ...account, tokensServed: 0 }),
    saveProfile: async (patch) => { sent.push(patch); Object.assign(account, patch); return { ok: true }; },
  };
  const scr = new Screen({ out: { columns: 100, rows: 30, write() {} }, depth: 24 });
  const app = createApp({ fx, scr, S: ES, opts: {}, quit: () => {} });
  app.key = 'llm_second';
  app.machine = structuredClone(DEMO_MACHINES[3090]);
  app.go('profile', { push: false });
  await app.loadAccount();
  await new Promise((r) => setTimeout(r, 10));
  app.render();
  assert.equal(app.profile.avatar, 3, 'prefilled from the account');
  assert.equal(app.profile.bio, 'x');
  assert.deepEqual(profileFields(app), ['machine', 'avatar', 'bio']); // the nick is the account's: not asked again
  assert.match(scr.text(), /violeta/);
  // The person renames this machine only, then ENTER through every field
  app.onKey({ ch: '2' });
  for (let i = 0; i < 3; i++) app.onKey('enter'); // machine → mule → bio → save
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(app.screen.id, 'menu');
  assert.deepEqual(sent, [], 'nothing of the account was sent');
  assert.deepEqual(account, { nick: 'andy', avatar: 3, bio: 'x' });
  assert.match(app.profile.machine, /2$/);

  // Changing the mule sends just the mule
  app.go('profile', { push: false });
  app.st.profile.focus = 1;
  app.onKey('right');
  app.st.profile.focus = 2;
  app.onKey('enter');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent, [{ avatar: 4 }]);
  assert.equal(account.bio, 'x');

  // llmule.xyz down while loading the account: nothing is sent unless edited (no reset to the defaults)
  const sent2 = [];
  const fx2 = { ...demoEffects({ fast: true }), me: async () => { throw Object.assign(new Error('down'), { code: 'offline' }); }, saveProfile: async (p) => { sent2.push(p); return {}; } };
  const app2 = createApp({ fx: fx2, scr, S: EN, opts: {}, quit: () => {} });
  app2.key = 'llm_x';
  app2.account = { nick: 'andy' };
  app2.go('profile', { push: false });
  await new Promise((r) => setTimeout(r, 10));
  app2.st.profile.focus = 2;
  app2.onKey('enter');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent2, []);
});

// ---------- chat models only (0.2.3: Andy's LM Studio had nomic-embed loaded and gemma not loaded) ----------
// /api/v0/models, as LM Studio answered on Andy's Mac (2026-11-16)
const LMS_EMBED_AND_VLM = { object: 'list', data: [
  { id: 'text-embedding-nomic-embed-text-v1.5', object: 'model', type: 'embeddings', publisher: 'nomic-ai', arch: 'nomic-bert', compatibility_type: 'gguf', quantization: 'Q4_K_M', state: 'loaded', max_context_length: 2048, loaded_context_length: 2048 },
  { id: 'google/gemma-4-e2b', object: 'model', type: 'vlm', publisher: 'google', arch: 'gemma4', compatibility_type: 'gguf', quantization: 'Q4_K_M', state: 'not-loaded', max_context_length: 131072 },
] };
const LMS_LLM_LOADED = { object: 'list', data: [
  { id: 'qwen/qwen3.5-9b', object: 'model', type: 'llm', state: 'not-loaded' },
  { id: 'text-embedding-nomic-embed-text-v1.5', object: 'model', type: 'embeddings', state: 'loaded' },
  { id: 'google/gemma-4-e2b', object: 'model', type: 'vlm', state: 'not-loaded' },
  { id: 'mistralai/ministral-3-8b', object: 'model', type: 'llm', state: 'loaded' },
] };
const LMS_ONLY_EMBED = { object: 'list', data: [
  { id: 'text-embedding-nomic-embed-text-v1.5', object: 'model', type: 'embeddings', state: 'loaded' },
  { id: 'text-embedding-bge-m3', object: 'model', type: 'embeddings', state: 'not-loaded' },
] };

test('engines: LM Studio v0 → chat models only, loaded first; the model to offer', () => {
  // embedding loaded + vlm not loaded → the vlm, and it has to be loaded
  const a = lmStudioModels(LMS_EMBED_AND_VLM);
  assert.deepEqual(a, { models: ['google/gemma-4-e2b'], loaded: [], skipped: 1 });
  assert.deepEqual(pickChatModel(a), { id: 'google/gemma-4-e2b', load: true });
  // an llm loaded → that one, nothing to load
  const b = lmStudioModels(LMS_LLM_LOADED);
  assert.deepEqual(b.models, ['mistralai/ministral-3-8b', 'qwen/qwen3.5-9b', 'google/gemma-4-e2b']);
  assert.deepEqual(b.loaded, ['mistralai/ministral-3-8b']);
  assert.deepEqual(pickChatModel(b), { id: 'mistralai/ministral-3-8b', load: false });
  // only embeddings → no chat model
  const c = lmStudioModels(LMS_ONLY_EMBED);
  assert.deepEqual(c, { models: [], loaded: [], skipped: 2 });
  assert.deepEqual(pickChatModel(c), { id: null, load: false });
  // An embedding model by name even if the type says otherwise
  assert.deepEqual(lmStudioModels({ data: [{ id: 'my-embed-thing', type: 'llm', state: 'loaded' }] }).models, []);
});

test('engines: embedding models dropped by name on Ollama / vLLM / llama-server', () => {
  for (const id of ['nomic-embed-text:latest', 'mxbai-embed-large', 'all-minilm:l6-v2', 'bge-m3', 'BAAI/bge-reranker-v2-m3', 'Qwen/Qwen3-Embedding-0.6B', 'snowflake-arctic-embed2', 'intfloat/e5-mistral-7b-instruct', 'thenlper/gte-large']) {
    assert.ok(isEmbeddingId(id), id);
  }
  for (const id of ['qwen3.5:9b', 'gemma4:12b', 'llama3.2:latest', 'google/gemma-4-e2b', 'deepseek-v4-flash', 'llmule-local', 'gpt-oss-20b', 'Qwen/Qwen3.6-35B-A3B']) {
    assert.ok(!isEmbeddingId(id), id);
  }
  assert.deepEqual(chatModels(['qwen3.5:9b', 'nomic-embed-text:latest', 'gemma4:12b']), { models: ['qwen3.5:9b', 'gemma4:12b'], loaded: null, skipped: 1 });
  // Unknown loaded state (Ollama loads on demand): nothing to load
  assert.deepEqual(pickChatModel(chatModels(['qwen3.5:9b'])), { id: 'qwen3.5:9b', load: false });
});

// A fake LM Studio: /api/v0/models (or not, like an old one), /v1/models, and its refusal of a chat request
async function fakeEngine({ v0 = LMS_EMBED_AND_VLM, chat } = {}) {
  const { createServer } = await import('node:http');
  const srv = createServer((req, res) => {
    const json = (code, d) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (req.url === '/api/v0/models') return v0 ? json(200, v0) : json(404, { error: 'Unexpected endpoint or method. (GET /api/v0/models)' });
    if (req.url === '/v1/models') return json(200, { object: 'list', data: (v0 || LMS_EMBED_AND_VLM).data.map((m) => ({ id: m.id, object: 'model', owned_by: 'organization_owner' })) });
    if (req.url === '/v1/chat/completions') return chat(req, res, json);
    json(404, {});
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/v1`, close: () => new Promise((r) => srv.close(r)) };
}

test('engines: probe LM Studio by /api/v0/models, fall back to /v1/models (embeddings dropped either way)', async () => {
  const lm = await fakeEngine();
  assert.deepEqual(await probeEngine(lm.url, 1500, { lmstudio: true }), { up: true, models: ['google/gemma-4-e2b'], loaded: [], skipped: 1 });
  assert.deepEqual(await probeEngine(lm.url), { up: true, models: ['google/gemma-4-e2b'], loaded: null, skipped: 1 });
  await lm.close();
  const old = await fakeEngine({ v0: null });
  assert.deepEqual(await probeEngine(old.url, 1500, { lmstudio: true }), { up: true, models: ['google/gemma-4-e2b'], loaded: null, skipped: 1 });
  await old.close();
});

test('test question: the engine\'s own error goes up to the screen, in both languages', async () => {
  const NOT_LOADED = 'No models loaded. Please load a model in the developer page or use the \'lms load\' command.';
  assert.equal(engineErrorText(400, JSON.stringify({ error: NOT_LOADED })), NOT_LOADED);
  assert.equal(engineErrorText(404, JSON.stringify({ error: { message: 'model "x" not found', type: 'invalid_request_error' } })), 'model "x" not found');
  assert.equal(engineErrorText(500, 'upstream\n  exploded'), 'upstream exploded');
  assert.equal(engineErrorText(502, ''), 'HTTP 502');
  assert.equal(engineErrorText(400, JSON.stringify({ error: 'x'.repeat(500) })).length, 200);

  const { realEffects } = await import('./lib/effects-real.mjs');
  const fx = realEffects({ api: 'http://127.0.0.1:9' });
  const lm = await fakeEngine({ chat: (req, res, json) => json(400, { error: NOT_LOADED }) });
  const row = { id: 'lmstudio', name: 'LM Studio', url: lm.url, up: true, models: ['google/gemma-4-e2b'] };
  const err = await fx.testQuestion(row, { id: 'google/gemma-4-e2b', local: 'google/gemma-4-e2b' }, '?', () => {}).catch((e) => e);
  assert.equal(err.code, 'engine_error');
  assert.equal(err.detail, NOT_LOADED);
  assert.equal(err.status, 400);
  await lm.close();
  // 200 with an error inside (LM Studio does that on some endpoints)
  const lm2 = await fakeEngine({ chat: (req, res, json) => json(200, { error: 'Unexpected endpoint or method.' }) });
  const err2 = await fx.testQuestion({ ...row, url: lm2.url }, { id: 'm' }, '?', () => {}).catch((e) => e);
  assert.equal(err2.detail, 'Unexpected endpoint or method.');
  await lm2.close();
  // Nobody listening
  const err3 = await fx.testQuestion({ ...row, url: 'http://127.0.0.1:9/v1' }, { id: 'm' }, '?', () => {}).catch((e) => e);
  assert.equal(err3.code, 'engine_error');
  assert.ok(err3.detail.length > 0);

  // On the screen: the friendly line, then what the engine said
  for (const S of [ES, EN]) {
    const scr = new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 });
    const fxd = { ...demoEffects({ fast: true }), testQuestion: async () => { throw err; } };
    const app = createApp({ fx: fxd, scr, S, opts: {}, quit: () => {} });
    app.engine = row;
    app.model = { id: 'google/gemma-4-e2b', local: 'google/gemma-4-e2b' };
    app.go('test', { push: false });
    await new Promise((r) => setTimeout(r, 10));
    app.render();
    const text = scr.text().replace(/\s+/g, ' ');
    assert.ok(text.includes(S.test.failed), `${S.lang} friendly line`);
    assert.ok(text.includes(S.test.engineSaid('No models loaded.')), `${S.lang} engine's words`);
    assert.ok(text.includes('lms load'), `${S.lang} the rest of it`);
  }
});

test('lms: found in ~/.lmstudio/bin or on the PATH; load runs it, reports progress and errors', { skip: process.platform === 'win32' }, async () => {
  const { lmsPath, lmsLoad } = await import('./lib/effects-real.mjs');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'llmule-lms-'));
  assert.equal(lmsPath({ home, envPath: '', win: false }), null);
  const bin = path.join(home, 'bin2');
  fs.mkdirSync(bin);
  const fake = path.join(bin, 'lms');
  // Prints a progress bar with \r, like lms; fails for the model called "broken"
  fs.writeFileSync(fake, '#!/bin/sh\nif [ "$2" = "broken" ]; then echo "Error: Failed to load model: not enough memory" >&2; exit 1; fi\nprintf "Loading [####      ] 40.00%%\\r" >&2\nprintf "Loading [##########] 100.00%%\\r" >&2\necho "Model loaded successfully ($2 $3)." >&2\n');
  fs.chmodSync(fake, 0o755);
  assert.equal(lmsPath({ home, envPath: `/nope${path.delimiter}${bin}`, win: false }), fake);
  fs.mkdirSync(path.join(home, '.lmstudio', 'bin'), { recursive: true });
  fs.copyFileSync(fake, path.join(home, '.lmstudio', 'bin', 'lms'));
  assert.equal(lmsPath({ home, envPath: bin, win: false }), path.join(home, '.lmstudio', 'bin', 'lms'));

  const lines = [];
  await lmsLoad(fake, 'google/gemma-4-e2b', (l) => lines.push(l));
  assert.ok(lines.length >= 1 && lines.every((l) => !/[\r\n]/.test(l)), 'one clean line at a time');
  assert.equal(lines.at(-1), 'Model loaded successfully (google/gemma-4-e2b -y).');
  const e = await lmsLoad(fake, 'broken').catch((x) => x);
  assert.equal(e.code, 'lms_failed');
  assert.equal(e.message, 'Error: Failed to load model: not enough memory');
  // No shell: an id with a ; never reaches a command line
  assert.equal((await lmsLoad(fake, 'x; rm -rf ~').catch((x) => x)).code, 'lms_failed');
  assert.equal((await lmsLoad(null, 'x').catch((x) => x)).code, 'lms_missing');
  fs.rmSync(home, { recursive: true, force: true });
});

test('LM Studio with the chat model not loaded: the model step asks to load it (lms, after a yes), then goes on', async () => {
  for (const S of [ES, EN]) {
    const scr = new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 });
    const fx = demoEffects({ fast: true, engine: 'lmstudio', lang: S.lang });
    const app = createApp({ fx, scr, S, opts: {}, quit: () => {} });
    app.machine = structuredClone(DEMO_MACHINES.mac);
    app.go('engine', { push: false });
    await new Promise((r) => setTimeout(r, 500));
    app.render();
    const start = (t) => t.split(' ').slice(0, 4).join(' '); // the hint wraps: its first words are on one line
    assert.ok(scr.text().includes(start(S.engine.noneLoaded('google/gemma-4-e2b'))), `${S.lang} engine hint`);
    app.onKey('enter');
    assert.equal(app.screen.id, 'model');
    const rows = app.screen.rows(app);
    assert.equal(rows[0].id, 'google/gemma-4-e2b');
    assert.ok(!rows.some((m) => isEmbeddingId(m.id)), 'no embedding model offered');
    assert.equal(rows[0].loaded, false);
    app.onKey('enter');
    assert.equal(app.st.model.phase, 'needLoad');
    app.render();
    assert.ok(scr.text().includes('lms load google/gemma-4-e2b'), 'shows the command');
    assert.equal(app.status.model, '', 'nothing in the status bar yet');
    app.onKey({ ch: 'L' });
    assert.equal(app.modal?.title, S.model.loadTitle, 'asks first');
    app.render();
    app.onKey('enter'); // yes (focused)
    assert.equal(app.st.model.phase, 'lmsLoading');
    await new Promise((r) => setTimeout(r, 300));
    app.render();
    assert.match(scr.text(), /Loading model|Model loaded/);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(app.st.model.phase, 'done');
    assert.equal(app.status.model, 'google/gemma-4-e2b');
    assert.deepEqual(app.engine.loaded, ['google/gemma-4-e2b']);
    const seg = app.segments().find((x) => x.label === S.status.model);
    assert.equal(seg.value, 'google/gemma-4-e2b', 'the status bar shows the chat model');
    assert.doesNotMatch(app.segments().map((x) => x.value).join(' '), /embed/);
  }
  // No lms: say how to load it by hand; "I loaded it" looks again
  const scr = new Screen({ out: { columns: 100, rows: 30, write() {} }, depth: 24 });
  const fx = { ...demoEffects({ fast: true, engine: 'lmstudio' }), lmsPath: () => null };
  const app = createApp({ fx, scr, S: ES, opts: {}, quit: () => {} });
  app.machine = structuredClone(DEMO_MACHINES.mac);
  app.engine = (await fx.detectEngines())[1];
  app.go('model', { push: false });
  app.onKey('enter');
  app.render();
  assert.match(scr.text(), /Select a model to load/);
  app.onKey({ ch: 'L' });
  assert.equal(app.modal, null, 'no lms, no load button');
  app.onKey('enter');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(app.st.model.phase, 'needLoad');
  assert.equal(app.st.model.still, true);
  app.render();
  assert.ok(scr.text().includes(ES.model.stillNot('google/gemma-4-e2b')));
});

test('LM Studio with only embedding models: not a choice, and the engine step says why', async () => {
  const scr = new Screen({ out: { columns: 80, rows: 24, write() {} }, depth: 24 });
  const fx = { ...demoEffects({ fast: true }), detectEngines: async () => [
    { id: 'ollama', name: 'Ollama', url: 'http://localhost:11434/v1', up: false, models: [] },
    { id: 'lmstudio', name: 'LM Studio', url: 'http://localhost:1234/v1', up: true, ...lmStudioModels(LMS_ONLY_EMBED) },
  ] };
  const app = createApp({ fx, scr, S: ES, opts: {}, quit: () => {} });
  app.go('engine', { push: false });
  await new Promise((r) => setTimeout(r, 10));
  app.render();
  const text = scr.text().replace(/\s+/g, ' ');
  assert.ok(text.includes(ES.engine.onlyEmbed));
  assert.ok(scr.text().includes(ES.engine.embedOnly('LM Studio').split(' ').slice(0, 5).join(' ')));
  app.onKey('enter');
  assert.equal(app.screen.id, 'install', 'the download path');
});
