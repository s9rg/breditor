//! Admit exact native replay under the selected room's grammar, registrations and prefix clocks.
use super::{
    RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily, RelaySegmentJournalOwner,
    RelaySegmentReviewJournalFamily, RetainedJournals,
};
use crate::{
    Error, RecoveredRelaySegmentRoom, RecoveryDocumentClock, RecoveryReviewRegistration, Result,
    Room, RoomParticipantInventoryMetadata,
};
use breditor_collab_feasibility::{
    review::{ReviewAccess, ReviewActorPolicy, ReviewPrincipalId},
    rich_replica::RichReplica,
};
use serde::Serialize;
use std::collections::BTreeMap;

/// Exact retained journal and its native stream coordinates at the approved cut.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentClientJournalHead {
    /// Original selected native file and registered identity.
    pub pin: RelaySegmentClientJournalPin,
    /// Client's complete original native stream end, including offline work.
    pub local_through: String,
    /// Relay's accepted end for that writer or actor. A larger end needs ordinary catch-up.
    pub accepted_through: String,
}

/// Enrollment of all registered client document writers and independent review actors.
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentClientJournalCoverage {
    /// Verified exact native originals with compatible common prefixes.
    pub journals: Vec<RelaySegmentClientJournalHead>,
    /// Registered document streams without selected originals.
    pub missing_document_writers: Vec<String>,
    /// Registered review streams without selected originals or their matching document.
    pub missing_review_actors: Vec<String>,
}

impl RecoveredRelaySegmentRoom {
    pub(crate) fn handover_client_journals(
        &self,
        participants: &RoomParticipantInventoryMetadata,
    ) -> Result<Option<RelaySegmentClientJournalCoverage>> {
        self.journals
            .as_ref()
            .map(|journals| verify(&self.room, participants, journals))
            .transpose()
    }
}

fn verify(
    room: &Room,
    participants: &RoomParticipantInventoryMetadata,
    originals: &RetainedJournals,
) -> Result<RelaySegmentClientJournalCoverage> {
    let documents = participants
        .writers
        .iter()
        .map(|row| (row.clock.writer.as_str(), row))
        .collect::<BTreeMap<_, _>>();
    let reviews = participants
        .review
        .iter()
        .flat_map(|inventory| &inventory.writers)
        .map(|row| (row.clock.actor.as_str(), row))
        .collect::<BTreeMap<_, _>>();
    let document_clocks = participants
        .writers
        .iter()
        .map(|row| &row.clock)
        .chain(participants.server_authors.iter().map(|row| &row.clock))
        .map(|clock| (clock.writer.as_str(), clock))
        .collect::<BTreeMap<_, _>>();
    let mut selected_documents = BTreeMap::new();
    let mut selected_reviews = BTreeMap::<&str, Vec<_>>::new();
    let mut missing_documents = documents.clone();
    let mut missing_reviews = reviews.clone();
    for (index, pin) in originals.pins().iter().enumerate() {
        match &pin.owner {
            RelaySegmentJournalOwner::Document { writer, family } => {
                let row = missing_documents
                    .remove(writer.as_str())
                    .ok_or(Error::Contract("client journal document writer is not registered"))?;
                selected_documents.insert(writer.as_str(), (index, *family, row));
            }
            RelaySegmentJournalOwner::Review { actor, document_writer, family } => {
                let row = reviews
                    .get(actor.as_str())
                    .ok_or(Error::Contract("client journal review actor is not registered"))?;
                if documents
                    .get(document_writer.as_str())
                    .is_none_or(|document| document.principal != row.principal)
                {
                    return Err(Error::Contract(
                        "client journal review document principal differs",
                    ));
                }
                selected_reviews.entry(document_writer.as_str()).or_default().push((
                    actor.as_str(),
                    index,
                    *family,
                    *row,
                ));
            }
        }
    }
    let mut verified = Vec::new();
    for (writer, (index, family, row)) in selected_documents {
        let local = restore_document(room, family, &originals.read(index)?)?;
        if local.writer() != writer || local.document_id() != room.replica.document_id() {
            return Err(Error::Contract("client journal document binding differs"));
        }
        let local_through =
            verify_document(room, &local, &document_clocks, &row.clock, row.observer)?;
        verified.push((index, local_through, row.clock.through.clone()));
        for (actor, index, family, row) in selected_reviews.remove(writer).into_iter().flatten() {
            let local_through =
                verify_review(room, &local, &reviews, row, family, &originals.read(index)?)?;
            missing_reviews.remove(actor);
            verified.push((index, local_through, row.clock.through.clone()));
        }
    }
    originals.check()?;
    verified.sort_unstable_by_key(|(index, _, _)| *index);
    Ok(RelaySegmentClientJournalCoverage {
        journals: verified
            .into_iter()
            .map(|(index, local_through, accepted_through)| RelaySegmentClientJournalHead {
                pin: originals.pins()[index].clone(),
                local_through,
                accepted_through,
            })
            .collect(),
        missing_document_writers: missing_documents.into_keys().map(str::to_owned).collect(),
        missing_review_actors: missing_reviews.into_keys().map(str::to_owned).collect(),
    })
}

