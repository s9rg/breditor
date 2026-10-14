//! Fresh typed clipboard births; asset references stay immutable and host scoped.

use super::{RichClipboardError, RichClipboardFragment};
use crate::{
    document::{ElementNode, NodeRef, PropertyValue},
    rich_content::{
        AssetGeneration, BlockId, CausalStamp, CellBounds, CellId, ColumnId, MergeId,
        RichTableLimits, RowId, TableId, TableShape, actions::rewrite_properties::with_properties,
        ast_properties,
    },
    state::EditorContext,
};
use std::collections::{BTreeMap, BTreeSet};

/// Identity domain requested during a clipboard paste; assets themselves are not copied IDs.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum RichClipboardIdentityKind {
    /// Every flow/container/text-block content node.
    Block,
    /// Whole table, distinct from its content-block identity.
    Table,
    /// Stable row axis.
    Row,
    /// Stable column axis.
    Column,
    /// Image node, not its immutable bitmap.
    Image,
    /// Fresh binding generation for each copied image.
    AssetGeneration,
    /// New active merge intent, not a source retraction/history record.
    Merge,
}

/// Host-owned durable allocation; consumed IDs are never rolled back or reused on failure.
///
/// The host must prevent historical/target namespace reuse, not merely collisions
/// in this fragment. The core checks syntax, source reuse and duplicate new IDs;
/// complete target admission runs when the captured paste action is applied.
pub trait RichClipboardIdAllocator {
    /// Allocate one fresh opaque ID in the declared domain.
    ///
    /// # Errors
    /// Return allocation failure without fabricating a substitute identity.
    fn next(&mut self, kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError>;
    /// Supply the newly authored merge's causal priority, never a copied writer's priority.
    ///
    /// Shared adapters derive/verify this against the replicated action, not clipboard claims.
    ///
    /// # Errors
    /// Return failure if no valid current author/action priority is available.
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError>;
}

struct Scope {
    rows: BTreeMap<RowId, RowId>,
    columns: BTreeMap<ColumnId, ColumnId>,
}
struct Rekeyer<'a> {
    fragment: &'a RichClipboardFragment,
    allocator: &'a mut dyn RichClipboardIdAllocator,
    source: BTreeMap<RichClipboardIdentityKind, BTreeSet<String>>,
    used: BTreeMap<RichClipboardIdentityKind, BTreeSet<String>>,
}

pub(super) fn prepare(
    context: &EditorContext,
    fragment: &RichClipboardFragment,
    allocator: &mut dyn RichClipboardIdAllocator,
) -> Result<RichClipboardFragment, RichClipboardError> {
    RichClipboardFragment::try_admit(context, fragment.kind, fragment.document.document().clone())?;
    let mut source = BTreeMap::new();
    inventory(fragment.document.document().root(), &mut source)?;
    let mut rekeyer = Rekeyer { fragment, allocator, source, used: BTreeMap::new() };
    let nodes = fragment
        .document
        .document()
        .root()
        .as_element()
        .ok_or(RichClipboardError::Invariant)?
        .children()
        .iter()
        .map(|node| rekeyer.node(node, None))
        .collect::<Result<Vec<_>, _>>()?;
    RichClipboardFragment::from_nodes(context, fragment.kind, nodes)
}

fn string<'a>(node: &'a ElementNode, local: &str) -> Result<&'a str, RichClipboardError> {
    ast_properties::string(node, local).map_err(|_| RichClipboardError::Invariant)
}
fn inventory(
    node: &NodeRef,
    values: &mut BTreeMap<RichClipboardIdentityKind, BTreeSet<String>>,
) -> Result<(), RichClipboardError> {
    use RichClipboardIdentityKind as K;
    let Some(node) = node.as_element() else { return Ok(()) };
    for (local, kind) in [
        ("block-id", K::Block),
        ("table-id", K::Table),
        ("row-id", K::Row),
        ("column-id", K::Column),
        ("image-id", K::Image),
        ("asset-generation", K::AssetGeneration),
    ] {
        if let Some(value) =
            ast_properties::property(node, local).and_then(PropertyValue::as_string)
        {
            values.entry(kind).or_default().insert(value.to_owned());
        }
    }
    if node.kind().as_str() == "breditor/table" {
        for (local, kind) in [("columns", K::Column), ("merges", K::Merge)] {
            for value in ast_properties::property(node, local)
                .and_then(PropertyValue::as_array)
                .ok_or(RichClipboardError::Invariant)?
            {
                let id = value
                    .as_object()
                    .and_then(|value| value.get("id"))
                    .and_then(PropertyValue::as_string)
                    .ok_or(RichClipboardError::Invariant)?;
                values.entry(kind).or_default().insert(id.to_owned());
            }
        }
    }
    for child in node.children() {
        inventory(child, values)?;
    }
    Ok(())
}

