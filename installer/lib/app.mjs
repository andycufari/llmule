// The app: state, the frame around every screen (status bar, header, window, key bar), keys,
// background watchers (llmule.xyz, the engine) and the sharing process. Screens live in screens.mjs.

import { C, desktop, statusBar, keyBar, header, mainWindow, dialog, clip, setNumLang } from './ui.mjs';
import { strings } from './strings.mjs';
import { parseKeys } from './term.mjs';
import { SCREENS, PATHS, PANELS } from './screens.mjs';

const hhmmss = () => new Date().toTimeString().slice(0, 8);


export function createApp({ fx, scr, S, opts, quit }) {
  setNumLang(S.lang);
  const app = {
    fx, scr, S, opts,
    tick: 0,
    dirty: true,
    st: {},
    status: { site: 'checking', engine: 'none', engineName: '', model: '', login: 'no', nick: '', share: 'off', busy: false, vpn: 'off' },
    // One tool, three paths: 'share' (your card serves a whole model), 'pool' (join a pool: a slice of a big
    // model) or 'poolnew' (create a pool and invite people)
    mode: 'share',
    path: [...PATHS.base, ...PATHS.share],
    pool: null, plan: null, vpn: null, poolRun: null, poolMe: null,
    machine: null, engines: null, engine: null, model: null, key: null, account: null, profile: null, shortcuts: null,
    log: [], spark: new Array(120).fill(0), packets: [],
    tokens: { session: 0, week: null, total: null, rank: null, rankWeek: null },
    sharing: null, paused: false,
    screen: null, history: [], modal: null,

    go(id, { push = true } = {}) {
      const s = SCREENS.find((x) => x.id === id);
      if (push && app.screen) app.history.push(app.screen.id);
      app.screen = s;
      s.enter(app);
      app.dirty = true;
    },
    setMode(mode) {
      app.mode = mode;
      app.path = [...PATHS.base, ...PATHS[mode]];
    },
    isPool: () => app.mode === 'pool' || app.mode === 'poolnew',
    // The L key on the welcome screen: every screen reads app.S when it draws, so this is all it takes.
    // Remembered in ~/.llmule/prefs.json (not in the demo: it writes nothing)
    setLang(lang) {
      app.S = strings(lang);
      app.opts.lang = app.S.lang;
      setNumLang(app.S.lang);
      app.fx.savePrefs?.({ lang: app.S.lang });
      app.dirty = true;
    },
    // [n, of] for the header, or null on the panels
    stepOf(id) {
      const steps = app.path.filter((x) => !PANELS.includes(x));
      const i = steps.indexOf(id === 'install' ? 'engine' : id);
      return i < 0 ? null : [i + 1, steps.length];
    },
    next() {
      const i = app.path.indexOf(app.screen.id === 'install' ? 'engine' : app.screen.id);
      const n = app.path[i + 1];
      if (n) app.go(n);
    },
    back() {
      const id = app.history.pop();
      if (id) app.go(id, { push: false });
    },

    askExit() {
      const run = PANELS.includes(app.screen.id) || app.screen.id === 'done';
      const E = app.S.exit;
      app.modal = { title: E.title, lines: run ? E.run : E.setup, labels: [run ? E.stayRun : E.stay, run ? E.leaveRun : E.leave], focus: 0 };
      app.dirty = true;
    },
    quitNow: () => quit(),
    // A text field has the keyboard: letters are text, not shortcuts
    typing() {
      const id = app.screen?.id;
      return id === 'profile' || (id === 'install' && app.st.install?.phase === 'url') || (id === 'pools' && !!app.st.pools?.typing);
    },

    addLog(kind, text) {
      app.log.push({ time: hhmmss(), kind, text });
      if (app.log.length > 500) app.log.shift();
      app.dirty = true;
    },

    // The account behind the key (nick, mule, bio): once per key; null when llmule.xyz doesn't answer
    loadAccount() {
      if (!app.key || !app.fx.me) return Promise.resolve(null);
      if (!app.accountP) {
        const key = app.key;
        app.accountP = app.fx.me(key).then((me) => {
          if (app.key !== key) return null;
          app.account = { ...(app.account || {}), nick: me.nick, avatar: me.avatar, bio: me.bio, loaded: true };
          if (me.nick) app.status.nick = me.nick;
          app.dirty = true;
          return app.account;
        }).catch(() => { app.accountP = null; return null; });
      }
      return app.accountP;
    },

    // ---------- sharing ----------
    onShareEvent(e) {
      const D = app.S.dash;
      const st = app.status;
      switch (e.type) {
        case 'starting': st.share = 'waiting'; break;
        case 'online':
          st.share = 'on'; st.site = 'up';
          if (app.fx.demo || st.engine !== 'loading') st.engine = 'up';
          app.addLog('info', D.logOnline(e.models.join(', ')));
          break;
        case 'start':
          st.busy = true;
          app.packets.push({ lane: 0, born: app.tick });
          app.addLog('start', D.logStart(e.from || app.S.someone, e.model));
          break;
        case 'done': {
          st.busy = false;
          app.tokens.session += e.tok;
          // Spread the tokens over the seconds the job took: the sparkline shows work, not spikes
          const secs = Math.max(1, Math.round(e.ms / 1000));
          for (let i = 0; i < Math.min(secs, app.spark.length); i++) app.spark[app.spark.length - 1 - i] += e.tok / secs;
          app.packets.push({ lane: 1, born: app.tick, label: `${e.tok} tok` });
          app.addLog('done', D.logDone(e.tok, app.S.dec((e.ms / 1000).toFixed(1))));
          app.refreshMe();
          break;
        }
        case 'fail': st.busy = false; app.addLog('fail', D.logFail(e.why)); break;
        case 'waiting':
          st.share = 'waiting';
          if (e.why === 'site') { st.site = 'down'; app.addLog('warn', D.logWaitSite); }
          else { st.engine = 'down'; app.addLog('warn', D.logWaitEngine); }
          break;
        case 'stopped': app.addLog('info', app.paused ? D.logPaused : D.logStopped); break;
        case 'exit':
          // The provider died on its own: say it and bring it back
          if (!app.paused && !app.quitting) {
            app.sharing = null;
            st.share = 'waiting';
            app.addLog('warn', D.logExit(e.code));
            setTimeout(() => !app.paused && !app.sharing && app.startSharing(), 5000);
          }
          break;
        case 'log': if (app.opts.verbose) app.addLog('info', e.text); break;
        default:
      }
      app.dirty = true;
    },

    startSharing() {
      if (app.sharing) return;
      app.paused = false;
      app.status.share = 'waiting';
      app.sharing = app.fx.startSharing({
        key: app.key,
        upstream: app.engine?.url,
        models: `${app.model?.id}=${app.model?.local || app.model?.id}`,
        model: app.model?.id,
        name: app.profile?.machine || app.machine?.host,
        // Our llama-server runs Qwen: answers without the thinking part fit the network's 50 s
        ...(app.engine?.ours && { extraBody: { chat_template_kwargs: { enable_thinking: false } } }),
      }, (e) => app.onShareEvent(e));
    },

    async togglePause() {
      if (app.paused) return app.startSharing();
      app.paused = true;
      app.status.share = 'paused';
      app.status.busy = false;
      const s = app.sharing;
      app.sharing = null;
      if (s) await s.stop();
      app.dirty = true;
    },

    async refreshMe() {
      try {
        const me = await app.fx.me(app.key);
        Object.assign(app.tokens, { total: me.tokensServed, week: me.tokensServedWeek, rank: me.rank, rankWeek: me.rankWeek });
        if (me.nick && !app.status.nick) app.status.nick = me.nick;
        app.dirty = true;
      } catch { /* offline: the panel shows "—" until the next answer */ }
    },

    // Remember what setup chose: the desktop icon opens straight on the panel next time
    saveState() {
      if (!app.fx.saveState) return;
      app.fx.saveState({
        v: 1, mode: app.mode, done: true,
        machineName: app.profile?.machine || app.machine?.host,
        profile: app.profile,
        engine: app.engine && { id: app.engine.id, name: app.engine.name, url: app.engine.url, ours: !!app.engine.ours, bin: app.engine.bin, gpu: app.engine.gpu },
        model: app.model && { id: app.model.id, local: app.model.local, file: app.model.catalog?.file || app.model.file, path: app.model.path || app.engine?.modelPath },
        pool: app.isPool() && app.pool ? { id: app.pool.id, role: app.poolRole } : null,
      });
    },

    // ---------- keys ----------
    onKey(k) {
      if (app.modal) {
        const m = app.modal;
        if (m.only) {
          if (k === 'enter' || k === 'f3' || k === 'ctrl-c' || k === 'ctrl-q' || k.ch === 'q' || k.ch === 'Q') return quit();
          if (k === 'esc') app.modal = null;
          app.dirty = true;
          return;
        }
        if (k === 'left' || k === 'right' || k === 'tab') m.focus = 1 - m.focus;
        else if (k === 'esc') app.modal = null;
        else if (k === 'enter') {
          app.modal = null;
          if (m.focus === 1) return m.onYes ? m.onYes() : quit();
        }
        app.dirty = true;
        return;
      }
      if (k === 'f3' || k === 'ctrl-c' || k === 'ctrl-q') return app.askExit();
      if ((k.ch === 'q' || k.ch === 'Q') && !app.typing()) return app.askExit();
      if (k === 'ctrl-l') { scr.prev = null; app.dirty = true; return; }
      // Demo: D fakes an llmule.xyz outage on any screen (to film the "waiting, not failing" state)
      if (app.fx.demo && k.ch && (k.ch === 'D') && !PANELS.includes(app.screen.id)) { app.fx.world.siteDown = !app.fx.world.siteDown; app.dirty = true; return; }
      app.screen.key(app, k);
      app.dirty = true;
    },
    // An escape sequence cut between two reads (a slow link) would read as ESC + letters: hold a trailing
    // partial one for a moment. A lone ESC waits too, at most 40 ms.
    feed(chunk) {
      clearTimeout(app.heldT);
      let s = (app.held || '') + chunk;
      app.held = '';
      const cut = /\x1b(\[[0-9;]*)?$/.exec(s);
      if (cut) {
        app.held = cut[0];
        s = s.slice(0, cut.index);
        app.heldT = setTimeout(() => { const h = app.held; app.held = ''; app.takeKeys(h); }, 40);
      }
      app.takeKeys(s);
    },
    takeKeys(s) {
      for (const k of parseKeys(s)) {
        if (k.cpr) app.onTermSize?.(k.cpr[1], k.cpr[0]);
        else app.onKey(k);
      }
    },

    // ---------- drawing ----------
    segments() {
      const s = app.status;
      const T = app.S.status;
      // short: the value when the bar is tight; prio: lower goes first when even that doesn't fit
      const seg = (label, value, state, short, prio) => ({ label, value, state, short, prio });
      const out = [
        seg(T.site, s.site === 'up' ? T.siteUp : s.site === 'down' ? T.siteDown : T.siteChecking, s.site === 'up' ? 'ok' : s.site === 'down' ? 'down' : 'wait',
          s.site === 'up' ? T.siteUpShort : s.site === 'down' ? T.siteDownShort : undefined, 8),
        seg(T.engine, s.engine === 'up' ? s.engineName : s.engine === 'loading' ? `${s.engineName} ${T.engineLoading}` : s.engine === 'down' && s.engineName ? `${s.engineName} ${app.sharing ? T.engineDown : T.engineIdle}` : T.engineNone,
          s.engine === 'up' ? 'ok' : s.engine === 'loading' ? 'wait' : s.engine === 'down' && s.engineName && app.sharing ? 'down' : 'off',
          s.engineName || T.engineNoneShort, 6),
        seg(app.isPool() ? T.pool : T.model, s.model || T.modelNone, s.model ? (s.engine === 'loading' ? 'wait' : s.engine === 'up' ? 'ok' : 'off') : 'off',
          s.model ? undefined : T.modelNoneShort, 3),
        seg(T.login, s.login === 'yes' ? (s.nick ? '@' + s.nick : T.loginYes) : s.login === 'wait' ? T.loginWait : T.loginNo, s.login === 'yes' ? 'ok' : s.login === 'wait' ? 'wait' : 'off',
          s.login === 'no' ? T.loginNoShort : undefined, 4),
      ];
      if (app.isPool() && s.vpn !== 'off') {
        out.push(seg(T.vpn, s.vpn === 'up' ? T.vpnUp : s.vpn === 'relay' ? T.vpnRelay : T.vpnWait, s.vpn === 'up' ? 'ok' : 'wait', undefined, 5));
      }
      const on = app.isPool() ? T.poolOn : T.shareOn;
      out.push(seg(T.share, s.share === 'on' ? (s.busy ? T.shareBusy : on) : s.share === 'paused' ? T.sharePaused : s.share === 'waiting' ? (app.isPool() ? T.poolWait : T.shareWaiting) : T.shareOff,
        s.share === 'on' ? (s.busy ? 'wait' : 'ok') : s.share === 'waiting' ? 'wait' : 'off', undefined, 9));
      return out;
    },

    render() {
      const S = app.S;
      desktop(scr);
      statusBar(scr, app.segments(), app.tick);
      if (scr.w < 80 || scr.h < 24) {
        S.small(scr.w, scr.h).forEach((l, i) => scr.put(2, 3 + i, clip(l, scr.w - 4), { fg: C.white, bold: i === 0 }));
        scr.flush();
        return;
      }
      const s = app.screen;
      const isDash = PANELS.includes(s.id);
      const step = app.stepOf(s.id);
      header(scr, isDash ? S.titleRun : S.title, step ? S.step(...step) : '');
      const title = s.id === 'dash' ? S.dash.win : s.id === 'pooldash' ? S.pdash.win : (S[s.id] && S[s.id].win) || '';
      const r = mainWindow(scr, title, isDash ? { maxW: 140, maxH: 46 } : {});
      s.draw(app, r);
      // Q quits too, except while typing in a field
      const keys = s.keys(app).map(([key, label]) => (key === 'F3' && !app.typing() ? ['F3/Q', label] : [key, label]));
      keyBar(scr, keys, app.fx.demo ? 'DEMO' : '');
      if (app.modal) dialog(scr, app.modal.title, app.modal.lines, app.modal.labels, app.modal.focus);
      scr.flush();
      app.dirty = false;
    },
  };
  return app;
}

// Background: llmule.xyz and the engine, so the status bar is never stale. Waits, never throws.
export function startWatchers(app) {
  const { fx } = app;
  const site = async () => {
    const was = app.status.site;
    app.status.site = await fx.siteStatus();
    if (was !== app.status.site) app.dirty = true;
    setTimeout(site, fx.demo ? 500 : 30000 + Math.random() * 5000);
  };
  site();
  const engine = async () => {
    if (app.engine && app.model && app.status.engine !== 'loading' && fx.engineState) {
      const s = await fx.engineState(app.engine).catch(() => 'down');
      if (s !== app.status.engine) { app.status.engine = s; app.dirty = true; }
    }
    setTimeout(engine, 5000);
  };
  setTimeout(engine, 5000);
}
