# Pagination and print

Audit gap `pagination` (MISSING before this change): "The editor is a continuous
flow surface, not a paginated document layout engine." Acceptance: "Keep page
layout separate from canonical rich flow where possible; define deterministic
print/export expectations for tables, captions and images."

## Scope decision

**Breditor stays a flow editor.** It does not measure text, split blocks across
pages, number pages, or keep any page geometry in the document, the history or
the Rust owner. A pagination engine would make canonical content depend on fonts,
viewport, printer and browser, which conflicts with deterministic content and
exact cross-engine history.

Instead Breditor gains two separate, small pieces:

1. **An explicit page-break block** in rich V4
   (`breditor/page-break`). It is the only page-related fact stored in a
   document: "start a new page after this point when printing". It is ordinary
   canonical content with history, clipboard, interchange and static output.
2. **An opt-in print presentation layer** (`richPrintStyles`,
   `mountRichPrintPreview`, and the static renderer's `print` option). It is CSS
   only: bounded `@page` choices plus `break-*` hints handed to the browser's own
   paged-media layout. It never changes the document.

Everything else about pages (where automatic breaks fall, widows/orphans, header
repetition) is the browser's paged-media layout under those rules.

## The page-break block (rich V4)

| Item | Value |
| --- | --- |
| Node | `breditor/page-break`: required `block-id`, no other property, no children |
| Placement | **direct child of the document root only** |
| Profiles | V4 only (`supports_rich_page_breaks()`, descriptor `pageBreakVersion: 1`, owner `pageBreakVersion()` `"1"`, facade `supportsPageBreaks()`); V1–V3 reject the kind |

**Why root only.** A forced break between two top-level blocks has one meaning in
every print engine. A break inside a list item, quote, task item, collapsible
section (which may itself sit in a list or cell) or table cell either has no
reliable CSS meaning (cells, collapsed sections) or would require splitting the
container. Because child grammar is per element kind, admitting it in section
bodies would also have admitted it inside sections nested in cells and list
items. Root-only keeps the grammar context-free and the meaning exact. Content
that needs a break inside a structure ends the structure first.

Consequences of the grammar (all refused atomically by native admission): moving
or wrapping a page break into a container, pasting a record containing a page
break into a nested position, wrapping a range that contains one into a quote,
list or section.

### Actions

| Rust | Wasm/TS command | Semantics |
| --- | --- | --- |
| `RichLocalSession::insert_page_break(snapshot, position, block)` | `{kind:"insertPageBreak",data:{position,block}}` | Inserts one page break with the fresh identity `block` at a **document-root** flow position (one `InsertBlocks` history group). The selection is mapped (the caret stays). A non-root position is refused (`RichPageBreakError::Placement`). |
| `RichLocalSession::delete_page_break(snapshot, block, paragraph)` | `{kind:"deletePageBreak",data:{block,paragraph}}` | Removes one page break (one `ReplaceBlocks` group). A node-selected page break recovers exactly like `deleteAtom`; otherwise the selection maps. `paragraph` is a fresh floor used only when nothing else would remain. A non-page-break target is refused (`RichPageBreakError::Target`). |
| `RichBlockDraft::page_break(id)` | flow draft `{kind:"pageBreak",block}` | Generic `insertBlocks` and clipboard drafts; root-only placement is proved by the grammar. |

Both commands are strict records (unknown or missing fields rejected), refuse
read-only owners, stale observations and non-V4 contexts
(`RichPageBreakError::Profile`), and have exact Undo/Redo and checkpoint restore.

Existing generic behavior covers the rest: a page break is a **whole atom** like
an image, table or horizontal rule — node-selectable (click the marker), a
logical flow-navigation stop (`navigateFlow`, Alt+PageUp/PageDown),
deletable with Backspace/Delete as a node selection (`deleteAtom`), replaceable
by typing over its node selection, and adjacent paragraphs can be inserted with
`insertParagraphAdjacent`. Delete at the end of the block before it (or Backspace
at the start of the block after it) selects it first. Block moves keep it inside
the root (`MoveBlock`, drag handle, keyboard move). Search, replace and writing
tools skip it (it has no text). A general range across it removes it with the
covered text. Node, range and whole-document copies keep it (paste rekeys its
identity); its plain-text flavour is an empty line; a V1–V3 owner refuses a
record containing it.

### Rendering

- **Live:** `<div data-rich-block data-rich-page-break class="breditor-page-break" role="separator" aria-label="Page break" style="break-after:page;page-break-after:always" contenteditable="false" data-select-node>`.
  The accessible label is the UI catalog string `pageBreakLabel` (new key, English
  default "Page break"); `richPageBreakStyles` (installed by the rich controller)
  draws a dashed line with the label centred on it (`content:attr(aria-label)`).
- **Static:** the same element and attributes without the editing affordances
  (`contenteditable`, `data-select-node`); label option `pageBreakLabel` (default
  English). A live/static parity test compares the two.

### Toolbar and slash menu

`createRichToolbarV4` adds **Page break** (`page-break`): it inserts after the
document-root block that holds the selection (a caret in a list, quote, section
or table cell inserts after that whole root block) and keeps the caret. The
standard slash menu gains **Page break** (`page-break`), present only with a V4
toolbar. Both are localizable through the existing control and slash-item maps.

## Print presentation layer

### `richPrintStyles(options?)`

Pure, deterministic CSS (`@breditor/experimental-rich-content` and its
DOM-free `/rendering` entry). Options are closed sets; anything else throws
`TypeError`:

| Option | Values | Default |
| --- | --- | --- |
| `size` | `A4` (210 × 297 mm), `Letter` (215.9 × 279.4 mm) | `A4` |
| `orientation` | `portrait`, `landscape` | `portrait` |
| `margin` | `narrow` 12.7 mm, `normal` 25.4 mm, `wide` 38.1 mm (every side) | `normal` |

`resolveRichPrintLayout(options)` returns the frozen layout with exact
millimetre lengths (page, margin, printable width and height).

The stylesheet contains `@page{size:<size> <orientation>;margin:<n>mm}` and,
under `@media print`, rules scoped to `[data-breditor-rich]` (the live editor
root and the static wrapper):

| Content | Rule |
| --- | --- |
| Page break | `break-after:page` (+ legacy `page-break-after:always`), zero height, marker and label hidden |
| Table rows, `<caption>`, figures (image + caption) | `break-inside:avoid` |
| `<thead>` / `<tfoot>` | `table-header-group` / `table-footer-group` (repeated on each page) |
| Headings | `break-after:avoid` (kept with the next block) and `break-inside:avoid` |
| Paragraphs, list items, summaries | `orphans:2; widows:2` |
| Images | `max-width:100%; height:auto` |
| Code blocks | wrap (`pre-wrap`, `overflow-wrap:anywhere`) instead of clipping |
| Editor chrome | toolbar, status line, selection buttons and drag handles hidden; surface border/padding, selection outlines removed |

### Header row repetition

Header cells are a per-cell flag (`header: true`, rendered as `<th>`); the live
editor renders every row in one `<tbody>`, so **the live editor does not repeat
header rows when printed**. The static renderer's print mode
(`renderStaticDocument(doc, {print: true | options})`) emits the leading header
group in `<thead>`: the longest run of leading rows in which every slot is
covered by a header cell and no such cell spans past the run, keeping at least
one body row. Paged media then repeats it. Without `print` the static output is
byte-for-byte unchanged.

### Print preview: `mountRichPrintPreview(surface, options?)`

Opt-in and CSS only. It marks the surface (`data-breditor-print-preview`,
`aria-description` from the new catalog key `printPreviewLabel`) and installs
a stylesheet in the surface's document or shadow root. The surface becomes the
printable width with the page margin as padding, and a thin guide is drawn every
printable page height. Each mounted
screen preview uses its own layout. By default the print styles for the same
layout are installed too (`print: false` to skip). For a shadow-root surface,
the preview adds the `@page` rule to the owner document. The browser applies
page size and margins to the whole printed document. `update(options)` changes
the layout and moves the preview styles to the surface's current tree. Call it
after moving a mounted surface between the document and a shadow root.
`dispose()` restores the element's prior attributes and removes the preview
styles. Editing continues normally during preview.

### Static export

`renderStaticDocument(doc, {print})` starts the wrapper with
`<style data-breditor-print>` holding `richPrintStyles` for the layout. A fragment
(`fragment: true`) carries no stylesheet; hosts add `richPrintStyles()` to their
page and wrap the fragment in an element with `data-breditor-rich`.

## Deterministic expectations

Deterministic (tested): the stored page breaks; the emitted CSS text for each
option set; the static markup (`<thead>` grouping, page-break element); the
computed styles under print media in Chromium, Firefox and WebKit (page-break
`break-after: page`, rows `break-inside: avoid`, headings `break-after: avoid`,
hidden chrome, `<thead>` as `table-header-group`).

Not deterministic and not promised: where automatic page breaks fall, how many
pages result, and whether `break-inside: avoid` can be honored (an element taller
than a page is split anyway). These depend on fonts, printer, the print dialog
and the engine.

## Limitations

- **The preview guides are approximate.** They are drawn every printable page
  height from the top of the content; they ignore forced page breaks (the marker
  shows those), `break-*` avoidance moving content to the next page, repeated
  header rows, print scaling/"fit to page" and engine-specific print fonts.
- **`@page size`** is honored by Chromium and Firefox; WebKit (Safari) uses the
  print dialog's paper and orientation. Margins are honored by all three.
- **Header rows repeat only in static print output**, not when printing the live
  editor (see above).
- **Collapsed sections print collapsed** (native `<details>` rendering); expand
  them before printing to include their bodies.
- No page numbers, running headers/footers, page counters, footnotes, columns,
  keep-with-next per block, section-specific page sizes or orientation, or
  avoid-break toggles in the document. Breaks inside lists, quotes, sections and
  cells are not representable (root only).
- Shared V4 has page breaks too (`insert_page_break`/`delete_page_break`, see
  [SHARED_RICH_V4.md](SHARED_RICH_V4.md)); shared interchange does not report them yet.

## Interchange

`@breditor/interchange` reads `supportsPageBreaks()` once (local V4 owners only).

- **HTML import, V4 owner.** Recognized page-break *carriers* each become exactly
  one page break with no notice: Word's `<br clear=all style='mso-special-character:line-break;page-break-before:always'>`
  (also with `mso-break-type:section-break`, alone or inside a paragraph, which is
  split around it), Google Docs' `<hr style="page-break-before:always;display:none">`,
  and an empty `<div>` with a forced break (our export). A forced break declared
  on a content block (`page-break-before/after: always`, `break-before/after:
  page`) becomes a page break before/after that block; like CSS fragmentation,
  such a break is dropped at the very start or end of the content and next to
  another page break. `left`/`right`/`recto`/`verso` force a page and report
  `style-approximation`; `auto` is ignored; `avoid` keeps reporting
  `unsupported-style`. A page break that would land below the document root (in a
  quote, list, section, table cell) is removed with `block-structure`.
- **HTML import, V1–V3 and shared owners:** unchanged. The break declarations
  report `unsupported-style`, Word's `<br clear=all>` stays a line break (with
  `unsupported-attribute`), and the hidden Docs `<hr>` is removed
  (`removed-content`).
- **HTML export:** `<div style="break-after:page;page-break-after:always"></div>`,
  which round trips exactly.
- **Markdown:** no syntax; the page break falls back to that HTML block with
  `markdown-feature`, which reimports as a page break into a V4 owner.

## Tests

- Rust core `tests/rich_page_break_v4.rs`, Wasm `tests/rich_page_break_v4.rs`.
- TypeScript: rich-content `tests/page_break.test.ts` (render, catalog label,
  targeting, toolbar/slash, atom deletion, block moves, print layout/CSS/preview,
  factory boundary), editor `tests/static_page_break.test.ts` (static output,
  rejection, live parity, print mode and `<thead>`), interchange
  `tests/page_break.test.ts` (Word/Docs/export shapes, collapsing, nested
  removal, exact V1–V3 behavior, export, Markdown fallback and round trip).
- Playwright `experiments/rich-browser/page-break-v4.spec.mjs` in Chromium,
  Firefox and WebKit, including `page.emulateMedia({media:"print"})` checks of
  computed break styles for the live editor and the static print export.
