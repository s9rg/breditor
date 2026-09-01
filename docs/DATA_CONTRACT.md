# Rust data contract

Status: implemented vertical proof; not yet a permanent public wire
compatibility promise
Document format: `breditor/document`, version `1`
Operation format: `breditor/operation`, version `1`
Transaction-request format: `breditor/transaction-request`, version `1`
Editor-state format: `breditor/editor-state`, version `1`
Commit format: `breditor/commit`, version `1`
Session-checkpoint format: `breditor/session-checkpoint`, version `1`
Local-log-entry format: `breditor/local-log-entry`, version `1`
Local-log-checkpoint format: `breditor/local-log-checkpoint`, version `1`
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
- a singular, strict, versioned operation JSON codec that preserves every
  optimistic guard and validates statically knowable schema and resource laws;
- a strict contextual transaction-request codec that binds ordered V1 operation
  payloads and every state/metadata policy to one caller-supplied exact base;
- a strict contextual editor-state checkpoint codec that restores the complete
  snapshot, existing Document V1 value, selection, and pending-format option
  under one caller-supplied context;
- a strict self-contained commit codec that restores one before checkpoint,
  replays canonical forward operations, applies explicit result editor values,
  and publishes only the fully derived transition;
- a strict contextual session-checkpoint codec that restores one exact current
  state plus bounded chronological linear history, redo position, capacity,
  and merge continuity while deriving historical documents and inverses;
- a strict single-entry local-log envelope that assigns independent durable
  session, append-generation, sequence, and retry identities to ordinary
  commits, undo/redo replays, and explicit history-boundary commands;
- a bounded atomic local-log recovery boundary that proves one supplied
  genesis-anchored, uncompacted generation prefix, skips exact semantic
  retries, applies all five event kinds, and retains every accepted replay
  binding;
- a compact in-memory local-log checkpoint anchor that binds that recovered
  or codec-restored session to its declared sealed generation and sequence
  frontier, represents every claimed old replay identity as a tombstone, and
  atomically recovers one distinct successor generation without resetting
  history, sequence, or retry scope;
- a strict, expected-binding local-log-checkpoint codec that atomically restores
  the anchor from one complete Session Checkpoint V1, generation boundary,
  sequence frontier, and record-declared chronological replay-tombstone vector;
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
- generic formatting kinds and attributes beyond property-free strong text;
- action-state subscriptions and delivery queues, presentation metadata,
  keymaps, plugin dependencies/lifecycle, and durable registry manifests;
- ordered log framing and storage, atomic checkpoint/log replacement, repeated
  generation transitions, incremental continuation, integrity/authenticity,
  rollback protection, migration, and crash-tail recovery;
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

untrusted operation JSON
    -> format/version routing and a strict borrowed envelope
    -> schema identity check and allocation preflight over the raw payload
    -> bounded owned singular V1 payload
    -> checked coordinates, canonical fragments, and active static limits
    -> one guarded runtime Operation
    -> ordinary atomic Transaction application against an exact EditorState

untrusted transaction-request JSON + caller-supplied exact EditorState
    -> caller context, byte, format/version, exact-shape, and schema checks
    -> canonical lineage/revision match against the supplied base snapshot
    -> allocation-preflighted streaming decode of ordered operation V1 payloads
    -> checked selection, pending-format, and metadata reconstruction
    -> unapplied exact-base runtime Transaction

untrusted editor-state JSON + caller-supplied EditorContext
    -> byte, format/version, and exact-shape checks
    -> canonical snapshot reconstruction
    -> allocation preflight and authoritative decode of the embedded Document V1 value
    -> checked selection and pending-format reconstruction against that document
    -> complete immutable EditorState at the exact restored snapshot

untrusted commit JSON + caller-supplied EditorContext
    -> byte, format/version, exact-shape, and allocation-preflight checks
    -> authoritative decode of one embedded before-state checkpoint
    -> checked streaming decode of already-filtered forward operation payloads
    -> explicit result selection, pending formats, and metadata reconstruction
    -> atomic replay from the exact before state
    -> reject unchanged or filtered operation recipes
    -> publish one derived Commit or publish nothing

untrusted session-checkpoint JSON + caller-supplied EditorContext and admission policy
    -> byte, format/version, exact-shape, entry-count, and topology checks
    -> authoritative decode of a revision-zero history-base Editor State V1
    -> chronological streaming preflight of compact non-empty history recipes
    -> replay every entry while deriving documents, inverses, and exact boundaries
    -> select the cursor state and install the asserted current revision
    -> reconstruct bounded undo/redo branches and a fresh process-local history stamp
    -> publish one EditorSession or publish nothing

untrusted local-log-entry JSON + caller-supplied EditorContext
    -> whole-entry byte cap, format/version routing, and exact outer shape
    -> checked durable session/log/replay identities and one-based sequence
    -> exact event-shape routing and authoritative Commit V1 replay proof
    -> exact undo/redo metadata classification
    -> publish one independently valid LocalLogEntry or publish nothing

caller-authoritative empty-history EditorSession + expected session/log IDs
+ complete in-memory vector of independently decoded LocalLogEntry values
    -> admit the whole physical batch under host aggregate limits
    -> require exact session and active-generation membership
    -> classify retained exact replay bindings before sequence checks
    -> apply every first-seen event at the exact next sequence from one
    -> publish one RecoveredLocalLog with the session and replay index, or no session

RecoveredLocalLog + one distinct caller-supplied successor generation
    -> consume the complete owner and bind its exact session/history to the prefix edge
    -> replace every full prefix entry with ReplayId -> original sequence tombstones
    -> publish one LocalLogCheckpointAnchor

untrusted local-log-checkpoint JSON + trusted LocalLogCheckpointBinding
+ caller-supplied EditorContext and aggregate checkpoint policy
    -> whole-envelope byte cap, outer format/version routing, and exact shape
    -> checked identities, distinct generations, and trusted-binding equality
    -> allocation-free tombstone count and exact frontier/cardinality proof
    -> bounded chronological replay-ID validation and uniqueness proof
    -> pinned Session Checkpoint V1 replay proof
    -> empty-frontier genesis-history proof
    -> publish one complete LocalLogCheckpointAnchor or publish nothing

LocalLogCheckpointAnchor + complete successor vector + per-batch limits
    -> admit the complete physical batch before application
    -> require the bound session and successor generation on every observation
    -> reject any compacted ReplayId before sequence or application checks
    -> preserve exact duplicate/conflict handling among active-batch entries
    -> continue at the exact session-global sequence and checkpointed history state
    -> publish one terminal ContinuedLocalLog with prefix tombstones and active proofs,
       or no session

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

