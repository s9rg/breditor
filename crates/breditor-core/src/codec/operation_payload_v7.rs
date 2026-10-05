//! Closed V7 payload extension for guarded nested-list reframing.
use super::{
    JsonFailure, OperationV7CodecError,
    document_encoding::NodeEncoding,
    document_json::RecordBuilder,
    document_preflight::preflight_document_root,
    operation_payload_v5::{OperationPayloadEncodingV5, decode_operation_payload_v5},
};
use crate::{
    document::{Document, ElementNode, NodeRef, PropertyMap},
    operation::{
        NestedListReframe, NestedListReframeError, Operation, OperationKind,
        OperationValidationError,
    },
    record::NodeRecordV1,
    state::EditorContext,
};
use serde::{Deserialize, Serialize, ser::SerializeStruct};
use serde_json::value::RawValue;
use std::borrow::Cow;

#[derive(Deserialize)]
struct Header<'a> {
    #[serde(borrow)]
    kind: Cow<'a, str>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Payload<'a> {
    #[serde(rename = "kind")]
    _kind: NestedTag,
    start: u32,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}
#[derive(Deserialize)]
enum NestedTag {
    #[serde(rename = "nestedListReframe")]
    Reframe,
}
fn json_error(error: &serde_json::Error) -> OperationV7CodecError {
    OperationV7CodecError::InvalidJson(JsonFailure::from_serde(error))
}
fn invalid(error: NestedListReframeError) -> OperationV7CodecError {
    OperationValidationError::NestedListReframe(error).into()
}
pub(super) fn decode_operation_payload_v7(
    json: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV7CodecError> {
    let header: Header<'_> = serde_json::from_str(json).map_err(|error| json_error(&error))?;
    if header.kind == "nestedListTextSplice" {
        return super::nested_text_wire::decode(json, context);
    }
    if header.kind != "nestedListReframe" {
        return decode_operation_payload_v5(json, context).map_err(Into::into);
    }
    if !context.schema().supports_nested_list_reframe() {
        return Err(OperationValidationError::UnsupportedSchema {
            kind: OperationKind::NestedListReframe,
            schema: context.schema().id().clone(),
        }
        .into());
    }
    let Payload { start, expected, replacement, .. } =
        serde_json::from_str(json).map_err(|error| json_error(&error))?;
    // Preflight both raw trees before allocating either owned fragment.
    for raw in [expected, replacement] {
        preflight_document_root(raw.get(), context.limits()).map_err(|error| json_error(&error))?;
    }
    let expected = decode_root(expected, context)?;
    let replacement = decode_root(replacement, context)?;
    NestedListReframe::try_new(start, expected, replacement)
        .map(Operation::NestedListReframe)
        .map_err(invalid)
}
fn decode_root(
    raw: &RawValue,
    context: &EditorContext,
) -> Result<Vec<NodeRef>, OperationV7CodecError> {
    let record: NodeRecordV1 =
        serde_json::from_str(raw.get()).map_err(|error| json_error(&error))?;
    let root = RecordBuilder::new()
        .build_root(&record)
        .map_err(|report| invalid(NestedListReframeError::Validation(report)))?;
    let document = Document::try_new(context.schema(), root, context.limits())
        .map_err(|report| invalid(NestedListReframeError::Validation(report)))?;
    Ok(document
        .root()
        .as_element()
        .ok_or_else(|| invalid(NestedListReframeError::InvalidTarget))?
        .children()
        .iter()
        .cloned()
        .collect())
}
fn root(context: &EditorContext, nodes: &[NodeRef]) -> Result<NodeRef, OperationV7CodecError> {
    ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        nodes.to_vec(),
    )
    .map(NodeRef::element)
    .map_err(|_| invalid(NestedListReframeError::InvalidTarget))
}
pub(super) enum OperationPayloadEncodingV7<'a> {
    Splice { operation: &'a crate::operation::NestedListTextSplice, expected: NodeRef },
    Earlier(OperationPayloadEncodingV5<'a>),
    Nested { operation: &'a NestedListReframe, expected: NodeRef, replacement: NodeRef },
}
impl<'a> OperationPayloadEncodingV7<'a> {
    pub(super) fn try_new(
        operation: &'a Operation,
        context: &EditorContext,
    ) -> Result<Self, OperationV7CodecError> {
        operation.validate(context)?;
        match operation {
            Operation::NestedListTextSplice(operation) => Ok(Self::Splice {
                operation,
                expected: root(context, std::slice::from_ref(operation.expected_root()))?,
            }),
            Operation::NestedListReframe(operation) => Ok(Self::Nested {
                operation,
                expected: root(context, operation.expected())?,
                replacement: root(context, operation.replacement())?,
            }),
            _ => Ok(Self::Earlier(OperationPayloadEncodingV5::try_new(operation, context)?)),
        }
    }
}
impl Serialize for OperationPayloadEncodingV7<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Splice { operation, expected } => {
                let mut record = serializer.serialize_struct("NestedListTextSpliceV1", 6)?;
                record.serialize_field("kind", "nestedListTextSplice")?;
                record.serialize_field("block", operation.range().container_path().as_slice())?;
                record.serialize_field("start", &operation.range().start().get())?;
                record.serialize_field("end", &operation.range().end().get())?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record.serialize_field(
                    "replacement",
                    &super::operation_payload_v4::FragmentEncoding(operation.replacement()),
                )?;
                record.end()
            }
            Self::Earlier(value) => value.serialize(serializer),
            Self::Nested { operation, expected, replacement } => {
                let mut record = serializer.serialize_struct("NestedListReframeV1", 4)?;
                record.serialize_field("kind", "nestedListReframe")?;
                record.serialize_field("start", &operation.start())?;
                record.serialize_field("expected", &NodeEncoding(expected))?;
                record.serialize_field("replacement", &NodeEncoding(replacement))?;
                record.end()
            }
        }
    }
}
