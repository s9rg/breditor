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
Durable operational handoff and reopening a continuing joined directory remain
separate work; exact historic restore is not operational resume.

## Functional evidence and remaining work

Native regressions cover forty independent document/comment families with real
accepted/offline histories, PNG/JPEG/WebP bytes, exact old receipt retries and
future peer-preserving Undo/Redo. Public consumers cover ten compiler/transport
choices and repeat capture/restore after editing. Fourteen controlled filesystem
interruption prefixes resume without early joined completion. These are not
physical power-loss certification.

Remaining lifecycle work is durable operational handoff/reopen, provider/client
journal and outbox reconciliation, historic-copy disposition and authenticated
whole-room activation. A stored raster inventory does not prove all historical
or offline asset references have provider mappings and available bytes. Cross-host
fencing and complete memory/performance qualification remain open. This server
component does not establish V1/full feature parity or close the thirteen release
gates.

The [joined qualification](qualification/2026-10-21-joined-generation-server-recovery.json)
passes 304 relay, 194 no-networking, 66 candidate-runner and 1,331 script cases
on frozen source, plus strict linting/rustdoc and two independent Rust-consumer
checks. Three existing opt-in script skips remain skips. Both reproduced
provenance assertions pass unchanged. Maximum-layout joined recovery and the
prior archive/reader regressions pass under the same isolated 192-descriptor
limit without changing system settings. Exact unchanged core/runtime/package
evidence is carried explicitly; this is not a fresh whole-plan qualification.
