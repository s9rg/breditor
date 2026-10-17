//! Pure version-two retained operation proof. No import, server durability or semantic-boundary grant.
use super::{WriterDependency, WriterReceipt, digest, frame, version::Version};
use crate::{
    Error,
    rich_replica::{RichReplica, session::writer_id},
};
use serde::Serialize;

/// A pure native lineage read, not an authenticated review decision or local Undo adoption.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WriterReceiptRetention {
    /// Some claimed operations have not been applied; no unknown operations are imported.
    Pending {
        /// Required native exclusive author end.
        missing: WriterDependency,
    },
    /// The retained native operations match both original range and prefix digests exactly.
    Verified {
        /// The checked descriptive receipt. Its server authority must be supplied independently.
        receipt: WriterReceipt,
    },
}
impl RichReplica {
    /// Check an already received V2 receipt against retained native operations, including an old
    /// end after later operations by that author. This does not prove a semantic group boundary,
    /// authenticate a server, add history, create roots or change any live publication.
    /// # Errors
    /// Invalid canonical bounds/digests or different retained operations refuse without mutation.
    pub fn retained_writer_receipt_v2(
        &self,
        receipt: &WriterReceipt,
    ) -> Result<WriterReceiptRetention, Error> {
        let writer = writer_id(&receipt.writer)?;
        let from = frame::counter(&receipt.from)?;
        let through = frame::counter(&receipt.through)?;
        if from >= through
            || !digest::valid(&receipt.prefix_digest)
            || !digest::valid(&receipt.group_digest)
        {
            return Err(Error::Contract("retained writer receipt range/digests"));
        }
        if self.doc.state_vv().get(&writer).copied().unwrap_or(0) < through {
            return Ok(WriterReceiptRetention::Pending {
                missing: WriterDependency {
                    writer: receipt.writer.clone(),
                    counter: receipt.through.clone(),
                },
            });
        }
        if Version::Atomic.operations(self, writer, 0, through)? != receipt.prefix_digest
            || Version::Atomic.operations(self, writer, from, through)? != receipt.group_digest
        {
            return Err(Error::Contract("retained writer receipt lineage differs"));
        }
        Ok(WriterReceiptRetention::Verified { receipt: receipt.clone() })
    }
}
