//! Constant-size witnessed-prefix check; complete replay remains a separate law.
use super::super::identity::{RoomDeploymentIdentity, RoomDeploymentSelection};
use super::Current;
use super::{FRAME, MAX_CLAIMS, digest, record_policy};
use crate::{Error, Result};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
};

pub(in crate::server::deployment_fence) fn check_anchor(
    file: &mut File,
    identity: &RoomDeploymentIdentity,
    header: &[u8; 32],
    offset: u64,
    generation: u64,
    expected: &[u8; 32],
) -> Result<()> {
    if generation == 0 {
        return if header == expected { Ok(()) } else { Err(Error::NeedsRecovery) };
    }
    if generation > MAX_CLAIMS {
        return Err(Error::NeedsRecovery);
    }
    let mut bytes = [0; 104];
    file.seek(SeekFrom::Start(offset + (generation - 1) * FRAME))?;
    file.read_exact(&mut bytes)?;
    if record_policy(identity, generation, &bytes).is_err()
        || bytes[72..] != *expected
        || digest(header, &bytes[..72]) != *expected
    {
        return Err(Error::NeedsRecovery);
    }
    Ok(())
}

/// The caller first replays the entire current chain under actual file custody.
pub(in crate::server::deployment_fence) fn retains_selection(
    file: &mut File,
    header: &[u8; 32],
    offset: u64,
    current: &Current,
    expected: &RoomDeploymentSelection,
) -> Result<()> {
    let generation = expected.validate_pin()?;
    if current.selection.identity != expected.identity {
        return Err(Error::Contract("deployment retained identity differs"));
    }
    if generation > current.count {
        return Err(Error::NeedsRecovery);
    }
    if generation == 0 {
        return Ok(());
    }
    let mut bytes = [0; 104];
    file.seek(SeekFrom::Start(offset + (generation - 1) * FRAME))?;
    file.read_exact(&mut bytes)?;
    if record_policy(&expected.identity, generation, &bytes).is_err()
        || bytes[72..] != digest(header, &bytes[..72])
        || Some(super::nonce(&bytes[8..40])).as_deref() != expected.owner.as_deref()
    {
        return Err(Error::Contract("deployment retained selection differs"));
    }
    Ok(())
}
