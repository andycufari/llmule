// If LLMule was killed hard (SIGKILL, a crash), its llama-server / mesh-llm child keeps running and holds the
// port and the GPU. Each child's pid goes to ~/.llmule/<name>.pid; before starting a new one we stop the old
// one, but only if that pid is still running OUR binary (checked with ps, Mac/Linux; Windows: not handled [A]).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { P } from './paths.mjs';

const file = (name) => path.join(P.home, `${name}.pid`);

export function killStale(name, bin) {
  let pid;
  try { pid = Number(fs.readFileSync(file(name), 'utf8')); } catch { return false; }
  if (!(pid > 1) || process.platform === 'win32') return false;
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
    if (!cmd.startsWith(bin)) return false;
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false; // not running
  } finally {
    fs.rmSync(file(name), { force: true });
  }
}

export function writePid(name, pid) {
  try { fs.writeFileSync(file(name), String(pid)); } catch { /* best effort */ }
}
