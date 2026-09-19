import { rasterToArt, validateArt } from './art-formation.js?v=0.9.0';
import { createCommanderFleet } from './fleet-commander-core.js?v=0.9.0';
import { clearProgramEffects } from './fleet-effects.js?v=0.9.0';
import { downloadJSON } from './battle-playbook.js?v=0.9.0';
export function mountArtStudio({ sim, renderer, populate, requireFreeRoster, guard, say }) {
  const panel = document.createElement('section');
  panel.id = 'tab-art';
  panel.className = 'tab-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="section-heading"><span class="eyebrow">🎨 LIGHT CANVAS</span><h2>Paint the sky.</h2></div><p>Draw pixels, type an emoji, or turn an image into colored drone lights.</p>
  <details open><summary>😂 Emoji formation</summary><label>Emoji or short sequence<input id="artEmoji" maxlength="16" value="⚡" inputmode="text"></label><div class="emoji-picks" aria-label="Emoji presets"><button data-emoji="❤️">❤️</button><button data-emoji="👾">👾</button><button data-emoji="⚡">⚡</button><button data-emoji="🛸">🛸</button><button data-emoji="😂">😂</button><button data-emoji="🐝">🐝</button><button data-emoji="💀">💀</button></div><div class="form-row"><label>Emoji scale<input id="emojiScale" type="range" min="0.45" max="1" step="0.05" value="0.82"></label><label>Rotation<input id="emojiRotation" type="range" min="-180" max="180" step="5" value="0"></label></div><label>Color source<select id="emojiColor"><option value="native">Keep native emoji colors</option><option value="paint">Use paint color</option></select></label><button id="renderEmoji" class="wide">Put emoji on canvas</button><p class="hint">Then choose Full RGB, Contrast outline or Dark silhouette below. Extra aircraft automatically form depth layers behind the emoji.</p></details>
 <div class="form-row"><label>Grid<select id="artSize"><option value="16">16 × 16</option><option value="32" selected>32 × 32</option><option value="48">48 × 48</option><option value="64">64 × 64</option></select></label><label>Paint color<input id="artColor" type="color" value="#61e7ed"></label></div>
 <div class="form-row"><label>Tool<select id="artTool"><option value="pixel">Pixel brush</option><option value="draw">Free draw</option><option value="erase">Eraser</option></select></label><label>Brush width<select id="artBrush"><option>1</option><option>2</option><option>3</option><option>4</option></select></label></div>
 <canvas id="artCanvas" width="512" height="512" tabindex="0" aria-label="Pixel art canvas. Draw with touch or mouse; arrow keys move, Space paints, Delete erases."></canvas><p class="hint">Touch to paint. Keyboard: arrows to move, Space to paint, Delete to erase. Transparent cells are empty air.</p>
 <div class="form-row"><button id="undoArt">Undo</button><button id="clearArt">Clear canvas</button></div>
 <label>Upload an image<input id="artFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label>
 <div class="form-row"><label>Conversion<select id="artMode"><option value="rgb">Full RGB lights</option><option value="outline">Contrast outline</option><option value="silhouette">Dark silhouette</option></select></label><label>Threshold <output id="artThresholdValue">12</output><input id="artThreshold" type="range" min="0" max="255" value="12"></label></div>
 <p class="hint">Outline preview is black on white; aircraft use your chosen paint color. Black cannot emit light. RGB skips pixels darker than the threshold; silhouette keeps them. Uploaded images stay on this device.</p>
 <canvas id="artPreview" width="256" height="256" aria-label="Drone art preview"></canvas><p id="artStatus" role="status"></p>
 <label class="check"><input id="artExact" type="checkbox">Build one drone per lit pixel (replaces current roster)</label><button id="launchArt" class="primary wide">Apply art & launch</button>
 <div class="form-row"><button id="saveArt">Save art on device</button><button id="loadArt">Load saved art</button></div><button id="exportArt" class="wide">Export art JSON</button><label>Import art JSON<input id="importArt" type="file" accept="application/json,.json"></label><p class="hint">Fleet saves also include the applied art and RGB colors. A 64 × 64 canvas can use 4,096 drones; large shows are demanding on mobile.</p>`;
  document.querySelector('.panel-scroll').append(panel);
  const nav = document.createElement('button');
  nav.dataset.tab = 'art';
  nav.textContent = 'Art';
  nav.setAttribute('aria-pressed', 'false');
  document.querySelector('.tabs').append(nav);
  nav.onclick = () => {
    for (const b of document.querySelectorAll('[data-tab]'))
      b.setAttribute('aria-pressed', String(b === nav));
    for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p !== panel;
  };
  const $ = (id) => panel.querySelector('#' + id),
    canvas = $('artCanvas'),
    ctx = canvas.getContext('2d'),
    preview = $('artPreview').getContext('2d');
  let size = 32,
    pixels = new Uint8ClampedArray(size * size * 4),
    undo = [],
    down = false,
    last = null,
    cursor = [0, 0],
    generation = 0;
  const art = () =>
    rasterToArt(
      { data: pixels, width: size, height: size },
      $('artMode').value,
      Number($('artThreshold').value),
      $('artColor').value,
    );
  function checkpoint() {
    undo.push({ size, pixels: pixels.slice() });
    if (undo.length > 20) undo.shift();
  }
  function draw() {
    if (!ctx) return;
    const cell = 512 / size;
    ctx.clearRect(0, 0, 512, 512);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        ctx.fillStyle = pixels[i + 3]
          ? 'rgb(' + pixels.slice(i, i + 3).join(',') + ')'
          : (x + y) % 2
            ? '#21343c'
            : '#172a32';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    ctx.strokeStyle = '#ffffff80';
    ctx.strokeRect(cursor[0] * cell, cursor[1] * cell, cell, cell);
    const result = art();
    if (preview) {
      preview.fillStyle = $('artMode').value === 'outline' ? '#f4f5ef' : '#07151b';
      preview.fillRect(0, 0, 256, 256);
      for (const [x, y, color] of result.points) {
        preview.fillStyle = $('artMode').value === 'outline' ? '#10191d' : color;
        preview.fillRect((x * 256) / size, (y * 256) / size, 256 / size, 256 / size);
      }
    }
    $('artThresholdValue').textContent = $('artThreshold').value;
    $('artStatus').textContent =
      result.points.length + ' lit pixels · ' + sim.drones.length + ' drones in current fleet';
    $('launchArt').disabled = !result.points.length;
  }
  function paint(p, erase = false) {
    cursor = p;
    const color = $('artColor').value,
      brush = Number($('artBrush').value);
    for (let y = p[1]; y < Math.min(size, p[1] + brush); y++)
      for (let x = p[0]; x < Math.min(size, p[0] + brush); x++) {
        const i = (y * size + x) * 4;
        pixels.set(
          erase || $('artTool').value === 'erase'
            ? [0, 0, 0, 0]
            : [
                parseInt(color.slice(1, 3), 16),
                parseInt(color.slice(3, 5), 16),
                parseInt(color.slice(5, 7), 16),
                255,
              ],
          i,
        );
      }
  }
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(size - 1, Math.floor(((e.clientX - r.left) / r.width) * size))),
      Math.max(0, Math.min(size - 1, Math.floor(((e.clientY - r.top) / r.height) * size))),
    ];
  };
  canvas.onpointerdown = (e) => {
    if (e.button !== 0) return;
    generation++;
    checkpoint();
    down = true;
    last = point(e);
    paint(last);
    draw();
    canvas.setPointerCapture?.(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!down) return;
    const next = point(e),
      steps = Math.max(Math.abs(next[0] - last[0]), Math.abs(next[1] - last[1]), 1);
    for (let i = 0; i <= steps; i++)
      paint(last.map((v, j) => Math.round(v + ((next[j] - v) * i) / steps)));
    last = next;
    draw();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(event, () => (down = false));
  canvas.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Delete'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === ' ' || e.key === 'Delete') {
      checkpoint();
      paint(cursor, e.key === 'Delete');
    } else
      cursor = cursor.map((v, i) =>
        Math.max(
          0,
          Math.min(
            size - 1,
            v +
              (i === 0
                ? e.key === 'ArrowRight'
                  ? 1
                  : e.key === 'ArrowLeft'
                    ? -1
                    : 0
                : e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowUp'
                    ? -1
                    : 0),
          ),
        ),
      );
    draw();
  };
  $('clearArt').onclick = () => {
    generation++;
    checkpoint();
    pixels.fill(0);
    draw();
  };
  $('undoArt').onclick = () => {
    generation++;
    const past = undo.pop();
    if (past) {
      size = past.size;
      pixels = past.pixels;
      $('artSize').value = size;
      cursor = [0, 0];
      draw();
    }
  };
  $('artSize').onchange = () => {
    generation++;
    checkpoint();
    const old = size,
      source = pixels;
    size = Number($('artSize').value);
    pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        pixels.set(
          source.slice(
            (Math.floor((y * old) / size) * old + Math.floor((x * old) / size)) * 4,
            (Math.floor((y * old) / size) * old + Math.floor((x * old) / size)) * 4 + 4,
          ),
          (y * size + x) * 4,
        );
    cursor = [0, 0];
    draw();
  };
  function emoji() {
    const value = $('artEmoji').value.trim();
    if (!value) throw Error('Enter an emoji first.');
    generation++;
    checkpoint();
    const source = document.createElement('canvas');
    source.width = source.height = 512;
    const c = source.getContext('2d');
    c.clearRect(0, 0, 512, 512);
    c.save();
    c.translate(256, 256);
    c.rotate((Number($('emojiRotation').value) * Math.PI) / 180);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font =
      Math.round(410 * Number($('emojiScale').value)) +
      'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.fillStyle = $('artColor').value;
    c.fillText(value, 0, 22);
    c.restore();
    const small = document.createElement('canvas');
    small.width = small.height = size;
    const s = small.getContext('2d');
    s.imageSmoothingEnabled = true;
    s.imageSmoothingQuality = 'high';
    s.drawImage(source, 0, 0, size, size);
    pixels = s.getImageData(0, 0, size, size).data;
    if ($('emojiColor').value === 'paint') {
      const color = $('artColor').value,
        r = parseInt(color.slice(1, 3), 16),
        g = parseInt(color.slice(3, 5), 16),
        b = parseInt(color.slice(5, 7), 16),
        next = new Uint8ClampedArray(pixels);
      for (let i = 0; i < next.length; i += 4)
        if (next[i + 3] > 16) {
          next[i] = r;
          next[i + 1] = g;
          next[i + 2] = b;
        }
      pixels = next;
    }
    draw();
    say('Emoji rasterized locally. Choose filled, outline or RGB conversion, then launch.');
  }
  $('renderEmoji').onclick = guard(emoji);
  for (const button of panel.querySelectorAll('[data-emoji]'))
    button.onclick = guard(() => {
      $('artEmoji').value = button.dataset.emoji;
      emoji();
    });
  for (const id of ['artMode', 'artColor', 'artThreshold']) $(id).addEventListener('input', draw);
  $('artFile').onchange = guard(async () => {
    const file = $('artFile').files?.[0];
    if (!file) return;
    const request = ++generation;
    let url;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error('Choose an image under 20 MB.');
      if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type))
        throw Error('Use PNG, JPEG, WebP, GIF or BMP.');
      url = URL.createObjectURL(file);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error('This image could not be decoded. Try PNG or JPEG.'));
        image.src = url;
      });
      if (request !== generation) return;
      if (image.width > 8192 || image.height > 8192)
        throw Error('Use an image under 8192 pixels per side.');
      const small = document.createElement('canvas');
      small.width = small.height = size;
      const c = small.getContext('2d'),
        scale = Math.min(size / image.width, size / image.height),
        w = image.width * scale,
        h = image.height * scale;
      c.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
      checkpoint();
      pixels = c.getImageData(0, 0, size, size).data;
      draw();
      say('Image converted locally. Adjust conversion and threshold, then launch.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      $('artFile').value = '';
    }
  });
  function restore(raw) {
    const value = validateArt(raw);
    if (!value) throw Error('No art saved yet.');
    checkpoint();
    size = Math.max(value.columns, value.rows);
    pixels = new Uint8ClampedArray(size * size * 4);
    for (const [x, y, color] of value.points) {
      const i = (y * size + x) * 4;
      pixels.set(
        [
          parseInt(color.slice(1, 3), 16),
          parseInt(color.slice(3, 5), 16),
          parseInt(color.slice(5, 7), 16),
          255,
        ],
        i,
      );
    }
    $('artSize').value = size;
    $('artMode').value = 'rgb';
    $('artThreshold').value = 0;
    draw();
  }
  $('saveArt').onclick = guard(() => {
    localStorage.setItem('fleetcommander.art.v1', JSON.stringify(art()));
    say('Art saved on this device.');
  });
  $('loadArt').onclick = guard(() =>
    restore(JSON.parse(localStorage.getItem('fleetcommander.art.v1') || 'null')),
  );
  $('exportArt').onclick = guard(() => downloadJSON(art(), 'fleet-light-art.json'));
  $('importArt').onchange = guard(async () => {
    try {
      const file = $('importArt').files?.[0];
      if (!file) return;
      if (file.size > 512000) throw Error('Art files must be under 500 KB.');
      restore(JSON.parse(await file.text()));
    } finally {
      $('importArt').value = '';
    }
  });
  $('launchArt').onclick = guard(() => {
    requireFreeRoster();
    const result = art();
    if (!result.points.length) throw Error('Paint or import some lit pixels first.');
    let fleet = sim.snapshot();
    if ($('artExact').checked) {
      const fresh = createCommanderFleet(result.points.length);
      fresh.options = { ...fleet.options };
      fresh.program.settings.song = fleet.program.settings.song;
      fresh.program.settings.bpm = fleet.program.settings.bpm;
      fresh.program.music = fleet.program.music;
      fleet = fresh;
    }
    if (!fleet.roster.length) throw Error('Build a fleet or select one drone per pixel.');
    fleet.program.art = result;
    fleet.program.mode = 'manual';
    fleet.program.ids = fleet.roster.map((d) => d.id);
    fleet.program.settings = {
      ...fleet.program.settings,
      ...clearProgramEffects({}),
      shape: 'pixels',
      origin: 'fixed',
      plane: 'sky',
      scale: 1,
      rotation: 0,
      height: 70,
      moveX: 0,
      moveZ: -35,
      trace: false,
      sequenceEnabled: false,
      morph: 5,
    };
    sim.apply(fleet);
    sim.launch();
    populate();
    document.getElementById('view').value = 'front';
    renderer.setView('front');
    renderer.distance = Math.max(100, size * 4.5);
    say(
      'Art launched · ' +
        result.points.length +
        ' pixels mapped across ' +
        sim.drones.length +
        ' drones.',
    );
    draw();
  });
  draw();
  return { refresh: draw };
}
