# Slash-command suggestion sessions

Status: opt-in browser candidate for local rich owners. This covers the slash
command half of the `mentions-slash` readiness gap. Durable mention entities and
the `@` menu are candidate rich V4 slice 5 ([RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md));
both menus share one typed-trigger session (`suggestion_session.ts`), and slash
behaviour, DOM and messages are unchanged.

Code:

- `packages/breditor-experimental-rich-content/src/slash_command_items.ts`: the
  item contract, adapters from existing toolbar controls, and local ranking.
- `packages/breditor-experimental-rich-content/src/slash_command_session.ts`: the
  session controller and its accessible menu.
- `packages/breditor-editor/src/slash_commands.ts` and `slash_commands_react.tsx`:
  the SDK host adapter and the React wrapper.
- Tests: `packages/breditor-editor/tests/slash_commands.test.ts` (a real
  `RichDomEditor` with a fixture owner in jsdom) and
  `slash_commands_react.test.tsx`.

## Ownership

The controller borrows a DOM coordinator through `RichSlashCommandHost`:
`surface`, `searchState()`, `subscribeSearch()`, `view()`, `execute()` and
`focus()`. `RichDomEditor` matches this shape directly. `slashCommandHost(editor)`
adapts `LocalEditor` and `LocalDocumentEditor`. The controller does not own the
editor, its history or its native owner. `dispose()` releases only the menu,
listeners and in-flight provider requests.

The controller never writes to the editing DOM and never reads document text from
it. Triggers, queries and item enablement come from admitted Rust views
(`view().documentJson` and `view().selection`). Edits go through the
coordinator's guarded queue as existing typed `RichCommand`s.

## Session lifecycle

1. **Arming.** A `beforeinput` of type `insertText` whose data ends in `/`, aimed at
   the surface and not composing, arms the controller until the end of that task.
   The listener is a document capture listener, so it runs before the coordinator
   publishes. Programmatic `execute()` calls and other publications never arm it.
2. **Opening.** The next publication notification while armed opens a session if
   all of these hold: the Rust document changed since arming, the selection is a
   collapsed text caret in a paragraph or heading (not a code block or image
   caption), the character before the caret is `/`, and that slash is at the
   block start or after whitespace. The owner must not be read-only, composing,
   busy or closed. Each session gets a new numeric identity.
3. **Trigger identity.** A session holds `{block id, slash offset, exact text
   before the slash}`. Each publication notification re-reads the Rust view and
   re-verifies all three. The query is the text from the slash to the caret.
4. **Query updates.** When the query changes, the controller asks the provider
   for items again. It also re-asks after any publication while it is not already
   loading, so enablement follows the newest view.
5. **Ending.** The session ends when an item is executed, or when it is cancelled
   for one of the reasons below.

`state()` returns a frozen snapshot: `open`, `session`, `trigger`, `query`,
`items` (id and label), `active`, `loading`, `error`, and `lastCancel`.

### Cancellation rules

| Reason | Cause |
| --- | --- |
| `dismissed` | Escape, or `cancel()` with no reason. The typed text stays. That trigger does not reopen; only a newly typed `/` can. |
| `composition` | `compositionstart` on the surface, or the owner reports that it is composing. |
| `trigger-invalidated` | The block is gone or is no longer prose, the text before the slash changed, or the slash itself changed. Remote or programmatic edits before the trigger cause this. |
| `selection-left` | The selection is not a collapsed caret in the trigger block after the slash. |
| `query-ended` | The query has whitespace or another `/`, or is longer than `maxQueryLength` (default 32, maximum 64). |
| `blur` | `focusout` from the surface to anything outside the menu. |
| `read-only` | The owner's live policy became read-only. |
| `editor-closed` | The borrowed editor was disposed. Its final notification reports `closed`. |
| `disposed` | The controller was disposed. |

Cancelling aborts the provider's `AbortSignal`, hides the menu and restores the
surface's previous ARIA attributes. `onCancel(reason)` is called once per session.

## Async item providers

`items` is either a fixed array or a provider:

```ts
(query, {signal, revision, session}) => RichSlashItem[] | Promise<RichSlashItem[]>
```

- A fixed array is ranked locally with `filterRichSlashItems`. The order is: label
  prefix, then word prefix, then id or keyword prefix, then substring. Ties keep
  their original order.
- Each request gets a fresh `AbortController`. A new query, an execution, any
  cancellation or disposal aborts the previous request.
- A result is applied only if its session is still current, its request
  generation is still the latest, and its signal was not aborted. Anything else is
  stale and discarded, including late resolutions that ignore `signal`.
- Results are validated before use. Ids must be unique and match
  `[A-Za-z0-9][A-Za-z0-9._:-]{0,63}`. Labels must be non-empty, and `enabled` and
  `command` must be functions. `enabled()` is then evaluated against the newest
  Rust view, not the view the provider started from, and the list is truncated to
  `maxItems` (default 10, maximum 50).
