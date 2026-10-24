# Original persistent record reads

Recovery must distinguish actual committed records from pending and unsaved
LIVE records. A failed save may leave an older row on disk; a lost acknowledgement
may leave a newer committed row than the SDK's last acknowledged state. These
private readers expose those states separately without saving or editing them.

## Document only native records

`captureOriginalNativeRecords` requires a genuine original unpaired session.
It reads the actual selected legacy, typing, general, document or search storage
codec, validates its room/writer/language/history identity without upgrading it,
and returns committed, pending and unsaved LIVE checkpoints separately. LIVE
uses the captured native checkpoint method, not a replacement instance hook.

The session's existing 16 MiB journal budget and original record formats remain
unchanged. Its private save-attempt epoch and native document revision invalidate
earlier reads after a retry, edit or even a no-op save attempt. Status inspection
does not. There are at most eight live reads per source; dispose them to release
permits. Ordinary edits and source closure invalidate reads rather than waiting
for them or being reversed by them.

## Paired native records

`capturePersistentPairedRecords` requires a genuine original paired session and
independent synchronous read authorization. It reads the selected local, relay,
observer, reviewed or search record family from the session's actual database.
The result contains the committed record, optional pending record and LIVE
document/comment checkpoints with their ordered immutable versions.

LIVE checkpoints use captured native facade methods, not replacement public
checkpoint hooks. Stored identity must match the selected source's native policy,
review actor, principal and declared relay/reviewed family. Existing record
validators and budgets remain unchanged. The reader does not replay the records
or treat matching metadata as native ancestry.

At most eight reads may be live per paired session. They do not prevent ordinary
editing or source closure: edits, save attempts, retirement or closure invalidate
their currentness. An in-flight save refuses rather than being flushed by a read.

## Original proposal queues

`borrowPersistentSuggestionRecords` requires a genuine standalone queue attached
to its still-live managed native source. It reads the actual committed proposal
row separately from pending and LIVE intent. A proposal removed from LIVE after
a failed save can therefore still contribute its retained packet dependencies.
A current-tree or current-queue export cannot substitute for that row.

The existing recovery gate reserves the queue and every attached adapter for the
read's lifetime. Delivery, mutations and attachment must already be idle; reading
never disconnects, flushes or retries them. Custom borrowed storage remains
editable through the old API but cannot issue this new managed read. Compound
atomic queues refuse this standalone reader and require their complete source
driver, so separate child exports cannot fabricate an atomic cut.

## Version catalogs

`captureOriginalVersionRecords` reads the genuine adapter's actual original
catalog row separately from pending and LIVE packets, receipts and retry intent.
It holds one disconnected synchronization reservation and blocks mutation and
delivery for that read's lifetime. It does not call the adapter's writable source
check while the reservation is held. The underlying private store reader also
checks genuine source bindings, its lease and a separate persistence-attempt pin.

An idle `local-save-failed` adapter remains readable. The separate read
reservation leaves its failure, status, retry intent and stored bytes unchanged;
it does not retry, acknowledge or start delivery. The original writable
`reserveLocalRecovery()` contract still refuses that failed adapter. The new
reader initially reused that stricter reservation and failed all 48 save-failure
cases in development. The same unchanged workload passes after selecting the
separate non-mutating read reservation.

## Revision outboxes

`captureOriginalRevisionRecords` reads a genuine original revision outbox and
its base proposal queue under one existing shared queue reservation. It returns
committed, pending and LIVE revision records plus those queue states. It never
reserves the already-held queue a second time. Actual verification rereads both
stores; a changed queue row invalidates the result even when the outbox row is
unchanged.

The source and every attached delivery adapter must already be idle. The reader
uses current independent read permission, not an expired transport callback or a
network-ready probe. A revision removed from LIVE after a failed save remains
visible in its actual committed row, including an image found only in that
retained packet. Reading does not requeue, publish or accept the revision.

Custom borrowed version and revision storage keeps its existing editing API but
cannot issue these managed reads. Atomic compound sources require their complete
driver and refuse the original-store readers before invoking read authorization.

## Checks and disposal

`check()` checks source bindings and lifetime around the current read-authorization
callback. `verify()` also rereads the actual committed bytes through the selected
record validator. `checkCurrent()` is the final callback-free, I/O-free fence;
run it after host callbacks before using the result. It does not replace durable
verification. Pending and acknowledged record identities are pinned independently
of the native document/comment clocks.

