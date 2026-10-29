# Actual recovery-control work owns its request slot

## Reproduced defect

The original physical, generation-current, single-prior and new complete-path
handlers retained their shared semaphore permit in the cancellable waiting
future. Native/provider work can continue in an already-started blocking worker
after that waiter is aborted. Dropping the waiter therefore released a slot too
early, even though the corresponding real work was still running.

Two deterministic tests exercise all four actual handlers. They block an actual
native provider callback, wait for its entry witness, abort the real admitted
handler waiter, then use one genuine HTTP100-continue to occupy the second slot.
A third real header-only request must receive503 while the first native callback
remains blocked. Before repair all four admitted it with100 instead. These are
actual account/Origin/body admissions and native/provider owners, not a simulated
pending flag or quota model. Exact before sources and failing logs are retained.
The tests always drain their sockets and verify actual native custody can be
reacquired before destroying originals, including the failing baseline runs.

## Ownership repair

generation_recovery/control_work.rs now moves the real OwnedSemaphorePermit and
complete actual read future into an owned blocking job, after authenticated full
body admission. That job drives the native/provider/serialization/final-current
checks to completion. Dropping or aborting its waiting future does not cancel an
already-started blocking job or release the slot it owns. All four controllers,
including original asset/accepted/original-review read routes, use this one
boundary. There is no detached scalar work ticket, saved-ready admission or new
request quota. The existing two-slot limit remains shared where it was shared.

Incomplete bodies do not enter this boundary. They still retain only the quota
permit and no native/provider owner, so dropping the actual operator controller
can release an idle native host while those bodies remain unfinished. Work that
has actually begun retains both its real owner and slot until it ends; closing
a controller refuses future/results without falsely claiming the worker drained.
No protocol, route, payload shape, authentication, Origin, original wire limit,
receipt, source file or editing/activation state is changed by the repair.

## Qualification scope

The before/after tests address cancellation of actual admitted handler waiters,
with real native provider work and real HTTP admission witnesses. They do not
infer that every browser disconnect cancels a framework handler, or claim a
hardware/crash durability result. Existing idle-body, native-worker ownership,
staleness and complete source/installed/service regressions remain required.
The historical intermittent WebKit fault is unrelated and is not declared fixed.
Fresh cold editing resume, client/provider adoption and whole-room activation
remain separate functional work. All thirteen V1 gates remain open.
