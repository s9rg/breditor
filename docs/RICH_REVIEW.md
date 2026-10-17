# Rich document review contract

The next functional milestone adds threaded comments, proposed changes and named
document versions to the existing Rust-owned rich editor. These are opt-in review
features, not replacements for the canonical AST, ordinary edit history or writer
transport. Existing constructors and saved protocol families keep their meanings.

## Accepted content and proposed changes

The owner selected an unchanged accepted document until a suggestion is accepted.
Pending proposals carry an attributed native intent, source witness and native
preview. They do not mutate accepted text, tables, images, selection or document
history. Rejecting a pending proposal cannot delete accepted content.

Accept must validate both the current proposal state and its document targets in
one native staged transaction. Changed targets produce an explicit conflict or
require a fresh preview; they must not trigger an unconditional snapshot overwrite.
Text, formatting, list/table structure and image properties use original native
actions, with explicit unsupported cases rather than hidden plain-text fallbacks.
The owner approved a single authenticated server decision order for concurrent
Accept/Reject. Offline review decisions stay queued until reconnect; ordinary
offline document edits and comments continue to merge. A suggestion is finalized
once, and a repeated decision returns its original result rather than inserting
the accepted change again. A stale Accept must report a target conflict without
mutating accepted content. The eventual accepted edit and final decision must
share one durable transaction and a recoverable native publication. This decision
contract is selected. Native proposal capture, historical source validation,
guarded previews, staged effects, the opt-in native reference-host decision
ledger, an explicitly negotiated reference socket lane, native/Wasm proposal
pairing, a durable SDK intent queue and automatic synchronization on the existing
document-author socket are implemented below. Recovered accepting-user history
has an explicit native/Wasm/SDK contract and paired durable storage. Permanent
Reader proposal/Reject synchronization uses a separate non-authoring transport.
Borrowed vanilla/React controls expose those proposals and decisions alongside
comments and versions. Immutable revisions, authenticated pending-only
supersession and durable revision transport/client controls are implemented below.
Explicit formatting-batch rebasing uses a separate optional native/SDK pair;
direct character-affine text replacement remains unfinished.

### Native proposal intents and previews

`breditor/document-suggestion` V1 is a separate immutable, content-addressed
proposal family. It retains a plain title, claimed creator, exact decimal creation
time, an original document source anchor and an explicit native edit: either a
bounded command batch or one general rich-range replacement. It contains no
accepted AST, history journal, credentials, permission claim or final decision.
Existing comments, versions, document updates and saved
journal families keep their meanings. Packet authorship is descriptive until the
host authenticates publication against the current account.

Capture validates the original command batch on a disposable causal fork without
changing accepted content, source operation counters, selection, pending formats
or either history lane. Document read-only mode does not prevent a pure proposal
preview. Command scope is explicit; whole-document commands require the separate
Document scope, never an absent caret. Existing typed semantics supply rich text,
formatting, lists, tables, image fields/captions and declared conversion-loss
policies. Fresh command identities remain permanently host-reserved even after a
discarded proposal. A proposal is bounded to 1 MiB. Command batches retain the
64-command ceiling; general rich-range intents use the existing native semantic
planner instead of expanding into an artificially limited command array. Partial
table and caption boundaries keep the same preservation laws as ordinary editing.

`read_document_suggestion` checks the closed envelope, digest, metadata and native
source binding. `verify_document_suggestion_source` additionally reconstructs the
retained historical source and proves that the commands have a valid nonempty
semantic result there. Missing document operations return explicit requirements.
Rehashing an invalid scalar coordinate or changing the source scope cannot bypass
native validation. The existing historical causal-closure and complete-formatting-
mark checks apply before reconstruction.

`prepare_document_suggestion_guarded` derives its source read dependencies from an
exhaustive native command match, not packet-supplied hashes or JavaScript offsets.
It returns Pending, explicit Conflict targets, or an opaque read-only preview.
Image alt, dimensions and assets are separately guarded fields; table-axis edits
can retain unrelated cell text. Caption replacement checks the old caption body.
Structural operations check relevant topology and ancestor geometry. Text edits
currently require the affected source text blocks to remain semantically equal
and retain their original native scalar identities; an unrelated edit within the
same block requires a new proposal. This conservative boundary is explicit, not
an offset rebasing or neighboring-character fallback.

Selected subtrees and explicit whole-document operations also verify their native
character identities. This closes a reproduced case where a peer deleted a source
character and inserted an equal-looking character with identical formatting: AST
equality alone incorrectly considered the original target unchanged. The native
scalar witness now reports a conflict instead of targeting the replacement.

An empty derived table-cell paragraph can be visible before its native text root
is activated. Its witness contains zero character identities without creating
that root. A later peer can register the text container while an earlier
historical cut still has no characters or flow definition; container knowledge
must not be mistaken for character presence. This closes a reproduced
`text-flow owner` failure in merge/document proposals and in conflict checking
after a peer types into the formerly empty cell. Only admitted empty derived
text blocks with no source characters use that rule. Missing real, nonempty,
mismatched or malformed flows are not converted to empty witnesses.

A Ready preview contains the admitted proposed tree, semantic changes and asset
references, without fetching asset bytes. Its exact live-owner witness cannot be
serialized or moved to another editor. `check_document_suggestion_preview` refuses
an old publication even after a disjoint peer edit; a new preview can retain that
peer's work when the original dependencies still match. No preview is an Accept,
server receipt or durable queued decision.

### Immutable native proposal revisions

`breditor/document-suggestion-revision` V1 is a separate closed relation containing
an exact predecessor ID and an unchanged V1 replacement proposal packet. Its
domain-separated digest identifies the relation, not the author's authority or a
final server decision. The predecessor packet is supplied explicitly for native
admission; no hidden mutable packet lookup or accepted AST is embedded. Ordinary
V1 capture/publication refuses a revision envelope rather than interpreting it as
an independent replacement proposal.

`capture_document_suggestion_revision_guarded` captures a complete new intent at
the current accepted native source. It is not an edit applied to the old proposed
preview. It retains the predecessor's descriptive author and requires its source
history. Planning remains pure for read-only owners under all six scope/grouping
policies. `read_document_suggestion_revision` checks the closed relation, binding,
different proposal identities and unchanged author;
`verify_document_suggestion_revision` also proves both historical native intents
and that the replacement source observes every predecessor source cut. Missing
history stays Pending. Rehashed invalid coordinates, different authors and older
child sources cannot become native source proofs. Metadata clocks remain exact
decimal strings, not server order or authentication.

The reference host enables revisions separately through
`enable_document_suggestion_revisions`. Its descriptor has a new random binding
and pins the original suggestion lane. Old activation/defaults remain unchanged.
Current document-read permission and Propose permission allow only the original
creator to replace their own pending intent, including a non-authoring Reader.
This explicit withdrawal-and-replacement does not grant arbitrary Reject or
document Accept rights; those retain their existing Review/Editor checks. Fresh
namespaces and referenced assets remain host responsibilities.

`revise_document_suggestion` serializes against ordinary Accept/Reject and other
revisions. A winning revision finalizes the predecessor once as not accepted
(the existing Reject outcome, attributed to the revising creator) and publishes
the new immutable V1 proposal. Its separate revision receipt records that this
was supersession, with the original chain root and exact successor. If an
Accept/ordinary Reject wins first, the revision returns Conflict and publishes
nothing. Two revisions against the same predecessor have one winner. Repeating
the same revision returns its original receipt even after later revisions or
child decisions; it does not create a branch or make that old child current.
Supersession is not Accept: a source-valid replacement can still conflict with
newer accepted content and needs the existing current native review/preview.

Two consecutive hash-chained records preserve existing V1 update/cursor meanings.
Prepare validates and retains the requested relation but changes neither proposal.
Only its immediately following matching Commit makes the predecessor's Reject
and replacement publication visible, after both records sync. A complete Prepare
at EOF or before another next record is inert. A torn Commit leaves the old
proposal pending after validated recovery; a fully synced Commit recovers both
outcomes even when the process never updated memory or acknowledged the request.
Uncertain second writes fence the room. Invalid author, source, identity or record
order rejects semantic replay before any incomplete tail is removed.

Existing V1 readers receive an ordinary final Reject and an ordinary new
publication at distinct adjacent sequences. A frozen page may split between them
without exposing later child decisions. Exact revision reads retain the explicit
supersession reason and lineage. Older host binaries reject the new opt-in log
tags; no old record or packet meaning is silently migrated. The existing 1,024
proposal, 32 MiB retained-metadata and whole-log limits remain; retained revision
envelopes count toward that byte budget. Native envelopes allow up to
`2 * 1 MiB + 4096` bytes to account for the embedded packet's JSON escaping.

Accepted children use the unchanged native effect and accepting-user history
contracts. Undo/Redo compensates the child's accepted document effect; it does
not reopen the predecessor or undo the authenticated revision receipt. Native
tests combine revised rich text, formatting, lists, rows/columns and image sizing
with exact owned-history recovery under all six policies.

The native checkpoint introduced the relation and transaction first. The client
integration below adds explicit transport, recovery and controls without changing
conservative V1 source witnesses. Granular character-affine rebasing remains
separate work.

The [native revision checkpoint](qualification/2026-10-17-rich-review-suggestion-revisions-native.json)
passes 491 canonical native tests, 75 relay/server tests and three compatibility
contracts, including real I/O/torn-log audits and rehashed-packet source checks.
Strict native/Wasm, relay and document-suggestion integration-test lint passes.
All 344 SDK/editor regressions and 48 runtime/build guards pass. Rebuilt native
hosts and application Wasm also pass the original four-policy author workflow
and clean-installed six-policy mixed controls/Reader regressions. Those client
runs kept revisions disabled; the separate client checkpoint below qualifies
revision delivery.

### Durable revision clients and controls

The additional `documentSuggestionRevisionsV1` capability requires both
`documentSuggestionsV1` and `writerTransportV2`. The authenticated descriptor pins
an independent revision binding and the original suggestion binding. Author and
permanent Reader adapters select `suggestionRevisions: { binding }` explicitly on
their existing connection. No extra author lease, temporary grant or second
socket is acquired. Old clients receive no revision descriptor and cannot send
revision requests. The old proposal/decision methods and saved families retain
their exact meanings.

The complete optional Wasm pair adds pure capture, descriptive admission,
historical-source proof and exact child extraction. The SDK exposes
`supportsSuggestionRevisions`, `captureSuggestionRevision`,
`readSuggestionRevision`, `verifySuggestionRevision` and
`revisionSuggestionPacket`. A stale observation refuses before capture. An older
runtime can keep its complete original suggestion capability while refusing only
the new revision path. Extracted child bytes are for preview and subsequent
committed review, never an independent-publication fallback.

