# External rich content interchange

The separate opt-in `@breditor/interchange` package converts bounded HTML and
Markdown through the existing Rust semantic clipboard. Native local/shared
admission, sanitized import/export and representative Office-style fixtures are
implemented and tested programmatically. Explicit local/shared clipboard routing,
visible post-commit notices and managed SDK/React integration now use that same
native boundary and pass clean-installed functional checks. Final integrated
release qualification remains separate.
Default Copy/Paste behavior and all stored document/history formats are unchanged.

## Native admission contract

The separate `supportsClipboardInterchange()` capability requires native version
`1` and both pure methods. Older owners remain usable, but the bridge refuses
without that exact capability; it never invents a fallback.

- `admitClipboardRoot(kind, rootJson)` admits an external adapter's source
  content and returns `RichClipboardTransfer`.
- `validateClipboard(clipboardJson)` revalidates content for an exporter under
  the owner's exact active schema, returning the same transfer shape.

The transfer is the existing `breditor/rich-clipboard-transfer` version 1:
`kind`, `structuredJson` and exact `plainText`. Its structured content remains
the existing fingerprint-bearing `breditor/rich-clipboard` envelope. There is
no new persisted interchange, history or synchronization protocol.

A source root uses the existing strict node record grammar. It must be a
`breditor/document` with the neutral document identity `breditor-clipboard`.
The adapter declares `text`, `flow` or `grid`; Rust does not guess or repair its
kind. Rust supplies the receiving schema binding and validates all formats,
properties, identities, content shape, table geometry and semantic merge state.
Unsupported schema features reject instead of being silently removed.

Schema admission is not foreign-content sanitization. For example, standard
inline V1 stores bounded link strings; the safe rendering policy filters their
emitted attributes. The foreign adapter and exporter must independently apply
the URL allowlist and report removed links. This bridge deliberately does not
reinterpret the existing link schema or claim that every admitted literal is
safe to emit as HTML.

The input root must fit both the independent 1 MiB clipboard budget and the
active document JSON budget. The allocation preflight runs before owned record
decoding; node, depth, text, properties and format ceilings stay active. The
complete encoded clipboard, including its schema envelope, must also fit the
clipboard budget before admission returns. Invalid drafts return no fragment.

Admission does not normalize a foreign document or make its identities fresh.
Destination IDs and merge priorities are still allocated by the existing paste
plan. The host must reserve a fresh paste prefix even after failure or Undo.
Admission and validation are pure in read-only mode too: document, selection,
pending formats, revision, checkpoint, peer frame and history are unchanged.

No image bytes are loaded, fetched, decoded or uploaded by either method.
Existing immutable asset references remain references. The foreign
adapter resolves image sources through an explicit host asset policy before
constructing an admitted image; copying an untrusted URL is not asset ownership.

## Paste and loss reporting

An admitted transfer is source content, not edit authority. The controller must
capture its target revision, prepare the import, then submit one existing
guarded native paste action. A changed target or failed rich insertion rejects
atomically. It must not be retried as plain text without an explicit policy.

For rich blocks pasted into a caption or code block, the approved policy is to
insert text and report formatting loss. The existing native
`projectClipboardText(selection, clipboardJson, revision)` read derives the
text and loss categories before the guarded text edit. The controller reports
losses only after that edit succeeds. Prose retains structured paste; inline
fragments retain their existing rich-paste contract rather than entering this
flow/grid conversion path. Empty or oversized projections still reject.

Foreign conversion losses and destination losses are separate. The
adapter reports discarded or approximated source content, including
unsupported CSS/layout, unsafe markup/URLs, unresolved images and table or
caption transformations. A successful clipboard admission does not establish
that the foreign conversion was lossless.

## Foreign conversion contract

The adapter parses inert bounded trees, never attaches input markup to the
editing DOM, and emits only allowlisted semantic content. Construction,
HTML repair, final traversal, CSS rules and Markdown tokens are bounded before
publication. Full-document parsing retains authored body styles as well as
ordinary clipboard fragments. Simple stylesheet selectors and inline CSS
become closed native formats/layout fields; unsupported CSS has explicit notices.
Font shorthand uses the same bounded family, size, weight, style and line-height
conversion as the longhand properties. Shorthand resets and `!important` apply
in the declaration cascade. System font keywords and unsupported components,
such as small caps and condensed faces, generate loss notices.

