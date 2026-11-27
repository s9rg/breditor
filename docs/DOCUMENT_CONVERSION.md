# Document conversion (DOCX export)

Status: opt-in, **export only**. `@breditor/interchange/docx` converts a native
rich document into a Word (`.docx`) package in the page or in Node. It adds no
document format, command, history family, saved setting or Rust capability, and
nothing loads unless a host imports the entry point.

This closes the first slice of the `document-conversion` audit gap: a
self-hostable adapter with explicit licensing and fidelity targets that keeps
document/asset bindings and reports unsupported content instead of silently
dropping it. DOCX import, PDF and ODT remain non-goals (see the end).

## Decisions

| Question | Decision |
| --- | --- |
| Adapter | An in-repo writer: no service, binary, WebAssembly converter or new npm dependency. It runs wherever the editor runs (browser, worker, Node ≥ 18) and is self-hosted by construction. |
| Packaging | A separate entry point of the existing private `@breditor/interchange` package: `@breditor/interchange/docx` (`dist/docx.js`). It reuses the package's bounded grammar copies (safe URLs, language tags, image-link targets, mention entities, loss accounting) but imports **none** of the HTML/Markdown parser graph (`parse5`, `markdown-it`, `css-tree`); a unit test pins its exact module graph. The main `@breditor/interchange` entry is unchanged. `@breditor/editor` is unchanged and gains no dependency. |
| Container | ECMA-376 transitional WordprocessingML in an OPC ZIP package. |
| ZIP / compression | A ~50-line STORE-method writer with CRC-32 (`src/docx/zip.ts`). There was no permissive ZIP/deflate library in the workspace, and `CompressionStream('deflate-raw')` is asynchronous and engine-specific (different deflaters produce different bytes), which would break byte-for-byte determinism across browsers and Node. STORE is valid for every OOXML consumer; media (PNG/JPEG/GIF) is already compressed, so the size cost is limited to XML parts. |
| Determinism | Identical document JSON and image bytes give identical archive bytes on every engine: fixed DOS timestamp (1980-01-01 00:00), fixed part order, no `dcterms:created`/author/revision metadata, and relationship ids, numbering ids, drawing ids and media names assigned in document order. Unit tests and the browser spec compare two exports byte-for-byte. |
| Asset bindings | Images are referenced by their native `(asset-id, asset-generation)` binding. The host supplies bytes (`image` sync callback, or `exportDocxWithImages` with an async `loadImage`, e.g. `RichAssetStore.blob`). The library never fetches. Each distinct binding becomes one `word/media/imageN.*` part and one relationship, shared by every use. Missing bytes → `image-reference` loss, the alt text is kept. |
| Validation | Input is structurally validated (node shapes, ill-formed UTF-16 rejected, table/merge references checked) and bounded before any output is produced; known properties with out-of-range values are reported, not trusted. |

### Licensing

- The writer is original code under the repository's `MIT OR Apache-2.0` dual
  licence, with no third-party runtime code. Generated documents are the user's
  content; the only library-authored content is fixed style/numbering
  boilerplate, which carries no licence obligation.
- OOXML (ECMA-376 / ISO/IEC 29500) is an open standard. The schemas and
  relationship URIs used are the published transitional ones; Microsoft's Open
  Specification Promise covers implementations of the format. The single
  Microsoft extension used (`adec:decorative`, inside an `a:extLst` that other
  consumers ignore) is likewise an openly documented extension.
- Hosts converting to PDF/ODT can do so with their own self-hosted tool (for
  example LibreOffice, MPL-2.0, run as a separate process) without linking it
  into Breditor.

## API

```ts
import {exportDocx,exportDocxWithImages,docxImageBindings,docxContentType} from "@breditor/interchange/docx";

// Async host assets (browser): every distinct binding is loaded once, in document order.
const result = await exportDocxWithImages(editor.view().documentJson, {
  title: "Quarterly report",              // optional dc:title
  language: "en-US",                      // optional canonical BCP 47 default language
  pageSize: "letter",                     // or "a4" (1-inch margins)
  loadImage: binding => assetStore.blob(binding.asset), // Uint8Array | ArrayBuffer | Blob | undefined
});
if (result.ok) {
  const blob = new Blob([result.value], {type: docxContentType});
  // offer the download; show result.losses to the user
}

// Synchronous, when bytes are already in hand:
exportDocx(documentJson, {image: ({asset, generation}) => bytesFor(asset, generation)});
```

