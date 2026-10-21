# Physical server recovery ancestry

`PreparedPhysicalRoomRecoveryHost` preserves three distinct selections: retained
ancestor A, the archive actually restored as local origin B, and the complete
current server cut C. This prevents a later restored archive from being relabeled
as an earlier local origin. It retains an inactive native host, not a router or
permission to activate a service.

## Archive ancestry

`prepare_physical_room_recovery_host` accepts a genuine
`PreparedLogGenerationRecoveryHost`, the complete ancestor archive, independently
selected A and B identities, and current host authentication. The original
prepared host and cold operational resume APIs continue to require B. Their
origin fields and recovery controls are not rewritten.

Preparation first proves complete immutable A-to-B containment on a blocking
native worker. Both native file closures must be independently valid. A's
selected manifest must occur in B's selected manifest lineage, and every A file
must remain byte-exact, except that its formerly active WAL may have grown by an
exact byte suffix. A's head pointer is the only replaced selector. Original
closed files, readiness metadata, retained unpublished stages and all raster
files remain required. Immutable native genesis, owner, compiler, transport and
asset bindings must match.

Equal native event counts or visible content do not establish ancestry. Two
individually valid active-log forks refuse. A newer physical manifest or raster
inventory cannot be supplied as an ancestor of an older B, even if both archives
are independently retained in C.

## Actual native ownership

The wrapper retains the actual prepared B host and immutable A archive. A
serialized native room-then-raster transaction verifies B's local recovery and
operational custody, complete native retention and original raster ownership,
then independently checks A against actual C. Clones share those actual owners;
they do not release and reopen the directories.

Preparation creates no native event, writer, grant, file, provider mapping or
activation marker. A failed check preserves the durable files. Native storage
uncertainty may fence the in-memory owner; recovery never performs incidental
repair or cleanup. A dropped async caller does not release owners held by an
already running blocking native transaction.

## Current state and protected streams

`capture_recovery_state` captures the whole current server archive and native
participant inventory in that same transaction. Its distinct
`breditor/physical-server-room-recovery-state` revision-one identity retains
`ancestor`, `localOrigin`, `server` and `participants` separately. Original
single-origin state formats remain unchanged. Detached identity metadata is not
authentication, native ownership or a readiness capability.

`verify_selected_recovery_state` checks the independently selected whole A/B/C
cut against actual native ownership and requires every current protected
document/review credential, including revoked and permanent-observer streams.
Missing credentials yield explicit Pending only after source verification; they
never yield a partially usable proof. A checksum-valid inventory that omits an
actual native stream refuses.

The nonserializable weak proof binds the exact native host, owner and A/B/C cut.
`check_live` authenticates again and rechecks all sources. A physical-only
rotation, raster-only addition or registration change invalidates the old proof.
Another byte-identical host or another ancestor selection on the same actual
host cannot reuse it. The proof keeps no host alive and grants no later atomic
activation or mutation.

## Complete server asset read

`capture_asset_recovery_state` returns the separate
`breditor/physical-server-asset-recovery-state` revision-one read. A/B/C,
participants and all conservative native causal/packet asset references share
one authenticated transaction and the existing complete encoded-result budget.
The references retain the exact current native source. Ready and Pending keep
their original meanings; Pending is not flattened to an empty reference list.

The separate [physical asset-availability contract](PHYSICAL_SERVER_ASSET_AVAILABILITY.md)
now joins genuine native continuity with actual server provider mappings and
bytes. This remains server-scope coverage: all client journals/outboxes,
historic-copy choices, matching SDK-parent integration, deployment fencing and
authenticated whole-room activation remain separate.
Existing file, raster, history and memory ceilings are unchanged. Complete
archive admission and cold native replay still scale with retained history.

## Reproducible functional checks

Both candidate profiles require `relay-physical-host-native` and
`relay-physical-host-public`. The native matrix crosses five grammar choices,
both writer transports and independent document/review history families. It
checks actual A/B recovery, old offline document/comments, peer-preserving future
Undo/Redo, revoked/observer secrets, exact rasters and unchanged B cold-resume
semantics. The public Rust consumer uses only exported APIs across all ten
grammar/transport choices. Separate laws cover forks, physical/raster reversal,
unpublished work, wrong pins, stale proofs and altered actual file custody.

The [functional qualification](qualification/2026-10-21-physical-server-recovery-ancestry.json)
passes all 25 selected stages, 341 server-enabled and 267 complete no-networking
Rust checks, and 1,527 script tests with three existing opt-in skips. Fresh source
and installed recovery consumers retain byte-identical public packages and the
unchanged normal shared runtime. These consumers qualify the existing SDK parent
separately; they do not yet connect it to the native A/B/C host.
