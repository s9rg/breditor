# Durable schema binding contract

Status: implemented in `0.2.0` and extended through the unpublished
`0.3.0-alpha.7` checkpoint. Wasm ABI 5 and the browser explicitly select
exact-base V1, Bootstrap-V1 profile V2, or Bootstrap-V2 profile V3 persistence.
No path sniffs, silently converts, or falls back between record generations.

This contract defines how Breditor records name the exact content language
under which they were created. It is an original Breditor wire contract.
ProseMirror, Lexical, Tiptap, and CKEditor are design references only; none of
their document, step, state, history, or plugin formats are accepted here.

## Two required identities

Every V2 or V3 semantic record carries both:

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

V1, V2, and the implemented V3 families are separate public codec families.
Existing codec types,
`*_FORMAT_VERSION` constants, methods, and golden bytes remain permanently V1.
They accept only the exact built-in `breditor/base@1` definition. V2 uses
separate `*CodecV2` types and `*_V2_FORMAT_VERSION` constants. Property-aware
Operation, Editor State, Transaction Request, Commit, and Session Checkpoint
use separate `*CodecV3` types and V3 constants. Document remains V2, and the
local-log/frame/storage graph has no V3 family.

There is no context-sensitive "latest" encoder and no decoder that silently
upgrades or downgrades any generation. A future decoder that accepts more than one
generation must return the observed generation with the decoded value so a
host cannot unknowingly replace retained evidence with another generation.

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
receiving compiled context. Unspecified mixed envelope generations are invalid;
only the explicitly frozen nested generations listed here are accepted. An
ordinary storage rotation cannot change fingerprints or frame generations.

V3 keeps the same format strings and ordered binding prefix, with
`formatVersion: 3`, but advances only record families that must preserve typed
operation or editor-value payloads:

- Operation V3 carries `OperationRecordV2`, whose format occurrences retain
  complete canonical property maps.
- Transaction Request V3 carries property-aware operation sequences and V2
  pending-format updates; snapshot, selection, and metadata records remain V1.
- Editor State V3 embeds Document V2 and advances pending formats to their
  property-preserving V2 record. There is no Document V3.
- Commit V3 embeds Editor State V3 and property-aware forward operations and
  result pending formats.
- Session Checkpoint V3 embeds Editor State V3 and property-aware history
  entries and replay values.

These five families advance together when their nested values require typed
properties. The local-log entry/checkpoint/frame/root/storage generations stop
at V2 and cannot wrap a Session Checkpoint V3. V1/V2 operation payloads retain
their exact bytes and fail closed for any actual operation under a schema with
a typed property contract, including an optional-only contract and empty
property instances. V1 pending-format records also reject property-bearing
instances. Document V2 remains property-aware, so legacy composite records
that contain no typed pending value or operation recipe may still be valid.

## Decode and encode order

A V2 or V3 decoder performs these checks before returning a runtime value:

1. enforce the complete input-byte ceiling;
2. route the exact format and caller-selected version;
3. validate the exact outer shape while retaining large nested values as
   borrowed raw JSON;
4. parse and compare the schema selector;
5. parse and compare the schema fingerprint;
6. preflight nested counts, strings, paths, property canonicality, numeric
   form, and payload sizes;
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

Alpha.3 adds the separate ABI 4 Profile Bootstrap V2 path. Its explicit
`createEngineFromDocumentJsonV3` factory starts a Session V3 from Document V2;
`createEngineFromSessionCheckpointJsonV3` restores only Session Checkpoint V3.
The browser selects that path only with
`semanticProfile: { bootstrapJson, formatVersion: 2 }`, validates the complete
compiled property contract plus the bounded structure and binding of the
property-bearing Document/Session payload, and binds the existing profile-
scoped IndexedDB outer record to `checkpointFormatVersion: 3`. The browser
preflight does not replay history or reproduce the Rust codec's aggregate
retained-node, text, and property accounting. Rust V3 restore performs those
authoritative checks, so a browser-admissible checkpoint can still fail closed
there. Autosave captures and structurally revalidates the same V3 mode.
Bootstrap V1 continues to select the existing profile-aware V2 path, and
omitting a semantic profile continues to select exact-base V1.

Alpha.5 changes no binding, bootstrap, document, operation, state,
transaction, commit, checkpoint, or IndexedDB outer-record generation. Its
property-preserving `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace`
values already fit the complete typed format instances carried by Operation
V3. Exact guards and inverses therefore survive Session Checkpoint V3 undo,
redo, replay, and browser reload under the same schema fingerprint. Alpha.5
restores conforming alpha.4 checkpoints; an alpha.4 reader rejects an alpha.5
V3 checkpoint whose retained history contains one of those typed structural
operations. The equal `formatVersion` is not a supported prerelease downgrade,
and no reader drops, converts, or retries that history.

