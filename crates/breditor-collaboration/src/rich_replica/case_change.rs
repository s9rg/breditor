//! Shared native letter-case change: the frozen core plan lowered to guarded range splices.
//!
//! The command plans with the same native `plan_rich_case_change` as the local owner, then
//! lowers each checked splice (one per changed interval of one format run) to one existing
//! `ReplaceTextRange` command carrying the run's exact formats. All splices are one dispatch,
//! so they are one writer-local history group (one Undo step), and the staged result must
//! equal the complete core candidate before adoption. No new replicated command or merge
//! rule is introduced: concurrent peers converge through the existing range semantics.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::{RangeTextRun, ReplaceTextRange},
    selection::{CellTarget, Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::{
    codec::RichFormatsJsonCodec,
    rich_content::{
        RichCaseRequest, RichSelection, RichSelectionKind, RichTextPoint, plan_rich_case_change,
    },
    state::EditorContext,
};
use serde_json::Value;

impl RichReplica {
    /// Change the letter case of the current selection exactly like local `changeSelectionCase`
    /// (`{"change":"upper"|"lower"|"title"|"cycle","locale"?,"titleMinorWords"?}`).
    ///
    /// Returns `false` when no scalar would change. Formats, mentions and block identities are
    /// preserved; a caret changes its whole block and keeps its offset.
    /// # Errors
    /// Stale/read-only owners, a malformed request, a missing or document selection, native
    /// budgets and a lowering that differs from the core candidate publish nothing.
    pub fn change_selection_case_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let request =
            RichCaseRequest::from_json(input).map_err(|_| Error::Contract("case change intent"))?;
        self.change_selection_case_guarded(observation, &request)
    }
    /// Typed form of [`Self::change_selection_case_json_guarded`].
    /// # Errors
    /// As [`Self::change_selection_case_json_guarded`].
    pub fn change_selection_case_guarded(
        &mut self,
        observation: &SharedObservation,
        request: &RichCaseRequest,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if self.journal.ui.document_selected() {
            return Err(Error::Contract("use explicit document selection family"));
        }
        let selection = self
            .selection_for_mapping()?
            .ok_or(Error::Contract("case change requires a selection"))?
            .admit(&self.document)?;
        let context = super::paragraphs::context(&self.codec);
        let Some(plan) = plan_rich_case_change(&context, &self.document, &selection, request)
            .map_err(|_| Error::Contract("shared case change plan"))?
        else {
            return Ok(false);
        };
        let formats = RichFormatsJsonCodec::new(EditorContext::new(
            self.codec.schema().clone(),
            self.codec.limits().clone(),
        ));
        let mut commands = Vec::with_capacity(plan.replacements().edits().len());
        // Descending original order keeps every earlier coordinate valid while staging.
        for edit in plan.replacements().edits().iter().rev() {
            let block = edit.block().as_str().to_owned();
            let point = |offset: u64| -> Result<TextPoint, Error> {
                Ok(TextPoint {
                    block: block.clone(),
                    offset: u32::try_from(offset).map_err(|_| Error::Offset)?,
                    affinity: Affinity::After,
                })
            };
            let runs = edit
                .inserted()
                .iter()
                .map(|run| {
                    let encoded = formats
                        .encode(run.formats())
                        .map_err(|_| Error::Contract("shared case change formats"))?;
                    Ok(RangeTextRun {
                        text: run.text().to_owned(),
                        formats: serde_json::from_str::<Vec<Value>>(&encoded)?,
                    })
                })
                .collect::<Result<Vec<_>, Error>>()?;
            commands.push(Command::ReplaceTextRange(ReplaceTextRange {
                anchor: point(edit.start().get())?,
                focus: point(edit.end().get())?,
                runs,
            }));
        }
        let after = shared_selection(plan.selection())?;
        self.apply_with_state_inner(
            commands,
            SelectionUpdate::Set(Some(after)),
            PendingFormatsUpdate::Map,
            None,
            Some(plan.document()),
        )
    }
}

fn shared_point(value: &RichTextPoint) -> Result<TextPoint, Error> {
    Ok(TextPoint {
        block: value.block().as_str().into(),
        offset: u32::try_from(value.offset().get()).map_err(|_| Error::Offset)?,
        affinity: match value.affinity() {
            breditor_core::position::Affinity::Before => Affinity::Before,
            breditor_core::position::Affinity::After => Affinity::After,
        },
    })
}

fn shared_selection(selection: &RichSelection) -> Result<Selection, Error> {
    Ok(match selection.kind() {
        RichSelectionKind::TextRange { anchor, focus } => {
            Selection::TextRange { anchor: shared_point(anchor)?, focus: shared_point(focus)? }
        }
        RichSelectionKind::Node(block) => Selection::Node { block: block.as_str().into() },
        RichSelectionKind::Grid { anchor, focus } => Selection::Grid {
            anchor: CellTarget::from_core(anchor),
            focus: CellTarget::from_core(focus),
        },
        RichSelectionKind::Document => {
            return Err(Error::Contract("use explicit document selection family"));
        }
    })
}
