//! Selection plans lower to original complete-format annotations, never root JSON or a new wire tag.
use super::{Command, actions::SetFormat};
use crate::Error;
use breditor_core::{
    codec::RichFormatsJsonCodec,
    document::{Format, FormatSet},
    rich_content::{RichDocument, RichSelectionCoverage, RichSelectionFormatChange},
};
use serde_json::Value;
fn literal(codec: &RichFormatsJsonCodec, format: &Format) -> Result<Value, Error> {
    let formats = FormatSet::try_from_formats(vec![format.clone()])
        .map_err(|_| Error::Contract("selection format literal"))?;
    let mut values: Vec<Value> = serde_json::from_str(
        &codec.encode(&formats).map_err(|_| Error::Contract("selection format encoding"))?,
    )?;
    values.pop().ok_or(Error::Contract("selection format literal"))
}
pub(super) fn commands(
    document: &RichDocument,
    coverage: &RichSelectionCoverage,
    changes: &[RichSelectionFormatChange],
    codec: &RichFormatsJsonCodec,
) -> Result<Vec<Command>, Error> {
    coverage.validate_document(document).map_err(|_| Error::Contract("selection format source"))?;
    let mut commands = vec![];
    // Preserve existing script-switch safety: removals precede complete sets.
    let changes = changes
        .iter()
        .filter(|c| matches!(c, RichSelectionFormatChange::Remove(_)))
        .chain(changes.iter().filter(|c| !matches!(c, RichSelectionFormatChange::Remove(_))));
    for change in changes {
        for span in coverage.text().iter().filter(|s| s.start() < s.end()) {
            let runs = if let RichSelectionFormatChange::Patch(patch) = change {
                patch
                    .capture_runs(document, span.block(), span.start(), span.end())
                    .map_err(|_| Error::Contract("selection format patch span"))?
                    .into_iter()
                    .map(|run| (run.start, run.end, run.format, true))
                    .collect()
            } else {
                vec![(
                    span.start(),
                    span.end(),
                    change.template().clone(),
                    matches!(change, RichSelectionFormatChange::Set(_)),
                )]
            };
            for (start, end, format, enabled) in runs {
                if commands.len() == 64 {
                    return Err(Error::Limit("selection format commands"));
                }
                commands.push(Command::SetFormat(SetFormat {
                    block: span.block().as_str().into(),
                    offset: u32::try_from(start.get()).map_err(|_| Error::Offset)?,
                    length: u32::try_from(end.get() - start.get()).map_err(|_| Error::Offset)?,
                    format: literal(codec, &format)?,
                    enabled,
                }));
            }
        }
    }
    if commands.is_empty() {
        return Err(Error::Contract("selection format empty lowering"));
    }
    Ok(commands)
}
