# Feature-expansion beta goal

Agreed scope, October 3, 2026: a desktop-first editor with end-to-end headings
and **flat bullet/numbered lists first**. Nested lists and indent/outdent follow
in a later milestone, per the user's choice.

The goal is visible, usable features built on the existing Rust contracts.
Additional storage machinery is not a prerequisite unless the chosen browser
session-backup/autosave path actually requires it. No publishing or pushing is
authorized by this plan.

## Milestones and acceptance gates

1. **Heading editing in Rust.** Guarded text edits inside paragraphs/headings;
   insert/type-over, formatting, grapheme deletion, Enter and boundary joins.
   Preserve rank, typed Link/Highlight values, Unicode scalar boundaries,
   directional selections and exact undo/redo. Each new operation/action has a
   separate named file. Reject unsupported combinations atomically.
2. **Headings in the demo.** Explicit structural profile, semantic h1–h6
   projection, generic block-kind toolbar state and declared commands. Finish
   the required durable recipes and explicitly versioned session browser bridge. Demonstrate:
   convert to heading, type, format, press Enter, undo/redo, reload with a redo
   branch, export and recover a backup. No local-log expansion merely to add
   another persistence path.
3. **Flat lists.** Bullet and ascending numbered lists; wrap/unwrap contiguous
   blocks, split a nonempty item, exit an empty item, boundary deletion and
   exact undo/redo. Preserve following ordered-list numbers where representable;
   reject overflow. Define cross-list/mixed-block selection behavior before UI
   exposure. Nested lists, indent/outdent and task lists are explicitly deferred.
4. **Qualification and release preparation.** Three-browser editing, clipboard,
   reload/recovery and accessibility regressions; native Safari/Chrome clipboard,
   OS input-method and assistive-technology checks for the claimed desktop
   surface. Record missing evidence honestly. Verify actual packed consumers,
   document supported limits and migration behavior, measure sizes/performance,
   and prepare a bounded beta release without publishing it.

A milestone is complete only when its visible scenario and rejection/rollback
cases pass. Passing a primitive's unit tests does not complete the browser feature.
Use targeted tests at each small checkpoint and the full release gate at each
integration milestone; retain any failed run rather than hiding it with retries.

## Heading behavior decisions

- Changing kind preserves text, inline formats, selection direction/affinity
  and pending formats. A range ending at the next block's start excludes it.
- Enter at the start or middle produces two headings of the same rank (an empty
  left heading at the start). Enter at the end
  produces a paragraph. Enter in an empty heading converts it to a paragraph.
- Join/delete and cross-block type-over retain the spatial left/start block's
  kind, even when that block is empty. Undo restores every original kind/rank.
  No text or rank is discarded as an accidental side effect.
- No new paragraph/heading semantics are retrofitted into old operation tags or
  old schema fingerprints. New primitives remain gated until their durable
  encoding and replay tests are available.
- The first text-block splice guards the complete source block, including rank
  and typed formats. This is conservative: even a disjoint edit within that
  block invalidates a captured splice; unrelated sibling edits do not.
- Structural publication initially uses full document validation. Optimize only
  after correctness and measurements justify an incremental proof path.

## Delivery and size policy

The current default Wasm and demo bundles are close to their size ceilings.
Measure an optional structural package/profile or load boundary before exposing
it. Keep the default paragraph build unchanged; do not silently raise budgets
or remove validation to fit a feature. A separately budgeted optional feature
requires an explicit recorded decision.

Out of scope: collaboration, tables, images, general rich paste, arbitrary
runtime plugin callbacks, mobile support claims, and a new native local-log I/O
implementation. Existing browser session persistence remains the beta route.

## Starting checkpoint

Base: `cbdbeb1`. Heading-kind conversion, V4 operation/transaction persistence
and retained session history exist behind `experimental-structural-properties`.
The browser is still paragraph-only. First implementation task: a guarded
text-block splice, sharing established text slicing/relocation semantics while
leaving the existing paragraph-only operation untouched. Then wire it through
typing actions and durable replay before moving to Enter/delete and browser UI.

See [Structural blocks](STRUCTURAL_BLOCKS.md) for the longer-term nested-list
design; this beta plan deliberately narrows its first release gate.

