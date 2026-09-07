# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

Version `0.2.0-alpha.1` compiles the built-in base schema from a private,
declarative definition and introduces durable `SchemaFingerprint` plus
collision-free process-local proof identity. Version `0.2.0-alpha.2` completes
the Rust-core durable-binding checkpoint: strict public fingerprint parsing, an
owned selector-and-fingerprint binding, and separate V2 codecs for Document,
Operation, Transaction Request, Editor State, Commit, Session Checkpoint, Local
Log Entry, Local Log Checkpoint, Local Log Frame, Storage Root, and Storage
Generation. The binding is retained through recovery, continuation, V2 tail
admission and compaction, root/generation preparation, and selected-storage
normalization. Existing V1 codec types and bytes remain exact-base-only, and
mixed V1/V2 nesting fails closed. V2 publication-attempt entrypoints are
deliberately deferred; the existing publication typestate remains V1-only.

Version `0.2.0-alpha.3` adds the sealed public base-text extension compiler.
`ExtensionManifest` now owns canonically ordered `InlineFormatSpecV1`
declarations with independent nonzero `PersistedTypeRevision` values.
`CompiledSchema::try_compile_base_text_profile` combines one resolved
`ExtensionSet` with a caller-owned non-`breditor/*` `SchemaId`, preserving the
base document/paragraph/text shape while admitting up to 255 additional
property-free formats. The compiled schema fingerprint includes each admitted
kind and revision but excludes its manifest owner and extension version.

The separate `SchemaAdmissionRequest` boundary borrows a checked source
checkpoint and prepares a new-lineage, empty-history target anchor together with
exact canonical Local Log Checkpoint V2 JSON. A V2 Storage Root can be prepared
from that result without treating validation as storage publication. Admission
does not transform content, mutate the source, perform storage I/O, or prove
authenticity, freshness, durability, compare-and-swap, or writer authority.
Arbitrary schema construction remains staged, but all four existing primitive
operations now accept compiler-minted sealed base-text schemas and preserve
their extension formats. The public `ToggleInlineFormatAction` can be
explicitly registered for one admitted format; it is not automatically added
by schema compilation, and the complete profile/action/intent compiler remains
staged. The browser and Wasm ABI 2 remain V1-only during alpha.3. See the
[extension architecture](../../docs/EXTENSION_ARCHITECTURE.md),
[`0.2.0` scope](../../docs/V0_2_SCOPE.md), and exact
[schema fingerprint contract](../../docs/SCHEMA_FINGERPRINT.md) and
[durable binding contract](../../docs/DURABLE_SCHEMA_BINDING.md).

The current crate exposes immutable validated documents with cached exact
measurements, the fixed base schema used by the first proof, strict versioned
document, singular guarded-operation, exact-base transaction-request,
contextual complete editor-state, replay-proved commit, and bounded durable
session-checkpoint plus replay-identified local-log-entry JSON codecs and
bounded atomic recovery of one supplied genesis-anchored log prefix plus a
compact runtime anchor, checked batch or recoverable one-observation successor
admission with fixed cumulative budgets, repeated cumulative compaction, and a
strict trusted-scope local-log-checkpoint JSON codec plus a checksummed,
platform-neutral one-entry binary frame encoder and allocation-free borrowed
scanner plus an owner-derived active-tail cursor with atomic semantic/physical
progress and recoverable cursor compaction, plus six bounded storage
identity/version values, distinct database/scope incarnation IDs, strict root
and storage-generation codecs, trusted root/rotation selection normalization,
byte-exact selected-envelope retention/comparison, and selected-root-aware
next-rotation preparation/encoding/decoding, plus exact root/rotation attempt
preparation, non-`Clone` `Prepared`/`Uncertain` state, core-issued process-local
attempt identities, one-shot borrowed request views, exact resubmission, typed
physical terminal states, and request-correlated root and rotation resolution,
plus exact mutation-fence comparison/planning and a nominally separate
request-correlated writer-fence acquisition lifecycle that can issue a
revocable process-local mutation token, plus pure token-and-tail-cursor
single-frame append planning and a nonempty bounded FIFO with one final
speculative cursor and an exact ordered pending prefix, plus a process-local
uncertain FIFO-head attempt with one-shot borrowed exact request egress, exact
resubmission, logical enqueue behind the head, request-correlated transaction
terminal classification, and an explicit consuming one-head acknowledgement,
plus a source-preserving, request-correlated same-process append resolver with
closed physical observations, exact retry/presence outcomes, enqueue while
resolving, and a nominally separate one-head acknowledgement family,
UTF-16-safe points and
selections, paragraph-local text splices, atomic transactions, direct-root
paragraph split/join operations, proof-backed local
validation for sealed base-text edits, structural relocation, heterogeneous
change notifications, guarded root-text range replacement with a closed
same-type inverse, exact in-memory undo/redo requests, an immutable typed
action registry, a frozen semantic intent router, and seven base actions:
inline and structural plain-text insertion, paragraph break, grapheme-aware
backward and forward deletion, exact selection deletion, and strong-format
toggle, plus the configurable Rust-owned `ToggleInlineFormatAction` for an
explicitly registered property-free format. Registry
preparation is the authoritative integration path for semantic capability and
execution: it preflights and caches an exact transaction result against one
immutable state.
Intent routing layers explicit priority, disabled fallthrough/block policy, and
unhandled/blocked/prepared outcomes over that same path without accepting
browser-event syntax. Actions produce activation and typed observable values in
that same evaluation, and a frozen catalog derives immutable direct, routed,
undo, and redo state batches without retaining executable preparations. A
synchronous single-observation cache keys complete state plus exact history,
coalesces exact duplicate sources, and emits bounded local
full/unchanged/delta updates. A synchronous `EditorSession` owns exact commit
publication plus bounded deterministic linear undo/redo history and an opaque
history-observation stamp. `EditorEngine` combines one such session with one
frozen action registry behind complete engine-instance/state/history observation guards and
sealed action, selection, undo, redo, and history-boundary event results; no
mutable session, executable preparation, or owned raw commit escapes that
product facade. The strong-format action is the first
toolbar-shaped control: it reports inactive, active, or mixed state, toggles
explicit pending formats at a caret, performs one guarded same-paragraph splice
for a local extended selection, and uses one guarded root-text replacement
while preserving every selected paragraph boundary for a cross-paragraph
selection. The typed text-insertion action consumes that pending override,
inherits deterministic context otherwise, replaces one exact direct-root text
range, and offers adjacent edits to the `breditor/typing` history group.
Same-paragraph insertion stays on the local splice path, while
cross-paragraph type-over uses one guarded root-text replacement.
Atomic plain-text insertion converts CRLF/CR/LF into structural paragraphs with
one root-text replacement. Grapheme-aware backward and forward deletion share a
dedicated exact-selection planner while preserving directional splice/join
paths and merge groups for collapsed carets.
Cross-paragraph paragraph breaks use the same atomic primitive with two empty
replacement fragments, preserving the retained boundary text as two distinct
paragraphs without a delete/split intermediate.
Operation records retain exact optimistic guards and pass checked constructors
plus active-context limits, but deliberately carry no snapshot, ordering,
selection, metadata, deduplication identity, or transaction boundary. The crate
is intentionally smaller than the eventual editor runtime and has no
action-state subscription/delivery layer, presentation manifest, browser
scheduler,
automatic extension action/intent compilation, formatting attributes, log
storage and tail-wide recovery orchestration,
checkpoint/log atomic replacement, storage-generation publication or initial
scope provisioning, executable append I/O, process-restart append
reconstruction,
collaboration transform, or Wasm adapter yet.
The intentionally narrow browser release promise is tracked separately in
[`docs/V0_1_SCOPE.md`](../../docs/V0_1_SCOPE.md).

