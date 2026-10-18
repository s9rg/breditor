//! Borrow the unchanged document identity field without constructing a JSON pointer.
use serde_json::Value;

/// Preserve the original optional string lookup; callers retain their own binding errors.
pub(super) fn from_header(header: &Value) -> Option<&str> {
    header.get("root")?.get("properties")?.get("breditor/document-id")?.as_str()
}

#[cfg(test)]
mod tests {
    use super::from_header;
    use serde_json::{Value, json};

    #[test]
    fn malformed_and_missing_fields_match_the_original_pointer_lookup() {
        for header in [
            Value::Null,
            json!([]),
            json!({}),
            json!({"root": null}),
            json!({"root": []}),
            json!({"root": {}}),
            json!({"root": {"properties": null}}),
            json!({"root": {"properties": []}}),
            json!({"root": {"properties": {}}}),
            json!({"root": {"properties": {"breditor/document-id": false}}}),
            json!({"root": {"properties": {"breditor/document-id": 7}}}),
            json!({"root": {"properties": {"breditor/document-id": []}}}),
            json!({"root": {"properties": {"breditor~1document-id": "wrong key"}}}),
        ] {
            assert_eq!(
                from_header(&header),
                header.pointer("/root/properties/breditor~1document-id").and_then(Value::as_str)
            );
        }
    }

    #[test]
    fn string_values_remain_verbatim_including_empty_and_unicode_identifiers() {
        for value in ["", "room", "document 🙂", "a/b~c", "日本語"] {
            let header = json!({"root": {"properties": {"breditor/document-id": value}}});
            assert_eq!(from_header(&header), Some(value));
            assert_eq!(
                from_header(&header),
                header.pointer("/root/properties/breditor~1document-id").and_then(Value::as_str)
            );
        }
    }
}
