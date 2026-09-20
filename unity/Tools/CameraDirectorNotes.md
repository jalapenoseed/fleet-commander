# Camera director design

The native Unity director uses event-ranked duel shots, a 3.5-second opening wide shot, a configurable 2–10 second minimum shot duration, stable near-side coverage, bounded velocity look-ahead, position/rotation damping, two-subject framing from field of view, and terrain / configured-obstacle clearance. Show coverage and sports use wider framing; finished arena rounds choose a living winner. Manual camera input relinquishes automatic control. Direct selection remains independent of the broadcast subject.

This is a deterministic game camera heuristic, not a trained model that knows a viewer's preferences. Camera principles were checked against Unity's primary documentation:

- [Clear Shot](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineClearShot.html): shot quality, obstruction, activation delay and minimum duration.
- [Position Composer](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachinePositionComposer.html): framing, damping and the jitter tradeoff of velocity look-ahead.

No Cinemachine package dependency was added. The implementation is `BroadcastDirector.cs`, integrated with the existing camera rig and battle events. Imported scenery is visual set dressing; clearance uses terrain and the game's configured obstacle envelopes, not every individual prop mesh. The view remains user adjustable.
