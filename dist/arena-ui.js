import { CombatSimulation, BATTLE_FORMATIONS } from './combat-simulation.js?v=0.9.0';
import { COMBAT_PRESETS, COMBAT_TACTICS, combatSettings } from './combat-ai.js?v=0.9.0';
import { FPV_DEFAULTS, fpvSettings } from './director-camera.js?v=0.9.0';
import { createCommanderFleet } from './fleet-commander-core.js?v=0.9.0';
import { ArenaAudio } from './arena-audio.js?v=0.9.0';
import { mountPlaybook } from './battle-playbook.js?v=0.9.0';
import { DRONE_VIEWS } from './director-camera.js?v=0.9.0';
import { ArenaWeather, WEATHER_PRESETS } from './arena-weather.js?v=0.9.0';

/**
 * ELI5: This module wires the Combat menu to the combat simulation, game AI,
 * weather, FPV settings, sound, and coach playbook. It translates HTML values
 * into validated settings; the actual collision/damage math lives elsewhere.
 */

export function mountArena({ sim, renderer, say, guard, populate, getSelected }) {
  const ownedWeather = !renderer.weather,
    $ = (id) => document.getElementById(id),
    combat = new CombatSimulation(sim),
    audio = new ArenaAudio(),
    weather = renderer.weather || (renderer.weather = new ArenaWeather());
  sim.weather = weather;
  let busy = false,
    round = 1,
    roster = null,
    audioMessage = '',
    disposed = false;
  const entries = (values) =>
    Object.entries(values)
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join('');
  const option = (select, value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    select.append(o);
  };
  const range = (id, label, min, max, step, value) =>
    `<label class="tuning-control" for="${id}"><span>${label}<output id="${id}Value"></output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  const combatFields = {
    speed: 'combatSpeed',
    damage: 'combatDamage',
    aggression: 'combatAggression',
    evasion: 'combatEvasion',
    reaction: 'combatReaction',
    retreatHealth: 'combatRetreat',
    payloadCooldown: 'payloadInterval',
    roundSeconds: 'roundSeconds',
  };
  const fpvFields = {
    fov: 'fpvFov',
    sensitivity: 'fpvSensitivity',
    stabilization: 'fpvStabilization',
    smoothing: 'fpvSmoothing',
    tilt: 'fpvTilt',
  };
  const weatherFields = {
    rain: 'weatherRain',
    windSpeed: 'weatherWind',
    windDirection: 'weatherDirection',
    gust: 'weatherGust',
    clouds: 'weatherClouds',
    fog: 'weatherFog',
    lightning: 'weatherLightning',
    flashBrightness: 'weatherFlash',
    screenFx: 'weatherScreen',
    visualFx: 'weatherVisual',
    physicsFx: 'weatherPhysics',
    audioFx: 'weatherAudio',
    viscosity: 'weatherViscosity',
  };
  option($('view'), 'free', 'Free camera');
  option($('sky'), 'blackout', 'Pitch black · moon & stars');
  for (const [key, label] of [
    ['shoulder', 'Shoulder / isometric'],
    ['mounted', 'Top-mounted · airframe visible'],
    ['combat', 'Cinematic action camera'],
    ['bestfight', 'Best fight camera'],
    ['survivor', 'Longest survivor camera'],
  ])
    option($('view'), key, label);
  const panel = document.createElement('section');
  panel.id = 'tab-combat';
  panel.className = 'tab-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="section-heading"><span class="eyebrow">AUTONOMOUS DRONE ARENA</span><h2>AI combat lab.</h2><p>Pick a battle. Both sides fly, choose targets and fight automatically.</p></div>
 <div class="ai-launch"><label>Battle preset<select id="battlePreset">${entries(Object.fromEntries(Object.entries(COMBAT_PRESETS).map(([key, p]) => [key, p.name])))}<option value="custom">Custom settings</option></select></label><p id="battleDescription" class="hint"></p>
 <div class="form-row"><label>Aircraft · next battle<input id="battleCount" type="number" min="2" max="256" step="1" value="24"></label><label>Start camera<select id="battleCamera"><option value="orbit">Overview</option><option value="fpv">Onboard FPV</option><option value="cinematic">Cinematic</option></select></label></div>
 <button id="startAIBattle" class="primary wide">Start AI battle</button><div class="form-row"><label class="check"><input id="battleSound" type="checkbox" checked>Sound on start</label><label class="check"><input id="repeatBattle" type="checkbox">Repeat rounds</label></div></div>
 <div class="battle-score" role="status"><span>FRIENDLY <b id="friendlyAlive">—</b></span><span>HOSTILE <b id="enemyAlive">—</b></span></div><p id="combatStatus" class="director-readout" role="status"></p>
 <div class="form-row"><button id="engageCombat">Engage / resume AI</button><button id="ceaseCombat">Cease fire / reform</button></div>
 <label>Combat aircraft<select id="combatDrone"></select></label><p id="combatAircraft" class="director-readout"></p>
 <div class="form-row"><button id="watchCombat">Watch selected FPV</button><button id="nextCombatDrone">Next live drone</button></div><button id="dropPayload" class="wide">Drop payload · B</button>
 <details id="combatTuning"><summary>Combat tuning · changes apply live</summary><div class="form-row"><label>Friendly AI<select id="friendlyTactic">${entries(COMBAT_TACTICS)}</select></label><label>Hostile AI<select id="enemyTactic">${entries(COMBAT_TACTICS)}</select></label></div><div class="form-row"><label>Friendly formation<select id="friendlyFormation">${entries(BATTLE_FORMATIONS)}</select></label><label>Hostile formation<select id="enemyFormation">${entries(BATTLE_FORMATIONS)}</select></label></div>
 ${range('combatSpeed', 'Flight speed', 0.4, 1.6, 0.05, 1)}${range('combatDamage', 'Collision / blast damage', 0, 2, 0.05, 1)}${range('combatAggression', 'Attack commitment', 0, 1, 0.05, 0.65)}${range('combatEvasion', 'Evasion', 0, 1, 0.05, 0.35)}${range('combatReaction', 'Decision interval', 0.15, 1.5, 0.05, 0.4)}${range('combatRetreat', 'Retreat below hull', 0, 60, 5, 15)}${range('payloadInterval', 'Payload cooldown', 1, 10, 0.5, 3.5)}
 <label>Round time limit<select id="roundSeconds"><option value="60">1 minute</option><option value="120" selected>2 minutes</option><option value="300">5 minutes</option><option value="0">No time limit</option></select></label><label class="check"><input id="autoPayloads" type="checkbox" checked>Automatic payload runs</label><label class="check"><input id="friendlyBlast" type="checkbox">Friendly blast damage</label>
 <p class="hint">0× damage keeps collision forces but disables impact/blast damage. Battery failure still applies. Retreat 0% disables damage retreat. Faction tactics are independent; formations are used before combat and during cease fire.</p></details>
 <details id="fpvTuning"><summary>FPV tuning & auto camera</summary><label>FPV feel<select id="fpvPreset"><option value="balanced">Balanced</option><option value="comfort">Comfort · level horizon</option><option value="airframe">Airframe · full roll</option><option value="custom">Custom</option></select></label>
 ${range('fpvFov', 'Field of view', 50, 115, 1, 88)}${range('fpvSensitivity', 'Look sensitivity', 0.25, 2.5, 0.05, 1)}${range('fpvStabilization', 'Horizon stabilization', 0, 1, 0.05, 0.65)}${range('fpvSmoothing', 'Rotation smoothing', 0, 0.4, 0.01, 0.08)}${range('fpvTilt', 'Camera tilt', -20, 30, 1, 0)}
 <label>Camera faction<select id="cameraFaction"><option value="any">Either side</option><option value="friendly">Friendlies only</option><option value="enemy">Hostiles only</option></select></label><label class="check"><input id="autoFPV" type="checkbox" checked>Switch to a live drone after a loss</label><button id="recenterFPV" class="wide">Recenter FPV / reset zoom</button><p class="hint">Drag to look, pinch to zoom. AI keeps flying while you watch. Full stabilization holds the horizon; Airframe shows actual roll and tumbles.</p><p id="arenaCameraAvailability" class="hint"></p></details>
 <details><summary>Fleet setup & reset</summary><div class="form-row"><button id="prepareCombat">Prepare current fleet</button><button id="newSkirmish">New 24-drone skirmish</button></div><p class="hint">Prepare stages the formations without engaging. Combat supports 2–256 aircraft. Exit restores your original show setup.</p><div class="form-row"><button id="resetCombat">Reset combat / repair</button><button id="exitCombat">Exit / restore show fleet</button></div><p class="hint">Payloads have ammo and contact detonation. Wrecks remain until reset. Cease fire does not disarm falling payloads. Repeated rounds start after an 8-second break.</p></details>`;
  document.querySelector('.panel-scroll').append(panel);
  const nav = document.createElement('button');
  nav.dataset.tab = 'combat';
  nav.textContent = 'Combat';
  nav.setAttribute('aria-pressed', 'false');
  document.querySelector('.tabs').append(nav);
  for (const [key, label] of [
    ['shoulder', 'Shoulder / isometric'],
    ['mounted', 'Top-mounted'],
    ['combat', 'Cinematic action'],
    ['bestfight', 'Best fight'],
    ['survivor', 'Longest survivor'],
  ])
    option($('battleCamera'), key, label);
  const visuals = document.createElement('details');
  visuals.innerHTML =
    '<summary>🎥 Combat cameras & indicators</summary><div class="camera-buttons"><button data-arena-camera="shoulder">Shoulder / iso</button><button data-arena-camera="mounted">Top mount</button><button data-arena-camera="fpv">Digital FPV</button><button data-arena-camera="combat">Action camera</button><button data-arena-camera="bestfight">Best fight</button><button data-arena-camera="survivor">Longest survivor</button></div><label class="check"><input id="showHealth" type="checkbox" checked>Small hull bars</label><label class="check"><input id="showFPVHud" type="checkbox" checked>Digital flight HUD</label><label class="check"><input id="showDetections" type="checkbox" checked>Target / detection boxes</label><p class="hint">Action follows attacks and crashes. Best Fight frames the strongest opposing pair. Longest Survivor stays with one aircraft until it goes down, then finds the next survivor.</p>';
  panel.append(visuals);
  for (const b of visuals.querySelectorAll('[data-arena-camera]')) {
    b.disabled = !renderer.renderer;
    b.onclick = () => view(b.dataset.arenaCamera);
  }
  for (const [id, key] of [
    ['showHealth', 'health'],
    ['showFPVHud', 'hud'],
    ['showDetections', 'labels'],
  ])
    $(id).onchange = () => {
      if (renderer.combatHUD) renderer.combatHUD[key] = $(id).checked;
    };
  nav.addEventListener('click', () => {
    for (const b of document.querySelectorAll('[data-tab]'))
      b.setAttribute('aria-pressed', String(b === nav));
    for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p !== panel;
  });
  const tools = document.createElement('div');
  tools.className = 'camera-tools';
  tools.innerHTML =
    '<button id="zoomIn" aria-label="Zoom in">＋</button><button id="zoomOut" aria-label="Zoom out">−</button><button id="freeLook">Free look</button><button id="quickFPV">FPV</button><button id="resetCamera">Reset view</button><span>Drag to look · pinch to zoom</span>';
  document.querySelector('.flight-toolbar').after(tools);
  const sound = document.createElement('div');
  sound.className = 'sound-bar';
  sound.innerHTML =
    '<button id="quickSound" aria-pressed="false">Sound off</button><button id="testSound">Test sound</button><meter id="audioMeter" min="0" max="1" value="0" aria-label="Game audio output"></meter><span id="audioStatus" role="status">Tap Sound or start an AI battle.</span>';
  tools.after(sound);
  const teamBar = document.createElement('div');
  teamBar.className = 'team-survival';
  teamBar.hidden = true;
  teamBar.innerHTML =
    '<div><b id="friendlyFlying"></b><small id="friendlyLosses"></small></div><span>VS</span><div><b id="enemyFlying"></b><small id="enemyLosses"></small></div>';
  sound.after(teamBar);
  for (const [key, label] of [
    ['combat', '🎥 Action'],
    ['bestfight', '⚔️ Best fight'],
    ['survivor', '🏆 Survivor'],
  ]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = !renderer.renderer;
    b.onclick = () => view(key);
    tools.insertBefore(b, tools.lastElementChild);
  }
  const hud = document.createElement('div');
  hud.className = 'combat-hud';
  hud.hidden = true;
  hud.innerHTML =
    '<b id="fpvHudTitle"></b><span id="fpvHudState"></span><span id="fpvHudStats"></span>';
  document.querySelector('.field-wrap').append(hud);
  const weatherPanel = document.createElement('details');
  weatherPanel.open = true;
  weatherPanel.innerHTML = `<summary>⛈️ Storm, wind & FPV effects</summary><label>Weather preset<select id="weatherPreset">${entries(Object.fromEntries(Object.entries(WEATHER_PRESETS).map(([key, p]) => [key, p.name])))}<option value="custom" selected>Custom</option></select></label>${range('weatherRain', 'Rain intensity', 0, 1, 0.05, 0)}${range('weatherWind', 'Wind speed · m/s', 0, 35, 1, 0)}<div class="form-row">${range('weatherDirection', 'Wind direction · °', 0, 360, 5, 225)}${range('weatherGust', 'Gust strength · m/s', 0, 25, 1, 0)}</div>${range('weatherClouds', 'Storm cloud cover', 0, 1, 0.05, 0.4)}${range('weatherFog', 'Fog / visibility loss', 0, 1, 0.05, 0.08)}${range('weatherLightning', 'Lightning frequency', 0, 1, 0.05, 0)}${range('weatherFlash', 'Flash brightness', 0, 2, 0.05, 1)}<label class="check"><input id="reduceFlashes" type="checkbox">Reduce lightning flashes</label><button id="strikeLightning" class="wide">Trigger lightning now</button><details><summary>Independent effect strengths</summary>${range('weatherScreen', 'FPV screen effects', 0, 1, 0.05, 0.65)}${range('weatherVisual', 'Environmental visuals', 0, 1, 0.05, 1)}${range('weatherPhysics', 'Flight physics effects', 0, 1, 0.05, 0.65)}${range('weatherAudio', 'Weather audio', 0, 1, 0.05, 0.85)}</details><details><summary>🌪️ Fluid Lab / Navier–Stokes toy</summary><label class="check"><input id="weatherFluid" type="checkbox">Use projected 2D fluid field for wind</label>${range('weatherViscosity', 'Kinematic viscosity control', 0.001, 0.12, 0.001, 0.018)}<p class="hint">Low-resolution educational incompressible flow: advection, diffusion and pressure projection. It is not engineering CFD.</p></details><p id="weatherStatus" class="hint"></p>`;
  const audioPanel = document.createElement('details');
  audioPanel.innerHTML = `<summary>🔊 Audio mix</summary><button id="arenaSound" class="wide" aria-pressed="false">Enable game sound</button><label>Master volume <output id="arenaVolumeValue">55%</output><input id="arenaVolume" type="range" min="0" max="1" step="0.05" value="0.55"></label><label>Drone motors & damage <output id="droneVolumeValue">100%</output><input id="droneVolume" type="range" min="0" max="1.5" step="0.05" value="1"></label><label>Weather <output id="weatherVolumeValue">85%</output><input id="weatherVolume" type="range" min="0" max="1.5" step="0.05" value="0.85"></label><label>Impacts & blasts <output id="effectsVolumeValue">100%</output><input id="effectsVolume" type="range" min="0" max="1.5" step="0.05" value="1"></label><label>Sound perspective<select id="arenaMix"><option value="arena">Arena mix · audible from overview</option><option value="spatial">Camera distance · quieter far away</option></select></label><p class="hint">Motor pitch and weight vary by airframe, RPM/load, motor count, camera distance and hull damage. Wind, rain and thunder use the same live storm settings.</p>`;
  $('tab-director').append(weatherPanel, audioPanel);
  const lift = document.createElement('div');
  lift.className = 'form-row';
  lift.innerHTML =
    '<button data-walk="q">Descend · Q</button><button data-walk="e">Ascend · E</button>';
  document.querySelector('.walk-controls').after(lift);
  function view(mode) {
    if (!renderer.renderer && mode !== 'orbit') return;
    $('view').value = mode;
    $('view').dispatchEvent(new Event('change'));
  }
  function selectDrone(id) {
    if (!id) return;
    $('selectedDrone').value = id;
    $('selectedDrone').dispatchEvent(new Event('change'));
    renderer.selected = id;
    renderer.directorCamera?.recenterFPV?.();
  }
  const subjects = () =>
    sim.drones.filter(
      (d) =>
        d.mode === 'FLY' &&
        (!combat.enabled ||
          $('cameraFaction').value === 'any' ||
          d.combatSide === $('cameraFaction').value),
    );
  function nextSubject() {
    const list = subjects();
    if (!list.length) return;
    const at = list.findIndex((d) => d.id === getSelected());
    selectDrone(list[(at + 1) % list.length].id);
  }
  function watch() {
    const current = sim.drones.find((d) => d.id === getSelected());
    if (
      !current ||
      ['FALLING', 'WRECK'].includes(current.mode) ||
      (combat.enabled && !subjects().includes(current))
    )
      nextSubject();
    view('fpv');
  }
  $('zoomIn').addEventListener('click', () => renderer.zoomBy?.(0.8));
  $('zoomOut').addEventListener('click', () => renderer.zoomBy?.(1.25));
  $('resetCamera').addEventListener('click', () => renderer.resetCamera?.());
  $('freeLook').addEventListener('click', () => view('free'));
  $('quickFPV').addEventListener('click', watch);
  $('watchCombat').addEventListener('click', watch);
  $('nextCombatDrone').addEventListener('click', () => {
    nextSubject();
    update();
  });
  $('recenterFPV').addEventListener('click', () => {
    renderer.directorCamera?.recenterFPV?.();
    renderer.cameraZoom = 1;
  });
  $('cameraFaction').addEventListener('change', () => {
    const current = sim.drones.find((d) => d.id === getSelected());
    if (
      combat.enabled &&
      $('cameraFaction').value !== 'any' &&
      current?.combatSide !== $('cameraFaction').value
    )
      nextSubject();
    savePreferences();
  });
  function labels() {
    for (const [key, id] of Object.entries(combatFields)) {
      const output = $(id + 'Value');
      if (!output) continue;
      const value = combat.settings[key];
      output.textContent = ['speed', 'damage'].includes(key)
        ? value.toFixed(2) + '×'
        : ['aggression', 'evasion'].includes(key)
          ? Math.round(value * 100) + '%'
          : key === 'retreatHealth'
            ? value === 0
              ? 'Off'
              : value + '%'
            : value.toFixed(2) + ' s';
    }
    for (const [key, id] of Object.entries(fpvFields)) {
      const value = Number($(id).value);
      $(id + 'Value').textContent = ['fov', 'tilt'].includes(key)
        ? value + '°'
        : key === 'stabilization'
          ? Math.round(value * 100) + '%'
          : value.toFixed(2) + (key === 'smoothing' ? ' s' : '×');
    }
    weatherLabels();
  }
  function weatherLabels() {
    for (const [key, id] of Object.entries(weatherFields)) {
      const out = $(id + 'Value');
      if (!out) continue;
      const value = Number($(id).value);
      out.textContent =
        key === 'windDirection'
          ? value + '°'
          : key === 'windSpeed' || key === 'gust'
            ? value.toFixed(0) + ' m/s'
            : key === 'viscosity'
              ? value.toFixed(3)
              : key === 'flashBrightness'
                ? value.toFixed(2) + '×'
                : Math.round(value * 100) + '%';
    }
  }
  function writeWeather(settings = weather.settings) {
    for (const [key, id] of Object.entries(weatherFields)) $(id).value = settings[key];
    $('weatherFluid').checked = !!settings.fluidEnabled;
    weatherLabels();
  }
  function applyWeather(persist = true) {
    weather.configure({
      ...Object.fromEntries(
        Object.entries(weatherFields).map(([key, id]) => [key, Number($(id).value)]),
      ),
      fluidEnabled: $('weatherFluid').checked,
    });
    weather.reducedFlashes = $('reduceFlashes').checked;
    weatherLabels();
    if (persist) savePreferences();
  }
  function useWeatherPreset(key, persist = true) {
    const preset = WEATHER_PRESETS[key];
    if (!preset) return;
    weather.configure(preset.settings);
    writeWeather();
    $('weatherPreset').value = key;
    if (persist) savePreferences();
  }
  function applySettings() {
    combat.configure(
      Object.fromEntries(
        Object.entries(combatFields).map(([key, id]) => [key, Number($(id).value)]),
      ),
    );
    labels();
    savePreferences();
  }
  function writeSettings() {
    if (
      ![...$('roundSeconds').options].some((o) => Number(o.value) === combat.settings.roundSeconds)
    )
      combat.settings.roundSeconds = 120;
    for (const [key, id] of Object.entries(combatFields)) $(id).value = combat.settings[key];
    labels();
  }
  function applyFPV() {
    renderer.directorCamera?.configureFPV?.(
      Object.fromEntries(Object.entries(fpvFields).map(([key, id]) => [key, Number($(id).value)])),
    );
    renderer.cameraZoom = 1;
    labels();
    savePreferences();
  }
  function usePreset(key) {
    const p = COMBAT_PRESETS[key];
    if (!p) return;
    combat.settings = combatSettings(p.settings);
    $('battleCount').value = p.count;
    ['friendly', 'enemy'].forEach((side, i) => {
      combat.setTactic(side, p.tactics[i]);
      combat.formations[side] = p.formations[i];
      $(side + 'Tactic').value = p.tactics[i];
      $(side + 'Formation').value = p.formations[i];
    });
    combat.autoPayloads = p.payloads;
    $('autoPayloads').checked = p.payloads;
    $('battleDescription').textContent = p.description;
    writeSettings();
    savePreferences();
  }
  const custom = () => {
    $('battlePreset').value = 'custom';
    $('battleDescription').textContent =
      'Your tactics and tuning apply immediately. Aircraft count changes on the next Start AI battle.';
  };
  $('battlePreset').addEventListener('change', () => usePreset($('battlePreset').value));
  for (const id of Object.values(combatFields))
    $(id).addEventListener(id === 'roundSeconds' ? 'change' : 'input', () => {
      custom();
      applySettings();
    });
  for (const side of ['friendly', 'enemy']) {
    $(side + 'Formation').addEventListener('change', () => {
      combat.formations[side] = $(side + 'Formation').value;
      custom();
      savePreferences();
    });
    $(side + 'Tactic').addEventListener('change', () => {
      combat.setTactic(side, $(side + 'Tactic').value);
      custom();
      savePreferences();
    });
  }
  for (const id of ['autoPayloads', 'friendlyBlast'])
    $(id).addEventListener('change', () => {
      combat.autoPayloads = $('autoPayloads').checked;
      combat.friendlyFire = $('friendlyBlast').checked;
      custom();
      savePreferences();
    });
  for (const id of Object.values(fpvFields))
    $(id).addEventListener('input', () => {
      $('fpvPreset').value = 'custom';
      applyFPV();
    });
  $('fpvPreset').addEventListener('change', () => {
    const presets = {
      balanced: FPV_DEFAULTS,
      comfort: { ...FPV_DEFAULTS, fov: 85, stabilization: 1, smoothing: 0.18, sensitivity: 0.7 },
      airframe: { ...FPV_DEFAULTS, fov: 105, stabilization: 0, smoothing: 0, tilt: 12 },
    };
    const p = presets[$('fpvPreset').value];
    if (p) {
      for (const [key, id] of Object.entries(fpvFields)) $(id).value = p[key];
      applyFPV();
    }
  });
  function soundAction(test = false) {
    audioMessage = '';
    const pending = test ? audio.test() : audio.enable();
    pending
      .then(() => {
        if (disposed) return;
        $('arenaVolume').value = audio.volume;
        updateAudio();
        savePreferences();
      })
      .catch((error) => {
        audioMessage = error.message;
        updateAudio();
        say(error.message, true);
      });
    updateAudio();
    return pending;
  }
  const toggleSound = () => {
    if (audio.state === 'running') {
      audio.mute();
      $('battleSound').checked = false;
      savePreferences();
      updateAudio();
    } else soundAction();
  };
  $('quickSound').addEventListener('click', toggleSound);
  $('arenaSound').addEventListener('click', toggleSound);
  $('testSound').addEventListener('click', () => {
    soundAction(true);
    say(
      'Sound test: two tones. Check media volume and audio output if the meter moves but you hear nothing.',
    );
  });
  $('arenaVolume').addEventListener('input', () => {
    audio.volume = Number($('arenaVolume').value);
    updateAudio();
    savePreferences();
  });
  for (const [id, key] of [
    ['droneVolume', 'droneVolume'],
    ['weatherVolume', 'weatherVolume'],
    ['effectsVolume', 'effectsVolume'],
  ])
    $(id).addEventListener('input', () => {
      audio[key] = Number($(id).value);
      audio.applyMix();
      updateAudio();
      savePreferences();
    });
  $('arenaMix').addEventListener('change', () => {
    audio.mix = $('arenaMix').value;
    savePreferences();
  });
  // A new touch/click can resume a mobile AudioContext interrupted by an app switch.
  const resumeSound = (e) => {
    if (
      audio.enabled &&
      audio.state !== 'running' &&
      !['quickSound', 'arenaSound', 'testSound'].includes(e.target.id)
    )
      soundAction();
  };
  document.addEventListener('pointerdown', resumeSound);
  function updateAudio() {
    const running = audio.state === 'running',
      interrupted = audio.enabled && !running;
    $('quickSound').textContent = interrupted
      ? 'Resume sound'
      : running
        ? 'Mute sound'
        : 'Sound off';
    $('arenaSound').textContent = interrupted
      ? 'Resume game sound'
      : running
        ? 'Mute game sound'
        : 'Enable game sound';
    for (const id of ['quickSound', 'arenaSound'])
      $(id).setAttribute('aria-pressed', String(running));
    $('arenaVolumeValue').textContent = Math.round(audio.volume * 100) + '%';
    $('droneVolumeValue').textContent = Math.round(audio.droneVolume * 100) + '%';
    $('weatherVolumeValue').textContent = Math.round(audio.weatherVolume * 100) + '%';
    $('effectsVolumeValue').textContent = Math.round(audio.effectsVolume * 100) + '%';
    $('audioMeter').value = audio.level;
    $('audioStatus').textContent =
      audioMessage ||
      (!audio.enabled
        ? 'Sound off · tap to enable'
        : interrupted
          ? 'Audio interrupted · tap Resume sound'
          : audio.volume === 0
            ? 'Volume is 0%'
            : audio.context.currentTime < audio.testUntil
              ? 'Playing two test tones'
              : !sim.running
                ? 'Sound ready · simulation paused'
                : sim.drones.some((d) => ['FLY', 'RETURN', 'LAND'].includes(d.mode))
                  ? 'Sound on · ' + Math.round(audio.volume * 100) + '%'
                  : 'Sound ready · launch aircraft or Test sound');
  }
  async function launch({ count = null, engage = false, reset = false, repeat = false } = {}) {
    if (busy || combat.loading) return;
    if (sim.challenge && !sim.challenge.finished) throw Error('Return to free flight first.');
    if (count !== null && (!Number.isInteger(count) || count < 2 || count > 256))
      throw Error('Choose 2–256 aircraft for combat.');
    if (sim.lab?.planet !== 'earth' && sim.lab?.rotorMode === 'constrained')
      throw Error(
        'Constrained Earth-style rotors cannot fly here. In Physics, choose Arcade lift for a fictional arena on this world.',
      );
    const original = combat.enabled ? combat.saved : sim.snapshot(),
      seed = reset
        ? combat.seed
        : count === null
          ? sim.snapshot()
          : createCommanderFleet(count, 'mixed'),
      previousView = renderer.view;
    if (count !== null) {
      seed.options = { ...original.options };
      seed.program.music = original.program.music;
      seed.program.settings.song = original.program.settings.song;
      seed.program.settings.bpm = original.program.settings.bpm;
    }
    busy = true;
    update();
    combat.stop();
    sim.load(seed);
    try {
      if (await combat.start()) {
        combat.saved = original;
        round = repeat ? round + 1 : 1;
        populate();
        syncRoster();
        if (engage) combat.engage();
        if (reset) view(previousView || 'orbit');
        else view(engage ? $('battleCamera').value : 'orbit');
        if (renderer.view === 'fpv') nextSubject();
        say(sim.notice);
      }
    } catch (error) {
      combat.stop();
      sim.load(original);
      populate();
      throw error;
    } finally {
      busy = false;
      update();
    }
  }
  $('startAIBattle').addEventListener(
    'click',
    guard(() => {
      combat.playbook = null;
      if ($('battleSound').checked) soundAction();
      return launch({ count: Number($('battleCount').value), engage: true });
    }),
  );
  $('prepareCombat').addEventListener(
    'click',
    guard(() => launch()),
  );
  $('newSkirmish').addEventListener(
    'click',
    guard(() => launch({ count: 24 })),
  );
  $('engageCombat').addEventListener('click', () => {
    if ($('battleSound').checked) soundAction();
    combat.engage();
    say(sim.notice);
  });
  $('ceaseCombat').addEventListener('click', () => {
    $('repeatBattle').checked = false;
    combat.ceaseFire();
    say(sim.notice);
    savePreferences();
  });
  const drop = () => {
    if (!combat.drop($('combatDrone').value))
      say('Choose a live aircraft with ammo, wait for its cooldown, and resume to drop.', true);
    else say('Payload released.');
  };
  $('dropPayload').addEventListener('click', drop);
  $('combatDrone').addEventListener('change', () => {
    selectDrone($('combatDrone').value);
    update();
  });
  $('resetCombat').addEventListener(
    'click',
    guard(() => launch({ reset: true })),
  );
  $('exitCombat').addEventListener('click', () => {
    combat.exit();
    populate();
    syncRoster();
    say(sim.notice);
    update();
  });
  const keydown = (e) => {
    if (
      e.key.toLowerCase() === 'b' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.repeat &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) &&
      !e.target.isContentEditable &&
      combat.enabled
    ) {
      e.preventDefault();
      drop();
    }
  };
  document.addEventListener('keydown', keydown);
  $('weatherPreset').addEventListener('change', () => {
    if ($('weatherPreset').value !== 'custom') useWeatherPreset($('weatherPreset').value);
  });
  for (const id of Object.values(weatherFields))
    $(id).addEventListener('input', () => {
      $('weatherPreset').value = 'custom';
      applyWeather();
    });
  $('weatherFluid').addEventListener('change', () => {
    $('weatherPreset').value = 'custom';
    applyWeather();
  });
  $('reduceFlashes').checked = sim.fleet.options.reducedMotion;
  $('reduceFlashes').addEventListener('change', () => {
    weather.reducedFlashes = $('reduceFlashes').checked;
    savePreferences();
  });
  $('strikeLightning').addEventListener('click', () => {
    if (!sim.running) {
      say('Resume the scene to trigger lightning.');
      return;
    }
    if (!weather.strike(renderer.camera?.position))
      say(
        weather.world === 'earth'
          ? 'Lightning is recharging for a moment.'
          : 'Earth lightning is unavailable on ' + weather.world + '.',
      );
  });
  const available = !!renderer.renderer;
  for (const id of [
    'freeLook',
    'quickFPV',
    'watchCombat',
    'recenterFPV',
    'fpvPreset',
    ...Object.values(fpvFields),
  ])
    $(id).disabled = !available;
  for (const o of $('battleCamera').options) if (o.value !== 'orbit') o.disabled = !available;
  $('arenaCameraAvailability').textContent = available
    ? ''
    : 'FPV needs WebGL. This browser can still run AI battles, sound and tactical zoom.';
  function savePreferences() {
    try {
      localStorage.setItem(
        'fleetcommander.arena.v1',
        JSON.stringify({
          settings: combat.settings,
          tactics: combat.tactics,
          formations: combat.formations,
          preset: $('battlePreset').value,
          count: Number($('battleCount').value),
          fpv: Object.fromEntries(
            Object.entries(fpvFields).map(([key, id]) => [key, Number($(id).value)]),
          ),
          fpvPreset: $('fpvPreset').value,
          camera: $('battleCamera').value,
          faction: $('cameraFaction').value,
          autoFPV: $('autoFPV').checked,
          repeat: $('repeatBattle').checked,
          soundOnStart: $('battleSound').checked,
          volume: audio.volume,
          droneVolume: audio.droneVolume,
          weatherVolume: audio.weatherVolume,
          effectsVolume: audio.effectsVolume,
          mix: audio.mix,
          payloads: combat.autoPayloads,
          friendlyFire: combat.friendlyFire,
          weather: weather.settings,
          weatherPreset: $('weatherPreset').value,
          reduceFlashes: $('reduceFlashes').checked,
        }),
      );
    } catch {}
  }
  // Read once before defaults are written, then clamp every persisted numeric setting.
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem('fleetcommander.arena.v1') || 'null');
  } catch {}
  usePreset('skirmish');
  if (saved && typeof saved === 'object') {
    combat.settings = combatSettings(saved.settings || {});
    for (const side of ['friendly', 'enemy']) {
      combat.setTactic(side, saved.tactics?.[side]);
      if (Object.hasOwn(BATTLE_FORMATIONS, saved.formations?.[side]))
        combat.formations[side] = saved.formations[side];
      $(side + 'Tactic').value = combat.tactics[side];
      $(side + 'Formation').value = combat.formations[side];
    }
    const choose = (id, value) => {
      if ([...$(id).options].some((o) => o.value === value && !o.disabled)) $(id).value = value;
    };
    choose('battlePreset', saved.preset);
    choose('battleCamera', saved.camera);
    choose('cameraFaction', saved.faction);
    choose('fpvPreset', saved.fpvPreset);
    choose('arenaMix', saved.mix);
    choose('weatherPreset', saved.weatherPreset);
    audio.mix = $('arenaMix').value;
    if (Number.isInteger(saved.count) && saved.count >= 2 && saved.count <= 256)
      $('battleCount').value = saved.count;
    if (Number.isFinite(saved.volume)) audio.volume = Math.max(0, Math.min(1, saved.volume));
    for (const key of ['droneVolume', 'weatherVolume', 'effectsVolume'])
      if (Number.isFinite(saved[key])) audio[key] = Math.max(0, Math.min(1.5, saved[key]));
    $('arenaVolume').value = audio.volume;
    $('droneVolume').value = audio.droneVolume;
    $('weatherVolume').value = audio.weatherVolume;
    $('effectsVolume').value = audio.effectsVolume;
    for (const [key, id] of [
      ['autoFPV', 'autoFPV'],
      ['repeat', 'repeatBattle'],
      ['soundOnStart', 'battleSound'],
      ['payloads', 'autoPayloads'],
      ['friendlyFire', 'friendlyBlast'],
    ])
      if (typeof saved[key] === 'boolean') $(id).checked = saved[key];
    combat.autoPayloads = $('autoPayloads').checked;
    combat.friendlyFire = $('friendlyBlast').checked;
    const fpv = fpvSettings(saved.fpv || {});
    for (const [key, id] of Object.entries(fpvFields)) $(id).value = fpv[key];
    renderer.directorCamera?.configureFPV?.(fpv);
    if (saved.weather) weather.configure(saved.weather);
    $('reduceFlashes').checked = !!saved.reduceFlashes;
    weather.reducedFlashes = $('reduceFlashes').checked;
    $('battleDescription').textContent =
      COMBAT_PRESETS[$('battlePreset').value]?.description || 'Your saved combat tuning.';
    writeSettings();
  }
  writeWeather();
  if (!$('weatherPreset').value) $('weatherPreset').value = 'custom';
  weather.setWorld(sim.lab?.planet || 'earth');
  audio.applyMix();
  for (const id of ['battleCount', 'battleCamera', 'repeatBattle', 'battleSound', 'autoFPV'])
    $(id).addEventListener('change', savePreferences);
  function syncRoster() {
    if (roster === sim.drones) return;
    roster = sim.drones;
    $('combatDrone').replaceChildren(
      ...sim.drones.slice(0, 256).map((d) => {
        const o = document.createElement('option');
        o.value = d.id;
        o.textContent =
          d.name +
          (d.combatSide ? ' · ' + (d.combatSide === 'enemy' ? 'hostile' : 'friendly') : '');
        return o;
      }),
    );
  }
  function update() {
    syncRoster();
    const active = combat.enabled,
      stats = combat.summary();
    teamBar.hidden = !active;
    for (const side of ['friendly', 'enemy']) {
      const t = stats.teams[side];
      $(side + 'Flying').textContent =
        (side === 'friendly' ? 'FRIENDLY' : 'HOSTILE') + ' ' + t.flying + '/' + t.total + ' flying';
      $(side + 'Losses').textContent =
        t.returning + ' returning · ' + t.landed + ' landed · ' + t.destroyed + ' down';
    }
    playbook?.update();
    $('startAIBattle').disabled = busy || combat.loading;
    $('prepareCombat').disabled = $('newSkirmish').disabled = active || busy || combat.loading;
    for (const id of [
      'engageCombat',
      'ceaseCombat',
      'dropPayload',
      'resetCombat',
      'exitCombat',
      'combatDrone',
    ])
      $(id).disabled = !active || busy;
    $('engageCombat').disabled ||= !!combat.winner;
    $('watchCombat').disabled = !available || !active;
    $('nextCombatDrone').disabled = !subjects().length;
    $('friendlyAlive').textContent = active ? stats.friendly : '—';
    $('enemyAlive').textContent = active ? stats.enemy : '—';
    const countdown =
      combat.winner && $('repeatBattle').checked
        ? ' · next round in ' + Math.max(0, Math.ceil(8 - (combat.time - combat.finishedAt))) + ' s'
        : '';
    $('combatStatus').textContent =
      busy || combat.loading
        ? 'Preparing collision physics…'
        : active
          ? 'Round ' +
            round +
            ' · ' +
            (combat.winner || (combat.engaged ? 'AI DOGFIGHT' : 'FORMATION / CEASE FIRE')) +
            ' · ' +
            Math.floor(combat.battleTime || 0) +
            ' s · ' +
            stats.wrecks +
            ' disabled · ' +
            stats.impacts +
            ' impacts · ' +
            stats.detonations +
            ' blasts' +
            countdown
          : 'Choose a preset and Start AI battle. Your show setup will be restored on exit.';
    const selected = getSelected();
    if (selected && sim.drones.some((d) => d.id === selected)) $('combatDrone').value = selected;
    const d = sim.drones.find((d) => d.id === selected);
    $('combatAircraft').textContent =
      active && d
        ? d.name +
          ' · ' +
          (d.mode === 'FLY' ? d.ai?.state : d.mode) +
          ' · hull ' +
          Math.round(d.health) +
          '% · ' +
          d.ammo +
          ' payloads · ' +
          d.cooldown.toFixed(1) +
          ' s cooldown'
        : 'Choose a live aircraft to watch its decisions and fly its FPV camera.';
    hud.hidden = !active || renderer.view !== 'fpv' || !d;
    if (!hud.hidden) {
      hud.dataset.side = d.combatSide;
      $('fpvHudTitle').textContent =
        (d.combatSide === 'enemy' ? 'HOSTILE' : 'FRIENDLY') + ' · ' + d.name;
      $('fpvHudState').textContent =
        (d.mode === 'FLY' ? d.ai?.state : d.mode) +
        ' · hull ' +
        Math.round(d.health) +
        '% · ammo ' +
        d.ammo;
      $('fpvHudStats').textContent =
        Math.hypot(...d.velocity).toFixed(1) +
        ' m/s · ' +
        d.pos[1].toFixed(1) +
        ' m · battery ' +
        Math.round(d.battery) +
        '% · link ' +
        Math.round(weather.signalFor(d) * 100) +
        '%';
    }
    $('weatherStatus').textContent =
      (weather.world === 'earth'
        ? 'EARTH WEATHER'
        : weather.world.toUpperCase() + ' · no terrestrial rain/lightning') +
      ' · rain ' +
      Math.round(weather.visualRain * 100) +
      '% · wind ' +
      weather.settings.windSpeed.toFixed(0) +
      ' m/s · battery load ' +
      weather.batteryMultiplier().toFixed(2) +
      '×' +
      (weather.settings.fluidEnabled ? ' · fluid field live' : ' · analytic wind');
    updateAudio();
  }
  const repeat = guard(() => launch({ reset: true, engage: true, repeat: true }));
  function tick() {
    if (combat.enabled && DRONE_VIEWS.includes(renderer.view) && $('autoFPV').checked) {
      const d = sim.drones.find((d) => d.id === getSelected());
      if (!d || d.mode !== 'FLY') nextSubject();
    }
    audio.update(sim, weather, renderer.camera?.position);
    if (
      combat.enabled &&
      combat.winner &&
      $('repeatBattle').checked &&
      sim.running &&
      !busy &&
      combat.time - combat.finishedAt >= 8
    )
      repeat();
  }
  const playbook = mountPlaybook({
    sim,
    combat,
    launch: (options) => {
      if ($('battleSound').checked) soundAction();
      return launch(options);
    },
    say,
    guard,
  });
  savePreferences();
  update();
  return {
    combat,
    audio,
    update,
    tick,
    silence: () => audio.silence(),
    dispose: () => {
      disposed = true;
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', resumeSound);
      audio.dispose();
      combat.stop();
      if (ownedWeather) weather.dispose();
    },
  };
}
