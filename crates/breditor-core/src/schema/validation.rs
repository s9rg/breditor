use std::{
    collections::{BTreeMap, btree_map::Entry},
    error::Error,
    fmt,
    sync::Arc,
};

use crate::{
    document::{DocumentSummary, NodeRef, PropertyMap, PropertyValue, PropertyValueInner},
    identity::{EntityId, QualifiedName},
    position::{MAX_PATH_DEPTH, NodePath},
    schema::{
        CompiledSchema, DocumentLimits, child_count_fits_point_protocol,
        point_protocol_child_count_maximum,
    },
};

use super::compiler::ChildKind;

/// Stable machine-readable reason for document rejection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum ValidationCode {
    /// An element type is not a valid qualified name.
    InvalidElementName,
    /// A format type is not a valid qualified name.
    InvalidFormatName,
    /// A property name is not a valid qualified name.
    InvalidPropertyName,
    /// A nested property-object key violates its ASCII grammar.
    InvalidPropertyObjectKey,
    /// A semantic entity identity is malformed.
    InvalidEntityId,
    /// The schema does not register an element kind.
    UnknownElement,
    /// The schema does not register a format kind.
    UnknownFormat,
    /// The root is not the schema's required document element.
    InvalidRoot,
    /// An element's child sequence violates its schema rule.
    InvalidChild,
    /// A required child is absent.
    MissingRequiredChild,
    /// A text leaf is empty.
    EmptyText,
    /// Equal-format adjacent text is not canonical.
    AdjacentEqualText,
    /// Format records are not in canonical ascending kind order.
    NonCanonicalFormatOrder,
    /// A format kind occurs more than once on one text leaf.
    DuplicateFormat,
    /// The current schema item does not allow supplied properties.
    PropertiesNotAllowed,
    /// The current schema item forbids a semantic entity ID.
    EntityIdForbidden,
    /// A semantic entity ID occurs on more than one element.
    DuplicateEntityId,
    /// A configured resource limit was exceeded.
    LimitExceeded,
}

impl ValidationCode {
    /// Returns the stable diagnostic code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidElementName => "document.invalid_element_name",
            Self::InvalidFormatName => "document.invalid_format_name",
            Self::InvalidPropertyName => "document.invalid_property_name",
            Self::InvalidPropertyObjectKey => "document.invalid_property_object_key",
            Self::InvalidEntityId => "document.invalid_entity_id",
            Self::UnknownElement => "document.unknown_element",
            Self::UnknownFormat => "document.unknown_format",
            Self::InvalidRoot => "document.invalid_root",
            Self::InvalidChild => "document.invalid_child",
            Self::MissingRequiredChild => "document.missing_required_child",
            Self::EmptyText => "document.empty_text",
            Self::AdjacentEqualText => "document.adjacent_equal_text",
            Self::NonCanonicalFormatOrder => "document.noncanonical_format_order",
            Self::DuplicateFormat => "document.duplicate_format",
            Self::PropertiesNotAllowed => "document.properties_not_allowed",
            Self::EntityIdForbidden => "document.entity_id_forbidden",
            Self::DuplicateEntityId => "document.duplicate_entity_id",
            Self::LimitExceeded => "document.limit_exceeded",
        }
    }
}

/// A stable property-value path segment below one namespaced property.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum PropertyPathSegment {
    /// An array item.
    Index(usize),
    /// An object member.
    Key(Arc<str>),
}

/// The machine-actionable subpart of a node associated with an issue.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ValidationSubject {
    /// The node as a whole.
    Node,
    /// The element kind field.
    ElementKind,
    /// The optional semantic entity identity.
    EntityId,
    /// One child or child boundary.
    Child {
        /// Zero-based child index.
        index: usize,
    },
    /// The text payload.
    Text,
    /// One format record.
    Format {
        /// Zero-based format index.
        index: usize,
    },
    /// A property attached directly to an element.
    ElementProperty {
        /// Encoded qualified property name.
        name: Arc<str>,
        /// Path within the property value; empty means the property itself.
        value_path: Arc<[PropertyPathSegment]>,
    },
    /// A property attached to one text format.
    FormatProperty {
        /// Zero-based format index.
        format_index: usize,
        /// Encoded qualified property name.
        name: Arc<str>,
        /// Path within the property value; empty means the property itself.
        value_path: Arc<[PropertyPathSegment]>,
    },
    /// One configured resource limit.
    Limit {
        /// The exceeded limit.
        kind: LimitKind,
    },
}

