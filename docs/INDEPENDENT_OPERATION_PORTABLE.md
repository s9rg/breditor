# Portable independent operation data

The private operation archive captures the immutable original participant,
acknowledged save, interrupted save and newer live native work in one selected
file. Whole upload state and raster bytes referenced by any retained state travel
with it. This is a complete data capture and read boundary; a portable operation
restore coordinator and whole-room adoption remain required before public use.

The separate [recovery lineage archive](INDEPENDENT_OPERATION_LINEAGE.md) now
retains complete selected inputs with later snapshots using shared raw parts.
That provenance data layer does not yet make a restored source own its input or
provide the durable restore coordinator.

## Separate read authorization

Capture requires the actual source that owns the private operation journal, its
actual upload store, an explicit read-only native factory and current synchronous
read authorization. A different genuine source with the same historical identity
cannot borrow this journal. Invalid factory policy releases the real read scope
before refusal, allowing source close to finish.

The source's original write grant and write cancellation signal do not authorize
or prevent this read. Losing write access must not hide owned unsaved recovery
data. Read cancellation, authorization, storage context and source lifetime are
checked separately throughout capture. The borrowed scope cannot prepare or
acknowledge a save. It holds the actual journal and original replay until release;
journal close also waits for its outstanding reads. A newly opened read connection
closes even when authorization expires during that open. An actual reproduced
late-refusal leak is covered by the same failing and repaired lifetime assertion.

## Coherent original and save states

The journal retains its original file unchanged. Capture reads complete journal
intent, the whole dedicated source database and journal intent again. Both intent
reads must agree, and the actual source must equal its acknowledged or exact
pending cut. A dedicated database with a foreign head or unreferenced native file
refuses rather than silently selecting a convenient row. Source startup now runs
the same whole-database check before factories or autosave.

Live native data and whole uploads are captured together under the upload store's
existing read snapshot. Genuine source stamps fence changes across asynchronous
raster resolution, encoding and readback. Capture neither flushes nor retries a
failed write. Pending native work remains distinct even when live work has moved
on or an explicit Stop or Forget action removed a queued proposal.

## Native continuation and raster conservation

The reader replays original, current, pending and live states through the host's
explicit read-only Rust factories. Each later state must continue the preceding
document and comment histories, retain local versions and preserve forward relay
progress. Packet admission remains native. A valid descendant of the original
alone is insufficient: live state cannot roll back behind an acknowledged cut.
Temporary read-only owners do not acquire author leases or open destination
stores.

The read factory may be an independently loaded instance of the same supported
runtime. Capture replays the exact original inside that reader instance and
compares temporary owners there. The live writer remains checked by its own
journal and native origin; its native owner is never passed into another
instance's bindings. This changes no native checkpoint or file protocol. The
[reader-runtime qualification](qualification/2026-10-23-reader-runtime-recovery.json)
records the reproduced failure and the unchanged passing regressions.

The raster manifest is the exact union of native retained-history, local-version,
queued suggestion, revision and cached-version references across those states.
Pending-only images retain their bytes even after the proposal is forgotten in
live memory. Missing or uncached references produce explicit pending results;
resolver refusal or source mutation does not dispose the caller's source.

Every original upload row survives with its content identity, dimensions, MIME
type and byte count. Epochs and attempts cannot decrease. A previously uploaded
row keeps its uploaded status and acknowledged storage reference. Original opaque
raster bindings also retain their selected content and addressing mode. All
original upload and raster metadata comes from the pinned original bytes, not a
replaceable archive facade.

## New file family and bounded raw parts

`breditor/shared-independent-operation-backup` is a separate closed format. Its
canonical manifest selects ordered, nonoverlapping raw parts with exact byte
counts and individual SHA256 hashes. A domain-separated `manifestSha256` binds
the complete manifest, which covers the original archive, both complete native
cuts, live native and outbox records, whole uploads and raster payloads. It is not
the old participant whole-Blob hash, an author signature or current permission.

All part hashes are checked before any native factory runs. Unknown fields,
missing or trailing parts, overlap, incorrect native file kinds and inconsistent
intent refuse even when their replacement manifest hash is internally valid.
No single whole-archive byte array is required for the new aggregate file; each
selected part is hashed separately. Original archives and individual native
records retain their existing bounds. The raster union permits at most four
independently bounded reference sets without changing the older single-source
codec.

Each selected state permits at most 1024 distinct packet or revision-pair reads
and 100000 distinct asset/generation pairs. Exceeding a capture bound refuses
explicitly; the archive does not silently discard references to fit.

## Required functional checks and remaining work

Both candidate profiles require 31 focused capture/read laws, a strict public API
fence and the complete 640-case native-policy probe in source and freshly
installed matching packages. The installed laws change only reversible module
and fixture locations; the full probe is byte-identical. It checks exact save
cuts, original and whole-upload bytes, unchanged databases, revoked-write export
and future document/comment Undo and Redo against a native replay oracle. That
oracle restores native data only; it does not qualify portable operation restore
or adopt the original/current/pending journal.

The next restore boundary must retain the complete incoming archive, use new
explicit destination names, preserve the immutable original and all incoming
save states, reconcile whole uploads under genuine custody and resume interrupted
publication without overwriting foreign work. Current write permission and
native factories remain fresh host inputs. Historical file metadata grants
neither. Public root exports and old codecs remain closed to this new family.

Native lifetime limits, including the 1000-item client Undo ceiling, remain.
Storage quota, memory, latency and physical crash durability still need
qualification. Whole-room adoption, historical-copy decisions, provider/client
reconciliation, independent comment/server-log generations and authenticated
activation remain architectural work. All thirteen V1 gates remain open.

The [selected functional qualification](qualification/2026-10-22-independent-operation-portable.json)
passes 20 checks from the 266-check plan. Source and fresh installed packages each
pass all 31 laws and all 640 configurations, with 1920 future history comparisons.
Existing journal and operational-owner 640-case matrices also pass in both
environments. Three independent consumers pin matching archives. Script tests
pass 2064 with three existing opt-in skips; workspace and diagnostic checks pass
2647 and editor integration passes 385. The retained evidence includes all three
reproduced failures and repairs and the initial matrix fixture failure. This
qualifies capture and reading, not portable operation restore or V1 readiness.
