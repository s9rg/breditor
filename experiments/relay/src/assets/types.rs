//! Closed raster metadata and independent durable upload receipts.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

/// Supported raster encodings. SVG/HTML and active document URLs are not asset payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RasterMime {
    /// Portable Network Graphics.
    #[serde(rename = "image/png")]
    Png,
    /// JPEG raster.
    #[serde(rename = "image/jpeg")]
    Jpeg,
    /// WebP raster.
    #[serde(rename = "image/webp")]
    Webp,
}
impl RasterMime {
    /// Exact HTTP MIME spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Webp => "image/webp",
        }
    }
    pub(super) fn parse(value: &str) -> Result<Self> {
        match value {
            "image/png" => Ok(Self::Png),
            "image/jpeg" => Ok(Self::Jpeg),
            "image/webp" => Ok(Self::Webp),
            _ => Err(Error::Contract("supported raster MIME required")),
        }
    }
}

/// Actual admitted immutable bytes, not dimensions or identity trusted from an upload request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetInfo {
    /// SHA-256 of the exact original encoded bytes, with `sha256:` prefix.
    pub asset: String,
    /// Encoding proved from the bytes and a successful native decode.
    pub mime: RasterMime,
    /// Encoded payload byte length.
    pub bytes: u64,
    /// Declared/decoded width, before optional display orientation.
    pub width: u32,
    /// Declared/decoded height, before optional display orientation.
    pub height: u32,
}
impl AssetInfo {
    pub(super) fn validate(&self) -> Result<()> {
        key(&self.asset)?;
        if self.bytes == 0
            || self.bytes > super::MAX_ASSET_BYTES
            || self.width == 0
            || self.height == 0
            || self.width > super::MAX_DIMENSION
            || self.height > super::MAX_DIMENSION
            || u64::from(self.width) * u64::from(self.height) > super::MAX_PIXELS
        {
            return Err(Error::Contract("asset metadata budget"));
        }
        Ok(())
    }
}
pub(super) fn key(value: &str) -> Result<&str> {
    let hex = value.strip_prefix("sha256:").ok_or(Error::Contract("asset digest identity"))?;
    if hex.len() != 64 || !hex.bytes().all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(&v)) {
        return Err(Error::Contract("canonical asset digest identity"));
    }
    Ok(hex)
}

/// Returned only after durable bytes and their final directory entry have been synced.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetReceipt {
    format: &'static str,
    format_version: u32,
    /// Immutable actual metadata, flattened in the original V1 wire receipt.
    #[serde(flatten)]
    pub info: AssetInfo,
    /// Exact existing bytes were revalidated; no second asset was created.
    pub duplicate: bool,
}
impl AssetReceipt {
    pub(super) const fn new(info: AssetInfo, duplicate: bool) -> Self {
        Self { format: "breditor/relay-asset-receipt", format_version: 1, info, duplicate }
    }
}
/// A separately owned read copy. Changing it cannot change the store or document history.
pub struct StoredAsset {
    /// Verified immutable metadata.
    pub info: AssetInfo,
    /// Exact original encoded raster bytes.
    pub bytes: Vec<u8>,
}
