//! Closed namespace requests; original dispatch and format literals remain unchanged.
use super::{RichReplica, SharedObservation, selection::Selection};
use crate::Error;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    document::{TextFragment, TextRun},
};
use serde::{Deserialize, Deserializer};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Plain {
    pub selection: Selection,
    pub text: String,
    pub prefix: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Typing {
    pub selection: Selection,
    pub text: String,
    pub prefix: String,
    #[serde(deserialize_with = "clock")]
    pub clock_ms: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Rich {
    pub selection: Selection,
    pub runs: Vec<Run>,
    pub prefix: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Run {
    pub text: String,
    pub formats_json: String,
}
pub(super) fn clock<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let s = String::deserialize(d)?;
    let n = s.parse::<u64>().map_err(serde::de::Error::custom)?;
    if s.len() > 20 || n.to_string() != s {
        return Err(serde::de::Error::custom("canonical general input clock"));
    }
    Ok(n)
}
pub(super) fn decode<T: serde::de::DeserializeOwned>(input: &str) -> Result<T, Error> {
    if input.len() > 1024 * 1024 {
        return Err(Error::Limit("general range request bytes"));
    }
    serde_json::from_str(input).map_err(|_| Error::Json)
}
pub(super) fn authorize(owner: &RichReplica, observation: &SharedObservation) -> Result<(), Error> {
    owner.check(observation)?;
    owner.require_writable()?;
    if !owner.general_ranges_enabled() {
        return Err(Error::Contract("general semantic history required"));
    }
    Ok(())
}
pub(super) fn fragment(codec: &DocumentJsonCodecV2, runs: Vec<Run>) -> Result<TextFragment, Error> {
    if runs.len() > 1000 || runs.iter().map(|r| r.text.len()).sum::<usize>() > 64 * 1024 {
        return Err(Error::Limit("general range input runs/text"));
    }
    let formats = RichFormatsJsonCodec::new(super::paragraphs::context(codec));
    let runs = runs
        .into_iter()
        .map(|r| {
            TextRun::try_new(
                r.text,
                formats
                    .decode(&r.formats_json)
                    .map_err(|_| Error::Contract("general input formats"))?,
            )
            .map_err(|_| Error::Contract("general input run"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    TextFragment::try_from_runs(runs).map_err(|_| Error::Contract("canonical general input runs"))
}
