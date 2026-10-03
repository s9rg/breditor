# Experimental session checkpoint V4

`SessionCheckpointJsonCodecV4` persists a complete retained heading history,
including the current undo/redo cursor, revision, capacity and open merge group.
It requires `experimental-structural-properties`. It is not enabled in the
shipping Wasm package, browser storage route or demo.

## Closed wire contract

The outer format is `breditor/session-checkpoint`, `formatVersion: 4`.
Deterministic field order is `format`, `formatVersion`, `schema`,
`schemaFingerprint`, `historyBase`, `currentRevision`, `historyCapacity`,
`cursor`, `entries`, `openMergeGroup`.

The history base is an explicitly embedded **Editor State V3**, containing a
Document V2, with its base revision normalized to zero. This is intentional
composition of independently versioned formats, not automatic migration.
The separate current revision is a canonical decimal string and is restored
exactly; replay after the maximum revision fails rather than wrapping.

Each chronological history entry contains only `forwardOperations`,
`resultSelection` and `resultPendingFormats`. Operations use the raw
[V4 operation payload language](OPERATION_V4.md), not operation or transaction
envelopes. Selection and typed pending-format records retain their established
contracts. Serialized inverse operations are neither required nor accepted.

The exact schema selector and full fingerprint are checked before interpreting
history entries. Unknown and duplicate fields are rejected. V1–V3 session
entry points are unchanged and reject V4. This codec accepts only V4; callers
must select a version explicitly.

## Admission and replay

1. Check outer UTF-8 bytes, envelope and schema binding.
2. Admit host-authoritative history capacity, entry count, cursor, open-group
   topology and current revision.
3. Count every entry's borrowed raw operations, checking per-entry and aggregate
   operation budgets before any owned operation or history boundary is built.
   Preflight result selections and typed pending formats. Empty recipes fail.
4. Decode the normalized base through Editor State V3.
5. Decode and validate each entry's operations through the V4 primitive boundary.
   Replay forward against the preceding boundary, enforcing live source guards,
   full-document limits and explicit result editor values.
6. Derive that entry's inverse locally, replay backward and require the original
   document, selection, pending formats and lineage. Do this for **all entries**,
   including future redo entries beyond the saved cursor.
7. Enforce cumulative retained-boundary budgets, install the exact current
   revision at the cursor and assemble the session only after every proof passes.

Operation errors retain both entry and operation indexes. Replay errors retain
their entry, direction and available operation index. A failed decode returns
no partially restored session and does not mutate an existing session.
Replay establishes internal consistency, not provenance or authenticity. A host
must apply its own trust and authorization policy to incoming checkpoints.

## Bounds and history behavior

`SessionCheckpointLimits` retains the existing host controls: history capacity,
aggregate forward operations, retained nodes, text bytes, property values and
property-string bytes. Boundary accounting includes typed pending formats;
heading ranks count as property values. Each operation source/result fragment
also retains ordinary document limits. Outer bytes and operation counts bound
recipe retention separately from retained-state limits.

Initial borrowed-entry allocation is capped at 256 slots. The decoder's owned
history vector is allocated only after entry/count admission. Encoding checks
context, topology and aggregate limits, validates operation payloads and counts
output bytes before allocating the final string. It does not relax limits for
V4. Encoding relies on checked runtime session invariants; untrusted input is
subject to the full bidirectional decode proof.

The restored session retains eviction boundaries, redo branches and continued
merge grouping. State-only selection/pending changes preserve the redo frontier.
A net-zero merged content recipe remains a history event; a no-op recipe that
does not produce a content commit is rejected as a history entry. Saved history
is only the retained history, not edits already evicted by the runtime capacity.

## Remaining integration work

This completes the experimental session-backup format for heading-kind changes,
not the browser feature. Commit V4 and local-log integration remain separate
work; existing V3 commit/log routes must not be used to persist heading recipes.
Heading-aware typing, Enter/delete rules, Wasm exposure, browser projection and
toolbar integration remain pending. No protocol compatibility with other editors
is implied.

## Reproduction

Run `cargo test -p breditor-core --lib --all-features --locked session_checkpoint_json_v4`.
Prefix with `PROPTEST_CASES=10000 PROPTEST_RNG_SEED=20261003` for the extended
randomized history traversal. The filter `session_checkpoint` also runs the old
session contracts. `npm run verify:release` checks the complete local release
boundary without publishing.

The [qualification record](qualification/2026-10-03-heading-session-v4.json)
contains source/log hashes, exact test results, unchanged shipping sizes and
the unexplained first-run interruption followed by a successful full rerun.
