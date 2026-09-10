# Rust data contract

Status: Document V1, Base Schema V1, and Session Checkpoint V1 are supported on
the `0.1.x` browser path. Document V2 and Session Checkpoint V2 are supported
only through the exact same-version `0.2.x` package-root compiled-profile path; other formats
in this proof kernel remain experimental unless
[`COMPATIBILITY.md`](COMPATIBILITY.md) explicitly includes them.
The complete fingerprint-bearing V2 record graph was implemented as the
experimental Rust-only `0.2.0-alpha.2` boundary. `0.2.0-alpha.3` adds the sealed
base-text schema compiler and generic property-free inline-format behavior;
`0.2.0-alpha.4` compiles manifest-owned toggle bundles into one immutable Rust
editor profile. `0.2.0-alpha.5` carries that profile through the guarded engine
and Wasm ABI 3, including explicit V2 fresh/restore factories. The Alpha.6
implementation consumes that existing Rust contract in a profile-aware
browser AST/render/clipboard/export path and adds profile-bound IndexedDB outer
records; it does not widen any Rust V1 or V2 codec. Alpha.7 adds the built-in
strong-format intent route and the supported descriptor-validated browser
intent/toolbar path without widening any Rust V1/V2 codec or Wasm ABI 3.
`0.3.0-alpha.1` adds Rust-only typed inline-format property declarations,
validation, fingerprinting, and retained-resource accounting. It does not widen
Wasm ABI 3 or the supported browser path.
The alpha.2 Rust core added explicit typed set/remove input,
property-aware paragraph-local `TextSplice` insert/delete/format paths, exact
relocation and undo/redo, and caller-selected Operation, Editor State,
Transaction Request, Commit, and Session Checkpoint V3 codecs. These V3 state
families retain Document V2. At that alpha.2 checkpoint, Wasm ABI 3 and the
browser path remained property-free.

The unpublished `0.3.0-alpha.5` source checkpoint retains the alpha.3 typed
transport through the separately selected Wasm ABI 4 Profile Bootstrap V2 path. Its
profile factories explicitly select Document V2 plus Session, Editor State,
and Commit V3; typed action and intent JSON, descriptors, projections, and the
browser's V3 restore/autosave path preserve property values. The existing
exact-base V1 and Bootstrap-V1/Session-V2 paths remain separately available.
Alpha.4 added no Rust data contract or Wasm method. It corrected the generic
toggle capability gate so collapsed and same-paragraph property-free toggles
use the already defined property-preserving `TextSplice` path; cross-paragraph
toggle remained structural and closed at that checkpoint. Its browser-owned
`safeLinkV1` policy is the sole property-to-DOM mapping, and its reference Link
form calls the existing typed intent boundary. Alpha.5 makes the existing
`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` records validate and
preserve typed inline-format instances and lifts their built-in action paths.
Wasm ABI 4, Profile Bootstrap V2, schema fingerprints, Document V2, and all V3
record format numbers remain unchanged. Local Log V3, arbitrary attribute/CSS
mapping, rich paste, and native typed toolbar controls remain unsupported.
Document format: `breditor/document`, explicit versions `1` and `2`
Operation format: `breditor/operation`, explicit versions `1`, `2`, and `3`
Transaction-request format: `breditor/transaction-request`, explicit versions
`1`, `2`, and `3`
Editor-state format: `breditor/editor-state`, explicit versions `1`, `2`, and
`3`
Commit format: `breditor/commit`, explicit versions `1`, `2`, and `3`
Session-checkpoint format: `breditor/session-checkpoint`, explicit versions
`1`, `2`, and `3`
Local-log-entry format: `breditor/local-log-entry`, explicit versions `1` and
`2`
Local-log-checkpoint format: `breditor/local-log-checkpoint`, explicit versions
`1` and `2`
Local-log-frame format: binary `Local Log Frame`, explicit versions `1` and `2`
Storage-generation validation format: `breditor/local-log-storage-generation`,
explicit versions `1` and `2` (experimental and outside the supported
package-root compatibility promise)
Initial storage-root format: `breditor/local-log-storage-root`, explicit
versions `1` and `2` (experimental and outside the supported package-root
compatibility promise)
Base schema: `breditor/base`, version `1`

## Boundary

The implemented Rust slice owns:

- the canonical immutable AST and validated `Document`;
- manifest-owned, canonically ordered `InlineFormatSpecV1` declarations with
  independent nonzero persisted type revisions and optional closed typed
  `InlineFormatPropertyContractV1` adjuncts, plus a
  sealed compiler that combines one resolved extension set with a caller-owned
  non-`breditor/*` `SchemaId` while retaining the built-in base-text shape;
- immutable manifest-owned `InlineFormatToggleSpecV1` bundles and an immutable
  `CompiledEditorProfile` that co-owns the resolved extension set, compiled
  schema, generated action registry, intent router, and action-state catalog
  under one fresh opaque Rust-local generation;
- immutable manifest-owned `InlineFormatSetSpecV1` bundles plus the
  registration-owned `SetInlineFormatAction` and exact
  `breditor/set-inline-format-input@1` complete-map set/remove input;
- exact proof-derived document measurements cached on each `Document`;
- snapshot-local points, document-aware point ordering, and directional range
  selections;
- `EditorContext`, `EditorState`, lineage-local snapshots, and pending typing
  formats;
- property-preserving paragraph-local `TextSplice`, direct-root
  `ParagraphSplit`/`ParagraphJoin`, and guarded root-text range replacement
  operations with closed exact content inverses;
- property-preserving Operation, Editor State, Transaction Request, Commit,
  and Session Checkpoint V3 codecs with bounded preflight and replay, while
  retaining Document V2 and leaving the local-log/storage graph at V1/V2;
- the frozen, strict Operation V1 JSON codec that preserves every
  optimistic guard and validates statically knowable schema and resource laws;
- the strict contextual Transaction Request V1 codec that binds ordered
  operation payloads and every state/metadata policy to one caller-supplied
  exact base;
- the strict contextual Editor State V1 codec that restores the complete
  snapshot, existing Document V1 value, selection, and pending-format option
  under one caller-supplied context;
- the strict self-contained Commit V1 codec that restores one before
  checkpoint, replays canonical forward operations, applies explicit result
  editor values, and publishes only the fully derived transition;
- the strict contextual Session Checkpoint V1 codec that restores one exact
  current state plus bounded chronological linear history, redo position,
  capacity, and merge continuity while deriving historical documents and
  inverses;
- the strict Local Log Entry V1 envelope that assigns independent durable
  session, append-generation, sequence, and retry identities to ordinary
  commits, undo/redo replays, and explicit history-boundary commands;
- a platform-neutral binary frame around exact Local Log Entry V1 bytes, with
  independent header and payload CRC-32C checks, a trusted active-tail binding,
  and allocation-free one-frame borrowed scanning;
- an owning active-tail cursor that derives framing context and binding from one
  `ContinuedLocalLog` and advances its generation-relative `u64` byte offset
  only with successful semantic admission;
- a consuming cursor-compaction boundary that returns the complete unchanged
  cursor on typed failure or keeps the next checkpoint anchor together with the
  accepted-prefix length and old Frame V1 limits on success;
- a bounded atomic local-log recovery boundary that proves one supplied
  genesis-anchored, uncompacted generation prefix, skips exact semantic
  retries, applies all five event kinds, and retains every accepted replay
  binding;
- a compact in-memory local-log checkpoint anchor that binds that recovered
  or codec-restored session to its declared sealed generation and sequence
  frontier, represents every claimed old replay identity as a tombstone, and
  opens one distinct successor generation without resetting history, sequence,
  or retry scope;
- fixed-policy checkpoint-linked successor admission that accepts either one
  recoverable observation at a time or one all-or-nothing complete vector, plus
  repeated consuming generation compaction under one cumulative replay ceiling;
- the strict, expected-binding Local Log Checkpoint V1 codec that atomically
  restores the anchor from one complete Session Checkpoint V1, generation
  boundary, sequence frontier, and record-declared chronological
  replay-tombstone vector;
- a separate alpha.2 V2 codec graph for Document, Operation, Transaction
  Request, Editor State, Commit, Session Checkpoint, Local Log Entry, Local Log
  Checkpoint, Local Log Frame, Storage Root, and Storage Generation; every JSON
  envelope carries an exact schema selector and fingerprint, nested generations
  are fixed, and runtime recovery, tail, compaction, selected-storage, and
  root/generation-preparation paths retain and compare that binding; V2 does not
  yet enter the V1 publication-attempt lifecycle;
- non-destructive structural admission from a checked compact checkpoint into
  an unchanged target-validated AST, fresh lineage and local session, empty
  history, exact V2 checkpoint, and separately preparable V2 Storage Root;
- six bounded local-log storage identity/version values plus a trusted
  ordinary-rotation binding, a private-constructor non-`Clone` manifest, and a
  strict prior-linked storage-generation codec whose borrowed preparation and
  exact canonical encode/decode operations perform no storage I/O;
- distinct bounded database- and scope-incarnation IDs, a trusted initial-root
  binding, a private-constructor non-`Clone` root selection, and separate strict
  root preparation, encoding, and decoding actions;
- trusted selected receipt/checkpoint/active-generation bindings and strict
  normalization of either one root or one current rotation plus its immediate
  predecessor into a private-constructor non-`Clone` selected root that
  privately retains its complete checked binding, byte-exact current/optional-
  predecessor selections, and decoded checkpoint anchor, plus a public
  byte-exact envelope-validation action whose retained raw JSON access remains
  core-private;
- next-rotation preparation, encoding, and decoding validated against that
  selected root without retaining a complete predecessor-manifest chain;
- strict root/rotation attempt preparation that closes a complete prospective
  selected binding and exact canonical candidate JSON into private-constructor
  non-`Clone` `Prepared` state; root plans also bind explicit database and
  planned scope incarnations, while rotation plans snapshot the complete prior
  selected binding and `Arc`-share its exact current/optional-predecessor JSON
  without retaining the selected root or either checkpoint anchor;
- a process-local `Prepared -> Uncertain` attempt transition with a fresh
  core-issued opaque ABA-safe identity, one borrowed exact adapter-request view
  per physical attempt, cross-plan/stale-ID rejection, and consuming exact
  resubmission that preserves the retained plan allocations and bytes while
  issuing a fresh identity;
- a process-local exact physical-attempt terminal-attestation boundary with
  stable publication-completed, transaction-aborted, and not-attempted kinds;
  an opaque request ID emitted only with the one request; consuming observation,
  recoverable rejection that retains both owner and attestation, positive
  historical host evidence, and exact-plan-retaining negative physical states
  that can resubmit under a fresh identity;
- directional later-selected-binding comparison with only profile-valid
  `Retired -> Reclaimed` cleanup, exact formerly-active-to-retired/reclaimed
  validation under a distinct superseding head, and a closed
  `LocalLogStorageRetiredTransactionBinding` limited to tombstone-retained
  identity and byte-length facts;
- process-local root and rotation resolvers over the four surviving attempt
  states, with shape-specific request/evidence types, request identity minted at
  egress, exact ordinary-read terminal-complete or physical-database-absence
  terminal-open-error correlation, ownership-preserving stale-ID rejection and
  resolver restart, closed physical findings and semantic outcomes, source-
  aware absence/conflict precedence, and advisory exact resubmission only from
  the shape-valid non-host-committed absence outcome;
- a canonical nonzero, nonwrapping writer epoch; an exact cloneable mutation-
  fence binding with directional cleanup-aware comparison; checked non-`Clone`
  acquisition planning; and a separate process-local writer-fence acquisition
  lifecycle with one borrowed exact request, egress-created attempt/request
  correlation, three terminal host-attestation kinds, recoverable negative
  states, exact resubmission, and non-`Clone` revocable mutation-token issuance
  only from matching completion;
- a canonical fixed-width generation-relative storage chunk start and a pure
  non-`Clone` single-frame append plan that consumes one mutation token plus one
  active-tail cursor, validates their required session, generation, and frame-
  policy relationship,
  encodes and semantically admits one borrowed entry, and quarantines the exact
  frame with its speculative advanced cursor while typed failure returns both
  unchanged owners;
- a pure nonempty bounded append FIFO seeded only from that checked plan, with
  immutable host-selected pending-frame and encoded-byte limits, one token at
  the root, exact aggregate accounting, an immutable head, ordered followers,
  and one final speculative cursor; enqueue failure returns the complete
  unchanged queue while its shared view exposes no frame bytes or arbitrary
  follower view; enqueue success reports only its just-admitted frame metadata;
- a process-local uncertain append-head attempt entered before egress, with
  distinct attempt/request identities, one borrowed exact head request, exact
  allocation-preserving resubmission, and logical enqueue that preserves the
  attempt while no core-issued request exposes or authorizes a follower;
- attempt/request-correlated-as-appropriate append terminal attestations for
  transaction-completed, transaction-aborted, and not-attempted callbacks; a
  separate consuming
  acknowledgement that advances exactly one head; typed pending ownership that
  promotes the exact first follower; and a drained owner that owns and can
  release the token, final speculative cursor, and queue limits;
- a same-process append lost-callback resolver over uncertain, aborted, and
  not-attempted source owners, with honest optional append-request provenance,
  one borrowed request per invocation, exact resolution correlation, closed
  physical findings, core-derived retry/presence/indeterminate/collision/reset
  outcomes, logical enqueue that preserves both correlations, and a nominally
  separate consuming one-head acknowledgement family;
- atomic transactions, explicit selection/pending-format updates, typed
  metadata, relocation, and operation-relative change sets;
- immutable commits with helpers that construct undo and redo transactions;
- an immutable typed action registry with fail-closed identity conflicts,
  snapshot-bound capability preparation, and bounded cross-language inputs;
- a frozen semantic intent router with canonical priority/fallback behavior and
  exact-state-bound outcomes;
- one-call action observation contracts plus a frozen, bounded direct/routed/
  history action-state catalog, immutable exact-source batches, and a
  synchronous single-observation cache with bounded local deltas;
- seven semantic base actions: exact inline and structural plain-text
  insertion, paragraph break, grapheme-aware backward and forward deletion,
  exact selection deletion, and strong formatting, plus an explicitly
  registerable `ToggleInlineFormatAction` configured for one admitted
  property-free format kind and automatically instantiated by a compiled
  profile for each valid manifest-owned toggle bundle; and
- a synchronous exact-publication `EditorSession` with bounded deterministic
  linear undo/redo history and opaque history-observation identity;
- a product-level `EditorEngine` that exclusively combines one session and one
  frozen action registry behind complete engine-instance/state/history observation guards,
  returning sealed action, selection, undo, redo, history-close, and
  history-clear event kinds without exposing a mutable session, executable
  action preparation, or owned raw commit.

The following remain deliberately unimplemented:

- structural operations beyond direct-root base-paragraph text structure,
  including arbitrary block kinds, list changes, metadata conflict rules, and
  node movement;
- typed element or block properties and identities, cross-paragraph
  `SetInlineFormatAction`, arbitrary structural schema kinds, general property-
  driven rendering or native typed toolbar controls, custom extension actions
  or inputs, callback planners, cross-extension toggle targets, shared toggle
  routes, and fallback toggle routing;
- serialization, scalar exposure, or cross-compilation equality for
  `CompiledProfileGeneration`; native registry/router/engine APIs remain
  advanced bypasses outside compiled-profile correlation, while compiled-profile
  factories carry one opaque generation through Rust/Wasm observations and
  outcomes;
- asynchronous action-state delivery, dynamic catalog registration,
  presentation plugin lifecycle, generalized keymaps, and durable registry
  manifests (the browser now has a synchronous last-good state store and a
  bounded manifest-driven base toolbar);
- ordered tail I/O and recovery orchestration, process-restart append
  reconstruction, coordinated local-log/checkpoint replacement,
  durable restart continuation, cryptographic integrity or authenticity,
  rollback protection, migration, and crash-tail truncation;
- storage-generation initial provisioning, a general plan-level
  `DefinitelyNotCommitted` ownership state, process-restart plan reconstruction,
  transaction ownership typestate, adapter capabilities, authoritative-head
  integration, and an executable filesystem or IndexedDB adapter for that
  local-log profile (only the
  profile contract, pure-Rust values/attempt mechanics, process-local host
  terminal attestations, both resolver state machines, writer-fence comparison/
  planning, the process-local acquisition/token lifecycle, pure append
  preparation, the process-local bounded append FIFO, and its uncertain-head
  request, terminal-classification, and explicit one-head-acknowledgement
  boundaries exist);
- browser behavior beyond the lockfile-pinned desktop Chromium, Firefox, and
  WebKit matrix implemented at `0.0.59`; that matrix covers the public packaged
  runtime, unified event router, React integration, guarded clipboard, toolbar,
  and single-slot checkpoint profile, but its synthetic composition checks do
  not establish real operating-system IME or mobile-browser support;
- pre-publication `LocalLogEntry` schema/session/log/sequence/replay binding
  allocation plus ordering, uniqueness, and atomic append coordination around
  the guarded-engine classification projection;
- branching/selective undo, collaboration history, rebasing, CRDT/OT behavior,
  and remote presence; and
- generic subtree summaries and incremental validation for structural or
  custom-schema edits.

ProseMirror, Lexical, Tiptap, and CKEditor are design references only. This is
an original contract and does not adopt their node, transaction, plugin, or
collaboration protocols.

Version `0.0.32` implements only the bounded-value and strict ordinary-rotation
validation subset of the storage-generation transaction frozen in
[`STORAGE_GENERATION_TRANSACTION.md`](STORAGE_GENERATION_TRANSACTION.md). It
does not implement that transaction's authority, I/O, finality, or ownership
state machine.

Version `0.0.33` freezes the first concrete
[`breditor/indexeddb-local-log@1` profile](INDEXEDDB_STORAGE_PROFILE.md). It
chooses a distinct canonical initial root rather than a sentinel prior head,
normalizes root and rotation selections into one O(1) trusted current summary,
and specifies database/scope incarnations, exact current and immediate-prior
selection bytes, transaction/head/generation tombstones, one fixed atomic
transaction scope, revocable writer epochs, terminal-event evidence,
uncertain-outcome recovery, and payload cleanup. This profile remains a
specification rather than an executable adapter.

Version `0.0.34` implements the profile's pure Rust value subset: two distinct
incarnation-ID types; private root preparation/encoding/decoding; independently
trusted receipt and generation bindings; strict root/rotation normalization;
and next-rotation preparation/encoding/decoding against the normalized selected
root. The normalized value privately owns its checkpoint anchor and exposes
inspection facts only. O(1) means constant in rotation-history length, not in
input bytes or document size: rotation normalization still processes bounded
current and immediate-predecessor selection bytes. It strictly decodes both
nested checkpoints; the current checkpoint is decoded again to retain its
anchor. It performs no I/O and proves no provisioning, CAS/head currentness,
lifetime ID/fence freshness, empty-generation reservation, writer authority/epoch,
durability, commit evidence, or ownership release. No IndexedDB, JavaScript,
Wasm, or filesystem adapter exists, and these storage formats remain
experimental repository-internal contracts outside the supported package-root
compatibility promise.

Version `0.0.35` retains the complete checked selected binding and the exact
canonical current/optional-immediate-predecessor selection bytes in the
non-`Clone` selected root. Public callers can borrow the current and optional
predecessor receipt bindings, inspect the retained byte lengths, and ask the
root to validate caller-supplied exact envelope bytes. Direct access to the raw
retained selection JSON remains core-private. The selected root's `Debug` and
all exact-envelope errors remain payload-redacted. This closes a byte-identity
gap without adding storage authority, currentness, I/O, or commit evidence. Its
selection receipt bindings are caller-supplied validation facts.

Version `0.0.36` adds private-constructor non-`Clone` exact root/rotation
attempt plans and `Prepared`/`Uncertain` state. Plans retain a complete
prospective candidate binding and exact canonical candidate JSON; rotations
also retain the full prior selected binding and `Arc`-shared exact selected
current/optional-predecessor JSON without retaining a selected root or anchor.
`begin_attempt` issues a fresh core-owned, ABA-safe process-local identity
before one borrowed payload request can cross the boundary. Exact resubmission
preserves the plan allocations/bytes and issues a fresh identity. ID matching
is correlation only, and no transition classifies commit or noncommit.

Version `0.0.37` adds non-`Clone`
`LocalLogStorageAttemptTerminalAttestation`, whose stable kind is
`PublicationCompleted`, `TransactionAborted`, or `NotAttempted`. Consuming
`observe_terminal_attestation` accepts positive completion and abort only with
the exact opaque `LocalLogStorageAttemptRequestId` emitted by the one request,
while not-attempted instead names the attempt ID and is also legal before
egress. Rejection
preserves the complete unchanged owner and unapplied attestation. A publication
completion is a trusted host assertion about the exact publication-armed
transaction and becomes historical `HostAttestedCommitted`; abort and not-
attempted close one physical invocation only and retain the plan for exact
resubmission under a fresh ID. One ID names one invocation and at most one
associated publication transaction, so copied dispatches are outside its
correlation and require later storage resolution.

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

borrowed active-tail bytes + LocalLogFrameLimits + EditorContext
    -> clean end, valid partial-magic/header/payload truncation, or full header
    -> header CRC-32C before trusting version, flags, or payload length
    -> effective payload cap and checked valid-slice conversion
    -> exact payload CRC-32C without copying or semantic allocation
    -> publish one BorrowedLocalLogFrame and exact consumed/remaining slices

BorrowedLocalLogFrame + trusted LocalLogFrameBinding
    -> recheck the receiving codec's effective payload ceiling
    -> UTF-8 validation and the unchanged Local Log Entry V1 semantic decoder
    -> trusted session comparison before trusted active-generation comparison
    -> publish one independently valid LocalLogEntry or publish nothing

caller-authoritative empty-history EditorSession + expected session/log IDs
+ complete in-memory vector of independently decoded LocalLogEntry values
    -> admit the whole physical batch under host aggregate limits
    -> require exact session and active-generation membership
    -> classify retained exact replay bindings before sequence checks
    -> apply every first-seen event at the exact next sequence from one
    -> publish one RecoveredLocalLog with the session and replay index, or no session

RecoveredLocalLog + one distinct caller-supplied successor generation
+ host-selected LocalLogCompactionLimits
    -> validate generation, cumulative replay count, and complete topology by borrow
    -> return the unchanged owner beside a typed error, or bind its exact session/history
    -> replace every full prefix entry with ReplayId -> original sequence tombstones
    -> publish one LocalLogCheckpointAnchor carrying the lifetime policy

untrusted local-log-checkpoint JSON + trusted LocalLogCheckpointBinding
+ caller-supplied EditorContext and aggregate checkpoint policy
    -> whole-envelope byte cap, outer format/version routing, and exact shape
    -> checked identities, distinct generations, and trusted-binding equality
    -> allocation-free tombstone count and exact frontier/cardinality proof
    -> bounded chronological replay-ID validation and uniqueness proof
    -> pinned Session Checkpoint V1 replay proof
    -> empty-frontier genesis-history proof
    -> install the host codec's tombstone ceiling as runtime compaction policy
    -> publish one complete LocalLogCheckpointAnchor or publish nothing

LocalLogCheckpointAnchor + complete successor vector + fixed phase limits
    -> admit the complete physical batch before application
    -> require the bound session and successor generation on every observation
    -> reject any compacted ReplayId before sequence or application checks
    -> preserve exact duplicate/conflict handling among active-batch entries
    -> continue at the exact session-global sequence and checkpointed history state
    -> publish one ContinuedLocalLog with prefix tombstones and active proofs,
       or no session

LocalLogCheckpointAnchor + fixed phase limits
    -> begin one empty ContinuedLocalLog for the bound successor

ContinuedLocalLog + one independently decoded LocalLogEntry
    -> charge the cumulative observation budget before membership
    -> check session, active generation, compacted replay, active replay,
       sequence, unique-event budget, operation budget, then application
    -> publish Applied or ExactDuplicate with the next owner
    -> on typed rejection return the unchanged owner and exact rejected entry

LocalLogCheckpointAnchor + fixed recovery/frame limits
    -> begin one fresh successor owner and generation-relative byte offset zero
    -> derive and retain frame context, session, and active-log binding from the owner
    -> publish one LocalLogTailCursor without reading storage

LocalLogTailCursor + caller-asserted input origin + borrowed tail bytes
    -> require origin equality before inspecting bytes
    -> scan at most one frame under the cursor's fixed frame policy
    -> return unchanged clean-end or truncation status without admission
    -> checked-convert frame bytes and preflight the next u64 offset
    -> semantically decode under owner-derived context and binding
    -> consume ContinuedLocalLog::try_observe
    -> publish owner and offset together for Applied or ExactDuplicate
    -> on typed failure return the unchanged cursor and, after admission, the entry

