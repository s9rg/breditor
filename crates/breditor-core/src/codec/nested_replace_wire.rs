//! Strict V7 nested structural replacement payload; preflight all trees first.
use super::{
    JsonFailure, OperationV7CodecError, document_encoding::NodeEncoding,
    document_json::RecordBuilder, document_preflight::preflight_document_root,
    nested_text_wire::BlockPath,
};
use crate::{
    document::{Document, ElementNode, NodeRef, PropertyMap},
    operation::{
        NestedListTextRange, NestedListTextReplace, NestedListTextReplaceError as Error, Operation,
        OperationValidationError,
    },
    position::TextOffset,
    record::NodeRecordV1,
    state::EditorContext,
};
use serde::{Deserialize, Serialize, ser::SerializeStruct};
use serde_json::value::RawValue;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Boundary {
    block: BlockPath,
    offset: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Payload<'a> {
    #[serde(rename = "kind")]
    _kind: Tag,
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
enum Tag {
    #[serde(rename = "nestedListTextReplace")]
    Replace,
}
fn json(error: &serde_json::Error) -> OperationV7CodecError {
    OperationV7CodecError::InvalidJson(JsonFailure::from_serde(error))
}
fn invalid(error: Error) -> OperationV7CodecError {
    OperationValidationError::NestedListTextReplace(error).into()
}
pub(super) fn decode(
    raw: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV7CodecError> {
    if !context.schema().supports_nested_list_reframe() {
        return Err(invalid(Error::UnsupportedSchema));
    }
    let record: Payload<'_> = serde_json::from_str(raw).map_err(|error| json(&error))?;
    for raw in [record.expected, record.layout] {
        preflight_document_root(raw.get(), context.limits()).map_err(|error| json(&error))?;
    }
    // `inserted` is a fragment sequence, not one published root's children.
    // Bound its synthetic root by the unchanged total-node budget. All other
    // allocation limits remain intact. The complete reconstructed result is
    // still validated under the original context by OperationJsonCodecV7.
    let fragment_context = EditorContext::new(
        context.schema().clone(),
        context.limits().clone().with_max_children_per_element(context.limits().max_nodes()),
    );
    preflight_document_root(record.inserted.get(), fragment_context.limits())
        .map_err(|error| json(&error))?;
    let range = NestedListTextRange::try_new(
        record.start.block.0,
        TextOffset::try_new(record.start.offset).map_err(|_| invalid(Error::InvalidTarget))?,
        record.end.block.0,
        TextOffset::try_new(record.end.offset).map_err(|_| invalid(Error::InvalidTarget))?,
    )
    .map_err(|_| invalid(Error::InvalidTarget))?;
    NestedListTextReplace::try_new(
        record.guard_start,
        range,
        decode_roots(record.expected, context)?,
        decode_roots(record.inserted, &fragment_context)?,
        decode_roots(record.layout, context)?,
    )
    .map(Operation::NestedListTextReplace)
    .map_err(invalid)
}
fn decode_roots(
    raw: &RawValue,
    context: &EditorContext,
) -> Result<Vec<NodeRef>, OperationV7CodecError> {
    let record: NodeRecordV1 = serde_json::from_str(raw.get()).map_err(|error| json(&error))?;
    let root = RecordBuilder::new()
        .build_root(&record)
        .map_err(|report| invalid(Error::Validation(report)))?;
    let document = Document::try_new(context.schema(), root, context.limits())
        .map_err(|report| invalid(Error::Validation(report)))?;
    Ok(document
        .root()
        .as_element()
        .ok_or_else(|| invalid(Error::InvalidTarget))?
        .children()
        .to_vec())
}
fn root(context: &EditorContext, nodes: &[NodeRef]) -> Result<NodeRef, OperationV7CodecError> {
    ElementNode::try_new(
        context.schema().root_kind().clone(),
        None,
        PropertyMap::default(),
        nodes.to_vec(),
    )
    .map(NodeRef::element)
    .map_err(|_| invalid(Error::InvalidTarget))
}
pub(super) struct Encoding<'a> {
    op: &'a NestedListTextReplace,
    expected: NodeRef,
    inserted: NodeRef,
    layout: NodeRef,
}
impl<'a> Encoding<'a> {
    pub(super) fn new(
        op: &'a NestedListTextReplace,
        context: &EditorContext,
    ) -> Result<Self, OperationV7CodecError> {
        Ok(Self {
            op,
            expected: root(context, op.expected())?,
            inserted: root(context, op.inserted())?,
            layout: root(context, op.layout())?,
        })
    }
}
impl Serialize for Encoding<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut record = serializer.serialize_struct("NestedListTextReplaceV1", 7)?;
        record.serialize_field("kind", "nestedListTextReplace")?;
        record.serialize_field("guardStart", &self.op.guard_start())?;
        record.serialize_field(
            "start",
            &Boundary {
                block: BlockPath(self.op.range().start_path().clone()),
                offset: self.op.range().start_offset().get(),
            },
        )?;
        record.serialize_field(
            "end",
            &Boundary {
                block: BlockPath(self.op.range().end_path().clone()),
                offset: self.op.range().end_offset().get(),
            },
        )?;
        record.serialize_field("expected", &NodeEncoding(&self.expected))?;
        record.serialize_field("inserted", &NodeEncoding(&self.inserted))?;
        record.serialize_field("layout", &NodeEncoding(&self.layout))?;
        record.end()
    }
}
