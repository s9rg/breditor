//! Staged authenticated-origin admission; persistence/lease policy belongs to the reference relay.
use super::{
    super::{RichReplica, SharedObservation},
    WriterDependency, digest,
    frame::{self, GroupKind},
};
use crate::Error;
use loro::{ContainerID, ContainerType, IdSpan};
use serde::Serialize;

/// Integrated operation identity suitable for a relay's later durable acknowledgement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriterReceipt {
    /// Author authorized by the host, not selected by the payload.
    pub writer: String,
    /// Atomic group start.
    pub from: String,
    /// Fully integrated atomic group end.
    pub through: String,
    /// Exact canonical author history through the integrated end.
    pub prefix_digest: String,
    /// Exact canonical operations in this action group.
    pub group_digest: String,
}
/// Outcome before any server append or publication. Pending groups must remain outside the owner.
pub enum WriterGroupPreparation {
    /// Full semantic admission succeeded on an exclusive, unpublished candidate.
    Prepared(Box<PreparedWriterGroup>),
    /// The exact group is already integrated; no extra history/publication is created.
    Duplicate(WriterReceipt),
    /// Required applied operations are missing. Retain only under a bounded relay pending budget.
    Pending {
        /// Canonical author identity.
        writer: String,
        /// Required exclusive ends, including an own-stream gap if present.
        missing: Vec<WriterDependency>,
    },
}
/// Exclusive staged result: persist before commit while holding the room's serialization lock.
///
/// The exact original observation fences publication. A host must never acknowledge this as
/// durable merely because preparation succeeded or a socket write completed.
pub struct PreparedWriterGroup {
    basis: SharedObservation,
    candidate: RichReplica,
    receipt: WriterReceipt,
}
impl PreparedWriterGroup {
    /// Integrated writer range/lineage, before any durability claim.
    #[must_use]
    pub const fn receipt(&self) -> &WriterReceipt {
        &self.receipt
    }
    /// Exact candidate journal to append/checkpoint durably before publication.
    /// # Errors
    /// Rejects existing journal budgets or serialization failures.
    pub fn checkpoint(&self) -> Result<String, Error> {
        self.candidate.checkpoint()
    }
    /// Admitted candidate server catchup frame; preparation does not broadcast it.
    /// # Errors
    /// Rejects existing full-state frame budgets or engine encoding failures.
    pub fn update_frame(&self) -> Result<String, Error> {
        self.candidate.update_frame()
    }
    /// Exact admitted candidate document, with no access to mutate the staged owner.
    #[must_use]
    pub fn document_json(&self) -> &str {
        self.candidate.document_json()
    }
}
fn receipt(owner: &RichReplica, checked: &frame::Checked) -> Result<WriterReceipt, Error> {
    Ok(WriterReceipt {
        writer: checked.frame.writer.clone(),
        from: checked.frame.from.clone(),
        through: checked.frame.through.clone(),
        prefix_digest: digest::operations(owner, checked.writer, 0, checked.through)?,
        group_digest: checked.frame.group_digest.clone(),
    })
}
impl RichReplica {
    /// Stage one single-writer atomic group under a host-authenticated writer identity.
    ///
    /// Missing dependencies are not imported into live or staged history. This avoids a pending
    /// invalid group poisoning later admission of another author's valid dependencies.
    /// # Errors
    /// Rejects bindings, author/range forgery, divergent lineage, partial integration or invalid
    /// rich state atomically. The host separately authenticates accounts, roles and writer leases.
    pub fn prepare_writer_group(
        &self,
        authenticated_writer: &str,
        input: &str,
    ) -> Result<WriterGroupPreparation, Error> {
        let checked = frame::decode(self, authenticated_writer, input)?;
        if checked.frame.kind == GroupKind::Genesis {
            return Err(Error::Contract("shared genesis requires room creation authority"));
        }
        let before = self.doc.state_vv();
        let current = before.get(&checked.writer).copied().unwrap_or(0);
        if checked.from > current {
            return Ok(WriterGroupPreparation::Pending {
                writer: checked.frame.writer.clone(),
                missing: vec![WriterDependency {
                    writer: checked.frame.writer,
                    counter: checked.from.to_string(),
                }],
            });
        }
        if digest::operations(self, checked.writer, 0, checked.from)?
            != checked.frame.previous_digest
        {
            return Err(Error::Contract("shared writer history fork"));
        }
        if checked.through <= current {
            if digest::operations(self, checked.writer, checked.from, checked.through)?
                != checked.frame.group_digest
            {
                return Err(Error::Contract("shared writer history fork"));
            }
            return Ok(WriterGroupPreparation::Duplicate(receipt(self, &checked)?));
        }
        if checked.from != current {
            return Err(Error::Contract("shared writer group overlaps integrated boundary"));
        }
        let missing = checked
            .dependencies
            .iter()
            .filter(|(writer, count)| before.get(writer).copied().unwrap_or(0) < *count)
            .map(|(writer, count)| WriterDependency {
                writer: writer.to_string(),
                counter: count.to_string(),
            })
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Ok(WriterGroupPreparation::Pending { writer: checked.frame.writer, missing });
        }
        let basis = self.observe()?;
        let mut candidate = self.staged()?;
        candidate.receive(checked.frame.bytes.clone())?;
        let after = candidate.doc.state_vv();
        if after.get(&checked.writer).copied().unwrap_or(0) != checked.through
            || after.iter().any(|(writer, count)| {
                *writer != checked.writer && *count != before.get(writer).copied().unwrap_or(0)
            })
        {
            return Err(Error::Contract("shared writer group not completely integrated"));
        }
        let binding = ContainerID::new_root("binding", ContainerType::Map);
        if candidate
            .doc
            .export_json_in_id_span(IdSpan::new(checked.writer, checked.from, checked.through))
            .iter()
            .any(|change| change.ops.iter().any(|op| op.container == binding))
        {
            return Err(Error::Contract("ordinary writer group contains room initialization"));
        }
        if digest::operations(&candidate, checked.writer, checked.from, checked.through)?
            != checked.frame.group_digest
        {
            return Err(Error::Contract("shared writer group canonical digest"));
        }
        let receipt = receipt(&candidate, &checked)?;
        Ok(WriterGroupPreparation::Prepared(Box::new(PreparedWriterGroup {
            basis,
            candidate,
            receipt,
        })))
    }
    /// Adopt a durably saved candidate exactly once under the room's serialization lock.
    /// # Errors
    /// A stale/foreign preparation rejects without mutation. The relay must not append another
    /// commit concurrently between prepare, durable append and this guarded publication.
    pub fn commit_writer_group(
        &mut self,
        prepared: PreparedWriterGroup,
    ) -> Result<WriterReceipt, Error> {
        self.check(&prepared.basis)?;
        *self = prepared.candidate;
        Ok(prepared.receipt)
    }
}
