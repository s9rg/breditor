# Editing aids: show blocks, invisible characters, focused block, minimap

Opt-in, presentation-only aids for local and shared rich editors. They answer
"what block am I in?" and "is that a space, a no-break space or a line break?"
without changing anything a document, a peer or a screen reader sees. An
optional content minimap gives a scaled overview of the whole editor with a
draggable viewport indicator.

Comparable features: CKEditor 5's
[Show blocks](https://ckeditor.com/docs/ckeditor5/latest/features/show-blocks.html)
(outline and name each block) and Tiptap's
[Invisible characters](https://tiptap.dev/docs/editor/extensions/functionality/invisiblecharacters)
(spaces, hard breaks and paragraph ends, toggle command, configurable
characters) and Focus extension (a class on the focused node), and CKEditor 5's
[Minimap](https://ckeditor.com/docs/ckeditor5/latest/features/minimap.html)
(a scaled preview of the document in a sidebar with a draggable viewport). Breditor's
version covers widgets that CKEditor's does not (tables, images, page breaks,
collapsible sections) and draws no decoration inside the document DOM.

## Use

```js
import {mountEditingAids, mountEditingAidsControls} from '@breditor/editor';
// or '@breditor/editor/collaboration', or mountRichEditingAids from
// '@breditor/experimental-rich-content'.

const aids = mountEditingAids(editor, {showBlocks: false, invisibles: false, focus: true});
const controls = mountEditingAidsControls(editor.toolbar, aids);

aids.toggleShowBlocks();      // or setShowBlocks(true)
aids.setInvisibles(true);     // or toggleInvisibles()
aids.state();                 // {showBlocks, invisibles, focus, minimap, disposed}
aids.subscribe(() => {/* state changed */});

// Optional minimap in a host sidebar outside the editor (give it a size).
const withMap = mountEditingAids(editor, {minimap: {container: sidebar}});
withMap.toggleMinimap();      // or setMinimap(true)

controls.dispose();           // removes only the two buttons
aids.dispose();               // removes the layer, stylesheet, listeners and focus attribute
```

The host is any object with an editor `surface` and optional `uiLocale()`: local
`RichDomEditor`, shared DOM editors, and the managed local and shared SDK
editors. A bare surface element also works. One mount per surface.

| Option | Default | Meaning |
| --- | --- | --- |
| `showBlocks`, `invisibles`, `focus` | `false` | Initial state of each aid. |
| `kinds` | all | Invisible-character kinds: `space`, `nbsp`, `tab`, `hardBreak`, `blockEnd`. |
| `glyphs` | `· ° → ↵ ¶` | Replacement glyph per kind; one to four printable characters. |
| `shortcuts` | `true` | Ctrl/Cmd+Alt+Shift+B toggles show blocks, Ctrl/Cmd+Alt+Shift+P invisible characters, while the surface has focus. |
| `ui` | host `uiLocale()` | Catalog for block labels. |
| `injectStyles`, `nonce` | `true`, none | Default stylesheet; hosts may style the classes below instead. |
| `maxMarkers` | 8192 (max 65536) | Elements painted per frame. |
| `onChange` | none | Called with the new state. |
| `minimap` | none | `{container, scroller?, maxBlocks?, visible?}`: mount the content minimap (below). |

Malformed options throw before anything is mounted.

`mountEditingAidsControls(host, aids)` appends a `role="group"` of two toggle
buttons (`aria-pressed`, `aria-keyshortcuts`, catalog labels and chrome
`dir`/`lang`) to a host outside the editable surface, for example the editor's
own toolbar. Buttons keep focus in the editor on pointer down.

## What is painted

**Show blocks** draws a dashed box over every rendered block
(`[data-rich-block]`) and a small label at its top end corner (top start corner
for right-to-left blocks). The labels come from the UI catalog: Paragraph,
Heading *n*, Bulleted/Numbered/Task list, List item, Task, Quote, Code block,
Table, Caption (table and image captions), Image, Horizontal line, Collapsible
section, Section summary, Page break and a generic Block. Keys are `aid*`
(`aidBlockParagraph`, `aidBlockHeading` with `{level}`, …) plus `aidsLabel`,
`aidsShowBlocks` and `aidsInvisibles`, in a separate block
(`ui_locale_editing_aids.ts`) merged into `RichUiStrings`.

**Invisible characters** marks, inside text blocks (`[data-rich-text]`):

| Kind | Character | Glyph |
| --- | --- | --- |
| `space` | U+0020 | `·` centered on the space |
| `nbsp` | U+00A0, U+202F | `°` (distinct color) |
| `tab` | U+0009, where the document contains one | `→` |
| `hardBreak` | U+000A (Shift+Enter) | `↵` at the end of the broken line |
| `blockEnd` | end of each text block | `¶` after the last character; on the empty last line after a trailing hard break; at the start of an empty block |

Text inside non-editable atoms (mention chips) is not marked. Glyph painting is
suspended during IME composition and resumes at `compositionend`.

**Minimap** (`minimap: {container}`) appends one `aria-hidden` root
(`[data-breditor-minimap]`, filling the container) to a host element outside
the editable surface; give the container a width and height, for example a
sticky sidebar. It paints one empty box per rendered block
(`.breditor-minimap-block` with `data-minimap-kind` = `text`, `heading`,
`container`, `table`, `image`, `rule` or `atom`) scaled to fit the container,
plus a viewport indicator (`.breditor-minimap-viewport`, with `data-view-top`
and `data-view-bottom` in surface pixels) for the visible part of the editor.

| Minimap option | Default | Meaning |
| --- | --- | --- |
| `container` | required | Host element outside the surface; malformed or inside the surface throws. |
| `scroller` | auto | Scroll container to follow and drive: the surface or its nearest scrollable ancestor, else the document's scrolling element. Must contain the surface. |
| `maxBlocks` | 4096 (max 65536) | Block boxes painted per rebuild. |
| `visible` | `true` | Initial visibility; `setMinimap` / `toggleMinimap` change it. |

The overview is not a clone: it copies no text, element ids, attributes,
contenteditable regions, images or focusable elements from the document, so
nothing in it can clash with document ids, be selected, be found by search, or
be read twice by a screen reader. DOM changes (local typing, peer frames,
resizes) rebuild it at most once per 100 ms on an animation frame; scrolling
only moves the indicator. A primary-button press outside the indicator centers
the viewport there; dragging (also from inside the indicator) scrolls
continuously, with pointer capture. The press is default-prevented, so focus,
the caret and the selection stay in the editor.

The minimap is pointer-only and deliberately not focusable: everything it does
is available from the keyboard already, because moving the caret
(arrows, Page Up/Down, Ctrl/Cmd+Home/End) scrolls the same container, and a
scrollable container is itself keyboard-scrollable. Adding a focus stop would
duplicate that and add an unlabeled control to the tab order.

**Focus** (`focus: true`) sets `data-breditor-focused` on the innermost block
holding the selection focus, following the caret and re-applied after every
render. It is the only aid that touches the editable DOM, and only with an
attribute, never text. The default style is an inset left bar; hosts may
restyle `[data-breditor-focused]`.

Classes: `[data-breditor-minimap]` (minimap root, `data-dragging` while dragging),
`.breditor-minimap-content`, `.breditor-minimap-block`, `.breditor-minimap-viewport`;
`[data-breditor-editing-aids]` (layer, carries `data-show-blocks` and
`data-invisibles`), `.breditor-aid-block` (`data-aid-block`),
`.breditor-aid-label` (`data-aid-label`, `data-aid-side`), `.breditor-aid-char`
(`data-aid-kind`).

## Presentation-only guarantees

- The layer is a `position:fixed`, `pointer-events:none`, `aria-hidden` element
  outside the editable surface (in the fullscreen element while the editor is
  fullscreen), measured from transient DOM ranges, as the search and
  language-check overlays are. Clicks pass through to the text below.
- No text node, wrapper, pseudo-element or style is added inside editable text,
  so model offsets, caret movement, selection painting, IME, `Range.toString`,
  Copy/Cut, search, the accessibility tree and the trailing-break anchor are the
  same with the aids on and off.
- Toggling never reaches the Rust owner: no command, publication, revision,
  frame or Undo step. The shortcuts are captured before the editor's key
  handler, so they do not close a typing group. In a shared room the aids are
  per viewer and never replicated.
- Static rendering (`renderStaticDocument`), interchange, print and export are
  untouched; the layer, the minimap and the focus style are hidden under
  `@media print`.
- The minimap only reads block boxes and writes the scroll container's
  `scrollTop`. It never reaches the owner, the selection or focus, and is per
  viewer in shared rooms. `dispose()` removes its root and listeners and leaves
  the host container as it was.
- Only blocks intersecting the visible surface are painted. Scrolling, resizing,
  DOM changes (including remote shared edits) and fullscreen changes repaint on
  the next animation frame. Each paint is bounded by `maxMarkers` and a fixed
  per-paint character scan budget. Ordinary characters in visible runs count
  toward the scan limit too. Paragraph-end-only painting skips the scan.

## Not included

- **A faithful content preview in the minimap** (CKEditor renders a second,
  scaled copy of the editable DOM): Breditor's minimap draws block boxes only,
  so the overview shows the document's shape (headings, paragraphs, lists,
  tables, images, rules) rather than miniature text. Cloning would duplicate
  ids, text and media and would need a second render path to stay inert.
- Horizontal minimap scrolling; the indicator follows vertical scroll only.
- **Document title** (CKEditor title plugin): a required title block separate
  from the body is document structure, not a presentation aid, and the frozen
  V4 grammar has no such node. A host can already require a leading heading.
- Custom character builders with arbitrary predicates (Tiptap); the kinds and
  glyphs here are a closed, validated set.

## Tests

- `packages/breditor-editor/tests/editing_aids.test.ts` (vitest, 9): toggling
  never calls the owner, closes no typing group and leaves the editable DOM,
  view, undo depth and Copy unchanged; labels for every block kind and an
  Arabic catalog; marker kinds, configurable kinds/glyphs, composition and
  limits; option validation; captured shortcuts; toolbar buttons; the focus
  attribute; the minimap's option validation, block boxes and scaling,
  `aria-hidden` root without text, ids or focus stops, press and drag
  scrolling (including grabbing the indicator), throttled rebuild after DOM
  changes, hiding, `maxBlocks` and disposal, with no owner call, editable DOM,
  view or Copy change.
- `experiments/rich-browser/editing-aids.spec.mjs` (Chromium, Firefox, WebKit;
  8 each) over the real Wasm V4 owner: box and label geometry for every block
  kind, glyph placement on spaces, no-break spaces and paragraph ends, clicks
  through labels, identical caret/selection traces, documents, undo depth and
  Undo results for one scripted keyboard session with the aids off and fully
  on, identical Copy flavors, shortcuts and toggles not being edits, the focus
  attribute, and visible-only painting with repaint on scroll. Minimap: the
  scripted keyboard session, Copy flavors, editable DOM, undo depth and
  `renderStaticDocument` output are identical with and without it; an empty
  accessibility snapshot; the indicator follows page scrolling; click and drag
  scroll the page while focus, selection, document and history stay the same;
  Enter adds a box; a scrolling surface is detected and driven.
- `experiments/shared-browser/editing-aids.spec.mjs` (Chromium, Firefox,
  WebKit; 2 each) over two real shared V4 writers: toggling on one writer
  produces no frame, revision or history change and leaves the peer's DOM
  byte-identical; typing with the aids on converges; the aided overlay repaints
  for peer edits; shortcuts and Undo in the shared surface.
