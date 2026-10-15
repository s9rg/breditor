//! Read-only formatting state guarded by the complete local shared publication.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::{
    codec::{RichFormatsJsonCodec, encode_rich_inline_format_state},
    identity::QualifiedName,
    rich_content::inspect_inline_format,
    state::EditorContext,
};

impl RichReplica {
    /// Read the original core state after causal selection resolution, without publishing.
    /// # Errors
    /// Rejects stale/foreign observations before kind parsing or state inspection.
    pub fn inline_format_state_json_guarded(
        &self,
        observation: &SharedObservation,
        kind: &str,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let kind =
            QualifiedName::try_new(kind).map_err(|_| Error::Contract("inline state kind"))?;
        let context = EditorContext::new(self.codec.schema().clone(), self.codec.limits().clone());
        let candidate = self.selection()?;
        let selection = candidate.as_ref().map(|value| value.admit(&self.document)).transpose()?;
        let pending = self
            .pending_formats()
            .map(|value| -> Result<_, Error> {
                RichFormatsJsonCodec::new(context.clone())
                    .decode(&serde_json::to_string(value)?)
                    .map_err(|_| Error::Contract("inline state pending formats"))
            })
            .transpose()?;
        let state = inspect_inline_format(
            &context,
            &self.document,
            selection.as_ref(),
            pending.as_ref(),
            &kind,
        )
        .map_err(|_| Error::Contract("inline state query"))?;
        encode_rich_inline_format_state(&context, &kind, &state)
            .map_err(|_| Error::Contract("inline state encoding"))
    }
}
