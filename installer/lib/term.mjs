// Terminal I/O by hand: alternate screen, raw keys, resize, colors, and a cell buffer that only
// repaints what changed. No dependencies. Works with xterm-style terminals (macOS Terminal, iTerm,
// Linux terminals, Windows Terminal, and conhost on Windows 10+ — Node turns on VT output there).

// ---------- colors ----------

// How many colors the terminal can show: 24 (truecolor), 256 or 16.
// LLMULE_COLORS=16|256|24 forces it (and lets us screenshot the fallbacks).
export function colorDepth(env = process.env, platform = process.platform) {
  const forced = Number(env.LLMULE_COLORS);
  if ([16, 256, 24].includes(forced)) return forced;
  const ct = (env.COLORTERM || '').toLowerCase();
  if (ct === 'truecolor' || ct === '24bit') return 24;
  if (env.WT_SESSION) return 24; // Windows Terminal
  if (['iTerm.app', 'WezTerm', 'vscode', 'ghostty', 'Hyper', 'Tabby', 'rio'].includes(env.TERM_PROGRAM)) return 24;
  const term = env.TERM || '';
  if (/truecolor|24bit|direct|kitty|alacritty|foot/.test(term)) return 24;
  if (platform === 'win32') return 256; // conhost: 256 is safe on Windows 10+
  if (/256/.test(term) || env.TERM_PROGRAM === 'Apple_Terminal') return 256;
  return 16;
}

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dist = (a, b) => (a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11;

const CUBE = [0, 95, 135, 175, 215, 255];
export function to256(hex) {
  const rgb = hexRgb(hex);
  let best = 16;
  let bestD = Infinity;
  const idx = rgb.map((v) => CUBE.reduce((bi, c, i) => (Math.abs(c - v) < Math.abs(CUBE[bi] - v) ? i : bi), 0));
  const cube = idx.map((i) => CUBE[i]);
  const dc = dist(rgb, cube);
  if (dc < bestD) { bestD = dc; best = 16 + idx[0] * 36 + idx[1] * 6 + idx[2]; }
  for (let i = 0; i < 24; i++) {
    const g = 8 + i * 10;
    const d = dist(rgb, [g, g, g]);
    if (d < bestD) { bestD = d; best = 232 + i; }
  }
  return best;
}

// The 16 ANSI colors as most terminals paint them (VGA-ish)
const ANSI16 = ['#000000', '#aa0000', '#00aa00', '#aa5500', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
  '#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'];
// Theme colors pinned to the 16 that keep the DOS-setup look (nearest would turn some gray into blue)
const PIN16 = {
  '#3a6ea5': 4, '#0a246a': 4, '#d4d0c8': 7, '#e9e6df': 7, '#ffffff': 15, '#000000': 0, '#404040': 8,
  '#808080': 8, '#316ac5': 4, '#ffffe1': 15, '#1d3550': 0, '#2e7d32': 2, '#c62828': 1, '#b8860b': 3,
  '#a6caf0': 6, '#5f5f5f': 8, '#0000ee': 4,
};
export function to16(hex) {
  if (hex in PIN16) return PIN16[hex];
  const rgb = hexRgb(hex);
  let best = 0;
  ANSI16.forEach((c, i) => { if (dist(rgb, hexRgb(c)) < dist(rgb, hexRgb(ANSI16[best]))) best = i; });
  return best;
}

export function sgr(fg, bg, bold, depth) {
  const parts = ['0'];
  if (bold) parts.push('1');
  if (depth === 24) {
    parts.push('38;2;' + hexRgb(fg).join(';'), '48;2;' + hexRgb(bg).join(';'));
  } else if (depth === 256) {
    parts.push('38;5;' + to256(fg), '48;5;' + to256(bg));
  } else {
    const f = to16(fg);
    const b = to16(bg);
    parts.push(String(f < 8 ? 30 + f : 90 + f - 8), String(b < 8 ? 40 + b : 100 + b - 8));
  }
  return `\x1b[${parts.join(';')}m`;
}

// Mix two hex colors (t = 0 → a, 1 → b). Gradients, dimmed shadows.
export function mix(a, b, t) {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// ---------- keys ----------

const CSI_NAMES = {
  A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', Z: 'shift-tab',
  P: 'f1', Q: 'f2', R: 'f3', S: 'f4',
  '1~': 'home', '2~': 'insert', '3~': 'delete', '4~': 'end', '5~': 'pgup', '6~': 'pgdn', '7~': 'home', '8~': 'end',
  '11~': 'f1', '12~': 'f2', '13~': 'f3', '14~': 'f4', '15~': 'f5',
};
// libuv on Windows (and the Linux console) send F1–F5 as ESC [ [ A–E
const LINUX_F = { A: 'f1', B: 'f2', C: 'f3', D: 'f4', E: 'f5' };

// One chunk of stdin → key names ('up', 'enter', 'esc', 'f3', 'ctrl-c', …) or { ch } for text, or { cpr: [rows, cols] }
// for the terminal's answer to sizeQuery() (ESC [ rows ; cols R). Shift/ctrl+F3 is ESC [ 1 ; 2..16 R: same shape,
// so an answer of "row 1, column ≤ 16" stays F3 — no real terminal is that small.
export function parseKeys(chunk) {
  const out = [];
  let i = 0;
  const s = String(chunk);
  while (i < s.length) {
    const rest = s.slice(i);
    let m;
    if ((m = /^\x1b\[(\d+);(\d+)R/.exec(rest)) && !(m[1] === '1' && Number(m[2]) <= 16)) {
      out.push({ cpr: [Number(m[1]), Number(m[2])] });
    } else if ((m = /^\x1b\[\[([A-E])/.exec(rest))) {
      out.push(LINUX_F[m[1]]);
    } else if ((m = /^\x1b\[([0-9;]*)([A-Za-z~])/.exec(rest))) {
      // Drop modifiers: ESC[1;5A (ctrl+up) is still "up"; ESC[13;2~ still f3
      const nums = m[1].split(';');
      const name = m[2] === '~' ? CSI_NAMES[nums[0] + '~'] : CSI_NAMES[m[2]];
      out.push(name || 'unknown');
    } else if ((m = /^\x1bO([A-Za-z])/.exec(rest))) {
      out.push(CSI_NAMES[m[1]] || 'unknown');
    } else if (rest[0] === '\x1b') {
      // A lone ESC (or Alt+key: treat as ESC, the key that follows comes on its own)
      m = ['\x1b'];
      out.push('esc');
    } else if (rest.startsWith('\r\n')) {
      m = ['\r\n'];
      out.push('enter');
    } else {
      const c = String.fromCodePoint(rest.codePointAt(0));
      m = [c];
      if (c === '\r' || c === '\n') out.push('enter');
      else if (c === '\x7f' || c === '\b') out.push('backspace');
      else if (c === '\t') out.push('tab');
      else if (c === '\x03') out.push('ctrl-c');
      else if (c === '\x11') out.push('ctrl-q');
      else if (c === '\x0c') out.push('ctrl-l');
      else if (c === ' ') out.push('space');
      else if (c >= ' ') out.push({ ch: c });
    }
    i += m[0].length;
  }
  return out;
}

// ---------- the screen ----------

// Box drawing in plain ASCII when LLMULE_ASCII=1 (a console font without them — rare, but cheap)
const ASCII = { '─': '-', '│': '|', '┌': '+', '┐': '+', '└': '+', '┘': '+', '═': '=', '║': '|', '╔': '+', '╗': '+',
  '╚': '+', '╝': '+', '├': '+', '┤': '+', '▀': '"', '▄': '_', '█': '#', '░': '.', '▒': ':', '▓': '%', '■': '#',
  '►': '>', '◄': '<', '▲': '^', '▼': 'v', '●': '*', '√': 'v', '▌': '|', '▐': '|', '·': '.', '…': '...' };

export class Screen {
  constructor({ out = process.stdout, depth = colorDepth(), ascii = process.env.LLMULE_ASCII === '1' } = {}) {
    this.out = out;
    this.depth = depth;
    this.ascii = ascii;
    this.resize(out.columns || 80, out.rows || 25);
  }

  resize(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    const n = this.w * this.h;
    this.ch = new Array(n).fill(' ');
    this.fg = new Array(n).fill('#000000');
    this.bg = new Array(n).fill('#000000');
    this.bold = new Array(n).fill(false);
    this.prev = null; // next flush repaints everything
  }

  // Text at (x, y). Missing fg/bg keep what's under it (text over a box or the art).
  put(x, y, text, { fg, bg, bold = false } = {}) {
    if (y < 0 || y >= this.h) return;
    let cx = x;
    for (const c of String(text)) {
      if (cx >= this.w) break;
      if (cx >= 0) {
        const i = y * this.w + cx;
        this.ch[i] = c;
        if (fg) this.fg[i] = fg;
        if (bg) this.bg[i] = bg;
        this.bold[i] = bold;
      }
      cx++;
    }
    return cx;
  }

  fill(x, y, w, h, { fg = '#000000', bg, ch = ' ' } = {}) {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        const i = yy * this.w + xx;
        this.ch[i] = ch;
        this.fg[i] = fg;
        if (bg) this.bg[i] = bg;
        this.bold[i] = false;
      }
    }
  }

  // Darken what's already there (drop shadows): keeps the characters, dims both colors
  shade(x, y, w, h, toward = '#000000', t = 0.6) {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        const i = yy * this.w + xx;
        this.fg[i] = mix(this.fg[i], toward, t);
        this.bg[i] = mix(this.bg[i], toward, t);
      }
    }
  }

  get(x, y) {
    const i = y * this.w + x;
    return { ch: this.ch[i], fg: this.fg[i], bg: this.bg[i], bold: this.bold[i] };
  }

  // Write only the cells that changed since the last flush
  flush() {
    const prev = this.prev;
    let out = prev ? '' : '\x1b[0m\x1b[2J';
    let style = '';
    let cx = -1;
    let cy = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (prev && prev.ch[i] === this.ch[i] && prev.fg[i] === this.fg[i] && prev.bg[i] === this.bg[i] && prev.bold[i] === this.bold[i]) continue;
        if (cx !== x || cy !== y) out += `\x1b[${y + 1};${x + 1}H`;
        const s = sgr(this.fg[i], this.bg[i], this.bold[i], this.depth);
        if (s !== style) { out += s; style = s; }
        const c = this.ch[i];
        out += this.ascii ? (ASCII[c] ?? c) : c;
        cx = x + 1;
        cy = y;
      }
    }
    this.prev = { ch: this.ch.slice(), fg: this.fg.slice(), bg: this.bg.slice(), bold: this.bold.slice() };
    if (out) this.out.write(out);
  }

  // Plain-text dump (tests, and `--snapshot`)
  text() {
    const rows = [];
    for (let y = 0; y < this.h; y++) rows.push(this.ch.slice(y * this.w, (y + 1) * this.w).join('').replace(/\s+$/, ''));
    return rows.join('\n');
  }
}

// Ask the terminal itself how big it is: park the cursor at the far corner and ask where it ended up.
// The answer comes on stdin as { cpr }. It's the only way to see a resize when something between us and the
// terminal doesn't pass it on — macOS `script` keeps its inner pty at the starting size, so SIGWINCH never comes.
export const SIZE_QUERY = '\x1b[999;999H\x1b[6n';

// ---------- entering and leaving ----------

// Alt screen + hidden cursor + no autowrap (so the bottom-right cell never scrolls the screen)
export function enter(out = process.stdout, input = process.stdin) {
  out.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[H');
  if (input.isTTY) input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      if (input.isTTY) input.setRawMode(false);
    } catch { /* stdin already gone */ }
    out.write('\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l');
  };
  process.on('exit', restore);
  return restore;
}
