use std::collections::BTreeSet;

use breditor_core::{
    document::Document, operation::Operation, position::NodePath, transaction::Commit,
};

pub(super) enum ProjectionImpact {
    None,
    TextContainers(Box<[u32]>),
    RootSplice { old_start: u32, old_end: u32, new_start: u32, new_end: u32 },
    Root,
}

impl ProjectionImpact {
    pub(super) const fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::TextContainers(_) => "textContainers",
            Self::RootSplice { .. } => "rootSplice",
            Self::Root => "root",
        }
    }

    pub(super) fn affected_paragraphs(&self) -> &[u32] {
        match self {
            Self::TextContainers(paragraphs) => paragraphs,
            Self::None | Self::RootSplice { .. } | Self::Root => &[],
        }
    }

    pub(super) const fn root_splice(&self) -> Option<(u32, u32, u32, u32)> {
        match self {
            Self::RootSplice { old_start, old_end, new_start, new_end } => {
                Some((*old_start, *old_end, *new_start, *new_end))
            }
            Self::None | Self::TextContainers(_) | Self::Root => None,
        }
    }
}

pub(super) fn classify(commit: &Commit) -> ProjectionImpact {
    if commit.before().document() == commit.after().document() {
        return ProjectionImpact::None;
    }

    if let Some(paragraphs) = text_container_impact(commit) {
        return ProjectionImpact::TextContainers(paragraphs);
    }

    if let Some((old_start, old_end, new_start, new_end)) = root_splice_impact(commit) {
        return ProjectionImpact::RootSplice { old_start, old_end, new_start, new_end };
    }

    ProjectionImpact::Root
}

fn text_container_impact(commit: &Commit) -> Option<Box<[u32]>> {
    let operations = commit.forward_operations();
    let changes = commit.changes();
    if operations.is_empty()
        || operations.len() != changes.len()
        || !operations.iter().all(|operation| matches!(operation, Operation::TextSplice(_)))
    {
        return None;
    }

    let mut paragraphs = BTreeSet::new();
    for change in changes {
        let text = change.as_text()?;
        let path = text.container_path();
        if !is_direct_root_paragraph(commit.before().document(), path)
            || !is_direct_root_paragraph(commit.after().document(), path)
        {
            return None;
        }
        paragraphs.insert(path.last_index()?);
    }
    (!paragraphs.is_empty()).then(|| paragraphs.into_iter().collect::<Vec<_>>().into_boxed_slice())
}

fn root_splice_impact(commit: &Commit) -> Option<(u32, u32, u32, u32)> {
    if commit.forward_operations().len() != 1 || commit.changes().len() != 1 {
        return None;
    }
    let change = commit.changes().iter().next()?.as_children()?;
    if !change.parent_path().is_root() {
        return None;
    }

    let old_range = change.old_child_range();
    let new_range = change.new_child_range();
    if !valid_root_range(commit.before().document(), old_range.start(), old_range.end())
        || !valid_root_range(commit.after().document(), new_range.start(), new_range.end())
    {
        return None;
    }
    Some((old_range.start(), old_range.end(), new_range.start(), new_range.end()))
}

fn is_direct_root_paragraph(document: &Document, path: &NodePath) -> bool {
    path.len() == 1
        && document
            .node_at(path)
            .ok()
            .and_then(|node| node.as_element())
            .is_some_and(|element| element.kind().as_str() == "breditor/paragraph")
}

