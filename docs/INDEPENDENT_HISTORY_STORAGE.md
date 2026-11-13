# Independent native history storage

`SharedIndependentHistoryPersistentSession` saves one genuine Rust-backed editor
with independently selected document and comment history families. Either lane
can retain its original format or use native generations. One atomic head selects
the exact pair, active suffixes and local version packets; comments are never
flattened into their visible discussion view.

This is a separate opt-in client-storage family. It does not migrate an old
database, negotiate a server profile or activate a room. Existing generation
source, relay and participant adapters refuse it. Separately named
[independent source and participant readers](INDEPENDENT_PARTICIPANT_BACKUP.md)
now preserve its actual two-lane histories and complete local asset state.

The internal [capture-bound native reader](CAPTURED_NATIVE_HISTORIES.md) now
distinguishes both selected native families without exposing writable ownership.
That read boundary does not adopt an independent session into old relay or
physical-room archive families.

## Select both native families explicitly

`SharedIndependentHistorySessionOptions` requires `documentHistory` and
`reviewHistory`. Each selects `original` or `segmented-v1`. Original document
recovery uses the host's `restoreOriginal` callback; segmented document recovery
uses `restoreSegmented`. Each segmented lane also requires initial root and active
IDs for an absent store. Existing files never restart from those initial IDs.

For example, these options select two independently rotating lanes:

```ts
documentHistory: {
  kind: "segmented-v1",
  initialGenerations: { root: "document-root", active: "document-one" },
  restoreSegmented: checkpoint => profile.restore_segmented(room, checkpoint),
},
reviewHistory: {
  kind: "segmented-v1",
  initialGenerations: { root: "comments-root", active: "comments-one" },
},
```

The host supplies the room, exact document writer, native grammar, scope, natural
typing/search/reviewed-history policies, fresh document read-only setting and
fresh authenticated comment policy. Both writer leases precede native callbacks.
The selected factory must restore the actual native owner; AST import, equal
visible text and saved permission claims cannot substitute for replay.

The SDK facade has separately named comment-generation discovery, enable, seal,
restore and checkpoint methods. A boundary refreshes composite review guards
even when it creates no comment event or accepted-document change. Missing or
future native capabilities refuse rather than being emulated. Old pinned durable
families cannot switch their comment history in place.

## Save immutable lane files and one paired head

The dedicated version-one database contains `history_heads` and `history_files`.
The head format is `breditor/shared-independent-history-head` version 1. Its key
is `(room, document writer)`. Immutable file keys additionally include the lane
and generation: `(room, document writer, document or review, generation)`.
The two lanes may therefore use identical generation IDs without collision.

Original lanes retain their exact native checkpoint strings in the head.
Segmented lanes retain root/sealed references and the exact active string; their
immutable root and sealed strings live in the file store. Document files keep
their original raw SHA-256 spelling. Comment file hashes keep native
`sha256:` spelling and the `breditor/review-history-file/1` domain followed by
a NUL byte. Neither hashing contract is converted into the other.

All files and the head commit in one IndexedDB transaction. Files cannot be
overwritten with different bytes. Head publication compares the last acknowledged
exact head, not merely a revision number or equal document. An uncertain attempt
is retried unchanged before a newer capture. A lost acknowledgement is idempotent;
a missing file from an acknowledged cut refuses instead of being silently rebuilt.

Native strings stay opaque. Metadata checks and hash links precede cold replay,
but are not semantic admission or authentication. Cold opening reconstructs only
the outer native envelopes, replays both histories through Rust with current host
policy, checks retained anchors and requires exact native getters afterward.

## Keep policy and resource custody separate

Document read-only and comment access are independent current policies. Neither
is recovered from the head or native archives. Author seals require their current
grant. Separately named read-only seals archive a former author's retained input
without unlocking editing, resetting identity, authoring an event or clearing
Undo/Redo. Strict zero-authored observer operations retain their original checks.

