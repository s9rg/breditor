use super::{
    LocalLogStorageAttemptAborted, LocalLogStorageHostAttestedCommitted,
    LocalLogStorageNotAttempted, LocalLogStorageRotationResolution,
    LocalLogStorageRotationResolutionStartError, LocalLogStorageRotationResolutionStartFailure,
    LocalLogStorageSelectionKind, LocalLogStorageUncertainAttempt,
    local_log_storage_rotation_resolution_source::LocalLogStorageRotationResolutionSource,
};

fn try_begin<T>(
    owner: T,
    actual: LocalLogStorageSelectionKind,
    into_source: impl FnOnce(T) -> LocalLogStorageRotationResolutionSource,
) -> Result<LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionStartFailure<T>> {
    if actual != LocalLogStorageSelectionKind::Rotation {
        return Err(LocalLogStorageRotationResolutionStartFailure::new(
            owner,
            LocalLogStorageRotationResolutionStartError::SelectionKindMismatch { actual },
        ));
    }

    Ok(LocalLogStorageRotationResolution::new(into_source(owner)))
}

impl LocalLogStorageUncertainAttempt {
    /// Begins observational rotation resolution while retaining this exact state.
    ///
    /// # Errors
    ///
    /// A root returns a failure containing this complete unchanged owner.
    pub fn try_begin_rotation_resolution(
        self,
    ) -> Result<
        LocalLogStorageRotationResolution,
        LocalLogStorageRotationResolutionStartFailure<Self>,
    > {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRotationResolutionSource::Uncertain)
    }
}

impl LocalLogStorageAttemptAborted {
    /// Begins observational rotation resolution while retaining this exact state.
    ///
    /// # Errors
    ///
    /// A root returns a failure containing this complete unchanged owner.
    pub fn try_begin_rotation_resolution(
        self,
    ) -> Result<
        LocalLogStorageRotationResolution,
        LocalLogStorageRotationResolutionStartFailure<Self>,
    > {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRotationResolutionSource::AttemptAborted)
    }
}

impl LocalLogStorageNotAttempted {
    /// Begins observational rotation resolution while retaining this exact state.
    ///
    /// # Errors
    ///
    /// A root returns a failure containing this complete unchanged owner.
    pub fn try_begin_rotation_resolution(
        self,
    ) -> Result<
        LocalLogStorageRotationResolution,
        LocalLogStorageRotationResolutionStartFailure<Self>,
    > {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRotationResolutionSource::NotAttempted)
    }
}

impl LocalLogStorageHostAttestedCommitted {
    /// Begins observational rotation resolution while retaining this exact state.
    ///
    /// Historical host commit attestation can never become retry authority.
    ///
    /// # Errors
    ///
    /// A root returns a failure containing this complete unchanged owner.
    pub fn try_begin_rotation_resolution(
        self,
    ) -> Result<
        LocalLogStorageRotationResolution,
        LocalLogStorageRotationResolutionStartFailure<Self>,
    > {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRotationResolutionSource::HostAttestedCommitted)
    }
}