Checkpoint-linked one-observation admission is synchronous and in-memory. A
typed rejection returns the unchanged active owner and exact rejected entry, so
the caller can retain and retry it after relevant prerequisites change, or
construct another entry without reconstructing the checkpoint. Fresh genesis
is still a complete-vector boundary; an empty genesis generation can be
compacted to bootstrap only this in-memory successor-admission path, not a
storage scope, authoritative head, or first storage-generation manifest. The
core does not schedule, persist, flush, or rate-limit attempts. Append
acknowledgement is a pure ownership transition driven by a trusted profile
terminal attestation; the core neither performs nor authenticates the physical
transaction. Its append FIFO is synchronous process-local speculative
ownership, not an asynchronous browser work queue.

Framed successor observation can instead begin from a checkpoint anchor at
generation-relative byte offset zero. The cursor fixes one frame policy and
derives its context, session, and generation binding from the owned semantic
log. Each consuming call scans and admits at most one frame; applied events and
exact semantic duplicates both advance the byte offset, while clean end,
truncation, corruption, decode failure, and admission rejection do not. The
caller still owns storage and asserts that the supplied slice begins at the
reported offset.

The same cursor can compact through the inherited replay-tombstone policy or
through the explicitly named
`try_into_checkpoint_anchor_with_compaction_limits` reauthorization edge. A
typed failure returns the complete unchanged cursor. Success returns one
`LocalLogTailCompactionOutcome` that keeps the next checkpoint anchor together
with the old generation's accepted-prefix length and retained
`LocalLogFrameLimits`. Those values are runtime metadata, not Local Log
Checkpoint V1 fields, physical tail length, byte provenance, durability, or
proof of EOF; the Frame V1 policy is not a selector for future frame versions.
Successful compaction is explicit host authorization to stop admitting that
generation and may abandon an unobserved suffix, including an incomplete frame
prefix. Starting the returned anchor's successor selects new recovery and frame
limits explicitly, derives a new generation binding, and resets its relative
offset to zero.

Version `0.0.32` implements the value and codec-validation subset of the
[storage-generation transaction specification](../../docs/STORAGE_GENERATION_TRANSACTION.md).
The crate exports six bounded storage identity/version values, a trusted
ordinary-rotation binding, a private-constructor non-`Clone` manifest,
independent complete-input, canonical-output, and decoded-`checkpointJson`
limits, and `LocalLogStorageGenerationJsonCodec` with separate strict
`prepare_rotation`, `encode_rotation`, and `decode_rotation` operations.
Preparation borrows both the compaction outcome and caller inputs, so its result
is inspection data and does not quarantine or release the anchor. Rotation
decode requires a separately trusted binding and an already validated prior
manifest, enforces locally provable continuity, and accepts only exact canonical
nested Checkpoint V1 and outer manifest bytes.

