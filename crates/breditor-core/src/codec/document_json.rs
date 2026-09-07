use std::{borrow::Cow, collections::BTreeMap, sync::Arc};

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, DocumentCodecError, JsonFailure, document_encoding::DocumentEncoding,
        document_preflight::preflight_document_root,
    },
    document::{
        Document, ElementNode, Format, FormatSet, LocalInvariantError, NodeRef, PropertyInteger,
        PropertyMap, PropertyObject, PropertyValue, TextNode,
    },
    identity::{EntityId, QualifiedName},
    position::{MAX_PATH_DEPTH, NodePath},
    record::{
        DocumentEnvelopeHeader, DocumentRecordV1, FormatRecordV1, NodeRecordV1, PropertyMapRecord,
        PropertyValueRecord,
    },
    schema::{
        CompiledSchema, DocumentLimits, LimitKind, PropertyPathSegment, SchemaId, SchemaVersion,
        ValidationCode, ValidationDetail, ValidationIssue, ValidationReport, ValidationSubject,
        child_count_fits_point_protocol, point_protocol_child_count_maximum,
        require_exact_breditor_base,
    },
};

use super::json_size::JsonByteCounter;

/// Stable identifier for Breditor's original document envelope.
pub const DOCUMENT_FORMAT: &str = "breditor/document";

/// Wire version implemented by this codec.
pub const DOCUMENT_FORMAT_VERSION: u32 = 1;

/// Strict JSON codec bound to one immutable compiled schema and limit set.
#[derive(Clone, Debug)]
pub struct DocumentJsonCodec {
    schema: Arc<CompiledSchema>,
    limits: DocumentLimits,
}

impl DocumentJsonCodec {
    /// Creates a codec with default interactive-document limits.
    #[must_use]
    pub fn new(schema: CompiledSchema) -> Self {
        Self { schema: Arc::new(schema), limits: DocumentLimits::default() }
    }

