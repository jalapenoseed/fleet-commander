# Fleet Commander — Unity

A native C# edition of Fleet Commander for **Unity 6000.6.2f1**. The `unity` branch contains the boot scene, imported aircraft models, command center, simulation, creator tools, persistence, and Windows build entry point. The browser edition is preserved in `../dist`; remaining differences are listed below.

## Open and play

1. In Unity Hub, add **this `unity` folder**, not the repository root.
2. Use Unity **6000.6.2f1** (the version installed on the development PC).
3. Open `Assets/FleetCommander/Scenes/FleetCommander.unity` and press Play. The **Fleet Commander → Open Main Scene** menu opens the same scene.
4. The initial 256-aircraft show launches automatically. Use **Fleet**, **Director**, and **Arena** to explore.
5. Enable sound in **Director → Enable sound**. Sound starts muted.

For a larger Editor view, focus the **Game** tab and press **Shift + Space**. A standalone Windows build opens its own resizable game window; see **Build and verify** below.

No third-party art pack, paid asset, external server, or manually assembled prefab is required. An active Unity Editor license is required to run the Editor and export a player.

## Native systems

| Area | Implemented behavior |
| --- | --- |
| Fleet | 0–10,000 individually stored aircraft, fixed 60 Hz integration, bounded catch-up, launch, return to reserved pads, gravity descent, grounded recharge |
| Aircraft | Imported Scout, Relay, Cargo and Utility models from the existing project asset pack, original PBR maps, simplified distance meshes, animated rotors; six selectable body skins |
| Rendering | GPU-instanced aircraft and colored beacons, HDR bloom and tone mapping, shadows, procedural arena/scenery, compact health and selected-aircraft indicators |
| Formation | Grid, ring, wedge, line, column, double orbit, scatter, staggered, high/low, overwatch, helix, sphere, heart, custom artwork |
| Motion | Orbit, wave, pulse, beat dance; four independent mathematical influence layers with explicit None/reset |
| Boids | Spatial hash with at most 64 candidates and 24 neighbors per drone; separation, alignment, cohesion; obstacle avoidance and formation attraction |
| Squads | Alpha/Bravo/Charlie/Delta formation and offset overrides; individual squad launch/recall |
| Physics | Earth/Moon/Mars gravity and atmosphere flags, constrained Earth-style rotors or arcade lift, material/battery/cargo mass ledger, watt-hour energy consumption |
| Battle | Separate 2–256-aircraft arena, team frame/skin/weapon loadouts, four game behavior styles, manual pilot participation, health and armor, collision damage, limited secondary pulses, waypoint controls, saved settings |
| Destruction | Motor/beacon failure, tumbling aircraft, charred wrecks, lost propellers, debris, sparks, fire, smoke and ground marks; effects follow pause and replay time |
| Scoring | Winner/draw banner, round timer, team kills/damage, personal kills, persistent session win tally, rematches and separate score reset |
| Cameras | Orbit, top, front, follow, FPV, shoulder, mounted, ground, free, cinematic, action, best fight, survivor |
| Replays | 10 Hz, 180-frame rolling recording, copied aircraft/environment/events and round scoreboard, interpolated playback, scrub, pause, 1/8×–2× speed, highlights and JSON export |
| Director | Fireworks, halftime, aurora and galaxy sequences; stadium, coast, alpine and city; day, golden, dusk and night; rain, storm, snow, fog and wind |
| Art Studio | Bitmap lettering, selected emoji/symbols, 32×24 paint canvas, PNG/JPG RGB/outline/silhouette sampling, formation colors |
| Program | Validated bounded command language with timed cues, groups, formations, four fields, shows, words and repeat; no arbitrary code execution |
| Audio | Soft motor audio, muted vacuum ambience, 16-step sequencer, BPM control, WAV/OGG/MP3 music playback, volume/mute |
| Labs | Live mass/energy readout, steering/integration formulas, integer binary/hex conversion, logic gates and half-adder; 1337 and 80085 presets |
| Sessions | Formation challenge, local journal, named JSON save/load, clipboard exchange, version-1 browser fleet migration, screenshots |
| Defaults | Reset Section on each settings page, smaller resets for individual squads/fields/flocking/camera/environment/audio/physics/loadouts; explicit score reset |