LocalLogTailCursor + one new successor generation
+ inherited policy or explicitly reauthorized LocalLogCompactionLimits
    -> treat invocation as host authorization to stop admitting the old generation
    -> run the existing ContinuedLocalLog compaction precedence unchanged
    -> on typed failure return the complete unchanged cursor
    -> on success publish one LocalLogTailCompactionOutcome containing the next
       LocalLogCheckpointAnchor, old accepted-prefix length, and old LocalLogFrameLimits

LocalLogTailCompactionOutcome + explicit new recovery/frame limits
    -> separate runtime metadata from the next LocalLogCheckpointAnchor
    -> begin a freshly bound successor cursor at generation-relative offset zero

ContinuedLocalLog + one new successor generation
+ inherited policy or explicitly reauthorized LocalLogCompactionLimits
    -> reject the active and immediately preceding generation IDs
    -> charge prior tombstones plus active unique events against one cumulative ceiling
    -> validate the complete prior/active topology before moving a full proof
    -> return the unchanged owner beside a typed error, or merge active replay tombstones
    -> publish the next LocalLogCheckpointAnchor without resetting global sequence/history

EditorState + exact-state Transaction
    -> apply operations in order to private immutable intermediates
    -> relocate or explicitly set editor state
    -> publish one Commit or publish nothing

ActionInvocation + immutable ActionRegistry + exact EditorState
    -> decode one versioned bounded input
    -> Disabled(stable reason) or build one explicit ActionPlan
    -> preflight one compiler-supported base-text Transaction
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

EditorSession + exact-state Commit or Transaction
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
the private compiler-proved base-text local proof, is not serialized, does not
affect content
equality, and does not change document format version `1`. Decoding always
recomputes it through complete validation. It is derived metadata, not a
substitute for schema proof or evidence that the document satisfies a different
limit profile.

Each document privately records the exact runtime limit profile that proved it;
the JSON input-byte budget is excluded because it does not constrain a runtime
tree. In version `0.0.3`, a fixed-base `TextSplice` with a matching profile
gained one crate-private proof. Alpha.3 extends that optimization to the
compiler-minted base-text capability. The proof owns the path copy, validates
the actual post-seam paragraph, and updates root measurements with checked
arithmetic. A profile mismatch, unsupported schema/path, failed proof
consistency check, overflow, or possible limit violation sends the same
candidate root to complete validation. The fallback constructs no synthetic
report, so existing issue paths, ordering, and messages remain authoritative.

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
Version `0.0.26` adds repeated consuming compaction. A dedicated lifetime
policy is selected before the first full proof is dropped, inherited across
ordinary rotations, and checked against prior tombstones plus active unique
events. Typed compaction failure returns the unchanged owner; an explicitly
named transition can reauthorize a different cumulative ceiling. Rotation
preserves session/history and global sequence, merges exact replay tombstones,
rejects the active and immediately preceding generation IDs, and remains wire
compatible with Local Log Checkpoint V1. The wire does not persist the runtime
policy or older generation identities.
Version `0.0.27` adds recoverable, one-observation admission for a
checkpoint-bound successor generation. `begin_successor` selects one fixed
aggregate recovery policy and publishes an empty active owner; each consuming
`try_observe` either returns the next owner plus an applied/exact-duplicate
outcome or returns the complete unchanged owner, exact rejected entry, and
typed error. Counters, replay bindings, global sequence, session, and history
are published together. Complete-vector successor recovery delegates to the
same observation engine after retaining its historical whole-vector admission
check and all-or-nothing failure contract. This checkpoint adds no wire-format
change, durable append, queue, acknowledgement, or fresh-genesis incremental
API.
Version `0.0.28` adds Local Log Frame V1, an original fixed-header binary frame
around exact Local Log Entry V1 UTF-8 bytes. A dependency-free CRC-32C over the
header catches accidental length-field corruption before it can be classified
as a torn payload; a second CRC-32C covers the exact payload. The scanner is
allocation-free, reads at most the first frame, distinguishes clean end,
matching truncation, malformed/corrupt structure, and a complete borrowed
frame, and returns exact consumed and remaining slices. Semantic decoding stays
in the existing entry codec and then checks a separately trusted session and
active-generation binding. This is accidental-corruption framing, not
authentication, append durability, truncation authority, storage recovery, or
event acceptance.
Version `0.0.29` adds a consuming active-tail cursor that couples one
`ContinuedLocalLog`, an internally owner-derived frame codec, and a checked
generation-relative `u64` accepted byte offset. Its primary anchor transition
starts a fresh successor at offset zero. Each step verifies the caller-asserted
input origin, scans at most one frame, preflights offset arithmetic, decodes,
and attempts semantic admission; only joint success publishes the next owner
and offset. Applied events and exact semantic duplicates both advance by their
actual frame length. Clean end, truncation, and every typed failure preserve
the cursor; admission failure also retains the decoded entry. This remains
synchronous in-memory orchestration, not byte provenance, storage, durability,
acknowledgement, or tail-wide recovery.
The cursor, accepted offset, recovery limits, and frame limits have no durable
encoding and do not change Local Log Entry V1, Frame V1, or Checkpoint V1.
Version `0.0.30` adds consuming compaction directly to that cursor. Ordinary
`try_into_checkpoint_anchor` inherits the owner's cumulative replay-tombstone
policy; `try_into_checkpoint_anchor_with_compaction_limits` is the explicit
reauthorization edge. Typed failure returns the complete unchanged cursor under
the existing compaction error and precedence. Success returns one
`LocalLogTailCompactionOutcome` that keeps the next anchor, old generation's
accepted-prefix length, and old `LocalLogFrameLimits` together. Calling the
transition authorizes abandonment of any unobserved suffix but establishes no
EOF or storage fact. Beginning the next cursor remains a separate transition
with explicit recovery/frame limits and offset zero. This adds no wire version
and does not serialize cursor-compaction metadata in Local Log Checkpoint V1.
Version `0.0.31` is specification-only. It reserves the unimplemented name
`breditor/local-log-storage-generation` and a proposed V1 manifest shape without
making a permanent wire-compatibility promise. The specification requires one
authoritative manifest/head compare-and-swap per storage scope and associates
exact canonical Checkpoint V1 JSON with the old accepted prefix, explicit old
and successor Frame V1 limits, derived session/sealed/successor IDs, bounded
profile/scope/transaction/head/fence identities, and an unpersisted adapter
capability. It freezes `Prepared`, `DefinitelyNotCommitted`,
`HostAttestedCommitted`, and `Uncertain` ownership, byte-identical retry, and
separate native-versus-IndexedDB profile obligations. No Rust storage value,
codec, typestate, receipt, adapter, or I/O API is added. Recovery, compaction,
and checkpoint limits remain runtime policy; Checkpoint V1 and Frame V1 are
unchanged.
Version `0.0.32` implements only that specification's bounded value and strict
ordinary-rotation validation layer. It adds six storage identity/version types,
an independently trusted binding, a private-constructor non-`Clone` manifest,
independent limits, and separate borrowed preparation, canonical encoding, and
strict decoding actions. It adds no seed manifest, adapter capability, receipt,
I/O, compare-and-swap, durability, or ownership-release typestate.
Version `0.0.33` is specification-only. It freezes the concrete
`breditor/indexeddb-local-log@1` profile and the proposed
`breditor/local-log-storage-root@1` value. The profile uses a distinct first
root, O(1) current selection, database/scope incarnations, a unique committed-
head index, exact current/immediate-prior receipts plus permanent identity
tombstones, checkpoint-only and active generation reservations, revocable
writer epochs checked on every mutation, and serialized uncertain-outcome
resolution. IndexedDB `complete` proves historical commit, not stable
currentness or permanent durability. No new Rust type or executable browser
adapter is added.
Version `0.0.34` implements the profile-independent Rust values needed to
validate that selection boundary: database/scope incarnation IDs, strict
private root values/actions, trusted selected receipt and generation bindings,
root/rotation normalization, and selected-root-aware validation of the next
ordinary rotation. It still adds no platform I/O, storage attempt evidence,
authoritative-head integration, provisioning, writer authority, or ownership
release. Its O(1) restart claim concerns rotation-history length only; bounded
selection/checkpoint bytes and the represented document/session are still
decoded.

Version `0.0.35` makes the normalized selection byte-exact after validation. It
retains the complete selected binding and exact current/optional-predecessor
canonical selection strings, exposes borrowed receipts and byte lengths, and
adds payload-redacted exact-envelope validation without exposing the retained
raw strings or adding storage authority.

Version `0.0.36` implements non-`Clone` exact root/rotation attempt plans and
private-constructor `Prepared`/`Uncertain` state. Preparation fixes the complete
candidate binding and exact candidate JSON; a rotation also snapshots the
complete prior selected binding and shares its exact selected JSON without
retaining the selected root or checkpoint anchor. The core creates one opaque
process-local attempt identity before one borrowed request view can be emitted.
Exact resubmission preserves the plan and bytes under a fresh identity. This is
correlation and conservative uncertainty only, not I/O, authority, currentness,
terminal evidence, durability, or ownership release.

Version `0.0.37` implements typed host terminal observation for one exact
physical attempt. A matching, publication-armed `PublicationCompleted`
attestation creates historical commit evidence; `TransactionAborted` and
`NotAttempted` retain the exact plan as unresolved physical-only states and may
resubmit it under a fresh ID. Rejected observations recover both the unchanged
owner and unapplied attestation. The core does not verify browser-event
provenance, associate duplicate dispatches with the same ID, resolve storage,
survive process loss, or release authority or ownership.

Version `0.0.38` adds directional same-selection and formerly-active retirement
comparisons plus the record-shaped retired-transaction binding. These values
allow only `Retired -> Reclaimed` cleanup, require a distinct superseding head
for active retirement, and retain only tombstone facts including stored byte
length. They compare caller-supplied typed values only: they do not compare
selection JSON, observe storage, validate keys, indexes, or complete range
scans, authenticate resolver transaction completion, classify commit, or
release authority.

Version `0.0.39` implements the root-only process-local resolver state machine.
It consumes one surviving root attempt state, emits at most one borrowed
request per resolver invocation, and accepts terminal evidence only with the
opaque request ID minted at that egress. Ordinary read evidence is a trusted
host assertion that the exact fixed-scope serialized transaction emitted
terminal `complete` after all reads and scans. Physical database absence instead
requires a versionless open to report `oldVersion == 0`, synchronously abort its
upgrade, and emit terminal open-request `error`. Pre-egress or stale/cross-
request evidence returns the unchanged resolver and unapplied evidence;
`restart_resolution` preserves the source plan and bytes while clearing
correlation and making old evidence stale. Neither identity nor state survives
process restart.

The root resolver validates a closed physical observation against the exact
plan before producing one of seven semantic outcomes. Clean planned-scope
absence is advisory retry eligibility only for uncertain, aborted, or
unattempted sources; for `HostAttestedCommitted`, missing/replaced scope lifetime
is reset/indeterminate and can never retry. Physical database absence, a
different valid metadata incarnation, or a schema-compatible database without
`meta/profile` and with all five stores empty is reset/indeterminate for every
source. Any record in any store without valid profile metadata is collision/
corruption, as is a still-present expected scope with its append-only candidate/
index association missing. Only retry eligibility preserves exact resubmission
under a fresh attempt ID, and a later attempt must repeat every comparison and
authority check. No outcome authenticates IndexedDB, proves durability or
stable currentness, or releases ownership.

Version `0.0.40` implements the nominally separate process-local rotation
resolver. It retains the exact candidate plus snapshotted prior selected
envelope, uses its own request/evidence correlation, and applies the same
ordinary terminal-`complete` versus physical-absence terminal-open-`error`
split. Within the intact expected scope, exact prior-selection plus complete
candidate namespace absence is advisory retry eligibility only for uncertain,
aborted, or unattempted sources. The same absence after
`HostAttestedCommitted` is collision/corruption; one exact direct competing
rotation is a nonretry conflict only for the three non-host-committed sources.
Selected, superseded, and retired outcomes validate branch-specific bytes,
indexes, generation transitions, and required tombstones. No rotation outcome
releases ownership or authenticates its host observation.

Version `0.0.41` implements a canonical nonzero, nonwrapping `u64` writer epoch,
an exact mutation-fence binding over the full selected binding plus `Arc`-shared
current/optional-predecessor JSON and writer pair, and a checked non-`Clone`
acquisition plan. Directional comparison accepts only `Retired -> Reclaimed`
cleanup; plan preparation derives exactly the next epoch, requires the proposed
fence to differ from the current fence, and returns both unchanged inputs on
failure. These are non-authority values: they provide no storage provenance,
atomic co-observation, request, terminal evidence, token, CAS, browser adapter,
owner release, or append.

Version `0.0.42` implements a separate process-local acquisition lifecycle.
The checked plan begins under a fresh opaque attempt ID; its first borrowed
adapter request creates an opaque request ID and exposes the complete expected
binding, exact retained selection JSON, expected writer pair, and planned next
pair. Completion and abort host attestations require that emitted request ID;
not-attempted names the attempt. Consuming observation rejects mismatched or
pre-egress transaction evidence without losing the owner/evidence, retains
negative outcomes for exact fresh-identity resubmission, and creates a
non-`Clone`, nonserializable revocable mutation token only on matching
completion. The token is historical trusted host evidence and must be rechecked
inside each protected storage transaction. No adapter or append is added.

Version `0.0.43` implements only pure preparation for one token-authorized
append. It consumes a mutation token and active-tail cursor, validates the
selected session/checkpoint/active-generation and Frame V1 relationships,
encodes one exact frame, checks its generation-relative byte range, and admits
that frame through the existing semantic cursor transition. Success owns the
exact frame and a quarantined speculative post-cursor in a non-`Clone` append
plan; typed failure returns the unchanged token and cursor. The plan is neither
an adapter request nor evidence of I/O, acknowledgement, terminal completion,
or durability.

IndexedDB Profile V1 now fixes one complete Frame V1 with no trailing bytes per
chunk value. The fourth key component is the canonical twenty-digit
generation-relative `chunkStart`: zero for the first frame and, thereafter,
the prior start plus the prior complete value length. A future append
transaction must recheck the full token binding and exact storage tail end;
rotation must compare that same tail end with `acceptedPrefixBytes` in its own
serialized transaction. These decisions add no executable adapter or resolver.

Version `0.0.44` implements the pure nonempty bounded FIFO around checked
append plans. `LocalLogStorageAppendPlan::try_into_queue` applies immutable
`LocalLogStorageAppendQueueLimits`, checking the frame-count ceiling before the
aggregate encoded-byte ceiling. Its defaults are 1,024 frames and 64 MiB;
either ceiling may be zero. Start rejection returns the exact unchanged plan,
while success preserves the token, speculative cursor, and frame allocation as
the distinguished head.

`LocalLogStorageAppendQueue::try_enqueue` borrows another entry, checks pending-
frame arithmetic and policy, encodes one exact frame, checks frame and pending-
byte arithmetic and policy, then semantically admits those bytes at the final
speculative tail. Success adds the same allocation at the back without changing
the head and returns a step with that new frame's range, byte length, and
admission outcome. Failure returns the complete unchanged queue and leaves the
entry caller-owned. The queue exposes exact count/byte totals and remaining
capacity, the final speculative cursor/end, and only head
start/end/length/admission metadata. It exposes no raw frame, follower
selection, removal, request, acknowledgement, cursor release, or rotation edge.
The bounded metadata returned by one successful enqueue describes only that
causal admission and does not create a persistent or arbitrary follower view.

The original token is retained once at the queue root for the whole sequential
speculative prefix. It is not presumed current: each future physical head
append must still compare its complete binding transactionally. A future
uncertain-head state must keep accepting logical tail entries, but all physical
followers remain without core-issued request authorization until that exact
head is resolved. The implementation
has no append attempt/request/terminal lifecycle, resolver, restart form,
drained state, or durable FIFO acknowledgement yet.

These limits count only exact encoded frame bytes and frame slots. They do not
bound the speculative cursor's editor session, history, replay indexes, decoded
entries, queue/`Arc` metadata, or allocator overhead. Dropping the queue is
possible but has no contract meaning: it is neither cancellation nor
acknowledgement and loses the volatile speculative branch. Enqueue materializes
one exact candidate before checking aggregate retained-byte capacity, so
transient peak memory can exceed that ceiling. Allocation failure, process
restart, and rebasing or extracting a queue whose token became stale remain
outside this version's typed recovery.

Version `0.0.45` consumes the complete queue into
`LocalLogStorageUncertainAppendAttempt` before any head request can cross the
adapter boundary. Its fresh append-attempt ID exists before egress. The first
`adapter_request` call permanently records egress, mints a separate request ID
for one adapter invocation and at most one append-capable transaction, and
returns one non-`Clone` borrow exposing only the head. That request carries the
full expected mutation-fence and selected bindings, byte-exact current and
optional predecessor selection JSON, expected writer epoch/fence, canonical
head start and end, and exact complete Frame V1 bytes. Payload bytes are
copyable and sensitive but are redacted from `Debug`; no API property proves
single external dispatch.

Every invocation must re-observe and compare the complete binding and exact
selection bytes, then validate the serialized physical tail. Only the absent
target at the exact tail or the same key and byte-identical final frame is
admissible; different bytes, gaps, overlaps, malformed records, or any later
record fail closed. A returned request, IndexedDB request success, or
`commit()` return is not terminal append evidence. Exact resubmission issues a
fresh attempt ID but preserves the queue, token, head/follower allocations,
limits, and final speculative cursor exactly. It neither refreshes a stale
token nor proves the old request stopped; the old transaction may still commit,
so same-key/same-bytes idempotency is required.

Logical enqueue can continue both before and after egress while preserving the
attempt/request IDs; only the private speculative tail advances, and no
core-issued request exposes or authorizes a follower. Version `0.0.45` has no
terminal attestation, explicit head acknowledgement, head pop, drained owner,
cursor release, resolver, transition from a drained owner into rotation, or
restart reconstruction. Those remained the next implementation gate at that
checkpoint. Drop or process loss cannot
decide whether copied/dispatched work committed and loses the owner and
volatile IDs. All `0.0.44` byte-ceiling
exclusions and transient candidate-allocation behavior remain in force. Profile
V1 exact-tail validation may scan every active-generation chunk, and its fixed
five-store scope serializes otherwise independent editor scopes.

Version `0.0.46` adds
`LocalLogStorageUncertainAppendAttempt::observe_terminal_attestation` and the
current `LocalLogStorageAppendTerminalAttestationKind` variants:
`TransactionCompleted`, `TransactionAborted`, and `NotAttempted`.
Completed/aborted evidence names the exact emitted request; not-attempted names
the attempt and is legal before or after request egress. Correlation checks use
fixed precedence: attempt-ID mismatch, then, for request-bearing evidence,
request not issued and request-ID mismatch.
`LocalLogStorageAppendTerminalFailure` retains the complete unchanged
uncertain owner and exact supplied attestation on rejection. The callback is a
trusted Profile V1 attestation, not independently authenticated physical
evidence, and the terminal API accepts no raw encoded frame payload.

A matching `TransactionCompleted` produces only
`LocalLogStorageAppendTerminalOutcome::HeadPresent`. The adapter may attest it
only after the complete strict five-store transaction reaches terminal
`complete` and the serialized active-generation tail has one exact qualifying
shape: either the target was absent at the exact previous tail and the exact
requested frame was added, or the target already was the byte-identical exact
final tail record. Individual request success, a `commit()` call, a partial
store update, different bytes, a gap, overlap, malformed record, or later tail
record cannot qualify.

`HeadPresent` deliberately retains the queue until the separate consuming
`LocalLogStorageAppendHeadPresent::acknowledge_head` action. One call removes
exactly one head and returns
`LocalLogStorageAppendHeadAcknowledgementOutcome`. `Pending` owns
`LocalLogStorageAppendHeadAcknowledged`, promotes the allocation-identical first
follower, preserves order, token, final speculative cursor, and limits, and
decrements count and bytes by exactly the acknowledged head. A new attempt,
request, and matching completed attestation are required before that next head
can be acknowledged. `Drained` owns
`LocalLogStorageAppendQueueDrained`, its token, final cursor, limits, and
acknowledged request/head metadata. It is the only successful append edge that
releases the final cursor. The host cannot select a follower or choose what to
pop.

`AttemptAborted(LocalLogStorageAppendAttemptAborted)` and
`NotAttempted(LocalLogStorageAppendNotAttempted)` advance nothing. Their typed
owners retain the allocation-identical complete queue for exact resubmission
under a fresh attempt ID with restored one-shot request eligibility. A copied
request can outlive a negative attestation and still commit; exact-key/exact-bytes idempotency therefore
remains mandatory. The token can be stale, and the base cursor's physical-byte
provenance remains caller-trusted.

Version `0.0.47` closes the process-local lost-callback gate. It does not add
process-restart reconstruction: dropping a volatile owner still loses its
queue and correlation state. IndexedDB `durability: "strict"` remains a
requested hint rather than a Rust-verifiable media-persistence guarantee.

`Uncertain`, `AttemptAborted`, and `NotAttempted` can each be consumed into one
`LocalLogStorageAppendResolution`. The source kind, physical attempt ID,
honestly optional append-request ID, complete queue, token, limits, counters,
allocations, and final speculative cursor remain exact. One borrowed adapter
request mints a fresh opaque resolution identity only at egress. Resolver
restart clears only that identity. Logical enqueue behind the immutable head is
allowed after the live request borrow ends and preserves both source and
resolver correlation; failure returns the complete unchanged resolver.

The adapter request exposes the typed expected selected scalar binding, writer
pair, Frame V1 limits, target start/end/length, and the lengths of expected
current and predecessor selection JSON. It deliberately exposes neither the
complete clonable mutation binding, expected head bytes, nor exact expected
selection JSON. An observed current context must
instead consume a non-`Clone`, strictly normalized
`LocalLogStorageSelectedRoot`, plus an independently read writer epoch/fence and
current-head-index transaction ID. The constructor does not accept a mutation
binding directly, keeping evidence on the strict normalization path, and the
complete mutation binding remains core-private. Safe code can still retain or
renormalize the same input bytes; freshness and independent I/O remain host-
enforced rather than type-proven.

Ordinary evidence applies only after one transaction scoped to exactly `meta`,
`scopes`, `transactions`, `generations`, and `chunks`, opened `readonly` with no
durability option, reaches terminal `complete` after every read and complete
cursor scan. It is a stable snapshot ordered after earlier overlapping writers
and before later overlapping writers; compatible readers may overlap. Physical
database absence instead uses one correlated, aborted, non-creating open path.
Neither request success nor scan completion before transaction completion is
evidence.

Rust compares that observation against the private queue. Clean target absence
at the exact valid tail grants advisory exact resubmission only when the
selected envelope, byte-exact current/optional-predecessor JSON, writer epoch,
and writer fence still compare exactly (apart from the allowed retired-to-
reclaimed checkpoint cleanup). A byte-identical target grants historical head
presence only when it is the exact final record after the exact valid prefix.
A strictly greater writer epoch does not invalidate that historical fact;
writer-epoch regression, a selected-receipt change without a strict epoch
advance, or a fence substitution at the same epoch is a collision. Any later
record prevents positive acknowledgement, and an absent target followed by a
later key is a gap/collision. A different valid selection with a strictly later
writer epoch in the same scope lifetime is indeterminate rather than retryable;
another scope lifetime, inconsistent selected bytes, or broken index fails
closed.

Only `LocalLogStorageAppendRetryEligibleAtResolution` can begin a fresh exact
append attempt. Only `LocalLogStorageAppendHeadPresentAtResolution` can enter
the separate resolution acknowledgement transition, which advances the same
private exact FIFO head primitive as the terminal-callback path and returns
resolution-specific pending or drained ownership. All other outcomes retain a
quarantined queue with no retry, pop, cursor-release, or writer authority.

The evidence remains a trusted host attestation rather than authenticated
browser provenance. The resolver does not cancel copied dispatches, refresh a
stale token, prove media durability/currentness, or recover across a process
restart. Full active-tail scanning is O(chunks), observed target bytes are
moved into one bounded `Box<[u8]>`, and the fixed five-store scope can couple
otherwise independent editor scopes.

Version `0.0.48` adds the first guarded Rust `EditorEngine` facade. It owns one
`EditorSession` and one immutable `ActionRegistry`; shared observation and an
explicit consuming `into_parts` remain available, but a mutable session and
executable preparation cannot escape. Each mutating entry point first checks
the caller's exact `EditorEngineObservation`, including its private live-engine
identity, `SnapshotId`, and opaque history status. Action preparation and publication then occur
synchronously in one call. Expected disabled work is returned as coherent
action ID, reason, state indicator, and unchanged observation rather than an
error. Real selection movement clears pending formats and publishes a
state-only commit, while an exact selection echo is a complete no-op. Action,
selection, undo, redo, merge-group close, and history clear return distinct
private-constructor `EditorEngineEvent` kinds when effective.

