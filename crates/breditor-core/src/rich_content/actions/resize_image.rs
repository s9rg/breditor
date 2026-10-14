//! Atomic paired image display-size change, with stable-ID guard and exact inverse.

use super::{
    RichAction, RichActionError, RichEdit,
    guard::TargetGuard,
    rewrite_properties::{integer, rewrite},
};
use crate::rich_content::{ImageBinding, ImageId, ImageSize, RichDocument};
use crate::{document::PropertyValue, state::EditorContext};

/// Captured local image-size action; `None` restores intrinsic sizing policy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResizeImage {
    guard: TargetGuard,
    expected: ImageBinding,
    size: Option<ImageSize>,
}

impl ResizeImage {
    /// Capture a stable image and its complete current semantic binding.
    ///
    /// # Errors
    /// Rejects an absent image or inconsistent private AST directory.
    pub fn capture(
        document: &RichDocument,
        image: &ImageId,
        size: Option<ImageSize>,
    ) -> Result<Self, RichActionError> {
        let path = document.image_path(image).ok_or(RichActionError::MissingTarget)?;
        Ok(Self {
            guard: TargetGuard::capture(document, path)?,
            expected: document.image(image)?.ok_or(RichActionError::MissingTarget)?,
            size,
        })
    }

    /// Apply both dimensions together, preserving asset, alt, caption and identity.
    ///
    /// # Errors
    /// Rejects a different document/schema, changed binding, missing image or host policy.
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
        if current.size() == self.size {
            return Ok(None);
        }
        let dimensions: [(&'static str, Option<PropertyValue>); 2] = [
            ("width", self.size.map(|size| integer(size.width())).transpose()?),
            ("height", self.size.map(|size| integer(size.height())).transpose()?),
        ];
        let candidate = rewrite(context, document, path, dimensions)?;
        let inverse = Self::capture(&candidate, self.expected.image(), current.size())?;
        Ok(Some(RichEdit { document: candidate, inverse: RichAction::ResizeImage(inverse) }))
    }
}
