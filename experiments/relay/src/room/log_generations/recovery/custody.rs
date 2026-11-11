//! Private coordination with the joined raster owner. Detached witnesses never authorize service.
use super::{RecoveredLogGenerationRoom, ServerLogGenerationRecovery};
use crate::{Result, log::generations::GenerationDirectoryWitness};
impl ServerLogGenerationRecovery {
    pub(in crate::room::log_generations) fn custody(&self) -> Result<GenerationDirectoryWitness> {
        self.directory.witness()
    }
}
impl RecoveredLogGenerationRoom {
    pub(in crate::room::log_generations) fn into_joined_parts(
        self,
    ) -> (crate::Room, crate::log::generations::GenerationDirectory) {
        (self.room, self.directory)
    }
    pub(in crate::room::log_generations) fn guard_joined_native_owner(
        directory: &crate::log::generations::GenerationDirectory,
        room: &crate::Room,
    ) -> Result<()> {
        let component: super::types::Component =
            super::files::read(&directory.path.join(".component.json"))?;
        directory.guard()?;
        room.log.guard_generation_directory(
            &directory.path.join(component.directory),
            &component.witness,
        )
    }
    /// Reopen a continuing selected component without invoking exact historic part restoration,
    /// tail trimming, rotation completion or raster cleanup. The caller retains the joined lease.
    pub(in crate::room::log_generations) fn open_continuing(
        directory: crate::log::generations::GenerationDirectory,
        backup: &super::super::ServerLogGenerationBackup,
        expected: &GenerationDirectoryWitness,
        controls: [u8; 32],
        inspect_prefix: bool,
    ) -> Result<Self> {
        use super::{files, types::Marker};
        use crate::{Error, Room, credentials, log::Log};
        directory.guard_witness(expected)?;
        let marker: Marker = files::read(&directory.path.join(".recovery.json"))?;
        credentials::hash(&marker.id)?;
        if marker.format != "breditor/relay-log-generation-recovery"
            || marker.format_version != 1
            || marker.identity != backup.info().identity
        {
            return Err(Error::Contract("continuing native source differs"));
        }
        let attempt = ServerLogGenerationRecovery {
            directory,
            marker,
            #[cfg(test)]
            stop_after: None,
        };
        let completed: Marker = files::read(&attempt.directory.path.join(".complete.json"))?;
        if files::encode(&completed)? != files::encode(&attempt.completion())? {
            return Err(Error::Contract("continuing native completion differs"));
        }
        let component =
            attempt.component()?.ok_or(Error::Contract("continuing native component absent"))?;
        let seal = super::super::control_seal::RecoveryControlSeal::capture(
            &attempt.directory,
            None,
            &std::collections::BTreeSet::from([component.directory.clone()]),
        )?;
        if seal.fingerprint()? != controls {
            return Err(Error::Contract("continuing native recovery controls differ"));
        }
        let inner = attempt.open_component(&component)?;
        let room = if inspect_prefix {
            let (log, records, recovery) = Log::open_generation_prefix(inner)?;
            if recovery.truncated_bytes == 0 {
                Room::replay_loaded(log, records, recovery, false)?.0
            } else {
                Room::replay_records(log, records)?
            }
        } else {
            let (log, records, recovery) = Log::open_complete_owned_generations(inner)?;
            Room::replay_loaded(log, records, recovery, false)?.0
        };
        seal.check(&attempt.directory)?;
        attempt.directory.guard_witness(expected)?;
        Ok(Self { room, directory: attempt.directory })
    }
}
impl RecoveredLogGenerationRoom {
    pub(in crate::room::log_generations) fn recovery_control_seal(
        &self,
    ) -> Result<super::super::control_seal::RecoveryControlSeal> {
        let component: super::types::Component =
            super::files::read(&self.directory.path.join(".component.json"))?;
        super::super::control_seal::RecoveryControlSeal::capture(
            &self.directory,
            None,
            &std::collections::BTreeSet::from([component.directory]),
        )
    }
    pub(in crate::room::log_generations) fn guard_custody(
        &self,
        expected: &GenerationDirectoryWitness,
    ) -> Result<()> {
        self.directory.guard_witness(expected)
    }
}
