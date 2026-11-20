// Pool mode: your card runs a slice of a big model together with other people's cards, on mesh-llm.
// Two ways in: join a pool (pools → contrib → mesh) or create one (poolnew → mesh). Then icon → pooldash.
// Owner ≠ head: whoever creates the pool owns it; the head is the steadiest machine, the one that publishes
// pool/<model> on LLMule. The coordinator is mulePools on llmule.xyz (DESIGN.md §12).

import { C, clip, len, pad, fmtNum, fmtBytes, groupBox, listBox, progress, sparkline, input, checkbox, dec } from './ui.mjs';
import { spin, para, ok, navKeys, bottomButtons, levelOf } from './kit.mjs';
import { planLayers } from './pool.mjs';

// One color per machine, in layer order. You are always the bright one.
const NODE_COLORS = ['#0a246a', '#6a1b9a', '#00838f', '#8d6e63', '#2e7d32', '#ad1457'];
const YOU_COLOR = '#e8a400';

const myNick = (app) => app.status.nick || app.account?.nick || app.S.you;
const myGb = (app) => app.machine?.vramGB || 0;
const myGpu = (app) => {
  const m = app.machine || {};
  return m.apple ? m.apple.chip : m.gpus?.[0] ? m.gpus[0].name.replace(/^NVIDIA GeForce /, '') : 'CPU';
};
const node = (app) => ({ gb: myGb(app), gpu: myGpu(app), os: app.machine?.os || '', name: app.profile?.machine || app.machine?.host || '' });

// Layers per machine: the real stages once the mesh reports them, else the estimate (planLayers by memory)
function layout(app) {
  const pool = app.pool || {};
  const machines = pool.machines || [];
  const real = machines.filter((m) => m.from !== null && m.from !== undefined && m.to > m.from);
  if (real.length) return { real: true, plan: real.map((m) => ({ id: m.nick, from: m.from + 1, to: m.to, layers: m.to - m.from, you: m.you })) };
  const alive = machines.filter((m) => m.alive || m.you);
  const list = alive.length ? alive : [{ nick: myNick(app), gb: myGb(app), you: true }];
  const est = planLayers({ sizeGB: pool.sizeGB || 1, layers: pool.layers || 1 }, list.map((m) => ({ id: m.nick, gb: m.gb })), 1);
  return { real: false, plan: (est || []).map((p) => ({ ...p, you: p.id === myNick(app) })) };
}

const colorOf = (plan, id, me) => (id === me ? YOU_COLOR : NODE_COLORS[Math.max(0, plan.findIndex((p) => p.id === id)) % NODE_COLORS.length]);

// The layer strip: one cell per layer (scaled to the width), colored by who carries it
function layerStrip(scr, x, y, w, plan, layers, me, tick, downIds = []) {
  for (let c = 0; c < w; c++) {
    const layer = Math.floor((c / w) * layers) + 1;
    const p = plan.find((q) => layer >= q.from && layer <= q.to);
    if (!p) { scr.put(x + c, y, '░', { fg: C.mid }); continue; }
    const down = downIds.includes(p.id);
    const pulse = p.id === me && (tick + c) % 16 === 0;
    scr.put(x + c, y, down ? '░' : pulse ? '▓' : '█', { fg: down ? C.red : colorOf(plan, p.id, me) });
  }
}

const poolLine = (T, p) => T.line(p, dec);