`SharedSuggestionRevisions.open` borrows the existing proposal queue, durable
native source and explicitly matching transport. Its separate
`breditor/shared-suggestion-revisions` V1 record retains exact predecessor and
revision bytes, local retry state, the original committed receipt or the winning
conflict. It saves the complete source and base queue before its dependent
record. A failed write retains the same draft; `retry()` retries local persistence
without reconnecting a stopped synchronizer. `connect()` or `synchronize()` is an
explicit network action. Credentials and current permissions are not stored in
this outbox. Each local queue retains at most 256 entries and 32 MiB, independently
of the host's existing proposal/metadata limits; there is no automatic compaction.

Offline capture and preview change neither accepted content nor native history.
The new child stays outside the ordinary publication queue until authenticated
supersession commits and its receipt saves locally. The handoff then retains the
predecessor's original not-accepted outcome and caches the unchanged child with
its original publication. Existing decision syncing and accepting-user Undo/Redo
handle that child. An uncommitted revision child cannot queue Accept/Reject;
supersession must complete first. Existing published proposals retain offline
decision queuing. A losing revision keeps its exact draft and original server
winner, without publishing the child or reopening the predecessor. An intervening
Accept's operations must be retained in the durable native source before its
dependent conflict receipt is stored.

Discovery freezes the last committed revision sequence and returns at most 64
immutable relations per page. Cursors admit only activation or committed revision
boundaries, not arbitrary room-log offsets. Clients validate chain roots, unique
successors, adjacent supersession/publication order and remembered receipts before
replacing their live feed. Later child decisions do not alter those receipts.
`loadRevision` coalesces matching lazy downloads and asks Rust to verify the exact
relation and both historical sources; remote downloads do not become local
publication intent. Source synchronization and metadata hints wake pending work;
idle clients do not poll.

Passing the outbox as the third argument to
`createSharedSuggestionPanelSource(queue, suggestionSync, revisions)` enables
“Revise selected suggestion” in the existing vanilla and React composer. The
selected action builds full replacement intent at accepted content, not a delta
against the old preview. Only the creator's retained pending suggestion is
eligible. Controls distinguish queued revisions, uncommitted child previews,
committed successors and retained losing drafts, and link the predecessor's
not-accepted outcome to its successor. Unmount frees only UI subscriptions and
preview handles; it leaves the source, queues and connection host-owned.

The [revision client checkpoint](qualification/2026-10-17-rich-review-suggestion-revisions-sdk.json)
records native, SDK and clean-installed acceptance. Its focused functional matrix
covers all six selection/history policies, Reader-only revisions, offline reopen,
source/outbox/receipt save failures, final-decision races, lost replies, host
restart, native proof downloads and borrowed composer handoff. Storage, locks and
DOM are fixtures; granular text rebasing and final production qualification remain
open.

```sh
CARGO_TARGET_DIR=target/owned-history-relay-native cargo build \
  --manifest-path experiments/relay/Cargo.toml --locked --offline --release \
  --features server --example suggestions_functional \
  --example suggestion_revisions_functional
node scripts/check-suggestion-revisions-installed.mjs \
  target/owned-history-relay-native/release/examples/suggestions_functional \
  target/owned-history-relay-native/release/examples/suggestion_revisions_functional
```

### Native original character ranges

`breditor/shared-affine-text-range` V1 is an additive pure range family for the
next granular suggestion contract. It is not a V1 proposal, comment/version
packet, executable edit or server receipt. Existing V1 suggestion guards continue
to conflict on changes in their affected whole text blocks. No current SDK or
control automatically rebases an old suggestion through this primitive.

`capture_affine_text_range_guarded` captures an explicit directional text
selection and the original causal document cut without activating text roots or
changing the caret, native clocks, history or grouping. A domain-separated digest
also pins the canonical original document, not just its name and clock values;
current disjoint edits do not change that retained original cut. `read_affine_text_range`
admits closed descriptive metadata; it does not establish that source history
exists or that its coordinates are valid. `resolve_affine_text_range` rebuilds
the exact historical source, admits those original scalar boundaries and derives
the selected native character identities itself. Packets cannot supply a weaker
identity or formatting witness.

The resolver returns Pending for missing source operations. Resolved means every
original selected scalar survives in original order, with the same text kind and
protected base-cell/caption domain. It returns maximal original/current segments,
original and current marks separately, and independently mapped directional
endpoints. Peer insertions are excluded from the segments, including insertions
between selected characters. Disjoint same-paragraph edits and character-preserving
splits/joins can therefore map without a text diff or identity regeneration.
Deleting and reinserting equal text still reports original-character loss.
Deleted characters, reordered originals, changed domains/kinds and lost endpoints
return Conflict with no usable surviving subset or nearest-cell fallback.

Endpoints alone must never become a delete-between-offsets operation. For an
original empty range, Before/After endpoints can surround newly typed text while
the original selected character set remains empty. This primitive neither deletes
whole atoms nor plans paragraph joins, fresh floors or structural replacement.
A future source-checked affine suggestion action must combine the original set,
formatting conflict policy, insertion point and explicit structural contract under
one guarded native preview/effect. Handling peer insertions inside a replacement
range remains a proposal-level policy choice, not an implicit range resolution.

Each traversal uses one native flow index. Scalar keys retain the native container
and character ID while normalizing the engine's mutable origin-position hint;
opaque cursor bytes with that hint are not stable character keys. Original and
current formatting/block bindings are shared across scalar witnesses. Limits are
65,536 selected scalars, 4,096 returned segments, 1 MiB per range packet/resolution,
8 MiB of accumulated formatting witnesses per side and four million visited
scalars per traversal. Output bytes are counted before repeated marks can be
cloned into segments. Scalar offsets remain exact UTF-16 boundaries, including
emoji; neither Unicode normalization nor surrogate-pair slicing is inferred.

The [native range checkpoint](qualification/2026-10-17-rich-review-affine-range-native.json)
records pure capture/resolution and exact reopen under all six read-only
selection/history policies, original V1 conflict preservation, source-loss and
rehashed-coordinate refusals, protected domains, split/join, empty floors,
insertion affinity and pre-allocation byte budgets. This is native groundwork;
affine suggestion packets, guarded effects, transport and client controls remain
functional work.

### Explicit native formatting revisions

`rebase_document_suggestion_format_guarded` uses the original-character range
proof to capture an explicit immutable revision of an ordered batch composed
entirely of `SetFormat` commands.
It does not change the old proposal or accepted content. The original V1 packet
still conflicts after a change in its affected whole text block; the child is a
new ordinary V1 proposal at the current accepted source, inside the existing
revision envelope. Current host authentication, pending-only supersession,
server-ordered Accept/Reject and accepting-user Undo remain separate checks.

The action checks the current observation first, proves the original batch's
nonempty effect at its retained source, and resolves all original selected
characters. New text between those characters is excluded from the replacement
formatting commands. A changed current value for the edited format kind on any
selected original character returns FormatChanged. Other format kinds and text
outside the original set are preserved. Original-character deletion, reordering,
changed protected domains/kinds and lost endpoints return the range conflict;
missing source operations return Pending. No partial child is returned.

Captured bytes belong in the existing revision outbox, not independent child
publication. Native preview, effect verification, finalization and owned history
use the unchanged V1 child path. Capture remains pure under all six read-only
selection/history policies, including exact recovery and retained Redo. The
reference-host test combines peer insertions and unrelated Italic with actual
supersession, owned Accept, exact recovered Undo/Redo and the original decision
receipt after authenticated lease renewal following restart.

Command order is retained, including overlapping ranges and different format
kinds. A child fragmented into several commands can be rebased again. A mixed
batch containing any other action returns Unsupported without dropping steps.
The entire batch is bounded to 64 lowered commands, 65,536 selected scalar
occurrences (including overlapping steps) and 1 MiB of repeated format literals
before cloning. Normal range and child/envelope limits also apply. Any late
conflict or exhausted budget refuses the whole batch. The current child keeps
ordinary whole-block guards, so later edits can require another revision.
Text replacement and its intervening-insertion policy are unchanged.

The [native formatting revision checkpoint](qualification/2026-10-17-rich-review-format-rebase-native.json)
records the initial native single-command source, conflict, recovery and server
workflows. The optional client contract below adds batch and repeated-child use.

### Optional formatting revision clients

`suggestion_format_rebase_version` V1 and `rebase_document_suggestion_format`
form a separate pure Wasm capability. The request contains only an exact previous
packet, title and creation time; it cannot supply a new creator, selected
characters, weaker format witnesses or an accepted tree. The current observation
is checked before parsing. Existing complete suggestion/revision runtimes remain
usable without this pair, and no JavaScript range or command fallback is selected.

`core.supportsSuggestionFormatRebase()` detects the complete pair.
`core.rebaseSuggestionFormat(previousPacket, title, time, revision?)` returns the
native Pending, Unsupported, Conflict or Captured result. The recommended durable
path is `revisions.rebaseFormat({previousSuggestionId, title, createdAtMs,
revision?})` on the existing `SharedSuggestionRevisions` outbox. It checks the
retained same-creator pending predecessor and queues only Captured bytes. Queued
means local revision intent, not supersession or Accept. Other native outcomes
leave the revision record unchanged.

The existing source-before-outbox save order, exact retry bytes, original
authenticated receipt and child-handoff rules apply without a new storage
family, socket, grant or server capability. A failed save or lost reply never
re-runs the native rebase. The child cannot independently publish or queue a
decision before supersession and local handoff complete.

Supplying this outbox to `createSharedSuggestionPanelSource` adds “Rebase
formatting suggestion” to the shared vanilla/React panel when the native pair is
available. It uses the selected retained proposal's original intent, independent
of the accepted editor caret or composer action. An empty title field retains
the proposal's title. Pending/conflict/unsupported results are shown without a
new child; a captured child remains preview-only until the server commits its
relation. Preview and Queue Accept remain explicit separate actions.

The [formatting client checkpoint](qualification/2026-10-17-rich-review-format-rebase-sdk.json)
records focused native, optional capability, durable recovery and installed mixed
workflow qualification. Direct affine text replacement and final V1 release
qualification remain separate work.

### Staged native suggestion effects

`prepare_document_suggestion_effect` turns a still-current native preview into
one unpublished ordinary native action under the caller's exclusive writer.
It runs the existing semantic commands or general-range action, proves the
result equals the preview and retains exact native history. No accepted source
content, source counters, Redo state or active typing group changes while the
candidate is prepared or discarded. A current read-only policy refuses staging.

The candidate retains the source's explicitly selected recovery family:
original, general or document semantics, each with ordinary or natural history.
It never enables a family implicitly. Document-scoped drafts explicitly select
the document on the candidate and retain the ordinary native scope recipes;
they also work when that scope was already selected. General-range drafts
require general or document history. Every successful candidate has one new
Undo group and no remaining Redo items.

The prepared result exposes an admitted tree, exact candidate checkpoint,
catchup frame and one version-two writer group with native lineage. Its effect
identity binds the proposal ID, writer receipt and first semantic counter.
Permanent preparation precedes that counter and remains outside selective
Undo. A whole transport window must not be mistaken for its semantic history
span. Existing checkpoint, operation and frame budgets apply before preparation
succeeds, so an oversized candidate cannot be acknowledged as ready to persist.

