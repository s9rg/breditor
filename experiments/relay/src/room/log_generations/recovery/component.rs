//! Select an actual newly created component inode; never rename over or adopt a fixed directory.
use super::{ServerLogGenerationRecovery, files, types::Component};
use crate::{Error, Result, credentials, log::generations::GenerationDirectory};
impl ServerLogGenerationRecovery {
    pub(super) fn component(&self) -> Result<Option<Component>> {
        let path = self.directory.path.join(".component.json");
        if !files::exists(&path)? {
            return Ok(None);
        }
        let value: Component = files::read(&path)?;
        let nonce = value
            .directory
            .strip_prefix(".room-")
            .ok_or(Error::Contract("generation recovery component name"))?;
        credentials::hash(nonce)?;
        if value.format != "breditor/relay-generation-recovery-component"
            || value.format_version != 1
            || value.recovery != self.marker.id
        {
            return Err(Error::Contract("generation recovery component selection"));
        }
        Ok(Some(value))
    }
    pub(super) fn open_component(&self, value: &Component) -> Result<GenerationDirectory> {
        let directory = GenerationDirectory::open(&self.directory.path.join(&value.directory))?;
        directory.guard_witness(&value.witness)?;
        Ok(directory)
    }
    pub(super) fn prepare_component(&self) -> Result<(Component, GenerationDirectory)> {
        if let Some(value) = self.component()? {
            let directory = self.open_component(&value)?;
            return Ok((value, directory));
        }
        let name = format!(".room-{}", credentials::issue()?);
        let directory = GenerationDirectory::create(&self.directory.path.join(&name))?;
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::ComponentCreated)?;
        let value = Component {
            format: "breditor/relay-generation-recovery-component".into(),
            format_version: 1,
            recovery: self.marker.id.clone(),
            directory: name,
            witness: directory.witness()?,
        };
        files::insert(&self.directory, ".component.json", &files::encode(&value)?)?;
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::ComponentSelected)?;
        Ok((value, directory))
    }
}
