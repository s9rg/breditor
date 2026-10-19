//! Verify a live complete store retains every original immutable archive record exactly.
use super::{AssetBackupIdentity, AssetStore, AssetStoreBackup};
use crate::{Error, Result};
use std::collections::BTreeMap;

impl AssetStore {
    pub(crate) fn verify_retained_backup(
        &mut self,
        original: &AssetStoreBackup,
    ) -> Result<AssetBackupIdentity> {
        // Re-admits all current native files, including additional unreferenced complete records.
        let current = self.export_backup()?;
        if current.identity.binding != original.identity.binding
            || current.manifest != original.manifest
        {
            return Err(Error::Contract("operational asset manifest differs"));
        }
        let records =
            current.records.iter().map(|r| (r.info.asset.as_str(), r)).collect::<BTreeMap<_, _>>();
        for before in &original.records {
            let after = records
                .get(before.info.asset.as_str())
                .ok_or(Error::Contract("operational original asset absent"))?;
            if before.info != after.info || before.encoded != after.encoded {
                return Err(Error::Contract("operational original asset differs"));
            }
        }
        Ok(current.identity)
    }
}
