# Server log generations

Breditor's reference host has a separate, opt-in Unix storage layout for retained
server log files. Physical rotation, archive/restore and offline migration
preserve global event positions and native histories. Rotation retains all
files within the layout's capacity bounds.

## Explicit selection and bounds

`Room::create_log_generations` selects legacy writer transport;
`Room::create_atomic_log_generations_v2` selects atom-lineage transport. Each
requires the exact original native compiler and two distinct generation IDs.
Native validation precedes creating an absent private directory.
`Room::open_log_generations` is its only room reader. Original constructors,
framing and backup formats keep their meanings and limits. In a newly created
room every WAL, including the sequence-zero seed, uses continuation framing.
In an offline migration only the sealed legacy root retains original framing.
The manifest version selects the layout.

This layout retains at most 64 WAL files including its seed root and current
active file, and 512 MiB of WAL bytes in total. Each file retains the original
4,096-record and 256 MiB ceilings; a record retains its 20 MiB ceiling. Controls
are canonical, versioned JSON, at most 128 KiB each and 8 MiB for the immutable
manifest lineage. These are finite retained-lifetime bounds, not a pruning policy
or a change to the separate native Undo-item and journal limits.

## Move a saved original room into generation storage

Persist the original backup and retain its exact selected identity in trusted
host recovery configuration. Choose fresh root and continuation IDs. Pass those
values to `RoomBackup::prepare_generation_migration` for the native log or to
`ServerRoomBackup::prepare_generation_migration` for the log and raster store.
The joined operation consumes the in-memory backup so it can move the raster
archive intact without another full raster allocation.

Preparation writes no storage. It retains the exact original WAL as the sealed
root in manifest version 2. The empty continuation starts at the original
record count and terminal digest. Every later WAL uses continuation framing.
Rotation preserves the root and its manifest version. Existing manifest
version 1 continues to select continuation framing for its root. A reader
that supports only version 1 refuses a migrated manifest.

Save the resulting archive and its selection, then call
`ServerLogGenerationRecovery::begin` or
`ServerLogGenerationRoomRecovery::begin` with an absent destination. Call
`finish` to replay the original room and verify the trusted identity before
publishing readiness. After interruption, call the corresponding `resume` with
the same archive and selection. Existing durable receipts retain their original
positions and the ordinary client reconnect path admits outstanding edits
under fresh leases. The joined archive retains every raster, including
unreferenced files.

The host supplies the deployment fence and reacquires current account
authority. Client journals, upload queues, provider reconciliation and
whole-room activation retain their own contracts.

## Physical ownership and rotation

The host owns a private directory and an exclusively locked instance marker.
Content-addressed immutable manifests retain every closed file's exact byte
digest, global cut and predecessor. A separate physical head selects one
manifest; readiness pins the initial manifest. A descriptor is detached metadata,
not account authentication, a backup, or deployment authority.

Only the current owner can request `rotate_log_generation`. A nonempty active
file seals without appending a semantic event. Exact lifetime-ID retries return
their original physical receipt even after later heads and cold recovery.
Full active files rotate automatically through the same path. A two-record
suggestion revision remains globally adjacent across the physical boundary.
The relay checks capacity for both records before writing either one. When
the remaining log space cannot fit the pair, the original suggestion stays
pending and the log remains available for an operation that fits. An actual
write failure after the first append still requires recovery.

Rotation syncs an owned empty continuation and a durable intent before linking
its final name, publishing the immutable manifest, and replacing the head. The
intent binds the actual staged inode, so cold resume cannot adopt an unrelated
occupied continuation, even if it is empty. Normal cleanup removes only the
intent's exact owned aliases. Bounded unpublished stages are retained, never
silently admitted as history or scavenged. Unknown directory contents refuse.

A new rotation requires space for its continuation and one staged metadata
file. This preflight also runs before either record of a suggestion revision
that needs rotation. A staging-capacity refusal leaves the selected room usable
for operations that still fit its active WAL. Pending rotation recovery checks
for a free staging slot before publishing any missing metadata. At capacity
it can finish linking the exact continuation selected by the durable intent,
sync its final WAL name, then retire that intent's temporary alias to free
one slot. A cold retry after that unlink opens the same inode through its
final name. If another interruption fills the reclaimed slot, the existing
intent's nonce reserves one private control stage at a time, first for the
manifest and then for the head. Retry checks the exact expected byte prefix
before appending the remainder and syncing it. Every unrelated stage stays in
place. Divergent bytes, unexpected links, and invalid publication order refuse.
These temporary names require a relay that supports the recovery path while the
rotation is pending. A completed rotation uses the existing archive format.

