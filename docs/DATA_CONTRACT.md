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
- paragraph-local `TextSplice`, direct-root `ParagraphSplit`/`ParagraphJoin`,
  and guarded root-text range replacement operations with closed exact content
  inverses;
- atomic transactions, explicit selection/pending-format updates, typed
  metadata, relocation, and operation-relative change sets;
- immutable commits with helpers that construct undo and redo transactions;
- an immutable typed action registry with fail-closed identity conflicts,
  snapshot-bound capability preparation, and bounded cross-language inputs;
- a frozen semantic intent router with canonical priority/fallback behavior and
  exact-state-bound outcomes;
- one-call action observation contracts plus a frozen, bounded direct/routed/
  history action-state catalog, immutable exact-base batches, and a
  synchronous single-observation cache with bounded local deltas;
- semantic base actions for exact text insertion, paragraph breaks, backward
  deletion, and strong formatting; and
- a synchronous exact-publication `EditorSession` with bounded deterministic
  linear undo/redo history and opaque history-observation identity.

The following remain deliberately unimplemented:

- structural operations beyond direct-root base-paragraph text structure,
  including arbitrary block kinds, list changes, metadata conflict rules, and
  node movement;
- semantic formatting actions over cross-paragraph ranges, and generic mark
  attributes;
- action-state subscriptions and delivery queues, presentation metadata,
  keymaps, plugin dependencies/lifecycle, and durable registry manifests;
- persistent operation, editor-state, and history codecs, durable logs, and
  reload replay;
- Wasm bindings, TypeScript adapters, browser event handling, and the DOM bridge;
- branching/selective undo, collaboration history, rebasing, CRDT/OT behavior,
  and remote presence; and
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

IntentInvocation + immutable IntentRouter + exact EditorState
    -> validate one declared intent input contract
    -> evaluate named bindings in canonical priority order
    -> explicit disabled fallthrough or terminal block
    -> IntentRouteOutcome::Unhandled, Blocked, Prepared(cached action), or typed fault

ActionStateCache + exact EditorSession instant
    -> exact complete state/history hit: Unchanged with no evaluation
    -> changed basis: reuse disjoint readers and evaluate intersecting source groups
    -> Full baseline or complete new observation plus bounded local Delta

current IntentRouteOutcome + EditorSession
    -> reject stale/reused exact base
    -> IntentExecutionOutcome::Unhandled or Blocked without publication
    -> IntentExecutionOutcome::Committed with one published cached Commit

EditorSession + exact-base Commit or Transaction
    -> reject stale/reused state before mutation
    -> publish one authoritative current EditorState
    -> update bounded linear history under explicit intent
    -> undo/redo as one newly proven transaction and monotonic revision
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
in-memory runtime contract: action inputs, plans, and prepared commits have no
durable codec. Publication was still a host responsibility at that checkpoint.

Version `0.0.6` adds exact synchronous session publication and bounded linear
history. It does not change document format version `1`: session state, history
entries, group boundaries, and replay commands remain in-memory runtime values.

Version `0.0.7` adds an in-memory semantic intent router. It does not define a
keyboard, DOM-event, toolbar, plugin, or durable replay protocol, and it does
not change document format version `1`.

Version `0.0.8` adds immutable, bounded action-state batches. Version `0.0.9`
adds a process-local synchronous cache and local deltas over those batches.
Version `0.0.10` adds the first tracked formatting control and guarded
same-paragraph strong-format mutation. Version `0.0.11` adds bounded semantic
text insertion, including pending-format consumption and deterministic typing
history grouping. Version `0.0.12` adds one guarded root-text range replacement
operation with a closed same-type inverse. Version `0.0.13` lifts semantic text
insertion over direct-root cross-paragraph selections through that operation.
Version `0.0.14` lifts extended backward deletion over the same range shape.
Version `0.0.15` lifts semantic paragraph breaks over that range with a
two-fragment atomic replacement. None of these checkpoints changes document
format version `1`, introduces an executable capability cache, or defines a
durable action-state wire format.

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

`RootTextReplace` is the general guarded text-structure primitive for a range
whose endpoints are aggregate UTF-16 scalar boundaries in direct-root base
paragraphs. `RootTextRange` stores affinity-free start/end paragraph paths and
offsets in source order. The operation stores the complete expected paragraph
slice for that inclusive span and a non-empty replacement paragraph-fragment
slice. One empty fragment means an empty paragraph; the replacement slice itself
can never be empty, so the base document's one-or-more-paragraph invariant is not
an accidental postcondition.

