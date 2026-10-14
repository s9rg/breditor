//! Admission previews are disposable immutable ASTs, never the replicated source of truth.
use super::{Command, creation, model};
use crate::Error;
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::RichDocument};
use loro::LoroDoc;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(super) fn handles(command: &Command) -> bool {
    matches!(
        command,
        Command::InsertBlocks(_)
            | Command::InsertRow(_)
            | Command::InsertColumn(_)
            | Command::SetHeader(_)
            | Command::MergeCells(_)
            | Command::SplitCell(_)
    )
}

pub(super) fn validate(
    codec: &DocumentJsonCodecV2,
    doc: &LoroDoc,
    document: &RichDocument,
    canonical: &str,
    command: &Command,
) -> Result<(), Error> {
    if validate_geometry(codec, doc, document, command)? {
        return Ok(());
    }
    let mut preview: Value = serde_json::from_str(canonical)?;
    match command {
        Command::InsertBlocks(value) => {
            insert_flow(doc, &mut preview, value)?;
        }
        Command::InsertRow(value) => {
            crate::actions::validate_id(&value.row)?;
            for row in super::placement::children(doc, Some(&value.block))? {
                if model::object_string(&model::metadata(doc, &row)?, "identity")?["breditor/row-id"]
                    == value.row
                {
                    return Err(Error::Contract("fresh historical row identity"));
                }
            }
            let table = table_mut(&mut preview, &value.block)?;
            let mut row = creation::empty_row(&value.row_block, &value.row);
            row["children"] = Value::Array(
                table["properties"]["breditor/columns"]
                    .as_array()
                    .ok_or(Error::Contract("shared table columns"))?
                    .iter()
                    .map(|column| {
                        empty_cell(
                            &table["properties"]["breditor/table-id"],
                            &json!(value.row),
                            &column["id"],
                        )
                    })
                    .collect::<Result<Vec<_>, _>>()?,
            );
            insert_children(table, value.before.as_deref(), vec![row])?;
        }
        Command::InsertColumn(value) => {
            let table = table_mut(&mut preview, &value.block)?;
            let columns = table["properties"]["breditor/columns"]
                .as_array_mut()
                .ok_or(Error::Contract("shared table columns"))?;
            let index = if let Some(before) = &value.before {
                columns
                    .iter()
                    .position(|column| column["id"] == *before)
                    .ok_or(Error::Contract("visible shared column before"))?
            } else {
                columns.len()
            };
            columns.insert(index, json!({"id":value.column,"width":value.width}));
            let table_id = table["properties"]["breditor/table-id"].clone();
            for row in
                table["children"].as_array_mut().ok_or(Error::Contract("shared table rows"))?
            {
                let cell = empty_cell(
                    &table_id,
                    &row["properties"]["breditor/row-id"],
                    &json!(value.column),
                )?;
                row["children"]
                    .as_array_mut()
                    .ok_or(Error::Contract("shared row cells"))?
                    .insert(index, cell);
            }
        }
        Command::SetHeader(value) => {
            headers_closed(document, &value.cells)?;
            let mut seen = BTreeSet::new();
            if value.cells.is_empty() || value.cells.len() > 4096 {
                return Err(Error::Limit("shared header cells"));
            }
            for block in &value.cells {
                if !seen.insert(block) {
                    return Err(Error::Contract("duplicate shared header cell"));
                }
                let node = find_mut(&mut preview["root"], block)
                    .ok_or(Error::Contract("visible shared header cell"))?;
                if node["type"] != "breditor/table-cell" {
                    return Err(Error::Contract("shared header target kind"));
                }
                node["properties"]["breditor/header"] = json!(value.header);
            }
        }
        _ => return Err(Error::Contract("shared creation planner action")),
    }
    let admitted = codec
        .decode(&preview.to_string())
        .map_err(|_| Error::Contract("shared creation schema admission"))?;
    RichDocument::try_admit(codec.schema(), admitted, codec.limits())
        .map_err(|_| Error::Contract("shared creation rich admission"))?;
    Ok(())
}

