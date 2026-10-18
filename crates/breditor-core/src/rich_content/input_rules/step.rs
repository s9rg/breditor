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
}
