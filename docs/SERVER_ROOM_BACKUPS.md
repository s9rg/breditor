# Server room log backups

The Rust reference relay can capture an exclusively owned room's exact durable
log and restore it to an absent file after native replay. This adds a server
component to coordinated recovery without changing original log events, profile
selection, writer IDs, receipt order or default room startup. It introduces no
network endpoint, compaction or generation rollover.

The archive retains accepted document history, account roles, writer credential
digests, review metadata, version packets, proposals, revision transactions and
final decisions already in that log. Ephemeral leases and presence are not in the
log. Client Undo stacks, unsent offline work, raster-store files and the host's
account-authentication configuration remain separate recovery components.

Explicit [native history boundaries](SERVER_NATIVE_HISTORY_GENERATIONS.md) now
add typed `NativeHistoryBoundaryV1` records. Complete log replay retains the
document/comment archives, private effect-author history and original boundary
receipts alongside earlier accepted work. Existing outer backup framing and
log bounds stay unchanged. An older reader that does not understand the new
event must refuse it, not omit the boundary or flatten its retained history.
These records do not implement physical log rotation.

## Capture through the live Rust owner

```rust
use breditor_collab_relay::{Room, RoomBackup, RoomRecoveryPolicy};

let identity = room.backup_identity()?;
let backup = room.export_backup()?;
let encoded = backup.to_bytes();
// Retain identity, including its selected log cut, in trusted host configuration.
// Store encoded bytes using the host's backup retention and access policy.

// Stop and fence the original service before activating any replacement.
drop(room);
let admitted_file = RoomBackup::from_bytes(&encoded)?;
let restored = Room::restore_backup(
    destination,
    &admitted_file,
    &identity,
    RoomRecoveryPolicy::HostReacquired,
)?;
```

`export_backup` requires exclusive mutable access to the existing `Room`, which
already holds its file lock. It reads only that room's durable log, verifies
complete original record integrity and lineage against the live owner's current
record count and terminal digest, and restores the append cursor. It appends no
event, acknowledges no work and changes no receipt or native state. A later edit
does not change the captured archive. Poisoned, incomplete or externally changed
logs refuse export and require ordinary recovery instead of being presented as
complete backups. The host must not bypass the room's exclusive lock or replace
its live file.

`RoomBackup::from_bytes` performs bounded transport and original log-integrity
admission without filesystem writes. Its private immutable payload cannot be
edited after admission. `info()` returns detached family/version, log length,
record count and SHA-256. A correctly checksummed log may still be semantically
invalid; only the later matching native replay proves room validity.

## Select the original room independently

`Room::backup_identity()` returns the original native document ID, immutable owner,
seed-bound asset namespace, exact profile/standard-inline choice and explicit
writer transport version. That namespace includes the original configuration
and initial journal, so another profile or genesis is not silently adopted.
The identity also pins the complete durable record count and original terminal
record digest; the existing hash chain commits all preceding original records.
Keep this selected cut in trusted host recovery configuration, independently of
the file being restored. Never derive the expected cut from incoming bytes.
A room with uncertain storage cannot issue it.

Restore checks the selected log cut before filesystem writes, then compares the
fully replayed room against every host-selected identity field before publishing.
Another same-count valid log with the same genesis but different recorded events
cannot replace that selected history, even with correct new checksums. Other
identity mismatches remove only the attempt's private staging file. The identity
is not a credential, a live-source guard or proof of the globally latest room
state. The host still chooses the intended recovery point and protects its
separately retained recovery metadata. Capture identity and bytes under the same
serialized owner; an intervening host mutation requires a fresh matching capture.

`HostReacquired` acknowledges that the host has fenced the original deployment and
reacquired its authority. It does not perform cross-deployment fencing. Reconcile
current account access before exposing a restored service: a historical role
record is not evidence that an account should still have access today. Existing
client resume credentials remain separately held by their authenticated accounts;
restore does not issue replacements or grant access from a checksum.

## Replay before publishing an absent destination

