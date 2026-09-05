# Breditor Wasm boundary

Status: `0.0.56` boundary contract; intentionally narrow and unstable before
`0.1.0`

At this checkpoint the Rust crate and generated declaration are
repository-internal review artifacts. There is no installable npm package, and
the `publish = false` Wasm crate cannot complete an isolated Cargo package
verification until its `breditor-core` dependency has a distribution source.
The private `@breditor/browser` workspace package exercises the projection
boundary but is not published. Consumer packaging and clean-project
installation are release gate `0.0.58`.

The `breditor-wasm` crate is the synchronous, no-DOM adapter around the Rust
`CheckpointedEditorEngine`. Rust remains the sole owner of the document AST,
editor state, action evaluation, transactions, linear history, and durable
checkpoint validation. JavaScript receives observations and results; it cannot
install a state or publish a prepared transaction directly. An effective
mutation becomes visible only after its complete successor session checkpoint
encodes.

This is Breditor's own API. It does not implement a ProseMirror, Lexical,
Tiptap, or CKEditor protocol.

## Boundary objects

The generated TypeScript declaration exposes thirteen opaque Wasm-owned classes:

- `BreditorEngine` owns one editor session and the compiled base action
  registry plus its base action-state cache;
- `BreditorObservation` owns the exact private engine/state/history token for
  one instant;
- `BreditorEngineResult` is the structured result of engine construction;
- `BreditorCommandResult` is a committed, disabled, unchanged, or error
  command outcome; and
- `BreditorStringResult` is a successful string or a structured error from a
  fallible codec read;
- `BreditorError` contains a stable failure code and fixed redacted message;
- `BreditorProjectionResult` owns a guarded projection read or error;
- `BreditorProjection` is one flattened snapshot-bound semantic AST view; and
- `BreditorProjectionUpdate` owns a commit-derived invalidation description and
  complete final projection;
- `BreditorSelectionResult` owns a guarded one-shot semantic-selection read or
  error; and
- `BreditorSelection` is one snapshot-bound optional directional range view;
- `BreditorActionStatesResult` owns one guarded cache refresh result; and
- `BreditorActionStateSnapshot` is one complete immutable action-state view
  plus bounded changed-entry hints.

The boundary never forwards a core error's `Display` or `Debug` text. Domain
rejection is returned as data instead of using JavaScript exceptions as normal
control flow for calls that satisfy the generated TypeScript argument types and
use live handles. Raw JavaScript calls with a wrong primitive/class type can
coerce values, execute caller code, or throw in `wasm-bindgen`'s generated glue
before Rust receives the call. Allocation failure or a Rust panic traps; using
an inert or explicitly freed Wasm object throws or traps. WebAssembly is not a
process-isolation boundary.

The new selection-set fields are a deliberate exception to primitive
coercion: their generated declaration is precise, but their Rust ABI receives
opaque `JsValue` references and admits only actual number or string primitives.

No exported class exposes a mutable Rust reference. Wasm-generated `free()`
methods release handles and must not be called while the handle may still be
used. The generated TypeScript constructors are private, but the emitted
JavaScript classes cannot enforce a runtime-private constructor: raw `new` can
create an inert zero handle whose later use fails in glue. Generated pointer
bookkeeping is not a capability boundary and must not be exposed to hostile
same-realm code. Passing an inert or freed class instance into a mutating method
can fail after `wasm-bindgen` has borrowed the receiver and leave that receiver
unusable; discard it rather than attempting recovery. The framework-neutral
TypeScript facade keeps command-path raw handles behind its checked lifecycle
API.

## Engine construction

`BreditorEngine.fromDocumentJson(lineageId, documentJson, historyCapacity)`
strictly decodes Document V1 under the default base schema and interactive
resource limits, creates revision zero with no selection or pending formats,
and installs the bounded base-action session. `historyCapacity` must be a
finite whole JavaScript number in `0..=100`; the upper bound matches the Wasm
checkpoint admission policy so the factory cannot create a session that its
own default checkpoint decoder rejects solely because of capacity. The caller
owns the requirement that `lineageId` identifies one logically independent
history.

