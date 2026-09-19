// Canvas + HUD compositing and optional game/music mix. No microphone access.
export class VideoCapture {
  constructor({ renderer, getAudioStreams = () => [], onChange = () => {}, onError = () => {} }) {
    Object.assign(this, { renderer, getAudioStreams, onChange, onError });
    this.state = 'idle';
    this.links = new Map();
    this.parts = [];
    this.bytes = 0;
    this.failed = false;
  }
  get supported() {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof this.renderer.canvas?.captureStream === 'function'
    );
  }
  start({ audio = true, hud = true } = {}) {
    if (!this.supported)
      throw Error('This browser cannot record a canvas. Use your device screen recorder.');
    if (this.state === 'recording') return;
    this.parts = [];
    this.bytes = 0;
    this.failed = false;
    this.includeHUD = hud;
    this.includeAudio = audio;
    this.started = performance.now();
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = Math.max(2, Math.min(1920, this.renderer.canvas.width || 1280));
      this.canvas.height = Math.max(
        2,
        Math.round(
          (this.canvas.width * (this.renderer.canvas.height || 720)) /
            (this.renderer.canvas.width || 1280),
        ),
      );
      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) throw Error('Canvas recording is unavailable.');
      this.stream = this.canvas.captureStream(30);
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (audio && C) {
        this.audioContext = new C();
        this.destination = this.audioContext.createMediaStreamDestination();
        this.audioContext.resume().catch(() => {
          this.onError('Recording audio was interrupted. Enable sound and try again.');
        });
        this.stream.addTrack(this.destination.stream.getAudioTracks()[0]);
        this.attachAudio();
      }
      const types = audio
        ? [
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4',
          ]
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      const type = types.find((t) => MediaRecorder.isTypeSupported(t));
      this.recorder = new MediaRecorder(
        this.stream,
        type ? { mimeType: type, videoBitsPerSecond: 7000000, audioBitsPerSecond: 128000 } : {},
      );
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) {
          this.parts.push(e.data);
          this.bytes += e.data.size;
          if (this.bytes >= 256 * 1024 * 1024) this.stop();
        }
      };
      this.recorder.onerror = () => {
        this.failed = true;
        this.onError(
          'Recording failed on this device. Try a smaller scene or your screen recorder.',
        );
        this.stop();
      };
      this.recorder.onstop = () => this.finish();
      this.state = 'recording';
      this.frame();
      this.recorder.start(1000);
      this.timer = setTimeout(() => this.stop(), 300000);
      this.onChange();
    } catch (error) {
      this.state = 'idle';
      this.cleanup();
      throw error;
    }
  }
  attachAudio() {
    if (!this.audioContext) return;
    for (const stream of this.getAudioStreams().filter(Boolean)) {
      if (this.links.has(stream) || !stream.getAudioTracks().length) continue;
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.destination);
      this.links.set(stream, source);
    }
  }
  frame() {
    if (this.state !== 'recording') return;
    const { width: w, height: h } = this.canvas;
    this.ctx.drawImage(this.renderer.canvas, 0, 0, w, h);
    if (this.includeHUD && this.renderer.combatHUD?.canvas)
      this.ctx.drawImage(this.renderer.combatHUD.canvas, 0, 0, w, h);
    this.attachAudio();
  }
  stop() {
    if (this.recorder?.state === 'recording') {
      this.state = 'saving';
      this.recorder.stop();
      this.onChange();
    }
  }
  finish() {
    const type = this.recorder?.mimeType || 'video/webm';
    this.cleanup();
    this.state = 'idle';
    if (this.parts.length && !this.failed) {
      if (this.url) URL.revokeObjectURL(this.url);
      this.blob = new Blob(this.parts, { type });
      this.url = URL.createObjectURL(this.blob);
      this.filename =
        'fleet-show-' +
        new Date().toISOString().replace(/[:.]/g, '-') +
        (type.includes('mp4') ? '.mp4' : '.webm');
      this.download();
    }
    this.parts = [];
    this.recorder = null;
    this.onChange();
  }
  download() {
    if (!this.url) return;
    const a = document.createElement('a');
    a.href = this.url;
    a.download = this.filename;
    a.click();
  }
  async share() {
    if (!this.blob) throw Error('Record a clip first.');
    const file = new File([this.blob], this.filename, { type: this.blob.type });
    if (!navigator.canShare?.({ files: [file] }))
      throw Error('Sharing is unavailable here. Use Save clip instead.');
    await navigator.share({ files: [file], title: 'Fleet Commander' });
  }
  cleanup() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const source of this.links.values()) source.disconnect();
    this.links.clear();
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }
  dispose() {
    this.stop();
    if (this.state !== 'saving') this.cleanup();
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
