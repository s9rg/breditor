use std::{collections::VecDeque, fmt, sync::Arc};

use crate::local_log::{LocalLogObservationOutcome, LocalLogStorageChunkStart};

use super::{
    LocalLogStorageAppendQueueLimits, LocalLogStorageMutationFenceBinding,
    LocalLogStorageMutationToken, LocalLogTailCursor,
};

/// Nonempty, bounded FIFO of exact speculative storage appends.
///
/// The queue owns one revocable mutation token, a cursor advanced through every
/// retained frame, and one structurally distinguished head followed by zero or
/// more ordered successors. Only head metadata is publicly inspectable. Raw
/// frame bytes, followers, removal, acknowledgement, and cursor release remain
/// core-private so a host cannot select a later frame or claim durability.
///
/// Enqueuing another borrowed entry is an atomic consuming action. Capacity is
/// checked before semantic admission, and failure returns this complete queue
/// unchanged. A future adapter lifecycle must revalidate the token and exact
/// physical tail before dispatching only the head. This queue exposes no
/// rotation transition while it is nonempty.
///
/// This value is deliberately non-`Clone`, nonserializable, and privately
/// constructed. Those properties are ownership hygiene rather than proof of
/// storage currentness or language-level linearity. Safe Rust can still drop
/// the whole queue. Doing so is neither cancellation nor acknowledgement: it
/// loses this volatile speculative branch, and recovery must start again from
/// durable storage plus separately retained application intent.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendQueue>();
/// ```
///
/// ```compile_fail
/// fn serialize(queue: &breditor_core::codec::LocalLogStorageAppendQueue) {
///     let _ = serde_json::to_string(queue);
/// }
/// ```
///
/// Raw head bytes are unavailable outside the core:
///
/// ```compile_fail
/// fn expose(queue: &breditor_core::codec::LocalLogStorageAppendQueue) -> &[u8] {
///     queue.head_frame()
/// }
/// ```
///
/// The complete queue cannot be dismantled through the public API:
///
/// ```compile_fail
/// fn dismantle(queue: breditor_core::codec::LocalLogStorageAppendQueue) {
///     let _ = queue.into_parts();
/// }
/// ```
#[must_use = "a nonempty append queue owns speculative state and pending exact frames"]
pub struct LocalLogStorageAppendQueue {
    token: LocalLogStorageMutationToken,
    speculative_cursor: LocalLogTailCursor,
    head: LocalLogStorageQueuedAppend,
    followers: VecDeque<LocalLogStorageQueuedAppend>,
    pending_frames: u64,
    pending_bytes: u64,
    limits: LocalLogStorageAppendQueueLimits,
}

pub(super) struct LocalLogStorageAppendQueueParts {
    pub(super) token: LocalLogStorageMutationToken,
    pub(super) speculative_cursor: LocalLogTailCursor,
    pub(super) head: LocalLogStorageQueuedAppend,
    pub(super) followers: VecDeque<LocalLogStorageQueuedAppend>,
    pub(super) pending_frames: u64,
    pub(super) pending_bytes: u64,
    pub(super) limits: LocalLogStorageAppendQueueLimits,
}

pub(super) struct LocalLogStorageQueuedAppend {
    frame: Arc<[u8]>,
    chunk_start: LocalLogStorageChunkStart,
    frame_end: u64,
    observation: LocalLogObservationOutcome,
}

impl LocalLogStorageQueuedAppend {
    pub(super) const fn new(
        frame: Arc<[u8]>,
        chunk_start: LocalLogStorageChunkStart,
        frame_end: u64,
        observation: LocalLogObservationOutcome,
    ) -> Self {
        Self { frame, chunk_start, frame_end, observation }
    }

    pub(super) const fn frame(&self) -> &Arc<[u8]> {
        &self.frame
    }

    pub(super) const fn chunk_start(&self) -> LocalLogStorageChunkStart {
        self.chunk_start
    }

    pub(super) const fn frame_end(&self) -> u64 {
        self.frame_end
    }

    pub(super) const fn observation(&self) -> LocalLogObservationOutcome {
        self.observation
    }
}

impl LocalLogStorageAppendQueue {
    pub(super) fn new(
        token: LocalLogStorageMutationToken,
        speculative_cursor: LocalLogTailCursor,
        head: LocalLogStorageQueuedAppend,
        pending_bytes: u64,
        limits: LocalLogStorageAppendQueueLimits,
    ) -> Self {
        let queue = Self {
            token,
            speculative_cursor,
            head,
            followers: VecDeque::new(),
            pending_frames: 1,
            pending_bytes,
            limits,
        };
        queue.debug_assert_invariants();
        queue
    }

    pub(super) fn from_parts(parts: LocalLogStorageAppendQueueParts) -> Self {
        let LocalLogStorageAppendQueueParts {
            token,
            speculative_cursor,
            head,
            followers,
            pending_frames,
            pending_bytes,
            limits,
        } = parts;
        let queue = Self {
            token,
            speculative_cursor,
            head,
            followers,
            pending_frames,
            pending_bytes,
            limits,
        };
        queue.debug_assert_invariants();
        queue
    }