## First implementation slice

`operation/text_block_splice.rs` now implements a gated, direct-root text edit
for paragraphs and headings. It reuses existing canonical text slicing and
selection relocation, preserves rank and typed inline formats, validates the
complete result document, and derives an exact inverse. Source guards include
the whole edited block; unchanged siblings are not guarded.

The original slice was **in-memory only**: V1–V4 codecs reject this primitive.
The V5 checkpoint below adds durable recipes; browser exposure remains unfinished. Later
checkpoints below add typing, Enter, deletion, structural action behavior and
formatting and durable text-edit replay. Browser integration remains unfinished.
No fresh browser, bundle-size or full release qualification is claimed for
this isolated core checkpoint.

The [first-slice verification record](qualification/2026-10-03-heading-text-block-splice.json)
records nine focused tests, 10,000 seeded Unicode cases, both core unit-suite
configurations, existing paragraph-splice integration tests and strict linting.

## Heading typing action

`action/builtins/insert_text_block_text.rs` adds an opt-in
`InsertTextBlockTextAction` under `breditor/insert-text-block-text`. It uses the
existing bounded insert-text input contract without changing the base action
registry. Paragraphs and heading ranks 1–6 are editable in the experimental
text-block profile. Typing preserves the rank and typed inline formats, consumes
pending formats, publishes a canonical caret and offers the existing typing
merge group for adjacent insertions.

Collapsed typing uses pending formats when present, then focus affinity at a
format seam. Type-over uses the first spatially selected run independently of
forward/backward direction. Full-tree preview counts untouched siblings and the
heading rank property before enabling the action. Undo restores the exact source
selection and pending formats; stale preparations cannot destroy a redo branch.

Cross-block replacement now retains the spatial start block's kind; it does not
flatten a heading into a paragraph. See the cross-block checkpoint below.
The action is not in the browser/default registry. V5 now saves its text edits
and retained history. V4 remains a closed language: neither text primitive was
silently added to it. Both new recipes were settled together before introducing
the next explicit format, rather than issuing a format per command.

See the [typing verification record](qualification/2026-10-03-heading-typing-action.json)
for current evidence. These core checks are not browser feature qualification.

## Heading deletion actions

Three opt-in actions now have separate documented files:
`DeleteTextBlockBackwardAction`, `DeleteTextBlockForwardAction` and
`DeleteTextBlockSelectionAction`. They edit the same paragraph/heading profile
as typing and preserve its kind/rank, typed inline formats and pending formats.

- A collapsed Backspace/Delete removes one extended grapheme cluster using the
  existing pinned Unicode segmentation. Formatting seams are not boundaries.
  A protocol caret inside a cluster is disabled instead of deleting guessed text.
- If deletion creates a new cluster across its seam, backward deletion snaps
  the result caret after that cluster; forward deletion snaps before it.
- Selected deletion removes the exact scalar-aligned spatial range, regardless
  of direction, without grapheme expansion. All three actions use this same
  selection policy and an independent history event for extended selections.
- Repeated directional deletion offers the existing directional merge group.
  Undo/redo restore exact document, selection and pending formats.
- Full-tree preview still applies: even deletion can exceed a leaf limit when
  previously separated same-format runs become one canonical leaf.

The new shared text-block source/preview helper is also used by heading typing;
its behavior is covered by the whole-core regression suite. Existing paragraph
actions, base registration and all durable formats remain unchanged.

**Still unfinished:** browser
integration, flat lists and desktop/native qualification. Start/end of the entire
document return their normal disabled states; internal boundaries now join through
the structural primitive. This is not a finished editing profile and must not be
exposed as one.

See [deletion qualification](qualification/2026-10-03-heading-deletion-actions.json)
for the reproducible test commands and measured boundary.

## Atomic structural replacement and Enter

`TextBlockReplace` adds a guarded edit across direct-root text blocks. Its
nonempty replacement sequence supplies explicit paragraph/heading kinds and
inserted text. The surviving source prefix attaches to the first replacement
and the suffix to the last. Full source nodes guard kinds, ranks, text and typed
formats. The inverse restores each source kind independently. Unchanged siblings
are not guarded, but count toward full result validation.

