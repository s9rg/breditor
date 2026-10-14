#![cfg(feature = "experimental-rich-content")]
//! Canonical schema-bound format literals, independent from document text budgets.
use breditor_core::{
    codec::RichFormatsJsonCodec,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
type TestResult = Result<(), Box<dyn std::error::Error>>;
fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_rich_content_profile(
            SchemaId::new(
                QualifiedName::try_new("example/format-payload")?,
                SchemaVersion::try_new(1)?,
            ),
            &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
        )?,
        DocumentLimits::default(),
    ))
}
#[test]
fn literal_arrays_roundtrip_and_enforce_canonical_order_types_and_schema() -> TestResult {
    let codec = RichFormatsJsonCodec::new(context()?);
    for input in ["[]", r#"[{"type":"breditor/strong","properties":{}}]"#] {
        assert_eq!(codec.encode(&codec.decode(input)?)?, input);
    }
    for input in [
        "null",
        "{}",
        r#"[{"type":"unknown/format","properties":{}}]"#,
        r#"[{"type":"breditor/strong","properties":{},"extra":1}]"#,
        r#"[{"type":"breditor/strong","type":"breditor/strong","properties":{}}]"#,
        r#"[{"type":"breditor/strong","properties":{"unknown/property":true}}]"#,
        r#"[{"type":"breditor/strong","properties":{}},{"type":"breditor/strong","properties":{}}]"#,
    ] {
        assert!(codec.decode(input).is_err(), "{input}");
    }
    Ok(())
}
#[test]
fn byte_budget_is_symmetric_on_read_and_write() -> TestResult {
    let codec = RichFormatsJsonCodec::new(context()?);
    let strong = codec.decode(r#"[{"type":"breditor/strong","properties":{}}]"#)?;
    let tight = codec.with_max_json_bytes(2);
    assert!(tight.decode(r#"[{"type":"breditor/strong","properties":{}}]"#).is_err());
    assert!(tight.encode(&strong).is_err());
    assert_eq!(tight.encode(&tight.decode("[]")?)?, "[]");
    Ok(())
}
