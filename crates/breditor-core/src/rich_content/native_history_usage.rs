//! Exact native capacity accounting for one independent resource.

/// Observed usage and ceiling in the units of the enclosing field.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
pub struct NativeHistoryUsage {
    /// Current exact usage.
    pub used: usize,
    /// Inclusive ceiling for the selected history family.
    pub limit: usize,
}