The first expected paragraph's prefix before the start and the last expected
paragraph's suffix after the end survive. With one replacement fragment the
result is `prefix + replacement + suffix`. With several, the prefix joins the
first replacement, the suffix joins the last, and replacement middles become
complete paragraphs. Equal-format seams are canonicalized. Complete source
guards make a stale paragraph fail at its first deterministic span offset.
Same-paragraph source ranges are allowed because the inverse of a
cross-paragraph collapse must insert several paragraphs back into one result
paragraph.

Its inverse is another `RootTextReplace`. The inverse guards every complete
generated result paragraph, selects exactly the inserted replacement slice, and
replaces it with the removed first tail, complete middle paragraphs, and last
prefix. Aggregate UTF-16 coordinates recover the exact formatted slices even
when result seams merged into one text leaf. Forward then inverse restores the
exact document, and the inverse's inverse reconstructs the original operation.
An operation whose completely derived paragraph slice already equals its guard
is filtered as unchanged and emits no inverse, relocation step, or change.

All three structural operation forms rebuild affected paragraph content and the
root child vector, retain untouched sibling `NodeRef` allocations, and submit
the complete candidate to the authoritative schema validator. Root-text
replacement publishes once, without split/join intermediates, so a valid final
tree cannot fail merely because a temporary representation exceeded a limit.
Candidate limit/schema-rule failures carry the validator's unchanged
`ValidationReport`; schema identity or unsupported-schema failures remain
distinct typed errors. The transaction stays atomic in every case. These
operations intentionally support only the exact base schema. A future schema
with block properties, entity identities, or heterogeneous block shells needs
an explicit metadata policy rather than silently inheriting this contract.

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

Root-text replacement maps positions before the guarded paragraph span exactly
and shifts later root-child paths by the checked difference between replacement
and source paragraph counts. Retained first-prefix and last-suffix positions
move into the corresponding first/last result paragraphs. The source start is
an insertion boundary: `Before` stays before the replacement and `After` moves
after it. A non-empty source range's end moves after the replacement; a
collapsed range has only the affinity-owned insertion boundary. Points strictly
inside removed text or complete middle paragraphs expose
`Deleted { before, after }`; root child boundaries strictly inside the replaced
span do the same. Paragraph exit, the
intervening root boundary, and the next paragraph entry remain distinct
structural positions, as they are in document-aware point ordering. Result
points preserve affinity and use valid canonical text/child encodings. The map
is intentionally non-bijective; history restores recorded selections rather
than pretending relocation can recover deleted provenance.

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
formats while revisions continue monotonically. They remain useful lower-level
single-commit helpers. Merged history and updated cursor boundaries are owned by
`EditorSession`, which synthesizes aggregate replay transactions rather than
rerunning these helpers.

## Actions, capabilities, and extension boundary

An action is a pure planner over one immutable `EditorState`; it is not a DOM
event callback and cannot publish state directly. `ActionId` wraps a validated
qualified name. `ActionRegistry` is constructed once from typed registrations,
stores entries in lexical ID order, and rejects the complete build when two
registrations claim the same ID. Registration order, load timing, and a hidden
priority do not select a winner. Contextual fallback and priority belong to the
separate intent router; multiple handlers never compete under one `ActionId`.

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

`ActionRegistry::prepare` is the authoritative registry capability path. It
attempts one input decode and, when decoding succeeds, evaluates the handler
exactly once. A disabled result preserves its stable code and optional bounded
detail. An enabled plan is stamped with the invoked action ID, bound to the
complete base state, and passed through the authoritative transaction reducer
immediately. A failed transaction or enabled no-op is an invalid-plan error,
never an enabled capability. A
successful preparation owns the exact transaction and its cached `Commit`;
consuming it verifies both the snapshot and complete state equality, then
returns that cached commit without calling either handler or reducer again. A
direct action adapter uses this same `ActionId` and preparation path. An intent
adapter uses its `IntentId` and consumes `IntentRouter::route`; neither should
maintain a parallel enablement implementation. Native code can call the public
`Action::evaluate` trait directly, so bypassing registry preflight is another
trusted-plugin responsibility rather than a mechanically sealed boundary.

