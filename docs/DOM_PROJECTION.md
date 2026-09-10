# Breditor DOM projection contract

Status: supported inside the public `0.1.0` runtime for the closed base schema
and extended by the supported `0.2.0` compiled-profile path; direct
adapter and renderer construction remains advanced and experimental. The
unpublished `0.3.0-alpha.10` source checkpoint retains alpha.4's one closed
property-driven Link presentation and carries it through typed structural
paragraph edits described below. Alpha.8 current-property transport preserves
the exact stored string and does not alter this renderer contract. Its native
single-line form refuses CR/LF-bearing state instead of normalizing it; only
`safeLinkV1` parses or normalizes a URL and grants navigation attributes.
Alpha.9 adds an additive, property-free Showcase wrapper-order proof without a
new DOM recipe kind. Alpha.10 removes wrappers only by changing the Rust AST
through Clear Formatting and projecting the authoritative successor; it adds
no in-place DOM mutation or recipe kind.

The canonical editor document is the immutable Rust AST. Browser DOM is a
disposable rendering of one exact `SnapshotId`; it is never parsed back as an
authoritative document and DOM identity is not document identity.

This is Breditor's own projection contract. It does not adopt the document,
position, transaction, plugin, or DOM protocol of ProseMirror, Lexical,
Tiptap, or CKEditor.

## Boundary and ownership

Rust exposes a no-DOM, non-JSON semantic projection in deterministic preorder.
Each projection carries its schema name/version and full-width snapshot
lineage/revision. Its `u32` indexes and child edges are coordinates inside that
one owned projection only. They are not persisted node IDs and do not promise
identity across snapshots, reload, or a full render.

The legacy browser adapter accepts only `breditor/base@1`:

- one `breditor/document` root;
- one or more direct-root `breditor/paragraph` elements;
- non-empty text leaves; and
- either no format or one property-free `breditor/strong` format per leaf.

It consumes and frees the Wasm handle, checks exact preorder/tree shape,
resource limits, Unicode scalar validity, canonical adjacent-run structure,
and snapshot syntax, and produces a deeply frozen browser projection. It has
no import-time dependency on a generated Wasm module.

The alpha.6 profile adapter instead requires one exact live compiled-profile
generation and descriptor. Its original path admits the same
document/paragraph/text grammar with any canonical set of property-free inline
formats listed by that descriptor. The explicitly selected alpha.3 Profile
Bootstrap V2 path additionally admits descriptor-correlated typed scalar
properties and retains them in `formatDetails`. Both paths retain the schema
fingerprint and bind the projection to one checked browser presentation. They
do not add arbitrary blocks, element properties, entities, or DOM callbacks.
Alpha.4 permits property-derived attributes only through the closed
browser-owned `safeLinkV1` recipe; it is not a generic attribute mapping.

## Safe DOM vocabulary

The framework-neutral renderer creates elements only through
`createElementNS` with the fixed HTML namespace, creates text through
`createTextNode`, and installs them through child replacement. It never calls
`innerHTML`, derives a tag name from document data, or writes paths into
attributes. The structural mapping is fixed:

- the semantic document root maps to the application-supplied host;
- a paragraph maps to a property-free `<p>`;
- an unformatted text leaf maps to a DOM `Text` node;
- a formatted text leaf maps to a DOM `Text` node inside the exact canonical
  wrapper chain compiled from its presentation (legacy strong text uses one
  property-free `<strong>`); and
- an empty paragraph renders a projection-only `<br>` placeholder.

The only attribute-bearing wrapper is `<a class="breditor-link">` with
`attributes.kind: "safeLinkV1"`. Compilation requires the bound format to have
exactly two required properties: the named href property must be a string with
the exact inclusive UTF-8 bounds `1..=2048`, and the named
open-in-new-window property must be Boolean. The browser admits navigation only
for absolute, credential-free `http:` and `https:` URLs containing no control
or Unicode-whitespace scalar and fitting 2048 UTF-8 bytes both before and after
normalization, then emits the canonical URL. A safe same-window URL produces
only `href`; `true` additionally
produces `rel="noopener noreferrer"` followed by `target="_blank"`. An unsafe
but schema-valid URL produces an inert anchor with only the canonical class;
it is still semantic Link content and does not fault rendering.

