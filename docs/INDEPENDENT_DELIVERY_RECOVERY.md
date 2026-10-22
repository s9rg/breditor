# Independent delivery recovery and upload custody

`SharedIndependentDeliveryParticipantRecovery` restores a complete delivery
participant and its whole upload store through a durable, resumable attempt.
Both native histories, local versions, relay receipts, retained review/version
work and original raster/upload bytes remain selected together. The first
handoff is read-only in both native lanes. A stored ready marker grants neither
native ownership nor server access.

This coordinator uses the existing
[complete participant archive](INDEPENDENT_DELIVERY_PARTICIPANT.md). Its separate
attempt schema does not reinterpret original, generation or local-only recovery
families. Original native, wire, asset and archive formats remain unchanged.

## Explicit host selection

`begin` requires the genuine backup, its independently selected identity/hash,
three distinct database names, current synchronous `checkAuthority`, and explicit
native factories. `session` excludes `database` and `create`: recovery never
silently seeds a new document. It requires `readOnly: true` and comment access
`read_only`. Historical bindings, retained-store selections and both history
families must match the selected archive exactly.

Current factories, authority, limits and cancellation are captured before
asynchronous work. They are not restored from a file. Credentials and provider
grants are not added to recovery identity. The host must independently fence old
writers; local Web Locks are cooperative origin-wide exclusion, not cross-device
authentication. Native and asset failures retain their existing structured
errors rather than being relabeled as one coordinator error.

## Durable attempt and interrupted commits

The attempt uses version-one `delivery_attempts` and `delivery_originals` stores.
One upgrade transaction inserts the exact original Blob and the initial closed
attempt record. It never upgrades an existing database. The plan pins the selected
archive and exact source/upload destinations, not current permissions or a native
factory inferred from stored content.

The source moves from reserved to started to complete, followed by the uploads.
Only then may the attempt move from preparing to ready. Every update is an exact,
single-step compare-and-update. Original bytes are rechecked at public boundaries.
The source and uploads commit in their own transactions; this is coordinated
recovery, not an atomic transaction spanning multiple IndexedDB databases.

`resume` opens only the selected existing attempt and reads its retained original.
After a commit-before-acknowledgement failure, actual storage must equal the
previous record or the exact pending update. A live retry can adopt its own
committed update. It cannot adopt an unrelated later marker. Unknown fields,
schemas, extra records, altered plans and changed original bytes refuse.

## Actual component admission

Before any autosaving source open, recovery inspects the whole dedicated delivery
schema. It requires the exact head, complete native file count, and every original
document/comment file keyed by lane and generation. Receipts and all selected
retained records are part of the same exact head. A foreign or changed destination
is never overwritten. A started empty component can be restored; a component
already marked complete cannot have missing bytes silently reconstructed.

The genuine `SharedIndependentDeliverySession` then cold-replays both native
histories under current read-only policy. Native packet and receipt admission,
complete source/reference checks and exact whole-upload verification precede
`RecoveredSharedIndependentDeliveryParticipant`. Metadata, final AST equality,
revision counters and hashes alone cannot substitute for this replay.

`progress()` reports durable attempt markers only. `finish()` always inspects and
reopens the actual components, even when the marker already says ready. Concurrent
calls on one attempt share the same in-flight finish; other attempts cannot take
its selected names while the actual leases remain held.

## Upload custody through the final handoff

The coordinator holds a genuine `RichAssetStoreCustody` after opening/restoring
the upload destination. It retains this lease through asynchronous native and
archive checks, coordinator-lock release and the final synchronous handoff.
Complete upload bytes, pending/failed/cancelled state and epochs cannot be changed
by another cooperating current-SDK handle during that interval.

`RichAssetStore.acquireRecoveryCustody()` requires the real Web Locks host and
settled tasks on that handle. Ordinary mutations, empty-destination restore and
uploads share the dedicated asset-custody lock lane. Recovery takes it exclusively.
Mutations fail with `asset_custody_busy` while it is held; reads remain available.
The selected owner cannot close until its custody is released. Reconciliation
also takes exclusive custody for each actual snapshot/apply operation and keeps
its existing busy-error meaning.

