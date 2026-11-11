# Generation server room recovery

Breditor can capture and restore one exact server-side cut containing complete
physical native log history and every immutable stored raster. Document/comment
histories, registrations, receipts, review packets and unreferenced images remain
intact. Client journals, outboxes, provider mappings and current host authority
are separate inputs, not inferred from a server archive.

## Separate archive contract

`ServerLogGenerationRoomBackup::capture` borrows the actual native room and raster
store for the entire serialized capture and requires an authenticated owner
principal. Their original asset bindings must match. Streaming comparisons
recheck retained files without another complete history or raster buffer. No
client flush, upload, provider fetch, pruning, native event or grant occurs.

The distinct `breditor/server-log-generation-room-backup` version 1 envelope uses
`BREDITOR-SERVER-GENERATIONS1\n` framing. A canonical header describes two
gap-free, ordered complete components. Exact digests, lengths, bindings and native
identities must agree. Missing, overlapping, overflowing, trailing,
unknown-family and checksum-valid inconsistent inputs refuse as a whole.
Original room, native-generation and raster archive meanings remain unchanged.

Independently retain `ServerLogGenerationRoomBackupIdentity`, which pins the
native archive and physical manifest, entire raster archive and joined file
digest. It is not authentication, currentness or deployment permission. Importing
bytes cannot choose the trusted identity. Admission checks complete native
transport integrity and native raster decoding, but does not replay native
permissions, schema or review effects. Restoration must prove those separately.

## Buffer ownership and bounds

Capture retains admitted components rather than another encoded joined buffer.
`write_to` streams unchanged component bytes; a bounded writer computes the whole
digest. Original raster archives also stream without changing their bytes.
`to_bytes` explicitly requests an encoded copy.

`from_owned_bytes` transfers its allocation to the native component: the section
moves in place instead of being copied to a second full history buffer. Raster
records keep their ordinary owned form and the original input capacity remains
retained. `from_bytes` owns copies of borrowed components. Native cold replay
still collects decoded records; these ownership contracts do not establish the
complete memory/performance envelope.

Native storage retains 64 WAL files and 512 MiB in aggregate, with the existing
4,096-record and 256 MiB per-file ceilings. Rasters retain 1,024 records, 256 MiB
of encoded image payload and original individual image/pixel limits. The joined
ceiling sums existing complete component ceilings, a 128 KiB header and fixed
framing. No default, Undo budget or lifecycle limit is widened. No history or
unreferenced image is collected as garbage.

## Owned restoration

`ServerLogGenerationRoomRecovery::begin` requires an absent private destination,
independently trusted exact identity and explicit `HostReacquired` policy. The
host must fence the former deployment separately. Failed initial reservation may
leave a known unready path; inspect it and use a fresh destination, not overwrite.

Insert-only selectors bind actual native and raster directories and their local
owners, not just matching path contents. The raster lock transfers directly into
its native store without a drop/reopen gap. Opening complete raster files does
not initialize, normalize or clean pending work.

Each raster file has a durable intent naming its actual empty staged inode before
body writes. Resume compares that owned prefix, appends missing bytes, syncs,
then links the same inode to an absent final path. An unrelated occupied file
refuses even when empty or byte-identical. Cleanup retires only the exact owned
staging alias. The original manifest publishes after all raster records.

Complete native replay and exact identity checks precede the raster phase.
Native authority failure cannot publish joined completion. After both actual
owners match the trusted source and binding, one joined completion record is
synced. Component readiness alone is not that joined barrier. No service,
uploader or client/provider synchronization starts.

Recognized pre-selector empty components, empty unselected data stages and
bounded metadata stages remain preserved, never silently adopted or scavenged.
Unselected recovery work is bounded at 64 entries and 8 MiB of metadata. Unknown
entries, symlinks, changed owners and inconsistent controls refuse without
removing the retained work.

## Current and retained source checks

`RecoveredLogGenerationServerRoom` retains both actual owners, directory custody
and parent/native recovery leases. `components_mut` borrows both native
components together without releasing leases. Old document/comment leases remain
absent; resume requires original protected credentials and current authenticated
account permissions. Matching history does not restore revoked grants.

`check_live_source` checks immutable actual recovery-control witnesses, component
selections and original raster-file inodes, as well as native/raster bytes. A
changed component-family label, unexpected parent file or byte-identical raster
replacement is not silently accepted. These witnesses are local runtime state,
not serialized deployment authority.

The archive's `check_live` requires the exact source. `check_retained` admits
complete later native events, physical rotations and immutable uploads only
while the selected physical ancestry, original prefix and all original raster
bytes remain. Missing original unpublished native work also refuses. Neither
check changes roles, prunes data or reconciles providers and clients.

