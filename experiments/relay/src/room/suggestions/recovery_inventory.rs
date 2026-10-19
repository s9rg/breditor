//! Inventory only; original proposal/decision/revision state and permissions remain unchanged.
use super::Room;
use std::collections::BTreeSet;
impl Room {
    pub(in crate::room) fn suggestion_recovery_principals(&self) -> BTreeSet<String> {
        self.suggestions.as_ref().map_or_else(BTreeSet::new, |s| s.roles.keys().cloned().collect())
    }
    pub(in crate::room) fn suggestion_revisions_enabled(&self) -> bool {
        self.suggestions.as_ref().is_some_and(|s| s.revisions.is_some())
    }
}
