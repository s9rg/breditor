# Original persistent record reads

Recovery must distinguish actual committed records from pending and unsaved
LIVE records. A failed save may leave an older row on disk; a lost acknowledgement
may leave a newer committed row than the SDK's last acknowledged state. These
private readers expose those states separately without saving or editing them.

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

## Checks and disposal

`check()` checks source bindings and lifetime around the current read-authorization
callback. `verify()` also rereads the actual committed bytes through the selected
record validator. `checkCurrent()` is the final callback-free, I/O-free fence;
run it after host callbacks before using the result. It does not replace durable
verification. Pending and acknowledged record identities are pinned independently
of the native document/comment clocks.

Read authorization does not grant writing, review acceptance, network access,
asset custody or room activation. No read acquires an author or changes native
permissions. Disposal releases the read permit or queue reservation and clears
all producer and authorization callbacks. Frozen detached metadata stays readable
after disposal; keeping it does not keep the read alive.

## Functional qualification

The [original-record checkpoint](qualification/2026-10-23-original-record-read.json)
passes thirteen selected normal candidate stages. The same 102 functional laws
pass in source, fresh offline packages and the actual production bundle, including
74 new reader laws and 28 unchanged compound-storage regressions. Both strict
type fixtures pass. The source domain covers all three selection scopes,
reviewed/search combinations, aborted and lost-acknowledgement saves, all five
paired record formats, real stored-byte changes and callback release.

Whole original reference closure still needs original unpaired native records,
version catalogs and revision outboxes. The separate
[generation record reader](GENERATION_RECORD_READ.md) covers complete atomic cuts.
Original and generation reference capture, coordinator integration,
provider/client reconciliation and authenticated activation remain required.
All thirteen V1 gates remain open.
