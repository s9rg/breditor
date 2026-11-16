//! Byte identity for independently held continued-room repair evidence.
use crate::{Error, Result, server::generation_recovery::RetainedRepairFile};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Fingerprint {
    pub(super) bytes: u64,
    sha256: [u8; 32],
}

impl Fingerprint {
    pub(super) fn of(bytes: &[u8]) -> Self {
        Self { bytes: bytes.len() as u64, sha256: Sha256::digest(bytes).into() }
    }

    pub(super) fn sync_evidence(
        &self,
        file: &RetainedRepairFile,
        error: &'static str,
    ) -> Result<()> {
        if file.digest(self.bytes)? != self.sha256 {
            return Err(Error::Contract(error));
        }
        file.sync()
    }
}
