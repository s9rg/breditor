//! Evaluate original commands on a disposable causal fork; no fake journal or live checkout.
use super::packet::{DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope};
use crate::{
    Error,
    register::Stamp,
    rich_replica::{RichReplica, target_validation},
};
use breditor_core::rich_content::RichDocument;
use loro::LoroDoc;

pub(super) fn evaluate(
    owner: &RichReplica,
    doc: &LoroDoc,
    document: &RichDocument,
    canonical: &str,
    draft: &DocumentSuggestionDraft,
) -> Result<String, Error> {
    draft.check()?;
    let doc = doc.fork();
    super::super::text_flow::configure(&doc);
    // Only the private fork can use this writer's next counters. It is never imported or published.
    doc.set_peer_id(owner.doc.peer_id())?;
    let header = super::super::materialize::header(&doc)?;
    let commands = match &draft.edit {
        DocumentSuggestionEdit::GeneralText(action) => {
            let plan = action.plan(&owner.codec, document)?;
            let stamp = Stamp::next(&doc)?;
            action.prepare(&doc, &plan)?;
            doc.commit();
            super::super::paragraphs::verify(&doc, &owner.codec, document)?;
            action.apply(&doc, &owner.codec, document, stamp, &plan)?;
            doc.commit();
            return Ok(project(owner, &doc, &header)?.1);
        }
        DocumentSuggestionEdit::Commands(commands) => commands,
    };
    target_validation::validate_context(
        &target_validation::Context {
            codec: &owner.codec,
            doc: &doc,
            document,
            canonical,
            protocol: owner.protocol,
            general: true,
            document_scope: draft.scope == DocumentSuggestionScope::Document,
        },
        commands,
    )?;
    let stamp = Stamp::next(&doc)?;
    for command in commands {
        command.prepare(&doc, &owner.codec, document)?;
    }
    doc.commit();
    let mut document = document.clone();
    let mut canonical = canonical.to_owned();
    for (ordinal, command) in commands.iter().enumerate() {
        let stamp = if ordinal == 0 { stamp } else { Stamp::next(&doc)? };
        command.apply(&doc, &owner.codec, &document, stamp, ordinal)?;
        doc.commit();
        (document, canonical) = project(owner, &doc, &header)?;
    }
    Ok(canonical)
}
fn project(
    owner: &RichReplica,
    doc: &LoroDoc,
    header: &serde_json::Value,
) -> Result<(RichDocument, String), Error> {
    owner.protocol.require(doc)?;
    super::super::layout_fields::validate(doc)?;
    if super::super::materialize::header(doc)? != *header {
        return Err(Error::Contract("suggestion immutable document binding"));
    }
    let raw = super::super::materialize::envelope(doc)?;
    let decoded = owner
        .codec
        .decode(&raw.to_string())
        .map_err(|_| Error::Contract("suggestion schema admission"))?;
    let document = RichDocument::try_admit(owner.codec.schema(), decoded, owner.codec.limits())
        .map_err(|_| Error::Contract("suggestion rich admission"))?;
    if document.id().as_str() != owner.document_id() {
        return Err(Error::Contract("suggestion document binding"));
    }
    let canonical = owner
        .codec
        .encode(document.document())
        .map_err(|_| Error::Contract("suggestion canonical encoding"))?;
    Ok((document, canonical))
}
