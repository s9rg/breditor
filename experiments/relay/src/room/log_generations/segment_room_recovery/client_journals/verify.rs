//! Admit exact native replay under the selected room's grammar, registrations and prefix clocks.
use super::{
    RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily,
    RelaySegmentReviewJournalFamily, RetainedJournals,
    delivery::DeliveryRecord,
    paired::PairedRecord,
    selected::{DocumentInput, SelectedSources},
};
use crate::{
    Error, MAX_SERVER_ASSET_REFERENCE_PAIRS, RecoveredRelaySegmentRoom, RecoveryDocumentClock,
    RecoveryReviewRegistration, Result, Room, RoomParticipantInventoryMetadata,
};
use breditor_collab_feasibility::{
    review::{ReviewAccess, ReviewActorPolicy, ReviewPrincipalId, ReviewSession},
    rich_replica::{PacketAssetIdentity, PacketAssetOutcome, RichReplica, VersionAssetReference},
};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

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
    /// Independent review clock proven by this same standalone SDK backup.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paired_review: Option<RelaySegmentPairedReviewHead>,
}

/// Native review heads bound to the same durable file as the document history.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentPairedReviewHead {
    /// Exact selected local review head, including work awaiting delivery.
    pub local_through: String,
    /// Exact accepted review head at the selected relay cut.
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
    /// Unique retained document bindings, including offline work, undone images and Redo.
    pub asset_references: Vec<VersionAssetReference>,
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

enum PairedInput<'a> {
    Original(Box<PairedRecord>),
    Delivery(Box<DeliveryRecord<'a>>),
}

fn verify(
    room: &Room,
    participants: &RoomParticipantInventoryMetadata,
    originals: &RetainedJournals,
) -> Result<RelaySegmentClientJournalCoverage> {
    let SelectedSources {
        document_clocks,
        review_rows,
        documents,
        mut reviews,
        missing_document_writers,
    } = SelectedSources::read(participants, originals.pins())?;
    let mut missing_reviews = review_rows.keys().copied().collect::<BTreeSet<_>>();
    let mut verified = Vec::new();
    let mut assets = BTreeSet::new();
    for source in documents {
        let index = source.index;
        let writer = &source.row.clock.writer;
        let input = originals.read(index)?;
        let (local, paired) = match source.input {
            DocumentInput::Native(family) => (restore_document(room, family, &input)?, None),
            DocumentInput::Paired(row) => {
                let pair = PairedRecord::read(&input, participants, writer, row)?;
                let document =
                    restore_document(room, pair.family()?, &pair.document_checkpoint_json)?;
                (document, Some((row, PairedInput::Original(Box::new(pair)))))
            }
            DocumentInput::Delivery(row) => {
                let record = DeliveryRecord::read(&input, participants, source.row, row)?;
                (record.document(room)?, Some((row, PairedInput::Delivery(Box::new(record)))))
            }
        };
        if local.writer() != writer || local.document_id() != room.replica.document_id() {
            return Err(Error::Contract("client journal document binding differs"));
        }
        let local_through = verify_document(
            room,
            &local,
            &document_clocks,
            &source.row.clock,
            source.row.observer,
        )?;
        retain_assets(&local, &mut assets)?;
        let paired_review = if let Some((row, pair)) = paired {
            let local_through =
                verify_paired_review(room, &local, &review_rows, row, &pair, &mut assets)?;
            missing_reviews.remove(row.clock.actor.as_str());
            Some(RelaySegmentPairedReviewHead {
                local_through,
                accepted_through: row.clock.through.clone(),
            })
        } else {
            None
        };
        verified.push((
            index,
            RelaySegmentClientJournalHead {
                pin: originals.pins()[index].clone(),
                local_through,
                accepted_through: source.row.clock.through.clone(),
                paired_review,
            },
        ));
        for source in reviews.remove(writer.as_str()).into_iter().flatten() {
            let review =
                restore_review(&local, source.row, source.family, &originals.read(source.index)?)?;
            let local_through = verify_review(room, &review, &review_rows, source.row)?;
            missing_reviews.remove(source.row.clock.actor.as_str());
            verified.push((
                source.index,
                RelaySegmentClientJournalHead {
                    pin: originals.pins()[source.index].clone(),
                    local_through,
                    accepted_through: source.row.clock.through.clone(),
                    paired_review: None,
                },
            ));
        }
    }
    originals.check()?;
    verified.sort_unstable_by_key(|(index, _)| *index);
    Ok(RelaySegmentClientJournalCoverage {
        journals: verified.into_iter().map(|(_, head)| head).collect(),
        missing_document_writers,
        missing_review_actors: missing_reviews.into_iter().map(str::to_owned).collect(),
        asset_references: assets.into_iter().collect(),
    })
}

