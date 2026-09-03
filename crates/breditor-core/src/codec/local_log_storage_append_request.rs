use std::fmt;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId, LocalLogStorageChunkStart,
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedBinding,
};

/// Borrowed adapter request for one exact FIFO-head append transaction.
///
/// The request exposes only the immutable queue head. It never exposes a
/// follower, the speculative tail cursor, or an operation that chooses a frame
/// by index. The returned frame bytes are the already encoded complete Local
/// Log Frame V1 and must be stored byte-for-byte under [`Self::head_chunk_start`].
/// The raw frame and exact selection JSON can contain document data; all are
/// deliberately omitted from `Debug`.
///
/// Under `IndexedDB` Storage Profile V1, an adapter invocation uses one strict
/// `readwrite` transaction over exactly `meta`, `scopes`, `transactions`,
/// `generations`, and `chunks`. Inside it, the adapter must independently read
/// and normalize the selected envelope and authoritative current-head index;
/// directionally compare the complete expected binding; compare both retained
/// selection JSON values byte-for-byte; compare the writer epoch and fence;
/// validate the selected active generation and its frame policy; and scan the
/// complete active-generation chunk prefix. Every stored chunk must contain
/// exactly one complete valid frame at its canonical contiguous start, with no
/// gap, overlap, malformed frame, trailing bytes, or later record.
///
/// There are only two admissible physical shapes for this request. If the
/// valid prefix ends at the requested start and that key is absent, the
/// adapter may `add` exactly the requested frame at exactly that key. If the
/// target record is already the valid final record, its key and bytes must
/// match this request exactly and the prefix immediately before it must end at
/// the requested start. That second shape is only idempotently present; a
/// future core checkpoint will define terminal evidence and queue advancement.
/// Any differing bytes, gap, overlap, later record, stale binding, malformed
/// value, or failed request requires explicit transaction abort.
///
/// The transaction must not write any follower, selected head, publication
/// transaction, generation, writer pair, or retained selection JSON. Request
/// success or `commit()` return is not terminal completion. One request ID
/// denotes one adapter invocation and at most one append-capable transaction;
/// copied bytes dispatched elsewhere are outside this correlation contract.
///
/// This request performs no I/O and supplies no terminal result, durability
/// receipt, cancellation, queue removal, or cursor release.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendRequest<'static>>();
/// ```
///
/// A request cannot select or expose a queued follower:
///
/// ```compile_fail
/// fn skip_head(request: &breditor_core::codec::LocalLogStorageAppendRequest<'_>) {
///     let _ = request.frame_at(1);
/// }
/// ```
#[must_use = "a borrowed append request is intended for one adapter invocation"]
pub struct LocalLogStorageAppendRequest<'a> {
    queue: &'a LocalLogStorageAppendQueue,
    request_id: &'a LocalLogStorageAppendRequestId,
}

impl<'a> LocalLogStorageAppendRequest<'a> {
    pub(super) const fn from_queue(
        queue: &'a LocalLogStorageAppendQueue,
        request_id: &'a LocalLogStorageAppendRequestId,
    ) -> Self {
        Self { queue, request_id }
    }

    /// Returns the physical append attempt that emitted this request.
    #[must_use]
    pub const fn attempt_id(&self) -> &'a LocalLogStorageAppendAttemptId {
        self.request_id.attempt_id()
    }

    /// Returns the correlation identity reserved for future terminal evidence.
    #[must_use]
    pub const fn request_id(&self) -> &'a LocalLogStorageAppendRequestId {
        self.request_id
    }

    /// Returns the complete exact mutation-fence binding to re-observe.
    #[must_use]
    pub const fn expected_binding(&self) -> &'a LocalLogStorageMutationFenceBinding {
        self.queue.expected_binding()
    }

    /// Returns the complete selected-envelope scalar binding to re-observe.
    #[must_use]
    pub const fn selected_binding(&self) -> &'a LocalLogStorageSelectedBinding {
        self.expected_binding().selected_binding()
    }

    /// Returns the exact canonical currently selected root-or-rotation JSON.
    #[must_use]
    pub fn current_selection_json(&self) -> &'a str {
        self.expected_binding().current_selection_json()
    }

    /// Returns the exact immediate-predecessor JSON when selection is a rotation.
    #[must_use]
    pub fn predecessor_selection_json(&self) -> Option<&'a str> {
        self.expected_binding().predecessor_selection_json()
    }

    /// Returns the mutable writer epoch the transaction must observe.
    #[must_use]
    pub const fn expected_writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.expected_binding().writer_epoch()
    }

    /// Returns the mutable writer fence the transaction must observe.
    #[must_use]
    pub const fn expected_writer_fence_id(&self) -> &'a LocalLogStorageFenceId {
        self.expected_binding().current_writer_fence_id()
    }

    /// Returns the generation-relative key of the only dispatch-eligible frame.
    #[must_use]
    pub const fn head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.queue.head_chunk_start()
    }

    /// Returns the exclusive generation-relative byte end of the head frame.
    #[must_use]
    pub const fn head_frame_end(&self) -> u64 {
        self.queue.head_frame_end()
    }

    /// Returns the exact complete encoded bytes of the FIFO head.
    #[must_use]
    pub fn head_frame(&self) -> &'a [u8] {
        self.queue.head_frame().as_ref()
    }

    /// Returns the exact encoded byte length of the FIFO head.
    #[must_use]
    pub fn head_frame_bytes(&self) -> usize {
        self.head_frame().len()
    }

    /// Returns the UTF-8 byte length of the exact current selection.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.current_selection_json().len()
    }

    /// Returns the exact predecessor byte length when one is present.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.predecessor_selection_json().map(str::len)
    }
}

impl fmt::Debug for LocalLogStorageAppendRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendRequest")
            .field("attempt_id", self.attempt_id())
            .field("request_id", self.request_id)
            .field("selected_binding", self.selected_binding())
            .field("current_selection_json_bytes", &self.current_selection_json_bytes())
            .field("predecessor_selection_json_bytes", &self.predecessor_selection_json_bytes())
            .field("expected_writer_epoch", &self.expected_writer_epoch())
            .field("expected_writer_fence_id", self.expected_writer_fence_id())
            .field("head_chunk_start", &self.head_chunk_start())
            .field("head_frame_end", &self.head_frame_end())
            .field("head_frame_bytes", &self.head_frame_bytes())
            .finish_non_exhaustive()
    }
}