The policy cannot choose an attribute name, tag, class, `rel`, target, URL
scheme, style, callback, or HTML string. Rust validates only the two declared
scalar property contracts; URL parsing and admission belong to this browser
presentation boundary. A Rust action-state uniform value therefore returns the
exact semantic string, not the canonical `href` derived by this policy.

Raw URL spelling is also part of admission: the authority must start
immediately after exactly `http://` or `https://`; excess authority slashes,
non-visible-ASCII authority scalars, authority percent escapes, backslashes,
and a raw authority `@` are rejected before the repairing URL parser runs.
Internationalized host names use their explicit `xn--` ASCII spelling.

Only the host, paragraph elements, and text nodes are exact AST-backed DOM
nodes. Presentation wrappers and `<br>` placeholders deliberately have no
exact AST path. A later selection mapper may interpret their DOM boundaries
under a separate checked policy; it must not relabel them as AST nodes.

Each successful renderer generation owns private path-to-node and node-to-path
indexes. `NodePath` remains snapshot-local. A mapping handle is invalid after
release, replacement by another render generation, or observed out-of-band DOM
mutation. `MutationObserver` delivery is asynchronous, so a handle's `current`
flag is lifecycle state rather than proof that no synchronous foreign DOM write
has just occurred. Every incremental update rechecks the retained DOM shape.

## Commit invalidation

A commit-bearing Wasm result can produce an owned projection update containing
the exact base/result snapshot pair, a complete final projection, and one
conservative impact:

- `none` when the before/after documents are equal;
- `textContainers` only when every operation is `TextSplice`, every change is a
  text change, and every affected container is a valid direct-root paragraph in
  both states;
- `rootSplice` only for exactly one operation and one valid root
  `ChildrenChange`; or
- `root` for every other document change, including multi-operation structural
  edits.

The TypeScript update boundary independently requires the same lineage and the
exact non-overflowing successor revision. It proves that every allegedly
unchanged paragraph is semantically equal before any DOM is reused. A text
update retains the affected paragraph element and replaces only its children;
a root splice retains the exact prefix and suffix and rebinds shifted paths.
Broad, malformed, untrusted, or DOM-drifted cases use the complete final
projection and rebuild safely. Invalidation is therefore an optimization, not
a correctness dependency.

Alpha.5 changes no projection or invalidation discriminant. Typed
`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` commits already expose
their complete final `formatDetails` through the existing projection. A single
structural operation may qualify for `rootSplice`; a multi-operation legacy
planner or any unproved shape remains conservative `root`. In both cases the
renderer resolves preserved Link values again and emits the same inert or
canonical safe attributes. Wrapper or DOM-node identity is never used to carry
properties across the edit.

## Checkpoint admission

The browser-facing Wasm engine is backed by `CheckpointedEditorEngine`. Every
effective action, selection update, undo, redo, history-group close, and history
clear runs on a private same-identity candidate. The candidate's complete
canonical session checkpoint is encoded in the engine's sealed mode—Session
Checkpoint V1 for the legacy exact-base factory, Session Checkpoint V2 for a
Bootstrap V1 compiled-profile factory, or Session Checkpoint V3 for a
Bootstrap V2 typed-profile factory—before the owner and result event are published. A
representation failure discards the candidate, returns a redacted structured
error, and preserves the exact prior state, history identity, checkpoint bytes,
and observation validity.

Consequently every committed browser-visible session is both directly
renderable through the semantic projection and recoverable through the cached
checkpoint. `commitJson()` remains a separate fallible diagnostic/export read:
a complete before/after commit can exceed the output budget even when the
smaller admitted session checkpoint does not.

