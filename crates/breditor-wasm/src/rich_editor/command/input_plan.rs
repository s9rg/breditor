//! Read-only staging of dependent local input actions, followed by one owner publication.
use super::support::checked;
use crate::BreditorError;
use breditor_core::{
    document::FormatSet,
    rich_content::{
        RichDocument, RichLocalSession, RichSelectionKind, RichTextPoint, actions::RichAction,
    },
    session::HistoryCapacity,
    state::EditorContext,
};
pub(super) struct Plan {
    pub(super) document: RichDocument,
    pub(super) actions: Vec<RichAction>,
    context: EditorContext,
}
impl Plan {
    pub(super) fn new(owner: &RichLocalSession) -> Self {
        Self {
            document: owner.state().document().clone(),
            actions: vec![],
            context: owner.context().clone(),
        }
    }
    pub(super) fn add(&mut self, action: RichAction) -> Result<(), BreditorError> {
        if let Some(edit) = checked(action.apply(&self.context, &self.document))? {
            self.document = edit.into_parts().0;
        }
        self.actions.push(action);
        Ok(())
    }
}
pub(super) fn formats(owner: &RichLocalSession) -> Result<FormatSet, BreditorError> {
    let selection = owner.state().selection().ok_or(super::invalid())?;
    let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
        return Err(super::invalid());
    };
    if anchor.block() == focus.block() && anchor.offset() == focus.offset() {
        return checked(owner.state().effective_caret_formats());
    }
    let document = owner.state().document();
    let a = document.block_path(anchor.block()).ok_or(super::invalid())?.to_vec();
    let f = document.block_path(focus.block()).ok_or(super::invalid())?.to_vec();
    let start = if a < f || (a == f && anchor.offset() <= focus.offset()) { anchor } else { focus };
    caret_formats(owner, start)
}
fn caret_formats(
    owner: &RichLocalSession,
    point: &RichTextPoint,
) -> Result<FormatSet, BreditorError> {
    let temporary = checked(RichLocalSession::try_new(
        owner.context().clone(),
        owner.state().document().clone(),
        Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point.clone() }),
        checked(HistoryCapacity::try_new(0))?,
    ))?;
    checked(temporary.state().effective_caret_formats())
}
