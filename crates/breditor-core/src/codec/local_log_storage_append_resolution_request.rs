use std::fmt;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId, LocalLogStorageChunkStart, LocalLogStorageFenceId,
    LocalLogStorageWriterEpoch,
};

use super::{
    LocalLogFrameLimits, LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedBinding,
    local_log_storage_append_resolution_source::LocalLogStorageAppendResolutionSource,
    local_log_storage_append_resolution_source_kind::LocalLogStorageAppendResolutionSourceKind,
};

/// Borrowed observational request for one append resolver invocation.
///
/// Under `IndexedDB` Storage Profile V1, the adapter must open one `readonly`
/// transaction scoped to exactly `meta`, `scopes`, `transactions`,
/// `generations`, and `chunks`, with no durability option. It independently
/// reads and normalizes the selected envelope and authoritative current-head
/// index, captures the current
/// writer pair, validates the observed profile graph and active-generation
/// frame policy, retains exact observed selection JSON for later core
/// comparison, and scans the complete selected active-generation chunk prefix.
/// The host reports physical facts; the core relates them to the expected
/// binding, including legitimate later writer-fence movement. The exact
/// overlapping store scope schedules this stable snapshot after earlier
/// writers and before later writers. `readonly` both enforces the resolver's
/// no-write boundary and permits compatible concurrent readers.
///
/// Only observations from that exact transaction after it emits `complete`
/// may become ordinary resolution evidence. Request success, a completed
/// cursor scan without transaction completion, or a later separate read does
/// not qualify. Database-open absence is a separate narrowly defined evidence
/// path because no transaction can exist in that case.
///
/// The expected head bytes remain private inside the owner. The request exposes
/// only their key, end, and length; resolution evidence must instead own the
/// independently observed target bytes for a comparison inside the core. The
/// retained expected current and predecessor selection JSON likewise stay
/// private: the request exposes only their lengths, while evidence owns exact
/// observed JSON. This prevents the resolver from becoming an append-dispatch
/// or expected-payload disclosure surface.
///
/// A host may copy exposed metadata and dispatch reads more than once. The
/// one-shot borrow is API hygiene, not single-dispatch proof. Only exact
/// resolution-request correlation can close this invocation.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendResolutionRequest<'static>>();
/// ```
///
/// A resolver request cannot expose or redispatch expected head bytes:
///
/// ```compile_fail
/// fn expose(request: &breditor_core::codec::LocalLogStorageAppendResolutionRequest<'_>) {
///     let _ = request.head_frame();
/// }
/// ```
///
/// Expected selection JSON also remains private to the resolution owner:
///
/// ```compile_fail
/// fn expose_selection(
///     request: &breditor_core::codec::LocalLogStorageAppendResolutionRequest<'_>,
/// ) {
///     let _ = request.current_selection_json();
/// }
/// ```
///
/// The complete clonable mutation binding also remains core-private, because
/// composing it with the acquisition API could disclose its retained JSON:
///
/// ```compile_fail
/// fn expose_binding(
///     request: &breditor_core::codec::LocalLogStorageAppendResolutionRequest<'_>,
/// ) {
///     let _ = request.expected_binding();
/// }
/// ```
#[must_use = "a borrowed append-resolution request is intended for one observational adapter invocation"]
pub struct LocalLogStorageAppendResolutionRequest<'a> {
    source: &'a LocalLogStorageAppendResolutionSource,
    request_id: &'a LocalLogStorageAppendResolutionRequestId,
}

impl<'a> LocalLogStorageAppendResolutionRequest<'a> {
    pub(super) const fn from_source(
        source: &'a LocalLogStorageAppendResolutionSource,
        request_id: &'a LocalLogStorageAppendResolutionRequestId,
    ) -> Self {
        Self { source, request_id }
    }

    /// Returns the opaque process-local resolver-request identity.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageAppendResolutionRequestId {
        self.request_id
    }

    /// Returns the exact attempt-state case retained behind this request.
    #[must_use]
    pub const fn source_kind(&self) -> LocalLogStorageAppendResolutionSourceKind {
        self.source.kind()
    }

    /// Returns the physical append-attempt identity retained by the source.
    #[must_use]
    pub const fn source_attempt_id(&self) -> &'a LocalLogStorageAppendAttemptId {
        self.source.attempt_id()
    }

    /// Returns the source append-request ID when that request reached egress.
    #[must_use]
    pub const fn source_append_request_id(&self) -> Option<&'a LocalLogStorageAppendRequestId> {
        self.source.append_request_id()
    }

    pub(super) const fn expected_binding(&self) -> &'a LocalLogStorageMutationFenceBinding {
        self.source.queue().expected_binding()
    }

    /// Returns the complete selected-envelope scalar binding to re-observe.
    #[must_use]
    pub const fn selected_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.expected_binding().selected_binding()
    }

    /// Returns the mutable writer epoch the read transaction must observe.
    #[must_use]
    pub const fn expected_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.expected_binding().writer_epoch()
    }

    /// Returns the mutable writer fence the read transaction must observe.
    #[must_use]
    pub const fn expected_writer_fence_id(&self) -> &'a LocalLogStorageFenceId {
        self.expected_binding().current_writer_fence_id()
    }

    /// Returns the exact selected active-generation frame policy to validate.
    #[must_use]
    pub const fn expected_frame_limits(&self) -> LocalLogFrameLimits {
        self.selected_binding().active_generation().frame().limits()
    }

    /// Returns the generation-relative key of the unresolved head.
    #[must_use]
    pub const fn head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.source.queue().head_chunk_start()
    }

    /// Returns the exclusive generation-relative byte end of the head frame.
    #[must_use]
    pub const fn head_frame_end(&self) -> u64 {
        self.source.queue().head_frame_end()
    }

    /// Returns the exact encoded byte length of the unresolved FIFO head.
    #[must_use]
    pub fn head_frame_bytes(&self) -> usize {
        self.source.queue().head_frame_bytes()
    }

    /// Returns the UTF-8 byte length of the exact current selection.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.expected_binding().current_selection_json_bytes()
    }

    /// Returns the exact predecessor byte length when one is present.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.expected_binding().predecessor_selection_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionRequest")
            .field("request_id", self.request_id)
            .field("source_kind", &self.source_kind())
            .field("source_attempt_id", self.source_attempt_id())
            .field("source_append_request_id", &self.source_append_request_id())
            .field("selected_binding", self.selected_binding())
            .field("current_selection_json_bytes", &self.current_selection_json_bytes())
            .field("predecessor_selection_json_bytes", &self.predecessor_selection_json_bytes())
            .field("expected_writer_epoch", &self.expected_writer_epoch())
            .field("expected_writer_fence_id", self.expected_writer_fence_id())
            .field("expected_frame_limits", &self.expected_frame_limits())
            .field("head_chunk_start", &self.head_chunk_start())
            .field("head_frame_end", &self.head_frame_end())
            .field("head_frame_bytes", &self.head_frame_bytes())
            .finish_non_exhaustive()
    }
}
