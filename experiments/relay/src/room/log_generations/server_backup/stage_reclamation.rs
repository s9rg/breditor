//! Explicit offline derivation and verification of a separate joined recovery archive.
use super::{ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use crate::{Error, Result};

impl ServerLogGenerationRoomBackup {
    /// Prepare a separate recovery archive with unpublished rotation stages removed.
    ///
    /// Preserve the original complete archive, including stage bytes, and its independently
    /// retained identity before calling. This consumes the admitted working copy and reuses its
    /// native backing buffer. It preserves the exact WALs, manifest chain, controls, and raster
    /// archive. The result has a new archive identity and can be restored into a fresh inactive
    /// directory using [`crate::ServerLogGenerationRoomRecovery`].
    ///
    /// The original archive remains the evidence for existing cuts. This operation makes no
    /// filesystem changes and carries no deployment or activation authority.
    ///
    /// # Errors
    /// Refuses the wrong original identity, an archive without stages, or an encoding failure.
    pub fn prepare_offline_stage_reclamation(
        self,
        expected_original: &ServerLogGenerationRoomBackupIdentity,
    ) -> Result<Self> {
        if self.identity != *expected_original {
            return Err(Error::Contract("stage reclamation original archive differs"));
        }
        let native = self.native.without_unpublished_stages()?;
        Self::from_components(native, self.assets)
    }

    /// Verify a separately admitted reclamation archive against the complete original.
    ///
    /// Compare the independently retained original identity, exact selected native files and
    /// raster archive identity. Successful verification selects the candidate for a separate
    /// restore. Native replay and host authorization remain required through the usual paths.
    ///
    /// # Errors
    /// Refuses a wrong original identity, missing original stages, any retained stage, or a
    /// difference in the selected native files or raster archive.
    pub fn verify_offline_stage_reclamation(
        &self,
        original: &Self,
        expected_original: &ServerLogGenerationRoomBackupIdentity,
    ) -> Result<()> {
        if original.identity != *expected_original {
            return Err(Error::Contract("stage reclamation original archive differs"));
        }
        if self.identity.assets != original.identity.assets {
            return Err(Error::Contract("stage reclamation raster archive differs"));
        }
        self.native.check_unpublished_stages_removed(&original.native)
    }
}
