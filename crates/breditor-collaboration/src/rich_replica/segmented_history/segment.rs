//! One exact sealed/active segment. Entries and typing joins remain independently bounded.
use super::super::{
    session::{Entry, MAX_JOURNAL_BYTES, publication},
    typing_checkpoint::{BoundedEntries, join_records},
    ui_state::UiState,
};
use super::encoding::{digest, encode, quoted_bytes};
use crate::Error;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub(super) const FORMAT: &str = "breditor/shared-history-segment";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Segment<Entries = Vec<Entry>> {
    pub format: String,
    pub format_version: u32,
    pub generation: String,
    pub parent_generation: String,
    pub parent_sha256: String,
    pub start: u32,
    pub entries: Entries,
    #[serde(deserialize_with = "join_records")]
    pub joins: Vec<u32>,
    pub ui: UiState,
    pub publication: String,
}
pub(super) struct Sealed {
    pub record: Segment,
    pub json: Arc<str>,
    pub sha256: String,
    pub quoted_bytes: usize,
}
impl Sealed {
    pub fn from_record(record: Segment) -> Result<Self, Error> {
        let json: Arc<str> = encode(&record, MAX_JOURNAL_BYTES)?.into();
        let sha256 = digest(&json);
        let quoted_bytes = quoted_bytes(&json)?;
        Ok(Self { record, json, sha256, quoted_bytes })
    }
    pub fn read(input: &str) -> Result<Self, Error> {
        if input.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("segmented history segment bytes"));
        }
        let value: Segment<BoundedEntries> = serde_json::from_str(input)?;
        if value.format != FORMAT || value.format_version != 1 {
            return Err(Error::Contract("segmented history segment format"));
        }
        publication(&value.publication)?;
        let record = Segment {
            format: value.format,
            format_version: value.format_version,
            generation: value.generation,
            parent_generation: value.parent_generation,
            parent_sha256: value.parent_sha256,
            start: value.start,
            entries: value.entries.0,
            joins: value.joins,
            ui: value.ui,
            publication: value.publication,
        };
        let checked = Self::from_record(record)?;
        if checked.json.as_ref() != input {
            return Err(Error::Contract("segmented history canonical segment differs"));
        }
        Ok(checked)
    }
}
