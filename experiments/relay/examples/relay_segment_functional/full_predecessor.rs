//! Exercise the exact active record ceiling on the last admitted physical log.
use super::{Result, storage};
use breditor_collab_relay::{Error, Role, Room, ServerLogStorageCapacity, assets::AssetStore};
use std::path::Path;

pub(super) const EVIDENCE: &str = "full-predecessor.json";

pub(super) fn fill_last_wal(
    room: &mut Room,
    assets: &AssetStore,
) -> Result<ServerLogStorageCapacity> {
    let cut = room.storage_capacity(assets, "owner")?.log;
    let rotation = cut.rotation.ok_or("expected physical log")?;
    assert_eq!(rotation.continuation_files_remaining, 0);
    assert!(cut.active.records_remaining > 0);
    for _ in 0..cut.active.records_remaining {
        room.grant("owner", "reader", Some(Role::Reader))?;
    }
    let full = room.storage_capacity(assets, "owner")?.log;
    assert_eq!(full.active.records_remaining, 0);
    assert_eq!(full.retained.records_remaining, 0);
    assert!(matches!(
        room.grant("owner", "uncommitted-reader", Some(Role::Reader)),
        Err(Error::Contract("physical rotation generation or capacity"))
    ));
    assert!(matches!(room.catchup("uncommitted-reader"), Err(Error::Permission)));
    assert_eq!(room.storage_capacity(assets, "owner")?.log, full);
    Ok(full)
}

pub(super) fn verify_reopened(
    parent: &Path,
    room: &Room,
    assets: &AssetStore,
    full: &ServerLogStorageCapacity,
) -> Result {
    assert_eq!(&room.storage_capacity(assets, "owner")?.log, full);
    assert!(matches!(room.catchup("uncommitted-reader"), Err(Error::Permission)));
    storage::write_new(&parent.join(EVIDENCE), &serde_json::to_vec(full)?)?;
    Ok(())
}
