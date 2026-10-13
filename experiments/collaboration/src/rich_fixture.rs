//! Bounded fixture admission for native/Wasm parity of the real rich core values.
//!
//! This is not the future rich-document wire protocol, a shared-state adapter,
//! an image decoder, an upload provider or an authentication boundary.

use crate::Error;
use breditor_core::rich_content::{
    AssetGeneration, AssetId, CausalStamp, CellBounds, CellId, ChangeId, ColumnId, ImageAlt,
    ImageBinding, ImageId, ImageSize, MergeConflictReason, MergeId, ReplicaId, RichTableLimits,
    RowId, TableId, TableShape, UploadCompletionMatch,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;

const MAX_FIXTURE_BYTES: usize = 256 * 1024;

fn contract(error: impl std::fmt::Display) -> Error {
    // Keep errors bounded and payload-free at the fixture boundary.
    let _ = error;
    Error::Contract("rich fixture values")
}

fn decimal(text: &str) -> Result<u64, Error> {
    let value = text.parse::<u64>().map_err(contract)?;
    if value.to_string() != text {
        return Err(Error::Contract("exact decimal identity/clock"));
    }
    Ok(value)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Geometry {
    version: u32,
    table: String,
    rows: Vec<String>,
    columns: Vec<String>,
    merges: Vec<Merge>,
    retracted: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Merge {
    id: String,
    lamport: String,
    writer: String,
    counter: String,
    rows: Vec<String>,
    columns: Vec<String>,
    first_row: String,
    last_row: String,
    first_column: String,
    last_column: String,
}

fn shape(table: &TableId, rows: &[String], columns: &[String]) -> Result<TableShape, Error> {
    if rows.len() > 256 || columns.len() > 128 {
        return Err(Error::Limit("fixture axes"));
    }
    TableShape::try_new(
        table.clone(),
        rows.iter().map(RowId::try_new).collect::<Result<_, _>>().map_err(contract)?,
        columns.iter().map(ColumnId::try_new).collect::<Result<_, _>>().map_err(contract)?,
        RichTableLimits::default(),
    )
    .map_err(contract)
}

fn cell_json(cell: &CellId) -> Value {
    json!({ "table": cell.table().as_str(), "row": cell.row().as_str(), "column": cell.column().as_str() })
}

/// Admit a bounded geometry fixture and resolve the actual Rust core overlays.
///
/// # Errors
/// Rejects incompatible versions, unknown fields, budgets, identities and bounds.
pub fn resolve_geometry(input: &str) -> Result<String, Error> {
    if input.len() > MAX_FIXTURE_BYTES {
        return Err(Error::Limit("rich fixture bytes"));
    }
    let fixture: Geometry = serde_json::from_str(input)?;
    if fixture.version != 1 {
        return Err(Error::Contract("rich fixture version"));
    }
    if fixture.merges.len() > 256 || fixture.retracted.len() > 256 {
        return Err(Error::Limit("fixture merge records"));
    }
    let table = TableId::try_new(fixture.table).map_err(contract)?;
    let current = shape(&table, &fixture.rows, &fixture.columns)?;
    let mut regions = vec![];
    for merge in fixture.merges {
        let captured = shape(&table, &merge.rows, &merge.columns)?;
        let bounds = CellBounds::new(
            CellId::new(
                table.clone(),
                RowId::try_new(merge.first_row).map_err(contract)?,
                ColumnId::try_new(merge.first_column).map_err(contract)?,
            ),
            CellId::new(
                table.clone(),
                RowId::try_new(merge.last_row).map_err(contract)?,
                ColumnId::try_new(merge.last_column).map_err(contract)?,
            ),
        );
        let stamp = CausalStamp::new(
            decimal(&merge.lamport)?,
            ChangeId::new(
                ReplicaId::try_new(decimal(&merge.writer)?).map_err(contract)?,
                decimal(&merge.counter)?,
            ),
        );
        regions.push(
            captured
                .capture_merge(MergeId::try_new(merge.id).map_err(contract)?, stamp, &bounds)
                .map_err(contract)?,
        );
    }
    let retracted = fixture
        .retracted
        .iter()
        .map(MergeId::try_new)
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(contract)?;
    let resolved = current.resolve(&regions, &retracted).map_err(contract)?;
    let output = json!({
        "hidden": resolved.is_hidden(),
        "active": resolved.active_regions().iter().map(MergeId::as_str).collect::<Vec<_>>(),
        "conflicts": resolved.conflicts().iter().map(|conflict| json!({
            "id": conflict.region().as_str(),
            "reason": match conflict.reason() {
                MergeConflictReason::AxesDeleted => "axes_deleted",
                MergeConflictReason::AxesReordered => "axes_reordered",
                MergeConflictReason::OldAxisMovedInside => "old_axis_moved_inside",
                MergeConflictReason::Singleton => "singleton",
                MergeConflictReason::Overlap => "overlap",
            },
        })).collect::<Vec<_>>(),
        "cells": resolved.cells().iter().map(|cell| json!({
            "base": cell_json(cell.base()), "master": cell_json(cell.master()),
            "row_span": cell.row_span(), "column_span": cell.column_span(),
            "sources": cell.source_cells().iter().map(cell_json).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    });
    Ok(output.to_string())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Binding {
    image: String,
    asset: String,
    generation: String,
    alt: String,
    decorative: bool,
    size: Option<[u32; 2]>,
}

impl Binding {
    fn checked(self) -> Result<ImageBinding, Error> {
        let alt = if self.decorative {
            if !self.alt.is_empty() {
                return Err(Error::Contract("decorative alt must be empty"));
            }
            ImageAlt::decorative()
        } else {
            ImageAlt::try_description(self.alt).map_err(contract)?
        };
        let size = self
            .size
            .map(|[width, height]| ImageSize::try_new(width, height))
            .transpose()
            .map_err(contract)?;
        Ok(ImageBinding::new(
            ImageId::try_new(self.image).map_err(contract)?,
            AssetId::try_new(self.asset).map_err(contract)?,
            AssetGeneration::try_new(self.generation).map_err(contract)?,
            alt,
            size,
        ))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UploadFixture {
    original: Binding,
    current: Option<Binding>,
}

/// Classify an asynchronous completion against actual checked Rust image values.
///
/// # Errors
/// Rejects malformed, oversized or semantically inadmissible image fixtures.
pub fn classify_upload(input: &str) -> Result<String, Error> {
    if input.len() > MAX_FIXTURE_BYTES {
        return Err(Error::Limit("rich fixture bytes"));
    }
    let fixture: UploadFixture = serde_json::from_str(input)?;
    let original = fixture.original.checked()?;
    let current = fixture.current.map(Binding::checked).transpose()?;
    Ok(match original.upload_token().classify(current.as_ref()) {
        UploadCompletionMatch::CurrentBinding => "current_binding",
        UploadCompletionMatch::StaleOrDeleted => "stale_or_deleted",
    }
    .into())
}
