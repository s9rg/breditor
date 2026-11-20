# Breditor editor candidate

A package-root integration for Breditor's original Rust rich editor. The default
entry opens a local editor with headings, nested lists, tables, images and the
standard inline controls. React and collaboration are separate entry points;
local editing does not load a replication engine or require a relay.

This is a private `0.3.0-alpha.22` candidate, not a registry release or a frozen
V1 API. The implementation still depends on the opt-in rich-content package.
Collaboration uses the separate `@breditor/collaboration` application package,
with canonical Rust/browser source and a matching module without research probes.

The optional `@breditor/editor/collaboration/react` entry also exports
`BreditorSharedReviewPanel`. Pass the enabled core of an explicit
`SharedReviewPersistentSession` and `initialOptions` matching
`mountSharedReviewPanel`. It borrows that core: StrictMode, ordinary parent renders
and panel unmounting do not create, replace or close a writer. Configuration is
fixed per core/`sessionKey`; live policy callbacks may read current host state.
Close the paired session explicitly after borrowed controls are removed. Existing
managed document-only openings do not silently enable or persist review metadata.

## Retained raster archives

`RichAssetStore`, re-exported from the default package root, supports explicit
binary `exportBackup()` and empty-destination `restoreBackup()` with
`uploadState: 'preserve'`. This retains original raster bytes and upload epochs
for history and offline references, without starting network work or overwriting
an occupied cache. Store archives do not automatically coordinate with editor or
review/outbox checkpoints. See the [asset archive contract](../../docs/RICH_ASSET_BACKUPS.md)
for whole-store scope, sensitive receipt strings, bounds and host responsibilities.

The root also exports pure `inspectRichRaster` and `checkRichAssetLimits`; these
admit immutable raster bytes without creating a store or uploading. Shared
selected-source byte capture/read APIs live in `@breditor/collaboration`, with
explicit guarded host mappings and native source re-admission. Their
[selected-byte contract](../../docs/SELECTED_ASSET_BYTES.md) does not replace the
whole-store upload-state archive or coordinate a room-wide restore.

## Retained image references

Managed local/document editors expose `supportsRetainedAssetReferences()`,
`retainedAssetReferences(revision?)` and `checkRetainedAssetReferences(read, revision?)`.
React's `getEditor()` returns the same owner; shared managed sessions expose these
methods on `core`. The frozen native inventory includes invisible retained image
bindings, not unrelated asset-store files. Recheck the original object after
asynchronous host work: a copied, restored, foreign or stale source cannot be
adopted. DOM owners reject reads during composition/operations. Older runtimes
report unavailable instead of scanning the AST. The
[retained-reference contract](../../docs/RETAINED_ASSET_REFERENCES.md) defines the
owner-only scope; complete-room consistency, remote bytes and deletion policy
remain host/coordinator work.

## Counts and heading outline

`mountWritingTools(asideHost, editor.writing(), options?)` displays native accepted-
document counts and a paginated heading outline in a separate host outside the
editor. Counts distinguish words, graphemes, scalars, UTF-16 units, UTF-8 bytes and
text domains; all are decimal strings. Heading navigation uses the exact displayed
source, queues native selection and supports read-only owners. Stale or composing
sources reject without retrying against a different heading.

`BreditorWritingTools` from either React entry accepts
`editor={editor.writing()}`, `initialOptions` and `sessionKey`. Controls borrow the
owner; dispose/unmount them before retiring it. They neither change save formats
nor enable a new history family. Old runtimes lacking the complete optional
capability reject the explicit panel request, not ordinary editor startup.
See [the writing-tools contract](../../docs/RICH_WRITING_TOOLS.md) for bounds,
label truncation and lifecycle. Native fullscreen has the separate contract below.

## Native fullscreen

Import `createFullscreen` and `mountFullscreenControls` from `@breditor/editor`
or `@breditor/editor/collaboration`. Both local/document and shared/document
owners expose `editor.fullscreen()`. Create a stable controller, then mount its
borrowed UI in a separate host inside its target and outside editable content:

```ts
const fullscreen = createFullscreen(editor.fullscreen());
const actionHost = document.createElement('div');
fullscreen.target.append(actionHost);
const actions = mountFullscreenControls(actionHost, fullscreen);
// Teardown: preserve the editor until native fullscreen retirement completes.
actions.dispose();
await fullscreen.dispose();
```

