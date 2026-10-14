//! Matching native/Wasm rich list/paragraph history with media and pending caret formats.

use crate::{
    Error,
    table_axis_fixture::{admitted, selection_json},
};
use breditor_core::{
    block::OrderedListStart,
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, RichBlockDraft, RichFlowParent, RichFlowPosition, RichListKind,
        RichLocalOutcome, RichLocalSession, RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        RowId, TableId,
        actions::{
            IndentListItems, InsertBlocks, JoinListItems, JoinTextBlocks, OutdentListItems,
            RichAction, SplitListItem, SplitTextBlock, WrapList,
        },
    },
    session::HistoryCapacity,
};
use serde_json::{Value, json};

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich flow owner fixture")
}
fn id(value: &str) -> Result<BlockId, Error> {
    BlockId::try_new(value).map_err(contract)
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint, Error> {
    Ok(RichTextPoint::new(
        id(block)?,
        TextOffset::try_new(offset).map_err(contract)?,
        Affinity::After,
    ))
}
fn paragraph(block: &str, text: &str) -> Result<RichBlockDraft, Error> {
    let text: TextFragment = TextRun::try_new(text, FormatSet::default()).map_err(contract)?.into();
    RichBlockDraft::paragraph(&id(block)?, &text).map_err(contract)
}
fn capture(
    owner: &RichLocalSession,
    codec: &DocumentJsonCodecV2,
    name: &str,
) -> Result<Value, Error> {
    Ok(
        json!({"name":name,"document":codec.encode(owner.state().document().document()).map_err(contract)?,
        "selection":owner.state().selection().map(|selection|selection_json(owner.state().document(), selection)).transpose()?,
        "pending":owner.state().pending_formats().map(|formats|formats.iter().map(|format|format.kind().as_str()).collect::<Vec<_>>())}),
    )
}
fn publish(
    owner: &mut RichLocalSession,
    codec: &DocumentJsonCodecV2,
    name: &str,
    action: RichAction,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    let result =
        owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map).map_err(contract)?;
    if result != RichLocalOutcome::ContentCommitted {
        return Err(Error::Contract("rich flow fixture content group"));
    }
    steps.push(capture(owner, codec, name)?);
    Ok(())
}
fn boundaries(
    owner: &mut RichLocalSession,
    codec: &DocumentJsonCodecV2,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    let split = SplitTextBlock::capture(
        owner.state().document(),
        &point("p", 1)?,
        &id("paragraph-right")?,
        None,
    )
    .map_err(contract)?;
    publish(owner, codec, "split_paragraph", RichAction::SplitTextBlock(split), steps)?;
    let join =
        JoinTextBlocks::capture(owner.state().document(), &id("p")?, &id("paragraph-right")?)
            .map_err(contract)?;
    publish(owner, codec, "join_paragraph", RichAction::JoinTextBlocks(join), steps)
}
fn lists(
    owner: &mut RichLocalSession,
    codec: &DocumentJsonCodecV2,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    let cell = CellId::new(
        TableId::try_new("t").map_err(contract)?,
        RowId::try_new("r").map_err(contract)?,
        ColumnId::try_new("c").map_err(contract)?,
    );
    let insert = InsertBlocks::capture(
        owner.state().document(),
        &RichFlowPosition::new(RichFlowParent::Cell(cell), None),
        vec![paragraph("q", "Second")?, paragraph("z", "Third")?],
    )
    .map_err(contract)?;
    publish(owner, codec, "insert_fragment", RichAction::InsertBlocks(insert), steps)?;
    let wrap = WrapList::capture(
        owner.state().document(),
        &id("p")?,
        &id("z")?,
        &id("list")?,
        &[id("i0")?, id("i1")?, id("i2")?],
        RichListKind::Ordered(OrderedListStart::try_new(3).map_err(contract)?),
    )
    .map_err(contract)?;
    publish(owner, codec, "wrap_rich_list", RichAction::WrapList(wrap), steps)?;
    let indent = IndentListItems::capture(
        owner.state().document(),
        &id("list")?,
        &id("i1")?,
        &id("i2")?,
        Some((id("nested")?, RichListKind::Ordered(OrderedListStart::one()))),
    )
    .map_err(contract)?;
    publish(owner, codec, "indent_items", RichAction::IndentListItems(indent), steps)?;
    let outdent = OutdentListItems::capture(
        owner.state().document(),
        &id("nested")?,
        &id("i1")?,
        &id("i2")?,
        None,
    )
    .map_err(contract)?;
    publish(owner, codec, "outdent_items", RichAction::OutdentListItems(outdent), steps)
}
fn item_boundaries(
    owner: &mut RichLocalSession,
    codec: &DocumentJsonCodecV2,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    let split = SplitListItem::capture(
        owner.state().document(),
        &point("p", 1)?,
        &id("new-item")?,
        &id("item-right")?,
        None,
    )
    .map_err(contract)?;
    publish(owner, codec, "split_item", RichAction::SplitListItem(split), steps)?;
    let join = JoinListItems::capture(
        owner.state().document(),
        &id("list")?,
        &id("i0")?,
        &id("new-item")?,
    )
    .map_err(contract)?;
    publish(owner, codec, "join_item", RichAction::JoinListItems(join), steps)?;
    let outdent = OutdentListItems::capture(
        owner.state().document(),
        &id("list")?,
        &id("i1")?,
        &id("i1")?,
        Some(&id("suffix")?),
    )
    .map_err(contract)?;
    publish(owner, codec, "partial_unlist", RichAction::OutdentListItems(outdent), steps)
}

/// Run ten actual rich owner history groups, preserving IDs, media, numbering and carets.
///
/// # Errors
/// Rejects invalid golden input, actions, exact owner replay or checkpoint admission.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, document) = admitted(input)?;
    let point = point("p", 3)?;
    let mut owner = RichLocalSession::try_new(
        context,
        document,
        Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point }),
        HistoryCapacity::default(),
    )
    .map_err(contract)?;
    let initial = capture(&owner, &codec, "initial")?;
    let mut steps = Vec::new();
    boundaries(&mut owner, &codec, &mut steps)?;
    lists(&mut owner, &codec, &mut steps)?;
    item_boundaries(&mut owner, &codec, &mut steps)?;
    owner.set_pending_formats(&owner.snapshot(), Some(FormatSet::default())).map_err(contract)?;
    owner.insert_plain_text(&owner.snapshot(), "!").map_err(contract)?;
    steps.push(capture(&owner, &codec, "pending_plain_typing")?);
    let count = owner.undo_depth();
    let final_state = capture(&owner, &codec, "final")?;
    let checkpoint =
        RichSessionJsonCodec::new(owner.context().clone()).encode(&owner).map_err(contract)?;
    for _ in 0..count {
        owner.undo(&owner.snapshot()).map_err(contract)?;
    }
    let undone = capture(&owner, &codec, "undone")?;
    for _ in 0..count {
        owner.redo(&owner.snapshot()).map_err(contract)?;
    }
    let redone = capture(&owner, &codec, "redone")?;
    Ok(json!({"initial":initial,"steps":steps,"final":final_state,"undone":undone,"redone":redone,
        "undo_depth":owner.undo_depth(),"redo_depth":owner.redo_depth(),"revision":owner.state().revision().get().to_string(),"checkpoint":checkpoint}).to_string())
}
