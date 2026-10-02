// Deterministic math for the lockstep simulation.
//
// Every peer must compute bit-identical results. JS numbers are IEEE-754 doubles and
// + - * / and Math.sqrt are correctly rounded everywhere, but Math.sin/cos/atan2/hypot/pow
// are engine-specific approximations. The simulation only uses the functions in this file
// (plus Math.floor/min/max/abs/imul, which are exact).

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

// Taylor series to x^13 after reduction to [-pi/2, pi/2]; error < 1e-9.
export function dsin(x) {
  x -= TAU * Math.floor((x + PI) / TAU);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return (
    x *
    (1 -
      (x2 / 6) *
        (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - x2 / 156))))))
  );
}

export const dcos = (x) => dsin(x + HALF_PI);

export const dtan = (x) => dsin(x) / dcos(x);

// Polynomial atan2, max error ~1e-5 rad; uses only exact operations.
export function datan2(y, x) {
  const ax = Math.abs(x),
    ay = Math.abs(y);
  if (ax === 0 && ay === 0) return 0;
  const a = Math.min(ax, ay) / Math.max(ax, ay),
    s = a * a;
  let r = ((((0.0208351 * s - 0.085133) * s + 0.180141) * s - 0.3302995) * s + 0.999866) * a;
  if (ay > ax) r = HALF_PI - r;
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

// Wrap an angle to [-pi, pi).
export const wrapAngle = (a) => a - TAU * Math.floor((a + PI) / TAU);

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export const len = (x, z) => Math.sqrt(x * x + z * z);

// Mulberry32. State is a plain int so it serializes and hashes trivially.
export function rngNext(state) {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

export class Rng {
  constructor(seed = 1) {
    this.state = seed | 0;
  }
  next() {
    const [s, v] = rngNext(this.state);
    this.state = s;
    return v;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
}

// FNV-1a over raw bytes, used for desync detection.
export class Hasher {
  constructor() {
    this.h = 0x811c9dc5;
    this.f64 = new Float64Array(1);
    this.u8 = new Uint8Array(this.f64.buffer);
  }
  bytes(u8) {
    let h = this.h;
    for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193);
    this.h = h;
    return this;
  }
  num(x) {
    this.f64[0] = x;
    return this.bytes(this.u8);
  }
  array(typed, count = typed.length) {
    return this.bytes(
      new Uint8Array(typed.buffer, typed.byteOffset, count * typed.BYTES_PER_ELEMENT),
    );
  }
  hex() {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
