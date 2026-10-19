//! Canonical, bounded NEW segmented archive. The root and every sealed file remain exact strings.
use super::{
    binding::Family,
    encoding::{MAX_ARCHIVE_BYTES, MAX_GENERATIONS, encode},
    state::SegmentedHistory,
};
use crate::Error;
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, IgnoredAny, SeqAccess, Visitor},
};
use std::fmt;

pub(super) const FORMAT: &str = "breditor/shared-segmented-history-session";
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Encoding<'a> {
    format: &'a str,
    format_version: u32,
    family: Family,
    root_generation: &'a str,
    root_checkpoint: &'a str,
    sealed: Vec<&'a str>,
    active: &'a str,
}
pub(super) struct Files(pub Vec<String>);
impl<'de> Deserialize<'de> for Files {
    fn deserialize<D: Deserializer<'de>>(reader: D) -> Result<Self, D::Error> {
        struct Bounded;
        impl<'de> Visitor<'de> for Bounded {
            type Value = Files;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("bounded sealed native history segments")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Files, A::Error> {
                let mut files = Vec::new();
                while files.len() < MAX_GENERATIONS - 2 {
                    match seq.next_element()? {
                        Some(file) => files.push(file),
                        None => return Ok(Files(files)),
                    }
                }
                if seq.next_element::<IgnoredAny>()?.is_some() {
                    return Err(de::Error::custom("segmented generation budget"));
                }
                Ok(Files(files))
            }
        }
        reader.deserialize_seq(Bounded)
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Archive {
    pub format: String,
    pub format_version: u32,
    pub family: Family,
    pub root_generation: String,
    pub root_checkpoint: String,
    pub sealed: Files,
    pub active: String,
}
impl Archive {
    pub fn read(input: &str) -> Result<Self, Error> {
        if input.len() > MAX_ARCHIVE_BYTES {
            return Err(Error::Limit("segmented history archive bytes"));
        }
        let value: Self = serde_json::from_str(input)?;
        if value.format != FORMAT || value.format_version != 1 {
            return Err(Error::Contract("segmented history archive format"));
        }
        let encoded = value.encode()?;
        if encoded != input {
            return Err(Error::Contract("segmented history canonical archive differs"));
        }
        Ok(value)
    }

    pub fn encode(&self) -> Result<String, Error> {
        encode(
            &Encoding {
                format: &self.format,
                format_version: self.format_version,
                family: self.family,
                root_generation: &self.root_generation,
                root_checkpoint: &self.root_checkpoint,
                sealed: self.sealed.0.iter().map(String::as_str).collect(),
                active: &self.active,
            },
            MAX_ARCHIVE_BYTES,
        )
    }
}
pub(super) fn checkpoint(state: &SegmentedHistory, active: &str) -> Result<String, Error> {
    encode(
        &Encoding {
            format: FORMAT,
            format_version: 1,
            family: state.root.family,
            root_generation: &state.root.generation,
            root_checkpoint: &state.root.json,
            sealed: state.sealed.iter().map(|s| s.json.as_ref()).collect(),
            active,
        },
        MAX_ARCHIVE_BYTES,
    )
}
