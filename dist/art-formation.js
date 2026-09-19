export function validateArt(raw) {
  if (raw == null) return null;
  if (
    raw.version !== 1 ||
    !Number.isInteger(raw.columns) ||
    raw.columns < 2 ||
    raw.columns > 64 ||
    !Number.isInteger(raw.rows) ||
    raw.rows < 2 ||
    raw.rows > 64 ||
    !Array.isArray(raw.points) ||
    raw.points.length > 4096
  )
    throw Error('Art needs a 2–64 pixel grid with at most 4,096 lit pixels.');
  const seen = new Set();
  return {
    version: 1,
    columns: raw.columns,
    rows: raw.rows,
    points: raw.points.map((p) => {
      if (
        !Array.isArray(p) ||
        p.length !== 3 ||
        !Number.isInteger(p[0]) ||
        !Number.isInteger(p[1]) ||
        p[0] < 0 ||
        p[0] >= raw.columns ||
        p[1] < 0 ||
        p[1] >= raw.rows ||
        !/^#[\da-f]{6}$/i.test(p[2]) ||
        seen.has(p[0] + ',' + p[1])
      )
        throw Error('Art contains invalid or duplicate pixels.');
      seen.add(p[0] + ',' + p[1]);
      return [...p];
    }),
  };
}
export function rasterToArt(
  { data, width, height },
  mode = 'rgb',
  threshold = 48,
  ink = '#ffffff',
) {
  if (
    !['rgb', 'outline', 'silhouette'].includes(mode) ||
    width > 64 ||
    height > 64 ||
    width < 2 ||
    height < 2 ||
    data.length !== width * height * 4
  )
    throw Error('Invalid image grid.');
  threshold = Math.max(0, Math.min(255, Number.isFinite(threshold) ? threshold : 48));
  const points = [],
    luma = (x, y) => {
      const i =
        (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
      return data[i + 3] < 32
        ? 255
        : 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 32) continue;
      const value = luma(x, y),
        edge = Math.max(
          Math.abs(value - luma(x - 1, y)),
          Math.abs(value - luma(x + 1, y)),
          Math.abs(value - luma(x, y - 1)),
          Math.abs(value - luma(x, y + 1)),
        );
      if (
        (mode === 'outline' && edge < threshold) ||
        (mode === 'silhouette' && value > threshold) ||
        (mode === 'rgb' && value < threshold)
      )
        continue;
      points.push([
        x,
        y,
        mode === 'rgb'
          ? '#' +
            [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')
          : ink,
      ]);
    }
  return validateArt({ version: 1, columns: width, rows: height, points });
}
export function artSlot(art, index, count) {
  if (!art?.points.length) return { position: [0, 0, 0], color: null };
  const total = art.points.length,
    p =
      art.points[
        Math.min(
          total - 1,
          Math.floor(((index % Math.min(count, total)) * total) / Math.min(count, total)),
        )
      ],
    layer = Math.floor(index / total),
    pitch = 4;
  return {
    position: [
      (p[0] - (art.columns - 1) / 2) * pitch,
      ((art.rows - 1) / 2 - p[1]) * pitch,
      layer * 4,
    ],
    color: p[2],
  };
}
