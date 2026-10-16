//! Read-only coverage and formatting state after native causal-selection resolution.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::{
    codec::{
        RichFormatsJsonCodec, encode_rich_selection_coverage, encode_rich_selection_format_state,
    },
    identity::QualifiedName,
    rich_content::{RichSelectionCoverage, inspect_selection_format},
};
impl RichReplica {
    /// Read current selection or explicit whole-document coverage without publishing or authoring.
    /// # Errors
    /// Stale/foreign guard, unknown scope and bounded read failures publish nothing.
    pub fn selection_coverage_json_guarded(
        &self,
        observation: &SharedObservation,
        scope: &str,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let coverage = match scope {
            "document" => Some(
                RichSelectionCoverage::document(&self.document)
                    .map_err(|_| Error::Contract("document coverage"))?,
            ),
            "selection" => self
                .selection()?
                .as_ref()
                .map(|s| {
                    RichSelectionCoverage::capture(&self.document, &s.admit(&self.document)?)
                        .map_err(|_| Error::Contract("selection coverage"))
                })
                .transpose()?,
            _ => return Err(Error::Contract("selection coverage scope")),
        };
        encode_rich_selection_coverage(
            &super::paragraphs::context(&self.codec),
            &self.document,
            coverage.as_ref(),
        )
        .map_err(|_| Error::Contract("selection coverage encoding"))
    }
    /// Read distinct selection-format state; original inline-state node/grid behavior stays exact.
    /// # Errors
    /// Stale/foreign guard, unknown kind or failed native proof/read encoding publishes nothing.
    pub fn selection_format_state_json_guarded(
        &self,
        observation: &SharedObservation,
        kind: &str,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let kind =
            QualifiedName::try_new(kind).map_err(|_| Error::Contract("selection format kind"))?;
        let context = super::paragraphs::context(&self.codec);
        let selection = self.selection()?.as_ref().map(|s| s.admit(&self.document)).transpose()?;
        let pending = self
            .pending_formats()
            .map(|p| {
                RichFormatsJsonCodec::new(context.clone())
                    .decode(&serde_json::to_string(p)?)
                    .map_err(|_| Error::Contract("selection format pending"))
            })
            .transpose()?;
        let state = inspect_selection_format(
            &context,
            &self.document,
            selection.as_ref(),
            pending.as_ref(),
            &kind,
        )
        .map_err(|_| Error::Contract("selection format state"))?;
        encode_rich_selection_format_state(&context, &kind, &state)
            .map_err(|_| Error::Contract("selection format state encoding"))
    }
}
