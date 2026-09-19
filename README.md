# Fleet Commander

A standalone drone swarm game and flight lab, branched from GRIDRUNNER v7.40 at `a9a64002ff4536eee819654cd5e45d4964765255`.

Branch: `fleet-commander-standalone`. Open `dist/index.html` through the Vite server or the hosted Site. `commander.html` redirects to the root.

## Play

- Build **0–10,000** individually simulated aircraft. Zero clears the field; 5,000 and 10,000 are experimental stress-test sizes.
- Launch, land, select by color/team/type, or inspect a single drone. Four retained airframe GLBs and procedural distance models render the same simulation bodies. Beacons never stand in for nonexistent aircraft.
- Program formations, Boids, four mathematical influence layers, drawn paths, word sequences, choreography and timed group scripts. None/reset controls are independent.
- Games: formation drill, beacon hunt and pass-and-play party relay.
- Save named fleets in this browser or export/import JSON. Legacy Commander exports are accepted; the new file kind and storage namespace are independent.

## Battery tests

Finite battery is enabled by default. Set ¼×, 1×, 5× or 10× drain; the addressed group can be assigned a test charge. Consumption depends on movement. A conservative distance-aware reserve starts return; zero charge starts emergency descent. Recharge parked aircraft and relaunch them without replacing identities. Unlimited freezes drain. Scored rounds lock charge injection, recharge and field settings. Values are a game test model, not specifications for physical aircraft.

## Extraction

The shipped dependency graph contains only the Commander and drone assets: no GRIDRUNNER world, rider, bike, campaign, story unlocks, inventory or survival runtime. Control-station and charger anchors replace the former rider/bike props. Script names `operator` and `bike` remain compatibility aliases for these fixed anchors.

The original GRIDRUNNER checkout and published game are unchanged. The new Site has its own identity and origin. Existing fleet saves can be transferred via JSON export/import.

## Development

`npm ci` installs the pinned dependencies. `npm run dev` opens the Vite development server. `npm test` runs the Commander, UI, and standalone validation gates. Static assets under `dist` are the authored source and deployment output; no build step is required.

`npm run format` formats the authored HTML, CSS, JavaScript, JSON, and Markdown with the pinned Prettier version. `npm run format:check` verifies that formatting in CI or before a commit. Third-party Three.js, Rapier, GLTF utilities, and binary art assets are deliberately excluded.

The `eli5` branch adds beginner-facing comments without changing the production branch. Start with [the ELI5 code map](docs/ELI5-CODE-MAP.md), then search the source for `ELI5:` to find measurements, positions, limits, and other safe editing points beside the code that uses them.

Tests cover zero/5,000/10,000 aircraft, unique simulation identities and launch pads, independent energy/velocity, large formation targets, Boids, JSON migration/roundtrips, battery reserve/depletion/recharge/relaunch, scored controls, and absence of campaign dependencies. Four detailed airframe files are checked as valid embedded-buffer GLBs.

Cloud-browser inspection covered the real controls, empty fleet, launch, charge injection, emergency landing and relaunch in tactical fallback. This browser lacks WebGL; detailed GPU appearance remains device QA. In this environment 10,000 drones with Boids took roughly 375 ms per CPU simulation step. This is an experimental capacity limit, not a smooth-frame-rate promise. Every drone continues to be simulated at high counts; rendering changes only its level of detail.

## Arena cameras, weather and Nerd Lab / 0.9

