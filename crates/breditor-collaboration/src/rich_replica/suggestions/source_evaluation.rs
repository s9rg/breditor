//! One reusable native source evaluation for proofs and dependency reads, never a live edit.
use super::{
    DocumentSuggestionInfo,
    evaluate_commands::{self, NativeEvaluation},
    packet::Packet,
};
use crate::{
    Error,
    rich_replica::{RichReplica, WriterDependency},
};

pub(super) enum SourceEvaluation {
    Pending {
        info: DocumentSuggestionInfo,
        missing: Vec<WriterDependency>,
    },
    Verified {
        info: DocumentSuggestionInfo,
        clocks: Vec<WriterDependency>,
        native: Box<NativeEvaluation>,
    },
}
pub(super) fn evaluate_source(owner: &RichReplica, input: &str) -> Result<SourceEvaluation, Error> {
    let packet = Packet::read(owner, input)?;
    let info = packet.info();
    let Some(source) = owner.historical_review_document(&packet.data.source_anchor_json)? else {
        return Ok(SourceEvaluation::Pending {
            info,
            missing: owner.review_anchor_missing_dependencies(&packet.data.source_anchor_json)?,
        });
    };
    let native = evaluate_commands::evaluate_as_writer(
        owner,
        &source.doc,
        &source.document,
        &source.canonical,
        &packet.data.draft,
        owner.doc.peer_id(),
    )?;
    if native.canonical == source.canonical {
        return Err(Error::Contract("suggestion has no source effect"));
    }
    Ok(SourceEvaluation::Verified { info, clocks: source.clocks, native: Box::new(native) })
}
