// The screens. Each one: { id, enter(app), draw(app, r), key(app, k), keys(app) }. The order they run in
// is a path (PATHS below): setup first, then the share path or the pool path.
// `r` is the inner rect of the main window. Screens keep their own state in app.st[id].

import { C, wrap, clip, len, pad, fmtNum, fmtBytes, groupBox, listBox, progress, input, checkbox, buttons, sunken, art, hueShift, sparkline, mainWindow } from './ui.mjs';
import { pickList, recommended } from './catalog.mjs';
import { engineAsset, LLAMA_PORT } from './engine.mjs';
import { probeEngine, pickChatModel } from './detect.mjs';
import { BODY, MINI } from './mule-art.mjs';

import { spin, NICK, HUES, para, ok, navKeys, bottomButtons, levelOf } from './kit.mjs';
export { levelOf };
import { POOL_SCREENS } from './pool-screens.mjs';
import { VERSION, BUILT } from './version.mjs';
import { LANGS } from './strings.mjs';

// ---------- 1. welcome ----------
// Also where the language is chosen: L switches Español ⇄ English (app.setLang remembers it).
const welcome = {
  id: 'welcome',
  enter(app) { app.st.welcome = { focus: 0 }; },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.welcome;
    let tx = r.x;
    if (scr.depth !== 16 && r.w >= 64) {
      const a = r.h >= BODY.h / 2 + 2 && r.w >= BODY.w + 50 ? BODY : MINI;
      art(scr, r.x, r.y + (r.h - 1 > a.h / 2 ? 1 : 0), a);
      tx = r.x + a.w + 3;
    }
    const tw = r.x + r.w - tx;
    const by = r.y + r.h - 2; // the buttons; the text stops above them
    const fit = (y, rows) => Math.max(0, Math.min(rows, by - y)); // rows left before the buttons
    let y = para(scr, tx, r.y, tw, T.hello, { fg: C.navy, bold: true }, 2);
    const roomy = r.h >= 17;
    if (roomy) y = para(scr, tx, y + 1, tw, T.what, { fg: C.black }, fit(y + 1, 3));
    y = para(scr, tx, y + 1, tw, T.will, { fg: C.black, bold: true }, fit(y + 1, 1));
    T.steps.forEach((s, i) => {
      if (!fit(y, 1)) return;
      scr.put(tx, y, `${i + 1}.`, { fg: C.navy, bold: true });
      y = para(scr, tx + 3, y, tw - 3, s, { fg: C.black }, fit(y, 2));
    });
    if (fit(y + (roomy ? 1 : 0), 1)) para(scr, tx, y + (roomy ? 1 : 0), tw, T.safe, { fg: C.muted }, fit(y + (roomy ? 1 : 0), 2));
    const end = buttons(scr, tx, by, [T.go, T.quit], app.st.welcome.focus) - 3; // after the last button's shadow
    // The language, on the title bar next to [x] (always room there): L switches
    const chips = Object.values(LANGS).map((t) => [t.langName, t.lang === S.lang]); // each name in its own language
    const cw = chips.reduce((a, [n]) => a + len(n) + 2, 0) + 4;
    let cx = r.x + r.w - 3 - cw;
    if (cx > r.x + len(T.win) + 2) {
      cx = scr.put(cx, r.y - 2, ' L ', { fg: C.white, bg: C.navy, bold: true }) + 1;
      for (const [n, on] of chips) cx = scr.put(cx, r.y - 2, ` ${n} `, on ? { fg: C.white, bg: C.navy, bold: true } : { fg: C.black, bg: C.gray });
    }
    // The version on the last row, clear of the button shadows
    const full = S.version(VERSION, BUILT);
    const v = r.x + r.w - len(full) >= end + 2 ? full : S.versionShort(VERSION);
    if (r.x + r.w - len(v) >= end + 2) scr.put(r.x + r.w - len(v), by + 1, v, { fg: C.muted });
  },
  key(app, k) {
    const st = app.st.welcome;
    if (k === 'left' || k === 'right' || k === 'tab') st.focus = 1 - st.focus;
    else if (k.ch === 'l' || k.ch === 'L') app.setLang(app.S.lang === 'es' ? 'en' : 'es');
    else if (k === 'enter') st.focus === 0 ? app.next() : app.askExit();
  },
  keys: (app) => [['ENTER', app.S.keys.enter], ['←→', app.S.keys.move], ['L', app.S.keys.lang], ['F3', app.S.keys.f3]],
};

// ---------- 2. machine ----------
const machine = {
  id: 'machine',
  enter(app) {
    const st = (app.st.machine = { shown: 0, done: !!app.machine });
    if (app.machine) { st.shown = 5; return; }
    app.fx.detectMachine().then((m) => {
      app.machine = m;
      const timer = setInterval(() => {
        st.shown++;
        if (st.shown >= 5) { clearInterval(timer); st.done = true; }
        app.dirty = true;
      }, app.opts.fast ? 60 : 260);
    });
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.machine;
    const st = app.st.machine;
    const m = app.machine;
    const box = groupBox(scr, r.x, r.y, r.w, 8, T.win);
    if (!m) {
      scr.put(box.x, box.y + 1, `${spin(app)} ${T.looking}`, { fg: C.black });
      return;
    }
    const gpu = m.apple ? T.integrated(m.apple.chip) : m.gpus.length ? m.gpus.map((g) => `${g.name} · ${g.vramGB} GB`).join(', ') : T.none;
    const rows = [
      [T.os, `${m.os} (${m.arch})`],
      [T.cpu, T.cores(m.cpu, m.cores)],
      [T.ram, m.apple ? T.unified(m.ramGB) : `${m.ramGB} GB`],
      [T.gpu, gpu],
      [T.vram, m.apple ? T.usable(m.vramGB) : m.vramGB ? `${m.vramGB} GB VRAM` : '—'],
    ];
    rows.forEach(([k, v], i) => {
      if (i < st.shown) {
        scr.put(box.x, box.y + i, pad(k, 14), { fg: C.dark });
        scr.put(box.x + 14, box.y + i, clip(v, box.w - 14), { fg: C.black, bold: i >= 3 });
      } else if (i === st.shown) {
        scr.put(box.x, box.y + i, `${spin(app)} ${T.looking}`, { fg: C.mid });
      }
    });
    if (!st.done) return;
    let y = r.y + 9;
    const g = m.gpus[0];
    const have = m.apple ? T.haveApple(m.apple.chip, m.vramGB) : g && m.vramGB ? T.have(g.name.replace(/^NVIDIA GeForce /, ''), g.vramGB) : T.haveNone;
    y = para(scr, r.x, y, r.w, have, { fg: C.navy, bold: true });
    const rec = recommended(m.vramGB, m.ramGB);
    if (rec) para(scr, r.x, y, r.w, T.fits(rec.name, rec.quant), { fg: C.black });
    bottomButtons(app, r, [S.keys.enter], 0);
  },
  key(app, k) {
    if (k === 'enter' && app.st.machine.done) app.next();
    if (k === 'esc') app.back();
  },
  keys: navKeys,
};