fn verify_paired_review(
    room: &Room,
    document: &RichReplica,
    accepted: &BTreeMap<&str, &RecoveryReviewRegistration>,
    owner: &RecoveryReviewRegistration,
    pair: &PairedInput<'_>,
    assets: &mut BTreeSet<VersionAssetReference>,
) -> Result<String> {
    let (family, json) = match pair {
        PairedInput::Original(pair) => {
            (RelaySegmentReviewJournalFamily::Original, pair.review_checkpoint_json.as_str())
        }
        PairedInput::Delivery(record) => record.review(),
    };
    let review = restore_review(document, owner, family, json)?;
    let through = verify_review(room, &review, accepted, owner)?;
    let versions = match pair {
        PairedInput::Original(pair) => {
            pair.check_progress(room, &review, owner)?;
            &pair.versions
        }
        PairedInput::Delivery(record) => {
            record.verify(room, document, &review, owner, assets)?;
            record.versions()
        }
    };
    retain_version_assets(document, versions, assets)?;
    Ok(through)
}

fn retain_version_assets(
    local: &RichReplica,
    versions: &[String],
    assets: &mut BTreeSet<VersionAssetReference>,
) -> Result<()> {
    let observed = local.observe()?;
    let mut ids = BTreeSet::new();
    for packet in versions {
        let result = local.document_version_asset_references_guarded(&observed, packet)?;
        let (PacketAssetIdentity::Version { id }, PacketAssetOutcome::Ready { references }) =
            (result.packet, result.outcome)
        else {
            return Err(Error::Contract("paired client backup version dependency read"));
        };
        if !ids.insert(id) {
            return Err(Error::Contract("duplicate paired client backup version"));
        }
        insert_assets(assets, references)?;
    }
    Ok(())
}

fn retain_assets(local: &RichReplica, assets: &mut BTreeSet<VersionAssetReference>) -> Result<()> {
    let references = local.retained_asset_references_guarded(&local.observe()?)?;
    insert_assets(
        assets,
        references.into_iter().map(|reference| VersionAssetReference {
            asset: reference.asset().as_str().into(),
            generation: reference.generation().as_str().into(),
        }),
    )
}

pub(super) fn insert_assets(
    assets: &mut BTreeSet<VersionAssetReference>,
    references: impl IntoIterator<Item = VersionAssetReference>,
) -> Result<()> {
    for reference in references {
        assets.insert(reference);
        if assets.len() > MAX_SERVER_ASSET_REFERENCE_PAIRS {
            return Err(Error::Contract("client journal raster binding budget"));
        }
    }
    Ok(())
}

pub(super) fn restore_document(
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

fn restore_review(
    document: &RichReplica,
    own: &RecoveryReviewRegistration,
    family: RelaySegmentReviewJournalFamily,
    json: &str,
) -> Result<ReviewSession> {
    use RelaySegmentReviewJournalFamily as Family;
    let policy = ReviewActorPolicy {
        actor: own.clock.actor.clone(),
        principal: ReviewPrincipalId::try_new(&own.principal)?,
        access: ReviewAccess::ReadOnly,
    };
    Ok(match family {
        Family::Original => document.restore_review_session(policy, json),
        Family::Segmented => document.restore_segmented_review_session(policy, json),
        Family::Continued => document.restore_continued_review_session(policy, json),
    }?)
}

fn verify_review(
    room: &Room,
    local: &ReviewSession,
    accepted: &BTreeMap<&str, &RecoveryReviewRegistration>,
    own: &RecoveryReviewRegistration,
) -> Result<String> {
    let server_review =
        &room.review.as_ref().ok_or(Error::Contract("room review is absent"))?.session;
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

pub(super) fn position(through: &str) -> Result<u64> {
    let value: u64 =
        through.parse().map_err(|_| Error::Contract("native journal clock position"))?;
    if value.to_string() != through {
        return Err(Error::Contract("native journal clock position"));
    }
    Ok(value)
}
