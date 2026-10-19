//! Explicit private staged recovery. Only a complete manifest and record set can become ready.
use super::{
    AssetBackupIdentity, AssetRecoveryPolicy, AssetRestore, AssetRestoreProgress, AssetStore,
    AssetStoreBackup, private_options, restore_files, sync_directory,
};
use crate::{Error, Result, credentials};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, DirBuilder, TryLockError},
    io::Write,
    path::{Component, Path},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Marker {
    format: String,
    format_version: u32,
    pub id: String,
    identity: AssetBackupIdentity,
}
fn selected(
    backup: &AssetStoreBackup,
    expected: &AssetBackupIdentity,
    policy: AssetRecoveryPolicy,
) -> Result<()> {
    let AssetRecoveryPolicy::HostReacquired = policy;
    if &backup.identity != expected {
        return Err(Error::Contract("asset restore selected archive"));
    }
    Ok(())
}
fn lock(file: &fs::File) -> Result<()> {
    file.try_lock().map_err(|e| match e {
        TryLockError::WouldBlock => Error::Locked,
        TryLockError::Error(e) => Error::Io(e),
    })
}
fn destination_name(root: &Path) -> Result<()> {
    let encoded = root.as_os_str().as_encoded_bytes();
    if !matches!(root.components().next_back(), Some(Component::Normal(_)))
        || encoded.ends_with(b"/")
        || encoded.ends_with(b"/.")
        || cfg!(windows) && (encoded.ends_with(b"\\") || encoded.ends_with(b"\\."))
    {
        return Err(Error::Contract("asset restore destination name"));
    }
    Ok(())
}
impl AssetRestore {
    /// Reserve an absent private destination and persist a source-bound restore marker.
    /// No asset is copied yet; the host must not activate this path before `finish` succeeds.
    /// On failure inspect the known destination, never delete/overwrite it to force a retry.
    /// # Errors
    /// Rejects wrong selected identity, occupied paths, unavailable locks and persistence failure.
    pub fn begin(
        root: &Path,
        backup: &AssetStoreBackup,
        expected: &AssetBackupIdentity,
        policy: AssetRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        destination_name(root)?;
        let parent = root.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
        let root = parent
            .canonicalize()?
            .join(root.file_name().ok_or(Error::Contract("asset restore destination name"))?);
        let mut builder = DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&root)?;
        let file = private_options().create_new(true).open(root.join(".lock"))?;
        lock(&file)?;
        let marker = Marker {
            format: "breditor/relay-asset-restore".into(),
            format_version: 1,
            id: credentials::issue()?,
            identity: expected.clone(),
        };
        let encoded = serde_json::to_vec(&marker)?;
        let mut marker_file =
            private_options().create_new(true).open(root.join(".restore.json"))?;
        marker_file.write_all(&encoded)?;
        marker_file.sync_all()?;
        drop(marker_file);
        sync_directory(&root)?;
        sync_directory(root.parent().ok_or(Error::Contract("asset restore destination parent"))?)?;
        Ok(Self { root, lock: file, marker: Some(marker), identity: expected.clone() })
    }
    /// Revalidate an interrupted owned attempt or an exact already-completed selected store.
    /// Partial/unknown provenance, different bytes and unknown files are preserved and refused.
    /// # Errors
    /// Rejects wrong archive/room, symlinks, competing owners, invalid markers and divergent state.
    pub fn resume(
        root: &Path,
        backup: &AssetStoreBackup,
        expected: &AssetBackupIdentity,
        policy: AssetRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        destination_name(root)?;
        if !fs::symlink_metadata(root)?.is_dir() {
            return Err(Error::Contract("asset restore directory type"));
        }
        let root = root.canonicalize()?;
        if !fs::symlink_metadata(root.join(".lock"))?.is_file() {
            return Err(Error::Contract("asset restore lock file"));
        }
        let file = private_options().open(root.join(".lock"))?;
        lock(&file)?;
        let marker = if restore_files::exists(&root.join(".restore.json"))? {
            let encoded = restore_files::read(&root.join(".restore.json"), 4096)?;
            let marker: Marker = serde_json::from_slice(&encoded)?;
            if marker.format != "breditor/relay-asset-restore"
                || marker.format_version != 1
                || marker.identity != *expected
                || serde_json::to_vec(&marker)? != encoded
                || credentials::hash(&marker.id).is_err()
            {
                return Err(Error::Contract("asset restore marker"));
            }
            Some(marker)
        } else {
            None
        };
        let result = Self { root, lock: file, marker, identity: expected.clone() };
        result.check(backup)?;
        Ok(result)
    }
    /// Known retained destination for explicit resumption. It is not an activation receipt.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }
    /// Inspect a verified durable prefix without adding, deleting or acknowledging anything.
    /// # Errors
    /// Rejects changed/divergent destination bytes or a different selected archive.
    pub fn progress(&self, backup: &AssetStoreBackup) -> Result<AssetRestoreProgress> {
        self.check(backup)
    }

    /// Copy or resume exact records, publish the original manifest last, then retire the marker.
    /// Returns the ready original-format store without starting a service, upload or garbage collector.
    /// If completion is uncertain, reopen with `resume`; never overwrite a retained destination.
    /// # Errors
    /// Rejects divergent state, unknown files, changed selected archive or storage failure.
    pub fn finish(mut self, backup: &AssetStoreBackup) -> Result<AssetStore> {
        self.check(backup)?;
        if self.marker.is_some() {
            for asset in &backup.records {
                restore_files::publish(
                    &self.root,
                    &self.stage(&asset.info.asset)?,
                    &format!("{}.asset", &asset.info.asset[7..]),
                    &asset.encoded,
                )?;
            }
            restore_files::publish(
                &self.root,
                &self.manifest_stage()?,
                "store.json",
                &backup.manifest,
            )?;
            self.check(backup)?;
            for asset in &backup.records {
                let path = self.root.join(self.stage(&asset.info.asset)?);
                if restore_files::exists(&path)? {
                    restore_files::exact(&path, &asset.encoded)?;
                    fs::remove_file(path)?;
                }
            }
            let path = self.root.join(self.manifest_stage()?);
            if restore_files::exists(&path)? {
                restore_files::exact(&path, &backup.manifest)?;
                fs::remove_file(path)?;
            }
            sync_directory(&self.root)?;
            restore_files::exact(
                &self.root.join(".restore.json"),
                &serde_json::to_vec(
                    self.marker.as_ref().ok_or(Error::Contract("asset restore marker"))?,
                )?,
            )?;
            fs::remove_file(self.root.join(".restore.json"))?;
            sync_directory(&self.root)?;
            self.marker = None;
        }
        if !self.check(backup)?.ready {
            return Err(Error::Contract("asset restore not ready"));
        }
        for asset in &backup.records {
            restore_files::durable_exact(
                &self.root.join(format!("{}.asset", &asset.info.asset[7..])),
                &asset.encoded,
            )?;
        }
        restore_files::durable_exact(&self.root.join("store.json"), &backup.manifest)?;
        sync_directory(&self.root)?;
        let entries = backup
            .records
            .iter()
            .map(|a| (a.info.asset.clone(), a.info.clone()))
            .collect::<BTreeMap<_, _>>();
        Ok(AssetStore {
            root: self.root,
            binding: self.identity.binding,
            lock: self.lock,
            entries,
            bytes: self.identity.bytes,
            poisoned: false,
        })
    }
}