This admission policy is correctness-first. An effective command currently
clones the structurally shared state/history candidate and encodes the complete
retained session before publication. Its time is linear in checkpoint size and
its transient memory includes both candidate ownership and encoded checkpoint
bytes. Disabled actions and exact no-ops discard their private candidate without
encoding and return observations valid against the unchanged owner. Benchmarking
and, if necessary, bounded incremental checkpoint construction are post-contract
optimizations; they may not weaken failure atomicity.

The typed profile still uses Session Checkpoint V3 after alpha.5 structural
edits. Undo/redo and reload reconstruct format properties from guarded V3
history, not from retained DOM. Alpha.4 cannot restore an alpha.5 V3 checkpoint
whose history contains a typed structural operation even though the outer
format number is unchanged; this is a prerelease downgrade limitation, not a
projection fallback.

Alpha.6 cross-paragraph set/remove uses that same projection path. The one
typed `RootTextReplace` exposes complete final Link and peer-format details;
the renderer derives every DOM attribute anew from the semantic projection.
Selection direction and affinities come from Rust's rebuilt semantic range,
not retained DOM nodes. The action introduces no projection discriminant,
persistent node identity, or property-to-attribute rule.

Alpha.9's Showcase manifest uses only existing `element` recipes plus the
existing closed `safeLinkV1` recipe. Its complete order graph resolves one
deterministic outer-to-inner chain: `<a><strong><em><mark><s><code>` for text
carrying all six formats. Each wrapper remains presentation-only; the AST text
leaf owns a canonical set of format instances, not nested formatting nodes.
Toggling, undo, redo, replay, or reload regenerates the wrapper chain from that
semantic set. The chosen HTML tags do not introduce block code, nesting
semantics, format exclusion, or rich-paste import.

## Known limits

- The renderer supports the base-text grammar, fixed property-free recipes,
  and the single `safeLinkV1` property policy. Arbitrary property-to-attribute
  or CSS mappings, blocks, structural nesting, element properties, entity IDs,
  callbacks, and application-defined DOM renderers are not accepted.
- There are no persistent per-node IDs. Exact DOM reuse is proved only for a
  particular predecessor/successor pair; equal-looking nodes after reload or a
  full rebuild have no continuity promise.
- Browser DOM APIs do not provide an atomic multi-node transaction. The
  renderer prepares first and attempts best-effort rollback if a DOM method
  unexpectedly throws, then invalidates the old handle and requires a full
  render because the host may be uncertain.
- Raw JavaScript can coerce numeric Wasm arguments before Rust entry. The
  reviewed adapter admits only exact nonnegative integer indexes; raw getters
  are read-only and cannot mutate the engine.
- Projection getters copy strings across the Wasm boundary. Projection and
  checkpoint work is synchronous and can block the main thread near configured
  limits.
- Selection mapping is the separate snapshot/generation-bound contract added in
  `0.0.52`; see [`SELECTION_MAPPING.md`](SELECTION_MAPPING.md). The guarded
  non-composition event/queue/command coordinator added in `0.0.53` is documented
  in [`BROWSER_EVENT_PIPELINE.md`](BROWSER_EVENT_PIPELINE.md). Composition
  ownership arrived in `0.0.54`, and guarded base-subset clipboard handling
  arrived in `0.0.55`; see [`CLIPBOARD.md`](CLIPBOARD.md). Guarded action-state
  and toolbar delivery arrived in `0.0.56`; see [`TOOLBAR.md`](TOOLBAR.md).
  Persistence I/O and framework integration remain separate checkpoints.

During a native composition lease, known Link wrappers are admitted only in
the inert, canonical href-only, or canonical href/rel/target shapes. Unchanged
content must still match the exact projected attributes, and the reconciler
spends at most a 1 MiB aggregate UTF-8 budget on transient dynamic attribute
values before invoking URL normalization. It reduces the leased range to text
before issuing one Rust command. Semantic
copy/cut escapes and emits the same resolved attributes. HTML paste may admit
those exact shapes, but it flattens the repaired fragment and inserts plain
text; it never reconstructs source formats or Link properties.

The package-level API and development commands are documented in
`packages/breditor-browser/README.md`.
