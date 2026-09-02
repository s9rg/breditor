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
//! [`codec::LocalLogStorageGenerationJsonCodec`] now provides strict,
//! rotation-only validation for the unstable pre-`0.1`
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
//! There is deliberately no public seed/provisioning path yet, and this crate
//! still exports no prepared/committed/uncertain typestate, receipt, adapter, or
//! storage I/O API. Checkpoint V1 and Frame V1 are unchanged.
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
