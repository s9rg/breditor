# Server raster store backups

The Rust reference relay can archive every immutable raster record in an owned
asset directory and restore its exact original files through an explicit,
resumable attempt. This is the server raster component of room recovery. It does
not activate a service, restore account authentication, recover client upload
queues or coordinate the other room stores.

## Capture and trusted selection

`AssetStore::export_backup(&mut self)` reads the complete live inventory under
the store's held lock. It includes complete unreferenced assets retained for
history and offline work. It rejects uncertain writes, pending or unknown files,
missing records, symlinks, changed metadata and native raster decoding failures.
Export neither cleans staging files nor changes the original manifest, receipt
or storage counters. On Unix it also checks that the lock pathname still names
the held inode. The host must exclusively own the directory and must not replace
its files or parents behind a live owner.

`AssetStore::open` now retains the directory's canonical absolute path. Later
process working-directory changes or retargeting an original parent symlink
cannot redirect the retained owner's reads or writes into another room.

`AssetStoreBackup::from_bytes` admits the complete bounded archive, original
manifest and original asset records before any destination is created. It checks
the actual PNG, JPEG or WebP encoding, geometry and full native decode using the
ordinary upload admission path. Original record metadata and manifest bytes are
preserved even when their valid JSON uses whitespace or another property order;
the independent archive header is canonical. Ordinary stored-file reading keeps
its existing meaning rather than silently adding this stronger archive admission.

Retain `backup.info().identity` independently in trusted host recovery metadata.
`AssetBackupIdentity` pins the room's seed-bound asset namespace, complete file
SHA-256, asset count and encoded raster byte count. Never choose the expected
identity from an incoming archive. A valid alternative file with the same room,
counts and raster payloads still differs if its original files differ. Checksums
detect corruption and bind selection; they grant no account or provider authority.
For coordinated recovery, this binding must equal the independently selected
`RoomBackupIdentity.asset_binding` from the [server log](SERVER_ROOM_BACKUPS.md).

## Prepare resume and finish

```rust
use breditor_collab_relay::assets::{
    AssetRecoveryPolicy, AssetRestore, AssetStoreBackup,
};

let backup = assets.export_backup()?;
let expected = backup.info().identity; // Save separately in trusted host configuration.
let bytes = backup.to_bytes()?;

// Fence the original deployment and reacquire current host authority separately.
let admitted = AssetStoreBackup::from_bytes(&bytes)?;
let attempt = AssetRestore::begin(
    destination, &admitted, &expected, AssetRecoveryPolicy::HostReacquired,
)?;
// Inspect attempt.progress(&admitted), or retain destination and drop the attempt.
// On a later invocation, use AssetRestore::resume with the same independently selected identity.
let ready_assets = attempt.finish(&admitted)?;
// Activate only after every other component passes the room coordinator's recovery barrier.
```

`begin` requires an absent directory name under an existing host-owned parent.
Existing files, directories and live or dangling symlinks are occupied, including
empty directories. Ambiguous names ending in a separator, dot or parent component
are refused. The parent is resolved once. Unix directory and file creation request
modes 0700 and 0600. A held exclusive lock and synced, canonical `.restore.json`
marker identify this attempt and selected archive. No raster is copied yet.
`HostReacquired` is the host's acknowledgement, not automatic deployment fencing.

`finish` validates the destination before writing. It appends only to exact
byte-prefix staging files named by this attempt; it never truncates divergent
bytes. A synced complete staging file is hard-linked to its absent original
record name. An existing exact final record is revalidated; a different one is
refused. The original manifest is published only after all records are complete.
Only fully verified staging files belonging to this attempt are removed. The
marker is retired last, the complete files and directory are synced, and a ready
`AssetStore` returns while retaining its exclusive lock. Exact retries preserve
the original count and byte budget.

