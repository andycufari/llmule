#!/usr/bin/env node
// LLMule installer + launcher. One program: the first run walks you through setup (full-screen,
// DOS/Win9x setup style); after that, the desktop icon opens it straight on the panel.
// Zero dependencies, ANSI by hand. Shares through ../provider/mule-provider.mjs, unchanged in spirit.
//
//   node llmule.mjs                  setup, or the panel if setup is done (~/.llmule/state.json)
//   node llmule.mjs --setup          setup again
//   node llmule.mjs --demo           the whole flow with every outside effect faked
//        --machine=3090|mac|small|cpu   which fake machine (demo)
//        --engine=none|ollama           a fake engine already running (demo)
//        --start=<screen>               jump to a screen with the steps before it filled (demo)
//                                       share:   welcome machine link profile menu engine install model test icon done dash
//                                       pool:    pools contrib mesh pooldash · create: poolnew (--mode=poolnew)
//        --fast                         shorter fake waits (screenshots)
//   node llmule.mjs --lang=en|es     the language (else the saved one, else the system locale)
//   node llmule.mjs --uninstall      removes the icons it made (and asks about ~/.llmule)
//   node llmule.mjs --version | --help
//   node llmule.mjs __provider       internal: run the provider (the app spawns itself with this)
//
// Env: LLMULE_API (default https://llmule.xyz) · LLMULE_HOME (default ~/.llmule) · LLMULE_COLORS=16|256|24 ·
//      LLMULE_ASCII=1 · tests: LLMULE_DESKTOP, LLMULE_AUTOSTART_DIR, LLMULE_MESH_* (lib/mesh.mjs)

const argv = process.argv.slice(2);

const flagOf = (name, def) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const next = argv[argv.indexOf(a) + 1]; // --lang en
  return name === 'lang' && next && !next.startsWith('-') ? next : true;
};

// The language: --lang, else ~/.llmule/prefs.json (the L key on the welcome screen), else the system locale.
// The demo writes nothing, so it doesn't save either; a real run remembers an explicit --lang.
async function language() {
  const { pickLang, normLang } = await import('./lib/strings.mjs');
  const { readPrefs, writePrefs } = await import('./lib/prefs.mjs');
  const flag = flagOf('lang', null);
  const lang = pickLang({ flag, saved: readPrefs().lang });
  return { lang, explicit: !!normLang(flag), save: (l) => writePrefs({ lang: l }) };
}

if (argv.includes('--version') || argv.includes('-v')) {
  const { versionLine } = await import('./lib/version.mjs');
  console.log(versionLine());
  process.exit(0);
}
if (argv.includes('--help') || argv.includes('-h')) {
  const { strings } = await import('./lib/strings.mjs');
  process.stdout.write(strings((await language()).lang).cli.help);
  process.exit(0);
}

if (argv.includes('--uninstall')) {
  const { strings } = await import('./lib/strings.mjs');
  const T = strings((await language()).lang).cli;
  const { removeShortcuts } = await import('./lib/shortcuts.mjs');
  const { P, tilde } = await import('./lib/paths.mjs');
  const gone = removeShortcuts();
  gone.forEach((f) => console.log(T.removed(tilde(f))));
  console.log(`${gone.length ? '' : T.noIcons}${T.rest(tilde(P.home))}`);
  process.exit(0);
}

if (argv.includes('__provider')) {
  // The provider reads its config from env (set by provider-run.mjs) and starts on import
  await import('../provider/mule-provider.mjs');
} else {
  await main();
}

