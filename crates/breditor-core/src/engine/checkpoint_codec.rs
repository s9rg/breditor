use crate::{
    codec::{
        CodecErrorCode, SESSION_CHECKPOINT_FORMAT_VERSION, SESSION_CHECKPOINT_V2_FORMAT_VERSION,
        SessionCheckpointJsonCodec, SessionCheckpointJsonCodecV2, SessionCheckpointLimits,
    },
    session::EditorSession,
    state::EditorContext,
};

/// Selected session-checkpoint codec retained by one checkpointed engine.
#[derive(Debug)]
pub(super) enum CheckpointCodec {
    /// Explicit legacy-compatible Session Checkpoint V1 policy.
    V1(Box<SessionCheckpointJsonCodec>),
    /// Explicit fingerprint-bearing Session Checkpoint V2 policy.
    V2(Box<SessionCheckpointJsonCodecV2>),
}

impl CheckpointCodec {
    pub(super) fn v1(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V1(Box::new(SessionCheckpointJsonCodec::new(context).with_limits(limits)))
    }

    pub(super) fn v2(context: EditorContext, limits: SessionCheckpointLimits) -> Self {
        Self::V2(Box::new(SessionCheckpointJsonCodecV2::new(context).with_limits(limits)))
    }

    pub(super) const fn limits(&self) -> &SessionCheckpointLimits {
        match self {
            Self::V1(codec) => codec.limits(),
            Self::V2(codec) => codec.limits(),
        }
    }

    pub(super) const fn format_version(&self) -> u32 {
        match self {
            Self::V1(_) => SESSION_CHECKPOINT_FORMAT_VERSION,
            Self::V2(_) => SESSION_CHECKPOINT_V2_FORMAT_VERSION,
        }
    }

    pub(super) fn encode(&self, session: &EditorSession) -> Result<String, CodecErrorCode> {
        match self {
            Self::V1(codec) => codec.encode(session).map_err(|error| error.code()),
            Self::V2(codec) => codec.encode(session).map_err(|error| error.code()),
        }
    }
}
