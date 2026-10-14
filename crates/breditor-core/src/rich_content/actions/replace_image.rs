//! Atomically replace an image asset/generation pair, retaining node and caption identities.

use super::{
    RichAction, RichActionError, RichEdit, guard::TargetGuard, rewrite_properties::rewrite,
};
use crate::{
    document::PropertyValue,
    rich_content::{AssetGeneration, AssetId, ImageBinding, ImageId, RichDocument},
    state::EditorContext,
};

/// Guarded semantic asset replacement, with no upload/network side effects.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaceImage {
    guard: TargetGuard,
    expected: ImageBinding,
    replacement: ImageBinding,
}

impl ReplaceImage {
    /// Capture a new immutable asset/generation while preserving alt, size and caption.
    ///
    /// # Errors
    /// Rejects absent images or a different asset reusing its old binding generation.
    pub fn capture(
        document: &RichDocument,
        image: &ImageId,
        asset: AssetId,
        generation: AssetGeneration,
    ) -> Result<Self, RichActionError> {
        let path = document.image_path(image).ok_or(RichActionError::MissingTarget)?;
        let expected = document.image(image)?.ok_or(RichActionError::MissingTarget)?;
        let replacement = expected.replace_asset(asset, generation)?;
        Ok(Self { guard: TargetGuard::capture(document, path)?, expected, replacement })
    }

    /// Publish one paired replacement and exact local inverse; unchanged binding is a no-op.
    ///
    /// Captions remain untouched, including text edited after this action was captured.
    /// Old upload tokens become stale, but their host asset bytes are not deleted here.
    ///
    /// # Errors
    /// Rejects changed semantic bindings, missing images or active schema/resource policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let path =
            document.image_path(self.expected.image()).ok_or(RichActionError::MissingTarget)?;
        self.guard.check(context, document, path)?;
        let current =
            document.image(self.expected.image())?.ok_or(RichActionError::MissingTarget)?;
        if current != self.expected {
            return Err(RichActionError::StaleTarget);
        }
        if current == self.replacement {
            return Ok(None);
        }
        let candidate = rewrite(
            context,
            document,
            path,
            [
                ("asset-id", Some(PropertyValue::from_string(self.replacement.asset().as_str()))),
                (
                    "asset-generation",
                    Some(PropertyValue::from_string(self.replacement.generation().as_str())),
                ),
            ],
        )?;
        let inverse = Self::capture(
            &candidate,
            self.expected.image(),
            self.expected.asset().clone(),
            self.expected.generation().clone(),
        )?;
        Ok(Some(RichEdit {
            before: document.clone(),
            document: candidate,
            inverse: RichAction::ReplaceImage(inverse),
        }))
    }
}
