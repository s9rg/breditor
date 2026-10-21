//! Detached physical storage metadata. None of these values authorizes activation or a writer.
use serde::Serialize;

/// Current physical head and original global event cut for the explicitly selected log family.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogGenerationDescriptor {
    /// Separate physical-storage descriptor family.
    pub format: &'static str,
    /// Exact descriptor revision.
    pub format_version: u32,
    /// Immutable original root identity.
    pub root: String,
    /// Current continuation identity.
    pub active: String,
    /// Number of retained closed continuation files.
    pub sealed: usize,
    /// Exact immutable physical manifest hash, not an authorization capability.
    pub manifest: [u8; 32],
    /// Next original absolute event position, never generation-relative.
    pub next_sequence: String,
    /// Last original/continuation payload digest at that global cut.
    pub terminal_digest: [u8; 32],
}

/// A synced physical rotation without a document action or a new semantic log position.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogGenerationReceipt {
    /// Separate physical boundary receipt family.
    pub format: &'static str,
    /// Exact receipt revision.
    pub format_version: u32,
    /// Lifetime-new continuation identity selected by this boundary.
    pub generation: String,
    /// Original physical head before the boundary.
    pub before_manifest: [u8; 32],
    /// Exact admitted physical head after the boundary.
    pub after_manifest: [u8; 32],
    /// Original event cut preserved by this rotation.
    pub next_sequence: String,
    /// Original terminal payload digest preserved by this rotation.
    pub terminal_digest: [u8; 32],
    /// An exact retry returns the original receipt without cutting newer input.
    pub duplicate: bool,
}
