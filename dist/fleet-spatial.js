// Hash close neighbors in 3D instead of scanning the entire fleet per aircraft.
// The closest 24 retain collision priority in dense show formations.
export function fleetNeighborQuery(peers, { cellSize = 48, radius = 48, limit = 24 } = {}) {
  const buckets = new Map(),
    key = (x, y, z) => x + ',' + y + ',' + z;
  for (const p of peers) {
    const k = key(...p.pos.map((v) => Math.floor(v / cellSize)));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
  }
  return (pos, id) => {
    const center = pos.map((v) => Math.floor(v / cellSize)),
      reach = Math.ceil(radius / cellSize),
      nearest = [];
    let worst = radius * radius,
      worstIndex = -1;
    const offsets = [0];
    for (let r = 1; r <= reach; r++) offsets.push(-r, r);
    for (const dx of offsets)
      for (const dy of offsets)
        for (const dz of offsets) {
          const x = center[0] + dx,
            y = center[1] + dy,
            z = center[2] + dz;
          const mx = Math.max(x * cellSize - pos[0], 0, pos[0] - (x + 1) * cellSize),
            my = Math.max(y * cellSize - pos[1], 0, pos[1] - (y + 1) * cellSize),
            mz = Math.max(z * cellSize - pos[2], 0, pos[2] - (z + 1) * cellSize);
          if (mx * mx + my * my + mz * mz >= worst) continue;
          for (const p of buckets.get(key(x, y, z)) || []) {
            if (p.id === id) continue;
            const d =
              (p.pos[0] - pos[0]) ** 2 + (p.pos[1] - pos[1]) ** 2 + (p.pos[2] - pos[2]) ** 2;
            if (d >= worst) continue;
            if (nearest.length < limit) nearest.push({ p, d });
            else nearest[worstIndex] = { p, d };
            if (nearest.length === limit) {
              worst = -1;
              for (let i = 0; i < nearest.length; i++)
                if (nearest[i].d > worst) {
                  worst = nearest[i].d;
                  worstIndex = i;
                }
            }
          }
        }
    return nearest.map((n) => n.p);
  };
}
