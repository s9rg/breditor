//! Deterministic semantic block comparison over admitted native trees, never rendered DOM.
use super::packet::Packet;
use crate::rich_replica::SharedObservation;
use crate::{Error, rich_replica::RichReplica};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// Stable semantic comparison target; the document root cannot collide with a block's opaque ID.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum VersionNodeTarget {
    /// Document root properties and direct-child order.
    Document,
    /// One stable source content block, including cells, list containers and image captions.
    Block(String),
}
/// Independent semantic dimensions of a retained node change; additions/removals use absent kinds.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VersionChangeAspect {
    /// Stable parent or sibling position changed.
    Placement,
    /// Direct text content changed.
    Text,
    /// Inline format coverage changed.
    InlineFormatting,
    /// Direct element child identities/order changed.
    Children,
    /// Semantic entity identity changed.
    Entity,
}
/// One classified semantic change; unchanged subtrees are not repeated as full JSON blobs.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionBlockChange {
    /// Exact source identity; fresh replacement identities appear as removed/added, not guessed matches.
    pub target: VersionNodeTarget,
    /// Previous element kind; absent for a new block.
    pub before_kind: Option<String>,
    /// Current element kind; absent for a removed block.
    pub after_kind: Option<String>,
    /// Changed native semantic dimensions. Cells/captions report text at their own paragraph.
    pub aspects: Vec<VersionChangeAspect>,
    /// Exact property names with unequal presence/value, including table geometry and image references.
    pub properties_changed: Vec<String>,
}
/// Immutable bitmap binding retained for host retention/fetch policy; no external bytes are fetched.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionAssetReference {
    /// Host-owned immutable asset identity.
    pub asset: String,
    /// Binding generation of the source image.
    pub generation: String,
}
/// Native semantic version comparison, not another document source of truth or mutation plan.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionComparison {
    /// Content-addressed source version.
    pub version_id: String,
    /// Accepted tree is byte-canonically semantically identical, independent of local history/UI.
    pub identical: bool,
    /// Stable-identity semantic differences in deterministic target order.
    pub changes: Vec<VersionBlockChange>,
    /// Source snapshot's unique immutable asset bindings.
    pub version_assets: Vec<VersionAssetReference>,
    /// Current accepted document's unique immutable asset bindings.
    pub current_assets: Vec<VersionAssetReference>,
}
#[derive(Eq, PartialEq)]
struct Record {
    kind: String,
    entity: Value,
    properties: BTreeMap<String, Value>,
    parent: Option<VersionNodeTarget>,
    index: usize,
    children: Vec<VersionNodeTarget>,
    text: String,
    formats: Vec<Value>,
}
fn records(
    node: &Value,
    parent: Option<VersionNodeTarget>,
    index: usize,
    out: &mut BTreeMap<VersionNodeTarget, Record>,
) -> Result<VersionNodeTarget, Error> {
    let target = if parent.is_none() {
        VersionNodeTarget::Document
    } else {
        VersionNodeTarget::Block(super::super::creation::block(node)?.into())
    };
    let mut children = vec![];
    let mut text = String::new();
    let mut formats = vec![];
    let mut offset = 0_u64;
    for (i, child) in node["children"]
        .as_array()
        .ok_or(Error::Contract("version semantic children"))?
        .iter()
        .enumerate()
    {
        if child["kind"] == "element" {
            children.push(records(child, Some(target.clone()), i, out)?);
        } else {
            let value = child["text"].as_str().ok_or(Error::Contract("version semantic text"))?;
            let end = offset
                .checked_add(
                    u64::try_from(value.encode_utf16().count()).map_err(|_| Error::Offset)?,
                )
                .ok_or(Error::Offset)?;
            text.push_str(value);
            if child["formats"].as_array().is_some_and(|f| !f.is_empty()) {
                formats
                    .push(serde_json::json!({"start":offset,"end":end,"formats":child["formats"]}));
            }
            offset = end;
        }
    }
    let record = Record {
        kind: node["type"].as_str().ok_or(Error::Contract("version semantic kind"))?.into(),
        entity: node["entityId"].clone(),
        properties: node["properties"]
            .as_object()
            .ok_or(Error::Contract("version semantic properties"))?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        parent,
        index,
        children,
        text,
        formats,
    };
    if out.insert(target.clone(), record).is_some() {
        return Err(Error::Contract("duplicate version semantic target"));
    }
    Ok(target)
}
fn assets(records: &BTreeMap<VersionNodeTarget, Record>) -> Vec<VersionAssetReference> {
    records
        .values()
        .filter_map(|r| {
            Some(VersionAssetReference {
                asset: r.properties.get("breditor/asset-id")?.as_str()?.into(),
                generation: r.properties.get("breditor/asset-generation")?.as_str()?.into(),
            })
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
pub(in crate::rich_replica) fn compare(
    version_id: String,
    before: &str,
    after: &str,
) -> Result<VersionComparison, Error> {
    let mut a = BTreeMap::new();
    let mut b = BTreeMap::new();
    records(&serde_json::from_str::<Value>(before)?["root"], None, 0, &mut a)?;
    records(&serde_json::from_str::<Value>(after)?["root"], None, 0, &mut b)?;
    let mut changes = vec![];
    for target in a.keys().chain(b.keys()).collect::<BTreeSet<_>>() {
        let before = a.get(target);
        let after = b.get(target);
        if before == after {
            continue;
        }
        let mut change = VersionBlockChange {
            target: target.clone(),
            before_kind: before.map(|r| r.kind.clone()),
            after_kind: after.map(|r| r.kind.clone()),
            aspects: vec![],
            properties_changed: vec![],
        };
        if let (Some(a), Some(b)) = (before, after) {
            for (changed, aspect) in [
                (a.parent != b.parent || a.index != b.index, VersionChangeAspect::Placement),
                (a.text != b.text, VersionChangeAspect::Text),
                (a.formats != b.formats, VersionChangeAspect::InlineFormatting),
                (a.children != b.children, VersionChangeAspect::Children),
                (a.entity != b.entity, VersionChangeAspect::Entity),
            ] {
                if changed {
                    change.aspects.push(aspect);
                }
            }
            change.properties_changed = a
                .properties
                .keys()
                .chain(b.properties.keys())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .filter(|key| a.properties.get(*key) != b.properties.get(*key))
                .cloned()
                .collect();
        }
        changes.push(change);
    }
    Ok(VersionComparison {
        version_id,
        identical: changes.is_empty(),
        changes,
        version_assets: assets(&a),
        current_assets: assets(&b),
    })
}
impl RichReplica {
    /// Compare an admitted version to the exact current accepted tree without importing history.
    /// # Errors
    /// Stale guards, invalid versions or native semantic extraction failure reject purely.
    pub fn compare_document_version_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<VersionComparison, Error> {
        self.check(observed)?;
        let (version, _) = Packet::read(self, input)?;
        compare(version.id, &version.data.document_json, self.document_json())
    }
}
