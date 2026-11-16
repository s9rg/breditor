//! Trusted-host inspection and export of the prepared cut and exact retained client inputs.
use super::{RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity};
use crate::{
    RelaySegmentClientJournalPin, RelaySegmentClientUploadPin, Result, Room, assets::StoredAsset,
};
use std::{fs::File, io::Write};

impl RecoveredContinuedRasterRoom {
    /// Pin this target's exact durable completion for cold reopening.
    #[must_use]
    pub const fn identity(&self) -> &RecoveredContinuedRasterRoomIdentity {
        &self.identity
    }

    /// Inspect the restored native room. This is a borrow of its private owner.
    #[must_use]
    pub const fn room(&self) -> &Room {
        &self.room
    }

    /// Read bytes from either captured raster generation by original content ID.
    ///
    /// # Errors
    /// Refuses malformed IDs, changed custody and corrupt bytes.
    pub fn asset(&self, asset: &str) -> Result<Option<StoredAsset>> {
        self.directory.guard()?;
        self.assets.get(asset)
    }

    /// Return the exact selected or alternate client journal roster from this target.
    ///
    /// # Errors
    /// Refuses changed archive custody.
    pub fn client_journal_pins(
        &self,
        alternate: bool,
    ) -> Result<Vec<RelaySegmentClientJournalPin>> {
        self.directory.guard()?;
        let journals = if alternate { &self.clients.alternatives } else { &self.clients.journals };
        let Some(journals) = journals else { return Ok(Vec::new()) };
        journals.check()?;
        Ok(journals.pins().to_vec())
    }

    /// Copy an exact original client file selected by its complete pin.
    ///
    /// # Errors
    /// Refuses changed custody or an incomplete output write.
    pub fn copy_client_archive(
        &self,
        pin: &RelaySegmentClientJournalPin,
        alternate: bool,
        output: &mut impl Write,
    ) -> Result<bool> {
        self.directory.guard()?;
        let journals = if alternate { &self.clients.alternatives } else { &self.clients.journals };
        let Some(journals) = journals else { return Ok(false) };
        let Some(index) = journals.pins().iter().position(|retained| retained == pin) else {
            return Ok(false);
        };
        journals.copy(index, output)?;
        self.directory.guard()?;
        Ok(true)
    }

    /// Return the complete retained queue pins, including embedded participant queues.
    ///
    /// # Errors
    /// Refuses changed archive custody.
    pub fn client_upload_pins(&self) -> Result<Vec<RelaySegmentClientUploadPin>> {
        self.directory.guard()?;
        let Some(uploads) = &self.clients.uploads else { return Ok(Vec::new()) };
        uploads.check()?;
        Ok(uploads.pins().cloned().collect())
    }

    /// Open an exact retained original queue for private host recovery.
    ///
    /// # Errors
    /// Refuses changed custody or bytes.
    pub fn open_client_upload_archive(&self, writer: &str) -> Result<Option<File>> {
        self.directory.guard()?;
        self.clients.uploads.as_ref().map_or(Ok(None), |uploads| uploads.read(writer))
    }
}
