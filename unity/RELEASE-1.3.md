# Fleet Commander 1.3 — Swarm Experiment Workshop

This release combines the interrupted `unity` work and `adaptive-duel-lab` work, then adds the requested science workshop, scenery, combat experiments, presentation and selection changes. The native Unity project is the repository's `unity/` directory.

## Where to find everything

| Request | In-game location and behavior |
| --- | --- |
| Fly a drone in the fight | **Arena → Join Blue / Join Red / Pilot Selected Drone**. Click the viewport to capture flight input; Escape releases it. Other drones retain AI control. |
| Click to select and highlight | Click an aircraft while spectating. Green brackets identify the selection; telemetry, aim display, camera focus and pilot controls use it. A drag moves the camera. Pilot clicks remain fire input. **F** focuses the selected drone. |
| High-quality aircraft | Every drone uses the approved Scout / Relay / Cargo / Utility pack with its original material surfaces and PBR maps. Detail follows projected screen size; selected and broadcast-subject drones receive full geometry. **Settings → Drone model detail** offers Performance, High quality and Maximum detail. |
| Clear the screen | **Hide Menus**, or **H**. A small Show Menus button remains. Completed games can still show their result panel. |
| Round count | **Arena → Number of rounds → Start New Series**. Choose 1–99 rounds, with optional automatic five-second transitions. The limit is captured when the series starts. Apply & Rematch also works for individual rounds. |
| Mixed teams and manual formations | Expand the Blue / Red roster. Twenty formations, spacing and cohesion; up to eight weighted roles, each with its own frame, skin, weapon, behavior and offsets. Presets create mixed wings, screens/flanks or heavy escorts. |
| Automatic formation changes | Enable **Automatic formations** for either team. The controller changes shape based on separation, survival and health, and relaxes formation keeping during close engagements. Disable it to hold the manually chosen formation. |
| More behavior | Sixteen styles: Balanced, Pursuit, Evasive, Guardian, Left/Right flank, High cover, Orbit, Weave, Strafe, Hit-and-run, Screen, Intercept, Ambush, Regroup and Adaptive. AI state is visible in resource telemetry. |
| Weapons and resources | Ten arcade profiles: Pulse, Rapid Fire, Scatter, Shockwave, Precision Beam, Ion Disruptor, Burst Tagger, Arc Link, Repulsor, Drain Ray. Magazines, finite reserves, reloads, heat, flight battery and shot energy. Toy foam/net/water/laser effectors also consume ammunition or energy. |
| Fighting-game mechanics | Single-target trace/sphere hit tests, attack chains, directional hit impulses, short stun locks, front-facing guard/parry, dodge/boost abilities, cooldowns and regenerating ability energy. **R** reloads, right-click guards, **E** dodges, Shift boosts. These are native Unity game systems; Unreal GAS and animation montages are not dependencies. |
| Scientific tinkering and learning | **Arena → Swarm experiments** runs 1–50 seeded trials, snapshots rules/environment/initial learning, and exports per-trial outcomes, damage, shots, hits and remaining battery. A UCB table explores and scores opening formations; the earlier per-game playbook learner is retained. Cancel preserves completed trials. |
| Manual target tracking | Select a drone, then **Arena → Manual tracking**. Pin a living opponent or restore AI selection. Sensor requirements still apply; selecting a target does not create a detection. |
| Current target | Right-side display names the target, equipment, coordinates and distance. The world aim line and selected aircraft telemetry update with it. |
| Applied settings stack | Right-side **Active Stack** shows formation, squad overrides, motion, influence kind/strength/frequency/phase/blend, boids and environment switches. Arena clearly indicates that show fields are inactive there. Toggle it in Settings. |
| Live versus apply controls | Labels identify **LIVE**, **SHOW LIVE**, **NEXT ROUND**, **NEW GAME**, **NEW SERIES**, **APPLY**, **APPLY WINDOW** or **BUTTON**. Player settings apply live; Save preserves them across launches. |
| Arena camera | Stable wide opening, manual orbit/pan/free/focus controls, plus an event-ranked broadcast director. It holds shots, frames pairs, smooths look-ahead, preserves a viewing side and checks terrain/configured obstacles. Manual dragging exits automatic direction. |
| Audience and multiple cameras | **Cameras → Take Audience Seat**, row/side controls, and ground viewpoints in outdoor scenes. Main view plus up to three independent live camera feeds. |
| Sports with actual equipment and endings | **Sports**: soccer, capture-the-flag, flag football, toy tag duel and king-of-the-hill. Modeled pitches, markings, goals/nets, flags, ball, hill and scoreboards. Rule-driven points, score targets, timers and match completion, plus saved results. Five editable frame/role/position slots per team, five formation choices, saved setup migration, and football first-down markers. |
| Chess | **Chess**: computer or two players; native modeled board/pieces, legal-move highlights, promotion choices, live board flipping, checkmate and draw rules. |
| Police Trainer-inspired arcade mode | **Drone Range**: three 30-second accuracy/reflex/tracking stages from a flying drone. Blue discs score, amber discs penalize, misses break combo, and the 90-second run saves its result. |
| Math and runnable Python | **Nerd Lab**: equations tied to actual influence settings, vector field, axes, selected-drone trajectory, harmonic oscillator and Lorenz RK4 preview. Pause/scrub time. **Export runnable Python + formulas** produces stdlib CSV examples; `--plot` optionally uses matplotlib. |
| Logic gates and circuits | **Logic Lab**: Input/constants, AND/OR/NOT/XOR/NAND/NOR/XNOR, editable connections, live wires, truth-table CSV and saved circuits. Half-adder, full-adder, multiplexer and alarm examples; the button runs 12 independent adder cases. |
| Night Brite | **Night Brite**: interactive 32×24 colored peg board, erase, examples, text stamping, save/load, physical board in the world and conversion to a drone light show. |
| More scenery | **Director**: stadium, coast, alpine, mountain town, meadow, creek, overlook, Juniper Junction, Northline city, Harbor Point, Red Mesa and Pine Lake. Reference-inspired day/night/Milky Way skies and animated water in water scenes. |
| Existing authored scenery packs | 73 GRIDRUNNER assets: 20 camp props, 10 field-operations props and 43 architecture modules/buildings, with 24 authored albedo textures. Houses populate the scenes; field equipment forms an operations compound. Source Blender files remain intact. |
| Sound and settings | **Settings** has master, FX, music, motors, ambience, mute, FOV, sensitivity, model detail, bloom, shadows, FPS/vsync and window controls. Eleven generated original FX cover UI, launch, attacks, impacts, scores, chess and results. |
| Systems tab | **Systems** reports solver, counts, energy, estimator, rendering/audio resources and selected target. Links lead to physics, math, cameras and saves. |
| Victory/results presentation | Arena, sports, chess, range and formation challenge have a large completed-game result panel, with YOU WIN / YOU LOSE when a player side is known, or the winning team / draw / completed score. Replay/rematch controls remain available. |

