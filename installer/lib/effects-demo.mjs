// --demo: every outside effect faked. No downloads, no installs, no network, no files written.
// Same interface as effects-real.mjs, so the screens can't tell the difference — that's the point:
// what the reel shows is the real flow, only the world around it is fake.

import { strings } from './strings.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DEMO_MACHINES = {
  3090: {
    platform: 'linux', arch: 'x64', os: 'Ubuntu 24.04.3 LTS', cpu: 'AMD Ryzen 9 5950X 16-Core', cores: 32, ramGB: 64,
    host: 'mula-box', gpus: [{ vendor: 'nvidia', name: 'NVIDIA GeForce RTX 3090', vramGB: 24, usedGB: 0.4 }], apple: null, vramGB: 24,
  },
  mac: {
    platform: 'darwin', arch: 'arm64', os: 'macOS 26.1', cpu: 'Apple M4 Pro', cores: 14, ramGB: 48, host: 'macbook-de-ana',
    gpus: [], apple: { chip: 'Apple M4 Pro', unifiedGB: 48, usableGB: 31 }, vramGB: 31,
  },
  small: {
    platform: 'win32', arch: 'x64', os: 'Windows 11 Home', cpu: 'Intel Core i5-12400F', cores: 12, ramGB: 16, host: 'PC-GAMER',
    gpus: [{ vendor: 'nvidia', name: 'NVIDIA GeForce RTX 3060 Laptop GPU', vramGB: 6, usedGB: 0.6 }], apple: null, vramGB: 6,
  },
  cpu: {
    platform: 'linux', arch: 'x64', os: 'Debian GNU/Linux 13', cpu: 'Intel Core i7-8550U', cores: 8, ramGB: 16, host: 'thinkpad',
    gpus: [], apple: null, vramGB: 0,
  },
};

const ANSWERS = {
  es: 'Una mula es la cruza de un burro y una yegua: fuerte, terca y capaz de cargar mucho más de lo que parece. Como tu placa.',
  en: 'A mule is a cross between a donkey and a horse: strong, stubborn, and able to carry far more than it looks. Like your GPU.',
};

// Demo pools: invented, in the shape mulePools answers (names start with "demo/" so no screen passes them off
// as real). Sizes and layers from the meshllm layer packages (2026-11-15); nicks and machines are made up.
const M = (nick, gpu, gb, from, to, extra = {}) => ({ nick, gpu, gb, os: 'Linux', alive: true, state: 'ready', lastBeatSec: 4, from, to, head: false, you: false, ...extra });
export const DEMO_MODELS = [
  { id: 'qwen3-235b-a22b', name: 'Qwen3 235B-A22B', quant: 'UD-Q4_K_XL', sizeGB: 134.7, layers: 94 },
  { id: 'nemotron-3-super-120b', name: 'Nemotron 3 Super 120B-A12B', quant: 'UD-Q4_K_XL', sizeGB: 84.5, layers: 88 },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', quant: 'UD-Q4_K_XL', sizeGB: 155.3, layers: 43 },
  { id: 'kimi-k3', name: 'Kimi K3', quant: 'UD-Q4_K_XL', sizeGB: 1512.9, layers: 93 },
  { id: 'llama-3.2-1b-test', name: 'Llama 3.2 1B (prueba)', quant: 'Q4_K_M', sizeGB: 1.0, layers: 16, test: true },
];
const pool = (id, name, model, extra) => {
  const m = DEMO_MODELS.find((x) => x.id === model);
  return { id, name, model, modelName: m.name, quant: m.quant, sizeGB: m.sizeGB, layers: m.layers, publicModel: `pool/${model}`, open: true, maxNodes: 12, tokToday: 0, tps: null, state: 'open', you: { member: false, owner: false, head: false }, ...extra };
};
export const DEMO_POOLS = [
  pool('demo1', 'demo/qwen-235 del club', 'qwen3-235b-a22b', {
    owner: 'gpu_gaucho', head: 'gpu_gaucho', nodes: 4, members: 4, haveGB: 120, needGB: 145.5, missingGB: 25.5, cardsMissing: 2,
    machines: [M('gpu_gaucho', '2× RTX 3090', 48, null, null, { head: true }), M('lu', 'DGX Spark', 32, null, null), M('pibe-cuda', 'RTX 4090', 24, null, null), M('la-rusa', 'RTX 3090', 24, null, null)],
  }),
  pool('demo2', 'demo/nemotron de neuralnona', 'nemotron-3-super-120b', {
    owner: 'neuralnona', head: 'neuralnona', state: 'running', nodes: 4, members: 4, haveGB: 120, needGB: 91.3, missingGB: 0, cardsMissing: 0, tps: 7.4, tokToday: 18230,
  }),
  pool('demo3', 'demo/kimi gigante', 'kimi-k3', { owner: 'carpincho-ia', head: 'carpincho-ia', nodes: 9, members: 9, haveGB: 400, needGB: 1634, missingGB: 1234, cardsMissing: 57 }),
];

