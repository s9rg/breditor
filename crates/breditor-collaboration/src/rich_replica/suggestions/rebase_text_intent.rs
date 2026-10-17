//! Recover one complete native text intent, including source-inherited formats of plain insertions.
use super::DocumentSuggestionEdit;
use crate::{
    Error,
    anchor::Affinity,
    rich_replica::{
        Command,
        actions::{MaskedTextSpanV1, RangeTextRun, ReplaceTextRange},
        selection::TextPoint,
        text_flow,
    },
};

pub(super) fn supported(edit: &DocumentSuggestionEdit) -> bool {
    matches!(edit, DocumentSuggestionEdit::GeneralText(_))
        || matches!(edit, DocumentSuggestionEdit::Commands(commands) if matches!(commands.as_slice(), [Command::InsertText(_) | Command::DeleteText(_) | Command::ReplaceTextRange(_) | Command::ReplaceMaskedGeneralTextRangeV1(_)]))
}
/// Only a sole historical masked compound has sparse removal intent; never guess batch holes.
pub(super) fn mask(edit: &DocumentSuggestionEdit) -> Option<&[MaskedTextSpanV1]> {
    match edit {
        DocumentSuggestionEdit::Commands(commands) => match commands.as_slice() {
            [Command::ReplaceMaskedGeneralTextRangeV1(value)] => Some(&value.spans),
            _ => None,
        },
        DocumentSuggestionEdit::GeneralText(_) => None,
    }
}
fn point(block: &str, offset: u32, affinity: Affinity) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity }
}
pub(super) fn request(
    edit: &DocumentSuggestionEdit,
    evaluated: &loro::LoroDoc,
) -> Result<ReplaceTextRange, Error> {
    match edit {
        DocumentSuggestionEdit::GeneralText(value) => Ok(value.range.clone()),
        DocumentSuggestionEdit::Commands(commands) => match commands.as_slice() {
            [Command::ReplaceTextRange(value)] => Ok(value.clone()),
            [Command::ReplaceMaskedGeneralTextRangeV1(value)] => Ok(value.range.clone()),
            [Command::DeleteText(value)] => Ok(ReplaceTextRange {
                anchor: point(&value.block, value.offset, Affinity::After),
                focus: point(
                    &value.block,
                    value.offset.checked_add(value.length).ok_or(Error::Offset)?,
                    Affinity::Before,
                ),
                runs: vec![],
            }),
            [Command::InsertText(value)] => {
                let length =
                    u32::try_from(value.text.encode_utf16().count()).map_err(|_| Error::Offset)?;
                let runs = text_flow::intervals(evaluated, &value.block, value.offset, length)?
                    .into_iter()
                    .map(|chunk| RangeTextRun { text: chunk.text, formats: chunk.formats })
                    .collect::<Vec<_>>();
                if runs.iter().map(|run| run.text.as_str()).collect::<String>() != value.text {
                    return Err(Error::Contract("text rebase insertion source effect"));
                }
                Ok(ReplaceTextRange {
                    anchor: point(&value.block, value.offset, Affinity::After),
                    focus: point(&value.block, value.offset, Affinity::After),
                    runs,
                })
            }
            _ => Err(Error::Contract("text rebase intent family")),
        },
    }
}
