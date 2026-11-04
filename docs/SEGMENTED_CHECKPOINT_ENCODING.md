# Bounded segmented checkpoint encoding

This change closes an internal serializer invariant and removes unnecessary work
from segmented checkpoint reads. It changes no format, protocol capability,
version, policy, limit or original history identity.

## Size contract

The previous helper serialized once into a byte counter, then independently
serialized again into the returned string. A stateful `Serialize` implementation
could return a larger value on its second invocation, so the returned bytes were
not necessarily the checked bytes. The focused regression fails against that
implementation. No existing editor record is known to use such a stateful
serializer; this is an internal contract defect, not an observed user-data loss.

The helper now serializes once into a bounded writer. Every append checks the
remaining output budget before extending the buffer. The returned UTF-8 string
contains those exact bytes. Existing budget refusals retain their original error
family and canonical JSON remains byte-identical.

## Checkpoint read contract

A checkpoint read previously constructed an owned active segment, encoded it and
calculated a SHA-256 hash that the read did not use. Reads now borrow the active
journal entries and encode them directly. The complete original family,
identity, immutable-prefix, typing-boundary and publication checks still run.
Actual generation sealing still owns its record and computes its hash. There is
no new cache of mutable state and no discarded history.

## Qualification

The isolated native library suite passed 145 tests, with the explicit timing
sample ignored. This includes all 144 native history configurations and actual
histories exceeding 1,000 entries. After a separator-only test-literal correction,
strict Clippy passed for the owned library/tests; the four focused encoding tests,
including the optional timing sample, passed. The existing vendored unused-import
warning remains outside that owned-code lint scope.

Two independently initialized normal Wasm modules passed 144 compatibility
configurations: 1,296 exact checkpoint/document comparisons, 144 cold restores in
each direction, 576 future Undo/Redo pairs and 288 genuine peer deliveries.
The previous Wasm SHA-256 is
`165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0`;
the isolated changed Wasm is
`f81efb2e8103b3dfa9d79f5c2d55dff8e3d639e8394f3e6725c2f8864f3b440e`.
The canonical normal build passed its export-surface and path-leak checks.

The changed Wasm also passed the complete independently packed/offline-installed
SDK probe: 216 configurations, 1,296 exact cold restores, 864 future history
pairs, 432 original-family refusals and 216 read-only reopens. Public types and
production bundling passed without workspace package links. Fresh TypeScript
output matched all three packages exactly before packing.

The optional native test-profile sample encoded 935,970 bytes three times per
sample, with exact byte equality. Across five samples, median elapsed time was
134,674,459 ns with the previous helper and 81,425,917 ns with the single-pass
helper (about 40% less elapsed time for this encoder sample). This is not a Wasm
or full recovery performance estimate.

Run the explicit compatibility probe with two separately retained runtime
directories:

```sh
node scripts/segmented-runtime-byte-compatibility.mjs PREVIOUS_RUNTIME CANDIDATE_RUNTIME
```

The probe never rebuilds or chooses a runtime implicitly. In an isolated checkout,
`node scripts/build-collaboration-runtime.mjs` builds the candidate and
`node scripts/check-segmented-history-installed.mjs` runs the complete installed
SDK probe against its current built runtime.

## Integration boundary

The Rust source and reproducible compatibility probe are integrated. The changed
Wasm remains separately retained qualification evidence. Main's default packaged
runtime and the existing Native recovery fixtures remain unchanged while the
larger process-recovery candidate is still under qualification. Rebuilding the
Rust source includes this change; the existing packaged SDK is not claimed to
receive a speed improvement here.

This does not close the archive short-read refusal, full Native restart/client
reassociation, historical WebKit fault, physical storage durability or V1 gates.
The old and new recovery workflows remain separate from this qualification.

[The qualification record](qualification/2026-11-04-segmented-checkpoint-encoding.json)
identifies the exact as-tested source, logs, runtime modules, native test
executable and installed package archives. Its local proof index is
`bcb8cf2d7b0fb144abe055d1f37715380e315932f654f9c3ecdd2f00c01bcd1d`.
The final as-qualified source archive has 8,309 files, all read back and checked;
the captured earlier build/full-suite source manifest is reconstructed exactly.
The retained native executable is from the final focused run; the complete suite
is retained through its log and exact earlier source manifest.

Main integration separately passed the four focused native tests and the full
144-configuration compatibility probe. All six integrated code/test files match
the independently qualified source byte-for-byte. The default Wasm and both
protected Native fixtures retain their original hashes.

## Larger actual Wasm workloads

The separate reproducible workload compares two explicitly selected normal Wasm
modules. It admits 64 or 256 native inserts per segment, and refuses an unbounded
workload, the same module directory, or wrappers resolving to the same module
file. A reproduced probe-only alias defect could otherwise report two input
hashes while reusing the first initialized wrapper. The corrected probe refuses
that case before runtime initialization.

```sh
node scripts/segmented-checkpoint-workload.mjs PREVIOUS_RUNTIME CANDIDATE_RUNTIME 256
```

Both isolated sizes pass with 285,496-byte and 1,125,360-byte checkpoints. The
workload includes document selection, typing, reviewed and search histories,
sealed/active generations and a retained redo tail. Exact bytes survive cold
restore in both directions, a real peer update, four successful future local
Undo/Redo actions that preserve peer text, and another seal. The larger case
also passes after integrating the script into Main. Seven CLI refusal cases pass.

Five alternating-order samples retain the actual timings and exact input hashes
in the [workload record](qualification/2026-11-04-segmented-checkpoint-workload.json).
These busy-host measurements include byte comparisons; they are not full recovery
performance or a supported document-size limit. The candidate Wasm is still
separate, and the packaged runtime and Native fixtures retain their original
hashes. These results do not qualify the archive-read fault or complete room
recovery.
