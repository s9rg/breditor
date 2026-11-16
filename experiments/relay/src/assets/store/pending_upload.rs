//! Observe or retire the exact single staging file of an interrupted immutable upload.
use super::{AssetStore, AssetStoreBackup, backup, pending, sync_directory};
use crate::{
    Error, Result,
    assets::{MAX_ASSET_BYTES, MAX_ASSETS, record},
    log::generations::{GenerationFileStamp, GenerationFileWitness},
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

pub(crate) const MAX_STAGE_BYTES: u64 =
    record::HEADER + record::MAX_METADATA as u64 + MAX_ASSET_BYTES;

/// Exact detached evidence from the interrupted upload of a sealed room.
pub struct PendingRasterUpload {
    /// Name of the private staging file at inspection time.
    pub file_name: String,
    /// Complete byte count of the staged file, including any partial record framing.
    pub bytes: u64,
    /// SHA-256 of the original staged file bytes.
    pub evidence_sha256: [u8; 32],
    /// SHA-256 binding the staged bytes to the exact local inode and publication state.
    pub selection_sha256: [u8; 32],
    /// Asset already present under its final name on the same inode, if published.
    pub published_asset: Option<String>,
    evidence: Vec<u8>,
    identity: GenerationFileWitness,
    stamp: GenerationFileStamp,
    links: u64,
}

impl PendingRasterUpload {
    /// Exact detached bytes to retain outside the operating directory before recovery.
    #[must_use]
    pub fn evidence_bytes(&self) -> &[u8] {
        &self.evidence
    }
}

fn links(file: &File) -> Result<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(file.metadata()?.nlink())
    }
    #[cfg(not(unix))]
    {
        let _ = file;
        Err(Error::Contract("sealed raster inspection requires Unix inode custody"))
    }
}

fn pending_name(root: &Path) -> Result<Option<String>> {
    let mut selected = None;
    for (index, entry) in fs::read_dir(root)?.enumerate() {
        if index >= MAX_ASSETS + 3 {
            return Err(Error::Contract("pending raster source inventory budget"));
        }
        let entry = entry?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| Error::Contract("pending raster source file name"))?;
        if pending(&name) && selected.replace(name).is_some() {
            return Err(Error::Contract("multiple pending raster uploads"));
        }
    }
    Ok(selected)
}

impl AssetStore {
    pub(crate) fn capture_pending_upload(
        &mut self,
    ) -> Result<(AssetStoreBackup, PendingRasterUpload)> {
        let selected = self.observe_pending_upload()?;
        let backup = self.export_backup_with_pending(Some(&selected.file_name))?;
        self.check_pending_upload_backup(&backup, &selected)?;
        Ok((backup, selected))
    }

    pub(crate) fn check_pending_upload_backup(
        &self,
        backup: &AssetStoreBackup,
        selected: &PendingRasterUpload,
    ) -> Result<()> {
        self.check_exported_backup_with_pending(backup, Some(&selected.file_name))?;
        self.recheck_pending_upload(selected.selection_sha256)
    }

    pub(crate) fn recheck_pending_upload(&self, expected: [u8; 32]) -> Result<()> {
        if self.observe_pending_upload()?.selection_sha256 != expected {
            return Err(Error::Contract("pending raster upload changed"));
        }
        Ok(())
    }

    fn observe_pending_upload(&self) -> Result<PendingRasterUpload> {
        self.inspect_pending_upload()?.ok_or(Error::Contract("no pending raster upload to inspect"))
    }

    pub(crate) fn inspect_pending_upload(&self) -> Result<Option<PendingRasterUpload>> {
        self.ready()?;
        backup::guard_recovered_lock(&self.root, &self.lock)?;
        let Some(file_name) = pending_name(&self.root)? else { return Ok(None) };
        let path = self.root.join(&file_name);
        if !fs::symlink_metadata(&path)?.is_file() {
            return Err(Error::Contract("pending raster source file type"));
        }
        let mut file = File::open(&path)?;
        let identity = GenerationFileWitness::of(&file)?;
        let stamp = GenerationFileStamp::of(&file)?;
        identity.guard(&file, &path)?;
        let bytes = file.metadata()?.len();
        let link_count = links(&file)?;
        if bytes > MAX_STAGE_BYTES {
            return Err(Error::Contract("pending raster upload byte budget"));
        }
        let published_asset = self.pending_publication(&identity, link_count)?;
        let mut evidence = Vec::new();
        (&mut file).take(bytes + 1).read_to_end(&mut evidence)?;
        if evidence.len() as u64 != bytes {
            return Err(Error::Contract("pending raster upload length changed"));
        }
        stamp.guard(&file)?;
        identity.guard(&file, &path)?;
        backup::guard_recovered_lock(&self.root, &self.lock)?;
        let evidence_sha256: [u8; 32] = Sha256::digest(&evidence).into();
        let selection = serde_json::to_vec(&(
            "breditor/pending-raster-upload-selection/1",
            &file_name,
            identity,
            link_count,
            bytes,
            evidence_sha256,
            &published_asset,
        ))?;
        let selection_sha256 = Sha256::digest(&selection).into();
        Ok(Some(PendingRasterUpload {
            file_name,
            bytes,
            evidence_sha256,
            selection_sha256,
            published_asset,
            evidence,
            identity,
            stamp,
            links: link_count,
        }))
    }

    fn pending_publication(
        &self,
        identity: &GenerationFileWitness,
        link_count: u64,
    ) -> Result<Option<String>> {
        if link_count == 1 {
            return Ok(None);
        }
        if link_count == 2 {
            for asset in self.entries.keys() {
                let path = self.root.join(format!("{}.asset", &asset[7..]));
                let file = File::open(&path)?;
                if GenerationFileWitness::of(&file)? == *identity {
                    identity.guard(&file, &path)?;
                    return Ok(Some(asset.clone()));
                }
            }
        }
        Err(Error::Contract("pending raster upload has unrelated links"))
    }

    pub(crate) fn sync_retired_upload(&self) -> Result<()> {
        self.prepare_backup_stream()?.check()?;
        sync_directory(&self.root)
    }

    pub(crate) fn retire_pending_upload(&mut self, selected: &PendingRasterUpload) -> Result<()> {
        self.recheck_pending_upload(selected.selection_sha256)?;
        let path = self.root.join(&selected.file_name);
        let file = File::open(&path)?;
        selected.identity.guard(&file, &path)?;
        if let Some(asset) = &selected.published_asset {
            selected.identity.guard(&file, &self.root.join(format!("{}.asset", &asset[7..])))?;
            file.sync_all()?;
            sync_directory(&self.root)?;
        }
        backup::guard_recovered_lock(&self.root, &self.lock)?;
        selected.identity.guard(&file, &path)?;
        selected.stamp.guard(&file)?;
        if links(&file)? != selected.links {
            return Err(Error::Contract("pending raster upload links changed"));
        }
        self.poisoned = true;
        fs::remove_file(path)?;
        sync_directory(&self.root)?;
        self.poisoned = false;
        Ok(())
    }
}
