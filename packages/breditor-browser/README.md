# `@breditor/browser`

`@breditor/browser` is Breditor's framework-neutral browser editing layer.
Version `0.0.58` adds the public `BreditorBrowserEditor` owner around the
lower-level behavior implemented through `0.0.57`: it boots the generated
Rust/Wasm engine, renders the validated base-schema AST into disposable DOM,
maps one directional selection, serializes ordinary browser intent, and owns a
strict paragraph-local composition lease plus guarded copy/cut/paste without
making the DOM or clipboard HTML an editor model. It also consumes guarded
action-state snapshots, queue-routes real document selection changes, and
renders an extensible accessible toolbar without making display state an
execution capability. It also restores and atomically autosaves complete Rust
session checkpoints through a strict single-slot IndexedDB profile.

The owner installs the unified native-event router, action-state refresh,
optional declarative toolbar, and optional atomic IndexedDB autosave as one
all-or-nothing lifetime. A React Strict Mode reference lives in the repository's
`examples/react` workspace, but the product API remains framework-neutral.

The package has a public ESM entry point. Its pre-`0.1` contract remains
unstable, but a clean npm tarball is install-, import-, and type-check tested
without workspace links. Declaration maps are intentionally omitted because
the corresponding TypeScript sources are not part of the published package.

The package root is the narrow high-level editor API. Lower-level renderer,
queue, adapter, selection, clipboard, toolbar, and persistence contracts are
available from the explicit `@breditor/browser/advanced` entry point.

## Public runtime

Initialize the matching `@breditor/wasm` package once, then pass connected,
empty editor and optional toolbar mounts to `openBreditorBrowserEditor`:

```ts
import { openBreditorBrowserEditor } from "@breditor/browser";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

await initializeWasm();

const result = await openBreditorBrowserEditor({
  host: document.querySelector("#editor") as HTMLElement,
  label: "Notes",
  wasm: breditorWasm,
  initialDocument: {
    lineageId: "notes-main",
    documentJson: EMPTY_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
  toolbar: { host: document.querySelector("#toolbar") as HTMLElement },
  persistence: {
    indexedDB: window.indexedDB,
    crypto: window.crypto.subtle,
  },
});

if (!result.ok) throw new Error(result.error.message);
const editor = result.editor;
```

The Rust AST, selection, action state, history, and checkpoint remain
authoritative. The editor exposes immutable status snapshots, bounded
subscription, focus, persistence flush/retry, and idempotent disposal; it does
not expose its engine, queue, observation, renderer, or delivery tokens.
`initialDocument` is ignored when a valid stored session checkpoint exists.
Call and await `flushPersistence()` before controlled navigation when saving
matters, then call `dispose()`; disposal itself does not promise a save.

## Boundary

The Rust/Wasm adapter supplies a flattened, typed semantic projection. The
browser package consumes that view into a branded, deeply frozen
`BaseDocumentProjection`; it never parses document, editor-state, or commit
JSON. The adapter is structural and has no import-time dependency on generated
Wasm classes. Consumed Wasm projection and update handles are deterministically
freed on success and failure.

The accepted semantic shape is deliberately closed:

- schema `breditor/base`, version `1`;
- one or more direct-root `breditor/paragraph` elements;
- non-empty text leaves with either no format or one property-free
  `breditor/strong` format; and
- exact snapshot identity with a portable lineage and canonical decimal `u64`
  revision.

Projection construction rechecks the base-schema shape, canonical adjacent-run
law, Unicode scalar validity, and the Rust default node/text limits. It clones
and freezes all accepted arrays and records.

## DOM contract

`BreditorDomRenderer` receives an application-owned HTML host. Below that host
it creates only:

- one `<p>` for each direct-root paragraph;
- one `<strong>` around a strong text leaf;
- one `<br>` placeholder inside an empty paragraph; and
- DOM text nodes created with `createTextNode`.

The renderer never calls `innerHTML`, installs untrusted markup, or stores AST
paths in `data-*` attributes. It does not modify the host's own attributes.
Host, paragraph, and text nodes are the exact AST-backed mappings. Formatting
wrappers and empty-paragraph placeholders are projection artifacts and are not
reported as AST nodes.

