//! Sealed profile selects causal semantics; a remote descriptor never selects them.
//!
//! V1 deliberately writes no extra genesis operation. V2 and V3 have distinct
//! causal markers, checked against the compiled schema before projection or publication.
use crate::Error;
use breditor_core::codec::DocumentJsonCodecV2;
use loro::LoroDoc;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Protocol {
    Original,
    StructuralV2,
    LayoutV3,
}
impl Protocol {
    pub fn from_codec(codec: &DocumentJsonCodecV2) -> Result<Self, Error> {
        match codec.schema().rich_content_revision() {
            Some(1) => Ok(Self::Original),
            Some(2) => Ok(Self::StructuralV2),
            Some(3) => Ok(Self::LayoutV3),
            _ => Err(Error::Contract("shared profile rich grammar revision")),
        }
    }
    pub const fn model(self) -> u32 {
        match self {
            Self::Original => super::MODEL_VERSION,
            Self::StructuralV2 => 12,
            Self::LayoutV3 => 13,
        }
    }
    pub const fn journal(self) -> u32 {
        match self {
            Self::Original => super::session::JOURNAL_VERSION,
            Self::StructuralV2 => 13,
            Self::LayoutV3 => 14,
        }
    }
    pub fn text(self, kind: &str) -> bool {
        matches!(kind, "breditor/paragraph" | "breditor/heading")
            || (self.structural() && kind == "breditor/code-block")
    }
    pub fn flow(self, kind: &str) -> bool {
        matches!(
            kind,
            "breditor/paragraph"
                | "breditor/heading"
                | "breditor/bullet-list"
                | "breditor/ordered-list"
                | "breditor/table"
                | "breditor/image"
        ) || (self.structural()
            && matches!(
                kind,
                "breditor/blockquote"
                    | "breditor/code-block"
                    | "breditor/horizontal-rule"
                    | "breditor/task-list"
            ))
    }
    pub fn require_original(codec: &DocumentJsonCodecV2) -> Result<(), Error> {
        if Self::from_codec(codec)? != Self::Original {
            return Err(Error::Contract("shared model 11 requires rich-language V1"));
        }
        Ok(())
    }
    pub fn seed(self, doc: &LoroDoc) -> Result<(), Error> {
        if self.structural() {
            doc.get_map("binding").insert("model-version", self.model().to_string())?;
            doc.commit();
        }
        Ok(())
    }
    pub fn require(self, doc: &LoroDoc) -> Result<(), Error> {
        if Self::read(doc)? != self {
            return Err(Error::Contract("immutable shared causal model binding"));
        }
        Ok(())
    }
    pub fn read(doc: &LoroDoc) -> Result<Self, Error> {
        match doc.get_map("binding").get("model-version") {
            None => Ok(Self::Original),
            Some(value)
                if value
                    .as_value()
                    .and_then(loro::LoroValue::as_string)
                    .is_some_and(|value| value.as_str() == "12") =>
            {
                Ok(Self::StructuralV2)
            }
            Some(value)
                if value
                    .as_value()
                    .and_then(loro::LoroValue::as_string)
                    .is_some_and(|value| value.as_str() == "13") =>
            {
                Ok(Self::LayoutV3)
            }
            _ => Err(Error::Contract("shared causal model marker")),
        }
    }
    pub const fn structural(self) -> bool {
        matches!(self, Self::StructuralV2 | Self::LayoutV3)
    }
    pub const fn rich_language(self) -> u32 {
        match self {
            Self::Original => 1,
            Self::StructuralV2 => 2,
            Self::LayoutV3 => 3,
        }
    }
    pub fn require_structural(doc: &LoroDoc) -> Result<(), Error> {
        if !Self::read(doc)?.structural() {
            return Err(Error::Contract("shared structural V2/V3 model required"));
        }
        Ok(())
    }
}
