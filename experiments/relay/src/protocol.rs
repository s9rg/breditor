//! Typed service outcomes distinguish integration, durable acceptance and externally pending work.
use breditor_collab_feasibility::rich_replica::{WriterDependency, WriterReceipt};
use serde::{Deserialize, Serialize};

/// Canonical native author range, independent of binary packing or relay connection identity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Receipt {
    /// Exclusive author.
    pub writer: String,
    /// Inclusive operation counter start (canonical decimal).
    pub from: String,
    /// Exclusive operation counter end (canonical decimal).
    pub through: String,
    /// Canonical author prefix through this group.
    pub prefix_digest: String,
    /// Canonical operations in this atomic group.
    pub group_digest: String,
}
impl From<WriterReceipt> for Receipt {
    fn from(r: WriterReceipt) -> Self {
        Self {
            writer: r.writer,
            from: r.from,
            through: r.through,
            prefix_digest: r.prefix_digest,
            group_digest: r.group_digest,
        }
    }
}

/// Acknowledgement issued only after the exact acceptance record has been synced to the log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableReceipt {
    /// Immutable original durable record sequence, including when a client retries a lost reply.
    pub sequence: String,
    /// Native accepted operations.
    pub receipt: Receipt,
    /// True on a known exact retry; no second acceptance record was appended.
    pub duplicate: bool,
}

/// Submission outcome. Pending groups are NOT stored as accepted history or imported into Rust.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Admission {
    /// Fully admitted and durably appended; safe to acknowledge or broadcast.
    Durable(DurableReceipt),
    /// Dependencies missing. The client retains its exact journal and retries after catchup.
    Pending {
        /// Authenticated causal origin.
        writer: String,
        /// Applied exclusive author ends needed before admission can run.
        missing: Vec<WriterDependency>,
    },
}

/// Ephemeral active-session capability. Never log, share, or store in a portable document.
/// A successful resume replaces it; stale sockets cannot write or release a newer lease.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lease {
    /// Server-allocated causal identity, not the account principal.
    pub writer: String,
    /// Opaque connection fence; restart invalidates every old lease.
    pub token: String,
}

/// Durable allocation and secret resume capability. Persist the credential separately from the
/// editor journal before authoring; it is shown only in this allocation response.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    /// Active initial writer lease.
    pub lease: Lease,
    /// Opaque capability bound to the authenticated principal and writer in the ledger.
    pub credential: String,
}

/// Local log-recovery report. An incomplete final append is removed, never a corrupt full record.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    /// Bytes in an incomplete uncommitted final record that were truncated under the file lock.
    pub truncated_bytes: u64,
}
