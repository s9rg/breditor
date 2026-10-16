//! First-key replacement clock is an exact decimal, never a JS-number coordinate.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Start one native replacement/typing group; subsequent caret user input may join.
    pub fn replace_atom_typing_text(
        &mut self,
        observation: &RichSharedObservation,
        paragraph: &str,
        text: &str,
        clock_ms: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if self.inner.is_read_only() {
            return Err(error(Error::ReadOnly));
        }
        let clock =
            clock_ms.parse::<u64>().map_err(|_| error(Error::Contract("atom typing clock")))?;
        if clock.to_string() != clock_ms {
            return Err(error(Error::Contract("atom typing clock")));
        }
        self.inner
            .replace_atom_typing_text_guarded(&observation.inner, paragraph, text, clock)
            .map_err(error)
    }
}