The operation shares the established, pure root-text slicing and relocation
logic; it does not apply paragraph operations under a heading schema. All
existing durable languages, including V4, explicitly continue rejecting it.

`InsertTextBlockBreakAction` now uses that operation for one atomic Enter:

- A nonempty heading splits at the caret into same-rank headings. At its start,
  the left heading is empty; at its end, the new right block is a paragraph.
- An empty heading converts to one paragraph without adding a block. An empty
  paragraph instead splits into two paragraphs.
- Selected content is removed exactly. The left result retains the spatial
  start block's kind; the right retains the end block's kind unless its surviving
  suffix is empty, in which case it becomes a paragraph. This also applies to
  backward and cross-block selections; middle selected blocks are removed.
- The caret moves to the resulting right block's start, or stays in the converted
  empty block. Pending formats survive. Each Enter is one independent undo event.
- Publication is atomic: there is no temporary delete/split state that could
  incorrectly exceed a budget. Source fragments and the complete final tree
  still undergo validation, including duplicated rank/link properties.

Join mechanics have operation-level coverage across all 49 paragraph/heading
kind pairs and are now connected to boundary/cross-block editing actions below.
Formatting and durable session replay are covered below. This does not enable headings
in the browser or qualify a beta release.

See [structural-break qualification](qualification/2026-10-03-heading-structural-break.json).

## Cross-block editing checkpoint

Backward/forward deletion now joins adjacent blocks at a boundary. Selected
deletion works across any contiguous direct-root paragraph/heading span. Both
retain the spatial left block's kind, including an empty left heading; backward
and forward deletion do not choose different retained kinds. Selected deletion
uses the exact scalar range and an independent history event. Boundary joins
offer the existing directional merge group and snap newly formed grapheme
clusters using the same directional caret policy as local deletion.

Typing over a cross-block selection uses one `TextBlockReplace`, retains the
spatial start kind, consumes pending formats and places the caret after the
inserted text with Before affinity. Its inherited format is the first spatially
selected run, including complete middle blocks when boundary fragments are empty.
For a text-empty structural selection, inheritance falls back to the surviving
left run, then right run, then plain text. Direction does not change this choice.

The tests exercise 392 boundary-join combinations (49 kind pairs, four empty/nonempty
side combinations and two directions), mixed-format type-over, selected deletion,
regional-indicator seam snapping, bounded-result rejection, merged history and
stale preparation/redo safety. Seven text-block property tests run 10,000 seeded
cases each. That checkpoint proved **in-memory** retained-kind and selection
recovery; the V5 checkpoint below adds persistence. Neither claims browser support.

See [cross-edit qualification](qualification/2026-10-03-heading-cross-edit.json).

## Heading formatting checkpoint

Three separate opt-in actions now support same-block and cross-block formatting:
`ToggleTextBlockInlineFormatAction`, `SetTextBlockInlineFormatAction`, and
`ClearTextBlockInlineFormatsAction`. Their shared engine uses one guarded,
same-count `TextBlockReplace`, preserves every block kind/rank and validates the
complete final tree. Pure format rewriting and typed-property observation reuse
the established paragraph helpers; the legacy actions and base registry have
not changed behavior.

- Property-free toggles remove a uniformly active format, otherwise add it to
  all selected text. Empty blocks do not distort active/mixed/inactive state.
- Typed Set replaces the configured format's complete property map; Remove
  removes it regardless of properties. Peer formats survive. Toolbar state
  reports uniform/mixed/unset properties through the existing typed contract.
- Clear removes all selected formats. Text-empty structural ranges and
  unchanged results are disabled; unsupported schema/format requests and
  invalid properties are rejected before publication.
- Caret commands use pending formats, then the focus affinity at a text seam.
  They update only typing state and, matching existing session policy, create
  **no independent undo entry**. The subsequent text edit consumes the override;
  undoing that edit restores the exact pre-typing selection and pending formats.
- Extended formatting records one independent undo event. Direction, aggregate
  scalar offsets and affinities survive text-run merging/splitting. Undo restores
  the original point encodings as well as the exact tree.
- Resource checks admit the whole final result: a run split in one block can
  be offset by a merge in another without an invalid intermediate publication.

