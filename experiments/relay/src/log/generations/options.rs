//! Explicit new-directory configuration, never an upgrade hint for an original log file.
use crate::{Error, Result};

/// Birth identities for the separate automatically rotating server log storage family.
/// Original Room constructors and formats remain unchanged. Rotation preserves all files.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerLogGenerationOptions {
    /// Opaque identity of the immutable original root file.
    pub root: String,
    /// Distinct first continuation identity; later physical rotations use lifetime-new IDs.
    pub active: String,
}
impl ServerLogGenerationOptions {
    pub(crate) fn validate(&self) -> Result<()> {
        generation(&self.root)?;
        generation(&self.active)?;
        if self.root == self.active {
            return Err(Error::Contract("log generation IDs must differ"));
        }
        Ok(())
    }
}
pub(crate) fn generation(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 128
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
    {
        return Err(Error::Contract("log generation identity"));
    }
    Ok(())
}
