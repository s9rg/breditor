//! One native trigger policy shared by planning and exclusive owner fast paths.

/// Whether one complete plain-input event can trigger the native Markdown policy.
///
/// This is only a recognition fast path, never a match, edit or source proof.
/// The planner still admits the current tree, caret, bounds and complete action group.
#[must_use]
pub fn is_rich_markdown_input_rule_trigger(input: &str) -> bool {
    matches!(input, " " | "*" | "_" | "~" | "`")
}
