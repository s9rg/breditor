//! Exact-owner metadata bridge; never a new saved/history family.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::{
    codec::{RichWritingCodecError, encode_rich_writing_tools},
    rich_content::RichWritingError,
};

impl RichReplica {
    /// Encode accepted counts/headings with the current guarded publication.
    /// # Errors
    /// Rejects stale/foreign observations and complete native/output limits before
    /// returning any text. Read-only owners are supported without publication.
    pub fn writing_tools_json_guarded(
        &self,
        observed: &SharedObservation,
    ) -> Result<String, Error> {
        self.check(observed)?;
        let revision = self
            .journal
            .publication
            .parse::<u64>()
            .map_err(|_| Error::Contract("writing read publication"))?;
        encode_rich_writing_tools(self.document(), revision).map_err(|error| match error {
            RichWritingCodecError::ReadLimit
            | RichWritingCodecError::Read(RichWritingError::DocumentLimit) => {
                Error::Limit("writing read document or encoded bytes")
            }
            _ => Error::Contract("writing read encoding"),
        })
    }
}
