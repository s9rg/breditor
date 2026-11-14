//! Common selected inputs for joined recovery. Neither source chooses a destination.
use super::super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupFile,
    ServerLogGenerationRoomBackupIdentity, recovery_part::RecoveryPart,
};
use crate::{
    Error, Result, Room,
    archive_input::{ArchiveEntry, ArchiveInput},
    assets::AssetStore,
};
use std::{collections::BTreeMap, io};

pub(super) struct RestoreSource<'a> {
    pub(super) identity: &'a ServerLogGenerationRoomBackupIdentity,
    pub(super) native: BTreeMap<&'a str, RecoveryPart<'a>>,
    pub(super) rasters: BTreeMap<String, RecoveryPart<'a>>,
    pub(super) input: Option<&'a ArchiveInput>,
    buffered: Option<&'a ServerLogGenerationRoomBackup>,
}

impl<'a> RestoreSource<'a> {
    pub(super) fn buffered(
        backup: &'a ServerLogGenerationRoomBackup,
        identity: &'a ServerLogGenerationRoomBackupIdentity,
    ) -> Result<Self> {
        Ok(Self {
            identity,
            native: backup.native().recovery_parts()?,
            rasters: backup
                .rasters()
                .selected_files()
                .into_iter()
                .map(|(name, bytes)| (name, RecoveryPart::from_bytes(bytes)))
                .collect(),
            input: None,
            buffered: Some(backup),
        })
    }

    pub(super) fn file(backup: &'a ServerLogGenerationRoomBackupFile) -> Result<Self> {
        backup.input.check()?;
        let archive = backup.input.all();
        let part = |entry: &ArchiveEntry| -> Result<RecoveryPart<'a>> {
            Ok(RecoveryPart::with_digest(archive.section(entry.offset, entry.bytes)?, entry.sha256))
        };
        Ok(Self {
            identity: &backup.identity,
            native: backup
                .native
                .iter()
                .map(|(name, entry)| Ok((name.as_str(), part(entry)?)))
                .collect::<Result<_>>()?,
            rasters: backup
                .rasters
                .iter()
                .map(|(name, entry)| Ok((name.clone(), part(entry)?)))
                .collect::<Result<_>>()?,
            input: Some(&backup.input),
            buffered: None,
        })
    }

    pub(super) fn check_actual(&self, room: &mut Room, assets: &AssetStore) -> Result<()> {
        let owner = &self.identity.native.source.owner;
        if let Some(backup) = self.buffered {
            backup.native().check_live(room, owner)?;
            return assets.check_exported_backup(backup.rasters());
        }
        let actual =
            ServerLogGenerationRoomBackup::capture_to(room, assets, owner, &mut io::sink())?;
        if actual.identity != *self.identity {
            return Err(Error::Contract("joined restored component bytes differ"));
        }
        Ok(())
    }

    pub(super) fn guard_input(&self) -> Result<()> {
        if let Some(input) = self.input {
            input.check()?;
        }
        Ok(())
    }
}
