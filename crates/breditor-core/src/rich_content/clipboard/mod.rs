//! Original rich clipboard semantics, separate from local history and shared backups.
//!
//! Clipboard content preserves active presentation geometry and independent
//! source-cell bodies, not inactive merge history. Copied content is re-keyed
//! before insertion; immutable assets remain host-resolved references.

mod capture;
mod capture_list;
mod error;
mod plain_text;
mod prepare;
mod rekey;
mod semantic_table;

pub use error::RichClipboardError;
pub use rekey::{RichClipboardIdAllocator, RichClipboardIdentityKind};

use super::{DocumentId, RichDocument};
use crate::{
    document::{Document, NodeRef, PropertyValue},
    state::EditorContext,
};

/// Meaning of the admitted clipboard tree; kinds are not inferred during paste.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichClipboardKind {
    /// One nonempty canonical inline fragment in a neutral paragraph wrapper.
    Text,
    /// One or more rich flow blocks, including lists, tables, images and captions.
    Flow,
    /// One visible table rectangle, preserving every base-cell partition.
    Grid,
}

/// Immutable schema-bound semantic clipboard content; no unchecked constructor exists.
#[derive(Clone, Debug)]
pub struct RichClipboardFragment {
    kind: RichClipboardKind,
    document: RichDocument,
}

impl RichClipboardFragment {
    /// Exact declared payload meaning.
    #[must_use]
    pub const fn kind(&self) -> RichClipboardKind {
        self.kind
    }
    /// Admitted fragment tree for render/export consumers; IDs are source identities, not fresh births.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }

    pub(crate) fn from_nodes(
        context: &EditorContext,
        kind: RichClipboardKind,
        nodes: Vec<NodeRef>,
    ) -> Result<Self, RichClipboardError> {
        let root = super::drafts::element(
            "document",
            vec![("document-id", PropertyValue::from_string("breditor-clipboard"))],
            nodes,
        )?;
        let document = Document::try_new(context.schema(), root, context.limits())?;
        Self::try_admit(context, kind, document)
    }
    pub(crate) fn try_admit(
        context: &EditorContext,
        kind: RichClipboardKind,
        document: Document,
    ) -> Result<Self, RichClipboardError> {
        let document = RichDocument::try_admit(context.schema(), document, context.limits())?;
        if document.id()
            != &DocumentId::try_new("breditor-clipboard")
                .map_err(|_| RichClipboardError::Invariant)?
        {
            return Err(RichClipboardError::Kind);
        }
        let root = document.document().root().as_element().ok_or(RichClipboardError::Invariant)?;
        match kind {
            RichClipboardKind::Text => {
                let node = root.children().get(0).ok_or(RichClipboardError::Kind)?;
                if root.children().len() != 1
                    || node
                        .as_element()
                        .is_none_or(|node| node.kind().as_str() != "breditor/paragraph")
                    || super::actions::text_patch::fragment(node)?.is_empty()
                {
                    return Err(RichClipboardError::Kind);
                }
            }
            RichClipboardKind::Grid => {
                let node = root.children().get(0).ok_or(RichClipboardError::Kind)?;
                if root.children().len() != 1
                    || node.as_element().is_none_or(|node| node.kind().as_str() != "breditor/table")
                    || document
                        .table_ids()
                        .next()
                        .and_then(|id| document.table(id).ok().flatten())
                        .is_none_or(|view| view.geometry().is_hidden())
                {
                    return Err(RichClipboardError::Kind);
                }
            }
            RichClipboardKind::Flow => {}
        }
        for child in root.children() {
            if semantic_table::normalize(&document, child)? != *child {
                return Err(RichClipboardError::Kind);
            }
        }
        Ok(Self { kind, document })
    }
}
