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

For an owner writing a native archive to a file, use
`Room::write_log_generation_backup`. It writes the same canonical bytes and
returns their exact selection and digest on success. It verifies the held
files, builds the section table, and streams each original section in order.
Packed and offloaded WALs still emit their original bytes. Copying uses fixed
scratch buffers and one decoded record at a time during validation. The
caller syncs or publishes the destination after success and discards any
partial output on error. Destination errors leave an otherwise valid room
available for retry. Rotation also hashes and validates the active WAL one
record at a time.

Use `ServerLogGenerationRoomBackup::capture_to` to stream a full native and
raster backup while holding both source owners. It measures and verifies both
canonical components before emitting the joined header. The second pass
checks each section, and both owners are checked again after the destination
flush succeeds. Native raster validation decodes one image at a time. The
archive can be read by the existing joined backup and restore APIs.

For disk-backed restore on Unix, open the complete joined file for reading and
pass the independently retained identity to `ServerLogGenerationRoomBackupFile::open`.
It verifies canonical framing, all file checksums, the exact WAL cut, and the
native raster contents before reserving a destination. Keep the file unchanged
and retain the identity separately.

Use `ServerLogGenerationRoomRecovery::begin_file` with an absent destination.
After an interruption, reopen the backup and use `resume_file` for the same
destination. `progress_file` verifies the owned prefixes. `finish_file` copies
each missing suffix, syncs and verifies each complete file, replays the native
room, and checks both final components before publishing the joined completion
record. The buffered and file-backed APIs share the same reservation and part
ledgers. A retry can switch between them using the same exact backup.

Continue from a completed restore with `begin_operation_file`. Use
`OperationalLogGenerationServerRoom::resume_file` to resume an interrupted
handoff, or `open_committed_file` to reopen an already committed one without
retiring a marker alias. Both verify the original native cut and raster files
before returning the same operational owner. A committed handoff can contain
later durable work, so the original active WAL is checked as a prefix even
after rotation or packing. A partial handoff requires the exact original cut.

`prepare_log_generation_recovery_host_file` moves the acquired room and raster
owners into an inactive authenticated host. The host and its serving clones hold
the original file and verify its selected identity across activation and
publication. Sealed restart prepares the replacement host from the held
original archive file. The durable target checkpoint streams directly to
`target.backup`. Cold open validates and holds that file, and activation
checks it against the live room. Existing formats, host fencing requirements
and lifetime limits apply. Native replay still rebuilds room state in memory.

`capture_recovery_state_to` streams the current native/raster archive to an
empty file and returns the exact participant inventory and recovery selection.
`capture_recovery_identity` returns the same identities and inventory without
a destination. `inspect_sealed_native_restart_to` streams a surviving sealed
cut and verifies the checkpoint, any separately selected minimum, and the
actual operational owner before returning its identity.

`PreparedNativeGenerationActivation::checkpoint_file` returns the admitted
checkpoint. For existing code that needs the buffered checkpoint, call
`checkpoint()?` to request it explicitly. The buffered accessor now reports
read and admission errors, and the owner caches a successful read. The
special-case repair workflows still use buffered archives.

Streamed checkpoint recovery passed 505 Rust relay tests. The two regression
cases for a missing raster and a rolled-back WAL refuse before creating a
checkpoint directory. The source and independent installed workflows stream the
surviving cut, verify the new target file against its identity, then activate and
publish the replacement relay with seven returning clients.
[Checkpoint qualification](qualification/2026-11-14-streamed-native-activation-checkpoint.json)

Operational file recovery passed 504 Rust relay tests. The focused regression
interrupts a durable marker write, then verifies the reopened room after the
original active WAL is sealed and a new raster is added. The source and clean
installed workflows each activate and restart a real relay, including packed
and offloaded WALs on separate APFS volumes. Each reconnects seven clients,
delivers work from two outage writers, and recovers six lost replies.
[Operational qualification](qualification/2026-11-14-disk-backed-operational-recovery.json)

Disk-backed restore checkpoint `f9e24fa1` passes 503 Rust relay tests plus the
separate mounted-WAL test. The interruption tests swap input modes and compare
the complete restored archive byte for byte. Source and independent installed
workflows reopen a disk-backed reservation before authenticated handoff. Both
restart a real Rust relay, reconnect seven clients, deliver work from two
outage writers and recover six lost durable replies.
[Qualification evidence](qualification/2026-11-14-disk-backed-joined-restore.json)

Joined streaming checkpoint `8e4c05c9` passes 110 selected Rust tests, including
exact byte comparison and restore, destination failures in both sections, and
a raster removed during the final flush. Source and independent installed
workflows consume the streamed predecessor archive and compare both joined
producers at the recovered cut. Both pass authenticated handover and a relay
restart with seven returning clients and two outage writers on temporary
APFS volumes with controlled Node storage.