`BreditorEngine.fromSessionCheckpointJson(checkpointJson)` strictly decodes and
replay-proves Session Checkpoint V1 under the same default context. Restoration
always creates fresh process-local engine and history identities, so an old
observation cannot cross a reload or reconstruction boundary.

A failed factory returns no partial engine. The result's engine can be taken at
most once. Its status changes from `engine` to `taken` after that transfer.

`breditorWasmAbiVersion()` returns the transport generation (`"1"`), while
`breditorVersion()` returns the crate release embedded in the module. A later
TypeScript package can reject an incompatible generated module without opening
or deserializing editor state.

## Observations and commands

`engine.observation()` returns an opaque, engine-created
`BreditorObservation`. Its public lineage, decimal revision, history capacity,
and undo/redo depths are informational. The private engine identity and history
stamp remain inside Rust and are never serialized. A raw-constructed JavaScript
wrapper is not a valid observation.

Every command borrows an observation. The adapter first performs a read-only
admission check before action-ID or action-value construction, and the
`EditorEngine` repeats the full check immediately before command-specific work.
A successful admission check does not reserve the engine. If two queued
commands share one observation, the first effective mutation wins and the
second fails stale.

The action surface introduced in `0.0.52` is deliberately limited to:

- `executeNoInputAction`, for a compiled action whose registered descriptor
  declares no input; and
- `executeStringAction`, for a compiled action whose exact registered input
  contract is derived inside Rust.

The host cannot choose or spoof an input contract. String routing is an exact
allowlist of the action ID and registered contract/version for
`breditor/insert-text` and `breditor/insert-plain-text`; a future typed base
action fails closed until this ABI deliberately adds its input shape. This
covers the complete base action set planned for `0.1.0`; it is not a generic
third-party Wasm plugin ABI. Undo, redo, close-history-group, and clear-history
are separate guarded commands.

`engine.selection(expected)` returns a guarded, one-shot semantic selection
view correlated to the exact snapshot. `none` has no endpoint fields. `range`
preserves directional anchor and focus through point kind, target preorder node
index, UTF-16 or child-boundary offset, before/after affinity, and derived
collapsed/forward/backward order. The node indexes have exactly the same
snapshot-local meaning as the matching projection's flattened preorder values.

`setRangeSelection` and `clearSelection` are separate guarded mutations. The set
command accepts two scalar endpoint descriptions, validates the observation
before inspecting them, constructs core points against the current document,
and lets `CheckpointedEditorEngine` repeat the observation check and checkpoint
admission. All eight endpoint fields enter Rust as `JsValue`; exact primitive
string/number inspection rejects JavaScript wrapper objects and coercible values
while per-parameter generated TypeScript annotations retain literal unions and
`number`. A real change returns a selection event, clears pending formats, and
creates no content-history entry. An exact echo or repeated clear is unchanged.

Known invalid values for those two built-ins retain their finite, stable input
rule code (for example `breditor/insert-text-input-empty` or
`breditor/insert-plain-text-paragraph-limit`) with a fixed payload-free message.
Every other action-preparation source remains the generic redacted
`editor_engine.action_preparation` category.

Command status has these meanings:

- `committed`: an action, undo, or redo published a commit, or an effective
  history-only control published an event;
- `disabled`: action evaluation expectedly found the command unavailable and
  published nothing;
- `unchanged`: an undo/redo/history control had no effective work and published
  nothing; or
- `error`: validation, stale observation, preparation, or replay failed and the
  engine did not change.

Every non-error result owns the exact observation after that outcome. Disabled
and unchanged results therefore return an observation equal to the supplied
one; committed results return its successor. Callers should replace their
queued/rendered observation only from that returned handle or from a fresh
`engine.observation()`.

The generated declaration uses literal unions for status, event kind,
activation, and indicator-value status. These aliases make switches exhaustive,
but the raw class does not correlate sibling optional getters into a
discriminated union. The later framework-neutral TypeScript facade owns that
stronger result shape.

## Action-state observation

`engine.actionStates(expected)` exposes the core `ActionStateCatalog` and
`ActionStateCache` through a guarded, synchronous, non-JSON read. It checks the
complete engine/snapshot/history observation before consulting the cache. A
stale call returns the same redacted stale-engine category as other guarded
reads and leaves the prior cache observation installed.

