//! Immutable native/profile/transport deployment namespace, never authentication.
use super::{ProfileSeed, Room};
use crate::Result;
use sha2::{Digest, Sha256};
use std::fmt::Write;
impl Room {
    /// Stable host-deployment binding for this native seed, profile and transport.
    /// It excludes mutable roles/clocks and grants no account or serving authority.
    /// # Errors
    /// Refuses native identity serialization failure.
    pub fn deployment_binding(&self) -> Result<String> {
        let profile = match self.profile_seed {
            ProfileSeed::Original => (1, false),
            ProfileSeed::StructuralV2(standard) => (2, standard),
            ProfileSeed::LayoutV3(standard) => (3, standard),
        };
        let digest = Sha256::digest(serde_json::to_vec(&(
            "breditor/room-deployment-binding/1",
            &self.asset_binding,
            profile,
            self.atomic_transport_v2,
        ))?);
        let mut binding = String::with_capacity(64);
        for byte in digest {
            let _ = write!(binding, "{byte:02x}");
        }
        Ok(binding)
    }
}
