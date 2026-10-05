# Feature-expansion beta goal

Agreed scope, October 3, 2026: a desktop-first editor with end-to-end headings
and **flat bullet/numbered lists first**. Nested lists and indent/outdent follow
in a later milestone, per the user's choice.

The goal is visible, usable features built on the existing Rust contracts.
Additional storage machinery is not a prerequisite unless the chosen browser
session-backup/autosave path actually requires it. No publishing or pushing is
authorized by this plan.

## Current readiness — October 5, 2026

The latest Rust change reuses canonical immutable list-item wrappers during
flat-list layout construction (see the October 5 wrapper-reuse checkpoint below).
The prior path-reuse implementation checkpoint is `cc8f1d7`. Headings, flat lists,
directional selection, toolbar actions, undo/redo and V6 reload/recovery are
implemented in the **private experimental profile**, not the default shipping
bundle. The earlier `62b2e90` qualification passed 1,135 core tests, strict workspace
Clippy, private Wasm/package checks, 165 existing browser cases and 54 list-demo
cases. A subsequent run passed all 39 React cases on the same candidate, without
retries. See [exact-source proof qualification](qualification/2026-10-04-flat-list-source-proof-reuse.json)
for the artifact identities, retained failed runs and complete limits.
The [native comparison follow-up](qualification/2026-10-04-native-retained-bundle-and-latest-react.json)
records the React run and partial native Safari checks on the latest candidate.
The [current-source workspace gates](qualification/2026-10-04-current-source-workspace-gates.json)
also passed 1,192 Rust unit, 714 integration and 137 documentation tests; 2,293
JavaScript workspace/diagnostic tests; all 68 script tests; TypeScript checks;
strict Rust documentation; real wasm32 checks; and the unchanged default ABI.
These checks preserve shipping bundles and do not constitute the full release gate.

The October 5 IME follow-up adds blur termination to the list composition,
cancellation and invalid-DOM recovery tests. It also refreshes private packages
from the fixed browser source, without diagnostic instrumentation. See
[packaged IME integration evidence](qualification/2026-10-05-ime-packaged-integration.json)
for exact artifacts, retained failed test-observation experiments and results.

The current path-reuse candidate passes 1,137 core unit tests, strict core
all-target/all-feature Clippy, raw Wasm and installed-package checks in three
engines, and all 63 cases of the full installed opt-in demo. These focused checks
do not re-run every older workspace gate. See
[path reuse qualification](qualification/2026-10-05-flat-list-path-reuse.json).
The subsequent wrapper-reuse candidate passes 1,140 core unit tests, strict core
Clippy, raw Wasm, private installed-package checks and all 63 full opt-in demo
cases without failures, skips or retries. Native evidence below
still applies to the prior `ktXUh6` opt-in artifact; it is not automatically
transferred to the new `lHoc14` candidate.

The beta is **not release-qualified**. The remaining gates are:

- Native Safari/Chrome qualification on the final candidate, plus real Japanese
  IME and spoken VoiceOver evidence. Earlier native passes apply only to their
  recorded artifacts. Safari is accessible again; earlier-candidate typing and
  heading/list Undo/Redo checks passed. Earlier-candidate native Safari and Chrome
  clipboard checks also passed: single-item copy/cut/paste and cross-item
  copy/cut in both directions, including exact payloads and one-step undo.
  See [native clipboard/control evidence](qualification/2026-10-04-latest-native-clipboard-and-selection-control.json).
  Earlier-candidate native reload retained pending Redo in both browsers. Chrome
  backup export/import and Chrome-to-Safari recovery passed, including all five
  heading/list/Link history steps and recovery isolation from main autosave.
  See [native reload/recovery evidence](qualification/2026-10-04-native-reload-and-cross-browser-recovery.json)
  for exact scenarios and limits. Physical Japanese–Romaji insertion and selected
  text replacement now pass in native Safari, including blur settlement and
  one-step Undo/Redo after the composition fix. These are bounded checks on the
  recorded diagnostic artifacts, not general IME certification. Physical Escape
  cancellation, broader input-method qualification and spoken VoiceOver remain
  open. See [physical Japanese evidence](qualification/2026-10-05-native-japanese-composition-fault.json).
- The retained intermittent WebKit `queueUncertain` fault. Passing reruns and
  improved diagnostics have not identified its cause or demonstrated a fix.
  The original unchanged failing bundle completed three native Safari runs and
  three fresh bundled-WebKit runs; neither reproduced the fault. A separate
  accessibility select-text control placed a caret in the preceding item while
  native click/keyboard positioning worked. That discrepancy now reproduces on
  plain contenteditable HTML with no JavaScript or Wasm: it does not require
  Breditor, but Safari accessibility versus automation attribution remains open.
- Native qualification and reviewed budgets for the approved
  **separate opt-in package**. The first self-contained
  `@breditor/experimental-flat-lists` tarball now passes external Node, TypeScript
  and three-browser consumer checks. It bundles its paired browser/Wasm runtime
  without replacing the default packages. All 63 full feature-demo cases now
  pass against the installed package, with a checked module graph and retained
  runtime identities. Native-tested opt-in artifact `ktXUh6` also passes bounded
  agent-operated native Safari copy/cut/paste, typing, heading/list conversion
  and Link Undo/Redo checks. Its captured owner is live at revision 56 with no
  faults, pending events or drops. That artifact's native Chrome also passes
  clipboard, typing, structural formatting and Link history checks (live owner
  revision 54, no faults/pending events/drops), plus autosave reload with pending
  Redo and native backup export/import. Recovered history remains isolated from
  primary autosave. Native Safari now also retains heading/list history and
  pending Redo across reload. Backups exported by Chrome and Safari recover in
  the other browser, with both history steps replayed and original autosaves
  unchanged after recovery edits and reload. Human attestation and IME/VoiceOver
  qualification remain open; these are bounded cases, not broad browser certification. Functional
  checks do not approve larger budgets or a release. See
  [read-only opt-in size audit](qualification/2026-10-05-opt-in-size-audit.json)
  for exact archive/unpacked sizes and every emitted demo asset. Proposed
  separate ceilings are awaiting the user's decision; no default limit changed.
  Also see
  [native opt-in Safari evidence](qualification/2026-10-05-opt-in-native-safari.json),
  [native opt-in Chrome and recovery evidence](qualification/2026-10-05-opt-in-native-chrome.json),
  [bidirectional native recovery evidence](qualification/2026-10-05-opt-in-native-cross-browser-recovery.json),
  [opt-in delivery evidence](qualification/2026-10-05-opt-in-flat-list-package.json)
  and [installed-demo evidence](qualification/2026-10-05-opt-in-full-demo.json).
- Large-list responsiveness and the complete final release gate. Latest local
  repeated 500-item edit medians on the wrapper-reuse candidate are 48.9 ms
  Chromium, 119 ms Firefox and 78 ms WebKit. The Chromium edit gain did not
  repeat, and WebKit baselines varied substantially; these small synthetic samples are
  not native-input latency guarantees
  or a supported maximum document size.

The first source-proof browser runs encountered disk exhaustion and are retained,
not counted as passes. Removing only rebuildable Rust incremental cache restored
headroom; both complete browser suites then passed. This does not explain or
resolve the separate historical WebKit fault. Shipping artifacts remain unchanged;
no version bump, push or publication has occurred in these checkpoints.