- **Camera direction:** Cinematic Action follows active attacks and recent crashes, Best Fight frames the strongest opposing pair, and Longest Survivor stays with its aircraft until that subject is lost. All three are available from the field toolbar, Arena controls, starting-camera menu and replay camera menu.
- **Slow-motion replay:** highlight cards have Watch and Slow-mo actions. Playback supports 1/8, 1/4, 1/2, normal and 2× speeds; Smart slow-mo ramps to 1/8 around the captured impact, loss, last stand or close call. Replay remains pose playback isolated from the live physics world.
- **Weather:** clear, heavy-rain, thunderstorm and extreme-squall presets expose rain, wind, direction, gusts, clouds, fog, lightning and flash brightness. Independent screen, visual, physics and audio strengths affect FPV interference, visibility/wet surfaces, drift/stabilization/battery load, rain/wind/thunder sound and simulated RF link. Moon disables terrestrial rain/lightning and atmospheric wind; Mars uses reduced game wind.
- **Fluid Lab:** optional wind uses a small 2D incompressible field with advection, viscosity and pressure projection. The live vector view and equations are educational visualization, not validated engineering CFD.
- **Sound:** six bounded nearby motor voices change pitch, harmonic character and level by scout/relay/cargo/engineer airframe, motor count, speed/load, distance and damage. Drone, weather and impact buses have separate mix controls. Audio still begins only after a user gesture and never requests microphone input.
- **Creative and logic tools:** Art Studio rasterizes emoji locally before the existing RGB/outline/silhouette and depth-layer pipeline. Math & Science / Nerd Lab labels model fidelity, shows live motion/wind/battery/RF values, provides Boolean gates, truth tables, a full adder, decimal/binary/hex registers with 1337 and 80085 presets, and opt-in low-battery/weather fleet rules.

The new regression gate exercises all three cameras, smart replay rates, fluid stability, weather coupling, logic/register results and per-airframe audio profiles. The portable suite also retains the full fleet, arena, UI, replay, graphics and standalone checks.

## Swarm Director / 0.2

The default **Director** tab contains four looping shows: Firework ballet (96 s), Halftime spectacular (128 s), Northern ribbons (96 s), and City of stars (96 s). A show applies a timed program to the current fleet and launches it. All targets remain within the expanded field even at 10,000 bodies. Transitions ease over eight seconds; the existing acceleration, separation, speed and battery simulation still moves the same aircraft. Shows do not recharge aircraft or replace their identities. Recalling, editing, and battery tests continue to work. Programs can be inspected in Program and saved/exported as usual.

**Cameras:** selected-drone FPV follows its position, heading and attitude, hiding only the camera aircraft's own mesh and lamp. Choose its number or use previous/next. Ground FPV starts at 1.7 m; drag to look, focus the field and use WASD/arrows to walk, or hold the touch buttons. Reset spectator looks at the swarm again. Cinematic cycles six shots, selecting fast moving real drones for chase/FPV and framing the current airborne bounds for wider views. Choose a 5/8/12/20-second cut interval or advance a shot manually. Pausing freezes automatic camera movement; reduced motion holds automatic cuts.

**Stages:** stadium, coast, alpine valley and city waterfront. Five skies range from clear daylight to stars, changing sky gradient, horizon, fog, sun/moon and lighting. Scenery is decorative and separate from the explicit practice obstacles. Scenery and sky persist on this browser; they are not part of fleet JSON.

**Capture:** clean camera view expands the field and hides interface overlays; Escape or Exit restores controls. Record video captures the canvas at a requested 30 fps, silently, excluding HTML controls. Stop downloads WebM or MP4 according to browser support. Recording automatically stops at five minutes, approximately 256 MB, or when the page is hidden. Actual frame rate depends on the device and swarm size. Camera, scenery and recording controls clearly disable when WebGL or MediaRecorder is unavailable.

New tests cover distinct targets across 1–10,000 drones, timeline boundaries/loops, unchanged bodies and charge on show start, camera transforms and six cuts, empty fleets, pause/reduced motion, scenery construction, UI controls and recording lifecycle with a mock codec. The actual cloud browser was checked in its tactical fallback; GPU rendering and real video encoding require a WebGL-capable device for final visual QA.

## Physical rendering / 0.3

The renderer now uses a linear HDR scene target, multisampling, thresholded separable bloom, and a single ACES/sRGB output transform. Bright aircraft beacons retain small visible emitters with a restrained optical glow. Devices without floating-point color buffers use direct physical rendering; Performance deliberately bypasses the HDR passes.

Sky lighting now includes an analytic sun/moon disc and forward haze, layered noise clouds, ambient light, and a PMREM environment generated from the current sky for material reflections. The sun casts PCF soft shadows around the visible foreground; nearby detailed aircraft also cast shadows. The existing GLB airframes retain their PBR maps. Repeated surface shaders add albedo variation, microscopic relief and roughness to concrete, turf, stone and metal. Glass facades have lit window cells. Water uses animated surface normals and reflects the sky environment; this is not screen-space reflection of aircraft/buildings or ray tracing.

