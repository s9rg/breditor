# Standard toolbar layout: groups, separators, row breaks and overflow

Status: opt-in browser presentation for the rich (`RichDomEditor`) and shared
(`SharedDomEditor`) coordinators, including their document-selection variants
and the `@breditor/editor` factories that forward coordinator options. It adds
no document format, history family, command or Rust capability.

## One control contract

A layout only *arranges* the controls the coordinator already admitted through
its `toolbar` option. Every item is the exact `mountToolbarControl` widget the
plain toolbar would show:

- the same Rust-derived `read()` (active / mixed / unset, `aria-pressed`),
  `enabled()` gate, read-only gate (`readOnlySafe`) and stale-draft stamp;
- the same command path (`command` → `execute` locally, `run` → guarded native
  dispatch for shared owners), so each activation is one command and one Undo
  step, local or shared;
- the same focus return to the editor after a command, and the same keyboard
  shortcuts (`control.view.activate()`), context menus and menu bar borrowing
  (`contextControlIds()` keeps admission order).

Admitted controls that the layout does not list follow the listed items in
admission order, after a separator, so no admitted control (or its keyboard
shortcut) disappears.

## API

```ts
mountRichEditor(host, {
  core, toolbar,
  toolbarLayout: {
    groupWhenFull: true, // opt-in overflow, see below
    items: [
      'undo', 'redo', '|',
      {kind: 'group', id: 'text', label: 'Text style', items: ['bold', 'italic', 'underline']},
      '|', 'bullet', 'numbered',
    ],
  },
});
editor.toolbarLayoutState(); // {open, overflow, groups} or null without a layout
```

The same `toolbarLayout` option exists on `SharedDomOptions` and flows through
`openLocalEditor`/`openSharedEditor` options (and their document variants).

Entries:

| Entry | Meaning |
| --- | --- |
| `"<control id>"` | An admitted control. |
| `"\|"` or `{kind: "separator"}` | `role="separator"` between two items. |
| `"-"` or `{kind: "break"}` | Starts a new toolbar row (`.breditor-toolbar-row`). |
| `{kind: "group", id, label, items}` | Dropdown action group of admitted controls. |

Validation happens at mount, before the coordinator touches its host, and
rejects with `TypeError` (shape) or `Error` (admission): unknown fields; a
non-boolean `groupWhenFull`; 0 or more than 128 entries; unknown or repeated
control ids (a control appears at most once, top level or in one group); group
ids that are not `^[a-z][a-z0-9-]{0,63}$`, repeat, or collide with a control
id; empty or over-long labels; empty groups or more than 32 members; a
separator or break first, last, doubled, or a separator right before a break;
and `groupWhenFull` combined with any row break.

## Dropdown groups

- A disclosure button (`aria-expanded`, `aria-controls`) and a popup
  `role="group"` labelled by the button. The members are the admitted widgets.
- Aggregated state, read from the members' last Rust-derived readings, never
  recomputed: `data-breditor-group-state` is `active` if any member reads
  pressed, else `mixed` if any reads mixed, else `inactive` if any member is a
  pressed-state control, else `stateless`. The button is `aria-disabled="true"`
  (and will not open, and is skipped by roving) when every member is disabled;
  an open group closes when it becomes disabled.
- Mouse: pressing the button keeps the editor focus and native selection (like
  a plain toolbar button) and toggles the popup. A plain command closes its
  popups after it ran; field forms stay open until applied or dismissed.
  Pointer-down outside, or focus leaving the toolbar, closes popups.

## Group when full

`groupWhenFull: true` keeps one row (`flex-wrap: nowrap`). A `ResizeObserver`
on a zero-height sentinel (whose size changes only with the toolbar's width, so
re-arranging never retriggers it in the same frame) restores every item, then
moves trailing top-level items (controls, groups and dangling separators) into
a **Show more items** disclosure (`toolbarShowMoreItems` in the chrome catalog)
until the row fits. Widening restores the declared order. Without
`ResizeObserver` the arrangement runs at mount and on window `resize`. Under
right-to-left chrome the measurement uses the left edge. A widget that had focus
when it moved into the menu hands focus to the overflow button.

## Keyboard (WAI-ARIA toolbar)

- One roving tab stop across all rows: the item the user last focused while
  it stays enabled, otherwise the first enabled item. Disabled items are
  skipped, as native disabled buttons are not focusable.
- **Left/Right** (mirrored under RTL chrome) move between top-level items,
  **Home/End** jump to the ends; Left/Right inside a text field or select keep
  their editing meaning. A single-field control's stop is its field and Enter
  applies it.
- On a group or overflow button: **Down/Enter/Space** open onto the first
  enabled item, **Up** onto the last, **Escape** closes an open popup (focus
  stays on the button) or otherwise returns focus to the editor.
- Inside a popup: **Up/Down/Home/End** rove its items (groups nested in the
  overflow menu open the same way), **Escape** closes that popup back to its
  button before the widget's own Escape; inside an open field form the widget
  keeps Escape (dismiss and return to the editor) and Tab keeps its native
  order.
- **Escape** on a top-level control returns focus to the editor (unchanged
  widget behavior). Running any item returns focus to the editor.

## Scope and limitations

- Applies to the rich and shared coordinators' standard toolbars. The
  manifest-driven `BreditorToolbar` in `@breditor/browser` keeps its flat
  layout.
- Popups are absolutely positioned under their button; they are not clamped to
  the viewport.
- Verified with jsdom contracts for local and shared coordinators
  (`packages/breditor-editor/tests/toolbar_layout_contract.test.ts`) and the
  real Rust/Wasm V4 owner in `experiments/rich-browser/toolbar-layout.spec.mjs`
  (narrow-width overflow, keyboard navigation, Undo). Screen-reader announcement
  of the aggregated group state is not qualified.
