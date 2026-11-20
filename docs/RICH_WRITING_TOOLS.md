# Writing tools

Rust derives document counts and a heading outline from the same admitted AST
used for editing. `inspect_rich_writing_tools(&RichDocument)` returns a detached
`RichWritingTools` result. Shared owners expose the same result through
`writing_tools_guarded(&SharedObservation)`, rejecting stale and foreign
publications before reading. Read-only owners are supported.

Optional Wasm/SDK reads and borrowed vanilla/React controls expose these native
results without adding fields to old view, command, document, journal or operation
protocols. Reads do not publish, change selection or pending formats, consume
writer identities, upgrade history or clear Redo. An independent optional native
placeholder policy controls a prompt outside editable content. A separate borrowed
browser controller provides native fullscreen without a document operation or
editor remount.

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
explicit indication when the native label is truncated. Panel chrome (metric
names, page and status text, the outline's accessible name) follows the host's
`uiLocale()` catalog; ArrowUp/ArrowDown/Home/End move between outline entries in
document order. See [UI localization](UI_LOCALIZATION.md#panels).

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

## Document placeholder

Pass `placeholder: 'Start writing…'` to a local/shared DOM mount or managed editor
opening. React uses the same immutable `initialOptions` field. The label must be
nonempty, well-formed Unicode within 1,024 UTF-8 bytes. Admission and the initial
configuration stay fixed per owner; mutating original options does not update it.
Omit the option to retain the original DOM shape and startup behavior.

For an admitted prompt, `editor.setPlaceholderLabel('Translated hint')` changes
only its UI label; `setPlaceholderLabel(null)` hides it and removes the ARIA hint.
Pass a string to show it again when native eligibility permits. These operations
preserve the owner, focus, selection, checkpoint and history, including while
read-only or composing. React callers can use their existing editor handle's
`getEditor()` or `onReady` owner without changing `sessionKey`. Invalid labels fail
before any presentation change. This setter cannot enable a prompt when startup
omitted admission; it does not silently wrap or replace an active editing surface.

Rust's `is_rich_placeholder_empty(&RichDocument)` permits the prompt only for one
top-level paragraph or heading without text leaves. Heading rank and prose layout
do not suppress it. Whitespace, zero-width characters, additional blocks and
structural content—including empty code, lists, quotes, tables, hidden tables and
images—do suppress it. This constant-work read is a presentation policy, never a
reason to discard saved data or treat an atom-only document as absent.

Profiles advertise native prompt policy V1 before managed startup creates an
owner or opens durable storage. Owners separately expose the complete guarded
read through `supportsPlaceholder()` and `placeholderEmpty(revision?)`; shared
Rust uses `placeholder_empty_guarded(&SharedObservation)`. Read-only owners can
read eligibility. The DOM displays the hint only when editable and not composing
or closed. Older runtimes reject an explicit unsupported option without a JS
empty-text substitute; omitted options keep ordinary startup available.

The literal hint is an `aria-hidden` sibling of the editable surface, inside an
opt-in positioning wrapper. It does not enter editor Copy/export, the AST,
checkpoints, history or shared frames. Placement follows the actual prose block
and its font/direction; long hints clip to the available editor area. Hidden
prompts release obsolete prose nodes, and observers stop on disposal. `aria-placeholder`
supplements the existing textbox label; it does not replace that label or supply
editing behavior. See [MDN's attribute reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-placeholder).

`probe-placeholder.mjs` exercises actual paired Wasm, all 30 managed grammar/
scope/history configurations and React ownership with DOM/storage/input fixtures.
Optional explicit pinned earlier readers additionally check exact recovery and
future history. `check-placeholder-installed.mjs` rebuilds and independently
installs the four packages before repeating the complete current-runtime probe
and public type/bundle checks. Both candidate profiles require current-runtime
and fresh installed acceptance; earlier-reader proof is separate.

The [placeholder qualification](qualification/2026-10-18-placeholder-browser-installed.json)
passes all 38 selected checks, including the complete workspace/shared native
suites and exact pinned-reader recovery. A fresh installed production page also
checks real prose/heading geometry, automated typing/history and live labels in
one headless Chromium engine. This is not physical input, cross-browser or V1
release qualification. Native fullscreen has a separate controller and lifetime.

## Native fullscreen

`createFullscreen(editor.fullscreen(), options)` from `@breditor/editor` or its
collaboration entry creates a native browser controller. Low-level local/shared
DOM coordinators implement the same `RichFullscreenHost` port directly. There is
no Rust fullscreen action, persisted flag, recovery family, schema revision or
new Wasm dependency. Ordinary editor startup remains unchanged.

The default target is the owning editor container. An explicit `target` must be
a connected ancestor containing that container and its editable surface in the
same document. Entry never wraps, reparents or recreates them. Borrowed controls
must have a separate host inside the fullscreen target and outside editable
content. This keeps controls reachable while preserving native editor ownership.

`controller.enter(revision?)` requires the exact idle publication outside
composition and calls `requestFullscreen()` synchronously before callbacks or
microtasks. Call it directly in a user-gesture handler; do not await unrelated
work first. The native API requires transient activation and may be unavailable
or denied by permissions, platform or user policy. There is no CSS-only fallback,
prefixed API substitute or keyboard lock. See the
[Fullscreen API standard](https://fullscreen.spec.whatwg.org/#api).

One controller claims each target, and one pending/active controller holds each
document lease. It never adopts external fullscreen, even on the same element,
and never exits a foreign session. `fullscreenchange` reconciles browser-initiated
exits. If a foreign fullscreen target is above this controller's target, cleanup
retains its lease and reports a retryable error instead of exiting that session.
Native ownership checks account for shadow-root retargeting; physical platform
qualification remains separate.

Entry/exit does not hold remote updates or authoring. Focus restoration uses the
same live owner and exact unchanged publication, not an old document selection.
It is skipped after source changes, composition, interaction, detached nodes or
focus moving elsewhere. Host input values/carets are never rewound. Exit remains
available during composition without cancelling the input method.

`mountFullscreenControls(host, controller, options)` and React's
`BreditorFullscreenControls` borrow the controller. UI disposal, StrictMode cleanup,
option-preserving rerenders and explicit `sessionKey` rekeys never close the
controller or editor. Keep a stable controller yourself and await
`controller.dispose()` before replacing its target/editor. Disposal waits for a
pending entry, exits only an owned target and releases listeners/style/claims.
A failed native exit leaves the retiring controller readable; retain it, surface
`onError` and retry `dispose()`. Closing the borrowed editor also initiates cleanup,
but does not make an asynchronous browser exit part of document durability.

The portable actual-Wasm probe covers all grammar/scope/history combinations,
logical selections, exact recovery, peer updates and React ownership with explicit
fullscreen/DOM/input/storage fixtures. Fresh installed acceptance repeats that
unchanged probe and public type/bundle checks. The full candidate profile also
requires a production-page test with the actual browser API. In the isolated
headless Chromium preflight, an automated Escape key did not exit fullscreen;
native external-exit events are tested separately, not called physical Escape
qualification.

The [fullscreen checkpoint](qualification/2026-10-18-fullscreen-browser-installed.json)
passes 25 selected checks, 19 focused controller contracts, 509 script tests and
381 editor regressions, with three existing script checks skipped. Its complete
30-case actual-Wasm probe and fresh installed acceptance retain exact logical
selections and recovery. A separate native Chromium production page qualifies
activation/viewport/events, typing/history and browser storage in 12 configurations,
not physical Escape or the final V1 platform/release requirements.

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
physical browser/IME or screen-reader qualification.
Zero words or text domains does not prove that an atom-only document is empty.
Performance and native-platform qualification stay
separate V1 requirements; the historical intermittent WebKit fault is not repaired
by writing reads.
