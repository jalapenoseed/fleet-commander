import {
  defaultMusic,
  validateMusic,
  playStep,
  sequenceStep,
  sequencerMarkup,
  storedTrack,
} from './step-sequencer.js?v=0.9.0';

/**
 * ELI5: This is the soundtrack/metronome layer. A note such as `C4:1` means
 * middle C for one beat; `C4+E4+G4:2` is a two-beat chord and `R:1` is a rest.
 * BPM changes how long a beat lasts, not the written beat counts.
 */

export const DEFAULT_FLEET_SONG =
  'D3+A3:2 R:1 D4:1 F4:1 A4:1 E4:2\nC3+G3:2 R:1 E4:1 G4:1 D4:1 A3:2';
export function parseFleetSong(source) {
  if (typeof source !== 'string' || source.length > 4096)
    throw Error('Composition must fit within 4,096 characters.');
  const tokens = source.trim().split(/\s+/);
  if (!source.trim() || tokens.length > 256) throw Error('Write 1–256 notes, chords or rests.');
  let beats = 0;
  const events = tokens.map((token, index) => {
    const match = token.match(/^([A-GR][#b]?[1-7]?(?:\+[A-G][#b]?[1-7]){0,3}):(\d+(?:\.\d+)?)$/);
    if (!match) throw Error('Note ' + (index + 1) + ': use C4:1, C4+E4+G4:2 or R:1.');
    const duration = Number(match[2]);
    if (duration < 0.25 || duration > 16) throw Error('Note lengths must be 0.25–16 beats.');
    const frequencies =
      match[1] === 'R'
        ? []
        : match[1].split('+').map((note) => {
            const n = note.match(/^([A-G])([#b]?)([1-7])$/);
            if (!n) throw Error('Every note needs an octave, for example C4.');
            const midi =
              (Number(n[3]) + 1) * 12 +
              { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[n[1]] +
              (n[2] === '#' ? 1 : n[2] === 'b' ? -1 : 0);
            return 440 * 2 ** ((midi - 69) / 12);
          });
    const event = { at: beats, duration, frequencies };
    beats += duration;
    return event;
  });
  if (beats > 512) throw Error('Composition is limited to 512 beats.');
  return { events, beats };
}
export class FleetScore {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.voices = new Set();
    this.buffer = null;
    this.fileName = '';
    this.generation = 0;
    this.volume = 0.3;
    this.lastBeat = -1;
    this.lastTime = -1;
    this.song = '';
    this.music = defaultMusic();
    this.preview = false;
    this.lastStep = -1;
  }
  async enable() {
    const request = this.generation,
      C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) throw Error('Audio is unavailable in this browser.');
    if (!this.ctx) {
      this.ctx = new C();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = this.volume;
      this.bus.connect(this.ctx.destination);
    }
    await this.ctx.resume();
    if (request === this.generation) this.enabled = true;
  }
  silence() {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {}
    }
    this.voices.clear();
    this.uploadSource = null;
    this.lastBeat = -1;
    this.lastTime = -1;
  }
  stop() {
    this.generation++;
    this.enabled = false;
    this.preview = false;
    this.silence();
    this.lastStep = -1;
  }
  captureStream() {
    if (!this.ctx || !this.bus || !this.ctx.createMediaStreamDestination) return null;
    if (!this.capture) {
      this.capture = this.ctx.createMediaStreamDestination();
      this.bus.connect(this.capture);
    }
    return this.capture.stream;
  }
  async audition(mode) {
    const start = this.enable();
    this.silence();
    this.preview = true;
    this.previewAt = this.ctx.currentTime;
    this.previewMode = mode;
    this.lastStep = -1;
    await start;
  }
  async upload(file) {
    if (!file || file.size > 32 * 1024 * 1024)
      throw Error('Choose an audio file smaller than 32 MB.');
    if (
      !/^(audio\/|application\/ogg)/.test(file.type) &&
      !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)
    )
      throw Error('Choose MP3, WAV, OGG, M4A, AAC or FLAC audio.');
    const request = ++this.generation;
    await this.enable();
    if (request !== this.generation) return false;
    let buffer;
    try {
      buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw Error('Audio could not be decoded. Try MP3 or WAV on this device.');
    }
    if (request !== this.generation) return false;
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 900)
      throw Error('Choose a nonempty track shorter than 15 minutes.');
    this.silence();
    this.buffer = buffer;
    this.fileName = file.name;
    this.uploadFile = file;
    this.previewMode = 'upload';
    return true;
  }
  useComposition(source) {
    const score = parseFleetSong(source);
    this.generation++;
    this.silence();
    this.buffer = null;
    this.fileName = '';
    this.song = source;
    this.score = score;
  }
  update(program, running, { gain = 1 } = {}) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const time = this.preview
      ? Math.max(0, this.ctx.currentTime - this.previewAt)
      : Math.max(0, (program?.time || 0) - (program?.settings.countIn || 0));
    if (
      !this.preview &&
      (!running ||
        gain <= 0 ||
        !program?.running ||
        !program?.enabled ||
        program.time < program.settings.countIn)
    ) {
      if (this.voices.size) this.silence();
      this.lastStep = -1;
      return;
    }
    this.bus.gain.setTargetAtTime(
      this.volume * Math.max(0, Math.min(1, gain)),
      this.ctx.currentTime,
      0.04,
    );
    const jump = this.lastTime < 0 || time < this.lastTime || time - this.lastTime > 0.5;
    this.lastTime = time;
    const music = program?.music || this.music,
      sequence = this.preview
        ? this.previewMode === 'sequence'
        : !this.buffer && music.mode === 'sequence';
    if (sequence) {
      const step = sequenceStep(time, music.bpm);
      if (step !== this.lastStep) {
        this.lastStep = step;
        playStep(this, music, step);
      }
      return;
    }
    if (this.buffer && (!this.preview || this.previewMode === 'upload')) {
      if (!this.uploadSource || jump) {
        this.silence();
        this.lastTime = time;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffer;
        source.loop = true;
        source.connect(this.bus);
        this.voices.add(source);
        source.onended = () => {
          this.voices.delete(source);
          source.disconnect();
        };
        source.start(0, time % this.buffer.duration);
        this.uploadSource = source;
      }
      return;
    }
    const source = program.settings.song || DEFAULT_FLEET_SONG;
    if (source !== this.song) {
      this.useComposition(source);
      this.lastTime = time;
    }
    if (!this.score) this.score = parseFleetSong(source);
    const beat = (time * program.settings.bpm) / 60,
      cycle = Math.floor(beat / this.score.beats),
      local = beat % this.score.beats;
    for (const [i, event] of this.score.events.entries()) {
      const at = cycle * this.score.beats + event.at,
        key = cycle * 256 + i;
      if (
        event.at <= local &&
        local < event.at + event.duration &&
        (jump || this.lastBeat !== key)
      ) {
        this.lastBeat = key;
        const duration = ((event.at + event.duration - local) * 60) / program.settings.bpm;
        for (const frequency of event.frequencies) {
          const o = this.ctx.createOscillator(),
            gain = this.ctx.createGain(),
            now = this.ctx.currentTime;
          o.type = 'triangle';
          o.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(
            0.045 / Math.max(1, event.frequencies.length),
            now + 0.02,
          );
          gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.04, duration));
          o.connect(gain);
          gain.connect(this.bus);
          this.voices.add(o);
          o.onended = () => {
            this.voices.delete(o);
            o.disconnect();
            gain.disconnect();
          };
          o.start();
          o.stop(now + Math.max(0.05, duration) + 0.02);
        }
        break;
      }
    }
  }
  dispose() {
    this.generation++;
    this.stop();
    this.buffer = null;
    this.ctx?.close?.();
    this.ctx = null;
  }
}
const escape = (t) =>
  String(t).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function fleetScoreMarkup(song = DEFAULT_FLEET_SONG) {
  return `<section class="fleetScore"><h3>Soundtrack studio</h3>${sequencerMarkup()}<label>Note composition<textarea data-fleet-song rows="4" maxlength="4096" spellcheck="false">${escape(song)}</textarea></label><p class="hint">Notes use pitch:beats. Try C4:1, C4+E4+G4:2 or R:1 for a rest.</p><button data-score-use>Play note composition</button><label>Upload music<input data-score-file type="file" accept="audio/*,.ogg,.flac"></label><div class="form-row"><button data-score-preview>Preview attached track</button><button data-score-sync>Sync audio to fleet</button></div><p class="hint">Preview plays immediately, even before launch. Sync follows the show or battle clock. Set the music BPM yourself; this does not detect beats automatically.</p><div class="form-row"><button data-score-save>Save uploaded track on device</button><button data-score-restore>Restore saved track</button></div><p class="hint">One attached track can be stored on this device. Fleet JSON includes notes and beat patterns, but not the audio file. Keep your original music file for use on another device.</p><label>Soundtrack volume<input data-score-volume type="range" min="0" max=".7" step=".01" value=".3"></label><button data-score-stop>Stop / mute soundtrack</button><p data-score-status role="status">Choose a beat, notes or music file, then press Play.</p></section>`;
}
export function mountFleetScore(
  root,
  engine,
  onSong,
  { getMusic = () => engine.music, onMusic = (p) => (engine.music = p) } = {},
) {
  const q = (s) => root.querySelector(s);
  if (!q('[data-fleet-song]')) return;
  const status = q('[data-score-status]'),
    guard = (fn) => async () => {
      try {
        await fn();
      } catch (e) {
        status.textContent = e.message;
      }
    };
  function changed(music) {
    const p = validateMusic(music);
    engine.music = p;
    engine.lastStep = -1;
    onMusic(p);
    refresh();
  }
  function refresh() {
    const music = getMusic() || defaultMusic();
    engine.music = music;
    q('[data-seq-bpm]').value = music.bpm;
    for (const button of root.querySelectorAll('[data-step]')) {
      const [r, i] = button.dataset.step.split(':').map(Number);
      button.setAttribute('aria-pressed', String(!!music.tracks[r][i]));
    }
  }
  function update() {
    for (const button of root.querySelectorAll('[data-step]'))
      button.classList.toggle(
        'playing-step',
        engine.enabled &&
          engine.lastStep >= 0 &&
          Number(button.dataset.step.split(':')[1]) === engine.lastStep % 16,
      );
  }
  for (const b of root.querySelectorAll('[data-step]'))
    b.onclick = () => {
      const p = validateMusic(getMusic()),
        [r, i] = b.dataset.step.split(':').map(Number);
      p.tracks[r][i] = 1 - p.tracks[r][i];
      changed(p);
    };
  q('[data-seq-bpm]').onchange = guard(() => {
    changed({ ...getMusic(), bpm: Number(q('[data-seq-bpm]').value) });
  });
  q('[data-seq-play]').onclick = guard(async () => {
    engine.buffer = null;
    engine.fileName = '';
    changed({ ...getMusic(), mode: 'sequence' });
    await engine.audition('sequence');
    status.textContent = 'Playing beat preview · ' + engine.music.bpm + ' BPM.';
  });
  q('[data-seq-use]').onclick = guard(async () => {
    engine.silence();
    engine.preview = false;
    engine.buffer = null;
    engine.fileName = '';
    changed({ ...getMusic(), mode: 'sequence' });
    await engine.enable();
    status.textContent = 'Beat follows the fleet clock. Launch the fleet or start a battle.';
  });
  q('[data-seq-clear]').onclick = () =>
    changed({ ...getMusic(), tracks: Array.from({ length: 6 }, () => Array(16).fill(0)) });
  q('[data-seq-preset]').onclick = () => changed({ ...defaultMusic(), mode: 'sequence' });
  q('[data-score-use]').onclick = guard(async () => {
    const song = q('[data-fleet-song]').value;
    engine.useComposition(song);
    onSong(song);
    changed({ ...getMusic(), mode: 'composition' });
    await engine.audition('composition');
    status.textContent = 'Playing note preview. Sync audio to fleet when ready.';
  });
  q('[data-score-file]').onchange = guard(async () => {
    const file = q('[data-score-file]').files?.[0];
    try {
      if (!file) return;
      status.textContent = 'Decoding ' + file.name + '…';
      if (await engine.upload(file)) {
        await engine.audition('upload');
        status.textContent =
          'Playing ' + engine.fileName + ' · ' + Math.round(engine.buffer.duration) + ' s.';
      }
    } finally {
      q('[data-score-file]').value = '';
    }
  });
  q('[data-score-preview]').onclick = guard(async () => {
    if (!engine.buffer) {
      if (!engine.uploadFile) throw Error('Attach a music file first.');
      await engine.upload(engine.uploadFile);
    }
    await engine.audition('upload');
    status.textContent = 'Playing ' + engine.fileName;
  });
  q('[data-score-sync]').onclick = guard(async () => {
    engine.preview = false;
    engine.silence();
    engine.lastStep = -1;
    await engine.enable();
    status.textContent = 'Audio follows the fleet or battle clock. Launch or resume to hear it.';
  });
  q('[data-score-save]').onclick = guard(async () => {
    if (!engine.uploadFile) throw Error('Attach a music file first.');
    await storedTrack('save', engine.uploadFile);
    status.textContent = 'Saved ' + engine.uploadFile.name + ' on this device.';
  });
  q('[data-score-restore]').onclick = guard(async () => {
    await engine.enable();
    const file = await storedTrack('load');
    if (!file) throw Error('No music file saved on this device yet.');
    if (await engine.upload(new File([file.blob], file.name, { type: file.type })))
      status.textContent = 'Restored ' + engine.fileName + '. Tap Preview attached track.';
  });
  q('[data-score-volume]').value = engine.volume;
  q('[data-score-volume]').oninput = () => (engine.volume = Number(q('[data-score-volume]').value));
  q('[data-score-stop]').onclick = () => {
    engine.stop();
    status.textContent = 'Soundtrack stopped.';
    update();
  };
  refresh();
  return { refresh, update };
}
