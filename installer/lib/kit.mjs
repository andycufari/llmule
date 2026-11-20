// Small helpers shared by every screen (setup, sharing and pool).
import { C, wrap, buttons } from './ui.mjs';

export const SPIN = ['|', '/', '-', '\\'];
export const spin = (app) => SPIN[app.tick % 4];
export const NICK = /^[a-z0-9_-]{3,20}$/;
export const HUES = [0, -95, 145, 65, 175];

// Write wrapped text; returns the next free row
export function para(scr, x, y, w, text, style = { fg: C.black }, maxRows = 99) {
  const lines = wrap(text, w).slice(0, maxRows);
  lines.forEach((l, i) => scr.put(x, y + i, l, style));
  return y + lines.length;
}

export const ok = (scr, x, y, text) => {
  scr.put(x, y, '√', { fg: C.green, bold: true });
  return scr.put(x + 2, y, text, { fg: C.black });
};

export const navKeys = (app, extra = []) => [['ENTER', app.S.keys.enter], ['ESC', app.S.keys.esc], ...extra, ['F3', app.S.keys.f3]];

// Buttons row at the bottom of the window
export const bottomButtons = (app, r, labels, focus) => buttons(app.scr, r.x, r.y + r.h - 2, labels, focus);


// Mule levels by tokens served: { name, frac (to the next), next }
export function levelOf(levels, tokens) {
  let i = 0;
  while (i + 1 < levels.length && tokens >= levels[i + 1][0]) i++;
  const [from, name] = levels[i];
  const next = levels[i + 1];
  // Levels grow ×10: show progress on a log scale so the bar moves at every level
  const frac = !next ? 1 : from > 0 ? Math.log(tokens / from) / Math.log(next[0] / from) : tokens / next[0];
  return { name, frac: Math.max(0, Math.min(1, frac)), next: next ? next[1] : null };
}
