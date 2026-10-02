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

## Identity: your swarm, your designs

- **Drone Designer** (`Y`, or **＋ Design** in the Produce tab):
  - Pick a **frame** (light, medium or heavy: hull, speed, tilt and turn rate, pack size), a **weapon** (pulse, flak, missile, or rail on medium and heavy frames), a **sensor** (standard, extended, long-range) and a **module** (battery pack, armor plates, jammer, repair kit, relay antenna, shield emitter).
  - The panel shows live stats and a plain-English summary of the tradeoffs.
  - **Register** a design to add it to this match's Produce tab (up to 8 per player); it inherits your research. **Save** keeps it in this browser's library.
  - Designs are lockstep commands, so they replay and will sync in multiplayer. Each design is drawn as its frame plus visible part accessories.
- **Field equations** (research _Field Projector_, tier 2) turn the vector-field lab into structures. Both only affect enemies below 14 m.
  - **Vortex Trap:** enemies inside are swept into a whirlpool (tangential speed rising toward the center, ~1/r) and pulled inward.
  - **Flow Barrier:** a radial outflow that shoves enemies away.
- **Swarm Brains** in the script editor bundle reaction rules with a formation and an altitude band.
  - Load a preset (_Wolfpack_, _Ghost_, _Sky guard_, _Siege line_) or save your own by name.
  - Applying a brain sets all three on the squad.

## Systems: a strategic map

- **Line of sight:** rocks block sensors for anything flying lower than the rock top. High altitude sees over them; ambushes hide behind them.
- **Relay Spires** (capture by holding the ring alone for 8 s): +20 bandwidth and a 30 m sensor sweep. **Derelict Factories** (10 s): two free scouts every 20 s. Contested rings don't progress. Twin Rivers and Crater Ring have both; Delta Basin has Spires.
- **Storms** drift across the map. Inside one, every drone is jammed, 25% slower, sees 40% less and burns battery 50% faster.
- **Salvage:** destroyed drones leave wreckage worth 35% of their cost. The first drone to fly over it collects it, so holding the battlefield pays.
- **Commander abilities** (`F1`–`F3` or the ability bar). Cooldowns recover up to twice as fast while you have fewer drones than the enemy, which is the comeback mechanic.
  - _EMP Strike_: 1.5 s warning, then a 3 s stun in 10 m.
  - _Reinforcements_: 8 scouts dropped near your forces.
  - _Overcharge_: +40% fire rate and +25% damage for 12 s.
- **Hacking:** research _Intrusion Suite_ (tier 3), and jammer drones take over jammed enemy drones they stay within 6 m of for 4 s.
- The AI captures objectives on its half of the map, uses all three abilities and researches hacking.

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

## Modes

| Mode                 | What it is                                                                                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skirmish**         | You vs the AI on any map. Destroy the enemy Command Core.                                                                                                                                                                                                                                                               |
| **Survival**         | A 75 s build phase, then endless waves from the map edges. Each wave is bigger and later ones bring researched, tier 2 and tier 3 units. Clearing a wave pays a bonus and brings the next one sooner. Your best wave count is saved.                                                                                    |
| **Challenges**       | Five fixed-force puzzles, each rated with up to 3 stars (saved): _Blind Their Eyes_ (radar behind kill zones; fly high), _Hold the Line_ (no income, survive 3:00), _Ghost Courier_ (heist: fly the courier low under radar to extraction), _Carrier Strike_ (siege an outpost), _Ace Pilot_ (manual flight, 10 kills). |
| **FPV Race**         | Fly a scout through 10 gates around the mesas. Your best run is saved as a translucent **ghost** that flies alongside you next time.                                                                                                                                                                                    |
| **Autonomous Arena** | Two AIs fight; the auto-director follows the action.                                                                                                                                                                                                                                                                    |

**Maps:** Delta Basin (2 plateaus, open basin), **Twin Rivers** (two rock ridges and fords make three lanes; long games), **Crater Ring** (a ring of rock around a rich center with four gates).

**Squad altitude** (Low / Cruise / High, in the squad panel):

- **Low** (nap of the earth) flies under radar detection.
- **High** clears the 14 m reach of Kill Zones, Jammer Fields and Repair Fields, at the cost of battery spent climbing.

Scenario hostiles (Survival waves and challenge garrisons) are a tethered hive with no batteries to manage. Modes are deterministic sim code, so every mode replays exactly.

## Depth: batteries, research and tiers

- **Batteries.** Every drone has one (seconds of hover; tilt, climb and firing cost more). Drones head home on their own when the charge left is just enough to reach the nearest charger, plus a margin, and recharge at Charging Pads (`K`) or the Core. An empty battery drops the drone out of the sky. This limits how far and how long an attack can push, which makes forward Charging Pads valuable targets.
- **Research Lab** (`L`) runs one project at a time; build more labs to research in parallel. Projects: Tier 2 and Tier 3 airframes, Extended Batteries, Fast Charging, Overclocked Motors, Armor Plating, Optical Camouflage, Wideband Jamming, and a choice between **Flak Bursts** (splash damage) and **Long Flak** (range). Picking one locks out the other.
- **New airframes:**
  - **Lancer** (tier 2): a rail siege drone that outranges Kill Zones and has to aim its whole body.
  - **Warden** (tier 2): projects a shield bubble; allies inside take 40% less damage.
  - **Carrier** (tier 3): a flying hangar that launches and rebuilds 8 short-lived **Wasps**.
- **Defender's advantage.** The Core has 5,000 hp and a flak gun, and buildings repair 1%/s after 8 s without being hit.
- **Reaction scripts** gain a _Battery below_ condition.
- **Touch controls:**
  - One finger drags to pan; tap a drone to select its squad; tap the ground or an enemy to order.
  - Long-press attack-moves; double-tap selects that drone type on screen.
  - Two fingers pinch to zoom and twist to rotate.
  - **Select** turns on drag-to-box mode; **⚒** opens Build, Produce and Research.
  - When flying, two on-screen sticks and a FIRE button appear.

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

## HUD panels

Every panel (Squad, Command, Map, Abilities, Objective, Alerts, Reaction script, Drone designer) is a window:

- **Move:** drag its title bar.
- **Minimize:** **–**, or double-click the title bar.
- **Close:** **×**.
- **Resize:** drag the bottom-right corner (Squad, Command and the editors).

The **☷ Panels** button in the top bar reopens closed panels, sets the interface size (Small / Normal / Large), minimizes everything, hides all panels (also the `` ` `` key) or resets the layout. The layout is saved in this browser, separately for phones and larger screens.

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
5. Operations campaign with a persistent fleet and veterancy (Wave 5); Arena ladder for uploaded swarm brains (Wave 6).
6. GPU visual QA on real devices. Cloud screenshots use SwiftShader, which is correct but slow (about 1 fps).
