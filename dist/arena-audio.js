// All activation/resume calls begin inside a user gesture. No autoplay or microphone.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const DRONE_AUDIO_PROFILES = Object.freeze({
  scout: { baseHz: 185, harmonic: 2.08, gain: 0.82, motors: 4, label: 'small high-RPM quad' },
  relay: { baseHz: 148, harmonic: 2.35, gain: 0.95, motors: 6, label: 'medium six-motor relay' },
  cargo: { baseHz: 88, harmonic: 2.72, gain: 1.3, motors: 8, label: 'heavy low-RPM cargo frame' },
  engineer: { baseHz: 126, harmonic: 2.28, gain: 1.06, motors: 4, label: 'utility quad' },
});
export function droneSoundProfile(drone = {}) {
  return DRONE_AUDIO_PROFILES[drone.type] || DRONE_AUDIO_PROFILES.scout;
}
export class ArenaAudio {
  constructor() {
    this.enabled = false;
    this.volume = 0.55;
    this.droneVolume = 1;
    this.weatherVolume = 0.85;
    this.effectsVolume = 1;
    this.mix = 'arena';
    this.lastCombat = 0;
    this.heardThunder = new Set();
    this.voices = new Set();
    this.motorVoices = [];
    this.testUntil = 0;
    this.level = 0;
  }
  get state() {
    return !this.enabled ? 'off' : this.context?.state || 'suspended';
  }
  async enable() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw Error('Game audio is unavailable in this browser.');
    try {
      if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    if (!this.context || this.context.state === 'closed') {
      const c = (this.context = new Audio({ latencyHint: 'interactive' }));
      this.motorVoices = [];
      this.voices.clear();
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.droneBus = c.createGain();
      this.weatherBus = c.createGain();
      this.effectsBus = c.createGain();
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 16;
      this.limiter.ratio.value = 5;
      this.limiter.attack.value = 0.006;
      this.limiter.release.value = 0.18;
      this.meter = c.createAnalyser();
      this.meter.fftSize = 256;
      this.samples = new Float32Array(256);
      for (const bus of [this.droneBus, this.weatherBus, this.effectsBus]) bus.connect(this.master);
      this.master.connect(this.limiter);
      this.limiter.connect(this.meter);
      this.meter.connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const a = this.noise.getChannelData(0);
      let smooth = 0;
      for (let i = 0; i < a.length; i++) {
        smooth = smooth * 0.65 + (Math.random() * 2 - 1) * 0.35;
        a[i] = smooth;
      }
      for (let i = 0; i < 6; i++) {
        const oscillator = c.createOscillator(),
          harmonic = c.createOscillator(),
          filter = c.createBiquadFilter(),
          gain = c.createGain(),
          pan = this.makePan(),
          damageSource = c.createBufferSource(),
          damageFilter = c.createBiquadFilter(),
          damageGain = c.createGain();
        oscillator.type = 'sawtooth';
        harmonic.type = 'sine';
        filter.type = 'lowpass';
        filter.frequency.value = 1700;
        gain.gain.value = 0;
        damageSource.buffer = this.noise;
        damageSource.loop = true;
        damageFilter.type = 'bandpass';
        damageFilter.frequency.value = 420 + i * 37;
        damageGain.gain.value = 0;
        oscillator.connect(filter);
        harmonic.connect(filter);
        filter.connect(gain);
        gain.connect(pan);
        damageSource.connect(damageFilter);
        damageFilter.connect(damageGain);
        damageGain.connect(pan);
        pan.connect(this.droneBus);
        oscillator.start();
        harmonic.start();
        damageSource.start();
        this.motorVoices.push({
          oscillator,
          harmonic,
          filter,
          gain,
          pan,
          damageSource,
          damageFilter,
          damageGain,
        });
      }
      this.windSource = c.createBufferSource();
      this.windSource.buffer = this.noise;
      this.windSource.loop = true;
      this.windFilter = c.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windGain = c.createGain();
      this.windGain.gain.value = 0;
      this.windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.weatherBus);
      this.windSource.start();
      this.rainSource = c.createBufferSource();
      this.rainSource.buffer = this.noise;
      this.rainSource.loop = true;
      this.rainFilter = c.createBiquadFilter();
      this.rainFilter.type = 'highpass';
      this.rainFilter.frequency.value = 1800;
      this.rainGain = c.createGain();
      this.rainGain.gain.value = 0;
      this.rainSource.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.weatherBus);
      this.rainSource.start();
      this.applyMix();
    }
    this.enabled = true;
    const resumed = this.context.resume(); // Before any await: mobile gesture activation.
    await resumed;
    if (this.context.state !== 'running')
      throw Error('Audio is interrupted. Tap Resume sound once the interruption ends.');
  }
  applyMix() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.droneBus?.gain.setTargetAtTime(this.droneVolume, now, 0.03);
    this.weatherBus?.gain.setTargetAtTime(this.weatherVolume, now, 0.03);
    this.effectsBus?.gain.setTargetAtTime(this.effectsVolume, now, 0.03);
  }
  makePan() {
    const c = this.context;
    return c.createStereoPanner ? c.createStereoPanner() : c.createGain();
  }
  captureStream() {
    if (!this.context?.createMediaStreamDestination || !this.limiter) return null;
    if (!this.capture) {
      this.capture = this.context.createMediaStreamDestination();
      this.limiter.connect(this.capture);
    }
    return this.capture.stream;
  }
  pan(node, value) {
    node.pan?.setTargetAtTime(Math.max(-0.8, Math.min(0.8, value)), this.context.currentTime, 0.06);
  }
  mute() {
    this.enabled = false;
    this.silence();
    this.context?.suspend().catch(() => {});
    try {
      if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'auto';
    } catch {}
  }
  silence() {
    if (!this.context) return;
    this.testUntil = 0;
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.015);
    for (const v of this.motorVoices) {
      v.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.015);
      v.damageGain.gain.setTargetAtTime(0, this.context.currentTime, 0.015);
    }
    this.windGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    this.rainGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {}
    }
    this.voices.clear();
    this.level = 0;
  }
  async test() {
    await this.enable();
    this.silence();
    if (this.volume === 0) this.volume = 0.55;
    this.testUntil = this.context.currentTime + 1;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    this.tone(660, 0.25, 0.24);
    this.tone(880, 0.35, 0.24, 0.34);
  }
  tone(frequency, duration, gainValue, delay = 0) {
    if (this.voices.size >= 20) return;
    const c = this.context,
      at = c.currentTime + delay,
      source = c.createOscillator(),
      gain = c.createGain();
    source.type = 'sine';
    source.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    source.connect(gain);
    gain.connect(this.effectsBus);
    source.start(at);
    source.stop(at + duration);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }
  attenuation(distance) {
    return this.mix === 'arena'
      ? Math.max(0.25, 1 / (1 + distance * 0.006))
      : 1 / (1 + distance * 0.025);
  }
  event(event, camera) {
    if (this.state !== 'running' || this.voices.size >= 20) return;
    const c = this.context,
      now = c.currentTime,
      distance = Math.hypot(
        event.pos[0] - camera.x,
        event.pos[1] - camera.y,
        event.pos[2] - camera.z,
      ),
      near = this.attenuation(distance),
      thunder = event.type === 'thunder';
    if (event.type === 'drop') {
      this.tone(470, 0.14, 0.16 * near);
      return;
    }
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain(),
      pan = this.makePan();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.value = thunder ? 750 : event.type === 'explosion' ? 1300 : 2300;
    const duration = thunder ? 2.8 : event.type === 'explosion' ? 1.1 : 0.25,
      power = (thunder ? 1.1 : event.type === 'explosion' ? 1.5 : 0.65) * near * (event.power || 1);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(power, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    this.pan(pan, (event.pos[0] - camera.x) / 150);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(thunder ? this.weatherBus : this.effectsBus);
    source.start(now);
    source.stop(now + duration);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
  }
  update(sim, weather, camera = { x: 0, y: 35, z: 210 }) {
    const events = sim.combat?.events || [],
      thunder = weather?.events || [],
      liveThunder = new Set(thunder.map((e) => e.id));
    for (const id of this.heardThunder) if (!liveThunder.has(id)) this.heardThunder.delete(id);
    const c = this.context,
      testing = this.enabled && c?.currentTime < this.testUntil;
    if (!this.enabled || !sim.running || this.state !== 'running') {
      this.lastCombat = events.at(-1)?.id || this.lastCombat;
      for (const e of thunder)
        if (!this.enabled || e.time <= weather.time) this.heardThunder.add(e.id);
      if (c) {
        this.master.gain.setTargetAtTime(testing ? this.volume : 0, c.currentTime, 0.015);
        for (const v of this.motorVoices) {
          v.gain.gain.setTargetAtTime(0, c.currentTime, 0.04);
          v.damageGain.gain.setTargetAtTime(0, c.currentTime, 0.04);
        }
        this.windGain?.gain.setTargetAtTime(0, c.currentTime, 0.04);
        this.rainGain?.gain.setTargetAtTime(0, c.currentTime, 0.04);
      }
      this.readLevel();
      return;
    }
    const now = c.currentTime;
    this.master.gain.setTargetAtTime(this.volume, now, 0.04);
    this.applyMix();
    // Keep only six nearest voices without sorting the entire 10k show roster.
    const nearby = [];
    for (const d of sim.drones) {
      if (!['FLY', 'RETURN', 'LAND'].includes(d.mode)) continue;
      const item = {
        d,
        distance: Math.hypot(d.pos[0] - camera.x, d.pos[1] - camera.y, d.pos[2] - camera.z),
      };
      if (nearby.length === 6 && item.distance >= nearby[5].distance) continue;
      nearby.push(item);
      nearby.sort((a, b) => a.distance - b.distance);
      if (nearby.length > 6) nearby.pop();
    }
    this.motorVoices.forEach((v, i) => {
      const item = nearby[i],
        d = item?.d,
        speed = d ? Math.hypot(...d.velocity) : 0,
        profile = droneSoundProfile(d),
        load = d
          ? clamp(
              speed / 24 +
                Math.abs(d.attitude?.pitch || 0) +
                Math.abs(d.attitude?.roll || 0) +
                Number(d.weatherLoad || 0) * 0.6,
              0,
              1.8,
            )
          : 0,
        health = Number.isFinite(d?.health) ? d.health : 100,
        damage = clamp(1 - health / 100),
        wobble = 1 + Math.sin(now * (9 + i * 0.7)) * damage * 0.055,
        frequency = (profile.baseHz + speed * 3.2 + load * 42) * wobble;
      v.gain.gain.setTargetAtTime(
        item ? 0.09 * this.attenuation(item.distance) * profile.gain : 0,
        now,
        0.12,
      );
      v.oscillator.frequency.setTargetAtTime(frequency, now, 0.08);
      v.harmonic.frequency.setTargetAtTime(frequency * profile.harmonic, now, 0.08);
      v.filter.frequency.setTargetAtTime(1050 + profile.motors * 95 + load * 420, now, 0.1);
      v.damageFilter.frequency.setTargetAtTime(260 + frequency * 0.8, now, 0.08);
      v.damageGain.gain.setTargetAtTime(
        item ? damage * damage * 0.13 * this.attenuation(item.distance) : 0,
        now,
        0.08,
      );
      this.pan(v.pan, item ? (item.d.pos[0] - camera.x) / 100 : 0);
    });
    const s = weather?.settings || {},
      weatherFx = Number(s.audioFx ?? 1),
      air = weather?.world === 'moon' ? 0 : weather?.world === 'mars' ? 0.25 : 1,
      wind = clamp((s.windSpeed || 0) / 30 + (s.gust || 0) / 45) * air,
      rain = weather?.world === 'earth' ? Number(s.rain || 0) : 0;
    this.windGain?.gain.setTargetAtTime(wind * 0.32 * weatherFx, now, 0.18);
    this.windFilter?.frequency.setTargetAtTime(330 + wind * 900, now, 0.2);
    this.rainGain?.gain.setTargetAtTime(rain * 0.28 * weatherFx, now, 0.18);
    this.rainFilter?.frequency.setTargetAtTime(1200 + rain * 1600, now, 0.2);
    for (const e of events)
      if (e.id > this.lastCombat) {
        this.lastCombat = e.id;
        this.event(e, camera);
      }
    for (const e of thunder)
      if (!this.heardThunder.has(e.id) && e.time <= weather.time) {
        this.heardThunder.add(e.id);
        this.event(e, camera);
      }
    this.readLevel();
  }
  readLevel() {
    if (this.state !== 'running' || !this.meter) {
      this.level = 0;
      return;
    }
    this.meter.getFloatTimeDomainData(this.samples);
    this.level = Math.min(
      1,
      Math.sqrt(this.samples.reduce((sum, x) => sum + x * x, 0) / this.samples.length) * 5,
    );
  }
  dispose() {
    this.silence();
    for (const v of this.motorVoices) {
      try {
        v.oscillator.stop();
        v.harmonic.stop();
        v.damageSource.stop();
      } catch {}
    }
    try {
      this.windSource?.stop();
      this.rainSource?.stop();
    } catch {}
    this.context?.close().catch(() => {});
    this.enabled = false;
  }
}