/// A stable resource-limit category.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LimitKind {
    /// Root-relative node/path depth.
    NodeDepth,
    /// Total element and text nodes.
    NodeCount,
    /// Children owned by one element.
    ChildCount,
    /// A child index that cannot fit the point protocol.
    ChildIndex,
    /// UTF-8 bytes in one text leaf.
    TextBytes,
    /// Combined UTF-8 text bytes.
    TotalTextBytes,
    /// UTF-16 units in one text leaf.
    TextUtf16Units,
    /// Formats on one text leaf.
    FormatCount,
    /// Properties on one element or format.
    PropertyCount,
    /// Nested property-value depth.
    PropertyDepth,
    /// Total property values.
    PropertyValueCount,
}

impl LimitKind {
    /// Returns the stable diagnostic name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NodeDepth => "node_depth",
            Self::NodeCount => "node_count",
            Self::ChildCount => "child_count",
            Self::ChildIndex => "child_index",
            Self::TextBytes => "text_bytes",
            Self::TotalTextBytes => "total_text_bytes",
            Self::TextUtf16Units => "text_utf16_units",
            Self::FormatCount => "format_count",
            Self::PropertyCount => "property_count",
            Self::PropertyDepth => "property_depth",
            Self::PropertyValueCount => "property_value_count",
        }
    }
}

/// Stable structured data carried by a [`ValidationIssue`].
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ValidationDetail {
    /// No additional machine data is needed.
    None,
    /// Actual and configured resource sizes.
    Limit {
        /// The exceeded limit.
        kind: LimitKind,
        /// Measured size.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// An aggregate resource measurement exceeded its fixed-width counter.
    CounterOverflow {
        /// The measurement that could not be represented.
        kind: LimitKind,
    },
    /// The first occurrence of a duplicated semantic entity identity.
    DuplicateEntityId {
        /// Path of the earlier element.
        first_path: NodePath,
    },
}

/// One deterministic schema or canonicality problem at a node path.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidationIssue {
    code: ValidationCode,
    path: NodePath,
    subject: ValidationSubject,
    detail: ValidationDetail,
    message: Arc<str>,
}

impl ValidationIssue {
    /// Returns the stable machine-readable code.
    #[must_use]
    pub const fn code(&self) -> ValidationCode {
        self.code
    }

    /// Returns the node path associated with the problem.
    #[must_use]
    pub const fn path(&self) -> &NodePath {
        &self.path
    }

    /// Returns the exact node subpart associated with the problem.
    #[must_use]
    pub const fn subject(&self) -> &ValidationSubject {
        &self.subject
    }

    /// Returns additional stable structured data.
    #[must_use]
    pub const fn detail(&self) -> &ValidationDetail {
        &self.detail
    }

    /// Returns a human-readable explanation.
    ///
    /// Engine behavior must branch on [`Self::code`], [`Self::subject`], and
    /// [`Self::detail`], never this text.
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn new(
        code: ValidationCode,
        path: NodePath,
        subject: ValidationSubject,
        detail: ValidationDetail,
        message: String,
    ) -> Self {
        Self { code, path, subject, detail, message: Arc::from(message) }
    }
}

/// A non-empty, deterministically ordered collection of validation problems.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidationReport(Arc<[ValidationIssue]>);

impl ValidationReport {
    /// Returns the number of reported problems.
    #[must_use]
    pub fn issue_count(&self) -> usize {
        self.0.len()
    }

    /// Iterates over problems in deterministic structural order.
    pub fn iter(&self) -> std::slice::Iter<'_, ValidationIssue> {
        self.0.iter()
    }

    /// Returns whether this report contains `code`.
    #[must_use]
    pub fn contains(&self, code: ValidationCode) -> bool {
        self.0.iter().any(|issue| issue.code == code)
    }

    pub(crate) fn from_issues(mut issues: Vec<ValidationIssue>) -> Self {
        debug_assert!(!issues.is_empty());
        issues.sort_by(|left, right| {
            left.path
                .cmp(&right.path)
                .then_with(|| left.subject.cmp(&right.subject))
                .then_with(|| left.code.cmp(&right.code))
                .then_with(|| left.detail.cmp(&right.detail))
        });
        Self(Arc::from(issues))
    }
}