Checkpoint `63ef1f17` passes 85 selected Rust tests. The streamed backup
regression checks exact bytes, short writes, write failure and a writer unwind,
then appends and cold-opens the room. The source and independent installed
workflows exercise the native stream over packed and offloaded history before
authenticated handover and a real relay restart. Each restart recovers seven
clients, including two who wrote during the outage. These runs use controlled
Node storage and temporary mounted APFS volumes.

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
abandoned packets. One fallible packet traversal spans the physical files in
global sequence order, including sealed WALs that are packed or archived.
A Prepare/Commit pair retains its ancestry across a boundary. The relay reads
one record at a time from the same held files used to compute the canonical
archive digest. Unpublished stage bytes affect the digest and stay outside
packet history. A failed traversal returns no inventory. Missing native packet
dependencies yield whole Pending. The complete 100,000-pair and 8 MiB result
bounds remain enforced.

Both reads require current owner access and stream the full source without
building a complete archive in memory. Packet traversal still keeps ancestry
needed to inspect revisions and holds the native room for the duration.
These explicit methods refuse original storage without poisoning it.

Retained packet streaming passed 195 selected Rust tests. The source and
independently installed workflows verify an image referenced only by a server
packet, then recover seven clients through a real relay restart. Both use
packed and offloaded WALs on disposable APFS volumes.
[Retained packet qualification](qualification/2026-11-14-streamed-retained-packet-references.json)

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

Cold replay shares the sealed WAL handles already held by the room owner.
The directory, active WAL, sealed WALs and selected manifests stay under
custody through the replay. A full 64-WAL segment now cold-opens under a
160-descriptor process limit, including selected raw, packed and archived
WALs. The relocated room accepts offline edits and their Undo/Redo through
the original registered writer and cold-opens again at the same result.
Source and independently installed clients also complete a handover across
this full-segment cold reopen.

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
The owner can relocate a checkpointed prefix as described below.

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

## Archive a checkpointed sealed WAL

Call `Room::archive_sealed_wal` with the owner principal, the materialized
checkpoint and the generation ID. The checkpoint must belong to the room and
name an ancestor of its selected manifest. The requested generation must be
sealed at or before that cut.

The room keeps the same inode under the private `.sealed-wals` child of its
log directory. The owner syncs the archive link before removing and syncing
the live name. A cold reopen accepts both names only when they identify the
same file. Retrying under the new owner completes removal of the live name.
A retry that finds the archive already holding the file reports a duplicate.
An uncertain move fences the held log until it is reopened.

Ordinary cold replay, materialized checkpoint recovery and historical asset
reads still verify the archived WAL's original digest. Portable backups still
carry the original WAL bytes at their canonical section names. A sealed WAL
may be packed before it is archived, and its archived representation retains
that packing. Archive movement itself keeps the file on the same volume,
uses the same disk space and leaves the generation count and logical storage
budget unchanged.

The serving `ServerBackupHandle` for a linked or portably restored room can
also reclaim sealed WAL storage. Rotate to an empty active WAL, call
`materialize_relay_checkpoint` under the current serving epoch, and retain the
private bytes and expected identity. Use `pack_sealed_wal` to shrink a sealed
file where compression helps. Call `archive_sealed_wal` with that admitted
checkpoint and a sealed generation covered by its cut. It uses the room's
selected archive location, including an existing separately mounted volume.
On cold restart, the same checkpoint can identify an already archived file.
The before and after portable backup identities and raw WAL bytes match.
Safe removal of logical history remains a separate requirement.

Checkpoint `162e18d9` passes 57 generation tests, three materialized checkpoint
tests and 20 serving backup and handover tests. The Rust tests exercise both
interruption points and verify that a corrupt archive or a second inode at the
live name prevents recovery before it repairs an incomplete active tail. The
source and independent package workflows run the same authenticated handover
and seven-client relay restart with a raw archived root and a packed archived
WAL. Both workflows recover lost edit, comment, version, suggestion decision,
revision and upload replies and deliver edits from two clients made during the
outage. These runs use controlled Node storage and a real local Rust relay.

## Offload sealed WALs to a separate volume

For a room that has yet to create `.sealed-wals`, stop the owner and mount a
dedicated Unix filesystem at the room's `.sealed-wal-volume` child. Create the
private directory `archive` (mode `0700`) at the root of that volume. Keep the
mountpoint directory in place so a cold open detects an unmounted volume. The
relay refuses a simultaneous local archive and mountpoint. The relay owner
must have exclusive access to the archive's private directory.

After reopening the room, use the same checkpoint and owner API. The relay
copies the physical representation to a fresh exclusive stage on the target
volume. It verifies the original WAL digest, syncs the destination, publishes
the final name on that volume, and checks the copy before removing the original
under the live room's lock. This releases the original WAL's allocation on the
live filesystem. A cold reopen following publication checks both representations
against the immutable manifest before retry can retire the original. A refusal
leaves the original available if retirement has yet to begin.

An interruption before publication can leave a private `.offload-*` stage.
No stage alone is selected or used to recover committed records. Retrying starts
a new stage while keeping earlier unlinked stages. The archive allows up to
eight outstanding stages. Clear orphaned stages only during exclusive offline
maintenance with their directory and contents inspected. An alias of a
published WAL is retired by a normal retry.

Keep the separately mounted archive online for continued service and retain
it in host backup and recovery procedures. Portable room backups still contain
the same raw WAL sections and restore without the mounted volume. Physical
offload leaves the existing logical record, generation and backup limits intact.