Preparation alone is not shared-state publication. Two preparations made from
the same base can each produce a valid branch with the same successor revision.
`EditorSession::execute_prepared_action` consumes one preparation against its
authoritative current state and rejects the other as stale. A host queue must
still serialize calls to the session and discard/reprepare a stale queued
action or intent.
`Send` and `Sync` make values thread-safe; they do not make parallel editor
histories linear.

Three base actions take no input, while text insertion accepts one typed input:

- `breditor/insert-text` accepts input contract
  `breditor/insert-text-input@1`, whose complete value is one non-empty string
  of at most 65,536 UTF-8 bytes and 65,536 UTF-16 code units. The second
  ceiling is an explicit but currently redundant version-1 bound under the
  UTF-8 envelope; retaining it prevents a future envelope change from silently
  widening the contract. Unicode is preserved exactly without normalization.
  Newlines and control scalars remain literal inline text rather than becoming
  structural paragraph breaks. At a collapsed range, an explicit pending
  format set wins; otherwise the focus affinity selects the adjacent source
  run, with the other side as an edge fallback. An extended replacement uses
  the first spatially selected run, independent of selection direction and
  endpoint affinities. A structural-only cross-paragraph selection with no
  selected text inherits the last run of the retained start-paragraph prefix,
  then the first run of the retained end-paragraph suffix, then plain text. It
  never searches untouched neighboring paragraphs. This fallback is also
  independent of direction and endpoint aliases. Same-paragraph insertion
  emits one exact guarded `TextSplice`; a genuinely cross-paragraph replacement
  emits one guarded `RootTextReplace` with one replacement fragment and
  collapses the selected paragraphs into the surviving start paragraph. Both
  paths place a collapsed `Affinity::Before` caret at the inserted text's end,
  consume the pending override with `Set(None)`, and request merge group
  `breditor/typing`. Empty input is invalid input, never deletion, a no-op, or a
  disabled capability.

- `breditor/insert-paragraph-break` replaces an extended range with one block
  boundary, or performs one split for a collapsed range. A genuinely
  cross-paragraph range emits one `RootTextReplace` with exactly two empty
  replacement fragments: the retained start prefix and end suffix become
  distinct result paragraphs without a delete/split intermediate. This result
  is monotone in paragraph, node, run, leaf, and text-byte limits for every
  valid source document. A selection containing only the boundary between two
  adjacent paragraphs therefore leaves document content unchanged and becomes
  a selection-only commit; under the current document-operation history law it
  creates no standalone undo entry. Same-paragraph extended ranges retain the
  split/delete or delete/split planner so each validated intermediate fits the
  active limits; if neither route can represent an otherwise valid final tree,
  it returns the stable intermediate-limit disabled reason. Every path
  explicitly places an `Affinity::After` child-boundary caret at the new right
  paragraph start, preserves the exact pending-format option, and requests one
  independent history event.
- `breditor/delete-backward` deletes an extended direct-root text range, deletes
  the immediately preceding Unicode scalar for an interior collapsed caret, or
  joins the previous paragraph at paragraph start. Same-paragraph range and
  scalar deletion remain exact `TextSplice` operations, and collapsed deletion
  at paragraph start remains `ParagraphJoin`. A genuinely cross-paragraph range
  emits one `RootTextReplace` with exactly one empty paragraph fragment, so the
  retained start prefix and end suffix join atomically without an intermediate
  tree. A structural-only selection therefore deletes paragraph boundaries;
  equal-format seam canonicalization is attempted, and the action is disabled
  if the merged leaf would exceed a result limit. The action explicitly places
  an `Affinity::After` caret at the spatial start, preserves the exact
  pending-format option (necessarily `None` for a valid extended selection),
  and requests merge group
  `breditor/delete-backward`. A later contextual insertion at an unequal seam
  consequently inherits the retained suffix/right-side format.
- `breditor/toggle-strong` reports tracked activation and toggles the base
  schema's property-free `breditor/strong` format. At a collapsed range,
  explicit pending formats take precedence; otherwise the focus endpoint's
  affinity chooses the adjacent run, with the other side as an edge fallback.
  The action publishes an explicit pending-format set without rewriting the
  document. For an extended same-paragraph range, all-strong content is made
  plain while inactive or mixed content is made strong. One exact guarded
  `TextSplice` preserves text, other formats, directional anchor/focus roles,
  and endpoint affinities, clears pending formats, and records one independent
  history event. Cross-paragraph ranges remain mutation-disabled but still
  report truthful inactive, active, or mixed state across the selected text.

