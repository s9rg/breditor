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

For portable restore, `ContinuedAssetStore::write_backup` streams two ordinary
archive files under one continued owner. Sync each output and retain the
returned `ContinuedAssetBackupIdentity` independently. The first file is
the exact predecessor and the second file selects the exact active cut.
`ContinuedAssetStore::restore` verifies both, checks for overlapping asset
IDs, and selects a new local directory. Preserve its new local selection
for subsequent cold opens.

This contract covers one predecessor and one active generation. Relay
HTTP routing and authenticated whole-room activation still need to
select this storage family and verify both generations alongside the
native document and retained client inputs.
