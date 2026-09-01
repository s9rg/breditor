/// Resource limits applied before a runtime document is published.
///
/// Defaults are deliberately conservative for an interactive editor. Hosts may
/// tighten individual limits for smaller fields.
#[derive(Clone, Debug, Eq, PartialEq)]
#[allow(clippy::struct_field_names)]
pub struct DocumentLimits {
    pub(crate) max_json_bytes: usize,
    pub(crate) max_node_depth: usize,
    pub(crate) max_nodes: usize,
    pub(crate) max_children_per_element: usize,
    pub(crate) max_text_bytes: usize,
    pub(crate) max_total_text_bytes: usize,
    pub(crate) max_formats_per_text: usize,
    pub(crate) max_properties_per_owner: usize,
    pub(crate) max_property_depth: usize,
    pub(crate) max_property_values: usize,
}

impl DocumentLimits {
    /// Returns the maximum accepted UTF-8 JSON input size.
    #[must_use]
    pub const fn max_json_bytes(&self) -> usize {
        self.max_json_bytes
    }

    /// Returns the maximum root-relative node/path depth.
    #[must_use]
    pub const fn max_node_depth(&self) -> usize {
        self.max_node_depth
    }

    /// Returns the maximum total element and text node count.
    #[must_use]
    pub const fn max_nodes(&self) -> usize {
        self.max_nodes
    }

    /// Returns the maximum children owned by one element.
    #[must_use]
    pub const fn max_children_per_element(&self) -> usize {
        self.max_children_per_element
    }

    /// Returns the maximum UTF-8 byte length of one text leaf.
    #[must_use]
    pub const fn max_text_bytes(&self) -> usize {
        self.max_text_bytes
    }

    /// Returns the maximum combined UTF-8 byte length of all text leaves.
    #[must_use]
    pub const fn max_total_text_bytes(&self) -> usize {
        self.max_total_text_bytes
    }

    /// Returns the maximum formats on one text leaf.
    #[must_use]
    pub const fn max_formats_per_text(&self) -> usize {
        self.max_formats_per_text
    }

    /// Returns the maximum top-level properties on an element or format.
    #[must_use]
    pub const fn max_properties_per_owner(&self) -> usize {
        self.max_properties_per_owner
    }

    /// Returns the maximum nested array/object property depth.
    #[must_use]
    pub const fn max_property_depth(&self) -> usize {
        self.max_property_depth
    }

    /// Returns the maximum total property values in one document.
    #[must_use]
    pub const fn max_property_values(&self) -> usize {
        self.max_property_values
    }

    /// Sets the maximum accepted UTF-8 JSON input size.
    #[must_use]
    pub const fn with_max_json_bytes(mut self, value: usize) -> Self {
        self.max_json_bytes = value;
        self
    }

    /// Sets the maximum root-relative node/path depth.
    #[must_use]
    pub const fn with_max_node_depth(mut self, value: usize) -> Self {
        self.max_node_depth = value;
        self
    }

    /// Sets the maximum total node count.
    #[must_use]
    pub const fn with_max_nodes(mut self, value: usize) -> Self {
        self.max_nodes = value;
        self
    }

    /// Sets the maximum children owned by one element.
    #[must_use]
    pub const fn with_max_children_per_element(mut self, value: usize) -> Self {
        self.max_children_per_element = value;
        self
    }

    /// Sets the maximum UTF-8 byte length of one text leaf.
    #[must_use]
    pub const fn with_max_text_bytes(mut self, value: usize) -> Self {
        self.max_text_bytes = value;
        self
    }

    /// Sets the maximum combined UTF-8 byte length of all text leaves.
    #[must_use]
    pub const fn with_max_total_text_bytes(mut self, value: usize) -> Self {
        self.max_total_text_bytes = value;
        self
    }

    /// Sets the maximum formats on one text leaf.
    #[must_use]
    pub const fn with_max_formats_per_text(mut self, value: usize) -> Self {
        self.max_formats_per_text = value;
        self
    }

    /// Sets the maximum top-level properties on an element or format.
    #[must_use]
    pub const fn with_max_properties_per_owner(mut self, value: usize) -> Self {
        self.max_properties_per_owner = value;
        self
    }

    /// Sets the maximum nested array/object property depth.
    #[must_use]
    pub const fn with_max_property_depth(mut self, value: usize) -> Self {
        self.max_property_depth = value;
        self
    }

    /// Sets the maximum total property values in one document.
    #[must_use]
    pub const fn with_max_property_values(mut self, value: usize) -> Self {
        self.max_property_values = value;
        self
    }
}

impl Default for DocumentLimits {
    fn default() -> Self {
        Self {
            max_json_bytes: 16 * 1024 * 1024,
            max_node_depth: 64,
            max_nodes: 100_000,
            max_children_per_element: 10_000,
            max_text_bytes: 1024 * 1024,
            max_total_text_bytes: 8 * 1024 * 1024,
            max_formats_per_text: 32,
            max_properties_per_owner: 128,
            max_property_depth: 32,
            max_property_values: 10_000,
        }
    }
}
