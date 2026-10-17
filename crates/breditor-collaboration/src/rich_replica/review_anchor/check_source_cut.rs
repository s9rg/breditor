//! A causal atom cut is not necessarily materializable: text marks have paired start/end atoms.
use crate::Error;
use loro::{IdSpan, JsonOpContent, JsonTextOp, LoroDoc, VersionVector};

pub(super) fn check_source_cut(doc: &LoroDoc, vector: &VersionVector) -> Result<(), Error> {
    for (writer, through) in vector.iter() {
        if *through <= 0 {
            continue;
        }
        // The pinned engine authors Mark and MarkEnd as consecutive atoms in the same transaction.
        // A prefix ending at Mark cannot be decoded safely by fork_at (including during Drop).
        // Inspect retained operations before creating a historical engine state, never catch a panic.
        let changes = doc.export_json_in_id_span(IdSpan::new(*writer, through - 1, *through));
        let mut operations = changes.iter().flat_map(|change| &change.ops);
        let operation =
            operations.next().ok_or(Error::Contract("review source cut is not retained"))?;
        if operations.next().is_some()
            || operation.counter != through - 1
            || operation.content.op_len() != 1
        {
            return Err(Error::Contract("review source cut atom continuity"));
        }
        if matches!(operation.content, JsonOpContent::Text(JsonTextOp::Mark { .. })) {
            return Err(Error::Contract("review source cut splits text mark"));
        }
    }
    Ok(())
}