This remains rotation-only: there is no public seed/bootstrap constructor. The
crate performs no storage I/O and exports no writer capability, adapter,
terminal commit/noncommit receipt, head compare-and-swap, durability assertion,
or writable successor owner. Validation
cannot prove that the prior was authoritative, that an ID or fence is fresh,
or that the physical successor is empty. The implemented validation-only
`breditor/local-log-storage-generation@1` shape remains an experimental
repository-internal format outside the `0.1.x` browser compatibility promise.
Local Log Checkpoint V1 and Frame V1 remain unchanged.

Version `0.0.33` adds no Rust storage API. It freezes the separate
[IndexedDB local-log profile](../../docs/INDEXEDDB_STORAGE_PROFILE.md),
including a distinct initial-root format, current-selection normalization,
database/scope incarnations, exact current and immediate-prior selection
records, identity tombstones, empty-generation reservation, uncertain-outcome
resolution, revocable per-mutation writer epochs, and generation-payload
reclamation.

Version `0.0.34` implements only that profile's deterministic value and codec
boundary. `LocalLogStorageDatabaseIncarnationId` and
`LocalLogStorageScopeIncarnationId` are distinct bounded syntax types.
`LocalLogStorageRootJsonCodec` separately prepares, encodes, and strict-decodes
a private-constructor non-`Clone` root selection. Trusted selection-receipt and
generation bindings feed `LocalLogStorageSelectedJsonCodec`, which normalizes
either one root or one current rotation plus its exact immediate predecessor
into a private-constructor non-`Clone` `LocalLogStorageSelectedRoot`. That
selected value privately owns the decoded checkpoint anchor, exposes only
inspection facts, excludes mutable writer epoch/fence state, and supports
strict next-rotation `prepare_rotation_from_selected`,
`encode_rotation_from_selected`, and `decode_rotation_from_selected` without a
retained manifest chain.

Version `0.0.35` makes that normalized value an exact selected identity
envelope. `LocalLogStorageSelectedRoot` retains the complete checked selected
binding, the byte-exact canonical current selection, and the byte-exact
immediate predecessor when the selection is a rotation. Its public API exposes
borrowed current/predecessor receipt bindings and exact selection byte lengths,
but raw retained selection JSON stays core-private. The separate public
`validate_exact_selection_envelope` action compares caller-supplied UTF-8 bytes
without parsing or reinterpretation. Its typed errors and the selected root's
`Debug` omit raw selection/checkpoint JSON, document content, and session-state
payloads. `Debug` may still show bounded identity values such as the session
ID. Retained selection receipt bindings remain caller-supplied validation
facts, not commit evidence.

The O(1) claim is only with respect to rotation-history length. Rotation
normalization still processes bounded current/immediate-predecessor JSON and
strictly decodes both nested checkpoints; the current checkpoint is decoded
again to retain its anchor. The selected root also retains up to two complete
canonical selection envelopes, each of which may embed a full checkpoint. CPU
and retained memory can therefore scale with those byte ceilings and the
document/session content represented by both checkpoints. Version `0.0.35`
adds no storage-attempt state or evidence.

Version `0.0.36` adds private-constructor, non-`Clone` exact-attempt state.
`LocalLogStorageRootJsonCodec::prepare_root_attempt` closes a checked root
selection together with explicit database and planned scope incarnations.
`LocalLogStorageGenerationJsonCodec::prepare_rotation_attempt` closes a checked
candidate manifest against a normalized selected root. Each action retains a
complete prospective candidate `LocalLogStorageSelectedBinding` and exact
canonical candidate JSON only after a final strict selected normalization;
the temporary candidate selected root and checkpoint anchor are then dropped.
The rotation plan also snapshots the complete prior selected binding and
`Arc`-shares its exact current/optional-predecessor JSON. It does not retain the
input selected root or its anchor.

`LocalLogStoragePreparedAttempt` exposes candidate facts and exact payload byte
lengths while keeping payload bytes behind the attempt boundary. Its consuming
`begin_attempt` issues a fresh core-created, opaque, ABA-safe process-local
`LocalLogStorageAttemptId` and enters `LocalLogStorageUncertainAttempt` before
payload egress. The uncertain value yields one borrowed
`LocalLogStorageAttemptRequest`; root requests expose the candidate binding and
JSON, while rotation requests also expose the snapshotted selected binding and
exact selected current/optional-predecessor JSON. Request/state/error `Debug`
is payload-redacted. This request surface is the narrow public raw-byte
exception; direct retained-JSON getters on `LocalLogStorageSelectedRoot` remain
core-private.

Consuming `begin_exact_resubmission` preserves the plan allocations and exact
bytes, installs a fresh attempt ID, and restores one-request eligibility.
`require_current_attempt_id` rejects cross-plan and stale retry IDs but produces
no commit/noncommit classification. Attempt IDs and states are process-local
and not serializable or restart-recoverable. The one-shot borrowed request does
not stop callers from copying its bytes or dispatching duplicate external
operations.

