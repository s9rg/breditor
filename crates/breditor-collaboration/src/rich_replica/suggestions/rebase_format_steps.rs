//! Preserve original formatting step order, with whole-batch refusal and allocation budgets.
use super::{
    DocumentSuggestionFormatRebase as Rebase, DocumentSuggestionFormatRebaseConflict as Conflict,
};
use crate::{
    Error,
    anchor::Affinity,
    rich_replica::{
        AffineTextRangeResolution, Command, RichReplica,
        actions::SetFormat,
        affine_text_range::resolve_source_selection,
        selection::{Selection, TextPoint},
    },
};
use serde_json::Value;

pub(super) enum FormatRebaseSteps {
    Planned(Vec<Command>),
    NotReady(Rebase),
}
fn touched<'a>(formats: &'a [Value], kind: &str) -> Option<&'a Value> {
    formats.iter().find(|value| value["type"].as_str() == Some(kind))
}
pub(super) fn plan(
    owner: &RichReplica,
    source_anchor: &str,
    source_canonical: &str,
    actions: &[&SetFormat],
) -> Result<FormatRebaseSteps, Error> {
    let mut commands = vec![];
    let mut literal_bytes = 0usize;
    let mut characters = 0usize;
    for action in actions {
        let selection = Selection::TextRange {
            anchor: TextPoint {
                block: action.block.clone(),
                offset: action.offset,
                affinity: Affinity::After,
            },
            focus: TextPoint {
                block: action.block.clone(),
                offset: action.offset.checked_add(action.length).ok_or(Error::Offset)?,
                affinity: Affinity::Before,
            },
        };
        let segments =
            match resolve_source_selection(owner, source_anchor, source_canonical, selection)? {
                AffineTextRangeResolution::Pending { missing } => {
                    return Ok(FormatRebaseSteps::NotReady(Rebase::Pending { missing }));
                }
                AffineTextRangeResolution::Conflict { reason } => {
                    return Ok(FormatRebaseSteps::NotReady(Rebase::Conflict {
                        reason: Conflict::Range { reason },
                    }));
                }
                AffineTextRangeResolution::Resolved { segments, .. } => segments,
            };
        let kind = action.format["type"].as_str().ok_or(Error::Contract("format rebase kind"))?;
        if segments.iter().any(|segment| {
            touched(&segment.source_formats, kind) != touched(&segment.current_formats, kind)
        }) {
            return Ok(FormatRebaseSteps::NotReady(Rebase::Conflict {
                reason: Conflict::FormatChanged,
            }));
        }
        if segments.is_empty() || segments.len() > 64 - commands.len() {
            return Err(Error::Limit("format rebase action steps"));
        }
        for segment in &segments {
            characters = characters
                .checked_add(segment.text.chars().count())
                .filter(|count| *count <= 65_536)
                .ok_or(Error::Limit("format rebase selected scalars"))?;
        }
        // Budget the whole batch, including repeated literals in separate original actions,
        // before any new literal clones. The complete V1 child/envelope are checked afterward.
        literal_bytes = serde_json::to_vec(&action.format)?
            .len()
            .checked_mul(segments.len())
            .and_then(|bytes| literal_bytes.checked_add(bytes))
            .filter(|bytes| *bytes <= super::packet::MAX_BYTES)
            .ok_or(Error::Limit("format rebase repeated literal bytes"))?;
        commands.extend(segments.into_iter().map(|segment| {
            Command::SetFormat(SetFormat {
                block: segment.current.block,
                offset: segment.current.offset,
                length: segment.length,
                format: action.format.clone(),
                enabled: action.enabled,
            })
        }));
    }
    Ok(FormatRebaseSteps::Planned(commands))
}
