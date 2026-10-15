# Breditor editor candidate

A package-root integration for Breditor's original Rust rich editor. The default
entry opens a local editor with headings, nested lists, tables, images and the
standard inline controls. React and collaboration are separate entry points;
local editing does not load a replication engine or require a relay.

This is a private `0.3.0-alpha.22` candidate, not a registry release or a frozen
V1 API. The implementation still depends on the opt-in rich-content package.
Collaboration uses the separate `@breditor/collaboration` application package,
with canonical Rust/browser source and a matching module without research probes.

## Local editor

Use a bundler that supports JavaScript `new URL` asset references. Generated Wasm
glue loads the matching packaged binary; applications do not need a file from
the repository's `target` directory.

```js
import {openLocalEditor} from '@breditor/editor';

const editor = await openLocalEditor({
  host: document.querySelector('#editor'),
  initial: {kind: 'empty'},
  label: 'Document',
  onChange(view, outcome) {
    // Native Rust has already published this change.
  },
  onError(error) {
    console.error(error);
  }
});

editor.focus();
const checkpointJson = editor.checkpointJson();
// Persist the exact checkpoint to retain future Undo/Redo, not only the AST.
editor.dispose();
```

The other initial values are `{kind: 'document', documentJson}` and
`{kind: 'checkpoint', checkpointJson}`. Admission and all mutations happen in
Rust. The default schema is `breditor-editor/standard@1`; a custom
`profileBootstrapJson` must retain the original V6 bootstrap shape. Additional
inline formats need explicit safe presentation recipes through
`additionalInlinePresentation`. Format commands replace complete property maps;
they are not implicit patches of individual mixed properties.

One SDK opening or editor may own a host at a time. An invalid or aborted startup
restores its original child nodes and frees any newly created native owner. Pass
an `AbortSignal` as `signal` to cancel that opening; it does not cancel runtime
initialization shared with another opening. Once opening succeeds, `dispose()`
ends the editor lifetime. Disposing is idempotent. Do not mutate the editable DOM
or reuse the native owner behind the coordinator.

`view()` returns the existing detached publication. `execute()` uses the existing
guarded rich command contract and can take an exact revision. Toolbar factories
receive the newly created owner and its standard controls; a toolbar bound to
another owner rejects. `createLocalProfile()` exposes the matching headless
native profile when an application needs to admit or construct its own seed.

`execute({kind: 'insertHardBreak'})` replaces the current text selection with
exactly one LF in one Undo group. Shift+Enter has that keyboard meaning, including
inside list heads, cells and captions; ordinary Enter remains structural. A break
retains the logical start's admitted typing formats, creates no block identity and
does not normalize surrounding line endings. Explicit `beforeinput` replacement
ranges remain distinct from the visible caret.

### Explicit structural V2 candidate

Pass `richLanguage: 2` to `openLocalEditor` (or React `initialOptions`) to select
blockquotes, unformatted code with a bounded language, horizontal rules and tasks.
`createStructuralLocalProfileV2()` supplies the matching headless profile. Omitted
or `1` keeps all V1 defaults; unknown versions reject. The V2 default is
`breditor-editor/standard@2`; custom bootstrap JSON must use version 7. Keep that
explicit language choice on reload: old factories do not migrate V2 checkpoints.

The toolbar exposes wrapping, code conversion/language, rule and task controls.
Code conversion defaults to rejecting formatted text; removing its inline styles
requires an explicit choice. Code formatting controls are unavailable. Enter in
code inserts LF; Enter in a task head splits into an unchecked right task while
retaining the left completion and rich tail. Joining retains left completion;
Undo restores both original states. Task checkboxes support pointer and Space.

Shared model 11 remains V1-only. Task indent/outdent and empty-item exit, complete
atomic navigation and broader selection/history/interchange work remain open.
See `docs/RICH_STRUCTURAL_V2.md` in the repository for the full contract boundary.

