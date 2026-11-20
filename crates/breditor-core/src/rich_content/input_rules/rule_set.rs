//! Explicitly selected native input-rule sets; a host opt-in, never a saved document setting.

/// Which native input-rule policies one exclusive typing call may apply.
///
/// The empty set applies nothing. Selection is per call; checkpoints record only
/// admitted edits, so reopening without a set keeps literal input.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash)]
pub struct RichInputRuleSet {
    markdown: bool,
    autolink: bool,
}

impl RichInputRuleSet {
    /// No rule.
    pub const NONE: Self = Self { markdown: false, autolink: false };
    /// The original bounded Markdown shortcut policy (`markdown-v1`).
    pub const MARKDOWN_V1: Self = Self { markdown: true, autolink: false };
    /// Typed URL autolinking through the native safe link subset (`autolink-v1`).
    pub const AUTOLINK_V1: Self = Self { markdown: false, autolink: true };

    /// Both selections combined.
    #[must_use]
    pub const fn union(self, other: Self) -> Self {
        Self {
            markdown: self.markdown || other.markdown,
            autolink: self.autolink || other.autolink,
        }
    }
    /// Whether Markdown shortcuts are selected.
    #[must_use]
    pub const fn markdown(self) -> bool {
        self.markdown
    }
    /// Whether typed autolinking is selected.
    #[must_use]
    pub const fn autolink(self) -> bool {
        self.autolink
    }
    /// Whether no rule is selected.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        !self.markdown && !self.autolink
    }
    /// Recognition fast path for one complete plain-input event under this set.
    ///
    /// Autolink triggers only on one ASCII space; Enter uses its separate split call.
    /// Markdown additionally treats one retained line feed (`"\n"`, a code-block Enter
    /// routed through the exclusive call) as its conventional code-exit trigger.
    #[must_use]
    pub fn is_trigger(self, input: &str) -> bool {
        self.markdown && (super::is_rich_markdown_input_rule_trigger(input) || input == "\n")
            || self.autolink && input == " "
    }
}
