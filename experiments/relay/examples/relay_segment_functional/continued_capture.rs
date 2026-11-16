//! Select a combined capture and its independently retained native predecessor in the fixture.
use super::{Result, read};
use breditor_collab_relay::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity,
    server::{ContinuedRasterRoomBackupFiles, ContinuedRasterRoomBackupIdentity},
};
use std::{fs::File, path::Path, sync::Arc};

pub(super) fn open(
    parent: &Path,
) -> Result<(ContinuedRasterRoomBackupFiles, ContinuedRasterRoomBackupIdentity)> {
    let selected: ContinuedRasterRoomBackupIdentity =
        serde_json::from_str(&read(&parent.join("capture-selection.json"), 32 * 1024)?)?;
    let predecessor = parent.join("native-parent");
    let native = if predecessor.try_exists()? {
        let expected: RelaySegmentBaseIdentity =
            serde_json::from_str(&read(&predecessor.join("selection.json"), 32 * 1024)?)?;
        Some(Arc::new(RelaySegmentBaseFile::open(
            File::open(predecessor.join("native.archive"))?,
            File::open(predecessor.join("native.checkpoint"))?,
            &expected,
        )?))
    } else {
        None
    };
    let backup = ContinuedRasterRoomBackupFiles::open(&parent.join("capture"), &selected, native)?;
    Ok((backup, selected))
}
