# AI and language tool provider contract

Status: opt-in browser tools for **local** editors. They add no document format,
command, history family, saved setting or Rust capability. Nothing is enabled by
mounting an editor; a host must mount a tool and supply its own provider.

Breditor bundles no AI client, vendor SDK, model, dictionary or network code.
Two tool kinds share one contract:

- **Rewrite/generate** (`mountRichAiTools` / `mountAiTools` / `BreditorAiTools`):
  a host provider proposes replacement text for an explicit scope; the user
  reviews a before/after diff and accepts or rejects it.
- **Language check** (`mountRichLanguageCheck` / `mountLanguageCheck` /
  `BreditorLanguageCheck`): a host provider returns spelling/grammar/style issues
  with suggestions; they are highlighted outside the editing DOM, listed for
  keyboard review and applied one at a time.

## Privacy boundary

- **Nothing leaves the page unless the host provider sends it.** The tools call
  the provider function the host passed in, and nothing else. They perform no
  `fetch`, XHR, WebSocket, worker, storage, cookie, clipboard or logging calls, and
  never write to the console.
- **Only the explicit scope is sent.** Every request names its scope; there is no
  implicit default:

  | Scope | What the provider receives |
  | --- | --- |
  | `selection` | The selected characters of each text block the current text selection touches |
  | `block` | The whole text of one text block: the block holding the selection focus, or an explicit `block` id |
  | `document` (language check only) | The text of every text block, in document tree order |