Checkpoint `7a48d145` passes 80 existing Rust recovery and handover tests and
an explicit APFS test that interrupts the move at three points. The source and
independent package workflows each archive a raw WAL and a packed WAL on
volumes separate from their live rooms. Both pass authenticated handover and a
real relay restart, including seven returning clients, two offline writers and
retry of six lost replies. The tests use temporary disk images and controlled
Node storage.

## Capture a base at an exhausted writable cut

The separate `Room::write_relay_segment_base` action captures an exact
native generation backup and materialized relay state under the same held
source. The active WAL may be nonempty. This permits a predecessor capture
at the 64-file limit, when requiring a further rotation would fail. The
archive includes the full raw record chain, unpublished stages and inert
revision preparations. The checkpoint retains native document/comment
journals, writer credentials and receipt positions, roles, and review metadata.
Runtime connections and presence are rebuilt through normal authentication.

Write to two distinct private files, sync both files and their containing
directory, and retain the returned `RelaySegmentBaseIdentity` independently
in trusted host configuration. Discard incomplete output after an error.
`RelaySegmentBaseFile::open` admits the complete predecessor and its matching
checkpoint header from held files. `Room::open_log_generations_with_segment_base`
verifies that predecessor against the local generation directory before
restoring private native state or replaying any suffix. The base can end
inside the current WAL or a subsequently sealed and packed WAL. Original
absolute sequence, digest, receipt, canonical backup and append semantics
continue across the base. Pending rotation and incomplete tails require their
existing explicit recovery actions.

The [exact record-ceiling drill](qualification/2026-11-16-full-wal-handoff.json)
fills every physical slot and all 4,096 records in the last active WAL.
When both retained record headroom and available rotation slots reach zero,
new edit and boundary writes refuse. The room still serves the exact
accepted state and original receipts. The owner can capture the base at that
cut and continue into a fresh linked segment. Its first WAL record uses the
predecessor's next absolute sequence. In the drill, the same pending edit
is accepted there, and its original author can Undo and Redo across cold
recovery. Leave pending SDK work in its original journal and resume under
the original registration after the host selects and opens the successor.

A future writable segment needs a durable selection of this base before
opening its suffix at the exact absolute sequence and frame digest. Its
retained proof must continue to serve exact old receipt and packet reads,
including image references from inert preparation records. The independent
host must select one append owner across that handoff. This checkpoint still
opens the existing generation directory and needs its retained files.
Canonical checkpoints remain subject to their 512 MiB encoded budget and
materialize native state in memory. The log storage lifetime and active
budgets, raster custody and existing on-disk formats are unchanged.

[November 14 qualification](qualification/2026-11-14-relay-segment-base.json)
records 510 passing relay cases, a separate passing cross-volume restoration,
and source and installed provider workflows with seven clients returning
after real process replacement in each run. The full relay rerun used six
test threads after an operator route returned HTTP 503 once under the earlier
broad run. The same test passed by itself and in the final suite. The capture
and replay tests include an actual 64-WAL room and compare the recovered
state, receipts, and exported archive against ordinary cold replay.

## Continue into a fresh writable segment

`Room::continue_into_relay_segment` takes the verified base for the **exact
current cut** and an absent destination. The host durably retains the base
files and pins before invoking it. The action prepares an empty WAL and
syncs the new directory, then publishes a successor marker in the original
directory while holding its exclusive room lock. The marker binds the two
actual directory instances, the first successor manifest, and both base
artifacts. Once selected, ordinary opens of the original directory refuse.
The successor holds that marker and the two immutable artifacts while
serving. A cold successor open additionally checks the marker against the
source and destination directories before replay or tail repair.

A separately versioned manifest selects the new physical segment. Its first
record uses the predecessor's original next sequence and terminal digest.
There is no extra semantic event. The successor has 64 local WAL slots
and 512 MiB of local retained WAL capacity under the existing per-file
limits. Old registration credentials resume into fresh leases. The original
document and comment journals, receipt numbers, version and suggestion
packets, and the room's raster binding survive the handoff. A host can reopen
the existing bound raster store under its ordinary storage ownership.
`Room::relay_segment_retained_asset_references` reads packets in order across
both sources, including inert preparations, and returns a whole inventory
or Pending. The original archive reader remains byte-compatible.

A prepared destination without the source marker cannot become writable.
The original can continue serving before that marker is selected, using a
different absent destination for another attempt. After the synced marker,
`Room::open_relay_segment_successor` uses the same two directories and trusted
base. Suspect sources, occupied destinations and divergent artifacts refuse.
The native directory fence applies to this local owner. The serving host
still needs its deployment epoch to guard other copies or machines.

For subsequent handoffs, `Room::write_relay_segment_base` writes the current
physical segment in a distinct linked WAL archive plus a checkpoint at its
absolute terminal cut. The recipient supplies the previously selected base
to `RelaySegmentBaseFile::open_linked`. The linked archive must start at the
prior checkpoint's sequence and digest, and each generation ID must be new
across the entire chain. The base identity used for handoff binds the new
archive and checkpoint to all earlier parts. No prior archive is rewritten.

For cold recovery after multiple handoffs, keep each original private
directory and present their paths to `Room::open_relay_segment_chain` in
handoff order. It checks each marker and adjacent directory instance before
replaying the last segment. While serving, all earlier markers and artifacts
remain under custody checks. Asset reference reads walk every archived
record and the writable suffix in order.

