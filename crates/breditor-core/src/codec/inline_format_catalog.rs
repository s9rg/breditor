//! Read-only semantic declarations for independent presentation compilers.

use crate::{
    extension::{InlineFormatPropertyContractV1, InlineFormatPropertyTypeV1, PropertyPresenceV1},
    schema::CompiledSchema,
};
use serde_json::{Value, json};

/// Original format family for a compiled schema's read-only inline declarations.
pub const INLINE_FORMAT_CATALOG_FORMAT: &str = "breditor/inline-format-catalog";
/// Version of the selector, fingerprint and complete typed-format catalog shape.
pub const INLINE_FORMAT_CATALOG_VERSION: u32 = 1;

/// Encode every admitted inline format in canonical lexical order.
///
/// This bounded catalog is derived from the actual immutable compiled schema,
/// including the built-in strong format and exact required/optional property
/// domains. It contains no document content, action authority, room, history,
/// process-local generation or executable presentation policy. A presentation
/// consumer must still bind it to the admitted document's complete schema
/// identity. Possessing or parsing these bytes does not mint a compiled proof.
/// No schema fingerprint, document or existing wire format changes.
#[must_use]
pub fn encode_inline_format_catalog(schema: &CompiledSchema) -> String {
    let formats: Vec<_> = schema
        .inline_formats()
        .map(|(kind, revision, contract)| {
            let properties: Vec<_> = contract
                .into_iter()
                .flat_map(InlineFormatPropertyContractV1::properties)
                .map(|property| {
                    let presence = match property.presence() {
                        PropertyPresenceV1::Required => "required",
                        PropertyPresenceV1::Optional => "optional",
                    };
                    json!({"name":property.name().as_str(),"presence":presence,
                        "valueType":value_type(property.value_type())})
                })
                .collect();
            json!({"kind":kind.as_str(),"revision":revision.get(),"properties":properties})
        })
        .collect();
    json!({"format":INLINE_FORMAT_CATALOG_FORMAT,"formatVersion":INLINE_FORMAT_CATALOG_VERSION,
        "schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get(),
            "fingerprint":schema.fingerprint().to_string()},"formats":formats})
    .to_string()
}

fn value_type(value: &InlineFormatPropertyTypeV1) -> Value {
    match value {
        InlineFormatPropertyTypeV1::Boolean => json!({"kind":"boolean"}),
        InlineFormatPropertyTypeV1::Integer(bounds) => json!({"kind":"integer",
            "minimum":bounds.minimum().map(crate::document::PropertyInteger::get),
            "maximum":bounds.maximum().map(crate::document::PropertyInteger::get)}),
        InlineFormatPropertyTypeV1::String(bounds) => json!({"kind":"string",
            "minimumUtf8Bytes":bounds.minimum_utf8_bytes(),
            "maximumUtf8Bytes":bounds.maximum_utf8_bytes()}),
    }
}
