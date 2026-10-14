//! Additive structured rich clipboard envelope, never a history/sync backup.

use super::{
    DocumentJsonCodecV2, DocumentV2CodecError, JsonFailure, document_encoding::DocumentEncodingV2,
    json_size::JsonByteCounter,
};
use crate::{
    rich_content::{RichClipboardError, RichClipboardFragment, RichClipboardKind},
    state::EditorContext,
};
use serde::{Deserialize, Serialize, ser::SerializeStruct};
use serde_json::value::RawValue;

/// Original Breditor rich clipboard format; no interoperability protocol is copied.
pub const RICH_CLIPBOARD_FORMAT: &str = "breditor/rich-clipboard";
/// First additive semantic clipboard version, separate from all existing codecs.
pub const RICH_CLIPBOARD_FORMAT_VERSION: u32 = 1;

/// Bounded structured clipboard failure; no partially admitted fragment escapes.
#[derive(Debug, thiserror::Error)]
pub enum RichClipboardCodecError {
    /// Outer clipboard bytes exceed active budget.
    #[error("rich clipboard exceeds its byte budget")]
    Limit,
    /// Family/version is not this separately defined clipboard protocol.
    #[error("unsupported rich clipboard format or version")]
    Format,
    /// Strict envelope parsing failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// Fingerprint-bearing content tree failed admission.
    #[error(transparent)]
    Document(#[from] DocumentV2CodecError),
    /// Declared semantics or active receiving policy failed.
    #[error(transparent)]
    Clipboard(#[from] RichClipboardError),
}

/// Strict schema-bound clipboard codec with a default independent 1 MiB byte budget.
///
/// Its Document V2 wrapper has a neutral clipboard document ID and source content
/// identities. Decoding is not insertion: hosts must allocate fresh paste IDs.
/// Only active current geometry is admitted, not merge retractions or shared history.
#[derive(Clone, Debug)]
pub struct RichClipboardJsonCodec {
    context: EditorContext,
    max_json_bytes: usize,
}
impl RichClipboardJsonCodec {
    /// Bind clipboard admission to the receiving rich schema and active resource policy.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context, max_json_bytes: 1024 * 1024 }
    }
    /// Choose the independent outer byte budget; embedded document limits still apply.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, maximum: usize) -> Self {
        self.max_json_bytes = maximum;
        self
    }
    /// Encode admitted semantic content without fresh-ID allocation or document mutation.
    ///
    /// # Errors
    /// Rejects incompatible schemas, tighter limits, nonsemantic history or byte budgets.
    pub fn encode(
        &self,
        fragment: &RichClipboardFragment,
    ) -> Result<String, RichClipboardCodecError> {
        RichClipboardFragment::try_admit(
            &self.context,
            fragment.kind(),
            fragment.document().document().clone(),
        )?;
        self.document_codec().encode(fragment.document().document())?;
        let encoding = Encoding(fragment);
        let mut counter = JsonByteCounter::new(self.max_json_bytes);
        let result = serde_json::to_writer(&mut counter, &encoding);
        if counter.exceeded() {
            return Err(RichClipboardCodecError::Limit);
        }
        result.map_err(|error| JsonFailure::from_serde(&error))?;
        serde_json::to_string(&encoding).map_err(|error| JsonFailure::from_serde(&error).into())
    }
    /// Strictly decode and validate semantics; source IDs remain unsuitable for ordinary insertion.
    ///
    /// # Errors
    /// Rejects unsupported/unknown/duplicate fields, fingerprint/kind mismatches or active budgets.
    pub fn decode(&self, input: &str) -> Result<RichClipboardFragment, RichClipboardCodecError> {
        if input.len() > self.max_json_bytes {
            return Err(RichClipboardCodecError::Limit);
        }
        let record: Envelope<'_> =
            serde_json::from_str(input).map_err(|error| JsonFailure::from_serde(&error))?;
        if record.format != RICH_CLIPBOARD_FORMAT
            || record.format_version != RICH_CLIPBOARD_FORMAT_VERSION
        {
            return Err(RichClipboardCodecError::Format);
        }
        let kind = match record.kind {
            Kind::Text => RichClipboardKind::Text,
            Kind::Flow => RichClipboardKind::Flow,
            Kind::Grid => RichClipboardKind::Grid,
        };
        Ok(RichClipboardFragment::try_admit(
            &self.context,
            kind,
            self.document_codec().decode(record.document.get())?,
        )?)
    }
    fn document_codec(&self) -> DocumentJsonCodecV2 {
        DocumentJsonCodecV2::new(self.context.schema().clone())
            .with_limits(self.context.limits().clone())
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope<'a> {
    format: String,
    format_version: u32,
    kind: Kind,
    #[serde(borrow)]
    document: &'a RawValue,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Kind {
    Text,
    Flow,
    Grid,
}
struct Encoding<'a>(&'a RichClipboardFragment);
impl Serialize for Encoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("RichClipboardV1", 4)?;
        record.serialize_field("format", RICH_CLIPBOARD_FORMAT)?;
        record.serialize_field("formatVersion", &RICH_CLIPBOARD_FORMAT_VERSION)?;
        record.serialize_field(
            "kind",
            match self.0.kind() {
                RichClipboardKind::Text => "text",
                RichClipboardKind::Flow => "flow",
                RichClipboardKind::Grid => "grid",
            },
        )?;
        record
            .serialize_field("document", &DocumentEncodingV2::new(self.0.document().document()))?;
        record.end()
    }
}
