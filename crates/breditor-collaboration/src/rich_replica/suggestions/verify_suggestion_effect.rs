//! Prove an accepted operation range by re-executing the ORIGINAL intent at its actual causal basis.
//! No live checkout, imported replacement, account authority, Undo adoption or publication occurs.
use super::{
    DocumentSuggestionEffect, DocumentSuggestionInfo, DocumentSuggestionSource, evaluate_commands,
    packet::Packet, read_set::ReadSet,
};
use crate::{
    Error,
    rich_replica::{
        RichReplica, SharedObservation, WriterDependency, WriterReceiptRetention,
        review_anchor::check_source_cut,
        session::writer_id,
        writer_transport::{atomic_digest_for_doc, counter},
    },
};
use loro::{Frontiers, ID, LoroDoc, VersionVector};
use std::cmp::Ordering;

/// Opaque proof of original proposal lowering, exact retained V2 lineage and the semantic-only
/// range. This proves neither authenticated server finality nor an accepting device's ownership.
pub struct VerifiedDocumentSuggestionEffect {
    pub(super) observed: SharedObservation,
    info: DocumentSuggestionInfo,
    pub(super) effect: DocumentSuggestionEffect,
    pub(super) before: Frontiers,
    pub(super) after: Frontiers,
}
impl VerifiedDocumentSuggestionEffect {
    /// Native-proven original proposal metadata; authenticated attribution remains host-owned.
    #[must_use]
    pub const fn info(&self) -> &DocumentSuggestionInfo {
        &self.info
    }
    /// Exact retained operation range and re-derived semantic start, excluding permanent preparation.
    #[must_use]
    pub const fn effect(&self) -> &DocumentSuggestionEffect {
        &self.effect
    }
}

/// Missing operations remain explicit; a partially received range is never an Undo proof.
pub enum DocumentSuggestionEffectVerification {
    /// Required source/effect operations are not yet applied. Nothing is imported or published.
    Pending {
        /// Missing native exclusive ends, not replacement operations or accepted content.
        missing: Vec<WriterDependency>,
    },
    /// Original native intent reproduces the retained range and exact semantic boundary.
    Verified(Box<VerifiedDocumentSuggestionEffect>),
}