Later edits/uploads make historic exact restore refuse rather than roll accepted
work back. A fresh capture can restore a later cut to a new absent destination.
Exact historic restore is not operational resume.

## Operational handoff and cold reopen

`RecoveredLogGenerationServerRoom::begin_operation` first verifies the exact
completed source under a host-authenticated owner principal and independently
selected archive identity. It retains the actual parent, native and raster
leases throughout the transition. A separate operation intent records an actual
empty marker inode before any marker-body write. The eventual marker also binds
the actual intent inode, original source and recovery identity, and fingerprints
of the immutable parent/native recovery controls and their local custody.
Preserved unselected components have their child names, control bytes and file
inodes pinned too; an unchanged directory inode alone does not prove they stayed
unchanged.

Marker publication appends only the selected owned prefix, syncs it, links that
same inode to an absent target, syncs the directory, and retires only its owned
staging alias. An unrelated target refuses even if its bytes match. A failure
before the intent is selected leaves a recognized empty stage; exact recovery
can preserve it. Once the intent exists, use explicit operational resume rather
than re-entering historic restoration. Retain every file after an uncertain
result: the marker may already be committed.

`OperationalLogGenerationServerRoom::resume` requires the original independently
trusted archive selection, explicit `HostReacquired` policy and authenticated
owner. Before marker commitment both components must still match the exact
source. After commitment, native replay and retained-source checks admit complete
later edits, independent native document/comment boundaries, physical rotations
and immutable raster additions. The original manifest lineage, entire selected
prefix, raster bytes and original raster-file inodes must remain intact.
Byte-identical replacement intent/control files do not substitute for selected
custody. Unknown parent work remains refused and preserved.

Cold operational admission does not finish pending physical rotations, trim torn
native tails, initialize raster storage or clean pending uploads. Those require a
separate explicit host recovery decision. Component owners are reacquired under
the held parent lease; the raster lock transfers directly into its store without
a release/reopen gap. `check_live_source` repeats current retained-source and
control checks on the actual operational owners. Old ephemeral leases remain
absent after cold replay; original protected credentials and current account
permissions still govern resume.

This is a local Unix storage lifecycle, not portable deployment authority.
`origin` identifies the original recovery source rather than the room's current
content. The type does not launch services or establish provider mappings,
client journal/outbox coverage, asset availability beyond stored bytes, or fencing
of another host. Original-only operational APIs keep their original meanings.

## Inspect an incomplete native frame

An authenticated host can call
`OperationalLogGenerationServerRoom::inspect_committed_native_tail` with the
original independently retained source, its identity, and the latest complete
archive the host independently retained. If the active write-ahead log ends
inside a frame, inspection checks the committed marker and component custody,
replays the complete frames, and verifies that both supplied archives are
ancestors of the surviving cut. It exports that cut and all retained raster
bytes. The result includes the byte count and SHA-256 of the incomplete suffix,
which remains in the original log.

A malformed complete frame, missing retained work, pending rotation, or
incomplete raster upload makes inspection fail. A complete active log uses the
ordinary committed open. An operator can use the detached archive with
`ServerLogGenerationRoomRecovery::begin` to restore into a separate location
and verify the complete work. Serving a recovered room still requires the
normal provider, client and deployment controls.

## Prepared authenticated host

The SDK's [physical participant reader](SERVER_GENERATION_PARTICIPANT_INVENTORY.md)
retains this complete native physical source rather than treating its nested
native declarations as an original single-log file. Client-prefix diagnostics
are separate from the authenticated native state and protected-credential checks
below.

`prepare_log_generation_recovery_host` consumes the actual operational owner and
original admitted archive under an independently retained original selection and
fresh host authentication. Blocking native checks run on a worker, not the async
I/O thread. Transfer keeps the actual joined/native directory leases, raster
root and both native owners; there is no public bare-parts escape or drop/reopen
gap. The returned `PreparedLogGenerationRecoveryHost` exposes no router and starts
no network service. Failed preparation preserves durable files for explicit cold
operational resume.

Cloned handles retain actual ownership. An already running native transaction
also retains the directory custody and raster owner if its async caller is
cancelled and every handle is dropped. A native write can finish without an
acknowledgement in that case; exact native retries and cold recovery resolve its
outcome. Merely keeping the directory guards is insufficient if the raster lock
can close while that native write is still running. Raster decoding workers that
touch no existing store do not acquire storage ownership.

