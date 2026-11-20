// Widgets drawn on a Screen: the desktop, the top status bar, the bottom key bar, windows with a
// title bar and a drop shadow, group boxes, buttons, list boxes, progress bars, inputs, the mule.
// Palette = llmule.xyz (MuleChrome.jsx): Win2000 desktop blue, 3D gray, navy title bar.

import { mix } from './term.mjs';

export const C = {
  desktop: '#3a6ea5',
  desktopDark: '#1d3550',
  gray: '#d4d0c8',
  grayLight: '#e9e6df',
  white: '#ffffff',
  black: '#000000',
  dark: '#404040',
  mid: '#808080',
  navy: '#0a246a',
  navyMid: '#3a6ea5',
  sky: '#a6caf0',
  select: '#316ac5',
  tip: '#ffffe1',
  green: '#2e7d32',
  greenBright: '#3fbf4f',
  red: '#c62828',
  redBright: '#ff5a4f',
  amber: '#b8860b',
  amberBright: '#ffc83d',
  link: '#0000ee',
  muted: '#5f5f5f',
};

const KEYS = '0123456789abcdefghijklmnopqrstuvwxyz';

// ---------- text helpers ----------

export function wrap(text, width) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= width) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

export const clip = (s, n) => {
  const a = [...String(s)];
  return a.length <= n ? a.join('') : a.slice(0, Math.max(0, n - 1)).join('') + '…';
};
export const len = (s) => [...String(s)].length;
export const pad = (s, n) => clip(s, n) + ' '.repeat(Math.max(0, n - len(clip(s, n))));
// Decimal point in the current language: 7.4 → "7,4" in Spanish
export const dec = (n) => (numLang === 'es' ? String(n).replace('.', ',') : String(n));

// Numbers follow the language: "1,2 M" / "12.345" in Spanish, "1.2 M" / "12,345" in English.
// One setting for the whole app (app.setLang calls this), so the screens don't pass it around.
let numLang = 'es';
export const setNumLang = (lang) => { numLang = lang === 'en' ? 'en' : 'es'; };

export function fmtNum(n, lang = numLang) {
  if (n == null) return '—';
  const dec = lang === 'es' ? ',' : '.';
  const grp = lang === 'es' ? '.' : ',';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', dec) + ' M';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, grp);
}

export function fmtBytes(b, lang = numLang) {
  const dec = lang === 'es' ? ',' : '.';
  if (b >= 1e9) return (b / 1e9).toFixed(1).replace('.', dec) + ' GB';
  if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
  return Math.round(b / 1e3) + ' KB';
}

// ---------- the frame every screen shares ----------

export function desktop(scr) {
  scr.fill(0, 0, scr.w, scr.h, { bg: C.desktop });
}

// Row 0. segments: [{ label, value, state: 'ok'|'wait'|'down'|'off', short?, prio? }]
const SPIN = ['░', '▒', '▓', '█', '▓', '▒'];
// What fits in `room` cells, never cutting a word: "Label value" for all → the values → the short values →
// drop the least important segments (lowest prio first) → only then clip, and only the last one standing.
export function fitStatus(segments, room) {
  const cost = (list, text) => list.reduce((a, s) => a + len(text(s)) + 5, -1); // "│ ● text " each, the last space can go
  const tries = [(s) => `${s.label} ${s.value}`, (s) => s.value, (s) => s.short || s.value];
  for (const t of tries) if (cost(segments, t) <= room) return segments.map((s) => ({ ...s, text: t(s) }));
  const short = tries[2];
  const keep = [...segments];
  while (keep.length > 1 && cost(keep, short) > room) {
    const drop = keep.reduce((lo, s) => ((s.prio ?? 5) < (lo.prio ?? 5) ? s : lo), keep[0]);
    keep.splice(keep.indexOf(drop), 1);
  }
  // With room to spare after dropping, the survivors get their longer text back
  for (const t of tries) if (cost(keep, t) <= room) return keep.map((s) => ({ ...s, text: t(s) }));
  return keep.map((s) => ({ ...s, text: clip(short(s), Math.max(1, room - 4)) }));
}

export function statusBar(scr, segments, tick) {
  const flat = scr.depth === 16; // no gradients on 16 colors: nearest-color banding looks broken
  for (let x = 0; x < scr.w; x++) scr.fill(x, 0, 1, 1, { bg: flat ? C.navy : mix(C.navy, C.navyMid, Math.min(1, x / (scr.w * 0.85))) });
  let x = scr.put(0, 0, ' LLMule ', { fg: C.white, bold: true });
  const dot = { ok: C.greenBright, wait: C.amberBright, down: C.redBright, off: C.mid };
  for (const s of fitStatus(segments, scr.w - x - 1)) {
    x = scr.put(x, 0, '│', { fg: C.sky });
    const glyph = s.state === 'wait' ? SPIN[tick % SPIN.length] : '●';
    x = scr.put(x + 1, 0, glyph, { fg: dot[s.state] || C.mid, bold: true });
    x = scr.put(x + 1, 0, s.text, { fg: C.white, bold: s.state === 'ok' }) + 1;
  }
}