// ---------- 3. engine ----------
const engine = {
  id: 'engine',
  enter(app) {
    const st = (app.st.engine = { sel: 0, done: false });
    app.fx.detectEngines().then((rows) => {
      app.engines = rows;
      st.done = true;
      st.sel = 0; // an index into choices(): the first engine that's up with a chat model (else "install")
      app.dirty = true;
    });
  },
  choices(app) {
    const up = (app.engines || []).filter((e) => e.up && e.models.length);
    return up.length ? [...up, { install: true }] : [];
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.engine;
    const st = app.st.engine;
    scr.put(r.x, r.y, st.done ? (this.choices(app).length ? T.pick : T.noneFound) : `${spin(app)} ${T.looking}`, { fg: C.black, bold: st.done });
    const rows = (app.engines || [
      { name: 'Ollama', url: ':11434' }, { name: 'LM Studio', url: ':1234' }, { name: 'llama.cpp', url: ':9931' }, { name: 'vLLM / OpenAI', url: ':8000' },
    ]).map((e) => {
      const port = (e.url.match(/:(\d+)/) || [])[1];
      // Up but nothing that chats (LM Studio with only an embedding model): say so, it's not a choice
      const state = !st.done ? '…' : e.up ? (!e.models.length && e.skipped ? T.onlyEmbed : T.up(e.models.length)) : T.down;
      return { text: pad(e.name, 14) + T.port(port), right: state, dim: st.done && !e.up, mark: st.done ? (e.up ? '●' : '○') : ' ', markColor: e.up ? C.green : C.mid };
    });
    const choices = this.choices(app);
    if (choices.length) rows.push({ text: '  ' + T.install, right: '' });
    // selection index → row index (rows = engines, + install)
    const selRow = !choices.length ? -1 : choices[st.sel].install ? rows.length - 1 : app.engines.indexOf(choices[st.sel]);
    listBox(scr, r.x, r.y + 2, Math.min(r.w, 64), rows.length + 1, rows, selRow, { header: T.head });
    const picked = choices[st.sel];
    const y = r.y + rows.length + 4;
    if (picked && !picked.install) {
      const y2 = para(scr, r.x, y, r.w, picked.models.slice(0, 6).join(' · '), { fg: C.muted }, 2);
      const pick = pickChatModel(picked);
      if (pick.load) para(scr, r.x, y2, r.w, T.noneLoaded(pick.id), { fg: C.amber, bold: true }, 2);
    } else if (st.done) {
      const embedOnly = (app.engines || []).find((e) => e.up && !e.models.length && e.skipped);
      if (embedOnly) para(scr, r.x, y, r.w, T.embedOnly(embedOnly.name), { fg: C.amber, bold: true }, 3);
    }
    if (st.done) bottomButtons(app, r, [S.keys.enter], 0);
  },
  key(app, k) {
    const st = app.st.engine;
    const choices = this.choices(app);
    if (!st.done) return k === 'esc' && app.back();
    if (k === 'up') st.sel = Math.max(0, st.sel - 1);
    if (k === 'down') st.sel = Math.min(choices.length - 1, st.sel + 1);
    if (k === 'esc') app.back();
    if (k === 'enter') {
      const c = choices[st.sel];
      if (!c || c.install) return app.go('install');
      app.engine = c;
      app.status.engine = 'up';
      app.status.engineName = c.name;
      app.go('model');
    }
  },
  keys: (app) => navKeys(app, [['↑↓', app.S.keys.move]]),
};

