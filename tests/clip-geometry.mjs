// Reduces a hover-gallery clip-path (the Make path: M, L, Q, 25 x L down the right edge, Q, L, Q, 25 x L up the left edge, Q, Z)
// to the signed peak horizontal deviation of each curved edge from straight, in px. +x = towards the right of the page.
// Returns null for any path that is not in that shape (so an assertion on it fails instead of passing vacuously).
export function edgeBends(clip) {
  const m = /path\("([^"]*)"\)/.exec(clip || '');
  if (!m) return null;
  const pts = [];
  for (const seg of m[1].matchAll(/([MLQ])([^MLQZ]*)/g)) {
    const n = seg[2].trim().split(/[\s,]+/).map(Number);
    if (n.some(Number.isNaN)) return null;
    pts.push({ c: seg[1], x: n[n.length - 2], y: n[n.length - 1] });
  }
  const q = pts.map((p, i) => (p.c === 'Q' ? i : -1)).filter(i => i >= 0);
  if (q.length !== 4 || pts.length !== 4 + 1 + 1 + 25 + 1 + 25 + 1 - 1) return null;
  const peak = (run, ref) => run.reduce((best, p) => (Math.abs(p.x - ref) > Math.abs(best) ? p.x - ref : best), 0);
  const right = pts.slice(q[0], q[1]), left = pts.slice(q[2], q[3]);
  return { right: peak(right, right[0].x), left: peak(left, left[0].x) };
}
export const isStraight = (clip, eps = 0.01) => { const b = edgeBends(clip); return !!b && Math.abs(b.right) < eps && Math.abs(b.left) < eps; };
// per-boundary view of a row of clips: boundary i is the right edge of card i and the left edge of card i + 1
export function boundaryBends(clips) {
  const b = clips.map(edgeBends);
  if (b.some(x => !x)) return null;
  return b.slice(0, -1).map((c, i) => ({ right: c.right, left: b[i + 1].left }));
}