async function main() {
  const flag = flagOf;
  const lang = await language();
  const opts = {
    demo: !!flag('demo', false),
    machine: flag('machine', '3090'),
    engine: flag('engine', 'none'),
    start: flag('start', ''),
    mode: flag('mode', 'share'), // demo: the path picked in the menu (and, with --start=icon, whose icon step)
    setup: !!flag('setup', false),
    fast: !!flag('fast', false),
    lang: lang.lang,
    verbose: !!flag('verbose', false),
  };
  const { strings } = await import('./lib/strings.mjs');
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error(strings(opts.lang).cli.needTty);
    process.exit(1);
  }
  if (lang.explicit && !opts.demo) lang.save(opts.lang);

  const { Screen, enter, SIZE_QUERY } = await import('./lib/term.mjs');
  const { createApp, startWatchers } = await import('./lib/app.mjs');
  const fx = opts.demo
    ? (await import('./lib/effects-demo.mjs')).demoEffects(opts)
    : (await import('./lib/effects-real.mjs')).realEffects();

  const scr = new Screen();
  let restore = () => {};
  let app;
  const quit = async (code = 0) => {
    app.quitting = true;
    const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
    if (app.poolRun) await within(app.poolRun.stop(), 9000);
    if (app.sharing) {
      const s = app.sharing;
      app.sharing = null;
      await within(s.stop(), 7000);
    }
    if (fx.cleanup) await within(fx.cleanup(), 5000); // our llama-server
    restore();
    process.exit(code);
  };
  app = createApp({ fx, scr, S: strings(opts.lang), opts, quit });

  restore = enter();
  process.on('uncaughtException', (e) => {
    restore();
    console.error(e);
    process.exit(1);
  });
  // SIGTERM/SIGHUP (closing the terminal window): stop sharing cleanly. SIGTERM can't be hooked on Windows.
  for (const sig of ['SIGTERM', 'SIGHUP']) {
    try { process.on(sig, () => quit(0)); } catch { /* not on this OS */ }
  }
  // Resize: SIGWINCH (Node's 'resize') when it reaches us; the terminal's own answer to a size query once a
  // second when it doesn't (macOS `script` swallows it). Either way: new buffer, full clear and repaint.
  let lastWinch = 0;
  const resizeTo = (w, h) => {
    if (w === scr.w && h === scr.h) return;
    scr.resize(w, h);
    app.dirty = true;
  };
  process.stdout.on('resize', () => {
    lastWinch = Date.now();
    resizeTo(process.stdout.columns, process.stdout.rows);
  });
  // An answer that left before the last SIGWINCH may carry the old size: trust SIGWINCH for a moment
  app.onTermSize = (w, h) => { if (Date.now() - lastWinch > 1500) resizeTo(w, h); };
  // Not on Windows: the console reports its own resizes there (libuv polls it), and nothing wraps it like `script`
  if (process.platform !== 'win32') {
    const askSize = () => process.stdout.write(SIZE_QUERY);
    setInterval(askSize, 1000).unref();
    askSize();
  }
  process.stdin.on('data', (d) => app.feed(d));

  const saved = !opts.demo && !opts.setup ? fx.loadState() : {};
  if (opts.demo && opts.start) await prefill(app, opts.start);
  else if (saved.done && (await fx.savedKey())) await resume(app, saved);
  else {
    if (opts.demo && (opts.mode === 'pool' || opts.mode === 'poolnew')) app.setMode(opts.mode); // the menu comes with it picked
    app.go('welcome', { push: false });
  }
  startWatchers(app);

  // Animations run at ~8 fps; a frame only writes the cells that changed
  setInterval(() => {
    app.tick++;
    if (app.tick % 8 === 0) {
      app.spark.push(0);
      app.spark.shift();
      if (app.poolTps) { app.poolTps.push(app.status.busy ? app.lastTps || 0 : 0); app.poolTps.shift(); }
    }
    app.render();
  }, 125);
  app.render();
}

