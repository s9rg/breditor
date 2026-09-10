# Breditor browser runtime

Status: supported public `0.1.0` startup, lifecycle, and content-egress contract;
extended in `0.2.0` by compiled property-free profiles and extended again by
the unpublished `0.3.0-alpha.5` ABI-4 typed-profile, typed-intent, explicit
Session-V3 persistence, closed safe-Link presentation, and property-preserving
paragraph-structure path

`BreditorBrowserEditor` is the recommended application boundary introduced in
`0.1.0` and retained by `0.2.0`. It assembles the generated Rust/Wasm engine,
typed projection, DOM renderer, selection bridge, serial command queue,
native-event router, action-state store, optional toolbar, and optional
IndexedDB autosave behind one framework-neutral owner.

The package-root API is intentionally small. Applications receive the editing
element, immutable status snapshots, subscription, focus, persistence flush
and retry, synchronous no-input and strict typed-JSON semantic intent
execution, explicit content export, and disposal. They do not receive the
engine, observation handles, renderer, queue, delivery tokens, or native-event
receipts. The lower-level pieces remain available from
`@breditor/browser/advanced` for host-trusted integrations, but using them
means owning their individual contracts.

## Startup

Initialize `@breditor/wasm` once before opening an editor, then provide two
dedicated empty mounts: one for the editor and, when requested, a distinct one
for the toolbar.

```ts
import {
  openBreditorBrowserEditor,
  type BreditorBrowserEditor,
} from "@breditor/browser";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const EMPTY_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [],
      },
    ],
  },
});

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
    primaryModifier: /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
      ? "meta"
      : "control",
    shortcuts: "enabled",
  },
  toolbar: {
    host: document.querySelector("#toolbar") as HTMLElement,
  },
  persistence: {
    indexedDB: window.indexedDB,
    crypto: window.crypto.subtle,
  },
});

if (!result.ok) {
  throw new Error(`${result.error.code}: ${result.error.message}`);
}

const editor: BreditorBrowserEditor = result.editor;
editor.focus();
```

The editing host is a connected, empty HTML `article`, `aside`, `div`, `footer`,
`header`, `main`, `nav`, or `section`. The distinct optional toolbar host uses
the same tag allowlist, has no `tabindex` attribute, and is outside an effective
editable region. It has no role, an empty role, or
only case-insensitive tokens from `banner`, `complementary`, `contentinfo`,
`form`, `generic`, `group`, `main`, `navigation`, `none`, `presentation`,
`region`, `search`. The runtime reserves the editing host before asynchronous
storage work and rechecks both mounts after that work. A second live owner for
the same editing or toolbar host is rejected. A failed open is all-or-nothing:
installed DOM, attributes, listeners, storage connections, and generated
owners are rolled back before the controlled error result is returned.

The runtime installs `contenteditable="true"`, `role="textbox"`, an accessible
label, multiline semantics, `aria-disabled="false"`, the configured spellcheck
value, and a Breditor root marker; it removes the boolean `inert` attribute so a
`live` editor is actually interactive. Disposal clears Breditor-owned children
and restores the editor host's previously captured values for those attributes,
including `inert` and `aria-disabled`. React or another view
system must not render children beneath either mount while Breditor owns it.
Spellcheck defaults to enabled. A custom `scheduleTask` must enqueue its
callback for a later task, never invoke it inline, and return `void`; it is used
for native composition settlement and deferred canonical repair.

`initialDocument` is used only when persistence is disabled or the exact
IndexedDB slot is empty. A valid stored session checkpoint takes precedence and
restores its document, selection, pending formatting, undo stack, and redo
stack. `historyCapacity` is an integer from 0 through 100. A lineage ID is at
most 128 ASCII bytes, starts with a letter or digit, and thereafter permits
letters, digits, `.`, `_`, `:`, and `-`.

An initialized official module namespace is the supported configuration.
The alpha.5 source path verifies Wasm ABI generation `4` and the exact matching
crate/package version before it reads the generated engine factory. The
supported root option rejects a bare structural factory, which has no module-
level compatibility probe. Lower-level factory types remain available only
from the experimental advanced surface for adapter tests and controlled host
integration; their generated handle protocol is not a compatibility promise.
Applications must install matching versions of `@breditor/browser` and
`@breditor/wasm` after those packages are published.

