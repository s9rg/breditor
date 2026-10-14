//! Captured runtime actions or replay-proved durable local branch recipes.

use super::{RichLocalSessionError, local_rewrite::LocalRewrite};
use crate::{
    rich_content::{
        RichDocument,
        actions::{RichAction, apply_batch},
    },
    state::EditorContext,
};

#[derive(Debug)]
pub(super) enum HistoryRecipe {
    Actions(Vec<RichAction>),
    Recovered(LocalRewrite),
}

impl HistoryRecipe {
    pub(super) fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<RichDocument, RichLocalSessionError> {
        match self {
            Self::Actions(actions) => Ok(apply_batch(context, document, actions)?
                .ok_or(RichLocalSessionError::HistoryMismatch)?
                .into_parts()
                .0),
            Self::Recovered(recipe) => recipe.apply(context, document),
        }
    }
}
