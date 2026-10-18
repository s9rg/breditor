//! Native own-edit position mapping, then fresh causal anchors for exact future history.
use super::super::{
    RichReplica,
    selection::{CellTarget, Selection, SelectionOutcome, TextPoint},
    ui_state::UiState,
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{
    RichSearchPreview, RichSelection, RichSelectionKind, RichTextPoint,
};

pub(super) fn source(owner: &RichReplica) -> Result<Option<RichSelection>, Error> {
    if owner.journal.ui.document_selected() {
        return RichSelection::try_new(owner.document(), RichSelectionKind::Document)
            .map(Some)
            .map_err(|_| Error::Contract("search source document selection"));
    }
    owner
        .selection_for_mapping()?
        .as_ref()
        .map(|selection| selection.admit(owner.document()))
        .transpose()
}
fn point(value: &RichTextPoint) -> Result<TextPoint, Error> {
    Ok(TextPoint {
        block: value.block().as_str().into(),
        offset: u32::try_from(value.offset().get()).map_err(|_| Error::Offset)?,
        affinity: match value.affinity() {
            breditor_core::position::Affinity::Before => Affinity::Before,
            breditor_core::position::Affinity::After => Affinity::After,
        },
    })
}
pub(super) fn candidate(kind: &RichSelectionKind) -> Result<Selection, Error> {
    Ok(match kind {
        RichSelectionKind::TextRange { anchor, focus } => {
            Selection::TextRange { anchor: point(anchor)?, focus: point(focus)? }
        }
        RichSelectionKind::Node(block) => Selection::Node { block: block.as_str().into() },
        RichSelectionKind::Grid { anchor, focus } => Selection::Grid {
            anchor: CellTarget::from_core(anchor),
            focus: CellTarget::from_core(focus),
        },
        RichSelectionKind::Document => {
            return Err(Error::Contract("search document selection scope"));
        }
    })
}
pub(super) fn apply(
    owner: &mut RichReplica,
    preview: &RichSearchPreview,
    before_ui: &UiState,
    before_selection: Option<&Selection>,
) -> Result<(), Error> {
    if preview
        .selection()
        .is_some_and(|selection| matches!(selection.kind(), RichSelectionKind::Document))
    {
        if !owner.document_selection_enabled() {
            return Err(Error::Contract("search document scope not enabled"));
        }
        owner.journal.ui.select_document();
        return Ok(());
    }
    let after = preview.selection().map(|selection| candidate(selection.kind())).transpose()?;
    owner.journal.ui.set_selection(&owner.doc, &owner.document, after.as_ref())?;
    if after.as_ref().and_then(Selection::caret).is_some() {
        owner.journal.ui.set_pending(
            &owner.codec,
            &owner.doc,
            &owner.document,
            before_ui.pending.as_deref(),
        )?;
    }
    owner.journal.ui.outcome = if after.as_ref() == before_selection {
        SelectionOutcome::Preserved
    } else {
        SelectionOutcome::Relocated
    };
    Ok(())
}
