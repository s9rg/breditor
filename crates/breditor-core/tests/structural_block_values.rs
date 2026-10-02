//! Boundary and arithmetic contracts for the experimental structural values.

use breditor_core::block::{
    BlockValueError, HeadingLevel, ListKind, MAX_ORDERED_LIST_ORDINAL, OrderedListStart,
    TextBlockKind,
};
use proptest::prelude::*;

#[test]
fn block_values_do_not_widen_the_existing_document_language()
-> Result<(), Box<dyn std::error::Error>> {
    use breditor_core::{
        codec::{DocumentCodecError, DocumentJsonCodec},
        schema::{CompiledSchema, ValidationCode},
    };
    let schema = CompiledSchema::breditor_base();
    assert_eq!(
        schema.fingerprint().to_string(),
        "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173"
    );
    let codec = DocumentJsonCodec::new(schema);
    let mut document = serde_json::json!({
        "format":"breditor/document", "formatVersion":1,
        "schema":{"name":"breditor/base", "version":1},
        "root":{"kind":"element", "type":"breditor/document", "entityId":null,
            "properties":{}, "children":[{"kind":"element", "type":"breditor/paragraph",
                "entityId":null, "properties":{}, "children":[]}]}
    });
    let original = codec.decode(&document.to_string())?;
    let canonical = codec.encode(&original)?;
    let _heading = TextBlockKind::Heading(HeadingLevel::try_new(2)?);
    let _list = ListKind::Ordered(OrderedListStart::one());
    for kind in ["breditor/heading", "breditor/bullet-list", "breditor/ordered-list"] {
        document["root"]["children"][0]["type"] = kind.into();
        match codec.decode(&document.to_string()) {
            Err(DocumentCodecError::Validation(report)) => {
                assert!(report.contains(ValidationCode::UnknownElement));
                assert!(report.contains(ValidationCode::InvalidChild));
            }
            _ => return Err("existing codec did not reject the unregistered block".into()),
        }
        assert_eq!(codec.encode(&original)?, canonical);
    }
    Ok(())
}

#[test]
fn every_heading_rank_is_exact_and_invalid_values_never_wrap() -> Result<(), BlockValueError> {
    for value in 1..=6 {
        let level = HeadingLevel::try_new(value)?;
        assert_eq!(u32::from(level.get()), value);
        assert_eq!(level.to_string(), value.to_string());
        assert_ne!(TextBlockKind::Heading(level), TextBlockKind::Paragraph);
    }
    for value in [0, 7, 255, 256, 257, 65_537, u32::MAX] {
        assert_eq!(HeadingLevel::try_new(value), Err(BlockValueError::HeadingLevelOutOfRange));
    }
    Ok(())
}

#[test]
fn list_starts_and_last_ordinal_have_exact_boundaries() -> Result<(), BlockValueError> {
    assert_eq!(OrderedListStart::one().get(), 1);
    for value in [1, 2, 1_000, MAX_ORDERED_LIST_ORDINAL] {
        let start = OrderedListStart::try_new(value)?;
        assert_eq!(start.get(), value);
        assert_eq!(start.to_string(), value.to_string());
        assert_eq!(start.ordinal_at(0), Some(value));
        assert_eq!(
            start.ordinal_at(MAX_ORDERED_LIST_ORDINAL - value),
            Some(MAX_ORDERED_LIST_ORDINAL)
        );
        assert_eq!(start.ordinal_at(MAX_ORDERED_LIST_ORDINAL - value + 1), None);
        assert_eq!(start.ordinal_at(u32::MAX), None);
        assert_eq!(start.get(), value);
        assert_ne!(ListKind::Ordered(start), ListKind::Bullet);
    }
    for value in [0, MAX_ORDERED_LIST_ORDINAL + 1, u32::MAX] {
        assert_eq!(
            OrderedListStart::try_new(value),
            Err(BlockValueError::OrderedListStartOutOfRange)
        );
    }
    Ok(())
}

#[test]
fn diagnostics_are_stable_and_payload_free() {
    assert_eq!(
        BlockValueError::HeadingLevelOutOfRange.as_str(),
        "block.heading_level_out_of_range"
    );
    assert_eq!(
        BlockValueError::OrderedListStartOutOfRange.as_str(),
        "block.ordered_list_start_out_of_range"
    );
    assert_eq!(format!("{:?}", BlockValueError::HeadingLevelOutOfRange), "HeadingLevelOutOfRange");
}

proptest! {
    #[test]
    fn heading_domain_is_exact_for_every_u32(value in any::<u32>()) {
        let result = HeadingLevel::try_new(value);
        prop_assert_eq!(result.is_ok(), (1..=6).contains(&value));
        if let Ok(level) = result { prop_assert_eq!(u32::from(level.get()), value); }
    }

    #[test]
    fn list_numbering_matches_wide_arithmetic(start in 1..=MAX_ORDERED_LIST_ORDINAL, index in any::<u32>()) {
        let value = OrderedListStart::try_new(start)
            .map_err(|error| TestCaseError::fail(error.to_string()))?;
        let wide = u64::from(start) + u64::from(index);
        let expected = if wide <= u64::from(MAX_ORDERED_LIST_ORDINAL) {
            u32::try_from(wide).ok()
        } else { None };
        prop_assert_eq!(value.ordinal_at(index), expected);
        prop_assert_eq!(value.get(), start);
    }
}
