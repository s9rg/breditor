# Physical room participant staging

`SharedPhysicalRoomParticipantStage` restores selected original/generation client
histories as private read-only owners while retaining the complete physical room
catalog. It owns the actual source database, archive and recovery lease together
with a separate staging database. It exposes no editable parts, connection,
router or room activation method.

The immutable physical catalog and both older catalog formats remain unchanged.
Only component factory preparation is shared: each reader supplies its own
admitted private backups and native declaration. A physical inventory is never
cast into an older reader's ownership map or saved protocol.

## Source selection and custody transfer

First open a genuine `SharedPhysicalRoomRecoveryCatalog`. Call stage `begin` or
`resume` with that handle, a distinct database name, an independently retained
catalog selection, the matching bounded native digest module, and a fresh
synchronous `checkAuthority`. An optional new `signal` belongs to the successor.

The source reserves itself before any host callback or asynchronous work. Policy
is snapshotted before the first await. Both sides recheck actual retained bytes
before one synchronous ownership commit. Success retires the old catalog handle;
calling its `close` afterward does not close the successor. The old authority and
signal must remain valid until that commit, but revoking them afterward does not
invalidate the successor's fresh policy.

The actual IndexedDB factory and lock manager are pinned. Staging refuses if
the host switches those globals during work; it does not retarget component
restoration to another context. A failed transfer keeps existing source custody
with the source. An unreturned destination's failed cleanup remains reachable
and retryable before a later attempt can acquire its namespace.

## Separate durable intent

The separate `breditor/shared-physical-room-participant-stage` version-one record
uses database version one and only `physical_room_stage_state`. It pins the source
database name, exact canonical manifest and independent selection, chosen
component plans and ordered participant progress. The immutable source stores
are never upgraded, overwritten or copied into a mutable staging record.

`begin` only inserts into an absent database. Even identical occupied intent
requires explicit `resume`. Missing inspection leaves no placeholder. Schema
changes, extra keys, unknown versions, changed source/plan, out-of-order progress
and stale compare-and-set writes refuse without repair.

The durable phases are `retained`, `staging` and `staged`. Each selected child
advances from `reserved` to `started` to `complete`. One checked transition is
written at a time. Lost acknowledgements can be reconciled against the exact
previous or pending next record; an unrelated record is never adopted.

## Native owners and coverage

`stage(participants)` takes explicit original component recovery factories and
destination names. It snapshots nonsecret values and preflights the whole cohort
for duplicate document writers, review actors and database names before preparing
any component. Source membership and principal must match the admitted native
declaration. Ordinary native writer/review exclusion remains required.

Every original/generation native owner starts read-only, with exact selected
history, pending work and whole-upload state. Existing original and segmented
component readers perform their own full admission; no visible-AST reconstruction
substitutes for native history. Complete markers require actual stores to exist
and reopen. A marker alone cannot manufacture a private ready owner.

`progress` inspects durable intent, not readiness. After cold `resume`, call
`stage` with fresh matching factories to reopen and verify the real native
owners. `check` then freshly re-admits complete source bytes, checks actual
native/component stores and returns physical-source-bound prefix diagnostics.
It refuses a cold marker whose owners have not been reopened.

Unselected copies remain retained and unresolved, even when selected clients
cover every registered server stream. Multiple historical copies of one writer
cannot become competing owners. The result remains `pending` until explicit
future reconciliation/disposition covers those histories; no implicit winner,
acknowledgement or deletion is inferred.

## Cancellation and lifetime

The actual wait handle is reserved before authority callbacks can reenter or
close the stage. Operations serialize. Close prevents new work, waits for an
in-flight restore/check, and retains failed cleanup for retry. A failed native
candidate is never returned as an editable owner. Committed partial destinations
and source files remain available for exact cold retry.

`close` gracefully closes private owners; `discardAndClose` explicitly abandons
their private unsaved state. Neither deletes committed data, source files or
client stores. Closing/disposal releases private Blob/client-reader maps while
preserving cached metadata and any immutable Blob snapshots already handed to
the caller. Cold reopening still uses actual durable files.

## Bounds and functional checks

A stage selects at most 1,024 participants under a 16 MiB encoded plan ceiling.
Original/generation component plans retain their respective 64/128 KiB bounds.
The physical catalog keeps its separate 4,096-file/16 GiB declared envelope and
all component file limits. These are refusal ceilings, not supported browser
quota, aggregate RSS or long-session throughput guarantees. Native restoration
and complete source verification still scale with retained data.

The source probe uses ten actual native profile/transport fixtures, including
one physical cut beyond 8,192 records. Thirty mixed cohorts stage sixty clients,
cold-reopen sixty clients and compare all 180 retained files. It preserves thirty
historical copies and exercises future document/review Undo/Redo, including an
explicit component operational handoff with fresh current permissions.

Deterministic failures cover both native transports: reentrancy, changed storage
context, closing the source during transfer, lost initial/final acknowledgements,
failed cleanup, cancellation during a blocked native restore and durable-file
corruption without repair. A positive regression exposes retained private maps
after catalog close; the same assertion requires their release while preserving
metadata, caller-held Blobs and exact cold recovery. This checks references, not
RSS reclamation timing.

Run `check-server-generation-inventory-native.mjs` before
`check-physical-room-stage-sdk.mjs` or `check-physical-room-stage-installed.mjs`.
Both require exact-source native fixture evidence. The installed check repeats
the unchanged native and 41 intent/storage assertions in fresh offline public
archives, with strict public types, no workspace links and production import
checks. Both candidate profiles require the named source/type/intent/installed
checks. Synthetic IndexedDB, lock and raster-presentation fixtures are not
physical browser durability or accessibility qualification.

The [2026-10-21 qualification](qualification/2026-10-21-physical-room-participant-staging.json)
passes all 29 selected architectural stages and 1,482 script tests, with three
existing opt-in skips. Fresh source and installed probes each pass the thirty
native cohorts and both-transport failure cases above. The unchanged 2,923 native
inputs and six normal-runtime artifacts carry the preceding committed native
suite qualification; those suites were not freshly rerun in this SDK-only slice.
Older physical/catalog/V2 readers and future original native histories pass
their separate source and installed checks. This is not the complete functional
profile, browser qualification or permission to release.

## Remaining integration

The distinct [physical client-operation parent](PHYSICAL_ROOM_CLIENT_OPERATION.md)
now carries these actual owners and all source leases through restartable client
continuation. Neither stage nor client parent transfers continued native-host
ancestry or activates a server. Independent comment-generation session integration,
complete provider mappings and byte closure, every client/outbox, historic-copy
disposition and authenticated whole-room activation remain required. An archive
digest or `staged` marker does not grant current account permissions or create a
second live writer. All thirteen V1 gates remain open.
