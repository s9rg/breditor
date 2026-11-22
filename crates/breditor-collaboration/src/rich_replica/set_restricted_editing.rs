//! Local host restricted-editing policy; never an engine operation, wire permission or history entry.
//!
//! The same native `RichRestrictedPolicy` as local editors is evaluated on every
//! local adoption: a candidate whose materialized document changes protected
//! content is refused whole before publication. Incoming peer updates and
//! retained-branch unions are admitted through `adopt_incoming`, unchanged:
//! the policy is a host input of this owner, not room authority. A relay or
//! server must evaluate the same pure `admits(before, after)` per accepted
//! group to enforce it against other writers.

use std::sync::Arc;

use breditor_core::rich_content::{RichRestrictedPolicy, RichSelectionKind};

use super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Current live restricted-editing policy, if any.
    #[must_use]
    pub fn restricted_policy(&self) -> Option<&RichRestrictedPolicy> {
        self.restricted.as_deref()
    }

    /// Install, replace or clear (`None`) the host policy without content, UI or history changes.
    ///
    /// A genuine change advances the publication and records it like a read-only
    /// transition. Checkpoints never retain the policy; hosts must reapply it.
    /// # Errors
    /// Rejects stale/foreign observations or staging/admission failure atomically.
    pub fn set_restricted_editing_guarded(
        &mut self,
        observation: &SharedObservation,
        policy: Option<RichRestrictedPolicy>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if self.restricted.as_deref() == policy.as_ref() {
            return Ok(false);
        }
        let mut candidate = self.staged()?;
        candidate.restricted = policy.map(Arc::new);
        self.adopt(candidate)?;
        self.read_only_revision = Some(self.journal.publication.clone());
        Ok(true)
    }

    /// Whether the current selection lies wholly inside one editable region (true without policy).
    /// # Errors
    /// Rejects malformed causal selection state.
    pub fn restricted_selection_editable(&self) -> Result<bool, Error> {
        let Some(policy) = &self.restricted else { return Ok(true) };
        let selection = if self.journal.ui.document_selected() {
            Some(RichSelectionKind::Document)
        } else {
            self.selection_for_mapping()?
                .map(|selection| selection.admit(&self.document))
                .transpose()?
                .map(|selection| selection.kind().clone())
        };
        Ok(policy.selection_is_editable(&self.document, selection.as_ref()))
    }

    /// Refuse a local candidate that changes protected content or sets protected pending styles.
    pub(super) fn require_restricted(&self, candidate: &mut Self) -> Result<(), Error> {
        let Some(policy) = &self.restricted else { return Ok(()) };
        candidate.refresh_document()?;
        if !policy.admits(&self.document, &candidate.document) {
            return Err(Error::Restricted);
        }
        if candidate.journal.ui.pending.is_some()
            && candidate.journal.ui.pending != self.journal.ui.pending
            && !candidate.restricted_selection_editable()?
        {
            return Err(Error::Restricted);
        }
        Ok(())
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicyRecord {
    format: String,
    #[serde(rename = "formatVersion")]
    format_version: u8,
    editable: Vec<String>,
}

impl RichReplica {
    /// JSON form of [`Self::set_restricted_editing_guarded`]: `null` or
    /// `{"format":"breditor/rich-restricted-policy","formatVersion":1,"editable":[...]}`.
    /// # Errors
    /// Rejects malformed/oversized policies before staging, then as the typed form.
    pub fn set_restricted_editing_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        if input.len() > 1024 * 1024 {
            return Err(Error::Limit("restricted editing policy bytes"));
        }
        let record: Option<PolicyRecord> = serde_json::from_str(input)
            .map_err(|_| Error::Contract("restricted editing policy"))?;
        let policy = record
            .map(|record| {
                if record.format != "breditor/rich-restricted-policy" || record.format_version != 1
                {
                    return Err(Error::Contract("restricted editing policy"));
                }
                let ids = record
                    .editable
                    .into_iter()
                    .map(breditor_core::rich_content::BlockId::try_new)
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| Error::Contract("restricted editing policy"))?;
                RichRestrictedPolicy::try_new(ids)
                    .map_err(|_| Error::Limit("restricted editing regions"))
            })
            .transpose()?;
        self.set_restricted_editing_guarded(observation, policy)
    }
}
