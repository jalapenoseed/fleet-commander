# Fleet Commander — Unity

A native C# edition of Fleet Commander for **Unity 6.2 / 6000.2.1f1**. This is a complete runtime project on the `unity` branch, with a boot scene, procedural rendering, command center, simulation, creator tools, persistence, and Windows build entry point. The browser edition is preserved in `../dist`.

## Open and play

1. In Unity Hub, add **this `unity` folder**, not the repository root.
2. Use Unity **6000.2.1f1** (the version installed on the development PC).
3. Open `Assets/FleetCommander/Scenes/FleetCommander.unity` and press Play. The **Fleet Commander → Open Main Scene** menu opens the same scene.
4. The initial 256-aircraft show launches automatically. Use **Fleet**, **Director**, and **Arena** to explore.
5. Enable sound in **Director → Enable sound**. Sound starts muted.

No third-party art pack, paid asset, external server, or manually assembled prefab is required. An active Unity Editor license is required to run the Editor and export a player.

## Native systems

| Area | Implemented behavior |
| --- | --- |
| Fleet | 0–10,000 individually stored aircraft, fixed 60 Hz integration, bounded catch-up, launch, return to reserved pads, gravity descent, grounded recharge |
| Rendering | GPU-instanced quad hulls and colored beacons, HDR bloom and tone mapping, shadows, procedural arena/scenery, compact health indicators |
| Formation | Grid, ring, wedge, line, column, double orbit, scatter, staggered, high/low, overwatch, helix, sphere, heart, custom artwork |
| Motion | Orbit, wave, pulse, beat dance; four independent mathematical influence layers with explicit None/reset |
| Boids | Spatial hash with at most 64 candidates and 24 neighbors per drone; separation, alignment, cohesion; obstacle avoidance and formation attraction |
| Squads | Alpha/Bravo/Charlie/Delta formation and offset overrides; individual squad launch/recall |
| Physics | Earth/Moon/Mars gravity and atmosphere flags, constrained Earth-style rotors or arcade lift, material/battery/cargo mass ledger, watt-hour energy consumption |
| Battle | Separate 2–256-aircraft arcade skirmish, two teams, abstract pulse attacks, four game behavior styles, health, payloads, falling wrecks, survivors, waypoint controls, saved settings |
| Cameras | Orbit, top, front, follow, FPV, shoulder, mounted, ground, free, cinematic, action, best fight, survivor |
| Replays | 10 Hz, 180-frame rolling recording, isolated pose/environment/event copies, interpolated playback, scrub, pause, 1/8×–2× speed, highlights and JSON export |
| Director | Fireworks, halftime, aurora and galaxy sequences; stadium, coast, alpine and city; day, golden, dusk and night; rain, storm, snow, fog and wind |
| Art Studio | Bitmap lettering, selected emoji/symbols, 32×24 paint canvas, PNG/JPG RGB/outline/silhouette sampling, formation colors |
| Program | Validated bounded command language with timed cues, groups, formations, four fields, shows, words and repeat; no arbitrary code execution |
| Audio | Soft motor audio, muted vacuum ambience, 16-step sequencer, BPM control, WAV/OGG/MP3 music playback, volume/mute |
| Labs | Live mass/energy readout, steering/integration formulas, integer binary/hex conversion, logic gates and half-adder; 1337 and 80085 presets |
| Sessions | Formation challenge, local journal, named JSON save/load, clipboard exchange, version-1 browser fleet migration, screenshots |

The 10,000 count is a **stress ceiling**, not a guaranteed frame rate. The everyday target is 0–2,000. Recording is capped at 2,000 show aircraft; combat has its own 256-aircraft ceiling. No per-aircraft GameObject, Rigidbody, audio source, or point light is allocated.

## Controls

| Input | Action |
| --- | --- |
| Mouse drag | Orbit/look |
| Wheel / touch pinch | Zoom |
| WASD / arrow keys | Ground/free camera movement |
| Q / E | Free camera down/up |
| Shift | Faster camera movement |
| Space | Pause/resume live session or replay |
| Tab | Next drone |
| C | Cycle camera |
| F8 | Cinematic camera |
| B | Selected arena drone's arcade payload |
| H | Hide/show command center |
| Escape | Exit replay |
| / | Search controls on the current page |

