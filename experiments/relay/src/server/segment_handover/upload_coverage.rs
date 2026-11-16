//! Cover the actual native writer roster, including empty observers and revoked writers.
use crate::{Error, RelaySegmentClientUploadPin, Result, RoomParticipantInventoryMetadata};
use std::collections::BTreeSet;

pub(in crate::server) fn missing(
    pins: &[RelaySegmentClientUploadPin],
    participants: &RoomParticipantInventoryMetadata,
) -> Result<Vec<String>> {
    let mut writers =
        participants.writers.iter().map(|row| row.clock.writer.as_str()).collect::<BTreeSet<_>>();
    for pin in pins {
        if !writers.remove(pin.writer.as_str()) {
            return Err(Error::Contract("client upload archive writer is not registered"));
        }
    }
    Ok(writers.into_iter().map(str::to_owned).collect())
}
