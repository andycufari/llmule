#!/usr/bin/env node
// Dev only: a local llmule.xyz that runs the REAL CM64 functions (../../cm64/llmule.xyz/function/*.js) on a
// fake `app` (in-memory database, app.crypto, app.response, sessions). It's how the installer is tested end
// to end without touching the real site. What's fake here is the platform, not LLMule's code.
//
//   node tools/fake-site.mjs [--port 8787] [--seed]
//
// Extra endpoints (no such thing on the real site):
//   POST /__session  { email }          → { cookie }: a "web session" for that email (send it as X-Fake-Session)
//   POST /__approve  { email, code }    → runs muleLink approve as that web user (the person on /link)
//   POST /__approve_latest { email, nick? } → approves the newest pending link (for screen recordings)
//   GET  /__db?t=mule_users             → dump a table (keys masked)
//   POST /__user     { email, nick? }   → create/fetch a user row, returns its apiKey (for tests)
//
// Semantics copied from jasonjs-framework (core/databases/QueryBuilder.js, core/execution/appCrypto.js):
// equality filters, in(), orderBy (missing fields sort last on desc), limit/skip, first/count, add() applies
// schema defaults, update() merges. NOT copied: the `.gt()` bug muleNetwork mentions, quotas, the WAF.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The site's code: this repo's mirror, or a checkout of andycufari/llmule-server (LLMULE_SITE_DIR)
const SITE = process.env.LLMULE_SITE_DIR ? path.resolve(process.env.LLMULE_SITE_DIR) : path.resolve(HERE, '../../cm64/llmule.xyz');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', process.env.PORT || 8787));
const QUIET = process.argv.includes('--quiet');

// ---------- database ----------
const schemas = {};
for (const f of fs.readdirSync(path.join(SITE, 'database'))) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(fs.readFileSync(path.join(SITE, 'database', f), 'utf8'));
  schemas[d.id] = d.schema || {};
}
const tables = {};
const tableOf = (name) => (tables[name] ||= new Map());
const copy = (x) => (x == null ? x : structuredClone(x));
const cmp = (a, b) => (a === b ? 0 : a === undefined || a === null ? -1 : b === undefined || b === null ? 1 : a < b ? -1 : 1);

class Query {
  constructor(table, filter) { this.table = table; this.eq = { ...(filter || {}) }; this.ops = []; this.sort = null; this.lim = 0; this.sk = 0; }
  in(f, values) { this.ops.push((r) => values.includes(r[f])); return this; }
  gt(f, v) { this.ops.push((r) => r[f] > v); return this; }
  gte(f, v) { this.ops.push((r) => r[f] >= v); return this; }
  lt(f, v) { this.ops.push((r) => r[f] < v); return this; }
  lte(f, v) { this.ops.push((r) => r[f] <= v); return this; }
  not(f, v) { this.ops.push((r) => r[f] !== v); return this; }
  orderBy(f, dir = 'asc') { this.sort = [f, String(dir).startsWith('desc') || dir === -1 ? -1 : 1]; return this; }
  limit(n) { this.lim = n; return this; }
  skip(n) { this.sk = n; return this; }
  rows() {
    let rows = [...tableOf(this.table).values()].filter((r) => Object.entries(this.eq).every(([k, v]) => {
      const x = k === '_id' || k === 'id' ? r._id : r[k];
      return Array.isArray(x) && !Array.isArray(v) ? x.includes(v) : x === v;
    }) && this.ops.every((op) => op(r)));
    if (this.sort) {
      const [f, d] = this.sort;
      rows.sort((a, b) => {
        // Mongo: missing values are the smallest
        const c = cmp(a[f], b[f]);
        return d * c;
      });
    }
    rows = rows.slice(this.sk, this.lim ? this.sk + this.lim : undefined);
    return rows.map(copy);
  }
  async first() { return this.rows()[0] || null; }
  async count() { this.lim = 0; return this.rows().length; }
  async exists() { return this.rows().length > 0; }
  then(ok, ko) { return Promise.resolve(this.rows()).then(ok, ko); }
}

const db = {
  use(name) {
    const t = tableOf(name);
    const schema = schemas[name] || {};
    return {
      query: (filter) => new Query(name, filter),
      async getById(id) { return copy(t.get(String(id)) || null); },
      async add(data) {
        const row = { ...copy(data) };
        for (const [k, c] of Object.entries(schema)) if (row[k] === undefined && c.default !== undefined) row[k] = copy(c.default);
        for (const [k, c] of Object.entries(schema)) if (c.required && (row[k] === undefined || row[k] === null || row[k] === '')) throw new Error(`${name}: ${k} is required`);
        if (name === 'mule_users' && [...t.values()].some((r) => r.apiKey === row.apiKey)) throw new Error('E11000 duplicate key apiKey');
        row._id = randomBytes(12).toString('hex');
        t.set(row._id, row);
        return copy(row);
      },
      async update(id, patch) {
        const r = t.get(String(id));
        if (!r) return { success: false };
        Object.assign(r, copy(patch));
        return { success: true };
      },
      async delete(id) { return { success: t.delete(String(id)) }; },
    };
  },
};

