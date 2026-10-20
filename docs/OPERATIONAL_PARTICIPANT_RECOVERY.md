# Operational participant recovery

`OperationalSharedParticipant` retains an original participant backup and records
the transition from exact recovery to ordinary editing. It can reopen later
native document/comment history, current retained packet stores and complete
upload queues without restoring the old cut over newer work. This establishes
local storage continuity, not room activation or current account authority.

## Transfer completed native custody

```ts
import {OperationalSharedParticipant} from '@breditor/collaboration';

// `recovered` is the genuine result of SharedParticipantRecovery.finish().
// Retain `expected` independently from the file and keep targets inactive.
const operational = await OperationalSharedParticipant.begin({
  database: 'alice-operation-1',
  recovered,
  expected,
  checkAuthority() { host.checkFencedParticipantRecovery(expected.identity); }
});

await operational.check();
const parts = await operational.intoParts();
// Only coordination is released. Native author leases remain with these owners.
// Mount/use parts only after current host permission and activation checks.
```

Begin requires the exact completed source cut. Do not edit it before handoff.
The existing recovery handle is busy during admission and becomes closed only
after custody transfers successfully. Native owners and all existing coordinator
leases stay held; no release-and-reacquire window clones an author. Closing the
old handle after success does not close the transferred owners.

The operation database name must be new, dedicated and distinct from the original
recovery and component databases. Its `operation` and `origin` stores atomically
retain one prepared marker and the complete admitted participant Blob. The marker
pins the original recovery database and canonical plan, including the independent
selection, original factory family, destinations, dependent identities and limits.
The original 64 KiB plan ceiling and 200-character database-name contracts apply.
Functions, tokens and resume credentials are not serialized.

Begin admits its own copy of the original file and private read-only native
origin. The caller may dispose the borrowed backup after successful transfer.
The `operational` marker commits with strict compare-and-update before owners can
be returned for ordinary editing. Original ready markers, journals, packet files
and the backup are not rewritten or deleted by that publication. A persisted
marker is not a substitute for actual native admission.

## Reopen later edits with fresh policy

```ts
const operational = await OperationalSharedParticipant.resume({
  ...originalRecoveryOptionsWithoutBackup,
  database: 'alice-operation-1',
  recoveryDatabase: originalRecoveryDatabase,
  expected,
  currentPolicy: {
    documentReadOnly: true,
    reviewAccess: 'read_only' // null for document-only participants
  },
  checkAuthority() { host.checkFencedParticipantRecovery(expected.identity); }
});

const parts = await operational.intoParts();
```

Supply the original destinations, session family, historical plan options and
dependent identities again. The saved file cannot select a native factory or
infer omitted stores. The source review options still identify the original
plan; `currentPolicy` separately supplies fresh document and review permissions.
Document-only participants require `reviewAccess: null`. Permanent metadata
observers cannot become authors. Current policy is never inferred from saved
roles, events or the operation marker.

Factories must return exclusive, unobserved, uninitialized raw native owners.
The SDK applies initial document read-only policy before adoption and fresh
paired review access when restoring its review lane. It preserves the factory's
options receiver. Original document, document-selection, search-document, paired,
reviewed-paired and search-paired factories remain separate; there is no empty
document, AST import or older-runtime fallback.

An SDK-owned catalog staging adapter retains an internal raw-factory binding.
Operational admission uses that binding for each new exclusive native replay,
preserving the snapshot receiver and applying the newly selected initial policy
exactly once. Caller wrappers have no such bypass: they must still return an
uninitialized, unobserved owner. Resolving the internal adapter grants no current
authority and does not transfer the parent catalog's custody.

Reopen requires every original completed database and ready record. It never
initializes a missing component or upgrades a foreign schema. Current native
replay must exactly match the stored checkpoint before its first autosave, and
[native continuity](NATIVE_RECOVERY_ORIGIN.md) must retain the original document
entry prefix and all original review events. Later genuine edits, peer imports,
selection changes and selective Undo/Redo may extend that history. A valid fork
or a callback returning an older checkpoint refuses without overwriting storage.

Suggestion queues, revision outboxes and version catalogs require the original
closed one-key schema and matching current record family. Their actual packets
are admitted against the reopened native owner before their initial save. Local
intent/status changes and new retained packets remain current; the original file
keeps the original inputs even after explicit ordinary cache eviction. This is
not evidence that every historical intent has been reconciled or that a saved
receipt has current server authority.

Whole upload storage is re-admitted through `RichAssetStore.openRetained`, which
creates nothing, validates every raster and preserves cancellation/receipt state.
Every original image must remain with the same immutable metadata; epochs and
attempts cannot roll back. An originally uploaded image keeps its exact opaque
receipt. New valid images and ordinary status transitions are allowed. No upload,
proposal retry, version connection or account-token request starts automatically.

