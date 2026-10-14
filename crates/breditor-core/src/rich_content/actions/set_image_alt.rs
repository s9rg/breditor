//! Atomic description/decorative-intent change; never infer decorative from blank text.

use super::{
    RichAction, RichActionError, RichEdit, guard::TargetGuard, rewrite_properties::rewrite,
};
use crate::rich_content::{ImageAlt, ImageBinding, ImageId, RichDocument};
use crate::{document::PropertyValue, state::EditorContext};

/// Captured local semantic image-description change with an exact inverse.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetImageAlt {
    guard: TargetGuard,
    expected: ImageBinding,
    alt: ImageAlt,
}

impl SetImageAlt {
    /// Capture the image binding and an already checked explicit alt intent.
    ///
    /// # Errors
    /// Rejects an absent image or inconsistent private AST directory.
    pub fn capture(
        document: &RichDocument,
        image: &ImageId,
        alt: ImageAlt,
    ) -> Result<Self, RichActionError> {
        let path = document.image_path(image).ok_or(RichActionError::MissingTarget)?;
        Ok(Self {
            guard: TargetGuard::capture(document, path)?,
            expected: document.image(image)?.ok_or(RichActionError::MissingTarget)?,
            alt,
        })
    }

    /// Apply the paired description/intent without touching caption, size or asset.
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
        if current.alt() == &self.alt {
            return Ok(None);
        }
        let candidate = rewrite(
            context,
            document,
            path,
            [
                ("alt-text", Some(PropertyValue::from_string(self.alt.text()))),
                ("decorative", Some(PropertyValue::boolean(self.alt.is_decorative()))),
            ],
        )?;
        let inverse = Self::capture(&candidate, self.expected.image(), current.alt().clone())?;
        Ok(Some(RichEdit { document: candidate, inverse: RichAction::SetImageAlt(inverse) }))
    }
}