Three startup modes are explicit. Omitting `semanticProfile` selects exact-base
Document/Session Checkpoint V1. `semanticProfile: { bootstrapJson }` selects
Profile Bootstrap V1 with Document/Session Checkpoint V2.
`semanticProfile: { bootstrapJson, formatVersion: 2 }` selects Profile Bootstrap
V2 with Document V2 and Session Checkpoint V3. The last form admits typed
property contracts and set-intent declarations. A required callback-free
`rendering` manifest must cover every descriptor format; the supplied toolbar
must still match the supported no-input intent/routed-state or exact history
contracts. Startup never sniffs, upgrades, or falls back between modes.

For Bootstrap V2, the owned `BrowserCompiledProfileDescriptor` deep-freezes
each format's canonical `properties` list: name, required/optional presence,
Boolean/integer/string type, and exact bounds. The semantic projection exposes
each run's canonical `formatDetails`, including the scalar value of every
present property. Both are validated against the same opaque profile generation
before the editor is published.

Alpha.4 permits one property-driven recipe: `safeLinkV1` on exactly
`<a class="breditor-link">`. Its exact two-property descriptor correlation,
URL admission, inert unsafe-value behavior, fixed `href`/`rel`/`target`
outputs, DOM/composition checks, and safe-copy rules are defined in
[`DOM_PROJECTION.md`](DOM_PROJECTION.md). The native toolbar remains no-input;
applications call `executeIntentJson()` from their own typed controls.

`@breditor/reference-highlight` provides a complete callback-free profile from
supported package roots. After a maintainer publishes this alpha, install the
exactly matching `0.3.0-alpha.5` packages:

```sh
npm install @breditor/browser@0.3.0-alpha.5 \
  @breditor/wasm@0.3.0-alpha.5 \
  @breditor/reference-highlight@0.3.0-alpha.5
```

Then import only the package roots and pass the exported data to the ordinary
open options:

```ts
import { openBreditorBrowserEditor } from "@breditor/browser";
import {
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
} from "@breditor/reference-highlight";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const host = document.querySelector("#editor") as HTMLElement;
const toolbarHost = document.querySelector("#toolbar") as HTMLElement;
await initializeWasm();
const opened = await openBreditorBrowserEditor({
  host,
  label: "Notes",
  wasm: breditorWasm,
  semanticProfile: {
    bootstrapJson: REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  },
  initialDocument: {
    lineageId: "notes-highlight",
    documentJson: REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
    historyCapacity: 100,
  },
  rendering: REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  toolbar: {
    host: toolbarHost,
    manifest: REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  },
  keyboard: {
    editing: "beforeinputPrimary",
    primaryModifier: "control",
    shortcuts: "enabled",
  },
});
```

The reference profile's fixed IDs are schema `example/editor@1`, extension
`example/highlight-extension@1`, format `example/highlight@7`, action
`example/toggle-highlight`, intent `example/toggle-highlight-intent`, binding
`example/toggle-highlight-binding`, and state `example/highlight-control`. Its
durable fingerprint is
`sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741`.
The reference package has an exact browser peer: its manifests must be created
and admitted by the same root `@breditor/browser` module instance. A duplicate
or nested browser copy fails that ownership contract.

An optional `AbortSignal` cancels startup only. It closes an in-progress storage
load and prevents an opened result from escaping, but it is not retained as the
editor's lifetime signal. Call `dispose()` on an editor that has already opened.

## Lifecycle and observation

`getStatus()` returns one of:

- `live`: native input and toolbar dispatch are admitted;
- `faulted`: an event, queue, reconciliation, or toolbar outcome became
  uncertain and new editing work has been stopped; or
- `disposed`: every public capability and external DOM, storage, and host
  ownership is terminal. Generated-adapter release is normally complete or
  deferred by one microtask; a persistently busy or unreadable engine may be
  deliberately retained rather than risking use-after-free.

Fault reasons are stable and payload-redacted. A fault stops the event router,
toolbar, and command queue without retrying a possibly published command. It
also synchronously makes the editing host inert, non-editable, and
accessibility-disabled so native DOM input cannot continue against frozen Rust
state. The runtime invokes native blur with one bounded retry as defense in
depth, but does not promise to defeat a platform or application focus hook that
immediately restores focus. The adapter, action snapshot, and persistence state
remain available for diagnosis and for saving an already validated Rust commit.
Applications should surface a recovery UI and eventually call `dispose()`; a
faulted editor is not resumable. Disposal restores the host's exact pre-open
attributes, including pre-existing `inert` and `aria-disabled` values.

