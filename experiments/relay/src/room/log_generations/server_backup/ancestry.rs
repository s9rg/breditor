//! Full immutable A->B native/raster closure; this transport comparison grants no native owner.
use super::ServerLogGenerationRoomBackup;
use crate::{Error, Result};
impl ServerLogGenerationRoomBackup {
    pub(crate) fn check_archive_ancestor(&self, ancestor: &Self) -> Result<()> {
        self.native.check_archive_ancestor(&ancestor.native)?;
        let current = self.assets.selected_files();
        for (name, bytes) in ancestor.assets.selected_files() {
            if current.get(&name).copied() != Some(bytes) {
                return Err(Error::Contract("local archive lost or changed ancestor raster"));
            }
        }
        Ok(())
    }
}
