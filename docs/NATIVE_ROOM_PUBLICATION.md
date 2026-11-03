# Actual Native room publication

This is a separate opt-in Rust relay contract for the normal network serving
step after durable Native activation. It does not certify complete SDK room
activation or replace the existing activation control, checkpoint, account,
writer, comment or acknowledgement protocols.

`prepare_native_room_publication` consumes a real already-bound standard TCP
listener and an `Arc<DurableNativeActivationControl>`. It returns an operator
router and a non-deserializable `NativeRoomPublication` owner. The operator
router holds a weak reference. Preparing a listener does not start normal
serving. The held socket is independent of the preparation runtime. Its kernel
backlog can accept pending TCP connections; applications
must not start normal editor transports before publication succeeds.

The independently selected identity names this actual fresh control instance,
the original activation control/checkpoint association and the address read
from the actual listener. A saved address, receipt or checkpoint status cannot
create a socket, Native service or serving lease.

## Explicit authenticated command

POST `/recovery/native-publication/v1/publish` requires an exact allowed Origin,
independently provisioned operator account, `application/json` and a bounded
64 KiB body. OPTIONS admits only the named method and original account headers.
The control allows one pending/admitted request at a time. An incomplete body
owns quota only; it cannot retain the source, Native owner or bound listener.
After body admission, the actual blocking worker retains its quota and owners
until completion, independently of a disconnected or cancelled HTTP waiter.

`breditor/native-room-publication-request` version 1 contains the exact selected
control identity and a joint descriptor pin: positive byte count up to 1 GiB
and SHA-256. The pin is association data. The server does not interpret it as
proof that browser actors, metadata, pending packets or local editors are ready.
The future joint SDK coordinator must bind those facts through actual owners
and the independently retained complete activation graph.

The worker freshly authenticates the retained account digest, requires the
actual committed service and checks its real current deployment lease. The
actual router, listener consumption and reachable serving task are installed
inside that deployment transaction. No application callback supplies the router,
and no await separates taking the listener from retaining the actual task.
The actual operator worker registers a duplicate descriptor of the same bound
socket on its current live Tokio reactor before consuming the original listener;
registration refusal leaves the original socket held. No preparation runtime
handle is retained. Serialization and other fallible preparation precede listener
consumption. Publishing requires the operator's live Tokio I/O runtime.

A successful `breditor/native-room-publication-receipt` version 1 records this
actual service/listener installation and the original joint association.
Repeating that exact request observes the same held service and receipt after
fresh checks; it never appends another Native epoch or recreates the router
from receipt data. A different joint pin refuses. Uncommitted, uncertain, closed
or superseded Native custody refuses without consuming a waiting listener.
A closed publication, failed serving task or changed instance also refuses.

Failure or response loss after installation is a roll-forward uncertainty.
The held owner retains the actual task and original association. There is no
automatic rollback to the old source or permission to infer a successful
publication from an activation receipt. Cold recovery requires independently
selected fresh actual owners and a new publication identity.

## Actual connection lifetime

Only publication-created normal routers enlist the opt-in connection tracker.
Ordinary existing routers retain their default lifecycle and wire semantics.
The tracker owns each actual upgrade future from admission through the normal
document/comment lease cleanup. Failed upgrades that never start a connection
release their slot. Aborted, panicked or failed started cleanup leaves a stable
failure; zero remaining connections alone does not certify successful drainage.

`close().await` closes admission, signals the real HTTP server and waiting
WebSockets, then waits for the actual server and enlisted connection futures.
It never cancels an admitted native dispatch to simulate completion. Cancelling
one close waiter retains the same task/count/failure for a later close call.
A failed native cleanup remains an error on repeated close calls. Drop signals
shutdown but cannot claim that an asynchronous drain has completed.

Closing this publication does not roll back or revoke the committed Native
epoch. Separately held recovery handles, legacy routers and independently
admitted native workers retain their own real custody and deployment checks.
Publication close is not a whole-room source-quiescence certificate.

## Qualification boundary

Focused tests use real loopback listeners, original authenticated WebSocket
messages and actual native document/comment histories. They cover all four
history policy pairs, actual preparation-runtime shutdown followed by serving
on a different reactor, original offline document/comment delivery and future
Undo/Redo, unchanged epochs on refusals/repeats, pending-body lifetime,
lost HTTP waiter lifetime, actual upgraded-connection cleanup, cancelled close,
failed cleanup and superseded Native serving fences. Dedicated strict lint,
formatting, existing generation-recovery regressions and ownership doctests are
required before saving a verified component checkpoint. Both candidate profiles
require the separate `relay-native-room-publication-native` stage, including the
connection failure checks. A targeted local run is:

