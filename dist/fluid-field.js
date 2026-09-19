// Small educational 2D incompressible-flow field used by the optional Weather
// Lab. It is deliberately bounded and low resolution: useful for visualising
// advection, diffusion, pressure projection and drone wind response, but not a
// replacement for engineering CFD.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const FLUID_EQUATIONS = Object.freeze({
  momentum: '∂u/∂t + (u·∇)u = −(1/ρ)∇p + ν∇²u + f',
  continuity: '∇·u = 0',
  fidelity: 'Experimental / educational · 2D incompressible grid · not validated CFD',
});
export const FLUID_DEFAULTS = Object.freeze({
  enabled: false,
  viscosity: 0.018,
  resolution: 18,
  domain: 420,
});
export function fluidSettings(raw = {}) {
  return {
    enabled: !!raw.enabled,
    viscosity: clamp(
      Number.isFinite(Number(raw.viscosity)) ? Number(raw.viscosity) : FLUID_DEFAULTS.viscosity,
      0.001,
      0.12,
    ),
    resolution: clamp(Math.round(Number(raw.resolution) || FLUID_DEFAULTS.resolution), 12, 28),
    domain: clamp(Number(raw.domain) || FLUID_DEFAULTS.domain, 120, 1200),
  };
}
export class NavierStokesField {
  constructor(settings = {}) {
    this.configure(settings);
  }
  configure(settings = {}) {
    const next = fluidSettings({ ...this.settings, ...settings }),
      changed = !this.settings || next.resolution !== this.settings.resolution;
    this.settings = next;
    if (changed) {
      this.n = next.resolution;
      this.stride = this.n + 2;
      const count = this.stride * this.stride;
      this.u = new Float32Array(count);
      this.v = new Float32Array(count);
      this.u0 = new Float32Array(count);
      this.v0 = new Float32Array(count);
      this.p = new Float32Array(count);
      this.div = new Float32Array(count);
    }
    return this.settings;
  }
  index(x, y) {
    return clamp(x, 0, this.n + 1) + clamp(y, 0, this.n + 1) * this.stride;
  }
  boundary(field, axis) {
    const n = this.n;
    for (let i = 1; i <= n; i++) {
      field[this.index(0, i)] = axis === 1 ? -field[this.index(1, i)] : field[this.index(1, i)];
      field[this.index(n + 1, i)] = axis === 1 ? -field[this.index(n, i)] : field[this.index(n, i)];
      field[this.index(i, 0)] = axis === 2 ? -field[this.index(i, 1)] : field[this.index(i, 1)];
      field[this.index(i, n + 1)] = axis === 2 ? -field[this.index(i, n)] : field[this.index(i, n)];
    }
    field[this.index(0, 0)] = (field[this.index(1, 0)] + field[this.index(0, 1)]) * 0.5;
    field[this.index(0, n + 1)] = (field[this.index(1, n + 1)] + field[this.index(0, n)]) * 0.5;
    field[this.index(n + 1, 0)] = (field[this.index(n, 0)] + field[this.index(n + 1, 1)]) * 0.5;
    field[this.index(n + 1, n + 1)] =
      (field[this.index(n, n + 1)] + field[this.index(n + 1, n)]) * 0.5;
  }
  solve(axis, x, x0, a, c) {
    for (let k = 0; k < 7; k++) {
      for (let y = 1; y <= this.n; y++)
        for (let i = 1; i <= this.n; i++)
          x[this.index(i, y)] =
            (x0[this.index(i, y)] +
              a *
                (x[this.index(i - 1, y)] +
                  x[this.index(i + 1, y)] +
                  x[this.index(i, y - 1)] +
                  x[this.index(i, y + 1)])) /
            c;
      this.boundary(x, axis);
    }
  }
  diffuse(axis, x, x0, diff, dt) {
    const a = dt * diff * this.n * this.n;
    this.solve(axis, x, x0, a, 1 + 4 * a);
  }
  project(u, v) {
    const n = this.n;
    for (let y = 1; y <= n; y++)
      for (let x = 1; x <= n; x++) {
        const i = this.index(x, y);
        this.div[i] =
          (-0.5 *
            (u[this.index(x + 1, y)] -
              u[this.index(x - 1, y)] +
              v[this.index(x, y + 1)] -
              v[this.index(x, y - 1)])) /
          n;
        this.p[i] = 0;
      }
    this.boundary(this.div, 0);
    this.boundary(this.p, 0);
    this.solve(0, this.p, this.div, 1, 4);
    for (let y = 1; y <= n; y++)
      for (let x = 1; x <= n; x++) {
        const i = this.index(x, y);
        u[i] -= 0.5 * n * (this.p[this.index(x + 1, y)] - this.p[this.index(x - 1, y)]);
        v[i] -= 0.5 * n * (this.p[this.index(x, y + 1)] - this.p[this.index(x, y - 1)]);
      }
    this.boundary(u, 1);
    this.boundary(v, 2);
  }
  advect(axis, d, d0, u, v, dt) {
    const n = this.n,
      scale = (dt * n) / Math.max(1, this.settings.domain);
    for (let y = 1; y <= n; y++)
      for (let x = 1; x <= n; x++) {
        let px = clamp(x - scale * u[this.index(x, y)], 0.5, n + 0.5),
          py = clamp(y - scale * v[this.index(x, y)], 0.5, n + 0.5);
        const x0 = Math.floor(px),
          x1 = x0 + 1,
          y0 = Math.floor(py),
          y1 = y0 + 1,
          s1 = px - x0,
          s0 = 1 - s1,
          t1 = py - y0,
          t0 = 1 - t1;
        d[this.index(x, y)] =
          s0 * (t0 * d0[this.index(x0, y0)] + t1 * d0[this.index(x0, y1)]) +
          s1 * (t0 * d0[this.index(x1, y0)] + t1 * d0[this.index(x1, y1)]);
      }
    this.boundary(d, axis);
  }
  inject({ speed = 0, direction = 0, gust = 0, time = 0 } = {}) {
    const angle = (direction * Math.PI) / 180,
      baseX = Math.sin(angle) * speed,
      baseZ = Math.cos(angle) * speed,
      n = this.n;
    for (let y = 1; y <= n; y++)
      for (let x = 1; x <= n; x++) {
        const i = this.index(x, y),
          phase = time * 0.7 + x * 0.61 + y * 0.37,
          curl = Math.sin(phase) * gust * 0.16,
          turn = Math.cos(time * 0.31 + x * 0.27 - y * 0.41) * gust * 0.1;
        this.u[i] += (baseX + curl - this.u[i]) * 0.055 - turn;
        this.v[i] += (baseZ + turn - this.v[i]) * 0.055 + curl * 0.65;
      }
  }
  substep(dt, forcing) {
    this.inject(forcing);
    this.u0.set(this.u);
    this.v0.set(this.v);
    this.diffuse(1, this.u, this.u0, this.settings.viscosity, dt);
    this.diffuse(2, this.v, this.v0, this.settings.viscosity, dt);
    this.project(this.u, this.v);
    this.u0.set(this.u);
    this.v0.set(this.v);
    this.advect(1, this.u, this.u0, this.u0, this.v0, dt);
    this.advect(2, this.v, this.v0, this.u0, this.v0, dt);
    this.project(this.u, this.v);
  }
  step(dt, forcing = {}) {
    if (!this.settings.enabled) return;
    this.accumulator = (this.accumulator || 0) + clamp(dt, 0, 0.1);
    let steps = 0;
    while (this.accumulator >= 0.08 && steps++ < 2) {
      this.substep(0.08, forcing);
      this.accumulator -= 0.08;
    }
  }
  sample(x, z) {
    const n = this.n,
      half = this.settings.domain / 2,
      gx = clamp(((x + half) / this.settings.domain) * n + 1, 1, n),
      gy = clamp(((z + half) / this.settings.domain) * n + 1, 1, n),
      x0 = Math.floor(gx),
      x1 = Math.min(n, x0 + 1),
      y0 = Math.floor(gy),
      y1 = Math.min(n, y0 + 1),
      sx = gx - x0,
      sy = gy - y0;
    const bilinear = (field) =>
      (field[this.index(x0, y0)] * (1 - sx) + field[this.index(x1, y0)] * sx) * (1 - sy) +
      (field[this.index(x0, y1)] * (1 - sx) + field[this.index(x1, y1)] * sx) * sy;
    return [bilinear(this.u), bilinear(this.v)];
  }
  stats() {
    let divergence = 0,
      vorticity = 0,
      count = 0;
    for (let y = 2; y < this.n; y++)
      for (let x = 2; x < this.n; x++) {
        const div =
            (this.u[this.index(x + 1, y)] -
              this.u[this.index(x - 1, y)] +
              this.v[this.index(x, y + 1)] -
              this.v[this.index(x, y - 1)]) *
            0.5,
          vor =
            (this.v[this.index(x + 1, y)] -
              this.v[this.index(x - 1, y)] -
              this.u[this.index(x, y + 1)] +
              this.u[this.index(x, y - 1)]) *
            0.5;
        divergence += div * div;
        vorticity += Math.abs(vor);
        count++;
      }
    return {
      divergence: Math.sqrt(divergence / Math.max(1, count)),
      vorticity: vorticity / Math.max(1, count),
      cells: this.n * this.n,
    };
  }
}