## Resume interrupted publication

An aborted initial transaction leaves no operation database. An acknowledged or
unacknowledged prepared commit retains both the original file and marker. Resume
can publish that prepared intent only when actual native, packet and upload
components still exactly match the original cut. Later appends under an
unpublished intent refuse and remain available for explicit host recovery.

If the operational commit succeeded before cancellation or acknowledgement loss,
resume uses actual current native continuity instead of restoring the old file.
The caller must close any still-held old owner first. A rejected promise does not
mean the transaction failed to commit, and deleting the marker is not a retry.

Version-change fences begin before asynchronous record reads and remain active
through native adoption. An upgrade during a host factory await frees the
unpublished owner and refuses the open; it does not save over the newer database.
Cooperative Web Locks exclude competing origin-local custody. The host still
fences other devices and prevents unrelated writes to inactive targets.

## Release and close safely

`origin()` returns the original immutable selection. `progress()` reports the
durable phase only; `check()` and `intoParts()` recheck actual held owners,
retained source and original completion. Constructors and detached phase objects
cannot manufacture native custody.

`intoParts()` releases coordination only after verification. A release failure
keeps the handle retryable and leaves native ownership held. `close()` gracefully
saves ordinary owners before release; failed saves remain retryable.
`discardAndClose()` explicitly abandons private unsaved state but deletes no
committed record or file. Concurrent transfer, inspection and cleanup refuse.
After transfer, the caller closes revisions, suggestions and versions before the
session and upload owner, using their ordinary close contracts.

Authority and cancellation are checked again after awaited release, before
ordinary owners are returned. A captured source check also spans that interval.
If this final admission fails after coordination was released, the handle permits
cleanup only: regaining authority does not make another handoff on it valid.
Use `close()` or `discardAndClose()`, then resume the retained operation with
fresh authority and policy. The committed original and current stores remain;
this failure does not restore over or delete them. Cancellation raised inside a
synchronous authority callback is checked before that callback can admit work.

The original `SharedParticipantRecovery` remains an exact-cut coordinator and
must not be reused against edited operational storage. A parent room catalog
keeps its participants private until [operational room recovery](OPERATIONAL_ROOM_RECOVERY.md)
consumes genuine catalog custody through its durable attempt. This per-participant
API does not bypass that parent ownership or grant activation.

## Release boundaries

The [checkpoint qualification](qualification/2026-10-19-operational-participant-recovery.json)
records the selected functional checks and their exact source and runtime hashes.

The later [handoff boundary qualification](qualification/2026-10-20-original-handoff-boundaries.json)
passes 68 selected checks, 1,156 script tests and 385 editor tests, with three
existing opt-in skips. Across all 66 native families, ready and operational
handoffs refuse authority loss and cancellation after actual coordination
release. Four additional cases cancel inside the authority callback. These
regressions cold-resume 268 retained participants and compare 536 future document
and 244 future review checkpoints against independent native references. Fresh
installed archives repeat the same assertions.

This repairs authority and cancellation admission, not every managed-custody
boundary. A separate reproduced fault remains open: changing the native source
database version during release can still return a readable but retired owner
that refuses editing. Its saved reproduction is included in the qualification.
Existing host references and server or cross-device authorization are not fenced
by this local handoff repair.

Functional probes cover all 66 original native configurations, 198 current-state
reopens, fresh read-only policy, peer edits, saved Redo, new pending proposals and
versions, and 156 retained old/new upload records across those cases. Interrupted
publication, missing stores, native forks, real IndexedDB upgrade events, mutable
policy snapshots, release failures and reentrancy have explicit regressions.
The installed consumer repeats public workflows through fresh offline archives
and builds/imports the actual production API module without workspace, React or
synthetic storage dependencies.

The IndexedDB, lock and raster harnesses are explicit Node fixtures. Browser,
process/power-loss durability, quota/eviction and operating-envelope performance
remain qualification work. Reopen uses bounded whole files and native journals;
it is not streaming compaction. Original archives remain required indefinitely.

Reconciliation of every retained historical copy,
protected original credentials, current authenticated server/account/writer
fences and complete provider reference closure remain necessary for activation.
Cross-generation Undo/Redo and outstanding offline-edit preservation remain
required; no history reset or increased native bound replaces that bridge.
Existing protocols, checkpoint meanings, defaults, dependencies and versions are
unchanged. All 13 V1 gates remain open; the historical WebKit fault is not
confirmed fixed, and physical IME/VoiceOver qualification remains deferred.
