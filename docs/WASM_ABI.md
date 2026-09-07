# Breditor Wasm boundary

Status: `0.2.0-alpha.5` packaged boundary contract; ABI generation `3` is authoritative
for the matching official browser/Wasm packages, while direct raw-handle use is
an intentionally narrow, advanced, and experimental integration surface

The `publish = false` Rust crate remains a repository implementation artifact;
it is not a crates.io release because its `breditor-core` dependency has no
distribution source. Its reviewed `wasm-bindgen` output is now the publishable
`@breditor/wasm` ESM workspace package. `@breditor/browser` is separately
packaged and continues to consume structural generated views without an
import-time dependency on their concrete classes. A clean temporary consumer
installs both npm tarballs, initializes the real Wasm module, imports the
browser entry point, and type-checks without workspace paths.

`@breditor/browser@0.2.0-alpha.5` and `@breditor/wasm@0.2.0-alpha.5` are
supported as an exact-version pair. The generated raw classes and ownership
handles documented below remain available for advanced integrations, but they
are not the high-level browser compatibility surface.

Alpha.5 carries the Rust core's compiled semantic profile through ABI 3. A
strict bounded bootstrap request creates a reusable compiled-profile owner;
fresh and restore factories use fingerprint-bearing Document V2 and Session
Checkpoint V2. The profile descriptor and every engine-related owned result
can be checked against an opaque runtime generation that has no scalar or wire
representation. No-input semantic intents return committed, blocked,
unhandled, or error results with route provenance. The existing exact-base
Document V1 and Session Checkpoint V1 static engine factories remain as an
advanced compatibility path.

Generation requires `npm ci`, the locked Cargo graph, the pinned Rust toolchain
and Wasm target, exactly `wasm-bindgen 0.2.127`, and lockfile-installed
`rolldown 1.2.7`. Cargo uses the dedicated size-oriented `wasm-release`
profile, `wasm-bindgen` removes name and producer sections, and Rolldown
deterministically minifies the JavaScript glue while retaining its declaration
link. The build first writes an isolated directory, compares its declaration
byte-for-byte with the reviewed ABI, and only then replaces
`packages/breditor-wasm/dist`. The package check compares the complete content
hashes from two such clean builds. The no-argument default asynchronous
initializer is the supported `0.1.x` HTTP(S)-browser/browser-bundler entry
point. Advanced hosts may import `@breditor/wasm/wasm` and call `initSync`, but
synchronous, binary, argument-taking, and direct Node/file-URL initialization
carry no `0.1.x` compatibility promise.

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

The generated TypeScript declaration exposes the following opaque Wasm-owned
classes:

- `BreditorCompiledProfile` is a reusable immutable compiled-profile owner;
- `BreditorCompiledProfileResult` is its one-shot strict-bootstrap result;
- `BreditorCompiledProfileDescriptor` exposes bounded canonical declaration
  metadata without executable callbacks;
- `BreditorProfileGeneration` owns an opaque process-local correlation handle;
- `BreditorEngine` owns one profile-correlated editor session and its complete
  profile action-state cache;
- `BreditorObservation` owns the exact private engine/state/history token for
  one instant;
- `BreditorEngineResult` is the structured result of engine construction;
- `BreditorCommandResult` is a committed, disabled, unchanged, or error
  command outcome; and
- `BreditorIntentResult` is a committed, blocked, unhandled, or error semantic
  intent outcome with route provenance;
- `BreditorStringResult` is a successful one-shot string or a structured error
  from a fallible codec read;
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

`BreditorCompiledProfile.fromBootstrapJson(profileJson)` strictly decodes the
ABI-local `breditor/profile-bootstrap` version 1 envelope. The request names one
non-reserved profile schema and a bounded extension-manifest graph with
property-free inline formats and manifest-owned toggle bundles. Unknown,
missing, duplicate, malformed, oversized, over-count, unresolved, conflicting,
or otherwise uncompilable input fails closed with no partial profile. This
bootstrap shape is ABI-local configuration, not a durable manifest codec.

```json
{
  "format": "breditor/profile-bootstrap",
  "formatVersion": 1,
  "schema": { "name": "example/editor", "version": 1 },
  "extensions": [
    {
      "id": { "name": "example/highlight", "version": 1 },
      "dependencies": [],
      "conflicts": [],
      "inlineFormats": [
        { "kind": "example/highlight", "revision": 1 }
      ],
      "inlineFormatToggles": [
        {
          "formatKind": "example/highlight",
          "actionId": "example/toggle-highlight",
          "intentId": "example/toggle-highlight",
          "bindingId": "example/toggle-highlight-primary",
          "actionStateId": "example/control-highlight"
        }
      ]
    }
  ]
}
```

A successful result transfers one reusable `BreditorCompiledProfile` through
`takeProfile()`. `generation()` returns an independently disposable opaque
generation handle. `descriptor()` returns an independently disposable,
canonical descriptor containing the schema selector/fingerprint, every format
kind/revision, every intent input and state contract, and every action-state
contract plus its direct, routed, or history source.

