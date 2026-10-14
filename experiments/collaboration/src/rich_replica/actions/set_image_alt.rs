//! Description and decorative intent publish atomically, independently from assets and size.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
/// Paired shared image alternative-text update.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetImageAlt {
    /// Stable image block identity.
    pub block: String,
    /// Description; decorative images require an empty value.
    pub text: String,
    /// Deliberate decorative intent.
    pub decorative: bool,
}
impl SetImageAlt {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        super::super::model::write_patch(
            doc,
            &self.block,
            "image-alt",
            &super::super::model::Patch {
                sets: BTreeMap::from([
                    ("breditor/alt-text".into(), json!(self.text)),
                    ("breditor/decorative".into(), json!(self.decorative)),
                ]),
                removes: vec![],
            },
            stamp,
        )
    }
}
