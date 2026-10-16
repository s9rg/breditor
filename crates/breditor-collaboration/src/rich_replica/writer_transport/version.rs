//! Transport digest negotiation is explicit and independent of the causal model.
use super::{digest, lineage_v2};
use crate::{Error, rich_replica::RichReplica};
use loro::IdSpan;

#[derive(Clone, Copy)]
pub(super) enum Version {
    Original,
    Atomic,
}
impl Version {
    pub(super) const fn number(self) -> u32 {
        match self {
            Self::Original => 1,
            Self::Atomic => 2,
        }
    }
    pub(super) fn operations(
        self,
        owner: &RichReplica,
        writer: u64,
        from: i32,
        through: i32,
    ) -> Result<String, Error> {
        match self {
            Self::Original => digest::operations(owner, writer, from, through),
            Self::Atomic => lineage_v2::changes(
                owner.document_id(),
                &owner.codec.schema().fingerprint().to_string(),
                owner.model_version(),
                writer,
                from,
                through,
                &owner.doc.export_json_in_id_span(IdSpan::new(writer, from, through)),
            ),
        }
    }
}