fn restore_document(
    room: &Room,
    family: RelaySegmentDocumentJournalFamily,
    json: &str,
) -> Result<RichReplica> {
    use RelaySegmentDocumentJournalFamily as Family;
    let id = room.replica.document_id();
    let profile = &room.profile;
    Ok(match family {
        Family::Original => profile.restore(id, json),
        Family::Typing => profile.restore_typing(id, json),
        Family::General => profile.restore_general(id, json),
        Family::GeneralTyping => profile.restore_general_typing(id, json),
        Family::Document => profile.restore_document(id, json),
        Family::DocumentTyping => profile.restore_document_typing(id, json),
        Family::Reviewed => profile.restore_reviewed(id, json),
        Family::Search => profile.restore_search(id, json),
        Family::Segmented => profile.restore_segmented(id, json),
        Family::Continued => profile.restore_continued_history(id, json),
    }?)
}

fn verify_document(
    room: &Room,
    local: &RichReplica,
    accepted: &BTreeMap<&str, &RecoveryDocumentClock>,
    own: &RecoveryDocumentClock,
    observer: bool,
) -> Result<String> {
    let head = if room.atomic_transport_v2 {
        RichReplica::writer_clock_v2
    } else {
        RichReplica::writer_clock
    };
    let at = if room.atomic_transport_v2 {
        RichReplica::writer_clock_at_v2
    } else {
        RichReplica::writer_clock_at
    };
    let mut authors = local.applied_writer_ids();
    // A joined journal has the exact immutable seed even if its expected writer has never edited.
    if !authors.iter().any(|writer| writer == "1") {
        return Err(Error::Contract("client journal is missing document genesis"));
    }
    if !authors.contains(&own.writer) {
        authors.push(own.writer.clone());
    }
    let mut own_through = String::new();
    for writer in authors {
        let server = accepted
            .get(writer.as_str())
            .ok_or(Error::Contract("client journal has unregistered document author"))?;
        let client = head(local, &writer)?;
        let order = position(&client.through)?.cmp(&position(&server.through)?);
        if writer == "1" && !order.is_eq() {
            return Err(Error::Contract("client journal document genesis differs"));
        }
        if order.is_gt() && (writer != own.writer || observer) {
            return Err(Error::Contract("client journal has foreign document suffix"));
        }
        let same = match order {
            std::cmp::Ordering::Equal => client.prefix_digest == server.prefix_digest,
            std::cmp::Ordering::Less => {
                client.prefix_digest == at(&room.replica, &writer, &client.through)?.prefix_digest
            }
            std::cmp::Ordering::Greater => {
                at(local, &writer, &server.through)?.prefix_digest == server.prefix_digest
            }
        };
        if !same {
            return Err(Error::Contract("client journal document prefix diverged"));
        }
        if writer == own.writer {
            own_through = client.through;
        }
    }
    Ok(own_through)
}

fn verify_review(
    room: &Room,
    document: &RichReplica,
    accepted: &BTreeMap<&str, &RecoveryReviewRegistration>,
    own: &RecoveryReviewRegistration,
    family: RelaySegmentReviewJournalFamily,
    json: &str,
) -> Result<String> {
    use RelaySegmentReviewJournalFamily as Family;
    let server_review =
        &room.review.as_ref().ok_or(Error::Contract("room review is absent"))?.session;
    let policy = ReviewActorPolicy {
        actor: own.clock.actor.clone(),
        principal: ReviewPrincipalId::try_new(&own.principal)?,
        access: ReviewAccess::ReadOnly,
    };
    let local = match family {
        Family::Original => document.restore_review_session(policy, json),
        Family::Segmented => document.restore_segmented_review_session(policy, json),
        Family::Continued => document.restore_continued_review_session(policy, json),
    }?;
    let mut actors = local.retained_actor_ids();
    if !actors.contains(&own.clock.actor) {
        actors.push(own.clock.actor.clone());
    }
    let mut own_through = String::new();
    for actor in actors {
        let row = accepted
            .get(actor.as_str())
            .ok_or(Error::Contract("client journal has unregistered review actor"))?;
        let principal = ReviewPrincipalId::try_new(&row.principal)?;
        let client = local.writer_clock(&actor, &principal)?;
        let server = &row.clock;
        let local_end = position(&client.through)?;
        let accepted_end = position(&server.through)?;
        if local_end > accepted_end && (actor != own.clock.actor || own.observer) {
            return Err(Error::Contract("client journal has foreign review suffix"));
        }
        let common = local_end.min(accepted_end);
        let local_prefix = if common == local_end {
            client
        } else {
            local.writer_clock_at(&actor, &principal, common)?
        };
        let server_prefix = if common == accepted_end {
            server.prefix_digest.clone()
        } else {
            server_review.writer_clock_at(&actor, &principal, common)?.prefix_digest
        };
        if local_prefix.prefix_digest != server_prefix {
            return Err(Error::Contract("client journal review prefix diverged"));
        }
        if actor == own.clock.actor {
            own_through = local_end.to_string();
        }
    }
    Ok(own_through)
}

fn position(through: &str) -> Result<u64> {
    through.parse().map_err(|_| Error::Contract("native journal clock position"))
}
