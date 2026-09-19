import {
  PLANETS,
  FRAME_MATERIALS,
  labSettings,
  massLedger,
  energyBudget,
} from './planet-physics.js?v=0.9.0';
import { ReplayBuffer, replayScene, validateReplay } from './replay-buffer.js?v=0.9.0';
import { SCENARIO_NAMES, journalData, recommendScenario } from './scenario-journal.js?v=0.9.0';
import { validateCommanderFleet } from './fleet-commander-core.js?v=0.9.0';

/**
 * ELI5: This module builds the Lab and Replay menus. It joins planet/mass/energy
 * settings, the pose-replay buffer, and the scenario journal to visible controls.
 * Playback reads copied frames and pauses the live world instead of editing it.
 */

const download = (name, value) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};
// ELI5: 0.125=⅛ speed, 0.25=¼, 0.5=half, 1=normal, and 2=double speed.
export const REPLAY_SPEEDS = Object.freeze([0.125, 0.25, 0.5, 1, 2]);
export function replayPlaybackRate(base, position, eventAt, smart = true) {
  const rate = REPLAY_SPEEDS.includes(Number(base)) ? Number(base) : 0.25;
  return smart && Math.abs(position - eventAt) < 0.8 ? Math.min(rate, 0.125) : rate;
}

export function mountSimulationLab({ sim, renderer, arena, say, guard, requireFreeRoster }) {
  const $ = (id) => document.getElementById(id),
    panels = document.querySelector('.panel-scroll'),
    replays = new ReplayBuffer();
  let playing = null,
    position = 0,
    replayRunning = true,
    previous = null,
    clipSignature = '',
    seenRound = '',
    journal;
  sim.lab = labSettings(load('fleetcommander.lab.v1', {}));
  try {
    journal = journalData(load('fleetcommander.journal.v1', null));
  } catch {
    journal = journalData(null);
  }
  const add = (id, html) => {
    const section = document.createElement('section');
    section.id = 'tab-' + id;
    section.className = 'tab-panel';
    section.hidden = true;
    section.innerHTML = html;
    panels.append(section);
    return section;
  };
  const options = (o) =>
    Object.entries(o)
      .map(([key, v]) => `<option value="${key}">${v.name || v}</option>`)
      .join('');
  add(
    'simulation',
    `<div class="section-heading"><span class="eyebrow">ENVIRONMENT / COMPONENTS</span><h2>Physics & energy.</h2><p>Choose a world. Inspect mass, weight and battery energy in named units.</p></div>
 <fieldset id="labSettings" class="lab-fieldset"><label>Planet<select id="labPlanet">${options(PLANETS)}</select></label><label>Flight model<select id="labRotor"><option value="arcade">Arcade lift · playable on every world</option><option value="constrained">Constrained Earth-style rotors</option></select></label><p id="planetNote" class="lab-note"></p><div id="planetFacts" class="lab-facts"></div>
 <details><summary>Mass & material ledger</summary><p class="hint">Illustrative component masses for one virtual quad. Material names describe the parts; no structural or thermal analysis is performed.</p><label>Frame material<select id="labMaterial">${options(FRAME_MATERIALS)}</select></label><div class="form-row"><label>Battery assembly (kg)<input id="labBatteryMass" type="number" min="0.05" max="5" step="0.01"></label><label>Inert cargo (kg)<input id="labCargo" type="number" min="0" max="10" step="0.05"></label></div><table class="material-table"><thead><tr><th>Component / material</th><th>Mass</th></tr></thead><tbody id="materialRows"></tbody></table></details>
 <details><summary>Battery energy accounting</summary><label class="check"><input id="labEnergy" type="checkbox">Use energy ledger in free flight</label><label>Battery energy (Wh)<input id="labWh" type="number" min="1" max="2000" step="1"></label><div class="form-row"><label>Baseline flight draw (W)<input id="labWatts" type="number" min="1" max="5000" step="1"></label><label>Electronics draw (W)<input id="labElectronics" type="number" min="0" max="200" step="1"></label></div><p class="hint">Enter measured values for a non-combat endurance experiment. Defaults are examples. Movement adds a game load multiplier; temperature, voltage sag and propeller aerodynamics are not modeled.</p><p class="hint">Arena damage and battery rules remain game abstractions. Component settings apply to free flight.</p></details><button id="applyLab" class="primary wide">Apply simulation settings</button></fieldset>
 <div id="energyFacts" class="lab-facts"></div><p id="labStatus" class="hint" role="status"></p><button id="exportLab" class="wide">Export component ledger</button>
 <details><summary>Visual effects & sources</summary><p class="hint">This build uses bounded debris meshes, smoke, sparks, shock rings and impact lights. Fragments are cosmetic and do not cause additional damage.</p><p class="hint"><a href="https://kenney.nl/assets/particle-pack" target="_blank" rel="noopener">Kenney Particle Pack · CC0</a><br><a href="https://github.com/effekseer/EffekseerForWebGL" target="_blank" rel="noopener">Effekseer for WebGL · MIT</a></p><p class="hint">Packages reviewed; not bundled in this build. Planet constants: <a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html" target="_blank" rel="noopener">NASA Moon</a> / <a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html" target="_blank" rel="noopener">NASA Mars</a>.</p></details>`,
  );
  add(
    'replays',
    `<div class="section-heading"><span class="eyebrow">🎬 HIGHLIGHT REEL</span><h2>Catch that moment.</h2><p>Impacts, disabled aircraft, best fights, last stands and close calls—with event-focused slow motion.</p></div><label class="check"><input id="autoHighlights" type="checkbox" checked>Capture highlights automatically</label><button id="saveRecentReplay" class="primary wide">Keep the last 8 seconds</button><p id="replayStatus" class="hint" role="status">Start an arena battle to fill the 18-second rolling buffer.</p><div id="replayControls" hidden><label>Replay timeline<input id="replayScrub" type="range" min="0" max="8" step="0.02" value="0"></label><div class="form-row"><label>Playback speed<select id="replaySpeed"><option value="0.125">⅛ speed</option><option value="0.25" selected>¼ speed</option><option value="0.5">½ speed</option><option value="1">Normal speed</option><option value="2">2× review</option></select></label><label>Replay camera<select id="replayCamera"><option value="combat">Cinematic action</option><option value="bestfight">Best fight</option><option value="survivor">Longest survivor</option><option value="orbit">Overview</option><option value="front">Side view</option><option value="shoulder">Shoulder</option><option value="fpv">Onboard FPV</option></select></label></div><label class="check"><input id="smartSlowmo" type="checkbox" checked>Ramp to ⅛ speed around the captured event</label><button id="exportReplay" class="wide">Export this replay</button></div><div id="replayList" class="replay-list"></div><p class="hint">Up to 6 highlights remain in this session. Export a replay to keep it or transfer it. Playback pauses the live arena and never changes its aircraft.</p><label class="file-label">Import replay<input id="importReplay" type="file" accept=".json,application/json"></label>`,
  );
  add(
    'memory',
    `<div class="section-heading"><span class="eyebrow">SCENARIO JOURNAL</span><h2>Remember each round.</h2><p>Results and your ratings guide the next game scenario.</p></div><p class="lab-note">A preference and variety recommender. It does not train aircraft control, targeting or real-world tactics.</p><label class="check"><input id="adaptiveScenarios" type="checkbox">Use recommendation on Start AI battle</label><p id="scenarioRecommendation" class="director-readout"></p><button id="applyRecommendation" class="wide">Load recommended scenario</button><div class="form-row"><button id="rateRoundUp">More like last round</button><button id="rateRoundDown">Less like last round</button></div><p id="journalStatus" class="hint" role="status"></p><div class="form-row"><button id="exportJournal">Export journal</button><button id="resetJournal">Clear journal</button></div><label class="file-label">Import journal<input id="importJournal" type="file" accept=".json,application/json"></label><div id="journalRounds"></div>`,
  );
  const badge = document.createElement('div');
  badge.className = 'planet-badge';
  document.querySelector('.field-wrap').append(badge);
  const overlay = document.createElement('div');
  overlay.className = 'replay-overlay';
  overlay.hidden = true;
  overlay.innerHTML =
    '<b id="replayLabel">REPLAY</b><button id="pauseReplay">Pause replay</button><button id="exitReplay">Back to live</button>';
  document.querySelector('.field-wrap').append(overlay);
  const fieldMap = {
    planet: 'labPlanet',
    rotorMode: 'labRotor',
    material: 'labMaterial',
    batteryMass: 'labBatteryMass',
    cargoMass: 'labCargo',
    batteryWh: 'labWh',
    flightWatts: 'labWatts',
    electronicsWatts: 'labElectronics',
  };
  function writeSettings() {
    for (const [key, id] of Object.entries(fieldMap)) $(id).value = sim.lab[key];
    $('labEnergy').checked = sim.lab.energyModel;
  }
  function scenery(planet) {
    const p = PLANETS[planet];
    if (planet === 'earth') renderer.setEnvironment?.($('scenery').value, $('sky').value);
    else renderer.setEnvironment?.(p.scenery, p.sky);
    if (renderer.weather) {
      renderer.weather.setWorld?.(planet);
      renderer.weather.flash = 0;
    }
    badge.textContent = p.name.toUpperCase() + ' · ' + p.gravity + ' m/s²';
  }
  function budget() {
    const p = PLANETS[sim.lab.planet],
      b = energyBudget(sim.lab);
    $('planetNote').textContent = p.note;
    $('planetNote').classList.toggle('warning', sim.lab.planet !== 'earth');
    $('planetFacts').innerHTML =
      `<div><strong>${p.gravity}</strong><small>Gravity · m/s²</small></div><div><strong>${p.density}</strong><small>Air density · kg/m³</small></div>`;
    $('materialRows').replaceChildren(
      ...massLedger(sim.lab).map((r) => {
        const tr = document.createElement('tr'),
          name = document.createElement('td'),
          kg = document.createElement('td'),
          small = document.createElement('small');
        name.textContent = r.name;
        small.textContent = r.material;
        name.append(small);
        kg.textContent = (r.kg * 1000).toFixed(0) + ' g';
        tr.append(name, kg);
        return tr;
      }),
    );
    $('energyFacts').innerHTML =
      `<div><strong>${b.mass.toFixed(3)} kg</strong><small>Total mass / virtual quad</small></div><div><strong>${b.weight.toFixed(2)} N</strong><small>Weight on ${p.name}</small></div><div><strong>${b.watts.toFixed(0)} W</strong><small>Baseline total power</small></div><div><strong>${b.minutes.toFixed(1)} min</strong><small>Constant-draw energy budget</small></div>`;
  }
  $('applyLab').addEventListener(
    'click',
    guard(() => {
      requireFreeRoster();
      if (playing) throw Error('Return to live before changing the world.');
      const raw = { energyModel: $('labEnergy').checked };
      for (const [key, id] of Object.entries(fieldMap)) {
        raw[key] = ['planet', 'rotorMode', 'material'].includes(key)
          ? $(id).value
          : Number($(id).value);
        if ($(id).type === 'number' && !$(id).checkValidity())
          throw Error('Check the range for ' + $(id).closest('label').textContent.trim() + '.');
      }
      sim.lab = labSettings(raw);
      writeSettings();
      budget();
      scenery(sim.lab.planet);
      try {
        localStorage.setItem('fleetcommander.lab.v1', JSON.stringify(sim.lab));
      } catch {
        say('Settings applied, but this browser could not save them.', true);
        return;
      }
      say(
        PLANETS[sim.lab.planet].name +
          ' applied · ' +
          (sim.lab.rotorMode === 'arcade' ? 'arcade lift' : 'constrained rotor flight') +
          '.',
      );
    }),
  );
  $('exportLab').addEventListener('click', () =>
    download('fleet-commander-component-ledger.json', {
      kind: 'fleetcommander-component-ledger',
      version: 1,
      settings: sim.lab,
      components: massLedger(sim.lab),
      budget: energyBudget(sim.lab),
      units: { mass: 'kg', weight: 'N', energy: 'Wh', power: 'W' },
      model:
        'Illustrative non-combat game ledger; constant-draw endurance is not predicted flight endurance.',
    }),
  );
  // Director scenery controls keep their own settings; planet scenes override them
  // while a non-Earth world is selected.
  for (const id of ['scenery', 'sky', 'applyGraphics', 'lightingPreset', 'resetLighting'])
    $(id)?.addEventListener('change', () => {
      if (sim.lab.planet !== 'earth') scenery(sim.lab.planet);
    });
  $('applyGraphics')?.addEventListener('click', () => {
    if (sim.lab.planet !== 'earth') scenery(sim.lab.planet);
  });
  function persistJournal() {
    try {
      localStorage.setItem('fleetcommander.journal.v1', JSON.stringify(journal));
      $('journalStatus').textContent =
        journal.rounds.length + ' completed rounds saved on this browser.';
    } catch {
      $('journalStatus').textContent =
        'Browser storage unavailable. Export the journal to keep it.';
    }
  }
  function journalUI() {
    const rec = recommendScenario(journal);
    $('scenarioRecommendation').textContent = SCENARIO_NAMES[rec.key] + ' · ' + rec.reason;
    $('rateRoundUp').disabled = $('rateRoundDown').disabled = !journal.rounds.length;
    $('journalRounds').replaceChildren(
      ...journal.rounds
        .slice(-12)
        .reverse()
        .map((r) => {
          const el = document.createElement('div');
          el.className = 'journal-row';
          const title = document.createElement('strong'),
            small = document.createElement('small');
          title.textContent =
            (SCENARIO_NAMES[r.preset] || 'Custom battle') + ' · ' + Math.round(r.seconds) + ' s';
          small.textContent =
            r.result +
            ' · ' +
            r.planet +
            ' · ' +
            r.friendly +
            ' / ' +
            r.enemy +
            ' flying' +
            (r.rating ? ' · ' + (r.rating > 0 ? 'liked' : 'less preferred') : '');
          el.append(title, small);
          return el;
        }),
    );
    persistJournal();
  }
  function recommend() {
    const rec = recommendScenario(journal);
    $('battlePreset').value = rec.key;
    $('battlePreset').dispatchEvent(new Event('change', { bubbles: true }));
    return rec;
  }
  $('applyRecommendation').addEventListener('click', () => {
    if (sim.combat.enabled) {
      say('Exit the current battle to load another scenario.');
      return;
    }
    const rec = recommend();
    say(SCENARIO_NAMES[rec.key] + ' loaded. Open Arena and Start AI battle.');
  });
  const chooseNext = () => {
    if ($('adaptiveScenarios').checked) recommend();
  };
  $('startAIBattle').addEventListener('click', chooseNext, true);
  $('adaptiveScenarios').checked = load('fleetcommander.recommend.v1', false) === true;
  $('adaptiveScenarios').addEventListener('change', () => {
    try {
      localStorage.setItem(
        'fleetcommander.recommend.v1',
        JSON.stringify($('adaptiveScenarios').checked),
      );
    } catch {}
  });
  for (const [id, rating] of [
    ['rateRoundUp', 1],
    ['rateRoundDown', -1],
  ])
    $(id).addEventListener('click', () => {
      if (journal.rounds.length) {
        journal.rounds.at(-1).rating = rating;
        journalUI();
      }
    });
  $('exportJournal').addEventListener('click', () =>
    download('fleet-commander-journal.json', journal),
  );
  let clearArmed = false;
  $('resetJournal').addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      $('resetJournal').textContent = 'Confirm clear';
      setTimeout(() => {
        clearArmed = false;
        $('resetJournal').textContent = 'Clear journal';
      }, 4000);
      return;
    }
    journal = journalData(null);
    journalUI();
    clearArmed = false;
    $('resetJournal').textContent = 'Clear journal';
  });
  $('importJournal').addEventListener(
    'change',
    guard(async (e) => {
      try {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 150000) throw Error('Journal must be smaller than 150 KB.');
        const imported = journalData(JSON.parse(await file.text()));
        journal = journalData({
          kind: 'fleetcommander-journal',
          rounds: [
            ...new Map([...journal.rounds, ...imported.rounds].map((r) => [r.id, r])).values(),
          ].slice(-100),
        });
        journalUI();
        say('Journal imported and merged.');
      } finally {
        e.target.value = '';
      }
    }),
  );
  function clipList() {
    const signature = replays.clips.map((c) => c.id + ':' + c.label).join('|');
    if (signature === clipSignature) return;
    clipSignature = signature;
    $('replayList').replaceChildren(
      ...replays.clips.map((c) => {
        const el = document.createElement('div');
        el.className = 'replay-card';
        const title = document.createElement('strong'),
          small = document.createElement('small'),
          actions = document.createElement('div'),
          watch = document.createElement('button'),
          slow = document.createElement('button');
        title.textContent = c.label;
        small.textContent =
          (c.end - c.start).toFixed(1) +
          ' seconds · ' +
          c.context.planet +
          ' · ' +
          c.frames[0].drones.length +
          ' aircraft';
        watch.textContent = 'Watch';
        slow.textContent = 'Slow-mo';
        watch.addEventListener('click', () => play(c));
        slow.addEventListener('click', () => play(c, true));
        actions.className = 'replay-actions';
        actions.append(watch, slow);
        el.append(title, actions, small);
        return el;
      }),
    );
  }
  const inertTargets = () => [
    ...document.querySelectorAll('.tab-panel:not(#tab-replays),.toolbar-actions,.command-deck'),
  ];
  function play(c, slow = false) {
    if (playing) stop();
    previous = {
      running: sim.running,
      view: renderer.view,
      selected: renderer.selected,
      environment: [renderer.environment?.scenery, renderer.environment?.sky],
    };
    sim.running = false;
    playing = c;
    position = 0;
    replayRunning = true;
    arena.silence();
    renderer.battleEffects?.reset?.();
    renderer.selected = c.subject;
    const camera = renderer.renderer ? 'combat' : 'front';
    renderer.setView(camera);
    $('replayCamera').value = camera;
    $('replaySpeed').value = slow ? '0.125' : '0.25';
    $('smartSlowmo').checked = true;
    $('replayScrub').max = c.end - c.start;
    $('replayControls').hidden = false;
    overlay.hidden = false;
    $('pauseReplay').textContent = 'Pause replay';
    for (const el of inertTargets()) el.inert = true;
    $('view').disabled = true;
    renderer.host.style.pointerEvents = 'none';
    scenery(c.context.planet || 'earth');
  }
  function stop() {
    if (!playing) return;
    playing = null;
    sim.running = previous.running;
    renderer.selected = previous.selected;
    renderer.setView(previous.view);
    renderer.battleEffects?.reset?.();
    for (const el of inertTargets()) el.inert = false;
    $('view').disabled = false;
    renderer.host.style.pointerEvents = '';
    overlay.hidden = true;
    $('replayControls').hidden = true;
    scenery(sim.lab.planet);
    if (previous.environment[0]) renderer.setEnvironment?.(...previous.environment);
    previous = null;
    say('Back to the live arena.');
  }
  $('exitReplay').addEventListener('click', stop);
  $('pauseReplay').addEventListener('click', () => {
    replayRunning = !replayRunning;
    $('pauseReplay').textContent = replayRunning ? 'Pause replay' : 'Resume replay';
  });
  $('replayScrub').addEventListener('input', () => {
    position = Number($('replayScrub').value);
    renderer.battleEffects?.reset?.();
    replayRunning = false;
    $('pauseReplay').textContent = 'Resume replay';
  });
  $('replayCamera').addEventListener('change', () => renderer.setView($('replayCamera').value));
  if (!renderer.renderer)
    for (const o of $('replayCamera').options)
      if (['shoulder', 'fpv', 'combat', 'bestfight', 'survivor'].includes(o.value))
        o.disabled = true;
  $('autoHighlights').addEventListener(
    'change',
    () => (replays.auto = $('autoHighlights').checked),
  );
  $('saveRecentReplay').addEventListener('click', () => {
    if (replays.captureRecent(sim)) {
      clipList();
      say('Recent action kept in Replays.');
    } else say('Run an arena battle for a few seconds first.');
  });
  $('exportReplay').addEventListener('click', () => {
    if (playing)
      download('fleet-commander-replay-' + playing.id + '.json', {
        kind: 'fleetcommander-replay',
        version: 1,
        clip: playing,
      });
  });
  $('importReplay').addEventListener(
    'change',
    guard(async (e) => {
      try {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 12000000) throw Error('Replay must be smaller than 12 MB.');
        const c = validateReplay(JSON.parse(await file.text()));
        c.context.fleet = validateCommanderFleet(c.context.fleet);
        c.context.program = c.context.fleet.program;
        c.context.lab = labSettings(c.context.lab);
        c.context.planet = c.context.lab.planet;
        c.id = ++replays.sequence;
        replays.clips.unshift(c);
        replays.clips = replays.clips.slice(0, 6);
        clipList();
        say('Replay imported.');
      } finally {
        e.target.value = '';
      }
    }),
  );
  function tick() {
    if (playing) return;
    replays.sample(sim);
    clipList();
    const c = sim.combat;
    if (c.enabled && c.winner && seenRound !== String(c.generation)) {
      seenRound = String(c.generation);
      const s = c.summary();
      journal.rounds.push({
        id: Date.now() + '-' + c.generation,
        preset: $('battlePreset').value,
        seconds: c.battleTime,
        friendly: s.friendly,
        enemy: s.enemy,
        result: c.winner,
        planet: sim.lab.planet,
        rating: 0,
      });
      journal.rounds = journal.rounds.slice(-100);
      journalUI();
    }
  }
  function renderScene(dt) {
    if (!playing) return sim;
    const base = Number($('replaySpeed').value),
      eventAt = Number.isFinite(playing.time)
        ? playing.time - playing.start
        : (playing.end - playing.start) * 0.65,
      speed = replayPlaybackRate(base, position, eventAt, $('smartSlowmo').checked);
    if (replayRunning) {
      position += dt * speed;
      if (position >= playing.end - playing.start) {
        position = playing.end - playing.start;
        replayRunning = false;
        $('pauseReplay').textContent = 'Resume replay';
      }
    }
    $('replayScrub').value = position;
    $('replayLabel').textContent =
      'SLOW-MO REPLAY · ' +
      speed +
      '× · ' +
      position.toFixed(1) +
      ' / ' +
      (playing.end - playing.start).toFixed(1) +
      ' s';
    const scene = replayScene(playing, position, sim);
    scene.running = replayRunning;
    return scene;
  }
  function update() {
    const busy =
      sim.combat.enabled || sim.combat.loading || (!!sim.challenge && !sim.challenge.finished);
    $('labSettings').disabled = busy;
    $('labStatus').textContent = busy
      ? 'Exit combat or the scored exercise to change simulation settings.'
      : sim.lab.energyModel
        ? 'Energy ledger active in free flight · ' + sim.fleet.options.batteryDrain + '× drain.'
        : 'Classic game battery drain active. Enable the energy ledger for Wh accounting.';
    $('replayStatus').textContent = playing
      ? 'Playback pauses live physics.'
      : 'Buffer: ' +
        (replays.frames.length / 10).toFixed(1) +
        ' / 18 seconds · ' +
        replays.clips.length +
        ' highlights' +
        (replays.pending.length ? ' · collecting post-event action' : '');
  }
  writeSettings();
  budget();
  scenery(sim.lab.planet);
  journalUI();
  update();
  return {
    tick,
    update,
    renderScene,
    get replaying() {
      return !!playing;
    },
    dispose() {
      stop();
      $('startAIBattle').removeEventListener('click', chooseNext, true);
    },
  };
}