// ---------- join: pick a pool ----------
const pools = {
  id: 'pools',
  enter(app) {
    const st = (app.st.pools = { sel: 0, list: null, err: '', q: '', typing: null, code: '' });
    this.load(app);
    return st;
  },
  load(app) {
    const st = app.st.pools;
    st.list = null;
    app.fx.listPools(app.key, st.q)
      .then((r) => { st.list = r.pools || []; st.sel = 0; app.dirty = true; })
      .catch((e) => { st.err = app.S.errorOf(e); app.dirty = true; });
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.pools;
    const st = app.st.pools;
    scr.put(r.x, r.y, clip(T.intro, r.w), { fg: C.black, bold: true });
    if (st.typing) {
      scr.put(r.x, r.y + 2, st.typing === 'q' ? T.search : T.codeAsk, { fg: C.black });
      input(scr, r.x + 2, r.y + 3, Math.min(40, r.w - 2), st.typing === 'q' ? st.q : st.code, true, app.tick);
      if (st.err) para(scr, r.x, r.y + 5, r.w, st.err, { fg: C.red }, 2);
      return;
    }
    if (st.err) return para(scr, r.x, r.y + 2, r.w, st.err, { fg: C.red });
    if (!st.list) return scr.put(r.x, r.y + 2, `${spin(app)} ${T.loading}`, { fg: C.black });
    if (st.q) scr.put(r.x + r.w - len(T.filtered(st.q)), r.y, T.filtered(st.q), { fg: C.muted });
    if (!st.list.length) {
      para(scr, r.x, r.y + 2, r.w, st.q ? T.noneQ : T.none, { fg: C.black }, 3);
      return;
    }
    const rows = st.list.map((p) => ({
      text: pad(clip(p.name, 28), 30) + pad(`${p.modelName}`, 24),
      right: `${T.nodes(p.nodes)} · ${p.you?.member ? T.yours : T[p.state] || p.state}`,
      dim: p.state === 'closed', mark: p.state === 'running' ? '●' : '○', markColor: p.state === 'running' ? C.green : C.amber,
    }));
    const lh = Math.min(rows.length + 1, r.h - 7);
    listBox(scr, r.x, r.y + 2, r.w, lh, rows, st.sel, { header: T.head });
    const p = st.list[st.sel];
    let y = r.y + lh + 3;
    y = para(scr, r.x, y, r.w, poolLine(T, p), { fg: C.black }, 1);
    y = para(scr, r.x, y, r.w, p.open ? T.isOpen : T.isInvite, { fg: C.muted }, 1);
    para(scr, r.x, y + 1, r.w, p.state === 'running' && p.tps ? T.speed(dec(p.tps)) : T.missing(dec(p.missingGB), p.cardsMissing), { fg: C.navy, bold: true }, 1);
  },
  key(app, k) {
    const st = app.st.pools;
    if (st.typing) {
      const f = st.typing === 'q' ? 'q' : 'code';
      if (k === 'esc') { st.typing = null; st.err = ''; return; }
      if (k === 'backspace') st[f] = [...st[f]].slice(0, -1).join('');
      else if (k.ch && len(st[f]) < 40) st[f] += f === 'code' ? k.ch.toUpperCase() : k.ch;
      else if (k === 'space' && f === 'q') st.q += ' ';
      else if (k === 'enter') {
        if (f === 'q') { st.typing = null; this.load(app); return; }
        // An invitation code: join right away (the coordinator checks it)
        st.err = '';
        app.fx.pools(app.key, 'join', { code: st.code, node: node(app) })
          .then((res) => { app.pool = res.pool; app.poolRole = res.role; st.typing = null; app.go('contrib'); })
          .catch((e) => { st.err = app.S.errorOf(e); app.dirty = true; });
      }
      return;
    }
    if (k === 'esc' || (k === 'enter' && st.err)) return app.back();
    if (k.ch === '/' || k.ch === 'b' || k.ch === 'B') { st.typing = 'q'; return; }
    if (k.ch === 'c' || k.ch === 'C') { st.typing = 'code'; st.code = ''; return; }
    if (!st.list || !st.list.length) return;
    if (k === 'up') st.sel = Math.max(0, st.sel - 1);
    if (k === 'down') st.sel = Math.min(st.list.length - 1, st.sel + 1);
    if (k === 'enter') {
      const p = st.list[st.sel];
      if (p.state === 'closed') return;
      app.pool = p;
      app.go('contrib');
    }
  },
  keys: (app) => (app.st.pools?.typing ? [['ENTER', app.S.keys.enter], ['ESC', app.S.keys.esc]]
    : navKeys(app, [['↑↓', app.S.keys.move], ['/', app.S.pools.keySearch], ['C', app.S.pools.keyCode]])),
};

