# Slash-command suggestion sessions

Status: opt-in browser candidate for local rich owners and, through a separate
dispatch adapter, shared (collaborative) editors ([Shared editors](#shared-editors)).
This covers the slash command half of the `mentions-slash` readiness gap. Durable mention entities and
the `@` menu are rich V4 slice 5 ([RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md));
both menus share one typed-trigger session (`suggestion_session.ts`), and slash
behaviour, DOM and messages are unchanged.

Code:

- `packages/breditor-experimental-rich-content/src/slash_command_items.ts`: the
  item contract, adapters from existing toolbar controls, and local ranking.
- `packages/breditor-experimental-rich-content/src/slash_command_session.ts`: the
  session controller and its accessible menu.
- `packages/breditor-editor/src/slash_commands.ts` and `slash_commands_react.tsx`:
  the SDK host adapter and the React wrapper.
- `crates/breditor-core/src/rich_content/local_session/replace_trigger_then.rs`
  and `crates/breditor-wasm/src/rich_editor/command/replace_trigger_then.rs`: the
  native one-step composite (see [Undo granularity](#undo-granularity)).
- Tests: `packages/breditor-editor/tests/slash_commands.test.ts` (a real
  `RichDomEditor` with a fixture owner in jsdom),
  `slash_commands_react.test.tsx`,
  `packages/breditor-experimental-rich-content/tests/slash_composite.test.ts`
  (capability probe and command boundary), `crates/breditor-core/tests/rich_trigger_composite.rs`,
  `crates/breditor-wasm/tests/rich_trigger_composite.rs`,
  `crates/breditor-collaboration/tests/shared_trigger_composite_contracts.rs` and
  `experiments/rich-browser/parity-tools.spec.mjs` (real Wasm, three browsers).

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
3. **Native composite (one Undo step).** If the host reports
   `supportsTriggerComposite() === true`, it prepares `item.command(context)` from
   the checked view. If that command's kind is in the native allowlist
   (`richTriggerCompositeKinds`), it publishes one guarded
   `{kind:"replaceTriggerThen",data:{selection:[slash, caret],command}}` at the
   checked revision and reports `{item, removal, outcome, composite:true}`, where
   `removal` and `outcome` are that one outcome. If Rust refuses it (for example,
   the command no longer applies), nothing is published, `choose()` throws, and
   the typed `/query` stays.
4. **Two-step fallback** (older owners without the capability, a `null`
   command, or a command outside the allowlist). It removes the typed `/query`
   with one guarded native command at the checked revision. That is
   `replaceTextRange` over `[slash, caret]` in the trigger block, or
   `replaceGeneralRangePlainText` when the view declares
   `rangeEditing: "general-v1"`. It then reads the new Rust view, prepares
   `item.command(context)` from it and executes that existing command at the new
   revision.
5. Returns and reports `{item, removal, outcome, composite}` through `onExecute`.
   In the fallback, if the command is no longer applicable after the removal
   (`null`), only the trigger was removed. This is reported through `onError`, and
   `outcome` is `null`.

If a publication is queued instead of published, `choose()` throws. A queued
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

With an owner that reports `triggerCompositeVersion() === "1"` (every current
rich owner, V1 to V4, local and document scope), a slash command is **one**
native history unit: one Undo restores the typed `/query` and the caret before
the command, and one Redo replays the command. No JavaScript-side history
merging is involved. The typing burst that typed `/query` stays its own Undo
step (as for mentions), so a second Undo removes the typed text.

#### Native design: `replaceTriggerThen`

`RichLocalSession::replace_trigger_then(snapshot, trigger, step)` (core) is a
bounded history transaction:

1. It checks the observation and the read-only policy, then the trigger. The
   trigger must be a nonempty text range in one paragraph, heading or section
   summary (as for `insertMention`). Code blocks, collapsed, cross-block and
   non-text targets are refused.
2. It builds a private **scratch owner** at the exact current publication
   (document, selection, pending formats, revision) with empty history and no
   typing partition. On it, it removes the trigger with the ordinary
   `replace_range_plain_text(trigger, "")`. The caret is collapsed at the trigger
   start, with the trigger's own pending style.
3. It runs the follow-up `step` on the scratch owner with the scratch
   observation. The step uses the command's normal implementation, so it is
   captured against the evolving post-removal document and maps the
   post-removal selection exactly as a separate command would.
4. The step must publish exactly one content unit (`ContentCommitted`, two
   scratch entries, cursor at the end). A step that fails, changes nothing, only
   moves the selection, undoes, or publishes more than one unit is refused.
5. Only then does it change the live owner, with one `commit_content`. The
   entry's `before` is the observed state and its `after` is the scratch's final
   document, selection and pending formats at the next live revision. Its
   forward and inverse recipes are the replay-proved local branch rewrite
   between the two documents (`LocalRewrite::between`), checked in both
   directions before commit. This is the same recipe family that checkpoints and
   native search replacement already use, so local and document checkpoints,
   typing checkpoints and restore need no format change.

Atomicity follows from the scratch owner: any failure drops it, and the live
owner's token, revision, selection, history (including the redo branch) and
typing continuation are untouched. Its earlier observation remains valid.
Natural typing history appends the composite as a new group, which closes the
open typing burst. The schema and fingerprint are unchanged.

The Wasm command is
`{"kind":"replaceTriggerThen","data":{"selection":<text range>,"command":<command>}}`.
The nested command is decoded by the ordinary closed command decoder and must
be one of this **allowlist**. Each kind addresses blocks by identity, never by
text offsets, so a same-block trigger removal cannot retarget it:

| Kind | Slash items |
| --- | --- |
| `setHeading` | Text, Heading 1–3 |
| `wrapList`, `setListKind` | Bullet list, Numbered list |
| `wrapTaskList` | Task list |
| `wrapBlockquote` | Quote |
| `setCodeBlock` | Code block |
| `insertHorizontalRule` | Divider |
| `insertTable` | Table |
| `insertBlocks` | custom inserts |
| `wrapDetails` | Collapsible section (V4) |
| `insertPageBreak` | Page break (V4; a root position and a fresh block id) |

Anything else, including history, selection, text, mention and nested
`replaceTriggerThen` commands, is refused with `breditor_rich.trigger_command`.
A refused step reports its own code, and a non-content step reports
`breditor_rich.trigger_step`. Rust re-validates every target against the
post-removal document.

Because the allowlisted payloads carry no text offsets, the browser prepares the
command from the checked pre-removal view. Rust is the authority that it still
applies after the removal.

#### Capability and fallback

- Wasm: `BreditorRichEditor.triggerCompositeVersion()` returns `"1"`.
- Core facade: `RichCoreEditor.supportsTriggerComposite()` checks for exactly
  `"1"`. A module without the method reports `false`.
- DOM and SDK: `RichDomEditor.supportsTriggerComposite()`,
  `LocalEditor`/`LocalDocumentEditor.supportsTriggerComposite()`, and the
  optional `RichSlashCommandHost.supportsTriggerComposite` that
  `slashCommandHost(editor)` forwards.
- Without the capability, or for a command outside the allowlist, the session
  keeps the two-step path above (two Undo steps: the command, then the trigger
  removal). This path is still tested.

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

## Shared editors

Shared editors (`SharedDomEditor`, managed `SharedEditorSession` and
`SharedDocumentEditorSession`) get slash commands from
`packages/breditor-collaboration/src/slash_commands.ts`:

```js
import {mountSharedSlashCommands, createSharedSlashCommands} from '@breditor/collaboration';
const slash = mountSharedSlashCommands(dom, {items: createSharedSlashCommands(toolbarControls, undefined, dom.uiLocale())});
```

or, with the SDK, `mountSlashCommands(session)` from
`@breditor/editor/collaboration` (items default to the standard catalog built
from the session's own `toolbarControls()`; pass `items` to replace it) and
`BreditorSharedSlashCommands` from `@breditor/editor/collaboration/react`
(same props as `BreditorSlashCommands`; `initialOptions` is optional).

**Same session.** The adapter mounts the generic `RichSuggestionSession` with
the slash spec's trigger, menu attributes, ids, messages and catalog keys.
Arming, opening, trigger identity, every cancellation reason, async providers,
`AbortSignal` handling, keyboard handling, ARIA and `uiLocale()` strings are the
local behaviour above. The shared view is read under the rendering format tag
(`breditor/rich-view` or `breditor/rich-document-view`), exactly as the shared
presentation model does; scope, AST, selection and revision are the native
values.

**Remote edits.** Shared editors notify the read channel after every remote
publication. Each notification re-runs the trigger check, so a peer edit before
the slash or to the slash itself, removal of the trigger block, a remote
read-only policy change, or a selection mapped out of the query cancels the
session (`trigger-invalidated`, `read-only`, `selection-left`). Remote edits
elsewhere leave it open and only re-filter a static list; a provider is not
called again for the same query. A cancelled trigger never reopens by itself.

**One history group.** Choosing an item publishes exactly one guarded
`SharedDomEditor.execute` call at the checked revision:

```json
{"commands":[{"kind":"delete_text","data":{"block":"<trigger block>","offset":<slash>,"length":<caret - slash>}}, <item command>]}
```

Shared dispatch applies one ordered batch atomically as one writer-local history
group, so one Undo restores the typed `/query` and the original block, one Redo
replays both, and the typing that produced `/query` stays its own earlier group.
Peers receive the batch without gaining a local Undo step. A refused batch
publishes nothing and the typed `/query` stays. Offsets are UTF-16 units read from
the Rust view. There is no shared two-step fallback and no new shared command.

The item command is prepared from the checked pre-removal view, so only kinds
that address blocks by identity are admitted after the removal
(`sharedSlashCommandKinds`): `set_heading`, `set_code_block`, `wrap_list`,
`set_list_kind`, `wrap_task_list`, `wrap_blockquote`, `insert_horizontal_rule`,
`insert_blocks` (at most 16 commands, optional `selectionUpdate`). Anything else,
including text-offset commands, is refused before publication.

**Items.** `createSharedSlashCommands(controls, picks?, ui?)` adapts the shared
toolbar controls by id. Each item captures the single dispatch its control's
`run` would publish, against a port whose only operation is `dispatch`; a control
that needs any other owner operation, publishes more than once, sets pending
formats, or emits a non-allowlisted kind is not representable and is disabled.
Items are disabled while read-only. `standardSharedSlashPicks`:

| Item | Shared control | Batch follow-up |
| --- | --- | --- |
| Text | `paragraph` | `set_heading` (`level: null`) |
| Heading 1, 2 and 3 | `h1`, `h2`, `h3` | `set_heading` |
| Bullet list, Numbered list | `bullet`, `numbered` | `wrap_list`, or `set_list_kind` inside a list |
| Task list | `tasks` (V2/V3) | `wrap_task_list` |
| Quote | `blockquote` (V2/V3) | `wrap_blockquote` |
| Code block | `code-block` (V2/V3), `policy: "reject_formatted"` | `set_code_block` |
| Divider | `horizontal-rule` (V2/V3) | `insert_horizontal_rule` |
| Table | `table` | `insert_blocks` |

Omitted from the shared catalog: **Collapsible section** and **Page break**
(rich V4 only; shared owners are V1–V3), and the structural items on a
V1 toolbar. There is no shared `@` mention menu: mentions are a V4 record and
shared editors do not admit V4.

Custom shared items implement `{id, label, keywords?, description?,
enabled(context), prepare(context)}`, where `context` is `{model, revision,
allocate}` and `prepare` returns `{commands, selectionUpdate?}` or `null`.
`onExecute` receives `{item, request, revision}`: the exact batch and the checked
revision.

Tests: `packages/breditor-editor/tests/shared_slash_commands.test.ts` (a real
`SharedDomEditor` over a fixture shared owner in jsdom: one-batch dispatch and one
Undo, the exact batch of every standard item, remote invalidation, remote
read-only, composition, refusal, async providers, catalog strings, SDK default
items), `shared_slash_commands_react.test.tsx`, and
`crates/breditor-collaboration/tests/shared_slash_batch_contracts.rs` (the same
batches against the real shared replica under explicit, natural-typing,
general-range and document-selection history: one group, exact Undo/Redo,
atomic refusal, peers without a local step). A real-browser shared run is not
yet covered (see below).

## Not covered or unverified

- **Real-browser behaviour.** Verification so far is jsdom only. Not yet checked
  in a real browser:
  - caret-rect positioning;
  - screen-reader announcement of `aria-activedescendant` on a contenteditable
    textbox;
  - Android and IME `beforeinput` arming when `/` comes through composition. A
    composed slash cancels and does not open.
  - the order of document-capture listeners against browser extensions.
- **Shared editors in a real browser.** The shared adapter is verified in jsdom
  with a fixture owner and its exact batches against the real Rust replica. No
  Playwright run covers it: the shared browser harness
  (`experiments/shared-browser`) needs the `target/collaboration-feasibility-web`
  Wasm build, and its `experiments/collaboration` crate did not compile for
  `wasm32-unknown-unknown` when this adapter landed (an outdated struct
  initializer unrelated to slash commands).
- **Mentions.** Rich V4 only (native `insertMention` locally, guarded
  `insert_mention` in shared V4, one Undo step); see RICH_LANGUAGE_V4.md slice 5
  and SHARED_RICH_V4.md. Host-declared mention trigger feeds (`@`, `#`, …) run
  beside this menu; a mention feed can never use the `/` trigger.
- No default menu styling theme or hotkey to open the menu without typing `/`.
