//! Deterministic content kernel for the Breditor rich-text editor.
//!
//! The crate currently owns immutable document values, the minimal compiled
//! proof schema, strict versioned document, singular-operation, exact-base
//! transaction-request, contextual complete editor-state, replay-proved
//! durable commit, bounded session-checkpoint, and replay-identified local-log
//! entry JSON decoding,
//! snapshot-local points and
//! selections, immutable editor states, paragraph-local text splices,
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
//! [`codec::CommitJsonCodec`]. The
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