The sections below retain chronological implementation evidence. Statements such
as “unfinished” in an older checkpoint describe that checkpoint, not necessarily
the current feature state; consult the current gates above and exact artifact
records before making a support or release claim.

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

## Isolated flat-list package consumer checkpoint — 2026-10-04

The source-alias demo is now backed by an independent delivery proof.
`npm run test:lists:packages -- <qualified-candidate>` emits current browser
source and stages experimental Wasm in private, non-publishable package copies.
It packs and installs both offline into a fresh external consumer alongside
locally packed parse5/entities dependencies. Package hooks are disabled, no
workspace symlinks or repository imports are used, and shipping browser/Wasm,
reference and standard-demo artifact trees are hash-checked before and after.

Strict consumer types preserve the ordinary/list startup distinction and require
backup restoration to omit persistence. All three browser engines pass installed
package startup, list toolbar conversion, undo, exact V6 backup restoration and
redo. The existing paragraph-only Node import, TypeScript and Chromium runtime
smoke also passes against the same experimental tarballs. This verifies a
functional package boundary, not a final supported package naming/load contract.
A second fresh external-consumer run passes and produces byte-identical Breditor
tarballs; all four shipping artifact trees remain unchanged.

Measured current-source output exceeds unchanged default ceilings: browser JS
1,198,207 bytes versus 1,085,000; declarations 320,017 versus 276,000; browser
tarball 298,780 versus 270,000; Wasm tarball 641,145 versus 525,000. The minimal
list consumer bundles to 679,773 JS bytes / 169,145 gzip-9 bytes, excluding Wasm;
it is not comparable to the full React showcase as an application budget.
No budget was raised and no shipping artifact was replaced. An optional delivery
and size decision remains required before release.

Native app control was unavailable because the Mac was locked; an unlock request
is pending. That does not block package/performance work and is not evidence of
native-input failure or success. Physical clipboard/IME and assistive-technology,
performance and complete release qualification remain open. See
[qualification](qualification/2026-10-04-flat-list-packed-consumer.json).
Nothing was pushed or published.

## Large-list export and measurement checkpoint — 2026-10-04

The installed-package measurement fixture now exercises 10, 100 and 500-item
ordered lists with headings and Unicode text. It measures startup, selection,
typing, undo, backup, disposal, restoration and redo, checking exact document
and selection recovery outside measured spans. Each size has three independent
owners; bounded repeated-browser runs stop at the first failure. Failed and
successful reports are retained with artifact hashes. No timing threshold is
silently promoted to a supported document limit.

This exposed an intermittent WebKit document-export rejection in
`documentTextBlockMatches`: the optional heading-rank inequality rejected,
while subsequent diagnostic reads saw numeric `2` on both sides. The document
reader had accepted the export; the projection consistency check rejected it.
Those subsequent observations do not establish a WebKit compiler root cause.
Replacing the inequality with captured `Object.is` also failed and was discarded.

The retained candidate compares distinct semantic labels for already-validated
paragraphs and heading ranks 1–6. This preserves the exact accepted domain;
it adds no retries, numeric rounding, validation bypass or Rust/Wasm changes.
Seven tests cover all 49 admitted rank pairings. All 1,837 browser-package unit
tests pass, as do strict types and fresh packed consumers in all three browsers.
The uninstrumented candidate completed ten fresh WebKit processes (90 measured
cases plus ten warm-ups), then the full three-engine fixture (27 measured cases).
See [the reproduction and verification record](qualification/2026-10-04-flat-list-performance.json).

Performance is still an open beta gate. In the final local M1 Pro sample,
500-item edits took median 127 ms in Chromium, 632 ms in Firefox and 182 ms in
WebKit. These three-sample, forced-layout timings are neither p95 nor a controlled
before/after speed comparison; earlier runs varied materially. This checkpoint
does not claim to improve latency. Next: profile repeated whole-document work
without dropping ownership/canonical-DOM validation, then qualify an explicit
optional delivery budget and native desktop input. The historic broader WebKit
issue, native clipboard/IME/assistive-technology checks and the complete release
gate are not declared fixed/passed by this narrower result. Flat lists remain
first; nesting stays deferred. Shipping artifact trees are unchanged.

## First measured Rust work reduction — 2026-10-04

An opt-in, unminified Chromium CPU profile located substantial fixture time in
toolbar action-state preflight (about 841 ms inclusive) and canonical DOM/map
validation (about 603 ms inclusive), out of a 2,652 ms sampled run. The fixture
also includes startup and untimed correctness assertions; these are not typing
latency percentages. The raw call tree is retained, and the profiler has no
shipping/runtime hooks.

`FlatListTextReplace::apply` was deriving the same immutable replacement once
inside validation and again afterward. It now retains the derivation validated
by that call. Every application still checks schema/proof identity, resource
limits, complete source/result roots, exact source guards and the complete final
document. Nothing is cached between calls or contexts. A new test applies the
same operation successfully, rejects it when an unguarded sibling fills the
document budget, then verifies repeat application and its exact inverse.

All 1,118 experimental Rust library tests pass. An isolated Wasm rebuild retains
the same declaration hash and durable versions; raw Wasm and full list DOM,
queue, toolbar, synthetic composition/clipboard, autosave and recovery scenarios
pass five times per browser engine. Fresh private installed-package consumers
also pass in all three engines. Shipping outputs and size ceilings stay intact.

The production A/B/A measurement runs all passed correctness checks. Their
500-item edit medians (old/new/old) were Chromium 182/161/157 ms, Firefox
846/709/706 ms and WebKit 248/210/220 ms. Thus the first apparent improvement was
partly environmental variation: no reliable overall speedup or release latency
claim is made. The deterministic result is one fewer derivation per application.
See [evidence](qualification/2026-10-04-flat-list-derivation-reuse.json).

Next target: heading-kind actions currently reconstruct every block of a guarded
list even when only one item changes. Preserve the complete root guards and
layout, but investigate restricting the replacement range/fragments to touched
blocks. Native app control was rechecked and the Mac remains locked; clipboard,
IME and assistive-technology qualification are still pending. The beta goal
remains active; nothing was pushed or published.

The final profiling-mode check timed out once waiting for the fixture's completed
status; no browser error was reported, and its partial CPU trace was saved. A
separate recheck with unchanged fixture, assertions and timeout passed. The runner
now records DOM fixture status/output on failure as well. This improves the next
diagnostic; it does not establish why the original profiling timeout occurred.
Ordinary production A/B/A and DOM checks above passed independently.

## Narrow heading replacement payloads — 2026-10-04

The first beta remains flat bullet/numbered lists; nested lists follow later,
as explicitly selected by the user. Paragraph/heading actions now replace only
the touched block span. Complete intersected root children remain source guards,
and the full list layout, numbering and final-document validation are unchanged.
This is not a constant-time edit: guards are still traversed and list containers
are rebuilt. No new operation tag, durable generation or public API was added.

Two strengthened regressions first failed on the old action: a one-item edit
inserted three blocks instead of one, and an end-at-zero selection included an
excluded item in its replacement payload. Both now pass, with all 1,118 Rust
library tests, strict Clippy and formatting checks. Tests retain exact selection,
pending formats and undo/redo checks across all heading levels, empty/Unicode
items, reverse selections and mixed root families, and add V6 recipe round trips.

