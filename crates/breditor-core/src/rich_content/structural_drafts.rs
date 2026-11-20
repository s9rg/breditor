//! Immutable V2 structural drafts; complete schema/identity/resource proof remains at publication.

use super::{BlockId, CodeLanguage, RichBlockDraft, RichDraftError, drafts::element};
use crate::document::{NodeRef, PropertyValue, TextFragment, TextRun};

impl RichBlockDraft {
    /// Nonempty blockquote retaining each explicitly supplied rich flow subtree.
    ///
    /// # Errors
    /// Rejects empty bodies or AST construction failure. The selected profile must admit V2.
    pub fn blockquote(id: &BlockId, body: Vec<Self>) -> Result<Self, RichDraftError> {
        if body.is_empty() {
            return Err(RichDraftError::EmptyBlockquote);
        }
        Ok(Self::from_node(element(
            "blockquote",
            vec![("block-id", PropertyValue::from_string(id.as_str()))],
            body.into_iter().map(Self::into_node).collect(),
        )?))
    }
    /// Candidate-V4 collapsible section: one summary with canonical (possibly formatted)
    /// text, an explicit persisted open state and a nonempty retained flow body.
    ///
    /// # Errors
    /// Rejects an empty body or AST construction failure. The selected profile must admit
    /// V4; the nesting bound and summary formats are checked at publication.
    pub fn details(
        id: &BlockId,
        summary: &BlockId,
        text: &TextFragment,
        open: bool,
        body: Vec<Self>,
    ) -> Result<Self, RichDraftError> {
        if body.is_empty() {
            return Err(RichDraftError::EmptyDetails);
        }
        let summary = element(
            "details-summary",
            vec![("block-id", PropertyValue::from_string(summary.as_str()))],
            text.iter().cloned().map(TextRun::into_text_node).map(NodeRef::text).collect(),
        )?;
        let mut properties = vec![("block-id", PropertyValue::from_string(id.as_str()))];
        if open {
            properties.push((super::details::OPEN, PropertyValue::boolean(true)));
        }
        Ok(Self::from_node(element(
            "details",
            properties,
            std::iter::once(summary).chain(body.into_iter().map(Self::into_node)).collect(),
        )?))
    }
    /// Plain-text code preserving Unicode and every LF/CR/tab exactly, with an optional inert language token.
    ///
    /// # Errors
    /// Rejects any formatted run; no styles are silently removed by this constructor.
    pub fn code_block(
        id: &BlockId,
        language: Option<&CodeLanguage>,
        text: &TextFragment,
    ) -> Result<Self, RichDraftError> {
        if text.iter().any(|run| !run.formats().is_empty()) {
            return Err(RichDraftError::CodeFormats);
        }
        let mut properties = vec![("block-id", PropertyValue::from_string(id.as_str()))];
        if let Some(language) = language {
            properties.push(("language", PropertyValue::from_string(language.as_str())));
        }
        Ok(Self::from_node(element(
            "code-block",
            properties,
            text.iter().cloned().map(TextRun::into_text_node).map(NodeRef::text).collect(),
        )?))
    }
    /// Atomic horizontal rule with an explicit stable identity and no child/content properties.
    ///
    /// # Errors
    /// Rejects an internal AST construction invariant; profile/resource admission is deferred.
    pub fn horizontal_rule(id: &BlockId) -> Result<Self, RichDraftError> {
        Ok(Self::from_node(element(
            "horizontal-rule",
            vec![("block-id", PropertyValue::from_string(id.as_str()))],
            vec![],
        )?))
    }
}

/// Task item with an explicit checked bit, leading prose block and retained rich tail.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichTaskItemDraft(NodeRef);
impl RichTaskItemDraft {
    /// Build a task item; checked state is never derived from text, CSS or a checkbox DOM node.
    ///
    /// # Errors
    /// Rejects a non-paragraph/heading head or AST construction invariant.
    pub fn try_new(
        id: &BlockId,
        checked: bool,
        head: RichBlockDraft,
        tail: Vec<RichBlockDraft>,
    ) -> Result<Self, RichDraftError> {
        if head.node().as_element().is_none_or(|node| {
            !matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading")
        }) {
            return Err(RichDraftError::ListShape);
        }
        let mut children = vec![head.into_node()];
        children.extend(tail.into_iter().map(RichBlockDraft::into_node));
        Ok(Self(element(
            "task-item",
            vec![
                ("block-id", PropertyValue::from_string(id.as_str())),
                ("checked", PropertyValue::boolean(checked)),
            ],
            children,
        )?))
    }
}
/// Explicit nonempty task list. Ordinary list items and task items are distinct grammar kinds.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichTaskListDraft(NodeRef);
impl RichTaskListDraft {
    /// Build a task list without manufacturing item identities or leading paragraphs.
    ///
    /// # Errors
    /// Rejects an empty list or internal AST construction invariant.
    pub fn try_new(id: &BlockId, items: Vec<RichTaskItemDraft>) -> Result<Self, RichDraftError> {
        if items.is_empty() {
            return Err(RichDraftError::EmptyList);
        }
        Ok(Self(element(
            "task-list",
            vec![("block-id", PropertyValue::from_string(id.as_str()))],
            items.into_iter().map(|item| item.0).collect(),
        )?))
    }
}
impl From<RichTaskListDraft> for RichBlockDraft {
    fn from(value: RichTaskListDraft) -> Self {
        Self::from_node(value.0)
    }
}