```sh
cargo test --manifest-path experiments/relay/Cargo.toml --features server --locked --offline --lib native_publication -- --test-threads=2
```

Whole-room source/executor custody, exact original metadata association and
namespace continuation, installed SDK publication and complete seven-family
convergence still require integration. Physical storage/platform qualification,
full candidate profiles, public TLS/identity/tenant deployment and the thirteen
V1 gates remain separate requirements. This contract does not declare either
historical archive-read or WebKit fault repaired. Versions, normal Wasm and
existing protocol/default meanings remain unchanged.

## Retained functional checkpoint

All ten focused cases, the complete 191-case generation-recovery workset, 42
ownership doctests and thirty cancelled-waiter repetitions pass on unchanged
source. Strict library/test lint, no-server compilation, nineteen touched Rust
format checks and four candidate-plan cases also pass. The
[qualification](qualification/2026-11-03-native-room-publication.json) retains the
exact executed source/binaries and reproduced earlier failures in a compressed,
read-back-verified proof. Compiler artifacts stayed below the isolated 3 GiB bound.

The dead-preparation-reactor reproducer previously returned HTTP200 and then
refused the original-protocol connection; it now performs offline document/comment
delivery and future Undo/Redo on a different runtime. The old cancellation test
observer also reproduced an HTTP503 by acquiring the very production mutex it
was probing. A test-only actual barrier-entry event now observes without changing
admission; no timeout or production refusal policy was relaxed.

This qualifies the Native component. Complete joint SDK activation/publication,
independent installed seven-family publication, physical storage, remaining parity
and all thirteen V1 gates remain open. Historical faults remain unverified.

## Private SDK requester and actual observation

`SharedNativeRoomPublicationHost` is a private SDK component configured with an
independently selected endpoint, exact Native publication choice, operator token
provider and current host authority check. Construction performs no request.
Descriptions are detached without invoking accessors. A request reserves its
actual requester before caller reflection, then rechecks host and held-source
authority after asynchronous token work and response reads.

`publish` submits an already-retained joint descriptor pin. It does not capture
that descriptor or own the browser clients. Every incomplete outcome after a
request may have started remains `publication_outcome_unknown`; there is no
automatic retry or implied rollback. An explicit retry against the same actual
Native owner must return the same receipt without advancing the epoch. A joint
coordinator must retain actual local custody through these outcomes. A receipt's
scope remains `actual-held-native-service-and-bound-listener; joint-association-only`.
No source, replacement editor, metadata acknowledgement or whole-room readiness
can be created from that receipt.

Rust's host-only `NativeRoomPublication::observe` reads the actual held serving
state while checking the current deployment transaction. It never starts serving.
Unpublished, closed or superseded owners refuse observation. The dedicated SDK
fixture provisions controls through private IPC and starts normal serving only
through authenticated HTTP; its IPC protocol has no FinishActivation action.
Subsequent IPC observes that actual Rust publication rather than returning a
fabricated readiness marker.

## Repeatable SDK component checks

After compiling the collaboration package, run these in order on the same source
snapshot:

```sh
npm run build:collaboration:native-publication:fixture
npm run test:collaboration:native-publication
npm run test:collaboration:native-publication:installed
```

The fixture builder uses a separate development-profile Native binary with
debug information and incremental compilation disabled, two Cargo jobs and a
3 GiB artifact ceiling in `target/sdk-native-publication-native`. It preserves
normal Wasm and existing fixture executables. The new target also leaves the
previous development binary available to any already-running diagnostic.

Both checkers require all 22 cases and strict private declarations. The real
workflow cold-reopens seven client families, retains fourteen unsent original
document/comment suffixes and three actual upload acknowledgements, then loses
one actual activation reply and one actual publication reply. Explicit retries
use the same real owner and one Native epoch. Original protocol delivery and
future document/comment Undo/Redo must remain exact for every client. The
artifact checker verifies the complete saved intent, Native receipt and
descriptor pins as well as the original pending/checked observations. Matching
green test counts alone do not suffice.

The installed checker packs three SDK archives, installs without workspace links
using the pinned registry lock, compares every distribution file, and only rewrites
fixture module locations reversibly. It rejects source drift and changed Native,
Wasm or compiler artifacts. Both commands qualify this component, not complete
joint local actor transfer and metadata continuation. Physical storage, the full
policy matrix, complete candidate profiles and all thirteen V1 gates stay open.

The [2026-11-03 SDK qualification](qualification/2026-11-03-sdk-native-publication.json)
passes both complete 22-case commands on the unchanged source, with all 2,825
installed distribution files matching. It retains the actual Native binary,
complete public workflow artifacts and exact packages in a read-back-verified
proof. This component does not complete the joint replacement/metadata owner
or close any V1 release gate.
