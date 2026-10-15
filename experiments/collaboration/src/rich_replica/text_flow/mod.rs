//! Stable text fragments used by shared paragraph split/join lowering.
//!
//! A paragraph is an ordered tree of text fragments, not ownership of a single
//! text container. Splitting assigns existing characters to a fragment; joining
//! reparents a text root. Neither operation copies, deletes or reinserts text.
//! Loro remains responsible for character identities, causal replication and
//! selective undo. `RichReplica` model revision 10 uses these roots for all text
//! actions and paragraph boundaries. Creation-time characters retain identity
//! outside history and their provenance follows owned birth visibility. The
//! separate low-level fixture API still requires a staged caller.
//!
//! Mutations belong on a disposable staged engine document. Prepare permanent
//! definitions with undo paused, commit, then apply the prepared action with
//! undo recording. Preparation is infrastructure, not user history. Applying a
//! stale plan rejects before writing; failures after writing must discard the
//! staged owner. No caller may publish an unvalidated shared AST from this API.

mod anchor;
mod continuation;
mod cuts;
mod delete;
pub mod fixture;
mod format;
mod graph;
mod history;
mod index;
mod insert;
mod join;
mod markers;
mod projection;
pub(in crate::rich_replica) mod provenance;
mod split;

pub use anchor::FlowAnchor;
pub use delete::delete;
pub use format::set_format;
pub use index::{Chunk, Point, View};
pub use insert::insert;
pub(in crate::rich_replica) use insert::insert_with_activation;
pub use join::PreparedJoin;
pub(in crate::rich_replica) use projection::Projection;
pub use split::PreparedSplit;

pub(in crate::rich_replica) fn intervals(
    doc: &loro::LoroDoc,
    block: &str,
    offset: u32,
    length: u32,
) -> Result<Vec<Chunk>, crate::Error> {
    index::Index::read(doc)?.intervals(block, offset, length)
}

pub(in crate::rich_replica) fn prepared(doc: &loro::LoroDoc, block: &str) -> bool {
    doc.get_map("text-flow-definitions").get(&graph::root(block)).is_some()
}

use crate::Error;
use loro::{ExpandType, LoroDoc, StyleConfig, StyleConfigMap};

/// Configure the isolated text-flow model before authoring/importing operations.
///
/// Format annotations keep their explicit typing policy. Fragment annotations
/// inherit at both boundaries: an offline insertion must retain its surrounding
/// text ownership. An observed logical insertion explicitly corrects ownership
/// when adjacent fragments would otherwise leak across that boundary.
pub fn configure(doc: &LoroDoc) {
    doc.get_map("annotation-ownership");
    doc.config_default_text_style(Some(StyleConfig::default()));
    let mut styles = StyleConfigMap::new();
    styles.insert("breditor_fragment".into(), StyleConfig { expand: ExpandType::Both });
    doc.config_text_style(styles);
}

/// Activate a paragraph's canonical root and empty/birth fragments outside undo.
///
/// # Errors
/// Rejects invalid identities, conflicting definitions and malformed engine data.
pub fn prepare_root(doc: &LoroDoc, block: &str) -> Result<(), Error> {
    graph::prepare_root(doc, block)
}

/// Read a paragraph's ordered characters and their original source intervals.
///
/// # Errors
/// Rejects missing definitions, malformed annotations, invalid graphs or budgets.
pub fn view(doc: &LoroDoc, block: &str) -> Result<View, Error> {
    index::Index::read(doc)?.view(block)
}

/// Resolve a scalar-aligned logical caret to its immutable text source.
///
/// # Errors
/// Rejects absent roots, out-of-bounds positions and split surrogate pairs.
pub fn point(
    doc: &LoroDoc,
    block: &str,
    offset: u32,
    affinity: crate::anchor::Affinity,
) -> Result<Point, Error> {
    index::Index::read(doc)?.point(doc, block, offset, affinity)
}

#[cfg(test)]
mod tests;
