use crate::identity::QualifiedName;

use super::{InlineFormatPropertyTypeV1, PropertyPresenceV1};

/// One named typed property in an inline-format property contract.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InlineFormatPropertySpecV1 {
    name: QualifiedName,
    presence: PropertyPresenceV1,
    value_type: InlineFormatPropertyTypeV1,
}

impl InlineFormatPropertySpecV1 {
    /// Creates a property declaration from already checked parts.
    #[must_use]
    pub const fn new(
        name: QualifiedName,
        presence: PropertyPresenceV1,
        value_type: InlineFormatPropertyTypeV1,
    ) -> Self {
        Self { name, presence, value_type }
    }

    /// Returns the qualified property name.
    #[must_use]
    pub const fn name(&self) -> &QualifiedName {
        &self.name
    }

    /// Returns whether the property is required or optional.
    #[must_use]
    pub const fn presence(&self) -> PropertyPresenceV1 {
        self.presence
    }

    /// Returns the closed value domain.
    #[must_use]
    pub const fn value_type(&self) -> &InlineFormatPropertyTypeV1 {
        &self.value_type
    }
}
