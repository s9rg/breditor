# Breditor editor candidate

A package-root integration for Breditor's original Rust rich editor. The default
entry opens a local editor with headings, nested lists, tables, images and the
standard inline controls. React and collaboration are separate entry points;
local editing does not load a replication engine or require a relay.

This is a private `0.3.0-alpha.22` candidate, not a registry release or a frozen
V1 API. The implementation still depends on the opt-in rich-content package.
Collaboration now includes its matching Wasm binary, but its Rust source remains
in the isolated collaboration workspace pending promotion.

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
    initialOptions={{initial: {kind: 'empty'}, label: 'Document'}}
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

Install the exact matching `@breditor/experimental-collaboration` candidate and
use `@breditor/editor/collaboration`. Its generated module and binary are now
inside that archive. Importing the local root never imports this entry.

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

The collaboration entry reexports the existing session, lease, relay, asset and
DOM coordinators. It does not yet provide a shared React component or automatic
durable session lifecycle. Keep the writer lease until session closure succeeds;
a failed flush must not be treated as successful disposal or discarded state.
The reference relay is optional and is not deployed by this package.

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
