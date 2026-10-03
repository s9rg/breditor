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
   the required durable recipes and Session V4 browser bridge. Demonstrate:
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
- Join/delete policy must explicitly choose the retained block kind. It must
  never discard text or change rank as an accidental side effect.
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

This is **in-memory only**: all current codecs reject this new primitive.
Its explicit durable recipe, Enter/delete behavior and browser exposure remain
unfinished. The first milestone is therefore still in progress.
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

Cross-block replacement is explicitly disabled, not flattened into a paragraph.
The action is not in the browser/default registry and its text edit still cannot
be saved in any current operation/session format. Durable encoding is the next
integration dependency: V4 is a closed language, so adding a new tag silently is
not acceptable. Settle the remaining heading edit recipe set together before
introducing the next explicit format, rather than issuing a format per command.

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

**Still unfinished:** cross-block deletion actions and boundary-join actions,
formatting commands, durable text-edit sessions, browser integration, flat lists
and desktop/native qualification. Start/end of the entire document return their
normal disabled states; internal block boundaries explicitly report unsupported
until the structural edit primitive is ready. This is not a finished editing
profile and must not be exposed as one.

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

Join mechanics now have operation-level coverage across all 49 paragraph/heading
kind pairs. The next step is to connect boundary and cross-block deletion actions
to this primitive with an explicit left-kind retention policy, then formatting
and durable session replay. This checkpoint still does not enable headings in
the browser or qualify a beta release.

See [structural-break qualification](qualification/2026-10-03-heading-structural-break.json).
