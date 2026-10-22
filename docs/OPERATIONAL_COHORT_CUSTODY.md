# Common operational participant custody

Original and generation participants use one internal handoff barrier. A mixed
cohort must transfer every selected owner together or return none. The barrier
does not flatten generation histories, convert original journals, authenticate
accounts or activate a room.

## Reserve before calling the host

Each family validates genuine private operation identity, uniqueness, live
custody and the 1,024-owner bound synchronously. The mixed adapter validates a
single set of participant identifiers and the same combined bound. It reserves
both families before the first await or application authority callback. If the
second reservation fails, the first is abandoned without consuming any child.

## Hold every selected upload store

Each genuine reservation supplies its actual upload handles, not database names,
saved ready flags or caller-provided leases. Before verifying any participant,
the common barrier acquires exclusive current-SDK custody of all selected stores.
Original and generation stores stay held together through asynchronous source
verification, coordinator release, native-reader destruction and final checks.
A second cooperating handle cannot retry a cancelled upload or change its epoch
between the verified cut and the returned owners.

If a later acquisition is busy, earlier actual leases finish releasing before
preparation refuses. No child is consumed. Store version change, late authority
loss, failed release or a changed native source also refuses the whole cohort.
Abandonment releases every temporary upload reservation; it never settles queue
work, removes data or rolls a current store back to the original archive.

At the last synchronous barrier, all actual leases and managed owners are checked
before any upload lease is released or any child is consumed. Lease release and
private child consumption have no intervening await. Returned handles wait for
their own actual release callback before immediate mutations or reacquisition.
Public lease and final source-capture facades cannot redirect internal checks,
release or disposal.

Exact original and generation recovery `intoParts()` use the same temporary
store-custody mechanism. Ordinary mutation outside a handoff keeps its existing
meaning. Read access remains available during custody, but plain close and writes
cannot cross it. An actual version-change event can still retire the store and
invalidate the handoff. Legacy runtimes and direct IndexedDB writers require
separate host fencing; these cooperative leases are not a cross-device grant.

Verification reads actual retained files, native ancestry and managed owners.
The adapter captures every selected source and constructs its frozen return
value before releasing coordination leases. One aggregate release includes
both families and parent storage; it never releases native author custody.
Release failure consumes no child and permits retry. Successful release leaves
individual owners cleanup-only until the cohort commits or is abandoned.

## Commit after cleanup and final validation

Commit checks current policy and native ancestry, then disposes temporary
native origin readers and private archive readers. A host-supplied native
destructor can throw, revoke authority or retire another participant. It must
therefore run before the final authority, source-cut and managed-liveness
checks, never during child consumption.

Binding-only preflights run before native/source verification and again after
cleanup and current guards, before captured record readers. Genuine registrations
pin the semantic `core` and `options` bindings and source prototype, including
registered underlying version-store bindings. These preflights do not run host
or liveness callbacks ahead of the existing final managed-owner sweep. A replaced
accessor refuses without evaluation; canonical registered core reads do not use
the public property. Freezing or sealing an unchanged owner is allowed. Private
checks remain distinct from readable retired history. These guards do not form
a sandbox against replacing JavaScript intrinsics or arbitrary SDK/native methods.

After all temporary cleanup, commit checks current policy again, rechecks all
source captures and sweeps every actual managed native, dependent-store and
upload owner. Consumption then writes only private closed flags. There is no
await, application callback or native destructor between the last sweep and
consuming every family. Individual `intoParts()` and existing single-family
room adapters use this same barrier.

A late refusal returns no parts and permanently closes that capsule. Released
owners retain explicit close/discard custody and committed operation/recovery
files for cold resume. Generation owners retain their immutable original Blob
for `file()` until closed, even after temporary archive readers are disposed.
Fresh resume still requires explicit native factories and current policy.

## Required functional checks

`operation-cohort-contracts` checks phase ordering and single-use capabilities;
`operation-asset-custody-contracts` adds actual upload-store exclusion and failure
cleanup, original/generation recovered and operational handoffs, late canonical
native-source guards, mixed-family refusal and future native Undo/Redo.
`operation-asset-custody-type-fence` keeps internal multi-owner reservations out
of the public root. `installed-operation-asset-custody` repeats the same 45 native,
asset and phase laws from fresh offline archives, without workspace links.
`managed-source-binding-contracts` checks semantic descriptor identity and
zero-accessor refusal. The native binding probe covers replacement before
commit, in the final authority callback and in native-reader destruction, with
exact committed records and cold history checks in original and mixed cohorts.
`mixed-room-custody` uses genuine original and generation participants across
ten native profile/transport fixtures and local, relay and retained families.
It checks late refusals in either family, release retry, changed source cuts,
authority loss, native-destructor failures, exact committed bytes and cold
native document/review Undo/Redo. The same assertions run in fresh offline
archives under `installed-generation-room`; private installed-file imports are
explicit fixture hooks, not public adoption APIs.

Upload-retirement fixtures keep the actual SDK connection: asynchronous cases
abort an upgrader after version change so the original V1 schema remains, while
the last synchronous callback dispatches the fixture event on that actual
connection. Every earlier assertion, stored-byte comparison and cold-history
check remains required. These triggers are storage fixtures, not physical OS events.

The [selected qualification](qualification/2026-10-21-operation-asset-custody.json)
retains the exact pre-fix upload and native-guard failures, source/installed laws,
native future-history probes and the retirement-fixture assertion audit. The
earlier 323 assertion trees remain present; the changed retirement triggers do
not remove cases, counters or stored-byte comparisons. Its 101 passing stages
are a subset qualification, not platform durability or release approval.

Existing original/generation V2 operational parents use this internal barrier.
Complete independent-delivery participant adoption, historic-copy dispositions,
provider/client closure and authenticated whole-room activation still need
integration. Controlled IndexedDB, locks and
raster fixtures do not establish browser crash durability.