Deserializing JSON can never construct a runtime `Document` or `Operation`
directly. Document records
are converted through checked, record-independent local node constructors, then
the compiled schema validates the complete root. Operation records are converted
through the same checked operation and fragment constructors used by runtime
authors, followed by context-static schema and limit validation. Neither codec
is used internally as a substitute for runtime validity. Validation either
produces one complete value or no value.

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
two-fragment atomic replacement. Version `0.0.16` preserves every selected
paragraph boundary while lifting strong formatting over cross-paragraph text.
Version `0.0.17` adds the distinct singular operation format
`breditor/operation@1` for all four native guarded operation kinds. It does not
make transactions, commits, selection, or history durable. The same checkpoint
also bounds JSON-parser, envelope, schema-name, and operation-record diagnostic
text, uses fixed-width public operation validation/location counters, rejects
operation payload allocation growth in a streaming preflight before it owns
record vectors, and stops recursive
strict-property parsing from reserving a deserializer's untrusted sequence-size
hint. The raw JSON byte cap remains the absolute input boundary, not a claim
that peak decoder memory equals the input size. Version `0.0.18` adds the
distinct `breditor/transaction-request@1` contextual format. It keeps the full
base `EditorState` out of the record and therefore requires decode callers to
supply the exact state named by the canonical lineage/revision pair. It streams
the bounded operation array, preserves all state-update and metadata variants,
and returns an unapplied `Transaction`; it is not a commit, history entry,
content hash, delivery identity, or ordered log record. The same checkpoint
makes the transaction operation ceiling `u32` and public counts/indexes `u64`.
Version `0.0.19` adds the distinct `breditor/editor-state@1` contextual
checkpoint. It persists every current `EditorState` value field while keeping
the compiled schema and resource limits in the authoritative caller-supplied
`EditorContext`. The embedded document remains an ordinary complete
`breditor/document@1` value. The same checkpoint makes document and state
encoding walk borrowed runtime values rather than first cloning a parallel
owned record tree, and adds a typed streaming document preflight before the
owned document record is allocated. A checkpoint is still not a commit,
session, history stack, log entry, delivery identity, content hash, or
integrity/authenticity proof.
Version `0.0.20` adds the distinct `breditor/commit@1` contextual record. It
embeds one exact before-state checkpoint, the canonical already-filtered
forward recipe, exact result selection and pending formats, and transaction
metadata. Decode replays the recipe and derives the result document, successor
snapshot, inverse operations, relocation, and changes instead of accepting
redundant wire claims. Unchanged records and recipes containing an operation
filtered as unchanged are rejected. Replay failures are projected into bounded
typed diagnostics so codec errors retain no guarded document fragments. A
commit record is still not a history stack, ordered log, delivery identity,
authorization decision, hash, signature, or exactly-once protocol.
Version `0.0.21` adds the distinct `breditor/session-checkpoint@1` contextual
record. It stores one revision-zero history base, a compact oldest-to-newest
chain of retained content recipes and exact result editor values, the current
cursor and revision, bounded history capacity, and optional open merge group.
Decode replays the chain to derive documents and inverse operations, restores
the exact cursor state, normalizes private historical revisions, aligns both
cursor-adjacent boundaries, and allocates a fresh process-local history stamp.
Host-selected checkpoint limits independently bound installed capacity,
aggregate operations, and retained logical document resources. The checkpoint
is still not an ordered log, delivery identity, authenticity proof, migration
protocol, or crash-recovery policy.
Version `0.0.22` adds the distinct `breditor/local-log-entry@1` contextual
envelope and invariant-bearing runtime identities/events. It separates one
session-global logical sequence and retry identity from editor-state revision,
history grouping, and one append generation. The five event kinds distinguish
ordinary publication, undo, redo, claimed merge-group closure, and claimed
history clearing. Commit-bearing events embed and prove Commit V1; undo and
redo additionally require their exact action metadata and ignored-history
intent. This checkpoint is one entry boundary, not yet a stream, store,
deduplication index, recovery engine, or durability claim.
Version `0.0.23` adds an in-memory, genesis-only recovery boundary over those
entries. It consumes an empty-history `EditorSession` and a complete vector,
checks one expected session and log generation, requires first-seen events to
occupy every sequence from one, skips only exact semantic retry bindings,
applies every event to private session state, and returns the session only with
the complete retained replay index. Host-selected aggregate limits bound
physical observations, unique events, and successfully applicable commit
operations. This checkpoint is not a framed log store, checkpoint seed,
cross-generation compaction protocol, integrity proof, or crash-tail policy.
Version `0.0.24` adds a compact runtime checkpoint anchor and one checked
successor-generation recovery. Converting a recovered prefix consumes its full
Commit-bearing entries, retains every replay ID with its original sequence as
a tombstone, and binds a distinct successor generation to the exact session,
history, and next sequence. Successor recovery rejects any compacted replay ID
fail closed, retains exact duplicate/conflict semantics within the new batch,
and publishes only after the complete batch applies. The result is terminal:
this checkpoint deliberately does not define repeated compaction, a durable
combined checkpoint format, file replacement, framing, or crash recovery.
Version `0.0.25` adds `breditor/local-log-checkpoint@1`, a strict durable codec
for that anchor. Its mandatory `LocalLogCheckpointBinding` comes from trusted
host configuration or storage metadata and is checked against all three wire
identities before publication. The record embeds Session Checkpoint V1 and a
complete record-declared chronological replay-tombstone vector whose positions
derive the represented sequences. It derives the count and next sequence
instead of encoding them redundantly, enforces a separate host tombstone limit,
and requires an empty frontier to restore genesis-empty session history. This
structural proof does not establish causal history, integrity, authenticity,
freshness, authorization, rollback protection, storage durability, or writer
fencing.
None of these checkpoints changes document format version `1`, introduces an
executable capability cache, or defines a durable action-state wire format.

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
and an unchanged transaction consumes none. Transaction-request V1 and
editor-state V1 encode the full `u64` as a canonical decimal string rather than
a lossy JavaScript number. A future Wasm adapter must preserve that same
fixed-width value and string boundary.

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
  document. For every extended range, all-strong selected text is made plain,
  while inactive or mixed selected text is made uniformly strong. A local
  range uses one exact guarded `TextSplice`. A cross-paragraph range uses one
  guarded `RootTextReplace` with one toggled selected fragment per guarded
  paragraph, retaining the first prefix and last suffix and preserving every
  paragraph boundary one-for-one. Both paths preserve text, directional
  anchor/focus roles, and endpoint affinities; point aliases canonicalize
  against the result's run topology. Both clear pending formats and record one
  independent history event. A cross-paragraph range containing no selected
  text reports inactive and is disabled as `breditor/no-selected-text`; empty
  paragraphs inside a range containing other text remain intact and do not
  affect activation.

All four actions support point aliases and non-BMP scalar boundaries; the
content-changing paths preserve forward/backward range direction where a range
survives. Empty paragraphs and formatted seams have explicit behavior.
Backward deletion is scalar-based,
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

This runtime remains local and linear. Session Checkpoint V1 can now restore
its exact bounded state and replay behavior after reload, but it adds no
branching UI, selective undo, incremental log, foreign-operation mapping,
collaboration undo manager, browser FIFO, or clock/IME policy. Collaboration
must eventually map inverse operations and cursor boundaries through remote
changes or use a collaboration-aware history protocol; it cannot silently
reuse this stack.

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
  proofs are specified. A wide cross-paragraph
  replacement therefore scans and retains the complete affected paragraph
  slice in both the forward operation and its inverse. Construction and
  application also derive and canonicalize those slices repeatedly to prove
  same-type inverse closure; a private proof-carrying/cached derivation can
  remove that repeated allocation without changing the public contract;
- document JSON decoding routes a borrowed header and exact outer envelope,
  then walks the raw root once with a typed streaming preflight before parsing
  the owned record and rebuilding immutable nodes. The preflight bounds node,
  child, format, property, name, text, and nesting allocations using the active
  document limits while admitting the first semantic excess for an
  authoritative typed validation failure. Escaped strings can still require
  transient decoder allocation, and the owned record coexists briefly with the
  reconstructed runtime document. Document and editor-state encoding walk
  borrowed runtime values directly rather than cloning a second complete
  encoding tree, but still serialize twice—once into a byte counter and once
  into the returned string. A complete document or editor-state wrapper plus
  JSON escaping can make a valid in-memory value exceed `max_json_bytes`, so
  both encoders can return a typed output-too-large failure;
- commit JSON decoding additionally retains the reconstructed before state and
  checked forward operation vector while replay constructs persistent
  intermediate documents, inverse operations, relocation steps, and changes.
  The outer record shares the same `max_json_bytes` budget as its embedded
  checkpoint; therefore some valid in-memory commits cannot be encoded even
  when the before state alone fits. Encoding walks the borrowed before state
  and operation recipe twice, once for exact byte counting and once for output.
  These bounds limit admission but do not promise a fixed peak-memory multiple;
