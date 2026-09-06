# Breditor browser runtime

Status: public `0.0.58` startup and lifecycle contract

`BreditorBrowserEditor` is the recommended application boundary for the first
browser release. It assembles the generated Rust/Wasm engine, typed projection,
DOM renderer, selection bridge, serial command queue, native-event router,
action-state store, optional toolbar, and optional IndexedDB autosave behind one
framework-neutral owner.

The package-root API is intentionally small. Applications receive the editing
element, immutable status snapshots, subscription, focus, persistence flush and
retry, and disposal. They do not receive the engine, observation handles,
renderer, queue, delivery tokens, or native-event receipts. The lower-level
pieces remain available from `@breditor/browser/advanced` for host-trusted
integrations, but using them means owning their individual contracts.

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

The editing host and optional toolbar host must be connected HTML elements with
no children. The runtime reserves the editing host before asynchronous storage
work and rechecks both mounts after that work. A second live owner for the same
editing or toolbar host is rejected. A failed open is all-or-nothing: installed
DOM, attributes, listeners, storage connections, and generated owners are
rolled back before the controlled error result is returned.

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

An initialized module namespace is preferred because startup verifies Wasm ABI
generation `1` and probes its crate version. The narrower static
`BreditorEngine` factory shape is also accepted for controlled embeddings, but
it has no module-level compatibility probe. Applications should install matching
versions of `@breditor/browser` and `@breditor/wasm`.

An optional `AbortSignal` cancels startup only. It closes an in-progress storage
load and prevents an opened result from escaping, but it is not retained as the
editor's lifetime signal. Call `dispose()` on an editor that has already opened.

## Lifecycle and observation

`getStatus()` returns one of:

- `live`: native input and toolbar dispatch are admitted;
- `faulted`: an event, queue, reconciliation, or toolbar outcome became
  uncertain and new editing work has been stopped; or
- `disposed`: every public capability is terminal; physical release is complete
  or waiting only for a reentrant synchronous engine call to unwind.

Fault reasons are stable and payload-redacted. A fault stops the event router,
toolbar, and command queue without retrying a possibly published command. It
also makes the editing host inert, non-editable, accessibility-disabled, and
unfocused synchronously so native DOM input cannot continue against frozen Rust
state. The adapter, action snapshot, and persistence state remain available for
diagnosis and for saving an already validated Rust commit. Applications should
surface a recovery UI and eventually call `dispose()`; a faulted editor is not
resumable. Disposal restores the host's exact pre-open attributes, including
pre-existing `inert` and `aria-disabled` values.

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

## Rust AST authority

The Rust `EditorEngine` is the sole document, selection, action, transaction,
history, and checkpoint authority. The browser DOM is a disposable projection:

```text
native event
  -> bounded semantic request + exact selection
  -> serial queue
  -> guarded Rust/Wasm engine action
  -> validated successor AST and selection
  -> DOM projection
```

Typing, formatting, deletion, paste, selection synchronization, undo, and redo
must all pass through that route. The browser cannot edit the AST directly or
synthesize a successful commit. A native IME session receives a temporary
one-paragraph DOM lease, but its DOM is only bounded settlement evidence. The
authoritative Rust projection is restored before the final insertion, deletion,
or cancellation boundary is submitted. Clipboard copy serializes the semantic
selection rather than arbitrary DOM, and pasted HTML is reduced through the
closed base-schema allowlist before a Rust plain-text insertion.

No ProseMirror, Lexical, Tiptap, CKEditor, DOM-operation, or plugin protocol is
implemented. Those projects are design references only; Breditor's AST,
positions, actions, history, and persistence formats are independent contracts.

## Persistence and flush

When configured, startup opens the fixed
`breditor-session-checkpoint-v1` database and the single `current` slot. A load
requires exactly one schema-valid record and verifies its declared UTF-8 size
and SHA-256 digest before giving its checkpoint to Rust for strict decode and
replay proof. Corrupt, incompatible, oversized, or inaccessible storage fails
startup; it is never silently discarded or replaced by `initialDocument`.

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
disposed, or waiter capacity is exhausted. Calls while clean resolve as
`committed`; this does not force an initial write when no semantic commit has
ever made the editor dirty. With persistence disabled, both persistence methods
resolve as `{ status: "disabled" }`.

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

## Toolbar and extension path

Omitting `toolbar` installs no toolbar. Passing `{ host }` installs the default
Bold, Undo, and Redo manifest. A custom manifest must first pass
`createToolbarManifest` and may contain at most 64 native-button declarations.
It controls label, order, optional presentation group, pressed-state behavior,
and a closed no-input/string-action or undo/redo command:

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
        kind: "action",
        actionId: "breditor/toggle-strong",
        input: { kind: "none" },
        history: "closeBefore",
      },
    },
  ],
});

// Pass this alongside the other required open options.
const toolbar = { host: toolbarHost, manifest };
```

The manifest is presentation data, not a JavaScript plugin object. It retains
only copied, frozen primitive fields and drops executable or extra properties.
A control is enabled only when the Rust action-state catalog publishes the
matching `stateId`, availability, and activation contract. Toolbar focus uses
the last exact semantic editor selection, and dispatch still requires a fresh
delivery token.

Adding real behavior therefore proceeds from the core outward:

1. Implement and register the action and its state evaluator in Rust.
2. Expose the action through the guarded engine/Wasm build without changing the
   ABI generation unexpectedly.
3. Add a manifest control whose `stateId` and action ID match that catalog.
4. Supply the manifest at editor startup and style the generated native
   elements through their role and `data-breditor-*` attributes.

There is no runtime JavaScript action registration, arbitrary callback command,
dynamic manifest replacement, plugin unload, custom node renderer, or stable
third-party Wasm plugin ABI in `0.0.58`.

## Honest limitations

The first runtime is deliberately a small local notes/form editor:

- The AST accepts direct-root paragraphs, plain text, and property-free strong
  formatting only. There are no headings, lists, links, images, tables, nested
  blocks, arbitrary marks, properties, or entity IDs.
- The high-level snapshot exposes revision identity and action/persistence
  state, not complete document JSON, HTML, plain text, transactions, or a
  controlled-value `onChange` callback. The advanced contracts are not a
  substitute for treating DOM as the model.
- The public high-level command surface is native input plus the startup
  toolbar. There is not yet a general imperative application-command method.
- Selection supports one directional light-DOM range. Shadow-root crossing,
  browser multi-range selection, nested editors, and ambiguous host-boundary
  positions fail closed.
- Composition is constrained to one range in one paragraph and to the strict
  text/`strong` temporary DOM subset. Handwriting, cross-block IME edits, and a
  broad mobile/browser claim are not included yet.
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
- The deterministic DOM tests do not yet constitute the Chromium, Firefox,
  WebKit/Safari, mobile IME, or assistive-technology matrix required by the
  `0.0.59` release-candidate gate.

See [the browser event pipeline](./BROWSER_EVENT_PIPELINE.md),
[toolbar contract](./TOOLBAR.md),
[session-checkpoint storage](./SESSION_CHECKPOINT_STORAGE.md), and
[the frozen `0.1.0` scope](./V0_1_SCOPE.md) for the lower-level decisions and
release boundary.
