# Durable native room preparation

Native room preparation saves every reconstruction input before any replacement
participant is created. It combines both complete room snapshots, all seven
concrete participant recipes and an explicit namespace plan in one immutable
IndexedDB record. A saved preparation is data, not permission to edit or activate
the recovered room.

## Complete input and target contract

The private SDK lives in `native_room_preparation/`. `inspectRoomPreparation`
borrows one genuine selected owner and holds the complete native and asset read
scope. Every selected document and comment history must continue into the retained
snapshot, and every retained selected upload store must continue its current
whole-store generation. The same packet-conservation rules apply to individual
inspection and complete-room construction.

The caller names every member in the actual cohort order. Each member supplies
its source family, chosen output family and every destination role. Original,
generation, independent-local, independent-delivery, restored-graph and flat input
keep their family. Snapshot input must explicitly choose flat output; it is not
silently relabelled. Original optional versions, suggestions and revisions stores
cannot disappear from the plan. Duplicate members, reordered members, partial
cohorts, arbitrary conversions and namespace overlap refuse.

Each recipe uses its concrete native reader and preserves its established parent,
journal, packet, asset and literal-input laws. A pending asset or source result
prevents the complete preparation from being returned. No incomplete cohort is
written as a successful preparation.

## Archive and storage

The distinct version-one archive starts with `BREDITOR-NATIVE-ROOM-PREPARATION-1\n`,
then a little-endian four-byte header length, a canonical JSON header and contiguous
payloads. The payload order is the complete current before-file, complete retained
file and every participant output in plan order. Each part records its exact byte
length, SHA-256 and MIME type. The independent choice binds the complete archive
digest, both room selections, all participant selections and the entire target
plan. Missing parts, extra bytes, noncanonical headers and changed choices refuse.

The total archive is bounded at 1 GiB, the header at 16 MiB and the cohort at 1,024
members. These are separate preparation limits, not increases to old formats.
Preserving two full snapshots and all output files can exceed this budget even
when individual inputs fit. The operation refuses rather than truncating history.

`prepareRoomReconstruction` requires the independently selected choice and the
complete retained file. It rebuilds all recipes under a fresh held scope, compares
the exact result, checks that the intent and every target are absent, and rechecks
the actual current snapshot before storage. One absent-only upgrade transaction
writes the single immutable record. It reads and verifies the whole archive after
commit and rechecks the current snapshot before returning. Sources remain untouched;
no participant target database is created.

Target absence is a preparation-time check, not a reservation. A later executor
must recheck it under its own real custody. A late current-cut refusal does not
erase an already committed preparation. Likewise, a lost completion can leave an
exact immutable record available for independent readback. Preparing again never
overwrites an existing namespace. An aborted upgrade publishes no partial record.

## Cold read and cleanup

`readPreparedRoom` opens only an existing intent namespace, verifies its exact
schema and one-record count before loading the blob, and compares the independent
choice and every digest. It re-admits both complete room snapshots and their
cohort topology. An absent namespace aborts its upgrade instead of creating an
empty placeholder. This read does not require or resurrect an old owner.

Cancellation and Close propagate into nested raster admission. Queued raw IDB
openings remain tracked until their real late outcome; early cleanup cannot leave
a later empty database behind. Runtime opening custody and cooperative local
locks protect cleanup, but are not cross-device author grants. IndexedDB commit
and controlled failure tests do not establish physical power-loss durability.

## Required execution work

The [explicit native retirement contract](NATIVE_ROOM_RETIREMENT.md) now re-admits
all outputs and closes the actual old writers after fresh approval, without a fake
import or a self-wait. Actual failed cleanup remains retryable. Whole-room target
creation, a durable root/catalog/asset plan, per-member execution progress,
interruption replay and a freshly authorized handoff remain separate work. Mutable
native admission runs again before retirement; an archive digest or stored choice
never replaces it. Compatible native
union, dependent-packet reconciliation and authenticated serving activation remain
required before the room recovery path is complete. The V1 goal and all thirteen
release gates remain open.

The normal reconstruction workload includes the complete preparation laws and
private type fence in source, offline installed packages and the actual production
bundle. The focused laws cover every document/comment history pairing, a genuine
failed-save newer retained input, complete source-row preservation, explicit target
planning, atomic abort, lost completion, cold read, stale choices, byte corruption,
bounded row admission, stalled decoding and delayed opening cleanup.
