//! Collapsible sections (`breditor/details`) of the explicit candidate rich V4.
//!
//! A section is one leading `breditor/details-summary` text block followed by one
//! or more flow blocks (its body). The optional `breditor/details-open` flag is
//! persisted document state, like HTML's `open` attribute: only literal `true`
//! is canonical and absence means collapsed. Sections may nest, but no path from
//! the root may cross more than [`RICH_DETAILS_MAX_DEPTH`] sections.
use super::{BlockId, RichDocument, drafts::RichDraftError};
use crate::{
    document::{ElementNode, NodeRef, PropertyValue},
    identity::QualifiedName,
};

/// Section element kind.
pub const RICH_DETAILS_KIND: &str = "breditor/details";
/// Summary text-block kind; always the first child of a section.
pub const RICH_DETAILS_SUMMARY_KIND: &str = "breditor/details-summary";
/// AST key (without namespace) of the optional open flag.
pub(crate) const OPEN: &str = "details-open";
/// Maximum number of sections on any root-to-leaf path (a section nested in
/// seven others is admitted; an eighth level of nesting inside it is not).
pub const RICH_DETAILS_MAX_DEPTH: usize = 8;

/// Payload-free collapsible-section admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichDetailsError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("collapsible sections require the explicit rich V4 profile")]
    Profile,
    /// The target is absent or is not a collapsible section (or its summary).
    #[error("collapsible section action requires a section")]
    Target,
    /// A section must keep exactly one leading summary and a nonempty body.
    #[error("a collapsible section must keep its summary first and a nonempty body")]
    Shape,
    /// The command requires a collapsed caret inside a section summary.
    #[error("collapsible section command requires a caret in a summary")]
    Selection,
}

pub(crate) fn supports_kind(kind: &str) -> bool {
    kind == RICH_DETAILS_KIND
}

pub(crate) fn is_summary_kind(kind: &str) -> bool {
    kind == RICH_DETAILS_SUMMARY_KIND
}

pub(crate) fn is_summary_node(node: &NodeRef) -> bool {
    node.as_element().is_some_and(|element| is_summary_kind(element.kind().as_str()))
}

pub(crate) fn allows_property(kind: &str, name: &QualifiedName) -> bool {
    supports_kind(kind) && name.namespace() == "breditor" && name.local_name() == OPEN
}

/// Whether a section is expanded. Old profiles never admit the flag.
#[must_use]
pub(crate) fn is_open(node: &ElementNode) -> bool {
    super::ast_properties::property(node, OPEN).and_then(PropertyValue::as_boolean) == Some(true)
}

/// Whether `node` is a collapsed section, whose body is hidden from navigation.
pub(crate) fn is_collapsed(node: &ElementNode) -> bool {
    supports_kind(node.kind().as_str()) && !is_open(node)
}

/// Complete-tree value law for one section: `details-open` is absent or literal `true`.
pub(crate) fn validate(node: &ElementNode) -> Result<(), &'static str> {
    match super::ast_properties::property(node, OPEN) {
        None => Ok(()),
        Some(value) if value.as_boolean() == Some(true) => Ok(()),
        Some(_) => Err("collapsible section open flag must be absent or true"),
    }
}

/// Property entries for an open flag (`None` removes it).
pub(crate) fn open_properties(open: bool) -> [(&'static str, Option<PropertyValue>); 1] {
    [(OPEN, open.then(|| PropertyValue::boolean(true)))]
}

/// Re-label a summary as an ordinary paragraph with the same identity, runs and formats.
///
/// Used where a summary leaves its section (unwrap, partial copies). Any other node
/// is returned unchanged.
pub(crate) fn summary_as_paragraph(node: &NodeRef) -> Result<NodeRef, RichDraftError> {
    let Some(element) = node.as_element().filter(|e| is_summary_kind(e.kind().as_str())) else {
        return Ok(node.clone());
    };
    let id = super::ast_properties::string(element, "block-id")
        .map_err(|_| RichDraftError::Invariant)?;
    super::drafts::element(
        "paragraph",
        vec![("block-id", PropertyValue::from_string(id))],
        element.children().to_vec(),
    )
}

/// Resolve one admitted section element by identity.
pub(crate) fn section<'a>(
    document: &'a RichDocument,
    block: &BlockId,
) -> Result<&'a ElementNode, RichDetailsError> {
    document
        .block_path(block)
        .and_then(|path| document.document().node_at(path).ok())
        .and_then(NodeRef::as_element)
        .filter(|node| supports_kind(node.kind().as_str()))
        .ok_or(RichDetailsError::Target)
}

/// Identity of the section that directly owns `summary`, when it is a summary.
pub(crate) fn owner_of_summary(document: &RichDocument, summary: &BlockId) -> Option<BlockId> {
    let path = document.block_path(summary)?;
    let node = document.document().node_at(path).ok()?.as_element()?;
    if !is_summary_kind(node.kind().as_str()) {
        return None;
    }
    let parent = document.document().node_at(&path.parent()?).ok()?.as_element()?;
    BlockId::try_new(super::ast_properties::string(parent, "block-id").ok()?).ok()
}