At `0.0.48`, the engine event preserved process-local renderer/controller
classification but was not a `LocalLogEvent`; no infallible internal mapping to
that separately sealed value existed, and checked undo/redo conversion could
still fail after a session mutation had already published. A `LocalLogEntry`
separately required durable session/generation, sequence, and retry identity.
That checkpoint therefore made no false atomic append claim. Version `0.2.1`
later adds classification projection while leaving identity reservation and
append coordination outstanding. The original release added no Wasm, browser, DOM,
scheduling, subscription, or storage adapter. The bounded target through
`0.1.0` is frozen in
[`V0_1_SCOPE.md`](V0_1_SCOPE.md).

Version `0.0.49` closes the first editing gaps without adding another primitive
operation. `delete-backward` and the new `delete-forward` use default extended
grapheme clusters from exact-pinned `unicode-segmentation` 1.13.3 / Unicode
17.0.0 across formatting-run seams; a scalar-valid caret inside a cluster is
disabled rather than snapped. The dedicated `delete-selection` action gives cut
and other hosts a truthful independent-history command, and both directional
delete actions share its normalized range planner. The new
`insert-plain-text-input@1` action interprets CRLF, CR, and LF as paragraph
boundaries and publishes one guarded `RootTextReplace` for every selection
shape. It preserves other scalars exactly, applies one deterministically
inherited format set across inserted lines, consumes pending formats, and
requests independent history. It produces one undo step only if canonical
execution retains a document operation; an exact replacement can be
selection-only. It rejects a source over 64 KiB or 10,000 paragraphs. A soft
break is deliberately absent: the base AST has no inline break node, and literal
LF remains the older `insert-text@1` contract rather than an HTML `<br>`
representation.

Version `0.0.50` adds a separate `breditor-wasm` adapter without changing any
durable JSON format. The only mutable owner exported to JavaScript wraps one
base-action `EditorEngine`. Its observation class contains the real private
engine/state/history token and has no public constructor or serialized form.
Before constructing an action ID or bounded string value, the adapter uses the
engine's read-only observation check as an early admission hint; the mutating
engine call always repeats that check. This preserves stale-engine,
stale-snapshot, and stale-history precedence without treating a successful
precheck as a reservation.

The first action ABI has exactly two input shapes: no input and string input.
For a string action, Rust looks up and installs the descriptor's exact input
contract; JavaScript cannot choose its name or version. This covers all seven
base actions and intentionally does not define generic action-value JSON or a
third-party Wasm plugin ABI. Undo, redo, merge-group close, and history clear
remain separate guarded methods. DOM selection reporting is deferred to the
selection-mapping checkpoint rather than exposing an unvalidated ad hoc shape.

Construction, commands, and codec reads return opaque nonthrowing result
objects with stable codes and fixed payload-redacting messages for correctly
typed calls. A raw JavaScript wrong-type call may still fail in generated
`wasm-bindgen` glue before Rust receives it. Every disabled or unchanged result
retains its unchanged observation; every committed result retains the exact
successor observation and sealed engine event. Commit V1 encoding is a separate
read of that event, while Editor State V1 and Session Checkpoint V1 encoding
are separate engine reads. An output-limit failure therefore cannot turn an
already published mutation into an apparent command failure.

The fresh-document factory accepts only a finite integral history capacity in
`0..=100`, matching the default session-checkpoint admission ceiling. Its
JavaScript number is validated as an `f64` before conversion, so fractional,
negative, non-finite, wrapped, and oversized raw values cannot silently become
a different `u32`. Visible revisions remain decimal strings; private engine and
history identities never cross the ABI. The adapter imports no DOM, storage,
timer, clipboard, console, panic-hook, or custom allocator API. Generated
TypeScript declarations are tied to exact `wasm-bindgen` 0.2.127 and checked
byte-for-byte by `scripts/check-wasm-api.sh`; the transport generation and
crate release are also available through explicit runtime version functions.
The complete boundary contract and raw-glue limitations are recorded in
[`WASM_ABI.md`](WASM_ABI.md).

None of these checkpoints changes document format version `1`, introduces an
executable capability cache, or defines a durable action-state wire format.

Version `0.0.56` exposes the existing Rust action-state abstraction without
turning it into a durable protocol. Each Wasm engine constructs one frozen
base catalog over its exact action registry and retains one synchronous cache.
The fixed catalog observes Bold through the no-input
`breditor/format-strong` intent and its blocking route to the real
`toggle-strong` action, and
observes Undo/Redo through authoritative history preflight. A guarded read
checks the complete engine/state/history observation before touching the cache
and returns a disposable complete non-JSON snapshot plus a bounded changed-ID
hint.

The browser consumes that generated ownership immediately. It verifies the
exact snapshot, canonical IDs, status/activation/value combinations, changed
subset, isolated bounded uniform-value JSON, and handle non-aliasing, then frees
all generated objects. A last-good synchronous store validates full/unchanged/
delta transitions and publishes deeply frozen handle-free snapshots. A
callback-free presentation manifest and native-button toolbar consume only
that read model. Toolbar commands preserve the current semantic selection and
re-enter the ordinary guarded command FIFO; real in-editor `selectionchange`
observations use a dedicated selection-only request. These are application
contracts, not executable preparations, dynamic Rust plugin registration, or a
new durable wire format.

At Alpha.7, the browser admits each successful action-state view only when its
complete count and ordered IDs exactly equal the compiled descriptor and its
resolved activation/value observations satisfy the declared contracts.
Unsupported values correspond exactly to absent descriptor value contracts;
supported observations repeat the exact name and version. Catalog drift fails
before the last-good store can mutate. High-level toolbar controls are likewise
validated as matching no-input intent/routed-state or history declarations.
Direct action controls remain an advanced browser policy bypass.

Version `0.0.57` adds an executable browser persistence profile without
changing any Rust format. The observation-owning adapter strictly consumes one
complete `SessionCheckpoint` result, and restore transfers a newly decoded
engine only after the generated result passes ownership and shape checks. A
bounded handle-free commit feed fires exactly when a validated Rust successor
is adopted, including same-revision history-group boundaries and separate
selection prestages whose later delivery fails. Alpha.3 returns an effective
requested boundary with its atomic action, intent, undo, or redo result; a
failed combined command publishes neither and emits no boundary notification.

JavaScript stores one complete checkpoint under one exact IndexedDB schema. It
verifies a closed outer record, canonical nonzero storage generation, exact
UTF-8 length, and SHA-256, and replaces it only after a full-record
compare-and-swap inside one `readwrite` transaction. The Rust decoder still
authoritatively validates the inner checkpoint. Autosave coalesces adopted
commits, allows one active save, tracks exact flush epochs, and pauses until
explicit retry after failure. Retry reuses the current compare-and-swap token;
it is not conflict resolution. This is best-effort one-slot recovery, not Local
Log Frame V1 append, cross-document storage, merge, authenticity,
anti-rollback, or cross-device synchronization.

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

A sealed base-text extension profile may admit additional compiled format kinds.
In `0.2.x` they are property-free. `0.3.0-alpha.1` lets the Rust compiler attach
one typed scalar-property contract to an extension format while every structural
tree law remains identical. V1 remains bound to the strong-only base rule.

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

`0.3.0-alpha.1` gives the Rust schema compiler a deliberately narrower semantic
subset of that general value model for inline-format contracts. Each declared
key is required or optional and accepts exactly Boolean, a JavaScript-safe
integer with optional inclusive bounds, or a string with inclusive UTF-8 byte
bounds. Null, floats, arrays, objects, unions, enums, patterns, defaults,
coercion, normalization, and cross-property validation are not contract types.
Optional means the key may be absent; a present null is still a type mismatch.
Keys not declared by the closed contract are rejected.

One contract contains 1 through 32 unique qualified property names, sorted
canonically. Extension property names cannot use `breditor/*`. One manifest may
own at most 255 contracts, and each must target one format declared by that same
manifest. `PropertyMap::try_from_sorted` publicly constructs exact instances
without sorting or overwriting caller input.

The default host policy additionally limits one property string to 65,536
decoded UTF-8 bytes and all property strings in a document to 1 MiB. These host
limits are not schema meaning and therefore do not enter the fingerprint.
`DocumentSummary` caches the admitted aggregate property-string bytes, and
Session Checkpoint V2 applies a separate default 64 MiB ceiling across retained
document boundaries. Validation reports retain at most 1,024 issues including
one truncation marker.

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
- Extended-grapheme boundaries are computed only by the backward/forward delete
  actions. Word and line movement remain future semantics. None of them changes
  the stored coordinate unit: points continue to use checked UTF-16 scalar
  boundaries. Selection deletion and both insertion type-over paths honor those
  supplied scalar endpoints exactly, even inside one grapheme; a host can
  therefore remove only a combining or joiner component until a later
  selection-boundary policy exists.

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
a lossy JavaScript number. The Wasm adapter preserves that same fixed-width
value and exposes revisions only through the canonical decimal-string boundary.

Pending formats are an explicit typing override. `None` means derive formatting
from context, while `Some(empty)` explicitly means unformatted. An override is
valid only with a spatially collapsed range and formats permitted by the active
schema. The V1 pending-format value carries no typed property creation contract,
so `0.3.0-alpha.1` rejects property-bearing kinds even when an empty property map
is supplied.

## Sealed base-text profile contract

`InlineFormatSpecV1` is a checked Rust value, not a wire envelope. It contains
exactly one qualified format kind and one nonzero `PersistedTypeRevision`.
Entities, groups, exclusions, inclusivity, normalization, callbacks, and codecs
are not representable. `0.3.0-alpha.1` adds a separate optional
`InlineFormatPropertyContractV1` owned by the same manifest rather than changing
that format identity value. `ExtensionManifest::try_new_with_inline_format_declarations`
is the complete constructor; older constructors remain convenience paths with
no property contracts and/or toggles. Format declarations are sorted, duplicate
kinds are rejected, and at most 255 formats are accepted.

Alpha.4 adds the checked, behavior-free `InlineFormatToggleSpecV1` value. Each
declaration contains exactly a target format kind, `ActionId`, `IntentId`,
`BindingId`, and `ActionStateId`; it has no handler, callback, input, label,
renderer, or toolbar placement.
`ExtensionManifest::try_new_with_inline_formats_and_toggles` canonicalizes these
bundles, rejects duplicate targets and duplicate IDs in each typed namespace,
and accepts at most 255; the older constructors remain zero-toggle convenience
paths. Complete-profile compilation also caps the aggregate at 255, requires the
target format to be declared by the same manifest, permits only one toggle per
format, rejects duplicate typed identities across manifests, and reserves the
complete `breditor/*` namespace from extension semantic IDs. A generated
no-input toggle may target only a property-free format: it cannot invent a
required Link target or another typed property set.

`CompiledSchema::try_compile_base_text_profile` takes one resolved
`ExtensionSet` and one caller-owned `SchemaId`. The schema name, every extension
identity, and every contributed format kind must stay outside the reserved
`breditor/*` namespace. The aggregate extension-format ceiling is 255 because
the fixed compiler ceiling is 256 including built-in `breditor/strong`.
Duplicate ownership across manifests fails even when the declarations are
otherwise equal. Compilation is deterministic, all-or-nothing, and never
infers a selector from an extension or reuses `breditor/base@1`.

The result fixes the same root, paragraph, text, element-property/entity, and
canonicality laws as the base definition. Its schema fingerprint includes the
caller-owned schema selector plus every admitted format kind, persisted
revision, and typed property name/presence/scalar domain in canonical order. It
excludes declaration order, manifest owner,
`ExtensionVersion`, and every toggle action, intent, binding, and action-state
identity. Adding or renaming only a semantic toggle declaration therefore does
not change the schema fingerprint.
`CompiledSchema::is_property_free_inline_format` is a read-only language query;
it neither registers an action nor grants ownership.
`CompiledSchema::inline_format_property_contract` returns the immutable typed
contract when present. Property-free schemas retain exact compiler-contract
version-1 bytes; any typed format selects compiler-contract version 2.
Private compiler-minted text-splice and paragraph-structure capabilities,
rather than matching names alone, gate the property-aware primitive edit
paths. The older property-free base-text capability remains a separate legacy
codec and incremental-proof sentinel.

These non-base schemas use Document V2. The explicitly selected Operation,
Editor State, Transaction Request, Commit, and Session Checkpoint V3 families
carry typed operation and pending-format payloads while continuing to embed
Document V2. Their V2 predecessors remain available only where no typed
operation or pending value must be represented. Every V1 codec continues to
require the exact built-in strong-only `breditor/base@1` definition.

At the alpha.2 checkpoint these V3 families were Rust-only and the ABI-3
browser route remained property-free. Alpha.3 does not reinterpret or sniff
their records: Wasm ABI 4's explicit Profile Bootstrap V2 factories and the
browser's `semanticProfile: { bootstrapJson, formatVersion: 2 }` path select
them directly. The older exact-base V1 and Bootstrap-V1/Session-V2 routes keep
their historical meanings.

## Text operation contract

Alpha.2 makes `TextSplice` property-aware: capture, validation, application,
inverse generation, relocation, undo/redo, and V3 replay retain complete typed
format instances. Same-paragraph set, insert/type-over, selection deletion,
and backward/forward grapheme deletion use this path. Alpha.5 applies the same
preservation rule to `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace`,
opening the sealed structural action paths described below while leaving a
rejected transaction's base state unchanged.

The frozen V1/V2 operation payload generation cannot represent properties. It
therefore rejects every actual operation under any typed-contract schema—even
an optional-only contract with an empty property map—instead of silently
stripping data. Callers explicitly select V3 for property-bearing operations;
there is no automatic detection or conversion. The compiler's older base-text
capability remains a property-free V1/V2 sentinel; the separate paragraph-
structure capability is the one allowed to admit typed formats.

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
support paragraphs that are direct children of a compiler-minted base-text
root, including complete typed inline-format instances admitted by the active
schema. This includes exact `breditor/base@1` and the sealed profiles produced
by `CompiledSchema::try_compile_base_text_profile`; it does not include an
arbitrary schema that happens to reuse the same names. That restriction is
explicit: copying or reconciling element/entity identities, element
properties, and arbitrary block metadata has not been specified, so other
schemas fail instead of inheriting accidental behavior.

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

Splitting inside a property-bearing run copies that complete format instance
onto both non-empty halves, making each half a distinct property owner. Joining
preserves both guarded fragments and canonicalizes only an exactly equal seam.
Validation checks every source and derived format instance against the compiled
contract, and checks aggregate property-value and property-string-byte totals
across the complete two-paragraph source or result slice. A structurally valid
split can therefore be rejected when duplicated properties exceed the active
document limits.

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

Both complete `RootTextReplace` slices are independently checked for canonical
runs, compiled property contracts, property-value count, and aggregate
property-string bytes before application. The derived final document is then
authoritatively validated. This prevents a replacement vector from passing
per-fragment checks while exceeding the document-wide ceiling in aggregate.

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
operations intentionally support only the compiler-minted paragraph-structure
capability.
A schema with block properties, entity identities, different role kinds,
different child constraints, different canonicality laws, or heterogeneous
block shells needs an explicit operation policy rather than silently inheriting
this contract. Property-free and property-bearing extension format instances
are preserved exactly within the admitted paragraph structure.

## Transactions, relocation, and commits

A `Transaction` is authored against one exact input `EditorState`, not merely a
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
budgets before any future generic `ActionValue` Wasm codec exists. ABI 3
deliberately exposes no generic `ActionValue` ingress:

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

The registration-owned `SetInlineFormatAction` remains deliberately narrower
than the property-free toggle action. It can replace/remove its complete typed
format instance at a collapsed caret or over selected text in one paragraph.
Alpha.5 does not enable a cross-paragraph set/remove: that range remains
disabled as `breditor/cross-paragraph-inline-format-unsupported` even though
`RootTextReplace` can now preserve typed peer formats. A future contract must
define the multi-paragraph value semantics explicitly.

Five base actions take no input. Inline and plain-text insertion each accept an
independently versioned typed input:

Both version-1 string ceilings equal the generic `ActionValue` text envelope.
An oversized wire string therefore fails generic value construction before an
action decoder can emit its reserved action-specific input-limit code. The
independent action ceiling still prevents a future widening of `ActionValue`
from silently widening either version-1 contract.

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
  operation paths preserve every unaffected complete typed format instance;
  only the inserted text receives the selected pending/context format set. Both
  paths place a collapsed `Affinity::Before` caret at the inserted text's end,
  consume the pending override with `Set(None)`, and request merge group
  `breditor/typing`. Empty input is invalid input, never deletion, a no-op, or a
  disabled capability.

- `breditor/insert-plain-text` accepts input contract
  `breditor/insert-plain-text-input@1`, also as one non-empty bounded string.
  CRLF, lone CR, and LF become structural paragraph boundaries; leading,
  trailing, and consecutive separators retain empty paragraphs. U+0085,
  U+2028, U+2029, and every other scalar remain literal text, with no Unicode
  normalization. One guarded `RootTextReplace` performs every same- or
  cross-paragraph replacement atomically. Collapsed insertion uses pending
  formats and then focus-affinity context; an extended range uses the first
  spatially selected run, falling back only to the retained left seam, retained
  right seam, then plain text for a structural-only range. One inherited format
  set, including complete typed properties, applies to every non-empty
  replacement paragraph. An empty replacement fragment introduces no formatted
  run itself; retained edge content can still make its result paragraph
  non-empty, and splitting retained formatted content can increase the complete
  property-owner count. The source string has no formatting, and the clipboard
  adapter strips all source HTML formatting and properties before invoking this
  action. Success consumes pending
  formats, places a before-affinity caret after the final inserted fragment but
  before retained suffix text, and requests `HistoryIntent::Record`. A session
  creates one independent entry only if canonical execution retains a document
  operation; an exact replacement can be a selection-only commit. The source
  is limited to 65,536 UTF-8 bytes and UTF-16 code units and at most 10,000
  normalized paragraphs. Active document limits may be smaller; an oversized
  atomic result is disabled rather than chunked into partial edits.

- `breditor/insert-paragraph-break` replaces an extended range with one block
  boundary, or performs one split for a collapsed range. A genuinely
  cross-paragraph range emits one `RootTextReplace` with exactly two empty
  replacement fragments: the retained start prefix and end suffix become
  distinct result paragraphs without a delete/split intermediate. This result
  is monotone in paragraph, node, run, leaf, and text-byte limits for every
  valid source document. Under a typed schema, same-paragraph extended Enter
  also uses one `RootTextReplace`, avoiding an unobservable intermediate that
  could temporarily duplicate property owners. The historical split/delete or
  delete/split planner remains only for the property-free path, where each
  intermediate must fit active limits. A selection containing only the boundary between two
  adjacent paragraphs therefore leaves document content unchanged and becomes
  a selection-only commit; under the current document-operation history law it
  creates no standalone undo entry. Every path
  explicitly places an `Affinity::After` child-boundary caret at the new right
  paragraph start, preserves the exact pending-format option, and requests one
  independent history event.
- `breditor/delete-selection` deletes exactly one non-collapsed normalized text
  range. A same-paragraph range is one `TextSplice`; a cross-paragraph range is
  one `RootTextReplace` with one empty replacement fragment. It therefore also
  deletes a structural-only paragraph boundary. The result collapses at the
  spatial start with `Affinity::After`, preserves pending formats, and records
  independently. A collapsed selection is disabled. Active shape and text
  limits can also disable deletion when joining differently formatted retained
  seams would canonicalize into an oversized leaf or otherwise exceed the
  result bounds.
  Alpha.5 admits the same plan under a typed schema and preserves complete
  properties on both retained seams.
- `breditor/delete-backward` and `breditor/delete-forward` delegate extended
  ranges to that same selection-deletion planner. For a collapsed caret they
  delete the preceding or following default extended grapheme cluster under
  pinned Unicode 17.0.0 semantics. Formatting-run seams never create grapheme
  boundaries. A caret on a valid scalar boundary inside a grapheme is disabled
  as `breditor/caret-not-grapheme-boundary`; it is never snapped or widened.
  Backward deletion at paragraph start joins the preceding paragraph; forward
  deletion at paragraph end joins the following paragraph. With an available
  operation slot, document edges use distinct `breditor/at-document-start` and
  `breditor/at-document-end` reasons. A zero operation budget takes precedence
  after selection applicability is known and before paragraph capture or
  segmentation.
  Collapsed backward/forward edits use `TextSplice` or `ParagraphJoin`, preserve
  complete typed format instances and pending formats, place respectively
  after- and before-affinity carets, and
  offer distinct directional history merge groups. If deleting text or joining
  paragraphs forms one grapheme across the removed seam, backward deletion
  snaps its core-produced caret to the cluster end and forward deletion snaps
  to the cluster start. The core therefore never emits an interior-grapheme
  caret from either collapsed deletion action. Extended selection deletion always records
  independently, so a later backspace/delete begins a separate undo step. Exact
  operations—not renewed segmentation—drive replay. Unicode 17.0.0 is frozen
  for these action identities; a future Unicode-data upgrade must use a new
  action generation or identity rather than silently changing a queued semantic
  invocation.
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
  anchor/focus roles, endpoint affinities, and every non-target typed peer
  format; point aliases canonicalize
  against the result's run topology. Both clear pending formats and record one
  independent history event. A cross-paragraph range containing no selected
  text reports inactive and is disabled as `breditor/no-selected-text`; empty
  paragraphs inside a range containing other text remain intact and do not
  affect activation.

`ToggleInlineFormatAction` is the generic alpha.3 form of that formatting
behavior. Its checked configuration is one immutable `QualifiedName`; native
hosts can choose a distinct `ActionId` when explicitly registering it in an
`ActionRegistry`. Evaluation first requires the active compiler-minted
base-text profile and then requires the configured kind to be an admitted
property-free inline format. An unknown or ineligible kind is disabled as
`breditor/unsupported-inline-format` and produces no operation.

For an admitted kind, the generic action uses the same collapsed pending-format
precedence, affinity lookup, inactive/active/mixed rule, format-limit behavior,
selection preservation, and same-/cross-paragraph primitive plans as the
strong action. Adding one kind preserves every other format in canonical
qualified-name order; removing it remains possible at the format-count ceiling.
`ToggleStrongAction` delegates to this implementation while preserving the
existing `breditor/toggle-strong` identity and strong-specific fault codes.
Alpha.5 allows the cross-paragraph plan under a typed schema because the
property-aware `RootTextReplace` preserves every non-target format instance;
the configured toggle target itself is still required to be property-free.

At alpha.4, a manifest can instead own an `InlineFormatToggleSpecV1` bundle.
The compiled-profile builder requires its target to be a property-free format
declared by that same manifest, then registers the existing generic action under
the declared `ActionId`. It declares the corresponding `IntentId` with no input
contract, adds exactly one priority-0 binding with disabled behavior set to
block, and tracks the declared `ActionStateId` through the routed source. The
result is immediately suitable for a future toolbar to observe, but alpha.4
ships no profile-aware browser renderer or toolbar contribution.

The generated path is deliberately closed: no custom action implementation,
callback, input contract, caller-selected effects, cross-extension target,
shared action/intent/binding/state identity, or fallback route is accepted.
Limits are 255 toggle bundles per manifest and 255 across the profile. All
extension-owned action, intent, binding, and action-state IDs must stay outside
`breditor/*` and be unique profile-wide within their typed namespaces.

`CompiledEditorProfile::try_compile_base_text_profile` immutably co-owns the
exact `ExtensionSet`, compiled schema, generated `ActionRegistry`,
`IntentRouter`, and `ActionStateCatalog`.
Every successful compilation mints a fresh opaque process-local
`CompiledProfileGeneration`, even when the semantic inputs are equal. This is a
container correlation identity, not a schema fingerprint or executable-code
hash, and it is not persisted. Alpha.5 carries it in profile-created
`EditorContext`, `EditorEngine`, guarded observations and intent outcomes, and
profile-owned action-state caches/observations. Profile-generation mismatch is
checked before engine-instance, snapshot, and history mismatch. The existing
public unprofiled native component and engine APIs remain advanced bypasses and
do not gain the compiled profile's correlation guarantee.

`CompiledProfileDescriptor` is an owned immutable view of the same generation.
It lists the durable schema selector and fingerprint, all admitted
inline-format kinds and persisted revisions, all intent input/state contracts,
and all action-state contracts together with their complete direct action,
routed intent, or history-direction source. Collections and binary lookup APIs
use canonical lexical identity order. The descriptor contains no executable
handler or presentation callback.

`EditorEngine::execute_intent` checks the complete observation, uses only its
owned profile router, routes and consumes one cached prepared action inside the
synchronous call, and returns the authoritative successor observation. Its
committed, blocked, and unhandled receipts retain intent/binding/fallthrough
provenance; blocked receipts also retain the disabled reason and evaluated
indicator. No prepared route escapes and no action handler is rerun.

Alpha.7 makes `breditor/format-strong` a built-in tracked no-input declaration
with the priority-zero blocking `breditor/format-strong-binding` to
`breditor/toggle-strong`; both base and extension profiles contain it and Bold
state observes it as a routed source. The supported browser consumes that
route synchronously but redacts binding/action/fallthrough provenance from its
public result. Its immediate-only queue lease rejects composition, active
delivery/read, and reentrant calls as busy rather than retaining stale command
authority. Alpha.3 adds strict typed public intent JSON on the explicitly
selected Bootstrap V2 path; typed toolbar controls, custom keymaps, and custom
`beforeinput` rules remain absent.

