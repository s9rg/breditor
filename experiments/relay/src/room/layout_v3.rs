//! Explicit layout room construction. Old seed tags and constructors never acquire V3 semantics.
use super::{ProfileSeed, Room};
use crate::{Result, access};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use std::path::Path;

impl Room {
    /// Create a layout V3 room with configuration 3, causal model 13 and journal 14.
    /// # Errors
    /// Rejects wrong profile revisions, invalid content/owner and existing or unwritable logs.
    pub fn create_layout_v3(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
    ) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_configuration_json_v3(configuration)?;
        Self::create_bound(
            path,
            configuration,
            document,
            owner,
            profile,
            ProfileSeed::LayoutV3(false),
        )
    }

    /// Compose the standard inline declarations with the explicitly selected layout V3 room.
    /// # Errors
    /// Rejects wrong revisions, conflicting declarations, invalid room state and persistence failure.
    pub fn create_standard_layout_v3(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
    ) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_standard_configuration_json_v3(configuration)?;
        Self::create_bound(
            path,
            configuration,
            document,
            owner,
            profile,
            ProfileSeed::LayoutV3(true),
        )
    }
}