`profile.createEngineFromDocumentJson(lineageId, documentJson,
historyCapacity)` strictly decodes Document V2 under that exact compiled schema.
`profile.createEngineFromSessionCheckpointJson(checkpointJson)` strictly
decodes and replay-proves Session Checkpoint V2. Both methods borrow rather than
consume the profile, so one profile can create multiple engine instances that
share its generation but reject each other's observations. Recompiling the same
bootstrap can preserve the durable fingerprint while minting a different
runtime generation.

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
observation cannot cross a reload or reconstruction boundary. These two static
factories are the explicit legacy path; their engines are correlated to a
fresh trusted built-in profile generation, but their document and checkpoint
egress remains V1.

A failed factory returns no partial engine. The result's engine can be taken at
most once. Its status changes from `engine` to `taken` after that transfer.

`breditorWasmAbiVersion()` returns the transport generation (`"3"`), while
`breditorVersion()` returns the crate release embedded in the module. A later
TypeScript package can reject an incompatible generated module without opening
or deserializing editor state.

## Observations and commands

`engine.observation()` returns an opaque, engine-created
`BreditorObservation`. Its public lineage, decimal revision, history capacity,
and undo/redo depths are informational. The private engine identity and history
stamp remain inside Rust and are never serialized. A raw-constructed JavaScript
wrapper is not a valid observation.

`engine.profileGeneration()` and `profile.generation()` return independent
opaque handles. `matchesProfileGeneration(generation)` is the only supported
comparison on the profile, descriptor, engine, observation, projection/update,
selection/result, action-state/result, command result, and intent result. The
opaque handle exposes no stable bytes or ordering and must never be persisted.
Two engines created by one reusable profile match the same generation but
still reject each other's observations through their separate engine identity.

Every command borrows an observation. The adapter first performs a read-only
admission check before action-ID or action-value construction, and the
`EditorEngine` repeats the full check immediately before command-specific work.
A successful admission check does not reserve the engine. If two queued
commands share one observation, the first effective mutation wins and the
second fails stale.

The action surface introduced in `0.0.50` is deliberately limited to:

- `executeNoInputAction`, for a compiled action whose registered descriptor
  declares no input; and
- `executeStringAction`, for a compiled action whose exact registered input
  contract is derived inside Rust.

The host cannot choose or spoof an input contract. String routing is an exact
allowlist of the action ID and registered contract/version for
`breditor/insert-text` and `breditor/insert-plain-text`; a future typed base
action fails closed until this ABI deliberately adds its input shape. This
covers the complete base action set supported by `0.1.0`; it is not a generic
third-party Wasm plugin ABI. Undo, redo, close-history-group, and clear-history
are separate guarded commands.

`executeNoInputIntent(expected, intentId)` is the alpha.5 portable semantic
surface. It first validates the complete observation, then parses the qualified
intent identity and requires that its descriptor declares no input. Routing,
action evaluation, transaction preflight, and route consumption complete once
inside Rust; no prepared route crosses Wasm and no handler is rerun. The owned
`BreditorIntentResult` reports `committed`, `blocked`, `unhandled`, or `error`.
It retains intent, selected/blocking binding and action, binding priority,
earlier disabled fallthroughs and reason details, blocked activation/value
indicator, a successor observation for every non-error outcome, Commit V2 and
projection update for a commit, and its profile generation. A generic typed
`ActionValue` JSON intent method is deliberately absent because the existing
contract identity does not define one portable value schema.

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

`engine.documentJson(expected)` is the guarded lossless content-egress read. It
checks the same complete engine, snapshot, and history observation before
encoding the current immutable document through the engine's sealed codec mode
with that state's exact compiled schema and resource limits. Legacy factory
engines return Document V1; compiled-profile factory engines return
fingerprint-bearing Document V2. Success is canonical compact JSON in a
one-shot `BreditorStringResult`; it contains the semantic
AST and its properties, entities, formats, and Unicode text, but deliberately
contains no selection, pending typing formats, snapshot identity, or history.
A selection-only or history-only publication therefore changes which
observation is accepted without changing the resulting document bytes.

The read is synchronous and non-mutating. Stale and foreign observations use
the existing guarded-engine codes. Any representation failure uses its stable
codec code and a fixed payload-free message; neither path returns partial
content. Callers that only need rendering should continue to use the non-JSON
projection instead of repeatedly encoding the whole document.

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

Every compiled profile catalog contains the three built-in,
presentation-independent observable IDs in canonical lexical order:

- `breditor/control-bold` directly prepares `breditor/toggle-strong`, so its
  enabled state and inactive/active/mixed indicator come from the same semantic
  evaluation a later click repeats;
- `breditor/control-redo` preflights the current redo branch; and
- `breditor/control-undo` preflights the current undo branch.

