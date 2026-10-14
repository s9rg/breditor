//! Paired dimensions prevent mixed-width/height values from concurrent writers.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
/// Shared image dimensions or explicit intrinsic-size intent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResizeImage {
    /// Stable image block identity.
    pub block: String,
    /// Paired positive bounded width/height, or absence.
    pub size: Option<[u32; 2]>,
}
impl ResizeImage {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        let patch = if let Some([width, height]) = self.size {
            super::super::model::Patch {
                sets: BTreeMap::from([
                    ("breditor/width".into(), json!(width)),
                    ("breditor/height".into(), json!(height)),
                ]),
                removes: vec![],
            }
        } else {
            super::super::model::Patch {
                sets: BTreeMap::new(),
                removes: vec!["breditor/width".into(), "breditor/height".into()],
            }
        };
        super::super::model::write_patch(doc, &self.block, "image-size", &patch, stamp)
    }
}