// ---------- join: what your card brings, then join ----------
const contrib = {
  id: 'contrib',
  enter(app) { app.st.contrib = { focus: 0, busy: false, err: '' }; },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.contrib;
    const st = app.st.contrib;
    const pool = app.pool;
    scr.put(r.x, r.y, clip(T.intro(pool.name), r.w), { fg: C.black, bold: true });
    scr.put(r.x, r.y + 1, clip(poolLine(S.pools, pool), r.w), { fg: C.muted });
    // You in the estimate: the alive machines + you
    const me = myNick(app);
    const others = (pool.machines || []).filter((m) => m.alive && !m.you).map((m) => ({ id: m.nick, gb: m.gb }));
    const est = planLayers({ sizeGB: pool.sizeGB, layers: pool.layers }, [...others, { id: me, gb: myGb(app) }], 1);
    const have = pool.haveGB + (pool.you?.member ? 0 : myGb(app));
    const missing = Math.max(0, Math.round((pool.needGB - have) * 10) / 10);
    let y = r.y + 3;
    if (est) {
      scr.put(r.x, y, S.pdash.layers, { fg: C.dark });
      layerStrip(scr, r.x + 7, y, r.w - 7, est, pool.layers, me, app.tick);
      const mine = est.find((p) => p.id === me);
      y = para(scr, r.x, y + 2, r.w, T.yours(mine.layers, pool.layers, dec(mine.gb)), { fg: C.navy, bold: true }, 2);
      ok(scr, r.x, y++, T.completes);
    } else {
      y = para(scr, r.x, y, r.w, T.notYet(dec(missing), Math.ceil(missing / 22)), { fg: C.navy, bold: true }, 2);
      y = para(scr, r.x, y, r.w, T.addsYou(dec(myGb(app))), { fg: C.black }, 2);
    }
    y = para(scr, r.x, y + 1, r.w, T.first(dec(Math.round((pool.sizeGB * myGb(app)) / Math.max(have, 1) * 10) / 10)), { fg: C.black }, 2);
    T.rules.forEach((l) => { if (y < r.y + r.h - 3) y = para(scr, r.x, y, r.w, '· ' + l, { fg: C.muted }, Math.min(3, r.y + r.h - 3 - y)); });
    if (st.err) para(scr, r.x, r.y + r.h - 4, r.w, st.err, { fg: C.red }, 2);
    if (st.busy) scr.put(r.x, r.y + r.h - 3, spin(app), { fg: C.black });
    bottomButtons(app, r, [pool.you?.member ? T.back2 : T.join, T.back], st.focus);
  },
  key(app, k) {
    const st = app.st.contrib;
    if (k === 'left' || k === 'right' || k === 'tab') st.focus = 1 - st.focus;
    else if (k === 'esc') app.back();
    else if (k === 'enter' && !st.busy) {
      if (st.focus === 1) return app.back();
      if (app.pool.you?.member && app.poolRole) return app.go('mesh');
      st.busy = true;
      st.err = '';
      app.fx.pools(app.key, 'join', { id: app.pool.id, node: node(app) })
        .then((res) => { app.pool = res.pool; app.poolRole = res.role; app.go('mesh'); })
        .catch((e) => { st.err = app.S.errorOf(e); })
        .finally(() => { st.busy = false; app.dirty = true; });
    }
  },
  keys: (app) => navKeys(app, [['←→', app.S.keys.move]]),
};

