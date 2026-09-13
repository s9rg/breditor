use std::{fmt, sync::Arc};

use crate::schema::DurableSchemaBinding;

use super::{
    LocalLogStorageAttemptPreparationError, LocalLogStorageSelectedBindingV3,
    LocalLogStorageSelectedRootV3, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
};

/// Closed, byte-exact preparation for a prospective Storage Root V3 publication.
///
/// This non-Clone owner retains canonical candidate bytes and the complete V3
/// binding, including host-supplied database and planned scope incarnations.
/// It has no request, dispatch, terminal-evidence, writer, or I/O interface.
/// Preparation neither reserves identities nor proves an empty/current scope.
/// Equivalent plans can be prepared again from the original borrowed inputs.
///
/// Raw document-bearing bytes are deliberately unavailable until a separately
/// specified V3 dispatch lifecycle can account for uncertainty and retries.
/// The reconstructed validation checkpoint is not retained by this plan.
/// Hiding payloads enforces API ordering, not secrecy: the original selection
/// remains independently serializable.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootPublicationPlanV3>();
/// ```
///
/// ```compile_fail
/// fn cannot_dispatch(plan: &mut breditor_core::codec::LocalLogStorageRootPublicationPlanV3) {
///     let _ = plan.adapter_request();
/// }
/// ```
#[must_use = "a root publication plan must be retained or deliberately discarded"]
pub struct LocalLogStorageRootPublicationPlanV3 {
    binding: LocalLogStorageSelectedBindingV3,
    candidate_json: Arc<str>,
}

impl LocalLogStorageRootPublicationPlanV3 {
    pub(super) fn from_normalized(
        normalized: LocalLogStorageSelectedRootV3,
        binding: LocalLogStorageSelectedBindingV3,
    ) -> Result<Self, LocalLogStorageAttemptPreparationError> {
        let (retained_binding, candidate_json, predecessor_json) =
            normalized.into_publication_envelope();
        if retained_binding != *binding.inner()
            || binding.current_receipt().selection_kind() != LocalLogStorageSelectionKind::Root
            || binding.predecessor_receipt().is_some()
            || predecessor_json.is_some()
        {
            return Err(LocalLogStorageAttemptPreparationError::RuntimeInvariant {
                kind: LocalLogStorageSelectionKind::Root,
            });
        }
        Ok(Self { binding, candidate_json })
    }

    /// Returns the exact durable schema identity used during validation.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        self.binding.schema_binding()
    }

    /// Returns prospective V3 facts, not a committed receipt or writer capability.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBindingV3 {
        &self.binding
    }

    /// Returns the prospective receipt and host-selected incarnations.
    #[must_use]
    pub const fn candidate_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.binding.current_receipt()
    }

    /// Returns the retained canonical root JSON's UTF-8 byte length.
    #[must_use]
    pub fn candidate_json_bytes(&self) -> usize {
        self.candidate_json.len()
    }

    /// Compares complete prospective bindings and exact bytes, not publication status.
    ///
    /// Equal candidate JSON alone is insufficient: database and planned scope
    /// incarnations are host facts absent from that JSON. This comparison does
    /// not authorize retries, reuse an attempt ID, or attest durable equality.
    #[must_use]
    pub fn same_plan_as(&self, other: &Self) -> bool {
        self.binding == other.binding && self.candidate_json == other.candidate_json
    }
}

impl fmt::Debug for LocalLogStorageRootPublicationPlanV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootPublicationPlanV3")
            .field("binding", &self.binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .finish_non_exhaustive()
    }
}
