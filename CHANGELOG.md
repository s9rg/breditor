# Changelog

This file records user-visible Breditor changes. Breditor uses semantic
versions for the supported browser package surface and explicit versions for
its durable formats and Wasm transport.

## 0.2.0-alpha.4 - 2026-09-07

This Rust-core checkpoint compiles the first complete semantic profile around
the property-free inline-format path introduced in alpha.3. It does not widen
the browser product, durable wire families, or Wasm ABI: the official npm pair
is version-aligned at `0.2.0-alpha.4` but remains unpublished and continues to
use Wasm ABI 2 and the exact-base V1 browser path.

### Manifest-owned toggle bundles

- Added immutable manifest-owned inline-format toggle declarations. Each bundle
  names exactly one format kind, action ID, intent ID, binding ID, and
  action-state ID; it carries no handler, callback, custom input, label, icon,
  shortcut, or toolbar placement.
- Limited toggle declarations to 255 per manifest and 255 across the compiled
  profile. Each toggle must target a property-free format declared by the same
  manifest, and one format can have at most one toggle.
- Reject duplicate action, intent, binding, and action-state identities within
  each typed namespace across the complete profile. Extension semantic
  identities cannot use the reserved `breditor/*` namespace.

### Immutable compiled editor profile

- Added an immutable `CompiledEditorProfile` that co-owns one resolved
  `ExtensionSet`, compiled schema, action registry, semantic intent router, and
  observable action-state catalog. Each successful compilation mints a fresh,
  opaque process-local profile generation for correlating those components.
- Each admitted toggle instantiates the existing generic Rust
  `ToggleInlineFormatAction`, a tracked no-input intent, one priority-0 blocking
  binding, and routed action state suitable for a future toolbar. All mutation
  planning and authoritative state evaluation remain in Rust. The existing base
  actions and Bold/Undo/Redo action-state entries remain present.
- Kept action, intent, binding, and action-state declarations out of the durable
  schema fingerprint. Adding or renaming only this semantic routing bundle does
  not change document meaning or any canonical V2 schema fingerprint.

### Deliberate alpha.4 limits

- Extensions cannot define custom actions, callbacks, action inputs, effect
  declarations, cross-extension format targets, shared toggle routes, or
  fallback routes. The only generated behavior is one no-input toggle per
  admitted declaration targeting a manifest-owned property-free format.
- Existing native Rust action-registry, intent-router, and engine APIs remain
  advanced bypasses; a host that uses them directly is outside the compiled
  profile's ownership and correlation guarantee.
- `CompiledProfileGeneration` is only a Rust-local container identity in this
  checkpoint. It is not yet carried by `EditorEngine`, observations, outcomes,
  or Wasm values; that transport work belongs to alpha.5.
- No browser rendering or toolbar UI is added. Profile-aware rendering remains
  alpha.6 work and the supported browser intent/toolbar path remains alpha.7.
  Every V1 codec remains exact-`breditor/base@1`-only.

## 0.2.0-alpha.3 - 2026-09-07

This unpublished prerelease completes the Rust-core sealed inline-format
checkpoint. Resolved extension manifests can now contribute property-free
inline formats to the existing base text structure, and the resulting schema
can use the already-versioned V2 persistence and replay graph. No browser or
Wasm extension surface is opened yet.

### Sealed schema contribution

- Added the public nonzero `PersistedTypeRevision` and
  `InlineFormatSpecV1` values. Each `ExtensionManifest` owns an immutable,
  canonically ordered format list; duplicate kinds and the fixed 255-format
  per-manifest ceiling fail before a manifest is published.
- Added `CompiledSchema::try_compile_base_text_profile`, which accepts one
  caller-owned non-`breditor/*` `SchemaId` and one resolved `ExtensionSet`.
  The compiler fixes the document/paragraph/text grammar, built-in strong
  format, property/entity prohibitions, and canonicality laws while admitting
  at most 255 extension formats in total.
- Compilation rejects reserved schema, extension, and format namespaces plus
  duplicate format ownership in deterministic phases. The declared format
  kind and persisted revision enter the canonical schema fingerprint; manifest
  owner identity, `ExtensionVersion`, and declaration order do not.

