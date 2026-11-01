# Source resolution with original client Pending preserved

Two original facts can both be true: a client has not downloaded a version, and
its selected server already retains the complete immutable version packet. The
older recovery scope deliberately stays Pending for the first fact. The new
scope retains the second fact separately, with its complete image bytes.

The reproduced case has seven actual Native participants and three local
metadata lanes. Two accepted versions are absent from later clients' packet
caches. Their six stored/current Pending occurrences prevent the old combined
closure and old raster capture from becoming Ready, although the selected server
retains both version bodies. The original result remains literal DATA.

## Owner API

`SelectedLocalMetadataDelivery.captureResolvedServerPacketRecovery(input)` takes
the same genuine selected delivery host, server archive, inventory and asset
transport as the original `captureServerPacketRecovery` method. It returns a
`ResolvedServerPacketRecoveryOutcome` with a separately named bundle:

- `original` is the complete original `ServerPacketRecoveryBundle`, including its
  unchanged client reference result, packet attempts, receipt and raster outcome.
- `resolution` selects immutable JSON by exact byte count and SHA-256. It records
  additional Native source knowledge, every original requirement and its witness,
  and either the complete reference union or explicit remaining blockers.
- `assets` retains the complete new local/provider raster union or explicit
  Pending requirements. It uses the existing raster frame meaning; inspection
  derives its requirements again from the new source scope.

`inspectResolvedServerPacketRecovery(bundle, host, options)` independently checks
both scopes against the actual metadata owner and a newly authenticated inactive
server reconstruction. Its immutable inspection DATA exposes `original`,
`resolution` and `rasters`. It provides no writer or activation method.

Both methods reserve the existing owner task before reading supplied fields or
Blob getters. They retain the original parent, journal and current Native guards.
Copied host objects cannot replace private host custody. Reentrant operations
receive the existing busy refusal.

## Required source evidence

Every applicable original/generation origin and Native state, every fresh family
state, and all before/stored/current metadata lanes contribute their literal
Pending entries. Local paths distinguish repeated occurrences. Retained packet
requirements preserve each original body's complete ordered Native attempt
matrix; they are never flattened into a manufactured missing-source record.

A source requirement can be covered by:

1. An exact declared packet body independently read Ready through genuine
   readonly Native readers.
2. A complete version packet retained in the selected Native source file. All
   seven families are admitted with the owner's constructor-bound read factories.
   Their literal source version arrays retain the existing Native lineage and
   version-prefix checks; each packet is decoded through Native and matched to
   the same document/schema.
3. An exact source in the selected server's complete Native dependency inventory,
   including the established derived revision-child relation. Complete server
   Native Pending cannot supply a Ready witness.

Every declared client source is admitted; the first successful witness does not
skip another family. Unknown packet identities remain Pending. Unreconciled
clients remain separate blockers even when their immutable packet bytes are
available. Source availability cannot settle a client's transport work.

The new Ready reference set includes all known original historical Native
references, Ready metadata-lane references, Native-read retained packet
references, source-version references and the complete server Native references.
It preserves paired asset/generation values and uses the established ordering.
The complete original and selected upload inventories are still read, including
all fourteen roles in the seven-family workflow. This does not discard known
references merely because a separate original metadata lane remains Pending.

## Independent inspection and raster bytes

Capture first creates the unchanged original result. It then rechecks the actual
server inventory against those same selected bytes and brackets the additional
source and provider reads under genuine host checks. The new resolution binds
the exact reference, packet-manifest and dependency-file pins.

Inspection runs the full original portable inspector: all seven saved Native
histories, exact original packet/reference outcomes, every local occurrence and
receipt point, recorded base availability, exact catalogs and first-server packet
strings, selected server files and complete Native equality. It then independently
recomputes the new source-version facts and resolution under another actual
selected-source check. Rehashed Ready labels or omitted witnesses cannot supply
source proof. The stored resolution must match the entire canonical recomputed
result, not just its final reference list.

Every retained raster is hashed and decoded. Actual Native requirements, all
upload roles, the complete local/provider payload union and fresh provider
meaning must agree. A second current provider read must be unchanged. The old
Pending raster outcome remains in `original`; new bytes do not rewrite it.
Downloads do not insert into held client caches or acknowledge uploads.

The JSON file budget is 64 MiB. Native source-version reads and explicit source
requirements have separate 1,000,000-entry limits; reference sets keep the
existing 100,000-pair limit. All are explicit refusals, with no truncated Ready
prefix. Original file, packet and raster bounds continue to apply.

## Reproduction and qualification

The fixed public Pending fixture is from the actual original owner reproducer.
Its compressed SHA-256 is
`f49c7ed524d513b34c214fc41b7d7452eaa8cd1100d4b2817cb5afb79883ff99`.
The loader verifies all ten content-addressed objects. It needs no old service,
credential, storage or filesystem location. Its saved Native replay reproduces
the literal old Pending and original packet facts before testing the new scope.

The actual owner workflow publishes original document/review/metadata work,
creates the uncached catalog state, captures and saves the new bundle, reconstructs
the selected server with fresh authentication, and inspects the saved bytes. Its
refusal cases cover omitted resolution occurrences/references, changed file bytes,
a valid incomplete raster frame, an older genuine server, copied hosts and Blob
getter reentry. The outer original workflow subsequently checks document and
review Undo/Redo on all seven participants.

The new qualification plan includes every earlier portable packet test, the
saved Ready/Pending Native checks, the actual private unseen-source Pending
matrix and the new owner workflow. It also compiles strict public API types and
runs independently installed offline npm archives. Commands after building the
workspace and preparing the bounded Native fixture executables:

```sh
node scripts/check-pending-source-resolution-source.mjs
node scripts/check-pending-source-resolution-installed.mjs
```

Qualification results must name the exact executed source and distinguish the
source tests from independent installed acceptance. A preview or a saved DATA
composition check alone is not complete owner or release qualification.

The [main-tree qualification](qualification/2026-11-01-server-packet-source-resolution.json)
passes all 42 source and 42 independently installed cases without skips or
cancellations. Both environments use the exact frozen source and strict public
types. The saved proof reads back every object and compares all compiled SDK
files to the independently packed archives. The unchanged Rust executables and
normal Wasm are retained by exact hashes; this SDK checkpoint does not claim a
new full Rust or complete release-profile run.

## Remaining V1 work

This adds source/raster retention and inspection. Current full provider/client
and outbox reconciliation, independent comment/server-log generations,
authenticated whole-room activation and complete release profiles remain
required. All thirteen V1/parity gates remain open. The Rust source, original
protocol meanings/defaults and normal Wasm are unchanged by this SDK addition.