The compiled base catalog has three presentation-independent observable IDs in
canonical lexical order:

- `breditor/control-bold` directly prepares `breditor/toggle-strong`, so its
  enabled state and inactive/active/mixed indicator come from the same semantic
  evaluation a later click repeats;
- `breditor/control-redo` preflights the current redo branch; and
- `breditor/control-undo` preflights the current undo branch.

These observable IDs are not command IDs, labels, icons, shortcuts, or toolbar
positions. The browser manifest maps them to presentation and dispatch. A
later extended catalog can add direct, routed, or history sources without
changing the flattened entry contract.

A successful result is `full`, `unchanged`, or `delta` and owns one complete
snapshot. `takeSnapshot()` transfers it exactly once and changes the result to
`taken`. The snapshot exposes its exact lineage/revision, canonical entry IDs,
resolved availability, activation, stable disabled/blocked reason code, and
typed value status/contract. Full baselines name every entry as changed, exact
cache hits name none, and deltas name the core-proved lexical unique subset.
Changed IDs are rerender hints only; consumers always receive the complete
snapshot and must not treat them as a durable patch or executable capability.

The `full`, `unchanged`, and `delta` relationship is relative to the engine's
single internal cache observation, not to any particular JavaScript consumer.
Core prior/new cache identities deliberately do not cross this first Wasm ABI.
Independent consumers must therefore install any complete successful snapshot
as their baseline and derive or verify changes against their own last-good
copy; they cannot apply `changedId` values blindly as a caller-correlated patch.

Only the stable disabled/blocked reason code crosses this action-state read.
The core may retain a bounded machine-readable reason detail, but this ABI does
not expose that detail to toolbar presentation. This keeps the first read
surface small and payload-minimal; richer dynamic disabled explanations require
a later explicit boundary addition.

The complete action-state view never serializes as JSON. A uniform bounded
`ActionValue` can be encoded separately with `entryUniformValueJson(index)`;
unsupported, unset, mixed, unresolved, and out-of-range entries return an
owned `BreditorStringResult` in `absent` state. This preserves the core's value
contract for future select, color, font, and plugin controls without forcing
every toolbar refresh through a complete JSON document. The isolated value
payload remains bounded by the core action-value limits.

Every numeric entry/change index is a raw generated `u32` parameter and shares
the projection getter's JavaScript-coercion limitation. The reviewed browser
adapter must admit exact nonnegative integers, verify complete cardinality,
lexical uniqueness, changed-ID subset membership, status/optional-field
coherence, and free the result, snapshot, nested value result, and cloned error
on all paths.

## Publication, projection, and serialization

A command result retains its sealed Rust `EditorEngineEvent`. `commitJson()` is
a separate fallible read, and `stateJson()` remains a separate engine read.
`sessionCheckpointJson()` clones canonical bytes that were encoded before the
current session became authoritative. It has no domain-error path for a live
engine, although allocation failure can still trap.

Every effective command executes on a private candidate with the exact same
engine and history observation identities. Rust encodes the complete candidate
Session Checkpoint V1 before replacing the authoritative owner or returning its
event. A checkpoint representation error therefore means no mutation was
published: state, history, cached bytes, and the supplied observation remain
exact and reusable. Disabled actions and exact no-ops do not re-encode.

Selection-only commits have equal before/after documents, so their projection
update impact is `none` even though the result snapshot revision advances. The
complete result projection remains available for the same recovery path as any
other commit-bearing event.

An encoding failure after a successful mutation must never turn the command
status into `error`: the mutation already published. `commitJson()` can still
fail because a complete before/after commit can exceed the output budget even
when the smaller current-session checkpoint was admitted. The caller keeps the
committed result and successor observation, renders through the semantic
projection, may report the separate codec failure, and must not retry the
original command. History-only events and unchanged/disabled/error results have
no commit; asking them for commit JSON returns an `absent` string result.