Version `0.0.37` adds a process-local terminal host-attestation boundary. Each
emitted request exposes a clonable opaque
`LocalLogStorageAttemptRequestId`; only that request-issued token can construct
`PublicationCompleted` or `TransactionAborted`, so the safe API cannot create
those attestations before request egress. `PublicationCompleted` is a trusted
host assertion that the exact request-correlated publication transaction
passed every independent check, enqueued the complete exact mutation set, and
emitted its terminal `complete` event. A bare resolver, cleanup, validation-
only, or idempotent no-write transaction completion does not qualify.

Consuming `observe_terminal_attestation` validates the exact request/attempt
correlation. It produces historical `LocalLogStorageHostAttestedCommitted`,
physical-only `LocalLogStorageAttemptAborted`, or physical-only
`LocalLogStorageNotAttempted`. Rejection returns the complete unchanged state
and unapplied attestation. Commit evidence cannot resubmit; abort and not-
attempted retain the exact plan and can resubmit under a fresh attempt ID.
One attempt ID names one adapter invocation and at most one associated
publication transaction. A copied dispatch is outside that correlation and
must be classified by future serialized storage resolution, not a second
terminal callback.

Attempt-plan retention is O(1) only in history count. A root retains one
payload envelope; a rotation can retain the candidate, selected current, and
optional selected predecessor—up to three complete envelopes containing
checkpoints. The crate still has no IndexedDB, JavaScript, Wasm, filesystem, or
other storage adapter; performs no I/O; provisions no
database/scope/head/generation; and proves no CAS, head currentness, lifetime ID
or fence freshness, empty generation, writer authority or epoch, host-event
provenance, plan-level noncommit, durability, or ownership release. Historical
commit exists only as a trusted host attestation. Exact bytes, selected
bindings, and ID matches are not storage authority.

Version `0.0.38` adds two directional resolver-comparison primitives and the
closed retired-transaction shape. A later observation of the same selected
binding must keep every receipt and immutable generation fact exact; the only
accepted change is checkpoint cleanup from `Retired` to `Reclaimed`. A prior
active generation can separately validate an exact retired/reclaimed successor
under one supplied retiring head. `LocalLogStorageRetiredTransactionBinding`
contains database/scope identity, transaction/head identity, selection kind,
and stored byte length—never profile/session facts or bytes absent from the
tombstone. Matching length screens collisions but cannot attest byte equality.

On their own these APIs compare caller-supplied typed values only. They do not
observe IndexedDB, compare exact current/predecessor JSON, validate index/range
completeness, or authenticate a resolver transaction's terminal event.

Version `0.0.39` adds a non-`Clone`, root-only resolver over surviving
`Uncertain`, `AttemptAborted`, `NotAttempted`, or `HostAttestedCommitted` state;
rotations fail recoverably at the start boundary. Its one borrowed request
mints an opaque process-local `LocalLogStorageRootResolutionRequestId` only at
egress. `LocalLogStorageRootResolutionEvidence::transaction_completed` is a
trusted host assertion that the exact request's fixed-scope serialized
transaction emitted terminal `complete` after every read and cursor scan.
Request success, `commit()` return, abort, callback loss, or unrelated
completion classifies nothing.

An actually absent database cannot create that fixed-scope read transaction.
It therefore uses `database_open_absent`, restricted to a versionless open that
reported `oldVersion == 0`, synchronously aborted the upgrade, and then emitted
terminal open-request `error`. An existing database with a different meta
incarnation still uses transaction-completed evidence when that metadata is
otherwise valid. A schema-compatible database without `meta/profile` also uses
that path: it is reset/indeterminate only when all five stores are empty; any
record in any store without valid profile metadata is collision/corruption.

`apply_resolution_evidence` rejects pre-egress and stale/cross-request evidence
without classification and returns the unchanged resolver plus evidence.
`restart_resolution` preserves the exact source state, plan allocations, and
candidate bytes while clearing only resolver correlation; its next request ID
is distinct and old evidence is stale. Neither mechanism survives a process
restart or reconstructs a lost plan.

The closed outcomes are exact selected commit, immediate-predecessor commit,
retired identity, advisory clean-absence retry, another valid scope, collision
or corruption, and storage reset or indeterminate. Clean planned-scope absence
can become `RetryEligibleAtResolution` only for a non-host-committed source;
with `HostAttestedCommitted`, absence or a different valid scope becomes
`StorageResetOrIndeterminate` and never retry authority. Physical database
absence, a different valid metadata incarnation, or an all-five-stores-empty
compatible database without `meta/profile` is reset/indeterminate for every
source. Any record without valid profile metadata, or an expected scope that
still exists while its append-only candidate/index association is missing, is
`CollisionOrCorruption`. A retired candidate also requires its direct-successor
edge. When that successor is still the exact current predecessor, strict
selected normalization privately retains its byte-derived sealed log ID and
frame, which must equal the root plan's active generation; there is no extra
host-supplied scalar assertion. When the successor is itself retired, its
Profile V1 tombstone has no JSON or sealed-generation fields, so the resolver
proves only retained transaction/head identity, its head-index mapping, and the
planned active generation's matching `retiredBy` link—not the discarded
successor contents. Equal candidate tombstone length still does not attest the
old candidate bytes.

