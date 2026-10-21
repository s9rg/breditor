# Physical server generation participant inventory

The SDK admits the distinct native physical-generation participant file without
turning it into an original single-log inventory. It retains the native event
cut, physical manifest, whole native archive digest and complete inventory
digest. Client-prefix diagnostics keep that same complete source identity.

Pair this metadata with the independently selected
[generation server archive](GENERATION_SERVER_ROOM_RECOVERY.md), actual native
registration verification, client files and current host authority. A valid
metadata checksum does not establish native replay, permission or room readiness.

## Selected file admission

`readSharedServerLogGenerationParticipantInventory(file, expected)` requires an
independently retained `SharedServerLogGenerationParticipantIdentity` from native
owner-authenticated capture. The SDK copies the selection before its first await,
snapshots the immutable Blob, and checks the exact digest, closed family, canonical
UTF-8 encoding and agreement between the complete physical source and nested
native declaration. The result and its detached metadata are deeply frozen.

The exact file family is `breditor/server-log-generation-participants` version
one. Its `source` contains the native global cut, `manifest` and `archiveSha256`.
Its `native` field contains the unchanged closed native participant declaration;
that field is not an independently admitted original storage file. Native writers,
review actors, account ordering, observers, revoked contributors and metadata
bindings keep their original meanings.

The outer file has the native 4 MiB plus 128 KiB metadata ceiling. A global cut is
bounded by the existing 64 physical WAL files and 4,096 records per file. This is
not a new single-file limit or a supported-memory/performance qualification. The
original inventory reader and both existing catalog revisions retain their
original file families and 4,096-record cut limit.

Byte admission reads the native Blob length, not an overridable public subclass
size, before byte-buffer or hash reads. The immutable snapshot must contain that
complete byte length. Partial or misleading snapshots cannot establish a file
handle.

## Client prefix diagnostics

`checkSources` checks genuine original client backup/capture pairs.
`checkGenerationSources` checks genuine generation backup/capture pairs using
native history reads, without flattening generations or resetting history.
`checkMixedSources` accepts explicitly tagged original/generation entries in one
synchronous cohort and refuses duplicate document writers or review actors
across either family; no copy is chosen or discarded.
Both return `{source, coverage}`. The complete physical `source` must remain part
of any later catalog or activation selection; extracting only the native event
cut loses physical-only rotations.

Coverage checks do not flush clients, acknowledge offline work, change grants,
acquire writer leases, request account tokens or contact providers. Missing or
server-ahead streams remain pending, and mismatching accepted prefixes refuse.
Unbound local review histories remain unresolved even when document writers are
covered. Duplicate stream copies require explicit reconciliation.

`dispose()` closes this reader's file and source checks only. Detached identity
and metadata remain inspectable; borrowed clients, captures, journals and uploads
stay owned by their callers. A disposed or fabricated reader cannot produce new
coverage. Metadata and coverage expose no credential-verification or activation
method.

## Recovery integration

The functional native bridge uses actual physical storage, independent native
document/comment boundaries, restored inactive hosts, fresh owner authentication
and separately protected stream credentials. Client tests use genuine original
and generation histories, cold reopen and future document/review Undo/Redo. A
physical-only cut keeps native counters unchanged but changes the complete source.

The matching physical-server catalog, complete provider mappings and actual asset
bytes, all client journals/outboxes, historic-copy disposition and authenticated
whole-room activation remain required. Existing original-only catalogs are not
silently upgraded to carry this new source family.

The [qualification](qualification/2026-10-21-server-generation-inventory-sdk.json)
pins the native files, complete source and fresh installed archives. Ten native
profiles include a source beyond 8,192 records and physical-only changes with
unchanged native counters. Genuine client tests cover 60 cold generation
recoveries, 60 mixed cohorts, duplicate/ownership refusals and exact future
document/review Undo/Redo. Source and installed assertions are identical. These
use synthetic IndexedDB, locks and raster presentation, not browser durability
or whole-room readiness.