### Generic formatting and replay

- Added `ToggleInlineFormatAction`, an immutable Rust-owned action configured
  with one qualified format kind. It is enabled only when the active compiled
  schema admits that kind as property-free, reports inactive/active/mixed
  state, handles collapsed pending formats, and emits only existing
  `TextSplice` or `RootTextReplace` primitives for extended selections.
- Kept `ToggleStrongAction` as the compatibility wrapper for the existing
  built-in action identity and diagnostics. The generic action is public but
  is not automatically registered; compiled action ownership and semantic
  intent routing remain the next checkpoint.
- Extended `TextSplice`, `ParagraphSplit`, `ParagraphJoin`, and
  `RootTextReplace` admission to compiler-minted sealed base-text schemas.
  Extension formats survive canonicalization, exact inverse application,
  relocation, undo, redo, independent-proof Session Checkpoint V2 restore,
  and replay without rerunning the action handler.

### Compatibility and deliberate limits

- Every V1 codec remains byte-stable and exact-`breditor/base@1`-only. The
  sealed profile path uses explicit V2 selector-and-fingerprint binding; Wasm
  ABI 2, `@breditor/browser`, autosave, and IndexedDB remain V1-only.
- `breditor/base@1` remains the original strong-only schema. Extension
  profiles must use a caller-owned non-reserved schema selector and cannot add
  nodes, properties, entities, format parameters, exclusions, normalization,
  operation variants, codecs, or replay callbacks.
- This checkpoint does not yet build a complete `CompiledEditorProfile`,
  auto-register extension actions or states, bind semantic intents, or expose
  extension presentation through Wasm, the browser renderer, or the toolbar.

## 0.2.0-alpha.2 - 2026-09-06

This prerelease completes the Rust-core durable schema-binding checkpoint. It
adds an explicit fingerprint-bearing V2 generation for every durable record
family while preserving every V1 type, method, constant, and canonical byte.
It remains unpublished.

### Durable identity and record generations

- Added strict public `SchemaFingerprint` parsing and an owned
  `DurableSchemaBinding` containing both the human-readable schema selector and
  the exact compiled-content fingerprint. Syntax failure and a valid but
  mismatched fingerprint remain distinct payload-free errors.
- Added separate V2 codecs for Document, Operation, Transaction Request, Editor
  State, Commit, Session Checkpoint, Local Log Entry, Local Log Checkpoint,
  Local Log Frame, Storage Root, and Storage Generation. Each independent JSON
  envelope uses canonical `format`, `formatVersion`, `schema`, then
  `schemaFingerprint` order; every nested family is generation-locked.
- Propagated the durable binding through control-only log entries, recovery,
  continuation, Frame V2 tail admission, compaction, root/generation
  preparation, selected-root normalization, and selected-aware rotation.
  Matching fingerprints from independently compiled proofs are fully
  revalidated and rebound; mixed V1/V2 or cross-fingerprint graphs fail closed.

### Structural schema admission

- Added `SchemaAdmissionRequest`, which borrows a checked compact checkpoint,
  revalidates the source, validates the unchanged AST under a different target
  schema, and prepares a fresh revision-zero lineage, session, empty history,
  and exact Local Log Checkpoint V2 JSON.
- Added an explicit bridge that prepares an unpublished Storage Root V2 from
  the admission result. It rechecks the target binding and exact checkpoint
  bytes and performs no storage I/O or publication.
- Admission is deliberately structural only: it performs no content transform,
  never replays source history under the target language, and leaves the source
  owner and external persistence untouched on failure.

### Compatibility and deliberate limits

- V1 remains exact-base-only and byte-stable. Wasm ABI generation `2`, browser
  validation, autosave, IndexedDB, and all browser behavior remain V1-only;
  package versions move together solely for exact-pair repository testing.
- Storage V2 stops at checked prepare, encode, decode, and normalization. It
  does not enter the V1 `Prepared` -> `Uncertain` publication lifecycle and
  grants no compare-and-swap, durability, authenticity, freshness, writer-fence,
  or append authority.
- General non-base profile construction and generic property-free inline-format
  operations remain scheduled for `0.2.0-alpha.3`.

