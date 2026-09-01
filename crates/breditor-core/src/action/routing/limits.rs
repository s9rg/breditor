/// Maximum semantic intent declarations in one frozen router.
pub const MAX_INTENT_DECLARATIONS: u32 = 1_024;

/// Maximum total intent-to-action bindings in one frozen router.
pub const MAX_INTENT_BINDINGS: u32 = 4_096;

/// Maximum bindings attached to any one declared semantic intent.
pub const MAX_BINDINGS_PER_INTENT: u32 = 256;
