# Complete room record retention

`PhysicalRoomClientOperationV3.captureRecordCut(options)` captures complete selected
client data while the genuine room, seven-family source reads and whole-upload
stores remain held. `retainRecordCut(database, options)` additionally commits that
file to a separate immutable database before returning. This supplies the durable
data basis for a later operational handoff; it does not approve choices or create
an editable successor.

Capture requires an operational coordinator. Source-level pending and uncertain
work remains separate data; capture does not complete or acknowledge it.

## Source data and literal inputs

The internal opt-in `records-v1` channel carries data from the same admitted
source reads that verify native continuation. Ordinary history and provider reads
keep their existing formats, limits and no-full-payload retention behavior.

Original sources preserve native committed, pending and LIVE records, selected
version stores, suggestion queues and revision outboxes, including a revision
outbox's actual base queue. Generation sources preserve committed, uncertain
attempt, pending and LIVE generation records. The five newer families preserve
their exact parent/source identities, typed journal records, CURRENT/PENDING
native files, LIVE recovery and selected packet dependencies. Graph sources also
retain the complete outer journal, not just its current intent.

The journals keep their existing bounded contracts. In particular, local journals
retain at most the CURRENT and PENDING cuts; they are not an unbounded archive of
every earlier save. Native checkpoints preserve their own Undo/Redo history. The
full capture compares every admitted typed row across its double read and later
verification, and native-validates those rows without promoting a pending packet
to LIVE or resurrecting forgotten work.

Literal inputs remain separate entries with their original roles. Original
participants keep the operation origin; generation participants keep both
recovery and operation origins. Local/delivery participants keep their source
origin, graphs keep source origin and parent input, and snapshot/flat participants
keep the actual input file. Snapshot whole-file identity and flat canonical
manifest identity retain their original meanings. No AST export substitutes for
native checkpoints, provenance, packet rows or input files.

The file also contains the actual root intent, all retained catalog files and
complete upload archives, including unreferenced uploads. Unselected historical
catalog copies remain literal files and explicit `unreconciledParticipants`;
their presence does not establish native replay or current registration coverage.

## Portable format and independent selection

The new version-one envelope is a bounded canonical JSON manifest followed by
contiguous literal entry bytes. Each entry has one role, size, MIME and SHA-256.
The independently retained selection pins the whole file's exact size and SHA-256.
Parsing verifies that pin, every entry hash, exact layout, source-family shape,
catalog selection and participant ordering. Gaps, aliases, extra data, truncated
files and unknown manifest or envelope fields refuse. Stored summaries and
source records still require family-specific native admission before editing.

JSON records preserve opaque native strings and ordered packet arrays exactly.
Unsupported values such as undefined, nonfinite numbers, accessors, sparse
arrays, cycles or custom objects refuse instead of disappearing through ordinary
JSON serialization. Literal binary files remain Blobs rather than JSON copies.

`PhysicalRoomRecordCutArchive.read(file, selection, integrityOptions)` returns
detached data. `records(id)` returns unknown data, not a native source; a future
editable restore must perform the original family-specific native admission
under independently chosen current policies. Disposing the archive drops payload
and file references while retaining small immutable metadata.

The whole file is bounded to 1 GiB, the manifest to 16 MiB, each JSON entry to
256 MiB, the entry set to 16,384 and participants to 1,024. Existing source/native
limits and the 512 MiB complete-upload capture limit also apply. Depth and node
bounds apply to JSON. Oversized input refuses as a whole; these bounds do not
qualify memory usage or latency.

## Immutable storage and interrupted I/O

The destination must differ from the root, catalog and every actual selected
child namespace. A recovery lease excludes cooperating operations while the
database is opened, read and hashed. These origin-local locks are not account
authentication or cross-device writer fencing.

Creation commits the schema, independently pinned selection and literal whole
file in one upgrade transaction. Existing namespaces are never initialized,
repaired or overwritten. A retry accepts only the same stored selection and
actual matching file hash; it performs no second put or add. A lost acknowledgement
does not delete committed bytes. Missing cold reads abort creation rather than
leaving an empty placeholder.

`readRetainedPhysicalRoomRecordCut(database, independentlyRetainedSelection,
integrityOptions)` rereads stored bytes under a fresh grant and native digest.
Retain the selection outside the cut; a stored hash or phase is not independent
approval. The read returns a data archive only after actual storage and lease
cleanup acknowledgements finish.

Cancellation rejects a public open even when its raw request is queued behind
foreign work. Both opening custody and the genuine root's cleanup scope retain
the actual failed cleanup until that raw request drains. A late upgrade after
close or cancellation aborts. Cleanup needs no continuing grant and never retargets
to a newly installed database factory. Final source/context/signal fences survive
the real cleanup await; a prepared result cannot escape after cancellation.
Editable root handoff also drains any retained failed-opening cleanup before
consuming the root. A still-queued request refuses handoff; after the actual
request drains, the same root can finish cleanup and transfer ownership normally.

After retention I/O, capture re-admits all selected source records, complete
uploads, root intent and actual catalog bytes before the final held-state fence.
A file may have committed before a later source change causes refusal; that old
file remains retained data, not a claim that the changed room is current.

## Functional qualification

The [qualification](qualification/2026-10-24-room-record-cut.json) passes fourteen
selected normal candidate stages. Source, fresh offline-installed packages and
actual production-bundled code each pass the same 1,482 laws, with nineteen
strict consumer type fixtures and no failures, cancellations or skips. All 1,421
prior history/provider/reconciliation laws remain, plus 61 new framing, storage,
failed-save payload and actual-native SDK laws. The selected nine Rust asset
tests also pass; this is not a fresh full-workspace Rust suite or the full
449-stage release plan.

Four new cases cover all seven families across independent document and comment
history pairs. After the original owners close, the tests cold-read the retained
file using its external pin, compare literal inputs and whole upload bytes, and
use host-selected factories to reconstruct exact native checkpoint pairs and
future Undo/Redo. Those 28 client instances plus four partial/corruption/cleanup
instances reuse language 3 standard/atomic data. Separate fresh native producers
cover ten profile/wire rooms each with all 100 input files verified; this is not
a new full profile-by-history SDK matrix.

Two actual-native probes reproduce and verify repairs. An undefined retention
destination must refuse rather than return a portable-only file. A cancelled
opening's still-pending raw request must block editable root handoff; after the
request actually drains, the same root completes cleanup and transfers normally.
The permanent SDK cases pass from source, installed packages and the bundle.
Superseded runs are retained separately and do not count as final qualification.

These tests use controlled IndexedDB, locks and raster presentation. They qualify
the retained data and native continuation, not physical browser crash durability,
memory/latency budgets or a complete editable participant restored from the file.
Six new public data exports are intentional; package versions, normal Wasm and
old native/stored protocol meanings are unchanged.

## Architecture priorities after retention

The next barrier must independently approve the exact retained source cut and
selected upload-base choices, then create a genuine editable successor while
preserving both losing inputs and all pending/offline/review/version work. Merely
swapping upload stores or relabelling a participant family is not a handoff.

Full reconciliation must then account for every retained client copy, current
registered document/comment stream and required provider byte. Authenticated
whole-room activation must bind the ancestor/current/local-origin identities and
the control instance, reacquire writer registrations and fence stale writers.
Sustainable native history and outstanding offline edits across generations
remain architectural work. Browser polish and cosmetics follow these data and
authority barriers. All thirteen V1 gates remain open.
