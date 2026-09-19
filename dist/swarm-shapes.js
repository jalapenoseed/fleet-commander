// Stroke font on a 3 × 3 grid; disconnected strokes stay disconnected when sampled.
const LETTERS = {
  A: ['60128', '345'],
  B: ['630125478', '345'],
  C: ['2103678'],
  D: ['630125876'],
  E: ['2103678', '345'],
  F: ['63012', '345'],
  G: ['210367854'],
  H: ['036', '258', '345'],
  I: ['012', '147', '678'],
  J: ['258763'],
  K: ['036', '243', '48'],
  L: ['03678'],
  M: ['6304258'],
  N: ['630852'],
  O: ['012587630'],
  P: ['63012543'],
  Q: ['012587630', '48'],
  R: ['63012543', '48'],
  S: ['210345876'],
  T: ['012', '147'],
  U: ['0367852'],
  V: ['03752'],
  W: ['0364752'],
  X: ['048', '246'],
  Y: ['047', '24'],
  Z: ['0124678'],
  0: ['012587630'],
  1: ['147', '678'],
  2: ['012543678'],
  3: ['0125876', '345'],
  4: ['0345', '258'],
  5: ['210345876'],
  6: ['103678543'],
  7: ['01247'],
  8: ['012587630', '345'],
  9: ['543012587'],
  '-': ['345'],
};
const wordCache = new Map(),
  pathCache = new WeakMap();
const grid = (key) => [(Number(key) % 3) / 2, Math.floor(Number(key) / 3) / 2];
export function wordStrokes(text) {
  if (wordCache.has(text)) return wordCache.get(text);
  const chars = String(text)
      .toUpperCase()
      .replace(/[^A-Z0-9 -]/g, '')
      .slice(0, 16),
    width = Math.max(1, chars.length * 1.4 - 0.4),
    result = [];
  for (let i = 0; i < chars.length; i++)
    for (const path of LETTERS[chars[i]] || [])
      result.push(
        [...path].map((key) => {
          const [x, y] = grid(key);
          return [((x + i * 1.4 - width / 2) / width) * 2, ((y - 0.5) / width) * 2];
        }),
      );
  if (wordCache.size > 16) wordCache.clear();
  wordCache.set(text, result);
  return result;
}
export function pathMetrics(strokes) {
  if (pathCache.has(strokes)) return pathCache.get(strokes);
  let length = 0;
  const segments = [];
  for (const stroke of strokes)
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1],
        b = stroke[i],
        d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > 0.00001) {
        segments.push({ a, b, start: length, length: d });
        length += d;
      }
    }
  const result = { segments, length };
  pathCache.set(strokes, result);
  return result;
}
export function samplePath(strokes, fraction) {
  const { segments, length } = pathMetrics(strokes);
  if (!length) return [0, 0];
  const d = Math.max(0, Math.min(1, fraction)) * length,
    seg = segments.find((s) => d <= s.start + s.length) || segments.at(-1),
    t = Math.max(0, Math.min(1, (d - seg.start) / seg.length));
  return seg.a.map((v, i) => v + (seg.b[i] - v) * t);
}
export function validateStrokes(strokes) {
  if (
    !Array.isArray(strokes) ||
    strokes.length > 24 ||
    strokes.reduce((n, s) => n + (Array.isArray(s) ? s.length : 1000), 0) > 512
  )
    throw Error('Drawing is limited to 24 strokes and 512 points.');
  for (const stroke of strokes)
    if (
      !Array.isArray(stroke) ||
      stroke.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1),
      )
    )
      throw Error('Invalid drawing points.');
  return strokes.map((s) => s.map((p) => [...p]));
}
export function basicShape(shape, i, n, spacing) {
  const mid = (n - 1) / 2,
    a = (i / Math.max(1, n)) * Math.PI * 2;
  if (shape === 'line') return [(i - mid) * spacing, 0, 0];
  if (shape === 'wedge') {
    const row = Math.ceil(i / 2);
    return [i === 0 ? 0 : (i % 2 ? -1 : 1) * row * spacing * 0.65, 0, row * spacing * 0.7];
  }
  if (shape === 'column') return [0, 0, (i - mid) * spacing];
  if (shape === 'staggered')
    return [
      (i % 2 ? 1 : -1) * spacing * 2,
      (i % 3) * 2,
      (Math.floor(i / 2) - Math.floor(n / 2) / 2) * spacing,
    ];
  if (shape === 'double-orbit') {
    const ring = i % 2,
      slots = ring ? Math.floor(n / 2) : Math.ceil(n / 2),
      angle = (Math.floor(i / 2) / Math.max(1, slots)) * Math.PI * 2,
      r = spacing * (ring ? 1.55 : 1);
    return [Math.cos(angle) * r, ring ? 5 : -5, Math.sin(angle) * r];
  }
  if (shape === 'scatter') {
    const angle = i * 2.399963,
      r = spacing * Math.sqrt(i + 1) * 0.6;
    return [Math.cos(angle) * r, Math.sin(i * 1.7) * 5, Math.sin(angle) * r];
  }
  if (['high-low', 'overwatch'].includes(shape)) {
    const p = basicShape('grid', i, n, spacing);
    p[1] = shape === 'high-low' ? (i % 2 ? 5 : -5) : 6 + (i % 3) * 3;
    return p;
  }
  if (shape === 'grid') {
    const cols = Math.ceil(Math.sqrt(n)),
      rows = Math.ceil(n / cols);
    return [
      ((i % cols) - (cols - 1) / 2) * spacing,
      0,
      (Math.floor(i / cols) - (rows - 1) / 2) * spacing,
    ];
  }
  return [Math.cos(a) * spacing, 0, Math.sin(a) * spacing];
}

// Large shows use banks or stacked rings so every aircraft has its own slot.
// Fit the practice field before the user's scale is applied downstream.
export function largeFleetShape(shape, i, n, spacing, scale = 1) {
  const gap = Math.max(4, Math.min(spacing, 320 / (Math.ceil(Math.sqrt(n)) - 1))),
    fit = 1 / Math.max(1, scale);
  if (['ring', 'double-orbit'].includes(shape)) {
    const slots = 200,
      row = Math.floor(i / slots),
      count = Math.min(slots, n - row * slots),
      a = ((i % slots) / count) * Math.PI * 2,
      r = shape === 'double-orbit' ? (row % 2 ? 146 : 110) : 140;
    return [
      Math.cos(a) * r * fit,
      ((n > 2000 ? row : row - (Math.ceil(n / slots) - 1) / 2) * 4) / scale,
      Math.sin(a) * r * fit,
    ];
  }
  if (['line', 'column', 'staggered', 'wedge'].includes(shape)) {
    const width = Math.min(64, n),
      rows = Math.ceil(n / width),
      row = Math.floor(i / width),
      col = i % width;
    const x = (col - (width - 1) / 2) * 5,
      z = (row - (rows - 1) / 2) * Math.min(8, spacing);
    const p =
      shape === 'column'
        ? [z, 0, x]
        : [
            x,
            shape === 'staggered' ? (col % 2) * 3 : 0,
            z + (shape === 'wedge' ? Math.abs(x) * 0.15 : 0),
          ];
    return p.map((v) => v * fit);
  }
  const p = basicShape(shape, i, n, gap);
  return p.map((v) => v * fit);
}
