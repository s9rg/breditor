# Restricted editing

Restricted editing lets a host open a document in which only named regions can be
edited, like a form or template. Everything else can still be selected and
copied, but not changed. Rust decides what is allowed: the policy is a live
host input to the native owner. It is not a document property, a toolbar flag or
a set of nested `contenteditable` islands.

Compared with [CKEditor restricted editing][ck] and [Tiptap Content
Protection][tt]:

- **Shared with CKEditor:** restricted mode, Tab/Shift+Tab between editable
  regions, and authoring controls disabled outside them.
- **Shared with Tiptap:** the policy lives outside the schema, and requests are
  admitted or refused as a whole (a paste over editable and protected content
  changes nothing).
- **Same limit as both:** the policy runs on the client for that client's own
  edits. Incoming peer changes are not filtered (see
  [Shared editors](#shared-editors-and-authority)).
- **Different:** regions are block subtrees, not inline marker ranges; see
  [Inline exceptions](#inline-exceptions-v5-delta).

[ck]: https://ckeditor.com/docs/ckeditor5/latest/features/restricted-editing.html
[tt]: https://tiptap.dev/docs/composable-docs/content-protection/getting-started/overview

## Model: a policy outside the frozen grammar

The [frozen V4 grammar](RICH_LANGUAGE_V4.md) stays unchanged. Every non-root
rich node (flow block, list item, table, row, cell, image, caption) already
carries a retained `block-id`. A policy names editable regions by those ids:

```json
{"format":"breditor/rich-restricted-policy","formatVersion":1,"editable":["field","cell-7","tail"]}
```

- A **region** is the complete subtree of a named node. Ids absent from the
  current document are kept but have no effect. A named node inside another
  region adds nothing, because the outermost region wins. A policy may name at
  most 4096 ids (`RICH_RESTRICTED_MAX_REGIONS`).
- **Admission compares effects.** The single rule is
  `RichRestrictedPolicy::admits(before, after)`. The candidate document must
  equal the current one everywhere outside the outermost regions, including
  order, kinds, properties and text. Each region root must keep its id and its
  position. Inside a region anything may change, including the root's own
  properties (heading level, layout, list kind).
- Because the rule judges the complete result, it covers every command family
  without a command allow-list. That includes typing, deletion, Enter, paste,
  drop, formatting, case change, search replace, input rules, slash composites,
  atom and table edits, block moves, document-scope commands, Undo and Redo.
  New commands are covered automatically.

This design is preferred over storing exceptions in the document for three
reasons. Inline-extension formats would change the schema fingerprint, which is
a V5 change. They would also make the permission travel with copied content.
And any author with an ordinary formatting command could add or remove them.

## Behaviour

| Situation | Behaviour |
| --- | --- |
| Caret or range inside one region | Every command is admitted by its effect. |
| Selection spanning protected content, or two regions | The selection is kept (reading and copying still work). Authoring is **refused whole, never clamped**: clamping would silently change what the user asked for. Action state reports `selectionEditable: false`. |
| Enter inside a leaf region (a paragraph) | Refused: splitting would create a sibling block outside the region. A leaf region therefore behaves like an inline field. Use a container (table cell, list, section, the table itself) to allow new blocks. |
| Enter inside a container region | Admitted: the new block stays inside the subtree. |
| Backspace at a region's start, or Delete at its end | Refused when it would merge with or remove protected content. Deleting inside the region is admitted. |
| Paste or drop | Admitted only when its complete effect stays inside one region, so a mixed paste is refused whole. Rich, plain and document-scope paste all follow the same rule. |
| Block drag or move | Moving a region root or any protected block is refused. Moving inside a container region is admitted. |
| Formatting | Admitted inside a region. A formatting request whose coverage touches protected text is refused whole. |
| Pending styles | An explicit pending-style change requires the caret or selection to lie inside one region. Mapped styles follow admitted edits. |
| Mixed requests | A dispatch whose actions touch both editable and protected content is refused atomically. No partial content, selection, history or revision is published. |
| Undo and Redo | Each history unit is authorized like a new edit, by its complete effect. A unit that would change protected content is refused. This covers changes made before the policy was installed, or while it was lifted. The history cursor does not move, and later regions remain usable. Clearing the policy restores ordinary history. |
| Read-only | Read-only takes precedence. A locked owner refuses everything, including edits inside regions. |
| Refusals | Local Wasm and SDK calls fail with `breditor_rich.restricted`. Shared calls fail with `Error::Restricted`. |

### Navigation and presentation

- `navigateRestrictedRegion(forward)` selects the next or previous outermost
  region in document order, with no wraparound. A text region root (paragraph,
  heading, code, summary) is selected whole, so typing replaces the field.
  Other regions get a caret at the start of their first text block, or a node
  selection when they contain no text.
- In restricted mode, Tab and Shift+Tab call navigation instead of the list,
  task or grid Tab behaviour. At either end the key is not consumed, so focus
  can leave the editor.
- Toolbar and borrowed authoring controls are disabled whenever the
  Rust-derived `restricted.selectionEditable` is false. Controls marked
  `readOnlySafe: true` stay enabled. This flag is advisory only and never
  exempts a native mutation.
- The surface gets `data-rich-restricted`, and region roots (and covered table
  cells) get `data-rich-editable-region`. The optional
  `richRestrictedEditingStyles` sheet draws a dashed outline. This is
  presentation only: the surface stays one `contenteditable` host.

## API

| Layer | Surface |
| --- | --- |
| Rust core | `RichRestrictedPolicy::{try_new, admits, regions, region_of, selection_is_editable, adjacent_region, region_selection}`. `RichLocalSession::{set_restricted_editing, restricted_policy, navigate_restricted_region}`. `RichLocalSnapshot::{restricted_policy, selection_is_editable}`. `RichLocalSessionError::Restricted`. |
| Local Wasm | `restrictedEditingVersion() === "1"`, `setRestrictedEditing(observation, policyJson \| "null")` (returns `"true"` or `"false"`), `navigateRestrictedRegion(observation, forward)`. The view has `restricted: {editable, selectionEditable}` only while a policy is set. |
| JS core | `supportsRestrictedEditing()`, `setRestrictedEditing({editable} \| null, expectedRevision?)`, `navigateRestrictedRegion(forward, expectedRevision?)`. |
| DOM editor | `RichDomEditor.setRestrictedEditing(policy \| null, revision?)` and `.navigateRestrictedRegion("next" \| "previous", revision?)`. A policy change cancels queued edits and composition, as a read-only change does. |
| SDK | `openLocalEditor({restrictedEditing: {policy: {editable: [...]}}})` validates the policy before any runtime work. It applies the policy after `readOnly` and before mount, and refuses runtimes without the capability. `LocalEditor` and `LocalDocumentEditor` add `setRestrictedEditing` and `navigateRestrictedRegion`. |
| Shared Rust | `RichReplica::{set_restricted_editing_guarded, set_restricted_editing_json_guarded, restricted_policy, restricted_selection_editable}` and `Error::Restricted`. The shared view has the same `restricted` field. |
| Shared Wasm | `SharedEditorOwner.restricted_editing_version()` and `set_restricted_editing(observation, policyJson)`. |

A policy change works like a read-only change. It is an effective publication:
the revision and opaque observation advance and `readOnlyRevision` records the
transition, so prepared and asynchronous work is fenced. Repeating the same
policy is a true no-op. Content, selection, pending styles, history, writer
clocks and replicated operations are unchanged.

## Shared editors and authority

The shared owner evaluates the same `admits` rule on every local adoption. That
covers generic commands, typing, general ranges, search, review acceptance,
pending styles and selective Undo/Redo. A candidate is refused before it is
published, so nothing replicates.

Incoming peer frames and retained-branch unions go through `adopt_incoming` and
are **not** filtered by this host's policy:

- The policy is a host input of one client, not room state. Peers may have
  other roles, such as a template author.
- Filtering a causal merge locally would make replicas diverge.

The policy is never replicated, journaled or checkpointed. Each host applies
its own policy when it opens an owner, and again after any restore.

To make the policy **room authority**, the relay must enforce it before it
accepts a writer group:

1. Keep a per-room, per-role policy from the authenticated host.
2. Materialize the room document before the group and with it.
3. Call the same pure `RichRestrictedPolicy::admits(before, after)`.
4. Reject the whole group on failure, as for an unauthorized writer.

Policy changes must be ordered with the room's accepted operations; a policy
read at admission time is enough. Relay enforcement is **not implemented**. The
relay currently enforces only writer and reader roles.

Shared DOM wiring is also not implemented yet: Tab navigation, toolbar
disabling and region marking in the collaboration controller, and an SDK
`openSharedEditor({restrictedEditing})` option. The native shared enforcement
and its Wasm setter are in place.

## Persistence

Persistence is the host's job:

- The policy is not saved in documents, checkpoints, records or journals.
- Restored owners start unrestricted, so a host must reapply its policy before
  exposing a recovered owner. The SDK option does this at opening.
- A host that needs a durable policy stores it next to the document and treats
  it as host data.
- Older runtimes lack `restrictedEditingVersion`. The SDK refuses rather than
  opening such a runtime unrestricted.

Restricted editing is cooperative application behaviour, not a security
boundary against the host or other writers. Server-side authority needs the
relay enforcement described above.

## Inline exceptions (V5 delta)

CKEditor's inline exceptions mark a span inside protected text. That needs a
stable inline anchor that survives edits around it. Rich V4 has no such anchor:
text points are offsets, and bookmarks are single points, not ranges.
Supporting inline exceptions therefore needs a grammar change, so it is
specified here as a **V5 delta** and not implemented:

- An inline `breditor/editable-range` mark kind. It carries a retained
  `range-id` and is excluded from clipboard export by default. Its schema entry
  changes the fingerprint, hence V5.
- The policy can then name `range-id`s next to block ids. Admission extends to
  "outside the regions and outside the named mark spans", using the mark's
  causal boundaries in shared rooms.
- Typing at a mark boundary extends the span inward only; affinity follows the
  existing mark expansion rules.

Until then, use block-level regions, where a leaf paragraph acts as a field.

## Tests

- `crates/breditor-core/tests/rich_restricted_editing.rs` (9 tests). Typing,
  hard breaks and deletion; cross-region selections; Enter, Backspace and move
  at boundaries, with container versus leaf regions and region-root properties;
  atomic mixed dispatch; pending styles; Undo/Redo authorization across policy
  changes; Tab order; publication and no-restore; the region bound.
- `crates/breditor-wasm/tests/rich_restricted_editing.rs`. Policy JSON
  admission, the view field, the `breditor_rich.restricted` code and navigation
  ends.
- `crates/breditor-collaboration/tests/restricted_editing_contracts.rs` (3
  tests, both shared models, with a research shim). Local, mixed, pending and
  history refusal; incoming peer changes not filtered; the additive JSON and
  view field.
- Vitest: `restricted_editing.test.ts` in `breditor-experimental-rich-content`
  (presentation) and in `breditor-editor` (SDK option order, validation and
  capability refusal).
- `experiments/rich-browser/restricted-editing.spec.mjs` runs in Chromium,
  Firefox and WebKit. It covers keyboard typing and refusal with toolbar state,
  Backspace at a boundary, Tab/Shift+Tab order and focus leaving at the end,
  field paste versus refused mixed paste, and Undo/Redo authorization.