`commit_document_suggestion_effect` consumes the candidate under its original
live-owner guard; it does not regenerate commands or counters. Another owner or
any intervening publication refuses commit. The host must hold its serialization
lock across preparation, durable decision append and commit. Neither the native
effect identity nor successful preparation grants account permissions or claims
disk durability. Server-finalized acceptance still needs the authenticated
decision record and native effect in one durable transaction.

An independent host writer can author this group while a user's ordinary writer
continues offline edits. Existing version-two transport admits the group and
reconciles duplicate deliveries without another insertion. Ordinary native
Undo/Redo belongs to the effect's actual writer; importing it does not transfer
history to the accepting user. The public native primitive is therefore not an
end-to-end Accept API, and no suggestion acceptance Wasm/SDK/control endpoint is
exposed by this checkpoint.

Private disposable-document tests also compare checked native selective inverses
with ordinary author Undo/Redo for text, formatting, lists, table structure and
captions. They preserve same-block peer insertions and later formatting priority.
These inverse-mechanism tests complement the opt-in native owner below. The
browser path must pair receipt admission, ordinary typing, invisible-item
handling, cursor repair and exact local recovery before exposing owned history.

A foreign effect writer does not automatically join the accepting client's
ordinary Undo stack. Explicit owned adoption and its exact recovery and offline
compensation contract remain necessary before exposing a complete browser/SDK
acceptance workflow. Ordinary offline document editing remains available while
review decisions are queued. The client sections below add local persistence,
Wasm proofs and automatic author transport. Browser accepting-user history,
proposal controls and combined installed suggestion acceptance remain open; native effect
staging alone does not complete tracked changes.

The proposal contracts and compatibility shim cover 14 workflows plus three
private packet tests. Ordinary native edits serve as preview oracles, with
exact future recovery across all four selection/history combinations. Protected
rich ranges retain partial tables/captions in both directions. A live typing
control verifies that proposal reads neither close a natural group nor change
the next input's checkpoint or operation bytes. The full shared-native suite
passed 441 tests at that proposal checkpoint; its existing relay passed 46,
without new decision endpoints. The staged-effect tests add recovery across all
six scope/history policies, rich single-group edits, stale/read-only refusal,
both preselected and unselected document scope, repeated preparation, dropped
typing candidates, protected ranges in both directions, and an independent host
writer with concurrent offline edits. Current checkpoint results are recorded in
the release trail.

### Native proof of accepted effect semantics

`verify_document_suggestion_effect_guarded` is a pure Rust prerequisite for
accepting-user history. It returns Pending until the required source/effect
operations are applied, or an opaque `VerifiedDocumentSuggestionEffect`. A valid
V2 receipt alone is insufficient: it identifies operations but does not establish
which proposal they implement or where permanent preparation ends.

The verifier reconstructs the actual causal basis immediately before the effect,
checks the proposal's original read dependencies there, and runs the original
native lowering on a disposable fork with the original effect writer. It must
reproduce both canonical V2 digests, the exact authored end and the re-derived
semantic start. The original source must causally precede that basis; an Undo
that restores the same visible tree cannot attach a later proposal to an older
effect. Text, formats, list/table/image structure, protected ranges and
explicit document scope use the same native lowering as ordinary preparation.
Later host operations and unrelated or conflicting local offline content do not
replace that historical basis. The live owner, selection, roots, counters and
Undo/Redo remain unchanged, including in read-only mode.

`check_document_suggestion_effect_proof` checks the opaque proof's exact owner
and live publication. Its frozen metadata stays readable after the live guard
becomes stale. Neither method authenticates a decision, proves disk durability,
identifies the accepting device or adopts history. Those remain separate checks
against the authenticated original server decision and the pinned local writer.
The methods are native-only at this checkpoint; no new application-Wasm executor
or browser-side Undo authority is exposed.

Historical reads now import only operations in their closed retained version
vector into a fresh private arena. Snapshot-at-cut reconstruction could retain
empty mergeable containers allocated later and falsely refuse an originally
fresh creation ID when re-proving a proposal after acceptance. The reproduced
failure is repaired without changing the creation/freshness laws: current edits
still cannot reuse retained IDs. Original source atoms and IDs are preserved,
and the live document is never checked out. Cuts between paired formatting-mark
atoms reject before reconstruction, even with a valid atom-range digest.

The [native effect-proof checkpoint](qualification/2026-10-17-rich-review-effect-proof-native.json)
records the source-reconstruction repair, semantic proof workflows and mixed
selective-inverse comparisons. The recovered owner below adds a separate local
history contract on top of those proof prerequisites.

### Native ordered accepting user history

`enable_reviewed_history_guarded` explicitly selects one ordered local history
for ordinary edits and authenticated owned Accepts. Activation retains existing
Undo/Redo, UI and writer counters, and closes the current natural typing group.
The pinned `ReviewedHistoryIdentity` binds a suggestion lane, local account and
separate host effect writer. It cannot change later or grant a live permission.
All six original/general/document and explicit/natural policies remain available,
including later one-way policy upgrades.

`adopt_suggestion_history_guarded` requires an exact live native semantic proof
and `OwnedSuggestionAcceptance` from an already authenticated original server
decision. The integration separately authenticates finality and the deciding
account; native strings and saved attribution are not credentials. Rust checks
the exact local accepting device, lane, account, effect writer, proposal, receipt
and unique positive server order. Another device on the same account cannot
inherit ownership. A second proposal cannot claim an overlapping effect range.

Adoption authors no document operation and never reapplies the proposal. Its
history item is appended when the final acceptance arrives, after any local
typing completed while waiting. Repeated original receipts are no-ops even after
Undo, Redo or a new branch discards Redo. Receipt identity remains independent
of the stack item. Undo/Redo authors ordinary compensating document operations;
it never reopens the finalized server decision. Past authenticated ownership can
be retained in read-only mode, but Undo/Redo still require the current writable
policy. Their guarded
variants additionally reject stale or foreign publications.

The new ordered stack applies checked native selective inverses under the actual
local writer, excluding permanent preparation. It preserves later peer text and
does not let an invisible ordinary item skip an intervening owned Accept.
Foreign edits without explicit owned adoption remain outside local history.
UI recipes use this device's caret at adoption rather than the host's caret.
Original and opposite cursor recipes map intervening changes in their captured
semantic basis: including recreated text in that mapping would collapse a
restored selection. No AST replacement, replicated marker root or writer-counter
reservation is introduced.

Ordered native rows keep later owned edits separate from external deltas. A
fresh checkout diff after undoing a newer replacement would mistake recreated
accepted characters for peer insertions and fail to remove them. Arrival uses
an explicit row barrier because older items already observed the host effect
as external. Its first inverse maps that earlier row correctly; subsequent
Undo/Redo uses ordinary authored native spans.

`reviewed_checkpoint` emits only `breditor/shared-reviewed-history-session` V1;
`SharedRichProfile::restore_reviewed` is its matching leased-writer factory.
The closed wrapper records the selected replay family, exact typing partition,
activation and adoption. Recovery re-proves original effects and reconstructs
ordered history, once-only receipts, cursor recipes and future operations.
Existing checkpoint encoders refuse an enabled reviewed owner, and old factories
reject both the wrapper and its reviewed inner records before native replay.
An incoming `PreparedWriterGroup::reviewed_checkpoint` retains that same family
before transport commit. Owned inverses travel as ordinary atomic V2 groups
under the accepting device's writer, without giving receiving peers ownership.
The 1,000-entry and 16 MiB whole-save limits remain; there is no compaction.
Recovery restores no live permission, author lease or authenticated connection;
the host must reapply its current runtime policy before exposing the owner.

The [native reviewed-history checkpoint](qualification/2026-10-17-rich-review-owned-history-native.json)
covers exact recovery across all six policies, local/accepted/local ordering,
peer text, invisible items, overlapping receipts, once-only adoption, policy
upgrades, read-only refusal and recreated directional selections. The following
explicit Wasm/SDK pairing saves adopted source history before persisting its
dependent final receipt. Proposal revision/rebasing remains functional work;
borrowed vanilla/React controls are described below.

### Wasm and SDK owned history

The `reviewed_history_version` capability pairs native activation, semantic
effect proofs, adoption and exact recovery. `SharedSuggestionEffectProof` has no
public native constructor. Its frozen summary is not proof of authenticated
server finality; native owner/publication guards still apply. Pending proofs are
released immediately, verified proofs are owner-bound, and disposing the editor
releases all retained proof handles. No browser command executor or arbitrary
inverse API is exported.

`SharedRichEditor` requires an explicit `reviewedHistory` identity. It refuses
partial native capabilities, an identity different from recovered history, or an
already enabled owner passed through the ordinary constructor options. The typed
`restoreSharedReviewedEditor` factory selects only native `restore_reviewed`;
it cannot fall back to an old reader or import a document snapshot. Existing
constructor defaults and old checkpoint families remain unchanged.

Durable paired ownership uses `SharedReviewPersistentSession.openReviewed` with
`reviewedHistory` and a separate `restoreReviewed` callback. Its closed
`breditor/shared-reviewed-review-checkpoint-record` V1 retains the reviewed native
document journal, independent comment journal and local immutable versions in one
transaction. Optional nonsecret comment-relay identity and exact accepted-prefix
progress are paired in that same record. Account, actor, writer, selected replay
family and grouping must match before recovery. Current permissions and secrets
are never restored from this record. Old paired factories reject the new family;
there is no automatic migration or document-only durable reviewed factory.

`SharedSuggestionQueue.open` additionally selects `ownedHistory: "reviewed-v1"`.
Its new `breditor/shared-owned-suggestion-queue` V1 family keeps the previous queue
fields and limits. Queue and source must pin the same account, lane and host
effect writer. The authenticated document transport requires atomic V2 and a
source persistence hook; it uses the existing author connection and lease.

On a final Accept, the queue first proves the retained effect's full original
semantics. Only the original deciding account and exact accepting local writer
can adopt it. Another device's acceptance remains foreign. The queue saves and
flushes the adopted native source before committing the dependent final receipt.
A failed source save cannot acknowledge the receipt. A failed queue save may
leave a newer durable source; reopening and replaying the original decision
retains that same history item once. An existing final queue receipt with no
matching native adoption is a recovery error, not permission to reconstruct lost
history from the cache. Duplicate receipts do not restore a discarded Redo branch.

The original queue and SDK defaults still leave imported effects foreign. Owned
Undo/Redo is available only through this explicitly paired contract. Receipt
retention never changes server finality, reapplies a proposal or replaces either
native owner. The existing history, source, packet and queue budgets remain.

Reproduce the owned-history workflow with the matching generated application
runtime and isolated authenticated suggestion host:

```sh
node scripts/probe-owned-suggestion-sync-sdk.mjs target/promoted-shared-web \
  target/owned-history-relay-native/release/examples/suggestions_functional
```