`getSnapshot()` returns one deeply immutable external-store snapshot:

```ts
interface BreditorBrowserEditorSnapshot {
  status: BreditorBrowserEditorStatus;
  document: { lineage: string; revision: string };
  actionState: ActionStateStoreStatus;
  actions: BrowserActionStateSnapshot | undefined;
  persistence: BreditorBrowserEditorPersistenceStatus;
}
```

The `document` member is identity and revision metadata, not a second AST or a
serialized value. `actions` is presentation/admission state and never an
executable capability. Whenever `actionState.status` is `fresh`, the nested
`actions.snapshot` is guaranteed to match `document`. If a Rust commit advances
the document but presentation fails before the synchronous action-state refresh,
the last-good actions remain available for diagnosis but are labelled `stale`
with `action_state.snapshot_mismatch` until the fallback refresh settles.
Alpha.7 additionally admits a snapshot only when its complete entry count and
ordered lexical IDs equal the compiled descriptor and every resolved entry
satisfies the declared tracked/stateless and exact value contract. A missing,
extra, reordered, duplicate, substituted, or contract-drifted catalog becomes a
failed refresh; the store retains but marks its prior last-good value stale.
`subscribe(listener)` is compatible with external-store
adapters, retains at most 64 distinct listeners, coalesces ordinary updates on
a microtask, deduplicates repeat registration of the same function for
delivery, and contains listener throws and rejected thenables. Each registration
still receives an independent idempotent unsubscribe function.

`focus()` returns `false` instead of throwing when the editor is not live or
the browser cannot prove focus moved to its host.

`dispose()` makes the public lifecycle terminal synchronously and is
idempotent. It first stops native input and invalidates subscriptions, toolbar,
router, autosave, action store, and queue. Normally it then releases the adapter,
selection bridge, generated engine, IndexedDB connection, DOM, attributes, and
host ownership before returning. If disposal reenters a synchronous engine
read or delivery, physical teardown is deferred until that call has unwound
(normally one microtask); the host remains reserved during that interval so the
engine can never be freed beneath a live generated handle. The runtime never
spins waiting for teardown: if the owned adapter is still busy or unreadable
after that bounded deferral, it releases external DOM/storage/host ownership
but deliberately retains the adapter and engine instead of risking use-after-
free. Disposal does not mean that dirty state was saved.

## Synchronous semantic intent execution

`executeIntent(intentId)` remains the no-input imperative command boundary. It
accepts one exact qualified ID declared by the active compiled profile whose
descriptor declares no input:

```ts
const result = editor.executeIntent("breditor/format-strong");
if (result.status === "blocked") {
  console.log(result.reasonCode, result.activation);
}
```

Alpha.3 adds `executeIntentJson(intentId, inputJson)` for an exact descriptor-
declared typed intent:

```ts
const result = editor.executeIntentJson(
  "example/set-link-intent",
  JSON.stringify({
    operation: "set",
    properties: [{ name: "example/href", value: "https://example.test" }],
  }),
);
```

The browser validates the intent ID, bounded JSON transport, and descriptor
input kind, but preserves the caller's JSON bytes exactly so duplicate keys and
other non-deterministic forms remain visible to the strict Wasm decoder. Rust
derives the contract name/version from the registered intent; the caller cannot
forge it. `executeIntent()` rejects typed declarations, and
`executeIntentJson()` rejects no-input declarations. A deterministic Rust
decoder rejection for malformed or contract-invalid typed JSON becomes
`{ status: "rejected", reason: "invalidInput" }`; it neither faults the queue
nor disposes the editor, and no payload or internal Rust code is exposed. A
requested history-group close and the intent run on one private Rust candidate
and publish together only after final checkpoint admission. Rejection therefore
leaves undo grouping unchanged with one intent preparation.

Both results are deeply frozen and include the requested intent identity plus the
authoritative `{ lineage, revision }` document snapshot observed when the call
settled. The sole identity exception is a malformed or over-limit intent ID,
which is reported as `invalidIntent` with `intentId: ""` so rejected identity
text is not retained or reflected. Semantic outcomes are `committed`,
`blocked`, or `unhandled`. Invalid or unknown identities, input-kind mismatch,
invalid typed input, a busy owner, or a non-live owner return `rejected`; an
uncertain delivery returns `failed` and faults editing closed. Blocked results
expose only the stable reason code and stateless/inactive/active/mixed
activation.