All four actions support point aliases and non-BMP scalar boundaries; the
content-changing paths preserve forward/backward range direction where a range
survives. Empty paragraphs and formatted seams have explicit behavior.
Cross-paragraph strong-format mutation remains disabled until its block-boundary
distribution contract is frozen. Backward deletion is scalar-based,
not grapheme-based: combining marks and components of a zero-width-joiner emoji
can be deleted separately. Text insertion, paragraph break, and backward delete
advertise stateless observations; strong formatting uses the same evaluation
for capability and inactive/active/mixed state. The parameterized text action
has no generic toolbar entry: a catalog may observe only an exact fixed-string
invocation, such as an intentional snippet or macro control. If an extended
replacement already contains exactly the requested text with the inherited
formats, canonical operation filtering produces a selection-only commit. That
commit creates no undo entry, preserves redo, and closes the active history
merge group. A collapsed pending-format-only toggle likewise rotates the
snapshot and history-observation identity but creates no undo entry and does
not clear redo, because the current history contract records only document
operations. The host must close `breditor/typing` at timer, paste, composition,
focus, and other semantic typing boundaries. DOM
`beforeinput`, `preventDefault`, IME ownership, shortcut precedence, labels,
icons, and layout remain host concerns. Replay does not rerun action callbacks,
route IDs, or post-hooks; it applies the previously proven transaction
operations and state boundaries.

## Semantic intent routing

An intent is a normalized semantic request, not a browser event. `IntentId`
and `BindingId` are independent qualified identities: an intent names what a
host is asking for, a binding names one candidate route, and an `ActionId`
names the semantic planner reached by that route. Rust receives no
`KeyboardEvent`, key-code string, `beforeinput` object, IME phase, platform
shortcut syntax, or `preventDefault` callback. Browser adapters must normalize
those concerns before routing and consume the returned outcome explicitly.

`IntentRouter` is frozen from an immutable `ActionRegistry`, explicit intent
declarations, and explicit bindings. Each intent declares exactly one optional
versioned `ActionInputContract`; every bound action must declare that same
contract, and the bounded `ActionInput` is forwarded unchanged. Version
`0.0.7` has no coercion, defaults, fixed binding arguments, input transforms,
guards, or arbitrary routing callbacks. A caller needing different input may
invoke an action under its own declared contract directly, or define another
intent whose bound actions all advertise the other contract. The router cannot
transform or re-contract an action.

Construction rejects the complete router for duplicate intent IDs, duplicate
global binding IDs, unknown intent/action references, repeated action targets
within one intent, mismatched input contracts, or equal priorities within one
intent. Fixed bounds reject more than 1,024 intent declarations, 4,096 total
bindings, or 256 bindings for one intent before graph/reference validation.
Limit constants and error counts use `u32`, and priority uses `i32`, on native
and Wasm; Rust collection counts and slice lengths remain `usize`. Diagnostics
and descriptor enumeration are independent of registration order.
Declarations enumerate by lexical `IntentId`, global bindings by lexical
`BindingId`, and each route by descending priority; identity is never a hidden
priority tie-break. Negative, zero, and positive priorities are all ordinary
values. Declaring an intent with zero bindings is valid and returns an
exact-base `Unhandled` outcome with an empty trace. Invoking an undeclared
intent instead returns typed `UnknownIntent`.

Version `0.0.7` requires one trusted host compositor to own shared intent
declarations and allocate distinct priorities. Two plugins cannot each package
the same declaration, even when identical, and equal priorities reject the
whole router. Future plugin manifests need explicit ownership/coalescing plus
dependency, before/after, or authorized priority-band policy; registration
order will not become the fallback.

Every binding explicitly chooses whether an expected disabled action falls
through or blocks. Routing first validates the invocation envelope and exact
declared contract before visiting a binding. Each visited action then decodes
the shared payload through ordinary action preparation; decoder failure is
terminal and does not fall through. Each fallthrough retains binding ID, action
ID, priority, and its exact `DisabledReason`. `Prepared` retains the selected
binding and cached `PreparedAction`; `Blocked` retains the complete blocking
binding and reason separately from earlier fallthroughs. Exhausting a declared
route returns `Unhandled`. An undeclared intent, malformed input, handler fault,
invalid plan, or transaction failure is a typed terminal error and never
silently reaches a lower-priority handler. This distinguishes expected
contextual inapplicability from extension defects.

