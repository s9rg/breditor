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

## Opt-in heading Wasm bridge

The Rust Wasm adapter now has an explicit `experimental-text-blocks` feature,
bootstrap V3 factory and Session V5 document/restore factories. Heading typing,
normalized multiline insertion, kind changes and formatting use the compiled
profile's named actions; they are not dispatched to paragraph-only handlers.

Commit export was the remaining format gap: it now uses a replay-proved Commit
V5 codec for these engines. Document export remains V2 and state export remains
V3. Session V5 is still the authoritative save/recovery boundary, encoded before
publication. Old factories and codec versions are not implicitly upgraded.

Regression checks cover Unicode edits, full-source guards, strict envelopes,
context and byte/count budgets, exact selection restoration, both history
branches, stale observations after reload, and failed legacy-action dispatch
without mutation. A developer-only generated-Wasm smoke script exercises the
JavaScript ABI separately from native Rust tests.

Next: qualify an isolated optional build/load and declaration boundary, then
wire headings through projection, DOM/selection, toolbar, keyboard, and browser
reload/recovery. The shipping browser remains paragraph-only. Flat bullet and
numbered lists follow headings; nested lists remain deferred by user choice.

See [heading Wasm bridge qualification](qualification/2026-10-03-heading-wasm-bridge.json).

## Heading projection and DOM checkpoint

The experimental Wasm projection now exposes `headingLevel(index)` as an
explicit JavaScript number (1–6), or `undefined` for every non-heading node.
The browser's explicit `consumeTextBlockSemanticProjection` boundary validates
the rank together with the node type, preorder topology, profile generation,
typed inline formats and snapshot identity. Legacy consumers never probe this
getter and still reject heading nodes. The optional constructor/consumer is not
added to the public browser entry points yet.

The owned projection keeps its legacy `paragraphs` collection name for the
direct-root text-block view. An optional `headingLevel` identifies headings;
ordinary paragraphs keep their existing shape. Experimental input explicitly
uses null for paragraphs. Ranks are never inferred from DOM styles or tags,
and structural rank properties count toward the existing property-value limit.
Projection mode is bound to the profile; an update cannot cross between the
legacy and experimental construction modes even when all text is identical.

The renderer creates real `h1`–`h6` elements, including `<br>` placeholders for
empty headings. Typing retains the existing heading element. Kind/rank changes
replace the affected tag, rebuild its maps and preserve unaffected siblings.
Equality checks include rank, so a false “no change”/unaffected-block claim is
rejected. Selection maps retain scalar UTF-16 boundaries through inline wrappers.
Leased composition reconciliation accepts the exact heading tag but rejects a
rank change or unexpected structure; this is not native IME qualification.

Generated Wasm → browser adapter → DOM → session restore checks pass five fresh
editor runs each in Chromium, Firefox and WebKit, without retries. They cover
Unicode typing, rank changes, unaffected-node identity, DOM point mapping,
undo/redo, fresh Session V5 restore and stale-owner rejection. The regular
paragraph editor/profile/action-state/link-history browser regressions also pass
(90 tests across the same three engines), alongside all 1,448 browser unit tests.

The default size ceilings were not raised. Shared adapter method snapshots and
invocation helpers were deduplicated while preserving read phases, exact
receiver/arity, numeric normalization, asynchronous-value rejection and cleanup.
All current package/demo size checks pass, but gzip headroom is still very small.
An isolated optional build/load/declaration contract remains necessary before
exposing the feature publicly. Next: heading bootstrap and command-adapter input
routing, toolbar/keyboard, recovery integration and native desktop qualification;
flat bullet/numbered lists still follow.

See [heading projection qualification](qualification/2026-10-03-heading-projection.json).

## Isolated experimental build checkpoint

`npm run test:headings:experimental` now builds the heading candidate in its own
Cargo target and fresh generated-output directory. It cannot overwrite the
default compiler artifact or package dist; it compares all Wasm/browser dist
files before and after qualification. The generated declarations must equal the
reviewed shipping API plus exactly four high-level methods and four corresponding
low-level exports. TypeScript consumer checks also prove that shipping imports
do not expose heading APIs and that an absent heading rank remains optional.

The pinned, path-remapped and minified candidate passes the existing generated
Wasm, jsdom and five-run-per-engine Chromium/Firefox/WebKit heading scenarios.
Eleven declaration-contract regressions pass. Default size ceilings are unchanged
and pass. This is a developer-only reproducible check, not the public optional
package, native-input qualification, or a heading-enabled demo.

Next implementation boundary: explicitly selected browser startup and durable
preflight for Session V5 / State V3 / Document V2, followed by heading-aware
input actions and toolbar integration. Existing V1–V3 validators must stay closed;
the different wire versions must not be relabeled to pass old validators. Flat
bullet/numbered lists follow that end-to-end heading slice; nesting stays deferred.

## Heading browser persistence and command-adapter checkpoint

Explicit browser durable mode `v5` now admits paragraph/heading Document V2,
typed inline properties, and heading Session V5 with a State V3 history base.
It validates full block guards for kind changes, text splices and text-block
replacements, including rank/count/range and document resource limits. Structural
ranks count toward document and retained-base property budgets. V1–V3 remain
closed to headings; neither capture nor restore preflight retries a different
format. Rust still proves live indexes, scalar boundaries, complete retained
result budgets and bidirectional replay; browser preflight is not a replay engine.

The normal command adapter accepts explicit `durableMode: "v5"` and preserves the
exact projection-bound generation. Its document/checkpoint read ports validate
real Rust exports. Document correlation now compares semantic heading kind/rank
as well as text and typed inline values. A shared string-handle registry removes
duplicate lifecycle code while preserving reentrancy reservations, receiver-bound
cleanup, protected owners, thenable rejection and distinct error-reporting policies.

The generated-Wasm scenario now exercises 13 command/render transitions,
including normal browser-adapter typing, paragraph intent, undo, validated save,
fresh restore and redo with exact document/selection/pending-format equality.
It passes five runs per Chromium, Firefox and WebKit, alongside the 90 existing
paragraph editor/profile/history browser regressions and 1,489 browser unit tests.