The isolated Wasm candidate passes ABI/Node checks and five raw-Wasm plus five
full list DOM/recovery runs per engine. Fresh private installed-package consumers
pass in Chromium, Firefox and WebKit, including the ordinary base consumer.
Shipping outputs remain unchanged. See the retained
[qualification record](qualification/2026-10-04-flat-list-heading-span.json).

All 81 production A/B/A correctness cases passed. The 500-item edit medians
(old/new/old) were Chromium 118/93/86 ms, Firefox 493/456/518 ms and WebKit
175/167/165 ms. This does not establish an overall speedup: old-build results
also drifted, and large-list latency remains open. The verified reduction is in
the replacement span/payload, not a release-performance claim.

Next: isolate the remaining action-state and DOM-validation costs before choosing
another optimization. Native clipboard/IME/accessibility evidence, package-size
and delivery qualification, broader historical WebKit investigation and the
unexplained profiling timeout remain open. Nothing was pushed or published; the
feature-expansion goal is still active.

## Avoid repeated parsing of unchanged list items — 2026-10-04

Text-preservation derivation still parses every source block, but now reparses
only the rebuilt output span. Unchanged prefixes/suffixes are exact immutable
source clones. For an equal-count replacement touching one of 500 items, this
avoids 499 output-fragment parses and comparisons per derivation. Full source,
result-root and final-document validation, inverse checks and wire behavior
remain unchanged. No cross-call cache or incremental publication proof was added.

Two added tests pass before and after the optimization: non-text children in an
untouched prefix/suffix must still be rejected; formatting/layout-only changes
preserve text, while equal-length different text does not. Empty text, emoji,
combining characters and exact inverse recovery are included. All 1,120 Rust
library tests, strict Clippy, formatting, ABI/Node checks, five raw-Wasm and five
full DOM/recovery runs per engine, and private installed-package consumers pass.

Four alternating production runs (old/new/old/new) passed all 108 measured
correctness cases. Firefox's 500-item edit medians were 349/317/349/319 ms:
about 9% lower on this machine in both candidate runs. Chromium measured
82.2/80.5/81.9/76.1 ms; WebKit 122/119/122/122 ms. These are local observations,
not a general speed guarantee or completed latency gate. See the
[evidence](qualification/2026-10-04-flat-list-text-preservation.json).

The Mac was rechecked and remains locked, so physical clipboard, OS IME and
assistive-technology qualification remain pending. Shipping files are unchanged,
size ceilings remain exceeded, and nothing was pushed/published. Next: isolate
Rust action-state preparation from DOM validation with a focused measurement;
retain complete readiness checks while investigating the remaining latency.

## Separate core preparation from browser work — 2026-10-04

The installed-package measurement runner now accepts `--core-only`, using the
same 10/100/500-item text documents but no editor DOM or high-level browser owner.
It times fresh action-state preparation, exact cache hits, post-edit/undo refresh,
raw editing, projection-handle acquisition, export and backup/restore/redo.
Projection-node inspection and correctness checks remain outside timed spans;
command results are not read through `projectionUpdate()`. The command Boolean
controls history-group closure, not rendering, and is false in this fixture.
These timings cannot simply be
subtracted from browser-owner timings, whose work and call sequence differ.

At 500 items, the final core fixture measured post-edit action-state refresh
medians of 21.8 ms Chromium, 203 ms Firefox and 19 ms WebKit. Raw insertion was
4.7/41/4 ms respectively. Exact cache-hit medians rounded to zero, not evidence
of zero work. The measured bottleneck is fresh preparation, not failed cache
reuse. Firefox has substantial core costs; browser validation/readback/rendering
remain separate targets, especially for the other engines. No runtime behavior
was changed by this diagnostic checkpoint.

The fixture checks complete unique fault-free catalog entries, exact snapshot
revision/lineage, unchanged cache contents, read-only document/selection/pending
formats, undo/redo availability, and exact document/selection through recovery.
Its initial assertion incorrectly excluded valid routed `blocked` outcomes; that
harness failure is retained. Corrected preliminary and strengthened final runs
passed all three engines. The unchanged full-browser fixture also passed all 27
cases; core-only Chromium CPU profiling passed nine cases and saved a trace.
See [evidence](qualification/2026-10-04-flat-list-core-measurement.json).

Next: resolve the hot Wasm functions to source or measure preparation phases
directly before changing readiness validation. The current production Wasm has
stripped function names, so a numeric profiler label is not a source-level
diagnosis. Packaging, native input/accessibility and full release gates remain
open; nothing was pushed or published.

## Source-named core profiling — 2026-10-04

An isolated `--diagnostic-names` build now retains Rust function names. It uses
the existing release optimization settings, a separate Cargo cache and all
existing ABI checks. Initial attempts failed ABI checks: retained target-feature
metadata changed bindgen transforms, then allocator names changed generated
exports. The diagnostic input now retains bindgen metadata and filtered function
names only; a byte comparison verifies that this metadata preparation itself
does not change executable sections. No ABI checks were loosened.

The final named build still has different executable bytes from the ordinary
build. Consequently, it was independently qualified and profiled, not used to
relabel the previous trace. All 14 ABI tests, strict TypeScript, Node checks,
five raw runs per engine, private packed consumers in Chromium/Firefox/WebKit,
and the ordinary base consumer passed. The fresh Chromium core profile passed
all nine cases. The ordinary build also passed its unchanged checks and retained
the exact previous Wasm hash. Eight metadata-helper tests cover malformed input
and preservation of executable sections.

The 555 ms whole-fixture diagnostic trace attributes sampled self time to
`memcmp` (73.1 ms), allocation, schema element lookup (25.0 ms),
`ValidationState::visit_element` (23.0 ms), `NodePath::try_child` (19.3 ms), and
JSON byte counting (16.2 ms). Caller stacks connect some comparisons and path
allocation to schema validation, including flat-list root validation. These are
optimization targets, not an exclusive action-state cost breakdown: the trace
also contains untimed correctness and recovery work, and optimized stacks may
be incomplete. See [evidence](qualification/2026-10-04-flat-list-named-profile.json).

Next: reduce avoidable allocation or repeated work within these validated paths,
with unchanged errors, resource limits and exact history behavior, then measure
the ordinary stripped build. No runtime behavior or shipping files changed in
this checkpoint. Flat lists remain the beta scope; nesting follows later.

## Avoid temporary path-vector growth — 2026-10-04

`NodePath::try_child` now reserves its final vector length before copying and
appending, rather than copying into a full vector and then growing it. Its Arc
representation, complete validation, depth ceiling, errors and wire formats are
unchanged. A regression covers all 256 extendable depths, indices 0/1/u32::MAX,
exact parent recovery and shared-source immutability. It passed on both the old
and new implementations. All 1,121 all-feature core tests, strict Clippy and
format checks passed, along with 698 default-feature core tests. The ordinary stripped candidate passed ABI/TypeScript,
Node, five raw-Wasm and five full DOM/recovery runs per engine.

Four sequential old/new/old/new core measurements passed 108 correctness cases.
At 500 items, post-edit action-state medians were 22.1/19.8/21.9/20.0 ms in
Chromium, 203/191/204/192 ms in Firefox and 19/18/19/18 ms in WebKit. This is a
repeatable local improvement in that phase, not a completed responsiveness gate.
One preliminary baseline overlapped compilation and is retained but excluded
from this comparison. The candidate adds 91 raw Wasm bytes and 47 gzip-9 bytes;
existing delivery ceilings remain unchanged.

