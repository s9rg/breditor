//! Experimental structural payload generation; older unions remain closed.

use std::{borrow::Cow, fmt};

use serde::{
    Deserialize, Serialize,
    de::{DeserializeSeed, Error as _, SeqAccess, Visitor},
    ser::{SerializeSeq, SerializeStruct},
};
use serde_json::value::RawValue;

use crate::{
    block::{HeadingLevel, TextBlockKind},
    document::{Document, ElementNode, NodeRef, PropertyMap},
    operation::{
        Operation, OperationValidationError, TextBlockKindChange, TextBlockKindChangeError,
    },
    record::{NodeRecordV1, OperationRecordV2},
    state::EditorContext,
};

use super::{
    JsonFailure, OperationV4CodecError,
    document_encoding::NodeEncoding,
    document_json::RecordBuilder,
    document_preflight::preflight_document_root,
    operation_payload_v2::{decode_operation_payload_v2, encode_operation_payload_v2},
    operation_preflight_v2::preflight_operation_payload_v2,
};

/// Reads a new closed payload without changing any prior payload generation.
pub(super) fn decode_operation_payload_v3(
    json: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV4CodecError> {
    let header: KindHeader<'_> =
        serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    if header.kind != "textBlockKindChange" {
        preflight_operation_payload_v2(json, context).map_err(|error| invalid_json(&error))?;
        let record: OperationRecordV2 =
            serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
        return Ok(decode_operation_payload_v2(record)?);
    }
    if !context.schema().supports_text_block_kind_operations() {
        return Err(block_error(TextBlockKindChangeError::UnsupportedSchema));
    }
    let record: BorrowedBlockKindChange<'_> =
        serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    // The guard uses the existing document-node language under a synthetic
    // root. It inherits strict duplicate/property/order/depth/count preflight
    // before any owned tree reconstruction. It is not a whole-document guard.
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    let root: NodeRecordV1 =
        serde_json::from_str(record.expected.get()).map_err(|error| invalid_json(&error))?;
    let root = RecordBuilder::new()
        .build_root(&root)
        .map_err(TextBlockKindChangeError::Validation)
        .map_err(block_error)?;
    let guard = Document::try_new(context.schema(), root, context.limits())
        .map_err(TextBlockKindChangeError::Validation)
        .map_err(block_error)?;
    let children = guard
        .root()
        .as_element()
        .ok_or_else(|| block_error(TextBlockKindChangeError::InvalidTarget))?
        .children();
    let mut decoder = serde_json::Deserializer::from_str(record.replacement.get());
    let replacement = ReplacementSeed { count: children.len() }
        .deserialize(&mut decoder)
        .map_err(|error| invalid_json(&error))?;
    decoder.end().map_err(|error| invalid_json(&error))?;
    let operation =
        TextBlockKindChange::try_new(record.start, children.iter().cloned().collect(), replacement)
            .map_err(block_error)?;
    Ok(Operation::TextBlockKindChange(operation))
}

#[derive(Deserialize)]
struct KindHeader<'a> {
    #[serde(borrow)]
    kind: Cow<'a, str>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedBlockKindChange<'a> {
    // Only this exact discriminator is accepted by the closed enum below.
    #[serde(rename = "kind")]
    _kind: BlockKindTag,
    start: u32,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}

#[derive(Deserialize)]
enum BlockKindTag {
    #[serde(rename = "textBlockKindChange")]
    TextBlockKindChange,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BlockKindRecord<'a> {
    kind: TargetKind,
    #[serde(borrow, default, deserialize_with = "present_level")]
    level: Option<&'a RawValue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum TargetKind {
    Paragraph,
    Heading,
}

// Preserve presence independently of JSON null: a paragraph cannot carry even
// a null level, and a heading must supply an exact checked integer. Borrowing
// also prevents an internally tagged enum from buffering unknown target data.
fn present_level<'de, D>(deserializer: D) -> Result<Option<&'de RawValue>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    <&RawValue>::deserialize(deserializer).map(Some)
}

/// Bounds allocation by the already validated source count, never by an
/// attacker-supplied array size hint. Even the first excess item stays borrowed.
struct ReplacementSeed {
    count: usize,
}

impl<'de> DeserializeSeed<'de> for ReplacementSeed {
    type Value = Vec<TextBlockKind>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(self)
    }
}