The public result deliberately omits the selected binding/action and routed
fallthrough trace. Those are diagnostic provenance retained by the advanced
Wasm command adapter, not stable application authority. Public dispatch uses
an immediate idle-queue lease. It never waits behind an executing command and
never runs recursively: composition, an authoritative read, an active
delivery, or a reentrant call returns busy instead of enqueueing a request whose
selection/observation token may become stale. There is no asynchronous intent
method or callback command; typed JSON is programmatic input, not toolbar or
renderer authority.

## Event ordering

The runtime owns one listener set and one precedence order. Applications must
not install a second Breditor controller over the same host.

```text
compositionstart/update/end ───────────────> composition controller

beforeinput / input
  -> composition controller
  -> exact "notComposition" fallthrough
  -> clipboard controller
  -> exact "notClipboardInput" fallthrough
  -> ordinary controller

keydown -> composition controller
        -> exact "inactive" fallthrough
        -> ordinary controller

copy / cut / paste ────────────────────────> clipboard controller
capturing blur ────────────────────────────> composition controller
document selectionchange ─────────────────> ordinary selection sync
```

An active composition has spent the ordinary delivery token, so transient
document `selectionchange` signals are intentionally inert until composition
settlement publishes a fresh canonical base. Every ordinary dispatch otherwise
reads the adapter's current render and issues a current one-use delivery token
at callback time; it never caches one across an event.

The router does not inspect `inputType` to reproduce another controller's
translation table. It falls through only on the exact closed dispositions
above. Generation-bound one-use receipts suppress the matching keydown or
clipboard `beforeinput` echo, and `input` is a postcondition rather than a
second command.

Cancelable owned mutations are canceled before queue admission. If cancellation
cannot be proved, canonical repair is deferred until the browser has had a
chance to perform its native default mutation; the matching `input` or a
scheduled callback performs one full restore. Known post-mutation DOM drift is
repaired from the Rust projection immediately. An unrecoverable render or
selection failure removes the listeners and faults the editor. Executor or
queue-observer uncertainty also faults closed, and the router never replays the
head command.

Nested form controls and nested editing hosts retain their native behavior.
Event admission is limited to the connected light-DOM host; it does not use a
composed path to cross shadow boundaries.

In Alpha.6, genuine `Event`, `InputEvent`, `KeyboardEvent`,
`CompositionEvent`, `ClipboardEvent`, and `MouseEvent` facts are read through
brand-checked methods and getters from the realm's platform prototype chain.
Own and intermediate-prototype shadows are ignored, a generic `Event` cannot
impersonate a specialized interface, and cancellation uses the native
`Event.prototype.preventDefault` path. `InputEvent` target ranges are copied
from a bounded dense descriptor-backed array and their `AbstractRange`, `Range`,
or `StaticRange` endpoints are read through the corresponding native brands.
These defenses are not a same-origin sandbox: direct structural calls through
the advanced controllers and replacement of the realm's actual platform globals
or prototypes remain host-trusted integration behavior.

## Rust AST authority

The Rust `EditorEngine` is the sole document, selection, action, transaction,
history, and checkpoint authority. The browser DOM is a disposable projection:

```text
native event
  -> bounded semantic request + exact selection
  -> serial queue
  -> separately guarded Rust/Wasm selection synchronization
  -> Rust-atomic optional history close plus intent, action, undo, or redo
  -> validated successor AST and selection
  -> DOM projection
```

The selection prestage can publish before a later command error. The requested
history boundary cannot: Rust evaluates it with the command on one private
checkpointed candidate and publishes both or neither. DOM update and selection
installation happen after that core publication and remain recoverable browser
work rather than members of the Rust transaction.

Typing, formatting, deletion, paste, selection synchronization, undo, and redo
must all pass through that route. The browser cannot edit the AST directly or
synthesize a successful commit. A native IME session receives a temporary
one-paragraph DOM lease, but its DOM is only bounded settlement evidence. The
authoritative Rust projection is restored before the final insertion, deletion,
or cancellation boundary is submitted. Clipboard copy serializes the semantic
selection rather than arbitrary DOM, and pasted HTML is reduced through the
closed legacy-base or exact compiled-presentation allowlist before a Rust
plain-text insertion.

