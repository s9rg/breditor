//! Explicit new-room transport selection, independent of rich grammar and original durable logs.
use super::{ProfileSeed, Room};
use crate::{Result, access};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Exact native profile compiler for a newly created atom-lineage transport room.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AtomicTransportProfile {
    /// Original rich grammar and explicitly configured extensions.
    Original,
    /// Explicit structural grammar revision two.
    StructuralV2 {
        /// Compose the standard inline V1 preset rather than only configured extensions.
        standard_inline_v1: bool,
    },
    /// Explicit layout grammar revision three.
    LayoutV3 {
        /// Compose the standard inline V1 preset rather than only configured extensions.
        standard_inline_v1: bool,
    },
}
impl AtomicTransportProfile {
    fn compile(self, configuration: &str) -> Result<SharedRichProfile> {
        Ok(match self {
            Self::Original => SharedRichProfile::from_configuration_json(configuration)?,
            Self::StructuralV2 { standard_inline_v1: false } => {
                SharedRichProfile::from_configuration_json_v2(configuration)?
            }
            Self::StructuralV2 { standard_inline_v1: true } => {
                SharedRichProfile::from_standard_configuration_json_v2(configuration)?
            }
            Self::LayoutV3 { standard_inline_v1: false } => {
                SharedRichProfile::from_configuration_json_v3(configuration)?
            }
            Self::LayoutV3 { standard_inline_v1: true } => {
                SharedRichProfile::from_standard_configuration_json_v3(configuration)?
            }
        })
    }
    pub(super) const fn seed(self) -> ProfileSeed {
        match self {
            Self::Original => ProfileSeed::Original,
            Self::StructuralV2 { standard_inline_v1 } => {
                ProfileSeed::StructuralV2(standard_inline_v1)
            }
            Self::LayoutV3 { standard_inline_v1 } => ProfileSeed::LayoutV3(standard_inline_v1),
        }
    }
    pub(super) const fn from_seed(seed: ProfileSeed) -> Self {
        match seed {
            ProfileSeed::Original => Self::Original,
            ProfileSeed::StructuralV2(standard_inline_v1) => {
                Self::StructuralV2 { standard_inline_v1 }
            }
            ProfileSeed::LayoutV3(standard_inline_v1) => Self::LayoutV3 { standard_inline_v1 },
        }
    }
}
impl Room {
    /// Create a new room with explicitly selected packing-independent writer transport V2.
    /// Its separate durable seed binds the exact compiler and transport. Existing rooms are not
    /// migrated, existing constructors remain V1, and wrong-version groups reject without fallback.
    /// # Errors
    /// Rejects wrong profile revisions, invalid source/owner, existing logs and persistence failures.
    pub fn create_atomic_transport_v2(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
        profile: AtomicTransportProfile,
    ) -> Result<Self> {
        access::principal(owner)?;
        Self::create_bound_transport(
            path,
            configuration,
            document,
            owner,
            profile.compile(configuration)?,
            profile.seed(),
            true,
        )
    }
    /// Immutable group/clock digest contract for this room, recovered from its durable seed.
    #[must_use]
    pub const fn writer_transport_version(&self) -> u32 {
        if self.atomic_transport_v2 { 2 } else { 1 }
    }
}
