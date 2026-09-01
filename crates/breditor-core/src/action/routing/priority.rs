use std::fmt;

/// Explicit priority of one binding within its declared intent.
///
/// Larger signed values run first. Equal values within one intent reject router
/// construction, so identity or registration order never becomes a hidden
/// tie-breaker.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BindingPriority(i32);

impl BindingPriority {
    /// Creates a binding priority from its fixed-width signed value.
    #[must_use]
    pub const fn new(value: i32) -> Self {
        Self(value)
    }

    /// Returns the fixed-width signed value.
    #[must_use]
    pub const fn get(self) -> i32 {
        self.0
    }
}

impl From<i32> for BindingPriority {
    fn from(value: i32) -> Self {
        Self::new(value)
    }
}

impl fmt::Display for BindingPriority {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}