Only retry eligibility exposes exact resubmission, preserving the plan under a
fresh attempt ID. It is advisory once the read transaction ends: copied bytes
can still publish later, so every attempt must repeat comparison and authority
checks. All other outcomes are non-retry classifications and release no writer,
checkpoint anchor, or semantic owner. The crate still performs no storage I/O
and cannot authenticate host events, prove durable or present currentness, or
release a long-lived exclusive Rust writer. Crash-time plan reconstruction
remains unimplemented, and these storage formats remain experimental
repository-internal contracts outside the `0.1.x` browser compatibility
boundary.

Version `0.0.40` adds the nominally separate rotation resolver over the same
four surviving attempt sources. Its separate request identity is minted at
egress; pre-egress or stale evidence is returned with the unchanged resolver,
and restart preserves the in-memory plan while clearing correlation. In an
intact expected scope, clean candidate absence is advisory
`RetryEligibleAtResolution` only for an uncertain, aborted, or unattempted
source and only while the exact snapshotted prior selected envelope remains
current. Candidate transaction, committed-head index,
candidate active-generation key, and the complete candidate active-generation
chunk prefix must all be absent. The same absence after
`HostAttestedCommitted` is `CollisionOrCorruption`; one exact direct competing
rotation is
`DefinitelyNotCommittedConflict` only for the three non-host-committed sources.
Rotation never yields root-only `ScopeAlreadyProvisioned`.

Positive classifications validate branch-specific exact selection bytes,
generation transitions, head indexes, and required older tombstones. Retired
resolution distinguishes an exact direct successor, whose normalized bytes
privately supply the sealed log ID/frame check, from an already-retired
successor whose tombstone can prove only retained transaction/head/index facts
and the candidate active generation's retirement link. Only retry eligibility
can exact-resubmit. This remains a pure-Rust, process-local classification
boundary: the crate still has no adapter, browser-event authentication,
durability, stable writer authority, process-restart reconstruction, arbitrary
far-later conflict classification, or ownership release.

Version `0.0.41` adds the pure Rust writer-fence comparison and acquisition-
planning boundary. `LocalLogStorageWriterEpoch` accepts only the shortest
unsigned ASCII decimal representation of a nonzero `u64`, never wraps, and
provides checked succession. A cloneable
`LocalLogStorageMutationFenceBinding` snapshots the complete selected binding,
`Arc`-shares its exact current and optional predecessor JSON, and records one
observed writer epoch/current-fence pair. `compare_later_observation` keeps the
exact JSON and writer pair unchanged while reusing the directional selected-
binding rule: `Retired -> Reclaimed` checkpoint cleanup is accepted and
`Reclaimed -> Retired` is rejected. Structural `Eq` remains stricter than this
directional comparison.

Consuming `try_prepare_writer_fence_acquisition` derives exactly the next epoch
and returns a non-`Clone` `LocalLogStorageWriterFenceAcquisitionPlan` only when
the proposed fence differs from the current fence. Epoch exhaustion takes
precedence, and its typed failure retains the complete unchanged binding and
proposed fence. `u64::MAX - 1 -> u64::MAX` is valid; an epoch-maximum binding
can still be compared for a future append token, although no later acquisition
or rotation can advance it.

The binding and plan expose byte lengths rather than raw selection JSON, and
their diagnostics omit retained JSON payloads. They provide no storage-read
provenance, atomic co-observation, CAS, request or terminal evidence, revocable
token, writer authority, browser adapter, global fence-freshness proof, restart
reconstruction, semantic-owner release, or append operation.

Version `0.0.42` adds a nominally separate, process-local acquisition state
machine. `begin_acquisition` consumes the checked plan into non-`Clone`
`LocalLogStorageUncertainWriterFenceAcquisition` under a fresh opaque attempt
ID. Its first `adapter_request` call permanently records egress, mints a
distinct opaque request ID, and returns one borrowed non-`Clone` request with
the expected binding, raw current/optional-predecessor JSON, expected writer
pair, and planned next pair. The request is the only public raw-payload surface
for this lifecycle; state, token, ID, failure, and request diagnostics remain
payload-redacted.

The IndexedDB Profile V1 host contract is one fixed five-store strict
`readwrite` transaction. It must read the selected transaction both by primary
key and through unique `byCommittedHead`, validate the optional predecessor,
selected generation records, exact selection bytes, and expected writer pair,
then replace only the scope control's writer pair. An already-present target
pair is not idempotent success, and only this transaction's terminal
`complete` qualifies.

The host can attest `AcquisitionCompleted` or `TransactionAborted` only with a
clone of that emitted request ID. `NotAttempted` names the attempt and is legal
before or after request egress when the invocation created no transaction.
Consuming observation checks attempt identity first, request existence second,
then exact allocation identity. Rejection retains the unchanged owner and
unapplied attestation. Abort/not-attempted outcomes preserve the exact plan for
fresh-identity resubmission; only matching completion creates
`LocalLogStorageMutationToken`.

The non-`Clone`, nonserializable token retains the exact nominal request ID and
post-acquisition binding. Target construction preserves the complete selected
binding and allocation-identical selection JSON while replacing only the epoch
and fence with the checked successor and proposal. Public inspection exposes
the binding, selected binding, acquired pair, attempt/request IDs, and JSON byte
lengths, but not raw JSON. This is historical trusted host
evidence, not proof of present currentness, a long-lived lock, durability, or
semantic ownership. Every protected mutation must re-read and compare the
complete binding transactionally. Opaque IDs and fences are non-secret; a
borrowed one-shot request cannot prevent copied or duplicate dispatch, and the
core cannot authenticate host callbacks.