fn validate_geometry(
    codec: &DocumentJsonCodecV2,
    doc: &LoroDoc,
    document: &RichDocument,
    command: &Command,
) -> Result<bool, Error> {
    let context =
        breditor_core::state::EditorContext::new(codec.schema().clone(), codec.limits().clone());
    match command {
        Command::MergeCells(value) => {
            value
                .capture(document, crate::register::Stamp::next(doc)?)?
                .apply(&context, document)
                .map_err(|_| Error::Contract("shared merge admission"))?;
        }
        Command::SplitCell(value) => {
            value
                .capture(document)?
                .apply(&context, document)
                .map_err(|_| Error::Contract("shared split admission"))?;
        }
        _ => return Ok(false),
    }
    Ok(true)
}

fn headers_closed(document: &RichDocument, blocks: &[String]) -> Result<(), Error> {
    let selected = blocks
        .iter()
        .map(|block| super::merges::cell(document, block))
        .collect::<Result<BTreeSet<_>, _>>()?;
    for cell in &selected {
        let view = document
            .table(cell.table())
            .map_err(|_| Error::Contract("shared header table"))?
            .ok_or(Error::Contract("shared header table"))?;
        let resolved = view
            .geometry()
            .cells()
            .iter()
            .find(|value| value.base() == cell)
            .ok_or(Error::Contract("shared header geometry"))?;
        let master = view
            .geometry()
            .cells()
            .iter()
            .find(|value| value.base() == resolved.master())
            .ok_or(Error::Contract("shared header master"))?;
        if master.source_cells().iter().any(|cell| !selected.contains(cell)) {
            return Err(Error::Contract("shared headers require merge-closed source cells"));
        }
    }
    Ok(())
}

fn insert_flow(
    doc: &LoroDoc,
    preview: &mut Value,
    value: &super::actions::InsertBlocks,
) -> Result<(), Error> {
    if value.nodes.is_empty() || value.nodes.len() > 64 {
        return Err(Error::Limit("shared inserted flow blocks"));
    }
    for node in &value.nodes {
        if !matches!(
            node["type"].as_str(),
            Some(
                "breditor/paragraph"
                    | "breditor/heading"
                    | "breditor/bullet-list"
                    | "breditor/ordered-list"
                    | "breditor/table"
                    | "breditor/image"
            )
        ) {
            return Err(Error::Contract("shared inserted flow kind"));
        }
        creation::fresh_entities(doc, node)?;
    }
    let parent = if let Some(parent) = &value.parent {
        let node = find_mut(&mut preview["root"], parent)
            .ok_or(Error::Contract("visible shared creation parent"))?;
        if !matches!(
            node["type"].as_str(),
            Some("breditor/table-cell" | "breditor/list-item" | "breditor/image")
        ) {
            return Err(Error::Contract("shared creation flow parent"));
        }
        node
    } else {
        &mut preview["root"]
    };
    insert_children(parent, value.before.as_deref(), value.nodes.clone())
}

pub(super) fn empty_cell(table: &Value, row: &Value, column: &Value) -> Result<Value, Error> {
    let table = table.as_str().ok_or(Error::Contract("shared table identity"))?;
    let row = row.as_str().ok_or(Error::Contract("shared row identity"))?;
    let column = column.as_str().ok_or(Error::Contract("shared column identity"))?;
    let block = model::virtual_id("cell", &[table, row, column]);
    let text = model::virtual_id("flow", &[&block]);
    Ok(json!({"kind":"element","type":"breditor/table-cell","entityId":null,
        "properties":{"breditor/block-id":block,"breditor/column-id":column,"breditor/header":false},
        "children":[model::placeholder(&text,&[])]}))
}

fn table_mut<'a>(value: &'a mut Value, block: &str) -> Result<&'a mut Value, Error> {
    let table =
        find_mut(&mut value["root"], block).ok_or(Error::Contract("visible shared table"))?;
    if table["type"] != "breditor/table" {
        return Err(Error::Contract("shared table target kind"));
    }
    Ok(table)
}

fn insert_children(
    parent: &mut Value,
    before: Option<&str>,
    nodes: Vec<Value>,
) -> Result<(), Error> {
    let children =
        parent["children"].as_array_mut().ok_or(Error::Contract("shared flow children"))?;
    let index = if let Some(before) = before {
        children
            .iter()
            .position(|node| creation::block(node).ok() == Some(before))
            .ok_or(Error::Contract("visible shared sibling before"))?
    } else {
        children.len()
    };
    children.splice(index..index, nodes);
    Ok(())
}

fn find_mut<'a>(node: &'a mut Value, block: &str) -> Option<&'a mut Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node.get_mut("children")?.as_array_mut()?.iter_mut().find_map(|node| find_mut(node, block))
}
