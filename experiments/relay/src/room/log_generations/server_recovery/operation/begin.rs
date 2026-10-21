//! Establish durable operational storage provenance before exposing a continuing room.
use super::super::super::{ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use super::super::{RecoveredLogGenerationServerRoom, begin::selected, files};
use super::{
    context::Context,
    coordinator::OperationalLogGenerationServerRoom,
    interruption::{Interruption, Point},
    marker::{Intent, Selection},
};
use crate::{
    Error, Result, RoomRecoveryPolicy, credentials, log::generations::GenerationFileWitness,
};
impl RecoveredLogGenerationServerRoom {
    /// Establish storage-phase provenance for this exact completed joined recovery, retaining
    /// every actual lease without a drop/reopen gap. Keep the original archive/identity for
    /// cold reopen. Host authentication, provider/client reconciliation and activation stay separate.
    /// # Errors
    /// Wrong selection/non-owner, changed files, existing intent or uncertain writes refuse.
    /// An error can leave a committed marker; preserve all files and use explicit operational resume.
    pub fn begin_operation(
        self,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
        principal: &str,
    ) -> Result<OperationalLogGenerationServerRoom> {
        self.handoff(backup, expected, policy, principal, &Interruption::default())
    }
    pub(super) fn handoff(
        mut self,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
        principal: &str,
        stop: &Interruption,
    ) -> Result<OperationalLogGenerationServerRoom> {
        selected(backup, expected, policy)?;
        self.check_live_source(backup, principal)?;
        self.directory.absent(".operation-intent.json")?;
        self.directory.absent(".operational.json")?;
        let selection = Selection {
            recovery: self.marker.id.clone(),
            source: expected.clone(),
            root: self.directory.witness()?,
            controls: self.controls.fingerprint()?,
            native_controls: self.native_controls.fingerprint()?,
        };
        let stage = format!(".operation-data-{}", credentials::issue()?);
        let file = self.directory.create_file(&stage, &[])?;
        let witness = GenerationFileWitness::of(&file)?;
        drop(file);
        stop.after(Point::StageCreated)?;
        let intent = Intent {
            format: "breditor/joined-generation-operation-intent".into(),
            format_version: 1,
            selection,
            stage,
            witness,
        };
        files::insert(&self.directory, ".operation-intent.json", &files::encode(&intent)?)?;
        stop.after(Point::IntentSelected)?;
        let context = Context::read(&self.directory, &self.marker)?;
        self.check_source(backup, principal, true, &context.extra)?;
        context.publish(&self.directory, stop)?;
        if !context.guard(&self.directory)? {
            return Err(Error::Contract("generation operational handoff not committed"));
        }
        self.check_source(backup, principal, true, &context.extra)?;
        Ok(OperationalLogGenerationServerRoom { recovered: self, context })
    }
}
