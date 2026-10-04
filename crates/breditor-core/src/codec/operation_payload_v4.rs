//! Closed V5 payload generation: full text-block guards and typed replacements.
//! All raw trees/fragments are allocation-preflighted before owned decoding.
use super::{
    JsonFailure, OperationFragmentField, OperationV5CodecError,
    document_encoding::{FormatSetEncoding, NodeEncoding},
    document_json::RecordBuilder,
    document_preflight::preflight_document_root,
    operation_payload_v2::fragment_from_record,
    operation_payload_v3::{OperationPayloadEncodingV3, decode_operation_payload_v3},
    operation_preflight_v2::preflight_operation_payload_v2,
};
use crate::{
    document::{Document, ElementNode, NodeRef, PropertyMap, TextFragment, TextRun},
    operation::{
        Operation, OperationKind, OperationValidationError, RootTextBoundary, RootTextRange,
        TextBlockReplace, TextBlockReplaceError, TextBlockSplice, TextBlockSpliceError, TextRange,
    },
    position::{NodePath, TextOffset},
    record::{NodeRecordV1, TextFragmentRecordV2},
    state::EditorContext,
};
use serde::{
    Deserialize, Serialize,
    ser::{SerializeSeq, SerializeStruct},
};
use serde_json::value::RawValue;
use std::borrow::Cow;

pub(super) fn decode_operation_payload_v4(
    json: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV5CodecError> {
    let header: KindHeader<'_> =
        serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    match header.kind.as_ref() {
        "textBlockSplice" => decode_splice(json, context),
        "textBlockReplace" => decode_replace(json, context),
        _ => decode_operation_payload_v3(json, context).map_err(Into::into),
    }
}

fn decode_splice(json: &str, context: &EditorContext) -> Result<Operation, OperationV5CodecError> {
    require_schema(context, OperationKind::TextBlockSplice)?;
    let record: BorrowedSplice<'_> =
        serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    preflight_operation_payload_v2(record.replacement.get(), context)
        .map_err(|error| invalid_json(&error))?;
    let mut guards = decode_blocks(record.expected, context, OperationKind::TextBlockSplice)?;
    if guards.len() != 1 {
        return Err(invalid_target(OperationKind::TextBlockSplice));
    }
    let expected = guards.pop().ok_or_else(|| invalid_target(OperationKind::TextBlockSplice))?;
    let replacement: TextFragmentRecordV2 =
        serde_json::from_str(record.replacement.get()).map_err(|error| invalid_json(&error))?;
    let replacement =
        fragment_from_record(replacement, OperationFragmentField::TextBlockSpliceReplacement, 0)?;
    let range = TextRange::try_new(
        path(record.block, OperationKind::TextBlockSplice)?,
        offset(record.start, OperationKind::TextBlockSplice)?,
        offset(record.end, OperationKind::TextBlockSplice)?,
    )
    .map_err(|_| invalid_target(OperationKind::TextBlockSplice))?;
    TextBlockSplice::try_new(range, expected, replacement)
        .map(Operation::TextBlockSplice)
        .map_err(|error| OperationValidationError::TextBlockSplice(error).into())
}

fn decode_replace(json: &str, context: &EditorContext) -> Result<Operation, OperationV5CodecError> {
    require_schema(context, OperationKind::TextBlockReplace)?;
    let record: BorrowedReplace<'_> =
        serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    // Check both borrowed trees before constructing either owned record tree.
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.replacement.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    let range = RootTextRange::try_new(record.start.boundary()?, record.end.boundary()?)
        .map_err(|_| invalid_target(OperationKind::TextBlockReplace))?;
    let expected = decode_blocks(record.expected, context, OperationKind::TextBlockReplace)?;
    let replacement = decode_blocks(record.replacement, context, OperationKind::TextBlockReplace)?;
    TextBlockReplace::try_new(range, expected, replacement)
        .map(Operation::TextBlockReplace)
        .map_err(|error| OperationValidationError::TextBlockReplace(error).into())
}

/// Raw trees have already passed strict document preflight. Synthetic roots
/// carry no live siblings: the full live tree is proved only at application.
fn decode_blocks(
    raw: &RawValue,
    context: &EditorContext,
    kind: OperationKind,
) -> Result<Vec<NodeRef>, OperationV5CodecError> {
    let root: NodeRecordV1 =
        serde_json::from_str(raw.get()).map_err(|error| invalid_json(&error))?;
    let root = RecordBuilder::new().build_root(&root).map_err(|report| validation(kind, report))?;
    let document = Document::try_new(context.schema(), root, context.limits())
        .map_err(|report| validation(kind, report))?;
    Ok(document
        .root()
        .as_element()
        .ok_or_else(|| invalid_target(kind))?
        .children()
        .iter()
        .cloned()
        .collect())
}

#[derive(Deserialize)]
struct KindHeader<'a> {
    #[serde(borrow)]
    kind: Cow<'a, str>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSplice<'a> {
    #[serde(rename = "kind")]
    _kind: SpliceTag,
    block: u32,
    start: u64,
    end: u64,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}
#[derive(Deserialize)]
enum SpliceTag {
    #[serde(rename = "textBlockSplice")]
    Splice,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedReplace<'a> {
    #[serde(rename = "kind")]
    _kind: ReplaceTag,
    start: Boundary,
    end: Boundary,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}
#[derive(Deserialize)]
enum ReplaceTag {
    #[serde(rename = "textBlockReplace")]
    Replace,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Boundary {
    block: u32,
    offset: u64,
}
impl Boundary {
    fn boundary(self) -> Result<RootTextBoundary, OperationV5CodecError> {
        RootTextBoundary::try_new(
            path(self.block, OperationKind::TextBlockReplace)?,
            offset(self.offset, OperationKind::TextBlockReplace)?,
        )
        .map_err(|_| invalid_target(OperationKind::TextBlockReplace))
    }
    fn from_runtime(boundary: &RootTextBoundary) -> Self {
        Self { block: boundary.paragraph_index(), offset: boundary.offset().get() }
    }
}

pub(super) enum OperationPayloadEncodingV4<'a> {
    Earlier(OperationPayloadEncodingV3<'a>),
    Splice { expected: NodeRef, operation: &'a TextBlockSplice },
    Replace { expected: NodeRef, replacement: NodeRef, operation: &'a TextBlockReplace },
}
impl<'a> OperationPayloadEncodingV4<'a> {
    pub(super) fn try_new(
        operation: &'a Operation,
        context: &EditorContext,
    ) -> Result<Self, OperationV5CodecError> {
        operation.validate(context)?;
        match operation {
            Operation::TextBlockSplice(op) => Ok(Self::Splice {
                expected: root(context, vec![op.expected().clone()], operation.kind())?,
                operation: op,
            }),
            Operation::TextBlockReplace(op) => Ok(Self::Replace {
                expected: root(context, op.expected().to_vec(), operation.kind())?,
                replacement: root(context, op.replacement().to_vec(), operation.kind())?,
                operation: op,
            }),
            _ => Ok(Self::Earlier(OperationPayloadEncodingV3::try_new(operation, context)?)),
        }
    }
}
impl Serialize for OperationPayloadEncodingV4<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Earlier(payload) => payload.serialize(serializer),
            Self::Splice { expected, operation } => {
                let mut record = serializer.serialize_struct("TextBlockSpliceV1", 6)?;
                record.serialize_field("kind", "textBlockSplice")?;
                record
                    .serialize_field("block", &operation.range().container_path().last_index())?;
                record.serialize_field("start", &operation.range().start().get())?;
                record.serialize_field("end", &operation.range().end().get())?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record
                    .serialize_field("replacement", &FragmentEncoding(operation.replacement()))?;
                record.end()
            }
            Self::Replace { expected, replacement, operation } => {
                let mut record = serializer.serialize_struct("TextBlockReplaceV1", 5)?;
                record.serialize_field("kind", "textBlockReplace")?;
                record
                    .serialize_field("start", &Boundary::from_runtime(operation.range().start()))?;
                record.serialize_field("end", &Boundary::from_runtime(operation.range().end()))?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record.serialize_field("replacement", &NodeEncoding(replacement))?;
                record.end()
            }
        }
    }
}

struct FragmentEncoding<'a>(&'a TextFragment);
impl Serialize for FragmentEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("TextFragmentV2", 1)?;
        record.serialize_field("runs", &RunsEncoding(self.0))?;
        record.end()
    }
}
struct RunsEncoding<'a>(&'a TextFragment);
impl Serialize for RunsEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
        for run in self.0 {
            sequence.serialize_element(&RunEncoding(run))?;
        }
        sequence.end()
    }
}
struct RunEncoding<'a>(&'a TextRun);
impl Serialize for RunEncoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("TextRunV2", 2)?;
        record.serialize_field("text", self.0.text())?;
        record.serialize_field("formats", &FormatSetEncoding(self.0.formats()))?;
        record.end()
    }
}

