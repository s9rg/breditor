# Contextual controls: selection toolbar and context menu

Status: opt-in browser presentation. It adds no document format, history family,
command or Rust capability.

## One command/state contract

The standard toolbar, keyboard shortcuts, field forms, the floating selection
toolbar and the context menu all drive the **same admitted toolbar controls**:

- A DOM coordinator (`RichDomEditor`, `SharedDomEditor`, and the document-selection
  variants) admits its `toolbar` controls once at construction, including
  owner-binding checks.
- The coordinator implements `RichContextUiHost`. `mountContextControl(container,
  id, signal)` mounts an admitted control with the exact `mountToolbarControl`
  widget and hooks the standard toolbar uses: the control's Rust-derived
  `read()` (active / mixed / unset, `aria-pressed`), `enabled()` plus the
  read-only gate (`readOnlySafe`), the stale-draft stamp, typing-history boundary,
  the coordinator's command path (`command` → `execute` locally, `run` →
  guarded native dispatch for shared owners) and the editor focus return.
- Borrowed widgets are refreshed in the same pass as the standard toolbar, so
  every presentation shows the same state after every publication. Unknown ids
  reject; nothing can mount a control the editor did not admit.
- The contextual UI never edits document DOM, never copies selection or format
  state and never publishes. It only positions, shows/hides and focuses widgets.

`contextUiState()` reports `{revision, closed, busy, composing, readOnly,
selection}` where `selection` is derived from the current Rust view (`"text"` is a
non-collapsed text range, `"caret"` a collapsed one). `subscribeContextUi()`
notifies after publications, selection changes, composition, policy changes and
disposal; listeners must not publish.

## API

```ts
import {mountSelectionToolbar, mountContextMenu} from '@breditor/editor';
// or mountSharedSelectionToolbar / mountSharedContextMenu from '@breditor/collaboration',
// or mountSelectionToolbar / mountContextMenu from '@breditor/editor/collaboration'.

const toolbar = mountSelectionToolbar(editor.contextUi());
const menu = mountContextMenu(editor.contextUi(), {controls: ['undo', 'redo', 'bold', 'link']});
// Teardown (or dispose the editor, which disposes both):
toolbar.dispose();
menu.dispose();
```

React: `BreditorSelectionToolbar` and `BreditorContextMenu` from
`@breditor/editor/react` or `@breditor/editor/collaboration/react`, with
`editor={editor.contextUi()}`, `initialOptions` and `sessionKey`. They render no
DOM of their own (only an alert on startup failure); unmount before retiring the
editor.

Options: `controls` (explicit admitted ids, in order; omitted uses
`richSelectionToolbarDefaults` / `richContextMenuDefaults` filtered to what the
toolbar admits), `container` (outside editable content; default the editor root
so toolbar styles apply), `label`, `onError`; the menu also takes `hideDisabled`
(default `true`). One selection toolbar and one context menu per editor.

## Selection toolbar behavior

- Visible only while the Rust selection is a non-collapsed text range, the editor
  surface or the toolbar holds focus, the editor is editable, no composition is
  active and no pointer drag is in progress. Hidden for read-only editors.
- Positioned `position: fixed` above the selection's client rect (below when there
  is no room), clamped to the viewport, and repositioned on publications,
  `selectionchange`, any scroll (captured) and `resize`. Hidden when the
  selection is scrolled out of the surface or viewport.
- Keyboard: **Alt+F10** in the editor moves focus to the first enabled control;
  Left/Right/Home/End rove; **Escape** dismisses until the next publication and
  returns focus to the editor (also from the editor itself while visible).
- Running a control returns focus to the editor exactly as the standard toolbar
  does; the toolbar stays visible while the range remains selected. Field
  controls (for example Link) keep the existing stale-draft rejection: a draft
  started at one publication refuses to apply after another.

## Context menu behavior

- **Shift+right-click always shows the browser's native menu**, which carries
  spelling suggestions and native clipboard commands the editor menu does not.

- Opens on `contextmenu` in the editor surface (at the pointer, or at the
  selection for keyboard-invoked events), **Shift+F10**, the **ContextMenu** key,
  or `menu.open(point?)`. It does not open (and the native menu is left alone)
  for read-only, composing, busy or closed editors, or when no item is enabled.
- `role="menu"`; plain controls become `menuitem`, pressed-state controls
  `menuitemcheckbox` with `aria-checked` mirrored from the shared widget's
  `aria-pressed` (`true`, `false` or `mixed`). Disabled controls are hidden by
  default and never focusable.
- Up/Down/Home/End rove; **Escape** or **Tab** from a closed control returns
  focus and selection to the editor. **Tab** and **Shift+Tab** in an open field
  form use its native tab order. Running an item closes the menu after the
  control returns focus to the editor. A refused form keeps the menu open.
  Pointer-down outside, focus leaving the menu, read-only policy and
  composition close it.
- Repositions on scroll/resize relative to the surface (pointer-opened) or the
  selection (keyboard-opened).

## Editor shell

The menu bar, keyboard shortcut help dialog and empty-line block menu
([EDITOR_SHELL.md](EDITOR_SHELL.md)) are built on this same host port. The
selection toolbar and context menu register their chords (Alt+F10, Shift+F10,
the Menu key, Escape) in the editor's read-only shortcut registry while mounted,
so the help dialog lists them.

## Teardown

`dispose()` aborts every borrowed widget (removing it from the coordinator's
refresh set), removes listeners and the element, and releases the per-editor
lease so a new instance can mount. Disposing the editor disposes both surfaces.

## Limitations

- Fixed positioning assumes no transformed ancestor between the container and the
  viewport; pass a `container` outside such ancestors if needed.
- Geometry is read from the DOM selection range; when the browser exposes no rect
  the focused block or the surface rectangle is used.
- Verified with jsdom contract tests for local and shared coordinators
  (`packages/breditor-editor/tests/context_ui_contract.test.ts`); real-browser
  geometry, screen-reader announcement and IME behavior are not yet covered by
  Playwright acceptance.
