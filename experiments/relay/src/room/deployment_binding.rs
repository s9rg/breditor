//! Immutable native/profile/transport deployment namespace, never authentication.
use super::{ProfileSeed, Room};
use crate::Result;
#[cfg(feature = "server")]
use crate::RoomBackupIdentity;
use sha2::{Digest, Sha256};
use std::fmt::Write;
impl Room {
    /// Stable host-deployment binding for this native seed, profile and transport.
    /// It excludes mutable roles/clocks and grants no account or serving authority.
    /// # Errors
    /// Refuses native identity serialization failure.
    pub fn deployment_binding(&self) -> Result<String> {
        binding(&self.asset_binding, self.profile_seed, self.atomic_transport_v2)
    }
}

#[cfg(feature = "server")]
impl RoomBackupIdentity {
    pub(crate) fn deployment_binding(&self) -> Result<String> {
        binding(&self.asset_binding, self.profile.seed(), self.writer_transport_version == 2)
    }
}

fn binding(asset_binding: &str, seed: ProfileSeed, atomic: bool) -> Result<String> {
    let profile = match seed {
        ProfileSeed::Original => (1, false),
        ProfileSeed::StructuralV2(standard) => (2, standard),
        ProfileSeed::LayoutV3(standard) => (3, standard),
        ProfileSeed::LanguageV4(standard) => (4, standard),
    };
    let digest = Sha256::digest(serde_json::to_vec(&(
        "breditor/room-deployment-binding/1",
        asset_binding,
        profile,
        atomic,
    ))?);
    let mut binding = String::with_capacity(64);
    for byte in digest {
        let _ = write!(binding, "{byte:02x}");
    }
    Ok(binding)
}
