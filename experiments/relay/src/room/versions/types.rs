//! Closed catalog identity, frozen paging and durable publication results; none confer permissions.
use breditor_collab_feasibility::rich_replica::{DocumentVersionInfo, WriterDependency};
use serde::{Deserialize, Serialize};

/// Public identity of one explicitly enabled catalog in one exact durable room log.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionsDescriptor {
    /// Distinct from imported semantic version packets and comment transport.
    pub format: &'static str,
    /// Explicit catalog wire revision.
    pub format_version: u32,
    /// Exact native document identity, not its display name.
    pub document: String,
    /// Random lineage binding, not an account token or credential.
    pub binding: String,
}

/// Immutable original acceptance and native-validated author/name/source-packet identity.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionCatalogEntry {
    /// Canonical decimal room-log sequence, not an untrusted client timestamp ordering.
    pub sequence: String,
    /// Author equals the authenticated account that durably published this version.
    pub version: DocumentVersionInfo,
}

/// Receipt returned only after append and fsync, including original identity on exact retries.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableDocumentVersion {
    /// Exact enabled catalog, so another log cannot acknowledge this publication.
    pub descriptor: DocumentVersionsDescriptor,
    /// First acceptance; retries never allocate a second durable sequence.
    pub entry: DocumentVersionCatalogEntry,
    /// No additional record was appended for a known immutable packet.
    pub duplicate: bool,
}

/// Publication never imports version content as document operations or changes accepted history.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DocumentVersionAdmission {
    /// Safe to acknowledge after durable append, or an exact retained acceptance.
    Durable(DurableDocumentVersion),
    /// Client retains the exact packet and document history; no record or acceptance exists yet.
    Pending {
        /// Exclusive operation ends needed before native historical proof can succeed.
        missing: Vec<WriterDependency>,
    },
}

/// A frozen catalog interval. Neither a guessed offset nor a cursor grants account read access.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentVersionsCursor {
    /// Exact catalog log lineage.
    pub binding: String,
    /// Last returned publication, or catalog enable sequence for the first empty prefix.
    pub after: String,
    /// Fixed terminal publication at the first page, excluding concurrent later saves.
    pub through: String,
}

/// At most 64 metadata entries. Packet bytes are fetched separately under current read permission.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionCatalogPage {
    /// Bound catalog identity, never inferred from the document's human name.
    pub descriptor: DocumentVersionsDescriptor,
    /// Complete immutable entries ordered by original server acceptance.
    pub entries: Vec<DocumentVersionCatalogEntry>,
    /// The exact frozen interval, advanced only through returned entries.
    pub cursor: DocumentVersionsCursor,
    /// More entries remain within this frozen interval; a refresh starts a new interval.
    pub more: bool,
}
