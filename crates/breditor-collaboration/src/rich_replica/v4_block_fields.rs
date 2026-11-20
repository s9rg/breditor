//! Shared V4 block-field targets, the guarded section-collapse selection rule and the
//! bookmark inventory read.
//!
//! The commands themselves live in `actions/v4_block_fields.rs`. This module keeps
//! their closed target checks out of the generic target table and adds the two
//! session-level behaviors of the local V4 owner: collapsing a section moves a
//! selection out of its hidden body (same publication), and the bookmark index
//! reports bookmarks, links and dangling links from one snapshot.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::SetDetailsOpen,
    protocol::Protocol,
    selection::{Selection, TextPoint},
    target_kinds::TargetKinds,
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{BlockId, RichBookmarkIndex, RichDocument};
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(super) const fn handles(command: &Command) -> bool {
    matches!(
        command,
        Command::SetListNumbering(_)
            | Command::SetBookmark(_)
            | Command::RenameBookmark(_)
            | Command::SetDetailsOpen(_)
    )
}

/// Closed V4-only target kinds; native capture repeats the exact checks on the basis.
pub(super) fn validate(
    protocol: Protocol,
    document: &RichDocument,
    declared: &TargetKinds,
    command: &Command,
) -> Result<(), Error> {
    if !protocol.v4() {
        return Err(Error::Contract("shared V4 block field requires model 14"));
    }
    let (block, expected): (&str, &[&str]) = match command {
        Command::SetListNumbering(value) => (&value.list, &["breditor/ordered-list"]),
        Command::SetBookmark(value) => {
            (&value.block, &["breditor/paragraph", "breditor/heading", "breditor/code-block"])
        }
        Command::SetDetailsOpen(value) => (&value.block, &["breditor/details"]),
        Command::RenameBookmark(_) => return Ok(()),
        _ => return Err(Error::Contract("unhandled shared V4 block field")),
    };
    let id = BlockId::try_new(block).map_err(|_| Error::Contract("shared V4 field target"))?;
    if expected.contains(&declared.kind(document, &id)?.as_str()) {
        Ok(())
    } else {
        Err(Error::Contract("shared action target kind"))
    }
}

fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == block {
        return Some(node);
    }
    node["children"].as_array()?.iter().find_map(|child| find(child, block))
}
/// Every block and table identity inside a section's body (never its summary).
fn hidden_targets(section: &Value) -> (BTreeSet<String>, BTreeSet<String>) {
    fn visit(node: &Value, blocks: &mut BTreeSet<String>, tables: &mut BTreeSet<String>) {
        if let Some(id) = node["properties"]["breditor/block-id"].as_str() {
            blocks.insert(id.into());
        }
        if let Some(id) = node["properties"]["breditor/table-id"].as_str() {
            tables.insert(id.into());
        }
        for child in node["children"].as_array().into_iter().flatten() {
            if child["kind"] == "element" {
                visit(child, blocks, tables);
            }
        }
    }
    let (mut blocks, mut tables) = (BTreeSet::new(), BTreeSet::new());
    for child in section["children"].as_array().into_iter().flatten().skip(1) {
        visit(child, &mut blocks, &mut tables);
    }
    (blocks, tables)
}

impl RichReplica {
    /// Expand or collapse one section as one history group (local V4 `setDetailsOpen`).
    ///
    /// Collapsing moves a selection with any endpoint, node or grid inside the hidden
    /// body to a caret at the end of the summary in the same publication (and clears
    /// pending formats); otherwise the selection maps. The current state is an admitted
    /// no-op that publishes nothing.
    /// # Errors
    /// Stale/foreign observations and read-only owners reject first; a non-V4 owner,
    /// an absent or non-section target and admission failures are atomic.
    pub fn set_details_open_guarded(
        &mut self,
        observation: &SharedObservation,
        block: &str,
        open: bool,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.protocol.v4() {
            return Err(Error::Contract("shared V4 block field requires model 14"));
        }
        let root: Value = serde_json::from_str(&self.canonical)?;
        let section = find(&root["root"], block)
            .filter(|node| node["type"] == "breditor/details")
            .ok_or(Error::Contract("shared action target kind"))?;
        let mut update = SelectionUpdate::Map;
        if !open {
            let (blocks, tables) = hidden_targets(section);
            let hidden = match self.selection()? {
                Some(Selection::TextRange { anchor, focus }) => {
                    blocks.contains(&anchor.block) || blocks.contains(&focus.block)
                }
                Some(Selection::Node { block }) => blocks.contains(&block),
                Some(Selection::Grid { anchor, .. }) => tables.contains(&anchor.table),
                None => false,
            };
            let summary = &section["children"][0];
            if let (true, Some(id)) = (hidden, summary["properties"]["breditor/block-id"].as_str())
            {
                let length = summary["children"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|run| run["text"].as_str())
                    .map(|text| text.encode_utf16().count())
                    .sum::<usize>();
                let point = TextPoint {
                    block: id.into(),
                    offset: u32::try_from(length).map_err(|_| Error::Offset)?,
                    affinity: Affinity::After,
                };
                update = SelectionUpdate::Set(Some(Selection::TextRange {
                    anchor: point.clone(),
                    focus: point,
                }));
            }
        }
        let pending = if update == SelectionUpdate::Map {
            PendingFormatsUpdate::Map
        } else {
            PendingFormatsUpdate::Set(None)
        };
        self.apply_guarded(
            observation,
            vec![Command::SetDetailsOpen(SetDetailsOpen { block: block.into(), open })],
            update,
            pending,
        )
    }

    /// `{"bookmarks":[{name,block}],"links":[{block,target}],"brokenLinks":[{block,target}]}`
    /// in document order from the current admitted projection (local `bookmarkIndexJson`).
    /// # Errors
    /// Stale/foreign observations and non-V4 owners are rejected.
    pub fn bookmark_index_json(&self, observation: &SharedObservation) -> Result<String, Error> {
        self.check(observation)?;
        if !self.protocol.v4() {
            return Err(Error::Contract("shared V4 block field requires model 14"));
        }
        let index =
            RichBookmarkIndex::read(&super::paragraphs::context(&self.codec), &self.document)
                .map_err(|_| Error::Contract("shared bookmark index"))?;
        let link = |link: &breditor_core::rich_content::RichInternalLink| json!({"block": link.block().as_str(), "target": link.target().as_str()});
        Ok(json!({
            "bookmarks": index.bookmarks().iter().map(|entry| json!({
                "name": entry.name().as_str(), "block": entry.block().as_str(),
            })).collect::<Vec<_>>(),
            "links": index.links().iter().map(link).collect::<Vec<_>>(),
            "brokenLinks": index.broken_links().into_iter().map(link).collect::<Vec<_>>(),
        })
        .to_string())
    }
}