`documentJson` may be an editor view's `documentJson`, a `breditor/document`
record, a clipboard `structuredJson` (`{document:{root}}`) or the root element.
Results are closed values:
`{ok:true, value:Uint8Array, losses}` or `{ok:false, error, losses}` with
`error` ∈ `invalid-source` (malformed/unknown envelope, ill-formed UTF-16,
dangling table references, bad options), `resource-limit` (any bound below) and
`asset-policy` (a host image callback threw or returned a non-byte value).

`docxImageBindings(documentJson)` lists the distinct bindings without converting,
for hosts that prefetch. `docxLimits` exposes the bounds; `docxContractV1`
versions this fidelity map independently of the HTML/Markdown grammar.
The two image callbacks receive their calling options object as `this`, so a
host can provide an options object with a method and its image registry. The
installed Node check runs both forms with a retained native document and only
the interchange archive installed.

The rich demo (`experiments/rich-browser`, **Export Word (.docx)**) uses
`exportDocxWithImages` with its canvas data URLs and local asset store, and
downloads through a `Blob` URL. No document data or bytes leave the page.

### Table of contents (opt-in)

`contents` prepends a real Word table of contents. It is off by default, and
omitting it (or passing `false`) keeps the previous output byte for byte.

```ts
exportDocx(documentJson, {
  contents: {
    title: "Contents",      // default "Table of contents"; 1–256 characters, no controls
    minLevel: 1,            // default 1
    maxLevel: 3,            // default 6 (the same headings as the static HTML contents)
    position: "start",      // the only placement: before the first body block
    updateFields: false,    // default; see the trade-off below
  },
});
// `contents: true` uses every default.
```

The option is validated before the document is read or any image is loaded.
A malformed value (an unknown key, a level outside 1–6, `minLevel > maxLevel`,
another `position`, a blank or over-long title, a non-Boolean `updateFields`)
fails with `invalid-source`.

Output:

- A `TOC Heading` title paragraph (outline level 9, so Word never lists it),
  then one `TOC \o "min-max" \h \z \u` complex field. Its cached result is
  already filled with one `toc N` paragraph per listed heading, each a
  `w:hyperlink w:anchor` to that heading, so the list reads and navigates
  correctly in Word, LibreOffice and other consumers *before* fields update.
  The field end sits in its own trailing paragraph, as Word writes it.
- Every listed heading gets a hidden `_Toc` + 8-hex-digit bookmark derived
  from its block identity (FNV-1a), not from its label or position, so names
  stay stable across edits. Native bookmark names must start with a letter,
  so `_Toc…` names never clash with user bookmarks; a heading with a user
  bookmark carries both (user bookmark outside), and internal links keep
  targeting the user bookmark.
