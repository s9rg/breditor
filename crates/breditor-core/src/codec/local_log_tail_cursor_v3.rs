use std::fmt;

use crate::{local_log::ContinuedLocalLog, schema::DurableSchemaBinding};

use super::{
    LOCAL_LOG_FRAME_V3_FORMAT_VERSION, LocalLogFrameBinding, LocalLogFrameCodecV3,
    LocalLogFrameLimits,
};

/// Owning atomic cursor over one Frame V3 active-generation tail.
///
/// The distinct owner type prevents V1/V2 and V3 frame scanners from being mixed.
/// It carries the exact durable schema binding, frame payload policy, and
/// generation-relative accepted byte offset even across empty or truncated
/// observations.
pub struct LocalLogTailCursorV3 {
    pub(super) owner: ContinuedLocalLog,
    pub(super) frame_codec: LocalLogFrameCodecV3,
    pub(super) accepted_byte_offset: u64,
}

impl LocalLogTailCursorV3 {
    pub(super) fn from_fresh_owner(
        owner: ContinuedLocalLog,
        frame_limits: LocalLogFrameLimits,
    ) -> Self {
        let frame_codec = Self::frame_codec_for(&owner, frame_limits);
        Self { owner, frame_codec, accepted_byte_offset: 0 }
    }

    /// Restores a V3 cursor from caller-trusted semantic and physical parts.
    ///
    /// The codec's schema, session, and active-log bindings are always derived
    /// from `owner`; callers cannot supply a drifting V3 binding independently.
    /// The host must establish the causal relationship between `owner` and
    /// `accepted_byte_offset`.
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

    /// Returns the exact durable schema selector and fingerprint.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        self.frame_codec.schema_binding()
    }

    /// Returns this cursor's fixed binary frame generation.
    #[must_use]
    pub const fn frame_format_version(&self) -> u16 {
        LOCAL_LOG_FRAME_V3_FORMAT_VERSION
    }

    /// Returns the fixed frame payload policy carried by this cursor.
    #[must_use]
    pub const fn frame_limits(&self) -> LocalLogFrameLimits {
        self.frame_codec.limits()
    }

    /// Separates the trusted semantic owner, physical offset, frame policy,
    /// and explicit durable schema binding.
    ///
    /// This deliberately dissolves their cursor coupling. The V3 generation is
    /// fixed by this method's type and
    /// [`LOCAL_LOG_FRAME_V3_FORMAT_VERSION`].
    #[must_use]
    pub fn into_parts(self) -> (ContinuedLocalLog, u64, LocalLogFrameLimits, DurableSchemaBinding) {
        let binding = self.frame_codec.schema_binding().clone();
        (self.owner, self.accepted_byte_offset, self.frame_codec.limits(), binding)
    }

    fn frame_codec_for(
        owner: &ContinuedLocalLog,
        frame_limits: LocalLogFrameLimits,
    ) -> LocalLogFrameCodecV3 {
        let context = owner.session().state().context().clone();
        let binding =
            LocalLogFrameBinding::new(owner.session_id().clone(), owner.active_log_id().clone());
        LocalLogFrameCodecV3::new(context, binding).with_limits(frame_limits)
    }
}

impl fmt::Debug for LocalLogTailCursorV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailCursorV3")
            .field("session_id", self.owner.session_id())
            .field("active_log_id", self.owner.active_log_id())
            .field("schema_binding", self.frame_codec.schema_binding())
            .field("frame_format_version", &LOCAL_LOG_FRAME_V3_FORMAT_VERSION)
            .field("accepted_byte_offset", &self.accepted_byte_offset)
            .field("frame_limits", &self.frame_codec.limits())
            .field("observation_count", &self.owner.observation_count())
            .field("unique_event_count", &self.owner.unique_event_count())
            .field("exact_duplicate_count", &self.owner.exact_duplicate_count())
            .finish_non_exhaustive()
    }
}
