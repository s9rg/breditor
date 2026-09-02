/// Valid later state of a generation that was previously active.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRetiredGenerationObservation {
    /// The later value reports the generation as retired.
    Retired,
    /// The later value reports reclaimed with immutable tombstone facts retained.
    Reclaimed,
}

impl LocalLogStorageRetiredGenerationObservation {
    /// Returns the exact storage-profile state spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Retired => "retired",
            Self::Reclaimed => "reclaimed",
        }
    }
}