An independently reproduced relocation defect was fixed as a prerequisite:
`TextBlockReplace` previously treated interior points as deleted even when only
formatting changed. A same-count span now preserves offsets only when **each
corresponding block has identical logical text**, ignoring format-run layout.
Equal lengths, equal flattened text redistributed between blocks, and changed
block counts are not sufficient. Root boundaries and untouched siblings keep
their exact encodings; affected points are canonicalized in the result runs.
The legacy `RootTextReplace` relocation contract is unchanged.

This finishes the planned in-memory heading editing commands, not the demo or
beta release. V5 below adds durable recipes for `TextBlockSplice` and
`TextBlockReplace` together. Existing V1–V4 formats remain closed. Next connect
the optional structural browser profile and qualify heading editing/reload
before implementing flat lists.

See [formatting qualification](qualification/2026-10-03-heading-formatting.json).

## Durable heading-edit checkpoint (V5)

`OperationJsonCodecV5`, `TransactionJsonCodecV5` and
`SessionCheckpointJsonCodecV5` preserve the complete heading edit recipe set,
including both text primitives and the existing block-kind change. They remain
behind `experimental-structural-properties`; no shipping Wasm ABI, registration,
browser persistence or default package changes are made here.

The tests save actual typing, heading conversion, Enter, deletion/join and
formatting action histories at every retained cursor, restore them under an
independently compiled context, then compare every undo/redo boundary. Current
revision, document, directional selection, pending formats, capacity and open
typing merge groups survive. Runtime preparation stamps intentionally do not:
a new session cannot inherit the authority of old cached preparations.

Recovery admits chronological forward recipes only and proves their locally
derived inverses. Invalid future redo guards, incompatible editor values,
malformed payloads and exceeded whole-tree/history budgets reject the complete
restore. Errors retain both history-entry and operation indexes. Exact output
byte limits match decoding limits. V1–V4 continue rejecting the new text recipes,
including if an input's outer version is misleadingly relabelled.

