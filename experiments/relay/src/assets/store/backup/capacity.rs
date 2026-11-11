//! Capacity of the current admitted raster inventory, without an archive or cleanup.
use super::{AssetStore, export, restore_files};
use crate::Result;

impl AssetStore {
    pub(crate) fn retained_storage_counters(&self) -> Result<(usize, u64)> {
        self.ready()?;
        restore_files::guard_lock(&self.root, &self.lock)?;
        export::files(self)?;
        export::manifest(self)?;
        restore_files::guard_lock(&self.root, &self.lock)?;
        Ok((self.count(), self.stored_bytes()))
    }
}