impl Rekeyer<'_> {
    fn fresh(&mut self, kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        let value = self.allocator.next(kind)?;
        BlockId::try_new(&value).map_err(|_| RichClipboardError::Allocation)?;
        if self.source.get(&kind).is_some_and(|ids| ids.contains(&value))
            || !self.used.entry(kind).or_default().insert(value.clone())
        {
            return Err(RichClipboardError::Allocation);
        }
        Ok(value)
    }
    fn node(
        &mut self,
        node: &NodeRef,
        scope: Option<&Scope>,
    ) -> Result<NodeRef, RichClipboardError> {
        use RichClipboardIdentityKind as K;
        let Some(element) = node.as_element() else { return Ok(node.clone()) };
        let block = self.fresh(K::Block)?;
        if element.kind().as_str() == "breditor/table" {
            return self.table(node, block);
        }
        let mut changes = vec![("block-id", Some(PropertyValue::from_string(block)))];
        match element.kind().as_str() {
            "breditor/table-row" => {
                let old = RowId::try_new(string(element, "row-id")?)
                    .map_err(|_| RichClipboardError::Invariant)?;
                let id = scope
                    .and_then(|scope| scope.rows.get(&old))
                    .ok_or(RichClipboardError::Invariant)?;
                changes.push(("row-id", Some(PropertyValue::from_string(id.as_str()))));
            }
            "breditor/table-cell" => {
                let old = ColumnId::try_new(string(element, "column-id")?)
                    .map_err(|_| RichClipboardError::Invariant)?;
                let id = scope
                    .and_then(|scope| scope.columns.get(&old))
                    .ok_or(RichClipboardError::Invariant)?;
                changes.push(("column-id", Some(PropertyValue::from_string(id.as_str()))));
            }
            "breditor/image" => {
                changes.push(("image-id", Some(PropertyValue::from_string(self.fresh(K::Image)?))));
                let generation = AssetGeneration::try_new(self.fresh(K::AssetGeneration)?)
                    .map_err(|_| RichClipboardError::Allocation)?;
                changes.push((
                    "asset-generation",
                    Some(PropertyValue::from_string(generation.as_str())),
                ));
            }
            _ => {}
        }
        let children = element
            .children()
            .iter()
            .map(|child| self.node(child, scope))
            .collect::<Result<Vec<_>, _>>()?;
        let node = NodeRef::element(
            element.try_with_children(children).map_err(|_| RichClipboardError::Invariant)?,
        );
        Ok(with_properties(&node, changes)?)
    }
    fn table(&mut self, node: &NodeRef, block: String) -> Result<NodeRef, RichClipboardError> {
        use RichClipboardIdentityKind as K;
        let element = node.as_element().ok_or(RichClipboardError::Invariant)?;
        let old = TableId::try_new(string(element, "table-id")?)
            .map_err(|_| RichClipboardError::Invariant)?;
        let view = self.fragment.document.table(&old)?.ok_or(RichClipboardError::Invariant)?;
        let id =
            TableId::try_new(self.fresh(K::Table)?).map_err(|_| RichClipboardError::Allocation)?;
        let rows = view
            .rows()
            .iter()
            .map(|row| {
                Ok((
                    row.clone(),
                    RowId::try_new(self.fresh(K::Row)?)
                        .map_err(|_| RichClipboardError::Allocation)?,
                ))
            })
            .collect::<Result<BTreeMap<_, _>, RichClipboardError>>()?;
        let columns = view
            .columns()
            .iter()
            .map(|column| {
                Ok((
                    column.id().clone(),
                    ColumnId::try_new(self.fresh(K::Column)?)
                        .map_err(|_| RichClipboardError::Allocation)?,
                ))
            })
            .collect::<Result<BTreeMap<_, _>, RichClipboardError>>()?;
        let scope = Scope { rows, columns };
        let old_shape = TableShape::try_new(
            old,
            view.rows().to_vec(),
            view.columns().iter().map(|column| column.id().clone()).collect(),
            RichTableLimits::default(),
        )?;
        let new_shape = TableShape::try_new(
            id.clone(),
            view.rows().iter().map(|row| scope.rows[row].clone()).collect(),
            view.columns().iter().map(|column| scope.columns[column.id()].clone()).collect(),
            RichTableLimits::default(),
        )?;
        let mut merges = Vec::new();
        for record in ast_properties::property(element, "merges")
            .and_then(PropertyValue::as_array)
            .ok_or(RichClipboardError::Invariant)?
        {
            let region = ast_properties::merge(view.id(), record)
                .map_err(|_| RichClipboardError::Invariant)?;
            let (r0, r1, c0, c1) =
                old_shape.rectangle(&region).ok_or(RichClipboardError::Invariant)?;
            let merge = MergeId::try_new(self.fresh(K::Merge)?)
                .map_err(|_| RichClipboardError::Allocation)?;
            let cell = |r: usize, c: usize| {
                CellId::new(
                    id.clone(),
                    scope.rows[&view.rows()[r]].clone(),
                    scope.columns[view.columns()[c].id()].clone(),
                )
            };
            let region = new_shape.capture_merge(
                merge,
                self.allocator.merge_stamp()?,
                &CellBounds::new(cell(r0, c0), cell(r1, c1)),
            )?;
            merges.push(
                ast_properties::merge_property(&region)
                    .map_err(|_| RichClipboardError::Invariant)?,
            );
        }
        merges.sort_by(|a, b| merge_id(a).cmp(&merge_id(b)));
        let column_records = view
            .columns()
            .iter()
            .map(|column| {
                crate::rich_content::TableColumnDraft::try_new(
                    scope.columns[column.id()].clone(),
                    column.width(),
                )?
                .property()
            })
            .collect::<Result<Vec<_>, _>>()?;
        let children = element
            .children()
            .iter()
            .map(|child| self.node(child, Some(&scope)))
            .collect::<Result<Vec<_>, _>>()?;
        let node = NodeRef::element(
            element.try_with_children(children).map_err(|_| RichClipboardError::Invariant)?,
        );
        Ok(with_properties(
            &node,
            [
                ("block-id", Some(PropertyValue::from_string(block))),
                ("table-id", Some(PropertyValue::from_string(id.as_str()))),
                ("columns", Some(PropertyValue::array(column_records))),
                ("merges", Some(PropertyValue::array(merges))),
                ("retracted-merges", Some(PropertyValue::array(vec![]))),
            ],
        )?)
    }
}
fn merge_id(value: &PropertyValue) -> Option<&str> {
    value.as_object().and_then(|value| value.get("id")).and_then(PropertyValue::as_string)
}
