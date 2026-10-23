# Operational reference reads

The private reference readers discover required asset addresses before later
image bytes are available. They cover complete independent-delivery operations,
restored delivery graphs, independent local-only operations and imported snapshot
or flat local operations. They require genuine journal-backed sources,
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

`captureLocalOperationReferences` covers ORIGINAL, CURRENT, PENDING and LIVE
for local-only native document/comment histories and ordered immutable versions.
It does not invent a relay, delivery outbox or retained-review registration. An
independent read grant remains usable after the writer grant ends. A save retry
with identical native state still invalidates the private retained-state pin.

`captureLocalInputOperationReferences` uses one closed read path for genuine
snapshot-v1 and flat-local-v1 source journals. Every admitted imported native
state contributes its references, followed by the operation's CURRENT, PENDING
and LIVE. The imported binding manifest remains explicit. Neither a format tag
nor a caller adapter can select a different family; no relay is fabricated.
The native states preserve chronological document/comment ancestry and exact
ordered version prefixes in the independently selected read runtime.

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

A completed read-only journal `progress()` inspection does not advance that
epoch. The inspection still excludes concurrent journal work while it runs.
Three fixed laws exposed the former status-read invalidation: one against saved
local-only code and two against the developing shared snapshot/flat reader. The
same laws pass after changing only the respective journal modules. Actual save
and retry attempts continue to invalidate earlier pins.

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
All five families now pass the collection law with five disposed handles per
family intentionally retained; their read callbacks are released.

## Bounds and remaining integration

Each reference read has a separate 100000-pair union budget. Exceeding it refuses
without truncation; it does not change old file admission or native history limits.
Original/input, packet, native and operational source bounds remain in force.

The [five-family qualification](qualification/2026-10-23-local-input-reference-read.json)
passes twelve normal selected stages. Source, fresh offline packages and actual
bundled code each pass the same 243 laws. The prior 197 laws remain, with one
local status-inspection regression, 43 snapshot/flat reference laws and two
additional callback-release laws. Five strict type fixtures and the selected
legacy journal, participant and cohort regression stages also pass.
The new domain uses one normal language-three profile with all four native
history pairs and active/expired writer grants, not the full native-policy matrix.

The original and generation recovery families, all-seven coordinator integration, explicit
historical-copy decisions, actual upload/provider bytes, current server authority
and authenticated activation remain separate work. These readers alone do not
establish complete provider/client reconciliation or V1 readiness.
