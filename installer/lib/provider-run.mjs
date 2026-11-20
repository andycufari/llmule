// Sharing = the provider (../provider/mule-provider.mjs, untouched) running as a child of this same
// program (`llmule __provider`). The TUI only reads its log lines and turns them into events.
// Pausing = stopping the child: it says goodbye to llmule.xyz when we write "bye" on its stdin (works on
// Windows too, where a parent can't send a catchable signal), SIGTERM as a fallback; resuming = a new child.

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The args to run ourselves again: plain `node llmule.mjs`, `deno run llmule.mjs`, or a compiled binary.
// As a script, always llmule.mjs next to lib/ (argv[1] may be a test or tool that imported us)
export function selfArgs(flag) {
  const a1 = process.argv[1];
  const isScript = !!a1 && /\.(mjs|js|cjs)$/.test(a1) && a1 !== process.execPath && fs.existsSync(a1);
  if (!isScript) return [flag]; // compiled: the binary is the program
  const entry = fileURLToPath(new URL('../llmule.mjs', import.meta.url));
  return globalThis.Deno ? ['run', '-A', entry, flag] : [entry, flag];
}

// One provider log line → an event, or null. The provider prints: "<iso> <message>"
export function parseProviderLine(line) {
  const msg = String(line).replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s+/, '').trim();
  let m;
  if ((m = /^job (\S+) started (\S+)/.exec(msg))) return { type: 'start', id: m[1], model: m[2] }; // proposed line, see DESIGN.md
  if ((m = /^job (\S+) failed: (.*)$/.exec(msg))) return { type: 'fail', id: m[1], why: m[2] };
  if ((m = /^job (\S+) upstream (\d+)/.exec(msg))) return { type: 'fail', id: m[1], why: `upstream ${m[2]}` };
  if ((m = /^job (\S+) (\S+) (\d+)ms (\d+|\?) tok( \(too late)?/.exec(msg))) {
    return { type: 'done', id: m[1], model: m[2], ms: Number(m[3]), tok: m[4] === '?' ? 0 : Number(m[4]), late: !!m[5] };
  }
  if ((m = /^online — sharing (.*)$/.exec(msg))) return { type: 'online', models: m[1].split(', ') };
  if (/^upstream down or not serving/.test(msg)) return { type: 'waiting', why: 'engine' };
  if ((m = /^poll failed: (.*) — retrying in (\d+)s/.exec(msg))) return { type: 'waiting', why: 'site', detail: m[1], retry: Number(m[2]) };
  if (/^sharing /.test(msg)) return { type: 'starting' };
  if (/leaving the network/.test(msg)) return { type: 'stopped' };
  return { type: 'log', text: msg };
}

// cfg: { key, api, upstream, models: 'public=local,...', name, extraBody? }
export function startProvider(cfg, onEvent) {
  const env = {
    ...process.env,
    LLMULE_KEY: cfg.key,
    LLMULE_API: cfg.api,
    UPSTREAM: cfg.upstream,
    MODELS: cfg.models,
    NAME: cfg.name,
    LLMULE_STDIN_BYE: '1',
    ...(cfg.extraBody && { EXTRA_BODY: JSON.stringify(cfg.extraBody) }),
  };
  const child = spawn(process.execPath, selfArgs('__provider'), { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stdin.on('error', () => {}); // it may be gone already
  const lines = (stream) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) onEvent(parseProviderLine(line));
      }
    });
  };
  lines(child.stdout);
  lines(child.stderr);
  child.on('exit', (code) => onEvent({ type: 'exit', code }));
  return {
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      try { child.stdin.write('bye\n'); } catch { /* closed */ }
      setTimeout(() => child.exitCode === null && child.kill('SIGTERM'), 3500).unref();
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 6000).unref();
    }),
  };
}
