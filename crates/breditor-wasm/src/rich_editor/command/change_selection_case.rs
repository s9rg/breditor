//! Strict case-change intent over the native selection (one history group).
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    RichCaseRequest, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let request = RichCaseRequest::from_json(input)
        .map_err(|_| error::rejected("breditor_rich.case_change_intent"))?;
    owner.change_selection_case(observation, &request).map_err(|e| error::session(&e))
}