The named version-one Markdown dialect uses CommonMark parsing with tables,
strikethrough, parsed task markers and sanitized raw HTML. It disables automatic
URL linking and typography changes. Export uses safe HTML when basic Markdown
cannot preserve layout, captions, rich tables or exact code text. Compatibility
notices distinguish that requirement from actual conversion loss; this is not
full GFM conformance. Native schema admission still validates both directions.

Within that dialect, paragraph hard breaks export as backslash line breaks,
uniform left/center/right table columns as GFM delimiter alignment, empty code
blocks as empty fences, and captionless unsized images with a portable URL as
Markdown images. Each emitted inline/image is re-parsed and must reproduce the
same text, formats, URL and alt text, otherwise that block uses HTML.
Whitespace is checked on a paragraph's, heading's or table cell's whole text,
not per formatted run: single spaces next to bold, italic, strikethrough, code
spans and links (`see **b** c`, `see [a](<url>) b`) stay Markdown, while
leading or trailing block spaces, two or more consecutive spaces (even across
runs), spaces at the start of a line after a hard break, tabs and CR use HTML.
An emphasis or strikethrough run whose own text starts or ends with a space
(`**b **`) also uses HTML: CommonMark delimiters next to that space are not
left/right-flanking, and moving the space outside would drop its formatting.
Adjacent
separate lists alternate their bullet or ordered delimiter so they stay
separate on reimport. Import reports fence info beyond the language word
(`unsupported-attribute`), raw comments/declarations (`removed-content`) and
ordered starts below 1, which become 1 (`list-numbering`). Single-tilde
strikethrough and bare URL/`www.` autolink literals remain literal text.

