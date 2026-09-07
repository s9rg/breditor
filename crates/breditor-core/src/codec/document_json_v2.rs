use std::{borrow::Cow, sync::Arc};

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, document_encoding::DocumentEncodingV2,
        document_preflight::preflight_document_root,
    },
    document::Document,
    identity::QualifiedName,
    record::{DocumentEnvelopeHeader, DocumentRecordV2},
    schema::{
        CompiledSchema, DocumentLimits, DurableSchemaBinding, SchemaFingerprint, SchemaId,
        SchemaVersion, require_schema_binding, require_schema_fingerprint, require_schema_id,
    },
};

use super::{
    document_json::{DOCUMENT_FORMAT, RecordBuilder},
    document_v2_error::DocumentV2CodecError,
    json_size::JsonByteCounter,
};

/// Wire version accepted and emitted by [`DocumentJsonCodecV2`].
pub const DOCUMENT_V2_FORMAT_VERSION: u32 = 2;

/// Strict JSON codec for fingerprint-bearing Document V2 values.
///
/// The codec is bound to one immutable compiled schema and requires both its
/// selector and complete-definition fingerprint on every admitted value.
#[derive(Clone, Debug)]
pub struct DocumentJsonCodecV2 {
    schema: Arc<CompiledSchema>,
    limits: DocumentLimits,
}

impl DocumentJsonCodecV2 {
    /// Creates a V2 codec with default interactive-document limits.
    #[must_use]
    pub fn new(schema: CompiledSchema) -> Self {
        Self { schema: Arc::new(schema), limits: DocumentLimits::default() }
    }

    /// Replaces the resource limits used by future decoding and encoding calls.
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

    /// Returns the active document limits.
    #[must_use]
    pub const fn limits(&self) -> &DocumentLimits {
        &self.limits
    }

    /// Strictly decodes and completely validates a Document V2 value.
    ///
    /// Binding admission checks the parsed schema selector first and its
    /// fingerprint second. A mismatch never consumes or publishes a document.
    ///
    /// # Errors
    ///
    /// Returns [`DocumentV2CodecError`] for oversized input, malformed or
    /// non-canonical record data, unsupported format identity, malformed or
    /// mismatched schema binding, or complete tree-validation failure.
    pub fn decode(&self, json: &str) -> Result<Document, DocumentV2CodecError> {
        if json.len() > self.limits.max_json_bytes() {
            return Err(DocumentV2CodecError::InputTooLarge {
                actual: json.len(),
                maximum: self.limits.max_json_bytes(),
            });
        }

        let header: DocumentEnvelopeHeader<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentV2CodecError::InvalidJson)?;
        if header.format != DOCUMENT_FORMAT {
            return Err(DocumentV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: DOCUMENT_FORMAT,
            });
        }
        if header.format_version != DOCUMENT_V2_FORMAT_VERSION {
            return Err(DocumentV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: DOCUMENT_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedDocumentEnvelopeV2<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentV2CodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        require_schema_id(&self.schema, &schema)?;
        let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
        require_schema_fingerprint(&self.schema, fingerprint)?;

        preflight_document_root(envelope.root.get(), &self.limits)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentV2CodecError::InvalidJson)?;
        let record: DocumentRecordV2 = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentV2CodecError::InvalidJson)?;

        let root = RecordBuilder::new().build_root(&record.root)?;
        Document::try_new(&self.schema, root, &self.limits).map_err(DocumentV2CodecError::from)
    }

    /// Encodes a validated runtime document as deterministic compact V2 JSON.
    ///
    /// A document with matching durable identity but another process-local
    /// proof or validation policy is completely revalidated before encoding.
    ///
    /// # Errors
    ///
    /// Returns [`DocumentV2CodecError::SchemaBinding`] when either binding
    /// component differs, [`DocumentV2CodecError::Validation`] when required
    /// proof revalidation fails, [`DocumentV2CodecError::OutputTooLarge`] when
    /// the result exceeds the codec budget, or
    /// [`DocumentV2CodecError::Encoding`] on serialization failure.
    pub fn encode(&self, document: &Document) -> Result<String, DocumentV2CodecError> {
        let binding =
            DurableSchemaBinding::new(document.schema().clone(), document.schema_fingerprint());
        require_schema_binding(&self.schema, &binding)?;

        let revalidated;
        let document = if document.is_proven_for(&self.schema, &self.limits) {
            document
        } else {
            revalidated = Document::try_new(&self.schema, document.root().clone(), &self.limits)?;
            &revalidated
        };

        let encoding = DocumentEncodingV2::new(document);
        let maximum = self.limits.max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &encoding);
        if byte_counter.exceeded() {
            return Err(DocumentV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentV2CodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(DocumentV2CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedDocumentEnvelopeV2<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: &'a RawValue,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
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

fn schema_id_from_raw(raw_schema: &RawValue) -> Result<SchemaId, DocumentV2CodecError> {
    let record: BorrowedSchemaIdRecord<'_> = serde_json::from_str(raw_schema.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(DocumentV2CodecError::InvalidJson)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        DocumentV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        DocumentV2CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        codec::{DocumentJsonCodec, DocumentJsonCodecV2, DocumentV2CodecError},
        document::{Document, DocumentProofMismatch},
        schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
    };

    const TWO_PARAGRAPHS_V1: &str = concat!(
        r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]},"#,
        r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
        r#"]}}"#,
    );

    #[test]
    fn v2_revalidates_an_independent_equal_proof() -> Result<(), Box<dyn Error>> {
        let source = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());
        let v1 = DocumentJsonCodec::new(CompiledSchema::breditor_base());
        let document = v1.decode(TWO_PARAGRAPHS_V1)?;
        let encoded = source.encode(&document)?;
        let target = DocumentJsonCodecV2::new(CompiledSchema::breditor_base());

        assert_eq!(
            document.proof_mismatch(target.schema(), target.limits()),
            Some(DocumentProofMismatch::CompiledProof)
        );
        assert_eq!(target.encode(&document)?, encoded);
        assert_eq!(target.decode(&encoded)?, document);
        Ok(())
    }

    #[test]
    fn same_selector_different_fingerprint_fails_both_directions() -> Result<(), Box<dyn Error>> {
        let base_schema = CompiledSchema::breditor_base();
        let v1 = DocumentJsonCodec::new(base_schema.clone());
        let base_document = v1.decode(TWO_PARAGRAPHS_V1)?;
        let variant_schema = CompiledSchema::test_semantic_variant_same_id();
        let variant_document = Document::try_new(
            &variant_schema,
            base_document.root().clone(),
            &DocumentLimits::default(),
        )?;
        let base_codec = DocumentJsonCodecV2::new(base_schema);
        let variant_codec = DocumentJsonCodecV2::new(variant_schema);
        let base_json = base_codec.encode(&base_document)?;
        let variant_json = variant_codec.encode(&variant_document)?;

        assert!(matches!(
            base_codec.decode(&variant_json),
            Err(DocumentV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        assert!(matches!(
            variant_codec.decode(&base_json),
            Err(DocumentV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        assert!(matches!(
            variant_codec.encode(&base_document),
            Err(DocumentV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        Ok(())
    }
}
