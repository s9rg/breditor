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

## Retain failed initial openings

Original and generation participant static `begin()` and `resume()`, and both
catalog factories, reserve runtime custody before acquiring their first
coordinator lease. If opening fails before returning an owner and release fails
too, custody retains the actual database, private archive/backup reader and
lease cleanup closure. A valid-policy retry of an overlapping namespace drains
that failed opening before acquiring resources. Catalog staging retains the
same cleanup obligation even when a participant factory never returned an attempt.

The private ledger is keyed by the actual storage context and selected recovery
and destination namespaces. It never closes an active opening or a successfully
returned attempt. Successful transfer removes its entry without invoking
cleanup; concurrent retries share the underlying cleanup. A failed drain refuses
new admission rather than reconstructing ownership from saved records.

At most 4,096 opening reservations may be pending per runtime/storage context.
The bound includes active and failed initial opens, is checked before acquiring
resources and does not limit document size, history length or returned owners.
A matching failed entry can drain before the capacity check. Completed opens
release their reservation immediately. This runtime bookkeeping is neither
durable recovery authority nor a substitute for cross-device authentication.

Direct factory retries still check current admission policy before reaching the
ledger. These APIs expose no cleanup-only capability for a rejected direct call.
Parent close can drain failed participant openings it owns without new restore
admission; that does not create a public direct-factory cleanup API.

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

Initial-opening regressions additionally abort coordinator creation or the
existing-attempt read, then refuse one real lease release. Five routes cover
original and generation direct recovery, both catalog versions and original
participants in V2; both begin/resume and native transports give twenty paths.
All twenty fail against the preserved unfixed public archive. Repaired source
and fresh installed consumers retain 42 committed-record snapshots and 60
original files, verify 42 absent destinations and cold-reopen twenty participants.
Eight direct cases also refuse a competing live owner and reopen the returned
owner after close. Sixteen small opening-custody laws check context isolation,
namespace overlap, bounded admission, concurrency and transfer.

Eight additional regressions cover original/V2 catalog begin/resume on both
transports. Initial creation or reading aborts, then the real coordinator lease
refuses release once. An explicit retry must drain the unreturned opening, not
rely on diagnostic teardown. They preserve four committed catalog snapshots and
32 original files, verify four absent placeholders, refuse eight competing live
opens without closing their owners, and cold-reopen eight catalogs. The same
eight assertions fail against the preserved preceding public archive and pass
in source and fresh installed packages. Returned successful catalogs never
remain registered in startup cleanup.

These checks use controlled IndexedDB, lock and raster fixtures around actual
native histories. They do not qualify browser crash durability or identify the
older unexplained intermittent room refusals or installed generation failure.
Mixed-family operational transfer, historical-copy disposition, provider/client
closure, independent comment/server generations and current authenticated
activation remain required work.
