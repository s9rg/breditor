# Native history generations on the reference server

The reference relay can retain document and comment generations independently.
Explicit owner-side lifecycle calls preserve exact native histories, original
writer identities, local history and durable acceptance receipts. They do not
rotate the server log, compact old data, reset a writer or activate an entire
recovered room.

Existing room constructors and seeds keep their original native families.
`native_history_descriptor` reads the actual selected families after current room
read authorization. The descriptor uses `breditor/relay-native-history` version 1;
it is separate from the document compiler, writer transport and review binding.
Reading it does not negotiate a client capability or authorize a boundary.

## Select and seal each lane explicitly

The authenticated room owner can call `enable_document_history_generations` or
`enable_review_history_generations` with distinct root and active generation IDs.
`seal_document_history_generation` and `seal_review_history_generation` close a
nonempty active suffix and select a lifetime-new ID. Native identity, file and
archive checks remain authoritative. An invalid or conflicting intent appends
nothing and leaves both native owners unchanged.

Each lifecycle action has its own Rust module. Shared preparation and publication
code stages exact native candidates while the exclusive room owner serializes
the transaction. It performs no document import from a visible AST and no network
callback between preparation, durable append and publication.

The comment receiver stays the reserved, read-only, zero-authored observer.
Received client events retain their authenticated actor and principal. Comment
archival never borrows a writable policy or a client author identity. Accepted
document content is unchanged by a comment boundary.

## Preserve the private suggestion effect author

Document boundaries also retain an already enabled private suggestion-effect
author. Its generation IDs are `effect-` followed by the lowercase SHA-256 of
`breditor/relay-effect-history-generation/1`, a NUL byte and the corresponding
document generation ID. These are opaque native IDs, not credentials or writer
counters. Both original roots and every prior immutable file stay exact.

An effect author with an empty active suffix keeps that file rather than inventing
an input or an empty seal. If suggestions are enabled after document generations,
their newly created private author explicitly adopts the current document
generation policy. Cold replay reproduces each selected creation order's exact
retained cuts through the matching native factories.

Preparing an authenticated writer group or a suggestion effect now has a separate
`segmented_checkpoint` getter for a candidate already selecting generations.
Original getters continue to refuse that family. Native suggestion preparation
checks the selected family before returning a candidate; it cannot acknowledge
an Accept whose exact recovery would fail an archive bound. Original effects,
operation counters and receipts retain their previous meaning.

## Append before publication and retry the original boundary

One `NativeHistoryBoundaryV1` record retains the authenticated owner, lane, exact
enable/seal intent and before/after native-cut hashes. The hash domain is
`breditor/relay-native-history-boundary/1` followed by a NUL byte and the lane
byte: zero for document, one for review. The native checkpoint and optional
effect-author checkpoint each contribute a presence byte. A present checkpoint
also contributes an eight-byte big-endian length and the exact UTF-8 bytes.
No parsed native event or operation body is reserialized for this hash.

The server prepares and checks the complete candidate, appends and syncs the
record, publishes the admitted owners, then returns a
`breditor/relay-native-history-receipt` version-one receipt. Its decimal sequence
is the original global log position, not a generation-local cursor. If a write
is uncertain, the room remains fenced until recovery and no candidate is
published or acknowledged from memory.

An identical intent retry returns that original receipt with `duplicate: true`.
It appends nothing, even after later native boundaries or a restart. In particular,
retrying an old Seal does not seal newer input. Permission checks still precede
the retry lookup. Before either continuation, the receipt index retains at most
128 boundaries and each native lane admits up to 64 generations. A receipt
identifies its historical cut even after the room accepts later work.

## Replay complete native cuts before recovery publication

Cold opening rederives every boundary from the exact prior native histories and
current replayed room authority. The original root, sealed files, local history,
retained anchors and private effect-author cut must produce the recorded hashes.
A correct outer log checksum cannot substitute for that replay. Duplicate durable
boundary records, forged owners or changed native cuts refuse before even an
incomplete final tail can be trimmed.

Inside a native review archive, cold restore validates the original root and
carries forward per-actor event positions, digests, births and Undo/Redo stacks.
It checks each new segment's append order and transitive causal frontier against
that prefix. Each cut must match its exact saved local history, cursor, bytes and
selected family's limits. Late concurrent events retain their archive positions
and can precede earlier files' inputs in the final canonical projection.
Malformed cuts still report failures through the canonical order. The replay
state is rebuilt at restore and never supplies live actor permissions.

The complete room-log backup retains these new typed records and their original
global order. Its existing outer backup framing stays unchanged; readers that
do not understand the explicitly selected new event must refuse it. Backup
restoration still replays the full log before insert-only publication, retains
the original expected cut and requires separate host writer reacquisition.
Client edit/comment receipts, final review decisions, versions, revision records
and credential digests are not reset or renumbered.