## 0.2.0-alpha.1 - 2026-09-06

This prerelease replaces the fixed base-schema implementation with a private,
parity-first declarative compiler and adds the proof identities required before
Breditor can safely admit extension-defined content. It intentionally exposes
no general schema compiler, extension format, new document wire generation,
browser command, or toolbar behavior yet.

### Declarative base compiler

- The public `CompiledSchema::breditor_base()` factory now compiles a canonical
  data-only declaration for `breditor/base@1`. The compiled tables express the
  document root, direct paragraphs, text leaves, property/entity prohibitions,
  property-free strong format, and existing canonicality laws.
- Added independent checked persisted type revisions, deterministic compiler
  phases, fixed schema-registration limits, duplicate/reference validation, and
  complete per-namespace reservation of `breditor/*` identities.
- Added a domain-separated, versioned canonical binary encoding and SHA-256
  `SchemaFingerprint`. Fingerprints include compiled content meaning and exclude
  extension package identity, actions, presentation, process data, and host-only
  memory/work budgets.

### Runtime proof safety

- Every independently created compiled-schema instance now owns a
  collision-free private allocation identity. Clones share that proof;
  separately created but semantically equal schemas share a fingerprint without
  sharing process-local proof authority.
- Documents carry both durable fingerprint and private proof identity. Exact
  proof and host-policy matches retain validated fast paths; explicit state
  construction can completely revalidate and rebind a same-fingerprint
  document, while different fingerprints fail without publishing state.
- Selection, operation, transaction, relocation, history, replay, and document
  encoding boundaries now reject or revalidate proof mismatches according to
  their ownership contract instead of treating a matching `SchemaId` as proof.

### Compatibility and limitations

- Existing Document V1 and every other durable V1 byte remain unchanged and
  bound to the built-in base definition. General schema construction remains
  private until fingerprint-bearing durable generations are implemented in
  `0.2.0-alpha.2`.
- Wasm transport ABI generation remains `2`; the exact npm pair is versioned
  together for clean prerelease consumer checks and remains unpublished.
- Added the locked RustCrypto SHA-256 dependency and updated the exact Wasm
  dependency/license inventory. Schema compilation is a cold-path operation;
  document editing does not hash on each transaction.
- Set the optimized release build to one code-generation unit so the
  fingerprint implementation and its dependencies remain inside the existing
  Wasm and npm-tarball size budgets without sacrificing clean-build byte
  reproducibility.

## 0.1.1 - 2026-09-06

This is the first additive foundation checkpoint toward `0.2.0`. It introduces
no new editor behavior, document/schema meaning, durable wire format, Wasm ABI,
browser command, or toolbar union. The npm packages remain un-published; their
versions are aligned only so repository builds and tarball smoke tests continue
to use an exact browser/Wasm pair.

### Extension-set foundation

- Added private-field, checked-constructor Rust values for extension semantic
  revisions, exact extension identities, behavior-free manifests, configurable
  resource limits under fixed ceilings, and immutable resolved extension sets.
- Added exact-version required dependencies, explicit exact-version conflicts,
  rejection of duplicate identities and multiple installed revisions of one
  qualified name, missing/wrong dependency diagnostics, and cycle rejection.
- Frozen canonical identity order as qualified-name ASCII bytes followed by a
  numeric semantic revision. Dependency-first topological resolution chooses
  the smallest currently-ready identity under that order, never caller or
  package installation order.
- Added 30 focused tests for canonicalization, registration permutations,
  deterministic diagnostics, numeric revision order, exact hard limits, and
  limit-plus-one failures. Public error enums are non-exhaustive so later
  compiler phases can add failures without forcing downstream exhaustive
  matches.

### Architecture decisions

- Defined the narrow `0.2.0` product goal: frozen declarative profiles and one
  end-to-end property-free inline-format extension path over the existing base
  text structure.
- Separated durable schema fingerprints, process-local compiled-profile
  generations, and browser presentation identities. Legacy V1 durable records
  remain bound to the exact built-in base schema; non-base profiles require new
  fingerprint-bearing record generations.
