//! Asset identity and its fresh binding generation are one shared semantic field.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
/// Paired shared asset replacement; bytes and upload state stay host-owned.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplaceImage {
    /// Stable image block identity.
    pub block: String,
    /// Immutable host asset identity.
    pub asset: String,
    /// Fresh binding generation.
    pub generation: String,
}
impl ReplaceImage {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        super::super::model::write_patch(
            doc,
            &self.block,
            "image-asset",
            &super::super::model::Patch {
                sets: BTreeMap::from([
                    ("breditor/asset-id".into(), json!(self.asset)),
                    ("breditor/asset-generation".into(), json!(self.generation)),
                ]),
                removes: vec![],
            },
            stamp,
        )
    }
}