// Bottom row, the DOS-setup key legend: [['ENTER', 'Seguir'], ['F3', 'Salir']]
export function keyBar(scr, keys, right = '') {
  const y = scr.h - 1;
  scr.fill(0, y, scr.w, 1, { bg: C.gray });
  let x = 1;
  for (const [k, label] of keys) {
    x = scr.put(x, y, k, { fg: C.black, bold: true });
    x = scr.put(x, y, '=' + label + '  ', { fg: C.black });
  }
  if (right) scr.put(scr.w - len(right) - 1, y, right, { fg: C.dark });
}

// Big title under the status bar, DOS-setup style: "LLMule Setup" + a double rule
export function header(scr, title, step) {
  scr.put(2, 2, title, { fg: C.white, bold: true });
  if (step) scr.put(scr.w - len(step) - 2, 2, step, { fg: C.sky });
  scr.fill(1, 3, scr.w - 2, 1, { fg: C.sky, ch: '═' });
}

// A gray window with a navy title bar and a black shadow. Returns the inner rect.
export function window(scr, x, y, w, h, title = '') {
  scr.shade(x + 2, y + 1, w, h, C.black, 0.65);
  scr.fill(x, y, w, h, { bg: C.gray });
  for (let i = 0; i < w; i++) scr.fill(x + i, y, 1, 1, { bg: scr.depth === 16 ? C.navy : mix(C.navy, C.sky, i / Math.max(1, w - 1)) });
  scr.put(x + 1, y, clip(title, w - 7), { fg: C.white, bold: true });
  scr.put(x + w - 4, y, '[x]', { fg: C.black, bg: C.gray });
  // 3D edge: light on the left, dark on the right and bottom
  for (let r = 1; r < h; r++) {
    scr.put(x, y + r, '│', { fg: C.white });
    scr.put(x + w - 1, y + r, '│', { fg: C.dark });
  }
  scr.put(x, y + h - 1, '└' + '─'.repeat(w - 2) + '┘', { fg: C.dark });
  return { x: x + 2, y: y + 2, w: w - 4, h: h - 3 };
}

// Centered window that grows with the terminal but stays readable (a big window gets a bigger box, not
// 200-column lines). At 80×24 it takes the whole screen.
export function mainWindow(scr, title, { maxW = 108, maxH = 34 } = {}) {
  const w = Math.min(maxW, scr.w - 4);
  const h = Math.min(maxH, scr.h - 7);
  const x = Math.floor((scr.w - w) / 2) - 1;
  const y = 5 + Math.max(0, Math.floor((scr.h - 7 - h) / 2) - 1);
  return window(scr, Math.max(0, x), y, w, h, title);
}

// Etched frame with a legend (the site's .mule-box)
export function groupBox(scr, x, y, w, h, legend = '') {
  scr.put(x, y, '┌' + '─'.repeat(w - 2) + '┐', { fg: C.mid });
  for (let r = 1; r < h - 1; r++) {
    scr.put(x, y + r, '│', { fg: C.mid });
    scr.put(x + w - 1, y + r, '│', { fg: C.white });
  }
  scr.put(x, y + h - 1, '└' + '─'.repeat(w - 2) + '┘', { fg: C.white });
  if (legend) scr.put(x + 2, y, ' ' + legend + ' ', { fg: C.navy, bold: true });
  return { x: x + 2, y: y + 1, w: w - 4, h: h - 2 };
}

// Sunken white area (list boxes, the log)
export function sunken(scr, x, y, w, h) {
  scr.fill(x, y, w, h, { bg: C.white });
  return { x, y, w, h };
}

// Turbo-Vision-ish button with a shadow. Returns the x after it.
export function button(scr, x, y, label, focused) {
  const text = ` ${label} `;
  scr.put(x, y, text, focused ? { fg: C.white, bg: C.navy, bold: true } : { fg: C.black, bg: C.grayLight });
  scr.put(x + len(text), y, '▄', { fg: C.dark });
  scr.put(x + 1, y + 1, '▀'.repeat(len(text)), { fg: C.dark });
  return x + len(text) + 3;
}

export function buttons(scr, x, y, labels, focus) {
  let cx = x;
  labels.forEach((l, i) => { cx = button(scr, cx, y, l, i === focus); });
  return cx;
}

