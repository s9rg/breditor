use crate::{
    identity::QualifiedName,
    schema::{SchemaId, SchemaVersion},
};

/// The immutable schema used to validate a document.
///
/// The first vertical proof intentionally ships one small schema. A declarative
/// schema compiler will replace the private rule representation after the core
/// content and operation laws are established.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledSchema {
    id: SchemaId,
    document_kind: QualifiedName,
    paragraph_kind: QualifiedName,
    strong_kind: QualifiedName,
}

impl CompiledSchema {
    /// Returns the minimal Breditor proof schema.
    ///
    /// It accepts one document root, one or more paragraphs, non-empty text
    /// leaves, and the `breditor/strong` format.
    #[must_use]
    pub fn breditor_base() -> Self {
        Self {
            id: SchemaId::new(
                QualifiedName::from_known_static("breditor/base"),
                SchemaVersion::one(),
            ),
            document_kind: QualifiedName::from_known_static("breditor/document"),
            paragraph_kind: QualifiedName::from_known_static("breditor/paragraph"),
            strong_kind: QualifiedName::from_known_static("breditor/strong"),
        }
    }

    /// Returns the persisted schema identity.
    #[must_use]
    pub const fn id(&self) -> &SchemaId {
        &self.id
    }

    /// Returns the required root element kind.
    #[must_use]
    pub const fn root_kind(&self) -> &QualifiedName {
        &self.document_kind
    }

    pub(crate) fn paragraph_kind(&self) -> &QualifiedName {
        &self.paragraph_kind
    }

    pub(crate) fn strong_kind(&self) -> &QualifiedName {
        &self.strong_kind
    }

    pub(crate) fn is_text_container(&self, kind: &QualifiedName) -> bool {
        kind == &self.paragraph_kind
    }

    pub(crate) fn allows_text_format(&self, kind: &QualifiedName) -> bool {
        kind == &self.strong_kind
    }

    pub(crate) fn knows_element(&self, kind: &QualifiedName) -> bool {
        kind == &self.document_kind || kind == &self.paragraph_kind
    }
}

impl Default for CompiledSchema {
    fn default() -> Self {
        Self::breditor_base()
    }
}
