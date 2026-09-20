# Fleet Commander Unity 1.1 — recovered combined update

> Historical checkpoint. The [1.3 release guide](RELEASE-1.3.md) supersedes its football rules, model-detail thresholds and feature scope.

This release consolidates the previously verified pilot build, the unfinished scenery/sports/chess work, and the useful sensor-estimation code from `adaptive-duel-lab`. It corrects the earlier lab's disconnected activity choices, equipment labels, sensor truth fallback and discarded match learning.

## Play

- **Arena** starts with a stable wide overview. Expand either team's formation/loadout panel to choose Line, Wedge, Grid, Ring, Stack or Echelon, spacing and formation cohesion. Enable a mixed roster or choose a preset, then edit each role's weight, frame, skin, equipment, play and three-dimensional offset. Apply & Rematch deploys it.
- **Camera** offers wide/top/free/focus buttons. Drag orbits, wheel zooms, middle-drag or Shift + right-drag pans, WASD pans/moves, Q/E changes free-camera height, Home restores overview, F focuses the selected aircraft. Automatic action/cinematic views are optional.
- **Hide Menus [H]** clears command panels, telemetry, health labels and sensor overlays. The small **Show Menus [H]** button restores them. A pilot reticle remains while flying.
- **Sports** offers Soccer, Capture the Flag, Flag Football, Toy Tag Duel and King of the Hill. Start a match, spectate or join either side. Click captures flight controls; WASD moves; click shoots/activates equipment; Q passes in ball sports; Esc releases the cursor.
- **Chess** offers a computer opponent or local two-player. Choose a piece and a highlighted destination on the modeled board. Promotions present four choices. New game, resignation and draw controls are in the sidebar.
- **Director** has presets based on the supplied reference photographs: packed stadium, flower meadow, limestone creek/waterfall, warm granite overlook, mountain main street, autumn alpine cabins, moonlit coast, and Milky Way skies.

## Scoring and endings

| Game | Score | Match ending |
| --- | --- | --- |
| Arcade arena | Team kills/damage, survivor tally, series wins | Elimination, or timer: survivors then remaining health; equal results draw |
| Soccer | 1 per goal | Timed match; ties draw |
| Capture the Flag | 1 per enemy flag returned while own flag is home | Timed match; ties draw |
| Flag Football | 6 per touchdown | Timed match; ties draw |
| Toy Tag Duel | 1 per completed tag | Configured tag target or timer; ties draw |
| King of the Hill | 1 per uncontested second in the ring | Configured points target or timer; ties draw |
| Chess | White/Black match wins and draws | Checkmate, resignation, stalemate, insufficient material, automatic 75-move/fivefold repetition; 50-move/threefold claims or agreed draw |

Sports are explicit arcade variants. Soccer omits offside and fouls and uses simple kick-in/keeper restarts. Flag football has four downs to the end zone, one forward pass from behind the line per down, a 12-second play clock, turnovers, and no first downs, kicks or extra points. CTF has home-half tags, three-second returns, eight-second dropped-flag resets and 25-second carrier timeouts. Finished matches reject scoring/actions and retain the result. Completed results are automatically saved (latest 200).

## Adaptive lab

Select **Use toy lab rules in Arena** and an activity, or start a toy mode from Sports. Toy matches support 1–4 agents per team. Foam darts, nets and water have travel time/drop and swept hit checks; nets disable temporarily; laser tags require a continuous valid lock; bumper tags require contact. These rules do not invoke the original arena's damage weapons or payloads.

The shared sensor estimator samples at 30 Hz over the 60 Hz game solver. Camera vision uses field of view, obstruction, low light, noise and lost tracks; range, thermal, RF and UV have different constraints/uncertainties. IMU and optical-flow selections are navigation sensor indicators; they do not independently reveal targets. FPV displays estimated tracks and lead points, with contextual activation and a clear **VISION SIM** label.

**This is simulated scene vision, not a YOLO neural-network inference backend.** No YOLO weights or inference runtime are bundled. A detector trained for these drone assets remains separate work; the earlier branch's “YOLO” label did not provide it.

Separate blue/red playbook estimates are retained per game. Four playbooks are explored, then observed outcomes guide exploitation with occasional exploration. Bounded policy parameters update from resolved engagements; actual match outcomes update playbook values. Sports use playbooks to alter width, pressure and defensive position. **Run Learning Batch** completes 1–30 separate games with progress/cancellation and retained results. This is bounded game adaptation and playbook comparison, not a general neural policy trainer or evidence of real-world performance.

Save location: **Saves → Open save folder**. `match-results.json` stores outcomes, `adaptive-knowledge.json` stores learned policies, and the export button writes `adaptive-engagement-log.csv`. Battle JSON preserves mixed roles and formations. QA uses separate result/knowledge filenames.

## Art and rendering

All aircraft distance levels derive from the approved pack, with the original separate PBR textures and rotor surfaces. The 15-nearby-aircraft detail cap, crude proxy aircraft and single-material far silhouettes are removed. Full/medium/far geometry, frustum culling and GPU instancing keep large fleets practical. Source Blender/GLB assets are unchanged.

Scenery consists of native reusable meshes, material batches, procedural skies, soft shadows, sky fill and reflection lighting. Game equipment includes goal frames/nets, field markings, end zones, posts, laced/paneled balls, flags/bases, hill boundaries, live scoreboards, and six recognizable chess-piece models. The supplied photos guide scenery design; their low-resolution thumbnails are not stretched over the sky.

## Scope boundaries

Sports and toy matches have their own rules/results; the existing replay recorder remains for show and arcade arena sessions. In-progress sports/chess saves and sports replay playback are not included. Field and scenery props are native procedural assets, not photogrammetry. Per-agent sensor fusion and the toy laboratory do not control external hardware. Mouse feel and frame rate still depend on the local PC and scene; refer to `VALIDATION.md` for observed checks.
