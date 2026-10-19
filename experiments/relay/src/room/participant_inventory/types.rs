//! Detached inventory data. Neither these serializable values nor a checksum grants access.
use crate::{ReviewRole, Role, RoomBackupIdentity, SuggestionRole};
use breditor_collab_feasibility::review::ReviewWriterClock;
use serde::{Deserialize, Serialize};

/// Independent selected inventory, retained separately from incoming metadata.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoomParticipantInventoryIdentity {
    /// Original native room and exact durable cut, including registration credential digests.
    pub room: RoomBackupIdentity,
    /// SHA-256 of the complete canonical UTF-8 inventory file, not an authentication token.
    pub sha256: [u8; 32],
}

/// Exact original document-prefix witness in the explicitly selected transport family.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryDocumentClock {
    /// Canonical causal author identifier, not an account.
    pub writer: String,
    /// Exclusive applied operation end, including zero for an empty registered stream.
    pub through: String,
    /// Original transport-specific native lineage digest through that end.
    pub prefix_digest: String,
}

/// One permanently reserved client stream, even after account revocation or disconnection.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryDocumentRegistration {
    /// Account that owns the original registration.
    pub principal: String,
    /// Permanently non-authoring identity; account promotion does not change this flag.
    pub observer: bool,
    /// Original native accepted prefix; no active connection lease is exposed.
    pub clock: RecoveryDocumentClock,
}

/// One permanently reserved review actor, including empty and revoked registrations.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryReviewRegistration {
    /// Account bound to the actor's original native stream.
    pub principal: String,
    /// Permanently non-authoring review identity, independent from current account roles.
    pub observer: bool,
    /// Inclusive event end and canonical native actor/principal/document prefix.
    pub clock: ReviewWriterClock,
}

/// Explicit review namespace and complete registered actor set at this selected cut.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryReviewInventory {
    /// Original durable review binding; never a resume credential.
    pub binding: String,
    /// Lexically ordered distinct registered actors, excluding the reserved server receiver.
    pub writers: Vec<RecoveryReviewRegistration>,
}

/// A native service author retained by the server archive rather than a client registration.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryServerAuthorKind {
    /// Original immutable genesis author one.
    Genesis,
    /// Exclusively host-owned accepted suggestion-effect author.
    SuggestionEffect,
}

/// Server-owned author prefix; no client credential or client backup is invented for it.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryServerAuthor {
    /// Native service responsibility for this author.
    pub kind: RecoveryServerAuthorKind,
    /// Accepted native prefix in the original room transport, not an acknowledgement of drafts.
    pub clock: RecoveryDocumentClock,
}

/// Effective room grants at the captured cut, never current account authentication or new grants.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryAccount {
    /// Original account label, including accounts with retained but revoked registrations.
    pub principal: String,
    /// Immutable initial room owner; this does not establish an authenticated caller.
    pub owner: bool,
    /// Effective document role at this cut; the owner is represented as Editor.
    pub document_role: Option<Role>,
    /// Effective review role at this cut, or None after document-read revocation.
    pub review_role: Option<ReviewRole>,
    /// Effective proposal/review role, independent from document Editor and comment roles.
    pub suggestion_role: Option<SuggestionRole>,
}

/// Closed complete server registration metadata, not a complete inventory of client databases.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoomParticipantInventoryMetadata {
    /// Independent inventory family.
    pub format: String,
    /// Exact independent format revision, currently one.
    pub format_version: u32,
    /// Original compiler, transport, genesis and complete durable server cut.
    pub room: RoomBackupIdentity,
    /// Actual native compiled schema fingerprint, not a caller-selected AST schema.
    pub schema_fingerprint: String,
    /// Explicit original grammar revision, independent from writer transport.
    pub rich_language: u32,
    /// Lexically ordered distinct account records known from roles and registered streams.
    pub accounts: Vec<RecoveryAccount>,
    /// Every registered client document stream, including observers and revoked accounts.
    pub writers: Vec<RecoveryDocumentRegistration>,
    /// Original metadata namespace and every registered review actor, if enabled.
    pub review: Option<RecoveryReviewInventory>,
    /// Original enabled version-catalog namespace, not a current provider capability.
    pub versions_binding: Option<String>,
    /// Original enabled proposal/decision namespace.
    pub suggestions_binding: Option<String>,
    /// Original enabled immutable-revision namespace, not inferred from proposals.
    pub revisions_binding: Option<String>,
    /// Server-owned genesis and, if enabled, accepted effect prefixes.
    pub server_authors: Vec<RecoveryServerAuthor>,
}

/// Host-supplied protected document resume record. Intentionally not Debug or Serialize.
pub struct RecoveryDocumentCredential {
    /// Original registered account, not a current permission assertion.
    pub principal: String,
    /// Original registered client author or observer identifier.
    pub writer: String,
    /// Original opaque resume secret; never an account bearer token or a connection lease.
    pub credential: String,
}

/// Host-supplied protected review resume record. Intentionally not Debug or Serialize.
pub struct RecoveryReviewCredential {
    /// Original account bound to this review actor.
    pub principal: String,
    /// Original metadata actor, not its associated document writer.
    pub actor: String,
    /// Original separate metadata resume secret; no secret enters inventory metadata.
    pub credential: String,
}

/// Explicit protected inputs; the library neither discovers nor reads host credential storage.
#[derive(Default)]
pub struct RecoveryRegistrationCredentials {
    /// At most one original protected resume record per document registration.
    pub documents: Vec<RecoveryDocumentCredential>,
    /// At most one original protected resume record per review registration.
    pub reviews: Vec<RecoveryReviewCredential>,
}

/// Missing original registration input. No partial verified credential proof is returned.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum MissingRecoveryRegistration {
    /// Missing host-protected document identity; revoked registrations still remain required.
    Document {
        /// Original owning account.
        principal: String,
        /// Original registered client stream.
        writer: String,
    },
    /// Missing host-protected metadata identity, separate from its document resume credential.
    Review {
        /// Original owning account.
        principal: String,
        /// Original registered metadata actor.
        actor: String,
    },
}
