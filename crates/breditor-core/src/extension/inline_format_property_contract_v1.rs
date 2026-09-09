use crate::identity::QualifiedName;

use super::{
    InlineFormatPropertyContractV1Error, InlineFormatPropertySpecV1,
    MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT,
};

/// Canonical typed properties attached to one manifest-owned inline format.
///
/// Absence of a contract means the format is property-free. A present V1
/// contract is non-empty and its declarations are unique and sorted by name.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InlineFormatPropertyContractV1 {
    format_kind: QualifiedName,
    properties: Box<[InlineFormatPropertySpecV1]>,
}

impl InlineFormatPropertyContractV1 {
    /// Validates and canonicalizes a non-empty typed property contract.
    ///
    /// # Errors
    ///
    /// Returns [`InlineFormatPropertyContractV1Error`] for an empty or
    /// oversized declaration set, a duplicate name, or a property name in the
    /// `breditor/*` namespace reserved for the core.
    pub fn try_new(
        format_kind: QualifiedName,
        mut properties: Vec<InlineFormatPropertySpecV1>,
    ) -> Result<Self, InlineFormatPropertyContractV1Error> {
        let actual = u32::try_from(properties.len()).unwrap_or(u32::MAX);
        if actual == 0 {
            return Err(InlineFormatPropertyContractV1Error::Empty { format_kind });
        }
        if actual > MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT {
            return Err(InlineFormatPropertyContractV1Error::TooManyProperties {
                format_kind,
                actual,
                maximum: MAX_INLINE_FORMAT_PROPERTIES_PER_CONTRACT,
            });
        }
        properties.sort_by(|left, right| left.name().cmp(right.name()));
        if let Some(pair) = properties.windows(2).find(|pair| pair[0].name() == pair[1].name()) {
            return Err(InlineFormatPropertyContractV1Error::DuplicateProperty {
                format_kind,
                name: pair[0].name().clone(),
            });
        }
        if let Some(property) =
            properties.iter().find(|property| property.name().namespace() == "breditor")
        {
            return Err(InlineFormatPropertyContractV1Error::ReservedPropertyName {
                format_kind,
                name: property.name().clone(),
            });
        }
        Ok(Self { format_kind, properties: properties.into_boxed_slice() })
    }

    /// Returns the target inline-format kind.
    #[must_use]
    pub const fn format_kind(&self) -> &QualifiedName {
        &self.format_kind
    }

    /// Returns declarations in canonical ascending name order.
    #[must_use]
    pub const fn properties(&self) -> &[InlineFormatPropertySpecV1] {
        &self.properties
    }

    /// Looks up one declared property by exact qualified name.
    #[must_use]
    pub fn property(&self, name: &QualifiedName) -> Option<&InlineFormatPropertySpecV1> {
        self.properties
            .binary_search_by(|property| property.name().cmp(name))
            .ok()
            .map(|index| &self.properties[index])
    }
}
