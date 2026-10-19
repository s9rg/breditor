//! Conservative image-binding closure over complete retained causal operations, never the DOM.
use super::{RichReplica, SharedObservation, model::Patch};
use crate::{Error, register::read_contribution};
use breditor_core::rich_content::{
    RICH_ASSET_REFERENCE_MAX_BINDINGS, RichAssetReference, inspect_rich_asset_references,
};
use loro::{ContainerID, ContainerType, IdSpan, JsonOpContent, LoroDoc, LoroValue};
use serde_json::Value;
use std::collections::BTreeSet;

/// Separate read-work ceiling, not an increase of any native journal or operation budget.
pub const SHARED_ASSET_REFERENCE_MAX_CAUSAL_ATOMS: usize = 16 * 1024 * 1024;
const CHUNK: i32 = 1024;
const MAX_METADATA_BYTES: usize = 64 * 1024;

#[cfg(test)]
#[path = "retained_asset_reference_tests.rs"]
mod tests;

fn insert(
    output: &mut BTreeSet<RichAssetReference>,
    properties: &serde_json::Map<String, Value>,
) -> Result<(), Error> {
    let a = properties.get("breditor/asset-id");
    let g = properties.get("breditor/asset-generation");
    let (Some(a), Some(g)) = (a, g) else {
        return if a.is_none() && g.is_none() {
            Ok(())
        } else {
            Err(Error::Contract("retained asset binding pair"))
        };
    };
    let reference = RichAssetReference::try_new(
        a.as_str().ok_or(Error::Contract("retained asset identity"))?,
        g.as_str().ok_or(Error::Contract("retained asset generation"))?,
    )
    .map_err(|_| Error::Contract("retained asset identity syntax"))?;
    output.insert(reference);
    if output.len() > RICH_ASSET_REFERENCE_MAX_BINDINGS {
        return Err(Error::Limit("retained asset reference count"));
    }
    Ok(())
}

fn metadata_owner(container: &ContainerID) -> bool {
    container.parse_mergeable().is_some_and(|(parent, _, kind)| {
        kind == ContainerType::Map
            && parent == ContainerID::new_root("metadata", ContainerType::Map)
    })
}
fn metadata_effects(container: &ContainerID) -> bool {
    container.parse_mergeable().is_some_and(|(owner, field, kind)| {
        kind == ContainerType::Map && field == "effects" && metadata_owner(&owner)
    })
}
fn contribution_field(container: &ContainerID) -> Option<String> {
    let (effects, field, kind) = container.parse_mergeable()?;
    (kind == ContainerType::Map && metadata_effects(&effects)).then_some(field)
}

fn check_metadata_slot(container: &ContainerID, key: &str, value: &LoroValue) -> Result<(), Error> {
    let structural_slot = container == &ContainerID::new_root("metadata", ContainerType::Map)
        || metadata_owner(container) && key == "effects"
        || metadata_effects(container);
    if structural_slot
        && loro_internal::loro_common::parse_mergeable_marker(container, key, value)
            != Some(ContainerType::Map)
    {
        // Materialization can also read aliased/literal maps. This scanner does not follow
        // those graphs, so refuse completeness instead of skipping their hidden bindings.
        return Err(Error::Contract("retained asset metadata topology"));
    }
    Ok(())
}

fn contribution_patch<'a>(
    doc: &LoroDoc,
    key: &str,
    value: &'a LoroValue,
) -> Result<&'a str, Error> {
    let LoroValue::Map(entry) = value else {
        return Err(Error::Contract("retained asset contribution map"));
    };
    if entry.len() != 4 {
        return Err(Error::Contract("retained asset contribution fields"));
    }
    let string = |field: &str, maximum: usize| {
        entry
            .get(field)
            .and_then(LoroValue::as_string)
            .filter(|text| text.len() <= maximum)
            .ok_or(Error::Contract("retained asset contribution scalar"))
    };
    let lamport = string("lamport", 20)?;
    let writer = string("writer", 20)?;
    let patch = entry
        .get("value")
        .and_then(LoroValue::as_string)
        .ok_or(Error::Contract("retained asset patch string"))?;
    if patch.len() > MAX_METADATA_BYTES {
        return Err(Error::Limit("retained asset metadata bytes"));
    }
    let Some(LoroValue::I64(counter)) = entry.get("counter") else {
        return Err(Error::Contract("retained asset contribution counter"));
    };
    // Validate the original causal stamp using only bounded typed scalars. Never recursively
    // convert an arbitrary historical Loro value before checking its shape and byte limits.
    let entry = serde_json::json!({"lamport":lamport.as_str(), "writer":writer.as_str(), "counter":counter, "value":patch.as_str()});
    read_contribution(doc, key, &entry)?;
    Ok(patch.as_str())
}

