use std::fmt;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId, LocalLogStorageChunkStart,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageMutationFenceBinding,
    LocalLogStorageSelectedBinding,
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
    local_log_storage_append_resolution_source_kind::LocalLogStorageAppendResolutionSourceKind,
};

/// One exact FIFO head undergoing request-correlated observational resolution.
///
/// The non-`Clone` owner retains the original queue-owning attempt state,
/// including the exact head and all follower allocations, speculative cursor,
/// token, limits, counters, and source correlation IDs. Beginning or inspecting
/// resolution performs no I/O and supplies no storage evidence.
/// Logical entries may continue to enqueue behind the immutable unresolved
/// head; that preserves both append-source and resolver-request correlation and
/// never exposes or authorizes a follower for physical dispatch.
///
/// Resolution is same-process and observational. This owner carries no storage
/// currentness, durability, transaction, writer, retry, acknowledgement, queue
/// removal, cursor-release, or follower-dispatch authority. Copied dispatches
/// from an earlier append or resolver invocation may still complete later.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendResolution>();
/// ```
///
/// The volatile owner has no persistence representation:
///
/// ```compile_fail
/// fn serialize(owner: &breditor_core::codec::LocalLogStorageAppendResolution) {
///     let _ = serde_json::to_string(owner);
/// }
/// ```
///
/// The retained queue and full clonable mutation binding stay core-private:
///
/// ```compile_fail
/// fn expose(owner: &breditor_core::codec::LocalLogStorageAppendResolution) {
///     let _ = owner.queue();
///     let _ = owner.expected_binding();
/// }
/// ```
///
/// A live resolver-request borrow prevents a concurrent consuming enqueue:
///
/// ```compile_fail
/// fn conflict(
///     mut owner: breditor_core::codec::LocalLogStorageAppendResolution,
///     entry: &breditor_core::local_log::LocalLogEntry,
/// ) {
///     let Ok(request) = owner.adapter_request() else { return };
///     let _step = owner.try_enqueue(entry);
///     drop(request);
/// }
/// ```
#[must_use = "an append storage resolution must be retained, requested, or resolved"]
pub struct LocalLogStorageAppendResolution {
    pub(super) source: LocalLogStorageAppendResolutionSource,
    pub(super) request_id: Option<LocalLogStorageAppendResolutionRequestId>,
}

impl LocalLogStorageAppendResolution {
    pub(super) const fn new(source: LocalLogStorageAppendResolutionSource) -> Self {
        Self { source, request_id: None }
    }

    /// Returns the exact attempt-state case retained by this owner.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageAppendResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the physical append-attempt identity retained by the source.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.source.attempt_id()
    }

    /// Returns the source append-request ID when that request reached egress.
    ///
    /// `None` is preserved for an uncertain or not-attempted source that never
    /// emitted its append request. It must not be interpreted as proof that no
    /// earlier copied dispatch for this exact queue head remains in flight.
    #[must_use]
    pub const fn source_append_request_id(&self) -> Option<&LocalLogStorageAppendRequestId> {
        self.source.append_request_id()
    }

    pub(super) const fn queue(&self) -> &LocalLogStorageAppendQueue {
        self.source.queue()
    }

    pub(super) const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        self.queue().expected_binding()
    }

    /// Returns the complete selected-envelope scalar binding to re-observe.
    #[must_use]
    pub const fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.expected_binding().selected_binding()
    }

    /// Returns whether this resolver invocation emitted its one request.
    #[must_use]
    pub const fn request_issued(&self) -> bool {
        self.request_id.is_some()
    }

    /// Returns the generation-relative start of the exact unresolved head.
    #[must_use]
    pub const fn head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.queue().head_chunk_start()
    }

    /// Returns the exclusive generation-relative end of the unresolved head.
    #[must_use]
    pub const fn head_frame_end(&self) -> u64 {
        self.queue().head_frame_end()
    }

    /// Returns the unresolved head's exact encoded byte length.
    #[must_use]
    pub fn head_frame_bytes(&self) -> usize {
        self.queue().head_frame_bytes()
    }

    /// Returns the exact count of queued frames, including this head.
    #[must_use]
    pub const fn pending_frames(&self) -> u64 {
        self.queue().pending_frames()
    }

    /// Returns the exact encoded bytes retained across all queued frames.
    #[must_use]
    pub const fn pending_bytes(&self) -> u64 {
        self.queue().pending_bytes()
    }
}

impl fmt::Debug for LocalLogStorageAppendResolution {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolution")
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("source_append_request_id", &self.source_append_request_id())
            .field("request_issued", &self.request_issued())
            .field("queue", self.queue())
            .finish_non_exhaustive()
    }
}
