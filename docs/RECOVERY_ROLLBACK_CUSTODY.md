# Recovery rollback custody

A failed recovery still owns every resource it acquired. Cleanup failure must
retain the real attempt, native session and dependent stores for retry; a durable
progress marker cannot stand in for those owners. This contract applies to both
original and generation participant recovery and both room catalog versions.

## Own rollback before awaiting

The internal `RecoveryCleanupScope` registers an actual cleanup continuation
before an attempt starts restoring resources. Successful ownership transfer
removes that continuation without invoking it. A failed cleanup stays registered
until a later rollback or parent close succeeds. The scope is runtime-only and
has no public export, serialized constructor, activation method or credential.

Each entry permits only one cleanup in flight. Concurrent retries share that
work; a drain attempts all independent entries, retains failed entries and
forgets successful ones. A transfer cannot mark an in-flight cleanup complete.
New acquisitions cannot be inserted into a drain already in progress. Errors
use the owning recovery or catalog's structured failure, not raw factory text.

## Retain partial participant owners

An admitted participant attempt registers its actual native/dependent owner
group before `finish()` starts restoring components. If native restoration,
validation or the final ready marker fails, rollback discards those private
owners without deleting committed destinations. If that discard fails too, the
attempt keeps the group. Another `finish()` refuses while failed cleanup
remains; `close()` waits for in-flight work, drains the group and only then
releases coordinator leases.

Catalog staging likewise retains the real participant attempt before awaiting
its `finish()`. A later capture or verification failure retains any completed
ready owner until cleanup succeeds. The catalog can therefore close an attempt
that failed before returning a staged child. Children already returned before a
later parent-step failure use the same rollback scope. Successful staged owners
remain on the ordinary graceful-close or operational-transfer path.

Cleanup may finish during error unwinding. Once all private cleanup succeeds,
an explicit retry may reopen unchanged stores under the same selected plan.
While cleanup remains pending, the catalog refuses new staging or transfer;
close remains retryable. This is not permission to overwrite a changed plan,
reuse a retired source, or reconnect with a saved authority decision.

## Reproduced failures and native checks

The participant-internal regression aborts the final ready-marker transaction,
then refuses either the attempt's coordination release or its native-session
discard once. Each boundary runs for generation staging, original staging in
V2, and the original catalog, on both native transports: twelve paths total.
The former code lost either an attempt lease or a native owner before the parent
could retain a staged child. A parent close then failed to free the actual
resource for cold recovery.

The repaired paths compare 64 committed-record snapshots and 52 original files,
then cold-reopen all twelve participants. The earlier six parent-cleanup cases,
their exact data comparisons, and future native document/review Undo/Redo stay
mandatory. Fresh offline public-package consumers repeat the same assertions;
the preserved previous archive establishes the before-fix behavior with the
same Wasm runtime. Eight small scope laws separately check retry, concurrency
and transfer behavior.

These checks use controlled IndexedDB, lock and raster fixtures around actual
native histories. They do not qualify browser crash durability. Initial static
open failures before an attempt object is returned remain a separate rollback
audit boundary. Mixed-family operational transfer, historical-copy disposition,
provider/client closure, independent comment/server generations and current
authenticated activation remain required work.
