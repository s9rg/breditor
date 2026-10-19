//! Reject anything outside this exact restore attempt; no deletion or prefix repair during resume.
use super::{AssetRestore, AssetRestoreProgress, AssetStoreBackup, restore_files};
use crate::{Error, Result};
use std::{collections::BTreeSet, fs};

impl AssetRestore {
    pub(super) fn stage(&self, asset: &str) -> Result<String> {
        let marker =
            self.marker.as_ref().ok_or(Error::Contract("asset restore already complete"))?;
        Ok(format!(".restore-{}-{}", marker.id, &asset[7..]))
    }
    pub(super) fn manifest_stage(&self) -> Result<String> {
        let marker =
            self.marker.as_ref().ok_or(Error::Contract("asset restore already complete"))?;
        Ok(format!(".restore-manifest-{}", marker.id))
    }
    pub(super) fn check(&self, backup: &AssetStoreBackup) -> Result<AssetRestoreProgress> {
        if self.identity != backup.identity {
            return Err(Error::Contract("asset restore selected archive"));
        }
        restore_files::guard_lock(&self.root, &self.lock)?;
        let mut allowed = BTreeSet::from([".lock".to_owned(), "store.json".to_owned()]);
        if let Some(marker) = &self.marker {
            allowed.insert(".restore.json".into());
            allowed.insert(self.manifest_stage()?);
            restore_files::exact(&self.root.join(".restore.json"), &serde_json::to_vec(marker)?)?;
        }
        let mut complete_assets = 0;
        let mut complete_bytes = 0;
        let mut stages = 0;
        for asset in &backup.records {
            let name = format!("{}.asset", &asset.info.asset[7..]);
            allowed.insert(name.clone());
            if restore_files::exists(&self.root.join(&name))? {
                restore_files::exact(&self.root.join(&name), &asset.encoded)?;
                complete_assets += 1;
                complete_bytes += asset.info.bytes;
            }
            if self.marker.is_some() {
                let name = self.stage(&asset.info.asset)?;
                allowed.insert(name.clone());
                if restore_files::exists(&self.root.join(&name))? {
                    restore_files::prefix(&self.root.join(name), &asset.encoded)?;
                    stages += 1;
                }
            }
        }
        let manifest = restore_files::exists(&self.root.join("store.json"))?;
        if manifest {
            restore_files::exact(&self.root.join("store.json"), &backup.manifest)?;
            if complete_assets != backup.records.len() {
                return Err(Error::Contract("asset restore incomplete published manifest"));
            }
        }
        if self.marker.is_some() && restore_files::exists(&self.root.join(self.manifest_stage()?))?
        {
            restore_files::prefix(&self.root.join(self.manifest_stage()?), &backup.manifest)?;
            stages += 1;
        }
        let mut count = 0;
        for entry in fs::read_dir(&self.root)? {
            count += 1;
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("asset restore unknown filename"))?;
            if count > backup.records.len() * 2 + 4
                || !allowed.contains(&name)
                || !entry.file_type()?.is_file()
            {
                return Err(Error::Contract("asset restore unknown file"));
            }
        }
        let ready = self.marker.is_none()
            && manifest
            && complete_assets == backup.records.len()
            && stages == 0;
        if self.marker.is_none() && !ready {
            return Err(Error::Contract("asset restore missing provenance"));
        }
        Ok(AssetRestoreProgress {
            complete_assets,
            total_assets: backup.records.len(),
            complete_bytes,
            ready,
        })
    }
}
