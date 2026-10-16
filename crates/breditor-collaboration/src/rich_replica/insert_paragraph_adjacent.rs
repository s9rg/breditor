//! Explicit plain text beside an atom lowers only to original owned flow creation.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::InsertBlocks,
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::FlowMove;
use serde_json::{Value, json};

impl RichReplica {
    /// Insert and enter a fresh empty paragraph immediately before/after a selected image/table/rule.
    ///
    /// The atom and its flow parent remain intact. One original insertion group
    /// owns visibility; foreign text remains causal when creator Undo hides the
    /// paragraph and returns on Redo. No protocol/command/checkpoint version changes.
    /// # Errors
    /// Stale/read-only, non-atom selections, invalid/reused identities and limits publish nothing.
    pub fn insert_paragraph_adjacent_guarded(
        &mut self,
        observation: &SharedObservation,
        paragraph: &str,
        movement: FlowMove,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let Some(Selection::Node { block }) = self.selection()? else {
            return Err(Error::Contract("adjacent paragraph requires selected atom"));
        };
        if !matches!(
            super::selection::kind(&self.document, &block)?.as_str(),
            "breditor/image" | "breditor/table" | "breditor/horizontal-rule"
        ) {
            return Err(Error::Contract("adjacent paragraph requires atom"));
        }
        let id = super::paragraphs::id(&block)?;
        match movement {
            FlowMove::Before => self.document.flow_position_before(&id),
            FlowMove::After => self.document.flow_position_after(&id),
        }
        .ok_or(Error::Contract("adjacent paragraph flow parent"))?;
        super::paragraphs::id(paragraph)?;
        let root: Value = serde_json::from_str(&self.canonical)?;
        let (parent, after) = super::paragraphs::layout(&root["root"], &block)?;
        let before = match movement {
            FlowMove::Before => Some(block),
            FlowMove::After => after,
        };
        let next = TextPoint { block: paragraph.into(), offset: 0, affinity: Affinity::After };
        self.apply_with_state(
            vec![Command::InsertBlocks(InsertBlocks {
                parent,
                before,
                nodes: vec![json!({"kind":"element","type":"breditor/paragraph","entityId":null,
                "properties":{"breditor/block-id":paragraph},"children":[]})],
            })],
            SelectionUpdate::Set(Some(Selection::TextRange { anchor: next.clone(), focus: next })),
            PendingFormatsUpdate::Set(None),
        )
    }
}