`CheckpointedEditorEngine` seals its wire generation at construction. The
legacy `try_new` path encodes Session Checkpoint V1 and therefore admits only
the exact base schema. `try_new_v2` encodes fingerprint-bearing Session
Checkpoint V2, including when the compiled profile is the trusted base
definition. Alpha.3 adds explicit `try_new_v3` for property-preserving Session
Checkpoint V3. Every private mutation candidate uses the already selected codec
before publication; the generation never changes implicitly. The alpha.3
close-before action, intent, undo, and redo methods apply both logical steps to
one private candidate and publish them only after its final checkpoint encodes.

Alpha.5 changes no V3 record number or nested generation. The existing V3
operation payload already carries complete properties for every structural
guard and replacement, so exact forward operations and inverses now survive
Session Checkpoint V3 encoding, replay, undo, redo, and browser autosave/reload.
Both history branches and the cursor are retained. Alpha.5 accepts conforming
alpha.4 V3 checkpoints, but an alpha.4 reader cannot restore an alpha.5
checkpoint whose retained undo or redo branch contains a typed
`ParagraphSplit`, `ParagraphJoin`, or `RootTextReplace`; its older semantic
validator rejects that operation. This prerelease downgrade caveat is not
resolved by the shared `formatVersion: 3`, and no decoder drops or converts the
unsupported entry.

All seven base actions support point aliases and non-BMP scalar boundaries; the
content-changing paths preserve forward/backward range direction where a range
survives. Empty paragraphs and formatted seams have explicit behavior.
Collapsed directional deletion is grapheme-based and Rust-authoritative;
selection deletion remains exact at its supplied scalar boundaries. Text
insertion, paragraph break, and all three delete actions advertise stateless
observations; strong formatting uses the same evaluation for capability and
inactive/active/mixed state. The two parameterized insertion actions have no
generic toolbar entries: a catalog may observe either one only through an exact
fixed-string invocation, such as an intentional snippet or macro control. If
an extended replacement already contains exactly the requested text with the inherited
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
exact-source `Unhandled` outcome with an empty trace. Invoking an undeclared
intent instead returns typed `UnknownIntent`.

The general native router still requires one trusted host compositor to own
shared intent declarations and allocate distinct priorities. Two independent
native registrations cannot each package the same declaration, even when
identical, and equal priorities reject the whole router. Alpha.4's sealed
compiled-profile path is narrower: every manifest-owned toggle receives a
unique no-input intent and exactly one priority-0 blocking binding, so it has no
shared declaration, priority negotiation, or fallback candidate. A future
broader plugin path needs explicit ownership/coalescing plus dependency,
before/after, or authorized priority-band policy; registration order will not
become the fallback.

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
The alpha.4 compiled-profile builder separately caps generated toggle actions,
intents, bindings, and routed state entries at 255 through its aggregate toggle
limit; that does not retroactively bound the advanced native constructors.
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

For each alpha.4 manifest-owned toggle, profile compilation adds one routed
catalog entry under the declared `ActionStateId`. Its source is the declared
no-input `IntentId`; the single priority-0 blocking binding preserves the
generic toggle action's tracked inactive/active/mixed indicator even when the
action is unavailable. This makes the Rust descriptor toolbar-ready without
adding browser presentation metadata or a toolbar implementation.

Batch derivation is synchronous and exact-source. Direct sources call
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
view, disabled cross-refresh reuse, or a separate isolation boundary. Wasm ABI
3 exposes profile-correlated guarded action-state snapshots and deltas, while
subscription delivery remains a browser-store concern. There is still no
backpressure protocol, composite projector, durable action-state codec, or
panic/trap isolation for third-party code.

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
branching UI, selective undo, durable log storage, foreign-operation mapping,
collaboration undo manager, browser FIFO, or clock/IME policy. Collaboration
must eventually map inverse operations and cursor boundaries through remote
changes or use a collaboration-aware history protocol; it cannot silently
reuse this stack.

## Guarded EditorEngine facade

`EditorEngine` is the product-facing synchronous owner immediately inside the
Wasm boundary. The advanced unprofiled `new` and `try_with_base_actions`
constructors retain exactly one `EditorSession` plus one immutable
`ActionRegistry`. Alpha.5's `try_with_compiled_profile` instead owns the exact
`CompiledEditorProfile`, which co-owns its registry, intent router,
action-state catalog, descriptor, schema, and opaque generation. The engine
exposes immutable session/state/registry observations plus its optional router,
descriptor, and generation; guarded intent execution remains internal. Its
observations and outcomes carry that generation, and admission checks it before
engine-instance, snapshot, or history identity. `into_parts` deliberately
drops profile authority and is the only way to regain the session and registry.
No method lends `&mut EditorSession`. Using unprofiled public constructors or
independently composed component APIs remains an advanced bypass.

Every mutation accepts `&EditorEngineObservation` and first compares its opaque
live-engine identity, then its `SnapshotId` and `SessionHistoryStatus`, with the
authoritative owner before doing command-specific work. A fresh identity on
every `EditorEngine::new` invalidates observations when `into_parts` is followed
by reconstruction, even if the session is unchanged or a cloned registry is
replaced. `StaleEngine` takes precedence across that ownership boundary;
`StaleSnapshot` takes precedence when state
identity differs; `StaleHistory` identifies a matching document snapshot whose
opaque history observation changed. Both precede registry lookup, input
decoding, handler evaluation, selection validation, undo/redo preflight, or a
history-only mutation. The observation is process-local queue currency, not a
serialized capability, permission token, content hash, or durable ordering
value.

`execute_action` calls `ActionRegistry::prepare` and
`EditorSession::execute_prepared_action` within one synchronous borrow. No
`ActionPreparation` or prepared capability crosses the boundary. An enabled
action returns `EditorActionOutcome::Committed` with a sealed action-kind
`EditorEngineEvent`. Expected contextual unavailability returns
`EditorActionOutcome::Disabled(EditorDisabledAction)` and publishes nothing.
The disabled projection retains only the action ID, bounded
`DisabledReason`, `ActionStateIndicator`, and unchanged engine observation
obtained from the same evaluation; it drops the immutable document-bearing base
state retained by lower-level preparation.

`set_selection` accepts `Option<Selection>` against the guarded current
snapshot. Equality with the current selection returns `Ok(None)` without
validation work, revision allocation, pending-format change, history-stamp
change, or merge-group close. A different selection is applied as an empty
operation transaction with explicit selection replacement and
`PendingFormatsUpdate::Set(None)`. Success returns a selection-kind engine event
that owns its state-only commit and lends a borrowed view, advances the snapshot,
updates adjacent history cursor boundaries, and closes merging without adding a
content-history entry.
Invalid points, ordering, or pending result state fail atomically through the
selection-update category.

Guarded `undo` and `redo` preserve `EditorSession` replay semantics and return
`Ok(None)` when their branch is unavailable. Success returns a sealed undo- or
redo-kind event that owns the exact replay commit and lends a borrowed view, and
advances both state and history observation. Guarded `close_history_group` and
`clear_history` return a
correspondingly sealed event only when effective; a repeated no-op returns
`None` and does not rotate the history stamp. Every effective event retains the
new complete engine observation for the next queued command.

`EditorEngineErrorCode` has stable categories for stale engine, stale snapshot,
stale history, action preparation, action execution, selection update, and history
replay. Errors are atomic with respect to the engine. The error value preserves exact typed
sources for Rust recovery, while custom `Debug` output redacts
document-bearing execution, transaction, and replay payloads. A disabled
action and unavailable undo/redo are expected outcomes, not errors.

Successful engine mutations expose a private-constructor `EditorEngineEvent`,
not an owned raw `Commit` or `LocalLogEvent`. Its semantic kind distinguishes
action, selection, undo, redo, close-group, and clear-history. A
commit-bearing event lends the exact renderer contract—before/after states,
operations, relocation, and changes—without a consuming getter, preventing a
direct accidental move through the ordinary local-log constructor. This is not
authorization or provenance: the public commit codec can copy the borrowed
value, so durable classification must come from a trusted coordinator rather
than event sealing.

Version `0.2.1` adds a non-lossy consuming projection from a sealed
`EditorEngineEvent` to `EditorEngineLocalLogEvent`. The result retains the
source engine kind, corresponding `LocalLogEvent` classification, and exact
successor observation. Action and selection share
`LocalLogEventKind::Commit` but remain distinguishable by source kind; undo,
redo, close-group, and clear-history retain their local replay classifications.
A committed `EditorIntentOutcome` can produce an action-classified event while
retaining its intent, selected binding, ordered fallthrough trace, and
observation. Blocked and unhandled routes remain complete unchanged outcomes
and claim no mutation. Public `try_undo` and `try_redo` remain checked for
decoded or caller-supplied commits; the trusted projection instead requires a
direction-specific replay proof issued by the session that performed the
successful replay.

This is process-local classification only. It does not construct a
`LocalLogEntry`; supply its schema/session/log/sequence/replay bindings;
establish ordering, uniqueness, or atomic ownership between engine mutation
and append; perform physical I/O; acknowledge an append; or attest durability.
The browser target therefore still uses atomic Session Checkpoint save/restore.
A future coordinator must reserve entry identity before mutation, publish the
session transition, and hand off append ownership as one protocol.

## Current performance limitations

The correctness-first implementation deliberately accepts costs that must be
removed before large-document production use. Root-level node, depth, text-byte,
property-value, and property-string-byte measurements are cached for
constant-time access. A
compiler-proved base-text paragraph splice now validates the generated
paragraph and applies checked global deltas instead of rescanning a matching-
profile document, but:

- any profile/schema/path the local proof cannot establish falls back to
  full-tree schema and resource validation;
- every paragraph split/join and root-text replacement performs full-tree
  validation, validates complete typed format instances, aggregates property
  budgets across each source/result slice, and carries complete paragraph
  guards until structural subtree proofs are specified. Splitting one typed
  run can duplicate its property map into two owners. A wide cross-paragraph
  replacement therefore scans and retains the complete affected paragraph
  slice in both the forward operation and its inverse. Construction and
  application also derive and canonicalize those slices repeatedly to prove
  same-type inverse closure; a private proof-carrying/cached derivation can
  remove that repeated allocation without changing the public contract;
- collapsed grapheme deletion scans the complete source paragraph from its
  start, then scans the result to guarantee a valid post-edit caret. A one-run
  fragment is borrowed directly; each multi-run fragment copies its bounded
  UTF-8 text into a temporary contiguous segmentation view so formatting seams
  cannot trigger library chunk-context discrepancies. There is no cached
  segmentation index, so repeated deletion in one long paragraph can be
  quadratic in paragraph length. The exact-pinned Unicode data also contributes
  code size to native and Wasm builds;
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
  byte multiple. Repeated compaction scans the complete prior tombstone map,
  allocates a temporary exact sequence set for private topology proof, and
  moves active replay IDs into the ordered map without cloning their strings.
  A cumulative logical-ID ceiling bounds successful proof dropping, but exact
  replay membership remains linear in all first-seen lifetime events and has no
  expiry or garbage collection;
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

Document V1 is exact-base-only and has this unchanged shape:

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

Document V2 uses the same format identifier through the separate
`DocumentJsonCodecV2` entrypoint. Its direct canonical field order is `format`,
`formatVersion`, `schema`, `schemaFingerprint`, then `root`:

```json
{
  "format": "breditor/document",
  "formatVersion": 2,
  "schema": { "name": "breditor/base", "version": 1 },
  "schemaFingerprint": "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173",
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

Both binding fields are required. The fingerprint parser accepts exactly
`sha256:` plus 64 lowercase hexadecimal digits, and decode compares both the
selector and fingerprint before root allocation preflight. Matching durable
identity from another process-local compiled proof still receives complete
tree validation. The V2 encoder likewise revalidates when proof or runtime
policy differs. A mismatch never modifies the source JSON or publishes a
document.

`Document::try_admit_to_schema` is a separate borrowed structural boundary. It
fully validates the claimed source first, then validates the same immutable AST
under a target schema and policy. It performs no content transformation; on
success the result shares the unchanged root allocation and carries the target
binding/proof, while any failure leaves the source document untouched.

Editor State V1 and all V1 containers continue to embed Document V1 only. A V2
document cannot appear inside them, and neither document codec auto-detects or
upgrades the other generation. Editor State V2 instead embeds Document V2, and
the same explicit-generation rule holds at every V2 composition boundary.

### Alpha.2 V2 family composition

V1 and V2 are separate public codec families. Existing codec names,
`*_FORMAT_VERSION` constants, error shapes, and canonical bytes remain V1 and
exact-base-only. The V2 entrypoints use separate `*JsonCodecV2` types,
`*_V2_FORMAT_VERSION` constants, and V2 errors. Every independent V2 JSON
envelope keeps its V1 format string, uses `formatVersion: 2`, and emits `format`,
`formatVersion`, `schema`, and `schemaFingerprint` before the existing
family-specific fields in their frozen order.

The complete composition graph is fixed:

- `OperationJsonCodecV2` retains the closed V1 primitive-operation payload.
- `TransactionJsonCodecV2` retains the V1 transaction fields and closed ordered
  primitive-operation payloads; it does not nest standalone operation envelopes.
- `EditorStateJsonCodecV2` embeds Document V2.
- `CommitJsonCodecV2` embeds Editor State V2 and closed primitive-operation
  payloads.
- `SessionCheckpointJsonCodecV2` embeds Editor State V2 and closed
  primitive-operation payloads.
- `LocalLogEntryJsonCodecV2` embeds Commit V2 for commit, undo, and redo and
  retains its outer binding for control-only events.
- `LocalLogCheckpointJsonCodecV2` embeds Session Checkpoint V2.
- `LocalLogFrameCodecV2` uses binary frame version `2`, retains the 28-byte
  framing and CRC-32C layout, and carries only exact Local Log Entry V2 JSON.
- `LocalLogStorageRootJsonCodecV2` and
  `LocalLogStorageGenerationJsonCodecV2` embed exact Local Log Checkpoint V2
  JSON and require explicit Frame V2 policy records.

Alpha.3 does not add a V3 or change any V2 field. It makes the existing V2
operation-bearing graph usable with a public compiler-minted base-text profile:
format kinds remain data inside the existing fragments and documents, while
the receiving schema selector and fingerprint determine whether they are
admitted.

Every repeated selector and fingerprint must equal the outer record and the
receiving compiled schema. Matching durable identity from another compiled
instance still undergoes complete validation and is rebound to the receiver's
process-local proof. Mixed generation nesting fails closed; no V2 decoder falls
back to V1, and no V1 decoder learns V2 from the active context.

Recovery, continuation, V2 tail admission/compaction, selected-root
normalization, and root/generation preparation retain and compare the durable
binding. These are runtime ownership and validation paths rather than new wire
envelopes. They do not authenticate bytes or prove that a storage head is fresh
or authoritative. V2 publication-attempt entrypoints are deliberately absent;
the existing `Prepared` -> `Uncertain` storage typestate remains V1-only.

`SchemaAdmissionRequest::try_prepare(&LocalLogCheckpointAnchor)` is the complete
alpha.2 persistence-admission boundary. It borrows a checked compact source,
fully validates its exact source binding and policy, validates the unchanged AST
under a different target fingerprint and policy, resets selection and history,
and creates a fresh lineage, local session, checkpoint/successor generation
identities, and exact canonical Local Log Checkpoint V2 JSON. Success returns a
non-`Clone` `PreparedSchemaAdmission`; a separate V2 Storage Root preparation
can borrow that evidence without performing storage I/O. Failure consumes or
changes no source document, session, checkpoint bytes, selected root, or
external storage.
This is structural admission only: it performs no node/format/property
transformation and proves no publication, compare-and-swap, durability,
authenticity, freshness, or writer fence.

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
Schema-semantic changes increment `schema.version`; every V2 record additionally
pins the complete compiled definition with `SchemaFingerprint`. The selector
alone is never compatibility proof, and the durable fingerprint never replaces
complete validation under the receiving process-local proof. V1 remains bound
to the exact built-in base definition. Documents, singular operations,
contextually decoded transaction requests, contextually decoded complete
editor-state checkpoints, replay-proved commits, and bounded local
linear-history sessions have persistent formats today. None of these formats is
an ordered delivery log.

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
downcast. Editor State V2 deliberately retains this same closed payload
language; those values require a later semantic state generation after their
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
Supporting a newer document version in its separate document codec cannot
silently widen this checkpoint; the editor-state format must choose an explicit
versioned document entrypoint or advance its own version. Editor State V2 does
exactly that and pins its embedded value to Document V2 without changing V1.

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

### Local log entry V2

`LocalLogEntryJsonCodecV2` is a separate, explicit fingerprint-bearing codec;
the V1 type, constant, errors, and bytes do not change. It keeps the
`breditor/local-log-entry` format string, requires `formatVersion: 2`, and
emits exactly nine direct fields in this order: `format`, `formatVersion`,
`schema`, `schemaFingerprint`, `sessionId`, `logId`, `sequence`, `replayId`,
and `event`.

Every decoded `LocalLogEntry` retains an owned `DurableSchemaBinding`, including
`closeHistoryGroup` and `clearHistory`, whose event objects carry no commit.
Encoding requires the retained selector and fingerprint to equal the codec's
compiled schema. Commit, undo, and redo events embed only Commit V2; an embedded
Commit V1 is rejected rather than upgraded. The outer and nested bindings are
therefore independently checked under the same receiving context.

Decode enforces the complete byte cap and routing header, validates the exact
borrowed outer shape, parses and compares the selector, then parses and compares
the strict lowercase SHA-256 fingerprint before allocating log identities or
decoding the event. A wrong valid selector therefore takes precedence over
malformed fingerprint text. Valid-but-different fingerprints retain typed
expected/found evidence; malformed fingerprint diagnostics retain no attacker
payload. Failed decode never consumes or rewrites the caller's input.

### Local Log Frame V1

Local Log Frame V1 supplies deterministic binary boundaries around exact Local
Log Entry V1 UTF-8 bytes. It is Breditor's own framing protocol; it does not
adopt ProseMirror, Lexical, Tiptap/Yjs, or CKEditor wire values. Frame version
`1` pins entry version `1` at compile time so changing the active entry codec
cannot silently drift existing frame bytes.

The header is exactly 28 bytes. All integer fields are unsigned big-endian and
there is no padding or native-width value:

```text
offset  bytes  field
0       8      magic = 89 42 52 44 54 4c 0d 0a ("\x89BRDTL\r\n")
8       2      frame version = 1
10      2      reserved flags = 0
12      8      Local Log Entry V1 payload byte length P
20      4      CRC-32C of the exact P payload bytes
24      4      CRC-32C of header bytes [0, 24)
28      P      exact Local Log Entry V1 UTF-8 JSON bytes
```

Any later frame version that reuses this magic must preserve the same 28-byte
routing prefix and the header-CRC location and coverage. A version that changes
those rules must use a new magic; otherwise a V1 scanner could correctly reject
it as a corrupt header before reaching the version field.

CRC-32C uses the Castagnoli polynomial in reflected form
`0x82f63b78`, initial and final XOR `0xffffffff`, and the standard check value
`crc32c("123456789") = 0xe3069283`. The implementation uses a const-generated
256-entry table, no dependency, unsafe code, platform intrinsic, filesystem,
or clock. Header CRC includes the stored payload CRC and declared length. A
random length-bit change therefore fails as corrupt header before the scanner
waits for a false payload boundary. Both CRCs are public, unkeyed, 32-bit
accidental-corruption diagnostics. An attacker can recompute them, and
collisions exist. Two CRC fields do not provide a 64-bit payload integrity
value: payload-only detection remains one 32-bit CRC-32C. Neither field is a
MAC, signature, content identity, authorization proof, or cryptographic
integrity promise.

`LocalLogFrameCodec::scan` inspects at most the first frame from a borrowed byte
slice and allocates nothing. Its exact precedence is:

1. Empty input is `EndOfInput` at a clean candidate boundary.
2. A nonempty prefix shorter than eight bytes is `Truncated(Magic)` only when it
   exactly matches the corresponding magic prefix; a mismatch is invalid magic.
3. Exact complete magic followed by fewer than 28 bytes is
   `Truncated(Header)`.
4. A complete header must match its stored header CRC before routing any field.
5. Require version `1`, then flags `0`.
6. Compare the declared `u64` payload length with the smaller of
   `LocalLogFrameLimits::max_payload_bytes` and the active
   `EditorContext` JSON byte ceiling.
7. Convert the admitted length to `usize`, checked-add the fixed header, and
   require the total to fit Rust's `isize::MAX` valid-slice ceiling.
8. Fewer than the exact declared total bytes is `Truncated(Payload)`.
9. Check CRC-32C over the exact declared payload slice.
10. Return `Complete(BorrowedLocalLogFrame)` with that payload, exact consumed
    prefix, and uninspected remaining slice.

The default independent frame payload limit is 16 MiB. Zero is valid policy but
cannot contain a valid entry. The length ceiling is enforced before conversion,
payload slicing, or payload checksumming. The scanner does not allocate from a
declared length and does not bound the already caller-owned input slice or any
bytes after its first complete frame. It never searches forward for another
magic value after an error: resynchronization could silently skip a logical
event.

Binary completeness and semantic validity are separate on purpose.
`BorrowedLocalLogFrame` has no public constructor and proves only the framing
and CRC checks above. Because it can be passed between codec instances,
`decode_frame` first rechecks the receiving codec's effective payload ceiling.
It then validates UTF-8, calls the unchanged `LocalLogEntryJsonCodec` as the
sole JSON and entry-semantic decoder, compares the decoded session ID with
`LocalLogFrameBinding`, then compares the decoded active log ID. The binding
comes from trusted storage scope, checkpoint state, or host configuration,
never from the same payload. Identities are not repeated in the binary header,
avoiding disagreement states and a second identity parser. The borrowed frame
can be decoded more than once; decoding alone does not admit an event.

Encoding applies the cheap trusted session and active-log comparisons first,
uses the existing deterministic entry encoder, applies the effective payload
ceiling and checked frame length, then writes payload CRC and header CRC. The
encoder allocates its returned JSON and frame vector; allocation failure, panic,
abort, and process failure remain outside typed guarantees. The checksum pass
is linear in payload bytes. Scanning is `O(P)` time, `O(1)` additional memory,
and leaves the payload in its caller-owned buffer; semantic decoding retains
the existing entry codec's bounded allocations.

A complete frame is not an accepted or acknowledged frame. Correct host
integration is:

```text
scan one complete borrowed frame
    -> semantically decode and verify trusted tail binding
    -> ContinuedLocalLog::try_observe(decoded entry)
    -> advance active owner and accepted byte offset together
