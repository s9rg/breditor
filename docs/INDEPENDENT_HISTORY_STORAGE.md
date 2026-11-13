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
Retry, version retention, and close wait for the caller to dispose the read.
Call `verify()` to reread and verify the committed head and referenced files.

`readAssetReferences(checkAuthority, signal)` replays each selected slot with
fresh read-only policy. Rust verifies continuity of both native lanes, and the
version catalog must retain its earlier packet prefix. The result includes
the exact committed head and the union of native and version packet asset
references, with each slot's references available separately. The returned
data describes one observed cut. Whole-room adoption must separately bind
that cut to the selected participants, upload stores, and provider.
