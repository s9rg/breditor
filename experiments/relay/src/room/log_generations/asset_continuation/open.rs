//! Absent-only creation, exact local cold reopen, and portable restore of selected raster generations.
use super::{
    ACTIVE, ARCHIVE, CONTROL, ContinuedAssetBackupIdentity, ContinuedAssetStore,
    ContinuedAssetStoreIdentity, FORMAT, Lineage, MAX_CONTROL, archive::AssetArchive,
    backup::ContinuedAssetBackupFiles,
};
use crate::{
    Error, Result,
    archive_input::ArchiveInput,
    assets::AssetBackupIdentity,
    log::generations::{GenerationDirectory, GenerationFileWitness},
    room::log_generations::server_recovery::raster_directory::RasterDirectory,
};
use std::{
    fs::{self, File},
    path::Path,
};

impl ContinuedAssetStore {
    /// Continue a verified original asset archive in a fresh private directory.
    /// The predecessor remains readable and its asset IDs remain deduplicated.
    /// This storage action is independent of room activation.
    ///
    /// # Errors
    /// Refuses changed/invalid archives, occupied destinations, uncertain custody and I/O errors.
    pub fn create_from_backup(
        path: &Path,
        predecessor: File,
        selected: &AssetBackupIdentity,
    ) -> Result<Self> {
        let retained = AssetArchive::admit(predecessor, selected)?;
        let lineage =
            Lineage { predecessor: selected.clone(), namespace: crate::credentials::issue()? };
        Self::install(path, lineage, &retained, None)
    }

    /// Restore the verified pair at an absent path, yielding a new local custody selection.
    ///
    /// # Errors
    /// Refuses inconsistent selections, changed archives, overlaps, occupied paths and I/O errors.
    pub fn restore(
        path: &Path,
        predecessor: File,
        active: File,
        selected: &ContinuedAssetBackupIdentity,
    ) -> Result<Self> {
        ContinuedAssetBackupFiles::admit(predecessor, active, selected)?.restore(path)
    }

    pub(super) fn install(
        path: &Path,
        lineage: Lineage,
        retained: &AssetArchive,
        restore: Option<&AssetArchive>,
    ) -> Result<Self> {
        let active_binding = lineage.active_binding()?;
        let directory = GenerationDirectory::create(path)?;
        let (retained, archive) = retained.copy_into(&directory, ARCHIVE)?;
        let active_directory = RasterDirectory::create(&directory.path.join(ACTIVE))?;
        let active_witness = active_directory.witness()?;
        let (active, active_custody) = if let Some(restore) = restore {
            restore.install(&active_directory.path)?;
            active_directory.sync()?;
            let (active, custody) = active_directory.into_store(&active_binding)?;
            if active.prepare_backup_stream()?.identity != restore.identity {
                return Err(Error::Contract("restored active raster selection differs"));
            }
            (active, custody)
        } else {
            let (active, custody) = active_directory.into_empty_store(&active_binding)?;
            if active.count() != 0 {
                return Err(Error::Contract("new raster generation is not empty"));
            }
            (active, custody)
        };
        active_custody.guard(&active)?;
        let identity = ContinuedAssetStoreIdentity {
            format: FORMAT.into(),
            format_version: 1,
            lineage,
            directory: directory.witness()?,
            active: active_witness,
            archive,
        };
        let control = directory.create_file(CONTROL, &serde_json::to_vec(&identity)?)?;
        let control_witness = GenerationFileWitness::of(&control)?;
        let control = ArchiveInput::new(control, MAX_CONTROL)?;
        let result = Self {
            directory,
            identity,
            control,
            control_witness,
            retained,
            active,
            active_custody,
        };
        result.guard()?;
        Ok(result)
    }

    /// Cold-open the same local continuation against an independently saved custody selection.
    /// Complete active assets survive an interrupted reply or process exit.
    ///
    /// # Errors
    /// Refuses changed local custody, corrupt archives, overlaps and invalid active state.
    pub fn open(path: &Path, selected: &ContinuedAssetStoreIdentity) -> Result<Self> {
        Self::open_with_policy(path, selected, false)
    }

    #[cfg(feature = "server")]
    pub(in crate::room::log_generations) fn open_for_native_tail(
        path: &Path,
        selected: &ContinuedAssetStoreIdentity,
    ) -> Result<Self> {
        Self::open_with_policy(path, selected, true)
    }

    fn open_with_policy(
        path: &Path,
        selected: &ContinuedAssetStoreIdentity,
        retain_pending: bool,
    ) -> Result<Self> {
        if selected.format != FORMAT || selected.format_version != 1 {
            return Err(Error::Contract("raster continuation selection format"));
        }
        let active_binding = selected.lineage.active_binding()?;
        let directory = GenerationDirectory::open(path)?;
        directory.guard_witness(&selected.directory)?;
        let path = directory.path.join(CONTROL);
        if !fs::symlink_metadata(&path)?.is_file() {
            return Err(Error::Contract("raster continuation control type"));
        }
        let control = File::open(&path)?;
        let control_witness = GenerationFileWitness::of(&control)?;
        control_witness.guard(&control, &path)?;
        let control = ArchiveInput::new(control, MAX_CONTROL)?;
        if control.all().read(MAX_CONTROL)?.as_ref() != serde_json::to_vec(selected)? {
            return Err(Error::Contract("raster continuation local selection differs"));
        }
        let retained = AssetArchive::open(
            &directory.path.join(ARCHIVE),
            &selected.archive,
            &selected.lineage.predecessor,
        )?;
        let active_directory =
            RasterDirectory::open(&directory.path.join(ACTIVE), &selected.active)?;
        let (active, active_custody) = if retain_pending {
            active_directory.into_store(&active_binding)?
        } else {
            active_directory.into_continued_store(&active_binding)?
        };
        if retained.keys().any(|digest| active.has_asset(&format!("sha256:{digest}"))) {
            return Err(Error::Contract("raster continuation generations overlap"));
        }
        let result = Self {
            directory,
            identity: selected.clone(),
            control,
            control_witness,
            retained,
            active,
            active_custody,
        };
        result.guard()?;
        Ok(result)
    }
}
