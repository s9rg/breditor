//! Explicit document-family read proofs. Original selection getters remain closed.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::{
    codec::{
        RichFormatsJsonCodec, encode_rich_block_layout_state, encode_rich_selection_coverage,
        encode_rich_selection_format_state,
    },
    identity::QualifiedName,
    rich_content::{
        RichSelection, RichSelectionCoverage, RichSelectionKind, inspect_block_layout,
        inspect_selection_format,
    },
};
impl RichReplica {
    pub(super) fn document_tool_selection(&self) -> Result<Option<RichSelection>, Error> {
        if !self.document_selection_enabled() {
            return Err(Error::Contract("document tools require explicit family"));
        }
        if self.document_selected() {
            return RichSelection::try_new(&self.document, RichSelectionKind::Document)
                .map(Some)
                .map_err(|_| Error::Contract("document tools proof"));
        }
        self.selection()?.as_ref().map(|s| s.admit(&self.document)).transpose()
    }
    /// Pure document-family selection/explicit document coverage under an exact observation.
    /// # Errors
    /// Stale/foreign, wrong family/scope and native bounded admission or encoding failures are atomic.
    pub fn document_selection_coverage_json_guarded(
        &self,
        observation: &SharedObservation,
        scope: &str,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let selection = self.document_tool_selection()?;
        let coverage = match scope {
            "document" => Some(
                RichSelectionCoverage::document(&self.document)
                    .map_err(|_| Error::Contract("document coverage"))?,
            ),
            "selection" => selection
                .as_ref()
                .map(|s| {
                    RichSelectionCoverage::capture(&self.document, s)
                        .map_err(|_| Error::Contract("document selection coverage"))
                })
                .transpose()?,
            _ => return Err(Error::Contract("document coverage scope")),
        };
        encode_rich_selection_coverage(
            &super::paragraphs::context(&self.codec),
            &self.document,
            coverage.as_ref(),
        )
        .map_err(|_| Error::Contract("document coverage encoding"))
    }
    /// Pure document-family native format state; its existing read payload grants no mutation authority.
    /// # Errors
    /// Stale/foreign, wrong family, malformed kind or native read/encoding failures publish nothing.
    pub fn document_selection_format_state_json_guarded(
        &self,
        observation: &SharedObservation,
        kind: &str,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let selection = self.document_tool_selection()?;
        let context = super::paragraphs::context(&self.codec);
        let kind =
            QualifiedName::try_new(kind).map_err(|_| Error::Contract("document format kind"))?;
        let pending = self
            .pending_formats()
            .map(|p| {
                RichFormatsJsonCodec::new(context.clone())
                    .decode(&serde_json::to_string(p)?)
                    .map_err(|_| Error::Contract("document format pending"))
            })
            .transpose()?;
        let state = inspect_selection_format(
            &context,
            &self.document,
            selection.as_ref(),
            pending.as_ref(),
            &kind,
        )
        .map_err(|_| Error::Contract("document format state"))?;
        encode_rich_selection_format_state(&context, &kind, &state)
            .map_err(|_| Error::Contract("document format encoding"))
    }
    /// Pure document-family V3 layout state, preserving independent mixed and inherited values.
    /// # Errors
    /// Stale/foreign, wrong family/profile or native read/encoding failures publish nothing.
    pub fn document_block_layout_state_json_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let selection = self.document_tool_selection()?;
        let context = super::paragraphs::context(&self.codec);
        let state = inspect_block_layout(&context, &self.document, selection.as_ref())
            .map_err(|_| Error::Contract("document layout state"))?;
        encode_rich_block_layout_state(&context, &state)
            .map_err(|_| Error::Contract("document layout encoding"))
    }
}
