# Selected server replay and packet inspection stages

This opt-in work adds actual Native server replay and server-side comparison stages for portable packet recovery. Complete portable client inspection, provider/client reconciliation and authenticated whole-room activation remain unfinished. All thirteen V1/parity gates remain open.

## Native replay contract

The Rust action `reconstruct_log_generation_recovery_host` lives in `experiments/relay/src/server/generation_recovery/reconstruct.rs`. It takes an independently selected complete archive, absent target path, fresh host authentication, selected owner and current token. Authentication, owner identity and archive identity must match before target IO.

The blocking worker restores the complete original Native/raster archive, acquires the actual operational locks and transfers them directly into an authenticated prepared host. The archive remains literal; document/comment histories, original metadata, outstanding work and assets are preserved. The result creates no router, client writer, editor service, deployment lease or activation grant. Old account tokens and connection leases are not restored.

Existing paths are refused without adoption or overwrite. Failure preserves durable files for explicit recovery. Dropping the async future does not cancel an already running blocking worker; the worker owns its resources until its result is consumed or dropped. Interrupted state uses the existing explicit operational recovery APIs.

## SDK comparison contracts

These internal stages are deliberately separate from the public source-owned metadata coordinator. They will run inside its held owner inspection when complete portable client inspection is implemented.

- `source_files.ts` detaches a closed immutable selection of server, inventory and Native dependency files. Existing archive and inventory ceilings apply; the Native response ceiling is 16 MiB.
- `inspect_source.ts` verifies all three hashes, selected archive/inventory codecs and the recomputed original request hash. It requires a genuine current host private port whose origin and current server both equal the archived server selection. It compares the entire newly read Native inventory with the recorded inventory, including complete physical Prepare sources, reference unions and literal Pending outcomes. Recorded controller instances and permissions remain DATA.
- `inspect_server_packets.ts` collects every original catalog lane through the genuine reconstructed host, compares the complete metadata and terminal cursors, then compares every first-server packet string and fingerprint exactly. Disabled recorded lanes cannot stand in for full catalog coverage.
- `inspect_packet_identities.ts` decodes every literal packet with genuine Native readers, checking revision predecessor relationships and document/comment stamps. This verifies packet identity; causal readiness still requires the separately retained exact client Native sources.

The source and catalog brackets recheck authority after their final asynchronous server check. A copied host object, rehashed source/reference omission, wrong request digest, closed host or ended client authority cannot turn archived DATA into a successful comparison. An original controller advanced from origin A to current C cannot stand in for reconstruction of archived C. Original protocol/default meanings, client Pending, cached results, receipts and ACKs remain unchanged.

Archive body lookup uses a private index over already bounded admitted headers. It preserves original file bytes and iteration order while avoiding a complete manifest search for each packet identity read.

## Functional qualification

The separate Native fixture privately selects an actually observed archive and restores it into an absent fixture-owned directory. Its new operator token stays private to IPC. The restored listener serves recovery operator routes only. The fixture retains one actual provider instance across availability proof and control preparation.

`scripts/server-packet-inspection-native.test.mjs` publishes a real authenticated edit and suggestion before capture. It exercises actual replay, old-token refusal, missing editor route, exact Native/source comparison, rehashed omission refusal, callback cancellation/close and subsequent original-source edits without changing the restored copy.

`scripts/server-packet-inspection-cohort-native.test.mjs` runs the complete original seven-family owner workflow, including prior packet/raster captures and disk readback. It adds real selected-server replay and complete Native/catalog/first-packet comparisons, then the original workflow continues with document and review Undo/Redo.

`scripts/check-server-packet-inspection-installed.mjs` packs and installs independent local packages, copies the actual Native executables, preserves only reversible module-location rewrites and runs strict public types plus every required earlier catalog/packet case. The production normal Wasm and historical executables remain pinned.

These checks do not complete local occurrence traversal, exact archived client causal-reference replay, the whole upload union, base-Pending source resolution, independent comment/server-log generations or whole-room activation. Qualification results must be read at their recorded scope; no complete V1 release profile is claimed here.

## Verified checkpoint

The [qualification](qualification/2026-11-01-server-packet-source-inspection.json) passes 34 source and 34 independently installed cases with strict public types. The whole-cohort observation compares 13 Native packet sources, 15 Native references and all 17 original server packet strings while preserving 82 local occurrences and four raster payloads. All seven original document/review Undo/Redo checks continue afterward.

The complete Rust suite passed 421 cases. After boxing the nested preparation future and correcting the fixture provider lifetime, all four affected tests, including forty Native history modes, and both all-target release lint modes pass. The exact executed source archive and retained compressed proof were fully read back and hashed. Complete source-owned portable client inspection and all thirteen V1 gates remain open.
