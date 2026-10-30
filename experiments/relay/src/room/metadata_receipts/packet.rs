//! Hash the original UTF-8 packet bytes, not reconstructed or escaped DTO text.
use serde::{Deserialize, Serialize};

#[derive(Clone, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PacketFingerprint {
    pub id: String,
    pub bytes: usize,
    pub sha256: String,
}

impl PacketFingerprint {
    pub fn of(id: &str, packet: &str) -> Self {
        Self {
            id: id.into(),
            bytes: packet.len(),
            sha256: crate::assets::asset_id(packet.as_bytes()),
        }
    }
}
