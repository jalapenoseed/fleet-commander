// Uniform spatial hash over the square map. Rebuilt every tick in slot order, so iteration
// order (and therefore every sim result that depends on it) is identical on all peers.

export class SpatialGrid {
  constructor(half, cell, capacity) {
    this.half = half;
    this.cell = cell;
    this.n = Math.ceil((2 * half) / cell);
    this.head = new Int32Array(this.n * this.n);
    this.next = new Int32Array(capacity);
  }
  cellIndex(x, z) {
    const n = this.n;
    let cx = Math.floor((x + this.half) / this.cell),
      cz = Math.floor((z + this.half) / this.cell);
    cx = cx < 0 ? 0 : cx >= n ? n - 1 : cx;
    cz = cz < 0 ? 0 : cz >= n ? n - 1 : cz;
    return cz * n + cx;
  }
  build(alive, px, pz, count) {
    this.head.fill(-1);
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const c = this.cellIndex(px[i], pz[i]);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }
  // Writes indices within radius r of (x, z) into out; returns how many.
  query(x, z, r, px, pz, out) {
    const { n, cell, half, head, next } = this;
    const x0 = Math.max(0, Math.floor((x - r + half) / cell)),
      x1 = Math.min(n - 1, Math.floor((x + r + half) / cell)),
      z0 = Math.max(0, Math.floor((z - r + half) / cell)),
      z1 = Math.min(n - 1, Math.floor((z + r + half) / cell));
    const r2 = r * r;
    let k = 0;
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++)
        for (let i = head[cz * n + cx]; i !== -1; i = next[i]) {
          const dx = px[i] - x,
            dz = pz[i] - z;
          if (dx * dx + dz * dz <= r2 && k < out.length) out[k++] = i;
        }
    return k;
  }
}
