//! Retained output is budgeted before repetitive formatting can be cloned into segments.
use super::*;
type Result = std::result::Result<(), Box<dyn std::error::Error>>;
fn scalar(character: char, offset: u32, formats: Arc<Vec<Value>>) -> source::Scalar {
    source::Scalar {
        identity: vec![],
        block: Arc::from("p"),
        offset,
        character,
        formats,
        binding: Arc::new(Binding {
            block: Arc::from("p"),
            kind: "breditor/paragraph".into(),
            domain: super::super::AffineTextDomain::Document,
        }),
    }
}
fn current(before: &source::Scalar) -> Current {
    Current {
        block: Arc::clone(&before.block),
        offset: before.offset,
        character: before.character,
        formats: Arc::clone(&before.formats),
        binding: Arc::clone(&before.binding),
    }
}
#[test]
fn incremental_json_count_matches_real_escaping_lengths_and_coalesced_output() -> Result {
    let mut segments = vec![];
    let mut bytes = 2usize;
    let mut offset = 0u32;
    for character in "abcdefghi\"\\\n🙂xyz".chars() {
        let before = scalar(character, offset, Arc::new(vec![]));
        append_segment(&mut segments, &before, &current(&before), &mut bytes)?;
        assert_eq!(bytes, serde_json::to_vec(&segments)?.len());
        offset += u32::try_from(character.len_utf16())?;
    }
    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0].length, offset);
    Ok(())
}
#[test]
fn oversized_repeated_marks_refuse_before_a_segment_or_budget_is_retained() -> Result {
    let marks = Arc::new(vec![Value::String("x".repeat(MAX_BYTES / 2))]);
    let before = scalar('x', 0, marks);
    let mut segments = vec![];
    let mut bytes = 2;
    assert!(append_segment(&mut segments, &before, &current(&before), &mut bytes).is_err());
    assert!(segments.is_empty());
    assert_eq!(bytes, 2);
    Ok(())
}
