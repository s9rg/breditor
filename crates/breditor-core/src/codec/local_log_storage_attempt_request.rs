use std::fmt;

use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

use super::{
    LocalLogStorageSelectedBinding, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::{LocalLogStorageAttemptCandidate, LocalLogStorageAttemptPlan},
};

/// Borrowed payload-bearing adapter request for one exact physical attempt.
///
/// This enum can only be borrowed from an already
/// [`LocalLogStorageUncertainAttempt`](super::LocalLogStorageUncertainAttempt).
/// Its raw JSON contains complete document-bearing checkpoint payloads. It is
/// persistence data, not secret capability material, but callers must treat it
/// as sensitive application content and avoid diagnostics that print it.
/// One request view is for one adapter invocation and at most one associated
/// publication transaction. Copying its bytes into another dispatch does not
/// extend the attempt ID to that duplicate.
///
/// The request carries no adapter, writer token, mutable epoch, promise,
/// terminal evidence, checkpoint anchor, or writable successor owner.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAttemptRequest<'static>>();
/// ```
#[non_exhaustive]
#[must_use = "a borrowed storage-attempt request is intended for one adapter invocation"]
pub enum LocalLogStorageAttemptRequest<'a> {
    /// Initial root publication request.
    Root(LocalLogStorageRootAttemptRequest<'a>),
    /// Ordinary head-advancing rotation request.
    Rotation(LocalLogStorageRotationAttemptRequest<'a>),
}

impl<'a> LocalLogStorageAttemptRequest<'a> {
    pub(super) fn from_plan(
        plan: &'a LocalLogStorageAttemptPlan,
        request_id: &'a LocalLogStorageAttemptRequestId,
    ) -> Self {
        match plan.candidate() {
            LocalLogStorageAttemptCandidate::Root => {
                Self::Root(LocalLogStorageRootAttemptRequest {
                    request_id,
                    candidate_binding: plan.candidate_binding(),
                    candidate_json: plan.candidate_json(),
                })
            }
            LocalLogStorageAttemptCandidate::Rotation { context } => {
                Self::Rotation(LocalLogStorageRotationAttemptRequest {
                    request_id,
                    candidate_binding: plan.candidate_binding(),
                    candidate_json: plan.candidate_json(),
                    selected_binding: context.selected_binding(),
                    selected_current_json: context.current_selection_json(),
                    selected_predecessor_json: context.predecessor_selection_json(),
                })
            }
        }
    }

    /// Returns the current opaque process-local physical-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        match self {
            Self::Root(request) => request.attempt_id(),
            Self::Rotation(request) => request.attempt_id(),
        }
    }

    /// Returns the request-issued correlation required by terminal attestations.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageAttemptRequestId {
        match self {
            Self::Root(request) => request.request_id(),
            Self::Rotation(request) => request.request_id(),
        }
    }

    /// Returns whether the candidate is a root or rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        match self {
            Self::Root(_) => LocalLogStorageSelectionKind::Root,
            Self::Rotation(_) => LocalLogStorageSelectionKind::Rotation,
        }
    }

    /// Returns the prospective candidate transaction shape and incarnations.
    ///
    /// This is not evidence that a receipt exists.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        match self {
            Self::Root(request) => request.candidate_receipt(),
            Self::Rotation(request) => request.candidate_receipt(),
        }
    }

    /// Returns the complete strictly normalized prospective candidate binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBinding {
        match self {
            Self::Root(request) => request.candidate_binding(),
            Self::Rotation(request) => request.candidate_binding(),
        }
    }

    /// Returns the exact canonical candidate JSON for adapter persistence.
    #[must_use]
    pub fn candidate_json(&self) -> &str {
        match self {
            Self::Root(request) => request.candidate_json(),
            Self::Rotation(request) => request.candidate_json(),
        }
    }

    /// Returns the UTF-8 byte length of the exact candidate JSON.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.candidate_json().len()
    }
}