- operation JSON decoding performs one lightweight format/version header pass,
  parses a strict outer envelope with a borrowed raw payload, checks schema,
  streams through that payload once for allocation admission, then parses one
  context-bounded owned V1 envelope and payload, rebuilds canonical immutable
  fragments, and validates statically knowable context limits in linear time. Escaped JSON
  strings can still require a transient decoder allocation during preflight,
  and the later runtime fragments coexist briefly with their record strings.
  Encoding walks and copies every guard and replacement,
  then allocates the complete compact JSON before checking its output byte
  budget. Guarded replacements can legitimately retain source and replacement
  slices near the document text budget independently, and JSON escaping adds
  overhead; callers must handle a typed output-too-large failure. The raw input
  byte cap and allocation preflight bound admission but do not promise a
  one-times-input peak-memory ratio; this V1 codec is not a zero-copy replay
  reader;
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
- session-checkpoint encoding walks the retained logical history in
  chronological order, normalizes its earliest boundary, and serializes every
  retained forward recipe and result editor value twice: once for exact byte
  counting and once for output. Decode streams entry admission with a bounded
  initial reservation, then replays the complete chain while retaining derived
  boundary documents and inverse recipes. The outer JSON cap plus independent
  host-configurable ceilings for installed history capacity, aggregate forward
  operations, and retained logical nodes, text bytes, and property values bound
  admission; they do not promise a fixed peak-memory multiple or make a large
  valid live session encodable under a smaller checkpoint policy;
- genesis local-log recovery temporarily owns the caller's complete observation
  vector while retaining every unique full entry and a replay index. Runtime
  anchor conversion drops those Commit-bearing entries but retains one ordered
  ID/sequence tombstone per unique prefix event. Successor recovery additionally
  owns the complete caller vector, active full entries, and an active index;
  its aggregate limits bound counts and executed operations, not a fixed peak
  byte multiple. The terminal result avoids unbounded repeated growth by not
  exposing another transition, rather than by solving constant-space exact
  replay membership;
- split/join scans the complete guarded paragraphs and currently reboxes text
  `NodeRef`s inside affected paragraphs, although their immutable string/format
  payloads remain shared;
- strong-format evaluation scans the applicable selected text every time its
  declared inputs invalidate. An extended same-paragraph toggle rebuilds the
  affected paragraph's canonical run sequence in one bounded pass and may
  merge large equal-format seams. A cross-paragraph toggle captures every
  guarded paragraph, scans all selected fragments for one global decision, then
  builds the per-paragraph replacements and complete predicted results in a
  series of subsequent bounded passes. Its forward operation and history retain
  that complete guarded slice; the shared source proof also retains the two
  selected endpoint fragments transiently for cross actions that do not consume
  them. Boundary splits can add at most one run to each endpoint paragraph,
  while canonicalized seams can merge large equal-format text;
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

A singular guarded operation uses a separate envelope and closed tagged union:

```json
{
  "format": "breditor/operation",
  "formatVersion": 1,
  "schema": { "name": "breditor/base", "version": 1 },
  "operation": {
    "kind": "textSplice",
    "range": { "containerPath": [0], "start": 1, "end": 3 },
    "expectedRemoved": {
      "runs": [{ "text": "😀", "formats": [] }]
    },
    "replacement": {
      "runs": [
        {
          "text": "x",
          "formats": [{ "type": "breditor/strong", "properties": {} }]
        }
      ]
    }
  }
}
```

Version `1` closes over exactly `textSplice`, `paragraphSplit`,
`paragraphJoin`, and `rootTextReplace`. Paths are arrays of `u32` child indexes;
offsets are JSON integers in the inclusive JavaScript-safe range. Fragments
store non-empty runs in semantic order and formats in ascending unique kind
order. Every V1 operation format explicitly carries `"properties": {}` and any
non-empty map fails during strict record parsing; format attributes do not yet
have operation semantics. Empty fragments use an empty `runs` array. The record never stores
derived paragraph indexes/counts, lengths, inverse operations, relocation,
changes, affinity, selection, state identity, or metadata.

The exact V1 tagged payloads are:

- `textSplice`: `range: {containerPath, start, end}`, `expectedRemoved`, and
  `replacement`;
- `paragraphSplit`: `paragraphPath`, `offset`, and `expected`;
- `paragraphJoin`: `leftPath`, `expectedLeft`, and `expectedRight`; and
- `rootTextReplace`: `range: {start: {paragraphPath, offset}, end:
  {paragraphPath, offset}}`, `expectedParagraphs`, and
  `replacementParagraphs`.

Every fixed object rejects unknown, missing, duplicate, null-in-place-of-value,
and wrong-type fields. Object-member order and insignificant whitespace are
accepted; semantic array order is preserved. The encoder emits one compact
declaration order. Unknown kind tags fail closed under V1 rather than being
skipped or treated as extension data.

`OperationJsonCodec` is bound to an `EditorContext`. Decode preserves encoded
guards exactly and calls checked constructors; it never recaptures against live
content. Encode validates the supplied runtime operation under that same
context and succeeds only when the result fits the codec's decode byte budget.
Document lookup, target kind, source-guard equality, final candidate validation,
and transaction operation count remain application-time laws. Consequently an
operation record is a deterministic guarded recipe, not proof that it applies
to a particular snapshot.

Decode first routes format/version, parses the exact outer envelope while
borrowing the raw operation payload, and rejects a schema mismatch before
materializing payload vectors. A streaming allocation preflight then caps paths,
paragraph slices, run lists, format lists, and text against conservative
context-derived ceilings. Each individual semantic ceiling admits its first
excess item or byte so the ordinary checked decoder can return the more precise
typed validation error; larger hostile inputs fail as invalid JSON before the
owned payload parse. Preflight is an allocation-admission guard, not another
validity contract: every admitted record still passes the exact constructors
and `OperationValidationError` checks.

Envelope and owned-record JSON failures report line/column coordinates in the
complete caller input. Allocation-preflight failures are produced by a parser
over the borrowed `operation` value and therefore report coordinates relative
to that payload. This distinction is diagnostic only; stable error codes and
typed locations remain the control-flow contract.

All fields are explicit, including nullable `entityId`. Unknown fields, unknown
record versions, duplicate JSON keys, unsorted properties, unsupported schema
names or versions, unknown node or format kinds, and every canonicality
violation fail closed with typed errors.

Public codec errors contain Breditor-owned JSON failure details rather than
exposing `serde_json::Error`, and every codec exposes the shared stable
`CodecErrorCode`. Failed operation reconstruction additionally exposes an
`OperationRecordErrorCode` plus a typed record location; context-static
operation rejection uses `OperationValidationError`. Commit result-field
reconstruction exposes `CommitRecordErrorCode` and `CommitRecordLocation`;
replay failure exposes `CommitApplicationErrorCode`, an optional operation
index, and a bounded diagnostic projection that retains no document-bearing
transaction source. Session-checkpoint reconstruction additionally reports
fixed-width chronological entry and nested operation indexes while projecting
entry replay failures into bounded diagnostics rather than retaining guarded
document payloads. Complete document
validation issues separately expose a stable code, node path, typed subject
(child, format, property/value path, entity identity, or limit), and structured
detail such as the exceeded size or duplicate-ID origin. Human messages are
never a control-flow contract. JSON parser, unsupported format, invalid schema
name, and operation-record diagnostic display escapes controls in a valid-UTF-8
preview of at most 256 bytes and records the original byte length separately.
Legacy complete-document `ValidationIssue` messages and invalid encoded property
subjects are not yet universally preview-bounded; their strict input remains
under the document JSON byte budget. Public operation validation and
nested record-location counts use `u64`, while child indexes and their protocol
ceilings use `u32`, so native and Wasm diagnostics do not depend on pointer
width.