A fresh-host restore can use those portable pieces with the exact raster
archive and an independently retained whole-room identity. Legacy archive
readers refuse a linked suffix as a complete backup.

[November 14 qualification](qualification/2026-11-14-writable-relay-segment.json)
records 512 passing relay tests and the separately run APFS interruption
test. From both the source SDK and independently installed archives,
a real 64-WAL relay exits, the handoff is committed in a fresh process,
and a cold successor accepts offline text and comments using the original
credentials. A second relay exit preserves Undo, subsequent Redo, and the
original raster bytes. These are controlled Node client stores.

[Linked segment qualification](qualification/2026-11-14-linked-relay-segments.json)
records 513 passing relay cases and the separately passing APFS test.
Source and independently installed clients each cross two genuine full-WAL
handoffs, submit document and comment edits queued during both outages,
then verify Undo/Redo across an additional restart and read the original
raster. Native tests verify orphaned and middle-segment packet references,
and reject missing, reordered or changed ownership evidence.

## Retain asset packet history in the checkpoint

Use `Room::write_relay_segment_base_with_indexed_asset_history` or
`ServerBackupHandle::capture_portable_relay_segment_with_indexed_asset_history`
to opt into relay checkpoint version 2. The original capture entry points
still write version 1. The version-two checkpoint pins an
`assetPacketHistory` field in the selected checkpoint digest.

The history contains the first absolute sequence of its physical segment
and the original sequence, kind and literal packet inputs of each version,
suggestion and revision Prepare or Commit. Capture reads the segment under
the same WAL custody as the native backup. It retains abandoned prepares
and their dependencies alongside published packets. The projection's
records are strictly ordered within the selected segment and capped at
64 MiB of encoded records including separators.

Continuation and authenticated portable seal recompute the indexed
checkpoint from the held source before fencing it. Linked-room asset inventory
reads indexed and original-format segments in sequence order, then scans the
current WAL suffix. The existing packet evaluator runs against the current native
document and returns original event positions and whole Pending results
when applicable. Backups retain and verify their full original WALs.
Opening indexed checkpoints requires a reader that supports version 2.

## Compact certified portable predecessors

`Room::write_relay_segment_base_with_compactable_history` writes a
version-three checkpoint along with the exact original archive. The
checkpoint adds an `archiveClosure` to the indexed packet history. It
records the original root, parent binding, archive digest and canonical
inventory of file names, lengths and digests. Keep the returned selection
in trusted recovery configuration. Live continuation and portable seal
rederive the closure from the held original files before fencing the room.

`capture_portable_relay_segment_with_compacted_history` and
`copy_portable_with_compacted_history` write a fresh `BRLINE3\n` lineage.
Its framing matches `BRLINE2\n`. An archive length of zero selects the
exact retained version-three checkpoint and its physical closure. Older
predecessors still include their full archives. The terminal segment also
includes its full archive. Its checkpoint becomes eligible for compaction
on a later capture after handover. Conversion verifies complete source
archives before omitting them and reuses admitted gzip members verbatim.
For split sources that exceed the open-file limit, first create a fully
packed copy using the descriptor-bounded converter.

Native hosts can use `RelaySegmentBaseFile::open_compacted_checkpoint`
with the independently retained original selection and exact parent.
Portable recovery admits a mixed chain in order, verifies original segment
bindings, and preserves the absolute log cut. Original packet positions,
offline client receipts, writer identities, Undo/Redo and complete raster
copies remain available. Compaction writes a new copy. Lossless raw export
requires the original archive bytes.

## Migrate older portable predecessor archives

Call `RelaySegmentRetainedBackup::copy_portable_with_retired_history`
with the independently selected original backup and a fresh destination.
It verifies the source lineage before exporting exact original checkpoints
and retiring all predecessor archive payloads. A version-one or version-two
checkpoint gets a supplemental proof generated by scanning the verified
archive. The proof carries the original binding, physical file inventory
and literal asset packet history at its original sequence numbers. A
version-three checkpoint already carries that information.

The resulting `BRLINE4\n` pack has the predecessor count and checkpoint
framing of `BRLINE3\n`. Every archive length is zero. Each stored checkpoint
is followed by an unsigned big-endian 64-bit proof length and the proof
bytes. A zero proof length requires a version-three checkpoint. The
separately retained `RelaySegmentRetiredHistorySelection` binds the exact
pack digest to the original portable selection. Keep it in trusted
recovery configuration and use `open_portable_with_retired_history`.

The original selection still names the same cut for activation and cold
recovery. To seal a serving relay against the migrated output, call
`seal_portable_relay_segment_with_retired_history`. The relay also checks
each supplemental proof against the ancestry it actually holds before
committing the source fence. After activation, use
`capture_portable_relay_segment_with_retired_history` to carry those
proofs forward and certify the next terminal checkpoint. The terminal
WAL and checkpoint are present in full so the new bundle can select
its exact recovery cut.

## Retire redundant predecessor checkpoints

Use `copy_portable_with_ancestry_proofs` with an independently retained
retirement selection to compact an existing `BRLINE4\n` or `BRLINE5\n`
bundle. A serving relay can use
`capture_portable_relay_segment_with_ancestry_proofs` directly. Both
produce a fresh `BRLINE5\n` pack retaining the logical identity of the cut.
The pack has a big-endian 32-bit predecessor count and, for each ancestor
in order, a big-endian 64-bit proof length followed by the proof bytes.

