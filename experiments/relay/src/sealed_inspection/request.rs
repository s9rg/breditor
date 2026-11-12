//! Parse the explicit host selection and bound all file and credential inputs.
use super::Result;
use breditor_collab_relay::server::{
    PreparedNativeGenerationActivationIdentity, SealedNativeRestartBootstrap,
    ServerLogGenerationRecoveryStateIdentity,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Mode {
    Complete,
    NativeTail,
    RasterUpload,
    Rotation,
    NativeTailAndRaster,
    RotationAndRaster,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    format: String,
    format_version: u32,
    pub(super) mode: Mode,
    pub(super) principal: String,
    source_root: PathBuf,
    checkpoint_root: PathBuf,
    authority_root: PathBuf,
    operational_root: PathBuf,
    expected_checkpoint: PreparedNativeGenerationActivationIdentity,
    expected_current: ServerLogGenerationRecoveryStateIdentity,
    pub(super) minimum_archive: Option<PathBuf>,
}

impl Request {
    pub(super) fn read(path: &Path) -> Result<Self> {
        let request: Self = serde_json::from_slice(&read_regular(path, 256 * 1024)?)
            .map_err(|_| "invalid sealed inspection request")?;
        if request.format != "breditor/sealed-room-inspection-request"
            || request.format_version != 1
        {
            return Err("unsupported sealed inspection request".into());
        }
        Ok(request)
    }

    pub(super) fn bootstrap(&self) -> Result<SealedNativeRestartBootstrap> {
        Ok(SealedNativeRestartBootstrap {
            source_root: self.source_root.canonicalize()?,
            checkpoint_root: self.checkpoint_root.canonicalize()?,
            authority_root: self.authority_root.canonicalize()?,
            operational_root: self.operational_root.canonicalize()?,
            expected_checkpoint: self.expected_checkpoint.clone(),
            expected_current: self.expected_current.clone(),
        })
    }
}

pub(super) fn read_regular(path: &Path, limit: u64) -> Result<Vec<u8>> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err("sealed inspection input must be a regular file".into());
    }
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err("sealed inspection input exceeds its byte budget".into());
    }
    let mut bytes = Vec::new();
    bytes.try_reserve_exact(usize::try_from(metadata.len())?)?;
    file.take(metadata.len() + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 != metadata.len() {
        return Err("sealed inspection input length changed".into());
    }
    Ok(bytes)
}

pub(super) fn read_token(reader: impl Read) -> Result<String> {
    let mut bytes = Vec::with_capacity(67);
    reader.take(67).read_to_end(&mut bytes)?;
    if bytes.ends_with(b"\r\n") {
        bytes.truncate(bytes.len() - 2);
    } else if bytes.ends_with(b"\n") {
        bytes.pop();
    }
    if bytes.len() != 64
        || !bytes.iter().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err("provide one owner token on stdin".into());
    }
    Ok(String::from_utf8(bytes)?)
}
