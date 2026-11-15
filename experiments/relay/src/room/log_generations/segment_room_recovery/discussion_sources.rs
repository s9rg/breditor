//! Whole-file custody for every original participant archive referenced by a published discussion.
use super::{RelaySegmentClientJournalPin, RelaySegmentJournalOwner, RelaySegmentRoomBackupFiles};
use crate::{Error, Result};
use std::collections::BTreeSet;

pub(super) fn is_participant(pin: &RelaySegmentClientJournalPin) -> bool {
    matches!(&pin.owner, RelaySegmentJournalOwner::IndependentParticipant { .. })
}

pub(super) fn check_sources<'a>(
    required: &BTreeSet<[u8; 32]>,
    pins: impl Iterator<Item = &'a RelaySegmentClientJournalPin>,
) -> Result<()> {
    if required.is_empty() {
        return Ok(());
    }
    let present = pins.filter(|pin| is_participant(pin)).map(|pin| pin.sha256).collect();
    if !required.is_subset(&present) {
        return Err(Error::Contract("relay segment restore omitted a recovered discussion source"));
    }
    Ok(())
}

impl RelaySegmentRoomBackupFiles {
    /// Read the sorted, distinct whole-file digests of companion participant archives.
    /// Each digest identifies an exact original required in the selected or alternate cohort
    /// when restoring this portable room backup. These digests convey no access or write rights.
    ///
    /// # Errors
    /// Refuses changed backup files or an invalid native checkpoint.
    pub fn required_recovered_discussion_sources(&self) -> Result<Vec<[u8; 32]>> {
        self.check()?;
        let sources = self.native.checkpoint_state()?.recovered_discussion_source_digests();
        self.check()?;
        Ok(sources.into_iter().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::{RelaySegmentClientJournalPin, RelaySegmentJournalOwner, check_sources};
    use crate::{Error, RelaySegmentDocumentJournalFamily};
    use std::collections::BTreeSet;

    fn participant(sha256: [u8; 32]) -> RelaySegmentClientJournalPin {
        RelaySegmentClientJournalPin {
            owner: RelaySegmentJournalOwner::IndependentParticipant {
                writer: "2".into(),
                actor: "comments".into(),
            },
            bytes: 12,
            sha256,
        }
    }

    #[test]
    fn each_required_original_can_move_to_the_selected_cohort_but_cannot_be_replaced()
    -> crate::Result<()> {
        let original = participant([1; 32]);
        let next = participant([2; 32]);
        let required = BTreeSet::from([original.sha256]);
        check_sources(&required, [&next, &original].into_iter())?;
        check_sources(&required, [&original].into_iter())?;
        assert!(matches!(
            check_sources(&required, [&next].into_iter()),
            Err(Error::Contract("relay segment restore omitted a recovered discussion source"))
        ));
        let wrong_family = RelaySegmentClientJournalPin {
            owner: RelaySegmentJournalOwner::Document {
                writer: "2".into(),
                family: RelaySegmentDocumentJournalFamily::Original,
            },
            ..original
        };
        assert!(check_sources(&required, [&wrong_family].into_iter()).is_err());
        Ok(())
    }
}