Dropping or failing an attempt releases its lock without deleting its directory,
marker or copied work. `resume` rechecks the independent selected identity, marker,
all complete records, every staging prefix and the entire directory inventory.
Unknown files, symlinks, invalid markers and divergent bytes remain untouched and
cause refusal. A manifest with missing records and an unmarked incomplete store
cannot be adopted. An exact already-completed store can be revalidated and adopted
without rewriting its bytes, including after an uncertain completion response.
Concurrent attempts cannot replace one another or bypass a held lock.

Failure during initial directory, lock or marker creation can leave a known path
without a valid marker. No payload has been copied at that point. Preserve and
inspect it; do not delete it, manufacture a marker or reset it to force a retry.
Failure after linking can leave complete final files even without an acknowledged
result. Retain the selected archive and use explicit resumption. This is not an
atomic directory swap: the host must keep the recovery destination inactive until
the ready return and the wider coordination barrier both succeed.

## Independent framing and unchanged limits

The file starts with the 17 bytes `BREDITOR-RASSET1\n`, a four-byte big-endian
header length and a 32-byte SHA-256 of that header. The fixed prefix is 53 bytes.
The canonical closed JSON header identifies `breditor/relay-asset-backup` version
one, room binding, total payload bytes, the original manifest section and sorted
unique original record sections. Each section carries an exact body-relative
offset, byte length and SHA-256. The body contains the original manifest followed
by those exact records, with no gaps, overlap, omitted or trailing bytes.

The header is at most 1 MiB and the original manifest at most 4,096 bytes. Existing
limits remain 1,024 assets, 256 MiB of encoded raster bytes and 10 MiB per asset;
each original record allows its existing 44-byte prefix and 4,096 metadata bytes.
`MAX_SERVER_ASSET_BACKUP_BYTES` adds only those bounded framing costs. Export,
admission and restore use bounded in-memory copies and in-process codecs. These
ceilings are not a qualified memory or latency operating envelope.

The protocol requires the local filesystem's exclusive locks, absent-only hard
links and file/directory sync semantics. Functional interruption and collision
tests do not qualify power-loss durability or other filesystems and platforms.
Archives contain private raster data and are not encrypted or a per-account
download route. No backup endpoint, garbage collector, counter increase, original
disk-format revision or default startup change is installed.

## Remaining room coordination

Server log and raster archives remain separate from
[selected client source bytes](SELECTED_ASSET_BYTES.md),
[dependent client stores](RETAINED_STORE_BACKUPS.md), whole client upload-state
archives, authenticated participant inventory and current provider/writer
authority. The [joined server layer](SERVER_ROOM_RECOVERY.md) now captures and
resumes the two server components behind one native completion barrier; client
participation and room-wide activation still need their coordinator. The approved cross-generation Undo and offline-edit bridge also
remains separate required work; copying these files does not extend the current
bounded document lifetime or establish V1 readiness.

The [server raster checkpoint](qualification/2026-10-19-server-asset-backups.json)
records the frozen native, script and SDK checks, exact failing-before-repair
owner-path evidence and public room/raster recovery with future offline history.

## Continue a full raster archive

A native host can stream the original store through `AssetStore::write_backup`,
sync the output, and independently retain the returned `AssetBackupIdentity`.
`ContinuedAssetStore::create_from_backup` validates that archive and selects a
new private directory. The complete original archive becomes a read-only
predecessor and a separate active store starts empty. Each retains the existing
per-store bound of 1,024 assets and 256 MiB of encoded raster bytes. The active
store has a derived storage binding. The original room's content IDs and
public raster binding apply across both generations.

Reads verify the selected predecessor or active bytes. An exact predecessor
upload retry returns the ordinary duplicate receipt and leaves the active
budget available. A new asset is published by the ordinary active-store
durable upload path. `Room::read_continued_asset` and
`Room::put_continued_asset` check the room binding and current principal
permission. The host supplies the authenticated principal.

Keep the local `ContinuedAssetStoreIdentity` separately from the directory.
Cold open validates its selected directory, predecessor, active lock and
manifest before using it. This local filesystem custody relies on the
existing Unix inode checks. The derived active binding makes an ordinary
room-bound open of just that directory refuse. An incomplete new destination
stays private. Retry creation at another absent path.