`engine.projection(expected)` checks the complete guarded observation and
returns a one-shot `BreditorProjectionResult`. A projection exposes schema and
snapshot identity plus a deterministic preorder array through bounded node,
child, text, and format getters. Its indexes have meaning only within that one
projection. A commit-bearing result can independently return
`projectionUpdate()` with exact base/result snapshot correlation, conservative
`none`, `textContainers`, `rootSplice`, or `root` impact, and a one-shot complete
final projection. Repeated `projectionUpdate()` calls create independent owned
views; callers should consume one and promptly free it.

No projection method emits HTML, DOM nodes, persisted JSON, entity identity, or
a generic extension-renderer instruction. The reviewed TypeScript adapter owns
base-schema interpretation and safe DOM construction. See
[`DOM_PROJECTION.md`](DOM_PROJECTION.md).

Retained results are deliberately independent: an engine survives freeing the
factory result after `takeEngine()`, a cloned observation survives freeing its
command result, a cloned error survives freeing its result, and a JavaScript
string returned by `takeValue()` survives freeing its string result. This also
means a committed result can retain a complete before/after edit until it is
released. `FinalizationRegistry` cleanup is nondeterministic and is not a memory
bound for a long editing loop.

The normal disposal sequence is: take the engine and free its factory result;
for each command, consume and free any string results and cloned errors, extract
the successor observation, free the command result, then free the superseded
observation; finally free the live observation and engine on teardown. A host
may use `Symbol.dispose` where available, but must preserve the same ownership
order.

## Representation and resource limits

Durable state, checkpoint, and commit values cross as owned UTF-8 JSON strings
and retain their existing versioned codec contracts. The semantic projection is
an explicitly non-durable, non-JSON rendering view. Revisions remain canonical
decimal strings rather than lossy JavaScript numbers. History
capacity and depths are bounded `u32` values after checked admission. A
successful `BreditorStringResult` supports `takeValue()` so a large encoded
value can cross without first being cloned inside Wasm; its status then changes
from `value` to `taken`.

Effective checkpoint admission currently clones structurally shared session
ownership and encodes the complete retained session synchronously. Time is
linear in checkpoint size and transient memory includes the candidate and
encoded bytes. This is the correctness-first implementation; later optimization
must preserve the same failure-atomic publication invariant.

Projection indexes cross raw glue as `u32`. JavaScript coercion can turn a
fractional or wider raw value into another in-range integer before Rust sees it.
The reviewed adapter therefore admits exact nonnegative integer indexes first.
The raw projection getters are read-only and cannot mutate the engine.

Selection mutation coordinates deliberately do not cross as raw Wasm numeric
parameters. Rust receives `JsValue`, accepts only an actual finite integral
number primitive in `0..=u32::MAX`, then validates the resulting point against
the core. Point-kind and affinity fields use strict equality against four fixed
JavaScript literals without copying an untrusted string into Wasm. Negative
zero is the one intentional numeric alias for zero.

Parameters exported as Rust `&str`—including lineage, JSON, action identity,
and action text—are copied by `wasm-bindgen` into Wasm memory before Rust can
apply its byte limits or stale-observation precedence. A hostile same-realm
caller can therefore cause allocation pressure before the core rejects an
oversized or stale value. Selection kind and affinity are the deliberate
exception: their `JsValue` path uses fixed strict-equality comparisons and does
not copy caller strings. Session-checkpoint restore is synchronous and its
bounded replay work can still block the browser main thread; the TypeScript
layer must schedule large loads deliberately.

JavaScript strings may contain unpaired UTF-16 surrogates, while Rust strings
contain Unicode scalar values. The generated glue can replacement-normalize an
unpaired surrogate before Rust observes it. Browser adapters that need to
distinguish this malformed input must reject it before crossing the boundary;
valid surrogate pairs and all Rust-representable Unicode are retained exactly.

The crate imports no DOM, IndexedDB, timer, clipboard, console, allocator, or
panic-hook API. DOM selection conversion, focus, non-composition event ordering,
bounded reentrancy, guarded command/result ownership, and the paragraph-local
composition lease are implemented by the framework-neutral browser package.
Clipboard data handling is implemented outside Wasm in the framework-neutral
browser package. A unified editable-host router, persistence scheduling, and
framework integration remain TypeScript responsibilities in later checkpoints.
No exported Rust call invokes host JavaScript while holding the mutable engine,
so a well-typed call runs to completion. Raw JavaScript getters, proxies, and
numeric/string coercions can execute before Rust entry; the host queue must not
treat argument evaluation as part of the guarded mutation.