The host retains the original immutable archive through shared ownership for
later physical-prefix and raster-continuity checks. Cloning a handle does not
copy that archive. Large captures and native cold replay still need the complete
memory/performance qualification described above; the prepared host does not
change existing storage limits or qualify a production resource envelope.

The [prepared-host qualification](qualification/2026-10-21-prepared-generation-host.json)
records both positive cancellation failures before the repair and the same
regression passing afterward, including twelve repetitions. The public native
consumer keeps old offline work, rasters and future peer-preserving Undo/Redo;
an independently pinned long-prefix consumer repeats that workflow after 8,200
additional native events. The actual maximum 64-WAL prepared host also passes
under an isolated 192-descriptor limit. These are functional storage-lifecycle
checks, not physical power-loss, resource-envelope or production certification.

`capture_recovery_state` authenticates the current owner and captures complete
current native/raster files and every current registration under the same
room-then-assets transaction. `ServerLogGenerationRecoveryStateIdentity` pins the
original joined archive, complete current joined archive and current
generation-bound participant inventory. It never substitutes document/comment
clocks or an original-only room identity for the physical manifest and whole
native archive. Actual native directory and raster-lock witnesses bind each
borrowed component to its coordinator; equal archive bytes from another restored
directory do not transfer that custody.

`verify_selected_recovery_state` requires independent current selection, fresh
owner authentication, actual retained original files and every current protected
document/review resume record. Revoked and permanent-observer streams remain in
that set. Later registrations need their own credentials in addition to all
originals. Missing records yield Pending rather than a partial proof; wrong,
unknown or checksum-valid omitted records refuse. Verification changes no grant,
registration, native event, acknowledgement or connection lease.

`VerifiedServerLogGenerationRecoveryState` is a weak, non-serializable proof for
one exact live host and cut. `check_live` reauthenticates and checks the actual
complete source again. Physical-only cuts, raster-only additions and changed
registrations or permissions stale it. Ephemeral resume alone does not change
the selected files. The proof neither keeps a stopped host alive nor authorizes
a byte-identical second host.

`capture_asset_recovery_state` composes that same current selection with the
complete generation-bound server dependency read. Whole Ready/Pending semantics
and the existing 32 MiB encoded-result bound remain intact. Ready means complete
server references, not available provider bytes or client/offline completeness.
No provider fetch, upload, pruning or client flush occurs. Original server
capture, identity, provider and router meanings remain unchanged.

## Functional evidence and remaining work

Native regressions cover forty independent document/comment families with real
accepted/offline histories, PNG/JPEG/WebP bytes, exact old receipt retries and
future peer-preserving Undo/Redo. Public consumers cover ten compiler/transport
choices and repeat capture/restore after editing. Fourteen controlled filesystem
interruption prefixes resume without early joined completion. These are not
physical power-loss certification.

The [operational qualification](qualification/2026-10-21-generation-operational-recovery.json)
passes 313 relay, 203 no-networking, 66 candidate-runner and 1,331 script cases
on frozen source, plus strict linting/rustdoc and an independent public Rust
consumer. Forty independent document/comment families retain old offline input,
exact receipts and peer-preserving Undo/Redo through two operational cold reopens.
Six real operational publication prefixes resolve without adopting unrelated
files. A reproduced shared-finalizer failure passes with its positive assertion
unchanged: complete replay now refuses a real pending rotation without finishing
it, while explicit native repair remains separate.

Maximum-layout operational recovery also passes under the isolated
192-descriptor limit. Three existing opt-in skips remain skips. The unchanged
core/runtime inputs and byte-identical public archives carry their prior
qualification; the complete 178-check functional plan is not rerun by this slice.

Remaining lifecycle work is matching generation-aware room catalogs, provider/client
journal and outbox reconciliation, historic-copy disposition and authenticated
whole-room host activation. A stored raster inventory does not prove all historical
or offline asset references have provider mappings and available bytes. Cross-host
fencing and complete memory/performance qualification remain open. This server
component does not establish V1/full feature parity or close the thirteen release
gates.

The earlier [joined qualification](qualification/2026-10-21-joined-generation-server-recovery.json)
passes 304 relay, 194 no-networking, 66 candidate-runner and 1,331 script cases
on frozen source, plus strict linting/rustdoc and two independent Rust-consumer
checks. Three existing opt-in script skips remain skips. Both reproduced
provenance assertions pass unchanged. Maximum-layout joined recovery and the
prior archive/reader regressions pass under the same isolated 192-descriptor
limit without changing system settings. Exact unchanged core/runtime/package
evidence is carried explicitly; this is not a fresh whole-plan qualification.
