//! Read-only exact inactive-prefix inspection. Physical progress is not native or activation proof.
use super::super::{
    ServerLogGenerationRecoveryProgress, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupFile, ServerLogGenerationRoomBackupIdentity,
};
use super::{
    ServerLogGenerationRoomRecovery, files, raster_directory::RasterDirectory, raster_part,
    selection::Marker, source::RestoreSource,
};
use crate::{Error, Result};
use std::collections::BTreeSet;
/// Complete selected-source physical progress; finish must still acquire and verify both owners.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ServerLogGenerationRoomRecoveryProgress {
    /// Native component progress, or no owned native selection yet.
    pub native: Option<ServerLogGenerationRecoveryProgress>,
    /// A particular raster directory/root/lock is selected by a synced ownership witness.
    pub rasters_selected: bool,
    /// Exact published raster records plus original manifest, not an upload acknowledgement.
    pub raster_files_published: usize,
    /// Total exact source raster files, including the manifest but excluding instance locks.
    pub raster_files_total: usize,
    /// Exact durable joined barrier exists; native replay/locking is still required at finish.
    pub completion_record: bool,
}
impl ServerLogGenerationRoomRecovery {
    pub(super) fn completion(&self) -> Marker {
        Marker {
            format: "breditor/server-log-generation-room-complete".into(),
            format_version: 1,
            id: self.marker.id.clone(),
            identity: self.marker.identity.clone(),
        }
    }
    pub(super) fn guard_selection(
        &self,
        identity: &ServerLogGenerationRoomBackupIdentity,
    ) -> Result<()> {
        self.directory.guard()?;
        if *identity != self.marker.identity {
            return Err(Error::Contract("joined recovery source changed"));
        }
        let actual: Marker = files::read(&self.directory.path.join(".recovery.json"))?;
        if files::encode(&actual)? != files::encode(&self.marker)? {
            return Err(Error::Contract("joined recovery reservation changed"));
        }
        Ok(())
    }
    /// Inspect every known component and owned file prefix without copying or publishing data.
    /// # Errors
    /// Wrong source/custody, unknown work, divergent occupied files or premature completion refuse.
    pub fn progress(
        &self,
        backup: &ServerLogGenerationRoomBackup,
    ) -> Result<ServerLogGenerationRoomRecoveryProgress> {
        self.progress_selected(&RestoreSource::buffered(backup, &backup.info()?.identity)?)
    }

    /// Inspect the owned files and ledgers against an admitted file without copying the archive.
    /// # Errors
    /// Refuses changed inputs and the same custody, occupancy or completion failures as `progress`.
    pub fn progress_file(
        &self,
        backup: &ServerLogGenerationRoomBackupFile,
    ) -> Result<ServerLogGenerationRoomRecoveryProgress> {
        self.progress_selected(&RestoreSource::file(backup)?)
    }

    pub(super) fn progress_selected(
        &self,
        source: &RestoreSource<'_>,
    ) -> Result<ServerLogGenerationRoomRecoveryProgress> {
        source.guard_input()?;
        self.guard_selection(source.identity)?;
        let mut known = BTreeSet::from([
            ".owner".into(),
            ".recovery.json".into(),
            ".native.json".into(),
            ".rasters.json".into(),
            ".complete.json".into(),
        ]);
        let mut components = BTreeSet::new();
        let native = if let Some(value) = self.native_selection()? {
            components.insert(value.directory.clone());
            Some(
                self.native_attempt(&value)?
                    .progress_selected(&source.identity.native, &source.native)?,
            )
        } else {
            None
        };
        let selected = &source.rasters;
        let raster = self.raster_selection()?;
        let mut published = 0;
        if let Some(value) = &raster {
            components.insert(value.directory.clone());
            let directory =
                RasterDirectory::open(&self.directory.path.join(&value.directory), &value.witness)?;
            let names = selected.keys().cloned().chain(std::iter::once(".lock".into())).collect();
            Self::raster_inventory(&directory, &names)?;
            for (name, &bytes) in selected {
                if let Some(part) = self.raster_part(value, name, bytes)? {
                    known.insert(raster_part::ledger(name));
                    known.insert(part.stage.clone());
                    if self.raster_part_progress(&directory, &part, bytes)? {
                        published += 1;
                    }
                } else if files::exists(&directory.path.join(name))? {
                    return Err(Error::Contract("joined raster unowned occupied file"));
                }
            }
        }
        self.outer_inventory(&known, &components)?;
        let complete = files::exists(&self.directory.path.join(".complete.json"))?;
        if complete {
            let actual: Marker = files::read(&self.directory.path.join(".complete.json"))?;
            if files::encode(&actual)? != files::encode(&self.completion())?
                || published != selected.len()
                || !native.is_some_and(|value| value.native_ready && value.completion_record)
            {
                return Err(Error::Contract("joined recovery premature completion"));
            }
        }
        source.guard_input()?;
        Ok(ServerLogGenerationRoomRecoveryProgress {
            native,
            rasters_selected: raster.is_some(),
            raster_files_published: published,
            raster_files_total: selected.len(),
            completion_record: complete,
        })
    }
}