// ---------- create a pool ----------
const poolnew = {
  id: 'poolnew',
  enter(app) {
    const st = (app.st.poolnew = { phase: 'pick', sel: 0, models: null, open: false, head: 0, focus: 0, err: '', code: '', busy: false });
    app.fx.listPools(app.key).then((r) => {
      st.models = r.models || [];
      // The smallest real model first selected; the test one last
      st.sel = Math.max(0, st.models.findIndex((m) => !m.test));
      app.dirty = true;
    }).catch((e) => { st.err = app.S.errorOf(e); app.dirty = true; });
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.poolnew;
    const st = app.st.poolnew;
    if (st.phase === 'done') return this.drawDone(app, r);
    scr.put(r.x, r.y, clip(T.intro, r.w), { fg: C.black, bold: true });
    if (!st.models) return st.err ? para(scr, r.x, r.y + 2, r.w, st.err, { fg: C.red }) : scr.put(r.x, r.y + 2, `${spin(app)} ${S.pools.loading}`, { fg: C.black });
    const gb = myGb(app);
    const rows = st.models.map((m) => {
      const need = Math.max(0, Math.round((m.sizeGB * 1.08 - gb) * 10) / 10);
      return {
        text: pad(m.name, 30) + pad(m.quant, 12) + pad(`${dec(m.sizeGB)} GB`, 10),
        right: m.test ? T.test : need ? T.cards(Math.ceil(need / 22)) : T.fitsAlone,
        mark: m.test ? '·' : '■', markColor: m.test ? C.mid : C.navy,
      };
    });
    // With the options open the list gives up rows (it keeps the chosen one in view), so they clear the buttons
    const lh = Math.max(2, Math.min(rows.length + 1, r.h - (st.phase === 'opts' ? 12 : 10)));
    listBox(scr, r.x, r.y + 2, r.w, lh, rows, st.sel, { header: T.head });
    const m = st.models[st.sel];
    let y = r.y + lh + 3;
    const need = Math.max(0, Math.round((m.sizeGB * 1.08 - gb) * 10) / 10);
    y = para(scr, r.x, y, r.w, need ? T.missing(dec(gb), dec(need), Math.ceil(need / 22)) : T.alone, { fg: C.navy, bold: true }, 2);
    if (st.phase === 'opts') {
      checkbox(scr, r.x + 2, y + 1, st.open, T.open, st.focus === 0);
      scr.put(r.x + 6, y + 2, clip(st.open ? T.openHint : T.inviteHint, r.w - 6), { fg: C.muted });
      checkbox(scr, r.x + 2, y + 3, st.head === 0, T.headMe, st.focus === 1);
      scr.put(r.x + 6, y + 4, clip(st.head === 0 ? T.headMeHint : T.headLaterHint, r.w - 6), { fg: C.muted });
    }
    if (st.err) para(scr, r.x, r.y + r.h - 3, r.w, st.err, { fg: C.red }, 1);
    if (st.busy) scr.put(r.x, r.y + r.h - 3, `${spin(app)} ${T.creating}`, { fg: C.black });
    if (st.phase === 'opts') bottomButtons(app, r, [T.create, S.keys.esc], st.focus === 2 ? 0 : -1);
  },
  drawDone(app, r) {
    const { scr, S } = app;
    const T = S.poolnew;
    const st = app.st.poolnew;
    const p = app.pool;
    scr.put(r.x, r.y, clip(T.made(p.name), r.w), { fg: C.navy, bold: true });
    scr.put(r.x, r.y + 1, clip(poolLine(S.pools, p), r.w), { fg: C.muted });
    let y = r.y + 3;
    y = para(scr, r.x, y, r.w, p.open ? T.madeOpen : T.madeInvite, { fg: C.black }, 2);
    if (st.code) {
      const big = [...st.code].join(' ');
      const cw = len(big) + 8;
      const cx = r.x + Math.floor((r.w - cw) / 2);
      scr.fill(cx, y + 1, cw, 3, { bg: C.tip });
      scr.put(cx + 4, y + 2, big, { fg: C.black, bg: C.tip, bold: true });
      scr.shade(cx + 2, y + 4, cw, 1, C.black, 0.2);
      y += 6;
      y = para(scr, r.x, y, r.w, T.codeHow, { fg: C.dark }, 2);
    }
    y = para(scr, r.x, y + 1, r.w, app.poolRole === 'head' ? T.youHead : T.headLater, { fg: C.black }, 2);
    if (y < r.y + r.h - 4) para(scr, r.x, y + 1, r.w, T.safety, { fg: C.muted }, Math.min(3, r.y + r.h - 4 - y));
    bottomButtons(app, r, [S.keys.enter], 0);
  },
  key(app, k) {
    const st = app.st.poolnew;
    if (st.busy) return;
    if (st.phase === 'done') {
      if (k.ch === 'i' || k.ch === 'I') this.invite(app);
      if (k === 'enter') app.next();
      return;
    }
    if (!st.models) return k === 'esc' && app.back();
    if (st.phase === 'pick') {
      if (k === 'up') st.sel = Math.max(0, st.sel - 1);
      if (k === 'down') st.sel = Math.min(st.models.length - 1, st.sel + 1);
      if (k === 'esc') app.back();
      if (k === 'enter') { st.phase = 'opts'; st.focus = 0; st.err = ''; }
      return;
    }
    if (k === 'esc') { st.phase = 'pick'; return; }
    if (k === 'up' || k === 'shift-tab') st.focus = (st.focus + 2) % 3;
    else if (k === 'down' || k === 'tab') st.focus = (st.focus + 1) % 3;
    else if (k === 'space' || (k === 'enter' && st.focus < 2)) {
      if (st.focus === 0) st.open = !st.open;
      else if (st.focus === 1) st.head = 1 - st.head;
      else this.create(app);
    } else if (k === 'enter') this.create(app);
  },
  create(app) {
    const st = app.st.poolnew;
    const m = st.models[st.sel];
    st.busy = true;
    st.err = '';
    // Head = this machine (it joins as the head) or later (it joins as a worker; the owner names the head)
    app.fx.pools(app.key, 'create', { model: m.id, open: st.open, node: node(app), headLater: st.head === 1 })
      .then(async (res) => {
        app.pool = res.pool;
        app.poolRole = res.role;
        if (!st.open) await this.invite(app);
        st.phase = 'done';
      })
      .catch((e) => { st.err = app.S.errorOf(e); })
      .finally(() => { st.busy = false; app.dirty = true; });
  },
  async invite(app) {
    const st = app.st.poolnew;
    try {
      st.code = (await app.fx.pools(app.key, 'invite', { id: app.pool.id })).code;
    } catch (e) { st.err = app.S.errorOf(e); }
    app.dirty = true;
  },
  keys: (app) => {
    const st = app.st.poolnew;
    if (st?.phase === 'done') return [['ENTER', app.S.keys.enter], ['I', app.S.poolnew.keyInvite], ['F3', app.S.keys.f3]];
    if (st?.phase === 'opts') return [['ENTER', app.S.keys.enter], [app.S.keys.spaceKey, app.S.keys.space], ['↑↓', app.S.keys.move], ['ESC', app.S.keys.esc], ['F3', app.S.keys.f3]];
    return navKeys(app, [['↑↓', app.S.keys.move]]);
  },
};

