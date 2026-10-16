//! Guarded property-only formatting lowered entirely to existing `SetFormat` commands.
//!
//! Preserves observed omitted fields, not a new per-property replicated register.
//! Concurrent same-kind values retain the original complete-format causal policy.
//! No patch request enters a journal, update frame or writer-group wire record.

use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::SetFormat,
};
use crate::Error;
use breditor_core::{
    codec::RichFormatsJsonCodec,
    document::FormatSet,
    identity::QualifiedName,
    position::TextOffset,
    rich_content::{BlockId, actions::RichFormatPropertyPatch},
    state::EditorContext,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Target {
    block: String,
    offset: u32,
    length: u32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    formats_json: String,
    properties: Vec<String>,
    targets: Vec<Target>,
}

impl RichReplica {
    /// Patch named properties on every selected formatted character in one author-local group.
    ///
    /// Complete template values and each resulting format require exact schema admission.
    /// Missing formats reject; repeated/no-op patches publish nothing. Explicit targets
    /// are unique blocks, and the existing 64-command group ceiling remains unchanged.
    /// # Errors
    /// Rejects stale/foreign guards before decoding, malformed or oversized requests,
    /// invalid scalar ranges, duplicate targets/fields, missing formats and late limits.
    pub fn patch_inline_format_properties_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if input.len() > 64 * 1024 {
            return Err(Error::Limit("inline property patch bytes"));
        }
        let request: Request = serde_json::from_str(input).map_err(|_| Error::Json)?;
        if request.targets.is_empty() || request.targets.len() > 64 {
            return Err(Error::Limit("inline property patch targets"));
        }
        let codec = RichFormatsJsonCodec::new(EditorContext::new(
            self.codec.schema().clone(),
            self.codec.limits().clone(),
        ));
        let templates = codec
            .decode(&request.formats_json)
            .map_err(|_| Error::Contract("inline property patch template"))?;
        if templates.len() != 1 {
            return Err(Error::Contract("inline property patch template"));
        }
        let template = templates
            .iter()
            .next()
            .ok_or(Error::Contract("inline property patch template"))?
            .clone();
        let names = request
            .properties
            .into_iter()
            .map(|value| {
                QualifiedName::try_new(value)
                    .map_err(|_| Error::Contract("inline property patch name"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let patch = RichFormatPropertyPatch::try_new(template, names)
            .map_err(|_| Error::Contract("inline property patch fields"))?;
        let mut seen = BTreeSet::new();
        let mut commands = Vec::new();
        for target in request.targets {
            if !seen.insert(target.block.clone()) {
                return Err(Error::Contract("inline property patch duplicate block"));
            }
            let block = BlockId::try_new(&target.block)
                .map_err(|_| Error::Contract("inline property patch block"))?;
            let start = TextOffset::try_new(u64::from(target.offset)).map_err(|_| Error::Offset)?;
            let end = TextOffset::try_new(u64::from(
                target.offset.checked_add(target.length).ok_or(Error::Offset)?,
            ))
            .map_err(|_| Error::Offset)?;
            for run in patch
                .capture_runs(&self.document, &block, start, end)
                .map_err(|_| Error::Contract("inline property patch range"))?
            {
                if commands.len() == 64 {
                    return Err(Error::Limit("inline property patch commands"));
                }
                let formats = FormatSet::try_from_formats(vec![run.format])
                    .map_err(|_| Error::Contract("inline property patch result"))?;
                let mut values: Vec<Value> = serde_json::from_str(
                    &codec
                        .encode(&formats)
                        .map_err(|_| Error::Contract("inline property patch admission"))?,
                )?;
                commands.push(Command::SetFormat(SetFormat {
                    block: target.block.clone(),
                    offset: u32::try_from(run.start.get()).map_err(|_| Error::Offset)?,
                    length: u32::try_from(run.end.get() - run.start.get())
                        .map_err(|_| Error::Offset)?,
                    format: values.pop().ok_or(Error::Contract("inline property patch result"))?,
                    enabled: true,
                }));
            }
        }
        if commands.is_empty() {
            return Ok(false);
        }
        self.apply_guarded(observation, commands, SelectionUpdate::Map, PendingFormatsUpdate::Map)
    }
}