This remains a **development checkpoint**. Public heading startup, toolbar/native
input routing, reload UI and flat lists remain pending. The existing default size
gate is also currently red for browser declarations and compressed demo JS; no
ceiling was raised. Resolve the measured packaging/footprint gate before release
qualification, without weakening validation or silently upgrading old formats.

## Public heading editor startup, input and session lifecycle

Explicit `semanticProfile: { bootstrapJson, formatVersion: 3 }` now selects the
experimental Bootstrap V3 / Session V5 route in `BreditorBrowserEditor.open`.
The normal toolbar, queue, input controllers and IndexedDB autosave work with
this profile. Legacy selectors never inspect the optional heading factories or
projection getter; there is no inferred generation, aliasing or fallback.

Native-input action IDs are selected from the validated projection's explicit
profile mode, including when it currently contains **only paragraphs**. Typing,
structural keyboard fallback, cut/paste command construction and composition
settlement use the separately named text-block actions. Explicit caller-supplied
action IDs remain exact. Storage retains checkpoint version 5 as an exact binding
inside the existing V2 record envelope; version 4 remains unsupported.

The public-editor browser scenario starts with a paragraph, applies Heading 2
through a declared toolbar control, inserts text, deletes a Unicode grapheme,
splits a heading, undoes, exits at its end into a paragraph, deletes/undoes text,
saves a redo branch, disposes, reopens from IndexedDB and redoes. The saved and
restored session bytes match exactly. Both keyboard policies are exercised.

This vertical slice exposed two implementation defects, now regression-tested:

- Public startup's installed-node check required `P` even for a validated
  heading projection. It now checks the exact expected paragraph/heading tag.
- Disposal removed editor-owned selection endpoints before clearing the native
  selection. WebKit could then report inconsistent BODY endpoints and reject a
  subsequent editor startup. Disposal now uses the existing ownership-aware
  cleanup before removing the subtree. Foreign and cross-host selections are
  not cleared; startup validation was not relaxed.

Firefox's Playwright text insertion uses a composition-style event sequence.
The test now waits for the public content-export boundary to become available
before sending another edit, rather than treating visible DOM text as a settled
commit. This is not OS IME qualification.

See [qualification](qualification/2026-10-03-heading-public-editor.json) for the
fresh isolated build, tests, earlier failures and measured limits. The feature
is still experimental: the default Wasm stays unchanged, the normal demo does
not load headings yet, and bundle budgets remain red. Next: the optional
demo/load boundary and size decision, then flat bullet/numbered lists. Nested
lists remain deferred. Nothing has been pushed or published.

## Separate heading-enabled React demo

The experimental feature now has a visible React demo with all six heading
levels, paragraph conversion, the existing eleven inline/history controls,
autosave, backup download and separate non-persistent recovery. It reuses the
standard React ownership/retirement lifecycle through a build-time profile
factory; the default profile, Wasm import and storage slot remain unchanged.

`vite.headings.config.ts` explicitly selects a qualified experimental candidate.
It builds to `target/heading-demo`, not the default demo's `dist`. The new
`example/heading-showcase` schema composes the existing typed inline extensions
with the Rust text-block compiler. Sample-document fingerprints come from Rust
preflight. No saved document/checkpoint is relabeled or silently migrated.

Production-built tests cover all ranks with composed inline formats, typed
Link/size values, exact undo, reload with a redo branch, byte-identical backup
recovery and independent editing of the recovered copy. Automatic accessibility
and narrow-overflow checks pass, without claiming screen-reader/mobile support.

See [run instructions](../examples/headings/README.md) and
[verification](qualification/2026-10-03-heading-react-demo.json).
The optional demo/load boundary is demonstrated, not a published optional
package. Default declarations and compressed demo JS still exceed their original
budgets, which have not been increased. Next feature work is the flat-list Rust
contract and its wrap/unwrap/split/exit operations, followed by the same durable,
browser and recovery path. Lists remain unimplemented at this checkpoint.

## Flat-list Rust schema checkpoint

The list milestone now has a sealed, feature-gated document schema: root-level
bullet/ordered containers with one paragraph or heading per item. Nested and
multi-block items reject explicitly. Both the start and final ordered ordinal
are validated before publication; the new arithmetic rule selects compiler
fingerprint contract 5 without changing older fingerprints or wire formats.
Typed inline values, document round trips and deep selection boundaries are
covered, along with structural/property resource limits.