```

If semantic decoding or event admission fails, the accepted offset must not
advance. `Truncated` means only that the currently supplied slice ends at a
valid prefix or before a checksum-validated header's declared payload boundary.
A streaming host can request more bytes. Treating it as a storage tail eligible
for truncation requires separately confirmed EOF and writer fencing.

Frame V1 does not detect deliberate CRC recomputation, deletion of an entire
valid frame, duplication, reordering, rollback, valid-tail splicing, or an
omitted final frame at clean EOF. It provides no storage I/O, aggregate tail
limit, append atomicity, flush/fsync/ack order, checkpoint replacement,
truncation command, migration, confidentiality, queue, backpressure,
cancellation, rate limiting, or multi-writer fence. Native and browser/Wasm
hosts share the wire bytes and algorithm for inputs within their configured and
representable limits, but policy and address-space failures can differ by
platform. They also necessarily implement different durability mechanisms.

### Local Log Frame V2

`LocalLogFrameCodecV2` retains the exact V1 magic, 28-byte header, unsigned
big-endian integer widths, flags value, CRC-32C algorithm, header coverage, and
scan boundaries. The two generation changes are explicit: the binary version at
offset 8 is `2`, and the payload is exact Local Log Entry V2 UTF-8 JSON. The V2
scanner never accepts Frame V1, and its semantic decoder never accepts Local Log
Entry V1 or a mismatched durable schema binding.

Frame V2 has the same corruption-only checksum and host-authority limitations as
Frame V1. The schema fingerprint identifies content meaning; neither it nor the
CRC authenticates the frame, proves order or freshness, establishes writer
authority, or makes bytes durable.

### Active-tail cursor V1

`LocalLogTailCursor` is the first atomic composition of physical frame progress
and semantic successor admission. It owns exactly one `ContinuedLocalLog`, one
`LocalLogFrameCodec`, and an exclusive generation-relative accepted byte offset
stored as `u64`. The codec is constructed from the owner's exact
`EditorContext`, durable session ID, and active generation ID plus one explicit
fixed `LocalLogFrameLimits`. A caller cannot inject an independently drifting
codec or binding, and those cloned bounded identities and context are retained
across every cursor step.

The primary construction path is
`LocalLogCheckpointAnchor::begin_successor_tail`. It consumes the anchor,
begins a fresh successor under fixed `LocalLogRecoveryLimits`, derives its
codec, and starts that new generation's physical tail at offset zero.
`LocalLogTailCursor::from_trusted_parts` exists for host restoration and
advanced integration, but its name is a contract: the core cannot prove that
an arbitrary `ContinuedLocalLog` was caused by exactly the supplied byte
offset. The host must restore that relationship atomically or establish it by
another trusted mechanism. `into_parts` deliberately dissolves the same
coupling and returns all three values; observation count must never be used to
reconstruct byte position because frame sizes vary.

`try_observe_frame(input_origin, input)` consumes the cursor and handles at most
one frame. Its exact precedence is:

1. Require the caller-asserted generation-relative `input_origin` to equal the
   cursor's accepted offset, even for empty input. Numeric equality prevents an
   accidental seek mismatch but is not proof that the bytes came from that
   location, file, generation, or writer.
2. Run the complete Local Log Frame V1 scanner precedence, including the
   effective minimum of the frame and context JSON-byte ceilings. Scan failure
   returns `FrameScan`; clean empty input returns `EndOfInput`; a valid
   incomplete prefix returns `Truncated`. End and truncation preserve the
   complete cursor.
3. For a complete frame, convert its `usize` length to the durable `u64` offset
   domain and checked-add it to the current accepted offset. Either overflow
   fails before UTF-8, JSON reconstruction, or semantic admission.
4. Decode through the retained owner-derived codec. UTF-8, entry semantics,
   remaining context semantic limits, and owner-derived session/log binding
   failures are `FrameDecode` and preserve the cursor.
5. Consume `ContinuedLocalLog::try_observe`. Rejection restores the unchanged
   semantic owner and exact rejected entry, rebuilds the cursor at its old
   offset, and reports `Admission` with the nested typed recovery reason.
6. Only successful `Applied` or `ExactDuplicate` admission publishes the
   returned semantic owner and the precomputed next byte offset together.

`LocalLogTailStep` is fully owned and therefore does not retain the input
buffer. Its status is `EndOfInput`, `Truncated(details)`, or `Accepted` with the
exact platform-sized frame length, half-open generation-relative byte range,
and `LocalLogObservationOutcome`. The caller still owns `input` and uses that
accepted frame length to form the next suffix. Bytes after the first frame were
not inspected; a valid first frame followed by corruption accepts only the
first, and the next cursor step reports the suffix error without rolling back
the accepted event.

`Truncated` retains neither borrowed bytes nor incremental scanner state, and
the cursor origin remains unchanged. After more bytes arrive, the caller must
resupply the entire accumulated frame prefix from that same origin; passing
only the newly arrived suffix is not a continuation protocol.

Exact duplicate is a semantic replay classification, not byte equality. Two
frames with different valid JSON whitespace or member order can decode to the
same replay binding. Both are physical observations, so each consumes the
observation budget and advances by its own frame length; only the first applies
the event or advances logical sequence. Conversely, refeeding a previously
accepted frame at the cursor's current origin is indistinguishable from a real
stored duplicate and is treated as another physical observation.

All typed failure diagnostics omit the retained cursor and rejected entry.
Nested errors can still contain bounded identifiers or rejected field values,
so cursor diagnostics are not a general secret-redaction boundary. Failure-path
boxing and semantic decode may allocate; only the underlying frame scanner has
the allocation-free claim. The one-frame observation transition performs no
loop, read, seek, append, flush, fsync, acknowledgement, truncation, compaction,
or generation rotation. It establishes no EOF, byte provenance, authenticity,
writer fence, rollback freshness, aggregate tail-size policy, or durable causal
relationship between externally restored semantic and physical state.

### Active-tail cursor compaction

`LocalLogTailCursor` exposes two consuming proof-conversion edges. Ordinary
`try_into_checkpoint_anchor(successor_log_id)` uses the
`ContinuedLocalLog` owner's inherited `LocalLogCompactionLimits`.
`try_into_checkpoint_anchor_with_compaction_limits(successor_log_id, limits)`
is the explicitly named reauthorization path: the proposed replacement ceiling
is checked against the complete prior-plus-active replay set and is installed
only on success. It changes replay-tombstone policy, not frame limits. Both
methods require the new generation to differ from the active and immediately
preceding IDs. Older generation identities are not retained, so lifetime
freshness remains a host and writer-fencing obligation.

Both methods delegate without adding offset or frame-policy validation. Their
exact failure precedence remains the underlying compaction precedence:

1. Reject equality with the active generation.
2. Reject reuse of the immediately preceding generation.
3. Convert the prior and active replay cardinalities to `u64` and checked-add
   them, reporting representability or cumulative overflow before policy.
4. Compare the complete attempted tombstone count with the inherited or
   explicitly proposed ceiling.
5. Recheck the private replay/sequence topology before dropping a full entry
   proof.

A typed failure is
`LocalLogCompactionFailure<LocalLogTailCursor>`. It owns the complete unchanged
cursor: semantic owner and session, entries, counters, recovery policy,
inherited compaction policy, owner-derived frame codec and binding,
`LocalLogFrameLimits`, and accepted byte offset. A failed reauthorization does
not change that inherited compaction policy. Failure diagnostics retain the
existing document-payload-free compaction error and omit the cursor, but can
contain bounded generation identifiers and are not a secret-redaction boundary.
Allocation failure, panic, abort, and process failure remain outside typed
atomicity.

Success returns `LocalLogTailCompactionOutcome`, not a bare anchor. The outcome
keeps three values together until its explicit `into_parts` boundary:

- the next `LocalLogCheckpointAnchor`, with the inherited or successfully
  reauthorized cumulative replay policy;
- `accepted_prefix_bytes`, exactly the old cursor's generation-relative
  accepted byte offset at invocation; and
- the old cursor's configured `LocalLogFrameLimits` for Frame V1.

The byte count is an accepted-prefix claim, not physical file or tail length.
If the cursor came from `from_trusted_parts`, it remains only as trustworthy as
the host-restored semantic/physical relationship. The frame value is the old
configured V1 payload ceiling, not the effective context JSON ceiling, a codec,
or a wire-version selector. It cannot describe or select a future frame format;
that requires an explicitly versioned extension. Neither value is encoded by
Local Log Checkpoint V1. Storage Generation V1 can now encode and structurally
validate their association with the checkpoint, but authoritative persistence,
selection, and restart recovery still require a future trusted adapter
implementation of the now-frozen profile.

Successful invocation is explicit host authorization to stop semantic
admission for the old generation at that accepted prefix. The transition reads
no bytes and does not require a preceding `EndOfInput`; that status means only
that one supplied slice was empty. Compaction may therefore abandon an
unobserved suffix or a caller-retained incomplete frame after `Truncated`.
Success proves no clean EOF, absence of later bytes, append completion, writer
fence, byte provenance, physical truncation, flush, fsync, persistence, atomic
checkpoint/log replacement, or durable sealing. It also proof-drops active full
entries into tombstones, so recovering the old cursor after a later storage
failure requires separately retained trusted data; no rollback handle is hidden
in the outcome.

Starting the next active tail stays deliberately separate. The host takes the
anchor from `LocalLogTailCompactionOutcome::into_parts` and calls
`LocalLogCheckpointAnchor::begin_successor_tail` with explicit new
`LocalLogRecoveryLimits` and `LocalLogFrameLimits`. That transition derives the
new active-generation codec binding and starts at generation-relative offset
zero. The old offset and old recovery/frame policy are never carried forward
implicitly.

### Active-tail cursor V2

`LocalLogCheckpointAnchor::begin_successor_tail_v2` creates a
`LocalLogTailCursorV2` at offset zero with an owner-derived schema, session, and
generation binding and an explicit Frame V2 policy. Each consuming observation
scans and decodes only Frame V2 and atomically advances semantic admission and
the generation-relative byte offset. A typed failure retains the unchanged V2
cursor and, when decoding reached one, the rejected entry.

V2 compaction returns `LocalLogTailCompactionOutcomeV2`, which keeps the next
anchor, accepted-prefix length, old frame limits, durable schema binding, and
fixed Frame V2 generation together. Its inherited and explicit-reauthorization
edges preserve the same V1 semantic compaction laws. These values still prove no
EOF, byte provenance, physical length, sealing, publication, or durability.

### Storage roots, attempts, and root resolution (no storage I/O)

Version `0.0.32` implements the platform-neutral value and validation subset of
[`STORAGE_GENERATION_TRANSACTION.md`](STORAGE_GENERATION_TRANSACTION.md). The
implemented validation-only `breditor/local-log-storage-generation@1` name and
shape remain an experimental repository-internal contract outside the supported
package-root compatibility promise.

The six new bounded types keep storage roles distinct:

- `LocalLogStorageProfileId` wraps the existing 128-byte qualified-name type;
- `LocalLogStorageProfileVersion` is a nonzero `u32`; and
- `LocalLogStorageScopeId`, `LocalLogStorageTransactionId`,
  `LocalLogStorageHeadId`, and `LocalLogStorageFenceId` are separate owned
  values using `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`.

These types prove syntax only. They do not prove that a profile exists, that a
scope is authoritative, that a transaction/head/generation is lifetime-fresh,
or that a fence ID names a current capability. The fence ID remains non-secret
correlation data; no capability enters this layer.

Version `0.0.34` adds two more non-interchangeable owned syntax types:
`LocalLogStorageDatabaseIncarnationId` and
`LocalLogStorageScopeIncarnationId`. Both use exactly
`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Construction does not generate an ID or
prove entropy, lifetime freshness, physical database establishment, or scope
provisioning; those remain host/profile obligations.

`LocalLogStorageGenerationBinding` is a separately supplied trusted association
of profile ID/version, scope, expected head, and distinct proposed committed
head. Its facts must originate outside candidate JSON. The immutable
`LocalLogStorageGenerationManifest` has no public constructor and deliberately
does not implement `Clone`; its redacted `Debug` omits `checkpointJson`. It is
inspection data, not an adapter request, receipt, authority token, or semantic
owner.

`LocalLogStorageGenerationLimits` independently bounds complete input bytes,
canonical output bytes, and decoded `checkpointJson` bytes, and carries the
separate nested `LocalLogCheckpointLimits`. Tightening one ceiling does not
silently change the others. The nested checkpoint must also satisfy the
separately trusted `EditorContext` and Checkpoint V1 policy. Defaults are
exactly 33,558,528 input bytes, 33,558,528 output bytes, and 16,777,216 decoded
checkpoint bytes.

`LocalLogStorageGenerationJsonCodec` owns the separately trusted context,
binding, and limits and exposes three separate ordinary-rotation actions.
`prepare_rotation` borrows one already validated prior manifest, one
`LocalLogTailCompactionOutcome`, and caller-owned transaction/fence/successor-
frame inputs. It derives the session, sealed/successor generations,
`acceptedPrefixBytes`, sealed Frame V1 policy, and exact checkpoint from the
outcome instead of accepting duplicate host assertions. Success returns only a
checked manifest for inspection; both success and typed failure leave the
outcome and all inputs with the caller. It does not quarantine or release the
anchor.

`encode_rotation` and `decode_rotation` remain distinct actions. Strict decode
requires the trusted binding and an already validated prior manifest, routes
and validates the exact V1 shape under the independent input limit, reconstructs
bounded values, enforces locally provable topology and continuity, decodes and
canonically re-encodes the embedded Checkpoint V1, and requires that exact text
to equal decoded `checkpointJson`. It then canonically re-encodes the complete
outer manifest and requires byte-for-byte equality with the original input.
Strict encode rechecks the trusted association, prior link, nested checkpoint,
and output ceiling before producing canonical bytes. Equivalent JSON member
orders, whitespace, escapes, or nested checkpoint representations are rejected,
not alternate identities. Exact bytes are still neither a digest nor an
authenticity or rollback proof.

Ordinary continuity preserves profile ID/version, scope, and session; requires
the new expected head to equal the prior committed head, the new sealed log to
equal the prior successor, and the sealed Frame V1 policy to equal the prior
successor policy; and rejects the immediately known transaction or generation
reuse cases. A single prior manifest cannot prove lifetime freshness against
all older IDs, so that remains a profile obligation. The decoded
`acceptedPrefixBytes` cannot prove byte provenance, physical length, EOF, or
causal association with a stored tail.

Version `0.0.34` separately implements
`LocalLogStorageRootJsonCodec`. Its `prepare_root`, `encode_root`, and
`decode_root` actions publish only a private-constructor non-`Clone`
`LocalLogStorageRootSelection` for inspection. Preparation borrows one
`LocalLogTailCompactionOutcome`, derives its checkpoint/session/log facts, and
combines them with a separately trusted root binding and caller choices. Strict
decode applies the whole-input and nested-checkpoint bounds, then requires exact
canonical nested Checkpoint V1 and outer root JSON; preparation and encoding
additionally apply the independent canonical-output ceiling. The root has no
public unchecked constructor. None of
these actions consumes or releases the compaction outcome or provisions the
named database, scope, head, checkpoint generation, or empty active generation.

The same release adds independently trusted selected-receipt, checkpoint-
generation, and active-generation bindings. A
`LocalLogStorageSelectedJsonCodec` routes solely from the trusted selection
kind. It normalizes either exact root JSON or exact current rotation JSON plus
its exact immediate predecessor into one private-constructor non-`Clone`
`LocalLogStorageSelectedRoot`. Rotation normalization strict-decodes both
values and verifies their receipt/head/log/frame/fence/session cross-links.

Version `0.0.35` retains the complete checked `LocalLogStorageSelectedBinding`,
the byte-exact canonical current selection, and the byte-exact immediate
predecessor for a rotation inside that selected root. The public inspection
surface exposes borrowed current and optional predecessor receipt bindings and
the exact retained selection byte lengths. Direct getters for the retained raw
selection JSON remain core-private: public code instead supplies the current
and optional predecessor strings to `validate_exact_selection_envelope`. That
action compares UTF-8 bytes only, without parsing, canonicalizing, hashing, or
reinterpreting them, and rejects a missing/unexpected predecessor or a
current/predecessor byte mismatch with stable typed errors. Successful equality
proves only identity with the values that passed normalization, not that storage
still selects them.

The selected result privately owns the decoded checkpoint anchor and exposes no
public anchor or writer-opening operation. Mutable writer epoch/current-writer-
fence facts are intentionally absent. Its `Debug` reports byte lengths rather
than selection/checkpoint payloads, and exact-envelope errors retain no JSON,
checkpoint, document, session, or byte preview. Anchor and exact-envelope
quarantine are ownership/API hygiene rather than secrecy or exclusive
authority: public canonical checkpoint bytes and binding identities can
reconstruct a separate structurally checked, still non-authoritative anchor,
and a caller can copy any bytes it already owns.

The next ordinary rotation can be prepared, encoded, and decoded against this
selected summary rather than a complete historical manifest chain through
`prepare_rotation_from_selected`, `encode_rotation_from_selected`, and
`decode_rotation_from_selected`. Validation preserves profile/scope/session
facts, requires the selected head and active
generation/frame, and rejects reuse among the transaction, known heads,
checkpoint/active/successor generations, and activation fences visible in the
bounded selected state. It cannot prove freshness against discarded older
history; the profile's permanent tombstones remain authoritative for lifetime
freshness. Database and scope incarnation IDs remain carrier facts on the
selected root rather than storage-generation wire fields.

Version `0.0.36` closes those values into exact attempt plans through two
separate actions. `LocalLogStorageRootJsonCodec::prepare_root_attempt` takes an
explicit database incarnation, planned scope incarnation, and checked root
selection. `LocalLogStorageGenerationJsonCodec::prepare_rotation_attempt` takes
one normalized selected root and one checked candidate manifest; its candidate
database/scope incarnations come only from that selected value. Each action
strictly canonical-encodes the candidate, constructs its complete prospective
`LocalLogStorageSelectedBinding`, and performs final strict selected
normalization. That last normalization reconstructs a candidate checkpoint
anchor as a validation proof and immediately drops the temporary candidate
selected root and anchor.

The private attempt plan retains the complete candidate binding and exact
canonical candidate JSON. A root binding therefore carries the database and
planned scope incarnations even though they are absent from Storage Root V1
JSON. A rotation plan additionally copies the complete prior selected binding
and `Arc`-shares the selected root's exact current and optional predecessor
strings. It retains neither the borrowed `LocalLogStorageSelectedRoot` nor its
anchor. Equal candidate JSON with different root incarnation facts is not the
same complete plan; candidate JSON alone is only the persisted-record byte
identity.

Successful preparation returns private-constructor, non-`Clone`
`LocalLogStoragePreparedAttempt`. It publicly exposes the candidate receipt and
binding plus individual and checked-total retained JSON byte lengths, but no
raw JSON. Consuming `begin_attempt` creates a fresh core-issued
`LocalLogStorageAttemptId`, whose `Arc` allocation identity provides ABA-safe
process-local equality while any old clone remains observable, and moves the
same plan to non-`Clone` `LocalLogStorageUncertainAttempt` before request
egress. Neither callers nor adapters choose the attempt ID.

Only `Uncertain::adapter_request(&mut self)` exposes payload bytes. It yields at
most one borrowed `LocalLogStorageAttemptRequest` for that physical attempt. A
root request carries the current attempt ID, complete candidate binding, and
exact canonical candidate JSON. A rotation request additionally carries the
complete prior selected binding and exact selected current/optional-predecessor
JSON. This is the narrow public payload-bearing adapter boundary; direct raw-
JSON access on `LocalLogStorageSelectedRoot` remains core-private. Request,
state, ID, preparation-error, and transition-error diagnostics are payload-
redacted, although bounded identity facts and payload lengths may appear.

Consuming `begin_exact_resubmission` keeps the same retained plan allocations
and every byte, installs a fresh attempt ID, clears the one-request guard, and
remains `Uncertain`. It accepts no replacement input. The old physical attempt
may still commit. `require_current_attempt_id` accepts the current opaque ID and
rejects an ID from another plan or earlier resubmission, but either result is
correlation only and classifies no storage outcome. IDs and attempt states have
no wire format, persistence, cross-process meaning, or restart reconstruction.
The one-shot borrow reduces accidental duplicate request construction but
cannot stop a caller from copying the exposed bytes or dispatching the same
external operation more than once.

Version `0.0.37` adds
`LocalLogStorageAttemptTerminalAttestation` and
`LocalLogStorageAttemptTerminalAttestationKind`. One non-`Clone` attestation
binds the exact current attempt ID to `PublicationCompleted`,
`TransactionAborted`, or `NotAttempted`. The publication constructor is not a
wrapper for any transaction `complete`: the host asserts that the exact
transaction object associated with that emitted request ID was publication-armed, had
passed all independent checks, had enqueued the complete exact mutation set,
and then emitted its terminal `complete` event. Resolver, cleanup, validation-
only, idempotent no-write, and differently correlated transactions do not
qualify. Rust checks correlation and transition order but cannot verify those
host-side facts.

At request egress the core creates a clonable opaque
`LocalLogStorageAttemptRequestId`, which the borrowed request exposes. Its
allocation identity binds that one emitted request to its attempt and at most
one associated publication transaction. It is volatile correlation, not a
capability, transaction handle, receipt, or durable identity. The
`PublicationCompleted` and `TransactionAborted` constructors require that exact
request ID, so safe callers cannot construct either before egress.
`NotAttempted` instead takes the attempt ID and remains legal before egress or
after it when the named invocation created no publication-capable transaction.

Consuming `LocalLogStorageUncertainAttempt::observe_terminal_attestation`
requires the exact retained request/attempt correlation. Success returns
`LocalLogStorageAttemptTerminalOutcome` containing
`LocalLogStorageHostAttestedCommitted`, `LocalLogStorageAttemptAborted`, or
`LocalLogStorageNotAttempted`.

`LocalLogStorageAttemptTerminalFailure<T>` makes rejection recoverable. A
stale/cross-attempt request or attempt correlation retains the complete
unchanged owner, the unapplied attestation, and a payload-free
`LocalLogStorageAttemptTransitionError`; callers can recover the owner alone or
split all parts. The terminal-observation categories are `AttemptIdMismatch`,
`RequestNotIssued`, and `RequestIdMismatch`; `RequestAlreadyBorrowed` belongs to
the separate one-shot request edge. Diagnostics do not expose retained JSON.

`HostAttestedCommitted` is positive historical host evidence only. It cannot
exact-resubmit and proves neither present currentness, durable flush, survival
after reset/eviction, writer authority, nor owner release. `AttemptAborted`
means one associated physical transaction rolled back; `NotAttempted` means one
adapter invocation created no publication transaction. Both remain unresolved
at plan level, retain the exact plan, and can consume
`begin_exact_resubmission` to preserve its allocations and bytes under a fresh
ID. One attempt ID names exactly one adapter invocation and at most one
associated publication transaction. A copied or duplicate dispatch is outside
that ID's correlation. Each negative state has consumed the invocation's one
terminal observation; future serialized storage resolution must classify any
duplicate dispatch.

The O(1) claim is only in rotation-history length: root normalization reads and
retains one selection, while rotation normalization reads and retains one
current and one immediate-predecessor selection. Both still process bounded
selection bytes and decode a complete bounded checkpoint for each selection;
the current checkpoint is decoded again to retain its anchor. The selected root
therefore owns up to two complete outer canonical selection strings, each of
which may embed a full checkpoint, in addition to its retained current
checkpoint text and decoded anchor. Their byte/content/history/document costs
are not constant. No manifest-chain walk is required, but this is not O(1) in
bytes, document size, session history, or replay-tombstone count. The v0.0.36
plan likewise retains a constant number, not a constant number of bytes: one
candidate envelope for a root, and up to three complete outer payload envelopes
for a rotation (candidate, selected current, and optional selected predecessor).
Candidate preparation also temporarily decodes and reconstructs the candidate
anchor for final strict normalization before dropping it.

This complete pure-Rust boundary performs no filesystem, IndexedDB, JavaScript,
Wasm, or other I/O; creates no adapter capability; makes no head compare-and-
swap, stable-currentness, writer-fencing, durability, or crash-recovery claim;
cannot prove host-event provenance, global ID/fence freshness, or that a
physical successor is fresh and empty; and releases no writable successor
owner. The retained selection receipt bindings are caller-supplied validation
facts, not commit receipts or authority. `HostAttestedCommitted`,
`NotAttempted`, and `AttemptAborted` are trusted process-local physical-attempt
states. Version `0.0.38` adds directional same-selection and active-to-retired/
reclaimed value comparison plus the tombstone-shaped retired transaction
binding; those helpers are not storage evidence.

Version `0.0.39` adds a root-only resolution state machine. Each of
`LocalLogStorageUncertainAttempt`, `LocalLogStorageAttemptAborted`,
`LocalLogStorageNotAttempted`, and `LocalLogStorageHostAttestedCommitted` can
consume `try_begin_root_resolution` when its retained plan is a root. A rotation
returns `LocalLogStorageRootResolutionStartFailure<T>` with the complete
unchanged source owner. The non-`Clone` resolution retains that exact source
object, attempt ID, plan allocations, and candidate bytes; beginning performs
no read and grants no authority.

`LocalLogStorageRootResolution::adapter_request` emits at most one borrowed
payload request for one resolver invocation and mints its opaque
`LocalLogStorageRootResolutionRequestId` only at that egress. Safe callers can
clone the ID only from the request to construct either completed-transaction or
database-open-absence evidence. The host may construct `transaction_completed`
only after the exact fixed-scope serialized resolver transaction emitted
terminal `complete` after every relevant read and cursor scan finished.
Individual request success, `commit()` return, abort, callback loss,
cancellation, or another transaction's completion is not evidence. Rust checks
allocation identity but cannot inspect IndexedDB or authenticate the event.

A physically absent database cannot open that fixed five-store transaction.
`database_open_absent` is the nominally separate correlated assertion that a
versionless open reported `oldVersion == 0`, the handler synchronously aborted
the upgrade transaction, and the open request then emitted terminal `error`.
The aborted upgrade cannot provision or migrate storage. An existing database
whose valid meta record carries another incarnation remains an ordinary
completed-transaction observation. A schema-compatible existing database with
no `meta/profile` record is reset/indeterminate only when that same completed
transaction exhaustively proves all five stores empty. If any store contains a
record without valid profile metadata, the observation is instead
`BrokenProfileAssociation::ProfileMetadata` and fails as collision/corruption.

Applying evidence checks `RequestNotIssued` before `RequestIdMismatch`.
Rejection returns the unchanged resolution and unapplied evidence, and
classifies no finding. Consuming `restart_resolution` preserves the exact
source, plan allocations, and candidate bytes but clears the volatile resolver
correlation. The next request receives a distinct identity, making evidence
from the earlier invocation stale. This is a fresh in-process resolver read,
not crash restart: attempt IDs, resolver request IDs, evidence, plans, and
typestates have no wire, cross-process meaning, or process-restart
reconstruction.