Wire-shape changes increment the relevant envelope's `formatVersion`.
Schema-semantic changes increment `schema.version`. A future schema fingerprint
must additionally pin compiled definitions before user-defined schema identity
can be treated as a compatibility proof. Canonical document/operation hashing
is deliberately deferred until its cross-language byte specification is written
and tested. Documents, singular operations, contextually decoded transaction
requests, contextually decoded complete editor-state checkpoints,
replay-proved commits, and bounded local linear-history sessions have
persistent formats today. None of these formats is an ordered delivery log.

### Transaction request V1

An atomic request uses a distinct envelope. Its operation entries are bare V1
operation payloads rather than nested `breditor/operation` envelopes:

```json
{
  "format": "breditor/transaction-request",
  "formatVersion": 1,
  "schema": { "name": "breditor/base", "version": 1 },
  "baseSnapshot": { "lineage": "editor-123", "revision": "42" },
  "operations": [],
  "selectionRelocation": { "anchor": "reject", "focus": "reject" },
  "selectionUpdate": { "kind": "relocate" },
  "pendingFormatsUpdate": { "kind": "preserve" },
  "metadata": {
    "action": null,
    "history": { "kind": "record" }
  }
}
```

`baseSnapshot.revision` is the canonical decimal string
`0|[1-9][0-9]*` across the full `u64` range; using a string avoids JavaScript's
lossy integer range. `selectionUpdate` is either `relocate` or `set` with a
required nullable selection. V1 selections are directional ranges whose text
and child-boundary points retain path, `u32` offset/index, and before/after
affinity exactly. `pendingFormatsUpdate` distinguishes `preserve`, `set` to
`null`, and `set` to an empty or non-empty canonical property-free format set.
Metadata always carries a required nullable action and one `record`,
`merge(group)`, or `ignore` history intent. Every fixed object and tagged union
fails closed on missing, duplicate, unknown, null-in-place-of-value, or
wrong-type fields.

`TransactionJsonCodec` is bound to an `EditorContext`, and decode also receives
the complete immutable base `EditorState`. Its honest round-trip law is
`decode(encode(transaction), transaction.base_state()) == transaction`. Context
misuse is rejected before parsing. The decoder then enforces the raw byte cap,
routes the header, parses an exact borrowed envelope, validates schema and the
canonical base identity, and preflights the operation count and every nested
allocation. It streams one raw operation payload at a time, retaining only
checked runtime operations. At most the first count excess reaches the typed
fixed-width operation-limit error; further excess fails at allocation
preflight. State and metadata names/paths use the same protocol-first-excess
admission rule. Nested raw-payload JSON locations are payload-local; stable
codes, indexes, and typed record locations are the control-flow contract.
Encode counts JSON bytes while converting at most one operation payload at a
time, aborts on the first over-budget serializer chunk, and allocates the output
string only when the count fits the same decode budget. Output-too-large reports
the observed lower bound; counter overflow saturates that bound.

Decode does not apply the request, resolve an explicit selection against a
future result document, or return a `Commit`. `Transaction::apply` and
`EditorSession::apply_transaction` remain the authoritative all-or-nothing
replay boundary. The base snapshot is an identity reference, not a content
hash; supplying the base state is what binds the reconstructed runtime request
to complete content and configuration.

This V1 record intentionally has no result snapshot, result document, inverse
operations, filtered forward operations, relocation map, change set, request or
sequence ID, deduplication key, checksum/signature, author, timestamp, history
stack, or durable log position. It provides neither exactly-once delivery nor
dishonest lineage/revision reuse detection. Undo/redo transactions encoded
through it are ordinary exact-base requests and do not reconstruct a session's
history. A host accepting untrusted metadata must authorize or sanitize history
intent: `ignore` can clear both local history branches after a content commit,
and `merge` changes grouping behavior. Schema identity is also not yet a
compiled-context fingerprint.

The operation envelope has no base snapshot/hash, lineage/revision, sequence,
replay identity, checksum, signature, author, transaction boundary, or
deduplication key. In particular, an insertion splice has an empty source guard
and can apply more than once; optimistic guards detect stale content but do not
provide exactly-once delivery or prevent ABA matches. Stable compact Rust V1
encoding is deterministic, but it is not yet an RFC 8785 or cryptographic
cross-language canonicalization promise.

### Editor state V1

A complete checkpoint uses its own exact six-field envelope and embeds an
ordinary complete Document V1 value:

```json
{
  "format": "breditor/editor-state",
  "formatVersion": 1,
  "snapshot": { "lineage": "editor-123", "revision": "42" },
  "document": {
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
  },
  "selection": null,
  "pendingFormats": null
}
```

All six fields are required. The two state options are required-nullable:
`selection: null` means no active selection, while `pendingFormats: null` means
derive typing formats from context. `pendingFormats: []` is distinct and means
an explicit unformatted override. As elsewhere, fixed objects reject unknown,
missing, duplicate, null-in-place-of-value, and wrong-type fields. Snapshot
revision uses the same canonical decimal `u64` string as transaction-request
V1. Selection uses the same directional range and UTF-16 point records, and
pending formats use the same ascending, unique, property-free V1 records.
Node, grid, multi-range, and attributed pending-format values are not silently
downcast; they require a future state format version after corresponding
runtime semantics exist.

The closed non-null V1 shapes are:

```json
{
  "kind": "range",
  "anchor": {
    "kind": "text",
    "textPath": [0, 0],
    "utf16Offset": 1,
    "affinity": "before"
  },
  "focus": {
    "kind": "children",
    "parentPath": [0],
    "childIndex": 1,
    "affinity": "after"
  }
}
```

A point is exactly one `text` shape with `textPath` and `utf16Offset`, or one
`children` shape with `parentPath` and `childIndex`; affinity is exactly
`before` or `after`. Each non-null pending-format array entry is exactly
`{"type":"breditor/strong","properties":{}}` under the base schema. The
qualified format kind remains schema-selected, but V1 requires the explicit
empty properties object.

`EditorStateJsonCodec` is bound to one complete `EditorContext`. The context is
not selected by the wire: its compiled schema definitions, document/resource
limits, and transaction operation ceiling remain caller-authoritative. Decode
checks the outer byte cap and exact envelope, reconstructs the canonical
snapshot, allocation-preflights state values, and passes the borrowed nested
document unchanged through `DocumentJsonCodec`. It then reconstructs selection
and pending formats and proves them together against that exact document before
publishing one immutable state. Encode rejects even a schema-equal state when
the rest of its context differs. Its honest law is
`decode(encode(state)) == state` for one exact context.

Editor State V1 compositionally pins its embedded document to Document V1.
Supporting a future document version in the standalone document codec cannot
silently widen this checkpoint; the editor-state format must choose an explicit
versioned document entrypoint or advance its own version.

After outer routing, deterministic failure precedence is snapshot
reconstruction, selection preflight, pending-format preflight, embedded
document decode, typed selection reconstruction, typed pending-format
reconstruction, then complete state validation. First-excess admission applies
to each independent preflight counter in that traversal order; it does not
promise to report every simultaneous violation.
Outer-envelope JSON failures use complete-input coordinates. Failures produced
while parsing a borrowed snapshot, selection, pending-format, document, or
document-root sub-value use coordinates local to that sub-value; stable error
codes and typed locations, not parser line/column, are the control-flow
contract.