// ---------- your node in the mesh ----------
// Starts the pool run (install mesh-llm → head creates / worker joins → layers → ready) and shows its steps.
// The run keeps going on the panel.
function ensureRun(app) {
  if (app.poolRun) return app.poolRun;
  app.status.share = 'waiting';
  app.status.vpn = 'wait';
  app.status.engineName = 'mesh-llm';
  app.status.engine = 'loading';
  app.status.model = app.pool?.modelName || '';
  app.poolTps = new Array(120).fill(0);
  app.poolRun = app.fx.startPoolRun({ key: app.key, pool: app.pool, role: app.poolRole || 'worker', machine: app.machine, nick: myNick(app), strings: () => app.S },
    (kind, text) => app.addLog(kind, text));
  return app.poolRun;
}

// Status bar from the run (called every frame by both pool screens)
function syncStatus(app) {
  const s = app.poolRun?.state;
  if (!s) return;
  if (s.pool) app.pool = s.pool;
  const st = app.status;
  st.engine = s.phase === 'ready' ? 'up' : s.phase === 'error' ? 'down' : 'loading';
  st.share = s.phase === 'ready' ? 'on' : 'waiting';
  st.vpn = !s.peers?.length && s.phase !== 'ready' ? 'wait' : s.path === 'relay' ? 'relay' : 'up';
  if (s.offline) st.site = 'down';
}

