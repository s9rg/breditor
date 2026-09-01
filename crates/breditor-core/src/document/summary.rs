/// Exact cached measurements of one validated document.
///
/// Complete schema validation or a crate-private operation proof creates this
/// value while proving the document. Callers cannot construct or mutate it. It
/// is derived runtime metadata: document codecs do not persist it and decoding
/// recomputes it through complete validation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DocumentSummary {
    node_count: u64,
    max_node_depth: u32,
    total_text_bytes: u64,
    property_value_count: u64,
}

impl DocumentSummary {
    /// Returns the total number of element and text nodes, including the root.
    #[must_use]
    pub const fn node_count(&self) -> u64 {
        self.node_count
    }

    /// Returns the greatest root-relative node depth; the root has depth zero.
    #[must_use]
    pub const fn max_node_depth(&self) -> u32 {
        self.max_node_depth
    }

    /// Returns the combined UTF-8 byte length of every text leaf.
    #[must_use]
    pub const fn total_text_bytes(&self) -> u64 {
        self.total_text_bytes
    }

    /// Returns the number of top-level and recursively nested property values.
    #[must_use]
    pub const fn property_value_count(&self) -> u64 {
        self.property_value_count
    }

    pub(crate) const fn from_validation(
        node_count: u64,
        max_node_depth: u32,
        total_text_bytes: u64,
        property_value_count: u64,
    ) -> Self {
        Self { node_count, max_node_depth, total_text_bytes, property_value_count }
    }
}