The 10,000 count is a **stress ceiling**, not a guaranteed frame rate. The everyday target is 0–2,000. Recording is capped at 2,000 show aircraft; combat has its own 256-aircraft ceiling. No per-aircraft GameObject, Rigidbody, audio source, or point light is allocated.

## Play an arena round

1. Open **Arena**, set aircraft per team, and choose each team's frame, body skin, weapon and behavior.
2. Select **Start Round**. During an existing round, **Apply & Rematch** deploys the selected loadouts with fresh aircraft and ammunition. Match wins survive rematches.
3. Choose **Join Blue**, **Join Red**, or **Pilot Selected Drone** to take a living aircraft. Click the open flight view to capture the mouse and fly; the rest of the fleet stays under AI control.
4. Press **Escape** to release the mouse for menus. **Leave Drone to AI** hands the aircraft back. Destruction, return-to-pad, replay and the end of a round release pilot control.
5. The round ends when one side has no active aircraft, or when its time limit expires. A timed round compares active survivors, then remaining health; equal results draw. The HUD shows the winner, and Arena shows kills, damage and the match tally.

| Weapon | Arcade behavior |
| --- | --- |
| Pulse | Focused single-target shot |
| Rapid Fire | Faster shots with less damage per hit |
| Scatter | Wider cone that can hit up to three enemies |
| Shockwave | Short-range pulse around the aircraft |

Primary weapons use cooldowns. Each aircraft also has three secondary arcade pulses, shown as payloads in the HUD. These apply immediate nearby damage and visual effects; they are not physical dropped projectiles. Scout, Relay, Cargo and Utility have different game speed, agility, armor, energy and mass profiles. These are game balance values, not real aircraft specifications.

**Save Battle Setup** stores loadouts, rules and the match tally. **Load Battle Setup** validates the file before applying settings; use **Apply & Rematch** to deploy its aircraft. **Clear Match Score** clears wins and draws separately from the current round. Battle aircraft and environment settings are separate from the show fleet, which remains available through **Return to Show Fleet**.

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

While piloting, these bindings replace the spectator controls:

| Input | Pilot action |
| --- | --- |
| Click open flight view | Capture mouse and enable flight input |
| WASD / arrow keys | Fly forward/back/sideways relative to heading |
| Space / Ctrl | Ascend / descend |
| Shift | Full-speed boost |
| Mouse | Aim |
| Left mouse button | Fire selected primary weapon |
| Q | Use one secondary arcade pulse |
| C | Cycle shoulder, FPV and mounted views |
| Escape | Release cursor for menus |
| H | Hide/show command center |

Pilot movement is level flight with separate altitude controls. Releasing the cursor stops manual movement/fire input while keeping the aircraft joined; **Leave Drone to AI** returns it to autonomous flight. Opening a command page, pausing, typing or losing application focus releases the cursor. Keyboard shortcuts suspend while editing text. Camera dragging is blocked over command panels. The UI is intended for desktop; touchscreen pinch and painting are included, but mobile builds and touch piloting have not been validated.

## Reset controls

**Reset Section** restores the controls on the current page. Smaller buttons reset only their named subsection: one squad, one mathematical layer, flocking, formation, aircraft appearance, environment, camera, audio, flight/energy settings, round rules or one team's loadout. For show aircraft, choose the model/skin in **Fleet** and apply appearance without rebuilding the roster.

Resets preserve saved files and journal/replay records. Arena defaults preserve match wins; **Clear Match Score** is separate. Resetting program defaults stops playback and restores editable example text. **None / Stop All Motion** disables show patterns, fields and Boids; resetting their defaults restores the standard values instead.

## Build and verify

From PowerShell in the repository:

```powershell
.\unity\Tools\Build-Windows.ps1
```

The script runs the EditMode tests, then builds `unity/Builds/Windows/FleetCommander.exe`. Use `-RunSmoke` to launch the resulting player, exercise all command pages and cameras, capture screenshots, check 2,000 aircraft, and exit automatically. `-Unity` accepts another Editor path. No script activates or changes a license.