// ---------- 3b. install llama.cpp ----------
const install = {
  id: 'install',
  enter(app) { app.st.install = { phase: 'ask', focus: 0, prog: null, url: 'http://localhost:', err: '' }; },
  run(app) {
    const st = app.st.install;
    st.phase = 'run';
    const asset = engineAsset(app.machine);
    app.fx.installEngine(asset, (p) => { st.prog = p; app.dirty = true; })
      .then((row) => {
        app.engine = row;
        app.status.engine = 'down'; // installed, not running yet: it starts with a model
        app.status.engineName = row.name;
        st.phase = 'done';
        app.dirty = true;
      })
      .catch((e) => { st.phase = 'error'; st.err = app.S.errorOf(e); app.dirty = true; });
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.install;
    const st = app.st.install;
    const asset = engineAsset(app.machine);
    let y = para(scr, r.x, r.y, r.w, T.intro, { fg: C.navy, bold: true });
    y = para(scr, r.x, y + 1, r.w, T.where('~/.llmule/engine'), { fg: C.black });
    y = para(scr, r.x, y, r.w, T.bonus(LLAMA_PORT), { fg: C.black });
    y++;
    if (st.phase === 'ask') {
      scr.put(r.x, y++, T.files, { fg: C.dark });
      asset.files.forEach((f) => scr.put(r.x + 2, y++, clip(`${f.name} · ${fmtBytes(f.bytes)}`, r.w - 2), { fg: C.muted }));
      scr.put(r.x + 2, y++, T.checked, { fg: C.muted });
      bottomButtons(app, r, [T.ok, T.other], st.focus);
      return;
    }
    if (st.phase === 'url') {
      scr.put(r.x, y, T.otherUrl, { fg: C.black });
      input(scr, r.x + 2, y + 2, Math.min(50, r.w - 2), st.url, true, app.tick);
      if (st.err) scr.put(r.x + 2, y + 4, clip(st.err, r.w - 2), { fg: C.red });
      return;
    }
    if (st.phase === 'error') {
      para(scr, r.x, y, r.w, st.err, { fg: C.red });
      return;
    }
    const p = st.prog || { step: 'download', frac: 0, bytes: 0, total: 1 };
    const file = p.file || asset.files[0].name;
    if (p.step === 'download' || p.step === 'waiting' || p.step === 'check') {
      scr.put(r.x, y, `${p.step === 'check' ? T.checkPart : T.download} ${clip(file, r.w - 22)}`, { fg: C.black });
      progress(scr, r.x, y + 1, r.w, p.frac, p.step === 'waiting' ? S.model.pausedShort : `${S.of(fmtBytes(p.bytes), fmtBytes(p.total))}${p.rate ? ` · ${fmtBytes(p.rate)}/s` : ''}`);
      if (p.step === 'waiting') scr.put(r.x, y + 3, clip(S.model.paused, r.w), { fg: C.amber, bold: true });
    } else {
      ok(scr, r.x, y, `${T.download} ${clip(file, r.w - 12)}`);
      if (p.step === 'verify') scr.put(r.x, y + 1, `${spin(app)} ${T.verify}…`, { fg: C.black });
      else {
        ok(scr, r.x, y + 1, T.verify);
        if (st.phase === 'done') { ok(scr, r.x, y + 2, T.unpack); scr.put(r.x, y + 4, T.done, { fg: C.navy, bold: true }); bottomButtons(app, r, [S.keys.enter], 0); }
        else scr.put(r.x, y + 2, `${spin(app)} ${T.unpack}…`, { fg: C.black });
      }
    }
  },
  key(app, k) {
    const st = app.st.install;
    if (st.phase === 'ask') {
      if (k === 'left' || k === 'right' || k === 'tab') st.focus = 1 - st.focus;
      if (k === 'esc') app.back();
      if (k === 'enter') st.focus === 0 ? this.run(app) : (st.phase = 'url');
    } else if (st.phase === 'url') {
      if (k === 'esc') st.phase = 'ask';
      else if (k === 'backspace') st.url = [...st.url].slice(0, -1).join('');
      else if (k.ch) st.url += k.ch;
      else if (k === 'enter') {
        const url = st.url.replace(/\/$/, '');
        probeEngine(url, 1500, { lmstudio: true }).then((res) => {
          if (res.up && res.models.length) {
            app.engine = { id: 'custom', name: url.replace(/^https?:\/\//, ''), url, up: true, models: res.models, loaded: res.loaded ?? null, skipped: res.skipped || 0 };
            app.status.engine = 'up';
            app.status.engineName = app.engine.name;
            app.go('model');
          } else st.err = app.S.install.noAnswer(url);
          app.dirty = true;
        });
      }
    } else if (st.phase === 'done' && k === 'enter') app.go('model');
    else if (st.phase === 'error' && k === 'enter') app.go('model');
  },
  keys: navKeys,
};

// ---------- 4. model ----------
const model = {
  id: 'model',
  rows(app) {
    // The engine's chat models (detect.mjs already dropped the embedding ones), loaded first.
    // loaded: true/false when the engine says (LM Studio), null when it loads on demand.
    const loadedIds = app.engine?.loaded;
    const local = (app.engine?.models || []).map((id) => ({ kind: 'engine', id: id.replace(/:latest$/, ''), local: id, loaded: Array.isArray(loadedIds) ? loadedIds.includes(id) : null }));
    const cat = pickList(app.machine?.vramGB || 0, app.machine?.ramGB || 0).map((m) => ({ kind: 'catalog', ...m }));
    return [...local, ...cat];
  },
  enter(app) {
    const rows = this.rows(app);
    const rec = rows.findIndex((m) => m.recommended);
    app.st.model = { sel: rows[0]?.kind === 'engine' ? 0 : Math.max(0, rec), phase: 'pick', prog: null, err: '' };
  },
  async run(app, m) {
    const st = app.st.model;
    st.chosen = m; // the rows change once the engine lists the loaded model: keep the row we picked
    const { fx } = app;
    // Downloaded in LM Studio but not loaded: it answers "No models loaded". Ask to load it first.
    if (m.kind === 'engine' && m.loaded === false) {
      Object.assign(st, { phase: 'needLoad', focus: 0, lms: fx.lmsPath?.() || null, still: false, lmsLine: '' });
      app.dirty = true;
      return;
    }
    try {
      let file = null;
      if (m.kind === 'catalog') {
        st.phase = 'download';
        st.started = Date.now();
        file = (await fx.downloadModel(m, (p) => { st.prog = p; st.phase = p.step === 'verify' ? 'verify' : 'download'; app.dirty = true; })).path;
      }
      st.phase = 'loading';
      app.model = m.kind === 'catalog' ? { id: m.id, local: 'llmule-local', catalog: m, path: file } : { id: m.id, local: m.local };
      app.status.model = app.model.id;
      app.engine = await fx.loadModel(app.engine, { ...m, path: file }, (s) => { app.status.engine = s; app.dirty = true; });
      app.status.engine = 'up';
      st.phase = 'done';
    } catch (e) {
      st.phase = 'error';
      st.err = app.S.errorOf(e);
    }
    app.dirty = true;
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.model;
    const st = app.st.model;
    const rows = this.rows(app);
    const vram = app.machine?.vramGB || 0;
    if (st.phase === 'pick') {
      scr.put(r.x, r.y, clip(T.pick(vram), r.w), { fg: C.black, bold: true });
      const listH = Math.min(rows.length + 1, r.h - 7);
      listBox(scr, r.x, r.y + 2, r.w, listH, rows.map((m) => m.kind === 'engine'
        ? m.loaded === false ? { text: m.id, right: T.notLoaded, mark: '○', markColor: C.amber } : { text: m.id, right: T.inEngine, mark: '●', markColor: C.green }
        : {
          text: pad(m.name, 26) + pad(m.quant, 9) + fmtBytes(m.bytes),
          right: m.recommended ? T.rec : !m.fits ? T.noFit : m.alt ? T.alt : '',
          dim: !m.fits, bold: m.recommended, mark: m.recommended ? '★' : ' ', markColor: C.amber,
        }), st.sel, { header: T.head });
      const m = rows[st.sel];
      let y = r.y + 3 + listH;
      if (m?.kind === 'catalog') {
        y = para(scr, r.x, y, r.w, m.blurb[S.lang] || m.blurb.en, { fg: C.black }, 1);
        scr.put(r.x, y, clip(`${T.need(m.minVram, vram)} · ${m.license} · ${T.from(m.repo)}`, r.w), { fg: m.fits ? C.muted : C.red });
      }
      return;
    }
    const m = st.chosen || rows[st.sel];
    const name = m.kind === 'catalog' ? `${m.name} ${m.quant}` : m.id;
    scr.put(r.x, r.y, clip(name, r.w), { fg: C.navy, bold: true });
    if (['needLoad', 'lmsLoading', 'lmsError', 'recheck'].includes(st.phase)) return this.drawLoad(app, r, m);
    if (m.kind === 'catalog') scr.put(r.x, r.y + 1, clip(`${m.file} · ${T.from(m.repo)}`, r.w), { fg: C.muted });
    let y = r.y + 3;
    if (m.kind === 'catalog') {
      const p = st.prog || { frac: 0, bytes: 0, total: m.bytes, rate: 0 };
      if (st.phase === 'download') {
        const eta = p.rate ? (p.total - p.bytes) / p.rate : 0;
        // The demo fakes a cut with the site's "down"; the real download reports it itself
        const off = p.step === 'waiting' || (app.fx.demo && app.status.site === 'down');
        const head = p.step === 'check' ? T.checking : `${T.downloading}  ${Math.floor(p.frac * 100)}%`;
        scr.put(r.x, y, head, { fg: C.black, bold: true });
        progress(scr, r.x, y + 1, r.w, p.frac, `${S.of(fmtBytes(p.bytes), fmtBytes(p.total))} · ${off ? T.pausedShort : p.rate ? `${fmtBytes(p.rate)}/s · ${T.eta(eta)}` : '…'}`);
        if (off) scr.put(r.x, y + 3, clip(p.retryIn ? T.pausedRetry(p.retryIn) : T.paused, r.w), { fg: C.amber, bold: true });
        return;
      }
      ok(scr, r.x, y, `${T.downloading} · ${fmtBytes(m.bytes)}`);
      if (st.phase === 'verify') { scr.put(r.x, y + 1, `${spin(app)} ${T.verify}`, { fg: C.black }); return; }
      ok(scr, r.x, y + 1, T.verify.replace('…', ''));
      y += 2;
    }
    if (st.phase === 'loading') {
      scr.put(r.x, y, `${spin(app)} ${T.loading}`, { fg: C.black });
      const w = Math.min(30, r.w);
      const pos = app.tick % (w + 6);
      sunken(scr, r.x, y + 1, w, 1);
      for (let i = 0; i < 5; i++) if (pos - i >= 0 && pos - i < w) scr.put(r.x + pos - i, y + 1, '█', { fg: C.select, bg: C.white });
    } else if (st.phase === 'done') {
      ok(scr, r.x, y, T.loaded);
      bottomButtons(app, r, [S.keys.enter], 0);
    } else if (st.phase === 'error') {
      para(scr, r.x, y, r.w, st.err, { fg: C.red });
    }
  },
  key(app, k) {
    const st = app.st.model;
    const rows = this.rows(app);
    if (st.phase === 'pick') {
      if (k === 'up') st.sel = Math.max(0, st.sel - 1);
      if (k === 'down') st.sel = Math.min(rows.length - 1, st.sel + 1);
      if (k === 'esc') app.back();
      if (k === 'enter') {
        const m = rows[st.sel];
        if (m.kind === 'catalog' && !m.fits) return;
        this.run(app, m);
      }
    } else if (st.phase === 'needLoad') {
      if (k === 'esc') st.phase = 'pick';
      if (st.lms && (k === 'left' || k === 'right' || k === 'tab')) st.focus = 1 - st.focus;
      if (st.lms && (k.ch === 'l' || k.ch === 'L' || (k === 'enter' && st.focus === 0))) return this.confirmLoad(app);
      if (k === 'enter') this.recheck(app);
    } else if (st.phase === 'lmsError') {
      if (k === 'enter' || k === 'esc') st.phase = 'needLoad';
    } else if ((st.phase === 'done' || st.phase === 'error') && k === 'enter') app.next();
    else if (st.phase === 'error' && k === 'esc') st.phase = 'pick';
  },
  // ---- LM Studio: load the model (lms load, after a yes) or wait for the person to load it, then look again
  confirmLoad(app) {
    const st = app.st.model;
    const T = app.S.model;
    const id = st.chosen.local;
    app.modal = { title: T.loadTitle, lines: T.loadConfirm(id, app.engine.name), labels: [T.no, T.yesLoad], focus: 1, onYes: () => this.lmsLoad(app) };
  },
  lmsLoad(app) {
    const st = app.st.model;
    st.phase = 'lmsLoading';
    st.lmsLine = '';
    app.fx.lmsLoad(st.chosen.local, (line) => { st.lmsLine = line; app.dirty = true; })
      .then(() => this.recheck(app))
      .catch((e) => { st.phase = 'lmsError'; st.err = e.message || String(e); app.dirty = true; });
  },
  async recheck(app) {
    const st = app.st.model;
    const m = st.chosen;
    st.phase = 'recheck';
    app.dirty = true;
    try {
      if (app.fx.refreshEngine) app.engine = await app.fx.refreshEngine(app.engine);
    } catch { /* keep the row we had */ }
    const loaded = !Array.isArray(app.engine.loaded) || app.engine.loaded.includes(m.local);
    if (loaded) return this.run(app, { ...m, loaded: true });
    Object.assign(st, { phase: 'needLoad', still: true });
    app.dirty = true;
  },
  drawLoad(app, r, m) {
    const { scr, S } = app;
    const T = S.model;
    const st = app.st.model;
    const eng = app.engine?.name || 'LM Studio';
    let y = r.y + 2;
    if (st.phase === 'needLoad') {
      if (st.still) { scr.put(r.x, y, clip(T.stillNot(m.local), r.w), { fg: C.red, bold: true }); y += 2; }
      y = para(scr, r.x, y, r.w, T.needLoad(m.local, eng), { fg: C.black }, 3) + 1;
      if (st.lms) {
        y = para(scr, r.x, y, r.w, T.lmsCan(`lms load ${m.local}`), { fg: C.dark }, 2);
        bottomButtons(app, r, [T.loadIt, T.loadedByHand], st.focus);
      } else {
        para(scr, r.x, y, r.w, T.byHand(eng), { fg: C.dark }, 2);
        bottomButtons(app, r, [T.loadedByHand], 0);
      }
      return;
    }
    if (st.phase === 'lmsLoading') {
      scr.put(r.x, y, clip(`${spin(app)} ${T.lmsLoading(m.local)}`, r.w), { fg: C.black });
      if (st.lmsLine) scr.put(r.x + 2, y + 2, clip(st.lmsLine, r.w - 2), { fg: C.muted });
      return;
    }
    if (st.phase === 'recheck') {
      scr.put(r.x, y, `${spin(app)} ${T.rechecking}`, { fg: C.black });
      return;
    }
    scr.put(r.x, y, clip(T.lmsFailed, r.w), { fg: C.red, bold: true });
    y = para(scr, r.x + 2, y + 1, r.w - 2, st.err || '', { fg: C.red }, 4);
    scr.put(r.x, y + 1, clip(T.back, r.w), { fg: C.dark });
  },
  keys: (app) => {
    const ph = app.st.model?.phase;
    if (ph === 'pick') return navKeys(app, [['↑↓', app.S.keys.move]]);
    if (ph === 'needLoad' || ph === 'lmsError') return navKeys(app);
    if (ph === 'done' || ph === 'error') return navKeys(app);
    return [['F3', app.S.keys.f3]];
  },
};

// ---------- 5. link ----------
const link = {
  id: 'link',
  enter(app) {
    const st = (app.st.link = { phase: 'start', focus: 0, code: '', url: '', expiresAt: 0, opened: false, err: '' });
    const { fx } = app;
    (async () => {
      const saved = await fx.savedKey();
      if (saved) {
        app.key = saved;
        app.status.login = 'yes';
        st.phase = 'saved';
        st.saved = saved.slice(0, 8) + '…';
        app.dirty = true;
        // Who it is (the nick decides if the profile asks for one; mule and bio prefill the profile)
        app.loadAccount();
        return;
      }
      const wait = (ms) => new Promise((ok2) => setTimeout(ok2, ms));
      // llmule.xyz down: wait and ask again, the status bar says why
      for (;;) {
        try {
          Object.assign(st, await fx.startLink(app.machine), { phase: 'wait' });
          break;
        } catch (e) {
          if (app.screen !== link) return;
          if (e.status === 429) { st.phase = 'error'; st.err = app.S.errorOf(e); app.dirty = true; return; }
          st.phase = 'offline';
          app.dirty = true;
          await wait(5000);
        }
      }
      app.status.login = 'wait';
      app.dirty = true;
      let every = (st.interval || 3) * 1000;
      while (st.phase === 'wait' && app.screen === link) {
        if (Date.now() > st.expiresAt) { st.phase = 'expired'; break; }
        await wait(every);
        if (st.phase !== 'wait' || app.screen !== link) break;
        let r;
        try {
          r = await fx.pollLink(st.code);
        } catch {
          continue; // offline: the status bar says it, we just wait
        }
        if (r.status === 'approved') {
          app.key = r.key;
          app.account = { email: r.email, nick: r.nick };
          app.accountP = null;
          app.loadAccount(); // the account's mule and bio, for the profile step
          app.status.login = 'yes';
          app.status.nick = r.nick || '';
          app.fx.saveConfig?.({ LLMULE_KEY: r.key, LLMULE_API: app.fx.api });
          st.phase = 'done';
          st.who = r.nick ? '@' + r.nick : r.email;
        } else if (r.status === 'slow_down') every += 1000;
        else if (r.status === 'expired' || r.status === 'delivered') st.phase = 'expired';
        else if (r.status === 'denied') st.phase = 'denied';
      }
      app.dirty = true;
    })();
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.link;
    const st = app.st.link;
    if (st.phase === 'saved') {
      ok(scr, r.x, r.y, T.saved(st.saved));
      scr.put(r.x, r.y + 2, T.safe, { fg: C.muted });
      return bottomButtons(app, r, [S.keys.enter], 0);
    }
    if (st.phase === 'error') return para(scr, r.x, r.y, r.w, st.err, { fg: C.red });
    if (st.phase === 'start') return scr.put(r.x, r.y, `${spin(app)}`, { fg: C.black });
    if (st.phase === 'offline') return scr.put(r.x, r.y, `${spin(app)} ${clip(S.waitSite(5), r.w - 2)}`, { fg: C.amber, bold: true });
    scr.put(r.x, r.y, T.intro, { fg: C.black });
    const url = st.url.replace(/^https:\/\//, '');
    const bw = Math.min(r.w, Math.max(len(url) + 6, 30));
    const bx = r.x + Math.floor((r.w - bw) / 2);
    sunken(scr, bx, r.y + 2, bw, 1);
    scr.put(bx + Math.floor((bw - len(url)) / 2), r.y + 2, url, { fg: C.link, bg: C.white, bold: true });
    scr.put(r.x, r.y + 4, T.code, { fg: C.black });
    // The code, big: spaced letters on the site's yellow tooltip color, with a shadow
    const big = [...st.code].join(' ');
    const cw = len(big) + 8;
    const cx = r.x + Math.floor((r.w - cw) / 2);
    scr.fill(cx, r.y + 6, cw, 3, { bg: C.tip });
    scr.put(cx + 4, r.y + 7, big, { fg: C.black, bg: C.tip, bold: true });
    scr.shade(cx + 2, r.y + 9, cw, 1, C.black, 0.2);
    scr.shade(cx + cw, r.y + 7, 2, 2, C.black, 0.2);
    let y = r.y + 11;
    if (st.phase === 'done') {
      ok(scr, r.x, y, T.done(st.who));
      scr.put(r.x, y + 1, T.safe, { fg: C.muted });
      return bottomButtons(app, r, [S.keys.enter], 0);
    }
    if (st.phase === 'expired') return scr.put(r.x, y, T.expired, { fg: C.red, bold: true });
    if (st.phase === 'denied') return scr.put(r.x, y, T.denied, { fg: C.red, bold: true });
    y = para(scr, r.x, y, r.w, st.opened ? T.opened : T.how, { fg: C.dark }, 2);
    const left = Math.max(0, Math.round((st.expiresAt - Date.now()) / 1000));
    const dots = '.'.repeat(app.tick % 4);
    const waiting = app.status.site === 'down' ? S.waitSite(5) : `${T.waiting}${dots}`;
    scr.put(r.x, r.y + r.h - 1, `${spin(app)} ${clip(waiting, r.w - 20)}`, { fg: app.status.site === 'down' ? C.amber : C.black, bold: true });
    const exp = T.expires(Math.floor(left / 60), left % 60);
    scr.put(r.x + r.w - len(exp), r.y + r.h - 1, exp, { fg: C.muted });
  },
  key(app, k) {
    const st = app.st.link;
    if (k === 'esc') return app.back();
    if (k !== 'enter') return;
    if (st.phase === 'wait') st.opened = app.fx.openBrowser ? app.fx.openBrowser(st.url) !== false : true;
    else if (st.phase === 'expired' || st.phase === 'denied') this.enter(app);
    else if (st.phase === 'done' || st.phase === 'saved' || st.phase === 'error') app.next();
  },
  keys: (app) => (app.st.link?.phase === 'wait' ? [['ENTER', app.S.link.open], ['ESC', app.S.keys.esc], ['F3', app.S.keys.f3]] : navKeys(app)),
};

// ---------- 6. profile ----------
// Two kinds of fields: the machine name is this computer's (the provider/pool node name, kept in ~/.llmule);
// nick, mule and bio are the ACCOUNT's, the same on every machine linked to it. So the account's mule and bio
// come from llmule.xyz first, and only what the person changes here is sent back: linking a second
// machine must not reset them.
const PROFILE_ACCOUNT = ['nick', 'avatar', 'bio'];
const profile = {
  id: 'profile',
  fields(app) {
    return ['machine', ...(app.account?.nick ? [] : ['nick']), 'avatar', 'bio'];
  },
  enter(app) {
    app.profile = app.profile || { machine: app.machine?.host || '', nick: '', avatar: 0, bio: '' };
    if (!app.profile.machine) app.profile.machine = app.machine?.host || '';
    app.profileTouched = app.profileTouched || {}; // account fields the person edited (survives ESC and back)
    const st = (app.st.profile = { focus: 0, err: '', saving: false, loading: !app.account?.loaded });
    app.loadAccount().then(() => {
      st.loading = false;
      this.fill(app);
      app.dirty = true;
    });
    this.fill(app);
  },
  // The account's values into the fields the person hasn't touched
  fill(app) {
    const a = app.account;
    if (!a?.loaded) return;
    const p = app.profile;
    const t = app.profileTouched;
    if (!t.avatar && Number.isInteger(a.avatar) && a.avatar >= 0 && a.avatar < HUES.length) p.avatar = a.avatar;
    if (!t.bio && typeof a.bio === 'string') p.bio = a.bio;
  },
  // What goes to llmule.xyz: a new nick, and the mule/bio only if edited and different from the account's
  patch(app) {
    const p = app.profile;
    const a = app.account || {};
    const t = app.profileTouched;
    const out = {};
    if (this.fields(app).includes('nick') && p.nick) out.nick = p.nick;
    if (t.avatar && !(a.loaded && a.avatar === p.avatar)) out.avatar = p.avatar;
    if (t.bio && !(a.loaded && (a.bio || '') === p.bio)) out.bio = p.bio;
    return out;
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.profile;
    const st = app.st.profile;
    const p = app.profile;
    const fields = this.fields(app);
    // The mule on the right: the big one when the window has the room, the small one at 80×25
    const roomFor = (a) => r.h >= a.h / 2 + 1 && r.w >= a.w + 46;
    const sprite = scr.depth === 16 ? null : roomFor(BODY) ? BODY : roomFor(MINI) ? MINI : null;
    const right = sprite ? r.x + r.w - sprite.w - 1 : r.x + r.w; // where the left column ends
    const leftW = right - r.x - 2;
    const label = (f) => (f === 'machine' ? T.machineShort : T[f]);
    const lw = 2 + Math.max(...['machine', 'nick', 'avatar', 'bio'].map((f) => len(label(f)))) + 2;
    const iw = Math.max(12, Math.min(30, leftW - lw));
    const step = r.h >= 17 ? 2 : 1;
    const heading = (y, title, hint) => {
      const x = scr.put(r.x, y, clip(title, leftW), { fg: C.navy, bold: true });
      if (hint && x + 3 < r.x + leftW) scr.put(x + 1, y, clip(`· ${hint}`, r.x + leftW - x - 1), { fg: C.muted });
    };
    scr.put(r.x, r.y, clip(T.intro, leftW), { fg: C.black });
    let y = r.y + 2;
    fields.forEach((f, i) => {
      if (f === 'machine') heading(y++, T.thisMachine, T.thisMachineHint);
      if (i === 1) { y += step - 1; heading(y++, T.account, T.accountHint); }
      const focused = st.focus === i;
      scr.put(r.x + 2, y, label(f), { fg: C.black, bold: focused });
      if (f === 'avatar') {
        const name = T.colors[p.avatar];
        scr.put(r.x + lw, y, focused ? `◄ ${pad(name, 9)} ►` : `  ${name}`, { fg: focused ? C.navy : C.black, bold: focused });
      } else input(scr, r.x + lw, y, iw, p[f], focused, app.tick);
      if (f === 'nick') { y++; scr.put(r.x + lw, y, clip(T.nickHint, leftW - lw), { fg: C.muted }); }
      y += i === 0 ? 1 : step;
    });
    if (st.err) para(scr, r.x + lw, y, leftW - lw, st.err, { fg: C.red, bold: true }, 1);
    else if (st.saving) scr.put(r.x + 2, y, `${spin(app)} ${T.saving}`, { fg: C.black });
    else if (st.loading) scr.put(r.x + 2, y, `${spin(app)} ${T.loading}`, { fg: C.muted });
    // The avatar: the mule in the chosen color, on a white card so its light body shows on the gray window
    if (sprite) {
      const rows = sprite.h / 2;
      const ay = r.y + Math.max(0, Math.floor((r.h - 1 - rows - (r.h > rows + 2 ? 1 : 0)) / 2));
      sunken(scr, right - 1, ay, sprite.w + 2, rows);
      art(scr, right, ay, sprite, (hex) => hueShift(hex, HUES[p.avatar]));
      const nick = p.nick || app.account?.nick || '';
      if (nick && ay + rows < r.y + r.h) {
        const tag = clip('@' + nick, sprite.w);
        scr.put(right + Math.max(0, Math.floor((sprite.w - len(tag)) / 2)), ay + rows, tag, { fg: C.navy, bold: true });
      }
    }
    bottomButtons(app, r, [S.keys.enter], -1);
  },
  key(app, k) {
    const st = app.st.profile;
    const p = app.profile;
    const fields = this.fields(app);
    const f = fields[st.focus];
    const touch = () => { if (PROFILE_ACCOUNT.includes(f)) app.profileTouched[f] = true; };
    st.err = '';
    if (k === 'tab' || k === 'down') st.focus = (st.focus + 1) % fields.length;
    else if (k === 'shift-tab' || k === 'up') st.focus = (st.focus + fields.length - 1) % fields.length;
    else if (f === 'avatar' && (k === 'left' || k === 'right')) { p.avatar = (p.avatar + (k === 'left' ? 4 : 1)) % 5; touch(); }
    else if (k === 'esc') app.back();
    else if (k === 'backspace' && f !== 'avatar') { p[f] = [...p[f]].slice(0, -1).join(''); touch(); }
    else if (k.ch && f !== 'avatar') {
      const max = f === 'bio' ? 120 : f === 'nick' ? 20 : 40;
      if (len(p[f]) < max) { p[f] += f === 'nick' ? k.ch.toLowerCase() : k.ch; touch(); }
    } else if (k === 'space' && f !== 'avatar' && f !== 'nick') { p[f] += ' '; touch(); }
    else if (k === 'enter') {
      if (st.focus < fields.length - 1) { st.focus++; return; }
      if (fields.includes('nick') && !NICK.test(p.nick)) { st.err = app.S.profile.nickBad; st.focus = fields.indexOf('nick'); return; }
      const patch = this.patch(app);
      if (!Object.keys(patch).length) return app.next(); // nothing of the account changed: nothing to send
      st.saving = true;
      app.fx.saveProfile(patch, app.key).then(() => {
        st.saving = false;
        app.account = { ...(app.account || {}), ...patch };
        if (patch.nick) app.status.nick = patch.nick;
        app.profileTouched = {};
        app.next();
      }).catch((e) => {
        st.saving = false;
        // The nick is taken or invalid: say it and stay. Offline: go on (the machine name is local anyway;
        // the account's mule and bio can be set again on llmule.xyz)
        if (e.status === 409 || e.status === 400) { st.err = app.S.errorOf(e); st.focus = Math.max(0, fields.indexOf('nick')); }
        else app.next();
        app.dirty = true;
      });
    }
  },
  keys: (app) => [['ENTER', app.S.keys.enter], ['TAB', app.S.keys.tab], ['ESC', app.S.keys.esc], ['F3', app.S.keys.f3]],
};

// ---------- 7. test question ----------
const test = {
  id: 'test',
  enter(app) {
    const st = (app.st.test = { phase: 'ask', answer: '', res: null });
    app.fx.testQuestion(app.engine, app.model || { id: '' }, app.S.test.question, (t) => { st.answer = t; st.phase = 'stream'; app.dirty = true; })
      .then((res) => { st.res = res; st.phase = 'done'; app.dirty = true; })
      .catch((e) => { st.phase = 'error'; st.detail = e?.detail || e?.message || ''; app.dirty = true; });
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.test;
    const st = app.st.test;
    scr.put(r.x, r.y, T.intro, { fg: C.black });
    const q = ` ${T.question} `;
    scr.fill(r.x + 2, r.y + 2, len(q), 1, { bg: C.tip });
    scr.put(r.x + 2, r.y + 2, q, { fg: C.black, bg: C.tip, bold: true });
    const aw = r.w - 4;
    const ah = Math.min(6, r.h - 8);
    sunken(scr, r.x + 2, r.y + 4, aw, ah);
    scr.put(r.x + 3, r.y + 4, app.model?.id || '', { fg: C.mid, bg: C.white });
    if (st.phase === 'ask') scr.put(r.x + 3, r.y + 5, `${spin(app)} ${T.thinking}`, { fg: C.dark, bg: C.white });
    else wrap(st.answer + (st.phase === 'stream' ? '▌' : ''), aw - 2).slice(-(ah - 1)).forEach((l, i) => scr.put(r.x + 3, r.y + 5 + i, l, { fg: C.black, bg: C.white }));
    const y = r.y + 5 + ah;
    if (st.phase === 'done') {
      ok(scr, r.x + 2, y, T.stats(S.dec((st.res.ms / 1000).toFixed(1)), S.dec(st.res.tokPerSec)));
      bottomButtons(app, r, [S.keys.enter], 0);
    }
    if (st.phase === 'error') {
      scr.put(r.x + 2, y, clip(T.failed, r.w - 2), { fg: C.red, bold: true });
      // The engine's own words, under the friendly line ("No models loaded…")
      if (st.detail) para(scr, r.x + 2, y + 1, r.w - 4, T.engineSaid(st.detail), { fg: C.dark }, Math.max(1, r.y + r.h - y - 1));
    }
  },
  key(app, k) {
    const st = app.st.test;
    if (k === 'esc') app.back();
    if (k === 'enter' && st.phase === 'done') app.next();
    if (k === 'enter' && st.phase === 'error') this.enter(app);
  },
  keys: navKeys,
};

// ---------- 8. icon + autostart ----------
const icon = {
  id: 'icon',
  enter(app) { app.st.icon = { focus: 0, desktop: true, autostart: false, busy: false }; },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.icon;
    const st = app.st.icon;
    scr.put(r.x, r.y, T.intro, { fg: C.black, bold: true });
    (app.isPool() ? T.howPool : T.how).forEach((l, i) => scr.put(r.x + 2, r.y + 2 + i, '· ' + l, { fg: C.black }));
    checkbox(scr, r.x + 2, r.y + 5, st.desktop, T.desktop, st.focus === 0);
    checkbox(scr, r.x + 2, r.y + 7, st.autostart, T.autostart, st.focus === 1);
    scr.put(r.x + 6, r.y + 8, T.autostartHint, { fg: C.muted });
    if (st.busy) scr.put(r.x + 2, r.y + 10, spin(app), { fg: C.black });
    if (st.err) para(scr, r.x + 2, r.y + 10, r.w - 2, st.err, { fg: C.red });
    bottomButtons(app, r, [S.keys.enter], -1);
  },
  key(app, k) {
    const st = app.st.icon;
    if (k === 'up' || k === 'down' || k === 'tab') st.focus = 1 - st.focus;
    else if (k === 'space') st.focus === 0 ? (st.desktop = !st.desktop) : (st.autostart = !st.autostart);
    else if (k === 'esc') app.back();
    else if (k === 'enter') {
      if (st.err) return app.next();
      st.busy = true;
      app.fx.createShortcuts({ desktop: st.desktop, autostart: st.autostart, texts: { file: app.S.icon.fileComment, menu: app.S.icon.menuComment } })
        .then((made) => { app.shortcuts = made; app.next(); })
        .catch((e) => { st.err = app.S.errorOf(e); })
        .finally(() => { st.busy = false; app.dirty = true; });
    }
  },
  keys: (app) => [['ENTER', app.S.keys.enter], [app.S.keys.spaceKey, app.S.keys.space], ['↑↓', app.S.keys.move], ['F3', app.S.keys.f3]],
};

// ---------- 9. done ----------
const cardUrl = (app) => `llmule.xyz/m/${app.status.nick || app.account?.nick || app.S.you}/${app.model?.id || ''}`;

const done = {
  id: 'done',
  enter(app) {
    // What the provider reads (so `mule-provider.mjs` alone shares the same) + what the icon resumes
    app.fx.saveConfig?.({ LLMULE_KEY: app.key, LLMULE_API: app.fx.api, UPSTREAM: app.engine?.url, MODELS: `${app.model?.id}=${app.model?.local || app.model?.id}`, NAME: app.profile?.machine || app.machine?.host });
    app.saveState();
    app.startSharing();
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.done;
    let tx = r.x;
    if (scr.depth !== 16 && r.w >= 64) {
      art(scr, r.x, r.y, MINI, (hex) => hueShift(hex, HUES[app.profile?.avatar || 0]));
      tx = r.x + MINI.w + 3;
    }
    const tw = r.x + r.w - tx;
    scr.put(tx, r.y, T.big, { fg: C.navy, bold: true });
    scr.put(tx, r.y + 2, T.card, { fg: C.black });
    scr.put(tx, r.y + 3, clip(cardUrl(app), tw), { fg: C.link, bold: true });
    let y = para(scr, tx, r.y + 5, tw, T.api(app.engine?.url || ''), { fg: C.black }, 2);
    y++;
    for (const p of [app.shortcuts?.desktop, app.shortcuts?.autostart].filter(Boolean)) ok(scr, tx, y++, clip(S.icon.made(p), tw - 2));
    para(scr, tx, y + 1, tw, T.thanks, { fg: C.muted }, Math.max(0, Math.min(2, r.y + r.h - 3 - y))); // up to the buttons
    buttons(scr, tx, r.y + r.h - 2, [T.next], 0);
  },
  key(app, k) { if (k === 'enter') app.go('dash'); },
  keys: (app) => [['ENTER', app.S.done.next], ['F3', app.S.keys.f3]],
};

// ---------- the status panel (also what the desktop icon opens) ----------
const dash = {
  id: 'dash',
  win: (app) => app.S.dash.win,
  enter(app) {
    // Opened from the icon, our llama-server may still be loading: resume() starts sharing when it's up
    if (!app.sharing && !app.paused && app.status.engine !== 'loading') app.startSharing();
    app.refreshMe();
    if (!app.meTimer) { app.meTimer = setInterval(() => app.refreshMe(), 60000); app.meTimer.unref?.(); }
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.dash;
    const s = app.status;
    // Headline
    const head = s.share === 'paused' ? T.paused : s.site === 'down' ? T.waitingSite : s.engine === 'down' ? T.waitingEngine
      : s.share === 'on' ? T.sharing(app.model?.id || '') : T.starting;
    scr.put(r.x, r.y, clip(head, r.w - 20), { fg: s.share === 'on' ? C.navy : C.amber, bold: true });
    const lvl = levelOf(S.levels, app.tokens.total ?? app.tokens.session);
    const badge = ` ${lvl.name} `;
    scr.put(r.x + r.w - len(badge), r.y, badge, { fg: C.black, bg: C.tip, bold: true });

    // Activity: two lanes, requests in, answers out
    this.lanes(app, r.x, r.y + 2, r.w);

    // Two boxes
    const bh = 6;
    const lw = Math.floor(r.w / 2) - 1;
    const by = r.y + 5;
    const L = groupBox(scr, r.x, by, lw, bh, T.machine);
    const m = app.machine || {};
    const gpu = m.apple ? m.apple.chip : m.gpus?.[0] ? `${m.gpus[0].name.replace(/^NVIDIA GeForce /, '')} · ${m.gpus[0].vramGB} GB` : 'CPU';
    scr.put(L.x, L.y, clip(gpu, L.w), { fg: C.black, bold: true });
    scr.put(L.x, L.y + 1, clip(`${app.engine?.name || ''} · ${(app.engine?.url || '').replace(/^http:\/\//, '')}`, L.w), { fg: C.black });
    scr.put(L.x, L.y + 2, clip(`${T.card}: `, L.w), { fg: C.dark });
    scr.put(L.x, L.y + 3, clip(cardUrl(app), L.w), { fg: C.link });
    const R = groupBox(scr, r.x + lw + 2, by, r.w - lw - 2, bh, T.tokens);
    const tk = app.tokens;
    const kw = Math.max(...[T.session, T.week, T.total, T.level].map(len)) + 1; // label column, per language
    const kv = (y, k, v, bold) => {
      scr.put(R.x, y, pad(k, kw), { fg: C.dark });
      scr.put(R.x + kw, y, clip(v, R.w - kw), { fg: C.black, bold });
    };
    kv(R.y, T.session, fmtNum(tk.session), true);
    kv(R.y + 1, T.week, tk.week == null ? '—' : `${fmtNum(tk.week)}${tk.rankWeek ? ' · ' + T.rank(tk.rankWeek) : ''}`);
    kv(R.y + 2, T.total, tk.total == null ? '—' : `${fmtNum(tk.total)}${tk.rank ? ' · ' + T.rank(tk.rank) : ''}`);
    const bar = 10;
    const filled = Math.round(lvl.frac * bar);
    scr.put(R.x, R.y + 3, pad(T.level, kw), { fg: C.dark });
    scr.put(R.x + kw, R.y + 3, '▓'.repeat(filled), { fg: C.select });
    scr.put(R.x + kw + filled, R.y + 3, '░'.repeat(bar - filled), { fg: C.mid });
    if (lvl.next) scr.put(R.x + kw + 1 + bar, R.y + 3, clip('→ ' + lvl.next, R.w - kw - 1 - bar), { fg: C.muted });

    // The log
    const ly = by + bh;
    const lh = r.y + r.h - ly;
    if (lh < 3) return;
    const sw = Math.min(30, r.w - 20);
    listBox(scr, r.x, ly, r.w, lh, [], -1, { header: [T.log, ''] });
    scr.put(r.x + r.w - sw - 1, ly, sparkline(app.spark, sw), { fg: C.select, bg: C.gray });
    const rows = app.log.slice(-(lh - 1));
    const color = { start: C.amber, done: C.green, fail: C.red, warn: C.amber, info: C.mid };
    const glyph = { start: '►', done: '√', fail: 'x', warn: '!', info: '·' };
    rows.forEach((e, i) => {
      const y = ly + 1 + i;
      scr.put(r.x + 1, y, e.time, { fg: C.mid, bg: C.white });
      scr.put(r.x + 10, y, glyph[e.kind] || '·', { fg: color[e.kind] || C.mid, bg: C.white, bold: true });
      scr.put(r.x + 12, y, clip(e.text, r.w - 13), { fg: e.kind === 'fail' ? C.red : C.black, bg: C.white });
    });
  },
  // ═══■════► lanes. Packets live in app.packets: { lane: 0|1, born: tick, label? }
  lanes(app, x, y, w) {
    const { scr, S } = app;
    const T = S.dash;
    const left = 'llmule.xyz';
    const right = T.you;
    const tx = x + len(left) + 1;
    const tw = w - len(left) - len(right) - 4;
    const siteC = app.status.site === 'down' ? C.red : C.navy;
    const engC = app.status.engine === 'up' ? C.navy : C.red;
    for (const lane of [0, 1]) {
      scr.put(x, y + lane, left, { fg: siteC, bold: true });
      scr.put(tx, y + lane, '─'.repeat(tw), { fg: C.mid });
      scr.put(lane === 0 ? tx + tw - 1 : tx, y + lane, lane === 0 ? '►' : '◄', { fg: C.mid });
      scr.put(tx + tw + 3, y + lane, right, { fg: engC, bold: true });
    }
    // The GPU working: a little pulse next to "tu placa"
    if (app.status.busy) scr.put(tx + tw + 1, y, ['░', '▒', '▓', '█', '▓', '▒'][app.tick % 6], { fg: C.amber });
    const speed = 1.6;
    app.packets = app.packets.filter((p) => (app.tick - p.born) * speed < tw);
    for (const p of app.packets) {
      const d = Math.floor((app.tick - p.born) * speed);
      const px = p.lane === 0 ? tx + d : tx + tw - 1 - d;
      const col = p.lane === 0 ? C.amber : C.green;
      scr.put(px, y + p.lane, '■', { fg: col, bold: true });
      if (p.label) {
        const lx = px + 2;
        const room = tx + tw - lx;
        if (room > 2) scr.put(lx, y + p.lane, clip(p.label, room), { fg: col });
      }
    }
    if (!app.packets.length && app.status.share === 'on' && !app.status.busy) {
      const msg = ` ${T.idle} `;
      const mx = tx + Math.floor((tw - len(msg)) / 2);
      scr.put(mx, y, msg, { fg: C.muted });
      scr.put(mx + len(msg), y, ['░', '▒', '▓', '▒'][Math.floor(app.tick / 3) % 4], { fg: C.mid });
    }
  },
  key(app, k) {
    if (k.ch === 'p' || k.ch === 'P') app.togglePause();
    // Demo only: fake an outage to show the waiting states
    if (app.fx.demo && (k.ch === 'd' || k.ch === 'D')) app.fx.world.siteDown = !app.fx.world.siteDown;
  },
  keys: (app) => [['P', app.status.share === 'paused' ? app.S.keys.resume : app.S.keys.pause], ['F3', app.S.keys.f3]],
};

// ---------- 5. what to do with the card: share, or join a pool ----------
const menu = {
  id: 'menu',
  enter(app) {
    app.st.menu = { sel: { share: 0, pool: 1, poolnew: 2 }[app.mode] || 0, pools: null };
    // How many pools you can join right now, for the subtitle
    app.fx.listPools(app.key).then((p) => { app.st.menu.pools = (p.pools || []).filter((x) => x.state !== 'closed' && !x.you?.member).length; app.dirty = true; }).catch(() => {});
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.menu;
    const st = app.st.menu;
    const vram = app.machine?.vramGB || 0;
    scr.put(r.x, r.y, clip(T.intro, r.w), { fg: C.black });
    const noMesh = this.noMesh(app);
    const opts = [
      [T.share, T.shareWhat, T.shareNeed, true],
      [T.pool, T.poolWhat, noMesh ? T.noMesh : vram && vram < 12 ? T.poolSmall(vram) : T.poolNeed(st.pools ?? 0), !noMesh && vram >= 12],
      [T.poolNew, T.poolNewWhat, noMesh ? T.noMesh : T.poolNewNeed, !noMesh],
    ];
    const bh = Math.min(5, Math.floor((r.h - 5) / 3));
    opts.forEach(([title, what, need, good], i) => {
      const y = r.y + 2 + i * (bh + (bh < 5 ? 0 : 1));
      const on = st.sel === i;
      if (on) scr.fill(r.x + 1, y + 1, r.w - 2, bh - 2, { bg: C.grayLight });
      const inner = groupBox(scr, r.x, y, r.w, bh, '');
      scr.put(r.x + 2, y, ` ${on ? '►' : ' '} ${title} `, { fg: on ? C.white : C.navy, bg: on ? C.navy : C.gray, bold: true });
      scr.put(inner.x + 2, inner.y, clip(what, inner.w - 2), { fg: C.black });
      if (inner.h > 1) scr.put(inner.x + 2, inner.y + 1, clip(need, inner.w - 2), { fg: good ? C.muted : C.amber });
    });
    bottomButtons(app, r, [S.keys.enter], 0);
  },
  // mesh-llm has no build for Intel Macs
  noMesh: (app) => app.machine?.platform === 'darwin' && app.machine?.arch !== 'arm64',
  key(app, k) {
    const st = app.st.menu;
    if (k === 'up' || k === 'shift-tab') st.sel = (st.sel + 2) % 3;
    else if (k === 'down' || k === 'tab') st.sel = (st.sel + 1) % 3;
    else if (k === 'esc') app.back();
    else if (k === 'enter') {
      if (st.sel > 0 && this.noMesh(app)) return;
      app.setMode(['share', 'pool', 'poolnew'][st.sel]);
      app.next();
    }
  },
  keys: (app) => navKeys(app, [['↑↓', app.S.keys.move]]),
};

export const SCREENS = [welcome, machine, link, profile, menu, engine, install, model, test, icon, done, dash, ...POOL_SCREENS];

// Setup is shared; then each mode has its own path. Panels (the live views) aren't numbered steps.
// install is a detour from engine (only when there's no engine) and counts as the engine step.
export const PATHS = {
  base: ['welcome', 'machine', 'link', 'profile', 'menu'],
  share: ['engine', 'model', 'test', 'icon', 'done', 'dash'],
  pool: ['pools', 'contrib', 'mesh', 'icon', 'pooldash'],
  poolnew: ['poolnew', 'mesh', 'icon', 'pooldash'],
};
export const PANELS = ['dash', 'pooldash'];
export { mainWindow };
