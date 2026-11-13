//! Opt-in local ordered history. No replicated marker root, AST replacement or writer reservation.
mod adopt_suggestion_history;
mod checkpoint_reviewed_history;
mod enable_reviewed_history;
mod fork_reviewed_history;
mod perform_history;
mod restore_reviewed_history;
mod types;

use super::{RichReplica, history_keys};
use crate::Error;
use loro::Frontiers;
use std::collections::{BTreeMap, BTreeSet};
pub use types::{OwnedSuggestionAcceptance, ReviewedHistoryIdentity};

pub(super) const FORMAT: &str = "breditor/shared-reviewed-history-session";
#[derive(Clone)]
pub(super) struct Item {
    pub key: String,
    pub steps: u32,
    pub before: Frontiers,
    pub after: Frontiers,
    pub ui_basis: Frontiers,
}
pub(super) struct ReviewedHistory {
    pub identity: ReviewedHistoryIdentity,
    pub undo: Vec<Item>,
    pub redo: Vec<Item>,
    pub adopted: BTreeMap<String, OwnedSuggestionAcceptance>,
    pub cursors: super::history_cursors::HistoryCursors,
}
impl ReviewedHistory {
    fn transfer(
        owner: &RichReplica,
        keys: &[history_keys::Item],
        redo: bool,
    ) -> Result<Vec<Item>, Error> {
        keys.iter()
            .map(|key| {
                let (before, after, _) = owner.cursors.retained_span(redo, &key.key)?;
                Ok(Item {
                    key: key.key.clone(),
                    steps: key.steps,
                    ui_basis: before.clone(),
                    before,
                    after,
                })
            })
            .collect()
    }
    pub fn from_ordinary(
        owner: &RichReplica,
        identity: ReviewedHistoryIdentity,
    ) -> Result<Self, Error> {
        identity.check(owner.writer())?;
        Ok(Self {
            identity,
            undo: Self::transfer(owner, &owner.history_keys.undo, false)?,
            redo: Self::transfer(owner, &owner.history_keys.redo, true)?,
            adopted: BTreeMap::new(),
            cursors: owner.cursors.fork()?,
        })
    }
    pub fn steps(&self) -> usize {
        self.undo.iter().chain(&self.redo).map(|item| item.steps as usize).sum()
    }
    pub fn validate(&self, owner: &RichReplica) -> Result<(), Error> {
        self.identity.check(owner.writer())?;
        self.cursors.check_keys(false, self.undo.iter().map(|item| item.key.as_str()))?;
        self.cursors.check_keys(true, self.redo.iter().map(|item| item.key.as_str()))?;
        if self.undo.len() + self.redo.len() > owner.undo_limit
            || self.adopted.len() > owner.undo_limit
        {
            return Err(Error::Limit("reviewed history items"));
        }
        let mut keys = BTreeSet::new();
        for item in self.undo.iter().chain(&self.redo) {
            if item.steps == 0
                || item.steps > breditor_core::rich_content::RICH_TYPING_GROUP_MAX_STEPS
                || !keys.insert(&item.key)
                || !owner.recipes.contains_key(&item.key)
                || owner.doc.frontiers_to_vv(&item.before).is_none()
                || owner.doc.frontiers_to_vv(&item.after).is_none()
                || owner.doc.frontiers_to_vv(&item.ui_basis).is_none()
            {
                return Err(Error::Contract("reviewed history retained item"));
            }
        }
        Ok(())
    }
}
impl RichReplica {
    /// Whether the explicitly selected local reviewed-history recovery contract is active.
    #[must_use]
    pub const fn reviewed_history_enabled(&self) -> bool {
        self.reviewed_contract
    }
    /// Nonsecret pinned history identity; cached attribution is not a live role or credential.
    #[must_use]
    pub fn reviewed_history_identity(&self) -> Option<&ReviewedHistoryIdentity> {
        self.reviewed_history.as_ref().map(|history| &history.identity)
    }
    /// Original owned adoption, retained even if Undo or a new edit has discarded its stack item.
    #[must_use]
    pub fn adopted_suggestion(&self, id: &str) -> Option<&OwnedSuggestionAcceptance> {
        self.reviewed_history.as_ref()?.adopted.get(id)
    }
    pub(super) fn record_reviewed_local(&mut self, key: &str, join: bool) -> Result<(), Error> {
        if self.reviewed_history.is_none() {
            return Ok(());
        }
        let (before, after, meta) = self.cursors.retained_span(false, key)?;
        let history = self.reviewed_history.as_mut().ok_or(Error::ReplayMismatch)?;
        if join {
            let item = history.undo.last_mut().ok_or(Error::ReplayMismatch)?;
            if item.key != key
                || item.steps >= breditor_core::rich_content::RICH_TYPING_GROUP_MAX_STEPS
            {
                return Err(Error::ReplayMismatch);
            }
            item.after = after;
            item.steps += 1;
            history.cursors.extend(key, item.after.clone())?;
        } else {
            history.cursors.authored(key.into(), before.clone(), after.clone(), meta)?;
            history.undo.push(Item {
                key: key.into(),
                steps: 1,
                ui_basis: before.clone(),
                before,
                after,
            });
        }
        history.redo.clear();
        Ok(())
    }
    pub(super) fn reviewed_external(
        &mut self,
        diff: &loro_internal::undo::DiffBatch,
    ) -> Result<(), Error> {
        if let Some(history) = &mut self.reviewed_history {
            history.cursors.imported(diff)?;
        }
        Ok(())
    }
}
