//! Owner-only capacity of the actual log and bound raster store.
use crate::{
    Error, Result, Room, ServerLogStorageCapacity,
    assets::{AssetStore, MAX_ASSET_BYTES, MAX_ASSETS, MAX_STORED_BYTES},
};
use serde::Serialize;

/// Headroom for new complete immutable raster uploads in the bound store.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRasterStorageCapacity {
    /// Additional unique asset records before the count limit.
    pub assets_remaining: usize,
    /// Additional encoded payload bytes across all retained assets.
    pub payload_bytes_remaining: u64,
    /// Encoded payload ceiling of one raster.
    pub max_asset_payload_bytes: u64,
}

/// Capacity of the held relay log and bound raster store at one serialized room cut.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRoomStorageCapacity {
    /// This detached capacity report family.
    pub format: &'static str,
    /// Exact capacity report revision.
    pub format_version: u32,
    /// Current and retained log capacity.
    pub log: ServerLogStorageCapacity,
    /// Actual retained raster count and encoded-payload capacity.
    pub rasters: ServerRasterStorageCapacity,
}

impl Room {
    /// Read storage headroom while the host holds both actual owners and authenticates the room owner.
    /// Record, byte, file and raster limits are independent. The snapshot grants no reservation
    /// and does not measure filesystem free space or the separate Native history limits.
    ///
    /// # Errors
    /// Non-owner access, mismatched raster binding, uncertain storage or unexpected inventory refuse.
    pub fn storage_capacity(
        &self,
        assets: &AssetStore,
        principal: &str,
    ) -> Result<ServerRoomStorageCapacity> {
        self.recovery_inventory_owner(principal)?;
        if self.asset_binding() != assets.binding() {
            return Err(Error::Contract("room storage capacity raster binding differs"));
        }
        let (assets_retained, payload_retained) = assets.retained_storage_counters()?;
        Ok(ServerRoomStorageCapacity {
            format: "breditor/relay-room-storage-capacity",
            format_version: 1,
            log: self.log.storage_capacity()?,
            rasters: ServerRasterStorageCapacity {
                assets_remaining: MAX_ASSETS - assets_retained,
                payload_bytes_remaining: MAX_STORED_BYTES - payload_retained,
                max_asset_payload_bytes: MAX_ASSET_BYTES,
            },
        })
    }
}
