import { FLUID_EQUATIONS } from './fluid-field.js?v=0.9.0';
import {
  LOGIC_GATES,
  LOGIC_RULES,
  gateOutput,
  truthTable,
  fullAdder,
  numberFormats,
} from './logic-lab.js?v=0.9.0';
const MODELS = {
  flight: {
    name: 'Flight controller',
    fidelity: 'Game approximation',
    equation: 'a = Kp(target − position) − Kd·velocity + steering',
  },
  boids: {
    name: 'Boids steering',
    fidelity: 'Enhanced model',
    equation: 'F = ws·separation + wa·alignment + wc·cohesion + wo·avoidance',
  },
  fluid: {
    name: 'Navier–Stokes wind field',
    fidelity: FLUID_EQUATIONS.fidelity,
    equation: FLUID_EQUATIONS.momentum + '  ·  ' + FLUID_EQUATIONS.continuity,
  },
  battery: {
    name: 'Battery / energy',
    fidelity: 'Game approximation',
    equation: 'P = V·I  ·  E = ∫P dt  ·  drain = baseline + motion + weather load',
  },
  rf: {
    name: 'RF link',
    fidelity: 'Teaching visualization',
    equation: 'λ = c/f  ·  Pr ∝ Pt / r²  ·  game link includes distance, rain and damage',
  },
  audio: {
    name: 'Motor acoustics',
    fidelity: 'Procedural audio model',
    equation: 'fₙ = n·RPM/60  ·  harmonics + load + imbalance + Doppler-like pitch cues',
  },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function mountNerdLab({ sim, renderer, getSelected, say }) {
  const panels = document.querySelector('.panel-scroll'),
    section = document.createElement('section');
  section.id = 'tab-nerd';
  section.className = 'tab-panel';
  section.hidden = true;
  section.innerHTML = `<div class="section-heading"><span class="eyebrow">🧠 MATH & SCIENCE / NERD LAB</span><h2>Keep zooming in.</h2><p>Inspect the model behind the game, change its inputs, and watch the math become motion.</p></div>
 <label>Model inspector<select id="nerdModel">${Object.entries(MODELS)
   .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
   .join(
     '',
   )}</select></label><p id="modelFidelity" class="fidelity-badge"></p><p id="modelEquation" class="formula"></p><div id="modelTelemetry" class="lab-facts"></div>
 <details open><summary>🌪️ Fluid field visualizer</summary><canvas id="fluidCanvas" width="300" height="180" aria-label="Wind velocity field"></canvas><p id="fluidStats" class="hint"></p><p class="hint">The optional low-resolution field uses advection, viscosity and pressure projection. It drives the same wind sampled by aircraft when Fluid field is enabled in Weather.</p></details>
 <details open><summary>⚡ Logic Lab</summary><div class="logic-switches"><label class="check"><input id="logicA" type="checkbox">Input A</label><label class="check"><input id="logicB" type="checkbox">Input B</label><label class="check"><input id="logicCarry" type="checkbox">Carry in</label></div><label>Gate<select id="logicGate">${Object.entries(
   LOGIC_GATES,
 )
   .map(([k, v]) => `<option value="${k}">${v}</option>`)
   .join(
     '',
   )}</select></label><div id="logicSignal" class="logic-signal" data-on="false"><b>0</b><span>OUTPUT</span></div><table class="material-table"><thead><tr><th>A</th><th>B</th><th>OUT</th></tr></thead><tbody id="truthRows"></tbody></table><p id="adderReadout" class="director-readout"></p>
 <label>Register value<input id="logicNumber" type="number" min="0" max="999999999" value="1337"></label><div class="form-row"><button id="use1337">1337</button><button id="use80085">80085</button></div><p id="numberReadout" class="formula"></p>
 <label>Fleet logic rule<select id="logicRule">${Object.entries(LOGIC_RULES)
   .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
   .join(
     '',
   )}</select></label><label class="check"><input id="logicEnabled" type="checkbox">Run this rule against the live simulation</label><p id="logicRuleStatus" class="hint"></p></details>
 <details><summary>What are you looking at?</summary><p class="hint">Physical world → measurements → equation/model → visualization → simulation behavior. Fidelity labels distinguish a game approximation from a technical or teaching model.</p></details>`;
  panels.append(section);
  const $ = (id) => section.querySelector('#' + id),
    canvas = $('fluidCanvas'),
    ctx = canvas.getContext('2d');
  let lastDraw = -Infinity,
    returnLatch = new Set();
  sim.logicSpeedScale = 1;
  function model() {
    const m = MODELS[$('nerdModel').value];
    $('modelFidelity').textContent = m.fidelity;
    $('modelFidelity').dataset.level = m.fidelity.split(' ')[0].toLowerCase();
    $('modelEquation').textContent = m.equation;
  }
  function logic() {
    const gate = $('logicGate').value,
      a = $('logicA').checked,
      b = $('logicB').checked,
      out = gateOutput(gate, a, b);
    $('logicSignal').dataset.on = String(out);
    $('logicSignal').querySelector('b').textContent = out ? '1' : '0';
    $('truthRows').replaceChildren(
      ...truthTable(gate).map((row) => {
        const tr = document.createElement('tr');
        for (const value of [row.a, row.b, row.out]) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        }
        return tr;
      }),
    );
    const adder = fullAdder(a, b, $('logicCarry').checked);
    $('adderReadout').textContent = 'FULL ADDER · SUM ' + adder.sum + ' · CARRY ' + adder.carry;
  }
  function number() {
    const f = numberFormats($('logicNumber').value);
    $('logicNumber').value = f.decimal;
    $('numberReadout').textContent = f.decimal + ' → ' + f.binary + ' (binary) → ' + f.hex;
  }
  function drawFluid(now) {
    if (!ctx || now - lastDraw < 120) return;
    lastDraw = now;
    const weather = renderer.weather,
      field = weather?.fluid,
      w = canvas.width,
      h = canvas.height;
    ctx.fillStyle = '#07171e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#70e7d2';
    ctx.fillStyle = '#b8fff0';
    ctx.lineWidth = 1;
    const cols = 10,
      rows = 6;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const wx = (x / (cols - 1) - 0.5) * (field?.settings.domain || 420),
          wz = (y / (rows - 1) - 0.5) * (field?.settings.domain || 420),
          wind = weather?.velocityAt([wx, 30, wz], sim.elapsed, 'lab') || [0, 0, 0],
          mag = Math.hypot(wind[0], wind[2]),
          sx = 20 + (x * (w - 40)) / (cols - 1),
          sy = 18 + (y * (h - 36)) / (rows - 1),
          scale = Math.min(15, mag * 0.8);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(
          sx + (wind[0] / Math.max(0.01, mag)) * scale,
          sy + (wind[2] / Math.max(0.01, mag)) * scale,
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    const s = field?.stats?.() || { divergence: 0, vorticity: 0, cells: 0 };
    $('fluidStats').textContent =
      (field?.settings.enabled ? 'LIVE FIELD' : 'ANALYTIC WIND') +
      ' · ' +
      s.cells +
      ' cells · divergence ' +
      s.divergence.toFixed(3) +
      ' · mean vorticity ' +
      s.vorticity.toFixed(3);
  }
  function ruleTick() {
    const weather = renderer.weather,
      rule = $('logicRule').value,
      enabled = $('logicEnabled').checked,
      d =
        sim.drones.find((d) => d.id === getSelected()) || sim.drones.find((d) => d.mode === 'FLY'),
      rain = (weather?.settings.rain || 0) > 0.35,
      highWind = (weather?.settings.windSpeed || 0) > 10,
      enemy =
        !!sim.combat?.enabled &&
        sim.drones.some((o) => o.combatSide !== d?.combatSide && o.mode === 'FLY'),
      signal = d ? (weather?.signalFor?.(d) ?? 1) : 0;
    let a = false,
      b = false,
      out = false,
      label = '';
    sim.logicSpeedScale = 1;
    if (rule === 'battery') {
      a = !!d && d.battery < 20;
      b = !!d && !['DOCK', 'LANDED'].includes(d.mode);
      out = a && b;
      label = 'LOW ' + Number(d?.battery || 0).toFixed(0) + '% · AWAY ' + (b ? '1' : '0');
      if (enabled && out && d && !returnLatch.has(d.id)) {
        returnLatch.add(d.id);
        sim.recall([d.id]);
        say('Logic Lab: ' + d.name + ' returned on low battery.');
      }
      if (d && !out) returnLatch.delete(d.id);
    } else if (rule === 'weather') {
      a = rain;
      b = highWind;
      out = a || b;
      label = 'RAIN ' + (a ? '1' : '0') + ' · HIGH WIND ' + (b ? '1' : '0');
      sim.logicSpeedScale = enabled && out ? 0.68 : 1;
    } else {
      a = enemy;
      b = signal > 0.35;
      out = a && b;
      label = 'ENEMY ' + (a ? '1' : '0') + ' · SIGNAL ' + Math.round(signal * 100) + '%';
    }
    $('logicRuleStatus').textContent =
      label + ' → ' + (out ? 'TRUE' : 'FALSE') + (enabled ? ' · rule live' : ' · observe only');
  }
  function update(now = performance.now()) {
    const d = sim.drones.find((d) => d.id === getSelected()) || sim.drones[0],
      wind = d ? renderer.weather?.velocityAt(d.pos, sim.elapsed, d.id) || [0, 0, 0] : [0, 0, 0],
      speed = d ? Math.hypot(...d.velocity) : 0,
      targetError = d ? Math.hypot(...d.target.map((v, i) => v - d.pos[i])) : 0,
      signal = d ? (renderer.weather?.signalFor?.(d) ?? 1) : 0;
    const facts = [
      [d?.name || '—', 'Selected aircraft'],
      [speed.toFixed(1) + ' m/s', 'Speed'],
      [targetError.toFixed(1) + ' m', 'Target error'],
      [wind[0].toFixed(1) + ', ' + wind[2].toFixed(1), 'Wind X/Z · m/s'],
      [Math.round(d?.battery || 0) + '%', 'Battery'],
      [Math.round(signal * 100) + '%', 'Game RF link'],
    ];
    $('modelTelemetry').replaceChildren(
      ...facts.map(([value, label]) => {
        const item = document.createElement('div'),
          strong = document.createElement('strong'),
          small = document.createElement('small');
        strong.textContent = value;
        small.textContent = label;
        item.append(strong, small);
        return item;
      }),
    );
    drawFluid(now);
    ruleTick();
  }
  $('nerdModel').onchange = model;
  for (const id of ['logicA', 'logicB', 'logicCarry', 'logicGate']) $(id).onchange = logic;
  $('logicNumber').oninput = number;
  $('use1337').onclick = () => {
    $('logicNumber').value = 1337;
    number();
  };
  $('use80085').onclick = () => {
    $('logicNumber').value = 80085;
    number();
  };
  $('logicRule').onchange = ruleTick;
  $('logicEnabled').onchange = ruleTick;
  model();
  logic();
  number();
  update();
  return {
    update,
    dispose() {
      sim.logicSpeedScale = 1;
    },
  };
}