Keyboard shortcuts suspend while editing text. Camera dragging is blocked over the command panels. The UI is intended for desktop; touchscreen pinch and painting are included, but an Android/iOS build has not been validated.

## Build and verify

From PowerShell in the repository:

```powershell
.\unity\Tools\Build-Windows.ps1
```

The script runs the EditMode tests, then builds `unity/Builds/Windows/FleetCommander.exe`. Use `-RunSmoke` to launch the resulting player, exercise all command pages and cameras, capture screenshots, check 2,000 aircraft, and exit automatically. `-Unity` accepts another Editor path. No script activates or changes a license.

Editor menu: **Fleet Commander → Build Windows Player**.

Equivalent Editor commands:

```text
Unity.exe -batchmode -nographics -projectPath <unity-folder> -runTests -testPlatform EditMode -testResults <results.xml> -logFile <test.log>
Unity.exe -batchmode -projectPath <unity-folder> -executeMethod FleetCommander.Editor.FleetBuild.BuildWindows -quit -logFile <build.log>
```

The regression suite covers formations, fields/reset, reproducibility, bounded neighbor work, return/landing, energy, constrained planetary descent, battle bounds/damage, replay isolation/capacity, saves, browser migration, grouped cues, and artwork. The player smoke harness additionally checks the assembled scene, UI pages, all camera modes, battle, replay and rendering on a real GPU.

**Verification status:** see `VALIDATION.md`. Do not equate a successful C# compilation or portable logic check with a completed Unity player/GPU test.

## Save format and interoperability

Native saves use `kind: fleet-commander-unity`, version 1. They contain show aircraft, position/velocity, health, battery, frame/color/team, environment, group settings, fields, art points, elapsed time, and program source. Loads validate the data before replacing the session and start paused. A saved program is restored as editable source; running its timeline is an explicit action. Music files remain on the user's filesystem and are not embedded.

Browser `fleet-commander-fleet` / `gridrunner-commander-fleet` version-1 saves import roster, team, color, frame, basic formation, four common field settings, battery options, and script source. Browser runtime-only state, arbitrary browser-specific DSL commands, art tuples, route editors and browser-only labs are not silently translated. Review imported scripts before running; unsupported commands produce an error before any cue executes.

Native fleet saves, journal, battle setup, exported replay and screenshots live in `Application.persistentDataPath`, available through **Saves → Open save folder**.

## Translation boundaries

This port replaces the browser renderer and DOM interface with native Unity equivalents. It does not embed the browser app. The following remain browser references or later fidelity work:

- Detailed imported GLB drone/scene assets and the browser's custom lighting pipeline. Native aircraft and scenery currently use procedural meshes.
- Full coach-board route drawing and the browser's entire script dialect. Unity has squad offsets, team waypoints and a documented native cue language.
- Arbitrary operating-system emoji/font rasterization. Native symbols currently include heart, star, smile and robot; ASCII letters/digits use a deterministic bitmap font.
- Encoded video export, replay-file import and a full multitrack music workstation. Unity provides screenshots, replay-data export, external music and a step sequencer.
- Fluid simulation and the full browser lab widget collection. Native Nerd Lab exposes the implemented flight/energy math and basic logic tools.
- Research-grade aerodynamic fidelity, real-world weapon models, and machine-learning training. Battle adaptation is bounded game behavior, not a learned flight controller.

## Code map

- `Scripts/FleetBootstrap.cs`: assembles the game and camera.
- `Scripts/Core/FleetWorld.cs`: double-buffered flight/energy and separate arcade battle state.
- `Scripts/Core/SpatialHash.cs`: bounded local-neighbor work.
- `Scripts/Core/FormationMath.cs`: shapes, patterns and influence layers.
- `Scripts/Core/SwarmSimulator.cs`: fixed-step scheduling and system coordination.
- `Scripts/UI/CommanderUI.cs`: native UI Toolkit command center.
- `Scripts/Systems`: validated cues, artwork, saves, replay, journal and audio.
- `Scripts/Rendering`: instancing, environment, weather, effects and bloom.
- `Scripts/Cameras/DroneCameraRig.cs`: camera direction and desktop/touch controls.
- `Editor/FleetBuild.cs`: project configuration and Windows export.
- `Tests/EditMode`: native Unity regression tests.