Qualification also exposed two unresolved timeouts. The first private package
run timed out at navigation without recording which engine; the checker now
preserves the browser, error, page snapshot and completed engines before teardown.
The subsequent package run passed, but does not resolve the original timeout.
A new/old/new full-editor comparison passed its first two runs, then timed out
in Firefox in the third. That failure contains nine case results but no status,
read in separate protocol calls. Failure status/payload are now captured in one
evaluation to avoid mixed-time evidence. Three further fresh Firefox runs passed
27 cases with the original deadline; the failure remains unexplained. No timeout
was increased, assertion removed or polling behavior changed.

The full-editor results do not justify a broad speedup claim: initial new/old
500-item edit medians were 75/76.4 ms Chromium, 307/318 ms Firefox and 130/117 ms
WebKit. Browser-level variance/regression investigation remains necessary.
Three additional fresh WebKit candidate runs measured 123/119/117 ms; three
baseline runs measured 119/118/121 ms, with all 54 cases passing. The original
130 ms observation did not repeat, and these overlapping ranges do not establish
an end-to-end WebKit improvement or persistent regression.
See [evidence](qualification/2026-10-04-node-path-allocation.json).
The Mac remains locked, so native input/accessibility gates remain open.
Shipping files are unchanged and nothing was pushed/published.

## Reuse schema rules within each element visit — 2026-10-04

Document validation now borrows one immutable element definition per visit and
passes its property, entity-ID and child rules to the existing checks. This
removes repeated BTreeMap lookups, not validation work: every node, property,
identity, child grammar and resource limit is still checked in the original
order. No validation-result cache, new proof, fingerprint or wire format was
introduced. The new accessor is internal to the schema module.

A regression passed before and after the change, asserting the exact ordered
codes, paths, subjects and details for an unknown element with forbidden
properties/identity and a descendant with a duplicate identity. All 1,122
all-feature and 699 default core tests passed, as did 52 targeted integration
contracts, strict Clippy and formatting. Initial Clippy failure was test import
placement, corrected without changing runtime code. The ordinary stripped Wasm
candidate passed ABI/TypeScript/Node checks, five raw and five DOM/recovery runs
per engine, and private installed consumers in all three engines. It is 17 raw
bytes smaller and 43 gzip-9 bytes larger than the preceding candidate.

Four alternating core measurements and two full-editor measurements passed all
162 correctness cases. The new artifact's measured core preparation times were
lower in both alternating pairs, but the machine was not quiet: a process
snapshot during the full-editor comparison showed a background virtualization
process consuming 527% CPU. Nothing was stopped or reconfigured. The substantial
timing drift prevents a reliable percentage or release-latency claim; this
snapshot also does not prove the cause of earlier browser timeouts. See
[evidence](qualification/2026-10-04-element-definition-reuse.json).

The earlier package-navigation and Firefox completion timeouts remain open;
neither occurred in this checkpoint's runs. Default shipping trees are unchanged.
Optional delivery/size policy, native clipboard/IME/accessibility and the full
release gate remain pending. No push or publication was performed.

## Disposable headings/list clipboard qualification — 2026-10-04

The list demo now includes `/manual-clipboard.html`, a disposable real list
editor using the same profile and toolbar with no autosave. Its shared bounded
recorder excludes document, clipboard, scratch and input contents and adds the
qualified candidate's Wasm hash. The page provides native copy/cut/paste,
cross-item newline, numbering, caret, conversion and history instructions;
reports remain explicitly self-reported, not automatic certification.

All 24 production-demo checks passed across Chromium, Firefox and WebKit with
zero retries, plus strict demo/test TypeScript. New checks cover backward
cross-item synthetic clipboard transfer, exact DOM history, plaintext-only
paste, empty-middle-item exit, recording reset, API isolation, accessibility
and narrow layout. Physical input, OS IME and screen-reader gates remain open.

The initial run had one Firefox axe serialization failure and 20 passes. A
controlled comparison isolated it to the test's IndexedDB getter trap: no-guard
and clipboard-only scans passed, IndexedDB-only failed, then no-guard passed.
API-isolation checks and the unmodified-page accessibility scan are now separate;
no scanner rules, assertions or deadlines were relaxed. The original trace is
retained. This does not establish the lower-level scanner/engine cause or
resolve earlier qualification timeouts. See [evidence](qualification/2026-10-04-list-manual-clipboard.json).

Tests can use a separate validated port without reusing or stopping an existing
preview. Shipping artifact trees remain unchanged; no push or publication.
Flat bullet/numbered lists remain first, with nesting and indent/outdent deferred.

## Composition across the real list owner and autosave — 2026-10-04

Nine new scripted composition regressions pass across Chromium, Firefox and
WebKit, and the complete 33-case list-demo suite passes with zero retries.
Strict demo/test TypeScript also passes. A backward selection in a bold numbered
heading is replaced with CJK/emoji text; a second page must still see the durable
pre-composition document while the first owns provisional DOM. Settlement is one
edit, with exact document/selection undo, byte-identical V6 backup after reload,
and retained redo. Cancelled and invalid-structure compositions restore the base
without adding undo entries; the same owner accepts ordinary input afterward.

Exploratory failures caught fixture mistakes: waiting for autosave while holding
the composition lease, assuming a multi-character keyboard sequence was one undo
step, and using Playwright's generic `Event` for `compositionend`. Explicit native
event constructors now test the intended route. A blank-page diagnostic verified
the event-class mismatch; no product admission or validation was weakened.
Failed runs and the independent Firefox page-creation timeout remain recorded
in [evidence](qualification/2026-10-04-list-composition-persistence.json).

The multi-character typing observation warrants a separate undo-grouping
investigation; these composition tests use one ordinary keystroke to verify
recovery without assuming grouping semantics. Native input is still unqualified:
a fresh desktop inventory reports the Mac locked. Shipping trees and runtime
code are unchanged, and nothing was pushed or published. Delivery policy, size,
responsiveness, timeout investigation and full release gates remain open.

## Fix typing undo-group fragmentation — 2026-10-04

The prior checkpoint's typing-history follow-up is now reproduced and fixed in
the browser selection bridge. Before the fix, typing `ABC` at the start or
middle of a numbered item failed one-step undo; typing at its end passed.
Consuming the one-use programmatic echo also discarded exact Rust affinity.
A later read of the unchanged interior caret derived a different affinity,
causing Rust to correctly publish a selection change and close the merge group.

Echo suppression is still one-use, but an exact-affinity sidecar now survives
repeated reads of the same canonical render and directional DOM signature.
Actual observed movement, wrapper aliases, stale generations, invalid DOM,
missing/outside selections, explicit clear and disposal still discard it.
No Rust equality, selection validation, wire format or shipping artifact changed.
The current selection contracts document the new repeated-read behavior and
the inherent inability to observe a move away/back that leaves no observation.