These observable IDs are not command IDs, labels, icons, shortcuts, or toolbar
positions. The browser manifest maps them to presentation and dispatch. An
extended profile catalog also contains its admitted routed action-state entries
without changing the flattened entry contract; alpha.5 transports them even
though the supported browser does not render their controls until alpha.7.

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
a separate fallible read, `stateJson()` remains a separate engine read, and
`documentJson(expected)` is a separately guarded lossless content read.
`sessionCheckpointJson()` clones canonical bytes that were encoded before the
current session became authoritative. It has no domain-error path for a live
engine, although allocation failure can still trap.

Every effective command executes on a private candidate with the exact same
profile, engine, and history observation identities. Rust encodes the complete
candidate in the engine's sealed Session Checkpoint mode—V1 for the legacy
factory, V2 for the compiled-profile factories—before replacing the
authoritative owner or returning its event. A checkpoint representation error therefore means no mutation was
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
order. At every generated-handle boundary the browser snapshots the callable
`free` method with its original receiver before inspecting `then` or any other
untrusted property. That immutable cleanup capability, rather than a later
property lookup, moves with an adopted observation or nested semantic view.
Aliases of a protected owner are rejected without inspecting or freeing them;
all other claimed handles are released exactly once even when a sibling getter
mutates or removes their public `free` property.

## Representation and resource limits

Durable document, state, checkpoint, and commit values cross as owned UTF-8 JSON
strings and retain their existing versioned codec contracts. The semantic
projection is an explicitly non-durable, non-JSON rendering view. Revisions
remain canonical decimal strings rather than lossy JavaScript numbers. History
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
browser package. Session-checkpoint scheduling and IndexedDB replacement are
implemented there at checkpoint `0.0.57`; the unified editable-host router is
also implemented there, and the React workspace supplies a reference framework
integration. Those remain TypeScript responsibilities outside this Rust/Wasm
ABI.
No exported Rust call invokes host JavaScript while holding the mutable engine,
so a well-typed call runs to completion. Raw JavaScript getters, proxies, and
numeric/string coercions can execute before Rust entry; the host queue must not
treat argument evaluation as part of the guarded mutation.

## Browser command and composition owner (`0.0.54`)

`BreditorWasmCommandAdapter` owns exactly one generated observation together
with the matching consumed browser projection, current renderer handle, and DOM
selection bridge. It does not own or free the generated engine. It issues
private-authority delivery tokens for that exact
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

## Browser checkpoint owner (`0.0.57`)

The framework-neutral browser adapter calls `sessionCheckpointJson()` only
through an observation-owning read port. It consumes the generated fallible-
string result, checks its exact Session Checkpoint V1 envelope, current
revision, history-base lineage, Unicode scalar representation, and 16 MiB
browser limit, then frees every generated result/error handle. Raw engine and
checkpoint-result objects never reach autosave or storage.

Alpha.5's `bootstrapWasmEngine` performs the one-shot ownership transfer for
both `BreditorEngine.fromDocumentJson()` and
`BreditorEngine.fromSessionCheckpointJson()`. It verifies the module's exact
ABI and package version before touching the factory; malformed, aliased,
thenable, or error results are freed and rejected without publishing an engine.
The Rust decoder remains authoritative for the complete nested V1 source
contract, while the browser additionally validates the returned base-profile
generation, descriptor, observation, and projection as one correlated result.

The command adapter emits a handle-free notification when—and only when—a
validated committed successor is adopted. This point precedes any later DOM
reconciliation or multi-stage delivery failure, so persistence cannot depend
on whole-queue success. A generated mutator that throws or returns a malformed
result before safe adoption instead creates fatal ABI uncertainty: the adapter
and queue fault, the checkpoint port reports terminal unavailability, and the
browser does not manufacture a commit claim.

The complete atomic single-slot storage and scheduling contract is in
[`SESSION_CHECKPOINT_STORAGE.md`](SESSION_CHECKPOINT_STORAGE.md).

## Generated declaration gate

`crates/breditor-wasm/api/breditor_wasm.d.ts` is generated by the exact
`wasm-bindgen` CLI version paired with the Rust dependency. Run
`./scripts/check-wasm-api.sh` to build the release Wasm module, regenerate the
declaration in an isolated `target` directory, and compare it byte-for-byte
with the reviewed snapshot. The declaration describes the transport types; it
does not replace the JSON codec contracts documented here and in
`DATA_CONTRACT.md`. The same gate runs a Node.js integration probe with the
locked workspace dependencies against the generated web glue to cover
ownership transfer, explicit disposal, numeric
admission, redaction, wrong-class rejection, and inert/freed-handle behavior
that direct Rust `wasm-bindgen-test` calls cannot exercise. Version `0.0.54`
also type-checks the generated command/observation/selection result classes
against the structural browser adapter and its composition owner, while the
glue probe exercises real selection-view lifecycles and proves that coercible
number/string objects cannot publish a selection mutation. Version `0.0.59`
additionally checks the generated guarded `documentJson` signature and exercises
its success, stale/foreign rejection, Unicode, canonical re-import, replay, and
one-shot result ownership through real glue. The browser matrix exercises
synthetic composition events in actual browser engines. OS-driven IME remains a
manual, out-of-scope validation item rather than a Wasm ABI claim.
