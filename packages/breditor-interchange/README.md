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

## Formatting and notices

HTML conversion uses inert parse5 and css-tree data, not browser DOM parsing.
Simple tag/class/ID stylesheet selectors and inline declarations have bounded
specificity, source-order and important handling. Recognized values become
closed native fields; arbitrary CSS is never emitted. Word list metadata is
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
`list-style-type` values report `list-numbering`. Everything else unrecognized,
including `mso-*` producer properties and the `font` shorthand, keeps its notice.

Markdown uses the explicit `interchangeContractV1` dialect: CommonMark parsing
with table/strikethrough extensions, parsed task markers and sanitized raw HTML.
Automatic URL linking and typography substitutions are disabled. This is not a
claim of full GFM support: single-tilde strikethrough and bare URL/`www.`
autolink literals stay literal text. Export uses ordinary Markdown where it
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
