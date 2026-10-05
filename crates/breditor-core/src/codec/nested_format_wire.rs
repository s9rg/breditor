//! Closed V7 payload for guarded, atomic nested inline-format rewriting.
use super::{
    JsonFailure, OperationV7CodecError, document_encoding::NodeEncoding,
    document_json::RecordBuilder, document_preflight::preflight_document_root,
};
use crate::{
    document::{Document, ElementNode, NodeRef, PropertyMap},
    operation::{
        NestedListFormatRewrite, NestedListFormatRewriteError, Operation, OperationKind,
        OperationValidationError,
    },
    record::NodeRecordV1,
    state::EditorContext,
};
use serde::{Deserialize, Serialize, ser::SerializeStruct};
use serde_json::value::RawValue;

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
    #[serde(rename = "nestedListFormatRewrite")]
    FormatRewrite,
}
fn json_error(error: &serde_json::Error) -> OperationV7CodecError {
    OperationV7CodecError::InvalidJson(JsonFailure::from_serde(error))
}
fn invalid(error: NestedListFormatRewriteError) -> OperationV7CodecError {
    OperationValidationError::NestedListFormatRewrite(error).into()
}
pub(super) fn decode(
    json: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV7CodecError> {
    if !context.schema().supports_nested_list_reframe() {
        return Err(OperationValidationError::UnsupportedSchema {
            kind: OperationKind::NestedListFormatRewrite,
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
    NestedListFormatRewrite::try_new(start, expected, replacement)
        .map(Operation::NestedListFormatRewrite)
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
        .map_err(|report| invalid(NestedListFormatRewriteError::Validation(report)))?;
    let document = Document::try_new(context.schema(), root, context.limits())
        .map_err(|report| invalid(NestedListFormatRewriteError::Validation(report)))?;
    Ok(document
        .root()
        .as_element()
        .ok_or_else(|| invalid(NestedListFormatRewriteError::InvalidTarget))?
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
    .map_err(|_| invalid(NestedListFormatRewriteError::InvalidTarget))
}

pub(super) struct Encoding<'a> {
    operation: &'a NestedListFormatRewrite,
    expected: NodeRef,
    replacement: NodeRef,
}
impl<'a> Encoding<'a> {
    pub(super) fn new(
        operation: &'a NestedListFormatRewrite,
        context: &EditorContext,
    ) -> Result<Self, OperationV7CodecError> {
        Ok(Self {
            operation,
            expected: root(context, operation.expected())?,
            replacement: root(context, operation.replacement())?,
        })
    }
}
impl Serialize for Encoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("NestedListFormatRewriteV1", 4)?;
        record.serialize_field("kind", "nestedListFormatRewrite")?;
        record.serialize_field("start", &self.operation.start())?;
        record.serialize_field("expected", &NodeEncoding(&self.expected))?;
        record.serialize_field("replacement", &NodeEncoding(&self.replacement))?;
        record.end()
    }
}
