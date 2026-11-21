# Shared rich language V4 (foundation)

Shared V4 lets a collaboration room hold, replicate, persist and replay documents
that use any of the eight frozen V4 slices ([RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md)):
ordered-list numbering, text-run language, image links, collapsible sections,
mentions, table captions, page breaks and bookmarks with internal links.

**Status (November 20, 2026): foundation.** The shared language, its causal model,
journal, persistence, Wasm/SDK selection and relay rooms exist and converge
exactly. Generic shared editing (typing, inline formats, structure commands,
clipboard, history, checkpoints, relay frames) works on V4 documents. The
structure commands (wrap/unwrap sections, page breaks, table captions) are
[below](#structure-commands-sections-page-breaks-table-captions); the other
per-slice shared commands and toolbar controls (set list numbering, set text
language, image link, open sections, insert mention, bookmark/rename/link) are
the next round. Until then V4 slice values arrive only by seeding,
restore, rich clipboard and generic block insertion, and are then edited with
the generic commands below. The browser harness qualification of shared V4 is
also still open (see [Remaining work](#remaining-work)). The inline slice commands
(text language, mentions with the `@` menu, image links) have since landed; see
[Shared inline commands](#shared-inline-commands-text-language-mentions-image-links).

**Block fields (same day).** List numbering, bookmarks with internal links and
section open state now have shared commands and toolbar controls; see
[Block-field commands](#block-field-commands-list-numbering-bookmarks-sections).

## Selector

Shared V4 follows the V2/V3 precedent exactly: an explicit selector, its own
causal model and journal, no implicit migration.

| Layer | Shared V4 |
| --- | --- |
| Configuration | `breditor/shared-rich-profile` **format 4** |
| Rust | `SharedRichProfile::from_configuration_json_v4`, `from_standard_configuration_json_v4`, `from_schema_v4` (requires `rich_content_revision() == Some(4)`) |
| Causal model / journal | **model 14**, **journal 15** (marker `binding/model-version = "14"` written at genesis) |
| Descriptors | `richLanguageVersion: 4`, `blockLayoutVersion: 1`, and `listNumberingVersion`, `textLanguageVersion`, `imageLinkVersion`, `detailsVersion`, `mentionVersion`, `tableCaptionVersion`, `pageBreakVersion`, `bookmarkVersion` all `1` |
| Wasm | `SharedRichProfile.from_configuration_json_v4` / `from_standard_configuration_json_v4`; owner `rich_language_version()` (`"4"`), `block_layout_version()` (`"1"`) and the eight slice `*_version()` reads (`"1"`, `"0"` on V1–V3 owners) |
| TypeScript | `compileRichSharedProfileV4`, `compileStandardRichSharedProfileV4`, `SharedRichEditor.supportsRichLanguageV4()`, `createRichSharedToolbarV4`, `isSharedRichLanguage`, `sharedModelVersion`, `sharedJournalVersion` (`@breditor/collaboration`); `createRichSharedProfileV4`, `richSharedProfileConfigurationV4` (`@breditor/editor/collaboration`, schema `breditor-editor/standard@4`) |
| SDK openings | `openSharedEditor`, `openSharedSearchEditor`, `openSharedDocumentEditor`, `openSharedDocumentSearchEditor` accept `richLanguage: 4`; omitted still means 1, and anything outside 1–4 is refused before the host is claimed |
| Persistence | `SharedPersistentSession` (`richLanguage: 4`), search, reviewed, segmented, backup and inventory records bind language 4 to model 14 / journal 15 |
| Relay | `Room::create_language_v4` (`init-v4`) and `create_standard_language_v4` (`init-standard-v4`), durable seed tag `seedLanguageV4`, `AtomicTransportProfile::LanguageV4` |

**The shared grammar is the frozen local grammar.** The V4 configuration compiles
through `CompiledSchema::try_compile_rich_content_profile_v4`, the same compiler
entry, sealed rule revision 4 and fingerprint as local V4. Tests prove the shared
fingerprints equal the frozen lock for `example/layout@1` (bare and standard) and
for the stock `breditor-editor/standard@4` (`sha256:7ac98189…ccc77`). A shared V4
document therefore is a local V4 document byte for byte.

**Refusal in both directions.** Older constructors (V1–V3 factories,
`from_schema*`) refuse a V4 schema; V4 constructors refuse configuration formats
1–3 and 5. A V3 runtime refuses V4 frames, journals, checkpoints and documents
(the frame and journal carry model 14 / journal 15 and the V4 fingerprint). A V4
owner refuses V3 frames, journals and raw engine imports (the immutable
`model-version` marker differs) before adoption. Older relays cannot parse the new
`seedLanguageV4` record or `languageV4` transport profile and refuse the room;
V3 rooms refuse V4 writer groups and V4 rooms refuse V3 writer groups.

## Replica representation

V4 reuses the existing shared primitives; no new root container exists.

| V4 feature | Shared encoding | Concurrency |
| --- | --- | --- |
| `breditor/details` | an ordinary structural node (tree occurrence + placement) | moves follow the placement resolver |
| `breditor/details-summary` | a text block (`protocol.text`): a Loro text container, text-flow fragments and a `text-kind` field; it owns **no** layout fields | text merges per character |
| `breditor/page-break` | a root-only structural node | placement suspends any non-root candidate |
| table caption | a `breditor/paragraph` child of `breditor/table` (placement admits rows and paragraphs under a table) | rows are always projected before it |
| `list-style`, `list-reversed` | one independently owned field each (`property:breditor/list-style`, `property:breditor/list-reversed`) on the ordered list, or immutable creation defaults | per-field register order |
| `image-href` + `image-link-new-window` | one paired field `image-link` (like `image-alt`, `image-asset`, `image-size`), so href and new-window are one atomic choice | per-field register order |
| `details-open` | one owned field `property:breditor/details-open` | per-field register order |
| `bookmark` | one owned field `property:breditor/bookmark` on the text block (or a creation default); splits never copy it | per-field register order, plus document-order uniqueness |
| `breditor/text-language` | an ordinary typed inline-format annotation | per character, the highest causal stamp of the kind wins (as every valued format) |
| `breditor/mention` | an ordinary typed inline-format annotation over the exact `@label` text | as above, plus the atomicity repair |
| internal links | the standard `breditor-inline/link` annotation with `#name` | as every inline format |

Same-field conflicts use the existing deterministic register ordering (the
policy of block layout V3): the contribution with the highest causal stamp wins,
disjoint fields merge, selective Undo removes only the author's contribution and
removal is an authored contribution. Inapplicable values stay causal but never
project: `list-style`/`list-reversed` project only on an ordered list (as
`code-language` projects only on a code block), so converting a numbered list to
bullets and back keeps them for Undo without ever admitting them on a bullet list.

## Merge admission and repairs

Every peer projects the converged replica through one pure function, then admits
it with the exact frozen V4 codec and rules. Two individually admitted concurrent
edits can still combine into a document the V4 grammar forbids; such a merge must
never make a peer refuse the update (that would split the room). The V4
projection therefore applies a fixed, deterministic set of repairs (module
`rich_replica/v4_projection.rs`). Repairs only choose how retained state is
shown; they never delete causal state, so a later edit or selective Undo can make
the content visible again.

| Invariant | Merge repair (all peers identical) |
| --- | --- |
| **Bookmark uniqueness.** Names are document-unique. | Concurrent blocks carrying one name: the first block in document pre-order keeps it, later blocks project without it. If the winner is later removed (Undo, delete), the next block's retained name becomes visible again. |
| **Mention atomicity.** Every maximal stretch with one equal mention value is whole `@label` units. | A stretch that is not (a concurrent or engine-level insertion inside a mention, a partial deletion) projects as plain text: the mention format is dropped on that stretch, the characters stay. |
| **Section summary first.** One leading summary, then a non-empty body. | The first summary child is projected first; further summaries project as paragraphs; a section without one shows an empty derived summary. A body emptied by concurrent deletions shows the derived fallback paragraph (the list-item/blockquote mechanism), which is editable and becomes ordinary content once typed into. |
| **Page break root-only.** | Placement treats any non-root parent as a grammar violation and suspends that move (the block stays at its previous admitted occurrence); a page break that would still project below the root is not shown. |
| **Table caption last, at most one.** | Rows keep their replicated order and are always projected before the caption, so appending a row to a captioned table is an ordinary edit (canonical, not a repair). A second caption candidate (two concurrent moves into one table) is not shown; the first paragraph in replicated order is the caption. |
| **Image link pair.** New window needs a link; a decorative image has no link. | `image-link-new-window` without `image-href` is dropped; a decorative image projects without a link (the accessible-name rule wins over a concurrent link). |

**Local commands never rely on repairs.** A local command group is refused
atomically if its result needs *more* repairs than its basis (`shared V4 command
needs a merge repair`). So typing inside a mention, deleting part of one, applying
or removing a mention on part of a stretch, inserting a block with a bookmark name
already in use, moving a summary out of first position, moving a page break below
the root or making a linked image decorative are refused locally exactly as the
local V4 owner refuses them; repairs apply only to merges. Typing next to a mention
is plain text (the shared typing path disables the mention annotation on new
characters, matching the local "no inheritance" rule). Selective Undo/Redo is
never refused by this check, because history can legitimately recreate a
concurrent conflict that the repair then resolves.

## Generic editing on V4 content

The V1–V3 shared command set works unchanged on V4 documents: typing and typing
history, `InsertText`/`DeleteText`/`ReplaceTextRange`, inline formats
(`SetFormat`, native selection formatting) including text language over plain
text and formats over whole mentions, `SetHeading`/`SetCodeBlock` (bookmarks are
kept), `SplitTextBlock` (the left block keeps the bookmark, the new right block has
none), `JoinTextBlocks`, block layout on paragraphs, headings, code and captions
(never on summaries), `InsertBlocks` (V4 flow including sections; page breaks at
the root only; sections are valid insertion parents), `MoveBlock`, `DeleteBlock`,
`InsertRow` (appends before the caption), `InsertColumn` and grid paste (rows only),
rich clipboard copy/paste (fresh identities), checkpoints of every history family,
exact restore and relay frames.

## Shared inline commands: text language, mentions, image links

The first per-slice shared commands cover the three inline V4 features. Each is
the shared form of the frozen local slice command: the same input JSON, the same
user-visible semantics, **one writer-local history group** (one Undo step) and an
exact check against the complete local core result before the shared group is
kept. Outside an explicit shared V4 owner every one is refused before anything is
published. Code lives in `rich_replica/v4_inline.rs` (owner entry points),
`rich_replica/actions/insert_mention.rs` and `rich_replica/actions/set_image_link.rs`
(new shared commands), `rich_replica_wasm/inline_v4.rs` (Wasm) and
`packages/breditor-collaboration/src/inline_v4.ts` (TypeScript).

| Feature | Rust / Wasm (`SharedEditorOwner`) | TypeScript (`SharedRichEditor`) | Replica write | Concurrency |
| --- | --- | --- | --- | --- |
| Text language | `set_text_language_json_guarded` / `set_text_language(observation, {"language": tag\|null})` | `setTextLanguage(tag \| null)`, `supportsTextLanguage()` | no new command: native selection formatting lowers to `SetFormat` annotations of `breditor/text-language` (the document-selection family uses the document formatting action) | per character, the highest causal stamp of the kind wins; other formats and the mention are untouched |
| Mention | `insert_mention_json_guarded` / `insert_mention(observation, {"selection":{kind:"text",anchor,focus},"mention":{kind,id,label}})`; shared command `insert_mention {anchor, focus, mention}` | `insertMention(selection, mention)`, `supportsMentions()` | `InsertMention` is planned by the local `RichLocalSession::insert_mention` over the current projection (V4 profile, outward snapping, paragraph/heading/summary target, the trigger's styles) and lowered to the source-preserving `ReplaceTextRange` edit (`@label` with the mention, one plain space) | a concurrent edit inside the replaced trigger survives next to the unit; a stretch that stops being whole `@label` units projects as plain text (the existing atomicity repair) |
| Image link | `set_image_link_json_guarded` / `set_image_link(observation, {"image": imageId, "href": url\|null, "newWindow"?})`; shared command `set_image_link {block, href, new_window}` | `setImageLink(intent)`, `supportsImageLinks()` | one write of the **paired** field `image-link` (`image-href` + `image-link-new-window`, a same-window link removes the flag in the same write, a clear removes both) | per-field register order: one writer's complete pair wins, never half of each; disjoint image fields (alt, size, caption) merge |

- **Text language.** A range replaces every selected character's language in one
  history group (canonical case, `fr-ca` is stored as `fr-CA`); an identical
  value is an exact no-op; a caret changes pending typing formats only (no
  history step); malformed, private-use and extension tags are refused. Clearing
  removes only the language.
- **Mentions.** The caret lands after the plain space and pending formats are
  the trigger's styles (never a mention), so typing next to a mention is plain
  text. Deleting is whole-unit (selection snapping plus the local refusal of
  partial edits). One Undo restores the typed `@query` and the pre-edit selection;
  under natural-typing history the typing burst stays its own earlier group.
  Every JSON field is strictly decoded with the local V4 domains (closed kinds,
  id charset, label rules).
- **`@` menu.** `mountSharedMentions(host, {items, core?})` (`@breditor/collaboration`;
  `mountMentions(session, options)` in `@breditor/editor/collaboration`) reuses the
  local typed-trigger session exactly like the shared slash menu: the same
  trigger detection, AbortSignal-cancelled providers, accessible listbox, catalog
  strings (`mentionLabel` …) and DOM (`data-breditor-mention`). Choosing publishes
  ONE guarded dispatch `{commands:[insert_mention], selectionUpdate:set(caret)}` at
  the checked revision (a Rust contract proves it equals the native command); a
  peer edit that invalidates the trigger closes the menu and publishes nothing.
- **Image links.** A link on a decorative image is refused with
  `a decorative image cannot be linked` (both the owner entry point and the shared
  command); clearing an absent link is an admitted no-op; non-canonical or unsafe
  targets and `newWindow` with a clear are refused. A concurrent "make decorative"
  still wins in the projection (existing repair) and undoing it shows the retained
  link again.
- **Toolbar.** `createRichSharedToolbarV4` now adds **Language**, **Clear
  language**, **Image link** and **Remove image link** (`sharedInlineControlsV4`),
  the local V4 controls' fields, reads and validation, each publishing one native
  shared command.
- **Capabilities.** The owner reports `inline_commands_v4_version()` (`"1"` on V4
  owners, `"0"` otherwise); the facade's `supportsInlineCommandsV4()` requires it
  and all three methods on a complete V4 owner.

## Block-field commands (list numbering, bookmarks, sections)

Three V4 slices now have shared commands with the local V4 semantics
([RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md) slices 1, 4 and 8). Every command first
captures and admits the frozen native action on the request basis (so it has the
exact local errors and no-ops), then writes only its own owned field and compares the
published projection with the native result. One command, or one rename, is one
writer-local history group.

| Command (`dispatch`) | Fields written | Semantics |
| --- | --- | --- |
| `set_list_numbering {list, style, reversed}` | `property:breditor/list-style`, `property:breditor/list-reversed` (only the changed ones) | `style` is `"keep"`, `"clear"` or `{"set": token}` (`decimal`, `lower-alpha`, `upper-alpha`, `lower-roman`, `upper-roman`); `reversed` is `true`, `false` (removes) or an explicit `null` (keep). An all-keep intent, a non-ordered target and unknown tokens are refused. The start is the list's existing paired kind/start field: `SharedRichEditor.setListNumbering({list, style?, reversed?, start?})` sends `set_list_kind` first in the same group, so a reversal and its start are one Undo step. |
| `set_bookmark {block, name}` | `property:breditor/bookmark` | Set, replace or clear (`null`) the bookmark of a paragraph, heading or code block (including derived fallback paragraphs, which are activated first). Links are never rewritten. A name another block holds is refused locally with `shared bookmark name is already used in this document`. |
| `rename_bookmark {from, to}` | the holder's bookmark field plus one link annotation per maximal `#from` link run | Moves the anchor and retargets every same-window `#from` link in every text block (paragraphs, headings, summaries, captions, cells) as one group with one stamp. Absent `from` (`shared bookmark does not exist`) or taken `to` are refused; `from == to` publishes nothing. |
| `set_details_open {block, open}` | `property:breditor/details-open` | Expanded is `true`, collapsed is absence. The owner call `set_details_open` (TS `setDetailsOpen`) also moves a selection with an endpoint, node or grid in the hidden body to a caret at the summary end in the same publication (and clears pending formats), exactly like the local session. |

Wasm adds `v4_block_fields_version()` (`"1"` on V4 owners, `"0"` otherwise),
`set_details_open(observation, block, open)` and `bookmark_index_json(observation)`
(the local `{bookmarks, links, brokenLinks}` inventory). TypeScript adds
`supportsListNumbering()`, `supportsBookmarks()`, `supportsDetails()`,
`setListNumbering()`, `setBookmark()`, `renameBookmark()`, `setDetailsOpen()` and
`bookmarkIndex()`; `createRichSharedToolbarV4` appends **List numbering**,
**Bookmark** (sets, or renames an existing bookmark so links follow), **Remove
bookmark**, **Link to bookmark** (selection formatting with the literal
`{href:"#name", new-window:false}`) and **Expand/Collapse section**. The shared
surface renders bookmarks (`id="bm-<name>"`) and internal links like the local V4
controller, and keeps summaries and internal links inert while editing (a
browser-initiated `<details>` toggle reverts to document state).

**Conflicts.** Disjoint fields merge (another writer's reversal survives a style
change). The same field resolves by the register order (highest causal stamp wins),
and selective Undo removes only its writer's contribution. Concurrent equal bookmark
names are both admitted locally and the existing document-order repair keeps the
first; once merged, a local set of the same name is refused. Two concurrent renames
write the anchor and every link with one stamp each, so the field and the links
follow the same winner. A link created concurrently with a rename (or to a removed
bookmark) is not seen by the rename and dangles, exactly as a local rename leaves
later links alone; the index and the renderer report it as broken.

**Seeded list start.** A list loaded with a start keeps it in its own seeded
`property:breditor/start` field, which projects after `list-kind` (fields still apply
in field-name order). A kind/start change now also writes that field, with the same
stamp, so the newest choice wins in both and a start change on a seeded list is no
longer refused. Field projection order is unchanged, so no existing history projects
differently.

**Split lists.** A fresh list created by a structural command (an outdent or exit
that splits an ordered list) writes its `list-style` and `list-reversed` fields from
the native result, so the tail keeps the source list's style and counting order, as
the local V4 owner does. These fields are prepared with the reserved list.

## Structure commands: sections, page breaks, table captions

Six shared commands give collapsible sections, page breaks and table captions the
user-visible semantics of the local slice commands. Each is admitted only by an
explicit model-14 owner (`shared V4 structure command requires model 14`
otherwise), is one guarded dispatch and one writer-local Undo step, captures the
frozen core action on the current projection and publishes only after the
replica's projection equals the core result exactly. None may rely on a merge
repair (the `require_no_new_v4_repairs` check applies), so a wrap that would put a
page break in a section, an insertion anchored below the root or a second local
caption are refused atomically.

| Command (`Command::…`, TS `kind`) | Replica effect | Local equivalent |
| --- | --- | --- |
| `WrapDetails` (`wrap_details` `{first,last,wrapper,summary,open}`) | Births one section (root origin; `details-open: true` is an immutable creation default) and one empty summary text block whose immutable origin is **inside** its section; owned placements move the section to the range's slot and the summary and every wrapped block into it. Wrapped blocks keep identity, text and descendants. | `wrapDetails` |
| `UnwrapDetails` (`unwrap_details` `{wrapper}`) | An owned `text-kind` contribution makes the summary a `breditor/paragraph` (same identity, runs and formats), owned placements lift summary and body to the section's slot, and the section is hidden (`deletions`). A derived (repair) summary is refused. | `unwrapDetails` |
| `InsertPageBreak` (`insert_page_break` `{block,before}`) | Births one page break with an owned root occurrence before `before` (or appended). There is no parent field: a non-root anchor is refused by the core capture. | `insertPageBreak` |
| `DeletePageBreak` (`delete_page_break` `{block,paragraph}`) | Hides the page break; `paragraph` is the fresh empty floor required only when it is the sole root child. A node-selected break is also deleted by the generic native atom deletion (Backspace/Delete). | `deletePageBreak` |
| `AddTableCaption` (`add_table_caption` `{block,caption}`) | Births one empty caption paragraph whose origin is in the table's child order (rows are always projected first). A table that already shows a caption is refused, never replaced. | `addTableCaption` |
| `RemoveTableCaption` (`remove_table_caption` `{block}`) | Hides the caption **and** every other live paragraph placed below the table (a concurrently added candidate the projection hides), so removal never surfaces a hidden caption. An absent caption is an admitted no-op. | `removeTableCaption` |

**Layout of a lifted summary.** A summary owns no layout fields. After an unwrap it
is a paragraph and may take layout (the layout audit admits fields on an owner
born as a summary); if a later Undo makes it a summary again, those values stay
causal but are not projected (like `list-style` on a bullet list). No repair is
counted for this.

**Concurrency.** Placement and register ordering decide every race; tests cover:
a wrap racing typing inside and a heading conversion of a wrapped block (the edits
land inside the section); an unwrap racing a move of a body block out and a move
of another block into the section (the section disappears, the lifted blocks and
the moved block converge on one root slot chosen by causal stamp; a block moved
into the removed section is hidden with it and returns with selective Undo, as
for blockquote unwraps); a page-break insertion racing a peer wrapping its anchor
(the break stays at the root, the anchor moves into the section); concurrent
caption additions plus a concurrent row insertion (rows first, exactly one caption
shown); caption removal racing typing in it (Undo of the removal restores the
caption with the concurrent text). Every peer converges, restarts exactly from its
checkpoint and replays identical Undo/Redo; selective Undo of every writer returns
to the exact seed.

**Second concurrent caption.** The projection still hides a second concurrent
caption candidate rather than placement suspending the losing move. Shared
captions are born inside their table, so the only earlier occurrence placement
could fall back to is the paragraph's root escape: suspension would surface the
losing caption as a stray paragraph at the end of the document. It would also
change the projection of already persisted model-14 states, and the placement
grammar deliberately ignores child order and multiplicity. The repair stays;
`remove_table_caption` removes hidden candidates so they cannot reappear.

**Wasm and TypeScript.** The commands travel in the ordinary dispatch batch. The
owner reports `structure_commands_v4_version()` (`"1"` on V4 owners).
`SharedRichEditor.supportsSharedStructureV4()` reads it (with
`supportsRichLanguageV4()`); `wrapDetails`, `unwrapDetails`, `insertPageBreak`,
`deletePageBreak`, `addTableCaption` and `removeTableCaption` dispatch one request
each with the local selection policy (a new caption gets the caret and cleared
pending formats; removing a caption that holds the selection selects the table).
`createSharedStructureControlsV4` (module `structure_v4.ts`, composed by
`createRichSharedToolbarV4`) adds **Collapsible section** (`details`), **Remove
collapsible section** (`undetails`), **Page break** (`page-break`) and **Table
caption** (`table-caption`, pressed when the table has one); expanding/collapsing
a section is a separate control. The standard shared slash menu adds
**Collapsible section** and **Page break** (V4 toolbars only); `wrap_details` and
`insert_page_break` are appended to `sharedSlashCommandKinds`, so the trigger
removal and the command are one Undo step. Keyboard: Backspace at a summary start
unwraps the section, Delete at a summary end enters an open body, Backspace at the
first body start moves to the summary end, Backspace in an empty caption removes
it (other caption boundaries do nothing), Enter in a caption inserts a line break
and Enter at an open summary caret inserts one empty first body paragraph (a
collapsed summary is left unchanged until the open-state command exists). The
`@breditor/editor` shared V4 sessions get all of this through their stock toolbar
and `sharedSlashCommands`. The shared controller now also injects the local
`richPageBreakStyles` (re-exported additively from the `rendering` subpath), so a
shared page break renders as the labelled dashed separator and can be clicked to
node-select it, instead of a zero-height block.

## Tests

- `crates/breditor-collaboration/tests/shared_v4_contracts.rs` (also compiled by the
  research manifest through `experiments/collaboration/tests/shared_v4_contracts.rs`):
  selector/descriptors and grammar equality with the frozen lock; refusal of V4
  by V3 and of V3 by V4 (frames, journals, raw imports, documents); seed round trip
  of every slice across three peers with exact restore; concurrent generic edits on
  every slice by three peers with exact restart, identical Undo/Redo on restored
  owners and selective Undo of all writers back to the exact seed; mention typing
  and local refusal of partial edits; engine-level insertion inside a mention;
  concurrent equal bookmarks; concurrent emptying of a section body; placement
  refusal for summaries and page breaks; image link versus decorative; clipboard.
- `crates/breditor-collaboration/tests/shared_v4_inline_contracts.rs` (research shim
  in `experiments/collaboration/tests/`): text language set/replace/clear by three
  concurrent writers on overlapping ranges, caret pending formats and refusals;
  mention insertion after a typing group, trigger styles, snapping, summaries,
  direct command dispatch, a mention racing peer edits inside and around its
  trigger and a concurrent trigger deletion; image link pairs from concurrent
  writers, clear/no-op, decorative refusal (entry point and command), non-canonical
  targets and decorative-versus-link merges. Every test checks exact restore and
  identical Undo/Redo of each writer.
- `packages/breditor-editor/tests/shared_inline_v4.test.ts`: input snapshots,
  capability reads, the toolbar controls, the `@` menu batch, one-step Undo and
  peer invalidation.
- `experiments/shared-browser/v4-inline.spec.mjs` (fixture `v4-fixture-inline.mjs`):
  two real Wasm writers in a V4 room render mention chips, `lang` spans and image
  links, and drive the Language and Image link controls and the `@` menu.
- `experiments/relay/tests/language_v4_room.rs`: plain and standard V4 rooms with
  every slice, durable admission, catch-up, restart, duplicate receipts and
  descriptors; wrong-revision creation and cross-version writer groups (V3 into
  V4, V4 into V3) refused without touching the log.
- `crates/breditor-collaboration/tests/shared_v4_block_fields.rs` (research shim
  `experiments/collaboration/tests/shared_v4_block_fields.rs`): wire shapes; list
  numbering with disjoint and same-field concurrency over three peers, per-writer
  Undo/Redo, a start change in the same group and kind round trips; bookmark set,
  replace, clear, split and duplicate refusal; concurrent equal names; rename of links
  in paragraphs, summaries, captions and cells in one Undo step; concurrent renames,
  rename versus removal and new links; section open state with the collapse selection
  rule; V3 refusal; exact checkpoint replay of every writer.
- `packages/breditor-editor/tests/shared_v4_block_fields.test.ts` and
  `experiments/shared-browser/v4-block-fields.spec.mjs` (two real Wasm writers).
- `crates/breditor-collaboration/tests/shared_v4_structure_contracts.rs` (research
  shim `experiments/collaboration/tests/shared_v4_structure_contracts.rs`): each
  structure command as one Undo step, identity retention, root-only and
  existing-caption refusals, the slash batch, two- and three-peer races listed
  above, checkpoint restart with identical Undo/Redo, V3 refusal.
- `packages/breditor-editor/tests/shared_structure_v4.test.ts`: capability,
  `SharedRichEditor` requests, toolbar controls, slash items and keyboard
  boundaries; `experiments/shared-browser/v4-structure.spec.mjs`: two real Wasm
  writers in a V4 room (Chromium, Firefox, WebKit) rendering and editing sections,
  page breaks and captions.
- `packages/breditor-editor/tests`: explicit V4 selection for `openSharedEditor`
  and `openSharedDocumentEditor`, unknown languages refused, durable records
  accepting language 4 and refusing 5.

## Remaining work

- Every V4 slice now has its shared commands, Wasm/TS surface and toolbar
  controls (inline, block-field and structure sections above), qualified in all
  three engines by `v4-inline.spec.mjs`, `v4-block-fields.spec.mjs` and
  `v4-structure.spec.mjs`. Still open: shared interchange that reports V4
  capabilities (until then shared imports keep the V1–V3 conversions), and Enter
  at a collapsed summary expanding the section (the structure keyboard handling
  predates the open-state command and leaves a collapsed summary unchanged).
- A second concurrent caption stays hidden by the projection (decision and reasons
  under [Structure commands](#structure-commands-sections-page-breaks-table-captions)).
