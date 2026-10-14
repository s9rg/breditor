//! Rich semantic checks are part of the existing bounded complete-tree proof.

use std::{collections::btree_map::Entry, sync::Arc};

use crate::{
    document::ElementNode,
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
            if !ast_properties::allows_property(kind, name) {
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
