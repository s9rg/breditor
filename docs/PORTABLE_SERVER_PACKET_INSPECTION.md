# Portable client/server packet inspection

`SelectedLocalMetadataDelivery.inspectServerPacketRecovery(bundle, host, options)`
inspects an already captured `ServerPacketRecoveryBundle` while the genuine
metadata owner and its parent remain held. It returns immutable
`ServerPacketRecoveryInspection` DATA. The method checks the saved Native client
cut, the selected server, original packet strings and retained raster bytes.

A caller supplies a genuine `SharedServerLogGenerationRecoveryHost` for an
inactive replay of the selected server. The Rust reconstruction action and its
fresh authenticated operator setup are documented in
[server packet source inspection](SERVER_PACKET_SOURCE_INSPECTION.md). The
inspector does not provision accounts, reconstruct an operational client, install
receipts, acknowledge uploads, serve a room or activate an editor.

## Admission and ownership

The existing metadata-owner task barrier reserves the operation before reading
incoming fields or Blob properties. Copied host objects are refused. An incoming
Blob getter cannot reenter an owner operation: the nested operation receives
`local_metadata_delivery_busy` while the admitted outer operation continues.

The complete envelope is detached with closed field sets. Both copies of the
reference bundle must select the same five files: reference cut, metadata,
delivery, selected current room and prepared-before room. The nested copies are
also hash-checked; matching counters and JSON cannot hide a different Blob.

The parent admits the saved reference and metadata cuts and compares their
relationship with its actual journal. The journal is checked again after the
inspection. Current Native document/review stamps and current parent/host
custody must survive every asynchronous read. A saved permission, token, ACK,
lease or copied report never supplies authority.

## Native replay and original facts

Actions have separate files under `src/metadata_packet_replay/`. Original,
generation, independent delivery, independent local, restored graph and the two
local-operation families keep their own replay rules. The inspector reads all
literal origin, committed, attempted, pending and LIVE phases applicable to each
family. Existing Native lineage, version-prefix, relay-progress and descriptor
checks remain required.

Read factories come from the actual owner's constructor-bound read set. They
must yield readonly Native cores. Current editable cores provide current
liveness and schema checks; they do not replace the archived checkpoints. One
temporary Native alias is used at a time. Aliases close on success and failure;
a raw restore that finishes after cancellation is freed without invoking the
visitor. Incoming DATA never creates a `RetainedDeliveryClient` or operational
owner.

Every body is read through genuine Native packet-reference APIs. The original
source order, exact reference union and complete original Pending attempts must
match the capture. A later source may resolve a packet, but its readiness does
not erase the separate original diagnostics. All sources are replayed even when
an earlier source already resolves every packet. The new reader explicitly
refuses more than 1,000,000 attempted packet/source reads or missing ends;
reference and archive limits continue to apply. It never truncates a result.

The traversal recreates every ordered local packet occurrence from saved
records, actual original parent stores, restored targets and both local metadata
points. Packet keys hash the original JavaScript string through its canonical
JSON string encoding, preserving the original capture convention. Native receipt
comparison independently recreates every original point and Pending receipt.
Counts and stored labels alone cannot satisfy these comparisons.

## Selected server and raster closure

The genuine server must reproduce the complete recorded Native dependency
inventory, including physical preparation sources, every original catalog page
and terminal, and every first-server packet string and fingerprint. Disabled
catalog lanes are preserved. The actual server refuses a disabled query for an
enabled lane and refuses a start query for a disabled lane, so a checksum-valid
recorded catalog cannot hide an enabled feature.

Historical base availability is bound to the actual reference/current/upload
files and selected control. A separately authenticated provider checks its own
current mappings and asset information at the archived server. Its fresh
instance identity is not confused with the recorded instance. The combined
closure must exactly match the recomputed original client and complete server
requirements.

For retained assets, every encoded raster is hashed and decoded. Requirements,
local content and every original/selected upload role are derived again from the
actual selected client files. The recorded provider meaning must match the fresh
provider; the complete local/provider byte union must match the retained
payloads. A second actual provider read must be unchanged. Internally consistent
frames that omit a server-only packet image are refused by the owner even if the
older standalone raster byte reader admits them.

An original capture without complete raster bytes returns `recorded-pending`
with its literal missing DATA. That result does not claim newly recovered bytes
or a new availability decision.

## Result boundaries and remaining work

`originalPackets` reports the verified page/body, local-occurrence and receipt
point totals. `requirements`, `references`, `source`, `closure` and retained
`rasters` expose the separately checked facts. `recordedReconciliation` remains
historical DATA, including original Pending meanings; it is not fresh complete
client/outbox reconciliation. Types do not offer activation, queue settlement or
writable Native access.

The original scope keeps its literal base-Pending meaning. The separately named
[available source resolution](SERVER_PACKET_SOURCE_RESOLUTION.md) now retains and
inspects independently available Native/server packet sources and their raster
union while preserving this entire original result. A genuinely unknown source
or unreconciled client still keeps the new source scope Pending. Independent
comment/server-log generation integration, fresh complete provider/client
reconciliation and authenticated whole-room activation remain required. These
are inspection contracts, not V1 or feature-parity completion claims. All
thirteen V1 gates remain open.

## Reproducible checks

After the normal workspace build, prepare missing or stale Native fixture
executables with the existing bounded builders, then run both qualifications:

```sh
node scripts/build-server-metadata-native.mjs
node scripts/build-server-native-dependencies-native.mjs
node scripts/build-server-packet-inspection-native.mjs
node node_modules/typescript/bin/tsc -p packages/breditor-collaboration/tsconfig.json
node scripts/check-server-packet-inspection-source.mjs
node scripts/check-server-packet-inspection-installed.mjs
```

The [qualification record](qualification/2026-11-01-portable-server-packet-inspection.json)
records the actual 36/36 source and installed results and their exact executed
source. Both candidate profiles now require the existing bounded Native builder,
then run the stronger source and installed checks under the original recovery
verification groups. The new owner workflow calls the complete original recovery
workflow before inspection. Earlier verification groups remain required; the older
standalone runner retains its narrower historical scope.

The [release-plan qualification](qualification/2026-11-01-portable-packet-release-wiring.json)
passes 100 plan/runner checks and a real Native build. Its executable outputs and
all compiled SDK files match the already qualified bytes. Complete functional/full
release profiles and the remaining V1 gates are separate requirements. The
installed runner creates independent offline npm packages, copies the fixed
public Native fixture and actual Native host executables, compiles strict types,
and runs the same 36 cases. It verifies the executed source did not change.

The saved seven-family fixture retains only previously qualified public Native
DATA and content-addressed bytes. Its compressed SHA-256 is
`652339b7f700ee3483db93ba18398640608d84fc6c6e065398c723466cd41ecf`.
The loader verifies every decoded object. It requires no old test directory,
network service, storage, credential or current ownership. The genuine owner
workflow separately captures a fresh room and performs original document/review
Undo/Redo after inspection and refusal cases.

The normal Wasm remains pinned at
`165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0`.
Qualification records must distinguish this SDK change from earlier Rust server
reconstruction tests; this checkpoint changes no Rust protocol or default.
