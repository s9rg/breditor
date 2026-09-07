use crate::schema::{CompiledSchema, SchemaFingerprint, SchemaId};

/// Durable selector and complete-definition fingerprint for one compiled schema.
///
/// This value is persistence identity only. It is not a process-local
/// validation proof, package signature, authorization token, or migration.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DurableSchemaBinding {
    schema: SchemaId,
    fingerprint: SchemaFingerprint,
}

impl DurableSchemaBinding {
    /// Creates a durable binding from its independently validated components.
    #[must_use]
    pub const fn new(schema: SchemaId, fingerprint: SchemaFingerprint) -> Self {
        Self { schema, fingerprint }
    }

    /// Returns the human-readable schema selector.
    #[must_use]
    pub const fn schema(&self) -> &SchemaId {
        &self.schema
    }

    /// Returns the collision-resistant complete-definition identity.
    #[must_use]
    pub const fn fingerprint(&self) -> SchemaFingerprint {
        self.fingerprint
    }

    pub(crate) fn from_compiled(schema: &CompiledSchema) -> Self {
        Self::new(schema.id().clone(), schema.fingerprint())
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::hash_map::DefaultHasher,
        hash::{Hash, Hasher},
    };

    use crate::schema::CompiledSchema;

    #[test]
    fn equal_compiled_bindings_hash_equally_and_have_safe_debug() {
        let first = CompiledSchema::breditor_base().durable_binding();
        let second = CompiledSchema::breditor_base().durable_binding();
        let mut first_hash = DefaultHasher::new();
        let mut second_hash = DefaultHasher::new();
        first.hash(&mut first_hash);
        second.hash(&mut second_hash);
        let debug = format!("{first:?}");

        assert_eq!(first, second);
        assert_eq!(first_hash.finish(), second_hash.finish());
        assert!(debug.contains("breditor/base"));
        assert!(debug.contains("sha256:68aecbce"));
        assert!(!debug.contains("process-local"));
        assert!(!debug.contains("0x"));
    }
}
