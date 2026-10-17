# Breditor V1 release preparation

Breditor has an independently installable rich-editor candidate combining tables,
images, offline collaboration, everyday formatting, structural editing and
interchange under the same Rust owner. The everyday-editing functional goal is
complete at the checkpoint below. It is not a V1 release or a feature-parity claim:
advanced review/document workflows and production qualification remain open.

The comparison baseline is Tiptap 3.x and current CKEditor 5, the modern editor in
the FCKeditor lineage. CKEditor 4 reached ordinary EOL in June 2023; its
[extended support model](https://ckeditor.com/docs/ckeditor4/latest/support/licensing/extended-support-model.html)
is not the modern feature baseline. Breditor remains an independent implementation:
no ProseMirror, Tiptap or CKEditor document, operation or plugin protocol is adopted.

## Current functional checkpoint

The [combined installed checkpoint](qualification/2026-10-16-mixed-workflow-functional.json)
completes the selected everyday-editing goal. Two independent installed consumers
per history policy combine headings, nested lists/tasks, formatted table cells,
linked captions, cross-cell Enter/composition, foreign paste, whole-document
Copy/Paste, offline edits, image upload/download and selective Undo/Redo. Explicit
and natural histories both pass: 70 convergence checks, 64 exact future writer
checkpoints, four exact local restores, two native host restarts and four
fresh-cache image downloads. These use actual application Wasm, native relay and
HTTP/WebSocket transport, with synthetic DOM/clipboard/IDB/locks/raster admission.

The combined test exposed cumulative peer-update retention at the unchanged
16 MiB journal ceiling. Native repair `f19bc7b` retains only new admitted operations
in general/document histories, preserves pending inputs and leaves original
replay families unchanged. Old/new readers retain exact saved/future history.
The final combined run observes at most 1,434,527 journal bytes and 110 known
echo admissions without growth. No existing save is automatically compacted.

This checkpoint also passes 392 shared-native tests, 31 relay tests, 269 SDK tests
and the 44-case clean-installed clipboard probe. The linked record retains the
earlier timeout attempts and eight pre-existing integration-test lint failures.
Recovered-host startup was 11.5..14.7 seconds in the final functional run;
performance qualification is still open. No readiness row, release gate, package
version or publication status is promoted. No push or deployment was performed.

## Checkpoint trail

The next advanced-review goal is active. Its
[native/SDK contract and remaining integration](RICH_REVIEW.md) adds strict durable
comment anchors, independent comment history and named versions with guarded
restore-as-new-change. Programmatic Wasm tests combine comments and version
restore across both selection and history policies; this does not complete review
persistence/transport/UI, suggestions, the parity audit or any V1 release gate.
The [focused checkpoint](qualification/2026-10-16-rich-review-native-sdk.json)
records native suites, actual application-Wasm workflows and remaining bounds.
The [paired persistence checkpoint](qualification/2026-10-16-rich-review-persistence-sdk.json)
adds atomic local document/review recovery, independent writer leases and retained
named versions. Its storage/locks are synthetic; review relay, UI and suggestions
still remain outside this checkpoint.
The [review controls checkpoint](qualification/2026-10-16-rich-review-controls-sdk.json)
adds borrowed vanilla/React comment and version controls, retained drafts, explicit
restore confirmation and an owner-bound SDK guard repair. It uses actual Wasm with
synthetic browser APIs; authenticated review relay and suggestions remain open.
The [review transport checkpoint](qualification/2026-10-16-rich-review-relay-native.json)
subsequently adds native staged metadata admission, independent comment-only
authority, original historical grants/receipts, paginated socket catchup and exact
host/client recovery. Its actual-Wasm acceptance fixture explicitly drives wire
requests; automatic review SDK sync/cursor persistence, suggestions and the shared
version catalog remain functional work. The owner selected queued offline review
decisions finalized once in authenticated server order; that suggestion path is
not implemented yet.
The [automatic review sync checkpoint](qualification/2026-10-17-rich-review-relay-sdk.json)
adds native lineage proofs, separate capability negotiation, paired atomic cursor
storage and the exported SDK registration/reconnect/retry adapter. Real Wasm and
the durable host pass offline, failed-save, restart, exact-recovery and selective
history workflows with synthetic IndexedDB/locks. Shared versions, suggestions,
original quotes, initial pure-reader registration and clean-installed mixed review
acceptance remained outside that checkpoint; no V1 gate was promoted.
The [read-only review checkpoint](qualification/2026-10-17-rich-review-observer-sdk.json)
now closes initial pure-reader registration without temporary write grants. A
permanently non-authoring native actor, explicitly negotiated socket capability
and distinct paired recovery family survive account promotion, read revocation,
failed saves and host restart. All four selection/history combinations pass with
actual Wasm and the native host; storage/locks remain synthetic. Shared versions,
original quotes, suggestions and combined installed review acceptance are still
active work. This is a local functional checkpoint, not a release gate.
The [historical review checkpoint](qualification/2026-10-17-rich-review-historical-reads.json)
adds original captured quotes and a separate native proof that version content
matches its historical source. It does not check out or author on the live editor.
Vanilla/React controls load quotes lazily and preserve them after target removal.
Source proof rejects rehashed mismatches and noncausal cuts; missing history stays
pending. Shared catalog authorization/durability, suggestions and final combined
installed review acceptance remain open. Existing formats and constructor exports
are unchanged.

The [shared catalog host checkpoint](qualification/2026-10-17-rich-review-version-catalog-host.json)
adds authenticated native version publication, accepted source-group boundaries,
durable idempotent receipts, frozen metadata pages and exact packet download.
Actual-Wasm HTTP/socket workflows cover offline dependencies, remote guarded
restore, current read/write rights and exact host restart. A reproduced historical
cut between formatting-mark atoms now rejects natively before engine reconstruction,
with both direct Rust and actual-Wasm regressions. Automatic catalog SDK sync,
offline catalog cache, shared catalog controls, suggestions and final combined
installed review acceptance remain active work. No V1 gate is promoted.

The [shared catalog client checkpoint](qualification/2026-10-17-rich-review-version-catalog-sdk.json)
adds the optional SDK cache/synchronizer and asynchronous borrowed version
controls. All four selection/history combinations retain exact offline packets,
recover aborted local saves and server receipts, reconcile lost replies and
restore remote versions as ordinary edits. Sixteen exact reopens and four host
restarts pass with actual Wasm and the native host; a synthetic-DOM shared panel
also refuses stale asynchronous previews and retains drafts through catalog-only
updates. The separate cache never owns the document/review journals or persists
live authority. All 281 SDK/editor tests and 46 relay tests pass. Suggestions and
clean-installed combined review acceptance remain functional work; final browser
and production qualification remain release gates, not part of this checkpoint.

The [native proposal checkpoint](qualification/2026-10-17-rich-review-suggestion-native.json)
adds immutable source-bound suggestion intents and pure native previews for
command batches and protected general rich ranges. Fourteen focused integration
tests plus three packet tests cover actual source history, explicit conflicts,
independent fields, native character identities, preview ownership and exact
future recovery. The complete shared-native suite passes 441 tests and the relay
passes 46. This is a Rust-only foundation: proposal persistence, granular text
rebasing, authenticated final decisions, accepted-effect Undo ownership and
Wasm/SDK/control integration remain active work. No suggestion acceptance API or
V1 release gate is promoted.

The [staged suggestion-effect checkpoint](qualification/2026-10-17-rich-review-suggestion-effects-native.json)
adds source-guarded native preparation and one-time publication of real rich
edits. It retains each selected recovery family, one ordinary native Undo group
and the exact transport lineage, with permanent preparation outside the semantic
history span. A separate host writer can stage its edit while the user's
ordinary writer continues offline. Checked inverse tests establish a mechanism
for future accepting-user history, but do not implement that recovered history
lane. The authenticated exactly-once decision ledger, accepting-user history,
proposal persistence, granular text rebasing and paired Wasm/SDK/control
acceptance remain active work. This checkpoint adds no decision endpoint or V1
readiness claim. The full shared-native suite passes 453 tests, including nine
new effect workflows and three private inverse tests. All 46 relay regressions,
nine research-compatibility effect contracts, 35 runtime/promotion guards and
strict scoped native/relay lint checks also pass. Application Wasm and SDK
surfaces remain unchanged.

The [native ordered-decision checkpoint](qualification/2026-10-17-rich-review-suggestion-ledger-native.json)
adds explicit proposal/review grants, immutable authenticated publication and
one final Accept/Reject in the reference room's durable order. Accept's native
effect and final decision share one synced record; opposing retries return the
original outcome, while source conflicts remain pending. A separate reserved
host writer leaves ordinary offline streams available and keeps genesis
immutable. Native combined workflows retain anchored comments, independent
review history and named-version restore across accepted host effects. This is
an opt-in native reference-host layer, not new network endpoints or browser/SDK
acceptance. Accepting-user history, durable offline queues, proposal
revision/rebasing and paired controls remain active work; no V1 gate advances.
All 64 relay/server tests pass, including twelve suggestion workflows and six
private durability audits. Two real reviewer races finalize once, all six client
history policies recover exact future edits, and the mixed native review/version
workflow survives restart. Owned acceptance records the exact authenticated
device writer without reserving its counters or transferring native Undo yet.
Server table-merge clocks retain exact decimal strings through versions/recovery.
A reproduced native witness failure for unactivated empty cells, including old
source cuts after peer input, is repaired without creating text infrastructure
during reads. The complete shared-native suite passes 456 tests, the research
compatibility suggestion suite passes 15, and 35 runtime/source guards pass.
Strict scoped native and all-target relay linting also pass. The linked record
retains the precise functional bounds. Application Wasm and SDK surfaces remain
unchanged.

The [suggestion socket checkpoint](qualification/2026-10-17-rich-review-suggestion-relay.json)
adds explicitly negotiated authenticated publication, owned Accept/Reject,
immutable reads/pages and independent grants. Native intents and actual
application-Wasm clients retain ordinary offline edits, exact selective client
history and server-authored table merges across reconnect and host restart.
Concurrent reviewers and persisted fixture-owned offline choices retain the
original server winner. Old review/catalog socket and HTTP workflows remain
regressions, not new default behavior. This is explicit wire-fixture acceptance:
automatic durable SDK queues, proposal Wasm/controls, accepting-user Undo and
clean-installed combined review acceptance remain active work. No V1 gate or
publication status advances.

The [suggestion client checkpoint](qualification/2026-10-17-rich-review-suggestion-client.json)
adds pure native/Wasm/SDK proposals, complete typed semantic intents, opaque
previews and native retained-effect receipts. A separate durable SDK queue
survives offline reloads and aborted local/receipt saves beside exact paired
document/comment journals. Four selection/history combinations retain original
server winners, ordinary selective history and native host restart; mismatched
preview IDs and borrowed-owner replacement refuse without a false save claim.
All 457 canonical native tests, 64 relay tests, 291 SDK/editor tests and 36 runtime
guards pass. The automatic comment/version SDK regression also passes with the
new runtime. Queue transport is still explicitly driven by the probe; automatic
owned-decision wiring, accepting-user Undo, controls and installed combined
review acceptance remain functional work, not completed release gates.

The [automatic suggestion client checkpoint](qualification/2026-10-17-rich-review-suggestion-sync-sdk.json)
adds opt-in publication/decision syncing on the existing document-author socket,
bounded live discovery and lazy remote packet caching. Four selection/history
combinations pass with actual application Wasm, exported SDK adapters and the
authenticated native host: offline reopen, owned Accept, missing peer sources,
conflict to Reject, opposing offline choices, failed local/receipt saves, lost
decision replies, fresh grants, automatic host restart and no idle polling.
All 305 SDK/editor tests and 36 runtime compatibility guards pass, and the
automatic comments/version regression remains intact. Native core/host sources
and saved families are unchanged from the preceding 457/64-test checkpoint.
Accepting-user Undo, Reader-only automatic metadata sync, suggestion controls,
granular rebasing and installed combined review acceptance remain functional
work. No V1 gate, package version or publication status advances.

The original audit/push baseline was
[`85b21d1`](https://github.com/s9rg/breditor/commit/85b21d1b21187dfc999decf2754686bab8d05eef),
pushed to [s9rg/breditor](https://github.com/s9rg/breditor) on October 15, 2026.
Source packages remain `0.3.0-alpha.22`; no registry publication, release tag or
public deployment is part of this preparation.

An early functional implementation checkpoint is `2e44eaa` (saved locally,
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

The completed everyday-editing phase prioritized general rich clipboard editing,
cross-structure paragraph and whole-document editing, transport V2 integration,
and external HTML/Markdown/representative Office interchange, with focused
native, type and functional integration tests. Broad cross-browser matrices,
physical input/accessibility, performance and final release qualification remain
open. The next functional workstream is advanced review/document workflows.
This order does not waive the V1 acceptance criteria or change original protocols.

The [2026-10-16 transport checkpoint](qualification/2026-10-16-writer-transport-v2-functional.json)
completes explicit Wasm/SDK/reference-relay V2 integration with real offline
authors, exact restart recovery and peer-preserving Undo/Redo. General rich
clipboard and cross-structure paragraph checkpoints are also retained. Remaining
functional checkpoints subsequently added whole-document selection and external
conversion, as described below.
The subsequent [caption/code checkpoint](qualification/2026-10-16-caption-code-text-paste-functional.json)
implements the approved native text-with-losses policy with visible notices,
latest React callbacks, 32 paired Wasm scenarios and exact history recovery.
These focused results do not promote V1
readiness rows or replace final installed/browser/release acceptance.

The [native document-selection foundation](qualification/2026-10-16-document-selection-native.json)
adds an explicit Core/Wasm whole-root scope, semantic Copy, atomic plain
replacement/deletion and separate exact explicit/natural recovery. Its extended
view family leaves original selection commands, views and stored families
strict. At that foundation, shared lowering, whole-document rich paste and
immutable SDK/storage/DOM routing remained required. The subsequent document
SDK/DOM, relay and interchange checkpoints now complete those paths; the combined
installed checkpoint above qualifies their selected functional workflow together.

The completed everyday-editing goal covers the first two workstreams: a unified
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
clipboard, checkpoint and synchronization formats. The separate opt-in
`@breditor/interchange` converter now covers representative Office-style input
and both export formats through actual native paste/history. The subsequent
[browser clipboard checkpoint](qualification/2026-10-16-browser-interchange.json)
adds explicit local/shared routing, combined post-publication notices, managed
SDK/React integration and host-owned image registry mappings. Both workspace and
clean-installed archives pass 44 paste/recovery scenarios, 176 future checkpoint
comparisons and 32 dropped-format Cut refusals. Installed consumer types and
production parser separation also pass. Combined installed editing/transport
workflows now pass both history policies in the current functional checkpoint;
final browser and release qualification remain separate.

Introduce separate bounded HTML and Markdown import/export adapters with
schema/version binding, safe URL/asset policies and explicit loss reports.
Keep editing DOM, canonical AST and external data representations separate.
Representative Office/Docs/Excel markup fixtures now exercise that path rather
than equating plain text with rich paste. Captured application clipboard fixtures
and broader producer fidelity still need separate qualification.

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
