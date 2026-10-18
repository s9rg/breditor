//! Explicit native Markdown shortcuts, not a Markdown parser or a new history protocol.
//!
//! The host submits a local plain-input trigger after retaining the literal input.
//! One separately guarded transformation then has its own exact Undo group.
//! Remote updates, paste, replacement and composition never invoke this policy implicitly.

mod block_rule;
mod error;
mod inline_rule;
mod outcome;
mod plan;
mod source;
mod step;

pub use error::RichInputRuleError;
pub use outcome::RichInputRuleOutcome;
pub use plan::{RichInputRulePlan, plan_rich_markdown_input_rule};
pub use step::{RichInputRuleKind, RichInputRuleStep};

/// Bounded trailing inline recognition window in original scalar-aligned UTF-16 units.
/// Block-prefix rules require the complete prefix, never a truncated suffix.
pub const RICH_INPUT_RULE_WINDOW_UTF16: u64 = 4096;
/// Maximum formatted runs inspected in one source block before explicit refusal.
pub const RICH_INPUT_RULE_MAX_RUNS: usize = 8192;
