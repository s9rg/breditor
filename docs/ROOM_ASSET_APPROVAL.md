# Independent room asset approval

Room asset approval records a fresh host decision about an exact complete room
cut and its staged upload choices. It retains every byte needed to inspect that
decision later, including both losing upload inputs. It does not return editable
clients, replace an old participant baseline, reconcile historical copies, or
activate server writers.

## Independent choice and fresh decision

`PhysicalRoomAssetAdoption.approvalChoice(readOptions)` previews a deeply frozen
choice containing the complete record-cut selection and the exact ready adoption
record. The latter binds the operation/catalog identity, native checkpoints,
original upload cut, selected destination, whole reconciled base, selected union,
limits and unreconciled catalog items for every selected participant. The full
cut also pins pending saves, packet queues, versions and literal source inputs;
matching only the current document or visible image references is insufficient.

The application must retain and independently select that choice. Calling
`retainApprovedSelection(newDatabase, { ...readOptions, expected, approve })`
re-admits the genuine root, all selected sources and whole upload stores before
comparing the choice and invoking `approve`. Only an explicit `true`, including
an asynchronous `true`, accepts. Denial, an exception, a changed choice, or
revoked permission produces no successful result. The application supplies a
fresh decision hook on every call, including an immutable retry. A ready marker,
stored approval or detached report cannot supply that decision.

The preview and decision are separate operations. A changed source between them
requires another preview and another decision; the implementation never silently
updates the application's expected choice. An unselected review lane refuses
approval. Partial catalog selections remain explicitly unreconciled rather than
being promoted to a complete room.

## One complete source reservation

Approval uses a private brand-checked root composition, not a replaceable public
capture method or an incoming object that resembles a root. Every genuine parent
is synchronously reserved before factories or read grants execute. Full record
payloads and asset staging pins come from the same held reads. There is no
release/reacquire gap between reading history, choosing assets and asking for the
decision.

The selected stores retain their actual custody throughout the callback, storage
write and subsequent verification. The application cannot concurrently take the
root's editable parts, enter the stage again, or mutate cooperating selected
stores. After the decision, the stage, whole bases and selected stores are read
again. After retention, complete source records, uploads, root intent and catalog
bytes are read again before actual read/lock cleanup and final lifetime checks.
The ordinary history and handoff entry points keep their previous semantics.

A pending host dialog is cancellable. Fresh cancellation, the stage's lifetime
cancellation, stage close or root close retires the wait without requiring the
dialog to settle. Late fulfillment or rejection is observed but cannot resume
retention. Cleanup retires the actual owned reads; the late callback receives
only immutable choice data, not a source reservation.

## Complete immutable evidence

The separate `breditor/room-asset-approval` data file contains a canonical bounded
choice header, the literal complete room record cut, and every literal whole
reconciled base in participant order. Each base retains both input upload
archives, explicit choices and the selected union. The whole file has its own
distinct outside selection `{ format, formatVersion, bytes, sha256 }`. Its bound
is 1 GiB including framing; the header is bounded at 16 MiB. Existing native,
journal, packet and archive ceilings are unchanged. Oversize data refuses instead
of truncating history or dropping a losing input.

The new database has one `approval` store at schema version 1. An absent-only
upgrade transaction commits the schema, selection and literal Blob together.
Existing namespaces are never initialized, repaired or overwritten. Exact retry
compares the actual stored selection and file hash and performs no second write.
An existing different pin or byte refuses. Source, stage and selected-target
namespace aliases refuse before the decision hook or destination creation.

Actual opening custody and the root's cleanup scope retain a failed queued raw
request until it drains. Cancellation can reject promptly while cleanup remains
busy; a late upgrade must abort. Retention does not succeed until actual storage
and namespace-lease cleanup acknowledgements finish. A committed file may remain
after a lost acknowledgement or later source change causes refusal. It remains
evidence about the old exact choice, not permission for the changed source.

## Cold reads and ownership boundary

`readRetainedRoomAssetApproval(database, outsideSelection, integrityOptions)`
requires a fresh host grant and native digest. `RoomAssetApprovalArchive.read`
also admits portable files by their independent whole-file selection. Both check
closed canonical framing, exact lengths and hashes, the complete inner cut,
source/catalog identity, participant roles and every base against its retained
predecessor and selected union. Gaps, aliases, trailing bytes, missing entries and
corrupt bytes refuse.

The archive exposes immutable choice data, the record-cut file, and base files.
Disposal releases retained payload references; it provides no `intoParts` or
`activate` method. A later editable successor must re-admit original native
continuation and current policies under a common genuine ownership barrier. It
must preserve the complete cut and both losing bases while using an explicit new
baseline contract. Swapping upload stores in the old seven-family parts, or
deserializing this evidence as a writer grant, is not that implementation.

## Functional qualification

The normal candidate stages are `room-asset-approval-contracts`,
`room-asset-approval-type-fence`, `room-asset-approval` and
`installed-room-asset-approval`. They retain the cumulative complete-cut,
history/provider and asset-reconciliation laws and add independent-choice,
cancellable-decision, storage and actual seven-family native scenarios. The
installed path runs identical assertions against independent offline archives
and actual production-bundled modules. Controlled IndexedDB, locks and raster
fixtures establish functional laws, not physical crash durability or release
readiness.

The [2026-10-24 qualification](qualification/2026-10-24-room-asset-approval.json)
passes sixteen selected normal stages. Source, independent offline packages and
the actual production bundle each pass 1,554 cumulative assertions, including
the prior 1,482 laws and 72 new approval scenarios. Twenty strict consumer
fixtures pass. The four independent document/comment history pairs exercise 28
genuine native clients per path; refusal, corruption and cleanup scenarios add
24. The retained evidence includes exact source and build inputs, package
archives, public native fixtures and logs. All sixty native control ports from
the six test-owned runs are confirmed closed.

Editable selected-base succession remains the next architecture step, followed
by complete retained-copy/provider/registered-stream reconciliation,
authenticated activation and stale-writer fencing, and sustainable native history
with outstanding offline edits across generations. All thirteen V1 gates remain
open.
