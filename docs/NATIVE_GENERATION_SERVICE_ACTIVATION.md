# Native generation service activation

This is an explicit native-service recovery step toward full V1 room activation.
It connects a genuine inactive recovered host to a fresh serving epoch after its
exact original source was durably sealed. It preserves the original backup Arc,
generation-operation custody, native owners and raster owner. It does not replace
the remaining provider/client reconciliation, packet settlement or whole-room
activation barrier. All thirteen V1 gates remain open.

## Select and authenticate the actual owners

First complete the existing durable source handover and operational recovery.
Prepare the target with separately configured current account authentication;
archives do not restore old host grants. Capture its complete current server
state and verify every current protected document/review registration through
the genuine same-host verification API, including observer and revoked records.
Missing credentials still return Pending and cannot produce a usable proof.

Retain the actual PreparedLogGenerationHandover in an Arc. Sharing this immutable
owner retains the same original private directory/file locks; it does not reopen,
copy or manufacture source custody. Preview native service activation using that
owner, the independently configured actual deployment authority, current owner
authentication and the genuine target verification proof. Native and filesystem
work runs on a blocking worker, not on the async executor.

Preview returns NativeLogGenerationActivationIdentity DATA. Persist this choice
independently before activation using the host application's durable storage.
It commits to the complete source intent, whole current native/raster archive,
all current registrations and a separately domained deterministic planned nonce.
A copied or deserialized choice is not a proof, lease, router or provider grant.
Preview is point-in-time and may become stale before activation.

## Commit one native serving transition

activate_native_service authenticates the current target account again and
requires the actual same-host protected-registration proof. It recomputes the
entire independently selected decision from those genuine owners. The worker
holds the shared host attachment write exclusion, actual exclusive epoch permit,
room mutex and raster mutex, in that order. It then rechecks:

- the exact current epoch is the source intent's planned seal, including nonce;
- the original immutable source intent and complete archive remain unchanged;
- the target retains the same original archive and actual operational custody;
- its whole current native/raster archive and all registrations match the choice;
- its actual deployment/profile/transport binding matches the authority.

Only then is the source/target-bound nonce appended using the unchanged original
104-byte deployment frame and fsync/readback checks. No external callback splits
the last checks from that commit. A stale cut, wrong actual owner or authority,
fabricated choice, changed physical generation or extra raster appends nothing.
Ordinary claim semantics, archive meanings, default routers and client protocols
are unchanged. Full current epochs are compared, never only larger counters.

Before the append starts, actual original/source custody is retained and a shared
retired flag is set independently of the optional lease. A synced append can fail
before returning any lease; that failure must not leave None usable as an
unfenced legacy host. Only verified complete publication clears retirement.

The shared attachment publishes once. A later failure closes that same lease,
leaves the slot fenced, and never restores None or revives the old source. An
earlier clone cannot retain an unfenced snapshot or refresh a retired host.
Actual original/source owners are held in a shared once-only custody slot used
by every clone and detached transaction. Dropping the activated wrapper cannot
release them while a router, older handle or started native worker still lives.

The returned ActivatedNativeLogGenerationHost can construct the existing native
routes. This only returns a Router; it does not bind a socket or deploy. Original
account/Origin checks, document/review resumes, durable receipt meanings and asset
authorization still apply. Future stateful requests remain behind the genuine
shared serving lease. No raw Room/AssetStore escape or public capability
constructor/Deserialize is added.

## Cancellation and durable ambiguity

A dropped awaiting future does not cancel an already started blocking worker.
It retains all actual owners until the real operation settles and may finish
the activation after the caller stops waiting. Preserve all source/target files
and the independently retained choice on error. A committed epoch is not rolled
back, and replaying saved metadata never reconstructs a serving lease.

The chosen nonce allows independently pinned actual authority reads to identify
the exact committed native-service decision rather than an unrelated later
counter. This checkpoint does not yet provide cold reactivation of an already
activated recovered host, a retry that reissues its old lease, or automatic
source re-preparation from a newer activated target. Those need an explicit fresh
authenticated continuation contract, preserving original operational custody.
Do not discard that custody or unwrap native parts to bypass this boundary.

Fault tests inject errors before commit, after a real epoch sync but before any
lease returns, and after publication. They also cancel real
waiters while the worker holds real source/target locks. These are process-local
interruption/cancellation tests, not new hardware power-loss or distributed
consensus qualification. The earlier source-handover process-exit tests retain
their narrower original meaning.

## Functional coverage and remaining work

Native laws cover all forty combinations of five grammar/profile choices, two
transports and independent flat/segmented document/review histories. Public-only
consumer tests construct actual loopback HTTP/WebSocket services in all ten
grammar/transport choices, with both native histories segmented. They resume old
protected streams using fresh target account credentials, submit retained offline
document/comment frames, check exact duplicate receipts without a second sequence,
exercise future native Undo/Redo in both lanes, compare accepted document state
and original raster bytes, and refuse the source account's old token on the new
service. No synthetic merge model substitutes for those original protocols.

Both functional and full candidate plans require the native activation laws and
public socket continuation. This is not whole-plan, npm-package, performance or
release qualification. Source/provider browser packages are unchanged here.

Still required for the full goal: complete current provider/client reconciliation,
historical version/suggestion/revision packet and outbox settlement, explicit
adoption of unbound local comments, durable coordinated browser-owner activation,
authenticated cold/new-source continuation and all remaining selected parity and
release gates. None can be inferred from this native service result. Historical
WebKit and intermittent parallel TCP shutdown observations are not declared fixed.