Prepared, blocked, and unhandled route outcomes retain the exact evaluated base
state and ordered fallthrough trace. Session execution validates snapshot
identity and complete base-state equality, then returns an ordinary
`IntentExecutionOutcome`: `Committed` publishes the cached commit, while
`Blocked` and `Unhandled` publish nothing and are not errors. Only stale or
reused base state returns neutral `IntentRouteBaseError`. Execution receipts
retain the evaluated base snapshot and non-normative routing provenance for
telemetry. Each visited binding is prepared once. Its handler evaluates at most
once and evaluates zero times if typed decoding fails. Unvisited bindings
evaluate zero times; executing a prepared route reruns neither handler nor
reducer.

`IntentId`, `BindingId`, priority, and fallthrough trace are deliberately absent
from transaction metadata and history. The selected `ActionId` still enters
transaction metadata through ordinary action preparation. History replay uses
retained operations and boundary states and never reruns routing, consults
current bindings, or depends on a keyboard chord. Router replacement does not
invalidate prior outcomes mechanically: there is no router generation or
revocation epoch, and an old outcome can execute if its editor base remains
exact. Discarding outcomes from a replaced router is host policy.

The router is not a permission boundary. `ActionRegistry::prepare` remains
directly callable, so a host treating routing priority as policy must control
that bypass itself. Matching input-contract identities are also a semantic
promise: the core cannot prove that independently implemented action decoders
interpret the same contract identically. The fixed route-count bounds do not
add an aggregate byte budget across retained disabled-reason details, and the
action registry itself has no fixed entry cap. Router construction remains
trusted native configuration; an untrusted plugin or Wasm boundary still needs
memory, fuel/time, stack, and panic/trap isolation.
Dynamic plugin ownership, unload/revocation epochs, dependency policy, priority
authorization, reason-selective fallback, observers, nested routing, and atomic
multi-action composition remain future contracts.

## Observable action state

Action capability and observable state are one pure evaluation. An action
returns an `ActionEvaluation` containing its authoritative `ActionDecision` and
one `ActionStateIndicator`; there is no second `is_active`, `query_value`, or
toolbar callback. The registry validates the indicator before acting on the
decision, so malformed state is a terminal extension fault and cannot fall
through routing. Disabled actions can still be active or mixed. This is
important for controls such as an active formatting mark that is temporarily
unavailable for the current selection.

Every action descriptor has a frozen `ActionStateSpec`. Registration captures
the handler type's declared default specification, while an explicit
registration override remains available for adapters. Its contract distinguishes
stateless controls from tracked `Inactive`, `Active`, and `Mixed` activation.
Activation `Mixed` means the applicable logical targets contain both active and
inactive targets; it is not an unknown or error state. State values separately
distinguish unsupported, contract-supported but unset, one uniform bounded
`ActionValue`, and mixed values. Uniform null remains different from unset. Each
value carries an `ActionStateValueContract` whose nonzero `u32` version is
independent from action-input, document-format, and schema versions even when
their names or numeric versions happen to match.

The same spec declares conservative read and possible-write domains for
document, selection, pending formats, editor context, exact snapshot identity,
and linear history.
Ordinary `Action::evaluate` calls receive only `EditorState`, not
`SessionHistoryStatus`; action-registry construction therefore rejects
`HISTORY` reads and reports the lexical first invalid action after duplicate-ID
validation. Intent-router construction likewise rejects `HISTORY` reads on
intent declarations, including declarations with no bindings, and reports the
lexical first invalid intent after identity validation. This prevents an
invalidation contract from claiming an input its evaluator cannot observe.
Synthesized catalog undo/redo descriptors are session-backed and may read
`HISTORY`. Other native read claims remain trusted invalidation hints because
handlers receive the complete immutable editor state. Enabled transaction
preflight mechanically derives actual writes: every changed commit writes
`SNAPSHOT`, non-empty forward operations write `DOCUMENT`, changed selection or
pending formats write their respective domains, and session publication writes
`HISTORY`. An actual write outside the declaration invalidates the plan.
Domains describe effects and invalidation; neither the registry nor router is a
permission sandbox.

Intent declarations carry the same state contract and a conservative effects
envelope. Every bound action must have the exact activation/value contract, and
the intent effects must cover every candidate's declared reads and writes. Thus
an intent-backed toolbar control has one stable output shape and route-wide
invalidation contract regardless of which priority candidate currently wins.
Prepared and blocking routes retain the selected action's indicator; an
all-fallthrough unhandled route has no invented indicator. A control that must
retain an indicator while unavailable needs an explicit blocking binding.

