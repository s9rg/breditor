# Breditor DOM projection contract

Status: implemented for the closed base schema in `0.0.51`; pre-`0.1` API

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

The initial browser adapter accepts only `breditor/base@1`:

- one `breditor/document` root;
- one or more direct-root `breditor/paragraph` elements;
- non-empty text leaves; and
- either no format or one property-free `breditor/strong` format per leaf.

It consumes and frees the Wasm handle, checks exact preorder/tree shape,
resource limits, Unicode scalar validity, canonical adjacent-run structure,
and snapshot syntax, and produces a deeply frozen browser projection. It has
no import-time dependency on a generated Wasm module.

## Safe DOM vocabulary

The framework-neutral renderer creates elements only through
`createElementNS` with the fixed HTML namespace, creates text through
`createTextNode`, and installs them through child replacement. It never calls
`innerHTML`, derives a tag name from AST data, or writes paths into attributes.
The mapping is fixed:

- the semantic document root maps to the application-supplied host;
- a paragraph maps to a property-free `<p>`;
- an unformatted text leaf maps to a DOM `Text` node;
- a strong text leaf maps to a DOM `Text` node inside a property-free
  `<strong>`; and
- an empty paragraph renders a projection-only `<br>` placeholder.

Only the host, paragraph elements, and text nodes are exact AST-backed DOM
nodes. `<strong>` wrappers and `<br>` placeholders deliberately have no exact
AST path. A later selection mapper may interpret their DOM boundaries under a
separate checked policy; it must not relabel them as AST nodes.

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

## Checkpoint admission

The browser-facing Wasm engine is backed by `CheckpointedEditorEngine`. Every
effective action, selection update, undo, redo, history-group close, and history
clear runs on a private same-identity candidate. The candidate's complete
canonical Session Checkpoint V1 is encoded before the owner and result event are
published. A representation failure discards the candidate, returns a redacted
structured error, and preserves the exact prior state, history identity,
checkpoint bytes, and observation validity.

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

## Known limits

- The renderer supports only the closed base schema. Arbitrary blocks, nested
  structures, properties, entity IDs, custom formats, and extension renderers
  are not accepted.
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
  arrived in `0.0.55`; see [`CLIPBOARD.md`](CLIPBOARD.md). Toolbar delivery,
  persistence I/O, and framework integration remain separate checkpoints.

The package-level API and development commands are documented in
`packages/breditor-browser/README.md`.
