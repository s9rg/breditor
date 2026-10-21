//! Private coordination with the joined raster owner. Detached witnesses never authorize service.
use super::{RecoveredLogGenerationRoom, ServerLogGenerationRecovery};
use crate::{Result, log::generations::GenerationDirectoryWitness};
impl ServerLogGenerationRecovery {
    pub(in crate::room::log_generations) fn custody(&self) -> Result<GenerationDirectoryWitness> {
        self.directory.witness()
    }
}
impl RecoveredLogGenerationRoom {
    pub(in crate::room::log_generations) fn control_root(
        &self,
    ) -> &crate::log::generations::GenerationDirectory {
        &self.directory
    }
    pub(in crate::room::log_generations) fn guard_custody(
        &self,
        expected: &GenerationDirectoryWitness,
    ) -> Result<()> {
        self.directory.guard_witness(expected)
    }
}
