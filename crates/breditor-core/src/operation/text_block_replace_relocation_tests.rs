//! Format-only structural edits preserve positions, not obsolete leaf indexes.
use super::*;
use crate::{
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, context, formats, heading, state},
    document::{Document, FormatSet, NodeRef},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::DocumentLimits,
    state::EditorState,
    transaction::{Commit, Transaction},
};
use proptest::prelude::*;
use std::error::Error;

fn range(first: u32, start: u64, last: u32, end: u64) -> Result<RootTextRange, Box<dyn Error>> {
    Ok(RootTextRange::try_new(
        RootTextBoundary::try_new(
            NodePath::try_from_indices(vec![first])?,
            TextOffset::try_new(start)?,
        )?,
        RootTextBoundary::try_new(
            NodePath::try_from_indices(vec![last])?,
            TextOffset::try_new(end)?,
        )?,
    )?)
}

fn mixed(kind: TextBlockKind, text: &str) -> Result<NodeRef, Box<dyn Error>> {
    let template = block(kind, "", FormatSet::default())?;
    let mut children = Vec::new();
    for (index, ch) in text.chars().enumerate() {
        let formats = if index % 2 == 0 { formats()? } else { FormatSet::default() };
        let node = block(kind, &ch.to_string(), formats)?;
        children.extend(node.as_element().ok_or("block")?.children().iter().cloned());
    }
    Ok(NodeRef::element(template.as_element().ok_or("block")?.try_with_children(children)?))
}

/// Enumerate every valid scalar position and both forms of child boundary.
fn points(document: &Document) -> Result<Vec<Point>, Box<dyn Error>> {
    let blocks = document.root().as_element().ok_or("root")?.children();
    let mut result = Vec::new();
    for affinity in [Affinity::Before, Affinity::After] {
        for index in 0..=blocks.len() {
            result.push(Point::Children {
                parent_path: NodePath::root(),
                child_index: u32::try_from(index)?,
                affinity,
            });
        }
        for (index, block) in blocks.iter().enumerate() {
            let index = u32::try_from(index)?;
            let children = block.as_element().ok_or("block")?.children();
            for child in 0..=children.len() {
                result.push(Point::Children {
                    parent_path: NodePath::try_from_indices(vec![index])?,
                    child_index: u32::try_from(child)?,
                    affinity,
                });
            }
            for (leaf, child) in children.iter().enumerate() {
                let text = child.as_text().ok_or("text")?;
                let mut offset = 0;
                let path = NodePath::try_from_indices(vec![index, u32::try_from(leaf)?])?;
                result.push(Point::Text {
                    text_path: path.clone(),
                    utf16_offset: offset,
                    affinity,
                });
                for ch in text.text().chars() {
                    offset += u32::try_from(ch.len_utf16())?;
                    result.push(Point::Text {
                        text_path: path.clone(),
                        utf16_offset: offset,
                        affinity,
                    });
                }
            }
        }
    }
    Ok(result)
}

/// Independent semantic oracle: aggregate lengths of leaves preceding a point.
fn coordinate(
    document: &Document,
    point: &Point,
) -> Result<(NodePath, u64, Affinity), Box<dyn Error>> {
    point.resolve(document)?;
    let (path, index, local) = match point {
        Point::Text { text_path, utf16_offset, .. } => (
            text_path.parent().ok_or("parent")?,
            text_path.last_index().ok_or("index")?,
            u64::from(*utf16_offset),
        ),
        Point::Children { parent_path, child_index, .. } if parent_path.is_root() => {
            return Ok((NodePath::root(), u64::from(*child_index), point.affinity()));
        }
        Point::Children { parent_path, child_index, .. } => (parent_path.clone(), *child_index, 0),
    };
    let mut offset = local;
    for child in document
        .node_at(&path)?
        .as_element()
        .ok_or("block")?
        .children()
        .iter()
        .take(usize::try_from(index)?)
    {
        offset += u64::from(child.as_text().ok_or("text")?.utf16_len());
    }
    Ok((path, offset, point.affinity()))
}

