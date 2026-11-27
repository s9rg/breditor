# Document conversion (DOCX and EPUB export)

Status: opt-in, **export only**. `@breditor/interchange/docx` converts a native
rich document into a Word (`.docx`) package in the page or in Node, and
`@breditor/interchange/epub` converts it into an EPUB 3 publication (see
[EPUB 3 export](#epub-3-export)). It adds no
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
| Unknown block element (future schema) | its inline text as a paragraph, or its children as flow | `unsupported-element` |
| Unknown inline format | text kept | `unsupported-style` |
| Element in inline content | its text | `block-structure` |

Loss codes reuse the interchange vocabulary (`unsupported-element`,
`unsupported-attribute`, `unsupported-style`, `style-approximation`,
`unsafe-link`, `image-reference`, `block-structure`, `table-geometry`,
`list-numbering`, `removed-content`) and add two DOCX-specific codes:

- `image-format` — host bytes were supplied but are not PNG, JPEG or GIF
  (identified by signature, never by declared MIME type).
- `mention-entity` — a mention entity became plain text.

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
- **No layout engine.** No pagination, headers/footers, fields, footnotes,
  page numbers or section breaks beyond one default section.
- **No compression.** STORE only (see above); a deterministic deflater could be
  added later without changing the API.

## EPUB 3 export

`@breditor/interchange/epub` (`dist/epub.js`) is a second opt-in entry point of
the same package. It writes a reflowable EPUB 3.3 publication from the same
document envelopes the DOCX exporter accepts. Its content documents come from
the **existing semantic HTML export** (`HtmlExport`, the code behind
`exportHtml`), so EPUB and HTML export have the same element mapping and loss
codes. The library-owned HTML is then serialized as XHTML. Like the DOCX entry,
it imports none of the HTML/Markdown parser graph (`parse5`, `markdown-it`,
`css-tree`); a unit test pins its module graph and the installed-consumer check
bundles it and asserts the same.

### Decisions

| Question | Decision |
| --- | --- |
| Adapter | In-repo writer, no new dependency. It reuses the DOCX entry's STORE-only ZIP writer (`src/docx/zip.ts`), raster signature sniffing (`src/docx/image.ts`) and document-envelope validation (`src/docx/convert.ts`) without changing them. |
| Container (OCF) | `mimetype` (`application/epub+zip`) is the first entry, stored, with no extra field. Next come `META-INF/container.xml` and `EPUB/package.opf`, then `EPUB/nav.xhtml`, `EPUB/style.css`, `EPUB/chapter-N.xhtml` and `EPUB/images/image-N.{png,jpg,gif}`, always in that order. Every entry is STORE with the fixed 1980-01-01 timestamp; OCF permits stored entries. |
| Metadata | Caller-supplied and validated before any image callback runs. `title` (1–1,024 characters), `language` (canonical BCP 47), `identifier` (1–256 characters, no edge whitespace) and `modified` (`YYYY-MM-DDThh:mm:ssZ`, a real calendar date) are required; `author` (`dc:creator`, 1–1,024 characters) is optional. Text must not be blank or contain control characters or lone surrogates. The writer never reads a clock. The host keeps `identifier` stable across exports of the same publication. |
| Content documents | `split` decides where a new XHTML document starts. `heading-1` (the default) starts one before every top-level heading 1. `page-break` starts one at every top-level `breditor/page-break`, and the break itself is consumed. `heading-1-and-page-break` does both, and `none` writes one document. Empty documents are skipped, so content before the first heading becomes its own front-matter document. A document with no content still gets one empty content document. A page break that does not split stays a CSS `break-after:page` block. |
| XHTML | The HTML exporter output is rewritten through a closed tag/attribute allowlist. Void elements self-close, and boolean attributes get their XML form (`checked="checked"`, `reversed="reversed"`, `open="open"`, `disabled="disabled"`). The obsolete `<col width>` becomes `style="width:Npx"`. Each document is `<html xmlns=… lang xml:lang>`, with the bundled stylesheet linked. Anything outside the allowlist is an internal error, not output. |
| Navigation | `nav.xhtml` holds an `epub:type="toc"` `<nav>` built from **top-level** headings (levels 1–6). A deeper heading nests under the nearest shallower one. A bookmarked heading keeps its `bm-<name>` id. Other headings get `heading-N` ids in document order. Headings with no text are left out. With no headings at all, the table of contents has one entry for the first content document, labelled with the title. Headings inside lists, quotes, tables or sections stay in the content but are not listed. |
| Internal links | Bookmark anchors (`id="bm-<name>"`) are indexed across content documents and `#bm-<name>` links are rewritten to `chapter-N.xhtml#bm-<name>` when the anchor is in another document. A link to an anchor in no document keeps its text and reports `unsafe-link`. |
| Images | Bytes come only from the host (`image` sync callback or `exportEpubWithImages` with an async `loadImage`), once per distinct `(asset-id, asset-generation)` binding in document order, and are copied. The type is decided by signature (PNG, JPEG, GIF), never by a declared MIME type. Admitted images are named `images/image-N.ext` in first-use order and shared by every use. Missing bytes report `image-reference` and other formats report `image-format`; both keep the alt text. |
| Determinism | Identical document JSON, options and image bytes give identical bytes: fixed entry order, timestamps, file names, ids and manifest order. Unit tests compare two runs and four input envelopes byte for byte. |
| Stylesheet | A small bundled CSS file (`style.css`, library-authored, no external resources or fonts) sets readable defaults for quotes, code, tables, figures and images (`max-width:100%`). |

### API

```ts
import {exportEpubWithImages,epubContentType} from "@breditor/interchange/epub";

const result = await exportEpubWithImages(editor.view().documentJson, {
  title: "Quarterly report",
  language: "en-US",
  identifier: "urn:uuid:4f0c…",          // host-owned, stable per publication
  author: "Finance team",                 // optional
  modified: "2026-11-27T12:00:00Z",       // caller-supplied, never read from a clock
  split: "heading-1",                     // or "page-break", "heading-1-and-page-break", "none"
  loadImage: binding => assetStore.blob(binding.asset),
});
if (result.ok) download(new Blob([result.value], {type: epubContentType}));
```

`exportEpub(documentJson, {…, image})` is the synchronous form and
`epubImageBindings(documentJson)` lists the distinct bindings in order.
Results are `{ok:true, value, losses}` or `{ok:false, error, losses}`, and
`error` is `invalid-source`, `resource-limit` or `asset-policy` (as for
DOCX). `epubContractV1` versions this mapping, and `epubLimits` exposes the
bounds. The image callbacks receive the options object as `this`.

### Bounds

| Bound | Value |
| --- | --- |
| Document JSON / visited nodes / depth | same as DOCX (8 Mi UTF-16 units / 65,536 / 48) |
| Native nodes per content document | 16,384 (the HTML exporter's `outputNodes` bound) |
| Content documents | 1,024 |
| Distinct images, bytes per image, all images | 256, 10 MiB, 64 MiB |
| Generated XHTML | 32 Mi UTF-16 units |
| Title / author / identifier | 1,024 / 1,024 / 256 characters |

### Losses

The losses are the HTML exporter's interchange codes (for example
`unsupported-element`, `unsupported-style`, `unsafe-link`, `image-reference`,
`block-structure`). They are aggregated with three EPUB-specific sources:
`image-format` (host bytes are not PNG, JPEG or GIF), `unsafe-link` for a
dangling internal link, and `removed-content` for each XML-invalid control
character removed from text, alt text or properties. Mentions keep their
entity as `data-mention-*` attributes, and collapsible sections stay native
`<details>`, so neither is reported as a loss. Whether a reading system shows
`<details>` as collapsible is up to that reader.

### Validation

- `packages/breditor-interchange/tests/epub.test.ts` unzips every export with
  the test-only reader (central/local header and CRC-32 cross-checks). It
  checks the exact entry order, that `mimetype` comes first and is stored with
  no extra field (raw local-header bytes), the fixed timestamps, and that every
  XML/OPF/XHTML part is well-formed under the strict parser. It also checks
  that manifest and archive match exactly, the spine order, metadata values,
  nested navigation and that every nav and internal-link target exists. Other
  checks cover every split mode, XHTML forms, image naming and sharing, the
  exact loss report, byte-for-byte determinism across runs and envelopes,
  option validation before any host image call, bounds, malformed input,
  host-value failures, buffer copying, the Word/Google Docs/Excel importer
  fixtures and the parser-free module graph. `BREDITOR_EPUB_DUMP=/path/out.epub`
  writes the fixture for inspection. `xmllint --noout` also found every part
  of that dump well-formed.
- `scripts/check-interchange-package.mjs` bundles the installed
  `@breditor/interchange/epub` entry (no parser modules) and runs
  `epub-runtime.mjs`. That check exports a retained native V4 checkpoint with a
  real PNG through installed archives only, with both sync and async host
  receivers.
- **Not run:** [EPUBCheck](https://github.com/w3c/epubcheck) (the W3C
  conformance checker) was not available in the development environment and
  was not downloaded, so conformance has **not** been verified with it. No
  reading system (Apple Books, Thorium, Calibre, Kobo, Kindle conversion) has
  been tried yet. Running EPUBCheck on the `BREDITOR_EPUB_DUMP` output is the
  next fidelity check.

### Non-goals (this slice)

- No EPUB import, fixed-layout EPUB, EPUB 2 NCX fallback, cover image,
  landmarks or page-list navigation, embedded fonts, media overlays, scripting
  or accessibility metadata (`schema:accessMode` and related properties).
  A host that needs accessibility metadata cannot add it yet.
- No compression (STORE only, as for DOCX).
- No WebP or SVG images. They are EPUB core media types, but this slice admits
  only the raster signatures the DOCX writer already sniffs.
