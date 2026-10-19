# Joined server room recovery

The Rust reference relay can capture one serialized server log and raster-store
cut, then restore both through one inactive recovery directory and a durable
completion record. A private live-host handle takes the same room-then-assets
locks as ordinary transactions. This coordinates the two server components; it
does not capture client journals, offline queues, participant inventory or current
account/provider authority.

## Capture through the actual host

```rust
use breditor_collab_relay::server::router_with_server_backups;

let (router, backups) = router_with_server_backups(room, authentication, assets)?;
// Serve router using the ordinary explicitly configured host.
let archive = backups.capture().await?;
let selected = archive.info().identity; // Retain independently in trusted host configuration.
let file = archive.to_bytes()?;
```

`ServerBackupHandle` is an explicit private host capability, not an account or
browser API. No backup or restore HTTP route is registered. Captures include
private accepted/deleted history, permission metadata, credential digests and all
complete raster files, including unreferenced retained images. Keep the handle
and files under the host's backup access and retention policy. Files are not
encrypted.

Capture runs blocking reads and native image admission off async I/O threads.
Both existing native owners remain locked through the synchronous capture; no
ordinary host transaction can publish between its log and raster snapshots.
Capture neither flushes clients nor acknowledges an operation or upload. A later
transaction does not rewrite the returned archive. Dropping the capture future
does not cancel already running blocking work. Drop the router, connections and
every cloned capture handle when stopping the original host: handles retain its
native owners.

Maintenance code that already exclusively owns both native values can instead
call `ServerRoomBackup::capture(&mut room, &mut assets)`. A mismatched room binding,
poisoned storage, unknown/pending files or invalid raster bytes refuses capture.
The underlying [log](SERVER_ROOM_BACKUPS.md) and
[raster](SERVER_ASSET_BACKUPS.md) archives keep their exact original files and
native formats; no new original log event, receipt or storage counter is added.

A document can reference raster bytes absent from this server store. The archive
preserves that server state; it does not prove complete history-wide asset closure.
Participant/provider recovery must resolve missing bytes and mappings before a
host claims whole-room completeness.

## Independently selected server cut

`ServerRoomBackupIdentity` contains the exact `RoomBackupIdentity`, exact
`AssetBackupIdentity` and SHA-256 of the complete joined file. Retain the identity
from a trusted live capture separately from the file. Never select the expected
identity from incoming archive metadata. The room's original seed namespace must
match the raster store's binding. Native log lineage, original profile/transport
and the complete raster inventory remain pinned together.

`ServerRoomBackup::from_bytes` performs bounded closed framing and complete
component admission without filesystem writes. It checks the log's original
record integrity and selected durable cut, plus the exact raster archive and its
full ordinary PNG/JPEG/WebP native decoding. It does not replace later native log
replay. A newly checksummed header naming a false original profile cannot publish
a recovered log or return ready components.

## Prepare and resume an inactive destination

```rust
use breditor_collab_relay::{
    RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery,
};

let archive = ServerRoomBackup::from_bytes(&file)?;
// Fence the original deployment and reacquire current host authority separately.
let attempt = ServerRoomRecovery::begin(
    destination, &archive, &selected, RoomRecoveryPolicy::HostReacquired,
)?;
let progress = attempt.progress(&archive)?;
// Retain destination and selected, then drop if interruption or explicit resumption is needed.
let recovered = attempt.finish(&archive)?;
let (room, assets) = recovered.into_parts();
// Reconcile client recovery/current access, then explicitly supply fresh Authentication to a router.
```

The destination must be an absent directory under an existing host-owned parent.
Existing files, empty or populated directories and live or dangling symlinks are
occupied and never replaced. Ambiguous final path components are refused. The
parent is resolved once, so retargeting its original alias cannot redirect a
retained recovery. Unix creation requests 0700 directories and 0600 files.

`begin` creates and syncs an exclusive lock and immutable `.recovery.json` marker
binding this attempt to the independently selected archive. No component or
service starts. If initial reservation fails before a complete marker exists,
the known directory may remain. Preserve and inspect it; do not manufacture a
marker, delete it or reset it to force a retry. Initial-reservation ambiguity
still requires host recovery handling.

