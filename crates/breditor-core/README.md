# breditor-core

`breditor-core` is the platform-independent deterministic content kernel for
Breditor. It contains no DOM, framework, async-runtime, clock, random-number, or
Wasm binding dependencies.

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
attempt identities, one-shot borrowed request views, and exact resubmission,
UTF-16-safe points and
selections, paragraph-local text splices, atomic transactions, direct-root
paragraph split/join operations, proof-backed local
validation for fixed-base text edits, structural relocation, heterogeneous
change notifications, guarded root-text range replacement with a closed
same-type inverse, exact in-memory undo/redo requests, an immutable typed
action registry, a frozen semantic intent router, and base text-insertion,
paragraph-break, backward-delete, and strong-format actions. Registry
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
history-observation stamp. The strong-format action is the first toolbar-shaped
control: it reports inactive, active, or mixed state, toggles explicit pending
formats at a caret, performs one guarded same-paragraph splice for a local
extended selection, and uses one guarded root-text replacement while preserving
every selected paragraph boundary for a cross-paragraph selection. The typed
text-insertion action consumes that pending override, inherits deterministic
context otherwise, replaces one exact direct-root text range, and offers
adjacent edits to the `breditor/typing` history group. Same-paragraph insertion
stays on the local splice path, while
cross-paragraph type-over uses one guarded root-text replacement.
Extended backward deletion likewise uses one guarded root-text replacement for
cross-paragraph selections while preserving its local splice/join paths.
Cross-paragraph paragraph breaks use the same atomic primitive with two empty
replacement fragments, preserving the retained boundary text as two distinct
paragraphs without a delete/split intermediate.
Operation records retain exact optimistic guards and pass checked constructors
plus active-context limits, but deliberately carry no snapshot, ordering,
selection, metadata, deduplication identity, or transaction boundary. The crate
is intentionally smaller than the eventual editor runtime and has no
action-state subscription/delivery layer, presentation manifest, browser queue,
generic formatting-kind or attribute actions, log storage and tail-wide
recovery orchestration,
checkpoint/log atomic replacement, storage-generation publication or initial
scope provisioning, durable append/acknowledgement,
collaboration transform, or Wasm adapter yet.

Checkpoint-linked one-observation admission is synchronous and in-memory. A
typed rejection returns the unchanged active owner and exact rejected entry, so
the caller can retain and retry it after relevant prerequisites change, or
construct another entry without reconstructing the checkpoint. Fresh genesis
is still a complete-vector boundary; an empty genesis generation can be
compacted to bootstrap only this in-memory successor-admission path, not a
storage scope, authoritative head, or first storage-generation manifest. The
core does not queue, schedule, persist, flush, acknowledge, or rate-limit
attempts.

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
`breditor/local-log-storage-generation@1` shape remains pre-`0.1`, not a
permanent compatibility promise. Local Log Checkpoint V1 and Frame V1 remain
unchanged.

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

These APIs compare caller-supplied typed values only. They do not observe
IndexedDB, compare exact current/predecessor JSON, validate index/range
completeness, or authenticate a resolver transaction's terminal event. Future
resolver evidence becomes applicable only after its exact fixed-scope
serialized transaction emits terminal `complete`; request success, `commit()`
return, abort, callback loss, or unrelated completion classifies nothing. The
shape-specific root resolver is the `0.0.39` gate and rotation resolution
follows at `0.0.40`; crash-time attempt-plan reconstruction is not implemented.
The profile cannot release a long-lived exclusive Rust writer; that still needs
a separately held lock, transaction-coupled admission, or explicit
revocable/speculative branch semantics. These storage formats remain unstable
pre-`0.1` contracts.

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