- **Plain text only.** A request carries the scoped text, its segments
  (`{block, start, end, text}`, UTF-16 offsets within each block's text), the
  rewrite instruction (rewrite only), the scope, an informational revision string
  and an `AbortSignal`. It never carries formatting, other blocks, image data,
  alt text, comments, suggestions, history, user/account identity, the editor,
  DOM nodes or the native owner. Block ids are the document's own opaque ids.
  Formatted (HTML/Markdown) *input* export is not offered in this version.
- **Text is read from the admitted native document JSON**, never from the DOM, so
  browser extensions' or spellcheckers' DOM decorations are never sent.
- What the host provider does with the request (which service, retention,
  consent, credentials) is entirely the host's responsibility and outside this
  contract. Hosts that send text to a third party should obtain consent and
  choose the narrowest scope.

## Size bounds and time limits

| Bound | Default | Hard ceiling |
| --- | --- | --- |
| Rewrite input (UTF-8 bytes of the scoped text) `maxInputBytes` | 64 KiB | 1 MiB |
| Rewrite output (UTF-8 bytes of the provider answer) `maxOutputBytes` | 64 KiB | 1 MiB |
| Rewrite instruction | 2,048 UTF-16 units | 2,048 |
| Language-check input `maxInputBytes` | 256 KiB | 1 MiB |
| Issues admitted per check `maxIssues` | 500 | 5,000 |
| Suggestions per issue `maxSuggestions` | 8 (each ≤ 256 units) | 32 |
| Issue message | 512 UTF-16 units | 512 |
| Provider deadline `timeoutMs` (0 disables) | 60 s | 10 min |
| Highlight rectangles painted | 8,192 (visible ones only) | — |

An over-size input is refused **before** the provider is called (nothing is
sent). An over-size answer is refused before review. Formatted answers are also
subject to the interchange adapter's own source, node, depth and table budgets.

## Cancellation

Each provider call receives an `AbortSignal`. The signal is aborted by **Stop**,
`cancel()`, Escape while pending, a newer request (superseded), panel disposal
(including React unmount or `sessionKey` change) and the deadline. Abort settles
the tool immediately; a provider result that arrives later is never observed. A
cancelled, superseded, failed or timed-out request never changes the document.

## Provider output is untrusted input

Rewrite providers return exactly one of `{text}`, `{markdown}` or `{html}`;
language providers return an array of
`{range:{block,start,end}, message, suggestions[], kind?}`. The tools validate:

- shape: plain objects/arrays with own data properties only (no getters, class
  instances or extra keys);
- text: well-formed UTF-16 (no lone surrogates), CR/CRLF normalized to LF, no C0/C1
  control characters other than tab (and LF in rewrite text; never in issue
  messages or suggestions);
- issues: the block must be one that was sent, the range must lie inside a sent
  segment and must not split a surrogate pair; malformed issues are dropped and
  counted (`Malformed provider issues ignored: N`), and a non-array answer fails
  the check.

Text is always displayed with `textContent`. **Raw provider HTML is never
inserted into the DOM.** `markdown`/`html` answers are accepted only when the
host passes an explicit `interchange` adapter (`createRichInterchange(core)` from
`@breditor/interchange`, for example captured in the editor's
`clipboardInterchange` factory). The adapter's bounded importer removes scripts,
styles, event handlers, unsafe URLs and unsupported markup, reports each loss
(`removed-content`, `unsupported-attribute`, `unsafe-link`, …) in the review, and
the native owner admits the result as a semantic clipboard transfer. The review
shows its plain reading text. Table-cell (grid) transfers are refused for a text
range.

## Rewrite: snapshot, review, apply and stale rejection

1. **Snapshot.** `requestRewrite({scope, instruction, block?}, provider)`
   resolves the scope against one exact view and keeps the snapshot revision, the
   complete admitted document JSON and the target range. It rejects (nothing is
   sent) when there is no target, the editor is busy/composing or read-only, or
   the input is too large.
2. **Review.** The answer is shown as a word diff: *Before* with removed parts in
   `<del>`, *After* with added parts in `<ins>` (both as full readable text), plus
   any import notices. The review is a labelled region; if the request started
   from the panel, focus moves to it. Accept and Reject are ordinary buttons;
   Escape rejects (or cancels while pending); Ctrl/⌘+Enter in the instruction
   field runs the request.
3. **Apply on Accept as one ordinary guarded command.** Plain text uses
   `replaceTextRange` (or `replaceGeneralRangePlainText` when the view declares
   general-v1 range replay); formatted output uses the native
   `pasteGeneralInlineClipboard` / `pasteGeneralFlowClipboard` over the snapshot
   range. Each is one native publication and **one Undo step**; it is never
   merged with neighbouring typing, and Redo/Undo behave like any other edit.
4. **Stale rejection.** The binding is the snapshot's *document content*: Accept
   is allowed only if the current admitted document JSON is byte-identical to the
   snapshot. Selection-only publications (moving the caret) change the revision
   but not the content, so the review stays valid. On Accept the command carries
   the exact current revision just verified to hold the snapshot content, so the
   native `stale_observation` guard closes any remaining race. Any content change
   — local typing, Undo/Redo, another tool — makes the review **stale** as soon as
   it is published (also when it happened while the provider was running): Accept
   is withdrawn, `accept()` throws, `onStale` fires, and **Run again** repeats the
   request against the current text. Nothing is ever re-targeted or re-mapped.

## Language check: overlays, keyboard review and stale issues

- **Overlay.** Issues are painted with the search-decoration approach: transient
  DOM ranges measured from block id + UTF-16 offsets, drawn as fixed-position,
  `aria-hidden`, pointer-transparent markers in a separate layer appended to the
  document body. The editing surface's DOM is never wrapped, styled or mutated.
  Only visible rectangles are painted; composition, busy owners and stale issues
  clear the paint.
- **Keyboard list.** Issues form a list of buttons with one tab stop
  (roving `tabindex`). ArrowUp/ArrowDown/Home/End move between issues and make
  the issue active (highlighted; with `reveal`, its range is selected in the
  editor as a selection-only publication). Enter/Space opens the active issue's
  suggestions and focuses the first; Escape returns to the issue, and Escape on
  an issue returns focus to the editor. Each suggestion is a "Replace with …"
  button; Ignore removes an issue without editing.
- **Apply.** A suggestion re-verifies that the issue's block text is unchanged,
  then submits one guarded plain-text range replacement with the current
  revision: one Undo step.
- **Stale issues.** Issues are bound to the exact text of their block. After any
  content publication, an issue whose block text changed is dropped (reported as
  `outdated issues removed: N`); issues in untouched blocks stay valid. The only
  re-mapping is **exact**: after this tool's own replacement, other issues in the
  same block are shifted by the replacement's length change, and only if the
  block's new text is exactly the expected result of that replacement and the
  issue lies wholly before or after the replaced range. Overlapping issues are
  dropped. No other mapping is attempted.

## Local and shared support

The SDK wires local editors (`LocalEditor` and `LocalDocumentEditor`) through
their existing borrowed search/execute port (`aiToolsHost(editor)`), and the
React entry adds `BreditorAiTools` and `BreditorLanguageCheck`. The structural
`RichAiToolsHost` port is also implemented by `richAiToolsHost(domEditor)` for a
directly mounted `RichDomEditor`.

**Shared editors are not wired in this version.** The shared session's public
command path is the `SharedDispatch` union; its `replace_text_range` operation
requires explicit per-run formats, and shared staleness also involves remote
operations, selective history and writer leases. A shared adapter needs its own
browser qualification against peers before it is offered. Read-only owners can
run a language check and review issues, but neither tool applies changes.

## Localization

All chrome strings are UI catalog keys (`ai*` and `lang*`) kept in a separate
block (`ui_locale_ai.ts`) merged into `RichUiStrings`; the original keys and
their English defaults are unchanged. Panels take the editor's catalog and
chrome `dir`/`lang`; provider text and document text are never translated.

## Qualification

- `packages/breditor-experimental-rich-content/tests/ai_tools.test.ts` (fake
  deterministic owner, real `RichDomEditor` coordinator and real interchange
  importer): scope reads, async/cancel/supersede/timeout, stale rejection,
  untrusted output shapes and encodings, script/handler removal with loss
  reports, size bounds, one-command/one-Undo apply, overlay isolation, keyboard
  review and localization.
- `packages/breditor-editor/tests/ai_tools.test.tsx`: SDK host adapter and React
  lifecycle (abort on retirement).
- `experiments/rich-browser/ai-tools.spec.mjs`: the actual Rust/Wasm owner (layout
  V3 profile) with a fake in-page provider in Chromium, Firefox and WebKit:
  one-step Undo after natural typing, stale refusal after typing vs. valid
  review after caret moves, cancellation, sanitized formatted output, overlay
  geometry without editing-DOM mutation, and keyboard apply with exact remapping.

Not covered: real AI or spelling services, IME composition during review, screen
reader announcements beyond ARIA roles/labels, shared editors and formatted input
export.
