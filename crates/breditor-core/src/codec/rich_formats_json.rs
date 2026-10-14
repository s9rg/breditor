//! Bounded canonical inline-format values for rich command and pending-format payloads.

use super::{
    JsonFailure, document_encoding::FormatSetEncoding, document_json::RecordBuilder,
    document_preflight::preflight_document_root, json_size::JsonByteCounter,
};
use crate::{
    document::FormatSet,
    record::{FormatRecordV1, NodeRecordV1},
    rich_content::local_session::typing_state::validate_formats,
    state::EditorContext,
};

/// Failure to admit literal rich format values; no unchecked formats escape.
#[derive(Debug, thiserror::Error)]
pub enum RichFormatsCodecError {
    /// This separately gated payload boundary requires the sealed rich profile.
    #[error("rich format values require a rich compiled context")]
    UnsupportedContext,
    /// Outer literal-array bytes exceed the active payload budget.
    #[error("rich format values exceed their byte budget")]
    Limit,
    /// Strict canonical record parsing/preflight failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// Local format/property construction failed.
    #[error(transparent)]
    Validation(#[from] crate::schema::ValidationReport),
    /// Active compiled format/resource policy rejected values.
    #[error(transparent)]
    Admission(#[from] crate::rich_content::RichLocalSessionError),
    /// A canonical construction contradicted its private invariant.
    #[error("rich format payload invariant failed")]
    Invariant,
}

/// Codec for the existing canonical `text.formats` literal-array grammar.
///
/// This is not a new persisted envelope. Values are bound to the receiver's
/// compiled rich context; empty arrays explicitly represent plain formatting.
#[derive(Clone, Debug)]
pub struct RichFormatsJsonCodec {
    context: EditorContext,
    max_json_bytes: usize,
}
impl RichFormatsJsonCodec {
    /// Bind literal values to the active context with a default 64 KiB payload budget.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context, max_json_bytes: 64 * 1024 }
    }
    /// Set an independent format payload budget; active property/format limits remain enforced.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, maximum: usize) -> Self {
        self.max_json_bytes = maximum;
        self
    }
    /// Decode strict canonical format/property records and apply compiled admission policy.
    ///
    /// # Errors
    /// Rejects byte budgets, duplicate/unknown fields, invalid ordering/types or active schema/limits.
    pub fn decode(&self, input: &str) -> Result<FormatSet, RichFormatsCodecError> {
        if !self.context.schema().is_rich_content_profile() {
            return Err(RichFormatsCodecError::UnsupportedContext);
        }
        if input.len() > self.max_json_bytes {
            return Err(RichFormatsCodecError::Limit);
        }
        let preflight = format!("{{\"kind\":\"text\",\"text\":\"\",\"formats\":{input}}}");
        preflight_document_root(&preflight, self.context.limits())
            .map_err(|error| JsonFailure::from_serde(&error))?;
        let formats: Vec<FormatRecordV1> =
            serde_json::from_str(input).map_err(|error| JsonFailure::from_serde(&error))?;
        // The sentinel only exercises canonical construction; it is never
        // admitted as content or charged against document text limits.
        let node = RecordBuilder::new()
            .build_root(&NodeRecordV1::Text { text: "x".to_owned(), formats })?;
        let formats = node.as_text().ok_or(RichFormatsCodecError::Invariant)?.formats().clone();
        validate_formats(&self.context, &formats)?;
        Ok(formats)
    }
    /// Encode admitted values with the same byte/schema/resource limits as decoding.
    ///
    /// # Errors
    /// Rejects incompatible formats, active budgets or serialization failure.
    pub fn encode(&self, formats: &FormatSet) -> Result<String, RichFormatsCodecError> {
        if !self.context.schema().is_rich_content_profile() {
            return Err(RichFormatsCodecError::UnsupportedContext);
        }
        validate_formats(&self.context, formats)?;
        let encoding = FormatSetEncoding(formats);
        let mut counter = JsonByteCounter::new(self.max_json_bytes);
        let result = serde_json::to_writer(&mut counter, &encoding);
        if counter.exceeded() {
            return Err(RichFormatsCodecError::Limit);
        }
        result.map_err(|error| JsonFailure::from_serde(&error))?;
        serde_json::to_string(&encoding).map_err(|error| JsonFailure::from_serde(&error).into())
    }
}