- Rejections and invalid results go to `onError` and the menu status. Nothing
  falls back to DOM matching.
- While a request is loading, the listbox has `aria-busy="true"`, Enter and Tab
  are not intercepted, and `choose()` throws.

## Command execution path

`choose(index?)`, Enter, Tab or a click on an option:

1. Refuses if the coordinator is busy, re-runs the trigger check against the
   current Rust view (and cancels on failure), and re-checks `item.enabled()`.
2. Ends the session first, so the publications that follow are not treated as
   invalidations.
3. Removes the typed `/query` with one guarded native command at the checked
   revision. That is `replaceTextRange` over `[slash, caret]` in the trigger block,
   or `replaceGeneralRangePlainText` when the view declares
   `rangeEditing: "general-v1"`.
4. Reads the new Rust view and prepares `item.command(context)` from it. It then
   executes that existing command at the new revision.
5. Returns and reports `{item, removal, outcome}` through `onExecute`. If the
   command is no longer applicable after the removal (`null`), only the trigger
   was removed. This is reported through `onError`, and `outcome` is `null`.

If either publication is queued instead of published, `choose()` throws. A queued
removal does not run the command.

`createRichSlashCommands(controls, picks?)` adapts existing toolbar controls by
id. `standardRichSlashPicks` maps:

| Item | Control |
| --- | --- |
| Text | `paragraph` |
| Heading 1, 2 and 3 | `heading`, with a fixed-level `setHeading` |
| Bullet list | `bullet` |
| Numbered list | `numbered` |
| Task list | `tasks` |
| Quote | `blockquote` |
| Code block | `code-block`, with `policy: "rejectFormatted"` |
| Divider | `horizontal-rule` |
| Table | `table` |

Picks whose control is missing from the supplied toolbar are omitted. For example,
`defaultToolbar` has no structural V2 controls, so its menu has no Task list,
Quote, Code block or Divider.

Item contexts allocate ids under a per-controller `br:<uuid>` namespace. Pass
`core` in the options when a control checks owner binding.

### Undo granularity

The existing native history has no composite intent. A slash command is
therefore two retained steps:

1. The first Undo reverts the command.
2. The second Undo restores the typed `/query`.

Making it a single step needs a native composite "replace range then apply"
intent in Rust. That is not specified here, and no JavaScript-side history
merging is attempted.

## Accessibility

The menu is a popup appended outside the editing surface (default
`document.body`, or `options.container`). It holds a `role="listbox"` with
`role="option"` children, each with a stable id and `aria-selected`, and a
separate polite `role="status"` live region.

While a session is open, the surface keeps `role="textbox"` and gets
`aria-autocomplete="list"`, `aria-controls=<listbox id>`, `aria-expanded="true"`
and `aria-activedescendant=<active option id>`. The previous values are restored
when the session ends.

DOM focus never leaves the editor. Option `pointerdown` and `mousedown` are
prevented, so clicking an option keeps the caret and native selection.

The controller's document-capture `keydown` listener handles keys only while a
session is open and the key is not composing or modified:

- ArrowDown and ArrowUp wrap through the options.
- Enter and Tab choose the active option.
- Escape dismisses the menu.

Each handled key is `preventDefault`ed and `stopImmediatePropagation`ed, so the
coordinator never sees it. Enter with no options passes through as a normal
paragraph split, which then ends the session with `selection-left`.

## SDK

```js
import {openLocalEditor, mountSlashCommands, createSlashCommands} from '@breditor/editor';
import {defaultToolbar} from '@breditor/experimental-rich-content';

const editor = await openLocalEditor({host});
const slash = mountSlashCommands(editor, {items: createSlashCommands(defaultToolbar)});
// ...
slash.dispose();
editor.dispose();
```

`BreditorSlashCommands` from `@breditor/editor/react` takes `editor` (for
example, from `BreditorEditor`'s `onReady`), `initialOptions` and an optional
`sessionKey`. The latest `onOpen`, `onCancel`, `onExecute` and `onError` props
are always used, and a parent re-render does not remount the controller.
Unmounting disposes only the controller.

## Not covered or unverified

- **Real-browser behaviour.** Verification so far is jsdom only. Not yet checked
  in a real browser:
  - caret-rect positioning;
  - screen-reader announcement of `aria-activedescendant` on a contenteditable
    textbox;
  - Android and IME `beforeinput` arming when `/` comes through composition. A
    composed slash cancels and does not open.
  - the order of document-capture listeners against browser extensions.
- **Shared editors.** `SharedDomEditor.execute` takes `SharedDispatch`, not
  `RichCommand`, so shared owners need a separate dispatch adapter. The trigger
  checks already handle remote edits generically.
- **Single-step Undo.** This needs a native composite intent (see above).
- **Mentions.** Implemented for candidate rich V4 only (native
  `insertMention`, one Undo step); see RICH_LANGUAGE_V4.md slice 5.
- No default menu styling theme or hotkey to open the menu without typing `/`.