- Kept the primitive operation/replay language closed, rendering declarative
  and callback-free, portable extension actions Rust-owned, semantic intents
  distinct from toolbar presentation, and clipboard paste intentionally
  formatting-stripping until a complete semantic-fragment ingress exists.
- Recorded the deliberate exclusions: arbitrary nodes and properties, links,
  headings, hot semantic loading, JavaScript planners, custom operation codecs,
  dynamic Rust/Wasm linking, migrations, and collaboration.

### Deliberate checkpoint limitation

`ExtensionSet` proves only that bounded relationship metadata is internally
consistent. It does not register a schema, format, action, intent, renderer, or
toolbar item; execute code; mint a fingerprint; or prove that any document,
checkpoint, or replay log is compatible. Those capabilities remain gated by
the `0.2.0` prerelease sequence.

## 0.1.0 - 2026-09-06

The first shippable repository checkpoint is a deliberately small, local-first
rich-text editor. The npm package manifests and reproducible tarball gates are
prepared for `@breditor/browser` and `@breditor/wasm`; publishing those packages
is a separate operation and has not been performed. The Rust crates remain
repository implementation artifacts with `publish = false`.

### Product and architecture

- Added a framework-neutral browser editor whose canonical state is a validated
  immutable Rust AST. The editable DOM is a disposable projection and is never
  accepted as an independent document model.
- Added a synchronous Rust `EditorEngine` boundary with exact
  engine/state/history observations. Prepared work cannot be retained and
  applied to a later observation, and every effective mutation is admitted by a
  complete canonical session checkpoint before publication.
- Added the generated `@breditor/wasm` transport package and a high-level
  `@breditor/browser` owner. JavaScript owns browser event timing, DOM mapping,
  focus, native composition intervals, clipboard capabilities, scheduling, and
  IndexedDB I/O; Rust owns documents, selections, action evaluation,
  transactions, history, and checkpoint validation.
- Added a bounded non-recursive browser command FIFO. Reentrant work is ordered,
  exclusive composition and clipboard leases provide backpressure, and an
  uncertain executor or observer failure quarantines the queue instead of
  retrying a command that might already have committed.
- Kept Breditor's AST, points, actions, transaction records, history, extension
  surface, and persistence contracts original. ProseMirror, Lexical, Tiptap,
  and CKEditor are design references only; Breditor implements none of their
  protocols.

### Editing, selection, and history

- Added direct-root paragraphs, non-empty text leaves, and property-free strong
  formatting under the versioned `breditor/base@1` schema.
- Added typed and atomic multiline plain-text insertion, paragraph breaks,
  selection replacement, forward deletion, Unicode-grapheme-aware backward and
  forward deletion, and strong-format toggling.
- Added snapshot-bound UTF-16-safe caret and directional range selections,
  guarded DOM-to-AST and AST-to-DOM mapping, select-all boundaries, exact
  selection-echo suppression, and selection restoration through history.
- Hardened post-render collapsed-caret restoration against WebKit's transient
  `Selection`/`Range` disagreement while preserving exact backward direction
  for non-collapsed selections.
- Added paragraph-local native composition ownership. Intermediate IME DOM is
  treated as temporary evidence, reconciled to one guarded Rust operation, and
  replaced by the canonical projection on success, cancellation, or recovery.
- Added bounded deterministic linear undo and redo, explicit history-group
  boundaries, typing merge groups, exact inverse operations, and replay-proved
  checkpoint restoration.

### Actions and toolbar

- Added a namespaced immutable action registry, semantic intent routing, exact
  prepared capabilities, coherent action-state observations, and conservative
  invalidation.
- Added one public toolbar extension surface based on bounded immutable data,
  not callbacks or mutable plugin objects. The default manifest exposes Bold,
  Undo, and Redo; custom manifests can reorder, relabel, and group controls, or
  bind controls to matching state/command bindings already exposed by the
  injected engine. The official `0.1.0` engine exposes only the Bold, Undo, and
  Redo bindings.
- Added native-button semantics, accessible names, enabled state,
  pressed/mixed state, roving focus, and Home/End/arrow-key navigation. Toolbar
  commands preserve the semantic selection and use the same command FIFO as
  keyboard and browser input.