Each successful render returns an opaque `RenderedProjection` with a renderer
generation and two private indexes: `WeakMap<Node, AstPath>` for DOM-to-AST
lookups and `Map<AstPathKey, Node>` for AST-to-DOM lookups. Paths are meaningful
only for that handle's exact snapshot. A handle returns `null` after another
renderer generation owns the host, after `release`, or after a mutation observer
detects out-of-band projection changes.

## Incremental invalidation

`BaseProjectionUpdate.create` accepts branded base/result projections only. It
requires the same lineage and the exact non-overflowing `u64` successor
revision. It then verifies the claimed semantic impact before the renderer can
reuse any DOM:

- `none` proves every paragraph equal and advances the generation without
  replacing its DOM;
- `textContainers` proves every unnamed paragraph equal, retains every
  paragraph `<p>` identity, and refreshes only the named paragraphs' contents;
- `rootSplice` proves exact unchanged prefix and suffix ranges, retains those
  paragraph elements, and rebinds shifted suffix paths; and
- `root`, `multipleOperations`, and `untrusted` deliberately perform a full
  safe projection.

A false narrow-impact claim is rejected before mutation. If a paragraph marked
for retention no longer has the exact DOM shape previously rendered, the
renderer discards the fast path and installs a full projection. This makes the
incremental hints an optimization, never a correctness requirement.

## Post-publication recovery

The semantic projection view is intentionally separate from bounded JSON
encoding. After Rust has published a command, an oversized state/checkpoint
JSON result must not leave the browser unable to render that state. The adapter
must request the result's typed semantic projection directly. If an incremental
update is missing, consumed, malformed, or conservatively classified, the host
can obtain a complete typed projection and call `render`.

## Selection contract

`BaseRangeSelection` owns a deeply frozen anchor/focus pair tied to one exact
`BaseDocumentProjection`. Text offsets are UTF-16 code units shared with DOM
Range and Rust points, but a boundary inside a surrogate pair is rejected.
Children points address only paragraph boundaries. Direction is derived without
sorting the stored endpoints, and before/after affinity remains explicit even
though DOM has no native affinity field.

`consumeSemanticSelection` consumes and frees the one-shot Wasm view, verifies
its snapshot, preorder node kinds/indexes, offsets, affinities, and duplicated
range order, then produces a branded browser selection or explicit semantic
absence. `semanticRangeSelectionScalars` performs the inverse path-to-preorder
conversion for the guarded Wasm set command. The adapter has no import-time
dependency on generated Wasm classes.

`BreditorDomSelectionBridge` synchronously validates the complete canonical DOM
before every read and write. It maps exact text and paragraph nodes, normalizes
the fixed `<strong>` and empty `<br>` artifacts, and maps only the host's two
exterior select-all boundaries. It preserves anchor/focus direction, refuses to
silently reverse a backward range, and assigns the fixed boundary-derived
affinity policy to genuinely new DOM input.

A programmatic write records one renderer-generation-bound spatial signature;
exactly one matching `selectionchange` echo can reuse the original semantic
affinities. Focus is observed separately. The bridge never calls `focus()` or
`blur()`, and clearing semantic selection does not erase a DOM selection wholly
outside this host.

## Event and command contract

`BreditorBrowserEventController` snapshots `beforeinput`, `keydown`, and `input`
fields synchronously. It accepts only events owned by
the exact connected light-DOM host, maps the current DOM selection through the
same bridge used by the command adapter, normalizes at most one target range,
and discards every native object before queue admission.

Controller construction also requires the opaque `deliveryAuthority` exposed
by that adapter. The package exports `EditorDeliveryToken` only as an opaque
type, not as a constructible value. Foreign, stale, forged, or spent tokens are
rejected before cancellation and cannot consume keyboard or clipboard receipts.

The recognized non-composition set covers text and multiline text insertion,
paragraph insertion, backward/forward/selection deletion, strong formatting,
undo, and redo. Unknown edit intents are blocked instead of approximated.
Keyboard input never supplies text; an explicit host policy selects
`beforeinput`-primary behavior or the narrow Backspace/Delete/Enter fallback.
AltGraph, dead keys, key code 229, and active composition are delegated to the
separate composition controller.

