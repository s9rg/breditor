//! Exact list-item split/join with an optional witnessed leading-text boundary relation.

use super::{RichAction, RichActionError, RichEdit, branch_patch::BranchPatch};
use crate::{
    rich_content::{RichDocument, rich_text_mapping::RichBoundaryMap},
    state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ListBoundaryPatch {
    pub(super) branch: BranchPatch,
    pub(super) map: Option<RichBoundaryMap>,
}

impl ListBoundaryPatch {
    fn inverse(&self) -> Self {
        let map = self.map.as_ref().map(|map| {
            let mut map = map.clone();
            map.splitting = !map.splitting;
            map
        });
        Self { branch: self.branch.inverse(), map }
    }
    pub(super) fn edit(
        &self,
        context: &EditorContext,
        document: &RichDocument,
        inverse: fn(Self) -> RichAction,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.branch.edit(context, document, inverse(self.inverse()))
    }
}
