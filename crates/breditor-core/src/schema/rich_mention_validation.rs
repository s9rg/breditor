//! Candidate rich V4 mention laws: closed property domains and whole-label immutability.

use crate::{document::Format, identity::QualifiedName, position::NodePathCursor};

use super::{ValidationCode, ValidationDetail, ValidationState, ValidationSubject};

impl ValidationState<'_> {
    /// A mention value must be a closed kind, a bounded charset id and a plain bounded label.
    pub(super) fn validate_rich_mention(
        &mut self,
        format: &Format,
        path: &NodePathCursor,
        index: usize,
    ) {
        if !self.schema.supports_rich_mentions()
            || !crate::rich_content::mention::is_mention(format)
        {
            return;
        }
        // Presence, string type and byte bounds are the declared property contract.
        if let Err(reason) = crate::rich_content::mention::validate_format(format) {
            let name = QualifiedName::from_known_static(crate::rich_content::RICH_MENTION_FORMAT);
            self.format_property_issue(
                ValidationCode::RichContentContract,
                path,
                index,
                &name,
                ValidationDetail::None,
                reason.to_owned(),
            );
        }
    }

    /// Every contiguous stretch of one mention format is whole copies of `@` + label.
    pub(super) fn validate_rich_mention_text(
        &mut self,
        element: &crate::document::ElementNode,
        path: &NodePathCursor,
    ) {
        if !self.schema.supports_rich_mentions() || self.report_is_saturated() {
            return;
        }
        if let Err(reason) = crate::rich_content::mention::validate_segments(element) {
            self.issue(
                ValidationCode::RichContentContract,
                path,
                ValidationSubject::Node,
                ValidationDetail::None,
                reason.to_owned(),
            );
        }
    }
}