const mesh = {
  id: 'mesh',
  enter(app) { ensureRun(app); },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.mesh;
    syncStatus(app);
    const s = app.poolRun.state;
    const head = s.role === 'head';
    let y = para(scr, r.x, r.y, r.w, head ? T.introHead(app.pool.name) : T.introWorker(app.pool.name), { fg: C.black }, 3) + 1;
    const order = ['install', 'waiting-head', 'starting', 'joining', 'loading', 'ready'];
    const at = s.phase === 'error' ? -1 : order.indexOf(s.phase);
    const step = (done, active, label, hint) => {
      if (done) ok(scr, r.x, y, label);
      else if (active) scr.put(r.x, y, `${spin(app)} ${clip(label, r.w - 4)}…`, { fg: C.black, bold: true });
      else scr.put(r.x + 2, y, clip(label, r.w - 2), { fg: C.mid });
      y++;
      if (hint && active) { scr.put(r.x + 4, y, clip(hint, r.w - 4), { fg: C.muted }); y++; }
    };
    // 1. the engine
    const ip = s.install;
    if (at === 0 && ip && ip.step !== 'done') {
      scr.put(r.x, y, clip(`${ip.step === 'unpack' ? T.unpack : ip.step === 'verify' ? T.verify : T.install} ${ip.file || ''}`, r.w), { fg: C.black, bold: true });
      progress(scr, r.x, y + 1, r.w, ip.frac || 0, ip.step === 'waiting' ? S.model.pausedShort : `${S.of(fmtBytes(ip.bytes || 0), fmtBytes(ip.total || 0))}${ip.rate ? ` · ${fmtBytes(ip.rate)}/s` : ''}`);
      y += 3;
    } else step(at > 0, at === 0, T.installed, T.installHint);
    // 2. the mesh
    if (head) step(at > 2, at === 2, T.create, T.createHint);
    else step(at > 3 || (at >= 3 && s.peers?.length), at === 1 || at === 3, at === 1 ? T.waitHead : T.join, at === 1 ? T.waitHeadHint : T.joinHint);
    // 3. peers
    const peers = s.peers?.length || 0;
    const pathTxt = s.rtt ? (s.path === 'relay' ? T.relay(s.rtt) : T.direct(s.rtt)) : '';
    step(peers > 0, at >= 2 && at < 5 && !peers, peers ? T.peers(peers, pathTxt) : T.noPeers, peers ? '' : T.noPeersHint);
    // 4. layers
    const mine = (s.status?.stages || []).find((x) => x.node === s.status?.nodeId);
    const layersTxt = mine ? T.layers(mine.start + 1, mine.end, app.pool.layers) : T.layersWait;
    step(at === 5, at === 4, layersTxt, s.downloaded ? T.downloaded(fmtBytes(s.downloaded)) : T.layersHint);
    if (s.shortfall && at < 5) y = para(scr, r.x, y + 1, r.w, T.shortfall(dec(app.pool.missingGB)), { fg: C.amber, bold: true }, 2);
    else if (at >= 2 && at < 5 && y < r.y + r.h - 4) y = para(scr, r.x, y + 1, r.w, T.firewall, { fg: C.muted }, 2);
    if (s.phase === 'error') para(scr, r.x, y + 1, r.w, s.error, { fg: C.red }, 3);
    if (at === 5) {
      scr.put(r.x, y + 1, clip(head ? T.readyHead(app.pool.publicModel) : T.ready, r.w), { fg: C.navy, bold: true });
      bottomButtons(app, r, [S.keys.enter], 0);
    } else if (s.phase !== 'error') {
      // Waiting for others is normal: you can go on, the panel keeps waiting
      scr.put(r.x, r.y + r.h - 1, clip(T.canGo, r.w), { fg: C.muted });
    }
  },
  key(app, k) {
    const s = app.poolRun?.state;
    if (k === 'enter' && s && (s.phase !== 'install' || s.install?.step === 'done')) {
      app.saveState();
      app.next();
    }
  },
  keys: (app) => [['ENTER', app.S.keys.enter], ['F3', app.S.keys.f3]],
};

