# Recover retained suggestions and revisions

`SharedSuggestionQueue.recoverRetainedSuggestions` and
`SharedSuggestionRevisions.recoverRetainedRevisions` retain an original copy's
proposal packets, decision intents and revision drafts alongside current-only
work. Both require a genuine independently selected
[`SharedParticipantReplay`](HISTORICAL_PARTICIPANT_REPLAY.md) and actual current
native document and review continuity. They neither edit accepted content nor
finalize a review decision.

These APIs perform local retention. Keep the original files and room recovery
markers until the complete recovery workflow has reconciled every source.

## Disconnect the shared queue group

```ts
const replay = await SharedParticipantReplay.read(originalRecoveryOptions);
try {
  suggestionSync?.disconnect();
  revisions.disconnect();
  await suggestionSync?.waitForDisconnected();
  await revisions.waitForDisconnected();
  await queue.flush();

  const proposals = await queue.recoverRetainedSuggestions(replay);
  const drafts = await revisions.recoverRetainedRevisions(replay);
  host.showRetainedCounts(proposals, drafts);
} finally {
  replay.dispose();
}
```

Disconnect every attached suggestion-sync adapter and revision outbox first.
Their wait methods settle already-started connection, serial delivery and lazy
download work; they start no connection. A replaced connection epoch refuses
instead of declaring an older wait successful. A delayed connection cannot
restart either disconnected adapter after its await completes.

The borrowed document transport remains owned by the host. Disconnecting these
metadata adapters does not disconnect that transport, stop other authors or
create a cross-device fence.

Each recovery reserves the queue and all attached adapters through its local
save. Busy or connecting adapters, an opening outbox, and outstanding local
writes refuse with `suggestion_recovery_in_use`. While reserved, mutations,
reconnect, retry, close, disposal, another recovery and new adapter attachment
refuse. Read-only diagnostics remain available. The operation does not silently
disconnect or dispose another owner.

## Preserve exact work and refuse contradictions

Current packet order remains first, followed by missing original packets in
their original order. A repeated native ID requires exactly the same packet
bytes; revisions also require exactly the same predecessor bytes. Native
local-author, source, retained-effect and accepting-user history admission remain
mandatory. Endpoint, room, principal, writer, service writer, bindings and
explicit owned-history family must match.

Original publication and final-decision receipts remain immutable. Known receipts
stop their older retries; an opposite final server outcome remains visible rather
than being replaced with a queued local choice. A stopped revision conflict may
gain its compatible known successor, without discarding the losing draft.

Conflicting receipts, different events at one accepted sequence, two published
successors for one predecessor, contradictory known ancestry, changed immutable
bytes, or a revision claiming both success and a different conflict refuse with
`suggestion_recovery_conflict`. Revision recovery also compares the known events
in the current and original proposal queues.

Different decision payloads or timestamps are not ordered by wall-clock time.
Different unfinalized retry choices refuse with
`suggestion_recovery_intent_conflict`, even if one copy looks newer. A final
receipt may suppress the retry flag on the same original choice, but it does not
authorize replacing a different choice. Explicit conflict resolution remains
part of the broader recovery workflow; both original files stay retained.

Each original queue/outbox still admits at most 256 rows and 32 MiB of encoded
record data. Original packet bounds remain unchanged. An oversized union refuses
as a whole, without eviction or a larger stored-data limit.

## Save and retry each store

Admission completes before target mutation. After admission, the operation owns
copied records; disposing the borrowed replay cannot erase an in-progress save.
Normally keep the replay alive until the returned Promise settles.

The authoritative native source saves first. The proposal queue then commits one
complete record; the revision outbox additionally flushes its borrowed queue
before committing its own complete record. A transaction abort preserves the old
durable record and full merged in-memory export. A commit followed by a lost
acknowledgement or source-port failure preserves the committed union. Retained
queue and revision bytes remain exportable after a borrowed-source failure;
`retry()` saves those same records after the source is usable again.

The two stores commit separately, not as one cross-database transaction. If queue
retention succeeds and revision reconciliation refuses, keep that completed
retention and the unchanged original revision files, resolve the conflict and
retry. Neither returned count object is whole-room completion or permission to
clear a historical-copy marker.

## Remaining recovery and release work

This does not merge forked native journals, resolve ambiguous local decisions,
reconcile whole upload stores, verify current server/provider authority, recover
protected credentials, fence deployment writers or activate a room. The approved
cross-generation Undo/Redo and outstanding offline-edit bridge remains required.

Native workflow tests use original Wasm owners and explicit Node storage, lock,
raster and transport fixtures. They do not qualify physical browser behavior,
process/power-loss durability, quota, eviction or the large-room operating
envelope. The earlier intermittent catalog admission rejection and historical
WebKit fault remain unresolved. V1 is not release-ready.

## Functional checkpoint

The [source-bound qualification](qualification/2026-10-19-pending-work-reconciliation.json)
records native recovery and save-fault workflows, fresh installed consumers,
combined editing and live review tests, and reproduced before-fix failures.
It qualifies this local retention path, not complete room recovery or V1 approval.
