//! Admit the existing standalone paired SDK archive and check its nonsecret review progress.
use super::{RelaySegmentDocumentJournalFamily as Family, verify::position};
use crate::{
    Error, RecoveryReviewRegistration, Result, ReviewCursor, Room,
    RoomParticipantInventoryMetadata, archive_digest::ArchiveDigest,
};
use breditor_collab_feasibility::review::{ReviewPrincipalId, ReviewSession, ReviewWriterClock};
use serde::{Deserialize, Deserializer, Serialize};
use std::fmt::Write;

pub(super) const MAX_PAIRED_ARCHIVE: u64 = 65 * 1024 * 1024;
const MAX_RECORD: usize = 32 * 1024 * 1024;
const MAX_PACKET: usize = 4 * 1024 * 1024;
const ARCHIVE_FORMAT: &str = "breditor/shared-paired-session-backup";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    format: String,
    format_version: u32,
    identity: Identity,
    record_json: String,
    sha256: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Identity {
    room: String,
    writer: String,
    rich_language: u32,
    history: History,
    range_editing: RangePolicy,
    selection_editing: Selection,
    #[serde(deserialize_with = "required_nullable")]
    search_history: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum History {
    Explicit,
    TypingV1,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum RangePolicy {
    Original,
    GeneralV1,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Selection {
    Original,
    DocumentV1,
}

#[derive(Deserialize, PartialEq, Eq)]
enum RecordFormat {
    #[serde(rename = "breditor/shared-review-relay-checkpoint-record")]
    Writer,
    #[serde(rename = "breditor/shared-review-observer-checkpoint-record")]
    Observer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PairedRecord {
    format: RecordFormat,
    format_version: u32,
    history: History,
    range_editing: RangePolicy,
    selection_editing: Selection,
    rich_language: u32,
    review_actor: String,
    principal: String,
    pub document_checkpoint_json: String,
    pub review_checkpoint_json: String,
    pub versions: Vec<String>,
    relay: RelayBinding,
    progress: Progress,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RelayBinding {
    pub endpoint: String,
    pub principal: String,
    pub room: String,
    pub actor: String,
    pub binding: String,
    pub document_writer: String,
    #[serde(default, deserialize_with = "present")]
    pub writer_transport: Option<WriterTransport>,
    #[serde(default, deserialize_with = "present")]
    pub review_editing: Option<ReviewEditing>,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum WriterTransport {
    AtomicV2,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum ReviewEditing {
    ReadOnly,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Progress {
    #[serde(deserialize_with = "required_nullable")]
    pub cursor: Option<ReviewCursor>,
    #[serde(deserialize_with = "required_nullable")]
    pub accepted: Option<ReviewWriterClock>,
    #[serde(deserialize_with = "required_nullable")]
    pub sequence: Option<String>,
}

pub(super) fn required_nullable<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> std::result::Result<Option<T>, D::Error> {
    Option::<T>::deserialize(deserializer)
}

pub(super) fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> std::result::Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

impl PairedRecord {
    pub fn read(
        archive: &str,
        participants: &RoomParticipantInventoryMetadata,
        registered_writer: &str,
        review: &RecoveryReviewRegistration,
    ) -> Result<Self> {
        if archive.len() as u64 > MAX_PAIRED_ARCHIVE {
            return Err(Error::Contract("paired client backup byte budget"));
        }
        let envelope: Envelope = serde_json::from_str(archive)?;
        let id = &envelope.identity;
        if envelope.format != ARCHIVE_FORMAT
            || envelope.format_version != 1
            || envelope.record_json.len() > MAX_RECORD
            || id.writer != registered_writer
            || id.room != participants.room.document
            || id.rich_language != participants.rich_language
            || id.search_history.is_some()
        {
            return Err(Error::Contract("paired client backup identity or byte budget"));
        }
        envelope.check_digest()?;
        let record: Self = serde_json::from_str(&envelope.record_json)?;
        record.check(id, participants, review)?;
        Ok(record)
    }

    fn check(
        &self,
        id: &Identity,
        participants: &RoomParticipantInventoryMetadata,
        review: &RecoveryReviewRegistration,
    ) -> Result<()> {
        let binding = &participants
            .review
            .as_ref()
            .ok_or(Error::Contract("paired client backup room has no review log"))?
            .binding;
        let transport = if self.relay.writer_transport.is_some() { 2 } else { 1 };
        let observer = self.format == RecordFormat::Observer;
        let relay = &self.relay;
        if self.format_version != 1
            || self.rich_language != id.rich_language
            || self.history != id.history
            || self.range_editing != id.range_editing
            || self.selection_editing != id.selection_editing
            || self.principal != review.principal
            || self.review_actor != review.clock.actor.as_str()
            || relay.principal != self.principal
            || relay.actor != self.review_actor
            || relay.binding != *binding
            || relay.room != id.room
            || relay.document_writer != id.writer
            || transport != participants.room.writer_transport_version
            || observer != review.observer
            || observer != relay.review_editing.is_some()
            || self.versions.len() > 32
            || self.versions.iter().any(|packet| packet.len() > MAX_PACKET)
        {
            return Err(Error::Contract("paired client backup binding or policy differs"));
        }
        check_endpoint(&relay.endpoint)
    }

    pub fn family(&self) -> Result<Family> {
        document_family(self.history, self.range_editing, self.selection_editing)
    }

    pub fn check_progress(
        &self,
        room: &Room,
        local: &ReviewSession,
        own: &RecoveryReviewRegistration,
    ) -> Result<()> {
        self.progress.check(room, local, own)
    }
}

pub(super) fn document_family(
    history: History,
    range: RangePolicy,
    selection: Selection,
) -> Result<Family> {
    use {History as H, RangePolicy as R, Selection as S};
    match (history, range, selection) {
        (H::Explicit, R::Original, S::Original) => Ok(Family::Original),
        (H::TypingV1, R::Original, S::Original) => Ok(Family::Typing),
        (H::Explicit, R::GeneralV1, S::Original) => Ok(Family::General),
        (H::TypingV1, R::GeneralV1, S::Original) => Ok(Family::GeneralTyping),
        (H::Explicit, R::GeneralV1, S::DocumentV1) => Ok(Family::Document),
        (H::TypingV1, R::GeneralV1, S::DocumentV1) => Ok(Family::DocumentTyping),
        (_, R::Original, S::DocumentV1) => {
            Err(Error::Contract("paired client backup selection policy"))
        }
    }
}

pub(super) fn check_endpoint(value: &str) -> Result<()> {
    let endpoint: axum::http::Uri =
        value.parse().map_err(|_| Error::Contract("paired client backup endpoint"))?;
    if !matches!(endpoint.scheme_str(), Some("ws" | "wss"))
        || endpoint.authority().is_none_or(|authority| authority.as_str().contains('@'))
        || endpoint.query().is_some()
        || value.contains('#')
    {
        return Err(Error::Contract("paired client backup endpoint"));
    }
    Ok(())
}

impl Progress {
    pub fn check(
        &self,
        room: &Room,
        local: &ReviewSession,
        own: &RecoveryReviewRegistration,
    ) -> Result<()> {
        if let Some(cursor) = &self.cursor {
            for prefix in room.review_cursor_proof(&room.owner, cursor)?.prefixes {
                if local.writer_clock_at(
                    &prefix.clock.actor,
                    &prefix.principal,
                    position(&prefix.clock.through)?,
                )? != prefix.clock
                {
                    return Err(Error::Contract(
                        "paired client review cursor skips unretained work",
                    ));
                }
            }
        }
        let Some(saved) = &self.accepted else {
            if self.sequence.is_some() {
                return Err(Error::Contract("paired client review sequence lacks a receipt"));
            }
            return Ok(());
        };
        let through = position(&saved.through)?;
        let principal = ReviewPrincipalId::try_new(&own.principal)?;
        let accepted = &room
            .review
            .as_ref()
            .ok_or(Error::Contract("paired client review log is absent"))?
            .session;
        if saved.actor != own.clock.actor
            || through > position(&own.clock.through)?
            || local.writer_clock_at(&saved.actor, &principal, through)? != *saved
            || accepted.writer_clock_at(&saved.actor, &principal, through)? != *saved
        {
            return Err(Error::Contract("paired client review acknowledgement differs"));
        }
        if let Some(sequence) = &self.sequence
            && room.recovery_review_acceptance_sequence(&saved.actor, through)?
                != position(sequence)?
        {
            return Err(Error::Contract("paired client review receipt sequence differs"));
        }
        Ok(())
    }
}

impl Envelope {
    fn check_digest(&self) -> Result<()> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Body<'a> {
            format: &'a str,
            format_version: u32,
            identity: &'a Identity,
            record_json: &'a str,
        }
        let mut digest = ArchiveDigest::new(MAX_PAIRED_ARCHIVE);
        serde_json::to_writer(
            &mut digest,
            &Body {
                format: ARCHIVE_FORMAT,
                format_version: self.format_version,
                identity: &self.identity,
                record_json: &self.record_json,
            },
        )?;
        let mut hex = String::with_capacity(64);
        for byte in digest.finish().0 {
            let _ = write!(hex, "{byte:02x}");
        }
        if hex != self.sha256 {
            return Err(Error::Contract("paired client backup digest differs"));
        }
        Ok(())
    }
}
