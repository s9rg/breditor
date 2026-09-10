/// Maximum entries in one immutable action-state catalog.
///
/// This admits the four built-in controls together with the profile compiler's
/// independent maxima of 255 inline-format toggles and 255 inline-format
/// setters.
pub const MAX_ACTION_STATE_ENTRIES: u32 = 514;

/// Maximum aggregate values retained by catalog invocation inputs.
pub const MAX_ACTION_STATE_INPUT_VALUE_COUNT: u32 = 65_536;

/// Maximum aggregate UTF-8 bytes retained by catalog invocation inputs.
pub const MAX_ACTION_STATE_INPUT_TEXT_BYTES: u64 = 1_048_576;

/// Maximum dynamic values retained by one derived entry.
pub const MAX_ACTION_STATE_ENTRY_VALUE_COUNT: u32 = 4_096;

/// Maximum dynamic UTF-8 bytes retained by one derived entry.
pub const MAX_ACTION_STATE_ENTRY_TEXT_BYTES: u64 = 262_144;

/// Maximum aggregate dynamic values retained by one derived batch.
pub const MAX_ACTION_STATE_BATCH_VALUE_COUNT: u32 = 65_536;

/// Maximum aggregate dynamic UTF-8 bytes retained by one derived batch.
pub const MAX_ACTION_STATE_BATCH_TEXT_BYTES: u64 = 1_048_576;

/// Maximum aggregate routing fallthrough records retained by one batch.
pub const MAX_ACTION_STATE_BATCH_FALLTHROUGHS: u32 = 16_384;
