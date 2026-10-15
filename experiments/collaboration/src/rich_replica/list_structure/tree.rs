//! Bounded semantic structure directories; text runs are deliberately not structural records.
use crate::Error;
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::RichDocument};
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) struct Node {
    pub parent: Option<String>,
    pub children: Vec<String>,
    pub value: Value,
}
pub(super) struct Tree {
    pub nodes: BTreeMap<String, Node>,
    pub roots: Vec<String>,
}
pub(super) fn id(value: &Value) -> Option<&str> {
    value.pointer("/properties/breditor~1block-id").and_then(Value::as_str)
}
fn children(value: &Value) -> Result<Vec<String>, Error> {
    Ok(value["children"]
        .as_array()
        .ok_or(Error::Contract("shared list element children"))?
        .iter()
        .filter_map(|child| id(child).map(str::to_owned))
        .collect())
}
impl Tree {
    pub fn read(codec: &DocumentJsonCodecV2, document: &RichDocument) -> Result<Self, Error> {
        let source: Value = serde_json::from_str(
            &codec.encode(document.document()).map_err(|_| Error::Contract("shared list AST"))?,
        )?;
        let mut tree = Self { nodes: BTreeMap::new(), roots: children(&source["root"])? };
        for child in source["root"]["children"].as_array().ok_or(Error::Contract("list root"))? {
            tree.visit(child, None)?;
        }
        Ok(tree)
    }
    fn visit(&mut self, value: &Value, parent: Option<&str>) -> Result<(), Error> {
        if value["kind"] == "text" {
            return Ok(());
        }
        if self.nodes.len() >= 20_000 {
            return Err(Error::Limit("shared list structure"));
        }
        let id = id(value).ok_or(Error::Contract("shared list block identity"))?;
        let mut shallow: serde_json::Map<String, Value> = value
            .as_object()
            .ok_or(Error::Contract("shared list element object"))?
            .iter()
            .filter(|(key, _)| key.as_str() != "children")
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        shallow.insert("children".into(), Value::Array(vec![]));
        if self
            .nodes
            .insert(
                id.into(),
                Node {
                    parent: parent.map(str::to_owned),
                    children: children(value)?,
                    value: Value::Object(shallow),
                },
            )
            .is_some()
        {
            return Err(Error::Contract("shared list duplicate identity"));
        }
        for child in value["children"].as_array().ok_or(Error::Contract("shared list children"))? {
            self.visit(child, Some(id))?;
        }
        Ok(())
    }
}