Joined server recovery retains the document and comment receivers' exact native
cuts alongside the original raster archive. Its public regression also restores
an independently segmented offline client, compares the complete retained asset
inventory, and exercises future Undo/Redo without undoing a peer's text. A retry
of the completed recovery cannot overwrite later accepted service edits.

`native_history_checkpoint` is an owner-only read of one receiver's exact native
archive. It excludes the private effect author, external assets and offline
clients; use the complete server backup rather than treating this detached string
as whole-room recovery or an activation capability.

## Keep native retention separate from operational lifetime

Native original and generation bounds remain unchanged, including the 1,000-item
retained document Undo ceiling. The original server log still has a 4,096-record,
256 MiB whole-log and 20 MiB per-record limit. These lifecycle calls leave
rotation and those bounds to the server-log contract.

Before the relay appends an edit, native admission checks the candidate against
the byte limit of its selected history family. With segmented or continued
history, admission counts the exact canonical JSON string length of each root
or sealed file once, when the file becomes immutable or is restored. Each edit
charges those lengths, array separators, the selected envelope and the current
active file. JSON escapes and the continuation boundary count toward the same
limits used by the full checkpoint writer. The relay uses this native check for
prepared comments and segmented or continued writer groups, including the
receiver of an accepted suggestion. Explicit export and boundary hashing still
write the complete canonical archive.

The final review admission check shares one canonical causal order across replay
validation, projection and the original-family checkpoint byte check. Each
blocked event waits on the first prerequisite it still needs. Once it arrives, the
event checks its remaining dependencies. Among ready events, the lowest actor
and counter still come first. The scheduler retains one queue entry per event
at most. This avoids repeatedly scanning a blocked stream while another stream
advances. Native replay and the private suggestion author's reconstruction
still have costs that grow with retained history.

Live review frames and extra retained-branch events share one actor-counter
index per staged batch. A closed, bounded causal frontier gives direct access
to the original thread or message author for each permission check. The host
still supplies the actor's live or historical grant and verifies anchors.
Live history toggles reuse their admitted anchor. Retained-branch history
toggles still validate the original anchor under the host's callback.
Unproven frontiers or staged history use the original causal projection for
refusal and callback behavior. Final native admission still precedes publication
or a durable receipt. Relay preparation uses one decoded frame and one staged
metadata copy for admission and the existing receipt digest.

## Observe native history capacity on a serving relay

`Room::native_history_capacity` reads the admitted cut after the caller
authenticates the room owner. `ServerBackupHandle` and
`LogGenerationServerBackupHandle` do the same under the current serving
lease. The `breditor/relay-native-history-capacity` version 1 report carries
separate document, review and private suggestion-effect usage. Optional
lanes are null when disabled. Each lane names its selected family and
reports exact canonical active-file and whole-checkpoint bytes, active
inputs, retained inputs, generation files and Undo/Redo depths. Generation
files include the root and active file. Original history has no separate
generation count. The room also reports the stored native boundary receipts
and their limit under the families it currently uses.

Segmented byte charges reuse the exact immutable file charges used by
admission. An active file can reach its own ceiling before the whole archive
does. The native Undo depth ceiling describes its policy, including eviction
of older steps by the original document policy. A segmented author can
exhaust its own Undo depth independently of the receiver. The report is a
point-in-time observation. Host maintenance chooses when to seal or continue,
and each write independently checks its available capacity. Existing log and
raster capacity reports continue to describe those separate resources.

## Prepare an explicitly selected native boundary

`prepare_native_history_boundary` stages the same authenticated native
operation on a private candidate and measures the projected capacity. The
preview checks the exact typed WAL frame size, record allowance and any
required physical rotation. Preparing keeps durable storage and all live
owners untouched. The caller selects the resulting
`breditor/relay-native-history-selection` version 1 value.

`apply_prepared_native_history_boundary` checks current owner authority,
the original room binding, exact next WAL sequence and terminal digest,
native before and after digests, and the measured append cost. A changed
cut requires a new preview. Application appends the existing boundary
record and uses its normal durable receipt. The private source and
relocated-handle methods additionally require the active serving epoch
and verify the held custody around each operation.

After a lost reply, `resolve_native_history_boundary` reads the stored
receipt by its exact intent, sequence and native cuts. It can resolve it
after subsequent writes or cold recovery and issues no append. Prepared
selections are detached values and each call authenticates independently.
The ordinary boundary methods still support their original exact-intent retry.

Server-log generations, matching client/relay negotiation, complete asset and
outbox dependency closure, historic-copy decisions, coordinated recovery and
authenticated room activation remain separate architectural requirements.
Passing native lifecycle tests does not close a V1 release gate.

## Functional qualification