fn read_operation(
    doc: &LoroDoc,
    container: &ContainerID,
    operation: &JsonOpContent,
    output: &mut BTreeSet<RichAssetReference>,
) -> Result<(), Error> {
    if matches!(operation, JsonOpContent::Future(_)) {
        return Err(Error::Contract("retained asset unknown causal operation"));
    }
    let JsonOpContent::Map(loro::JsonMapOp::Insert { key, value }) = operation else {
        return Ok(());
    };
    check_metadata_slot(container, key, value)?;
    if matches!(key.as_str(), "defaults" | "identity") && metadata_owner(container) {
        let raw = value.as_string().ok_or(Error::Contract("retained asset base properties"))?;
        if raw.len() > MAX_METADATA_BYTES {
            return Err(Error::Limit("retained asset metadata bytes"));
        }
        let properties: serde_json::Map<String, Value> = serde_json::from_str(raw.as_str())
            .map_err(|_| Error::Contract("retained asset base properties encoding"))?;
        return insert(output, &properties);
    }
    if let Some(field) = contribution_field(container) {
        let raw = contribution_patch(doc, key, value)?;
        let patch: Patch = serde_json::from_str(raw)
            .map_err(|_| Error::Contract("retained asset patch encoding"))?;
        // Native materialization considers every metadata field, not only our usual
        // image-asset writer. Do not silently omit a losing pair in an alternate field.
        let affected = patch.sets.contains_key("breditor/asset-id")
            || patch.sets.contains_key("breditor/asset-generation")
            || patch.removes.iter().any(|key| {
                matches!(key.as_str(), "breditor/asset-id" | "breditor/asset-generation")
            });
        if field == "image-asset" || affected {
            if !patch.sets.contains_key("breditor/asset-id")
                || !patch.sets.contains_key("breditor/asset-generation")
                || patch.removes.iter().any(|key| {
                    matches!(key.as_str(), "breditor/asset-id" | "breditor/asset-generation")
                })
                || field == "image-asset" && (patch.sets.len() != 2 || !patch.removes.is_empty())
            {
                return Err(Error::Contract("retained asset atomic patch"));
            }
            insert(output, &patch.sets.into_iter().collect())?;
        }
    }
    Ok(())
}

pub(super) fn collect_causal_asset_references(
    doc: &LoroDoc,
    document: &breditor_core::rich_content::RichDocument,
) -> Result<Vec<RichAssetReference>, Error> {
    if doc.is_shallow() || doc.state_vv() != doc.oplog_vv() || doc.get_pending_txn_len() != 0 {
        return Err(Error::Contract("retained asset complete causal history"));
    }
    let applied = doc.state_vv();
    let mut total = 0_usize;
    for end in applied.values() {
        total = total
            .checked_add(usize::try_from(*end).map_err(|_| Error::Offset)?)
            .filter(|total| *total <= SHARED_ASSET_REFERENCE_MAX_CAUSAL_ATOMS)
            .ok_or(Error::Limit("retained asset causal read work"))?;
    }
    let mut output = inspect_rich_asset_references(document)
        .map_err(|_| Error::Contract("retained asset admitted document"))?
        .into_iter()
        .collect::<BTreeSet<_>>();
    for (peer, end) in applied.iter() {
        let mut from = 0;
        while from < *end {
            let through = from.saturating_add(CHUNK).min(*end);
            let mut next = from;
            for change in doc.export_json_in_id_span(IdSpan::new(*peer, from, through)) {
                if change.id.peer != *peer || change.id.counter != next {
                    return Err(Error::Contract("retained asset causal change continuity"));
                }
                for op in change.ops {
                    if op.counter != next || op.content.op_len() == 0 {
                        return Err(Error::Contract("retained asset causal operation continuity"));
                    }
                    next = next
                        .checked_add(i32::try_from(op.content.op_len()).map_err(|_| Error::Offset)?)
                        .filter(|next| *next <= through)
                        .ok_or(Error::Contract("retained asset causal operation span"))?;
                    read_operation(doc, &op.container, &op.content, &mut output)?;
                }
            }
            if next != through {
                return Err(Error::Contract("retained asset causal history gap"));
            }
            from = through;
        }
    }
    Ok(output.into_iter().collect())
}

impl RichReplica {
    /// Read all image bindings retained by complete causal history, including inactive/losing
    /// contributions, deleted nodes, undone births and Redo. Results may conservatively over-retain.
    ///
    /// The native operation stream is read in bounded chunks; it is never replayed into this owner.
    /// The result excludes other owners, saved version packets and separate proposal/outbox stores.
    /// It grants neither provider authority nor permission to delete unlisted asset bytes.
    /// # Errors
    /// Stale/foreign guards, pending dependencies, shallow/partial history, unsupported metadata,
    /// continuity gaps and read-work/result budgets reject without publishing or returning a prefix.
    pub fn retained_asset_references_guarded(
        &self,
        observed: &SharedObservation,
    ) -> Result<Vec<RichAssetReference>, Error> {
        self.check(observed)?;
        if self.doc.is_shallow()
            || self.doc.state_vv() != self.doc.oplog_vv()
            || self.doc.get_pending_txn_len() != 0
        {
            return Err(Error::Contract("retained asset complete causal history"));
        }
        let applied = self.doc.state_vv();
        for bytes in self.journal.retained_updates() {
            let metadata = LoroDoc::decode_import_blob_meta(bytes, true)?;
            if metadata
                .partial_end_vv
                .iter()
                .any(|(peer, end)| applied.get(peer).copied().unwrap_or(0) < *end)
            {
                return Err(Error::Contract("retained asset pending causal dependencies"));
            }
        }
        collect_causal_asset_references(&self.doc, self.document())
    }
}