// rows: [{ text, right?, dim?, mark? }] ; sel = selected index
export function listBox(scr, x, y, w, h, rows, sel, { header: head } = {}) {
  sunken(scr, x, y, w, h);
  let top = y;
  if (head) {
    scr.fill(x, y, w, 1, { bg: C.gray });
    scr.put(x + 1, y, clip(head[0], w - 2), { fg: C.black });
    if (head[1]) scr.put(x + w - len(head[1]) - 1, y, head[1], { fg: C.black });
    top++;
  }
  const visible = h - (top - y);
  const start = Math.max(0, Math.min(sel - visible + 1, rows.length - visible));
  rows.slice(start, start + visible).forEach((r, i) => {
    const on = start + i === sel;
    const fg = on ? C.white : r.dim ? C.mid : C.black;
    const bg = on ? C.select : C.white;
    scr.fill(x, top + i, w, 1, { bg });
    const mark = r.mark ? r.mark + ' ' : '';
    scr.put(x + 1, top + i, clip(mark + r.text, w - 2 - (r.right ? len(r.right) + 1 : 0)), { fg, bg, bold: on || r.bold });
    if (r.markColor && !on) scr.put(x + 1, top + i, r.mark, { fg: r.markColor, bold: true });
    if (r.right) scr.put(x + w - len(r.right) - 1, top + i, r.right, { fg: on ? C.white : r.dim ? C.mid : C.dark, bg });
  });
}

// Win2000 progress bar: blue blocks on white, label to the right
export function progress(scr, x, y, w, frac, label = '') {
  const f = Math.max(0, Math.min(1, frac || 0));
  sunken(scr, x, y, w, 1);
  const cells = f * w;
  const full = Math.floor(cells);
  for (let i = 0; i < full; i++) scr.put(x + i, y, i % 3 === 2 && i < full - 1 ? '▌' : '█', { fg: C.select, bg: C.white });
  const part = ' ▏▎▍▌▋▊▉'[Math.floor((cells - full) * 8)];
  if (full < w && part !== ' ') scr.put(x + full, y, part, { fg: C.select, bg: C.white });
  if (label) scr.put(x, y + 1, clip(label, w), { fg: C.black });
}

export function input(scr, x, y, w, value, focused, tick) {
  sunken(scr, x, y, w, 1);
  const shown = len(value) >= w - 1 ? [...value].slice(-(w - 2)).join('') : value;
  scr.put(x + 1, y, shown, { fg: C.black, bg: C.white });
  if (focused && tick % 8 < 5) scr.put(x + 1 + len(shown), y, '█', { fg: C.navy, bg: C.white });
  if (focused) scr.put(x - 2, y, '►', { fg: C.navy, bold: true });
}

export function checkbox(scr, x, y, checked, label, focused) {
  scr.put(x, y, '[', { fg: C.black });
  scr.put(x + 1, y, checked ? '√' : ' ', { fg: C.navy, bg: C.white, bold: true });
  scr.put(x + 2, y, '] ', { fg: C.black });
  scr.put(x + 4, y, label, focused ? { fg: C.white, bg: C.navy, bold: true } : { fg: C.black });
}

// Half-block pixel art (lib/mule-art.mjs): each cell = two pixels, ▀ with fg = top, bg = bottom.
// Transparent pixels show what's behind. Needs 256 colors or more — the caller skips it on 16.
export function art(scr, x, y, a, recolor) {
  const color = (k) => {
    if (k === '.') return null;
    const hex = a.palette[KEYS.indexOf(k)];
    return recolor ? recolor(hex) : hex;
  };
  for (let r = 0; r < a.h / 2; r++) {
    const top = a.px[r * 2];
    const bot = a.px[r * 2 + 1];
    for (let c = 0; c < a.w; c++) {
      const t = color(top[c]);
      const b = color(bot[c]);
      if (!t && !b) continue;
      const cell = scr.get(x + c, y + r);
      if (t && b) scr.put(x + c, y + r, '▀', { fg: t, bg: b });
      else if (t) scr.put(x + c, y + r, '▀', { fg: t, bg: cell.bg });
      else scr.put(x + c, y + r, '▄', { fg: b, bg: cell.bg });
    }
  }
}

// Avatar colors: rotate the mule's blue toward another hue
export function hueShift(hex, deg) {
  if (!deg) return hex;
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// ▁▂▃▄▅▆▇█ from numbers
export function sparkline(values, width) {
  const v = values.slice(-width);
  const max = Math.max(1, ...v);
  const bars = ' ▁▂▃▄▅▆▇█';
  return v.map((n) => bars[Math.min(8, Math.round((n / max) * 8))]).join('').padStart(width, ' ');
}

// Modal dialog on top of everything (exit confirmation, errors that wait)
export function dialog(scr, title, lines, labels, focus) {
  const w = Math.min(scr.w - 6, Math.max(36, ...lines.map((l) => len(l) + 6), labels.reduce((a, l) => a + len(l) + 5, 4)));
  const h = lines.length + 6;
  const x = Math.floor((scr.w - w) / 2);
  const y = Math.floor((scr.h - h) / 2);
  const inner = window(scr, x, y, w, h, title);
  lines.forEach((l, i) => scr.put(inner.x, inner.y + i - 1, clip(l, inner.w), { fg: C.black }));
  const bw = labels.reduce((a, l) => a + len(l) + 5, 0) - 3;
  buttons(scr, x + Math.floor((w - bw) / 2), y + h - 3, labels, focus);
}
