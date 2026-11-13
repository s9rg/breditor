# Live history staging

Ordinary shared-editor mutations now create their private candidate from the
actual live native document and Undo manager instead of replaying the Breditor
semantic journal. This removes repeated semantic work from closed candidate
creation while keeping cold recovery as a separate replay implementation. No
document, operation, journal, archive or transport format changes.

## Native owner contract

`rich_replica/fork_live_owner.rs` forks the native document together with its
matching Undo manager. The existing native fork exports and imports all applied
operations rather than rebuilding the visible AST. It independently copies the
mutable Undo/Redo rows, cursor state and history metadata, preserving deleted
style provenance and future selective Undo/Redo.

The Breditor owner then imports every retained causal input, including updates
whose dependencies have not arrived. Both applied-state and retained-operation
version vectors must equal the original owner. It independently forks review
history and cursors, preserves policy/read-only state, and starts with fresh
observation identity and projection caches. Full materialization, schema, UI,
history and size admission runs before the candidate can be adopted. A failed
candidate cannot mutate the original document, history or observation.

## Natural typing groups and cold recovery

All segmented live stages already use the native fork. Ordinary stages now do
the same when they do not need to reopen the last typing group. Reopening an
original, untracked natural typing group still uses the existing semantic replay
path. This exception preserves its established grouping semantics; it does not
silently enable another native history mode.

Cold readers continue to admit and replay the complete selected semantic
journal. Replay-cache tests explicitly exercise that implementation and retain
their positive cache-hit assertions. They do not use a live fork as a substitute
for an independent recovery oracle.

## Segmented document archive budget

Staging and adoption check the exact byte size of the segmented checkpoint
without rebuilding the outer archive. The original root and each sealed file
retain their JSON-quoted byte counts alongside their immutable contents.
Admission encodes the current active segment, then adds its quoted size to
those counts and the archive envelope. An explicit checkpoint still writes
the full canonical archive. Cold restore derives the counts again from the
admitted files. The counts are private and never appear in the checkpoint.

## Reproducible functional checks

The native `live_staging_tests` count entries at the semantic replay loop. The
counter is thread-local and test-only, excluded from application Wasm. Across
all six grammar/preset profiles and both explicit/natural history modes, closed
staging must add zero semantic replays. Independent cold recovery must add
replays and produce the same exact checkpoint and future Redo/Undo. Separate
tests retain original natural-group continuation and atomic failed/read-only
candidates. The zero-replay assertion reproduced against the prior
implementation before the change.

`scripts/compare-live-staging-runtime.mjs BEFORE_RUNTIME AFTER_RUNTIME` compares
two actual normal application runtimes across 144 grammar, preset, range-scope,
typing, search and reviewed-history configurations. It compares exact checkpoint
and AST bytes, UI/history views, writer/peer clocks and transport bindings. Old
offline peer work, both cross-version cold restore directions, future history
and refusal atomicity must agree. Raw compressed engine frame bytes need not
match.

`scripts/check-live-staging-installed.mjs BEFORE_RUNTIME` repeats those same
assertions in fresh offline public package archives, with strict consumer types
and no workspace package links. Both commands require an explicitly retained
baseline; neither silently compares the current runtime to itself. The portable
candidate plan continues to require the native work counter and cold-replay
laws without depending on a machine-local historical artifact.

## Functional qualification

The [qualification](qualification/2026-10-21-live-history-staging.json) passes
all 37 selected architectural checks on one frozen source: 669 collaboration,
325 relay, 264 complete no-networking and three independent-review Rust cases,
plus 1,439 script cases with three existing opt-in skips. The normal application
Wasm retains its existing export surface and passes strict native/Wasm linting.

Source and fresh offline installed runtimes each pass 3,168 exact owner
comparisons across all 144 configurations, 288 cross-version restores and
1,728 future-history comparisons. Original document and review readers agree
with both separately retained prior runtimes. Independent installed-history
tests additionally cover 72 native facade and 576 paired-storage cases; an
external copied Rust consumer needs no downstream engine override.

## Remaining resource limits

Native forking still exports and imports applied operations, re-admits retained
inputs and validates a complete candidate. It consumes time and memory
proportional to retained state; zero Breditor semantic replay does not mean zero
native work. Long-session measurements, retained Undo limits, aggregate room
catalog memory and platform durability remain separate release requirements.
This change neither drops history nor increases existing bounds.
