//! One exact local history unit with retained before/after logical selections.

use super::RichLocalState;
use super::history_recipe::HistoryRecipe;

#[derive(Debug)]
pub(super) struct RichHistoryEntry {
    pub(super) before: RichLocalState,
    pub(super) after: RichLocalState,
    pub(super) forward: HistoryRecipe,
    pub(super) inverse: HistoryRecipe,
}