Scenery is rebuilt with a continuous mountain height field, instanced conifers/rocks, a tiered stadium with seats/canopy supports/floodlights, and a skyline with glass facades, setbacks, roof equipment and waterfront structures. Practice obstacles keep their existing collision bounds and gain doors, panel joints, roof vents and fixtures. Distant scenery is decorative. The simulation's whole ±1024 m square remains flat; terrain relief begins outside it. Overview has a lower camera angle so the horizon is visible, and the practice grid is opt-in.

Director → Stage & atmosphere includes Performance/Balanced/Cinema, bloom, clouds, wetness, haze and grid controls. Preferences persist on this browser. Quality changes resolution, shadow maps (1024/2048/4096) and detailed-aircraft range, never the number of simulated bodies. Large fleets remain CPU-heavy; Cinema is an optional GPU cost, not a promise of 10,000-drone real-time playback.

Validation: scene construction across all 20 scenery/sky combinations, geometry finiteness, shadow focus, quality/capability fallbacks, resource disposal, and Director/fleet UI regression tests passed. Nine complete shader pairs (six physical materials with instancing/lights/shadows/fog, sky, bloom blur, composite) compiled and linked under Mesa OpenGL ES 3.2. `npm run test:shaders` repeats that optional native shader check on Linux with EGL/Mesa; `npm test` is the portable suite. Browser controls were inspected, but the cloud browser explicitly disables WebGL, so final full-scene GPU appearance/frame rate was not visually verified here.

### Swarm lighting (0.4)

Open **Director → Stage & atmosphere → Drone lighting**. Choose **Night show** for bright colored aircraft against a dim stadium, **Cinematic** for blue hour, **Aircraft inspection** for daylight, or **Natural** to reset. Exposure, beacon brightness, light spill, stage lamps, bloom amount and bloom spread are independent; preferences save in this browser. Graphics quality remains a separate choice.

The renderer uses a three-scale HDR bloom pyramid, a color-preserving filmic output, pixel-filtered beacon cores and atmospheric attenuation. A stable pool of 4 / 8 / 12 nearby point lights (Performance / Balanced / Cinema) illuminates physical materials. Low-altitude aircraft also contribute instanced, additive ground light pools. Those pools are a flat-field, unshadowed approximation, suppressed near range obstacles; they are not ray-traced reflections or global illumination. Existing sky reflections, sun shadows and wet materials remain available. No drone simulation, battery rules, Boids or choreography were replaced.

`node verify-swarm-lighting.mjs` checks empty and 10,000-body lighting, bounds, slot stability, reset, exposure, stage dimming and disposal. `npm run test:shaders` compiles/links 11 shader programs using native Mesa EGL. The hosted browser used for QA has WebGL disabled, so full-scene GPU appearance and device frame rates still need a WebGL-capable device. The game retains its tactical fallback.

### Drone arena, weather and touch cameras (0.5)

Open **Combat → New 24-drone skirmish → Engage dogfight**, or prepare your current fleet (2–256 aircraft). Cyan friendlies and orange hostiles each have wedge, line, shield-ring and split-pincer formations. Interceptors pursue opposing aircraft; cargo, utility and selected scouts make overhead payload runs. You can drop from the selected aircraft with **B** or the **Drop payload** button. Payloads have limited ammo, a cooldown, inherited velocity, gravity and contact detonation. Friendly blast damage is opt-in; physical collisions always affect both sides.

Combat uses a local, lazy-loaded Rapier WASM rigid-body world at fixed 60 Hz, with continuous collision detection, masses, impulses, friction and restitution. Simplified spherical aircraft hulls collide with each other, dropped payloads, the ground and the explicit practice buildings/station masts. Decorative distant scenery remains non-colliding. Damage and flight control are game abstractions. Hull failure disables motors and beacons; the aircraft tumbles under gravity as a charred, deformed model that stays on the ground. Reset repairs and re-arms the battle. Exit (or Free flight) restores the original show setup, and closing the page never saves the temporary battle roster over it. Show mode still supports 10,000 aircraft; combat is deliberately capped at 256.

