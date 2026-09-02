use std::fmt;

use crate::local_log::ContinuedLocalLog;

use super::{LocalLogFrameBinding, LocalLogFrameCodec, LocalLogFrameLimits};

/// Owning atomic cursor over one active generation's framed physical tail.
///
/// The cursor couples a [`ContinuedLocalLog`] with the generation-relative
/// `u64` byte offset accepted for that generation and a fixed frame payload
/// policy. Its one-frame transition uses `EditorContext`, session identity, and
/// active generation identity derived from the owned log instead of accepting
/// independently drifting codec configuration.
///
/// The cursor performs no I/O and does not prove that caller bytes came from a
/// particular file or store. `input_origin` is a caller-authoritative assertion
/// that input byte zero is the cursor's exact accepted byte. A successful exact
/// duplicate is still one accepted physical frame and advances the byte offset.
/// Clean end and truncation return the unchanged cursor. Every typed error also
/// returns it through [`super::LocalLogTailFailure`].
pub struct LocalLogTailCursor {
    pub(super) owner: ContinuedLocalLog,
    pub(super) frame_codec: LocalLogFrameCodec,
    pub(super) accepted_byte_offset: u64,
}

impl LocalLogTailCursor {
    pub(super) fn from_fresh_owner(
        owner: ContinuedLocalLog,
        frame_limits: LocalLogFrameLimits,
    ) -> Self {
        let frame_codec = Self::frame_codec_for(&owner, frame_limits);
        Self { owner, frame_codec, accepted_byte_offset: 0 }
    }

    /// Restores a cursor from caller-trusted semantic and physical parts.
    ///
    /// This constructor cannot prove that `owner` was caused by exactly
    /// `accepted_byte_offset` bytes. The host must restore both from one trusted
    /// atomic checkpoint or otherwise establish their causal relationship.
    #[must_use]
    pub fn from_trusted_parts(
        owner: ContinuedLocalLog,
        accepted_byte_offset: u64,
        frame_limits: LocalLogFrameLimits,
    ) -> Self {
        let frame_codec = Self::frame_codec_for(&owner, frame_limits);
        Self { owner, frame_codec, accepted_byte_offset }
    }

    /// Returns the active semantic log owner.
    #[must_use]
    pub const fn owner(&self) -> &ContinuedLocalLog {
        &self.owner
    }

    /// Returns the exclusive physical byte offset accepted in this generation.
    #[must_use]
    pub const fn accepted_byte_offset(&self) -> u64 {
        self.accepted_byte_offset
    }

    /// Returns the fixed frame payload policy carried by this cursor.
    #[must_use]
    pub const fn frame_limits(&self) -> LocalLogFrameLimits {
        self.frame_codec.limits()
    }

    /// Separates the trusted semantic owner, physical offset, and frame policy.
    ///
    /// This deliberately dissolves the cursor's coupling. A host must preserve
    /// the returned relationship atomically and must never infer an offset from
    /// observation count.
    #[must_use]
    pub fn into_parts(self) -> (ContinuedLocalLog, u64, LocalLogFrameLimits) {
        (self.owner, self.accepted_byte_offset, self.frame_codec.limits())
    }

    fn frame_codec_for(
        owner: &ContinuedLocalLog,
        frame_limits: LocalLogFrameLimits,
    ) -> LocalLogFrameCodec {
        let context = owner.session().state().context().clone();
        let binding =
            LocalLogFrameBinding::new(owner.session_id().clone(), owner.active_log_id().clone());
        LocalLogFrameCodec::new(context, binding).with_limits(frame_limits)
    }
}

impl fmt::Debug for LocalLogTailCursor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailCursor")
            .field("session_id", self.owner.session_id())
            .field("active_log_id", self.owner.active_log_id())
            .field("accepted_byte_offset", &self.accepted_byte_offset)
            .field("frame_limits", &self.frame_codec.limits())
            .field("observation_count", &self.owner.observation_count())
            .field("unique_event_count", &self.owner.unique_event_count())
            .field("exact_duplicate_count", &self.owner.exact_duplicate_count())
            .finish_non_exhaustive()
    }
}