The session privately owns its constructor-acquired core. Replacing or shadowing
public `core` cannot redirect capture or cleanup, and replacement getters are not
executed. Readable retired history is not live custody for new seals or version
catalog mutations. Closing retires the actual owner first. A failed final save
retains exact readable histories and leases for retry; explicit discard releases
that owner without deleting committed heads or immutable files.

If application code disposed the borrowed core first, a normal final save still
rejects; it cannot invent fresh native state. Explicit discard now releases the
actual leases after in-flight storage work settles. Terminal methods are
canonical internal calls, not mutable public overrides, and last observed
revision clocks remain metadata only. See [owned core lifetime](OWNED_CORE_LIFETIME.md).

`retainVersion` admits the native packet and the proposed complete cut before
changing the local catalog. Its promise waits for persistence, including when
the same packet is already retained in memory after an earlier failed save.
Failure stays a failure until retry succeeds. Returned version metadata is not
a provider acknowledgement, publishing permission or a room-activation proof.

`exportRecovery` returns `breditor/shared-independent-history-recovery` version 1:
the selected identities, exact native histories and local version strings.
`restoreRecovery` requires separately reacquired writer ownership and an absent
destination. It cannot merge into or overwrite an existing head. This native
recovery is not a complete asset, outbox, credential or server-receipt backup.

## Retain bounded history without claiming unlimited lifetime

Original native limits stay unchanged. Each segmented lane keeps its own native
archive limits; both roots and active generations count toward their respective
generation ceilings. The paired head has a separate 128 MiB encoded budget and
the local version catalog remains bounded to 32 packets of at most 4 MiB each,
also subject to the complete head budget. Capacity failures do not prune history.

Document segmentation still retains at most 1,000 native Undo items. A further
independent edit can therefore refuse even after a seal. Current saves also
serialize the complete bounded native archives. These are functional retention
contracts, not unlimited lifetime, compaction or an approved latency envelope.

Source and fresh offline installed consumers must repeat exact cold pairs,
future native Undo/Redo, old offline peer input, version packets, failed/uncertain
saves, cross-lane ID collisions and resource-custody refusals. Synthetic
IndexedDB/Web Locks qualify functional transactions, not physical crash durability
or cross-device fencing. The reference host now supports explicit
[native document/comment retention](SERVER_NATIVE_HISTORY_GENERATIONS.md),
without selecting this client store or rotating its physical log. Matching
independent transport/room integration, physical server-log recovery,
provider/client reconciliation, historic-copy decisions and authenticated
whole-room activation remain separate work. The separate local participant reader
does not promote old recovery formats or provide an all-store activation marker.

The [2026-10-21 SDK/storage qualification](qualification/2026-10-21-independent-history-storage.json)
passes all 36 selected stages, including the same 576-configuration storage
matrix and 72-configuration facade matrix in source and fresh public archives.
Native Rust qualification is carried only across 2,709 unchanged inputs and 12
unchanged normal runtime artifacts; it is not a fresh native suite/build claim.
All 13 V1 gates remain open.

The later [independent participant checkpoint](qualification/2026-10-21-independent-participant-backup.json)
adds genuine source/asset/whole-upload capture and portable local recovery, with
the same native history strings and current-policy cold replay. Runtime-only
constructor keys prevent direct JavaScript construction from registering a source
with supplied fake leases or a borrowed core. This does not select an independent
relay/retained family or activate a physical room.

## Store a continued pair

`SharedContinuedPairSession` selects the document and review history families
independently. Each can be `original`, `segmented-v1`, or `continued-v2`, and
at least one lane must be continued. Supply an exact document restore factory
for the selected family, the room/writer and grammar/scope/history settings,
and the current document and review permissions. The factory takes the
document checkpoint string and returns an unobserved native owner.

Call `restoreRecovery(options, recovery, "host-reacquired")` with the exact
version-two recovery cut after reacquiring the writers. This inserts into an
absent destination. `open(options)` cold-replays an existing cut. Both paths
acquire the document and review locks before calling the native factory.
The restored checkpoints must match the selected bytes before the editor is
published. Use `exportRecovery()` to retain an exact readable pair with its
version packets.