Each proof carries the original binding, physical closure and exact
packet history. Capture extracts them from an independently verified
version-three checkpoint or derives them from an admitted original WAL.
It can also carry a previously selected retirement proof forward.
The terminal archive and checkpoint supply full room recovery state,
including receipts and native histories. The same retirement selection,
open and seal APIs independently pin and verify the proof-only format.
Source sealing still checks the proofs against the actual serving ancestry.

A retired ancestor is part of the selected lineage. Restoring that earlier
cut directly requires a separate full backup taken at that cut.

## Stream an extended terminal checkpoint

`capture_portable_relay_segment_with_extended_terminal` writes a
version-four terminal checkpoint for a proof-only portable backup.
Its aggregate decoded budget is 2 GiB. The existing raw checkpoint
families retain their 512 MiB budget. Document, review, and effect
histories still enforce their own native limits.

`native.checkpoint` starts with `BRCKPT1\n` and a big-endian 64-bit
decoded length, followed by exactly one fixed-header gzip member.
The selected checkpoint SHA-256 identifies the exact decoded JSON.
The reader bounds the stored file, requires the declared decoded
length, and validates the gzip trailer and the selected digest.
Version four requires this storage envelope. The writer streams
compression to the destination file under the serving epoch.

Use the existing retired-history open and seal APIs with the separate
portable selection. The live seal rederives the canonical version-four
checkpoint and compares its digest with the independently chosen cut.
Use the extended or ancestry-proof capture when the current terminal
becomes a predecessor. Its closure and asset packets can travel as a
proof after handover.

## Restore a linked room with its raster store

`Room::write_relay_segment_room_backup` streams the current WAL archive,
native checkpoint, and whole raster store under the two live owners. Keep
the earlier linked archives and checkpoints. Sync the three outputs and
retain the returned whole-room identity in trusted host configuration.
The identity binds the complete native archive chain and its terminal cut
to the exact raster archive, including unreferenced uploads. Every file
remains separately bounded. The entire archive is never buffered at once.

Admit the native chain and open `RelaySegmentRoomBackupFiles` against that
trusted identity. Restore into an absent private directory. The restore
copies and verifies each raster and opens a fresh native WAL at the exact
absolute checkpoint position. A synced completion marker binds the two
actual component directories to that cut. The original deployment
directories are unnecessary. Registrations, causal history and receipt
positions remain unchanged. `reopen` requires the original retained archive
files and admits later native edits and raster additions. It refuses an
incomplete native tail, a pending rotation, missing raster data or a
different component. Incomplete restores remain unselected and can be
retried at a fresh absent path.

A restored generation can hand off again. Its first local successor records
which archived cut supplied the recovery floor, so later cold opens verify
every handoff after that floor without relying on the old deployment's
directory markers. All retained packet events remain available in order.

For a long predecessor chain, use
`ServerBackupHandle::capture_packed_portable_relay_segment`. It writes the
original predecessor archive and checkpoint pairs into
`native-lineage/packed.bin` in oldest-first order. The terminal backup and
retained client files use the usual paths. The logical backup identity is
the same as a split capture at the same cut. Opening the packed predecessors
holds one file descriptor and verifies each original digest and lineage
before restore or sealing. Use the split capture for older relay readers.

Use `RelaySegmentRetainedBackup::copy_portable_packed` to convert a completed
split backup using its independently saved identity and a new, absent target
outside the source tree. The converter streams one native predecessor pair at
a time, copies the native and raster cut and retained client data, then
verifies the whole target through the regular portable reader. This also
works on backups that already use the packed layout. The live relay can keep
serving while the completed backup is copied. Close other readers of the
backup directory first. Retain the original until the new path verifies.
A failed copy can leave a partial target. Retry at a fresh path. Verification
uses the usual file handles for retained client journals and upload queues.

The opt-in `capture_portable_relay_segment_with_compressed_checkpoints`
and `copy_portable_with_compressed_checkpoints` use the same selected room
and client inputs. They write a `BRLINE2\n` lineage marker followed by an
unsigned 32-bit predecessor count. Each predecessor has three unsigned
64-bit lengths in order for the raw archive, original checkpoint and
stored checkpoint. All integers are big-endian. The bytes are the original
archive followed by the checkpoint. A smaller stored length selects one
gzip member. Equal lengths select the original raw bytes.

Admission reads each checkpoint as a bounded original stream, verifies its
digest and cut against the independent selection and rejects a corrupt
trailer, changed length or trailing member data. Live capture and offline
conversion share the same framing and restore path. The ordinary
`copy_portable_fully_packed` converts a compressed lineage to the original
`BRLINE1\n` representation with byte-identical checkpoints. The format stores the
newest checkpoint and original WAL artifacts as raw bytes.

Before committing a source seal, both packed layouts recheck the named
pack and its directory membership after comparing the live cut. The
lineage directory accepts only `.owner` and `packed.bin`. An unexpected
entry at this check leaves the original relay writable. A new capture at
an absent path can seal the room normally.

