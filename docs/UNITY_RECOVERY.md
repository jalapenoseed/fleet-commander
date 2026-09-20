> Historical recovery record. The later [Unity 1.3 release](../unity/RELEASE-1.3.md) combines this work with the adaptive-lab branch and subsequent workshop/combat requests. Its validation record supersedes the counts and scope below. Sports rosters, first downs, board flipping and saved setups are preserved in the consolidated Games implementations.

# Unity recovery contract

Objective: complete the missing native game UI/camera, sports/chess and scenery work while preserving the existing show and arcade arena.

Baseline: clean `unity` branch at 4346a41. Existing D: build checkout contained unpublished edits and was preserved. Recovered only scenery/terrain/shaders/foliage and match-result storage from it; the new game implementation is independently verified.

Ownership and boundaries: SwarmSimulator selects one active show, arena or SportsMatch world. SportsMatch owns independent five-player rosters, movement, scoring and endings and never calls battle damage/controllers. Sports settings are cloned on start. EndBattle returns to the original show. ChessGame is a separate rules state; opening its UI temporarily pauses the live simulation and restores the prior pause state on leaving. GamePages owns input/board/roster widgets. MatchResults persists completed outcomes; runtime QA uses a separate filename. SceneGeometry combines static scenery by material and releases owned meshes.

Acceptance: stable round-start overview; explicit camera/formation controls; reachable menu restoration; imported detailed aircraft in sports; three playable automatic sports with rule-driven endings and saved results; chess with legal moves, AI/two-player and draw handling; reference-inspired scenery; native tests and visible Windows player QA. Preserve save compatibility and existing arena/pilot/replay checks. No new combat learning, weapons, real-world tactical optimization, online service or paid dependency.

Completed: direct Astra implementation, 95 native checks, 71 runtime checks and 19 GPU captures. See unity/VALIDATION.md for evidence and limits. Build in the isolated D: recovery folder to avoid filling C:. Existing unpublished D: checkout remains untouched.
