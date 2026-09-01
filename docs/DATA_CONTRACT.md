# Rust data contract

Status: implemented vertical proof; not yet a permanent public wire
compatibility promise
Document format: `breditor/document`, version `1`
Base schema: `breditor/base`, version `1`

## Boundary

The implemented Rust slice owns:

- the canonical immutable AST and validated `Document`;
- snapshot-local points, document-aware point ordering, and directional range
  selections;
- `EditorContext`, `EditorState`, lineage-local snapshots, and pending typing
  formats;
- one paragraph-local operation, `TextSplice`, with a closed exact inverse;
- atomic transactions, explicit selection/pending-format updates, typed
  metadata, relocation, and operation-relative change sets; and
- immutable commits with helpers that construct undo and redo transactions.

The following remain deliberately unimplemented:

- structural operations such as paragraph split/join, block insertion, list
  changes, and node movement;
- an action/command/plugin registry and toolbar-facing capability queries;
- an actual undo/redo stack, grouping, coalescing, and history retention policy;
- persistent operation and editor-state codecs, durable logs, and reload replay;
- Wasm bindings, TypeScript adapters, browser event handling, and the DOM bridge;
- collaboration, rebasing, CRDT/OT behavior, and remote presence; and
- cached subtree summaries and incremental result validation.

ProseMirror, Lexical, Tiptap, and CKEditor are design references only. This is
an original contract and does not adopt their node, transaction, plugin, or
collaboration protocols.

Runtime values and serialization records are deliberately different types:

```text
untrusted JSON
    -> strict versioned record
    -> format and schema identity checks
    -> complete limit, canonicality, and schema validation
    -> immutable runtime Document
    -> validated EditorState at (LineageId, Revision)

EditorState + exact-base Transaction
    -> apply operations in order to private immutable intermediates
    -> relocate or explicitly set editor state
    -> publish one Commit or publish nothing
```

Deserializing JSON can never construct a runtime `Document` directly. Records
are converted through checked, record-independent local node constructors, then
the compiled schema validates the complete root. Operations use checked local
constructors and the same compiled-schema gate; they never serialize through a
JSON record to prove validity. Validation either produces one complete value or
no value.

## Runtime representation

- `Document` contains a `SchemaId` and one element root.
- `NodeRef` is an immutable `Arc`-backed reference to either an element or text
  node. Cloning a reference is cheap and safe across native threads.
- Elements contain a qualified kind, optional semantic entity identity,
  deterministic properties, and immutable children.
- Text contains a non-empty Unicode scalar string and a canonical `FormatSet`.
- Formats contain a qualified kind and deterministic properties.
- Runtime fields remain private. Pointer identity is an implementation detail;
  equality is content equality.

Element, format, schema, and top-level property names use the original qualified
name grammar `namespace/local-name`. Both parts are ASCII lowercase, begin with a
letter, may continue with letters, digits, `.`, `_`, or `-`, and the complete
name is at most 128 bytes. Examples are `breditor/document` and
`breditor/strong`.

An entity ID is semantic persisted identity, not an ephemeral runtime key. It is
optional globally, may be forbidden, optional, or required by a schema item, and
must be unique within one document. The reducer will never generate one from
time or randomness; callers must supply recorded IDs. The base schema currently
forbids entity IDs because none of its two element kinds need them.

## Canonical tree laws

The minimal valid base-schema document is one empty paragraph:

```text
breditor/document
└── breditor/paragraph
```

An empty paragraph has zero children. A browser `<br>` placeholder is projection
state and never enters the document.

The enforced laws are:

- the root is `breditor/document`;
- the root contains one or more `breditor/paragraph` elements;
- a paragraph contains zero or more text leaves;
- text is non-empty and never owns children;
- adjacent text siblings with equal format sets are rejected as non-canonical;
- format order is ascending by qualified kind, with at most one of each kind;
- the base schema permits only `breditor/strong` and no properties;
- property and nested-object keys are sorted and unique;
- Unicode is preserved exactly; no implicit normalization is performed; and
- configured byte, depth, node, child, text, format, and property limits are
  checked before a runtime document is published.

