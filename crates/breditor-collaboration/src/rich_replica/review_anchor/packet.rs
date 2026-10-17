//! Closed durable-anchor family; no presence writer, expiry or authentication semantics.
use super::super::{RichReplica, selection::CellTarget, text_flow::FlowAnchor};
use crate::Error;
use breditor_core::rich_content::{BlockId, ColumnId, RowId, TableId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub(super) const MAX_BYTES: usize = 256 * 1024;
const ENGINE: &str = "loro/1.16.2+breditor.deterministic-history.1";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Clock {
    writer: String,
    counter: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Packet {
    format: String,
    format_version: u32,
    document: String,
    model_version: u32,
    engine: String,
    schema_fingerprint: String,
    clocks: Vec<Clock>,
    pub anchors: Anchors,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Anchors {
    Document,
    Text { anchor: Box<FlowAnchor>, focus: Box<FlowAnchor>, was_range: bool },
    Node { block: String },
    Grid { anchor: CellTarget, focus: CellTarget },
}

impl Packet {
    pub fn missing(
        &self,
        owner: &RichReplica,
    ) -> Result<Vec<super::super::WriterDependency>, Error> {
        if self.ready(owner)? {
            return Ok(vec![]);
        }
        let current = owner.doc.state_vv();
        let mut missing = vec![];
        for clock in &self.clocks {
            let writer = super::super::session::writer_id(&clock.writer)?;
            let counter = clock
                .counter
                .parse::<i32>()
                .map_err(|_| Error::Contract("review anchor causal clock"))?;
            if current.get(&writer).copied().unwrap_or(0) < counter {
                missing.push(super::super::WriterDependency {
                    writer: clock.writer.clone(),
                    counter: clock.counter.clone(),
                });
            }
        }
        Ok(missing)
    }
    pub fn capture(owner: &RichReplica, anchors: Anchors) -> Self {
        Self {
            format: "breditor/shared-review-anchor".into(),
            format_version: 1,
            document: owner.document_id().into(),
            model_version: owner.model_version(),
            engine: ENGINE.into(),
            schema_fingerprint: owner.codec.schema().fingerprint().to_string(),
            clocks: owner
                .doc
                .state_vv()
                .iter()
                .map(|(w, c)| (*w, *c))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .map(|(w, c)| Clock { writer: w.to_string(), counter: c.to_string() })
                .collect(),
            anchors,
        }
    }

    pub fn ready(&self, owner: &RichReplica) -> Result<bool, Error> {
        if self.format != "breditor/shared-review-anchor"
            || self.format_version != 1
            || self.model_version != owner.model_version()
            || self.engine != ENGINE
            || self.document != owner.document_id()
            || self.schema_fingerprint != owner.codec.schema().fingerprint().to_string()
        {
            return Err(Error::Contract("durable review anchor binding"));
        }
        if self.clocks.len() > 1024 {
            return Err(Error::Limit("review anchor clocks"));
        }
        let current = owner.doc.state_vv();
        let mut previous = None;
        let mut ready = true;
        for clock in &self.clocks {
            let writer = super::super::session::writer_id(&clock.writer)?;
            let counter = clock
                .counter
                .parse::<i32>()
                .map_err(|_| Error::Contract("review anchor causal clock"))?;
            if counter < 0
                || counter.to_string() != clock.counter
                || previous.is_some_and(|before| writer <= before)
            {
                return Err(Error::Contract("review anchor canonical clock order"));
            }
            previous = Some(writer);
            ready &= current.get(&writer).copied().unwrap_or(0) >= counter;
        }
        match &self.anchors {
            Anchors::Text { anchor, focus, .. } => {
                anchor.validate_review_encoding()?;
                focus.validate_review_encoding()?;
            }
            Anchors::Node { block } => {
                BlockId::try_new(block).map_err(|_| Error::Contract("review node identity"))?;
            }
            Anchors::Grid { anchor, focus } => {
                for cell in [anchor, focus] {
                    TableId::try_new(&cell.table)
                        .map_err(|_| Error::Contract("review table identity"))?;
                    RowId::try_new(&cell.row)
                        .map_err(|_| Error::Contract("review row identity"))?;
                    ColumnId::try_new(&cell.column)
                        .map_err(|_| Error::Contract("review column identity"))?;
                }
            }
            Anchors::Document => {}
        }
        Ok(ready)
    }
}
