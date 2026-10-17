//! Frozen bounded revision discovery uses only actual committed relation boundaries.
use super::{Room, SuggestionRevisionsCursor, SuggestionRevisionsPage};
use crate::{Error, Result};
impl Room {
    fn revision_sequence(&self, value: &str) -> Result<u64> {
        let revisions = self.suggestions_state()?.revisions.as_ref().ok_or(Error::NeedsRecovery)?;
        let sequence =
            value.parse::<u64>().map_err(|_| Error::Contract("revision cursor sequence"))?;
        if sequence.to_string() != value
            || sequence != revisions.enabled_at && !revisions.updates.contains_key(&sequence)
        {
            return Err(Error::Contract("revision cursor is not a committed event"));
        }
        Ok(sequence)
    }
    /// Read original relations through a frozen committed cut. Later revisions and child decisions
    /// never leak into that interval; empty discovery grants no publication authority.
    /// # Errors
    /// Denied readers, disabled lanes, foreign/noncanonical/uncommitted/inverted cursors reject.
    pub fn document_suggestion_revisions_page(
        &self,
        principal: &str,
        cursor: Option<&SuggestionRevisionsCursor>,
    ) -> Result<SuggestionRevisionsPage> {
        let descriptor = self.document_suggestion_revisions_descriptor(principal)?;
        let permissions = self.suggestion_permissions(principal)?;
        let revisions = self.suggestions_state()?.revisions.as_ref().ok_or(Error::NeedsRecovery)?;
        let (after, through) = if let Some(cursor) = cursor {
            if cursor.binding != revisions.binding {
                return Err(Error::Contract("revision cursor lane binding"));
            }
            (self.revision_sequence(&cursor.after)?, self.revision_sequence(&cursor.through)?)
        } else {
            (
                revisions.enabled_at,
                revisions.updates.keys().next_back().copied().unwrap_or(revisions.enabled_at),
            )
        };
        if after > through {
            return Err(Error::Contract("revision cursor inverted interval"));
        }
        let mut page = SuggestionRevisionsPage {
            descriptor,
            revisions: vec![],
            cursor: SuggestionRevisionsCursor {
                binding: revisions.binding.clone(),
                after: after.to_string(),
                through: through.to_string(),
            },
            more: false,
            permissions,
        };
        for (sequence, id) in revisions
            .updates
            .range((std::ops::Bound::Excluded(after), std::ops::Bound::Included(through)))
        {
            if page.revisions.len() == 64 {
                page.more = true;
                break;
            }
            page.revisions
                .push(revisions.retained.get(id).ok_or(Error::NeedsRecovery)?.receipt.clone());
            page.cursor.after = sequence.to_string();
        }
        Ok(page)
    }
}