impl<'a> IntoIterator for &'a ValidationReport {
    type Item = &'a ValidationIssue;
    type IntoIter = std::slice::Iter<'a, ValidationIssue>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl fmt::Display for ValidationReport {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "document validation failed with {} issue(s)", self.issue_count())
    }
}

impl Error for ValidationReport {}

impl CompiledSchema {
    pub(crate) fn validate_root(
        &self,
        root: &NodeRef,
        limits: &DocumentLimits,
    ) -> Result<DocumentSummary, ValidationReport> {
        let mut state = ValidationState::new(self, limits);
        let root_path = NodePath::root();
        state.visit_node(root, &root_path);
        state.validate_root_kind(root, &root_path);
        state.finish()
    }
}

struct ValidationState<'a> {
    schema: &'a CompiledSchema,
    limits: &'a DocumentLimits,
    issues: Vec<ValidationIssue>,
    node_count: u64,
    max_node_depth: u32,
    total_text_bytes: u64,
    property_value_count: u64,
    entity_ids: BTreeMap<EntityId, NodePath>,
}

impl<'a> ValidationState<'a> {
    fn new(schema: &'a CompiledSchema, limits: &'a DocumentLimits) -> Self {
        Self {
            schema,
            limits,
            issues: Vec::new(),
            node_count: 0,
            max_node_depth: 0,
            total_text_bytes: 0,
            property_value_count: 0,
            entity_ids: BTreeMap::new(),
        }
    }

    fn finish(self) -> Result<DocumentSummary, ValidationReport> {
        if self.issues.is_empty() {
            Ok(DocumentSummary::from_validation(
                self.node_count,
                self.max_node_depth,
                self.total_text_bytes,
                self.property_value_count,
            ))
        } else {
            Err(ValidationReport::from_issues(self.issues))
        }
    }

    fn issue(
        &mut self,
        code: ValidationCode,
        path: &NodePath,
        subject: ValidationSubject,
        detail: ValidationDetail,
        message: String,
    ) {
        self.issues.push(ValidationIssue::new(code, path.clone(), subject, detail, message));
    }

    fn limit_issue(&mut self, path: &NodePath, kind: LimitKind, actual: usize, maximum: usize) {
        self.issue(
            ValidationCode::LimitExceeded,
            path,
            ValidationSubject::Limit { kind },
            ValidationDetail::Limit { kind, actual, maximum },
            format!("{} is {actual}; the configured maximum is {maximum}", kind.as_str()),
        );
    }

    fn counter_overflow_issue(&mut self, path: &NodePath, kind: LimitKind) {
        self.issue(
            ValidationCode::LimitExceeded,
            path,
            ValidationSubject::Limit { kind },
            ValidationDetail::CounterOverflow { kind },
            format!("{} exceeds the core's fixed-width counter", kind.as_str()),
        );
    }

    fn validate_root_kind(&mut self, root: &NodeRef, path: &NodePath) {
        let Some(element) = root.as_element() else {
            self.issue(
                ValidationCode::InvalidRoot,
                path,
                ValidationSubject::Node,
                ValidationDetail::None,
                format!("document root must be element `{}`", self.schema.root_kind()),
            );
            return;
        };
        if element.kind() != self.schema.root_kind() {
            self.issue(
                ValidationCode::InvalidRoot,
                path,
                ValidationSubject::ElementKind,
                ValidationDetail::None,
                format!(
                    "root element `{}` does not match required `{}`",
                    element.kind(),
                    self.schema.root_kind()
                ),
            );
        }
    }

    fn visit_node(&mut self, node: &NodeRef, path: &NodePath) {
        if path.len() > self.limits.max_node_depth {
            self.limit_issue(path, LimitKind::NodeDepth, path.len(), self.limits.max_node_depth);
            return;
        }
        let Some(node_count) = self.node_count.checked_add(1) else {
            self.counter_overflow_issue(path, LimitKind::NodeCount);
            return;
        };
        self.node_count = node_count;
        if self.node_count > usize_as_u64(self.limits.max_nodes) {
            self.limit_issue(
                path,
                LimitKind::NodeCount,
                u64_as_usize(self.node_count),
                self.limits.max_nodes,
            );
            return;
        }
        let Ok(node_depth) = u32::try_from(path.len()) else {
            self.counter_overflow_issue(path, LimitKind::NodeDepth);
            return;
        };
        self.max_node_depth = self.max_node_depth.max(node_depth);

        if let Some(element) = node.as_element() {
            self.visit_element(element, path);
        } else if let Some(text) = node.as_text() {
            self.visit_text(text, path);
        }
    }

