# Physical room recovery catalog

The SDK can retain complete original/current physical server archives, the
current native participant inventory, and every selected original/generation
client file in one immutable catalog. Retention is insert-only and reopening
rechecks actual stored bytes. It does not stage clients or activate a room.

This is a distinct `breditor/shared-physical-room-recovery-catalog` version-one
family. Original catalog versions one and two keep their existing formats,
readers, limits and operational owners. They are not upgraded or relabelled.

## Independent selections and retained files

`SharedPhysicalRoomRecoveryCatalogArchive.capture` requires an explicit catalog
ID, original server file/identity, current server file/identity, current native
participant file/identity, and tagged client files/selections. Obtain server
selections through independent authenticated native capture; an incoming archive
cannot choose its own trust. The SDK copies selections before its first await.

Each server identity includes the native event cut, physical manifest, complete
native archive digest, raster binding/count/bytes/digest, and whole joined archive
digest. Current participant metadata must name that exact current native source.
Matching namespace, owner, profile, transport and nondecreasing declared counters
are necessary checks, not native ancestry proof. A physical-only rotation changes
the source even when the native document counters and raster counts do not.

The manifest separately retains `origin` and `current`; neither replaces the
other. `origin-server`, `current-server`, `inventory`, and `participant:<id>` are
the exact file keys. IDs are unique and sorted in canonical metadata. Historical
copies remain separate files, even if they name the same document writer or
review actor as a newer copy. No implicit winner, acknowledgement, garbage
collection or deletion is inferred.

`read` independently re-admits a selected manifest and complete file map.
`files()` returns a detached map of immutable Blobs, not the internal map.
Detached metadata stays inspectable after `dispose`; disposed readers cannot
return files or check sources. Disposal does not close borrowed clients.
It also releases the private file/client maps retained by closed catalog/stage
objects; cached metadata and detached caller Blob snapshots remain usable.

## Bounded server archive integrity

`readSharedServerLogGenerationRoomArchive` reads the existing native joined
transport as opaque native/raster sections. It checks closed canonical framing,
gap-free lengths, each selected section digest, the header digest, and the
independently selected complete archive digest. It does not replay native WALs,
decode raster images, authenticate protected streams or create a native owner.

The normal application Wasm exports a separate `SharedArchiveDigest` owner. It
uses the already pinned Rust `sha2` implementation, consumes borrowed chunks and
retains no input bytes. Its exact selected total is a canonical decimal string;
numeric ABI coercion cannot wrap a large or fractional JavaScript number into a
smaller accepted total. Oversized/overflowing updates and premature finish leave
the prior hash appendable. Successful finish is terminal; explicit `free` is
still required.

The SDK requires revision `1`, a 1 GiB independent hash ceiling and 1 MiB maximum
chunks. It snapshots the native factory/methods and frees every acquired owner
on completion, refusal, cancellation or authority changes. Reads and copies are
bounded before crossing the Wasm ABI. Direct raw Wasm callers must impose their
own pre-ABI copy limit; native validation cannot undo a glue-layer allocation.
`hashSharedArchive` exposes this byte-integrity component without claiming any
archive family or host authority. There is no one-shot hash fallback.

The server file ceiling remains exactly 827,900,086 bytes, the native section
554,041,408 bytes and the raster section 273,727,541 bytes. These values are checked
against the native public constants by the actual native-file probe. Existing
component ceilings are not widened. Metadata and client readers retain their
own existing parsing/resource contracts.

The catalog envelope is independently bounded to 4,096 files, 16 GiB declared
aggregate file bytes and 16 MiB canonical manifest bytes. Both server files count
toward that envelope. These are refusal ceilings, not promised browser quota,
peak-memory, throughput or long-session support. The 64 MiB digest test proves
bounded reads and non-scaling native digest working memory, not whole-catalog
resident memory or total process RSS.

## Durable retention and failure semantics

`SharedPhysicalRoomRecoveryCatalog.begin` borrows a genuine admitted archive and
an independent selection. It captures the actual IndexedDB factory before any
await, reserves rollback custody before acquiring its real recovery lease, and
atomically adds all files plus the sole immutable retention record in a fresh
database. Even an identical occupied database is refused; use `resume` with its
independently retained selection instead. Nothing upgrades or overwrites an
original catalog or unrelated database.

