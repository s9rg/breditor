//! Guarded code exit lowers to existing independently owned flow creation and UI recipes.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::InsertBlocks,
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use serde_json::{Value, json};

impl RichReplica {
    /// Enter a fresh plain paragraph directly after the current code block, in the same flow.
    ///
    /// The entire code body/language and original next sibling survive, including
    /// when the caret is in the middle. One original `InsertBlocks` command plus
    /// explicit after-selection and cleared pending formats forms one selective
    /// history group. No new model, journal tag, wire operation or AST replacement.
    ///
    /// # Errors
    /// Stale/foreign observations and read-only reject first. Non-code/ranged
    /// selections, reused identities, invalid placement or limits are atomic failures.
    pub fn exit_code_block_guarded(
        &mut self,
        observation: &SharedObservation,
        paragraph: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.protocol.structural() {
            return Err(Error::Contract("code exit requires structural V2"));
        }
        let selection = self.selection()?.ok_or(Error::Contract("code exit requires caret"))?;
        let caret = selection.caret().ok_or(Error::Contract("code exit requires caret"))?;
        if super::selection::kind(&self.document, &caret.block)? != "breditor/code-block" {
            return Err(Error::Contract("code exit requires code block"));
        }
        let block = super::paragraphs::id(&caret.block)?;
        self.document
            .flow_position_after(&block)
            .ok_or(Error::Contract("code exit flow parent"))?;
        super::paragraphs::id(paragraph)?;
        let root: Value = serde_json::from_str(&self.canonical)?;
        let (parent, before) = super::paragraphs::layout(&root["root"], &caret.block)?;
        let next = TextPoint { block: paragraph.into(), offset: 0, affinity: Affinity::After };
        self.apply_with_state(
            vec![Command::InsertBlocks(InsertBlocks {
                parent,
                before,
                nodes: vec![json!({
                    "kind":"element", "type":"breditor/paragraph", "entityId":null,
                    "properties":{"breditor/block-id":paragraph}, "children":[]
                })],
            })],
            SelectionUpdate::Set(Some(Selection::TextRange { anchor: next.clone(), focus: next })),
            PendingFormatsUpdate::Set(None),
        )
    }
}
