//! Deterministic content kernel for the Breditor rich-text editor.
//!
//! The crate currently owns immutable document values, the minimal compiled
//! proof schema, strict versioned JSON decoding, snapshot-local points and
//! selections, immutable editor states, paragraph-local text splices, atomic
//! transactions, relocation, and exact in-memory undo/redo requests. It
//! deliberately contains no browser, framework, asynchronous queue, clock,
//! random-number, collaboration, or Wasm binding code.
//!
//! # Construction boundary
//!
//! Runtime [`document::Document`] and [`document::NodeRef`] values cannot be
//! deserialized directly. Untrusted data must pass through [`codec::DocumentJsonCodec`],
//! which checks the versioned record, schema identity, canonicality, limits, and
//! complete tree before publishing a runtime document. That same successful
//! validation derives the document's exact cached [`document::DocumentSummary`];
//! the summary is runtime metadata and never enters the document wire record.

pub mod codec;
pub mod document;
pub mod identity;
pub mod operation;
pub mod position;
mod record;
pub mod schema;
pub mod selection;
pub mod state;
pub mod transaction;
