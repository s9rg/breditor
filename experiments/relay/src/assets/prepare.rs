//! Pure native raster admission before disk mutation or durable acknowledgement.
use super::{AssetInfo, RasterMime, types::key};
use crate::{Error, Result};
use image::{ImageFormat, ImageReader};
use sha2::{Digest, Sha256};
use std::{fmt::Write, io::Cursor};

/// Hash encoded bytes, not a re-encoded image. This identity alone is NOT raster admission.
#[must_use]
pub fn asset_id(bytes: &[u8]) -> String {
    let mut value = "sha256:".to_owned();
    for byte in Sha256::digest(bytes) {
        let _ = write!(value, "{byte:02x}");
    }
    value
}
/// Exclusive admitted payload. Its proof cannot be manufactured by changing public metadata.
pub struct PreparedAsset {
    pub(super) info: AssetInfo,
    pub(super) bytes: Vec<u8>,
}
impl PreparedAsset {
    /// Read the admitted identity/geometry without exposing mutable proof fields.
    #[must_use]
    pub const fn info(&self) -> &AssetInfo {
        &self.info
    }

    #[cfg(feature = "server")]
    pub(crate) fn from_worker(
        info: AssetInfo,
        expected: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> Result<Self> {
        info.validate().map_err(|_| Error::NeedsRecovery)?;
        if info.asset != expected
            || info.mime.as_str() != mime
            || u64::try_from(bytes.len()).ok() != Some(info.bytes)
            || asset_id(&bytes) != expected
        {
            return Err(Error::NeedsRecovery);
        }
        Ok(Self { info, bytes })
    }
}
fn reader(bytes: &[u8]) -> Result<ImageReader<Cursor<&[u8]>>> {
    let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(super::MAX_DIMENSION);
    limits.max_image_height = Some(super::MAX_DIMENSION);
    // Best-effort codec allocation limit, NOT a process isolation or adversarial work guarantee.
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    Ok(reader)
}
pub(crate) fn encoded_input(expected: &str, mime: &str, size: usize) -> Result<(RasterMime, u64)> {
    key(expected)?;
    let mime = RasterMime::parse(mime)?;
    let length = u64::try_from(size).map_err(|_| Error::Contract("asset bytes"))?;
    if length == 0 || length > super::MAX_ASSET_BYTES {
        return Err(Error::Contract("asset encoded byte budget"));
    }
    Ok((mime, length))
}

/// Admit exact digest, encoding, geometry and native decoding before any persistence.
/// # Errors
/// Rejects wrong digest/MIME, invalid/unsupported images, existing byte/dimension/pixel ceilings
/// and codec failures. This function decodes in the calling process.
pub fn prepare_asset(expected: &str, mime: &str, bytes: Vec<u8>) -> Result<PreparedAsset> {
    let (mime, length) = encoded_input(expected, mime, bytes.len())?;
    if asset_id(&bytes) != expected {
        return Err(Error::Contract("asset payload digest"));
    }
    let format = reader(&bytes)?.format();
    let actual = match format {
        Some(ImageFormat::Png) => RasterMime::Png,
        Some(ImageFormat::Jpeg) => RasterMime::Jpeg,
        Some(ImageFormat::WebP) => RasterMime::Webp,
        _ => return Err(Error::Contract("supported raster encoding required")),
    };
    if actual != mime {
        return Err(Error::Contract("asset MIME does not match bytes"));
    }
    let (width, height) = reader(&bytes)?
        .into_dimensions()
        .map_err(|_| Error::Contract("asset raster dimensions"))?;
    let info = AssetInfo { asset: expected.into(), mime, bytes: length, width, height };
    info.validate()?;
    let decoded = reader(&bytes)?.decode().map_err(|_| Error::Contract("asset raster decode"))?;
    if decoded.width() != width || decoded.height() != height {
        return Err(Error::Contract("asset decoded dimensions differ"));
    }
    drop(decoded);
    Ok(PreparedAsset { info, bytes })
}
