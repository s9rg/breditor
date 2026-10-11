//! Reuse is an allocation optimization, never a layout admission shortcut.
use super::*;
use crate::{
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, formats, name},
    document::{PropertyInteger, PropertyValue},
    identity::EntityId,
};
use std::error::Error as StdError;

fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn StdError>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, PropertyMap::default(), children)?))
}
fn paragraph(value: &str) -> Result<NodeRef, Box<dyn StdError>> {
    block(TextBlockKind::Paragraph, value, formats()?)
}
fn tree(blocks: &[NodeRef]) -> Result<Vec<NodeRef>, Box<dyn StdError>> {
    Ok(vec![element(
        "breditor/bullet-list",
        vec![
            element(
                "breditor/list-item",
                vec![
                    blocks[0].clone(),
                    element(
                        "breditor/bullet-list",
                        vec![element("breditor/list-item", vec![blocks[1].clone()])?],
                    )?,
                ],
            )?,
            element("breditor/list-item", vec![blocks[2].clone()])?,
        ],
    )?])
}

#[test]
fn exact_subtrees_reuse_allocations_without_changing_output() -> TestResult {
    let blocks = [paragraph("parent")?, paragraph("deep 🙂")?, paragraph("last")?];
    let source = tree(&blocks)?;
    let layout = capture(&source)?;
    let unchanged = build(&layout, &blocks, &source)?;
    assert_eq!(unchanged, build(&layout, &blocks, &[])?);
    assert!(unchanged[0].shares_allocation_with(&source[0]));
    let edited = [blocks[0].clone(), paragraph("changed")?, blocks[2].clone()];
    let result = build(&layout, &edited, &source)?;
    assert_eq!(result, build(&layout, &edited, &[])?);
    assert!(!result[0].shares_allocation_with(&source[0]));
    let before = source[0].as_element().ok_or("source")?.children();
    let after = result[0].as_element().ok_or("result")?.children();
    assert!(!before.get(0).ok_or("parent")?.shares_allocation_with(after.get(0).ok_or("parent")?));
    assert!(before.get(1).ok_or("last")?.shares_allocation_with(after.get(1).ok_or("last")?));
    let reordered = [blocks[2].clone(), blocks[0].clone(), blocks[1].clone()];
    assert_eq!(build(&layout, &reordered, &source)?, build(&layout, &reordered, &[])?);
    // A structurally unrelated source is only a hint.
    let flat = blocks.to_vec();
    assert_eq!(build(&layout, &blocks, &flat)?, build(&layout, &blocks, &[])?);
    Ok(())
}

#[test]
fn foreign_identity_and_extra_children_cannot_leak_into_output() -> TestResult {
    let blocks = [paragraph("one")?, paragraph("two")?, paragraph("three")?];
    let source = tree(&blocks)?;
    let layout = capture(&source)?;
    let original = source[0].as_element().ok_or("list")?;
    let foreign = NodeRef::element(ElementNode::try_new(
        original.kind().clone(),
        Some(EntityId::try_new("foreign")?),
        original.properties().clone(),
        original.children().to_vec(),
    )?);
    let mut extra = original.children().to_vec();
    extra.push(element("breditor/list-item", vec![paragraph("extra")?])?);
    let oversized = NodeRef::element(original.try_with_children(extra)?);
    let properties = PropertyMap::try_from_sorted(vec![(
        name("example/value")?,
        PropertyValue::from_integer(PropertyInteger::try_new(7)?),
    )])?;
    let foreign_properties = NodeRef::element(ElementNode::try_new(
        original.kind().clone(),
        None,
        properties,
        original.children().to_vec(),
    )?);
    for candidate in [foreign, oversized, foreign_properties] {
        let result = build(&layout, &blocks, std::slice::from_ref(&candidate))?;
        assert_eq!(result, build(&layout, &blocks, &[])?);
        assert!(!result[0].shares_allocation_with(&candidate));
    }
    Ok(())
}

#[test]
fn reuse_preserves_invalid_layout_rejection() -> TestResult {
    let blocks = [paragraph("one")?, paragraph("two")?, paragraph("three")?];
    let source = tree(&blocks)?;
    let valid = capture(&source)?;
    for layout in [vec![], source.clone(), vec![element("breditor/list-item", vec![slot()?])?]] {
        assert!(matches!(build(&layout, &blocks, &source), Err(Error::InvalidLayout)));
        assert!(matches!(build(&layout, &blocks, &[]), Err(Error::InvalidLayout)));
    }
    assert!(matches!(build(&valid, &blocks[..2], &source), Err(Error::InvalidLayout)));
    Ok(())
}