The [owned SDK checkpoint](qualification/2026-10-17-rich-review-owned-history-sdk.json)
covers all six policies with actual application Wasm and the authenticated Rust
host. It includes failed source and receipt writes, exact recovery, duplicate
finality after discarded Redo, another-device refusal and older-source rollback
refusal. The mixed workflow also syncs independent comments and their durable
progress, publishes and downloads named versions, and performs guarded version
restore with document and comment Undo/Redo.

The installed acceptance packs four local archives, installs them offline in a
separate consumer, checks the strict public types and repeats that same six-policy
workflow through `@breditor/editor/collaboration` and packaged Wasm. Production
dependencies resolve inside the installed consumer, not workspace links. Native
host and storage/transport fault injection remain test fixtures; this is not
physical-browser, UI or production release qualification.

```sh
node scripts/check-owned-review-installed.mjs \
  target/owned-history-relay-native/release/examples/suggestions_functional
```

### Native ordered proposal and decision ledger

The reference relay's `enable_document_suggestions` explicitly enables
`breditor/relay-document-suggestions` V1 in a writer-transport V2 room. Existing
rooms remain disabled, and V1-transport rooms are refused rather than migrated.
A separate durable random binding identifies this lane. The server reserves
effect writer `18446744073709551614`; it is neither genesis writer `1` nor any
ordinary client allocation, and it never receives a client lease.

Suggestion permissions are independent of document and comment roles. Propose
allows attributed publication, including from a document Reader. Review also
allows Reject; Accept additionally requires current document Editor permission.
The initial owner administers these grants. An Editor or comment Moderator does
not automatically become a suggestion reviewer. Every operation checks current
host-authenticated account rights. Stored roles and content-addressed IDs confer
no authority.

Publication verifies native attribution, historical intent and complete accepted
semantic source cuts before append and sync. Missing document operations stay
client-owned Pending work. Repacked retries return the first immutable packet
and publication sequence, without appending or changing accepted content. A
published proposal remains pending until one durable finalization wins.

Accept stages the exact native intent under the exclusive host writer and
independently admits its version-two group into an unpublished room receiver.
Reject stages no document edit. One ordered log record retains the deciding
account, request, native effect bounds/lineage and effect frame. Only after that
record is synced are the accepted room, host author and final decision published.
A retry, including an opposing reviewer choice, returns the ORIGINAL final
decision and sequence. No second effect is authored. Changed targets return an
explicit Conflict and leave the proposal pending; there is no snapshot fallback.

An owned Accept additionally authenticates the exact active document-writer
lease. Its separate durable record retains `acceptingWriter`, not the lease token
or resume credential. A second device on the same account cannot take ownership
through a retry: it receives the original stream identity. Neither client stream
has counters reserved or advanced by server acceptance. Explicitly unowned
administrative decisions remain unowned, and Reject has no document history
owner. Recovery rechecks original registered account/stream ownership, including
permanent observer restrictions, rather than inferring ownership from a matching
display author. Recording this identity does not yet adopt the effect into the
accepting client's ordinary Undo stack.

Recovery rechecks the original grants, source intent, native effect, exact
semantic start and canonical operation receipt in original room order. A crash
after sync but before publication recovers both decision and effect. An
incomplete final record recovers the pending proposal and prior author clock;
retry can then finalize the same native effect once. A complete invalid record
fails recovery before any incomplete tail is truncated. Uncertain write errors
fence all room reads and writes until recovery.

Accepted host-effect boundaries become valid historical source cuts for later
proposals and named versions. The immutable genesis boundary is unchanged.
Comments continue resolving through the same native document history. The
combined native workflow covers anchored comments, acceptance, independent
comment Undo, named-version restore, explicit orphaning/reattachment and host
restart without deleting discussions.

Authenticated readers can fetch immutable packets, read current pending/final
state and page immutable publication/decision events through a frozen cut. A
decision after that cut does not leak into an earlier publication entry. Pages
contain at most 64 events; packets are bounded to 1 MiB, with at most 1,024
proposals and 32 MiB of raw retained packets. Native checkpoint/frame budgets and
the existing 20 MiB-record, 256 MiB-log and 4,096-record ceilings can refuse work
earlier. There is no automatic compaction. The opt-in lane allows at most 1,022
registered document authors, retaining native source-clock capacity for genesis
and the host effect author; permanent non-authoring observers do not consume
that author allowance. Existing disabled-room writer limits are unchanged.

This native component by itself is not an installed editor or shipping Accept
button. The subsequent opt-in reference socket layer is described below. Hosts still own account
authentication, permanent fresh-ID allocation and referenced asset
admission/retention. The host effect's native history is NOT accepting-user Undo.
Browser adoption, proposal revision/rebasing and paired vanilla/React suggestion
controls remain functional work. Subsequent client sections add Wasm proofs,
durable offline queues and automatic author transport.

### Opt-in reference suggestion socket

`documentSuggestionsV1` is a separate authenticated socket capability, requiring
an already enabled V2 reference room. It adds `documentSuggestionsDescriptor`
and current `documentSuggestionsPermissions` only to explicitly negotiating
clients. Old handshakes, request/reply shapes and unsolicited events stay
unchanged. The eight-capability ceiling now admits the full compatible optional
stack; mutually exclusive presence modes and original review dependencies remain
strict. There is no remote request that silently enables suggestions on a room.

Every transport action has its own documented Rust file. `suggestionPublish`
binds a packet to the negotiated lane and current authenticated creator.
`suggestionSync` returns frozen immutable pages; `suggestionRead` returns current
pending/final state and live permissions; `suggestionPacket` returns the first
exact immutable packet. IDs and saved lane bindings are not read grants.
`suggestionGrant` is owner-only administration of independent rights. All reads
and mutations repeat current native authority checks inside the serialized room
transaction, rather than trusting the handshake's permission display.

`suggestionDecide` contains only an explicit decision request with `binding`,
`suggestionId` and `decision`. Accept always uses the socket's exact current
document-author lease; there is no payload writer, principal, lease, effect or
frame authority. A permanently non-authoring observer cannot Accept even after
its account becomes an Editor. Reader reviewers can Reject without a document
author lease. A suggestion-only reader can register/resume a non-authoring
document observer without negotiating the separate comment lane; original
review clients retain their original observer request/response meanings.

Successful new publication/decision/grant emits a coalesced
`documentSuggestionsChanged` hint only to negotiating clients. Its permission
display is freshly read, not a credential. Accept also triggers ordinary
document catchup after the shared decision/effect record is durable. The durable
decision and document frame can reach different clients in different orders;
clients must import the native effect before exposing an accepting-user history
item. No client should re-execute the proposal commands on an acknowledgment.
Known retries return the original winner, original device ownership and native
receipt, including an opposite queued choice after reconnect.

The existing bounded socket envelopes, connection/backpressure limits, native
packet/page bounds and durable room fencing remain in force. The socket-only
checkpoint uses native capture fixtures and actual application-Wasm receivers;
the subsequent native/Wasm pairing and client queue follow below. Ordinary client Undo/Redo remains selective
for that client's own edits and does not adopt the imported host effect. Host
asset admission/retention and public-host isolation remain host responsibilities.
See the [socket functional record](qualification/2026-10-17-rich-review-suggestion-relay.json)
for the exact tested scope and remaining work.

### Native proposal Wasm and SDK

The complete additive `document_suggestions_version` V1 capability pairs pure
capture, native packet/source reads, opaque preparation, exact preview checks
and retained V2 receipt reads. Earlier owners report it unavailable; the SDK
does not derive a JavaScript document diff or silently execute a proposal as an
ordinary edit. Read-only document owners may capture and preview. The original
ordinary-dispatch DTO is unchanged: proposal-specific types separately cover
general text, paragraph/flow operations and explicit whole-document replacement,
clipboard, formatting and layout commands. Inner strict JSON intents remain
strings so native admission can still reject duplicate fields.

`SharedSuggestionPreparation` has no public native constructor. The SDK returns
Pending/Conflict as detached values and immediately releases their native
handles. Ready returns a `SharedDocumentSuggestionPreview` with frozen admitted
content, semantic changes and asset references. The source owner disposes any
remaining handles on disposal; frozen reads remain readable. Native checking
binds the exact live publication, owner and proposal ID, not the preview's public
JavaScript summary method. A preview for one proposal cannot queue another
proposal's Accept, even if its displayed summary is replaced.

`retained_writer_receipt_v2` proves a descriptive receipt's exact original
operation range and prefix using native V2 lineage. It works after later edits
by that author, returns Pending when required operations are not yet applied,
and refuses different retained operations. It imports nothing and changes no
publication, native roots or history. This is not account authentication, server
durability, a semantic-group boundary proof or accepting-user Undo ownership.

### Durable client suggestion queue

`SharedSuggestionQueue` borrows the existing durable document or paired review
session. Its separate closed `breditor/shared-suggestion-queue` V1 record retains
exact immutable packets, publication intents, desired decisions and original
authenticated outcomes. Native journals are saved first; only then is the
dependent queue transaction committed. This is ordered dependent storage, not a
single transaction spanning the source and queue databases. A crash can leave a
newer source journal and an older queue; it cannot make a queue acknowledgment
depend on a native effect that was never saved.

Reopening validates the exact native writer/policy, proves every local packet's
historical source, and verifies every retained Accept effect against native
operations. A valid but older source owner cannot reset or open the newer queue.
The queue pins its borrowed owner and refuses replacement both before mutation
and after asynchronous source persistence. Its lock excludes a second mutation
owner even when it uses a different database name. Credentials and live grants
are absent; cached attribution never restores current permission or proves fresh
server authority.

`propose` and `queuePacket` retain one original source/title/time and never
recapture on retry. `queueDecision` records a choice without changing accepted
content or either history. A new Accept intent requires a current native preview
for that exact packet. Duplicate choices retain their original queue time;
changing an active choice requires explicitly stopping retries first. Stopping
retries does not withdraw a request the server already received. An opposite
server winner remains distinct from the locally requested choice.

The host integration supplies authenticated publication and decision metadata to
`receiveVerifiedPublication`, `cacheVerifiedProposal` and
`receiveVerifiedDecision`. The latter returns `waitingForDocument` without
persisting a final Accept when its native effect is missing. After actual catchup,
source journals are saved before the final metadata. A failed queue save may
leave the server outcome visible in memory, but `localSaved` stays false. Exact
retry/reopen retains the old durable intent and reconciles the server's original
winner rather than executing its commands again.

Failed close retires queue mutations while preserving readable recovery and its
lease for retry or explicit discard. Closing the queue never closes or disposes
the borrowed native owner. Local retry means local persistence only, not network
acceptance. The cache retains at most 256 packets, each at most 1 MiB, under a
32 MiB serialized-record budget. This is a local packet/intent cache, not a
reduction of the host's 1,024-proposal catalog. Explicit eviction does not delete
a proposal or revoke a finalized server decision.

