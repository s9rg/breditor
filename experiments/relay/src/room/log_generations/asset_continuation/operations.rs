//! Original raster IDs and receipts across the immutable predecessor and bounded active suffix.
use super::{ARCHIVE, CONTROL, ContinuedAssetStore, ContinuedAssetStoreIdentity};
use crate::{
    Error, Result, Room,
    assets::{AssetReceipt, PreparedAsset, StoredAsset, asset_key},
};

impl ContinuedAssetStore {
    /// The independently retained identity for this exact local directory.
    #[must_use]
    pub const fn identity(&self) -> &ContinuedAssetStoreIdentity {
        &self.identity
    }

    /// The original room's unchanged raster namespace.
    #[must_use]
    pub fn binding(&self) -> &str {
        &self.identity.lineage.predecessor.binding
    }

    /// Count of new live assets charged to the active generation.
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.active.count()
    }

    pub(super) fn guard(&self) -> Result<()> {
        self.directory.guard_witness(&self.identity.directory)?;
        self.control.check_named(&self.control_witness, &self.directory.path.join(CONTROL))?;
        self.retained.guard(&self.directory.path.join(ARCHIVE), &self.identity.archive)?;
        self.active_custody.guard(&self.active)
    }

    /// Read the exact raster bytes by the original content ID.
    ///
    /// # Errors
    /// Refuses malformed IDs, changed custody or corrupt storage.
    pub fn get(&self, asset: &str) -> Result<Option<StoredAsset>> {
        let digest = asset_key(asset)?;
        self.guard()?;
        let value = match self.retained.get(asset, digest)? {
            Some(value) => Some(value),
            None => self.active.get(asset)?,
        };
        self.guard()?;
        Ok(value)
    }

    /// Append an admitted new asset to the active store or acknowledge its exact retained bytes.
    ///
    /// # Errors
    /// Refuses changed custody, conflicting metadata, exhaustion or uncertain storage.
    pub fn put(&mut self, prepared: PreparedAsset) -> Result<AssetReceipt> {
        self.guard()?;
        let info = prepared.info();
        let receipt =
            if let Some(existing) = self.retained.get(&info.asset, asset_key(&info.asset)?)? {
                if &existing.info != info {
                    return Err(Error::Contract("retained raster metadata conflict"));
                }
                AssetReceipt::new(existing.info, true)
            } else {
                self.active.put(prepared)?
            };
        self.guard()?;
        Ok(receipt)
    }
}

impl Room {
    /// Read a continued raster under the room's current reader permission.
    ///
    /// # Errors
    /// Refuses invalid access, room binding, custody or raster bytes.
    pub fn read_continued_asset(
        &self,
        principal: &str,
        assets: &ContinuedAssetStore,
        asset: &str,
    ) -> Result<Option<StoredAsset>> {
        self.reader(principal)?;
        self.check_continued_assets(assets)?;
        assets.get(asset)
    }

    /// Persist a continued raster under the room's current editor permission.
    ///
    /// # Errors
    /// Refuses invalid access, room binding, storage exhaustion or uncertain custody.
    pub fn put_continued_asset(
        &self,
        principal: &str,
        assets: &mut ContinuedAssetStore,
        prepared: PreparedAsset,
    ) -> Result<AssetReceipt> {
        self.editor(principal)?;
        self.check_continued_assets(assets)?;
        assets.put(prepared)
    }

    fn check_continued_assets(&self, assets: &ContinuedAssetStore) -> Result<()> {
        if assets.binding() != self.asset_binding() {
            return Err(Error::Contract("continued raster store room binding"));
        }
        Ok(())
    }
}
