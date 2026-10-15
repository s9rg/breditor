//! Structural consequences of an admitted core range edit; text is never copied by this plan.
use super::selection::TextPoint;
use crate::Error;
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::RichDocument};
use serde_json::Value;
use std::collections::BTreeMap;

struct Node {
    parent: Option<String>,
    children: Vec<String>,
}
/// Only deleted subtree roots and reparented surviving nodes need shared structural intents.
pub(super) struct RangePlan {
    pub deletes: Vec<String>,
    pub moves: Vec<(String, Option<String>, Option<String>)>,
}
pub(super) fn ordered<'a>(
    document: &RichDocument,
    a: &'a TextPoint,
    b: &'a TextPoint,
) -> Result<(&'a TextPoint, &'a TextPoint), Error> {
    let path = |point: &TextPoint| {
        document
            .block_path(&super::paragraphs::id(&point.block)?)
            .map(breditor_core::position::NodePath::to_vec)
            .ok_or(Error::Contract("shared range endpoint"))
    };
    Ok(if (path(a)?, a.offset) <= (path(b)?, b.offset) { (a, b) } else { (b, a) })
}
impl RangePlan {
    pub fn capture(
        codec: &DocumentJsonCodecV2,
        before: &RichDocument,
        after: &RichDocument,
        end: &str,
    ) -> Result<Self, Error> {
        let a = nodes(
            &serde_json::from_str::<Value>(
                &codec
                    .encode(before.document())
                    .map_err(|_| Error::Contract("shared range source"))?,
            )?["root"],
        )?;
        let b = nodes(
            &serde_json::from_str::<Value>(
                &codec
                    .encode(after.document())
                    .map_err(|_| Error::Contract("shared range result"))?,
            )?["root"],
        )?;
        if b.keys().any(|id| !a.contains_key(id)) {
            return Err(Error::Contract("range introduced structural identity"));
        }
        let deletes = a
            .iter()
            .filter(|(id, node)| {
                id.as_str() != end
                    && !b.contains_key(*id)
                    && node.parent.as_ref().is_none_or(|parent| b.contains_key(parent))
            })
            .map(|(id, _)| id.clone())
            .collect();
        let mut moves = vec![];
        for node in b.values() {
            let mut next = None;
            for id in node.children.iter().rev() {
                let target = b.get(id).ok_or(Error::Contract("range child directory"))?;
                if a.get(id).ok_or(Error::Contract("range old child"))?.parent != target.parent {
                    moves.push((id.clone(), target.parent.clone(), next.clone()));
                }
                next = Some(id.clone());
            }
        }
        Ok(Self { deletes, moves })
    }
}
fn nodes(root: &Value) -> Result<BTreeMap<String, Node>, Error> {
    fn visit(
        value: &Value,
        parent: Option<&str>,
        out: &mut BTreeMap<String, Node>,
    ) -> Result<(), Error> {
        if value["kind"] == "text" {
            return Ok(());
        }
        let id = value.pointer("/properties/breditor~1block-id").and_then(Value::as_str);
        let children =
            value["children"].as_array().ok_or(Error::Contract("range element children"))?;
        if let Some(id) = id {
            if out.len() >= 20_000 {
                return Err(Error::Limit("range structural nodes"));
            }
            let ids = children
                .iter()
                .filter_map(|child| {
                    child
                        .pointer("/properties/breditor~1block-id")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .collect();
            if out
                .insert(id.into(), Node { parent: parent.map(str::to_owned), children: ids })
                .is_some()
            {
                return Err(Error::Contract("range duplicate identity"));
            }
        }
        for child in children {
            visit(child, id.or(parent), out)?;
        }
        Ok(())
    }
    let mut output = BTreeMap::new();
    visit(root, None, &mut output)?;
    Ok(output)
}
