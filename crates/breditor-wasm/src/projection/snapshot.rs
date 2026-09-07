use breditor_core::{
    document::{NodeKind, NodeRef},
    profile::CompiledProfileGeneration,
    state::EditorState,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::BreditorProfileGeneration;

use super::node_record::ProjectionNodeRecord;

/// Snapshot-bound, flattened semantic view of one canonical editor document.
///
/// Nodes are numbered in deterministic preorder. Indexes and child edges are
/// meaningful only within this object; they are renderer coordinates, not
/// persisted node identities. Text and semantic names cross as individual
/// strings without encoding the complete state as JSON.
///
/// Public indexes are read-only `u32` transport values. Raw JavaScript can ask
/// `wasm-bindgen` to coerce a fractional or wider number before Rust receives
/// it; an in-range coerced value can therefore read a different node. The
/// reviewed browser adapter must validate exact nonnegative integers before it
/// calls this raw glue. No index getter can mutate the projection or editor
/// engine.
#[wasm_bindgen]
pub struct BreditorProjection {
    generation: CompiledProfileGeneration,
    schema_name: String,
    schema_version: u32,
    schema_fingerprint: String,
    lineage: String,
    revision: String,
    nodes: Vec<ProjectionNodeRecord>,
}

impl BreditorProjection {
    pub(crate) fn from_state(generation: CompiledProfileGeneration, state: &EditorState) -> Self {
        let mut nodes = Vec::new();
        append_preorder(state.document().root(), &mut nodes);
        Self {
            generation,
            schema_name: state.document().schema().name().as_str().to_owned(),
            schema_version: state.document().schema().version().get(),
            schema_fingerprint: state.document().schema_fingerprint().to_string(),
            lineage: state.snapshot().lineage().as_str().to_owned(),
            revision: state.snapshot().revision().get().to_string(),
            nodes,
        }
    }

    fn node(&self, index: u32) -> Option<&ProjectionNodeRecord> {
        self.nodes.get(index as usize)
    }
}

#[wasm_bindgen]
impl BreditorProjection {
    /// Checks the projection's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }

    /// Returns the qualified schema name that defines the projected semantics.
    #[must_use]
    #[wasm_bindgen(getter, js_name = schemaName)]
    pub fn schema_name(&self) -> String {
        self.schema_name.clone()
    }

    /// Returns the nonzero schema version that defines the projected semantics.
    #[must_use]
    #[wasm_bindgen(getter, js_name = schemaVersion)]
    pub fn schema_version(&self) -> u32 {
        self.schema_version
    }

    /// Returns the complete compiled-schema fingerprint.
    #[must_use]
    #[wasm_bindgen(getter, js_name = schemaFingerprint)]
    pub fn schema_fingerprint(&self) -> String {
        self.schema_fingerprint.clone()
    }

    /// Returns the lineage of the exact editor snapshot projected here.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotLineage)]
    pub fn snapshot_lineage(&self) -> String {
        self.lineage.clone()
    }

    /// Returns the full-width snapshot revision as canonical decimal text.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotRevision)]
    pub fn snapshot_revision(&self) -> String {
        self.revision.clone()
    }

    /// Returns the number of flattened semantic nodes.
    #[must_use]
    #[wasm_bindgen(getter, js_name = nodeCount)]
    pub fn node_count(&self) -> u32 {
        u32::try_from(self.nodes.len()).unwrap_or(u32::MAX)
    }

    /// Returns the root node index, which is always zero for a valid projection.
    #[must_use]
    #[wasm_bindgen(getter, js_name = rootIndex)]
    pub fn root_index(&self) -> u32 {
        0
    }

    /// Returns `element` or `text` for an in-range node index.
    #[must_use]
    #[wasm_bindgen(js_name = nodeKind, unchecked_return_type = "BreditorProjectionNodeKind | undefined")]
    pub fn node_kind(&self, index: u32) -> Option<String> {
        self.node(index).map(|record| match record.node().kind() {
            NodeKind::Element => "element".to_owned(),
            NodeKind::Text => "text".to_owned(),
        })
    }

    /// Returns the qualified semantic element type for an element node.
    #[must_use]
    #[wasm_bindgen(js_name = elementType)]
    pub fn element_type(&self, index: u32) -> Option<String> {
        self.node(index)
            .and_then(|record| record.node().as_element())
            .map(|element| element.kind().as_str().to_owned())
    }

    /// Returns the number of direct semantic children for an element node.
    #[must_use]
    #[wasm_bindgen(js_name = childCount)]
    pub fn child_count(&self, index: u32) -> Option<u32> {
        self.node(index)
            .filter(|record| record.node().as_element().is_some())
            .and_then(|record| u32::try_from(record.children().len()).ok())
    }

    /// Returns one child's flattened node index.
    #[must_use]
    #[wasm_bindgen(js_name = childAt)]
    pub fn child_at(&self, index: u32, ordinal: u32) -> Option<u32> {
        self.node(index)
            .and_then(|record| record.children().get(ordinal as usize))
            .and_then(|child| u32::try_from(*child).ok())
    }

    /// Returns the exact Unicode scalar string for a text leaf.
    #[must_use]
    pub fn text(&self, index: u32) -> Option<String> {
        self.node(index)
            .and_then(|record| record.node().as_text())
            .map(|text| text.text().to_owned())
    }

    /// Returns the canonical format count for a text leaf.
    #[must_use]
    #[wasm_bindgen(js_name = formatCount)]
    pub fn format_count(&self, index: u32) -> Option<u32> {
        self.node(index)
            .and_then(|record| record.node().as_text())
            .and_then(|text| u32::try_from(text.formats().len()).ok())
    }

    /// Returns one text leaf's qualified semantic format type.
    #[must_use]
    #[wasm_bindgen(js_name = formatType)]
    pub fn format_type(&self, index: u32, ordinal: u32) -> Option<String> {
        self.node(index)
            .and_then(|record| record.node().as_text())
            .and_then(|text| text.formats().iter().nth(ordinal as usize))
            .map(|format| format.kind().as_str().to_owned())
    }
}

fn append_preorder(node: &NodeRef, nodes: &mut Vec<ProjectionNodeRecord>) -> usize {
    let index = nodes.len();
    nodes.push(ProjectionNodeRecord::new(node.clone()));

    let children = node.as_element().map_or_else(Vec::new, |element| {
        element.children().iter().map(|child| append_preorder(child, nodes)).collect()
    });
    if let Some(record) = nodes.get_mut(index) {
        record.set_children(children);
    }
    index
}
