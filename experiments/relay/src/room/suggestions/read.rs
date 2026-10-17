//! Current state reads and frozen immutable event paging; neither IDs nor cursors grant access.
use super::{
    DocumentSuggestionEntry, DocumentSuggestionsCursor, DocumentSuggestionsPage, MAX_PAGE_UPDATES,
    Room, check_id,
};
use crate::{Error, Result};
impl Room {
    fn suggestion_sequence(&self, value: &str) -> Result<u64> {
        let state = self.suggestions_state()?;
        let sequence =
            value.parse::<u64>().map_err(|_| Error::Contract("suggestion cursor sequence"))?;
        if sequence.to_string() != value
            || sequence != state.enabled_at && !state.updates.contains_key(&sequence)
        {
            return Err(Error::Contract("suggestion cursor is not an accepted event"));
        }
        Ok(sequence)
    }
    /// Read immutable publication/decision events through a frozen terminal cut. A decision after
    /// this cut never leaks into an earlier publication entry; refresh to receive later events.
    /// # Errors
    /// Denied readers, disabled lanes, wrong bindings or noncanonical/unaccepted/inverted cuts reject.
    pub fn document_suggestions_page(
        &self,
        principal: &str,
        cursor: Option<&DocumentSuggestionsCursor>,
    ) -> Result<DocumentSuggestionsPage> {
        let descriptor = self.document_suggestions_descriptor(principal)?;
        let permissions = self.suggestion_permissions(principal)?;
        let state = self.suggestions_state()?;
        let (after, through) = if let Some(cursor) = cursor {
            if cursor.binding != state.binding {
                return Err(Error::Contract("suggestion cursor lane binding"));
            }
            (self.suggestion_sequence(&cursor.after)?, self.suggestion_sequence(&cursor.through)?)
        } else {
            (
                state.enabled_at,
                state.updates.keys().next_back().copied().unwrap_or(state.enabled_at),
            )
        };
        if after > through {
            return Err(Error::Contract("suggestion cursor inverted interval"));
        }
        let mut page = DocumentSuggestionsPage {
            descriptor,
            permissions,
            updates: vec![],
            cursor: DocumentSuggestionsCursor {
                binding: state.binding.clone(),
                after: after.to_string(),
                through: through.to_string(),
            },
            more: false,
        };
        for (sequence, update) in state
            .updates
            .range((std::ops::Bound::Excluded(after), std::ops::Bound::Included(through)))
        {
            if page.updates.len() == MAX_PAGE_UPDATES {
                page.more = true;
                break;
            }
            page.updates.push(update.clone());
            page.cursor.after = sequence.to_string();
        }
        Ok(page)
    }
    /// Read current pending/final state without inventing an implicit review decision.
    /// # Errors
    /// Denied readers, disabled lanes, malformed IDs and uncertain storage reject.
    pub fn document_suggestion(
        &self,
        principal: &str,
        id: &str,
    ) -> Result<Option<DocumentSuggestionEntry>> {
        self.reader(principal)?;
        let state = self.suggestions_state()?;
        check_id(id)?;
        Ok(state.proposals.get(id).map(|proposal| DocumentSuggestionEntry {
            publication: proposal.publication.clone(),
            decision: proposal.decision.clone(),
        }))
    }
    /// Fetch the first exact accepted immutable intent. A known content address is not a read grant.
    /// # Errors
    /// Current read revocation, disabled lane, malformed IDs or storage recovery reject.
    pub fn document_suggestion_packet(&self, principal: &str, id: &str) -> Result<Option<String>> {
        self.reader(principal)?;
        let state = self.suggestions_state()?;
        check_id(id)?;
        Ok(state.proposals.get(id).map(|proposal| proposal.packet.clone()))
    }
}
