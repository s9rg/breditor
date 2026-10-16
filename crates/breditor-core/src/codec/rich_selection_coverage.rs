//! Bounded read envelope for native coverage; no decoder or mutation authority exists.
use super::{JsonFailure, RichFormatsCodecError, json_size::JsonByteCounter};
use crate::{
    rich_content::{
        RichCoverageDomain, RichCoverageExtent, RichDocument, RichSelectionCoverage,
        RichSelectionKind,
    },
    state::EditorContext,
};
use serde::Serialize;
/// Independent immutable coverage read family, never a saved selection or command.
pub const RICH_SELECTION_COVERAGE_FORMAT: &str = "breditor/rich-selection-coverage";
/// Original closed read revision.
pub const RICH_SELECTION_COVERAGE_VERSION: u32 = 1;
const MAX_BYTES: usize = 4 * 1024 * 1024;
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Domain<'a> {
    Document,
    Cell { table: &'a str, row: &'a str, column: &'a str },
    Caption { image: &'a str },
}
fn domain(value: &RichCoverageDomain) -> Domain<'_> {
    match value {
        RichCoverageDomain::Document => Domain::Document,
        RichCoverageDomain::Cell(c) => Domain::Cell {
            table: c.table().as_str(),
            row: c.row().as_str(),
            column: c.column().as_str(),
        },
        RichCoverageDomain::Caption(i) => Domain::Caption { image: i.as_str() },
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Node<'a> {
    block: &'a str,
    parent: Option<&'a str>,
    kind: &'a str,
    extent: &'static str,
    domain: Domain<'a>,
    hidden_table: bool,
}
#[derive(Serialize)]
struct Text<'a> {
    block: &'a str,
    kind: &'a str,
    start: String,
    end: String,
    domain: Domain<'a>,
}
#[derive(Serialize)]
struct Binding<'a> {
    name: &'a str,
    version: u32,
    fingerprint: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    schema: Binding<'a>,
    document: &'a str,
    scope: &'static str,
    backward: Option<bool>,
    selected_utf16: String,
    nodes: Vec<Node<'a>>,
    text: Vec<Text<'a>>,
}
/// Encode coverage after source/context proof, without copying Unicode or asset values.
///
/// A missing coverage means no selected scope; explicit document coverage is
/// distinct and retains atoms outside all text endpoints. Offsets/totals use
/// canonical decimal strings. The independent read ceiling is 4 MiB.
/// # Errors
/// Rejects incompatible contexts, stale/foreign coverage and bounded serialization failures.
pub fn encode_rich_selection_coverage(
    context: &EditorContext,
    document: &RichDocument,
    coverage: Option<&RichSelectionCoverage>,
) -> Result<String, RichFormatsCodecError> {
    if !context.schema().is_rich_content_profile()
        || !document.document().is_proven_for(context.schema(), context.limits())
    {
        return Err(RichFormatsCodecError::UnsupportedContext);
    }
    if let Some(c) = coverage {
        c.validate_document(document).map_err(|_| RichFormatsCodecError::Invariant)?;
    }
    let schema = context.schema();
    let read = Read {
        format: RICH_SELECTION_COVERAGE_FORMAT,
        format_version: RICH_SELECTION_COVERAGE_VERSION,
        schema: Binding {
            name: schema.id().name().as_str(),
            version: schema.id().version().get(),
            fingerprint: schema.fingerprint().to_string(),
        },
        document: document.id().as_str(),
        scope: coverage.map_or("none", |c| match c.selection() {
            None => "document",
            Some(RichSelectionKind::TextRange { .. }) => "text",
            Some(RichSelectionKind::Node(_)) => "node",
            Some(RichSelectionKind::Grid { .. }) => "grid",
        }),
        backward: coverage.and_then(RichSelectionCoverage::is_backward),
        selected_utf16: coverage.map_or(0, RichSelectionCoverage::selected_utf16).to_string(),
        nodes: coverage.map_or_else(Vec::new, |c| {
            c.nodes()
                .iter()
                .map(|n| Node {
                    block: n.block().as_str(),
                    parent: n.parent().map(crate::rich_content::BlockId::as_str),
                    kind: n.kind().as_str(),
                    extent: match n.extent() {
                        RichCoverageExtent::Whole => "whole",
                        RichCoverageExtent::Partial => "partial",
                    },
                    domain: domain(n.domain()),
                    hidden_table: n.is_hidden_table(),
                })
                .collect()
        }),
        text: coverage.map_or_else(Vec::new, |c| {
            c.text()
                .iter()
                .map(|s| Text {
                    block: s.block().as_str(),
                    kind: s.kind().as_str(),
                    start: s.start().get().to_string(),
                    end: s.end().get().to_string(),
                    domain: domain(s.domain()),
                })
                .collect()
        }),
    };
    let mut counter = JsonByteCounter::new(MAX_BYTES);
    let result = serde_json::to_writer(&mut counter, &read);
    if counter.exceeded() {
        return Err(RichFormatsCodecError::Limit);
    }
    result.map_err(|e| JsonFailure::from_serde(&e))?;
    serde_json::to_string(&read).map_err(|e| JsonFailure::from_serde(&e).into())
}
