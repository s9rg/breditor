//! Semantic flat-list metadata without DOM inference or optional-number sentinels.
use super::BreditorProjection;
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

impl BreditorProjection {
    /// Returns the marker family only for a list container in this snapshot.
    #[must_use]
    pub fn list_kind(&self, index: u32) -> Option<&'static str> {
        match self.node(index)?.node().as_element()?.kind().as_str() {
            "breditor/bullet-list" => Some("bullet"),
            "breditor/ordered-list" => Some("ordered"),
            _ => None,
        }
    }

    /// Returns a numbered container's explicit first ordinal, never an item value.
    #[must_use]
    pub fn ordered_list_start(&self, index: u32) -> Option<u32> {
        if self.list_kind(index)? != "ordered" {
            return None;
        }
        let element = self.node(index)?.node().as_element()?;
        let (_, value) =
            element.properties().iter().find(|(name, _)| name.as_str() == "breditor/start")?;
        u32::try_from(value.as_integer()?.get())
            .ok()
            .filter(|value| (1..=breditor_core::block::MAX_ORDERED_LIST_ORDINAL).contains(value))
    }
}

#[wasm_bindgen]
impl BreditorProjection {
    /// Returns the checked marker family; other nodes and invalid indices yield undefined.
    #[must_use]
    #[wasm_bindgen(js_name = listKind, unchecked_return_type = "'bullet' | 'ordered' | undefined")]
    pub fn list_kind_js(&self, index: u32) -> JsValue {
        self.list_kind(index).map_or(JsValue::UNDEFINED, JsValue::from)
    }

    /// Returns the explicit positive start of an ordered list, otherwise undefined.
    /// Indices are snapshot-local coordinates; held projections remain immutable.
    #[must_use]
    #[wasm_bindgen(js_name = orderedListStart, unchecked_return_type = "number | undefined")]
    pub fn ordered_list_start_js(&self, index: u32) -> JsValue {
        self.ordered_list_start(index).map_or(JsValue::UNDEFINED, JsValue::from)
    }
}
