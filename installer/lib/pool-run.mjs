// A machine in a pool, for real: the mesh-llm node + the heartbeat to llmule.xyz (mulePools) every 15 s +,
// on the head, the provider that publishes pool/<model> once the split is ready.
//   head:   starts the mesh (it creates it), reports its invite token and the stages to the coordinator
//   worker: waits for the head's token from the coordinator, then joins with it (--join-file: a new head's
//           token is just a new file, mesh-llm re-reads it on rejoin)
// The screens only read run.state; events go to onLog(kind, text) for the panel's log.
//
// Who gets in (0.2.1): every beat sends this machine's mesh owner id; mulePools answers members with
// pool.meshOwners (all members' ids) and pool.headMeshOwner. The node trusts exactly that list (lib/mesh.mjs).
// mesh-llm reads it at start, so when it changes (someone joins or leaves) the node restarts (~1 min of re-plan).
// A worker doesn't start until the list has the head's owner. After each start the node must report itself
// owner-verified and private, or the run stops.

import fs from 'node:fs';
import path from 'node:path';
import { P } from './paths.mjs';
import { installMesh, startMesh, cacheBytes, meshIdentity, isOwnerId, privateProblem } from './mesh.mjs';
import { ES } from './strings.mjs';

const BEAT_MS = 15000;
const STATUS_MS = 3000;

