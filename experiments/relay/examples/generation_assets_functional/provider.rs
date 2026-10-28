//! Host-selected live opaque mapping, separate from native metadata and receipts.
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use breditor_collab_relay::{Error, server::ServerRecoveryAssetProvider};
use std::sync::atomic::{AtomicBool, Ordering};
pub struct Guard {
    content: String,
    pub live: AtomicBool,
}
impl Guard {
    pub fn new(content: String) -> Self {
        Self { content, live: AtomicBool::new(true) }
    }
}
impl ServerRecoveryAssetProvider for Guard {
    fn check(&self) -> std::result::Result<(), Error> {
        if self.live.load(Ordering::Acquire) { Ok(()) } else { Err(Error::Permission) }
    }
    fn resolve(
        &self,
        reference: &VersionAssetReference,
    ) -> std::result::Result<Option<String>, Error> {
        self.check()?;
        Ok((reference.asset == "opaque-image").then(|| self.content.clone()))
    }
}
