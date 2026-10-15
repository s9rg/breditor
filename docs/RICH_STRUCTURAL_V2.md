# Structural rich language V2

The opt-in Rust core, Wasm boundary and explicitly selected local SDK support
blockquotes, plain-text code, horizontal rules and tasks. Select native contracts
with `CompiledSchema::try_compile_rich_content_profile_v2`, or open the local SDK
with `richLanguage: 2`. Existing defaults stay V1. Shared model 11 still rejects V2
before seed parsing or engine import; this is not a shared structural release.

## Explicit local profile

```js
import {openLocalEditor, createStructuralLocalProfileV2} from '@breditor/editor';

const editor = await openLocalEditor({
  host: document.querySelector('#editor'), richLanguage: 2,
  initial: {kind: 'empty'}, onError: console.error
});
// Headless construction uses the same bounded native profile.
const profile = await createStructuralLocalProfileV2();
profile.dispose();
```

React accepts the same `richLanguage: 2` in `initialOptions`. Bootstrap V7 selects
the V2 language; a custom `profileBootstrapJson` must use that version. Low-level
factories are `compileStructuralRichProfileV2` and
`compileStandardStructuralRichProfileV2`. The latter composes standard inline V1.
`createStructuralRichToolbarV2` binds controls to that exact owner.

Document format 2, local checkpoint format 1 and rich ABI 1 retain their existing
meanings. The default V2 preset uses `breditor-editor/standard@2` and a distinct
fingerprint. V2 descriptors add `richLanguageVersion: 2` and runtime capability
`taskStructureVersion: 1`; V1 descriptors remain unchanged. The matching JavaScript
wrapper rejects older V2 runtimes lacking those task commands before creating an
owner or changing the host. The capability does not change schema identity or
checkpoint encoding. Old factories reject V7 and V2 checkpoints instead of migrating
or falling back. Keep the explicit language choice when reopening a saved session.

## Schema and identity

V2 has its own sealed capability marker and schema fingerprint. It does not widen
the V1 language, alter Document V2 envelopes, raise default resource limits or
migrate saved documents. `rich_content_revision()` returns the admitted language
revision; copying a marker into a different specification is not capability proof.
Stable block IDs and full candidate validation apply to every new subtree.

- `breditor/blockquote` has a nonempty rich flow body.
- `breditor/code-block` has only unformatted text and optional `breditor/language`.
- `breditor/horizontal-rule` is an empty atomic flow node.
- `breditor/task-list` contains one or more `breditor/task-item` children.
- Each task item requires Boolean `breditor/checked`, starts with a paragraph or
  heading, and may retain a rich flow tail, including nested tasks.

The new flow kinds can appear in the document, list-item tails, quotes, task
bodies and table cells. Nested tables remain forbidden even through intermediary
quotes or tasks. Image captions retain their original grammar.

## Code text and conversion

Code preserves Unicode, tabs and LF/CR exactly. It admits no inline formats;
nonempty pending typing formats reject while a caret is in code. `CodeLanguage`
accepts `[A-Za-z0-9][A-Za-z0-9+_.#-]{0,63}`, preserving case without trimming.
No language is `None`, not an empty token. A language is inert data, not HTML,
CSS, a URL or executable highlighter configuration.

`SetCodeBlock` converts a paragraph, heading or code block while retaining its
text identity. Callers choose `CodeFormatPolicy::RejectFormatted` or explicitly
request `RemoveFormats`. Removal is one undoable conversion; its inverse retains
the original styled node. `SetCodeLanguage` changes only the bounded language.
Existing prose split/join actions reject code rather than guess a language merge
or code-exit policy. Partial cross-block replacements with a code endpoint also
reject; same-block code editing and deletion of wholly intervening code are
separate operations. Code carets and intervals crossing code report inline
formatting as unavailable, not unset or a silently filtered partial selection.

Enter and Shift+Enter insert LF inside code. The Code block form requires an
explicit formatting-loss choice; Reject formatted text is its default. Paragraph
and Heading perform explicit whole-block conversion back to prose. Code language
is inert `data-language` metadata on semantic `pre`/`code` output; no highlighter
provider, executable code or arbitrary CSS is selected by that token.

## Named actions and history

Every new action has its own documented file under
`crates/breditor-core/src/rich_content/actions`:

- `set_code_block.rs` and `set_code_language.rs` own code conversion and metadata.
- `wrap_blockquote.rs` and `unwrap_blockquote.rs` retain the exact enclosed flow.
- `wrap_task_list.rs`, `unwrap_task_list.rs` and `set_task_checked.rs` retain task
  bodies, explicit identities and checked values.
- `insert_horizontal_rule.rs` and `delete_horizontal_rule.rs` own rule insertion
  and deletion. Deleting a sole flow child requires an explicit replacement.
- `split_task_item.rs` and `join_task_items.rs` own task head boundaries. Split
  retains left completion, creates an unchecked right task and moves the rich
  tail right. Join retains left completion; Undo restores both original values.
- `indent_task_items.rs` and `outdent_task_items.rs` own task nesting and removal.
  `exit_task_item.rs` separately guards exit from a truly empty task.

