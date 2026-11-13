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
the retry lookup. The receipt index retains at most 128 boundaries; the native
64-generation-per-lane limits remain independently enforced. A receipt is not
proof that its historical cut is still the latest room cut.

## Replay complete native cuts before recovery publication

Cold opening rederives every boundary from the exact prior native histories and
current replayed room authority. The original root, sealed files, local history,
retained anchors and private effect-author cut must produce the recorded hashes.
A correct outer log checksum cannot substitute for that replay. Duplicate durable
boundary records, forged owners or changed native cuts refuse before even an
incomplete final tail can be trimmed.

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
256 MiB whole-log and 20 MiB per-record limit. These lifecycle calls do not widen
or rotate that log. Candidate preparation and boundary staging currently serialize
and replay bounded complete native archives; no latency envelope is implied.

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
principal and registered actor. The continued room allows up to 320 native
boundary receipts across both lanes, alongside the independent native archive
and physical log ceilings.

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
