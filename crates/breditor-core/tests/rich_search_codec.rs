//! Bounded optional intentions/reads never echo query data or become edit credentials.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichSearchCodecError, decode_rich_search_index,
        decode_rich_search_navigation, decode_rich_search_query, decode_rich_search_replacement,
        encode_rich_search_results,
    },
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{RichDocument, RichSearchMode, RichSearchReplacementMode, find_rich_text},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn document(text: &str, document_id: &str) -> Result<RichDocument> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/search-codec")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":document_id},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"body"},"children":if text.is_empty(){json!([])}else{json!([{"kind":"text","text":text,"formats":[]}])}}]});
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/search-codec","version":1},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    Ok(RichDocument::try_admit(
        &schema,
        DocumentJsonCodecV2::new(schema.clone()).decode(&input)?,
        &DocumentLimits::default(),
    )?)
}

#[test]
fn mode_and_direction_fields_are_strings_not_alternate_serde_enum_encodings() -> Result {
    let source = document("cat", "room")?;
    let results = find_rich_text(&source, &decode_rich_search_query(&query("cat", "literal"))?)?;
    for mode in [json!({"literal":null}), json!(["literal"]), json!(0), Value::Null] {
        let mut input: Value = serde_json::from_str(&query("cat", "literal"))?;
        input["mode"] = mode.clone();
        assert!(decode_rich_search_query(&input.to_string()).is_err());
        assert!(
            decode_rich_search_replacement(&json!({"text":"cat","mode":mode}).to_string()).is_err()
        );
    }
    assert!(
        decode_rich_search_navigation(
            &results,
            &json!({"active":null,"direction":{"next":null},"wrap":true}).to_string()
        )
        .is_err()
    );
    Ok(())
}
fn query(pattern: &str, mode: &str) -> String {
    json!({"pattern":pattern,"mode":mode,"caseSensitive":true,"wholeWords":false}).to_string()
}
#[test]
fn closed_query_replacement_and_canonical_indices_reject_ambiguity_without_payloads() -> Result {
    let decoded = decode_rich_search_query(&query("🙂", "literal"))?;
    assert_eq!(decoded.pattern(), "🙂");
    assert_eq!(decoded.mode(), RichSearchMode::Literal);
    for input in [
        r#"{"pattern":"secret","mode":"literal","caseSensitive":true}"#,
        r#"{"pattern":"secret","mode":"literal","caseSensitive":true,"wholeWords":false,"extra":1}"#,
        r#"{"pattern":"secret","pattern":"other","mode":"literal","caseSensitive":true,"wholeWords":false}"#,
        r#"{"pattern":1,"mode":"literal","caseSensitive":true,"wholeWords":false}"#,
        r#"{"pattern":"secret","mode":"auto","caseSensitive":true,"wholeWords":false}"#,
    ] {
        let error = decode_rich_search_query(input).err().ok_or("must reject")?;
        assert!(!format!("{error:?} {error}").contains("secret"));
    }
    let replacement = decode_rich_search_replacement(r#"{"text":"$1","mode":"captures"}"#)?;
    assert_eq!(replacement.mode(), RichSearchReplacementMode::Captures);
    for input in [
        r#"{"text":"x"}"#,
        r#"{"text":"x","mode":"literal","extra":false}"#,
        r#"{"text":1,"mode":"literal"}"#,
        r#"{"text":"x","mode":"regex"}"#,
    ] {
        assert!(decode_rich_search_replacement(input).is_err());
    }
    for index in ["", "01", "-1", "+1", "1.0", "1e0", " 1", "4096", "9999999999999"] {
        assert!(decode_rich_search_index(index).is_err());
    }
    assert_eq!(decode_rich_search_index("0")?, 0);
    assert_eq!(decode_rich_search_index("4095")?, 4095);
    Ok(())
}
#[test]
fn escaped_native_limits_are_checked_after_bounded_json_parse() -> Result {
    let accepted = "\0".repeat(1024);
    assert_eq!(decode_rich_search_query(&query(&accepted, "literal"))?.pattern(), accepted);
    assert!(decode_rich_search_query(&query(&"x".repeat(1025), "literal")).is_err());
    assert_eq!(decode_rich_search_query(&" ".repeat(8193)), Err(RichSearchCodecError::InputLimit));
    let accepted = "\0".repeat(65536);
    assert!(
        decode_rich_search_replacement(&json!({"text":accepted,"mode":"literal"}).to_string())
            .is_ok()
    );
    assert!(
        decode_rich_search_replacement(
            &json!({"text":"x".repeat(65537),"mode":"literal"}).to_string()
        )
        .is_err()
    );
    assert_eq!(
        decode_rich_search_replacement(&" ".repeat(6 * 65536 + 1025)),
        Err(RichSearchCodecError::InputLimit)
    );
    Ok(())
}
#[test]
fn complete_read_contains_string_coordinates_not_query_text_or_captures_and_binds_source() -> Result
{
    let source = document("secret🙂secret", "room")?;
    let results = find_rich_text(
        &source,
        &decode_rich_search_query(&query("(?P<private>secret)", "regex"))?,
    )?;
    let encoded = encode_rich_search_results(&source, &results)?;
    assert!(!encoded.contains("secret") && !encoded.contains("private"));
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["format"], "breditor/rich-search-results");
    assert_eq!(value["count"], "2");
    assert_eq!(value["captureCount"], "2");
    assert_eq!(value["matches"][0], json!({"block":"body","start":"0","end":"6"}));
    assert_eq!(value["matches"][1], json!({"block":"body","start":"8","end":"14"}));
    assert!(encode_rich_search_results(&document("changed", "room")?, &results).is_err());
    assert!(encode_rich_search_results(&document("secret🙂secret", "other")?, &results).is_err());
    Ok(())
}
#[test]
fn native_navigation_is_closed_and_complete_maximum_results_are_not_truncated() -> Result {
    let source = document(&"x ".repeat(4096), "room")?;
    let results = find_rich_text(&source, &decode_rich_search_query(&query("x", "literal"))?)?;
    let value: Value = serde_json::from_str(&encode_rich_search_results(&source, &results)?)?;
    assert_eq!(value["count"], "4096");
    assert_eq!(value["matches"].as_array().ok_or("matches")?.len(), 4096);
    assert_eq!(value["matches"][4095]["end"], "8191");
    assert_eq!(
        decode_rich_search_navigation(
            &results,
            r#"{"active":null,"direction":"previous","wrap":false}"#
        )?,
        Some("4095".into())
    );
    assert_eq!(
        decode_rich_search_navigation(
            &results,
            r#"{"active":"4095","direction":"next","wrap":false}"#
        )?,
        None
    );
    assert_eq!(
        decode_rich_search_navigation(
            &results,
            r#"{"active":"4095","direction":"next","wrap":true}"#
        )?,
        Some("0".into())
    );
    for input in [
        r#"{"direction":"next","wrap":false}"#,
        r#"{"active":0,"direction":"next","wrap":false}"#,
        r#"{"active":"01","direction":"next","wrap":false}"#,
        r#"{"active":null,"direction":"next","wrap":1}"#,
        r#"{"active":null,"direction":"auto","wrap":false}"#,
    ] {
        assert!(decode_rich_search_navigation(&results, input).is_err());
    }
    Ok(())
}
