//! Strict directional scalar-range input; native caret admission remains authoritative.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::{Error, rich_replica::selection::Selection};
use breditor_core::rich_content::RichTypingDeleteDirection;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Direction {
    Backward,
    Forward,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Input {
    selection: Selection,
    direction: Direction,
    #[serde(deserialize_with = "super::clock")]
    clock_ms: u64,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Delete an admitted adjacent target without first overwriting the actual before-caret.
    pub fn delete_typing_range(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if self.inner.is_read_only() {
            return Err(error(Error::ReadOnly));
        }
        let value: Input = super::decode(input).map_err(error)?;
        let direction = match value.direction {
            Direction::Backward => RichTypingDeleteDirection::Backward,
            Direction::Forward => RichTypingDeleteDirection::Forward,
        };
        self.inner
            .delete_typing_range_guarded(
                &observation.inner,
                &value.selection,
                direction,
                value.clock_ms,
            )
            .map_err(error)
    }
}