The dedicated stores are `continued_pair_files` and `continued_pair_heads`.
Each continued lane carries its native `continuedAfter` boundary. Root and
seal files keep the same lane-specific digests as the native archive. One
transaction verifies and inserts the referenced immutable files and compares
and publishes the paired head. Replaying a failed save uses the same pending
cut. If the commit succeeded and its acknowledgement was lost, retry checks
that exact head and all its files before it accepts the result. An absent
referenced file prevents cold opening. Both archives and the version catalog
are exported with their original native strings.

A paired save reflects one capture of both native owners and the local
version catalog. Native remote admissions, seals, and history actions still
have their ordinary publication boundaries. Hosts can await `flush()` for
the captured cut and `retry()` after a failed save. The version-two store is
a local recovery boundary. Room catalog, asset/delivery custody, and relay
snapshot/restart integration require their corresponding versioned adapters.

### Read a continued pair after an interrupted save

`readRecords(checkAuthority, signal)` reads the actual committed head and
immutable files in one read transaction. It returns that cut alongside the
exact attempted, pending, and live native archives and version packets.
An unacknowledged commit can appear in both the committed and attempted slots.
A pending capture made after that attempt remains separate. A read requires
an idle save queue and holds new writes until the caller disposes it. A
native change invalidates the read, and disposal lets its queued save proceed.
Retry, version retention, and close reject with `continued_pair_read_busy`
until the caller disposes the read.
Call `verify()` to reread and verify the committed head and referenced files.

`readAssetReferences(checkAuthority, signal)` replays each selected slot with
fresh read-only policy. Rust verifies continuity of both native lanes, and the
version catalog must retain its earlier packet prefix. The result includes
the exact committed head and the union of native and version packet asset
references, with each slot's references available separately. Cancellation
releases the save queue even if a native restore factory is still pending.
A native owner returned after cancellation is freed if it was unclaimed.
The returned data describes one observed cut. Whole-room adoption must separately bind
that cut to the selected participants, upload stores, and provider.

### Reconnect a continued pair

Use `SharedContinuedPairSession.restoreDelivery(options, recovery, "host-reacquired")`
to import a complete delivery recovery into an empty dedicated database.
Use `openDelivery(options)` to reopen that database with current host policy.
The recovery contains both native checkpoints, the original document and review
relay progress and receipts, and the selected suggestion, revision, and
published-version records. It includes the original pending packet bytes.
Supply the exact document, review, and retained-store bindings again on open.
Keep account tokens and writer credentials outside the recovery.

`continued_delivery_files` and `continued_delivery_heads` keep these records in
one transaction with the paired native head. Once the transaction commits,
reopening recovers the same receipt and packet state even if the caller lost
the save acknowledgement. Await `flush()` for local persistence before exporting
with `exportDeliveryRecovery()`. Each connected adapter has its own relay barrier
for completing pending delivery.

Attach `createSharedContinuedRelaySync` and `createSharedContinuedReviewRelaySync`
with fresh credentials. Both use the selected original or atomic relay
transport and the native history family for their own lane. The review adapter
applies the more restrictive of the current host policy and the authenticated
review role. Open the selected metadata stores on the session. Open the
suggestion queue before the revision store and pass the document transport to
the revision store. An application-created `SharedSuggestionSync` remains the
application's responsibility to dispose.

`readDeliveryRecords(checkAuthority, signal)` holds the paired save queue and
returns the committed, attempted, pending, and live records. Each slot
includes both native lanes and its own relay and outbox state. The same
committed cut can also appear in the attempted slot after a lost
acknowledgement. Call `verify()` to recheck the exact persisted head and
immutable files. Dispose the read to release the save queue.

The SDK can retain both continued-delivery writer locks through a durable
close and lend them to the selected staging and final factories. A failed
restore returns its loans to the same holder. The final handoff verifies
the actual replacement owner and its native document and comment
checkpoints before promoting both writers. The restored source can then
reconnect under current relay credentials.

