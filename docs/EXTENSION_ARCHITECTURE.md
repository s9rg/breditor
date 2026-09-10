# Breditor extension architecture

Status: the `0.1.1` through `0.2.0` compiler, engine,
Wasm, profile-aware browser, supported intent/toolbar, reference-package,
consumer-proof, release-audit, and final shippability checkpoints passed.
The unpublished `0.3.0-alpha.7` checkpoint retains alpha.4's first closed
property-driven presentation and makes the sealed paragraph-structure
operations preserve typed inline-format properties, then uses that operation
contract for cross-paragraph typed set/remove. It adds one closed browser-owned
typed form correlated through a new ABI-5 process-local set-surface triple. It
does not introduce a generic attribute protocol, arbitrary toolbar widget, or
extensible operation protocol. See [`V0_3_SCOPE.md`](V0_3_SCOPE.md) and the
normative [`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).

This document defines Breditor's extension architecture and the deliberately
narrow part of it that `0.2.0` ships. It complements
[`V0_2_SCOPE.md`](V0_2_SCOPE.md); if a broad architectural seam described here
is not in that scope, it is not a `0.2.0` feature.

The words **must**, **must not**, and **requires** below describe frozen design
decisions. The sections titled **Deferred**, **Open questions**, and **Explicit
limitations** distinguish work that is not promised by `0.2.0`.

## Scope in one paragraph

`0.2.0` compiles a complete, immutable set of declarative extension
manifests in Rust before an editor opens. The first portable semantic extension
point is intentionally only a property-free inline format on the existing base
text structure. It can register a generic Rust-owned action, bind that action to
a semantic intent, render through a callback-free browser recipe, and
contribute a callback-free toolbar item. Existing primitive operations remain
the replay language. Arbitrary nodes, attributes, callbacks inside the core,
custom operation codecs, runtime Rust/Wasm linking, and live semantic
installation are not part of this release.

That small vertical slice is meant to prove the hard contracts—identity,
ordering, proof binding, replay, history, Wasm ownership, projection, and UI
separation—before the grammar becomes more expressive.

## Inspiration, not inheritance

Breditor is not implementing or emulating the ProseMirror, Lexical, Tiptap, or
CKEditor 5 protocols. Their source and documentation are design evidence only.
Breditor does not accept their schemas, nodes, plugins, commands, transactions,
steps, serialized JSON, conversion rules, or lifecycle objects.

The relevant lessons are:

- ProseMirror makes schema registry order observable, gives keyed plugins
  unique identity, requires custom serialized steps to register a unique JSON
  identifier, and lets commands answer whether they apply without dispatching.
  Those are useful warnings about identity, order, and capability checks. See
  the official [schema source](https://code.haverbeke.berlin/prosemirror/prosemirror-model/src/branch/main/src/schema.ts),
  [plugin source](https://code.haverbeke.berlin/prosemirror/prosemirror-state/src/branch/main/src/plugin.ts),
  [step source](https://code.haverbeke.berlin/prosemirror/prosemirror-transform/src/branch/main/src/step.ts),
  and [command guide](https://prosemirror.net/docs/guide/#commands).
- Lexical models direct extension dependencies as a graph, distinguishes
  optional peers, makes conflicts explicit, and documents the ordering and
  convergence hazards of command handlers and transforms. Breditor adopts the
  requirements, not Lexical's object-reference identities or callback model.
  See [extension introduction](https://lexical.dev/docs/extensions/intro),
  [defining extensions](https://lexical.dev/docs/extensions/defining-extensions),
  [commands](https://lexical.dev/docs/concepts/commands),
  [transforms](https://lexical.dev/docs/concepts/transforms),
  [nodes](https://lexical.dev/docs/concepts/nodes), and
  [serialization](https://lexical.dev/docs/serialization/).
- Tiptap offers a convenient unified extension facade, but an extension name
  participates in several namespaces, one priority can affect unrelated
  registries, and duplicate extension names currently warn rather than fail.
  Breditor deliberately uses typed identities, separate order graphs, and
  fail-closed ownership. See the [Extension API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension),
  [extension resolver](https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/helpers/resolveExtensions.ts),
  [priority sorter](https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/helpers/sortExtensions.ts),
  and [extension manager](https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/ExtensionManager.ts).
- CKEditor 5 demonstrates strict plugin naming, dependency-first
  initialization, a model separate from its views, separate editing and data
  conversion, observable command state, and separate editing and UI plugins.
  Breditor keeps those separations but defines its own data contracts. See
  [plugin static members](https://ckeditor.com/docs/ckeditor5/latest/api/module_core_plugin-PluginStaticMembers.html),
  [plugin collection](https://ckeditor.com/docs/ckeditor5/latest/api/module_core_plugincollection-PluginCollection.html),
  [schema deep dive](https://ckeditor.com/docs/ckeditor5/latest/framework/deep-dive/schema.html),
  [conversion introduction](https://ckeditor.com/docs/ckeditor5/latest/framework/deep-dive/conversion/intro.html),
  [commands](https://ckeditor.com/docs/ckeditor5/latest/framework/tutorials/crash-course/commands.html),
  and the [editing/UI split example](https://ckeditor.com/docs/ckeditor5/latest/framework/tutorials/widgets/implementing-a-block-widget.html).

These links explain choices; they are not normative dependencies. Changes in
those projects do not change Breditor's contract.

## Contract topology

The extension path has three layers:

```text
host/package layer
  package installation + distribution version + trusted browser modules
                    |
                    | bounded manifest values
                    v
Rust semantic layer
  resolve -> compile profile -> validate -> act -> commit -> history/replay
                    |
                    | immutable snapshots, intents, outcomes
                    v
browser presentation layer
  editing projection + render-recipe registry + toolbar + input/clipboard policy
```

Only the middle layer owns canonical meaning. The host supplies inputs but does
not choose validity. The browser displays state and requests intents but does
not commit DOM state.

An **extension package** is a crate, npm package, or application module. An
**extension manifest** is the bounded data-only semantic declaration it gives
Rust. A **compiled profile** is the immutable Rust result for the complete
manifest set. A **presentation contribution** is browser-owned UI or renderer
metadata/code and has no canonical mutation authority.

## Decided contracts

### 1. Semantic profiles are declarative, complete, and immutable

The portable semantic input is a bounded data-only manifest. `0.1.1` begins
with private-field, checked-constructor Rust values; a stable strict wire envelope is not
promised at that first checkpoint. If and when a public
`ExtensionManifestV1` wire format is frozen, it receives a distinct identity
such as `breditor/extension-manifest@1` and the normal strict-codec review.

A semantic manifest contains no function pointers, closures, DOM nodes, CSS,
arbitrary JavaScript, Rust trait objects, or Wasm modules.

Rust receives the entire manifest set in one bounded compile request. It never
searches a package registry, downloads dependencies, executes package setup,
reads a filesystem path from a manifest, or infers an extension from browser
registration order.

Manifest construction and compilation are all-or-nothing. Invalid qualified
identifiers or versions, count/byte limit violations, ownership collisions,
missing dependencies, conflicts, and cycles return stable diagnostics without
a partial profile. A future wire decoder additionally rejects unknown required
fields, duplicate keys, and non-canonical values.

The alpha.4 result is a private-constructor `CompiledEditorProfile`. It co-owns
the resolved `ExtensionSet`, compiled schema, generated action registry, intent
router, observable action-state catalog, and a fresh opaque process-local
generation. All of those components come from one compilation; callers cannot
mix and match them. Alpha.5 carries that generation through profile-created
contexts, engines, observations, intent outcomes, action-state caches, and the
Wasm owned-handle graph. It remains non-scalar and non-durable; a separate
engine-instance identity still rejects observations from a sibling engine made
by the same reusable profile.

A semantic profile is fixed for an engine's lifetime. Installing, removing, or
changing a semantic extension requires a new profile and a new engine/session.
Presentation labels and checked recipes may change across browser-editor
reconstruction because they cannot change validation, operations, persistence,
replay, or history. CSS may change live, but the checked render-recipe and
toolbar-contribution identity sets remain fixed for one browser editor instance.

### 2. Identity and version axes stay separate

Breditor will not overload one extension `name` or `version` with unrelated
jobs. The following axes are distinct types and fields:

1. **Distribution version** is the npm/crate SemVer. The host may show it in
   diagnostics, but it is not persisted AST identity.
2. **Manifest envelope version** selects a future strict manifest codec. It is
   separate from the initial Rust value model and every extension/type version.
3. **Breditor compatibility/ABI version** states which profile compiler and
   Wasm transport contract the package expects.
4. **Extension manifest version (`ExtensionVersion`)** is a nonzero
   developer-assigned integer used in exact extension relationships. Its
   numeric order does not assert compatibility. `0.2.0` dependencies name one
   exact value; package version ranges are not interpreted by Rust.
5. **Persisted type revision** belongs to one semantic node or format type. A
   future extension can change one type without pretending every type changed.
6. **Durable schema fingerprint** identifies the exact canonical content
   definition and schema-compiler contract, independent of package paths or
   load order.
7. **Process-local profile generation** correlates one compiled schema with its
   action registry, state catalog, and intent router. It is neither persisted
   nor claimed to hash native executable behavior.
8. **Browser presentation identity** correlates the checked render and toolbar
   contribution set. It can change without reinterpreting persisted content.

Extension, node, inline-format, action, intent, renderer, converter, and toolbar
contribution identities use the existing validated qualified-name grammar but
remain distinct Rust types and namespaces. String equality never converts one
identity category into another.

One profile admits exactly one owner for every identity. Duplicate extension
manifests and duplicate ownership claims are errors, including byte-identical
duplicates. A host may deduplicate before compilation, but Rust never guesses
whether duplicates were accidental or which one should win.

The complete `breditor/*` namespace is reserved independently in every typed
identity namespace. In particular, an extension cannot impersonate
`breditor/base`, `breditor/document`, `breditor/paragraph`, `breditor/strong`,
or a built-in action or intent. Renaming a persisted schema,
node, or format identity changes canonical content meaning and requires explicit
admission or migration. Renaming an extension, action, intent, or state identity
instead requires a new compiled profile and engine plus the corresponding
dependency or checked browser-contribution updates; it does not require document
migration while the durable schema fingerprint remains unchanged.

### 3. Dependencies, conflicts, and order are deterministic

`0.2.0` manifests can declare exact required dependencies and exact conflicts
by `ExtensionId`, which includes the qualified name and `ExtensionVersion`.
Required dependencies form a DAG.
Compilation rejects a missing dependency, wrong version, dependency cycle,
present conflict, duplicate identity, or edge/count limit violation before any
document opens.

The resolved extension order is dependency-first. When multiple vertices are
ready, the lexicographically smallest canonical qualified extension identity
wins. The result is therefore independent of input array order, JavaScript
object enumeration, filesystem traversal, and package installation order.

There is no one global numeric priority. A subsystem that genuinely needs
ordering has its own typed order graph and explicit `before`/`after` edges.
Renderer nesting, converter matching, input handling, and future middleware do
not accidentally reorder one another. An exclusive registry such as semantic
type or action ownership rejects collisions instead of resolving them by order.

Optional peer dependencies, capability providers, extension-version ranges, and
multi-instance extensions are deferred. They can later extend the resolver
without changing the 0.2 rule that every present input has one canonical result
or one canonical error.

### 4. Durable schema identity, runtime generation, and presentation identity differ

`SchemaId` remains a human-readable, versioned selector. It is not proof that
two independently compiled definitions with the same claimed name are equal.

The schema compiler produces a `SchemaFingerprint` from a canonical encoding of
every input that can change canonical content meaning, including:

- schema value-model and compiler-contract versions;
- the exact admitted semantic schema projection, including qualified node and
  format identities, persisted type revisions, and every compiled content,
  property, and context constraint; and
- compiled content-language constraints, including any semantic minimum or
  maximum encoded by a type rule.

Whole extension identities, `ExtensionVersion` values, and manifest versions are
not fingerprint inputs merely because their manifest also contributes schema;
only their admitted canonical schema projection is included. The durable
fingerprint also excludes action implementation and declaration data, state
definitions, intent routing, process addresses, package paths and versions,
timestamps, localized labels, icons, CSS, toolbar placement, and browser
rendering. Consequently an extension-identity, extension-version, action-,
state-, or intent-only change preserves the schema fingerprint even when the
extension also contributes schema, provided the compiled schema projection,
compiler contract, and content-language constraints are unchanged. Host
resource policy is deliberately separate: `DocumentLimits`, JSON byte budgets,
transaction-operation limits, and similar memory or work ceilings are not
fingerprint inputs. They can reject otherwise valid content on one host and
remain enforced at their relevant runtime boundaries: document fast-path proof
reuse compares the exact tree-validation profile, while full `EditorContext`
equality also compares JSON and transaction policy. Tightening those policies
does not claim a new content language. A fingerprint is an exact
content-meaning key, not a hash of the whole executable or its deployment
policy.

The implemented byte-level encoding, field tags, and locked base vector are
specified in [Schema fingerprint contract](SCHEMA_FINGERPRINT.md).

Rust issues a private `CompiledSchemaProof` tied to the compiled schema and its
fingerprint. Documents and candidate results must be validated with that proof.
Another compiled definition cannot reuse it merely by claiming the same
`SchemaId`.

Separately, alpha.4 gave each successfully compiled `CompiledEditorProfile` an
opaque `CompiledProfileGeneration`. It correlates that container's schema,
action registry, action-state catalog, and intent router. It is not persisted,
stable across reconstruction, or presented as a digest of native Rust handlers.
Alpha.5 carries or checks it through profile-created contexts, engines,
action-state observations, intent outcomes, and Wasm projection handles. It is
not added to transactions or durable history records; those inherit the
profile-bound context without serializing its process-local identity.

The browser constructs a third, presentation-only identity after verifying
that its declarative render recipes exactly cover the active format set and
that every supplied toolbar contribution matches an admitted intent and state
contract. A toolbar need not expose every intent. Labels and recipes may change
across reconstruction, and CSS may change live, without document migration.
Changing the checked contribution set requires presentation
revalidation/reconstruction, not a different schema fingerprint.

The schema fingerprint is suitable for equality, cache keys, durable admission,
and replay binding. It is not a package signature, provenance proof,
authorization token, or substitute for trusting the shipped Rust core.

### 5. The schema extension seam is narrow in 0.2.0

Breditor has an AST tree. Rust owns it. An extension does not subclass AST
objects or supply validation callbacks.

The long-term direction is a Breditor-owned, data-only `NodeSpec` and
`InlineFormatSpec` grammar compiled into validators and operation
preconditions. A type spec will have a qualified identity, one owner, an
independent persisted revision, bounded typed properties, explicit child or
context constraints, and no executable value. Another extension will not be
able to mutate an owned type by load order; composition will require an
owner-declared augmentation point.

Only one sealed subset is accepted in `0.2.0`:

- the base root remains `breditor/document`;
- the root still contains direct `breditor/paragraph` children;
- paragraphs still contain text leaves;
- an extension may register a qualified inline-format kind on those text
  leaves;
- the format has no properties, entity identity, inclusivity rule, exclusion
  rule, group, normalization callback, or multiple same-kind instance;
- semantic format sets remain ascending and unique by qualified type;
- adjacent text leaves with equal format sets remain non-canonical; and
- the existing limits and complete final validation remain authoritative.

The implemented alpha.3 Rust entrypoint is
`CompiledSchema::try_compile_base_text_profile(schema_id, &extensions)`.
The caller supplies the complete `SchemaId`, and its qualified name must not
use the reserved `breditor/*` namespace. In particular, the compiler never
reuses `breditor/base@1`: that selector remains exactly the original
strong-only definition. Each resolved manifest owns its
`InlineFormatSpecV1` declarations, each declaration carries a qualified kind
and independent nonzero `PersistedTypeRevision`, and both per-manifest and
aggregate extension-format counts are capped at 255. The built-in strong
format occupies the final slot in the compiler's 256-format ceiling.

Compilation is all-or-nothing and diagnostics follow canonical phases.
Reserved schema and extension identities, aggregate overflow, duplicate
cross-manifest format ownership, and reserved core-format impersonation fail
without a partial schema. Declaration order, owning extension identity, and
`ExtensionVersion` do not change the fingerprint when the admitted format
kinds and revisions are unchanged; a changed schema selector, format kind, or
persisted type revision does.

In other editor terminology this resembles a very small property-free “mark”
extension, but `InlineFormatSpecV1` is Breditor's contract. ProseMirror content
expressions, Lexical node classes, Tiptap extension objects, and CKEditor schema
callbacks are not accepted inputs.

`breditor/strong` is expressed through the same compiled registration machinery
for parity testing, while `breditor/base@1` still means exactly the original
closed strong-only schema. Golden tests must prove that compiling the built-in
base declaration preserves every valid/invalid 0.1.0 decision and canonical
byte sequence before the special-case path can be retired.

Arbitrary node specs, block/inline/atom nodes, nested editable regions,
properties, links, colors, mark exclusions, normalization, and custom schema
code are deferred.

### 6. Durable extension records carry the schema fingerprint

The existing V1 document, operation, transaction, editor-state, commit,
checkpoint, and local-log families are permanently bound to the exact built-in
`breditor/base@1` definition. They do not gain a field, reinterpret their schema
selector, or begin accepting extension profiles.

Any durable record family that admits a non-base profile receives a new,
explicitly versioned wire generation. That generation carries both its schema
selector and the exact durable `SchemaFingerprint`. This applies to documents,
operations, transaction requests, editor states, commits, session checkpoints,
and every local-log record that embeds or refers to them. The concrete format
names and version numbers are frozen together in `0.2.0-alpha.2`; there is no
half-upgraded mixed family.

Strict decoding has three distinct checks:

1. route and validate the complete wire envelope and resource limits;
2. require the selector and fingerprint to match the receiving compiled schema;
   and
3. reconstruct, completely validate, and bind the canonical value to the
   receiving process-local proof.

A matching `SchemaId` with a missing or different fingerprint fails. A legacy
V1 record offered to a non-base profile fails. Unknown formats, unavailable
profiles, type-revision mismatch, and fingerprint mismatch fail closed. No
decoder silently installs an extension, drops a format, or rewrites retained
bytes. V1 never accepts non-empty format properties. A Rust V2 decoder accepts
them only when its exact `0.3.0-alpha.1` compiled property contract and
fingerprint do.

The only durable schema-fingerprint transition implemented for `0.2.0` is
explicit structural admission:

1. validate the source document with its exact source proof/fingerprint;
2. validate the unchanged AST under the exact target compiled proof;
3. encode a target-generation document/checkpoint only if both validations
   succeed;
4. begin a new session and history lineage; and
5. leave the source bytes, stored checkpoint, and engine untouched on failure.

Admission is sufficient to move a base-only tree into a strict superset profile
because no content transformation is required. Restore and autosave never
replace retained evidence after a mismatch or partial failure.

General migrations are a frozen boundary, not a shipped execution language. A
future migration must name exact source and target fingerprints and per-type
revisions, be pure/deterministic/bounded/all-or-nothing, run before target
replay, validate its output under the target proof, and record the transition.
It must not call JavaScript, DOM, time, randomness, network, or locale. There is
no implicit downgrade, and opaque unknown-node preservation is deferred.

`0.2.0-alpha.2` places this boundary in the standalone
`SchemaAdmissionRequest::try_prepare` API. It borrows a checked
`LocalLogCheckpointAnchor`, requires a different target fingerprint, lineage,
and durable local-session identity, discards source selection and history, and
returns a non-cloneable `PreparedSchemaAdmission`. That result keeps the new
target checkpoint owner and its exact canonical Local Log Checkpoint V2 JSON
together. It does not mutate an engine or storage and is not a publication or
writer-fence receipt. A separate checked API can prepare a Storage Root V2
candidate from it, but the host still owns publication and adoption. Requiring a
checked source checkpoint, rather than accepting an arbitrary live session or
raw document, is a deliberate release boundary.

### 7. Operations, replay, and history remain closed

Extensions do not register operation variants, JSON tags, inverse callbacks, or
replay callbacks in `0.2.0`. The existing versioned primitive operation language
remains the only persisted mutation language.

The generic inline-format action constructs an atomic plan inside Rust from
those primitives against an exact observation. The existing Rust registry path
checks the schema proof, snapshot/revision guard, action input contract,
declared effects, every primitive, selection and pending-format result,
resource limits, and complete final schema validity before publishing anything.
The profile-aware engine/Wasm boundary in alpha.5 additionally checks the
compiled-profile generation before engine instance, snapshot, or history
identity.

At alpha.3, `ToggleInlineFormatAction` became the public Rust-owned generic
implementation. Construction permanently binds one qualified format kind;
evaluation is disabled unless the active compiled schema admits that kind as
property-free. Collapsed selections update explicit pending formats without a
document operation. Extended same-paragraph and cross-paragraph selections
emit existing guarded `TextSplice` and `RootTextReplace` values, preserving
selection direction and reporting inactive, active, or mixed state.
`ToggleStrongAction` remains a compatibility wrapper with its original action
identity and diagnostic vocabulary.

Alpha.4 adds immutable manifest-owned `InlineFormatToggleSpecV1` bundles. Each
bundle names one format kind, action ID, intent ID, binding ID, and action-state
ID. The target must be a property-free format declared by that same manifest;
one format has at most one toggle. Compilation admits at most 255 toggles per
manifest and 255 across the complete profile, rejects duplicate identities in
each typed namespace, and rejects every extension semantic ID in the reserved
`breditor/*` namespace. It then registers the existing generic toggle action, a
tracked no-input intent, one priority-0 blocking binding, and routed observable
state. There are no custom action handlers, callbacks, inputs, effect choices,
cross-extension targets, shared toggle identities, or fallback routes.

The existing primitives accept only compiler-minted capabilities for the
sealed root/paragraph/text shape, not an arbitrary schema that happens to use
similar names. `TextSplice` has its property-aware text capability;
`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` use the distinct
paragraph-structure capability added in alpha.5. The older property-free base-
text capability remains the explicit sentinel for the frozen V1/V2 operation
codecs and the property-free local-splice proof. Wire shapes are unchanged.
Exact inverses, relocation, undo/redo, and replay preserve property-free
extension formats through V2 and complete typed format instances through the
explicitly selected V3 families without invoking the generic action again.

There is no browser-to-Rust extension action planner callback and no arbitrary
operation-plan ingress in `0.2.0`. Portable browser code selects a registered
semantic intent; it does not manufacture the operations for that intent.

Replay stores and applies the committed primitive plan. It does not rerun the
extension action, semantic intent selection, toolbar event, renderer, or
browser code. Replay must not access JavaScript, DOM, network, clock,
randomness, locale, filesystem package state, or extension installation order.

Undo and redo store exact forward/inverse recipes under the same durable schema
fingerprint and use the normal guarded path. At the alpha.5 profile-aware
runtime boundary, in-memory entries will also require the current profile
generation and restored entries will be reconstructed and re-proved under the
new engine generation. History cannot cross schema-fingerprint
admission or migration. Opening a document under a different schema fingerprint
starts empty undo and redo stacks, and the transition reports that boundary
explicitly.

Implicit transforms and normalizers are absent. An action must produce a valid
final state atomically. This avoids extension-order-dependent fixed points and
infinite normalization loops. If normalizers are ever introduced, they require
a separate pure declarative contract, canonical scheduling, strict bounds, and
proof of stable replay behavior.

First-party actions continue to live in separately named source files with
their own contracts and tests. Generic extension behavior is implemented once
as a generic action, not as a growing central switch over extension identities.

### 8. Actions, intents, state, and toolbar presentation stay separate

The existing separation is retained:

- An **action** is a Rust-owned semantic operation producer with a qualified
  `ActionId`, exact input contract, declared read/write effects, and
  authoritative state evaluation.
- An **intent** is a stable user meaning with a qualified `IntentId`. The frozen
  router resolves it to an applicable action using explicit predicates and a
  deterministic fallback order.
- An **action-state entry** is the authoritative enabled/active/value result
  computed from an immutable core observation.
- A **toolbar contribution** is bounded presentation data referring to an
  intent and state identity. It is not a callback and does not own an action.

For `0.2.0`, a property-free inline-format registration can instantiate a
closed generic action recipe such as “toggle this registered format,” register
an intent route, and contribute presentation metadata. It cannot inject an
arbitrary Rust or JavaScript handler into evaluation.

The alpha.4 semantic bundle stops before presentation: it contains no label,
icon, shortcut, renderer recipe, or toolbar placement. Alpha.6 adds a separate
callback-free browser render manifest for complete format coverage. Alpha.7
adds the supported intent-driven toggle-button toolbar while keeping its label,
group, order, and control declarations outside the Rust profile.

Every compiled base profile now includes the tracked no-input
`breditor/format-strong` intent, the priority-zero blocking
`breditor/format-strong-binding` route to `breditor/toggle-strong`, and the
`breditor/control-bold` state sourced from that route. Browser
`beforeinput` `formatBold`, primary-modifier+B, the default Bold button, and
high-level `executeIntent()` therefore share one frozen semantic meaning
without exposing the selected action as public API.

Action, intent, route, and contribution ownership collisions fail. Intent
fallback order is part of the compiled semantic profile; toolbar placement is
presentation-only. A toolbar activation always re-enters the guarded intent
FIFO against live state. The high-level imperative intent method is stricter:
it acquires an immediate idle-queue lease and reports busy rather than waiting
behind delivery, a read, composition, or reentrant work whose base could become
stale. A previously enabled button is not commit authority.

Labels, localization, icons, placement hints, shortcut display, CSS, and
framework components live in the browser package. They are excluded from the
durable schema fingerprint and Rust process-local profile generation. They
cannot change input contracts, effect declarations, selection policy, history
intent, or persisted operation meaning.

The browser's existing direct action dispatch remains an explicitly advanced
policy bypass. The supported expandable toolbar path uses semantic intents so a
host can choose routes while compiling a new profile without coupling UI layout
to action implementation.

Alpha.8 ships one concrete package-level proof,
`@breditor/reference-highlight`. It freezes schema `example/editor@1`,
extension `example/highlight-extension@1`, property-free format
`example/highlight@7`, action `example/toggle-highlight`, no-input intent
`example/toggle-highlight-intent`, binding
`example/toggle-highlight-binding`, and tracked state
`example/highlight-control`. Its exact schema fingerprint is
`sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`.
The package-root exports are immutable profile/document data plus render and
toolbar manifests created by `@breditor/browser`; the package is not a dynamic
semantic implementation or an executable extension lifecycle.

### 9. Editing projection, conversion, and persistence are different seams

The editing DOM is a disposable projection of Rust-owned AST and selection.
For the `0.2.0` subset, browser render contributions are bounded declarative
recipes over a fixed safe element vocabulary. Alpha.4 adds one closed
attribute policy, `safeLinkV1`; neither surface admits DOM callbacks, framework
components, arbitrary element constructors, or HTML strings.

At browser startup, the combined built-in and extension presentation set must
contain exactly one valid render recipe for every format admitted by the active
compiled schema and no recipe for an absent format. Missing, duplicate, or
extra recipes fail construction. Toolbar coverage is optional, but every
supplied control identity is unique and must exactly match an intent/input
contract and state/value contract in the compiled profile descriptor; otherwise
construction fails. The browser records a presentation identity only after
these checks. Labels and recipes can change across reconstruction, and CSS can
change live, but the checked contribution set is immutable for that browser
editor instance.

The descriptor also fixes the complete action-state catalog for that instance.
Every consumed snapshot must repeat its exact count and ordered lexical IDs.
Resolved entries must satisfy the declared tracked/stateless activation and
either report unsupported when no value contract exists or repeat the exact
value-contract name and version. Drift rejects the refresh before the last-good
store can mutate; it is not a dynamic catalog update protocol.

Format sets are semantic unordered sets stored in qualified-identity order.
DOM wrapper nesting is a separate explicit deterministic render order. It uses
its own `before`/`after` graph and lexical identity tie-break, never package
installation order or a global extension priority.

The projection consumes profile-correlated immutable observations and checks
DOM drift. A recipe receives no mutable AST reference and cannot commit
content. The toolbar consumes immutable action-state snapshots and intent
descriptors; it does not inspect DOM formatting to decide canonical active
state.

Canonical JSON persistence is emitted and admitted by Rust. Exported HTML is a
separate data view and must never be obtained by serializing the editing DOM,
which may contain selection scaffolding, composition sentinels, decorations, or
browser workarounds.

Clipboard ingress remains deliberately plain text. Copy may safely serialize
the admitted formatting and alpha.4's canonical Link attributes for external
consumers, but paste transports no source formatting or properties into the
existing bounded text insertion path. Inserted text still inherits the target
caret's pending or contextual formats under the existing action contract.
There is no private rich-fragment codec or rich copy-to-paste round trip.
`innerHTML` is not a semantic transaction and raw HTML is not canonical AST.

A generic HTML compatibility system, executable portable converters, and full
round-trip fidelity are deferred. When richer converters arrive, editing,
import, export, and clipboard registries remain separate and each ordered
registry gets its own deterministic graph.

### 10. Rust/Wasm owns semantics, not dynamic native plugins

Rust/Wasm is useful on the hot shared semantic path: validation, action
evaluation, operations, selection mapping, canonical encoding, replay, and
history. It does not automatically accelerate DOM/layout work, and frequent
fine-grained Rust/JavaScript crossings can erase gains. Calls should remain
coarse, bounded requests with hot loops inside Rust.

The stock Wasm module cannot dynamically link arbitrary third-party Rust. A
separate Wasm module has separate memory, tables, allocator, panic behavior,
and versioning; Rust's native ABI is not a stable plugin ABI.

The supported `0.2.0` path introduced Wasm ABI 3. Its Alpha.5 checkpoint carries
a compiled profile and opaque generation through Rust-owned engines and Wasm
handles. The `0.3.0-alpha.3` source checkpoint advances to ABI 4 for the
explicit Profile Bootstrap V2 factories that accept Document V2 or Session
Checkpoint V3; the legacy exact-base factory remains a separate V1
compatibility path. The supported `0.3.0-alpha.7` browser path requires ABI 5
and adds only the canonical typed-set format/intent/action-state correlation.
It admits either the exact built-in base descriptor or one completely
correlated compiled-profile descriptor plus callback-free browser
presentation. Profile Bootstrap V2, schema fingerprints, and every durable
format remain unchanged. `@breditor/reference-highlight` declares an
exact `@breditor/browser` peer because render and toolbar manifests are branded
by the browser module instance that creates and admits them; a nested or
mismatched browser copy is not a supported substitute.

The ABI 3 bootstrap boundary, retained by later ABI generations:

1. pass the complete manifest set during fresh or restored profile/engine
   bootstrap through the generated bounded value boundary;
2. receive a Rust-owned engine handle, durable schema fingerprint, and opaque
   process-local profile generation;
3. receive an owned, bounded, generation-correlated
   `CompiledProfileDescriptor` containing the admitted format identities,
   intent identities and input contracts, and state identities and value
   contracts required for exact browser contribution admission;
4. observe profile-correlated projection/action state and execute typed
   semantic intents through generated bindings;
5. receive owned outcomes/snapshots, never borrowed pointers retained by JS;
6. dispose every generated object and engine/profile handle explicitly; and
7. reject mismatched official browser/Wasm package pairs before construction.

There are no JS callbacks during a Rust mutation, Rust trait objects across the
boundary, shared allocator ownership, or caller-forged validation proofs.
Handles use the existing ownership/generation discipline, ABI messages use
strict versioned shapes and stable diagnostic codes, and all new collections
have exact count/byte limits.

A product needing custom native semantic code must build and distribute a
different executable Breditor core. Every successfully compiled profile,
rather than every engine, receives a fresh process-local
`CompiledProfileGeneration`; alpha.5 carries it into engine/Wasm observations.
Its durable `SchemaFingerprint` changes only when the canonical compiled schema
meaning, schema-compiler contract, or compiled content-language admission
constraints change. A future sandboxed component-plugin ABI is a separate
design and does not hide behind the portable manifest value model.

## `0.3.0-alpha.1` typed-property refinement

The first `0.3.0` checkpoint implements the data language before its mutation
or browser presentation. A manifest may attach one
`InlineFormatPropertyContractV1` to a format it owns. The contract is immutable,
closed, canonical data: 1 through 32 unique qualified keys, each required or
optional and typed as Boolean, a bounded JavaScript-safe integer, or a bounded
UTF-8 string. There are no callbacks, defaults, coercion, normalization,
patterns, cross-property rules, or container values.

This adjunct—not `InlineFormatSpecV1`, toolbar metadata, or a renderer—enters
the compiled document language. Every property name, presence rule, scalar
type, and bound enters compiler-contract fingerprint version 2. Property-free
schemas continue to emit exact version-1 bytes. Rust Document V2 validation
admits only exact keys and values, with explicit per-string, aggregate document,
retained-checkpoint, and validation-report limits.

Editing fails closed until a typed mutation protocol exists. Any typed format
globally disables `TextSplice`, `ParagraphSplit`, `ParagraphJoin`, and
`RootTextReplace` under that schema; property-bearing pending formats and
generated no-input toggles are rejected. Ordinary typed document admission and
selection/state-only use remain possible, so this is not a claim that all state
or checkpoint handling is disabled.

At alpha.1, Wasm ABI 3 and the browser remained property-free. Their bootstrap
and descriptor could not declare the contract, and there was no typed renderer,
toolbar input, clipboard/HTML mapper, or URL/CSS sanitizer. Alpha.2 subsequently
proved the explicit property-aware operation, action input, inverse, undo/redo,
and replay boundary described next.

## `0.3.0-alpha.2` typed editing and replay

Alpha.2 adds `InlineFormatSetSpecV1` and registration-owned
`SetInlineFormatAction` for one same-manifest typed format. The declaration
generates an explicit-input action, typed intent, priority-0 blocking binding,
and routed presence state. Paragraph-local `TextSplice`, insertion/type-over,
selection deletion, grapheme deletion, exact relocation, inverse, undo, and
redo preserve complete canonical property maps.

Operation, Editor State, Transaction Request, Commit, and Session Checkpoint V3
are separate explicitly selected property-preserving families around Document
V2. V1/V2 bytes remain unchanged and fail closed where their property-free
operation or pending-format payload cannot represent a typed value. Structural
typed paragraph split/join/root replacement and Local Log V3 remain absent.

## `0.3.0-alpha.3` ABI 4 and browser bridge

Profile Bootstrap V2 explicitly carries typed property contracts and set
declarations through ABI 4. The compiled descriptor exposes property names,
presence, scalar kinds, and bounds; semantic projections expose canonical
Boolean, integer, and string values. Strict typed action and intent JSON derive
their contract identity from the registered action/intent rather than caller
input.

ABI-4 action, intent, undo, and redo calls carry one close-before Boolean. The
core runs an effective history boundary and the command on one checkpointed
candidate and publishes both or neither; the result reports the boundary
through `historyGroupClosedBefore`. Typed rejection therefore cannot split an
undo group and command evaluation remains single-pass.

Explicit V3 profile factories start from Document V2 or restore Session
Checkpoint V3 and emit Session, Editor State, and Commit V3. Browser startup
selects this only with `{ bootstrapJson, formatVersion: 2 }`, validates the
complete descriptor/projection/durable binding, and uses Session V3 for
IndexedDB restore and autosave. High-level `executeIntentJson()` exposes the
typed semantic command path. Bootstrap V1/Profile V2 and exact-base V1 remain
separate preserved paths with no sniffing or fallback.

The browser projection now carries typed data, but the renderer recipe still
selects only an inert safe wrapper, classes, and order. It cannot derive `href`,
CSS, or other attributes from property values; safe-copy HTML and the native-
button toolbar likewise have no typed property control. Those declarative,
sanitized presentation/input contracts are the next extension seam.

## `0.3.0-alpha.4` closed Link presentation

Alpha.4 adds one browser-owned property policy rather than a general attribute
mapper. A recipe with `attributes.kind: "safeLinkV1"` must be exactly
`<a class="breditor-link">` and must bind a format with exactly two required
properties: the named href is a string with the exact inclusive UTF-8 bounds
`1..=2048`, and the named open-in-new-window value is Boolean. Profile
compilation rejects every other descriptor/policy pairing.

The browser accepts navigation only for absolute, credential-free `http:` or
`https:` URLs without control or Unicode-whitespace scalars and within 2048
UTF-8 bytes before and after normalization, then emits the canonical URL. A
safe same-window link emits only `href`; a safe new-window link also emits fixed
`rel="noopener noreferrer"` and `target="_blank"`. A schema-valid unsafe value
renders as an inert anchor. Recipes cannot supply arbitrary attributes, styles,
callbacks, raw HTML, URL schemes, `rel`, or target values. Rust continues to
validate scalar contract shape and bounds only; URL semantics belong to the
browser policy.

DOM creation, retained-DOM checks, native-composition admission, and semantic
copy HTML use those exact resolved shapes. HTML paste may admit the same inert,
href-only, or href/rel/target forms, but all admitted markup is flattened to
plain text; source formats and properties are never reconstructed.

The additive reference Highlight + Link profile preserves all prior
Highlight-only exports. Its application-owned React form creates exact typed
set/remove JSON and calls `executeIntentJson()`. The built-in declarative
toolbar remains restricted to native no-input buttons; the form is an example
of host UI, not a new toolbar plugin or callback surface.

## `0.3.0-alpha.5` and `.6` typed paragraph formatting

Alpha.5 makes the sealed `ParagraphSplit`, `ParagraphJoin`, and
`RootTextReplace` operations preserve complete typed format instances and
lifts the existing structural actions over them. The separate property-free
base capability remains the V1/V2 codec sentinel. Alpha.6 then uses the same
property-aware root replacement for the registration-owned setter without
adding an operation kind, callback, or browser planner.

Across multiple direct-root paragraphs, `SetInlineFormatAction` installs one
exact complete target instance on every selected character or removes that
target kind. One same-paragraph-count `RootTextReplace` preserves all peer
formats, unselected edge fragments, empty middle paragraphs, and paragraph
boundaries. A structure-only range with no text remains unavailable. The
action's global activation and the manifest-generated fixed-remove presence
state report exact all/partial/none truth; no property value is retained in the
declaration or state catalog.

Planning checks the full derived tree and property delta before publication.
The result selection is rebuilt against canonical runs with anchor/focus
direction and affinities intact, pending formats are cleared, and history
records one independent entry. Undo, redo, and Session Checkpoint V3 replay use
the committed root operation and never invoke extension UI or reevaluate the
action. Alpha.5 can restore this alpha.6 history because it already implements
that exact V3 operation contract. Wasm ABI 4, Profile Bootstrap V2, descriptor
and projection shapes, schema fingerprints, Document V2, and V3 format numbers
are unchanged.

## `0.3.0-alpha.7` closed typed toolbar form

Alpha.7 adds no semantic action, operation, replay rule, or durable codec. Rust
adds one UI-neutral descriptor triple for every compiled typed setter: format
kind, intent ID, and routed action-state ID, canonically ordered by format.
Wasm ABI 5 exposes only that process-local correlation. Action and binding
identity, form fields, labels, drafts, focus, and rendering remain absent from
Rust and the bootstrap.

The browser may bind that triple to one callback-free `inlineFormatForm` whose
fields exactly cover the target format's required properties. The closed field
vocabulary is URL-presented bounded string and Boolean-default-false. Apply is
a complete lexically ordered map replacement; Remove is the canonical remove
input. No URL scheme or navigation decision happens at input time;
`safeLinkV1` owns that policy when rendering.

The APG `role="toolbar"` retains only roving native command and launcher
buttons. The interactive nonmodal form is a sibling under the caller's toolbar
mount, focuses its first field when opened, and returns focus on Escape or
Close. Drafts are neither hydrated from current selection values nor persisted.
Apply/Remove preserve semantic selection, use the existing synchronous queue,
request the existing history boundary, and replay only the committed operation.

## Deferred beyond 0.2.0

The following are explicitly deferred:

- a public stable wire codec for extension manifests, unless separately frozen
  after the initial Rust value model proves itself;
- arbitrary block, inline, leaf, atom, embed, table, or nested editable nodes;
- property-bearing presentation beyond the exact `safeLinkV1` policy, including
  general DOM attributes, color/CSS policies, and renderer callbacks; toolbar
  fields beyond the closed required URL-string/Boolean form;
- format exclusions, groups, inclusivity rules, multiple instances, and
  arbitrary normalization;
- optional peer dependencies, capability selection, extension-version ranges,
  and multiple instances of one extension;
- extension-defined operation kinds, codecs, inverses, or replay behavior;
- arbitrary JS callbacks inside schema validation, action evaluation,
  transactions, replay, undo, or redo;
- browser-to-Rust extension planners and arbitrary operation-plan ingress;
- general document transformation migrations and downgrade migrations;
- lossless opaque unknown nodes or formats;
- semantic hot install, unload, replacement, or profile re-resolution;
- runtime loading of independently compiled Rust/Wasm semantic plugins;
- a Wasm component-model/WIT plugin ABI and third-party trust/signature policy;
- collaboration, CRDT/OT rebasing, selective undo, remote cursors, and profile
  negotiation;
- package discovery, downloading, registry policy, or permission UI;
- extension keymaps, `beforeinput` rules, menus, selects, optional or integer
  fields, partial property patches, and arbitrary custom toolbar controls;
- sandboxing browser presentation code supplied by the host;
- generic HTML fidelity, arbitrary executable portable converters, and a
  framework-neutral server-side renderer.

If a Wasm plugin ABI is later designed, it must use version negotiation,
capability-scoped handles, copied/owned data rather than shared pointers,
deterministic semantic host calls, fuel and memory budgets, explicit disposal,
panic isolation, and a trust policy. It must preserve schema proof, runtime
generation, and replay invariants.

## Explicit 0.2.0 limitations

These are product constraints, not implementation details to conceal:

- A semantic profile is fixed for the life of an engine.
- Breditor receives manifests; it does not install packages or fetch dependencies.
- One exact extension version can own a qualified extension name in a profile.
- Only property-free inline formats on base text are portable extensions.
- Headings, links, lists, images, tables, embeds, arbitrary properties, and
  custom nodes are not supported by the extension path.
- Extension code cannot add an operation variant or run during replay.
- The alpha.4 manifest path can opt in with at most one admitted built-in
  generic no-input toggle declaration for a same-manifest property-free
  format; a format declaration alone generates no toggle. It cannot define custom
  actions or inputs, target another extension's format, share a toggle identity,
  or add fallback routing.
- Native action-registry, intent-router, catalog, and engine APIs remain
  advanced bypasses outside compiled-profile correlation.
- The process-local profile generation is carried through profile-created
  engines, observations, outcomes, caches, and Wasm handles, but it has no
  scalar, JSON, durable, or cross-compilation representation.
- Unknown or missing semantic types fail closed; there is no opaque round trip.
- Moving to another durable schema fingerprint through admission or migration
  creates a new history lineage and clears undo/redo. Reconstructing a profile
  with the same schema fingerprint can restore and re-prove history under its
  newly minted process-local generation.
- No general migration or downgrade engine ships in this release.
- The stock Wasm cannot load a third-party Rust implementation dynamically.
- Portable format rendering is limited to the fixed safe declarative recipe
  vocabulary. Arbitrary renderer callbacks and components are not accepted by
  the extension path.
- Breditor does not sandbox the host application or its non-extension browser
  code.
- The reference package and any future browser presentation package execute as
  trusted application-realm modules. Callback-free manifest values deny them a
  mutation callback inside Rust, but package installation is not a sandbox or
  provenance guarantee. Applications remain responsible for supply-chain and
  same-realm trust.
- Canonical JSON, editing DOM, clipboard conversion, and HTML export are
  different contracts. `0.2.0` makes no generic HTML compatibility promise.
- Copy can serialize admitted formatting, but paste transports no source
  formatting; inserted text may still inherit target pending/context formats.
- The extension toolbar surface is an intent-based toggle button; extension
  keymaps, input rules, menus, selects, and arbitrary controls are not included.
- Collaboration and cross-client extension negotiation are not included.
- Resource limits can reject a very large manifest set, document, plan, or
  checkpoint even when the abstract content would otherwise be meaningful.

## Staged implementation decisions and remaining questions

`0.2.0-alpha.1` settles the canonical fingerprint bytes, SHA-256 hash, and
bounded public `sha256:` lowercase-hex representation. `0.2.0-alpha.2` adds the
strict public parser and owned durable binding, implements the separate V2
record graph with fixed binary Frame V2 selection, and implements the separate
prepared-result admission API. The exact fingerprint contract and
cross-implementation base vector are frozen in
[Schema fingerprint contract](SCHEMA_FINGERPRINT.md).

`0.2.0-alpha.3` settles the Rust value boundary for manifest-owned property-
free formats, the caller-owned non-reserved profile schema selector, the sealed
base-text compiler, and the configured generic toggle action.

`0.2.0-alpha.4` settles the manifest-owned five-identity toggle bundle,
same-owner target rule, profile-wide typed identity ownership, fixed
per-manifest and aggregate limits, generated no-input action/intent/state route,
and the immutable `CompiledEditorProfile` container with its fresh Rust-local
generation.

`0.2.0-alpha.5` propagates that opaque generation through profile-created
contexts, engines, observations, intent outcomes, action-state caches, and the
Wasm ABI 3 handle graph. It adds a canonical owned descriptor, strict bounded
ABI-local profile bootstrap, reusable V2 fresh/restore factories, no-input
semantic intent execution, and exact official browser/Wasm version pairing.
Legacy exact-base V1 factories remain an explicit compatibility path. The
generation is still neither durable nor scalar, and this checkpoint does not
define custom action/input/callback seams, render order, safe recipes, or
extension toolbar UI.

`0.2.0-alpha.6` settles deterministic inline renderer order through bounded
`before`/`after` edges plus a lexical tie-break and settles the fixed safe
wrapper/class vocabulary. `0.2.0-alpha.7` settles the supported no-input intent
and native toggle-button toolbar path. `0.2.0-alpha.8` freezes the reference
Highlight profile above and proves it from clean package-root-only consumers
and the Chromium/Firefox/WebKit matrix. None of those checkpoints freezes the
ABI-local profile bootstrap as a general durable extension-manifest codec.

`0.3.0-alpha.1` settles the Rust-only typed inline-format property declaration,
manifest ownership, canonical map, compiler-contract version-2 fingerprint,
Document V2 validation, bounded diagnostics, and property-string resource
accounting. It deliberately leaves the current base operation language,
pending-format V1 shape, Wasm ABI 3, and browser presentation unchanged and
fail-closed. The exact limitations and next Link checkpoint are in
[`V0_3_SCOPE.md`](V0_3_SCOPE.md).

`0.3.0-alpha.2` settles the manifest-owned typed set bundle, strict set/remove
input, paragraph-local property-preserving splice/action/history path, and the
explicit Operation/Editor State/Transaction Request/Commit/Session Checkpoint
V3 codec families around Document V2.

`0.3.0-alpha.3` settles ABI 4 Profile Bootstrap V2, descriptor and projection
property getters, strict typed action/intent JSON, explicit V3 profile factories,
browser typed validation, high-level `executeIntentJson()`, and Session V3
IndexedDB/autosave. It does not settle property-driven DOM recipes, HTML
attributes, URL/CSS policy, or typed toolbar controls.

`0.3.0-alpha.4` settles only the closed browser-owned `safeLinkV1` mapping, its
exact DOM/composition/copy-HTML shapes, and an application-owned reference Link
form. It does not widen Rust, Wasm ABI 4, durable formats, plain-text paste, or
the native-button toolbar, and it does not establish a general attribute or CSS
protocol.

`0.3.0-alpha.5` makes the existing direct-root paragraph operations preserve
typed format instances, and alpha.6 uses that exact operation language for
cross-paragraph complete-map set/remove. `0.3.0-alpha.7` advances to ABI 5 and
settles the canonical set-surface correlation plus one browser-only closed
URL-string/Boolean form. Bootstrap V2, fingerprint bytes, Document V2, and V3
durable bytes remain unchanged.

The following choice remains for a later release and may be settled without
weakening the decisions above:

1. **Future manifest wire shape.** A public durable JSON or binary codec is not required
   at `0.1.1`. If later exposed, freeze exact field names only after malformed,
   unknown, duplicate, missing, and over-limit fixtures pass.

## Checkpoint sequence

This sequence is shared with [`V0_2_SCOPE.md`](V0_2_SCOPE.md). Every checkpoint
is formatted, linted, tested, documented, committed, and tagged before the next.
`0.1.1` is additive and changes no stable public wire or browser union. Work
that changes those contracts uses `0.2.0` prereleases. A checkpoint can split
if review reveals another correctness boundary, but work cannot be claimed
earlier or skip a gate.

### 0.1.1 — immutable extension set

- Add qualified extension identity, exact extension version, bounded Rust manifest
  values, exact dependencies, conflicts, extension-name ownership checks, and canonical
  topological resolution.
- Keep this composition-only: no public manifest wire codec, schema, or editor
  behavior changes yet.
- Complete.

### 0.2.0-alpha.1 — parity-first schema compiler and proof

- Add the declarative compiled-schema input, collision-free private runtime
  proof identity, reserved built-in identities, collision-resistant canonical
  `SchemaFingerprint` definition, and complete `breditor/base@1` equivalence
  tests.
- Reject mixed schema proofs across documents, contexts, transactions, history,
  selection, and incremental publication. Action/state/intent registry
  correlation arrives with the compiled-profile generation in `alpha.4` and
  its Wasm transport in `alpha.5`; `alpha.1` does not claim a generation that
  does not yet exist.
- Complete.

### 0.2.0-alpha.2 — fingerprint-bearing durable records

- Add new schema-fingerprint-bearing generations for document, operation,
  transaction, editor-state, commit, checkpoint, local-log frame/tail, and
  storage root/generation families.
- Keep every legacy V1 codec exact-base-only and make schema-fingerprint
  admission and persistence mismatch non-destructive.
- Complete.

### 0.2.0-alpha.3 — sealed property-free format extension

- Add `InlineFormatSpecV1` for the base text seam plus generic format
  operations/actions over the existing primitive replay language.
- Cover pending typing format, inverse, relocation, undo/redo, and checkpoint
  replay.
- Keep properties, nodes, normalization, and custom codecs rejected.
- Complete.

### 0.2.0-alpha.4 — frozen actions and semantic intents

- Compile bounded manifest-owned format/action/intent/binding/action-state
  bundles into the existing generic toggle action, tracked no-input intents,
  priority-0 blocking bindings, and routed observable state.
- Co-own the extension set, compiled schema, generated registry, router, and
  catalog in an immutable `CompiledEditorProfile` with a fresh opaque Rust-local
  generation. Keep that generation out of engine/Wasm observations until
  alpha.5 and keep semantic-only declarations out of the schema fingerprint.
- Keep generic implementations in separately named source files rather than a
  central extension-identity switch; accept no JavaScript planner ingress.
- Reject over 255 toggles per manifest or profile, non-owned targets, duplicate
  typed identities, multiple toggles per format, and all extension-owned
  `breditor/*` identities. Keep custom actions/inputs/callbacks,
  cross-extension/shared/fallback routes, rendering, and toolbar UI absent.
- Complete.

### 0.2.0-alpha.5 — Wasm ABI 3

- Add compiled-profile bootstrap for fresh and restored sessions, typed intent
  execution, profile-correlated projection/action-state observations, and an
  owned `CompiledProfileDescriptor` containing admitted format, intent/input,
  and state/value contracts.
- Regenerate declarations, enforce exact official package pairing, run the real
  Wasm suite, and verify owned results are disposed on every path.
- Complete.

### 0.2.0-alpha.6 — complete profile-aware base-text browser support

- Add profile-aware base-text inline-format projection/updates, bounded
  declarative render recipes, deterministic nesting, DOM-drift checks, point
  mapping, and composition reconciliation for the admitted format subset.
- Cover safe copy, deterministic removal of source formatting on paste,
  plain-text projection, canonical export correlation, and
  schema-fingerprint- or caller-slot-scoped persistence mismatch that never
  overwrites retained evidence.
- Complete.

### 0.2.0-alpha.7 — supported browser intent and toolbar path

- Add browser `executeIntent`, intent-based toolbar manifest consumption, and
  an intent-based toggle-button surface with startup validation of intent/state
  contracts.
- Keep direct concrete action dispatch documented as an advanced policy bypass.
- Route built-in strong formatting from native input, keyboard, and the default
  toolbar through `breditor/format-strong`; correlate the fixed action-state
  catalog and value contracts with the compiled descriptor before publication.
- Make public imperative calls immediate-only and provenance-redacted while the
  advanced adapter retains binding/action/fallthrough detail.
- Complete.

### 0.2.0-alpha.8 — consumer proof

- Ship the reference extension package and clean consumer fixtures.
- Complete missing/extra browser contribution tests, the cross-browser matrix,
  compatibility/limitation documentation, and size gates.
- Complete.

### 0.2.0-rc.1 — release audit

- Run the complete repository, mismatch, restore, replay, ordering, resource,
  browser, packaging, size, accessibility, and Wasm ownership gates.
- Fix defects without widening the feature set.
- Complete.

### 0.2.0 — shippable narrow extension foundation

- Add no speculative feature at the version-bump checkpoint.
- Release only after every exit gate in `V0_2_SCOPE.md` and this document passes.
- Produce release notes, a clean consumer proof, and the final limitations
  review.
- Tag the exact tested commit; pushing and publishing remain separate explicit
  actions.
- Complete.

## Architecture-specific acceptance tests

In addition to the complete repository gates, `0.2.0` requires proof that:

- every input permutation yields identical resolved order, compiled bytes,
  fingerprint, or deterministic error;
- changing only extension identity or version, action, state, intent,
  presentation declarations, or host resource policy leaves the schema
  fingerprint unchanged when the admitted schema projection, compiler contract,
  and compiled content-language constraints are identical, while a new engine
  still mints a fresh process-local profile generation;
- duplicate ownership, missing/wrong dependencies, conflicts, cycles, reserved
  identity impersonation, and every limit-plus-one case fail before engine
  construction;
- two different compiled schema definitions cannot reuse one validation proof
  merely by claiming the same `SchemaId`;
- every new durable codec that admits an extension profile requires the exact
  schema fingerprint, while every legacy V1 codec rejects non-base profiles;
- the compiled built-in base declaration makes exactly the same valid/invalid
  decisions and canonical bytes as the released `breditor/base@1` path;
- a reference property-free format survives editing, selection, pending typing
  state, inverse application, undo, redo, checkpoint encode/restore, replay,
  projection, canonical export, safe copy serialization, and reload; paste
  transports no source formatting while retaining the existing target-format
  inheritance rule;
- replay and undo/redo never execute extension, toolbar, renderer, DOM, clock,
  network, randomness, or package-manager code;
- schema-fingerprint admission validates both proofs, preserves the AST exactly,
  resets history explicitly, and leaves source bytes and retained storage
  untouched on every failure;
- fresh creation, restore, autosave, and reload retain one durable schema
  fingerprint. Within each engine, its compiled-profile descriptor, projection,
  action state, and intent outcomes agree on that engine's current process-local
  generation; reload mints a new generation instead of persisting or reusing the
  prior engine's generation;
- the callback-free render recipe set has exact profile coverage and
  deterministic nesting, and missing, duplicate, or extra recipes fail browser
  construction;
- toolbar coverage is optional, but each supplied control is unique and exactly
  matches an admitted intent/input and state/value contract or browser
  construction fails; contributions contain no mutation callbacks, and every
  activation returns through live Rust intent evaluation;
- a clean external consumer can install, type-check, bundle, and run the exact
  browser/Wasm/reference tarball set using only their supported package-root
  entry points and one shared browser module instance; and
- documentation never describes another editor's contract as Breditor
  compatibility.
