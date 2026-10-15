//! One source index per complete AST materialization, not one scan per paragraph.
use super::{graph, index::Index};
use crate::Error;
use loro::LoroDoc;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(in crate::rich_replica) struct Projection {
    index: Index,
    explicit: BTreeSet<String>,
}
impl Projection {
    pub fn read(doc: &LoroDoc) -> Result<Self, Error> {
        Ok(Self {
            index: Index::read(doc)?,
            explicit: super::cuts::active(doc)?.into_iter().map(|(_, cut)| cut.left).collect(),
        })
    }
    pub fn explicit(&self, block: &str) -> bool {
        self.explicit.contains(block)
    }
    pub fn joined(&self, block: &str) -> Result<bool, Error> {
        let root = graph::root(block);
        if !self.index.graph.definitions.contains_key(&root) {
            return Ok(false);
        }
        Ok(self.index.graph.owner(&root)? != block)
    }
    pub fn runs(&self, doc: &LoroDoc, block: &str) -> Result<Vec<Value>, Error> {
        if !self.index.graph.definitions.contains_key(&graph::root(block)) {
            return super::super::text::block_runs(doc, block);
        }
        let mut output: Vec<(String, Vec<Value>)> = vec![];
        for chunk in self.index.view(block)?.chunks {
            if let Some((text, formats)) = output.last_mut()
                && *formats == chunk.formats
            {
                text.push_str(&chunk.text);
            } else {
                output.push((chunk.text, chunk.formats));
            }
        }
        Ok(output
            .into_iter()
            .map(|(text, formats)| json!({"kind":"text","text":text,"formats":formats}))
            .collect())
    }
}