Wire details are in [the structural contract](STRUCTURAL_BLOCKS.md#v5-heading-text-edit-persistence).
See [V5 qualification](qualification/2026-10-03-heading-edit-v5.json).
The next gate is the optional browser load/profile boundary, semantic heading
rendering and toolbar/keyboard integration, followed by real reload/recovery
tests. Flat lists remain the subsequent feature slice; nesting is deferred.

## Live heading-engine checkpoint admission

`CheckpointedEditorEngine::try_new_v5` now selects the V5 codec explicitly,
behind the same experimental structural feature. It retains the existing
candidate-before-publication mechanism: every effective command, selection
change, undo/redo, merge boundary and history clear must encode the complete
candidate session before the live owner changes. It does not install a schema
or action registry, and never upgrades a V1–V3 owner implicitly.

Black-box tests exercise all three heading primitive families through real
registered actions, restore every retained cursor in an independent context,
and check exact checkpoint bytes after publication. Rejected retained-operation,
retained-text and JSON-output budgets leave document, selection, history,
checkpoint and observation unchanged. In particular, an unsuccessful new edit
after Undo cannot discard the saved redo branch. Old engine observations cannot
cross restore, and stale observations are rejected before candidate admission.

This is the core ownership prerequisite, **not browser integration**. The
remaining integration gates found in the current code are concrete:

1. The opt-in text-block semantic profile is now compiled as described below,
   including extension format actions, observable toolbar state and routes.
   Existing factories still select paragraph-only profiles. Heading-aware
   multiline plain-text insertion has a core contract; browser clipboard/IME
   routing and qualification are still pending.
2. Add an opt-in Wasm build/load path and explicit V5 factories. State/document
   exports can retain State V3 / Document V2, but the current Wasm dispatch only
   selects session versions 1–3. Commit export still uses older operation
   payloads and must gain heading support rather than report misleading success.
3. Extend the browser projection/renderer, selection mapping, toolbar and input
   integration for semantic headings. The renderer currently assumes paragraph
   DOM nodes. Qualify reload/recovery and cross-browser behavior before exposure.
4. Measure optional and unchanged default packages separately, then run the
   release gates. No size ceiling is raised by this core checkpoint.

See [live-engine qualification](qualification/2026-10-03-heading-engine-v5.json).

## Heading-aware plain-text insertion

`InsertTextBlockPlainTextAction` (`breditor/insert-text-block-plain-text`) adds
the missing core paste operation, in its own documented file and behind the
experimental structural feature. It reuses `InsertPlainTextInput` V1 and its
existing bounds: CRLF, CR and LF become block separators; other Unicode scalars
are kept exactly. It does not import rich HTML or clipboard metadata.

- A single line retains the spatial start block kind, including cross-block
  replacement. For multiple lines, the first block retains the start kind,
  interior blocks are paragraphs, and the final block retains the original
  end kind only if original suffix text survives there; otherwise it is a
  paragraph. This is independent of selection direction.
- Leading, trailing and repeated empty lines are preserved. Pasting one newline
  into an empty heading creates an empty heading followed by a paragraph; it is
  not interpreted as the Enter shortcut that converts an empty heading in place.
- Carets inherit pending formats, then focus-affinity formatting. Extended
  selections inherit the first spatially selected text's complete format set.
  A text-empty structural range falls back to the surviving left seam, then
  right seam, then no formatting. Retained text keeps its own formats.
- The complete edit is one guarded `TextBlockReplace`, one V5 forward recipe
  and one independent history event. Exact replacements can be selection-only
  commits and do not manufacture undo entries. The result caret is before any
  retained suffix; pending formats are consumed and restored exactly by undo.
- Full-result admission counts untouched siblings, heading properties and
  duplicated typed formats. Failed preparation or checkpoint publication leaves
  the old state and future redo intact. Default paragraph actions are unchanged.

This completes another core prerequisite. The following checkpoint compiles the
complete text-block action/intent/toolbar profile. The optional Wasm boundary
and browser renderer remain pending. No browser clipboard qualification is implied.

See [plain-text insertion qualification](qualification/2026-10-03-heading-plain-text.json).

## Compiled heading command and toolbar profile

`CompiledEditorProfile::try_compile_text_block_profile` now builds the complete
opt-in semantic profile as one immutable generation. It shares the established
extension declaration/ownership/resource validators, but does not replace the
paragraph compiler or implicitly upgrade existing factories.

The profile registers the six explicit text-block typing, plain-text insertion,
Enter and deletion actions; heading-aware Bold and Clear handlers; and seven
fixed-target kind conversions. No paragraph-only editing handlers are installed.
Bold/Clear keep their existing semantic intent identities. Extension toggle/set
declarations keep their declared action, intent, binding and state identities,
but use heading-capable Rust handlers. All routes remain priority-zero/blocking.

The kind controls are `breditor/control-paragraph` and
`breditor/control-heading-1` through `-6`, routed through the corresponding
`breditor/format-paragraph` / `breditor/format-heading-N` intents to
`breditor/set-paragraph` / `breditor/set-heading-N` actions. They are tracked:
mixed block kinds report mixed, an already-uniform target reports active but
blocked/unchanged, and missing selection reports inactive/blocked. They use the
same generic state catalog/cache as extension formatting and Undo/Redo.

The complete no-extension profile has 15 actions, 9 intents/bindings and 11
state controls. **Limits are unchanged:** the schema admits at most 255
extension format types (plus built-in Strong), and each uniquely owned type can
have a toggle or typed setter. Thus at most 255 combined extension controls are
currently reachable, for 266 total state entries. The independent 514-entry
catalog ceiling is not an entitlement to 503 extension formats; schema-only
formats also consume the stricter type budget. Tests exercise all-toggle,
mixed-toggle/set and all-setter capacity, plus rejection at 256 types.

Runtime tests route formatting and kind commands through a V5 checkpointed
profile engine, compare cached toolbar state with fresh derivation, preserve
directional selections, and restore under a newly compiled profile before
undo/redo. Old observations and old profile-bound caches are rejected after
restore. Typed controls distinguish uniform, mixed and unset values; failed
typed input does not change the owner or cached checkpoint.

Next: optional Wasm build/factories and all related exports, followed by heading
projection, DOM/selection, toolbar/input and browser reload/recovery. The default
Wasm/browser remains paragraph-only; lists and desktop qualification still follow.

See [compiled-profile qualification](qualification/2026-10-03-heading-profile.json).
