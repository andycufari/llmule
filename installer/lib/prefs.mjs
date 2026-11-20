// ~/.llmule/prefs.json: small choices that outlive setup (today only the language). Never throws:
// a missing or broken file is just "no preference".
import fs from 'node:fs';
import { P } from './paths.mjs';

export function readPrefs() {
  try {
    const p = JSON.parse(fs.readFileSync(P.prefs, 'utf8'));
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function writePrefs(patch) {
  try {
    fs.mkdirSync(P.home, { recursive: true, mode: 0o700 });
    fs.writeFileSync(P.prefs, JSON.stringify({ ...readPrefs(), ...patch }, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
