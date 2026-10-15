//! Explicit empty-task Enter semantics, separate from splitting or dropping a rich tail.
use super::{
    OutdentTaskItems, RichActionError, RichEdit,
    list_helpers::{children, interval, is_text},
    task_list_helpers::task_list_node,
    text_patch::fragment,
};
use crate::{
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

/// Exit exactly one truly empty task by the same guarded promotion/unlist contract.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExitTaskItem {
    action: OutdentTaskItems,
}
impl ExitTaskItem {
    /// Exit only a single empty prose head with no trailing media, quote or nested flow.
    ///
    /// Nested tasks promote one level and retain completion. A top-level exit
    /// leaves the same paragraph/heading identity and kind; Undo retains the task
    /// identity and checked value. Supply a suffix ID iff both neighbors survive.
    ///
    /// # Errors
    /// Rejects non-task targets, nonempty heads, rich tails or missing/unused suffix IDs.
    pub fn capture(
        document: &RichDocument,
        container: &BlockId,
        item: &BlockId,
        fresh_tail: Option<&BlockId>,
    ) -> Result<Self, RichActionError> {
        let source = task_list_node(document, container)?;
        let (index, _) = interval(source, item, item)?;
        let body = children(&children(source)?[index])?;
        if body.len() != 1 || !is_text(&body[0]) || fragment(&body[0])?.utf16_len().get() != 0 {
            return Err(RichActionError::TaskNotEmpty);
        }
        Ok(Self { action: OutdentTaskItems::capture(document, container, item, item, fresh_tail)? })
    }
    /// Publish one whole empty-task exit with the outdent's exact inverse.
    ///
    /// # Errors
    /// Rejects stale branches, invalid resulting grammar or active host limits.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.action.apply(context, document)
    }
}
