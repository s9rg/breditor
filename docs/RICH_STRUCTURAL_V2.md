# Native structural rich language V2

The opt-in Rust core now has explicit contracts for blockquotes, plain-text code,
horizontal rules and tasks. Select them with
`CompiledSchema::try_compile_rich_content_profile_v2`. This is a native foundation,
not the completed browser or collaborative feature: the existing Wasm/SDK factories
remain V1 and shared model 11 rejects V2 before seed parsing or engine import.

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
or code-exit policy. Those keyboard rules remain browser/shared integration work.

## Named actions and history

Every new action has its own documented file under
`crates/breditor-core/src/rich_content/actions`:

- `set_code_block.rs` and `set_code_language.rs` own code conversion and metadata.
- `wrap_blockquote.rs` and `unwrap_blockquote.rs` retain the exact enclosed flow.
- `wrap_task_list.rs`, `unwrap_task_list.rs` and `set_task_checked.rs` retain task
  bodies, explicit identities and checked values.
- `insert_horizontal_rule.rs` and `delete_horizontal_rule.rs` own rule insertion
  and deletion. Deleting a sole flow child requires an explicit replacement.

Task wrapping takes one explicit item ID and checked value per leading prose
block. Following non-prose flow stays in that task's body. No action manufactures
missing IDs, silently flattens tails or derives checked state from DOM elements.
Guarded node/flow patches validate complete candidates before publication; stale
observations and late invalid batch actions leave content and history unchanged.
Inverse actions retain exact source nodes, and recovered checkpoints preserve
future Undo/Redo. Code joins, general cross-container edits and collaboration
conflict policies are not implicitly supplied by these patches.

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
replacement, rekeyed clipboard and exact future history. Shared profile tests
prove early rejection of this not-yet-supported language.

Next, expose an explicitly selected V2 profile through Wasm and the SDK, define
its shared operation/conflict and journal compatibility contracts, then add
rendering, controls, task keyboard behavior and installed three-engine tests.
Atomic-block navigation, general selections, typing coalescing, live read-only
mode, bounded layout properties and sanitized foreign interchange remain in the
active first-two-workstream goal. The native contracts alone do not satisfy it.
