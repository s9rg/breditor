# Breditor Wasm boundary

Status: the unpublished `0.3.0-alpha.7` source checkpoint uses ABI generation
`5` for the exact matching browser/Wasm pair. It retains the explicitly
selected typed-profile and Session-V3 path introduced in alpha.3 while
preserving the ABI-3-era V1/V2 entry points. Alpha.7 adds only canonical
typed-set presentation-correlation getters; it changes no bootstrap or durable
wire generation. Direct raw-handle use remains a narrow advanced integration
surface.

The `publish = false` Rust crate remains a repository implementation artifact;
it is not a crates.io release because its `breditor-core` dependency has no
distribution source. Its reviewed `wasm-bindgen` output is now the publishable
`@breditor/wasm` ESM workspace package. `@breditor/browser` is separately
packaged and continues to consume structural generated views without an
import-time dependency on their concrete classes. Alpha.8 adds the separately
packaged callback-free `@breditor/reference-highlight` proof. A clean temporary
consumer installs all three npm tarballs, resolves only package-root imports
inside its own `node_modules`, initializes the real Wasm module, type-checks,
bundles, and opens the reference profile in Chromium without workspace paths.

After publication, `@breditor/browser@0.3.0-alpha.7` and
`@breditor/wasm@0.3.0-alpha.7` must be installed as an exact-version pair. No
alpha.7 package has been published at this checkpoint; repository development
uses the local workspace/tarball smoke path. The generated raw
classes and ownership handles documented below remain available for advanced
integrations, but they are not the high-level browser compatibility surface.
The reference package likewise requires the exact browser peer so its branded
presentation values are created by the same module instance that admits them.

`0.2.0-alpha.5` carries the Rust core's compiled semantic profile through ABI 3. A
strict bounded bootstrap request creates a reusable compiled-profile owner;
fresh and restore factories use fingerprint-bearing Document V2 and Session
Checkpoint V2. The profile descriptor and every engine-related owned result
can be checked against an opaque runtime generation that has no scalar or wire
representation. No-input semantic intents return committed, blocked,
unhandled, or error results with route provenance. The existing exact-base
Document V1 and Session Checkpoint V1 static engine factories remain as an
advanced compatibility path.

`0.3.0-alpha.3` advances the transport to ABI 4. Explicit Profile Bootstrap V2
declares typed inline-format property contracts and set bundles; descriptors
and projections expose their canonical property metadata and values. Strict
typed action/intent JSON methods and explicit V3 profile factories carry that
data through Session, Editor State, and Commit V3. Bootstrap V1, compiled-
profile V2 factories, and exact-base V1 factories keep their prior meanings.

`0.3.0-alpha.4` added no ABI method; its safe-Link policy was browser-owned.
`0.3.0-alpha.5` also leaves ABI 4, Profile Bootstrap V2, descriptor/projection
shapes, and every codec generation unchanged. The existing string/no-input
action, intent, undo, redo, projection, and Session-V3 methods now observe typed
`ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` behavior because the
Rust core admits complete properties through those operations. There is no new
JavaScript structural-operation protocol.

Typed structural history uses the existing Operation/Session V3 property
records. Alpha.5 restores conforming alpha.4 checkpoints, but alpha.4 cannot
restore an alpha.5 Session Checkpoint V3 whose undo or redo history contains a
typed structural operation. An exact format number or equal ABI probe does not
make that unpublished-prerelease downgrade supported; official browser/Wasm
packages must remain exactly paired, and the browser never retries another
checkpoint factory.

Alpha.6 likewise adds no ABI method or record generation. A descriptor-declared
typed set intent can now target selected text across multiple paragraphs; Rust
returns the ordinary action/intent result and projection for one guarded
`RootTextReplace`. Existing action-state projection reports the generated
fixed-remove presence query as active, mixed, inactive, or unavailable. The
existing Session-V3 factory retains this operation on undo and redo branches.
Alpha.5 can restore and replay it because the operation payload and reducer
meaning were already complete; no action input or JavaScript planner is replayed.

Alpha.7 advances the Wasm transport to ABI 5. The compiled descriptor exposes
one canonical, process-local set-surface triple for each admitted typed setter:
format kind, intent ID, and action-state ID. Count and indexed getters add no
action or binding identity, callback, UI metadata, or durable bytes. The
browser correlates its own callback-free form declaration against that triple;
Profile Bootstrap V2, fingerprints, Document V2, and Session/State/Commit V3
remain byte-for-byte unchanged. The normative contract is in
[`TYPED_TOOLBAR_CONTROLS.md`](TYPED_TOOLBAR_CONTROLS.md).