The [2026-10-21 checkpoint](qualification/2026-10-21-server-native-history-generations.json)
passes 65 selected architecture checks, including fresh Rust suites, normal Wasm
producers, source and fresh offline installed consumers. It preserves the
pre-repair segmented-suggestion failure and a separate fixture-custody failure
as reproducible controls. The same positive assertions pass after their repairs.
Joined native/raster recovery additionally passes 16 repeated public tests in
both server-feature configurations. Exact old/new original-family comparisons
remain required; no original format, default or lifetime ceiling is widened.

## Continue the room's comment receiver

The owner can call `continue_review_native_history` with a lifetime-new active
generation ID. The receiver must already use the V1 comment archive. The
operation retains its exact V1 root and all prior seals, closes the old active
file, and begins the continued archive under the receiver's existing read-only
policy. The current document and suggestion effect owner are outside this
transition. The room descriptor reports the review family as `continued-v2` under
version two.

The relay syncs a distinct `NativeReviewContinuationV2` event before publication.
Its receipt uses version two and the same global sequence and cut hash rules.
An identical owner retry returns the original receipt after direct log reopen,
physical rotation, or backup replay. Comment frames and their receipts keep
their existing meanings. Resume still requires the current authenticated
principal and registered actor. A room with only one continued lane allows up
to 320 native boundary receipts alongside its separate native archive and
physical log ceilings.

## Continue the room's document receiver and suggestion writer

The room owner can call `continue_document_native_history` with a lifetime-new
active generation ID. The document receiver must already use the segmented V1
archive. The transition retains the exact V1 root and sealed files, closes the
old active file (even when empty), and starts a V2 active generation. When
suggestions are enabled, the same durable boundary advances the private effect
author using its existing deterministic generation namespace. If suggestions
are enabled later, their new private author starts using the continued history
policy. The comment receiver advances separately.

`NativeDocumentContinuationV2` binds the receiver and its private author before
and after the transition. The room syncs this record before publishing either
candidate. An exact retry returns the original version-two receipt and global
sequence with `duplicate: true`. Cold replay validates the cuts before exposing
the room. The room descriptor reports `continued-v2` for the document lane.
Existing client writer identities, physical WAL positions, suggestion decisions
and original receipts remain valid.

The receipt index allows 128 entries with both native lanes on their earlier
formats, 320 with one continued lane, and 512 with both continued lanes. Each
lane still enforces its own archive limits. Continued document retention admits
up to 16,000 Undo groups, 256 native files and 256 MiB of archive JSON. Physical
WAL rotation, capacity and safe reclamation are separate from this transition.

The November 13 checkpoint `6429bcb3` passes all 15 relay native-history tests
and 64 focused recovery tests. The continued-room provider check passes from
source and a clean independent package install using the same Wasm bytes.
Its activated fixture continues both native lanes before capturing the recovery
cut, then checks retained suggestion effects and seven reconnecting clients
through an actual relay restart, including concurrent offline edits and lost
replies. Client storage in this check uses controlled Node fixtures.

## Apply history boundaries on a serving relay

Use `apply_native_history_boundary` with the room owner's current native
credentials, a `ServerNativeHistoryLane`, and a `ServerNativeHistoryBoundary`.
A `LogGenerationServerBackupHandle` applies it to the original serving room.
An `ActivatedNativeLogGenerationHost` applies it to the recovered room. If the
host activated through HTTP, use the retained `DurableNativeActivationControl`
from Rust. These host methods operate under the current deployment lease and
serialize with ordinary edits. Recovered hosts also verify their original
room and raster custody around the operation.

Use the exact same intent to retry a lost result. If storage is uncertain,
reacquire the actual room through the normal recovery path before retrying.
A stale host and a prepared control cannot run maintenance. The relay uses the
existing native receipts, authentication and client editing protocol. Existing
sockets keep their document and comment leases across the boundary.

A linked or portably restored relay exposes the same boundary intent on its
`ServerBackupHandle`. Its host-local `native_history_descriptor` authenticates
the current reader. The owner can also call `storage_capacity` and
`rotate_log_generation` on this handle. Each call holds the current serving
epoch and checks custody of the restored room and retained client inputs.
A native boundary appends its own durable receipt. Physical rotation uses
the separate WAL receipt and preserves the global native record cut.
Cold retries of either action return the original receipt. Clients can keep
their existing connections and writer identities through both operations.

The November 13 checkpoint `00b3e729` exercises the source handle through cold
reopen and epoch replacement. The published-room test continues both lanes
with the original client socket still open, then delivers outstanding offline
work and document and comment Undo/Redo through that socket. The continued-room
provider runs from source and independent package archives use the source
handle to perform both boundaries and read both receiver families from the
cold-restored native room before exercising relay restart and delivery.
