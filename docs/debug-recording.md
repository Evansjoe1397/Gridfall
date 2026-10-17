# Match debug dumps

Recording starts automatically when a local game starts or an online connection is attempted. It continues with the developer panel closed. This is a diagnostic recording, not a deterministic replay or a video.

## Player workflow

- **Ctrl+D** opens the developer panel. **Mark issue** opens an optional comment field inside the panel; **Save issue marker** captures diagnostic context and confirms the saved event number. Export the debug dump to download the marker. Cancel closes the field without saving. Markers work while client recording is paused; start a game or connect online first. Send screenshots separately alongside the dump.
- **Ctrl+Shift+D** downloads the current `.jsonl` dump, during play or after the match. The export includes whatever server history can be retrieved; a disconnected server does not prevent a client export.
- **Ctrl+Shift+R** pauses/resumes **client** recording. Previous events remain available, and the gap is marked. Shared multiplayer server history continues for the other players. Export still works while paused.
- **Export previous** retrieves the last saved client recording after a refresh/crash. Browser storage is saved in batches; the unsaved tail can be lost. This recovery does not include server history.

Shortcuts are disabled while typing and override the corresponding browser shortcuts. The panel reports recording size, incomplete history, recovery availability, and export status. HINTS → Hotkeys is the shortcut reference.

## Size and performance policy

Exports are capped at **5 MiB of uncompressed UTF-8 text**, not compressed download size. This is a ceiling, not a target. Each source has a separate budget of about 2 MiB, with remaining space for the export envelope and current-state appendix. A full source stops retaining new gameplay records and declares its incomplete prefix; it does not silently evict early actions. Routine telemetry yields space before gameplay does. Omitted sections/current state and dropped records are disclosed in the export.

An initial projected state plus JSON Pointer deltas captures state evolution. Growing combat/damage logs use incremental changes instead of repeating the accumulated history. Undo `stateJson` bodies contain nested duplicate snapshots and are replaced by their character counts; the undo action and resulting state remain recorded. State projection also excludes credentials and bounds unusual values. Therefore the dump is not a byte-for-byte serialized runtime.

No meshes, textures, callback objects, raw pointer movement streams, or per-frame state snapshots are recorded. The per-frame hook uses scalar counters; frame summaries and animation/render samples are collected about every five seconds, and latency probes about every ten seconds. Diagnostic samples also use deltas, repeated errors are grouped, and long tasks are aggregated. IndexedDB persistence appends batched event lines instead of serializing the whole match repeatedly, retaining current and previous recordings per tab. Large export assembly occurs only on request. The recorder measures its own work, but Node benchmarks cannot establish browser/GPU performance on every device.

## Evidence and limits

The server records player command attempts and acceptance/rejection, combat-stack submissions/resolution, state changes, room joins/drops/reconnects/leaves, and build identity. The client records input selections, sent commands, received presentation events, applied state changes, connection lifecycle, runtime/asset errors, visibility changes, frame gaps, render counts, available heap statistics, and selected animation/impact events. Periodic samples include active clip clocks, overlapping actions, movement queues, and overdue waits.

Automatic rule effects are visible through resulting state/log changes; this is not an instruction-by-instruction trace of every internal rule function. Animation samples may miss short-lived problems, and suspected stalled clocks are clues rather than proof. A blocked main thread cannot record while blocked; a later frame can reveal the gap, while a permanent crash only leaves previously persisted evidence. Full history from before recording was implemented cannot be recovered.

Client and server timelines each use monotonic sequence numbers and relative timestamps. `network.debug-meta` links received state to an authoritative recording ID, revision, and event. Their clocks must not be treated as synchronized. Client state is captured at export request; the server responds later. The server's current-state appendix may therefore be newer.

A client dump cannot contain another device's rendering history. If only one player sees an animation bug, collect that player's dump. Server records remain in the live room; server process/room destruction loses them. Recovery retains client data in this browser only. Recorded game states can contain hands/decks and issue comments; share them as debugging artifacts.

## Reading without loading the whole file into model context

The file is JSONL: one JSON record per line. A short dump header/index comes first, followed by chronological client and server sections, then the current-state appendix and a completeness footer. Read the summary before choosing a source/event range. Event numbers are source-local.

```sh
npm run debug:read -- path/to/dump.jsonl
npm run debug:read -- path/to/dump.jsonl --source client --from 100 --to 150
npm run debug:read -- path/to/dump.jsonl --source server --from 20 --to 80 --kind command
npm run debug:read -- path/to/dump.jsonl --source server --state-at 80
```

The default prints headers/footers only. Range output defaults to at most 100 matching events; use `--limit` to adjust. `--state-at` reconstructs the projected state through the specified source event, without replaying random rules. Inspect completeness markers before relying on reconstructed state. State deltas use `p` for an escaped JSON Pointer, `v` for replacement (missing `v` means deletion), and `s` for `[start, deleteCount, insertedItems]` array splices.

## Verification

Use `npm run check:debug-recording`, `npm run check:debug-client`, `npm run check:debug-server`, `npm run check:debug-reader`, `npm run typecheck`, and `npm run build`. The server check launches its own isolated local process and real WebSocket clients; it never connects to the user's active game. Client lifecycle checks use lightweight DOM/storage fakes in Node. Browser verification remains manual per project instructions.
