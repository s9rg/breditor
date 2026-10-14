//! Closed, bounded interpretation of the sealed rich profile's AST properties.
//!
//! This is shared by admission and typed read views. No DOM URL, upload status,
//! cached rowspan or collaboration cursor is accepted as document metadata.

use std::collections::BTreeSet;

use crate::{
    document::{ElementNode, PropertyObject, PropertyValue},
    identity::QualifiedName,
};

use super::{
    AssetGeneration, AssetId, BlockId, CausalStamp, CellBounds, CellId, ChangeId, ColumnId,
    DocumentId, ImageAlt, ImageBinding, ImageId, ImageSize, MergeId, MergeRegion, ReplicaId,
    ResolvedTable, RichTableLimits, RowId, TableId, TableShape,
};

pub(crate) type PropertyResult<T> = Result<T, &'static str>;

pub(crate) fn property<'a>(node: &'a ElementNode, local: &str) -> Option<&'a PropertyValue> {
    let name = QualifiedName::try_new(format!("breditor/{local}")).ok()?;
    node.properties().get(&name)
}

pub(crate) fn string<'a>(node: &'a ElementNode, local: &str) -> PropertyResult<&'a str> {
    property(node, local).and_then(PropertyValue::as_string).ok_or("required string property")
}

fn integer(node: &ElementNode, local: &str, min: i64, max: i64) -> PropertyResult<i64> {
    let value = property(node, local)
        .and_then(PropertyValue::as_integer)
        .ok_or("required integer property")?
        .get();
    if !(min..=max).contains(&value) {
        return Err("integer property outside the rich contract");
    }
    Ok(value)
}

fn boolean(node: &ElementNode, local: &str) -> PropertyResult<bool> {
    property(node, local).and_then(PropertyValue::as_boolean).ok_or("required boolean property")
}

pub(crate) fn required_properties(kind: &str) -> &'static [&'static str] {
    match kind {
        "breditor/document" => &["document-id"],
        "breditor/paragraph" | "breditor/bullet-list" | "breditor/list-item" => &["block-id"],
        "breditor/heading" => &["block-id", "level"],
        "breditor/ordered-list" => &["block-id", "start"],
        "breditor/table" => &["block-id", "table-id", "columns", "merges", "retracted-merges"],
        "breditor/table-row" => &["block-id", "row-id"],
        "breditor/table-cell" => &["block-id", "column-id", "header"],
        "breditor/image" => {
            &["block-id", "image-id", "asset-id", "asset-generation", "alt-text", "decorative"]
        }
        _ => &[],
    }
}

pub(crate) fn allows_property(kind: &str, name: &QualifiedName) -> bool {
    name.namespace() == "breditor"
        && (required_properties(kind).contains(&name.local_name())
            || (kind == "breditor/image" && matches!(name.local_name(), "width" | "height")))
}

pub(crate) fn validate_values(node: &ElementNode) -> PropertyResult<()> {
    if node.kind().as_str() == "breditor/document" {
        DocumentId::try_new(string(node, "document-id")?)
            .map_err(|_| "invalid document identity")?;
        return Ok(());
    }
    BlockId::try_new(string(node, "block-id")?).map_err(|_| "invalid block identity")?;
    match node.kind().as_str() {
        "breditor/heading" => {
            integer(node, "level", 1, 6)?;
        }
        "breditor/ordered-list" => {
            let start =
                integer(node, "start", 1, i64::from(crate::block::MAX_ORDERED_LIST_ORDINAL))?;
            if !crate::schema::element_property_contract::child_ordinals_fit(
                start,
                node.children().len(),
                i64::from(crate::block::MAX_ORDERED_LIST_ORDINAL),
            ) {
                return Err("ordered list final ordinal exceeds its ceiling");
            }
        }
        "breditor/list-item" => {
            if !node.children().get(0).and_then(crate::document::NodeRef::as_element).is_some_and(
                |first| matches!(first.kind().as_str(), "breditor/paragraph" | "breditor/heading"),
            ) {
                return Err("list item must begin with a paragraph or heading");
            }
        }
        "breditor/table-row" => {
            RowId::try_new(string(node, "row-id")?).map_err(|_| "invalid row identity")?;
        }
        "breditor/table-cell" => {
            ColumnId::try_new(string(node, "column-id")?).map_err(|_| "invalid column identity")?;
            boolean(node, "header")?;
        }
        "breditor/image" => {
            image_binding(node)?;
        }
        _ => {}
    }
    Ok(())
}