    /// Replaces the resource limits used by future decoding calls.
    #[must_use]
    pub fn with_limits(mut self, limits: DocumentLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Returns the immutable compiled schema.
    #[must_use]
    pub fn schema(&self) -> &CompiledSchema {
        &self.schema
    }

    /// Returns the active decoding limits.
    #[must_use]
    pub const fn limits(&self) -> &DocumentLimits {
        &self.limits
    }

    /// Strictly decodes and completely validates a versioned document.
    ///
    /// No runtime document is returned unless the envelope, canonical record,
    /// limits, and full tree all pass.
    ///
    /// # Errors
    ///
    /// Returns [`DocumentCodecError`] for oversized input, malformed or
    /// non-canonical JSON, unsupported format identity, schema mismatch, or any
    /// validation problem.
    pub fn decode(&self, json: &str) -> Result<Document, DocumentCodecError> {
        self.ensure_v1_schema()?;
        if json.len() > self.limits.max_json_bytes {
            return Err(DocumentCodecError::InputTooLarge {
                actual: json.len(),
                maximum: self.limits.max_json_bytes,
            });
        }

        let header: DocumentEnvelopeHeader<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentCodecError::InvalidJson)?;
        if header.format != DOCUMENT_FORMAT {
            return Err(DocumentCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: DOCUMENT_FORMAT,
            });
        }
        if header.format_version != DOCUMENT_FORMAT_VERSION {
            return Err(DocumentCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: DOCUMENT_FORMAT_VERSION,
            });
        }
        let envelope: BorrowedDocumentEnvelopeV1<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentCodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        if &schema != self.schema.id() {
            return Err(DocumentCodecError::SchemaMismatch {
                expected: self.schema.id().clone(),
                found: schema,
            });
        }

        preflight_document_root(envelope.root.get(), &self.limits)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentCodecError::InvalidJson)?;
        let record: DocumentRecordV1 = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentCodecError::InvalidJson)?;

        let root = RecordBuilder::new().build_root(&record.root)?;
        Document::try_new(&self.schema, root, &self.limits).map_err(DocumentCodecError::from)
    }

    /// Encodes a validated runtime document into deterministic compact JSON.
    ///
    /// This encoding is stable for the current record version, but canonical
    /// cross-language hashing remains a later, separately specified layer.
    ///
    /// # Errors
    ///
    /// Returns [`DocumentCodecError::SchemaMismatch`] if the document belongs to
    /// another schema definition, [`DocumentCodecError::OutputTooLarge`] when
    /// its encoding exceeds the decode byte budget, or
    /// [`DocumentCodecError::Encoding`] on serialization failure. A document
    /// carrying the same durable fingerprint under another process-local proof
    /// is completely revalidated before it is encoded.
    pub fn encode(&self, document: &Document) -> Result<String, DocumentCodecError> {
        self.ensure_v1_schema()?;
        if document.schema() != self.schema.id() {
            return Err(DocumentCodecError::SchemaMismatch {
                expected: self.schema.id().clone(),
                found: document.schema().clone(),
            });
        }
        if document.schema_fingerprint() != self.schema.fingerprint() {
            return Err(DocumentCodecError::SchemaMismatch {
                expected: self.schema.id().clone(),
                found: document.schema().clone(),
            });
        }

        let revalidated;
        let document = if document.is_proven_for(&self.schema, &self.limits) {
            document
        } else {
            revalidated = Document::try_new(&self.schema, document.root().clone(), &self.limits)?;
            &revalidated
        };
        let encoding = DocumentEncoding::new(document);
        let maximum = self.limits.max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &encoding);
        if byte_counter.exceeded() {
            return Err(DocumentCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentCodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentCodecError::Encoding)
    }

    fn ensure_v1_schema(&self) -> Result<(), DocumentCodecError> {
        if require_exact_breditor_base(&self.schema).is_ok() {
            return Ok(());
        }
        Err(DocumentCodecError::SchemaMismatch {
            expected: CompiledSchema::breditor_base().id().clone(),
            found: self.schema.id().clone(),
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedDocumentEnvelopeV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: &'a RawValue,
    #[serde(borrow)]
    root: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

fn schema_id_from_raw(raw: &RawValue) -> Result<SchemaId, DocumentCodecError> {
    let record: BorrowedSchemaIdRecord<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(DocumentCodecError::InvalidJson)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        DocumentCodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        DocumentCodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

#[derive(Clone, Copy)]
enum PropertyOwner {
    Element,
    Format(usize),
}

pub(super) struct RecordBuilder {
    issues: Vec<ValidationIssue>,
}

impl RecordBuilder {
    pub(super) const fn new() -> Self {
        Self { issues: Vec::new() }
    }

    pub(super) fn build_root(mut self, record: &NodeRecordV1) -> Result<NodeRef, ValidationReport> {
        let root_path = NodePath::root();
        let root = self.build_node(record, &root_path);
        if self.issues.is_empty()
            && let Some(root) = root
        {
            return Ok(root);
        }
        if self.issues.is_empty() {
            self.issue(
                ValidationCode::InvalidRoot,
                &root_path,
                ValidationSubject::Node,
                ValidationDetail::None,
                "document root could not be constructed".to_owned(),
            );
        }
        Err(ValidationReport::from_issues(self.issues))
    }

    fn build_node(&mut self, record: &NodeRecordV1, path: &NodePath) -> Option<NodeRef> {
        match record {
            NodeRecordV1::Element { element_type, entity_id, properties, children } => {
                self.build_element(element_type, entity_id.as_deref(), properties, children, path)
            }
            NodeRecordV1::Text { text, formats } => self.build_text(text, formats, path),
        }
    }

    fn build_element(
        &mut self,
        encoded_kind: &str,
        encoded_entity_id: Option<&str>,
        property_record: &PropertyMapRecord,
        child_records: &[NodeRecordV1],
        path: &NodePath,
    ) -> Option<NodeRef> {
        let kind = match QualifiedName::try_new(encoded_kind) {
            Ok(kind) => Some(kind),
            Err(error) => {
                self.issue(
                    ValidationCode::InvalidElementName,
                    path,
                    ValidationSubject::ElementKind,
                    ValidationDetail::None,
                    format!("invalid element type `{encoded_kind}`: {error}"),
                );
                None
            }
        };
        let entity_id = encoded_entity_id.and_then(|encoded| match EntityId::try_new(encoded) {
            Ok(identity) => Some(identity),
            Err(error) => {
                self.issue(
                    ValidationCode::InvalidEntityId,
                    path,
                    ValidationSubject::EntityId,
                    ValidationDetail::None,
                    format!("invalid entity ID `{encoded}`: {error}"),
                );
                None
            }
        });
        let properties = self.build_properties(property_record, path, PropertyOwner::Element);
        let children = self.build_children(child_records, path);

        match (kind, properties, children) {
            (Some(kind), Some(properties), Some(children)) => {
                match ElementNode::try_new(kind, entity_id, properties, children) {
                    Ok(element) => Some(NodeRef::element(element)),
                    Err(error) => {
                        self.local_invariant_issue(&error, path, None);
                        None
                    }
                }
            }
            _ => None,
        }
    }

    fn build_children(
        &mut self,
        child_records: &[NodeRecordV1],
        path: &NodePath,
    ) -> Option<Vec<NodeRef>> {
        if !child_count_fits_point_protocol(child_records.len()) {
            let maximum = point_protocol_child_count_maximum();
            self.issue(
                ValidationCode::LimitExceeded,
                path,
                ValidationSubject::Limit { kind: LimitKind::ChildIndex },
                ValidationDetail::Limit {
                    kind: LimitKind::ChildIndex,
                    actual: child_records.len(),
                    maximum,
                },
                format!(
                    "child_count is {}; the point-protocol maximum is {maximum}",
                    child_records.len()
                ),
            );
            return None;
        }

        let mut children = Vec::with_capacity(child_records.len());
        let mut children_valid = true;
        for (index, child_record) in child_records.iter().enumerate() {
            let Ok(index) = u32::try_from(index) else {
                let maximum = usize::try_from(u32::MAX).unwrap_or(usize::MAX);
                self.issue(
                    ValidationCode::LimitExceeded,
                    path,
                    ValidationSubject::Limit { kind: LimitKind::ChildIndex },
                    ValidationDetail::Limit { kind: LimitKind::ChildIndex, actual: index, maximum },
                    format!("child_index is {index}; the protocol maximum is {maximum}"),
                );
                children_valid = false;
                break;
            };
            let Ok(child_path) = path.try_child(index) else {
                self.issue(
                    ValidationCode::LimitExceeded,
                    path,
                    ValidationSubject::Limit { kind: LimitKind::NodeDepth },
                    ValidationDetail::Limit {
                        kind: LimitKind::NodeDepth,
                        actual: path.len() + 1,
                        maximum: MAX_PATH_DEPTH,
                    },
                    format!(
                        "node_depth is {}; the protocol maximum is {MAX_PATH_DEPTH}",
                        path.len() + 1
                    ),
                );
                children_valid = false;
                break;
            };
            if let Some(child) = self.build_node(child_record, &child_path) {
                children.push(child);
            } else {
                children_valid = false;
            }
        }
        children_valid.then_some(children)
    }

    fn build_text(
        &mut self,
        text: &str,
        format_records: &[FormatRecordV1],
        path: &NodePath,
    ) -> Option<NodeRef> {
        let mut formats = Vec::with_capacity(format_records.len());
        let mut original_format_indices = Vec::with_capacity(format_records.len());
        let mut valid = true;
        for (index, format_record) in format_records.iter().enumerate() {
            let kind = match QualifiedName::try_new(&format_record.format_type) {
                Ok(kind) => kind,
                Err(error) => {
                    valid = false;
                    self.issue(
                        ValidationCode::InvalidFormatName,
                        path,
                        ValidationSubject::Format { index },
                        ValidationDetail::None,
                        format!("invalid format type `{}`: {error}", format_record.format_type),
                    );
                    continue;
                }
            };
            let Some(properties) = self.build_properties(
                &format_record.properties,
                path,
                PropertyOwner::Format(index),
            ) else {
                valid = false;
                continue;
            };
            formats.push(Format::new(kind, properties));
            original_format_indices.push(index);
        }

        let formats = match FormatSet::try_from_sorted(formats) {
            Ok(formats) => Some(formats),
            Err(error) => {
                valid = false;
                self.format_set_invariant_issue(&error, path, &original_format_indices);
                None
            }
        };
        if !valid {
            return None;
        }
        let formats = formats?;
        match TextNode::try_new(text.to_owned(), formats) {
            Ok(text) => Some(NodeRef::text(text)),
            Err(error) => {
                self.local_invariant_issue(&error, path, None);
                None
            }
        }
    }

    fn build_properties(
        &mut self,
        record: &PropertyMapRecord,
        path: &NodePath,
        owner: PropertyOwner,
    ) -> Option<PropertyMap> {
        let mut values = BTreeMap::new();
        let mut valid = true;
        for (encoded_name, value_record) in &record.0 {
            let name = match QualifiedName::try_new(encoded_name) {
                Ok(name) => name,
                Err(error) => {
                    valid = false;
                    self.issue(
                        ValidationCode::InvalidPropertyName,
                        path,
                        property_subject(owner, encoded_name, &[]),
                        ValidationDetail::None,
                        format!("invalid property name `{encoded_name}`: {error}"),
                    );
                    continue;
                }
            };
            let mut value_path = Vec::new();
            if let Some(value) =
                self.build_property_value(value_record, path, owner, encoded_name, &mut value_path)
            {
                values.insert(name, value);
            } else {
                valid = false;
            }
        }
        valid.then(|| PropertyMap::from_map(values))
    }

    fn build_property_value(
        &mut self,
        record: &PropertyValueRecord,
        node_path: &NodePath,
        owner: PropertyOwner,
        property_name: &str,
        value_path: &mut Vec<PropertyPathSegment>,
    ) -> Option<PropertyValue> {
        match record {
            PropertyValueRecord::Null => Some(PropertyValue::null()),
            PropertyValueRecord::Boolean(value) => Some(PropertyValue::boolean(*value)),
            PropertyValueRecord::Integer(value) => {
                PropertyInteger::try_new(*value).ok().map(PropertyValue::from_integer)
            }
            PropertyValueRecord::String(value) => Some(PropertyValue::from_string(value)),
            PropertyValueRecord::Array(records) => {
                let mut values = Vec::with_capacity(records.len());
                for (index, record) in records.iter().enumerate() {
                    value_path.push(PropertyPathSegment::Index(index));
                    let value = self.build_property_value(
                        record,
                        node_path,
                        owner,
                        property_name,
                        value_path,
                    );
                    value_path.pop();
                    values.push(value?);
                }
                Some(PropertyValue::array(values))
            }
            PropertyValueRecord::Object(records) => {
                let mut values = BTreeMap::new();
                for (key, record) in records {
                    value_path.push(PropertyPathSegment::Key(Arc::from(key.as_str())));
                    let value = self.build_property_value(
                        record,
                        node_path,
                        owner,
                        property_name,
                        value_path,
                    );
                    value_path.pop();
                    values.insert(key.clone(), value?);
                }
                match PropertyObject::try_from_map(values) {
                    Ok(values) => Some(PropertyValue::object(values)),
                    Err(LocalInvariantError::InvalidPropertyObjectKey { key }) => {
                        let mut invalid_path = value_path.clone();
                        invalid_path.push(PropertyPathSegment::Key(Arc::from(key.as_str())));
                        self.issue(
                            ValidationCode::InvalidPropertyObjectKey,
                            node_path,
                            property_subject(owner, property_name, &invalid_path),
                            ValidationDetail::None,
                            format!(
                                "nested property-object key `{key}` violates the ASCII key grammar"
                            ),
                        );
                        None
                    }
                    Err(error) => {
                        self.local_invariant_issue(&error, node_path, None);
                        None
                    }
                }
            }
        }
    }

    fn local_invariant_issue(
        &mut self,
        error: &LocalInvariantError,
        path: &NodePath,
        format_index: Option<usize>,
    ) {
        let (code, subject, detail) = match error {
            LocalInvariantError::EmptyText => {
                (ValidationCode::EmptyText, ValidationSubject::Text, ValidationDetail::None)
            }
            LocalInvariantError::TextTooLong => {
                let maximum = usize::try_from(u32::MAX).unwrap_or(usize::MAX);
                (
                    ValidationCode::LimitExceeded,
                    ValidationSubject::Limit { kind: LimitKind::TextUtf16Units },
                    ValidationDetail::Limit {
                        kind: LimitKind::TextUtf16Units,
                        actual: maximum.saturating_add(1),
                        maximum,
                    },
                )
            }
            LocalInvariantError::DuplicateFormat { index } => (
                ValidationCode::DuplicateFormat,
                ValidationSubject::Format { index: *index },
                ValidationDetail::None,
            ),
            LocalInvariantError::NonCanonicalFormatOrder { index } => (
                ValidationCode::NonCanonicalFormatOrder,
                ValidationSubject::Format { index: *index },
                ValidationDetail::None,
            ),
            LocalInvariantError::AdjacentEqualText { left_index, .. } => (
                ValidationCode::AdjacentEqualText,
                ValidationSubject::Child { index: *left_index },
                ValidationDetail::None,
            ),
            LocalInvariantError::InvalidPropertyObjectKey { key } => (
                ValidationCode::InvalidPropertyObjectKey,
                property_subject(
                    format_index.map_or(PropertyOwner::Element, PropertyOwner::Format),
                    key,
                    &[],
                ),
                ValidationDetail::None,
            ),
        };
        self.issue(code, path, subject, detail, error.to_string());
    }

    fn format_set_invariant_issue(
        &mut self,
        error: &LocalInvariantError,
        path: &NodePath,
        original_indices: &[usize],
    ) {
        let (code, compact_index) = match error {
            LocalInvariantError::DuplicateFormat { index } => {
                (ValidationCode::DuplicateFormat, *index)
            }
            LocalInvariantError::NonCanonicalFormatOrder { index } => {
                (ValidationCode::NonCanonicalFormatOrder, *index)
            }
            _ => {
                self.local_invariant_issue(error, path, None);
                return;
            }
        };
        let original_index = original_indices.get(compact_index).copied().unwrap_or(compact_index);
        self.issue(
            code,
            path,
            ValidationSubject::Format { index: original_index },
            ValidationDetail::None,
            error.to_string(),
        );
    }

    fn issue(
        &mut self,
        code: ValidationCode,
        path: &NodePath,
        subject: ValidationSubject,
        detail: ValidationDetail,
        message: String,
    ) {
        self.issues.push(ValidationIssue::new(code, path.clone(), subject, detail, message));
    }
}

fn property_subject(
    owner: PropertyOwner,
    name: &str,
    value_path: &[PropertyPathSegment],
) -> ValidationSubject {
    let name = Arc::from(name);
    let value_path = Arc::from(value_path);
    match owner {
        PropertyOwner::Element => ValidationSubject::ElementProperty { name, value_path },
        PropertyOwner::Format(format_index) => {
            ValidationSubject::FormatProperty { format_index, name, value_path }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        codec::{DocumentCodecError, DocumentJsonCodec},
        document::DocumentProofMismatch,
        schema::{CompiledSchema, DocumentLimits},
    };

    const MINIMAL_DOCUMENT: &str = concat!(
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
        r#"]}}"#,
    );

    #[test]
    fn encode_revalidates_same_fingerprint_from_an_independent_proof() -> Result<(), Box<dyn Error>>
    {
        let source = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let document = source.decode(MINIMAL_DOCUMENT)?;
        let target = DocumentJsonCodec::new(CompiledSchema::breditor_base());

        assert_eq!(
            document.proof_mismatch(target.schema(), target.limits()),
            Some(DocumentProofMismatch::CompiledProof)
        );
        assert_eq!(target.encode(&document)?, MINIMAL_DOCUMENT);
        Ok(())
    }

    #[test]
    fn encode_revalidates_under_a_different_runtime_policy() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let source = DocumentJsonCodec::new(schema.clone());
        let document = source.decode(MINIMAL_DOCUMENT)?;
        let target =
            DocumentJsonCodec::new(schema).with_limits(DocumentLimits::default().with_max_nodes(2));

        assert_eq!(
            document.proof_mismatch(target.schema(), target.limits()),
            Some(DocumentProofMismatch::ValidationPolicy)
        );
        assert_eq!(target.encode(&document)?, MINIMAL_DOCUMENT);
        Ok(())
    }

    #[test]
    fn encode_rejects_a_same_id_document_with_another_fingerprint() -> Result<(), Box<dyn Error>> {
        let source = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let document = source.decode(MINIMAL_DOCUMENT)?;
        let variant = DocumentJsonCodec::new(CompiledSchema::test_semantic_variant_same_id());

        assert_eq!(document.schema(), variant.schema().id());
        assert_ne!(document.schema_fingerprint(), variant.schema().fingerprint());
        assert!(matches!(
            variant.encode(&document),
            Err(DocumentCodecError::SchemaMismatch { .. })
        ));
        Ok(())
    }

    #[test]
    fn document_v1_decode_remains_closed_to_non_base_definitions() {
        let variant = DocumentJsonCodec::new(CompiledSchema::test_semantic_variant_same_id());

        assert!(matches!(
            variant.decode(MINIMAL_DOCUMENT),
            Err(DocumentCodecError::SchemaMismatch { .. })
        ));
    }
}
