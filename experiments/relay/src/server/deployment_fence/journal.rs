//! Bounded append-only epoch ledger. Incomplete tails are refused, never truncated.
mod anchor;
use super::identity::{RoomDeploymentIdentity, RoomDeploymentSelection};
use crate::{Error, Result};
pub(super) use anchor::{check_anchor, retains_selection};
use sha2::{Digest, Sha256};
use std::fmt::Write;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
};

const ORIGINAL_MAGIC: &[u8; 8] = b"BRDF001\n";
const COORDINATED_MAGIC: &[u8; 8] = b"BRDF002\n";
const COORDINATED_BIT: u64 = 1 << 63;
pub(super) const FRAME: u64 = 104;
pub(super) const MAX_CLAIMS: u64 = 1_048_576;
const MAX_IDENTITY: usize = 1024;
pub(super) struct Header {
    pub identity: RoomDeploymentIdentity,
    pub digest: [u8; 32],
    pub offset: u64,
}
pub(super) struct Current {
    pub selection: RoomDeploymentSelection,
    pub count: u64,
    pub digest: [u8; 32],
    pub coordinated: bool,
}

fn magic(identity: &RoomDeploymentIdentity) -> &'static [u8; 8] {
    if identity.requires_coordinated_recovery() { COORDINATED_MAGIC } else { ORIGINAL_MAGIC }
}

pub(super) fn header(identity: &RoomDeploymentIdentity) -> Result<Vec<u8>> {
    identity.validate()?;
    let body = serde_json::to_vec(identity)?;
    if body.len() > MAX_IDENTITY {
        return Err(Error::Contract("deployment identity budget"));
    }
    let mut bytes = magic(identity).to_vec();
    bytes.extend_from_slice(
        &u32::try_from(body.len()).map_err(|_| Error::NeedsRecovery)?.to_be_bytes(),
    );
    bytes.extend(body);
    bytes.extend_from_slice(&Sha256::digest(&bytes));
    Ok(bytes)
}
pub(super) fn read_header(file: &mut File) -> Result<Header> {
    file.seek(SeekFrom::Start(0))?;
    let mut prefix = [0; 12];
    file.read_exact(&mut prefix)?;
    if &prefix[..8] != ORIGINAL_MAGIC && &prefix[..8] != COORDINATED_MAGIC {
        return Err(Error::Contract("deployment ledger header"));
    }
    let size = usize::try_from(u32::from_be_bytes(
        prefix[8..].try_into().map_err(|_| Error::NeedsRecovery)?,
    ))
    .map_err(|_| Error::NeedsRecovery)?;
    if size == 0 || size > MAX_IDENTITY {
        return Err(Error::Contract("deployment identity budget"));
    }
    let mut body = vec![0; size];
    file.read_exact(&mut body)?;
    let mut actual = [0; 32];
    file.read_exact(&mut actual)?;
    let mut hash = Sha256::new();
    hash.update(prefix);
    hash.update(&body);
    let digest: [u8; 32] = hash.finalize().into();
    if actual != digest {
        return Err(Error::Contract("deployment identity checksum"));
    }
    let identity: RoomDeploymentIdentity = serde_json::from_slice(&body)?;
    identity.validate()?;
    if &prefix[..8] != magic(&identity) {
        return Err(Error::Contract("deployment ledger policy differs"));
    }
    Ok(Header {
        identity,
        digest,
        offset: u64::try_from(size).map_err(|_| Error::NeedsRecovery)? + 44,
    })
}
pub(super) fn count(file: &File, offset: u64) -> Result<u64> {
    let size = file.metadata()?.len();
    if size < offset
        || !(size - offset).is_multiple_of(FRAME)
        || (size - offset) / FRAME > MAX_CLAIMS
    {
        return Err(Error::Contract("deployment ledger complete bounded frames required"));
    }
    Ok((size - offset) / FRAME)
}
fn digest(header: &[u8; 32], bytes: &[u8]) -> [u8; 32] {
    let mut value = Sha256::new();
    value.update(b"breditor/deployment-epoch/1");
    value.update(header);
    value.update(bytes);
    value.finalize().into()
}
pub(super) fn frame(
    header: &[u8; 32],
    generation: u64,
    coordinated: bool,
    nonce: &[u8; 32],
    previous: &[u8; 32],
) -> [u8; 104] {
    let mut bytes = [0; 104];
    let ordinal = if coordinated { generation | COORDINATED_BIT } else { generation };
    bytes[..8].copy_from_slice(&ordinal.to_be_bytes());
    bytes[8..40].copy_from_slice(nonce);
    bytes[40..72].copy_from_slice(previous);
    let hash = digest(header, &bytes[..72]);
    bytes[72..].copy_from_slice(&hash);
    bytes
}

pub(super) fn record_policy(
    identity: &RoomDeploymentIdentity,
    generation: u64,
    bytes: &[u8; 104],
) -> Result<bool> {
    if bytes[..8] == generation.to_be_bytes() {
        return Ok(false);
    }
    if identity.requires_coordinated_recovery()
        && bytes[..8] == (generation | COORDINATED_BIT).to_be_bytes()
    {
        return Ok(true);
    }
    Err(Error::Contract("deployment epoch lineage"))
}
pub(super) fn nonce(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(output, "{byte:02x}");
    }
    output
}
pub(super) fn current(file: &mut File) -> Result<(Header, Current)> {
    let header = read_header(file)?;
    let count = count(file, header.offset)?;
    let mut previous = header.digest;
    let mut owner = None;
    let mut coordinated = false;
    for generation in 1..=count {
        let mut bytes = [0; 104];
        file.read_exact(&mut bytes)?;
        let next = record_policy(&header.identity, generation, &bytes)?;
        if coordinated && !next {
            return Err(Error::Contract("deployment coordinated recovery was rolled back"));
        }
        coordinated = next;
        if bytes[40..72] != previous || bytes[72..] != digest(&header.digest, &bytes[..72]) {
            return Err(Error::Contract("deployment epoch lineage"));
        }
        previous.copy_from_slice(&bytes[72..]);
        if generation == count {
            owner = Some(nonce(&bytes[8..40]));
        }
    }
    let selected = RoomDeploymentSelection {
        identity: header.identity.clone(),
        generation: count.to_string(),
        owner,
    };
    Ok((header, Current { selection: selected, count, digest: previous, coordinated }))
}
/// Hot serving checks read only the fixed header, exact byte length and leased
/// tail. They do not replay the growing operator ledger on every editor action.
pub(super) fn check_lease(
    file: &mut File,
    identity: &RoomDeploymentIdentity,
    header_digest: &[u8; 32],
    offset: u64,
    generation: u64,
    expected: &[u8; 104],
) -> Result<()> {
    if generation == 0 || generation > MAX_CLAIMS {
        return Err(Error::Lease);
    }
    let header = read_header(file)?;
    if &header.identity != identity || &header.digest != header_digest || header.offset != offset {
        return Err(Error::NeedsRecovery);
    }
    let actual = count(file, offset)?;
    if actual > generation {
        return Err(Error::Lease);
    }
    if actual < generation {
        return Err(Error::NeedsRecovery);
    }
    file.seek(SeekFrom::Start(offset + (generation - 1) * FRAME))?;
    let mut bytes = [0; 104];
    file.read_exact(&mut bytes)?;
    if &bytes != expected {
        return Err(Error::NeedsRecovery);
    }
    Ok(())
}
