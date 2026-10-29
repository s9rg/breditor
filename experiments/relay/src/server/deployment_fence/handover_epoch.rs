//! Closed source commitment choices and read-only inspection under actual epoch custody.
use super::{RoomDeploymentAuthority, RoomDeploymentSelection, journal, permit::Permit};
use crate::{
    Error, Result,
    server::generation_backup::durable::{
        LogGenerationHandoverStatus, PreparedLogGenerationHandoverIdentity,
    },
};
use std::{
    io::{Read, Seek, SeekFrom},
    sync::atomic::Ordering,
};
pub(in crate::server) fn handover_selection(
    previous: &RoomDeploymentSelection,
    nonce: &[u8; 32],
) -> Result<RoomDeploymentSelection> {
    let generation = previous.validate_pin()?;
    if generation == 0 || generation >= journal::MAX_CLAIMS {
        return Err(Error::Contract("handover serving epoch or budget"));
    }
    Ok(RoomDeploymentSelection {
        identity: previous.identity.clone(),
        generation: (generation + 1).to_string(),
        owner: Some(journal::nonce(nonce)),
    })
}
pub(in crate::server) fn prepared_handover_status(
    authority: &RoomDeploymentAuthority,
    intent: &PreparedLogGenerationHandoverIdentity,
) -> Result<LogGenerationHandoverStatus> {
    intent.validate()?;
    if authority.identity() != intent.previous.identity {
        return Err(Error::Contract("handover authority differs"));
    }
    let mut held = Permit::try_acquire(&authority.state, false)?;
    let current = authority.state.selected(held.file()?)?;
    journal::retains_selection(
        held.file()?,
        &authority.state.header_digest,
        authority.state.offset,
        &current,
        &intent.previous,
    )?;
    let next = intent.sealed.validate_pin()?;
    let status = if current.count < next {
        LogGenerationHandoverStatus::Prepared
    } else {
        let mut frame = [0; 104];
        let actual = (|| {
            held.file()?
                .seek(SeekFrom::Start(authority.state.offset + (next - 1) * journal::FRAME))?;
            held.file()?.read_exact(&mut frame)?;
            if frame[..8] != next.to_be_bytes() {
                return Err(Error::NeedsRecovery);
            }
            journal::check_anchor(
                held.file()?,
                &authority.state.header_digest,
                authority.state.offset,
                next,
                &frame[72..].try_into().map_err(|_| Error::NeedsRecovery)?,
            )?;
            Ok::<_, Error>(journal::nonce(&frame[8..40]))
        })();
        let nonce = match actual {
            Ok(nonce) => nonce,
            Err(error) => {
                authority.state.poisoned.store(true, Ordering::Release);
                return Err(error);
            }
        };
        if Some(nonce).as_ref() == intent.sealed.owner.as_ref() {
            LogGenerationHandoverStatus::Sealed
        } else {
            LogGenerationHandoverStatus::Superseded
        }
    };
    authority.state.check_file(held.file()?)?;
    held.finish()?;
    authority.state.healthy()?;
    Ok(status)
}