`ServerRoomRecovery::resume` rechecks the same trusted identity, canonical marker,
held lock and closed directory inventory. `progress` checks exact final files and
known staging prefixes without publishing or deleting anything. Its
`completion_record` flag reports an exact physical record, not live currentness,
native replay proof, account permission or activation authority. `finish` must
revalidate and acquire both native owners even when that flag is already true.

## Native completion barrier

The log is copied into an attempt-specific staging file. Exact interrupted byte
prefixes can be appended; divergent data is never truncated. The complete synced
file undergoes ordinary native profile, role, operation, receipt and review-state
replay. Its complete identity must equal the host selection before an absent-only
hard link publishes `room.log`. The locked inode remains owned across publication.
An already-published log must match the selected original bytes before ordinary
open is called, so torn-tail recovery cannot silently shorten a selected backup.

The `assets` child directory then uses the existing explicit resumable raster
restore. It preserves original manifest/record bytes, count and byte budgets.
If the asset phase fails, the exact published log and any raster work remain
retained, with no completion acknowledgement. Resume the same selected attempt;
never overwrite the partial directory or discard its log to retry.

Only after both native components are complete, matched and locked does `finish`
publish and sync `.ready.json`. It removes only its own fully checked staging
files, leaving the immutable selection marker and completion record. The returned
`RecoveredServerRoom` retains the coordinator lock; `into_parts` transfers both
still-locked native components and releases that extra lock. It starts no router,
uploader, client sync or garbage collector.

Drop or failure releases the current handles without deleting the directory or
retained component work. Exact log prefixes, published logs, partial assets,
completed assets, partial completion staging and uncertain completion publication
can all resume. Unknown files, changed selections, bad markers, symlinks,
divergent prefixes and false completion records refuse without cleanup. Concurrent
attempts cannot bypass the held lock. If a service has subsequently edited a
recovered log, the old selected cut refuses rather than overwriting that new work.

## Framing limits and operating scope

The independent `breditor/server-room-backup` version-one file starts with the
17 bytes `BREDITOR-SERVER1\n`, a four-byte big-endian header length and a 32-byte
SHA-256 of the canonical closed JSON header. Its fixed prefix is 53 bytes. The
header is at most 64 KiB and pins both component identities and their exact
body-relative byte ranges and SHA-256 values. The original log archive comes
first, followed by the original complete raster archive, with no gaps, omitted
components, overlaps or trailing data.

`MAX_SERVER_ROOM_BACKUP_BYTES` adds only this prefix/header to the existing
component archive ceilings. It does not increase original journal, log, raster,
record or asset-count limits. Capture/admission use bounded in-memory copies and
in-process native codecs; the refusal ceilings are not an approved server memory
or latency envelope. Recovery requires local filesystem locks, absent-only hard
links and file/directory sync semantics. Functional interrupted-copy tests do not
qualify power-loss durability or other platforms/filesystems.

## Remaining room coordination

The completion barrier covers these two server stores, not every participant's
native history, selected packet stores, pending upload state, relay registrations,
extension assets or current provider mappings. Those still need authenticated
participant inventory, a trusted host recovery catalog and resumable client/server
activation. A host must reconcile current accounts and roles before exposing
historical permissions. Old connection leases remain absent; authenticated clients
resume explicitly. Restoring server files does not grant an old account token or
reacquire cross-device writer authority.

The approved cross-generation Undo/Redo and outstanding offline-edit bridge
remains required. This archive neither compacts accepted history nor resets it,
and it does not establish V1 readiness. Original router constructors, routes,
authentication format, native data families, ordinary startup and package versions
remain unchanged.

The [joined server checkpoint](qualification/2026-10-19-server-room-recovery.json)
records the frozen native/script/SDK checks, seven interruption cuts, real private
host capture and public recovery with fresh account authentication and future
peer-preserving offline history.