    fn visit_element(&mut self, element: &crate::document::ElementNode, path: &NodePath) {
        if !self.schema.knows_element(element.kind()) {
            self.issue(
                ValidationCode::UnknownElement,
                path,
                ValidationSubject::ElementKind,
                ValidationDetail::None,
                format!(
                    "schema `{}` does not register element `{}`",
                    self.schema.id(),
                    element.kind()
                ),
            );
        }
        self.visit_entity_id(element, path);
        self.visit_properties(element.properties(), path, None);
        if !element.properties().is_empty()
            && !self.schema.element_allows_properties(element.kind())
        {
            self.issue(
                ValidationCode::PropertiesNotAllowed,
                path,
                ValidationSubject::Node,
                ValidationDetail::None,
                format!("base-schema element `{}` does not allow properties", element.kind()),
            );
        }

        let children = element.children();
        if children.len() > self.limits.max_children_per_element {
            self.limit_issue(
                path,
                LimitKind::ChildCount,
                children.len(),
                self.limits.max_children_per_element,
            );
        }
        if !child_count_fits_point_protocol(children.len()) {
            self.limit_issue(
                path,
                LimitKind::ChildIndex,
                children.len(),
                point_protocol_child_count_maximum(),
            );
        }
        self.validate_child_shape(element, path);
        self.validate_adjacent_text(element, path);

        let child_limit = children.len().min(self.limits.max_children_per_element);
        for (index, child) in children.iter().take(child_limit).enumerate() {
            let Ok(index_u32) = u32::try_from(index) else {
                let maximum = usize::try_from(u32::MAX).unwrap_or(usize::MAX);
                self.limit_issue(path, LimitKind::ChildIndex, index, maximum);
                break;
            };
            let Ok(child_path) = path.try_child(index_u32) else {
                self.limit_issue(path, LimitKind::NodeDepth, path.len() + 1, MAX_PATH_DEPTH);
                break;
            };
            self.visit_node(child, &child_path);
        }
    }

    fn visit_entity_id(&mut self, element: &crate::document::ElementNode, path: &NodePath) {
        let Some(identity) = element.entity_id() else {
            return;
        };
        if self.schema.global_constraints().requires_globally_unique_entity_ids() {
            match self.entity_ids.entry(identity.clone()) {
                Entry::Vacant(entry) => {
                    entry.insert(path.clone());
                }
                Entry::Occupied(entry) => {
                    let first_path = entry.get().clone();
                    self.issue(
                        ValidationCode::DuplicateEntityId,
                        path,
                        ValidationSubject::EntityId,
                        ValidationDetail::DuplicateEntityId { first_path: first_path.clone() },
                        format!("entity ID `{identity}` is already used at {first_path:?}"),
                    );
                }
            }
        }
        if !self.schema.element_allows_entity_id(element.kind()) {
            self.issue(
                ValidationCode::EntityIdForbidden,
                path,
                ValidationSubject::EntityId,
                ValidationDetail::None,
                format!("base-schema element `{}` does not allow an entity ID", element.kind()),
            );
        }
    }

