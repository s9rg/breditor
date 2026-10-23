# Seven family physical room catalog

The private V3 catalog adds explicit retention for local-operation snapshots and
flat local provenance. It retains complete server and client files, reopens their
actual bytes and checks selected native prefixes. It does not adopt writers or
uploads, reconcile every retained copy, or authorize a replacement service.

## Closed file families

The canonical physical-catalog manifest and immutable state record use version 3.
The five existing tags keep their meanings: `original`, `generation`,
`independent-local`, `independent-delivery` and `restored-graph`. Two new tags,
`local-operation-snapshot` and `local-operation-flat`, invoke the actual snapshot
and flat-local readers respectively. A local file is not a delivery graph.
Version-one and version-two readers remain closed to V3 manifests and tags.

The file table contains origin server, current server, current inventory and
every supplied participant copy. Sorting or checking sources never selects a
preferred historical branch, removes a copy or manufactures a review binding.
An omitted source remains an unreconciled participant.

The database uses schema version 1 with only `physical_room_v3_state` and
`physical_room_v3_files`. Its protocol record is version 3; database schema and
protocol versions are separate. Begin writes only to an absent database. Resume
requires that exact schema, sole state record and complete file table, then
re-admits every file. Missing acknowledged files, occupied destinations and old
schemas refuse without reconstruction, migration or overwrite.

## Fresh read policy and genuine owners

Every restored graph still requires its separate graph policy. Each local file
requires a `localPolicies` row naming the exact catalog ID, local family,
independently selected original and fresh read-only native factory/policy.
Duplicate, omitted, unrelated and wrong-family policies refuse. Serialized data
does not choose executable code or reuse an ended writer grant.

The catalog reserves its actual namespace before policy callbacks or factories.
It owns the real archive, database connection and cooperative lease. Admission
releases all partially created readers on failure; cleanup retains durable bytes.
Owners under construction remain unavailable until their final checks finish.
These classes and contracts are private, not new package-root exports.

Local prefix sources use actual incoming-source captures against the catalog's
own admitted archive handles. Equal selections or bytes from another handle do
not substitute. Cold reopen therefore requires fresh captures. Native document
and comment families and ordered local versions keep their original identities;
local comments remain explicitly unbound to server delivery.

## Coherent native and input fences

A repeated permission check alone cannot make a group coherent: its last
callback could edit a source already checked. The V3 read constructs wrappers
and performs policy/record checks before a final native/input witness. That
witness calls no permission or restore factory. It checks actual capture
registrations and native lane epochs, admitted input lifetime and, for local
incoming sources, their held journal/source/storage and version stamp.

The durable catalog carries the same final fence past its own final authority
callback. A mutation there refuses with a structured catalog-source failure.
The witness is neither a fresh authorization callback nor a serialized readiness
flag. All normal source checks remain required before it.

This fence does not cover every legacy retained-store epoch or live provider.
Complete retained-state/provider/client reconciliation and current authenticated
grants remain prerequisites for operational adoption and whole-room activation.
Native prefix diagnostics must not stand in for those proofs.

## Bounds and qualification

The existing physical envelope remains 4,096 files, 16 MiB of canonical metadata
and 16 GiB of declared total bytes. Native source diagnostics retain their
separate 1,024-source limit. Child formats keep their own lower limits. These are
admission ceilings, not large-file or long-session performance approval.

Both candidate profiles require focused source laws, strict nominal types, the
fixed source probe and a fresh installed consumer. The probe covers five normal
native profiles and four document/comment history combinations, with atomic-v2
inventories and all seven retained file families. Twenty cases preserve native
recovery, versions, complete view and whole uploads through exact cold reopen;
seven unselected copies per case stay unresolved. This is not the full Cartesian
transport, role or older-family selection domain. Existing larger recovery
domains remain mandatory and are not replaced.

Installed assertions may change only reversible module/runtime/fixture
locations. The installed probe is byte-identical; an actual production bundle
repeats its workload with proxies pointing to the same bundle-owned classes and
registrations. Synthetic storage does not qualify physical durability.

The [functional evidence](qualification/2026-10-23-physical-catalog-v3-functional-evidence.json)
covers 49 selected domains: 45 normal stage passes and four recovered SDK
completions with directly observed zero exits, exact inputs and complete reports.
Their interrupted runner manifests and partial logs remain unchanged; this is
not 49 normal candidate-stage passes. Source, fresh installed packages and the
actual bundle each pass the twenty-case workload with equal results. The full
480-case flat, snapshot and journal source/installed domains and the five-family
480-cohort domains also pass. Eight fresh consumers pin matching archives.

A subsequent [snapshot handoff repair](qualification/2026-10-23-snapshot-handoff-construction.json)
is integrated and verified separately. Four unchanged regressions reproduce the
old construction fault; 17 selected main stages and two independent frozen full
SDK stages pass normally. Matching common inputs and actual archives bind those
full source/installed results to the repair without relabelling them main runs.
The original V3 qualification above remains an immutable earlier checkpoint.
Native Undo and generation ceilings,
operational recovery, remaining feature parity and all thirteen V1 gates remain
open. No version, public API, publication, push, tag or deployment is promoted.