## Rule boundaries

Sports are deliberately documented drone adaptations. Soccer has goals, ball travel and restarts, without full association-football fouls/offside. Flag football uses touchdowns, four downs to gain 20 field units, turnovers, one forward pass behind the line and a 20-second play clock; it does not implement a full professional rulebook. CTF requires your own flag home to capture. Toy duels use scored tags and temporary disables. Hill points require uncontested occupancy.

The combat controller is an inspectable decision system with bounded learning. Vision observations are simulated; no YOLO weights or neural-inference runtime are installed. Math visualizations distinguish formation target offsets from physical forces. The Python export reproduces the displayed teaching models, not the entire flight solver.

Damage has directional reactions, progressive surface wear, smoke, sparks, tumbling wrecks and debris. Flight/contact/destruction remain game approximations, not a rigid-body fracture or engineering-validated aerodynamic simulator. Imported scenery is visual set dressing; avoidance and camera obstruction checks use terrain and the three configured obstacle envelopes.

## Files and validation

- [Validation evidence](VALIDATION.md)
- [Camera design and primary references](Tools/CameraDirectorNotes.md)
- [Authored scenery conversion](Tools/ScenePacks.md)
- [Drone model provenance and LOD derivation](Tools/DroneModels.md)
- [Original combined 1.1 game-rule details](RELEASE-1.1.md)

Player saves and exports are under `Application.persistentDataPath`; use **Systems → Open Save Folder**. Windows source project: `C:\Users\ty\Documents\FleetCommander-Unity\unity`. Current player: `D:\FleetCommander-Build\unity\Builds\Windows-1.3\FleetCommander.exe`.
