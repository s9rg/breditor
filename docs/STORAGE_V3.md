# Storage V3

Status: experimental Rust API in the unpublished `0.3.0-alpha.15` source
checkpoint. This extends [Local Log V3](LOCAL_LOG_V3.md), not the browser API.

## Contract

Storage Root V3 retains the 15-field V2 canonical envelope. Storage Generation
V3 retains its 18-field canonical envelope. Both require `formatVersion: 3`,
the exact trusted schema selector and fingerprint, Frame V3 policies, and a
canonical Local Log Checkpoint V3 encoded as the `checkpointJson` string.
That checkpoint embeds Session Checkpoint V3; Document remains V2.

The format names, decimal-u64 string grammar, identity checks, field order,
and strict byte-canonical admission remain unchanged. Input limits apply
before parsing. Schema identity and fingerprint are checked before nested
reconstruction. Outer input/output budgets and nested checkpoint/session
budgets remain independent. No codec negotiates versions, retries another
generation, rewrites stored data, or infers a migration from a schema match.

Root preparation borrows a Frame V3 compaction outcome. Rotation preparation
borrows either a checked V3 predecessor manifest or a normalized selected V3
root, plus the V3 compaction outcome. Checked preparation verifies context,
schema, storage association, session, generation continuity, frame limits,
known identity reuse, and nested checkpoint validity. Ordinary V3 rotation
also rejects reuse of the previous manifest's activation-fence ID. V1/V2
behavior is unchanged.

## Selected-storage recovery

`LocalLogStorageSelectedBindingV3` combines independently trusted receipts and
V3 checkpoint/active-generation facts. The selected codec normalizes an exact
root, or an exact rotation together with its immediate predecessor. It checks
both values against those trusted facts and reconstructs the nested checkpoint.
Checkpoint-only, retired, and reclaimed generation facts remain distinct.

The resulting selected root retains the exact current and predecessor bytes,
bindings, predecessor generation facts, and decoded anchor. Its public API
exposes inspection data only. It does not expose an anchor or grant a writable
tail. A host may separately decode its checkpoint bytes for semantic recovery;
that does not establish storage freshness or authority to write.

Opaque V3 root selections, manifests, frame policies, selected bindings, and
selected roots cannot be supplied to V1/V2 codecs or legacy write paths.
Private shared representations retain explicit frame-version tags, but no
public V3 accessor unwraps them into a legacy projection. Compile-fail tests
guard representative cross-generation API boundaries.

## Deliberate limits

This checkpoint adds no disk or IndexedDB adapter, I/O protocol, head
publication, writer acquisition, append queue, crash-atomic transaction,
automatic migration, or Wasm transport. V3 schema-admission preparation is
also deferred: the existing prepared admission owns V2 checkpoint bytes and
must not be repackaged as a V3 proof.

A canonical manifest is not proof of physical EOF, durable storage, shared
causal history, or a current committed head. Trusted caller-supplied physical
offsets remain host assertions. Frame checksums detect corruption, not hostile
tampering. Old format codecs and the existing browser Session Checkpoint V3
autosave path remain unchanged.

Tests cover canonical round trips, selected normalization, ordinary and
selected rotations, schema/version/frame rejection, nested-generation refusal,
resource boundaries, identity/fence reuse, and preservation of Boolean,
integer, and string formatting properties through storage recovery and undo/redo.