Live guards check held inodes, path custody, lengths, controls and filesystem
change witnesses. A detected change permanently fences that owner until cold
recovery. Change witnesses are not portable identities or cryptographic proof;
cold opening verifies exact closed-file digests and all framing, then replays
the native room before completing an intent or trimming an incomplete active
tail. Rotation additionally rehashes the retained closed files and manifests.

## Read storage capacity before a room reaches its limits

The host can use `Room::storage_capacity` with the bound raster store and the
authenticated room owner. The live generation host also exposes
`LogGenerationServerBackupHandle::storage_capacity`. It holds the selected
deployment lease and both storage owners during the read.

The snapshot reports framed bytes and record headroom in the active WAL, total
retained headroom, available continuation file slots, and unpublished stages.
Sealing a partially used file spends a slot and gives up that file's unused
record capacity. A full staging inventory can prevent rotation while edits
that fit the active WAL remain available. Single-file logs report the same
headroom for active and retained records and have no rotation capacity.

Raster headroom counts unique complete assets and their encoded payload bytes.
The report checks the admitted inventory and room binding without reading all
raster payloads. Limits are independent and the snapshot reserves no space.
Filesystem free space, Native Undo and journal limits, and per-operation
admission still require their own checks.

## Complete file archives

`Room::export_log_generation_backup` requires current owner access and captures
the actual held source. `ServerLogGenerationBackup` has distinct framing and
retains every selected head, readiness marker, immutable manifest and WAL file,
including an empty active file. Bounded unpublished stages remain exact opaque
files, not accepted history. The instance ownership marker is not portable and
is excluded. Pending rotations, unknown work and incomplete active tails refuse.

The section table is canonical, uniquely named, ordered and gap-free. Each
section and the selected physical lineage is checked; trailing, missing,
overlapping, duplicate and checksum-valid inconsistent inputs refuse as a whole.
Archive admission is transport integrity, not native replay or authentication.
The new ceiling derives from 512 MiB of WAL, 8 MiB of manifests, 8 MiB of
unpublished stages, two bounded controls and a bounded envelope. Legacy archive
families and limits remain unchanged and reject the new framing.

Capture uses one backing buffer and borrows selected file handles. The streaming
integrity traversal discards each decoded record after checking its cut.
`from_owned_bytes` avoids copying the complete input; `write_to` avoids another
complete output copy. Native cold generation recovery streams records through
the native handlers. Peak recovery memory and elapsed time still require measurement.

## Native restoration and readiness

`ServerLogGenerationRecovery::begin` reserves an absent inactive directory with
an independently trusted archive identity and explicit `HostReacquired` policy.
The host must fence the old deployment separately. `resume` and `progress` check
the same selection and owned prefixes; neither silently adopts an occupied
destination, even when its bytes match.

An insert-only component selector binds the actual component directory and its
local ownership marker. Per-file inode intents sync before body writes. A final
hard link must name that actual staged inode; existing unrelated files are not
overwritten or adopted. Interrupted unselected empty data stages, bounded metadata
stages and pre-selector empty components remain preserved, not scavenged.

Readiness starts at a private prepared name that ordinary room opening refuses.
`finish` replays all native schema, roles, registrations, receipts, document and
comment history, review packets and private effect-author state, then matches the
trusted native identity. Only afterward can the held readiness inode move to its
public name and outer completion become durable. The returned
`RecoveredLogGenerationRoom` retains both actual owners; no router, provider or
uploader starts. Old connection leases stay absent; credentials resume under
current host-authenticated account permissions. Later accepted edits or a new
physical head make a historic restore attempt refuse, never roll the room back.

## Generation-bound native inventories

`log_generation_participant_inventory` uses a separate closed metadata family.
Its identity binds the complete archive digest and selected manifest, not only
document counters. All registered document/comment streams, including empty
observers and revoked accounts, remain present. The unchanged native declaration
is a detached nested component; extracting it cannot bypass the original
storage reader's native verification requirements.

Metadata checksums do not establish native state. `verify_native` recaptures the
actual held source; `verify_registrations` additionally matches every separately
protected original document/comment resume record. Missing inputs yield Pending,
never a partial proof. Wrong supplied secrets refuse. A non-deserializable
`VerifiedGenerationRecoveryRegistrations` is bound to the entire source and must
be rechecked against the current owner. Ephemeral resume does not stale it, but
a physical rotation or changed unpublished stage does, even at unchanged native
counters. Verification revives neither a revoked grant nor a connection lease.

