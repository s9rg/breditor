# Rust data contract

Status: implemented vertical proof; not yet a permanent public wire
compatibility promise
Document format: `breditor/document`, version `1`
Base schema: `breditor/base`, version `1`

## Boundary

The implemented Rust slice owns:

- the canonical immutable AST and validated `Document`;
- exact proof-derived document measurements cached on each `Document`;
- snapshot-local points, document-aware point ordering, and directional range
  selections;
- `EditorContext`, `EditorState`, lineage-local snapshots, and pending typing
  formats;
- paragraph-local `TextSplice` and direct-root `ParagraphSplit`/`ParagraphJoin`
  operations with closed exact content inverses;
- atomic transactions, explicit selection/pending-format updates, typed
  metadata, relocation, and operation-relative change sets; and
- immutable commits with helpers that construct undo and redo transactions;
- an immutable typed action registry with fail-closed identity conflicts,
  snapshot-bound capability preparation, and bounded cross-language inputs; and
- semantic base actions for paragraph breaks and backward deletion.

The following remain deliberately unimplemented:

- structural operations beyond direct-root base-paragraph split/join, including
  arbitrary block insertion, list changes, metadata conflict rules, and node
  movement;
- action active/mixed/value state, presentation metadata, keymap routing,
  plugin dependencies/lifecycle, and a durable registry manifest;
- an actual undo/redo stack, grouping, coalescing, and history retention policy;
- persistent operation and editor-state codecs, durable logs, and reload replay;
- Wasm bindings, TypeScript adapters, browser event handling, and the DOM bridge;
- collaboration, rebasing, CRDT/OT behavior, and remote presence; and
- generic subtree summaries and incremental validation for structural or
  custom-schema edits.

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

ActionInvocation + immutable ActionRegistry + exact EditorState
    -> decode one versioned bounded input
    -> Disabled(stable reason) or build one explicit ActionPlan
    -> preflight one exact-base Transaction
    -> PreparedAction(transaction + cached Commit) or typed fault
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

Every successfully validated `Document` also caches one exact `DocumentSummary`:

- `node_count` counts every reachable element and text node, including the root;
- `max_node_depth` is the greatest root-relative edge depth, where the root is
  zero;
- `total_text_bytes` is the combined UTF-8 byte length of all text leaves; and
- `property_value_count` counts every top-level and recursively nested property
  value, including array and object containers.

Counts and bytes use checked `u64` arithmetic and depth uses `u32`, so the Rust
contract does not change width between native and Wasm targets. The summary has
no public constructor or mutation path. It is produced by complete validation or
the private fixed-base local proof, is not serialized, does not affect content
equality, and does not change document format version `1`. Decoding always
recomputes it through complete validation. It is derived metadata, not a
substitute for schema proof or evidence that the document satisfies a different
limit profile.

Each document privately records the exact runtime limit profile that proved it;
the JSON input-byte budget is excluded because it does not constrain a runtime
tree. In version `0.0.3`, a fixed-base `TextSplice` with a matching profile can
publish through one crate-private proof. That proof owns the path copy, validates
the actual post-seam paragraph, and updates root measurements with checked
arithmetic. A profile mismatch, unsupported schema/path, failed proof consistency
check, overflow, or possible limit violation sends the same candidate root to
complete validation. The fallback constructs no synthetic report, so existing
issue paths, ordering, and messages remain authoritative.

Version `0.0.4` deliberately publishes paragraph split/join candidates only
through complete validation. This establishes the structural operation,
inverse, relocation, summary, and diagnostic laws before introducing a second
incremental proof. Untouched root siblings remain allocation-shared.

Version `0.0.5` adds the deterministic action catalog and the first semantic
paragraph-break/backward-delete planners. Action preparation remains an
in-memory runtime contract: action inputs, plans, and prepared commits do not
yet have a durable codec, and publication still requires a future session owner.

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

## Structural paragraph operation contract

`ParagraphSplit` and `ParagraphJoin` are the first structural primitives. They
support only paragraphs that are direct children of the exact
`breditor/base@1` root. That restriction is explicit: copying or reconciling
entity identities, properties, and arbitrary block metadata has not been
specified, so other schemas fail instead of inheriting accidental behavior.

`ParagraphSplit` carries a direct-root paragraph path, one aggregate UTF-16
scalar boundary, and the complete canonical paragraph expected at that path. It
partitions the paragraph into two, allowing either half to be empty. Its inverse
is a `ParagraphJoin` guarded by the exact resulting left and right fragments.

