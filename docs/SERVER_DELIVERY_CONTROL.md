# Authenticated previous/current server recovery reads

This explicit read-only contract composes the complete native A <= B <= C proof
with the genuine current native/provider control. A is the original restore
archive; B is the independently selected complete prior serving archive; C is
the exact current server and registration inventory. None is relabelled as another.

## Native ownership and protocol

prepare_log_generation_delivery_recovery_control consumes a real current guard
and a real same-host/owner VerifiedServerLogGenerationDeliveryContinuation. It
requires identical current source pins and freshly rechecks both native ancestry
and actual provider availability. It returns a router and an opaque guard with
no public constructor or deserialization path. The new identity is
breditor/server-log-generation-delivery-recovery-control version 1, containing
instance, continuation and the literal original current-control identity.

POST /recovery/generation-delivery/v1/check accepts only that exact selection and
returns a canonical breditor/server-log-generation-delivery-recovery-control-read
version 1 with scope complete-previous-native-server-cut-and-current-provider.
The new envelope has a separate 256 KiB request/response limit because its exact
pins repeat complete previous/current identities. Original 64 KiB route limits,
wire families, native protocols, permissions and defaults remain unchanged.

Original current-control checks, asset requirements, accepted native reads and
original review reads remain available with their original selectors and meanings.
All routes share the same original operator accounts, Origin policy and two
actual body/worker admissions. Operator credentials remain separate from native
owner credentials. No digest is accepted as a public account token.

Routers hold only weak ownership. Waiting for request-body bytes retains only a
quota permit, not a native host/provider lease. A started native worker retains
its real owners until that worker finishes, even if the response is abandoned.
Closing/dropping the new guard closes all its shared operator routes; it never
stops the separately owned editing service. Every new read rechecks complete
native continuity before and after current native/provider validation, and again
before publishing its serialized response. Provider callbacks cannot silently
advance or replace the selected native/raster cut.

## SDK host

SharedServerLogGenerationDeliveryRecoveryHost.open requires an explicitly trusted
endpoint, independently selected exact pins, operator principal/token callback,
a live authority callback and a genuine supplied current recovery host. A matching
object or overwritten public method cannot replace the SDK-private branded port.
check, checkAssets and readAcceptedNative bracket the genuine current-host read
with authenticated previous/current checks. Original-review reads use a private
branded port, not a public metadata callback. Choices are detached synchronously
before authentication callbacks; cancellation, timeout, reentrancy, close and
unread-body cleanup fail closed. Closing this wrapper does not close the
caller-owned SDK current checker or the editing service.

Returned data does not import anything, bind independent comments, acknowledge
outgoing edits, grant roles, migrate catalogue snapshots or activate a room.
The immutable catalogue baseline remains unchanged. This is a prerequisite for
current-inventory adoption and receipt-backed interrupted-delivery resume, not
their completion or a portable native proof.

## Reproducible checks

Native tests exercise all forty original grammar/wire and independent history
combinations, real HTTP authentication and pins, shared body quota, idle-body
release of native custody, active-worker retention, and physical/raster/provider
invalidation. Source wire laws also exercise closed declarations, body bounds,
authority, cancellation and branded ports; those synthetic transport laws do not
stand in for native proof. The identical 34 laws execute from fresh installed
package archives. The ten-mode seven-author source, installed and executed
minified-bundle workflows read actual assets and accepted document/comment
payloads through the authenticated new control and confirm that reads leave
client recovery exports unchanged. Both candidate plans retain old checks and
require the new native, SDK and public type fences. All thirteen V1 gates remain open.