Task wrapping takes one explicit item ID and checked value per leading prose
block. Following non-prose flow stays in that task's body. No action manufactures
missing IDs, silently flattens tails or derives checked state from DOM elements.
Guarded node/flow patches validate complete candidates before publication; stale
observations and late invalid batch actions leave content and history unchanged.
Inverse actions retain exact source nodes, and recovered checkpoints preserve
future Undo/Redo. Code joins, general cross-container edits and collaboration
conflict policies are not implicitly supplied by these patches.

The Wasm command union exposes each named operation through a separate parsing
file. V2 flow drafts include `blockquote`, `codeBlock`, `horizontalRule` and
`taskList`; flow parents additionally include `blockquote` and `taskItem`.
Code drafts accept text and nullable language, not a formatted text payload.
Task item drafts require explicit checked state. Extra fields, missing nullable
fields, bad kinds and incompatible parent shapes reject before publication.

The local renderer uses semantic quote, code, rule and list elements. Task
checkbox pointer and Space activation submit an explicit checked value from the
current Rust view; the checkbox DOM is not document authority. Ordinary list
controls do not implicitly convert task completion into another list type.

## Task nesting and empty exit

Indent moves a contiguous task range into the preceding task's trailing task
list, preserving all completion values, descendant identities and rich bodies.
If that trailing task list exists, `nested` must be null; otherwise supply its
fresh identity. Earlier media, quotes, prose and ordinary lists keep their order.
The first task cannot indent without a preceding task.

Nested outdent promotes tasks into the outer task list. The last promoted task
receives the remaining nested suffix and then any flow that followed the nested
list in its former parent. This preserves depth-first reading order. Top-level
outdent removes the selected task wrappers and keeps every body block in its
actual document, quote, cell or ordinary-list-tail flow parent. A surviving prefix
keeps the original container identity. A surviving suffix uses that identity when
there is no prefix; provide a fresh `tail` identity exactly when both survive.
Undo restores all removed completion values and identities, not a guessed reverse
move. Ordinary list commands still reject task lists.

Browser Enter selects `exitTaskItem` only at a collapsed, empty leading prose
block with no rich tail. Nested exit promotes one level and retains completion;
top-level exit leaves the same paragraph or heading identity and kind outside
the task list. An empty head with media, quotes or nested content still splits
and moves that complete tail right. The explicit `insertParagraph` and
`splitTaskItem` commands remain split operations; headless callers request exit
separately. Rust rechecks the empty-exit precondition and full publication guard.
The explicit `splitTaskItem` point must match the current collapsed caret,
including affinity, so its typing-format context cannot come from another point.
Set the logical selection first when requesting a different split position.

The existing Indent and Outdent controls prepare either ordinary-list or task
commands for the selected owner. Tab and Shift+Tab prepare task indentation and
outdent from prose. Focused native widgets do not route navigation or deletion
into a still-selected grid or node. Backspace/Delete on checkboxes and buttons
are cancelled to prevent document deletion and accidental browser navigation;
text fields retain native value editing. Editor Undo/Redo stays available for
checkbox changes. Code has no implicit task-indentation meaning. Composition keys and modified Tab keys
are not task commands. Each accepted operation is one local history group and
retains exact future Undo/Redo after checkpoint recovery. These are local V2
contracts, not shared conflict rules or native input/accessibility qualification.

## Hard breaks in the existing language

Local `RichLocalSession::insert_hard_break` and shared
`RichReplica::insert_hard_break_guarded` replace a supported text selection with
exactly one U+000A in one history group. LF was already legal in V1; no new AST
node, block identity or wire operation is introduced. The logical start's typing
formats are retained and the caret advances by one UTF-16 unit. Structural Enter
remains a separate command.

The matching Wasm command is `{kind: 'insertHardBreak'}` with no payload; extra
fields reject. Browser Shift+Enter invokes this command before a browser can
translate the key into structural paragraph insertion. Composition keys and grid
Enter retain their separate handlers. A distinct `beforeinput` replacement range
is honored without first moving the visible logical caret. Installed regression
tests cover both paths; synthetic events and automation keys are not native IME
qualification or a repair claim for the historical intermittent WebKit fault.

## Tests and remaining integration

`crates/breditor-core/tests/rich_structural_v2.rs` covers V1 isolation, malformed
properties and task heads, active resource limits, nested-table rejection,
code format loss, stable selections, stale and late-batch rejection, rule
replacement, rekeyed clipboard, task boundaries and exact future history.
`crates/breditor-wasm/tests/rich_structural_v2.rs` checks explicit V7 factories,
closed commands/drafts and recovered history. Installed vanilla/React scenarios
live in `experiments/editor-browser/structural-v2.spec.mjs`. Shared profile tests
prove early rejection of this not-yet-supported shared language.
`crates/breditor-core/tests/rich_task_structure_v2.rs` checks nesting, actual flow
parents, empty exit, checked values, ordering, active limits, atomic rejection and
exact future history. Installed keyboard, toolbar and React regressions are in
`experiments/editor-browser/task-structure.spec.mjs`.

Next, define V2 shared operation/conflict and journal compatibility contracts.
Code exit-to-new-block shortcuts and complete atomic-block caret navigation still
need explicit actions and integration.
Atomic-block navigation, general selections, typing coalescing, live read-only
mode, bounded layout properties and sanitized foreign interchange remain in the
active first-two-workstream goal. These local controls alone do not satisfy it.