Uploads retain their separate existing uploader lock. Cancel and Retry can still
share the mutation lane with an ordinary upload; epochs prevent late provider
receipts from resurrecting cancelled work. No upload starts when custody is
acquired. Legacy ordinary asset writes without Web Locks remain usable but cannot
issue an exclusive custody lease. Old runtimes or direct IndexedDB writes do not
honor this cooperative protocol and must be fenced separately by the host.

`intoParts()` verifies the retained original, actual native/source owners and the
whole upload file. After all asynchronous work, it checks current authority and
the unchanged native capture while upload custody is still held. Its final
synchronous barrier releases that custody and returns the genuine read-only
source plus upload store. No public facade replacement or serialized marker can
issue the held lease or redirect canonical verification.

## Failure and resource lifetime

Cancellation, version change, unknown commit outcome and revoked authority do not
delete original files or committed destinations. The original Blob remains readable
through `file()` on an unconsumed handle until explicit close, including after a
refused late handoff.
Close waits for actual in-flight native work before releasing ownership. Failed
cleanup retains real private cleanup closures for retry; an unreturned opening is
drained only in its original storage context and namespace.

Ready-owner close first settles/closes its native owner, then waits for the actual
asset-custody callback to finish, closes the upload handle and releases remaining
coordinator leases. Explicit discard abandons unsaved runtime work without deleting
committed data. Neither cleanup nor resumption settles pending upload or review
work by inference.

Internal lease close, version-change retirement and failed-open cleanup use private
or module-initialized operations. Replacing the public `release()` facade cannot
stall internal cleanup or leave its actual exclusive lock held.
The returned upload handle waits for its own actual release callback before an
immediate mutation, reconciliation, upload or reacquisition; this is not a saved
permission flag or a bypass for another handle.
This follows the Web Locks draft's distinction between the callback's waiting
promise and the request's released promise: resuming writes waits for the latter.
See the [Web Locks lifecycle](https://w3c.github.io/web-locks/#locks).

## Operational continuation and remaining room integration

This attempt proves exact recovery of its selected original. It is not durable
operational-descendant intent. After application code legitimately edits the
returned source or upload state, exact recovery must refuse a changed destination
rather than overwrite it with the old archive. A later operation owner must retain
the immutable origin and verify real native continuation, retained work and upload
state under fresh policy.

The private [native origin admission](INDEPENDENT_OPERATION_NATIVE_ORIGIN.md)
now verifies both native ancestry lanes and retained local versions before
autosave, including guarded transaction callbacks and readable recovery after
authority loss. The separate [save journal](INDEPENDENT_OPERATION_JOURNAL.md) now
retains current/pending cuts on the actual source path and preserves legitimate
outbox cancellation/forgetting. Neither is the complete operational participant:
genuine recovery transfer, continued upload ownership and portable operational
export still need integration.

Original/generation operation and mixed-room handoffs now use temporary
[whole-store asset custody](OPERATIONAL_COHORT_CUSTODY.md#hold-every-selected-upload-store).
They still do not adopt this complete independent participant or establish its
durable operational origin. That integration, explicit historical-copy dispositions, complete provider/client
reconciliation, independent server-log generations and fresh authenticated room
activation remain architectural work. This local recovery cannot waive those
requirements or any of the thirteen V1 gates.

Existing native/archive/store bounds still apply, including the 1,000-input client
Undo ceiling. Whole bounded Blobs are hashed rather than streamed; this contract
does not establish quota, latency or memory qualification. Recovery files retain
deleted text and original upload metadata and must be kept private.

## Verification checkpoint

The [selected qualification](qualification/2026-10-21-independent-delivery-recovery.json)
passes 61 stages and 1,897 script tests, with three existing opt-in skips.
Source and fresh offline packages each pass 99 focused laws and 256 recovery cuts,
including 512 handoffs, exact whole-upload/original-file comparisons and 1,024
read-only refusals. Fourteen installed reports pin matching package archives.
Preserved pre-fix packages reproduce the upload race and all three final
cleanup/recipient-lifetime laws. The superseded interrupted qualification is
retained separately, not promoted as a pass.

The complete native-suite evidence is carried only across unchanged native
inputs and runtime bytes; it was not freshly reexecuted in this SDK checkpoint.
This is a subset of the 247-check functional plan, not platform crash durability,
operational continuation, whole-room activation, feature parity or V1 approval.
