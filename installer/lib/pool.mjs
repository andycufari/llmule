// Pool math shared by the coordinator (phase 2, server side) and the installer: who carries which
// layers, and how pool tokens are credited. Pure functions, no I/O.

// Contiguous layer ranges, proportional to the memory each node offers. Pipeline order = node order
// (the head first: it holds the embeddings and the output layer and talks to llmule.xyz).
// nodes: [{ id, gb }] · returns [{ id, from, to, layers, gb }] (layers 1-based, inclusive) or null if it doesn't fit.
export function planLayers(pool, nodes, reserveGB = 2) {
  const per = pool.sizeGB / pool.layers;
  const cap = nodes.map((n) => Math.max(0, Math.floor((n.gb - reserveGB) / per)));
  if (cap.reduce((a, b) => a + b, 0) < pool.layers) return null;
  // Proportional to capacity (largest remainder): everyone runs at about the same fill level.
  // share_i = cap_i / Σcap × L ≤ cap_i, so rounding up a fractional share never passes a node's cap.
  const total = cap.reduce((a, b) => a + b, 0);
  const share = cap.map((c) => (c / total) * pool.layers);
  const take = share.map(Math.floor);
  let left = pool.layers - take.reduce((a, b) => a + b, 0);
  const order = share.map((s, i) => [s - Math.floor(s), i]).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) {
    if (!left) break;
    if (take[i] < cap[i]) { take[i]++; left--; }
  }
  let at = 1;
  return nodes.map((n, i) => {
    const r = { id: n.id, from: at, to: at + take[i] - 1, layers: take[i], gb: Math.round(take[i] * per * 10) / 10 };
    at += take[i];
    return r;
  });
}

// Pool tokens: every generated token went through every node, so each node is credited by the share
// of layers it ran (compute ≈ layers). Self-use (the coordinator's own tests) doesn't count.
export function creditTokens(tokens, plan) {
  const total = plan.reduce((a, p) => a + p.layers, 0);
  return Object.fromEntries(plan.map((p) => [p.id, Math.round((tokens * p.layers) / total)]));
}
