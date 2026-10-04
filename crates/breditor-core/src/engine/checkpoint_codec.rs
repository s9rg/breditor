use crate::{
    codec::{
        CodecErrorCode, SESSION_CHECKPOINT_FORMAT_VERSION, SESSION_CHECKPOINT_V2_FORMAT_VERSION,
        SESSION_CHECKPOINT_V3_FORMAT_VERSION, SessionCheckpointJsonCodec,
        SessionCheckpointJsonCodecV2, SessionCheckpointJsonCodecV3, SessionCheckpointLimits,
    },
    session::EditorSession,
    state::EditorContext,
};

#[cfg(feature = "experimental-structural-properties")]
use crate::codec::{SESSION_CHECKPOINT_V5_FORMAT_VERSION, SessionCheckpointJsonCodecV5};
#[cfg(feature = "experimental-structural-properties")]
use crate::codec::{SESSION_CHECKPOINT_V6_FORMAT_VERSION, SessionCheckpointJsonCodecV6};

/// Selected session-checkpoint codec retained by one checkpointed engine.
#[derive(Debug)]
pub(super) enum CheckpointCodec {
    /// Explicit legacy-compatible Session Checkpoint V1 policy.
    V1(Box<SessionCheckpointJsonCodec>),
    /// Explicit fingerprint-bearing Session Checkpoint V2 policy.
    V2(Box<SessionCheckpointJsonCodecV2>),
    /// Explicit property-preserving Session Checkpoint V3 policy.
    V3(Box<SessionCheckpointJsonCodecV3>),
    /// Explicit heading-aware Session Checkpoint V5 policy.
    #[cfg(feature = "experimental-structural-properties")]
    V5(Box<SessionCheckpointJsonCodecV5>),
    /// Explicit flat-list Session Checkpoint V6 policy.
    #[cfg(feature = "experimental-structural-properties")]
    V6(Box<SessionCheckpointJsonCodecV6>),
}

impl CheckpointCodec {
    pub(super) fn v1(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V1(Box::new(SessionCheckpointJsonCodec::new(context).with_limits(limits)))
    }

    pub(super) fn v2(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V2(Box::new(SessionCheckpointJsonCodecV2::new(context).with_limits(limits)))
    }

    pub(super) fn v3(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V3(Box::new(SessionCheckpointJsonCodecV3::new(context).with_limits(limits)))
    }

    #[cfg(feature = "experimental-structural-properties")]
    pub(super) fn v5(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V5(Box::new(SessionCheckpointJsonCodecV5::new(context).with_limits(limits)))
    }

    #[cfg(feature = "experimental-structural-properties")]
    pub(super) fn v6(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V6(Box::new(SessionCheckpointJsonCodecV6::new(context).with_limits(limits)))
    }

    pub(super) const fn limits(&self) -> &SessionCheckpointLimits {
        match self {
            Self::V1(codec) => codec.limits(),
            Self::V2(codec) => codec.limits(),
            Self::V3(codec) => codec.limits(),
            #[cfg(feature = "experimental-structural-properties")]
            Self::V5(codec) => codec.limits(),
            #[cfg(feature = "experimental-structural-properties")]
            Self::V6(codec) => codec.limits(),
        }
    }

    pub(super) const fn format_version(&self) -> u32 {
        match self {
            Self::V1(_) => SESSION_CHECKPOINT_FORMAT_VERSION,
            Self::V2(_) => SESSION_CHECKPOINT_V2_FORMAT_VERSION,
            Self::V3(_) => SESSION_CHECKPOINT_V3_FORMAT_VERSION,
            #[cfg(feature = "experimental-structural-properties")]
            Self::V5(_) => SESSION_CHECKPOINT_V5_FORMAT_VERSION,
            #[cfg(feature = "experimental-structural-properties")]
            Self::V6(_) => SESSION_CHECKPOINT_V6_FORMAT_VERSION,
        }
    }

    pub(super) fn encode(&self, session: &EditorSession) -> Result<String, CodecErrorCode> {
        match self {
            Self::V1(codec) => codec.encode(session).map_err(|error| error.code()),
            Self::V2(codec) => codec.encode(session).map_err(|error| error.code()),
            Self::V3(codec) => codec.encode(session).map_err(|error| error.code()),
            #[cfg(feature = "experimental-structural-properties")]
            Self::V5(codec) => codec.encode(session).map_err(|error| error.code()),
            #[cfg(feature = "experimental-structural-properties")]
            Self::V6(codec) => codec.encode(session).map_err(|error| error.code()),
        }
    }
}
