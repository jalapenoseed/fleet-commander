# Unity port verification — 2026-09-19

## Completed

- Unity 6.2 **6000.2.1f1 (55300504c302)** resolved the project's packages and compiled `FleetCommander`, `FleetCommander.Editor`, and `FleetCommander.Tests`.
- The current runtime, Editor build code and native test sources also compile directly against that Editor's real managed API references with Roslyn: **zero compiler errors**. This is a compilation check, not engine execution.
- **49 portable CPU checks passed, 0 failed**, using the same core and test source files with the actual NUnit framework and the deliberately separate `Tools/Portable/MathAdapter.cs` adapter. Covered: formation bounds, four field reset semantics, repeatability, 10,000-aircraft neighbor bounds, return/landing, batteries, constrained gravity, battle caps and damage, payload limits, replay isolation and recorded events, JSON-shaped state round trips, browser migration, timed/grouped cues, text/symbols and uneven squad assignment.
- Existing browser regressions passed: `verify-fleet-commander.mjs`, `verify-combat.mjs`, `verify-simulation-lab.mjs`.
- Project settings, package lock, scene and stable asset metadata are committed. The build scene is registered; the desktop target uses linear color, a resizable 1600×900 window and the legacy input API used by the camera/UI.
- Dynamic shaders are included through Resources; instancing variants are retained for the procedural renderer.

## Blocking gate

The installed Unity Editor exits with **code 198** and:

> No valid Unity Editor license found. Please activate your license.

Consequently, the following have **not** passed yet:

- Unity EditMode **execution** (the native test assembly compiled, but the Editor stops before running tests).
- Windows standalone player export.
- Main-scene Play Mode, UI interaction, shader/GPU rendering, audio-device playback, frame-rate measurement, screenshot inspection, and player smoke checks.

There is **no verified Windows executable** in this handoff. The port must not be described as a fully tested playable export until those gates pass.

The portable adapter uses System.Math/System.Numerics and a field-based JSON adapter. Its passing results validate much of the state machine and algorithms, but do not certify Unity's Quaternion edge cases, JsonUtility behavior, resources, engine callbacks, rendering, UI or audio.

## Resume after license activation

1. Activate the appropriate Editor license in Unity Hub.
2. Open the repository's `unity` folder with Unity 6000.2.1f1.
3. Run the EditMode suite in Unity's Test Runner.
4. Open `Assets/FleetCommander/Scenes/FleetCommander.unity`, press Play, and inspect Fleet, Art Studio, Arena, Director and Replays.
5. Use **Fleet Commander → Build Windows Player**, or `Tools/Build-Windows.ps1 -RunSmoke` when PowerShell script execution is permitted.
6. Inspect `Logs/PlayerQA` screenshots and `runtime-smoke.json`; resolve errors before distributing the player.

The PC's current PowerShell policy blocks `.ps1` files. No execution-policy settings were changed. The Editor menu is the supported alternative for export. During this session, source compilation and portable checks were run as direct compiler/executable commands, not by changing the script policy.

A separate remote-session startup problem was diagnosed: missing `PROGRAMDATA` and `ALLUSERSPROFILE` caused Unity Package Manager to fail before import. Supplying their ordinary Windows folder values only to the child process resolved it. No antivirus, firewall, license or user/machine environment policy was changed.
