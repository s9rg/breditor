# Shared rich language V4 (foundation)

Shared V4 lets a collaboration room hold, replicate, persist and replay documents
that use any of the eight frozen V4 slices ([RICH_LANGUAGE_V4.md](RICH_LANGUAGE_V4.md)):
ordered-list numbering, text-run language, image links, collapsible sections,
mentions, table captions, page breaks and bookmarks with internal links.

**Status (November 20, 2026): foundation.** The shared language, its causal model,
journal, persistence, Wasm/SDK selection and relay rooms exist and converge
exactly. Generic shared editing (typing, inline formats, structure commands,
clipboard, history, checkpoints, relay frames) works on V4 documents. The
per-slice shared commands and toolbar controls (set list numbering, set text
language, image link, wrap/unwrap/open sections, insert mention, table caption,
insert page break, bookmark/rename/link) are **not** part of this foundation;
they are the next round. Until then V4 slice values arrive only by seeding,
restore, rich clipboard and generic block insertion, and are then edited with
the generic commands below. The browser harness qualification of shared V4 is
also still open (see [Remaining work](#remaining-work)). The inline slice commands
(text language, mentions with the `@` menu, image links) have since landed; see
[Shared inline commands](#shared-inline-commands-text-language-mentions-image-links).

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
- `packages/breditor-editor/tests`: explicit V4 selection for `openSharedEditor`
  and `openSharedDocumentEditor`, unknown languages refused, durable records
  accepting language 4 and refusing 5.

## Remaining work

- Per-slice shared commands, their Wasm/TS commands and toolbar controls for the
  remaining slices (list numbering, sections, table captions, page breaks,
  bookmarks); the inline slices (text language, mentions, image links) are done
  (see above). Shared interchange that reports V4 capabilities (until then shared
  imports keep the V1–V3 conversions).
- Shared-browser (Playwright) qualification of the remaining V4 slices; the inline
  slices are covered by `v4-inline.spec.mjs` in all three engines.
- A second concurrent caption is currently hidden by the projection; a later
  round may instead suspend the losing move in the placement resolver.