An explicit ancestor `target` can contain the editor and adjacent controls. React's
`BreditorFullscreenControls` takes this stable `controller`; UI rerenders/rekeys
and unmounts never dispose it. Await its asynchronous `dispose()` yourself before
replacing the target/editor, retaining and retrying it after cleanup failure.
Call `enter(revision?)` directly in a user-gesture handler, with no intervening
await. Entry rejects stale/busy/composing or unsupported native requests; it never
remounts the editor, holds remote edits, adopts/exits another fullscreen session,
or stores fullscreen in document history. See [the fullscreen contract](../../docs/RICH_WRITING_TOOLS.md#native-fullscreen)
for source-bound focus, ownership, native permission and platform limitations.

## Selection toolbar and context menu

Opt-in contextual surfaces borrow the editor's admitted toolbar controls, so
buttons, shortcuts, forms, the floating toolbar and the context menu share one
Rust-derived active/mixed/disabled state, command path and focus return:

```ts
const toolbar = mountSelectionToolbar(editor.contextUi()); // over a text range; Alt+F10, Escape
const menu = mountContextMenu(editor.contextUi());         // right click, Shift+F10, ContextMenu key
toolbar.dispose(); menu.dispose();                          // or dispose the editor
```

React hosts use `BreditorSelectionToolbar` / `BreditorContextMenu` with
`editor={editor.contextUi()}`. Both hide for read-only editors and during
composition and never edit document DOM. See [the contextual UI contract](../../docs/CONTEXT_UI.md).

## Chrome localization

Every open function and React component accepts an opt-in `ui` catalog
(`initialOptions.ui` in React). It localizes the toolbar, status line and the
opt-in tools, and sets `dir`/`lang` on that chrome only; content direction stays
with each block's layout direction:

```ts
const editor = await openLocalEditor({host, ui: {lang: "ar", direction: "rtl", strings: {richToolbarLabel: "تنسيق النص"}, controls: {bold: {label: "عريض"}}}});
mountSlashCommands(editor, {items});   // menu strings and standard item labels follow editor.uiLocale()
```

The search, writing-tools and fullscreen panels read the editor's catalog
through `editor.search()`, `editor.writing()` and `editor.fullscreen()`; review
and suggestion panels take it as `initialOptions.ui` (pass `editor.uiLocale()`).
`ui.notices` relabels interchange loss codes and `ui.refusals` maps stable refusal
codes to end-user status text; thrown `Error.message` stays English for
developers. An invalid catalog rejects before the runtime loads or the host
changes. `resolveUiLocale`, `uiStringsEn`, `uiNoticeCodes` and the `Ui*` types are
exported from both entry points. See [the localization contract](../../docs/UI_LOCALIZATION.md).

## Document placeholder

Use `placeholder: 'Start writing…'` in a managed local/shared opening or React
`initialOptions`. Rust admits the prompt only for one empty top-level paragraph
or heading; whitespace and structural content suppress it. The literal initial
label stays outside editable/clipboard content and is never saved. It hides while
read-only or composing. Labels are well-formed Unicode within 1,024 UTF-8 bytes.
Profile capability admission precedes owner/durable startup; older runtimes reject
the explicit option. Omission preserves the previous DOM and startup. See
[the contract](../../docs/RICH_WRITING_TOOLS.md#document-placeholder) for the exact
policy and source guards. A placeholder supplements, never replaces, the editor's
label. After admission, `editor.setPlaceholderLabel('Localized hint')` changes only
UI text; pass `null` to hide it. The existing owner, focus and saved history remain
intact. React's `getEditor()`/`onReady` owner exposes the same method, with no rekey
required. Omitted admission cannot be enabled by this setter. Platform/screen-
reader qualification remains separate.

## Find and replace

Local owners expose a borrowed `editor.search()` port. Mount its controls in a
separate host, outside the editor's host and editable surface:

```js
import {openLocalEditor, mountSearchPanel} from '@breditor/editor';

const editor = await openLocalEditor({host: editorHost, richLanguage: 3});
const panel = mountSearchPanel(controlsHost, editor.search(), {
  initialQuery: {pattern: 'word', mode: 'literal', caseSensitive: false, wholeWords: true},
  initialReplacement: {text: 'replacement', mode: 'literal'}
});
// Later: close/focus retain drafts; dispose releases only these borrowed controls.
panel.close();
panel.focus();
panel.dispose();
editor.dispose();
```

The panel supports regex, capture expansion, Previous/Next and atomic Replace
One/All. Rust owns matching, source guards, selection, replacement and history;
highlights do not modify the editing DOM. `next`, `replaceOne` and `replaceAll`
return promises from the editor's guarded command queue. Composition, stale
source and policy changes cannot silently retry an edit. Read-only owners may
navigate but cannot replace. `BreditorSearchPanel` from either React entry accepts
`editor={editor.search()}` and optional `initialOptions`; parent rerenders preserve
drafts. It never owns or closes the editor/writer. Remove borrowed panels before
retiring their owner. No default hotkey is installed.

Shared replacement requires `openSharedSearchEditor` or
`openSharedDocumentSearchEditor` from `@breditor/editor/collaboration`, not a
runtime flag on the original startup factory. Both require `richLanguage` and
`history` explicitly. The first additionally requires `rangeEditing` (`original`
or `general-v1`); the second requires `selectionEditing: 'document-v1'`. They
accept the usual room/database/writer and empty/document/frame/resume seeds,
with a separate `{kind: 'searchCheckpoint', checkpointJson}` recovery seed.
Existing stored records take precedence. Old keys/factories reject search saves;
search factories reject old saves without rewriting them. Choose a separate key
or an explicitly designed future migration, never import only the AST to discard
history. Failed closure retains exact readable recovery and the writer lease.

`BreditorSharedSearchEditor` and `BreditorSharedDocumentSearchEditor` from the
shared React entry use the same explicit options and old-writer retirement rules.
Their normal `onCloseError(error, recovery)` handler remains required. Recovery
exposes `searchHistoryPolicy()` along with the existing scope/history metadata.
Ordinary shared owners can search/navigate without becoming search-aware writers;
their replacement controls stay disabled. Paired review persistence remains an
explicit lower-level session, not implicit document-only startup behavior.

## Slash commands

`mountSlashCommands(editor, {items})` is opt-in. It borrows a local owner and
opens an accessible command menu when the user types `/` at the start of a
paragraph or heading, or after whitespace.

- **Items.** `createSlashCommands(toolbarControls)` maps existing toolbar
  controls (headings, lists, table, and the structural V2 quote, code block,
  task list and divider) to menu items. Alternatively, pass a cancellable async
  provider `(query, {signal}) => items`.
- **Running a command.** Choosing an item removes the typed `/query` and runs
  the item's existing typed command. With a current native owner
  (`editor.supportsTriggerComposite()`), both happen in one guarded
  `replaceTriggerThen` command. Older owners, and commands outside its
  structural allowlist, use two guarded commands instead. Neither path edits the
  DOM.
- **Undo.** With the native composite, one Undo restores the typed `/query`.
  On the two-step fallback, the first Undo reverts the command and the second
  restores the typed `/query`.
- **Cancellation.** Sessions cancel on Escape, composition, blur, read-only
  policy, editor disposal, or any publication that moves the caret out of the
  trigger or changes the text before it. Stale provider results are discarded.
- **React.** `BreditorSlashCommands` from `@breditor/editor/react` wraps the same
  controller.

See [the slash-command contract](../../docs/SLASH_COMMANDS.md).

## AI rewrite and language check

Both tools are opt-in and provider-agnostic: you pass the provider
function, and the package makes no network calls of its own.

```js
import {mountAiTools, mountLanguageCheck} from '@breditor/editor';
const ai = mountAiTools(asideHost, editor, {
  provider: async ({instruction, text, signal}) => ({text: await myRewrite(instruction, text, {signal})}),
});
const check = mountLanguageCheck(otherHost, editor, {
  provider: async ({segments, signal}) => myChecker(segments, {signal}), // [{range:{block,start,end}, message, suggestions}]
});
```

- **Explicit scope.** Only the selected text, one block or (language check) the
  whole document is sent, as plain text with block ids and UTF-16 offsets.
- **Review, then one guarded command.** A rewrite is shown as a before/after
  diff; Accept applies it as one range replacement (one Undo step). If the
  document content changed meanwhile it is refused as stale and can be run again.
- **Untrusted output.** Answers are validated and size-bounded; `{markdown}` or
  `{html}` answers need an explicit `interchange` adapter and are sanitized with
  loss notices. Language issues are highlighted outside the editing DOM and
  applied one at a time from a keyboard list.
- **React.** `BreditorAiTools` and `BreditorLanguageCheck` from
  `@breditor/editor/react`.
- **Shared sessions.** `mountSharedAiTools(asideHost, session, options)` and
  `mountSharedLanguageCheck(...)` from `@breditor/editor/collaboration` take a
  `SharedEditorSession` or `SharedDocumentEditorSession` (its `aiTools()` port);
  React: `BreditorSharedAiTools` and `BreditorSharedLanguageCheck` from
  `@breditor/editor/collaboration/react`. Plain-text output only; a review stays
  valid while peers edit elsewhere and goes stale when its target changes. The
  provider may see other participants' text, so get their consent first.

See [the AI and language tool contract](../../docs/AI_AND_LANGUAGE_TOOLS.md).

## General range editing

Pass `rangeEditing: 'general-v1'` to local or shared openings, or to React
`initialOptions`, to select native partial-structure plain input. The default
retains original routing. The option is immutable per owner/React `sessionKey`.
Cross-cell browser text selections retain their partial endpoints; explicit
cell-picker grid selections are unchanged. Typing, replacement, selected
deletion, Shift+Enter and plain paste use the Rust general planner. Native general
rich Copy/Cut/paste, atomic cross-range Enter and cross-block composition routing
have functional checkpoints. Rich blocks pasted into captions/code use native
text conversion with a visible formatting-loss notice and optional
`onPasteLoss(report)` callback, also available as a live React prop. Failed rich
paste never triggers a silent plain-text retry. Whole-document Select All uses
the separate document openings below. Foreign clipboard conversion is explicit
opt-in as described below; final integrated release qualification remains open.

Local saves keep their existing checkpoint families; reapply the range option
after reload. Shared general sessions use separately declared ordinary/natural
storage records, not a JSON shape guess. Reopening requires the same range
option, selected `richLanguage`, and `history: 'typing-v1'` for naturally grouped
saves. Explicit opt-in can transactionally upgrade a legacy stored journal,
preserving its old history and Redo branch. Failed writes retain the previous
durable value. A live original session cannot silently switch its save family.

For a first-opening general shared save, use
`initial: {kind: 'generalCheckpoint', checkpointJson}` or
`{kind: 'generalTypingCheckpoint', checkpointJson}`. These explicit variants
select their matching restore factory and policy defaults. Existing stored
records take precedence over seeds. New shared recovery handles expose
`rangePolicy()` and `historyPolicy()` so a failed close/mount can retain the
declared save family. Keep the language/profile configuration too, and retry
closure or explicitly discard rather than releasing a failed writer implicitly.
General owners can select the explicit writer transport V2 adapter. Document
owners use the separate document adapter below; journal/digest guards must not
be bypassed to attach a document owner to an original/general adapter.

## Optional HTML and Markdown clipboard

Install the separate `@breditor/interchange` package to enable bounded foreign
conversion. All four managed local/shared openings accept
`clipboardInterchange: core => createRichInterchange(core)`; all four React
wrappers accept the factory in `initialOptions`. Import `createRichInterchange`
from `@breditor/interchange`. Defaults do not load its parsers or reinterpret
plain text as Markdown.

Paste prefers private Breditor content, then HTML, then explicit Markdown MIME.
Failed rich conversion does not silently retry plain text. Copy/Cut adds HTML
and Markdown; Cut refuses native deletion if a requested format was dropped.
Images require an explicit host-owned asset registry mapping.

`onInterchange(report)` is available on managed options and as a live React prop.
It reports source conversion notices and optional native caption/code losses
after retained Copy or accepted Cut/Paste, including queued work. Visible status
shows nonempty notices. The existing `onPasteLoss` callback remains supported.
See [the clipboard conversion contract](../../docs/RICH_INTERCHANGE.md).

## Explicit document selection

`openLocalDocumentEditor` from the root and `openSharedDocumentEditor` from
`@breditor/editor/collaboration` require `selectionEditing: 'document-v1'`.
They add native whole-document selection, rich Copy/Cut/paste, first-key typing,
Enter/deletion, composition and native formatting/layout coverage. This is a
distinct selection and save family; the original openings do not adopt it.
Language defaults remain 1; choose `richLanguage: 3` for layout and the full
structural grammar, with the same explicit profile configuration on recovery.

```js
import {openLocalDocumentEditor} from '@breditor/editor';

const editor = await openLocalDocumentEditor({
  host,
  selectionEditing: 'document-v1',
  richLanguage: 3,
  history: 'typing-v1'
});
editor.selectDocument();
editor.replaceDocumentPlainText('A fresh start');
const checkpointJson = editor.checkpointJson();
editor.dispose();

const restored = await openLocalDocumentEditor({
  host,
  selectionEditing: 'document-v1',
  richLanguage: 3,
  history: 'typing-v1',
  initial: {kind: 'documentTypingCheckpoint', checkpointJson}
});
```

Both owners expose `selectDocument`, `replaceDocumentPlainText`,
`pasteDocumentClipboard` and `collapseDocumentSelection`, with optional exact
revision guards. `execute` retains its original closed command DTO. Native
document views and toolbar callbacks retain their declared family. Rich Cut
requires exact retention of both MIME values before deleting content. Rich paste
failure never falls back to plain text. Asset replacement over document scope
uses `onDocumentFiles(files, revision)`; the host must retain the guard and submit
one document rich paste, not append uploaded images elsewhere.

Use `initial: {kind: 'documentCheckpoint', checkpointJson}` for explicit local
history; the natural family uses `documentTypingCheckpoint`. Original/general
checkpoint tags are not reinterpreted by these openings. The root exports
`RichDocumentSessionStore` for separate explicit local persistence. Converting
an original local save requires the headless profile's named
`restoreOriginalAsDocumentEditor`, not importing its AST instead of history.

Shared document options additionally require `database`, `room` and `writer`.
Stored journals take precedence over initial seeds; `{kind: 'resume'}` refuses to
create a fresh writer. New seeds can use `empty`, `document`, `frame`, or the two
document checkpoint variants. Durable storage routes original/general records
only to their declared old restore callbacks before an explicit document-family
upgrade; document records route only to document recovery. Keep the same
language/profile and history policy on reopening.

Shared `close()` stops UI before saving. A failed close retains the exact native
owner and exclusive writer lease for retry; retain its recovery handle or call
`discardAndClose()` explicitly. Failed startup cleanup throws
`SharedDocumentEditorOpenError` with readable recovery and required
`selectionPolicy()`, `rangePolicy()` and `historyPolicy()` metadata.

The React entry points export `BreditorDocumentEditor` and
`BreditorSharedDocumentEditor`. Their required `initialOptions` carry the explicit
selector; their imperative handles expose the named document intents. Options
are immutable per `sessionKey`, while callbacks and `readOnly` remain live. The
shared component requires `onCloseError(error, recovery)`, including after
unmount; a failed old writer blocks replacement until safe retirement succeeds.
React never reconciles editable document children.

The document SDK/React functional checkpoint covers compiled source with actual
release Wasm and synthetic DOM/storage/lock fixtures. Foreign conversion has its
own opt-in functional probe; native browser/IME/accessibility and final release
acceptance remain separate work.

### Document relay and presence

Use `createSharedDocumentRelaySync` and `createSharedDocumentPresence` from
`@breditor/editor/collaboration` with a document session's actual borrowed core.
The identity must explicitly select `writerTransport: 'atomic-v2'` and belong to
a separately created transport-V2 room. The original relay remains closed to
document checkpoints; neither adapter migrates a room or changes old digests.

```js
const presence = createSharedDocumentPresence(session.core);
const relay = createSharedDocumentRelaySync(session.core, {
  selectionEditing: 'document-v1',
  identity, // separately saved V2 writer credential, never a portable checkpoint
  getToken,
  autoConnect: false,
  presence,
  persistLocal: () => session.flush()
});
await relay.connect();
await relay.flush(); // server durability for this call's authored end
```

Dispose the relay and registry in the session's `onClosing` callback before its
native writer retires. Networking disposal does not close/discard the durable
session. Presence is optional; when requested, the separate document capability
must be confirmed. Older modules never fall back to an original packet or fake
absence. `SharedPresenceOverlay` accepts the same document registry/controller
with an explicit `selectionEditing: 'document-v1'` option.

Document presence includes whole-document scope, normal text/node/grid ranges,
genuine absence and causal-pending results. It never enters document history or
survives server restart. Original and document clients see peers using their own
presence channel; the relay filters the other packet family instead of exposing
unknown scope. Both channels share the unchanged aggregate presence budgets.
The reference loopback-host functional checkpoint includes offline rich paste,
layout, held relay updates during composition, document presence, exact durable
restart and both authors' future Undo/Redo. DOM/storage/locks are fixtures, not
installed-package, native-browser or deployment qualification.

## Local editor

Local and shared openings accept `readOnly: true`; both owners also expose
`setReadOnly(boolean, expectedRevision?)`. This native policy blocks authoring
without discarding Undo/Redo or preventing selection, Copy and incoming shared
updates. Cut copies without deleting. Both React components accept a live
`readOnly` prop and an imperative setter without recreating the owner.
Policy is not stored permission: restored owners start editable, so hosts must
reapply their policy before exposing them. Server authorization and editable
region restrictions are separate contracts. See `docs/RICH_READ_ONLY.md` in the
repository for publication, composition and asynchronous-file behavior.

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
`additionalInlinePresentation`. Ordinary set-format commands still replace complete
property maps. The separate compound command also accepts an explicit property
patch. In the Link form, leave one field blank to preserve that field on each
existing link; enter both fields to replace or create complete links. Partial
patches require every selected character to be linked. Use Unlink to remove links.
Shared patches use a guarded Rust planner and the existing complete-format wire
operations. They preserve observed omitted fields, not independently merging
concurrent edits to different fields of the same format. See
`docs/RICH_INLINE_PROPERTY_PATCHES.md` in the repository for native/API examples
and the unchanged action limits.

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

### Explicit block layout V3

Use `richLanguage: 3` in local/shared openings or either React component's
`initialOptions` to add bounded native block layout to the V2 structural grammar.
Defaults remain language 1; existing V2 profiles and saved content are not
upgraded. The V3 standard schema is `breditor-editor/standard@3` and shared
storage binds model 13/journal 14. Custom configurations must use the corresponding
explicit V3 factory contract, not relabel an old checkpoint.

The V3 toolbar adds Alignment, Text direction, Block indentation, Line spacing
percent and Reset block layout. Each control retains mixed state independently;
Inherit clears only that property. Indentation is a logical block margin, not
list/task nesting. Control/Command+Shift+L/E/R/J apply physical Left, Center,
physical Right and Justify even with an empty custom toolbar. Code blocks,
captions and native node/grid coverage use the same Rust layout transaction.

```js
const editor = await openLocalEditor({host, richLanguage: 3});
editor.execute({
  kind: 'changeSelectionLayout',
  data: {alignment: 'start', direction: 'rtl', indent: 2, lineHeightPercent: 150}
});
// null removes a property; omitted fields remain unchanged.
editor.execute({kind: 'changeSelectionLayout', data: {indent: null}});
```

Headless factories are `createLayoutLocalProfileV3` and
`createLayoutSharedProfileV3`. Shared owners expose
`core.changeSelectionLayout(patch, revision?)`; both owners expose native
`blockLayoutState()` and `supportsBlockLayout()`. Custom toolbars can compose
`createLayoutRichToolbarV3` or `createLayoutSharedToolbarV3` with their matching
owner. Numeric values must be finite primitives; arbitrary CSS and objects that
serialize into null are rejected. See `docs/RICH_BLOCK_LAYOUT.md` in the repository
for bounds, independent shared fields, history and qualification scope.

### Candidate rich language V4 (frozen, local only, not released)

`richLanguage: 4` selects the candidate V4 for local openings
(`openLocalEditor`, `openLocalDocumentEditor` and the local React components'
`initialOptions`). It is V3 plus bounded ordered-list numbering, text-run language, image links, collapsible sections, mention entities, table captions, page breaks and bookmarks with internal links.
Its grammar and schema fingerprint are **frozen**: a later grammar change becomes
a new language, never a change to V4. V4 is still a candidate (not part of a
released V1). Shared openings reject `richLanguage: 4` explicitly; shared
editing stays on languages 1–3 while a shared V4 is built. The standard schema is
`breditor-editor/standard@4` (`profileBootstrapJsonV4`, bootstrap format 9);
the headless factory is `createLocalProfileV4`.

Local V4 documents, checkpoints and histories may be persisted. Bind the store to
the exact fingerprint; saved records are refused under any other profile:

```ts
import {openLocalDocumentEditor,RichDocumentSessionStore,standardSchemaFingerprintV4} from "@breditor/editor";
const store=await RichDocumentSessionStore.open("notes",{richLanguage:4,schemaFingerprint:standardSchemaFingerprintV4,history:"typing-v1"});
const saved=await store.load();
const editor=await openLocalDocumentEditor({host,selectionEditing:"document-v1",richLanguage:4,history:"typing-v1",
 initial:saved?{kind:"documentTypingCheckpoint",checkpointJson:saved}:{kind:"empty"},
 onChange:()=>void store.save(editor.checkpointJson())});
```

`standardSchemaFingerprintV4` is the stock profile's frozen fingerprint; a custom
`profileBootstrapJson` binds its own `profile.descriptor().schemaFingerprint`. The
V4 store writes record V2 (`schemaFingerprint` added); languages 1–3 keep record V1
and older runtimes refuse V4 records. See `docs/RICH_LANGUAGE_V4.md` (Freeze and
durable persistence) in the repository.

The V4 toolbar (`createRichToolbarV4`) adds a List numbering control: numbering
style (decimal, lower/upper alpha, lower/upper roman), counting order and start
for the ordered list that owns the selection. Each list keeps its own values;
nested lists never inherit them.

```js
const editor = await openLocalEditor({host, richLanguage: 4});
editor.execute({kind: 'setListNumbering', data: {list: 'steps', style: 'lower-roman', reversed: true, start: 5}});
// Omitted fields keep; style: null clears; reversed: false removes reversal.
editor.execute({kind: 'setListNumbering', data: {list: 'steps', style: null, reversed: false}});
```

V4 also tags runs of text with a language (`<span lang="…">`), so assistive
technology, spell checking and hyphenation use the right language. The V4
toolbar adds **Language** (a validated BCP 47 tag field) and **Clear language**.
Language never changes block direction, and *Clear standard formatting* keeps it.

```js
// Applies to the current selection (one Undo step) or, at a caret, to the next typing.
editor.execute({kind: 'setTextLanguage', data: {language: 'fr-ca'}}); // stored as fr-CA
editor.execute({kind: 'setTextLanguage', data: {language: null}});    // clear
```

Tags are a bounded, well-formed subset of BCP 47 (language, optional script,
region and variants; at most 35 characters; no private-use `x-` or extension
subtags). The static renderer emits the same `lang` spans.

V4 images can be links. The link wraps the image only (never its caption), uses
the same safe URL policy as inline links (canonical credential-free HTTP(S), at
most 2,048 bytes) and needs alternative text: a decorative image cannot be
linked. While editing, clicking a linked image selects it and never navigates.
The V4 toolbar adds **Image link** (URL plus same/new window) and **Remove image
link**; the static renderer emits the same `<a>` around the `<img>`.

```js
editor.execute({kind: 'setImageLink', data: {image: 'img-1', href: 'https://example.com/', newWindow: true}});
editor.execute({kind: 'setImageLink', data: {image: 'img-1', href: null}}); // remove
```

V4 adds collapsible sections: a summary line followed by a body of ordinary
blocks, rendered as native `<details>`/`<summary>`. Open state is part of the
document (Undo, checkpoints, clipboard). While editing, clicking a summary only
places the caret; use **Expand/Collapse section** to toggle. **Collapsible
section** wraps the selected blocks (or the caret's block) in an open section with
an empty summary; **Remove collapsible section** turns the summary into a
paragraph. Enter in a summary opens a fresh first body paragraph and Backspace at
a summary start removes the section. The static renderer emits `<details open>`.

```js
editor.execute({kind: 'wrapDetails', data: {first: 'p1', last: 'p2', wrapper: 'sec-1', summary: 'sum-1', open: true}});
editor.execute({kind: 'setDetailsOpen', data: {block: 'sec-1', open: false}});
editor.execute({kind: 'unwrapDetails', data: {wrapper: 'sec-1'}});
```

V4 adds mention entities: an inline `@label` chip carrying a closed kind
(`user`, `page`, `tag`), a host id and the label captured at insertion. The chip
is atomic (the caret skips it, Backspace deletes it whole, typing next to it is
plain). `mountMentions(editor, {items})` adds an opt-in `@` menu; choosing a
suggestion replaces the typed `@query` in one Undo step. The static renderer
emits `<span class="breditor-mention" data-mention-kind data-mention-id>@label</span>`.

```js
import {mountMentions} from '@breditor/editor';
const mentions = mountMentions(editor, {items: async (query, {signal}) => (await fetch(`/people?q=${encodeURIComponent(query)}`, {signal})).json()});
editor.execute({kind: 'insertMention', data: {selection, mention: {kind: 'user', id: 'u-1', label: 'Ann Lee'}}});
```

V4 adds table captions: one optional caption paragraph per table, shown below
the rows (`<caption>` with `caption-side: bottom`). The **Table caption** toolbar
control adds an empty caption and moves the caret into it, or removes it; Enter in
a caption inserts a line break and table actions keep it.

```js
editor.execute({kind: 'addTableCaption', data: {table: 'table-1', caption: 'caption-1'}});
editor.execute({kind: 'removeTableCaption', data: {table: 'table-1'}});
```

V4 adds explicit page breaks, admitted only between top-level blocks. The **Page
break** toolbar control (and slash item) inserts one after the root block holding
the selection; a page break is selected, navigated and deleted like a horizontal
rule. Printing is opt-in CSS from `@breditor/experimental-rich-content`
(`richPrintStyles`, `mountRichPrintPreview`); the static renderer embeds it with
`renderStaticDocument(doc, {print: {size: 'A4', orientation: 'portrait', margin: 'normal'}})`,
which also emits leading header rows in `<thead>` so they repeat on every page.
Breditor does not paginate the editor itself; see `docs/PAGINATION_AND_PRINT.md`.

```js
editor.execute({kind: 'insertPageBreak', data: {position: {parent: {kind: 'document'}, before: null}, block: 'page-break-1'}});
```

V4 adds named bookmarks on paragraphs, headings and code blocks and internal links
(`#name`) to them. Renaming retargets every link in one Undo step; deleting or
clearing a target leaves a reported, visibly broken link (`core.bookmarkIndex()`).

```js
editor.execute({kind: 'setBookmark', data: {block: 'heading-1', name: 'intro'}});
editor.execute({kind: 'renameBookmark', data: {from: 'intro', to: 'overview'}});
```

See `docs/RICH_LANGUAGE_V4.md` in the repository for domains, semantics,
interchange behavior and what is not included (legal multilevel counters).

### Natural local typing history

Pass `history: 'typing-v1'` to `openLocalEditor` or React `initialOptions` for native
typing/deletion bursts. Omitted history or `'explicit'` keeps the original
per-dispatch behavior. Matching Wasm is required; there is no JavaScript history
fallback. Local V1, structural V2 and layout V3 support the mode. Shared sessions have
the separate opt-in policy described below.

The mode groups adjacent same-context user input within 750 ms, up to 64 original
steps. Paste, composition, replacement, formatting and structural edits remain
separate. Navigation, blur, pointer and toolbar intent end the burst. Use
`editor.closeTypingGroup(revision?)` or the React handle for an explicit host
boundary. Mode is initial configuration, not a live React prop.

Save the exact `checkpointJson()` and reopen this separate family with
`initial: {kind: 'typingCheckpoint', checkpointJson}`. Keep the same `richLanguage`.
The original `kind: 'checkpoint'` factory remains strict; combining that original
recovery with `history: 'typing-v1'` explicitly enables grouping for future input.
Recovery preserves grouped Undo/Redo but starts a fresh typing burst. An explicit
history option cannot discard a grouped checkpoint's partition. See
`docs/RICH_TYPING_HISTORY.md` for the native contract and qualification limits.

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
code inserts LF; Enter in a nonempty task, or one with a rich tail, splits into an
unchecked right task while
retaining the left completion and rich tail. Joining retains left completion;
Undo restores both original states. Task checkboxes support pointer and Space.
The existing Indent/Outdent controls and prose Tab/Shift+Tab use task-specific
actions that preserve checked values and complete bodies. Browser Enter exits
only a truly empty task with no rich tail; nested tasks promote one level, while
top-level tasks leave their same prose block outside the list. Undo restores all
completion metadata. Checkbox Tab navigation and composition keys stay separate.
Native-widget keys cannot navigate or delete a still-selected grid. Backspace
on a checkbox cannot navigate the browser away; Undo/Redo remains available for
checkbox changes. Matching V2 Wasm
declares `taskStructureVersion: 1`; older runtimes reject before host mutation.

Shared model 11 remains V1-only. Complete atomic navigation, code-exit shortcuts
and broader selection/history/interchange work remain open.
The optional shared entry also has an explicit structural V2 candidate described below.
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
Use `{kind: 'resume'}` when a writer must already have an exact durable journal;
missing history rejects without seeding a fresh writer or replacing saved state.
Rust admits those values using the selected original shared profile. Recovery
does not replace a mismatched journal with the seed or import an AST in place of
history. The fresh empty editor starts with an admitted caret.

Pass `history: 'typing-v1'` to opt into native shared typing/deletion bursts in
either language, including React initial options. Default sessions stay explicit.
`editor.closeTypingGroup(revision?)` and the React handle end a burst without
editing content. Shared checkpoints then use a separate family; first-open
recovery uses `{kind: 'typingCheckpoint', checkpointJson}`. Preserve the explicit
history option on durable reopening. A default opening rejects a grouped stored
record without overwriting it. Explicit opt-in can atomically upgrade an original
stored journal, preserving its old units and Redo. Failed retirement recovery
exposes `historyPolicy()` so hosts can retain the declared family with its bytes.
See `docs/RICH_TYPING_HISTORY.md` for exact recovery, input and timing limits.

`core` is borrowed for existing relay/presence integration. Pass `editor.flush`
through a closure as a relay's `persistLocal`; keep credentials and asset bytes
in their separate host stores. The SDK does not create accounts, deploy a relay,
upload files or make image bytes part of the journal. Reuse `onFiles`,
`insertSharedImageFiles` and `resolveAsset` for those explicit services.
Shared image ingestion holds the bounded remote queue until its original guarded
insertion commits. Local selection/history changes still reject a stale intent;
failure retains separately stored bytes and always releases the remote hold.

### Explicit shared structural V2 candidate

Pass `richLanguage: 2` to `openSharedEditor` or shared React `initialOptions`.
`createStructuralSharedProfileV2()` supplies the corresponding headless factory.
It selects `breditor-editor/standard@2`, configuration format 2, causal model 12
and journal 13. Custom configuration must use that exact language revision.
Omitted or `1` retains the original profile, model 11 and journal 12. No existing
document, journal or room is migrated; keep the language selection when reopening.

The standard V2 toolbar includes quote wrapping, code conversion/language, tasks
and rules. Task checkbox pointer/Space, prose Enter and Tab/Shift+Tab use named
native actions. Splits, joins and nesting retain complete rich tails and independent
completion contributions; a truly empty task can exit without discarding content.
Code Enter inserts LF and conversion requires an explicit formatting-loss policy.
Native widgets retain their navigation even when a logical grid remains selected.
Both owners share read-only targeting helpers; the Rust owner remains the only
authority for edits, conflict resolution, selections and history.

Relay rooms must also be created explicitly as structural V2. A V1 room or an
older module without the distinct V2 factories rejects instead of falling back.
The reference relay supplies `init-v2` and `init-standard-v2` for those separate
profiles. Credentials, durable journals and asset bytes remain separate services.
This private candidate is not a V2 release qualification or a historical WebKit
repair; general selections, natural typing groups and foreign interchange remain open.

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
If startup has not changed the child list, rollback leaves those nodes connected
so an existing input keeps its focus, value and text selection. It does not steal
focus back if the user moved elsewhere. Restoring a genuinely changed child list
preserves node identity/order, not a general focus-restoration guarantee.
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
node scripts/check-editor-browser.mjs
```

The browser check first installs fresh archives outside the workspace, then runs
every discovered spec once in each configured engine, in separate editing and
real-network processes with unchanged case/global deadlines and zero retries.
A minimal
consumer has no React or collaboration peer; a full consumer compiles React and
both native runtimes, and builds production Vite pages. Browser checks cover
mixed document editing, exact future history after reload, asset bytes, React
ownership, offline selective history and cancellable/failed startup in all three
engines. They do not qualify native IME, VoiceOver, performance budgets or the
historical intermittent WebKit fault. The broader V1 editing/interchange goal
remains open; see the repository release plan.