    fn validate_child_shape(&mut self, element: &crate::document::ElementNode, path: &NodePath) {
        let Some(constraint) = self.schema.element_child_constraint(element.kind()) else {
            return;
        };
        let child_count = u32::try_from(element.children().len()).unwrap_or(u32::MAX);
        if child_count < constraint.minimum() {
            let message = if element.kind() == self.schema.root_kind()
                && constraint.minimum() == 1
                && matches!(constraint.kind(), ChildKind::Element(kind) if kind == self.schema.paragraph_kind())
            {
                "a document must contain at least one paragraph".to_owned()
            } else {
                format!(
                    "element `{}` requires at least {} children",
                    element.kind(),
                    constraint.minimum()
                )
            };
            self.issue(
                ValidationCode::MissingRequiredChild,
                path,
                ValidationSubject::Node,
                ValidationDetail::None,
                message,
            );
        }

        for (index, child) in element.children().iter().enumerate() {
            let within_maximum = constraint
                .maximum()
                .is_none_or(|maximum| u32::try_from(index).is_ok_and(|index| index < maximum));
            let valid_kind = match constraint.kind() {
                ChildKind::Text => child.as_text().is_some(),
                ChildKind::Element(required) => {
                    child.as_element().is_some_and(|child_element| child_element.kind() == required)
                }
            };
            if within_maximum && valid_kind {
                continue;
            }
            let message = if element.kind() == self.schema.root_kind()
                && matches!(constraint.kind(), ChildKind::Element(kind) if kind == self.schema.paragraph_kind())
            {
                format!("document child {index} must be `{}`", self.schema.paragraph_kind())
            } else if element.kind() == self.schema.paragraph_kind()
                && matches!(constraint.kind(), ChildKind::Text)
            {
                format!("paragraph child {index} must be text")
            } else if !within_maximum {
                format!("element `{}` has too many children", element.kind())
            } else {
                match constraint.kind() {
                    ChildKind::Text => {
                        format!("element `{}` child {index} must be text", element.kind())
                    }
                    ChildKind::Element(required) => {
                        format!("element `{}` child {index} must be `{required}`", element.kind())
                    }
                }
            };
            self.issue(
                ValidationCode::InvalidChild,
                path,
                ValidationSubject::Child { index },
                ValidationDetail::None,
                message,
            );
        }
    }

    fn validate_adjacent_text(&mut self, element: &crate::document::ElementNode, path: &NodePath) {
        if !self.schema.global_constraints().requires_merged_adjacent_equal_text() {
            return;
        }
        for (left_index, pair) in
            element.children().iter().collect::<Vec<_>>().windows(2).enumerate()
        {
            if let (Some(left), Some(right)) = (pair[0].as_text(), pair[1].as_text())
                && left.formats() == right.formats()
            {
                self.issue(
                    ValidationCode::AdjacentEqualText,
                    path,
                    ValidationSubject::Child { index: left_index },
                    ValidationDetail::None,
                    format!(
                        "text children {left_index} and {} have equal formats and must be merged",
                        left_index + 1
                    ),
                );
            }
        }
    }

    fn visit_text(&mut self, text: &crate::document::TextNode, path: &NodePath) {
        if text.text().is_empty() && self.schema.global_constraints().requires_non_empty_text() {
            self.issue(
                ValidationCode::EmptyText,
                path,
                ValidationSubject::Text,
                ValidationDetail::None,
                "text leaves cannot be empty".to_owned(),
            );
        }
        if text.text().len() > self.limits.max_text_bytes {
            self.limit_issue(
                path,
                LimitKind::TextBytes,
                text.text().len(),
                self.limits.max_text_bytes,
            );
        }
        let Some(total_text_bytes) =
            self.total_text_bytes.checked_add(usize_as_u64(text.text().len()))
        else {
            self.counter_overflow_issue(path, LimitKind::TotalTextBytes);
            return;
        };
        self.total_text_bytes = total_text_bytes;
        if self.total_text_bytes > usize_as_u64(self.limits.max_total_text_bytes) {
            self.limit_issue(
                path,
                LimitKind::TotalTextBytes,
                u64_as_usize(self.total_text_bytes),
                self.limits.max_total_text_bytes,
            );
        }
        if text.formats().len() > self.limits.max_formats_per_text {
            self.limit_issue(
                path,
                LimitKind::FormatCount,
                text.formats().len(),
                self.limits.max_formats_per_text,
            );
        }

        let mut previous: Option<&QualifiedName> = None;
        for (index, format) in text.formats().iter().enumerate() {
            if let Some(previous_kind) = previous {
                if previous_kind == format.kind()
                    && self.schema.global_constraints().requires_unique_format_kinds()
                {
                    self.issue(
                        ValidationCode::DuplicateFormat,
                        path,
                        ValidationSubject::Format { index },
                        ValidationDetail::None,
                        format!("format `{}` occurs more than once", format.kind()),
                    );
                } else if previous_kind > format.kind()
                    && self.schema.global_constraints().requires_canonical_format_order()
                {
                    self.issue(
                        ValidationCode::NonCanonicalFormatOrder,
                        path,
                        ValidationSubject::Format { index },
                        ValidationDetail::None,
                        format!("format `{}` is not in ascending order", format.kind()),
                    );
                }
            }
            previous = Some(format.kind());
            if !self.schema.allows_text_format(format.kind()) {
                self.issue(
                    ValidationCode::UnknownFormat,
                    path,
                    ValidationSubject::Format { index },
                    ValidationDetail::None,
                    format!(
                        "schema `{}` does not register format `{}`",
                        self.schema.id(),
                        format.kind()
                    ),
                );
            }
            self.visit_properties(format.properties(), path, Some(index));
            if !format.properties().is_empty()
                && !self.schema.format_allows_properties(format.kind())
            {
                self.issue(
                    ValidationCode::PropertiesNotAllowed,
                    path,
                    ValidationSubject::Format { index },
                    ValidationDetail::None,
                    format!("base-schema format `{}` does not allow properties", format.kind()),
                );
            }
        }
    }

