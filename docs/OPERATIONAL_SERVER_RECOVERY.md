# Operational server recovery

The Rust relay can explicitly hand a completed recovery into operational storage,
then reopen later accepted edits and additional raster files without replacing
the original source cut. This separates immutable recovery from ordinary service
lifetime. It establishes storage provenance, not whole-room activation authority.

## Establish the operational phase

```rust
use breditor_collab_relay::{
    OperationalServerRoom, RoomRecoveryPolicy, ServerRoomRecovery,
};

let recovered = ServerRoomRecovery::begin(
    destination, &archive, &trusted_selection, RoomRecoveryPolicy::HostReacquired,
)?.finish(&archive)?;
let operational = recovered.begin_operation(
    &archive, &trusted_selection, RoomRecoveryPolicy::HostReacquired,
)?;
let (room, assets) = operational.into_parts();
// Configure current host authentication and complete all activation prerequisites
// before serving a router. Native ownership alone is not a client activation grant.
```

Retain the independently selected original archive and identity. `begin_operation`
requires the exact completed recovery, both still-locked native components and
their original files. It writes and syncs a closed `.operational.json` record
before returning components that an ordinary host can mutate. The original
`.recovery.json`, `.ready.json`, archive, log bytes and rasters are not rewritten.

The new marker binds the original recovery attempt ID and selected server
identity. It records a storage phase, not an authentication result, role, writer
lease, provider mapping or global readiness Boolean. The private native owner
cannot be manufactured by deserializing a marker.

## Reopen later operational state

```rust
let operational = OperationalServerRoom::resume(
    destination, &archive, &trusted_selection, RoomRecoveryPolicy::HostReacquired,
)?;
let origin = operational.origin(); // Detached original selection, never a new grant.
let (room, assets) = operational.into_parts();
// Supply fresh current Authentication. Resume original writers only with their
// protected credentials and actual current roles; prior connection leases are dead.
```

Reopen fully replays the current native log, checks its exact selected original
byte prefix and admits every current raster record. Additional accepted operations
and complete assets are allowed. Every original raster record and the original
manifest must still exist byte-for-byte; an unreferenced original image is not
discarded. A valid native log with the same genesis but different selected history
is a fork and refuses.

The ordinary `ServerRoomRecovery::resume` remains an exact-source recovery API.
It refuses operational directories and later edits instead of rolling them back.
The new operational path does not weaken that guard or replace the source
selection with the latest files. Root coordination and native log/raster locks
exclude concurrent owners; transferring parts releases only the coordinator lock.

## Resolve interrupted handoff

Before publication, the attempt-specific operational staging file can contain an
exact prefix of the canonical marker. Operational resume can finish that prefix
only if both native components still exactly match the original selected cut.
Later edits cannot be adopted under an unpublished intent. A published marker
with a matching full staging file resolves a lost acknowledgement without
restoring empty data or changing component bytes.

An absent operational intent is not silently manufactured. If no operational
write was committed, resume the original exact recovery and explicitly begin
operation. If intent staging exists, use operational resume. Unknown files,
changed selections, divergent prefixes, incomplete markers and occupied
components refuse without overwrite or reset. Actual native components and
markers are rechecked after the publication barrier before ownership is returned.

## Preserve uncertain state

Operational resume never initializes missing directories, locks, manifests or
logs. It preserves and refuses an incomplete log tail, a pending server raster
file, missing original rasters, unknown entries and invalid native replay.
Retain such a directory for explicit host recovery handling. The ordinary
`Room::open` torn-tail recovery and `AssetStore::open` pending-file cleanup retain
their original behavior; this new API does not invoke those destructive cleanup
paths as a side effect of a failed provenance check.

Original native log/asset bounds still apply. Reopen reads complete bounded files
and decodes current rasters; it is not a streaming compactor or a new generation.
The source archive must remain available. Unix inode checks reject a byte-identical
replacement log that does not carry the held native lock. Cross-platform and
physical power-loss qualification remain release work.

## Remaining room activation work

[Current selected server checks](SELECTED_SERVER_RECOVERY_STATE.md) can verify an
exact source cut on an authenticated host. Later operational edits invalidate
that earlier exact-cut proof; a saved proof or marker cannot authorize them.
Fresh current account/registration and deployment authority remain necessary.

[Current server continuity checks](CONTINUED_SERVER_RECOVERY_STATE.md) now combine
fresh owner authentication and all current protected registrations with a newly
selected native cut that retains the original log prefix and every original
raster. Their host-local proof becomes stale after any later selected state
change; it does not turn the earlier exact-cut proof into activation authority.

This storage handoff does not transfer the browser catalog's private participants,
merge every historic client copy, establish current provider reference closure,
or preserve history across generations that exceed existing native bounds.
The approved cross-generation Undo/Redo and outstanding-offline-edit bridge is
still required. All 13 V1 readiness gates remain open.

The functional regressions cover all ten native compiler/transport families,
interrupted marker publication, valid forks and retained files. Public workflows
also exercise native selective Undo/Redo and a saved Redo branch across two
operational reopens, preserve peer edits, and stop/restart real HTTP asset service
with fresh account tokens. Installed SDK regression scope is recorded separately
in the [operational qualification](qualification/2026-10-19-operational-server-recovery.json).
