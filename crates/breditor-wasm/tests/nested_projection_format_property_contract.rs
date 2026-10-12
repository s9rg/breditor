//! Typed format-property projection contract independent of JS return transport.
#![cfg(all(not(target_arch = "wasm32"), feature = "candidate-word-projection-scalars"))]

use breditor_wasm::BreditorCompiledProfile;
use serde_json::json;
use std::{error::Error, io};

#[test]
fn typed_properties_and_word_counts_survive_engine_drop() -> Result<(), Box<dyn Error>> {
    let schema = json!({"name":"example/property-probe","version":1});
    let mut factory = BreditorCompiledProfile::from_bootstrap_json_v5(&json!({
        "format":"breditor/profile-bootstrap","formatVersion":5,"schema":schema,
        "extensions":[{"id":{"name":"example/link-extension","version":1},
            "dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/link","revision":1}],
            "inlineFormatPropertyContracts":[{"formatKind":"example/link","properties":[
                {"name":"example/enabled","presence":"required","valueType":{"kind":"boolean"}},
                {"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},
                {"name":"example/rank","presence":"required","valueType":{"kind":"integer","minimum":-5,"maximum":10}}
            ]}],"inlineFormatToggles":[],"inlineFormatSets":[]}]
    }).to_string());
    let profile = factory.take_profile().ok_or_else(|| io::Error::other("profile missing"))?;
    let fingerprint = profile.descriptor().schema_fingerprint();
    let element = |kind: &str, children: Vec<serde_json::Value>| {
        json!({
            "kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{},"children":children
        })
    };
    let text = json!({"kind":"text","text":"日本🙂","formats":[{"type":"example/link","properties":{
        "example/enabled":false,"example/href":"https://example.test/","example/rank":-5
    }}]});
    let root = element(
        "document",
        vec![element(
            "bullet-list",
            vec![element("list-item", vec![element("paragraph", vec![text])])],
        )],
    );
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":schema,"schemaFingerprint":fingerprint,"root":root}).to_string();
    let projection = {
        let mut factory =
            profile.create_engine_from_document_json_v7("property-probe", &document, 20.0);
        let engine = factory.take_engine().ok_or_else(|| io::Error::other("engine missing"))?;
        let mut result = engine.projection(&engine.observation());
        result.take_projection().ok_or_else(|| io::Error::other("projection missing"))?
    };
    assert_eq!(projection.node_count(), 5);
    assert_eq!(projection.format_count_words(4), vec![1, 1]);
    assert_eq!(projection.format_property_count_words(4, 0), vec![1, 3]);
    assert_eq!(projection.format_property_boolean(4, 0, 0), Some(false));
    assert_eq!(
        projection.format_property_string(4, 0, 1).as_deref(),
        Some("https://example.test/")
    );
    assert_eq!(projection.format_property_integer(4, 0, 2), Some(-5.0));
    #[cfg(feature = "candidate-word-property-integers")]
    {
        assert_eq!(projection.projection_integer_words_version(), 1);
        assert_eq!(
            projection.format_property_integer_words(4, 0, 2),
            vec![1, u32::MAX - 4, u32::MAX]
        );
        for ordinal in [0, 1, 3, u32::MAX] {
            assert_eq!(projection.format_property_integer_words(4, 0, ordinal), vec![0, 0, 0]);
        }
        assert_eq!(projection.format_property_integer_words(u32::MAX, 0, 2), vec![0, 0, 0]);
        assert_eq!(projection.format_property_integer_words(4, u32::MAX, 2), vec![0, 0, 0]);
    }
    for ordinal in 0..3 {
        assert_eq!(projection.format_property_count_words(4, ordinal + 1), vec![0, 0]);
    }
    assert_eq!(projection.format_property_integer(4, 0, 0), None);
    assert_eq!(projection.format_property_boolean(4, 0, 1), None);
    assert_eq!(projection.format_property_string(4, 0, 2), None);
    assert_eq!(projection.format_property_name(4, 0, 3), None);
    Ok(())
}
