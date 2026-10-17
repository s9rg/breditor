//! Export only the locally leased review writer's bounded event prefix.
use super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Freeze transport at the captured authored end, so later edits cannot hold an older flush hostage.
    pub fn export_review_through(
        &self,
        observed: &RichSharedObservation,
        after: &str,
        through: &str,
    ) -> Result<String, JsValue> {
        self.check_review(observed)?;
        let parse = |value: &str| -> Result<u64, JsValue> {
            let counter = value
                .parse::<u64>()
                .map_err(|_| error(Error::Contract("review export counter")))?;
            if value.len() > 20 || counter.to_string() != value {
                return Err(error(Error::Contract("canonical review export counter")));
            }
            Ok(counter)
        };
        self.review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .export_frame_through(parse(after)?, parse(through)?)
            .map_err(error)
    }
    /// Exact review counter strings avoid the browser Number boundary; no document frame is returned.
    pub fn export_review(
        &self,
        observed: &RichSharedObservation,
        after: &str,
    ) -> Result<String, JsValue> {
        self.check_review(observed)?;
        let value =
            after.parse::<u64>().map_err(|_| error(Error::Contract("review export counter")))?;
        if after.len() > 20 || value.to_string() != after {
            return Err(error(Error::Contract("canonical review export counter")));
        }
        self.review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .export_frame(value)
            .map_err(error)
    }
}