For portable restore, `ContinuedAssetStore::write_backup` streams two files
under one continued owner. Sync each output and retain the returned
`ContinuedAssetBackupIdentity` independently. In revision one the first file
is the original predecessor archive. After rollover the first file is the
ordered pack of immutable archives. The second file always selects the exact
active cut. `ContinuedAssetStore::restore` verifies each archive and refuses
overlapping asset IDs before creating a new local directory. Preserve the
new local selection for later cold opens.

### Roll over a full active generation

`ContinuedAssetStore::rollover_from_backup` verifies the exact retained and
nonempty active archives, then creates a separate private target. It copies
the old archives byte for byte, appends the original active archive and opens
an empty writable store. Revision two selects each archive's exact length,
binding and digest in order. The relay reads the carried archives through a
single held descriptor. It preserves the original room binding, image IDs
and duplicate-upload receipts across all the retained generations.

For a combined native capture, call
`ContinuedRasterRoomBackupFiles::restore_rolling_raster_generation` with
the absent target path, a fresh native generation ID and independently
retained client originals. It accepts the same optional list of missing
images to stage from those originals. The selected staged bytes use the
fresh writable store. Earlier images remain readable from the retained
pack. Both live takeover and portable activation require the ordinary
input reconciliation and the approved deployment transition. A portable
seal selected for rollover binds that rollover decision and the exact staged
IDs across relocation.

Save the original archives and the resulting selection independently.
A completed rollover can be recaptured and rolled again. The format holds up
to 64 immutable archives behind one active store, with the existing per-store
count and byte limits. Each preparation needs disk space for a complete copy
of its retained pack. Preparation writes into the new target. The host seals
or activates through the deployment authority described below.

### Serve a continued store from the reference relay

`router_with_continued_assets_and_deployment_lease` attaches an explicitly
selected native room and continued asset store to a current serving lease.
The normal HTTP raster routes authenticate reads and uploads across all
selected generations and use the existing content IDs and receipts. Room operations check continued asset
custody under the same lease. On restart, retain the current authority
selection and reopen the original native room and exact local asset
continuation before attaching the approved replacement lease.

`ContinuedAssetServerHandle::capture` verifies the current owner credentials
and holds the room, raster owner and serving permit through capture. It writes
the physical native archive and checkpoint together with the retained and
active raster files. Keep the returned `ContinuedRasterRoomBackupIdentity`
independently and retain any earlier native segments and client inputs.
The combined capture is a storage identity. Coordinated takeover still requires
verification of the complete room and its client/provider inputs.

### Restore a combined capture on a fresh relay host

Keep the capture directory private, with its `.owner` marker and all four
files. Copy it to the recovery host along with the separately retained
`ContinuedRasterRoomBackupIdentity`, any required native predecessor
archives, and independently pinned client originals. Keep these sources
immutable while they are in use. Open the capture with
`ContinuedRasterRoomBackupFiles::open`. The native archive and checkpoint
must match the selected physical cut. The retained and active raster files
must match the selected archive identities and original room binding.

With `restore`, select an absent destination and a fresh native generation
ID. Include the original client journals, alternate participant files and
upload queues as companion inputs. Any original referenced by an already
published recovered discussion is required. The restore keeps selected queue
states, payloads and receipts in the original client files. Ordinary restore
preserves the layout, contents and limits of the captured raster generations.

After all owners and selected client files are synced, the restore commits
the local completion record. Store the returned
`RecoveredContinuedRasterRoomIdentity` separately. On restart, open the
original capture again and call `reopen` with that local identity. An
incomplete target, a substituted local owner or an advanced native or raster
cut refuses reopening. Preserve an interrupted attempt and retry to a new
absent path.

The host can inspect the reconstructed room, read images across its captured
generations, and export the selected client originals before serving. Authenticated
takeover still requires complete client and provider reconciliation, a fresh
operator decision and the deployment authority's epoch transition.