// ---------- app.crypto (same as the framework) ----------
const appCrypto = {
  randomToken: (bytes = 32, enc = 'hex') => randomBytes(Number(bytes)).toString(enc),
  uuid: () => randomUUID(),
  hash: (input, alg = 'sha256', enc = 'hex') => createHash(alg).update(String(input), 'utf8').digest(enc),
  hmac: (secret, input, alg = 'sha256', enc = 'hex') => createHmac(alg, String(secret)).update(String(input), 'utf8').digest(enc),
  safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()) && a.length === b.length;
  },
};

// ---------- functions ----------
const cache = new Map();
function loadFn(name) {
  const file = path.join(SITE, 'function', `${name}.js`);
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  return vm.runInNewContext(`${src}\n;${name}`, { console }, { filename: file });
}

const sessions = new Map(); // cookie → email
const ROUTES = {
  'v1/models': 'muleModels', 'v1/chat/completions': 'muleChat',
  'provider/poll': 'muleProviderPoll', 'provider/result': 'muleProviderResult',
};

async function runFn(name, { method, params, headers, email }) {
  const fn = loadFn(name);
  if (!fn) return { status: 404, body: JSON.stringify({ error: 'no function ' + name }) };
  const h = new Headers(headers);
  const app = {
    method, params,
    request: { headers: h },
    response: (body, status = 200, opts = {}) => ({ body, status, contentType: opts.contentType || 'text/html' }),
    db,
    crypto: appCrypto,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    cache: {
      async get(k) { const c = cache.get(k); return c && c.exp > Date.now() ? copy(c.v) : null; },
      async set(k, v, ttl) { cache.set(k, { v: copy(v), exp: Date.now() + (ttl || 60) * 1000 }); },
    },
    env: { async get(k, d) { return process.env[k] ?? d; } },
    auth: email ? { isAuthenticated: true, user: { email } } : { isAuthenticated: false, user: null },
  };
  return fn(app);
}

const readBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (d) => { b += d; });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
});

const send = (res, status, obj, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
};

const mask = (r) => ({ ...r, ...(r.apiKey && { apiKey: r.apiKey.slice(0, 8) + '…' }) });

async function userRow(email, nick) {
  const users = db.use('mule_users');
  let u = await users.query({ email }).first();
  if (!u) u = await users.add({ email, apiKey: 'llm_' + appCrypto.randomToken(), status: 'active', legacyId: '', uses: 0, served: 0, createdMs: Date.now() });
  if (nick && u.nick !== nick) { await users.update(u._id, { nick }); u.nick = nick; }
  return u;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname.replace(/^\/+/, '');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const params = { ...Object.fromEntries(url.searchParams), ...body };
  try {
    if (p === '__session') { const c = randomBytes(8).toString('hex'); sessions.set(c, body.email); return send(res, 200, { cookie: c }); }
    if (p === '__user') { const u = await userRow(body.email, body.nick); return send(res, 200, { apiKey: u.apiKey, nick: u.nick || null, id: u._id }); }
    if (p === '__approve') {
      const r = await runFn('muleLink', { method: 'POST', params: { op: 'approve', code: body.code }, headers: {}, email: body.email });
      return send(res, r.status, r.body);
    }
    // The newest pending link, approved as `email` (for recordings: nobody has to read the code)
    if (p === '__approve_latest') {
      const row = [...tableOf('mule_links').values()].filter((r) => r.status === 'pending').sort((a, b) => b.createdMs - a.createdMs)[0];
      if (!row) return send(res, 404, { error: 'nothing pending' });
      const u = await userRow(body.email, body.nick);
      Object.assign(row, { status: 'approved', userId: u._id, approvedMs: Date.now() });
      return send(res, 200, { ok: true });
    }
    if (p === '__db') return send(res, 200, [...tableOf(url.searchParams.get('t')).values()].map(mask));
    if (p === 'link') return send(res, 200, '<p>fake /link: POST /__approve { email, code }</p>', 'text/html');
    const name = p.startsWith('api/') ? p.slice(4) : ROUTES[p];
    if (!name) return send(res, 404, { error: 'not found' });
    const email = sessions.get(req.headers['x-fake-session'] || '') || null;
    const r = await runFn(name, { method: req.method, params, headers: req.headers, email });
    if (!QUIET) console.log(new Date().toISOString().slice(11, 19), req.method, p, params.op || '', '→', r.status);
    res.writeHead(r.status, { 'Content-Type': r.contentType });
    res.end(r.body);
  } catch (e) {
    console.error(p, e);
    send(res, 500, { error: { message: e.message } });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  if (process.argv.includes('--seed')) {
    // Made-up people for local tests only
    for (const [email, nick] of [['ana@example.com', 'ana'], ['beto@example.com', 'beto'], ['caro@example.com', 'caro']]) await userRow(email, nick);
  }
  console.log(`fake llmule.xyz on http://127.0.0.1:${PORT} (functions from ${SITE})`);
});
