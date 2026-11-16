//! Continue the actual portable backup's raster archive with a real queued SDK payload.
use super::{Result, storage};
use breditor_collab_relay::{
    ContinuedAssetStore, Room,
    assets::{AssetBackupIdentity, asset_id, prepare_asset},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    path::Path,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Selection {
    old: String,
    queued: String,
}

impl Selection {
    pub(super) fn exercise(
        &self,
        parent: &Path,
        backup: &Path,
        expected: &AssetBackupIdentity,
        room: &Room,
        principal: &str,
    ) -> Result<Value> {
        let directory = parent.join("raster-continuation");
        let predecessor = backup.join("rasters.archive");
        let mut continued = ContinuedAssetStore::create_from_backup(
            &directory,
            File::open(&predecessor)?,
            expected,
        )?;
        assert!(continued.get(&self.queued)?.is_none());
        let queued = fs::read(parent.join("continued-queued-raster.png"))?;
        assert_eq!(asset_id(&queued), self.queued);
        let prepared = || prepare_asset(&self.queued, "image/png", queued.clone());
        assert!(!room.put_continued_asset(principal, &mut continued, prepared()?)?.duplicate);
        let local = continued.identity().clone();
        storage::write_new(
            &parent.join("continued-raster-local.json"),
            &serde_json::to_vec(&local)?,
        )?;
        drop(continued);

        let mut continued = ContinuedAssetStore::open(&directory, &local)?;
        assert!(room.put_continued_asset(principal, &mut continued, prepared()?)?.duplicate);
        let old = room
            .read_continued_asset(principal, &continued, &self.old)?
            .ok_or("retained raster")?;
        assert_eq!(old.bytes, fs::read(parent.join("asset.png"))?);
        let output = |name| -> Result<File> {
            Ok(OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .open(parent.join(name))?)
        };
        let mut before = output("continued-raster-predecessor.archive")?;
        let mut after = output("continued-raster-active.archive")?;
        let backup = continued.write_backup(&mut before, &mut after)?;
        before.sync_all()?;
        after.sync_all()?;
        assert_eq!(backup.predecessor(), expected);
        assert_eq!(backup.active().assets, 1);
        drop(continued);

        let transferred = parent.join("transferred-raster-generation");
        let reopened = ContinuedAssetStore::restore(&transferred, before, after, &backup)?;
        assert_eq!(reopened.active_count(), 1);
        let relocated = reopened.identity().clone();
        drop(reopened);
        let reopened = ContinuedAssetStore::open(&transferred, &relocated)?;
        assert_eq!(reopened.get(&self.old)?.ok_or("transferred predecessor")?.bytes, old.bytes);
        assert_eq!(reopened.get(&self.queued)?.ok_or("transferred active raster")?.bytes, queued);
        Ok(json!({"retainedAssets": expected.assets, "newAssets": reopened.active_count(),
            "preservedOriginalBytes": true, "duplicateAfterReopen": true}))
    }
}
