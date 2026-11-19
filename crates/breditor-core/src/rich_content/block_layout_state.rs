//! Native mixed layout reads retain absence as inheritance rather than a browser guess.
use super::{
    BlockId, RichBlockAlignment, RichBlockDirection, RichBlockIndent, RichBlockLayout,
    RichBlockLayoutError, RichDocument, RichLineHeight, RichSelection, RichSelectionCoverage,
};
use crate::state::EditorContext;

/// Read-only exact property state. It is not a schema proof or mutation observation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichLayoutFieldState<T> {
    /// No selected text block.
    Unavailable,
    /// Every block has this same authored value; `None` means inheritance everywhere.
    Uniform(Option<T>),
    /// Different authored values or a combination of an authored value and inheritance.
    Mixed,
}
impl<T: Copy + Eq> RichLayoutFieldState<T> {
    fn observe(&mut self, next: Option<T>) {
        if matches!(self, Self::Unavailable) {
            *self = Self::Uniform(next);
        } else if matches!(self,Self::Uniform(previous) if *previous != next) {
            *self = Self::Mixed;
        }
    }
}
/// Independent field states over all covered text blocks, including empty blocks and code.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RichBlockLayoutState {
    /// Exact number of selected text blocks, not a mutation budget.
    pub blocks: u64,
    /// Exact authored alignment; no direction-based substitution.
    pub alignment: RichLayoutFieldState<RichBlockAlignment>,
    /// Authored text direction; automatic is distinct from inheritance.
    pub direction: RichLayoutFieldState<RichBlockDirection>,
    /// Block indentation, independent from list nesting.
    pub indent: RichLayoutFieldState<RichBlockIndent>,
    /// Integer line-height percentage, independent from font size.
    pub line_height: RichLayoutFieldState<RichLineHeight>,
}
impl Default for RichBlockLayoutState {
    fn default() -> Self {
        Self {
            blocks: 0,
            alignment: RichLayoutFieldState::Unavailable,
            direction: RichLayoutFieldState::Unavailable,
            indent: RichLayoutFieldState::Unavailable,
            line_height: RichLayoutFieldState::Unavailable,
        }
    }
}
impl RichBlockLayout {
    /// Read one admitted text block under its exact explicit rich V3 context.
    /// # Errors
    /// Rejects incompatible profile/proof/limits, absent IDs and non-text nodes.
    pub fn read(
        context: &EditorContext,
        document: &RichDocument,
        block: &BlockId,
    ) -> Result<Self, RichBlockLayoutError> {
        if !context.schema().supports_rich_block_layout()
            || !document.document().is_proven_for(context.schema(), context.limits())
        {
            return Err(RichBlockLayoutError::Profile);
        }
        let path = document.block_path(block).ok_or(RichBlockLayoutError::Target)?;
        let node = document.document().node_at(path).map_err(|_| RichBlockLayoutError::Target)?;
        Self::from_node(node.as_element().ok_or(RichBlockLayoutError::Target)?)
    }
}
/// Inspect independent exact states without publishing, selecting targets in JS or skipping code.
/// # Errors
/// Rejects incompatible context, stale/foreign selection proof and contradictory admitted state.
pub fn inspect_block_layout(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
) -> Result<RichBlockLayoutState, RichBlockLayoutError> {
    if !context.schema().supports_rich_block_layout()
        || !document.document().is_proven_for(context.schema(), context.limits())
    {
        return Err(RichBlockLayoutError::Profile);
    }
    let mut state = RichBlockLayoutState::default();
    let Some(selection) = selection else { return Ok(state) };
    let coverage = RichSelectionCoverage::capture(document, selection)
        .map_err(|_| RichBlockLayoutError::Target)?;
    for span in coverage.text() {
        let value = RichBlockLayout::read(context, document, span.block())?;
        state.blocks = state.blocks.checked_add(1).ok_or(RichBlockLayoutError::Value)?;
        state.alignment.observe(value.alignment());
        state.direction.observe(value.direction());
        state.indent.observe(value.indent());
        state.line_height.observe(value.line_height());
    }
    Ok(state)
}