No IndexedDB/JavaScript/Wasm/filesystem adapter exists. The lifecycle has no
durable/restart representation or acquisition resolver. If
`u64::MAX - 1 -> u64::MAX` commits and its terminal callback or volatile state
is lost, the stored target tuple cannot safely reconstruct request-correlated
authority and the epoch cannot advance again. Profile V1 therefore has no
in-contract path to acquire another token, although a token already issued at
maximum can still prepare an append and could be transactionally checked by a
future adapter.

Version `0.0.43` adds the pure append-preparation action.
`LocalLogStorageMutationToken::try_prepare_append` consumes one token and one
`LocalLogTailCursor` while borrowing the candidate `LocalLogEntry`. It validates
the token's selected session, checkpoint generation, active generation, and
Frame V1 policy against the cursor, encodes exactly one canonical frame, checks
its generation-relative byte range, and semantically admits that encoded frame
through the existing tail transition. Typed
`LocalLogStorageAppendPreparationFailure` returns the complete unchanged token
and cursor. Success produces a private-constructor non-`Clone`
`LocalLogStorageAppendPlan` that owns the exact frame, token, and speculative
advanced cursor; the post-cursor remains quarantined rather than becoming a
durability claim.

For IndexedDB Profile V1, one chunk is now exactly one complete Frame V1 value
with no trailing bytes. Its fourth key component is `chunkStart`, a canonical
twenty-digit zero-padded generation-relative byte start. Zero is first, and
each successor start is the preceding start plus that value's complete byte
length. A future append transaction must recheck the token's complete binding
and require the observed last tail end to equal the plan start. Exact same bytes
at the target may be treated as idempotent; different bytes, a gap, overlap, or
later record fail closed. Rotation must compare that same last tail end with
`acceptedPrefixBytes` inside its serialized transaction.

Version `0.0.43` has no append adapter request, I/O, terminal attestation,
acknowledgement, uncertain resolver, or restart reconstruction. Cursor byte
provenance is still caller-trusted, non-`Clone` remains ownership hygiene, one
frame per record adds storage overhead, and all scopes still serialize through
the profile's fixed store set.

Version `0.0.44` adds `LocalLogStorageAppendQueue`, a pure nonempty bounded FIFO
seeded only by consuming one checked append plan. Start checks pending-frame
capacity before aggregate encoded-byte capacity and returns the allocation-
identical plan on rejection. `LocalLogStorageAppendQueueLimits` independently
bounds pending frames and retained encoded bytes; its defaults are 1,024 frames
and 64 MiB, while zero in either relevant dimension can reject the first plan.

Consuming `try_enqueue` borrows one entry and checks frame-count arithmetic and
policy, deterministic Frame V1 encoding, frame/aggregate-byte arithmetic and
policy, then semantic tail admission. Success appends the same encoded
allocation behind the immutable head and publishes one final cursor advanced
through every pending frame. A success step owns that queue and reports the
just-enqueued frame's bounded range, byte length, and admission outcome. Failure
returns the complete unchanged queue and leaves the entry caller-owned. Public
inspection exposes exact totals, remaining capacity, speculative tail state,
and persistent metadata only for the head. The success step's bounded causal
metadata is not an arbitrary follower view. Raw bytes, follower selection,
removal, dispatch authorization, acknowledgement, pop, cursor release, and
rotation are unavailable.

The queue owns the original token once for the whole speculative prefix. This
does not cache token currentness: each future physical head append must compare
the complete binding in its own serialized transaction. A later uncertain-head
state must retain logical enqueue, but no core-issued request may expose or
authorize a follower until that exact head is resolved. Version `0.0.44` has no
append attempt/request lifecycle, terminal attestation, resolver, restart form,
drained owner, or transition from that owner into rotation. The host continues
to own scheduling, batching choice, admission pacing, and cancellation without
gaining permission to
select a follower, coalesce, or reorder the core FIFO.

The queue byte ceiling counts encoded frame allocations, not the semantic
cursor's session, history, replay indexes, decoded entries, container metadata,
or allocation overhead. Enqueue encodes one exact candidate before applying the
aggregate-byte ceiling, so transient peak memory can exceed it. Dropping the
volatile queue is possible in Rust but is not cancellation or acknowledgement;
it loses the speculative branch. There is no typed allocation-failure recovery,
process-restart reconstruction, or stale-token rebase/extraction path in this
release.

Version `0.0.45` adds `LocalLogStorageUncertainAppendAttempt`. Consuming
`begin_head_append_attempt` enters that conservative state before adapter
egress and issues a fresh process-local append-attempt ID. The first
`adapter_request` call permanently records egress, mints a distinct request ID,
and yields one borrowed, non-`Clone` request for only the immutable FIFO head.
One request ID names one adapter invocation and at most one append-capable
transaction. The request exposes the complete expected mutation-fence and
selected bindings, exact current and optional predecessor selection JSON,
expected writer epoch/fence, canonical head start and end, and exact complete
Frame V1 bytes. Those payloads are sensitive and copyable, so `Debug` reports
only bounded metadata and does not prove single dispatch.

