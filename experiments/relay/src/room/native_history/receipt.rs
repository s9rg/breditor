//! Original globally ordered boundary acknowledgements survive restart and exact host retries.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane};
use crate::{Error, Result, Room};
use serde::Serialize;

/// A synced native-retention boundary, not a client edit receipt or activation permission.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNativeHistoryReceipt {
    /// Separate boundary-receipt format.
    pub format: &'static str,
    /// Exact contract revision.
    pub format_version: u32,
    /// Original global durable log position, preserved across all future native boundaries.
    pub sequence: String,
    /// The independently selected native lane.
    pub lane: ServerNativeHistoryLane,
    /// Exact original intent; no current generation is inferred from the retry.
    pub boundary: NativeHistoryBoundary,
    /// Domain-separated complete native cut before this boundary, including its effect author.
    pub before: [u8; 32],
    /// Domain-separated complete native cut afterward. This is not authentication or a credential.
    pub after: [u8; 32],
    /// True for a retry acknowledging an already durable original intent without an append.
    pub duplicate: bool,
}

fn key(lane: ServerNativeHistoryLane, boundary: &NativeHistoryBoundary) -> Result<String> {
    Ok(serde_json::to_string(&(lane, boundary))?)
}

impl Room {
    pub(super) fn native_history_retry(
        &self,
        lane: ServerNativeHistoryLane,
        boundary: &NativeHistoryBoundary,
    ) -> Result<Option<ServerNativeHistoryReceipt>> {
        Ok(self.native_history_boundaries.get(&key(lane, boundary)?).cloned().map(|mut receipt| {
            receipt.duplicate = true;
            receipt
        }))
    }

    pub(super) fn remember_native_history(
        &mut self,
        sequence: u64,
        lane: ServerNativeHistoryLane,
        boundary: NativeHistoryBoundary,
        before: [u8; 32],
        after: [u8; 32],
    ) -> Result<ServerNativeHistoryReceipt> {
        let key = key(lane, &boundary)?;
        if self.native_history_boundaries.contains_key(&key)
            || self.native_history_boundaries.len() >= 128
        {
            return Err(Error::Contract("duplicate or over-budget native boundary record"));
        }
        let receipt = ServerNativeHistoryReceipt {
            format: "breditor/relay-native-history-receipt",
            format_version: 1,
            sequence: sequence.to_string(),
            lane,
            boundary,
            before,
            after,
            duplicate: false,
        };
        self.native_history_boundaries.insert(key, receipt.clone());
        Ok(receipt)
    }
}
