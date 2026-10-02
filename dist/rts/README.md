# Fleet Commander — Working Model (RTS)

Branch `working-model`. A new, self-contained iteration that turns the swarm lab into a real-time strategy game: economy, production, fog of war, an AI opponent, a win condition, and a deterministic lockstep core that multiplayer and replays are built on.

> You don't fly the drones. You design the forces, rules and information that make a swarm fly itself.

## Run

```bash
npm ci
npm run dev
```

Open `/rts/` on the dev server (for example `http://localhost:5173/rts/`). `?autostart=skirmish` or `?autostart=spectate` skips the menu.

```bash
npm run test:rts   # sim, determinism, replay, AI and performance checks (Node only)
```

## Modes

- **Skirmish:** you (Cyan) against the AI (Crimson) on Delta Basin. Destroy the enemy Command Core.
- **Autonomous Arena:** two AIs fight while the auto-director camera follows the action. This is the seed of the "build a swarm brain and let it compete" mode.
- **Load replay:** a replay file is the seed plus the human command log. The match is re-simulated, and the final screen reports whether the outcome hash matches the recording.

## How it plays

| System     | Rules                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Energy     | Core gives +4/s. Extractors on gold wells give +5/s each.                                                                                                                  |
| Bandwidth  | The unit cap. Core 40, each Relay Tower +25. Drones in production reserve it.                                                                                              |
| Power grid | Structures go within 20 m of your Core or a Relay Tower, so relays are how you expand toward contested wells.                                                              |
| Production | Core and Fabricators build drones in packs (scouts ×4, interceptors ×3, assault ×2, support ×1). New drones gather at the rally point.                                     |
| Fields     | Radar (wide sight, marks enemies "detected"), Jammer (slows, cuts fire rate and sight), Kill Zone (damages every enemy inside), Repair (heals; retreating squads go here). |
| Counters   | Interceptor flak shreds scouts and support. Scout swarms sting heavy assault. Assault missiles break interceptors and buildings.                                           |
| Fog of war | Sight comes from drone and structure sensors; jammed drones see 40% less. The AI obeys the same fog.                                                                       |

**Squads are formed by selection.** Ordering a selection merges it into one squad, which keeps the reaction script of the first squad in it. Plays: move, attack-move, pincer (split, flank, converge), patrol, orbit, hold, retreat. Formations: swarm, wedge, line, column, ring, grid, spiral, diamond.

**Reaction scripts** (`G`): ordered `WHEN condition THEN action` rules per squad. Conditions: enemy within, threat ratio, health, jammed fraction, detected by radar, outnumbered. Actions: evade, retreat, attack, hold, regroup, change formation. Rules use hysteresis, minimum active time, priority preemption and cooldowns, so they don't flicker at the threshold. Every rule has a Learn explanation in plain English and in math, generated from the same data the sim runs. Scripts are JSON data, never code.

## Flight model and piloting

Drones fly like real multirotors, and the simulation runs on that. Each drone has a **throttle, yaw, pitch and roll**:

| Control  | What it does physically                                                             | In the game                                                                                                         |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pitch    | Tilts the nose down or up; the tilted thrust pushes forward or back (`a = g·tan θ`) | Speed comes from tilt; drag sets top speed at max tilt                                                              |
| Roll     | Tilts sideways; thrust slides the drone left or right                               | Strafing without turning                                                                                            |
| Yaw      | Opposite motor pairs change speed; the torque spins the drone on the spot           | Weapons only fire inside a cone around the nose, so turn rate matters                                               |
| Throttle | More or less total thrust                                                           | Altitude: flying higher extends sight (up to +40%); ground fields (jammer, kill zone, repair) only reach below 14 m |

Each airframe has its own limits (`flight` in `sim/defs.js`): max tilt, tilt rate, yaw rate, climb rate and weapon cone. Scouts flick around at 6 rad/s; assault drones lean and turn slowly, so flanking them pays off. AI-flown drones use an autopilot that converts a desired velocity into the same attitude targets a pilot would set. Everything is deterministic: it uses custom `atan2`, `tan`, `sin` and `cos` from `dmath.js`.

**Fly any drone yourself:** select drones, then press `Enter` or **Fly ✈**. The controls use **angle mode with altitude hold**: stick deflection sets the tilt angle, centered sticks level the drone and hold its height.

| Stick (Mode 2)                                            | Keyboard               | Gamepad        |
| --------------------------------------------------------- | ---------------------- | -------------- |
| Throttle (climb / sink)                                   | `W` / `S`              | left stick ↕  |
| Yaw (turn the nose)                                       | `A` / `D`              | left stick ↔  |
| Pitch (tilt forward / back)                               | `I` / `K` or `↑` / `↓` | right stick ↕ |
| Roll (tilt left / right)                                  | `J` / `L` or `←` / `→` | right stick ↔ |
| Fire at what the nose points at (aim assist about 25°)    | `Space` / left click   | RT / A / RB    |
| FPV (nose camera, 22° up-tilt, 100° lens) ↔ chase camera | `Tab` / `C`            | Y              |
| Hand control back to the autopilot                        | `Enter` / `Esc`        | B              |

