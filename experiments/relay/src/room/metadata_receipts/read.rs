//! One synchronous owner-held read, with no callback between the three lanes.
use super::{MetadataPage, MetadataPageSelection, revisions, suggestions, versions};
use crate::{Result, Room};

impl Room {
    pub(crate) fn recovery_metadata_page(
        &self,
        principal: &str,
        selected: &MetadataPageSelection,
    ) -> Result<MetadataPage> {
        self.recovery_inventory_owner(principal)?;
        selected.validate()?;
        Ok(MetadataPage {
            versions: versions::read(self, principal, &selected.versions)?,
            suggestions: suggestions::read(self, principal, &selected.suggestions)?,
            revisions: revisions::read(self, principal, &selected.revisions)?,
        })
    }
}
