//! A separate compound-format command; the original single-format JSON is unchanged.
//!
//! Nonempty unique changes apply simultaneously to each nonempty scalar range.
//! Each block occurs once and consumes one action, not one per changed kind.
//! Target count is bounded by the active operation ceiling before capture;
//! unique declared kinds bound changes by the compiled schema. All targets are
//! captured before one owner dispatch.
//! A late failure cannot publish an intermediate document, revision or history.

use super::{
    set_inline_format::{Change, Target, admit_change},
    support::{checked, decode},
};
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    position::TextOffset,
    rich_content::{
        BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelectionUpdate,
        actions::{RichAction, RichFormatChange, SetInlineFormat},
    },
};
use serde::Deserialize;
use std::collections::BTreeSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    changes: Vec<Change>,
    targets: Vec<Target>,
}

pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let maximum =
        usize::try_from(owner.context().max_operations_per_transaction()).unwrap_or(usize::MAX);
    if !bounded_targets(record.changes.len(), record.targets.len(), maximum) {
        return Err(super::invalid());
    }
    let mut seen = BTreeSet::new();
    let changes = record
        .changes
        .into_iter()
        .map(|change| {
            let change = admit_change(owner, change)?;
            let kind = match &change {
                RichFormatChange::Set(format) => format.kind(),
                RichFormatChange::Remove(kind) => kind,
                RichFormatChange::Patch(patch) => patch.kind(),
            };
            let schema = owner.context().schema();
            if !seen.insert(kind.clone())
                || !(schema.is_property_free_inline_format(kind)
                    || schema.inline_format_property_contract(kind).is_some())
            {
                return Err(super::invalid());
            }
            Ok(change)
        })
        .collect::<Result<Vec<_>, BreditorError>>()?;
    let mut blocks = BTreeSet::new();
    let actions = record
        .targets
        .into_iter()
        .map(|target| {
            let block = checked(BlockId::try_new(target.block))?;
            if !blocks.insert(block.clone()) {
                return Err(super::invalid());
            }
            Ok(RichAction::SetInlineFormat(checked(SetInlineFormat::capture_changes(
                owner.state().document(),
                &block,
                checked(TextOffset::try_new(target.start))?,
                checked(TextOffset::try_new(target.end))?,
                &changes,
            ))?))
        })
        .collect::<Result<Vec<_>, BreditorError>>()?;
    owner
        .dispatch(observation, &actions, RichSelectionUpdate::Map)
        .map_err(|value| error::session(&value))
}

fn bounded_targets(changes: usize, targets: usize, maximum: usize) -> bool {
    changes != 0 && targets != 0 && targets <= maximum
}

#[cfg(test)]
mod tests {
    use super::bounded_targets;

    #[test]
    fn one_target_is_one_action_even_when_several_kinds_change() {
        assert!(bounded_targets(1, 1, 1));
        assert!(bounded_targets(2, 1, 1));
        assert!(bounded_targets(12, 1024, 1024));
        assert!(!bounded_targets(12, 1025, 1024));
        assert!(!bounded_targets(2, 2, 1));
        assert!(!bounded_targets(0, 1, 1024));
        assert!(!bounded_targets(1, 0, 1024));
        assert!(!bounded_targets(1, 1, 0));
    }
}
