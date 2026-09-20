# Unity 1.3 verification — 2026-09-20

The combined release uses **Unity 6000.6.2f1** and includes the recovery work from `unity`, the `adaptive-duel-lab` work, and the subsequent workshop, combat, camera, scenery and selection requests. The feature map is [RELEASE-1.3.md](RELEASE-1.3.md).

## Gates and evidence

| Gate | Result |
| --- | --- |
| Native EditMode tests | **134 passed, 0 failed**; `Logs/merged13-tests.xml` |
| Windows standalone export | **Succeeded, 0 errors, 4 deprecated API warnings**; `Logs/release13-verified-build.log` and `Builds/Windows-1.3/build-report.txt` |
| Final standalone checks | **106 passed, 0 failed, 0 runtime errors**; evidence: `Logs/Release13VerifiedQA/runtime-smoke.json` |
| Shader, asset and menu screenshots | 39 captures cover aircraft, combat, selection, sports fields, chess, range, circuits, Night Brite, science, cameras and all 12 scenery types |
| Source asset checks | All required Unity metadata exists with unique GUIDs; 12 aircraft models; 73 authored GRIDRUNNER props/buildings and 24 scenery textures |
| Exported Python examples | Export ran with the standard library and produced field, oscillator and Lorenz CSVs; optional plotting requires matplotlib |

Evidence paths are relative to `D:\FleetCommander-Build\unity`. The verified player is `Builds/Windows-1.3/FleetCommander.exe`. The main source project is `C:\Users\ty\Documents\FleetCommander-Unity\unity`.

## Coverage

The native suite covers flight, formation bounds, bounded neighborhood searches, energy/recall, reproducibility, save migration, replay isolation, original pack resources, directional trace hits, ammunition/reload/heat, guard/parry, abilities, manual tracking, twenty arena formations, retained opening-formation learning and nearest-drone picking. Architecture material tests confirm authored texture bindings survive import.

Game-rule tests include soccer goals/restarts, CTF home-flag requirements, football touchdown/first-down/play-clock/turnover behavior, sports roster snapshot isolation, score-target endings and legacy sports-setup migration. Chess validates initial perft 20/400/8,902, legal AI moves, castling through check, en passant king safety, four promotions, checkmate, stalemate and claimable versus automatic draw rules. Circuit and science cases cover logic examples, connection validity, truth tables, board persistence and bounded numerical calculations.

The player harness visits 21 menus; loads all 12 aircraft geometry assets; stages impacts and destruction; exercises Blue/Red/selected-drone piloting through APIs; checks replay and round/series outcomes; runs all five sports to completion; checks custom sports models and first-down markings; moves chess pieces and waits for the computer; checks board flipping, range completion, circuits, light board, Python export, multi-camera feeds, audience seating, audio loading/triggering, selection, control timing labels, active stack and the broadcast camera. It also verifies that Fit recovers a useful fleet view after looking up at the night sky.

The final player and UI compile includes the last sports timing-label and active-stack changes. A first integrated player pass exposed a test-order issue: the chess flip assertion ran before the camera's LateUpdate. The harness now waits for the view update before checking it.

## Performance and practical limits

The final pass measured **414 ms for 60 simulation steps** (6.9 ms/step), **17.22 ms mean paused render frames**, and **33.23 ms maximum render frame** across the 60-frame sample. The stress case uses 2,000 aircraft at 1600×900 on the connected GTX 1050 Ti / Direct3D 12 PC. CPU timing covers 60 fixed simulation steps; render timing is measured separately with simulation paused. These are not a combined gameplay frame-rate guarantee. Maximum model detail and three extra camera feeds increase GPU cost.

All detailed aircraft remain the approved pack. Near/selected/broadcast aircraft keep full geometry; High quality switches to the derived far meshes only below seven projected pixels. The far meshes retain material surfaces and source triangles rather than substituting unrelated aircraft.

The harness drives game APIs and screen-position selection; it does not synthesize a complete physical mouse/keyboard session. Cursor capture, aiming feel, monitor-specific text size and actual speaker/headphone playback still need human assessment. Audio resources and playback requests were verified; no claim is made that the audio was listened to remotely.

Learning is a bounded, inspectable playbook/formation learner with simulated noisy sensors, not a trained YOLO network. Combat and destruction are game approximations. Scenery props are visual set dressing; terrain and configured obstacle envelopes supply avoidance/camera obstruction. Full engineering aerodynamics, arbitrary building collision and structural fracture are outside this implementation.

## Reproduce

1. Open the repository's `unity` folder with Unity **6000.6.2f1** and run all EditMode tests.
2. Use **Fleet Commander → Build Windows Player**. An explicit output path can be passed with `-fleetOutput` in batch mode.
3. Run the executable with `-fleetSmoke -fleetQA <output-folder> -logFile <player-log>` to generate named checks, timings and screenshots.
4. For human play checks: click/select an aircraft, focus with F, join either team, fly/fire, guard/dodge/reload, release input with Escape, hide/restore menus with H, and finish/rematch games. Listen with the Settings sound channels enabled.

QA uses separate results, preferences and learning files. An early QA-created tactics file was moved into the validation log folder before normal play, leaving the player's learned tactics independent. The main project's rebuildable Unity Library cache was relocated to D: behind a directory junction after C: became nearly full; the project path remains unchanged. Existing source Blender files, previous standalone builds and game saves remain available.