The [client functional record](qualification/2026-10-17-rich-review-suggestion-client.json)
combines actual application Wasm, this exported queue, paired native journals and
the authenticated durable host. Wire driving and IndexedDB/Web Locks remain
fixtures. The automatic adapter below shares the existing document author's
socket for owned Accept. Its original default leaves effects foreign; the
explicit owned-history pairing above adds accepting-user Undo and installed mixed
SDK acceptance. Borrowed vanilla/React suggestion controls are described below.
Host-owned assets and explicit conversion-loss policies are unchanged.

### Automatic suggestion synchronization for document authors

`SharedRelaySync` explicitly opts in with `suggestions: {binding, effectWriter}`.
The exact lane must be pinned from authenticated host metadata, the document
transport must be `atomic-v2`, and a `persistLocal` hook must save the current
source journal. The same connection authenticates, resumes the document writer
once, submits ordinary edits and requests owned suggestion decisions. No second
author socket or payload principal/writer authority is introduced. Original
document, comment and version channels still refuse suggestion hints.

`SharedSuggestionSync(queue, documentSync)` verifies the exact borrowed native
owner and nonsecret queue/transport identity. It saves pending source and queue
records before sending, flushes authored source operations before publication or
Accept, and imports and proves a final effect before persisting its decision.
Missing peer sources remain pending. A subsequent server catchup wakes retry
even when the owner already retained those peer operations offline, so unchanged
local content cannot leave a proposal stranded. Current permissions are read
again; saved attribution and previous permission displays confer no authority.

Offline choices survive reconnect, failed local writes and lost replies. The
server's original winner remains separate from the requested choice, including
an offline Reject after another device accepted. Conflicting Accept leaves the
proposal pending with explicit native targets; changing to Reject requires
stopping the old retry first. `flushShared` captures current publication/decision
targets and waits for their authenticated outcomes and local receipts. It does
not mean the requested choice won. A local save failure requires explicit local
retry and reconnect; it never becomes a network acknowledgment.

Discovery reconstructs a frozen live feed of at most 1,024 proposals and 2,048
events, with 64 events per page. It rejects changed cuts, duplicate/contradictory
events and rollback of already observed or cached receipts. `entries()` returns
detached live metadata. `loadSuggestion(id)` lazily fetches a packet under current
read permission and caches it natively; cached packets remain readable offline.
At most four distinct downloads are queued, matching downloads and refreshes
coalesce, and idle adapters do not poll. This live feed is not a new persisted
global catalog: the existing 256-row selected cache retains its original limits.

The adapter borrows both queue and document connection. Dispose it before closing
the queue/source; disconnecting it alone leaves ordinary document sync running.
Ordinary author reconnection controls lease recovery. A fenced author is not
silently resumed by a new metadata connection. The separate permanent-observer
adapter below supports Reader-only proposal/Reject workflows without an author
lease.

The [automatic client checkpoint](qualification/2026-10-17-rich-review-suggestion-sync-sdk.json)
combines actual application Wasm, exported document/queue/sync adapters and the
authenticated Rust host across both selection and history policies. It covers
exact offline reopen, lazy remote packets, source-dependent retry, conflict to
Reject, opposing outcomes, failed local/receipt saves, lost decision replies,
live grants, host restart and no idle polling. IndexedDB/Web Locks and transport
loss are fixtures. This original default leaves imported effects foreign to
ordinary Undo; accepting-user history uses the separate opt-in pairing above.
The separate owned-history checkpoint covers installed mixed SDK acceptance;
borrowed suggestion controls are described below.

### Automatic suggestions for permanent observers

`registerSharedSuggestionObserver` selects atomic V2 and the suggestion lane,
authenticates the current account, then calls only native `registerObserver`.
The existing Rust registry reserves a permanently non-authoring document writer.
The host must save the returned `SharedSuggestionObserverIdentity` before joining
its native source. Its observer credential is separate protected host state;
`sharedSuggestionObserverQueueIdentity` returns only the detached nonsecret queue
key. Neither saved identity nor registration-time permissions grant current access.

`SharedSuggestionObserverRelay` borrows the durable source rather than creating,
replacing or disposing it. Construction checks its exact room/writer/source
family, requires a zero native authored prefix and enforces native read-only
mode. Existing original/general/document and explicit/natural policies remain
available. A source with authored operations is refused; it is never truncated,
rewritten or uploaded under an observer identity. Source replacement across an
asynchronous save and later writable/authored transitions also refuse.

Connection authenticates and verifies the pinned descriptor/lane, checks the
native zero prefix against the host, resumes only `resumeObserver`, then imports
and saves catchup through the same native owner. It never calls author register,
author resume, document submit or owned Accept. The account may have independent
proposal/Reject permission while its accepted document remains read-only. Even a
later Editor grant cannot promote this permanent identity: the transport and
sync UI permissions keep `canAccept` false, and the request path refuses Accept
before transmission. A separate author identity is required for owned acceptance.

`SharedSuggestionSync` now borrows the common `SharedSuggestionTransport`
contract. Existing author adapters still reuse their original socket and owned
Accept path. An observer uses that same bounded discovery, lazy native packet
cache, offline queue, final-outcome reconciliation and source-before-receipt
rules. A queued Accept is not silently changed to Reject or sent after an account
upgrade. Current server permissions gate each proposal/Reject; denied offline
intent remains available for retry. Authenticated foreign Accepts import their
native effect and final metadata without adding local Undo ownership.

Catchup hints wake missing peer-source publication even when the local native
projection already contains that peer's offline operations. Unchanged live feeds
do not poll. Ordinary network loss and host restart reconnect with the same
observer credential. Document-role changes deliberately fence existing native
leases; reconnect after a grant is explicit, not an automatic lease takeover.
Failed local saves retain readable source and queue state for explicit local
retry, followed by reconnect. No new persisted source/queue format, native log
tag, protocol negotiation or live permission record is introduced.

Dispose the suggestion sync and observer transport before closing the borrowed
queue/source. Disconnecting the suggestion sync alone leaves source catchup
running, as it does for an author connection. Observer disposal leaves the native
source read-only, does not close its storage or release its local lease, and does
not erase offline proposals. The host still owns credentials, assets and lifetime.

The [observer checkpoint](qualification/2026-10-17-rich-review-suggestion-observer-sdk.json)
covers all six scope/grouping policies with actual Wasm and an authenticated
native host. Reader wire assertions prohibit author registration/resume/submit
and all Accept requests. Exact offline recovery, foreign accepted effects,
pending peer sources, independent grant changes, explicit role-change reconnect,
lost Reject replies, failed source saves, host restart and idle behavior pass.
Clean-installed acceptance repeats both the six-policy mixed owned-history
workflow and this six-policy observer workflow through installed public editor
exports and packaged Wasm, with strict consumer type checks. Browser storage,
locks and transport failures remain fixtures. Suggestion controls are described
below; granular rebasing remains functional work.

```sh
node scripts/probe-suggestion-observer-sdk.mjs target/promoted-shared-web \
  target/owned-history-relay-native/release/examples/suggestions_functional
node scripts/check-suggestion-observer-installed.mjs \
  target/owned-history-relay-native/release/examples/suggestions_functional
```

### Borrowed suggestion controls

`createSharedSuggestionPanelSource(queue, sync?)` binds the exact native core,
durable queue and optional existing synchronization adapter. `checkQueue` rejects
a different queue instance; neither matching labels nor a copied source object
transfer its lifetime or authority. The source helper opens or closes no owner,
lease, database or socket. A local-only panel can operate without networking;
remote discovery and packet loading require the explicitly borrowed adapter.

`mountSharedSuggestionPanel` creates standalone vanilla controls. The optional
`SharedReviewPanelOptions.suggestions` places those same controls beside threaded
comments and named versions without replacing their mounts or drafts.
`BreditorSharedSuggestionPanel` exposes the standalone controls through the React
collaboration entry point; `BreditorSharedReviewPanel` accepts the combined
configuration. Ordinary parent renders preserve the mounted panel, title/action
drafts and native preview. A new core or `sessionKey` explicitly replaces controls,
not their borrowed source or pending requests.

Nine standard action builders produce original typed native intents: same-flow
and protected-range text replacement, formatting, headings, list wrapping,
appended table rows/columns, image descriptions and captions. Each builder has a
separately named source file. Rendering projections only locate selected native identities; they never
construct an accepted transaction, infer DOM offsets or upload an AST snapshot.
The original text builder still emits the same-flow range command. The separate
`replace-protected-text` action uses the optional native planner described below;
an older runtime disables that action instead of guessing floor identities or
flattening tables/captions. Native capture refuses unsupported placement, schema,
scalar boundaries, no-op drafts and original command/packet budgets atomically.

Hosts can supply up to 64 uniquely named typed composer actions, each with up to
16 fields. The panel snapshots their configuration for its lifetime. A builder
receives a read-only native view projection, entered values and the host's fresh
ID allocator, not an accepted-document dispatcher. Missing structural allocation
refuses rather than recycling or inventing IDs. Names consumed by refused or
discarded drafts remain consumed. Custom format properties, structural edits and
document-scope intents use the existing native draft contract; this UI is not a
new JSON protocol or arbitrary inverse executor.

Creating a suggestion performs pure native capture and saves the original packet;
accepted content and document history remain unchanged. Preview uses the opaque
native preparation and displays proposed document/semantic changes separately.
The default preview is literal JSON, including asset references; it neither
interprets user HTML nor fetches asset bytes. Accept requires that same current
owner-bound preview and selected suggestion. A changed editor publication, choice
or final decision disposes the proof. An asynchronous remote load must still match
its captured source and choice before creating a preview. Pending history and
native conflict results stay explicit; they do not become a plaintext fallback.

Accept/Reject buttons queue choices and save locally. Only authenticated server
finalization changes accepted content. The panel displays requested choice,
publication status, original final winner and local receipt durability separately,
including an opposite winner or a final outcome whose native effect is still
missing locally. A locally saved older packet cannot count as a saved final
receipt. Active decision retries must be stopped before switching choices.
Stopping retries cannot cancel a request already received by the server.

Publication retry requeues the original immutable packet; it does not recapture
its source, title, time or fresh IDs. A failed save keeps the packet and draft,
disables duplicate creation and offers local persistence retry separately from
network synchronization. A native-invalid/no-op draft remains editable without
requiring an unrelated storage retry. Title and per-action field drafts survive
metadata updates and action switching; selection fields honor both input and
change events.

Live permissions drive display affordances. Offline panels may use an explicit
host callback or their in-memory last observed rights, neither of which grants
server authority. Read-only owners can still propose/preview and queue Reject;
Accept stays unavailable. Every native capture, preview and decision retains its
original source/owner checks, and the server independently checks current grants.
Unmount disposes only UI subscriptions and native preview handles. Already
queued choices, transmitted requests and pending saves remain host-owned; no
source, lease, network adapter or asset store is silently closed or erased.