fn root(
    context: &EditorContext,
    nodes: Vec<NodeRef>,
    kind: OperationKind,
) -> Result<NodeRef, OperationV5CodecError> {
    ElementNode::try_new(context.schema().root_kind().clone(), None, PropertyMap::default(), nodes)
        .map(NodeRef::element)
        .map_err(|_| invalid_target(kind))
}
fn require_schema(
    context: &EditorContext,
    kind: OperationKind,
) -> Result<(), OperationV5CodecError> {
    if context.schema().supports_text_block_kind_operations() {
        Ok(())
    } else {
        Err(OperationValidationError::UnsupportedSchema {
            kind,
            schema: context.schema().id().clone(),
        }
        .into())
    }
}
fn path(index: u32, kind: OperationKind) -> Result<NodePath, OperationV5CodecError> {
    NodePath::try_from_indices(vec![index]).map_err(|_| invalid_target(kind))
}
fn offset(value: u64, kind: OperationKind) -> Result<TextOffset, OperationV5CodecError> {
    TextOffset::try_new(value).map_err(|_| invalid_target(kind))
}
fn invalid_target(kind: OperationKind) -> OperationV5CodecError {
    match kind {
        OperationKind::TextBlockSplice => {
            OperationValidationError::TextBlockSplice(TextBlockSpliceError::InvalidTarget).into()
        }
        _ => {
            OperationValidationError::TextBlockReplace(TextBlockReplaceError::InvalidTarget).into()
        }
    }
}
fn validation(
    kind: OperationKind,
    report: crate::schema::ValidationReport,
) -> OperationV5CodecError {
    match kind {
        OperationKind::TextBlockSplice => {
            OperationValidationError::TextBlockSplice(TextBlockSpliceError::Validation(report))
                .into()
        }
        _ => OperationValidationError::TextBlockReplace(TextBlockReplaceError::Validation(report))
            .into(),
    }
}
fn invalid_json(error: &serde_json::Error) -> OperationV5CodecError {
    OperationV5CodecError::InvalidJson(JsonFailure::from_serde(error))
}
