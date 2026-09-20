# Unity recovery verification — 2026-09-20

Current source builds with Unity **6000.6.2f1**. The clean source baseline was `4346a41` on `unity`; unpublished scenery in the older D: checkout was selectively recovered without overwriting that checkout.

| Gate | Result |
| --- | --- |
| Native Unity EditMode suite | **95 passed, 0 failed, 0 skipped** |
| Windows player build | **Succeeded**, 0 errors; 4 warnings |
| Windows player runtime harness | **71 passed, 0 failed, 0 runtime errors** |
| GPU captures | **19** real player screenshots on NVIDIA GTX 1050 Ti / Direct3D 12 |
| Chess viewport | Board fits at 1600×900 and 1280×720; legal selection/player move/AI response checked |
| Aircraft resources | All **8** detailed/LOD assets loaded |

Native tests cover the prior 74 checks plus chess legal moves, checkmate, pinned pieces, castling rights and attacked transit squares, en passant including king exposure and expiry, promotion, draw conditions, and an AI mating move. Sports tests cover time limits and frozen end state, goal boundaries, capture requirements, flag tags without damage, touchdown values, downs/turnovers, roster isolation, saved-setting validation, mode switching, and scoring during full-length automatic matches.

Runtime checks exercise all 15 pages, the existing arena/pilot/replay paths, all three sports pitches and their endings, saved game results, chess input through its square-selection API, board layout at two window sizes, hide/restore controls, loaded models and scenery. Screenshots were inspected; inspection caught and corrected a clipped chess rank and an unrelated drone label over the board. A first hidden-window run could not capture rendered frames; the visible-player rerun passed. This is not a manual mouse-capture, piloting-feel or audio-listening sign-off.

Local verified player: `D:\FleetCommander-Recovery20260920\unity\Builds\Windows\FleetCommander.exe`.
Evidence: `D:\FleetCommander-Recovery20260920\unity\Logs\RecoveryQA` (`tests.xml`, `build.log`, `Player/runtime-smoke.json`, screenshots).

Use `Tools/Build-Windows.ps1 -RunSmoke` or the equivalent documented Unity commands to reproduce. Screenshot QA requires a visible player window. Rendering and CPU timings are recorded separately in the JSON; they do not establish a 10,000-drone frame-rate guarantee.

The user-facing runtime does not require DeepSeek or any API service. Astra performed this recovery after the user requested direct implementation.

## Previous baseline verification

# Unity port verification — 2026-09-19

The current project targets **Unity 6000.6.2f1 (770e33f6875c)**. The previous license/install blocker was resolved, the earlier port opened in the Editor, and the user tested its flying aircraft. This update adds imported aircraft models, skins, visible destruction, scored arena rounds, manual pilot participation and scoped defaults.

## Current verification status

| Gate | Status |
| --- | --- |
| Unity native EditMode execution | **74 passed, 0 failed, 0 skipped** on Unity 6000.6.2f1 at 2026-09-19 23:30 UTC |
| Latest integrated runtime/Editor/test compilation | Passed during the native test run; corrected an ambiguous `Cursor` reference in the runtime smoke harness |
| Windows standalone export of this update | **Succeeded**, 0 errors; 3 existing deprecated object-lookup warnings |
| Standalone smoke checks and screenshot inspection | **57 passed, 0 failed, 0 runtime errors** on GTX 1050 Ti / Direct3D 12; all 8 model assets loaded and 10 screenshots captured; pilot FPV, shoulder and model frames inspected |
| Interactive mouse capture, pilot controls and menu behavior | Pending on the updated player |
| Updated shader/model appearance and audio-device playback | Model and pilot screenshots inspected; listening verification remains manual |

The updated standalone player was exported and exercised on the connected Windows PC. The desktop shortcut **Play Fleet Commander** opens `D:\FleetCommander-Build\unity\Builds\Windows\FleetCommander.exe`; the game was also launched normally after the automated checks. The existing Unity Editor shortcut is separate.

