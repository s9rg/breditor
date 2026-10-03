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
- Enter in the middle produces two headings of the same rank. Enter at the end
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
Typing actions, its explicit durable recipe, Enter/delete behavior and browser
exposure remain unfinished. The first milestone is therefore still in progress.
No fresh browser, bundle-size or full release qualification is claimed for
this isolated core checkpoint.

The [first-slice verification record](qualification/2026-10-03-heading-text-block-splice.json)
records nine focused tests, 10,000 seeded Unicode cases, both core unit-suite
configurations, existing paragraph-splice integration tests and strict linting.
