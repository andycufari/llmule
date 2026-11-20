// Where LLMule keeps its things: one folder, ~/.llmule (LLMULE_HOME moves it, for tests).
//   provider.json  the key + what the provider shares (0600, the same file `mule-provider.mjs setup` writes)
//   state.json     what setup chose (engine, model, pool), so the desktop icon opens straight on the panel
//   installed.json every file LLMule created outside this folder (icons), for `--uninstall`
//   prefs.json     the person's choices that aren't setup: the language ({ lang: 'es' | 'en' })
//   mesh-owner-key.json  this machine's mesh-llm owner identity (0600): pool members trust each other by it
//   bin/ engine/<tag>/ mesh/<tag>/ mesh-home/ models/
import os from 'node:os';
import path from 'node:path';

export const HOME = process.env.LLMULE_HOME || path.join(os.homedir(), '.llmule');
export const P = {
  home: HOME,
  config: process.env.LLMULE_CONFIG || path.join(HOME, 'provider.json'),
  state: path.join(HOME, 'state.json'),
  installed: path.join(HOME, 'installed.json'),
  prefs: path.join(HOME, 'prefs.json'),
  bin: path.join(HOME, 'bin'),
  engine: path.join(HOME, 'engine'),
  mesh: path.join(HOME, 'mesh'),
  meshHome: path.join(HOME, 'mesh-home'), // mesh-llm's HOME: its keys, logs and model cache stay in here
  meshOwnerKey: path.join(HOME, 'mesh-owner-key.json'),
  models: path.join(HOME, 'models'),
  downloads: path.join(HOME, 'downloads'),
};
// Shown to the person: ~ instead of their home path
export const tilde = (p) => (p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p);