Alpha.6 likewise changes no binding, bootstrap, document, operation, state,
transaction, commit, checkpoint, or IndexedDB outer-record generation. Its
cross-paragraph typed set/remove action records one property-preserving
`RootTextReplace`, exactly the V3 recipe alpha.5 already admits. Session
Checkpoint V3 retains it on both undo and redo branches and reconstructs the
inverse by replay rather than serializing action identity or input. Alpha.6
restores alpha.5 checkpoints, and alpha.5 can restore and replay conforming
alpha.6 cross-set history because no operation meaning changed.

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

## Current limits

- The public schema compiler remains
  `CompiledSchema::try_compile_base_text_profile`. It accepts a caller-owned
  non-`breditor/*` `SchemaId` and manifest-owned inline formats. The `0.2.0`
  path is property-free; `0.3.0-alpha.1` adds closed typed scalar properties for
  inline formats, alpha.2 adds the typed set declaration, and alpha.3 carries
  both through an explicitly selected Wasm/browser profile path. It still
  cannot express new nodes, element
  properties, entities, exclusions, or normalization. Alpha.4 adds
  `CompiledEditorProfile::try_compile_base_text_profile` over that sealed
  compiler and co-owns its exact `ExtensionSet`, schema, generated registry,
  router, and catalog.
- Existing primitive operation validation accepts compiler-minted capabilities
  for the sealed root/paragraph/text shape. Alpha.2 makes `TextSplice`
  property-aware. Alpha.5 makes `ParagraphSplit`, `ParagraphJoin`, and
  `RootTextReplace` preserve complete typed format instances, lifting Enter,
  multiline plain-text insertion, cross-paragraph type-over/delete and
  property-free toggle, plus paragraph-boundary join paths. The older base-
  text capability remains property-free as the sentinel for frozen V1/V2
  operation codecs and the existing local-splice incremental proof.
  Alpha.6 uses the same typed `RootTextReplace` for cross-paragraph complete-map
  `SetInlineFormatAction`, preserving peer formats, unselected edge fragments,
  empty middle paragraphs, directional selection, and one exact history entry.
- A manifest-owned toggle bundle contains one same-manifest format kind plus
  action, no-input intent, binding, and action-state IDs. Compilation generates
  the existing Rust toggle action, a tracked intent, one priority-0 blocking
  binding, and routed state. Per-manifest and aggregate limits are 255; IDs are
  unique within each typed namespace and extension semantic IDs cannot use
  `breditor/*`. Custom actions, callbacks, inputs, cross-extension targets,
  shared identities, and fallback routes remain unavailable.
- A manifest-owned `InlineFormatSetSpecV1` targets one same-manifest typed
  format and generates an explicit-input set/remove action, typed intent,
  priority-0 blocking binding, and routed presence state. It carries no
  property values, callback, renderer, label, key binding, or toolbar metadata;
  set replaces the complete property map rather than patching it.
- Every successful profile compilation mints a fresh opaque process-local
  generation. Alpha.5 carries it through profile-created Rust engine/state
  observations and Wasm handles, but never serializes or exposes it as a
  scalar. Existing unprofiled native constructors remain advanced bypasses.
- ABI 5 retains Profile Bootstrap V2 and exposes the exact typed property declaration and
  its set-action/typed-intent identities. Browser descriptor and projection
  validation, Document export correlation, Session V3 restore, autosave, and
  IndexedDB preserve the typed values. Bootstrap V1 remains profile-aware V2;
  the unprofiled compatibility path remains exact-base V1. The default profiled
  slot is schema-scoped rather than document-scoped, so applications opening
  multiple documents under one schema must supply distinct caller slots.
  Intent/toolbar execution remains process-local presentation and changes no
  durable binding or record bytes. Alpha.7's set-surface descriptor triple and
  browser-only typed form are likewise excluded from every durable identity
  and record; see
  [`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).
- Property-bearing Session V3 is a browser checkpoint boundary, not a new
  local-log/storage generation. Alpha.4's sole browser-owned `safeLinkV1`
  policy derives only its fixed canonical Link attributes and matching
  safe-copy HTML from one exact two-property contract. Alpha.7's native Link
  form remains ephemeral browser presentation and stores only committed
  semantic properties through the existing Session V3 path.
- The local-log entry, checkpoint, frame, root, and storage-generation families
  have no V3 codec. Property-bearing Session Checkpoint V3 bytes cannot enter
  the current V1/V2 local-log graph.
- Storage V2 has no public publication-attempt, terminal-resolution, writer-fence,
  or append-queue entrypoint in alpha.2. Checked candidates and normalized
  selections grant no I/O authority.
- A schema fingerprint proves equality of content meaning, not package origin,
  extension code, toggle action/intent/binding/state declarations, or browser
  presentation.