## Browser command and composition owner (`0.0.54`)

`BreditorWasmCommandAdapter` owns exactly one generated observation together
with the matching consumed browser projection, current renderer handle, and DOM
selection bridge. It issues private-authority delivery tokens for that exact
observation/render epoch. A token is spent before the first Wasm call and cannot
be reused after any rejection.

The token has no public constructor. The adapter's separate opaque
`deliveryAuthority` capability is required by browser event admission and
consults the adapter's live state, so visible token diagnostics alone never
authorize event cancellation or echo suppression.

One accepted request synchronizes its already captured semantic selection,
optionally closes the history merge group, and then executes one action, undo,
or redo. The adapter verifies the exact result shape, handle distinctness,
lineage, revision transition, event kind, disabled action identity, and
projection-update correlation before adopting a successor. It consumes the
update, renders the result, reads the core selection, writes it to the matching
DOM generation, and independently frees old observations and temporary result
handles. The returned outcome contains only copied primitives, browser
projection values, and render metadata.

Stale structured errors, malformed results, generated-handle aliasing, and
uncertain glue or cleanup failures permanently fault the adapter and queue.
When a fully correlated semantic successor has published but DOM rendering or
selection installation fails, the successor is retained in an explicit
reconciliation state and can be full-rendered without retrying the command.
Selection synchronization and a history close are separate core publications,
so they can remain effective if the later command fails; the browser sequence
is non-interleaved but is not a rollback transaction.

Version `0.0.54` adds no composition class, DOM handle, event object, or host
callback to the Rust ABI. The TypeScript adapter instead reserves its exact
existing observation, projection, render, semantic selection, private epoch,
and an adapter-bound synchronous command queue under one opaque composition
token. Ordinary delivery is blocked while that lease is live. The renderer can
temporarily yield one paragraph-local light-DOM range to native IME mutation,
but no temporary DOM value crosses Wasm or becomes an engine observation.

At settlement, strict browser reconciliation derives at most one bounded plain-
text replacement from text/property-free-strong temporary DOM. The adapter
first restores the authoritative base projection and captured selection without
calling Wasm, then the exact queue lease submits one existing ABI command:
`insert-plain-text`, `delete-selection`, or `closeHistoryGroup` for cancellation.
Insert and delete request `closeBefore`, so every successful insert, delete, or
cancellation settlement is a history boundary. Abort recovery only restores the
retained projection and selection; it neither closes history nor retries or
synthesizes a Rust mutation.

The complete event, target-range, exact-once, FIFO, and recovery rules are in
[`BROWSER_EVENT_PIPELINE.md`](BROWSER_EVENT_PIPELINE.md).

A checkpoint is strictly decoded and replay-proved, but is not authenticated,
globally ordered, or fresh. Loading an older valid checkpoint deliberately
creates a new engine and can roll application state back. Authentication,
anti-rollback policy, and storage provenance belong to the host envelope.

## Generated declaration gate

`crates/breditor-wasm/api/breditor_wasm.d.ts` is generated by the exact
`wasm-bindgen` CLI version paired with the Rust dependency. Run
`./scripts/check-wasm-api.sh` to build the release Wasm module, regenerate the
declaration in an isolated `target` directory, and compare it byte-for-byte
with the reviewed snapshot. The declaration describes the transport types; it
does not replace the JSON codec contracts documented here and in
`DATA_CONTRACT.md`. The same gate runs a dependency-free Node.js probe against
the generated web glue to cover ownership transfer, explicit disposal, numeric
admission, redaction, wrong-class rejection, and inert/freed-handle behavior
that direct Rust `wasm-bindgen-test` calls cannot exercise. Version `0.0.54`
also type-checks the generated command/observation/selection result classes
against the structural browser adapter and its composition owner, while the
glue probe exercises real selection-view lifecycles and proves that coercible
number/string objects cannot publish a selection mutation. Real browser IME
coverage remains the `0.0.59` matrix gate rather than a Wasm ABI claim.
