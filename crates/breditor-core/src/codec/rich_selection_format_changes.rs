//! Closed, bounded selection-format intent; this payload is never persisted as a history action.
use super::{JsonFailure, RichFormatsCodecError, RichFormatsJsonCodec};
use crate::{
    identity::QualifiedName,
    rich_content::{RichSelectionFormatChange, actions::RichFormatPropertyPatch},
    state::EditorContext,
};
use serde::Deserialize;
use std::collections::BTreeSet;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    changes: Vec<Change>,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Change {
    Set {
        #[serde(rename = "formatsJson")]
        formats: String,
    },
    Remove {
        #[serde(rename = "formatsJson")]
        formats: String,
    },
    Patch {
        #[serde(rename = "formatsJson")]
        formats: String,
        properties: Vec<String>,
    },
}
/// Admit complete set/removal templates or field-only patches under the exact rich context.
///
/// The `changes` array must be nonempty with one change per declared kind. Each
/// template is the original strict one-format literal array. Removal uses its
/// kind; a valid complete literal also permits original shared annotation
/// lowering without inventing required property values in JavaScript or Rust.
/// # Errors
/// Rejects unknown/duplicate fields/kinds, invalid templates/patches and the 64 KiB intent budget.
pub fn decode_rich_selection_format_changes(
    context: &EditorContext,
    input: &str,
) -> Result<Vec<RichSelectionFormatChange>, RichFormatsCodecError> {
    if !context.schema().is_rich_content_profile() {
        return Err(RichFormatsCodecError::UnsupportedContext);
    }
    if input.len() > 64 * 1024 {
        return Err(RichFormatsCodecError::Limit);
    }
    let request: Request = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    if request.changes.is_empty() {
        return Err(RichFormatsCodecError::Invariant);
    }
    let codec = RichFormatsJsonCodec::new(context.clone());
    let mut seen = BTreeSet::new();
    request
        .changes
        .into_iter()
        .map(|change| {
            let text = match &change {
                Change::Set { formats }
                | Change::Remove { formats }
                | Change::Patch { formats, .. } => formats,
            };
            let formats = codec.decode(text)?;
            if formats.len() != 1 {
                return Err(RichFormatsCodecError::Invariant);
            }
            let format = formats.iter().next().ok_or(RichFormatsCodecError::Invariant)?.clone();
            if !seen.insert(format.kind().clone()) {
                return Err(RichFormatsCodecError::Invariant);
            }
            Ok(match change {
                Change::Set { .. } => RichSelectionFormatChange::Set(format),
                Change::Remove { .. } => RichSelectionFormatChange::Remove(format),
                Change::Patch { properties, .. } => {
                    let properties = properties
                        .into_iter()
                        .map(|p| {
                            QualifiedName::try_new(p).map_err(|_| RichFormatsCodecError::Invariant)
                        })
                        .collect::<Result<_, _>>()?;
                    RichSelectionFormatChange::Patch(
                        RichFormatPropertyPatch::try_new(format, properties)
                            .map_err(|_| RichFormatsCodecError::Invariant)?,
                    )
                }
            })
        })
        .collect()
}
