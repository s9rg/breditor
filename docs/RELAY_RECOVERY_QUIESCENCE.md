# Document/comment transport quiescence

Status: an implemented prerequisite for client reconciliation, not whole-room
activation or completion of any V1 gate. Original wire protocols, receipt
meanings, defaults, source families and native runtime are unchanged.

## The ownership gap

Disconnecting cancels future network admission. It cannot undo an already
invoked local save. Previously both document and comment adapters forgot their
connection/pump references on Stop and removed their attachment immediately on
Dispose. A replacement adapter could attach while the original save callback
was still pending. The private native-recovery barrier also knew only about
native facade holds/queues, not an active transport.

The public native-server regression holds a real paired-source save callback,
disposes its adapter, and attempts early replacement. The original five
implementation inputs from b23795c8 reproduce that early-replacement failure in
an isolated compiled copy. Missing new drain methods in other baseline checks
are new contract coverage, not additional historical bug reproductions.

## Public contract

Both SharedRelaySync and SharedReviewRelaySync now provide
waitForDisconnected(): Promise<void>.

1. Call disconnect() or dispose() first. Active, retrying, denied or failed
   sessions are not implicitly stopped by this method.
2. Await the actual adapter-owned connection, native receive, request and save
   work, including work no longer named by the visible socket/pump fields.
3. The caller's disconnected intent and epoch are checked before waiting and
   after each settlement. Concurrent reconnect/disconnect/disposal invalidates
   that wait; it does not acquire ownership of the newer attempt.
4. Waiting after Dispose is supported. Same-lane attachment remains reserved
   until the actual old work finishes. A new adapter may then attach normally.

The wait never connects, retries failed storage, submits an offline packet,
changes permission, creates an ACK, releases a writer or returns source custody.
A failed old operation is still allowed to finish; the drain reports quiescence,
not successful persistence. Existing sync state and original source records
remain the authority for its result. A cancelled token request ignores a late
provider result; arbitrary external work inside host callbacks remains the
host's responsibility.

## Actual private ownership

relay/work_custody.ts witnesses promises before invoking token, native or
storage callbacks, including synchronous reentrant callbacks. Retiring an
adapter retains that work and its same-lane attachment until real settlement.

The SDK-private native reservation checks ALL actual cores and document/comment
work owners before setting ANY exclusion flag. While held, existing document/
comment adapters cannot reconnect or issue suggestion/revision/document-refresh
requests through that author socket; newly constructed adapters also refuse.
Temporary native branch-source borrows have the same exclusion. Releasing the
genuine reservation is idempotent and clears its own flags only. This is not a
serialized grant, public duck-typed adoption or a server-side authorization.

Segmented relay and independent-delivery parents already dispose their tracked
document/comment adapters on retirement. Their closing paths now await those
actual retired work owners before closing native persistence and releasing
writer/source custody. An undisposed direct borrowed adapter is not silently
stolen by cleanup. Failed cleanup remains a failure, never a success flag.

## Reproducible verification

After the normal candidate package build:

- node --test scripts/relay-work-custody.test.mjs scripts/relay-recovery-quiescence.test.mjs
- node scripts/check-relay-quiescence-sdk.mjs
- node scripts/check-relay-quiescence-installed.mjs

The first command covers eight isolated work-custody laws and seven checks using
the actual native facade. The source workflow additionally executes four public
late-save cases against the authenticated native host, the unchanged ten-case
segmented relay workflow and the unchanged forty-case independent-history relay
workflow. Controlled IDB/Web Locks do not establish physical browser durability.

The fresh offline consumer installs real package archives without workspace
links, checks public types, runs the same four public cases, builds a minified
production module and EXECUTES that module against fresh real native hosts with
the same assertions. It checks exact runtime/host identities. No source-linked
SDK or fake storage implementation belongs in the production module.

Both candidate profiles require these checks; no gate is marked ready merely
because a prerequisite passes.

## Remaining end-to-end work

This does not settle offline packet queues, adopt unbound local comments,
reconcile every provider/client outbox, authenticate all browser owners or
activate a complete room. Version/suggestion/revision queues and observer paths
retain their separate existing lifecycle contracts; this change does not claim
one universal barrier for every adapter. The genuine parent/session/source
reservation must compose these drains with actual receipt-backed transitions,
durable cuts, packet conservation and current participant policy. Native import
or matching clocks must never stand in for delivery acknowledgement.

The historical WebKit fault and intermittent native post-shutdown connect
assertion remain open, unrelated to this reproduced lifecycle gap. No V1,
parity, release, browser-certification or physical durability claim is made.