The recovery reservation can also lend the existing suggestion, revision,
and version stores to the authenticated relay adapters. Opening those
stores preserves their committed packet bytes. A successful delivery
updates the same paired head and invalidates any earlier witness of the
complete source. Ordinary edits and ordinary adapter starts remain blocked
while the reservation is held. The room activation coordinator still needs
to include this archive family in its complete target plan.

### Archive a continued participant

For a delivery pair, use `SharedContinuedParticipantBackup.captureDelivery`
and `readDelivery`. The version-two participant archive retains each slot's
exact native histories, relay receipts, and suggestion, revision, and version
packets. It includes the whole upload store and raster bytes for every
referenced image generation, including images only present in queued
suggestions or revisions. A capture reports `source-pending` when a packet's
native dependencies or an uncached published version prevent a complete
asset inventory. A capture reports `pending` when the required raster bytes
are unavailable. Preserve the independent version-two `selection()` with
the archive. Restore the selected record with `restoreDelivery` and restore
the upload backup with `RichAssetStore.restoreBackup` and
`uploadState: "preserve"`. A room catalog can also restore both together
through its recovery journal.


`SharedContinuedParticipantBackup.capture` takes a continued pair session,
the selected participant and principal, a local upload store, a synchronous
authority check, and the shared Wasm digest module. It keeps the pair read
and the upload store's exclusive recovery lease through final verification.
Each slot retains its own exact document checkpoint, comment checkpoint, and
ordered version packets. Identical records share bytes inside the file. The
archive also includes the full upload store, including queued and cancelled
records, and image bytes for every asset generation reachable in any slot.

A capture reports missing images as `pending`. The host can supply an exact
asset and generation resolver for bytes absent from the upload store.
Cancellation releases both holds even when an image resolver never settles.

Keep `selection()` independently of the file. To read the archive, supply
that selection and a fresh native restore factory for the selected document
family. Admission checks the complete file digest, record boundaries and
raster bytes. It reconstructs the exact attempted save when one was
prepared, replays all retained slots in Rust, verifies native ancestry and
version packet prefixes, and checks that the raster manifest covers those
slots. `records()`, `assetReferences()`, and `uploadBackup()` expose the
checked recovery inputs. Each read performs validation in memory. A
whole-room catalog still needs to bind these inputs to a provider and
coordinate their adoption across destinations.

The continued participant format has a 640 MiB budget for unique native
records, plus the existing selected-image and whole-upload limits. A cut
that exceeds these limits remains available in its original store.

### Retain a continued room catalog

`SharedContinuedRoomCatalog` binds complete origin and current physical
server files, the current native participant inventory, and an explicit set
of participant archives, including at least one continued local participant. Supply the expected identity and
native restore factory for each participant outside the manifest. Version
four uses its own manifest and storage family. Older participant families
keep their existing file formats and readers. Graph and local-operation
files still require their matching read policies.

Admission replays each participant's retained save slots and compares its
live native document and comment prefixes with the selected server
inventory. A divergent accepted prefix refuses the catalog. An inventory
ahead of the local cut is reported as pending, with the local cut preserved.
Duplicate copies of a writer or comment actor require explicit
reconciliation. A matching comment prefix leaves delivery pending because
the continued local archive carries no relay binding or outbox.

`SharedContinuedRoomCatalogStore.begin` admits the selected archive and
retains it in a new IndexedDB namespace. `resume` revalidates the files and
native prefixes after a cold open. The catalog exposes each participant's
exact save cuts, whole upload backup, and asset bytes for each continued
participant. Other families remain available as exact participant files.
Prefix inspection names those files under `unreconciledParticipants` until
the mixed recovery coordinator can check them together.

### Restore local destinations from a continued room catalog

`beginContinuedRoomRecovery` takes an open durable catalog, its independently
retained selection, a new recovery journal name, and a distinct history and
upload database name for each participant. Supply current host authority and
explicit writer reacquisition. The recovery restores each participant's
validated live cut with read-only native policy and preserves the archived
upload queue. The catalog retains the earlier save cuts and referenced bytes,
including images available only in the archive.