// ---------- the live pool panel ----------
const pooldash = {
  id: 'pooldash',
  enter(app) {
    ensureRun(app);
    app.refreshMe();
    if (!app.meTimer) { app.meTimer = setInterval(() => app.refreshMe(), 60000); app.meTimer.unref?.(); }
  },
  draw(app, r) {
    const { scr, S } = app;
    const T = S.pdash;
    syncStatus(app);
    const s = app.poolRun.state;
    const pool = app.pool || { name: '', layers: 1, machines: [] };
    const me = myNick(app);
    const { plan, real } = layout(app);
    const machines = pool.machines || [];
    const down = machines.filter((m) => !m.alive).map((m) => m.nick);
    // Headline + level badge
    const replan = s.phase === 'loading' && s.startedMs < Date.now() - 60000;
    const head = s.phase === 'ready' ? `${T.in(pool.name)} · ${pool.modelName} ${pool.quant}`
      : s.phase === 'error' ? s.error : s.phase === 'waiting-head' ? T.waitHead : replan ? T.replan : T.starting;
    scr.put(r.x, r.y, clip(head, r.w - 18), { fg: s.phase === 'ready' ? C.navy : s.phase === 'error' ? C.red : C.amber, bold: true });
    const lvl = levelOf(S.levels, app.tokens.total ?? 0);
    scr.put(r.x + r.w - len(lvl.name) - 2, r.y, ` ${lvl.name} `, { fg: C.black, bg: C.tip, bold: true });

    // The pipeline: machine to machine in layer order, the token comes out the end
    this.pipeline(app, r.x, r.y + 2, r.w, plan, me, down);
    scr.put(r.x, r.y + 4, T.layers, { fg: C.dark });
    layerStrip(scr, r.x + 7, r.y + 4, r.w - 7, plan, pool.layers || 1, me, app.tick, down);
    if (!real) scr.put(r.x + r.w - len(T.estimate) - 1, r.y + 3, T.estimate, { fg: C.muted });

    // Machines + pool box
    const tw = Math.max(50, Math.floor(r.w * 0.64));
    const th = Math.max(2, machines.length) + 1;
    const ty = r.y + 6;
    const rows = machines.map((m) => {
      const p = plan.find((x) => x.id === m.nick);
      return {
        text: pad((m.you ? T.youTag(m.nick) : m.nick) + (m.head ? ` · ${T.head}` : ''), 22) + pad(clip(m.gpu || '', 15), 16) + (p ? `${p.from}–${p.to}` : '—'),
        right: `${pad(`${dec(m.gb)} GB`, 8)}${pad(!m.alive ? T.down : m.state === 'ready' ? T.up : T.loading, 8)}`,
        mark: '■', markColor: !m.alive ? C.red : colorOf(plan, m.nick, me), bold: m.you, dim: !m.alive,
      };
    });
    listBox(scr, r.x, ty, tw, th + 1, rows, -1, { header: [`${pad(T.nodes[0], 24)}${pad(T.nodes[1], 16)}${T.nodes[2]}`, `${pad(T.nodes[3], 8)}${pad(T.nodes[4], 8)}`] });
    if (r.w - tw - 1 >= 24) {
      const B = groupBox(scr, r.x + tw + 1, ty, r.w - tw - 1, th + 1, T.stats);
      const kw = Math.max(...[T.speed, T.today, T.mine, T.yourTotal, T.path].map(len)) + 1;
      const kv = (y, k, v, bold) => {
        if (y >= B.y + B.h) return;
        scr.put(B.x, y, pad(k, kw), { fg: C.dark });
        scr.put(B.x + kw, y, clip(v, B.w - kw), { fg: C.black, bold });
      };
      const tps = s.tps || pool.tps;
      const mine = plan.find((p) => p.id === me);
      kv(B.y, T.speed, tps ? `${dec(tps)} tok/s` : '—', true);
      kv(B.y + 1, T.today, `${fmtNum(pool.tokToday || 0)} tok`);
      kv(B.y + 2, T.mine, mine ? T.share(dec(Math.round((mine.layers / (pool.layers || 1)) * 1000) / 10)) : '—');
      kv(B.y + 3, T.yourTotal, app.tokens.total == null ? '—' : fmtNum(app.tokens.total), true);
      kv(B.y + 4, T.path, s.rtt ? `${s.path === 'relay' ? T.relay : T.direct} ${s.rtt} ms` : '—');
    }
    if (app.poolTps && s.tps) app.poolTps[app.poolTps.length - 1] = s.tps;

    // Log + tok/s sparkline
    const ly = ty + th + 2;
    const lh = r.y + r.h - ly;
    if (lh < 3) return;
    listBox(scr, r.x, ly, r.w, lh, [], -1, { header: [S.dash.log, ''] });
    const sw = Math.min(30, r.w - 20);
    scr.put(r.x + r.w - sw - 1, ly, sparkline(app.poolTps || [], sw), { fg: C.select, bg: C.gray });
    const color = { done: C.green, fail: C.red, warn: C.amber, info: C.mid };
    const glyph = { done: '√', fail: 'x', warn: '!', info: '·' };
    app.log.slice(-(lh - 1)).forEach((e, i) => {
      const y = ly + 1 + i;
      scr.put(r.x + 1, y, e.time, { fg: C.mid, bg: C.white });
      scr.put(r.x + 10, y, glyph[e.kind] || '·', { fg: color[e.kind] || C.mid, bg: C.white, bold: true });
      scr.put(r.x + 12, y, clip(e.text, r.w - 13), { fg: e.kind === 'fail' ? C.red : C.black, bg: C.white });
    });
  },
  // request ► [ana] ─► [beto] ─► [you] ► token
  pipeline(app, x, y, w, plan, me, down) {
    const { scr, S } = app;
    const T = S.pdash;
    const boxes = plan.map((p) => `[${clip(p.id === me ? S.you : p.id, 10)}]`);
    const inner = boxes.reduce((a, b) => a + len(b), 0);
    const gap = Math.max(3, Math.floor((w - inner - len(T.pipeline) - len(T.out) - 2) / (boxes.length + 1)));
    let cx = scr.put(x, y, T.pipeline, { fg: C.dark }) + 1;
    const stops = [];
    boxes.forEach((b, i) => {
      scr.put(cx, y, '─'.repeat(gap - 1) + '►', { fg: C.mid });
      stops.push(cx);
      cx += gap;
      const isDown = down.includes(plan[i].id);
      scr.put(cx, y, b, { fg: isDown ? C.red : colorOf(plan, plan[i].id, me), bold: true });
      if (isDown) scr.put(cx + 1, y + 1, 'x'.padEnd(len(b) - 2, ' '), { fg: C.red, bold: true });
      cx += len(b);
    });
    scr.put(cx, y, '─'.repeat(gap - 1) + '►', { fg: C.mid });
    stops.push(cx);
    scr.put(cx + gap, y, T.out, { fg: C.dark });
    if (app.poolRun?.state?.phase === 'ready' && app.status.busy) {
      const hop = Math.floor(app.tick / 3) % stops.length;
      scr.put(stops[hop] + Math.floor(gap / 2) - 1, y, '■', { fg: hop === stops.length - 1 ? C.green : C.amber, bold: true });
    }
  },
  key(app, k) {
    const s = app.poolRun?.state;
    const pool = app.pool;
    if (!s || !pool) return;
    const owner = pool.you?.owner;
    const D = app.S.pdash;
    if ((k.ch === 'i' || k.ch === 'I') && owner) {
      app.fx.pools(app.key, 'invite', { id: pool.id }).then((r) => app.addLog('info', D.logInvite(r.code))).catch((e) => app.addLog('fail', app.S.errorOf(e)));
    }
    if ((k.ch === 'o' || k.ch === 'O') && owner) {
      app.fx.pools(app.key, 'setOpen', { id: pool.id, open: !pool.open }).then((r) => { app.pool = r.pool; app.addLog('info', r.pool.open ? D.logOpen : D.logClosed); }).catch((e) => app.addLog('fail', app.S.errorOf(e)));
    }
    // H: the next alive member becomes the head (the steadiest machine; the owner decides)
    if ((k.ch === 'h' || k.ch === 'H') && owner) {
      const alive = (pool.machines || []).filter((m) => m.alive);
      const at = alive.findIndex((m) => m.head);
      const next = alive[(at + 1) % Math.max(1, alive.length)];
      if (next && !next.head) {
        app.fx.pools(app.key, 'setHead', { id: pool.id, nick: next.nick }).then((r) => { app.pool = r.pool; app.addLog('info', D.logHead(next.nick)); }).catch((e) => app.addLog('fail', app.S.errorOf(e)));
      }
    }
    if (k.ch === 'l' || k.ch === 'L') {
      app.modal = { title: D.leaveTitle, lines: D.leaveLines, labels: [D.stay, D.leave], focus: 0, onYes: async () => { await app.poolRun.leave(); app.fx.saveState?.({}); app.quitNow(); } };
    }
    // Demo only: X knocks a machine out (and back), D the site
    if (app.fx.demo && (k.ch === 'x' || k.ch === 'X')) app.fx.world.nodeDown = !app.fx.world.nodeDown;
    if (app.fx.demo && (k.ch === 'd' || k.ch === 'D')) app.fx.world.siteDown = !app.fx.world.siteDown;
  },
  keys: (app) => {
    const own = app.pool?.you?.owner;
    return [...(own ? [['I', app.S.pdash.keyInvite], ['O', app.pool?.open ? app.S.pdash.keyClose : app.S.pdash.keyOpen], ['H', app.S.pdash.keyHead]] : []), ['L', app.S.pdash.keyLeave], ['F3', app.S.keys.f3]];
  },
};

export const POOL_SCREENS = [pools, contrib, poolnew, mesh, pooldash];
export { ensureRun };
