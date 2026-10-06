//! Bounded nested text-splice payload decoding; used only by V7.
use super::{
    JsonFailure, OperationFragmentField, OperationV7CodecError, document_json::RecordBuilder,
    document_preflight::preflight_document_root, operation_payload_v2::fragment_from_record,
    operation_preflight_v2::preflight_operation_payload_v2,
};
use crate::{
    document::Document,
    operation::{
        NestedListTextSplice, NestedListTextSpliceError, Operation, OperationKind,
        OperationValidationError, TextRange,
    },
    position::{MAX_PATH_DEPTH, NodePath, TextOffset},
    record::{NodeRecordV1, TextFragmentRecordV2},
    state::EditorContext,
};
use serde::{
    Deserialize,
    de::{Error as _, SeqAccess, Visitor},
};
use serde_json::value::RawValue;

pub(super) struct BlockPath(pub(super) NodePath);
impl serde::Serialize for BlockPath {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serde::Serialize::serialize(self.0.as_slice(), serializer)
    }
}
impl<'de> Deserialize<'de> for BlockPath {
    fn deserialize<D: serde::Deserializer<'de>>(decoder: D) -> Result<Self, D::Error> {
        struct PathVisitor;
        impl<'de> Visitor<'de> for PathVisitor {
            type Value = BlockPath;
            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a bounded nested text block path")
            }
            fn visit_seq<A: SeqAccess<'de>>(
                self,
                mut sequence: A,
            ) -> Result<Self::Value, A::Error> {
                let mut indexes = Vec::new();
                while let Some(index) = sequence.next_element::<u32>()? {
                    if indexes.len() == MAX_PATH_DEPTH {
                        return Err(A::Error::custom("nested block path exceeds depth limit"));
                    }
                    indexes.push(index);
                }
                NodePath::try_from_indices(indexes).map(BlockPath).map_err(A::Error::custom)
            }
        }
        decoder.deserialize_seq(PathVisitor)
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Splice<'a> {
    #[serde(rename = "kind")]
    _kind: Tag,
    block: BlockPath,
    start: u64,
    end: u64,
    #[serde(borrow)]
    expected: &'a RawValue,
    #[serde(borrow)]
    replacement: &'a RawValue,
}
#[derive(Deserialize)]
enum Tag {
    #[serde(rename = "nestedListTextSplice")]
    Splice,
}
fn json(error: &serde_json::Error) -> OperationV7CodecError {
    OperationV7CodecError::InvalidJson(JsonFailure::from_serde(error))
}
fn invalid(error: NestedListTextSpliceError) -> OperationV7CodecError {
    OperationValidationError::NestedListTextSplice(error).into()
}
pub(super) fn decode(
    raw: &str,
    context: &EditorContext,
) -> Result<Operation, OperationV7CodecError> {
    if !context.schema().supports_nested_list_reframe() {
        return Err(OperationValidationError::UnsupportedSchema {
            kind: OperationKind::NestedListTextSplice,
            schema: context.schema().id().clone(),
        }
        .into());
    }
    let record: Splice<'_> = serde_json::from_str(raw).map_err(|error| json(&error))?;
    preflight_document_root(record.expected.get(), context.limits())
        .map_err(|error| json(&error))?;
    preflight_operation_payload_v2(record.replacement.get(), context)
        .map_err(|error| json(&error))?;
    let tree: NodeRecordV1 =
        serde_json::from_str(record.expected.get()).map_err(|error| json(&error))?;
    let root = RecordBuilder::new()
        .build_root(&tree)
        .map_err(|report| invalid(NestedListTextSpliceError::Validation(report)))?;
    let document = Document::try_new(context.schema(), root, context.limits())
        .map_err(|report| invalid(NestedListTextSpliceError::Validation(report)))?;
    let children = document
        .root()
        .as_element()
        .ok_or_else(|| invalid(NestedListTextSpliceError::InvalidTarget))?
        .children();
    if children.len() != 1 {
        return Err(invalid(NestedListTextSpliceError::InvalidTarget));
    }
    let expected =
        children.get(0).ok_or_else(|| invalid(NestedListTextSpliceError::InvalidTarget))?.clone();
    let fragment: TextFragmentRecordV2 =
        serde_json::from_str(record.replacement.get()).map_err(|error| json(&error))?;
    let fragment =
        fragment_from_record(fragment, OperationFragmentField::NestedListTextSpliceReplacement, 0)?;
    let offset = |value| {
        TextOffset::try_new(value).map_err(|_| invalid(NestedListTextSpliceError::InvalidTarget))
    };
    let range = TextRange::try_new(record.block.0, offset(record.start)?, offset(record.end)?)
        .map_err(|_| invalid(NestedListTextSpliceError::InvalidTarget))?;
    NestedListTextSplice::try_new(range, expected, fragment)
        .map(Operation::NestedListTextSplice)
        .map_err(invalid)
}