The profile adapter must independently revalidate the full binding and
byte-exact selections and scan the complete serialized tail. Only an absent
target at the exact tail or the same key plus byte-identical final frame is
admissible; any different bytes, gap, overlap, malformed record, or later
record fails closed. Returning the Rust request, observing an IndexedDB request
success, or calling `commit()` does not classify completion.
`begin_exact_resubmission` preserves the allocation-identical queue, head
bytes, followers, token, limits, and final speculative cursor while issuing a
fresh attempt ID and restoring one-shot request eligibility. It neither
refreshes a stale token nor proves the earlier request stopped; an older
transaction may still commit, so same-key/same-bytes idempotency is mandatory.

The uncertain owner can keep logically enqueueing before or after request
egress without changing its attempt/request correlation. Only its private tail
advances; no core-issued request exposes or authorizes a follower. No terminal
attestation, explicit head acknowledgement, head pop, drained owner, cursor
release, resolver, transition from a drained owner into rotation, or restart
reconstruction exists in `0.0.45`; those remained the next implementation gate
at that checkpoint. Drop or process loss
cannot decide whether copied or dispatched work committed and discards the
volatile queue and IDs. The `0.0.44`
queue's retained-byte exclusions and transient candidate-allocation peak are
unchanged.
Profile V1 exact-tail validation may scan every active-generation chunk, while
the fixed five-store scope serializes otherwise independent editor scopes.

Version `0.0.46` adds that process-local terminal boundary without making the
core an I/O engine. `LocalLogStorageUncertainAppendAttempt::observe_terminal_attestation`
correlates the exact attempt and, when required, its issued request, then
classifies one trusted adapter callback as
`LocalLogStorageAppendTerminalAttestationKind::TransactionCompleted`,
`TransactionAborted`, or `NotAttempted`. `NotAttempted` is legal before or
after request egress. Correlation errors are checked in this order: append-
attempt ID mismatch, then, for request-bearing evidence, request not issued and
append-request ID mismatch.
`LocalLogStorageAppendTerminalFailure` returns the unchanged uncertain owner
and supplied attestation. Raw frame bytes never enter the terminal contract;
callbacks are trusted IndexedDB Profile V1 attestations, not facts the Rust
core can independently authenticate.

`TransactionCompleted` produces
`LocalLogStorageAppendTerminalOutcome::HeadPresent(LocalLogStorageAppendHeadPresent)`
only after the adapter attests that the complete strict five-store transaction
emitted `complete` and the serialized active-generation tail qualified exactly: either
the target was absent at the exact prior tail and the exact frame was added, or
the target was already the exact final tail record with byte-identical Frame V1
bytes. Request success, calling `commit()`, incomplete transaction work, or a
partial mutation is insufficient. `HeadPresent` is deliberately separate from the
consuming `LocalLogStorageAppendHeadPresent::acknowledge_head` transition, so
terminal classification alone cannot remove queue state.

One `acknowledge_head` call advances exactly one FIFO head and returns
`LocalLogStorageAppendHeadAcknowledgementOutcome`. `Pending` owns
`LocalLogStorageAppendHeadAcknowledged`, promotes the allocation-identical first
follower to the next head, preserves order, token, final speculative cursor and
limits, decrements count and bytes by exactly the acknowledged head, and records
the acknowledged request ID. A second head cannot be acknowledged from that
state: the caller must recover the
queue, begin a new head attempt, issue its request, and obtain a matching
`TransactionCompleted`/`HeadPresent`. `Drained` owns
`LocalLogStorageAppendQueueDrained`, including the token, final cursor, limits,
and acknowledged request ID; it is the only successful append transition that
releases that final cursor.

`AttemptAborted(LocalLogStorageAppendAttemptAborted)` and
`NotAttempted(LocalLogStorageAppendNotAttempted)` remove nothing. Both typed
negative owners preserve the complete allocation-identical queue for
`begin_exact_resubmission` under a fresh attempt ID with restored one-shot
request eligibility; the host cannot select a follower, supply raw bytes, or
choose what to pop. A copied request may
outlive either negative attestation and still race to commit, so every later
invocation retains the same exact-key/exact-bytes idempotency rule. The retained
mutation token may already be stale, and the queue's base-cursor provenance
remains caller-trusted.

Version `0.0.47` implements the process-local lost-callback resolver without
adding an I/O engine. `Uncertain`, `AttemptAborted`, and `NotAttempted` retain
their exact provenance when consumed into `LocalLogStorageAppendResolution`,
including an honestly optional source append-request ID. Each invocation can
emit one borrowed request with a fresh opaque resolver ID; restart keeps the
source and queue but invalidates that ID. Live borrowing prevents apply,
restart, or logical enqueue through the safe API, while a completed borrow may
be followed by enqueue without changing the head or source/resolver
correlation.

The request exposes the expected selected scalar binding, writer pair, and
bounded metadata, not the complete clonable mutation binding, private expected
frame, or exact selection JSON. A current observation must
consume a non-`Clone` `LocalLogStorageSelectedRoot` independently normalized
from observed storage, plus the writer pair and selected head-index transaction
ID read in that snapshot. This keeps evidence on the strict normalization path
and keeps the complete mutation binding core-private, but cannot prove that the
host performed a fresh read. Ordinary evidence is valid only after the exact
five-store `readonly` transaction, opened without a durability option,
completes after all reads and full cursor scans. Physical database absence has
its own correlated non-creating-open evidence path.