`ParagraphJoin` carries the left paragraph path and complete left/right guards;
the right target is the immediate sibling. It concatenates both fragments and
merges an equal-format seam. Its inverse is a split at the original left length,
guarded by the exact joined fragment. Split/join therefore restore exact document
content and cached summaries even when a seam was represented by one merged text
leaf. Whole-paragraph guards also make later operations in a multi-operation
transaction fail deterministically against unexpected intermediates.

Both operations rebuild the affected paragraph content and root child vector,
retain untouched sibling `NodeRef` allocations, and submit the complete candidate
to the authoritative schema validator. Candidate limit/schema-rule
failures carry that validator's unchanged `ValidationReport`; schema identity or
unsupported-schema failures remain distinct typed errors. The transaction stays
atomic in every case.

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
policy before it will discard that ambiguity. Anchor/focus roles and affinity
are preserved, and endpoints are never sorted. Resolved spatial order or
collapsedness may still change across a structural boundary.

Structural relocation is affinity-aware. A split boundary belongs to the left
paragraph for `Before` and the right paragraph for `After`; later root-child
paths shift by one. A join moves points from both source paragraphs into the
joined text coordinate space, shifts later paths back by one, and maps the
removed root boundary to the joined seam. That join mapping is intentionally
many-to-one: content and mapped positions remain valid, but a subsequent inverse
split cannot recover whether a seam point originally came from the left
end, the root boundary, or the right start. Affinity chooses its split side.
Actions such as Enter must explicitly set their intended caret instead of using
relocation as hidden UI policy. If relocation expands a previously collapsed
selection while pending typing formats are preserved, final-state validation
rejects the transaction; an action must explicitly choose both intended
selection and pending-format outcomes.

`ChangeSet` entries are deliberately heterogeneous and operation-relative.
`Change::Text` carries text and conservative text-child ranges;
`Change::Children` carries replaced/inserted child ranges in one parent. Each
entry names its forward operation index; its old coordinates belong to that
operation's immediate input document and its new coordinates belong to that
operation's immediate output document. The index addresses
`Commit::forward_operations`; request operations that produced no change are
absent from both lists. Consumers must not interpret every entry as being in the
outer commit's before/after coordinate space.

A successful `Commit` retains exact before/after states, forward operations,
inverse operations already in undo order, composed relocation, changes, and
typed action/history intent. `undo_transaction` and `redo_transaction` build new
atomic requests and restore the corresponding exact selection and pending
formats while revisions continue monotonically. They are transaction helpers,
not an implemented history stack; grouping metadata is only a contract for the
future history owner.

## Actions, capabilities, and extension boundary

An action is a pure planner over one immutable `EditorState`; it is not a DOM
event callback and cannot publish state directly. `ActionId` wraps a validated
qualified name. `ActionRegistry` is constructed once from typed registrations,
stores entries in lexical ID order, and rejects the complete build when two
registrations claim the same ID. Registration order, load timing, and a hidden
priority do not select a winner. A host that wants fallback behavior must name
and implement that routing explicitly outside the registry.

The registry remains outside `EditorContext` and `EditorState`. Rust trait
objects are runtime extension policy and are neither content equality nor replay
data. An action compiled into Rust or Wasm declares a concrete decoded input
type and returns either a stable `DisabledReason` or a complete `ActionPlan`.
The plan explicitly carries operations, endpoint-deletion policy, result
selection policy, pending-format policy, and history intent. Handlers are
contractually deterministic, synchronous, side-effect free, `Send`, and `Sync`;
the type system cannot prove purity, so untrusted native plugins require a
separate isolation boundary.

Typed action inputs carry a namespaced contract plus a nonzero independent
version. Their `ActionValue` payload is a canonical immutable JSON-shaped tree:
null, Boolean, JavaScript-safe integer, string, array, or lexically ordered
object. Construction rejects duplicate/invalid object keys and fixes these
budgets before a future Wasm codec exists:

- maximum container depth: 16;
- maximum values in the complete tree: 1,024;
- maximum direct array/object entries: 256;
- maximum aggregate UTF-8 string and object-key bytes: 65,536; and
- maximum object-key bytes: 128.

Object keys use the same explicit ASCII grammar on every target: the first byte
is a letter or `_`, and later bytes are ASCII alphanumeric, `.`, `_`, or `-`.
They are ordered by those bytes. Integer-like and non-ASCII keys are therefore
not accepted, and a TypeScript adapter must preserve ordered entries rather
than substituting JavaScript object-enumeration semantics.