GFM autolink literals are a separate opt-in, `importMarkdown(source, {autolinks:
true})` (named by `interchangeContractV1.markdownAutolinks`). The version-one
dialect itself is unchanged: omitting the option (or `false`) parses exactly as
before, so no stored or exchanged Markdown changes meaning for existing hosts,
and no new dialect version is needed. With the option, a literal is linked only
when the editor's typed `autolink-v1` rule would link it: the same candidate
grammar and trailing punctuation, the same `www.` → `https://www.` and empty-path
repair, and the same canonical `safeLinkV1` target subset as native image links.
Code spans and blocks, existing links, `<…>` autolinks, image labels, raw `<a>`
and `<code>` HTML, and literals touching a backslash escape or entity stay text;
rejected candidates are not notices. Markdown export writes a link whose text is
its exact target as `<url>` when that re-parses identically and escapes `://` in
plain text, so export and reimport, with or without the option, are exact. See
the [package guide](../packages/breditor-interchange/README.md#opt-in-gfm-autolink-literals).

HTML inline fragments retain text scope; explicit blocks use flow. Hosts may
request flow or grid admission explicitly, but native kind/shape checks still
reject incompatible content. HTML merged cells use relative, complete,
version-one source-partition wrappers so covered cells' independent text,
headers and media survive reimport without exposing source identities/clocks.

The package guide lists its [supported values and limits](../packages/breditor-interchange/README.md).
The Word/Docs/Excel fixtures are representative markup snippets, not a claim of
application-native clipboard certification. They cover list metadata, stylesheet
classes, Unicode, formatting, nested lists, merges, captions and asset references.
Unsupported content has a loss, compatibility notice or closed rejection result.

### Producer clipboard corpus

`packages/breditor-interchange/tests/fixtures/producers/` adds full clipboard
documents for Word desktop, Word for the web, Google Docs, Google Sheets, Excel
desktop, LibreOffice Writer and Cocoa HTML Writer (Notes/TextEdit/Pages). They
are **reconstructed from documented producer formats**, labeled as such in
each header: Office `mso-list` paragraphs with downlevel conditional markers and
`<o:p>`, VML image fallbacks with `file:` clip sources, Word for the web flat
`data-aria-level` list runs and `EOP` marks, the Docs non-bold GUID wrapper with
fully specified span styles and lists nested directly in lists, Sheets/Excel
cell value/format/formula metadata and merges, LibreOffice relative widths and
temporary images, and Cocoa class stylesheets. They are not captured,
certified application-native clipboard dumps.

`tests/producer_fixtures.test.ts` asserts each fixture's exact native outline,
marks, host image-registry calls and complete `{code, count, effect}` notices
through the same `importHtml` admission path. The package guide lists the
[producer conversions and notice policy](../packages/breditor-interchange/README.md#producer-clipboard-shapes).
In brief: Word alphabetic/roman/compound markers become ordered lists with
`list-numbering` (for V4 owners, exact letter/roman markers become styled lists
without it); skipped Word levels nest with `block-structure` rather than
rejecting; `file:` images report `image-reference` without consulting the host
registry; content-free syntax (namespace declarations, document metadata,
conditional markers, legacy doctypes, structural ARIA, no-op CSS values) no
longer produces notices. All resource bounds are unchanged.

Word for the web ordered items that are not provably decimal (CSS
`list-style-type: decimal` plus `%N.`/`%N)` level text) report `list-numbering` for owners without V4 list numbering.

Rich V4 owners, local and shared (`SharedRichEditor` over a V4 room reports the same
capabilities as a local V4 owner), report `supportsListNumbering()`.
For them, `<ol type>`, `list-style-type` and `reversed` map to native ordered-list
numbering, HTML export emits them and Markdown export falls back to HTML for
letter, roman or reversed lists. Word flat lists map too: Word desktop `a.`/`A.`/
`i.`/`I.` markers (with `.` or `)`) become lower/upper alpha or roman lists with
their start (ambiguous letters follow the open list's next ordinal and style),
and Word for the web items whose `list-style-type` is a native style and whose
`data-leveltext` is `%N.`/`%N)` keep that style. Those exact mappings report no
`list-numbering`; parenthesized, compound or unprovable formats keep the closest
style and are still reported. Other owners keep the original conversion and
notices exactly. See [RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md) and the
[package guide's mapping table](../packages/breditor-interchange/README.md#ordered-list-numbering-candidate-rich-v4-owners).

V4 owners also report `supportsTextLanguage()`. For them, `lang` and `xml:lang`
on inline or block elements become the native `breditor/text-language` format on
every text run below (canonical case; `lang=""` clears an inherited value;
malformed, private-use or extension tags report `unsupported-attribute`), HTML
export emits `<span lang>`, and Markdown export falls back to HTML for tagged
runs with a `markdown-feature` notice. Other owners keep accepting and dropping
`lang`/`xml:lang` silently.

V4 owners also report `supportsImageLinks()`. For them, an `<img>` inside a safe
`<a href>` (including `<figure><a href><img></a><figcaption>`) becomes the
image's own `breditor/image-href` (plus `image-link-new-window` for
`target="_blank"`); unsafe or out-of-subset targets report `unsafe-link` and a
decorative image keeps no link (`image-alt`). HTML export wraps only the image
in `<a>`, and Markdown export writes `[![alt](src)](href)` for same-window links
that round trip, else HTML with `markdown-feature`. Other owners keep dropping
the link around an image silently. See [RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md).

V4 owners also report `supportsDetails()`. For them, `<details>` becomes a
collapsible section: the first `<summary>` child is its summary (one inline line;
block markup inside it is flattened or moved into the body with
`block-structure`), `open` becomes persisted open state, a missing summary becomes
an empty one (`block-structure`) and an empty body gets one empty paragraph.
Sections nested deeper than 8 are lifted (`block-structure`). HTML export writes
`<details [open]><summary>…</summary>…</details>`; Markdown has no syntax, so a
section falls back to a safe HTML block with `markdown-feature`, which reimports
exactly. Other owners keep the original conversion: `<details>`/`<summary>` are
unwrapped into ordinary flow (the summary becomes a paragraph) with
`unsupported-element`, and `open` reports `unsupported-attribute`.

V4 owners also report `supportsMentions()`. For them, the exact span
`<span class="breditor-mention" data-mention-kind data-mention-id>@label</span>`
becomes a mention (kind, id and the label snapshot); anything else stays text.
HTML export writes that span around each mention's styled pieces; Markdown has no
mention syntax, so a block with a mention falls back to safe HTML with
`markdown-feature`, which reimports exactly. Other owners import the span as
plain `@label` text.

V4 owners also report `supportsTableCaptions()`. For them, a table's first
`<caption>` becomes the table's trailing caption paragraph (one paragraph imports
without a notice; a leading heading is converted and further or unsupported blocks
stay as flow before the table, each with `block-structure`). HTML export writes
`<caption style="caption-side:bottom">` as the table's first child so browsers
render it below the grid. Explicit unsupported placements report
`unsupported-style` on import. GFM tables have no caption, so a captioned table
falls back to the same safe HTML with `markdown-feature`.
Other owners keep the original conversion: `<caption>` content becomes flow before
the table with `block-structure`.

V4 owners also report `supportsPageBreaks()`. For them, Word's
`<br clear=all style='page-break-before:always'>`, Google Docs'
`<hr style="page-break-before:always;display:none">` and an empty `<div>` with a
forced break each become one root-level page break; forced breaks declared on content
blocks become page breaks around them (collapsed at the content edges and next to
another break); breaks below the root are removed with `block-structure`. HTML export
writes `<div style="break-after:page;page-break-after:always"></div>` (exact round
trip); Markdown falls back to it with `markdown-feature`. Other owners keep the
original conversion (`unsupported-style`, a line break, `removed-content`). See
[PAGINATION_AND_PRINT.md](PAGINATION_AND_PRINT.md).

V4 owners also report `supportsBookmarks()`. For them an `id` on `<p>`, `<h1>`–`<h6>`
or `<pre>`, or an `<a name>`/`<a id>` inside one, becomes the block's bookmark and
`href="#name"` an internal link (a `bm-` prefix is removed on both sides); invalid,
duplicate and extra anchors report `unsupported-attribute`. Export writes
`id="bm-<name>"` and `<a href="#bm-<name>">` (exact round trip); Markdown falls back
to that HTML with `markdown-feature`; DOCX writes `w:bookmarkStart`/`w:bookmarkEnd` and
`w:hyperlink w:anchor`. Other owners keep the original conversion (ids dropped,
`<a name>` → `unsupported-attribute`, `href="#…"` → `unsafe-link`). See
[RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md#slice-8-bookmarks-and-internal-links-audit-gap-document-utilities).

Remaining gaps: real captured clipboard dumps per producer/platform/version,
Word for the web non-decimal formats (reported, rendered as decimal),
Excel/Sheets hidden rows and columns (still rejected), cell
vertical alignment, and Word VML-only images without an `<img>` fallback.

## Enable browser clipboard conversion

Direct local/shared DOM mounts accept `clipboardInterchange: adapter`. Managed
`openLocalEditor`, `openLocalDocumentEditor`, `openSharedEditor` and
`openSharedDocumentEditor` accept a factory for their actual native owner:

```ts
import {openLocalDocumentEditor} from "@breditor/editor";
import {createRichInterchange} from "@breditor/interchange";

const editor = await openLocalDocumentEditor({
  host,
  selectionEditing: "document-v1",
  rangeEditing: "general-v1",
  richLanguage: 3,
  clipboardInterchange: core => createRichInterchange(core),
  onInterchange: report => showInterchangeNotice(report),
});
```

The port imports no foreign parser. Omitting it preserves the existing
private/plain clipboard path and file handling. Enabling it requires the complete
adapter and matching native admission. The factory runs before host DOM mutation
and must not publish edits. Startup failure uses the existing cleanup and host
rollback contracts.

Opted-in paste prefers private Breditor content, then advertised HTML, then
advertised `text/markdown`. Ordinary plain text is never guessed as Markdown.
Advertised empty rich/foreign content, conversion failure and native refusal do
not fall through to another representation. Rich/foreign content wins over an
accompanying image file; file-only insertion retains the explicit asset host.
Grid selections request native grid admission, rejecting incompatible shapes
atomically rather than converting them to prose.

Copy/Cut prepares HTML and Markdown before touching the clipboard. It writes
plain text, the private fragment and both foreign formats, verifying retention
of all four byte for byte. Failure may leave a partially written clipboard,
but Cut does not delete editor content. Read-only Cut behaves as Copy. Without
the opt-in, the existing retention requirements apply.

The controller captures the native revision before conversion callbacks. Cut
and Paste retain that guard through the bounded queue. A stale operation has no
success report. Each accepted paste uses one existing native history group,
not a sequence of TypeScript document edits.

`onInterchange` receives a frozen version-one report with the operation,
`sourceRevision`, per-format notices and optional native `destination` projection.
Copy reports follow verified retention; Cut/Paste reports follow accepted native
publication, including queued work. Visible status combines source notices with
caption/code losses. Callback failure cannot rewind an accepted edit. Existing
`onPasteLoss` still receives the destination once. That projection includes
inserted text; the full callback payload is not a content-free diagnostic record.

All four React wrappers take the factory in immutable `initialOptions` and expose
`onInterchange` as a live prop. Callback changes do not reset the owner or history.
Images use the programmatic adapter's explicit `resolveImage` and `exportImage`
registry policies. Import does not acquire bytes from source URLs or clipboard
companion files.

## Functional checkpoint

The [native interchange checkpoint](qualification/2026-10-16-clipboard-interchange.json)
covers the Rust construction/validation bridge through actual paired local and
shared application Wasm and compiled SDK facades. Its six content shapes are
mixed inline text, a merged table, an image/caption, a grid fragment, a nested
list and the complete rich root. Both explicit and natural history modes are
tested. Complete checkpoints are compared after recovery and future Undo/Redo,
including previous runtimes; no checkpoint fields are excluded.

The local/shared AST comparison excludes only newly authored merge priority
words, whose owners differ. That earlier native bridge checkpoint does not
qualify foreign parsing, system clipboard or release readiness.

The [foreign interchange checkpoint](qualification/2026-10-16-foreign-interchange.json)
adds both converter directions through paired application Wasm: 20 scenarios,
80 foreign content round trips, 48 exact restores and 192 future checkpoint
comparisons, including both offline authors. Covered merge cells retain their
distinct content and media. Four grid pastes and four wrong-shape refusals use
the existing native actions. Conversion-owned IDs are excluded only from foreign
round-trip comparisons; no checkpoint fields are excluded.

The [browser clipboard checkpoint](qualification/2026-10-16-browser-interchange.json)
adds compiled managed local/shared SDKs and all four actual React wrappers,
tested with paired application Wasm and synthetic DOM/clipboard/storage/locks.
It covers both owner and history families, 44 pastes, 44 exact restores,
176 future checkpoint comparisons, 22 durable shared resumes and 32 refused
Cuts with dropped formats. Priority, stale guards, queued reports, host-owned
images and live React callbacks are included.

The subsequent [combined installed checkpoint](qualification/2026-10-16-mixed-workflow-functional.json)
also passes both history policies with two independent authors: representative
Word/Docs/Excel paste, code/caption text-with-losses, whole-document rich Copy/Paste,
offline edits, selective history, exact local/server reopen and actual asset
transfer work together. It reproduced and repaired cumulative peer-update journal
growth without changing existing stored formats or resource ceilings. Retained
timing/lint failures and deferred release gates are recorded separately.

Run `scripts/probe-browser-interchange.mjs` with the paired runtime directories.
`scripts/check-interchange-package.mjs` repeats it using packed archives and bare
package imports, checks consumer types, and verifies parser separation in
production bundles. OS clipboard applications, broader browser reliability and
final release acceptance remain separate qualifications.
`scripts/check-editor-mixed-workflows.mjs` adds the combined workflow using an
explicitly built isolated native host; its full build/reproduction commands and
artifact hashes are in the combined checkpoint.