Final player evidence is in `Logs/PilotIsolatedQA/runtime-smoke.json` and its ten screenshots. The run measured 402 ms for 60 simulation steps with 2,000 aircraft and 16.67 ms mean paused render frames. These are separate CPU and rendering measurements, not a combined gameplay frame-rate claim.

## Automated coverage

The native suite covers formation bounds, reproducibility, 10,000-aircraft neighbor limits, recall/landing, batteries, constrained planetary descent, grouped programs, text/symbols, browser-save migration and JSON round trips. Added cases cover:

- Team frame/skin/weapon loadouts and armor differences.
- Manual movement, aim misses, cooldowns, weapon differences and personal kill credit.
- Lethal damage, simultaneous elimination, winner/draw decisions, round limits and one-time score awards.
- Rematches, completed-round restoration and score/default separation.
- Scoped configuration resets, old version-1 save compatibility and rejection of invalid new fields.
- Replay state/score isolation, including discrete state at the final recorded frame.

The opt-in `RuntimeSmoke` player harness now exercises all 13 command pages and 13 camera modes; checks eight detailed/LOD model assets; stages weapon effects and destruction; joins Blue, Red and selected aircraft; checks movement/fire through the pilot API; verifies pause/replay/death/leave transitions; and checks winner display, rematch scores and reset isolation. It writes ten screenshots and `runtime-smoke.json` with graphics-device details, named checks, errors and 2,000-aircraft timings.

The harness drives pilot APIs rather than synthesizing a real mouse/keyboard session. In smoke mode it ignores physical flight/camera hotkeys and fixes the model-showcase camera to keep the test independent of desktop input and prior camera smoothing. An interactive check is still needed for cursor capture, focus loss, aiming feel and menu use. Its render-frame timing is measured with the simulation paused; the separate 60-step CPU timing is not a combined gameplay frame-rate claim.

## Reproduce verification

1. Open the repository's `unity` folder with Unity **6000.6.2f1** and run all EditMode tests.
2. Export with **Fleet Commander → Build Windows Player**, or `Tools/Build-Windows.ps1 -RunSmoke` when PowerShell script execution is permitted.
3. Confirm `Builds/Windows/FleetCommander.exe` launches and inspect `Logs/PlayerQA/runtime-smoke.json` plus its screenshots. The executable can also run the harness with `-fleetSmoke -fleetQA <output-folder>`.
4. In Arena, join each team, click the viewport, fly/fire, release the cursor with Escape, open menus, switch views, pause, replay and rematch. Confirm winner and match score behavior.
5. Inspect detailed aircraft up close, distance models, skins, rotors, destruction/debris, text contrast and all three pilot camera views. Enable audio and listen on the PC.
6. Record any additional interactive input or listening results here.

## Earlier port baseline and resolved setup issues

Before the Editor installation was repaired, Unity **6000.2.1f1** imported the original port and its three assemblies compiled against the real managed APIs. **49 portable CPU checks passed, 0 failed**, using the separate `Tools/Portable/MathAdapter.cs`. The earlier browser regressions `verify-fleet-commander.mjs`, `verify-combat.mjs` and `verify-simulation-lab.mjs` also passed. These are historical results, not a rerun of the current update.

The portable adapter uses System.Math/System.Numerics and a field-based JSON adapter; it does not validate engine callbacks, Unity JsonUtility edge cases, resources, rendering, input, UI or audio. Native test execution is now available and supersedes that earlier fallback for the current logic checks.

The old license failure (exit 198) is no longer the active gate. A later incomplete installation was repaired by moving extraction/installation off the full C: drive. Separately, missing `PROGRAMDATA` and `ALLUSERSPROFILE` in remote child processes had prevented Package Manager startup; supplying the ordinary Windows paths only in the child process resolved that issue. The build helper preserves this fallback.

PowerShell `.ps1` execution was blocked by the PC's policy during the earlier setup. No execution-policy settings were changed; the Editor menu or direct Unity commands remain alternatives. No antivirus, firewall or licensing controls were bypassed.