The journal records each step before it writes. After an interruption,
`resumeContinuedRoomRecovery` reopens the same plan and checks the exact
durable contents before it advances. It accepts a matching committed step
whose acknowledgement was lost. A completed destination that has changed
or disappeared stops recovery. Each paired history destination is checked
in one read transaction. The first write checks that both stores are still
empty in the same transaction that saves the head and history files. The
coordinator keeps each admitted local
history and upload store held through final verification and releases them
before returning the local destination names.

Use `family: "continued-delivery"` and the independently retained version-two
participant selection for a continued delivery entry. Supply its exact
native restore factory in `policies`. The journal reopens the complete
paired delivery state and the whole upload store at the two dedicated
destinations. Recovery acquires every selected continued-delivery document
and comment writer lock before it creates the journal or writes a destination.
Each native replay borrows its assigned pair of locks. The coordinator holds
those replays through exact history and upload verification and releases the
locks before returning. If the source commit loses its acknowledgement,
recovery reacquires the same writer pairs and checks every stored row against
the selected cut before it advances. This is local staging for room recovery.
Server activation still requires a separate authenticated decision.

The same journal supports continued local participants and both independent
local and independent delivery participants.
Pass one `independentPolicies` entry per independent local participant with
the catalog ID, the independently retained archive selection, and a native
session factory with document and review access both read-only. The factory
must select the original or segmented V1 format separately for each lane.
Recovery verifies the reopened native histories, retained version packets,
asset references, and whole upload backup against the selected archive.
Supply `deliveryPolicies` for independent delivery participants. Each
factory also selects the exact relay binding and retained stores. Recovery
reopens the native pair and delivery records together, including relay
progress and queued suggestions, revisions, and versions. The staged
session requests no relay token and sends no queued work.
Supply `generationPolicies` for the earlier generation archive family.
Each policy names its exact local, relay, retained, or continued-local
generation factory. Recovery keeps the original generation database
layout. The continued-local destination retains both the active head and
the original V1 predecessor in the same database, with its immutable
generation files and upload state.
For a restored graph, local-operation snapshot, or flat local-operation
archive, each destination also supplies `operation: {parent, journal}`.
These names select the participant coordinator and operation journal. The
existing `source` and `uploads` names select its native and upload stores.
All names must be distinct across the room. Use the catalog's pinned
`graphPolicies` and `localPolicies` to reopen these exact archive families.
The nested journal replays its selected cuts and keeps the literal input,
including archived provenance and asset bytes. The room journal records the
whole participant as one step and resumes an interrupted nested replay from
its own durable cursor. After a participant finishes, a cold room resume
reads its durable native cut and upload backup without issuing a new save.
It refuses a different input, a missing component, or a changed live cut.

Supply `originalPolicies` for archives captured with
`captureSharedParticipantBackup`. Each policy selects the retained archive
and its original document or paired native factory. The factory must return
an unobserved native owner so recovery can initialize read-only policy
without changing its checkpoint. Set the destination's `original` field to
the database names for its declared `suggestions`, `revisions`, and
`versions` stores. Use an empty object for archives with no separate stores.
The corresponding policy fields supply the exact suggestion and version
identities and revision binding. Recovery uses an inactive metadata
transport and requires no credentials. Each original store has its own
room-journal step, so a committed packet store can be reopened without
resaving it after an interrupted restore.

Duplicate document writers and review actors, mismatched policies, and
missing required namespace names stop recovery before journal creation.
These destinations provide local recovery. Provider reconciliation and
authenticated activation have separate contracts.

### Compare a continued catalog with its provider

`readContinuedRoomReconciliation` reopens the durable catalog and requires
an operator host selected for the same origin, current physical server, and
participant inventory. It compares each participant's live document and
comment history with every accepted author, including server document
authors. The report distinguishes local suffixes from histories behind the
server. A divergent accepted prefix fails admission. For a continued
delivery entry, catalog admission also checks the saved receipt positions,
the registered review actor, the wire version, and all selected retained
store bindings against the physical inventory. The bound review actor
contributes to the provider reconciliation report. Authenticated activation
of a restored room is a separate step.

