use crate::schema::{
    CompiledSchema, DurableSchemaBinding, SchemaBindingError, SchemaFingerprint, SchemaId,
};

pub(crate) fn require_schema_binding(
    schema: &CompiledSchema,
    found: &DurableSchemaBinding,
) -> Result<(), SchemaBindingError> {
    require_schema_id(schema, found.schema())?;
    require_schema_fingerprint(schema, found.fingerprint())
}

pub(crate) fn require_schema_id(
    schema: &CompiledSchema,
    found: &SchemaId,
) -> Result<(), SchemaBindingError> {
    if found != schema.id() {
        return Err(SchemaBindingError::SchemaIdMismatch {
            expected: schema.id().clone(),
            found: found.clone(),
        });
    }
    Ok(())
}

pub(crate) fn require_schema_fingerprint(
    schema: &CompiledSchema,
    found: SchemaFingerprint,
) -> Result<(), SchemaBindingError> {
    if found != schema.fingerprint() {
        return Err(SchemaBindingError::SchemaFingerprintMismatch {
            expected: schema.fingerprint(),
            found,
        });
    }
    Ok(())
}

pub(crate) fn require_exact_breditor_base(
    schema: &CompiledSchema,
) -> Result<(), SchemaBindingError> {
    if schema.is_exact_breditor_base() {
        return Ok(());
    }
    let base = CompiledSchema::breditor_base();
    Err(SchemaBindingError::LegacyV1RequiresExactBase {
        expected_schema: base.id().clone(),
        expected_fingerprint: base.fingerprint(),
        found_schema: schema.id().clone(),
        found_fingerprint: schema.fingerprint(),
    })
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        identity::QualifiedName,
        schema::{
            CompiledSchema, DurableSchemaBinding, SchemaBindingError, SchemaId, SchemaVersion,
        },
    };

    use super::{require_exact_breditor_base, require_schema_binding};

    #[test]
    fn binding_checks_selector_before_fingerprint() -> Result<(), Box<dyn Error>> {
        let expected = CompiledSchema::breditor_base();
        let variant = CompiledSchema::test_semantic_variant_same_id();
        let wrong_selector =
            SchemaId::new(QualifiedName::try_new("test/other")?, SchemaVersion::try_new(1)?);
        let binding = DurableSchemaBinding::new(wrong_selector, variant.fingerprint());

        assert!(matches!(
            require_schema_binding(&expected, &binding),
            Err(SchemaBindingError::SchemaIdMismatch { .. })
        ));

        let binding = variant.durable_binding();

        assert!(matches!(
            require_schema_binding(&expected, &binding),
            Err(SchemaBindingError::SchemaFingerprintMismatch { .. })
        ));
        Ok(())
    }

    #[test]
    fn legacy_guard_requires_the_exact_base_definition() {
        assert!(require_exact_breditor_base(&CompiledSchema::breditor_base()).is_ok());
        assert!(matches!(
            require_exact_breditor_base(&CompiledSchema::test_semantic_variant_same_id()),
            Err(SchemaBindingError::LegacyV1RequiresExactBase { .. })
        ));
    }
}