The terminal physical observation set is closed: expected database
unavailable, completely absent planned scope, exact candidate selected, exact
candidate as immediate predecessor, retained candidate identity after
retirement, another complete valid scope incarnation, planned identity
collision, or broken profile-database/expected-scope association. A retired
finding preserves whether the candidate's direct-successor transaction is still
the exact current predecessor or is itself already retired, plus that
successor's head-index mapping. In the exact case, strict selected normalization
privately retains the predecessor bytes' decoded sealed log ID and frame; the
core requires both to equal the root candidate's planned active generation and
does not accept a second host-supplied scalar description. In the
already-retired case, the Profile V1 tombstone has discarded the successor JSON
and sealed fields. That branch can therefore prove only the successor's retained
transaction/head identity and index plus the planned active generation's
`retiredBy` linkage, not the discarded successor contents. The core otherwise
checks supplied normalized selections, exact candidate/predecessor bytes where
they still exist, head-index mappings, permanent generation facts, retired
candidate identity/length, and scope lifetime relationships against the
retained plan before returning a semantic outcome.
Ordinary observation constructors remain trusted host assertions about complete
reads and exhausted ranges; physical absence is available only through the
separate aborted-open evidence constructor.

The outcome and precedence rules are:

- exact current candidate and exact immediate predecessor become
  `CommittedSelectedAtResolution` and `CommittedSuperseded`; these are
  historical classifications at the resolver transaction, not permanent
  currentness or writer authority;
- a matching retired tombstone, the case-specific direct-successor proof, both
  head-index mappings, and required current/generation graph become
  `ResolutionRetired`; the exact-successor case additionally proves the sealed
  log/frame relationship from normalized predecessor bytes, while the
  retired-successor case cannot prove that successor's discarded contents, and
  neither case attests the discarded candidate bytes merely from stored byte
  length;
- complete planned-scope and artifact absence becomes advisory
  `RetryEligibleAtResolution` only for an uncertain, aborted, or unattempted
  source;
- for a surviving `HostAttestedCommitted` source, a missing planned scope or a
  different complete valid scope lifetime becomes
  `StorageResetOrIndeterminate`, never retry or already-provisioned authority;
- a different complete valid scope becomes `ScopeAlreadyProvisioned` for the
  three non-host-committed sources;
- physical database absence, a different valid metadata incarnation, or a
  schema-compatible database without `meta/profile` whose five stores are all
  empty is reset/indeterminate; any stored record without valid profile
  metadata is collision/corruption; and
- identity conflicts, mismatched supplied relationships, and a still-present
  expected scope whose append-only candidate or index is missing become
  `CollisionOrCorruption`.

Only `LocalLogStorageRootRetryEligibleAtResolution` exposes
`begin_exact_resubmission`. It preserves the immutable plan allocations and
candidate bytes under a fresh publication attempt ID, but eligibility is only a
snapshot of the completed read transaction. Copied request bytes can publish
later, so a later attempt must repeat every storage comparison and acquire
separate revocable authority. Every other root outcome is non-retry and exposes
no writer, checkpoint anchor, semantic owner, or ownership-release transition.
The API implements no plan-level `DefinitelyNotCommitted` proof.

Version `0.0.40` implements the nominally separate rotation request,
observation, failure, outcome, restart, and retry contract over the same four
surviving attempt sources. Ordinary observations require terminal `complete`
from that exact fixed-scope transaction; physical database absence instead uses
the correlated aborted-open terminal-`error` path. Pre-egress and stale request
IDs remain recoverable failures, and restart preserves the exact in-memory plan
while clearing correlation.

Within the intact expected database and scope lifetime, complete candidate
namespace absence is branch-valid only when the candidate transaction,
committed-head index, candidate active-generation key, and complete candidate
active-generation chunk prefix are absent. If the exact snapshotted prior
selected envelope remains current, that becomes advisory
`RetryEligibleAtResolution` only for uncertain, aborted, or unattempted sources;
the same finding after `HostAttestedCommitted` is
`CollisionOrCorruption`. For those three non-host-committed sources, one exact
direct competing rotation may instead become
`DefinitelyNotCommittedConflict`: its immediate predecessor receipt and bytes
must equal the plan's prior current selection, its checkpoint must be the plan's
prior active generation retired/reclaimed by the competing head, and its head
index plus branch-required older tombstone must match. This proves that the
candidate can no longer win its immutable expected-head comparison. An
arbitrary far-later current is outside the `0.0.40` conflict observation and
must fail closed. Rotation has no `ScopeAlreadyProvisioned` result.

Selected, superseded, and retired branches validate the exact candidate and
current-envelope relationships, committed-head indexes, generation transitions,
and only the transaction tombstones required in that branch. Selected keeps the
plan's prior current transaction exact as the candidate's predecessor and
requires the optional older predecessor tombstone only when that prior selection
was a rotation. Superseded and retired branches additionally require the plan's
prior current transaction tombstone and its head-index mapping. Retired
resolution validates both candidate checkpoint and active-generation retirement
edges and a typed exact-or-retired direct successor. An exact successor uses
sealed log/frame facts privately derived by strict selected normalization; an
already-retired successor can prove only retained transaction/head/index facts
and the candidate active generation's retirement link, not discarded successor
JSON/sealed fields. Candidate tombstone length likewise never attests candidate
bytes.

Only rotation retry eligibility can exact-resubmit the unchanged plan under a
fresh attempt ID. Conflict and every positive or corrupt/reset classification
are nonretry outcomes. Crash-time plan reconstruction, executable adapters, and
ownership release remain unimplemented; the latter still requires a separately
frozen held-lock, transaction-coupled admission, or revocable/speculative-branch
contract.

### Storage Root and Storage Generation V2

`LocalLogStorageRootJsonCodecV2` and
`LocalLogStorageGenerationJsonCodecV2` retain the V1 storage identity,
association, canonical-byte, limit, and continuity laws while adding the common
schema selector/fingerprint prefix. A V2 root embeds only exact Local Log
Checkpoint V2 JSON and records an active Frame V2 policy. A V2 generation embeds
only exact Local Log Checkpoint V2 JSON and records both sealed and successor
Frame V2 policies. Ordinary rotation requires one unchanged durable schema
binding and frame generation across the selected predecessor, compaction
outcome, candidate, and decoded result.

`LocalLogStorageSelectedJsonCodecV2::normalize_root_v2` and
`normalize_rotation_v2` retain the complete checked binding and exact selected
V2 envelopes without making the receipt authoritative. V2 root/generation
preparation and selected-aware rotation reject cross-schema or mixed-frame
inputs before producing candidate bytes. A V2 root may also be prepared by
borrowing `PreparedSchemaAdmission`; that path validates the target binding and
exact checkpoint again and does not consume or publish the admission result.

Storage V2 deliberately stops before the existing publication-attempt,
terminal-resolution, writer-fence, and append-queue typestates because those
public types expose V1 frame projections. Those V1 paths are not widened or
reinterpreted by alpha.2.

These remain pure value, validation, normalization, and process-local ownership
contracts. They do not provision a database or scope, perform I/O, authenticate
receipt evidence, compare-and-swap a head, prove freshness or durability, or
grant writer authority. The browser IndexedDB implementation remains the
separate V1 Session Checkpoint Profile and does not accept these records.

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

Every `LocalLogRecoveryError` owns only bounded identities, fixed-width counts
and indices, stable categories, and payload-free application subcodes. It retains
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
a larger retained history unit. Checkpoint-linked successor admission preserves
this preflight seam; its fixed operation budget charges only work applied in
the active generation, including authoritative recipes already present in
checkpoint history when an undo or redo crosses the boundary.

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

### Compact checkpoint-linked admission and repeated compaction

`RecoveredLocalLog::try_into_checkpoint_anchor` is a consuming in-memory
compaction boundary. It requires a successor `LocalLogId` plus an explicit
`LocalLogCompactionLimits`. The first proof-dropping transition selects the
maximum cumulative replay-tombstone set for the runtime owner. The successor
must differ from the caller-declared sealed active generation. The core does
not prove that storage contains no later old-generation entry or fence another
writer. Rotation consumes no event sequence. An empty prefix therefore binds
`covered = None` and `next = 1`; its two IDs remain caller-authoritative because
no entry proved either one.

Generation, count, lifetime-limit, and complete private-topology validation
finish while borrowing the owner. A returned
`LocalLogCompactionFailure<RecoveredLocalLog>` contains the exact unchanged
full-proof owner plus a payload-free `LocalLogCompactionError`; formatting the
failure omits its owner. This returned-error atomicity does not cover allocation
failure, panic, abort, or process crash. `GenerationNotAdvanced` now belongs to
the compaction error domain rather than recovery.

Successful conversion publishes `LocalLogCheckpointAnchor`. The anchor owns
the exact `EditorSession`, including redo position and an open merge group; the
session ID; sealed and successor generation IDs; covered/next sequence; and a
deterministically ordered `ReplayId -> LocalLogSequence` tombstone for every
first-seen prefix event. It also carries the runtime cumulative compaction
policy. It drops the old full `LocalLogEntry` and embedded Commit V1 proofs.
Its debug output includes only identities, policy, fixed-width
counters/frontiers, revision, and history depths. Encoding `anchor.session()`
with `SessionCheckpointJsonCodec` is permitted but does not encode or restore
the anchor: Session Checkpoint V1 contains none of its log metadata or replay
tombstones.

`LocalLogCheckpointAnchor::begin_successor` consumes the anchor into an empty
`ContinuedLocalLog` and fixes one `LocalLogRecoveryLimits` policy for the whole
active generation. Starting charges no counters and applies no event. The
active owner retains the checkpoint session, both generation IDs, cumulative
tombstones, checkpoint frontier, lifetime compaction policy, and the fixed
active-generation admission policy. A fresh genesis owner is not incremental
in v0.0.27; a host can recover an empty genesis vector and compact it once to
obtain this successor boundary.

`ContinuedLocalLog::try_observe` consumes that owner plus exactly one
independently decoded entry. On success it returns the next owner and a
`LocalLogObservationOutcome`: `Applied` for a first-seen event or
`ExactDuplicate` for an existing exact active binding. Both outcomes expose the
zero-based physical delivery index and represented global sequence; the
duplicate outcome also exposes the original physical index. Its deterministic
order is:

1. Checked-add one to the cumulative physical observation count and enforce
   the fixed observation ceiling.
2. Require the checkpoint session ID and bound active-generation ID.
3. Reject a replay ID represented by a compacted tombstone.
4. Consult the active replay index. A changed binding is a conflict; an exact
   binding consumes only the observation and duplicate counters, never reapplies
   the event, and returns immediately.
5. Require a first-seen event at the exact next session-global sequence.
6. Checked-add and enforce the cumulative unique-event count.
7. Derive the authoritative operation count, checked-add and enforce the
   cumulative applied-operation count, then apply the event privately.
8. Publish the entry, replay binding with its first physical index, sequence
   frontier, counters, session, and history together.

Every typed rejection returns `LocalLogObservationFailure<ContinuedLocalLog>`
with the exact unchanged owner, exact rejected entry, and ordinary
`LocalLogRecoveryError`. It consumes no budget, replay binding, sequence,
session mutation, or history mutation. `Debug` and `Display` expose only the
typed error, not the owner or entry. The caller can retain and retry the exact
returned entry after relevant prerequisites change—for example, after filling a
sequence gap—or construct and submit another one. This atomicity is a Rust
publication contract; allocation failure, panic, abort, and process crash
remain outside it. Rejected attempts are deliberately not charged to the
owner's counters, so a host accepting untrusted traffic must separately
rate-limit work and queue growth. `ObservationLimit` keeps its pre-v0.0.27 batch
error shape and has no embedded delivery index; the returned owner's
`observation_count` is that rejected physical slot.

`LocalLogCheckpointAnchor::recover_successor` consumes the anchor and one
complete vector of independently decoded entries. It first admits the whole
physical count to retain its original batch error precedence, then delegates
each entry to the same one-observation engine above. Its deterministic order is:

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
6. Charge active-generation unique-event and authoritative operation limits,
   apply privately, then retain the complete active entry.

If any delegated entry fails, the compatibility method deliberately drops the
returned active owner and rejected entry and exposes only the typed recovery
error. No privately applied prefix is published. Callers needing recoverable
rejection use `begin_successor` and `try_observe` directly.

Success returns `ContinuedLocalLog`, which owns the current session, compacted
tombstones, full first-seen successor entries and index, both generation IDs,
both sequence frontiers, active-generation counters, its fixed recovery policy,
and the inherited lifetime policy. An empty successor batch is valid and
changes nothing.
`represented_replay_count` is the complete prior-plus-active unique event count;
physical exact duplicates do not increase it. `into_session` deliberately drops
both kinds of replay protection.

`ContinuedLocalLog::try_into_checkpoint_anchor` is the repeated consuming
transition. It uses the inherited policy, seals the current active generation,
binds a new successor, merges prior tombstones with every active first-seen
`ReplayId -> LocalLogSequence`, moves the exact session/history unchanged, and
sets the new frontier to the prior-plus-active global sequence. Its order is:

1. Reject a successor equal to the active generation, then reject the
   immediately preceding generation still known by this owner.
2. Convert both retained cardinalities to `u64`, checked-add them, and compare
   the cumulative total—not the active batch size—with the inherited ceiling.
3. Recheck old tombstone cardinality/sequence bijection, active entry/index and
   observation/unique/duplicate counter agreement, the applied-operation bound,
   cross-set replay disjointness, exact active contiguity, final frontier,
   session/log membership, and the all-empty history law while
   the unchanged owner is still available.
4. Move every active replay ID and original sequence into the prior tombstone
   map without cloning identity strings or overwriting an existing key, then
   publish the new anchor. No sequence is consumed by rotation itself.

`try_into_checkpoint_anchor_with_limits` is an explicitly named host
reauthorization path. It permits raising or lowering the runtime ceiling, but
still charges the replacement policy against the complete cumulative set. It
is not a counter reset. The ordinary method inherits policy so an accidental
per-generation limit cannot silently discard lifetime accounting. If active
recovery grows beyond the inherited ceiling, ordinary compaction returns the
unchanged `ContinuedLocalLog`; the host may keep every prior tombstone and
still-retained active full proof, or deliberately authorize a sufficient
replacement ceiling. Replaying a smaller/different batch requires a separately
retained trusted checkpoint copy; the returned post-batch owner cannot recreate
the consumed pre-batch anchor.

The complete-vector compatibility boundary still drops its consumed anchor and
privately applied prefix on any late error. Local Log Checkpoint V1 lets a host
reconstruct that anchor from trusted bytes, but direct incremental admission is
the recoverable in-memory path. Neither path makes an append durable,
acknowledged, framed, queued, rate-limited, or single-owner.

The tombstone policy preserves exact at-most-once application but changes old
retry handling deliberately. A compacted ID is always rejected because the
core cannot distinguish a byte-different conflict from a semantically exact
retry without retaining the old proof. Hashes and probabilistic filters would
not preserve exactness. Indefinite exact replay membership for opaque IDs also
cannot use constant space. This runtime selects a hard cumulative exact
tombstone cap; an externally authoritative exact replay store or a proved
retry-expiration fence would require a different contract. Exceeding the cap
does not expire IDs: compaction fails and returns the unchanged owner with all
still-retained active full proofs. Exactly the cap is valid, including any
number of empty rotations; the next first-seen replay requires explicit policy
reauthorization before proof dropping.

### Local log checkpoint V1

Local Log Checkpoint V1 is the complete durable session, log, and replay value
for one `LocalLogCheckpointAnchor`. Its host-authoritative runtime compaction
policy is deliberately outside the wire and is reinstalled on decode. The
format requires exactly eight fields regardless of input member order. The
deterministic encoder emits this order:

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
of `coveredThrough` derive them. It also omits `LocalLogCompactionLimits` and
all older generation IDs. Strict decode installs the codec host's configured
`LocalLogCheckpointLimits::max_replay_tombstones()` value as the restored
anchor's runtime compaction policy;
durable reload can therefore reauthorize a different ceiling unless the host
resupplies the same policy.

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

The default outer policy and default runtime compaction policy both accept at
most 10,000 replay tombstones, but remain distinct host boundaries. Its nested
`SessionCheckpointLimits` independently controls capacity, aggregate history
operations, and retained state summaries. Both encode and decode apply the
codec policies. The whole outer value must fit the context JSON cap even when
its nested session is separately encodable under that same cap. Compaction
success therefore guarantees V1 topology compatibility, not successful
encoding: the caller still needs a trusted binding for the new checkpoint and
successor generations plus sufficient tombstone, nested-session, and JSON-byte
limits. A two-pass
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

Repeated runtime compaction preserves the provenance level it inherits. If an
ancestor came from strict V1 decode, merging later replay proofs cannot prove
that the inherited session was caused by the inherited tombstones, restore an
omitted real ID, reject a same-cardinality fake ID, or authenticate a spliced
session. Calling the later transition “runtime compaction” does not upgrade
those structural assertions into causal proof.

Consequently, exact at-most-once behavior after reload is conditional on
integrity-protected trusted checkpoint bytes, rollback/freshness policy, and
single-owner writer fencing. Local Log Checkpoint V1 supplies no checksum, MAC,
signature, authentication, authorization, provenance, causal event proof,
retry-expiry proof, storage durability, atomic replacement, or crash recovery.
It also cannot prove that the sealed generation has no later entries or that
the bound successor is unused. Those are later storage and lifecycle gates.

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
admission laws above. Genesis batch recovery and checkpoint-linked successor
admission establish contiguous order, membership, replay protection, and
applicability only for entries supplied to their in-memory owners. Repeated
compaction preserves their cumulative exact replay set under an inherited
lifetime policy. The runtime anchor establishes
in-process prefix linkage and fail-closed cross-generation `ReplayId` reuse
rejection. It remembers only the current and immediate predecessor
`LocalLogId`; freshness of older generation IDs remains a host responsibility.
Local Log Checkpoint V1 gives the session, log, and replay portion of that
anchor a strict durable value representation. Local Log Frame V1 adds
single-entry binary boundaries, allocation-free one-frame scanning, exact
complete-versus-valid-prefix classification, and accidental-corruption CRCs.
Together these layers still do not establish idempotent or durable append,
aggregate tail recovery, append/flush/fsync/ack order, atomic file compaction,
migration, cryptographic hashes, signatures, authorization, rollback
protection, or writer fencing. IDs and sequence remain unauthenticated
assertions, not revisions or content hashes, and a CRC-valid frame is not an
accepted event.
Commit-bearing entries also repeat Commit V1's complete before state, so a
naive tail costs roughly entry count times document size. Filesystem durability
belongs to a platform adapter; a browser/Wasm host cannot inherit native
`fsync` semantics from this deterministic crate.

The compaction ceiling bounds logical first-seen replay identities, not encoded
bytes, physical duplicate observations, session/history size, number of empty
rotations, or number of storage generations. Exact tombstones remain
`O(total first-seen events)` memory with no expiry or garbage collection.
Repeated typed preflight scans the complete prior map and allocates a temporary
exact sequence set before moving active IDs into the `BTreeMap`; it avoids
identity-string cloning but is not constant-time or constant-space rotation.
Incremental admission performs ordered-map replay lookups per observation and
retains every first-seen full active entry. A rejected attempt consumes no
owner budget, so the core alone does not bound repeated hostile validation CPU.

### Local log checkpoint V2

`LocalLogCheckpointJsonCodecV2` is the explicit fingerprint-bearing companion
to the frozen V1 codec. It keeps `breditor/local-log-checkpoint`, requires
`formatVersion: 2`, and emits exactly ten direct fields in this order: `format`,
`formatVersion`, `schema`, `schemaFingerprint`, `sessionId`,
`checkpointLogId`, `successorLogId`, `coveredThrough`, `replayTombstones`, and
`sessionCheckpoint`. The nested value is always Session Checkpoint V2; a V1
nested checkpoint fails closed.

The codec requires the same independently trusted `LocalLogCheckpointBinding`
as V1. The schema selector and fingerprint must first match the receiving
compiled context; the session, sealed-generation, and successor-generation IDs
must then match the host binding. Neither repeated wire binding is authority.
Successful decode installs the host's tombstone policy and publishes an anchor
whose session context retains the admitted durable schema binding. Encoding
requires that complete runtime context and trusted log binding to still match.

V2 retains V1's exact frontier/tombstone topology, two-pass bounded tombstone
admission, genesis-empty-history rule, structural-versus-causal limitation, and
two-pass outer output limit. Its exact borrowed outer decode is non-destructive.
Adding a collision-resistant schema identity does not authenticate the record,
prove that its session was caused by its tombstones, prevent rollback, establish
writer authority, or make the checkpoint durable.

## Implementation history and remaining local-log work

Version `0.0.33` now freezes the explicit initial-root contract and the concrete
`breditor/indexeddb-local-log@1` profile in
[`INDEXEDDB_STORAGE_PROFILE.md`](INDEXEDDB_STORAGE_PROFILE.md). It specifies
the five stores and committed-head index, exact transaction lifecycle,
database/scope incarnations, first checkpoint-only plus empty-active generation
reservation, exact current/immediate-prior receipt retention, identity
tombstones, request-versus-transaction terminal evidence, uncertain resolution,
revocable writer epochs, and payload cleanup. It deliberately makes no
filesystem claim and adds no executable adapter.

Version `0.0.34` implements the pure Rust storage-incarnation IDs, private root
codec, trusted selected bindings, root/rotation selected-root normalization,
and next-rotation validation against that selected summary. Root preparation
may inspect a complete compaction outcome with content/history/tombstones;
“root” means first proposed storage authority, not an empty editor. Validation
does not establish that authority or atomically reserve its permanent
checkpoint-generation identity and distinct empty active generation.

Version `0.0.35` retains the complete checked selected binding and exact
canonical current/optional-predecessor selections in the non-`Clone` selected
root. It exposes borrowed receipt bindings, byte lengths, and a public
byte-comparison action while keeping direct raw-selection access core-private
and all `Debug`/error output payload-redacted. This is exact plan input, not
storage currentness, attempt evidence, or authority.

Version `0.0.36` implements private-constructor non-`Clone` exact root/rotation
plans and anchor-free, non-authority `Prepared`/`Uncertain` mechanics. A complete
candidate binding and exact candidate JSON are retained; rotation additionally
snapshots the complete prior selected binding and shares its exact current/optional-
predecessor JSON without retaining the selected root or anchor. `begin_attempt`
core-issues a fresh ABA-safe process-local identity before one borrowed request
can be exposed. Exact resubmission preserves the plan allocations/bytes under a
fresh identity. Cross-plan/stale-ID mismatch is a payload-free correlation
error, not terminal evidence. The API performs no I/O and cannot classify
commit/noncommit, release an owner, or treat request success, `commit()` return,
or an abort callback as plan-level finality. The one-shot request view cannot
prevent copied bytes or duplicate external dispatch.

Version `0.0.37` implements stable typed host terminal attestations and consuming
observation for one exact physical attempt. Only an exact publication-armed
transaction completion correlated by the opaque request ID emitted at egress
becomes historical `HostAttestedCommitted`; transaction-aborted requires the
same token, while not-attempted names the attempt ID. `AttemptAborted` and
`NotAttempted` close one invocation only, retain the exact plan, and can
resubmit under a fresh ID. Recoverable rejection retains both the unchanged
owner and unapplied attestation. No evidence state authenticates browser events,
survives process loss, releases authority/ownership, or correlates copied
dispatches to the same attempt ID.

Version `0.0.38` freezes three prerequisites without claiming resolver
evidence:

- `LocalLogStorageSelectedBinding::compare_later_observation` is directional.
  It requires exact current/predecessor receipts, active-generation facts, and
  immutable checkpoint-generation facts. Only `Retired -> Reclaimed` cleanup
  may advance; `Reclaimed -> Retired` is a typed regression.
- A prior selected active generation can validate an observed retired or
  reclaimed checkpoint with the same log/session/frame/activation facts and one
  exact supplied retiring head.
- `LocalLogStorageRetiredTransactionBinding` contains only database/scope,
  transaction/head, selection-kind, and `selectionByteLength` facts actually
  retained by the tombstone. Equal length screens collisions but never attests
  candidate bytes. It does not fabricate profile/session/JSON fields.

Mutable writer epoch/current-fence facts stay outside
`LocalLogStorageSelectedBinding`, and an active tail may grow without changing
immutable selection metadata. Version `0.0.41` later composes those facts with
the selected binding and exact selection bytes in a separate non-authority
mutation-fence binding. The `0.0.38` helpers themselves do not compare selection
JSON, read storage, validate keys/indexes or complete range scans, authenticate
browser events, classify commit, or release authority.

Version `0.0.39` implements the separate root-resolver gate in pure Rust. The
four surviving root attempt states can enter one non-`Clone` resolution; a
rotation is rejected with its unchanged owner. One adapter request mints one
opaque process-local ID at egress, and only evidence carrying that allocation
identity can close the invocation. Restarting the resolution clears that
correlation while preserving the exact source plan, so any old evidence is
stale. Pre-egress and mismatched evidence are rejected without classification
and returned with the unchanged resolver.