### Verify the restored room's inputs

Call `RecoveredContinuedRasterRoom::verify_recovery_inputs` with the original
owner's authenticated account, their separately protected registration records,
and the current raster provider guard. The verifier checks the completed
restore's custody, reads the native participant roster, and compares the
selected document and review journals to the accepted histories. The report
includes missing originals for registered streams, independently retained
alternate branches, and the writers whose original upload queues are absent.

The relay collects image references from retained native records and the
selected client journals, including bindings still reachable by Undo and Redo.
It checks the provider's generation-exact mappings and reads and admits the
actual bytes from the retained or active raster store. A required image held
only in a retained client queue appears as missing live bytes. The queue keeps
its original upload state and receipt history.

The detached report's `inputs_complete()` result describes the inspected cut.
Keep the room unserved pending fresh reconciliation at the approved deployment
transition. Bind any future use of this report to its exact local restore and
trusted capture selections.

### Stage selected images required for recovery

When reconciliation reports missing live bytes, select the required canonical
content IDs in sorted, unique order. Call
`ContinuedRasterRoomBackupFiles::restore_staging_client_rasters` with that
selection, the original client archives, and a new absent target. The payloads
must exist in the selected standalone upload queues or participant originals.
An ID from any captured server generation is already available and is
refused as a staged addition. The active generation's existing limits apply to
the combined captured and staged contents.

The resulting completion record binds the exact additions and the new active
raster cut to the original room capture. Cold reopening verifies all captured
active records and the exact additions. The selected client files are retained
byte-for-byte, so uploads keep their original states and receipts. The restored
native document keeps its accepted cut while the client history retains work
such as an offline Redo that needs one of the staged images. Run the normal
input verification on the new target before selecting it for takeover.

### Approve a live takeover and restart the selected room

Store a `ContinuedRasterActivationApproval` from the verified input report
separately from the restored room. Keep the protected resume records and
current image provider guard available. While the source is still serving,
call `ContinuedAssetServerHandle::activate_recovered_room` with the saved
decision and the authenticated original owner. The replacement account
configuration must authenticate that same owner.

Under the exclusive deployment permit, activation verifies the exact target,
recomputes the input report, and checks the live source's native cut and both
raster archives. A newer source edit or upload changes that cut. The relay
then checks the current image mappings and commits the exact successor epoch
to the independent authority journal. Its serving owner retains the restored
room's selected and alternate client originals. The earlier lease is retired
and the earlier relay's requests refuse.

If activation committed before its response or before the new listener
started, reopen the authority with `RoomDeploymentAuthority::open_at_least`
using the separately retained decision's planned selection. To restart later,
use the last independently retained serving selection. Call
`ContinuedRasterRoomBackupFiles::restart_activated_room` with that authority,
the exact same approval and the original owner credentials. It checks the
approval's committed epoch in the authority ledger, reopens the same restored
owner and its later complete native and raster work, and commits a fresh epoch.
A torn native tail requires a separate explicit recovery path.

### Seal a portable cut before source shutdown

For a room whose authority uses coordinated recovery, verify a preflight
restore while the source is still live. Persist a `ContinuedRasterSeal`
from that complete report separately from the room files. The decision binds
the native capture, both image archives, the original client files and the
resolved image mappings. Keep the validated backup and its required parent
archives open and call `ContinuedAssetServerHandle::seal_recovered_room`
with the authenticated original owner and freshly verified inputs. The
exclusive authority permit serializes this check with source reads and
writes. Committing the seal retires the old lease and leaves the room offline.
Query `ContinuedRasterSeal::status` after an interrupted reply.

