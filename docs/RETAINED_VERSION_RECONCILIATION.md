# Recover retained versions into a current offline cache

`SharedDocumentVersions.recoverRetainedVersions` retains a historical copy's
immutable version packets in the current cache without replacing current-only
packets, native document history or review history. It accepts a genuine
[`SharedParticipantReplay`](HISTORICAL_PARTICIPANT_REPLAY.md), checks the original
against the actual current native journals, and admits both cache records using
the existing native packet and source validators.

This is an explicit local recovery operation. It starts no connection, asks for
no account token and grants no publication or room activation authority.

## Disconnect and wait for outstanding delivery

```ts
import {SharedParticipantReplay} from '@breditor/collaboration';

const replay = await SharedParticipantReplay.read(originalRecoveryOptions);
try {
  versions.disconnect();
  await versions.waitForDisconnected();
  const result = await versions.recoverRetainedVersions(replay);
  host.showRetainedVersionCounts(result);
} finally {
  replay.dispose();
}
```

`disconnect()` stops delivery but does not pretend that an already pending
request, token callback or native receive has finished. `waitForDisconnected()`
waits for that work and refuses if a newer connection epoch replaces the one
being awaited. It starts no work itself. Recovery then reserves the fully idle
offline adapter until the local save settles. Concurrent reconnect, mutation,
retry, close or second recovery attempts refuse with `version_recovery_in_use`.
It never disconnects another active operation implicitly.

The host must independently select and trust the original backup and matching
native factory. The replay must declare a version cache with the target's exact
endpoint, room, binding, principal, writer and original transport. A detached
record, a JavaScript lookalike, an absent version source, a disposed source or
a foreign/forked/shorter current native owner cannot substitute for those checks.
Replay-source admission errors do not echo host diagnostics or packet bodies.
Storage errors retain the existing save and retry semantics.

## Retain packets and refuse conflicting choices

The merge keeps current packet order, then appends missing original packets in
their original order. An overlapping native ID requires exactly the same packet
bytes. Native local-author and source checks still apply; imported packets keep
their existing remote-source rules. Compatible full catalogs must be exact
immutable prefixes. The newer compatible catalog and original accepted receipts
are retained, and a known acceptance stops its older publication retry.

Different receipts for one version, different versions at one accepted server
sequence, changed packet bytes or forked catalog prefixes refuse with
`version_recovery_conflict`. No partly merged cache is published to storage.

Two unaccepted copies may disagree about retrying a publication. Their records
contain no ordering that proves which local choice superseded the other.
Recovery refuses with `version_recovery_intent_conflict`, preserving both
original files and the unchanged target. It neither resurrects a stopped retry
nor silently discards a pending one. Explicit conflict resolution remains work
for the broader reconciliation workflow.

All original closed record formats and bounds remain in force: 32 retained cache
packets, 32 MiB of encoded cache data and 4 MiB per packet. A union exceeding a
bound refuses as a whole; no packet is evicted and no limit is raised.

## Admission and save failures

Source authority and actual native continuity are checked before admission.
After admission, the operation owns a copied cache record. Disposing or cancelling
the source cannot roll back that already admitted data or an in-progress local
save. Normally keep the replay alive until the returned Promise settles.

The existing storage order remains unchanged: save the authoritative native
journals first, then commit the complete dependent cache in one transaction.
The operation does not author a document or review edit. A transaction abort
retains the old durable cache and the full merged in-memory export. A commit
followed by an acknowledgement/source-port failure retains the committed union.
`exportRecovery()` and `exportBackup()` remain available, and `retry()` saves
the same retained packets without recapturing versions. Retrying an admitted
merge is idempotent. Keep the original files until the whole recovery workflow
has reconciled them; these counts are not permission to delete a copy.

The returned immutable counts describe added, updated, unchanged, retained,
queued and accepted packets and whether the compatible catalog advanced.
They are diagnostic data, not server authentication or a live proof.

## Remaining room recovery work

This operation covers version-cache retention only. It does not merge native
forks, proposal/revision queues or whole upload stores, resolve opposing offline
decisions, clear historical-copy markers, verify current server/provider closure
or activate a room. Those sources and conflicts remain retained. The approved
cross-generation Undo/Redo and offline-edit bridge is still required.

Native workflow checks use actual original Wasm owners with explicit Node
storage, lock and raster fixtures. Browser behavior, process/power-loss durability,
quota, eviction and the large-room operating envelope remain release gates.
No package version, default, dependency, original protocol meaning or stored
format changes here. V1 is not release-ready.

## Functional checkpoint

The [source-bound qualification](qualification/2026-10-19-retained-version-reconciliation.json)
records the selected functional checks, native recovery matrices, fresh installed
packages and before-fix conflict evidence. It qualifies this local retention path,
not full room reconciliation or V1 release approval.

An earlier run encountered an unexpected Node catalog admission rejection during
room fault testing. Its sources and native inputs are retained; later passes do
not explain or repair it. That reliability issue remains open.