The checkpoint owns no redundant top-level schema field: Document V1 remains
the sole persisted schema identity and the supplied context remains the source
of compiled semantics. It owns no history capacity or cursor, undo/redo stack,
commit, operations, action registry/cache, intent router, presentation state,
focus owner, DOM selection, composition buffer, queue position, request ID,
deduplication key, checksum, signature, author, or timestamp. Restoring a high
or maximum revision is valid; the next changed transaction can still fail with
revision overflow. A lineage/revision pair is caller-owned identity, not a
content hash, globally unique provenance proof, or defense against dishonest
reuse. Byte and structural limits bound admission but do not authenticate the
checkpoint or promise a fixed peak-memory multiple of its input size. Property
string values have no narrower semantic byte ceiling and rely on the complete
checkpoint/document `max_json_bytes` envelope.

### Commit V1

A durable commit is a self-contained replay proof with exactly seven required
fields. `before` is the complete Editor State V1 value described above;
`forwardOperations` contains bare Operation V1 payloads in application order,
not nested operation envelopes:

```json
{
  "format": "breditor/commit",
  "formatVersion": 1,
  "before": {
    "format": "breditor/editor-state",
    "formatVersion": 1,
    "snapshot": { "lineage": "editor-123", "revision": "42" },
    "document": {
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
    },
    "selection": null,
    "pendingFormats": null
  },
  "forwardOperations": [],
  "resultSelection": {
    "kind": "range",
    "anchor": {
      "kind": "children",
      "parentPath": [0],
      "childIndex": 0,
      "affinity": "before"
    },
    "focus": {
      "kind": "children",
      "parentPath": [0],
      "childIndex": 0,
      "affinity": "before"
    }
  },
  "resultPendingFormats": null,
  "metadata": {
    "action": null,
    "history": { "kind": "record" }
  }
}
```

This example is a valid state-only commit: the explicit result selection differs
from the before state even though the forward sequence is empty. Both result
fields are required-nullable. `resultPendingFormats: null` remains distinct from
an empty array, and all selection direction, point kind, offset, and affinity
values are preserved exactly. Metadata has the same action and history shapes
as Transaction Request V1.

`CommitJsonCodec` is bound to one complete `EditorContext`. Decode enforces the
outer byte cap, routes format and version, parses the exact borrowed envelope,
and allocation-preflights the forward sequence, result selection, result
pending formats, and metadata before owning those values. It then delegates the
embedded checkpoint to `EditorStateJsonCodec`, streams checked operations,
reconstructs the result values and metadata, and applies one transaction against
the exact embedded before state. The transaction always uses explicit `Set`
policies for both result values; selection relocation policy is consequently
not a persisted claim.

Commit V1 independently pins `before` to Editor State V1, which in turn pins
Document V1. Adding a newer standalone state or document codec must not widen
the accepted or emitted nested versions while the outer commit version remains
`1`.

Outer-envelope JSON failures report locations in the complete commit input.
Failures produced while parsing the borrowed before state, forward sequence,
result values, metadata, or deeper nested document are relative to that
subvalue. Stable codes, operation indexes, and typed locations—not parser
line/column—are the cross-language control-flow contract.

The result document and snapshot are derived. A successful content or
state-value transition consumes exactly the before snapshot's successor
revision. A before revision of `u64::MAX` therefore fails replay rather than
wrapping. The derived forward list must equal the wire list exactly: if
application filters any encoded no-op, decode rejects the first differing
fixed-width index. An empty recipe whose explicit values do not change is also
rejected. A non-empty recipe that changes content and later returns to the
original document remains a real commit event.

The honest law for one exact context is
`decode(encode(commit)) == commit`. Equality includes exact before/after states,
filtered forward operations, derived inverse order, relocation, change set, and
metadata. Encode rejects a commit proved under a different context and may
return output-too-large when the complete self-contained record does not fit
the same byte budget used by decode.

Commit V1 deliberately omits the after checkpoint, result revision, inverse
operations, relocation map, and change set. Those values would be redundant
claims, not authentication; replay derives and proves them from the before
state and forward recipe. Replay errors retain a stable typed category, an
operation index where applicable, and only a bounded diagnostic. They do not
retain the original document-bearing transaction error.

The record has no session ID, history cursor or capacity, undo/redo stack,
merge-boundary state, sequence number, log position, request/delivery ID,
deduplication key, author, timestamp, checksum, hash, signature, authorization,
or crash-tail policy. Decoding one commit proves only internal deterministic
consistency under the supplied context. It does not prove provenance, ordering,
freshness, permission, exactly-once application, or membership in a particular
session. Hosts must authorize metadata before publication: `ignore` and
`merge` can alter local history behavior. Compact Rust output is deterministic
but is not yet an RFC 8785 or cryptographic cross-language canonicalization
contract.

### Session checkpoint V1

A session checkpoint persists one complete bounded local linear-history
observation in exactly eight required fields:

```json
{
  "format": "breditor/session-checkpoint",
  "formatVersion": 1,
  "historyBase": {
    "format": "breditor/editor-state",
    "formatVersion": 1,
    "snapshot": { "lineage": "editor-123", "revision": "0" },
    "document": {
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
    },
    "selection": null,
    "pendingFormats": null
  },
  "currentRevision": "42",
  "historyCapacity": 100,
  "cursor": 0,
  "entries": [],
  "openMergeGroup": null
}
```

`historyBase` is a complete Editor State V1 value for the earliest retained
logical boundary, but its revision is canonically and necessarily `"0"`.
`currentRevision` separately preserves the exact current `u64` revision as a
canonical decimal string. The base lineage is the restored session lineage.
The current document, selection, and pending formats are not redundant wire
claims: decode derives them by replaying the chronological prefix ending at
`cursor`, then publishes that derived value at the asserted current revision.

`entries` contains retained logical history entries in oldest-to-newest order.
Each entry is exactly:

```json
{
  "forwardOperations": [
    {
      "kind": "textSplice",
      "range": { "containerPath": [0], "start": 0, "end": 0 },
      "expectedRemoved": { "runs": [] },
      "replacement": { "runs": [{ "text": "x", "formats": [] }] }
    }
  ],
  "resultSelection": null,
  "resultPendingFormats": null
}
```

The operation values are bare Operation V1 payloads rather than nested
operation or commit envelopes. Every entry recipe is non-empty, ordered, and
already filtered. Decode applies it from the preceding derived boundary,
explicitly sets the two required-nullable result values, rejects an unchanged
or partially filtered recipe, and derives the result document, inverse recipe,
relocation, and changes. It then replays the locally derived inverse and rejects
an unchanged or noncanonical inverse or any semantic boundary mismatch. Forward
and inverse application failures carry an explicit replay direction. A
non-empty recipe whose net result document equals its source remains a valid
history event. Metadata is absent: a merged history entry can span several
original actions and the runtime entry retains no canonical transaction
metadata.

`cursor` is the undo depth. Entries before it form the undo prefix; entries at
and after it form the redo suffix in forward chronological order. Runtime redo
storage reverses that suffix only after the complete chain is proved.
`historyCapacity` is the capacity restored into the live session. Entry count
must not exceed capacity, cursor must not exceed entry count, and capacity zero
requires an empty chain, zero cursor, and null open group. A non-null
`openMergeGroup` is valid only at the end of a non-empty chain with positive
capacity. It preserves exact same-group merge continuation; decode aligns both
cursor-adjacent runtime boundaries to the exact restored current state so
private normalized revisions cannot accidentally split the next merge.

History contains only content entries. Selection/pending-format-only commits
therefore never become empty recipes. Their latest values are folded into the
single shared logical boundary: the base values at cursor zero or the preceding
entry's result values elsewhere. This preserves both adjacent undo/redo cursor
results and closes merge continuity exactly as the live session does.

Historical snapshot revisions are deliberately normalized out of the format.
They are rewritten asymmetrically during ordinary replay and do not participate
in history applicability or result identity. Decode uses safe private revisions
while proving the chain, then installs only `currentRevision` at the cursor.
There is intentionally no `currentRevision >= entries.length` law: the value is
a caller-owned identity assertion, not provenance or a count of persisted
events. Revision `u64::MAX` is valid to restore; the next changed transaction or
history replay can then fail atomically with revision overflow.

