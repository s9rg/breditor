use breditor_core::{
    document::{Document, NodeKind},
    position::{Affinity, Point},
};
use wasm_bindgen::JsValue;

use crate::{
    BreditorError,
    error::{
        INVALID_SELECTION_AFFINITY_CODE, INVALID_SELECTION_COORDINATE_CODE,
        INVALID_SELECTION_NODE_CODE, INVALID_SELECTION_POINT_KIND_CODE,
    },
};

use super::node_index::semantic_node_at;

#[derive(Clone, Copy)]
enum SelectionPointKind {
    Text,
    Children,
}

#[cfg(test)]
pub(super) fn point_from_scalars(
    document: &Document,
    kind: &str,
    node_index: f64,
    offset: f64,
    affinity: &str,
) -> Result<Point, BreditorError> {
    let kind = parse_point_kind(kind)?;
    let node_index = parse_exact_u32(node_index).ok_or_else(invalid_coordinate)?;
    let offset = parse_exact_u32(offset).ok_or_else(invalid_coordinate)?;
    let affinity = parse_affinity(affinity)?;
    point_from_admitted_scalars(document, kind, node_index, offset, affinity)
}

pub(super) fn point_from_js_scalars(
    document: &Document,
    kind: &JsValue,
    node_index: &JsValue,
    offset: &JsValue,
    affinity: &JsValue,
) -> Result<Point, BreditorError> {
    let kind = parse_js_point_kind(kind)?;
    let node_index =
        node_index.as_f64().and_then(parse_exact_u32).ok_or_else(invalid_coordinate)?;
    let offset = offset.as_f64().and_then(parse_exact_u32).ok_or_else(invalid_coordinate)?;
    let affinity = parse_js_affinity(affinity)?;
    point_from_admitted_scalars(document, kind, node_index, offset, affinity)
}

fn parse_js_point_kind(value: &JsValue) -> Result<SelectionPointKind, BreditorError> {
    if value == "text" {
        Ok(SelectionPointKind::Text)
    } else if value == "children" {
        Ok(SelectionPointKind::Children)
    } else {
        Err(invalid_point_kind())
    }
}

fn parse_js_affinity(value: &JsValue) -> Result<Affinity, BreditorError> {
    if value == "before" {
        Ok(Affinity::Before)
    } else if value == "after" {
        Ok(Affinity::After)
    } else {
        Err(invalid_affinity())
    }
}

fn point_from_admitted_scalars(
    document: &Document,
    kind: SelectionPointKind,
    node_index: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, BreditorError> {
    let node = semantic_node_at(document, node_index).ok_or_else(invalid_node)?;

    match (kind, node.kind()) {
        (SelectionPointKind::Text, NodeKind::Text) => {
            Ok(Point::Text { text_path: node.path().clone(), utf16_offset: offset, affinity })
        }
        (SelectionPointKind::Children, NodeKind::Element) => {
            Ok(Point::Children { parent_path: node.path().clone(), child_index: offset, affinity })
        }
        (SelectionPointKind::Text, NodeKind::Element)
        | (SelectionPointKind::Children, NodeKind::Text) => Err(invalid_node()),
    }
}

#[cfg(test)]
fn parse_point_kind(value: &str) -> Result<SelectionPointKind, BreditorError> {
    match value {
        "text" => Ok(SelectionPointKind::Text),
        "children" => Ok(SelectionPointKind::Children),
        _ => Err(invalid_point_kind()),
    }
}

#[cfg(test)]
fn parse_affinity(value: &str) -> Result<Affinity, BreditorError> {
    match value {
        "before" => Ok(Affinity::Before),
        "after" => Ok(Affinity::After),
        _ => Err(invalid_affinity()),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn parse_exact_u32(value: f64) -> Option<u32> {
    if !value.is_finite() || value < 0.0 || value > f64::from(u32::MAX) || value.fract() != 0.0 {
        return None;
    }
    // Every admitted value is finite, non-negative, integral, and no greater
    // than u32::MAX, so Rust's checked range above makes this cast exact.
    Some(value as u32)
}

const fn invalid_coordinate() -> BreditorError {
    BreditorError::new(INVALID_SELECTION_COORDINATE_CODE, "the selection coordinate is invalid")
}

const fn invalid_point_kind() -> BreditorError {
    BreditorError::new(INVALID_SELECTION_POINT_KIND_CODE, "the selection point kind is invalid")
}

const fn invalid_affinity() -> BreditorError {
    BreditorError::new(INVALID_SELECTION_AFFINITY_CODE, "the selection affinity is invalid")
}

const fn invalid_node() -> BreditorError {
    BreditorError::new(
        INVALID_SELECTION_NODE_CODE,
        "the selection point does not match the current document",
    )
}

#[cfg(test)]
mod tests {
    use super::parse_exact_u32;

    #[test]
    fn javascript_coordinates_must_be_exact_u32_values() {
        for invalid in [-1.0, 0.5, f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 4_294_967_296.0] {
            assert!(parse_exact_u32(invalid).is_none());
        }
        assert_eq!(parse_exact_u32(-0.0), Some(0));
        assert_eq!(parse_exact_u32(0.0), Some(0));
        assert_eq!(parse_exact_u32(4_294_967_295.0), Some(u32::MAX));
    }
}