fn before_operation(doc: &LoroDoc, writer: u64, at: i32) -> Result<Frontiers, Error> {
    let change = doc
        .get_change(ID::new(writer, at))
        .ok_or(Error::Contract("suggestion effect operation not retained"))?;
    let frontiers = match change.id.counter.cmp(&at) {
        Ordering::Equal => change.deps,
        Ordering::Less => Frontiers::from(ID::new(writer, at - 1)),
        Ordering::Greater => return Err(Error::Contract("suggestion effect operation basis")),
    };
    let vector = doc
        .frontiers_to_vv(&frontiers)
        .ok_or(Error::Contract("suggestion effect basis missing"))?;
    if vector.get(&writer).copied().unwrap_or(0) != at {
        return Err(Error::Contract("suggestion effect basis author end"));
    }
    check_source_cut(doc, &vector)?;
    Ok(frontiers)
}
pub(super) fn vector(doc: &LoroDoc, frontiers: &Frontiers) -> Result<VersionVector, Error> {
    doc.frontiers_to_vv(frontiers).ok_or(Error::Contract("suggestion effect causal range"))
}
fn original_dependencies(
    owner: &RichReplica,
    packet: &Packet,
    basis: &VersionVector,
    doc: &LoroDoc,
    canonical: &str,
) -> Result<(), Error> {
    let source = owner
        .historical_review_document(&packet.data.source_anchor_json)?
        .ok_or(Error::Contract("suggestion original source disappeared"))?;
    for clock in &source.clocks {
        if basis.get(&writer_id(&clock.writer)?).copied().unwrap_or(0) < counter(&clock.counter)? {
            return Err(Error::Contract("suggestion effect precedes its original source"));
        }
    }
    let original: serde_json::Value = serde_json::from_str(&source.canonical)?;
    let current: serde_json::Value = serde_json::from_str(canonical)?;
    if !ReadSet::capture(
        &original["root"],
        &source.document,
        &source.doc,
        &owner.codec,
        &packet.data.draft,
    )?
    .conflicts(&current["root"], doc)?
    .is_empty()
    {
        return Err(Error::Contract("suggestion effect had conflicting original targets"));
    }
    Ok(())
}
impl RichReplica {
    /// Prove a received effect against its original packet and exact retained operations. The
    /// disposable re-execution uses the effect's original writer and historical causal basis,
    /// not this client's later offline content or a guessed previous AST. It verifies original
    /// source witnesses, native command lowering, both V2 digests and the actual semantic start.
    /// Read-only owners may prove effects; no engine counters, roots, history or UI are changed.
    /// The host must separately authenticate the single final decision and accepting device.
    /// # Errors
    /// Stale/foreign guards, malformed/source-conflicting intents, invalid cuts, guessed semantic
    /// boundaries, different operations or re-execution/admission failures leave the owner intact.
    pub fn verify_document_suggestion_effect_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
        effect: &DocumentSuggestionEffect,
    ) -> Result<DocumentSuggestionEffectVerification, Error> {
        self.check(observed)?;
        let packet = Packet::read(self, input)?;
        let writer = writer_id(&effect.writer_group.writer)?;
        let from = counter(&effect.writer_group.from)?;
        let through = counter(&effect.writer_group.through)?;
        let semantic_from = counter(&effect.semantic_from)?;
        if packet.id != effect.suggestion_id || from > semantic_from || semantic_from >= through {
            return Err(Error::Contract("suggestion effect identity or semantic bounds"));
        }
        match self.retained_writer_receipt_v2(&effect.writer_group)? {
            WriterReceiptRetention::Pending { missing } => {
                return Ok(DocumentSuggestionEffectVerification::Pending {
                    missing: vec![missing],
                });
            }
            WriterReceiptRetention::Verified { .. } => {}
        }
        if let DocumentSuggestionSource::Pending { missing } =
            self.verify_document_suggestion_source(input)?
        {
            return Ok(DocumentSuggestionEffectVerification::Pending { missing });
        }
        let basis = before_operation(&self.doc, writer, from)?;
        let basis_vector = vector(&self.doc, &basis)?;
        let doc = super::super::retained_history::at_vector(&self.doc, &basis_vector)?;
        if doc.state_vv() != basis_vector || doc.oplog_vv() != basis_vector {
            return Err(Error::Contract("suggestion effect fork differs from basis"));
        }
        let header = super::super::materialize::header(&doc)?;
        let (document, canonical) = evaluate_commands::project(self, &doc, &header)?;
        original_dependencies(self, &packet, &basis_vector, &doc, &canonical)?;
        let evaluated = evaluate_commands::evaluate_as_writer(
            self,
            &doc,
            &document,
            &canonical,
            &packet.data.draft,
            writer,
        )?;
        let before = vector(&evaluated.doc, &evaluated.before)?;
        let after = vector(&evaluated.doc, &evaluated.after)?;
        if before.get(&writer).copied().unwrap_or(0) != semantic_from
            || after.get(&writer).copied().unwrap_or(0) != through
            || after.iter().any(|(peer, end)| {
                *peer != writer && before.get(peer).copied().unwrap_or(0) != *end
            })
            || atomic_digest_for_doc(self, &evaluated.doc, writer, from, through)?
                != effect.writer_group.group_digest
            || atomic_digest_for_doc(self, &evaluated.doc, writer, 0, through)?
                != effect.writer_group.prefix_digest
        {
            return Err(Error::Contract("suggestion effect differs from original native lowering"));
        }
        // Re-derived frontiers name the exact retained IDs, not private-fork-only operations.
        if vector(&self.doc, &evaluated.before)? != before
            || vector(&self.doc, &evaluated.after)? != after
        {
            return Err(Error::Contract(
                "suggestion effect frontiers differ from retained history",
            ));
        }
        Ok(DocumentSuggestionEffectVerification::Verified(Box::new(
            VerifiedDocumentSuggestionEffect {
                observed: observed.clone(),
                info: packet.info(),
                effect: effect.clone(),
                before: evaluated.before,
                after: evaluated.after,
            },
        )))
    }
}