The destination must name a file in an existing host-owned directory. Its parent
is resolved once to anchor the operation; later process working-directory changes
do not redirect staging, publication or cleanup. An existing file, directory or
symlink, including a dangling symlink, is occupied and cannot be replaced.

Restore creates a unique private staging file beside the intended destination,
writes the exact original log and syncs it. Ordinary `Room::open` then acquires its
lock and replays every seed, role, native operation, receipt, review/version event
and suggestion transaction. No partial tail is repaired in a backup. Transport
integrity alone cannot bypass semantic replay or host identity matching.

Only after successful replay and identity matching does an atomic hard link
publish the already locked inode at the absent destination. The parent directory
is synced before success is returned. Concurrent attempts cannot overwrite one
another; a racing unrelated file also remains untouched. Unix staging files
request mode 0600. The returned room retains its exclusive lock across publication.
Old document and review connection leases stay absent; authenticated clients must
resume explicitly before authoring again.

Failure never removes or overwrites the destination. If linking succeeded but a
later directory sync failed or the process stopped, a complete destination may
already exist. Inspect and open it, check its original identity and exact selected
archive, and resume the wider recovery procedure. Do not delete it to force a
retry. Before publication, cleanup targets only the attempt's unique staging name;
a crash can leave that private staging file for host inspection. The protocol
requires local filesystem lock, hard-link and file/directory sync semantics.

A complete but uncommitted revision preparation is still inert after replay;
archiving it does not invent a final revision. An exact later retry follows the
original two-record commit contract. Already finalized decisions and publication
receipts remain original, so retries neither apply Accept twice nor append a
second acceptance.

## Independent binary format and original bounds

`breditor/relay-room-backup` version one uses the 16 ASCII bytes
`BREDITOR-RELAY1\n`, an eight-byte big-endian log length and a 32-byte SHA-256 of
the following original log. The fixed prefix is 56 bytes. Declared and actual
length must agree exactly; unknown magic, extra/missing bytes, bad checksums,
invalid original record lineage and incomplete tails reject.

The original 256 MiB log, 20 MiB record and 4,096-record ceilings remain intact.
The archive ceiling is 256 MiB plus 56 bytes. Export and decoding are bounded
in-memory operations; these limits are refusal bounds, not an approved server
memory or performance envelope. The original log decoder is shared with ordinary
open, preserving its existing torn-tail recovery semantics outside this stricter
archive path. No old data family or startup default is reinterpreted.

The writer and reader share a [qualified private frame codec](qualification/2026-10-21-log-continuation-framing.json).
Original serialized bytes remain pinned by a pre-refactor golden vector.
Explicit continuation framing preserves a separately selected preceding global
cut, but this original backup and `Room::open` reject it. A complete directory
backend, durable physical rotation and multi-file archive remain separate work;
the continuation decoder alone is not a complete room or native replay proof.

## Coordination still required

This file contains private accepted text, deleted history, permission metadata and
credential digests. It is neither encrypted nor a new authentication grant. It
must not be served as a per-account document export or added to a public endpoint.

Capture [client source and raster bytes](SELECTED_ASSET_BYTES.md),
[offline dependent stores](RETAINED_STORE_BACKUPS.md), whole client upload-state
archives and the server's immutable raster directory under the room coordinator's
consistency contract. Preserve the separately authenticated account configuration
and current provider authority through host-managed recovery. Independent
component restores are not a room-wide transaction.

The separate [server raster archive](SERVER_ASSET_BACKUPS.md) now captures original
immutable files with native admission and explicit resumable restoration. It is
not part of this log file or an automatically activated room transaction.

Complete participant capture, resumable multi-store activation and
the approved cross-generation Undo/offline history bridge remain required for V1.
No crash, quota, eviction, cross-platform filesystem or performance qualification
is implied by the functional tests of this server-log component.

The [server-log checkpoint](qualification/2026-10-19-server-room-backups.json)
records the final frozen 20-check selection, fresh native suite totals, exact
selected-cut refusal, peer-preserving offline history and public full-lane recovery.
The earlier passing selection is retained separately because it preceded the
trusted-cut guard and peer-text drill; it is not the final contract qualification.