All 1,838 browser-runtime unit tests pass; the strengthened selection suite has
68 tests. All 45 list-demo cases pass in three engines, including grouped typing
through two reloads and distinct groups after ArrowLeft/ArrowRight returns to
the same offset. The ordinary paragraph editor passes 78 source-based browser
cases; the list DOM/controller/recovery harness passes five runs per engine.
Private installed packages pass the list matrix and existing base consumer.
Strict TypeScript passes. See [evidence](qualification/2026-10-04-typing-affinity.json).

This is a selection-bookkeeping fix, not a general WebKit or performance fix.
Native qualification, earlier timeouts, size/delivery decisions and full release
gates remain open. No push or publication was performed.

## Native Safari clipboard subset — 2026-10-04

The desktop became available. Native Safari app control now demonstrates exact
single-bullet copy/cut, one-step undo, numbered-item typing and redo, plaintext
paste once at the restored caret, forward cross-item copy, backward cross-item
cut and undo/redo restoring numbering from 3. Scratch-area output was inspected,
not inferred from trusted-event counts. The editor remained live with no recorded
fault. An initial accessibility selection request left a caret rather than a
range; keyboard selection with a visibly checked highlight passed without a
runtime change. Keep that failed setup separate from valid clipboard evidence.

The saved report deliberately remains incomplete: native formatting/conversion,
forward cut and Chrome checks remain, along with OS IME and screen-reader work.
CUA-driven native shortcuts are not a human physical-input certification, nor a
resolution of the earlier intermittent WebKit fault. See the artifact-bound
[native observations and report](qualification/2026-10-04-list-native-safari.json).

A fresh installed-package performance run passed all 27 correctness cases but
still showed substantial large-list latency, particularly in Firefox. Its exact
report hash is retained with these observations; no release performance claim
or size ceiling changed. Flat lists remain first, nesting later, as explicitly
confirmed by the user. No runtime changes, push or publication in this checkpoint.

## Native Safari and Chrome checklist completed — 2026-10-04

Both browsers now have an observed native-app checklist pass on the same
isolated candidate. Safari's existing recording was completed with heading-rank
changes, bullet/numbered conversion, unwrapping, Link apply/Undo/Redo and forward
cross-item cut. A fresh Chrome tab passed single-item and both-direction
cross-item copy/cut, typing and native paste, numbered history, the same
structural conversions and Link value restoration. Actual scratch-area paste
was checked; Chrome's accessibility selected-text rendering includes a marker
that the editor correctly excludes from its clipboard output.

Both reports end `operator-confirmed`, live and fault-free, with no pending or
dropped recorded events. This means the agent observed each checklist result
using native app controls, not that a human physically entered input or that
trusted events certify correctness. The original Safari invalid-selection
attempt remains in the report and is not counted as a passing clipboard case.
Exact asset hashes, reproduction steps, observations and full report snapshots
are saved in [native desktop evidence](qualification/2026-10-04-list-native-desktop.json).

This closes the disposable desktop clipboard/formatting checklist for these
observed runs. It does not close OS IME, screen-reader, native main-demo
reload/recovery, large-list responsiveness, delivery/size or full release gates.
The previous intermittent WebKit fault and timeouts remain unresolved; a passing
native scenario is not their reproduction or fix. No runtime change, push or
publication was made.

## Native typing, reload and cross-browser backup recovery — 2026-10-04

Safari and Chrome now both demonstrate a three-keystroke native typing group at
an interior numbered-list caret surviving reload. One Undo removes the whole
group; after saving, closing and reopening the test tab, one Redo restores it.
This directly exercises the recent affinity fix through real desktop input,
not only the scripted browser suite.

Chrome's downloaded V6 backup opens through the native file picker in both
Chrome and Safari. Each recovered editor independently undoes/redoes the group
with autosave off. Undoing the recovered copy and reloading leaves the main
autosave unchanged. Read-only assertions against the downloaded file confirm
one history entry containing three splice operations and the exact final caret
offset/affinity. See [native persistence evidence](qualification/2026-10-04-list-native-persistence.json).

With explicit user approval, Japanese–Romaji was temporarily installed and
VoiceOver temporarily enabled. Neither attempt qualified its gate: input-source
shortcuts produced Latin text rather than observed IME composition; VoiceOver
navigation/rotor and speech could not be observed through native app controls.
The rotor shortcut instead inserted a control character, which was undone.
No editor or OS cause is established by these observations. Canadian-only input,
the hidden input menu, original Globe action and English-only dictation language
were restored; VoiceOver was verified off again. Full observations and limits
are in [assistive-input evidence](qualification/2026-10-04-list-native-assistive-input.json).
These gates remain open. Native structural/formatted-history persistence and Safari export still
need distinct coverage; this run does not generalize beyond its tested route.
Performance, delivery/size decisions and full release qualification remain open.

## Native structural history and Safari export — 2026-10-04

Safari now has a native main-demo persistence observation for a selected heading
changed from rank 2 to 3, wrapped as a bullet, converted to numbered, and given a
typed Link. Reload retained the structure and selection; four separate Undos
reversed those edits. Reload with the redo branch then restored all four edits
individually, including the exact Link URL. Unrelated list contents and numbering
remained unchanged.

Safari exported the resulting V6 checkpoint, and Chrome imported that exact file
into an independent recovered editor with autosave off. All four Undo/Redo steps
worked there without changing Chrome's main document. Read-only assertions on the
download verify operation kinds, final rank/list layout, URL and exact logical
selection endpoints/affinities. See [native structural persistence evidence](qualification/2026-10-04-list-native-structural-persistence.json).

This closes the previously missing Safari export and this Safari-to-Chrome
structural-history route, not every native persistence scenario. Chrome-native
structural authoring/reload, broader selection cases, OS IME/screen-reader checks
and the existing release gates remain open. No runtime or shipping change was
needed, and nothing was pushed or published.

## Reuse the validator's traversal path — 2026-10-04

Full document validation now traverses with one private bounded path cursor,
rather than allocating a new owned path at every node. Retained issues and
entity-ID records receive independent immutable snapshots. Every recursive
return, including depth/resource/report cutoffs, restores the parent cursor.
All schema checks, depth limits, diagnostics and wire formats remain unchanged.

The new retained-path regression passed before and after the change. All 1,124
all-feature and 701 default core library tests passed, alongside strict Clippy,
formatting, generated ABI/TypeScript/Node checks, five raw and five full DOM
list/recovery runs per browser, and private packed consumers in all three engines.
The isolated Wasm is 57 raw bytes and 192 gzip-9 bytes smaller; shipping bundles
and existing size ceilings are unchanged.

Old/new/old/new core measurements passed 108 correctness cases. At 500 items,
post-edit action-state medians were 16/12.9/16.1/12.5 ms in Chromium,
137/107/136/110 ms in Firefox and 14/11/14/12 ms in WebKit. A further full-editor
old/new pair passed 54 cases, with edit medians 76.3/68.6, 240/204 and 122/118 ms
respectively. This supports a local preparation improvement, not a completed
responsiveness gate: samples are small, WebKit's full-editor ranges overlap,
background load was not controlled, and large Firefox lists remain slow.

Exact artifacts, report hashes and remaining limits are recorded in
[cursor qualification](qualification/2026-10-04-validation-path-cursor.json).
Earlier native evidence retains its original artifact identity. This candidate
does not close IME, screen-reader, size/delivery, prior intermittent fault or full
release gates. Nothing was pushed or published.

## Avoid duplicate reverse-map key construction — 2026-10-04

