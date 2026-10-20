# Durable participant recovery

`SharedParticipantRecovery` records and resumes recovery of one explicitly
selected participant across its native journal, paired review, declared retained
packet stores and raster upload database. It preserves original records and
replays them through the host-selected native factories. A durable completion
record follows verification of the actual recovered owners; it is not a room
activation or authentication grant.

## Select the file and native family

Keep the original [participant file](SHARED_PARTICIPANT_BACKUPS.md), independently
trusted selection and recovery destination names outside the attempt database.
Read the file through `readSharedParticipantBackup(file, expected)` first. Never
choose `expected` from incoming file metadata.

```ts
import {SharedParticipantRecovery} from '@breditor/collaboration';

const options = {
  database: 'recovery-alice-desktop-attempt-1',
  backup, expected,
  destinations: {
    document: 'recovered-alice-document',
    suggestions: 'recovered-alice-suggestions',
    revisions: 'recovered-alice-revisions',
    versions: 'recovered-alice-versions',
    uploads: 'recovered-alice-uploads'
  },
  session: {kind: 'paired', options: originalPairedRecoveryOptions},
  suggestions: {identity: originalSuggestionIdentity},
  revisions: {binding: originalRevisionBinding, transport: inactiveTransport},
  versions: {identity: originalVersionIdentity, getToken: currentTokenProvider},
  checkAuthority() { host.checkFencedParticipantRecovery(expected.identity); }
} as const;

const attempt = await SharedParticipantRecovery.begin(options);
try {
  const recovered = await attempt.finish();
  try {
    await host.inspectInactiveParticipant(recovered.sources, recovered.uploads);
    // Native writer leases remain held. Nothing has connected or uploaded.
  } finally {
    await recovered.close();
  }
} finally {
  await attempt.close();
}
```

`originalPairedRecoveryOptions` contains the original room, writer, language,
history, range and selection policy, review actor/account and matching native
`restore` function, without database, backup JSON or writer-recovery fields.
`reviewed-paired` uses the explicit reviewed identity and `restoreReviewed`;
`search-paired` uses `restoreSearch` and any original reviewed identity. Paired
relay/observer bindings must match the captured record exactly.

Document-only participants choose `document`, `document-selection` or
`search-document`, with their corresponding original recovery options. The
archive cannot select a factory, flatten owned/search history, upgrade an old
family or fall back to a new empty document. Declared optional producers must
match both the archive and destination list. Revision recovery requires its
proposal queue. Account identities and all included store policies are checked
before destination creation.

The public type contract also excludes an original fixed-family factory from a
document-selection handle, and the reverse. Recovery and completion constructors
require a private runtime key as well as TypeScript-private declarations;
detached lookalike objects cannot construct either handle through JavaScript.

## Reserve new inactive destinations

`begin` requires a dedicated absent attempt database and distinct absent target
database names, all within the existing 200-character database-name contracts.
Sorted cooperative Web Locks exclude another recovery using those names.
Ordinary native document/review, proposal and version leases still apply; a
different attempt cannot clone a live native writer by changing its databases.

The host must fence the original participant on other devices, reacquire current
writer/provider authority and keep these destinations inactive. Web Locks are
origin-local cooperation, not server credentials or protection against arbitrary
same-origin IndexedDB writers. Do not expose target names for ordinary startup,
editing, upload or synchronization while an attempt is incomplete.

