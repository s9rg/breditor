# Read retained participant copies without activating writers

`SharedParticipantReplay` opens a private read-only native view of an original
participant backup. `SharedRoomReplay` does this for every copy in a selected
room catalog, including multiple historical copies of one writer. These reads
expose genuine native and retained-packet image sources without opening a
database, acquiring an author lease or starting delivery.

Reading a copy is not merging it. Both APIs preserve the original native
journals, pending records and archived bytes. They grant no current server
credential, provider authority, write permission or activation transition.

## Replay one independently selected copy

```ts
import {SharedParticipantReplay} from '@breditor/collaboration';

// Reuse the original explicit recovery policy: backup, expected, session,
// declared retained stores, destinations, limits, authority and cancellation.
const reader = await SharedParticipantReplay.read(originalRecoveryOptions);
try {
  const source = reader.references();
  reader.verifyCurrent(currentParticipantCore);
  reader.check();
  // Feed source to the existing selected-byte capture with a current host resolver.
} finally {
  reader.dispose();
}
```

The existing `SharedParticipantRecoveryOptions` selects the exact native family,
factory, original history/range/selection policies, paired reviewer and declared
dependent identities. Destination names remain validated policy inputs; replay
does not inspect, create or open those destinations. Token providers, revision
transports and persistence ports are not invoked. A current author can remain
open while multiple private readers inspect its older copies.

Factories must return exclusive, unobserved and uninitialized native owners.
The SDK initializes native read-only policy once before adopting each owner.
The catalog's own staged-factory binding retains its original raw factory and
receiver. Already observed, preinitialized, foreign or incompatible native
owners refuse instead of falling back to JavaScript state or a new document.

The backup is borrowed. Keep its genuine handle and authority guard valid while
the reader is needed. Disposing the reader frees only its private native owner
and captured source. It never closes the original backup, current participant,
upload store or writer lease. Disposing the borrowed backup invalidates checks;
still dispose the reader to release its private runtime memory.

## Admit the original records through native readers

Replay requires the exact native document and, when present, review checkpoint.
It admits the paired immutable versions, saved review progress, complete version
cache, proposal queue and revision outbox through the same pure admission
functions used by live persistence. Duplicate native packet IDs, wrong local
authors, unavailable local source, inconsistent receipts and missing retained
effects refuse. Imported records keep the original allowance for an incomplete
remote historical source; complete asset verification cannot turn that Pending
source into Ready.

The existing native dependency readers collect conservative causal history and
every declared retained packet. `backup.verifySource(reader.references())`
compares the resulting complete native source and record bytes with the selected
archive; saved reference arrays alone do not pass. No fake session or queue
object stands in for record admission. Original record families and budgets are
unchanged.

`references()` returns an ordinary genuine `SharedAssetReferenceCapture`, usable
with existing selected-byte capture and inventory APIs. The capture is borrowed
from the reader. Disposing that capture invalidates the reader and its dependent
byte captures; dispose the reader when finished. Archived blobs can supply an
inspection fixture, but current provider permission and opaque-ID mappings must
be established separately for activation.

## Read every retained catalog copy

```ts
import {SharedRoomReplay} from '@breditor/collaboration';

const copies = await SharedRoomReplay.read({
  archive: retainedCatalogArchive,
  expected: trustedCatalogSelection,
  participants: allOriginalFactoryRequests,
  checkAuthority,
  signal,
});
try {
  for (const entry of copies.entries()) {
    // entry.id pins the original file, even if another file has the same writer.
    host.collectRetainedSource(entry.id, entry.backup, entry.source);
    host.showOriginalInventoryComparison(entry.originalInventory);
  }
  copies.verifyNativeContinuation('historic-copy', selectedCurrentCore);
} finally {
  copies.dispose();
}
```

Requests must name every retained participant file exactly once. Missing,
duplicate or undeclared IDs refuse before any native factory is called. Each
request supplies the original independent family and policy; metadata selects no
executable code. The selected catalog's original file ceiling bounds the read
set. The separate active-participant staging limit is not increased.

Unlike active staging, read-only replay allows duplicate writers. Every copy is
admitted separately against its original native registration inventory. An
entry's `originalInventory` describes that copy alone; it does not assert that
other registered streams or the current server are covered. Entries are ordered,
immutable borrowed handles, not detached source declarations or editable cores.

The catalog is borrowed and must remain live. Disposing it invalidates the
cohort. A failed later factory disposes the private readers already acquired,
while leaving the complete catalog, files and current participants untouched.
Disposing the cohort similarly closes no catalog, file, database or current
author. All original `unreconciledParticipants` markers remain unchanged.

## Compare native journals without discarding differences

`verifyCurrent` and `verifyNativeContinuation` use the actual native same-writer
document and paired-review journal continuity check. Matching rendered text,
ASTs or causal counters is insufficient. The current journal must retain the
original seed/join, ordered history inputs and typing partitions; genuine later
edits, peer imports and Undo/Redo are allowed. A shorter, foreign or forked
journal refuses without importing, rewriting or discarding either copy.

The current editor must be a genuine SDK owner. A lookalike object's method
cannot substitute for the canonical native comparison. Authority callbacks run
before the final native comparison; closing a source or current owner during a
callback cannot leave a successful check referring to it. These remain checks
at one instant, not a reservation over later edits or an activation barrier.

Continuity covers the native journals, not supplemental queue/cache/upload
reconciliation. A historical copy can contain extra pending proposals or
versions even when its native journal is retained. Keep all such sources until
their contents and current provider bytes are reconciled explicitly. A failed
continuity check does not authorize choosing the other copy or resetting Undo.

## Cancellation and release scope

Authority checks must synchronously return no value or throw. False results and
Promises refuse. Both APIs expose separate authority and cancellation error
codes, alongside policy, native admission, closed-source and continuity errors.
Messages do not expose host diagnostics or private journal/packet bodies.

The readers hold all admitted native copies until disposal. Large-room memory,
quota, actual browser behavior, interrupted processes and the supported operating
envelope remain unqualified. Current functional checks use real original Wasm
owners with explicit Node IndexedDB/lock/PNG fixtures; they forbid storage,
author-lease and network operations during replay, allowing only local Blob URL
decoding needed by the raster fixture.

Full recovery still requires reconciliation of current participants and all
historical/offline copies, the native current-server proof, current authenticated
provider/reference closure, protected credential custody, deployment/writer
fencing and a final activation transition. The approved cross-generation
Undo/Redo and offline-edit bridge remains required. No protocol meaning, stored
format, default, package version or dependency changes here. V1 release gates
remain open.

## Functional checkpoint

The [source-bound qualification](qualification/2026-10-19-historical-participant-replay.json)
records the 27 selected checks, real native replay matrices, before-fix failures
and fresh installed-package evidence. It qualifies these functional reads, not
global reconciliation, activation, platform reliability or V1 release approval.