### Clipboard, persistence, and content egress

- Added semantic copy and cut plus atomic plain-text paste. Supported-subset HTML
  is escaped on copy; HTML-only paste is parsed without creating browser DOM,
  checked against a closed paragraph/strong allowlist, and flattened to plain
  text before it reaches Rust.
- Added the one-slot `breditor/indexeddb-session-checkpoint@1` profile with
  strict schema attestation, exact UTF-8 sizing, SHA-256 alteration detection,
  opaque compare-and-swap tokens, atomic replacement, explicit conflict and
  corruption outcomes, bounded autosave, flush, and paused-state retry.
- Added strict canonical `breditor/document@1` export and semantic plain-text
  export. Both are synchronously correlated to one live Rust snapshot and never
  read mutable DOM text, expose history, or leak Wasm handles.
- Added strict Session Checkpoint V1 encode/decode and replay validation for the
  current document, selection, pending formats, undo/redo position, history
  capacity, and merge continuity.

### Packaging, security, and verification

- Added reproducible generated Wasm checks, reviewed TypeScript declarations,
  transport ABI `2`, exact browser/Wasm version pairing, clean tarball install
  and provenance checks, external type-check and production bundle checks, and
  a real-browser consumer smoke test.
- Added MIT OR Apache-2.0 package licensing plus deterministic third-party
  notices and license payloads for the statically linked Wasm dependency graph.
- Added bounded decoding, projection, action-state, clipboard, queue, history,
  checkpoint, and export limits. Untrusted HTML uses a closed parse5-backed tree
  policy; untrusted documents and checkpoints are strictly decoded and fail
  without installing partial state.
- Hardened editing and toolbar host admission, generated-control dispatch,
  focus, and cleanup with native, brand-checked DOM reads and mutations, so
  shadowed tag, connectedness, child/parent topology, owner-document, role,
  tab-index, editable-ancestry properties, or own
  `setAttribute`/`append`/`remove`/`focus` methods cannot masquerade as, corrupt,
  dispatch through, or prevent cleanup of a supported mount or control.
- Added native Rust format, lint, test, property, security, compile-fail,
  rustdoc, Wasm-target, direct wasm-bindgen browser-runner, package, audit, and
  artifact-size gates.
- Added public-package Playwright coverage in lockfile-pinned Chromium, Firefox,
  and WebKit for editing, Unicode, directional selection, composition, toolbar,
  clipboard, IndexedDB reload, content export, undo, redo, and axe-detectable
  accessibility issues. A representative Safari/macOS accessibility-tree audit
  also checked native roles, names, values, and state changes.

### Deliberate limitations

- The base product supports paragraphs, text, and strong formatting only. It has
  no headings, lists, links, images, tables, nested blocks, arbitrary marks or
  properties, extension renderers, or dynamic action/plugin registration.
- Editing is single-user and local. There is no collaboration, CRDT/OT rebase,
  remote cursor, selective undo, cross-device synchronization, or multi-document
  registry.
- Selection is one light-DOM range. Composition is one range in one paragraph,
  and the automated composition scenarios are synthetic; real operating-system
  IMEs and mobile browsers are not certified.
- Clipboard support uses synchronous event `clipboardData`. There is no async
  Clipboard API, custom internal MIME type, file/image transfer, or rich
  mixed-format paste.
- Persistence is one best-effort same-origin checkpoint slot. Its digest is not
  authentication, and there is no rollback protection, cryptographic origin,
  executable append log, crash-tail recovery, or storage-generation publication
  adapter.
- The supported high-level browser content-egress API is Document V1 or plain
  text only. It exposes no HTML, editor-state, history, or session-checkpoint
  export operation.
- Commands are synchronous, and clipboard/DOM/core work is not one rollback
  transaction. Fail-stop behavior and canonical reconciliation contain an
  uncertain later stage but cannot undo an earlier external side effect.
- Browser automation, axe, and one Safari accessibility-tree inspection do not
  establish real-IME or mobile support, screen-reader behavior, or WCAG
  conformance. The supported and excluded compatibility surfaces are defined in
  [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).
