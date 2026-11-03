//! Separate wire identities preserve the original activation control contract.
use super::super::DurableNativeActivationControlIdentity;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

/// Independently retained publication instance and actual bound socket DATA.
/// Deserialization creates neither a listener nor a Native serving lease.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRoomPublicationIdentity {
    /// Separate Breditor-owned publication transport discriminator.
    pub format: String,
    /// First revision of this publication contract.
    pub format_version: u32,
    /// Fresh host-generated instance, unrelated to account credentials.
    pub instance: String,
    /// Actual activation control and exact held checkpoint association.
    pub activation: DurableNativeActivationControlIdentity,
    /// Address obtained from the real host-owned bound TCP listener.
    pub listener: String,
}

/// Opaque pin of the SDK's independently retained complete joint choice.
/// This preserves association only. The server does not claim that this DATA
/// proves a browser's local actors, metadata or offline work are ready.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRoomPublicationBinding {
    /// Exact descriptor byte count, bounded below JavaScript's integer ceiling.
    pub bytes: u32,
    /// SHA-256 of the complete independently retained joint descriptor.
    pub sha256: [u8; 32],
}
impl NativeRoomPublicationBinding {
    pub(super) fn check(&self) -> Result<()> {
        if self.bytes == 0 || self.bytes > 1024 * 1024 * 1024 {
            return Err(Error::Contract("publication joint descriptor byte bound"));
        }
        Ok(())
    }
}

/// Explicit authenticated publication request; an old activation receipt is not
/// a publication command. Repeats must retain the same complete association.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRoomPublicationRequest {
    /// Separate command discriminator.
    pub format: String,
    /// First revision of this command.
    pub format_version: u32,
    /// Exact separately selected actual publication control instance.
    pub selection: NativeRoomPublicationIdentity,
    /// Exact joint choice association, not a serving permission.
    pub joint: NativeRoomPublicationBinding,
}

/// Observation that the actual Native router and real bound listener were
/// installed in one owned serving task. It grants no local editor or new epoch.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRoomPublicationReceipt {
    /// Breditor-owned publication receipt discriminator.
    pub format: String,
    /// First revision of this receipt.
    pub format_version: u32,
    /// Actual selected control and bound address.
    pub selection: NativeRoomPublicationIdentity,
    /// Original complete descriptor association, unchanged on repeats.
    pub joint: NativeRoomPublicationBinding,
    /// Explicit actual service/listener scope; no client readiness certification.
    pub scope: String,
}
