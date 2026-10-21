# Owned core lifetime and writer cleanup

Persistence sessions own the native core and writer leases acquired by their
checked factories. Applications borrow `session.core` for editing and reads;
they should close the session, not dispose that borrowed core independently.
Explicit session discard must nevertheless release its resources if the core
has already been disposed. Committed native histories must remain unchanged and
an in-flight storage operation must settle before writer ownership is released.

This contract applies to original, paired, document-generation, independent
document/comment, relay and retained sessions. It does not change native journal,
archive, transport, permission or activation formats.

## Keep retirement and disposal terminal

`SharedRichEditor.retire()` permanently stops authoring and remote admission.
Native reads remain available until disposal, so a failed final save can still
be backed up and retried. Retirement is not a temporary read-only setting and
does not unlock or promote an observer.

`dispose()` destroys the native owner and rejects queued, unadmitted remote
frames. It is idempotent. Repeating retirement after disposal is also a terminal
no-op: it cannot free the owner twice, publish, revive editing or make a native
read succeed. A held remote frame is not a document mutation; its producer can
redeliver the same bytes to a recovered native owner for ordinary idempotent
admission.

## Distinguish final save from explicit abandonment

Use `await session.close()` for a normal final save. The actual owner is retired
synchronously and its latest complete native cut must save successfully before
the session releases its leases. A failed final save keeps the readable owner
and leases for backup/retry; it does not authorize a second writer.

If application code has already disposed the core, `close()` cannot honestly
capture that native state. It rejects instead of reconstructing a document from
UI revision numbers, an empty AST or the last saved head. Destroyed, unsaved
native memory is not recoverable through this cleanup API.

`await session.discardAndClose()` is the explicit decision to abandon unsaved
memory. It disposes only the originally owned core, stops dependent adapters and
releases the actual leases after outstanding storage work settles. Repeating
discard or calling close afterward waits for the same release, not a fabricated
closed status. Prior committed records, immutable generation files, local version
packets and upload stores are not deleted or rewritten by discard.

## Use actual owners during cleanup

Session implementations capture canonical terminal methods internally and retain
their constructor-owned core. Replacing public `retire`/`dispose` methods or
shadowing a session's `core` with a foreign value/getter does not redirect cleanup.
Those replacement callbacks are not used to identify or dispose the real owner.
The terminal helpers are not package-root exports or borrowed recovery-reader
capabilities.

Paired save status retains the SDK's last observed document and review clocks
after native disposal. The clocks are detached metadata, not a checkpoint,
current native observation, proof of persistence, live custody or a permission
grant. Changing returned status cannot change those retained clocks. Native
checkpoint/reference reads and genuine source capture still reject a disposed
core. Existing managed-core checks remain separate and continue to reject
retired/disposed writers.

## Finish storage work before releasing leases

Closing a database does not cancel an already started transaction. Explicit
discard therefore waits for the existing drain promise and its commit/abort
acknowledgement before releasing the document or comment writer. A new database
name cannot clone that live writer during the wait. After release, cold opening
uses the actual committed cut: the new cut after a successful transaction, or
the previous cut after an abort. No failed write is silently recreated.

Versionchange handling still retires the real core and closes its database if
the native core was disposed earlier. An upgrade does not acquire the old
writer leases or migrate/repair its records. Explicit discard remains necessary
to release the old session's ownership.

## Reproduce the lifecycle laws with actual native histories

Source and fresh offline installed consumers use the normal Rust/Wasm runtime
across five grammar/inline profiles, three selection/range scopes, separate
explicit and typing/search/reviewed policies, and ten persistence families.
Each repeats 300 disposal/cleanup cases, 300 exact cold pairs, 900 future native
document/comment Undo/Redo comparisons, and 600 durable-cut comparisons after
offline peer input. Retained sessions include 30 actual co-owned version-catalog
owners; cleanup never authenticates or starts a connection.

The focused laws cover all ten families, complete/aborted transactions, actual
commit/abort acknowledgement barriers, versionchange after disposal, public
method/prototype and foreign-core replacement, detached clocks, one native free,
and queued-frame rejection/redelivery. Barriers observe the actual transaction's
terminal event before withholding its owner callback; sleeps or guessed worker
scheduling do not establish the ownership precondition.

The [qualification record](qualification/2026-10-21-owned-core-lifetime.json)
retains the exact final regression failing against the old installed archive
with `disposed`, then passing against source and fresh public packages. All 29
selected checks pass across four batches with one unchanged source fingerprint;
the script suite passes 1,670 tests with three existing skips. This is a selected
subset of the 229-check functional plan.

These are functional native/client lifecycle checks over synthetic IndexedDB and
Web Locks, not physical browser/OS lock, crash durability, public authentication
or whole-room activation qualification. Independent relay/outbox integration,
current-client authorization, durable room coordination and activation fencing
remain architectural work. The native 1,000-item Undo and bounded-resource
contracts also remain unchanged. All 13 V1 gates remain open.
