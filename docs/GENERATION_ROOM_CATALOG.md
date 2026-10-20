# Mixed family room recovery catalog

`SharedRoomRecoveryCatalogArchiveV2` retains the selected server file, native
inventory and every supplied original or generation participant backup.
`SharedRoomRecoveryCatalogV2` restores selected participants into private,
read-only native owners and checks their actual history prefixes. These APIs
provide durable inactive staging, not an operational or authenticated room.

## Explicit file families

The closed `breditor/shared-room-recovery-catalog` manifest uses `formatVersion:2`
and an explicit `family: "original" | "generation"` on every participant entry.
The tag selects the existing closed component reader. Original journals are not
converted into generation sources; generation checkpoints are not replayed into
an original journal. The original manifest reader rejects V2, and the V2 reader
rejects V1. Original public APIs and component formats remain unchanged.

Capture requires an explicit catalog identifier, selected native inventory,
selected server-file identity, selected participant files and current host
authority check. Files are retained exactly. Different historical copies may
have distinct entry identifiers even when they contain the same native writer.
File retention does not choose which copy wins or discard another copy.

The envelope keeps the existing bounds: 4,096 files, 16 GiB total payload,
16 MiB manifest and 1 GiB server file. Component-family limits remain unchanged.
Staging selects at most 1,024 participants. Individual original plans keep their
64 KiB ceiling; generation plans keep 128 KiB. The aggregate escaped plan is
bounded separately at 257 MiB. These are hard refusal limits, not performance
or browser-capacity claims.

## Retain before restoring

Begin uses a new database with separate `room_v2_state` and `room_v2_files`
stores. The initial marker and all files commit atomically. An occupied,
foreign or original-family database is never upgraded or adopted. Resume
requires the exact independently selected catalog identity and verifies the
stored manifest, files and closed component selections again.

Durable progress records describe intent: `retained`, `staging`, `checked`, with
ordered `reserved`, `started`, `complete` participant markers. They are not proof
that runtime owners exist. Every stage or cold resume invokes actual native
factories and verifies the recovered histories, packets and upload stores.
Changed plans or destinations refuse rather than overwriting prior work.

Interrupted work remains inspectable. A failed parent marker does not delete
completed participant recovery. Retrying a `started` participant reopens its
actual recovery journal. A fabricated `complete` marker with missing stores
refuses. Cancellation or close during restore retains the original files and
committed destinations for an explicit cold resume.

## Supply factories separately

`stage()` accepts explicitly tagged host recovery options, not executable code
from a manifest or a fabricated completion report. Options and nested bindings
are snapshotted before the first await. Session factories initialize genuinely
read-only document and review owners; the catalog does not expose editable
parts, transport credentials or a borrowed mutable core.

The stage plan refuses duplicate native document writers and duplicate review
actors across both families, plus duplicate destination databases. Actual native
restores must match the registered room, language and historical principal.
Current authority and cancellation checks remain in force during recovery.

Original and generation prefix readers independently check genuine captures;
the combined result does not compare visible documents or substitute saved
counters. Missing, behind and unbound streams remain pending. Forks and wrong
namespaces refuse. A permanent observer stays read-only, and historical edits
from a now-revoked writer remain readable without granting current permission.

Unselected historic files remain in `unreconciledParticipants`. A catalog with
such copies remains `pending`, even when selected native streams cover the
server inventory. There is no implicit disposition or data-loss policy for
those copies. `checked` is still only inactive source reconciliation.

## Ownership and remaining integration

The catalog owns staged native sessions, dependent stores and uploads until
explicit graceful close or discard. Discard abandons runtime owners, not saved
files, journals or participant databases. Cleanup is retryable. No stage call
requests a token, starts a transport, reconnects, activates a room or treats a
saved authority decision as current permission.

A failed cleanup remains ownership. Both catalog versions retain acquired
children privately when a release fails during staging cleanup. Such a catalog
refuses further staging or transfer until close retries that cleanup; it never
loses the handle while leaving a destination lease held. Original files and
committed recovery records remain unchanged and support a fresh cold resume.

[Rollback custody](RECOVERY_ROLLBACK_CUSTODY.md) also covers participant attempts
that fail before returning a staged child, and native owners whose initial
discard fails. The same private runtime scope retains those actual owners until
cleanup succeeds; no saved progress value can reconstruct that custody.

The internal [common custody barrier](OPERATIONAL_COHORT_CUSTODY.md) reserves
original and generation children together and consumes them only after one
final cut and liveness sweep. The durable V2 operational parent still needs to
use it; committing the two families separately remains unsupported. Explicit historic-copy
dispositions, complete client/provider reference closure, independent
comment/server-log generations and authenticated activation remain work.

## Required functional checks

Both candidate profiles require V2 parser/storage laws, strict public type
fences, a source-bound native probe and a fresh offline installed-consumer
probe. The unchanged assertions cover all ten normally built native room
fixtures and local, relay and retained generation families, mixed staging,
exact original-file retention, cold reopen and future document/review Undo/Redo.

Controlled storage failures cover lost commit acknowledgements, aborted plans,
aborted parent markers, partial native restore, fabricated completion,
reentrancy, changed request bindings and cancellation during close. These are
functional IndexedDB/lock/raster fixtures, not browser crash-durability or
production activation qualification.
