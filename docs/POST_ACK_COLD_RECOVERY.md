# Post-acknowledgement cold recovery

The complete client/source cold-recovery workflow passes on the normal Node
heap, without an inspector, allocation profiler or forced collection. The
tested source snapshot stays unchanged throughout the run. This is a restart
of browser/native source owners against the same live authenticated Native
server; server-process restart and whole-room service activation are separate.

The workflow first uploads a real raster through three independently local
managed queues, checks all actual acknowledgements, reconstructs a fresh native
recovery path, and delivers document, review and metadata work for all seven
source families. A same-owner reconciliation then reports no provider gaps.
The original unbound-local diagnostic keeps its original Pending meaning.

After that acknowledged state, the workflow adds offline text and comments to
every participant and retires all seven source owners. Their replacements must
be different native owners. All fourteen exact document/review checkpoints and
all three durable upload acknowledgements must survive unchanged. Fresh
authenticated review and metadata parents reopen from the retained data.
Before delivery, reconciliation must explicitly report all fourteen local-ahead
suffixes as Pending. Two subsequent authenticated delivery passes must produce
a checked result with no pending requirements and verified review receipts.

Original metadata packets and committed revision receipts remain unchanged;
the cold restart must not republish a committed revision. The original immutable
before-state remains distinct from the advanced current state. Every source
must retain future document Undo/Redo and review Undo/Redo, and the original
upload acknowledgements must still be present at the end.

## Required execution

`scripts/metadata-provider-reconciliation-cold-native.test.mjs` executes the
complete workflow with genuine Rust/Wasm histories and authenticated Native
server receipts. Node IndexedDB, browser image decoding and lock surfaces are
controlled. Neither a saved report nor a fabricated read token grants custody.

Both candidate profiles require this test. The existing independent package
qualification retains all 113 original tests and adds this workflow for 114
required tests, with strict consumer types and fresh offline archives. The
installed run is a separate qualification from the passing source-frozen run.

The [qualification](qualification/2026-10-30-post-ack-cold-recovery.json)
retains the passing source run and all 114 independently installed tests.
Its Native server, normal Wasm and SDK source remain pinned. Evidence may be
stored with gzip compression; each index entry records encoded and decoded
lengths and SHA-256 hashes, and every decoded original is read back exactly. The storage lifetime
repair and component evidence are described in
[Recovery transaction lifetime](STORAGE_TRANSACTION_LIFETIME.md).

This workflow does not establish complete remote metadata catalog coverage,
independent comment/server-log generation support, authenticated whole-room
activation, physical crash durability or V1 readiness. Those architectural
requirements remain in the active goal. The earlier separate short Blob-read
observation has not been independently explained by this pass.
