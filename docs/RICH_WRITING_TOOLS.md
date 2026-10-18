# Native writing tools

Rust derives document counts and a heading outline from the same admitted AST
used for editing. `inspect_rich_writing_tools(&RichDocument)` returns a detached
`RichWritingTools` result. Shared owners expose the same result through
`writing_tools_guarded(&SharedObservation)`, rejecting stale and foreign
publications before reading. Read-only owners are supported.

This is the native foundation. Wasm/SDK reads, borrowed vanilla/React controls,
installed acceptance, placeholder and fullscreen behavior remain unfinished.
No old view, command, document, journal or operation protocol is extended by these
Rust reads. They do not publish, change selection or pending formats, consume
writer identities, upgrade history or clear Redo.

The [native qualification checkpoint](qualification/2026-10-18-native-writing-tools.json)
passes all 15 selected checks: 2,607 workspace and 596 shared Rust tests/doctests,
two repeated compatibility contracts, strict lint/docs and wasm32 compilation,
472 script tests and 376 existing editor regressions. Three existing script
checks remain skipped. These are native utility and existing regression checks,
not a rebuilt/installed browser utility feature or V1 approval.

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

## Resource policy and remaining work

The first implementation shares native Find's bounded presentation traversal:
4 MiB aggregate UTF-8 text, 8,192 text domains and 65,536 visited or queued nodes.
Public `RICH_WRITING_MAX_*` constants expose those limits. Exceeding a limit
rejects the whole read with a payload-free error; no prefix counts or partial
outline is returned. Existing document admission limits are not enlarged.

This is an on-demand read, not an incremental index or a measured typing-latency
promise. Next integrate independently versioned optional Wasm/SDK capabilities
and borrowed controls without adding fields to old view families. Placeholder
text must stay outside content, and fullscreen must preserve source-bound focus
and selection. Installed and native-platform qualification remain separate V1
requirements.
