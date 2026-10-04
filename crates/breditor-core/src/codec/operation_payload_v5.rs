//! Closed V6 payloads for guarded flat-list reframing, splicing and replacement.
use super::{
    OperationFragmentField, OperationV6CodecError,
    document_encoding::NodeEncoding,
    document_preflight::preflight_document_root,
    flat_list_wire::{
        BlockPath, Boundary, Shape, decode_layout, decode_roots, invalid_json, invalid_target,
        offset, require_schema, root,
    },
    operation_payload_v2::fragment_from_record,
    operation_payload_v4::{
        FragmentEncoding, OperationPayloadEncodingV4, decode_operation_payload_v4,
    },
    operation_preflight_v2::preflight_operation_payload_v2,
};
use crate::{
    document::NodeRef,
    operation::{
        FlatListReframe, FlatListTextRange, FlatListTextReplace, FlatListTextSplice, Operation,
        OperationKind, OperationValidationError, TextRange,
    },
    record::TextFragmentRecordV2,
    state::EditorContext,
};
use serde::{Deserialize, Serialize, ser::SerializeStruct};
use serde_json::value::RawValue;
use std::borrow::Cow;

pub(super) fn decode_operation_payload_v5(
    json: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV6CodecError> {
    let header: KindHeader<'_> =
        serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    match header.kind.as_ref() {
        "flatListReframe" => decode_reframe(json, context),
        "flatListTextSplice" => decode_splice(json, context),
        "flatListTextReplace" => decode_replace(json, context),
        _ => decode_operation_payload_v4(json, context).map_err(Into::into),
    }
}
fn decode_reframe(json: &str, context: &EditorContext) -> Result<Operation, OperationV6CodecError> {
    let kind = OperationKind::FlatListReframe;
    require_schema(context, kind)?;
    let record: Reframe<'_> = serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.replacement.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    let expected = decode_roots(record.expected, context, kind)?;
    let replacement = decode_roots(record.replacement, context, kind)?;
    FlatListReframe::try_new(record.start, expected, replacement)
        .map(Operation::FlatListReframe)
        .map_err(|error| OperationValidationError::FlatListReframe(error).into())
}
fn decode_splice(json: &str, context: &EditorContext) -> Result<Operation, OperationV6CodecError> {
    let kind = OperationKind::FlatListTextSplice;
    require_schema(context, kind)?;
    let record: Splice<'_> = serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    preflight_operation_payload_v2(record.replacement.get(), context)
        .map_err(|error| invalid_json(&error))?;
    let mut roots = decode_roots(record.expected, context, kind)?;
    if roots.len() != 1 {
        return Err(invalid_target(kind));
    }
    let expected = roots.pop().ok_or_else(|| invalid_target(kind))?;
    let fragment: TextFragmentRecordV2 =
        serde_json::from_str(record.replacement.get()).map_err(|error| invalid_json(&error))?;
    let fragment =
        fragment_from_record(fragment, OperationFragmentField::FlatListTextSpliceReplacement, 0)?;
    let range =
        TextRange::try_new(record.block.0, offset(record.start, kind)?, offset(record.end, kind)?)
            .map_err(|_| invalid_target(kind))?;
    FlatListTextSplice::try_new(range, expected, fragment)
        .map(Operation::FlatListTextSplice)
        .map_err(|error| OperationValidationError::FlatListTextSplice(error).into())
}
fn decode_replace(json: &str, context: &EditorContext) -> Result<Operation, OperationV6CodecError> {
    let kind = OperationKind::FlatListTextReplace;
    require_schema(context, kind)?;
    let record: Replace<'_> = serde_json::from_str(json).map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    preflight_document_root(record.inserted.get(), context.limits())
        .map_err(|error| invalid_json(&error))?;
    let layout = decode_layout(record.layout, context)?;
    let range = FlatListTextRange::try_new(
        record.start.block.0,
        offset(record.start.offset, kind)?,
        record.end.block.0,
        offset(record.end.offset, kind)?,
    )
    .map_err(|_| invalid_target(kind))?;
    let expected = decode_roots(record.expected, context, kind)?;
    let inserted = decode_roots(record.inserted, context, kind)?;
    FlatListTextReplace::try_new(record.guard_start, range, expected, inserted, layout)
        .map(Operation::FlatListTextReplace)
        .map_err(|error| OperationValidationError::FlatListTextReplace(error).into())
}

#[derive(Deserialize)]
struct KindHeader<'a> {
    #[serde(borrow)]
    kind: Cow<'a, str>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reframe<'a> {
    #[serde(rename = "kind")]
    _kind: ReframeTag,
    start: u32,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}
#[derive(Deserialize)]
enum ReframeTag {
    #[serde(rename = "flatListReframe")]
    Reframe,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Splice<'a> {
    #[serde(rename = "kind")]
    _kind: SpliceTag,
    block: BlockPath,
    start: u64,
    end: u64,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}
#[derive(Deserialize)]
enum SpliceTag {
    #[serde(rename = "flatListTextSplice")]
    Splice,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Replace<'a> {
    #[serde(rename = "kind")]
    _kind: ReplaceTag,
    guard_start: u32,
    start: Boundary,
    end: Boundary,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    inserted: &'a RawValue,
    #[serde(borrow)]
    layout: &'a RawValue,
}
#[derive(Deserialize)]
enum ReplaceTag {
    #[serde(rename = "flatListTextReplace")]
    Replace,
}

pub(super) enum OperationPayloadEncodingV5<'a> {
    Earlier(OperationPayloadEncodingV4<'a>),
    Reframe { expected: NodeRef, replacement: NodeRef, op: &'a FlatListReframe },
    Splice { expected: NodeRef, op: &'a FlatListTextSplice },
    Replace { expected: NodeRef, inserted: NodeRef, op: &'a FlatListTextReplace },
}
impl<'a> OperationPayloadEncodingV5<'a> {
    pub(super) fn try_new(
        operation: &'a Operation,
        context: &EditorContext,
    ) -> Result<Self, OperationV6CodecError> {
        operation.validate(context)?;
        let kind = operation.kind();
        match operation {
            Operation::FlatListReframe(op) => Ok(Self::Reframe {
                expected: root(context, op.expected().to_vec(), kind)?,
                replacement: root(context, op.replacement().to_vec(), kind)?,
                op,
            }),
            Operation::FlatListTextSplice(op) => Ok(Self::Splice {
                expected: root(context, vec![op.expected_root().clone()], kind)?,
                op,
            }),
            Operation::FlatListTextReplace(op) => Ok(Self::Replace {
                expected: root(context, op.expected().to_vec(), kind)?,
                inserted: root(context, op.inserted().to_vec(), kind)?,
                op,
            }),
            _ => Ok(Self::Earlier(OperationPayloadEncodingV4::try_new(operation, context)?)),
        }
    }
}
impl Serialize for OperationPayloadEncodingV5<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Earlier(payload) => payload.serialize(serializer),
            Self::Reframe { expected, replacement, op } => {
                let mut record = serializer.serialize_struct("FlatListReframeV1", 4)?;
                record.serialize_field("kind", "flatListReframe")?;
                record.serialize_field("start", &op.start())?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record.serialize_field("replacement", &NodeEncoding(replacement))?;
                record.end()
            }
            Self::Splice { expected, op } => {
                let mut record = serializer.serialize_struct("FlatListTextSpliceV1", 6)?;
                record.serialize_field("kind", "flatListTextSplice")?;
                record.serialize_field("block", op.range().container_path().as_slice())?;
                record.serialize_field("start", &op.range().start().get())?;
                record.serialize_field("end", &op.range().end().get())?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record.serialize_field("replacement", &FragmentEncoding(op.replacement()))?;
                record.end()
            }
            Self::Replace { expected, inserted, op } => {
                let mut record = serializer.serialize_struct("FlatListTextReplaceV1", 7)?;
                record.serialize_field("kind", "flatListTextReplace")?;
                record.serialize_field("guardStart", &op.guard_start())?;
                record.serialize_field(
                    "start",
                    &Boundary {
                        block: BlockPath(op.range().start_path().clone()),
                        offset: op.range().start_offset().get(),
                    },
                )?;
                record.serialize_field(
                    "end",
                    &Boundary {
                        block: BlockPath(op.range().end_path().clone()),
                        offset: op.range().end_offset().get(),
                    },
                )?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record.serialize_field("inserted", &NodeEncoding(inserted))?;
                let layout = op.layout().iter().map(Shape::from_runtime).collect::<Vec<_>>();
                record.serialize_field("layout", &layout)?;
                record.end()
            }
        }
    }
}
