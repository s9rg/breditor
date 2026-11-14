//! Borrow exact admitted original raster files; instance locks and restore metadata are excluded.
use super::AssetStoreBackup;
use std::collections::BTreeMap;
pub(super) fn record_name(asset: &str) -> String {
    format!("{}.asset", &asset[7..])
}

impl AssetStoreBackup {
    pub(crate) fn selected_files(&self) -> BTreeMap<String, &[u8]> {
        std::iter::once(("store.json".to_owned(), self.manifest.as_slice()))
            .chain(
                self.records
                    .iter()
                    .map(|record| (record_name(&record.info.asset), record.encoded.as_slice())),
            )
            .collect()
    }
}
