//! Map actual directional selection through original disjoint text splices.
use super::RichSearchReplacePlan;
use crate::rich_content::{
    RichDocument, RichSelection, RichSelectionError, RichSelectionKind, RichTextPoint,
    rich_text_mapping::map_offset,
};

impl RichSearchReplacePlan {
    pub(crate) fn map_selection(
        &self,
        before: &RichSelection,
        after: &RichDocument,
    ) -> Result<RichSelection, RichSelectionError> {
        before.resolve(&self.source)?;
        let kind = match before.kind() {
            RichSelectionKind::TextRange { anchor, focus } => RichSelectionKind::TextRange {
                anchor: self.map_point(anchor)?,
                focus: self.map_point(focus)?,
            },
            kind => kind.clone(),
        };
        RichSelection::try_new(after, kind)
    }

    fn map_point(&self, point: &RichTextPoint) -> Result<RichTextPoint, RichSelectionError> {
        let mut offset = point.offset();
        // Descending original ranges retain valid coordinates for every lower
        // splice, including insertion affinity and both replacement endpoints.
        for edit in self.edits.iter().rev().filter(|edit| &edit.block == point.block()) {
            offset = map_offset(
                offset,
                point.affinity(),
                edit.start,
                edit.end,
                edit.inserted.utf16_len(),
            )?;
        }
        Ok(RichTextPoint::new(point.block().clone(), offset, point.affinity()))
    }
}