The HUD shows a pitch ladder and horizon, heading, speed, altitude, vertical speed, pitch and roll angles, hull, weapon state, a target lock box, both sticks, and a Learn line explaining what the stick you're moving does physically. Hitting rocks or the ground fast does damage. If your drone is destroyed, control jumps to the nearest squadmate. The rest of its squad keeps flying its formation and orders.

Pilot input travels as quantized `stick` commands (1/32 steps, sent only on change), so it replays exactly and works over lockstep. In multiplayer it will carry the input delay; see NETWORK.md.

## Controls

| Action        | Input                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Select        | Drag a box · click a drone for its squad · Shift adds · double-click selects that role on screen                                         |
| Move / attack | Right-click ground / enemy                                                                                                               |
| Plays         | `A` attack-move, `P` pincer, `T` patrol, `O` orbit, then click. `H` hold, `R` retreat, `F` cycle formation, `G` script                   |
| Groups        | `Ctrl`/`Alt` + `1–9` assign, `1–9` recall (twice to jump the camera)                                                                     |
| Build         | `Z` extractor, `X` relay, `C` fabricator, `V` radar, `B` jammer, `N` kill zone, `M` repair (Shift keeps placing)                         |
| Produce       | `Shift` + `1–6`, or the Produce buttons (Shift-click ×5). Select a Core/Fabricator to queue there and right-click to set the rally point |
| Camera        | Arrows / screen edge / right-drag to pan, wheel zoom, `Q`/`E` or middle-drag to rotate, `Space` last alert, `Home` your core             |
| Fly a drone   | `Enter` (see Flight model and piloting)                                                                                                  |

## Architecture

```
sim/        deterministic, DOM-free, renderer-free
  dmath.js    deterministic sin/cos (no engine Math.sin), seeded RNG, FNV state hash
  defs.js     roles (incl. flight limits), weapons/armor table, structures, plays
  flight.js   multirotor flight model: attitude, thrust, drag, altitude; autopilot + pilot sticks
  maps.js     point-symmetric maps
  grid.js     spatial hash, rebuilt each tick in slot order
  world.js    World: typed-array drone storage (SoA), commands, economy, auras/fields,
              squads + formations + plays, targeting, combat, deaths, fog of war, hash()
  rules.js    reaction rule engine + Learn explanations
  ai.js       AI opponent: same commands as a human, same fog, own seeded RNG
  lockstep.js Session: stamps commands with tick + sequence, runs AIs, records replays
render/     three.js view; reads the World and never writes to it
  drone-models.js  six procedural airframes (rebuilt; see below) + rotor shader
  terrain.js       stylized terrain; ground shader draws fog, fields, build grid, contours
  structures.js    procedural buildings and energy wells
  effects.js       GPU ring-buffer tracers, explosions and sparks
  view.js          camera, interpolation, drone animation, selection, health bars, picking
ui/         minimap, reaction-script editor, pilot controls + FPV HUD
main.js     input, HUD and the fixed-timestep loop (20 Hz sim, interpolated rendering)
```

**Determinism rules** (enforced by `verify-rts.mjs`): sim code never calls `Math.random/sin/cos/atan2/hypot/pow/exp`, `Date.now` or `performance.now`. It iterates in slot order, uses a seeded RNG stored in the world, and changes state only through commands applied at a tick boundary. The state hash covers positions, velocities, health, cooldowns, targets, economy, structures and squads.

**Drone models were rebuilt.** The old airframes were 120–154k-triangle GLBs (about 1.5 MB each), far too heavy to draw hundreds of at once. Each role is now a few hundred triangles, built procedurally in three instanced layers: a lit faceted hull, team-colored HDR glow strips that bloom, and rotor discs whose spinning blade blur is drawn in a shader. Attitude comes straight from the flight model: the yaw, pitch and roll you see are what the sim is flying. Hits flash the drone and damage darkens the hull. Every drone also casts a soft team-colored light pool on the ground, so swarms read as colored clouds when zoomed out.

## Measured

- 2,000 drones in an active battle: about 12 ms per sim tick in Node (budget 50 ms at 20 Hz).
- AI vs AI matches end in 3–15 minutes with 100–200 drones at peak.
- Replays and repeated runs give identical per-second state hashes.

## Known gaps / next steps

1. **AI difficulty isn't monotonic yet.** Recruit, Veteran and Ace differ in reaction speed, queue depth, defenses and counter-building, but in self-play the higher level wins only about half the time. It needs economy-timing and army-retreat logic tuned with many seeded matches.
2. **Multiplayer transport.** The lockstep core is ready, but no network layer exists yet; see [NETWORK.md](NETWORK.md).
3. **Sim in a Web Worker.** The sim is already isolated; moving it off the main thread is mostly plumbing.
4. Line-of-sight sensors (the lab has them), terrain height in the sim, more maps and 2v2.
5. Operations (campaign) and Challenges built from Training scenarios; Autonomous Arena brain upload/sharing.
6. Mobile touch controls. The HUD is responsive, but input is mouse- and keyboard-first.
7. GPU visual QA on real devices. Cloud screenshots use SwiftShader, which is correct but slow (about 1 fps).
