//! One exact local history unit with retained before/after logical selections.

use super::RichLocalState;
use crate::rich_content::actions::RichAction;

#[derive(Debug)]
pub(super) struct RichHistoryEntry {
    pub(super) before: RichLocalState,
    pub(super) after: RichLocalState,
    pub(super) forward: Vec<RichAction>,
    pub(super) inverse: Vec<RichAction>,
}