- Heading selection and labels follow the static HTML contents: every heading
  in document order, including headings inside lists, quotes, flattened
  sections and table cells (Word's `TOC` field lists those too); one entry
  per heading block identity; at most 512 entries; labels are the heading's
  direct text with leading/trailing whitespace trimmed, bounded to 512
  UTF-16 units (`…` marks a cut), tabs and breaks shown as spaces, and
  "Untitled heading" for an empty label. A document without listed headings
  gets no title and no field, like the HTML navigation.
- `toc 1`–`toc 6` use Word's built-in style names, so Word's own TOC
  formatting applies after an update. Entries use the heading's level
  (`toc 3` for a heading 3 even without a preceding heading 2), matching what
  Word regenerates rather than the HTML list's nesting.

The cached result has **no page numbers**: pagination is Word's. They appear
when the field is updated (F9, or *Update Table*). `updateFields: true` writes
`w:updateFields` in `settings.xml`, which makes Word offer to update fields when
the file opens, adding page numbers. The trade-off: Word then shows a prompt
("This document contains fields that may refer to other files…") on every open
until the user saves; the prompt is suppressed in Protected View, and
LibreOffice, Google Docs and most viewers ignore the setting and show the
cached list. Leave it off for files that are read more than edited.

`contents-entry` reports each cached entry that differs from what Word would
regenerate: an empty heading's placeholder label, a truncated label, a
repeated block identity listed once, or a heading past the 512-entry bound
(left out of the cached list). A heading with an invalid level is a plain
paragraph (`unsupported-attribute`) and is not listed by either.

### Bounds

| Bound | Value | Relation to interchange |
| --- | --- | --- |
| Document JSON | 8 Mi UTF-16 units | 8 × clipboard source (whole documents) |
| Visited nodes | 65,536 | 4 × `outputNodes` |
| Nesting depth | 48 | `depth` |
| Table rows / columns / cells | 256 / 128 / 4,096 per table | same |
| Distinct images | 256 | — |
| Bytes per image / all images | 10 MiB / 64 MiB | per-image = default rich asset-store file limit |
| Generated XML | 32 Mi UTF-16 units | — |

## Fidelity map

Semantic fidelity, not layout fidelity: the document opens as structured Word
content with built-in styles, so users can restyle it. Page layout, line breaks
and pagination are Word's.

| Native content | DOCX output | Loss code when not exact |
| --- | --- | --- |
| Paragraph | `w:p` (`Normal`) | — |
| Heading 1–6 | `w:p` with built-in `Heading1`…`Heading6` (outline levels 0–5) | invalid level → `unsupported-attribute`, paragraph |
| Bold, italic, underline, strike | `w:b`/`w:bCs`, `w:i`/`w:iCs`, `w:u single`, `w:strike` | — |
| Inline code | `Courier New` run font | — |
| Subscript / superscript | `w:vertAlign` | — |
| Text / background colour | `w:color`, `w:shd` fill | invalid value → `unsupported-style` |
| Text size (px) | `w:sz` half-points (px × 1.5) | invalid value → `unsupported-style` |
| Font family (system-ui / sans-serif / serif / monospace) | `Segoe UI` / `Arial` / `Times New Roman` / `Courier New` | — (generic → concrete font, documented approximation) |
| Text language (V4) | `w:lang w:val` | non-canonical tag → `unsupported-attribute` |
| Link | `w:hyperlink` + external relationship (deduplicated per URL); new window → `w:tgtFrame="_blank"`; runs use the `Hyperlink` style | unsafe/non-HTTP(S) URL → `unsafe-link`, text kept |
| Hard break / tab | CR, LF, and CRLF each become one `w:br`. Tabs become `w:tab`. | XML-invalid controls → `removed-content` |
| Block align / direction / indent / line height | `w:jc` (start→left, end→right, justify→both), `w:bidi`, `w:ind` (0.5 in per level), `w:spacing w:line` | `auto` direction or physical left/right on RTL → `style-approximation` |
| Bullet list | numbering definition (•, ◦, ▪ by level), one `w:num` per list | — |
| Ordered list | numbering definition per marker style (decimal, lower/upper letter, lower/upper roman — V4 list styles), `w:startOverride` = start (restarts each list). Reversed decimal lists with a supported start and nonnegative ordinals use one restart per item to preserve their displayed numbers. | Reversed numbering, > 9 levels, or start > 2³¹−1 → `list-numbering` |
| Task list | ☐ / ☒ bullet markers per item state | `style-approximation` per item (static marker, not a content control) |
| List item continuation blocks | indented to the item's text, no marker | — |
| Blockquote | `Quote` style (left border) + 0.5 in indent per depth | — |
| Code block | one `BreditorCodeBlock` paragraph (monospace, shaded), lines as `w:br` | language → `unsupported-attribute`; inline formats inside → `unsupported-style` |
| Horizontal rule | `BreditorHorizontalRule` paragraph (bottom border) | — |
| Page break (`breditor/page-break`, if the schema has it) | `w:br w:type="page"` | — |
| Table | `w:tbl`, fixed layout, `w:tblGrid` from native column widths (px × 15 twips), single borders | invalid widths → `table-geometry` |
| Merged cells | `w:gridSpan` + `w:vMerge restart/continue` | non-empty covered source cells: content appended to the merged cell → `table-geometry` |
| Header cells | leading all-header rows → `w:tblHeader` (repeat on each page); header cells shaded | header cells outside leading rows → `style-approximation` |
| Table caption (V4) | `Caption`-style paragraph before the table | — |
| Image | inline `w:drawing` (`wp:inline`/`pic:pic`), `word/media/imageN.{png,jpeg,gif}`, native display size or intrinsic size, scaled to the text width; alt text → `wp:docPr/@descr`; decorative → `adec:decorative` | missing bytes → `image-reference`; other formats (WebP, SVG, …) → `image-format`; both keep the alt text |
| Image link (V4) | `w:hyperlink` around the drawing | invalid target → `unsafe-link` |
| Image caption | `Caption`-style paragraph after the image | — |
| Collapsible section (V4 details) | flattened: summary as bold `BreditorSectionSummary` paragraph, body as flow | `block-structure` (open/closed state lost) |
| Mention (V4) | plain `@label` text | `mention-entity` (entity kind/id lost) |
| Table of contents (opt-in `contents`) | `TOC Heading` title + `TOC` field with a pre-filled, hyperlinked cached result; `_Toc…` bookmarks on listed headings; optional `w:updateFields` | `contents-entry` |
| Unknown block element (future schema) | its inline text as a paragraph, or its children as flow | `unsupported-element` |
| Unknown inline format | text kept | `unsupported-style` |
| Element in inline content | its text | `block-structure` |

Loss codes reuse the interchange vocabulary (`unsupported-element`,
`unsupported-attribute`, `unsupported-style`, `style-approximation`,
`unsafe-link`, `image-reference`, `block-structure`, `table-geometry`,
`list-numbering`, `removed-content`) and add three DOCX-specific codes:

- `image-format` — host bytes were supplied but are not PNG, JPEG or GIF
  (identified by signature, never by declared MIME type).
- `mention-entity` — a mention entity became plain text.
- `contents-entry` — an opt-in table of contents entry's cached text or
  presence differs from what Word regenerates (see above).

Losses are aggregated `{code, count, effect:"loss"}` records sorted by code; no
source text, URL or asset identifier is echoed.

## Validation

- `packages/breditor-interchange/tests/docx.test.ts` builds a fixture with every
  node type and format above, unzips the result with a test-only reader that
  cross-checks central/local headers and CRC-32, parses every XML part with a
  strict well-formedness parser (balanced tags, unique attributes, declared
  namespace prefixes, entities), and asserts content types, relationships,
  styles, numbering, table grid/merges, drawings, media bytes and the exact loss
  report. It also covers determinism across input envelopes, empty documents,
  every bound, malformed input, XML escaping and the parser-free module graph,
  and exports documents produced by the HTML importer from Word, Google Docs and
  Excel markup.
- `packages/breditor-interchange/tests/docx_contents.test.ts` unzips contents
  exports and asserts the title, field characters and instruction, entry
  styles and labels, unique `_Toc` bookmarks wrapping exactly the listed
  headings, coexistence with user bookmarks and internal links, level
  filtering, `updateFields` placement in `settings.xml`, table-cell headings,
  determinism and label-independent bookmark names, the entry/label bounds
  and loss counts, unchanged output without the option, and option
  validation before the document or images are read.
- `experiments/rich-browser/docx-export.spec.mjs` exports the live Wasm-owned
  demo document in Chromium, Firefox and WebKit, validates the downloaded
  package structure, parses every part with the engine's own `DOMParser`,
  checks the demo heading/table/image/caption mapping and that the only network
  requests are same-origin loads of the opt-in module, and compares two exports
  byte-for-byte.
- Manual: `BREDITOR_DOCX_DUMP=/path/out.docx` writes the unit fixture for
  inspection. macOS `textutil -convert txt` reads it (text, lists, table cells,
  breaks and tabs). LibreOffice was not installed in the development
  environment, so headless `soffice` conversion and Microsoft Word rendering
  have **not** been verified yet; they are the next fidelity check.

## Non-goals (this slice)

- **No DOCX import.** Importing Word documents needs a ZIP reader with inflate
  and a WordprocessingML → native mapping with its own bounds; today Word content
  enters through clipboard HTML (`@breditor/interchange`).
- **No PDF or ODT.** Hosts can convert the DOCX with a self-hosted tool.
- **No tracked changes, comments or suggestions export.** Shared review state
  is not part of the document JSON this adapter reads.
- **No layout engine.** No pagination, headers/footers, footnotes, page
  numbers or section breaks beyond one default section. The only field is the
  opt-in contents `TOC` field, whose cached result carries no page numbers.
- **No compression.** STORE only (see above); a deterministic deflater could be
  added later without changing the API.
