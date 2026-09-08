# Durable schema binding contract

Status: implemented in `0.2.0`; Wasm ABI 3 provides explicit V2
profile factories, and the supported browser selects exact-base V1 or
profile-aware V2 persistence without sniffing or silently converting formats

This contract defines how Breditor records name the exact content language
under which they were created. It is an original Breditor wire contract.
ProseMirror, Lexical, Tiptap, and CKEditor are design references only; none of
their document, step, state, history, or plugin formats are accepted here.

## Two required identities

Every V2 semantic record carries both:

- `schema`, the human-readable `SchemaId` selector; and
- `schemaFingerprint`, the collision-resistant identity of the complete
  compiled content meaning.

Neither field substitutes for the other. The selector produces useful routing
and diagnostics. The fingerprint prevents a different definition from reusing
the same selector. The process-local compiled proof is never serialized.

For JSON records, `schemaFingerprint` is exactly the canonical display form
specified by [Schema fingerprint contract](SCHEMA_FINGERPRINT.md): the ASCII
prefix `sha256:` followed by 64 lowercase hexadecimal digits. Uppercase,
whitespace, another algorithm name, a missing field, or a short or long digest
is invalid rather than normalized.

## Explicit generations

V1 and V2 are separate public codec families. Existing codec types,
`*_FORMAT_VERSION` constants, methods, and golden bytes remain permanently V1.
They accept only the exact built-in `breditor/base@1` definition. V2 uses
separate `*CodecV2` types and `*_V2_FORMAT_VERSION` constants.

There is no context-sensitive "latest" encoder and no decoder that silently
upgrades either generation. A future decoder that accepts more than one
generation must return the observed generation with the decoded value so a
host cannot unknowingly replace retained V1 evidence with V2 bytes.

V2 keeps each existing format string and sets `formatVersion` to `2`. Every
independent JSON envelope begins in this canonical field order:

1. `format`
2. `formatVersion`
3. `schema`
4. `schemaFingerprint`
5. the family-specific fields in their frozen order

The V2 family graph is indivisible:

- Document V2 carries the binding beside the unchanged canonical AST payload.
- Operation V2 and Transaction Request V2 carry the binding beside the
  unchanged closed primitive-operation payload language.
- Editor State V2 embeds Document V2.
- Commit V2 embeds Editor State V2 and unchanged closed primitive-operation
  payloads.
- Session Checkpoint V2 embeds Editor State V2 and unchanged closed
  primitive-operation payloads.
- Local Log Entry V2 embeds Commit V2 for commit, undo, and redo events; the
  outer binding also covers control-only events.
- Local Log Checkpoint V2 embeds Session Checkpoint V2.
- Local Log Frame V2 carries Local Log Entry V2 JSON under the existing
  checksummed frame layout with binary version `2`.
- Storage Root and Storage Generation V2 embed Local Log Checkpoint V2 and
  require Frame V2 policies.

The V2 tail, recovery, compaction, root/generation preparation, and
selected-storage normalization paths retain and compare the same binding. They
are runtime ownership and validation contracts, not additional durable
envelope formats.

Every repeated selector and fingerprint must match the outer record and the
receiving compiled context. Mixed V1/V2 nesting is invalid. An ordinary storage
rotation cannot change fingerprints or frame generations.

## Decode and encode order

A V2 decoder performs these checks before returning a runtime value:

1. enforce the complete input-byte ceiling;
2. route the exact format and V2 version;
3. validate the exact outer shape while retaining large nested values as
   borrowed raw JSON;
4. parse and compare the schema selector;
5. parse and compare the schema fingerprint;
6. preflight nested counts, strings, paths, and payload sizes;
7. reconstruct, replay where required, and completely validate under the
   receiving process-local proof; and
8. perform any family-specific canonical-byte comparison.

Syntax errors and valid-but-different fingerprints are distinct typed failures.
Errors may retain safe selectors and parsed fingerprints, but never arbitrary
attacker-controlled JSON or an unbounded malformed fingerprint string.

Matching durable fingerprints do not grant process-local proof authority. A
record decoded by an independently compiled but semantically equal schema is
fully validated and rebound to the receiving proof. Different fingerprints
fail ordinary restore; they never trigger admission automatically.

An encoder first requires the runtime value's exact context or performs the
explicit full revalidation allowed by that value's contract. It then emits one
fixed generation and enforces the same byte ceiling its decoder uses.

## Runtime and replay binding

The durable binding survives decoding. In particular, a local-log entry keeps
the selector and fingerprint even when its event has no commit payload.
Duplicate detection, recovery, continuation, tail decoding, compaction,
root/generation preparation, and selected storage bindings compare that
binding.

A fingerprint is not authentication, authorization, storage currentness, or a
writer fence. Existing checksums diagnose accidental corruption only. Hosts
still own integrity-protected storage, rollback policy, compare-and-swap, and
single-writer coordination.

## Non-destructive mismatch