**Director → Sound & lightning** enables procedural rotor, impact, payload, blast and delayed-thunder audio. Sound starts muted, requires a user gesture, has an independent volume, and silences when paused or hidden. Lightning is optional; manual strikes have a safety interval, while reduced flashes/reduced motion suppress the scene flash light. **Sky → Pitch black · moon & stars** removes environmental, sun, stage, window and station lighting while keeping the moon, stars and drone emitters. Turn lightning off for uninterrupted beacon-color tests.

**Mobile camera:** pinch the field or tap **＋ / −** to zoom; drag to orbit. **Free look** allows touch look-around, with directional and ascend/descend buttons under Director camera controls. FPV also supports drag-look and zoom. Reset view restores framing. Touch gestures never accidentally move the objective after a pinch. Camera controls remain usable while simulation is paused; without WebGL, zoom works in the tactical fallback and 3D-only controls clearly disable. Canvas recordings remain silent.

Validation includes actual Rapier dogfights and high-speed impacts, contact explosions, wreck settling, maximum-capacity formation staging, show/save isolation, DOM combat controls, touch gesture dispatch, audio-event ordering, all existing regression gates, and 12 native GLSL shader programs. Browser controls, battles and gesture-unlocked audio were exercised in tactical fallback. Full-scene GPU appearance, audible mix quality and mobile frame rates still require device QA.

### AI battle controls and audible sound (0.6)

**Combat → Start AI battle** now launches a complete autonomous round with one tap. Pick Mixed skirmish, Collision dogfight, Payload hunt or Long survival; choose 2–256 aircraft and an overview, FPV or cinematic starting camera. Each faction has independent mixed/interceptor/bomber/evasive tactics. The deterministic game AI retains targets between decision intervals, distributes attacks, makes overhead payload runs, breaks away after release, evades close threats and separates from allies. Damaged aircraft can withdraw. Round limits and optional repeat rounds support continuous tests; pause stops the repeat countdown, and exit still restores the original show fleet.

**Combat tuning** applies speed, damage, attack commitment, evasion, decision interval, retreat threshold and payload cooldown changes live. 0× damage disables collision/blast damage while preserving physics and battery failure. **FPV tuning** adds FOV, look sensitivity, horizon stabilization, rotation smoothing and camera tilt, with Balanced/Comfort/Airframe presets, faction-filtered subject cycling, automatic switching after a loss and a compact aircraft status overlay. FPV is an observer camera; the AI flies the aircraft. All tuning saves locally in `fleetcommander.arena.v1`.

**Sound** and **Test sound** are always visible beside the field. Starting an AI battle enables audio within the initiating tap when Sound on start is checked; muting clears that preference. Test sound plays two midrange tones even with the simulation paused. The default Arena mix keeps rotor/impact sounds audible at overview distances; Camera distance retains stronger attenuation. The volume range is 0–100%, with a bounded voice pool and compressor. The UI reports muted, paused, interrupted and playing states, and shows an analyser-derived output meter. A subsequent touch resumes an interrupted audio context. Optional `navigator.audioSession` playback routing is feature-detected; audio input is never requested. See [AudioContext interruption behavior](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state) and [AudioSession playback routing](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type).

Validation: all four AI presets produced actual collisions/payload action; live tuning, retreat, round expiry/repeat, original fleet restoration and FPV transforms passed. Audio tests verify synchronous gesture resume, graph reuse, overview gain, paused test tones, interrupted recovery, mute and disposal. In the real browser the analyser meter showed nonzero battle/test output, then zero when muted/paused. Cloud QA cannot verify the user's phone speakers, silent/output settings, or full-scene WebGL rendering; those remain device checks. Recordings still exclude audio.

### Combat cameras, coaching and creative tools (0.7, refined in 0.8.1)