export function startPoolRun({ api, key, pool, role, machine, nick, startProvider, strings = () => ES }, onLog = () => {}) {
  const R = () => strings().run; // what the log says, in the app's language
  const state = {
    phase: 'install', role, pool, install: null, status: null, peers: [], rtt: null, path: null,
    downloaded: 0, error: '', providerOn: false, tps: null, lastJob: null, startedMs: Date.now(), token: '',
  };
  let stopped = false;
  let mesh = null;
  let provider = null;
  let timers = [];
  let joinedWith = '';
  let ownerId = '';        // this machine's mesh owner id
  let runningOwners = '';  // the trusted list the running node was started with
  let checked = false;     // the running node passed privateProblem()
  let beating = false;
  const tokenFile = path.join(P.home, 'pool-invite.token');

  // The members' owner ids from the site (ours always in), sorted: same list → same string
  const ownersOf = (pool) => [...new Set([...(Array.isArray(pool?.meshOwners) ? pool.meshOwners : []).filter(isOwnerId), ownerId])].sort();

  const call = async (op, body = {}) => {
    const r = await fetch(`${api}/api/mulePools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ op, ...body }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error?.message || `mulePools ${r.status}`), { status: r.status, code: d.error?.code });
    return d;
  };

  const startNode = async (bin, joinFile) => {
    const owners = ownersOf(state.pool);
    let m = null;
    let gone = false;
    runningOwners = owners.join(',');
    checked = false;
    state.phase = role === 'head' ? 'starting' : 'joining';
    m = await startMesh({ bin, ref: state.pool.ref, name: nick, joinFile, trustOwners: owners }, (e) => {
      if (m?.replaced) return; // an old node we restarted on purpose
      if (e.type === 'token') state.token = e.token;
      if (e.type === 'rtt') { state.rtt = e.ms; state.path = e.path; }
      if (e.type === 'shortfall') { state.shortfall = true; }
      if (e.type === 'stage-ready') onLog('info', R().layersReady);
      if (e.type === 'request-failed') onLog('fail', R().meshReqFail(e.text));
      if (e.type === 'exit') {
        gone = true;
        if (stopped) return;
        state.phase = 'error';
        state.error = R().meshExit(e.code);
        onLog('fail', state.error);
        if (mesh === m) mesh = null;
      }
    });
    if (!gone) mesh = m;
    onLog('info', R().nodeUp(owners.length));
  };

  // Stop the node on purpose (members changed, head moved): its exit isn't an error
  const stopNode = async () => {
    const m = mesh;
    mesh = null;
    state.status = null;
    state.peers = [];
    state.rtt = null;
    state.token = ''; // a restarted head reports its new token
    checked = false;
    if (m) { m.replaced = true; await m.stop(); }
  };

  // Something is off with the node itself: stop everything and say why
  const halt = async (msg) => {
    state.phase = 'error';
    state.error = msg;
    onLog('fail', msg);
    stopped = true;
    timers.forEach(clearInterval);
    timers = [];
    if (provider) { await provider.stop(); provider = null; state.providerOn = false; }
    if (mesh) { mesh.replaced = true; await mesh.stop(); mesh = null; }
  };

  const ensureProvider = () => {
    if (role !== 'head' || provider || !state.status?.ready || !state.status.model) return;
    provider = startProvider({
      key, api, upstream: mesh.api, name: nick,
      models: `${state.pool.publicModel}=${state.status.model}`,
    }, (e) => {
      if (e.type === 'online') { state.providerOn = true; onLog('info', R().published(state.pool.publicModel)); }
      if (e.type === 'done') {
        state.tps = e.ms > 0 ? Math.round((e.tok / (e.ms / 1000)) * 10) / 10 : null;
        state.lastJob = e;
        onLog('done', R().job(e.tok, state.tps ? strings().dec(state.tps) : ''));
      }
      if (e.type === 'fail') onLog('fail', R().fail(e.why));
      if (e.type === 'waiting') state.providerOn = false;
      if (e.type === 'exit' && !stopped) { provider = null; state.providerOn = false; onLog('warn', R().providerExit(e.code)); }
    });
  };

  const beat = async () => {
    if (stopped || beating) return;
    beating = true;
    try {
      const st = state.status;
      const body = { id: state.pool.id, state: state.phase === 'ready' ? 'ready' : state.phase, gb: machine.vramGB || 0 };
      if (st?.nodeId) body.meshNodeId = st.nodeId;
      if (ownerId) body.meshOwner = ownerId;
      if (role === 'head') {
        if (state.token || st?.token) body.token = state.token || st.token;
        if (st?.stages?.length) body.stages = st.stages.map((s) => ({ node: s.node, start: s.start, end: s.end }));
        if (state.tps) body.tps = state.tps;
      }
      const r = await call('heartbeat', body);
      state.pool = r.pool;
      state.you = r.you;
      state.offline = false;
      if (stopped) return;
      // The owner moved the head: follow it (a new head starts its own mesh; the old one becomes a worker
      // and waits for the new head's token)
      if (r.role !== role) {
        onLog('warn', r.role === 'head' ? R().nowHead : R().headChanged);
        role = r.role;
        state.role = role;
        state.token = '';
        joinedWith = '';
        if (provider) { await provider.stop(); provider = null; state.providerOn = false; }
        await stopNode();
      }
      if (!state.bin) return;
      // Members changed: the node only trusts the list it started with → restart it with the new one
      const owners = ownersOf(r.pool).join(',');
      if (mesh && owners !== runningOwners) {
        onLog('warn', R().membersChanged);
        await stopNode();
      }
      if (role === 'worker') {
        // (Re)join with the head's current token, once the head's owner is in our list
        const headOwner = isOwnerId(r.pool.headMeshOwner) ? r.pool.headMeshOwner : '';
        if (r.pool.token && headOwner) {
          if (r.pool.token !== joinedWith) {
            fs.writeFileSync(tokenFile, r.pool.token + '\n', { mode: 0o600 });
            joinedWith = r.pool.token;
          }
          if (!mesh) await startNode(state.bin, tokenFile);
        } else if (!mesh) state.phase = 'waiting-head';
      }
      if (role === 'head' && !mesh) await startNode(state.bin, null);
    } catch (e) {
      state.offline = true;
      // Out of the pool: the node goes down too (the others already stopped trusting this machine)
      if (e.status === 404) await halt(R().gone);
      else if (e.code === 'mesh_cmd' || /^mesh-llm/.test(e.message)) { state.phase = 'error'; state.error = e.message; onLog('fail', e.message); }
    } finally {
      beating = false;
    }
  };

  const poll = async () => {
    if (stopped || !mesh) return;
    try {
      const m = mesh;
      const st = await m.status();
      if (m !== mesh) return;
      // First answer of each start: signed by our owner key and a private mesh, or we don't go on
      if (!checked) {
        const why = privateProblem(st, m.ownerId);
        if (why) {
          await halt(R().unsafe(why));
          return;
        }
        checked = true;
        state.verified = true;
      }
      state.status = st;
      state.peers = state.status.peers;
      state.downloaded = cacheBytes();
      if (state.status.ready && state.phase !== 'ready') { state.phase = 'ready'; onLog('info', R().ready); }
      else if (!state.status.ready && state.phase === 'ready') { state.phase = 'loading'; onLog('warn', R().replan); }
      else if (!state.status.ready && (state.phase === 'starting' || state.phase === 'joining') && state.status.stages.length) state.phase = 'loading';
      ensureProvider();
    } catch { /* mesh still booting */ }
  };

  (async () => {
    try {
      const { bin } = await installMesh(machine, (p) => { state.install = p; });
      state.install = { step: 'done' };
      ownerId = await meshIdentity(bin);
      if (stopped) return;
      state.phase = role === 'head' ? 'starting' : 'waiting-head';
      // The first beat sends our owner id and brings the members' list; the node starts from there
      state.bin = bin;
      await beat();
      timers.push(setInterval(beat, BEAT_MS));
      timers.push(setInterval(poll, STATUS_MS));
    } catch (e) {
      state.phase = 'error';
      state.error = e.code === 'no_space' ? R().noSpace(Math.ceil((e.need - e.free) / 1e9))
        : e.code === 'no_build' ? R().noBuild
          : e.message;
      onLog('fail', state.error);
    }
  })();

  return {
    state,
    call,
    async stop() {
      stopped = true;
      timers.forEach(clearInterval);
      timers = [];
      if (provider) await provider.stop();
      if (mesh) await mesh.stop();
    },
    async leave() {
      try { await call('leave', { id: state.pool.id }); } catch { /* offline: it times out anyway */ }
      await this.stop();
    },
  };
}