Decode and normalization borrow caller-owned input. A schema mismatch never
rewrites or deletes it. Storage selection and preparation retain the exact
current, predecessor, and candidate bytes only after their complete binding and
canonical checks succeed. A failed candidate remains separate from the current
selection, and a failed compare-and-swap never promotes it.

Wasm ABI 3 adds explicit compiled-profile factories over Document V2 and
Session Checkpoint V2 during alpha.5. Its legacy exact-base factory remains an
explicit V1 path. Alpha.6 adds the corresponding browser persistence boundary:
profile startup selects an exact schema-fingerprint or caller-provided slot and
requires a V2 outer record before inspecting checkpoint bytes. The legacy
unprofiled path retains the V1 `"current"` slot. Neither path falls back to
fresh content after a mismatch, and a mismatch never repairs, deletes, or
overwrites the retained record.

V2 storage support stops at checked prepare, encode, decode, and selected-value
normalization. It does not enter the existing `Prepared` -> `Uncertain`
publication-attempt lifecycle, whose public types expose V1 frame projections.
That lifecycle remains V1-only until a separately typed V2 publication boundary
can preserve the generation at every state transition.

## Structural admission

Admission is an explicit borrowed-source operation, not a decoder fallback or
ordinary storage rotation. It:

1. validates the source under its exact selector, fingerprint, local proof,
   and source policy;
2. validates the unchanged AST under the target schema and target policy;
3. creates a new revision-zero editor state and empty history under a new
   lineage and session identity;
4. encodes a complete target V2 checkpoint; and
5. returns a prepared result for separate host adoption.

Failure leaves the source document, state, session, bytes, history stamp,
selected storage root, and external storage untouched. Fingerprint-changing
admission requires separate preparation and host adoption under a new
persistence root; it never preserves or replays history from the source content
language and does not itself publish that root.

This release provides structural admission only. It does not transform nodes,
formats, or properties. General migrations remain deferred.

The concrete `alpha.2` boundary is
`SchemaAdmissionRequest::try_prepare(&LocalLogCheckpointAnchor)`. A request
owns the target compiled context, fresh lineage, fresh local-session and
generation binding, empty-history capacity, and checkpoint limits. It requires
the target fingerprint, lineage, and local-session identity to differ from the
source. Success returns a non-`Clone` `PreparedSchemaAdmission` that couples the
new anchor with exact canonical Local Log Checkpoint V2 JSON; only an explicit
consuming accessor separates them. The result is not a storage-root creation,
compare-and-swap, durability, authenticity, freshness, or writer-fence proof.

Admission currently starts only from a checked compact local-log checkpoint.
An arbitrary live session must first reach such a boundary, and a standalone
document cannot directly mint a new persistence root. This narrower source
contract makes history/session reset observable and prevents a document-only
helper from being mistaken for persistence migration.

## Deliberate alpha.6 limits

- The public schema compiler remains
  `CompiledSchema::try_compile_base_text_profile`. It accepts a caller-owned
  non-`breditor/*` `SchemaId` and manifest-owned property-free inline formats;
  it cannot express nodes, properties, entities, format parameters, exclusions,
  or normalization. Alpha.4 adds
  `CompiledEditorProfile::try_compile_base_text_profile` over that sealed
  compiler and co-owns its exact `ExtensionSet`, schema, generated registry,
  router, and catalog.
- Existing primitive operation validation now accepts the compiler-minted
  sealed base-text capability. `TextSplice`, `ParagraphSplit`,
  `ParagraphJoin`, and `RootTextReplace` preserve admitted extension formats,
  exact inverses, undo/redo, and V2 checkpoint replay. No operation tag, wire
  shape, inverse callback, or replay callback was added.
- A manifest-owned toggle bundle contains one same-manifest format kind plus
  action, no-input intent, binding, and action-state IDs. Compilation generates
  the existing Rust toggle action, a tracked intent, one priority-0 blocking
  binding, and routed state. Per-manifest and aggregate limits are 255; IDs are
  unique within each typed namespace and extension semantic IDs cannot use
  `breditor/*`. Custom actions, callbacks, inputs, cross-extension targets,
  shared identities, and fallback routes remain unavailable.
- Every successful profile compilation mints a fresh opaque process-local
  generation. Alpha.5 carries it through profile-created Rust engine/state
  observations and Wasm handles, but never serializes or exposes it as a
  scalar. Existing unprofiled native constructors remain advanced bypasses.
- Wasm ABI 3 profile factories use V2. Alpha.6 browser validators, export,
  autosave, and IndexedDB use V2 only with an exact compiled profile; the
  unprofiled compatibility path remains exact-base V1. The default V2 slot is
  schema-scoped rather than document-scoped, so applications opening multiple
  documents under one schema must supply distinct caller slots. Intent-based
  Alpha.7 intent/toolbar execution is process-local presentation and changes no
  durable binding or record bytes.
- Storage V2 has no public publication-attempt, terminal-resolution, writer-fence,
  or append-queue entrypoint in alpha.2. Checked candidates and normalized
  selections grant no I/O authority.
- A schema fingerprint proves equality of content meaning, not package origin,
  extension code, toggle action/intent/binding/state declarations, or browser
  presentation.
