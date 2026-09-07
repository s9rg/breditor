# Breditor extension architecture for 0.2.0

Status: decision freeze; the `0.1.1`, `0.2.0-alpha.1`, and
`0.2.0-alpha.2` foundations are implemented and later stages remain planned

This document defines Breditor's extension architecture and the deliberately
narrow part of it that `0.2.0` will ship. It complements
[`V0_2_SCOPE.md`](V0_2_SCOPE.md); if a broad architectural seam described here
is not in that scope, it is not a `0.2.0` feature.

The words **must**, **must not**, and **requires** below describe frozen design
decisions. The sections titled **Deferred**, **Open questions**, and **Explicit
limitations** distinguish work that is not promised by `0.2.0`.

## Scope in one paragraph

`0.2.0` will compile a complete, immutable set of declarative extension
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

The result is a private-constructor `CompiledEditorProfile`. It owns the
compiled schema, extension and format registries, action declarations, intent
routes, resource limits, resolved order, durable schema identity, and
process-local generation. All of those registries come from one compilation;
callers cannot mix and match them.

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
- compiled semantic admission constraints, including any semantic minimum or
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
compiler contract, and semantic admission constraints are unchanged. Host
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

Separately, each engine owns an opaque `CompiledProfileGeneration`. It
correlates the compiled schema proof, action registry, action-state catalog, and
intent router installed in that process. Action observations, intent requests,
transactions, history, projection observations, and results carry or check
that generation. It is not persisted, stable across restart, or presented as a
digest of native Rust handlers.

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
decoder silently installs an extension, drops a format, accepts non-empty
properties, or rewrites retained bytes.

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
those primitives against an exact observation. Rust checks the runtime
generation, schema proof, snapshot/revision guard, action input contract,
declared effects, every primitive, selection and pending-format result,
resource limits, and complete final schema validity before publishing anything.

There is no browser-to-Rust extension action planner callback and no arbitrary
operation-plan ingress in `0.2.0`. Portable browser code selects a registered
semantic intent; it does not manufacture the operations for that intent.

Replay stores and applies the committed primitive plan. It does not rerun the
extension action, semantic intent selection, toolbar event, renderer, or
browser code. Replay must not access JavaScript, DOM, network, clock,
randomness, locale, filesystem package state, or extension installation order.

Undo and redo store exact forward/inverse recipes under the same durable schema
fingerprint and use the normal guarded path. In-memory entries also require the
current runtime generation; restored entries are reconstructed and re-proved
under the new engine generation. History cannot cross schema-fingerprint
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

Action, intent, route, and contribution ownership collisions fail. Intent
fallback order is part of the compiled semantic profile; toolbar placement is
presentation-only. A toolbar activation always re-enters the guarded intent
FIFO against live state. A previously enabled button is not commit authority.

Labels, localization, icons, placement hints, shortcut display, CSS, and
framework components live in the browser package. They are excluded from the
durable schema fingerprint and Rust process-local profile generation. They
cannot change input contracts, effect declarations, selection policy, history
intent, or persisted operation meaning.

The browser's existing direct action dispatch remains an explicitly advanced
policy bypass. The supported expandable toolbar path uses semantic intents so a
host can choose routes while compiling a new profile without coupling UI layout
to action implementation.

### 9. Editing projection, conversion, and persistence are different seams

The editing DOM is a disposable projection of Rust-owned AST and selection.
For the `0.2.0` subset, browser render contributions are bounded declarative
recipes over a fixed safe element and attribute vocabulary. They are not DOM
callbacks, framework components, arbitrary element constructors, or HTML
strings.

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
the admitted formatting for external consumers, but paste transports no source
formatting into the existing bounded text insertion path. Inserted text still
inherits the target caret's pending or contextual formats under the existing
action contract. There is no private rich-fragment codec or rich copy-to-paste
round trip in `0.2.0`.
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

The supported `0.2.0` ABI path will be Wasm ABI 3.

This is a later release checkpoint, not an alpha.2 capability. The current
alpha.2 browser and Wasm packages deliberately retain ABI 2 and accept or emit
only the existing Document V1 and Session Checkpoint V1 browser formats. None of
the Rust V2 codec, durable-profile selection, or schema-admission API crosses
ABI 2.