In alpha.5 the same event, queue, Wasm, projection, and toolbar contracts route
the newly enabled typed structural plans without a browser-side action table
change. A Bootstrap-V2 profile can now retain complete Link or other typed peer
formats through Enter, cross-paragraph type-over or deletion, Backspace/Delete
paragraph joins, and cross-paragraph property-free toggles. Multiline plain-
text insertion applies one destination-derived complete format set to each
non-empty inserted line. Clipboard source wrappers and properties are still
discarded: a pasted line can inherit Link from the target caret, but paste does
not import a Link from clipboard HTML. Typed `SetInlineFormatAction` input
remains same-paragraph application UI and is not routed over multiple blocks.

No ProseMirror, Lexical, Tiptap, CKEditor, DOM-operation, or plugin protocol is
implemented. Those projects are design references only; Breditor's AST,
positions, actions, history, and persistence formats are independent contracts.

## Persistence and flush

When configured, startup opens the fixed
`breditor-session-checkpoint-v1` database. The stable `0.1.x` path selects its
single legacy `current` outer-V1 record. A semantic profile instead binds one
outer-V2 record to an exact schema-fingerprint-derived or caller-named slot and
an explicit `checkpointFormatVersion`: `2` for Bootstrap V1 or `3` for
Bootstrap V2. Different slots may coexist but do not form a registry. A load
requires exactly one schema-valid record at its selected slot, validates its
mode and complete typed-property catalog, and verifies its declared UTF-8 size
and SHA-256 digest before giving its checkpoint to Rust for strict decode and
replay proof. Corrupt, incompatible, mismatched, oversized, or inaccessible
storage fails startup; it is never silently discarded, repaired, retried as
another generation, or replaced by `initialDocument`.

The browser checkpoint pass is a bounded structural and binding preflight. For
V3 it exactly bounds capacity, per-entry and aggregate operation counts,
validates every serialized recipe/property shape, and counts the retained-
property lower bound present in the history base and each result pending-format
set. It does not replay history or exactly reproduce the Rust codec's complete
aggregate retained-node, text, and property totals because entry-result
documents exist only after recipe execution. The selected Rust restore factory
is authoritative for complete decode, resource-limit enforcement,
canonicality, and forward/inverse replay; a checkpoint that passes browser
preflight can still fail closed there.

Alpha.5 uses the existing Bootstrap-V2 outer record and Session Checkpoint V3
binding. Its structural edit history carries exact typed guards and inverses,
so autosave after undo retains both the undo prefix and redo suffix and reload
can replay either direction without re-running an action. Alpha.5 reads
conforming alpha.4 checkpoints. An alpha.4 runtime cannot restore an alpha.5
V3 checkpoint whose retained history contains a typed split, join, or root-text
replacement; it fails startup and does not overwrite that stored evidence.
The unchanged checkpoint number is not a prerelease downgrade guarantee.

Every validated Rust successor marks a private dirty epoch, including a commit
whose later DOM publication fails. Autosave defaults to a 250 ms trailing quiet
period and a 2 second maximum dirty age, keeps at most one CAS save active, and
coalesces changes made during that save into the next attempt. Composition and
other exclusive engine work can temporarily make capture unavailable and can
extend those timing targets without a busy loop.

The store replaces the complete checkpoint only when its store-bound token
still matches the complete record observed at load or the preceding save. A
save is successful only after the IndexedDB read/write transaction completes.
Digest checking detects accidental corruption; it provides neither
authenticity nor rollback protection.

`flushPersistence()` targets the dirty epoch visible when it is called and
settles when that epoch is committed, persistence pauses, the editor is
disposed, or its exact capacity of 1,024 concurrent flush/retry waiters is
exhausted. The package-root
`MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS` constant exposes that ceiling;
an additional call resolves as `{ status: "rejected", reason: "capacity" }`.
Calls while clean resolve as `committed`; this does not force an initial write
when no semantic commit has ever made the editor dirty. With persistence
disabled, both persistence methods resolve as `{ status: "disabled" }`.

A failed capture, save, clock, scheduler, quota, connection, or CAS attempt
pauses automatic work while preserving dirtiness. `flushPersistence()` does not
resume a paused coordinator. After inspecting `snapshot.persistence.failure`,
call `retryPersistence()` to explicitly resume and target all current dirtiness.
A competing-writer CAS conflict has no merge path; reopening the editor is the
only current way to load a new winning token.

For controlled navigation:

```ts
const flushed = await editor.flushPersistence();
if (flushed.status === "committed" || flushed.status === "disabled") {
  editor.dispose();
}
```

