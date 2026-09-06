# Breditor

Breditor is an experimental, original rich-text editing engine. The name combines
the HTML `<br>` element with “editor.” Other editors are research examples only;
Breditor does not implement their document model, operation format, or plugin
protocol.

This repository currently contains the deterministic Rust core, its first
narrow WebAssembly boundary, and a framework-neutral browser layer:

- immutable, structurally shared document values;
- proof-derived cached document measurements for node count, maximum depth,
  total UTF-8 text bytes, and recursive property-value count;
- a minimal compiled schema for document, paragraph, text, and strong formatting;
- strict versioned document JSON, singular guarded-operation records,
  exact-base atomic transaction-request records, and contextual complete
  editor-state checkpoints, self-contained replay-proved commit records, and
  compact replay-proved bounded session/history checkpoints plus strict
  replay-identified local-log event envelopes and atomic genesis-prefix
  recovery, compact runtime prefix anchors, checked successor-generation
  batch recovery, recoverable one-observation successor admission with fixed
  cumulative budgets, repeated consuming generation compaction with cumulative
  replay retention, and a strict expected-binding durable local-log-checkpoint
  codec plus a platform-neutral Local Log Frame V1 encoder and allocation-free
  one-frame scanner with separate header and payload CRC-32C checks, and an
  owning active-tail cursor that advances semantic admission and a checked
  generation-relative byte offset atomically and compacts without losing its
  accepted-prefix length or retained Frame V1 policy, plus six bounded
  storage-generation identity/version types, distinct database/scope
  incarnation IDs, strict root and rotation codecs with exact nested-checkpoint
  and outer canonical bytes, trusted root/rotation selection normalization,
  byte-exact selected-envelope retention and comparison, and next-rotation
  validation against that normalized selected state, plus exact non-owning
  publication plans, process-local physical attempt IDs, typed host terminal
  attestations, and request-correlated root and rotation resolver typestates and
  classifications, plus exact writer-fence bindings and checked acquisition
  plans, a separate request-correlated acquisition lifecycle, and revocable
  process-local storage-mutation tokens, plus pure single-frame append planning
  and a nonempty bounded FIFO that retains one token, one final speculative
  cursor, and an exact ordered frame prefix without exposing follower bytes,
  plus a process-local uncertain FIFO-head attempt with one-shot borrowed exact
  request egress, exact resubmission, logical enqueue behind the head, correlated
  terminal classification, and an explicit one-head acknowledgement transition
  to either the next pending queue or a drained token/cursor owner, plus a
  separately correlated same-process lost-callback resolver with closed
  physical observations, exact-head retry or presence outcomes, logical enqueue
  during resolution, and its own one-head acknowledgement family;
- root-relative paths, UTF-16-safe points, document-aware point ordering, and
  directional range selections;
- immutable `EditorContext` and `EditorState` snapshots with caller-owned
  lineage identity and monotonic revisions;
- paragraph-local `TextSplice` operations over canonical formatted fragments,
  including source guards, exact inverse operations, and proof-backed local
  result validation with authoritative fallback;
- direct-root base-paragraph `ParagraphSplit` and `ParagraphJoin` operations
  with whole-paragraph guards, exact content inverses, and structural
  relocation laws;
- guarded `RootTextReplace` operations for one- or multi-paragraph root text
  ranges, with complete source guards, multiline replacement fragments,
  same-type closed inverses, and deterministic deleted-point relocation;
- atomic transactions, explicit state updates, relocation maps,
  heterogeneous operation-relative change sets, and typed failures;
- an immutable, deterministic action registry with namespaced identities,
  bounded versioned inputs, exact prepared capabilities, and fail-closed
  extension conflicts;
- a frozen semantic intent router with declared input contracts, named
  bindings, explicit priority and disabled fallback policy, and distinct
  unhandled, blocked, and prepared outcomes;
- one-call action observations that keep availability, active/inactive/mixed
  state, independently versioned values, and conservative effects coherent;
- a frozen observable action-state catalog with presentation-independent
  identities, immutable exact-base direct/routed/history batches, and a
  synchronous single-observation cache with domain invalidation, exact-source
  coalescing, and bounded local deltas;
- semantic `insert-text`, atomic `insert-plain-text`, paragraph break,
  grapheme-aware backward/forward delete, exact selection delete, and
  `toggle-strong` actions exposed through the same registry for future
  keyboard, toolbar, palette, and API adapters; typed insertion consumes
  pending formats, multiline insertion and extended deletion atomically replace
  cross-paragraph selections, while `toggle-strong`
  publishes tracked inactive/active/mixed state and preserves selected block
  boundaries during cross-paragraph formatting;
- a synchronous `EditorSession` publication boundary with exact-base commit
  acceptance, intent/action execution, bounded linear history, deterministic
  merge groups, atomic undo/redo replay, and durable local checkpoint restore;
- a guarded product-level `EditorEngine` that owns one session and one frozen
  action registry, requires an exact combined engine-instance/state/history observation for
  every mutation, keeps executable action preparations inside one synchronous
  call, and returns private-constructor semantic events for action, selection,
  undo, redo, and effective history controls without a mutable-session escape;
- a separate no-DOM `breditor-wasm` crate with opaque engine-created
  observation handles, structured domain results, guarded no-input/string
  action commands, history controls, strict document/checkpoint factories,
  separate state/commit/checkpoint reads, a guarded canonical Document V1
  read, runtime ABI/version probes, and an exact generated TypeScript
  declaration gate;
- a checkpoint-constrained engine owner that admits every effective mutation
  only after its complete canonical session checkpoint encodes, plus a generic
  no-DOM semantic Wasm projection with conservative commit invalidation; and
- a publishable framework-neutral `@breditor/browser` package that consumes that
  projection without JSON, creates a closed safe DOM vocabulary, maintains
  snapshot-local AST/DOM maps, retains proved paragraph identity, and rebuilds
  conservatively on broad impact or DOM drift, plus exact range/target mapping,
  a bounded non-recursive command FIFO, deliberate `beforeinput` and keyboard
  translation, event-echo suppression, queue-routed document selection
  changes, and an observation/render-owning Wasm command adapter, plus an
  exact queue/renderer composition lease that
  reconciles one paragraph-local native IME replacement back through Rust, and
  guarded semantic copy/cut/paste with a bounded base-subset HTML allowlist,
  plus handle-free guarded action-state refresh, a last-good subscription
  store, and a bounded manifest-driven native-button toolbar whose commands
  preserve semantic selection and re-enter the same FIFO, plus synchronous,
  snapshot-correlated canonical-document and semantic plain-text exports that
  never treat the DOM as content;
