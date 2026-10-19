# Writing tools

Rust derives document counts and a heading outline from the same admitted AST
used for editing. `inspect_rich_writing_tools(&RichDocument)` returns a detached
`RichWritingTools` result. Shared owners expose the same result through
`writing_tools_guarded(&SharedObservation)`, rejecting stale and foreign
publications before reading. Read-only owners are supported.

Optional Wasm/SDK reads and borrowed vanilla/React controls expose these native
results without adding fields to old view, command, document, journal or operation
protocols. Reads do not publish, change selection or pending formats, consume
writer identities, upgrade history or clear Redo. Placeholder and fullscreen
behavior remain unfinished.

The [native qualification checkpoint](qualification/2026-10-18-native-writing-tools.json)
passes all 15 selected checks: 2,607 workspace and 596 shared Rust tests/doctests,
two repeated compatibility contracts, strict lint/docs and wasm32 compilation,
472 script tests and 376 existing editor regressions. Three existing script
checks remain skipped. These are native utility and existing regression checks,
not a rebuilt/installed browser utility feature or V1 approval. The subsequent
[browser and installed-package checkpoint](qualification/2026-10-18-writing-tools-browser-installed.json)
passes a frozen 33-check run, including 30 native/SDK/control configurations,
30 managed reopen cases, eight React ownership cases and fresh independent
installed acceptance. Exact earlier readers restore 30 checkpoints and match
120 future history boundaries. These functional results do not close the V1
release gates.

## Count semantics

Counts cover accepted visible body text. Paragraphs, headings and code blocks
are independent text domains. Format runs within one domain are concatenated
before segmentation, so splitting a word, combining sequence, flag or joined
emoji across styles does not change its count. Block boundaries never invent a
separator, join a word or merge graphemes across blocks.

The result distinguishes Unicode word segments, extended graphemes, Unicode
scalars, UTF-16 units, UTF-8 bytes and text-domain count. Body whitespace and hard
breaks count as characters. Empty text domains count as blocks but not words or
characters. An atom-only document can have zero text domains.

Word segmentation uses the pinned native `unicode-segmentation` dependency. It
is not a language dictionary or morphological analysis: for example, `日本語`
currently yields three word segments. No case folding or Unicode normalization
is performed. UTF-16 totals are text metrics, not a document-wide position space.

Lists, tasks and quotes are transparent. Tables use derived presentation order
and count each visible merged source partition once, not once per rendered
alias. Captions and code contribute their accepted body text. Hidden tables,
image alt/asset metadata, IDs, generated list markers, comments and pending
suggestions do not contribute body text. No DOM or JavaScript text projection
supplies the count.

## Heading outline

The flat outline retains each heading's stable block identity, original level
and body label in semantic presentation order, including headings within list,
quote and table bodies. Levels may skip ranks; no parent headings are invented.
Labels are literal strings, not HTML or normalized text.

Each label retains complete extended graphemes within 1,024 UTF-8 bytes and
exposes `label_truncated()` when any source text was omitted. A first grapheme
larger than that budget produces an explicitly truncated empty label. Counts
still cover the complete admitted source, not the shortened label.

The detached result can outlive later edits, but is display data, not a fresh
selection command or mutation authority. Hosts must use current guarded editing
APIs when acting on a heading identity.

## Optional SDK reads

Local and shared SDK owners expose `supportsWritingTools()` and
`writingTools(revision?)`. The optional native marker must equal `1` and the
matching method must exist. An older runtime remains usable for its original
editor features, but an explicit writing read or panel mount rejects rather than
calculating a JavaScript substitute.

The separate `breditor/rich-writing-tools` V1 JSON read carries its schema binding,
document identity and exact publication. Revision and count fields are canonical
decimal strings, including revisions beyond JavaScript's safe integer range.
The SDK validates and deeply freezes this detached metadata. Read-only owners
can read counts and navigate headings; read-only policy still forbids authoring.

## Borrowed controls

Managed local and shared editors expose `editor.writing()`. Mount controls in an
unused host outside the editable surface and editor host:

```js
import {openLocalEditor, mountWritingTools} from '@breditor/editor';

const editor = await openLocalEditor({host: editorHost, richLanguage: 3});
const tools = mountWritingTools(asideHost, editor.writing(), {
  label: 'Document statistics', pageSize: 50, debounceMs: 120,
  onError: error => reportError(error)
});
// Remove borrowed controls before retiring their owner.
tools.dispose();
editor.dispose();
```

Low-level local and shared DOM controllers implement the same port. Their package
exports are `mountRichWritingTools` and `mountSharedWritingTools`, respectively.
The panel displays all six metrics and a paginated outline. Pagination limits
rendered rows, not the native result. Labels use literal text, including an
explicit indication when the native label is truncated.

`readWritingTools(revision?)` retains an immutable read belonging to that DOM
host. `selectWritingHeading(read, index, revision?)` accepts only that retained
read at its exact current revision, and queues the existing native selection
command to the heading's start. A JSON clone, a read from another host, stale
publication or composition rejects. Parsed metadata is not selection authority.
The operation returns a promise; there is no retry against a different heading.

Publication invalidates the panel's actionable read immediately. Previously
displayed rows remain disabled until the deferred refresh completes; a late click
cannot refresh and silently act on a replacement row. Busy/composing/closed
owners are explicit states. Reads and notifications never grant reentrant
publication authority. `refresh()`, `selectHeading(index, revision?)`,
`setPage(page)` and `state()` remain available on the panel.

Both editor React entry points export `BreditorWritingTools`. Pass
`editor={editor.writing()}` and optional `initialOptions`; options remain fixed
for that host/`sessionKey`. The component owns only its controls. StrictMode,
ordinary rerenders and panel retirement do not create, close or replace a writer.
`onError` may change independently. Keep the editor host stable and remove the
borrowed component before closing the editor session.

## Resource policy and qualification

The first implementation shares native Find's bounded presentation traversal:
4 MiB aggregate UTF-8 text, 8,192 text domains and 65,536 visited or queued nodes.
Public `RICH_WRITING_MAX_*` constants expose those limits. Exceeding a limit
rejects the whole read with a payload-free error; no prefix counts or partial
outline is returned. The independent JSON encoding additionally admits at most
8 MiB, including escaped labels and metadata; its size is checked before final
encoding. Existing document admission limits are not enlarged.

This is an on-demand read, not an incremental index or a measured typing-latency
promise. `probe-writing-tools.mjs` checks actual paired Wasm, SDK and DOM fixtures;
its optional two pinned earlier references additionally check exact restoration
and future history. The default current-only mode does not claim that earlier
reader proof. `probe-writing-tools-root-sdk.mjs` covers managed persistence and
React ownership. `check-writing-tools-installed.mjs` rebuilds, packs and installs
the four packages into an isolated offline consumer, checks public types and runs
both current-runtime probes without workspace links. Both candidate profiles
require the current-runtime and fresh installed checks.

DOM events, IDB, locks and composition in these probes are test fixtures, not
physical browser/IME or screen-reader qualification. Placeholder text must stay
outside content, and fullscreen must preserve source-bound focus and selection.
Zero words or text domains does not prove that an atom-only document is empty.
These remaining features, performance and native-platform qualification stay
separate V1 requirements; the historical intermittent WebKit fault is not repaired
by writing reads.
