# Breditor V1 release preparation

Breditor has an independently installable rich-editor candidate combining tables,
images, offline collaboration, everyday formatting, structural editing and
interchange under the same Rust owner. The everyday-editing functional goal is
complete at the checkpoint below. The selected advanced-review functional goal is
also complete. Neither is a V1 release or a feature-parity claim: production and
release qualification remain open.

The comparison baseline is Tiptap 3.x and current CKEditor 5, the modern editor in
the FCKeditor lineage. CKEditor 4 reached ordinary EOL in June 2023; its
[extended support model](https://ckeditor.com/docs/ckeditor4/latest/support/licensing/extended-support-model.html)
is not the modern feature baseline. Breditor remains an independent implementation:
no ProseMirror, Tiptap or CKEditor document, operation or plugin protocol is adopted.

## V1 candidate qualification checkpoint

The [2026-10-18 functional qualification](qualification/2026-10-18-v1-candidate-functional.json)
pins clean source commit e929cc78b0703463126454684d8a1385c3a78c2b. All 32 selected
functional stages pass, including strict Rust checks, 3,165 Rust tests/doctests,
374 editor tests, independent installed consumers and combined editing,
text/formatting review, permanent-reader, image/comment/version workflows. The
script suite passes 448 tests with three existing opt-in browser checks skipped;
those skips are recorded, not counted as platform qualification.

The checkpoint repairs reproduced absolute build/user-home paths in both actual
opt-in Wasm binaries without weakening the path guard. The shared header accessor
retains the original lookup semantics. Old/new original-family runtimes pass
49 exact checkpoint comparisons, two cross-version restores and 12 future
Undo/Redo steps. Runtime archives also carry Wasm-bound dependency inventories,
available pinned notice texts and the pinned Rust library notices. A remaining
notice gap, complete license/source-availability review and cross-host
reproducibility remain release work.

This is functional qualification, not the full candidate profile or V1 readiness.
The manual hosted workflow is prepared and locally checked, not pushed or run.
All 13 qualification gates remain open. The
[compatibility policy](COMPATIBILITY.md#current-bounded-lifetime) now states the
separate client-journal, relay-log and asset-store ceilings. Long-session
rotation/recovery and remaining feature parity are substantive work, not waived
by passing the current tests. No package version, public API freeze, tag,
publication or deployment is promoted.

## Current seven family client recovery

The [selected-owner recovery contract](SELECTED_OWNER_RECOVERY.md) now supports
SDK-private warm handoff and editable cold resume of the actual native parents
and independently selected asset stores. Complete immutable basis/current files,
fresh independent read and writer policies, new affirmative decisions and a
callback-free common ownership barrier preserve later offline/native work,
packets, journals and upload receipts. Closing retires every client before a
fallible snapshot; explicit cleanup keeps stored recovery bytes intact.

The [2026-10-25 scoped qualification](qualification/2026-10-25-selected-owner-recovery.json)
passes twenty normal stages: source, fresh offline packages and the actual
production bundle each pass 1,958 cumulative laws, with 23 strict fixtures. Both
source-matched native producers provide 100 verified files; nine real native
control runs finish with 90 endpoints confirmed closed. A separately installed
old/fixed-module control reproduces and verifies the queue failure repair.
A second fresh installed control reproduces and verifies all four final-callback
reader-lifetime failures. A third offline-installed control verifies the
cleanup repair: 34 assertions pass with the repaired modules; the old modules
fail 30 of them. Genuine selected-owner provider reads now authenticate the full
origin/selected upload set under actual native and source custody, with repeated
storage checks after I/O. Partial historical copies remain pending. All five newer families now keep failed
unpublished native captures for real cleanup retry. A fourth fresh installed
control verifies 19 unchanged regressions with old/fixed/old modules. Full native checks still fence persisted reads and
lineage; private held-readonly sentinels do not renew authority.
Full provider/client reconciliation, authenticated activation, stale-writer
fencing, sustainable history, remaining feature parity and all thirteen V1 gates
remain open. This checkpoint changes no public root, protocol/default, version,
Rust source or normal Wasm byte.

The [retained native continuation contract](RETAINED_NATIVE_CONTINUATION.md)
adds a private bridge from the same fresh complete-cut reservation to the actual
native sessions and held origin uploads. It preserves read gates, compares exact
LIVE state across real cleanup, keeps participant writer authority separate from
recovery-job authority, and permits current captures to borrow only the actual
held stores. Ordinary native/asset reads and public-root APIs are unchanged.
Its [qualification](qualification/2026-10-24-retained-native-continuation.json)
passes eighteen selected normal stages: source, independently installed offline
packages and the actual production bundle each pass 1,572 cumulative assertions
with twenty-one strict consumer fixtures. All sixty test-owned native control
ports are closed. This prerequisite does not consume native parents or finish
editable selected-base succession.
All thirteen V1 gates remain open.

The [independent asset approval contract](ROOM_ASSET_APPROVAL.md) now separates a
fresh exact-choice decision from staged readiness and from future native
ownership transfer. It compares the complete room cut and selected bases under
the same genuine source reservation and atomically retains the cut and every
whole base, including both losing upload inputs. Cancellation and close retire a
pending decision without admitting a late write. Its
[qualification](qualification/2026-10-24-room-asset-approval.json) passes sixteen
selected normal stages: source, independent offline packages and the actual
production bundle each pass 1,554 cumulative assertions, with twenty strict
consumer fixtures. Seventy-two new cases cover independent choices, storage,
cancellable decisions and genuine native sessions across all seven families.
Four independent document/comment history pairs cover 28 clients per path;
refusal, mutation and cleanup scenarios add 24. All sixty test-owned native
control ports are confirmed closed. Editable selected-base succession, complete
reconciliation, authenticated activation/fencing and sustainable history remain
architectural work. No release gate closes on an approval data file alone.

The [complete room record cut](ROOM_RECORD_CUT.md) now captures selected native,
packet and journal payloads, literal source/parent/catalog files and whole uploads
under the same genuine reservations. It adds immutable absent-only storage and
independently pinned cold data reads, without changing ordinary history-read
defaults. Its [qualification](qualification/2026-10-24-room-record-cut.json) passes
fourteen selected normal stages: source, fresh offline packages and the actual
production bundle each pass 1,482 cumulative laws with nineteen strict fixtures.
Four new seven-family history cases verify cold retained bytes and future native
Undo/Redo for 28 client instances; partial/corruption/cleanup cases add four.
Actual-native probes reproduce and verify both missing-destination and
pending-cleanup handoff repairs. These controlled functional tests do not qualify
physical durability or create an editable successor from the retained file.
Genuine editable handoff, registered-stream closure,
authenticated activation and sustainable history remain next. All thirteen V1
gates remain open.

The [held history and whole-upload provider reader](ROOM_HISTORY_PROVIDER_CHECK.md)
now checks actual authenticated provider availability while every genuine
selected parent and upload store remains held. Unreferenced uploads remain in
the request, and actual native/persisted records, whole uploads and retained
root/catalog files are checked again after network I/O. Twelve selected normal
stages pass; source, fresh offline packages and the actual production bundle
each pass 1,421 cumulative laws, with eighteen strict consumer fixtures. Four
new history-pair cases cold-reopen 28 client instances per path and exercise both
future native Undo/Redo lanes, using language 3 standard/atomic data. Separate
unchanged installed assertions reproduce and verify the abort/root-close race
during actual cleanup acknowledgements. This is point-in-time availability for
the original held clients, not selected-clone adoption or activation. The new
record cut above supplies complete selected data retention; independently
approved exact choices and genuine operational handoff remain next, followed by registered-stream closure,
authenticated fencing and sustainable history. All thirteen V1 gates stay open.

The [room-bound asset stager](ROOM_ASSET_ADOPTION_STAGING.md) now retains complete
base choices against actual held root/native/upload cuts before creating exact
selected clones. Eighteen selected normal stages pass; source, fresh offline
packages and the actual production bundle each pass 161 laws with five strict
consumer fixtures. Four new seven-family/history cases cold-reopen 28 original
clients and 28 selected destinations; ten further native scenarios cover staging
failures and refusal. Two unchanged installed controls reproduce and verify the
aborted-insertion and queued-cancellation repairs. These cases select language 3
standard/atomic data, not distinct server registrations or a full SDK profile
matrix. Staging does not replace a native root or grant editing/activation.
The exact approved choice, complete pending/offline/review/version work, provider
references and all retained client copies still need the final operational
adoption contract. Authenticated fencing, sustainable history, remaining parity
and all thirteen V1 gates remain required.

The [portable selected asset base](RECONCILED_ASSET_BASE.md) now retains both whole
upload inputs, explicit choices and the selected union without rewriting an old
participant baseline. Fourteen selected normal stages pass; source, fresh offline
packages and the actual production bundle each pass 111 laws with four strict
consumer fixtures. Four new seven-family/history cases cold-reopen 28 original
client instances unchanged while separately restoring 28 selected queue branches;
the older mutation cases add 28 cold reopens. These cases reuse the language 3
standard/atomic native source, not 56 distinct server registrations. The portable
file provides continuity evidence for an explicit new base, not automatic room
adoption, provider authority or activation. Full room adoption, provider/client
closure, authenticated fencing, sustainable history, remaining parity and all
thirteen V1 gates remain required.

The [held asset reconciler](HELD_ASSET_RECONCILIATION.md) now commits explicit
local upload-state choices while retaining the exact caller-owned store lease.
Its fifteen selected normal stages pass; source, fresh offline packages and the
actual production bundle each pass the same 67 laws, with three strict type
fixtures. Four image-bearing seven-writer cases reconcile 28 client instances and
cold-reopen all 28 across independent native history pairs, preserving exact
document/comment checkpoints and future Undo/Redo. The SDK cases select language
3 standard/atomic and reuse that native room across history policies; the native
producer covers ten profile/wire inputs. This is a
local mutation primitive after explicit ownership acquisition, not automatic
room reconciliation or permission to replace a participant's original uploaded
baseline. Full retained-copy/provider/client closure, authenticated activation,+sustainable history, remaining parity and all thirteen V1 gates remain required.

The [fresh seven-family room reader](FRESH_ROOM_HISTORY_READ.md) now holds every
selected genuine parent, verifies actual root/catalog/archive/source records and
inspects historical references independently of ended job grants or signals.
Fifteen selected normal stages pass; source, fresh offline packages and actual
production-bundled code each pass 1,245 cumulative laws, with twelve strict
consumer fixtures. Real seven-writer orchestration retains stored bytes, custody,
whole uploads and both native Undo/Redo lanes through failures and cold recovery.
Unselected historical copies remain explicit. Current provider/client closure,
registered-stream coverage, authenticated activation, sustainable history,
remaining parity and all thirteen V1 gates remain required.

The [five fresh protected-parent readers](FRESH_DELIVERY_PARENT_HISTORY.md) now
verify actual parent/archive and held source history records independently of
expired operational job permission or cancellation. Eighteen selected normal
stages pass; source, fresh offline packages and actual production-bundled code
each pass 1,230 cumulative laws, with eleven strict consumer fixtures. All five
existing participant contract and type-fence stages pass as well. Reads preserve
real custody and both native Undo/Redo lanes, and expose no mutable source.
Together with the original/generation barrier, these now support the fresh
seven-family coordinator read, not completed room
reconciliation. Provider/client closure, authenticated activation, sustainable
history, remaining parity and all thirteen V1 gates remain required.

The [fresh protected-history barrier](PROTECTED_HISTORY_GROUP_READ.md) now reserves
all selected original/generation parents before the first fresh read callback.
It verifies actual archives and all current records, catches late changes in
earlier members, and releases only read borrows while preserving real custody and
future Undo/Redo. Twelve selected normal stages pass; source, fresh offline
packages and actual bundled code each pass 1,199 cumulative laws, with ten strict
consumer type fixtures. The five newer families now have separate fresh parent
admission and joint room history inspection. Full room/provider/client reconciliation, authenticated activation,
sustainable history, remaining parity and all thirteen V1 gates remain required.

The [explicit protected-history reference scope](OPERATIONAL_HISTORY_REFERENCES.md)
now replays original and both generation parent archives before current records
in the selected read-only native runtime. Successfully forgotten image-bearing
proposals/revisions remain covered when absent from every current slot. Thirteen
selected normal stages pass; source, fresh offline packages and actual bundled
code each pass 1,181 cumulative laws, with nine strict consumer type fixtures.
Default source-only scopes remain unchanged. Fresh all-member reservations,
five-family integration, whole-provider/client reconciliation, authenticated
activation, sustainable history and all thirteen V1 gates remain required.

The [generation parent reader](GENERATION_OPERATIONAL_RECORD_READ.md) now reads
both actual protected archives with independent fresh permission and no editable
source projection. Its thirteen selected normal stages pass; source, fresh
offline packages and actual bundled code each pass 1,050 cumulative laws, with
eight strict consumer type fixtures. Existing source and installed operational
probes retain six cases, 24 handoffs and 18 operational cold reopens each. The
historical archive native/reference prelude, synchronous all-member fresh read
reservations and whole-provider/client reconciliation remain architecture work.
This checkpoint does not close any of the thirteen V1 gates.

The [private room coordinator](PHYSICAL_ROOM_OPERATION_V3.md) now transfers actual
catalog custody into restartable recovery for all seven client families. It pins
exact component namespaces, validates current policies before child recovery,
preserves complete lineage-v2 inputs and crosses the existing native handoff
barrier as one cohort. Job authority and returned-client lifetimes are separate;
missing completed stores refuse instead of silently recreating empty data.

Its [functional qualification](qualification/2026-10-23-physical-operation-v3.json)
passes twelve selected normal main stages from the 360-stage functional plan.
Common-cohort contracts pass 56 assertions and room contracts 54 including the
plan law. Source SDK, fresh installed packages and the actual production bundle
each pass the same 53 functional assertions; both private type fixtures pass.
The source-matched native fixture producers are fresh. The unchanged legacy
480-cohort mixed domain, cleanup and binding-refusal probes also pass.

That initial room domain covers individual cold/continuation paths for every
family and one real two-writer local/graph room. A subsequent
[actual seven-writer qualification](qualification/2026-10-23-actual-seven-room.json)
passes thirteen selected normal stages from the expanded 364-stage functional
plan. Source, fresh offline packages and the actual production bundle each pass
the same forty cases: ten native profile/wire combinations times four independent
history pairs. Every room has seven real registered writers and comment actors,
one per recovery family; each run cold-recovers 280 clients with exact histories,
whole nonempty uploads and provenance. Both Undo/Redo lanes and later editing
survive retirement of the recovery job. The separate native producer requires all
fourteen protected streams and checks real authenticated/cold/stale-cut behavior;
it does not connect or authenticate the SDK clients.

The checkpoint freshly passes relay formatting, strict server/no-server lint and
379 server-enabled relay tests/doctests. Package archive bytes, native product
sources, normal Wasm, public-root APIs and defaults remain unchanged. Full
workspace Rust suites, browser durability and the full role/feature-policy domain
are not freshly qualified here. Retained-copy/provider/client reconciliation,
authenticated activation, sustainable history, remaining parity and all thirteen
V1 gates remain required. No version, push, tag, publication or deployment is
promoted.

The [non-consuming native inspection checkpoint](qualification/2026-10-23-operational-native-read.json)
passes thirteen normal selected stages. Source, fresh offline packages and the
actual production bundle each pass the same 53 assertions, including forty real
seven-writer/history rooms. Three strict type fixtures, 39 read contracts and
130 freshly produced native input files also pass their selected checks.
Original/generation reads hold whole uploads until actual cleanup acknowledgement;
the five newer families retain their existing custody. Read reservations expose
no handoff or lease-release operation.

Inspection reports missing or unbound review streams and unselected historical
copies rather than inferring coverage. Its cached-inventory result is not
reconciliation or permission to activate a room. Complete historical-copy/provider
closure and current server authority remain the next dependencies. The
[ownership contract](PHYSICAL_ROOM_OPERATION_V3.md#native-inspection-without-handoff)
records that boundary. All thirteen V1 gates remain open.

The [independent-reader runtime repair](qualification/2026-10-23-reader-runtime-recovery.json)
passes six selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 85 assertions, including 32 cases with a second
independently loaded copy of the normal runtime. All four native history pairs,
active/expired writer grants and all three restored input families are covered.
The unchanged 32-case workload fails against retained old capture code and passes
after replacing only the two repaired capture modules. Native runtime bytes,
original protocols, graph ancestry requirements and public-root defaults remain
unchanged. Complete reconciliation, activation and sustainable history remain
architectural work.

The [two-family reference-read checkpoint](qualification/2026-10-23-operation-reference-read.json)
passes six selected normal stages. Source, fresh offline packages and actual
bundled code each pass the same 134 assertions, including the 85 prior
portable/graph laws, 47 reference laws and two reproduced disposal regressions.
It discovers original/current/pending/live and complete imported-state addresses
even when later image bytes are missing. Separate durable verification and a
private persistence epoch prevent native stamps from hiding retained-cut changes.
Disposed handles retain their reports without retaining their read callbacks.
The [local-only reference extension](qualification/2026-10-23-local-operation-reference-read.json)
also passes six selected normal stages. Source, fresh packages and actual bundled
code each pass the same 197 laws, including all prior delivery/graph and 40 local
portable laws, 22 local reference laws and callback release for all three families.
It preserves local-only semantics, native history, ordered versions and separate
read authorization; it does not fabricate a delivery companion. The
[shared snapshot/flat reference reader](qualification/2026-10-23-local-input-reference-read.json)
now covers both imported local families as well. Twelve selected normal stages
pass, including journal/participant/cohort regressions and five strict type
fixtures. Source, fresh packages and actual bundled code each pass the same 243
laws. All imported native states remain represented before CURRENT/PENDING/LIVE;
the latest tree or input LIVE cannot substitute for them. Three unchanged
reproductions also establish the journal status-read repair: completed inspection
keeps a valid reference pin, while actual persistence attempts invalidate it.
The [contract](OPERATION_REFERENCE_READ.md) now covers five families. The original
and generation families, joint coordinator integration, provider/client reconciliation,
authenticated activation and sustainable history remain required. All thirteen
V1 gates remain open.

## Complete delivery cohort checkpoint

The [original persistent record readers](ORIGINAL_RECORD_READ.md) now distinguish
actual committed paired histories and standalone proposal rows from pending and
LIVE states, including saves committed before acknowledgement was lost. Their
[qualification](qualification/2026-10-23-original-record-read.json) passes thirteen
selected normal stages. Source, fresh offline packages and actual bundled code
each pass the same 102 laws; both strict type fixtures pass. Existing participant
operation, paired backup, compound-storage and reference-read compatibility checks
also pass. These readers neither flush sources nor turn metadata into ancestry,
writer permission or activation authority. Whole reference closure and joint
reconciliation remain required.
All thirteen V1 gates remain open.

The [complete generation record reader](GENERATION_RECORD_READ.md) now reads an
actual atomic head and all its immutable files while preserving uncertain,
pending and LIVE captures separately. Its
[qualification](qualification/2026-10-23-generation-record-read.json) passes twelve
selected normal stages. Source, fresh offline packages and actual bundled code
each pass the same 290 laws, including 188 generation reader laws and all 102
earlier original/compound laws. Three strict type fixtures and the existing
362-case generation asset/recovery domain pass. Reading preserves current native
author policy and never fabricates acknowledgement from cached state. Complete
reference closure, held coordinator integration, current provider/client
reconciliation, authenticated activation and sustainable history remain required.

The [original native and retained-store extension](qualification/2026-10-23-original-retained-record-read.json)
adds actual unpaired native journals, version catalogs and revision outboxes with
their base queues. Fourteen selected normal stages pass. Source, fresh offline
packages and actual bundled code each pass the same 487 laws, including all 290
prior record laws, and four strict type fixtures pass in the fresh consumer.
Version discovery after failed saves uses a separate non-mutating reservation;
the original writable-recovery refusal remains intact. Revision discovery holds
the shared queue reservation once. These complete original record reads precede,
but do not replace, native reference replay and held room reconciliation. All
thirteen V1 gates remain open.

The [generation reference replay](qualification/2026-10-23-generation-record-references.json)
now preserves native and retained-packet image references from actual committed,
uncertain attempt, pending and LIVE states, including images forgotten from LIVE.
Ten selected normal stages pass; source, fresh offline packages and actual bundled
code each pass the same 755 laws, with five strict consumer type fixtures.
Read-only replay checks exact histories and chronological native ancestry within
the independently selected read runtime, preserving writer policy and future
Undo/Redo. The existing 362-case generation asset/recovery domain passes too.
Historical parent files, held room reconciliation,
provider bytes, current authenticated activation and sustainable history remain
required. This does not close a V1 gate or authorize publication.

The [original reference replay](qualification/2026-10-23-original-record-references.json)
now covers original native committed/pending/LIVE histories and every selected
independently saved catalog, proposal and revision/base-queue state. Ten selected
normal stages pass; source, fresh offline packages and actual bundled code each
pass the same 901 laws, with six strict consumer type fixtures. Separate native
read runtimes preserve both history lanes, source policies and future Undo/Redo.
Failed forgetting retains actual stored packet dependencies; uncached versions
remain pending. The TypeScript and runtime contracts refuse duplicate ownership
of a revision's base queue. Historical parent files, held coordinator integration,
provider/client reconciliation, current authenticated activation and sustainable
history remain required. Current source reference readiness alone closes no V1 gate.

The [original parent reader](ORIGINAL_OPERATIONAL_RECORD_READ.md) now admits the
actual operation archive and ready recovery marker under independent current read
permission, including after the old job ends. Twelve selected normal stages pass;
source, fresh packages and actual bundled code each pass 953 laws, with seven
strict consumer type fixtures. Its opaque child reads keep catalog/queue gates
and parent/source fences together without exposing editable facades. An unchanged
development control reproduces the first interface's mutable-child escape and
passes after its repair. Existing original operation, native inspection, storage
and paired backup regressions pass. Whole historical native/reference closure,
fresh group reservation, provider/client reconciliation, authenticated activation
and sustainable history remain required; no V1 gate is closed.

Complete-delivery and restored-operation parents now share the existing room
handoff kernel with legacy local, snapshot-local and flat-local parents. Genuine
reservations and closed result wrappers prevent partial transfer. Final native
checks now read private cancellation state: four unchanged reproductions expose
the former caller-getter reentrancy failure before its repair and pass afterward,
using the same normal Wasm binary.

The [five-family contract](DELIVERY_OPERATION_COHORT.md) has
[53 normally passed selected main stages](qualification/2026-10-23-delivery-operation-cohort.json)
from the 355-stage functional plan. Source contracts pass 41 laws; fresh packages
pass 120 functional laws. Source, installed archives and the actual production
bundle each pass forty five-writer cohorts, with 400 handoffs and 200 exact cold
continuations, later edits, versions and both Undo/Redo lanes. The cohort covers
five native profiles, four history pairs and restored snapshot-v1/lineage-v1
inputs; scope/mask coverage rotates rather than forming the full Cartesian
product. It does not establish mixed lineage-v2 custody.

All six complete-delivery/restored journal, parent, source, portable-export and
lineage source/installed domains pass their full 640 cases and 1,920 future native
history pairs each. The restored source/parent matrices use snapshot inputs.
Snapshot/flat cohort, incoming-source and catalog integration also pass. Eleven
fresh consumers pin matching archives. Workspace tests pass 2,647, editor tests
385 and scripts 2,929, with three existing opt-in browser skips. All 2,857 native
inputs and twelve normal runtime files remain unchanged; native Rust suites are
carried evidence, not fresh executions in this slice.

This is five-family in-process ownership. Seven-family durable catalog writer
adoption, complete reconciliation, authenticated activation, sustainable history,
remaining parity and all thirteen V1 gates remain open. The separate seven-family
and durable-coordinator prototypes are not promoted here. No version, public-root
API freeze, push, tag, publication or deployment is promoted.

## Three family local cohort checkpoint

Legacy local, snapshot and flat-local parents now share one existing room
handoff kernel. Genuine reservations, closed result wrappers and a final
callback-free native/storage pass prevent partial transfer, including late
changes to document or comment generations. Original providers stay original;
snapshot/flat inputs stay inputs. Two reproduced legacy opening faults now
refuse unreturned-parent use and revoked post-construction publication.

The [three-family contract](LOCAL_OPERATION_COHORT.md) has
[38 normally passed selected main stages](qualification/2026-10-23-local-operation-cohort.json)
from the 351-stage functional plan. Source contracts pass 21 laws including the
plan law; fresh packages pass the same 20 functional laws. Source, installed
archives and the actual production bundle each pass sixty three-writer cohorts
across five native profiles, four history pairs and three cyclic family orders:
360 exact handoffs and 180 cold continuations with later edits, versions and
both Undo/Redo lanes. Scope/capability schedules are not their full Cartesian
product.

The complete 480-case legacy parent, journal and portable-export source and
installed domains are freshly repeated. Snapshot/flat cohort, incoming-source
and catalog integration also pass. Seven clean consumers pin matching archives;
workspace tests pass 2,647, editor tests 385 and scripts 2,888, with three existing
opt-in browser skips. All 2,857 native inputs and twelve normal runtime files
remain unchanged; native Rust suites are carried rather than freshly run here.

This is three-family in-process ownership, not complete seven-family physical
catalog adoption. Complete reconciliation, authenticated activation, sustainable
history, remaining parity and all thirteen V1 release gates remain open. That
three-family qualification did not promote the then-separate delivery and restored
development; the later five-family checkpoint above qualifies it.
No version, public-root API freeze, push, tag, publication or deployment occurs.

## Snapshot and flat cohort checkpoint

Snapshot and flat-local operational parents now join the same existing room
handoff kernel. All genuine owners become busy before host callbacks; closed
result wrappers and a final callback-free native/storage fence prevent partial
transfers. Constructor publication guards and bounded indexed input admission
close six reproduced contract failures. Original file families, native histories,
version catalogs, upload receipts and source-owned providers retain their meanings.

The [selected qualification](qualification/2026-10-23-native-input-cohort.json)
passes all 30 selected stages normally from the 347-stage functional plan.
Source contracts pass 24 laws including the plan law; fresh packages pass the
same 23 functional laws. Source, installed archives and the actual production
bundle each pass ten two-writer cohorts across all four history combinations,
both family orders and homogeneous groups: forty handoffs and twenty exact cold
continuations. This new cohort domain uses the normal language-three profile,
not the full Cartesian native-profile/policy domain.

Both complete snapshot and flat-local source/installed domains are freshly
repeated: 480 cases, 1,440 handoffs and 1,440 future native history pairs each.
Incoming-source and catalog source/installed/bundle integration also pass.
Five clean consumers pin matching archives; workspace tests pass 2,647, editor
tests 385 and scripts 2,867, with three existing opt-in browser skips.
All 2,857 native inputs and twelve normal runtime files remain unchanged; Rust
suites are carried evidence rather than freshly executed in this slice.

That checkpoint establishes a two-family in-process ownership contract, not complete seven-family
physical catalog adoption. Full retained-copy/provider/client reconciliation,
authenticated activation, sustainable native lifetime, remaining parity and all
thirteen V1 release gates remain open. No version, public-root API freeze, push,
tag, publication or deployment is promoted.

## Current seven family catalog implementation

The private [V3 catalog](PHYSICAL_ROOM_CATALOG_V3.md) now retains original,
generation, independent-local, independent-delivery, restored-graph, local
snapshot and local flat files through their actual readers. Fresh local policies
are selected per file; old catalog formats, root APIs and native binaries retain
their meanings. Distinct absent-only stores reopen exact durable files and refuse
occupied, old-schema or incomplete destinations without overwriting them.

A reproduced cross-source callback failure now has an unchanged regression:
the last permission callback could change another native source after its check.
The final native/input witness closes that gap, including the catalog parent's
last authority callback. It does not establish every legacy retained-store epoch,
live provider or authenticated room grant.

The [functional evidence](qualification/2026-10-23-physical-catalog-v3-functional-evidence.json)
covers 49 selected domains: 45 normal stages and four recovered SDK completions
with directly observed zero exits, complete reports and exact inputs. Their
interrupted manifests and partial logs remain unchanged; normal runner
qualification is not claimed. Source, fresh installed packages and the actual
bundle each pass the same twenty cases. Both full flat, snapshot and journal
480-case domains and both five-family 480-cohort domains are freshly repeated.
Eight consumers pin matching archives; workspace/diagnostic tests pass 2,647,
editor tests 385 and scripts 2,839, with three existing browser opt-in skips.

The new twenty-case domain covers five normal profiles, four history pairs,
atomic-v2 inventories and all seven file families, not the full Cartesian
role/transport/older-family domain. A subsequent
[snapshot handoff construction repair](qualification/2026-10-23-snapshot-handoff-construction.json)
is now integrated. Its four unchanged regressions fail before and pass after;
17 selected main stages pass normally. Two independent frozen full source and
installed SDK stages each pass all 480 cases and 1,440 future history pairs.
Their 5,305 common non-documentation inputs and three actual package archives
match main; they are not relabelled fresh main SDK executions. Workspace tests
pass 2,647, editor tests 385 and scripts 2,843, with three existing opt-in skips.
Actual writer/upload adoption, complete
retained-copy/provider/client reconciliation, authenticated activation,
sustainable history, full parity and all thirteen V1 gates remain open.

## Previous flat recovery checkpoint

The private [repeatable flat-local family](FLAT_LOCAL_OPERATION_PARTICIPANT.md)
now uses production-source framing, full chronological native admission and the
actual shared journal/opening/upload/final-witness machinery. Three successive
editable/cold generations pass in all four document/review history combinations,
including offline work, exact future histories, whole uploads and retained pixels.
Interrupted commits, lost completions, same-owner cleanup retry and independent
read-only Wasm execution have focused functional coverage.

The new format keeps one raw payload pool and canonical prefix recipes, not a
nested archive or a new copy of each cumulative header. Existing snapshot
meanings, public-root exports, Rust and normal native binaries remain unchanged.
Its separate bounds do not approve large-file performance or fix the native
1,000-entry Undo and 64-generation limits.

The [selected qualification](qualification/2026-10-22-flat-local-operation-participant.json) passes all 35 selected stages
from the 335-check functional plan. Source contracts pass 67 laws; fresh installed
packages pass the same 66 functional laws, with a separate candidate-plan law.
Both full flat-family domains pass all 480 native cases: 1,440 handoffs, 1,440 cold
resumes and 1,440 exact future history pairs each. Twelve first-publication
interruption boundaries run 40 times each. The separate repeated-generation
suite preserves three successive editable/cold generations in each of four
history combinations, with 36 future native pairs per source/installed run.

Both existing snapshot-parent and standalone-journal 480-case source/installed
domains are also freshly repeated. Five clean consumers pin matching archives;
the shared-kernel laws pass installed and in an actual production bundle.
Workspace/diagnostic tests pass 2,647, editor tests 385 and scripts 2,811, with
three existing browser opt-in skips. Other legacy full matrices are carried only
across exact unchanged source/archive bytes; Rust suites are not freshly rerun.

Unchanged integration assertions reproduce the native review-digest rule failure
and late opaque-payload refusal before their repairs. Role/use preflight now
rejects the latter before any native factory call. A separate eight-case native
diagnostic confirms that equal documents and counters cannot substitute for
full history identity: distinct document/Redo and review histories refuse in
both directions. This is existing protection to preserve in room reconciliation,
not a new corruption or historical WebKit repair claim.

Actual room-family adoption, complete historical/provider/client reconciliation,
authenticated whole-room activation and sustainable native history remain the
next architectural work. Full parity and all thirteen V1 gates remain open;
no version, push, tag, publication or deployment is promoted.

## Current incoming source implementation

The private [incoming-source implementation](NATIVE_INPUT_INCOMING_SOURCE.md)
now binds genuine snapshot/flat inputs to later native sources under fresh read
policy. Literal incoming bytes, both native histories and the ordered version
prefix are checked without transferring writers or activating a server. Actual
archive handles and held journal scopes, not matching metadata or saved flags,
bind its lifetime.

The [selected qualification](qualification/2026-10-22-native-input-incoming-source.json)
passes 33 selected stages from the 339-check functional plan. Source/installed
laws pass 16/15, including the separate source plan law; source, fresh installed
archives and the actual production bundle each pass forty representative native
cases with equal results. Strict nominal types pass, and three offline consumers
pin matching archives. Workspace/diagnostic tests pass 2,647, editor tests 385 and
scripts 2,827, with three existing opt-in browser skips. The first probe's explicit
false `readOnly` assumption is corrected to full view equality without changing
native semantics; its two failed stages remain retained. Earlier full recovery
matrices carry under exact unchanged inputs/archive bytes rather than being
freshly executed in this read-only slice.

The seven-family catalog above now retains both local-operation families. The
next operational contract must adopt their genuine owners while preserving
every unresolved historical copy.
Full reconciliation, authenticated activation, sustainable history, remaining
feature parity and all thirteen V1 gates remain required.

## Previous shared journal checkpoint

The private [shared native-input journal](NATIVE_INPUT_OPERATION_JOURNAL.md) now
owns publication and read lifetime through a sealed typed kernel. The existing
snapshot facade keeps its original kind, head/intent/schema and exact input-file
rules. Constructor custody permits one genuine facade and refuses unreturned
reads or source binding; imported data and caller adapters cannot register a family.

Its [selected qualification](qualification/2026-10-22-native-input-journal.json)
passes 31 checks from the 331-check plan. The existing standalone journal and
complete parent each freshly pass all 480 cases in source and installed form.
Their 33 and 37 focused laws pass too. Four clean consumers pin matching archives;
the six new family/constructor laws also pass against the actual production bundle.
Workspace/diagnostic tests pass 2,647, editor tests 385 and scripts 2,744, with three
existing opt-in browser skips. Other legacy matrices are carried under exact
unchanged inputs/archive bytes, not called fresh. Normal native binaries, Rust,
public-root meaning and defaults remain unchanged.

A separate [typed flat-graph development proof](development/2026-10-22-typed-flat-local-operation.json)
passes 49 tests and strict type fences. Its second family uses the same two
production machinery modules with import-only relocation: twelve editable and
cold restores, 36 exact future history pairs, an independent-Wasm read and six
interrupted first publications pass. This is not a product graph family or a
qualified four-name graph parent; uploads in the shared proof are separately
restored real stores. The later flat-family qualification above covers production
graph integration and its separate resource contract. Actual room adoption and
reconciliation, authenticated activation and sustainable native history remain
required. Full parity and all thirteen V1 gates remain open. No version,
push, tag, publication or deployment is promoted.

The private [complete restored-local participant](RESTORED_LOCAL_OPERATION_PARTICIPANT.md)
now coordinates literal incoming provenance, the actual native journal/source and
whole uploads through four reserved namespaces. Durable preparing, prepared and
operational phases cold-reconcile retained owners; a saved operational flag cannot
recreate missing acknowledged storage. The final native witness and upload
exclusion survive namespace release, input-wrapper disposal and handle closure.
The handed-off source/provider remains live independently of the retired parent.

Its [selected qualification](qualification/2026-10-22-restored-local-operation-participant.json)
passes 28 checks from the 328-check plan. Source and fresh installed packages each
pass 37 focused laws and all 480 native cases: 1,440 handoffs, 1,440 cold resumes,
1,440 exact future history pairs and twelve interruption boundaries 40 times each.
The changed standalone journal also freshly passes its full 480-case source and
installed domains and 33 laws each. Three fresh consumers pin matching archives.
Workspace/diagnostic tests pass 2,647, editor tests 385 and scripts 2,737, with three
existing opt-in browser skips.

Unchanged assertions reproduce acknowledged-owner reconstruction and retired
factory/independent-runtime failures before their development repairs and pass
afterward. Fresh read execution policy is selected before authority callbacks;
another Wasm instance replays its own ancestry instead of borrowing a native
pointer. Earlier assertion imports are reversibly adapted, not weakened.

The 5,194 unchanged prior non-documentation inputs and 1,065 unchanged actual old
package files carry other legacy full matrices without claiming fresh execution.
Four old package files changed: README, journal JS/declarations and the induced
source-binding declaration. Twelve normal native files, 2,857 Rust/manifest inputs,
public-root meaning and defaults remain unchanged; Rust suites are not freshly
rerun.

The next [flat-provenance contract](FLAT_LOCAL_OPERATION_PROVENANCE.md) has a
retained, isolated 37-check development prototype with three editable graph
generations in all four history combinations. It is not yet a typed integrated
SDK family or product repeated-export closure. Shared-kernel integration, actual
room adoption/reconciliation, authenticated activation and sustainable shared
Undo/offline retention remain substantive work. Full parity and all thirteen V1
gates remain open; no version, push, tag, publication or deployment is promoted.

The private [restored-local native journal](RESTORED_LOCAL_OPERATION_JOURNAL.md)
now owns the literal incoming portable archive and an actual writable source.
It publishes verified input LIVE once under the same document/comment writer
leases; earlier imported cuts remain provenance. Every later current/pending
pair must continue input LIVE in both native histories and ordered versions.
Missing acknowledged input/source data refuses instead of creating an empty
editor. Fresh read custody survives ended write grants and signals.

Its [selected qualification](qualification/2026-10-22-restored-local-operation-journal.json)
passes 24 checks from the 324-check plan. Source and fresh packages each pass 33
focused laws and all 480 native cases, including 480 initial and 480 later cold
resumes, 1,440 future history comparisons and all six save-interruption boundaries
80 times each. The same input-admission assertions reproduce two development
failures before repair and pass afterward; oversized or changed-type retained
inputs now refuse before reading their bytes.

Two fresh consumers pin matching archives. Workspace/diagnostic tests pass 2,647,
editor tests 385 and script tests 2,699, with three existing opt-in browser skips.
The 5,175 unchanged prior non-documentation inputs and 1,048 actual old package
files preserve previous implementations/assertions and defaults; only the README
and candidate plan changed. Earlier full matrices remain carried evidence, not
fresh runs. Twelve normal native files and 2,857 Rust/manifest inputs are unchanged;
full Rust suites are not freshly rerun.

That native-journal checkpoint preserves incoming whole uploads as data. Complete
restored-local upload ownership is qualified separately above; bounded flat export
through repeated restores still needs product integration. Actual five-family adoption, complete historic-copy,
provider/client reconciliation, authenticated activation and sustainable native
Undo/offline retention remain required. Full parity and all thirteen V1 gates
stay open; no version, push, tag, publication or deployment is promoted.

The private [portable local operation format](INDEPENDENT_LOCAL_OPERATION_PORTABLE.md)
now captures the literal original, CURRENT/PENDING native saves and newer unsaved
LIVE work, with complete uploads and selected pixels. Fresh read policy is
independent of ended write grants/signals. Real read-only Rust replay verifies
both native histories and an ordered catalog of unique immutable versions.
Missing bytes remain Pending; capture performs no save, retry or upload.

Its [selected qualification](qualification/2026-10-22-independent-local-operation-portable.json)
passes 26 checks from the 320-check plan. Source and fresh installed packages each
repeat 40 focused laws and all 480 native cases, including 1,440 exact future
history comparisons after native-payload replay. That replay does not adopt the
incoming operation or uploads and is not a complete editable operational restore.
The recorded policy/version/count failures pass unchanged after repair; the
earlier prototype lifetime regression is integrated with location-only changes.

Three fresh consumers pin matching archives. Both existing local-parent matrices
also pass 480 cases and 1,440 handoffs each; workspace/diagnostic tests pass 2,647,
editor tests 385 and script tests 2,665, with three existing opt-in browser skips.
The 5,151 unchanged prior non-documentation inputs cover every previous
implementation and assertion input; only the README and candidate plan changed.
The 1,030 actual prior package files are unchanged except the package README.
Older full graph/journal/delivery matrices are carried under those exact inputs,
not called fresh. Twelve normal native files and 2,857 Rust/manifest inputs are
unchanged; full Rust suites are not freshly rerun.

Writable/cold native publication and complete operational upload ownership are
qualified separately above. Bounded flat export through repeated restores,
actual five-family adoption, all historic-copy/provider/client reconciliation,
authenticated activation and sustainable native history remain required. Full
parity and all thirteen V1 gates stay open; no version, push, tag, publication or
deployment is promoted.

The private [complete local operational participant](INDEPENDENT_LOCAL_OPERATION_PARTICIPANT.md)
now joins the actual native journal, whole upload store and original-only image
provider. It transfers genuine recovered ownership across six reserved namespaces,
requires the exact first native/upload snapshot and cold-reopens later work under
fresh policy. The live source owns its journal/provider independently of the
retired recovery grant and closed parent. Existing formats and defaults stay closed.

Its [selected qualification](qualification/2026-10-22-independent-local-operation-participant.json)
passes 53 checks from the 316-check plan. Source and fresh installed packages each
repeat 55 focused laws and all 480 native cases, including 1,440 handoffs, 1,440
future history pairs and all ten parent/native publication failure boundaries.
Missing acknowledged pieces refuse rather than silently reconstructing data.
Final handoff retains actual upload exclusion and a native witness through the
last callback and releases without another callback or await.

A reproduced release-retry bug is repaired: failed native/journal cleanup retries
the same actual owners instead of reusing a permanently rejected close promise.
The same two assertions fail against retained actual pre-repair packages and pass
against source and fresh packages. No disposed native owner is recreated.

Nine fresh consumers pin matching archives. Existing journal, native-origin,
delivery-parent, restored-graph, local-recovery and capture matrices pass 480,
480, 640, 640, 240 and 80 cases each in source and installed packages; both full
delivery-recovery workflows pass 512 handoffs. Workspace/diagnostic tests pass
2,647, editor tests 385 and script tests 2,624, with three existing opt-in browser
skips. Twelve normal native files and 2,857 Rust/manifest inputs are unchanged;
full Rust suites and full catalog matrices are not freshly rerun for this change.

Portable local operation export/read is now qualified separately above. Complete
editable/cold restore and repeated capture, actual five-family native adoption,
all historic-copy and provider/client reconciliation, freshly authenticated
activation and sustainable Undo/offline retention remain required. Remaining
full parity and all thirteen V1 gates stay open.
This is selected functional qualification, not whole-plan or physical durability
approval. No version, push, tag, publication or deployment is promoted.

The private [local operation journal](INDEPENDENT_LOCAL_OPERATION_JOURNAL.md)
now retains the actual original, acknowledged and pending native save cuts. It
prepares before publication, acknowledges only exact source readback and replays
both independent native histories before autosave. The actual source owns its
journal, native origin and original-only provider bytes through save, cold-open
and release; original local/delivery/restored families keep their meanings.

Its [selected qualification](qualification/2026-10-22-independent-local-operation-journal.json)
passes 47 checks from the 312-check plan. Source/fresh packages each repeat 47
focused laws and all 480 native cases, including 1,920 native opens, 1,440 cold
journal resumes, 1,440 future history pairs and all six save interruption
boundaries. The 80 failed prepares are explicitly retried live, not counted as
crash-durable memory; the other 400 interruptions cold-recover retained cuts.
A reproduced fresh-read-scope/expired-write-signal bug passes unchanged assertions;
an isolated rebuild with the retained development-before class reproduces it.

Existing local-origin, delivery-journal, complete local recovery and capture
source/installed matrices pass 480, 640, 240 and 80 cases each. Both complete
delivery-recovery workflows pass 512 handoffs; seven fresh consumers pin matching
archives. Workspace/diagnostic tests pass 2,647, editor tests 385 and script tests
2,568 with three existing opt-in browser skips. Twelve normal native files and
2,857 Rust/manifest inputs are unchanged; full Rust suites are not freshly rerun.

The journal alone did not provide whole-upload operational ownership; the
separately qualified parent above now does. Portable complete operation
export/restore, five-family native adoption, all historic-copy/provider/client
reconciliation and authenticated whole-room activation remain required.
Sustainable native Undo/offline retention and remaining full parity remain
required. All thirteen V1 gates remain open; this is not whole-plan or physical
durability qualification. No version, push, tag, publication or deployment changes.

The private [local native-origin prerequisite](INDEPENDENT_LOCAL_NATIVE_ORIGIN.md)
now verifies both native ancestries before first autosave and every later local
persistence capture. It retains local source/schema meanings and readable unsaved
work without inventing a delivery binding. Temporary bootstrap policy is forwarded
explicitly; incompatible private companions refuse, and both selected signals
subscribe to the first actual native write rather than replacing one another.

Its [selected qualification](qualification/2026-10-22-independent-local-native-origin.json)
passes 39 checks from the 308-check plan. Source/fresh packages each repeat 37
focused laws and the full 480-case policy domain, including 960 cold opens and
1,440 future history comparisons. Three development-only composition failures
have unchanged passing assertions; rebuilding an isolated installed consumer with
the recorded three pre-repair policy files reproduces them. This is not a defect
claim about an older released package.

Existing delivery-origin matrices each pass 640 cases, complete local recovery
240 cases and local capture 80 cases. Both full delivery-recovery workflows pass
512 handoffs with 131 focused laws. Six fresh consumers pin matching archives.
Workspace/diagnostic tests pass 2,647, editor tests 385 and script tests 2,520,
with three existing opt-in browser skips. Twelve normal native files and 2,857
Rust/manifest inputs are unchanged; full Rust suites are not freshly rerun.

Actual five-family native staging/adoption, complete local operational ownership,
all retained-copy/provider/client reconciliation, authenticated activation and
sustainable Undo/offline retention remain required. Native proof and read-only
readiness are not those capabilities. All thirteen V1 gates remain open; no
version change, push or publication is promoted.

The [complete local participant coordinator](INDEPENDENT_PARTICIPANT_RECOVERY.md)
now restores both genuine native histories, the whole upload store and the exact
incoming archive/provider together. Original-only image bytes survive handoff
without being lost or added to the upload queue. First ownership is read-only
in both lanes; no delivery binding or old completed owner is fabricated.

Its [selected qualification](qualification/2026-10-22-independent-participant-recovery.json)
passes 38 checks from the 304-check plan. Source and fresh offline packages each
pass 128 focused laws and all 240 native cases, including 480 handoffs, 240 cold
resumes and 720 future history comparisons after offline peer edits. Six actual
consumers pin matching archives. Existing capture's two 80-case matrices and
delivery recovery's two 512-handoff workflows pass; delivery's 131 focused laws
include four new cancellation boundaries.

A real native-save cancellation gap is repaired: Abort after the last head
request succeeded could still commit before the returned-owner check noticed.
The four original failing assertions now pass unchanged with zero heads/files;
an isolated rebuild of the prior bootstrap implementation reproduces all four
commits again. The actual first paired transaction now subscribes to its selected
signal and detaches it after completion. Native code and protocol bytes are
unchanged. Workspace/diagnostic tests pass 2,647, editor tests 385 and script tests
2,482, with three existing opt-in skips; full Rust suites are not freshly rerun.

Next is actual five-family participant staging/adoption and explicit local
operation provenance, then complete retained-copy/provider/client reconciliation
and freshly authenticated whole-room activation. Sustainable native Undo/offline
retention and the remaining parity catalog also remain required. All thirteen
V1 gates stay open; no version, push, publication or deployment is promoted.

The [independent recovery write-policy repair](INDEPENDENT_RECOVERY_WRITE_POLICY.md)
now checks current authority on actual native bootstrap/schema/first-save
boundaries and uses held, guarded upload import. It closes two reproduced gaps:
recovery previously refused its returned owner only after a native head or two
upload rows had committed after policy loss. Authorized completed bytes still
survive later denial for explicit retry; completed bootstrap does not retain an
obsolete recovery policy as the handed-off session's future grant.

Its [selected qualification](qualification/2026-10-22-independent-recovery-policy.json)
passes 31 checks from the 300-check plan. The same expanded assertions expose
twenty failures in both unchanged source and actual pre-repair packages; source
and fresh installed packages now pass all 127 recovery/custody laws. Both original
reproductions pass without edits. Full source/installed workflows each pass 256
cuts, 512 handoffs, 120 local native cases and 88 authenticated network cases.
Four fresh consumers pin matching candidate archives, plus one separate old
consumer retains the failures. Workspace/diagnostic tests pass 2,647, editor tests
385 and script tests 2,349, with three existing opt-in skips. Native code and
runtime bytes remain unchanged; full Rust suites are not freshly rerun.

The complete local-only coordinator is now qualified separately above. Actual
five-family participant staging, retained-copy/provider reconciliation,
authenticated activation and sustainable Undo/offline history remain required.
The first write-policy repair did not close those capabilities or V1 readiness.

The private [five-family physical catalog](PHYSICAL_ROOM_CATALOG_V2.md) now
durably retains original, generation, independent-local, independent-delivery
and restored-graph archives beside separately selected server cuts. It reopens
actual files, holds the real database/archive/lease and transfers that custody
without selecting or discarding a historical writer copy. Version-one readers,
protocol meanings and defaults stay unchanged; local comments remain unbound.

Its [selected qualification](qualification/2026-10-22-physical-catalog-v2.json)
passes 33 checks from the 300-check plan. Source/fresh offline packages each pass
17 focused laws and all 480 catalog cohorts, including 2,400 retained historical
copies, 4,800 exact cold files and 1,920 actual graph reborrows. Old inventory and
catalog source/installed probes pass too; four consumers pin matching archives.
Workspace/diagnostic tests pass 2,647, editor tests 385 and script tests 2,321,
with three existing opt-in skips. Full Rust suites are not freshly rerun;
the native fixture producer is fresh and normal native files remain unchanged.

That catalog checkpoint also retains two separately reproduced delivery-recovery policy
gaps: native history and uploads can commit after current policy ends inside
their respective admission work. An isolated source repair passes the same
regressions, all 127 expanded laws and the full 512-handoff workflow, but was not
integrated or production-qualified by that catalog checkpoint. The subsequent
repair and complete local-only recovery are qualified separately above.
Provider/client reconciliation, authenticated activation and sustainable Undo
retention remain required. No editable room adoption or V1 gate is promoted.

The [independent participant inventory](INDEPENDENT_PARTICIPANT_INVENTORY.md)
now checks actual independent local/delivery histories and private graph-restored
native readers. Its separately named wider cohort keeps old APIs and protocol
meanings intact. Local comments remain explicitly unbound/Pending; duplicate
writer or actor copies refuse without selecting or discarding one.

Its [selected qualification](qualification/2026-10-22-independent-inventory.json)
passes 31 checks from the 296-check plan. Source/fresh offline packages each repeat
23 focused laws and 480 mixed cohorts across ten native rooms and four matched
document/comment pairs. A reproduced array-snapshot bug is repaired across all
eight public inventory methods, with eight unchanged before/after regressions.
Workspace/diagnostic tests pass 2,647, editor tests 385 and script tests 2,303,
with three existing opt-in skips. Native implementation and twelve normal runtime
files are unchanged; the native fixture producer is fresh, not the full Rust suites.

Its earlier 96-cohort durable-catalog prototype is superseded by the separately
qualified V2 file component above, not by integrated editable room adoption.
Actual local-only participant recovery, retained-copy and provider reconciliation,
fresh authenticated activation and sustainable Undo retention remain required.
Remaining parity and all thirteen V1 gates stay open; no version, push or release
is promoted.

The private [complete restored operation graph](RESTORED_OPERATION_GRAPH.md) now
closes the local restore/edit/reopen/re-export lifecycle. It preserves literal
incoming provenance, both native histories, local versions, retained packets,
whole uploads and older input-only pixels. Explicit lineage-V2 input uses the
actual source and parent factories under a separate plan domain; original kinds,
defaults and protocol bytes stay unchanged. Fresh read authorization supports
capture after writer expiry without permitting a save.

Its [selected qualification](qualification/2026-10-22-restored-graph.json) passes
29 checks from the 291-check plan. Source and fresh offline packages repeat 28
focused laws and the full 640-policy graph matrix each, with 1,280 captures,
1,280 cold resumes and 1,920 future native history comparisons per run. All four
existing parent/standalone source/install matrices also pass. Four consumers pin
matching archives; workspace/diagnostic tests pass 2,647, editor tests 385 and
script tests 2,279, with three existing opt-in skips. Normal native bytes are
unchanged; full Rust suites were not freshly rerun for this TypeScript change.

A reproduced archive-disposal bug is fixed: asynchronous input reconstruction
now rechecks the actual owner before returning. The retained regression is
unchanged. Separate normal-native diagnostics confirm that history still stops
at its existing ceilings: ten seals do not remove the 1,000-item Undo bound.
They preserve recovery, not unlimited editable lifetime. No historical WebKit
or intermittent raster repair follows from this checkpoint.

The independent prefix work developed at that graph checkpoint is qualified
separately above. Complete provider/client and retained-copy reconciliation,
fresh authenticated activation and sustainable history retention remain required.

The earlier private [restored-journal read scope](RESTORED_OPERATION_READ.md) supports
fresh read authorization after the write grant or write signal expires. The
genuine source lends actual original/input-LIVE native and incoming-archive
lifetimes; writer hooks still require current write policy. Reads admit exact
CURRENT/PENDING/source state without saving. Shutdown waits for real scopes and
in-flight digest/raster I/O even if a caller releases its scope first.

Its [selected qualification](qualification/2026-10-22-restored-operation-read.json)
passes 13 checks from the 287-check plan. Source/fresh offline packages repeat 15
read laws across snapshot/lineage inputs and four native-history combinations,
including mid-I/O grant/signal loss and native lifetime holds. Parent and
standalone restore each pass the full normal 640-case matrix in both source and
installed packages. Three installed consumers pin matching archives; script tests
pass 2,250 with three existing opt-in skips. Full Rust suites are not freshly
rerun; normal native binaries remain unchanged.

That checkpoint closes the private read-lifetime component; the graph above
qualifies complete follow-on export and restore separately. Whole-room
reconciliation, independent server/client generations,
authenticated activation and remaining feature parity stay required. No historical
WebKit or intermittent raster repair is inferred. All thirteen V1 gates remain
open; no version, push, publication or deployment is promoted.

The private [whole-input participant restore](RESTORED_PARTICIPANT.md) now joins
the genuine native source, immutable incoming archive and whole upload store.
Actual upload custody precedes source replay, survives interruptions and remains
held through the final policy/native/source-stamp check. Cold resume admits real
components rather than trusting completion markers. Distinct parent/upload names
are bound to source provenance; no old completed recovery owner is fabricated.

Its [selected qualification](qualification/2026-10-22-restored-participant.json)
passes 17 checks from the 285-check functional plan. Source and fresh offline
installed packages repeat 29 focused laws and the full 640-policy snapshot-input
matrix each, including 640 cold resumes and 1,920 future history comparisons.
Standalone restore's two 640-case matrices also pass. The unchanged test that
reproduced interrupted custody acquisition now passes on the same owner after
fresh authorization. Script tests pass 2,234 with three existing opt-in skips;
two fresh installed consumers pin matching package archives.

One earlier normal run refused raster admission after 137 successful cases.
Subsequent normal source/installed runs and separate strict-decoder diagnostics
did not reproduce it; the cause remains open. These results do not repair the
historical WebKit fault or qualify physical durability, latency or large-file
memory. Complete follow-on export with independent read authorization, room
reconciliation and authenticated activation remain architectural priorities.
All thirteen V1 gates remain open; no version, push or release is promoted.

The private [retained-input source restore](RESTORED_OPERATION_SOURCE.md) now
replays a detached snapshot or flat lineage into a genuine editable source.
Its separate journal retains the entire incoming archive and legacy original,
orders original/CURRENT/PENDING/LIVE through normal source commits, and cold
reopens with fresh host policy. Native document/comment Undo/Redo, local versions
and retained packets survive; no old completed recovery is fabricated.

Its [selected qualification](qualification/2026-10-22-restored-operation-source.json)
passes 15 checks from the 281-check plan. Source/fresh installed packages repeat
31 focused laws and the complete 640-policy snapshot-restore matrix, including
640 cold reopens and 1,920 future history comparisons each. Both legacy 640-case
journal matrices pass too. Script tests pass 2,204 with three existing skips;
two fresh consumers pin matching archives. This is a private source component:
the parent whole-upload coordinator and explicit next provenance export remain
required before complete participant restore. Whole-room reconciliation,
authenticated activation and all thirteen V1 gates stay open. No version, push,
publication or deployment is promoted.

The public [held whole-upload restore](HELD_ASSET_RESTORE.md) now returns the
actual imported store with genuine cooperative custody still held. Fresh host
policy guards schema creation and atomic insertion; competing writers cannot
cross that scope. Cancelled/uploaded rows and counters survive, occupied or
foreign storage refuses without overwrite, and a late post-commit refusal keeps
durable data for explicit retry. Ordinary restore and archive meanings stay intact.

Its [selected qualification](qualification/2026-10-22-held-asset-restore.json)
passes 21 checks from the 277-check plan, 20 new and 58 unchanged asset laws in
source/fresh installed packages, strict public types and both full 640-case
journal matrices. Three installed reports pin matching archives; script tests
pass 2,172 with three existing skips. Normal native inputs and twelve selected
runtime files remain byte-identical; full Rust-suite evidence is carried rather
than freshly rerun. The factory is a building block, not the complete writable
portable restore coordinator. Source-owned incoming provenance, whole-room
reconciliation and authenticated activation remain next. All thirteen V1 gates
stay open; no public release or deployment is promoted.

The [bounded operational storage repair](BOUNDED_OPERATION_STORAGE.md) counts each
store before cloning keys or values. Bounded requests and final save comparisons
remain in the same transaction, with all original schema/native-byte checks and
row ceilings intact. Five actual overfull-store failures now pass under the same
assertions; no valid row is truncated or silently dropped.

Its [selected qualification](qualification/2026-10-22-bounded-operation-storage.json)
passes 20 checks from the 274-check plan, all 23 source/installed laws and both
full 640-case save-journal matrices. Two installed reports pin matching archives.
Script tests pass 2,151 with three existing skips. The wider five-matrix lifetime
checkpoint below stays separately pinned; those other matrices were not all
freshly rerun for this storage change. Per-value memory, latency and physical
durability are not qualified. Held upload import, writable portable operation
restore and whole-room activation remain required; all thirteen V1 gates stay open.

The [native-owner lifetime repair](NATIVE_OWNER_LIFETIME.md) reserves transfer
before option/native callbacks and keeps factory cleanup distinct from disposal
by the owning editor. Two actual failures are retained with unchanged passing
assertions: freeing a different editor's object after a bad factory result, and
leaking a fresh result before constructor transfer when option preparation throws.

Its [selected qualification](qualification/2026-10-22-native-owner-lifetime.json)
passes 32 checks from the 272-check plan. All five 640-case native-policy matrices
pass in both source and fresh installed packages; seven installed reports pin
matching archives. The same 32 focused lifetime laws pass in both environments,
and script tests pass 2,127 with three existing skips. Fresh native inventory
fixtures and all 108 initial-policy families also pass after an initial correct
stale-fixture refusal. The remaining full native-suite evidence is carried only
across byte-identical inputs/runtimes, not freshly reexecuted.

An actual storage admission defect remains open at this checkpoint: source and
journal readers clone all values before refusing overfull namespaces. A bounded
read repair and a held whole-upload import are tested in separate builds, not
integrated by this qualification. They precede the complete portable writable
restore coordinator, whole-room reconciliation and authenticated activation.
No V1 gate, public version, publication or deployment is promoted.

The private [recovery lineage data layer](INDEPENDENT_OPERATION_LINEAGE.md)
retains selected complete inputs with later original/current/pending/live
snapshots. Shared raw parts avoid recursive whole-archive nesting while keeping
earlier files byte-for-byte reconstructible. Native comment/version continuity,
upload counters and opaque image identities are checked against each input, not
only the legacy original. The 270-check functional plan requires focused laws,
strict types and source/fresh-installed full native-policy matrices. Actual
durable restore and source-owned provenance remain the next functional boundary.

Its [selected qualification](qualification/2026-10-22-independent-operation-lineage.json)
passes 20 checks, the same 29 source/installed laws and both full 640-case matrices.
The original portable matrices also pass in both environments with matching
archives. Script tests pass 2,094 with three existing skips. A newly reproduced
factory-cleanup lifetime defect remains open at this checkpoint: refusing an
already-owned Rust object must not free its original editor. That repair takes
priority over operational restore integration. All thirteen V1 gates remain open.

The private [portable operation data boundary](INDEPENDENT_OPERATION_PORTABLE.md)
now captures immutable original, acknowledged and interrupted saves, newer live
native work, whole uploads and the exact raster reference union. Current read
authorization is independent of an expired write grant. Whole-source namespace
checks and native continuation checks repair reproduced foreign-row and live
rollback admission defects. Both candidate profiles require focused laws, a
public type fence and full source/installed native-policy probes in the 266-check
functional plan. A durable portable restore coordinator remains the next
functional boundary; this is not operation restore or V1 approval.

Its [selected qualification](qualification/2026-10-22-independent-operation-portable.json)
passes 20 checks, 31 source/installed laws and the full 640-case portable matrix in
both environments. Both earlier journal and operational-owner matrices also pass.
Three fresh consumers use matching archives. The checkpoint retains three actual
failing/repaired regressions and passes 2064 script tests with three existing
skips. All thirteen V1 gates remain open.

The private [independent operational participant](INDEPENDENT_OPERATION_PARTICIPANT.md)
now joins genuine completed recovery, a new source-owned journal/native source
and the actual whole-upload store. Cold resume checks actual retained originals,
the retired source and upload conservation under fresh host policy. Final
handoff retains source and upload owners through its last synchronous barrier;
an actual prematurely closed recovery handle is reproduced and repaired. The
262-check plan at that checkpoint required source laws, a type fence and full source/installed
native-policy matrices. Portable operational restore, whole-room adoption and
activation remain architectural work; the new family remains private.

Its [selected qualification](qualification/2026-10-22-independent-operation-participant.json)
passes 19 checks, the same 28 source/installed ownership laws and both full
640-case matrices. Each matrix preserves 1,920 actual handoffs and future native
history comparisons. Four fresh consumers pin matching archives. Two reproduced
handoff defects and a fixture-only heap repair retain their original failures
and passing checks; no matrix assertions or configurations were reduced. Script
tests pass 2,032 with three existing skips. All thirteen V1 gates remain open.

The private [independent operation save journal](INDEPENDENT_OPERATION_JOURNAL.md)
now retains its immutable original and complete acknowledged/pending source cuts
before publication. Actual source open cold-replays pending native histories and
packets, distinguishes each lost-acknowledgement window and preserves legitimate
Stop/Forget actions. The source owns the journal through close, and progress
reads no longer contend with autosave. Old complete exporters refuse this new
closed family. That checkpoint's 258-check plan requires separate source, type
and fresh installed-package checks. The operational owner above joins actual
participant/upload ownership; portable operational export, room adoption and
activation remain architectural work.

The journal's [selected qualification](qualification/2026-10-22-independent-operation-journal.json)
passes 21 checks, 50 source and installed journal laws, and the full 640-case
matrix in both environments. Six fresh consumers pin matching archives. The
actual read-versus-autosave failure and its repair are retained under unchanged
assertions. Script tests pass 2,003 with three existing skips; workspace and
editor integration checks also pass. This is a verified source-journal
checkpoint, not complete operational participant or V1 approval.

[Private independent native origins](INDEPENDENT_OPERATION_NATIVE_ORIGIN.md)
now guard actual source-open, insert-only recovery, autosave and transaction
callbacks before current state can be acknowledged. Both native ancestry lanes
and original local-version packets remain selected; lost authority blocks writes
without hiding readable unsaved recovery. Source laws and the full 640-case
native-policy matrix pass. That checkpoint's 254-check functional plan requires
separate source, type and fresh installed-package checks. The save journal above
adds durable source/outbox cut intent; complete participant/room adoption and
activation remain architectural work. Neither private layer is a completed
operational participant API.

Its [selected qualification](qualification/2026-10-22-independent-native-origin.json)
passes 32 checks from the 254-check plan, 1,952 script tests with three existing
skips, and 385 editor integration tests. Source and fresh installed packages each
repeat the full 640-case native-policy matrix and 22 focused laws. Nine fresh
consumers pin matching archives. The retained evidence includes an initial stale
fixture refusal, actual native fixture regeneration and successful dependent
checks. All native inputs and twelve normal runtime files are unchanged; complete
native-suite evidence is carried, not freshly reexecuted. All thirteen V1 gates
remain open.

[Whole-store handoff custody](OPERATIONAL_COHORT_CUSTODY.md#hold-every-selected-upload-store)
now protects original and generation recovery/operation handoffs and their shared
room barrier. Genuine upload stores stay held together through verification and
coordinator release; late native cut guards and cleanup use canonical operations.
The previous packages reproduce nine upload-race and nine native-guard failures.
Source and fresh offline packages pass 45 focused laws. The functional plan at
that handoff checkpoint had 250 checks. Complete independent-delivery operational intent, provider/client
closure, independent server-log generations and authenticated room activation
remain architectural work; this is not V1 approval.

Its [selected qualification](qualification/2026-10-21-operation-asset-custody.json)
passes 101 stages: 100 checks from the 250-check functional plan and one extra
complete no-server Rust suite. The script suite passes 1,929 tests with three
existing opt-in checks skipped. Fresh server-enabled and no-server Rust suites
pass 379 and 267 tests respectively, without ignored tests. Twenty fresh installed
consumers produce 29 reports with matching archives. Both normal native runtimes
remain byte-identical after their isolated producer rebuilds. The old packages,
exact failing assertions, complete passing logs and all 323 earlier retirement
assertion trees are retained. This is selected functional evidence, not full-plan,
platform or V1 approval; all thirteen gates remain open.

[Durable independent participant recovery](INDEPENDENT_DELIVERY_RECOVERY.md)
now retains its original archive and exact attempt, inspects destinations before
native reopen, and resumes interrupted source/upload commits without overwriting
retained work. Both native lanes first reopen read-only. Genuine upload custody
closes a reproduced race in the new coordinator: a second asset handle could
otherwise change cancelled upload state after verification but before handoff.
Ordinary current-SDK writers now honor the shared/exclusive custody lane; Cancel
still fences late upload receipts. That checkpoint's functional plan had 247 checks, including
separate custody laws and source/installed recovery workflows. Operational origin
continuation, mixed-room custody, provider/client closure and authenticated
activation remain unfinished. All thirteen V1 gates remain open.

Its [selected qualification](qualification/2026-10-21-independent-delivery-recovery.json)
passes all 61 stages and 1,897 script tests with three existing skips. Source and
fresh offline packages each repeat 99 focused laws and 256 recovery cuts, with
512 handoffs and exact whole-upload/original-file comparisons. Fourteen installed
reports pin matching archives. Preserved pre-fix packages reproduce the upload
handoff race and three cleanup/recipient-lifetime defects. Both normal native
runtime sets and all 2,986 native inputs remain unchanged; complete native-suite
evidence is carried, not freshly reexecuted. This is selected functional evidence,
not operational-descendant intent, mixed-room custody, provider/client closure,
authenticated activation or V1 approval.

[Complete independent delivery participants](INDEPENDENT_DELIVERY_PARTICIPANT.md)
now retain both native lanes, exact receipts and pending work, selected rasters and
whole upload state in a distinct portable file. Complete source guards include
outbox-only changes; actual packet/native sources still gate Ready. Canonical
private verification also repairs a reproduced fake-Ready facade path in the old
local-only participant capture. The functional plan at that checkpoint had 242 checks, including
separate participant contracts, strict types and source/installed workflows.
The separate durable participant coordinator above closes interrupted component
recovery; room coordination and authenticated activation remain substantive work,
not inferred from component restore or archive hashes.

The [complete participant qualification](qualification/2026-10-21-independent-delivery-participant.json)
passes all 55 selected stages and 1,797 script tests with three existing skips.
Source and fresh offline packages each pass 44 focused laws, 120 local native
configurations and 88 authenticated network cases, including 136 complete network
archive restores. Thirteen installed reports pin the same archives; the exact
final fake-Ready regression fails on the preserved previous package. All 2,986
native inputs and six normal shared runtime files remain byte-identical, so the
preceding complete native-suite evidence is carried, not freshly reexecuted.
This was a subset of the 242-check plan. Operational continuation and
whole-room/provider integration remain the next boundaries before fresh
authenticated activation. All thirteen
V1 gates remain open.

[Independent history delivery](INDEPENDENT_DELIVERY.md) now binds independently
selected native document/comment histories, relay receipts and all three retained
review/version stores to one atomic client transaction. Named adapters require
actual ownership; old constructors refuse the new family even when its document
lane is original. Current readable recovery remains distinct from acknowledged
durable progress. The functional plan at that checkpoint had 238 checks, including native,
authenticated loopback and unchanged fresh installed-package assertions for the
new family. Physical whole-room/asset adoption, independent server-log generations
and authenticated activation remain unfinished. All thirteen V1 gates remain open.

Its [qualification](qualification/2026-10-21-independent-delivery.json) passes
53 selected stages, 1,752 script tests with three existing skips, and fresh
379-test server-enabled and 267-test no-server native suites. Source and installed
packages repeat the same 120 local native and 88 authenticated network cases,
with 32 focused laws. Twelve installed reports retain matching package hashes;
the original browser/rich archives and six normal shared runtime files stay
unchanged. The exact final legacy-adapter regression fails on the preserved old
archive. This is selected functional evidence, not full-plan or V1 approval.

[Capture-bound native histories](CAPTURED_NATIVE_HISTORIES.md) distinguish both
native lane families and absent versus unselected comments. Inventory and
operational coverage consume actual lifetime-checked reads without widening old
archive codecs. Private live change identities avoid rebuilding comment views
on each guard check. Independent local captures expose both lanes internally;
whole-room adoption remains separate work. The
functional plan at that checkpoint had 234 checks. The
[captured-history qualification](qualification/2026-10-21-captured-native-histories.json)
passes 34 selected checks and 1,719 script tests, with three existing skips.
Source and installed packages each repeat 300 native cases, 300 cold pairs,
900 future history comparisons and 47 focused laws. Full selected-source
validation remains mandatory; native-only reads cannot certify retained outboxes.

[Owned core lifetime](OWNED_CORE_LIFETIME.md) now separates a failed final save
from explicit resource abandonment after prior native disposal. The actual
leases release only after existing storage work settles; committed histories
stay intact for native cold replay. Last observed revision clocks are metadata,
not a replacement native checkpoint or live grant. Canonical terminal operations
cannot be redirected through a public core getter or method override. The
functional plan at that lifetime checkpoint had 229 checks. The
[lifetime qualification](qualification/2026-10-21-owned-core-lifetime.json)
records the reproduced old-archive failure, 29 passing selected checks and 1,670
script passes with three existing skips. Independent transport/outboxes, fresh
client permissions and durable activation fencing remain unfinished.

The [physical client/provider asset read](PHYSICAL_CLIENT_ASSET_RECONCILIATION.md)
now derives actual selected original/generation native/packet requirements,
snapshots complete upload stores and resolves them together with native server
bindings and actual provider bytes. Missing mappings, binding bytes and whole
upload bytes remain distinct. Provider availability does not settle pending,
cancelled or failed queue work. Frozen server mappings, source files and actual
in-flight ownership remain protected; no owner is released or source retargeted.

Its [selected qualification](qualification/2026-10-21-physical-client-asset-reconciliation.json)
passes 34 stages, 379 server-enabled and 267 no-server relay tests/doctests,
and 1,608 script tests with three existing skips. Source and fresh offline public
archives each repeat 108 joint reads with native images and unreferenced upload
bytes, 180 exact file/record/upload comparisons and future native history.
This is a subset of the 216-check functional plan, not a V1 or parity approval.
The paired shared runtime and browser/rich archives are unchanged; the SDK adds
the explicit new read scope. All thirteen V1 gates remain open.

An independently reproduced existing source-reader defect is now repaired:
public facade reference/guard overrides could hide a native image binding from
capture metadata. Canonical module-initialized reference, packet and borrowed
recovery readers now retain the actual native read. The
[reader repair qualification](qualification/2026-10-21-canonical-native-source-readers.json)
passes 17 selected stages and 1,610 script tests with three existing skips.
The exact byte-identical real-Wasm probe fails on the prior public archive and
passes twenty source and twenty installed cases; actual mutations still refuse.
Private generation stamps retain their original lightweight 1,000-check law.
Complete native evidence is carried only across unchanged native inputs/runtime,
not claimed as reexecuted in this SDK follow-up. The functional plan then had
219 checks; neither checkpoint is whole-plan, parity or V1 approval.

The separate [independent participant backup](INDEPENDENT_PARTICIPANT_BACKUP.md)
now captures actual independently selected document/comment histories with local
versions, selected native raster bytes and the complete upload-state file. It
preserves cold native pairs and future document/comment Undo/Redo after offline
peer changes; missing bytes remain Pending. Old original/generation readers and
native formats remain closed. Explicit current policy, empty destinations and
actual Rust replay are still required. That checkpoint's functional plan had 224 checks.

Its [selected qualification](qualification/2026-10-21-independent-participant-backup.json)
passes all 24 stages and 1,642 script tests with three existing skips. Both source
and fresh offline packages repeat 80 native configurations, 160 cold pairs,
240 future history comparisons and 30 focused laws. A reproduced JavaScript
construction gap is repaired with runtime-only keys on nine source-owner
constructors; the exact final regression fails on the retained pre-key archive
and passes on the repaired source and installed package. Native Cargo evidence
is carried only across unchanged native inputs/runtime. All thirteen V1 gates
remain open.

Durable native/client intent, fresh selected-client permissions, independently
segmented comment transport/room integration, explicit historical-copy decisions
and authenticated activation fencing remain the highest architectural priorities. Cosmetics and
platform polish do not substitute for that functionality.

The distinct [physical client-operation parent](PHYSICAL_ROOM_CLIENT_OPERATION.md)
now co-owns actual staged mixed clients, all original/current source files and
three durable store/lease owners. It replaces both private native guards together,
cold-reopens complete clients under explicit current permissions and releases
all clients or none. First owners remain read-only; a completion marker cannot
manufacture native readiness or promote a permanent review observer. The
separate native ancestry contract below now preserves ancestor, actual local
origin and current host state. The separate live control below now joins genuine
native/client reads. Durable whole-room intent, complete provider/client closure
and server activation remain architectural work.

The [physical recovery control](PHYSICAL_RECOVERY_CONTROL.md) introduces explicit
read-only operator authentication and a live `checkNativeHost` client method.
Actual owners remain held across callbacks, cancellation and close; current
operational descendants keep offline work without relaxing exact-backup readers.
Missing/unbound streams and historical copies remain Pending. The native router
holds only a weak reference and has no edit/upload/restore/activation routes.
This live join does not yet implement the durable whole-room coordinator,
complete client/provider byte closure or authenticated activation.

Its [live control qualification](qualification/2026-10-21-physical-recovery-control.json)
passes all 28 selected stages, 367 server-enabled and 267 complete no-networking
Rust checks, and 1,566 script tests with three existing opt-in skips. Source and
fresh offline installed packages each perform 108 joint reads, including eighteen
writable-generation-author reads, while retaining exact files, records, uploads
and future Undo/Redo. The script suite also covers a reproduced unread-response
cleanup defect. All six normal shared runtime files and core inputs are unchanged;
the collaboration SDK package changes, while browser/rich-content archives do not.
This is an explicit selection from the 210-check functional plan, not full-plan
qualification or closure of any of the thirteen V1 release gates.

A follow-up [native body custody repair](qualification/2026-10-21-physical-control-body-custody.json)
fixes a reproduced lock leak: an authenticated incomplete HTTP body held actual
native ownership after the controller was dropped. Waiting bodies now retain
only their independent quota permit; native ownership is reacquired from the
same live controller after complete admission. Running native workers still
retain their actual leases until completion. The same failing/passing test and
exact old production inputs are pinned. All 28 selected stages pass again,
including 368 server-enabled, 267 no-networking and 1,566 script checks with three
existing skips. All three public package archives and the shared runtime remain
unchanged; durable coordination and all thirteen V1 gates remain open.

The [physical server ancestry contract](PHYSICAL_SERVER_RECOVERY_ANCESTRY.md)
now wraps genuine prepared native ownership without rewriting the actual local
restore origin. Complete archive ancestry is verified separately from each
archive's retention in the current host. Full A/B/C captures, all current
protected streams and conservative server asset reads share authenticated native
transactions. Weak proofs bind the exact host and source selections, not only
matching document clocks. Original recovery APIs remain closed.

Its [native ancestry qualification](qualification/2026-10-21-physical-server-recovery-ancestry.json)
passes 25 selected stages, 341 server-enabled and 267 no-networking Rust checks,
plus 1,527 script tests and fresh installed recovery consumers. The normal shared
runtime and public packages remain byte-identical. During qualification a
separate deterministic provider-callback stale-result defect was reproduced in
the original availability path, outside the new ancestry wrapper.

That callback ordering is now repaired: the final actual native/raster source
comparison follows every provider callback before either Verified or Pending
publication. Four unchanged public Rust regressions now pass after failing on
the previous implementation. Saved formats, mapping rules and activation
permissions are unchanged; altered source files are preserved, never repaired
incidentally.

Its [callback ordering qualification](qualification/2026-10-21-provider-callback-source-ordering.json)
passes all 16 selected stages, 345 server-enabled Rust checks, fresh no-networking
public compatibility and 1,529 script tests with three existing opt-in skips.
Fresh source/installed recovery consumers preserve exact native histories and
byte-identical public packages. That qualification predates the physical-host
provider availability contract below; the combined SDK/native parent remains
architectural work.

The distinct [physical provider availability contract](PHYSICAL_SERVER_ASSET_AVAILABILITY.md)
now joins genuine native A/B/C protected-stream continuity to exact current
provider mappings and actual native PNG/JPEG/WebP bytes. It reuses the original
server-private resolver without changing canonical/opaque identifier meanings.
Weak native/provider proofs stale on complete source changes; final actual
source comparisons follow every callback before Verified or Pending publication.
Ten native and ten exported-only grammar/transport cases preserve actual local
origin, offline document/review work and future peer-preserving Undo/Redo.
Client/outbox closure, historic-copy decisions, SDK/native parent integration
and fenced activation remain separate; no V1 gate is closed by this feature.

Its [physical provider qualification](qualification/2026-10-21-physical-server-asset-availability.json)
passes all 21 selected stages, 358 server-enabled and 267 complete no-networking
Rust checks, and 1,531 script tests with three existing opt-in skips. A separate
locked offline Rust project repeats the exported-only consumer. Fresh source and
installed client-operation workflows retain exact native histories, files and
whole uploads with unchanged assertions. Public packages and the normal shared
runtime remain byte-identical; this is server-scope functionality, not a V1 or
whole-room activation approval.

Its [functional qualification](qualification/2026-10-21-physical-room-client-operation.json)
passes 33 selected stages and 1,525 script tests, with three existing opt-in
skips. The same thirty native mixed cases and interruption assertions pass in
fresh offline archives. At that checkpoint the writable-generation-author
cold/future path remained a focused follow-up: the mixed fixture's generation
participant is an observer. No source, browser or V1 gate is implicitly waived.

The subsequent [author conformance](qualification/2026-10-21-physical-generation-author-conformance.json)
now closes that test gap. Eleven selected stages preserve byte-identical public
packages while source and installed probes add six writable-author cohorts across
both native wire transports and three client modes. Twelve cold author opens
retain actual pending document/review history, exact native records and whole
uploads. History actions must commit rather than merely match no-ops. All 1,525
script tests pass again with three existing skips. Production code, protocol
meanings and all thirteen still-open V1 gates remain unchanged.

The distinct [physical client stage](PHYSICAL_ROOM_PARTICIPANT_STAGING.md) now
co-owns the immutable catalog and a separate intent database. It restores mixed
original/generation clients privately and read-only, pins actual storage context,
and requires native reopening rather than completion markers on restart. Thirty
mixed cohorts retain all 180 files and unresolved historical copies while
preserving future document/review history. Closed catalogs now release their
private Blob/client maps after a reproduced retention failure. Matching native
host/operational-parent integration, complete source closure and activation
remain work; no V1 gate is closed by these implementation checks.

Its [functional qualification](qualification/2026-10-21-physical-room-participant-staging.json)
passes 29 selected architectural stages and 1,482 script tests, with three
existing opt-in skips. Fresh offline installed packages repeat all native staging
assertions and 41 storage/intent laws. The native source/runtime bytes are
unchanged from the preceding committed qualification, so that prior native suite
evidence is explicitly carried rather than reported as newly executed.

Ordinary closed [live history staging](LIVE_HISTORY_STAGING.md) now forks the
actual native document and Undo/Redo owner without replaying the Breditor
semantic journal. Every retained causal input is re-admitted before full
candidate validation. Cold restore remains independent complete semantic replay;
original natural typing-group reopening retains its replay path. Deterministic
work-count laws and actual old/new native histories cover this distinction. The
fork still copies retained native operations and validates the full candidate;
long-session resource qualification and existing Undo limits remain separate.

Its [functional qualification](qualification/2026-10-21-live-history-staging.json)
passes all 37 selected architectural checks, including 669 collaboration, 325
relay, 264 complete no-networking and three independent-review Rust cases.
Source and fresh installed old/new runtimes each pass 144 policy configurations,
3,168 exact owner comparisons, 288 cross-version restores and 1,728 future-history
comparisons. The independent installed-history and copied native consumers pass
too. These results do not close the remaining room-integration or V1 gates.

The reference host now has an explicit Unix
[physical server-log generation backend](SERVER_LOG_GENERATIONS.md). Rotation
retains every accepted file, global receipt positions and native history; manual
and automatic cuts share a synced-intent protocol and exact cold retry. Real
filesystem regressions cover eight interruption points, two capacity cuts beyond
8,192 events, and a native suggestion revision split across files. Reproduced
in-place change detection and original-reader suffix loss are repaired. The seed
uses the separate framing family too, so copied or hard-linked roots cannot
masquerade as original standalone rooms; existing original logs are not rewritten.

The separate native archive now retains the complete selected file closure and
bounded unpublished stages. Insert-only resumable restore replays native state
and checks the independently trusted source before public readiness. Exact native
histories, old offline input and future peer-preserving Undo/Redo survive in all
forty independent document/comment family combinations. This native-only archive
does not include raster bytes or client journals and does not activate a service.
Original-only participant, retained-reference and joined raster APIs still refuse
the new layout; separate generation-aware contracts follow below.

Distinct generation-aware native participant and retained-asset readers now bind
their whole output to the exact archive and physical manifest. Participant
continuity requires actual native verification plus every original protected
resume record, including revoked accounts and observers. A physical-only cut
stales that proof even without new document operations. Retained-asset traversal
includes deleted causal image bindings, versions and rejected/abandoned review
packets across files; visible ASTs and active catalogs are not substitutes.
These are server-scope inventories, not raster-byte recovery, client/outbox
coverage, provider reconciliation or authenticated activation.

The distinct [joined generation server recovery](GENERATION_SERVER_ROOM_RECOVERY.md)
now captures complete native history with actual retained PNG/JPEG/WebP bytes.
Its insert-only resume binds actual component and file ownership, replays native
state and checks both owners before one joined completion barrier. Streaming
output and owned-input admission avoid another full native history buffer.
Exact retries, forty native family combinations, old offline document/comment
work and future peer-preserving history are covered by functional regressions.
An explicit operational handoff now retains the actual joined owners and synced
storage provenance. Cold reopen admits complete later history and immutable
uploads while preserving original physical ancestry, rasters and recovery-file
custody; it refuses pending rotation/uploads and torn tails without repairing
them incidentally. The prepared authenticated host now retains actual coordinator
and raster ownership across handles and cancelled native workers. Its complete
original/current server and participant selections require fresh owner auth and
every current protected stream, including revoked/observer records. Weak live
proofs stale on physical-only cuts and raster-only additions; complete server
dependency reads retain their physical source pin and whole Ready/Pending result.
The prepared host exposes no router. Matching room catalogs, provider/client
reconciliation and authenticated whole-room activation remain separate work.

The SDK now has a distinct
[physical participant inventory](SERVER_GENERATION_PARTICIPANT_INVENTORY.md)
reader. It retains the complete native cut, physical manifest and archive digest
through original, generation and mixed client-prefix diagnostics, without
widening the original single-log reader or either existing catalog. Mixed
cohorts use genuine source owners, preserve pending histories and refuse
duplicate writer/actor copies; ordinary writer/review leases remain required.
The native file bridge includes cold operational recovery, physical-only source
changes and a global cut beyond 8,192 records. The separate physical-server
retention catalog is described next; its operational parent, provider/client
closure and activation remain the next integration.

The distinct [physical room recovery catalog](PHYSICAL_ROOM_RECOVERY_CATALOG.md)
now retains both complete original/current native+raster server files, current
native participant metadata and every selected original/generation client copy.
Atomic absent-only storage, fresh complete durable-byte admission and retryable
cleanup do not overwrite old or occupied stores. Historical copies stay pending
until explicitly reconciled. The new bounded Rust SHA-256 owner avoids whole
large-server-file buffers and does not own an editor or confer replay/authority.
The existing native file bounds, original protocols and defaults are unchanged.

The functional bridge admits twenty actual native server files in ten profiles,
including a cut beyond 8,192 records. Thirty mixed catalogs cold-reopen all 180
retained files exactly. Separate failures exercise changed physical pins,
corruption, lost acknowledgements, changed caller selections/factories, actual
storage context, cleanup custody and close/read ordering. This is file retention
and genuine prefix diagnostics, not native staging, continued-origin transfer,
provider/client closure or authenticated activation. Its full resource envelope
and platform durability still require qualification.

The [physical catalog qualification](qualification/2026-10-21-physical-room-catalog.json)
passes all thirty selected architectural stages on frozen source: 325 relay,
264 complete no-networking, 666 collaboration and three independent-review
tests, plus 1,439 script cases with three existing opt-in skips. The complete
no-networking run is broader than the earlier carried 203-case selected subset.
Fresh offline public packages verify the same thirty catalogs, all 180 retained
files and the 35 bounded digest tests, with strict public types and 45 pinned
registry artifacts. No workspace links, React or synthetic storage enter the
production import graph.

A reproduced callback re-entry could start two verifications before the first
promise was assigned. Busy ownership now reserves before callbacks; the same
positive assertion passes in source and installed packages. Old/new application
Wasm retains 49 exact original document checkpoints and 1,440 original review
comparisons, cross-version recovery and future history. Export, path and
dependency guards are intact; the existing notice/license gap is not waived.
Five additional checks bring the functional plan to 188, not all run here.
Native client staging, continued-origin transfer, full provider/client closure
and authenticated activation remain work; all thirteen release gates stay open.

The [physical inventory SDK qualification](qualification/2026-10-21-server-generation-inventory-sdk.json)
passes 35 new metadata contracts, the 20 original metadata contracts, 67
candidate-runner and 1,367 script cases on frozen source. Actual native captures
cover ten profile/transport choices, independent native document/comment cuts,
fresh protected-stream verification and physical-only changes. Source and fresh
offline installed packages run identical genuine-client assertions: 60 cold
generation recoveries, 60 mixed cohorts, 120 duplicate-entry refusals and future
document/review Undo/Redo. Existing document/review leases refuse duplicate-owner
requests; tests do not disable those guards to create overlapping writers.

The unchanged positive byte-budget assertion also passes after reproducing a
Blob subclass that could misreport public size. Admission now checks actual
native length before byte allocation/hash reads. Original native-inventory,
generation-inventory and V2-catalog probes pass again. Five named checks bring
the functional plan to 183, not all run by this slice. Unchanged native
implementation/tests and normal Wasm artifacts carry their earlier qualification
explicitly; three opt-in script skips and all 13 V1 gates remain open.

The [prepared-host qualification](qualification/2026-10-21-prepared-generation-host.json)
passes 325 relay, 203 no-networking, 66 candidate-runner and 1,331 script cases on
frozen source. Two positive before-fix failures show that cancelling an async
caller could release directory custody or the raster owner while its native
worker was still running. The unchanged regression now passes, including twelve
repetitions. Forty native family combinations and the public consumer retain old
offline work and future peer-preserving Undo/Redo through the prepared host. A
separately pinned consumer also passes after 8,200 additional actual native
events, beyond the original single-log limit. Maximum-layout host recovery passes
under the isolated 192-descriptor budget. Strict linting/rustdoc pass; three
existing opt-in skips remain skips. Unchanged core/runtime/package evidence is
carried explicitly, not relabeled as a new whole-plan or V1 run.

The [operational generation qualification](qualification/2026-10-21-generation-operational-recovery.json)
passes 313 relay, 203 no-networking, 66 candidate-runner and 1,331 script cases,
strict linting/rustdoc and an independent public Rust consumer on frozen source.
Forty native document/comment family combinations preserve old offline work,
receipt retries and peer-preserving Undo/Redo through two operational cold reopens.
Six real handoff prefixes resolve. The unchanged positive regression reproduces
and repairs a shared finalizer that could complete a pending rotation during
non-repair replay. Preserved orphan-component controls remain pinned too, and
maximum-layout actual cold reopen passes under the isolated 192-descriptor budget.
Three existing opt-in skips remain skips; unchanged core/runtime/package evidence
is carried explicitly. This does not run the whole functional plan or close a
V1 gate.

The earlier [joined server qualification](qualification/2026-10-21-joined-generation-server-recovery.json)
passes 304 relay, 194 no-networking, 66 candidate-runner and 1,331 script cases
on frozen source, plus strict linting/rustdoc and an independent public Rust
consumer. Fourteen actual interruption prefixes resume, and both positive
provenance failures pass with unchanged assertions. Maximum-layout actual joined
restoration passes under the isolated 192-descriptor budget. Three existing
opt-in skips remain skips; the unchanged core/runtime/package qualification is
carried, not relabeled as a new whole-plan or production run.

The [generation-reader qualification](qualification/2026-10-21-generation-native-readers.json)
passes 286 relay, 176 no-networking, 66 candidate-runner and 1,331 script cases
on one frozen source. Strict linting in both configurations and rustdoc pass;
three existing opt-in script skips remain skips. The public native restore cases
retain old offline Undo and match participant/asset selections in all ten
profile/transport choices, while the participant matrix covers forty independent
native families. Both complete readers pass at maximum retained layout under an
isolated 192-descriptor limit. This remains a native architecture slice: the
178-check functional plan, core suites and normal Wasm producers are not rerun in
full. Exact unchanged input/runtime/package evidence is carried explicitly.

The [physical storage qualification](qualification/2026-10-21-server-log-generations.json)
passes fresh 251 relay, 142 no-networking and 1,331 script cases, plus strict
linting in both feature configurations. The four reproduced positive failures
pass unchanged. Both candidate profiles require the public generation laws; the
functional plan now has 178 checks, not all run by this storage-only slice.
The subsequent [native archive qualification](qualification/2026-10-21-server-log-generation-archives.json)
passes fresh 270 relay, 161 no-networking, 66 candidate-runner and 1,331 script
cases on frozen source. Strict linting, rustdoc and the unchanged positive
descriptor-exhaustion regression pass; the latter uses an isolated 192-descriptor
limit at the supported 64-WAL layout. Forty independent native family combinations
and thirteen actual restore interruption prefixes retain offline work and future
history. Unchanged non-relay native inputs, 12 normal runtime artifacts and three
freshly packed byte-identical archives carry the prior core/runtime qualification.
Neither storage slice runs the whole functional plan or closes a V1 gate.

The reference host now supports independent
[native document and comment generations](SERVER_NATIVE_HISTORY_GENERATIONS.md),
including the private suggestion-effect author's retained history. Explicit
owner-side Enable/Seal calls stage complete native candidates, sync one durable
boundary record, then publish. Identical retries return their original global
receipt even after later boundaries or cold recovery. Original constructors,
transport meanings and bounds remain unchanged. A native boundary is not physical
log compaction or authority to activate a recovered room.

The [server-native qualification](qualification/2026-10-21-server-native-history-generations.json)
passes all 65 selected architecture checks on one frozen working tree: fresh
2,643 workspace, 661 shared and 228 relay Rust tests, three canonical research
contracts, 1,330 script contracts and 385 editor tests. A separate no-networking
pass covers 119 Rust cases. Both normal Wasm producers rebuild, and source/fresh
offline public archives repeat the independent 72-facade and 576-storage matrices.
The three existing opt-in script skips remain skips. This is a selection from the
176-check functional plan, not the whole plan or release approval.

The native matrices cover 40 server profile/transport/history combinations,
10 effect-author creation orders, mixed heading/table/caption owned acceptance,
exact cold recovery and future peer-preserving Undo/Redo. A real 1,025-input
workflow crosses two native seals while retaining one Undo item; it does not
raise the 1,000-item Undo ceiling. Joined log/raster recovery additionally keeps
exact native cuts, asset references and original image bytes; that public case
passes 16 repeated runs across both feature configurations.

The reproduced segmented suggestion-preparation bug used an original-only
checkpoint preflight. Separate staged getters now validate the selected family;
the same positive 144-configuration assertion passes after failing before the
repair, alongside 288 transport configurations and an external copied Rust
consumer. An independently reproduced temporary-fixture collision is also fixed:
cleanup custody begins only after exclusive creation succeeds, without test
serialization. Original-runtime comparisons preserve 49 document checkpoints
and 1,440 native comment comparisons, both recovery directions and future history.

Next, in architectural risk order:

1. Connect the physical client-operation parent with the separate prepared native
   A/B/C host contract. The native contract now distinguishes retained ancestor,
   actual local restore origin and current complete native cut. The combined
   parent must preserve both actual owners and refuse unrequested repair/cleanup.
   Keep original formats closed. Address
   retained Undo limits and remaining native staging/replay costs as separate lifetime
   requirements, not by dropping history or widening old bounds.
2. Compose the matching generation participant and retained-asset inventories
   and joined server archive with complete provider and client/outbox sources, then provider/client
   reconciliation and historic-copy disposition.
3. Implement authenticated whole-room activation with fresh host authority;
   valid archived bytes must not create a second live writer.
4. Extend native node/restricted-editing contracts before their product controls,
   preserving selection, history, interchange and collaboration semantics.

All 13 V1 gates remain open. No version, push, tag, publication or deployment is
promoted. Browser-specific polish and platform qualification remain later work.

### Physical log framing foundation

The private log codec now supports explicitly selected continuation framing
without changing original record bytes or letting an original reader infer a
new family. A continuation retains absolute sequence and preceding payload
digest across file cuts; its per-file admission remains bounded. That framing
checkpoint still used original-only Room creation, opening and backup.

The [framing qualification](qualification/2026-10-21-log-continuation-framing.json)
passes fresh 236 relay and 127 no-networking Rust cases, including eight new
framing laws and the existing I/O-fencing law. An independent pre-refactor
golden frame remains exact, every incomplete final-frame prefix preserves the
complete prior cut, and a real 4,096-record original log refuses another append
without mutation. Two continuation cuts retain global positions; checksum-valid
forks, gaps, wrong families, corruption and overflow still refuse.

This server-only slice carries the prior core/runtime evidence across 2,505
unchanged non-relay native inputs and 12 unchanged normal runtime artifacts.
Three freshly packed public archives are byte-identical. Core suites and Wasm
producers are not rerun in this framing slice. The separate backend above now
implements directory ownership, durable intents and physical heads. Complete
multi-file archives and matching recovery remain required; transport parsing
does not qualify activation or eliminate retained lifetime bounds.

### Previous independent SDK storage checkpoint

The SDK now exposes independent native comment generations and a separate
[atomic client history store](INDEPENDENT_HISTORY_STORAGE.md). Document and
comment histories each select original or segmented recovery explicitly. One
transaction saves their exact paired head and immutable lane files, plus local
version packets. A generation boundary keeps native Undo/Redo, original actor
counters and offline peer input; no visible-AST reconstruction substitutes for
the retained histories. Existing storage families remain unchanged and refuse
the new family rather than silently adopting it.

The [SDK/storage qualification](qualification/2026-10-21-independent-history-storage.json)
passes all 36 selected architecture stages on one frozen source tree, including
1,330 script contracts, 385 editor tests, 22 focused source contracts and 21
unchanged installed public contracts. Source and fresh offline public archives
each exercise 72 facade configurations and 576 storage configurations. The
storage matrix compares 1,728 exact cold pairs and 1,728 future-history pairs,
including failed transactions, lost acknowledgements, versions and cross-lane
generation-ID collisions. Strict public types and the production module graph
are checked separately.

Two failures in earlier development archives are retained as negative controls:
a retired editor could add version metadata, and a duplicate version could
report success after a failed save. The same positive assertions now pass against
the repaired source and public archives. They are development regressions, not
claims that this new session existed in the preceding root release.

Rust qualification carries from the native checkpoint below only after hashing
all 2,709 unchanged native/build inputs and 12 unchanged normal runtime artifacts.
This SDK slice does not rerun those Rust suites or rebuild those binaries. The
three existing opt-in script skips remain unqualified platform work. Native
Undo/archive ceilings remain; live saves still serialize complete bounded
histories. Neither unlimited retention nor an approved latency envelope is implied.

At this SDK-only checkpoint, compatible native server admission was still work.
The current native checkpoint above repairs its original-only preflight and
adds explicit retention boundaries. Physical log generations, complete
provider/client and asset/outbox recovery closure, authenticated activation and
structural extension parity remain required. All 13 V1 gates remain open.

### Previous read-only native checkpoint

Current read-only former authors can archive their retained native document and
comment histories without unlocking authoring, resetting a writer or clearing
Undo/Redo. Author operations and strict zero-authored observer operations retain
their original checks. The separately named read-only lifecycle preserves exact
root/sealed files and invalidates old live guards without creating an event.
See [read-only history archival](READ_ONLY_HISTORY_ARCHIVAL.md).

The native comment replay validator now checks immutable thread/message births
instead of repeatedly rebuilding dependency-prefix discussion views. Live
authority and visible register materialization remain unchanged. Two preserved
full-prefix oracle properties pass 4,096 generated cases each, including corrupt
histories; original-runtime comparisons still preserve exact data and future
Undo/Redo. This is admission equivalence, not an approved latency envelope.

The [architecture qualification](qualification/2026-10-21-read-only-history-architecture.json)
passes 65 selected stages on one frozen source tree, with fresh 2,643 workspace,
658 shared and 216 relay Rust tests, three canonical research contracts,
1,308 script contracts and 385 editor tests. Both normal Wasm producers rebuild
freshly. Source and fresh offline installed consumers each cover 144 independent
native document/comment configurations and 216 managed document-generation
configurations, exact cold/future histories and failed/uncertain-save retries.
The three existing opt-in script skips remain skips, not browser qualification.

The direct relay lifecycle guard also refuses own shadow `core` bindings without
executing getters or advancing native history. Its 36-configuration regression
passes in source and fresh installed packages, alongside the original ownership
cohorts. Original formats, counters, defaults and native limits remain unchanged.

At that native checkpoint, atomic SDK comment generations remained work; the
current SDK checkpoint above adds them. Compatible native server/log generations,
historic-copy disposition, complete provider/client closure, authenticated
whole-room activation and structural extension parity remain substantive work.
All 13 V1 gates remain open. No version, push, tag, publication or deployment is
promoted.

### Previous native ownership checkpoint

Original document/search, paired review and generation persistence now bind
capture, backup, version admission and cleanup to their privately owned native
editor. Replacing or deleting public `core`, or installing a getter there,
cannot redirect the saved cut or dispose a different editor. Ordinary close
retires the actual editor first; a failed final save retains its exact readable
histories and leases for retry. Explicit discard releases that owner and leaves
foreign editors and committed files alone.

The [ownership qualification](qualification/2026-10-21-managed-core-binding.json)
passes 26 selected architecture stages, 1,303 script contracts and 385 editor
tests. Source and fresh offline public archives each pass 216 native
configurations, 3,456 capture refusals, 1,296 exact-cut comparisons, 432 cleanup
checks, 216 failed-close checks and six failed-save retries, with zero getter
invocations. The preserved old SDK reproduces redirected persistence and wrong
native disposal; the same original document/paired positive assertions also fail
there. Repaired source and archives preserve exact native histories and cold
recovery. Mixed-room and operational recovery remain passing.

The three public persistence declarations are byte-for-byte unchanged. Native
qualification carries across 2,693 exact source/build inputs and the identical
normal Wasm pair; this checkpoint does not rerun the native suites or rebuild
the runtimes. Original formats, counters, defaults and storage families remain
unchanged. See the [ownership contract](PERSISTENT_NATIVE_OWNERSHIP.md).

At that ownership checkpoint, read-only former-author archival, a direct relay
lifecycle guard and comment replay cost remained separate development work.
The current native checkpoint above covers those changes. Broader retention and
room-integration requirements remain open; no release gate is waived.

### Independent native comment retention checkpoint

The [independent native comment family](SEGMENTED_REVIEW_HISTORY.md) now retains
original events, native actor counters, author-local Undo/Redo and exact
root/sealed files across explicit boundaries. Document and comment generations
remain independent choices. Native recovery replays every cut and verifies the
actual original root and retained prefixes; matching visible discussions or
re-sliced events cannot substitute for that custody. Author and zero-authored
read-only observer operations remain separate, and saved files grant no role.

Its [functional qualification](qualification/2026-10-20-native-review-generations.json)
passes 63 selected architecture stages on one frozen source tree, with fresh
2,639 workspace, 656 shared and 216 relay Rust tests, three canonical research
contracts, 1,302 script contracts and 385 editor tests. Both normal Wasm
producers rebuild freshly. Source and independent offline installed archives
each cover 72 author configurations and six observers, including exact files,
native receipts, image anchors, cold current-policy recovery and future history.
Old/new original review runtimes retain 1,440 exact comparisons, 144 cross-runtime
restores and 1,080 future-history comparisons. Original document comparisons
remain exact as well.

The original comment checkpoint/frame limits and defaults are unchanged. The
new archive has separate bounded retention; it does not establish a latency
envelope. The read-only former-author lifecycle and atomic SDK comment storage
are now qualified above. Compatible native server and log generations,
historic-copy dispositions, provider/client closure and authenticated whole-room
activation remain work.
Structural extension contracts remain ahead of presentation-only parity work.
All 13 V1 gates remain open. No version, push, tag, publication or deployment
is promoted.

### Earlier operational startup custody checkpoint

Operational factories now retain actual startup cleanup before acquiring their
first new coordinator. A refused new open or cold resume cannot abandon the
acquired locks, journals, native owners or readers if rollback also fails. The
mixed V2 parent can drain both component-recovery and operational startup
failures. Independent releases are attempted even when one fails; failed cleanup
remains reachable for retry. A returned owner is removed from this failed-opening
ledger and is never closed by a later competing startup.

The repair also preserves the same genuine ready predecessor on an interrupted
transfer. Generation rollback restores its original database-version fence;
retry cannot substitute a cold-created owner or silently consume the old owner.
No committed file or native input is deleted, rewritten or reset. Existing root
declarations, wire formats and native history meanings remain unchanged.

The [operational-opening qualification](qualification/2026-10-20-operational-opening-custody.json)
passes all 57 selected architecture checks, 1,300 script tests, 385 editor tests
and all 362 generation assertions in source and fresh offline installed packages,
with three existing opt-in skips. The same positive assertions fail in 48 cases
against preserved actual pre-fix SDK modules: twelve new-operation opens,
twenty-four early/late cold resumes and twelve same-parent held-owner retries.
Source and installed consumers each pass all 48 repaired paths. They compare
108 source-store targets across failed and successful retries, 180 original
files and 48 exact native document/review cuts, with no diagnostic teardown
before the successful retry assertion.

The full thirty-configuration V2 native matrix remains passing, including future
document/review Redo, interrupted child intent, current-policy transitions,
unchanged native/upload cuts and all-or-none mixed custody. The existing mixed
barrier again passes 480 cohorts, 960 cold participant reopens and 864 future
history comparisons per domain. Original recovery, both catalogs, managed-binding
refusals and earlier cleanup/opening regressions remain mandatory and passing.

Private source and installed preflights were development checks, not carried
passes. Final installed checks regenerate native fixtures from the frozen root
and rebuild both normal Wasm producers freshly; their bytes remain identical.
The 653 shared and 216 relay Rust tests carry qualification across 2,747 unchanged
native/build inputs, not fresh Rust suite runs. Strict installed public types,
actual archive contents and the production module graph are checked separately.

This repairs the reproduced operational-startup gap, not the unrelated historical
WebKit or unexplained native/installed observations. Direct static retry still
checks current admission policy before draining failed-opening custody; it does
not expose a cleanup-only public capability after authority revocation. Local
locks remain cooperative exclusion, not cross-device writer fencing. Existing
storage/history bounds and retained historical copies are unchanged.

Next architectural work is explicit historic-copy disposition, atomic SDK
integration of native comment generations, server-log generations, complete provider/client reference closure
and current authenticated whole-room activation, followed by remaining selected
feature parity. Outer server-log rollover alone would leave its original-family
native replica's journal ceiling intact: the next server profile must select
compatible native document/comment history and storage generations, preserving
global receipt/decision order and offline writer identities. Structural extension
contracts remain a feature-parity blocker ahead of presentation-only affordances.
These are planned obligations, not capabilities completed by this repair.
Browser/cosmetic work stays deferred. All thirteen V1 gates remain open; no
version, push, tag, publication or deployment is promoted.

### Previous durable mixed-room checkpoint

The separate [durable mixed-room parent](MIXED_ROOM_OPERATIONAL_RECOVERY.md)
now recovers genuinely staged original and generation participants together.
It commits prepared intent and every source file before consuming the V2 catalog;
all ready guards validate before any preparation pointer changes. Source transfer
reserves the catalog before its first host callback. Old formats/defaults remain
unchanged and no stored completion can manufacture a native owner.

Ordered child intent survives interrupted commits and lost acknowledgements.
Prepared publication requires exact original native/upload cuts; operational
cold reopen accepts verified later continuations. Every resumed participant
supplies explicit current document/review policy, including a child missing
after interrupted preparation. Failed staged-owner close stays pending for
retry. Immutable observer transport restrictions remain enforced. Unselected
historical copies stay retained and unreconciled; transports remain disconnected.

The [mixed V2 qualification](qualification/2026-10-20-mixed-v2-operational-recovery.json)
passes all 57 selected architecture checks, 1,300 script tests, 385 editor tests,
four private-diagnostic laws, eight retarget/lifetime laws and sixteen V2 storage
laws, with three existing opt-in skips. Source and fresh offline installed
consumers repeat all thirty native configurations: sixty returned participants,
120 cold participant reopens, 150 original files, 180 exact retained-record and
180 whole-upload comparisons, and 27 future document plus 27 review Redo checks.
Faults cover aborted/lost-acknowledged parent creation, both child publications,
parent progress markers, source close/reentry, missing/changed data, unpublished
native append, aggregate release retry, late policy/cancellation and atomic
ready-guard refusal in either family. Twelve prepared-policy release retries
verify the current-policy transition before returning any child.

The same supported original-catalog reentry assertion fails in both preserved
old transport fixtures and passes six times each in source and installed
packages. Its reservation-order cause is repaired. The earlier initial-finish
admission observations are distinct and remain unexplained. New private bounded
diagnostics preserve error causes for explicit developer tracing without public
cause fields or automatic production logging; passing checks is not an
intermittent-fault repair claim.

The existing mixed barrier freshly passes 480 cohorts, 960 cold reopens and
864 future history comparisons per domain. All 362 generation assertions run
freshly in source and installed consumers, and original participant/room,
retained-owner, rollback/opening and both catalog workflows remain mandatory.
Both normal Wasm producers rebuild freshly with identical bytes. The 653 shared
and 216 relay Rust tests carry qualification across 2,747 unchanged native/build
inputs, not fresh suite runs. Strict installed types and a production module
graph qualify the new public exports without workspace, React or synthetic
storage dependencies in that production graph.

At that checkpoint a separate startup-custody gap was reproduced in 36 cases
against preserved actual SDK modules: operational factory refusal plus cleanup
failure could strand acquired coordinators before any owner was returned. Its
expanded 48-path repair is now integrated and qualified in the operational-opening
checkpoint above. No committed source file is deleted or overwritten.

The parent retains a second durable catalog copy and does not raise existing
storage bounds. Arbitrary host factory closures are not rewritten. Historic-copy
dispositions, independent comment/server-log generations, full provider/client
reference closure and current authenticated activation remain required, along
with the remaining selected feature parity and all thirteen V1 gates. No version,
push, tag, publication or deployment is promoted. Historical WebKit and other
unexplained native/installed observations remain open.

### Previous managed-binding checkpoint

Managed-source transfers now pin semantic read-only bindings and registered
native cores. Replaced fields or prototype accessors are rejected without
invoking the replacement. Semantically unchanged freezing/sealing remains
supported. Binding-only preflights precede captured readers; the final liveness
sweep remains after cleanup and host callbacks. The repair refuses altered
bindings; it does not repair application objects or sandbox arbitrary native
method/intrinsic overrides.

The [managed-binding qualification](qualification/2026-10-20-managed-source-bindings.json)
passes all 51 selected architecture checks, 1,271 script tests, 385 editor tests,
twenty binding laws and fourteen cohort phase laws, with three existing opt-in
skips. The preserved preceding archive fails the same 120 binding assertions.
Source and fresh offline installed consumers reject all 120 substitutions with
zero replacement-getter calls, then cold-reopen 240 participants after restoring
the unsupported descriptor for cleanup. They preserve 216 future document and
216 review history comparisons. The existing mixed matrix freshly verifies
480 cohorts, 960 cold reopens and 864 future history comparisons per domain;
all 362 generation assertions run in source and installed consumers.

An initial attempt moved full liveness too early and failed the unchanged legacy
two-guard fixture at check 37. The binding-only repair restores that ordering.
A second attempt passed 46 checks before an unexpected installed original-room
admission refusal during initial finish, before fault injection. Its actual
consumer, archives and logs are preserved. One unchanged replay and thirteen
traced replays pass; they establish neither cause nor repair. The final fresh
51-check run carries no partial pass from either failed attempt.

At that checkpoint a separate deterministic original-catalog bug was reproduced
against the preserved package in both transport fixtures: transfer invoked its
source guard before reserving the catalog, allowing reentrant staging to start.
Its reservation-order repair is now qualified in the durable V2 checkpoint
above; it is not a reproduction of the unexplained initial-finish refusal.
The four earlier intermittent observations also remain unexplained.

Both normal Wasm producers execute freshly in installed original recovery with
identical output bytes. The 653 shared and 216 relay Rust tests carry prior
qualification across 2,747 unchanged native/build inputs, not fresh suite runs.
Public root exports, native history and wire formats remain unchanged. Durable
V2 operational parent intent and atomic guard retargeting, historic-copy
dispositions, independent comment/server-log generations, complete provider/client
closure and current authenticated activation remain required. All thirteen V1
gates remain open. No version, push, tag, publication or deployment is promoted.

### Previous mixed cohort checkpoint

Original, generation and mixed-family operational participants now share one
[custody barrier](OPERATIONAL_COHORT_CUSTODY.md). Both families are reserved
before the first host callback. Temporary native-reader destruction precedes
the final policy, source-cut and managed-owner checks; consumption writes only
private flags. Individual transfers and existing room adapters use the same
phases. A generation operation retains its original immutable Blob for inspection
after a late refusal, until explicit close.

The [mixed-cohort qualification](qualification/2026-10-20-mixed-cohort-custody.json)
passes all 50 selected architecture checks, 1,248 script tests, 385 editor tests
and twelve phase laws, with three existing opt-in skips. Four unchanged native
destructor assertions fail against the previous public archive and pass against
the repair. The mixed matrix covers 480 cohorts and 960 cold reopens in source
and fresh offline archives, preserving 4,605 committed-record comparisons,
960 upload-store comparisons and 864 future document plus 864 review history
comparisons. All 362 generation assertions run freshly in standalone source and
installed consumers. Original participant/room workflows, both catalogs and
their previous rollback/opening regressions remain passing.

The installed original-recovery check also runs both normal Wasm producers
without runtime reuse; their bytes remain identical. The native Rust suites
carry their prior qualification across 2,747 unchanged Rust/build inputs rather
than being counted as fresh suites. Public root exports, native history and wire
formats remain unchanged.

A separate diagnostic deliberately replaced an original owner's read-only
binding with a getter. It returned an already retired peer during the final
managed sweep. That unsupported override was the narrowly scoped hardening
gap repaired in the current checkpoint above, not a normal authority-callback
or browser fault. The four earlier intermittent observations remain
unexplained. Durable V2 operational parent intent and atomic guard retargeting,
historic-copy dispositions, independent comment/server-log generations, complete
client/provider closure and current authenticated activation remain required.
All thirteen V1 gates remain open. No version, push, tag, publication or
deployment is promoted.

### Previous catalog opening checkpoint

Both catalog factories now retain actual startup cleanup before acquiring their
first lease. If original/V2 begin or resume fails before returning an owner and
release fails too, a valid-policy retry drains that actual failed opening.
Successful returned owners leave the private ledger immediately and remain
protected from a competing retry. No file, journal, native history or public
declaration changes meaning.

The [catalog startup qualification](qualification/2026-10-20-catalog-opening-custody.json)
passes 37 selected architecture checks, 1,235 script tests, 385 editor tests,
16 opening laws, eight cleanup laws and 15 V2 storage laws, with three existing
opt-in skips. The same eight catalog assertions fail against the preceding
public archive and pass in source and fresh installed packages. They retain
four committed catalog snapshots and 32 original files, leave four aborted
creations absent, protect eight live owners and cold-reopen eight catalogs.
The existing twenty participant startup and eighteen earlier rollback paths,
all thirty native families and future document/review Undo/Redo remain passing.

All 362 individual generation assertion names also execute freshly within the
root suite. Five separate generation stages carry their preceding clean
42-check qualification across unchanged inputs rather than being counted as
fresh standalone runs. The audit checks 568 unchanged SDK/generation-test inputs
and permits only the two catalog source modules plus their three probe/fence
scripts and new fixture to differ outside documentation. Prior native-suite and
Wasm qualification carries across 2,747 unchanged native inputs; native fixtures
build normally. The default full V1 plan and its gates are unchanged.

The [cleanup contract](RECOVERY_ROLLBACK_CUSTODY.md) states the remaining direct
factory limitation: a retry checks current admission policy before draining the
private ledger; there is no public cleanup-only capability for a rejected
direct call. Parent close can drain failed participant openings it owns.

At that checkpoint the next architectural step was the common mixed-family
operational barrier, now implemented above. Historic-copy
dispositions, independent comment/server-log generations, complete client/provider
closure and current authenticated activation remain required. The three earlier
intermittent native observations remain unexplained. All 13 V1 gates remain
open; no version, push, tag, publication or deployment is promoted.

### Previous participant opening checkpoint

Participant static recovery now retains actual startup custody before acquiring
its first coordinator lease. If begin/resume fails before returning an attempt
and release fails too, a later valid-policy retry or catalog cleanup drains the
actual failed opening. The private [custody contract](RECOVERY_ROLLBACK_CUSTODY.md)
isolates storage contexts and namespaces, protects active/returned owners and
bounds pending openings at 4,096 per runtime/storage context. It grants no
authority and changes no journal, native history or public wire format.

The [opening custody qualification](qualification/2026-10-20-recovery-opening-custody.json)
passes one fresh 42-check architecture selection, 1,235 script tests, 385 editor
tests, 16 opening laws, eight earlier cleanup laws and 15 V2 storage laws, with
three existing opt-in skips. Twenty direct/catalog begin/resume paths fail
against the preserved unfixed archive and pass in source and fresh installed
packages with identical Wasm. They retain 42 committed-record snapshots and
60 original files, verify 42 absent destinations, cold-reopen twenty participants
and protect/reopen eight returned owners. Earlier six parent-cleanup and twelve
post-admission paths, all 362 generation assertions, native inventory/cohort
checks and 54 future document plus 54 review checkpoints remain passing.

The first qualifier stopped after 38 of 42 stages when installed generation
tests failed. Its inspected child output truncated the actual failing test.
Two unchanged exact-consumer replays each pass 362 tests; neither establishes a
cause or repair. The harness now streams bounded child output before checking
status, retains the unique consumer log and hashes its report on failure and
success. The fresh 42-check run carries no earlier partial pass forward. Its
installed generation log retains all 89,721 bytes.

At that checkpoint, catalog factories' own startup remained a separate confirmed
fault. The current eight-path qualification above repairs that boundary.
The two older intermittent room refusals and the installed generation failure
remain unexplained. Native fixtures build normally; prior suite/Wasm
qualification carries across 2,747 unchanged native inputs, not a fresh native
suite or producer rebuild.

After catalog startup, required architecture work is the common mixed-family
operational barrier, historic-copy dispositions, independent comment/server-log
generations, complete client/provider closure and authenticated activation.
All 13 V1 gates remain open. No public API freeze, version, push, tag,
publication or deployment is promoted.

### Previous participant rollback checkpoint

Participant recovery and both room catalogs now keep actual rollback custody
before native component restoration and staging-helper awaits. The private
[cleanup scope](RECOVERY_ROLLBACK_CUSTODY.md) retains failed cleanup functions,
attempts every independent entry, shares in-flight retries and forgets cleanup
only after successful ownership transfer. It cannot reconstruct an owner from
saved progress, grant authority, connect a transport or reset native history.

The [participant rollback qualification](qualification/2026-10-20-participant-rollback-custody.json)
passes 41 selected architecture checks, 1,219 script tests, 385 editor tests,
eight scope laws and 15 V2 storage laws, with three existing opt-in skips.
The same twelve participant-internal paths fail against the preserved previous
archive and pass in source and fresh installed archives with identical Wasm.
They cover a failed ready marker followed by a failed attempt release or native
discard, retain 64 committed-record snapshots and 52 original files, and
cold-reopen all twelve participants. The previous six parent-cleanup cases,
all 362 generation assertions, native inventory/cohort checks and future
document/review Undo/Redo remain passing in the installed consumers.

That checkpoint did not repair initial participant opens; the current twenty-path
qualification above closes that separately reproduced boundary.

### Earlier mixed family catalog checkpoint

The additive [mixed-family V2 catalog](GENERATION_ROOM_CATALOG.md) now retains
the selected server file, native inventory and every supplied original or
generation participant backup. It cold-restores selected participants into
genuine private read-only owners and combines actual native prefix checks.
Historic duplicate files remain retained and explicitly pending; no old journal
is reinterpreted and no room is activated.

Its [functional qualification](qualification/2026-10-20-mixed-generation-room-catalog.json)
passes 40 selected architecture checks, 1,211 script tests, 385 editor tests and
15 V2 storage laws, with three existing opt-in skips. Source and fresh offline
archives each cover 30 native families, 60 generation and 60 mixed participant
stages, their cold reopens, interrupted commits, changed plans and future native
document/review Undo/Redo. All 362 generation regressions and the native
inventory/cohort probes also pass in fresh installed archives. Native fixtures
build normally; unchanged native inputs carry the prior Rust-suite and
hash-verified Wasm qualification, not a fresh producer rebuild.

This work also repairs a deterministic lifecycle fault in both catalog versions:
if a parent step failed and cleanup release failed too, the catalog lost its
local child handle while leaving that child's journal lease held. Failed cleanup
now remains private cleanup-only custody until close retries it. The same six
paths fail against the preserved unfixed public archive with identical Wasm and
pass after repair. They retain 32 stored-record snapshots and 26 original files,
then cold-recover all six participants. The stopped pre-repair qualifier is
preserved; none of its passes are carried into the 40-check result.

At that checkpoint, factory-internal partial-acquisition rollback remained a
separate audit risk.
Mixed-family operational transfer still needs one common final native cut and
liveness commit. Historic-copy dispositions, independent comment/server-log
generations, complete client/provider closure and authenticated room activation
remain substantive work. The two earlier intermittent room refusals remain
unexplained, not identified as this deterministic cleanup fault. All 13 V1 gates
remain open. No version, API freeze, push, tag, publication or deployment is
promoted by this checkpoint.

Generation histories now reconcile against actual native server document/review
prefixes through `SharedRoomParticipantInventory.checkGenerationSources()`.
Original packet and version readers retain their existing meanings. Missing,
behind and unbound histories remain pending; forks and duplicate sources refuse.
An internal multi-owner coordinator verifies exact native cuts and all upload
owners before a synchronous final handoff. Release failures consume no child.

The [generation room custody qualification](qualification/2026-10-20-generation-room-custody.json)
passes 78 selected checks across three source-identical stage runs, 1,195 script
tests and 385 editor tests, with three existing opt-in skips. Source and fresh
installed archives each pass 362 generation assertions, including fifteen
retired-core handoff cases and six callback-guard cases. All 21 new assertions
fail against the preserved prior archive with the same Wasm binary. The room
matrix checks 60 native inventory participants and 240 two-child cohorts,
including 480 cold reopens and future document/review Undo/Redo. The prior
312 upgrade refusals, 180 retryable saves and 80 room handoff cases also pass.

This qualification reuses hash-verified Wasm and carries prior native-suite
results across 2,747 unchanged inputs; native room fixtures build normally.
One original-room setup intermittently refused with `room_operation_admission`
before intentional fault injection. Its inner cause and failed database were
not captured. Later unchanged-source and diagnostic runs pass, not a repair;
the earlier unexplained `catalog_integrity` observation also remains open.
A durable generation room catalog, mixed operational parent, independent
comment/server generations, provider/client closure and authenticated activation
remain required. All 13 V1 gates remain open; no version or release is promoted.

Original participant and aggregate-room handoffs now check live custody of every
selected native session, suggestion queue, revision outbox, version catalog and
upload store before returning owners. Independent database upgrades refuse even
when native histories or retained packets remain readable. Temporary save errors
remain retryable; they are not treated as irreversible storage retirement.
Generation participant handoffs also refuse upload-store retirement or explicit
close during release. The additive `RichAssetStore.checkOpen()` checks local
liveness only, without I/O; it is not a flush, idle barrier or provider-closure
proof.

The [retained-owner qualification](qualification/2026-10-20-retained-owner-handoffs.json)
passes 71 selected checks, 1,172 script tests and 385 editor tests, with three
existing opt-in skips. Source and fresh installed archives each pass 312
participant upgrade refusals, 180 ordinary save-retry handoffs and 80 room
all-or-nothing handoff cases. They compare exact committed bytes and original
files, fresh recovery and future native Undo/Redo. The 341 generation assertions
pass in both source and installed consumers, including twelve upload handoff
regressions. The same final probes reproduce 29 failures against the preserved
old archives; six ordinary save-retry controls already pass there. Earlier
native-retirement and authority/cancellation regressions remain mandatory.

The Wasm pair is hash-verified and reused; 2,747 unchanged native inputs carry
the prior 653 shared and 216 relay Rust tests, not a fresh full native suite.
Inventory fixture builds run normally. One earlier synthetic room setup refused
with `catalog_integrity` before fault injection. Its original inner cause was
not captured; later full runs pass, but that observation remains unexplained,
not repaired. Participant/room generation integration, independent comment and
server-log generations, complete provider/client closure and authenticated
whole-room activation remain substantive work. All 13 V1 gates remain open,
including release/platform qualification. No package version is promoted, and
nothing is pushed, tagged, published or deployed.

Original ready, operational and aggregate-room handoffs now recheck current
authority and cancellation after coordination release. Room children remain
owned together until one synchronous final commit, so a late refusal consumes
none of them. The [handoff qualification](qualification/2026-10-20-original-handoff-boundaries.json)
passes 68 selected checks, 1,156 script tests and 385 editor tests, with three
existing opt-in skips. Source and fresh installed archives each exercise all 66
participant and ten room families, including 268 participant cold resumes,
20 parent cold resumes and ten late two-child commit refusals. The Wasm pair is
hash-verified and reused; unchanged native inputs carry the prior Rust-suite
qualification, not a fresh full native run. Inventory fixture builds run normally.

That checkpoint covered authority/cancellation admission; the later managed
native checks above close its separately reproduced retired-session fault.
Generation catalog integration, independent comment/server generations,
whole-room activation and the other V1 gates remain open. No version, tag,
publication or deployment is promoted.

The [operational generation participant](GENERATION_PARTICIPANT_OPERATION.md)
now continues genuine recovery custody, edits and seals further native history,
retains pending work and uploads, and cold-reopens actual current stores before
explicit authenticated reconnect. It verifies native document and paired review
ancestry before autosave; equal visible text is not an origin proof. Two
generation handoff defects reproduce against the old public archive and pass
after repair: retired-source handoff and authority loss during lease release.

Its [qualification](qualification/2026-10-20-generation-participant-operation.json)
passes 62 selected checks, 1,155 script tests and 385 editor tests, with three
existing opt-in skips. Source and fresh public archives each pass 329 recovery
assertions and six author-side native-server workflows, including 18 operational
cold reopens, 24 handoffs, six server restarts and future selective Undo/Redo.
The Wasm pair is hash-verified and reused; 2,747 unchanged native inputs carry
the earlier 653 shared and 216 relay Rust tests, not a fresh full native suite.
The installed native inventory fixture builds and runs normally. Participant/room
catalog integration, independent comment/server generations, whole-room
activation and qualification of older handoff boundaries remain work. All 13 V1
release gates remain open; no version, tag, publication or deployment is promoted.

The earlier [generation asset and participant recovery checkpoint](GENERATION_ASSET_RECOVERY.md)
now captures complete native sources, image bytes and every upload state. It uses
separate bounded file families rather than putting generation history into an
old journal. Restartable recovery retains the original file, replays actual
native sources and refuses to overwrite changed destinations. The same 86
functional assertions pass against fresh public archives, including all three
native profile versions, document-only owners, permanent observers and the
original version-only wire profile. Its
[qualification](qualification/2026-10-20-generation-asset-recovery.json) passes
59 selected checks, 911 script tests and 385 editor tests, with three existing
opt-in skips. The runtime pair rebuilds with matching hashes; 2,747 unchanged
native source/build inputs carry the prior 653 shared and 216 relay Rust tests,
not a fresh native suite run. Participant/room catalog integration and
whole-room activation remain open; all 13 V1 release gates remain open.

The [generation-aware permanent observer](SEGMENTED_OBSERVER_RECOVERY.md) now
retains pending proposals and immutable revisions across native generation seals
and cold recovery without enabling accepted-document editing. A separately
versioned Rust operation requires read-only policy and a zero authored prefix;
the original writable seal still refuses read-only owners. Connection readiness
waits for actual source and zero-clock persistence. An Editor regrant does not
promote the observer to Accept or document-author transport.

Its [functional qualification](qualification/2026-10-19-segmented-observer-recovery.json)
passes 54 selected checks, 653 fresh shared Rust tests, 216 relay Rust tests,
385 editor tests and 824 script tests, with three existing opt-in skips. Source
and fresh installed archives each pass six selection/history configurations,
12 Reader instances, 24 cold reopens, 12 observer seals and six native-server
restarts. Eighteen observer storage contracts also verify refusal of writable,
previously authored and detached sources, retirement and separate capability
selection. All 144 native policy combinations preserve received history and
future cold replay. Original retained-store, relay, reader/revision and backup
workflows still pass. This is a functional checkpoint, not browser qualification
or V1 approval. Operational participant generation bindings,
independent comment/server generations and complete room activation remain work;
all 13 release gates remain open. Nothing is pushed, tagged, published or deployed.

The [atomic retained-session profile](SEGMENTED_RETAINED_RECOVERY.md) now keeps
suggestion queues, immutable revisions and shared version-publication state with
native generations and document/comment relay receipts. Pending proposals remain
outside accepted content. Exact packet bytes, retry choices, server decisions,
accepted versions and native Redo survive cold recovery and server restart.

Its [functional qualification](qualification/2026-10-19-segmented-retained-recovery.json)
passes 46 selected checks, 216 fresh relay Rust tests, 385 editor tests and 804
script tests, with three existing opt-in script checks skipped. Source and fresh
public archives each pass six author-side delivery configurations, 12 cold
reopens, six server restarts and 18 future selective-history steps. Twenty-eight
retained-store contracts cover failed and uncertain saves, concurrent drafts,
retirement and version-only sources on both wire families. The original
revision/reader workflows, 216-configuration local generation matrix and both
relay transports remain passing. The unchanged shared native inputs carry the
previous 650-test qualification, not a fresh shared suite run.

The [explicit generation-aware relay source](SEGMENTED_RELAY_RECOVERY.md) now
saves native document history, paired comments, named versions and exact relay
receipts in one atomic local cut. Cold adapters verify current server prefixes
before resuming delivery; saved counters are not live readiness or permission.
Server acceptance followed by a failed local save retains the exact pending
receipt for retry without resubmitting an already accepted edit.

Its [functional qualification](qualification/2026-10-19-segmented-relay-recovery.json)
passes 39 selected checks, 216 fresh relay Rust tests, 385 editor tests and 774
script tests, with three existing opt-in script checks skipped. Source and fresh
public archives each pass ten relay configurations, 30 cold reopens, offline
rejoin, saved Redo and future selective history. Failed saves and server rollback
are checked on both original and atomic-V2 transports. The unchanged shared
native inputs carry the previous 650-test qualification, not a fresh shared
suite run. The existing 216-configuration local generation matrix and original
relay workflows also pass.

The [native history generation component](SEGMENTED_NATIVE_HISTORY.md) now has
[explicit Wasm and SDK recovery with dedicated local storage](SEGMENTED_SESSION_RECOVERY.md).
It retains exact original and sealed inputs, native Undo and Redo, pending causal
inputs, and optional complete comments and named versions. Immutable files and
the active head commit together; uncertain saves retry the exact pending cut
before newer captures, without replacing an existing file or foreign head.

Its [qualification](qualification/2026-10-19-segmented-session-recovery.json)
passes 45 selected checks, including 650 shared-core and 216 relay Rust tests,
385 editor tests, 12 storage tests and the same 216-configuration native matrix
through source and fresh public archives. A clean native rebuild also exposed
and repaired mismatched research dependency wiring at the unchanged pinned
Loro version. Original-family runtime compatibility passes 144 configurations.

Document and comment delivery now use the explicit generation-aware source, but
the approved whole-room bridge remains incomplete. The retained profile adds
author-side suggestion/revision outboxes and version publication; permanent
observers, upload/source and operational participant bindings still need their
generation-aware paths. Independent comment and server-log rollover, complete
provider/client closure, protected credentials and the final activation barrier
remain work. All 13 release gates remain open.

The [current server continuity check](CONTINUED_SERVER_RECOVERY_STATE.md) verifies
a freshly selected native cut and every current protected registration while
retaining the independently selected original log and rasters. Later edits do
not extend an old authentication proof: changed state requires a new current
selection and verification. Durable browser custody is available through
[operational room recovery](OPERATIONAL_ROOM_RECOVERY.md); deployment fencing,
historic-copy/provider reconciliation, the final activation barrier and the
approved cross-generation history bridge remain separate work.

The [operational server recovery](OPERATIONAL_SERVER_RECOVERY.md) path now
persists storage handoff before returning native components for service mutation.
Operational reopen admits later native log appends and complete rasters while
retaining the exact selected log prefix and every original raster. The original
exact recovery path still refuses changed state. Native workflows preserve
offline work, a saved Redo branch and peer edits across two operational reopens;
a real HTTP upload survives stop/restart with fresh authentication.

The [operational qualification](qualification/2026-10-19-operational-server-recovery.json)
passes 13 selected stages: 181 relay tests/doctests, 627 script tests, ten fresh
native fixture families and fresh offline installed consumers with both official
Wasm producers rebuilt. Three existing opt-in script checks remain skipped.
The Wasm hashes are unchanged; root/shared native suites are not fresh runs here.

This is server storage provenance, not authenticated whole-room activation.
Browser owner transfer, complete provider/client closure and the approved
cross-generation history bridge remain work; all 13 release gates remain open.

### Previous selected server verification checkpoint

The private native host now has a
[combined selected server check](SELECTED_SERVER_RECOVERY_STATE.md): current owner
authentication, protected original registrations and the exact native server
log/raster cut are verified in one transaction. The native proof is bound to its
live host and requires rechecking at later use; a byte-identical second restore
cannot reuse it. The [focused qualification](qualification/2026-10-19-selected-server-recovery-state.json)
passes 11 stages, including 167 relay tests/doctests, ten fresh native fixture
families and workspace SDK recovery regressions. Existing Wasm binaries are
retained unchanged; full installed-consumer checks are not rerun here. This adds a native
activation prerequisite without starting a service, transferring browser owners,
or completing provider closure or the cross-generation history bridge.

### Previous catalog qualification checkpoint

The [catalog qualification](qualification/2026-10-19-room-recovery-catalog.json)
passes 46 selected checks, including 157 fresh relay tests, 2,647 TypeScript
tests, 627 script tests, 385 editor tests and strict fresh installed consumers.
Three existing opt-in script checks remain skipped. Exact source guards carry
2,620 root and 626 shared native tests; those suites are not fresh runs here.
Both official Wasm producers are freshly rebuilt with unchanged hashes.

The [durable room catalog](ROOM_RECOVERY_CATALOG.md) retains the selected native
server bundle, inventory and every supplied client backup, then stages explicit
original-family participants privately with read-only document and review policy.
The native-backed probe covers ten server/compiler/transport combinations,
twenty staged participants, forty retained files and sixty whole-upload entries.
Lost acknowledgements, aborted parent markers, changed targets/files and false
completion markers are resolved or refused without overwriting work. Duplicate
and historical copies stay retained and pending.

Current credential/provider authority, undeclared-store discovery, authenticated
activation/handoff and the approved cross-generation bridge remain unfinished;
all 13 release gates remain open.

### Previous initial policy checkpoint

The [initial policy checkpoint](qualification/2026-10-19-initial-shared-policy.json)
passes 47 selected checks, including 626 shared native tests, 157 relay tests,
2,647 TypeScript tests, 615 script tests and 385 editor tests. Three existing
opt-in script checks remain skipped. The source guard carries 2,620 unchanged
local-root native tests; these are not fresh runs.

The [initial shared policy contract](INITIAL_SHARED_READ_ONLY.md) adds one-shot
native read-only initialization before observation, preserving exact recovery
bytes without weakening the existing publication-changing live setter. Workspace
and fresh installed public packages cover 108 explicit scope/history combinations,
216 exact native restarts, and twenty protected participant restores and reopens.
The room-wide durable catalog, current credential/provider authority and activation
workflow remain unfinished; all 13 release gates remain open.

### Previous client reconciliation checkpoint

The [client participant reconciliation checkpoint](qualification/2026-10-19-client-participant-reconciliation.json)
passes one frozen 41-check selection. The SDK reads the independently selected
native inventory and checks genuine inactive participant recoveries against
original accepted document/review prefixes and declared retained-store bindings.
Pending edits remain local; older sources stay pending, forks refuse, and
duplicate copies are never silently selected or discarded. Coverage is
diagnostic data, not a credential proof or activation grant. The
[reconciliation contract](CLIENT_PARTICIPANT_RECONCILIATION.md) defines these
boundaries and the separate live-policy step.

Actual native source-stop/server-restore fixtures cover all ten compiler and
transport combinations, fresh owner authentication and original protected
registration verification without exporting raw credentials. Twenty recovered
participants restore 60 primary components and cover 40 registered streams.
Their offline document/comment suffixes, permanent observers and a revoked
contributor survive. Another 110 native-backed older, forked, unbound and
wrong-namespace variants remain pending or refuse without overwriting sources.
Seventy-two future document/comment history checkpoints match independent native
restores.

Fresh offline archives repeat these workflows through bare public imports and
strict consumer types. All previous installed document/paired, retained-store,
selected-byte, participant-file and 66-configuration recovery assertions remain
mandatory and pass. The production inventory entry bundles installed code
without workspace links, React or synthetic storage. Both official Wasm
runtimes are freshly rebuilt with unchanged Wasm hashes.

The selection freshly passes 157 relay tests/doctests, 2,647 TypeScript unit
tests, 613 script tests, 382 editor tests, 37 runner contracts and 19 new reader
contracts. Three existing opt-in script checks remain skipped. The unchanged
2,620 root and 623 shared native tests are carried evidence, not fresh runs.
Node storage/lock fixtures and native private-host APIs do not qualify physical
browser, process-kill or power-loss behavior.

The first round trip correctly refused a source that the fixture changed before
checking. Reapplying live read-only policy advanced publication one to two,
because journals deliberately do not revive permissions. The fixture now verifies
the original inactive cut first; eleven subsequent policy publications explicitly
invalidate the old proof and refuse edits. Native source and revision checks
remain strict.

A durable trusted catalog must still discover and reconcile all client/historic
stores, retain protected resume credentials, resolve current-provider assets and
coordinate room-wide activation. The approved cross-generation Undo/Redo and
outstanding offline-edit bridge remains unimplemented. All 13 V1 gates remain
open; no version, push, publication or deployment is promoted.

### Previous native participant inventory checkpoint

The [native participant inventory checkpoint](qualification/2026-10-19-native-participant-inventory.json)
passes one frozen 27-check selection. The private host can authenticate the
current owner, capture every registered document/review stream at the exact
server-archive cut, and check independently protected original resume records.
Empty streams, revoked accounts and permanently non-authoring observers remain
listed. Missing records stay pending; matching them creates neither leases nor
new permissions. Native verification rejects freshly checksummed omissions and
false prefixes. The [inventory contract](ROOM_PARTICIPANT_INVENTORY.md) keeps file
integrity, native registration continuity and current authority distinct.

All ten original compiler/transport combinations pass empty and accepted
document/review prefix checks. The maximum 1,024 document registrations and 1,023
review actors remain represented. Public workflows restore actual PNG/JPEG/WebP
files and offline history, stop the source host, and require fresh account
authentication while retaining original resume records. Accepted suggestion
effects remain server authors rather than invented client registrations.

The run freshly passes 157 relay tests/doctests, 592 script tests, 382 editor tests
and 35 candidate-runner contracts. Three existing opt-in script checks remain
skipped. Unchanged SDK recovery regressions pass 66 native configurations,
222 primary restorations, 66 exact reopens and 504 future history checkpoints.
The unchanged 2,620 root and 623 shared native tests are carried evidence; matching
previous official Wasm files are byte-checked and reused, not freshly produced
or installed/browser-qualified here.

The first full run exposed timestamp-only temporary directory names colliding
between parallel tests. A deterministic same-clock-tick failure is retained.
Adding an atomic sequence preserves exclusive creation, and both the same-tick
regression and 16 simultaneous reservations pass. No production admission was
relaxed and no retry or skipped test hides the failure.

SDK reconciliation of genuine selected client backups with the trusted native
inventory, a durable global recovery catalog, protected credential storage,
complete current-provider asset closure and room-wide activation remain work.
The approved cross-generation Undo/Redo and outstanding offline-edit bridge is
still unimplemented. All 13 V1 gates remain open; no version, push, publication
or deployment is promoted.

### Previous durable participant recovery checkpoint

The [durable participant recovery checkpoint](qualification/2026-10-19-client-participant-recovery.json)
passes one frozen 32-check selection. A new inactive attempt journal pins the
independently selected participant file, destination databases and explicit native
policies. Atomic initial reservation and conditional step markers preserve
interrupted work. Readonly exact record checks precede ordinary native reopening;
the original insert-only factories restore missing started components. Actual
native/packet and upload verification precedes completion and ownership transfer.
Completed missing or divergent data is never silently regenerated or overwritten.

Thirty paired and 36 document-only configurations exercise all six selected native
factory families, 222 primary component restorations, 66 exact reopens and
504 future history checkpoints. Five post-component interruptions, committed
start/ready markers before acknowledgement, close during finish, native admission
failure and current-writer exclusion all retain their original work. The same
public workflows repeat through fresh offline installed packages, alongside the
previous document/paired, retained-store, selected-byte and participant-file
assertions. These coordinator tests use actual Rust/Wasm with explicit Node
storage/lock/PNG fixtures; they do not qualify browser/process/power-loss durability.

All 591 script tests and 382 editor tests pass; three existing opt-in script
checks remain skipped. Nine new storage contracts and a strict public type fence
are mandatory in both candidate profiles. Four retained failures led to repairs:
a closed-validator adapter received an extra field, runtime constructors lacked
private keys, fixed native factories ignored generic selection scope, and an
undeclared review field could enter the attempt plan. Original validators stay
closed; constructors now require an unexported key, selection families are typed
correctly, and known review fields plus destination ordering are normalized.
All 30 reordered-policy resumes also pass.

Both official Wasm producers are freshly rebuilt with unchanged binary hashes.
Rust/Cargo/native build inputs remain unchanged; the prior 3,378 native
tests/doctests are carried evidence, not fresh runs. A separate fresh installed
local-editor/asset browser test still passes actual codecs, storage and reload;
it is not claimed as a shared-coordinator browser test.

Authenticated global participant/store inventory, a trusted client/server
recovery catalog, protected registration/resume credentials, complete current
provider closure and durable room-wide activation remain work. The approved
cross-generation Undo/Redo and outstanding offline-edit bridge is unimplemented.
All 13 V1 gates remain open. No version, push, tag, publication or deployment is
promoted.

### Previous participant backup checkpoint

The [client participant backup checkpoint](qualification/2026-10-19-client-participant-backups.json)
passes one frozen 28-check selection. An explicit participant file retains the
original native/paired history, selected proposal/revision/version stores and
every record in the chosen raster upload database. Source capture occurs
synchronously inside the validated asset read transaction. Independent file
selection, original insert-only recovery factories and genuine recovered-source
verification preserve exact component bytes, upload epochs and opaque receipts.
This is one declared participant, not a durable room-wide recovery coordinator.

Thirty original native policy configurations restore 90 upload records,
including unreferenced files, and match 180 future document plus 180 future
review checkpoints. Fresh offline installed packages repeat those new cases
through bare imports while retaining the old 20 document/paired workflows,
90 retained-store restores/reopens and 30 selected-byte cases. A separate fresh
installed production local editor uses actual browser PNG/JPEG/WebP, IndexedDB
and SHA-256 to check the active source/upload cut, pure archive reader, all four
queue states and exact native history after a real reload. The complete
participant probe uses explicit Node storage/decoder fixtures; it is not claimed
as a combined browser or cross-device test.

All 581 script tests and 382 editor tests pass; three existing opt-in script
checks remain skipped. A failure in the new cancellation path was retained:
a second transaction abort masked cancellation with InvalidStateError. Guarding
both error-path aborts repairs the exact failing command without weakening it.
Both official Wasm producers are freshly rebuilt with unchanged binary hashes.
Rust sources, Cargo inputs and native build contracts are unchanged, so the
prior 3,378 native tests/doctests are carried evidence, not newly run tests.

Authenticated participant discovery, a trusted client/server recovery catalog,
separately protected registration/resume credentials, durable multi-store
restart/adoption and current provider/writer authority before explicit
activation remain work. The approved cross-generation Undo/Redo and outstanding
offline-edit bridge is still unimplemented. All 13 V1 gates remain open; no
version, tag, push, publication or deployment is promoted.

### Previous joined server recovery checkpoint

The [joined server recovery checkpoint](qualification/2026-10-19-server-room-recovery.json)
passes one frozen 25-check selection. An explicit private host handle captures
the actual server log and raster store under their common transaction lock order.
One independently selected file retains both original component archives.
Resumable inactive recovery fully replays the native log, finishes the original
raster store and locks both components before publishing a durable completion
record. No service activates automatically and no backup endpoint is added.

All 3,378 primary workspace/shared/relay Rust tests and doctests, 575 script tests
and 382 editor tests pass; three existing script checks remain skipped. Fourteen
new private cases cover all ten original profile/transport choices, seven
interrupted preparation/publication cuts, exact bytes, occupied/divergent state
and exclusive ownership. Two public integrations retain an offline writer and
six future selective Undo/Redo transitions without losing a peer caption, and
exercise real HTTP upload, live host capture, complete source-host shutdown,
joined recovery and explicitly fresh authentication. Old account tokens refuse;
fresh authorized accounts receive the original image bytes. Repeated public and
networking-disabled runs are not added to the primary native total.

Original room methods, existing router constructors and route registration bytes,
component formats, authentication and dependencies remain unchanged. Client/core/
runtime-build inputs and paired Wasm hashes match the prior checkpoint; the SDK
regression reuses those runtimes. Fresh producer and installed/browser results
remain earlier evidence. Complete participant and client upload-state capture,
history-wide asset closure, current host/provider/writer authority, resumable
whole-room activation and the approved cross-generation history bridge remain
work. Initial reservation ambiguity and broader crash/platform/distribution gates
also remain open. All 13 V1 gates stay open; nothing is published or promoted.

### Previous server raster backup checkpoint

The [server raster backup checkpoint](qualification/2026-10-19-server-asset-backups.json)
passes one frozen 23-check selection. The Rust host captures every original
immutable raster file, admits actual PNG/JPEG/WebP bytes and restores an
independently selected archive through explicit preparation, resumption and
completion. Partial copies remain retained, divergent or occupied storage is
never overwritten, and no service activates automatically. Original manifests,
record metadata, unreferenced assets and storage budgets stay intact.

A reproduced owner-path bug redirected later writes after a process
working-directory change or parent-symlink retarget. Retaining the original
canonical absolute directory repairs both cases. The original two failing
regressions now pass with the same command and cache selection.

All 3,362 primary workspace/shared/relay Rust tests and doctests, 574 script tests
and 382 editor tests pass; three existing script checks remain skipped. Twenty
new private archive tests cover strict admission, exact original bytes,
interrupted copies, completion ambiguity, collisions and exclusive ownership.
A public integration restores matching room and raster components, reconnects
retained offline work and exercises six future Undo/Redo transitions with the
original image bytes. Separate public and networking-disabled repeats are not
added to the primary native total.

Client/core/runtime-build inputs and paired Wasm hashes remain unchanged. The
SDK regression uses those existing runtimes; fresh producer and installed/browser
qualification are earlier evidence. Complete participant capture, client
upload-state coordination, trusted host recovery selection, current authority,
resumable room-wide activation and the approved cross-generation history bridge
remain work. All 13 V1 gates remain open; no release or publication is promoted.

### Previous server log backup checkpoint

The [server-log backup checkpoint](qualification/2026-10-19-server-room-backups.json)
passes one final frozen 20-check selection. The Rust host can capture exact durable
room history and restore it only after original native replay, host-selected
profile/genesis checks and trusted durable-cut matching. Same-room but different
history cannot substitute under fresh checksums. A private synced staging inode
is linked atomically only to an absent destination; no existing file, directory
or symlink is overwritten. Original events, bounds and ordinary startup stay
unchanged, and no network recovery route is added.

All 3,339 primary workspace/shared/relay Rust tests and doctests, 573 script tests
and 382 editor tests pass. Three existing script checks remain skipped. Separate
public and networking-disabled recovery runs also pass without inflating that
primary native count. Thirteen new private backup tests and one public full-lane
integration cover ten original profile/transport combinations, retained offline
client journals, 60 selective Undo/Redo transitions preserving a peer's text,
original duplicate receipts, inert revision preparation and real filesystem
locking/races. The public case retains comments, versions, revisions and final
Accept order without executing Accept twice.

Client/core/runtime-build inputs and existing paired Wasm hashes match the prior
checkpoint. The SDK byte regression reuses those runtimes; fresh installed/browser
and Wasm-producer results were earlier evidence, not newly executed there. At that
checkpoint, server raster recovery, complete participant capture, current auth/provider/writer
authority and resumable coordinated activation remained work, as did the approved
cross-generation Undo/offline bridge. All 13 V1 gates remain open. No publication,
deployment, package-version or V1 promotion is claimed.

### Previous selected byte backup checkpoint

The [selected-byte backup checkpoint](qualification/2026-10-19-selected-asset-bytes.json)
passes one frozen 31-check selection. A genuine selected-source capture can now
include exact admitted raster bytes through an explicit guarded host resolver,
preserving original opaque IDs and generations in an independent portable file.
Missing dependencies remain Pending. A file reader checks framing and raster
integrity, then restored native/component sources must independently prove the
exact selected records and complete reference pairs. Existing formats and
ordinary startup defaults are unchanged.

Actual shared Wasm and fresh installed packages cover 30 captures/files, 90 exact
component archive reconstructions, 30 restored-source checks and 180 future
document/comment checkpoints. The installed production browser additionally
creates PNG/JPEG/WebP, renders nine exact bindings, checks three restored native
sources and revokes URLs, then repeats after a real IndexedDB Blob/page reload.
All 572 script tests and 382 editor tests pass; three existing script checks stay
skipped. A reproduced limits-validator bug accepted unknown inherited property
names; own-key validation repairs it, and the identical failure input now passes.
Officially rebuilt Wasm hashes and native/build inputs match the prior checkpoint;
the earlier 3,243 Rust tests/doctests are carried evidence, not newly run here.

Selected byte files do not retain upload epochs/statuses/receipts or unrelated
pending raster files; whole-store archives remain separate. Complete participant/
server capture, resumable room recovery, current provider/writer authority and the
approved cross-generation Undo/offline bridge remain work. All 13 V1 gates stay
open; no publication, deployment or V1 promotion is claimed.

### Previous dependent store backup checkpoint

The [retained-store backup checkpoint](qualification/2026-10-19-retained-store-backups.json)
passes one corrected frozen 26-check selection. Proposal queues, revision outboxes
and version catalogs now export exact independent archives and restore them only
into absent destination keys after native admission checks and source-journal saves.
Queued/stopped intent, cached receipts/conflicts and remote Pending records stay
intact. Restore never automatically connects or finalizes a decision. Existing
formats, ordinary startup defaults and package versions remain unchanged.

Actual Wasm and fresh installed public packages cover 90 restores and 90 reopens across
30 configurations, 120 exact future document/comment histories, failed-save
export/retry and adversarial insertion/cancellation/source changes. All 558 script
tests and 382 editor tests pass; three existing script checks remain skipped.
A receiver-dependence regression introduced during refactoring has a retained
valid native failure witness and a passing same-input check after repair. The
permanent probes deliberately call the affected factories unbound. The previous
native/build inputs and officially rebuilt Wasm hashes are unchanged; the earlier
3,243 Rust tests/doctests are prior evidence, not newly run here. Individual store
commits are not a whole-room restore transaction. Asset/provider/server
coordination, the approved cross-generation Undo/offline bridge and all 13 V1
gates remain open. No publication or V1 promotion is claimed.

### Previous selected source capture checkpoint

The [selected-source recovery checkpoint](qualification/2026-10-19-selected-asset-source-capture.json)
passes one frozen 37-check selection. Native saved-version, proposal and revision
reads inventory exact snapshot or conservative source-and-intent image bindings,
including intermediate/deleted replacements. The shared SDK combines native
history with explicitly selected paired-session versions, version catalog/cache,
proposal queue and revision outbox, retaining exact recovery JSON. Missing source
or an uncached known version remains Pending. Native and producer-record checks
reject stale, copied, foreign or closed sources without discarding recovery data.

A reproduced catalog bug captured another owner's version while saving the
original owner's journal. Source continuity is now pinned through startup, live
capture and awaited saves; failed intent remains exportable and exact retry passes.
All 3,243 workspace/shared Rust tests/doctests, 13 research contracts, 550 script
tests and 382 editor tests pass; three existing script checks remain skipped.
Actual Wasm and fresh installed public packages cover all 18 shared configurations;
pinned earlier readers preserve the same 72 future checkpoints. Existing installed
browser archive/reload regressions also pass, not as browser qualification of the
new packet/capture API. Saved protocols, defaults, dependencies and versions stay
unchanged. Complete-room byte/server/writer coordination and the approved
cross-generation Undo/offline bridge remain work. All 13 V1 gates stay open.

### Previous owner-inventory SDK checkpoint

The [retained-reference SDK checkpoint](qualification/2026-10-19-retained-asset-references-sdk.json)
passes one frozen 33-check run. The native inventory now reaches an independent
bounded JSON family, optional local/shared Wasm methods, SDKs, DOM controllers and
managed local/document owners. Returned pairs and source metadata are deeply
frozen. A private owner registry rejects copied, foreign, stale and disposed
reads; restored owners derive their own inventory. DOM reads refuse composition
or an active operation. No document action, upload, storage write or asset
deletion is introduced.

All 3,235 workspace/shared Rust tests/doctests, seven research-manifest contracts,
543 script tests and 382 editor tests pass; three existing script checks remain
skipped. Five new native cases cover exact encoded bindings, canonical pair order,
complete count/byte refusal, pure guarded JSON and typed scalar admission before
historical JSON conversion. All 30 grammar/scope/history configurations pass 90
pure reads, 30 exact restores and 120 exact future checkpoints. Independently
pinned earlier runtimes restore the same 30 histories, match 120 future checkpoints
and correctly refuse the new optional capability. A losing peer image is retained
before Undo reveals it.

Fresh four-package installed acceptance repeats the complete inventory probe and
the existing writing/managed/React regressions with no workspace links. Fresh
three-package browser acceptance reads two invisible Redo image bindings while
excluding two unrelated raster-store files, rejects copied/foreign sources and
then rejects serialized/stale provenance after a real reload. Exact native future
history and all raster/queue archive checks remain intact. Earlier saved protocols,
default policies, dependency versions and package versions are unchanged.

This is still an owner-only read, not coordinated room recovery, deletion
eligibility or generation migration. Separate versions/outboxes, queued remote
frames, extension assets, remote bytes and server/writer authority remain work.
The approved cross-generation Undo/offline bridge and all 13 V1 gates stay open;
no full official profile, hosted CI, release promotion or publication is claimed.

The [native retained-reference checkpoint](qualification/2026-10-19-native-retained-asset-references.json)
adds Rust-only reads for current image bindings, exact local Undo/Redo states and
conservatively retained shared causal history. It includes invisible losing
replacements, undone image births and deleted images, not just the visible AST.
Two retained failing regressions expose incomplete-success bugs in the initial
scanner: alternate metadata fields could hide a binding, and aliased metadata
could later reveal an omitted image. The corrected read examines all contribution
fields and base properties, or refuses completeness for unsupported partial,
aliased or inline metadata. Existing admission and exact recovery remain intact.

All 29 selected checks have passing evidence at identical frozen source: 26 stages
passed before an installed-consumer npm cache miss; the remaining three passed
after restoring the exact locked artifacts. The cache failures remain recorded,
not relabeled as one uninterrupted passing run. The full workspace/shared suites
pass 3,230 Rust tests/doctests, including 20 new native cases. Six integration
contracts also pass through the independent research manifest. All 536 script and
382 editor tests pass, with three existing script checks skipped. The independent
native consumer names the public shared reference type and preserves exact future
history without a direct core dependency or downstream engine override.

Both fresh Wasm builds, SDK builds/types and installed archive/reload regressions
pass. The local binary matches the raster checkpoint; the rebuilt shared binary
differs, with its hash recorded. No Wasm/SDK inventory API or protocol/export
definition is added. Strict shared documentation is now required in both candidate
profiles. Native source copies exclude only crate-root Cargo caches; a filesystem
regression preserves vendor/source entries named `target`. Removing one verified
byte-identical duplicate cache reclaimed another 1.6 GiB without removing its
original, source, archives, logs or pinned readers.

This is an owner-only retention foundation, not deletion authority, complete-room
backup, generation migration or a complete candidate-profile run. Separate
versions, review outboxes, extension assets, server state and writer authority
still need coordination. The approved cross-generation Undo/offline bridge and
all 13 V1 gates remain open; no version or release promotion is made.

The [retained raster archive checkpoint](qualification/2026-10-18-raster-asset-backups.json)
passes one frozen 23-check run. `RichAssetStore` now captures every locally retained
raster and its exact upload state, attempts and cancellation epoch in one read
transaction. Canonical binary framing, digest and ordinary PNG/JPEG/WebP admission
precede atomic insertion into an empty store. Existing files are never overwritten;
an aborted insertion leaves no partial asset set or byte counter. Network work
remains explicit.

A retained failing test reproduces an archive-only compatibility bug: the uploader
already accepts opaque receipt strings containing lone UTF-16 code units, but the
initial archive encoder rejected them. JSON escapes now retain those code units
exactly, while the header itself remains strict UTF-8 and canonical JSON. All 14
focused archive tests, 534 script tests and 382 editor tests pass; three existing
script checks remain skipped. Six actual shared-history configurations retain
comments, saved versions, image bytes and 30 exact future checkpoints. Fresh
installed packages and one Chromium production artifact verify native image
decoding, all four queue states, occupied/racing refusal, partial-add rollback,
exact opaque receipts and real reload with retained native Redo. Both native
binaries and native inputs remain unchanged.

Approved cleanup removed only 111 old temporary dependency copies, reclaiming
about 2.1 GiB while retaining source, archives, fixtures, logs and pinned readers.
The disk-exhausted earlier qualification remains incomplete; the passing evidence
comes from the final rerun. These archives cover a whole local asset store, not
all remotely referenced assets or a coordinated document/outbox/server backup.
The approved V1 long-session requirement preserves Undo/Redo and outstanding
offline edits across generations; its native bridge and safe retention remain
unfinished. All 13 V1 gates remain open, with no version promotion or publication.

The [shared session archive checkpoint](qualification/2026-10-18-shared-session-backups.json)
passes a frozen 23-check run. Explicit document and paired-review backup factories
retain exact accepted native histories, Redo, local versions and selected nonsecret
review progress. Restore requires host-reacquired writer authority, matching native
replay and canonical byte equality, then an insert-only transaction into an absent
key. It never overwrites a session or substitutes its visible AST.

A retained pre-repair installed package reproduces a startup storage race in both
session classes: a database upgrade arrives during the awaited native factory,
blocks, and the old SDK later publishes against its old connection. The opening
fence now unblocks the upgrade, rejects/frees the unpublished owner and releases
writer leases. Existing live-session recovery is preserved.

All 36 document and 108 paired archive cases pass, including 576 exact future
history comparisons, occupied/racing destination refusal, aborted insertion and
six readable failed-close exports. Fresh official runtimes and isolated installed
packages pass 20 public-factory workflows; one headless Chromium production page
passes the same workflows and 20 exact recoveries after a real reload. All 519
script and 382 editor tests pass, with three existing script checks skipped.
Both rebuilt native binaries and native source/lock inputs remain unchanged;
no new full native-suite claim is made. The archive surface is the lower-level
public session API, not a managed/React recovery picker. Complete-room recovery
including assets/outboxes/server state, retention/rotation and all 13 release gates
remain open. This is not a historical WebKit repair or release approval.

The [native fullscreen checkpoint](qualification/2026-10-18-fullscreen-browser-installed.json)
passes one frozen 25-check run. A browser controller now borrows the existing
local/shared/document coordinator without a Rust action, protocol change,
surface remount or remote-update hold. Native entry requires a direct user gesture
and the exact idle publication outside composition. Target/document ownership,
source-bound focus and retryable asynchronous retirement prevent adopting or
exiting another session. Vanilla and React controls are independently replaceable;
the application retains and retires the controller explicitly.

All 30 grammar/scope/history configurations pass 264 unchanged-history transitions,
102 logical-selection cases, 30 exact reopens and 120 exact future checkpoints.
Eight actual React StrictMode cases preserve immutable options, rekeys and borrowed
ownership. Fresh official Wasm and isolated installed packages pass public types,
complete workflows and production bundle isolation. One headless Chromium
production artifact passes 36 native entries, 24 controller exits, 12 external
exits, mixed-content typing/history, readonly state and 12 browser-storage reopens.
All 509 script and 381 editor tests pass; three existing script checks remain
skipped. Both native binaries and 2,572 native/research/lock inputs match the
preceding checkpoint; this browser-only follow-up makes no new native-suite claim.
Physical Escape, platform/performance and the remaining selected feature/release
work stay open. All 13 V1 gates remain open; no historical WebKit repair, full
profile/hosted CI run, version promotion or publication is claimed.

The [startup rollback repair](qualification/2026-10-18-startup-host-rollback.json)
fixes a reproduced focus loss after failed startup. Native admission already
rejected malformed documents correctly; host cleanup then detached and reattached
unchanged children, blurring an existing input. Rollback now skips that replacement
when node count, identity and order match, while still restoring genuinely changed
hosts and releasing ownership. It does not refocus an element after the user moves
elsewhere or promise focus restoration after a partial mount changed the tree.

The retained failing installed-browser run and frozen 18-check follow-up establish
the repair. All six public local/shared/document/search startup families preserve
the input's focus, value and backward selection, then reopen on the same host and
writer. All 381 editor and 489 script tests pass, with three existing script checks
skipped; SDK builds/types, pinned-reader placeholder history, fresh installed
workflows and writing/input/search regressions also pass. Only five UI/test/readme
files changed outside documentation; both rebuilt Wasm binaries and the three
non-editor archives match the preceding checkpoint. This is not the historical
WebKit repair, a complete candidate profile or V1 approval. Fullscreen and all 13
release gates remain open.

The [placeholder and installed-browser checkpoint](qualification/2026-10-18-placeholder-browser-installed.json)
passes one frozen 38-check run. Optional native prompt eligibility now reaches
managed local/shared/document startup, vanilla and React owners. Only one empty
root paragraph or heading qualifies; whitespace, additional blocks and structural
content do not. Literal hints stay outside editable content, exports, clipboard
and saved history. Live label/hide updates preserve the admitted owner and exact
checkpoint. Older profiles reject unsupported options before creating an owner
or opening storage; omitted defaults retain their original DOM shape.

All 30 grammar/scope/history configurations pass exact reopen and 120 future
history comparisons. Pinned earlier readers independently restore 30 checkpoints
and match 120 future boundaries. Fresh official Wasm and an isolated four-package
consumer pass public types, unchanged complete workflows and production bundle
isolation. One installed headless Chromium production page verifies responsive
prose/heading geometry, literal labels, typing, Undo/Redo, readonly state and live
label changes. The full workspace/shared suites pass 2,612 and 598 tests/doctests;
four research contracts, 489 script tests and 378 editor tests pass, with three
existing script checks skipped. This is not the full candidate profile or hosted
CI. Fullscreen, the reproduced unchanged-host startup-focus bug and all 13 release
gates remain open; no historical WebKit repair or release promotion is claimed.

The [clean SDK build-order checkpoint](qualification/2026-10-18-clean-sdk-build-order.json)
repairs a reproduced candidate-pipeline omission: the default workspace build
does not compile the opt-in rich-browser TypeScript declarations. A warm checkout
hid the missing prerequisite before shared/editor compilation. Both profiles now
build rich-browser explicitly, type-check it and retain a two-tree regression:
the former order produces the expected missing-module failure, while the corrected
order builds/types all three SDKs without their previous compiled outputs.
The frozen 15-check follow-up passes 483 script tests, 376 editor tests, actual
writing-tool workflows and fresh installed acceptance. All four archives and both
candidate Wasm binaries match the preceding checkpoint byte-for-byte. Only three
pipeline/checker files changed outside documentation. Default browser/Wasm and
native bindings remain explicit copied prerequisites; complete cold bootstrap,
hosted CI and all 13 V1 gates remain open.

The [browser writing-tools and installed-package checkpoint](qualification/2026-10-18-writing-tools-browser-installed.json)
passes one frozen 33-check run. Optional native counts/outline reads now reach
the SDK, paginated borrowed vanilla/React controls and managed local/shared
owners. Heading navigation requires this host's exact immutable displayed source;
stale, foreign and composing actions reject without retrying a different target.
All 30 grammar/scope/history configurations pass pure reads, exact reopen and
future-history comparisons. Independently pinned earlier readers restore 30
checkpoints and match 120 future boundaries. Eight React StrictMode cases retain
immutable options, explicit rekeys and borrowed ownership.

Fresh official Wasm and isolated four-package installs pass public types,
unchanged current-runtime workflows and local-only production bundle isolation.
The complete workspace/shared suites pass 2,609 and 596 tests/doctests; two
research contracts, 482 script tests and 376 editor tests pass, with three existing
script checks skipped. Existing input-rule/search regressions and strict native,
wasm32, documentation and type checks pass. Both candidate profiles now require
portable current-runtime utility checks and fresh installed acceptance; this
selected run is not a complete profile or hosted CI run. Placeholder/fullscreen,
performance, storage lifecycle and the remaining V1 requirements stay open.
No historical WebKit repair, version promotion, push, tag, publication or deployment
is claimed; all 13 release gates remain open.

The [native writing-tools checkpoint](qualification/2026-10-18-native-writing-tools.json)
adds accepted-document Unicode counts and a stable-ID heading outline through
pure core and guarded shared Rust reads. All 15 selected checks pass: 2,607
workspace and 596 shared tests/doctests, two repeated compatibility contracts,
strict lint/docs/wasm32 checks, 472 script tests and 376 editor regressions, with
three existing script checks skipped. Counts cross format runs and follow merged
source order, while reads retain exact observations, saved history and future
Redo. Heading label truncation is explicit and does not shorten counts.

That native-only boundary did not include Wasm/SDK reads, borrowed controls or
installed acceptance; the checkpoint above adds them. Placeholder and fullscreen
remain active work. Writing utilities remain partial; no V1 gate closes and no
version, push, tag, publication or deployment is promoted.

The [input-rule candidate pipeline checkpoint](qualification/2026-10-18-input-rules-candidate-pipeline.json)
adds mandatory portable DOM/root/React and fresh installed acceptance to both
official profiles. Ten selected checks are satisfied through seven passing
stages and a three-stage continuation against identical source. It retains the
failed runner configurations, 472 passing script contracts and 376 editor tests.
All current-case counts and packaged bytes match the historical-reference proof.
The portable CI scope explicitly leaves pinned-reader qualification separate;
hosted CI, the complete candidate profiles and all 13 V1 gates remain open.

The [browser input rules and installed-package checkpoint](qualification/2026-10-18-input-rules-browser-installed.json)
passes one source-frozen 27-check run. Immutable opt-in typing shortcuts now work
through vanilla, root startup and React owners, with exact caret/publication
guards, accepted-input refusal reporting and ordinary paste/composition/remote
exclusions. Fresh official Wasm builds and independent installed archives pass
public types, reload/history and local-only bundle isolation. Full workspace and
shared suites pass 2,598 and 594 tests/doctests; 11 research contracts, 468 script
tests and 376 editor tests pass, with three existing script checks skipped.

The checkpoint also fixes a reproduced native whole-source replacement bug.
Affected older shared readers still reject newly supported replacement
checkpoints, so participants and backup readers must meet the fixed runtime
minimum. The evidence records that refusal explicitly; this is not universal
backward compatibility or a repair of the historical intermittent WebKit fault.
Portable candidate-plan inclusion was still unfinished at that checkpoint and
is added separately above. Remaining shortcuts and all 13 V1 gates stay open.
No release version, push, tag, publication or deployment is promoted.

The earlier [exclusive typing and SDK checkpoint](qualification/2026-10-18-exclusive-input-rules-sdk.json)
passes one source-frozen 19-check run. It adds combined native typing/conversion
calls and complete optional Wasm/SDK capabilities without widening old command
unions or recovery families. Full workspace/shared regressions pass 2,597 and
591 tests/doctests; 11 canonical contracts also pass through research
compatibility. Exact earlier readers restore 84 SDK-created checkpoints and
match 336 future history boundaries. Strict lint/docs, rebuilt Wasm, types,
search regressions, 464 script tests and 376 editor regressions pass, with three
existing script checks skipped. Automatic vanilla/React routing and installed
acceptance were unfinished at that boundary and are exercised by the checkpoint
above; additional shortcuts and all 13 release gates stay open.

The [native input-rule checkpoint](qualification/2026-10-18-native-input-rules.json)
adds a bounded Rust shortcut planner and explicit local/shared transformations
using existing semantic actions and history records. Full workspace/shared
regressions pass 2,591 and 587 tests/doctests; seven canonical contracts also pass
through the research compatibility build. Strict lint/docs, both wasm32 checks,
464 script tests and 376 editor regressions pass, with three existing script
checks skipped. Exact earlier Wasm readers restore 16 local and 72 shared rule
journals and match 352 future history checkpoints. The evidence retains a
missing-snippet staging failure and the seven-check continuation against the
same unchanged source, not an invented single green run. The subsequent
implementation adds exclusive typing/conversion outcomes and separately
versioned Wasm/SDK calls. Browser opt-in, installed acceptance and additional
automatic list/Enter behavior remain active functional work; native/SDK exposure
does not automatically enable a user-facing input-rule feature or promote a
release gate.

The [search controls integration checkpoint](qualification/2026-10-18-search-controls-installed.json)
connects borrowed Find/Replace controls to vanilla and React integrations.
Separately named shared/document search startup retains
explicit save families, failed-close recovery and writer leases. Independent
installed archives exercise all three grammars, exact reopens, future Undo/Redo,
mixed merged-table/caption content, comments, versions and offline peer edits.
Local-only production bundles exclude the optional shared and React graphs.
A separate headless Chromium production example verifies out-of-tree highlight
geometry and live navigation/replacement/Undo with browser storage and locks.
This is functional progress, not a fresh official producer rebuild or final
platform/release qualification. The original 13 V1 gates remain open.
All 25 selected checks pass, including 71 focused canonical native tests, 23
repeated compatibility tests, 464 script tests and 376 editor regressions; three
existing script checks remain skipped. The linked evidence records the exact
tested source, binary/installed-archive identities, failed development attempts
and successful browser screenshot.

The [search boundary and persistence checkpoint](qualification/2026-10-18-search-wasm-sdk-recovery.json)
adds optional local/application
Wasm results, complete metadata and programmatic SDK navigation/replacement.
Actual-Wasm tests pass 12 local and 36 shared cases, 48 exact restores and 192
subsequent exact history comparisons. Separate synthetic IndexedDB/Web Locks
tests pass 18 document-only and 12 paired sessions, 73 exact reopens and 13
deliberately aborted writes, retaining failed-close recovery and writer leases.
The new search-aware durable families preserve explicit original/general/document,
natural and reviewed-history choices while old readers continue rejecting them.
At that earlier boundary checkpoint, borrowed controls, decorations, top-level
startup and installed combined workflows were unfinished; the integration above
adds them without reinterpreting the earlier evidence. Release qualification
remains open. The linked
evidence pins the tested source and actual binary identities. All 25 selected
checks pass, including strict Rust checks, 34 focused canonical native tests,
23 repeated compatibility tests, 461 script tests and 374 editor regressions;
three existing script checks remain skipped.

The [shared native search checkpoint](qualification/2026-10-18-native-shared-search.json)
extends the [local search checkpoint](qualification/2026-10-18-native-search-local-replacement.json)
with guarded original-character replacement, one selective Undo group and an
explicit recovery family under the [native contract](RICH_SEARCH.md). All 2,570
workspace and 577 shared native tests/doctests pass. The 20 search contracts also
pass through the research compatibility build. Strict lint/documentation, both
wasm32 boundary typechecks, 455 script contracts and the default dependency guard
pass; three existing opt-in browser checks remain skipped.

The checkpoint traces repeated full indexing in the 4,096-match case and adds an
operation-equivalent plain-source fast path, with ordinary lowering for complex
or empty-body reinsertion cases. It documents existing Undo placement behavior:
peer text is preserved, but restored local chunks need not retain the old
per-character interleaving. The linked evidence retains the failed diagnostic,
lint and packaging attempts and proves unchanged canonical inputs for the
research-wrapper follow-up. The subsequent programmatic Wasm/SDK exposure above
is followed by the borrowed controls and installed integration above. These
follow-ups are separate from the source-pinned functional candidate qualification
above and close no release gate.

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

## Advanced review functional checkpoint

The [advanced review checkpoint](qualification/2026-10-17-rich-review-text-rebase-sdk.json)
completes the selected functional goal: durable anchored discussions with
independent history; attributed rich suggestions with queued offline decisions,
authenticated once-only Accept/Reject and owned Undo/Redo; and immutable named
versions with semantic comparison and guarded restore as a new edit. Manual,
formatting-batch and complete sparse-text revisions are connected through
optional Wasm/SDK capabilities and borrowed vanilla/React controls.

The current clean-installed combined matrix passes all six policies, 54 stock
proposal actions, 36 exact author reopens, 24 asset-cache reopens, six guarded
restores and 12 cold downloads after restart. Separate workspace and installed
text-revision matrices each pass 12 paired control cases, 24 exact text reopens
and six read-only creators. Native collaboration, relay/server and SDK/editor
suites pass 551, 82 and 374 tests respectively. Runtime/build/fixture guards pass
48 tests. All runs retain their original request and recovery gates.

The functionality is bounded as specified in the [review contract](RICH_REVIEW.md):
automatic text rebase does not accept mixed-command batches, masked children
retain conservative Accept guards, and caches/history/restore retain their
existing limits. Host credentials, fresh namespaces, asset availability and
retention stay host-owned. Public API/migration and storage lifecycle review,
package/production preparation and deferred browser/IME/accessibility/performance
qualification precede V1. No readiness row, package version, release tag,
publication or deployment is promoted by this functional milestone.

## Checkpoint trail

The advanced-review goal began with its
[native/SDK contract](RICH_REVIEW.md), adding strict durable
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

The [native effect-proof checkpoint](qualification/2026-10-17-rich-review-effect-proof-native.json)
proves that retained accepted operations reproduce their original proposal and
semantic preparation boundary. It repairs historical source reconstruction that
could falsely refuse a creation proposal after acceptance because a snapshot
retained empty containers from later history. Actual Wasm/SDK workflows now
re-prove accepted creations and exactly reopen their queues beside the original
document/comment histories. The complete native suite passes 466 tests; 305 SDK
tests and 36 runtime guards pass as well. This is a native history prerequisite,
not accepting-user Undo adoption. The one-ordered-stack/recovery contract is
documented; adoption, paired controls and installed combined acceptance remain
active work. Existing saved meanings and the application export surface remain
unchanged, and no V1 gate or publication status advances.

The [native owned-history checkpoint](qualification/2026-10-17-rich-review-owned-history-native.json)
adds one explicit recovered Rust history for ordinary edits and authenticated
device-owned Accepts. Adoption appends when acceptance arrives, authors no
document operations and remains once-only after Undo or discarded Redo branches.
Checked native inverses preserve peer text and repair recreated selections;
invisible ordinary items cannot skip an intervening accepted suggestion. The
new closed recovery wrapper retains all six scope/grouping policies while old
readers and save meanings remain unchanged. This checkpoint is native-only:
Wasm/SDK history adoption with source-before-receipt persistence, Reader-only
suggestion synchronization, revision/rebasing, paired controls and installed
combined acceptance remain active work. No V1 gate, version or publication
status advances.

The [owned-history SDK checkpoint](qualification/2026-10-17-rich-review-owned-history-sdk.json)
pairs native semantic proofs and exact owned Undo/Redo with Wasm, typed SDKs and
explicit durable source/queue families. Adopted history is saved before its
dependent final receipt; failures, reopen and duplicate original decisions never
add a second history item. Actual application-Wasm tests cover all six
scope/grouping policies beside authenticated comment sync and shared named
versions, including guarded restore and independent histories. The same mixed
matrix passes through clean-installed local archives and packaged Wasm using the
editor collaboration entry point. All 315 SDK/editor tests and 47 scoped
runtime/build/promotion guards pass, along with strict SDK, installed consumer
types and application-Wasm lint. Existing default suggestion and comment/version
workflows remain intact. Reader-only automatic suggestion sync, borrowed
vanilla/React suggestion controls and proposal revision/granular rebasing remain
functional work. No V1 gate, package version or publication status advances.

The [permanent-observer SDK checkpoint](qualification/2026-10-17-rich-review-suggestion-observer-sdk.json)
adds automatic Reader proposal/Reject synchronization through the existing
native observer contract. Readers never register/resume an author or submit
document operations; a later Editor grant cannot promote their permanent
identity into owned Accept. All six history-policy combinations pass offline
recovery, accepted foreign effects, peer-source dependency retry, grant changes,
lost Reject replies, source-save failures and automatic host restart. A separate
installed consumer passes strict public types and both six-policy author and
Reader matrices with packaged Wasm. All 325 SDK tests and 47 scoped runtime/build
guards pass. Native contracts, Wasm bytes, saved families and existing author
defaults remain unchanged. Borrowed vanilla/React suggestion controls and
proposal revision/granular rebasing remain functional work; no release gate or
publication status advances.

The [suggestion-controls checkpoint](qualification/2026-10-17-rich-review-suggestion-controls-sdk.json)
adds borrowed standalone/combined vanilla and React proposal controls with eight
separately named native-intent builders. Pure previews, offline choices, original
server outcomes and local receipt durability remain distinct. Failed persistence
retries retain the immutable packet; stale loads/previews refuse without clearing
drafts. All six history policies pass with actual Wasm, including 48 stock-action
captures/previews/final owned Accepts, mixed comment/version controls and stable
React drafts. Installed public SDK/React entries repeat this functional matrix;
permanent Reader controls also create/preview/Reject under all six policies without
authoring. All 340 SDK/editor tests and 47 runtime/build guards pass. Native/Wasm,
saved formats and package versions remain unchanged. Native protected-range
namespace planning, proposal revisions and granular character-affine rebasing
remain functional work; broad physical-browser and production qualification
remain deferred. No V1 gate or publication status advances.

The [protected text planner checkpoint](qualification/2026-10-17-rich-review-suggestion-range-planner.json)
derives proposal coverage and exact empty
paragraph identities in Rust, including identities retained only in hidden
history. Its separate Wasm/SDK capability returns the existing V1 draft without
changing source state or enabling a different journal. The ninth stock action
replaces text across structures; the original same-flow action and older
suggestion runtimes keep their behavior. All 485 canonical native tests, five
compatibility contracts, 344 SDK/editor tests and 48 runtime/build guards pass,
along with strict native/Wasm lint and SDK/editor types. Installed public SDK/React
entries pass all nine actions under all six policies, including 54 pure previews
and final owned Accepts, six partial table/image preservation cases with exact
floors and owned Undo/Redo, and six permanent Reader control regressions.
Proposal revisions and granular character-affine rebasing remain functional work;
no package version, publication status or V1 release gate advances.

The [native revision checkpoint](qualification/2026-10-17-rich-review-suggestion-revisions-native.json)
adds immutable same-author revision relations and a separately enabled reference
host transaction for pending-only supersession. Current author rights, competing
revisions and Accept/Reject races are checked before commit. Prepare alone is
inert; matching committed pairs recover the old intent's final not-accepted
outcome and new V1 publication together. Real write failures, torn records,
hostile replay and old cursor paging are tested, along with revised rich edits
and exact owned-history recovery under all six policies. All 491 canonical
native tests, 75 relay/server tests, three compatibility contracts and 344 SDK
regressions pass. Strict native/Wasm and relay/integration-test lint passes.
This is native-first: revision socket negotiation, durable client revision queues,
paired controls and granular text rebasing remain functional work. Browser
exports, existing packet meanings and package versions remain unchanged; no V1
gate or publication status advances.

The [revision client checkpoint](qualification/2026-10-17-rich-review-suggestion-revisions-sdk.json)
connects that native contract end to end. An additional explicit capability uses
the existing authenticated author or permanent Reader connection. Pure paired
Wasm/SDK capture and source proofs feed a separately selected durable revision
outbox; children enter the unchanged proposal queue only after committed
supersession and saved receipts. Offline races retain losing drafts and original
winners. Bounded immutable discovery, lazy native proof downloads and borrowed
vanilla/React controls expose chain links without changing accepted content during
capture or preview. Focused tests cover all six selection/history policies, save
failures, exact recovery, host restart, lost replies and owned child Accept/Undo.
Granular character-affine text rebasing, final API/migration and package-release
checks, production hosting/auth and deferred browser/IME/accessibility/performance
qualification remain open. This is a local functional checkpoint, not V1 readiness.

The [native character-range checkpoint](qualification/2026-10-17-rich-review-affine-range-native.json)
adds the original-character proof needed for granular suggestions. Pure capture
and resolution preserve disjoint same-paragraph edits, map stable characters
through split/join, exclude new intervening text and distinguish deletion from
equal-looking reinsertion. Separate source/current marks and protected domains
remain explicit. This is not automatic suggestion rebasing: new suggestion
packets, native effects and opt-in transport/SDK/control integration still remain.
Existing V1 guards, saved meanings and browser APIs are unchanged.

The [native formatting revision checkpoint](qualification/2026-10-17-rich-review-format-rebase-native.json)
adds the first range-proof consumer: explicit revision of a single formatting
command onto its surviving original characters. Peer insertions and unrelated
marks survive, while changed edited-format values conflict. Reference-host
supersession and accepting-user Undo/Redo work under all six policies. The child
uses unchanged V1 guards and decision ordering. Multi-command/replacement rebasing
and paired Wasm/SDK/control delivery remain open; no release gate advances.

The [formatting revision client checkpoint](qualification/2026-10-17-rich-review-format-rebase-sdk.json)
removes that single-command limitation for ordered `SetFormat` batches and their
fragmented children. A separate pure Wasm pair, SDK method and borrowed
vanilla/React action use the existing durable revision outbox and unchanged
server finalization. Pending/conflict/unsupported outcomes queue nothing. New
peer text and unrelated marks remain separate from the original formatting
targets. Text replacement, final API/migration, package release and deferred
browser/IME/accessibility/performance gates remain open.

The [combined review and raster checkpoint](qualification/2026-10-17-rich-review-assets-workflow.json)
closes the advanced-review asset-byte integration case. Two offline authors
combine image insertion/replacement decisions, changing anchored discussions,
conflicting resolution, selective histories, shared named versions and guarded
restore. All six policies pass in both workspace and clean-installed runs,
including 36 exact author reopens, 24 cache reopens, 12 cold downloads after
restart and the existing 54 stock action cases per run. Reference bytes, upload
receipts and document acceptance remain separate host-owned concerns. A
process-isolated fixture avoids accumulating fake IndexedDB rollback history
without raising heap limits or weakening the aggregate request gate. Direct
affine text replacement and the release/production qualification above remain
open; the advanced-review goal is still active and no V1 gate advances.

The [native text-revision checkpoint](qualification/2026-10-17-rich-review-text-rebase-native.json)
adds explicit conflict-on-intervening-text
rebasing of a complete insertion, deletion, rich range or protected general
range. It retains source character identity, complete selected formatting,
structural witnesses, original scope and native fresh-floor semantics rather
than lowering rich ranges into a smaller command batch. The ordinary V1 child
still uses authenticated supersession and once-only accepting-user history.

The [native masked-text checkpoint](qualification/2026-10-17-rich-review-masked-text-native.json)
adds a separately selected preserving policy: only proven originals are removed,
peer text retains its native identities and current formatting, joined flows
route rather than copy text, and protected cells/captions keep their owners.
Fresh floors reflect retained text. Authenticated acceptance and exact owned
Undo/Redo recovery work under all six policies. Masked children use conservative
exact-document witnesses for Accept.

The [native sparse-text checkpoint](qualification/2026-10-17-rich-review-sparse-text-native.json)
adds repeated revisions of those children while proving only their stored
removal spans; old peer text never becomes a target. Retained table axes keep
metadata/order guards while peer text survives, fresh floors are recomputed,
and whole-table atoms retain complete subtree witnesses. Authenticated revision
chains supersede only the pending child and keep the finalized parent's original
receipt. Paired text-rebase client delivery and installed mixed acceptance
remain open. The advanced-review goal stays active and no release gate advances.

The [text revision client checkpoint](qualification/2026-10-17-rich-review-text-rebase-sdk.json)
connects complete native text revisions to their optional Wasm/SDK pair, existing
durable revision outbox and borrowed vanilla/React controls. Both policies are
explicit; controls start with no policy selected and require host-reserved fresh
namespaces. Repeated sparse children retain peer text, while authenticated
supersession and Accept stay separate. Workspace and clean-installed runs each
pass six policies, 12 paired control cases, 24 exact text reopens and six
read-only creator cases. Existing formatting revisions pass their six-policy
regression, alongside 551 native collaboration, 82 relay/server, 374 SDK/editor
and 48 runtime/build/fixture tests. Original stored meanings, source package
versions and V1 release gates are unchanged. Public API/migration, storage
lifetime, production hosting/auth and deferred browser/input/accessibility/
performance qualification remain release work.

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
Breditor now has candidate structural blocks and shared formatting controls. This
does not freeze its V1 grammar/API or establish full catalog parity.

The inspected [Tiptap table implementation](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-table/src/table/table.ts)
keeps commands, selection/navigation plugins and data conversion as distinct
responsibilities. Breditor's tested geometry is a strong functional slice, but
numeric width commands do not establish resize-handle, rich-paste or export parity.

The inspected [CKEditor clipboard pipeline](https://raw.githubusercontent.com/ckeditor/ckeditor5/master/packages/ckeditor5-clipboard/src/clipboardpipeline.ts)
separates input transformation, model insertion and output transformation.
Breditor now has an explicit opt-in foreign-content adapter. Its authored Office
fixtures and Rust admission are not captured-producer or native clipboard
qualification; the original default safe HTML/plain-text path remains distinct.
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
   Optional foreign interchange now exists; broader producer fidelity and
   automatic Link detection remain open.
2. **Complete editing grammar.** Explicit V2 blockquote, code, horizontal-rule
   and task contracts now reach Wasm, local/shared SDKs and the reference relay.
   Named hard breaks have a one-LF policy; code exit preserves the original source.
   Atomic-block navigation, general/document selections and natural typing
   histories now have installed functional paths. Complete supported-environment
   and bidi editing qualification without flattening unsupported structures.
3. **Interchange.** The optional bounded HTML/Markdown adapter and authored
   Office/Docs/Excel fixtures now reach installed mixed workflows. Finish captured
   producer fidelity and native clipboard qualification. Deterministic JSON
   remains canonical; imports retain declared losses, fresh IDs and one guarded
   transaction.
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
open. The selected advanced-review functional portion is also complete. Remaining
parity features, storage lifecycle and production/release integration are next.
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
Existing default consumer and ABI guarantees must remain intact during V1
qualification; the functional candidate profile does not replace the full
default-package release matrix.

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
npm run verify:candidate -- --dry-run
npm run verify:candidate:functional
```

The audit validates references and prints remaining work. `check:v1` deliberately
fails while any feature or gate is open. It is a reviewed-ledger guard, not a
behavioral test runner or automatic certification; marking JSON entries complete
does not manufacture evidence. `npm run verify:release` still covers only the
default packages, not the full rich/shared V1 target.

The [candidate verifier](V1_CANDIDATE_CHECKS.md) adds repeatable native, paired
Wasm, SDK and clean-installed rich/shared/interchange/review checks with retained
source hashes and failure logs. Its full profile also invokes the existing
default release/browser checks and the fail-closed readiness guard. The functional
profile does not qualify deferred platforms or approve a smaller product scope.

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
