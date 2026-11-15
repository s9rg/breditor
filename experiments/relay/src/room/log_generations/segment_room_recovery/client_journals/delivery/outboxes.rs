//! Check exact retained packet bodies, accepted facts and all native raster dependencies.
use super::super::{
    paired::required_nullable,
    verify::{insert_assets, position},
};
use super::{progress::DocumentBinding, raw_budget};
use crate::{Error, RecoveryServerAuthorKind, Result, Room, RoomParticipantInventoryMetadata};
use breditor_collab_feasibility::rich_replica::{
    PacketAssetIdentity, PacketAssetOutcome, PacketAssetReferences, ReviewedHistoryIdentity,
    RichReplica, VersionAssetReference,
};
use serde::Deserialize;
use serde_json::{Value, value::RawValue};
use std::collections::BTreeSet;

const STORE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct StoreBindings<'a> {
    #[serde(borrow, deserialize_with = "required_nullable")]
    suggestions: Option<SuggestionSelection<'a>>,
    #[serde(deserialize_with = "required_nullable")]
    revisions: Option<RevisionSelection>,
    #[serde(borrow, deserialize_with = "required_nullable")]
    versions: Option<&'a RawValue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SuggestionSelection<'a> {
    #[serde(borrow)]
    identity: &'a RawValue,
    #[serde(deserialize_with = "required_nullable")]
    owned_history: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RevisionSelection {
    binding: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Stores<'a> {
    #[serde(borrow, deserialize_with = "required_nullable")]
    suggestions: Option<&'a RawValue>,
    #[serde(borrow, deserialize_with = "required_nullable")]
    revisions: Option<&'a RawValue>,
    #[serde(borrow, deserialize_with = "required_nullable")]
    versions: Option<&'a RawValue>,
}

#[derive(Clone, Copy, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Origin {
    Local,
    Remote,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SuggestionStore<'a> {
    format: String,
    format_version: u32,
    #[serde(borrow)]
    identity: &'a RawValue,
    retained: Vec<SuggestionRow>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SuggestionRow {
    packet: String,
    origin: Origin,
    publish: bool,
    #[serde(deserialize_with = "required_nullable")]
    publication: Option<Value>,
    #[serde(deserialize_with = "required_nullable")]
    intent: Option<Intent>,
    #[serde(deserialize_with = "required_nullable")]
    decision: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Intent {
    #[serde(rename = "requested")]
    _requested: Decision,
    queued_at_ms: String,
    retry: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Decision {
    Accept,
    Reject,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevisionStore<'a> {
    format: String,
    format_version: u32,
    #[serde(borrow)]
    identity: &'a RawValue,
    binding: String,
    retained: Vec<RevisionRow>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevisionRow {
    previous_packet: String,
    packet: String,
    retry: bool,
    #[serde(deserialize_with = "required_nullable")]
    receipt: Option<Value>,
    #[serde(deserialize_with = "required_nullable")]
    conflict: Option<Conflict>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Conflict {
    decision: Value,
    #[serde(deserialize_with = "required_nullable")]
    successor: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VersionStore<'a> {
    format: String,
    format_version: u32,
    #[serde(borrow)]
    identity: &'a RawValue,
    #[serde(deserialize_with = "required_nullable")]
    catalog: Option<Catalog>,
    packets: Vec<VersionRow>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Catalog {
    through: String,
    entries: Vec<Value>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VersionRow {
    packet: String,
    origin: Origin,
    publish: bool,
    #[serde(deserialize_with = "required_nullable")]
    accepted: Option<Value>,
}

impl<'a> Stores<'a> {
    pub fn from_sections(
        suggestions: Option<&'a str>,
        revisions: Option<&'a str>,
        versions: Option<&'a str>,
    ) -> Result<Self> {
        Ok(Self {
            suggestions: suggestions.map(serde_json::from_str).transpose()?,
            revisions: revisions.map(serde_json::from_str).transpose()?,
            versions: versions.map(serde_json::from_str).transpose()?,
        })
    }

    pub fn check_bindings(
        &self,
        selected: &StoreBindings<'_>,
        document: &DocumentBinding,
        inventory: &RoomParticipantInventoryMetadata,
        reviewed: Option<&ReviewedHistoryIdentity>,
    ) -> Result<()> {
        if self.suggestions.is_some() != selected.suggestions.is_some()
            || self.revisions.is_some() != selected.revisions.is_some()
            || self.versions.is_some() != selected.versions.is_some()
            || selected.revisions.is_some() && selected.suggestions.is_none()
        {
            return Err(Error::Contract("client delivery outbox selection differs"));
        }
        if let Some(selection) = &selected.suggestions {
            let effect = inventory
                .server_authors
                .iter()
                .find(|row| row.kind == RecoveryServerAuthorKind::SuggestionEffect)
                .ok_or(Error::Contract("delivery proposal effect writer missing"))?;
            check_identity(
                selection.identity,
                document,
                inventory.suggestions_binding.as_deref(),
                Some(&effect.clock.writer),
            )?;
            match (selection.owned_history.as_deref(), reviewed) {
                (None, None) => (),
                (Some("reviewed-v1"), Some(reviewed))
                    if reviewed.effect_writer == effect.clock.writer
                        && reviewed.principal.as_str() == document.principal
                        && Some(reviewed.binding.as_str())
                            == inventory.suggestions_binding.as_deref() => {}
                _ => {
                    return Err(Error::Contract(
                        "client delivery reviewed proposal policy differs",
                    ));
                }
            }
            let queue = suggestion_store(self.suggestions.ok_or(Error::NeedsRecovery)?)?;
            let format = if reviewed.is_some() {
                "breditor/shared-owned-suggestion-queue"
            } else {
                "breditor/shared-suggestion-queue"
            };
            if queue.format != format || queue.identity.get() != selection.identity.get() {
                return Err(Error::Contract("client delivery proposal queue identity differs"));
            }
            if let Some(revision) = &selected.revisions {
                let queue = revision_store(self.revisions.ok_or(Error::NeedsRecovery)?)?;
                if Some(revision.binding.as_str()) != inventory.revisions_binding.as_deref()
                    || revision.binding != queue.binding
                    || queue.identity.get() != selection.identity.get()
                {
                    return Err(Error::Contract("client delivery revision queue identity differs"));
                }
            }
        }
        if let Some(identity) = selected.versions {
            check_identity(identity, document, inventory.versions_binding.as_deref(), None)?;
            let cache = version_store(self.versions.ok_or(Error::NeedsRecovery)?)?;
            if cache.identity.get() != identity.get() {
                return Err(Error::Contract("client delivery version cache identity differs"));
            }
        }
        Ok(())
    }

    pub fn verify(
        &self,
        room: &Room,
        document: &RichReplica,
        assets: &mut BTreeSet<VersionAssetReference>,
    ) -> Result<()> {
        if let Some(raw) = self.suggestions {
            verify_suggestions(room, document, suggestion_store(raw)?.retained, assets)?;
        }
        if let Some(raw) = self.revisions {
            verify_revisions(room, document, revision_store(raw)?.retained, assets)?;
        }
        if let Some(raw) = self.versions {
            verify_versions(room, document, version_store(raw)?, assets)?;
        }
        Ok(())
    }
}

fn check_identity(
    raw: &RawValue,
    document: &DocumentBinding,
    binding: Option<&str>,
    effect: Option<&str>,
) -> Result<()> {
    let binding =
        binding.ok_or(Error::Contract("client delivery outbox has no accepted server binding"))?;
    let mut expected = serde_json::json!({
        "binding": binding, "endpoint": document.endpoint, "principal": document.principal,
        "room": document.room, "documentWriter": document.writer,
    });
    if document.atomic() {
        expected["writerTransport"] = "atomic-v2".into();
    }
    if let Some(effect) = effect {
        if !document.atomic() {
            return Err(Error::Contract("client delivery proposal requires atomic transport"));
        }
        expected["effectWriter"] = effect.into();
    }
    if serde_json::from_str::<Value>(raw.get())? != expected {
        return Err(Error::Contract("client delivery outbox binding differs"));
    }
    Ok(())
}

fn suggestion_store(raw: &RawValue) -> Result<SuggestionStore<'_>> {
    raw_budget(raw, STORE_BYTES)?;
    let value: SuggestionStore<'_> = serde_json::from_str(raw.get())?;
    if value.format_version != 1 || value.retained.len() > 256 {
        return Err(Error::Contract("client delivery proposal queue version or budget"));
    }
    Ok(value)
}

fn revision_store(raw: &RawValue) -> Result<RevisionStore<'_>> {
    raw_budget(raw, STORE_BYTES)?;
    let value: RevisionStore<'_> = serde_json::from_str(raw.get())?;
    if value.format != "breditor/shared-suggestion-revisions"
        || value.format_version != 1
        || value.retained.len() > 256
    {
        return Err(Error::Contract("client delivery revision queue format or budget"));
    }
    Ok(value)
}

fn version_store(raw: &RawValue) -> Result<VersionStore<'_>> {
    raw_budget(raw, STORE_BYTES)?;
    let value: VersionStore<'_> = serde_json::from_str(raw.get())?;
    if value.format != "breditor/shared-version-catalog-cache"
        || value.format_version != 1
        || value.packets.len() > 32
    {
        return Err(Error::Contract("client delivery version cache format or budget"));
    }
    Ok(value)
}

fn complete_assets(
    packet: PacketAssetReferences,
    assets: &mut BTreeSet<VersionAssetReference>,
) -> Result<PacketAssetIdentity> {
    let PacketAssetOutcome::Ready { references } = packet.outcome else {
        return Err(Error::Contract(
            "client delivery retained packet is missing native dependencies",
        ));
    };
    insert_assets(assets, references)?;
    Ok(packet.packet)
}

fn check_publish(origin: Origin, publish: bool, accepted: bool) -> Result<()> {
    if origin == Origin::Remote && !accepted || publish && (origin != Origin::Local || accepted) {
        return Err(Error::Contract("client delivery retained packet intent differs"));
    }
    Ok(())
}

fn verify_suggestions(
    room: &Room,
    doc: &RichReplica,
    rows: Vec<SuggestionRow>,
    assets: &mut BTreeSet<VersionAssetReference>,
) -> Result<()> {
    let observed = doc.observe()?;
    let mut seen = BTreeSet::new();
    for row in rows {
        check_publish(row.origin, row.publish, row.publication.is_some())?;
        if let Some(intent) = &row.intent {
            position(&intent.queued_at_ms)?;
        }
        let packet = doc.document_suggestion_asset_references_guarded(&observed, &row.packet)?;
        let PacketAssetIdentity::Suggestion { id } = complete_assets(packet, assets)? else {
            return Err(Error::NeedsRecovery);
        };
        if !seen.insert(id.clone())
            || row.decision.is_some()
                && (row.publication.is_none() || row.intent.is_some_and(|intent| intent.retry))
        {
            return Err(Error::Contract(
                "client delivery proposal publication or decision differs",
            ));
        }
        if let Some(saved) = row.publication {
            let actual = room.document_suggestion(&room.owner, &id)?.ok_or(Error::Contract(
                "client delivery proposal receipt has no original acceptance",
            ))?;
            if serde_json::to_value(actual.publication)? != saved
                || room.document_suggestion_packet(&room.owner, &id)?.as_deref()
                    != Some(&row.packet)
                || row.decision.is_some()
                    && row.decision != actual.decision.map(serde_json::to_value).transpose()?
            {
                return Err(Error::Contract("client delivery proposal receipt differs"));
            }
        }
    }
    Ok(())
}

fn verify_revisions(
    room: &Room,
    doc: &RichReplica,
    rows: Vec<RevisionRow>,
    assets: &mut BTreeSet<VersionAssetReference>,
) -> Result<()> {
    let observed = doc.observe()?;
    let mut seen = BTreeSet::new();
    for row in rows {
        let packet = doc.document_suggestion_revision_asset_references_guarded(
            &observed,
            &row.previous_packet,
            &row.packet,
        )?;
        let PacketAssetIdentity::SuggestionRevision { id, previous_suggestion_id, .. } =
            complete_assets(packet, assets)?
        else {
            return Err(Error::NeedsRecovery);
        };
        if !seen.insert(id.clone())
            || row.receipt.is_some() && (row.retry || row.conflict.is_some())
            || row.conflict.is_some() && row.retry
        {
            return Err(Error::Contract("client delivery revision intent differs"));
        }
        if let Some(saved) = row.receipt
            && (Some(saved)
                != room
                    .document_suggestion_revision(&room.owner, &id)?
                    .map(serde_json::to_value)
                    .transpose()?
                || room.document_suggestion_revision_packet(&room.owner, &id)?.as_deref()
                    != Some(&row.packet))
        {
            return Err(Error::Contract("client delivery revision receipt differs"));
        }
        if let Some(conflict) = row.conflict {
            let actual = room
                .document_suggestion(&room.owner, &previous_suggestion_id)?
                .and_then(|proposal| proposal.decision)
                .map(serde_json::to_value)
                .transpose()?;
            let successor = room
                .document_suggestion_successor(&room.owner, &previous_suggestion_id)?
                .map(serde_json::to_value)
                .transpose()?;
            if actual != Some(conflict.decision)
                || conflict.successor.is_some_and(|expected| Some(expected) != successor)
            {
                return Err(Error::Contract("client delivery revision conflict differs"));
            }
        }
    }
    Ok(())
}

fn verify_versions(
    room: &Room,
    doc: &RichReplica,
    store: VersionStore<'_>,
    assets: &mut BTreeSet<VersionAssetReference>,
) -> Result<()> {
    let observed = doc.observe()?;
    let mut admitted = BTreeSet::new();
    for row in store.packets {
        check_publish(row.origin, row.publish, row.accepted.is_some())?;
        let packet = doc.document_version_asset_references_guarded(&observed, &row.packet)?;
        let PacketAssetIdentity::Version { id } = complete_assets(packet, assets)? else {
            return Err(Error::NeedsRecovery);
        };
        if !admitted.insert(id.clone()) {
            return Err(Error::Contract("duplicate client delivery cached version"));
        }
        if let Some(saved) = row.accepted
            && (room.recovery_version_entry(&id)? != Some(saved)
                || room.document_version_packet(&room.owner, &id)?.as_deref() != Some(&row.packet))
        {
            return Err(Error::Contract("client delivery cached version receipt differs"));
        }
    }
    if let Some(catalog) = store.catalog {
        room.check_recovery_version_catalog(&catalog.through, &catalog.entries)?;
        for entry in catalog.entries {
            let id = entry["version"]["id"].as_str().ok_or(Error::NeedsRecovery)?;
            if !admitted.contains(id) {
                return Err(Error::Contract(
                    "client delivery accepted catalog packet body missing",
                ));
            }
        }
    }
    Ok(())
}