impl<'de> Visitor<'de> for ReplacementSeed {
    type Value = Vec<TextBlockKind>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("exactly one checked target kind per guarded block")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut result = Vec::new();
        while let Some(raw) = sequence.next_element::<&RawValue>()? {
            if result.len() >= self.count {
                return Err(A::Error::custom("too many block-kind replacements"));
            }
            let record: BlockKindRecord<'_> =
                serde_json::from_str(raw.get()).map_err(A::Error::custom)?;
            let kind = match record.kind {
                TargetKind::Paragraph => {
                    if record.level.is_some() {
                        return Err(A::Error::custom("paragraph targets cannot carry a level"));
                    }
                    TextBlockKind::Paragraph
                }
                TargetKind::Heading => {
                    let level = record
                        .level
                        .ok_or_else(|| A::Error::custom("heading level is required"))?;
                    let level: u32 = serde_json::from_str(level.get()).map_err(A::Error::custom)?;
                    TextBlockKind::Heading(
                        HeadingLevel::try_new(level)
                            .map_err(|_| A::Error::custom("heading level must be in 1..=6"))?,
                    )
                }
            };
            result.push(kind);
        }
        if result.len() != self.count {
            return Err(A::Error::custom("block-kind replacement count differs from source count"));
        }
        Ok(result)
    }
}

/// Borrows runtime values; no owned copy of guard text/property data is made.
pub(super) enum OperationPayloadEncodingV3<'a> {
    Paragraph(OperationRecordV2),
    BlockKind { root: NodeRef, operation: &'a TextBlockKindChange },
}

impl<'a> OperationPayloadEncodingV3<'a> {
    pub(super) fn try_new(
        operation: &'a Operation,
        context: &EditorContext,
    ) -> Result<Self, OperationV4CodecError> {
        operation.validate(context)?;
        if let Operation::TextBlockKindChange(operation) = operation {
            let root = ElementNode::try_new(
                context.schema().root_kind().clone(),
                None,
                PropertyMap::default(),
                operation.expected().to_vec(),
            )
            .map_err(|_| block_error(TextBlockKindChangeError::InvalidTarget))?;
            Ok(Self::BlockKind { root: NodeRef::element(root), operation })
        } else {
            let record = encode_operation_payload_v2(operation).map_err(|kind| {
                OperationValidationError::UnsupportedSchema {
                    kind,
                    schema: context.schema().id().clone(),
                }
            })?;
            Ok(Self::Paragraph(record))
        }
    }
}

impl Serialize for OperationPayloadEncodingV3<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::Paragraph(record) => record.serialize(serializer),
            Self::BlockKind { root, operation } => {
                let mut record = serializer.serialize_struct("TextBlockKindChangeV1", 4)?;
                record.serialize_field("kind", "textBlockKindChange")?;
                record.serialize_field("start", &operation.start())?;
                record.serialize_field("expected", &NodeEncoding(root))?;
                record.serialize_field(
                    "replacement",
                    &ReplacementEncoding(operation.replacement()),
                )?;
                record.end()
            }
        }
    }
}

struct ReplacementEncoding<'a>(&'a [TextBlockKind]);
impl Serialize for ReplacementEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
        for kind in self.0 {
            sequence.serialize_element(&BlockKindEncoding(*kind))?;
        }
        sequence.end()
    }
}

struct BlockKindEncoding(TextBlockKind);
impl Serialize for BlockKindEncoding {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct(
            "TextBlockKindV1",
            match self.0 {
                TextBlockKind::Paragraph => 1,
                TextBlockKind::Heading(_) => 2,
            },
        )?;
        match self.0 {
            TextBlockKind::Paragraph => record.serialize_field("kind", "paragraph")?,
            TextBlockKind::Heading(level) => {
                record.serialize_field("kind", "heading")?;
                record.serialize_field("level", &level.get())?;
            }
        }
        record.end()
    }
}

fn block_error(error: TextBlockKindChangeError) -> OperationV4CodecError {
    OperationValidationError::TextBlockKindChange(error).into()
}

fn invalid_json(error: &serde_json::Error) -> OperationV4CodecError {
    OperationV4CodecError::InvalidJson(JsonFailure::from_serde(error))
}
