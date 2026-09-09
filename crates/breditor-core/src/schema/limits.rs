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
    pub(crate) max_property_string_bytes: usize,
    pub(crate) max_total_property_string_bytes: usize,
}

/// Runtime validity settings recorded on a completely proved document.
///
/// The JSON byte budget is intentionally absent because it constrains only the
/// encoded input envelope, not the published runtime tree.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RuntimeValidationProfile {
    tree: TreeValidationProfile,
    text: TextValidationProfile,
    properties: PropertyValidationProfile,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct TreeValidationProfile {
    depth: usize,
    nodes: usize,
    children_per_element: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct TextValidationProfile {
    leaf_bytes: usize,
    total_bytes: usize,
    formats_per_leaf: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct PropertyValidationProfile {
    entries_per_owner: usize,
    depth: usize,
    total_values: usize,
    string_bytes: usize,
    total_string_bytes: usize,
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

    /// Returns the maximum UTF-8 byte length of one property string.
    #[must_use]
    pub const fn max_property_string_bytes(&self) -> usize {
        self.max_property_string_bytes
    }

    /// Returns the maximum combined UTF-8 bytes across property strings.
    #[must_use]
    pub const fn max_total_property_string_bytes(&self) -> usize {
        self.max_total_property_string_bytes
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

    /// Sets the maximum UTF-8 byte length of one property string.
    #[must_use]
    pub const fn with_max_property_string_bytes(mut self, value: usize) -> Self {
        self.max_property_string_bytes = value;
        self
    }

    /// Sets the maximum combined UTF-8 bytes across property strings.
    #[must_use]
    pub const fn with_max_total_property_string_bytes(mut self, value: usize) -> Self {
        self.max_total_property_string_bytes = value;
        self
    }

    pub(crate) const fn runtime_validation_profile(&self) -> RuntimeValidationProfile {
        RuntimeValidationProfile {
            tree: TreeValidationProfile {
                depth: self.max_node_depth,
                nodes: self.max_nodes,
                children_per_element: self.max_children_per_element,
            },
            text: TextValidationProfile {
                leaf_bytes: self.max_text_bytes,
                total_bytes: self.max_total_text_bytes,
                formats_per_leaf: self.max_formats_per_text,
            },
            properties: PropertyValidationProfile {
                entries_per_owner: self.max_properties_per_owner,
                depth: self.max_property_depth,
                total_values: self.max_property_values,
                string_bytes: self.max_property_string_bytes,
                total_string_bytes: self.max_total_property_string_bytes,
            },
        }
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
            max_property_string_bytes: 65_536,
            max_total_property_string_bytes: 1024 * 1024,
        }
    }
}

pub(crate) fn child_count_fits_point_protocol(child_count: usize) -> bool {
    u32::try_from(child_count).is_ok()
}

pub(crate) fn point_protocol_child_count_maximum() -> usize {
    usize::try_from(u32::MAX).unwrap_or(usize::MAX)
}

#[cfg(test)]
mod tests {
    use super::{
        DocumentLimits, child_count_fits_point_protocol, point_protocol_child_count_maximum,
    };

    #[test]
    fn defaults_pin_the_official_v0_1_document_acceptance_floor() {
        let limits = DocumentLimits::default();

        assert_eq!(limits.max_json_bytes(), 16 * 1024 * 1024);
        assert_eq!(limits.max_node_depth(), 64);
        assert_eq!(limits.max_nodes(), 100_000);
        assert_eq!(limits.max_children_per_element(), 10_000);
        assert_eq!(limits.max_text_bytes(), 1024 * 1024);
        assert_eq!(limits.max_total_text_bytes(), 8 * 1024 * 1024);
        assert_eq!(limits.max_formats_per_text(), 32);
        assert_eq!(limits.max_properties_per_owner(), 128);
        assert_eq!(limits.max_property_depth(), 32);
        assert_eq!(limits.max_property_values(), 10_000);
        assert_eq!(limits.max_property_string_bytes(), 65_536);
        assert_eq!(limits.max_total_property_string_bytes(), 1024 * 1024);
    }

    #[test]
    fn child_count_reserves_a_representable_end_boundary() {
        let maximum = point_protocol_child_count_maximum();
        assert!(child_count_fits_point_protocol(maximum));
        if let Some(too_many) = maximum.checked_add(1) {
            assert!(!child_count_fits_point_protocol(too_many));
        }
    }
}