The new version-one attempt database contains one `attempts` store and one
`attempt` record. Schema creation and its initial marker commit in the same
upgrade transaction. Existing empty, unfamiliar and newer databases are never
replaced or upgraded. An absence probe aborts initial creation instead of leaving
an observable empty target; it does not request a newer schema version. The
[IndexedDB transaction model](https://www.w3.org/TR/IndexedDB/) and
[cooperative Web Locks lifetime](https://www.w3.org/TR/web-locks/) apply.

The closed `breditor/shared-participant-recovery` record pins the independent
selection, destination mapping, explicit family, review/owned/relay and dependent
store policies, and original raster limits in a canonical plan of at most 64 KiB.
Destination key order and the three-field review policy are normalized. Equivalent
property order on resume does not select a different plan. Undeclared review
fields refuse before any marker is written, rather than being copied into it.
Native function closures, account tokens and resume credentials are not
serialized. The host supplies the matching native implementation again on
resume and remains responsible for its closures and current authority.

## Resume committed work without replacing it

After interruption, close or drop the old owner and use
`SharedParticipantRecovery.resume(options)` with the same trusted file,
selection, database names and nonsecret policies. A new current authority check
and credential provider may be supplied; a changed selected plan refuses.
Retain every committed destination and the attempt marker. Never clear a store,
manufacture completion or delete the attempt to force a retry.

Each component moves through `reserved`, `started` and `complete`. The started
marker commits before its original insert-only restore is invoked. Recovery runs
in dependency order: document, declared proposal queue, revision outbox, version
catalog and uploads. A started component may be absent or validly empty after an
interrupted native admission; it is then restored through the original factory.
If its original commit succeeded but acknowledgement failed, an exact retained
record can be adopted through ordinary native reopening instead.

Before reopening, readonly inspection requires the original version, closed
store/index shape, one exact expected record and no unrelated records. Unknown,
divergent or occupied state is not truncated or interpreted as an empty seed.
Reopening still performs original native replay and exact source checks. Raster
restoration preserves the full original file, all queue statuses, attempts,
epochs and opaque receipt code units. A valid completed empty upload store is
distinct from a missing one. Missing completed data refuses rather than being
silently regenerated.

Journal updates compare the complete prior marker in a strict-durability
IndexedDB transaction. Cancellation may arrive after a component or marker has
committed. Resume checks the retained physical state; it never assumes that a
rejected promise means nothing committed. Cancellation cannot forcibly interrupt
an uncooperative awaited host native factory. Checks repeat when it returns, and
its ownership is released only after private pending writes finish.

## Verify and transfer ownership

`progress()` reports immutable durable markers, not live completion proof. Even a
`ready` marker requires `finish()` to inspect and reopen all actual components.
The final barrier creates a genuine native/packet capture and checks it against
the selected archive together with an exact upload snapshot. It then commits
`ready`; no connection, retry, upload, account token or server action starts.
Requested revision/version auto-start is not inferred: recovery explicitly keeps
those adapters inactive.

The returned `RecoveredSharedParticipant` retains the actual native owners and
coordinator leases. `intoParts()` rechecks the exact recovered cut and completion
before releasing only coordinator bookkeeping locks; native author leases stay
with the returned ordinary owners. Do not edit that cut before transfer.
Concurrent handoff/close refuses rather than transferring ownership twice.
Failed coordinator release remains retryable and does not mark a handoff
complete before the ordinary owners have actually been returned. Explicit
discard also excludes concurrent cleanup and retains failed cleanup for retry.

The final host authority, cancellation and captured-source checks run after
awaited coordination release as well. If they fail after release, the completed
handle cannot hand off or transfer into an operation again, even after permission
returns. Explicit close/discard remains available. Close those native owners and
resume the exact recovery with fresh current authority; the acknowledged stores
and original backup are not deleted or overwritten.

`RecoveredSharedParticipant.close()` uses ordinary graceful owner saves and
preserves save failures for retry. `discardAndClose()` explicitly abandons private
unsaved state without deleting committed data. `attempt.close()` waits for an
in-flight finish to stop and clean up its private owners. Successful finish has
already transferred ownership, so closing the old attempt does not close the
returned participant. Once ordinary editing changes the recovered cut, the old
attempt must refuse to restore over that newer work.
For later edits and restart, first transfer the genuine completed handle into
[operational participant recovery](OPERATIONAL_PARTICIPANT_RECOVERY.md). Its
retained original file and native continuity checks do not relax this coordinator's
exact-source contract.

## Whole room and release boundaries

The [handoff boundary qualification](qualification/2026-10-20-original-handoff-boundaries.json)
repeats ready and operational authority/cancellation regressions across 66 actual
native families in source and fresh installed archives. Late refusals retain
exact native, pending-work and upload data for explicit cleanup and cold resume.
The selected run passes 68 checks, 1,156 script tests and 385 editor tests, with
three existing opt-in skips. A separate native database-version change during
release still reproduces a retired-source handoff; managed-source liveness
admission remains open. The authority repair does not revoke preexisting host
references or replace current server authorization.

This coordinator covers one declared participant and separate component
transactions, not an atomic transaction across all databases. The host must
prevent unrelated writes to its inactive targets. Browser/process/power-loss
durability, eviction, operating limits and other platforms require qualification
beyond the functional interrupted-commit fixtures.

Authenticated global participant/store inventory, trusted client/server recovery
selection, separately protected registration/resume credentials, complete
provider asset closure and durable room-wide activation remain work. The
[joined server recovery](SERVER_ROOM_RECOVERY.md) is a separate component.
The approved cross-generation Undo/Redo and outstanding offline-edit bridge
remains unimplemented. No original native protocol, stored family, journal/log
bound, default startup, dependency or package version changes here, and the
coordinator does not establish V1 readiness.