`log_generation_retained_asset_references` also binds that exact archive. It
reads conservative native causal/effect history and every complete retained
version, proposal and revision preparation, including rejected, superseded and
abandoned packets. One fallible packet traversal spans the physical files, so a
Prepare/Commit pair retains its ancestry across a boundary. The traversal does
not collect another decoded-record copy; its output remains private until the
whole read succeeds. Missing dependencies yield whole Pending, not partial Ready.
The complete 100,000-pair and 8 MiB result bounds remain enforced.

Both reads require current owner access and capture/recheck the full source
around native reads. Two large archive buffers are not retained together. This
is bounded maintenance work, not an incremental hot-path or performance claim.
Original methods still refuse the physical layout, and these explicit methods
refuse original storage without poisoning an otherwise usable original owner.

## Remaining release work

The layout requires a cooperative local Unix filesystem with working locks,
hard links, atomic rename and file/directory sync. A private directory lease is
not cross-device fencing. Physical power-loss and other-host qualification stay
open. Failed initial creation may leave an unready private directory; use a new
destination rather than overwriting it.

Original-only backup, participant, retained-reference and joined raster-recovery
readers still refuse this layout. Explicit generation-aware native participant
and retained-reference readers are available. The separate
[joined server recovery](GENERATION_SERVER_ROOM_RECOVERY.md) additionally retains
actual raster bytes and supports a distinct durable operational handoff and cold
reopen of that continuing joined directory. Host/catalog integration and
provider/client reconciliation are not supplied by native inventories or
archives alone.
The log archive excludes actual raster bytes and clients' offline journals.
Complete component/source/provider closure and authenticated whole-room
activation remain required; valid saved bytes alone cannot grant a second live
deployment authority.

The functional regressions use the actual native room and filesystem. They cover
all ten profile/transport choices, two manual cuts, two automatic capacity cuts,
eight interrupted rotation prefixes, native offline edits and future Undo/Redo,
exact historical retries, revision adjacency, and non-mutating refusal of forged
or occupied recovery targets. These controlled prefixes are not physical
power-loss certification. Native restoration adds thirteen actual interruption
prefixes, all forty independent document/comment family combinations, old offline
inputs, peer-preserving history and mixed heading/table/caption owned acceptance.

The [storage qualification](qualification/2026-10-21-server-log-generations.json)
passes 251 relay, 142 no-networking and 1,331 script cases on frozen source, with
three existing opt-in skips. Four positive before-failure assertions remain
unchanged. Exact non-relay inputs and normal runtime/package bytes carry the
prior core qualification; core suites and Wasm producers are not rerun here.

The subsequent [native archive qualification](qualification/2026-10-21-server-log-generation-archives.json)
passes 270 relay, 161 no-networking, 66 candidate-runner and 1,331 script cases on
one frozen source. Strict linting in both feature configurations and strict
rustdoc pass. A reproduced descriptor-exhaustion case now passes with its
positive assertion unchanged under the same isolated 192-descriptor limit at
the maximum 64-WAL layout. No parent process or Mac limits were changed.
The unchanged core/runtime qualification is carried explicitly rather than
reported as a new build or whole-plan run. All thirteen V1 gates remain open.

The subsequent [generation-reader qualification](qualification/2026-10-21-generation-native-readers.json)
passes 286 relay, 176 no-networking, 66 candidate-runner and 1,331 script cases
on frozen source, with strict linting in both feature configurations and strict
rustdoc. Public consumers retain genuine offline Undo across exact native
restoration in all ten profile/transport choices. The participant matrix covers
all forty independent document/comment families. Historical asset regressions
retain deleted bindings, rejected proposals and abandoned preparations, including
committed revision ancestry spanning physical files. Both complete readers pass
at the 64-WAL ceiling under an isolated 192-descriptor limit. Core/runtime/package
evidence is explicitly carried, not reported as a fresh whole-plan qualification.

## Reclaim physical bytes from a sealed WAL

Call `Room::pack_sealed_wal` with the authenticated owner and the ID of the
root or a sealed continuation. A serving original relay exposes the same
operation through `LogGenerationServerBackupHandle::pack_sealed_wal` under its
current deployment lease. The active WAL stays writable in raw form. Calling
pack on an already packed WAL returns its held physical size. A WAL that would
occupy at least as many bytes after packing keeps its raw representation.

A packed file uses the `BRWALGZ1` marker followed by one gzip member. The
manifest retains the original length, SHA-256, starting sequence and terminal
digest. The reader bounds decoded bytes by the original length and verifies
the digest and entire compressed member, including its trailer. Portable
backups contain the original raw WAL bytes, so packing preserves existing
backup identities and older readers can restore a portable backup. Install a
packing-aware relay before opening a live directory that contains packed WALs.

