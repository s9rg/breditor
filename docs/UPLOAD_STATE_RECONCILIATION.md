# Reconcile retained image uploads

Whole-upload reconciliation retains the complete original and current asset
archives before changing the target store. Current-only images, unreferenced
images and bytes used only by history remain retained. Different upload states
require an explicit choice for each image; a larger epoch or retry counter does
not make one copy authoritative.

## Prepare with the original native replay

```ts
const replay = await SharedParticipantReplay.read(originalRecoveryOptions);
let attempt;
try {
  attempt = await replay.beginUploadReconciliation(currentCore, uploads, {
    database: 'alice-upload-reconciliation-1',
  });
  const preview = attempt.preview();
  const choices = await host.chooseUploadStates(preview.conflicts);
  // Exactly one {asset, keep: 'current' | 'original'} for every conflict.
  await attempt.commit(choices);
  host.refreshAssetState();
} finally {
  await attempt?.close();
  replay.dispose();
}
```

The replay supplies its private, admitted original whole-upload file. Actual
current native document and review continuity are checked throughout preparation
and commit. Resume additionally compares the attempt's original file with that
exact replay file. A detached selection or lookalike reader cannot supply it.

The target asset store is explicitly selected by the host. These methods do not
prove that an arbitrary supplied store belongs to an operational room participant.
The room coordinator must still verify that binding before global completion.

Use a dedicated attempt database, distinct from the target asset database.
Preparation validates both complete raster archives and the original closed
asset schema. It then adds both exact files and a `prepared` record atomically.
An occupied destination refuses; it is not overwritten. A failed initial
transaction may leave an empty attempt schema, which a new begin can initialize
without replacing data.

## Choose upload state without discarding either copy

Preview contains frozen metadata, not mutable image buffers. Same-ID images must
have identical payload, MIME, dimensions and byte length. Immutable differences
refuse even if the host supplies a choice. Identical records need no choice;
every different status, epoch, attempt count, failure or receipt needs exactly
one explicit `current` or `original` choice. Missing, duplicate and unrelated
choices refuse.

The chosen copy contributes its exact queue metadata. Restoring an older counter
is an explicit recovery decision, not an ordinary retry or a last-writer-wins
merge. Both complete pre-reconciliation files remain in the attempt, including
the losing state. Stored receipts are opaque host data, not fresh provider
authentication or proof that a remote image is currently available.

Preview does not reserve the store while a person reviews choices. If the target
changes in the meantime, commit refuses instead of overwriting those changes.
Begin a new dedicated attempt from the latest target and the retained original
file, then review its current conflicts. Keep the earlier attempt and files.

## Commit and resume interrupted work

Commit first persists the complete canonical choice set as `decided`. That set
cannot be changed within the attempt. The target asset records and byte counter
are then compared and updated in one transaction. No asset is deleted. Only an
exact original target or an already-applied exact result is admitted. Finally,
the attempt records `applied`.

A rejected Promise does not prove that a transaction aborted. Resume reads the
actual record and both actual files, rechecks their hashes and raster admission,
and repeats the exact choices:

```ts
const attempt = await replay.resumeUploadReconciliation(currentCore, uploads, {
  database: 'alice-upload-reconciliation-1',
});
try {
  await attempt.commit(previouslyConfirmedChoices);
} finally {
  await attempt.close();
}
```

An aborted target transaction leaves the old target intact. If target commit
succeeded before acknowledgement was lost, retry recognizes the exact result
without another asset write. Lost initial, decision and final-marker
acknowledgements likewise use actual durable state. Missing or changed files,
schemas, target records or decisions refuse without repair. An `applied` marker
cannot authorize recreating assets that subsequently disappeared.

`progress()` describes past durable phases; it is not current source or provider
authority. `file('current')` and `file('original')` export the retained files while
the handle is open, even after a borrowed native source becomes unusable.
`close()` releases only this attempt's lease, connection and large memory buffers.
It deletes no stored file and closes no borrowed native editor or asset store.

## Coordinate active work

Preparation and commit require Web Locks and acquire the same target lock used
by uploads. Local active writes or uploads refuse rather than being silently stopped.
An operation reserves its local store before asynchronous work; ingest, remote
cache insertion, cancel, retry, flush, close and a second reconciliation refuse
while it owns the store. Other owners' ordinary metadata writes may run before
or after the target transaction; the compare prevents overwriting a changed
snapshot, not a room-wide pause. Read-only diagnostics remain available. Version changes
still close and invalidate storage rather than being blocked by that reservation.

The operation starts no upload and emits no upload-state observer callbacks.
Refresh host views explicitly after commit. A retained pending state starts
network work only when the host later calls the ordinary upload API with a
provider. That provider still must be idempotent by asset ID. Web Locks coordinate
cooperating same-origin owners, not other devices or code that ignores the lock.

## Preserve existing bounds and recovery requirements

The target's existing limits can only tighten the defaults. Its 100 MiB maximum
payload and the existing 16 MiB archive-header ceiling are unchanged. An
oversized union refuses without eviction or a larger old-store limit. The new
attempt stores two separately bounded original-format files plus a bounded
choice record; it does not change the old asset database or archive format.

This is a local image-storage transition, not a native journal merge or a
cross-database whole-room transaction. Historical-copy markers stay pending.
Current server/provider closure, protected credentials, writer fencing and a
durable final activation barrier remain required. So does the approved
cross-generation Undo/Redo and outstanding offline-edit bridge. V1 is not ready.

## Functional checkpoint

The [source-bound qualification](qualification/2026-10-19-upload-state-reconciliation.json)
records transaction/interruption contracts, original native replay families,
fresh installed packages, and the live assets/comments/version workflow. It
qualifies this local recovery transition, not whole-room activation or V1 approval.
