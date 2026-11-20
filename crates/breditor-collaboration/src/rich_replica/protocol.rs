//! Sealed profile selects causal semantics; a remote descriptor never selects them.
//!
//! V1 deliberately writes no extra genesis operation. V2, V3 and V4 have distinct
//! causal markers, checked against the compiled schema before projection or publication.
use crate::Error;
use breditor_core::codec::DocumentJsonCodecV2;
use loro::LoroDoc;

/// Descriptor fields of the eight frozen V4 slices, each version 1.
pub(super) const V4_SLICE_VERSIONS: [&str; 8] = [
    "listNumberingVersion",
    "textLanguageVersion",
    "imageLinkVersion",
    "detailsVersion",
    "mentionVersion",
    "tableCaptionVersion",
    "pageBreakVersion",
    "bookmarkVersion",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Protocol {
    Original,
    StructuralV2,
    LayoutV3,
    /// Frozen rich language V4: causal model 14 and journal 15.
    LanguageV4,
}
impl Protocol {
    pub fn from_codec(codec: &DocumentJsonCodecV2) -> Result<Self, Error> {
        match codec.schema().rich_content_revision() {
            Some(1) => Ok(Self::Original),
            Some(2) => Ok(Self::StructuralV2),
            Some(3) => Ok(Self::LayoutV3),
            Some(4) => Ok(Self::LanguageV4),
            _ => Err(Error::Contract("shared profile rich grammar revision")),
        }
    }
    pub const fn model(self) -> u32 {
        match self {
            Self::Original => super::MODEL_VERSION,
            Self::StructuralV2 => 12,
            Self::LayoutV3 => 13,
            Self::LanguageV4 => 14,
        }
    }
    pub const fn journal(self) -> u32 {
        match self {
            Self::Original => super::session::JOURNAL_VERSION,
            Self::StructuralV2 => 13,
            Self::LayoutV3 => 14,
            Self::LanguageV4 => 15,
        }
    }
    pub fn text(self, kind: &str) -> bool {
        matches!(kind, "breditor/paragraph" | "breditor/heading")
            || (self.structural() && kind == "breditor/code-block")
            || (self.v4() && kind == "breditor/details-summary")
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
            || (self.v4() && kind == "breditor/details")
    }
    /// V4 root-only kinds: admitted directly below the document and nowhere else.
    pub fn root_only(self, kind: &str) -> bool {
        self.v4() && kind == "breditor/page-break"
    }
    /// Text blocks owning the four bounded layout fields. A V4 section summary is a text
    /// line that carries no block layout.
    pub fn layout_owner(self, kind: &str) -> bool {
        self.layout() && self.text(kind) && kind != "breditor/details-summary"
    }
    pub const fn v4(self) -> bool {
        matches!(self, Self::LanguageV4)
    }
    /// Bounded block layout fields are owned by V3 and, unchanged, by V4.
    pub const fn layout(self) -> bool {
        matches!(self, Self::LayoutV3 | Self::LanguageV4)
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
            Some(value)
                if value
                    .as_value()
                    .and_then(loro::LoroValue::as_string)
                    .is_some_and(|value| value.as_str() == "14") =>
            {
                Ok(Self::LanguageV4)
            }
            _ => Err(Error::Contract("shared causal model marker")),
        }
    }
    pub const fn structural(self) -> bool {
        matches!(self, Self::StructuralV2 | Self::LayoutV3 | Self::LanguageV4)
    }
    pub const fn rich_language(self) -> u32 {
        match self {
            Self::Original => 1,
            Self::StructuralV2 => 2,
            Self::LayoutV3 => 3,
            Self::LanguageV4 => 4,
        }
    }
    /// Add the explicit language/capability fields of a profile or owner descriptor.
    /// V1 adds none; V4 names every frozen slice so a host can never confuse it with V3.
    pub fn describe(self, descriptor: &mut serde_json::Value) {
        if self.structural() {
            descriptor["richLanguageVersion"] = serde_json::json!(self.rich_language());
        }
        if self.layout() {
            descriptor["blockLayoutVersion"] = serde_json::json!(1);
        }
        if self.v4() {
            for name in V4_SLICE_VERSIONS {
                descriptor[name] = serde_json::json!(1);
            }
        }
    }
    pub fn require_structural(doc: &LoroDoc) -> Result<(), Error> {
        if !Self::read(doc)?.structural() {
            return Err(Error::Contract("shared structural V2/V3/V4 model required"));
        }
        Ok(())
    }
}
