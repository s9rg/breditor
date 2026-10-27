# Warm room execution ownership

The private `native_room_execution_run/` SDK joins the complete immutable
execution intent to real writer retirement, native replacement stores and whole
selected upload queues. A caller receives a `RoomExecutionAttempt`
synchronously, before any I/O or retirement. The attempt keeps actual cleanup
handles when `run` rejects; a rejected promise is not the resource owner.

## Separate durable start journal

The host explicitly names a new journal database. Its identity binds the exact
immutable execution choice, including all participant, catalog, root, upload,
adoption and approval destinations. The journal must be disjoint from those
destinations, the preparation and every known complete source namespace.
No name is derived by suffixing an opaque database name.

START writes the exact identity and first event in one absent-only upgrade
transaction. Existing-only resume aborts an absent upgrade. The original
immutable execution file and its one-row schema remain unchanged. Subsequent
events form a Rust-hashed append-only chain with a store-owned compare witness;
copied reports, stale heads and modified rows cannot append. A committed event
whose completion was lost stays readable through an exact fresh read.

The journal permits at most 4,096 events and 32 MiB of canonical metadata.
Count checks precede bounded event reads within the same transaction. Exhausting
the budget refuses new work; it never truncates history or silently rolls over.
These are transactional storage guarantees, not physical power-loss guarantees.

## Genuine ownership before retirement

Each run independently re-admits the saved complete native recipes and both
whole-queue asset decisions, then checks every fresh participant policy against
the exact destinations. START commits before fresh host approval. The complete
current native, packet, source and selected-upload cut is checked again at the
existing retirement barrier.

The attempt also holds one actual reservation on the original owner. Competing
attempts, ordinary retirement and ordinary Close cannot consume that owner until
the attempt finishes cleanup and releases its reservation. An approval refusal
leaves the original owner live. Closing an unstarted or
preapproval-refused attempt does not discard that owner. If old cleanup fails
after retirement, its original canonical owner still holds the actual stopped
actor cohort. Cleanup retry checks that private resource, not a journal stage or
an application report. Only after actual old cleanup finishes does a synchronous
take assign the entire cohort into the already-returned attempt.

## Actual targets and selected uploads

The attempt saves catalog and root start markers before opening their stores.
It recovers every concrete participant family through the established native
constructors and actual actor routes. Existing stores undergo their normal
exact admission; a marker never skips a child or creates missing completed data.
Each child retains its established per-target journal and replay rules.

Asset adoption uses each complete saved adoption base, including pending,
failed, cancelled and unreferenced uploads. Actual selected stores must match
their complete base and destination. Repeating a ready run still needs a fresh
decision and checks the real root, children, adoption record and selected stores.

All target handles remain private in the attempt. Terminal Close cancels reads,
settles actual running work, closes upload/native borrowers, and drains only
failed unreturned openings before releasing actor escrow. A failed Close keeps
the same handles for another cleanup attempt. Source, intent, journal and target
bytes remain intact; Close deletes no database and acknowledges no provider save.

## Remaining execution and activation

The result of `run` is held local replacement readiness, not an exposed editor
or serving grant. The separate [ownership promotion](NATIVE_ROOM_PROMOTION.md)
requires a fresh joint decision, moves the actual root and actor cohort through
one complete native/packet/selected-store barrier, and exposes the usable owner
only through a synchronous one-shot take.
A new warm attempt must reserve the genuine still-current original owner. After
retirement, only that same reserved attempt may resume cleanup and target work;
a different plan cannot attach to already-retired actors and bypass its own
source-cut check. A full process restart still needs explicit real actor acquisition and independent
admission of the complete recovery state.

Provider and client reconciliation, independent comment and server generations,
authenticated room activation, sustainable history and asset retention, and the
complete release matrices remain part of the full V1 goal. All thirteen release
gates remain open.