Editor menu: **Fleet Commander → Build Windows Player**. If local policy blocks PowerShell scripts, use the Editor menu; these tools do not change execution policy.

Equivalent Editor commands:

```text
Unity.exe -batchmode -nographics -projectPath <unity-folder> -runTests -testPlatform EditMode -testResults <results.xml> -logFile <test.log>
Unity.exe -batchmode -projectPath <unity-folder> -executeMethod FleetCommander.Editor.FleetBuild.BuildWindows -quit -logFile <build.log>
```

The regression suite covers formations, scoped resets, reproducibility, bounded neighbor work, return/landing, energy, constrained planetary descent, weapons and armor, manual flight input, kill credit, winner/draw logic, rematches, replay isolation/capacity/scoreboard, saves, browser migration, grouped cues, and artwork. The player smoke harness checks the assembled scene, eight model/LOD assets, UI pages, cameras, battle/destruction, pilot API transitions, replay, score/reset isolation, screenshots and 2,000-aircraft timings. Mouse capture and input feel still need an interactive check on the PC.

**Verification status:** see `VALIDATION.md`. Do not equate a successful C# compilation or portable logic check with a completed Unity player/GPU test.

## Save format and interoperability

Native saves use `kind: fleet-commander-unity`, version 1. They contain show aircraft, position/velocity, health, battery, frame/skin/weapon/color/team, environment, group settings, fields, art points, elapsed time, and program source. Existing version-1 files remain readable: absent skin and weapon fields use Graphite and Pulse. Loads validate the data before replacing the session and start paused. A saved program is restored as editable source; running its timeline is an explicit action. Music files remain on the user's filesystem and are not embedded. Battle setup/score is saved separately; a fleet save does not resume an in-progress arena round or pilot input.

Browser `fleet-commander-fleet` / `gridrunner-commander-fleet` version-1 saves import roster, team, color, frame, basic formation, four common field settings, battery options, and script source. Browser runtime-only state, arbitrary browser-specific DSL commands, art tuples, route editors and browser-only labs are not silently translated. Review imported scripts before running; unsupported commands produce an error before any cue executes.

Native fleet saves, journal, battle setup, exported replay and screenshots live in `Application.persistentDataPath`, available through **Saves → Open save folder**.

## Translation boundaries

This port replaces the browser renderer and DOM interface with native Unity equivalents. It does not embed the browser app. The following remain browser references or later fidelity work:

- The four detailed aircraft are now ported from the browser's existing GLB pack, with original UVs/material surfaces and PBR maps. The scene and lighting remain native Unity implementations, with procedural scenery rather than a complete port of browser graphics controls.
- The browser's Rapier rigid-body combat and physical contact-detonated payloads. Unity uses bounded arcade movement, overlap collision handling and instant game attacks, with animated tumble/debris visuals rather than a full rigid-body fracture system.
- Full coach-board route drawing and the browser's entire script dialect. Unity has squad offsets, team waypoints and a documented native cue language.
- The browser's repeated-round scheduling, scenario ratings/recommendations, color-hunt and pass-and-play challenges. Unity currently offers scored manual rematches, a formation challenge and a simple journal.
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
- `Scripts/Core/DroneCatalog.cs`: aircraft profiles, skins and arcade weapon definitions.
- `Scripts/Core/FleetDefaults.cs`: section-scoped defaults.
- `Scripts/UI/CommanderUI.cs`: native UI Toolkit command center.
- `Scripts/Systems/DronePilot.cs`: player flight input, cursor capture and pilot camera poses.
- `Scripts/Systems`: validated cues, artwork, saves, replay, journal and audio.
- `Scripts/Rendering`: instancing, environment, weather, effects and bloom.
- `Scripts/Cameras/DroneCameraRig.cs`: camera direction and desktop/touch controls.
- `Editor/FleetBuild.cs`: project configuration and Windows export.
- `Tools/Generate-DroneModels.py`: converts the repository's existing aircraft assets and generates simplified distance meshes.
- `Tests/EditMode`: native Unity regression tests.
