//! Native semantic lowering shared by local actions and causal commands, never browser planning.
use crate::{
    position::TextOffset,
    rich_content::{BlockId, CodeLanguage, RichFlowPosition, RichListKind, StandardInlineFormatV1},
};

/// Matched shortcut in the separately selected native Markdown-input policy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichInputRuleKind {
    /// One of the six heading ranks.
    Heading(u8),
    /// A bullet or a checked positive numbered start.
    List(RichListKind),
    /// One retained paragraph wrapped in a quote.
    Blockquote,
    /// One task, with an explicit initial completion value.
    Task(bool),
    /// Plain code with an optional inert native language token.
    Code(Option<CodeLanguage>),
    /// An atomic separator before the retained empty source paragraph.
    HorizontalRule,
    /// One standard inline format over the retained body characters.
    Inline(StandardInlineFormatV1),
    /// Optional typed autolink: a safe canonical link over the retained URL characters.
    Link,
    /// A list after an adjacent compatible list: one new item appended to that list.
    ListJoin(RichListKind),
    /// A task after an adjacent task list: one new task appended to that list.
    TaskJoin(bool),
    /// The first line of a top-level bullet item became one task (splitting the list).
    ListItemTask(bool),
    /// Enter after two empty trailing code lines: remove them and enter a fresh paragraph.
    CodeExit,
    /// Optional `typography-v1`: recognized characters replaced by their typographic form.
    Typography(super::RichTypographyRule),
}

/// Already planned scalar-safe edits, in dependent execution order.
/// These values are not an operation decoder, write authority or durable rule recipe.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichInputRuleStep {
    /// Remove only an observed literal marker interval from the source block.
    Delete {
        /// Inclusive UTF-16 start at this dependent step.
        start: TextOffset,
        /// Exclusive UTF-16 end at this dependent step.
        end: TextOffset,
    },
    /// Convert the retained source paragraph to this heading rank.
    Heading(u8),
    /// Wrap the retained source block in a freshly identified list and item.
    List {
        /// Fresh list wrapper.
        container: BlockId,
        /// Fresh item wrapper.
        item: BlockId,
        /// Exact bullet/numbered presentation.
        kind: RichListKind,
    },
    /// Wrap the source in this fresh quote identity.
    Blockquote(BlockId),
    /// Wrap the source in a freshly identified task list and item.
    Task {
        /// Fresh list identity.
        container: BlockId,
        /// Fresh task identity.
        item: BlockId,
        /// Explicit initial completion.
        checked: bool,
    },
    /// Convert to unformatted code without silently removing any retained formats.
    Code(Option<CodeLanguage>),
    /// Insert a fresh separator at a proved flow position, retaining navigation text.
    HorizontalRule {
        /// Fresh rule identity.
        block: BlockId,
        /// Source paragraph's direct flow position.
        position: RichFlowPosition,
    },
    /// Set one admitted standard format after both marker deletions.
    Inline {
        /// Inclusive body start after marker removal.
        start: TextOffset,
        /// Exclusive body end after marker removal.
        end: TextOffset,
        /// One property-free standard semantic identity.
        format: StandardInlineFormatV1,
    },
    /// Wrap the retained source through `last` in a fresh one-task list.
    TaskRange {
        /// Last flow sibling retained in the task body (non-prose tail).
        last: BlockId,
        /// Fresh task-list identity.
        container: BlockId,
        /// Fresh task identity.
        item: BlockId,
        /// Explicit initial completion.
        checked: bool,
    },
    /// Move one retained block subtree (identity and body unchanged).
    MoveBlock {
        /// Moved block.
        block: BlockId,
        /// Destination parent; `None` is the document root.
        parent: Option<BlockId>,
        /// Sibling before-anchor; `None` appends.
        before: Option<BlockId>,
    },
    /// Promote or unlist exactly one list item, retaining its complete body.
    OutdentListItem {
        /// Source list.
        container: BlockId,
        /// The single selected item.
        item: BlockId,
        /// Fresh suffix list identity exactly when items remain on both sides.
        fresh_tail: Option<BlockId>,
    },
    /// Promote exactly one nested task into its enclosing task list.
    OutdentTaskItem {
        /// Source task list.
        container: BlockId,
        /// The single selected task.
        item: BlockId,
    },
    /// Insert one fresh empty paragraph at a proved flow position.
    Paragraph {
        /// Fresh paragraph identity.
        block: BlockId,
        /// Flow position directly after the source block.
        position: RichFlowPosition,
    },
    /// Set one standard link (same window) over retained URL characters; no text changes.
    Link {
        /// Inclusive start of the linked candidate.
        start: TextOffset,
        /// Exclusive end; excluded trailing punctuation and the boundary follow it.
        end: TextOffset,
        /// Canonical safe HTTP(S) target admitted by the native link subset.
        href: String,
    },
    /// Insert replacement text with explicit formats (after a `Delete` of the typed characters).
    Insert {
        /// UTF-16 insertion offset at this dependent step.
        at: TextOffset,
        /// Nonempty replacement text.
        text: String,
        /// Exact formats of the replaced characters.
        formats: crate::document::FormatSet,
    },
}
