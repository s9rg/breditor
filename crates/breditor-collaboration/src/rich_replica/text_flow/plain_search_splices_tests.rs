//! Compare optimized lowering with the exact original-character operation stream.
use super::{
    PlainSearchSplices,
    tests::{fork, join, seed, split},
    *,
};
use crate::{Error, register::Stamp};
use loro::{ExportMode, LoroDoc};
use std::ops::Range;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn ordinary(doc: &LoroDoc, range: Range<u32>, content: &str) -> Result {
    if range.start != range.end {
        delete(doc, "a", range.start, range.end - range.start)?;
    }
    doc.commit();
    let mut remaining = content;
    let mut offset = range.start;
    while !remaining.is_empty() {
        let mut end = remaining.len().min(64 * 1024);
        while !remaining.is_char_boundary(end) {
            end -= 1;
        }
        let chunk = &remaining[..end];
        insert_with_activation(
            doc,
            "a",
            offset,
            crate::anchor::Affinity::After,
            chunk,
            Some(Stamp::next(doc)?),
        )?;
        doc.commit();
        offset += u32::try_from(chunk.encode_utf16().count())?;
        remaining = &remaining[end..];
    }
    Ok(())
}

#[test]
fn certified_plain_search_emits_exact_ordinary_operations_and_scalar_chunks() -> Result {
    for edits in [
        vec![(6..6, "!".into()), (2..4, "日本".into()), (0..1, String::new())],
        vec![(0..4, "🙂".repeat(40_000))],
        vec![(4..4, "🙂".into()), (2..4, "X".into()), (0..2, "a".into())],
    ] {
        let slow = seed()?;
        let fast = fork(&slow, 11)?;
        let mut direct = PlainSearchSplices::capture(&fast, ["a", "a"])?;
        for (range, content) in edits {
            ordinary(&slow, range.clone(), &content)?;
            assert!(direct.replace(&fast, "a", range, &content)?);
        }
        assert!(view(&fast, "a")? == view(&slow, "a")?, "exact source projection differs");
        assert_eq!(fast.state_frontiers(), slow.state_frontiers());
        assert!(
            fast.export(ExportMode::all_updates())? == slow.export(ExportMode::all_updates())?,
            "exact authored operations differ"
        );
    }
    Ok(())
}

#[test]
fn plain_search_declines_disabled_formats_and_observed_fragments_without_writing() -> Result {
    for fragmented in [false, true] {
        let doc = seed()?;
        if fragmented {
            split(&doc, "a", 2, "right")?;
            join(&doc, "a", "right")?;
        } else {
            set_format(
                &doc,
                "a",
                0,
                1,
                serde_json::json!({"type":"breditor/strong","properties":{}}),
                false,
            )?;
            doc.commit();
        }
        let mut direct = PlainSearchSplices::capture(&doc, ["a"])?;
        let before = doc.export(ExportMode::all_updates())?;
        assert!(!direct.replace(&doc, "a", 0..1, "X")?);
        assert_eq!(before, doc.export(ExportMode::all_updates())?);
    }
    Ok(())
}

#[test]
fn plain_search_rejects_half_surrogates_and_non_descending_ranges_before_writing() -> Result {
    let doc = seed()?;
    let mut direct = PlainSearchSplices::capture(&doc, ["a"])?;
    let before = doc.export(ExportMode::all_updates())?;
    assert!(matches!(direct.replace(&doc, "a", 3..4, "X"), Err(Error::Offset)));
    assert_eq!(before, doc.export(ExportMode::all_updates())?);
    assert!(direct.replace(&doc, "a", 4..6, "tail")?);
    let after = doc.export(ExportMode::all_updates())?;
    assert!(matches!(direct.replace(&doc, "a", 5..6, "X"), Err(Error::Contract(_))));
    assert_eq!(after, doc.export(ExportMode::all_updates())?);
    Ok(())
}

#[test]
fn plain_search_preserves_empty_body_routing_by_declining_complete_reinsertion() -> Result {
    let doc = seed()?;
    let mut direct = PlainSearchSplices::capture(&doc, ["a"])?;
    let before = doc.export(ExportMode::all_updates())?;
    assert!(!direct.replace(&doc, "a", 0..6, "replacement")?);
    assert_eq!(before, doc.export(ExportMode::all_updates())?);
    let mut direct = PlainSearchSplices::capture(&doc, ["a"])?;
    assert!(direct.replace(&doc, "a", 0..6, "")?);
    assert!(view(&doc, "a")?.is_empty());
    let mut direct = PlainSearchSplices::capture(&doc, ["a"])?;
    let before = doc.export(ExportMode::all_updates())?;
    assert!(!direct.replace(&doc, "a", 0..0, "replacement")?);
    assert_eq!(before, doc.export(ExportMode::all_updates())?);
    Ok(())
}
