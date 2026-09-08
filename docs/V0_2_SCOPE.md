# Breditor `0.2.0` scope

Status: in progress; the `0.1.1` through `0.2.0-alpha.8` compiler, engine, Wasm,
profile-aware browser, supported intent/toolbar, reference-package, and
consumer-proof checkpoints are complete; `0.2.0-rc.1` release audit is next

`0.2.0` will make Breditor's first deliberately narrow semantic extension
path shippable. An application will be able to assemble a frozen editor
profile before opening content, add property-free inline formats to the base
text structure, expose those formats through semantic intents, render them in
the browser, and contribute toolbar controls without giving extension code
authority over the canonical document or replay log.

This is an original Breditor contract. ProseMirror, Lexical, Tiptap, and
CKEditor are design references only; their plugin, schema, command, transform,
step, model, and serialization protocols are not Breditor protocols.

## Product promise

The release target is one complete extension path with these properties:

- an immutable, bounded extension set with qualified identities, exact
  dependencies, explicit conflicts, and deterministic dependency-first order;
- a declarative schema compiler whose output, not extension installation order,
  defines content validity;
- a canonical compiled-schema identity that prevents validation proofs,
  documents, checkpoints, or logs from being reused with a different schema
  definition that happens to claim the same display identity;
- fingerprint-bearing durable wire generations for every record family that
  admits a non-base profile, while legacy V1 records remain bound to the exact
  built-in base definition;
- property-free inline-format registrations added to the sealed base text
  structure, with at least one non-built-in reference extension exercised by
  the full test suite;
- actions that emit the existing closed primitive operation language and
  semantic intents that select those actions through a frozen Rust router;
- exact undo, redo, checkpoint restore, and replay without rerunning extension
  action handlers;
- a versioned Wasm boundary for selecting the compiled profile and invoking
  semantic intents;
- a framework-neutral, bounded, callback-free browser render recipe for the
  admitted inline-format subset; and
- bounded callback-free toolbar contributions that reference intent and state
  identities rather than concrete action callbacks.

## Trust and lifecycle model

Semantic extensions are compiled before an editor opens. Their generation is
immutable for that engine's lifetime. Installing, removing, or changing a
semantic extension requires a new compiled profile and engine; it is never a
live mutation of an open editor. An explicit document admission or migration
step is required only when the durable schema fingerprint changes. An
action-, state-, or intent-only change can reopen the same document under the
same schema fingerprint with a new process-local profile generation.

Three identities stay separate. A durable schema fingerprint covers canonical
content meaning and travels with records. At the full `0.2.0` boundary, a
process-local compiled-profile generation will correlate the schema, actions,
state catalog, and intent router in one engine, but will not be a hash of native
executable code. Browser presentation configuration is checked for coverage at
startup yet can change labels or styling across editor reconstruction without
forcing document migration. CSS may change live without changing the checked
contribution set.

Alpha.5 carries that process-local generation through profile-created Rust
contexts, engines, observations, intent outcomes, and action-state caches, and
through the corresponding Wasm engine, descriptor, observation, projection,
selection, action-state, command, and intent handles. The generation remains an
opaque allocation identity with no numeric, string, pointer, JSON, or durable
representation. Browser presentation identity remains separate.

Alpha.6 consumes that correlated Wasm view as a disposable browser AST
projection. Each text run exposes the canonical set of admitted property-free
format kinds, while the durable JSON document, DOM, and clipboard HTML remain
separate representations. A checked browser presentation binds one complete
format recipe manifest to one live compiled-profile generation and descriptor;
projection updates, renderer ownership, point mapping, composition
reconciliation, clipboard serialization, and canonical export all retain that
correlation.

Alpha.7 closes the first supported browser intent path without widening the
portable semantic model. Every compiled base profile contains the tracked,
no-input `breditor/format-strong` intent, its priority-zero blocking route to
`breditor/toggle-strong`, and a Bold state entry sourced from that route. Native
`formatBold`, the configured Bold shortcut, the default Bold button, and
high-level `executeIntent()` use that same meaning. Supplied toolbars are
admitted only when each intent/history, activation, and absent value contract
matches the compiled descriptor. Complete action-state snapshots must match
the descriptor's fixed ordered catalog and value contracts before publication.
The public imperative result redacts concrete route provenance, while the
advanced adapter retains it.

