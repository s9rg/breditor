//! One guarded structured document paste retains actual before-UI and native selective history.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::PasteDocumentClipboardV1,
};
use crate::{Error, register::Stamp};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    clipboard_json: String,
    prefix: String,
}
impl RichReplica {
    /// Paste native text/flow/grid over the current complete document with one owned edit group.
    /// The original clipboard and journal meanings are unchanged; older document readers reject
    /// this additive command tag. Host namespaces remain permanently consumed on failure/Undo.
    /// # Errors
    /// Stale/read-only/wrong family/scope precede parsing; schema, typed/historical IDs, budgets,
    /// shared lowering and exact replay failures retain content, UI, both stacks and observation.
    pub fn paste_document_clipboard_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.document_selection_enabled() || !self.document_selected() {
            return Err(Error::Contract("document clipboard requires explicit scope/family"));
        }
        if input.len() > 4 * 1024 * 1024 {
            return Err(Error::Limit("document clipboard request bytes"));
        }
        let r: Record = serde_json::from_str(input)?;
        let action =
            PasteDocumentClipboardV1 { clipboard_json: r.clipboard_json, prefix: r.prefix };
        let plan = action.plan(&self.codec, &self.document, Stamp::next(&self.doc)?)?;
        let point = super::atom_edit::selection(
            &breditor_core::rich_content::RichSelectionKind::TextRange {
                anchor: plan.insertion_end().clone(),
                focus: plan.insertion_end().clone(),
            },
        )?;
        self.apply_with_state_inner(
            vec![Command::PasteDocumentClipboardV1(action)],
            SelectionUpdate::Set(Some(point)),
            PendingFormatsUpdate::Set(None),
            None,
            Some(plan.document()),
        )
    }
}