// Demo: fill everything the steps before `start` would have produced, then show it
async function prefill(app, start) {
  const { DEMO_MACHINES, DEMO_POOLS } = await import('./lib/effects-demo.mjs');
  const { recommended } = await import('./lib/catalog.mjs');
  const { PATHS } = await import('./lib/screens.mjs');
  // --mode wins (for the shared screens: icon, mesh, pooldash); else the screen says which path
  const mode = ['pool', 'poolnew'].includes(app.opts.mode) ? app.opts.mode : start === 'poolnew' ? 'poolnew' : PATHS.pool.includes(start) && start !== 'icon' ? 'pool' : 'share';
  app.setMode(mode);
  const order = app.path.flatMap((id) => (id === 'engine' ? ['engine', 'install'] : [id]));
  const at = order.indexOf(start);
  const past = (id) => order.includes(id) && at > order.indexOf(id);
  const m = structuredClone(DEMO_MACHINES[app.opts.machine] || DEMO_MACHINES[3090]);
  if (past('machine')) app.machine = m;
  if (past('link')) {
    app.key = 'llm_demo';
    app.account = { email: 'vos@ejemplo.com', nick: null };
    app.status.login = 'yes';
  }
  if (past('profile')) {
    app.profile = { machine: m.host, nick: 'mula-andina', avatar: 0, bio: '' };
    app.account.nick = 'mula-andina';
    app.status.nick = 'mula-andina';
  }
  if (past('engine')) {
    app.engines = await app.fx.detectEngines();
    app.engine = { id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:9931/v1', up: false, models: [], ours: true };
    app.status.engine = 'down';
    app.status.engineName = 'llama.cpp';
  }
  if (past('model')) {
    const rec = recommended(m.vramGB, m.ramGB);
    app.model = { id: rec.id, local: 'llmule-local', catalog: rec };
    app.status.model = rec.id;
    app.status.engine = 'up';
  }
  if (past('pools') || past('poolnew')) {
    app.pool = structuredClone(DEMO_POOLS[0]);
    const r = await app.fx.pools('', mode === 'poolnew' ? 'create' : 'join', mode === 'poolnew' ? { model: 'qwen3-235b-a22b' } : { id: app.pool.id });
    app.pool = r.pool;
    app.poolRole = r.role;
  }
  if (past('icon')) app.shortcuts = await app.fx.createShortcuts({ desktop: true, autostart: false });
  app.history = order.slice(0, Math.max(0, at)).filter((id) => id !== 'install');
  app.go(start, { push: false });
}

// The desktop icon: setup is done, go straight to the panel. The engine (if it's ours) and the pool node
// start again; the key and the choices come from ~/.llmule.
async function resume(app, saved) {
  app.key = await app.fx.savedKey();
  app.status.login = 'yes';
  app.profile = saved.profile || { machine: saved.machineName };
  if (saved.profile?.nick) app.status.nick = saved.profile.nick;
  app.machine = await app.fx.detectMachine();
  app.fx.me(app.key).then((me) => { app.account = { nick: me.nick }; if (me.nick) app.status.nick = me.nick; app.dirty = true; }).catch(() => {});
  app.setMode(saved.mode || 'share');
  if (app.isPool() && saved.pool?.id) {
    try {
      app.pool = (await app.fx.pools(app.key, 'get', { id: saved.pool.id })).pool;
      app.poolRole = app.pool.you?.head ? 'head' : 'worker';
      app.history = [];
      return app.go('pooldash', { push: false });
    } catch {
      return app.go('menu', { push: false }); // the pool is gone: pick again
    }
  }
  // 0.2.2 could save an embedding model as "the model" (LM Studio): that's no model, setup again
  const { isEmbeddingId } = await import('./lib/detect.mjs');
  if (isEmbeddingId(saved.model?.id)) {
    app.history = [];
    return app.go('welcome', { push: false });
  }
  app.engine = saved.engine;
  app.model = saved.model;
  app.status.engineName = saved.engine?.name || '';
  app.status.model = saved.model?.id || '';
  if (app.engine?.ours) {
    app.status.engine = 'loading';
    app.fx.loadModel(app.engine, saved.model, (s) => { app.status.engine = s; app.dirty = true; })
      .then((row) => { app.engine = row; app.status.engine = 'up'; app.startSharing(); app.dirty = true; })
      .catch((e) => { app.status.engine = 'down'; app.addLog('fail', app.S.errorOf(e)); });
  } else app.status.engine = 'up';
  app.go('dash', { push: false });
}
