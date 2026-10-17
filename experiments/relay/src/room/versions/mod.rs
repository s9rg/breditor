//! Opt-in immutable version catalog, sharing the document authority's ordered durable log.
mod enable;
mod prepare;
mod publish;
mod read;
mod replay;
#[cfg(test)]
mod tests;
mod types;
use super::Room;
use crate::{Error, Result};
use std::collections::BTreeMap;
pub use types::*;

const MAX_VERSIONS: usize = 1024;
const MAX_PACKET_BYTES: usize = 4 * 1024 * 1024;
const MAX_CATALOG_BYTES: usize = 64 * 1024 * 1024;
const MAX_PAGE_ENTRIES: usize = 64;

struct StoredVersion {
    entry: DocumentVersionCatalogEntry,
    packet: String,
}
pub(super) struct VersionsState {
    binding: String,
    enabled_at: u64,
    bytes: usize,
    entries: BTreeMap<String, StoredVersion>,
    order: BTreeMap<u64, String>,
}
impl Room {
    fn versions_state(&self) -> Result<&VersionsState> {
        self.log.ready()?;
        self.versions.as_ref().ok_or(Error::Contract("document versions V1 not enabled"))
    }
}