The provider read includes image bindings reachable from all save slots and
every content ID in the participant upload archives. When every participant
has been admitted, it reads the same selected relay's authenticated native
dependency inventory and checks the union of client and server bindings.
This includes images referenced only by retained server packets. It verifies
provider resolutions against known client content and dimensions and reports
missing mappings or bytes. The read
preserves the original upload state and leaves local comment delivery
pending. For a mixed catalog, supply `independentPolicies` to compare the
accepted prefixes of independent local participants and include their asset
bindings and complete upload backups. Each policy selects a temporary
read-only native replay. Supply `deliveryPolicies` to include independent
delivery archives. The read validates each archive's document and review
transport, registered review actor and binding, and retained store
namespaces against the selected room. A matching bound review prefix
contributes to coverage. An archived acknowledgement ahead of the
selected relay inventory stops the provider read. Supply `generationPolicies`
for segmented local, continued local, segmented relay, and segmented retained
archives. The read replays the native journals and retained packets, verifies
the V1 predecessor of continued histories, and includes the exact generation
image bindings and complete upload backup. Document-only archives contribute
document coverage through `documentOnlyParticipants` and leave registered
review coverage pending. Supply `originalPolicies` for original native
checkpoints with their original review and retained packet codecs. Each
policy selects a matching native restore factory for an exact archive.
Set `includeOperationArchives: true` to use the catalog's pinned
`graphPolicies` and `localPolicies` for restored graphs, local snapshots,
and flat local operations. The read compares each LIVE native cut and
requests the image bindings from every admitted ancestor, including images
referenced only by an older pending proposal. The upload pin is the latest
whole upload backup of each archive. Only the restored graph has a bound
review lane.
The provider read creates no local destinations and changes no delivery
receipts or grants.
If any participant still lacks supported prefix admission, the operator
host rechecks the selected room and the provider report stays empty.

`readRecoveredContinuedRoomReconciliation({recovery, reconciliation})`
requires a completed local recovery journal and an authenticated operator for
the same catalog cut. Pass the original recovery options and the provider
read options with the catalog and expected selection omitted. It opens the
exact existing history and upload destinations, holds their ownership
throughout the provider read, then rechecks the journal, catalog, and
destinations. A missing or interrupted recovery must be completed explicitly
with `resumeContinuedRoomRecovery`. Changed destinations cause the read to
fail. Every participant must have a provider read policy. Missing provider
bytes and any remaining delivery work are reported in the reconciliation
result. This read leaves the journal and destination data unchanged.

`previewRecoveredContinuedRoomCatchUp` uses the same completed recovery
and operator policies. It reads the selected relay's accepted document frame
and paginated comment batches, applies them to isolated native replays of
the continued-delivery participants, and verifies each batch receipt and
accepted author prefix. The preview refuses a participant whose own authored
stream is behind the relay. It returns reconstructed checkpoints with the
original local Undo/Redo, version packets, relay receipts, and outboxes.
The original destinations stay unchanged. The preview is detached data for
an explicit replacement plan.

`retainRecoveredContinuedRoomCatchUp(input, {database, catalog, retainChoice})`
repeats that reconstruction under the live operator and completed recovery.
Use a fresh database and catalog name. The replacement pins the same physical
origin, server and participant inventory. It advances only the live records
of continued-delivery participants and preserves all earlier save slots,
upload backups and other participant archives. Newly reachable image
references require verified bytes from the selected provider.

Save the detached choice in `retainChoice`. The SDK rechecks the operator and
the completed source before it inserts the replacement catalog. On a restart,
open `SharedContinuedRoomCatalogStore.resume` with the saved `database` and
`replacement` selection. Keep the original read policies and replace the
expected selections listed in `advanced`. If the insert never committed,
resume reports the catalog missing. An existing catalog must match the exact
retained choice.

Use `beginContinuedRoomRecovery` with this reopened catalog, a fresh journal
and fresh participant destinations. Keep those names and the exact catalog
selection for `resumeContinuedRoomRecovery` after an interruption. This
produces local replacement destinations. Authenticated serving and old-writer
fencing across devices require the whole-room activation workflow.