`ActionStateId` is independent from `ActionId`, `IntentId`, and `BindingId`.
Several controls can observe the same immutable source without sharing
presentation identity. A frozen `ActionStateCatalog` maps these identities to a
direct `ActionInvocation`, routed `IntentInvocation`, or undo/redo direction.
Labels, icons, localization, ARIA data, grouping, layout, and shortcut syntax
remain a separate presentation manifest keyed by `ActionStateId`. Catalogs are
canonical in lexical state-ID order, reject duplicate IDs and unknown or
mismatched fixed invocations, allow duplicate sources intentionally, and cap
themselves at 512 entries. Fixed invocation inputs additionally share a 65,536
value and 1 MiB UTF-8 payload budget. Construction totals every fixed input
before descriptor validation, so an over-limit error reports the complete
catalog aggregate rather than the prefix that first crossed the limit.

Batch derivation is synchronous and exact-base. Direct sources call
`ActionRegistry::prepare`; routed sources call `IntentRouter::route`; history
sources run the same replay preflight used by `EditorSession::undo` and `redo`.
One entry's deterministic action, route, or replay fault does not erase other
entries. Resolved results retain enabled, disabled, or blocking availability,
the same-call indicator, declared effects, exact actual writes when enabled,
and direct/routed/history provenance. Unhandled routing remains a separate
outcome with its ordered fallthrough trace. A batch clones the complete base
`EditorState` once, retains a `SessionHistoryStatus`, and never contains a
`PreparedAction`, route executable, mutable command object, or callback. A user
activation must prepare again against the current session.

History status contains fixed-width capacity and undo/redo depths plus an
opaque process-local `HistoryStamp`. Stamp equality uses in-memory identity,
not an exposed counter, ordering, hash, or wire value. It changes after every
published commit and successful replay, and after an effective explicit clear
or merge-group close. It does not change for failed/unavailable work or no-op
history boundaries. This distinguishes equal-depth history replacements and
history-only changes without pretending that hidden history entries have a
durable identity.

Dynamic output has both per-entry and batch-wide budgets. One entry may retain
at most 4,096 bounded values and 256 KiB of UTF-8 value/reason detail; overflow
becomes that entry's resource fault. A complete batch may retain at most 65,536
values, 1 MiB of UTF-8 detail, and 16,384 fallthrough records; aggregate failure
returns no partial batch. Accounting includes uniform indicator values,
disabled/blocking details, fallthrough reasons, and nested handler-fault detail,
counting every occurrence rather than shared-pointer identity. Entry faults
retain exact bounded input, observable-state, and handler errors plus stable
action, intent, binding, and history provenance. Transaction, operation,
selection, and result-validation failures are reduced to public, non-exhaustive
typed categories; they cannot retain document fragments or validation reports
outside those budgets. Action-state, invocation, preparation, and routing Debug
output redacts documents, payloads, uniform values, reason details, and cached
commits.

`ActionStateCatalog::derive` remains the eager reference path introduced in
version `0.0.8`: every descriptor evaluates independently, including duplicate
sources. An ordinary routed query can temporarily construct its individually
bounded trace before batch accounting rejects or replaces it.

Version `0.0.9` adds `ActionStateCache` as an explicitly mutable owner of one
frozen catalog and at most one internally retained observation. An exact hit
requires equality of the complete `EditorState` and complete
`SessionHistoryStatus`, including its opaque stamp; a matching `SnapshotId` or
matching history depths alone is insufficient. Exact hits return `Unchanged`
with the same opaque observation identity and shared batch and evaluate no
source. `clear` drops only the cache's retained observation, so caller-held
clones remain valid and the next successful refresh publishes a fresh `Full`
baseline.

A changed refresh classifies document, selection, pending-format, context,
snapshot-identity, and history inputs independently. It reevaluates only exact
source groups whose trusted read declaration intersects that changed basis and
reuses prior immutable outcomes for disjoint readers. Exact duplicate direct,
routed, or history sources coalesce within a cache refresh; different inputs
and direct-versus-routed sources remain separate. Coalescing does not change
logical retention limits: every catalog entry still retains and accounts for
its own outcome. The eager catalog path remains independent and uncached.

