//! Bind a detached coordinator to the actual native log owner, not just identical saved bytes.
use super::directory::DirectoryWitness;
use crate::{Error, Result, log::Log};
use std::path::Path;
impl Log {
    pub(crate) fn guard_generation_directory(
        &self,
        path: &Path,
        expected: &DirectoryWitness,
    ) -> Result<()> {
        self.ready()?;
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("generation custody requires native generation storage"))?;
        if state.directory.path != path {
            return Err(Error::Contract("generation native owner path differs from coordinator"));
        }
        state.directory.guard_witness(expected)
    }
}