The core alone compares the evidence with the private queue. Exact-tail absence
with the complete writer pair unchanged yields advisory
`RetryEligibleAtResolution`. The byte-identical exact final target yields
`HeadPresentAtResolution`; a later writer epoch is permitted, but regression or
a selected-receipt change without a strict epoch advance or a same-epoch fence
substitution is a collision. A later record never yields a positive outcome,
and a missing target before a later key is a physical gap. Selection advance,
reset, and other indeterminate states quarantine the queue.
The positive state has its own acknowledgement outcome types and removes
exactly one head by the same private FIFO primitive used by the callback path.

This remains process-local, host-attested observation—not callback
authentication, cancellation, process-restart reconstruction, token refresh,
or durable-media proof. Dropping the volatile owner loses correlation state;
the target scan is O(chunks), and the fixed store scope can couple independent
editor scopes. IndexedDB `durability: "strict"` remains only a requested hint.

Version `0.0.48` adds the observation-guarded `EditorEngine` facade without
changing the lower-level `EditorSession`, action registry, or history
contracts. `new` accepts a caller-built frozen registry, while
`try_with_base_actions` installs the exact built-in action generation. Shared
`state`, `session`, and `action_registry` access supports rendering,
checkpointing, and separately composed action-state catalogs; mutation remains
available only through guarded engine methods. `into_parts` is an explicit
consuming ownership boundary rather than a mutable escape.

Every mutator receives an `EditorEngineObservation` containing the private live-engine
identity, caller's observed `SnapshotId`, and complete opaque `SessionHistoryStatus`.
Engine-instance, snapshot, and history mismatches return distinct stable categories before
action lookup, decoding, planning, selection validation, replay, or
history-only mutation. This matters because effective close and clear controls
rotate history identity without changing the document snapshot.
`execute_action` keeps registry preparation and session publication in one
synchronous call. Success returns `EditorActionOutcome::Committed` with a
private-constructor `EditorEngineEvent` of kind `Action`;
expected contextual unavailability returns a payload-redacting
`EditorDisabledAction` carrying only action identity, reason, and the coherent
same-evaluation indicator plus the unchanged observation. Preparation and
publication faults remain distinct typed error categories.

`set_selection` returns `None` for an exact browser echo, preserving revision,
pending formats, and an open merge group. A real guarded change publishes a
state-only commit, clears pending typing formats, updates adjacent undo/redo
cursor boundaries, and closes merging. Guarded `undo`, `redo`,
`close_history_group`, and `clear_history` return an optional sealed event whose
kind cannot be selected by callers. Each event retains the complete resulting
observation; commit-bearing events expose the exact renderer transition only by
reference. This prevents a direct accidental move into an ordinary log event,
but it is not authorization or provenance because public codecs can copy the
commit. Payload-bearing sources are omitted from engine `Debug`.

`EditorEngineEvent` is a process-local controller result, not
`LocalLogEvent`. No infallible internal mapping to that separately sealed event
exists yet, and checked undo/redo conversion is still a fallible step after
session publication. `LocalLogEntry` separately requires session/generation,
sequence, and retry identities. A later log coordinator must reserve those and
close conversion before publication. This facade adds no Wasm ABI, DOM/event
adapter, subscription scheduler, or persistence I/O.

Version `0.0.49` adds `delete-forward`, `delete-selection`, and
`insert-plain-text` to the base action generation. Directional deletion uses
default extended grapheme clusters from exact-pinned Unicode 17.0.0 across
formatting runs; a scalar-valid caret inside a cluster is disabled. Extended
selection deletion records independently, while collapsed backward/forward
work uses distinct merge groups and joins the adjacent paragraph at structural
edges. A cluster formed across any removed seam directionally snaps the
core-produced caret to a valid cluster boundary. Replay applies exact recorded
operations and never reruns segmentation.

Plain-text input version 1 treats CRLF, CR, and LF as structural boundaries,
preserves every other scalar, applies one deterministic inherited format set to
all non-empty lines, consumes pending formats, and requests independent history
with exactly one `RootTextReplace`. Canonical execution can drop an exact
replacement, yielding a selection-only commit and no undo entry. Its source cap
is 65,536 bytes and UTF-16 code units plus 10,000 paragraphs; active document
limits can reject a smaller result. The existing `insert-text` contract retains
literal newlines. Soft break remains outside the base AST rather than being
faked with inline LF.

Proof-dropping compaction has its own host-selected cumulative replay policy.
The first transition selects it; ordinary rotations inherit it, so a new batch
cannot reset the allowance. An explicitly named transition can reauthorize a
different ceiling only after checking the complete prior-plus-active replay
set. Typed failure returns the complete unchanged owner, while its `Debug` and
`Display` omit the session, history, entries, and document. Local Log
Checkpoint V1 does not serialize this runtime policy; strict decode installs
the codec host's current tombstone ceiling.

Repeated rotation preserves global sequence, complete session history, and all
exact replay tombstones. It rejects reuse of the active or immediately
preceding generation ID. Older generation IDs are not retained by V1, so
lifetime generation freshness, storage sealing, and writer fencing remain host
obligations. If an ancestor came from durable decode, later runtime compaction
preserves that merely structural provenance; it does not authenticate or
causally prove the inherited session/tombstone relationship.
