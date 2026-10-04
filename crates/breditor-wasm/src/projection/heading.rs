//! Opt-in semantic heading rank, without JSON or browser tag inference.
use super::BreditorProjection;
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

impl BreditorProjection {
    /// Returns the checked rank only for a heading element in this snapshot.
    #[must_use]
    pub fn heading_level(&self, index: u32) -> Option<u32> {
        let element = self.node(index)?.node().as_element()?;
        if element.kind().as_str() != "breditor/heading" {
            return None;
        }
        let (_, value) =
            element.properties().iter().find(|(name, _)| name.as_str() == "breditor/level")?;
        u32::try_from(value.as_integer()?.get()).ok().filter(|level| (1..=6).contains(level))
    }
}

#[wasm_bindgen]
impl BreditorProjection {
    /// Returns a heading's semantic rank 1–6; all other nodes yield undefined.
    ///
    /// Explicit JS values avoid optional-number sentinel transport. Indexes
    /// remain snapshot-local read-only coordinates, not persisted identities.
    #[must_use]
    #[wasm_bindgen(js_name = headingLevel, unchecked_return_type = "number | undefined")]
    pub fn heading_level_js(&self, index: u32) -> JsValue {
        self.heading_level(index).map_or(JsValue::UNDEFINED, JsValue::from)
    }
}
