//! Native-generated rich checkpoints restored in Wasm at every mixed list/media cursor.

use crate::{
    Error,
    table_axis_fixture::{admitted, selection_json},
};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    rich_content::{RichLocalSession, RichLocalSessionError, RichSelection},
};
use serde_json::{Value, json};

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich durable recovery fixture")
}
fn capture(owner: &RichLocalSession, codec: &DocumentJsonCodecV2) -> Result<Value, Error> {
    Ok(json!({"document":codec.encode(owner.state().document().document()).map_err(contract)?,
        "selection":owner.state().selection().map(|value|selection_json(owner.state().document(),value)).transpose()?,
        "pending":owner.state().pending_formats().map(|formats|formats.iter().map(|format|format.kind().as_str()).collect::<Vec<_>>()),
        "revision":owner.state().revision().get().to_string(),"undo_depth":owner.undo_depth(),"redo_depth":owner.redo_depth()}))
}
fn equal(left: &RichLocalSession, right: &RichLocalSession) -> Result<(), Error> {
    if left.state().document().document() != right.state().document().document()
        || left.state().selection().map(RichSelection::kind)
            != right.state().selection().map(RichSelection::kind)
        || left.state().pending_formats() != right.state().pending_formats()
        || left.state().revision() != right.state().revision()
        || (left.undo_depth(), left.redo_depth()) != (right.undo_depth(), right.redo_depth())
    {
        return Err(Error::Contract("rich recovered future history differs"));
    }
    Ok(())
}

/// Restore the real local rich codec at every retained cursor, comparing every future undo/redo.
///
/// # Errors
/// Rejects over-budget input, invalid checkpoints or any native/recovered state divergence.
pub fn exercise(input: &str) -> Result<String, Error> {
    if input.len() > 16 * 1024 * 1024 {
        return Err(Error::Limit("rich local checkpoint bytes"));
    }
    let value: Value = serde_json::from_str(input).map_err(contract)?;
    let base =
        value.get("baseDocument").ok_or(Error::Contract("rich checkpoint base"))?.to_string();
    let (context, doc_codec, _) = admitted(&base)?;
    let codec = RichSessionJsonCodec::new(context);
    let source = codec.decode(input).map_err(contract)?;
    let total = source.undo_depth() + source.redo_depth();
    let mut cases = Vec::new();
    for cursor in 0..=total {
        let mut source = codec.decode(input).map_err(contract)?;
        while source.undo_depth() > cursor {
            source.undo(&source.snapshot()).map_err(contract)?;
        }
        while source.undo_depth() < cursor {
            source.redo(&source.snapshot()).map_err(contract)?;
        }
        let checkpoint = codec.encode(&source).map_err(contract)?;
        let mut recovered = codec.decode(&checkpoint).map_err(contract)?;
        equal(&source, &recovered)?;
        if codec.encode(&recovered).map_err(contract)? != checkpoint {
            return Err(Error::Contract("rich canonical checkpoint differs"));
        }
        let foreign_rejected =
            matches!(recovered.undo(&source.snapshot()), Err(RichLocalSessionError::StaleSnapshot));
        let initial = capture(&recovered, &doc_codec)?;
        let mut undo_steps = 0;
        while source.can_undo() {
            source.undo(&source.snapshot()).map_err(contract)?;
            recovered.undo(&recovered.snapshot()).map_err(contract)?;
            equal(&source, &recovered)?;
            undo_steps += 1;
        }
        let undone = capture(&recovered, &doc_codec)?;
        let mut redo_steps = 0;
        while source.can_redo() {
            source.redo(&source.snapshot()).map_err(contract)?;
            recovered.redo(&recovered.snapshot()).map_err(contract)?;
            equal(&source, &recovered)?;
            redo_steps += 1;
        }
        cases.push(json!({"cursor":cursor,"initial":initial,"undone":undone,
            "redone":capture(&recovered,&doc_codec)?,"undo_steps":undo_steps,"redo_steps":redo_steps,
            "foreign_rejected":foreign_rejected,"canonical":true}));
    }
    Ok(json!({"cases":cases,"groups":total}).to_string())
}
