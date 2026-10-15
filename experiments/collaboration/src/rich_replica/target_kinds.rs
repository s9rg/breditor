//! Sequential target declarations admit references to earlier creations in one atomic group.
use super::Command;
use crate::Error;
use breditor_core::rich_content::{BlockId, RichDocument};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Default)]
pub(super) struct TargetKinds(BTreeMap<String, String>);
impl TargetKinds {
    pub fn kind(&self, document: &RichDocument, block: &BlockId) -> Result<String, Error> {
        if let Some(path) = document.block_path(block) {
            return Ok(document
                .document()
                .node_at(path)
                .map_err(|_| Error::Contract("shared target path"))?
                .as_element()
                .ok_or(Error::Contract("shared element target"))?
                .kind()
                .as_str()
                .into());
        }
        self.0
            .get(block.as_str())
            .cloned()
            .ok_or(Error::Contract("visible or earlier-declared shared target"))
    }
    pub fn record(&mut self, command: &Command) -> Result<(), Error> {
        match command {
            Command::InsertBlocks(value) => {
                for node in &value.nodes {
                    self.node(node)?;
                }
            }
            Command::SplitTextBlock(value) => self.insert(
                &value.right,
                if value.right_heading.is_some() {
                    "breditor/heading"
                } else {
                    "breditor/paragraph"
                },
            )?,
            Command::InsertRow(value) => self.insert(&value.row_block, "breditor/table-row")?,
            _ => {}
        }
        Ok(())
    }
    fn insert(&mut self, block: &str, kind: &str) -> Result<(), Error> {
        if self.0.len() >= 20_000 {
            return Err(Error::Limit("shared group declarations"));
        }
        if self.0.insert(block.into(), kind.into()).is_some() {
            return Err(Error::Contract("duplicate shared group creation identity"));
        }
        Ok(())
    }
    fn node(&mut self, node: &Value) -> Result<(), Error> {
        if node["kind"] == "text" {
            return Ok(());
        }
        self.insert(
            super::creation::block(node)?,
            node["type"].as_str().ok_or(Error::Contract("shared declared kind"))?,
        )?;
        for child in
            node["children"].as_array().ok_or(Error::Contract("shared declared children"))?
        {
            self.node(child)?;
        }
        Ok(())
    }
}