Alpha.8 packages that complete path as `@breditor/reference-highlight`. Its
fixed profile uses schema `example/editor@1`, extension
`example/highlight-extension@1`, property-free format
`example/highlight@7`, action `example/toggle-highlight`, no-input intent
`example/toggle-highlight-intent`, binding
`example/toggle-highlight-binding`, tracked state
`example/highlight-control`, and durable schema fingerprint
`sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`.
The package exports inert bootstrap/document data and browser-created render
and toolbar manifests from its package root; it does not add an executable
semantic plugin seam.

A clean consumer outside the repository installs exact
`@breditor/browser@0.2.0-alpha.8`, `@breditor/wasm@0.2.0-alpha.8`, and
`@breditor/reference-highlight@0.2.0-alpha.8` tarballs and imports only their
package roots. It proves local module resolution and one shared exact browser
peer, type-checks, bundles, initializes the real Wasm module, and opens the
reference profile in Chromium. The actual package also runs in the repository's
Chromium, Firefox, and WebKit matrix through intent/state/toolbar dispatch,
mixed Strong/Highlight nesting, undo/redo, export/copy, plain paste, persistence
flush/reload, restored history, and disposal. Separate startup fixtures reject
missing or extra render recipes, catalog entries, and foreign toolbar
intent/state declarations before publishing host DOM.

Rust remains the authority for the AST, compiled schema, selection, action
evaluation, primitive operations, transactions, history, replay, and durable
codecs. The browser owns the DOM projection, browser events, focus, composition,
clipboard capabilities, scheduling, and presentation metadata. The DOM and
extension callbacks are not sources of canonical content.

Native Rust action handlers are trusted in-process code. Portable browser
extensions configure core-owned generic actions and select registered semantic
intents; `0.2.0` does not accept arbitrary JavaScript action planners. Breditor
does not claim to sandbox a native handler, and the stock Wasm module cannot
dynamically link arbitrary third-party Rust after it has been built.

## Required invariants

- Resolution and compilation results are independent of caller registration
  order.
- Canonical collections use lexical qualified-identity order. Duplicate
  ownership is an error; there is no last-wins behavior.
- Dependencies are exact and acyclic. Missing dependencies and installed
  conflicts fail the complete build before content opens.
- One installed extension version owns one qualified extension name in a
  profile.
- Caller profile schema IDs, extension IDs, extension format kinds, and
  extension-owned action, intent, binding, and state IDs cannot use the reserved
  `breditor/*` namespace. The built-in `breditor/base@1` schema cannot be
  impersonated.
- One manifest-owned toggle bundle names one format kind, action, intent,
  binding, and action-state identity; it targets a format declared by that same
  manifest. Each typed identity is unique within its identity namespace, and
  each toggle target is unique across the profile.
- The complete canonical compiled schema definition controls validation-proof reuse.
  A schema name and version alone are insufficient proof.
- Every published document passes complete schema validation. Derived
  capabilities may select optimizations but cannot weaken validation.
- `0.2.0` extension formats have no properties, exclusion callbacks,
  normalization callbacks, or custom persistence codecs.
- Existing core primitive operations remain the only replay language.
  Undo/redo and checkpoint replay never rerun an extension command or handler.
- Renderer nesting and converter order are explicit and deterministic; neither
  depends on extension installation order or one global priority number.
- Browser render contributions for the `0.2.0` subset are declarative recipes
  over a fixed safe element/attribute vocabulary. They are not DOM callbacks.
- Every admitted format has exactly one render recipe. Missing, extra,
  duplicate-signature, cyclic, or generation-mismatched recipes fail startup;
  lexical format identity breaks unconstrained ordering ties.
- The DOM is disposable projection state. DOM drift, unknown wrappers,
  noncanonical wrapper order, or profile mismatch cannot become canonical AST
  content.
- Profile persistence selects its checkpoint generation and exact durable
  schema binding before inspecting stored bytes. A mismatch returns an error
  without deleting, repairing, migrating, or overwriting the retained record.
- All manifest, schema, action, plan, projection, and toolbar collections have
  explicit count, depth, edge, and byte limits where applicable.
- Unknown schema types, persisted revisions, intent contracts, and schema
  fingerprints fail closed. No decoder silently drops unknown content.

## Deliberately outside `0.2.0`

The release will not promise:

- arbitrary block or inline node kinds, headings, lists, tables, images, embeds,
  atom nodes, or nested editable regions;
- property-bearing formats such as links or colors;
- multiple instances of one format kind on the same text node, ordered marks,
  mark groups, exclusion rules, inclusivity rules, or implicit normalization;
- extension-defined operation variants, replay codecs, document codecs, or
  arbitrary JavaScript callbacks inside the Rust transaction boundary;