This is not an editable list profile yet. Existing heading/paragraph operations
remain closed to it. The next implementation is the guarded, selection-preserving
list reframing operation, then separately named wrap/unwrap actions and their
runtime inverse/history tests. See the [operation plan](STRUCTURAL_BLOCKS.md#next-operation-and-action-contracts)
and [verification](qualification/2026-10-03-flat-list-schema.json).

## Flat-list runtime operation checkpoint

`FlatListReframe` now provides the source-guarded container edit underlying
wrap/unwrap/retype/restart. It preserves the exact flattened text-block sequence,
maps preserved block paths rather than deleting and reinserting selections, and
derives an exact inverse. Tests cover backward ranges, empty-item carets, typed
formats, mixed text runs, partial ordered-list splits with explicit suffix starts,
composed edits, runtime replay, no-ops, stale guards and atomic resource failures.

This is still a Rust primitive, not a toolbar feature: separately named
selection-driven actions must determine the touched span and preserve unselected
list prefixes/suffixes. List typing/split/exit/delete/formatting, new durable
history admission, Wasm projection, browser controls and native qualification
remain ahead. Existing operation/session wire unions are not widened; the
shipping build and running heading demo remain unchanged.

See [runtime contract](STRUCTURAL_BLOCKS.md#next-operation-and-action-contracts)
and [verification](qualification/2026-10-03-flat-list-reframe.json).

## Selection-driven flat-list actions

The Rust feature now exposes separately implemented `WrapListAction` and
`UnwrapListAction`. They support bare blocks, list items and mixed ranges with
tracked toolbar activation, exact directional selection/pending formats, one
undo event, stale-preparation rejection and full-result budget previews.
Partial conversions and unwraps preserve unselected items and their original
numbering. Applying numbered formatting to an already-numbered section does
not reset its start; existing adjacent lists are not automatically merged.

These actions remain explicitly registered Rust APIs. The next slice is normal
editing inside list items: text/format edits, Enter split and empty-item exit,
and boundary deletion. Durable history, Wasm/browser exposure, session reload/
recovery and native qualification still need to follow. No existing shipping
profile, wire union or bundle budget changed in this checkpoint.

See [action contract](STRUCTURAL_BLOCKS.md#selection-driven-wrapunwrap-actions)
and [verification](qualification/2026-10-03-flat-list-actions.json).

## Flat-list text and typing checkpoint

`FlatListTextSplice` and `InsertFlatListTextAction` now support text insertion and
type-over inside one bare paragraph/heading or one list-item block, preserving
rank, list structure and numbering. Typed inline values, scalar boundaries,
format-seam affinities, pending formats and grouped typing history are covered.
The splice uses the complete containing root as a conservative guard and shares
the established text slicing/relocation machinery. Direct-root coordinate callers
keep their existing path gate; only explicit flat-list callers admit item paths.

Cross-block selections remain explicitly disabled for typing rather than being
partially applied. Next: list-aware structural replacement for Enter/split,
empty-item exit, boundary deletion and cross-block type-over, followed by inline
format actions and durable/browser integration. Existing wire unions and shipping
profiles remain unchanged. See
[verification](qualification/2026-10-04-flat-list-text.json).

## Structural flat-list replacement checkpoint

The Rust core now has `FlatListTextReplace`: one guarded operation combines a
real-path text range with an explicit flat-list result layout. It supports the
mechanics of item splitting, empty-item exit and cross-block replacement while
preserving untouched blocks and deriving an exact inverse. Result numbering is
explicit and checked; no automatic list coalescing or restart policy is hidden
inside the primitive. Unicode and arbitrary mixed-root layouts have independent
property-test oracles, and text/list/item/root boundaries are checked in both
directions.

Next is the action layer: Enter/split, empty-item exit, cross-block typing and
boundary deletion, followed by list-aware formatting. These actions are not yet
enabled by this primitive alone. Durable operation/session admission and browser
integration remain ahead; the running heading demo and shipping profiles are
unchanged. Flat lists remain the first beta scope; nested lists follow later.

See [contract](STRUCTURAL_BLOCKS.md#structural-flat-list-text-replacement) and
[verification](qualification/2026-10-04-flat-list-replace.json).

## Flat-list Enter checkpoint

The experimental Rust profile now exposes `InsertFlatListBreakAction`: nonempty
items split; empty items exit as bare paragraphs; unselected numbered suffixes
retain their original starts. Bare headings follow the existing heading Enter
policy. Forward/backward selections can cross items and different root/container
families in one atomic replacement. The action preserves pending formats and
exact undo boundaries, previews full-result limits and rejects stale preparations.
Existing-break replacements that change only selection do not add undo entries.

This is an explicitly registered core action, not a browser feature yet. Next:
cross-block typing, boundary deletion and inline-format actions, followed by
durable operation/session admission, Wasm/browser controls and reload/recovery.
The existing shipping and heading-only demo paths remain unchanged.

See [Enter contract](STRUCTURAL_BLOCKS.md#flat-list-enter-action) and
[verification](qualification/2026-10-04-flat-list-enter.json).

## Cross-block flat-list typing checkpoint

`InsertFlatListTextAction` now replaces a complete cross-item/cross-root selection
in one atomic structural operation. The start block kind and list family win;
unselected endpoint-list suffix items stay separate with their original numbering.
Middle selected blocks contribute formatting when endpoint fragments are empty.
Break-only selections use the left/right surviving seam before falling back to
plain text. Adjacent following typing groups normally, with exact directional
undo/redo, stale-preparation rejection and failure preservation of existing redo.

The former cross-block-disabled branch is replaced with tested execution, while
same-block typing retains its guarded-splice path. Next: list-aware backward/
forward deletion and inline-format actions, then durable operation/session
admission, Wasm/browser controls and native/reload/recovery qualification. The
shipping/default and heading-demo paths remain unchanged.

See [typing contract](STRUCTURAL_BLOCKS.md#cross-block-flat-list-typing) and
[verification](qualification/2026-10-04-flat-list-cross-typing.json).

## Flat-list deletion checkpoint

Explicit backward, forward and selection-deletion actions now cover the flat-list
profile. They reuse pinned grapheme semantics inside blocks and perform boundary
joins/cross-block deletion atomically. Backspace at the first item's start lifts
it into a bare block, retaining kind/text and suffix numbering; another Backspace
can join it to the predecessor as a separate undo event. Delete joins the next
block while preserving untouched list suffixes and their starts.

Directional joins snap newly formed grapheme seams consistently with the existing
heading profile. Exact selections remain scalar-aligned rather than being silently
expanded. Pending formats, exact directional undo, normal deletion grouping,
stale-preparation rejection and failure preservation of existing redo are tested.

Next: list-aware inline and block-kind formatting and multiline plain-text input,
followed by explicit durable operation/session admission, Wasm/browser controls,
reload/recovery and cross-browser/native-input
qualification. These Rust actions do not yet enable list editing in the running
heading demo or widen existing shipping wire formats.

See [deletion contract](STRUCTURAL_BLOCKS.md#flat-list-deletion-actions) and
[verification](qualification/2026-10-04-flat-list-deletion.json).

## Flat-list formatting checkpoint

Explicit Rust actions now toggle, set/remove and clear inline formats across bare,
bullet and numbered blocks. Paragraph/heading conversion also works inside lists,
with active/mixed/inactive toolbar state. Ordered starts and untouched items stay
exact; formatting ranges retain logical positions through run splits/merges, while
kind-only changes preserve the original selection encoding and pending formats.
Collapsed formatting updates pending formats without a document history event.

Regression coverage includes typed-format values, Unicode selections, direction
and affinities, exact undo/redo, full-document resource limits, atomic edits at
exact budgets, and redo preservation on rejection. All four actions remain
explicitly registered and experimental; the heading-only demo is unchanged.

Next: multiline plain-text insertion, then explicit durable operation/session
admission and the list browser/demo vertical slice, followed by reload/recovery,
cross-browser/native-input and release-size qualification. Nested lists and
indent/outdent remain deferred. This checkpoint does not complete the beta goal.

See [formatting contract](STRUCTURAL_BLOCKS.md#flat-list-formatting-actions) and
[verification](qualification/2026-10-04-flat-list-formatting.json).

## Flat-list plain-text checkpoint

The experimental Rust profile now supports atomic single/multiline plain-text
insertion. Inserted lines follow the starting container, blank lines stay explicit,
and untouched suffix items in another list retain their original numbers. Heading
retention, format inheritance, Unicode caret placement and independent undo/redo
are defined and tested. Pasted blank lines intentionally do not trigger Enter's
empty-item exit behavior.

The action uses the existing bounded plain-text input, shared text/format policy
and guarded flat-list replacement. Resource and ordinal failures reject before
publication; exact replacements and rejected edits preserve redo. All existing
profiles remain scoped to their original contracts.

The next milestone is durable list operation/session admission, followed by
Wasm/browser projection, toolbar/keyboard and the demo's reload/recovery flow.
Native clipboard, three-browser and release-size qualification still remain;
these Rust tests do not establish that lists are browser-ready.

See [plain-text contract](STRUCTURAL_BLOCKS.md#flat-list-plain-text-insertion) and
[verification](qualification/2026-10-04-flat-list-plain-text.json).

## Flat-list operation persistence checkpoint

Operation V6 now explicitly serializes flat-list reframe, text-splice and
structural-replacement recipes, including complete guards, actual paths, typed
formats and numbered result layout. Decoding validates bounded records and exact
schema binding; applying still verifies live guards. Deterministic roundtrips,
locally derived inverse replay, fresh-context replay, malformed-input rejection,
resource limits and no-op history behavior are covered.

This is the operation foundation for saved list sessions, not a replacement for
session/recovery qualification. Older codecs still reject list operations even
under relabelled envelopes; V5 transactions and sessions remain closed. The next
step is explicit V6 session admission with full forward/inverse history proof,
then the Wasm/browser/demo path. The beta goal remains incomplete.

See [V6 contract](STRUCTURAL_BLOCKS.md#flat-list-operation-persistence-v6) and
[verification](qualification/2026-10-04-flat-list-operation-v6.json).

## Complete list-session persistence checkpoint

Session Checkpoint V6 now preserves flat-list editing history, including both undo
and redo branches, exact selections/pending formats and continued typing groups.
Reload reconstructs and proves every forward and inverse boundary before returning
a session; invalid future redo entries reject the entire checkpoint. History and
resource limits remain host-authoritative, and older formats remain unchanged.

Tests reload the real list-action sequence at every cursor in fresh contexts,
exercise history eviction/state-only changes, and stress randomized list and
legacy-compatible sessions. This closes the Rust saved-history layer, not the
browser persistence experience: request/commit V6, Wasm/browser projection,
toolbar/keyboard and the demo's autosave/backup recovery remain to integrate.
Cross-browser/native-input and existing size gates are still required before beta
readiness. No publish, push or shipping-profile change is implied.

See [session contract](STRUCTURAL_BLOCKS.md#complete-flat-list-sessions-v6) and
[verification](qualification/2026-10-04-flat-list-session-v6.json).

## Flat-list request and commit checkpoint

Explicit V6 transaction requests and replay-verified durable commits now complete
the Rust wire path for flat-list operations. Multi-operation requests remain
atomic; commits derive inverses, maps and summaries from replay, preserving
selection and pending formats. Failed later guards or whole-document limits do
not alter state or lose redo. Existing format versions remain closed and unchanged.

The next vertical slice is the opt-in list Wasm/bootstrap profile and projection,
then browser commands, toolbar/keyboard behavior and demo recovery. These Rust
checks do not qualify browser/native interaction or resolve release size gates.
Flat lists remain first; nested lists and indent/outdent are deferred.

See [boundary contract](STRUCTURAL_BLOCKS.md#flat-list-transaction-and-commit-boundaries-v6)
and [verification](qualification/2026-10-04-flat-list-transaction-v6.json).

## Compiled flat-list editor checkpoint

The opt-in compiled list profile now joins the sealed schema, all list-aware
editing actions, heading/list controls and extension formatting into one command
graph. A V6 checkpointed engine executes that graph with complete session admission
before publishing any edit. Toolbar states and action dispatch share the same
Rust-owned handlers; restored engines reject stale runtime observations/caches.

Bullets and numbering are explicit set commands with a separate Remove List
control. Existing numbering is preserved. Nested lists and indent/outdent remain
out of scope for this beta. Existing paragraph/heading factories remain unchanged.

Next is the opt-in Wasm/bootstrap profile and projection, followed by browser
rendering, controls, keyboard and reload/backup recovery. Rust integration tests
do not establish browser/native readiness or clear the outstanding size gates.

See [compiled profile contract](STRUCTURAL_BLOCKS.md#compiled-flat-list-profile-and-checkpointed-owner)
and [verification](qualification/2026-10-04-flat-list-profile.json).

## Flat-list Wasm boundary checkpoint

An isolated `experimental-flat-lists` candidate now exposes Bootstrap V4, V6
document/session engine factories, version-correct exports and immutable list
kind/start projection metadata. The generated API is checked as an exact additive
extension; default and heading-only profile behavior remain separate.

Real-Wasm checks pass in Node and five runs each of Chromium, Firefox and WebKit.
They exercise commands, list metadata, session restoration and stale-owner
rejection, not the editor DOM or native input. The candidate is 2,044,484 raw bytes
and 568,550 gzip-9 bytes; no size ceiling was changed or release approved. Existing
shipping Wasm and browser dist hashes were unchanged.

Next: browser profile admission and list projection/rendering, followed by command
routing, toolbar/keyboard, selection/composition and session/backup recovery. List
typing currently uses a conservative full-root impact; the direct-paragraph
incremental record is not silently widened to nested paths.

See [Wasm contract](STRUCTURAL_BLOCKS.md#opt-in-flat-list-wasm-bridge) and
[verification](qualification/2026-10-04-flat-list-wasm.json).

## Hierarchical list projection checkpoint

The browser now has an isolated immutable flat-list projection and explicit Wasm
consumer. Bullet/ordered containers, starts, heading items, empty items and typed
inline formatting retain their structure; the text-block directory carries real
AST paths. Existing paragraph/heading consumers remain closed to lists. Shared
document budgets include structural nodes/properties, and consumed handles retain
the existing generation and cleanup protections.

Strict TypeScript and all 1,557 browser tests pass. Real Rust/Wasm-to-browser
projection checks pass five times each in Chromium, Firefox and WebKit, including
multiline list editing, undo and redo after fresh-owner session restoration.
Shipping Wasm and browser dist hashes remain unchanged; no package release or
size-budget approval is implied.

Next: explicit hierarchical DOM rendering and selection mapping, then list update
admission and controller/toolbar/keyboard integration. This is not yet the visible
list demo and is not native-input or general historical-WebKit qualification.
Flat lists remain first; nesting and indent/outdent follow separately.

See [contract](STRUCTURAL_BLOCKS.md#hierarchical-flat-list-browser-projection) and
[verification](qualification/2026-10-04-flat-list-browser-projection.json).

## Flat-list rendering and coordinate checkpoint

The isolated list renderer now creates semantic bullet/numbered-list DOM with
actual list/item/text paths, using the existing host ownership, rollback and
mutation checks. A separately owned list selection validates directional
endpoints and affinities; explicit point helpers map scalar-safe coordinates in
both directions, including empty items and inline wrappers.

All 1,579 browser tests and strict TypeScript pass. The real-Wasm candidate passes
five runs each in Chromium, Firefox and WebKit with list DOM and native Selection
endpoints, alongside the earlier editing/recovery checks. Shipping artifacts are
unchanged. The implementation currently full-renders lists; list incremental
updates and composition leases are not silently enabled.

Next: integrate the list selection bridge and Wasm selection/update admission,
then controller/profile mode, toolbar/keyboard and visible demo recovery. Native
keyboard/clipboard/IME and release-size/performance gates remain open. The editor
beta goal is not complete.

See [contract](STRUCTURAL_BLOCKS.md#flat-list-dom-and-selection-coordinates) and
[verification](qualification/2026-10-04-flat-list-dom.json).

## Flat-list selection integration checkpoint

Lists now have an explicit DOM selection bridge sharing the established native
read/write/rollback machinery, with exact one-use affinity receipts. A matching
Wasm selection adapter counts structural wrappers correctly, validates actual
paths and direction, and retains generation/snapshot/cleanup checks. Legacy
selection entry points stay closed to hierarchical handles.

Strict TypeScript and all 1,604 browser tests pass. The retained Wasm candidate
passes five runs each in Chromium, Firefox and WebKit, covering selection scalar
commands, decoded post-edit selections, recovery, native backward/empty-item
selections and exact affinity echoes. Shipping artifact hashes are unchanged.

Next: list projection-update admission and browser owner/controller mode, then
toolbar/keyboard and the visible demo's reload/backup path. Native editing,
clipboard/IME and release gates remain incomplete; the full beta goal is active.

See [contract](STRUCTURAL_BLOCKS.md#flat-list-dom-selection-bridge-and-wasm-coordinates)
and [verification](qualification/2026-10-04-flat-list-selection-bridge.json).

## Flat-list update checkpoint

Consecutive list snapshots now have owned, independently validated update plans.
Unchanged root subtrees retain DOM identity, including whole lists shifted by a
root edit, with every descendant path remapped. Changed lists use root replacement;
the old direct-paragraph impact is never reinterpreted as nested coordinates.
Generated update/child handles share the established ownership and cleanup guards.

All 1,619 browser tests and strict TypeScript pass. Five runs each in Chromium,
Firefox and WebKit now execute generated selection, multiline list insertion and
undo updates through the renderer and selection bridge. Shipping artifacts remain
unchanged. This is an integrated low-level transition path, not yet the editor
controller or native keyboard/clipboard/IME qualification.

Next: browser owner/controller profile mode, toolbar/keyboard and visible demo
reload/backup behavior, followed by native-input and release qualification.
See [contract](STRUCTURAL_BLOCKS.md#flat-list-projection-updates-and-subtree-reuse)
and [verification](qualification/2026-10-04-flat-list-updates.json).

## Flat-list browser document checkpoint

The browser now validates explicitly selected list Document V2 payloads and
correlates them with owned hierarchical projections without flattening structure.
Tests cover malformed wrappers, nesting rejection, numbering overflow, exact
node/property budgets, Unicode, typed formats and unchanged legacy admission.
The real Wasm harness checks exported documents before/after edits and recovery.

All 1,636 browser tests and strict TypeScript pass; five runs each in Chromium,
Firefox and WebKit pass. Shipping artifacts remain unchanged. One initial test
fixture omitted required null paragraph heading fields; correcting that fixture
made the new projection comparison case exercise the intended boundary.

Next prerequisite for the controller: browser Session V6 operation preflight and
bootstrap V4. Session V6 is explicitly rejected at the browser boundary until that
work is complete. Toolbar/native editing, visible reload/recovery and release
qualification remain outstanding; no end-to-end list editor claim is made.
See [verification](qualification/2026-10-04-flat-list-browser-document.json).

## Flat-list browser session checkpoint

Explicit Session V6 now has bounded browser preflight for all three list recipes,
history topology, actual block paths, scalar boundaries, list result layouts and
retained serialized property accounting. Old modes and old text-block tags keep
their previous admission boundaries. Rust remains the authoritative replay gate;
browser shape acceptance is never treated as successful restoration.

All 1,668 browser tests and strict TypeScript pass. Five runs each in Chromium,
Firefox and WebKit cover all generated list recipe types, fresh-owner restore of
an unapplied redo branch, exact document and selection recovery, and rejection by
Rust of a shape-valid but inconsistent source guard. Shipping artifacts are
unchanged; nothing is pushed or published.

Next: explicit browser bootstrap V4 and list owner/controller integration, then
toolbar/keyboard, visible reload/backup and native-input/release qualification.
See [verification](qualification/2026-10-04-flat-list-browser-session.json).

## Flat-list browser bootstrap checkpoint

Explicit list startup/restore now uses the shared browser bootstrap ownership
machinery: Bootstrap V4 selects V6 factories, durable preflight runs before engine
construction, and the initial projection retains the hierarchy. Legacy startup
remains closed to this selector and never inspects optional list APIs. Metadata
preflight releases all generated owners; successful construction transfers exactly
three owners and checks that cleanup has not invalidated them.

All 1,689 browser tests and strict TypeScript pass. Five runs each in Chromium,
Firefox and WebKit cover fresh document bootstrap, session bootstrap with an
unapplied redo branch, and exact document/selection recovery after redo. Shipping
artifact hashes are unchanged; nothing is pushed or published.

Next: list command tokens and owner/controller integration, toolbar/keyboard,
visible reload/backup and native-input/release qualification. The low-level list
startup/restore path is verified; the user-facing list editor is not yet complete.
See [verification](qualification/2026-10-04-flat-list-browser-bootstrap.json).

## Flat-list command contract checkpoint

List selections can now be captured into exact, immutable command requests with
separate issued capabilities. They share base command validation and bounded
Unicode inputs, but cannot enter the legacy queue or masquerade as base delivery.
Tests cover all command shapes, backward selections, stale epochs/renders, wrong
authorities, copied/foreign selections, getter rejection and history requirements.

All 1,693 browser tests and strict TypeScript pass. Five runs each in Chromium,
Firefox and WebKit include native selection-to-request capture and stale-token
rejection. Shipping artifacts remain unchanged. No list queue execution or native
editing claim is made by this contract-only checkpoint.

Next: shared queue and Wasm adapter integration for these requests, then normal
controller/toolbar/keyboard delivery, visible persistence and release gates.
See [verification](qualification/2026-10-04-flat-list-command-contract.json).

## Flat-list shared queue checkpoint

The list queue now shares the existing FIFO, capacity, reentrancy, uncertainty and
composition-reservation state machine. Its admission mode is captured privately;
legacy/base requests and cross-mode lease ports reject. Tests exercise reentrant
executor/observer work, stale delivery rejection by the owner, terminal failures,
single-use leases, disposal during inspection and public-method overrides.

All 1,704 browser tests and strict TypeScript pass. Five runs each in Chromium,
Firefox and WebKit include list queue/state and lease scenarios alongside the
existing real-Wasm recovery checks. Shipping artifacts are unchanged.

Next: connect list queue requests to the shared Wasm command adapter and editor
controller. The queue is ready for that connection, not yet a user-facing editor
command path. Toolbar/native-input and persistence/release gates remain open.
See [verification](qualification/2026-10-04-flat-list-command-queue.json).

## Flat-list adapter cleanup and text-export checkpoint

List projection updates and selections now accept the owning command result's
already-captured cleanup. Both list and legacy paths share the same consumption
guards: cleanup runs once, active parent/child views cannot be consumed again,
outer owner aliases remain protected, and cleanup failure rejects the result.
Legacy entry points still reject list projections.

The DOM-independent list plain-text exporter joins text blocks in document order
with one LF, preserving empty items, Unicode and the snapshot. It intentionally
omits bullets, numbers, headings and inline formatting; Document JSON is the
lossless export. The existing 8,398,607-byte ceiling is unchanged. A valid list
AST may exceed that export ceiling because it can contain more than 10,000 text
blocks across containers; export then rejects rather than truncating text.

All 1,722 browser tests and strict TypeScript pass. Five runs each in Chromium,
Firefox and WebKit exercise the captured-cleanup handoff with real Wasm views
and exact list text export, alongside the retained recovery and DOM scenarios.
Shipping hashes are unchanged. Next is the shared production Wasm command adapter;
this checkpoint does not claim toolbar, native typing, IME or clipboard integration.
See [verification](qualification/2026-10-04-flat-list-adapter-content.json).

## Flat-list production command adapter checkpoint

`BreditorFlatListWasmCommandAdapter` now delivers list requests through the same
private ownership/publication state machine as paragraph/heading commands.
Construction requires the explicit V6 durable contract, an owned hierarchical
render and list selection bridge. Existing adapter construction, request types
and package entry points remain unchanged. The fixed mode selects request/token
admission, selection conversion, update consumption, rendering and content
correlation; it does not flatten lists into legacy projections.

Real-Wasm browser scenarios now use the production queue and adapter to insert
multiline text inside an ordered heading item, undo/redo with exact document and
selection restoration, save an unapplied redo branch and recover it in a fresh
adapter. They also prove stale-token rejection, DOM-drift reconciliation and a
post-commit renderer failure: the Rust edit remains authoritative, content and
checkpoint reads remain available, recovery does not repeat the edit, and undo
reverses it exactly once. Generated cleanup failures remain permanently faulted.

All 1,731 browser tests, strict TypeScript and temporary declaration emission
pass. Five runs each in Chromium, Firefox and WebKit pass the expanded scenario.
Shipping hashes remain unchanged. No push, publish, size qualification or broad
historical WebKit resolution is claimed.

Next: high-level list owner/controller, toolbar and keyboard integration. Native
list composition leases deliberately reject before mutation until their own
integration is complete; this is an unfinished beta requirement, not a reduced
product scope. Clipboard, visible persistence, native-input/accessibility and
release gates also remain open.
See [verification](qualification/2026-10-04-flat-list-command-adapter.json).

## Flat-list ordinary event controller checkpoint

`BreditorFlatListBrowserEventController` now shares the existing event admission,
cancellation, selection-change, target-range and keyboard-echo state machine.
Explicit list beforeinput/keyboard translators share the same syntax and shortcut
policy as the base translators. They select list editing actions while preserving
named formatting intents, history boundaries and custom compiled shortcuts.
Legacy controllers and translators remain closed to list inputs.

Native target ranges now have a separate owned hierarchical representation. The
shared DOM mapper checks canonical render, host ownership, native ordering and
Unicode scalar boundaries, retaining full list-item paths. The narrowly supported
Chromium trailing-space alias compares complete text paths and cannot jump to
another item. Selection-change requests preserve the existing history policy.

All 1,748 browser tests, strict TypeScript and temporary declaration emission
pass. Five runs each in Chromium, Firefox and WebKit exercise the production
controller with platform-branded synthetic input/keyboard events, native selection,
real Wasm editing, duplicate-echo suppression and session recovery. The harness
reads exact Rust affinities independently of native DOM endpoints, without
consuming the controller's one-use programmatic selection receipt as a diagnostic
side effect. DOM selections themselves do not store affinity.

Next: high-level owner/router and toolbar integration, then list composition and
clipboard. These controller checks do not qualify physical typing, OS input
methods or the complete visible editor. Shipping artifacts remain unchanged;
nothing is pushed or published.
See [verification](qualification/2026-10-04-flat-list-event-controller.json).

## Flat-list toolbar checkpoint

The existing native toolbar now has an internal 14-control list manifest and an
exact-owner immediate dispatcher. Headings, paragraph conversion, bullet/numbered
lists and Remove list use profile-owned intents; formatting and undo/redo share
the same queue/adapter path. Busy queues reject instead of retaining a toolbar
action for later. Invocation snapshots, private capabilities, terminal uncertainty
and disposal behavior are covered by ten additional unit tests.

All 1,758 browser tests, strict TypeScript and temporary declaration emission
pass. Five runs each in Chromium, Firefox and WebKit prove rank conversion,
partial unwrapping with following ordinal preservation, bullet/number conversion,
state publication and exact undo/redo of a backward emoji selection. WebKit clears
the visible range when keyboard focus returns to a toolbar button; the checks
separately prove the installed native range, retained Rust selection and explicit
return-to-editor restoration. No production focus workaround was introduced.

Next: high-level list editor owner/router, then composition and supported
clipboard integration, visible persistence and native-input/release gates.
Nested lists remain deferred. Shipping hashes are unchanged; nothing was pushed
or published. See [verification](qualification/2026-10-04-flat-list-toolbar.json).

## Flat-list composition lease and reconciliation checkpoint

The production list adapter now owns composition leases through the same private
state machine as the base adapter. Separate list token/renderer entry points
preserve exact snapshot, render, selection, epoch, session and owner binding.
Normal delivery is unavailable while the lease is active. Refinement is one-use;
restoration spends the lease before DOM effects and returns a fresh normal token.
Render/selection restoration failure requires reconciliation, never token replay.
Recovery and disposal restore the authoritative base without applying native text
to Rust or creating history.

The shared strict DOM scanner now traverses the actual list hierarchy. It checks
root/list/item topology, exact ordered start, heading ranks and every non-target
block. Only one captured text block may change; admitted inline wrappers, exact
unchanged prefix/suffix, Unicode and existing resource limits still apply. Results
carry the real text-block path, not a flattened paragraph index. Cross-item
composition rejects, matching the established single-block lease boundary.

All 1,788 browser tests (30 new), strict TypeScript and temporary declaration
emission pass. Five runs each in Chromium, Firefox and WebKit exercise scripted
native-DOM replacement of an emoji inside a numbered heading, strict restoration,
normal queued Rust commit, exact undo and redo recovered from a saved checkpoint.
Changing the ordered start during the lease rejects and restores the base while
preserving that redo branch. A stale selection capability after synchronization
rejects before opening or spending a lease.

This is adapter/renderer protocol qualification, not composition-event scheduling
or OS IME certification. Next is list composition-controller routing, followed by
clipboard and full editor owner/router integration, visible reload/backup and
native/release gates. Shipping artifacts remain unchanged; nothing was pushed or
published. See [verification](qualification/2026-10-04-flat-list-composition-lease.json).

## Flat-list composition event controller checkpoint

`BreditorFlatListCompositionController` now shares the existing private event,
evidence, scheduling, lease, quarantine/recovery and echo state machine with the
base controller. Its fixed list mode requires the list queue, bridge, render and
exact adapter executor. Target refinement compares real text-block paths; settled
insert/delete commands select list actions through the shared command builder.
Cancellation retains the existing explicit close-history command policy.

A new failing regression identified a pre-existing shared refinement bug: an
ordered native target covering a backward range replaced its exact direction and
affinities. Refinement now retains the captured selection when both spans match
within the same block; a genuinely different target still receives a newly
validated selection. Base and list tests prove both behaviors.

All 1,799 browser tests (11 new), strict TypeScript and temporary declaration
emission pass. Five runs each in Chromium, Firefox and WebKit drive real
controllers with synthetic composition/input events through insertion, deletion,
multiline replacement and empty-item insertion. Exact undo/redo, saved redo in a
fresh Session V6 owner, queue exclusion, cancellation, structural recovery and
one-use late echoes pass. WebKit's synthetic constructor omits target ranges, so
the isolated harness supplies that platform method for the specific fixture
event and restores it immediately; this is not OS-input evidence.

Next: supported list clipboard flows and the full editor owner/router, then
visible persistence and physical native-input/accessibility/release gates.
Shipping artifacts are unchanged. Nothing was pushed or published. See
[verification](qualification/2026-10-04-flat-list-composition-controller.json).

## Flat-list clipboard checkpoint — 2026-10-04

The explicit list clipboard controller now shares the existing private clipboard
flow. It requires the list-mode queue/bridge and exact adapter executor, reads
owned hierarchical selections, and uses list-aware cut/plain-text insertion
requests. Cut still cannot delete until both clipboard representations and native
cancellation succeed. Reentrancy, stale DOM, write/cancellation failure,
authoritative plain text, bounded HTML-only admission and uncertainty retain the
same guarded behavior. One committed cut/paste authorizes at most one input echo.

Serialization visits actual text-block paths, retaining partial/empty slices and
Unicode boundaries without rewriting the document or exact selection. Clipboard
plain text and safe paragraph HTML deliberately omit list markers/heading ranks;
paste imports text, not structure or inline formatting. This beta boundary and
the unchanged resource limits are explicit in the event-pipeline contract.

Verification: 1,809 tests in 52 files, strict implementation/test types and
temporary declaration emission pass. The real-Wasm browser harness adds mixed-root
copy, backward emoji and cross-item cut, multiline plain/HTML-only paste, empty
bullet-item paste, one-use echoes, exact undo and saved redo in a fresh Session V6
owner. Browser results and fixture corrections are recorded in
[qualification](qualification/2026-10-04-flat-list-clipboard.json).

Next: wire these controllers into the complete list editor owner/router, then
visible persistence and physical native-input/accessibility/release gates.
Shipping artifacts remain unchanged. Nothing was pushed or published.

## Flat-list event-router checkpoint — 2026-10-04

The list ordinary-input, composition and clipboard controllers now share one
installed native-listener boundary. `BreditorFlatListBrowserEventRouter` and the
existing base router use the same private lifecycle implementation. Mode remains
explicit, host ownership is shared across modes, and the controller constructors
retain exact queue/executor/bridge binding. No second input translation table was
added.

New unit coverage checks wrong-mode queues, duplicate/reentrant host ownership,
construction rollback, exclusive routing priority, clipboard/document listeners,
deferred repair and stale tasks, disposal and fail-stop behavior. Browser scenarios
dispatch actual native-branded synthetic events through installed listeners and
the real list Wasm engine. They prove text insertion, cut/paste, composition,
keyboard undo echoes, exact saved-redo recovery, inert composition-time selection
observations, and canonical repair after uncancelled native mutation. A valid
late composition echo also proves render identity remains unchanged.

Next: integrate the high-level list editor owner, visible reload/backup and
autosave, then physical native-input/accessibility and packaging/size/performance
gates. The router is internal; the shipping entry point and artifacts remain
unchanged. Nothing was pushed or published. See
[qualification](qualification/2026-10-04-flat-list-event-router.json).

## Flat-list persistence prerequisite — 2026-10-04

High-level owner integration exposed a concrete gap: IndexedDB binding admission
and stored-record parsing accepted session versions 1/2/3/5 but not list Session
V6. Three new regressions reproduced that failure before the change. Explicit
V6 bindings now use the existing outer-V2 envelope, slot/fingerprint isolation,
16 MiB limits, digest and atomic CAS path. No database version, default slot,
history format or automatic migration changed.

The real-Wasm browser harness now also awaits native IndexedDB/SHA-256 autosave
checks. It saves an undone list edit, reopens storage, restores a fresh profile
owner, verifies the exact directional selection, redoes and persists, then
restores another owner and undoes. Wrong profile/session bindings and foreign
tokens reject. A stale competing editor's real autosave pauses on conflict and
cannot overwrite the saved winner even on explicit retry. This is real browser
storage, not a fake IndexedDB implementation, though native typing remains a
separate gate.

Next remains the shared high-level list editor owner and visible persistence
UI, now with its storage prerequisite available. Source declarations explicitly
admit V6; packaged artifacts are unchanged. Nothing was pushed or published. See
[qualification](qualification/2026-10-04-flat-list-persistence.json).

## Flat-list high-level owner checkpoint — 2026-10-04

The explicit experimental `BreditorBrowserEditor.openFlatLists` factory now owns
the complete list startup lifecycle: V4 profile bootstrap, list rendering and
selection, exact adapter-bound queue, native controllers, 14-control default
toolbar, intent API and V6 persistence. It shares the ordinary owner's lifecycle,
host reservation, action-state publication, autosave and disposal implementation.
There is no implicit mode detection or fallback to the base engine. Source API
is extended, but packaged JavaScript, declarations and Wasm remain unchanged.

Ordinary startup rejects V4 options both at runtime and in TypeScript. A new
compile-time regression exposed structural assignability through the legacy
unversioned profile branch; an optional-never version field closes that hole.
Missing/wrong list profiles, aborted startup, unsupported Wasm and backup plus
persistence reject before fallback or unwanted storage access.

The real-browser scenario uses only the high-level API and installed listeners.
It preserves a backward emoji selection, edits multiline list text, undoes,
flushes, disposes and reopens the saved slot, then redoes exactly. A V6 backup
restores independently with autosave disabled. Toolbar/API operations remain
coherent. Injected partial listener installation proves failed startup removes
its list roots and toolbar, restores host attributes, preserves application-owned
content and releases the host for a successful retry.

Verification: 1,826 tests in 52 files, strict implementation/test types, temporary
declarations and five runs each in Chromium, Firefox and WebKit pass. See
[qualification](qualification/2026-10-04-flat-list-editor-owner.json).
Next is the visible list demo with reload/backup/autosave UI, followed by physical
input/clipboard/IME, accessibility and release size/performance gates. This does
not establish physical-input support or resolve the historical WebKit fault.
Nothing was pushed or published.

## Visible flat-list demo and native target alias checkpoint — 2026-10-04

The separate [list preview](../examples/lists/README.md) now composes ten
structural toolbar controls with the existing eleven inline/history controls.
It reuses React ownership, autosave status/retry, backup download and independent
recovery, explicitly binding the V4 profile to the V6 list owner. Standard,
heading and list storage identities remain separate. Its source-only browser
alias and qualified Wasm candidate build into `target/list-demo`, not package
artifacts.

Real browser keyboard tests found typing at a child-boundary caret was canceled
in Chromium and WebKit. Native tracing showed the caret at `(P, 1)` and the
target at `(#text, 18)` represented the same position. Exact endpoint-shape and
affinity comparison incorrectly rejected it. Four unit regressions failed before
the shared controller fix. It now compares validated spatial endpoints, retaining
the original exact selection for history; different block paths still reject.
The list router scenario additionally proves exact undo and fresh-owner redo.

All twelve production list-demo checks pass across Chromium, Firefox and WebKit:
heading ranks, list conversion/removal, typed Link/size, backup and redo recovery,
keyboard typing/Enter, automated accessibility and 390px layout. Unit verification
passes 1,830 browser tests and 34 React tests. The
[qualification record](qualification/2026-10-04-flat-list-react-demo.json)
preserves development failures and distinguishes automated keyboard events from
physical clipboard, OS IME and screen-reader qualification.

The existing heading demo passes 9/9 and the standard demo passes 39/39 on a
separate recheck. An earlier standard run hit an internal Firefox axe error and
the whole-suite time limit; that evidence is retained rather than erased by the
passing rerun. The recheck allowed 240 seconds for the suite without changing
individual assertions or retrying tests. Shipping artifact hashes are unchanged.

Next: physical desktop input/clipboard/IME and assistive-technology qualification,
then source/package load, size/performance and release gates. Nested lists remain
deferred. This fixes a reproduced target-alias defect, not the historical
intermittent WebKit fault. Nothing was pushed or published.
