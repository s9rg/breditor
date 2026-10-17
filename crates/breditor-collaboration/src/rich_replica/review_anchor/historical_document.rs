//! Read a causally closed retained cut without checking out or authoring on the live owner.
use super::packet::{MAX_BYTES, Packet};
use crate::{
    Error,
    rich_replica::{RichReplica, WriterDependency},
};
use breditor_core::rich_content::RichDocument;
use loro::LoroDoc;

pub(in crate::rich_replica) struct HistoricalDocument {
    pub doc: LoroDoc,
    pub document: RichDocument,
    pub canonical: String,
    pub clocks: Vec<WriterDependency>,
    pub(super) packet: Packet,
}

impl RichReplica {
    pub(in crate::rich_replica) fn historical_review_document(
        &self,
        input: &str,
    ) -> Result<Option<HistoricalDocument>, Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("review anchor bytes"));
        }
        let packet: Packet = serde_json::from_str(input)?;
        if !packet.ready(self)? {
            return Ok(None);
        }
        let vector = packet.vector()?;
        let frontiers = self.doc.vv_to_frontiers(&vector);
        if self.doc.frontiers_to_vv(&frontiers).as_ref() != Some(&vector) {
            return Err(Error::Contract("review source cut is not causally closed"));
        }
        // fork_at retains only the requested history. No live checkout, authoring, or UI mutation.
        let doc = self.doc.fork_at(&frontiers)?;
        if doc.state_vv() != vector || doc.oplog_vv() != vector {
            return Err(Error::Contract("review source cut differs from retained history"));
        }
        self.protocol.require(&doc)?;
        super::super::layout_fields::validate(&doc)?;
        let raw = super::super::materialize::envelope(&doc)?;
        let admitted = self
            .codec
            .decode(&raw.to_string())
            .map_err(|_| Error::Contract("historical source schema admission"))?;
        let document = RichDocument::try_admit(self.codec.schema(), admitted, self.codec.limits())
            .map_err(|_| Error::Contract("historical source rich admission"))?;
        if document.id().as_str() != self.document_id() {
            return Err(Error::Contract("historical source document identity"));
        }
        let canonical = self
            .codec
            .encode(document.document())
            .map_err(|_| Error::Contract("historical source canonical encoding"))?;
        let clocks = vector
            .iter()
            .map(|(writer, counter)| (*writer, *counter))
            .collect::<std::collections::BTreeMap<_, _>>()
            .into_iter()
            .map(|(writer, counter)| WriterDependency {
                writer: writer.to_string(),
                counter: counter.to_string(),
            })
            .collect();
        Ok(Some(HistoricalDocument { doc, document, canonical, clocks, packet }))
    }
}
