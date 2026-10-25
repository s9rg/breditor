# Operational read cleanup

Operational reads reserve actual native parents and source records. Retiring a
read immediately forbids further use, but does not mean that its resources have
been released. A failed cleanup must keep its real callbacks and child handles
so a later attempt can finish without making the parent writable early.

## Retirement and actual disposal

Calling `dispose` retires the reader synchronously. If a check, verification or
child factory is already running, disposal is callback-safe and returns without
unlocking the parent. The in-flight operation observes retirement, rejects its
result and drains cleanup after its asynchronous work has settled. Throwing from
that retirement callback could strand a native reader allocated inside a factory
before the factory returns it.

Once no operation is pending, actual cleanup closes every child before releasing
the parent. A child-release failure prevents parent release. Failed children and
release callbacks remain retained; successful callbacks are forgotten only after
they return successfully. Repeated disposal retries the retained operations.
Reentrant disposal does not start another release or forget the outer attempt.

Failure is tracked separately from the thrown value. A thrown `undefined`,
`null`, `false`, zero or empty string still means cleanup failed. Automatic
cleanup makes one attempt, reports failure and leaves retry to a subsequent call;
it never silently converts a failure into success by immediately trying again.
Internal cleanup calls the captured canonical disposal operations, rather than
letting a late prototype replacement substitute a no-op for real release.

## Reads that fail before publication

Original and generation operational owners register a private cleanup ticket
before opening a held read. If opening succeeds and transfers custody to the
returned reader, that ticket is forgotten. If opening fails, the owner retains
the actual unfinished cleanup closure even though no reader reached the caller.

Subsequent normal asynchronous owner entry points first retry settled failed
opening cleanup. Only a failed-opening marker permits this drain: an unrelated
valid active reader is never closed simply because its ticket is present. Fresh
authority, native state, storage and custody checks still follow the retry.
This allows a failed unpublished read to release its real gates without granting
new permission or silently abandoning accepted work.

Composite history reads release their capture before their parent. A capture
failure does not run parent disposal in a `finally` block; the parent remains
held until the capture's real cleanup succeeds. Explicit terminal discard still
has its own meaning and is never inferred from a read failure.

## Fresh readers for five client families

Independent local and delivery, restored graph, snapshot-local and flat-local
parents also retain a native capture when publication fails after opening. The
fresh reservation owns that unpublished cleanup before it can release its parent.
A failed release remains attached for explicit retry; no result has to reach the
caller for the parent to keep custody.

Fresh close retires reads immediately and returns safely from callbacks during
opening or verification. It waits for that work to settle before actual cleanup.
Checks reject retirement even in the last child callback. Automatic cleanup uses
the captured canonical close, makes one attempt, and retains a failure for retry.
Successful close releases the factories and permission callbacks as before.

## Data and authority boundaries

Cleanup changes resource custody, not durable recovery content. It starts no
save, upload, queue settlement or provider activation, and renews no writer grant.
Detached metadata remains inspectable after retirement but cannot authorize a
new read. Cleanup cannot reconstruct already disposed unsaved native memory.
The laws cover genuine native readers and controlled store faults; physical
crash durability remains a separate release requirement.