`SessionCheckpointJsonCodec` is bound to one exact caller-supplied
`EditorContext` and a caller-authoritative `SessionCheckpointLimits` policy.
The wire selects neither. The runtime `HistoryCapacity` hard maximum remains
10,000, while the default checkpoint policy accepts at most capacity 100,
16,384 aggregate forward operations, 1,000,000 logical retained nodes, 64 MiB
of logical retained text, and 100,000 retained property values. Hosts can set
these checkpoint ceilings independently. Every entry also remains under the
context's per-transaction operation ceiling. Retained-resource admission sums
the cached summary of the history base and each derived entry-result boundary;
the first crossing identifies the rejected boundary. It measures logical
retention rather than deduplicated `Arc` allocations. Encode enforces the same
context and checkpoint policy as decode, so a valid live session can be
rejected when its installed capacity, retained resources, operation recipes,
or compact JSON exceed the chosen durable admission budget.
Aggregate arithmetic is checked and fails closed with a distinct overflow
category even when a host deliberately configures a `u64::MAX` policy.

Decode first enforces the complete-input JSON byte cap, routes format and
version, and parses the exact borrowed outer shape. It validates the requested
capacity against the runtime and host policy, streams an allocation-free entry
count bounded by that capacity, and checks cursor and open-group topology. It
then reconstructs the current revision and open-group name before preflighting
the strict nested entries, per-entry operations, and aggregate recipe budget;
the later retained vector uses a capped initial reservation. Only after those
fail-fast topology and resource checks does it route and decode the required
revision-zero base and replay entries in chronological index order. The first
rejected entry and nested operation use fixed-width `u64` indexes. Replay
failures are projected into stable direction/category codes and bounded
diagnostics rather than retaining guarded document-bearing errors. All
reconstruction is private until the complete chain and cursor boundary are
proved; failure publishes no partial session.

The process-local `HistoryStamp` is not serialized. Decode always creates a
fresh stamp, so equality across a source and restored session is meaningless.
The behavioral round-trip law is exact current state, capacity, undo/redo
depths and availability, deterministic future merge behavior, and identical
undo/redo replay results. Re-encoding a successfully decoded canonical
checkpoint is byte-stable even though private historical revisions were
normalized.

This is a replaceable snapshot, not an append-only log. It has no session ID,
sequence or log position, delivery/replay ID, deduplication key, causal parent,
author, timestamp, checksum, hash, signature, authorization, migration chain,
transaction tail, fsync rule, or crash-truncation policy. A valid altered chain
is merely another internally consistent checkpoint; operation guards and the
lineage/revision assertion do not prove provenance, freshness, or permission.
`openMergeGroup` is behaviorally active untrusted data, so a host that does not
trust the source must authorize it or close the restored group before accepting
new edits. Compact Rust output is deterministic but is not RFC 8785 or a
cryptographic cross-language canonicalization contract. Admission budgets
limit resource use; they do not authenticate content or guarantee a fixed
peak-memory multiple.

### Local log entry V1

Local Log Entry V1 is one independently decodable, replay-identified session
event. It requires exactly seven fields regardless of input object-member
order; the canonical encoder emits them in this order:

```json
{
  "format": "breditor/local-log-entry",
  "formatVersion": 1,
  "sessionId": "session-01",
  "logId": "generation-01",
  "sequence": "42",
  "replayId": "request-42",
  "event": { "kind": "closeHistoryGroup" }
}
```

`LocalSessionId`, `LocalLogId`, and `ReplayId` are separate caller-supplied
opaque types. Each is 1 through 128 ASCII bytes, begins with an ASCII letter or
digit, and thereafter admits ASCII letters, digits, `.`, `_`, `:`, and `-`.
The deterministic core never invents one from time, randomness, an address, a
node key, document content, or editor-state identity.

The session ID names one durable editor-session lineage. A log ID names one
append generation and changes when a future compaction protocol creates a new
generation. A replay ID is the idempotency identity of one logical event: the
host must keep it stable across an uncertain retry and unique within the
session, including across generations. V1 validates only syntax. The genesis
recovery boundary below proves uniqueness, membership, and retry equivalence
within its one retained generation prefix; later checkpoint and compaction
protocols must carry that proof across invocations and generations.

`LocalLogSequence` is a distinct one-based `u64`. It is session-global and must
continue across log generations. JSON uses the same canonical decimal-string
grammar as snapshot revisions, but the values are unrelated. Every event,
including a history-boundary command that changes no editor-state revision,
consumes one sequence when first accepted. An exact physical retry reuses its
logical event's sequence and replay ID. Zero represents no entry and is not a
valid `LocalLogSequence`; `u64::MAX` is a valid final value and has no
successor.

The exact event union is:

```json
{"kind":"commit","commit":{}}
{"kind":"undo","commit":{}}
{"kind":"redo","commit":{}}
{"kind":"closeHistoryGroup"}
{"kind":"clearHistory"}
```

The `{}` values above denote an embedded complete Commit V1 value rather than
literal empty objects. Local Log Entry V1 pins `breditor/commit@1`; a future
default commit codec cannot silently widen this composition boundary. Missing,
duplicate, unknown, null-in-place-of-value, and wrong-type fields fail closed
at both outer and event shapes.

An ordinary `commit` event accepts any replay-proved Commit V1, including a
state-only commit or a content commit with `Record`, `Merge`, or `Ignore`
history intent. The intent remains behaviorally active and must be authorized
by the log owner before recovery. An `undo` or `redo` event requires a non-empty
applied operation recipe, exact action `breditor/undo` or `breditor/redo`, and
`HistoryIntent::Ignore`. This classification rejects accidental or mislabeled
ordinary commits; attacker-authored metadata can still imitate it. It does not
prove that the commit came from the named session. Recovery derives the
authoritative replay from its private `EditorSession`, requires the complete
derived durable proof to equal the embedded proof, and only then moves the history
cursor. Accepting that replay commit through the ordinary commit path would
clear history instead of moving the cursor.

`closeHistoryGroup` and `clearHistory` deliberately have no commit payload.
They exist because both commands can change future session behavior without
changing the document or consuming an editor-state revision. Honest producers
emit them only when the command is effective. V1 cannot establish effectiveness
from an isolated entry. Recovery rejects a first-seen redundant command against
its private session; an exact retry is skipped before that effectiveness check.

`LocalLogEntryJsonCodec` is bound to one caller-supplied `EditorContext`. Decode
enforces the whole-entry byte cap, routes outer format and version, parses the
exact borrowed outer shape, reconstructs the bounded identities and sequence,
then routes the exact event shape and delegates a nested commit to
`CommitJsonCodec`. It validates undo/redo classification and publishes only a
complete runtime entry. Public record and event-classification
failures use stable codes and bounded diagnostics. No failure retains a decoded
commit or document-bearing transaction error. Encode rechecks the runtime
event, counts the complete wrapper before allocating its result string, and
emits deterministic compact Rust JSON. A commit that fits its standalone cap
can still be rejected when the wrapper pushes the complete entry over that same
context limit.

### Genesis local-log recovery

`LocalLogRecovery` is an all-or-nothing verifier and application boundary for
one supplied, uncompacted generation prefix beginning at session-global
sequence one. The caller supplies the expected `LocalSessionId`, active
`LocalLogId`, a host-selected `LocalLogRecoveryLimits`, an owned
`EditorSession`, and an owned vector of already decoded `LocalLogEntry` values.
The initial session must have zero undo and redo depth. Its exact state,
`EditorContext`, history capacity, and durable relationship to the named
session are caller-authoritative; recovery neither serializes nor authenticates
that genesis boundary. “Genesis” refers only to sequence one of this local log:
the initial editor state may contain imported content and any valid revision,
and the log does not prove how that state was created.

