//! Borrow exact admitted original raster files; instance locks and restore metadata are excluded.
use super::AssetStoreBackup;
use std::collections::BTreeMap;
impl AssetStoreBackup {
    pub(crate) fn selected_files(&self) -> BTreeMap<String, &[u8]> {
        std::iter::once(("store.json".to_owned(), self.manifest.as_slice()))
            .chain(self.records.iter().map(|record| {
                (format!("{}.asset", &record.info.asset[7..]), record.encoded.as_slice())
            }))
            .collect()
    }
}
