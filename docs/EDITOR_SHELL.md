# Editor shell: menu bar, keyboard shortcut help and empty-line block menu

Status: opt-in browser presentation for local (`RichDomEditor`, including the
document-selection variant), shared (`SharedDomEditor`) and `@breditor/editor`
SDK sessions. It adds no document format, command, history family, Rust
capability or Wasm method. An editor that mounts none of it renders byte-identical
DOM and output.

Comparison targets: the CKEditor 5
[menu bar](https://ckeditor.com/docs/ckeditor5/latest/getting-started/setup/menubar.html),
[editor types](https://ckeditor.com/docs/ckeditor5/latest/getting-started/setup/editor-types.html)
(balloon, balloon block, inline),
[Accessibility help dialog](https://ckeditor.com/docs/ckeditor5/latest/features/accessibility.html#keyboard-shortcuts)
(Alt+0) and the Tiptap
[FloatingMenu](https://tiptap.dev/docs/editor/extensions/functionality/floatingmenu).
Breditor borrows the interaction model, not their plugin APIs.

## One command/state contract

Every command item in the shell is an **admitted toolbar control** borrowed
through `RichContextUiHost.mountContextControl`, exactly like the floating
selection toolbar and the context menu ([CONTEXT_UI.md](CONTEXT_UI.md)):

- the same widget (`mountToolbarControl`), Rust-derived `read()`
  (active/mixed/unset → `aria-pressed`) and `enabled()` plus the read-only gate;
- the same command path: `command` → `execute` locally, `run` → one guarded
  native dispatch for shared owners; one Undo step per item;
- the same stale-draft rejection for field controls (Link, Heading level, …)
  and the same editor focus return;
- borrowed widgets are refreshed by the coordinator in the same pass as its own
  toolbar, so the menu bar, the block menu and the standard toolbar always show
  the same state after every publication.

Unknown or unadmitted ids reject at mount. The shell never edits document DOM,
copies selection or format state, or publishes; it only shows, positions and
focuses presentation.

The coordinators gained two read-only additions on the host port:

- `contextUiState().emptyParagraph`: `true` when the Rust selection is a caret in
  a `breditor/paragraph` with no text and no inline atoms (derived from the same
  Rust view as `selection`).
- `contextShortcuts()`: the chords the coordinator's own keydown routing owns
  (see [Shortcut registry](#shortcut-registry)).

## API

```ts
import {mountMenuBar,mountShortcutHelp,mountFloatingMenu,mountBalloonBlockLayout} from '@breditor/editor';
// or from '@breditor/editor/collaboration', or mountSharedMenuBar / mountSharedShortcutHelp /
// mountSharedFloatingMenu / mountSharedBalloonBlockLayout from '@breditor/collaboration',
// or mountRich* from '@breditor/experimental-rich-content'.

const help = mountShortcutHelp(editor.contextUi());                 // Alt+0
const bar = mountMenuBar(editor.contextUi(), {help});               // Alt+F9
const blockMenu = mountFloatingMenu(editor.contextUi());            // empty-line menu
// Teardown (disposing the editor disposes them too):
blockMenu.dispose(); bar.dispose(); help.dispose();
```

React: `BreditorMenuBar`, `BreditorShortcutHelp` and `BreditorFloatingMenu` from
`@breditor/editor/react` or `@breditor/editor/collaboration/react`, with
`editor={editor.contextUi()}`, `initialOptions` and `sessionKey`, like the
context UI components. One of each per editor (a second mount rejects).

The standard toolbar itself can live in a host element outside the editor root
(`toolbarContainer`, `mountToolbar`, `BreditorToolbarSlot`); see
[External toolbar container](#external-toolbar-container-decoupled-layout).

## Menu bar

`mountRichMenuBar(host, options)` inserts a WAI-ARIA `role="menubar"` before the
editor toolbar (or into `container`).

Options:

- `menus`: `[{id, label?, controls}]`, one to twelve menus. Ids are lowercase
  (`/^[a-z][a-z0-9-]{0,31}$/`) and unique; the standard ids `edit`, `insert`,
  `format`, `table`, `tools` and `help` take their label from the UI catalog
  (`menuEdit`, …), any other id needs a `label`. Every control must be admitted,
  may appear in only one menu, and a menu may not be empty (except `help` when
  `help` is passed). Omitted: `richMenuBarDefaults` (Edit, Insert, Format, Table)
  filtered to the admitted controls, empty menus dropped.
- `focusShortcut`: default `Alt+F9`; `null` disables. Closed grammar
  `Alt+<digit>` / `Alt+F1…F12`, optionally `Alt+Shift+…`; Alt+F10 is reserved
  for the floating toolbars.
- `help`: a mounted shortcut help; adds Help → Keyboard shortcuts.
- `hideDisabled` (default `false`), `label`, `container`, `onError`.

Structure and states:

- Top-level items are `menuitem` buttons with `aria-haspopup="menu"`,
  `aria-expanded` and `aria-controls`; each popup is `role="menu"` labelled by
  its item. Wrappers and borrowed control containers are `role="none"`.
- Plain controls become `menuitem`; pressed-state controls `menuitemcheckbox`
  with `aria-checked` mirrored from the shared widget's `aria-pressed`
  (`true`/`false`/`mixed`); field controls keep their `<details>` panel with the
  summary as the `menuitem`. Disabled controls stay visible with
  `aria-disabled="true"` (the native button is disabled) and are skipped by the
  arrow keys; `hideDisabled: true` hides them instead.

Keyboard (APG menubar pattern; Left/Right swap under right-to-left chrome):

| Where | Key | Effect |
| --- | --- | --- |
| Editor root (surface, toolbar, status) | Alt+F9 | Focus the menu bar (roving tab stop) |
| Menu bar item | Left / Right, Home / End | Move between menus (switching the open menu) |
| Menu bar item | Down, Enter, Space / Up | Open the menu on its first / last enabled item |
| Menu bar item | letter | Typeahead to the next menu starting with it |
| Menu bar item | Escape | Close and return focus (and Rust selection) to the editor |
| Menu item | Up / Down, Home / End | Rove enabled items (wrapping) |
| Menu item | Left / Right | Open the adjacent menu on its first item |
| Menu item | letter(s) | Typeahead (500 ms buffer) |
| Menu item | Escape | Close onto its menu bar item |
| Menu bar item or closed menu control | Tab | Close the menu and let focus move on |
| Open field form | Tab / Shift+Tab | Move focus using the form's native tab order |

Running an item closes the menu after the control returned focus to the editor;
a refused field form keeps the menu open. Inside a field form the widget keeps
its keys (Enter applies, Escape cancels the draft and returns to the editor).
Pointer: clicking a menu bar item toggles its menu, hovering another item while
one is open switches menus, pointer-down outside closes.

## Keyboard shortcut help

`mountRichShortcutHelp(host, options)` mounts a hidden modal dialog.

- **Alt+0** anywhere in the editor root opens it (`shortcut` option, same
  closed grammar as the menu bar, `null` disables). `open()` / `close()` too.
- `role="dialog"`, `aria-modal="true"`, labelled by its heading and described by
  the intro line; focus moves to the dialog. Tab / Shift+Tab cycle inside it
  (scrollable list, Close); focus that escapes is pulled back. Escape, Close or
  a backdrop click closes and returns focus to where it was (the editor
  surface's Rust selection is restored through `host.focus()`).
- Content is built at each open from the registry (`entries()`), grouped
  History, Text formatting, Blocks, Navigation and selection, Commands, Editor
  interface; empty groups are omitted.
- `platform`: `apple` shows `⌘⇧Z`-style symbols, `other` `Ctrl+Shift+Z`;
  default `auto` reads `navigator.platform` for display only (execution always
  accepts Ctrl or Command, as the coordinators do). Each `<kbd>` carries a
  spelled-out `aria-label` (`Command+Shift+Z`). Alternatives are joined with the
  catalog's `shortcutHelpOr`.

### Shortcut registry

`richActiveShortcuts(host)` (also `help.entries()`) returns frozen entries
`{id, group, label, keys:[{key, primary?, alt?, shift?}]}`:

1. `host.contextShortcuts()`: the coordinator's own chords in its precedence
   order. Admitted controls with a `shortcut` (`control:<id>`, labelled with the
   catalog's control label) come first because they win in the keydown handler;
   then the built-ins its capabilities enable: Undo, Redo (Ctrl+Y and
   Ctrl+Shift+Z), Bold, Italic/Underline/Strikethrough (structural languages with
   selection formatting and an inline presentation), Select all, Shift+Enter
   line break, Ctrl+Enter code exit (structural), block alignment
   Ctrl+Shift+L/E/R/J (block layout) and Alt+PageUp/PageDown (flow navigation).
   A built-in whose chord a control already claims is omitted.
2. Opt-in presentations register the chords they install while mounted: the
   selection toolbar (Alt+F10), context menu (Shift+F10, Menu key), menu bar
   (its focus chord), block menu (Alt+F10), help (its chord), the block drag
   handle's editor shortcut (Alt+Shift+Up/Down) and Escape. Disposing releases
   them.

The registry describes chords; it never installs a listener or routes a
command. The `@breditor/browser` plain editor's declarative manifest
([KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md)) remains separate: it already
projects `aria-keyshortcuts` from its compiled table.

## Empty-line block menu (FloatingMenu equivalent)

`mountRichFloatingMenu(host, options)` shows a `role="toolbar"` ("Insert block")
of block controls beside the caret of an **empty paragraph**:

- Visible only while `contextUiState()` reports `selection:"caret"` and
  `emptyParagraph:true`, the editor is editable, no composition is active, the
  surface or the menu holds focus, and at least one control is enabled.
- Defaults `richFloatingMenuDefaults` (Heading, H1–H3, lists, task list, quote,
  code block, table, horizontal rule, page break, collapsible section) filtered
  to the admitted controls; `controls` picks explicit ids. Disabled controls are
  hidden (`hideDisabled`, default `true`).
- It **never steals typing**: showing it never moves focus, background presses
  are cancelled so the caret stays, and the first typed character makes the
  paragraph non-empty so the next publication hides it.
- Keyboard: Alt+F10 in the editor moves focus to its first enabled control
  (the selection toolbar uses the same chord, but the two are never visible at
  the same time); Left/Right/Home/End rove; Escape dismisses it until the next
  publication and returns focus to the editor.
- Positioned `position: fixed` to the inline-end of the caret (inline-start
  under right-to-left chrome), vertically centred on the line, clamped to the
  viewport; an empty block without a caret rectangle uses its first line.

## Balloon and balloon-block layouts

Breditor does not add editor types: a layout is a composition of the existing
presentations around the same coordinator.

| CKEditor type | Breditor composition |
| --- | --- |
| Classic | The coordinator's fixed toolbar (default), optionally with the menu bar |
| Decoupled | `toolbarContainer` / `mountToolbar(container)` ([External toolbar container](#external-toolbar-container-decoupled-layout)), optionally the menu bar in any `container` |
| Balloon | `mountSelectionToolbar` + hide the fixed toolbar |
| Balloon block | Balloon + `mountFloatingMenu` (empty lines) + the block drag handle (`mountRichBlockDrag` / `mountSharedBlockDrag`) for the per-block handle |
| Inline | The fixed toolbar or menu bar mounted into a host container shown on focus |

`mountRichBalloonBlockLayout(host, options)` is the small preset: it mounts the
selection toolbar, the block menu and the shortcut help (each can be `false` or
receive its options) and hides the fixed toolbar (`hideToolbar`, default
`true`; controls stay admitted and keyboard shortcuts keep working). `dispose()`
disposes what it mounted and restores the toolbar's `hidden` state. The drag
handle stays a separate mount because it needs the coordinator itself
(`RichDomEditor` / `SharedDomEditor`), not the context UI port.

## External toolbar container (decoupled layout)

A host page can place the editor's standard toolbar anywhere on the page (an
app header, a sticky bar, a side panel) while the editing surface stays in the
editor root. This is the coordinator's **own toolbar element** moved into the
host container: no widget is re-created, copied or borrowed, so it keeps the
same admitted controls, Rust-derived `read()`/`enabled()` state and read-only
gate, the same command path (`execute` locally, one guarded `run` for shared
owners), one Undo step per command, the stale-draft check of field forms and
the focus return to the editor.

```ts
// At startup (validated before the editor root changes):
const editor = await openLocalEditor({host, toolbarContainer: header, ...});
// or later, on any local, document, shared or shared-document coordinator:
const toolbar = mountExternalToolbar(editor.contextUi(), header);  // = editor.contextUi().mountToolbar(header)
toolbar.focus();                 // first enabled control
toolbar.dispose();               // back into the editor root, in front of the text
editor.contextUi().externalToolbar?.(); // current mount (including the startup option) or null
```

Entry points: the `toolbarContainer` option of `RichDomEditor` /
`mountRichEditor` / `mountDocumentRichEditor`, `SharedDomEditor` /
`mountSharedEditor` / `mountSharedDocumentEditor` and therefore of every
`@breditor/editor` open function (`openLocalEditor`, `openLocalDocumentEditor`,
`openSharedEditor`, `openSharedDocumentEditor`, which also check it before any
runtime work); the coordinators' `mountToolbar(container)` and
`externalToolbar()`; and `mountRichExternalToolbar(host, container)`
(`mountExternalToolbar` in `@breditor/editor` and
`@breditor/editor/collaboration`, `mountSharedExternalToolbar` in
`@breditor/collaboration`). React: `BreditorToolbarSlot` from
`@breditor/editor/react` or `@breditor/editor/collaboration/react` renders one
empty `<div data-breditor-toolbar-slot>` (`className` prop) and mounts the
toolbar of `editor={editor.contextUi()}` into it; unmounting or a new
`sessionKey` disposes the mount. React never reconciles the moved toolbar.

Validation at mount (each failure throws and changes nothing): `TypeError` when
the container is not an element; `Error` when it belongs to another document,
is not connected, is the editor root or inside it, is inside editable content
(`contenteditable` other than `false`), is inside another editor (a rich or
shared root, another external toolbar wrapper or a multi-root editor) or
already holds another editor's external toolbar. One external mount per editor
at a time: a second `mountToolbar` rejects until the first is disposed, so
moving to another container is `dispose()` then `mountToolbar(other)`. A
disposed editor rejects.

Structure: the toolbar is wrapped in `<div class="breditor-external-toolbar"
data-breditor-external-toolbar>` carrying the coordinator's root attribute
(`data-breditor-rich` or `data-breditor-shared`) so the editor's scoped toolbar
styles still apply; the wrapper is appended to the container. A small
stylesheet addition (`richExternalToolbarStyles`) is added to the editor's own
style element only when an external mount happens, so editors that never use it
render byte-identical DOM.

Keyboard:

| Where | Key | Effect |
| --- | --- | --- |
| Editor root (surface, menu bar, status) | Alt+F10 | Focus the first enabled toolbar control (skipped while the selection toolbar or the empty-line block menu is visible: they own Alt+F10 then) |
| External toolbar (outside a field form) | Escape | Return focus (and the Rust selection) to the editor |
| Field form | Enter / Escape | Unchanged: apply once / cancel the draft and return to the editor |

Tab order inside the toolbar is the browser's, as in the classic layout. The
shortcut registry lists Alt+F10 as `ui:editor-toolbar` ("Move focus to the
editor toolbar", catalog key `shortcutFocusEditorToolbar`) while mounted.

Cleanup: `dispose()` (idempotent) moves the toolbar back in front of the text
(after a menu bar, if one is mounted), removes the wrapper and the keyboard
bridge, releases the registry entries and returns focus to the editor when it
was inside the toolbar. Disposing the editor removes the wrapper from the host
container. Two editors on one page each own their wrapper; a container is never
shared, and each toolbar only drives its own editor.

The menu bar still inserts itself into the editor root (or its own
`container`), and the balloon-block preset hides only a toolbar that is in the
editor root. `mountRichMultiRootEditor` already places its roots' toolbars in its
own shared strip, so its editors reject `mountToolbar`.

## Localization

All chrome strings are in the UI catalog block `ui_locale_shell.ts`
(`richShellUiStringsEn`): menu labels, `menuBarLabel`, `floatingMenuLabel`,
the dialog strings, group names, built-in shortcut names and modifier names
(`keyControl`, `keyCommand`, `keyAlt`, `keyOption`, `keyShift`). Control labels
come from the catalog's `controls` entries. Chrome elements take the catalog's
`dir`/`lang`.

## Limitations

- Verified with jsdom contract tests (`packages/breditor-editor/tests/editor_shell_contract.test.ts`)
  for local and shared coordinators, real Rust/Wasm browser checks in Chromium,
  Firefox and WebKit (`experiments/rich-browser/editor-shell.spec.mjs`) and a
  shared two-writer check (`experiments/shared-browser/editor-shell.spec.mjs`).
  Screen-reader announcement has not been qualified with assistive technology.
- The external toolbar container is covered by
  `packages/breditor-editor/tests/external_toolbar_contract.test.ts` (local and
  shared), `external_toolbar_react.test.tsx` and the real Rust/Wasm check
  `experiments/rich-browser/external-toolbar.spec.mjs`. Alt+F9 and Alt+0 are
  listened for on the editor root, so they do not fire while focus is in an
  external toolbar (Alt+F10 / Escape go back first). A container inside a shadow
  root needs the toolbar styles in that shadow root.
- Browser or operating-system reservations can intercept Alt+F9 / Alt+0 (for
  example some Linux window managers); both chords are configurable.
- Fixed positioning of the block menu and the dialog assumes no transformed
  ancestor between the container and the viewport.
- The registry lists the chords Breditor owns; native browser chords (copy,
  paste, caret movement) are not listed.