pub(crate) fn image_binding(node: &ElementNode) -> PropertyResult<ImageBinding> {
    let image =
        ImageId::try_new(string(node, "image-id")?).map_err(|_| "invalid image identity")?;
    let asset =
        AssetId::try_new(string(node, "asset-id")?).map_err(|_| "invalid asset identity")?;
    let generation = AssetGeneration::try_new(string(node, "asset-generation")?)
        .map_err(|_| "invalid asset generation")?;
    let description = string(node, "alt-text")?;
    let alt = if boolean(node, "decorative")? {
        if !description.is_empty() {
            return Err("decorative image alt must be empty");
        }
        ImageAlt::decorative()
    } else {
        // Check before copying untrusted property text.
        if description.len() > 4096 || description.trim().is_empty() {
            return Err("invalid nondecorative image alt");
        }
        ImageAlt::try_description(description.to_owned()).map_err(|_| "invalid image alt")?
    };
    let size = match (property(node, "width"), property(node, "height")) {
        (None, None) => None,
        (Some(_), Some(_)) => {
            let width = u32::try_from(integer(node, "width", 1, 4096)?)
                .map_err(|_| "invalid image width")?;
            let height = u32::try_from(integer(node, "height", 1, 4096)?)
                .map_err(|_| "invalid image height")?;
            Some(ImageSize::try_new(width, height).map_err(|_| "invalid paired image size")?)
        }
        _ => return Err("image display dimensions must be supplied as a pair"),
    };
    Ok(ImageBinding::new(image, asset, generation, alt, size))
}

/// Checked ordered column metadata; width is logical pixels, not DOM state.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichColumn {
    id: ColumnId,
    width: u32,
}

impl RichColumn {
    /// Stable column identity, scoped to its table.
    #[must_use]
    pub const fn id(&self) -> &ColumnId {
        &self.id
    }
    /// Checked display width in the provisional range 32–4096.
    #[must_use]
    pub const fn width(&self) -> u32 {
        self.width
    }
}

/// Derived table geometry over retained base-cell AST bodies.
///
/// This view never owns a second mutable document. Cell spans and partitions
/// are derived from merge intent, and are not authored properties.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichTableView {
    table: TableId,
    rows: Vec<RowId>,
    columns: Vec<RichColumn>,
    geometry: ResolvedTable,
}

impl RichTableView {
    /// Stable table identity.
    #[must_use]
    pub const fn id(&self) -> &TableId {
        &self.table
    }
    /// Current row identities in semantic order.
    #[must_use]
    pub fn rows(&self) -> &[RowId] {
        &self.rows
    }
    /// Current column metadata in semantic order.
    #[must_use]
    pub fn columns(&self) -> &[RichColumn] {
        &self.columns
    }
    /// Non-destructive presentation mapping, including inactive merge conflicts.
    #[must_use]
    pub const fn geometry(&self) -> &ResolvedTable {
        &self.geometry
    }
}

fn array<'a>(
    node: &'a ElementNode,
    local: &str,
    max: usize,
) -> PropertyResult<&'a [PropertyValue]> {
    let values =
        property(node, local).and_then(PropertyValue::as_array).ok_or("required array property")?;
    if values.len() > max {
        return Err("rich array exceeds its count ceiling");
    }
    Ok(values)
}

fn closed_object<'a>(
    value: &'a PropertyValue,
    names: &[&str],
) -> PropertyResult<&'a PropertyObject> {
    let object = value.as_object().ok_or("required object property")?;
    if object.len() != names.len() || names.iter().any(|name| object.get(name).is_none()) {
        return Err("object must contain exactly its declared fields");
    }
    Ok(object)
}

fn object_string<'a>(object: &'a PropertyObject, key: &str) -> PropertyResult<&'a str> {
    object.get(key).and_then(PropertyValue::as_string).ok_or("required object string")
}

fn exact_u64(object: &PropertyObject, key: &str) -> PropertyResult<u64> {
    let value = object_string(object, key)?;
    if value.is_empty()
        || value.len() > 20
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("causal words must be canonical unsigned decimal strings");
    }
    value.parse().map_err(|_| "causal word exceeds u64")
}

fn context_axes<T>(
    object: &PropertyObject,
    key: &str,
    max: usize,
    parse: impl Fn(&str) -> PropertyResult<T>,
) -> PropertyResult<Vec<T>> {
    let values =
        object.get(key).and_then(PropertyValue::as_array).ok_or("required axis context")?;
    if values.len() > max {
        return Err("merge context exceeds its axis ceiling");
    }
    values
        .iter()
        .map(|value| parse(value.as_string().ok_or("axis identity must be a string")?))
        .collect()
}

