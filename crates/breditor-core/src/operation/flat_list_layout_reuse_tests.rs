//! Canonical-output and immutable-allocation laws for layout wrapper reuse.
use super::*;
use crate::{
    block::{MAX_ORDERED_LIST_ORDINAL, OrderedListStart},
    document::{FormatSet, TextNode},
    identity::EntityId,
};
use std::error::Error;

type TestResult = Result<(), Box<dyn Error>>;

fn paragraph(text: &str) -> Result<NodeRef, Box<dyn Error>> {
    Ok(element(
        "breditor/paragraph",
        PropertyMap::default(),
        vec![NodeRef::text(TextNode::try_new(text.to_owned(), FormatSet::default())?)],
    )?)
}

#[test]
fn reuse_matches_fresh_layout_for_unchanged_changed_and_repartitioned_blocks() -> TestResult {
    let original = [paragraph("one")?, paragraph("two")?, paragraph("three")?];
    let bullet = FlatListRootShape::List { kind: ListKind::Bullet, items: 3 };
    let source = build(&[bullet], &original, &[])?;
    let edited = [original[0].clone(), paragraph("edited")?, original[2].clone()];
    let actual = build(&[bullet], &edited, &source)?;
    assert_eq!(actual, build(&[bullet], &edited, &[])?);
    let before = source[0].as_element().ok_or("source")?.children();
    let after = actual[0].as_element().ok_or("result")?.children();
    assert!(before.get(0).ok_or("first")?.shares_allocation_with(after.get(0).ok_or("first")?));
    assert!(!before.get(1).ok_or("middle")?.shares_allocation_with(after.get(1).ok_or("middle")?));
    assert!(before.get(2).ok_or("last")?.shares_allocation_with(after.get(2).ok_or("last")?));
    let ordered = FlatListRootShape::List {
        kind: ListKind::Ordered(OrderedListStart::try_new(7)?),
        items: 3,
    };
    let split = [
        FlatListRootShape::List { kind: ListKind::Bullet, items: 1 },
        FlatListRootShape::TextBlock,
        FlatListRootShape::List { kind: ListKind::Bullet, items: 1 },
    ];
    for blocks in [
        &original[..],
        &edited[..],
        &[original[2].clone(), original[0].clone(), original[1].clone()][..],
    ] {
        for layout in [&[bullet][..], &[ordered][..], &split[..]] {
            assert_eq!(build(layout, blocks, &source)?, build(layout, blocks, &[])?);
        }
    }
    assert_eq!(
        build(&[ordered], &original, &build(&split, &original, &[])?)?,
        build(&[ordered], &original, &[])?,
    );
    Ok(())
}

#[test]
fn noncanonical_items_are_never_reused() -> TestResult {
    let block = paragraph("unchanged")?;
    let canonical = list_item(&block, None)?;
    let properties = PropertyMap::try_from_sorted(vec![(
        QualifiedName::try_new("example/value")?,
        PropertyValue::from_integer(PropertyInteger::try_new(1)?),
    )])?;
    let candidates = [
        NodeRef::element(ElementNode::try_new(
            QualifiedName::try_new("breditor/list-item")?,
            Some(EntityId::try_new("identity")?),
            PropertyMap::default(),
            vec![block.clone()],
        )?),
        element("breditor/list-item", properties, vec![block.clone()])?,
        element("breditor/paragraph", PropertyMap::default(), vec![block.clone()])?,
        element("breditor/list-item", PropertyMap::default(), vec![])?,
        element("breditor/list-item", PropertyMap::default(), vec![block.clone(), block.clone()])?,
        list_item(&paragraph("different")?, None)?,
        NodeRef::text(TextNode::try_new("text".to_owned(), FormatSet::default())?),
    ];
    for candidate in candidates {
        let result = list_item(&block, Some(&candidate))?;
        assert_eq!(result, canonical);
        assert!(!result.shares_allocation_with(&candidate));
    }
    // Semantically equal but separately allocated blocks are eligible too.
    let equal = list_item(&paragraph("unchanged")?, None)?;
    assert!(list_item(&block, Some(&equal))?.shares_allocation_with(&equal));
    Ok(())
}

#[test]
fn reuse_does_not_relax_layout_admission() -> TestResult {
    let block = paragraph("test")?;
    let source = build(&[FlatListRootShape::TextBlock], std::slice::from_ref(&block), &[])?;
    for layout in [
        vec![],
        vec![FlatListRootShape::List { kind: ListKind::Bullet, items: 0 }],
        vec![FlatListRootShape::List { kind: ListKind::Bullet, items: 2 }],
        vec![FlatListRootShape::TextBlock, FlatListRootShape::TextBlock],
    ] {
        assert_eq!(
            build(&layout, std::slice::from_ref(&block), &source),
            Err(FlatListTextReplaceError::InvalidLayout)
        );
    }
    let overflow = [FlatListRootShape::List {
        kind: ListKind::Ordered(OrderedListStart::try_new(MAX_ORDERED_LIST_ORDINAL)?),
        items: 2,
    }];
    assert_eq!(
        build(&overflow, &[block.clone(), block], &source),
        Err(FlatListTextReplaceError::OrdinalOverflow)
    );
    Ok(())
}