A fresh whole-editor Chromium CPU profile identifies repeated DOM/map checks as
material work, alongside native selection reads. Flat-list DOM validation now
compares reverse-path indices directly to the validated expected path, removing
one duplicate key serialization per mapped node. It still validates the entire
DOM and both map directions; no validation cache or subtree shortcut was added.

Six new identical-HTML clone regressions passed before and after the change:
replacing a mapped list/block/wrapper with an identical-looking clone must fail
immediately, before observer delivery. All 1,844 browser unit tests, strict
TypeScript, five full DOM/recovery runs per engine and private packed consumers
passed. Four alternating production measurements passed 108 correctness cases.
At 500 items, edit medians were 76.8/65.3/74.2/64.9 ms Chromium,
203/202/203/197 ms Firefox and 119/123/118/112 ms WebKit. The first candidate
WebKit run includes a retained 255 ms edit outlier. This is not a general WebKit
speedup claim or resolution of the prior intermittent faults.

The consumer bundle adds 21 raw bytes and 2 gzip-9 bytes. Existing size ceilings,
shipping bundles, native-input qualification and release limits remain unchanged.
See [map comparison evidence](qualification/2026-10-04-flat-list-map-comparison.json)
for exact artifacts, profile limitations and measurements. Nothing was published
or pushed.

## Integrated directional history and isolated demo tests — 2026-10-04

The latest Rust cursor and browser map-comparison candidate passes the complete
51-case list demo suite: 17 cases each in Chromium, Firefox and WebKit, with no
retries, skips or failures. Strict demo/test TypeScript also passes.

Two new directional-selection cases cover a range ending at the next paragraph's
start. Heading conversion and bullet/numbered wrapping exclude that paragraph,
preserve selection direction, and survive reload. Undo restores the original
HTML; a reload with the redo branch preserves byte-exact V6 backup contents.
Independent recovery replays all three changes, restores selection inside the
recovered editor, and leaves the main editor unchanged.

The test harness previously rebuilt the same directory served by native preview
tabs. Playwright now builds and previews in Vite `qualification` mode under
`target/list-demo-qualification`; ordinary builds still use `target/list-demo`.
The existing native preview's asset hashes and all shipping artifact trees are
unchanged. Concurrent qualification runs still need separate scheduling because
they share the test-only output directory.

See [integrated directional evidence](qualification/2026-10-04-list-directional-integration.json)
for the exact candidate, report hash and reproducible command. Scripted selection
setup does not qualify native input or screen readers. Earlier intermittent
WebKit faults, responsiveness, delivery/size and full release gates remain open.
No runtime change was required for these new cases. Nothing was pushed or
published.

## Existing browser matrix on the private feature candidate — 2026-10-04

The full existing browser harness now has an isolated candidate configuration:
`playwright.browser-candidate.config.ts`, selected with
`BREDITOR_BROWSER_PACKAGE_RECORD`. It checks the private qualification record,
archive hashes and installed/staged package equality, then runs the existing
tests without rebuilding shipping bundles. Both public and internal harness
imports resolve to the same candidate package copy.

The first matrix attempt exposed a configuration error: dependency prebundling
created a second copy of private ownership maps for an internal selection probe.
The failure and trace remain retained. Excluding Breditor entry points from
prebundling fixes that harness mismatch; the unchanged probe passes in all three
engines, and network traces verify the consistent module paths.

The final full matrix passes **165 tests (55 per engine)** with no retries,
skips or failures. A separate final WebKit batch passes 20 fresh formatted
clipboard/history cases, totaling 1,200 cycles. This adds existing browser-workflow compatibility
evidence for the latest private feature candidate, alongside the separate list
demo suite. It does not run the other release gates or approve package delivery.
Shipping artifact trees remain unchanged; no runtime validation was weakened.

Rechecking the October 2 WebKit failure found that its original trace is absent
from the documented path and no scanned formatted-clipboard ZIP matches its
recorded hash. The original failure log is still present and hash-verified.
Historical preservation claims must not be interpreted as current availability.
See [candidate browser evidence](qualification/2026-10-04-candidate-browser-matrix.json)
for retained results and limits. No push or publication was performed.

## Native control check and human-test preparation — 2026-10-04

VoiceOver activation remains unverified. The settings switch could be toggled,
but the app inventory still reported VoiceOver not running; its documented
modifier command did not advance Apple's own tutorial. The separate tutorial
activation prompt did not establish observable command handling either. No
Breditor input test was counted as a pass. The last readable settings state was
off, the temporary tutorial was quit, and final inventory reported both it and
VoiceOver not running. A final full settings-window read was unavailable.

The disposable list fixture now provides a keyboard-accessible human checklist:
establish real IME composition in its plain scratch textarea and actual spoken
VoiceOver navigation outside the editor, then test heading/list editing and
history/focus. This reuses existing tooling without adding automatic pass flags
or recording infrastructure. All 15 manual-fixture tests pass across the three
engines, including expanded-section accessibility and narrow layout, and strict
TypeScript passes. The checklist is open in an isolated preview on port 4194;
the older native preview at 4188 is untouched.

See [native control follow-up](qualification/2026-10-04-voiceover-control-followup.json).
Human native-input evidence is still required. No editor runtime or wire change,
push or publication was made.

## Remove duplicate flat-list run validation — 2026-10-04

Flat-list canonical DOM validation now checks each run's shape/text and mapping
in the same run iteration, removing a redundant shape/text walk. Wrapper
ownership checks remain separate and mandatory; no validation result is cached
and no subtree is skipped. Base paragraph behavior, Rust, wire formats and public
declarations are unchanged.

Thirteen new before-observer drift regressions pass against both old and new
implementations. The candidate passes all **1,857 browser unit tests**, strict
source/test TypeScript, private packed consumers, five full DOM/recovery runs per
engine, **54 list-demo cases**, and the **165-case existing browser matrix**.
Both Playwright matrices pass without retries, skips or failures.

Two sequential old/new performance pairs show modest improvements in 500-item
edit medians: Chromium 69.4/67.2 to 64.4/60.9 ms, Firefox 197/198 to 191/193 ms,
and WebKit 119/109 to 105/100 ms. All 108 measurement correctness cases pass.
Host load was not controlled and WebKit ranges overlap in the second pair;
these results are not a general latency guarantee. Firefox large-list editing
remains a responsiveness concern.

See [single-pass validation evidence](qualification/2026-10-04-flat-list-single-pass-validation.json)
for exact package/report hashes, reproduction commands and the corrected initial
Vitest working-directory error. Shipping trees remain unchanged. This candidate
does not qualify native IME/VoiceOver, resolve the historical intermittent WebKit
fault, approve larger size ceilings, or complete the release gate. Nothing was
pushed or published.

## Selection-read performance experiment rejected — 2026-10-04

A fresh CPU profile of the `36bf0ab` candidate attributed 137 ms of whole-fixture
self time to native Selection admission, including about 82 ms beneath range
installation. An isolated experiment removed the intervening `rangeCount` read
between the native remove/add-range writes, preserving the surrounding exact
endpoint validation and rollback.

