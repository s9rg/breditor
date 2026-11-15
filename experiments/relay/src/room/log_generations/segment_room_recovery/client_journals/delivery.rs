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
        Ok(value)
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
