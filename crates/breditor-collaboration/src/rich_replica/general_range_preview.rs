//! Disposable native preview retains actual UI even when an input target is elsewhere.
use super::RichReplica;
use crate::Error;
use breditor_core::{
    codec::RichFormatsJsonCodec, rich_content::RichLocalSession, session::HistoryCapacity,
};
impl RichReplica {
    pub(super) fn general_range_preview(&self) -> Result<RichLocalSession, Error> {
        let context = super::paragraphs::context(&self.codec);
        let formats = RichFormatsJsonCodec::new(context.clone());
        let mut preview = RichLocalSession::try_new(
            context,
            self.document.clone(),
            self.selection()?
                .map(|s| s.admit(&self.document).map(|s| s.kind().clone()))
                .transpose()?,
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("general preview history"))?,
        )
        .map_err(|_| Error::Contract("general preview"))?;
        if let Some(pending) = self.pending_formats() {
            let pending = formats
                .decode(&serde_json::to_string(pending)?)
                .map_err(|_| Error::Contract("general preview pending"))?;
            preview
                .set_pending_formats(&preview.snapshot(), Some(pending))
                .map_err(|_| Error::Contract("general preview pending"))?;
        }
        Ok(preview)
    }
}
