//! Strong historical content proof for hosts publishing a version, separate from imported claims.
use super::{DocumentVersionInfo, packet::Packet};
use crate::{
    Error,
    rich_replica::{RichReplica, WriterDependency},
};
use serde::Serialize;

/// Native source proof; authorization, accepted group boundaries and durable ordering remain host laws.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocumentVersionSource {
    /// Snapshot equals the exact canonical document at its causally closed historical source cut.
    Verified {
        /// Validated descriptive version metadata, not a permission grant.
        version: DocumentVersionInfo,
        /// Nonzero exclusive document operation ends, sorted by numeric writer identity.
        clocks: Vec<WriterDependency>,
    },
    /// This owner cannot prove the version until all captured source operations arrive.
    Pending {
        /// Validated descriptive metadata; this is not an acceptance receipt.
        version: DocumentVersionInfo,
        /// Missing exclusive operation ends, not a request to import version content as operations.
        missing: Vec<WriterDependency>,
    },
}

impl RichReplica {
    /// Prove saved semantic content against retained native history, including old revisions.
    /// Unlike `read_document_version`, this does not trust a rehashed imported source/content claim.
    /// # Errors
    /// Wrong envelope/content/binding, non-closed cuts or unequal historical snapshots reject purely.
    pub fn verify_document_version_source(
        &self,
        input: &str,
    ) -> Result<DocumentVersionSource, Error> {
        let (packet, _) = Packet::read(self, input)?;
        let version = packet.info();
        let Some(source) = self.historical_review_document(&packet.data.source_anchor_json)? else {
            return Ok(DocumentVersionSource::Pending {
                version,
                missing: self
                    .review_anchor_missing_dependencies(&packet.data.source_anchor_json)?,
            });
        };
        if source.canonical != packet.data.document_json {
            return Err(Error::Contract("version content differs from its historical source cut"));
        }
        Ok(DocumentVersionSource::Verified { version, clocks: source.clocks })
    }
}