Ordinary read evidence becomes applicable only after its exact fixed-scope
serialized transaction emits terminal `complete` after all reads and scans;
request success, `commit()` return, abort, callback loss, or unrelated
completion classifies nothing. Physical database absence instead requires the
correlated versionless open to report `oldVersion == 0`, synchronously abort its
upgrade, and emit terminal open-request `error`. The implemented root
observations distinguish unavailable expected database, complete planned-scope
absence, exact selected, exact immediate predecessor, retired identity, another
valid scope, permanent identity collision, and a broken profile-database or
expected-scope graph.
Rust validates each finding against the surviving exact plan before producing
the seven closed root outcomes.

Retired-root validation is case-specific. If the direct successor remains the
exact current predecessor, strict selected normalization privately carries its
byte-derived sealed log ID and frame into resolution; both must equal the root
plan's active generation, with no separate host scalar accepted for that
claim. If the direct successor has itself become a Profile V1 tombstone, its
JSON and sealed-generation fields no longer exist. `ResolutionRetired` then
proves only that successor's retained transaction/head identity, committed-head
index, and the planned active generation's `retiredBy` linkage—not the
discarded successor contents. Candidate tombstone length remains collision
screening rather than candidate-byte evidence.

Root absence precedence is source-aware. Complete planned-scope and artifact
absence is advisory `RetryEligibleAtResolution` only for uncertain, aborted, or
unattempted sources. A different valid scope is `ScopeAlreadyProvisioned` for
those sources. For `HostAttestedCommitted`, a missing planned scope lifetime or
a different valid scope lifetime is `StorageResetOrIndeterminate`: disappearance
or replacement after historical commit cannot distinguish reset or eviction and
never authorizes retry. Physical database absence, a different valid metadata
incarnation, or a schema-compatible database lacking `meta/profile` with all
five stores empty is likewise reset/indeterminate. Any record in any store
without valid profile metadata is collision/corruption. This does not forgive
append-only inconsistency: if the expected database and planned scope still
exist but the candidate transaction or committed-head association is missing,
the adapter must report
`BrokenProfileAssociation::ExpectedScopeCandidateMissing`, which becomes
`CollisionOrCorruption`. Identity conflicts and malformed associations also
fail closed.

Only `RetryEligibleAtResolution` can exact-resubmit under a fresh attempt ID,
and it remains advisory after the resolver transaction. A later transaction
must repeat all comparisons and authority checks or combine comparison and
writes atomically. Selected/superseded classifications establish only
historical commit; retired identity cannot attest discarded bytes; no outcome
releases a writer or semantic owner. Resolver IDs/evidence have no wire or
process-restart representation, and the exact plan must survive in memory.

Version `0.0.40` implements the separate process-local rotation resolver and
keeps its request/evidence/observation/outcome types nominally distinct from the
root resolver. It validates complete current scope graphs plus branch-specific
candidate transaction/index, candidate active-generation key, complete
candidate active-generation chunk prefix, prior-selection, direct-successor,
and older-tombstone evidence. Absence compares the exact prior selected bytes
and directional binding and requires the complete candidate namespace to be
absent. It is advisory retry only for uncertain,
aborted, or unattempted sources; host-attested absence in the intact scope is
collision/corruption. One exact direct competing rotation whose immediate
predecessor is the plan's prior current selection can produce nonretry
`DefinitelyNotCommittedConflict` for those same three sources. Arbitrary far-
later conflict classification remains unimplemented. Rotation has no root
`ScopeAlreadyProvisioned` case.

Positive branches validate only their required historical records. Selected
keeps the prior current exact and retires only its optional predecessor;
superseded and retired require the prior current tombstone as well. Retired
resolution separately checks the candidate checkpoint generation retired by the
candidate head, the candidate active generation retired by its direct successor,
and the exact-or-retired successor/index evidence. Exact successor sealed-log/
frame facts come privately from normalized bytes; an already-retired successor
cannot attest its discarded JSON/sealed fields.

Version `0.0.41` implements the next pure-Rust storage value boundary.
`LocalLogStorageWriterEpoch` is a canonical nonzero, nonwrapping `u64`: text is
the shortest unsigned ASCII decimal representation and checked succession
never normalizes or wraps malformed/exhausted input. A cloneable
`LocalLogStorageMutationFenceBinding` snapshots the complete selected binding,
`Arc`-shares its byte-exact current and optional predecessor JSON, and records
the observed writer epoch and current writer fence. Its later-observation
comparison applies the existing directional selected-binding relation first,
then requires exact current JSON, predecessor JSON, epoch, and fence. Thus
`Retired -> Reclaimed` checkpoint cleanup remains valid while the reverse
transition and every immutable or writer-fence change fail.

Consuming `try_prepare_writer_fence_acquisition` derives exactly the checked
successor epoch and returns a non-`Clone`
`LocalLogStorageWriterFenceAcquisitionPlan` only when the proposed fence differs
from the current writer fence. If the epoch is exhausted or the fence is
reused, the recoverable failure retains the complete unchanged binding and
proposed fence; exhaustion has precedence. `u64::MAX - 1 -> u64::MAX` is a
valid plan. At `u64::MAX`, further acquisition or rotation is impossible, but
an already issued epoch-maximum token could still be compared by a future
append contract because append need not advance the epoch.

The binding and plan expose byte lengths rather than their retained raw JSON,
and `Debug` does not print those payloads. They do not prove that selected and
writer facts came from storage or one atomic observation, perform CAS, create
an adapter request, consume terminal evidence, issue a token, establish writer
authority or global fence freshness, survive process restart, release the
quarantined checkpoint anchor or another semantic owner, or append anything.
Historical commit likewise does not grant stable currentness: every IndexedDB
mutation must recheck its complete expected selection and writer facts inside
the mutation's serialized transaction.

Version `0.0.42` implements the nominally separate process-local writer-fence
acquisition lifecycle. `begin_acquisition` consumes the checked plan into
`LocalLogStorageUncertainWriterFenceAcquisition` and core-creates a fresh opaque
attempt ID before egress. The first `adapter_request` call permanently records
egress and mints an allocation-identity request ID. Its borrowed non-`Clone`
view exposes the complete expected mutation binding, raw byte-exact current and
optional-predecessor selection JSON, expected epoch/fence, and exact planned
successor epoch/proposed fence. This request is the lifecycle's only public raw-
JSON boundary; all diagnostics remain payload-redacted.

`LocalLogStorageWriterFenceAcquisitionTerminalAttestation` has exactly three
host-observed kinds: `AcquisitionCompleted`, `TransactionAborted`, and
`NotAttempted`. Completion and abort require a clone of the emitted request ID
and are therefore unconstructible before egress through the safe API. Not-
attempted names the attempt and is valid before or after egress only when that
invocation created no transaction. Consuming observation checks attempt
identity before request existence and then exact request allocation identity.
A transition failure retains the unchanged owner and unapplied attestation.
Aborted/not-attempted states and direct uncertain resubmission preserve the
exact plan and JSON allocations while creating a fresh attempt identity; an
earlier uncertain transaction may still complete.

Only matching completion creates `LocalLogStorageMutationToken`. It privately
retains the exact nominal request identity and a target binding that preserves
the selected binding plus allocation-identical current/predecessor JSON while
changing only epoch/fence to the plan's checked pair. The token has no clone,
serialization, equality, hash, ordering, display, or public constructor. Its
public surface exposes the binding, selected binding, acquired epoch/fence,
attempt/request IDs, and JSON byte lengths, but not raw JSON. Its completion is
historical trusted host evidence, not stable currentness,
durability, a long-lived lock, or semantic-owner release. Another acquisition,
rotation, reset, or conflicting mutation can revoke it before the callback
runs; each protected mutation must re-read and directionally compare the
complete token binding in its own serialized transaction.

For IndexedDB Profile V1, a conforming host must implement one fixed five-store
strict `readwrite` transaction. It reads meta and scope control; the selected
transaction by primary key and independently through unique
`byCommittedHead[scopeId, scopeIncarnationId, committedHeadId]`; any named
predecessor; and the selected checkpoint/active generation records. It must
reconstruct and directionally compare the complete selected binding, compare
both selection JSON byte strings exactly, and require the expected writer pair.
Only then may it update the same scope record by replacing exactly
`writerEpoch` and `currentWriterFenceId` with the planned pair. It must leave
the head/selection fields, index and transaction records, generation records,
and JSON untouched. A mismatch aborts; finding the target writer pair already
stored is never idempotent success. Only this exact transaction's terminal
`complete` qualifies for `AcquisitionCompleted`.

No such IndexedDB/JavaScript/Wasm adapter or executable append I/O exists yet.
Attempt/request IDs and fence values are non-secret correlation, not
authenticated provenance. The borrowed one-shot request cannot prevent copied
or duplicate host dispatch, and allocation identity has no persistence or
cross-process meaning. There is no acquisition resolver or restart
reconstruction. In particular, if `u64::MAX - 1 -> u64::MAX` commits but its
completion callback or volatile process state is lost, exact retry cannot
attribute the stored tuple and no successor epoch exists. Profile V1 then has
no in-contract path to acquire another token without later migration or reset;
an already issued maximum-epoch token can still prepare an append and could be
checked by a future adapter.

Version `0.0.43` implements the pure single-frame append-preparation boundary.
`LocalLogStorageMutationToken::try_prepare_append` consumes the token and one
`LocalLogTailCursor` while borrowing one `LocalLogEntry`. Its validation keeps
storage and semantic scopes fail closed: the token-selected session, checkpoint
generation, active generation, and active Frame V1 policy must agree with the
cursor; the entry must encode under that owner-derived policy; the generation-
relative start plus complete frame length must fit `u64`; and the encoded frame
must pass the existing semantic tail-admission transition.

Failure returns `LocalLogStorageAppendPreparationFailure`, retaining both the
complete unchanged token and cursor; the borrowed entry remains caller-owned.
Success returns a private-constructor non-`Clone`
`LocalLogStorageAppendPlan`. It owns the token, exact canonical frame bytes,
checked start/end, and speculative cursor produced by admitting exactly those
bytes. This is one atomic in-memory preparation: there is no separately
supplied post-state, frame boundary, or sequence claim. The advanced cursor is
quarantined inside the plan because no physical append has yet been attested.
Public inspection and diagnostics must not turn the retained document-bearing
frame into an accidental payload dump.

The corresponding IndexedDB Profile V1 chunk layout assigns exactly one
complete Local Log Frame V1, with no trailing bytes, to each chunk value. The
fourth compound-key member is `chunkStart`, not a sequence or record ordinal.
It is the canonical twenty-ASCII-digit, zero-padded generation-relative start
offset. The first key is `00000000000000000000`; every next key equals the
preceding key plus that preceding value's exact byte length. Starts and ends
must fit `u64`, and gaps, overlaps, malformed keys, empty values, multiple
frames, truncation, or trailing bytes are corruption.

A future executable append transaction must revalidate the complete token
selection and writer pair inside the fixed five-store transaction, validate the
active generation and its frame policy, and prove that the current complete
last chunk ends exactly at the plan start before writing. If the target key
already contains byte-identical complete frame data and there is no later
record, the transaction may classify the exact plan as idempotently present;
different bytes or any incompatible tail shape fail closed. A rotation in the
same profile must independently validate that this exact last tail end equals
the manifest's `acceptedPrefixBytes` before changing the selected head. That
shared comparison prevents append and rotation from committing against
different notions of the sealed prefix.

The v0.0.43 plan performs no storage read or write, creates no adapter request
or physical attempt/request identity, observes no terminal event, and supplies
no acknowledgement, uncertain resolver, retry classification, or restart
representation. `LocalLogTailCursor::from_trusted_parts` still makes physical
byte provenance caller-authoritative. A token or plan placed behind shared
ownership can defeat non-`Clone` exclusivity hygiene, so transactional checks
remain authoritative. One-frame chunk values add record/key overhead, and the
fixed five-store IndexedDB scope still serializes unrelated editor scopes.

Version `0.0.44` consumes one checked plan into a nonempty
`LocalLogStorageAppendQueue`. The queue owns exactly one root token, one final
cursor already advanced through its entire pending prefix, a structurally
distinguished head, and zero or more FIFO followers. Its immutable
`LocalLogStorageAppendQueueLimits` independently cap pending frames and exact
aggregate encoded bytes. The default ceilings are 1,024 and 67,108,864 bytes;
zero is an explicit disabled policy. Starting checks count before bytes and
returns the allocation-identical plan on either rejection.

`try_enqueue` has fixed validation precedence: pending-frame count overflow,
pending-frame limit, deterministic frame encoding, platform frame-length
conversion, aggregate pending-byte overflow, pending-byte limit, then the
existing atomic tail transition. The byte policy is therefore decided before
semantic cursor advancement. On success the admitted `Arc<[u8]>` becomes the
new back item and the original head is unchanged. The returned enqueue step
causally exposes only that new frame's bounded range, length, and semantic
outcome while owning the updated queue. On every typed failure the whole queue,
including its token, cursor, head/follower allocations, counters, and limits,
is returned unchanged; the borrowed entry remains caller-owned.

Public queue inspection exposes its binding and token by shared reference,
final speculative cursor/end, limits, exact pending totals and remaining
capacity, and only the head's start, end, encoded length, and semantic
observation outcome. Raw follower bytes and any persistent or arbitrary
follower view remain core-private; one enqueue step reports only its causal
frame's bounded metadata.
There is no public pop, discard, reorder, coalesce, consuming-parts, cursor-
release, or rotation action. Thus the implemented FIFO proves in-memory
preparation order, capacity accounting, and head selection, but not physical
dispatch or terminal storage-completion order.

The root token can cover this whole speculative prefix because append does not
change its selected/writer binding. It still may be revoked between any two
transactions, so every future head attempt must repeat the complete binding and
tail comparison. At the `0.0.44` checkpoint, a future uncertain-head lifecycle
had to retain this queue and
continue logical enqueue behind the head, but no core-issued request may expose
raw follower bytes or authorize follower dispatch until the head is terminally
resolved.
Only a future acknowledgement transition could remove that head, decrement
volatile pending accounting, and publish a drained owner that releases its final
cursor. A transition from that drained owner into rotation was a separate
future edge.

Executable FIFO dispatch and a transition from the drained append owner into
rotation remain later state-machine responsibilities rather than unchecked host
conventions. The host remains responsible for asynchronous scheduling,
batching choice, admission pacing, cancellation, browser task lifetime, and
rate limiting, without permission to select a follower, coalesce, or reorder
queue items. Dropping the owner is possible but has no cancellation or
acknowledgement meaning.

The queue limits cover encoded frame slots and bytes, not total heap retained by
the speculative cursor, session/history/replay state, decoded entries,
containers, shared bindings, or allocator overhead. Rust may drop the entire
queue, but no drop is an acknowledgement or cancellation; it loses the volatile
branch. One candidate is fully encoded before aggregate capacity is decided, so
transient peak memory may exceed the retained-byte ceiling. Allocation failure,
process loss, and a stale-token rebase/extraction path have no typed transition
in v0.0.44.

Version `0.0.45` adds one consuming
`LocalLogStorageAppendQueue::begin_head_append_attempt` transition. It enters a
non-`Clone` `LocalLogStorageUncertainAppendAttempt` under a fresh nominal
`LocalLogStorageAppendAttemptId` before any raw head data can leave the core.
That conservative state covers both an invocation that never reached storage
and one whose transaction committed while its terminal callback was lost. Its
first `adapter_request` call permanently records egress, mints a nominal
`LocalLogStorageAppendRequestId`, and lends one non-`Clone`
`LocalLogStorageAppendRequest`. The borrow cannot outlive or be consumed apart
from its owner. A second request from the same attempt fails with the stable
`RequestAlreadyIssued` transition category.

The request is the only public raw-head surface. It exposes the request and
attempt IDs; complete expected mutation-fence and selected bindings; exact
canonical current selection JSON and optional immediate-predecessor JSON;
expected writer epoch and current writer-fence ID; exact head `chunkStart`,
exclusive end, byte length, and already encoded complete Frame V1 bytes. It
exposes neither a follower nor the final speculative cursor. Frame and
selection JSON can contain document data and can be copied after crossing the
borrowed boundary, so request and owner `Debug` deliberately omit those bytes.
The one-shot borrow is ownership hygiene and correlation, not proof that an
external adapter dispatched the bytes only once.

One request ID names exactly one adapter invocation and at most one
append-capable transaction. That transaction must use the fixed serialized
profile scope; independently re-observe the complete binding, byte-exact
current/predecessor selections, writer pair, active generation, and Frame V1
policy; and validate the complete exact tail. If the valid prefix ends at the
requested start and the key is absent, it may add exactly the head bytes. If
the head already is the final record, the key and bytes must be identical and
the prefix immediately before it must end at the requested start. This latter
case is only idempotently present. Different bytes, gaps, overlaps, malformed
keys/values, later records, or binding mismatch require abort. Returning the
request, receiving an individual IndexedDB request success, or returning from
`IDBTransaction.commit()` is not completion and releases no owner.

Consuming `begin_exact_resubmission` preserves the entire queue allocation
graph—token, head bytes, followers, limits, counters, and final speculative
cursor—while replacing only the attempt ID and clearing request correlation.
It does not refresh or rebase a stale token. An old copied or dispatched
request may still commit after the new attempt begins, so every attempt must
obey the same serialized same-key/same-bytes idempotency rule. The new ID names
the new invocation; it does not reclassify the old one.

The uncertain owner retains logical `try_enqueue` both before and after request
egress. Successful enqueue preserves the exact attempt and optional request ID,
leaves the head fixed, and advances only the private speculative tail. Failure
returns the complete unchanged uncertain owner. Followers remain inaccessible
to core-issued requests and receive no dispatch authorization. No terminal-
attestation, durable-acknowledgement, pop, drained-owner, cursor-release,
resolver, rotation, or restart transition exists in `0.0.45`; those remained
the next implementation gate at that checkpoint. Dropping the owner or losing
its process loses the queue and correlation IDs and cannot determine whether an
already copied/dispatched transaction committed. The queue-limit exclusions,
transient candidate peak, allocation-failure gap, and stale-token limitation
remain exactly those described for `0.0.44`. With no separately authenticated
tail summary, exact validation may scan every active-generation chunk; the
fixed five-store scope also serializes otherwise independent editor scopes.

Version `0.0.46` adds the append-terminal observation transition with the
current attestation kinds.
`LocalLogStorageAppendTerminalAttestation::transaction_completed` and
`transaction_aborted` borrow the exact request ID; `not_attempted` borrows the
attempt ID and remains valid whether egress occurred or not. Consuming
`LocalLogStorageUncertainAppendAttempt::observe_terminal_attestation` first
checks attempt identity, then that a request was issued when request evidence
requires one, then request identity. This fixed precedence yields
`AttemptIdMismatch`, `RequestNotIssued`, or `RequestIdMismatch` without losing
either the unchanged uncertain owner or the supplied attestation.

The current `LocalLogStorageAppendTerminalOutcome` variants are:
`HeadPresent(LocalLogStorageAppendHeadPresent)`,
`AttemptAborted(LocalLogStorageAppendAttemptAborted)`, or
`NotAttempted(LocalLogStorageAppendNotAttempted)`. The callback is a trusted
profile attestation: the core correlates it but cannot authenticate browser
events, physical storage, or the adapter's transaction reads. Terminal evidence
contains correlation and classification, not raw encoded frame bytes, and gives
the host no follower-selection or pop authority.

The adapter may report `TransactionCompleted` only after the single strict
`readwrite` transaction over all five stores emits terminal `complete` and all
required reads, checks, and writes have succeeded. It must have revalidated meta
and scope control, the selected transaction through both primary and committed-
head paths, the optional predecessor, selected checkpoint and active
generations, byte-exact selection JSON, expected writer pair, active Frame V1
policy, and the complete serialized tail. The final tail must have exactly one
of two shapes:

1. the valid prior prefix ends at the requested start, the target key is absent,
   and that transaction adds the exact requested complete frame as the final
   record; or
2. the target key already stores byte-identical complete frame bytes, the valid
   prefix immediately before it ends at the requested start, and no later
   record exists.

The second form is idempotent exact-final-tail qualification. Individual
IndexedDB request success, calling `commit()`, a transaction abort, partial
five-store work, different bytes, gaps, overlaps, malformed values, or later
records cannot produce `HeadPresent`.

Positive classification still advances nothing. Only the distinct consuming
`LocalLogStorageAppendHeadPresent::acknowledge_head` transition removes exactly
that one FIFO head. It returns
`LocalLogStorageAppendHeadAcknowledgementOutcome::Pending` with
`LocalLogStorageAppendHeadAcknowledged` when followers remain. That owner keeps
the token, limits, and final speculative cursor, decrements count and byte
accounting by exactly the acknowledged head, and promotes the allocation-
identical first follower. The caller can inspect the queue through `queue` or
recover it through `into_queue`; it must begin a fresh head attempt, issue its
request, and obtain a matching completed attestation before another
acknowledgement can occur.

When no follower remains, acknowledgement returns
`LocalLogStorageAppendHeadAcknowledgementOutcome::Drained` with
`LocalLogStorageAppendQueueDrained`. The drained owner retains the token, final
cursor, immutable limits, acknowledged request ID, and bounded acknowledged-head
metadata and can split the token, cursor, and limits through `into_parts`. This
is the only successful append transition that releases the speculative final
cursor. Neither outcome prints raw encoded payload bytes through `Debug`.

`AttemptAborted` and `NotAttempted` are negative owners, not acknowledgements.
They remove nothing and preserve the exact allocation graph, head, followers,
token, final cursor, limits, counters, and bytes for
`begin_exact_resubmission`. Resubmission creates a fresh attempt ID and restores
one-shot request eligibility, but does not prove an old copied request stopped.
Such a request can outlive the negative attestation
and still commit, so every invocation must retain exact-key/exact-bytes
idempotency. It also cannot refresh a stale token or authenticate the caller-
supplied base cursor.

Version `0.0.47` resolves a missing terminal callback only while one exact
volatile queue-owning source survives. Its request-correlated `readonly`
snapshot can derive exact retry, exact final-head presence, or a quarantined
indeterminate/collision/reset outcome; positive resolution still requires its
own explicit one-head acknowledgement. There is no process-restart
reconstruction, and dropping the owner loses the queue and correlation IDs.
IndexedDB `durability: "strict"` is only a hint requested from the browser; no
trusted callback or resolver observation proves media persistence.

A JavaScript adapter and real-browser profile validation remain later work.
Consuming exclusive-owner typestate still requires a separately specified held
lock, transaction-coupled semantic admission, or revocable/speculative branch
and is not part of Profile V1.

Repeated in-memory compaction still does not make file replacement
durable. Aggregate tail-size policy, migration, cryptographic integrity and
optional authenticity, authorization ownership, atomic checkpoint/log replace
and append/flush/fsync/ack behavior, actual crash-tail truncation, retry
reconstruction after process failure, rollback protection, and multi-writer
fencing remain separate storage-layer gates.
Asynchronous scheduling, batching choice, backpressure, cancellation, and
admission rate limiting remain host concerns. A host scheduler may not bypass
the core FIFO's head or acknowledgement transitions.
The log must not silently treat optimistic operation guards or caller-owned
lineage/revision values as exactly-once delivery. Browser `beforeinput`,
composition ownership, IME buffering, and paste chunking remain adapter
concerns. Presentation metadata stays outside the deterministic core;
subscriber lifecycle, catalog replacement, backpressure, and coalescing still
require a separate contract before exposing an observer API.

## Checkpoint-admitted browser projection (`0.0.51`)

`CheckpointedEditorEngine` seals the product engine behind one explicit
Session Checkpoint V1 policy. Construction encodes the initial session. Each of
the six effective mutation routes—action, selection, undo, redo, history-group
close, and history clear—then runs against a private candidate carrying the
same process-local engine and history identities. Only a successful complete
candidate checkpoint encoding permits one owner replacement and event return.
The wrapper exposes neither a mutable engine reference nor public cloning.

Alpha.3 adds combined close-before action, intent, undo, and redo routes. Each
closes an open merge group and executes the command on one private candidate,
then encodes the final session once. A command or checkpoint failure publishes
neither logical result; an effective boundary can still publish with a
disabled, unchanged, blocked, or unhandled command. The returned
`EditorHistorySequenceOutcome` retains the boundary and command results in
order without exposing the candidate.

A failed engine command or checkpoint representation drops the candidate and
returns no event. The authoritative state, history topology and stamp, cached
checkpoint bytes, and caller observation remain exact; the observation is
therefore reusable. Disabled actions and exact no-ops may return an observation
created from the discarded candidate because its immutable state and shared
identities are exactly equal to the unchanged owner. They do not pay the full
checkpoint encoding cost.

