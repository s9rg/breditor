//! Real exclusive rich owner: combined typing, formatting, table/image and saved-selection history.

use crate::{
    Error,
    table_axis_fixture::{admitted, selection_json},
};
use breditor_core::{
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, ImageId, ImageSize, RichDocument, RichLocalOutcome,
        RichLocalSession, RichSelection, RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        RowId, TableId,
        actions::{
            InsertText, ReplaceText, ResizeImage, RichAction, RichFormatChange, SetHeading,
            SetInlineFormat, SetTableHeader,
        },
    },
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::json;

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich local owner fixture")
}

fn point(block: &str, offset: u64) -> Result<RichTextPoint, Error> {
    Ok(RichTextPoint::new(
        BlockId::try_new(block).map_err(contract)?,
        TextOffset::try_new(offset).map_err(contract)?,
        Affinity::After,
    ))
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind, Error> {
    let point = point(block, offset)?;
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn text(value: &str) -> Result<TextFragment, Error> {
    Ok(TextRun::try_new(value, FormatSet::default()).map_err(contract)?.into())
}
fn stage(
    context: &EditorContext,
    document: &mut RichDocument,
    actions: &mut Vec<RichAction>,
    action: RichAction,
) -> Result<(), Error> {
    let next = action
        .apply(context, document)
        .map_err(contract)?
        .ok_or(Error::Contract("local fixture stage"))?;
    *document = next.into_parts().0;
    actions.push(action);
    Ok(())
}

fn text_actions(
    context: &EditorContext,
    document: &mut RichDocument,
    actions: &mut Vec<RichAction>,
) -> Result<(), Error> {
    let action = RichAction::InsertText(
        InsertText::capture(document, &point("p", 1)?, &text("X")?).map_err(contract)?,
    );
    stage(context, document, actions, action)?;
    let action = RichAction::ReplaceText(
        ReplaceText::capture(
            document,
            &BlockId::try_new("caption").map_err(contract)?,
            TextOffset::ZERO,
            TextOffset::try_new(4).map_err(contract)?,
            &text("Caption 🙂")?,
        )
        .map_err(contract)?,
    );
    stage(context, document, actions, action)?;
    let action = RichAction::SetInlineFormat(
        SetInlineFormat::capture(
            document,
            &BlockId::try_new("p").map_err(contract)?,
            TextOffset::try_new(2).map_err(contract)?,
            TextOffset::try_new(4).map_err(contract)?,
            &RichFormatChange::Remove(QualifiedName::try_new("breditor/strong").map_err(contract)?),
        )
        .map_err(contract)?,
    );
    stage(context, document, actions, action)?;
    let action = RichAction::SetHeading(
        SetHeading::capture(document, &BlockId::try_new("p").map_err(contract)?, Some(2))
            .map_err(contract)?,
    );
    stage(context, document, actions, action)
}

fn structural_actions(
    context: &EditorContext,
    document: &mut RichDocument,
    actions: &mut Vec<RichAction>,
) -> Result<(), Error> {
    let cell = CellId::new(
        TableId::try_new("t").map_err(contract)?,
        RowId::try_new("r").map_err(contract)?,
        ColumnId::try_new("c").map_err(contract)?,
    );
    let grid = RichSelection::try_new(
        document,
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    )
    .map_err(contract)?;
    let action = RichAction::SetTableHeader(
        SetTableHeader::capture(document, &grid, true).map_err(contract)?,
    );
    stage(context, document, actions, action)?;
    let action = RichAction::ResizeImage(
        ResizeImage::capture(
            document,
            &ImageId::try_new("image").map_err(contract)?,
            Some(ImageSize::try_new(320, 240).map_err(contract)?),
        )
        .map_err(contract)?,
    );
    stage(context, document, actions, action)
}

/// Exercise a mixed six-action runtime group, moved caret, exact undo/redo and stale rejection.
///
/// This proves the actual local owner, not a JavaScript history approximation.
/// It does not serialize or restore local history; the durable rich codec remains separate.
///
/// # Errors
/// Rejects malformed fixtures, invalid actions/selections or exact replay failures.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, original) = admitted(input)?;
    let initial = codec.encode(original.document()).map_err(contract)?;
    let mut staged = original.clone();
    let mut actions = Vec::new();
    text_actions(&context, &mut staged, &mut actions)?;
    structural_actions(&context, &mut staged, &mut actions)?;
    let mut owner = RichLocalSession::try_new(
        context,
        original,
        Some(caret("p", 1)?),
        HistoryCapacity::default(),
    )
    .map_err(contract)?;
    let old = owner.snapshot();
    owner
        .dispatch(&old, &actions, RichSelectionUpdate::Set(Some(caret("caption", 10)?)))
        .map_err(contract)?;
    let changed = codec.encode(owner.state().document().document()).map_err(contract)?;
    let after_selection = selection_json(
        owner.state().document(),
        owner.state().selection().ok_or(Error::Contract("owner selection"))?,
    )?;
    owner.set_selection(&owner.snapshot(), Some(caret("p", 4)?)).map_err(contract)?;
    owner.undo(&owner.snapshot()).map_err(contract)?;
    let undone = codec.encode(owner.state().document().document()).map_err(contract)?;
    let before_selection = selection_json(
        owner.state().document(),
        owner.state().selection().ok_or(Error::Contract("owner selection"))?,
    )?;
    owner.redo(&owner.snapshot()).map_err(contract)?;
    let redone = codec.encode(owner.state().document().document()).map_err(contract)?;
    let redo_selection = selection_json(
        owner.state().document(),
        owner.state().selection().ok_or(Error::Contract("owner selection"))?,
    )?;
    let stale_rejected = owner.dispatch(&old, &[], RichSelectionUpdate::Map).is_err();
    owner.undo(&owner.snapshot()).map_err(contract)?;
    owner.set_selection(&owner.snapshot(), Some(caret("p", 3)?)).map_err(contract)?;
    let observed = owner.snapshot();
    let no_op = RichAction::InsertText(
        InsertText::capture(owner.state().document(), &point("p", 0)?, &TextFragment::empty())
            .map_err(contract)?,
    );
    let no_op_preserved_redo =
        owner.dispatch(&observed, &[no_op], RichSelectionUpdate::Map).map_err(contract)?
            == RichLocalOutcome::Unchanged
            && owner.redo_depth() == 1;
    owner.redo(&observed).map_err(contract)?;
    Ok(json!({"initial":initial,"changed":changed,"undone":undone,"redone":redone,
        "before_selection":before_selection,"after_selection":after_selection,"redo_selection":redo_selection,
        "stale_rejected":stale_rejected,"no_op_preserved_redo":no_op_preserved_redo,
        "action_count":actions.len(),"undo_depth":owner.undo_depth(),"redo_depth":owner.redo_depth(),
        "revision":owner.state().revision().get().to_string()}).to_string())
}