Do not call `dispose()` first. Disposal cancels timers and settles outstanding
flush waiters as disposed, but IndexedDB work already submitted cannot be
recalled and its later outcome is ignored by the closed runtime.

## React integration

React owns the surrounding UI and two permanently childless mounts; Breditor
owns everything below those refs. Initialize Wasm once outside the component's
render path. In an effect, create an `AbortController`, open after both callback
refs are non-null, ignore controlled abort errors, dispose a result that arrives
after cancellation, and dispose the live owner during cleanup. That last
post-await cancellation check is required for React Strict Mode's setup/cleanup
probe.

Subscribe without copying the editor document into React state:

```tsx
const subscribe = useCallback(
  (notify: () => void) => editor?.subscribe(notify) ?? (() => {}),
  [editor],
);
const getSnapshot = useCallback(() => editor?.getSnapshot(), [editor]);
const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

return (
  <section aria-busy={editor === undefined}>
    <div ref={setToolbarHost} />
    <div ref={setEditorHost} />
    <output>{snapshot?.persistence.phase}</output>
  </section>
);
```

Do not render AST-derived paragraphs into the editor mount and do not use its
DOM as React state. Use the immutable snapshot for status, action controls, and
persistence UI. The complete reference, including one-time Wasm initialization
and Strict Mode cleanup, is in
[`examples/react`](../examples/react/README.md).

This release supplies a reference integration rather than an
`@breditor/react` package. Opening requires browser DOM, WebAssembly, and, when
persistence is selected, IndexedDB plus `SubtleCrypto`; it is not an SSR
operation.

## Explicit content egress

`getSnapshot()` intentionally contains status and revision-correlated metadata,
not document payloads. Applications explicitly request one of two bounded
representations:

```ts
const document = editor.exportContent("documentJson");
if (document.ok) {
  console.log(document.format); // "documentJson"
  console.log(document.utf8Bytes); // exact UTF-8 length
  console.log(document.snapshot); // lineage + revision for these bytes
  upload(document.value);
}

const text = editor.exportContent("plainText");
```

A success is a deeply frozen
`{ ok: true, format, value, utf8Bytes, snapshot }` record. `documentJson`
returns the exact canonical Rust encoding selected at bootstrap: Document V1
for the stable legacy exact-base path or fingerprint-bearing Document V2 for an
explicit Bootstrap-V1 or Bootstrap-V2 semantic profile. `plainText` is derived
from the validated property-bearing semantic projection rather than DOM
`textContent`: it concatenates runs, removes every inline format, joins adjacent
paragraphs with one LF, retains empty paragraphs, and does not append a
synthetic LF after the final paragraph.

The API does not export HTML, editor state, a session checkpoint, selection,
pending formatting, undo/redo history, transaction records, or raw commands.
Those distinctions matter: Document V1 or V2 is lossless document content,
while the correspondingly selected Session Checkpoint V1, V2, or V3 is the
private local-durability representation that can retain deleted text in
history. There is no Document V3.

Neither document generation embeds a snapshot. Correlation therefore uses
three proofs: the generated Rust method receives the adapter's exact observation;
the browser validates the selected wire generation, schema binding, complete
format/property catalog, and returned AST against the current owned projection; and the
high-level owner checks that the adapter snapshot was unchanged across the
synchronous read. A V2 rejection is never retried as V1, and a custom structural
factory cannot substitute a different valid document without failing the
boundary comparison.

The high-level API collapses every structural core rejection to the fixed,
payload-free `content_export.core_rejected` failure. Granular official Rust
codes remain available only through the generated low-level Wasm method, where
the caller also owns handle cleanup and observation discipline.

`content_export.busy` is normal backpressure while composition, command
execution, action/checkpoint/content reading, or another exclusive adapter
lease is active. Call again after the active lease settles: command and read
leases are synchronous, while composition settles at its scheduled task
boundary. Disposed
editors and adapters with internal uncertainty return
`content_export.unavailable`. A high-level editor fault caused outside the
adapter may still salvage content when the adapter itself remains `live` or
`reconcile`; malformed core results and other internal adapter faults cannot.
If disposal occurs reentrantly inside a generated getter, provisional content
is discarded and physical engine release waits for the read handle to unwind.

## Toolbar and extension path