- `Commit` helpers that construct lower-level undo and redo transactions; and
- document, fragment, operation-record, and fixed-width per-transaction
  operation limits plus host-configurable aggregate session-checkpoint
  admission budgets, a separate complete replay-tombstone checkpoint limit,
  and an inherited proof-dropping compaction lifetime ceiling whose typed
  failures return the unchanged log owner.

This is still a proof slice, not a complete editor. Structural edits beyond
direct-root base-paragraph text structure, generic formatting kinds and
attributes,
  asynchronous action-state delivery, dynamic catalog registration,
  presentation plugin lifecycle management, ordered log storage and tail-wide recovery,
log/checkpoint coordinated replacement, storage-generation publication and initial
scope provisioning, executable append I/O and process-restart append
reconstruction,
cryptographic integrity/authenticity, rollback protection, and
crash-tail recovery,
  asynchronous/programmatic clipboard,
collaboration-aware or selective undo, and generic incremental validation for
structural or custom-schema edits are not implemented. See
[`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) for the exact contracts and
current performance limitations. The deliberately narrow browser-product
target and remaining checkpoint sequence are frozen in
[`docs/V0_1_SCOPE.md`](docs/V0_1_SCOPE.md). Fresh-genesis admission remains
batch-only; hosts that need one-entry admission can compact an empty genesis
generation into its first in-memory successor. That does not provision a
storage scope, authoritative head, or first storage-generation manifest.

Version `0.0.32` implements only the pure validation layer of the proposed
platform-neutral [storage-generation transaction](docs/STORAGE_GENERATION_TRANSACTION.md).
It adds six bounded storage identity/version values, a trusted
ordinary-rotation binding, a private-constructor non-`Clone` manifest,
independent input/output/checkpoint limits, and separate strict
`prepare_rotation`, `encode_rotation`, and
`decode_rotation` operations. Preparation borrows the compaction outcome;
decoding requires an already validated prior manifest; nested Checkpoint V1 and
complete outer bytes must each be their exact canonical encoding. There is no
public seed/bootstrap manifest, storage I/O, capability, receipt, ownership
typestate, compare-and-swap, durability claim, or writable-owner release. The
caller-supplied binding and prior manifest are not authority, and successful
validation cannot prove ID/fence freshness or an empty successor. The
implemented validation-only `breditor/local-log-storage-generation@1` shape
remains a pre-`0.1` contract rather than a permanent compatibility promise.

Version `0.0.33` is contract-only. It freezes one correctness-first
[IndexedDB local-log profile](docs/INDEXEDDB_STORAGE_PROFILE.md): a distinct
canonical initial root selection, O(1) trusted restart selection without a
manifest-chain walk, database and scope incarnations, one authoritative head,
exact-then-retired transaction identity records, permanent generation
tombstones, atomic empty-successor reservation, lost-completion resolution,
revocable per-mutation writer epochs, and independent retired-payload cleanup.
Only the exact publication transaction's `complete` event can underpin a host
attestation of historical commit; a bare or unrelated `complete` is
insufficient. Missing terminal observation stays uncertain, and `strict`
durability remains a browser hint.

Version `0.0.34` implements the profile's pure Rust value boundary. It adds
distinct bounded database/scope incarnation IDs, a private-constructor
non-`Clone` root selection with separate strict preparation, encoding, and
decoding, independently trusted receipt and generation bindings, and a
private-constructor non-`Clone` selected root normalized from either a root or
one current rotation plus its immediate predecessor. Next-rotation
preparation, encoding, and decoding can validate against that selected summary
instead of retaining a complete manifest chain. The selected value privately
owns its decoded checkpoint anchor and exposes inspection facts only. The
selected-aware actions are named `prepare_rotation_from_selected`,
`encode_rotation_from_selected`, and `decode_rotation_from_selected`.

Version `0.0.35` closes the selected-envelope identity gap. The non-`Clone`
selected root now retains its complete checked selected binding together with
the byte-exact canonical current selection and, for a rotation, its byte-exact
immediate predecessor. Public inspection exposes borrowed current/predecessor
receipt bindings and exact byte lengths, while the retained raw selection JSON
remains core-private. `validate_exact_selection_envelope` publicly compares
caller-supplied bytes without parsing, canonicalizing, or hashing them. Its
typed failures, and the selected root's `Debug`, reveal no raw selection or
checkpoint JSON, document content, or session-state payload. `Debug` may still
show bounded identity values such as the session ID. Retained selection receipt
bindings remain caller-supplied validation facts, not commit evidence.

Here O(1) means constant in rotation-history length, not constant bytes.
Rotation normalization still reads bounded current and immediate-predecessor
selection bytes and strictly decodes both nested checkpoints; the current
checkpoint is decoded again to retain its anchor. The selected root additionally
keeps up to two complete canonical selection envelopes, each of which may embed
a full checkpoint. Work and retained memory may therefore scale with those byte
limits and with both checkpoints' document/session sizes. Version `0.0.35`
performs no storage I/O and adds no storage-attempt state or evidence.

Version `0.0.36` adds the first non-owning exact-attempt boundary. Root attempt
preparation takes the database and planned scope incarnations in addition to a
checked root selection. Rotation attempt preparation takes a normalized
selected root and checked candidate manifest. Both strict-encode the candidate,
construct its complete prospective `LocalLogStorageSelectedBinding`, run final
strict selected normalization, and then drop that temporary candidate selected
root and its checkpoint anchor. A root plan retains its full candidate binding
and exact canonical candidate JSON. A rotation plan additionally snapshots the
complete prior selected binding and `Arc`-shares its exact current and optional
predecessor JSON; it retains neither the input selected root nor either anchor.

The resulting private-constructor, non-`Clone`
`LocalLogStoragePreparedAttempt` exposes candidate facts and payload byte
lengths, not raw JSON. Consuming `begin_attempt` creates a fresh core-issued,
opaque, ABA-safe, process-local `LocalLogStorageAttemptId` and moves the same
plan to non-`Clone` `LocalLogStorageUncertainAttempt` before request egress.
Only that uncertain state can yield one borrowed
`LocalLogStorageAttemptRequest` for the current physical attempt. The request
intentionally exposes exact candidate JSON and, for rotation, the exact selected
binding/current/optional-predecessor JSON needed by an adapter; its `Debug`, the
state `Debug`, IDs, and typed errors remain payload-redacted. Direct raw-JSON
getters on `LocalLogStorageSelectedRoot` remain core-private.

`begin_exact_resubmission` preserves the same plan allocations and every exact
byte while issuing a fresh attempt identity and restoring one-request
eligibility. `require_current_attempt_id` rejects an ID from another plan or an
earlier retry, but a match or mismatch classifies no storage outcome. IDs and
attempt state are volatile and have no serialized or restart representation.
The one-shot borrowed request prevents a second request view from the same
attempt object; it cannot prevent a host from copying bytes or dispatching them
more than once.

Version `0.0.37` adds the process-local terminal boundary for one physical
attempt. A non-`Clone` `LocalLogStorageAttemptTerminalAttestation` binds the
exact current attempt ID to `PublicationCompleted`, `TransactionAborted`, or
`NotAttempted`. Positive completion is a trusted host assertion that the exact
associated publication transaction passed every check, enqueued the complete
mutation set, and emitted `complete`; Rust cannot inspect or authenticate that
browser event. The one request exposes a clonable opaque
`LocalLogStorageAttemptRequestId`; publication-completed and transaction-
aborted attestations require that exact token, making both unconstructible
before egress through the safe API. Not-attempted instead names the attempt ID.
Consuming `observe_terminal_attestation` checks the retained request/attempt
correlation, and a recoverable failure returns both the unchanged owner and
unapplied attestation.

`HostAttestedCommitted` is historical only and cannot exact-resubmit.
`AttemptAborted` and `NotAttempted` close one invocation only, retain the exact
plan, and can resubmit it under a fresh ID. One ID names one invocation and at
most one associated publication transaction. Copied or duplicate dispatches
are outside that correlation and require future serialized storage resolution.

Attempt-plan history remains O(1) in rotation count, not in bytes. A rotation
plan can retain three complete payload envelopes: its candidate, the selected
current value, and the selected predecessor when present. This release still
performs no IndexedDB, JavaScript, Wasm, filesystem, or other storage I/O;
provides no adapter or publication authority; proves no compare-and-swap, head
currentness, global ID/fence freshness, generation emptiness, terminal commit
or noncommit independently of trusted host attestation, durability, or
ownership release; and does not provision a database, scope, head, or
generation. Exact bytes, selected bindings, and an attempt-ID match are not
storage authority.

Version `0.0.38` freezes the value-comparison prerequisites that serialized
resolution needs. `LocalLogStorageSelectedBinding::compare_later_observation`
requires exact current/predecessor receipts and immutable generation facts,
while accepting only the profile-valid checkpoint cleanup advance
`Retired -> Reclaimed`; the reverse is an explicit regression. A formerly
active generation can be checked independently as the exact retired or
reclaimed checkpoint of one superseding head. The closed
`LocalLogStorageRetiredTransactionBinding` contains only fields actually
retained by the IndexedDB tombstone. Its `selectionByteLength` is collision
screening and never evidence that caller-supplied bytes committed.

On their own these are directional value checks, not storage evidence. They do
not compare selection JSON, authenticate reads or cursor exhaustion, observe a
resolver transaction's terminal `complete`, prove a current head, or confer
writer authority.

Version `0.0.39` implements the process-local root-only resolver boundary.
`Uncertain`, `AttemptAborted`, `NotAttempted`, and `HostAttestedCommitted` root
states can begin a non-`Clone` resolution; a rotation is recoverably rejected.
One borrowed adapter request mints one opaque request ID at egress. Ordinary
read evidence is applicable only after that exact fixed-scope serialized
transaction emits terminal `complete` after all reads and cursor scans. Request
success, `commit()` return, abort, callback loss, or another transaction's
completion classifies nothing. Applying evidence before request egress or with
a stale or cross-request ID returns both the unchanged resolver and unapplied
evidence.
Physical database absence uses a separate fail-closed open attestation: a
versionless open must report `oldVersion == 0`, synchronously abort the upgrade,
and then emit terminal open-request `error`. It cannot be laundered through the
fixed-scope transaction-complete constructor.
`restart_resolution` retains the exact source plan and bytes but clears the
volatile correlation, so its next request has a distinct ID and old evidence is
stale.

The core validates closed physical findings against the retained plan and
produces `CommittedSelectedAtResolution`, `CommittedSuperseded`,
`ResolutionRetired`, `RetryEligibleAtResolution`, `ScopeAlreadyProvisioned`,
`CollisionOrCorruption`, or `StorageResetOrIndeterminate`. Precedence depends
on source history: clean planned-scope absence is advisory retry eligibility
only for an uncertain, aborted, or unattempted source. For a surviving
`HostAttestedCommitted` source, clean absence or a different valid scope is
reset/indeterminate and never retry authority; for the other sources, a
different valid scope is already provisioned. Physical database absence, a
different valid metadata incarnation, or a schema-compatible database with no
`meta/profile` record and all five stores empty is reset/indeterminate for every
source. Any record in any store without valid profile metadata is collision or
corruption, as is a still-present expected scope missing its append-only
candidate/index association. Retired identity additionally requires the
candidate committed-head index, current scope graph, and one of two
direct-successor proofs. If that successor is still the exact current
predecessor,
strict selected normalization privately retains its byte-derived sealed log ID
and frame; the resolver requires both to equal the root plan's active generation
without accepting another host-supplied scalar assertion. If the successor is
already retired, its Profile V1 tombstone has discarded the JSON and
sealed-generation fields: the resolver can then prove only its retained
transaction/head identity, committed-head index, and the planned active
generation's `retiredBy` link, not the discarded successor contents. The
candidate tombstone's equal byte length likewise never attests the old
candidate bytes.

Only the retry-eligible outcome can exact-resubmit, preserving the plan and
bytes under a fresh attempt ID. It is advisory after the resolver transaction:
copied request bytes may still publish later, and every later attempt must
repeat storage comparisons and acquire separate authority. Resolver IDs,
evidence, plans, and states have no wire or process-restart representation.
Rust performs no IndexedDB I/O, cannot authenticate the host's terminal event,
and grants no durability, current writer, or ownership claim.

Version `0.0.40` implements the nominally separate process-local rotation
resolver over the same four surviving attempt sources. It compares one complete
current scope graph with the rotation plan's candidate and snapshotted prior
selection. Its separate request identity is minted at egress; pre-egress or
stale evidence is returned with the unchanged resolver, and restart preserves
the in-memory plan while clearing correlation. Clean absence is advisory retry
eligibility only when the source is
uncertain, aborted, or unattempted, the exact prior selected envelope remains
current under the directional cleanup relation, and the candidate transaction,
committed-head index, candidate active-generation key, and complete candidate
active-generation chunk prefix are absent. The same intact-scope absence after
`HostAttestedCommitted` is collision/corruption. One exact direct competing
rotation is `DefinitelyNotCommittedConflict` only for the three non-host-
committed sources; rotation has no `ScopeAlreadyProvisioned` outcome.

Selected, superseded, and retired classifications validate their branch-
specific exact bytes, generation relationships, indexes, and transaction
tombstones. Retired direct-successor validation keeps the same soundness split
as root resolution: an exact successor uses sealed log/frame facts privately
derived from normalized bytes, while an already-retired successor proves only
retained transaction/head/index facts and the active generation's retirement
link. Only retry eligibility can exact-resubmit. The profile's revocable per-
mutation epoch cannot release a long-lived exclusive Rust writer. Rotation
resolution remains pure Rust: no IndexedDB adapter, browser-event
authentication, process-restart reconstruction, arbitrary far-later conflict
classification, durability, or ownership release is implemented. All Storage
V1 shapes remain unstable pre-`0.1` contracts rather than permanent
compatibility promises.

Version `0.0.41` implements the next pure-Rust writer-fence value boundary.
`LocalLogStorageWriterEpoch` is a canonical, nonzero, nonwrapping `u64` with
checked succession. The cloneable `LocalLogStorageMutationFenceBinding`
snapshots the full selected binding, `Arc`-shares its byte-exact current and
optional predecessor JSON, and adds the observed writer epoch and current
writer fence. Its
directional comparison keeps both JSON values and the mutable writer facts
exact while accepting only selected-checkpoint cleanup from `Retired` to
`Reclaimed`; the reverse transition is rejected.

Consuming `try_prepare_writer_fence_acquisition` produces a checked non-`Clone`
plan with exactly the next epoch and a proposed fence distinct from the current
writer fence. Typed failure retains both unchanged inputs. Advancing
`u64::MAX - 1` to `u64::MAX` is valid; only another acquisition or rotation is
then impossible. A future already-issued epoch-maximum token could still be
compared for append, so epoch exhaustion is not by itself a blanket assertion
that the scope contains no writable authority.

These values expose no public access to the retained selection JSON and keep
those payloads out of `Debug`. They prove neither provenance nor atomic co-
observation, currentness, compare-and-swap, request dispatch, terminal
completion, token issuance, authority, global fence freshness, restart
reconstruction, owner release, nor append durability.

Version `0.0.42` implements the separate process-local writer-fence acquisition
lifecycle. Consuming `begin_acquisition` creates a fresh opaque attempt ID
before egress. One borrowed, non-`Clone` adapter request exposes the complete
expected selected binding, exact current/optional-predecessor JSON, expected
writer pair, and exact planned successor pair; minting its opaque request ID at
egress makes completion and abort attestations unconstructible beforehand
through the safe API. `AcquisitionCompleted`, `TransactionAborted`, and
`NotAttempted` are distinct host-attested terminal kinds. Observation rejects
attempt mismatch, pre-egress transaction evidence, and stale/cross-request IDs
without consuming the owner or evidence. Abort and not-attempted retain the
exact plan for a fresh-identity resubmission.

For IndexedDB Profile V1, a future host must execute the request in one fixed
five-store strict `readwrite` transaction: validate meta/scope, read the
selected transaction both by primary key and through the unique current-head
`byCommittedHead` index, read the optional predecessor and selected generation
records, compare the full envelope/JSON/writer pair, then change only the scope
record's writer pair. A mismatch, including an already-present target pair,
must abort; only that exact transaction's terminal `complete` qualifies.

A matching completion consumes the plan into one non-`Clone`, nonserializable
`LocalLogStorageMutationToken`. The token preserves the complete selected
envelope and exact JSON allocations while replacing only the epoch/fence pair
with the checked target. Completion is historical host evidence, not stable
currentness: the token may already be revoked when returned, and every future
protected mutation must re-read and directionally compare its complete binding
inside that mutation's serialized transaction. No IndexedDB, JavaScript, Wasm,
or filesystem adapter is implemented. IDs and fence values are non-secret
correlation, and a one-shot Rust request cannot prevent a host from copying or
dispatching it twice.

The final epoch has a deliberate liveness limit. If an acquisition from
`u64::MAX - 1` commits `u64::MAX` but its terminal callback or process-local
state is lost, a restart cannot reconstruct the request identity or safely
issue the token from the stored tuple. The current epoch also cannot advance
again, so Profile V1 has no in-contract recovery path for acquiring a new
token; an already issued maximum-epoch token could still be checked by a future
append implementation.

Version `0.0.43` adds the pure, storage-neutral preparation boundary for one
append. `LocalLogStorageMutationToken::try_prepare_append` consumes one token
and one `LocalLogTailCursor`, borrows one `LocalLogEntry`, and either returns a
non-`Clone` `LocalLogStorageAppendPlan` or a typed
`LocalLogStorageAppendPreparationFailure` containing both unchanged owners. It
checks the token-selected session, checkpoint generation, active generation,
and Frame V1 policy against the cursor; encodes one exact canonical frame;
derives its checked generation-relative start and end; and admits that frame
through the existing semantic tail transition. Success quarantines the
speculatively advanced cursor together with the token and exact frame bytes in
the plan. It is not an append acknowledgement or permission to expose that
post-cursor as durable state.

IndexedDB Profile V1 now defines one chunk value as exactly one complete Local
Log Frame V1 with no trailing bytes. The fourth key component is `chunkStart`,
the frame's canonical twenty-digit, zero-padded generation-relative byte start:
the first is zero and every later start equals the preceding start plus its
complete value length. A future executable append transaction must recheck the
token's complete selected/writer binding and require storage's exact last tail
end to equal the plan start. Exact identical bytes already present at that
start may resolve as idempotent success; any different bytes, gap, overlap, or
later record fails closed. A rotation must make the same serialized tail-end
check against `acceptedPrefixBytes`, preventing an append/rotation race.

The plan performs no I/O and has no adapter request, physical-attempt identity,
terminal attestation, acknowledgement, uncertain resolver, or restart form.
Its cursor provenance remains caller-trusted, and non-`Clone` is ownership
hygiene rather than linear enforcement. One-frame records add IndexedDB record
overhead, and the profile's fixed five-store transactions still serialize all
scopes.

Version `0.0.44` adds the pure, nonempty bounded append FIFO.
`LocalLogStorageAppendPlan::try_into_queue` consumes one checked plan under
host-selected `LocalLogStorageAppendQueueLimits`. The independent defaults are
1,024 pending frames and 64 MiB of aggregate encoded frame bytes; either limit
may be zero to reject even the seed. A start failure returns the exact unchanged
plan. Success preserves its token, exact frame allocation, and speculative
cursor as the queue's distinguished head.

`LocalLogStorageAppendQueue::try_enqueue` borrows another `LocalLogEntry`, first
checks fixed-width frame-count capacity, encodes the exact next frame, checks
frame and aggregate-byte arithmetic and capacity, then advances the queue's
single final speculative cursor through the existing atomic tail transition.
Only complete success adds that exact allocation at the FIFO back and returns
an enqueue step owning the queue plus that new frame's bounded metadata and
admission outcome. Every typed failure returns the complete unchanged queue and
leaves the entry caller-owned. The queue's shared view reports exact count/byte
totals, remaining capacity, final speculative tail end, and persistent metadata
for only its immutable head. The success step's bounded causal metadata is not
an arbitrary follower view. Raw frame bytes, follower selection, removal,
acknowledgement, request egress, cursor release, and rotation remain unavailable.

One token therefore authorizes a sequential speculative prefix without becoming
a currentness claim: each future physical append must still transactionally
revalidate the full binding. A future uncertain-head lifecycle must retain
logical enqueue behind that head, but no core-issued request may expose or
authorize a follower until the head is resolved. Version `0.0.44` still has no
append adapter request, physical-attempt identity, terminal attestation,
acknowledgement, resolver, restart representation, drained owner, or transition
from that owner into rotation.
The host owns asynchronous scheduling, batching choice, admission pacing, and
cancellation; it has no permission to select, coalesce, or reorder queued
frames. The byte ceiling covers retained encoded frames only, not cursor,
session, history, replay state, or allocation overhead. Rust can drop the whole
volatile queue, but that is neither cancellation nor acknowledgement and loses
the speculative branch. Enqueue encodes its candidate before the aggregate-byte
decision, so transient peak memory can exceed that ceiling. Allocation failure,
process loss, and stale-token rebase remain outside this typed checkpoint.

Version `0.0.45` adds the process-local FIFO-head append-attempt boundary.
`LocalLogStorageAppendQueue::begin_head_append_attempt` consumes the queue into
a non-`Clone` uncertain owner before any request can cross the adapter boundary.
Its first `adapter_request` call permanently records egress, creates nominal
attempt/request correlation for one invocation and at most one append-capable
transaction, and returns one borrowed, non-`Clone` view of only the immutable
head. The request carries the complete expected mutation-fence and selected
bindings, exact current and optional predecessor selection JSON, expected
writer epoch/fence, exact head start/end/length, and the already encoded head
bytes. Raw frame and selection payloads can be copied by the adapter but are
redacted from `Debug`; no follower or final speculative cursor is exposed.

The adapter must re-observe the complete binding and exact selection bytes and
perform an exact serialized tail scan. At the target it may add only the exact
head, or recognize the same key and byte-identical final frame as idempotently
present; different bytes, gaps, overlaps, malformed records, or later records
fail closed. A request return, IndexedDB request success, or `commit()` return
is not append completion. `begin_exact_resubmission` creates a fresh attempt ID
while preserving the allocation-identical queue and head bytes. It does not
refresh a stale token, and an older request may still commit, so every retry
requires the same-key/same-bytes idempotency rule.

Logical `try_enqueue` remains available both before and after head request
egress and preserves attempt/request correlation while advancing only the
private speculative tail. No core-issued request exposes or authorizes a
follower. Version `0.0.45` deliberately added no terminal attestation,
acknowledgement, head pop, drained owner, cursor release, resolver, rotation
edge, or restart reconstruction; those remained the next implementation gate at
that checkpoint. Dropping the
owner or losing the process cannot determine whether copied or dispatched work
committed, and loses the volatile queue and correlation identities. The
existing frame/byte-limit exclusions and transient-candidate memory peak still
apply. Profile V1 exact-tail validation may scan every active-generation chunk,
and its fixed five-store scope continues to serialize otherwise independent
editor scopes.

Version `0.0.46` adds the process-local append terminal and acknowledgement
boundary without adding storage I/O. Its current host-attested terminal kinds are
`TransactionCompleted`, `TransactionAborted`, and `NotAttempted`. Completion and
abort must name the exact request emitted by the retained attempt;
not-attempted names that attempt and is legal before or after request egress.
Consuming observation validates attempt identity first and, for request-bearing
evidence, request issuance second and request identity third. Rejection returns
the complete unchanged owner and unapplied attestation. These callbacks remain
trusted profile assertions: Rust cannot authenticate the browser event or
inspect its transaction.

Matching completion produces `HeadPresent`, not an implicit queue pop. It is
valid only when the exact request's strict five-store transaction emitted
`complete` after revalidating every binding and byte-exact selection fact and
either adding the head at an absent exact tail or proving the same key and
byte-identical frame is already the final record. Request success and
`commit()` return still do not qualify. A separate consuming
`LocalLogStorageAppendHeadPresent::acknowledge_head` transition then removes
exactly that retained head without accepting a host-supplied index, key, frame,
or raw bytes. `LocalLogStorageAppendHeadAcknowledgementOutcome::Pending`
promotes the allocation-identical first follower and preserves FIFO order,
token, final speculative cursor, and limits while decrementing count/byte totals
by exactly the acknowledged head. `Drained` owns the token, final cursor, and
limits and is the only successful cursor-release boundary. Both outcomes retain
the acknowledged request identity. The token may
already be stale and must be revalidated by every later protected mutation.

`TransactionAborted` and `NotAttempted` remove nothing. Their typed states retain
the complete queue and can exact-resubmit it under a fresh attempt identity.
They close only the correlated invocation: copied request data may outlive the
negative attestation and may already be executing elsewhere. Lost terminal
callback resolution remained the next `0.0.47` gate at that checkpoint, and
there was no process-restart reconstruction of the volatile queue or IDs. The base cursor's
physical-byte provenance remains caller-trusted. `IndexedDB`
`durability: "strict"` is a hint, so `HeadPresent` is host-attested presence and
`Drained` is a resulting ownership state—not an immortal, `fsync`-equivalent,
eviction-proof, or rollback-proof durability receipt.

Version `0.0.47` adds same-process resolution when an append terminal callback
is missing. `Uncertain`, `AttemptAborted`, and `NotAttempted` owners can enter a
non-`Clone`, non-serializable `LocalLogStorageAppendResolution` without losing
their exact source provenance, queue, token, final speculative cursor, or
optional append-request ID. Each resolver invocation emits at most one borrowed
request with a fresh opaque resolution ID. The adapter request exposes the
expected selected scalar binding, writer pair, frame limits, head key/end/length, and expected
selection byte lengths, but never the private expected head bytes or selection
JSON.

Ordinary resolution evidence is applicable only after one transaction scoped
to exactly the five Profile V1 stores, opened `readonly` with no durability
option, completes after every read and full cursor scan. The stable snapshot is
scheduled after earlier overlapping writers and before later overlapping
writers, while compatible readers can overlap. Physical database absence uses
the separately correlated non-creating-open path. Evidence owns independently
normalized current selection state, the independently read head-index
transaction ID and writer pair, complete prefix boundaries, and any observed
target bytes. The current observation consumes a non-`Clone` normalized
selected root instead of accepting a mutation binding directly, and its
complete mutation binding remains core-private. This enforces the strict
normalization shape but cannot prove that the host performed a fresh
independent read; evidence remains trusted.

Rust alone derives five semantic outcomes. Clean absence at the exact valid tail
permits advisory exact resubmission only when the complete selected envelope,
canonical selection JSON, and writer pair remain exact. A byte-identical target
is positive only when it is the exact final record; a strictly later writer
epoch is allowed because it does not change that historical fact, while epoch
regression, a selected-receipt change without a strict epoch advance, or a
fence change at the same epoch fails closed. Any later record prevents
acknowledgement, and an absent target followed by a later record is a
gap/collision. Selection advance, reset, or insufficiently classifiable state
keeps the queue quarantined.

Only `HeadPresentAtResolution` can use the separate resolution acknowledgement
to remove exactly one head; only `RetryEligibleAtResolution` can resubmit it.
Logical followers may continue to enqueue during resolution without changing
the immutable head or either correlation identity. The resolver remains
host-attested and process-local: it is not executable IndexedDB I/O, callback
authentication, cancellation of copied requests, process-restart recovery,
fresh-token proof, rollback protection, or durable-media proof. A full scan is
O(number of active-generation chunks), and the fixed five-store transaction
scope can still couple otherwise independent editor scopes.

Version `0.0.48` adds `EditorEngine`, the first guarded Rust product facade.
It exclusively owns an `EditorSession` and immutable `ActionRegistry`; shared
inspection exposes the current state, session, and registry, while no mutable
session reference escapes. Every mutating method requires an exact
`EditorEngineObservation` containing a private live-engine identity, the current
`SnapshotId`, and opaque history status. Delayed browser work therefore fails
before action lookup,
decoding, planning, selection validation, replay, or history-only mutation;
`StaleEngine`, `StaleSnapshot`, and `StaleHistory` remain distinct stable categories.

`execute_action` prepares, preflights, and publishes inside one synchronous
call. Enabled work returns `EditorActionOutcome::Committed` with a sealed
`EditorEngineEvent`; expected unavailability returns
`Disabled(EditorDisabledAction)` with the action ID, reason, coherent indicator,
and unchanged observation, but drops the preparation's document-bearing base.
`set_selection` ignores an exact echo; a real guarded change clears pending
typing formats and returns a selection event over one state-only commit.
Guarded undo, redo, merge-group close, and history clear likewise return
private-constructor event kinds when effective. Commit-bearing events lend the
exact renderer transition without surrendering it for direct accidental
relabeling. Event sealing is not authorization or provenance: a host can copy a
borrowed commit through the public codec.

`EditorEngineEvent` is deliberately not `LocalLogEvent`. It preserves ephemeral
command classification and the resulting engine observation. No infallible
internal mapping to the separately sealed `LocalLogEvent` exists yet; checked
undo/redo conversion can still fail after session replay has published. A
`LocalLogEntry` additionally needs pre-reserved session/generation, sequence,
and retry identities. A future coordinator must close conversion and those
identities before publication. Version `0.1.0` instead uses atomic
session-checkpoint persistence.
`EditorEngine` adds no Wasm ABI, browser event loop, DOM projection, scheduler,
subscription delivery, or storage I/O.

Version `0.0.49` expands the base registry from four to seven actions without
expanding the primitive operation algebra. Backward and forward deletion use
exact-pinned Unicode 17.0.0 extended grapheme boundaries across formatting
runs, join adjacent paragraphs at structural edges, and keep distinct merge
groups. `delete-selection` is the independent-history document mutation half
of cut; clipboard acquisition, write success, and ordering remain host work.
Directional deletion delegates every extended range to that same planner.
Host-supplied carets inside a grapheme are disabled instead of snapped; a join
or text deletion that forms a grapheme across the removed seam directionally
snaps its core-produced caret to a valid cluster boundary.

`insert-plain-text-input@1` converts CRLF, CR, and LF into paragraph boundaries
and uses one `RootTextReplace` for same- and cross-paragraph selections. It
preserves all other scalars, applies one inherited format set to non-empty
inserted lines, clears pending typing formats, and requests independent
history. A session creates one undo step only when canonical execution retains
a document operation; an exact replacement may be selection-only. Input is
capped at 65,536 bytes/code units and 10,000 paragraphs, with active document
limits allowed to be smaller. This is the paste primitive; the older
`insert-text-input@1` continues to treat newlines as literal inline text. A
truthful soft break remains deferred until the AST has an inline break node.

Version `0.0.50` adds the first [Wasm boundary](docs/WASM_ABI.md) as a separate
crate with no DOM or browser imports. Only Rust-created live observation handles
contain the private engine/history token, and it is never serialized. Every
command first rejects a stale observation, then the authoritative
`EditorEngine` repeats the guard immediately before mutation. The initial ABI
covers the complete base action input shapes (none or bounded string),
undo/redo, and effective history controls; it is deliberately not a generic
Wasm plugin protocol. Construction, commands, and codec reads return stable
payload-redacting result objects.
Commit/state/checkpoint encoding remains separate from mutation publication so
an output-limit failure cannot make a published edit look rejected. A checked
finite integer history capacity is capped at the checkpoint profile's `100`
entries. The exact `wasm-bindgen`-generated TypeScript declaration is reviewed
and reproducibly compared by `scripts/check-wasm-api.sh`. At that checkpoint,
DOM projection, selection mapping, event timing, composition, clipboard, and
persistence I/O remained later browser-layer work.

The Rust crate remains a repository-internal implementation package rather than
a crates.io release. Version `0.0.58` packages its reviewed generated boundary
as an independently installable `@breditor/wasm` npm tarball.

Version `0.0.51` adds the [DOM projection contract](docs/DOM_PROJECTION.md).
`CheckpointedEditorEngine` runs every effective mutation against a private
same-identity candidate and publishes only after Session Checkpoint V1 encoding
succeeds. Failure preserves the exact prior state, history, cached canonical
checkpoint, and observation. The Wasm boundary now exposes guarded flattened
semantic projections and commit-derived `none`, `textContainers`,
`rootSplice`, or conservative `root` invalidation without importing DOM APIs.

The private `@breditor/browser` workspace package validates and consumes that
view, then renders the closed base schema using only `<p>`, `<strong>`, `<br>`,
and text nodes. Host, paragraph, and text nodes receive private snapshot-local
AST mappings; wrapper and placeholder nodes do not impersonate AST nodes.
Narrow updates are independently verified before identity reuse, affected text
paragraphs retain their `<p>`, root-splice suffix paths are rebound, and DOM
drift falls back to a complete safe render. This adds no persistent node IDs,
selection mapping, event loop, contenteditable ownership, or extension renderer
protocol. Effective command admission is currently linear in the complete
session-checkpoint size and retains a transient candidate plus encoded bytes.

Version `0.0.52` adds the [selection mapping contract](docs/SELECTION_MAPPING.md).
Rust exposes one guarded, one-shot semantic selection view and separate
checkpoint-admitted range-set and clear commands. Endpoint node indexes are the
matching projection's ephemeral preorder coordinates; anchor/focus direction,
UTF-16 scalar boundaries, affinities, and derived range order cross without
selection JSON. All mutating scalar fields reach Rust as opaque JavaScript
values, preventing raw-glue numeric and string wrapper coercion before exact
primitive admission.

The browser package adds immutable projection-bound ranges plus an exact
light-DOM bridge. It synchronously revalidates the full rendered DOM, maps
strong wrappers and empty-paragraph placeholders without pretending they are
AST nodes, supports only exterior host boundaries for select-all, preserves
backward direction, and consumes a generation-bound spatial echo receipt only
once. Focus and blur remain separate browser state: mapping never steals focus,
blur does not clear the Rust selection, and clearing this editor never erases a
selection wholly outside its host. Cross-host, shadow-root, multi-range, and
noncanonical cases fail closed. Selection reads and DOM validation remain
linear in the bounded document; input events and composition were still later
checkpoints at `0.0.52`.

Version `0.0.53` adds the
[browser event pipeline contract](docs/BROWSER_EVENT_PIPELINE.md). The browser
layer reduces owned `beforeinput`, keyboard, `input`, and clipboard signals to
bounded immutable command requests carrying an exact captured semantic
selection and a private one-use delivery token. It recognizes only the base
text, paragraph, deletion, strong, and history intents; unsupported edits fail
closed, keyboard events never supply text, and composition was delegated at
that checkpoint.

A synchronous bounded FIFO serializes requests without recursive execution and
permanently quarantines later work after executor or observer uncertainty.
One-use receipts suppress matching keydown/beforeinput/input and clipboard
echoes so one physical edit cannot become two Rust commands. Native target
ranges are immediately normalized into projection/generation-bound semantic
ranges and never retained.

The Wasm command adapter exclusively owns the current observation, projection,
renderer handle, and shared selection bridge. It synchronizes selection,
applies an optional history boundary, executes one semantic command, validates
the exact successor and projection update, restores canonical DOM and the core
selection, and frees every generated handle before returning a handle-free
notification. Valid published successors survive DOM-write failure for explicit
full-render recovery; malformed, stale, aliased, or uncertain results fault the
adapter. At this historical checkpoint clipboard mutations remained staged;
`0.0.55` replaces that staged command variant with a guarded browser clipboard
owner. The multi-stage engine sequence is serialized but cannot roll back a
selection/history prestage when a later action fails.

Version `0.0.54` adds strict composition/IME ownership to the same
[browser event pipeline contract](docs/BROWSER_EVENT_PIPELINE.md). A dedicated
composition controller requires a queue built from the exact stable Wasm
adapter executor, captures one canonical light-DOM range, and reserves both the
queue and adapter before yielding one paragraph to native mutation. Ordinary
event, toolbar, API, observer, and reentrant commands remain blocked for the
whole lease.

Composition events are reduced to bounded text evidence across explicit,
implicit, reconversion, and a narrow set of active mobile-shaped alias orders.
At a later task boundary, strict reconciliation accepts only text and
property-free strong structure in the target paragraph and exact unchanged
surrounding content. The temporary DOM is never authoritative: the adapter
first full-renders its retained Rust projection and restores the captured
selection, then uses the exact queue lease for one plain-text insertion,
selection deletion, or cancellation history-close command. Each committed or
cancelled settlement closes the prior merge group; abort recovery does not call
Rust or alter history.

Foreign, stale, refined-away, and replayed capabilities cannot settle or release
ownership. A lost renderer lease, disconnection, or failed strict restore enters
quarantine; exact-token recovery discards temporary DOM and restores the
authoritative projection without calling Rust before ordinary work can resume.
The current implementation is limited to one range and one paragraph in a
connected light-DOM host. It has no cross-block, shadow/composed-range,
multi-range, arbitrary-IME-markup, or general mobile support claim; the real
Chromium, Firefox, and WebKit matrix is now an automated `0.0.59`
release-candidate gate. Its scope and remaining manual IME limits are recorded
in the [browser support and accessibility gate](docs/BROWSER_SUPPORT_AND_ACCESSIBILITY.md).

Version `0.0.55` adds the [clipboard contract](docs/CLIPBOARD.md). A dedicated
controller reserves the idle queue built from the same captured adapter
executor before touching native
clipboard capabilities. Copy slices the semantic projection rather than DOM
markup. Cut clears and writes both plain text and escaped base-subset HTML,
confirms native cancellation, and only then submits one selection deletion.
Paste gives advertised plain text precedence; HTML is read only when plain text
is absent, must pass a bounded parse5 tree allowlist, and is flattened before
one atomic multiline plain-text insertion.

Native clipboard objects never enter engine commands or echo receipts. Admitted
paste text deliberately becomes the bounded string-action payload and is
visible to the synchronous queue executor and any application queue observer.
A committed cut or paste can suppress one exact optional `beforeinput`/`input`
echo without executing twice. Clipboard and Rust state do not share rollback,
so known failures choose no-delete/no-insert behavior and uncertain post-command
failures require canonical reconciliation. At this checkpoint, async clipboard
access, arbitrary rich content, a unified event router, and real browser
interoperability remained later work. Version `0.0.58` now supplies the unified
router; the async Clipboard API and broader rich-content formats remain outside
the first release. The `0.0.59` Playwright matrix now exercises the synchronous
clipboard-event subset in Chromium, Firefox, and WebKit; it does not claim OS
clipboard permissions or async Clipboard API behavior.

Version `0.0.56` adds the [toolbar and action-state contract](docs/TOOLBAR.md).
The Wasm engine owns one frozen base catalog and synchronous cache for Bold,
Undo, and Redo. `actionStates(expected)` is guarded by the complete engine
observation and returns a disposable complete snapshot classified as full,
unchanged, or delta. The browser boundary validates correlation, canonical
ordering, status/value coherence, bounded typed value JSON, and generated
handle uniqueness before publishing a deeply frozen handle-free value.

`BreditorActionStateStore` retains the last valid complete snapshot, rejects
invalid transitions without erasing it, exposes fresh/stale/unavailable/terminal
status, and notifies synchronous subscribers in stable non-recursive order.
Stale display data cannot admit a toolbar command. Document `selectionchange` is now explicit queue
work: a real in-host range synchronizes Rust selection, while absent or outside
ranges remain focus observations and do not clear the semantic selection. A
toolbar invocation uses the complementary `preserve` policy, so pointer or
keyboard focus in the toolbar cannot replace the editor range before Bold,
Undo, or Redo executes.

The presentation layer is Breditor's own bounded, immutable, callback-free
manifest rather than a ProseMirror-style plugin protocol. It renders native
buttons in an owned inner toolbar root with roving focus, fresh availability,
tracked pressed/mixed state, and exact synchronous dispatch outcomes. Keyboard
activation restores the same toolbar button after a command. Custom manifests can reorder or describe additional
controls when a host supplies matching state and command implementations, but
the distributed Rust/Wasm catalog itself remains the three base controls.
Dynamic JavaScript action registration, styling/icons, menus, asynchronous
delivery, and full assistive-technology certification remain later gates. The
`0.0.59` candidate adds cross-browser keyboard/focus/ARIA assertions and an
automated axe scan, neither of which by itself certifies WCAG conformance or
screen-reader behavior.

Version `0.0.57` adds the executable
[single-slot IndexedDB session-checkpoint profile](docs/SESSION_CHECKPOINT_STORAGE.md).
The browser consumes bounded Session Checkpoint V1 strings without exposing
generated handles, restores engines through strict Rust decode, and stores one
digest-checked atomic replacement behind an opaque full-record compare-and-swap
token. Schema/version mismatch, corruption, conflict, quota, abort, connection,
generation, and digest failures stay explicit and payload-redacted.

Autosave observes the command adapter's exact adopted-core-commit boundary,
not queue success. It therefore marks selection/history prestages and valid
commits that later require DOM reconciliation. A trailing/max-latency
coordinator coalesces dirtiness, permits only one save, gives each `flush()` an
exact epoch, and pauses until explicit retry after any failure. A bounded
microtask status feed exposes that pause and its stable payload-free underlying
failure code to application UI. Temporary
composition or engine ownership defers capture; terminal adapter loss fails
instead of polling. The first persistence product remains one best-effort local
checkpoint, not the proof kernel's ordered local log, merge, authenticated
storage, rollback defense, or cross-device sync.

Version `0.0.58` establishes the public framework-neutral browser owner, React
reference integration, and publishable distribution foundation. The owner
boots the reviewed Wasm engine, restores or creates one session, installs the
renderer, selection bridge, FIFO, unified composition/clipboard/ordinary event
router, guarded action-state store, optional toolbar, and optional autosave as
one all-or-nothing lifetime. Runtime status is immutable and observable;
native-router, queue, reconciliation, toolbar-dispatch, and toolbar-presentation
uncertainty fault editing closed without discarding a validated Rust commit.

Breditor is dual-licensed under `MIT OR Apache-2.0`; the Rust manifests and both npm
packages carry the same SPDX expression and every package tarball contains both
license texts. `@breditor/wasm` is generated from the locked release build with
exactly `wasm-bindgen 0.2.127`, exposes the reviewed ESM declaration and adjacent
Wasm module, and is checked by real initialization. Both workspace packages
clean their output before building. The browser build deliberately omits
declaration maps because its TypeScript sources are not shipped, avoiding dead
`../src` links in the public tarball, and retains supporting declarations that
occur in exported public method contracts. An isolated smoke test packs and
installs both tarballs, imports and initializes them outside the workspace, and
type-checks a consumer program. No npm publication is performed by these
commands.

Version `0.0.59` is the release-candidate validation checkpoint. It adds
`exportContent("documentJson")`, which obtains exact canonical,
lossless `breditor/document@1` bytes from the guarded Rust/Wasm engine, and
`exportContent("plainText")`, which joins authoritative semantic paragraphs
with LF separators while discarding formatting. Both results report their
UTF-8 byte length and exact document snapshot; busy, uncorrelated, malformed,
and terminal reads fail closed without falling back to editable DOM.

The candidate also adds a no-skip Playwright matrix for Chromium, Firefox, and
WebKit using the generated Wasm and public browser runtime; a tarball-only
consumer that imports, type-checks, bundles, and initializes the packages in a
real Chromium page; and explicit package, Wasm, declaration, and React-example
[size budgets](docs/SIZE_BUDGETS.md). The browser scenarios and accessibility
claim boundaries are documented in the
[browser support and accessibility gate](docs/BROWSER_SUPPORT_AND_ACCESSIBILITY.md).
The complete `0.0.59` validation gate has passed. The feature-free final
`0.1.0` compatibility freeze and release notes remain separate work.

## Development

```sh
export WASM_BINDGEN_BIN=/absolute/path/to/wasm-bindgen
export WASM_BINDGEN_TEST_RUNNER_BIN=/absolute/path/to/wasm-bindgen-test-runner
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --all-features --no-deps --locked
./scripts/check-wasm-tests.sh
npm ci
npx playwright install
npm run check:size
npm run typecheck
npm run typecheck:browser
npm test
npm run test:browser
npm run check:wasm-package
npm run smoke:packages
./scripts/check-wasm-api.sh
```

Breditor is available under either the MIT License or Apache License, Version
2.0, at your option. See `LICENSE-MIT` and `LICENSE-APACHE`.
