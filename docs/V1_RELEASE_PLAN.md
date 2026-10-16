# Breditor V1 release preparation

Breditor has a functional tables, images and offline collaboration implementation,
but it is not ready for a V1 release or a feature-parity claim. The next milestone
is a coherent installable editor: everyday formatting, structural editing and
interchange must work with the same rich Rust owner, not merely in separate demos.

The comparison baseline is Tiptap 3.x and current CKEditor 5, the modern editor in
the FCKeditor lineage. CKEditor 4 reached ordinary EOL in June 2023; its
[extended support model](https://ckeditor.com/docs/ckeditor4/latest/support/licensing/extended-support-model.html)
is not the modern feature baseline. Breditor remains an independent implementation:
no ProseMirror, Tiptap or CKEditor document, operation or plugin protocol is adopted.

## Current checkpoint

The original audit/push baseline was
[`85b21d1`](https://github.com/s9rg/breditor/commit/85b21d1b21187dfc999decf2754686bab8d05eef),
pushed to [s9rg/breditor](https://github.com/s9rg/breditor) on October 15, 2026.
Source packages remain `0.3.0-alpha.22`; no registry publication, release tag or
public deployment is part of this preparation.

The latest functional implementation checkpoint is `2e44eaa` (saved locally,
not yet pushed). The explicitly selected standard inline V1 preset declares
all twelve formats in Rust and supplies checked rendering for both local and
shared owners. Its original profile constructors remain unchanged. The
[presentation checkpoint](qualification/2026-10-15-inline-presentation.json)
records the archive-pairing repair and its 687-run matrix. The subsequent
[formatting-state checkpoint](qualification/2026-10-15-rich-inline-state.json)
records the Rust-derived exact/mixed reads at `81aeb0c`. The
[standard-preset checkpoint](qualification/2026-10-15-standard-inline-v1.json)
passes 261 shared, 36 installed-archive and 123 local browser runs, plus the
recorded Rust/Wasm, default-browser, type and packaging checks. Its qualification
record also retains the earlier failed/incomplete attempts and the test-host
startup repair. The subsequent
[compound-format checkpoint](qualification/2026-10-15-compound-inline-formatting.json)
adds simultaneous local formatting, one history group across explicit text
targets and early stale-observation rejection. It passes 129 local and 36
installed browser runs, plus the recorded Rust/Wasm and clean-consumer checks.
The subsequent [standard-control checkpoint](qualification/2026-10-15-standard-inline-controls.json)
adds owner-bound local/shared controls for all standard kinds, mixed-value forms,
exact native caret reads, keyboard submission, stale-draft rejection and recovered
history. It repairs pending-style loss from misrouted caret targets and redundant
shared Undo entries from empty resets. It passes 165 local, 303 shared and 78
fresh installed-archive browser runs, plus Rust/Wasm, type and package checks.
The default browser archive remains byte-for-byte unchanged.
The subsequent [SDK integration checkpoint](qualification/2026-10-15-editor-sdk.json)
adds the private `@breditor/editor` local root, opt-in React and collaboration
entries, cancellable startup and owner retirement. Collaboration now includes
its matching generated Wasm; clean consumers no longer need a repository
`target` module. A minimal install has neither optional peer. The React path
retains Rust history across parent renders and handles StrictMode, late startup,
key changes and failed-opening retry. Final qualification passes 21 new installed
production-browser cases and 78 existing installed shared/network cases, plus
SDK, default-browser, script, type, native-runtime and clean-install checks.
The subsequent [caret-style repair](qualification/2026-10-15-typing-style-continuity.json)
reproduces and fixes inherited-format loss at
strong/plain run boundaries in the local Rust caret helper and shared owner.
The local browser already used the correct range-aware helper and its Wasm
binary stays unchanged. Both native owners now retain the admitted typing style
until the caret context changes, including after exact history/restart. Final
qualification passes 27 installed SDK, 303 shared source and 78 installed-network
browser runs, the full opt-in core/shared native suites, Wasm boundary tests and
the reference-relay gate. Typing coalescing remains open.
The subsequent [collaboration source promotion](qualification/2026-10-15-collaboration-source-promotion.json)
moves the shared Rust/browser implementation to canonical optional packages.
The application Wasm exposes configured factories and guarded owners without
research fixtures; the old qualification packages compile the same source with
their original research surface. Independent native consumption also caught and
repaired an ignored dependency-local Cargo patch: explicit retained path edges
now keep the deterministic engine downstream without a consumer root override.
Final application qualification passes 27 installed SDK and 78 installed-network
browser runs, plus native, clean-consumer, type, script and default checks.
This qualifies source/Git consumption, not registry crate publication.
The subsequent [durable shared SDK checkpoint](qualification/2026-10-15-durable-shared-sdk.json)
adds shared vanilla/React entry points with exact local storage and exclusive
writer ownership. React replacement waits for old closure; failed closure hands
off checkpoint recovery instead of discarding state. Shutdown rejects late local
and remote publications while preserving reads until storage completes. Database
upgrades now retain unsaved native journals. Separate local-only, shared-only
without React and full React consumers pass normal types, native initialization,
SSR placeholders and production builds. Final qualification passes 51 installed
SDK, 78 installed-network and 84 affected source browser runs, plus 28 SDK unit
cases and the default package/type/script regressions. Exact archive hashes are
retained in the linked checkpoint.
The subsequent [native structural V2 contracts](RICH_STRUCTURAL_V2.md) add
blockquote/code/rule/task drafts and nine separate actions, with explicit code
format loss and exact local history. V1 grammar and fingerprints remain unchanged.
At that checkpoint the new blocks were not exposed by the SDK or shared model 11. Named hard
break commands do work through the existing local/shared SDK. Regression tests
reproduced a misrouted explicit line-break target and WebKit's tested Shift+Enter
paragraph event; the repaired routes pass all 66 installed SDK and 78 application
network cases. They are separate from the historical intermittent WebKit fault.
The [qualification record](qualification/2026-10-15-structural-v2-hard-break.json)
also passes all 303 shared source, 165 local source and 78 legacy installed browser
cases, the complete shared compatibility gate, opt-in Rust/Wasm and default
regressions. Its 690 overlapping browser runs do not qualify unfinished V2
browser/shared blocks or full V1 readiness. Pre-fix failures and exact archive
hashes are retained alongside the passing results.
The subsequent local structural V2 checkpoint exposes bootstrap V7 and explicit
`richLanguage: 2` through the headless, vanilla and React SDK. Semantic quote,
code, rule and task controls retain the native contract, including explicit code
format loss, unavailable inline formatting inside code and exact local history.
Separate task split/join actions retain completion and rich tails. Task checkbox
pointer/Space, internal clipboard, real asset reload and React ownership are
tested against clean-installed archives. Defaults and old factories remain V1;
shared model 11 still rejects V2. At that checkpoint, task indent/outdent/empty
exit and complete atomic navigation were unfinished; shared V2 contracts remain open.
The [local structural SDK qualification](qualification/2026-10-15-structural-v2-local-sdk.json)
retains the exact evidence and failed/incomplete attempts. In particular, an
earlier existing V1 WebKit reload rejected a schema integer during presentation
startup. Numeric-only diagnostics were added without weakening admission;
neither those diagnostics nor later passing runs establish a historical WebKit
repair. See [the retained startup observation](WEBKIT_FAULT_RECOVERY.md).
The subsequent [local task editing checkpoint](qualification/2026-10-15-task-structure-v2.json)
adds separate native indent, outdent and empty-exit actions, closed Wasm commands,
prose Tab/Shift+Tab and task-aware stock controls. Exact inverses retain completion,
rich tails and source identities. Nested promotion preserves depth-first reading
order; top-level exit leaves the same prose block outside the task list. Focused
widgets no longer navigate or delete a still-selected grid, and checkbox Backspace
cannot trigger browser-history navigation in WebKit. These two deterministic
keyboard faults have retained reproductions; they are not the historical
intermittent fault. The V2 runtime declares task command capability separately
from schema identity. A previous V2 checkpoint retains byte-exact recovered future
history in the new runtime, while an old-module/new-wrapper pairing rejects early.
Final qualification passes 102 installed SDK, 78 application-network and 168 local
source browser cases plus 2,332 opt-in Rust tests, canonical shared native tests,
strict native/Wasm lint, types, clean consumers and default regressions. No shared
V2 feature or full shared research compatibility rerun is claimed for this checkpoint.
The subsequent [native shared V2 foundation](qualification/2026-10-15-shared-structural-v2-foundation.json)
selects model 12/journal 13 only through explicit native V2 profile factories.
Original model 11/journal 12 and the browser factories retain their meanings.
The new projection retains structural subtrees, code text and normalized task
heads; separate actions own code conversion/language and task completion.
Observed formatting loss is reversible without erasing foreign contributions.
Its final native suite passes 220 cases, including 15 V2 contracts; 102 installed
SDK and 78 application-network cases pass in all three engines. An old/new V1
Wasm comparison matches 49 journal/view/lineage states, two cross-version restores
and 12 future history steps. These browser checks qualify existing V1 sharing,
not V2 integration. At that foundation, V2 task structural lowering and
browser/relay factories remained open. One development `ReplayMismatch` in concurrent code/style history has not
been reproduced again or explained, so it remains a V2 promotion blocker.
No historical WebKit repair or broader research-suite rerun is claimed.
The subsequent [native shared structural actions](qualification/2026-10-15-shared-structural-v2-actions.json)
add eleven named task, quote and rule actions, plus same-block selected code
replacement. Offline text, completion, normalized heads and rich flow order
survive selective history and restart. Compound rule replacement now resolves its
owned placement after earlier commands in the same group. A separate real-Wasm
regression reproduced incorrect Undo grouping and saved-history replay failure
under a backward clock. Disabling only the engine's time-based merge branch
repairs that case while preserving explicit multi-command groups; dependency
sources and protocols are unchanged. Final qualification passes 240 canonical
native cases, 35 focused research cases and 180 installed/browser network cases.
V1's 49 runtime states and the first native V2 checkpoint's sixteen future states
remain compatible. At that checkpoint, shared V2 Wasm/SDK/relay integration
remained open, alongside the earlier unrecorded native observation and the
historical WebKit fault.
The subsequent [shared structural SDK integration](qualification/2026-10-15-shared-structural-v2-sdk.json)
exposes explicit V2 application factories, owner-bound controls, durable
vanilla/React sessions and separate V2 relay seed records. Original V1 defaults,
frames and journals retain their meanings. The final clean-installed matrix
passes 141 cases, including 39 new shared V2 cases; the existing application V1
network matrix passes 78. All run in Chromium, Firefox and WebKit with unchanged
deadlines and zero retries. Two functional failures have retained reproductions
and repairs: an empty-gap cursor advanced past empty text during Undo, and remote
publication invalidated asynchronous image insertion. Final evidence also
passes 2,332 root Rust tests, 242 canonical shared tests, 61 focused research tests,
22 relay tests, 40 SDK unit tests and default/type/compatibility regressions.
The private V2 candidate is not a supported release promotion. The older
unrecorded replay observation and historical WebKit fault remain open.
The [inline property patch checkpoint](qualification/2026-10-15-inline-property-patches.json)
adds explicit field-only native intent, mixed Link form behavior and old-peer
interoperability without changing stored annotation semantics. The final
clean-installed run passes 141 editing and nine network cases; the separate V1
application matrix passes 78. Root Rust passes 2,336 cases, canonical shared Rust
245, and SDK units 43. An initial WebKit cancelled-mount case returned an
unclassified `TypeError` while retaining its host and journal. Twenty isolated
repetitions, 100 same-page cancellations and the final complete rerun pass, but
no cause or repair is established for that initial failure. Its trace is retained,
and detailed failure capture is now part of the strict lifecycle test.
These overlapping runs are not unique capability counts. At that checkpoint,
feature labels and all 13 qualification gates remained unchanged because their
complete acceptance was still open.

The [live read-only checkpoint](qualification/2026-10-15-read-only.json) adds
native policy enforcement, initial SDK options and live vanilla/React setters
without changing persisted protocols. Selection, Copy, remote updates, assets
and retained history remain usable while authoring is locked. Its complete
clean-installed matrix passes 171 editing and 12 real-relay cases, with another
78 cases in the existing application matrix. Root Rust passes 2,340 cases,
canonical shared Rust 248 and SDK units 54. Old/current Wasm checks cover eight
cross-version restores and twenty exact future history steps after policy
changes. Policy itself is not persisted permission; hosts reapply it after
restore. The ledger marks this whole-editor feature implemented and tracks
editable-region restrictions separately as missing. All 13 release gates remain
open, including the older unconfirmed browser and replay observations.

The [native typing-history foundation](qualification/2026-10-15-native-typing-history.json)
adds local Rust insertion/deletion bursts and atomic grouped Undo/Redo over
unchanged explicit records. A separate checkpoint family preserves the partition;
original codecs and browser defaults stay explicit. Ten native tests include 48
randomized sequences, capacity/branch recovery and revision-exhaustion atomicity.
The complete root run passes 2,350 cases, shared regressions 248, and existing
installed browser regressions 183. These browser passes protect existing behavior;
they do not qualify natural history in the product. At that checkpoint, shared
grouping and Wasm/SDK/DOM exposure still needed the
[integration contract](RICH_TYPING_HISTORY.md).
History remains partial, with no feature or release-gate promotion.

The subsequent [local typing-history integration](qualification/2026-10-15-local-typing-history.json)
reaches additive Wasm and opt-in vanilla/React SDK/DOM in both rich languages.
Native boundaries retain grouped Undo/Redo through exact, explicitly declared
recovery; old defaults/factories and old-runtime failure remain strict. All 225
clean-installed editing/relay cases pass, including 42 natural-history/caret cases;
root Rust passes 2,353, canonical shared Rust 251 and SDK units 60. The new cases
also reproduce and repair two asynchronous image-rendering caret faults, including
a Firefox background-selection overwrite. Neither repair closes the older WebKit
startup observations. Three shared native prerequisites prove invisible-key
consumption, the danger of fixed Undo-call counts and exact restart. Shared
natural history still needs native key-based grouping, separate recovery and its
complete browser/remote acceptance. No history label or release gate is promoted.

The subsequent [native shared typing checkpoint](qualification/2026-10-15-native-shared-typing-history.json)
uses one explicit native engine span per burst, with guarded input actions and
separate grouped replay. It preserves per-input forward records and ordinary
peer writer frames. A repeated-Undo design was insufficient when a peer deleted
the beginning of a partly visible burst; the native span preserves an older
unrelated edit and exact carets. The new decoder is scoped to its own family so
oversized original journals keep their original error. Shared Rust passes 265
tests, including 14 new contracts also passing through the research facade.
Rebuilt default-mode matrices pass 225 installed SDK and 78 application cases,
with exact old/new runtime comparisons. These are not shared new-mode browser
acceptance: Wasm/SDK/React/durable/DOM wiring remains next, and history stays partial.

The subsequent [shared typing SDK checkpoint](qualification/2026-10-16-shared-typing-sdk.json)
connects native grouping to opt-in application Wasm, vanilla/React, exact durable
storage and DOM intent boundaries in both languages. Declared grouped records
reject default reopening; explicit atomic upgrades retain old units and Redo.
Invisible-history Undo publications still autosave, and failed React retirement
retains its exact recovery family. Installed testing reproduced a relay constructor
that incorrectly assumed original journals; selecting the native owner's declared
family repairs startup without weakening room/writer/model checks or changing wire
operations. Final serial matrices pass 288 installed SDK and 78 application cases,
plus 72 SDK units, 265 shared Rust and 2,353 root Rust tests, strict Wasm/native
checks and unchanged default regressions. The record retains intermediate failures
and exact candidate hashes. Firefox processing after mixed history can take several
seconds per input, legitimately splitting the unchanged 750 ms window; this remains
a serious responsiveness issue. The historical WebKit startup error recurred, and
an offline-button observation remains unclassified. Later passing runs close
neither issue. History and release-gate labels remain unchanged.

The subsequent [shared projection reuse checkpoint](qualification/2026-10-16-shared-replay-projections.json)
removes repeated AST projection work during native staging. Its private caches
cannot bypass fresh recovery, protocol/header or complete adoption checks;
failed candidates cannot populate the live owner's store. Fourteen new native
guards bring the shared suite to 279 tests. All 288 installed SDK and 78
application cases pass across three engines, and 72 diagnostic metadata rows
plus final document/checkpoint/future-history hashes match the baseline.
The record preserves an earlier run interrupted by 928 seconds of confirmed
macOS idle sleep; bounded temporary sleep assertions protect the completed rerun.
The apparent early Firefox speedup did not hold reliably in the final diagnostic,
which still included a 4.55-second input. Shared responsiveness, the historical
faults and release labels remain open. Cache charges are not a total memory budget.

The subsequent [code exit checkpoint](qualification/2026-10-16-code-exit.json)
adds guarded Rust commands and Ctrl/Command+Enter in explicit local/shared V2,
including custom or empty toolbars. A fresh plain paragraph follows the whole
code block in its original flow; source, language and surrounding nodes remain
exact. Creator Undo hides the paragraph without erasing peer text; Redo and
restart retain it. The saved operation is the original insertion family.
Actual old/current Wasm passes 24 cross-version restores and 96 exact future
comparisons. Final qualification passes all 321 installed SDK and 78 application
cases across three engines, 2,361 root Rust cases, 285 canonical shared cases and
74 SDK units, plus strict lint, types and default regressions. The record retains
two failed fixture startups: canonical map ordering is repaired only in fixture
input, and explicit Rolldown execution ordering prevents a dynamic SDK import
from executing an unrelated page entry. Neither changes native admission or
establishes a repair of the older WebKit/replay observations. Complete atomic
navigation and general selections remain open; no readiness labels are promoted.

The subsequent [logical navigation checkpoint](qualification/2026-10-16-flow-navigation.json)
adds native selection-only flow movement and separate paragraph creation beside
selected images, visible tables and rules. Cell/caption domains, transparent
list/task/quote order, read-only access, Redo and original insertion histories are
retained. Explicit V2 controls and keyboard routes reach vanilla/React; original
V1 defaults remain unchanged. It reproduces and repairs an uncancelled paging
default that collapsed selected ranges. The completed rerun passes all 408
installed SDK and 78 serial application cases, 2,372 root Rust tests, 292 shared
tests and 77 SDK units. Actual old/new Wasm passes 64 cross-version restores and
256 future comparisons. An earlier full attempt reproduced the historical WebKit
integer-domain startup error during a code-exit reload; that trace remains open,
and the passing rerun is not an engine repair. Physical/bidi arrows, full atom
editing/recovery, general selections and hidden-only recovery remain unfinished.

The next [whole atom editing contract](RICH_ATOM_EDIT.md) adds Rust-owned
deletion and plain/first-key replacement for selected images, visible tables and
rules. Deletion chooses logical neighbors or an explicit floor when its original
parent would be empty or have no visible stop. First-key replacement can share
one natural Undo group with subsequent typing. Original action families retain
exact local and selective shared recovery, including peer source/destination
text. The installed three-engine 69-case atom matrix passes, including React
owner retention, writer replacement and reload. Actual previous/current Wasm
passes 60 cross-version restores and 193 exact future comparisons. A reproduced
missing-first-character path is repaired by routing printable keys when a logical
atom has no DOM text range. Shared replacement still needs transient insertion
headroom; native OS clipboard and physical IME at atom selections are not
qualified by the event-boundary tests. Existing reliability observations remain
open, and this does not complete the two workstreams.

The [completed atom qualification](qualification/2026-10-16-atom-edit.json)
passes all 477 installed SDK cases and 78 serial application cases, 2,406
all-feature root Rust tests, 298 canonical shared tests and 80 SDK units.
The independent event probe reproduces the pre-repair delivery gap in six
engine/owner combinations and verifies all six repaired combinations. Default
regressions, strict native/Wasm lint and exact older-runtime history pass.

The next [native selection coverage contract](RICH_SELECTION_COVERAGE.md) adds
Rust-derived formatting across text ranges, whole nodes and merged-cell grids,
including captions and retained base-cell bodies. Separate state reads preserve
the original Node/Grid-unavailable inline-state contract. V2 stock controls and
empty-toolbar shortcuts use native intent; local and shared lowering retain
original saved actions and exact future history. The 45-case installed
three-engine slice passes, as do 48 real cross-version restores and 144 future
comparisons. Code and any resource failure refuse the whole edit; shared
lowering retains the 64-command ceiling. Coverage is not a visual-order range,
document-wide Select All mutation or general cross-container replacement.

The [selection formatting qualification](qualification/2026-10-16-selection-formatting.json)
passes all 522 installed SDK cases and 78 serial application cases on the same
archives, 2,418 all-feature root Rust tests, 303 canonical shared tests and
83 SDK units. Default regressions, strict native/release-Wasm lint and exact
older-runtime recovery pass. No readiness row is promoted by this slice.

The [bounded block layout native foundation](RICH_BLOCK_LAYOUT.md) adds an
explicit rich V3 schema without widening V1/V2. It admits bounded alignment,
direction, block indentation and line height; native coverage chooses text-block
targets and exact history retains their metadata. Six alignment values keep
physical Left/Right separate from logical Start/End. Native/default regressions
pass. The subsequent native shared V3 implementation adds explicit model 13 and
journal 14, four independently owned fields, native selection lowering, strict
retained-metadata checks and exact selective history. The
[shared native qualification](qualification/2026-10-16-block-layout-shared-native.json)
passes 321 canonical shared tests and 2,436 native workspace tests. Its 18 layout contracts
cover offline concurrency, splits, clipboard and restart. The subsequent
[Wasm and headless SDK bridge](qualification/2026-10-16-block-layout-wasm-sdk.json)
adds explicit package-root V3 factories, native state/commands and durable
model 13 storage. It passes 60 clean-installed browser cases, including 15 new
headless V3 cases, plus actual-Wasm, native, type, old-runtime recovery and default
regressions. The subsequent [visual and relay qualification](qualification/2026-10-16-block-layout-visual-relay.json)
adds bounded direction-aware rendering, independent mixed/inherited forms,
keyboard equivalents and explicit V3 vanilla/React openings. New real-relay
seed tags retain exact old room meanings. All 618 installed SDK cases, 78 serial
application cases, 101 SDK units and 25 relay tests pass; six strengthened caption
cases and actual older-runtime recovery also pass. External interchange and
complete bidi editing qualification remain unfinished, so no readiness row
advances.

The [native general range foundation](RICH_GENERAL_RANGES.md) preserves the
original supported joins and adds replacement across protected boundaries.
Partially selected tables/images keep their structure; only selected content
is removed, whole enclosed atoms can be removed, and insertion occurs at the
logical beginning. Native local history retains exact inverse and restart,
including recovery by the earlier V3 Wasm binary. Shared lowering, Wasm/SDK input
routing, document-wide Select All and installed-browser qualification remain
unfinished. This native checkpoint does not promote the general-selections row.

The initial shared general-range adapter uses original causal commands and
requires exact native-result equality before adoption. Functional contracts
cover mixed boundaries, both directions/history families, offline peer text and
image fields, old rich languages and earlier-Wasm recovery. Its two deterministic
gaps are now repaired by an explicitly selected semantic history family:
generated-head removal retains its conditional origin, and final-fitting edits
need no temporary extra nodes. Original histories retain their old behavior;
new ordinary/natural saves require matching factories. Release Wasm replays
the new histories exactly, including joined first-key input, while earlier
Wasm still imports their peer frames. Relay testing separately found that
original lineage hashes depend on engine change packing. An explicit transport
version 2 hashes causal atoms and retains the existing authority, integrity and
admission guards. Its relay/SDK integration and general browser editing routes
remain unfinished. See the [general range contract](RICH_GENERAL_RANGES.md)
and [semantic qualification](qualification/2026-10-16-general-range-shared-semantic.json).
The subsequent [general input bridge](qualification/2026-10-16-general-range-input-bridge.json)
adds closed local/shared Wasm and source-facade rich/plain/first-key requests.
Rust derives styles, structural consequences and paragraph allocation while
retaining the actual pre-edit selection rather than temporarily selecting a
browser target. Actual release Wasm and earlier readers retain exact future
history, including a deleted before-caret block. Original durable sessions reject
live general-mode upgrades until a matching storage record is selected. Root
SDK/durable general-mode options, DOM/clipboard routing, whole-document Select All,
relay V2 integration and clean-installed acceptance remain required; no readiness
row is promoted by this bridge.

The subsequent [durable general input qualification](qualification/2026-10-16-general-range-durable-dom.json)
adds immutable local/shared range options, separately declared general storage
records, exact native reopening and transactional upgrades that retain legacy
Redo. Failed-close handoff retains the range and history families. Explicit
general controllers preserve partial cross-cell text endpoints and route plain
typing, replacement, selected deletion, Shift+Enter and plain paste through
native planning. All 48 new clean-installed vanilla/React cases pass in the
three configured engines. Source persistence adds 18 real-Wasm scenarios and
72 exact future checkpoint comparisons, with aborted upgrades/close retries
and native rejection of mislabeled language records. Rich clipboard,
cross-range Enter/composition, whole-document Select All and relay V2 wiring
remain unfinished; no readiness row advances.

The active first-two-workstream goal is not complete. Standard controls use
Rust state reads. Explicit [inline property patches](RICH_INLINE_PROPERTY_PATCHES.md)
now preserve omitted observed properties across mixed Link values; ordinary set
commands still replace complete maps. Shared patches lower to existing owned
annotations, retaining the original whole-format concurrent conflict policy.
Live [read-only policy](RICH_READ_ONLY.md) is now implemented. Next are shared
typing responsiveness, general selection replacement, physical/bidi navigation, native atom
clipboard/input qualification, external layout interchange, public API/publication
decisions and broader external interchange. Local
and durable shared React integrations are tested candidates, not a frozen V1 API. The
original local one-format command remains strict; compound edits use a separate
command. Declarations, rendering and command primitives alone do not fulfill
the workstreams' acceptance conditions.

The [general clipboard functional checkpoint](qualification/2026-10-16-general-clipboard-functional.json)
adds native partial-structure Copy, inline and structured paste at general prose
targets, Cut routing and cross-block composition routing. Table shape is retained
with unselected cells empty. Focused SDK checks pass 159 cases; actual paired
Wasm passes 80 equal-document comparisons, 32 exact restores and 128 future
history comparisons, and clean local/shared/React consumers build. Caption/code
structured paste, whole-document selection, transport V2 and
external interchange remain functional work. Broad browser qualification follows
feature completion under the current priority.

The subsequent [general paragraph checkpoint](qualification/2026-10-16-general-paragraph-functional.json)
adds atomic cross-structure Enter with native paragraph/list/task choice,
directional and browser-provided targets, retained task completion and isolated
typing groups. It passes 164 focused SDK checks and another actual release-Wasm
matrix with 80 equal-document comparisons, 32 exact restores and 128 future
history comparisons. Caption/code Enter uses native general LF replacement;
same-block and empty-item behavior retains the original routes.

The combined editor implements nested lists, tables with rich cell bodies and
grid operations, block raster images, durable offline journals/uploads,
selective Undo/Redo, authenticated peer presence and a reference relay. Its
functional checkpoint passed 651 browser test runs across Chromium, Firefox and
WebKit, plus Rust/Wasm, relay, package and type checks. These are overlapping
suite executions, not 651 unique capabilities, and were run before this planning
change. See [the exact functional boundary](RICH_CONTENT_AND_COLLABORATION.md).

The default browser/Wasm packages and opt-in rich/shared packages remain distinct.
The latter remain private, though matching generated runtimes are now packaged.
Successful clean installation does not freeze the public API or make
the candidate a supported public V1 distribution.

## What parity means

Parity is equivalent supported user workflows, extensibility and integration
quality, not identical APIs or serialized bytes. It includes selection,
history, paste, recovery and collaboration for each feature, not just a toolbar
button or a format declaration.

The [machine-readable audit](v1-readiness.json) groups the compared capabilities
and links local evidence, a remaining acceptance condition and primary sources.
`implemented` means the stated functional slice exists; `partial` means a
foundation or narrower path exists; `missing` means the integrated capability
is not present. None of these labels alone means release-qualified. Missing
assessments come from the inspected grammar, public surfaces and controllers,
not from a single unsuccessful keyword search.

The audit is grouped, not an exhaustive line-by-line certification of either
ecosystem. Finish the catalog-coverage gate before asserting full parity. Do not
calculate a completion percentage from these unequal groups.

The full parity target remains open. Comments, suggestions, document conversion,
pagination and other advanced workflows are tracked rather than silently excluded
because competitors sell them separately. A smaller first V1 can be proposed,
but changing the requested target requires an explicit scope decision.

[Tiptap's extension catalog](https://tiptap.dev/docs/editor/extensions/overview)
mixes open-source editor capabilities and plan-labelled additions.
[CKEditor's feature digest](https://ckeditor.com/docs/ckeditor5/latest/features/feature-digest.html)
also distinguishes premium features. Their commercial packaging does not determine
what Breditor must charge for or how Breditor should license its original code.
Recheck these mutable catalogs before freezing the RC baseline.

## Source review findings

The inspected [Tiptap StarterKit assembly](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/starter-kit/src/starter-kit.ts)
registers optional features separately. The useful lesson is a complete, tested
starter profile with explicit additions, not reproducing its extension protocol.
Breditor is missing common structural blocks and has not integrated every default
format into the rich/shared editor.

The inspected [Tiptap table implementation](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-table/src/table/table.ts)
keeps commands, selection/navigation plugins and data conversion as distinct
responsibilities. Breditor's tested geometry is a strong functional slice, but
numeric width commands do not establish resize-handle, rich-paste or export parity.

The inspected [CKEditor clipboard pipeline](https://raw.githubusercontent.com/ckeditor/ckeditor5/master/packages/ckeditor5-clipboard/src/clipboardpipeline.ts)
separates input transformation, model insertion and output transformation.
Breditor likewise needs explicit foreign-content adapters. Its internal rich JSON
clipboard and default safe HTML copy/plain-text admission are not Office paste.
No competitor implementation was copied into Breditor.

## Most important integration gaps

1. **One rich formatting path.** Default Link, color, text-size and richer toolbar
   policies do not automatically supply the complete shared product. A new
   schema-bound rich presentation now reuses the default checked mark, anchor,
   RGB24 color and integer-token policies. The explicit standard profile now
   adds bounded pixel-size CSS, background color and four font-family presets.
   Opt-in local/shared controls now use Rust-derived exact/mixed state consistently,
   including Link, scalar fields and caret styles. They still need promotion into
   the public V1 distribution. Complete-map replacement remains explicit; separate
   Rust-planned property patches now preserve other observed mixed properties.
   Foreign interchange and optional automatic Link detection remain open.
2. **Complete editing grammar.** Explicit V2 blockquote, code, horizontal-rule
   and task contracts now reach Wasm, local/shared SDKs and the reference relay.
   Named hard breaks have a one-LF policy; code exit preserves the original source.
   Finish atomic-block navigation and general selections across
   container boundaries and natural typing history groups. Unsupported ranges
   currently reject; arbitrary flattening is not an acceptable shortcut.
3. **Interchange.** Add sanitized rich HTML and Markdown adapters, then realistic
   Office/Docs/Excel paste. Deterministic JSON remains canonical; foreign import
   needs declared losses, fresh IDs and one guarded transaction.
4. **Product UI and host contracts.** Live native read-only mode is implemented;
   finish contextual controls, accessible resize interaction, search and coherent
   application integration. Relay Reader authority remains separate from local
   editing policy, and editable-region restrictions need their own native contract.
5. **Extension and advanced document contracts.** Typed inline extensions do not
   constitute arbitrary custom-node support. Review comments, suggestions,
   versions, pagination and conversion as distinct features with their own
   persistence and concurrency semantics.

The [Tiptap StarterKit baseline](https://tiptap.dev/docs/editor/extensions/functionality/starterkit),
[CKEditor basic styles](https://ckeditor.com/docs/ckeditor5/latest/features/basic-styles.html),
[Office paste](https://ckeditor.com/docs/ckeditor5/latest/features/pasting/paste-from-office.html)
and [Markdown output](https://ckeditor.com/docs/ckeditor5/latest/features/markdown.html)
give concrete comparison cases. Breditor's richer asset/relay implementation must
also retain its own strengths: the [Tiptap Image extension](https://tiptap.dev/docs/editor/extensions/nodes/image)
does not itself supply an upload server, so compare complete workflows without
pretending either core extension alone solves every hosting concern.

## Implementation order and reproducible exits

The current implementation priority is functional completion: finish general
rich clipboard editing, cross-structure paragraph and whole-document editing,
transport V2 integration, and external HTML/Markdown/Office interchange. Keep
focused native, type and functional integration tests with each change. Broad
cross-browser matrices, physical input/accessibility, performance and final
release qualification follow feature completion. This changes the order of
work, not the V1 acceptance criteria or the independent original protocols.

The [2026-10-16 transport checkpoint](qualification/2026-10-16-writer-transport-v2-functional.json)
completes explicit Wasm/SDK/reference-relay V2 integration with real offline
authors, exact restart recovery and peer-preserving Undo/Redo. General rich
clipboard and cross-structure paragraph checkpoints are also retained. Remaining
functional work includes whole-document selection and external interchange.
The subsequent [caption/code checkpoint](qualification/2026-10-16-caption-code-text-paste-functional.json)
implements the approved native text-with-losses policy with visible notices,
latest React callbacks, 32 paired Wasm scenarios and exact history recovery.
These focused results do not promote V1
readiness rows or replace final installed/browser/release acceptance.

The [native document-selection foundation](qualification/2026-10-16-document-selection-native.json)
adds an explicit Core/Wasm whole-root scope, semantic Copy, atomic plain
replacement/deletion and separate exact explicit/natural recovery. Its extended
view family leaves original selection commands, views and stored families
strict. Shared lowering, whole-document rich paste and immutable SDK/storage/DOM
routing remain required before this feature is end-to-end. External interchange
remains part of the unchanged functional-completion goal.

The active implementation goal covers the first two workstreams: a unified
installable rich editor, then everyday editing and external interchange. This
includes the distribution, editing and interchange checkpoints below. Completion
requires the installed mixed-content and offline/concurrent acceptance tests,
not only Rust primitives or individual demo controls. Advanced review/document
workflows and final V1 qualification remain subsequent work.

### First checkpoint unify the distributed editor

The shared Rust owner and matching application-only Wasm factory now have
canonical optional sources, preserving default package compatibility. Keep
collaboration and relay optional; applications should not need a relay merely
to edit local tables and images. Agree on public package ownership and profile
construction before freezing names or marking packages publishable.

The promoted application candidate excludes probe/fixture exports. The retained
experimental qualification path still exposes its original research APIs from
the same source. Native source/Git consumers retain the patched engine through
explicit path edges; registry crate packaging and public dependency identities
still need their own qualification before publication.

Add a complete safe inline presentation/control contract to the rich path,
including links and mixed property values. Reuse existing semantics where
appropriate; do not create a second TypeScript document model. Integrate the
ordinary formatting set and a framework-neutral/React reference using only
package-root imports.

Exit: a clean external consumer installs the built archives and edits headings,
nested lists, a formatted table cell and a linked image caption, then reloads
exact history. Two independent consumers demonstrate offline edits, asset upload,
reconnect and selective Undo without workspace links or manual `target` files.
Existing default consumers and ABI checks still pass.

### Second checkpoint close everyday editor gaps

Add the missing Rust node/action contracts, task lists, selection coverage,
typing groups, read-only enforcement and safe block properties. Each action
gets its own properly named and documented file. Define shared conflict and
history policy before exposing each control. Add context controls and keyboard
equivalents alongside commands rather than after them.

Exit: user-facing tests cover create, modify, selection, clipboard, Undo/Redo,
reload and simultaneous edits for every new feature. Unsupported combinations
fail atomically and preserve content. No unrelated wire format changes meaning.

### Third checkpoint implement external interchange

The [native interchange bridge](RICH_INTERCHANGE.md) now admits bounded source
roots and validates export fragments under the receiving schema without editing
content or history. Its local/shared Wasm and SDK checkpoint preserves existing
clipboard, checkpoint and synchronization formats. Foreign parsing and browser
integration below remain required; this bridge alone does not qualify interchange.

Introduce separate bounded HTML and Markdown import/export adapters with
schema/version binding, safe URL/asset policies and explicit loss reports.
Keep editing DOM, canonical AST and external data representations separate.
Then add real Office/Docs/Excel fixtures rather than equating plain text with
format-preserving paste.

Exit: round-trip fixtures cover Unicode, formatting, lists, tables/merges,
captions, links and image references. Unsupported structures have visible loss
or rejection behavior; paste is one history group and never executes input markup.

### Fourth checkpoint complete advanced parity contracts

Build durable annotations/comments, accept/reject suggestions and user-facing
versions before conversion and paginated document workflows. Follow with the
tracked widget, template, utility and extension gaps. These are not solved by
renaming existing provenance annotations or replay journals.

Exit: each selected catalog item has an acceptance case and installation,
serialization, recovery and collaboration coverage. Product-scope exceptions,
including arbitrary HTML or nested tables, need explicit approval and honest
documentation. No unapproved exception counts as parity.

### Final checkpoint qualify the release candidate

All entries in the audit's `gates` array must close on the exact RC artifacts.
This includes package promotion, migration/API promises, CI, historical WebKit
reliability, native clipboard, physical IME/accessibility, supported mobile,
measured size/latency/memory, public deployment hardening, storage lifecycle,
dependency notices, support documentation and a real application pilot.

The earlier decision to defer IME and accessibility allowed functional feature
work to finish; it did not waive those V1 gates. Per-file WebKit isolation keeps
test coverage but does not demonstrate a repair of the historical fault.

Before publishing a collaboration-capable product, address bounded journal
lifetime and backup/compaction, resource-limited imports and image decoding, and
real identity/TLS/tenant integration. Do not expose the local demo bootstrap or
reinterpret content hashes as authentication.

Exit: immutable candidate archives and binaries pass the complete automated and
native matrix, clean install/upgrade/rollback drills and the pilot with documented
limits. Publication and public deployment remain separate authorized actions.

## Run the preparation checks

```sh
npm run audit:v1
npm run audit:v1 -- --json
npm run check:v1
node --test scripts/check-v1-readiness.test.mjs
```

The audit validates references and prints remaining work. `check:v1` deliberately
fails while any feature or gate is open. It is a reviewed-ledger guard, not a
behavioral test runner or automatic certification; marking JSON entries complete
does not manufacture evidence. `npm run verify:release` still covers only the
default packages, not the full rich/shared V1 target.

Reproduce the existing functional implementation separately:

```sh
node scripts/check-shared-browser.mjs
node scripts/check-collaboration-feasibility.mjs
node scripts/check-rich-browser.mjs
```

These build and test opt-in artifacts and may take substantial time. Run them
against an owned test room, not the live developer room. The release candidate
must combine their coverage with the default release gate and final native
qualification; do not infer a V1 pass from any single suite.

## Preparation verification

The October 15 preparation adds documentation and a read-only audit command;
it does not change editor, Rust, Wasm, relay or wire behavior. All 25 new audit
tests pass. The complete standalone script suite passes 323 tests with zero
failures and three existing opt-in browser tests skipped because their explicit
environment flags were not enabled. The new readiness command exits with status
1 as intended: feature gaps and release gates remain open. The 651-run editor
matrix above was not rerun for this documentation/tooling change.