Persistence and asset storage are explicit host services, not implicit SDK
autosave. `RichLocalSessionStore` and `RichAssetStore` are exported. Supply
`resolveAsset` and route `onFiles` to `editor.insertImageFiles(store, files,
position)` when enabling local uploads. Persist asset bytes separately from the
exact native checkpoint; the checkpoint is not an image-byte backup.

## React ownership

Install React separately and import only the React entry when using it.

```tsx
import {useRef} from 'react';
import {BreditorEditor, type BreditorEditorHandle} from '@breditor/editor/react';

export function DocumentEditor({documentId}: {documentId: string}) {
  const editor = useRef<BreditorEditorHandle>(null);
  return <BreditorEditor
    ref={editor}
    sessionKey={documentId}
    initialOptions={{initial: {kind: 'empty', documentId}, label: 'Document'}}
    onError={console.error}
  />;
}
```

`initialOptions` is applied once per `sessionKey`, like an uncontrolled input's
initial value. Rerendering with a new options object does not discard content or
history. Callbacks use their latest committed values. Changing `sessionKey` or
unmounting disposes the old owner: save/export it before deliberately replacing
the session. No automatic checkpoint is written on unmount.

The ref exposes `getEditor`, `focus`, `checkpointJson`, `execute` and `retry`.
Before readiness or after unmount, the editor, checkpoint and command outcome
are `null`; focus is a no-op. Retry can restart a failed opening but never resets
an already active editor. A late asynchronous opening is disposed without
announcing readiness. StrictMode setup/cleanup is tested. React owns only the
surrounding elements; it never reconciles the editable document children.
Server rendering emits a starting placeholder without initializing Wasm.

## Optional collaboration

Install the exact matching `@breditor/collaboration` candidate and
use `@breditor/editor/collaboration`. Its generated module and binary are now
inside that archive. Importing the local root never imports this entry.
The original experimental package remains a separate compatibility/probe path,
not an SDK dependency. Its generated module is not interchangeable with the
application module's export surface.

```js
import {createSharedProfile} from '@breditor/editor/collaboration';

const profile = await createSharedProfile();
// Acquire the exclusive durable writer lease before create/join/restore.
// Pass the profile callbacks to SharedPersistentSession or SharedRichEditor.
// Free the profile after the callbacks finish; writers retain their codec.
```

The default shared profile selects the same standard manifest and schema as the
local profile. Custom shared configuration keeps the original closed V1
`breditor/shared-rich-profile` shape. Shared model 11, journal 12, local history
and selective shared history keep their existing meanings. A local checkpoint
does not become a shared journal by changing constructors.

### Durable shared editor

`openSharedEditor` owns the host, exact IndexedDB journal and exclusive causal
writer. It works offline without a relay. Use a secure browser context with
IndexedDB and Web Locks; an unavailable lock API rejects rather than cloning a
live writer. A room/writer cannot be active twice on the same origin, even with
different database names.

```js
import {openSharedEditor} from '@breditor/editor/collaboration';

const editor = await openSharedEditor({
  host: document.querySelector('#shared'),
  database: 'documents', room: 'document-123', writer: '101',
  initial: {kind: 'empty'},
  onSaveState: state => console.log(state.status),
  onError: console.error,
  onClosing() {
    // Stop any borrowed relay, presence or asset adapters here.
  }
});
editor.focus();
await editor.flush(); // Completed local transaction, not a server/asset receipt.
await editor.close(); // Stops UI, retires publications, saves, then releases the writer.
```

`room` is the canonical document ID; `writer` is a canonical positive decimal
causal writer, not a user name or authentication token. An existing journal
always wins over `initial`. A first opening also accepts `{kind: 'document',
documentJson}`, `{kind: 'frame', frame}` or `{kind: 'checkpoint', checkpointJson}`.
Rust admits those values using the selected original shared profile. Recovery
does not replace a mismatched journal with the seed or import an AST in place of
history. The fresh empty editor starts with an admitted caret.

`core` is borrowed for existing relay/presence integration. Pass `editor.flush`
through a closure as a relay's `persistLocal`; keep credentials and asset bytes
in their separate host stores. The SDK does not create accounts, deploy a relay,
upload files or make image bytes part of the journal. Reuse `onFiles`,
`insertSharedImageFiles` and `resolveAsset` for those explicit services.