`BreditorCommandQueue` is a bounded synchronous, non-recursive FIFO. Reentrant
delivery appends. An executor or observer throw permanently quarantines the
queue because the head may already have published; no item is retried.
Generation-bound one-use receipts suppress matching keydown and clipboard event
echoes, while `input` is only a postcondition and never executes a second
command. A composition can reserve a completely idle queue for one
never-queued settlement. Ordinary event, toolbar, API, observer, and reentrant
submissions reject while the exact lease remains active.

`BreditorWasmCommandAdapter` owns the exact observation, browser projection,
renderer handle, selection bridge, and private one-use delivery epoch. One
engine request synchronizes its already captured semantic selection, optionally
closes a history group, executes one action/undo/redo, validates the exact
successor and projection update, updates the DOM, restores the resulting core
selection, and frees all generated handles before returning a handle-free
outcome. A valid semantic successor whose DOM publication fails is retained for
explicit full-render recovery; malformed or stale results fault the adapter.
Generated cleanup methods are captured with their original receivers before
any other untrusted handle property is inspected, so later getter-driven
mutation cannot redirect or suppress cleanup. The adapter does not own the
generated engine; its enclosing runtime must free that engine after disposing
the adapter.

## Composition contract

`BreditorCompositionController` owns one native IME interval independently of
the ordinary event controller. It requires a queue constructed with the exact
stable `adapter.commandExecutor`; a forwarding wrapper is rejected. At start it
captures one canonical light-DOM range, reserves the idle queue, and moves the
adapter into an exact session/selection/render-bound composition state. Normal
delivery tokens and direct adapter execution are unavailable until settlement
or recovery closes that state.

The first composition `beforeinput` maps exactly one target range while the DOM
is still canonical. It may refine the captured range once, requires both
endpoints in one paragraph, and only then opens renderer-owned native DOM
mutation. The old render becomes non-current and its mappings are unavailable,
but the renderer retains the opaque ownership needed to restore it. Native
events, target-range objects, DOM `Selection` objects, and event-derived DOM
nodes do not enter the state machine or queue.

The controller accepts explicit start, update-before-beforeinput, implicit
start from composition `beforeinput`, reconversion deletion, and terminal
composition event/input orders. Standard composition input types are joined by
three bounded active-composition aliases: `insertText`,
`deleteContentBackward`, and `deleteContentForward`. These aliases do not claim
general mobile-browser support.

Settlement is scheduled after the native event task. A custom scheduler must
synchronously enqueue and return `void`, but must not invoke the callback
inline; commands themselves remain synchronous. Reconciliation accepts one
target paragraph which is empty, contains only text and property-free
`<strong>` structure, or uses one sole empty `<br>` placeholder, while every
other paragraph and all text outside the target must still match the Rust
projection. This temporary DOM is evidence only and is never installed as AST
state.

The adapter full-renders the authoritative base and restores the captured
selection before one leased Rust submission. Insert and delete use
`closeBefore`; cancellation explicitly closes the history group too. Strict
settlement requires the exact token and renderer lease. If that proof is lost,
deferred exact-token recovery discards native DOM and restores the retained
authoritative projection without calling Rust. Recovery failure keeps both the
controller and queue quarantined. A successful settlement may suppress one
exact late terminal `input` echo.

## Clipboard contract

`BreditorClipboardController` independently owns synchronous copy, cut, paste,
and their exact optional event echoes. It reserves the queue built from the
exact adapter executor before reading an event, clipboard capability, or DOM
selection. Copy slices the semantic projection, never DOM markup. Cut writes
both `text/plain` and escaped attribute-free paragraph/strong HTML, confirms
native cancellation, and only then submits one selection deletion. Paste gives
advertised plain text precedence; HTML is considered only when plain is absent,
then must pass a parse5-backed closed allowlist and is flattened for one atomic
plain-text insertion.

