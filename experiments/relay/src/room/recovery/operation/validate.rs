//! Re-admit current native state while retaining exact original history and immutable rasters.
use super::super::{ServerRoomBackup, files};
use crate::{Error, Result, Room, assets::AssetStore};
use std::path::Path;

pub(super) fn components(
    root: &Path,
    authority: &mut Room,
    assets: &mut AssetStore,
    backup: &ServerRoomBackup,
    exact: bool,
) -> Result<()> {
    let path = root.join("room.log");
    authority.log.guard_path(&path)?;
    if authority.asset_binding() != assets.binding()
        || assets.binding() != backup.identity.assets.binding
    {
        return Err(Error::Contract("operational native asset binding differs"));
    }
    let current = authority.export_backup()?;
    let bytes = current.original_log();
    let original = backup.room.original_log();
    if if exact { bytes != original } else { !bytes.starts_with(original) } {
        return Err(Error::Contract("operational log does not retain selected prefix"));
    }
    files::compare(&path, bytes, false)?;
    let current_assets = assets.verify_retained_backup(&backup.assets)?;
    if exact && current_assets != backup.identity.assets {
        return Err(Error::Contract("uncommitted operational assets differ"));
    }
    authority.log.guard_path(&path)?;
    Ok(())
}
