//! Ephemeral causal anchors, never shared document content or a writer credential.
use super::super::{RichReplica, selection::AnchoredSelection};
use crate::Error;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub(super) const MAX_BYTES: usize = 256 * 1024;
const ENGINE: &str = "loro/1.16.2+breditor.deterministic-history.1";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Clock {
    pub writer: String,
    pub counter: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Packet {
    pub format: String,
    pub format_version: u32,
    pub document: String,
    pub writer: String,
    pub model_version: u32,
    pub engine: String,
    pub schema_fingerprint: String,
    pub clocks: Vec<Clock>,
    #[serde(deserialize_with = "required_selection")]
    pub selection: Option<AnchoredSelection>,
}
fn required_selection<'de, D: Deserializer<'de>>(
    d: D,
) -> Result<Option<AnchoredSelection>, D::Error> {
    Option::<AnchoredSelection>::deserialize(d)
}
impl Packet {
    pub fn capture(owner: &RichReplica) -> Self {
        Self {
            format: "breditor/shared-rich-presence".into(),
            format_version: 1,
            document: owner.document_id().into(),
            writer: owner.writer().into(),
            model_version: super::super::MODEL_VERSION,
            engine: ENGINE.into(),
            schema_fingerprint: owner.codec.schema().fingerprint().to_string(),
            clocks: owner
                .doc
                .state_vv()
                .iter()
                .map(|(writer, counter)| (*writer, *counter))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .map(|(writer, counter)| Clock {
                    writer: writer.to_string(),
                    counter: counter.to_string(),
                })
                .collect(),
            selection: owner.journal.ui.selection.clone(),
        }
    }
    pub fn ready(&self, owner: &RichReplica) -> Result<bool, Error> {
        if self.format != "breditor/shared-rich-presence"
            || self.format_version != 1
            || self.model_version != super::super::MODEL_VERSION
            || self.engine != ENGINE
            || self.document != owner.document_id()
            || self.schema_fingerprint != owner.codec.schema().fingerprint().to_string()
        {
            return Err(Error::Contract("shared presence binding"));
        }
        super::super::session::writer_id(&self.writer)?;
        if self.clocks.len() > 1024 {
            return Err(Error::Limit("shared presence clocks"));
        }
        let current = owner.doc.state_vv();
        let mut seen = BTreeSet::new();
        let mut ready = true;
        for clock in &self.clocks {
            let writer = super::super::session::writer_id(&clock.writer)?;
            let counter = clock
                .counter
                .parse::<i32>()
                .map_err(|_| Error::Contract("shared presence clock"))?;
            if counter < 0 || counter.to_string() != clock.counter || !seen.insert(writer) {
                return Err(Error::Contract("shared presence clock"));
            }
            ready &= current.get(&writer).copied().unwrap_or(0) >= counter;
        }
        Ok(ready)
    }
}