- dynamic semantic extension installation, unloading, replacement, or
  dependency re-resolution in an open editor;
- a stable sandboxed Wasm component-plugin ABI or dynamic native-code loading;
- browser-to-Rust extension planner callbacks or arbitrary operation-plan
  ingress;
- custom extension actions, action inputs, effect declarations, callbacks,
  cross-extension toggle targets, shared toggle identities, or fallback toggle
  routing in the first property-free format path;
- schema migration execution beyond the identity, admission, and failure
  contracts required to prevent silent reinterpretation;
- collaboration, CRDT/OT rebasing, selective undo, remote cursors, or remote
  extension distribution; or
- a generic HTML compatibility promise. Canonical JSON, editing DOM, and
  HTML/clipboard conversion remain separate contracts.

Property-bearing links require coordinated new operation and editor-state wire
versions. Arbitrary nodes require generic validation rules, paths, selection,
structural primitives, projection invalidation, composition, clipboard, and
renderer contracts. Treating either as a small renderer feature would create a
document that some Breditor protocols cannot faithfully preserve.

The existing clipboard ingress remains deliberately plain text, so paste is
lossy for both built-in and extension formatting. `0.2.0` requires safe copy
serialization and deterministic stripping on paste; preserving rich fragments
on copy-to-paste would require a separately bounded semantic-fragment codec and
action and is deferred unless an alpha checkpoint explicitly adds that entire
path.

When a semantic profile and IndexedDB are both enabled, browser startup first
compiles and fully releases the profile solely to obtain trusted, handle-free
schema metadata for storage selection. It compiles the same bootstrap JSON a
second time to create the engine after the asynchronous load, then compares the
two schema identities before autosave can start. This deliberate double
compilation avoids retaining generated Wasm authority across an async storage
boundary; its startup cost is an accepted alpha.6 limitation.

## Checkpoint sequence

Each checkpoint is formatted, linted, tested, documented, committed, and tagged
before the next begins. `0.1.1` is additive and changes no existing public wire
or browser union. Work that changes those surfaces uses SemVer prereleases so
the stable `0.1.x` compatibility promise remains honest. A gate may be split
when review finds a correctness boundary; later features are not claimed early.

1. `0.1.1`: immutable Rust extension identities, manifests, limits, exact
   dependencies, conflicts, and canonical topological resolution. This is
   composition metadata only and changes no schema, codec, Wasm ABI, browser
   API, or editor behavior. Complete.
2. `0.2.0-alpha.1`: parity-first declarative schema specification and compiler,
   collision-free runtime proof identity, reserved built-in identities,
   canonical schema-fingerprint definition, and complete equivalence tests for
   `breditor/base@1`. Complete.
3. `0.2.0-alpha.2`: fingerprint-bearing durable record generations and
   schema-fingerprint admission for document, operation, transaction,
   editor-state, commit, checkpoint, Local Log Frame/tail, and Storage
   Root/Generation families. It includes non-destructive prepared admission from
   a checked compact checkpoint into a fresh lineage and session, exact V2
   checkpoint bytes, and a separately preparable Storage Root candidate. Legacy
   V1 records remain exact-base-only; mismatch never overwrites retained
   persistence evidence. The browser, IndexedDB profile, and Wasm ABI 2 remain
   V1-only. Complete.
4. `0.2.0-alpha.3`: sealed base-text schema extension for property-free inline
   formats plus generic format operations/actions, pending typing format,
   inverse, relocation, undo/redo, and checkpoint replay coverage. Manifests
   own the declarations; callers supply a non-reserved profile `SchemaId`; the
   compiler retains the fixed base structure and mints the only capability
   accepted by the widened primitives. The generic action is configured by
   format kind and remained an explicit caller registration in that checkpoint.
   Complete.
5. `0.2.0-alpha.4`: immutable manifest-owned inline-format toggle bundles, each
   naming one same-manifest format kind plus unique action, no-input intent,
   binding, and action-state identities. Compilation creates the existing
   generic Rust toggle action, a tracked no-input intent, one priority-0
   blocking binding, and routed toolbar-ready state. A
   `CompiledEditorProfile` co-owns the extension set, schema, registry, router,
   and catalog under a fresh opaque Rust-local generation. Per-manifest and
   aggregate toggle limits are 255; custom actions/inputs/callbacks,
   cross-extension targets, shared/fallback routes, and `breditor/*` extension
   semantic IDs fail closed. Semantic-only declarations do not change the
   schema fingerprint. Native component APIs remain advanced bypasses; the
   generation is not yet carried by engines or Wasm, and there is no browser
   renderer or toolbar widening. Wasm ABI 2 and every V1 codec remain
   exact-base-only. Complete.
