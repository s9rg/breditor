# Complete independent delivery participant recovery

`SharedIndependentDeliveryParticipantBackup` preserves both exact native histories,
local versions, relay progress, all selected review/version records, selected raster
payloads and the complete upload store in one portable file. It captures the actual
`SharedIndependentDeliverySession`, including current readable work after a failed
or uncertain save. Visible text and native revision numbers never replace the
complete participant.

This is a distinct opt-in source/archive family. Local-only independent and older
generation captures remain closed to it, so fallback cannot silently drop receipts,
queued decisions or revision packets. Original native, wire, storage and archive
meanings stay unchanged.

## Complete source and lifetime

`captureSharedIndependentDeliverySource({session})` requires the genuine full
delivery owner. Its nonsecret identity selects independent document/comment
families, transport bindings and each retained-store binding or explicit null.
Current permissions are not historical archive identity.

Separate immutable records retain document and comment checkpoints, ordered local
versions, relay progress and each selected suggestion, revision and catalog record.
Original native strings and retained formats remain exact. Missing, duplicate,
extra, reordered, noncanonical or oversized records refuse.

Private change identities cover both native lanes and all companion state. Outbox,
catalog or receipt changes invalidate the complete capture even when the native
revision is identical. Unchanged checks do not serialize complete checkpoints.
Public export/reference overrides and replaced `core` getters cannot redirect reads.
A borrowed native-only reader does not certify unchanged outboxes; its explicit
complete-source check remains mandatory at recovery boundaries.

Capture does not save, edit, upload, authenticate, publish or seal. Readable retired
history can still be captured after a failed final close while the genuine owner
retains its leases. Disposal or explicit discard invalidates live captures.
Detached archive bytes may outlive them but grant no writer custody.

## Packet dependencies and complete uploads

Raster requirements include current and retained native history, local versions,
pending proposals, predecessor/child revision packets and cached catalog versions.
Uncached published versions or missing native packet sources stay explicit Pending,
not a partial Ready reference list.

`captureSharedIndependentDeliveryParticipant` captures the source inside the whole
`RichAssetStore.captureBackup` callback with a synchronous current host-authority
check. The original upload file retains unreferenced bytes, cancelled/failed/pending
state and epochs. Later store changes do not rewrite that immutable cut or settle
the later queue.

Content-addressed bytes can resolve locally. Opaque IDs require a resolver binding
the exact asset/generation to an immutable content digest. Raster admission checks
actual PNG/JPEG/WebP bytes, type, dimensions and limits. Complete source, authority
and provider mapping checks repeat after asynchronous work and before Ready or
Pending. Late outbox changes, closure, cancellation or revoked authority refuse
without deleting source work.

## Closed portable format and verification

The MIME is `application/vnd.breditor.independent-delivery-participant-backup`.
Magic `BREDITOR-INDEPENDENT-DELIVERY-PARTICIPANT1` plus newline precedes a four-byte
big-endian header length. Canonical UTF-8 JSON uses
`breditor/shared-independent-delivery-participant-backup`, version one. Contiguous
sections retain separately hashed native/retained records, raster payloads and
the unchanged whole upload file.

`readSharedIndependentDeliveryParticipant(file, expected)` requires the independent
identity and full-file SHA-256 returned by `selection()`. Closed fields, offsets,
lengths, hashes, generation links and original record/raster/upload admission are
checked. Unknown families/versions, gaps, truncation and trailing data refuse.
Hashes establish byte integrity, not provenance or permission.

`sourceRecovery()` returns the complete delivery DTO. `verifySource` requires a
genuine unchanged capture with exact records and native/packet requirements.
`verifyRecovered` also compares the complete restored upload file, including state
and epochs. Rehashed false declarations are not semantic native proof: actual Rust
cold replay and packet/receipt admission still precede writable recovery.

Internal read, verification and cleanup use canonical private operations. Public
read/verify facades cannot mint fake Ready results. The same reproduced defect is
repaired in the existing local-only participant without changing its format.

## Restore under current policy

Restore the full source with `SharedIndependentDeliverySession.restoreRecovery`,
matching bindings, fresh document/comment policy and an absent source destination.
The host separately reacquires/fences writers and supplies
`writerRecovery: 'host-reacquired'`; that assertion is not server authentication.
Both actual native families and retained packets/receipt prefixes are admitted.

Restore `uploadBackup()` with `RichAssetStore.restoreBackup` into a separate empty
destination and explicit `uploadState: 'preserve'`. Capture the restored complete
session and call `verifyRecovered` before handing either owner to application code.
Validation never requires unlocking read-only owners. Named delivery adapters
reconnect with fresh tokens and actual server admission. Permanent observers retain
their zero author prefix and Accept refusal after recovery and account regrants.

These component restore methods are not an atomic multi-store coordinator. Prefer
the separate [durable recovery coordinator](INDEPENDENT_DELIVERY_RECOVERY.md) for
resumption across interrupted source/upload commits and real upload custody through
read-only handoff. Manual component restore still requires retaining the archive
and any committed destination after partial failure, without overwriting it.
Operational descendants and the room coordinator must retain every historical-copy
decision and bind current provider/client state before authenticated activation.

## Bounds and qualification scope

Native lanes retain their 16 MiB original or 64 MiB segmented limits. Up to 32 local
versions remain bounded to 4 MiB each, relay metadata to 16 KiB, and each retained
record to 32 MiB. The full source permits 38 records and 352 MiB plus 64 KiB; existing
native head, delivery head and serialized recovery bounds still apply. References
remain bounded to 100,000, unique packet reads to 1,024 and the header to 64 MiB.
Original raster/store/upload limits stay unchanged. Refusal never prunes data.

Whole bounded Blob sections are hashed with Web Crypto, not streamed. These limits
do not certify quota, memory or latency. The client native Undo ceiling remains
1,000 inputs. Backups contain deleted text and original host upload metadata; keep
them private. Resume credentials, tokens and current grants are not added to source
identity or delivery recovery DTOs.

Required source and fresh installed checks share native, portable-byte and real
authenticated-network assertions. IDB/locks, raster presentation and the network
fixture's host mapping callback are synthetic. This is not physical crash
durability, whole-provider reconciliation, room activation or V1 approval.
All thirteen V1 gates remain open.

The [selected qualification](qualification/2026-10-21-independent-delivery-participant.json)
passes 55 stages and 1,797 script tests, with three existing opt-in skips. Source
and fresh offline installed packages each repeat 120 local native configurations,
240 cold pairs, 360 future native-history comparisons, 88 authenticated network
cases and 136 complete network archive restores. All 44 focused laws pass in both.
Thirteen installed reports pin matching package hashes. The exact final
fake-Ready regression fails on the previous archive, whose 769 installed files
were compared with its preserved package. The six normal shared runtime files
and 2,986 native inputs are unchanged. Complete native-suite evidence is carried
only across those exact inputs, not claimed as freshly reexecuted here.

## Remaining operational and room recovery boundary

The durable participant coordinator now retains both actual source/upload owners
through exact cold recovery. Subsequent operational edits still need immutable
origins and genuine native continuation verification, not repeated equality with
the original backup. A room parent must adopt that custody explicitly together
with original/generation participants and retain historical-copy decisions.

Physical room adoption, complete provider/client reconciliation, independent
server-log generations and fresh authenticated activation follow this boundary.
None is granted by a backup hash, a local ready record or component restore.