Omitting `toolbar` installs no toolbar. Passing `{ host }` installs the default
Bold, Undo, and Redo manifest. A custom manifest must first pass
`createToolbarManifest` and must contain 1 through 64 native-button
declarations. Toolbar/control labels are nonblank, control-free valid Unicode
bounded to 128 UTF-16 code units and 512 UTF-8 bytes; state/action IDs use the
lowercase, 128-character `namespace/local-name` grammar; optional valid-Unicode,
trimmed groups are bounded to 64 UTF-16 code units and 256 UTF-8 bytes; and
nonempty advanced string-action inputs are bounded to 65,536 UTF-16 code units
and UTF-8 bytes.
The package root exports the corresponding constants. A manifest controls label, order,
optional presentation group, pressed-state behavior, and a closed
intent, direct-action, or undo/redo declaration. The supported high-level
runtime admits only descriptor-matched no-input intents and exact history
directions; the direct-action shape exists for advanced low-level assembly:

```ts
import { createToolbarManifest } from "@breditor/browser";

const manifest = createToolbarManifest({
  label: "Formatting",
  controls: [
    {
      kind: "button",
      stateId: "breditor/control-bold",
      label: "Bold",
      activation: "tracked",
      group: "inline",
      command: {
        kind: "intent",
        intentId: "breditor/format-strong",
      },
    },
  ],
});

// Pass this alongside the other required open options.
const toolbar = { host: toolbarHost, manifest };
```

The manifest is presentation data, not a JavaScript plugin object. It retains
only copied, frozen primitive fields and drops executable or extra properties.
A supported control is installed only when its `stateId`, intent/history
source, activation, and absent value contract exactly match the compiled
profile descriptor. It is enabled only when the correlated Rust action-state
catalog publishes fresh availability. Toolbar focus uses
the last exact semantic editor selection, and dispatch still requires a fresh
delivery token.

The default profile publishes the routed `breditor/format-strong` Bold state
plus Undo and Redo. A compiled extension toggle may contribute another tracked
no-input intent and routed state; a manifest can expose it as the same native
button kind but cannot register behavior by itself.

Adding real behavior therefore proceeds from the core outward:

1. Declare a property-free toggle or typed set bundle in the extension profile
   so Rust compiles its action, intent, blocking binding, and routed state.
2. For a property-free toggle, add a manifest button whose `stateId` and
   `intentId` match that descriptor. Typed set intents are currently invoked
   programmatically through `executeIntentJson()`.
3. Supply a complete render recipe for the admitted format. Property-free
   formats use an inert wrapper; the sole property-aware choice is the exact
   browser-owned `safeLinkV1` policy.
4. Supply the manifest at editor startup and style the generated native
   elements through their role and `data-breditor-*` attributes.

There is no typed toolbar control, extension keymap or `beforeinput` rule,
custom control kind, runtime JavaScript action registration, arbitrary callback
command, dynamic manifest replacement, plugin unload, custom node renderer, or
stable third-party Wasm plugin ABI in the supported surface. Direct concrete
action toolbar declarations remain an advanced policy bypass. The alpha.4
`safeLinkV1` recipe can derive only its closed canonical Link attribute set
from one exact two-property contract. Arbitrary attributes, style/CSS mapping,
schemes, callbacks, raw HTML, and user-selected `rel` or target values remain
unsupported.

The high-level startup gate is all-or-nothing for presentation as well as
semantic data. A missing or extra render recipe, missing or extra initial
action-state catalog entry, or unknown/cross-wired toolbar intent/state fails
before Breditor publishes editor or toolbar DOM. Alpha.8 exercises those cases
directly rather than treating an eventual render fault as acceptable startup.

## Honest limitations

The `0.1.0` runtime is deliberately a small local notes/form editor:

- The AST accepts direct-root paragraphs, plain text, and property-free strong
  formatting only. There are no headings, lists, links, images, tables, nested
  blocks, arbitrary marks, properties, or entity IDs.
- The high-level snapshot exposes revision identity and action/persistence
  state, not content. Explicit egress supports Document V1 and semantic plain
  text, not HTML, transactions, streaming output, editor-state/checkpoint
  export, or a controlled-value `onChange` callback. The advanced contracts are
  not a substitute for treating DOM as the model.
- The public high-level command surface is native input, the startup toolbar,
  and synchronous no-input `executeIntent()`. There is no typed input,
  asynchronous command method, raw action API, extension keymap, or custom
  `beforeinput` registration.
- Selection supports one directional light-DOM range. Shadow-root crossing,
  browser multi-range selection, nested editors, and ambiguous host-boundary
  positions fail closed.