After a changed successful refresh, `Delta` carries the prior and new opaque
process-local observation identities, the exact changed basis domains, changed
state IDs in unique lexical order, and the complete new observation. Changed
IDs compare normalized public outcomes, so the list can be empty even when the
basis and observation identity changed. A delta is a local rerender hint, not a
wire patch, replay record, or executable command. Batch-wide resource failure
installs neither a partial batch nor a new identity and leaves the prior
observation current; deterministic entry-local faults are ordinary cacheable
outcomes.

No action-state value retains a prepared token, callback, subscriber, delivery
queue, or plugin revocation handle. Native activation, mixed, and read-domain
claims remain trusted handler semantics because native handlers receive the
complete state; a narrow declaration that omits a dependency can make reuse
stale. Untrusted native or Wasm extensions therefore need a restricted state
view, disabled cross-refresh reuse, or a separate isolation boundary. There is
still no subscription/backpressure protocol, composite projector, durable
action-state codec, panic/trap isolation, or Wasm ABI.

## Session publication and bounded linear history

`EditorSession` exclusively owns one current `EditorState`, retained undo/redo
entries, and the open merge group. Its mutable methods are the synchronous Rust
publication boundary; there is no mutable-state escape. `accept_commit` first
requires both the exact current `SnapshotId` and complete `Commit::before`
state. Reusing a snapshot identity for different document, selection, pending
formats, context, or limits fails without changing state or history.
`apply_transaction` applies against that same current state;
`execute_prepared_action` and `execute_intent_route` join cached preparation to
exact publication. Blocked and unhandled execution are successful no-publication
receipts; stale execution is an error. `Blocked`, `Unhandled`, and stale-base
results leave both state and history unchanged; `Committed` publishes both.
An unchanged transaction publishes nothing, consumes no revision, and does not
implicitly close a merge group.

History classifies content by non-empty applied `Commit::forward_operations`,
not by before/after document inequality. A multi-operation transaction that
changes content and returns to an equal final document is still content history.
Selection/pending-format-only commits add no entry under any history intent and
do not clear redo. They close merging and replace both cursor boundaries
adjacent to the current content: the nearest undo entry's after side and the
nearest redo entry's before side. They are therefore not independently
undoable, but later content undo/redo restores the latest exact anchor/focus,
affinities, selection option, and pending-format option at that boundary.

Content commits use these deterministic rules:

- `Record` clears redo, appends one independent entry, and closes merging.
- `Merge { group }` clears redo and merges only with the immediately adjacent
  open entry carrying the same explicit group. Forward operations append;
  inverses prepend in newest-first undo order; the first before cursor and last
  after cursor survive. No action ID, wall clock, or hidden heuristic participates.
- `Ignore` clears both undo and redo. Keeping prior inverses across unrecorded
  content would be unsound until operations and selections can be mapped or
  rebased through it.

The host may call `close_history_group` at a recorded timer, IME, paste, focus,
or semantic boundary. If merging would make either the aggregate forward or
inverse list exceed `EditorContext::max_operations_per_transaction`, the next
commit starts a new entry with the same group; one atomic commit is never split.
New content after undo always discards redo and cannot merge backward across the
traversal boundary.

Undo and redo peek the nearest entry, build one complete transaction against
the current state, explicitly restore its stored selection and pending formats,
and publish a fresh successor revision with `breditor/undo` or `breditor/redo`
metadata. State and both stacks move only after the reducer succeeds. Boundary,
operation, validation, or revision-overflow failure changes nothing. Successful
replay returns its `Commit`, including relocation and change data, for renderer
invalidation; unavailable replay is `Ok(None)`. Replay never invokes an action
handler or restores an old snapshot number. A low-level content commit marked
`Ignore` and accepted through the ordinary path clears history; only
`EditorSession::undo` and `redo` move the history cursor.

`HistoryCapacity` is a fixed-width `u32` entry count: default `100`, valid range
`0..=10_000`, with zero disabling retention but not publication. Capacity counts
merged entries in the complete linear history and immediately evicts the oldest
entry. It is not a memory-byte limit: guarded operations and structurally shared
documents may retain substantial payloads. The session exposes synchronous
`can_undo`, `can_redo`, fixed-width depths, and an exact opaque history stamp;
the catalog can preflight undo/redo state, while a future observer or current
adapter remains responsible for deciding when to derive and deliver a new
batch.

This checkpoint is local, linear, and in-memory. It has no branching UI,
selective undo, durable reload replay, foreign-operation mapping, collaboration
undo manager, browser FIFO, or clock/IME policy. Collaboration must eventually
map inverse operations and cursor boundaries through remote changes or use a
collaboration-aware history protocol; it cannot silently reuse this stack.

