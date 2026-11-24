# AI and language tool provider contract

Status: opt-in browser tools for local and shared editors. They add no document
format, command, history family, saved setting or Rust capability (shared
editors reuse the existing native plain-text range replacement). Nothing is enabled by
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

An LLM **agent** that reads and edits the document through typed tools (schema
validation, reviewable staged changes or proposals, revision-bound stale checks,
local and shared) is a separate opt-in contract: [AI_AGENT_TOOLS.md](AI_AGENT_TOOLS.md).

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
  `aria-hidden`, pointer-transparent markers in a separate layer. The layer
  follows the editor's fullscreen ancestor or mounts under the document body.
  The editing surface's DOM is never wrapped, styled or mutated.
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

Shared editors are wired separately (next section). Read-only owners (local or
shared) can run a language check and review issues, but neither tool applies
changes, and a rewrite is refused before anything is sent.

## Shared editors

Same provider contract, scopes, bounds, cancellation, untrusted-output rules and
UI as local editors. Entry points (`@breditor/collaboration`, re-exported by
`@breditor/editor/collaboration`):

- `sharedAiToolsHost(domEditor)` adapts a `SharedDomEditor` (either selection
  policy) to the `RichAiToolsHost` port;
- `mountSharedAiTools(root, source, options)` and
  `mountSharedLanguageCheck(root, source, options)` take that DOM editor or any
  owner with an `aiTools()` port — the SDK's `SharedEditorSession` and
  `SharedDocumentEditorSession` now expose `aiTools()`;
- React (`@breditor/editor/collaboration/react`): `BreditorSharedAiTools` and
  `BreditorSharedLanguageCheck` take a ready shared session as `editor`, with the
  same props, handles and retirement behaviour as the local components.

**Reads.** Scoped text comes from the shared owner's admitted document JSON (the
same projection as local: text blocks in tree order, UTF-16 offsets), never the
DOM.

**Apply.** Accept (and a language suggestion) calls the new
`SharedDomEditor.replacePlainTextRange(selection, text, focus, revision)`:
exactly one guarded native call queued through the DOM editor's command path
(remote frames are held while it runs). For an original-range owner it is the
native `replace_plain_text`, which stages one `ReplaceTextRange` command — the
logical start's formats, the caret after the inserted text, pending formats
cleared — through `apply_with_state` as **one explicit writer-local history
group, never joined with an open typing group**. For a general-v1 owner it is
native general range plain input (`replace_general_range_plain_text`), also one
group. The browser never computes formats and never builds a multi-command
batch. The call carries the exact current revision; the shared observation guard
rejects it if any publication (local or remote) landed after the browser's
check, without a partial publication. Undo removes only this writer's
replacement; peers' concurrent edits stay (selective history).
`crates/breditor-collaboration/tests/shared_ai_rewrite_contracts.rs` proves both
native calls, after natural typing and a peer edit elsewhere, are one group that
undoes/redoes exactly and converges on the peer, and that a raced observation is
rejected without publishing. The native `replace_plain_text` input limit is
64 KiB of UTF-8 (the default `maxOutputBytes`); a larger host limit lets the
review show but Accept then fails with the native limit error.

**Formatted output is not offered for shared editors.** `mountSharedAiTools`
refuses an `interchange` option, and a `markdown`/`html` answer fails like it
does locally without an adapter. Only `{text}` answers are applied.

**Stale scope: the target region, not the whole document.** Peers publish
continuously, so binding a review to the complete document would make almost
every shared rewrite stale. The shared port declares `aiStaleScope: "target"`:
the review stays valid while the **target region** is byte-identical to the
snapshot (`aiTargetKey`). The region is every node from the first target block
through the last in tree order — the blocks' own properties, text runs and
formats, plus any block, table or image between multi-block endpoints — and the
type/properties of both endpoints' ancestor chains (not the ancestors' other
children). Consequently:

- a peer edit, insertion, formatting change or deletion anywhere else (other
  blocks, other list items in the same list, captions elsewhere) does **not**
  stale the review, while the provider runs or during review;
- a peer edit inside the target (text or formats), a deleted or moved-away target
  block, a re-wrap that changes an ancestor, or a block inserted between
  multi-block endpoints stales it immediately; Accept is withdrawn exactly as for
  local editors and **Run again** re-requests against the current text;
- caret/selection-only publications never stale it;
- Accept re-checks the region against the current view and then dispatches with
  that view's revision, so the native guard closes the remaining race. Nothing is
  re-targeted or re-mapped.

Local editors keep the default `aiStaleScope: "document"` (the whole document
must be unchanged).

**Language check under collaboration** needs no new rule: issues are bound to the
exact text of their block, so after any publication issues in blocks a peer
changed are dropped (`outdated issues removed: N`) and issues in untouched blocks
stay valid. Applying a suggestion re-verifies the block text and submits the same
one-group `replacePlainTextRange` with the current revision.

**Privacy in shared rooms.** The contract is unchanged — only the explicit scope
leaves the page, and only through the host provider — but in a shared room the
scoped text can include content **written by other participants** (a block or a
document-scope language check covers everyone's text, and the request carries
the room's block ids). Breditor cannot know whether those participants agreed to
have their text sent to a third-party service. Hosts are responsible for
obtaining consent from every participant whose content may be sent (for example
a room-level setting all members accept), for disclosing which provider is used,
and for preferring the narrowest scope (`selection`) in shared rooms. No writer,
peer, presence or account identity is included in any request.

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
- `packages/breditor-editor/tests/shared_ai_tools.test.tsx` (fake native shared
  owner under the real `SharedRichEditor` and `SharedDomEditor`, peers' edits
  admitted through `receiveFrame`): one guarded native replacement per Accept
  with the current revision and one Undo step; peer edits elsewhere (while
  pending, during review, block insertion, formatting) keep the review valid;
  peer edits in the target, formatting of the target and a block inserted
  between multi-block endpoints stale it; general-v1 routing; formatted output
  refused; read-only; cancel/supersede/dispose; language issues dropped only in
  peer-changed blocks; target-key unit cases; SDK `aiTools()` source and React
  lifecycle.
- `crates/breditor-collaboration/tests/shared_ai_rewrite_contracts.rs`: the exact
  native calls are one history group after typing and a peer edit elsewhere,
  undo/redo exactly, keep the start style, converge on the peer, and a raced
  observation publishes nothing.

Not covered: real AI or spelling services, IME composition during review, screen
reader announcements beyond ARIA roles/labels, formatted input export, formatted
shared rewrite output, and a shared-editor browser run (the shared Playwright
harness needs `target/collaboration-feasibility-web`, which was not built for
this change; the shared adapter is qualified with the fake owner and the Rust
contract test only).