fn assert_exact_mapping(before: &EditorState, after: &EditorState, commit: &Commit) -> TestResult {
    for point in points(before.document())? {
        let PointRelocation::Exact(mapped) = commit.relocation().relocate_point(before, &point)?
        else {
            return Err(format!("formatting deleted {point:?}").into());
        };
        assert_eq!(coordinate(before.document(), &point)?, coordinate(after.document(), &mapped)?);
    }
    Ok(())
}

fn check_rewrite(text: &str, rank: u32, target: u32) -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            mixed(TextBlockKind::Paragraph, "outside🙂")?,
            mixed(heading(rank)?, &format!("L{text}R"))?,
            block(heading(3)?, "", FormatSet::default())?,
            mixed(heading(4)?, &format!("L{text}R"))?,
            mixed(TextBlockKind::Paragraph, "after🙂")?,
        ],
        None,
        None,
    )?;
    let end = u64::try_from(text.encode_utf16().count())? + 1;
    let operation = TextBlockReplace::capture(
        &context,
        before.document(),
        range(1, 1, 3, end)?,
        vec![
            block(heading(target)?, &format!("{text}R"), FormatSet::default())?,
            block(heading(3)?, "", FormatSet::default())?,
            block(heading(4)?, &format!("L{text}"), FormatSet::default())?,
        ],
    )?;
    let mut session = crate::session::EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(
            &before,
            vec![Operation::TextBlockReplace(operation)],
        ))?
        .into_commit()
        .ok_or("commit")?;
    let after = session.state().clone();
    assert_exact_mapping(&before, &after, &commit)?;
    // Untouched siblings retain their precise leaf/child representation, too.
    for point in points(before.document())? {
        if point.target_path().is_root() || matches!(point.target_path().iter().next(), Some(0 | 4))
        {
            assert_eq!(
                commit.relocation().relocate_point(&before, &point)?,
                PointRelocation::Exact(point)
            );
        }
    }
    let undo = session.undo()?.ok_or("undo")?;
    assert_exact_mapping(&after, session.state(), &undo)?;
    assert_eq!(session.state().document(), before.document());
    let undo_state = session.state().clone();
    let redo = session.redo()?.ok_or("redo")?;
    assert_exact_mapping(&undo_state, session.state(), &redo)?;
    assert_eq!(session.state().document(), after.document());
    Ok(())
}

#[test]
fn text_block_format_relocation_covers_unicode_run_merges_empty_blocks_and_kind_changes()
-> TestResult {
    for text in ["abc", "🙂e\u{301}👩\u{200d}💻", "🇨🇦אב\r\n"] {
        check_rewrite(text, 2, 2)?;
        check_rewrite(text, 1, 6)?;
    }
    Ok(())
}

#[test]
fn text_block_equal_lengths_or_equal_flattened_text_do_not_imply_position_identity() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for replacements in [vec!["xy", "cd"], vec!["a", "bcd"], vec!["abcd"]] {
        let before = state(
            &context,
            vec![mixed(heading(2)?, "ab")?, mixed(heading(3)?, "cd")?],
            None,
            None,
        )?;
        let operation = TextBlockReplace::capture(
            &context,
            before.document(),
            range(0, 0, 1, 2)?,
            replacements
                .into_iter()
                .map(|text| block(heading(2)?, text, FormatSet::default()))
                .collect::<Result<_, _>>()?,
        )?;
        let commit = Transaction::new(&before, vec![Operation::TextBlockReplace(operation)])
            .apply(&context, &before)?
            .into_commit()
            .ok_or("commit")?;
        let point = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::After,
        };
        assert!(matches!(
            commit.relocation().relocate_point(&before, &point)?,
            PointRelocation::Deleted { .. }
        ));
    }
    Ok(())
}

proptest! {
    #[test]
    fn text_block_format_relocation_preserves_all_points_and_inverse(
        text in proptest::collection::vec(prop_oneof![Just('a'), Just('🙂'), Just('\u{301}'), Just('\u{200d}'), Just('א'), Just('\r'), Just('\n')], 1..16),
        rank in 1_u32..7, target in 1_u32..7,
    ) {
        let text: String = text.into_iter().collect();
        let result = check_rewrite(&text, rank, target);
        prop_assert!(result.is_ok(), "{result:?}");
    }
}
