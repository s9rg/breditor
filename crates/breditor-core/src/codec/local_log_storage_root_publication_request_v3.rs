use std::fmt;

use crate::local_log::LocalLogStorageAttemptRequestId;

use super::{
    LocalLogStorageAttemptTransitionError, LocalLogStorageRootPublicationAttemptV3,
    LocalLogStorageSelectedBindingV3,
};

/// Borrowed, single-invocation Root V3 payload and complete prospective binding.
///
/// The borrow prevents consuming the uncertain owner while this view is live.
/// The host must limit the token to one publication-capable transaction. Rust
/// cannot prevent copying JSON or tokens; dispatching copies is outside this
/// correlation contract. Issuance proves neither dispatch nor publication.
///
/// ```compile_fail
/// fn consume_while_borrowed(mut attempt: breditor_core::codec::LocalLogStorageRootPublicationAttemptV3) {
///     let request = attempt.adapter_request().unwrap();
///     drop(attempt);
///     let _ = request.candidate_json();
/// }
/// ```
pub struct LocalLogStorageRootPublicationRequestV3<'a> {
    binding: &'a LocalLogStorageSelectedBindingV3,
    candidate_json: &'a str,
    request_id: &'a LocalLogStorageAttemptRequestId,
}

impl LocalLogStorageRootPublicationRequestV3<'_> {
    /// Returns the exact canonical Root V3 payload validated during preparation.
    #[must_use]
    pub const fn candidate_json(&self) -> &str {
        self.candidate_json
    }

    /// Returns all prospective facts, including host-selected incarnations.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBindingV3 {
        self.binding
    }

    /// Returns volatile correlation to retain for the transaction terminal event.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageAttemptRequestId {
        self.request_id
    }
}

impl fmt::Debug for LocalLogStorageRootPublicationRequestV3<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LocalLogStorageRootPublicationRequestV3")
            .field("binding", &self.binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .field("request_id", &self.request_id)
            .finish_non_exhaustive()
    }
}

impl LocalLogStorageRootPublicationAttemptV3 {
    /// Issues at most one payload view after recording its request identity.
    ///
    /// Even dropping this view without dispatch does not permit another issue.
    ///
    /// # Errors
    ///
    /// Returns `RequestAlreadyBorrowed` without changing the owner when its
    /// one request view has already been issued.
    pub fn adapter_request(
        &mut self,
    ) -> Result<LocalLogStorageRootPublicationRequestV3<'_>, LocalLogStorageAttemptTransitionError>
    {
        if self.request_id.is_some() {
            return Err(LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed);
        }
        let request_id =
            self.request_id.insert(LocalLogStorageAttemptRequestId::new(&self.attempt_id));
        Ok(LocalLogStorageRootPublicationRequestV3 {
            binding: self.plan.candidate_binding(),
            candidate_json: &self.plan.candidate_json,
            request_id,
        })
    }
}