Native readers pin their selected native revisions. Retained-store readers pin
their record and persistence state; none alone is a complete multi-store/native
snapshot. A coordinator must acquire all genuine selected readers and apply final
fences together before native replay and reconciliation.

Read authorization does not grant writing, review acceptance, network access,
asset custody or room activation. No read acquires an author or changes native
permissions. Disposal releases the read permit or queue reservation and clears
all producer and authorization callbacks. Frozen detached metadata stays readable
after disposal; keeping it does not keep the read alive.

## Native and packet reference replay

`captureOriginalRecordReferences` acquires genuine original native readers and
the explicitly selected version, proposal or revision readers. The revision
reader already owns its exact base queue; selecting both is refused in the
TypeScript contract and at runtime. Stores from a different native owner refuse
before read authorization runs. Atomic generation owners use their complete
driver instead of these original-store readers.

The host selects the native restore factory independently. Each committed,
pending and LIVE native state is replayed read-only with exact checkpoints,
descriptor, language and original history policies. Native continuation in both
document and comment lanes and the ordered local version prefix must survive
between states. Comparisons remain inside the selected read runtime, including
when it is a separately loaded copy of the normal Wasm runtime. There is no AST
equality fallback or temporary author grant.

Selected catalogs, queues and revision outboxes keep their own committed,
pending and LIVE rows. Native packet/source and receipt admission runs against
the latest exact native replay. These independent stores are not represented as
one atomic save. A committed proposal or revision forgotten from LIVE after a
failed save still contributes its image references. Lost acknowledgement instead
uses the row actually committed. Uncached catalog versions and missing remote
packet dependencies stay pending, not ready.

The reader finds addresses without a current upload store or a provider request.
It refuses above 100,000 distinct asset/generation pairs across the result and
1,024 packet reads per state; it never truncates a complete result. Temporary
native replicas are disposed after discovery. Genuine record reservations remain
held until result disposal, and actual-byte verification and pure final source
fences remain separate. Disposal clears all callbacks without closing sources or
their writer leases; frozen detached metadata remains readable.

This scope is the current source's native histories and explicitly selected
stores. Historical parent files, upload bytes, provider availability, current
server authority and activation are not covered by an address report.

## Functional qualification

The [original-record checkpoint](qualification/2026-10-23-original-record-read.json)
passes thirteen selected normal candidate stages. The same 102 functional laws
pass in source, fresh offline packages and the actual production bundle, including
74 new reader laws and 28 unchanged compound-storage regressions. Both strict
type fixtures pass. The source domain covers all three selection scopes,
reviewed/search combinations, aborted and lost-acknowledgement saves, all five
paired record formats, real stored-byte changes and callback release.

The [native and retained extension](qualification/2026-10-23-original-retained-record-read.json)
passes fourteen selected normal stages. The same 487 laws pass in source, fresh
offline packages and actual bundled code, including 197 new laws and all 290 prior
record/storage laws. Four strict type fixtures pass in the fresh consumer. Native
rows cover all three languages, all three selection scopes and compatible
natural/search policies. Version/revision rows also cover reviewed ownership,
aborted and lost-acknowledgement saves. Existing participant recovery, paired
backups, retained-version and pending-work reconciliation checks pass.

The [original reference qualification](qualification/2026-10-23-original-record-references.json)
passes ten selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 901 laws: 146 new reference/disposal laws and all
755 prior original/generation record and storage laws. All six strict consumer
type fixtures pass. The new domain covers all three native languages, all three
selection scopes, original paired policies, actual independently retained rows,
both read runtimes, pending uncached versions, failed saves and lost
acknowledgements, future document/comment Undo/Redo and callback release.
The existing 362-case generation asset/recovery domain also passes. The native
runtime, stored formats, author policies and public-root defaults are unchanged.

Current original and generation states now have genuine record discovery and
native/packet reference replay. The separate
[generation reader](GENERATION_RECORD_READ.md) preserves complete atomic cuts.
The [original operational reader](ORIGINAL_OPERATIONAL_RECORD_READ.md) separately
keeps parent custody and admits its actual archive/marker under fresh permission;
its opaque child reads expose no mutable editor or producer facade.
Selected historical parent files, held coordinator integration, provider/client
reconciliation, authenticated activation and sustainable history remain required.
All thirteen V1 gates remain open.