For backups with many retained client originals, opt in through
`ServerBackupHandle::capture_fully_packed_portable_relay_segment` or
`RelaySegmentRetainedBackup::copy_portable_fully_packed`. Both keep the native
predecessor pack and store exact selected journals, alternate participant
originals and standalone upload queues in one `client-inputs.bin` file.
The file starts with the eight-byte `BRCLNT1\n` marker, followed by the three
groups in selection order. Exact lengths, digests and owners come from the
independent backup identity. The portable reader opens one held descriptor,
checks each bounded range through the normal archive admission code, and
refuses altered bytes, mixed layouts and incomplete or trailing data.
The same named file must hold through the source seal. Split readers and the
existing capture methods keep their original layouts.

Restored journals use packed local storage. Restored upload queues keep the
existing per-writer files and manifest for the host's file export API.
The restored upload directory stays exclusively locked. Restore and cold
startup verify each queue's exact length and digest in turn. Warm checks
verify each private file's identity, change times and length. Export reopens
and rehashes one queue at a time. This bounds the relay's upload file handles
independently of the number of queues. The original completion format and
read-only file API still apply.

The reference adapter can serve both recovered components behind a fresh
lease from the existing deployment epoch authority, with the ordinary
account and Origin policies. Deployment approval for the exact cut and
reconciliation of client and provider work remain host operations.

[Portable linked-room restore qualification](qualification/2026-11-14-linked-room-portable-restore.json)
records 514 passing relay tests and the separately run APFS interruption
test. Source and independently installed clients each cross two full-WAL
handoffs, then deliver offline text and comments to the portable restore
under a fresh epoch after all original live directories are moved away.
Both runs verify document and comment Undo/Redo across a cold restart and
read the original raster bytes. Client storage in this test is controlled.

## Transfer a serving linked room

Use `router_with_server_backups_and_deployment_lease` for the live source.
`ServerBackupHandle::capture_relay_segment` authenticates the room owner,
streams and syncs the three files under the source's serving permit, and
returns their whole-room identity and current serving epoch. Keep the
earlier segments and retain the selected identity in trusted configuration.
The source can accept additional work while the target is prepared.

Restore the selected files into an absent target and call
`RelaySegmentHandoverApproval::select` with its actual owner, backup identity
and captured source epoch. Sync this approval separately before calling
`commit_relay_segment_handover`. Commit authenticates the owner against
both account configurations. It holds an exclusive permit from the same
independent serving authority, holds the old native and raster owners, and
compares the complete source cut and untouched target before the epoch
append. A new accepted native record, raster, physical log cut, or epoch
invalidates the selection. Capture a fresh cut if the source advanced.

The epoch append commits directly to the approved target's local directory
owners and the exact accepted source. It makes the old lease unavailable to
further native work. A successful commit returns the target router and its
host-local capture handle. Retire the superseded listener and keep both
directories and the approved archives through qualification.

If commit returns an uncertain result or the target process exits, use the
independent authority's current selection and reopen the exact target from
the retained backups. `resume_handover` authenticates the owner and requires
proof of the same approved epoch in the real ledger. It claims a fresh
target-bound epoch and preserves later complete target work. A newer
unrelated selection, a copied target directory, or an incomplete on-disk
tail requires separate operator recovery. No control endpoint is exposed.

For a revision-two coordinated authority, use `select_verified` and
`commit_verified_relay_segment_handover` even if the restore includes no
client archives. Save the planned activation epoch independently before
committing. On cold restart, open the authority with `open_at_least` using the
latest independently retained epoch for the approved target, then pass the
actual current selection to `resume_handover`. Retain the returned selection
before exposing service. A ledger that omits the independently retained epoch
refuses cold admission.

These are blocking host operations. They require participating hosts to
share one actual authority journal, the private completed target directory
to stay at its selected location, and the original owner to authenticate
under both configurations at takeover. The approving host remains
responsible for independent client/provider reconciliation and for selecting
its traffic cutover. This path handles a reachable live source and the
process exits after its epoch transition.

[Authenticated linked-room handover qualification](qualification/2026-11-14-linked-room-handover.json)
records 517 passing relay tests and the separate APFS interruption test.
Source and freshly installed SDK runs confirmed a live old listener refusing
requests after the commit, then delivered offline text and comments to the
resumed target with the old directories moved away. Both runs checked
document and comment Undo/Redo across an additional process exit and read the
same raster bytes before and after takeover.

### Verify protected streams and server asset dependencies

On the untouched restore, call `verify_handover_inputs` under current owner
authentication with protected registration records and a held asset provider.
The native inventory covers every registered document writer and review actor,
including observers and revoked accounts. The dependency scan visits the
complete linked history in absolute order, including retained version,
proposal and revision packets. The provider resolves opaque asset/generation
pairs against the restored raster store. Native content IDs keep their
original meanings. Pending reports identify missing registrations, packet
dependencies, mappings or rasters. Supplied invalid credentials refuse.

Use `select_verified` and `commit_verified_relay_segment_handover` to bind
the verified report digest into the replacement epoch. Commit holds the
provider guard and compares its current mappings and raster metadata.
After comparing the predecessor cut, it checks the same provider's current
authority and opaque mappings again. It rechecks custody of the native and
raster files on both sides
before appending the new serving epoch. A change in the verified files,
target, mapping, or provider authority prevents commitment. Keep the report
and approval separately from the room files. After a committed restart,
`resume_handover` uses the exact approval and actual authority journal.
It does not replay or acknowledge old delivery from the report.