The strict decoder rejects non-canonical data. A separately named recovery
importer may repair foreign or damaged data later, but it must return diagnostics
for every rewrite.

## Property values

The record shape reserves deterministic JSON properties now, although the base
schema accepts none. Values support null, booleans, strings, arrays, objects, and
integers in JavaScript's exactly representable range
`[-9_007_199_254_740_991, 9_007_199_254_740_991]`. Fractional JSON numbers and
larger integers are rejected; a schema can represent exact decimal or large
numeric values as validated strings. Nested object keys use the ASCII identifier
grammar `[A-Za-z_][A-Za-z0-9._-]*` and are at most 128 bytes. Restricting them to
ASCII makes Rust byte ordering and JavaScript UTF-16 ordering identical. These
rules remove numeric and key-order ambiguity from future canonical hashing and
keep Rust, Wasm, and TypeScript lossless.

## Point and selection contract

A path is a root-relative array of unsigned 32-bit child indexes. `[]` addresses
the document root. Paths are snapshot-local and never silently survive an edit.

```text
Text point     = text path + UTF-16 offset + before/after affinity
Children point = parent path + child boundary index + before/after affinity
```

- A text point must target text. Its offset may equal the text's UTF-16 length
  but cannot exceed it or split a non-BMP Unicode scalar's surrogate pair.
- A children point must target an element. Its boundary may equal the number of
  children but cannot exceed it.
- Both affinities remain distinct at every boundary.
- `Point` deliberately has no context-free total ordering. `compare_points`
  supplies document-relative spatial ordering for mixed text/child points.
- Affinity is preserved but does not make two representations of the same
  spatial boundary non-collapsed.
- A `RangeSelection` preserves directional anchor and focus; it never sorts its
  stored endpoints. Resolution reports collapsed, forward, or backward order.
- Point structural validity and selection validity are separate. The base range
  selection accepts text points and child boundaries inside a paragraph; it
  rejects root boundaries and endpoints outside a text container.
- `Option<Selection>` represents editor focus/selection absence. Only range
  selection exists today; node, grid, and multi-range selections are future.
- Grapheme, word, and line movement are future action semantics, not stored
  coordinate units.

## Editor state and snapshots

`EditorContext` owns one compiled schema, document limits, and a configurable
maximum operation count per atomic transaction. The default operation limit is
1,024. An `EditorState` is an immutable tuple of that exact context, a
`SnapshotId`, a document, an optional selection, and optional pending typing
formats.

`SnapshotId` is `(LineageId, Revision)`. A lineage ID is a portable opaque string
supplied by the caller; the deterministic core never derives it from time,
randomness, or pointer identity. Callers must allocate a unique lineage ID for
each logically independent history. Reusing one ID for different histories is a
caller contract violation that no process-local core can globally detect.

`Revision` is a checked monotonic `u64` within a lineage. Initial state is
revision zero, a committed state transition consumes one successor revision,
and an unchanged transaction consumes none. A future Wasm/wire representation
will encode the full `u64` as a decimal string rather than a JavaScript number;
that encoding is planned, not implemented.

Pending formats are an explicit typing override. `None` means derive formatting
from context, while `Some(empty)` explicitly means unformatted. An override is
valid only with a spatially collapsed range and formats permitted by the active
schema.

## Text operation contract

`TextSplice` replaces one half-open UTF-16 range inside one paragraph. Its range
is paragraph-local rather than tied to unstable text-leaf paths, so one splice
can cross any number of formatted runs and can empty or populate a paragraph.

The operation contains:

- the paragraph path and half-open `[start, end)` UTF-16 range;
- `expected_removed`, the exact canonical formatted fragment expected at that
  range; and
- `replacement`, the canonical formatted fragment to insert.

A `TextFragment` is empty or a sequence of non-empty formatted runs. Adjacent
runs with equal format sets are forbidden; splice seams are merged back to that
canonical form. Both range boundaries must be Unicode-scalar-safe. The expected
fragment must have exactly the range length and must equal the source content at
application time, otherwise the operation fails as stale or mis-authored.

On success, the inverse is another `TextSplice`: its expected fragment is the
forward replacement, its replacement is the actual removed fragment, and its
range covers the inserted result. This is a content inverse, not a hidden
closure over mutable state.