`close()` stops UI synchronously. The coordinator then permanently rejects local
and remote publications, including queued frames, while retaining checkpoint
reads until storage succeeds. It is not an active-editor read-only mode.
If saving fails, the owner and writer lease remain: export `checkpointJson()`
and retry `close()`. Do not treat rejection as successful disposal. Explicit
`discardAndClose()` abandons unsaved memory without deleting the last journal;
an already-started storage transaction may still commit before the lock releases.
If another tab upgrades the database, this session closes its database connection
and retires authoring but retains the unsaved native journal and lease. Export it
before explicit discard, then restore it into an admitted store; do not overwrite
an unfamiliar database version or silently recreate an empty document.
Stop borrowed transports with the synchronous `onClosing` hook before native
retirement. Synchronous lifecycle callback errors are reported but cannot cancel
the save or rewind an accepted edit; `onChange` also handles returned promises.

Abort signals cancel only that opening. An abort during Wasm initialization can
release the untouched host promptly; a later storage opening must finish safe
cleanup before returning. Failed openings restore the original host nodes.
If that cleanup itself cannot save, `SharedEditorOpenError.recovery` hands back
a checkpoint/close/discard recovery handle. React forwards this through the
required `onCloseError` callback too. Autosave
does not guarantee that an abrupt browser/process exit saved its latest edit;
await `flush()` or successful `close()` at an application durability boundary.

### Durable shared React ownership

Import `BreditorSharedEditor` from `@breditor/editor/collaboration/react`; ordinary
`@breditor/editor/react` remains independent of collaboration.

```tsx
import {BreditorSharedEditor} from '@breditor/editor/collaboration/react';

<BreditorSharedEditor
  sessionKey="document-123"
  initialOptions={{database: 'documents', room: 'document-123', writer: '101'}}
  onError={console.error}
  onCloseError={(error, editor) => {
    // Keep this recovery handle, including after unmount. Never discard implicitly.
    showSaveRecovery(error, editor.checkpointJson(), () => editor.close());
  }}
/>;
```

Options apply once per `sessionKey`; parent renders update callbacks without
resetting Rust content/history. Changing the key serializes old close before
new open, so reopening the same writer restores its exact saved journal.
Unmount performs the same asynchronous close. The required `onCloseError`
callback transfers recovery responsibility even after unmount. While mounted,
`getRecovery()` and `checkpointJson()` retain access to a failed retirement;
Retry attempts closure before opening another owner. It never silently discards
the old writer. `onClosing` can stop adapters attached in `onReady`.

The ref also exposes `getEditor`, `focus`, `execute`, `flush` and `retry`. React
does not reconcile editable children. StrictMode and late startup are covered;
server rendering emits a starting placeholder without initializing Wasm.

## Runtime and verification

Browser initialization is lazy. Node consumers can call `initializeLocalRuntime`
or `initializeSharedRuntime` with matching bytes or a compiled Wasm module before
creating profiles. Runtime input is selected once per entry: concurrent calls
reuse the same initialization; a different explicit input rejects. A failed
initialization can be retried. Public SDK types compile with `ES2022,DOM` and do
not require the generated module's disposal-symbol declarations.

Candidate build scripts are opt-in to preserve the existing default workspace
build graph. From the repository root:

```sh
npm run test:candidate --workspace @breditor/editor
node scripts/check-editor-package.mjs
node_modules/.bin/playwright test --config experiments/editor-browser/playwright.config.mjs
```

The package check installs fresh archives outside the workspace. A minimal
consumer has no React or collaboration peer; a full consumer compiles React and
both native runtimes, and builds production Vite pages. Browser checks cover
mixed document editing, exact future history after reload, asset bytes, React
ownership, offline selective history and cancellable/failed startup in all three
engines. They do not qualify native IME, VoiceOver, performance budgets or the
historical intermittent WebKit fault. The broader V1 editing/interchange goal
remains open; see the repository release plan.