## Current performance limitations

The correctness-first implementation deliberately accepts costs that must be
removed before large-document production use. Root-level node, depth, text-byte,
and property-value measurements are cached for constant-time access. A
fixed-base paragraph splice now validates the generated paragraph and applies
checked global deltas instead of rescanning a matching-profile document, but:

- any profile/schema/path the local proof cannot establish falls back to
  full-tree schema and resource validation;
- every paragraph split/join and root-text replacement performs full-tree
  validation and carries complete paragraph guards until structural subtree
  proofs and durable operation records are specified. A wide cross-paragraph
  replacement therefore scans and retains the complete affected paragraph
  slice in both the forward operation and its inverse. Construction and
  application also derive and canonicalize those slices repeatedly to prove
  same-type inverse closure; a private proof-carrying/cached derivation can
  remove that repeated allocation without changing the public contract;
- every enabled action capability query eagerly applies its generated
  transaction once to prove and cache the result. The eager catalog path still
  repeats planning for every descriptor; the synchronous action-state cache
  avoids exact-hit work, coalesces exact duplicate sources, and reuses disjoint
  declared readers, but every invalidated source still replans and discards its
  temporary executable preparation;
- cache refresh compares complete immutable state and history values before an
  exact hit. Source-group discovery is quadratic in catalog entry count during
  cache construction, bounded by 512 entries; refresh retains normalized clones
  only for duplicate leaders with followers. The cache owns one current
  observation, while caller-held shared observations may legitimately extend
  prior batch lifetimes;
- intent fallback attempts each visited action in descending priority. Disabled
  candidates run input decoding and the planner but no transaction reducer; the
  first enabled candidate is preflighted once. Each fallthrough retains IDs,
  priority, and one individually bounded `DisabledReason`. Route length is
  capped at 256, but aggregate trace bytes have no tighter shared budget than
  that count multiplied by each reason's individual value bounds;
- the frozen router retains each small binding descriptor in both its lexical
  global index and its per-intent priority route; total duplication is bounded
  by the 4,096-binding cap;
- history is bounded by logical entry count rather than retained bytes, and a
  merged entry copies bounded operation recipes while immutable document
  payloads remain structurally shared;
- split/join scans the complete guarded paragraphs and currently reboxes text
  `NodeRef`s inside affected paragraphs, although their immutable string/format
  payloads remain shared;
- strong-format evaluation scans the applicable selected text every time its
  declared inputs invalidate. An extended same-paragraph toggle rebuilds the
  affected paragraph's canonical run sequence in one bounded pass and may
  merge large equal-format seams; cross-paragraph activation scans selected
  direct-root paragraphs until it proves mixed state or reaches the range end,
  even though mutation is disabled;
- insertion plans and applies in time proportional to the affected paragraph's
  runs plus copied seam text for a local splice. Cross-paragraph type-over also
  scans and guards every selected paragraph, and retained history keeps those
  immutable guarded fragments. Because text leaves are immutable strings,
  repeated one-scalar typing into one growing same-format leaf copies that
  leaf on every action and can be quadratic over a long typing sequence. Rust
  or Wasm does not remove this representation cost; a piece table, rope, or
  equivalent persistent text store is required before claiming large-document
  typing performance. The 65,536-byte action envelope also makes larger paste
  chunking or a separate structural-paste contract a host/future concern;
- cross-paragraph extended deletion has the same complete-guard, repeated
  derivation, full-validation, and retained-history costs as type-over. Its
  result cannot increase total text, root children, or global node count, but a
  canonical retained-prefix/suffix seam can still exceed one leaf or paragraph
  child limit;
- cross-paragraph paragraph breaks pay the same complete-guard, repeated
  derivation, full-validation, and retained-history costs. Unlike deletion,
  their two retained boundary fragments are never joined, so the result is
  monotone under every active document limit;
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

Freeze cross-paragraph strong-format semantics, then lift
`breditor/toggle-strong` through one guarded `RootTextReplace` while preserving
every selected paragraph boundary. Activation, direction, endpoint aliases,
affinities, non-selected boundary text, other formats, and exact undo/redo state
must remain coherent. Browser `beforeinput`, composition ownership, IME
buffering, and paste chunking remain adapter concerns. Keep presentation
metadata and delivery outside the deterministic core; subscriber lifecycle,
catalog replacement, backpressure, and coalescing still require a separate
contract before exposing an observer API.