- Composition is constrained to one range in one paragraph and to the strict
  text/`strong` temporary DOM subset. Handwriting, cross-block IME edits, and a
  broad mobile/browser claim are outside current support.
- Clipboard integration uses synchronous event `clipboardData`. There is no
  async Clipboard API, files, images, custom internal MIME, or general rich
  mixed-format paste; admitted HTML-only paste is flattened to plain text.
- Persistence is one fixed same-origin slot, not a multi-document database.
  Two tabs or editors targeting it are competing writers; CAS prevents silent
  overwrite but does not merge or elect a winner.
- A stored checkpoint includes undo and redo history, so text deleted from the
  visible document can remain in IndexedDB. Visible deletion is not secure
  erasure; sensitive deployments need an explicit retention and clearing policy.
- Checkpoints are local snapshots, not an executable append log, cross-device
  sync, collaboration protocol, CRDT/OT layer, authenticated record, or
  rollback defense.
- Undo and redo are deterministic local linear history, not selective or
  collaborative undo.
- Commands are synchronous. The bounded Rust and JSON limits are suitable for
  the current product scope, not production-scale documents.
- The release suite exercises editing, selection, history, toolbar, persistence,
  and content export in Chromium, Firefox, and WebKit through Playwright. This
  desktop automation is not a broad mobile-IME or assistive-technology support
  claim; those still need dedicated device and user-agent coverage.

The `0.2.0` path deliberately widens only the sealed base-text
seams above: a compiled profile may add property-free inline formats, exact
callback-free wrapper recipes, Document/Session Checkpoint V2, and scoped
profile-bound persistence. Composition accepts only canonical known wrappers
and strips them back to plain replacement text; paste likewise transports no
source formatting. It still has no property-bearing links, arbitrary nodes,
extension callbacks, typed public intent inputs, custom toolbar controls or
keymaps, rich paste, collaboration, selective undo, or dynamic extension
lifecycle. These additions do not alter the stable
`0.1.x` promises listed above.

The alpha.3 source path additionally validated and froze typed property
contracts and property-bearing semantic projections, exposed strict synchronous
`executeIntentJson()`, and carried Session Checkpoint V3 through the same
profile-bound IndexedDB/autosave lifecycle. At that checkpoint it did not map
properties to safe DOM attributes or copy HTML, accept rich formatting on
paste, or provide a typed-input toolbar control. Its structural typed-edit and
Local Log V3 limits were those documented in
[`V0_3_SCOPE.md`](V0_3_SCOPE.md).

The unpublished alpha.4 source path adds one deliberately closed exception to
those alpha.3 presentation limits. An exact two-property `safeLinkV1` format
may render and copy as `<a class="breditor-link">` with only canonical safe
`href` and, when requested, fixed `rel`/`target` attributes; unsafe but
schema-valid URLs remain inert. Canonical HTML-only Link shapes can pass the
paste allowlist, but paste and composition still flatten every wrapper and
property to plain replacement text. At alpha.4, typed structural paragraph
edits remained unsupported, and typed Link input remained an application-owned
form calling `executeIntentJson()` rather than a new toolbar control kind.

Alpha.5 removes that typed structural restriction only for the sealed direct-
root paragraph grammar. It does not add headings, lists, tables, block
properties or identities, nested blocks, rich paste, cross-paragraph typed
set/remove, or a typed native toolbar control. Structural commands still run
synchronously, validate complete property deltas, and can be disabled when a
split or multiline insertion duplicates typed property owners beyond the
configured limits.

The reference package is trusted same-realm JavaScript that supplies frozen
configuration and presentation values, not sandboxed code, a package-signature
proof, or a dynamic Rust/Wasm plugin. Its original Alpha.8
Chromium/Firefox/WebKit matrix proves the property-free Highlight intent/state/
toolbar, mixed-format nesting, history, export/copy, plain paste, persistence
reload, restored history, and teardown paths. Alpha.4 adds the combined
Highlight + Link profile, and alpha.5 adds its structural-edit/history demo
gate. Neither matrix establishes broad mobile, operating-system IME, or
assistive-technology support.

See [the browser event pipeline](./BROWSER_EVENT_PIPELINE.md),
[toolbar contract](./TOOLBAR.md),
[session-checkpoint storage](./SESSION_CHECKPOINT_STORAGE.md), and
[the released `0.1.0` scope](./V0_1_SCOPE.md) for the lower-level decisions and
release boundary.
