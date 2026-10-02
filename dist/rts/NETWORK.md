# Multiplayer plan: deterministic lockstep

Fleet Commander sends **commands, not state**. A command is a small JSON object such as `{type:'order', uids:[…], play:'pincer', x, z}`. Every peer runs the same `World` with the same seed and applies the same commands on the same tick, so bandwidth stays tiny whether there are 50 or 5,000 drones.

## What already exists (`sim/lockstep.js`)

- `Session.issue(cmd)` stamps a local command with `tick = currentTick + inputDelay` and a sequence number.
- `Session.schedule(cmd)` accepts an already-stamped command from elsewhere (the network or a replay).
- Commands for a tick execute sorted by `(team, seq)`, identically everywhere.
- `World.hash()` runs every 20 ticks (once a second) and is stored in `session.hashes`; compare these between peers to detect desyncs.
- Replays are `{config, commands, ticks, hashes}`. AI commands are regenerated from the seed rather than stored.

## Transport to add

1. **Relay server** (simplest first step): a tiny WebSocket server that rooms two to four players and rebroadcasts each `{tick, commands[]}` packet. It never simulates anything.
2. **Turn protocol:** each peer sends one packet per tick (an empty list if idle) for tick `T + delay`. A peer may simulate tick `T` only once it holds every player's packet for `T`; otherwise it stalls rendering on interpolation. Use an input delay of 3–4 ticks (150–200 ms) at 20 Hz.
3. **Desync check:** piggyback the latest `[tick, hash]` on each packet. On a mismatch, stop and upload both replays for debugging.
4. **Lobby:** host creates a room code, the seed is chosen by the host and shared, and both sides start at tick 0.
5. **Reconnect:** a rejoining peer downloads the command log and fast-forwards. The sim runs about 50× real time in Node, so this is quick.
6. **Later:** WebRTC data channels (peer to peer), spectators (a read-only command stream, which works with the auto-director), and ranked play.

## Constraints this imposes

- Single-player speed controls and pause are host or vote actions in multiplayer.
- **FPV direct piloting** would feel the input delay. Offer it in single player and as a "pilot assist" (waypoint and steering intent) in multiplayer.
- Every client holds the full world state, so a modified client could reveal fog of war (a "map hack"). That's acceptable at indie scale; server-side verification of replays catches result tampering.
- Floating-point determinism relies on IEEE-754 doubles with only `+ − × ÷ √` and the custom trig in `dmath.js`. All browsers follow this, but test cross-browser (Chrome, Firefox, Safari) hashes before shipping.
