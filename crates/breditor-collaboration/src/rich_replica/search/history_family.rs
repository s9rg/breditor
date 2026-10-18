//! Separate search journal names for each existing scope and typing policy.
use super::super::{
    RichReplica,
    general_history::{ReplayCapabilities, ReplayContract},
};

pub(in crate::rich_replica) fn journal(scope: ReplayContract, typing: bool) -> (&'static str, u32) {
    let name = match (scope, typing) {
        (ReplayContract::Original, false) => "breditor/rich-replica-search-journal",
        (ReplayContract::Original, true) => "breditor/rich-replica-search-typing-journal",
        (ReplayContract::GeneralV1, false) => "breditor/rich-replica-general-search-journal",
        (ReplayContract::GeneralV1, true) => "breditor/rich-replica-general-search-typing-journal",
        (ReplayContract::DocumentV1, false) => "breditor/rich-replica-document-search-journal",
        (ReplayContract::DocumentV1, true) => {
            "breditor/rich-replica-document-search-typing-journal"
        }
    };
    (name, 1)
}
impl RichReplica {
    pub(in crate::rich_replica) fn replay_capabilities(&self) -> ReplayCapabilities {
        ReplayCapabilities {
            scope: self.replay_contract,
            reviewed: self.reviewed_contract,
            search: self.search_contract,
        }
    }
    pub(in crate::rich_replica) fn history_family(&self, typing: bool) -> (&'static str, u32) {
        self.replay_capabilities().journal(self.protocol, typing)
    }
}
