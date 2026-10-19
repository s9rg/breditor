//! Closed replay-family binding for a NEW segmented format, not old-format autodetection.
use super::super::{
    RichReplica, SharedRichProfile,
    general_history::{ReplayCapabilities, ReplayContract},
};
use crate::Error;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Scope {
    Original,
    GeneralV1,
    DocumentV1,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Family {
    pub scope: Scope,
    pub natural: bool,
    pub reviewed: bool,
    pub search: bool,
}
impl Family {
    pub fn selected(capabilities: ReplayCapabilities, natural: bool) -> Self {
        let scope = match capabilities.scope {
            ReplayContract::Original => Scope::Original,
            ReplayContract::GeneralV1 => Scope::GeneralV1,
            ReplayContract::DocumentV1 => Scope::DocumentV1,
        };
        Self { scope, natural, reviewed: capabilities.reviewed, search: capabilities.search }
    }
    pub fn of(owner: &RichReplica) -> Self {
        Self::selected(owner.replay_capabilities(), owner.typing.is_some())
    }
    pub fn capabilities(self) -> ReplayCapabilities {
        let scope = match self.scope {
            Scope::Original => ReplayContract::Original,
            Scope::GeneralV1 => ReplayContract::GeneralV1,
            Scope::DocumentV1 => ReplayContract::DocumentV1,
        };
        ReplayCapabilities { scope, reviewed: self.reviewed, search: self.search }
    }
    pub fn checkpoint(self, owner: &RichReplica) -> Result<String, Error> {
        if self.search {
            owner.search_checkpoint()
        } else if self.reviewed {
            owner.reviewed_checkpoint()
        } else {
            match (self.scope, self.natural) {
                (Scope::Original, false) => owner.checkpoint(),
                (Scope::Original, true) => owner.typing_checkpoint(),
                (Scope::GeneralV1, false) => owner.general_checkpoint(),
                (Scope::GeneralV1, true) => owner.general_typing_checkpoint(),
                (Scope::DocumentV1, false) => owner.document_checkpoint(),
                (Scope::DocumentV1, true) => owner.document_typing_checkpoint(),
            }
        }
    }
    pub fn restore(
        self,
        profile: &SharedRichProfile,
        room: &str,
        input: &str,
    ) -> Result<RichReplica, Error> {
        let owner = if self.search {
            profile.restore_search(room, input)?
        } else if self.reviewed {
            profile.restore_reviewed(room, input)?
        } else {
            match (self.scope, self.natural) {
                (Scope::Original, false) => profile.restore(room, input)?,
                (Scope::Original, true) => profile.restore_typing(room, input)?,
                (Scope::GeneralV1, false) => profile.restore_general(room, input)?,
                (Scope::GeneralV1, true) => profile.restore_general_typing(room, input)?,
                (Scope::DocumentV1, false) => profile.restore_document(room, input)?,
                (Scope::DocumentV1, true) => profile.restore_document_typing(room, input)?,
            }
        };
        if Self::of(&owner) != self {
            return Err(Error::Contract("segmented root replay family differs"));
        }
        Ok(owner)
    }
}
