//! Payload-free result of one exclusive typing-plus-shortcut call.

/// Literal input and an optional shortcut are separate native history groups.
///
/// An outer `Err` always means typing did not commit. `Refused` is instead a
/// successful input result: keep the literal text, report the refusal, and never
/// retry the input. No document text or admission-error payload is exposed here.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichInputRuleOutcome {
    /// Empty input; no rule was attempted and all owner state is unchanged.
    Unchanged,
    /// Literal input committed; no shortcut matched.
    Inserted,
    /// Literal input committed and one isolated shortcut group followed it.
    Applied,
    /// Literal input committed; shortcut planning or complete admission refused.
    Refused,
}

impl RichInputRuleOutcome {
    /// Stable payload-free readout, not a persisted command or history version.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unchanged => "unchanged",
            Self::Inserted => "inserted",
            Self::Applied => "applied",
            Self::Refused => "refused",
        }
    }
}
