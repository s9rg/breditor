//! Admit exact native replay under the selected room's grammar, registrations and prefix clocks.
pub(super) mod clocks;
use super::{
    RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily,
    RelaySegmentReviewJournalFamily, RetainedJournals,
    delivery::DeliveryRecord,
    paired::PairedRecord,
    participant::ParticipantArchive,
    selected::{DocumentInput, DocumentSource, SelectedSources},
};
use crate::{
    Error, MAX_SERVER_ASSET_REFERENCE_PAIRS, RecoveredRelaySegmentRoom, RecoveryDocumentClock,
    RecoveryReviewRegistration, Result, Room, RoomParticipantInventoryMetadata,
    server::ServerAssetResolution,
};
use breditor_collab_feasibility::{
    review::{ReviewAccess, ReviewActorPolicy, ReviewPrincipalId, ReviewSession},
    rich_replica::{
        PacketAssetIdentity, PacketAssetOutcome, RichReplica, SharedRichProfile,
        VersionAssetReference,
    },
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
    /// Exact raster mappings captured by complete SDK participant originals.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub participant_raster_bindings: Vec<ServerAssetResolution>,
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

pub(in crate::room::log_generations::segment_room_recovery) fn verify_selected(
    room: &Room,
    participants: &RoomParticipantInventoryMetadata,
    originals: Option<&RetainedJournals>,
) -> Result<RelaySegmentClientJournalCoverage> {
    if let Some(originals) = originals {
        return verify(room, participants, originals);
    }
    let selected = SelectedSources::read(participants, &[])?;
    Ok(RelaySegmentClientJournalCoverage {
        missing_document_writers: selected.missing_document_writers,
        missing_review_actors: selected.review_rows.keys().map(|actor| (*actor).into()).collect(),
        ..RelaySegmentClientJournalCoverage::default()
    })
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
    let mut participant_bindings = BTreeMap::new();
    for source in documents {
        let (local, head, document_assets) = verify_document_source(
            room,
            participants,
            originals,
            &document_clocks,
            &review_rows,
            &source,
            &mut participant_bindings,
        )?;
        if let DocumentInput::Paired(row)
        | DocumentInput::Delivery(row)
        | DocumentInput::Participant(row) = source.input
        {
            missing_reviews.remove(row.clock.actor.as_str());
        }
        insert_assets(&mut assets, document_assets)?;
        verified.push((source.index, head));
        for source in reviews.remove(source.row.clock.writer.as_str()).into_iter().flatten() {
            let review =
                restore_review(&local, source.row, source.family, &originals.read(source.index)?)?;
            let local_through =
                clocks::compare_review(room, &review, &review_rows, source.row, false)?
                    .local_through;
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
        participant_raster_bindings: participant_bindings
            .into_iter()
            .map(|(reference, content_asset)| ServerAssetResolution { reference, content_asset })
            .collect(),
    })
}

fn verify_document_source(
    room: &Room,
    participants: &RoomParticipantInventoryMetadata,
    originals: &RetainedJournals,
    document_clocks: &BTreeMap<&str, &RecoveryDocumentClock>,
    review_rows: &BTreeMap<&str, &RecoveryReviewRegistration>,
    source: &DocumentSource<'_>,
    participant_bindings: &mut BTreeMap<VersionAssetReference, String>,
) -> Result<(RichReplica, RelaySegmentClientJournalHead, BTreeSet<VersionAssetReference>)> {
    let index = source.index;
    let writer = &source.row.clock.writer;
    let pin = &originals.pins()[index];
    let archive = if matches!(source.input, DocumentInput::Participant(_)) {
        let slice = originals.part(index)?;
        Some((ParticipantArchive::open(slice, &pin.owner)?, slice))
    } else {
        None
    };
    let input;
    let stores;
    let (local, paired) = match source.input {
        DocumentInput::Native(family) => {
            (restore_document(room, family, &originals.read(index)?)?, None)
        }
        DocumentInput::Paired(row) => {
            input = originals.read(index)?;
            let pair = PairedRecord::read(&input, participants, writer, row)?;
            let document = restore_document(room, pair.family()?, &pair.document_checkpoint_json)?;
            (document, Some((row, PairedInput::Original(Box::new(pair)))))
        }
        DocumentInput::Delivery(row) => {
            input = originals.read(index)?;
            let record = DeliveryRecord::read(&input, participants, source.row, row)?;
            (record.document(room)?, Some((row, PairedInput::Delivery(Box::new(record)))))
        }
        DocumentInput::Participant(row) => {
            let (archive, slice) =
                archive.as_ref().ok_or(Error::Contract("participant archive absent"))?;
            let native = archive.read_records(*slice)?;
            stores = native.stores;
            let sections =
                archive.delivery_sections(native.document, native.review, native.versions, &stores);
            let record = DeliveryRecord::from_sections(sections, participants, source.row, row)?;
            (record.document(room)?, Some((row, PairedInput::Delivery(Box::new(record)))))
        }
    };
    if local.writer() != writer || local.document_id() != room.replica.document_id() {
        return Err(Error::Contract("client journal document binding differs"));
    }
    let local_through = clocks::compare_document(
        room,
        &local,
        document_clocks,
        &source.row.clock,
        source.row.observer,
        false,
    )?
    .local_through;
    let mut document_assets = BTreeSet::new();
    retain_assets(&local, &mut document_assets)?;
    let paired_review = if let Some((row, pair)) = paired {
        let local_through =
            verify_paired_review(room, &local, review_rows, row, &pair, &mut document_assets)?;
        Some(RelaySegmentPairedReviewHead {
            local_through,
            accepted_through: row.clock.through.clone(),
        })
    } else {
        None
    };
    if let Some((archive, _)) = &archive {
        check_participant_raster_bindings(archive, &document_assets, participant_bindings)?;
    }
    let head = RelaySegmentClientJournalHead {
        pin: pin.clone(),
        local_through,
        accepted_through: source.row.clock.through.clone(),
        paired_review,
    };
    Ok((local, head, document_assets))
}

fn check_participant_raster_bindings(
    archive: &ParticipantArchive,
    required: &BTreeSet<VersionAssetReference>,
    covered: &mut BTreeMap<VersionAssetReference, String>,
) -> Result<()> {
    if archive.bindings().len() != required.len() {
        return Err(Error::Contract("participant archive raster dependencies differ"));
    }
    for (entry, reference) in archive.bindings().iter().zip(required) {
        if entry.asset != reference.asset || entry.generation != reference.generation {
            return Err(Error::Contract("participant archive raster dependencies differ"));
        }
        if covered
            .insert(reference.clone(), entry.content_asset.clone())
            .is_some_and(|before| before != entry.content_asset)
        {
            return Err(Error::Contract("participant archives disagree on a raster binding"));
        }
    }
    Ok(())
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
    let through = clocks::compare_review(room, &review, accepted, owner, false)?.local_through;
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
    restore_document_with_profile(&room.profile, room.replica.document_id(), family, json)
}

pub(super) fn restore_document_with_profile(
    profile: &SharedRichProfile,
    id: &str,
    family: RelaySegmentDocumentJournalFamily,
    json: &str,
) -> Result<RichReplica> {
    use RelaySegmentDocumentJournalFamily as Family;
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

pub(super) fn restore_review(
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

pub(super) fn position(through: &str) -> Result<u64> {
    let value: u64 =
        through.parse().map_err(|_| Error::Contract("native journal clock position"))?;
    if value.to_string() != through {
        return Err(Error::Contract("native journal clock position"));
    }
    Ok(value)
}
