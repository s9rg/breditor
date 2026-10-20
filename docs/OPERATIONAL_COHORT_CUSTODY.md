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

`operation-cohort-contracts` checks phase ordering and single-use capabilities.
`mixed-room-custody` uses genuine original and generation participants across
ten native profile/transport fixtures and local, relay and retained families.
It checks late refusals in either family, release retry, changed source cuts,
authority loss, native-destructor failures, exact committed bytes and cold
native document/review Undo/Redo. The same assertions run in fresh offline
archives under `installed-generation-room`; private installed-file imports are
explicit fixture hooks, not public adoption APIs.

The shared barrier is an internal prerequisite. Durable V2 operational parent
intent, historic-copy dispositions, provider/client closure and authenticated
whole-room activation still need integration. Controlled IndexedDB, locks and
raster fixtures do not establish browser crash durability.