`ActionRegistry::prepare` is the only capability path. It decodes the input and
evaluates the handler exactly once. A disabled result preserves its stable code
and optional bounded detail. An enabled plan is stamped with the invoked action
ID, bound to the complete base state, and passed through the authoritative
transaction reducer immediately. A failed transaction or enabled no-op is an
invalid-plan error, never an enabled capability. A successful preparation owns
the exact transaction and its cached `Commit`; consuming it verifies both the
snapshot and complete state equality, then returns that cached commit without
calling either handler or reducer again. A toolbar, keymap, command palette, or
API adapter therefore invokes the same ID and must not maintain a second
enablement implementation.

This check is not shared-state publication. Two preparations made from the same
base can each produce a valid branch with the same successor revision if a host
passes that old state to both. A future editor-session owner or host queue must
serialize publication against its actual current state and discard/reprepare a
stale queued action. `Send` and `Sync` make values thread-safe; they do not make
parallel editor histories linear.

The two base actions take no input:

- `breditor/insert-paragraph-break` replaces an extended same-paragraph range
  with nothing and splits at its spatial start, or performs one split for a
  collapsed range. The planner chooses split/delete or delete/split order so
  each validated intermediate fits the active limits; if neither route can
  represent an otherwise valid final tree it returns a stable intermediate-limit
  disabled reason. It explicitly places a collapsed caret at the new right
  paragraph start, preserves the exact pending-format option, and records one
  independent history event.
- `breditor/delete-backward` deletes an extended same-paragraph range, deletes
  the immediately preceding Unicode scalar for an interior collapsed caret, or
  joins the previous paragraph at paragraph start. It explicitly places the
  result caret, preserves pending formats, and requests merge group
  `breditor/delete-backward`.

Both actions support forward/backward range direction, point aliases, empty
paragraphs, formatted seams, and non-BMP scalar boundaries. Cross-paragraph
extended ranges are disabled until a native guarded block-range replacement
operation exists. Backward deletion is scalar-based, not grapheme-based:
combining marks and components of a zero-width-joiner emoji can be deleted
separately. DOM `beforeinput`, `preventDefault`, IME ownership, shortcut
precedence, labels, icons, and active/mixed/value toolbar state remain host or
future-runtime concerns. Action callbacks, IDs, and post-hooks are not replayed;
only their proven transaction operations and state outcomes cross the reducer
boundary.

## Current performance limitations

The correctness-first implementation deliberately accepts costs that must be
removed before large-document production use. Root-level node, depth, text-byte,
and property-value measurements are cached for constant-time access. A
fixed-base paragraph splice now validates the generated paragraph and applies
checked global deltas instead of rescanning a matching-profile document, but:

- any profile/schema/path the local proof cannot establish falls back to
  full-tree schema and resource validation;
- every paragraph split/join performs full-tree validation and carries complete
  paragraph guards until structural subtree proofs and durable operation records
  are specified;
- every enabled action capability query eagerly applies its generated
  transaction once to prove and cache the result; repeated toolbar queries for
  one unchanged state therefore repeat planning and validation unless the host
  retains the `PreparedAction`;
- split/join scans the complete guarded paragraphs and currently reboxes text
  `NodeRef`s inside affected paragraphs, although their immutable string/format
  payloads remain shared;
- a multi-operation transaction retains structurally shared intermediate
  documents in its composed relocation map; and
- path copying clones the complete child vector of every ancestor on the edited
  spine, so editing beneath a very wide parent is proportional to that parent's
  width.

Off-spine nodes remain `Arc`-shared, so these costs do not imply cloning every
node's payload. The next optimization must preserve observable operation,
inverse, relocation, and validation laws; cached measurements cannot become a
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

Add a synchronous Rust editor-session owner that integrates the current
`EditorState` and an actual bounded linear history. It must atomically accept
exact-base commits, implement deterministic `Record`/`Merge`/`Ignore` rules
without a clock, preserve selection and pending-format cursor boundaries, clear
redo after new content, split merge groups before the transaction operation cap,
and leave current state plus both stacks unchanged on replay failure. A
content-changing ignored commit must conservatively clear history until mapped
non-history changes exist. DOM dispatch queues, timer/IME group boundaries, and
toolbar-facing undo/redo actions remain later adapter/runtime work.
