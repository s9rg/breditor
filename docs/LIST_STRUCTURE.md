# Advanced list structure: multi-block items, skip-level lists, legal numbering

Audit row `list-structure-advanced` (and the legal-numbering part of
`list-properties`). This document records which of the three capabilities fit
the existing, frozen rich languages and which need a new language version, what
is implemented, and the precise V5 candidate for the rest.

Comparison targets:
[CKEditor 5 list editing](https://ckeditor.com/docs/ckeditor5/latest/features/lists/lists-editing.html)
(multi-block items on by default, `multiBlock: false` for simple lists;
"press Enter for a new line, then Backspace to remove the list item marker";
`list.enableSkipLevelLists` with placeholder `<li style="list-style-type:none">`
items in HTML),
[CKEditor 5 multi-level lists](https://ckeditor.com/docs/ckeditor5/latest/features/lists/multi-level-lists.html)
(legal `1`, `1.1`, `1.1.1` counters, `multiLevelList` command, Word-compatible;
with skip-level lists skipped levels count as `1`), and
[Tiptap ListItem](https://tiptap.dev/docs/editor/extensions/nodes/list-item)
(content `paragraph block*`; Enter `splitListItem`, Tab `sinkListItem`,
Shift+Tab `liftListItem`).

## Decision summary

| Capability | Admitted today? | Delivered | Needs |
| --- | --- | --- | --- |
| Multi-block items (a paragraph, then more blocks; a paragraph after a child list) | **Yes**, in rich V1–V4 | Native editing commands, keyboard, history, shared parity, interchange tests | nothing |
| Legal multi-level numbering (`1.2.3.`) as a presentation of nested ordered lists | Derivable, no stored data | Opt-in render/static option, local and shared | nothing (presentation only) |
| Legal numbering stored in the document | No | — | V5 property (below) |
| Skip-level nesting (an item that only holds a deeper list) | **No**, in any rich language | — | V5 grammar change (below) |

V4 stays frozen: no grammar, fingerprint, rule revision or golden checkpoint
changed. Every new behaviour is either a new native edit over shapes V1–V4
already admit, or presentation.

## Grammar analysis

**Rich languages V1–V4.** `breditor/list-item` children are one flow group
(`rich_content_profile.rs`, unchanged in V2–V4 except for the flow kinds V2 and
V4 add), and the sealed rich rule only requires the *first* child to be a
paragraph or heading. So an item is exactly Tiptap's `paragraph block*`:
leading text block, then any flow (paragraphs, headings, lists, images, quotes,
code, rules, task lists, tables, V4 sections) in any order, including a second
paragraph after a child list. V2 task items have the same shape. Rendering,
selection, typing, clipboard, search, block move and the HTML/Markdown/DOCX
codecs already handled such items; what was missing was a way to *create* and
*dissolve* them from the keyboard without the paste path.

**The experimental nested-list profile** (`docs/NESTED_LISTS.md`,
`schema/nested_list_profile.rs`) is a different, older profile: "exactly one
leading paragraph or heading, then zero or more child lists". That is the
sentence the audit row quoted. It does not constrain the rich languages and is
not changed here.

**Skip-level nesting.** CKEditor represents a skipped level as an item with no
content of its own whose only child is the deeper list. Every rich language
rejects an item whose first child is not a text block, so there is no admitted
encoding. The nearest admitted shape — an item with an empty leading paragraph
and a child list — renders a visible empty marker line and is semantically an
empty item, not a skipped level. Skip-level therefore needs a grammar change.

**Legal numbering.** A legal marker is a pure function of admitted structure:
each ordered list's own `start` and (V4) reversal give an ordinal per item; an
ordered list that is a direct child of an ordered list's item prefixes its
parent's marker. No stored field is needed to draw it, so it can be a rendering
mode. What a rendering mode cannot do is travel with the document (another
host, an export) — that needs a stored property, which is a new value domain and
therefore V5.

## Implemented: multi-block item editing

### Native actions (Rust core)

- `JoinListItems::capture_blocks(document, container, left, right)` — merge the
  right item into the left one **as later blocks**: every right block, its
  leading paragraph included, keeps its identity and text and follows the left
  item's flow. Unlike `capture`, text is never concatenated.
- `SplitListItem::capture_block(document, block, new_item)` — `block` must be a
  paragraph or heading that is a direct, *non-leading* child of a list item. It
  and every later block of that item move, with identities, into one fresh
  sibling item `new_item` inserted right after. No text is split or copied.

Both reuse `ListBoundaryPatch`: one guarded node patch on the list with an exact
inverse (the two are each other's inverse: `RichAction::JoinListItems` ↔
`RichAction::SplitListItem`), selection mapping by stable identity, admission
against the complete grammar (a reused `new_item` or a stale list is refused and
nothing changes), one history group per command, and replay through the
existing `RichAction` variants — no new action variant, operation codec or
session checkpoint format.

### Commands

| Surface | Command |
| --- | --- |
| Local Wasm/TS | `{kind:"joinListItems",data:{container,left,right,blocks:true}}` (absent `blocks` keeps the original text join and the exact old JSON) |
| Local Wasm/TS | `{kind:"splitListItemBlock",data:{block,newItem}}` (new tag, appended) |
| Shared Rust/TS | `join_list_items` gains `blocks` (`serde(default)`, skipped when false, so existing command JSON and suggestion records are byte-identical) |
| Shared Rust/TS | `split_list_item_block {block,new_item}` (new `Command::SplitListItemBlock`, appended) |

Shared commands run the same core capture and publish only list/placement
consequences through `list_structure::publish` (no text is lowered); the moved
block is retained with `retain_text` first so a normalization identity is never
duplicated. Remote typing in a moved block survives both the edit and its Undo.
The shared commands apply to every shared rich language (multi-block items exist
from V1), not only V4. Suggestions/read sets and declared-target checks know the
new command.

### Keyboard (local and shared, same rules)

| Key | Where | Result |
| --- | --- | --- |
| Enter | empty *later* paragraph/heading of a list item | `splitListItemBlock`: it and following blocks become a new sibling item (CKEditor: Enter in an empty block of a multi-block item) |
| Enter | nonempty later paragraph | unchanged: a new paragraph inside the same item |
| Enter | leading block | unchanged: split into a new item; an empty leading block keeps its existing exit behaviour |
| Backspace | start of an **empty** leading block of a non-first item | `joinListItems` `blocks:true`: the marker goes, the empty paragraph becomes a later block of the previous item (CKEditor's "Enter, then Backspace") |
| Backspace | again, at the start of that later paragraph | unchanged `joinTextBlocks` with the block before it, so two Backspaces equal the old single join |
| Backspace | start of a nonempty leading block | unchanged text join |
| Tab | any block of an ordinary list item, not the first item | `indentListItems` (whole item, all blocks) — previously only task items handled Tab |
| Shift+Tab | any block of an item in a **nested** ordinary list | `outdentListItems` |
| Tab / Shift+Tab | first item, top-level Shift+Tab, outside a list | not captured: focus navigation is kept |

Each key is one native command and one Undo step. Task items keep their
existing task Tab/Enter/Backspace rules; the multi-block Enter/Backspace rules
apply to ordinary lists only.

### Interchange (already correct, now pinned by tests)

- HTML import maps `<li><p>…</p><p>…</p><ul>…</ul><p>…</p></li>` to one item
  with four children without notices; export writes the same structure and
  round trips exactly.
- Markdown export writes loose CommonMark items with continuation blocks
  indented to the marker width (`2. one\n\n   two\n\n   - child\n\n   three`),
  and Markdown import restores the same item.
- DOCX export gives the leading paragraph the item's `w:numPr` and later
  paragraphs no numbering with `w:ind w:left` at the item's indent (Word's
  continuation-paragraph convention).

## Implemented: legal numbering presentation

`legalListNumbering: true` on `RenderOptions` (so on `mountRichEditor`, the
shared DOM editor, and the SDK `createLocalEditor` / shared session options) and
on `renderStaticDocument` options.

- `legalListMarkers(root)` / `legalListMarkersWith(root, reader)` derive the
  markers: each ordered list's own start and reversal give the ordinal; an
  ordered list that is a direct child of an ordered list's item continues the
  parent marker; any other placement (bullet/task item, quote, section, cell,
  root) starts a new chain. Components are always decimal, as Word's legal
  numbering forces (`w:isLgl`), so a V4 letter/roman style is not shown in this
  mode; the native `type`/`start`/`reversed` attributes stay on the `<ol>`.
- Rendering adds `data-rich-legal` and `role="list"` on ordered lists and
  `data-rich-legal-marker="4.2.1."` on their items. The stylesheet
  (`richLegalListStyles`, included in the local and shared editor styles)
  hides the native marker and draws the attribute as an absolutely positioned,
  non-selectable `::before` gutter label. No text enters the editable DOM, so
  caret offsets, typing, IME, search, clipboard and the document are unchanged.
- Markers are recomputed on every render, so they follow indent/outdent,
  splits, joins, remote edits and Undo.
- The static renderer emits identical attributes (a parity test compares them)
  and, unless `fragment`, a `<style data-breditor-legal-lists>`.
- Off (the default), live and static output are byte-identical to before.

Limits: it is a host/editor choice, not part of the document, so HTML/Markdown/
DOCX exports carry ordinary nested ordered lists (each list numbered on its
own). Generated content is exposed differently by screen readers; spoken
qualification is not done.

## V5 candidate (not started; a decision for the owner)

Both remaining items change sealed rules, so they belong to a new rich language
V5 = V4 + these slices, with its own bootstrap format, fingerprint and rule
revision. V1–V4 stay exact. Each slice is small; skip-level is the larger one
because of shared normalization.

### Slice A: skip-level items

- **Grammar delta.** The list-item rich rule becomes: the first child is a
  paragraph or heading (unchanged), **or** the item is a *skip item* whose only
  child is one `bullet-list`/`ordered-list`. Child grammar (one flow group) is
  unchanged; only the sealed rule revision moves. Task items unchanged.
- **Numbering.** A skip item consumes its ordinal exactly like the HTML
  placeholder `<li>` (so `start + items − 1` ceilings stay as they are), shows
  no marker of its own, and in legal mode its component is still counted
  (CKEditor's "skipped levels are filled with 1" when the skip item is first).
- **Commands.** `indentListItems` gains an optional `skipItem: BlockId`: indenting
  the *first* item of a list (refused today) wraps the run into `nested` inside a
  fresh skip item `skipItem`. `outdentListItems` that empties a skip item removes
  it in the same patch. Exact inverses are node patches as today; no new
  `RichAction` variant beyond the capture parameters. Backspace at the start of
  the first item inside a skip item outdents it. A caret can never be in a skip
  item (it has no text); selection mapping of a removed skip item is identity
  free.
- **Interchange.** HTML export `<li style="list-style-type:none"><ol>…</ol></li>`
  (CKEditor-compatible); HTML import maps an `<li>` whose only rendered content
  is a nested list (and the Google Docs/Cocoa "list directly in list" shape,
  which today synthesizes an empty paragraph with a `block-structure` notice) to
  a skip item for a V5 owner. Markdown has no skip level: `markdown-feature`
  notice and safe HTML fallback. DOCX export writes no paragraph for the skip
  item, so the deeper item's `w:ilvl` jumps, which Word renders natively.
- **Shared encoding.** A skip item is a list-item metadata owner with no head.
  The shared adapter reserves a derived default head for every list item
  (`list_structure::derived::reserve_default`); V5 must mark skip items with an
  owned `skip-level` field so no head is materialized, refuse text commands that
  target the virtual head, and normalize a skip item that loses its only list
  through concurrent edits (the same derived-normalization path as empty heads).
  New shared protocol revision; V4 replicas never see the field.

### Slice B: stored legal numbering

- **Property delta.** Optional `breditor/list-legal` (only `true`; absence is
  off) on `breditor/ordered-list`, meaningful on the outermost ordered list of a
  chain; nested ordered lists directly in its items inherit it. Rendering is the
  presentation above, driven by the document instead of a host option.
- **Commands.** `setListNumbering` patch gains `legal: keep | true | false`, in
  the same history group as style/reversal/start; a numbered-to-numbered list
  kind change keeps it, converting to bullets removes it; split tails keep it.
- **Interchange.** HTML export adds `data-breditor-list-legal` plus explicit,
  inert marker text in a `<span class="breditor-legal-marker">` for consumers
  without the stylesheet (CKEditor writes marker elements likewise); import of
  that attribute and of Word `mso-list` level text `%1.%2.` sets the property.
  DOCX export binds every list of a chain to one `w:num` whose abstract levels
  carry `w:isLgl` and `lvlText` `%1.%2.…` with per-level `startOverride`.
  Markdown: `markdown-feature` notice with HTML fallback.
- **Shared encoding.** One owned field like `list-style` (`property:breditor/list-legal`
  in the list's `effects` map), merged last-writer-wins per field.

## Tests

- Rust core `tests/rich_flow_actions.rs`: block join keeps the right head and
  maps the caret; block split is its exact inverse, keeps the ordered start,
  moves following flow and refuses heads, media, missing blocks and reused
  identities; local owner history makes each edit one exact step.
- Wasm `tests/rich_editor.rs`: `joinListItems` `blocks:true` and
  `splitListItemBlock` round trip through Undo/Redo; unknown fields, a head
  target and a missing `newItem` are refused without change.
- Collaboration `tests/rich_replica_list_contracts.rs`: block join/split with
  concurrent remote typing, checkpoint restore, Undo/Redo and convergence;
  exact old `join_list_items` JSON and strict decoding of the new command.
- Vitest: rich-content `tests/list_structure.test.ts` (keyboard intents, Tab,
  legal markers, live/static parity, default output exact), interchange
  `tests/list_structure.test.ts` (HTML, Markdown, DOCX).
- Playwright `experiments/rich-browser/list-structure.spec.mjs` (Chromium,
  Firefox, WebKit) over the real Wasm V4 owner: Enter/Backspace/Enter with real
  keys and Undo, Tab/Shift+Tab in a later block, legal markers through edits and
  Undo with an unchanged document.
