use super::{
    LocalLogStorageAppendAttemptAborted, LocalLogStorageAppendNotAttempted,
    LocalLogStorageAppendResolution, LocalLogStorageUncertainAppendAttempt,
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
};

impl LocalLogStorageUncertainAppendAttempt {
    /// Begins same-process observational resolution of this exact queue head.
    ///
    /// The complete source owner and queue are moved unchanged. This performs
    /// no I/O, emits no request, and creates no evidence, acknowledgement, or
    /// retry authority.
    #[must_use = "the resolution owner retains this uncertain append and its queue"]
    pub fn begin_append_resolution(self) -> LocalLogStorageAppendResolution {
        LocalLogStorageAppendResolution::new(LocalLogStorageAppendResolutionSource::Uncertain(self))
    }
}

impl LocalLogStorageAppendAttemptAborted {
    /// Begins same-process observational resolution of this exact queue head.
    ///
    /// The physical abort does not exclude a copied uncorrelated dispatch. The
    /// complete source owner and queue move unchanged and no retry authority is
    /// granted.
    #[must_use = "the resolution owner retains this aborted append and its queue"]
    pub fn begin_append_resolution(self) -> LocalLogStorageAppendResolution {
        LocalLogStorageAppendResolution::new(LocalLogStorageAppendResolutionSource::AttemptAborted(
            self,
        ))
    }
}

impl LocalLogStorageAppendNotAttempted {
    /// Begins same-process observational resolution of this exact queue head.
    ///
    /// A not-attempted invocation does not exclude a copied dispatch from an
    /// earlier exact attempt. The complete source owner and queue move unchanged
    /// and no retry authority is granted.
    #[must_use = "the resolution owner retains this unattempted append and its queue"]
    pub fn begin_append_resolution(self) -> LocalLogStorageAppendResolution {
        LocalLogStorageAppendResolution::new(LocalLogStorageAppendResolutionSource::NotAttempted(
            self,
        ))
    }
}