Representation errors retain either the existing typed `EditorEngineError` or
only the stable checkpoint codec category. Their `Debug` and `Display` surfaces
do not contain candidate document, selection, history, action input, or encoded
JSON. The Wasm adapter preserves the finite safe built-in input codes and maps a
checkpoint representation failure to its payload-free codec code and fixed
message.

This closes the former blind-state gap at the browser mutation boundary. A
live Wasm engine can always clone its already admitted canonical session
checkpoint, and its current document can always be read through a typed non-JSON
semantic projection. `commitJson` remains separately fallible: a complete
before/after commit can be larger than the admitted current-session checkpoint.

`BreditorProjection` owns an immutable snapshot-bound flattened preorder view.
It exposes schema identity, exact decimal snapshot identity, element/text kind,
qualified semantic element type, child indexes, text scalars, and semantic
format types. These indexes are ephemeral coordinates, not entity IDs. No DOM,
HTML tag, browser object, persistence record, or generic plugin protocol crosses
this Rust boundary.

A commit-bearing result can derive `BreditorProjectionUpdate`. Equal documents
produce `none`. Only all-`TextSplice`, all-text-change commits whose changed
containers are valid direct-root paragraphs in both states produce
`textContainers`. Exactly one operation plus one valid root children change
produces `rootSplice`. Every other changed document fails closed to `root`,
including multi-operation structural edits. Each update includes exact
base/result snapshots and owns a complete final projection, so classification
is never required for correctness.

The framework-neutral browser package consumes the generic view into a deeply
frozen base-text projection. Its DOM mapping is fixed and safe: the supplied
host represents the document root, property-free `<p>` elements represent
paragraphs, DOM text nodes represent text leaves, checked recipe wrappers
represent inline presentation, and projection-only `<br>` nodes keep empty
paragraphs visible. It never uses `innerHTML` or data-path attributes. Only
host, paragraph, and text nodes have exact private AST paths; wrappers and
placeholders are not semantic nodes.

Browser update admission independently proves the same lineage and exact
non-overflowing successor revision, then verifies all purportedly unchanged
paragraphs before reusing DOM. Text-container changes preserve the paragraph
element and replace its children. Root splices preserve exact prefix/suffix
paragraphs and rebind shifted snapshot-local paths. Broad impact, malformed
input, or retained DOM drift uses the complete safe projection. Out-of-band DOM
observation is asynchronous and browser DOM writes are not transactionally
atomic; unexpected write failure invalidates ownership and requires a full
render from the canonical projection.

The correctness cost is deliberate: every effective browser command currently
clones structurally shared candidate ownership and encodes the complete retained
session before publication, so admission time is linear in checkpoint size and
transient memory includes candidate plus encoded bytes. Semantic projection
also copies strings through Wasm and is synchronous. At the `0.0.51` checkpoint
there were no persistent node IDs, custom schema renderers, selection conversion,
event adapter, composition owner, clipboard policy, toolbar delivery, IndexedDB
I/O, or React runtime. Later sections record the selection, event,
composition, and clipboard additions. The full projection contract and limits are in
[`DOM_PROJECTION.md`](DOM_PROJECTION.md).

## Profile-aware browser AST projection (alpha.6)

Alpha.6 widens the browser consumer, not the Rust AST or operation language.
The consumed view is still one document, one or more direct-root paragraphs,
and nonempty text runs. A profiled run carries its complete canonical lexical
set of zero through 32 format kinds; the alpha.3 typed path also carries their
canonical scalar property entries. The legacy `strong` flag is only a
compatibility projection of `breditor/strong`. The browser verifies the schema
selector and fingerprint, every format and property against the compiled
descriptor, the adjacent-run canonicality law, Unicode, snapshot, and existing
document resource limits before minting an immutable projection.

A profiled projection is privately correlated with the exact owned
`CompiledProfileDescriptor` and live opaque profile generation that admitted
it. An update must preserve that profile binding as well as lineage and exact
successor revision. Descriptor equality by visible fields is not authority, and
recompiling equal bootstrap JSON creates a new generation that cannot consume
the old projection. The durable fingerprint, process-local profile generation,
and browser presentation identity remain three separate contracts.

Browser presentation is compiled all-or-nothing from one copied, frozen,
callback-free render manifest. Every descriptor-admitted format requires
exactly one recipe and no extra recipe is accepted. A property-free recipe
selects one element from the closed inline vocabulary, up to eight canonical
lowercase-ASCII class tokens, and bounded `before`/`after` format references.
Alpha.4 adds `<a>` only with the exact `breditor-link` class and a
`safeLinkV1` attribute policy. Missing targets, cycles, self-order, duplicate
relationships, duplicate element/class signatures, and mismatched property
descriptors fail startup. A topological order determines outer-to-inner
wrappers, with lexical format identity breaking unconstrained ties. Extension
registration and object iteration order never decide DOM nesting.

`safeLinkV1` must name the only two properties on its format. Both are
required: `href` is a string with the exact `1..=2048` UTF-8-byte bounds, and
the open-in-new-window value is Boolean. The browser normalizes and emits only
absolute, credential-free `http:` or `https:` URLs without control or
Unicode-whitespace scalars and within 2048 bytes before and after
normalization. A safe same-window link receives only `href`; a safe new-window
link also receives fixed `rel="noopener noreferrer"` and `target="_blank"`.
A schema-valid URL that fails browser policy produces an inert
`<a class="breditor-link">`, not an editor fault. The manifest cannot select
arbitrary attributes, styles, callbacks, raw HTML, URL schemes, `rel`, or
target values. Rust validates the declared string/Boolean shape and bounds; it
does not parse URLs or decide browser navigation safety.

Before parsing, the raw spelling must place a nonempty authority immediately
after exactly `http://` or `https://`. The authority is restricted to visible
ASCII and may contain neither percent escapes, backslashes, nor a raw `@`;
internationalized host names use their explicit `xn--` ASCII spelling. Excess
authority slashes and every other rejected spelling fail closed rather than
relying on URL-parser repair.

The renderer creates only paragraphs, text nodes, the exact compiled recipe
wrappers, and empty-paragraph `<br>` placeholders. It preflights the complete
262,144-node DOM amplification ceiling before mutation and never calls
`innerHTML`. Only the host, paragraph, and text nodes have AST mappings;
wrappers and placeholders are presentation artifacts. Exact wrapper tag, class
set, order, sole-child shape, text, or paragraph drift invalidates retained DOM
ownership. Incremental updates remain optional optimizations and can fall back
to a complete render from the canonical projection.

Selection maps a canonical wrapper boundary only through its bounded sole-child
chain to the underlying semantic text start or end. It does not invent a path
for a wrapper. Composition retains the existing one-range, one-paragraph lease:
the target may temporarily contain text and exact known recipe wrappers in
canonical order. A Link wrapper must use only an inert, canonical href-only, or
canonical href/rel/target shape; unknown elements, attributes, classes, wrapper
order, or branching fail reconciliation. A 1 MiB aggregate UTF-8 budget for
transient dynamic attribute values is spent before URL parsing. Accepted target
wrappers are stripped to text before one existing Rust insertion/deletion
action; the native DOM never becomes the AST. Every non-target paragraph and
all unchanged target text must still match the authoritative projection and
resolved attributes.

Copy and cut slice the semantic projection rather than reading DOM HTML.
Profile-aware HTML uses escaped paragraph/text output plus the exact compiled
element, class tokens, wrapper order, and `safeLinkV1`-resolved attributes for
each selected format. Unsafe Link values serialize as inert anchors. Paste
gives advertised `text/plain` absolute precedence. Only when it is absent may
the bounded parse5 path admit HTML whose repaired tree exactly matches the
active presentation, including one of the three canonical Link attribute
shapes; even then, all wrappers are deterministically flattened and one
plain-text action enters Rust. Source formatting and properties are not
transported, although the existing target pending/context-format rules still
apply. There is no rich-fragment round trip. Copy may also exceed the much
smaller one-action paste budget, so a successful Breditor copy is not promised
to fit one Breditor paste. Alpha.5 lets that target-context rule carry a typed
format such as Link across every non-empty line of a multiline paste; this does
not preserve any formatting from the clipboard source.

Canonical content export is selected before bytes are inspected. The legacy
engine emits exact-base Document V1. A compiled semantic profile emits
fingerprint-bearing Document V2 and the browser independently checks its schema,
format catalog, AST semantics, and current projection. A V2 failure is never
retried as V1. Plain-text export traverses the same owned projection and strips
all formats. Neither export reads mutable DOM.

Profile-aware IndexedDB uses a separately versioned outer record that binds one
resolved slot, schema fingerprint, and Session Checkpoint generation. Omitted
profile and scope preserve the exact legacy `"current"` outer-V1/Checkpoint-V1
bytes. A semantic profile defaults to its fingerprint as slot; a host may
instead choose a checked caller slot, and explicit base-profile scoping uses
Checkpoint V1 in the outer-V2 record. Checkpoint V1 accepts only the built-in
base fingerprint. Slots coexist without becoming a registry. The fingerprint
default is not document-scoped: same-schema lineages share the slot and stored
state wins, so multi-document hosts must provide distinct caller slots.

Before any semantic-profile storage load, the browser compiles and fully
releases the profile once to obtain a frozen handle-free descriptor. It selects
the fingerprint/Checkpoint-V2 binding from that preflight, loads only that slot,
then recompiles the same bootstrap for the live engine after the asynchronous
boundary. Startup requires the final schema name, version, fingerprint, and
complete ordered format kind/revision catalog to equal the preflight result
before autosave begins. A binding mismatch returns no CAS token and performs no
digest fallback, alternate-codec retry, deletion, repair, or write. The
deliberate double compilation is a bounded startup cost chosen so no generated
profile authority survives across IndexedDB.

An alpha.5 Bootstrap-V2 slot can contain Session Checkpoint V3 history with
typed structural operations. Alpha.4 used the same outer and checkpoint format
numbers but cannot restore that newer semantic history and fails startup
without replacing the evidence. Applications must not treat an exact format
number as permission to downgrade unpublished package versions.

This remains a sealed base-text editor, not a general rich-document system.
Alpha.4 supports only the closed Link presentation above, not general
property-bearing rendering. Arbitrary node kinds, headings, lists, tables,
images, embeds, format exclusions/normalizers, extension DOM or action
callbacks, rich paste, collaboration, CRDT/OT rebasing, remote selections, and
selective undo are not implemented. ProseMirror, Lexical, Tiptap, and CKEditor
remain design examples only; none of their AST, position, transaction, plugin,
step, or wire protocols is used.

## Guarded browser selection mapping (`0.0.52`)

The Wasm boundary now reads semantic selection through a separate observation-
guarded `BreditorSelectionResult`. A successful one-shot `BreditorSelection`
carries exact snapshot lineage/revision and either `none` or one directional
range. Range endpoints expose text/children kind, the target node's matching
projection preorder index, UTF-16 or child-boundary offset, affinity, and the
core-derived collapsed/forward/backward order. These values are a typed
rendering view, not selection JSON or a persistent position protocol.

`setRangeSelection` first checks the complete engine observation, then admits
two endpoints against the current document. All eight raw fields cross into
Rust as `JsValue`; point kind and affinity use strict equality against four
fixed JavaScript literals without copying untrusted strings into Wasm, while
node index and offset require actual finite integral number
primitives in `0..=u32::MAX`. Coercible arrays, booleans, numeric strings,
boxed primitives, `BigInt`, symbols, and caller conversion hooks are rejected
without invocation. Negative zero intentionally aliases zero. Core resolution
then rejects wrong targets, bounds, surrogate-pair midpoints, root boundaries,
and points outside base-schema text containers.

The guarded engine repeats the observation check and admits an effective
selection candidate only after complete checkpoint encoding. Consequently a
stale observation wins before scalar inspection, and every scalar, semantic,
or representation failure preserves exact state, history, pending formats,
checkpoint bytes, and observation. `clearSelection` uses the same publication
path. An exact range echo or repeated clear is unchanged; a real change clears
pending typing formats, closes an open merge group, advances the state revision,
creates no content-history entry, and produces a selection event whose document
impact is `none`.

The framework-neutral browser layer owns a deeply frozen `BaseRangeSelection`
bound by object identity to one `BaseDocumentProjection`. It independently
reconstructs preorder paths, validates endpoint shape and Unicode-scalar UTF-16
boundaries, recomputes spatial order, and rejects any mismatch with the Rust
view. The inverse adapter converts an owned browser range back to scalar command
fields but grants no observation authority and never invokes the engine itself.

`BreditorDomSelectionBridge` requires an owned current renderer handle and calls
its full synchronous canonical-DOM validator before every read or write. Exact
text nodes map at the same UTF-16 offset. Paragraph element offsets map to child
boundaries. The fixed `<strong>` edges normalize to their sole semantic text
leaf, and every canonical empty-paragraph `<br>` position normalizes to its sole
children boundary without assigning the placeholder an AST path. Only host
offset zero and the final host offset normalize to the first-start and last-end
paragraph positions for select-all; internal root boundaries remain ambiguous
and reject.

Anchor and focus are never sorted. An exact same-container, same-offset caret
uses `Range`, `removeAllRanges`, and `addRange` even when
`Selection.setBaseAndExtent` exists; this avoids WebKit exposing a transiently
stale `getRangeAt(0)` after an owned DOM replacement. Other programmatic writes
use `setBaseAndExtent` when available and verify the installed semantic
endpoints. A verified Range fallback is allowed for forward/collapsed
selections only. A backward write fails before mutation when direction cannot
be preserved. DOM has no affinity field, so new DOM input uses the frozen
boundary-derived rule: start and empty boundaries are `after`, a non-empty end
boundary is `before`, and an interior boundary is `after`.

One successful programmatic write records the renderer handle, generation, and
complete directional spatial signature. Exactly one matching read is labeled a
programmatic echo and reuses the original semantic range, preserving its point
aliases and affinities. The receipt is then consumed. Mismatch, drift, generation
change, outside-host selection, or failure clears it; a boolean suppression flag
is never sufficient.

Focus remains browser UI state. The bridge can report whether `activeElement`
is within or outside the host, but never calls `focus` or `blur`. No DOM range
or a range wholly outside the host is not translated to semantic `None`, and an
explicit clear never erases another editor's range. A cross-host or multi-range
selection fails closed.

The initial mapping is one-range and light-DOM only. At the `0.0.52` checkpoint,
shadow/composed ranges, node/grid/table selections, remote selections, internal
root-boundary bias, keyboard movement, composition, and input-event ordering
were not implemented; `0.0.53` through `0.0.56` add the closed event,
paragraph-local composition, base-subset clipboard, and queue-routed ordinary
selection-change slices described below. Node/grid/table, remote, shadow, and
multi-range selection remain absent.
Preorder endpoint lookup and full synchronous DOM validation are O(document)
within existing projection limits. The full contract and acceptance laws are in
[`SELECTION_MAPPING.md`](SELECTION_MAPPING.md).

## Guarded browser event delivery (`0.0.53`)

The framework-neutral browser package now reduces owned non-composition browser
signals to Breditor's own immutable command request. The request contains one
opaque adapter-issued delivery token, an exact semantic range captured against
that token's browser projection, bounded source metadata, an explicit history
requirement, and exactly one action/history command. At that historical
checkpoint a separate staged clipboard request also existed; `0.0.55` removes
it in favor of guarded capability handling before one ordinary engine command.
No native event, DOM node, target range, clipboard object, callback, promise, or
Wasm handle enters the queue.

The delivery token binds the exact projection object, current renderer handle
and generation, copied snapshot identity, adapter-private authority, and
observation epoch. Complete preflight spends the epoch before the first Wasm
call. Stale, foreign, replayed, or render-mismatched requests fail without being
rebound to a fresh observation. Browser event paths require a range; explicit
semantic absence is reserved for trusted API integrations and is never inferred
from missing DOM focus or selection.

The package root exposes the token only as an opaque type, with no public
constructor or issuer. A browser controller must be wired with the owning
adapter's distinct opaque `deliveryAuthority`; rejection happens before native
event cancellation and leaves pending keyboard/clipboard echo receipts intact.

`beforeinput` recognizes only the closed base editing set. Text is admitted as
valid scalar Unicode within 65,536 UTF-16 units and 65,536 UTF-8 bytes.
Replacement target ranges must exactly equal the captured selection. Collapsed
delete targets are validated but Rust retains ownership of grapheme deletion.
Unknown input types, unsupported shortcuts, malformed/multiple ranges, and
noncanonical DOM are not approximated. Keyboard events never supply text, and
composition evidence is delegated without producing an ordinary command.

A bounded synchronous FIFO prevents recursive command execution. Reentrant
submissions append in order. An executor or observer throw marks one exact
sequence uncertain, quarantines all followers, and never retries the head.
Generation-bound one-use receipts correlate the keydown/beforeinput/input and
clipboard-event echoes which browsers may emit for one physical edit; `input`
is always a postcondition and cannot submit a second Rust command.

The Wasm command adapter owns the generated observation and every temporary
result, error, projection-update, projection, and selection handle. Each
non-error result must obey its exact shape and successor law before adoption:
selection/action/undo/redo commits advance the same lineage by one and provide
an exact projection transition; effective history close, disabled, and
unchanged results retain the visible snapshot and provide no transition. A
disabled result must name the requested action. Aliasing any generated handles
is rejected.

After consuming the transition, the adapter updates the canonical DOM and
restores the exact semantic successor selection. Only frozen handle-free
metadata leaves the executor. A valid published semantic successor is retained
for explicit full-render recovery if DOM publication fails; stale or malformed
results and uncertain glue/cleanup failures fault the adapter permanently.

This sequence remains non-atomic across its separate selection prestage and the
later command: a selection update may publish before a command error. Alpha.3
makes the requested history close and following action, intent, undo, or redo
one checkpointed Rust publication, so an error discards both of those logical
results. DOM APIs still cannot participate in a Rust transaction. The queue
therefore fail-stops rather than retrying or pretending an earlier selection or
adopted combined result was undone. Clipboard mutation remained staged at
`0.0.53`. IME composition still required the separate temporary-DOM lease
implemented by `0.0.54`. The complete contract is in
[`BROWSER_EVENT_PIPELINE.md`](BROWSER_EVENT_PIPELINE.md).

## Guarded browser composition delivery (`0.0.54`)

Composition adds no new Rust wire format or Wasm method. The framework-neutral
browser controller captures one exact semantic range from a canonical connected
light-DOM render, acquires an otherwise idle queue built with the exact stable
Wasm adapter executor, and binds the projection, render, selection object,
snapshot, private authority, epoch, and nonzero session ID into an opaque lease.
Ordinary event, toolbar, API, observer, and reentrant delivery is rejected while
that lease remains active.

Before native mutation, exactly one target range may refine the leased selection
once and must remain in one paragraph. The renderer then temporarily makes its
public handle non-current while retaining opaque host ownership. At settlement,
all non-target paragraphs and unchanged text around the range must still match
the authoritative projection; the target accepts only bounded Unicode text,
the exact canonical wrapper chains from the projection's checked browser
presentation, a bare empty paragraph, or one sole empty-paragraph placeholder.
At alpha.4 an admitted Link wrapper has only the inert, canonical href-only, or
canonical href/rel/target attribute shape; unchanged Link wrappers must match
their projected values exactly. This is a strict replacement check, not a
DOM-to-AST parser.

The adapter spends the lease, full-renders the retained authoritative projection,
and restores the captured selection before the controller submits one existing
Rust command through the exact queue lease. Insert and selection-delete use a
`closeBefore` history requirement; cancellation submits `closeHistoryGroup`, so
each successful insert, delete, or cancellation settlement closes the preceding
merge group. Abort recovery makes no Wasm call and does not close history. Native
IME DOM never becomes a Breditor state. Strict-settlement failure enters
quarantine; exact-token recovery discards native DOM and restores projection/
selection without a Wasm call or semantic retry before releasing the queue.

The current contract supports one light-DOM range and one paragraph only. It has
no cross-block, shadow/composed-range, browser multi-range, arbitrary native
markup, or general mobile-browser guarantee. The task-scheduling hook is
synchronous and promise-free, but it must enqueue its callback for a future
task; command delivery is synchronous too. Deterministic DOM tests cover the
implemented event orders and all three bounded alias paths. The `0.0.59`
Chromium, Firefox, and WebKit matrix exercises this complete path with synthetic
composition events; it does not reproduce a real operating-system IME and
defines no separate mobile support matrix.

## Guarded browser clipboard delivery (`0.0.55`)

Clipboard handling adds no Rust wire format or Wasm method. The browser
controller requires a queue built with the same captured Wasm adapter executor
and obtains a private queue lease before inspecting an event, cancellation
state, DOM selection, `DataTransfer`, or clipboard string. It repeatedly proves
the same connected canonical render and one exact semantic range after each
caller-controlled effect boundary. Ordinary, toolbar, API, observer, and
reentrant submissions through that queue reject while this lease is held.
Direct adapter execution bypasses queue coordination, violates the low-level
integration contract, and is detected only at the next base revalidation. The
structurally checked JavaScript adapter surface is host-trusted until the
high-level runtime encapsulates this wiring.

Copy slices the directional selection's spatial extent directly from the
branded projection. Plain text joins paragraphs with LF; HTML uses escaped
text, attribute-free paragraphs, a sole `<br>` for an empty paragraph, and the
exact canonical wrapper chain from the projection's checked browser
presentation. Alpha.4 emits the `safeLinkV1`-resolved, HTML-escaped Link
attributes; unsafe schema-valid URLs produce an inert anchor. The legacy
unprofiled path emits only attribute-free `<strong>`.
Cut first clears the clipboard, writes `text/plain`, then writes `text/html`,
and confirms native cancellation. Only after all four steps succeed can one
`breditor/delete-selection` action with a `closeBefore` history boundary run.
Copy performs no Rust command, and a collapsed cut cannot delete.

Paste treats advertised `text/plain` as authoritative and never falls back to
HTML when that item is empty, invalid, oversized, or throws. HTML is read only
when plain text is absent. parse5 constructs a non-DOM fragment whose complete
repaired tree must contain only direct attribute-free `<p>` blocks, direct text,
canonical empty paragraphs, and either legacy one-level attribute-free
`<strong>`/`<b>` runs or exact profiled wrapper chains from the checked
presentation, with an optional exact fragment-comment pair. Profiled chains
are bounded to 32 wrappers and must preserve canonical outer-to-inner ordering
and exact tag/class signatures. Alpha.4 Link input additionally admits only an
inert anchor, one canonical safe `href`, or that `href` followed by exact
`rel="noopener noreferrer"` and `target="_blank"`. The admitted tree is
flattened with LF and passed to one atomic `breditor/insert-plain-text` action
with `closeBefore`; format structure and properties are deliberately not
preserved because the current action cannot represent mixed clipboard formats.

This is a repaired-tree policy, not a source-language sanitizer. Source wrappers
or attributes which parse5 discards are absent from the tree that admission
checks; for example, ignored `<html>`/`<body>` wrappers around an otherwise exact
paragraph do not themselves cause rejection. Any unsupported element,
attribute, or namespace that survives repair does fail closed, and no admitted
markup is ever installed in the editor DOM.

The parser and serializer reject ill-formed Unicode, HTML tokenizer-control
scalars, and Unicode noncharacters. An instrumented parse5 adapter bounds
transient node construction, tree-repair mutations, and the open-element stack
before the final repaired-tree audit enforces independent UTF-16/UTF-8, source,
result, node, depth, and paragraph limits. Files, images, custom MIME, and
arbitrary surviving clipboard structure fail closed. Copy/cut
can publish roughly 8 MiB of plain text, while the one-action paste boundary is
65,536 UTF-16 code units and 65,536 UTF-8 bytes; a successful Breditor copy or
cut is therefore not guaranteed to fit one Breditor paste. The controller
retains no event, DOM node, `DataTransfer`, Wasm handle, callback, or promise;
dispositions expose only bounded state and stable payload-free reasons.
Admitted paste text deliberately
becomes the bounded string-action payload, so the synchronous executor and any
application queue observer can see and retain it even though the package queue
does not retain the leased request after return.

A committed cut or paste records one post-command receipt tied to the exact new
render, delivery epoch, and operation. It can cancel one matching clipboard
`beforeinput` and consume one matching `input` postcondition (or consume the
`input` directly when `beforeinput` is omitted) without a second Rust command.
The ordinary controller delegates those clipboard input types. Separate
ordinary, composition, and clipboard controllers remain an explicit integration
burden until the unified router checkpoint.

Clipboard writes, event cancellation, Rust publication, DOM projection, and
selection restoration are not one rollback transaction. Known failure before a
cut command yields at worst copied data without deletion; known paste failure
cancels without insertion. Uncertainty after command submission is never
retried and requires canonical reconciliation. The async Clipboard API,
permission-driven programmatic operations, mixed-format rich paste, shadow or
multi-range ownership, and real-browser interoperability remain outside this
checkpoint. The exact contract is in [`CLIPBOARD.md`](CLIPBOARD.md).
