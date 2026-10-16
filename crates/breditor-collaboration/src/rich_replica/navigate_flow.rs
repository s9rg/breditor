//! Native logical flow movement is local UI, never a shared causal edit.
use super::{
    RichReplica, SharedObservation,
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{FlowMove, FlowNavigationOutcome, RichSelectionKind};

impl RichReplica {
    /// Resolve and publish the adjacent logical flow stop, preserving causal content and Redo.
    ///
    /// Read-only owners may navigate. Null/range/grid/interior/boundary selections
    /// return false without publishing; actual moves use ordinary causal selection
    /// capture. Table cells and captions cannot escape through this command.
    /// # Errors
    /// Stale/foreign guards, invalid native proof or failed staged publication are atomic failures.
    pub fn navigate_flow_guarded(
        &mut self,
        observation: &SharedObservation,
        movement: FlowMove,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        let Some(source) = self.selection()? else {
            return Ok(false);
        };
        let proof = source.admit(&self.document)?;
        let FlowNavigationOutcome::Moved(destination) =
            breditor_core::rich_content::navigate_flow(&self.document, &proof, movement)
                .map_err(|_| Error::Contract("shared flow navigation"))?
        else {
            return Ok(false);
        };
        let selection = match destination.kind() {
            RichSelectionKind::Node(id) => Selection::Node { block: id.as_str().into() },
            RichSelectionKind::TextRange { anchor, focus } => {
                let point =
                    |p: &breditor_core::rich_content::RichTextPoint| -> Result<TextPoint, Error> {
                        Ok(TextPoint {
                            block: p.block().as_str().into(),
                            offset: u32::try_from(p.offset().get()).map_err(|_| Error::Offset)?,
                            affinity: match p.affinity() {
                                breditor_core::position::Affinity::Before => Affinity::Before,
                                breditor_core::position::Affinity::After => Affinity::After,
                            },
                        })
                    };
                Selection::TextRange { anchor: point(anchor)?, focus: point(focus)? }
            }
            RichSelectionKind::Grid { .. } => {
                return Err(Error::Contract("shared flow destination"));
            }
        };
        self.set_selection(Some(&selection))
    }
}
