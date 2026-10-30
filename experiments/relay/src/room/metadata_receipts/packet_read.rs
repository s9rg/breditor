//! Exact first accepted packet bytes. A native-valid differently encoded retry
//! is not substituted for the original, and an inert revision Prepare is not
//! accepted publication evidence. This action never changes a queue or log.
use super::packet::PacketFingerprint;
use crate::{Error, Result, Room};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MetadataPacketKind {
    Version,
    Suggestion,
    Revision,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MetadataPacketQuery {
    pub kind: MetadataPacketKind,
    pub expected: PacketFingerprint,
}

impl MetadataPacketQuery {
    pub fn validate(&self) -> Result<()> {
        let digest = |value: &str| {
            value.strip_prefix("sha256:").is_some_and(|hex| {
                hex.len() == 64
                    && hex
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        };
        if self.expected.bytes == 0
            || self.expected.bytes > 4 * 1024 * 1024
            || !digest(&self.expected.id)
            || !digest(&self.expected.sha256)
        {
            return Err(Error::Contract("metadata packet identity or byte expectation"));
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetadataPacketRead {
    pub kind: MetadataPacketKind,
    pub fingerprint: PacketFingerprint,
    pub text: String,
}

impl Room {
    pub(crate) fn recovery_metadata_packet(
        &self,
        principal: &str,
        query: &MetadataPacketQuery,
    ) -> Result<MetadataPacketRead> {
        self.recovery_inventory_owner(principal)?;
        query.validate()?;
        let id = &query.expected.id;
        let text = match query.kind {
            MetadataPacketKind::Version => self.document_version_packet(principal, id)?,
            MetadataPacketKind::Suggestion => self.document_suggestion_packet(principal, id)?,
            MetadataPacketKind::Revision => {
                if self.document_suggestion_revision(principal, id)?.is_none() {
                    return Err(Error::Contract("metadata revision packet is not committed"));
                }
                self.document_suggestion_revision_packet(principal, id)?
            }
        }
        .ok_or(Error::Contract("original accepted metadata packet is absent"))?;
        let fingerprint = PacketFingerprint::of(id, &text);
        if fingerprint != query.expected {
            return Err(Error::Contract("original metadata packet bytes differ"));
        }
        Ok(MetadataPacketRead { kind: query.kind, fingerprint, text })
    }
}