The distinct stores are `physical_room_state` and `physical_room_files`, database
version one. They have no indexes, key paths or auto-increment keys. Unknown
stores, extra markers/files, missing files, non-Blob values, altered manifests and
unselected file names refuse. The record has no stage, ready or activation field.
Missing inspection aborts its version-zero transaction without creating a ready
placeholder. A quota failure or interrupted creation aborts the atomic write.

Both `begin` and `resume` re-read and independently re-admit every actual stored
file before returning. If acknowledgement is lost after commit, the committed
files remain intact but no handle is returned; a later authorized `resume` checks
them again. The failed factory's actual handles/leases stay under opening-cleanup
custody until cleanup succeeds. No operation deletes an ambiguous destination.

`verify()` serializes a fresh coherent durable read and complete byte admission.
It detects disk changes rather than trusting cached metadata. `close()` prevents
new work, waits for an in-flight verification, closes its private read handles
and then releases the actual lease. A cleanup failure keeps custody retryable.
Version changes make the handle unusable; they do not migrate data. Closing and
failure paths never rewrite or delete retained files or participant stores.

## Prefix diagnostics are not activation

`checkSources` uses genuine original/generation captures, each matched to the
catalog's own admitted client backup. It returns `{source, coverage, kind,
selectedParticipants, unreconciledParticipants}` and keeps the full current
physical source pin. It performs no storage I/O, network request, flush, grant
change or offline acknowledgement. It checks cached retained files; use `verify`
separately for fresh durable integrity.

Unselected historical copies remain `pending`, even if the selected cohort covers
every current registered stream. Duplicate selected entries refuse. Existing
native prefix checks and writer/review leases still reject duplicate author
ownership; no test disables them. Local unbound reviews remain unresolved.

The separate [participant staging contract](PHYSICAL_ROOM_PARTICIPANT_STAGING.md)
now consumes genuine catalog custody and keeps read-only native clients in a
distinct intent database. The retention class itself still does not stage clients.
The complete operational parent remains work: continued restore lineage,
current provider mappings and actual bytes, every client/outbox
source, explicit historic-copy disposition, fresh protected credentials and
authenticated whole-room activation. Restoring a later server archive to a fresh
destination establishes a new native recovery origin; retaining an older origin
in this catalog alone does not authorize continuing it. No `stage`, `finish`,
`intoParts`, router or activation method is exposed by the retention class.

## Reproducible functional checks

The native producer captures ten real profile/transport combinations, including
a source beyond 8,192 records, actual physical-only rotations and separate
protected document/review registrations. The SDK probe admits all twenty native
server files and runs thirty mixed-family catalogs. It compares all 180 retained
files exactly after cold catalog reopen, preserves thirty historical copies, and
checks corruption, lost acknowledgements, mutable selections/factories, storage
context capture, cleanup retries and read/close serialization.

Fresh offline public packages repeat the unchanged native-file/catalog assertions
and all 35 bounded digest/transport tests with strict public types and production
import checks. The source and installed probes use synthetic IndexedDB, locks and
raster presentation; they are not browser durability or activation certification.
Both candidate profiles require these named checks. All thirteen V1 release
gates remain open; no release, version or public API freeze is promoted here.

The [qualification](qualification/2026-10-21-physical-room-catalog.json) pins
thirty passing architectural stages on frozen source, then the documentation-only
follow-up. It includes 325 relay, 264 complete no-networking, 666 collaboration
and three independent-review tests, plus 1,439 script cases and three recorded
existing opt-in skips. Both source and installed catalogs pass the same native
file assertions. The five new digest unit tests are included in the 666-case run;
the 35 digest and 35 storage script tests are included in the script total.

A positive pre-fix regression shows that an authority callback could enter
`verify` before its promise existed, starting overlapping reads. Verification now
reserves its busy state before any callback or async invocation; the same
assertion passes in source and installed packages. This repair concerns recovery
serialization, not the historical intermittent browser fault.

Original-runtime comparisons retain 49 exact document checkpoints, both restore
directions and future history, plus 1,440 original review comparisons. The normal
application export/path/dependency guards remain intact. The existing missing
dependency notice and license review remain open. This selected run is not the
complete 188-stage functional plan or a V1 release qualification.