Under the exclusive room lock, the relay creates a private stage, syncs the
encoded bytes, decodes and verifies them, then atomically renames the stage
over the selected raw file and syncs the directory. Both representations
commit the same history. An interrupted pre-rename stage is outside the
portable archive and can be cleared by a subsequent packing call. The relay
checks that each stage it removes is a private unaliased file. A replacement
whose durability is uncertain requires cold reopen before another write.

This reduces the storage occupied by sealed WALs. The manifest and record
budgets still count original history bytes, and the relay still replays the
original operations. Removing obsolete history while retaining old offline
inputs, Undo/Redo and receipt proofs remains a separate requirement.

Checkpoint `75e34281` passes the 53 generation tests, 20 live source-handle
tests and 11 native publication tests. The source and independently installed
provider workflows pack one sealed source WAL and the same WAL in the
restored room. Source capture produces byte-identical backups before and
after packing. The restored room publishes, survives a real relay restart,
and reconnects seven clients with outstanding offline work and durable
replies. Client storage uses controlled Node fixtures for this check.

## Stream native recovery from held WAL files

Cold generation open, joined backup restore, and operational reopen use the
same streaming replay. The relay acquires the directory and WAL locks, selects
the manifest, and scans the active WAL to establish its complete cut. It then
streams each sealed and active WAL through the existing native replay handlers.
Only one decoded source record is passed to the room at a time. The room holds
its rebuilt document, comment, review, and receipt state in memory as before.

Sealed WAL reads check the original byte count, digest, absolute sequence, and
terminal digest, including when a file is packed. An invalid record or changed
held file discards the private room. Rotation completion, torn-tail truncation,
and restore readiness follow successful replay and custody checks. Operational
inspection leaves the files intact.

This removes the recovery-time vector of decoded events. Recovery still replays
the retained history, and live state and portable archives have separate memory
requirements. The history bounds and durable receipts have the same meanings.

Checkpoint `3a51298e` passes 90 distinct Rust generation, sealed recovery,
and legacy backup tests. The source and independently installed provider
workflows each publish the recovered room and reconnect seven clients after
an actual relay restart. They verify offline delivery and the recovered
records for edits, comments, saved versions, suggestion decisions and
revisions, and uploads when durable replies are lost. Client storage in these
workflows uses controlled Node fixtures.

## Restore from a materialized checkpoint

After a physical rotation, while the new active WAL is empty, the relay owner
can call `Room::materialize_relay_checkpoint`. Store its bytes in private room
storage and retain `RelayCheckpointIdentity` independently in trusted host
recovery configuration. The identity names the exact original global cut,
physical manifest, and SHA-256 of the checkpoint. The bytes include document
and comment histories, the private suggestion writer, registered writer and
actor ownership, original receipts, and the version, proposal, and revision
catalogs with their literal packets. The snapshot contains credential hashes.
Connection leases and presence start empty on cold open.

`RelayCheckpoint::from_bytes` checks the preselected identity before admitting
the artifact. `Room::open_log_generations_with_checkpoint` checks that the
manifest is an ancestor with exactly that boundary, then restores the native
checkpoint families and applies later relay records in their original order.
The skipped sealed WALs are still verified against their original byte digests.
An incomplete active tail, pending physical rotation, or missing ancestor
refuses the checkpoint open. Ordinary generation recovery remains available
with the original WALs.

This skips semantic relay replay for the selected prefix. The relay still
retains the original files, including packets from orphaned revision prepares
needed by retained asset reads. Native journals can still replay internally
when restored. WAL capacity, backup format and client transport are unchanged.
Removing a prefix from the live directory will require new archive custody and
verification across handover and retained asset reads.

Retain the checkpoint identity only from a successful owner-side capture. Its
hash binds the snapshot to the operator's choice and the retained WAL cut.
Treat the snapshot as trusted recovery input. The relay does not rederive the
snapshot state by running the skipped events during checkpoint open.

Checkpoint `946b4248` passes three focused tests and 54 generation tests.
The original end-to-end failure and the regression verify the reserved
suggestion writer's original acceptance receipt. Source and independently
installed client workflows cold-open the source through the checkpoint API
before handover and continue through authenticated publication and a real relay
restart with seven returning clients. The client runs use controlled Node
storage. Unit coverage compares the checkpoint open with ordinary cold replay
and checks document and comment Undo/Redo after offline submissions.
