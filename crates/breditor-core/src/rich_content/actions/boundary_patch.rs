//! Split/join branch and witnessed text relation, published as one exact edit.

use super::{RichAction, RichActionError, RichEdit, branch_patch::BranchPatch};
use crate::{
    rich_content::{RichDocument, rich_text_mapping::RichBoundaryMap},
    state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct BoundaryPatch {
    pub(super) branch: BranchPatch,
    pub(super) map: RichBoundaryMap,
}

impl BoundaryPatch {
    pub(super) fn inverse(&self) -> Self {
        let mut map = self.map.clone();
        map.splitting = !map.splitting;
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
