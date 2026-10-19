//! Explicit operational reopen; original exact recovery never adopts later service edits.
use super::super::{ServerRoomBackup, ServerRoomBackupIdentity, files, restore_begin::selected};
use super::{
    OperationalServerRoom,
    marker::{Context, Intent},
    validate,
};
use crate::{Error, Result, Room, RoomRecoveryPolicy, assets::AssetStore};
use std::{fs, path::Path};

impl OperationalServerRoom {
    /// Resolve a staged/committed operational handoff and replay current native state, retaining
    /// the exact selected log prefix and every original raster while admitting complete additions.
    /// Fresh account/provider/deployment authority and client reconciliation remain separate.
    /// Missing inspection never creates a directory, log, manifest, lock or operational marker.
    ///
    /// # Errors
    /// Rejects absent intent, different selections, missing/unknown/aliased files, conflicting
    /// owners, invalid native replay, lost original rasters and divergent source prefixes.
    /// Incomplete log tails and pending server raster files are preserved and refused, not
    /// truncated/deleted by this API; retain them for explicit host-directed native recovery.
    /// A partial pre-publication intent can resume only while both components remain exact.
    pub fn resume(
        root: &Path,
        backup: &ServerRoomBackup,
        expected: &ServerRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        let root = files::anchor(root)?;
        if !fs::symlink_metadata(&root)?.is_dir()
            || !fs::symlink_metadata(root.join(".lock"))?.is_file()
        {
            return Err(Error::Contract("operational directory or lock type"));
        }
        let lock = files::options().open(root.join(".lock"))?;
        files::lock(&lock)?;
        let context = Context::read(&root, &lock, backup)?;
        if context.intent == Intent::Missing {
            return Err(Error::Contract("operational intent absent"));
        }
        let mut authority = Room::open_complete(&root.join("room.log"))?;
        let mut assets =
            AssetStore::open_retained(&root.join("assets"), authority.asset_binding())?;
        validate::components(
            &root,
            &mut authority,
            &mut assets,
            backup,
            context.intent != Intent::Committed,
        )?;
        context.guard(&root, &lock, backup)?;
        context.publish(&root)?;
        let after = Context::read(&root, &lock, backup)?;
        if after.intent != Intent::Committed || after.bytes != context.bytes {
            return Err(Error::Contract("operational completion differs"));
        }
        validate::components(
            &root,
            &mut authority,
            &mut assets,
            backup,
            context.intent != Intent::Committed,
        )?;
        after.guard(&root, &lock, backup)?;
        Ok(Self { root, lock, room: authority, assets, origin: Box::new(expected.clone()) })
    }
}
