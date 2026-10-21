//! Detached capability reads do not authorize a boundary, writer lease or room activation.
use crate::{Result, Room};
use serde::Serialize;

/// Explicit recovery family of one actual server-native owner.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum ServerNativeHistoryFamily {
    /// Existing native checkpoint family; its original bounds remain unchanged.
    #[serde(rename = "original")]
    Original,
    /// Explicit native root/sealed/active generation archive.
    #[serde(rename = "segmented-v1")]
    SegmentedV1,
}

/// Current native receiver families; not server-log rotation or client capability negotiation.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNativeHistoryDescriptor {
    /// Separate native-retention descriptor, never the old room profile format.
    pub format: &'static str,
    /// Exact revision of this detached descriptor.
    pub format_version: u32,
    /// Actual document receiver's explicitly selected native family.
    pub document: ServerNativeHistoryFamily,
    /// Actual comment receiver's family, or absent when comments are disabled.
    pub review: Option<ServerNativeHistoryFamily>,
}

impl Room {
    /// Read the actual selected native families after current room-read authorization.
    /// # Errors
    /// Missing current permission or uncertain durable storage refuses the read.
    pub fn native_history_descriptor(
        &self,
        principal: &str,
    ) -> Result<ServerNativeHistoryDescriptor> {
        self.reader(principal)?;
        let family = |enabled| {
            if enabled {
                ServerNativeHistoryFamily::SegmentedV1
            } else {
                ServerNativeHistoryFamily::Original
            }
        };
        Ok(ServerNativeHistoryDescriptor {
            format: "breditor/relay-native-history",
            format_version: 1,
            document: family(self.replica.segmented_history_enabled()),
            review: self.review.as_ref().map(|state| family(state.session.has_segmented_history())),
        })
    }
}
