use super::{
    LocalLogStorageAttemptAborted, LocalLogStorageHostAttestedCommitted,
    LocalLogStorageNotAttempted, LocalLogStorageRootResolution,
    LocalLogStorageRootResolutionStartError, LocalLogStorageRootResolutionStartFailure,
    LocalLogStorageSelectionKind, LocalLogStorageUncertainAttempt,
    local_log_storage_root_resolution_source::LocalLogStorageRootResolutionSource,
};

fn try_begin<T>(
    owner: T,
    actual: LocalLogStorageSelectionKind,
    into_source: impl FnOnce(T) -> LocalLogStorageRootResolutionSource,
) -> Result<LocalLogStorageRootResolution, LocalLogStorageRootResolutionStartFailure<T>> {
    if actual != LocalLogStorageSelectionKind::Root {
        return Err(LocalLogStorageRootResolutionStartFailure::new(
            owner,
            LocalLogStorageRootResolutionStartError::SelectionKindMismatch { actual },
        ));
    }

    Ok(LocalLogStorageRootResolution::new(into_source(owner)))
}

impl LocalLogStorageUncertainAttempt {
    /// Begins observational root resolution while retaining this exact state.
    ///
    /// This consumes the source only after confirming its plan is a root. It
    /// performs no I/O, emits no request, and creates no storage evidence or
    /// retry authority.
    ///
    /// # Errors
    ///
    /// A rotation returns a failure containing this complete unchanged owner.
    pub fn try_begin_root_resolution(
        self,
    ) -> Result<LocalLogStorageRootResolution, LocalLogStorageRootResolutionStartFailure<Self>>
    {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRootResolutionSource::Uncertain)
    }
}

impl LocalLogStorageAttemptAborted {
    /// Begins observational root resolution while retaining this exact state.
    ///
    /// The physical abort is not plan-level noncommit evidence because copied
    /// dispatch may still publish. This transition performs no I/O and grants
    /// no retry authority.
    ///
    /// # Errors
    ///
    /// A rotation returns a failure containing this complete unchanged owner.
    pub fn try_begin_root_resolution(
        self,
    ) -> Result<LocalLogStorageRootResolution, LocalLogStorageRootResolutionStartFailure<Self>>
    {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRootResolutionSource::AttemptAborted)
    }
}

impl LocalLogStorageNotAttempted {
    /// Begins observational root resolution while retaining this exact state.
    ///
    /// A host-attested unattempted invocation does not exclude later copied
    /// dispatch. This transition performs no I/O and grants no retry authority.
    ///
    /// # Errors
    ///
    /// A rotation returns a failure containing this complete unchanged owner.
    pub fn try_begin_root_resolution(
        self,
    ) -> Result<LocalLogStorageRootResolution, LocalLogStorageRootResolutionStartFailure<Self>>
    {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRootResolutionSource::NotAttempted)
    }
}

impl LocalLogStorageHostAttestedCommitted {
    /// Begins observational root resolution while retaining this exact state.
    ///
    /// The historical host attestation is not current storage evidence and can
    /// never become retry authority. This transition performs no I/O and does
    /// not release any writer or successor owner.
    ///
    /// # Errors
    ///
    /// A rotation returns a failure containing this complete unchanged owner.
    pub fn try_begin_root_resolution(
        self,
    ) -> Result<LocalLogStorageRootResolution, LocalLogStorageRootResolutionStartFailure<Self>>
    {
        let actual = self.selection_kind();
        try_begin(self, actual, LocalLogStorageRootResolutionSource::HostAttestedCommitted)
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogStorageRootResolutionStartError, LocalLogStorageSelectionKind, try_begin};
    use crate::codec::LocalLogStorageRootResolutionStartErrorCode;

    struct TestOwner(Box<()>);

    #[test]
    fn rotation_rejection_preserves_the_exact_owner_allocation() {
        let owner = TestOwner(Box::new(()));
        let allocation = std::ptr::from_ref(owner.0.as_ref());
        let result = try_begin(owner, LocalLogStorageSelectionKind::Rotation, |_| {
            unreachable!("rotation must fail before source conversion")
        });
        assert!(result.is_err());
        let Err(failure) = result else { return };

        assert!(std::ptr::eq(failure.owner().0.as_ref(), allocation));
        assert_eq!(
            failure.error(),
            &LocalLogStorageRootResolutionStartError::SelectionKindMismatch {
                actual: LocalLogStorageSelectionKind::Rotation,
            }
        );
        assert_eq!(
            failure.code(),
            LocalLogStorageRootResolutionStartErrorCode::SelectionKindMismatch
        );
    }
}