The [suggestion-controls checkpoint](qualification/2026-10-17-rich-review-suggestion-controls-sdk.json)
records 340 SDK/editor tests, strict public vanilla/React consumer types and 47
runtime/build guards. Actual application Wasm exercises all eight stock actions
under all six scope/grouping policies: capture and preview are pure, offline
choices do not mutate accepted content, and server-finalized Accepts retain owned
history. The same workflows run through clean-installed local archives alongside
comments and named versions. A separate six-policy permanent Reader UI matrix
creates, previews and Rejects without author registration, document submission
or a nonzero authored prefix. Synthetic DOM/storage/locks and an authenticated
native loopback host establish functional integration, not physical browser or
V1 release qualification. That checkpoint precedes the protected-range planner
below. The later revision-client section adds immutable revisions; granular
character-affine rebasing remains functional work.

```sh
node scripts/probe-suggestion-controls-sdk.mjs target/promoted-shared-web \
  target/owned-history-relay-native/release/examples/suggestions_functional
node scripts/check-suggestion-controls-installed.mjs \
  target/owned-history-relay-native/release/examples/suggestions_functional
```

### Native planning for protected text proposals

`plan_suggestion_general_text_guarded` reads an explicit rich text target and a
host-reserved namespace. The existing native range planner determines coverage,
preserves partially selected tables/images and allocates exactly the empty
paragraph identities required by that result. Full disposable causal evaluation
also refuses identities retained only in hidden history, not just visible AST
collisions. The result is the existing Commands-scope `GeneralText` draft;
`breditor/document-suggestion` V1 and all saved journal meanings are unchanged.

Planning is pure under original, general and document policies, with explicit or
natural history, including read-only owners. It does not select the target on the
live editor, enable a journal family, capture a proposal packet, consume writer
counters or clear Redo. Namespace reservation is the host's permanent obligation,
including when no floor is required or a request is refused/discarded. Existing
limits and scalar/schema admission remain authoritative; no-op drafts refuse.

The closed JSON bridge takes `selection`, `runs` with native `formatsJson`
literals, and `prefix`. It does not reuse a mutation endpoint's authorization or
change that endpoint's request semantics. Wasm exposes the separate
`suggestion_general_text_version` marker and `plan_suggestion_general_text` read.
`supportsSuggestionGeneralText` requires that complete pair beside existing
suggestion capabilities; `planSuggestionGeneralText` checks the current revision
before calling Rust. Older suggestion runtimes remain usable for their original
actions without fabricating protected-range support.

The new stock action consumes one host namespace, then calls a planner closure
bound to the captured native selection/revision. The panel checks the same source
again before capture; metadata updates do not run the planner or consume names.
Proposed text still stays outside accepted content until authenticated server
Accept. Partial structures, accepted-effect ownership and ordinary compensating
Undo/Redo keep the native contracts already described above.

The [protected text checkpoint](qualification/2026-10-17-rich-review-suggestion-range-planner.json)
passes 485 native tests, five research compatibility contracts, 344 SDK/editor
tests and 48 runtime/build guards. Clean-installed public vanilla/React entries
exercise all nine actions under six policies, including protected-range native
floor planning, offline choices, server-finalized owned Accept and exact document
Undo/Redo. The same run retains mixed comments/versions and permanent Reader
regressions. This functional qualification uses the paired application Wasm and
an unchanged native host; saved packet meanings and package versions are unchanged.

## Durable comments and anchors

A thread has a durable identity, author, original anchor, messages and resolution
state. Replies and message edits retain attribution. Comments have an independent
history lane: document Undo must not remove somebody else's reply, and comment
Undo must not undo typing. Hosts supply authenticated principal/role policy;
author strings and causal writer identifiers in content are not permissions.

The first native component is a separate `breditor/shared-review-anchor` V1
envelope. It binds document identity, schema fingerprint, causal model and engine,
and retains captured causal dependencies and native character/container anchors.
It carries no account claim, credential or expiry. Capture and resolve are pure,
including in read-only mode, and cannot change editor selection or history.

Resolution has three outcomes: resolved, pending document dependencies, or
orphaned. Text follows native character affinity through insertion, paragraph
split/join and moves. A formerly nonempty range that collapses is orphaned.
Boundary-affine replacement within a retained text flow can remain in the range;
the review UI must distinguish the original quote from current content. Comments
never borrow the editor caret's fallback to another cell or neighboring row.
Grid anchors retain their original table/row/column identities; removing a
boundary axis or hiding its table orphans the anchor instead of choosing a new
axis. Node anchors require the same surviving node. A document-wide anchor is an
explicit global discussion, not a range between the first and last paragraphs.

Orphaned threads remain readable and retain their immutable anchor for possible
reattachment through restored structure. Reanchoring is an explicit attributed
review action. Existing ephemeral presence packets retain their original format,
expiry and relocation laws; durable anchors are not renamed presence packets.
Anchor inputs are bounded to 256 KiB, 1,024 causal clocks and 1,024 captured text
cut witnesses. Invalid bindings, malformed cursors and stale captures reject.

## Named versions

A version is a named immutable admitted document snapshot with author, source
revision/causal identity, creation metadata and retained asset references. It is
not an old live writer credential or a synonym for a runtime Undo checkpoint.
Comparison is a native semantic read over admitted trees. It reports text,
formatting, structure and immutable asset-reference differences without embedding
browser DOM or fetching external assets.

Restore creates a newly authored guarded edit against the user's observed current
document, with a fresh namespace and an explicit preview. It never rewinds a live
writer, imports old credentials or silently replaces concurrent unobserved work.
Current discussions remain current discussions; restoring a document version does
not silently resurrect an older review database.

## Implementation and acceptance order

1. Native durable anchor capture, strict mapping, orphan/pending behavior and exact
   saved-anchor resolution after future edits and native journal recovery.
2. Bounded native thread/message actions, author policy, independent review history
   and a separately declared recovery/merge contract.
3. Native immutable versions, semantic comparison and guarded restore planning.
4. Native proposal creation and preview, then atomic accepted edits and explicit
   concurrent decision rules across text, formatting, lists, tables and images.
5. Paired opt-in Wasm, SDK, vanilla/React controls and review persistence/transport.
6. Clean-installed mixed workflows with two offline authors, comments on changing
   targets, conflicting reviews, exact reload, selective history and image bytes.

Every new Rust action has its own named documented file. Tests accompany native
and integration increments. Broad browser matrices, physical input/accessibility,
performance and final V1 qualification follow this functional phase. A native
foundation alone does not complete any of the three review-product features.

## Native and SDK checkpoint — October 16, 2026

Implemented foundations, not a release-complete review product:

- Durable anchors and real-document comment admission, including native validation
  of every retained anchor on recovery and newly admitted remote anchors.
- Attributed thread creation, replies, edits/retractions, resolve/reopen, explicit
  reanchor and independent author-local Undo/Redo. Concurrent bodies and anchor
  values remain visible; opposing resolution heads are explicitly conflicted.
- An immutable owned review stream with exact decimal event counters, causal
  dependencies and a hash-linked prefix. The hash detects divergent prefixes; it
  is **not** authentication. Hosts supply writer/account/rights separately. Saved
  roles are absent and live grants are reapplied on restore. Historical catchup
  still needs authenticated original grants, not a payload permission claim.
- Named content-addressed semantic versions, native stable-identity block/text/
  format/property/asset comparison, and opaque guarded restore plans. Restore
  creates fresh owned nodes in one ordinary edit group and keeps current comments.
  Exact future document and review history survives paired manual recovery.
- Complete optional Wasm/typed SDK pairing. Old document protocols and constructor
  defaults are unchanged; native version proofs have no public constructor. SDK
  callbacks cannot author reentrantly, and each receives a fresh read projection.

The actual-Wasm probe is reproducible with:

```sh
CARGO_INCREMENTAL=0 node scripts/build-collaboration-runtime.mjs
node_modules/.bin/tsc -p packages/breditor-collaboration/tsconfig.json
node scripts/probe-review-sdk.mjs packages/breditor-collaboration/dist/runtime
```

It combines peer comments, delayed document dependencies, version restores,
orphaned targets, both selection policies and both edit-history policies. The
checkpoint passes four exact paired restores and 24 future paired checkpoints.
This is a programmatic Wasm/SDK test, not an installed browser/relay qualification.

### Current bounds and unfinished integration

Review metadata retains at most 8,192 events and a 16 MiB exact checkpoint. Frames
are at most 1 MiB/128 events; messages are plain text, nonblank and at most 16 KiB.
Every Undo/Redo visibility operation consumes an event. No automatic compaction or
history eviction is implemented. Large-history throughput remains unqualified.

Version envelopes are at most 4 MiB, even where the admitted document itself has
a larger budget. Comparison is block/identity based, not a word-level visual diff
or heuristic match between newly allocated nodes. Restore uses existing semantic
copy/paste laws: active merge geometry and independent source-cell bodies survive,
but inactive merge/retraction provenance is not resurrected. Image identities and
binding generations are fresh; immutable assets remain host-resolved. The host
must retain/fetch referenced bytes. Nothing embeds or uploads those bytes.

Restore currently uses the existing 64-step and 64-flow-block limits (one paste
plus observed root deletions, hence at most 63 existing root blocks). Intermediate
staged admission may also refuse a replacement near document budgets. Preview
failure is atomic; it does not silently truncate content or fall back to text.
Restore clears local selection/pending styles as shown by its native preview.

The explicit `SharedReviewPersistentSession` now stores both exact histories and
a local immutable version catalog in one IndexedDB record/transaction. It leases
document and review writers independently before calling either native factory,
requires exact declared language/selection/range/history policies, and reapplies
fresh host access on restore. The storage header is identity/budget admission,
not a replacement for native causal replay. Old records require an explicit future
migration; neither reader silently resets or downgrades the other's family.

An aborted save retains the previous complete durable pair. Failed final saves
retire authoring but retain both readable native histories and both leases until
retry or explicit discard. `exportRecovery()` returns the complete readable pair
and catalog without serializing live permissions. The local catalog is bounded
to 32 packets; the entire escaped stored record is bounded to 32 MiB. No automatic
version deletion, migration or asset-byte retention policy is inferred.

The paired lifecycle passes actual-Wasm tests using synthetic IndexedDB/Web Locks:
12 exact reopens, four retained catalogs, four atomic-abort checks, 12 lease checks
and four native corrupt-recovery refusals. This does not qualify physical browser
storage or server-side writer leasing. The existing document-only wrapper still
explicitly refuses live comments, so it cannot claim a document-only save while
silently omitting discussions.

### Vanilla and React controls

`mountSharedReviewPanel` borrows an enabled native review facade. It provides
explicit document/selection targets, replies, attributed concurrent message
versions, guarded message edits, retraction, resolution, reanchoring and separate
comment Undo/Redo. Stable keyed controls retain unsaved reply/edit drafts through
native updates. A changed edit baseline requires explicit acknowledgement before
saving the retained draft. Comment content is plain text, never interpreted HTML.
The host's policy callback controls display affordances only; native permissions
still decide every action.

