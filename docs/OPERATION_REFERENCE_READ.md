# Operational reference reads

The private reference readers discover required asset addresses before later
image bytes are available. They cover complete independent-delivery operations
and restored delivery graphs. They require genuine journal-backed sources,
matching read-only factories and current read authorization. They do not require
a current upload store or resolve later raster bytes.

These are reference reads, not backups, provider proofs or activation grants.
The retained original and imported input files must still pass their existing
complete readers, including native and raster admission.

## Captured native and packet states

`captureIndependentOperationReferences` covers the original, acknowledged
CURRENT, optional PENDING and newer LIVE. References come from actual native
retained history, local versions and selected retained proposal, revision and
version packets. Removing a proposal from LIVE cannot hide its image from a
retained PENDING cut. A final-document AST scan is not used as a substitute.

`captureRestoredGraphReferences` also covers every distinct admitted ancestry
state in its snapshot-v1, lineage-v1 or lineage-v2 input. Input-state manifests
remain explicit in the detached report. The latest input LIVE cannot replace
earlier input bindings. An older pending-only opaque image remains required
even when all current slots and the upload store omit it.

Read-only replays use the independently selected reader runtime. Restored
CURRENT and PENDING must continue both the historical original and newer
imported input-LIVE, including their retained version sets. The writer's own
journal separately verifies its actual source in its own runtime.

## Authorization and currentness

The three checks have different responsibilities:

- `check()` invokes current synchronous read authorization and checks source
  identity, native stamps, cancellation, storage context and read lifetime.
- `verify()` also rereads and admits the actual durable original, imported input
  where applicable, intent, native cuts and observed source state.
- `checkCurrent()` performs the final managed-native, retained-intent,
  cancellation and lifetime checks without read-authorization callbacks or I/O.
  Run it after all selected sources' host callbacks before using a read result.

A successful persistence retry can advance CURRENT/PENDING without changing
either native or companion stamps. Each journal therefore issues a separate
private persistence-epoch pin. A write attempt conservatively invalidates older
pins, even if that attempt later fails. Serialized sequence numbers cannot issue
this witness. Direct stored-byte changes require durable verification; a local
epoch is not a replacement for reading storage.

Writer authorization and cancellation do not authorize this read. An ended
writer grant may coexist with a valid independent read grant, but the read does
not allow further writes. Native packet dependencies that remain unresolved
produce `pending`. A `ready` reference report means those dependencies resolved,
not that image bytes or provider permissions are available.

## Read ownership and disposal

The actual journal borrow remains held while the read handle is live. No source,
upload, author lease or coordinator ownership is transferred. Disposal releases
that read borrow and clears its check, final-check, verification and release
callbacks. Keeping a disposed handle for its detached report must not retain its
read authorization or captured recovery closures. Repeated disposal is harmless;
live checks refuse after disposal while metadata remains diagnostic data.

The two unchanged collection regressions retain five disposed handles per family
after closing the actual source and synthetic database fixture. Old handles retain
the callbacks and fail; repaired handles release them and pass. Closing the
fixture before collection separates this ownership test from fake-indexeddb's
retained completed transaction history. This is not a browser heap benchmark.

## Bounds and remaining integration

Each reference read has a separate 100000-pair union budget. Exceeding it refuses
without truncation; it does not change old file admission or native history limits.
Original/input, packet, native and operational source bounds remain in force.

The [selected qualification](qualification/2026-10-23-operation-reference-read.json)
passes six normal selected stages. Source, fresh offline packages and actual
bundled code each pass the same 134 laws: 85 prior portable/graph laws, 47 new
reference-read laws and two disposal laws. Three strict type fixtures also pass.
The new domain uses one normal language-three profile with all four native
history pairs and active/expired writer grants, not the full native-policy matrix.

The other five recovery families, all-seven coordinator integration, explicit
historical-copy decisions, actual upload/provider bytes, current server authority
and authenticated activation remain separate work. These readers alone do not
establish complete provider/client reconciliation or V1 readiness.
