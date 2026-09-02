//! Deterministic content kernel for the Breditor rich-text editor.
//!
//! The crate currently owns immutable document values, the minimal compiled
//! proof schema, strict versioned document, singular-operation, exact-base
//! transaction-request, contextual complete editor-state, replay-proved
//! durable commit, bounded session-checkpoint, replay-identified local-log
//! entry, complete local-log-checkpoint JSON decoding, checksummed binary
//! local-log frame scanning, atomic framed-tail observation, genesis-prefix
//! recovery, checkpoint-linked batch and incremental successor admission,
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
//! deliberately contains no browser, framework, asynchronous queue, clock,
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
//! nothing.
//! A physically absent database instead uses the separate
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
//! reset/indeterminate. Clean planned-scope absence yields retry eligibility
//! only for a non-host-committed source. With surviving host-attested commit it
//! becomes reset/indeterminate, as does a different valid scope. Physical
//! database absence, a different valid metadata incarnation, or an all-five-
//! stores-empty compatible database without `meta/profile` is reset/
//! indeterminate for every source. Any record without valid profile metadata,
//! or an expected scope whose append-only candidate association is missing, is
//! collision or corruption. Retired resolution separately validates the
//! candidate's direct successor. An exact current-predecessor successor uses
//! its privately retained, byte-derived sealed log ID and frame, both of which
//! must equal the root plan's active generation without another host scalar. A
//! retired successor's Profile V1 tombstone has discarded those JSON/sealed
//! facts, so only its retained transaction/head identity, head-index mapping,
//! and the planned active generation's `retiredBy` link are proved—not its
//! discarded contents. Candidate byte length remains identity screening, not
//! byte equality. Only
//! [`codec::LocalLogStorageRootRetryEligibleAtResolution`] can exact-resubmit,
//! under a fresh attempt ID, and that eligibility is advisory after the read
//! transaction. No outcome authenticates `IndexedDB`, proves durability or stable
//! currentness, or releases writer/semantic ownership. Rotation resolution is
//! deferred to `0.0.40`, and all Storage V1 shapes remain unstable pre-`0.1`
//! contracts.
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
