//! Canonical, bounded NEW segmented archive. The root and every sealed file remain exact strings.
use super::{
    binding::Family,
    encoding::{
        CONTINUED_ARCHIVE_BYTES, CONTINUED_GENERATIONS, MAX_ARCHIVE_BYTES, MAX_GENERATIONS, encode,
        quoted_bytes,
    },
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
    #[serde(skip_serializing_if = "Option::is_none")]
    continued_after: Option<usize>,
}
pub(super) struct Files<const MAX: usize = MAX_GENERATIONS>(pub Vec<String>);
impl<'de, const MAX: usize> Deserialize<'de> for Files<MAX> {
    fn deserialize<D: Deserializer<'de>>(reader: D) -> Result<Self, D::Error> {
        struct Bounded<const MAX: usize>;
        impl<'de, const MAX: usize> Visitor<'de> for Bounded<MAX> {
            type Value = Files<MAX>;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("bounded sealed native history segments")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Files<MAX>, A::Error> {
                let mut files = Vec::new();
                while files.len() < MAX - 2 {
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
        reader.deserialize_seq(Bounded::<MAX>)
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Archive<const MAX: usize = MAX_GENERATIONS> {
    pub format: String,
    pub format_version: u32,
    pub family: Family,
    pub root_generation: String,
    pub root_checkpoint: String,
    pub sealed: Files<MAX>,
    pub active: String,
    pub continued_after: Option<usize>,
}
impl Archive<MAX_GENERATIONS> {
    pub fn read(input: &str) -> Result<Self, Error> {
        Self::read_selected(input, 1, MAX_ARCHIVE_BYTES)
    }
}
impl Archive<CONTINUED_GENERATIONS> {
    pub fn read_continued(input: &str) -> Result<Self, Error> {
        Self::read_selected(input, 2, CONTINUED_ARCHIVE_BYTES)
    }
}
impl<const MAX: usize> Archive<MAX> {
    fn read_selected(input: &str, version: u32, limit: usize) -> Result<Self, Error> {
        if input.len() > limit {
            return Err(Error::Limit("segmented history archive bytes"));
        }
        let value: Self = serde_json::from_str(input)?;
        if value.format != FORMAT
            || value.format_version != version
            || value.continued_after.is_some() != (version == 2)
        {
            return Err(Error::Contract("segmented history archive format"));
        }
        let encoded = value.encode_with_limit(limit)?;
        if encoded != input {
            return Err(Error::Contract("segmented history canonical archive differs"));
        }
        Ok(value)
    }

    #[cfg(test)]
    pub fn encode(&self) -> Result<String, Error> {
        self.encode_with_limit(MAX_ARCHIVE_BYTES)
    }

    fn encode_with_limit(&self, limit: usize) -> Result<String, Error> {
        encode(
            &Encoding {
                format: &self.format,
                format_version: self.format_version,
                family: self.family,
                root_generation: &self.root_generation,
                root_checkpoint: &self.root_checkpoint,
                sealed: self.sealed.0.iter().map(String::as_str).collect(),
                active: &self.active,
                continued_after: self.continued_after,
            },
            limit,
        )
    }
}
pub(super) fn checkpoint(state: &SegmentedHistory, active: &str) -> Result<String, Error> {
    encode(
        &Encoding {
            format: FORMAT,
            format_version: if state.continuation.is_some() { 2 } else { 1 },
            family: state.root.family,
            root_generation: &state.root.generation,
            root_checkpoint: &state.root.json,
            sealed: state.sealed.iter().map(|s| s.json.as_ref()).collect(),
            active,
            continued_after: state.continuation,
        },
        state.max_archive_bytes(),
    )
}

/// Only the active file changes during an edit. Root and sealed file charges
/// were derived from the exact immutable bytes when each file was admitted.
pub(super) fn check_size(
    state: &SegmentedHistory,
    active: &str,
    limit: usize,
) -> Result<(), Error> {
    let envelope = Encoding {
        format: FORMAT,
        format_version: if state.continuation.is_some() { 2 } else { 1 },
        family: state.root.family,
        root_generation: &state.root.generation,
        root_checkpoint: "",
        sealed: Vec::new(),
        active: "",
        continued_after: state.continuation,
    };
    // The empty envelope already charges the root and active quotes and
    // the sealed array's brackets. Add only what replaces the empty files.
    let empty_file_bytes = b"\"\"".len();
    let overhead = serde_json::to_vec(&envelope)?.len();
    let sealed_bytes = state.sealed.iter().map(|file| file.quoted_bytes).sum::<usize>();
    let separators = state.sealed.len().saturating_sub(1);
    let bytes = overhead
        + (state.root.quoted_bytes - empty_file_bytes)
        + sealed_bytes
        + separators
        + (quoted_bytes(active)? - empty_file_bytes);
    if bytes > limit {
        return Err(Error::Limit("segmented history bytes"));
    }
    Ok(())
}