The batch state machine is fixed:

1. Convert and admit the complete physical observation count before applying
   anything. Exact retries count as observations.
2. Reject an initial session with retained undo or redo history.
3. For each physical observation, require the expected session ID and active
   log ID before consulting replay state.
4. Consult the deterministic retained `ReplayId` index before sequence checks.
   The same replay ID, sequence, event discriminator, and complete durable
   Commit V1 proof is an exact semantic retry: count and skip it without
   applying it or advancing order. Replay-derived commit caches do not enter
   retry identity. Any changed sequence or durable event is a fatal conflict.
5. Require each first-seen event at the exact next sequence, beginning at one.
   Gaps, backwards positions, and a new replay ID reusing an old position fail.
6. Charge the unique-event and aggregate forward-operation budgets before
   application. Ordinary commits charge their durable forward recipe; undo and
   redo consult the authoritative retained local recipe before cloning or
   deriving it. Controls charge zero operations. A logged replay with another
   operation count cannot undercharge derivation: the authoritative budget or
   proof-count check rejects it before the recipe is derived.
7. Apply the first-seen event to the privately owned session, then retain its
   complete entry and replay-index position. Ordinary commits use exact-base
   session acceptance. Undo and redo use an opaque one-shot prepared replay so
   comparison happens before history mutation. Control commands must be
   effective.

Success returns `RecoveredLocalLog`, which owns the recovered session, every
first-seen entry, and the complete deterministic replay index for the accepted
prefix. It exposes physical, unique, duplicate, and applied-operation counts;
the covered and next sequence; ordered unique entries; and lookup by replay ID.
Its debug representation is redacted. `into_session` deliberately discards the
retained proof bindings, so that bare session must not be used to claim safe
continuation. Version `0.0.23` itself has no continuation API; version `0.0.24`
can consume this complete owner into the runtime anchor described below.

Every typed failure owns only bounded identities, fixed-width counts and
indices, stable categories, and payload-free application subcodes. It retains
no rejected entry, commit, editor state, transaction guard, or document-bearing
history error. Because recovery consumes the session and publishes only on
complete success, an ordinary returned error cannot expose the privately
applied prefix. This atomicity contract does not cover allocation failure,
panic, abort, or process crash.

Default aggregate ceilings are 10,000 physical observations, 10,000 unique
events, and 16,384 applied forward operations. Hosts can lower any limit to
zero. These limits bound retained entry/index cardinality and aggregate
successful application work; the active `EditorContext` still bounds each
entry's document and transaction resources. They do not bound memory already
owned by the caller's vector, promise a fixed peak-memory multiple, or replace
the local-log-entry decoder's byte and structural limits.

The operation budget charges forward-operation cardinality from an ordinary
event proof or the authoritative retained undo/redo recipe before application.
A same-size forged replay proof can cause one already-budgeted local derivation
before complete proof mismatch, but a smaller logged recipe cannot undercharge
a larger retained history unit. Checkpoint-linked successor recovery preserves
this preflight seam; its operation budget charges only work applied from the
successor batch, including authoritative recipes already present in checkpoint
history when an undo or redo crosses the boundary.

Exact retry equality compares the durable runtime proof after decoding, not raw
JSON bytes or replay-derived commit caches: whitespace and object-member order
are irrelevant. All accepted first-seen entries are retained, which closes
replay-ID uniqueness only for this one genesis recovery result and costs memory
proportional to the unique prefix.
The genesis API accepts exactly one log ID and sequence from one. Changing a
log ID never resets sequence or replay scope. The compact runtime anchor binds
the covered sequence, all prior replay identities, and one distinct successor;
it still cannot restore an arbitrary externally supplied checkpoint tail.

`LocalLogRecoveryError::SequenceExhausted` is implemented by successor
recovery when an anchor has no next sequence. A v0.0.23 genesis vector must fit
a `u64` physical count and begin at one, so the current public in-memory
conversion path cannot construct the required `u64::MAX` anchor. Local Log
Checkpoint V1 also cannot materialize it without `u64::MAX` exact tombstones,
so this error remains a defensive terminal-state contract rather than a
practically reachable public state under finite limits.

### Compact checkpoint-linked successor recovery

`RecoveredLocalLog::try_into_checkpoint_anchor` is a consuming in-memory
compaction boundary. It requires a successor `LocalLogId` distinct from the
caller-declared sealed active generation. The core does not prove that storage
contains no later old-generation entry or fence another writer. Rotation
consumes no event sequence. An empty prefix therefore binds `covered = None`
and `next = 1`; its two IDs remain
caller-authoritative because no entry proved either one. Equal IDs fail with
`GenerationNotAdvanced` and, like other owned recovery failures, return no
session.

Successful conversion publishes `LocalLogCheckpointAnchor`. The anchor owns
the exact `EditorSession`, including redo position and an open merge group; the
session ID; sealed and successor generation IDs; covered/next sequence; and a
deterministically ordered `ReplayId -> LocalLogSequence` tombstone for every
first-seen prefix event. It drops the old full `LocalLogEntry` and embedded
Commit V1 proofs. Its debug output includes only identities, fixed-width
counters/frontiers, revision, and history depths. Encoding `anchor.session()`
with `SessionCheckpointJsonCodec` is permitted but does not encode or restore
the anchor: Session Checkpoint V1 contains none of its log metadata or replay
tombstones.

`LocalLogCheckpointAnchor::recover_successor` consumes the anchor and one
complete vector of independently decoded entries. Its deterministic order is:

1. Admit the complete physical observation count under the supplied successor
   limits before applying an event.
2. Require the checkpoint session ID and bound successor log ID. A raw entry
   from the sealed generation fails membership before replay lookup.
3. Reject a replay ID present in the compacted map with
   `CompactedReplayId`, including its checkpoint-represented sequence. This
   happens before sequence, budget, or application checks. It is never reported
   as an exact retry: the old proof needed to establish equality was
   deliberately dropped or was never supplied by durable restoration.
4. Consult the active-batch replay index. Exact same-sequence, same-kind,
   same-durable-proof retries skip; changed reuse fails with `ReplayConflict`.
5. Require every unseen entry at the exact session-global next sequence carried
   from the checkpoint. Generation rotation never creates sequence space.
6. Charge successor-batch unique-event and authoritative operation limits,
   apply privately, then retain the complete active entry.

Success returns `ContinuedLocalLog`, which owns the final session, compacted
tombstones, full first-seen successor entries and index, both generation IDs,
both sequence frontiers, and successor-batch counters. An empty successor batch
is valid and changes nothing. The type intentionally has no second transition
method, so all retained replay state is bounded by one previously admitted
prefix plus one independently bounded successor batch. `into_session` drops
both kinds of replay protection.

Any successor error drops the consumed anchor and privately applied prefix and
returns no session. The operation is atomic at this Rust publication boundary,
not against allocation failure, panic, abort, or process crash. The API does
not provide incremental append or retry after a failed batch. Local Log
Checkpoint V1 allows a host to reconstruct the consumed anchor from trusted
bytes before retrying, but does not make that storage durable or single-owner.

The tombstone policy preserves exact at-most-once application but changes old
retry handling deliberately. A compacted ID is always rejected because the
core cannot distinguish a byte-different conflict from a semantically exact
retry without retaining the old proof. Hashes and probabilistic filters would
not preserve exactness. Indefinite exact replay membership for opaque IDs also
cannot use constant space: repeated compaction needs a hard lifetime event cap,
an externally authoritative exact replay store, or a proved retry-expiration
fence. None is selected yet.

