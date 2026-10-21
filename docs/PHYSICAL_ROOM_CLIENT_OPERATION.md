# Physical room client-operation parent

`SharedPhysicalRoomClientOperation` co-owns the complete physical catalog, the
staging intent and actual mixed original/generation client owners. It provides
restartable client-side continuation, not a native server-host ancestry transfer
or permission to activate a replacement service.

## Three stores, one actual owner

`begin` takes a genuine completed `SharedPhysicalRoomParticipantStage`, an
independently retained physical selection, explicit client-operation destinations
and fresh bounded-digest/host authority. A cold `staged` marker without reopened
native owners cannot supply this custody.

The source reserves itself before caller policy getters or authority callbacks.
Every selected read-only owner and all source files are rechecked. Both recovery
families validate guard replacement before one callback-free synchronous commit
assigns their private preparations. The catalog lease, staging lease and new
operation lease transfer together. The old stage retires without destroying any
owner; closing it or revoking its authority/signal afterward cannot poison the
successor's fresh policy.

The actual IndexedDB factory and lock manager remain pinned across every await
and callback. Reentrant work refuses; close waits on a wait handle reserved before
callbacks can run. A changed storage context cannot redirect recovery into a
different database factory.

## Separate durable client intent

The `breditor/shared-physical-room-client-operation` version-one record has its
own version-one database and sole `physical_room_client_operation` store. It pins
its own database name, the staging database, the complete exact staged record and
every original/generation client-operation destination. The retained catalog and
staging schemas are never upgraded or overwritten.

The source files stay in the actual catalog database rather than being copied
again into the parent. All three stores and their real cooperative leases remain
held together. The record progresses from `prepared` to `operational`; each child
advances `reserved` → `started` → `complete` in order. Completion and publication
are distinct compare-and-set transitions. An occupied destination, even with
identical intent, requires explicit resume.

A lost acknowledgement retains the exact previous/pending next record. Retry
accepts only one of those actual states; it never adopts an unrelated plan,
repairs corruption or overwrites occupied data. Extra stores/keys, changed source
files or plan, unknown families/versions and out-of-order progress refuse.

## Cold reopening and current permissions

`resume` requires all three database names, the independent physical selection
and fresh explicit factories plus `currentPolicy` for every selected client.
It rereads the complete catalog files and exact staging/parent records. It does
not manufacture native owners from their completion markers: `finish` reopens
every actual component and verifies its whole native history and upload state.

The first transferred owners remain read-only. Current permissions on cold
resume are independent of that historical staging policy, including when the
parent was interrupted while still `prepared`. A permanently read-only review
transport remains permanently read-only; a caller cannot promote it into a
commenting reviewer. The parent refuses that entire cohort before opening any
client operation. Fresh document policy and immutable review transport are
separate constraints, not one combined read-only flag.

While `prepared`, every reopened child must still match its exact selected
origin. An independently appended native edit before the publication barrier is
refused and retained, not silently published or erased. After `operational`,
complete native descendant histories may continue under fresh explicit policy;
Undo/Redo, peer work, review records and whole uploads remain intact.

`progress` is durable intent only. `check` requires all genuine current native
owners. `intoParts` releases every selected family together or returns none,
using the existing mixed native-author barrier. Clients stay disconnected and
their actual native writer custody remains attached. Unselected historical
copies remain retained and unresolved; returning client parts does not reconcile
them or prove server/provider closure.

The opt-in [native control join](PHYSICAL_RECOVERY_CONTROL.md) adds
`checkNativeHost` under genuine held client reservations and separate live
operator authentication. It verifies current native prefixes without weakening
the old exact-snapshot readers. Missing, unbound and historical copies stay
Pending; it does not write durable whole-room intent or grant activation.

The separately scoped [asset reconciliation read](PHYSICAL_CLIENT_ASSET_RECONCILIATION.md)
adds `checkNativeAssets`. It derives genuine held client native/packet bindings,
snapshots every complete upload store, reads current native/provider bytes and
rechecks the exact snapshots. Pending/cancelled/failed queue work stays separate
from provider availability. It neither marks uploads complete nor releases or
retargets any owner; durable coordination and activation remain separate.

## Failure and lifetime

Initial cancellation, authority loss, interrupted child/parent commits, failed
lease release and failed cleanup remain explicit retryable states. Cancellation
in the successor is not mislabeled as a source storage failure. Public errors
contain no host payload; private weak diagnostic causes are not root exports.

`close` waits for in-flight restoration and closes actual owners in reverse
order. Failed cleanup remains reachable for retry. `discardAndClose` explicitly
abandons private unsaved work. Neither operation deletes committed client data,
the original/current server files, raster bytes or historical copies. Closing
the final archive releases private file/client maps; independently held Blob
snapshots and cached immutable metadata survive.

## Bounds and verification scope

The stage retains its 1,024-client/16 MiB plan bounds and the catalog its separate
4,096-file/16 GiB declared envelope. Every component/native file ceiling remains
unchanged. Full source verification and native reopening still scale with
retained data; these ceilings do not certify RSS, quota or long-session latency.

The functional probe uses ten real native physical profiles and local, relay
and retained client transports. It checks initial read-only handoff, two cold
reopens, exact native client records and whole uploads, retained historical
copies, continued editing and future document/review Redo. Both native transports
exercise deterministic interruptions, reentrancy, changed storage, current
policy, corruption, missing completed stores and cancellation during restore.
The storage suite separately checks 41 intent/schema/transaction laws. The fresh
offline installed consumer repeats the unchanged assertions against public
package archives, with strict public types and production import checks.

Synthetic IndexedDB/locks and raster-presentation fixtures are not physical
browser qualification. Durable native/client coordination, independent comment
generation sessions, complete provider/client-outbox closure, every historical
copy's disposition and authenticated deployment fencing/activation remain
substantive work. All thirteen V1 gates remain open.

The [2026-10-21 qualification](qualification/2026-10-21-physical-room-client-operation.json)
passes all 33 selected architectural stages and 1,525 script tests, with three
existing opt-in skips. Source and fresh installed archives each check thirty
mixed cases, 180 exact source files, 180 native client-record and whole-upload
comparisons, plus both-transport interruption cases. The mixed fixture pairs an
original author with a generation observer: its 27 future Redo comparisons are
not separate writable-generation-author coverage. That focused follow-up was
kept explicit. Native suites are carried only after all 2,923 native inputs and six
actual runtime files match the preceding committed qualification byte-for-byte.

The subsequent [writable-author conformance](qualification/2026-10-21-physical-generation-author-conformance.json)
passes eleven selected stages without changing production source or any of the
three public package archives. In both source and fresh offline packages, six
additional cohorts cross both native wire transports with local, relay and
retained clients. They cover twelve cold author opens, committed historical
document/review Undo/Redo, newly pending Redo after another cold reopen, exact
native records/whole uploads and 48 retained files. Matching no-op history results
cannot pass these assertions. The 1,525-test script suite passes again, with the
same three existing opt-in skips. These additional author cohorts use the v1
grammar; the existing thirty-case mixed matrix covers all ten native profiles.
