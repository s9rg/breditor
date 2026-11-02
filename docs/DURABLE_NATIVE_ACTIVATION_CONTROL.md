# Authenticated durable native activation control

The opt-in Rust host API `prepare_durable_native_activation_control` connects an
already prepared durable checkpoint to a separately authenticated operator POST
endpoint. It returns an explicit control owner and a router. The caller decides
whether to bind that router. Immutable checkpoint/file checks during preparation
and checked service-router retrieval run in owned blocking workers. Ordinary editor routes and the existing read-only
recovery controls are unchanged.

## Host preparation and independent choice

Preparation requires the genuine recovery host, its fresh protected-registration
proof, the actual prepared checkpoint/source owners and the independently configured
deployment authority. Native account authentication is checked again. Operator
accounts must use separately provisioned tokens. The checkpoint must still have
its exact prior epoch and complete current target cut.

Retain `control.identity()` independently before the first request. The revision-one
`breditor/durable-native-activation-control` identity contains the fresh instance,
`checkpointSha256`, complete `current` server/inventory pins, and exact `previous`
and `planned` deployment selections. These are data, not an activation capability.

The checkpoint digest commits to the full native checkpoint identity, including
its original filesystem witnesses. The network identity does not serialize those
64-bit device/inode values: ordinary JavaScript numbers cannot represent all of
them exactly. Digest entries are bytes and epoch generations retain their existing
canonical decimal-string form. The native checkpoint format remains unchanged.

## Commit and response loss

POST the exact independently selected control identity as JSON to
`/recovery/native-activation/v1/commit`, with the separate operator principal,
bearer token and allowed Origin. OPTIONS uses the same explicit Origin policy.
Body admission is bounded to 64 KiB and one request at a time. An incomplete body
holds only its request quota, not native or source custody.

After complete body admission, an owned blocking job retains the actual quota,
host, checkpoint and source through all native work. Dropping the HTTP waiter does
not cancel that job or release its quota early. The existing native activation
barrier rechecks actual source custody, complete target equality, the operational
owner and exact prior epoch before appending and publishing the planned epoch.

The control allocates its successor holder before this durable transition and
retains the genuine successful service before serializing a response. A repeated
request through the same live control checks the same actual serving lease and
returns the same receipt without appending another epoch. It does not reopen
native parts or reconstruct a lease from a saved `Committed` observation.

A failure once the real commit begins makes this control terminal. Even a missing
response or an error may follow a durable append. Preserve all files and independent
choices, inspect the actual checkpoint/authority state, and use deliberate cold
recovery with fresh authentication and a fresh epoch. The controller never resets
itself to Prepared, overwrites the checkpoint or revives an earlier writer.

## Actual service ownership

`control.service_router().await` obtains normal routes only from the actual retained
successful service. An unstarted, busy, closed, uncertain or superseded control
refuses. A receipt has scope `actual-held-native-service-only`; it is not an editor
ready flag, client acknowledgement, provider grant or whole-room activation result.

Closing or dropping the control prevents further operator requests. It does not
revoke an already activated native service or cancel a native worker already
committing. Existing service routes retain their real shared serving custody and
remain fenced by their actual deployment epoch. Saved identities cannot create
the control owner or its service handle.

## Functional checks and remaining integration

The native checks exercise real loopback HTTP and all four independent document/
comment history policy pairs. They cover one epoch append, identical repeat
receipts after later native work, separate operator authentication, altered digests
and instances, unknown fields, Origin/body bounds, stale-target terminal refusal,
incomplete-body quota, control drop and cancellation of a real HTTP handler while
its worker is blocked on actual native target exclusion. Existing recovery
networking uses one shared bounded wire helper.

Reproduce the relevant native suite with `cargo test --manifest-path
experiments/relay/Cargo.toml --features server --release --locked --offline --lib
-- native_activation delivery_control --test-threads=1`. Use a bounded target
directory. Strict lint includes both library and test code.

This supplies the native network connection point. The SDK still needs its typed
authenticated commit client, a durable coordination intent binding the complete
client/metadata/asset capture to this choice, and the coordinated live handoff and
cold-resume path. Offline work must remain pending until ordinary protocol ACKs;
native activation does not discard or acknowledge it. Physical browser/process
qualification, public hosting integration, complete candidate profiles and all
thirteen V1 gates remain open. The older intermittent archive-read and WebKit
observations are not declared repaired here.

The [qualification record](qualification/2026-11-02-native-activation-control.json) records the completed 30-case workset, strict lint, the public ownership doctest and a read-back-verified source/executable proof. The earlier broad 180-case run was actually stopped by its 20-minute watchdog after 172 passing cases; it is retained as incomplete. Full-crate formatting also retains pre-existing differences in eight unchanged example files. All eleven touched Rust files pass their formatting check. Neither incomplete check is reported as a full release pass.