6. `0.2.0-alpha.5`: Wasm ABI 3 profile bootstrap for both fresh and restored
   sessions, typed intent execution, profile-correlated projection/action-state
   observations, and an owned generation-correlated `CompiledProfileDescriptor`
   listing admitted format identities, intent/input contracts, and state/value
   contracts. Regenerate declarations, enforce exact package pairing, and run
   the real Wasm runner tests. Runtime generation, durable schema identity, and
   browser presentation identity remain distinct. Complete.
7. `0.2.0-alpha.6`: complete profile-aware base-text inline-format browser
   support: projection and updates, declarative rendering and DOM-drift checks,
   point mapping, composition reconciliation, safe copy serialization,
   deterministic removal of source formatting on paste, plain-text projection,
   canonical export correlation, and schema-fingerprint- or caller-slot-scoped
   persistence mismatch handling that never overwrites retained evidence.
   Complete.
8. `0.2.0-alpha.7`: supported browser `executeIntent` and intent-based toggle-
   button toolbar surface with startup validation of intent/state contracts.
   Concrete action dispatch remains an advanced policy bypass; extension
   keymaps, `beforeinput` rules, menus, selects, and custom controls are deferred.
   Public no-input calls use immediate-only queue leases and reject while
   delivery, composition, authoritative reads, or reentrancy owns the path.
   Descriptor-correlated action-state snapshots cannot change catalog identity
   or activation/value contracts after startup. Complete.
9. `0.2.0-alpha.8`: reference extension package, consumer fixtures, missing and
   extra browser contribution tests, cross-browser matrix, compatibility and
   limitation documentation, and size gates. Complete.
10. `0.2.0-rc.1`: complete release audit with no new feature widening.
11. `0.2.0`: final shippability gates, release notes, clean consumer proof, and
    an honest limitations review.

## Exit gates

`0.2.0` is complete only when:

- the full existing `0.1.0` Rust, Wasm, browser, storage, packaging, size,
  accessibility, and cross-browser suites still pass;
- registration permutations produce the same compiled extension set, schema,
  schema fingerprint, diagnostics, renderer order, and encoded bytes;
- changing only extension identity or version, action, state, intent, or
  presentation declarations preserves the schema fingerprint when the admitted
  schema projection, compiler contract, and compiled semantic admission
  constraints are unchanged. Tightening host-only `DocumentLimits`, JSON byte
  budgets, or transaction-operation limits also preserves that durable
  fingerprint. Document fast-path proof reuse still requires the exact relevant
  tree-validation policy, full `EditorContext` equality also requires exact JSON
  and transaction policy, and a new engine still receives a fresh process-local
  profile generation;
- exact-limit and limit-plus-one tests cover extension counts, graph edges,
  schema registrations, and all new wire envelopes;
- two different compiled definitions cannot share a validation proof merely by
  claiming the same schema identity;
- every durable codec that admits an extension profile rejects a missing or
  mismatched fingerprint, while legacy V1 codecs reject every non-base profile;
- fresh creation, checkpoint restore, autosave, and reload retain one durable
  schema fingerprint. Within each engine, its compiled-profile descriptor,
  action state, projection, and intent outcomes agree on that engine's current
  process-local generation; reload mints a new generation instead of persisting
  or reusing the prior engine's generation. Mismatch is non-destructive and
  never replaces the retained checkpoint;
- the reference format survives every existing primitive operation, pending
  typing state, inverse application, undo, redo, checkpoint encode/restore,
  canonical document export, browser projection, safe copy serialization, and
  reload; paste transports no source formatting, while inserted text still
  follows the existing target pending/context-format rules;
- render recipes exactly cover admitted formats: missing, duplicate, or extra
  recipes fail startup. Toolbar coverage is optional, but every supplied
  control is unique and exactly matches an admitted intent/input contract and
  state/value contract or startup fails. The fixed action-state ID set cannot
  drift after the engine opens;
- mixed built-in and extension format nesting is canonical, and intent dispatch
  remains safe under composition, reentrancy, stale delivery, state refresh,
  and fail-stop queue behavior;
- a clean external consumer can install, type-check, bundle, and run the
  reference extension using only supported package entry points; and
- documentation clearly distinguishes stable public contracts, advanced
  unstable seams, trusted native code, browser presentation code, and deferred
  capabilities.