### Local log checkpoint V1

Local Log Checkpoint V1 is the complete durable representation of one
`LocalLogCheckpointAnchor`. It requires exactly eight fields regardless of
input member order. The deterministic encoder emits this order:

```json
{
  "format": "breditor/local-log-checkpoint",
  "formatVersion": 1,
  "sessionId": "session-01",
  "checkpointLogId": "generation-01",
  "successorLogId": "generation-02",
  "coveredThrough": "2",
  "replayTombstones": ["request-01", "request-02"],
  "sessionCheckpoint": {
    "format": "breditor/session-checkpoint",
    "formatVersion": 1
  }
}
```

The abbreviated nested object above denotes one complete Session Checkpoint V1,
not a literal two-field value. The outer format explicitly pins that nested
version at compile time and checks its header at runtime. A future active
session-checkpoint codec cannot silently change this composition; the outer
format must retain a V1 implementation or increment its own version.

`replayTombstones` is the complete record-declared chronological replay-ID
vector for the compacted prefix. Position is authoritative within the record:
`replayTombstones[0]` maps to sequence one, and element `n - 1` maps to
sequence `n`. IDs are not sorted lexicographically. Encoding a separate
sequence on every element would repeat information and create additional
malformed permutations without adding integrity, so V1 omits it. V1 also omits
a tombstone count and `nextSequence`; the vector length and checked successor
of `coveredThrough` derive them.

The topology laws are exact:

- `checkpointLogId` and `successorLogId` are distinct;
- `coveredThrough: null` requires an empty tombstone vector, and an empty
  vector requires `null`;
- a non-null frontier uses the canonical nonzero decimal-string `u64` grammar
  and equals the vector length;
- every tombstone is a valid `ReplayId` and all tombstones are unique; and
- an empty frontier requires the decoded session to have no retained undo,
  redo, or open merge-group behavior. A nonempty prefix may legitimately have
  empty history after ignored-history commits or explicit history clearing.

`LocalLogCheckpointJsonCodec` cannot be created from context alone. It also
requires a `LocalLogCheckpointBinding` containing the expected session, sealed
generation, and successor generation. That binding must come from trusted host
configuration, an authorized manifest, or an already selected storage slot;
constructing it from the same untrusted JSON defeats the boundary. Decode
checks all three encoded identities against it before allocating or replaying
the nested session. Hosts must never use an unchecked wire `sessionId` or
`successorLogId` to choose tenant authority, permissions, a storage root, or a
filesystem path. The binding proves equality with caller authority, not the
authenticity of either value.

Decode order is fixed:

1. Enforce the complete input byte cap from `EditorContext`.
2. Route the outer format and version, then require the complete strict shape.
3. Reconstruct bounded identities and the canonical nullable frontier.
4. Require distinct generations and equality with the trusted binding.
5. Reject a claimed frontier above the host tombstone limit before scanning
   individual elements.
6. Stream-count the tombstone array without allocating it, enforce the same
   limit, and require exact agreement with the frontier.
7. Decode identities directly into the final ordered lookup without reserving
   from an untrusted count, preflight escaped string size before allocation,
   and reject duplicates.
8. Require the explicit nested Session Checkpoint V1 header and replay-prove
   the complete bounded session under its separate host policy.
9. Enforce the empty-frontier history law and publish through a private checked
   anchor factory only after every field is owned together.

The default outer policy accepts at most 10,000 replay tombstones. Its nested
`SessionCheckpointLimits` independently controls capacity, aggregate history
operations, and retained state summaries. Both encode and decode apply these
policies. The whole outer value must fit the context JSON cap even when its
nested session is separately encodable under that same cap. A two-pass
tombstone scan and directly built lookup avoid reserving from an untrusted
frontier or array hint; this is an admission safeguard, not a fixed peak-memory
guarantee.

A complete frontier of `u64::MAX` would require `u64::MAX` arbitrary replay IDs.
No finite bounded implementation can materialize that exact set. Under ordinary
finite policies, V1 therefore rejects the claimed frontier as a resource excess
before allocation. It never accepts a sparse terminal shortcut. If terminal
restoration becomes a real product requirement, the replay-retention contract
must change explicitly rather than weakening this format's exact membership
claim.

Most importantly, strict decoding proves internal shape, not historical truth.
An attacker who can alter bytes can replace a real tombstone with a fake ID
while preserving cardinality, which can allow the omitted old ID to apply
again. The attacker can also splice any independently valid Session Checkpoint
V1 onto any same-shape tombstone prefix. The record carries no event kinds or
payload proofs after compaction, so the core cannot establish that the session
was causally produced by those replay IDs. Decoding the same valid record twice
also creates two independent in-memory owners.

Consequently, exact at-most-once behavior after reload is conditional on
integrity-protected trusted checkpoint bytes, rollback/freshness policy, and
single-owner writer fencing. V1 supplies no checksum, MAC, signature,
authentication, authorization, provenance, causal event proof, retry-expiry
proof, storage durability, atomic replacement, or crash recovery. It also
cannot prove that the sealed generation has no later entries or that the bound
successor is unused. Those are later storage and lifecycle gates.

The format separates four concepts that other editors often keep in different
runtime layers: log order, retry identity, undo grouping, and serialization
version. CKEditor operations and batches are a useful example of separating
document version from undo grouping; ProseMirror's authority demonstrates
fail-closed base-version ordering; and Lexical explicitly keeps its editor
state rather than DOM as source of truth. Their collaboration and history
protocols are not adopted here. In particular, ProseMirror client IDs are not
durable idempotency keys, Lexical history stacks are not an append log, and
Tiptap/Yjs collaboration updates solve a different multi-writer problem.

The entry format by itself is only one event envelope and enforces none of the
batch laws above. Genesis and one-successor recovery establish contiguous
order, membership, replay protection, and applicability only for their supplied
decoded vectors. The runtime anchor establishes in-process prefix linkage and
fail-closed cross-generation reuse rejection, and Local Log Checkpoint V1 gives
that anchor a strict durable value representation. These layers do not
establish idempotent append, framing, complete-frame versus torn-tail
classification, append/flush/fsync/ack order, atomic file compaction, repeated
generations, migration, checksums, hashes, signatures, authorization, rollback
protection, or writer fencing. IDs and sequence remain unauthenticated
assertions, not revisions or content hashes.
Commit-bearing entries also repeat Commit V1's complete before state, so a
naive tail costs roughly entry count times document size. Filesystem durability
belongs to a platform adapter; a browser/Wasm host cannot inherit native
`fsync` semantics from this deterministic crate.

## Next gate

Define one consuming repeated-compaction transition from `ContinuedLocalLog`
to a new `LocalLogCheckpointAnchor`. It must merge the previous compacted
tombstones with every active-generation replay ID, bind a new distinct
successor generation, preserve the session-global sequence and complete
history, and publish nothing on failure. A host-authoritative lifetime limit
must bound the cumulative exact tombstone set before any full active proof is
dropped; per-batch limits must not accidentally reset at each rotation. The
result must remain encodable by unchanged Local Log Checkpoint V1.

That repeated in-memory transition still does not make file replacement
durable. Framing, migration, integrity and optional authenticity, authorization
ownership, atomic checkpoint/log replace and append/flush/fsync/ack behavior,
crash-tail detection/truncation, incremental continuation, retry reconstruction
after failure, rollback protection, and multi-writer fencing remain separate
storage-layer gates.
The log must not silently treat optimistic operation guards or caller-owned
lineage/revision values as exactly-once delivery. Browser `beforeinput`,
composition ownership, IME buffering, and paste chunking remain adapter
concerns. Presentation metadata stays outside the deterministic core;
subscriber lifecycle, catalog replacement, backpressure, and coalescing still
require a separate contract before exposing an observer API.