The experiment passed 1,860 unit tests, strict types, private consumers and 108
production measurement correctness cases. However, two old/new pairs showed no
consistent useful improvement: 500-item edit medians were Chromium 61.5/65.5 to
63.2/63.4 ms, Firefox 196/197 to 194/196 ms, and WebKit 95/98 to 100/101 ms. The
candidate profile instead attributed about 84 ms to the combined range-write
helper. This is consistent with moving native browser work, not eliminating it;
the profile alone does not identify the browser's internal cause.

The experiment and its helper-specific tests were removed, with exact source
equality to the verified `36bf0ab` implementation checked. The private rejected
package and measurements remain available for comparison, not release use. See
[selection-read experiment evidence](qualification/2026-10-04-selection-range-read-experiment.json).
Next investigate document-sized rendering/validation work or obtain a rendering
trace before changing selection reads again. No shipping artifact changed and
no native-input or historical WebKit gate was cleared. Nothing was pushed or
published.

## Renderer descendant identity checkpoint — 2026-10-04

The renderer no longer collects full host facts for every descendant just to
check its HTML tag. A dedicated native identity predicate checks node kind,
HTML namespace and exact local name without allocating a host-facts object or
reading unused connection/child/document facts. This predicate is not host
admission: the host path is unchanged, fresh elements still prove their owner
document and parentlessness, and canonical validation still checks topology,
attributes, text and both mapping directions. No subtree or validation result is
cached. Rust, wire formats and selection writes are unchanged.

Six new tests cover namespace, object/element identity, exact case, own-property
shadows, foreign/adopted nodes and XML-owned HTML. All **1,863 unit tests** and
strict source/test TypeScript pass. Private packed consumers, five complete
DOM/recovery runs per engine, **54 list-demo cases** and **165 existing browser
cases** also pass; the Playwright suites have no retries, skips or failures.

Two sequential old/new pairs show local 500-item edit medians changing from
62/62.4 to 58.3/59.3 ms in Chromium, 191/194 to 183/184 ms in Firefox, and 98/103
to 94/100 ms in WebKit. All 108 measurement correctness cases pass. Samples are
small and several ranges overlap; these are not general latency guarantees.
The consumer adds 170 raw JS bytes and 45 gzip-9 bytes. Default ceilings remain
unchanged and the package is still private/non-publishable.

See [descendant identity evidence](qualification/2026-10-04-renderer-descendant-identity.json)
for artifact hashes, commands and limitations. Shipping artifact trees remain
unchanged. Native-input qualification, delivery policy, larger-list
responsiveness, historical WebKit issues and complete release qualification
remain open. Nothing was pushed or published.

## Existing React application on the private production candidate — 2026-10-04

The existing React application now has an isolated candidate build/test path:
`vite.demo-candidate.config.ts` and `playwright.demo-candidate.config.ts`. It
reuses the browser harness's private package-record, archive and installed-tree
admission, but builds a minified React application under `target` and tests its
production preview. Default configs and shipping dist trees are untouched.

All **39 cases (13 per engine)** pass in Chromium, Firefox and WebKit, with zero
retries, skips or failures. This covers the existing paragraph-profile app's
formatting, shortcuts, history, autosave conflicts, backup recovery and
accessibility; the separate list demo remains the feature UI proof. Strict types
pass, missing/out-of-target candidate records are rejected before building, and
a repeated production build is byte-identical.

The measured application still exceeds all four relevant default asset budgets:
JavaScript 907,272 raw / 236,028 gzip-9 bytes versus 865,000 / 225,000, and Wasm
2,044,734 raw / 568,462 gzip-9 bytes versus 1,610,000 / 452,000. These are measured
candidate costs, not approved new ceilings. No size gate is declared passed.

See [React production candidate evidence](qualification/2026-10-04-candidate-react-production.json)
for package/output/report hashes and reproducible commands. All shipping trees
remain unchanged. Delivery/size policy, native input, performance and complete
release qualification remain open; historical WebKit faults remain unresolved.
Nothing was pushed or published.

## Workspace verification failures repaired — 2026-10-04

Running the non-shipping release checks exposed two reproducible verification
failures that focused browser suites did not cover:

- Three diagnostic round-trip tests still expected rejection returns in
  `createProfiledDocumentProjection`, now a delegation wrapper. They now require
  sites in `createOwnedProfiledProjection` and forbid rejection labels on the
  public wrappers. A new executable regression verifies exactly-once predicate,
  failure construction and observation, unchanged result identity, and no event
  on successful delegation.
- Default Wasm declaration generation inherited a Rust documentation line for
  opt-in V5/V6, differing from the frozen reviewed ABI 5 declaration. An attempted
  reviewed-comment update correctly failed the byte-lock guard and was reverted.
  Conditional Rust documentation now preserves both default and opt-in wording;
  neither the reviewed declaration nor the baseline hash was relaxed.

The full TypeScript run passes **2,286 tests**, plus nine release-runner tests;
workspace, browser-harness, React-demo and list-demo types pass. Rust formatting,
all-target/all-feature Clippy, the full all-feature workspace tests (including
1,124 core unit tests and 136 doctests), strict Rust docs, wasm32 check/lint and
**25 real wasm32 boundary tests** pass. Native Wasm tests and Clippy were rechecked
after the documentation-only Rust edit. The default ABI/glue check passes with
all 227 signatures and the frozen declaration preserved.

The regenerated opt-in candidate `target/flat-list-candidate-ZxeIdg` passes
generated types/declaration checks, Node heading/list checks and five raw-Wasm
runs per browser engine. Its Wasm, JavaScript glue and both declaration files are
byte-identical to the earlier qualified `Rq6C5V` candidate. Shipping trees remain
unchanged. These fixes change no executable editor behavior.

See [workspace verification evidence](qualification/2026-10-04-workspace-release-checks.json).
These are selected verified release checks, not a completed release: size/delivery
approval, native-input evidence and responsiveness remain open, as do historical
WebKit faults. Nothing was pushed or published.

## Reuse admitted flat-list paths during preparation — 2026-10-05

A fresh operation-scoped Firefox profile of the qualified private pair
`LRESXR` put 93–95 of 178–190 sampled frames in the Wasm `actionStates` call
for each 500-item edit. These are inclusive diagnostic samples, not production
milliseconds or attribution to individual stripped Wasm functions.

Source inspection found a redundant complete guarded-list traversal in
`FlatListTextReplace::derive`: `blocks` had already admitted wrappers and block
kinds and allocated relative paths, but `absolute_paths` repeated the same walk.
The operation now reuses those admitted paths. Zero-origin paths share their
immutable allocation; nonzero origins still check addition overflow. Result
paths still come from independently admitted result roots. Text, schema, limits,
source guards, exact inverse derivation and transaction preflight are unchanged.
There is no cross-operation cache, new protocol or action-state shortcut.

Two new focused tests cover independent coordinate expectations, unchanged
source paths, root-index overflow, mixed root order and invalid list wrappers.
All 1,137 core unit tests and all-target/all-feature core Clippy pass. Candidate
`JAETVs` passes generated declarations, Node heading/list checks and five raw-Wasm
runs per browser. Private pair `VcyDDe` and self-contained opt-in package
`ktXUh6` pass external consumer checks in Chromium, Firefox and WebKit.
The rebuilt installed-package demo passes all **63 cases**, with no failures,
skips, flaky results or retries, including composition, structural selection,
clipboard fixture, grouped typing and history/recovery coverage. This is still
automated evidence, not OS IME or spoken screen-reader qualification.