The report covers accepted server state and original resume identities.
The host still needs the client journals and provider outboxes to reconcile
unaccepted offline work and client-only uploads.

[Verified input qualification](qualification/2026-11-14-verified-linked-handover-inputs.json)
records 518 passing relay tests and the separately run APFS interruption test.
Both source and independently installed SDK runs kept the same pending document
and comment work through takeover. They resumed original credentials, synced
the offline edits, exercised Undo/Redo after a later restart, and read the
exact original raster and version packet. The fixture uses controlled client
storage.

### Preserve client-only rasters through takeover

The host can select exact immutable raster payloads from retained client
archives and pass their held files and independently selected metadata to
`restore_with_client_rasters`. Native admission rehashes and decodes one
payload at a time. The private target starts with the whole original server
raster archive and the selected additions. Duplicate selections, changed
inputs, occupied paths and unions exceeding the existing raster limits
refuse. Successful staging records a completion marker that binds the
selected IDs and exact initial raster store to this target.

Use verified handover for a target with client rasters. The approval commits
to the target and staged selection while the source still has to match its
original accepted cut. Cold reopen requires the original raster archive
and all committed additions, and keeps later complete work. The client's
original upload status and epoch stay in its archived queue. Restoring
that queue and retrying against the replacement relay uses normal durable
duplicate receipts, including for a payload absent from the old source.

This operation accepts explicit retained payloads from the host. It does
not discover every client archive or resolve conflicts among client queues.

For a full live raster store, the host can select
`restore_retaining_client_uploads` on the linked backup or portable retained
bundle. This restore stages the original server raster archive and the selected
participant dependency rasters. Participant bindings can select a payload from
an embedded or standalone upload archive. Every other queue payload undergoes
native raster validation and stays in the exact original queue, including
its saved status, epoch and receipt. The target retains all selected uploads,
journals and alternate branches under the same custody checks.

Handover still verifies the accepted room and the clients’ retained
dependencies. If a separate native journal requires an asset available
only in a held queue, a missing live asset remains a Pending verification
input. Select a staging restore for dependencies that need to be installed.
The SDK can resume pending uploads from the retained archive under normal
authenticated delivery. A unique upload needs both a free live raster slot and
enough payload capacity, and an exact upload retry can acknowledge existing bytes
even at capacity.

[Client raster handover qualification](qualification/2026-11-14-linked-handover-client-rasters.json)
records 519 passing relay tests and a separately run APFS interruption test.
Both source and freshly installed SDK runs restored the whole client upload
archive and checked that its original pending state and epoch survived. The
new relay already had the exact bytes after a cold restart. The original
upload became complete only after the client received the normal duplicate
receipt. The fixture uses controlled client storage.

With the matching SDK distributions built and package dependencies cached,
run the source and installed workflows from a clean checkout.

```sh
cargo build --locked --release --manifest-path experiments/relay/Cargo.toml \
  --features server --example relay_segment_functional
node scripts/check-writable-relay-segment.mjs \
  experiments/relay/target/release/examples/relay_segment_functional
```

### Retain the complete writer upload archives

`restore_with_client_upload_archives` accepts one independently selected
original SDK upload archive per registered document writer. Open each file
with `RelaySegmentClientUploadArchive::open` and its writer, byte length
and complete SHA-256. Supply selections in lexical writer order, including
an empty archive when a writer has no local rasters. Rust checks the
original framing, queue metadata and complete payload ranges. A writer's
original statuses, attempts, epochs and opaque receipts stay in the exact
archive. The native raster store admits the union of its original rasters
and the new payloads. Different writers can retain different queue states
for the same immutable image.

The restore syncs native data, the raster union and exact client archives
before recording completion. Verified handover compares archive coverage
with the live native roster at the approved cut, including observers and
revoked writers. Missing archives keep verification pending. An unknown or
duplicate writer refuses. The replacement epoch binds the archive
selection and its actual restore directory. Cold reopen verifies each
complete retained archive, so recovery can use its exact bytes after the
supplied files are gone. The host can read an archive with
`open_client_upload_archive` and restore it through the existing SDK.

The host remains responsible for selecting the trusted archive for each
writer. Divergent queues for one writer require explicit reconciliation
before selection. This API retains the upload archives. Select the
separate journal-aware API below to enroll offline document and review work.

[Writer upload archive qualification](qualification/2026-11-14-linked-handover-client-upload-archives.json)
records 520 passing relay tests and the separately run APFS interruption
test. Both source and freshly installed SDK runs retained two exact archives
for the same client-only raster. After cold restart, the pending queue
completed through the normal relay receipt and the cancelled queue stayed
cancelled. The fixture uses controlled client storage.

### Enroll native document and review journals

`restore_with_client_journals` adds exact independently selected native
checkpoints to the upload archive restore. The host opens each checkpoint
with `RelaySegmentClientJournal::open` and selects the original registered
writer or actor, exact native family, length, and complete SHA-256. Sort
document writers lexically first, followed by review actors lexically.
Each review pin identifies an enrolled document writer belonging to the
same account. The original native checkpoint admits the review anchors,
including anchors to that writer's offline document work. The archive
admits up to 2,047 journals, 256 MiB per file and 1 GiB combined. The
individual native decoders enforce their own smaller family limits.

