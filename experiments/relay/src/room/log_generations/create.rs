//! Native validation before insert-only generation-directory creation. No live Room copying.
use crate::{
    AtomicTransportProfile, Result, Room, ServerLogGenerationOptions, access,
    log::generations::Creation,
};
use std::path::Path;

impl Room {
    /// Create an absent private generation directory with legacy writer transport and an exact
    /// explicitly selected native compiler. Native validation precedes filesystem creation.
    /// Original constructors/open/backup never select this automatically. Individual bounds stay
    /// unchanged; this retained Unix layout admits 64 files and 512 MiB of WAL bytes.
    /// # Errors
    /// Invalid source/owner/profile/IDs, occupied targets, custody, entropy or storage refuse.
    /// Failed creation may leave an unready private directory; it never replaces another target.
    pub fn create_log_generations(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
        profile: AtomicTransportProfile,
        options: &ServerLogGenerationOptions,
    ) -> Result<Self> {
        Self::create_generation_room(path, configuration, document, owner, profile, options, false)
    }
    pub(in crate::room) fn create_generation_room(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
        profile: AtomicTransportProfile,
        options: &ServerLogGenerationOptions,
        atomic: bool,
    ) -> Result<Self> {
        access::principal(owner)?;
        options.validate()?;
        Self::create_with_log(
            configuration,
            document,
            owner,
            profile.compile(configuration)?,
            profile.seed(),
            atomic,
            |seed| {
                let creating = Creation::begin(path, options)?;
                let log = creating.seed(seed)?;
                creating.finish(log)
            },
        )
    }
}
