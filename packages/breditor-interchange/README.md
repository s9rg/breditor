# Breditor HTML and Markdown interchange

`@breditor/interchange` is a separate opt-in adapter for bounded HTML and Markdown
import/export through Breditor's Rust semantic clipboard. It supports standard
inline formatting, headings, nested and task lists, quotes, code, rules, tables
with merged cells, and host-resolved images/captions. Representative Word,
Google Docs and Excel markup is covered by the native functional probe; a
broader reconstructed producer corpus is covered by parser staging tests (see
[Producer clipboard shapes](#producer-clipboard-shapes)).

The adapter performs pure conversion, not editing. It never creates live DOM,
fetches images/stylesheets, uploads bytes, or supplies mutation authority.
Existing editor imports and clipboard defaults do not load this package.

## Use the native boundary

Pass a local or shared core facade with `supportsClipboardInterchange()` version
1 and both native admission methods. Older runtimes refuse this opt-in feature
without changing their ordinary editor behavior.

Conversion never installs missing formats or widens a receiving schema. Use a
profile declaring the desired rich grammar and inline preset; unsupported
features reject native admission. The full functional probe uses the explicit
standard rich-language V3 profiles.

```ts
import {createRichInterchange} from "@breditor/interchange";

const interchange = createRichInterchange(core);
const result = interchange.importHtml(sourceHtml);
if (result.ok) {
  // result.value is the native schema-bound clipboard transfer.
  // Submit structuredJson through an existing guarded native paste command.
  // Report result.losses only after that corresponding paste succeeds.
}
```

`importHtml` and `importMarkdown` return a native `ClipboardTransfer` on success.
`exportHtml` and `exportMarkdown` accept its `structuredJson`, revalidate it in
Rust, and return an escaped foreign string. All four return a closed
`InterchangeResult`; errors and notices never echo source content.

HTML inline fragments retain native `text` scope. Explicit block markup produces
`flow`. Import options `{kind: "flow"}` or `{kind: "grid"}` let the host select
a target policy; Rust still rejects an incompatible shape. Grid conversion does
not crop or tile a table to fit a destination. The receiving paste command also
checks the captured revision, fresh-ID allocation and exact destination geometry.

Image import requires an explicit synchronous `resolveImage({src, alt})` host
registry lookup returning `{asset, generation}` for already-owned bytes. Export
requires `exportImage({asset, generation})` returning a portable safe HTTP(S)
URL. Missing mappings preserve available alt/caption text and report
`image-reference`; no network fallback occurs. Host policy exceptions reject
conversion without exposing their messages.

### Complete HTML page export

Call `exportHtmlPage(core, clipboardJson, metadata, options?)` to wrap the
same admitted body that `exportHtml` emits. Pass the host's title and
optional description, language and direction. The exporter validates the
language tag and permits `ltr`, `rtl` or `auto` for direction. Title and
description are limited to 1 KiB and 4 KiB of UTF-8 before escaping. The
complete page is limited to 1 MiB.

The head contains the UTF-8 declaration, escaped title and optional escaped
description. The body uses the ordinary HTML converter's allowed markup,
inline styles, and explicit `exportImage` publication policy. The host
supplies metadata separately from the native clipboard snapshot. The
exporter neither edits the source nor adopts source head directives.

### Complete HTML page import

Call `importHtmlPage(core, sourceHtml, options?)` for an admitted native flow
transfer in `value.body` and editable host metadata in `value.metadata`.
The metadata uses the same title, description, language and direction
contract as `exportHtmlPage`. The first title and description are admitted,
and an absent title becomes the empty string. The host can edit these
fields and store them alongside its native checkpoint.

The parsed page's root language and direction become host metadata. A body
element's authored language and direction can still enter the native body
where the ordinary converter represents them. Existing bounded stylesheet
support remains available for the admitted body. External stylesheets,
directives such as base and refresh, and other unsupported head content
are dropped with a conversion notice. Page import uses the same inert
parser and explicit host image lookup as fragment import.

### Portable HTML with host-owned raster bytes

In a browser, `@breditor/interchange/portable-html` can embed raster images
from an admitted clipboard snapshot. Supply the same native owner and an
explicit `loadImage({asset, generation})` resolver for immutable `Blob` bytes
already held by the host. It validates the transfer before reading bytes and
calls the resolver once per exact binding.

```ts
import {exportPortableHtml} from "@breditor/interchange/portable-html";

const output = await exportPortableHtml(core, clipboard.structuredJson, {
  loadImage: binding => hostImageRegistry.getBlob(binding),
});
```

The separate exporter uses the browser raster admission checks for PNG, JPEG
and WebP, including declared MIME, actual decode, and content-addressed asset
identity. It allows 64 distinct bindings, 512 KiB of supplied bytes total, and
up to 4096 pixels per side and 8 Mi pixels per image. The HTML output is still
bounded to 1 MiB. A missing or rejected raster falls back to its alt and caption
with `image-reference`. The exporter does not fetch or upload bytes. The host
chooses which bindings to publish. Ordinary HTML export remains URL-based,
and installing this subpath leaves clipboard and image import unchanged.

## Formatting and notices

HTML conversion uses inert parse5 and css-tree data, not browser DOM parsing.
Stylesheet selectors support up to three tag/class/ID compounds joined by
descendant whitespace or the direct-child combinator `>`. Stylesheet and inline declarations honor specificity,
source order and `!important` within bounded matching. Winning CSS dimensions take
precedence over HTML size attributes on images, tables, columns and cells.
Dimensions outside the native subset produce a size or width notice. Recognized
values become closed native fields. Word list metadata is
converted into actual list structure, not retained as markup or pasted markers.

### Producer clipboard shapes

`tests/fixtures/producers/` holds a corpus for Word desktop, Word for the web,
Google Docs, Google Sheets, Excel desktop, LibreOffice Writer and Cocoa HTML
Writer (Apple Notes/TextEdit/Pages). Each file is **reconstructed** from that
producer's documented clipboard HTML shape and says so in its header; none is a
captured, certified clipboard dump. Tests assert the exact native outline, marks
and complete loss notices for each.

- Word desktop `mso-list:lN levelM lfoK` paragraphs nest by level. Decimal
  markers keep their start; alphabetic, roman, parenthesized and compound
  (`1.2.`) markers become ordered lists with a `list-numbering` notice; symbol
  and Wingdings/Symbol bullet glyphs become bullets. A skipped level nests one
  deeper with `block-structure` instead of rejecting the paste. Downlevel
  conditional markers (`<![if !supportLists]>`, `<!--[if …]-->`) and empty `<o:p>`
  paragraph marks leave no text and no repair notice.
- Word for the web runs of single-level `ul`/`ol` blocks carrying
  `data-aria-level` are rebuilt into one nested list per `data-listid`, numbered
  from `data-aria-posinset`. An ordered item reports `list-numbering` unless both
  its `list-style-type` is `decimal` and its `data-leveltext` is `%N.`/`%N)`, so
  lettered, roman and compound formats are never silently shown as decimal.
  Whitespace-only `EOP` paragraph-mark runs are dropped.
- For owners that report `supportsListNumbering()` (rich V4), both
  Word shapes map lettered and roman numbering to the native list style instead
  (see the V4 list numbering section below); other owners keep the conversion
  and notices above exactly.
- Google Docs' `<b style="font-weight:normal" id="docs-internal-guid-…">`
  wrapper bolds nothing; span `font-weight`, `font-style`, `text-decoration` and
  `vertical-align: super|sub` become marks. A `ul`/`ol` placed directly inside a
  list (Docs, Cocoa) nests into the preceding item. A lone `<br>` between blocks is
  one empty paragraph; a trailing `Apple-interchange-newline` is dropped.
- Spreadsheet tables keep displayed cell text, merges and column widths.
  `x:num`/`x:fmla`/`data-sheets-*` value, format and formula metadata and
  `mso-number-format` are reported, never imported. `<google-sheets-html-origin>`
  is a transparent wrapper.
- `file:` image sources (Office/LibreOffice temporary clip files) are reported as
  `image-reference` without being offered to `resolveImage`; alt text stays.

Syntax that carries no content reports nothing: namespace declarations
(`xmlns`, `xmlns:*`), `xml:lang`, structural `role` (`presentation`, `none`,
`list`, `listitem`) and `aria-level` on items, `meta`/`title`/`base` and
companion `link` elements (a stylesheet `link` reports `unsupported-style`), CSS
`<!--`/`-->` tokens, legacy HTML 4 doctypes, and no-op values (`font-variant:
normal`, `vertical-align: baseline`, `background-color: transparent`, native
`list-style-type` values, `mso-data-placement: same-cell` on `<br>`). Other
`list-style-type` values report `list-numbering`. Unrecognized `mso-*` producer
properties retain their notices. The `font` shorthand expands before the CSS
cascade and uses the same bounded conversion as the matching longhand properties.
The `inherit` and `unset` values use the parent font. System fonts,
`initial`, `revert` and unrepresented components report `unsupported-style`.
Valid `text-decoration` shorthands share the cascade with their longhand
properties. Underline and strike-through become native marks. Other winning
decoration lines and nondefault style, color and thickness report `unsupported-style`.

### Ordered-list numbering (rich V4 owners)

The adapter reads the owner's optional `supportsListNumbering()` once. Only a
local rich V4 owner reports `true`; for every other owner the
original behavior and notices are unchanged. With a V4 owner:

- `<ol type>` tokens `1`, `a`, `A`, `i`, `I` and `list-style-type` values
  `decimal`, `lower-alpha`/`lower-latin`, `upper-alpha`/`upper-latin`,
  `lower-roman`, `upper-roman` (CSS wins over `type`) become the native list
  style; `reversed` becomes native reversal without a notice. A reversed list
  without `start` stores the HTML default (its item count) explicitly.
- Bullet markers on an `<ol>`, unknown `type` tokens and other counter styles
  report `list-numbering`.
- Word flat lists map to the same native styles, keeping each list's start:

  | Producer source | Native `breditor/list-style` | Notice |
  | --- | --- | --- |
  | Word desktop marker `1.` / `1)` | decimal (no property) | none |
  | Word desktop marker `a.` / `a)` (`aa.` = 27) | lower-alpha (2) | none |
  | Word desktop marker `A.` / `A)` | upper-alpha (3) | none |
  | Word desktop marker `i.` / `iv)` | lower-roman (4) | none |
  | Word desktop marker `I.` / `IV)` | upper-roman (5) | none |
  | Word desktop `(a)`, `(iv)` | lower-alpha / lower-roman | `list-numbering` |
  | Word desktop `(1)`, `1.2.` | decimal | `list-numbering` |
  | Word for the web `list-style-type` `decimal`, `lower-alpha`/`lower-latin`, `upper-alpha`/`upper-latin`, `lower-roman`, `upper-roman` with `data-leveltext` `%N.`/`%N)` | 1–5 as for HTML | none |
  | Word for the web known style, other or missing level text (`%1.%2.`, `(%1)`) | that style | `list-numbering` |
  | Word for the web other counter style (`georgian`, `disc` on an `ol`) | decimal | `list-numbering` |

  Word for the web's HTML `type` supplies the marker family when neither the
  item nor its list declares `list-style-type`. An explicit HTML `start` applies
  to the first item when it has no `data-aria-posinset`. Older owners preserve
  that start with decimal numbering and report unsupported marker families.

  An ambiguous Word desktop letter (`i`, `v`, `x`, `c`, `d`, `l`, `m`) continues
  the open list whose next ordinal and style it matches (`h.`, `i.` is
  lower-alpha 8–9; `i.`, `ii.` is lower-roman 1–2); a lone `i.` opens
  lower-roman, other letters open lower-alpha. A `)` suffix is shown as the
  native `.` marker, exactly as decimal `1)` always has been. A change of style
  within one level starts a new list. A Word for the web item's own
  `list-style-type` overrides its list's and is then consumed (no styling
  notice). Unrecognized marker text (`Step 1:`) stays a reported bullet item.
- HTML export writes `<ol start type reversed>`; V4 HTML round trips exactly.
- Markdown export keeps decimal lists as `N.` lists. Letter, roman and reversed
  lists are exported as safe HTML with a `markdown-feature` notice.

### Image links (rich V4 owners)

The adapter also reads the owner's optional `supportsImageLinks()` once. Only a
local rich V4 owner reports `true`; every other owner keeps the
original conversion (the link around an image is dropped silently, an unsafe
href reports `unsafe-link`, and `<figure><a><img></a></figure>` falls back with
`block-structure`). With a V4 owner:

- `<a href><img></a>` and `<figure><a href><img></a><figcaption>` give the
  image its own link (`target="_blank"` → new window); the caption is not
  linked. Unsafe or out-of-subset targets report `unsafe-link`; a decorative
  image (`alt=""`) keeps no link and reports `image-alt`.
- HTML export wraps only the `<img>` in `<a href [target rel]>`; V4 HTML round
  trips exactly.
- Markdown export writes `[![alt](src)](href)` for a same-window link when it
  re-parses exactly; captions, sizes and new-window links fall back to HTML with
  `markdown-feature`. That Markdown shape imports back as the image link.

### Collapsible sections (rich V4 owners)

The adapter also reads the owner's optional `supportsDetails()` once. Only a
local rich V4 owner reports `true`; every other owner keeps the
original conversion (`<details>`/`<summary>` unwrap into ordinary flow with
`unsupported-element`, and `open` reports `unsupported-attribute`). With a V4
owner:

- `<details [open]>` becomes a section; its first `<summary>` child is the
  summary line (block markup inside it is flattened or moved into the body with
  `block-structure`). A missing summary becomes an empty summary
  (`block-structure`); an empty body gets one empty paragraph; sections nested
  deeper than 8 are lifted (`block-structure`).
- HTML export writes `<details [open]><summary>…</summary>…</details>`; V4 HTML
  round trips exactly.
- Markdown has no section syntax: a section is exported as a safe HTML block with
  `markdown-feature` (blank lines inside it are escaped), which reimports exactly.

### Table captions (rich V4 owners)

The adapter also reads the owner's optional `supportsTableCaptions()` once. Only a
local rich V4 owner reports `true`; every other owner keeps the original
conversion (`<caption>` content becomes flow before the table with
`block-structure`). With a V4 owner:

- HTML import maps a table's first `<caption>` to its caption paragraph. One
  paragraph imports without a notice; a leading heading becomes the caption
  paragraph and further or unsupported blocks stay as flow before the table, each
  reported as `block-structure`. A second `<caption>` keeps the original conversion.
- HTML export writes `<table><caption><p …>…</p></caption><colgroup>…`; V4 HTML round
  trips exactly. A hidden (rowless) captioned table exports its caption as a
  paragraph with `table-geometry`.
- GFM tables have no caption: a captioned table falls back to a safe HTML block with
  `markdown-feature`, which reimports as the caption.

### Page breaks (rich V4 owners)

The adapter also reads the owner's optional `supportsPageBreaks()` once. Only a local
rich V4 owner reports `true`; every other owner keeps the original
conversion (forced-break CSS reports `unsupported-style`, Word's `<br clear=all>`
stays a line break, Google Docs' hidden page-break `<hr>` is removed). With a V4 owner:

- HTML import maps Word's `<br clear=all style='page-break-before:always'>` (alone or
  inside a paragraph, which is split), Google Docs'
  `<hr style="page-break-before:always;display:none">` and an empty `<div>` with a
  forced break to one page break each without a notice. `page-break-before/after:
  always` or `break-before/after: page` on a content block becomes a page break
  before/after it, dropped at the content edges and next to another break as CSS
  would; side-specific values report `style-approximation`. Page breaks are
  root-only: one found inside a quote, list, section or cell is removed with
  `block-structure`.
- HTML export writes `<div style="break-after:page;page-break-after:always"></div>`,
  which round trips exactly.
- Markdown has no page break: it falls back to that HTML block with
  `markdown-feature`, which reimports as a page break.

### Bookmarks and internal links (rich V4 owners)

The adapter reads the owner's optional `supportsBookmarks()` once (local V4 owners).

- Import: an `id` on `<p>`, `<h1>`–`<h6>` or `<pre>`, or an `<a name>`/`<a id>` inside
  one, becomes the block's bookmark; `href="#name"` becomes an internal link. A `bm-`
  prefix is removed on both sides. Invalid, duplicate and extra anchors report
  `unsupported-attribute`.
- Export: `id="bm-<name>"` and `<a href="#bm-<name>">`, which round trip exactly;
  Markdown falls back to that HTML with `markdown-feature`.
- DOCX: `w:bookmarkStart`/`w:bookmarkEnd` and `w:hyperlink w:anchor`; a dangling link
  keeps its text (`unsafe-link`).
- Other owners keep the original conversion (ids dropped, `<a name>` reported,
  `href="#…"` reported as `unsafe-link`).

### Mentions (rich V4 owners)

The adapter also reads the owner's optional `supportsMentions()` once. Only a
local rich V4 owner reports `true`; every other owner imports a
mention span as its plain `@label` text. With a V4 owner:

- HTML export writes each mention as
  `<span class="breditor-mention" data-mention-kind="…" data-mention-id="…">@label</span>`
  around its styled pieces; V4 HTML round trips exactly.
- HTML import maps only that exact shape (valid kind and id, text `@` + a valid
  label without tab, newline or double space) to a mention; anything else stays
  text.
- Markdown has no mention syntax: a block with a mention falls back to a safe HTML
  block with `markdown-feature`, which reimports as the mention.

### Text language (rich V4 owners)

The adapter also reads the owner's optional `supportsTextLanguage()` once. Only a
local rich V4 owner reports `true`; every other owner keeps accepting
and silently dropping `lang` and `xml:lang`. With a V4 owner:

- `lang` (or the equivalent `xml:lang`) on any inline or block element becomes the
  native `breditor/text-language` format of every text run below it, in canonical
  case (`FR-ca` → `fr-CA`). `lang=""` clears an inherited language.
- Malformed, private-use (`x-none`), extension and over-long tags clear the
  inherited language and report `unsupported-attribute`; so does an `xml:lang`
  that disagrees with `lang` on the same element (`lang` wins).
- HTML export writes `<span lang="…">`; V4 HTML round trips exactly.
- Markdown has no language syntax: tagged runs are exported as safe HTML with a
  `markdown-feature` notice, which reimports exactly.

Markdown uses the explicit `interchangeContractV1` dialect: CommonMark parsing
with table/strikethrough extensions, parsed task markers and sanitized raw HTML.
Automatic URL linking and typography substitutions are disabled. This is not a
claim of full GFM support: single-tilde strikethrough and bare URL/`www.`
autolink literals stay literal text by default. Export uses ordinary Markdown where it
preserves the model, and safe HTML for layouts, captions, merged/source-partitioned
tables or format combinations that basic Markdown cannot express. Ordinary
Markdown output covers paragraph hard breaks (`\` line ends), uniform
left/center/right table column alignment, empty fences and captionless unsized
images with a portable URL; each emitted inline or image must re-parse to the
same content before it is used. Adjacent separate lists alternate `-`/`*` or
`.`/`)` markers so reimport keeps them separate.

Markdown import reports what it cannot keep: fence info after the language word
(`unsupported-attribute`), raw HTML comments/declarations (`removed-content`)
and ordered list starts below 1, which become 1 (`list-numbering`; HTML
`start` values below 1 now get the same approximation instead of rejection).
An image that is the only content of an unstyled paragraph is a block image and
reports no `block-structure` loss.

### Opt-in GFM autolink literals

`importMarkdown(source, {autolinks: true})` links bare `https://…`, `http://…`
and `www.…` literals (`interchangeContractV1.markdownAutolinks`). It is off by
default, so the version-one dialect's parse results never change for existing
callers; `false` or omission is identical to the original import, any
non-boolean value rejects with `unsupported-content`, and `importHtml` ignores
it. Every owner profile behaves the same (it creates the standard inline link).

Recognition and targets are exactly the editor's typed `autolink-v1` rule
(`src/autolink.ts` mirrors Rust `rich_autolink_candidate`; a test compares its
punctuation sets and unit vectors with the Rust source): a whitespace-separated
run, after leading `(`, `[`, `{`, `<`, `"` or `'`, beginning with lowercase
`https://`, `http://` or `www.`; trailing `.`, `,`, `:`, `;`, `!`, `?`, `'`,
`"`, `*`, `_`, `~`, `>` and unbalanced `)`/`]`/`}` stay text after the link;
`www.` targets `https://www.…`; an empty path becomes `/` (the only repair); and
the target must be in the canonical `safeLinkV1` subset image links use
(`isImageLinkHrefV1`: credential-free ASCII HTTP(S), lowercase host, no default
port or dot segments, at most 2,048 bytes). Anything else (`javascript:`,
`data:`, `mailto:`, `ftp:`, uppercase, IDN text, user info) stays literal
without a notice. The link text keeps the source spelling (`www.example.org` →
`https://www.example.org/`) and opens in the same window.

Literals are never linked inside code spans or code blocks, Markdown links,
`<…>` autolinks, image labels or raw `<a>`/`<code>` HTML. A literal may start
after whitespace, a line start or an emphasis/strikethrough opener and end
before whitespace, a line end or a closer. A backslash escape or entity inside
or touching it (`https\://`, `example\.com`, `&amp;`) keeps the whole literal
text. Each link adds three Markdown tokens to the existing token budget.

Export keeps the round trip exact with or without the option: a same-window
link whose text equals its canonical target is written as `<url>` when that
re-parses to the same text and target (not for percent escapes or `xn--`
hosts, which CommonMark would display decoded), other links stay
`[text](<url>)`, and the `:` of `://` in plain text is escaped (`https\://…`;
`.` already was) so literal URL text stays literal when reimported with
`autolinks: true`.

Notices are aggregated `{code, count, effect}` records. `effect: "loss"` means
source content or presentation was removed/approximated.
`effect: "compatibility"` identifies repaired HTML or Markdown requiring the declared
HTML-capable dialect; it does not claim that native formatting was discarded.
Destination caption/code text conversion has its separate native loss report.

## Bounds and unsupported content

Source and final output budgets are each 1 MiB. Parsing bounds node construction,
repair mutations, open/final depth and Markdown token creation. CSS has separate
style/stylesheet/rule limits. Tables retain the native 256-row, 128-column,
4096-base-cell ceilings. Native schema and clipboard limits apply afterward too.

Active/foreign markup is removed with a notice. URLs are limited to absolute,
credential-free HTTP(S), matching the existing safe-link scheme set. CSS
selectors outside the simple subset, external stylesheets, arbitrary layout,
font substitutions, spreadsheet number/formula metadata, and cell background
painting have explicit losses or rejection results. Nested tables reject;
this package does not widen the Rust grammar. Hidden table axes/cells and list
entries reject rather than shift geometry or expose their content. NUL text cannot be exported as
lossless HTML/Markdown and rejects rather than silently replacing it.

HTML export preserves merged cells' distinct source bodies using bounded,
relative `data-breditor-cell-partition="1"` wrappers. Reimport requires the full
unique rectangle and known version. No internal source IDs or causal clocks
are encoded in these wrappers. Consumers stripping them may keep visible text
but cannot preserve Breditor's independent base-cell partitions.

## Browser integration and verification

Managed local/shared openings accept an explicit owner-bound factory:

```ts
clipboardInterchange: core => createRichInterchange(core),
onInterchange: report => showInterchangeNotice(report),
```

Use the factory in React `initialOptions`; `onInterchange` is also a live React
prop. Direct DOM mounts take the adapter object. Default editors do not load
this package or enable foreign paste merely because HTML is available. Opt-in
priority is private Breditor content, HTML, explicit Markdown MIME, then existing
file/plain handling. Plain text is not guessed as Markdown, and conversion
failure does not retry as plain text.

Copy/Cut adds HTML and Markdown to private/plain output. Cut requires every
requested format to be retained before native deletion. Reports follow retained
Copy or accepted Cut/Paste, not conversion preparation. Caption/code flow paste
uses native-projected text with a visible loss notice. See the
[full contract](../../docs/RICH_INTERCHANGE.md) for queue guards, image registry
policy and combined source/destination reports.

Run `npm run typecheck --workspace @breditor/interchange` and
`npm test --workspace @breditor/interchange` for parser staging tests. Those
tests use a staging stub and do not prove native admission. After building the
adapter and paired native runtimes, run `scripts/probe-foreign-interchange.mjs`
with their local/shared directories for actual native conversion, atomic
document/grid paste, exact recovery and offline peer history.

Run `scripts/probe-browser-interchange.mjs` with matching runtime directories for
compiled SDK/React integration with actual Wasm and synthetic clipboard events.
`scripts/check-interchange-package.mjs` packs and installs candidate archives
offline, repeats those checks, verifies consumer types and checks production
bundle parser separation. These functional checks do not qualify OS clipboard
applications, broad browser reliability or release readiness.

## XML export (`@breditor/interchange/xml`)

Pass the native editor owner and its clipboard JSON to `exportXml`. After
opening a saved checkpoint, select the whole document with `selectDocument()`
and read the transfer with `copyDocument()`. The local transfer exposes
`structuredJson`, and the shared transfer exposes `richJson`. The owner
validates the record before the exporter reads its content.

```ts
import {exportXml} from "@breditor/interchange/xml";

core.selectDocument();
const clipboard = core.copyDocument();
if (clipboard) {
  const output = exportXml(core, clipboard.structuredJson);
  if (output.ok) {
    const xml = new Blob([output.value], {type: "application/xml;charset=utf-8"});
    // Save or publish xml from the host application.
  }
}
```

Version 1 uses the XML namespace `urn:breditor:interchange:xml:1`. The schema
preserves node and text order, inline formats, and typed properties, including
admitted image asset and generation identifiers.

Whole-document copy produces Breditor's normalized clipboard projection. Its
root uses the neutral clipboard document ID and its tables represent the
current semantic geometry.

- `document` has `version="1"`, the clipboard `kind` of `text`, `flow`, or
  `grid`, and one root `element`.
- `element` has a native `type`, an optional `entity-id`, zero or more
  `property` children, and then its ordered `element` or `run` children.
- `run` contains its `format` children followed by one `value` element
  containing the Unicode text. Each `format` has a native `type` and its
  `property` children.
- `property` has a native `name` and contains one JSON value as XML text.
  Parse it as JSON to recover the original type.

The exporter writes UTF-8 XML 1.0 with escaped content. Repeated exports of the
same admitted record have identical bytes. The host resolves image asset bytes
and applies its publication policy. Text scalars unavailable in XML 1.0 become
replacement characters and are counted in `removed-content`. A source over
1 MiB or an export over 4 MiB returns `resource-limit`.

For a source-bound snapshot, call `exportDocumentXml(core)` on the local or
shared native owner. It reads one Document V2 view and leaves the selection and
history untouched. The `urn:breditor:interchange:document-xml:1` namespace
uses the same ordered element, property, format and run vocabulary and includes
the original document ID. Its outer element carries `version="1"`,
`document-format-version="2"`, `schema-name`, `schema-version`, and
`schema-fingerprint`. The same size limits and XML text-loss reporting apply.
Use the native checkpoint to restore history and the host asset store to
retrieve referenced image bytes.

## DOCX export (`@breditor/interchange/docx`)

A separate entry point exports a native rich document (an editor view's
`documentJson`) to a deterministic Word `.docx` package. It imports no HTML or
Markdown parser and never fetches: image bytes come from the host by native
asset binding.

```ts
import {exportDocxWithImages,docxContentType} from "@breditor/interchange/docx";

const result = await exportDocxWithImages(editor.view().documentJson, {
  loadImage: binding => assetStore.blob(binding.asset),
});
if (result.ok) download(new Blob([result.value], {type: docxContentType}));
// result.losses reports every feature Word cannot represent (for example reversed lists).
```

See [docs/DOCUMENT_CONVERSION.md](../../docs/DOCUMENT_CONVERSION.md) for the
fidelity map, loss codes, bounds, licensing and non-goals.

### Prepare a portable Base64 HTML import

The browser subpath `@breditor/interchange/portable-html-import` prepares
portable HTML for an explicitly selected whole document on a local or shared
native Document V1 owner. The caller supplies the observed revision. Eligible
`img` sources use the literal `data:image/png;base64,…`,
`data:image/jpeg;base64,…`, or `data:image/webp;base64,…` shape. Their
Base64 payload is canonical, within the portable raster bounds, and checked
by the same MIME, dimension, decode and SHA-256 rules as stored rasters.
Ordinary external image references use the converter's alt/caption fallback.

```ts
import {preparePortableHtmlImport} from "@breditor/interchange/portable-html-import";

const prepared = await preparePortableHtmlImport(core, sourceHtml, observedRevision);
if (prepared.ok) {
  const retained = await hostImageRegistry.retainPortableBatch(prepared.value.rasters);
  const published = prepared.value.publish(retained, freshPastePrefix);
  if (!published.ok) {
    // Report the refusal and reconcile any unused host-owned retained bytes.
  }
}
```

The caller keeps storage custody. Preparation performs no storage or network
work and exposes rasters only after the whole input has been checked. The
binding array must identify every prepared SHA-256 asset once with its
host-provided generation. Publication is synchronous and uses the captured
revision through the existing whole-document native paste, with one Undo step
on success. Native paste allocates fresh document-local image generations.
A failed publication can leave caller-retained blobs unreferenced for the host
to reconcile. The ordinary HTML clipboard adapter continues to use its explicit
reference lookup policy.
