// The desktop icon (and, only if asked, open-at-login). Opening the icon = a terminal with LLMule on its
// panel; closing that terminal = it stops sharing. Nothing runs in the background (DESIGN.md §7).
// Every file created outside ~/.llmule is listed in installed.json so `llmule --uninstall` can remove it.
// LLMULE_DESKTOP / LLMULE_AUTOSTART_DIR move the targets (tests).

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { P, tilde } from './paths.mjs';
import { HEAD_PNG_B64 } from './icon-data.mjs';
import { selfArgs } from './provider-run.mjs';

const run = (cmd, args, timeout = 8000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
});

// A compiled binary run from Downloads would leave the icon pointing at Downloads: keep a copy in ~/.llmule/bin
export function stableProgram() {
  const args = selfArgs('').filter(Boolean);
  if (args.length) return { exe: process.execPath, args }; // `node llmule.mjs` / `deno run`: dev, point at the script
  const name = process.platform === 'win32' ? 'llmule.exe' : 'llmule';
  const target = path.join(P.bin, name);
  if (path.resolve(process.execPath) !== path.resolve(target)) {
    fs.mkdirSync(P.bin, { recursive: true });
    const tmp = `${target}.new`;
    fs.copyFileSync(process.execPath, tmp);
    fs.chmodSync(tmp, 0o755);
    try { fs.renameSync(tmp, target); } catch { /* Windows: the running copy is locked; keep the old one */ fs.rmSync(tmp, { force: true }); }
  }
  return { exe: target, args: [] };
}

async function desktopDir() {
  if (process.env.LLMULE_DESKTOP) return process.env.LLMULE_DESKTOP;
  if (process.platform === 'win32') {
    return (await run('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"])) || path.join(os.homedir(), 'Desktop');
  }
  if (process.platform === 'linux') return (await run('xdg-user-dir', ['DESKTOP'])) || path.join(os.homedir(), 'Desktop');
  return path.join(os.homedir(), 'Desktop');
}

const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;
const iconPng = () => {
  const f = path.join(P.home, 'mule.png');
  fs.mkdirSync(P.home, { recursive: true });
  fs.writeFileSync(f, Buffer.from(HEAD_PNG_B64, 'base64'));
  return f;
};
// .ico with the PNG inside (Windows Vista+ reads PNG entries)
const iconIco = () => {
  const png = Buffer.from(HEAD_PNG_B64, 'base64');
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(64, 6); head.writeUInt8(64, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  const f = path.join(P.home, 'mule.ico');
  fs.writeFileSync(f, Buffer.concat([head, png]));
  return f;
};

const remember = (files) => {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(P.installed, 'utf8')).files || []; } catch { /* first time */ }
  for (const f of files) if (!list.includes(f)) list.push(f);
  fs.writeFileSync(P.installed, JSON.stringify({ files: list }, null, 2) + '\n');
};

// → { desktop: path|null, autostart: path|null } (paths with ~ for the screen)
// texts: { file, menu } — the comment inside the Mac .command and the Linux menu entry, in the app's language
export async function createShortcuts({ desktop = true, autostart = false, texts = {} } = {}) {
  const fileComment = (texts.file || 'LLMule').replace(/[\r\n]/g, ' ');
  const menuComment = (texts.menu || 'LLMule').replace(/[\r\n]/g, ' ');
  const prog = stableProgram();
  const made = [];
  const out = { desktop: null, autostart: null };
  const dir = await desktopDir();

  if (process.platform === 'darwin') {
    const cmd = path.join(dir, 'LLMule.command');
    if (desktop || autostart) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cmd, `#!/bin/sh\n# ${fileComment}\nexec ${[prog.exe, ...prog.args].map(q).join(' ')}\n`, { mode: 0o755 });
      fs.chmodSync(cmd, 0o755);
      made.push(cmd);
      out.desktop = tilde(cmd);
    }
    if (autostart) {
      // launchd can't open a window by itself: it asks Terminal to open the .command
      const dirLA = process.env.LLMULE_AUTOSTART_DIR || path.join(os.homedir(), 'Library', 'LaunchAgents');
      const plist = path.join(dirLA, 'xyz.llmule.plist');
      fs.mkdirSync(dirLA, { recursive: true });
      fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>xyz.llmule</string>
  <key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-a</string><string>Terminal</string><string>${cmd.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`);
      made.push(plist);
      out.autostart = tilde(plist);
    }
  } else if (process.platform === 'linux') {
    const icon = iconPng();
    const entry = `[Desktop Entry]\nType=Application\nName=LLMule\nComment=${menuComment}\nExec=${[prog.exe, ...prog.args].map(q).join(' ')}\nIcon=${icon}\nTerminal=true\nCategories=Network;\n`;
    if (desktop) {
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'llmule.desktop');
      fs.writeFileSync(f, entry, { mode: 0o755 });
      fs.chmodSync(f, 0o755);
      await run('gio', ['set', f, 'metadata::trusted', 'true']); // GNOME: otherwise "untrusted launcher"
      made.push(f);
      out.desktop = tilde(f);
    }
    if (autostart) {
      const dirA = process.env.LLMULE_AUTOSTART_DIR || path.join(os.homedir(), '.config', 'autostart');
      fs.mkdirSync(dirA, { recursive: true });
      const f = path.join(dirA, 'llmule.desktop');
      fs.writeFileSync(f, entry);
      made.push(f);
      out.autostart = tilde(f);
    }
  } else if (process.platform === 'win32') {
    const ico = iconIco();
    const wt = await run('where', ['wt.exe']);
    const target = wt ? wt.split(/\r?\n/)[0] : prog.exe;
    const args = wt ? [prog.exe, ...prog.args].map((a) => `"${a}"`).join(' ') : prog.args.map((a) => `"${a}"`).join(' ');
    const lnk = async (file) => {
      const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${file.replace(/'/g, "''")}');$s.TargetPath='${target.replace(/'/g, "''")}';$s.Arguments='${args.replace(/'/g, "''")}';$s.IconLocation='${ico.replace(/'/g, "''")}';$s.WorkingDirectory='${P.home.replace(/'/g, "''")}';$s.Save()`;
      const ok = await run('powershell', ['-NoProfile', '-Command', ps]);
      if (ok === null) throw Object.assign(new Error('shortcut not created'), { code: 'shortcut' });
      made.push(file);
      return file;
    };
    if (desktop) out.desktop = await lnk(path.join(dir, 'LLMule.lnk'));
    if (autostart) {
      const startup = process.env.LLMULE_AUTOSTART_DIR || (await run('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Startup')"]));
      if (startup) out.autostart = await lnk(path.join(startup, 'LLMule.lnk'));
    }
  }
  remember(made);
  return out;
}

// --uninstall: the icons and autostart entries (the ~/.llmule folder is the caller's choice)
export function removeShortcuts() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(P.installed, 'utf8')).files || []; } catch { return []; }
  const gone = [];
  for (const f of list) {
    try { fs.rmSync(f, { force: true }); gone.push(f); } catch { /* already gone */ }
  }
  fs.writeFileSync(P.installed, JSON.stringify({ files: [] }, null, 2) + '\n');
  return gone;
}
