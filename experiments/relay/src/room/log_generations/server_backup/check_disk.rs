//! Match the admitted file's exact sections against actual current native and raster owners.
use super::ServerLogGenerationRoomBackupFile;
use crate::{Error, Result, Room, assets::AssetStore, log::generations::SelectedFile};

impl ServerLogGenerationRoomBackupFile {
    pub(in crate::room::log_generations) fn check_live(
        &self,
        room: &mut Room,
        assets: &AssetStore,
        principal: &str,
        exact: bool,
    ) -> Result<()> {
        self.input.check()?;
        let files = self
            .native
            .iter()
            .map(|(name, entry)| {
                (name.as_str(), SelectedFile::Digest { bytes: entry.bytes, sha256: entry.sha256 })
            })
            .collect();
        super::super::backup::check_native_selection(
            room,
            principal,
            &self.identity.native,
            &files,
            !exact,
        )?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("joined actual component binding differs"));
        }
        let current = assets.prepare_backup_stream()?;
        if exact && current.identity != self.identity.assets {
            return Err(Error::Contract("joined asset source selection differs"));
        }
        current.check_retains(&self.identity.assets, &self.rasters)?;
        self.input.check()
    }
}

#[cfg(feature = "server")]
impl ServerLogGenerationRoomBackupFile {
    pub(crate) fn check_exact_owner(
        &self,
        room: &mut Room,
        assets: &AssetStore,
        principal: &str,
    ) -> Result<()> {
        self.check_live(room, assets, principal, true)
    }

    pub(crate) fn check_retained_owner(
        &self,
        room: &mut Room,
        assets: &AssetStore,
        principal: &str,
    ) -> Result<()> {
        self.check_live(room, assets, principal, false)
    }

    fn native_sections(
        &self,
    ) -> Result<std::collections::BTreeMap<&str, crate::archive_input::ArchiveSlice<'_>>> {
        let archive = self.input.all();
        self.native
            .iter()
            .map(|(name, entry)| Ok((name.as_str(), archive.section(entry.offset, entry.bytes)?)))
            .collect()
    }

    pub(crate) fn check_archive_ancestor(
        &self,
        ancestor: &super::ServerLogGenerationRoomBackup,
    ) -> Result<()> {
        use sha2::{Digest, Sha256};
        self.input.check()?;
        super::super::backup::check_native_ancestry(
            &self.identity.native,
            &self.native_sections()?,
            ancestor.native().selected_identity(),
            &ancestor.native().archive_sections()?,
        )?;
        for (name, bytes) in ancestor.rasters().selected_files() {
            let selected = self.rasters.get(&name);
            if !selected.is_some_and(|entry| {
                entry.bytes == bytes.len() as u64
                    && entry.sha256 == <[u8; 32]>::from(Sha256::digest(bytes))
            }) {
                return Err(Error::Contract("local archive lost or changed ancestor raster"));
            }
        }
        self.input.check()
    }

    pub(crate) fn check_file_ancestor(&self, ancestor: &Self) -> Result<()> {
        self.input.check()?;
        ancestor.input.check()?;
        super::super::backup::check_native_ancestry(
            &self.identity.native,
            &self.native_sections()?,
            &ancestor.identity.native,
            &ancestor.native_sections()?,
        )?;
        for (name, original) in &ancestor.rasters {
            if self.rasters.get(name).is_none_or(|current| {
                original.bytes != current.bytes || original.sha256 != current.sha256
            }) {
                return Err(Error::Contract("local archive lost or changed ancestor raster"));
            }
        }
        ancestor.input.check()?;
        self.input.check()
    }

    pub(crate) fn check_archive_descendant(
        &self,
        current: &super::ServerLogGenerationRoomBackup,
    ) -> Result<()> {
        use sha2::{Digest, Sha256};
        self.input.check()?;
        super::super::backup::check_native_ancestry(
            current.native().selected_identity(),
            &current.native().archive_sections()?,
            &self.identity.native,
            &self.native_sections()?,
        )?;
        let selected = current.rasters().selected_files();
        for (name, entry) in &self.rasters {
            if !selected.get(name).is_some_and(|bytes| {
                entry.bytes == bytes.len() as u64
                    && entry.sha256 == <[u8; 32]>::from(Sha256::digest(bytes))
            }) {
                return Err(Error::Contract("local archive lost or changed ancestor raster"));
            }
        }
        self.input.check()
    }
}
