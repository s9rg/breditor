//! The same independently selected operational origin can be held as bytes or an admitted file.
use super::super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupFile,
    ServerLogGenerationRoomBackupIdentity, recovery_part::RecoveryPart,
};
use crate::{Error, Result, Room, RoomRecoveryPolicy, assets::AssetStore};

#[derive(Clone, Copy)]
pub(super) enum Origin<'a> {
    Buffered(&'a ServerLogGenerationRoomBackup),
    File(&'a ServerLogGenerationRoomBackupFile),
}

impl<'a> Origin<'a> {
    pub(super) fn identity(self) -> Result<&'a ServerLogGenerationRoomBackupIdentity> {
        match self {
            Self::Buffered(backup) => backup.selected_identity(),
            Self::File(backup) => {
                backup.input.check()?;
                Ok(&backup.identity)
            }
        }
    }

    pub(super) fn select(
        self,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<()> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        if self.identity()? != expected {
            return Err(Error::Contract("joined generation selected archive"));
        }
        Ok(())
    }

    pub(super) fn check_live(
        self,
        room: &mut Room,
        assets: &mut AssetStore,
        principal: &str,
        exact: bool,
    ) -> Result<()> {
        match self {
            Self::Buffered(backup) if exact => backup.check_live(room, assets, principal),
            Self::Buffered(backup) => backup.check_retained(room, assets, principal),
            Self::File(backup) => backup.check_live(room, assets, principal, exact),
        }
    }

    pub(super) fn check_raster_parts(
        self,
        mut check: impl FnMut(&str, u64, [u8; 32]) -> Result<()>,
    ) -> Result<()> {
        match self {
            Self::Buffered(backup) => {
                for (name, bytes) in backup.rasters().selected_files() {
                    let part = RecoveryPart::from_bytes(bytes);
                    check(&name, part.len(), part.sha256)?;
                }
            }
            Self::File(backup) => {
                for (name, entry) in &backup.rasters {
                    check(name, entry.bytes, entry.sha256)?;
                }
            }
        }
        Ok(())
    }
}

/// Internal shared handle for an inactive or serving host's actual original backup.
#[cfg(feature = "server")]
pub(crate) enum HostOrigin {
    Buffered(Box<ServerLogGenerationRoomBackup>),
    File(Box<ServerLogGenerationRoomBackupFile>),
}

#[cfg(feature = "server")]
impl HostOrigin {
    pub(super) fn borrow(&self) -> Origin<'_> {
        match self {
            Self::Buffered(backup) => Origin::Buffered(backup),
            Self::File(backup) => Origin::File(backup),
        }
    }

    pub(crate) fn identity(&self) -> Result<&ServerLogGenerationRoomBackupIdentity> {
        self.borrow().identity()
    }

    pub(crate) fn check_archive_ancestor(
        &self,
        ancestor: &ServerLogGenerationRoomBackup,
    ) -> Result<()> {
        match self {
            Self::Buffered(backup) => backup.check_archive_ancestor(ancestor),
            Self::File(backup) => backup.check_archive_ancestor(ancestor),
        }
    }

    pub(crate) fn check_archive_descendant(
        &self,
        current: &ServerLogGenerationRoomBackup,
    ) -> Result<()> {
        match self {
            Self::Buffered(backup) => current.check_archive_ancestor(backup),
            Self::File(backup) => backup.check_archive_descendant(current),
        }
    }
}