The controller never retains an event, `DataTransfer`, clipboard payload, or
generated handle. A command failure is never retried, and clipboard/core work
cannot be rolled back as one transaction. `BreditorBrowserEditor` installs the
unified router which gives composition first refusal, then clipboard, then
ordinary input. Advanced integrations assembling the lower-level controllers
must preserve that exact precedence and route clipboard-shaped
`beforeinput`/`input` only to the clipboard controller; the ordinary controller
reports `clipboardOwns` for those input types. Clipboard limits and failure
semantics are summarized here so the published package does not depend on a
repository-only documentation link.

This low-level wiring is host-trusted: the controller structurally snapshots an
adapter-compatible JavaScript surface, and its lease excludes only submissions
through the shared queue. Forging or mutating that surface, or calling the
adapter directly during a clipboard callback, violates the integration
contract. A direct state change is detected at the next guarded base check but
cannot undo an already completed clipboard side effect. The package-root
high-level runtime encapsulates these pieces for ordinary consumers.

## Action state and toolbar

The observation-owning command adapter exposes a handle-free action-state read
port. It consumes and frees the generated result, complete snapshot, nested
value results, and cloned errors internally, while protecting the adapter's
live observation from aliasing. `BreditorActionStateStore` publishes only
validated complete snapshots, keeps the last good value on failure, and offers
synchronous ordered subscriptions suitable for a command-queue observer. Each
store compares complete snapshots locally; the engine-global full/delta/cache-hit
relation is never mistaken for an individual consumer's baseline.

`BreditorToolbar` is driven by a bounded immutable presentation manifest. The
default manifest contains Bold, Undo, and Redo, but visible order, labels,
and optional grouping keys are browser-owned. Retained manifest fields must be
own data properties and controls must be a bounded dense array; accessors and
inherited fields are not executed. Shortcut descriptions remain out of the
v0.0.56 schema until the runtime can register and verify the behavior they
advertise.

The toolbar creates one isolated owned root inside a validated non-interactive
mount. Native buttons expose only fresh availability and pressed/mixed state,
implement roving focus, restore the exact keyboard button after synchronous
delivery, and submit declarative `selection: "preserve"` invocations. Dispatch
accepts only a minted synchronous outcome. The runtime converts invocations
with `toolbarCommandRequest` and sends them through the same queue; Rust
revalidates every command against the current observation. The complete
manifest contract is documented in `docs/TOOLBAR.md` in the repository.

## Session checkpoint persistence

`IndexedDbSessionCheckpointStore` owns one exact versioned database and one
`"current"` record. A load returns either absence or a digest-verified complete
checkpoint plus an opaque, store-bound compare-and-swap token. A save computes
the UTF-8 byte count and SHA-256 before opening its transaction, rechecks the
complete prior record inside one `readwrite` transaction, installs one whole
replacement, and reports success only from transaction completion. Conflicts,
corruption, quota, schema/version mismatch, connection loss, generation
exhaustion, and digest failure remain distinct payload-redacted outcomes.

`restoreWasmEngine` strictly consumes the generated restore result and owns the
new engine only after the Rust Session Checkpoint V1 decoder accepts it.
`BreditorSessionCheckpointAutosave` coalesces adopted core commits behind a
250 ms trailing delay and, while capture is available, starts an attempt within
2 s of continuous changes. Composition or another exclusive adapter lease can
defer capture beyond that scheduling bound without a busy loop. The coordinator
keeps at most one save active, retains exact flush epochs, and pauses on every
failure until explicit retry.
Its bounded `observeStatus()` feed delivers coalesced immutable lifecycle
snapshots on microtasks, contains listener failure, and preserves a stable
payload-free storage `causeCode` so applications can surface quota, conflict,
or connection loss instead of silently stopping autosave.
Wire it to the adapter's authoritative commit feed, not to queue completion:

```ts
const autosave = new BreditorSessionCheckpointAutosave(
  adapter.sessionCheckpointReadPort,
  checkpointStore,
  loaded.token,
);
const stopObserving = adapter.observeCoreCommits(autosave.commitObserver);
```

