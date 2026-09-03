use std::{fmt, sync::Arc};

use crate::local_log::{LocalLogObservationOutcome, LocalLogStorageChunkStart};

use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageMutationToken, LocalLogTailCursor,
};

/// Checked speculative plan for one token-authorized storage append.
///
/// Preparation has already encoded exactly one complete Local Log Frame V1 and
/// atomically admitted those exact bytes into the owned cursor. The resulting
/// post-append cursor remains quarantined inside this plan: the transition is
/// speculative until a future request-correlated storage transaction compares
/// the token binding, appends the exact frame, and emits terminal completion.
/// One future storage chunk is exactly this one frame and its key component is
/// the frame's generation-relative starting byte offset.
///
/// This non-`Clone`, nonserializable value performs no I/O, proves no current
/// storage state or durability, and does not make the token a long-lived lock.
/// It intentionally has no public raw-frame or consuming parts accessor.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendPlan>();
/// ```
///
/// ```compile_fail
/// fn serialize(plan: &breditor_core::codec::LocalLogStorageAppendPlan) {
///     let _ = serde_json::to_string(plan);
/// }
/// ```
///
/// Raw encoded bytes are deliberately unavailable to public callers:
///
/// ```compile_fail
/// fn expose(plan: &breditor_core::codec::LocalLogStorageAppendPlan) -> &[u8] {
///     plan.frame()
/// }
/// ```
///
/// The private constructor prevents callers from forging checked plans:
///
/// ```compile_fail
/// fn forge(
///     token: breditor_core::codec::LocalLogStorageMutationToken,
///     cursor: breditor_core::codec::LocalLogTailCursor,
///     frame: std::sync::Arc<[u8]>,
///     start: breditor_core::local_log::LocalLogStorageChunkStart,
///     observation: breditor_core::local_log::LocalLogObservationOutcome,
/// ) {
///     let _ = breditor_core::codec::LocalLogStorageAppendPlan::new(
///         token,
///         cursor,
///         frame,
///         start,
///         1,
///         observation,
///     );
/// }
/// ```
#[must_use = "an append plan quarantines speculative state until storage completion"]
pub struct LocalLogStorageAppendPlan {
    token: LocalLogStorageMutationToken,
    speculative_cursor: LocalLogTailCursor,
    frame: Arc<[u8]>,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageAppendPlan {
    pub(super) const fn new(
        token: LocalLogStorageMutationToken,
        speculative_cursor: LocalLogTailCursor,
        frame: Arc<[u8]>,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self { token, speculative_cursor, frame, chunk_start, frame_end, observation }
    }

    /// Returns the retained revocable mutation authority.
    ///
    /// The token must be revalidated inside the future append transaction and
    /// is not made current merely by being retained in this plan.
    pub const fn token(&self) -> &LocalLogStorageMutationToken {
        &self.token
    }

    /// Returns the complete expected comparison binding for the future append.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        self.token.binding()
    }

    /// Returns the quarantined cursor after speculative exact-frame admission.
    ///
    /// Shared inspection grants no way to publish or continue this cursor. Its
    /// state is not durable until a later terminal contract releases it.
    #[must_use]
    pub const fn speculative_cursor(&self) -> &LocalLogTailCursor {
        &self.speculative_cursor
    }

    /// Returns the future chunk's generation-relative frame-start key.
    #[must_use]
    pub const fn chunk_start(&self) -> LocalLogStorageChunkStart {
        self.chunk_start
    }

    /// Returns the exclusive generation-relative byte offset after the frame.
    #[must_use]
    pub const fn frame_end(&self) -> u64 {
        self.frame_end
    }

    /// Returns the exact encoded frame byte length without exposing its bytes.
    #[must_use]
    pub fn frame_bytes(&self) -> usize {
        self.frame.len()
    }

    /// Returns the speculative semantic admission result.
    #[must_use]
    pub const fn observation_outcome(&self) -> LocalLogObservationOutcome {
        self.observation
    }
}

impl fmt::Debug for LocalLogStorageAppendPlan {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendPlan")
            .field("token", &self.token)
            .field("chunk_start", &self.chunk_start)
            .field("frame_end", &self.frame_end)
            .field("frame_bytes", &self.frame.len())
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}
