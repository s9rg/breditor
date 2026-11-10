# Durable mixed room recovery

`SharedRoomOperationalRecoveryV2` takes genuine inactive V2 catalog custody and
recovers selected original and generation participants together. It retains
every original file and native history, including unselected historical copies.
It neither activates a room nor obtains current account or provider authority.
The original room/catalog protocols and default startup remain unchanged.

## Begin with genuine catalog custody

Stage a `SharedRoomRecoveryCatalogV2` with explicit factories and destinations.
Pass that actual catalog, its independently selected identity and one tagged
operation target for each staged participant to `begin`. Database names must be
distinct across both parents, all child coordinators, components and operations.

```ts
const operation = await SharedRoomOperationalRecoveryV2.begin({
  database: operationDatabase,
  catalog,
  expected: selectedCatalog,
  participants: operationTargets, // {id, family, operationDatabase}
  checkAuthority: requireCurrentRecoveryAuthority,
  signal,
});
await catalog.close(); // Successful transfer consumed the old catalog.
await operation.finish();
const parts = await operation.intoParts();
```

The new parent first commits its prepared record and every catalog file in one
independent IndexedDB transaction. A reserved source cannot be staged again from
an authority callback. Actual source cuts and managed owners must still hold
after the final callbacks. Every ready guard is validated before any private
preparation pointer changes. No await, host callback or native destruction occurs
during those pointer writes and consumption of the old catalog.

Successful transfer detaches the SDK's old catalog authority/cancellation guard;
closing or aborting that old catalog cannot close the successor. Factories that
capture additional application state remain the host's responsibility. The
library does not rewrite arbitrary factory closures.

## Finish and reopen actual native work

Child intents advance in order through `reserved`, `started` and `complete`.
Prepared parents require exact original native, retained-record and upload cuts
before publishing `operational`. Cold resume reopens and verifies every actual
child; a marker cannot manufacture an owner. Unexpected data, occupied new
destinations and missing completed children refuse without an empty-document
fallback or overwrite.

An acknowledgement can fail after a durable commit. Progress reads reconcile
only the known before/pending records; retry does not reset a completed child.
After interrupted parent creation, close the still-held old catalog and explicitly
`resume` the committed parent rather than overwriting it with another `begin`.

Resume requires the original catalog database, selected identity, tagged original
factories/destinations and an explicit `currentPolicy` for every participant:
`documentReadOnly` plus `reviewAccess` (`null` without a paired review stream).
Current permission is not inferred from the archive's staged read-only policy.
This also applies when interruption left a child operation absent: finish first
publishes its original provenance privately, then reopens under the explicit
current policy before returning any participant. A failed staged-owner close
remains pending for retry; it cannot be mistaken for current admission. Immutable
observer transport restrictions still apply and cannot be elevated by this policy.
Operational parents accept verified later native continuations; prepared parents
refuse an unpublished append and leave that actual current work untouched.

`intoParts()` uses the [common cohort barrier](OPERATIONAL_COHORT_CUSTODY.md).
Every selected original/generation owner transfers together or none is returned.
Cooperative lease release failure permits retry. Once all those leases release,
the parent and children become cleanup-only if a database close or a later
check fails. Explicit close and fresh cold resume preserve the retained files. Returned
parts keep their family tags; generation history is never flattened into an
original session. Transports remain disconnected until the host explicitly acts.

## Cleanup and remaining limits

Parent and operational-participant static openings retain actual cleanup before
acquiring their first new lease. Failed component-recovery and operational
openings stay reachable through the parent's cleanup scope, including factories
that returned no owner. Cleanup failure retains every acquired namespace; a
successful earlier child or returned owner is never drained as failed startup.
`close()` saves held work; `discardAndClose()` abandons private unsaved runtime
state. Neither deletes a committed catalog, operation, source journal or upload.
Failed cleanup remains retryable through the owner or failed-opening ledger.
Direct static retries check current admission policy before draining that ledger;
a rejected call supplies no public cleanup-only handle after policy is revoked.
Actual parent/catalog database upgrades fence the operation.

The existing V2 file, participant and plan limits remain in force. The operation
retains a second durable copy of the catalog bundle; large-room storage costs
still need qualification. `unreconciledParticipants` continues to name every
unselected historical copy. No copy is implicitly merged, accepted or discarded.

Mandatory functional checks cover parser/storage/lifetime laws, closed public
types, genuine native source workflows and the same assertions in fresh offline
archives. Public errors remain sanitized. A private bounded cause chain supports
explicit test diagnostics without adding public `cause` fields or automatic
production logging; this does not by itself repair an intermittent refusal.
The original catalog transfer also reserves its source before its first host
guard. A supported reentrant stage refuses synchronously instead of starting a
second operation. This changes no saved format or original default protocol.
Controlled storage, locks and raster fixtures are not browser crash
durability. Historic-copy dispositions, independent comment/server-log generations,
complete provider/client reference closure and current authenticated whole-room
activation remain separate work. This contract is not V1 release approval.
