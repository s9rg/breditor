//! Admit the original independent-delivery recovery record, with its native histories and stores.
mod outboxes;
mod progress;

use super::{
    MAX_DELIVERY_FILE, RelaySegmentDocumentJournalFamily as DocumentFamily,
    RelaySegmentReviewJournalFamily as ReviewFamily,
    paired::{History, RangePolicy, Selection, document_family, required_nullable},
    verify::restore_document,
};
use crate::{
    Error, RecoveryDocumentRegistration, RecoveryReviewRegistration, Result, Room,
    RoomParticipantInventoryMetadata,
};
use breditor_collab_feasibility::{
    review::ReviewSession,
    rich_replica::{ReviewedHistoryIdentity, RichReplica, VersionAssetReference},
};
use serde::Deserialize;
use serde_json::value::RawValue;
use std::collections::BTreeSet;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DeliveryRecord<'a> {
    format: String,
    format_version: u32,
    source: NativeSource,
    relay: progress::RelayProgress,
    #[serde(borrow)]
    retained_binding: outboxes::StoreBindings<'a>,
    #[serde(borrow)]
    retained: outboxes::Stores<'a>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeSource {
    format: String,
    format_version: u32,
    identity: SourceIdentity,
    document_checkpoint: String,
    review_checkpoint: String,
    versions: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceIdentity {
    native: NativeIdentity,
    document_history: HistoryLane,
    review_history: HistoryLane,
    review: ReviewIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeIdentity {
    room: String,
    writer: String,
    rich_language: u32,
    history: History,
    range_editing: RangePolicy,
    selection_editing: Selection,
    #[serde(deserialize_with = "required_nullable")]
    search_history: Option<SearchHistory>,
    #[serde(deserialize_with = "required_nullable")]
    reviewed_history: Option<ReviewedHistoryIdentity>,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum HistoryLane {
    Original,
    SegmentedV1,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum SearchHistory {
    SearchV1,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReviewIdentity {
    actor: String,
    principal: String,
}

pub(super) struct DeliverySections<'a> {
    pub identity: &'a RawValue,
    pub binding: &'a RawValue,
    pub retained_binding: &'a RawValue,
    pub document: String,
    pub review: String,
    pub versions: Vec<String>,
    pub relay: &'a str,
    pub suggestions: Option<&'a str>,
    pub revisions: Option<&'a str>,
    pub version_store: Option<&'a str>,
}

impl<'a> DeliveryRecord<'a> {
    pub fn read(
        input: &'a str,
        participants: &RoomParticipantInventoryMetadata,
        document: &RecoveryDocumentRegistration,
        review: &RecoveryReviewRegistration,
    ) -> Result<Self> {
        if input.len() as u64 > MAX_DELIVERY_FILE {
            return Err(Error::Contract("client delivery recovery byte budget"));
        }
        let value: Self = serde_json::from_str(input)?;
        value.check(participants, document, review)?;
        Ok(value)
    }

    pub fn from_sections(
        sections: DeliverySections<'a>,
        participants: &RoomParticipantInventoryMetadata,
        document: &RecoveryDocumentRegistration,
        review: &RecoveryReviewRegistration,
    ) -> Result<Self> {
        #[derive(Deserialize)]
        struct Relay<'a> {
            #[serde(borrow)]
            binding: &'a RawValue,
        }
        let relay: Relay<'_> = serde_json::from_str(sections.relay)?;
        if relay.binding.get() != sections.binding.get() {
            return Err(Error::Contract("participant archive relay identity differs"));
        }
        let value = Self {
            format: "breditor/shared-independent-delivery-recovery".into(),
            format_version: 1,
            source: NativeSource {
                format: "breditor/shared-independent-history-recovery".into(),
                format_version: 1,
                identity: serde_json::from_str(sections.identity.get())?,
                document_checkpoint: sections.document,
                review_checkpoint: sections.review,
                versions: sections.versions,
            },
            relay: serde_json::from_str(sections.relay)?,
            retained_binding: serde_json::from_str(sections.retained_binding.get())?,
            retained: outboxes::Stores::from_sections(
                sections.suggestions,
                sections.revisions,
                sections.version_store,
            )?,
        };
        value.check(participants, document, review)?;
        Ok(value)
    }

    fn check(
        &self,
        participants: &RoomParticipantInventoryMetadata,
        document: &RecoveryDocumentRegistration,
        review: &RecoveryReviewRegistration,
    ) -> Result<()> {
        let value = self;
        let identity = &value.source.identity;
        let native = &identity.native;
        if value.format != "breditor/shared-independent-delivery-recovery"
            || value.format_version != 1
            || value.source.format != "breditor/shared-independent-history-recovery"
            || value.source.format_version != 1
            || native.room != participants.room.document
            || native.writer != document.clock.writer
            || native.rich_language != participants.rich_language
            || identity.review.actor != review.clock.actor.as_str()
            || identity.review.principal != review.principal
            || value.source.versions.len() > 32
            || value.source.versions.iter().any(|row| row.len() > 4 * 1024 * 1024)
        {
            return Err(Error::Contract("client delivery recovery native identity or policy"));
        }
        document_family(native.history, native.range_editing, native.selection_editing)?;
        value.relay.check_binding(participants, document, review)?;
        value.retained.check_bindings(
            &value.retained_binding,
            &value.relay.binding.document,
            participants,
            native.reviewed_history.as_ref(),
        )?;
        Ok(())
    }

    pub fn document(&self, room: &Room) -> Result<RichReplica> {
        let identity = &self.source.identity;
        let native = &identity.native;
        let family = match identity.document_history {
            HistoryLane::SegmentedV1 => DocumentFamily::Segmented,
            HistoryLane::Original if native.search_history.is_some() => DocumentFamily::Search,
            HistoryLane::Original if native.reviewed_history.is_some() => DocumentFamily::Reviewed,
            HistoryLane::Original => {
                document_family(native.history, native.range_editing, native.selection_editing)?
            }
        };
        let local = restore_document(room, family, &self.source.document_checkpoint)?;
        if local.reviewed_history_identity() != native.reviewed_history.as_ref()
            || local.search_history_enabled() != native.search_history.is_some()
            || local.typing_history_enabled() != (native.history == History::TypingV1)
            || local.general_ranges_enabled() != (native.range_editing == RangePolicy::GeneralV1)
            || local.document_selection_enabled()
                != (native.selection_editing == Selection::DocumentV1)
        {
            return Err(Error::Contract("client delivery native history policy differs"));
        }
        Ok(local)
    }

    pub fn review(&self) -> (ReviewFamily, &str) {
        let family = match self.source.identity.review_history {
            HistoryLane::Original => ReviewFamily::Original,
            HistoryLane::SegmentedV1 => ReviewFamily::Segmented,
        };
        (family, &self.source.review_checkpoint)
    }

    pub fn versions(&self) -> &[String] {
        &self.source.versions
    }

    pub fn verify(
        &self,
        room: &Room,
        document: &RichReplica,
        review: &ReviewSession,
        owner: &RecoveryReviewRegistration,
        assets: &mut BTreeSet<VersionAssetReference>,
    ) -> Result<()> {
        self.relay.check_progress(room, document, review, owner)?;
        self.retained.verify(room, document, assets)
    }
}

fn raw_budget(record: &RawValue, maximum: usize) -> Result<()> {
    if record.get().len() > maximum {
        return Err(Error::Contract("client delivery record byte budget"));
    }
    Ok(())
}