fn valid_root_range(document: &Document, start: u32, end: u32) -> bool {
    if start > end {
        return false;
    }
    document
        .root()
        .as_element()
        .is_some_and(|root| usize::try_from(end).is_ok_and(|end| end <= root.children().len()))
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use breditor_core::{
        codec::DocumentJsonCodec,
        document::{FormatSet, TextFragment, TextRun},
        operation::{ParagraphJoin, ParagraphSplit, TextRange, TextSplice},
        position::{NodePath, TextOffset},
        state::{EditorContext, EditorState, LineageId},
        transaction::{Commit, Transaction},
    };

    use super::{ProjectionImpact, classify};

    type TestResult<T = ()> = Result<T, Box<dyn Error>>;

    const TEXT_DOCUMENT_JSON: &str = r#"{
      "format":"breditor/document","formatVersion":1,
      "schema":{"name":"breditor/base","version":1},
      "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
        "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
          "properties":{},"children":[{"kind":"text","text":"ab","formats":[]}]}]}
    }"#;

    const TWO_PARAGRAPH_DOCUMENT_JSON: &str = r#"{
      "format":"breditor/document","formatVersion":1,
      "schema":{"name":"breditor/base","version":1},
      "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
        "children":[
          {"kind":"element","type":"breditor/paragraph","entityId":null,
            "properties":{},"children":[{"kind":"text","text":"ab","formats":[]}]},
          {"kind":"element","type":"breditor/paragraph","entityId":null,
            "properties":{},"children":[{"kind":"text","text":"cd","formats":[]}]}
        ]}
    }"#;

    #[test]
    fn multi_operation_structural_change_fails_closed_to_root() -> TestResult {
        let (context, initial) = text_state("projection-impact-structural")?;
        let first = ParagraphSplit::capture(
            &context,
            initial.document(),
            direct_root_path(0)?,
            TextOffset::try_new(1)?,
        )?;
        let intermediate = committed(
            Transaction::new(&initial, vec![first.clone().into()]).apply(&context, &initial)?,
        )?;
        let second = ParagraphSplit::capture(
            &context,
            intermediate.after().document(),
            direct_root_path(1)?,
            TextOffset::try_new(1)?,
        )?;
        let commit = committed(
            Transaction::new(&initial, vec![first.into(), second.into()])
                .apply(&context, &initial)?,
        )?;

        assert!(matches!(classify(&commit), ProjectionImpact::Root));
        Ok(())
    }

    #[test]
    fn document_round_trip_is_none_even_with_structural_changes() -> TestResult {
        let (context, initial) = text_state("projection-impact-round-trip")?;
        let split = ParagraphSplit::capture(
            &context,
            initial.document(),
            direct_root_path(0)?,
            TextOffset::try_new(1)?,
        )?;
        let intermediate = committed(
            Transaction::new(&initial, vec![split.clone().into()]).apply(&context, &initial)?,
        )?;
        let join = ParagraphJoin::capture(
            &context,
            intermediate.after().document(),
            direct_root_path(0)?,
        )?;
        let commit = committed(
            Transaction::new(&initial, vec![split.into(), join.into()])
                .apply(&context, &initial)?,
        )?;

        assert_eq!(commit.before().document(), commit.after().document());
        assert!(matches!(classify(&commit), ProjectionImpact::None));
        Ok(())
    }

    #[test]
    fn text_container_indexes_are_sorted_and_deduplicated() -> TestResult {
        let (context, initial) =
            state_from_json("projection-impact-multiple-text", TWO_PARAGRAPH_DOCUMENT_JSON)?;
        let second_first = insert_at(&context, &initial, 1, 0, "x")?;
        let after_first = committed(
            Transaction::new(&initial, vec![second_first.clone().into()])
                .apply(&context, &initial)?,
        )?
        .after()
        .clone();
        let first = insert_at(&context, &after_first, 0, 0, "y")?;
        let after_second = committed(
            Transaction::new(&after_first, vec![first.clone().into()])
                .apply(&context, &after_first)?,
        )?
        .after()
        .clone();
        let second_again = insert_at(&context, &after_second, 1, 1, "z")?;
        let commit = committed(
            Transaction::new(
                &initial,
                vec![second_first.into(), first.into(), second_again.into()],
            )
            .apply(&context, &initial)?,
        )?;

        let ProjectionImpact::TextContainers(indexes) = classify(&commit) else {
            return Err(io::Error::other("text-only commit did not retain narrow impact").into());
        };
        assert_eq!(&*indexes, &[0, 1]);
        Ok(())
    }

    fn text_state(lineage: &str) -> TestResult<(EditorContext, EditorState)> {
        state_from_json(lineage, TEXT_DOCUMENT_JSON)
    }

    fn state_from_json(
        lineage: &str,
        document_json: &str,
    ) -> TestResult<(EditorContext, EditorState)> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(document_json)?;
        let state =
            EditorState::try_new(&context, LineageId::try_new(lineage)?, document, None, None)?;
        Ok((context, state))
    }

    fn insert_at(
        context: &EditorContext,
        state: &EditorState,
        paragraph: u32,
        offset: u32,
        text: &str,
    ) -> TestResult<TextSplice> {
        let offset = TextOffset::try_new(u64::from(offset))?;
        let range = TextRange::try_new(direct_root_path(paragraph)?, offset, offset)?;
        let replacement = TextFragment::from(TextRun::try_new(text, FormatSet::default())?);
        TextSplice::capture(context, state.document(), range, replacement).map_err(Into::into)
    }

    fn direct_root_path(index: u32) -> TestResult<NodePath> {
        NodePath::try_from_indices(vec![index]).map_err(Into::into)
    }

    fn committed(outcome: breditor_core::transaction::TransactionOutcome) -> TestResult<Commit> {
        outcome
            .into_commit()
            .ok_or_else(|| io::Error::other("transaction unexpectedly unchanged").into())
    }
}
