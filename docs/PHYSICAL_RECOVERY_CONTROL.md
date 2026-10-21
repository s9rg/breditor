# Physical recovery control and client continuity

The opt-in native operator control lets a held physical client operation check
the actual restored server and its provider at the independently selected cut.
Ancestor A, actual local restore origin B and current source C remain separate.
This is a live read, not the durable whole-room coordinator or permission to
activate a replacement service.

## Explicit native owner and separate operators

`prepare_physical_room_recovery_control` requires the genuine prepared physical
host, its current native/provider byte proof, the exact provider instance, actual
native owner authentication and separately provisioned operator accounts and
Origins. No operator token may reuse any native editor account token. The
controller retains only the native account digest, not the plaintext token.

The returned router exposes only POST and OPTIONS at
`/recovery/physical/v1/check` and the separately scoped
[`/recovery/physical/v1/assets/check`](PHYSICAL_CLIENT_ASSET_RECONCILIATION.md).
Serving it is an explicit host action; ordinary
editing routers and constructors are unchanged. There is no editing, archive
download, upload, restore or activation endpoint. Metadata cannot construct the
private native proof or controller.

Keep the returned `PhysicalRoomRecoveryControl` guard for the service lifetime.
The router has only a weak reference. Closing or dropping the guard refuses new
and in-flight results without prematurely releasing a running native worker's
actual file ownership. After all actual workers and owners finish, cold native
recovery still uses B, not A relabeled as the local origin.

`close()` revokes checks; the guard still owns its native/provider handles until
it is dropped. Dropping the guard releases otherwise idle ownership immediately.

## Closed selection and bounded requests

`breditor/physical-room-recovery-control` version one pins a fresh nonsecret
256-bit control-instance nonce and the complete A/B/C recovery-state identity.
A new controller at byte-identical source data still requires explicit selection
of its new nonce.

Exact operator Origin and authentication precede body reading. Each controller
admits at most two authenticated request handlers without a waiting queue.
The original continuity request and complete response bodies remain bounded to
64 KiB. The separate asset requirement read has its own documented bounds and
shares the same two-handler quota. Deployment must
also bound connections, body duration and host/provider resources; these handler
limits are not public-service denial-of-service certification.

While an authenticated body is incomplete, its handler retains only the
independent request permit, not native/provider ownership. Dropping the controller
can release an otherwise idle document without waiting for those sockets. After
complete body admission the same weak controller is reacquired and checked;
stale requests cannot attach to a replacement controller. Real running native
workers continue to retain custody until their work ends.

Each check repeats genuine native continuity and actual provider/raster
verification before and after response serialization. Physical-only rotation,
provider epoch or mapping changes and altered native/raster files refuse without
repair or deletion. The closed four-field response contains only family/version,
checked selection and `native-physical-and-server-provider` scope. It contains no
asset-reference list, mapping, archive bytes or protected credentials. That old
response is unchanged; asset requirements use a different request/result family.

## SDK authentication and lifetime

`SharedPhysicalRoomRecoveryHost.open` takes an explicitly trusted endpoint,
independent expected selection, operator principal, ephemeral `getToken`, current
authority callback and optional cancellation/timeout policy. HTTPS is required
except for loopback HTTP. URLs containing credentials, queries or fragments
refuse; archives never choose operator policy. Requests omit cookies and caches
and refuse redirects.

The checker reserves itself before callbacks, rechecks current authority around
transfer and parses a complete bounded strict-UTF-8 canonical receipt. Unknown or
duplicate fields, replaced cuts/nonces, wrong scope, truncation and oversized
responses refuse. Rejected response streams are cancelled and released, including
late authority loss. `close` stops only this checker, not native hosts or clients.

The internal port is privately branded and uses actual private state. Overriding
public `selection` or `check`, or supplying a prototype-shaped object, cannot
manufacture a native check.

## Held native clients and current descendants

`SharedPhysicalRoomClientOperation.checkNativeHost` requires an operational parent
with every actual selected original/generation client reopened. It reserves both
families before operator callbacks, rechecks retained source files and captures
actual current native histories. A must equal the catalog's retained ancestor;
C must equal its complete current server and participant inventory. B remains
separately authenticated by the native host.

This operational read admits genuine descendants with later offline work after
verifying immutable origins and accepted native prefixes. Existing inventory
readers keep exact-backup equality; old persisted protocols are not widened.
Original/generation copies share duplicate-writer/actor refusal and observer
prefix checks. Canonical captured readers prevent public method overrides from
redirecting source checks.

The result family is `breditor/shared-physical-room-native-check` version one,
with `native-host-and-selected-client-continuity` scope. Missing or server-ahead
streams, local reviews without a relay binding and every unselected historical
copy remain Pending. A local actor is never guessed to be an authenticated relay
binding. No copy is silently discarded.

The method writes no intent, flushes no client, releases no owner and retargets
no source. Cancellation or parent closure refuses the result; close/cold resume
retains original files, native records, whole uploads and future document/review
Undo/Redo. A completed read does not reserve the server against later changes.

## Verification and remaining architecture

Native tests cover all ten grammar/transport profiles, separate authentication,
closed selection/body admission, stale physical/provider state, weak routers and
controller closure while a real native worker is paused. Separate actual provider
tests check PNG/JPEG/WebP; the joint SDK fixture has paragraph histories with no
native image dependency.

Source and installed probes share assertions for 108 joint reads, including
eighteen writable-generation-author reads, thirty mixed cohorts, 180 exact source
files and client-record/whole-upload comparisons, both native transports,
continued offline history, reentry, cancellation, parent close/resume, foreign
sources and method overrides. Installed consumers use fresh offline public
archives and strict bare-import types. Node IndexedDB, cooperative locks and
raster presentation are explicit synthetic fixtures.

The remaining coordinator must durably bind native selection, clients, outboxes,
asset requirements and provider mappings, retain historical-copy decisions and
support independent client comment generations. Authenticated deployment fencing
and atomic activation require complete reconciliation, not this point-in-time
receipt. Resource qualification and all thirteen V1 release gates remain open.

The [2026-10-21 qualification](qualification/2026-10-21-physical-recovery-control.json)
passes 28 selected stages, both complete relay suites and 1,566 script tests,
with three existing opt-in skips. Source and installed probes repeat the same
assertions; public archives, native inputs and the unchanged shared runtime are
pinned in that evidence. This is not the full 210-check functional plan.

The [body custody repair](qualification/2026-10-21-physical-control-body-custody.json)
then reproduces an idle-lock defect with two actual authenticated incomplete HTTP
bodies. The unchanged test fails on the prior committed production and passes
after moving native ownership past body admission. Actual cold B reopening,
offline work and future peer-preserving history are required in both runs; a
setup failure cannot count as the reproduced defect. A separate unchanged paused
native-worker law still requires its lock to remain held until work finishes.
All 28 follow-up stages pass, with 368 server-enabled, 267 no-networking and
1,566 script checks plus three existing opt-in skips. All three public package
archives and six shared runtime files remain byte-identical. This does not add
connection deadlines, certify public hosting or close a V1 gate.
