//! Deterministic content kernel for the Breditor rich-text editor.
//!
//! The crate currently owns immutable document values, the minimal compiled
//! proof schema, strict versioned document, singular-operation, exact-base
//! transaction-request, contextual complete editor-state, replay-proved
//! durable commit, bounded session-checkpoint, replay-identified local-log
//! entry, complete local-log-checkpoint JSON decoding, checksummed binary
//! local-log frame scanning, atomic framed-tail observation, pure token-bound
//! single-frame append preparation and a bounded speculative FIFO,
//! genesis-prefix recovery, checkpoint-linked batch and incremental successor
//! admission,
//! repeated compaction,
//! snapshot-local points and selections, immutable editor states,
//! paragraph-local text splices,
//! direct-root paragraph split/join and guarded root-text range-replacement
//! operations, atomic transactions, proof-backed local text validation,
//! structural relocation, and exact in-memory undo/redo requests. It also owns
//! a deterministic typed action
//! registry, a frozen semantic intent router, the first semantic
//! text-insertion, paragraph-break, backward-delete, and strong-format actions
//! (including extended cross-paragraph ranges), and a
//! synchronous exact-publication session with bounded linear history. It
//! deliberately contains no browser, framework, asynchronous scheduler, clock,
//! random-number, collaboration, or Wasm binding code.
//!
//! # Construction boundary
//!
//! Runtime [`document::Document`], [`document::NodeRef`], and
//! [`operation::Operation`] values cannot be deserialized directly. Untrusted
//! data must pass through [`codec::DocumentJsonCodec`],
//! [`codec::OperationJsonCodec`], [`codec::TransactionJsonCodec`],
//! [`codec::EditorStateJsonCodec`], or
//! [`codec::SessionCheckpointJsonCodec`]. Durable transitions pass through
//! [`codec::CommitJsonCodec`], while complete compacted log state passes through
//! [`codec::LocalLogCheckpointJsonCodec`]. The
//! document codec checks its versioned record, schema identity, canonicality,
//! limits, and complete tree before publishing a runtime document. That same
//! successful validation derives the document's exact cached [`document::DocumentSummary`];
//! the summary is runtime metadata and never enters the document wire record.
//! The operation codec preserves exact optimistic guards, reconstructs through
//! checked constructors, and validates every document-independent context law.
//! The transaction-request codec additionally requires the complete immutable
//! base state, preserves ordered operations and explicit state/history intent,
//! and never applies the reconstructed request. Snapshot applicability remains
//! an atomic transaction concern. The editor-state codec instead restores one
//! complete state, including its exact snapshot identity, against a
//! caller-supplied authoritative context; it contains no history or commit.
//! The commit codec embeds that exact before checkpoint, replays a canonical
//! forward recipe, explicitly restores result editor values, and publishes
//! only the newly derived [`transaction::Commit`]. It does not trust redundant
//! after-state, inverse, relocation, or change-set claims.
//! The session-checkpoint codec instead proves a compact chronological history
//! chain in both directions, derives every later document and inverse recipe,
//! and restores one bounded [`session::EditorSession`] with a fresh process-local
//! history identity. It is neither an ordered log nor an authenticity proof.
//! The local-log-entry codec adds separate durable session, append-generation,
//! session-global sequence, and retry identities around ordinary commit,
//! undo/redo, and history-boundary events. One entry does not prove stream
//! membership, ordering, deduplication, durability, or authorization.
//! [`codec::LocalLogFrameCodec`] wraps exact Local Log Entry V1 bytes in a
//! fixed-width, big-endian frame with independent header and payload CRC-32C
//! checks. Its scanner is allocation-free and distinguishes clean end,
//! recoverable truncation, malformed/corrupt structure, and one complete
//! borrowed frame; semantic decoding then checks an independent trusted session
//! and generation binding. CRC is not authentication, and scanning does not
//! accept, append, acknowledge, or persist an event.
//! [`codec::LocalLogTailCursor`] composes that scanner with one owned
//! [`local_log::ContinuedLocalLog`] and a checked generation-relative `u64`
//! byte offset. It derives codec context and binding from the owner, and only a
//! successfully admitted complete frame—including an exact semantic
//! duplicate—advances both owner and offset. It performs no I/O and cannot
//! prove caller byte provenance or durability.
//! Consuming cursor compaction delegates to the active owner's inherited or
//! explicitly reauthorized replay-tombstone policy. Typed failure returns the
//! complete unchanged cursor; success publishes a
//! `codec::LocalLogTailCompactionOutcome` containing the next checkpoint anchor,
//! the old accepted-prefix length, and the old Frame V1 limits. Invocation is
//! host authorization to abandon any unobserved suffix, not evidence of EOF or
//! byte provenance, durable sealing, or a future frame-version choice. A
//! successor begins separately with explicit recovery/frame policies and
//! generation-relative offset zero.
//! [`codec::LocalLogStorageGenerationJsonCodec`] provides strict
//! ordinary-rotation validation for the unstable pre-`0.1`
//! `breditor/local-log-storage-generation@1` shape. A separately trusted
//! [`codec::LocalLogStorageGenerationBinding`] fixes the profile, scope, and
//! old/new heads; borrowed preparation couples one compaction outcome to exact
//! canonical Checkpoint V1 JSON, accepted-prefix metadata, and old/new Frame V1
//! policies. Decode requires both that binding and an already validated prior
//! manifest, reconstructs bounded fields before the nested checkpoint string is
//! allocated, and rejects any noncanonical nested or outer byte representation.
//! The resulting non-`Clone` manifest is inspection data only: it owns no
//! checkpoint anchor or writer capability and proves no reservation, current
//! head, publication, durability, restart selection, or recovery of log bytes.
//! The separate root codec below validates a first storage-selection proposal,
//! but neither codec provisions storage. At `0.0.32` the crate exported no
//! prepared/committed/uncertain attempt state, adapter, or storage I/O API.
//! Checkpoint V1 and Frame V1 are unchanged.
//! Breditor `0.0.33` separately freezes a concrete `IndexedDB` profile and a
//! distinct initial-root/current-selection contract in the repository design
//! documents. Breditor `0.0.34` implements its pure Rust value boundary:
//! distinct [`local_log::LocalLogStorageDatabaseIncarnationId`] and
//! [`local_log::LocalLogStorageScopeIncarnationId`] syntax types,
//! [`codec::LocalLogStorageRootJsonCodec`] with separate strict root
//! preparation/encoding/decoding, trusted receipt and generation bindings, and
//! [`codec::LocalLogStorageSelectedJsonCodec`] normalization of either a root
//! or one current rotation plus its immediate predecessor into a non-`Clone`
//! [`codec::LocalLogStorageSelectedRoot`]. The selected value privately owns
//! its checkpoint anchor, exposes inspection facts only, excludes the mutable
//! writer epoch/fence, and supports validation of the next rotation without a
//! complete predecessor chain through `prepare_rotation_from_selected`,
//! `encode_rotation_from_selected`, and `decode_rotation_from_selected`.
//!
//! Breditor `0.0.35` closes the selected-envelope identity gap. The non-`Clone`
//! selected root retains its complete checked selected binding, byte-exact
//! canonical current selection, and byte-exact immediate predecessor for a
//! rotation. Public inspection exposes borrowed current/predecessor receipt
//! bindings and exact byte lengths; raw retained selection JSON remains
//! core-private. The public `validate_exact_selection_envelope` action compares
//! caller-supplied UTF-8 bytes without parsing, canonicalization, or hashing.
//! Its typed errors and the selected root's `Debug` contain no raw selection or
//! checkpoint JSON, document content, or session-state payload. `Debug` may
//! still show bounded identity values such as the session ID. Retained
//! selection receipt bindings remain caller-supplied validation facts, not
//! commit evidence.
//!
//! That normalization is O(1) only in rotation-history length, not in retained
//! bytes. Rotation normalization still reads bounded current/immediate-
//! predecessor JSON and strictly decodes both nested checkpoints; the current
//! checkpoint is decoded again to retain its anchor. The result also keeps up
//! to two complete canonical selection envelopes, each of which may embed a
//! full checkpoint. Work and retained memory can therefore scale with those
//! byte limits and both checkpoints' document/session sizes. Exact equality is
//! not storage authority or currentness. Version `0.0.35` performs no I/O and
//! adds no storage-attempt state or evidence.
//!
//! Breditor `0.0.36` adds the first non-owning exact-attempt boundary. Root
//! attempt preparation takes explicit database and planned scope incarnations;
//! rotation attempt preparation takes a normalized selected root. Both retain
//! a complete prospective [`codec::LocalLogStorageSelectedBinding`] and exact
//! canonical candidate JSON only after final strict selected normalization,
//! then drop the temporary candidate selected root and its checkpoint anchor.
//! A rotation plan also snapshots the complete prior selected binding and
//! `Arc`-shares its exact current and optional predecessor JSON without
//! retaining the input selected root or anchor.
//!
//! The resulting private-constructor, non-`Clone`
//! [`codec::LocalLogStoragePreparedAttempt`] exposes candidate facts and JSON
//! byte lengths, not payload bytes. Consuming `begin_attempt` creates a fresh
//! core-issued, opaque, ABA-safe process-local
//! [`local_log::LocalLogStorageAttemptId`] and moves the exact plan to
//! non-`Clone` [`codec::LocalLogStorageUncertainAttempt`] before egress. Only
//! that state can yield one borrowed [`codec::LocalLogStorageAttemptRequest`].
//! The request intentionally exposes exact candidate JSON and, for rotation,
//! the selected binding/current/optional-predecessor JSON required by an
//! adapter. Direct raw selected-root getters remain core-private, and request,
//! state, ID, and error `Debug` output remains payload-redacted.
//!
//! Consuming `begin_exact_resubmission` preserves the same plan allocations and
//! bytes, issues a fresh attempt ID, and restores one-request eligibility.
//! `require_current_attempt_id` rejects cross-plan or earlier-retry IDs but
//! classifies no outcome. A borrowed one-shot request cannot prevent the caller
//! from copying bytes or dispatching duplicate external operations. Attempt
//! retention remains O(1) only in rotation-history count: a rotation can retain
//! three complete payload envelopes—candidate, selected current, and optional
//! selected predecessor.
//!
//! Breditor `0.0.37` adds a typed, process-local host-attestation boundary for
//! one physical attempt. A non-`Clone`
//! [`codec::LocalLogStorageAttemptTerminalAttestation`] binds the exact current
//! attempt ID to one stable
//! [`codec::LocalLogStorageAttemptTerminalAttestationKind`]: an exact
//! publication-armed transaction completed, that transaction aborted, or the
//! named adapter invocation created no publication transaction. A bare
//! transaction `complete` event is insufficient: `publication_completed` is a
//! host assertion that the exact transaction associated with the emitted request ID was
//! on the publication branch, had passed every independent check, had enqueued
//! the complete exact mutation set, and then emitted `complete`.
//!
//! The one borrowed adapter request exposes a clonable, opaque
//! [`local_log::LocalLogStorageAttemptRequestId`]. Only that emitted request ID
//! can construct publication-complete or abort, mechanically preventing those
//! attestations before request egress through the safe API; `NotAttempted`
//! instead names the attempt ID and is legal with or without prior request
//! egress when no publication-capable transaction was created. Consuming
//! `observe_terminal_attestation` validates the exact retained request/attempt
//! correlation. Success produces
//! [`codec::LocalLogStorageAttemptTerminalOutcome`] with
//! [`codec::LocalLogStorageHostAttestedCommitted`],
//! [`codec::LocalLogStorageAttemptAborted`], or
//! [`codec::LocalLogStorageNotAttempted`]. A stale/cross-attempt or request
//! correlation, or an illegal branch, returns
//! [`codec::LocalLogStorageAttemptTerminalFailure`] containing the complete
//! unchanged owner and unapplied attestation.
//!
//! `AttemptAborted` and `NotAttempted` close only one physical invocation. They
//! retain the exact plan and may begin allocation-preserving exact resubmission
//! under a fresh ID. One attempt ID names only that invocation and at most one
//! associated publication transaction: a copied or duplicate dispatch is
//! outside its correlation and must be classified by later storage resolution,
//! not by another terminal callback. `HostAttestedCommitted` is historical host
//! evidence, deliberately cannot resubmit, and proves neither present selection
//! nor durable flush, writer authority, or ownership release.
//!
//! All attempt IDs, request IDs, attestations, and typestates are process-local
//! and have no durable or restart representation. Future resolution therefore
//! requires a surviving in-memory exact plan; crash-time plan reconstruction is
//! not implemented.
//! These values perform no I/O, provision no database/scope/head/generation,
//! and prove no compare-and-swap, current head, lifetime ID/fence freshness,
//! empty generation, writer authority/epoch, browser-event provenance,
//! durability, or ownership release. No `IndexedDB`, JavaScript, Wasm,
//! filesystem, or other adapter is implemented.
//!
//! Version `0.0.38` adds directional value checks required by later resolvers.
//! [`codec::LocalLogStorageSelectedBinding::compare_later_observation`] keeps
//! all receipts and immutable generation facts exact while allowing only
//! checkpoint cleanup from `Retired` to `Reclaimed`. A selected active
//! generation can separately validate its exact retired/reclaimed checkpoint
//! under a supplied superseding head. The closed
//! [`codec::LocalLogStorageRetiredTransactionBinding`] exposes only facts
//! retained by the tombstone; its byte length does not attest byte equality.
//! These comparisons perform no storage observation, exact-JSON comparison,
//! range/index validation, or resolver-terminal attestation.
//!
//! Version `0.0.39` adds a process-local root-only resolver over surviving
//! uncertain, aborted, unattempted, or host-attested-committed state. Rotation
//! sources are recoverably rejected. One borrowed
//! [`codec::LocalLogStorageRootResolutionRequest`] mints an opaque
//! [`local_log::LocalLogStorageRootResolutionRequestId`] only at egress.
//! [`codec::LocalLogStorageRootResolutionEvidence::transaction_completed`] is
//! applicable only after that exact fixed-scope serialized transaction emits
//! terminal `complete` after all reads and cursor scans. Request success,
//! `commit()` return, abort, callback loss, or unrelated completion classifies
//! nothing. A physically absent database instead uses the separate
//! [`codec::LocalLogStorageRootResolutionEvidence::database_open_absent`]
//! boundary after a versionless open reports `oldVersion == 0`, synchronously
//! aborts its upgrade, and reaches terminal open-request `error`.
//!
//! Applying evidence before request egress or with a stale/cross-request ID
//! returns the unchanged [`codec::LocalLogStorageRootResolution`] and unapplied
//! evidence. `restart_resolution` preserves the exact source plan and bytes,
//! clears only resolver correlation, and makes old evidence stale for the next
//! request. IDs, evidence, plans, and states remain process-local with no wire
//! or crash-restart reconstruction.
//!
//! The closed [`codec::LocalLogStorageRootResolutionOutcome`] distinguishes
//! selected commit, immediate-predecessor commit, retired identity, advisory
//! retry eligibility, another valid scope, collision/corruption, and
//! reset/indeterminate. Clean planned-scope absence asserts that the scope key,
//! candidate transaction/index, both generation keys, and every complete
//! transaction/generation/chunk range for the planned incarnation are
//! empty. It yields retry eligibility only for a non-host-committed source; a
//! surviving host-attested commit instead yields reset/indeterminate. A
//! different scope incarnation is not accepted from a bare scope scalar: its
//! observation carries a complete normalized valid selected graph plus the
//! transaction read from its current-head index and proves a distinct lifetime
//! in the same database/logical scope. It also asserts the planned-incarnation
//! candidate/index/generation keys and complete candidate chunk prefixes are
//! absent. That is `ScopeAlreadyProvisioned` only for a non-host-committed
//! source and reset/indeterminate for a surviving host-attested commit.
//! Physical database absence, a different valid metadata incarnation, or an
//! all-five-stores-empty compatible database without `meta/profile` is reset/
//! indeterminate for every source. Any record without valid profile metadata,
//! or an expected scope whose append-only candidate association is missing, is
//! collision or corruption.
//!
//! Retired root resolution separately validates the candidate's direct
//! successor. An exact current-predecessor successor uses its privately
//! retained, byte-derived sealed log ID and frame, both of which must equal the
//! root plan's active generation without another host scalar. A retired
//! successor's Profile V1 tombstone has discarded those JSON/sealed facts, so
//! only its retained transaction/head identity, head-index mapping, and the
//! planned active generation's `retiredBy` link are proved—not its discarded
//! contents. Candidate byte length remains identity screening, not byte
//! equality. Only [`codec::LocalLogStorageRootRetryEligibleAtResolution`] can
//! exact-resubmit, under a fresh attempt ID, and that eligibility is advisory
//! after the read transaction.
//!
//! Version `0.0.40` adds the nominally separate process-local rotation resolver
//! over the same four surviving attempt sources. Its borrowed
//! [`codec::LocalLogStorageRotationResolutionRequest`] mints a distinct opaque
//! [`local_log::LocalLogStorageRotationResolutionRequestId`] only at egress,
//! and [`codec::LocalLogStorageRotationResolutionEvidence`] preserves the same
//! ordinary terminal-`complete` versus physical-database-absence terminal-open-
//! `error` split. Pre-egress or stale/cross-request evidence returns the
//! unchanged [`codec::LocalLogStorageRotationResolution`] and unapplied
//! evidence; restart retains the exact in-memory plan and clears correlation.
//!
//! The closed [`codec::LocalLogStorageRotationResolutionOutcome`] is source-
//! aware. If the exact snapshotted prior selection remains current, advisory
//! retry requires the candidate transaction, committed-head index, candidate
//! active-generation key, and complete candidate active-generation chunk
//! prefix all to be absent, and is available only to an uncertain, aborted, or
//! unattempted source. The same intact-scope absence after
//! host-attested commit is collision/corruption. For those three non-host-
//! committed sources, one exact direct competing rotation can instead produce
//! `DefinitelyNotCommittedConflict` only when its immediate predecessor is the
//! plan's prior current selection and its generation, index, and optional old-
//! predecessor tombstone facts match. A host-attested source with that absent
//! candidate namespace is collision/corruption. Arbitrary far-later conflict
//! classification is outside `0.0.40`, and rotation never yields root-only
//! `ScopeAlreadyProvisioned`.
//!
//! An absent expected rotation scope is reset/indeterminate only through the
//! observation that its scope key and every complete transaction, generation,
//! and chunk range for the old incarnation are empty. A replacement lifetime
//! likewise requires a complete normalized valid selected graph plus its
//! current-head index result; a bare different-incarnation scalar is
//! insufficient. Missing/replaced database or scope lifetime is reset/
//! indeterminate for every rotation source, while malformed associations and
//! conflicting permanent identities fail closed as collision/corruption.
//!
//! Rotation selected, superseded, and retired proofs validate only their
//! branch-specific exact bytes, indexes, generation transitions, and required
//! tombstones. Selected keeps the plan prior-current transaction exact as the
//! candidate predecessor and requires an older indexed tombstone only when the
//! prior selection was itself a rotation. Superseded requires the exact
//! candidate as the valid current graph's immediate predecessor, both candidate
//! generation transitions, and a matching current head index. Superseded and
//! retired proofs also validate the directional prior checkpoint and require
//! the plan prior-current indexed tombstone plus any optional older predecessor
//! tombstone. A retired candidate proves its
//! indexed Profile V1 tombstone, both candidate generation retirement edges,
//! and an exact-or-retired direct successor. An exact successor's sealed log/
//! frame facts come privately from normalized bytes; a retired successor can
//! prove only retained transaction/head/index facts and the candidate active
//! generation's retirement link, not discarded JSON or sealed fields.
//! Candidate tombstone length is not byte evidence. Complete candidate chunk-
//! prefix exhaustion belongs only to absence/conflict observations, not
//! positive selected/superseded/retired proofs.
//!
//! Only [`codec::LocalLogStorageRotationRetryEligibleAtResolution`] can exact-
//! resubmit the rotation plan under a fresh attempt ID. Neither resolver
//! authenticates `IndexedDB` events, performs storage I/O, proves durability or
//! stable currentness, grants adapter/writer authority, reconstructs a plan
//! after process restart, or releases semantic ownership. All Storage V1 shapes
//! remain unstable pre-`0.1` contracts.
//!
//! Version `0.0.41` adds the pure writer-fence comparison and acquisition-plan
//! boundary. [`local_log::LocalLogStorageWriterEpoch`] is a canonical nonzero,
//! nonwrapping `u64`. [`codec::LocalLogStorageMutationFenceBinding`] snapshots
//! the complete selected binding, `Arc`-shares the exact current and optional
//! predecessor JSON, and records the observed epoch and current writer fence.
//! Its directional later-observation comparison requires exact selection bytes
//! and writer facts, accepts only checkpoint cleanup from `Retired` to
//! `Reclaimed`, and rejects the reverse transition. Neither its public API nor
//! `Debug` exposes the retained JSON payloads.
//!
//! Consuming
//! [`codec::LocalLogStorageMutationFenceBinding::try_prepare_writer_fence_acquisition`]
//! derives exactly the next epoch and returns a non-`Clone`
//! [`codec::LocalLogStorageWriterFenceAcquisitionPlan`] only when the proposed
//! fence differs from the expected current fence. Typed preparation failure
//! retains both unchanged inputs. Advancing `u64::MAX - 1` to `u64::MAX` is
//! valid; only another acquisition or rotation is then impossible. A future
//! already-issued epoch-maximum token could still be compared for append.
//!
//! These are non-authority values. They do not prove provenance, atomic co-
//! observation, storage currentness, compare-and-swap, request dispatch,
//! terminal completion, token issuance, global fence freshness, restart
//! reconstruction, owner release, append, or browser behavior.
//!
//! Version `0.0.42` adds the separate process-local writer-fence acquisition
//! lifecycle. Consuming `begin_acquisition` puts the exact checked plan in
//! non-`Clone` [`codec::LocalLogStorageUncertainWriterFenceAcquisition`] under
//! a fresh opaque [`local_log::LocalLogStorageWriterFenceAcquisitionAttemptId`]
//! before egress. Its one borrowed
//! [`codec::LocalLogStorageWriterFenceAcquisitionRequest`] mints a distinct
//! [`local_log::LocalLogStorageWriterFenceAcquisitionRequestId`] and exposes the
//! complete expected binding, raw current/optional-predecessor JSON, expected
//! writer pair, and exact planned successor pair required by one adapter
//! invocation. Diagnostics redact the JSON payloads.
//!
//! `IndexedDB` Profile V1 requires a future host to execute this as one fixed
//! five-store strict `readwrite` transaction. It reads the selected transaction
//! by primary key and independently through unique `byCommittedHead`, validates
//! the optional predecessor, selected generation records, exact selection
//! bytes, and expected writer pair, and then replaces only the scope control's
//! writer pair. An already-present target pair is not idempotent success; only
//! this exact transaction's terminal `complete` qualifies.
//!
//! [`codec::LocalLogStorageWriterFenceAcquisitionTerminalAttestation`] separates
//! acquisition-completed, transaction-aborted, and not-attempted host claims.
//! Completion and abort require the exact request ID emitted at egress;
//! not-attempted names the attempt and is legal on either side of egress when
//! no transaction was created. Consuming observation rejects attempt mismatch,
//! pre-egress transaction evidence, then stale/cross-request identity while
//! retaining both owner and unapplied attestation. Negative terminal states
//! preserve the exact plan for resubmission under a fresh attempt ID.
//!
//! Matching completion creates non-`Clone`, nonserializable
//! [`codec::LocalLogStorageMutationToken`]. Its post-acquisition binding keeps
//! the complete selected envelope and allocation-identical JSON while changing
//! only the checked successor epoch and proposed fence. This is trusted
//! historical request correlation, not stable currentness: another acquisition
//! or rotation may revoke the token before its callback runs, and every
//! protected mutation must re-read and directionally compare the whole binding
//! inside its own serialized transaction. IDs and fences are non-secret, and
//! the one-shot borrow cannot prevent copied or duplicate dispatch.
//!
//! No browser adapter or executable append operation is implemented. The
//! lifecycle is volatile and has no acquisition resolver. If
//! `u64::MAX - 1 -> u64::MAX`
//! commits but its terminal callback or process state is lost, restart cannot
//! reconstruct the request-correlated token and cannot advance the epoch again;
//! Profile V1 has no in-contract liveness recovery for that terminal case.
//!
//! Version `0.0.43` adds pure, storage-neutral preparation for one append.
//! `LocalLogStorageMutationToken::try_prepare_append` consumes one token and one
//! [`codec::LocalLogTailCursor`] while borrowing a [`local_log::LocalLogEntry`].
//! It validates the token-selected session, checkpoint generation, active
//! generation, and Frame V1 policy against the cursor, encodes one exact frame,
//! checks its generation-relative start/end arithmetic, and admits that frame
//! through the existing semantic tail transition. Typed failure returns the
//! complete unchanged token and cursor. Success returns a private-constructor
//! non-`Clone` `LocalLogStorageAppendPlan` owning the token, exact frame, and
//! speculative advanced cursor. The post-cursor remains quarantined and is not
//! an acknowledgement or durable publication.
//!
//! `IndexedDB` Profile V1 assigns each chunk value exactly one complete Frame V1
//! with no trailing bytes. Its fourth key is `chunkStart`, the canonical
//! twenty-digit zero-padded generation-relative byte start. The first start is
//! zero; every next start is the preceding start plus the complete stored value
//! length. A future transaction must recheck the complete token binding and the
//! exact storage tail end. Exact identical bytes already at the target may be
//! idempotent success; different bytes, gaps, overlaps, and later records fail
//! closed. Rotation must transactionally match the same tail end to
//! `acceptedPrefixBytes`.
//!
//! The plan performs no adapter request, I/O, terminal observation,
//! acknowledgement, uncertain resolution, or restart reconstruction. Cursor
//! byte provenance remains caller-trusted; non-`Clone` is ownership hygiene,
//! one-frame records add per-record overhead, and the fixed `IndexedDB` store set
//! still serializes independent scopes.
//!
//! Version `0.0.44` adds pure, nonempty
//! [`codec::LocalLogStorageAppendQueue`] ownership. A checked append plan can
//! enter the queue only through `try_into_queue` under immutable host-selected
//! [`codec::LocalLogStorageAppendQueueLimits`]. Its independent defaults admit
//! 1,024 pending frames and 64 MiB of aggregate encoded bytes; zero is an
//! explicit rejecting policy. Start rejection returns the complete unchanged
//! plan.
//!
//! `LocalLogStorageAppendQueue::try_enqueue` borrows another entry, checks
//! frame-count arithmetic and capacity before encoding, then checks exact frame
//! and aggregate-byte arithmetic/capacity before atomically advancing the one
//! final speculative cursor. Success adds that allocation behind the unchanged
//! distinguished head and returns a step with that new frame's bounded metadata
//! and admission outcome. Failure returns the complete unchanged queue and
//! leaves the entry caller-owned. Public inspection exposes exact totals,
//! remaining capacity, final speculative state, and only head metadata; it
//! exposes no raw frame, follower, pop, acknowledgement, or consuming cursor
//! edge.
//!
//! One original token remains at the queue root for the whole sequential
//! speculative prefix. It does not become a cached currentness proof: each
//! future physical head append must revalidate the complete binding. Future
//! uncertain-head state must retain logical enqueue behind the head, but must
//! block physical follower dispatch and acknowledgement until resolution. No
//! append request/attempt lifecycle, I/O, terminal attestation, resolver,
//! restart form, durable cursor release, or rotation edge exists yet. Hosts own
//! asynchronous scheduling, batching choice, admission pacing, and cancellation
//! without permission to select, coalesce, or reorder queued frames. The byte
//! ceiling excludes cursor/session/history/replay state and allocation overhead.
//! Enqueue encodes a candidate before applying that aggregate ceiling, so peak
//! transient memory may exceed it. Dropping the volatile queue is possible but
//! is neither cancellation nor acknowledgement; it loses the speculative
//! branch. Allocation failure, restart reconstruction, and stale-token rebase
//! remain outside this release.
//!
//! [`local_log::LocalLogRecovery`] can consume a caller-authoritative
//! empty-history session and a complete in-memory batch, prove one contiguous
//! genesis-anchored generation, apply all five event kinds exactly once, and
//! publish no session on error. A recovered owner can be compacted into a
//! runtime [`local_log::LocalLogCheckpointAnchor`] that retains exact replay-ID
//! tombstones and atomically recovers bound successor generations without
//! resetting sequence or history. Incremental rejection returns the unchanged
//! active owner and exact rejected entry; the complete-vector compatibility
//! boundary remains all-or-nothing. A cumulative host policy bounds
//! proof-dropping compaction, and a failed transition returns its unchanged
//! owner. Its strict durable codec requires an
//! independently trusted [`local_log::LocalLogCheckpointBinding`] and embeds
//! Session Checkpoint V1 plus complete chronological tombstones. It proves no
//! causal relationship between those values. None of these boundaries provides
//! durable storage, cryptographic integrity, rollback protection, writer
//! fencing, aggregate tail recovery, or crash-tail truncation.

pub mod action;
pub mod codec;
pub mod document;
pub mod identity;
pub mod local_log;
pub mod operation;
pub mod position;
mod record;
pub mod schema;
pub mod selection;
pub mod session;
pub mod state;
pub mod transaction;