fn merge(table: &TableId, value: &PropertyValue) -> PropertyResult<MergeRegion> {
    let object = closed_object(
        value,
        &[
            "id",
            "lamport",
            "writer",
            "counter",
            "rows",
            "columns",
            "first-row",
            "last-row",
            "first-column",
            "last-column",
        ],
    )?;
    let id =
        MergeId::try_new(object_string(object, "id")?).map_err(|_| "invalid merge identity")?;
    let rows = context_axes(object, "rows", 256, |id| {
        RowId::try_new(id).map_err(|_| "invalid captured row")
    })?;
    let columns = context_axes(object, "columns", 128, |id| {
        ColumnId::try_new(id).map_err(|_| "invalid captured column")
    })?;
    let context = TableShape::try_new(table.clone(), rows, columns, RichTableLimits::default())
        .map_err(|_| "invalid merge context shape")?;
    let bounds = CellBounds::new(
        CellId::new(
            table.clone(),
            RowId::try_new(object_string(object, "first-row")?).map_err(|_| "invalid first row")?,
            ColumnId::try_new(object_string(object, "first-column")?)
                .map_err(|_| "invalid first column")?,
        ),
        CellId::new(
            table.clone(),
            RowId::try_new(object_string(object, "last-row")?).map_err(|_| "invalid last row")?,
            ColumnId::try_new(object_string(object, "last-column")?)
                .map_err(|_| "invalid last column")?,
        ),
    );
    let replica =
        ReplicaId::try_new(exact_u64(object, "writer")?).map_err(|_| "invalid merge writer")?;
    let stamp = CausalStamp::new(
        exact_u64(object, "lamport")?,
        ChangeId::new(replica, exact_u64(object, "counter")?),
    );
    context.capture_merge(id, stamp, &bounds).map_err(|_| "invalid captured merge bounds")
}

pub(crate) fn table_view(node: &ElementNode) -> PropertyResult<RichTableView> {
    let table =
        TableId::try_new(string(node, "table-id")?).map_err(|_| "invalid table identity")?;
    let column_records = array(node, "columns", 128)?;
    if node.children().len() > 256
        || node.children().len().checked_mul(column_records.len()).is_none_or(|count| count > 4096)
    {
        return Err("table exceeds its row or base-cell ceiling");
    }
    let columns: Vec<_> = column_records
        .iter()
        .map(|value| {
            let object = closed_object(value, &["id", "width"])?;
            let id = ColumnId::try_new(object_string(object, "id")?)
                .map_err(|_| "invalid table column identity")?;
            let width = object
                .get("width")
                .and_then(PropertyValue::as_integer)
                .ok_or("required column width")?
                .get();
            if !(32..=4096).contains(&width) {
                return Err("column width outside 32–4096");
            }
            Ok(RichColumn { id, width: u32::try_from(width).map_err(|_| "invalid column width")? })
        })
        .collect::<PropertyResult<_>>()?;
    let rows: Vec<_> = node
        .children()
        .iter()
        .map(|row| {
            let row = row
                .as_element()
                .filter(|row| row.kind().as_str() == "breditor/table-row")
                .ok_or("table must contain rows only")?;
            if row.children().len() != columns.len() {
                return Err("row must contain exactly one base cell per column");
            }
            for (cell, column) in row.children().iter().zip(&columns) {
                let cell = cell
                    .as_element()
                    .filter(|cell| cell.kind().as_str() == "breditor/table-cell")
                    .ok_or("row must contain base cells only")?;
                if string(cell, "column-id")? != column.id.as_str() {
                    return Err("base cell order must match stable table column order");
                }
            }
            RowId::try_new(string(row, "row-id")?).map_err(|_| "invalid table row identity")
        })
        .collect::<PropertyResult<_>>()?;
    let shape = TableShape::try_new(
        table.clone(),
        rows.clone(),
        columns.iter().map(|column| column.id.clone()).collect(),
        RichTableLimits::default(),
    )
    .map_err(|_| "table axes must be unique and bounded")?;
    let regions: Vec<_> = array(node, "merges", 256)?
        .iter()
        .map(|value| merge(&table, value))
        .collect::<PropertyResult<_>>()?;
    if regions.windows(2).any(|pair| pair[0].id() >= pair[1].id()) {
        return Err("merge records must have unique ascending identity order");
    }
    let retracted: Vec<_> = array(node, "retracted-merges", 256)?
        .iter()
        .map(|value| {
            MergeId::try_new(value.as_string().ok_or("retraction must be a merge identity")?)
                .map_err(|_| "invalid retracted merge identity")
        })
        .collect::<PropertyResult<_>>()?;
    if retracted.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err("merge retractions must have unique ascending identity order");
    }
    let retracted: BTreeSet<_> = retracted.into_iter().collect();
    let geometry =
        shape.resolve(&regions, &retracted).map_err(|_| "invalid table merge record set")?;
    Ok(RichTableView { table, rows, columns, geometry })
}
