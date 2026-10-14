//! Typed immutable image draft: asset binding and optional paragraph caption, no I/O.

use super::{BlockId, ImageBinding, ImageId, RichBlockDraft, RichDraftError, drafts::element};
use crate::document::{NodeRef, PropertyInteger, PropertyValue};

/// Explicit image insertion draft; complete schema and global uniqueness are deferred.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImageDraft {
    image: ImageId,
    node: NodeRef,
}

impl ImageDraft {
    /// Combine an owned block ID, checked asset binding and optional paragraph caption.
    ///
    /// Asset bytes, URLs and upload progress are deliberately absent from this value.
    ///
    /// # Errors
    /// Rejects non-paragraph captions or internal canonical AST construction failures.
    pub fn try_new(
        block: &BlockId,
        binding: &ImageBinding,
        caption: Option<RichBlockDraft>,
    ) -> Result<Self, RichDraftError> {
        if caption.as_ref().is_some_and(|draft| {
            draft
                .node()
                .as_element()
                .is_none_or(|node| node.kind().as_str() != "breditor/paragraph")
        }) {
            return Err(RichDraftError::Caption);
        }
        let mut properties = vec![
            ("block-id", PropertyValue::from_string(block.as_str())),
            ("image-id", PropertyValue::from_string(binding.image().as_str())),
            ("asset-id", PropertyValue::from_string(binding.asset().as_str())),
            ("asset-generation", PropertyValue::from_string(binding.generation().as_str())),
            ("alt-text", PropertyValue::from_string(binding.alt().text())),
            ("decorative", PropertyValue::boolean(binding.alt().is_decorative())),
        ];
        if let Some(size) = binding.size() {
            for (name, value) in [("width", size.width()), ("height", size.height())] {
                properties.push((
                    name,
                    PropertyValue::from_integer(
                        PropertyInteger::try_new(i64::from(value))
                            .map_err(|_| RichDraftError::Invariant)?,
                    ),
                ));
            }
        }
        Ok(Self {
            image: binding.image().clone(),
            node: element(
                "image",
                properties,
                caption.into_iter().map(RichBlockDraft::into_node).collect(),
            )?,
        })
    }
    /// Stable image identity; asset replacement never changes it.
    #[must_use]
    pub const fn id(&self) -> &ImageId {
        &self.image
    }
    pub(crate) fn into_node(self) -> NodeRef {
        self.node
    }
}

impl From<ImageDraft> for RichBlockDraft {
    fn from(draft: ImageDraft) -> Self {
        Self::from_node(draft.into_node())
    }
}
