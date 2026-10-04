//! Bounded coordinates/layout and node guards for the V6 flat-list wire language.
use super::{JsonFailure, OperationV6CodecError, document_json::RecordBuilder};
use crate::{
    block::{ListKind, OrderedListStart},
    document::{Document, ElementNode, NodeRef, PropertyMap},
    operation::{
        FlatListReframeError, FlatListRootShape, FlatListTextReplaceError, FlatListTextSpliceError,
        OperationKind, OperationValidationError,
    },
    position::{NodePath, TextOffset},
    record::NodeRecordV1,
    schema::ValidationReport,
    state::EditorContext,
};
use serde::{
    Deserialize, Serialize,
    de::{DeserializeSeed, Error, SeqAccess, Visitor},
};
use serde_json::value::RawValue;
use std::fmt;

pub(super) struct BlockPath(pub(super) NodePath);
impl Serialize for BlockPath {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.as_slice().serialize(serializer)
    }
}
impl<'de> Deserialize<'de> for BlockPath {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct PathVisitor;
        impl<'de> Visitor<'de> for PathVisitor {
            type Value = BlockPath;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a bare or flat-list text block path")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut values = Vec::with_capacity(3);
                while let Some(index) = seq.next_element::<u32>()? {
                    if values.len() == 3 {
                        return Err(A::Error::custom("flat block path exceeds three indices"));
                    }
                    values.push(index);
                }
                if !matches!(values.as_slice(), [_] | [_, _, 0]) {
                    return Err(A::Error::custom("invalid flat block path"));
                }
                NodePath::try_from_indices(values).map(BlockPath).map_err(A::Error::custom)
            }
        }
        deserializer.deserialize_seq(PathVisitor)
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Boundary {
    pub(super) block: BlockPath,
    pub(super) offset: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Shape {
    Block,
    Bullet { items: u32 },
    Ordered { start: u32, items: u32 },
}
impl Shape {
    pub(super) fn from_runtime(shape: &FlatListRootShape) -> Self {
        match shape {
            FlatListRootShape::TextBlock => Self::Block,
            FlatListRootShape::List { kind: ListKind::Bullet, items } => {
                Self::Bullet { items: *items }
            }
            FlatListRootShape::List { kind: ListKind::Ordered(start), items } => {
                Self::Ordered { start: start.get(), items: *items }
            }
        }
    }
    fn into_runtime(self) -> Result<FlatListRootShape, FlatListTextReplaceError> {
        Ok(match self {
            Self::Block => FlatListRootShape::TextBlock,
            Self::Bullet { items } => FlatListRootShape::List { kind: ListKind::Bullet, items },
            Self::Ordered { start, items } => FlatListRootShape::List {
                kind: ListKind::Ordered(
                    OrderedListStart::try_new(start)
                        .map_err(|_| FlatListTextReplaceError::OrdinalOverflow)?,
                ),
                items,
            },
        })
    }
}
struct LayoutSeed(usize);
impl<'de> DeserializeSeed<'de> for LayoutSeed {
    type Value = Vec<Shape>;
    fn deserialize<D: serde::Deserializer<'de>>(
        self,
        deserializer: D,
    ) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_seq(self)
    }
}
impl<'de> Visitor<'de> for LayoutSeed {
    type Value = Vec<Shape>;
    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a bounded flat-list result layout")
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
        let mut shapes = vec![];
        while let Some(shape) = seq.next_element::<Shape>()? {
            if shapes.len() >= self.0 {
                return Err(A::Error::custom("flat-list layout exceeds root-child limit"));
            }
            shapes.push(shape);
        }
        Ok(shapes)
    }
}
pub(super) fn decode_layout(
    raw: &RawValue,
    context: &EditorContext,
) -> Result<Vec<FlatListRootShape>, OperationV6CodecError> {
    let mut de = serde_json::Deserializer::from_str(raw.get());
    let shapes = LayoutSeed(context.limits().max_children_per_element())
        .deserialize(&mut de)
        .map_err(|error| invalid_json(&error))?;
    de.end().map_err(|error| invalid_json(&error))?;
    shapes
        .into_iter()
        .map(|shape| {
            shape
                .into_runtime()
                .map_err(|error| OperationValidationError::FlatListTextReplace(error).into())
        })
        .collect()
}

/// Every raw root is preflighted before this owned tree conversion is invoked.
pub(super) fn decode_roots(
    raw: &RawValue,
    context: &EditorContext,
    kind: OperationKind,
) -> Result<Vec<NodeRef>, OperationV6CodecError> {
    let record: NodeRecordV1 =
        serde_json::from_str(raw.get()).map_err(|error| invalid_json(&error))?;
    let root =
        RecordBuilder::new().build_root(&record).map_err(|report| validation(kind, report))?;
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
pub(super) fn root(
    context: &EditorContext,
    nodes: Vec<NodeRef>,
    kind: OperationKind,
) -> Result<NodeRef, OperationV6CodecError> {
    ElementNode::try_new(context.schema().root_kind().clone(), None, PropertyMap::default(), nodes)
        .map(NodeRef::element)
        .map_err(|_| invalid_target(kind))
}
pub(super) fn require_schema(
    context: &EditorContext,
    kind: OperationKind,
) -> Result<(), OperationV6CodecError> {
    if context.schema().supports_flat_list_operations() {
        Ok(())
    } else {
        Err(OperationValidationError::UnsupportedSchema {
            kind,
            schema: context.schema().id().clone(),
        }
        .into())
    }
}
pub(super) fn offset(value: u64, kind: OperationKind) -> Result<TextOffset, OperationV6CodecError> {
    TextOffset::try_new(value).map_err(|_| invalid_target(kind))
}
pub(super) fn invalid_target(kind: OperationKind) -> OperationV6CodecError {
    match kind {
        OperationKind::FlatListReframe => {
            OperationValidationError::FlatListReframe(FlatListReframeError::InvalidTarget).into()
        }
        OperationKind::FlatListTextSplice => {
            OperationValidationError::FlatListTextSplice(FlatListTextSpliceError::InvalidTarget)
                .into()
        }
        _ => OperationValidationError::FlatListTextReplace(FlatListTextReplaceError::InvalidTarget)
            .into(),
    }
}
fn validation(kind: OperationKind, report: ValidationReport) -> OperationV6CodecError {
    match kind {
        OperationKind::FlatListReframe => {
            OperationValidationError::FlatListReframe(FlatListReframeError::Validation(report))
                .into()
        }
        OperationKind::FlatListTextSplice => OperationValidationError::FlatListTextSplice(
            FlatListTextSpliceError::Validation(report),
        )
        .into(),
        _ => OperationValidationError::FlatListTextReplace(FlatListTextReplaceError::Validation(
            report,
        ))
        .into(),
    }
}
pub(super) fn invalid_json(error: &serde_json::Error) -> OperationV6CodecError {
    OperationV6CodecError::InvalidJson(JsonFailure::from_serde(error))
}