- **Live team counts:** the cyan Friendly and orange Hostile strips show flying/total, returning, landed and downed aircraft. Falling wrecks stop counting as flying immediately. The optional recorded HUD includes the flying counters.
- **Cameras:** Shoulder keeps the drone visible from a raised rear-quarter angle; Top mount looks over its airframe. True FPV hides the camera drone and adds altitude, speed, hull, battery, current AI activity and target boxes. Boxes are simulation telemetry, not computer vision or YOLO. Combat camera follows close engagements and switches to aircraft losses; pause freezes it.
- **Squads / coach board:** choose a preset or start blank, draw routes for six squads, and set each squad's airframe, tactic, altitude, delay and route-end action. Set each team's size independently. Run applies the plan; save on-device or import/export JSON.
- **Art:** pixel/freehand paint, erase and undo on a 16–64-cell grid, or import an image as RGB, contrast outline or dark silhouette. Apply to the existing fleet or explicitly replace it with one drone per lit pixel (up to 4,096). Outline previews are black on white; aircraft use a visible chosen light color. Fleet files retain applied art, music patterns and notes.
- **Music:** a six-track, sixteen-step beat maker and immediate preview work before launch. Upload and preview a track, optionally save/restore it on this device, or sync it to a fleet or battle. Uploaded audio is not embedded in fleet JSON. Large shows remain CPU-heavy and can affect sound timing.
- **Recording:** this supersedes the earlier silent-capture behavior. Capture can include enabled game audio, music, metronome and the digital HUD, with no microphone access. Stop downloads the browser-supported MP4/WebM; Save again and supported system sharing remain available for the latest clip until the page closes. Canvas capture also supports tactical fallback where the browser provides MediaRecorder.

Automated tests cover real rigid-body team losses, landed/returning counts, camera transforms and pause, coach orders, 4,096 unique art targets, music preservation, save/load, and mocked audio/recording lifecycle. Browser checks verified the live counters falling during a battle and custom team sizes. Full-scene GPU appearance, real mobile audio output and encoded-video playback still need on-device verification.

### Command center and simulation lab (0.8)

- **Menus:** a compact command rail, a separate **Squads** board, collapsible groups, a mobile inspector drawer, and **Find a control** (`/`). Existing show, fleet, art, music, camera, combat and save tools remain available.
- **Physics:** Earth, Moon and Mars environments with reference gravity and representative atmospheric density. Falling arena objects and cosmetic fragments use the selected gravity. **Constrained Earth-style rotors** cannot sustain flight on Moon/Mars; **Arcade lift** is a clearly labeled fictional option. Constrained worlds do not allow an arena launch until arcade lift is selected.
- **Components:** an illustrative per-quad material/mass ledger, total kg and weight in N, battery Wh, baseline flight/electronics W, and a constant-draw energy budget. Optional Wh-based consumption and mass-dependent arcade acceleration apply to non-combat free flight. Component settings export as JSON. They are not verified hardware specifications or predicted aircraft performance.
- **Replays:** an 18-second, 10 Hz rolling pose buffer for arenas of up to 256 drones. Impacts, aircraft losses and near misses create up to six seven-second highlights; manual capture keeps eight seconds. Scrub, use 1/8 through 2× speed, choose action/best-fight/survivor/overview/side/shoulder/FPV cameras, and export/import JSON. Watching pauses the live world and resumes it unchanged. Clips are session-local unless exported. Debris visuals are recreated; audio is not stored in pose replays.
- **Journal:** the last 100 completed game rounds save on this browser. Ratings and variety recommend the next existing arena scenario; optional automatic recommendation runs when Start AI battle is pressed. Export/import merges records. This is a preference recommender, not learned targeting or new aircraft tactics.
- **Graphics:** lunar vacuum lighting without fog/clouds, dusty Martian lighting, cratered distant terrain, instanced rocks, bounded physical-material debris, impact lights, smoke and shock rings. No atmospheric smoke/rings on the Moon. Fragments are cosmetic; detailed breakable airframe topology and colliding terrain are future work.

The new source includes the preceding 0.7 camera mounts, digital HUD, squad coach board, RGB/outline art studio, step sequencer and recording-with-audio work. See [simulation scope](docs/SIMULATION_SCOPE.md) for model boundaries and references.

`npm test` covers legacy capabilities plus the new lab and replay isolation. `npm run test:shaders` compiles the 12 shader programs with Mesa EGL on supported Linux systems. The cloud browser provides a tactical fallback only; WebGL appearance and mobile GPU performance need device verification.