    pub(super) fn into_parts(self) -> LocalLogStorageAppendQueueParts {
        LocalLogStorageAppendQueueParts {
            token: self.token,
            speculative_cursor: self.speculative_cursor,
            head: self.head,
            followers: self.followers,
            pending_frames: self.pending_frames,
            pending_bytes: self.pending_bytes,
            limits: self.limits,
        }
    }

    pub(super) const fn head_frame(&self) -> &Arc<[u8]> {
        self.head.frame()
    }

    /// Returns the retained revocable storage-mutation authority.
    pub const fn token(&self) -> &LocalLogStorageMutationToken {
        &self.token
    }

    /// Returns the complete expected comparison binding for future head I/O.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogStorageMutationFenceBinding {
        self.token.binding()
    }

    /// Returns the cursor after speculative admission of every pending frame.
    ///
    /// Shared inspection can guide construction of the next entry, but it does
    /// not publish durable state or permit direct cursor advancement.
    #[must_use]
    pub const fn speculative_cursor(&self) -> &LocalLogTailCursor {
        &self.speculative_cursor
    }

    /// Returns the immutable resource policy selected when the queue began.
    #[must_use]
    pub const fn limits(&self) -> LocalLogStorageAppendQueueLimits {
        self.limits
    }

    /// Returns the exact number of pending physical frames, including exact-
    /// duplicate observations.
    #[must_use]
    pub const fn pending_frames(&self) -> u64 {
        self.pending_frames
    }

    /// Returns the exact aggregate encoded bytes retained by pending frames.
    #[must_use]
    pub const fn pending_bytes(&self) -> u64 {
        self.pending_bytes
    }

    /// Returns remaining frame capacity under the immutable queue policy.
    #[must_use]
    pub const fn remaining_frame_capacity(&self) -> u64 {
        self.limits.max_pending_frames().saturating_sub(self.pending_frames)
    }

    /// Returns remaining encoded-byte capacity under the immutable queue policy.
    #[must_use]
    pub const fn remaining_byte_capacity(&self) -> u64 {
        self.limits.max_pending_bytes().saturating_sub(self.pending_bytes)
    }

    /// Returns the only frame start eligible for future physical dispatch.
    #[must_use]
    pub const fn head_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.head.chunk_start()
    }

    /// Returns the exclusive byte end of the FIFO head frame.
    #[must_use]
    pub const fn head_frame_end(&self) -> u64 {
        self.head.frame_end()
    }

    /// Returns the encoded byte length of the FIFO head without exposing bytes.
    #[must_use]
    pub fn head_frame_bytes(&self) -> usize {
        self.head.frame().len()
    }

    /// Returns the head frame's speculative semantic admission outcome.
    #[must_use]
    pub const fn head_observation_outcome(&self) -> LocalLogObservationOutcome {
        self.head.observation()
    }

    /// Returns the exclusive byte end after every pending frame.
    #[must_use]
    pub const fn speculative_tail_end(&self) -> u64 {
        self.speculative_cursor.accepted_byte_offset()
    }

    fn debug_assert_invariants(&self) {
        let selected = self.token.selected_binding();
        let owner = self.speculative_cursor.owner();
        debug_assert_eq!(selected.current_receipt().session_id(), owner.session_id());
        debug_assert_eq!(selected.checkpoint_generation().log_id(), owner.checkpoint_log_id());
        debug_assert_eq!(selected.active_generation().log_id(), owner.active_log_id());
        debug_assert_eq!(
            selected.active_generation().frame().limits(),
            self.speculative_cursor.frame_limits()
        );
        debug_assert!(self.pending_frames <= self.limits.max_pending_frames());
        debug_assert!(self.pending_bytes <= self.limits.max_pending_bytes());

        let represented_frames =
            u64::try_from(self.followers.len()).ok().and_then(|followers| followers.checked_add(1));
        debug_assert_eq!(represented_frames, Some(self.pending_frames));

        let mut expected_start = self.head.chunk_start().get();
        let mut represented_bytes = Some(0_u64);
        for item in std::iter::once(&self.head).chain(self.followers.iter()) {
            let frame_bytes = u64::try_from(item.frame().len()).ok();
            debug_assert_eq!(item.chunk_start().get(), expected_start);
            debug_assert_eq!(item.frame_end().checked_sub(item.chunk_start().get()), frame_bytes);
            represented_bytes = represented_bytes
                .zip(frame_bytes)
                .and_then(|(total, bytes)| total.checked_add(bytes));
            expected_start = item.frame_end();
        }
        debug_assert_eq!(represented_bytes, Some(self.pending_bytes));
        debug_assert_eq!(expected_start, self.speculative_cursor.accepted_byte_offset());
    }
}

impl fmt::Debug for LocalLogStorageAppendQueue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendQueue")
            .field("token", &self.token)
            .field("head_chunk_start", &self.head.chunk_start())
            .field("head_frame_end", &self.head.frame_end())
            .field("head_frame_bytes", &self.head_frame().len())
            .field("head_observation", &self.head.observation())
            .field("pending_frames", &self.pending_frames)
            .field("pending_bytes", &self.pending_bytes)
            .field("speculative_tail_end", &self.speculative_cursor.accepted_byte_offset())
            .field("limits", &self.limits)
            .finish_non_exhaustive()
    }
}
