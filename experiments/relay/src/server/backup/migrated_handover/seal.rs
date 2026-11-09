//! Fence the original service only if the actual live bytes still migrate to the selected source.
use super::capture_original;
use crate::{
    Error, Result, ServerLogGenerationOptions,
    server::{
        ServerBackupHandle, deployment_fence,
        generation_backup::durable::{
            Interruption, PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity,
        },
    },
};

impl ServerBackupHandle {
    /// Reauthenticate and seal the exact legacy source behind a prepared
    /// migration using the same generation choices. The sealed source can
    /// feed the existing durable generation activation path. This step
    /// returns retained custody and issues no replacement serving lease.
    ///
    /// A started blocking job can commit after its waiter drops. Recover
    /// status from the independently retained intent and deployment authority.
    ///
    /// # Errors
    /// Wrong owner, credentials, intent, generation choices, source bytes or
    /// epoch refuse. An uncertain append requires recovery and never rolls back.
    pub async fn seal_prepared_generation_migration_handover(
        &self,
        principal: &str,
        token: &str,
        prepared: PreparedLogGenerationHandover,
        expected: &PreparedLogGenerationHandoverIdentity,
        options: ServerLogGenerationOptions,
    ) -> Result<PreparedLogGenerationHandover> {
        self.host.authentication.authenticate(principal, token)?;
        options.validate()?;
        if prepared.identity() != expected {
            return Err(Error::Contract("prepared handover selected intent differs"));
        }
        let host = self.host.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            deployment_fence::seal_prepared_source(
                &host,
                &prepared,
                &Interruption::default(),
                |room, assets| {
                    let original = capture_original(room, assets, &principal)?;
                    let original_selection = original.info().identity;
                    original.prepare_generation_migration(&original_selection, &options)
                },
                |backup, room, assets| backup.check_live_migration_source(room, assets, &principal),
            )?;
            Ok(prepared)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