An optional paired-session catalog adds named version capture, semantic comparison,
the exact native restore preview and explicit Apply. A changed source publication
disposes the preview. Failed local persistence offers Retry without recapturing a
duplicate version. Hosts supply permanently fresh restore prefixes and asset-byte
retention. These controls do not authenticate transport or restore inactive causal
merge provenance.

`BreditorSharedReviewPanel` is available from the optional React collaboration
entry. Its `initialOptions` belong to one core/`sessionKey`; parent rerenders retain
drafts. Both DOM and React mounts dispose only their own controls, never either
native writer or persistence lease. The caller closes the paired session after
unmounting borrowed controls.

SDK review guards now include an exact facade-lifetime object witness as well as
both revisions. Matching revision strings from another owner, or a guard copied
through JSON, cannot authorize a queued request. This is a source-state guard,
not an account credential. Store declared native recovery records, not UI guards.

The native reference host now has opt-in authenticated comment transport and the
SDK has an automatic paired-storage adapter, described below. The shared version
catalog now has native durable authority, HTTP transport and the separate SDK
cache/synchronizer described below. Original quotes
now have a native historical read and optional lazy control, described below.
Current control tests use actual Wasm with synthetic DOM, IndexedDB and Web Locks;
physical browser qualification remains a later release phase.

### Authenticated comment transport

`Room::enable_review` explicitly activates a review V1 lane. Default rooms and
document writer transport keep their original behavior. New activation, grants,
metadata-writer registrations and acceptances use separately tagged records in
the same private durable log as document edits. Older hosts cannot read these new
records; no silent downgrade or migration is supplied.

Comment and Moderator roles are independent of document Reader/Editor. Every
metadata actor is bound to an authenticated account, a separately saved hashed
resume credential and a replaceable connection lease. Account/read-role and
review-role changes fence old metadata leases; restart invalidates all leases.
The reserved server metadata actor cannot be registered by a client. Historical
catchup retains the original server-verified grant, and recovery independently
rederives it from the preceding durable grant records. Content claims never grant
authority. Comment-only users can reserve observation-only document identities
from the same allocation registry as editors. Those identities cannot submit
document edits, even if the account later becomes an Editor.

Native metadata preparation is pure and checks both exact owners, a contiguous
single-actor batch, source identity/rights, every newly admitted native anchor and
captured document dependencies. The host appends and syncs acceptance before
publishing the candidate or returning a receipt. Missing review or document edits
remain client-owned pending input: no prefix is published or acknowledged. Native
clients may still retain valid pending targets during catchup; this is distinct
from server admission of a comment based on unaccepted document work.

Review receipts use positive **inclusive** event counters, unlike the existing
document operation windows. Native canonical prefix/batch digests ignore outer
JSON formatting but preserve exact opaque anchor-string bytes. An overlapping
batch retains the original acceptance of each known event. A fully known retry
or repacking returns the terminal supplied event's original durable sequence and
appends nothing. Hashes witness lineage, not authentication.

Catchup uses ordered pages of at most 4 MiB including JSON escaping, not an
unbounded metadata checkpoint in a socket message. Each cursor is pinned to a
random durable review-log binding, so an identically seeded separate room cannot
reuse it. Clients must persist applied document/review state before advancing
the cursor. The existing 1 MiB/128-event input and 16 MiB/8,192-event native limits
still apply. The reference log also retains its 256 MiB/4,096-record ceiling and
has no compaction. Actor registrations are capped at 1,023 plus the reserved
receiver; failed/timed-out first registrations can consume an actor reservation.

The socket capability `reviewV1` must be requested explicitly. It enables separate
review registration/resume/submission, clock, grant and paginated sync requests,
plus coalesced `reviewChanged` hints. Clients that did not negotiate it receive
neither a review descriptor nor this event family. The standalone
`review_functional` host creates only an isolated loopback test room.

Reproduce the focused transport checks:

```sh
CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_TARGET_DIR=target/relay-native \
  cargo test --manifest-path experiments/relay/Cargo.toml --release --features server --locked --offline
CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_TARGET_DIR=target/relay-native \
  cargo build --manifest-path experiments/relay/Cargo.toml --release --features server --example review_functional --locked --offline
node scripts/probe-review-relay.mjs packages/breditor-collaboration/dist/runtime \
  target/relay-native/release/examples/review_functional
```

The actual-Wasm/socket fixture passes both original explicit and document natural
history: six exact paired restores, eight future history steps, 16 durable review
receipts, four pending-dependency responses, moderation under historical grants,
guarded version restore preserving comments, and permission/capability refusals.
It explicitly drives wire requests and manual checkpoint persistence. The SDK
checkpoint below adds automatic synchronization and paired progress. Public deployment still
needs the existing resource-limited import, identity/TLS and storage-lifecycle
qualification; this loopback host does not establish production readiness.

### Automatic review synchronization

`registerSharedReviewWriter` and `SharedReviewRelaySync` are exported from the
optional collaboration entry, including `@breditor/editor/collaboration`. The
registration helper waits for the host's separate credential save before returning
an author identity. It can use an already reserved editor document writer or
reserve a permanent observation-only document writer for a comment-only account.
Failed registration saves can consume reservations; they never silently rename
unsent events or replace an existing actor's credential.

The adapter borrows one `SharedReviewPersistentSession` and its exact core. It
submits metadata only, so an existing document relay can run beside it without
giving comment-only users document-edit authority. It receives document catchup
too, verifies document-writer lineage before importing it, and retries pending
comments when their document dependencies reach the server. An optional
`flushDocument` callback adds a host-selected document-save barrier. Disposal stops
networking, not either native owner or persistence lease; dispose networking before
closing the borrowed session.

Native `review_transport_version` capability 1 supplies exact local/historical
clocks, receipts for already-retained batches and export through a captured event
end. Older comment runtimes still support their original review API but cannot
simulate these transport proofs in JavaScript. Unknown own-writer suffixes,
divergent prefixes, mismatched receipts and server rollback stop sync and retain
local recovery. Outbound native frames are saved locally before submission. A
flush uses its captured review end, excluding later review actions from that
batch. Requests, flush waiters, socket bytes and retry delays remain bounded.

The additional socket capability `reviewLineageV1` explicitly selects current-role
responses and a native cursor-prefix proof. It requires `reviewV1`; original
`reviewV1` clients keep their original authenticated/catchup response shapes and
cannot call the new proof request. Historical source grants remain independent
of current permissions. A revoked comment writer does not automatically steal its
lease back; an explicit reconnect can retain read-only catchup when document-read
permission remains. Author registration needs Comment/Moderator access. A new
reader can instead register the permanent observer identity described below,
without any temporary write grant.

Setting `SharedReviewSessionOptions.relay` selects the distinct
`breditor/shared-review-relay-checkpoint-record` V1 storage family. It holds both
exact native journals, the local immutable version catalog, nonsecret relay
binding, catchup cursor and native accepted prefix in one IndexedDB transaction.
Credentials and live roles are excluded. Neither local-only paired V1 nor old
document-only readers are silently upgraded or allowed to omit this progress.
The unchanged 32 MiB escaped record ceiling includes the new fields.

The durable progress getter changes only after transaction completion. An aborted
save retains the preceding complete record and cursor, while both in-memory
native histories remain readable for retry/export. Recovery/export objects do not
expose mutable internal binding objects. Before using a restored cursor to skip
pages, the adapter checks every server prefix through that sequence against the
actual restored Rust sidecar. A valid but incomplete sidecar cannot silently skip
missing peer discussions just because its cursor looks well formed. Restore
never resets metadata or manufactures missing local author history.

Reproduce automatic integration with the matching runtime and host:

```sh
CARGO_INCREMENTAL=0 node scripts/build-collaboration-runtime.mjs
node_modules/.bin/tsc -p packages/breditor-collaboration/tsconfig.json
node scripts/probe-review-relay-sdk.mjs packages/breditor-collaboration/dist/runtime \
  target/relay-native/release/examples/review_functional
```

The actual-Wasm SDK probe covers both selection/history policies: twelve exact
paired reopens, four abrupt host restarts with automatic reconnect, four atomic
save failures/retries, four missing-native-prefix refusals, sixteen future history
steps, four guarded version restores, multi-page escaped catchup and four
write-to-read-only transitions. IndexedDB and Web Locks are synthetic. Clean-installed
review/UI acceptance, authenticated shared
versions and suggestions remain part of the active goal.

### Permanent read-only metadata observers

`registerSharedReviewObserver` reserves a metadata actor for an account with
document-read permission only. By default it also reserves the existing permanent
document-observer identity. Its identity has `reviewEditing: "read_only"`; this is
a fixed actor kind, not a saved live permission. The host still supplies the native
document read-only policy and `review.access: "read_only"` when opening the paired
session. Passing an already reserved document writer remains an explicit host
choice and does not change that writer's separate permissions.

Observers and authors share the bounded actor registry, so the same actor cannot
be registered under both kinds. The distinct durable `RegisterReviewObserverV1`
record never becomes an author record, including after role promotion or restart.
Author resume/submission rejects observer actors even when their account is now
Editor/Moderator. Becoming an author requires a separate newly registered actor.
The `reviewObserverV1` socket capability requires `reviewLineageV1` and `reviewV1`;
old capability/response shapes remain unchanged. Observer credentials can only
resume a matching principal's read-only lease. Replacement fences the prior
connection; read revocation denies catchup, and regrant requires valid resume.

The explicit observer identity selects
`breditor/shared-review-observer-checkpoint-record` V1, not the writer or local
paired storage family. One transaction retains both exact native journals, the
local version catalog, nonsecret binding and caught-up prefix. The unchanged
32 MiB record budget includes all fields. An observer has no authored sequence,
and its native own-event counter must remain zero. Native restore refuses even a
structurally valid recovery record containing an authored observer suffix; failed
admission leaves the saved bytes available. There is no silent promotion,
demotion, actor renaming or family migration. Credentials and current account
roles remain outside portable recovery. A failed save retains the prior complete
record and cursor, with readable in-memory recovery for explicit retry.

Reproduce the additional actual-Wasm/native acceptance after building the matching
SDK and isolated host above:

```sh
node scripts/probe-review-observer-sdk.mjs packages/breditor-collaboration/dist/runtime \
  target/relay-native/release/examples/review_functional
```

Four selection/history combinations cover initial reader catchup without write
grants, exact reopen, refused authored recovery, failed-save retry, permanently
read-only policy after promotion, lease replacement, read revoke/regrant and
abrupt host restart. IndexedDB and Web Locks remain fixtures, not physical browser
qualification. This completes initial pure-reader integration, not the remaining
shared version catalog, suggestions or combined installed review
acceptance.

### Original quotes and proven version sources

The native `read_review_quote` action reads the selected content at the anchor's
captured causal cut, not today's content at old numeric offsets. A historical
engine fork retains only that cut's operations; it is never checked out on the
live owner, authored, published or saved as a second replica. The original
canonical Rust materializer/schema and semantic selection/clipboard laws supply
the quote. Current document selection, pending formats, observation tokens and
both history lanes remain unchanged, including for read-only owners.