    fn visit_properties(
        &mut self,
        properties: &PropertyMap,
        path: &NodePath,
        format_index: Option<usize>,
    ) {
        if properties.len() > self.limits.max_properties_per_owner {
            self.limit_issue(
                path,
                LimitKind::PropertyCount,
                properties.len(),
                self.limits.max_properties_per_owner,
            );
        }
        for (name, value) in properties.iter().take(self.limits.max_properties_per_owner) {
            let mut value_path = Vec::new();
            self.visit_property_value(value, path, format_index, name, &mut value_path);
        }
    }

    fn visit_property_value(
        &mut self,
        value: &PropertyValue,
        node_path: &NodePath,
        format_index: Option<usize>,
        name: &QualifiedName,
        value_path: &mut Vec<PropertyPathSegment>,
    ) {
        let Some(property_value_count) = self.property_value_count.checked_add(1) else {
            self.counter_overflow_issue(node_path, LimitKind::PropertyValueCount);
            return;
        };
        self.property_value_count = property_value_count;
        if self.property_value_count > usize_as_u64(self.limits.max_property_values) {
            self.property_limit_issue(
                node_path,
                format_index,
                name,
                value_path,
                LimitKind::PropertyValueCount,
                u64_as_usize(self.property_value_count),
                self.limits.max_property_values,
            );
            return;
        }
        if value_path.len() > self.limits.max_property_depth {
            self.property_limit_issue(
                node_path,
                format_index,
                name,
                value_path,
                LimitKind::PropertyDepth,
                value_path.len(),
                self.limits.max_property_depth,
            );
            return;
        }

        match value.inner() {
            PropertyValueInner::Array(values) => {
                for (index, value) in values.iter().enumerate() {
                    value_path.push(PropertyPathSegment::Index(index));
                    self.visit_property_value(value, node_path, format_index, name, value_path);
                    value_path.pop();
                }
            }
            PropertyValueInner::Object(values) => {
                for (key, value) in values {
                    value_path.push(PropertyPathSegment::Key(Arc::from(key)));
                    self.visit_property_value(value, node_path, format_index, name, value_path);
                    value_path.pop();
                }
            }
            PropertyValueInner::Null
            | PropertyValueInner::Boolean(_)
            | PropertyValueInner::Integer(_)
            | PropertyValueInner::String(_) => {}
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn property_limit_issue(
        &mut self,
        node_path: &NodePath,
        format_index: Option<usize>,
        name: &QualifiedName,
        value_path: &[PropertyPathSegment],
        kind: LimitKind,
        actual: usize,
        maximum: usize,
    ) {
        let name = Arc::from(name.as_str());
        let value_path = Arc::from(value_path);
        let subject = if let Some(format_index) = format_index {
            ValidationSubject::FormatProperty { format_index, name, value_path }
        } else {
            ValidationSubject::ElementProperty { name, value_path }
        };
        self.issue(
            ValidationCode::LimitExceeded,
            node_path,
            subject,
            ValidationDetail::Limit { kind, actual, maximum },
            format!("{} is {actual}; the configured maximum is {maximum}", kind.as_str()),
        );
    }
}

fn usize_as_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

fn u64_as_usize(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}
