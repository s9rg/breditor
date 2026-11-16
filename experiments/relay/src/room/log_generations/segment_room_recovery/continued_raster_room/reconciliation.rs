//! Read accepted histories and replay retained client originals against the same physical cut.
use super::{ContinuedRasterRoomBackupIdentity, RecoveredContinuedRasterRoom};
use crate::{
    Error, MissingRecoveryRegistration, RecoveryRegistrationCredentials,
    RelaySegmentClientJournalCoverage, RelaySegmentParticipantBranch, Result,
    RoomParticipantInventoryMetadata, ServerRelaySegmentAssetReferences,
    room::log_generations::segment_room_recovery::client_journals::{
        compare_alternates, verify_selected,
    },
};

pub(crate) struct RecoveredContinuedRasterInputCut {
    pub backup: ContinuedRasterRoomBackupIdentity,
    pub participants: RoomParticipantInventoryMetadata,
    pub missing_registrations: Vec<MissingRecoveryRegistration>,
    pub journals: RelaySegmentClientJournalCoverage,
    pub alternate_branches: Vec<RelaySegmentParticipantBranch>,
    pub references: ServerRelaySegmentAssetReferences,
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn recovery_input_cut(
        &mut self,
        principal: &str,
        credentials: &RecoveryRegistrationCredentials,
    ) -> Result<RecoveredContinuedRasterInputCut> {
        self.room.recovery_inventory_owner(principal)?;
        self.check_exact_restored_cut()?;
        let backup = self.completed.backup.clone();
        let accepted = &backup.native.predecessor.source;
        let participants =
            self.room.capture_participant_inventory_at(principal, accepted.clone())?.metadata();
        let missing_registrations =
            self.room.missing_recovery_registrations(&participants, credentials)?;
        let journals = verify_selected(&self.room, &participants, self.clients.journals.as_ref())?;
        let alternate_branches =
            compare_alternates(&self.room, &participants, self.clients.alternatives.as_ref())?;
        let references = self.room.relay_segment_retained_asset_references(principal)?;
        if &references.room != accepted || references.base != backup.native {
            return Err(Error::Contract("continued raster reconciliation cut differs"));
        }
        Ok(RecoveredContinuedRasterInputCut {
            backup,
            participants,
            missing_registrations,
            journals,
            alternate_branches,
            references,
        })
    }
}