The private restore streams the original bytes into a synced file with a
canonical manifest. The restore completion and deployment target bind the
actual journal directory and the manifest digest. The host can read exact
originals with `read_client_journal`. Cold reopen checks each journal hash
and the exact byte ranges before the target can resume serving.

Handover scans each admitted document journal for raster bindings retained
by any native contribution, including offline work and an image still
reachable through Redo. The host must resolve the union of those bindings and
the server's accepted and retained packet bindings against the actual
restored rasters. One immutable asset may be supplied by a different
writer's selected upload archive. The resolver checks complete bytes and
generation-exact host mappings, and repeats the same check immediately
before switching the serving epoch. If a binding is unavailable, approval
stays pending even when the image is absent from the visible document.

Verified handover requires the complete document and review roster, including
empty observers and revoked registrations. It replays each selected original
using the room's existing profile and the indicated native decoder. Document
genesis must match the immutable server genesis. Every author's applied
prefix and every retained review actor are checked against the accepted
history. A client may be behind the relay, and an authoring client may be
ahead on its own stream. A divergent overlapping prefix, unregistered
author or foreign offline suffix refuses. An omitted stream keeps the
approval pending. Approval and activation remain separate from ordinary
authenticated delivery. They neither apply offline edits nor advance an
acknowledgement or queue.

For a paired SDK recovery the host also needs the matching saved binding,
progress and packet metadata, as well as the original credentials held
outside the journal archive. Restore in a fresh SDK store and reconnect
using the original delivery protocol. Two possible offline originals for
one writer still need explicit host selection or branch reconciliation.

A `PairedSession` pin can enroll an original `SharedReviewPersistentSession.exportBackup()`
archive in place of two bare native journals. The archive's document writer and
review actor must be actual same-account registrations. Enroll each native stream
once, whether separately or inside this paired file. The relay uses the archive's
declared history and selection policies, replays both embedded native journals and
checks their accepted prefixes. It also checks saved review receipt sequences
and the native prefixes covered by any saved review cursor, and admits each
local named version and its raster requirements. Both writable and explicit
read-only review records keep their original storage meanings.

Cold recovery can read the intact SDK archive with `read_client_journal` and
pass it directly to `SharedReviewPersistentSession.restoreBackup` in a fresh
store. Original credentials, current live policies, and the writer's separate
upload archive remain host inputs. Independent-delivery proposal and revision
outboxes continue to use their own archives.

An `IndependentDelivery` pin can retain the exact JSON returned by the SDK's
`SharedIndependentDeliverySession.exportRecovery()`. This closed recovery
record includes separate document and review lanes, relay progress, named
local versions and the selected proposal, decision, revision and version
stores. It accepts the original or segmented native history family for each
lane. Review and document receipts must match original accepted sequences and
native prefixes. The original packet readers validate every retained
proposal, revision and version, including their raster requirements. A
saved final outcome or cached accepted packet must agree with the actual
relay records. An unanswered retry remains in the original queue.

The host reads the exact retained record via `read_client_journal` and
restores it with `SharedIndependentDeliverySession.restoreRecovery` using
the separately supplied factory, original writer credentials and fresh
application policy. The same handover still selects the writer's whole
upload archive separately. It verifies the union of server, native
client-history and retained client-packet raster bindings before approval.

Run the source and clean installed recovery workflows against the built
`relay_segment_functional` fixture with
`node scripts/check-writable-relay-segment.mjs <relay-executable> --independent-delivery`.
The paired baseline uses the same command without the flag.

### Enroll a complete independent-delivery participant archive

Select an `IndependentParticipant` pin for the binary returned by
`captureSharedIndependentDeliveryParticipant`. The host pins the original
writer and actor, complete file size and SHA-256. The two registrations
must belong to the same principal. Supply that writer's upload archive
through the participant file. Supply a separate upload archive for each
other document writer without a complete participant file. Two upload
selections for the same writer refuse.

The relay checks the original binary framing and the exact record and
payload digests. It replays the native journals and compares retained
delivery progress with accepted receipts on both lanes. It also recomputes
the participant's raster dependencies from native history, named versions
and the outboxes. Every declared binding must match that replay and the
current provider's resolution at approval and commit. The binary may
supply rasters outside the embedded upload queue. The restore syncs those
payloads into the same private target before the serving epoch changes.

The host can stream the original file with `copy_client_archive` into a
private output, then publish the export once the copy succeeds. In the SDK,
read that output with `readSharedIndependentDeliveryParticipant` using the
original selection. `SharedIndependentDeliveryParticipantRecovery` restores
the native session and uploads together into fresh stores. Supply the
original credentials and current application policy separately. The relay
also retains the nested upload file in the existing upload archive layout
for hosts that recover upload queues independently. This stores a second
copy of those upload bytes until a future storage lifecycle change.

Run the source and clean installed checks with
`node scripts/check-writable-relay-segment.mjs <relay-executable> --participant-archive`.
The fixture checks recovery from the exact retained binary after moving away
the input files, delivery of queued review work, and a proposal raster that
exists only in the binary's portable payload section.
