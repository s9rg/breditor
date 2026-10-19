//! Explicit pure retained-image read; no new mutation or recovery family.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use breditor_core::codec::{RichAssetRetention, encode_rich_asset_references};
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// String revision one requires the complete guarded retained-image read.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=retainedAssetReferencesVersion)]
    pub fn retained_asset_references_version(&self) -> String {
        "1".into()
    }

    /// Read current and retained local history without changing selection, typing or Undo/Redo.
    #[must_use]
    #[wasm_bindgen(js_name=retainedAssetReferencesJson)]
    pub fn retained_asset_references_json(
        &self,
        observed: &BreditorRichObservation,
    ) -> BreditorStringResult {
        let value = (|| {
            let references = self
                .inner
                .retained_asset_references(&observed.inner)
                .map_err(|_| error::rejected("breditor_rich.retained_asset_references_read"))?;
            encode_rich_asset_references(
                self.inner.state().document(),
                self.inner.state().revision().get(),
                RichAssetRetention::LocalHistory,
                &references,
            )
            .map_err(|_| error::rejected("breditor_rich.retained_asset_references_encoding"))
        })();
        match value {
            Ok(value) => BreditorStringResult::from_value(value),
            Err(error) => BreditorStringResult::from_error(error),
        }
    }
}
