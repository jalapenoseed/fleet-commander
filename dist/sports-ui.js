import {
  matchId,
  SportsMatch,
  simulate,
  validateConfig,
  validateArchive,
  formation,
  PLAYS,
  MODES,
  STEP,
  standings,
  choosePlay,
} from './sports-sim.js?v=1.0.1';
const $ = (id) => document.getElementById(id),
  KEY = 'fleetcommander.sports.v1',
  FORM_KEY = 'fleetcommander.sports.lineups.v1';
let records = [],
  lineups = { ctf: [null, null], soccer: [null, null], football: [null, null] },
  match = null,
  replay = null,
  replayIndex = 0,
  running = false,
  accumulator = 0,
  last = performance.now(),
  worker = null,
  busy = false,
  resetArmed = false,
  resetTimer = null;
const ctx = $('pitch').getContext('2d');
const rules = {
  soccer:
    'Five-a-side soccer: dribble, pass, shoot and win the ball. A goal is 1 point. Saves give possession to the goalkeeper; goals restart at midfield. No offsides, fouls or set pieces.',
  ctf: 'Bring the opposing flag to your base for 1 point while your own flag is home. Tags only work in the tagger’s home half. Tagged players return home and sit out for 3 seconds. Dropped flags return after 8 seconds; a carried flag returns after 25 seconds.',
  football:
    'American flag football: four downs to reach the end zone, with no first downs. Each down allows one forward pass. A flag pull, incompletion or 12-second play clock ends the down. A touchdown is 6 points and changes possession. No kicks or extra points.',
};
function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function protect(fn) {
  return (...args) => {
    try {
      const result = fn(...args);
      if (result?.catch) result.catch((e) => status(e.message, true));
    } catch (e) {
      status(e.message, true);
    }
  };
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ kind: 'fleet-sports-lab', version: 1, records }));
  } catch {
    status('Browser storage is unavailable or full. Export your matches to keep them.', true);
  }
}
try {
  const saved = localStorage.getItem(KEY);
  if (saved) records = validateArchive(JSON.parse(saved)).records;
  const forms = JSON.parse(localStorage.getItem(FORM_KEY) || 'null');
  if (forms)
    for (const mode of Object.keys(MODES)) {
      validateConfig({ mode, custom: forms[mode] });
      lineups[mode] = forms[mode];
    }
} catch {
  status('A browser save could not be read. Your valid match records are still available.', true);
}
function config(adaptive = false) {
  const mode = $('mode').value,
    seed = Number($('seed').value);
  let c = validateConfig({
    mode,
    seed,
    duration: Number($('duration').value),
    start: Number($('starter').value),
    plays: [$('bluePlay').value, $('coralPlay').value],
    custom: lineups[mode],
  });
  if (adaptive && $('adapt').checked)
    c.plays = c.plays.map((p, t) => (c.custom[t] ? p : choosePlay(records, mode, t, seed + t)));
  return c;
}
function notes() {
  for (const [id, t] of [
    ['blue', 0],
    ['coral', 1],
  ])
    $('' + id + 'Note').textContent =
      PLAYS[$('mode').value][$('' + id + 'Play').value].note +
      (lineups[$('mode').value][t] ? ' Custom lineup enabled.' : '');
}
function updateMode() {
  const mode = $('mode').value;
  for (const [id, index] of [
    ['bluePlay', 0],
    ['coralPlay', 1],
  ]) {
    $(id).replaceChildren(
      ...Object.entries(PLAYS[mode]).map(([value, p]) => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = p.name;
        return o;
      }),
    );
    $(id).selectedIndex = index;
  }
  notes();
  $('rules').textContent = rules[mode];
  renderPositions();
  renderLearning();
  preview();
}
function preview() {
  if (running || replay) return;
  match = new SportsMatch(config());
  draw(match.frames[0], match.config);
  $('sportTitle').textContent = MODES[match.config.mode];
  $('matchState').textContent = 'Ready · lineup preview';
  $('matchClock').textContent = clock(match.config.duration);
  $('blueScore').textContent = '0';
  $('coralScore').textContent = '0';
}
function renderPositions() {
  const team = Number($('editTeam').value),
    mode = $('mode').value,
    positions =
      lineups[mode][team] ||
      formation(PLAYS[mode][$(team ? 'coralPlay' : 'bluePlay').value].layout);
  $('customOn').checked = !!lineups[mode][team];
  $('positionRows').replaceChildren(
    ...positions.map((p, i) => {
      const row = document.createElement('tr'),
        th = document.createElement('th');
      th.textContent = String(i + 1);
      th.scope = 'row';
      row.append(th);
      for (let axis = 0; axis < 2; axis++) {
        const td = document.createElement('td'),
          input = document.createElement('input');
        input.type = 'number';
        input.min = 6;
        input.max = axis ? 54 : 44;
        input.step = 1;
        input.value = p[axis];
        input.setAttribute('aria-label', 'Player ' + (i + 1) + ' ' + (axis ? 'Y' : 'X'));
        input.dataset.axis = axis;
        input.dataset.slot = i;
        td.append(input);
        row.append(td);
      }
      return row;
    }),
  );
}
function applyFormation() {
  const mode = $('mode').value,
    t = Number($('editTeam').value),
    next = lineups[mode].map((x) => x && x.map((p) => [...p]));
  next[t] = $('customOn').checked
    ? Array.from({ length: 5 }, (_, i) =>
        [0, 1].map((a) =>
          Number($('positionRows').querySelector(`[data-slot="${i}"][data-axis="${a}"]`).value),
        ),
      )
    : null;
  validateConfig({ ...config(), custom: next });
  lineups[mode] = next;
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify(lineups));
  } catch {
    status('Lineup applied for this session. Browser saving unavailable.', true);
    return;
  }
  notes();
  replay = null;
  running = false;
  preview();
  status('Lineup saved. Start a new match to use it.');
}
function recordResult(result) {
  if (records.some((r) => r.id === result.id)) return;
  records.push(result);
  if (records.length > 300) records.shift();
  save();
  renderHistory();
  renderLearning();
}
function renderHistory() {
  $('historyCount').textContent = records.length + ' saved';
  $('historyList').replaceChildren();
  for (const r of [...records].reverse()) {
    const b = document.createElement('button'),
      name = document.createElement('span'),
      score = document.createElement('strong'),
      info = document.createElement('small');
    name.textContent = MODES[r.config.mode];
    score.textContent = r.score.join(' : ');
    info.textContent =
      r.config.plays
        .map((p, t) => PLAYS[r.config.mode][p].name + (r.config.custom[t] ? ' + custom' : ''))
        .join(' / ') +
      ' · seed ' +
      r.config.seed;
    b.append(name, score, info);
    b.addEventListener(
      'click',
      protect(() => watch(r)),
    );
    $('historyList').append(b);
  }
  if (!records.length) $('historyList').textContent = 'No completed matches yet.';
  $('replayLast').disabled = !records.length || busy;
}
function renderLearning() {
  const mode = $('mode').value,
    rows = standings(records, mode, Number($('statsTeam').value)).sort(
      (a, b) => b.rate - a.rate || b.games - a.games,
    ),
    box = $('learningTable');
  box.replaceChildren();
  const best = rows.find((r) => r.games),
    summary = document.createElement('p');
  summary.className = 'best';
  summary.textContent = best
    ? 'Best observed: ' +
      best.name +
      ' · ' +
      Math.round(best.rate * 100) +
      '% win/draw score (' +
      best.games +
      ' games)'
    : 'No results yet. Start with the 18-game comparison.';
  box.append(summary);
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Play</th><th>W–D–L</th><th>Avg Δ</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const value of [
      row.name,
      `${row.wins}–${row.draws}–${row.losses}`,
      row.games ? row.difference.toFixed(1) : '—',
    ]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  box.append(table);
}
function clock(time) {
  const t = Math.max(0, Math.ceil(time));
  return (
    Math.floor(t / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    String(t % 60).padStart(2, '0')
  );
}
function start() {
  if (busy) return;
  const c = config(true);
  replay = null;
  match = new SportsMatch(c);
  running = true;
  accumulator = 0;
  $('pauseMatch').disabled = false;
  $('pauseMatch').textContent = 'Pause';
  $('playMatch').textContent = 'Restart match';
  $('scrub').disabled = true;
  $('replayTime').textContent = '—';
  status(c.plays.map((p, t) => (t ? 'Coral: ' : 'Blue: ') + PLAYS[c.mode][p].name).join(' · '));
  updateView();
}
function watch(r) {
  if (busy) return;
  running = false;
  match = null;
  replay = simulate(r.config, true);
  replayIndex = 0;
  accumulator = 0;
  $('scrub').max = replay.frames.length - 1;
  $('scrub').value = 0;
  $('scrub').disabled = false;
  $('pauseMatch').disabled = false;
  $('pauseMatch').textContent = 'Play replay';
  $('playMatch').textContent = 'Start match';
  status('Replay · seed ' + r.config.seed + '. Playback does not update learning.');
  if (replay.score.some((v, i) => v !== r.score[i]))
    status('Imported score differs from this replay. The field shows the recomputed result.', true);
  updateView();
}
function updateView() {
  const source = replay || match;
  if (!source) return;
  const frame = replay ? replay.frames[replayIndex] : source.frames.at(-1);
  draw(frame, source.config);
  $('sportTitle').textContent = MODES[source.config.mode];
  $('blueScore').textContent = frame.score[0];
  $('coralScore').textContent = frame.score[1];
  $('matchClock').textContent = clock(source.config.duration - frame.time);
  $('matchState').textContent = replay
    ? 'REPLAY · ' + (running ? 'Playing' : 'Paused')
    : source.done
      ? 'Full time'
      : running
        ? 'Match in progress'
        : 'Paused';
  if (source.config.mode === 'football')
    $('matchState').textContent +=
      ' · ' + (frame.possession ? 'Coral' : 'Blue') + ' down ' + frame.down + '/4';
  const event = source.events.filter((e) => e.time <= frame.time).at(-1);
  $('eventText').textContent = event
    ? event.text
    : 'Kickoff · ' + source.config.plays.map((p) => PLAYS[source.config.mode][p].name).join(' vs ');
  if (replay) {
    $('scrub').value = replayIndex;
    $('replayTime').textContent = clock(frame.time);
  }
  const stats = frame.stats || source.stats;
  $('matchMetrics')
    .querySelectorAll('b')
    .forEach((el, i) => {
      el.textContent = [
        stats[0][['passes', 'shots', 'tags'][i]],
        stats[1][['passes', 'shots', 'tags'][i]],
      ]
        .map((v) => Math.round(v))
        .join(' / ');
    });
}
function draw(f, c) {
  if (!ctx) return;
  const w = 1000,
    h = 600;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#123a36';
  ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < 100; x += 20) {
    ctx.fillStyle = '#164139';
    ctx.fillRect(x * 10, 0, 100, h);
  }
  ctx.strokeStyle = '#71958c';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 960, 560);
  ctx.beginPath();
  ctx.moveTo(500, 20);
  ctx.lineTo(500, 580);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(500, 300, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '16px system-ui';
  ctx.textAlign = 'center';
  if (c.mode === 'football') {
    for (let x = 10; x <= 90; x += 10) {
      ctx.strokeStyle = '#547d71';
      ctx.beginPath();
      ctx.moveTo(x * 10, 20);
      ctx.lineTo(x * 10, 580);
      ctx.stroke();
    }
    ctx.fillStyle = '#72cdff22';
    ctx.fillRect(20, 20, 60, 560);
    ctx.fillStyle = '#ff9a8722';
    ctx.fillRect(920, 20, 60, 560);
    const lx = (f.possession ? 100 - f.line : f.line) * 10;
    ctx.strokeStyle = '#f8dda3';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(lx, 20);
    ctx.lineTo(lx, 580);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (c.mode === 'soccer') {
    ctx.strokeStyle = '#bcd3c8';
    ctx.strokeRect(20, 190, 130, 220);
    ctx.strokeRect(850, 190, 130, 220);
    ctx.fillStyle = '#72cdff55';
    ctx.fillRect(0, 245, 20, 110);
    ctx.fillStyle = '#ff9a8755';
    ctx.fillRect(980, 245, 20, 110);
  }
  if (c.mode === 'ctf') {
    for (let t = 0; t < 2; t++) {
      ctx.strokeStyle = t ? '#ff9a87' : '#72cdff';
      ctx.beginPath();
      ctx.arc((t ? 93 : 7) * 10, 300, 43, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let t = 0; t < 2; t++) {
      const flag = f.flags[t];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(flag.x * 10, flag.y * 10 - 22);
      ctx.lineTo(flag.x * 10, flag.y * 10 + 7);
      ctx.stroke();
      ctx.fillStyle = t ? '#ff9a87' : '#72cdff';
      ctx.fillRect(flag.x * 10, flag.y * 10 - 22, 20, 13);
    }
  }
  for (const p of f.players) {
    const x = p.x * 10,
      y = p.y * 10;
    ctx.globalAlpha = p.wait > 0 ? 0.35 : 1;
    ctx.fillStyle = '#0004';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 8, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.team ? '#ff9a87' : '#72cdff';
    ctx.strokeStyle = '#d9f1ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b2331';
    ctx.font = 'bold 15px system-ui';
    ctx.fillText(p.slot + 1, x, y + 5);
    ctx.globalAlpha = 1;
  }
  if (c.mode !== 'ctf') {
    ctx.fillStyle = '#fff9e9';
    ctx.strokeStyle = '#26332c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.mode === 'football')
      ctx.ellipse(f.ball.x * 10 + 8, f.ball.y * 10 + 7, 10, 6, -0.5, 0, Math.PI * 2);
    else ctx.arc(f.ball.x * 10 + 8, f.ball.y * 10 + 7, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (f.cooldown > 0) {
    ctx.fillStyle = '#071622b3';
    ctx.fillRect(365, 268, 270, 60);
    ctx.fillStyle = '#e9f2fb';
    ctx.font = '20px system-ui';
    ctx.fillText('Resetting play', 500, 306);
  }
}
function batch(kind) {
  if (busy) return;
  const c = config();
  running = false;
  replay = null;
  match = null;
  worker = new Worker(new URL('./sports-worker.js?v=1.0.1', import.meta.url), { type: 'module' });
  busy = true;
  batchControls();
  $('pauseMatch').disabled = true;
  $('scrub').disabled = true;
  $('batchProgress').max = kind === 'compare' ? 18 : Number($('batchSize').value);
  $('batchProgress').value = 0;
  $('batchStatus').textContent = 'Starting automatic matches…';
  worker.onmessage = protect(({ data }) => {
    if (data.type === 'result') {
      recordResult(data.result);
      $('batchProgress').value = data.completed;
      $('batchStatus').textContent =
        `${data.completed} / ${data.total} complete · Blue ${data.result.score[0]} : ${data.result.score[1]} Coral`;
      const m = simulate(data.result.config, true);
      match = m;
      updateView();
    } else if (data.type === 'done') {
      finishBatch();
      $('batchStatus').textContent =
        (data.canceled ? 'Stopped. ' : 'Complete. ') +
        $('batchProgress').value +
        ' matches saved. Select any match to replay.';
    } else if (data.type === 'error') {
      finishBatch();
      status(data.message, true);
    }
  });
  worker.onerror = () => {
    finishBatch();
    status('Automatic league could not run. Single matches still work.', true);
  };
  worker.postMessage({
    type: 'run',
    kind,
    config: c,
    count: Number($('batchSize').value),
    records,
  });
}
function finishBatch() {
  worker?.terminate();
  worker = null;
  busy = false;
  batchControls();
  renderHistory();
}
function batchControls() {
  for (const id of [
    'learnBatch',
    'compareBatch',
    'playMatch',
    'replayLast',
    'importSports',
    'resetLearning',
    'applyFormation',
    'mode',
    'duration',
    'seed',
    'starter',
    'bluePlay',
    'coralPlay',
    'adapt',
  ])
    $(id).disabled = busy;
  $('stopBatch').disabled = !busy;
}
function download() {
  const a = document.createElement('a'),
    url = URL.createObjectURL(
      new Blob([JSON.stringify({ kind: 'fleet-sports-lab', version: 1, records }, null, 2)], {
        type: 'application/json',
      }),
    );
  a.href = url;
  a.download = 'fleet-sports-lab.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Exported ' + records.length + ' matches and their learning history.');
}
for (const b of document.querySelectorAll('[data-panel]'))
  b.addEventListener('click', () => {
    for (const p of document.querySelectorAll('.tool-panel')) p.hidden = p.id !== b.dataset.panel;
    for (const n of document.querySelectorAll('[data-panel]'))
      n.setAttribute('aria-pressed', String(n === b));
  });
$('mode').addEventListener('change', protect(updateMode));
for (const id of ['bluePlay', 'coralPlay'])
  $(id).addEventListener(
    'change',
    protect(() => {
      notes();
      renderPositions();
      preview();
    }),
  );
$('editTeam').addEventListener('change', renderPositions);
$('loadLayout').addEventListener('click', () => {
  const p = formation($('layout').value);
  for (const input of $('positionRows').querySelectorAll('input'))
    input.value = p[Number(input.dataset.slot)][Number(input.dataset.axis)];
  $('customOn').checked = true;
  status('Template loaded. Save lineup to apply.');
});
$('applyFormation').addEventListener('click', protect(applyFormation));
$('playMatch').addEventListener('click', protect(start));
$('pauseMatch').addEventListener('click', () => {
  running = !running;
  if (running && replay && replayIndex === replay.frames.length - 1) replayIndex = 0;
  accumulator = 0;
  $('pauseMatch').textContent = running ? 'Pause' : replay ? 'Play replay' : 'Resume';
  updateView();
});
$('replayLast').addEventListener(
  'click',
  protect(() => watch(records.at(-1))),
);
$('scrub').addEventListener('input', () => {
  if (!replay) return;
  running = false;
  replayIndex = Number($('scrub').value);
  $('pauseMatch').textContent = 'Play replay';
  updateView();
});
$('statsTeam').addEventListener('change', renderLearning);
$('learnBatch').addEventListener(
  'click',
  protect(() => batch('learn')),
);
$('compareBatch').addEventListener(
  'click',
  protect(() => batch('compare')),
);
$('stopBatch').addEventListener('click', () => {
  worker?.postMessage({ type: 'stop' });
  $('stopBatch').disabled = true;
});
$('exportSports').addEventListener('click', download);
$('importSports').addEventListener(
  'change',
  protect(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 1500000) throw Error('Sports archives must be under 1.5 MB.');
      const imported = validateArchive(JSON.parse(await f.text())),
        ids = new Set(records.map((r) => r.id));
      records = [...records, ...imported.records.filter((r) => !ids.has(r.id))].slice(-300);
      save();
      renderHistory();
      renderLearning();
      status('Imported match history. Duplicate IDs were skipped.');
    } finally {
      e.target.value = '';
    }
  }),
);
$('resetLearning').addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    $('resetLearning').textContent = 'Confirm: erase all match results';
    resetTimer = setTimeout(() => {
      resetArmed = false;
      $('resetLearning').textContent = 'Reset saved results…';
    }, 5000);
    return;
  }
  clearTimeout(resetTimer);
  records = [];
  save();
  renderHistory();
  renderLearning();
  resetArmed = false;
  $('resetLearning').textContent = 'Reset saved results…';
  status('Match history and learned play scores cleared.');
});
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  if (document.hidden && running) {
    running = false;
    $('pauseMatch').textContent = replay ? 'Play replay' : 'Resume';
    status('Visible match paused while the tab is hidden. Automatic leagues continue.');
  }
});
window.addEventListener('pagehide', () => {
  worker?.terminate();
  clearTimeout(resetTimer);
});
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && !document.hidden) {
    accumulator += dt * Number($('speed').value);
    while (accumulator >= STEP && running) {
      accumulator -= STEP;
      if (replay) {
        if (replayIndex < replay.frames.length - 1) replayIndex++;
        else {
          running = false;
          $('pauseMatch').textContent = 'Replay ended';
        }
      } else if (match) {
        match.step();
        if (match.done) {
          running = false;
          recordResult({ ...match.result(), id: matchId() });
          $('pauseMatch').disabled = true;
          $('playMatch').textContent = 'Start match';
          status('Full time. Saved once; both teams’ play results updated.');
        }
      }
    }
    updateView();
  }
  requestAnimationFrame(frame);
}
renderHistory();
updateMode();
requestAnimationFrame(frame);