Quote results are explicit: `quoted` with complete plain text, `pending` while
document operations are missing, `document` for a global discussion with no
selected text, or `unavailable` when text exceeds 64 KiB UTF-8. A caret quotes the
empty string. Deleted or changed current targets can still quote their original
text; table columns retain tabs and rows retain newlines, and unselected text is not
included. Malformed bindings, non-causally-closed clocks and a target invalid at
the claimed capture cut reject instead of quoting a guessed neighbor. The
existing 256 KiB anchor/1,024-clock and native document budgets still apply.
Historical reads require retained native history; no compaction policy is added.

`verify_document_version_source` separately proves that a version's entire
canonical semantic snapshot equals the actual document at its captured source
cut. It returns validated descriptive version metadata and numerically sorted
exclusive document-operation ends, or explicit missing dependencies. A valid
digest alone is insufficient: a caller can rehash different admitted content
while claiming an older source. The original `read_document_version` still admits
such imported descriptive packets under its original contract; only the new
proof establishes historical content equality. Neither read authenticates an
author, checks a server's accepted semantic-group boundaries or acknowledges
durable publication. The catalog authority below enforces those additional laws;
local imported-version reads retain their descriptive contract.

The additional native capability pairs `review_quote_version`/`read_review_quote`
and `document_version_source_version`/`verify_document_version_source` are version
1. SDK `supportsReviewQuotes`/`readReviewQuote` and
`supportsVersionSourceProofs`/`verifyVersionSource` refuse incomplete native pairs;
older runtimes retain their original comment and imported-version support.
No existing anchor, review frame, version envelope, view or saved journal gains
new fields or meanings. The application still exports its same six JS factories
and proof types, with no research constructors.

The borrowed vanilla and React review panels expose **Show original quotes**.
They read lazily and cache completed display text only for active immutable anchor
packets. Ordinary typing, peer replies and rerendering do not reconstruct every
discussion's old document. Pending quotes require an explicit retry after catchup.
Display uses literal text, never markup, and remains distinct from current target
status. Existing borrowed host panel ports without quote methods still mount with
the new control disabled.

The focused Rust contracts and `probe-review-sdk.mjs` cover old revisions,
deleted/split Unicode ranges, exact future recovery, table/image properties,
cross-cell selected text, missing history, refused noncausal cuts and rehashed
source/content mismatches. `probe-review-controls-sdk.mjs` verifies lazy quote
display and retention through version restore with actual Wasm and fixture DOM.
These close original-quote functionality. Suggestions and final combined
installed acceptance remain part of the active goal.

### Shared version catalog authority

`Room::enable_document_versions` explicitly enables an immutable shared catalog
under the room owner's authority, independently of comments and document writer
transport. Existing rooms remain disabled unless the owner activates it. The
separate `EnableDocumentVersionsV1` and `PublishDocumentVersionV1` records share
the document room's ordered log; existing log tags and stored native document,
review and local-version families keep their meanings.

Publication requires current document Editor permission and packet authorship
equal to the authenticated principal. Comment-only or Moderator rights alone
cannot publish a document version. Native historical content proof must succeed,
and every nonzero source clock must end at the immutable seed boundary or a
complete durably accepted document group. A causally closed, valid snapshot taken
inside an accepted group is still refused. Missing operations return `pending`,
not an acceptance or a durable queue entry; the client retains its exact packet
and ordinary offline document edits for retry.

The authority appends and fsyncs before exposing a new catalog entry or receipt.
Entries retain the original server log sequence; client timestamps remain
descriptive. Exact retries, including different outer JSON whitespace, return the
original acceptance and first packet bytes without a second record. Replay
rechecks historical account permissions, attribution, source equality and group
boundaries in original log order. Current read permission is required even for a
known packet digest; revocation removes remote access, not the reader's already
downloaded copy.

`DocumentVersionsCursor` binds an exact enabled catalog and a frozen `after` and
`through` interval. Both ends must be actual publication or activation sequences,
not guessed offsets. Each page contains at most 64 metadata entries in original
acceptance order. Publications after the first page's terminal sequence appear
on a new refresh, not halfway through an old interval. The host retains at most
1,024 immutable packets and 64 MiB of raw packet text, with the existing 4 MiB
per-version ceiling. The room's unchanged aggregate log ceilings also apply:
20 MiB per escaped record, 256 MiB total and 4,096 records. There is no automatic
version deletion, compaction or asset-byte retention policy.

The optional reference host exposes a separately versioned HTTP path:

- `GET /document-versions/v1/descriptor` discovers the enabled document/catalog
  binding and current publication affordance.
- `POST /document-versions/v1/catalog` reads a page from a closed `{cursor}` body.
- `POST /document-versions/v1/publish` submits the original raw semantic version.
- `GET /document-versions/v1/packets/{id}` retrieves the first accepted exact packet.

Each request uses fresh account authentication and exact allowed Origin policy.
Catalog reads/publications and packet downloads require the pinned
`X-Breditor-Catalog` binding; publishing also rechecks Editor permission after
body admission. There are at most four active version transfers, a ten-second
body timeout, a 4 KiB page request and a 4 MiB raw publication limit. Raw HTTP JSON
avoids escaping a 4 MiB version inside the unchanged 6 MiB socket envelope.
Credentials and live roles never enter version packets or portable recovery.

The independent `documentVersionsV1` socket capability opts into catalog identity,
current publication affordance and coalesced `documentVersionsChanged` hints.
Unnegotiated clients retain their original responses and event families. Hints
are not acceptance receipts. The native HTTP probe uses actual Wasm and two
editor histories to publish, fetch, compare and perform a guarded remote-version
restore, then verifies exact server restart and permissions. It drives the wire
explicitly. The automatic SDK/cache and shared control contract below has a
separate actual-runtime probe; combined installed review acceptance remains open.

Reproduce this host checkpoint with isolated native targets:

```sh
CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_TARGET_DIR=target/version-catalog-native \
  cargo test --manifest-path experiments/relay/Cargo.toml --release --locked --offline --features server
CARGO_INCREMENTAL=0 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_TARGET_DIR=target/version-catalog-native \
  cargo build --manifest-path experiments/relay/Cargo.toml --release --locked --offline \
  --features server --example review_functional
CARGO_INCREMENTAL=0 node scripts/build-collaboration-runtime.mjs
node scripts/probe-version-catalog-relay.mjs packages/breditor-collaboration/dist/runtime \
  target/version-catalog-native/release/examples/review_functional
```

### Complete formatting marks in historical cuts

The pinned engine stores a formatting mark as adjacent start/end operations.
Causal closure alone permits a clock between them, but reconstructing that state
can abort the engine with an unclosed-style error. Historical quote/source reads
now inspect the last retained atom of each nonzero clock before creating a fork
and refuse a cut ending at a mark start. This is a deterministic native contract
check, not a caught panic, a reset history or an exception hidden by the SDK.

The direct native regression checks every captured open-mark boundary and retains
the live owner and observation unchanged. The actual-Wasm probe enumerates every
interior operation cut of a real formatted insertion across all four selection/
history combinations; incomplete marks reject without a trap, followed by exact
future paired recovery. This repair addresses the reproduced historical-cut bug,
not the separate older intermittent WebKit investigation.

### Durable shared version client and controls

`discoverSharedDocumentVersions` discovers and pins the nonsecret catalog binding
before the first capture. `SharedDocumentVersions.open` borrows an existing
document or paired review session's native core; it does not allocate, replace,
submit through or dispose that document writer. The host supplies fresh account
tokens. HTTP uses the original principal header for ASCII accounts and the new
explicit percent-encoded `X-Breditor-Principal-Utf8` header for other UTF-8
identities. Both headers together reject; a literal plus is never decoded as a
space. This addition is confined to the version endpoint.

The client owns a separate origin-wide cache lease and a closed
`breditor/shared-version-catalog-cache` V1 record. Neither an old document/review
record nor another cache family is automatically migrated. The record retains
the pinned identity, the last complete frozen catalog, exact immutable packets,
explicit publication intents and original acceptance entries. It contains no
account token, writer credential, live role or native journal. Opening validates
the exact native source identity and re-proves every retained local version's
historical source. A valid older journal missing a queued version's source cannot
silently replace the required source history.

Every cache transaction first saves and flushes the borrowed native journal.
`saveVersion` captures once; retrying never recaptures its document, name or time.
`flush` confirms local durability only. `flushShared` captures the current queued
IDs before waiting and requires both server acceptance and a locally committed
receipt for each. Missing document dependencies remain queued. An optional
`flushDocument` callback can drive the already-owned document relay; the catalog
itself only receives catchup. Ordinary offline document edits remain available.
`retry` confirms local persistence and restarts wanted synchronization separately;
a denied reconnect cannot turn a successful local save into a save failure.

Automatic sync negotiates only the independent version hints, checks the native
source/profile and own-writer prefix before importing catchup, then reads complete
frozen metadata pages. It refuses a server catalog that drops or changes an
observed entry. Transient connection failures retry with bounded backoff; current
roles are checked for each publication rather than recovered from disk. A lost
HTTP reply is reconciled against the catalog or the original idempotent packet.
An aborted local receipt save remains visibly unconfirmed, preserves the last
complete record and retains readable recovery for retry. Failed close retains
the cache lease; successful close releases only the catalog's own resources.

`loadVersion` fetches and natively validates a selected packet, checks its exact
accepted metadata and saves it locally before returning. Cached packets remain
available offline. Metadata-only entries require a connection. The client cache
holds at most 32 packets in a 32 MiB escaped record, independently of the server's
1,024-entry catalog. It never silently evicts a packet. `stopRetryingVersion`
retains a local snapshot while cancelling future retries, not a transaction the
server already received; later discovered acceptance still wins.
`forgetCachedVersion` explicitly removes an unqueued cached packet, leaving a
known server entry in the directory.

Pass the shared client as the existing review panel's `versions` port to opt into
asynchronous loading, catalog subscriptions and a Sync versions control. Local
synchronous ports keep their existing behavior. A changed source publication or
version selection while loading refuses the stale result before creating a
native restore preview. The controls distinguish local save, queued publication,
server acceptance and unconfirmed local receipt. Remote catalog-only updates
preserve comment drafts and focus; disposal detaches the subscription without
closing either native owner. The same borrowed port is available through React.

`probe-version-catalog-sdk.mjs` covers all four selection/history combinations
with actual application Wasm and the durable authenticated host: 16 exact cache/
paired reopens, eight local save aborts, four receipt save aborts, four lost-reply
recoveries, four guarded remote restores and four host restarts. It also checks
rollback refusal, independent cache leases, missing local sources, role changes,
a UTF-8 account and a shared panel with delayed loading/stale preview refusal.
The storage, locks and DOM are fixtures; installed combined review acceptance,
suggestions and final production/browser qualification remain open.

```sh
npm run build:candidate --workspace @breditor/collaboration
node scripts/probe-version-catalog-sdk.mjs packages/breditor-collaboration/dist/runtime \
  target/version-catalog-native/release/examples/review_functional
```