Generation requires `npm ci`, the locked Cargo graph, the pinned Rust toolchain
and Wasm target, exactly `wasm-bindgen 0.2.127`, and lockfile-installed
`rolldown 1.2.7`. Cargo uses the dedicated size-oriented `wasm-release`
profile, `wasm-bindgen` removes name and producer sections, and Rolldown
deterministically minifies the JavaScript glue while retaining its declaration
link. The build first writes an isolated directory, compares its declaration
byte-for-byte with the reviewed ABI, and only then replaces
`packages/breditor-wasm/dist`. On supported POSIX build hosts (macOS and Linux,
including WSL), Rust source paths are remapped to canonical workspace, Cargo,
and target roots. A byte-level gate rejects the exact logical and physical
build-root prefixes plus common macOS, Linux, and Windows user-home path
patterns. Native Windows path handling is not currently an official
package-build host. The package check compares the complete
content hashes from two such clean builds. The no-argument default asynchronous
initializer is the supported `0.1.x`, exact-matched `0.2.x`, and alpha.7
HTTP(S)-browser/browser-bundler entry point. Advanced hosts may import
`@breditor/wasm/wasm` and call `initSync`, but synchronous, binary,
argument-taking, and direct Node/file-URL initialization carry no supported
high-level compatibility promise.

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
  metadata, including typed format-property contracts and ABI-5 typed-set
  format/intent/state correlation triples, without executable callbacks;
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
      "id": { "name": "example/highlight-extension", "version": 1 },
      "dependencies": [],
      "conflicts": [],
      "inlineFormats": [{ "kind": "example/highlight", "revision": 7 }],
      "inlineFormatToggles": [
        {
          "formatKind": "example/highlight",
          "actionId": "example/toggle-highlight",
          "intentId": "example/toggle-highlight-intent",
          "bindingId": "example/toggle-highlight-binding",
          "actionStateId": "example/highlight-control"
        }
      ]
    }
  ]
}
```

That exact reference definition compiles to
`sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`
and is exported as inert data by `@breditor/reference-highlight`. Changing its
schema selector, format identity/revision, or compiler contract requires a new
fingerprint-bearing Document V2. Changing only labels, classes, or wrapper
presentation does not. The bootstrap remains ABI-local configuration rather
than a public durable manifest protocol.

`BreditorCompiledProfile.fromBootstrapJsonV2(profileJson)` is the only Profile
Bootstrap V2 selector. It retains the V1 envelope identity and bounded extension
graph, sets `formatVersion` to `2`, and requires every manifest to contain
`inlineFormatPropertyContracts` and `inlineFormatSets` beside the existing
fields. Omitting those arrays does not silently mean empty. One representative
typed manifest is:

```json
{
  "format": "breditor/profile-bootstrap",
  "formatVersion": 2,
  "schema": { "name": "example/editor", "version": 1 },
  "extensions": [
    {
      "id": { "name": "example/link-extension", "version": 1 },
      "dependencies": [],
      "conflicts": [],
      "inlineFormats": [{ "kind": "example/link", "revision": 1 }],
      "inlineFormatPropertyContracts": [
        {
          "formatKind": "example/link",
          "properties": [
            {
              "name": "example/href",
              "presence": "required",
              "valueType": {
                "kind": "string",
                "minimumUtf8Bytes": 1,
                "maximumUtf8Bytes": 2048
              }
            }
          ]
        }
      ],
      "inlineFormatToggles": [],
      "inlineFormatSets": [
        {
          "formatKind": "example/link",
          "actionId": "example/set-link",
          "intentId": "example/set-link-intent",
          "bindingId": "example/set-link-binding",
          "actionStateId": "example/link-control"
        }
      ]
    }
  ]
}
```

Property presence is exactly `required` or `optional`. Value types are Boolean;
integer with both nullable `minimum` and `maximum` JavaScript-safe integer
fields; or string with inclusive `minimumUtf8Bytes` and `maximumUtf8Bytes`.
The 8 MiB whole-envelope ceiling, fixed count/string/depth bounds, duplicate-key
visibility, strict shape, canonical compilation, and payload-redacted errors
apply before a profile can be returned. Bootstrap V2 is still ABI-local
configuration, not a durable extension-manifest codec.

A successful result transfers one reusable `BreditorCompiledProfile` through
`takeProfile()`. `generation()` returns an independently disposable opaque
generation handle. `descriptor()` returns an independently disposable,
canonical descriptor containing the schema selector/fingerprint, every format
kind/revision and canonical property contract, every intent input and state
contract, and every action-state contract plus its direct, routed, or history
source. Property getters are `formatPropertyCount`, `formatPropertyName`,
`formatPropertyPresence`, `formatPropertyValueType`,
`formatPropertyIntegerMinimum`, `formatPropertyIntegerMaximum`,
`formatPropertyStringMinimumUtf8Bytes`, and
`formatPropertyStringMaximumUtf8Bytes`.

`profile.createEngineFromDocumentJson(lineageId, documentJson,
historyCapacity)` strictly decodes Document V2 under that exact compiled schema.
`profile.createEngineFromSessionCheckpointJson(checkpointJson)` strictly
decodes and replay-proves Session Checkpoint V2. Both methods borrow rather than
consume the profile, so one profile can create multiple engine instances that
share its generation but reject each other's observations. Recompiling the same
bootstrap can preserve the durable fingerprint while minting a different
runtime generation.

`profile.createEngineFromDocumentJsonV3(lineageId, documentJson,
historyCapacity)` explicitly starts a Session-V3 engine from Document V2.
`profile.createEngineFromSessionCheckpointJsonV3(checkpointJson)` explicitly
decodes and replay-proves Session Checkpoint V3. These engines use Editor State
V3 and Commit V3 egress while `documentJson()` remains Document V2. There is no
Document V3. The unsuffixed profile factory names above keep selecting Session
V2; neither factory family sniffs or converts another generation.

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

`breditorWasmAbiVersion()` returns the transport generation (`"5"`), while
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

ABI 4 adds
`executeTypedActionJson(expected, actionId, inputJson, closeHistoryGroupBefore)`
and
`executeTypedIntentJson(expected, intentId, inputJson, closeHistoryGroupBefore)`.
They first validate the complete observation and identity, then derive the exact
registered value-contract name and version inside Rust. The caller supplies
only JSON and cannot forge that contract identity. The strict bounded decoder
retains duplicate-key visibility and rejects duplicates, invalid shape, floats,
unsafe integers, excessive nesting/count/text/key bytes, and contract mismatch
without retaining the rejected payload in its error.

All ABI-4 action, intent, undo, and redo commands accept the same Boolean close
option. When true, Rust closes an open merge group and executes the requested
command on one private candidate, encodes the final combined checkpoint once,
and publishes both results or neither. A command or checkpoint error discards
the boundary too; a disabled, unchanged, blocked, or unhandled command can
still publish an effective boundary. `historyGroupClosedBefore` on the command
or intent result says whether that boundary was effective. Command evaluation
and action preparation remain single-pass. Selection synchronization remains a
separate guarded publication.

The portable semantic surface introduced in alpha.5 is now
`executeNoInputIntent(expected, intentId, closeHistoryGroupBefore)`. It first
validates the complete observation, then parses the qualified
intent identity and requires that its descriptor declares no input. Routing,
action evaluation, transaction preflight, and route consumption complete once
inside Rust; no prepared route crosses Wasm and no handler is rerun. The owned
`BreditorIntentResult` reports `committed`, `blocked`, `unhandled`, or `error`.
It retains intent, selected/blocking binding and action, binding priority,
earlier disabled fallthroughs and reason details, blocked activation/value
indicator, a successor observation for every non-error outcome, the
mode-selected Commit V2 or V3 and projection update for a commit, and its
profile generation. ABI 4's typed JSON intent method uses the same routing and
result contract for descriptor-declared typed inputs.

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

- `breditor/control-bold` routes the no-input `breditor/format-strong` intent
  through its priority-zero blocking binding to `breditor/toggle-strong`, so
  its enabled state and inactive/active/mixed indicator come from the same
  semantic route a later supported click repeats;
- `breditor/control-redo` preflights the current redo branch; and
- `breditor/control-undo` preflights the current undo branch.

These observable IDs are not command IDs, labels, icons, shortcuts, or toolbar
positions. The browser manifest maps them to presentation and dispatch. An
extended profile catalog also contains its admitted routed action-state entries
without changing the flattened entry contract; Alpha.7 admits their supported
native-button controls after exact descriptor validation.

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

The `0.2.0-alpha.7` browser consumer additionally correlates every complete snapshot
with the owned descriptor's exact action-state count, lexical IDs, activation
contracts, and value-contract name/version before publication. This is a
browser admission check over ABI 3, not a new ABI generation. Missing, extra,
reordered, duplicate, or drifted catalogs fail closed without replacing the
last-good browser snapshot.

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
factory, V2 for Bootstrap-V1 compiled-profile factories, and V3 for the
explicit Bootstrap-V2/V3 factories—before replacing the
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

For each format occurrence, `formatPropertyCount`, `formatPropertyName`, and
`formatPropertyValueKind` expose the canonical property sequence.
`formatPropertyBoolean`, `formatPropertyInteger`, and `formatPropertyString`
return the exact scalar through its declared kind-specific getter. Missing,
wrong-kind, and out-of-range indices are absent rather than coerced. The browser
consumer validates these values against the compiled-profile descriptor before
publishing its deeply frozen semantic projection.

No projection method emits HTML, DOM nodes, persisted JSON, entity identity, or
a generic extension-renderer instruction. The reviewed TypeScript adapter owns
exact-base or compiled-profile-descriptor interpretation and safe DOM
construction. See
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

Caller-owned arrays used to enumerate protected handles are copied through at
most 64 dense own data descriptors. Sparse arrays, indexed or length accessors,
custom own iterators, over-limit inputs, and descriptor failures reject before
handle ownership changes; the adapter does not execute indexed getters or the
iteration protocol. A JavaScript `Proxy` can still execute its own descriptor
traps, so advanced structural adapters and caller mutation remain host-trusted.

The browser's native-event boundary is likewise outside the Rust ABI. Alpha.6
reads branded `Event`-family, `DataTransfer`, and `AbstractRange`/`Range`/
`StaticRange` facts and methods from the realm's platform prototype chain,
ignoring own and intermediate-prototype shadows. Direct structural controller
calls and replacement of the realm's actual platform globals or prototypes are
trusted integration behavior rather than a sandbox guarantee.

## Representation and resource limits

Durable document, state, checkpoint, and commit values cross as owned UTF-8 JSON
strings and retain their explicitly selected V1/V2/V3 codec contracts. Document
itself has only V1 and V2; typed profile engines use Editor State, Commit, and
Session Checkpoint V3 around Document V2. The semantic
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

One accepted request synchronizes its already captured semantic selection, then
passes the optional close-before requirement into exactly one action, intent,
undo, or redo call. Rust runs the requested history close and command on one
private checkpointed candidate and publishes both or neither. The generated
result's `historyGroupClosedBefore` flag reports an effective boundary. The
adapter verifies that flag together with the exact result shape, handle
distinctness, lineage, revision transition, event kind, disabled action
identity, and projection-update correlation before adopting a successor. It
consumes the update, renders the result, reads the core selection, writes it to
the matching DOM generation, and independently frees old observations and
temporary result handles. The returned outcome contains only copied primitives,
browser projection values, and render metadata.

Stale structured errors, malformed results, generated-handle aliasing, and
uncertain glue or cleanup failures permanently fault the adapter and queue.
When a fully correlated semantic successor has published but DOM rendering or
selection installation fails, the successor is retained in an explicit
reconciliation state and can be full-rendered without retrying the command.
Selection synchronization remains a separate core publication and can remain
effective if the later command fails. The requested history close cannot: it is
checkpoint-admitted atomically with the action, intent, undo, or redo. The
browser sequence is non-interleaved but DOM publication is not part of that Rust
transaction.

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

In alpha.3, `bootstrapWasmEngine` keeps those exact-base V1 and Bootstrap-V1
profile/V2 paths, and adds the explicit Bootstrap-V2 selector. That selector
requires ABI 4, calls only the V3-suffixed profile factories, validates Session
Checkpoint V3 around Document V2, and returns a property-bearing projection
correlated with the descriptor. The high-level owner records
`checkpointFormatVersion: 3` in the existing profile-bound outer IndexedDB
record, validates that binding before restore, and uses the same generation for
autosave capture. It never retries the bytes through a V2 or V1 factory.

The browser's Session V3 validation is a bounded structural and binding
preflight, not a second checkpoint implementation. It does not replay history
or exactly reproduce the Rust codec's aggregate retained-node, text, and
property limits. `createEngineFromSessionCheckpointJsonV3()` remains
authoritative for complete decode, resource-limit enforcement, canonicality,
and replay; a checkpoint that passes browser preflight can still fail closed in
that factory.

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
