//! Rich semantic checks are part of the existing bounded complete-tree proof.

use std::{collections::btree_map::Entry, sync::Arc};

use crate::{
    document::{ElementNode, Format, PropertyValue},
    identity::QualifiedName,
    position::NodePathCursor,
    rich_content::{BlockId, ImageId, TableId, ast_properties},
};

use super::{ValidationCode, ValidationDetail, ValidationState, ValidationSubject};

impl ValidationState<'_> {
    pub(super) fn validate_rich_content(&mut self, element: &ElementNode, path: &NodePathCursor) {
        let kind = element.kind().as_str();
        for local in ast_properties::required_properties(kind) {
            if self.report_is_saturated() {
                return;
            }
            let Ok(name) = QualifiedName::try_new(format!("breditor/{local}")) else { continue };
            if element.properties().get(&name).is_none() {
                self.element_property_issue(
                    ValidationCode::MissingRequiredElementProperty,
                    path,
                    &name,
                    ValidationDetail::None,
                    "required rich-content property is missing",
                );
            }
        }
        for (name, _) in element.properties().iter().take(self.limits.max_properties_per_owner) {
            if self.report_is_saturated() {
                return;
            }
            let layout = self.schema.supports_rich_block_layout()
                && crate::rich_content::block_layout::allows_property(kind, name);
            let numbering = self.schema.supports_rich_list_numbering()
                && crate::rich_content::list_numbering::allows_property(kind, name);
            let image_link = self.schema.supports_rich_image_links()
                && crate::rich_content::image_link::allows_property(kind, name);
            let details = self.schema.supports_rich_details()
                && crate::rich_content::details::allows_property(kind, name);
            if !ast_properties::allows_property(kind, name)
                && !layout
                && !numbering
                && !image_link
                && !details
            {
                self.element_property_issue(
                    ValidationCode::UnknownElementProperty,
                    path,
                    name,
                    ValidationDetail::None,
                    "rich-content element has an undeclared property",
                );
            }
        }
        if let Err(reason) = ast_properties::validate_values(element) {
            self.rich_issue(ValidationCode::RichContentContract, path, reason);
        }
        if self.schema.supports_rich_block_layout()
            && crate::rich_content::block_layout::supports_kind(kind)
            && crate::rich_content::RichBlockLayout::from_node(element).is_err()
        {
            self.rich_issue(
                ValidationCode::RichContentContract,
                path,
                "invalid bounded block layout value",
            );
        }
        if self.schema.supports_rich_list_numbering()
            && crate::rich_content::list_numbering::supports_kind(kind)
            && let Err(reason) = crate::rich_content::list_numbering::validate(element)
        {
            self.rich_issue(ValidationCode::RichContentContract, path, reason);
        }
        if self.schema.supports_rich_image_links()
            && crate::rich_content::image_link::supports_kind(kind)
            && let Err(reason) = crate::rich_content::image_link::validate(element)
        {
            self.rich_issue(ValidationCode::RichContentContract, path, reason);
        }
        self.validate_rich_details(element, path);
        if kind != "breditor/document"
            && let Ok(id) = ast_properties::string(element, "block-id")
            && BlockId::try_new(id).is_ok()
        {
            self.retain_rich_identity("block", id, path);
        }
        let content_domain = match kind {
            "breditor/table" => Some(("table", "table-id")),
            "breditor/image" => Some(("image", "image-id")),
            _ => None,
        };
        if let Some((domain, property)) = content_domain
            && let Ok(id) = ast_properties::string(element, property)
            && match domain {
                "table" => TableId::try_new(id).is_ok(),
                _ => ImageId::try_new(id).is_ok(),
            }
        {
            self.retain_rich_identity(domain, id, path);
        }
        if kind == "breditor/table" {
            if self.rich_table_depth != 0 {
                self.rich_issue(ValidationCode::NestedTable, path, "tables cannot contain tables");
            }
            if let Err(reason) = ast_properties::table_view(element) {
                self.rich_issue(ValidationCode::RichContentContract, path, reason);
            }
        }
    }

    /// Candidate V4 sections: the open-flag value law and the nesting bound.
    fn validate_rich_details(&mut self, element: &ElementNode, path: &NodePathCursor) {
        if !self.schema.supports_rich_details()
            || !crate::rich_content::details::supports_kind(element.kind().as_str())
        {
            return;
        }
        if let Err(reason) = crate::rich_content::details::validate(element) {
            self.rich_issue(ValidationCode::RichContentContract, path, reason);
        }
        if self.rich_details_depth >= crate::rich_content::RICH_DETAILS_MAX_DEPTH {
            self.rich_issue(
                ValidationCode::RichContentContract,
                path,
                "collapsible sections exceed the nesting bound",
            );
        }
    }

    /// Enter one element's children: count table and section ancestors for their laws.
    pub(super) fn enter_rich_scope(&mut self, element: &ElementNode) -> (bool, bool) {
        let rich = self.schema.is_rich_content_profile();
        let table = rich && element.kind().as_str() == "breditor/table";
        let details = rich && element.kind().as_str() == "breditor/details";
        self.rich_table_depth += usize::from(table);
        self.rich_details_depth += usize::from(details);
        (table, details)
    }

    /// Leave the scope entered by [`Self::enter_rich_scope`].
    pub(super) fn leave_rich_scope(&mut self, (table, details): (bool, bool)) {
        self.rich_table_depth -= usize::from(table);
        self.rich_details_depth -= usize::from(details);
    }

    /// Candidate V4: a text-language value must be the canonical bounded BCP 47 form.
    pub(super) fn validate_rich_text_language(
        &mut self,
        format: &Format,
        path: &NodePathCursor,
        index: usize,
    ) {
        use crate::rich_content::{RICH_TEXT_LANGUAGE_FORMAT, RICH_TEXT_LANGUAGE_TAG_PROPERTY};
        if !self.schema.supports_rich_text_language()
            || format.kind().as_str() != RICH_TEXT_LANGUAGE_FORMAT
        {
            return;
        }
        let name = QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_TAG_PROPERTY);
        // Presence and the string type/byte bounds are the declared property contract.
        if let Some(value) = format.properties().get(&name).and_then(PropertyValue::as_string)
            && !crate::rich_content::text_language::is_canonical_tag(value)
        {
            self.format_property_issue(
                ValidationCode::RichContentContract,
                path,
                index,
                &name,
                ValidationDetail::None,
                "text language is not a canonical bounded language tag".to_owned(),
            );
        }
    }

    fn retain_rich_identity(&mut self, domain: &'static str, id: &str, path: &NodePathCursor) {
        match self.content_ids.entry((domain, Arc::from(id))) {
            Entry::Vacant(entry) => {
                entry.insert(path.snapshot());
            }
            Entry::Occupied(_) => self.rich_issue(
                ValidationCode::DuplicateContentId,
                path,
                "a stable content identity is reused within its typed domain",
            ),
        }
    }

    fn rich_issue(&mut self, code: ValidationCode, path: &NodePathCursor, reason: &'static str) {
        self.issue(code, path, ValidationSubject::Node, ValidationDetail::None, reason.to_owned());
    }
}
