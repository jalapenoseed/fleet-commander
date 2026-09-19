const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export class DroneScreenFX {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'drone-screen-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.last = -Infinity;
    this.frame = 0;
  }
  resize() {
    const rect = this.host.getBoundingClientRect(),
      dpr = Math.min(1.5, globalThis.devicePixelRatio || 1),
      w = Math.max(1, Math.round(rect.width * dpr)),
      h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }
  update({ view = 'orbit', drone = null, weather = null, time = 0, reducedMotion = false } = {}) {
    const active = ['fpv', 'mounted'].includes(view),
      settings = weather?.settings || {},
      strength = clamp(Number(settings.screenFx) || 0);
    this.canvas.hidden = !active || strength <= 0.001;
    if (this.canvas.hidden || !this.ctx) return;
    this.resize();
    const health = Number.isFinite(drone?.health) ? drone.health : 100,
      distance = Math.hypot(...(drone?.pos || [0, 0, 0])),
      rain = weather?.visualRain ?? (Number(settings.rain) || 0),
      signal = clamp(
        weather?.signalFor?.(drone) ??
          1 - distance / 900 - rain * 0.18 - ((100 - health) / 100) * 0.28,
      ),
      interference = clamp((1 - signal) * 0.8 + rain * 0.32) * strength,
      stamp = Math.floor(time * (reducedMotion ? 4 : 18));
    if (stamp === this.last && weather?.intensity < 0.01) return;
    this.last = stamp;
    this.frame++;
    const c = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = `rgba(4,18,24,${0.035 + 0.08 * strength})`;
    for (let y = this.frame % 4; y < h; y += 6) c.fillRect(0, y, w, 1);
    const blocks = Math.round(interference * 22);
    for (let i = 0; i < blocks; i++) {
      const r = hash(this.frame * 37 + i),
        x = hash(i * 19 + this.frame) * w,
        y = hash(i * 41 + this.frame * 3) * h,
        bw = (0.04 + hash(i * 7) * 0.22) * w,
        bh = 2 + hash(i * 13) * 18;
      c.fillStyle =
        i % 3 === 0
          ? `rgba(85,245,224,${0.05 + interference * 0.2})`
          : `rgba(8,14,22,${0.16 + interference * 0.48})`;
      c.fillRect(x, y, bw, bh);
      if (r > 0.78) {
        c.fillStyle = `rgba(255,116,85,${interference * 0.12})`;
        c.fillRect(Math.max(0, x - 12), y + 2, bw, bh * 0.45);
      }
    }
    const droplets = Math.round(rain * strength * 20);
    c.strokeStyle = `rgba(210,235,244,${0.08 + rain * 0.15})`;
    for (let i = 0; i < droplets; i++) {
      const x = hash(i * 29 + 7) * w,
        y = hash(i * 17 + this.frame * 0.02) * h,
        r = (3 + hash(i * 31) * 15) * (this.canvas.width / 900);
      c.beginPath();
      c.ellipse(x, y, r * 0.55, r, hash(i) * 0.5, 0, Math.PI * 2);
      c.stroke();
    }
    if (weather?.intensity > 0) {
      c.fillStyle = `rgba(225,240,255,${clamp(weather.intensity * strength * 0.42)})`;
      c.fillRect(0, 0, w, h);
    }
    const hold = !reducedMotion && interference > 0.62 && hash(this.frame * 0.73) > 0.86;
    if (hold) {
      c.fillStyle = `rgba(1,5,8,${0.2 + interference * 0.45})`;
      c.fillRect(0, 0, w, h);
    }
    c.font = `${Math.max(11, Math.round(w / 78))}px ui-monospace,monospace`;
    c.textAlign = 'right';
    c.fillStyle = signal < 0.35 ? '#ff9c7b' : '#9fffe7';
    c.fillText(
      (hold ? 'FRAME HOLD · ' : '') + 'LINK ' + Math.round(signal * 100) + '%',
      w - 14,
      22,
    );
    c.restore();
  }
  dispose() {
    this.canvas.remove();
  }
}
