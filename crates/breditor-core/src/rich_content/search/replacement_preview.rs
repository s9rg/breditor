//! Linear text assembly and one final admission of a private local candidate tree.
//!
//! This is a local preview, never a shared root-register or whole-block operation.
use super::{RichSearchError, RichSearchReplacePlan, RichSearchTextEdit};
use crate::{
    document::{Children, Document, FormatSet, NodeRef, TextRun},
    rich_content::RichDocument,
    state::EditorContext,
};
use std::collections::BTreeMap;

impl RichSearchReplacePlan {
    /// Build a private candidate under the receiving schema and active limits.
    ///
    /// Unchanged text, node identities, properties and structures survive. Changed
    /// branches are assembled once and only the complete final tree is admitted:
    /// a temporary growth-before-deletion cannot reject an otherwise valid result.
    /// No content, selection, revision or history is published by this pure method.
    /// # Errors
    /// Rejects stale/foreign source, incompatible context, invalid final resource
    /// bounds or a contradiction of the captured original coordinates.
    pub fn preview(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<RichDocument, RichSearchError> {
        self.validate_for(document)?;
        if context.schema().fingerprint() != document.document().schema_fingerprint() {
            return Err(RichSearchError::Binding);
        }
        // A native replacement plan is one compound semantic operation. Its
        // independent match/expansion ceilings do not widen ordinary batches.
        if !self.edits.is_empty() && context.max_operations_per_transaction() == 0 {
            return Err(RichSearchError::Admission);
        }
        let mut branches = Branches::default();
        let mut start = 0;
        while start < self.edits.len() {
            let block = &self.edits[start].block;
            let end = start + self.edits[start..].partition_point(|edit| &edit.block == block);
            let path = document.block_path(block).ok_or(RichSearchError::Invariant)?;
            let node = document.document().node_at(path).map_err(|_| RichSearchError::Invariant)?;
            branches.insert(path.as_slice(), replace_body(node, &self.edits[start..end])?)?;
            start = end;
        }
        let root = branches.rebuild(document.document().root())?;
        let candidate = Document::try_new(context.schema(), root, context.limits())
            .map_err(|_| RichSearchError::Admission)?;
        let candidate = RichDocument::try_admit(context.schema(), candidate, context.limits())
            .map_err(|_| RichSearchError::Admission)?;
        if candidate.id() != document.id() {
            return Err(RichSearchError::Invariant);
        }
        Ok(candidate)
    }
}

#[derive(Default)]
struct Branches {
    replacement: Option<NodeRef>,
    children: BTreeMap<u32, Self>,
}
impl Branches {
    fn insert(&mut self, path: &[u32], node: NodeRef) -> Result<(), RichSearchError> {
        let mut branch = self;
        for index in path {
            if branch.replacement.is_some() {
                return Err(RichSearchError::Invariant);
            }
            branch = branch.children.entry(*index).or_default();
        }
        if branch.replacement.is_some() || !branch.children.is_empty() {
            return Err(RichSearchError::Invariant);
        }
        branch.replacement = Some(node);
        Ok(())
    }
    // Only admitted paths participate; the existing fixed structural depth bound applies.
    fn rebuild(&self, node: &NodeRef) -> Result<NodeRef, RichSearchError> {
        if let Some(replacement) = &self.replacement {
            return Ok(replacement.clone());
        }
        if self.children.is_empty() {
            return Ok(node.clone());
        }
        let element = node.as_element().ok_or(RichSearchError::Invariant)?;
        let mut children = element.children().to_vec();
        for (index, branch) in &self.children {
            let child = children
                .get_mut(usize::try_from(*index).map_err(|_| RichSearchError::Invariant)?)
                .ok_or(RichSearchError::Invariant)?;
            *child = branch.rebuild(child)?;
        }
        Ok(NodeRef::element(
            element.try_with_children(children).map_err(|_| RichSearchError::Invariant)?,
        ))
    }
}

#[derive(Default)]
struct RunBuilder {
    runs: Vec<TextRun>,
    pending: String,
    formats: FormatSet,
}
impl RunBuilder {
    fn append(&mut self, text: &str, formats: &FormatSet) -> Result<(), RichSearchError> {
        if text.is_empty() {
            return Ok(());
        }
        if self.formats != *formats {
            self.flush()?;
            self.formats = formats.clone();
        }
        self.pending.push_str(text);
        Ok(())
    }
    fn flush(&mut self) -> Result<(), RichSearchError> {
        if !self.pending.is_empty() {
            self.runs.push(
                TextRun::try_new(std::mem::take(&mut self.pending), self.formats.clone())
                    .map_err(|_| RichSearchError::Admission)?,
            );
        }
        Ok(())
    }
    fn finish(mut self) -> Result<Vec<NodeRef>, RichSearchError> {
        self.flush()?;
        Ok(self.runs.into_iter().map(TextRun::into_text_node).map(NodeRef::text).collect())
    }
}

struct Cursor<'a> {
    children: &'a Children,
    index: usize,
    local: usize,
    absolute: usize,
}
impl Cursor<'_> {
    fn until(
        &mut self,
        end: usize,
        retain: bool,
        output: &mut RunBuilder,
    ) -> Result<(), RichSearchError> {
        if end < self.absolute {
            return Err(RichSearchError::Invariant);
        }
        while self.absolute < end {
            let run = self
                .children
                .get(self.index)
                .and_then(NodeRef::as_text)
                .ok_or(RichSearchError::Invariant)?;
            let count = (end - self.absolute).min(run.text().len() - self.local);
            let text =
                run.text().get(self.local..self.local + count).ok_or(RichSearchError::Invariant)?;
            if retain {
                output.append(text, run.formats())?;
            }
            self.local += count;
            self.absolute += count;
            if self.local == run.text().len() {
                self.local = 0;
                self.index += 1;
            }
        }
        Ok(())
    }
}

fn replace_body(node: &NodeRef, edits: &[RichSearchTextEdit]) -> Result<NodeRef, RichSearchError> {
    let element = node.as_element().ok_or(RichSearchError::Invariant)?;
    let length = element.children().iter().try_fold(0usize, |length, child| {
        length
            .checked_add(child.as_text().ok_or(RichSearchError::Invariant)?.text().len())
            .ok_or(RichSearchError::Invariant)
    })?;
    let mut cursor = Cursor { children: element.children(), index: 0, local: 0, absolute: 0 };
    let mut output = RunBuilder::default();
    for edit in edits {
        cursor.until(edit.bytes.start, true, &mut output)?;
        cursor.until(edit.bytes.end, false, &mut output)?;
        for run in &edit.inserted {
            output.append(run.text(), run.formats())?;
        }
    }
    cursor.until(length, true, &mut output)?;
    Ok(NodeRef::element(
        element.try_with_children(output.finish()?).map_err(|_| RichSearchError::Invariant)?,
    ))
}