Both production timing comparisons preserve all document, selection, Undo,
reload and Redo assertions (27 cases per comparison artifact). Initial 500-item
edit medians were 55.4 → 48.1 ms Chromium, 151 → 132 ms Firefox and 84 → 80 ms
WebKit. A sequential baseline/candidate repeat measured 49.6 → 50.4 ms Chromium,
146 → 134 ms Firefox and 82 → 79 ms WebKit. Firefox Undo was 128 → 112 ms in
both comparisons. The initial Chromium edit gain did **not** repeat; no stable
Chromium edit improvement is claimed. Each median has only three samples on one
machine, with uncontrolled background load. These are local observations, not
a p95, device-wide guarantee or completed responsiveness gate.

The browser archive is unchanged. Wasm grows by 446 raw / 250 gzip-9 bytes;
the private opt-in archive grows by 245 bytes. Default ceilings are unchanged,
still exceeded and not declared qualified. Shipping artifact trees remain
unchanged. This optimization does not establish a fix for the historical
intermittent WebKit fault or qualify physical IME/VoiceOver behavior.

See [path reuse evidence](qualification/2026-10-05-flat-list-path-reuse.json)
for source/artifact identities, all four timing reports and the full-demo report.
Nothing was pushed or published.

## Reuse canonical list-item wrappers — 2026-10-05

Preparing a flat-list heading/format operation reconstructed every item wrapper,
even for untouched immutable blocks. Layout construction now considers the
same-position source item for reuse. It must exactly match the newly constructed
canonical wrapper: list-item kind, no entity identity, no properties, one child,
and semantically equal block content. Otherwise it is rebuilt. Changed layouts
may move blocks; a source position is only a candidate, never proof of equality.
Source/result schema checks, limits, scalar/text admission, exact inverse
derivation and transaction validation remain unchanged. No public API, wire
format, cross-call cache or default shipping artifact changes.

Three new tests cover allocation sharing and canonical output versus fresh
construction, edited/reordered blocks, split/join layouts, noncanonical wrapper
metadata and layout/ordinal overflow. All **1,140 core unit tests** and strict
all-target/all-feature core Clippy pass. Candidate `CcQwkF` passes generated
declarations, Node checks and five raw-Wasm runs per engine. Private pair
`3d7urb` and opt-in package `lHoc14` pass installed consumer checks in Chromium,
Firefox and WebKit. The full installed opt-in demo passes **63 cases** across
the same three engines, with no failures, skips, flaky results or retries.
The retained module graph proves zero workspace editor modules and 77 installed
runtime modules. This does not rerun every older workspace gate or qualify
physical input on the new artifact.

The first baseline→candidate 500-item edit medians were 50 → 48.5 ms Chromium,
135 → 131 ms Firefox and 90 → 82 ms WebKit. Reversing the run order produced
baseline→candidate values of 48.3 → 48.9 ms, 135 → 119 ms and 102 → 78 ms.
Firefox Undo measured 115 → 102 ms first and 110 → 99 ms on repeat.
All four reports retain full document, selection, Undo, reload and Redo
assertions for 27 cases each. The Chromium edit gain did not repeat. WebKit
timings varied substantially; three samples per median on one uncontrolled Mac
are not a p95, native latency guarantee or approved responsiveness budget.

Raw Wasm increases by 1,059 bytes (357 gzip-9); the opt-in archive grows by
343 bytes. Default package ceilings remain unchanged and exceeded. The native
Safari/Chrome checks recorded above remain bound to the earlier artifact.
Physical IME/VoiceOver, historical intermittent WebKit failure and complete
release qualification remain open. See
[wrapper reuse evidence](qualification/2026-10-05-flat-list-wrapper-reuse.json).

## Opt-in size measurement, not approval — 2026-10-05

The existing default release runner measures the standard paragraph packages,
not the separately assembled opt-in package. The read-only command below now
measures a specific opt-in assembly and demo without rebuilding either:

```sh
npm run measure:lists:size -- target/flat-list-opt-in-lHoc14/assembly.json target/list-opt-in-demo-s4Qsgg/bundle/opt-in-runtime-proof.json
```

For future candidates, substitute the exact paths printed by assembly and
full-demo qualification. The audit verifies archive/package-tree identity and
recorded sizes, matches the demo's declared package and emitted Wasm to the
assembly, rejects redirected inputs, and snapshots every emitted asset. It
includes both demo and clipboard JavaScript entry points and shared chunks once.
It does not independently prove JavaScript provenance, rerun behavioral checks,
or measure a real network transfer. Gzip-9 is computed separately for each file.

The `lHoc14` candidate measures 870,980 archive bytes and 3,753,908 unpacked
bytes (excluding separately installed dependencies). The full demo emits
900,206 JavaScript bytes / 236,085 gzip-9 and 2,046,937 Wasm bytes / 569,667
gzip-9. Their gzip total is **805,752 bytes**. Other assets, currently CSS,
are separate: 9,266 bytes / 2,975 gzip-9. All exact hashes are retained in
[the size audit](qualification/2026-10-05-opt-in-size-audit.json).

Proposed separate opt-in ceilings—950,000 archive bytes, 4,000,000 unpacked
bytes and 850,000 gzip-9 JavaScript+Wasm bytes—are **awaiting user approval**.
The tool deliberately returns `measured-not-budget-qualified` and never turns
measurements into release approval. Standard package ceilings remain unchanged.
Five focused measurement/identity tests pass; the broader script suite passes
97 tests with one existing skip. No editor executable, package artifact, wire
format or browser setting changed in this tooling checkpoint.

## WebKit selection-ordering diagnosis — 2026-10-05

The retained failure occurs during selection synchronization before typing.
Two opt-in diagnostic modes now separate focus from range installation with a
timer task, then use either synthetic delivery (`focus-task`) or await a trusted
browser event (`native-selection`). They transform only the disposable fixture,
retain document/selection/history assertions, and fail on a missing native event
without falling back to synthetic delivery. Select them with
`BREDITOR_PERF_SELECTION_SCHEDULING` alongside WebKit queue diagnostics.

Both variants and the original synchronous control pass nine cases each against
the exact package implicated in the historical failure. The synchronous control
emits byte-identical assets to the earlier catch-instrumented control. All 100
script tests pass, including the optional WebKit exception-capture positive
control. This comparison does **not** reproduce or fix the intermittent fault,
justify shipping a delay, or qualify physical input. A timer yield is not proof
that all pending notifications drained, and the diagnostic timings include waits.
See [selection-ordering evidence](qualification/2026-10-05-webkit-selection-scheduling.json).

The same native-selection diagnostic also passes nine cases on the latest
`3d7urb` private pair, retaining the `CcQwkF` Wasm identity. This remains
bundled-WebKit correctness evidence, not native Safari or physical input.

## Full core regression after wrapper reuse — 2026-10-05

`cargo test -p breditor-core --all-features` completes successfully on the latest
core: **1,140 unit tests, 692 integration tests across 108 suites, and 137
documentation tests**. No failures, ignored tests or filtered tests were reported.
This closes the integration/doctest gap left by the earlier unit-only run after
wrapper reuse. It does not rerun other workspace crates or finish the full beta
release gate. Exact command, toolchain and per-suite results are recorded in
[full core regression evidence](qualification/2026-10-05-core-full-regression.json).
