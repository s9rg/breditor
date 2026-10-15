//! Original clipboard codec through actual rich paste, media and recovered history.

use crate::{
    Error,
    table_axis_fixture::{admitted, selection_json},
};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, CellId, ChangeId, ColumnId, ReplicaId, RichClipboardError,
        RichClipboardFragment, RichClipboardIdAllocator, RichClipboardIdentityKind, RichDocument,
        RichFlowParent, RichFlowPosition, RichLocalSession, RichSelection, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint, RowId, TableId,
        actions::{InsertBlocks, InsertText, PasteTableCells, RichAction},
    },
    session::HistoryCapacity,
};
use serde_json::{Value, json};

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich structured clipboard fixture")
}
#[derive(Default)]
struct Ids(u64);
impl RichClipboardIdAllocator for Ids {
    fn next(&mut self, kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        self.0 += 1;
        Ok(format!("paste-{kind:?}-{}", self.0))
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            100 + self.0,
            ChangeId::new(
                ReplicaId::try_new(7).map_err(|_| RichClipboardError::Allocation)?,
                self.0,
            ),
        ))
    }
}
fn point(id: &str, offset: u64) -> Result<RichTextPoint, Error> {
    Ok(RichTextPoint::new(
        BlockId::try_new(id).map_err(contract)?,
        TextOffset::try_new(offset).map_err(contract)?,
        Affinity::After,
    ))
}
fn snapshot(owner: &RichLocalSession, codec: &DocumentJsonCodecV2) -> Result<Value, Error> {
    Ok(
        json!({"document":codec.encode(owner.state().document().document()).map_err(contract)?,"selection":owner.state().selection().map(|selection|selection_json(owner.state().document(),selection)).transpose()?,"undo":owner.undo_depth(),"redo":owner.redo_depth(),"revision":owner.state().revision().get().to_string()}),
    )
}
fn copy(
    context: &breditor_core::state::EditorContext,
    doc: &RichDocument,
    kind: RichSelectionKind,
) -> Result<RichClipboardFragment, Error> {
    let selection = RichSelection::try_new(doc, kind).map_err(contract)?;
    RichClipboardFragment::copy_selection(context, doc, &selection)
        .map_err(contract)?
        .ok_or(Error::Contract("nonempty clipboard"))
}
fn publish(
    owner: &mut RichLocalSession,
    codec: &DocumentJsonCodecV2,
    name: &str,
    action: RichAction,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map).map_err(contract)?;
    steps.push(json!({"name":name,"state":snapshot(owner,codec)?}));
    Ok(())
}
fn media(
    owner: &mut RichLocalSession,
    original: &RichDocument,
    codec: &DocumentJsonCodecV2,
    ids: &mut Ids,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    for (name, id) in [("image_paste", "covered-image-block"), ("table_paste", "table-block")] {
        let fragment = copy(
            owner.context(),
            original,
            RichSelectionKind::Node(BlockId::try_new(id).map_err(contract)?),
        )?;
        let draft = fragment.flow_drafts(owner.context(), ids).map_err(contract)?;
        let action = InsertBlocks::capture(
            owner.state().document(),
            &RichFlowPosition::new(RichFlowParent::Document, None),
            draft,
        )
        .map_err(contract)?;
        publish(owner, codec, name, RichAction::InsertBlocks(action), steps)?;
    }
    Ok(())
}
fn inline(
    owner: &mut RichLocalSession,
    original: &RichDocument,
    codec: &DocumentJsonCodecV2,
    cell: &CellId,
    steps: &mut Vec<Value>,
) -> Result<(), Error> {
    let fragment = copy(
        owner.context(),
        original,
        RichSelectionKind::TextRange {
            anchor: point("heading-one", 7)?,
            focus: point("heading-one", 5)?,
        },
    )?;
    let name = QualifiedName::try_new("breditor/block-id").map_err(contract)?;
    let body = owner
        .state()
        .document()
        .cell_path(cell)
        .and_then(|path| owner.state().document().document().node_at(path).ok())
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|cell| cell.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|node| node.properties().get(&name))
        .and_then(breditor_core::document::PropertyValue::as_string)
        .ok_or(Error::Contract("pasted cell body"))?
        .to_owned();
    let point = point(&body, 5)?;
    owner
        .set_selection(
            &owner.snapshot(),
            Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point.clone() }),
        )
        .map_err(contract)?;
    let action = InsertText::capture(
        owner.state().document(),
        &point,
        &fragment.text_fragment(owner.context()).map_err(contract)?,
    )
    .map_err(contract)?;
    publish(owner, codec, "inline_paste", RichAction::InsertText(action), steps)
}

/// Copy a merged rich rectangle, paste fresh bodies, copy media/table, inline-paste and reload history.
///
/// # Errors
/// Rejects bad source/capture/interchange/allocation/actions or exact recovered history mismatches.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, original) = admitted(input)?;
    let cell = CellId::new(
        TableId::try_new("table-one").map_err(contract)?,
        RowId::try_new("r1").map_err(contract)?,
        ColumnId::try_new("c1").map_err(contract)?,
    );
    let selection = RichSelectionKind::Grid { anchor: cell.clone(), focus: cell };
    let fragment = copy(&context, &original, selection.clone())?;
    let plain = fragment.plain_text().map_err(contract)?;
    let clipboard = RichClipboardJsonCodec::new(context.clone());
    let wire = clipboard.encode(&fragment).map_err(contract)?;
    let fragment = clipboard.decode(&wire).map_err(contract)?;
    if clipboard.encode(&fragment).map_err(contract)? != wire {
        return Err(Error::Contract("canonical clipboard differs"));
    }
    let mut owner = RichLocalSession::try_new(
        context,
        original.clone(),
        Some(selection),
        HistoryCapacity::default(),
    )
    .map_err(contract)?;
    let initial = snapshot(&owner, &codec)?;
    let mut ids = Ids::default();
    let mut steps = Vec::new();
    let draft = fragment.table_paste_draft(owner.context(), &mut ids).map_err(contract)?;
    let action = PasteTableCells::capture(
        owner.state().document(),
        owner.state().selection().ok_or(Error::Contract("grid"))?,
        draft,
    )
    .map_err(contract)?;
    publish(&mut owner, &codec, "grid_paste", RichAction::PasteTableCells(action), &mut steps)?;
    media(&mut owner, &original, &codec, &mut ids, &mut steps)?;
    let cell = CellId::new(
        TableId::try_new("table-one").map_err(contract)?,
        RowId::try_new("r0").map_err(contract)?,
        ColumnId::try_new("c0").map_err(contract)?,
    );
    inline(&mut owner, &original, &codec, &cell, &mut steps)?;
    let changed = snapshot(&owner, &codec)?;
    let session = RichSessionJsonCodec::new(owner.context().clone());
    let checkpoint = session.encode(&owner).map_err(contract)?;
    owner = session.decode(&checkpoint).map_err(contract)?;
    let recovered = snapshot(&owner, &codec)?;
    let count = owner.undo_depth();
    for _ in 0..count {
        owner.undo(&owner.snapshot()).map_err(contract)?;
    }
    let undone = snapshot(&owner, &codec)?;
    for _ in 0..count {
        owner.redo(&owner.snapshot()).map_err(contract)?;
    }
    let redone = snapshot(&owner, &codec)?;
    Ok(json!({"wire":wire,"plain":plain,"initial":initial,"steps":steps,"changed":changed,"recovered":recovered,"undone":undone,"redone":redone,"allocated":ids.0}).to_string())
}