impl fmt::Debug for LocalLogStorageAttemptRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(request) => formatter.debug_tuple("Root").field(request).finish(),
            Self::Rotation(request) => formatter.debug_tuple("Rotation").field(request).finish(),
        }
    }
}

/// Borrowed, structurally complete initial-root adapter request.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootAttemptRequest<'static>>();
/// ```
#[must_use = "a borrowed root-attempt request is intended for one adapter invocation"]
pub struct LocalLogStorageRootAttemptRequest<'a> {
    request_id: &'a LocalLogStorageAttemptRequestId,
    candidate_binding: &'a LocalLogStorageSelectedBinding,
    candidate_json: &'a str,
}

impl<'a> LocalLogStorageRootAttemptRequest<'a> {
    /// Returns the current opaque process-local physical-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &'a LocalLogStorageAttemptId {
        self.request_id.attempt_id()
    }

    /// Returns the request-issued correlation required by terminal attestations.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageAttemptRequestId {
        self.request_id
    }

    /// Returns the prospective candidate transaction shape and incarnations.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &'a LocalLogStorageSelectionReceiptBinding {
        self.candidate_binding.current_receipt()
    }

    /// Returns the complete strictly normalized prospective candidate binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.candidate_binding
    }

    /// Returns the exact canonical Storage Root V1 candidate JSON.
    #[must_use]
    pub const fn candidate_json(&self) -> &'a str {
        self.candidate_json
    }
}

impl fmt::Debug for LocalLogStorageRootAttemptRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootAttemptRequest")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id)
            .field("candidate_binding", self.candidate_binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .finish_non_exhaustive()
    }
}

/// Borrowed, structurally complete ordinary-rotation adapter request.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRotationAttemptRequest<'static>>();
/// ```
#[must_use = "a borrowed rotation-attempt request is intended for one adapter invocation"]
pub struct LocalLogStorageRotationAttemptRequest<'a> {
    request_id: &'a LocalLogStorageAttemptRequestId,
    candidate_binding: &'a LocalLogStorageSelectedBinding,
    candidate_json: &'a str,
    selected_binding: &'a LocalLogStorageSelectedBinding,
    selected_current_json: &'a str,
    selected_predecessor_json: Option<&'a str>,
}

impl<'a> LocalLogStorageRotationAttemptRequest<'a> {
    /// Returns the current opaque process-local physical-attempt identity.
    #[must_use]
    pub const fn attempt_id(&self) -> &'a LocalLogStorageAttemptId {
        self.request_id.attempt_id()
    }

    /// Returns the request-issued correlation required by terminal attestations.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageAttemptRequestId {
        self.request_id
    }

    /// Returns the prospective candidate transaction shape and incarnations.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &'a LocalLogStorageSelectionReceiptBinding {
        self.candidate_binding.current_receipt()
    }

    /// Returns the complete strictly normalized prospective candidate binding.
    #[must_use]
    pub const fn candidate_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.candidate_binding
    }

    /// Returns the exact canonical Storage Generation V1 candidate JSON.
    #[must_use]
    pub const fn candidate_json(&self) -> &'a str {
        self.candidate_json
    }

    /// Returns the complete independently trusted selected scalar envelope.
    #[must_use]
    pub const fn selected_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.selected_binding
    }

    /// Returns the exact canonical currently selected root-or-rotation JSON.
    #[must_use]
    pub const fn selected_current_json(&self) -> &'a str {
        self.selected_current_json
    }

    /// Returns the exact immediate predecessor JSON when the selected value was
    /// itself a rotation.
    #[must_use]
    pub const fn selected_predecessor_json(&self) -> Option<&'a str> {
        self.selected_predecessor_json
    }
}

impl fmt::Debug for LocalLogStorageRotationAttemptRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationAttemptRequest")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id)
            .field("candidate_binding", self.candidate_binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .field("selected_binding", self.selected_binding)
            .field("selected_current_json_bytes", &self.selected_current_json.len())
            .field("selected_predecessor_json_bytes", &self.selected_predecessor_json.map(str::len))
            .finish_non_exhaustive()
    }
}
