/// Profile-valid change between one selected binding and a later observation.
///
/// Selection identity and every immutable receipt/generation fact remain
/// exact. The only mutable fact represented by a selected binding is cleanup
/// state for a rotation checkpoint generation.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedBindingChange {
    /// The complete selected binding is field-for-field structurally unchanged.
    Unchanged,
    /// The later value reports reclaimed after a retired checkpoint snapshot.
    CheckpointReclaimed,
}

impl LocalLogStorageSelectedBindingChange {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unchanged => "unchanged",
            Self::CheckpointReclaimed => "checkpoint_reclaimed",
        }
    }
}
