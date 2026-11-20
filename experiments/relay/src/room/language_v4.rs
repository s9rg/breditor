//! Explicit frozen rich-language V4 room construction. Old seed tags never acquire V4 semantics.
use super::{ProfileSeed, Room};
use crate::{Result, access};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use std::path::Path;

impl Room {
    /// Create a rich-language V4 room with configuration 4, causal model 14 and journal 15.
    /// # Errors
    /// Rejects wrong profile revisions, invalid content/owner and existing or unwritable logs.
    pub fn create_language_v4(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
    ) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_configuration_json_v4(configuration)?;
        Self::create_bound(
            path,
            configuration,
            document,
            owner,
            profile,
            ProfileSeed::LanguageV4(false),
        )
    }

    /// Compose the standard inline declarations with the explicitly selected V4 room.
    /// # Errors
    /// Rejects wrong revisions, conflicting declarations, invalid room state and persistence failure.
    pub fn create_standard_language_v4(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
    ) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_standard_configuration_json_v4(configuration)?;
        Self::create_bound(
            path,
            configuration,
            document,
            owner,
            profile,
            ProfileSeed::LanguageV4(true),
        )
    }
}