Keep the independently saved seal and authority selection. Relocate the four
capture files, any required native parents, and the exact selected client
originals. Restore into a new absent directory and verify the inputs there.
Select a `ContinuedRasterActivationApproval::select_sealed` for the new target
and retain it separately. Reopen the actual authority with
`RoomDeploymentAuthority::open_at_least` against the sealed epoch. Then
activate through `RecoveredContinuedRasterRoom::activate_sealed_room` with
fresh credentials, mapping checks and the same seal. The new directory has
its own completion pin. The old host and its live directories can be offline
during this step. Cold restarts after activation use
`restart_activated_room` with the new approval and retained serving epoch.

### Inspect and repair an interrupted native write

Retain the latest independent complete room capture and exact serving
selection. When a committed room has an incomplete final native frame,
ordinary restart refuses. Reopen the same authority using
`RoomDeploymentAuthority::open_at_least`. With the authenticated owner
and the same activation approval, call
`ContinuedRasterRoomBackupFiles::inspect_activated_native_tail`. Supply
the retained complete capture as the minimum accepted native history and
an absent evidence directory outside the room. Inspection replays the
complete record chain, verifies that the minimum cut is retained and
writes the incomplete bytes to `suffix.bin`. Keep the returned plan
independently from both the room and that evidence file.

Call `repair_activated_native_tail` with the same serving selection,
saved plan and preserved suffix. It checks the original active WAL inode,
physical head, complete native cut, inspected raster cut and exact suffix
before removing the incomplete bytes. It synchronizes and checks the
complete cut before releasing the deployment lock. An interrupted repair
can retry with the same plan and evidence, including after truncation
already reached disk. Use the normal restart afterward with the same
serving selection.

The minimum capture protects the native history recorded at that cut.
The repair compares the active raster state to what inspection observed.
Pending raster staging and an unfinished native rotation require their
own recovery. Preserve those files when this repair refuses.

### Recover one interrupted image upload

Restart of an activated continued room refuses pending raster staging and
leaves the files in place. With the authenticated owner, retained serving
epoch and independently saved minimum native cut, call
`inspect_activated_raster_upload`. This inspects one pending upload and
preserves its exact bytes in `raster.bin` outside the room. If the native
log also has an incomplete final record, the same plan preserves it in
`suffix.bin`. For a complete log, this evidence file is empty. Save the
returned plan independently from the room and both evidence files.

Call `repair_activated_raster_upload` with the exact plan and both files.
It verifies and syncs the evidence, compares the accepted log and raster
cut, repairs the incomplete native bytes first, and removes the verified
staging name. If an image already has a final name on the same inode,
that published image stays in place. Unpublished bytes stay in the evidence
file and the client can retry the original upload. The same plan can resume
after an interrupted repair or synchronize the already-complete cut. Use the
retained serving selection for an ordinary restart after repair.

Multiple pending uploads and staging files with unrelated hard links
require separate recovery. When a log rotation is pending, use the rotation
inspection below and preserve the files if it refuses.

### Finish an interrupted native rotation

The current owner can seal the active WAL with the trusted-host
`ContinuedAssetServerHandle::rotate_log_generation` operation. It keeps the
original native sequence and accepts an exact retry under the same serving
permit.

Ordinary restart preserves a pending rotation for explicit recovery.
Call `inspect_activated_native_rotation` with the authenticated owner,
committed serving selection and independently saved minimum. The relay
replays the complete linked history and checks its accepted digest at the
minimum. Inspection saves the observed rotation files in `rotation.json`
outside the room and saves `raster.bin` if one image upload is also pending.
Keep the plan and evidence apart from the operating room.

Call `repair_activated_native_rotation` with the saved plan and exact
evidence. The relay verifies the current phase and syncs the evidence before
writing. It checks the selected successor manifest, empty WAL inode and
unchanged absolute event cut before retiring any image stage. A published
image stays at its original name and inode, and unpublished bytes remain
available in the evidence. Use ordinary authenticated restart after success.

If a retry finds a different phase with the intent still present, inspect
that phase and retain its evidence alongside the earlier plan before applying
it. If the intent was already retired, the same plan can verify and sync the
exact successor and finish the remaining image stage. A newer edit, replaced
successor, incomplete active frame or unrelated pending work refuses.
