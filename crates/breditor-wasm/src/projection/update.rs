use breditor_core::{profile::CompiledProfileGeneration, transaction::Commit};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::BreditorProfileGeneration;

use super::{BreditorProjection, impact::ProjectionImpact};

/// Commit-derived renderer update with an owned final semantic projection.
///
/// Base and result snapshot fields guard incremental application. `impact` is
/// conservative: callers must fall back to the complete final projection when
/// their rendered base or DOM shape does not match this update.
#[wasm_bindgen]
pub struct BreditorProjectionUpdate {
    generation: CompiledProfileGeneration,
    base_lineage: String,
    base_revision: String,
    result_lineage: String,
    result_revision: String,
    impact: ProjectionImpact,
    projection: Option<BreditorProjection>,
}

impl BreditorProjectionUpdate {
    pub(crate) fn from_commit(generation: CompiledProfileGeneration, commit: &Commit) -> Self {
        Self {
            generation: generation.clone(),
            base_lineage: commit.base_snapshot().lineage().as_str().to_owned(),
            base_revision: commit.base_revision().get().to_string(),
            result_lineage: commit.snapshot().lineage().as_str().to_owned(),
            result_revision: commit.revision().get().to_string(),
            impact: super::impact::classify(commit),
            projection: Some(BreditorProjection::from_state(generation, commit.after())),
        }
    }
}

#[wasm_bindgen]
impl BreditorProjectionUpdate {
    /// Checks the update's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }

    /// Returns the source snapshot lineage.
    #[must_use]
    #[wasm_bindgen(getter, js_name = baseLineage)]
    pub fn base_lineage(&self) -> String {
        self.base_lineage.clone()
    }

    /// Returns the source snapshot revision as canonical decimal text.
    #[must_use]
    #[wasm_bindgen(getter, js_name = baseRevision)]
    pub fn base_revision(&self) -> String {
        self.base_revision.clone()
    }

    /// Returns the result snapshot lineage.
    #[must_use]
    #[wasm_bindgen(getter, js_name = resultLineage)]
    pub fn result_lineage(&self) -> String {
        self.result_lineage.clone()
    }

    /// Returns the result snapshot revision as canonical decimal text.
    #[must_use]
    #[wasm_bindgen(getter, js_name = resultRevision)]
    pub fn result_revision(&self) -> String {
        self.result_revision.clone()
    }

    /// Returns `none`, `textContainers`, `rootSplice`, or `root`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorProjectionImpact")]
    pub fn impact(&self) -> String {
        self.impact.as_str().to_owned()
    }

    /// Returns the number of affected direct-root paragraphs.
    #[must_use]
    #[wasm_bindgen(getter, js_name = affectedParagraphCount)]
    pub fn affected_paragraph_count(&self) -> u32 {
        u32::try_from(self.impact.affected_paragraphs().len()).unwrap_or(u32::MAX)
    }

    /// Returns one affected direct-root paragraph index.
    #[must_use]
    #[wasm_bindgen(js_name = affectedParagraphIndex)]
    pub fn affected_paragraph_index(&self, index: u32) -> Option<u32> {
        self.impact.affected_paragraphs().get(index as usize).copied()
    }

    /// Returns the root-splice source range start, when applicable.
    #[must_use]
    #[wasm_bindgen(getter, js_name = oldChildStart)]
    pub fn old_child_start(&self) -> Option<u32> {
        self.impact.root_splice().map(|range| range.0)
    }

    /// Returns the root-splice source range end, when applicable.
    #[must_use]
    #[wasm_bindgen(getter, js_name = oldChildEnd)]
    pub fn old_child_end(&self) -> Option<u32> {
        self.impact.root_splice().map(|range| range.1)
    }

    /// Returns the root-splice result range start, when applicable.
    #[must_use]
    #[wasm_bindgen(getter, js_name = newChildStart)]
    pub fn new_child_start(&self) -> Option<u32> {
        self.impact.root_splice().map(|range| range.2)
    }

    /// Returns the root-splice result range end, when applicable.
    #[must_use]
    #[wasm_bindgen(getter, js_name = newChildEnd)]
    pub fn new_child_end(&self) -> Option<u32> {
        self.impact.root_splice().map(|range| range.3)
    }

    /// Removes and returns the complete final projection exactly once.
    #[wasm_bindgen(js_name = takeProjection)]
    pub fn take_projection(&mut self) -> Option<BreditorProjection> {
        self.projection.take()
    }
}
