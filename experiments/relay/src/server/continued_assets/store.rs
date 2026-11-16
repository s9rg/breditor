//! Dispatch both storage families through the same authenticated HTTP handlers.
use super::super::Host;
use crate::{
    ContinuedAssetStore, Error, Result, Room,
    assets::{AssetReceipt, AssetStore, PreparedAsset, StoredAsset},
};
use std::sync::{Arc, Mutex};
pub(crate) enum HttpRasterStore {
    Original(Arc<Mutex<AssetStore>>),
    Continued(Arc<Mutex<ContinuedAssetStore>>),
}

impl HttpRasterStore {
    pub(crate) fn of(host: &Host) -> Option<Self> {
        if let Some(assets) = &host.continued_assets {
            Some(Self::Continued(assets.clone()))
        } else {
            host.assets.clone().map(Self::Original)
        }
    }

    pub(crate) fn read(
        self,
        room: &Room,
        principal: &str,
        asset: &str,
    ) -> Result<Option<StoredAsset>> {
        match self {
            Self::Original(store) => {
                let store = store.lock().map_err(|_| Error::NeedsRecovery)?;
                room.read_asset(principal, &store, asset)
            }
            Self::Continued(store) => {
                let store = store.lock().map_err(|_| Error::NeedsRecovery)?;
                room.read_continued_asset(principal, &store, asset)
            }
        }
    }

    pub(crate) fn put(
        self,
        room: &Room,
        principal: &str,
        asset: PreparedAsset,
    ) -> Result<AssetReceipt> {
        match self {
            Self::Original(store) => {
                let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
                room.put_asset(principal, &mut store, asset)
            }
            Self::Continued(store) => {
                let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
                room.put_continued_asset(principal, &mut store, asset)
            }
        }
    }
}
