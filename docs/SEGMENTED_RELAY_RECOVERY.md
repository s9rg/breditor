# Recover generation history with relay progress

`SharedSegmentedRelaySession` connects the native generation-history owner to
document and comment relay adapters. It keeps complete native history and exact
delivery progress in one atomic local cut. An offline writer can reconnect after
a peer seals document generations without changing its causal writer or losing
its pending edits, comments, Undo or Redo.

This is a separately selected storage family. The existing document and comment
wire protocols, writer counters and server admission rules are unchanged. The
old local generation session and plain relay constructors refuse the new family;
none detects or upgrades it from stored metadata.

## Open an explicit relay source

Choose the native grammar, selection, range, typing, search and owned-history
policies as described in [local generation recovery](SEGMENTED_SESSION_RECOVERY.md).
Also supply the exact nonsecret document and optional comment bindings. Keep the
corresponding resume credentials in protected host storage, outside these records.

```ts
import {
  SharedSegmentedRelaySession,
  createSharedSegmentedRelaySync,
  createSharedSegmentedReviewRelaySync,
} from '@breditor/collaboration';

const session = await SharedSegmentedRelaySession.open({
  ...sourceOptions,
  binding: {
    document: {
      endpoint, principal, room, writer,
      writerTransport: 'atomic-v2',
    },
    review: {
      endpoint, principal, room, documentWriter: writer,
      actor: commentWriter, binding: reviewBinding,
      writerTransport: 'atomic-v2',
    },
  },
});

const document = createSharedSegmentedRelaySync(session, {
  identity: protectedDocumentIdentity,
  getToken: getCurrentAccountToken,
  autoConnect: false,
});
const comments = createSharedSegmentedReviewRelaySync(session, {
  identity: protectedCommentIdentity,
  getToken: getCurrentAccountToken,
  flushDocument: () => document.flush(),
  autoConnect: false,
});

await document.connect();
await comments.connect();
// After accepted native inputs, without resetting the writer or its history:
await session.sealGeneration(crypto.randomUUID());
```

The named factories borrow the actual open session. A copied identity, detached
recovery object, ordinary local session or replacement `persistLocal` callback
cannot stand in for that custody. Document-family selections require an explicit
atomic-V2 identity in both the public types and runtime checks. The optional
review binding must match the paired native account, actor and document writer.
Use `review: null` only when the source has no paired comment lane.

Opening and restoring still acquire both native writer leases before reading
or replaying. `readOnly` and comment access are current host inputs, not grants
restored from metadata. Each socket obtains a fresh account token and verifies
its current server binding and permissions. Origin-local locks do not replace
cross-device writer fencing or deployment authentication.

## Save history and acknowledgements together

The dedicated database retains the same two stores, `generation_files` and
`generation_heads`. A `breditor/shared-relay-generation-head` version-one record
contains the unchanged local generation head plus closed nonsecret relay state.
It references the original and sealed immutable native files. One transaction
commits those files, the active native segment, complete paired comments and
named versions, and both lanes' progress.

Document progress retains the confirmed author prefix and the last exact
submission receipt, including its native group digest and server sequence.
Comment progress retains its cursor and author prefix, plus the last exact batch
receipt. Cold adoption checks these prefixes and receipts against the actual
native owners. A matching visible document is not enough.

Acknowledgements become visible as locally durable progress only after their
complete cut is acknowledged by storage. If the server commits but that save
fails, `relayProgress()` keeps the prior acknowledged local state while
`exportRecovery()` retains the newer pending receipt and native history. Retry
reconciles the exact uncertain cut before a newer capture. Existing immutable
files and foreign heads are never overwritten or silently repaired.

After reconnect, a server prefix ahead of the last known receipt can be verified
without inventing a receipt for the unknown response. The previous exact receipt
remains retained. Saved counters do not make a cold adapter ready: document
`serverThrough` stays null until live authentication and prefix verification.
An older server prefix is refused before resuming the author. Comment reconnect
also verifies the cursor's native prefix coverage before skipping old batches.

Native segment bodies remain opaque strings, including native integers beyond
JavaScript's safe-number range. The wrapper parses only the local head and
closed delivery metadata, not native operation bodies.

## Close and restore without discarding work

`close()` stops the session's borrowed adapters synchronously, retires editing,
and flushes the final complete cut. Failed persistence retains readable native
recovery inputs and both writer leases. `retry()` can complete that cut; an
explicit `discardAndClose()` abandons unsaved memory only after in-flight writes
settle. Storage version change immediately stops networking and retires the
source while leaving recovery export available.

`exportRecovery()` returns the separate
`breditor/shared-relay-generation-recovery` version-one envelope. It includes the
complete native source recovery and nonsecret relay metadata, not credentials,
asset bytes, upload queues or suggestion/version publication outboxes. Restore
with `SharedSegmentedRelaySession.restoreRecovery()` into an absent dedicated
head, supplying the original binding, matching native restore factory, fresh
permissions and `writerRecovery: 'host-reacquired'`. That string declares a host
obligation; it does not perform fencing. Occupied destinations refuse before the
native factory runs.

Recovery archives retain historical and deleted content. Protect them as document
data even though relay credentials are excluded.

## Bounds and remaining integration

The local native archive, original journal and Undo bounds remain unchanged.
Relay metadata has a separate 16 KiB ceiling. The new combined head is bounded
at 128 MiB plus 64 KiB; its nested original source still must fit the original
128 MiB local-head budget. No original wire, record, asset or history limit is
raised. Sealing is explicit, and neither the client nor server silently evicts
history or resets a writer at capacity.

The live functional matrix covers V3 original and general selections on both
original and atomic-V2 wires, plus document selections on atomic V2, each with
explicit or natural history, search enabled and paired comments. It
exercises two-writer offline rejoin, exact cold recovery, saved Redo, future
selective history, failed acknowledgement saves and server rollback. Storage
contracts additionally cover uncertain commit acknowledgement, native receipt
refusal, wrong families, current read-only recovery and lifecycle retirement.
Synthetic IndexedDB and Web Locks are not browser eviction or power-loss proof.

The [functional qualification](qualification/2026-10-19-segmented-relay-recovery.json)
passes 39 selected checks. Source and fresh public archives each pass the same
ten-case relay matrix with 30 cold reopens; a separate maximal atomic-V2 case
also verifies failed acknowledgement saves and server rollback in both forms.
The existing 216-configuration local generation matrix and original relay
workflows remain passing.

Suggestion and immutable-revision outboxes, shared version publication caches,
upload/provider state and operational participant/room catalogs still require
their explicit generation-aware bindings. Server-log rotation, independent
comment generations, full provider/client closure, protected credential handoff
and the final room activation barrier remain V1 work. This component does not
complete the approved whole-room generation bridge. All 13 V1 gates remain open.
