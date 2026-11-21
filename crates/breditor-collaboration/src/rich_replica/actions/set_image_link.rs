//! V4 image link: href and new-window publish as ONE paired field (`image-link`), so a link and
//! its target window are always one atomic choice, independent from alt, asset, size and caption.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::PropertyValue,
    identity::QualifiedName,
    rich_content::{BlockId, RichDocument, RichImageHref},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

const HREF: &str = "breditor/image-href";
const NEW_WINDOW: &str = "breditor/image-link-new-window";

/// Set, replace or clear one image's link (explicit model 14 / rich V4 only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetImageLink {
    /// Stable image block identity.
    pub block: String,
    /// Canonical absolute HTTP(S) target in the frozen native subset, or `None` to clear.
    pub href: Option<String>,
    /// Open in a new window; only with a target (same window is absence).
    #[serde(default)]
    pub new_window: bool,
}
impl SetImageLink {
    /// Exact admission against the current projection: V4 profile, canonical target, an
    /// image block and the accessible-name rule (a decorative image is never linked).
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        if !codec.schema().supports_rich_image_links() {
            return Err(Error::Contract("shared image links require rich language V4"));
        }
        match &self.href {
            Some(href) => {
                RichImageHref::try_new(href.clone())
                    .map_err(|_| Error::Contract("shared image link target"))?;
            }
            None if self.new_window => {
                return Err(Error::Contract("shared image link new window requires a target"));
            }
            None => {}
        }
        if self.href.is_some() && decorative(document, &self.block)? {
            return Err(Error::Contract("a decorative image cannot be linked"));
        }
        super::prepare_field(doc, &self.block, "image-link")
    }
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        let patch = match &self.href {
            Some(href) if self.new_window => super::super::model::Patch {
                sets: BTreeMap::from([
                    (HREF.into(), json!(href)),
                    (NEW_WINDOW.into(), json!(true)),
                ]),
                removes: vec![],
            },
            Some(href) => super::super::model::Patch {
                sets: BTreeMap::from([(HREF.into(), json!(href))]),
                removes: vec![NEW_WINDOW.into()],
            },
            None => super::super::model::Patch {
                sets: BTreeMap::new(),
                removes: vec![HREF.into(), NEW_WINDOW.into()],
            },
        };
        super::super::model::write_patch(doc, &self.block, "image-link", &patch, stamp)
    }
}

/// Whether the visible image block is decorative (missing or non-image blocks are refused).
fn decorative(document: &RichDocument, block: &str) -> Result<bool, Error> {
    let id = BlockId::try_new(block).map_err(|_| Error::Contract("shared image link block"))?;
    let path = document.block_path(&id).ok_or(Error::Contract("shared image link block"))?;
    let node = document
        .document()
        .node_at(path)
        .ok()
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or(Error::Contract("shared image link block"))?;
    if node.kind().as_str() != "breditor/image" {
        return Err(Error::Contract("shared image link target kind"));
    }
    Ok(node
        .properties()
        .get(
            &QualifiedName::try_new("breditor/decorative")
                .map_err(|_| Error::Contract("shared image property"))?,
        )
        .and_then(PropertyValue::as_boolean)
        == Some(true))
}
