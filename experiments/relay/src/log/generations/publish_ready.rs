//! Final native restore barrier: transfer only the actual held prepared readiness inode.
use crate::{Error, Result, log::Log};
use std::fs;
impl Log {
    #[cfg(test)]
    pub(crate) fn interrupt_readiness_after_link_for_test(&mut self) -> Result<()> {
        self.ready()?;
        self.generations
            .as_mut()
            .ok_or(Error::Contract("generation owner required"))?
            .stop_ready_after_link = true;
        Ok(())
    }
    pub(crate) fn publish_generation_ready(&mut self) -> Result<()> {
        self.ready()?;
        let state = self
            .generations
            .as_mut()
            .ok_or(Error::Contract("generation readiness requires directory owner"))?;
        if state.ready_name == ".ready.json" {
            return Ok(());
        }
        if state.ready_name != ".prepared.json" {
            return Err(Error::Contract("generation readiness mode"));
        }
        self.poisoned = true;
        let result = (|| {
            state.directory.guard()?;
            let prepared = state.directory.path.join(".prepared.json");
            let target = state.directory.path.join(".ready.json");
            state.ready_identity.guard(&state.ready, &prepared)?;
            match fs::symlink_metadata(&target) {
                Ok(_) => state.ready_identity.guard(&state.ready, &target)?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    fs::hard_link(&prepared, &target)?;
                    state.directory.sync()?;
                }
                Err(error) => return Err(error.into()),
            }
            state.ready_identity.guard(&state.ready, &prepared)?;
            state.ready_identity.guard(&state.ready, &target)?;
            #[cfg(test)]
            if state.stop_ready_after_link {
                return Err(Error::Contract("test interrupted after synced ready link"));
            }
            fs::remove_file(prepared)?;
            state.directory.sync()?;
            state.ready_name = ".ready.json";
            state.guard(&self.file, self.bytes)
        })();
        if result.is_ok() {
            self.poisoned = false;
        }
        result
    }
}
