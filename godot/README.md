# Fleet Commander — Godot 4 port

This folder is a playable native Godot port of Fleet Commander. It lives only on the repository's
`godot` branch; the browser edition remains under `../dist` as the feature and visual reference.

## Open and run

1. Install Godot 4.3 or newer.
2. In Godot Project Manager, choose **Import**.
3. Select this folder's `project.godot`.
4. Press **F6** or **F5**.

The project has no addon requirement and boots without external art. It builds the arena, proxy
aircraft, environment, lights, interface, and audio procedurally. The approved high-detail browser
GLBs remain untouched in `../dist/assets/drones`; a later art pass can import decompressed copies as
near-camera LODs without changing simulation bodies.

## Controls

| Control            | Action                                   |
| ------------------ | ---------------------------------------- |
| Left drag          | Orbit or look around in directed cameras |
| Mouse wheel        | Zoom                                     |
| `W A S D` / arrows | Move ground/free camera                  |
| `Q` / `E`          | Move free camera down/up                 |
| `Space`            | Pause/resume live simulation or replay   |
| `Tab`              | Select next aircraft                     |
| `C`                | Cycle camera                             |
| `F8`               | Cinematic camera                         |
| `B`                | Drop selected combat payload             |
| `H`                | Hide/show command interface              |
| `/`                | Focus Find a control                     |
| `Escape`           | Exit replay                              |

The visible command center has twelve pages: Arena, Squads, Fleet, Program, Art Studio, Director,
Physics, Nerd Lab, Replays, Journal, Challenges, and Saves. Frequent Launch/Pause/Land/Payload and
team-count controls stay in the top bar.

## What is native now

- 0–10,000 independently stored show aircraft using packed structure-of-arrays data.
- One GPU `MultiMesh` batch for proxy bodies and one for beacons—never 10,000 scene nodes/lights.
- Grid, ring, wedge, line, column, double-orbit, scatter, staggered, high/low, overwatch, helix,
  sphere, and heart formations.
- Four mathematical influence slots and an explicit None/reset so old effects cannot stick.
- Optional spatial-hash Boids: separation, alignment, cohesion, obstacle avoidance, target attraction,
  and velocity matching, bounded to 24 nearby candidates.
- Finite battery drain, distance-aware reserve return, empty-battery descent, recharge, and relaunch.
- Earth, Moon, and Mars gravity/air-density rules with playable Arcade lift or constrained rotors.
- Separate deterministic game-AI combat for 2–256 aircraft with targeting, evasion, retreat, damage,
  collisions, payloads, falling wrecks, team counters, and bounded visual effects.
- Orbit, top, front, follow, FPV, shoulder, mounted, ground, free, cinematic, Cinematic Action,
  Best Fight, and Longest Survivor cameras.
- Combat-only 10 Hz / 180-frame replay buffer, automatic highlights, manual last-eight-second clip,
  isolated interpolation, smart 1/8 slow motion, and 1/8×–2× playback rates.
- Procedural arena/scenery, exact shared obstacle envelopes, planet sky overrides, weather/fog/wetness
  hooks, and muted-by-default procedural drone/weather audio with no microphone use.
- Browser-compatible version-1 fleet JSON loading and a local `user://` save.

## Important scale rule

The 10,000-aircraft show and the combat arena are deliberately separate. The show uses packed
kinematic state and MultiMesh drawing. Combat uses a much smaller state with collision, damage, AI,
and replay. Making 10,000 `Node3D` or `RigidBody3D` aircraft would destroy performance and is not the
design of this port. Ten thousand is an experimental storage/correctness stress ceiling, not a
smooth-frame-rate promise; use a smaller roster for interactive choreography on ordinary hardware.
The camera samples a bounded representative cast for framing while the renderer and simulation keep
the full roster.

## Tests

```bash
godot --headless --path godot --editor --quit
godot --headless --path godot --script res://tests/test_runner.gd
godot --headless --path godot --quit-after 10
```

The suite validates planet/energy math, every formation, reset behavior, batteries, 10,000 packed
aircraft, the 256 combat cap, lethal damage and landed retreats, action events, replay isolation,
context and speeds, all camera modes, browser save migration, physics-setting persistence, and
assembled scene wiring. Headless tests validate behavior and resource loading; they do not prove
final GPU frame rate, speaker mix, or visual polish on every device.

## Start reading the code

1. `scripts/main.gd` — connects every system.
2. `scripts/simulation/fleet_simulation.gd` — flies the large show fleet.
3. `scripts/simulation/formation_library.gd` — calculates formation parking spaces.
4. `scripts/simulation/boids_solver.gd` — adds local flocking suggestions.
5. `scripts/simulation/combat_system.gd` — runs the smaller dogfight game.
6. `scripts/rendering/swarm_renderer.gd` — draws packed aircraft with MultiMesh.
7. `scripts/camera/camera_director.gd` — chooses every camera shot.
8. `scripts/replay/replay_system.gd` — records and watches pose copies.
9. `scripts/ui/commander_ui.gd` — builds menus and emits requests.

Search for `ELI5:` throughout these files. Coordinates use metres, time uses seconds, speed uses
metres per second, gravity uses m/s², mass uses kg, and battery capacity uses Wh.

## Current native-port boundary

The core game loop and defining simulator systems are native. The browser's detailed GLB LOD,
custom multi-pass bloom, full pixel-image importer, coach-board route editor, step sequencer, encoded
video export, low-resolution fluid visualization, complete logic-gate widgets, and journal editor
remain available in `../dist` as translation references. Their command pages and data boundaries are
already reserved in the native UI; they should be ported incrementally without coupling them to the
flight controller.