Operation construction and application enforce the active schema and resource
budgets: fragment run count, aggregate fragment bytes, per-run text bytes,
per-run formats, permitted format kinds/properties, checked UTF-16 coordinates,
the transaction operation cap, and all final document limits.

## Transactions, relocation, and commits

A `Transaction` is authored against one exact base `EditorState`, not merely a
document version number. Application verifies the schema, complete context,
snapshot identity, and base-state equality. Operations run in order, each using
the previous operation's result. If an operation, relocation choice, or result
state proof fails, the call returns an error and publishes no partial commit,
change set, inverse list, or revision. A wholly unchanged request returns an
explicit unchanged outcome.

Selection and pending formats are first-class state updates. A transaction may
relocate the existing selection or set a result selection explicitly, and may
preserve or explicitly replace pending formats. A point strictly inside deleted
content relocates to an explicit `Deleted { before, after }` result. Selection
relocation defaults to rejection and requires an endpoint-specific before/after
policy before it will discard that ambiguity. Direction and affinity are
preserved.

`ChangeSet` entries are deliberately operation-relative. Each entry names its
forward operation index; its old coordinates belong to that operation's
immediate input document and its new coordinates belong to that operation's
immediate output document. Consumers must not interpret every entry as being in
the outer commit's before/after coordinate space.

A successful `Commit` retains exact before/after states, forward operations,
inverse operations already in undo order, composed relocation, changes, and
typed action/history intent. `undo_transaction` and `redo_transaction` build new
atomic requests and restore the corresponding exact selection and pending
formats while revisions continue monotonically. They are transaction helpers,
not an implemented history stack; grouping metadata is only a contract for the
future history owner.

## Current performance limitations

The correctness-first implementation deliberately accepts costs that must be
removed before large-document production use:

- every changed splice rebuilds its ancestor spine and performs full-tree schema
  and resource validation of the resulting document;
- a multi-operation transaction retains structurally shared intermediate
  documents in its composed relocation map; and
- path copying clones the complete child vector of every ancestor on the edited
  spine, so editing beneath a very wide parent is proportional to that parent's
  width.

Off-spine nodes remain `Arc`-shared, so these costs do not imply cloning every
node's payload. The next optimization must preserve observable operation,
inverse, relocation, and validation laws; cached summaries cannot become a
second, weaker validity contract.

## JSON shape

```json
{
  "format": "breditor/document",
  "formatVersion": 1,
  "schema": { "name": "breditor/base", "version": 1 },
  "root": {
    "kind": "element",
    "type": "breditor/document",
    "entityId": null,
    "properties": {},
    "children": [
      {
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": []
      }
    ]
  }
}
```

All fields are explicit, including nullable `entityId`. Unknown fields, unknown
record versions, duplicate JSON keys, unsorted properties, unsupported schema
names or versions, unknown node or format kinds, and every canonicality
violation fail closed with typed errors.

Public codec errors contain Breditor-owned JSON failure details rather than
exposing `serde_json::Error`. Validation issues expose a stable code, node path,
typed subject (child, format, property/value path, entity identity, or limit),
and structured detail such as the exceeded size or duplicate-ID origin. Human
messages are never a control-flow contract.

Wire-shape changes increment `formatVersion`. Schema-semantic changes increment
`schema.version`. A future schema fingerprint will additionally pin compiled
definitions for replay. Canonical document hashing is deliberately deferred
until its cross-language byte specification is written and tested. Only the
document codec exists today; operations, snapshots, transactions, and commits
have no persistent wire format yet.

## Next gate

First, finish the relocation and property-law matrix: Unicode boundaries,
canonical seam merging, forward/inverse restoration, mixed point encodings,
deleted endpoint policies, multi-operation composition, stale guards, limits,
and atomic failure. The slice must continue to pass formatting, Clippy, native
tests, rustdoc warnings-as-errors, and a `wasm32-unknown-unknown` build.

Then add cached subtree summaries and incremental validation/proof for the edited
spine. Only after that gate should the core grow structural operations and the
action/plugin layer that maps keyboard input, paste, and expandable toolbar
commands into transactions.