The high-level runtime installs this wiring automatically. Advanced integrations
must wire the feed exactly once. It fires whenever a validated Rust successor is adopted, even when
a later DOM reconciliation or multi-stage command failure prevents the queue
from reporting completion. Temporary composition/execution returns capture
backpressure; terminal adapter loss pauses autosave. See
`docs/SESSION_CHECKPOINT_STORAGE.md` in the repository.

## Current limitations

- The bundled toolbar catalog contains Bold, Undo, and Redo. A custom manifest
  can reorder or relabel controls, but dynamic JavaScript action/catalog
  registration and a packaged React wrapper are not included.
- Checkpoint persistence is one best-effort local slot, not an append log,
  multi-document registry, merge protocol, authenticated store, rollback
  defense, or cross-device synchronization.
- Clipboard support is limited to synchronous event `clipboardData`, plain
  text, and the base paragraph/strong subset. There is no async Clipboard API,
  custom internal MIME, files/images, or mixed-format rich paste.
- No arbitrary elements, formats, properties, entity IDs, nested blocks, or
  extension DOM renderers are accepted yet.
- DOM APIs do not provide an atomic transaction across several retained
  paragraphs. The renderer prepares and validates all replacement nodes first
  and attempts best-effort rollback if a DOM write unexpectedly throws. It then
  invalidates the old handle because the host is conservatively considered
  uncertain; the caller must perform a full render from the canonical semantic
  projection.
- Mutation observers deliver asynchronously. A synchronous consumer should not
  treat the DOM as authoritative; retained subtrees are checked again before an
  update fast path is used.
- The low-level renderer does not set host attributes. The public runtime sets
  and later restores `contenteditable`, textbox/multiline ARIA semantics,
  accessible label, and spellcheck; presentation styles remain application-owned.
- Selection mapping supports one light-DOM range only. Cross-host,
  cross-shadow-root, browser multi-range, and ambiguous internal host-boundary
  positions fail closed. DOM mapping and validation are currently linear in the
  bounded document.
- Composition additionally supports only one target range and one paragraph;
  cross-block, shadow/composed, multi-range, arbitrary-markup, and nested-editor
  composition fail closed. The public runtime front-routes composition,
  clipboard, ordinary input, blur, and document selection through one owner.
- Composition order and all three bounded alias paths are unit-tested in a
  deterministic DOM. The real Chromium, Firefox, and WebKit/Safari engine
  matrix, including IME behavior, remains the `0.0.59` gate; this checkpoint
  defines no separate mobile support matrix.
- Command execution is synchronous. Selection synchronization or a history
  boundary can publish before a later command error; queue fail-stop and
  canonical reconciliation are provided, but cross-stage rollback is not.

## Development

From the repository root:

```sh
npm run typecheck
npm test
npm run build
WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen npm run smoke:packages
```

The workspace pins TypeScript, Vitest, and jsdom exactly in
`package-lock.json`. Tests cover strict projection admission, hostile text,
mapping lifetime, text-container identity retention, shifted root-splice
rebinding, stale/foreign guards, DOM-drift fallback, broad-impact full renders,
Wasm-view consumption/disposal, directional and Unicode selection mapping,
focus separation, select-all, outside-host protection, semantic clipboard
serialization, strict HTML admission, guarded multi-representation writes,
authoritative plain-text preference, exact clipboard echoes, exact target-range
normalization, bounded command admission, non-recursive FIFO ordering,
translation policy, one-shot event-echo suppression, queue-routed selection
changes, guarded action-state ownership and store transitions, toolbar
manifest and keyboard/ARIA behavior, exact composition/queue/
renderer leases, alternate terminal event orders, strict temporary-DOM
reconciliation, cancellation history boundaries, fail-safe recovery, strict
checkpoint ownership/restore, IndexedDB schema/CAS/corruption paths, adopted-
commit notification, reentrancy-safe autosave scheduling, Wasm bootstrap,
unified router ownership, public-runtime rollback/disposal, generated-Wasm
edit/undo/redo/reload, and isolated package installation.

The package is licensed under either MIT or Apache-2.0, at your option. Both
license texts are included in its npm tarball.
