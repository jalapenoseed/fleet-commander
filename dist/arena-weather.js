import * as T from './three.js?v=0.9.0';
import { NavierStokesField, fluidSettings } from './fluid-field.js?v=0.9.0';

/**
 * ELI5: Weather is four layers sharing one settings object: what you see,
 * what pushes drones, what affects battery/RF, and what the audio system hears.
 * Values from 0–1 are normally percentages written as decimals. Wind direction
 * is degrees and wind speed is treated as metres/second.
 */

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hash = (value) => {
  const n = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
// ELI5: These values load before a preset or saved browser preference overrides them.
export const WEATHER_DEFAULTS = Object.freeze({
  rain: 0,
  windSpeed: 0,
  windDirection: 225,
  gust: 0,
  clouds: 0.4,
  fog: 0.08,
  lightning: 0,
  flashBrightness: 1,
  screenFx: 0.65,
  visualFx: 1,
  physicsFx: 0.65,
  audioFx: 0.85,
  fluidEnabled: false,
  viscosity: 0.018,
});
// ELI5: Copy one whole entry to create another named weather button.
export const WEATHER_PRESETS = Object.freeze({
  clear: {
    name: '☀️ Clear',
    settings: {
      rain: 0,
      windSpeed: 1,
      windDirection: 225,
      gust: 0,
      clouds: 0.15,
      fog: 0.02,
      lightning: 0,
    },
  },
  rain: {
    name: '🌧️ Heavy rain',
    settings: {
      rain: 0.72,
      windSpeed: 9,
      windDirection: 225,
      gust: 5,
      clouds: 0.86,
      fog: 0.42,
      lightning: 0.08,
    },
  },
  storm: {
    name: '⛈️ Thunderstorm',
    settings: {
      rain: 1,
      windSpeed: 15,
      windDirection: 235,
      gust: 11,
      clouds: 1,
      fog: 0.58,
      lightning: 0.72,
    },
  },
  squall: {
    name: '🌪️ Extreme squall',
    settings: {
      rain: 0.9,
      windSpeed: 24,
      windDirection: 260,
      gust: 18,
      clouds: 1,
      fog: 0.7,
      lightning: 0.88,
      fluidEnabled: true,
    },
  },
});
export function weatherSettings(raw = {}) {
  const n = (key, min, max, fallback) =>
    Math.max(min, Math.min(max, Number.isFinite(Number(raw[key])) ? Number(raw[key]) : fallback));
  return {
    rain: n('rain', 0, 1, WEATHER_DEFAULTS.rain),
    windSpeed: n('windSpeed', 0, 35, WEATHER_DEFAULTS.windSpeed),
    windDirection: n('windDirection', 0, 360, WEATHER_DEFAULTS.windDirection),
    gust: n('gust', 0, 25, WEATHER_DEFAULTS.gust),
    clouds: n('clouds', 0, 1, WEATHER_DEFAULTS.clouds),
    fog: n('fog', 0, 1, WEATHER_DEFAULTS.fog),
    lightning: n('lightning', 0, 1, WEATHER_DEFAULTS.lightning),
    flashBrightness: n('flashBrightness', 0, 2, WEATHER_DEFAULTS.flashBrightness),
    screenFx: n('screenFx', 0, 1, WEATHER_DEFAULTS.screenFx),
    visualFx: n('visualFx', 0, 1, WEATHER_DEFAULTS.visualFx),
    physicsFx: n('physicsFx', 0, 1, WEATHER_DEFAULTS.physicsFx),
    audioFx: n('audioFx', 0, 1, WEATHER_DEFAULTS.audioFx),
    fluidEnabled: !!raw.fluidEnabled,
    viscosity: n('viscosity', 0.001, 0.12, WEATHER_DEFAULTS.viscosity),
  };
}
export class ArenaWeather {
  constructor(scene = null) {
    this.settings = weatherSettings();
    this.reducedFlashes = false;
    this.time = 0;
    this.next = 12;
    this.flash = 0;
    this.events = [];
    this.eventId = 0;
    this.strikePosition = [100, 0, -100];
    this.world = 'earth';
    this.fluid = new NavierStokesField({ enabled: false, viscosity: this.settings.viscosity });
    if (!scene) return;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(720), 3));
    g.setDrawRange(0, 0);
    this.bolt = new T.LineSegments(
      g,
      new T.LineBasicMaterial({
        color: 0xc7ddff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);
    this.light = new T.PointLight(0xc6dcff, 0, 650, 1.5);
    scene.add(this.light);
    const rainGeometry = new T.BufferGeometry(),
      rainPositions = new Float32Array(360 * 6);
    rainGeometry.setAttribute('position', new T.BufferAttribute(rainPositions, 3));
    this.rain = new T.LineSegments(
      rainGeometry,
      new T.LineBasicMaterial({
        color: 0xc8e8f1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }
  get enabled() {
    return (
      this.world === 'earth' &&
      (this.settings.rain > 0 || this.settings.lightning > 0 || this.settings.windSpeed > 2)
    );
  }
  set enabled(value) {
    if (value) {
      if (this.settings.lightning === 0) this.settings.lightning = 0.35;
    } else this.configure({ rain: 0, windSpeed: 0, gust: 0, lightning: 0 });
  }
  configure(patch = {}) {
    this.settings = weatherSettings({ ...this.settings, ...patch });
    this.fluid.configure(
      fluidSettings({ enabled: this.settings.fluidEnabled, viscosity: this.settings.viscosity }),
    );
    this.next = Math.min(this.next, this.time + this.lightningInterval());
    return this.settings;
  }
  setWorld(world = 'earth') {
    this.world = ['earth', 'moon', 'mars'].includes(world) ? world : 'earth';
    this.flash = 0;
    if (this.world !== 'earth' && this.bolt) this.bolt.material.opacity = 0;
  }
  lightningInterval() {
    return 5 + (1 - this.settings.lightning) * 35 + (this.eventId % 4) * 1.7;
  }
  get visualRain() {
    return this.world === 'earth' ? this.settings.rain * this.settings.visualFx : 0;
  }
  signalFor(drone) {
    const distance = Math.hypot(...(drone?.pos || [0, 0, 0])),
      damage = 1 - (Number.isFinite(drone?.health) ? drone.health : 100) / 100;
    return clamp(1 - distance / 1100 - this.visualRain * 0.16 - damage * 0.26, 0.04, 1);
  }
  batteryMultiplier() {
    const s = this.settings;
    if (this.world === 'moon') return 1;
    const atmosphere = this.world === 'mars' ? 0.45 : 1,
      rain = this.world === 'earth' ? s.rain * 0.16 : 0;
    return (
      1 + s.physicsFx * (rain + ((s.windSpeed / 35) * 0.24 + (s.gust / 25) * 0.13) * atmosphere)
    );
  }
  velocityAt(position = [0, 0, 0], time = this.time, id = '') {
    const s = this.settings;
    if (s.physicsFx <= 0 || this.world === 'moon') return [0, 0, 0];
    const angle = (s.windDirection * Math.PI) / 180,
      base = [Math.sin(angle) * s.windSpeed, Math.cos(angle) * s.windSpeed],
      key =
        typeof id === 'string' ? [...id].reduce((n, c) => n + c.charCodeAt(0), 0) : Number(id) || 0,
      gustWave =
        (Math.sin(time * 0.83 + position[0] * 0.018 + key * 0.07) +
          Math.sin(time * 0.31 + position[2] * 0.011 + key * 0.13)) *
        0.5 *
        s.gust;
    if (s.fluidEnabled) {
      const flow = this.fluid.sample(position[0], position[2]);
      base[0] = flow[0] * 0.82 + base[0] * 0.18;
      base[1] = flow[1] * 0.82 + base[1] * 0.18;
    }
    const scale = s.physicsFx * (this.world === 'mars' ? 0.45 : 1);
    return [
      (base[0] + Math.sin(angle + Math.PI / 2) * gustWave) * scale,
      Math.sin(time * 1.2 + key) * s.gust * 0.055 * scale,
      (base[1] + Math.cos(angle + Math.PI / 2) * gustWave) * scale,
    ];
  }
  strike(cameraPosition = { x: 0, y: 2, z: 200 }) {
    if (this.world !== 'earth' || this.time - (this.lastStrikeTime ?? -Infinity) < 1.5)
      return false;
    this.lastStrikeTime = this.time;
    const id = ++this.eventId,
      angle = id * 2.399,
      x = Math.sin(angle) * 240,
      z = -100 + Math.cos(angle) * 200;
    this.strikePosition = [x, 0, z];
    this.flash = 0.42;
    const distance = Math.hypot(x - cameraPosition.x, cameraPosition.y, z - cameraPosition.z);
    this.events.push({
      id,
      type: 'thunder',
      pos: [x, 0, z],
      time: this.time + distance / 343,
      power: this.settings.flashBrightness,
    });
    if (this.events.length > 24) this.events.shift();
    if (this.bolt) {
      const a = this.bolt.geometry.attributes.position,
        vertices = [];
      let old = [x + 12, 230, z + 18];
      for (let i = 1; i <= 22; i++) {
        const p = [
          x + Math.sin(i * 13.7 + id) * 13 * (1 - i / 22),
          230 * (1 - i / 22),
          z + Math.cos(i * 7.3 + id) * 11 * (1 - i / 22),
        ];
        vertices.push(...old, ...p);
        if (i % 4 === 0) {
          let b = p;
          for (let j = 1; j <= 3; j++) {
            const n = [p[0] + j * 11 * Math.sin(i), p[1] - j * 9, p[2] + j * 8 * Math.cos(i)];
            vertices.push(...b, ...n);
            b = n;
          }
        }
        old = p;
      }
      a.array.set(vertices);
      a.needsUpdate = true;
      this.bolt.geometry.setDrawRange(0, vertices.length / 3);
      this.light.position.set(x, 90, z);
    }
    return true;
  }
  updateRain(cameraPosition) {
    if (!this.rain) return;
    const amount = this.visualRain;
    this.rain.visible = amount > 0.01;
    if (!this.rain.visible) return;
    const a = this.rain.geometry.attributes.position.array,
      count = Math.max(24, Math.floor(360 * amount));
    this.rain.geometry.setDrawRange(0, count * 2);
    for (let i = 0; i < count; i++) {
      const seed = i + this.eventId * 17,
        x = cameraPosition.x + (hash(seed * 3) - 0.5) * 180,
        z = cameraPosition.z + (hash(seed * 7) - 0.5) * 180,
        fall = (this.time * (38 + this.settings.windSpeed) + hash(seed) * 100) % 120,
        y = cameraPosition.y + 65 - fall,
        wind = this.velocityAt([x, y, z], this.time, seed),
        j = i * 6;
      a[j] = x;
      a[j + 1] = y;
      a[j + 2] = z;
      a[j + 3] = x - wind[0] * 0.09;
      a[j + 4] = y - (2.5 + amount * 5);
      a[j + 5] = z - wind[2] * 0.09;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.material.opacity = 0.18 + amount * 0.42;
  }
  update(
    dt,
    { running = true, reducedMotion = false, cameraPosition = { x: 0, y: 2, z: 200 } } = {},
  ) {
    if (running) {
      this.time += dt;
      this.fluid.step(dt, {
        speed: this.settings.windSpeed,
        direction: this.settings.windDirection,
        gust: this.settings.gust,
        time: this.time,
      });
      if (this.world === 'earth' && this.settings.lightning > 0 && this.time >= this.next) {
        this.strike(cameraPosition);
        this.next = this.time + this.lightningInterval();
      }
      this.flash = Math.max(0, this.flash - dt);
    }
    const reduced = this.reducedFlashes || reducedMotion;
    this.intensity =
      this.flash > 0
        ? reduced
          ? 0.025
          : Math.exp(-(0.42 - this.flash) * 15) * this.settings.flashBrightness
        : 0;
    if (this.bolt) {
      this.bolt.visible = this.world === 'earth';
      this.bolt.material.opacity =
        this.flash > 0
          ? reduced
            ? 0.15
            : Math.min(1, this.flash * 6 * this.settings.flashBrightness)
          : 0;
      this.light.intensity = reduced ? 0 : this.intensity * 180000;
      this.updateRain(cameraPosition);
    }
  }
  dispose() {
    if (this.bolt) {
      this.bolt.geometry.dispose();
      this.bolt.material.dispose();
      this.bolt.removeFromParent();
      this.light.dispose();
      this.light.removeFromParent();
      this.rain.geometry.dispose();
      this.rain.material.dispose();
      this.rain.removeFromParent();
    }
  }
}
