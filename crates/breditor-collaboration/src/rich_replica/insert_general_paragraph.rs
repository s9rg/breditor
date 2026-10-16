//! Observed general paragraph request with a complete native preview and actual before-UI history.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::InsertGeneralParagraphV1, selection::Selection,
};
use crate::Error;
use breditor_core::codec::RichFormatsJsonCodec;
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    selection: Selection,
    prefix: String,
}
impl RichReplica {
    /// Insert a paragraph/list/task boundary over general prose coverage as one native edit.
    /// Every identity and topology decision is derived in Rust from the admitted source.
    /// # Errors
    /// Stale/read-only/wrong family reject before parsing. Invalid targets/namespaces or final
    /// schema/resource/lowering failures leave content, local UI, history and observation unchanged.
    pub fn insert_general_paragraph_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        super::general_range_input_json::authorize(self, observation)?;
        let r: Record = super::general_range_input_json::decode(input)?;
        let mut native = self.general_range_preview()?;
        native
            .insert_general_paragraph(
                &native.snapshot(),
                r.selection.admit(&self.document)?.kind(),
                &r.prefix,
            )
            .map_err(|_| Error::Contract("general paragraph native admission"))?;
        let selection = SelectionUpdate::Set(Some(super::atom_edit::selection(
            native
                .state()
                .selection()
                .ok_or(Error::Contract("general paragraph resulting caret"))?
                .kind(),
        )?));
        let formats = RichFormatsJsonCodec::new(super::paragraphs::context(&self.codec));
        let pending = PendingFormatsUpdate::Set(
            native
                .state()
                .pending_formats()
                .map(|value| {
                    serde_json::from_str(
                        &formats
                            .encode(value)
                            .map_err(|_| Error::Contract("general paragraph formats"))?,
                    )
                    .map_err(Error::from)
                })
                .transpose()?,
        );
        self.apply_with_state_inner(
            vec![Command::InsertGeneralParagraphV1(InsertGeneralParagraphV1 {
                selection: r.selection,
                prefix: r.prefix,
            })],
            selection,
            pending,
            None,
            Some(native.state().document()),
        )
    }
}
