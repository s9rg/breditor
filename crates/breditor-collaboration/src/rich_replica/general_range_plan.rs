//! Native general-range consequences lowered only to original causal command records.
use super::{
    Command,
    actions::{DeleteBlock, PasteBlocks, RangeTextRun, ReplaceTextRange},
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    document::TextFragment,
    rich_content::{BlockId, RichDocument, actions::RichGeneralRangePlan},
};
use serde_json::Value;

pub(super) fn request(
    codec: &DocumentJsonCodecV2,
    selection: &Selection,
    inserted: &TextFragment,
) -> Result<ReplaceTextRange, Error> {
    let Selection::TextRange { anchor, focus } = selection else {
        return Err(Error::Contract("general replacement requires text selection"));
    };
    let formats = RichFormatsJsonCodec::new(super::paragraphs::context(codec));
    let mut bytes = 0_usize;
    let mut runs = vec![];
    for run in inserted {
        bytes = bytes.checked_add(run.text().len()).ok_or(Error::Limit("general range bytes"))?;
        if runs.len() >= 1000 || bytes > 64 * 1024 {
            return Err(Error::Limit("general range insertion"));
        }
        runs.push(RangeTextRun {
            text: run.text().into(),
            formats: serde_json::from_str(
                &formats
                    .encode(run.formats())
                    .map_err(|_| Error::Contract("general range formats"))?,
            )?,
        });
    }
    Ok(ReplaceTextRange { anchor: anchor.clone(), focus: focus.clone(), runs })
}

pub(super) fn commands(
    codec: &DocumentJsonCodecV2,
    plan: &RichGeneralRangePlan,
    request: ReplaceTextRange,
    empty: &[BlockId],
    expected: &RichDocument,
) -> Result<Vec<Command>, Error> {
    let Some(coverage) = plan.covered() else {
        return Ok(vec![Command::ReplaceTextRange(request)]);
    };
    if plan.empty_blocks().len() != empty.len() {
        return Err(Error::Contract("general range exact floor IDs"));
    }
    if coverage.operation_count() > 64 {
        return Err(Error::Limit("general range shared commands"));
    }
    let final_tree: Value = serde_json::from_str(
        &codec.encode(expected.document()).map_err(|_| Error::Contract("general range result"))?,
    )?;
    let mut commands = vec![];
    for (floor, id) in plan.empty_blocks().iter().zip(empty) {
        let node = super::creation::find(&final_tree["root"], id.as_str())
            .ok_or(Error::Contract("general range native floor"))?
            .clone();
        // Original paste preparation retains conditional normalization heads. Do
        // not replace it with a raw birth that leaves an old head outside Undo.
        commands.push(Command::PasteBlocks(PasteBlocks {
            parent: floor.parent().map(|id| id.as_str().into()),
            before: floor.before().map(|id| id.as_str().into()),
            nodes: vec![node],
        }));
    }
    for span in coverage.text_ranges() {
        let point = |offset: u64| -> Result<TextPoint, Error> {
            Ok(TextPoint {
                block: span.block().as_str().into(),
                offset: u32::try_from(offset).map_err(|_| Error::Offset)?,
                affinity: Affinity::After,
            })
        };
        commands.push(Command::ReplaceTextRange(ReplaceTextRange {
            anchor: point(span.start().get())?,
            focus: point(span.end().get())?,
            runs: if span.block() == coverage.insertion_start().block() {
                request.runs.clone()
            } else {
                vec![]
            },
        }));
    }
    commands.extend(
        coverage
            .deleted_blocks()
            .iter()
            .map(|id| Command::DeleteBlock(DeleteBlock { block: id.as_str().into() })),
    );
    Ok(commands)
}
