//! Read all original registrations under the exclusively owned native room and exact durable cut.
use super::{
    RecoveryAccount, RecoveryDocumentClock, RecoveryDocumentRegistration, RecoveryServerAuthor,
    RecoveryServerAuthorKind, RoomParticipantInventory, RoomParticipantInventoryMetadata,
};
use crate::room::{ProfileSeed, suggestions::EFFECT_WRITER};
use crate::{Error, Result, Role, Room, RoomBackupIdentity};
use std::collections::BTreeSet;

impl Room {
    pub(in crate::room) fn recovery_inventory_owner(&self, principal: &str) -> Result<()> {
        self.log.ready()?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        Ok(())
    }

    /// Capture every registered document/review stream, including observers and revoked accounts.
    /// The caller authenticates this owner before supplying its principal, as for other Room APIs.
    /// No registration, role, native counter, active lease or durable record is changed.
    /// # Errors
    /// Rejects non-owner calls, poisoned/changed storage, native lineage errors or inventory bounds.
    pub fn participant_inventory(&mut self, principal: &str) -> Result<RoomParticipantInventory> {
        self.recovery_inventory_owner(principal)?;
        let room = self.backup_identity()?;
        let _ = self.export_backup()?; // Validate actual retained file bytes, not just an in-memory cut.
        let inventory = self.capture_participant_inventory_at(principal, room.clone())?;
        if self.backup_identity()? != room {
            return Err(Error::Contract("participant inventory cut changed"));
        }
        Ok(inventory)
    }

    // Only the original checked capture above and the distinct generation capture call this.
    // The caller pins and rechecks actual retained source bytes; this does not prove storage.
    pub(in crate::room) fn capture_participant_inventory_at(
        &self,
        principal: &str,
        room: RoomBackupIdentity,
    ) -> Result<RoomParticipantInventory> {
        self.recovery_inventory_owner(principal)?;
        let review = self.review_recovery_inventory()?;
        let mut principals = BTreeSet::from([self.owner.clone()]);
        principals.extend(self.roles.keys().cloned());
        principals.extend(review.principals);
        principals.extend(self.suggestion_recovery_principals());
        let mut writers = Vec::with_capacity(self.writers.len());
        for (writer, registered) in &self.writers {
            principals.insert(registered.principal.clone());
            writers.push(RecoveryDocumentRegistration {
                principal: registered.principal.clone(),
                observer: registered.observer,
                clock: self.recovery_document_clock(writer)?,
            });
        }
        let accounts = principals
            .iter()
            .map(|account| self.recovery_account(account))
            .collect::<Result<_>>()?;
        let versions_binding = if self.versions.is_some() {
            Some(self.document_versions_descriptor(principal)?.binding)
        } else {
            None
        };
        let suggestions_binding = if self.suggestions.is_some() {
            Some(self.document_suggestions_descriptor(principal)?.binding)
        } else {
            None
        };
        let revisions_binding = if self.suggestion_revisions_enabled() {
            Some(self.document_suggestion_revisions_descriptor(principal)?.binding)
        } else {
            None
        };
        let mut server_authors = vec![RecoveryServerAuthor {
            kind: RecoveryServerAuthorKind::Genesis,
            clock: self.recovery_document_clock("1")?,
        }];
        if self.suggestions.is_some() {
            server_authors.push(RecoveryServerAuthor {
                kind: RecoveryServerAuthorKind::SuggestionEffect,
                clock: self.recovery_document_clock(EFFECT_WRITER)?,
            });
        }
        RoomParticipantInventory::encode(RoomParticipantInventoryMetadata {
            format: "breditor/room-participant-inventory".into(),
            format_version: 1,
            room,
            schema_fingerprint: self.profile.schema().fingerprint().to_string(),
            rich_language: match self.profile_seed {
                ProfileSeed::Original => 1,
                ProfileSeed::StructuralV2(_) => 2,
                ProfileSeed::LayoutV3(_) => 3,
            },
            accounts,
            writers,
            review: review.inventory,
            versions_binding,
            suggestions_binding,
            revisions_binding,
            server_authors,
        })
    }

    fn recovery_document_clock(&self, writer: &str) -> Result<RecoveryDocumentClock> {
        let clock = if self.atomic_transport_v2 {
            self.replica.writer_clock_v2(writer)?
        } else {
            self.replica.writer_clock(writer)?
        };
        Ok(RecoveryDocumentClock {
            writer: clock.writer,
            through: clock.through,
            prefix_digest: clock.prefix_digest,
        })
    }

    fn recovery_account(&self, principal: &str) -> Result<RecoveryAccount> {
        let owner = principal == self.owner;
        let document_role =
            if owner { Some(Role::Editor) } else { self.roles.get(principal).copied() };
        let review_role = if document_role.is_some() && self.review.is_some() {
            self.review_permissions(principal)?
        } else {
            None
        };
        let suggestion_role = if document_role.is_some() && self.suggestions.is_some() {
            self.suggestion_permissions(principal)?.role
        } else {
            None
        };
        Ok(RecoveryAccount {
            principal: principal.into(),
            owner,
            document_role,
            review_role,
            suggestion_role,
        })
    }
}

impl RoomParticipantInventory {
    /// Recheck every actual native registration, prefix and effective grant after original replay.
    /// Serialized metadata alone never proves native admission, current auth or a live deployment.
    /// # Errors
    /// Rejects non-owner calls, changed/poisoned storage and any omission or divergent native state.
    pub fn verify_native(&self, room: &mut Room, authenticated_owner: &str) -> Result<()> {
        let actual = room.participant_inventory(authenticated_owner)?;
        if actual.identity != self.identity || actual.json != self.json {
            return Err(Error::Contract("participant inventory differs from native room"));
        }
        Ok(())
    }
}
