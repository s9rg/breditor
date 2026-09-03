# Breditor

Breditor is an experimental, original rich-text editing engine. The name combines
the HTML `<br>` element with “editor.” Other editors are research examples only;
Breditor does not implement their document model, operation format, or plugin
protocol.

This repository currently contains the first end-to-end Rust-core slice:

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
  process-local storage-mutation tokens, plus a pure single-frame append plan
  that atomically joins one token, one active-tail cursor, one canonical frame,
  and its speculative post-append semantic cursor;
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
- semantic `insert-text`, `insert-paragraph-break`, `delete-backward`, and
  `toggle-strong` actions exposed through the same registry for future
  keyboard, toolbar, palette, and API adapters; typed insertion consumes
  pending formats, insertion, paragraph breaks, and extended deletion
  atomically replace cross-paragraph selections, while `toggle-strong`
  publishes tracked inactive/active/mixed state and preserves selected block
  boundaries during cross-paragraph formatting;
- a synchronous `EditorSession` publication boundary with exact-base commit
  acceptance, intent/action execution, bounded linear history, deterministic
  merge groups, atomic undo/redo replay, and durable local checkpoint restore;
- `Commit` helpers that construct lower-level undo and redo transactions; and
- document, fragment, operation-record, and fixed-width per-transaction
  operation limits plus host-configurable aggregate session-checkpoint
  admission budgets, a separate complete replay-tombstone checkpoint limit,
  and an inherited proof-dropping compaction lifetime ceiling whose typed
  failures return the unchanged log owner.

This is still a proof slice, not a complete editor. Structural edits beyond
direct-root base-paragraph text structure, generic formatting kinds and
attributes,
action-state subscriptions and asynchronous delivery, presentation metadata
and plugin lifecycle management, ordered log storage and tail-wide recovery,
checkpoint/log atomic replacement, storage-generation publication and initial
scope provisioning, durable append and acknowledgement,
cryptographic integrity/authenticity, rollback protection, and
crash-tail recovery,
Wasm bindings,
a DOM bridge,
collaboration-aware or selective undo, and generic incremental validation for
structural or custom-schema edits are not implemented. See
[`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) for the exact contracts and
current performance limitations. Fresh-genesis admission remains batch-only;
hosts that need one-entry admission can compact an empty genesis generation
into its first in-memory successor. That does not provision a storage scope,
authoritative head, or first storage-generation manifest.

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
scopes. Durable FIFO/order correctness belongs in future core typestate; a host
queue will own asynchronous scheduling, batching policy, backpressure, and
cancellation without being allowed to reorder core plans.

## Development

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps
cargo check --workspace --target wasm32-unknown-unknown
```

The open-source license is intentionally not selected yet; MIT versus Apache-2.0
remains an owner decision.
