//! Bind an attachment to the accepted native creation event and its immutable acceptance cut.
use super::Room;
use crate::{Error, Result, room::recovered_discussion::DiscussionLink};

impl Room {
    pub(in crate::room) fn check_recovered_discussion_birth(
        &self,
        expected: &DiscussionLink,
    ) -> Result<u64> {
        let state = self.review_state()?;
        let event = expected.id.event();
        let sequence = state
            .accepted
            .get(&(event.actor().clone(), event.counter()))
            .copied()
            .ok_or(Error::Contract("recovered discussion birth is not accepted"))?;
        let observed = state.session.observe();
        let page = state.session.read_thread_history(&observed, &expected.id, 0)?;
        let birth = page.events.first().ok_or(Error::NeedsRecovery)?;
        if birth.id != event
            || birth.principal != &expected.principal
            || birth.digest != expected.digest
        {
            return Err(Error::Contract("recovered discussion live link differs"));
        }
        Ok(sequence)
    }
}
