//! Semantic image binding and asynchronous completion matching, without I/O.

use super::{AssetGeneration, AssetId, ImageId};
use thiserror::Error;

/// Why semantic image metadata is inadmissible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum ImageBindingError {
    /// Paired display dimensions must each be 1 through 4096 logical pixels.
    #[error("image display dimensions must each be 1–4096")]
    Size,
    /// A nondecorative image needs a nonblank, bounded description.
    #[error("image description must contain nonblank text within 4096 UTF-8 bytes")]
    Alt,
    /// A different immutable asset cannot reuse the old binding generation.
    #[error("replacing an immutable asset requires a distinct binding generation")]
    GenerationReuse,
}

/// Atomic paired display dimensions, not decoded-raster admission evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageSize {
    width: u32,
    height: u32,
}

impl ImageSize {
    /// Check both dimensions as one semantic value.
    ///
    /// # Errors
    /// Rejects zero or dimensions above the provisional opt-in display ceiling.
    pub fn try_new(width: u32, height: u32) -> Result<Self, ImageBindingError> {
        if !(1..=4096).contains(&width) || !(1..=4096).contains(&height) {
            return Err(ImageBindingError::Size);
        }
        Ok(Self { width, height })
    }
    /// Logical display width.
    #[must_use]
    pub const fn width(self) -> u32 {
        self.width
    }
    /// Logical display height.
    #[must_use]
    pub const fn height(self) -> u32 {
        self.height
    }
}

/// Explicit decorative intent or a checked nondecorative description.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageAlt(Option<String>);

impl ImageAlt {
    /// Declare an intentionally decorative image with empty native alt text.
    #[must_use]
    pub const fn decorative() -> Self {
        Self(None)
    }
    /// Check a user-supplied nondecorative description without trimming its value.
    ///
    /// # Errors
    /// Rejects whitespace-only descriptions or text above 4096 UTF-8 bytes.
    pub fn try_description(value: String) -> Result<Self, ImageBindingError> {
        if value.trim().is_empty() || value.len() > 4096 {
            return Err(ImageBindingError::Alt);
        }
        Ok(Self(Some(value)))
    }
    /// Whether the caller deliberately declared decorative intent.
    #[must_use]
    pub const fn is_decorative(&self) -> bool {
        self.0.is_none()
    }
    /// Exact plain description; decorative images have empty alt text.
    #[must_use]
    pub fn text(&self) -> &str {
        self.0.as_deref().unwrap_or("")
    }
}

/// Immutable asset reference and semantic metadata for one stable image node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageBinding {
    image: ImageId,
    asset: AssetId,
    generation: AssetGeneration,
    alt: ImageAlt,
    size: Option<ImageSize>,
}

impl ImageBinding {
    /// Combine checked values; host resolution/upload status is not document data.
    #[must_use]
    pub const fn new(
        image: ImageId,
        asset: AssetId,
        generation: AssetGeneration,
        alt: ImageAlt,
        size: Option<ImageSize>,
    ) -> Self {
        Self { image, asset, generation, alt, size }
    }
    /// Stable image identity, retained across binary replacement.
    #[must_use]
    pub const fn image(&self) -> &ImageId {
        &self.image
    }
    /// Immutable asset identity, independent of the image node.
    #[must_use]
    pub const fn asset(&self) -> &AssetId {
        &self.asset
    }
    /// Guard generation of the current image asset binding.
    #[must_use]
    pub const fn generation(&self) -> &AssetGeneration {
        &self.generation
    }
    /// Exact semantic alt description/decorative intent.
    #[must_use]
    pub const fn alt(&self) -> &ImageAlt {
        &self.alt
    }
    /// Optional atomic display size; absence preserves intrinsic sizing policy.
    #[must_use]
    pub const fn size(&self) -> Option<ImageSize> {
        self.size
    }
    /// Replace a binary reference without changing node, alt or size identity.
    ///
    /// # Errors
    /// A different asset must carry a distinct binding generation.
    pub fn replace_asset(
        &self,
        asset: AssetId,
        generation: AssetGeneration,
    ) -> Result<Self, ImageBindingError> {
        if asset != self.asset && generation == self.generation {
            return Err(ImageBindingError::GenerationReuse);
        }
        Ok(Self::new(self.image.clone(), asset, generation, self.alt.clone(), self.size))
    }
    /// Bind an upload attempt to the exact node, asset and binding generation.
    #[must_use]
    pub fn upload_token(&self) -> UploadToken {
        UploadToken {
            image: self.image.clone(),
            asset: self.asset.clone(),
            generation: self.generation.clone(),
        }
    }
}

/// Completion target identity, not upload credentials or completion authority.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UploadToken {
    image: ImageId,
    asset: AssetId,
    generation: AssetGeneration,
}

/// Whether an asynchronous host result still targets a visible current binding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UploadCompletionMatch {
    /// Update host asset status only; do not author a new document insertion.
    CurrentBinding,
    /// The node was deleted or the asset/generation changed; never resurrect it.
    StaleOrDeleted,
}

impl UploadToken {
    /// Compare exact bindings without modifying document content or history.
    #[must_use]
    pub fn classify(&self, current: Option<&ImageBinding>) -> UploadCompletionMatch {
        if current.is_some_and(|image| {
            image.image == self.image
                && image.asset == self.asset
                && image.generation == self.generation
        }) {
            UploadCompletionMatch::CurrentBinding
        } else {
            UploadCompletionMatch::StaleOrDeleted
        }
    }
}