const NICKS = ['carpincho-ia', 'gpu_gaucho', 'lagarto', 'mate-amargo', 'pibe-cuda', 'anon', 'la-rusa', 'neuralnona'];

// opts.lang is read live: the L key on the welcome screen changes it (app.setLang)
export function demoEffects(opts = {}) {
  const { machine = '3090', engine = 'none', fast = false } = opts;
  const lang = () => opts.lang || 'es';
  const T = (ms) => (fast ? ms / 4 : ms);
  const m = DEMO_MACHINES[machine] || DEMO_MACHINES[3090];
  const world = { siteDown: false, nodeDown: false, served: 1_183_402, sessionTok: 0, poolTok: 0, poolMine: 0 };
  let linkStarted = 0;
  let lmLoaded = false;
  const lmRow = () => ({ up: true, models: ['google/gemma-4-e2b'], loaded: lmLoaded ? ['google/gemma-4-e2b'] : [], skipped: 1 });

  return {
    demo: true,
    world,

    async detectMachine() {
      await sleep(T(900));
      return structuredClone(m);
    },

    async detectEngines() {
      await sleep(T(1200));
      const rows = [
        { id: 'ollama', name: 'Ollama', url: 'http://localhost:11434/v1', up: false, models: [] },
        { id: 'lmstudio', name: 'LM Studio', url: 'http://localhost:1234/v1', up: false, models: [] },
        { id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:9931/v1', up: false, models: [] },
        { id: 'openai', name: 'vLLM / OpenAI', url: 'http://127.0.0.1:8000/v1', up: false, models: [] },
      ];
      if (engine === 'ollama') Object.assign(rows[0], { up: true, models: ['qwen3.5:9b', 'gemma4:12b', 'llama3.2:latest'], loaded: null, skipped: 1 });
      // --engine lmstudio: what Andy's Mac had (2026-11-16): an embedding model loaded, the chat model not
      if (engine === 'lmstudio') Object.assign(rows[1], lmRow());
      return rows;
    },
    async refreshEngine(row) {
      await sleep(T(400));
      return row.id === 'lmstudio' ? { ...row, ...lmRow() } : row;
    },
    lmsPath: () => (engine === 'lmstudio' ? '~/.lmstudio/bin/lms' : null),
    async lmsLoad(id, onLine) {
      for (let i = 0; i <= 20; i++) {
        onLine(`Loading model "${id}"... [${'█'.repeat(i)}${' '.repeat(20 - i)}] ${(i * 5).toFixed(2)}%`);
        await sleep(T(120));
      }
      onLine(`Model loaded successfully in ${fast ? '0.6' : '2.4'}s.`);
      lmLoaded = true;
    },

    async siteStatus() {
      await sleep(150);
      return world.siteDown ? 'down' : 'up';
    },

    async savedKey() {
      return null;
    },

    // steps: download → verify → unpack. onProgress({ step, frac, bytes, total, rate })
    async installEngine(asset, onProgress) {
      const total = 31_457_280 * asset.files.length;
      for (let f = 0; f <= 1; f += 0.04) {
        onProgress({ step: 'download', frac: f, bytes: total * f, total, rate: 18_400_000 });
        await sleep(T(110));
      }
      onProgress({ step: 'verify', frac: 1, bytes: total, total });
      await sleep(T(700));
      onProgress({ step: 'unpack', frac: 1, bytes: total, total });
      await sleep(T(700));
      return { id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:9931/v1', up: false, models: [], ours: true };
    },

    async downloadModel(model, onProgress) {
      const total = model.bytes;
      const steps = 70;
      for (let i = 0; i <= steps; i++) {
        while (world.siteDown) await sleep(200); // a cut connection waits, it doesn't fail
        const jitter = 1 + Math.sin(i / 3) * 0.08;
        onProgress({ step: 'download', frac: i / steps, bytes: (total * i) / steps, total, rate: 96_000_000 * jitter });
        await sleep(T(90));
      }
      onProgress({ step: 'verify', frac: 1, bytes: total, total });
      await sleep(T(900));
      return { path: `~/.llmule/models/${model.file}` };
    },

    // onState('loading' | 'up')
    async loadModel(engineRow, model, onState) {
      onState('loading');
      await sleep(T(2600));
      onState('up');
      return { ...engineRow, up: true, models: [model?.id || engineRow.models[0]] };
    },

    async engineState() {
      return 'up';
    },

    async startLink() {
      linkStarted = Date.now();
      return { code: '7K3Q-WMX9', url: 'https://llmule.xyz/link', expiresAt: Date.now() + 10 * 60 * 1000, interval: fast ? 0.3 : 1.2 };
    },
    openBrowser: () => true,

    // → { status: 'pending' } | { status: 'approved', key, email, nick }
    async pollLink() {
      await sleep(400);
      if (world.siteDown) throw Object.assign(new Error('site down'), { code: 'offline' });
      if (Date.now() - linkStarted < T(6000)) return { status: 'pending' };
      return { status: 'approved', key: 'llm_demo', email: strings(lang()).demo.email, nick: null };
    },

    async saveProfile() {
      await sleep(T(600));
      return { ok: true };
    },
    saveState() {},
    loadState: () => ({}),
    async cleanup() {},

    async testQuestion(engineRow, model, question, onText) {
      const text = ANSWERS[lang()] || ANSWERS.es;
      await sleep(T(900)); // first token
      const words = text.split(' ');
      let out = '';
      const t = Date.now();
      for (const w of words) {
        out += (out ? ' ' : '') + w;
        onText(out);
        await sleep(T(55));
      }
      const tokens = Math.round(text.length / 3.6);
      return { text: out, ms: Date.now() - t + T(900), tokens, tokPerSec: fast ? 112 : 86 };
    },

    async createShortcuts({ autostart }) {
      await sleep(T(500));
      const es = lang() === 'es'; // Windows names those folders in the user's language
      const desk = { darwin: '~/Desktop/LLMule.command', win32: es ? 'Escritorio\\LLMule.lnk' : 'Desktop\\LLMule.lnk', linux: '~/Desktop/llmule.desktop' }[m.platform];
      return { desktop: desk, autostart: autostart ? { darwin: '~/Library/LaunchAgents/xyz.llmule.plist', win32: es ? 'Inicio\\LLMule.lnk' : 'Startup\\LLMule.lnk', linux: '~/.config/autostart/llmule.desktop' }[m.platform] : null };
    },

    // Fake network traffic: a job every few seconds. onEvent({ type: 'start'|'done'|'online'|'waiting', ... })
    startSharing(cfg, onEvent) {
      let stopped = false;
      let n = 0;
      (async () => {
        onEvent({ type: 'starting' });
        await sleep(T(800));
        onEvent({ type: 'online', models: [cfg.model] });
        await sleep(T(900));
        while (!stopped) {
          if (world.siteDown) {
            onEvent({ type: 'waiting', why: 'site' });
            while (world.siteDown && !stopped) await sleep(300);
            if (stopped) break;
            onEvent({ type: 'online', models: [cfg.model] });
          }
          const id = Math.random().toString(16).slice(2, 10);
          const from = NICKS[n++ % NICKS.length];
          onEvent({ type: 'start', id, model: cfg.model, from });
          const tok = 40 + Math.floor(Math.random() * 520);
          const ms = Math.round(tok / 0.09);
          await sleep(T(Math.min(ms, 3200)));
          if (stopped) break;
          world.sessionTok += tok;
          onEvent({ type: 'done', id, model: cfg.model, tok, ms, from });
          await sleep(T(1200 + Math.random() * 2600));
        }
      })();
      return {
        stop: async () => {
          stopped = true;
          onEvent({ type: 'stopped' });
        },
      };
    },

    // ---------- pool mode ----------
    async listPools() {
      await sleep(T(700));
      return { pools: structuredClone(DEMO_POOLS), models: structuredClone(DEMO_MODELS) };
    },

    // mulePools, faked: join puts you in the machine list; create makes a pool of yours
    async pools(key, op, body) {
      await sleep(T(400));
      const me = { nick: 'mula-andina', gpu: m.gpus?.[0]?.name.replace(/^NVIDIA GeForce /, '') || m.apple?.chip || 'CPU', gb: m.vramGB, you: true };
      if (op === 'join') {
        const p = structuredClone(DEMO_POOLS.find((x) => x.id === body.id) || DEMO_POOLS[0]);
        p.machines = [...(p.machines || []), M(me.nick, me.gpu, me.gb, null, null, { you: true, state: 'joining' })];
        p.you = { member: true, owner: false, head: false };
        p.haveGB += me.gb; p.missingGB = Math.max(0, Math.round((p.needGB - p.haveGB) * 10) / 10); p.nodes++;
        return { pool: p, role: 'worker' };
      }
      if (op === 'create') {
        const mod = DEMO_MODELS.find((x) => x.id === body.model);
        const need = Math.round(mod.sizeGB * 1.08 * 10) / 10;
        const p = pool('demo9', `${mod.name} de ${me.nick}`, mod.id, { owner: me.nick, head: body.headLater ? null : me.nick, open: !!body.open, nodes: 1, members: 1,
          haveGB: me.gb, needGB: need, missingGB: Math.max(0, Math.round((need - me.gb) * 10) / 10), cardsMissing: Math.ceil(Math.max(0, need - me.gb) / 22),
          machines: [M(me.nick, me.gpu, me.gb, null, null, { you: true, head: !body.headLater, state: 'joining' })], you: { member: true, owner: true, head: !body.headLater } });
        return { pool: p, role: body.headLater ? 'worker' : 'head' };
      }
      if (op === 'invite') return { code: 'QW7K-M3X9', expiresIn: 86400 };
      return { ok: true, pool: body.pool };
    },

    // The live pool: install → mesh → layers → ready, then tokens flowing; X knocks a machine out
    startPoolRun({ pool, role, strings: S = () => strings(lang()) }, onLog) {
      const R = () => S().run;
      const state = { phase: 'install', role, pool: structuredClone(pool), install: { step: 'download', frac: 0, bytes: 0, total: 67_020_091, file: 'mesh-llm-v0.79.0' }, peers: [], rtt: null, path: null, downloaded: 0, tps: null, startedMs: Date.now() };
      let stopped = false;
      const me = state.pool.machines.find((x) => x.you);
      (async () => {
        for (let f = 0; f <= 1 && !stopped; f += 0.05) { state.install = { ...state.install, frac: f, bytes: f * 67_020_091, rate: 31_000_000 }; await sleep(T(90)); }
        state.install = { step: 'done' };
        state.phase = role === 'head' ? 'starting' : 'joining';
        await sleep(T(1400));
        // The other machines show up (for a pool you just created, three friends with the code)
        if (state.pool.machines.length < 3) state.pool.machines.push(M('lu', 'DGX Spark', 32, null, null), M('pibe-cuda', 'RTX 4090', 24, null, null), M('la-rusa', 'RTX 3090', 24, null, null));
        state.peers = state.pool.machines.filter((x) => !x.you).map((x, i) => ({ id: x.nick, rtt: 18 + i * 6 }));
        state.rtt = 18; state.path = 'direct';
        state.phase = 'loading';
        // The split, as mesh-llm would report it: contiguous ranges by memory
        const L = state.pool.layers;
        const total = state.pool.machines.reduce((a, x) => a + x.gb, 0);
        let at = 0;
        state.pool.machines.forEach((x, i, all) => {
          const n = i === all.length - 1 ? L - at : Math.max(1, Math.round((x.gb / total) * L));
          x.from = at; x.to = at + n; at += n;
        });
        const mineGB = state.pool.sizeGB * (me.to - me.from) / L * 1e9;
        state.status = { nodeId: 'mine', stages: [{ node: 'mine', start: me.from, end: me.to, state: 'starting' }], ready: false };
        for (let i = 0; i <= 40 && !stopped; i++) { state.downloaded = (mineGB * i) / 40; await sleep(T(110)); }
        state.status.ready = true;
        state.status.stages[0].state = 'ready';
        state.pool.machines.forEach((x) => { x.state = 'ready'; });
        state.pool.state = 'running';
        state.phase = 'ready';
        onLog('info', R().ready);
        let n = 0;
        while (!stopped) {
          if (world.nodeDown) {
            const gone = state.pool.machines.find((x) => !x.you && !x.head);
            gone.alive = false;
            state.phase = 'loading';
            state.startedMs = 0;
            onLog('fail', R().nodeDown(gone.nick));
            onLog('warn', R().replan);
            while (world.nodeDown && !stopped) await sleep(300);
            if (stopped) break;
            gone.alive = true;
            await sleep(T(1200));
            state.phase = 'ready';
            onLog('info', R().nodeBack(gone.nick));
          }
          const from = NICKS[n++ % NICKS.length];
          const tok = 60 + Math.floor(Math.random() * 300);
          state.tps = Math.round((4.2 + Math.random() * 1.4) * 10) / 10;
          await sleep(T(Math.min(3500, (tok / state.tps) * 120)));
          if (stopped || world.nodeDown) continue;
          state.pool.tokToday = (state.pool.tokToday || 0) + tok;
          world.served += Math.round((tok * (me.to - me.from)) / L);
          onLog('done', R().jobFrom(from, tok, S().dec(state.tps)));
          await sleep(T(1500 + Math.random() * 2500));
        }
      })();
      return { state, stop: async () => { stopped = true; }, leave: async () => { stopped = true; } };
    },

    // What the network says about you (phase 2: a key-authenticated endpoint)
    async me() {
      await sleep(100);
      return { nick: null, tokensServed: world.served + world.sessionTok, tokensServedWeek: 84_210 + world.sessionTok, rank: 4, rankWeek: 2 };
    },
  };
}