That later boundary will:

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
different executable Breditor core. Every engine created from it receives a
fresh process-local `CompiledProfileGeneration`; its durable
`SchemaFingerprint` changes only when the canonical compiled schema meaning,
schema-compiler contract, or compiled semantic admission constraints change.
A future sandboxed
component-plugin ABI is a separate design and does not hide behind the portable
manifest value model.

## Deferred beyond 0.2.0

The following are explicitly deferred:

- a public stable wire codec for extension manifests, unless separately frozen
  after the initial Rust value model proves itself;
- arbitrary block, inline, leaf, atom, embed, table, or nested editable nodes;
- property-bearing inline formats such as links and colors;
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
- extension keymaps, `beforeinput` rules, menus, selects, and custom toolbar
  controls beyond the supported intent-based toggle button;
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

The following choices remain for later checkpoints and may be settled without
weakening the decisions above:

1. **Future manifest wire shape.** A public durable JSON or binary codec is not required
   at `0.1.1`. If later exposed, freeze exact field names only after malformed,
   unknown, duplicate, missing, and over-limit fixtures pass.
2. **Inline renderer order syntax.** Choose the smallest explicit
   `before`/`after` declaration and stable fallback needed for deterministic DOM
   nesting; it remains separate from semantic format-set order.
3. **Generic action declaration.** Finalize the closed fields required to
   instantiate toggle-format action state, effects, selection policy, and
   history intent without an executable extension callback.
4. **Safe render vocabulary.** Finalize the allowed element tokens, attribute
   tokens, nesting edges, and CSS-class policy. Recipes remain bounded data and
   never become executable callbacks.

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

### 0.2.0-alpha.4 — frozen actions and semantic intents

- Compile extension-owned generic action registrations, state definitions,
  input/effect contracts, and intent routes with ownership and aggregate limits.
- Keep generic implementations in separately named source files rather than a
  central extension-identity switch; accept no JavaScript planner ingress.

### 0.2.0-alpha.5 — Wasm ABI 3

- Add compiled-profile bootstrap for fresh and restored sessions, typed intent
  execution, profile-correlated projection/action-state observations, and an
  owned `CompiledProfileDescriptor` containing admitted format, intent/input,
  and state/value contracts.
- Regenerate declarations, enforce exact official package pairing, run the real
  Wasm suite, and verify owned results are disposed on every path.

### 0.2.0-alpha.6 — complete profile-aware base-text browser support

- Add profile-aware base-text inline-format projection/updates, bounded
  declarative render recipes, deterministic nesting, DOM-drift checks, point
  mapping, and composition reconciliation for the admitted format subset.
- Cover safe copy, deterministic removal of source formatting on paste,
  plain-text projection, canonical export correlation, and
  schema-fingerprint- or caller-slot-scoped persistence mismatch that never
  overwrites retained evidence.

### 0.2.0-alpha.7 — supported browser intent and toolbar path

- Add browser `executeIntent`, intent-based toolbar manifest consumption, and
  an intent-based toggle-button surface with startup validation of intent/state
  contracts.
- Keep direct concrete action dispatch documented as an advanced policy bypass.

### 0.2.0-alpha.8 — consumer proof

- Ship the reference extension package and clean consumer fixtures.
- Complete missing/extra browser contribution tests, the cross-browser matrix,
  compatibility/limitation documentation, and size gates.

### 0.2.0-rc.1 — release audit

- Run the complete repository, mismatch, restore, replay, ordering, resource,
  browser, packaging, size, accessibility, and Wasm ownership gates.
- Fix defects without widening the feature set.

### 0.2.0 — shippable narrow extension foundation

- Add no speculative feature at the version-bump checkpoint.
- Release only after every exit gate in `V0_2_SCOPE.md` and this document passes.
- Produce release notes, a clean consumer proof, and the final limitations
  review.
- Tag the exact tested commit; pushing and publishing remain separate explicit
  actions.

## Architecture-specific acceptance tests

In addition to the complete repository gates, `0.2.0` requires proof that:

- every input permutation yields identical resolved order, compiled bytes,
  fingerprint, or deterministic error;
- changing only extension identity or version, action, state, intent,
  presentation declarations, or host resource policy leaves the schema
  fingerprint unchanged when the admitted schema projection, compiler contract,
  and compiled semantic admission constraints are identical, while a new engine
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
- a clean external consumer can install, type-check, bundle, and run the
  reference extension using only public package entry points; and
- documentation never describes another editor's contract as Breditor
  compatibility.
