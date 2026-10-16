//! Writer-owned atom deletion with Rust-proved logical recovery.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::{DeleteBlock, InsertBlocks},
    atom_edit,
};
use crate::Error;
use breditor_core::rich_content::{FlowMove, plan_atom_deletion};
use serde_json::Value;
impl RichReplica {
    /// Hide a selected whole image/table/rule, recovering toward the requested flow direction.
    ///
    /// The pure core planner prefers a surviving native stop. A sole flow child
    /// or hidden-only remainder instead gets the supplied fresh empty paragraph
    /// at the old slot. The paragraph ID is unused otherwise. Original insertion
    /// and writer-owned deletion commands share one selective Undo group; peer
    /// text, geometry and asset references are retained, never erased.
    /// # Errors
    /// Stale/read-only, non-atoms, used floor IDs or admission failures publish nothing.
    /// A required floor also needs the original insertion command's transient node headroom.
    pub fn delete_atom_guarded(
        &mut self,
        observation: &SharedObservation,
        paragraph: &str,
        movement: FlowMove,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let source =
            self.selection()?.ok_or(Error::Contract("atom deletion requires selection"))?;
        let proof = source.admit(&self.document)?;
        let plan = plan_atom_deletion(&self.document, &proof, movement)
            .map_err(|_| Error::Contract("atom deletion native plan"))?;
        let block = plan.target().as_str();
        let mut commands = vec![];
        let selection = if let Some(recovery) = plan.recovery() {
            atom_edit::selection(recovery)?
        } else {
            let node = atom_edit::paragraph(paragraph, "")?;
            let root: Value = serde_json::from_str(&self.canonical)?;
            let (parent, _) = super::paragraphs::layout(&root["root"], block)?;
            commands.push(Command::InsertBlocks(InsertBlocks {
                parent,
                before: Some(block.into()),
                nodes: vec![node],
            }));
            atom_edit::caret(paragraph, 0)
        };
        commands.push(Command::DeleteBlock(DeleteBlock { block: block.into() }));
        self.apply_with_state(
            commands,
            SelectionUpdate::Set(Some(selection)),
            PendingFormatsUpdate::Set(None),
        )
    }
}
